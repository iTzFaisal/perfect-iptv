/* ============================================================
   Perfect IPTV — application controller
   ============================================================ */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var $ = IPTV.$;
  var $$ = IPTV.$$;
  var UI = IPTV.UI;
  var Store = IPTV.Store;
  var Screens = IPTV.Screens;
  var Player = IPTV.Player;

  var VERSION = '1.0.6';
  var CONTINUE_CATEGORY = 'continue';
  var RECENT_CATEGORY = 'recent';
  var RECENT_LIMIT = 200;
  var SEARCH_LABELS = { live: 'Live TV', vod: 'Movies', series: 'Series' };
  var TEXT_SIZES = { standard: 1.25, large: 1.5, xlarge: 1.7 };

  function freshLive() {
    return {
      categories: [], categoryId: 'all', items: [], rawItems: [], sort: 'default',
      loadingText: '', loading: false, error: null,
      limit: 120, selectedId: null, epg: null, epgLoading: false,
      loadedCategory: null, token: 0
    };
  }
  function freshVod() {
    return {
      categories: [], categoryId: 'all', items: [], rawItems: [], sort: 'default',
      loadingText: '', loading: false, error: null, limit: 120, loadedCategory: null, token: 0
    };
  }

  var App = {
    version: VERSION,
    api: null,
    account: null,
    view: 'live',
    searchReturnView: 'live',
    state: {
      live: freshLive(),
      vod: freshVod(),
      series: freshVod(),
      favorites: { tab: 'live' },
      search: {
        type: 'live',
        query: '',
        results: [],
        loading: false,
        error: null,
        token: 0
      }
    },
    cache: { epg: {}, vodInfo: {}, seriesInfo: {}, all: null, pending: {} },
    modalContext: null,
    epgToken: 0,
    modalToken: 0,
    exitArmed: false
  };

  window.IPTV.App = App;

  /* ---------------- Small helpers ---------------- */

  function loginVisible() { return !$('#login-screen').classList.contains('hidden'); }
  function shellVisible() { return !$('#shell').classList.contains('hidden'); }

  function selectorFor(el) {
    if (!el) return null;
    if (el.id) return '#' + el.id;
    var action = el.getAttribute('data-action');
    if (!action) return null;
    var sel = '[data-action="' + action + '"]';
    ['data-id', 'data-category', 'data-tab', 'data-setting', 'data-value', 'data-type'].forEach(function (attr) {
      if (el.hasAttribute(attr)) sel += '[' + attr + '="' + el.getAttribute(attr) + '"]';
    });
    return sel;
  }

  function focusInView(selector) {
    if (selector) {
      var target = $('#view').querySelector(selector);
      if (target) { UI.focus(target); return true; }
    }
    return false;
  }

  function focusFirstView() {
    UI.focusFirst($('#view'));
  }

  function bootText(text) {
    var el = $('#boot-text');
    if (el) el.textContent = text;
  }

  function finishBoot() {
    $('#boot-screen').classList.add('hidden');
  }

  function applyTextSize() {
    var size = Store.settings.textSize || 'standard';
    var scale = TEXT_SIZES[size] || TEXT_SIZES.standard;
    document.documentElement.style.setProperty('--text-scale', String(scale));
  }

  function updateClock() {
    var el = $('#clock');
    if (el) el.textContent = IPTV.fmtClock(new Date(), Store.settings.timeFormat);
  }

  function updateConnection() {
    var online = navigator.onLine !== false;
    var wrap = $('.sidebar-status');
    if (wrap) wrap.classList.toggle('offline', !online);
    var label = $('#connection-label');
    if (label) label.textContent = online ? 'Connected' : 'Offline';
  }

  function updateAccountChip() {
    var name = (App.account && App.account.name) || 'My IPTV';
    var server = (App.account && App.account.server) || 'Not connected';
    var nameEl = $('#account-name');
    var serverEl = $('#account-server');
    var avatar = $('#account-avatar');
    if (nameEl) nameEl.textContent = name;
    if (serverEl) serverEl.textContent = server.replace(/^https?:\/\//, '');
    if (avatar) avatar.textContent = IPTV.initials(name);
  }

  var VIEW_META = {
    live: { title: 'Live TV', eyebrow: 'Browse' },
    movies: { title: 'Movies', eyebrow: 'On demand' },
    series: { title: 'Series', eyebrow: 'Binge-worthy' },
    favorites: { title: 'Favorites', eyebrow: 'Your list' },
    search: { title: 'Search', eyebrow: 'Find anything' },
    settings: { title: 'Settings', eyebrow: 'Preferences' }
  };

  function updateChrome() {
    var meta = VIEW_META[App.view] || VIEW_META.live;
    if (App.view === 'search') {
      var searchType = App.state.search.type || 'live';
      var label = SEARCH_LABELS[searchType] || SEARCH_LABELS.live;
      meta = { title: 'Search ' + label, eyebrow: label + ' only' };
    }
    var title = $('#view-title');
    var eyebrow = $('#view-eyebrow');
    if (title) title.textContent = meta.title;
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    var navView = App.view === 'search' ? App.searchReturnView : App.view;
    $$('#nav .nav-item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-view') === navView);
    });
  }

  /* ---------------- Login ---------------- */

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
    bootText('Connecting to your provider…');
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
      updateAccountChip();
      return loadCategories().then(function () {
        finishBoot();
        $('#login-screen').classList.add('hidden');
        $('#shell').classList.remove('hidden');
        setLoginBusy(false);
        updateConnection();
        updateAccountChip();
        UI.toast('Connected to ' + (account.name || account.username));
        return switchView('live');
      });
    }).catch(function (err) {
      setLoginBusy(false);
      var message = IPTV.errorMessage(err);
      if (err && err.code === 'network') {
        message += ' If your provider works in a browser, add a CORS proxy under Advanced options.';
      }
      if (silent) {
        finishBoot();
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

  function loadCategories() {
    var api = App.api;
    if (!api) return Promise.resolve();
    var liveP = api.getLiveCategories();
    var vodP = api.getVodCategories();
    var seriesP = api.getSeriesCategories();
    return Promise.all([
      liveP.catch(function () { return []; }),
      vodP.catch(function () { return []; }),
      seriesP.catch(function () { return []; })
    ]).then(function (results) {
      App.state.live.categories = results[0] || [];
      App.state.vod.categories = results[1] || [];
      App.state.series.categories = results[2] || [];
    });
  }

  function sectionState(type) {
    if (type === 'live') return App.state.live;
    if (type === 'vod' || type === 'movies') return App.state.vod;
    if (type === 'series') return App.state.series;
    return null;
  }

  function applyCatalogSort(state, type) {
    state.items = IPTV.sortCatalog(state.rawItems || [], state.sort, type);
  }

  function recentCatalog(type) {
    return ensureCatalog(type).then(function (list) {
      return IPTV.sortCatalog(list, 'recent', type).slice(0, RECENT_LIMIT);
    });
  }

  /* ---------------- View rendering ---------------- */

  function renderView() {
    if (!App.api || App.view === 'login') return;
    var previous = selectorFor(document.activeElement);
    var view = $('#view');
    if (!view) return;
    var html = '';
    if (App.view === 'live') html = Screens.live(App.state.live, App.api);
    else if (App.view === 'movies') html = Screens.movies(App.state.vod, App.api);
    else if (App.view === 'series') html = Screens.series(App.state.series, App.api);
    else if (App.view === 'favorites') html = Screens.favorites(App.state.favorites, App.api);
    else if (App.view === 'search') html = Screens.search(App.state.search, App.api);
    else if (App.view === 'settings') html = Screens.settings(App.state, App.api, VERSION);
    view.innerHTML = html;
    if (previous) focusInView(previous);
  }

  function switchView(view) {
    if (Player.isOpen()) Player.close();
    if (UI.isModalOpen()) UI.closeModal();
    App.view = view;
    updateChrome();

    if (view === 'live' && App.state.live.loadedCategory !== App.state.live.categoryId && !App.state.live.items.length) {
      App.state.live.loading = true;
    }
    if (view === 'movies' && App.state.vod.loadedCategory !== App.state.vod.categoryId && !App.state.vod.items.length) {
      App.state.vod.loading = true;
    }
    if (view === 'series' && App.state.series.loadedCategory !== App.state.series.categoryId && !App.state.series.items.length) {
      App.state.series.loading = true;
    }

    renderView();

    if (view === 'live') return ensureLive();
    if (view === 'movies') return ensureVod();
    if (view === 'series') return ensureSeries();
    if (view === 'favorites') { focusFavorites(); return Promise.resolve(); }
    if (view === 'search') { setTimeout(function () { UI.focus($('#search-input')); }, 30); return Promise.resolve(); }
    if (view === 'settings') { setTimeout(function () { UI.focusFirst($('#view')); }, 30); return Promise.resolve(); }
    return Promise.resolve();
  }

  function focusLive() {
    var card = $('#view [data-action="channel"]');
    if (card) { UI.focus(card); return; }
    focusFirstView();
  }

  function focusBrowse() {
    var card = $('#view [data-action="vod-detail"], #view [data-action="series-detail"], ' +
      '#view [data-action="resume-vod"], #view [data-action="resume-series"]');
    if (card) { UI.focus(card); return; }
    focusFirstView();
  }

  function focusFavorites() {
    var card = $('#view .channel-card, #view .poster-card');
    if (card) { UI.focus(card); return; }
    var tab = $('#view [data-action="fav-tab"].is-active');
    if (tab) { UI.focus(tab); return; }
    focusFirstView();
  }

  /* ---------------- Live ---------------- */

  function ensureLive() {
    if (!App.api) return Promise.resolve();
    var state = App.state.live;
    if (state.loadedCategory !== state.categoryId) return loadLive(state.categoryId);
    renderView();
    focusLive();
    return Promise.resolve();
  }

  function loadLive(categoryId, force) {
    if (!App.api) return Promise.resolve();
    var state = App.state.live;
    if (categoryId === CONTINUE_CATEGORY) {
      state.categoryId = categoryId;
      state.loadedCategory = categoryId;
      state.loading = false;
      state.error = null;
      state.selectedId = null;
      state.epg = null;
      state.epgLoading = false;
      state.token++;
      renderView();
      focusLive();
      return Promise.resolve();
    }
    if (!force && state.loadedCategory === categoryId) {
      renderView();
      focusLive();
      return Promise.resolve();
    }
    state.categoryId = categoryId;
    state.loading = true;
    state.loadingText = 'Loading channels…';
    state.error = null;
    state.items = [];
    state.rawItems = [];
    state.selectedId = null;
    state.epg = null;
    state.epgLoading = false;
    state.limit = 120;
    state.loadedCategory = null;
    var token = ++state.token;
    renderView();

    return App.api.getLiveStreams(categoryId).then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      applyCatalogSort(state, 'live');
      state.loading = false;
      state.loadedCategory = categoryId;
      renderView();
      focusLive();
    }).catch(function (err) {
      if (token !== state.token) return;
      state.loading = false;
      state.items = [];
      state.rawItems = [];
      state.error = IPTV.errorMessage(err);
      renderView();
      setTimeout(focusFirstView, 20);
    });
  }

  function selectChannel(id) {
    if (App.view !== 'live') return;
    id = String(id);
    var state = App.state.live;
    var changed = String(state.selectedId) !== id;
    state.selectedId = id;
    if (!changed) {
      if (state.epgLoading) return;
      if (Object.prototype.hasOwnProperty.call(App.cache.epg, id)) return;
    }
    var cached = App.cache.epg[id];
    state.epg = cached || null;
    state.epgLoading = cached === undefined;
    renderPreview();
    if (cached !== undefined) return;

    var token = ++App.epgToken;
    App.api.getShortEpg(id).then(function (list) {
      App.cache.epg[id] = list || [];
      if (token !== App.epgToken || String(state.selectedId) !== id) return;
      state.epg = list || [];
      state.epgLoading = false;
      renderPreview();
    }).catch(function () {
      if (token !== App.epgToken || String(state.selectedId) !== id) return;
      state.epg = [];
      state.epgLoading = false;
      renderPreview();
    });
  }

  function renderPreview() {
    var pane = $('#live-preview');
    if (!pane) return;
    var active = document.activeElement;
    var restore = null;
    if (active && pane.contains(active)) restore = selectorFor(active);
    var item = liveItem(App.state.live.selectedId);
    pane.innerHTML = Screens.preview(item, App.state.live, App.api);
    if (restore) {
      var target = pane.querySelector(restore);
      if (target) UI.focus(target);
    }
  }

  var selectChannelDebounced = IPTV.debounce(selectChannel, 160);

  function allCatalog(type) {
    return (App.cache.all && App.cache.all[type]) || [];
  }

  function searchResult(type, id) {
    var state = App.state.search;
    if (!state || state.type !== type) return null;
    id = String(id);
    return (state.results || []).find(function (item) {
      var itemId = type === 'series' ? item.series_id : item.stream_id;
      return String(itemId) === id;
    }) || null;
  }

  function liveItem(id) {
    id = String(id);
    return App.state.live.items.find(function (i) { return String(i.stream_id) === id; }) ||
      searchResult('live', id) ||
      Store.getHistory('live', id) ||
      Store.favorites.live[id] ||
      allCatalog('live').find(function (i) { return String(i.stream_id) === id; }) || null;
  }

  function rememberLive(item) {
    if (!item || item.stream_id == null) return;
    Store.setHistory('live', String(item.stream_id), {
      name: item.name || 'Live TV',
      stream_id: item.stream_id,
      num: item.num,
      stream_icon: item.stream_icon || '',
      category_id: item.category_id,
      epg_channel_id: item.epg_channel_id || '',
      tv_archive: item.tv_archive,
      tv_archive_duration: item.tv_archive_duration
    });
  }

  function epgNowText(epg) {
    var now = Date.now();
    var program = (epg || []).find(function (p) { return p.start <= now && p.end > now; });
    if (!program) return 'Live TV';
    return program.title + '  ·  ' + IPTV.fmtTime(program.start, Store.settings.timeFormat) +
      ' – ' + IPTV.fmtTime(program.end, Store.settings.timeFormat);
  }

  function playLive(id) {
    var item = liveItem(id);
    if (!item) return;
    var key = String(item.stream_id);
    rememberLive(item);
    var cached = App.cache.epg[key];
    var epg = cached || (String(App.state.live.selectedId) === key ? App.state.live.epg : null) || [];

    var format = Store.settings.streamFormat;
    var allowed = (App.account && App.account.userInfo && App.account.userInfo.allowed_output_formats) || [];
    if (Array.isArray(allowed) && allowed.length && allowed.indexOf(format) === -1) {
      if (allowed.indexOf('m3u8') !== -1) format = 'm3u8';
      else if (allowed.indexOf('ts') !== -1) format = 'ts';
    }

    var url = App.api.liveUrl(item, format);
    Player.play({
      type: 'live',
      url: url,
      title: item.name || 'Live TV',
      subtitle: epgNowText(epg),
      kicker: 'LIVE',
      epg: epg,
      onChannelUp: function () { zapChannel(item, -1); },
      onChannelDown: function () { zapChannel(item, 1); },
      onInfo: function () { openEpg(item.stream_id); },
      onClose: function () {
        if (App.view === 'live') renderView();
        focusChannel(item.stream_id);
      }
    });

    // Start playback immediately; enrich the program info when EPG arrives.
    if (cached === undefined) {
      App.api.getShortEpg(item.stream_id).then(function (list) {
        App.cache.epg[key] = list || [];
        var current = Player.current();
        if (current && current.url === url) Player.setEpg(list || []);
      }).catch(function () { /* live playback does not depend on EPG */ });
    }
  }

  function zapChannel(item, delta) {
    var list = App.state.live.items;
    if (!list.length) return;
    var idx = list.findIndex(function (i) { return String(i.stream_id) === String(item.stream_id); });
    if (idx < 0) return;
    var next = list[(idx + delta + list.length) % list.length];
    if (next) playLive(next.stream_id);
  }

  function focusChannel(id) {
    var card = $('#view [data-action="channel"][data-id="' + id + '"]');
    if (card) { UI.focus(card); return; }
    focusFirstView();
  }

  function openEpg(id) {
    var channel = liveItem(id);
    if (!channel) return;
    App.modalContext = null;
    var token = ++App.modalToken;
    var modalRef = UI.modal({
      eyebrow: 'TV Guide',
      title: channel.name || 'Channel',
      wide: true,
      body: '<div class="pane-state"><div class="spinner"></div><p>Loading the guide…</p></div>',
      actions: [{ label: 'Close', value: 'close' }],
      onAction: function (value) { if (value === 'close') UI.closeModal(); }
    });

    var guidePromise = App.api.getFullEpg(channel.stream_id).then(function (list) {
      if (list && list.length) return list;
      return App.api.getShortEpg(channel.stream_id, 24);
    }).catch(function () {
      return App.api.getShortEpg(channel.stream_id, 24);
    });

    guidePromise.then(function (list) {
      if (token !== App.modalToken || !UI.currentModal || UI.currentModal !== modalRef) return;
      var body = $('#modal-root .modal-body');
      if (!body) return;
      body.innerHTML = Screens.epgBody(channel, list || [], App.api);
      var first = body.querySelector('[data-focusable]');
      if (first) UI.focus(first);
      else {
        var close = $('#modal-root .modal-close');
        if (close) UI.focus(close);
      }
    }).catch(function (err) {
      if (token !== App.modalToken || !UI.currentModal || UI.currentModal !== modalRef) return;
      var body = $('#modal-root .modal-body');
      if (!body) return;
      body.innerHTML = '<div class="empty-state">' + IPTV.icon('info') +
        '<h3>Could not load the guide</h3><p>' + IPTV.esc(IPTV.errorMessage(err)) + '</p></div>';
      var close = $('#modal-root .modal-close');
      if (close) UI.focus(close);
    });
  }

  function playCatchup(button) {
    var id = button.getAttribute('data-id');
    var start = Number(button.getAttribute('data-start'));
    var duration = Number(button.getAttribute('data-duration')) || 60;
    var channel = liveItem(id);
    if (!channel) return;
    rememberLive(channel);
    var url = App.api.catchupUrl(id, start, duration);
    UI.closeModal();
    Player.play({
      type: 'catchup',
      url: url,
      title: channel.name || 'Catch-up',
      subtitle: 'Catch-up · ' + new Date(start).toLocaleString(),
      kicker: 'CATCH-UP',
      onClose: function () {
        if (App.view === 'live') renderView();
        focusChannel(id);
      }
    });
  }

  /* ---------------- Movies ---------------- */

  function ensureVod() {
    if (!App.api) return Promise.resolve();
    var state = App.state.vod;
    if (state.loadedCategory !== state.categoryId) return loadVod(state.categoryId);
    renderView();
    focusBrowse();
    return Promise.resolve();
  }

  function loadVod(categoryId, force) {
    if (!App.api) return Promise.resolve();
    var state = App.state.vod;
    if (categoryId === CONTINUE_CATEGORY) {
      state.categoryId = categoryId;
      state.loadedCategory = categoryId;
      state.loading = false;
      state.error = null;
      state.token++;
      renderView();
      focusBrowse();
      return Promise.resolve();
    }
    if (!force && state.loadedCategory === categoryId) {
      renderView();
      focusBrowse();
      return Promise.resolve();
    }
    state.categoryId = categoryId;
    state.loading = true;
    state.loadingText = categoryId === RECENT_CATEGORY
      ? 'Loading recently added movies…' : 'Loading movies…';
    state.error = null;
    state.items = [];
    state.rawItems = [];
    state.limit = 120;
    state.loadedCategory = null;
    var token = ++state.token;
    renderView();

    var loader = categoryId === RECENT_CATEGORY
      ? recentCatalog('vod')
      : App.api.getVodStreams(categoryId);

    return loader.then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      applyCatalogSort(state, 'vod');
      state.loading = false;
      state.loadedCategory = categoryId;
      renderView();
      focusBrowse();
    }).catch(function (err) {
      if (token !== state.token) return;
      state.loading = false;
      state.items = [];
      state.rawItems = [];
      state.error = IPTV.errorMessage(err);
      renderView();
      setTimeout(focusFirstView, 20);
    });
  }

  function vodItem(id) {
    id = String(id);
    return App.state.vod.items.find(function (i) { return String(i.stream_id) === id; }) ||
      searchResult('vod', id) ||
      Store.getHistory('vod', id) ||
      Store.favorites.vod[id] ||
      allCatalog('vod').find(function (i) { return String(i.stream_id) === id; }) || null;
  }

  function openVod(item) {
    if (!item) return;
    var id = String(item.stream_id);
    var cached = App.cache.vodInfo[id];
    var show = function (data) {
      App.cache.vodInfo[id] = data;
      var info = data.info || {};
      var title = info.name || item.name || 'Movie';
      App.modalContext = { type: 'vod', item: item, data: data };
      UI.modal({
        eyebrow: 'Movie',
        title: title,
        wide: true,
        body: Screens.vodDetail(data, item, App.api, Store.isFavorite('vod', id)),
        actions: [{ label: 'Close', value: 'close' }],
        autofocusSelector: '[data-action="play-vod"]',
        onAction: function (value) { if (value === 'close') UI.closeModal(); },
        onClose: function () { App.modalContext = null; }
      });
    };
    if (cached) { show(cached); return; }
    UI.loading(true, 'Loading movie details…');
    App.api.getVodInfo(id).then(function (data) {
      UI.loading(false);
      show(data);
    }).catch(function (err) {
      UI.loading(false);
      UI.toast('Could not load movie details: ' + IPTV.errorMessage(err));
    });
  }

  function playVod(item, data) {
    data = data || {};
    var movie = data.movie_data || {};
    var info = data.info || {};
    var id = String(movie.stream_id || item.stream_id);
    var ext = movie.container_extension || item.container_extension || 'mp4';
    var url = App.api.vodUrl({ stream_id: id, container_extension: ext });
    var title = info.name || item.name || 'Movie';
    var history = Store.getHistory('vod', id);
    var startAt = 0;
    if (history && history.position > 5 && (!history.duration || history.position < history.duration - 10)) {
      startAt = history.position;
    }
    UI.closeModal();
    Player.play({
      type: 'vod',
      url: url,
      title: title,
      subtitle: [info.releasedate || info.releaseDate, info.genre, info.duration].filter(Boolean).join('  ·  '),
      kicker: 'MOVIE',
      startAt: startAt,
      onProgress: function (position, duration) {
        Store.setHistory('vod', id, {
          position: position,
          duration: duration,
          name: title,
          stream_id: id,
          container_extension: ext,
          stream_icon: info.movie_image || item.stream_icon || ''
        });
      },
      onClose: function () {
        renderView();
        focusVod(id);
      }
    });
  }

  function resumeVod(id) {
    var item = vodItem(id);
    if (!item) { UI.toast('Could not find that movie.'); return; }
    playVod(item);
  }

  function focusVod(id) {
    var card = $('#view [data-action="vod-detail"][data-id="' + id + '"], ' +
      '#view [data-action="resume-vod"][data-id="' + id + '"]');
    if (card) { UI.focus(card); return; }
    focusFirstView();
  }

  /* ---------------- Series ---------------- */

  function ensureSeries() {
    if (!App.api) return Promise.resolve();
    var state = App.state.series;
    if (state.loadedCategory !== state.categoryId) return loadSeries(state.categoryId);
    renderView();
    focusBrowse();
    return Promise.resolve();
  }

  function loadSeries(categoryId, force) {
    if (!App.api) return Promise.resolve();
    var state = App.state.series;
    if (categoryId === CONTINUE_CATEGORY) {
      state.categoryId = categoryId;
      state.loadedCategory = categoryId;
      state.loading = false;
      state.error = null;
      state.token++;
      renderView();
      focusBrowse();
      return Promise.resolve();
    }
    if (!force && state.loadedCategory === categoryId) {
      renderView();
      focusBrowse();
      return Promise.resolve();
    }
    state.categoryId = categoryId;
    state.loading = true;
    state.loadingText = categoryId === RECENT_CATEGORY
      ? 'Loading recently added series…' : 'Loading series…';
    state.error = null;
    state.items = [];
    state.rawItems = [];
    state.limit = 120;
    state.loadedCategory = null;
    var token = ++state.token;
    renderView();

    var loader = categoryId === RECENT_CATEGORY
      ? recentCatalog('series')
      : App.api.getSeries(categoryId);

    return loader.then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      applyCatalogSort(state, 'series');
      state.loading = false;
      state.loadedCategory = categoryId;
      renderView();
      focusBrowse();
    }).catch(function (err) {
      if (token !== state.token) return;
      state.loading = false;
      state.items = [];
      state.rawItems = [];
      state.error = IPTV.errorMessage(err);
      renderView();
      setTimeout(focusFirstView, 20);
    });
  }

  function seriesItem(id) {
    id = String(id);
    var item = App.state.series.items.find(function (i) { return String(i.series_id) === id; }) ||
      searchResult('series', id) ||
      Store.favorites.series[id] ||
      allCatalog('series').find(function (i) { return String(i.series_id) === id; });
    if (item) return item;
    var record = Store.latestFor('series', id);
    if (!record) return null;
    return {
      series_id: record.seriesId,
      name: record.seriesName || 'Series',
      cover: record.cover || ''
    };
  }

  function openSeries(item, season, focusEpisodes) {
    if (!item) return;
    var id = String(item.series_id);
    var cached = App.cache.seriesInfo[id];
    var show = function (data) {
      App.cache.seriesInfo[id] = data;
      var previousContext = App.modalContext;
      var chosenSeason = season ||
        (previousContext && previousContext.type === 'series' && previousContext.season) || 1;
      App.modalContext = {
        type: 'series',
        item: item,
        data: data,
        season: String(chosenSeason)
      };
      showSeriesModal(focusEpisodes);
    };
    if (cached) { show(cached); return; }
    UI.loading(true, 'Loading series details…');
    App.api.getSeriesInfo(id).then(function (data) {
      UI.loading(false);
      show(data);
    }).catch(function (err) {
      UI.loading(false);
      UI.toast('Could not load series details: ' + IPTV.errorMessage(err));
    });
  }

  function showSeriesModal(focusEpisodes) {
    var ctx = App.modalContext;
    if (!ctx || ctx.type !== 'series') return;
    var item = ctx.item;
    var data = ctx.data;
    var info = data.info || {};
    var title = info.name || item.name || 'Series';
    var favorite = Store.isFavorite('series', item.series_id);
    var body = Screens.seriesDetail(data, item, App.api, favorite, ctx.season);
    UI.modal({
      eyebrow: 'Series',
      title: title,
      wide: true,
      body: body,
      actions: [{ label: 'Close', value: 'close' }],
      autofocusSelector: focusEpisodes ? '#episode-list [data-focusable]' : '[data-action="season"].is-active',
      onAction: function (value) { if (value === 'close') UI.closeModal(); },
      onClose: function () { App.modalContext = null; }
    });
  }

  function seasonEpisodes(data, season) {
    var list = (data.episodes || {})[String(season)];
    return Array.isArray(list) ? list : [];
  }

  function findNextEpisode(data, season, episodeId) {
    var currentSeason = String(season);
    var list = seasonEpisodes(data, currentSeason);
    var index = list.findIndex(function (ep) { return String(ep.id) === String(episodeId); });
    if (index >= 0 && index < list.length - 1) {
      return { season: currentSeason, episode: list[index + 1] };
    }
    var seasons = Object.keys(data.episodes || {}).sort(function (a, b) { return Number(a) - Number(b); });
    var seasonIndex = seasons.indexOf(currentSeason);
    for (var i = seasonIndex + 1; i < seasons.length; i++) {
      var nextList = seasonEpisodes(data, seasons[i]);
      if (nextList.length) return { season: seasons[i], episode: nextList[0] };
    }
    return null;
  }

  function playSeriesEpisode(item, data, season, episode) {
    if (!episode) return;
    var id = String(episode.id || episode.stream_id);
    var ext = episode.container_extension || 'mp4';
    var url = App.api.seriesUrl({ id: id, container_extension: ext });
    var info = data.info || {};
    var seriesTitle = info.name || item.name || 'Series';
    var epNum = episode.episode_num || episode.episode || '';
    var epTitle = episode.title || ('Episode ' + epNum);
    var history = Store.getHistory('series', item.series_id + ':' + id);
    var startAt = 0;
    if (history && history.position > 5 && (!history.duration || history.position < history.duration - 10)) {
      startAt = history.position;
    }
    var next = findNextEpisode(data, season, id);
    var nextNum = next ? (next.episode.episode_num || next.episode.episode || '') : '';

    Player.play({
      type: 'series',
      url: url,
      title: seriesTitle,
      subtitle: 'S' + season + ' E' + epNum + '  ·  ' + epTitle,
      kicker: 'EPISODE',
      startAt: startAt,
      next: next ? function () {
        playSeriesEpisode(item, data, next.season, next.episode);
      } : null,
      nextTitle: next ? ('S' + next.season + ' E' + nextNum + '  ·  ' +
        (next.episode.title || 'Next episode')) : '',
      onProgress: function (position, duration) {
        Store.setHistory('series', item.series_id + ':' + id, {
          position: position,
          duration: duration,
          seriesId: item.series_id,
          seriesName: seriesTitle,
          episodeId: id,
          season: season,
          episode: epNum,
          title: epTitle,
          container_extension: ext,
          cover: info.cover || item.cover || ''
        });
      },
      onClose: function () {
        renderView();
        focusSeries(item.series_id);
      }
    });
  }

  function resumeSeries(id) {
    id = String(id);
    var record = Store.latestFor('series', id);
    var item = seriesItem(id);
    if (!item) { UI.toast('Could not find that series.'); return; }
    if (!record || !record.episodeId) {
      openSeries(item, record && record.season, true);
      return;
    }
    var season = String(record.season || '1');
    var episodeId = String(record.episodeId);
    var start = function (data) {
      var list = seasonEpisodes(data, season);
      var episode = list.find(function (ep) {
        return String(ep.id || ep.stream_id) === episodeId;
      });
      if (episode) playSeriesEpisode(item, data, season, episode);
      else openSeries(item, season, true);
    };
    var cached = App.cache.seriesInfo[id];
    if (cached) { start(cached); return; }
    UI.loading(true, 'Loading episode…');
    App.api.getSeriesInfo(id).then(function (data) {
      UI.loading(false);
      App.cache.seriesInfo[id] = data;
      start(data);
    }).catch(function (err) {
      UI.loading(false);
      UI.toast('Could not load that episode: ' + IPTV.errorMessage(err));
      openSeries(item, season, true);
    });
  }

  function focusSeries(id) {
    var card = $('#view [data-action="series-detail"][data-id="' + id + '"], ' +
      '#view [data-action="resume-series"][data-id="' + id + '"]');
    if (card) { UI.focus(card); return; }
    focusFirstView();
  }

  /* ---------------- Favorites ---------------- */

  function getItem(type, id) {
    id = String(id);
    if (type === 'live') return liveItem(id);
    if (type === 'vod') return vodItem(id);
    if (type === 'series') return seriesItem(id);
    return null;
  }

  function toggleFav(type, id) {
    var item = getItem(type, id);
    if (!item) { UI.toast('Could not find that item.'); return; }
    var added = Store.toggleFavorite(type, item);
    UI.toast(added ? 'Added to favorites' : 'Removed from favorites');

    if (UI.isModalOpen()) {
      $$('#modal-root [data-action="toggle-fav"]').forEach(function (btn) {
        if (btn.getAttribute('data-type') !== type || btn.getAttribute('data-id') !== String(id)) return;
        btn.innerHTML = IPTV.icon(added ? 'heart-fill' : 'heart') +
          (added ? 'Remove favorite' : 'Add to favorites');
      });
      return;
    }

    if (App.view === 'live') {
      renderView();
      renderPreview();
      return;
    }
    if (App.view === 'favorites' || App.view === 'movies' || App.view === 'series') {
      renderView();
      if (App.view === 'favorites') focusFavorites();
      return;
    }
  }

  /* ---------------- Search ---------------- */

  var searchTimer = null;

  function searchViewFor(type) {
    if (type === 'vod') return 'movies';
    if (type === 'series') return 'series';
    return 'live';
  }

  function openSearch(type) {
    type = SEARCH_LABELS[type] ? type : 'live';
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    var state = App.state.search;
    state.type = type;
    state.query = '';
    state.results = [];
    state.loading = false;
    state.error = null;
    state.token++;
    App.searchReturnView = searchViewFor(type);
    switchView('search');
  }

  function ensureCatalog(type) {
    if (!App.cache.all) App.cache.all = { live: null, vod: null, series: null };
    if (App.cache.all[type]) return Promise.resolve(App.cache.all[type]);
    if (!App.cache.pending) App.cache.pending = {};
    if (App.cache.pending[type]) return App.cache.pending[type];
    if (!App.api) return Promise.resolve([]);
    var loader;
    if (type === 'live') loader = App.api.getAllLiveStreams();
    else if (type === 'vod') loader = App.api.getAllVodStreams();
    else loader = App.api.getAllSeries();
    var request = loader.then(function (list) {
      if (App.cache.pending && App.cache.pending[type] === request) delete App.cache.pending[type];
      if (!App.cache.all) App.cache.all = { live: null, vod: null, series: null };
      App.cache.all[type] = Array.isArray(list) ? list : [];
      return App.cache.all[type];
    }).catch(function (err) {
      if (App.cache.pending && App.cache.pending[type] === request) delete App.cache.pending[type];
      throw err;
    });
    App.cache.pending[type] = request;
    return request;
  }

  function filterList(list, query, limit) {
    var q = query.toLowerCase();
    return (list || []).filter(function (item) {
      return String(item.name || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, limit || 120);
  }

  function renderSearchResults() {
    if (App.view !== 'search') return;
    var body = $('#search-body');
    if (!body) return;
    body.innerHTML = Screens.searchResults(App.state.search, App.api);
  }

  function doSearch(immediate) {
    var input = $('#search-input');
    var state = App.state.search;
    var query = (input ? input.value : state.query || '').trim();
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    state.query = query;
    state.error = null;

    if (!query) {
      state.token++;
      state.loading = false;
      state.results = [];
      renderSearchResults();
      return;
    }

    var token = ++state.token;
    var type = state.type || 'live';
    searchTimer = setTimeout(function () {
      searchTimer = null;
      if (token !== state.token || App.view !== 'search') return;

      // Once the catalog is cached, filtering is instant and needs no
      // loading flash between keystrokes.
      var cached = App.cache.all && App.cache.all[type];
      if (cached) {
        state.results = filterList(cached, query, 120);
        state.loading = false;
        renderSearchResults();
        return;
      }

      state.loading = true;
      state.results = [];
      renderSearchResults();

      ensureCatalog(type).then(function (list) {
        if (token !== state.token || App.view !== 'search') return;
        state.results = filterList(list, query, 120);
        state.loading = false;
        renderSearchResults();
      }).catch(function (err) {
        if (token !== state.token || App.view !== 'search') return;
        state.loading = false;
        state.error = 'Could not search ' + (SEARCH_LABELS[type] || 'your catalog') + '. ' + IPTV.errorMessage(err);
        renderSearchResults();
      });
    }, immediate ? 0 : 220);
  }

  /* ---------------- Sorting ---------------- */

  function focusSort(type) {
    var btn = $('#view [data-action="sort"][data-type="' + type + '"]');
    if (btn) UI.focus(btn);
  }

  function setSort(type, sort) {
    var state = sectionState(type);
    var valid = IPTV.SORT_OPTIONS.some(function (entry) { return entry.value === sort; });
    if (!state || !valid) return;
    if (state.sort === sort) { focusSort(type); return; }
    var catalogType = type === 'movies' ? 'vod' : type;
    state.sort = sort;
    state.limit = 120;
    applyCatalogSort(state, catalogType);
    renderView();
    focusSort(type);
  }

  function openSort(type) {
    var state = sectionState(type);
    if (!state) return;
    var title = type === 'live' ? 'Live TV' : (type === 'vod' ? 'Movies' : 'Series');
    var current = state.sort || 'default';
    UI.modal({
      eyebrow: 'Sort',
      title: 'Sort ' + title,
      body: Screens.sortMenu(current),
      actions: [{ label: 'Close', value: 'close' }],
      autofocusSelector: '[data-modal-action="sort:' + current + '"]',
      onAction: function (value) {
        if (value === 'close') { UI.closeModal(); return; }
        var match = /^sort:([a-z-]+)$/.exec(String(value || ''));
        if (!match) return;
        UI.closeModal();
        setSort(type, match[1]);
      }
    });
  }

  /* ---------------- Settings actions ---------------- */

  function setSetting(setting, value) {
    if (!(setting in Store.settings)) return;
    Store.settings[setting] = value;
    Store.saveSettings();
    if (setting === 'textSize') applyTextSize();
    renderView();
    var target = $('#view [data-action="setting"][data-setting="' + setting + '"][data-value="' + value + '"]');
    if (target) UI.focus(target);
    if (setting === 'timeFormat') {
      updateClock();
      if (App.view === 'live') renderPreview();
    }
  }

  function refreshAll() {
    UI.confirm('Refresh catalog', 'Reload all categories and content from your provider?', 'Refresh').then(function (yes) {
      if (!yes || !App.api) return;
      UI.loading(true, 'Refreshing your catalog…');
      App.api.clearCache();
      App.cache = { epg: {}, vodInfo: {}, seriesInfo: {}, all: null, pending: {} };
      App.modalContext = null;
      App.state.live = freshLive();
      App.state.vod = freshVod();
      App.state.series = freshVod();
      var current = App.view === 'settings' ? 'live' : App.view;
      loadCategories().then(function () {
        UI.loading(false);
        UI.toast('Catalog refreshed');
        return switchView(current);
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
      App.state.live = freshLive();
      App.state.vod = freshVod();
      App.state.series = freshVod();
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

  function back() {
    if (UI.isModalOpen()) { UI.closeModal(); return; }
    if (Player.isOpen()) { Player.close(); return; }
    if (loginVisible()) {
      if (App.api) {
        $('#login-screen').classList.add('hidden');
        $('#shell').classList.remove('hidden');
        switchView('settings');
        return;
      }
      if (App.exitArmed) { App.exitArmed = false; exitApp(); return; }
      App.exitArmed = true;
      UI.toast('Press Back again to exit');
      setTimeout(function () { App.exitArmed = false; }, 2600);
      return;
    }
    if (App.view === 'search') { switchView(App.searchReturnView || 'live'); return; }
    if (App.view !== 'live') { switchView('live'); return; }
    if (App.exitArmed) { App.exitArmed = false; exitApp(); return; }
    App.exitArmed = true;
    UI.toast('Press Back again to exit');
    setTimeout(function () { App.exitArmed = false; }, 2600);
  }

  function exitApp() {
    try {
      if (window.tizen && tizen.application) {
        tizen.application.getCurrentApplication().exit();
        return;
      }
    } catch (err) { /* ignore */ }
    try { window.close(); } catch (err) { /* ignore */ }
  }

  /* ---------------- Event bindings ---------------- */

  function bindEvents() {
    $('#nav').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-view]');
      if (btn) switchView(btn.getAttribute('data-view'));
    });

    $('#login-form').addEventListener('submit', handleLoginSubmit);

    var passwordInput = $('#login-password');
    var passwordToggle = $('#login-password-toggle');
    if (passwordInput && passwordToggle) {
      passwordToggle.addEventListener('click', function () {
        setPasswordVisible(passwordInput.type === 'password');
      });
      // On a TV remote, Right at the end of the password reaches the eye button.
      passwordInput.addEventListener('keydown', function (e) {
        var atEnd = passwordInput.selectionStart === passwordInput.value.length &&
          passwordInput.selectionEnd === passwordInput.value.length;
        if (atEnd && (e.key === 'ArrowRight' || e.keyCode === 39)) {
          e.preventDefault();
          UI.focus(passwordToggle);
        }
      });
      passwordToggle.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.keyCode === 37) {
          e.preventDefault();
          UI.focus(passwordInput);
          var end = passwordInput.value.length;
          try { passwordInput.setSelectionRange(end, end); } catch (err) { /* ignore */ }
        }
      });
    }

    $('#saved-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-delete-account]');
      if (del) {
        e.stopPropagation();
        deleteAccount(del.getAttribute('data-delete-account'));
        return;
      }
      var item = e.target.closest('[data-account-id]');
      if (item) connectSaved(item.getAttribute('data-account-id'));
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('#modal-root')) return;
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');

      if (action === 'section-search') { openSearch(actionEl.getAttribute('data-type')); return; }
      if (action === 'sort') { openSort(actionEl.getAttribute('data-type')); return; }
      if (action === 'account-menu') { switchView('settings'); return; }

      if (action === 'category') {
        var category = actionEl.getAttribute('data-category');
        if (App.view === 'live') {
          App.state.live.categoryId = category;
          App.state.live.loadedCategory = null;
          App.state.live.selectedId = null;
          loadLive(category);
        } else if (App.view === 'movies') {
          App.state.vod.categoryId = category;
          App.state.vod.loadedCategory = null;
          loadVod(category);
        } else if (App.view === 'series') {
          App.state.series.categoryId = category;
          App.state.series.loadedCategory = null;
          loadSeries(category);
        }
        return;
      }

      if (action === 'channel' || action === 'play-live') {
        playLive(actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'open-epg') { openEpg(actionEl.getAttribute('data-id')); return; }
      if (action === 'toggle-fav') {
        toggleFav(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'vod-detail') {
        openVod(vodItem(actionEl.getAttribute('data-id')));
        return;
      }
      if (action === 'series-detail') {
        openSeries(seriesItem(actionEl.getAttribute('data-id')));
        return;
      }
      if (action === 'resume-vod') {
        resumeVod(actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'resume-series') {
        resumeSeries(actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'fav-tab') {
        App.state.favorites.tab = actionEl.getAttribute('data-tab');
        renderView();
        focusFavorites();
        return;
      }
      if (action === 'load-more') {
        var state = App.view === 'live' ? App.state.live : (App.view === 'movies' ? App.state.vod : (App.view === 'series' ? App.state.series : null));
        if (!state) return;
        var oldLimit = state.limit || 120;
        state.limit = oldLimit + 120;
        renderView();
        var next = $('#view [data-index="' + oldLimit + '"]');
        if (next) UI.focus(next);
        return;
      }
      if (action === 'retry') {
        if (App.view === 'live') loadLive(App.state.live.categoryId, true);
        else if (App.view === 'movies') loadVod(App.state.vod.categoryId, true);
        else if (App.view === 'series') loadSeries(App.state.series.categoryId, true);
        else if (App.view === 'search') doSearch(true);
        return;
      }
      if (action === 'setting') {
        setSetting(actionEl.getAttribute('data-setting'), actionEl.getAttribute('data-value'));
        return;
      }
      if (action === 'refresh-all') { refreshAll(); return; }
      if (action === 'clear-history') { clearHistory(); return; }
      if (action === 'switch-account') { showLogin(); return; }
      if (action === 'add-account') { showLogin({ clear: true }); return; }
      if (action === 'logout') { logout(); return; }
    });

    // Actions inside modals: seasons, episodes, play, favorite, catch-up.
    $('#modal-root').addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');
      if (action === 'play-vod') {
        var ctx = App.modalContext;
        if (ctx && ctx.type === 'vod') playVod(ctx.item, ctx.data);
        return;
      }
      if (action === 'toggle-fav') {
        toggleFav(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'season') {
        if (!App.modalContext || App.modalContext.type !== 'series') return;
        App.modalContext.season = actionEl.getAttribute('data-season');
        showSeriesModal(true);
        return;
      }
      if (action === 'play-episode') {
        if (!App.modalContext || App.modalContext.type !== 'series') return;
        var ctx2 = App.modalContext;
        var season = actionEl.getAttribute('data-season');
        var epId = actionEl.getAttribute('data-id');
        var list = seasonEpisodes(ctx2.data, season);
        var episode = list.find(function (ep) { return String(ep.id) === String(epId); });
        if (!episode) return;
        UI.closeModal();
        playSeriesEpisode(ctx2.item, ctx2.data, season, episode);
        return;
      }
      if (action === 'catchup') {
        playCatchup(actionEl);
        return;
      }
    });

    document.addEventListener('focusin', function (e) {
      var card = e.target.closest('[data-action="channel"]');
      if (!card || App.view !== 'live') return;
      selectChannelDebounced(card.getAttribute('data-id'));
    });

    $('#view').addEventListener('input', function (e) {
      if (e.target && e.target.id === 'search-input' && App.view === 'search') doSearch();
    });

    $('#view').addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'search-input') {
        // Back leaves search directly instead of only blurring the field.
        var isBack = e.keyCode === 10009 || e.key === 'Escape' ||
          e.key === 'GoBack' || e.key === 'BrowserBack';
        if (isBack) {
          e.preventDefault();
          e.stopPropagation();
          switchView(App.searchReturnView || 'live');
          return;
        }
        // Empty + Enter should let the TV open its on-screen keyboard.
        if ((e.keyCode === 13 || e.key === 'Enter') && e.target.value && e.target.value.trim()) {
          e.preventDefault();
          doSearch(true);
        }
      }
    });

    // Player keys must win over spatial navigation.
    document.addEventListener('keydown', function (e) {
      if (Player.isOpen() && !UI.isModalOpen()) {
        if (Player.handleKey(e)) { e.stopPropagation(); }
        return;
      }
      if (!Player.isOpen() && !UI.isModalOpen() && e.keyCode === 457 && App.view === 'live') {
        var selected = App.state.live.selectedId;
        if (selected) { e.preventDefault(); openEpg(selected); }
      }
    }, true);

    window.addEventListener('online', function () { updateConnection(); UI.toast('Back online'); });
    window.addEventListener('offline', function () { updateConnection(); UI.toast('Network connection lost'); });
    window.addEventListener('beforeunload', function () { if (Player.isOpen()) Player.close(); });
  }

  /* ---------------- Boot ---------------- */

  function boot() {
    Store.load();
    applyTextSize();
    UI.init();
    Player.init();
    UI.onBack = back;
    bindEvents();
    updateClock();
    setInterval(updateClock, 15000);
    updateConnection();
    updateAccountChip();

    var account = Store.activeAccount();
    if (!account) {
      finishBoot();
      showLogin();
      bootText('Welcome');
      return;
    }
    bootText('Reconnecting to ' + (account.name || account.username) + '…');
    connect({
      name: account.name,
      server: account.server,
      username: account.username,
      password: account.password,
      proxy: account.proxy
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
