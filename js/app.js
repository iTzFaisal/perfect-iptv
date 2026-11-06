/* ============================================================
   Perfect IPTV — application controller: boot, routing, shared state
   ============================================================ */
/* @requires: IPTV.$, IPTV.UI, IPTV.Player, IPTV.Screens, IPTV.Store,
               IPTV.Xtream, IPTV.App.live, IPTV.App.vod, IPTV.App.series,
               IPTV.App.catalog, IPTV.App.auth
   @exports: IPTV.App */
(function () {
  'use strict';

  var IPTV = window.IPTV;

  ['$', 'Store', 'Xtream', 'UI', 'Screens', 'Player'].forEach(function (key) {
    if (!IPTV[key]) throw new Error('Missing IPTV.' + key + ' — check script order in index.html');
  });

  var $ = IPTV.$;
  var $$ = IPTV.$$;
  var UI = IPTV.UI;
  var Store = IPTV.Store;
  var Screens = IPTV.Screens;
  var Player = IPTV.Player;

  var VERSION = '0.1.2';
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

  var App = window.IPTV.App = window.IPTV.App || {};
  ['live', 'vod', 'series', 'catalog', 'auth'].forEach(function (key) {
    if (!App[key]) throw new Error('Missing IPTV.App.' + key + ' — check script order in index.html');
  });

  App.version = VERSION;
  App.api = null;
  App.account = null;
  App.view = 'live';
  App.searchReturnView = 'live';
  App.state = {
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
  };
  App.cache = { epg: {}, vodInfo: {}, seriesInfo: {}, all: null, pending: {} };
  App.modalContext = null;
  App.epgToken = 0;
  App.modalToken = 0;
  App.exitArmed = false;

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

  function bootText(value) {
    var el = $('#boot-text');
    if (el) el.textContent = value;
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

    if (view === 'live') return App.live.ensure();
    if (view === 'movies') return App.vod.ensure();
    if (view === 'series') return App.series.ensure();
    if (view === 'favorites') { focusFavorites(); return Promise.resolve(); }
    if (view === 'search') { setTimeout(function () { UI.focus($('#search-input')); }, 30); return Promise.resolve(); }
    if (view === 'settings') { setTimeout(function () { UI.focusFirst($('#view')); }, 30); return Promise.resolve(); }
    return Promise.resolve();
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

  /* ---------------- Favorites ---------------- */

  function getItem(type, id) {
    id = String(id);
    if (type === 'live') return App.live.item(id);
    if (type === 'vod') return App.vod.item(id);
    if (type === 'series') return App.series.item(id);
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
      App.live.preview();
      return;
    }
    if (App.view === 'favorites' || App.view === 'movies' || App.view === 'series') {
      renderView();
      if (App.view === 'favorites') focusFavorites();
    }
  }

  /* ---------------- Back and event bindings ---------------- */

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

  function bindEvents() {
    $('#nav').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-view]');
      if (btn) switchView(btn.getAttribute('data-view'));
    });

    $('#login-form').addEventListener('submit', App.auth.submit);

    var passwordInput = $('#login-password');
    var passwordToggle = $('#login-password-toggle');
    if (passwordInput && passwordToggle) {
      passwordToggle.addEventListener('click', function () {
        App.auth.togglePassword(passwordInput.type === 'password');
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
        App.auth.deleteAccount(del.getAttribute('data-delete-account'));
        return;
      }
      var item = e.target.closest('[data-account-id]');
      if (item) App.auth.connectSaved(item.getAttribute('data-account-id'));
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('#modal-root')) return;
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');

      if (action === 'section-search') { App.catalog.openSearch(actionEl.getAttribute('data-type')); return; }
      if (action === 'sort') { App.catalog.openSort(actionEl.getAttribute('data-type')); return; }
      if (action === 'account-menu') { switchView('settings'); return; }

      if (action === 'category') {
        var category = actionEl.getAttribute('data-category');
        if (App.view === 'live') {
          App.state.live.categoryId = category;
          App.state.live.loadedCategory = null;
          App.state.live.selectedId = null;
          App.live.load(category);
        } else if (App.view === 'movies') {
          App.state.vod.categoryId = category;
          App.state.vod.loadedCategory = null;
          App.vod.load(category);
        } else if (App.view === 'series') {
          App.state.series.categoryId = category;
          App.state.series.loadedCategory = null;
          App.series.load(category);
        }
        return;
      }

      if (action === 'channel' || action === 'play-live') {
        App.live.play(actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'open-epg') { App.live.openEpg(actionEl.getAttribute('data-id')); return; }
      if (action === 'toggle-fav') {
        toggleFav(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'vod-detail') {
        App.vod.open(App.vod.item(actionEl.getAttribute('data-id')));
        return;
      }
      if (action === 'series-detail') {
        App.series.open(App.series.item(actionEl.getAttribute('data-id')));
        return;
      }
      if (action === 'resume-vod') {
        App.vod.resume(actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'resume-series') {
        App.series.resume(actionEl.getAttribute('data-id'));
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
        if (App.view === 'live') App.live.load(App.state.live.categoryId, true);
        else if (App.view === 'movies') App.vod.load(App.state.vod.categoryId, true);
        else if (App.view === 'series') App.series.load(App.state.series.categoryId, true);
        else if (App.view === 'search') App.catalog.doSearch(true);
        return;
      }
      if (action === 'setting') {
        App.auth.setSetting(actionEl.getAttribute('data-setting'), actionEl.getAttribute('data-value'));
        return;
      }
      if (action === 'refresh-all') { App.auth.refreshAll(); return; }
      if (action === 'clear-history') { App.auth.clearHistory(); return; }
      if (action === 'switch-account') { App.auth.show(); return; }
      if (action === 'add-account') { App.auth.show({ clear: true }); return; }
      if (action === 'logout') { App.auth.logout(); return; }
    });

    // Actions inside modals: seasons, episodes, play, favorite, catch-up.
    $('#modal-root').addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');
      if (action === 'play-vod') {
        var ctx = App.modalContext;
        if (ctx && ctx.type === 'vod') App.vod.play(ctx.item, ctx.data);
        return;
      }
      if (action === 'toggle-fav') {
        toggleFav(actionEl.getAttribute('data-type'), actionEl.getAttribute('data-id'));
        return;
      }
      if (action === 'season') {
        if (!App.modalContext || App.modalContext.type !== 'series') return;
        App.modalContext.season = actionEl.getAttribute('data-season');
        App.series.showModal(true);
        return;
      }
      if (action === 'play-episode') {
        if (!App.modalContext || App.modalContext.type !== 'series') return;
        var seriesCtx = App.modalContext;
        var season = actionEl.getAttribute('data-season');
        var epId = actionEl.getAttribute('data-id');
        var list = App.series.episodes(seriesCtx.data, season);
        var episode = list.find(function (ep) { return String(ep.id) === String(epId); });
        if (!episode) return;
        UI.closeModal();
        App.series.playEpisode(seriesCtx.item, seriesCtx.data, season, episode);
        return;
      }
      if (action === 'catchup') {
        App.live.playCatchup(actionEl);
        return;
      }
    });

    document.addEventListener('focusin', function (e) {
      var card = e.target.closest('[data-action="channel"]');
      if (!card || App.view !== 'live') return;
      App.live.select(card.getAttribute('data-id'));
    });

    $('#view').addEventListener('input', function (e) {
      if (e.target && e.target.id === 'search-input' && App.view === 'search') App.catalog.doSearch();
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
          App.catalog.doSearch(true);
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
        if (selected) { e.preventDefault(); App.live.openEpg(selected); }
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
      App.auth.show();
      bootText('Welcome');
      return;
    }
    bootText('Reconnecting to ' + (account.name || account.username) + '…');
    App.auth.connect({
      name: account.name,
      server: account.server,
      username: account.username,
      password: account.password,
      proxy: account.proxy
    }, true);
  }

  // Shared helpers for feature modules. They look these up at call time, so
  // registration order does not matter beyond loading app.js last.
  App.util = {
    selectorFor: selectorFor,
    focusInView: focusInView,
    focusFirstView: focusFirstView,
    focusBrowse: focusBrowse,
    renderView: renderView,
    switchView: switchView,
    sectionState: App.catalog.sectionState,
    searchResult: App.catalog.searchResult,
    allCatalog: App.catalog.all,
    ensureCatalog: App.catalog.ensure,
    recentCatalog: App.catalog.recent,
    freshLive: freshLive,
    freshVod: freshVod,
    loginVisible: loginVisible,
    shellVisible: shellVisible
  };

  App.loadCategories = loadCategories;
  App.renderView = renderView;
  App.switchView = switchView;
  App.bootText = bootText;
  App.finishBoot = finishBoot;
  App.applyTextSize = applyTextSize;
  App.updateClock = updateClock;
  App.updateConnection = updateConnection;
  App.updateAccountChip = updateAccountChip;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
