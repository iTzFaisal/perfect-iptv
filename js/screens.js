/* ============================================================
   Perfect IPTV — screen renderers
   ============================================================ */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var esc = IPTV.esc;
  var icon = IPTV.icon;
  var UI = IPTV.UI;
  var Store = IPTV.Store;

  var Screens = {};

  function img(api, url, name, alt) {
    return UI.img(url ? api.imageUrl(url) : '', name, alt || name);
  }

  function artUrl(api, item, type) {
    if (!item) return '';
    var raw = type === 'series'
      ? (item.cover || item.stream_icon || item.poster)
      : (item.stream_icon || item.cover || item.movie_image || item.poster);
    return raw ? api.imageUrl(raw) : '';
  }

  function emptyState(iconName, title, text, action) {
    return '<div class="empty-state">' + icon(iconName) +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + esc(text) + '</p>' +
      (action || '') + '</div>';
  }

  function errorState(message, actionLabel) {
    return '<div class="empty-state">' + icon('info') +
      '<h3>Something went wrong</h3>' +
      '<p>' + esc(message) + '</p>' +
      '<button class="btn btn-primary" data-action="retry" data-focusable>' +
      esc(actionLabel || 'Try again') + '</button></div>';
  }

  function loadingState(label) {
    return '<div class="pane-state"><div class="spinner"></div><p>' + esc(label || 'Loading…') + '</p></div>';
  }

  function categoryIdOf(item) { return item && (item.category_id || 'all'); }

  function categoriesHtml(categories, activeId, allLabel) {
    var list = [{ category_id: 'all', category_name: allLabel || 'All' }].concat(categories || []);
    return list.map(function (c) {
      var id = String(c.category_id);
      var active = String(activeId) === id;
      return '<button class="cat-item ' + (active ? 'is-active' : '') + '" ' +
        'data-action="category" data-category="' + esc(id) + '" data-focusable>' +
        '<span>' + esc(c.category_name || 'Uncategorized') + '</span>' +
        (active ? '<small>' + icon('check') + '</small>' : '') +
        '</button>';
    }).join('');
  }

  function channelCard(item, api, options) {
    options = options || {};
    var id = String(item.stream_id);
    var fav = Store.isFavorite('live', id);
    var logo = img(api, item.stream_icon, item.name);
    var sub = [];
    if (item.num) sub.push('CH ' + item.num);
    if (String(item.tv_archive) === '1') sub.push('Catch-up');
    if (!sub.length) sub.push('Live TV');
    return '<button class="channel-card ' + (fav ? 'is-favorite' : '') + '" ' +
      'data-action="' + (options.action || 'channel') + '" ' +
      'data-id="' + esc(id) + '" data-index="' + (options.index != null ? options.index : '') + '" data-focusable>' +
      '<span class="channel-logo">' + logo + '</span>' +
      '<span class="channel-meta">' +
        '<span class="channel-name">' + esc(item.name || 'Unnamed channel') + '</span>' +
        '<span class="channel-sub">' + sub.map(esc).join('<span class="dot"></span>') + '</span>' +
        '<span class="channel-now">' + (String(item.tv_archive) === '1' ? 'Live + catch-up' : 'Live channel') + '</span>' +
      '</span>' +
    '</button>';
  }

  function posterCard(item, type, api, options) {
    options = options || {};
    var id = type === 'series' ? String(item.series_id) : String(item.stream_id);
    var fav = Store.isFavorite(type, id);
    var year = item.year || (item.releaseDate ? String(item.releaseDate).slice(0, 4) : '');
    var rating = item.rating ? String(item.rating).slice(0, 3) : '';
    var sub = [year, rating ? '★ ' + rating : ''].filter(Boolean).join('  ·  ');
    var badges = '';
    if (rating) badges += '<span class="poster-badge gold">★ ' + esc(rating) + '</span>';
    if (fav) badges += '<span class="poster-badge" style="left:auto;right:8px;color:#ff8fa2">♥</span>';
    return '<button class="poster-card" data-action="' + (type === 'series' ? 'series-detail' : 'vod-detail') + '" ' +
      'data-id="' + esc(id) + '" data-index="' + (options.index != null ? options.index : '') + '" data-focusable>' +
      '<span class="poster-art">' + img(api, artUrl(api, item, type), item.name) + badges + '</span>' +
      '<span class="poster-title">' + esc(item.name || 'Untitled') + '</span>' +
      '<span class="poster-sub">' + esc(sub || (type === 'series' ? 'Series' : 'Movie')) + '</span>' +
    '</button>';
  }

  function gridOrState(items, state, renderCard, emptyIcon, emptyTitle, emptyText, emptyAction) {
    if (state.loading) return loadingState(state.loadingText || 'Loading…');
    if (state.error) return errorState(state.error);
    if (!items || !items.length) return emptyState(emptyIcon, emptyTitle, emptyText, emptyAction);
    var limit = state.limit || 120;
    var visible = items.slice(0, limit);
    var grid = visible.map(renderCard).join('');
    if (items.length > limit) {
      grid += '<button class="btn btn-ghost load-more" data-action="load-more" data-focusable>' +
        'Show more (' + (items.length - limit) + ')</button>';
    }
    return grid;
  }

  /* ---------------- Live ---------------- */

  Screens.live = function (state, api) {
    var selected = state.items.find(function (i) { return String(i.stream_id) === String(state.selectedId); });
    var grid = gridOrState(state.items, state, function (item, idx) {
      return channelCard(item, api, { index: idx });
    }, 'live', 'No channels in this category', 'Pick another category on the left, or refresh your catalog from Settings.');
    return '<div class="view-live">' +
      '<div class="pane categories">' +
        '<div class="pane-head"><span class="pane-title">Categories</span>' +
          '<span class="pane-count">' + esc(String((state.categories || []).length)) + '</span></div>' +
        '<div class="pane-body"><div class="cat-list">' +
          categoriesHtml(state.categories, state.categoryId, 'All channels') +
        '</div></div>' +
      '</div>' +
      '<div class="pane live-content">' +
        '<div class="pane-head"><span class="pane-title">Channels</span>' +
          '<span class="pane-count">' + esc(state.loading ? 'Loading…' : String(state.items.length)) + '</span></div>' +
        '<div class="pane-body"><div class="live-grid">' + grid + '</div></div>' +
      '</div>' +
      '<div class="pane live-preview" id="live-preview">' + Screens.preview(selected, state, api) + '</div>' +
    '</div>';
  };

  Screens.preview = function (item, state, api) {
    if (!item) {
      return '<div class="preview-empty">' + icon('tv') +
        '<p>Focus a channel to see its details, program guide, and catch-up options.</p></div>';
    }
    var epg = state.epg || [];
    var now = Date.now();
    var current = epg.find(function (p) { return p.start <= now && p.end > now; }) || null;
    var next = epg.find(function (p) { return p.start > now; }) || null;
    var fav = Store.isFavorite('live', item.stream_id);
    var programs = '';
    if (state.epgLoading) {
      programs = '<div class="program"><div class="program-title">Loading guide…</div></div>';
    } else if (!epg.length) {
      programs = '<div class="program"><div class="program-title">No program information</div>' +
        '<div class="program-desc">Your provider does not publish EPG for this channel.</div></div>';
    } else {
      if (current) {
        programs += '<div class="program now">' +
          '<div class="program-time">' + IPTV.fmtTime(current.start, Store.settings.timeFormat) + ' – ' +
          IPTV.fmtTime(current.end, Store.settings.timeFormat) + '  ·  NOW</div>' +
          '<div class="program-title">' + esc(current.title) + '</div>' +
          (current.description ? '<div class="program-desc">' + esc(current.description) + '</div>' : '') +
        '</div>';
      }
      if (next) {
        programs += '<div class="program">' +
          '<div class="program-time">' + IPTV.fmtTime(next.start, Store.settings.timeFormat) + ' – ' +
          IPTV.fmtTime(next.end, Store.settings.timeFormat) + '  ·  NEXT</div>' +
          '<div class="program-title">' + esc(next.title) + '</div>' +
          (next.description ? '<div class="program-desc">' + esc(next.description) + '</div>' : '') +
        '</div>';
      }
      if (!current && !next) {
        programs += '<div class="program"><div class="program-title">No current program</div>' +
          '<div class="program-desc">The guide has no programs scheduled right now.</div></div>';
      }
    }
    return '<div class="preview-inner">' +
      '<div class="preview-art">' + img(api, item.stream_icon, item.name) + '</div>' +
      '<div class="preview-name">' + esc(item.name || 'Unnamed channel') + '</div>' +
      '<div class="preview-meta">' + (item.num ? 'Channel ' + esc(item.num) + ' · ' : '') +
        (String(item.tv_archive) === '1' ? 'Catch-up available' : 'Live TV') + '</div>' +
      '<div class="preview-epg"><div class="preview-epg-label">Program guide</div>' + programs + '</div>' +
      '<div class="preview-actions">' +
        '<button class="btn btn-primary" data-action="play-live" data-id="' + esc(item.stream_id) + '" data-focusable>' +
          icon('play') + 'Watch now</button>' +
        '<button class="btn btn-ghost" data-action="toggle-fav" data-type="live" data-id="' + esc(item.stream_id) + '" data-focusable>' +
          icon(fav ? 'heart-fill' : 'heart') + (fav ? 'Remove favorite' : 'Add to favorites') + '</button>' +
        '<button class="btn btn-ghost" data-action="open-epg" data-id="' + esc(item.stream_id) + '" data-focusable>' +
          icon('calendar') + 'TV guide</button>' +
      '</div>' +
    '</div>';
  };

  /* ---------------- Movies / series ---------------- */

  function browseView(state, api, kind) {
    var isSeries = kind === 'series';
    var grid = gridOrState(state.items, state, function (item, idx) {
      return posterCard(item, kind, api, { index: idx });
    }, isSeries ? 'series' : 'movies',
      isSeries ? 'No series in this category' : 'No movies in this category',
      'Try another category, or refresh your catalog from Settings.');
    return '<div class="view-browse">' +
      '<div class="pane categories">' +
        '<div class="pane-head"><span class="pane-title">Categories</span>' +
          '<span class="pane-count">' + esc(String((state.categories || []).length)) + '</span></div>' +
        '<div class="pane-body"><div class="cat-list">' +
          categoriesHtml(state.categories, state.categoryId, isSeries ? 'All series' : 'All movies') +
        '</div></div>' +
      '</div>' +
      '<div class="pane browse-content">' +
        '<div class="pane-head"><span class="pane-title">' + (isSeries ? 'Series' : 'Movies') + '</span>' +
          '<span class="pane-count">' + esc(state.loading ? 'Loading…' : String(state.items.length)) + '</span></div>' +
        '<div class="pane-body"><div class="poster-grid">' + grid + '</div></div>' +
      '</div>' +
    '</div>';
  }

  Screens.movies = function (state, api) { return browseView(state, api, 'vod'); };
  Screens.series = function (state, api) { return browseView(state, api, 'series'); };

  /* ---------------- Favorites ---------------- */

  Screens.favorites = function (state, api) {
    var tab = state.tab || 'live';
    var counts = {
      live: Store.favoritesOf('live').length,
      vod: Store.favoritesOf('vod').length,
      series: Store.favoritesOf('series').length
    };
    var items = Store.favoritesOf(tab);
    var grid = '';
    if (!items.length) {
      grid = emptyState(tab === 'live' ? 'live' : (tab === 'vod' ? 'movies' : 'series'),
        'No favorites yet',
        'Press the heart button on any channel, movie, or series to save it here.');
    } else if (tab === 'live') {
      grid = items.map(function (item, i) { return channelCard(item, api, { index: i }); }).join('');
    } else {
      grid = items.map(function (item, i) { return posterCard(item, tab, api, { index: i }); }).join('');
    }
    return '<div class="view-standard">' +
      '<div class="tab-row">' +
        tabButton('live', 'Live TV', counts.live, tab) +
        tabButton('vod', 'Movies', counts.vod, tab) +
        tabButton('series', 'Series', counts.series, tab) +
      '</div>' +
      '<div class="' + (tab === 'live' ? 'live-grid' : 'poster-grid') + '">' + grid + '</div>' +
    '</div>';
  };

  function tabButton(value, label, count, active) {
    return '<button class="tab ' + (active === value ? 'is-active' : '') + '" ' +
      'data-action="fav-tab" data-tab="' + value + '" data-focusable>' +
      label + ' <span style="opacity:.6">' + count + '</span></button>';
  }

  /* ---------------- Search ---------------- */

  Screens.search = function (state, api) {
    var body;
    if (state.loading) {
      body = '<div id="search-results">' + loadingState('Searching your catalog…') + '</div>';
    } else if (state.error) {
      body = '<div id="search-results">' + errorState(state.error) + '</div>';
    } else if (!state.query) {
      body = '<div id="search-results">' + emptyState('search', 'Search everything',
        'Type a channel, movie, or series name. Press OK on the search box to open the TV keyboard.') + '</div>';
    } else if (!state.results || (!state.results.live.length && !state.results.vod.length && !state.results.series.length)) {
      body = '<div id="search-results">' + emptyState('search', 'No matches',
        'Nothing matched “' + state.query + '”. Try a shorter or different search.') + '</div>';
    } else {
      body = '<div id="search-results">';
      body += resultBlock('Live TV', state.results.live.map(function (item, i) {
        return channelCard(item, api, { index: i });
      }).join(''), 'live-grid');
      body += resultBlock('Movies', state.results.vod.map(function (item, i) {
        return posterCard(item, 'vod', api, { index: i });
      }).join(''), 'poster-grid');
      body += resultBlock('Series', state.results.series.map(function (item, i) {
        return posterCard(item, 'series', api, { index: i });
      }).join(''), 'poster-grid');
      body += '</div>';
    }

    return '<div class="view-standard">' +
      '<div class="search-bar">' +
        '<div class="search-input-wrap">' + icon('search') +
          '<input id="search-input" class="search-input" type="text" placeholder="Search channels, movies, series…" ' +
          'value="' + esc(state.query || '') + '" autocomplete="off" spellcheck="false" data-focusable>' +
        '</div>' +
        '<button class="btn btn-primary" data-action="do-search" data-focusable>' + icon('search') + 'Search</button>' +
      '</div>' +
      '<p class="search-hint">Press OK in the search box to open the keyboard, then press Enter to search.</p>' +
      body +
    '</div>';
  };

  function resultBlock(title, content, gridClass) {
    if (!content) return '';
    return '<div class="result-block"><div class="section-head"><h2>' + esc(title) + '</h2></div>' +
      '<div class="' + gridClass + '">' + content + '</div></div>';
  }

  /* ---------------- Settings ---------------- */

  Screens.settings = function (state, api, appVersion) {
    var account = Store.activeAccount() || {};
    var info = account.userInfo || {};
    var server = account.server || '—';
    var status = info.status || 'Unknown';
    var expiry = info.exp_date ? IPTV.fmtDate(info.exp_date) : 'No expiry';
    var engine = Store.settings.playerEngine;
    var streamFormat = Store.settings.streamFormat;
    var timeFormat = Store.settings.timeFormat;
    return '<div class="view-standard">' +
      '<div class="settings-grid">' +
        '<div class="settings-card wide">' +
          '<h3>Active account</h3>' +
          '<p>Your credentials never leave this TV except to talk to your provider.</p>' +
          '<div class="settings-rows">' +
            settingRow('Account', account.name || 'My IPTV') +
            settingRow('Server', server) +
            settingRow('Username', account.username || '—') +
            settingRow('Status', status, status.toLowerCase() === 'active' || status.toLowerCase() === 'trial' ? 'green' : 'gold') +
            settingRow('Expires', expiry) +
            settingRow('Connections', (info.active_cons || '0') + ' active / ' + (info.max_connections || '—') + ' max') +
            settingRow('API access', apiModeLabel()) +
          '</div>' +
          '<div class="settings-actions">' +
            '<button class="btn btn-ghost btn-sm" data-action="refresh-all" data-focusable>' + icon('refresh') + 'Refresh catalog</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="switch-account" data-focusable>' + icon('user') + 'Switch account</button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-card">' +
          '<h3>Playback</h3>' +
          '<p>AVPlay uses the TV’s hardware decoder. The browser player is a fallback for unusual formats.</p>' +
          '<div class="settings-rows">' +
            '<div class="settings-row"><span class="label">Player engine</span>' +
              '<div class="seg">' +
                segButton('playerEngine', 'auto', 'Auto', engine === 'auto') +
                segButton('playerEngine', 'avplay', 'AVPlay', engine === 'avplay') +
                segButton('playerEngine', 'html5', 'Browser', engine === 'html5') +
              '</div></div>' +
            '<div class="settings-row"><span class="label">Live stream format</span>' +
              '<div class="seg">' +
                segButton('streamFormat', 'm3u8', 'HLS', streamFormat === 'm3u8') +
                segButton('streamFormat', 'ts', 'MPEG-TS', streamFormat === 'ts') +
              '</div></div>' +
          '</div>' +
          '<div class="settings-note">If a channel does not start, try MPEG-TS or the Browser engine.</div>' +
        '</div>' +

        '<div class="settings-card">' +
          '<h3>Display</h3>' +
          '<p>Choose how times appear across the guide and player.</p>' +
          '<div class="settings-rows">' +
            '<div class="settings-row"><span class="label">Clock</span>' +
              '<div class="seg">' +
                segButton('timeFormat', '24h', '24-hour', timeFormat === '24h') +
                segButton('timeFormat', '12h', '12-hour', timeFormat === '12h') +
              '</div></div>' +
          '</div>' +
          '<div class="settings-actions">' +
            '<button class="btn btn-ghost btn-sm" data-action="clear-history" data-focusable>' + icon('clock') + 'Clear resume history</button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-card wide">' +
          '<h3>About</h3>' +
          '<p>Perfect IPTV is a media player for Xtream Codes providers. It does not include, host, or sell any channels or media.</p>' +
          '<div class="settings-rows">' +
            settingRow('Version', appVersion || '1.0.0') +
            settingRow('Platform', 'Samsung Tizen TV') +
          '</div>' +
          '<div class="settings-actions">' +
            '<button class="btn btn-ghost btn-sm" data-action="add-account" data-focusable>' + icon('plus') + 'Add another account</button>' +
            '<button class="btn btn-danger btn-sm" data-action="logout" data-focusable>' + icon('x') + 'Sign out</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  function settingRow(label, value, chipClass) {
    return '<div class="settings-row"><span class="label">' + esc(label) + '</span>' +
      (chipClass
        ? '<span class="chip ' + chipClass + '">' + esc(value) + '</span>'
        : '<span class="value">' + esc(value) + '</span>') +
      '</div>';
  }

  function apiModeLabel() {
    var mode = IPTV.apiMode;
    if (mode === 'native') return 'TV downloader';
    if (mode === 'proxy') return 'CORS proxy';
    if (mode === 'direct') return 'Direct';
    return '—';
  }

  function segButton(setting, value, label, active) {
    return '<button class="' + (active ? 'is-active' : '') + '" data-action="setting" data-setting="' +
      esc(setting) + '" data-value="' + esc(value) + '" data-focusable>' + esc(label) + '</button>';
  }

  /* ---------------- Detail views ---------------- */

  Screens.vodDetail = function (data, item, api, favorite) {
    var info = (data && data.info) || {};
    var movie = (data && data.movie_data) || {};
    var title = info.name || movie.name || item.name || 'Untitled';
    var poster = info.movie_image || info.cover_big || artUrl(api, item, 'vod');
    var plot = info.plot || info.description || item.plot || 'No description available.';
    var year = info.releasedate || info.releaseDate || item.year || '';
    var duration = info.duration || '';
    var genre = info.genre || '';
    var rating = info.rating || item.rating || '';
    var cast = info.cast || info.actors || '';
    var director = info.director || '';
    var country = info.country || '';
    var chips = [];
    if (year) chips.push(String(year).slice(0, 4));
    if (duration) chips.push(duration);
    if (genre) chips.push(genre.split(',')[0]);
    if (rating) chips.push('★ ' + String(rating).slice(0, 3));
    return '<div class="detail-grid">' +
      '<div class="detail-poster">' + img(api, poster, title) + '</div>' +
      '<div class="detail-info">' +
        '<div class="detail-sub">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<p class="detail-plot">' + esc(plot) + '</p>' +
        '<div class="detail-facts">' +
          (director ? fact('Director', director) : '') +
          (cast ? fact('Cast', cast) : '') +
          (country ? fact('Country', country) : '') +
          (info.tmdb_id ? fact('TMDB', info.tmdb_id) : '') +
        '</div>' +
        '<div class="detail-actions">' +
          '<button class="btn btn-primary" data-action="play-vod" data-id="' + esc(item.stream_id) + '" data-focusable>' +
            icon('play') + 'Play movie</button>' +
          '<button class="btn btn-ghost" data-action="toggle-fav" data-type="vod" data-id="' + esc(item.stream_id) + '" data-focusable>' +
            icon(favorite ? 'heart-fill' : 'heart') + (favorite ? 'Remove favorite' : 'Add to favorites') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  function fact(label, value) {
    return '<div class="detail-fact"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div></div>';
  }

  Screens.seriesDetail = function (data, item, api, favorite, activeSeason) {
    var info = (data && data.info) || {};
    var seasons = (data && data.seasons) || [];
    var episodesMap = (data && data.episodes) || {};
    var title = info.name || item.name || 'Untitled';
    var poster = info.cover_big || info.cover || artUrl(api, item, 'series');
    var plot = info.plot || item.plot || 'No description available.';
    var year = info.releaseDate || item.releaseDate || '';
    var genre = info.genre || item.genre || '';
    var rating = info.rating || item.rating || '';
    var cast = info.cast || '';
    var director = info.director || '';
    var seasonNumbers = seasons.map(function (s) { return String(s.season_number || s.number || s); });
    if (!seasonNumbers.length) seasonNumbers = Object.keys(episodesMap);
    var current = String(activeSeason || seasonNumbers[0] || '1');
    var episodes = episodesMap[current] || [];
    var chips = [];
    if (year) chips.push(String(year).slice(0, 4));
    if (genre) chips.push(genre.split(',')[0]);
    if (rating) chips.push('★ ' + String(rating).slice(0, 3));
    if (seasonNumbers.length) chips.push(seasonNumbers.length + ' season' + (seasonNumbers.length > 1 ? 's' : ''));

    var seasonChips = seasonNumbers.map(function (n) {
      return '<button class="season-chip ' + (String(n) === current ? 'is-active' : '') + '" ' +
        'data-action="season" data-season="' + esc(n) + '" data-focusable>Season ' + esc(n) + '</button>';
    }).join('');

    var episodeRows = episodes.length ? episodes.map(function (ep) {
      var epNum = ep.episode_num || ep.episode || '';
      var epTitle = ep.title || ('Episode ' + epNum);
      var ext = ep.container_extension || 'mp4';
      var runtime = ep.info && (ep.info.duration || ep.info.runtime);
      return '<button class="episode-row" data-action="play-episode" ' +
        'data-id="' + esc(ep.id) + '" data-ext="' + esc(ext) + '" data-season="' + esc(current) + '" ' +
        'data-episode="' + esc(epNum) + '" data-title="' + esc(epTitle) + '" data-focusable>' +
        '<span class="episode-num">' + esc(epNum || '•') + '</span>' +
        '<span class="episode-main"><span class="episode-title">' + esc(epTitle) + '</span>' +
          (runtime ? '<span class="episode-sub">' + esc(runtime) + '</span>' : '') +
        '</span>' + icon('play') +
      '</button>';
    }).join('') : '<p class="hint">No episodes listed for this season.</p>';

    return '<div class="detail-grid">' +
      '<div class="detail-poster">' + img(api, poster, title) + '</div>' +
      '<div class="detail-info">' +
        '<div class="detail-sub">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<p class="detail-plot">' + esc(plot) + '</p>' +
        '<div class="detail-facts">' +
          (director ? fact('Director', director) : '') +
          (cast ? fact('Cast', cast) : '') +
        '</div>' +
        '<div class="detail-actions">' +
          '<button class="btn btn-ghost" data-action="toggle-fav" data-type="series" data-id="' + esc(item.series_id) + '" data-focusable>' +
            icon(favorite ? 'heart-fill' : 'heart') + (favorite ? 'Remove favorite' : 'Add to favorites') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:28px">' +
      '<div class="season-row">' + seasonChips + '</div>' +
      '<div class="episode-list" id="episode-list">' + episodeRows + '</div>' +
    '</div>';
  };

  Screens.epgBody = function (channel, listings, api) {
    var now = Date.now();
    if (!listings || !listings.length) {
      return emptyState('calendar', 'No guide data',
        'Your provider does not publish an EPG for this channel. You can still watch the live stream.');
    }
    var rows = listings.map(function (p) {
      var isNow = p.start <= now && p.end > now;
      var isPast = p.end <= now;
      var canCatch = isPast && (p.hasArchive || String(channel.tv_archive) === '1');
      var duration = Math.max(1, Math.round((p.end - p.start) / 60000));
      return '<div class="epg-row ' + (isNow ? 'is-now' : '') + ' ' + (isPast ? 'is-past' : '') + '">' +
        '<div class="epg-time">' + IPTV.fmtTime(p.start, Store.settings.timeFormat) + '<br>' +
          IPTV.fmtTime(p.end, Store.settings.timeFormat) + '</div>' +
        '<div><div class="epg-title">' + esc(p.title) + (isNow ? ' <span class="chip live">NOW</span>' : '') + '</div>' +
          (p.description ? '<div class="epg-desc">' + esc(p.description) + '</div>' : '') + '</div>' +
        '<div class="epg-action">' +
          (canCatch
            ? '<button class="btn btn-ghost btn-sm" data-action="catchup" data-id="' + esc(channel.stream_id) + '" ' +
              'data-start="' + esc(p.start) + '" data-duration="' + esc(duration) + '" data-focusable>' +
              icon('clock') + 'Catch up</button>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="epg-list">' + rows + '</div>';
  };

  IPTV.Screens = Screens;
})();
