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

  var CONTINUE_CATEGORY = 'continue';
  var RECENT_CATEGORY = 'recent';

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

  function categoriesHtml(categories, activeId, allLabel, continueType, showRecent) {
    var list = [{ category_id: 'all', category_name: allLabel || 'All' }].concat(categories || []);
    var html = '';
    if (continueType) {
      var continueCount = Store.continueWatching(continueType).length;
      var continueActive = String(activeId) === CONTINUE_CATEGORY;
      html += '<button class="cat-item cat-continue ' + (continueActive ? 'is-active' : '') + '" ' +
        'data-action="category" data-category="' + CONTINUE_CATEGORY + '" data-focusable>' +
        '<span class="cat-label">' + icon('history') + '<span>Continue watching</span></span>' +
        '<small>' + esc(String(continueCount)) + '</small>' +
        '</button><div class="cat-sep"></div>';
    }
    if (showRecent) {
      var recentActive = String(activeId) === RECENT_CATEGORY;
      html += '<button class="cat-item cat-recent ' + (recentActive ? 'is-active' : '') + '" ' +
        'data-action="category" data-category="' + RECENT_CATEGORY + '" data-focusable>' +
        '<span class="cat-label">' + icon('clock') + '<span>Recently added</span></span>' +
        (recentActive ? '<small>' + icon('check') + '</small>' : '') +
        '</button><div class="cat-sep"></div>';
    }
    return html + list.map(function (c) {
      var id = String(c.category_id);
      var active = String(activeId) === id;
      return '<button class="cat-item ' + (active ? 'is-active' : '') + '" ' +
        'data-action="category" data-category="' + esc(id) + '" data-focusable>' +
        '<span>' + esc(c.category_name || 'Uncategorized') + '</span>' +
        (active ? '<small>' + icon('check') + '</small>' : '') +
        '</button>';
    }).join('');
  }

  function sortButton(type, sort) {
    sort = sort || 'default';
    return '<button class="pane-sort ' + (sort !== 'default' ? 'is-active' : '') + '" ' +
      'data-action="sort" data-type="' + esc(type) + '" data-focusable ' +
      'aria-label="Sort by ' + esc(IPTV.sortLabel(sort)) + '">' +
      icon('sort') + '<span>' + esc(IPTV.sortLabel(sort, true)) + '</span></button>';
  }

  Screens.sortMenu = function (current) {
    current = current || 'default';
    var options = IPTV.SORT_OPTIONS.map(function (option) {
      var active = option.value === current;
      return '<button class="option-item ' + (active ? 'is-active' : '') + '" ' +
        'data-modal-action="sort:' + esc(option.value) + '" data-focusable>' +
        '<span class="option-check">' + (active ? icon('check') : '') + '</span>' +
        '<span class="option-label">' + esc(option.label) + '</span>' +
        '</button>';
    }).join('');
    return '<div class="option-list">' + options + '</div>' +
      '<p class="option-hint">Sorting applies to the items in the selected category.</p>';
  };

  function searchButton(type) {
    var label = type === 'live' ? 'Search channels' : (type === 'vod' ? 'Search movies' : 'Search series');
    return '<button class="pane-search" data-action="section-search" data-type="' + type + '" ' +
      'data-focusable aria-label="' + label + '">' + icon('search') + '<span>Search</span></button>';
  }

  function progressRatio(record) {
    if (!record || !record.duration || record.duration <= 0) return 0;
    return Math.max(0, Math.min(1, Number(record.position || 0) / Number(record.duration)));
  }

  function continueSubtitle(type, record) {
    var ago = IPTV.fmtAgo(record.updated);
    var prefix = '';
    if (type === 'series') {
      var episode = record.episode ? ('S' + (record.season || '1') + ' E' + record.episode) : 'Episode';
      prefix = episode + '  ·  ';
    }
    if (record.duration && record.position != null) {
      var left = Math.max(0, Number(record.duration) - Number(record.position));
      if (left <= 15) return prefix + 'Watched ' + ago;
      return prefix + IPTV.fmtDuration(left) + ' left';
    }
    return prefix + ('Watched ' + ago);
  }

  function continueGrid(type, api) {
    var items = Store.continueWatching(type);
    if (!items.length) {
      if (type === 'live') {
        return emptyState('history', 'Nothing watched yet',
          'Channels you watch will appear here so you can jump back in quickly.');
      }
      if (type === 'series') {
        return emptyState('history', 'Nothing to continue',
          'Start an episode and it will appear here so you can pick up where you left off.');
      }
      return emptyState('history', 'Nothing to continue',
        'Start a movie and it will appear here with your resume position.');
    }
    if (type === 'live') {
      return items.map(function (item, i) {
        return channelCard(item, api, { index: i, nowText: 'Last watched ' + IPTV.fmtAgo(item.updated) });
      }).join('');
    }
    return items.map(function (record, i) {
      var progress = progressRatio(record);
      var subtitle = continueSubtitle(type, record);
      if (type === 'series') {
        var series = {
          series_id: record.seriesId,
          name: record.seriesName || 'Series',
          cover: record.cover || ''
        };
        return posterCard(series, 'series', api, {
          index: i,
          action: 'resume-series',
          sub: subtitle,
          progress: progress
        });
      }
      return posterCard(record, 'vod', api, {
        index: i,
        action: 'resume-vod',
        sub: subtitle,
        progress: progress
      });
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
    var nowText = options.nowText ||
      (String(item.tv_archive) === '1' ? 'Live + catch-up' : 'Live channel');
    return '<button class="channel-card ' + (fav ? 'is-favorite' : '') + '" ' +
      'data-action="' + (options.action || 'channel') + '" ' +
      'data-id="' + esc(id) + '" data-index="' + (options.index != null ? options.index : '') + '" data-focusable>' +
      '<span class="channel-logo">' + logo + '</span>' +
      '<span class="channel-meta">' +
        '<span class="channel-name">' + esc(item.name || 'Unnamed channel') + '</span>' +
        '<span class="channel-sub">' + sub.map(esc).join('<span class="dot"></span>') + '</span>' +
        '<span class="channel-now">' + esc(nowText) + '</span>' +
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
    var progress = Math.max(0, Math.min(1, Number(options.progress) || 0));
    var progressBar = progress > 0
      ? '<span class="poster-progress"><span style="width:' + Math.round(progress * 100) + '%"></span></span>'
      : '';
    return '<button class="poster-card" data-action="' +
      (options.action || (type === 'series' ? 'series-detail' : 'vod-detail')) + '" ' +
      'data-id="' + esc(id) + '" data-index="' + (options.index != null ? options.index : '') + '" data-focusable>' +
      '<span class="poster-art">' + img(api, artUrl(api, item, type), item.name) + badges + progressBar + '</span>' +
      '<span class="poster-title">' + esc(item.name || 'Untitled') + '</span>' +
      '<span class="poster-sub">' + esc(options.sub || sub || (type === 'series' ? 'Series' : 'Movie')) + '</span>' +
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
    var continueMode = state.categoryId === CONTINUE_CATEGORY;
    var items = continueMode ? Store.continueWatching('live') : state.items;
    var selected = items.find(function (i) { return String(i.stream_id) === String(state.selectedId); });
    var grid = continueMode ? continueGrid('live', api) : gridOrState(state.items, state, function (item, idx) {
      return channelCard(item, api, { index: idx });
    }, 'live', 'No channels in this category', 'Pick another category on the left, or refresh your catalog from Settings.');
    var count = continueMode ? String(items.length) : (state.loading ? 'Loading…' : String(state.items.length));
    return '<div class="view-live">' +
      '<div class="pane categories">' +
        '<div class="pane-head"><span class="pane-title">Categories</span>' +
          '<span class="pane-count">' + esc(String((state.categories || []).length)) + '</span></div>' +
        '<div class="pane-body"><div class="cat-list">' +
          categoriesHtml(state.categories, state.categoryId, 'All channels', 'live') +
        '</div></div>' +
      '</div>' +
      '<div class="pane live-content">' +
        '<div class="pane-head"><span class="pane-title">' + (continueMode ? 'Recently watched' : 'Channels') + '</span>' +
          '<div class="pane-tools"><span class="pane-count">' + esc(count) + '</span>' +
            (continueMode ? '' : sortButton('live', state.sort)) +
            searchButton('live') + '</div></div>' +
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
    var continueMode = state.categoryId === CONTINUE_CATEGORY;
    var recentMode = state.categoryId === RECENT_CATEGORY;
    var continueType = isSeries ? 'series' : 'vod';
    var items = continueMode ? Store.continueWatching(continueType) : state.items;
    var emptyTitle = recentMode
      ? (isSeries ? 'No recently added series' : 'No recently added movies')
      : (isSeries ? 'No series in this category' : 'No movies in this category');
    var grid = continueMode ? continueGrid(continueType, api) : gridOrState(state.items, state, function (item, idx) {
      return posterCard(item, kind, api, { index: idx });
    }, isSeries ? 'series' : 'movies', emptyTitle,
      'Try another category, or refresh your catalog from Settings.');
    var count = continueMode ? String(items.length) : (state.loading ? 'Loading…' : String(state.items.length));
    var heading = continueMode ? 'Continue watching' : (recentMode ? 'Recently added' : (isSeries ? 'Series' : 'Movies'));
    return '<div class="view-browse">' +
      '<div class="pane categories">' +
        '<div class="pane-head"><span class="pane-title">Categories</span>' +
          '<span class="pane-count">' + esc(String((state.categories || []).length)) + '</span></div>' +
        '<div class="pane-body"><div class="cat-list">' +
          categoriesHtml(state.categories, state.categoryId, isSeries ? 'All series' : 'All movies', continueType, true) +
        '</div></div>' +
      '</div>' +
      '<div class="pane browse-content">' +
        '<div class="pane-head"><span class="pane-title">' + heading + '</span>' +
          '<div class="pane-tools"><span class="pane-count">' + esc(count) + '</span>' +
            (continueMode ? '' : sortButton(continueType, state.sort)) +
            searchButton(continueType) + '</div></div>' +
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

  var SEARCH_META = {
    live: { title: 'Live TV', noun: 'channels', grid: 'live-grid', placeholder: 'Search live channels…' },
    vod: { title: 'Movies', noun: 'movies', grid: 'poster-grid', placeholder: 'Search movies…' },
    series: { title: 'Series', noun: 'series', grid: 'poster-grid', placeholder: 'Search series…' }
  };

  function searchResultsMarkup(state, api) {
    var type = state.type || 'live';
    var meta = SEARCH_META[type] || SEARCH_META.live;
    var body;
    if (state.loading) {
      body = '<div id="search-results">' + loadingState('Searching ' + meta.noun + '…') + '</div>';
    } else if (state.error) {
      body = '<div id="search-results">' + errorState(state.error) + '</div>';
    } else if (!state.query) {
      body = '<div id="search-results">' + emptyState('search', 'Search ' + meta.title,
        'Start typing to search ' + meta.title + '. Press OK on the search box to open the ' +
        'TV keyboard. Results stay inside ' + meta.title + '.') + '</div>';
    } else if (!state.results || !state.results.length) {
      body = '<div id="search-results">' + emptyState('search', 'No matches in ' + meta.title,
        'Nothing matched “' + state.query + '”. Try a shorter or different search.') + '</div>';
    } else {
      var cards = type === 'live'
        ? state.results.map(function (item, i) { return channelCard(item, api, { index: i }); }).join('')
        : state.results.map(function (item, i) { return posterCard(item, type, api, { index: i }); }).join('');
      body = '<div id="search-results" class="' + meta.grid + '">' + cards + '</div>';
    }

    var summary = '';
    if (state.query && !state.error) {
      var countText = state.loading ? 'Searching…'
        : String((state.results || []).length) + ' result' + ((state.results || []).length === 1 ? '' : 's');
      summary = '<div class="section-head search-results-head"><h2>' + esc(meta.title) + '</h2>' +
        '<p>' + esc(countText) + '</p></div>';
    }

    return summary + body;
  }

  // Only the results are re-rendered while typing, keeping the input (and the
  // TV keyboard attached to it) alive.
  Screens.searchResults = function (state, api) {
    return searchResultsMarkup(state, api);
  };

  Screens.search = function (state, api) {
    var type = state.type || 'live';
    var meta = SEARCH_META[type] || SEARCH_META.live;
    return '<div class="view-standard">' +
      '<div class="search-bar">' +
        '<div class="search-input-wrap">' + icon('search') +
          '<input id="search-input" class="search-input" type="text" placeholder="' + esc(meta.placeholder) + '" ' +
          'value="' + esc(state.query || '') + '" autocomplete="off" spellcheck="false" data-focusable>' +
        '</div>' +
      '</div>' +
      '<p class="search-hint">' + esc('Results update as you type. Searching ' + meta.title +
        ' only. Press OK in the search box to open the TV keyboard, then press Back to leave search.') + '</p>' +
      '<div id="search-body">' + searchResultsMarkup(state, api) + '</div>' +
    '</div>';
  };

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
    var textSize = Store.settings.textSize || 'standard';
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
          '<p>Make text easier to read on your TV and from your usual viewing distance.</p>' +
          '<div class="settings-rows">' +
            '<div class="settings-row"><span class="label">Text size</span>' +
              '<div class="seg">' +
                segButton('textSize', 'standard', 'Standard', textSize === 'standard') +
                segButton('textSize', 'large', 'Large', textSize === 'large') +
                segButton('textSize', 'xlarge', 'Extra large', textSize === 'xlarge') +
              '</div></div>' +
            '<div class="settings-row"><span class="label">Clock</span>' +
              '<div class="seg">' +
                segButton('timeFormat', '24h', '24-hour', timeFormat === '24h') +
                segButton('timeFormat', '12h', '12-hour', timeFormat === '12h') +
              '</div></div>' +
          '</div>' +
          '<div class="settings-note">Choose Extra large if the TV is far away or text is still hard to read.</div>' +
          '<div class="settings-actions">' +
            '<button class="btn btn-ghost btn-sm" data-action="clear-history" data-focusable>' + icon('history') + 'Clear watch history</button>' +
          '</div>' +
        '</div>' +

        '<div class="settings-card wide">' +
          '<h3>About</h3>' +
          '<p>Perfect IPTV is a media player for Xtream Codes providers. It does not include, host, or sell any channels or media.</p>' +
          '<div class="settings-rows">' +
            settingRow('Version', appVersion || '1.0.6') +
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
