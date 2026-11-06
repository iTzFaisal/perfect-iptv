/* @requires: IPTV.$, IPTV.UI, IPTV.Screens, IPTV.Player, IPTV.Store, IPTV.debounce
   @exports: IPTV.App.live */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var App = IPTV.App = IPTV.App || {};
  var $ = IPTV.$;
  var UI = IPTV.UI;
  var Screens = IPTV.Screens;
  var Player = IPTV.Player;
  var Store = IPTV.Store;

  var CONTINUE_CATEGORY = 'continue';

  function util(name) {
    var fn = App.util && App.util[name];
    if (typeof fn !== 'function') {
      throw new Error('Missing IPTV.App.util.' + name + ' — check script order in index.html');
    }
    return fn;
  }

  function ensureLive() {
    if (!App.api) return Promise.resolve();
    var state = App.state.live;
    if (state.loadedCategory !== state.categoryId) return loadLive(state.categoryId);
    util('renderView')();
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
      util('renderView')();
      focusLive();
      return Promise.resolve();
    }
    if (!force && state.loadedCategory === categoryId) {
      util('renderView')();
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
    util('renderView')();

    return App.api.getLiveStreams(categoryId).then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      IPTV.applyCatalogSort(state, 'live');
      state.loading = false;
      state.loadedCategory = categoryId;
      util('renderView')();
      focusLive();
    }).catch(function (err) {
      if (token !== state.token) return;
      state.loading = false;
      state.items = [];
      state.rawItems = [];
      state.error = IPTV.errorMessage(err);
      util('renderView')();
      setTimeout(util('focusFirstView'), 20);
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

  var selectChannelDebounced = null;

  function select(id) {
    if (!selectChannelDebounced) selectChannelDebounced = IPTV.debounce(selectChannel, 160);
    selectChannelDebounced(id);
  }

  function renderPreview() {
    var pane = $('#live-preview');
    if (!pane) return;
    var active = document.activeElement;
    var restore = null;
    if (active && pane.contains(active)) restore = util('selectorFor')(active);
    var item = liveItem(App.state.live.selectedId);
    pane.innerHTML = Screens.preview(item, App.state.live, App.api);
    if (restore) {
      var target = pane.querySelector(restore);
      if (target) UI.focus(target);
    }
  }

  function liveItem(id) {
    id = String(id);
    return App.state.live.items.find(function (i) { return String(i.stream_id) === id; }) ||
      util('searchResult')('live', id) ||
      Store.getHistory('live', id) ||
      Store.favorites.live[id] ||
      util('allCatalog')('live').find(function (i) { return String(i.stream_id) === id; }) || null;
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
        if (App.view === 'live') util('renderView')();
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

  function focusLive() {
    var card = $('#view [data-action="channel"]');
    if (card) { UI.focus(card); return; }
    util('focusFirstView')();
  }

  function focusChannel(id) {
    var card = $('#view [data-action="channel"][data-id="' + id + '"]');
    if (card) { UI.focus(card); return; }
    util('focusFirstView')();
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
        if (App.view === 'live') util('renderView')();
        focusChannel(id);
      }
    });
  }

  App.live = {
    ensure: ensureLive,
    load: loadLive,
    play: playLive,
    focus: focusLive,
    item: liveItem,
    preview: renderPreview,
    select: select,
    openEpg: openEpg,
    playCatchup: playCatchup
  };
})();
