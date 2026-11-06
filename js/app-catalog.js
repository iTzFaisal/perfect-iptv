/* @requires: IPTV.$, IPTV.UI, IPTV.Screens, IPTV.filterList, IPTV.applyCatalogSort
   @exports: IPTV.App.catalog */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var App = IPTV.App = IPTV.App || {};
  var $ = IPTV.$;
  var UI = IPTV.UI;
  var Screens = IPTV.Screens;

  var SEARCH_LABELS = { live: 'Live TV', vod: 'Movies', series: 'Series' };

  function sectionState(type) {
    if (type === 'live') return App.state.live;
    if (type === 'vod' || type === 'movies') return App.state.vod;
    if (type === 'series') return App.state.series;
    return null;
  }

  function all(type) {
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

  function ensure(type) {
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

  function recent(type) {
    return ensure(type).then(function (list) {
      return IPTV.recentList(list, type);
    });
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
    App.searchReturnView = type === 'vod' ? 'movies' : (type === 'series' ? 'series' : 'live');
    App.switchView('search');
  }

  var searchTimer = null;

  function renderResults() {
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
      renderResults();
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
        state.results = IPTV.filterList(cached, query, 120);
        state.loading = false;
        renderResults();
        return;
      }

      state.loading = true;
      state.results = [];
      renderResults();

      ensure(type).then(function (list) {
        if (token !== state.token || App.view !== 'search') return;
        state.results = IPTV.filterList(list, query, 120);
        state.loading = false;
        renderResults();
      }).catch(function (err) {
        if (token !== state.token || App.view !== 'search') return;
        state.loading = false;
        state.error = 'Could not search ' + (SEARCH_LABELS[type] || 'your catalog') + '. ' + IPTV.errorMessage(err);
        renderResults();
      });
    }, immediate ? 0 : 220);
  }

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
    IPTV.applyCatalogSort(state, catalogType);
    App.renderView();
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

  App.catalog = {
    sectionState: sectionState,
    all: all,
    searchResult: searchResult,
    ensure: ensure,
    recent: recent,
    openSearch: openSearch,
    doSearch: doSearch,
    openSort: openSort,
    setSort: setSort
  };
})();
