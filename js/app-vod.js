/* @requires: IPTV.$, IPTV.UI, IPTV.Screens, IPTV.Player, IPTV.Store
   @exports: IPTV.App.vod */
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
  var RECENT_CATEGORY = 'recent';

  function util(name) {
    var fn = App.util && App.util[name];
    if (typeof fn !== 'function') {
      throw new Error('Missing IPTV.App.util.' + name + ' — check script order in index.html');
    }
    return fn;
  }

  function ensureVod() {
    if (!App.api) return Promise.resolve();
    var state = App.state.vod;
    if (state.loadedCategory !== state.categoryId) return loadVod(state.categoryId);
    util('renderView')();
    util('focusBrowse')();
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
      util('renderView')();
      util('focusBrowse')();
      return Promise.resolve();
    }
    if (!force && state.loadedCategory === categoryId) {
      util('renderView')();
      util('focusBrowse')();
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
    util('renderView')();

    var loader = categoryId === RECENT_CATEGORY
      ? util('recentCatalog')('vod')
      : App.api.getVodStreams(categoryId);

    return loader.then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      IPTV.applyCatalogSort(state, 'vod');
      state.loading = false;
      state.loadedCategory = categoryId;
      util('renderView')();
      util('focusBrowse')();
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

  function vodItem(id) {
    id = String(id);
    return App.state.vod.items.find(function (i) { return String(i.stream_id) === id; }) ||
      util('searchResult')('vod', id) ||
      Store.getHistory('vod', id) ||
      Store.favorites.vod[id] ||
      util('allCatalog')('vod').find(function (i) { return String(i.stream_id) === id; }) || null;
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
        util('renderView')();
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
    util('focusFirstView')();
  }

  App.vod = {
    ensure: ensureVod,
    load: loadVod,
    item: vodItem,
    open: openVod,
    play: playVod,
    resume: resumeVod,
    focus: focusVod
  };
})();
