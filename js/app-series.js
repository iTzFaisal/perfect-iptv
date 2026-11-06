/* @requires: IPTV.$, IPTV.UI, IPTV.Screens, IPTV.Player, IPTV.Store
   @exports: IPTV.App.series */
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

  function ensureSeries() {
    if (!App.api) return Promise.resolve();
    var state = App.state.series;
    if (state.loadedCategory !== state.categoryId) return loadSeries(state.categoryId);
    util('renderView')();
    util('focusBrowse')();
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
      ? 'Loading recently added series…' : 'Loading series…';
    state.error = null;
    state.items = [];
    state.rawItems = [];
    state.limit = 120;
    state.loadedCategory = null;
    var token = ++state.token;
    util('renderView')();

    var loader = categoryId === RECENT_CATEGORY
      ? util('recentCatalog')('series')
      : App.api.getSeries(categoryId);

    return loader.then(function (items) {
      if (token !== state.token) return;
      state.rawItems = items || [];
      IPTV.applyCatalogSort(state, 'series');
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

  function seriesItem(id) {
    id = String(id);
    var item = App.state.series.items.find(function (i) { return String(i.series_id) === id; }) ||
      util('searchResult')('series', id) ||
      Store.favorites.series[id] ||
      util('allCatalog')('series').find(function (i) { return String(i.series_id) === id; });
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
        util('renderView')();
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
    util('focusFirstView')();
  }

  App.series = {
    ensure: ensureSeries,
    load: loadSeries,
    item: seriesItem,
    open: openSeries,
    resume: resumeSeries,
    showModal: showSeriesModal,
    episodes: seasonEpisodes,
    playEpisode: playSeriesEpisode,
    focus: focusSeries
  };
})();
