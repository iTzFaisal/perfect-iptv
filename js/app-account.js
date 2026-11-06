/* @requires: IPTV.$, IPTV.UI, IPTV.Player, IPTV.Store, IPTV.Xtream
   @exports: IPTV.App.auth */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var App = IPTV.App = IPTV.App || {};
  var $ = IPTV.$;
  var UI = IPTV.UI;
  var Player = IPTV.Player;
  var Store = IPTV.Store;

  function showLogin(options) {
    options = options || {};
    if (Player.isOpen()) Player.close();
    UI.closeModal();
    $('#shell').classList.add('hidden');
    $('#login-screen').classList.remove('hidden');
    App.view = 'login';
    renderSavedAccounts();
    fillLoginForm(options.account, options.clear);
    setPasswordVisible(false);
    if (options.error) showLoginError(options.error);
    else hideLoginError();
    setTimeout(function () {
      if (!options.clear && Store.accounts.length) {
        var first = $('#saved-list [data-account-id]');
        if (first) { UI.focus(first); return; }
      }
      var server = $('#login-server');
      if (server) UI.focus(server);
    }, 80);
  }

  function fillLoginForm(account, clear) {
    var source = account || (!clear ? Store.activeAccount() : null);
    $('#login-name').value = source ? (source.name || '') : '';
    $('#login-server').value = source ? (source.server || '') : '';
    $('#login-username').value = source ? (source.username || '') : '';
    $('#login-password').value = source ? (source.password || '') : '';
    $('#login-proxy').value = source ? (source.proxy || '') : '';
  }

  function setPasswordVisible(visible) {
    var input = $('#login-password');
    var btn = $('#login-password-toggle');
    if (!input || !btn) return;
    input.type = visible ? 'text' : 'password';
    btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    btn.setAttribute('title', visible ? 'Hide password' : 'Show password');
    var use = btn.querySelector('use');
    if (use) use.setAttribute('href', visible ? '#i-eye-off' : '#i-eye');
  }

  function showLoginError(message) {
    var el = $('#login-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideLoginError() {
    var el = $('#login-error');
    if (el) el.classList.add('hidden');
  }

  function setLoginBusy(busy) {
    var btn = $('#login-submit');
    if (!btn) return;
    btn.disabled = !!busy;
    var label = btn.querySelector('.btn-label');
    var spinner = btn.querySelector('.btn-spinner');
    if (label) label.textContent = busy ? 'Connecting…' : 'Connect';
    if (spinner) spinner.classList.toggle('hidden', !busy);
  }

  function renderSavedAccounts() {
    var wrap = $('#saved-accounts');
    var list = $('#saved-list');
    if (!wrap || !list) return;
    if (!Store.accounts.length) {
      wrap.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    list.innerHTML = Store.accounts.map(function (account) {
      return '<div class="saved-item" data-account-id="' + IPTV.esc(account.id) + '" tabindex="0" data-focusable>' +
        '<span class="avatar">' + IPTV.esc(IPTV.initials(account.name || account.username)) + '</span>' +
        '<span class="saved-meta"><strong>' + IPTV.esc(account.name || account.username) + '</strong>' +
        '<small>' + IPTV.esc(account.server) + ' · ' + IPTV.esc(account.username) + '</small></span>' +
        '<button class="saved-del" data-delete-account="' + IPTV.esc(account.id) + '" data-focusable aria-label="Delete account">' +
          IPTV.icon('trash') + '</button>' +
      '</div>';
    }).join('');
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    hideLoginError();
    var serverRaw = $('#login-server').value.trim();
    var username = $('#login-username').value.trim();
    var password = $('#login-password').value;
    var name = $('#login-name').value.trim();
    var proxy = $('#login-proxy').value.trim();

    if (!serverRaw) { showLoginError('Please enter your provider server URL.'); UI.focus($('#login-server')); return; }

    // Support pasting a full M3U/get.php URL that already contains credentials.
    var parsed = IPTV.parseProviderInput(serverRaw);
    if (!username && parsed.username) username = parsed.username;
    if (!password && parsed.password) password = parsed.password;
    if (parsed.username) $('#login-username').value = username;
    if (parsed.password) $('#login-password').value = password;
    serverRaw = parsed.server || serverRaw;

    if (!username) { showLoginError('Please enter your username.'); UI.focus($('#login-username')); return; }
    if (!password) { showLoginError('Please enter your password.'); UI.focus($('#login-password')); return; }

    connect({ name: name, server: serverRaw, username: username, password: password, proxy: proxy }, false);
  }

  function connect(data, silent) {
    hideLoginError();
    var server;
    try {
      server = IPTV.normalizeServer(data.server);
    } catch (err) {
      if (silent) showLogin({ error: err.message });
      else { showLoginError(err.message); setLoginBusy(false); }
      return Promise.resolve(false);
    }

    setLoginBusy(true);
    App.bootText('Connecting to your provider…');
    var api = new IPTV.Xtream({
      server: server,
      username: data.username,
      password: data.password,
      proxy: data.proxy || ''
    });

    return api.authenticate().then(function (auth) {
      var account = Store.addAccount({
        name: data.name || ('My IPTV'),
        server: server,
        username: data.username,
        password: data.password,
        proxy: data.proxy || '',
        userInfo: auth.userInfo,
        serverInfo: auth.serverInfo,
        lastConnected: Date.now()
      });
      App.account = account;
      App.api = new IPTV.Xtream(account);
      App.updateAccountChip();
      return App.loadCategories().then(function () {
        App.finishBoot();
        $('#login-screen').classList.add('hidden');
        $('#shell').classList.remove('hidden');
        setLoginBusy(false);
        App.updateConnection();
        App.updateAccountChip();
        UI.toast('Connected to ' + (account.name || account.username));
        return App.switchView('live');
      });
    }).catch(function (err) {
      setLoginBusy(false);
      var message = IPTV.errorMessage(err);
      if (err && err.code === 'network') {
        message += ' If your provider works in a browser, add a CORS proxy under Advanced options.';
      }
      if (silent) {
        App.finishBoot();
        showLogin({ error: 'Could not reconnect: ' + message, account: App.account });
      } else {
        showLoginError(message);
        var pass = $('#login-password');
        if (pass) UI.focus(pass);
      }
      return false;
    });
  }

  function connectSaved(id) {
    var account = Store.accounts.find(function (a) { return a.id === id; });
    if (!account) return;
    connect({
      name: account.name,
      server: account.server,
      username: account.username,
      password: account.password,
      proxy: account.proxy
    }, false);
  }

  function setSetting(setting, value) {
    if (!(setting in Store.settings)) return;
    Store.settings[setting] = value;
    Store.saveSettings();
    if (setting === 'textSize') App.applyTextSize();
    App.renderView();
    var target = $('#view [data-action="setting"][data-setting="' + setting + '"][data-value="' + value + '"]');
    if (target) UI.focus(target);
    if (setting === 'timeFormat') {
      App.updateClock();
      if (App.view === 'live') App.live.preview();
    }
  }

  function refreshAll() {
    UI.confirm('Refresh catalog', 'Reload all categories and content from your provider?', 'Refresh').then(function (yes) {
      if (!yes || !App.api) return;
      UI.loading(true, 'Refreshing your catalog…');
      App.api.clearCache();
      App.cache = { epg: {}, vodInfo: {}, seriesInfo: {}, all: null, pending: {} };
      App.modalContext = null;
      App.state.live = App.util.freshLive();
      App.state.vod = App.util.freshVod();
      App.state.series = App.util.freshVod();
      var current = App.view === 'settings' ? 'live' : App.view;
      App.loadCategories().then(function () {
        UI.loading(false);
        UI.toast('Catalog refreshed');
        return App.switchView(current);
      }).catch(function (err) {
        UI.loading(false);
        UI.toast('Refresh failed: ' + IPTV.errorMessage(err));
      });
    });
  }

  function clearHistory() {
    UI.confirm('Clear watch history', 'Remove all continue-watching history and saved playback positions? Favorites are kept.', 'Clear', true).then(function (yes) {
      if (!yes) return;
      Store.clearHistory();
      UI.toast('Watch history cleared');
    });
  }

  function logout() {
    UI.confirm('Sign out', 'Disconnect this account from the TV? Your saved login stays on this TV.', 'Sign out', true).then(function (yes) {
      if (!yes) return;
      Player.close();
      UI.closeModal();
      Store.activeId = null;
      Store.saveActive();
      App.api = null;
      App.account = null;
      App.state.live = App.util.freshLive();
      App.state.vod = App.util.freshVod();
      App.state.series = App.util.freshVod();
      App.cache = { epg: {}, vodInfo: {}, seriesInfo: {}, all: null, pending: {} };
      showLogin({ clear: true });
    });
  }

  function deleteAccount(id) {
    var account = Store.accounts.find(function (a) { return a.id === id; });
    if (!account) return;
    UI.confirm('Delete account', 'Remove “' + (account.name || account.username) + '” from this TV?', 'Delete', true).then(function (yes) {
      if (!yes) return;
      Store.removeAccount(id);
      if (App.account && App.account.id === id) {
        App.account = null;
        App.api = null;
      }
      renderSavedAccounts();
      fillLoginForm(Store.activeAccount(), !Store.activeAccount());
      UI.toast('Account removed');
    });
  }

  App.auth = {
    show: showLogin,
    submit: handleLoginSubmit,
    connect: connect,
    connectSaved: connectSaved,
    togglePassword: setPasswordVisible,
    setSetting: setSetting,
    refreshAll: refreshAll,
    clearHistory: clearHistory,
    logout: logout,
    deleteAccount: deleteAccount
  };
})();
