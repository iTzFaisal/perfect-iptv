/* ============================================================
   Perfect IPTV — core utilities, storage, and Xtream API client
   ============================================================ */
(function () {
  'use strict';

  var IPTV = window.IPTV = window.IPTV || {};

  /* ---------------- DOM & formatting helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function initials(name) {
    var clean = String(name || '?').replace(/[^\w\s\u0600-\u06FF]/g, ' ').trim();
    var parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(ms, mode) {
    if (!ms || isNaN(ms)) return '--:--';
    var d = new Date(ms);
    var h = d.getHours();
    var m = pad(d.getMinutes());
    if (mode === '12h') {
      var suffix = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 || 12;
      return h12 + ':' + m + ' ' + suffix;
    }
    return pad(h) + ':' + m;
  }

  function fmtClock(date, mode) {
    date = date || new Date();
    return fmtTime(date.getTime(), mode);
  }

  function fmtDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '—';
    seconds = Math.max(0, Math.round(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.round((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function fmtPosition(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    seconds = Math.max(0, Math.round(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  }

  function fmtDate(timestamp) {
    if (!timestamp) return '—';
    var ms = Number(timestamp);
    if (ms < 100000000000) ms *= 1000;
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtAgo(timestamp) {
    var ms = Number(timestamp || 0);
    if (!ms) return '';
    var diff = Date.now() - ms;
    if (diff < 0) diff = 0;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' hr ago';
    var days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    return fmtDate(ms);
  }

  /* ---------------- Catalog sorting ---------------- */

  var SORT_OPTIONS = [
    { value: 'default', label: 'Default order', short: 'Sort' },
    { value: 'name-asc', label: 'Name A–Z', short: 'Sort: A–Z' },
    { value: 'name-desc', label: 'Name Z–A', short: 'Sort: Z–A' },
    { value: 'recent', label: 'Recently added', short: 'Sort: Newest' }
  ];

  function toTimestampMs(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') {
      return value > 100000000000 ? value : value * 1000;
    }
    var raw = String(value).trim();
    if (!raw) return 0;
    if (/^\d+(\.\d+)?$/.test(raw)) {
      var n = Number(raw);
      return n > 100000000000 ? n : n * 1000;
    }
    var parsed = Date.parse(raw.replace(' ', 'T'));
    return isNaN(parsed) ? 0 : parsed;
  }

  function itemAddedMs(item, type) {
    if (!item) return 0;
    if (type === 'series') {
      return toTimestampMs(item.last_modified || item.lastModified || item.added || item.added_at);
    }
    return toTimestampMs(item.added || item.added_at);
  }

  function compareNames(a, b) {
    a = String(a || '');
    b = String(b || '');
    try {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    } catch (err) {
      a = a.toLowerCase();
      b = b.toLowerCase();
      return a < b ? -1 : (a > b ? 1 : 0);
    }
  }

  // Stable client-side sort. Providers return the whole catalog in their own
  // order; Xtream has no standard sort/recently-added parameters.
  function sortCatalog(items, sort, type) {
    var list = Array.isArray(items) ? items : [];
    if (!sort || sort === 'default') return list;
    var indexed = list.map(function (item, index) {
      return {
        item: item,
        index: index,
        name: (item && (item.name || item.title)) || '',
        added: itemAddedMs(item, type)
      };
    });
    indexed.sort(function (a, b) {
      if (sort === 'name-asc' || sort === 'name-desc') {
        var nameOrder = compareNames(a.name, b.name);
        return (sort === 'name-desc' ? -nameOrder : nameOrder) || (a.index - b.index);
      }
      if (sort === 'recent') {
        return (b.added - a.added) || (a.index - b.index);
      }
      return a.index - b.index;
    });
    return indexed.map(function (entry) { return entry.item; });
  }

  function sortLabel(value, short) {
    var option = SORT_OPTIONS.find(function (entry) { return entry.value === value; }) || SORT_OPTIONS[0];
    return short ? option.short : option.label;
  }

  function b64Decode(value) {
    if (!value) return '';
    try {
      var binary = atob(value);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
      return String(value);
    }
  }

  function normalizeServer(input) {
    var raw = String(input || '').trim();
    if (!raw) throw new Error('Please enter your provider server URL.');
    raw = raw.replace(/\s+/g, '');
    if (raw.indexOf('//') === 0) raw = 'http:' + raw;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'http://' + raw;
    raw = raw.replace(/\/player_api\.php.*$/i, '');
    raw = raw.replace(/\/get\.php.*$/i, '');
    raw = raw.replace(/\/+$/, '');
    var url;
    try { url = new URL(raw); } catch (err) { throw new Error('That server URL does not look valid.'); }
    if (!url.hostname) throw new Error('That server URL does not look valid.');
    return url.protocol + '//' + url.host + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''));
  }

  function parseProviderInput(input) {
    var raw = String(input || '').trim();
    var out = { server: raw, username: '', password: '' };
    if (!raw) return out;
    try {
      var withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw;
      var url = new URL(withScheme);
      var u = url.searchParams.get('username');
      var p = url.searchParams.get('password');
      if (u) out.username = u;
      if (p) out.password = p;
      out.server = url.protocol + '//' + url.host + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''))
        .replace(/\/player_api\.php$/i, '')
        .replace(/\/get\.php$/i, '');
    } catch (err) { /* leave as typed */ }
    return out;
  }

  function absUrl(server, value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return (String(server).indexOf('https://') === 0 ? 'https:' : 'http:') + url;
    if (/^data:/i.test(url)) return url;
    return String(server || '').replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
  }

  function hash(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'a' + h.toString(36);
  }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function storageGet(key, fallback) {
    try {
      var raw = localStorage.getItem('perfectiptv.v1.' + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) { return fallback; }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem('perfectiptv.v1.' + key, JSON.stringify(value));
      return true;
    } catch (err) { return false; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem('perfectiptv.v1.' + key); } catch (err) { /* ignore */ }
  }

  function errorMessage(err) {
    if (!err) return 'Something went wrong.';
    if (err.name === 'AbortError') return 'The server took too long to respond.';
    return err.message || String(err);
  }

  /* ---------------- Store ---------------- */

  var DEFAULT_SETTINGS = {
    timeFormat: '24h',
    textSize: 'standard',   // standard | large | xlarge
    playerEngine: 'auto',   // auto | avplay | html5
    streamFormat: 'm3u8',   // m3u8 | ts
    autoplay: true,
    reduceMotion: false
  };

  var Store = {
    accounts: [],
    activeId: null,
    favorites: { live: {}, vod: {}, series: {} },
    history: {},
    settings: Object.assign({}, DEFAULT_SETTINGS),

    load: function () {
      this.accounts = storageGet('accounts', []) || [];
      this.activeId = storageGet('activeId', null);
      this.favorites = Object.assign({ live: {}, vod: {}, series: {} }, storageGet('favorites', {}));
      this.history = storageGet('history', {}) || {};
      this.settings = Object.assign({}, DEFAULT_SETTINGS, storageGet('settings', {}));
      if (this.activeId && !this.accounts.some(function (a) { return a.id === this.activeId; }, this)) {
        this.activeId = null;
        storageRemove('activeId');
      }
      return this;
    },

    activeAccount: function () {
      var id = this.activeId;
      return this.accounts.find(function (a) { return a.id === id; }) || null;
    },

    saveAccounts: function () { storageSet('accounts', this.accounts); },
    saveActive: function () { storageSet('activeId', this.activeId); },
    saveFavorites: function () { storageSet('favorites', this.favorites); },
    saveHistory: function () { storageSet('history', this.history); },
    saveSettings: function () { storageSet('settings', this.settings); },

    addAccount: function (account) {
      var existing = this.accounts.find(function (a) {
        return a.server === account.server && a.username === account.username;
      });
      if (existing) {
        Object.assign(existing, account, { id: existing.id });
        this.activeId = existing.id;
        this.saveAccounts();
        this.saveActive();
        return existing;
      }
      account.id = account.id || uid();
      this.accounts.push(account);
      this.activeId = account.id;
      this.saveAccounts();
      this.saveActive();
      return account;
    },

    removeAccount: function (id) {
      this.accounts = this.accounts.filter(function (a) { return a.id !== id; });
      if (this.activeId === id) this.activeId = this.accounts.length ? this.accounts[0].id : null;
      this.saveAccounts();
      this.saveActive();
      // Only wipe local favorites/history when no account is left. They are
      // shared across saved accounts, so deleting one must not erase the others.
      if (!this.accounts.length) {
        storageRemove('favorites');
        storageRemove('history');
        this.favorites = { live: {}, vod: {}, series: {} };
        this.history = {};
      }
    },

    setActive: function (id) {
      if (!this.accounts.some(function (a) { return a.id === id; })) return false;
      this.activeId = id;
      this.saveActive();
      return true;
    },

    isFavorite: function (type, id) {
      var bucket = this.favorites[type] || {};
      return !!bucket[String(id)];
    },

    toggleFavorite: function (type, item) {
      var bucket = this.favorites[type] || (this.favorites[type] = {});
      var id = String(item.stream_id || item.series_id || item.id);
      if (bucket[id]) {
        delete bucket[id];
        this.saveFavorites();
        return false;
      }
      bucket[id] = this.snapshot(type, item);
      this.saveFavorites();
      return true;
    },

    snapshot: function (type, item) {
      var base = {
        id: String(item.stream_id || item.series_id || item.id),
        name: item.name || item.title || 'Untitled',
        added: Date.now()
      };
      if (type === 'live') {
        Object.assign(base, {
          stream_id: item.stream_id,
          num: item.num,
          stream_icon: item.stream_icon || '',
          category_id: item.category_id,
          epg_channel_id: item.epg_channel_id || '',
          tv_archive: item.tv_archive,
          tv_archive_duration: item.tv_archive_duration
        });
      } else if (type === 'vod') {
        Object.assign(base, {
          stream_id: item.stream_id,
          stream_icon: item.stream_icon || item.cover || '',
          container_extension: item.container_extension || 'mp4',
          category_id: item.category_id,
          rating: item.rating,
          year: item.year || (item.releaseDate ? String(item.releaseDate).slice(0, 4) : '')
        });
      } else {
        Object.assign(base, {
          series_id: item.series_id,
          cover: item.cover || item.stream_icon || '',
          plot: item.plot || '',
          category_id: item.category_id,
          rating: item.rating,
          year: item.releaseDate ? String(item.releaseDate).slice(0, 4) : ''
        });
      }
      return base;
    },

    favoritesOf: function (type) {
      var bucket = this.favorites[type] || {};
      return Object.keys(bucket).map(function (k) { return bucket[k]; });
    },

    historyKey: function (type, id) { return type + ':' + id; },

    getHistory: function (type, id) {
      return this.history[this.historyKey(type, id)] || null;
    },

    setHistory: function (type, id, data) {
      this.history[this.historyKey(type, id)] = Object.assign({ updated: Date.now() }, data);
      var keys = Object.keys(this.history);
      if (keys.length > 60) {
        keys.sort(function (a, b) { return (this.history[a].updated || 0) - (this.history[b].updated || 0); }, this);
        keys.slice(0, keys.length - 60).forEach(function (k) { delete this.history[k]; }, this);
      }
      this.saveHistory();
    },

    historyOf: function (type) {
      var prefix = type + ':';
      return Object.keys(this.history)
        .filter(function (key) { return key.indexOf(prefix) === 0; })
        .map(function (key) { return this.history[key]; }, this)
        .filter(Boolean)
        .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    },

    // Series history stores one row per episode. Continue watching should show
    // one card per series, using the most recently watched episode.
    continueWatching: function (type) {
      var records = this.historyOf(type);
      if (type !== 'series') return records;
      var seen = {};
      return records.filter(function (record) {
        var id = String(record.seriesId || '');
        if (!id || seen[id]) return false;
        seen[id] = true;
        return true;
      });
    },

    latestFor: function (type, id) {
      id = String(id);
      return this.historyOf(type).find(function (record) {
        if (type === 'series') return String(record.seriesId) === id;
        return String(record.stream_id || record.id) === id;
      }) || null;
    },

    clearHistory: function () {
      this.history = {};
      this.saveHistory();
    }
  };

  /* ---------------- Xtream client ---------------- */

  function XtreamError(message, code, cause) {
    this.name = 'XtreamError';
    this.message = message;
    this.code = code || 'error';
    this.cause = cause || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, XtreamError);
  }
  XtreamError.prototype = Object.create(Error.prototype);
  XtreamError.prototype.constructor = XtreamError;

  function Xtream(account) {
    this.account = account;
    this.server = String(account.server || '').replace(/\/+$/, '');
    this.username = account.username || '';
    this.password = account.password || '';
    this.proxy = String(account.proxy || '').replace(/\/+$/, '');
    this._cache = {};
    this._cacheOrder = [];
  }

  Xtream.prototype.apiUrl = function (action, params) {
    var url = this.server + '/player_api.php?username=' + encodeURIComponent(this.username) +
      '&password=' + encodeURIComponent(this.password);
    if (action) url += '&action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function (key) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }
      });
    }
    if (this.proxy) {
      url = this.proxy + (this.proxy.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(url);
    }
    return url;
  };

  /* ---------------- Native Tizen downloader (CORS bypass) ----------------
     Some IPTV panels do not send Access-Control-Allow-Origin, so browser
     fetch() is blocked even though the TV can reach the server. Tizen's
     native Download API writes the JSON to private storage, where the
     Filesystem API can read it. We use that as an automatic fallback. */

  function canUseNativeDownload() {
    try {
      if (!window.tizen || !tizen.download || !tizen.filesystem) return false;
    } catch (err) {
      return false;
    }
    try {
      if (tizen.systeminfo && tizen.systeminfo.getCapability) {
        var capability = tizen.systeminfo.getCapability('http://tizen.org/feature/download');
        if (capability === false || capability === 'false') return false;
      }
    } catch (err) { /* capability may not be queryable; try anyway */ }
    return true;
  }

  var nativeFileSeq = 0;

  function deleteNativeFile(name) {
    try {
      tizen.filesystem.resolve('wgt-private-tmp', function (dir) {
        try { dir.deleteFile(name); } catch (err) { /* already gone */ }
      }, function () { /* ignore */ }, 'rw');
    } catch (err) { /* ignore */ }
  }

  function readNativeFile(path, name) {
    return new Promise(function (resolve, reject) {
      function openFile(file) {
        var stream = null;
        try {
          try {
            stream = file.openStream('r', 'UTF-8');
          } catch (encodingErr) {
            stream = file.openStream('r');
          }
          var parts = [];
          var chunk;
          while ((chunk = stream.read(65536)) !== null && chunk !== undefined && chunk.length > 0) {
            parts.push(chunk);
          }
          stream.close();
          resolve(parts.join('').replace(/^\uFEFF/, ''));
        } catch (err) {
          try { if (stream) stream.close(); } catch (closeErr) { /* ignore */ }
          reject(err);
        }
      }

      function resolveFromPath() {
        var location = path || ('wgt-private-tmp/' + name);
        tizen.filesystem.resolve(location, openFile, function (err) {
          reject(err || new Error('Could not read the downloaded API response.'));
        }, 'r');
      }

      tizen.filesystem.resolve('wgt-private-tmp', function (dir) {
        try {
          if (dir && dir.resolve) {
            openFile(dir.resolve(name));
            return;
          }
        } catch (err) { /* fall back to the full path */ }
        resolveFromPath();
      }, function () {
        resolveFromPath();
      }, 'r');
    });
  }

  function nativeDownloadOnce(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!canUseNativeDownload()) {
        reject(new Error('The TV native downloader is unavailable.'));
        return;
      }
      var name = 'perfectiptv_' + Date.now() + '_' + (++nativeFileSeq) + '.json';
      var settled = false;
      var downloadId = null;
      var timer = setTimeout(function () {
        try { if (downloadId) tizen.download.cancel(downloadId); } catch (err) { /* ignore */ }
        finish(new Error('The native download timed out.'));
      }, timeoutMs || 60000);

      function finish(err, text) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        deleteNativeFile(name);
        if (err) reject(err);
        else resolve(text);
      }

      var listener = {
        oncompleted: function (id, path) {
          readNativeFile(path, name).then(function (text) {
            finish(null, text);
          }).catch(function (err) {
            finish(err);
          });
        },
        onfailed: function (id, error) {
          var message = (error && (error.message || error.name)) || 'The native download failed.';
          finish(new Error(message));
        },
        oncanceled: function () {
          finish(new Error('The native download was canceled.'));
        }
      };

      try {
        var request = new tizen.DownloadRequest(url, 'wgt-private-tmp', name);
        try {
          request.httpHeader = request.httpHeader || {};
          request.httpHeader['Accept'] = 'application/json,text/plain,*/*';
          request.httpHeader['User-Agent'] = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/6.0 Chrome/108.0.0.0 TV Safari/537.36';
        } catch (headerErr) { /* headers are optional */ }
        downloadId = tizen.download.start(request, listener);
        if (downloadId === -1) finish(new Error('The TV has no network connection.'));
      } catch (err) {
        finish(err);
      }
    });
  }

  var nativeQueue = Promise.resolve();

  function nativeDownloadText(url, timeoutMs) {
    function run() { return nativeDownloadOnce(url, timeoutMs); }
    var result = nativeQueue.then(run, run);
    nativeQueue = result.then(function () { /* keep the queue alive */ }, function () { /* keep the queue alive */ });
    return result;
  }

  function parseApiText(text) {
    var data;
    try {
      data = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
    } catch (err) {
      throw new XtreamError('Your provider returned an invalid API response. Check the server URL and port.', 'json');
    }
    if (data && data.user_info && Number(data.user_info.auth) === 0) {
      throw new XtreamError('Login rejected. Check your username and password.', 'auth');
    }
    if (data && data.error) {
      throw new XtreamError(String(data.error), 'api');
    }
    return data;
  }

  Xtream.prototype.request = function (action, params, options) {
    options = options || {};
    var self = this;
    var url = this.apiUrl(action, params);

    function fetchOnce() {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, options.timeout || 30000);
      return fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': 'application/json,text/plain,*/*' }
      }).then(function (response) {
        if (!response.ok) {
          throw new XtreamError('Your provider returned HTTP ' + response.status + '.', 'http');
        }
        return response.text();
      }).catch(function (err) {
        if (err && err.name === 'AbortError') {
          throw new XtreamError('Your provider took too long to respond.', 'timeout');
        }
        if (err instanceof XtreamError) throw err;
        throw new XtreamError(
          'Could not reach your provider. This is usually a wrong server URL, a blocked network, or missing CORS support.',
          'network', err
        );
      }).finally(function () {
        clearTimeout(timeout);
      });
    }

    return fetchOnce().then(function (text) {
      IPTV.apiMode = self.proxy ? 'proxy' : 'direct';
      return parseApiText(text);
    }).catch(function (err) {
      var retryable = err instanceof XtreamError && (err.code === 'network' || err.code === 'timeout');
      if (!retryable || !canUseNativeDownload()) throw err;
      return nativeDownloadText(url, options.nativeTimeout || 60000).then(function (text) {
        IPTV.apiMode = 'native';
        return parseApiText(text);
      }).catch(function (nativeErr) {
        if (nativeErr instanceof XtreamError) throw nativeErr;
        throw new XtreamError(
          'Could not reach your provider. The TV could not fetch the API directly or through its native downloader. ' +
          'Check the server URL and network, or add a CORS proxy under Advanced options.',
          'network', nativeErr
        );
      });
    });
  };

  Xtream.prototype.authenticate = function () {
    var self = this;
    return this.request(null).then(function (data) {
      if (!data || !data.user_info) {
        throw new XtreamError('This server did not return an Xtream account. Check the URL.', 'auth');
      }
      var info = data.user_info;
      if (Number(info.auth) !== 1) {
        throw new XtreamError('Login rejected. Check your username and password.', 'auth');
      }
      var status = String(info.status || '').toLowerCase();
      if (status && status !== 'active' && status !== 'trial') {
        throw new XtreamError('This account is not active (' + (info.status || 'unknown') + ').', 'account');
      }
      var exp = Number(info.exp_date || 0);
      if (exp > 0 && exp * 1000 < Date.now()) {
        throw new XtreamError('This account expired on ' + fmtDate(exp) + '.', 'expired');
      }
      return {
        userInfo: info,
        serverInfo: data.server_info || {}
      };
    });
  };

  Xtream.prototype._cached = function (key, ttl, loader) {
    var now = Date.now();
    var hit = this._cache[key];
    if (hit && (now - hit.time) < ttl) return Promise.resolve(hit.value);
    var self = this;
    return loader().then(function (value) {
      self._cache[key] = { time: Date.now(), value: value };
      self._cacheOrder.push(key);
      if (self._cacheOrder.length > 40) {
        var oldest = self._cacheOrder.shift();
        delete self._cache[oldest];
      }
      return value;
    });
  };

  Xtream.prototype.clearCache = function () {
    this._cache = {};
    this._cacheOrder = [];
  };

  Xtream.prototype.getLiveCategories = function () {
    var self = this;
    return this._cached('liveCats', 10 * 60 * 1000, function () {
      return self.request('get_live_categories').then(function (d) {
        return Array.isArray(d) ? d : [];
      });
    });
  };

  Xtream.prototype.getLiveStreams = function (categoryId) {
    var self = this;
    var key = 'live:' + (categoryId || 'all');
    return this._cached(key, 3 * 60 * 1000, function () {
      var params = categoryId && categoryId !== 'all' ? { category_id: categoryId } : {};
      return self.request('get_live_streams', params).then(function (d) {
        return Array.isArray(d) ? d : [];
      });
    });
  };

  Xtream.prototype.getAllLiveStreams = function () {
    return this.getLiveStreams('all');
  };

  Xtream.prototype.getVodCategories = function () {
    var self = this;
    return this._cached('vodCats', 10 * 60 * 1000, function () {
      return self.request('get_vod_categories').then(function (d) { return Array.isArray(d) ? d : []; });
    });
  };

  Xtream.prototype.getVodStreams = function (categoryId) {
    var self = this;
    var key = 'vod:' + (categoryId || 'all');
    return this._cached(key, 3 * 60 * 1000, function () {
      var params = categoryId && categoryId !== 'all' ? { category_id: categoryId } : {};
      return self.request('get_vod_streams', params).then(function (d) { return Array.isArray(d) ? d : []; });
    });
  };

  Xtream.prototype.getAllVodStreams = function () { return this.getVodStreams('all'); };

  Xtream.prototype.getVodInfo = function (vodId) {
    var self = this;
    return this._cached('vodInfo:' + vodId, 10 * 60 * 1000, function () {
      return self.request('get_vod_info', { vod_id: vodId });
    });
  };

  Xtream.prototype.getSeriesCategories = function () {
    var self = this;
    return this._cached('seriesCats', 10 * 60 * 1000, function () {
      return self.request('get_series_categories').then(function (d) { return Array.isArray(d) ? d : []; });
    });
  };

  Xtream.prototype.getSeries = function (categoryId) {
    var self = this;
    var key = 'series:' + (categoryId || 'all');
    return this._cached(key, 3 * 60 * 1000, function () {
      var params = categoryId && categoryId !== 'all' ? { category_id: categoryId } : {};
      return self.request('get_series', params).then(function (d) { return Array.isArray(d) ? d : []; });
    });
  };

  Xtream.prototype.getAllSeries = function () { return this.getSeries('all'); };

  Xtream.prototype.getSeriesInfo = function (seriesId) {
    var self = this;
    return this._cached('seriesInfo:' + seriesId, 10 * 60 * 1000, function () {
      return self.request('get_series_info', { series_id: seriesId });
    });
  };

  function normalizeEpg(list) {
    if (!Array.isArray(list)) return [];
    function toMs(value) {
      var n = Number(value || 0);
      if (!n) return 0;
      // Some panels return seconds, a few return milliseconds.
      return n > 100000000000 ? n : n * 1000;
    }
    return list.map(function (item) {
      var start = toMs(item.start_timestamp);
      var end = toMs(item.stop_timestamp);
      if (!start && item.start) start = Date.parse(String(item.start).replace(' ', 'T'));
      if (!end && item.end) end = Date.parse(String(item.end).replace(' ', 'T'));
      return {
        id: item.id,
        title: b64Decode(item.title) || 'No program information',
        description: b64Decode(item.description) || '',
        start: start || 0,
        end: end || 0,
        nowPlaying: String(item.now_playing) === '1',
        hasArchive: String(item.has_archive) === '1'
      };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  Xtream.prototype.getShortEpg = function (streamId, limit) {
    var self = this;
    return this._cached('epg:' + streamId, 90 * 1000, function () {
      return self.request('get_short_epg', { stream_id: streamId, limit: limit || 8 }).then(function (d) {
        return normalizeEpg(d && d.epg_listings);
      }).catch(function (err) {
        // Many panels return an empty body for channels without EPG.
        if (err && err.code === 'json') return [];
        throw err;
      });
    });
  };

  Xtream.prototype.getFullEpg = function (streamId) {
    var self = this;
    return this._cached('fullEpg:' + streamId, 2 * 60 * 1000, function () {
      return self.request('get_simple_data_table', { stream_id: streamId }).then(function (d) {
        return normalizeEpg(d && d.epg_listings);
      }).catch(function (err) {
        if (err && err.code === 'json') return [];
        throw err;
      });
    });
  };

  Xtream.prototype.liveUrl = function (item, format) {
    if (item && item.direct_source) return item.direct_source;
    var id = typeof item === 'object' ? item.stream_id : item;
    var ext = format === 'ts' ? 'ts' : 'm3u8';
    return this.server + '/live/' + encodeURIComponent(this.username) + '/' +
      encodeURIComponent(this.password) + '/' + encodeURIComponent(id) + '.' + ext;
  };

  Xtream.prototype.vodUrl = function (item) {
    if (item && item.direct_source) return item.direct_source;
    var id = typeof item === 'object' ? item.stream_id : item;
    var ext = ((item && item.container_extension) || 'mp4').replace(/^\./, '');
    return this.server + '/movie/' + encodeURIComponent(this.username) + '/' +
      encodeURIComponent(this.password) + '/' + encodeURIComponent(id) + '.' + ext;
  };

  Xtream.prototype.seriesUrl = function (episode) {
    var id = episode.id || episode.stream_id;
    var ext = (episode.container_extension || 'mp4').replace(/^\./, '');
    return this.server + '/series/' + encodeURIComponent(this.username) + '/' +
      encodeURIComponent(this.password) + '/' + encodeURIComponent(id) + '.' + ext;
  };

  Xtream.prototype.catchupUrl = function (streamId, startMs, durationMinutes) {
    var d = new Date(startMs);
    var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ':' +
      pad(d.getHours()) + '-' + pad(d.getMinutes());
    return this.server + '/streaming/timeshift.php?username=' + encodeURIComponent(this.username) +
      '&password=' + encodeURIComponent(this.password) + '&stream=' + encodeURIComponent(streamId) +
      '&start=' + encodeURIComponent(stamp) + '&duration=' + encodeURIComponent(durationMinutes || 60);
  };

  Xtream.prototype.imageUrl = function (value) {
    return absUrl(this.server, value);
  };

  /* ---------------- exports ---------------- */

  IPTV.$ = $;
  IPTV.$$ = $$;
  IPTV.esc = esc;
  IPTV.icon = icon;
  IPTV.initials = initials;
  IPTV.fmtTime = fmtTime;
  IPTV.fmtClock = fmtClock;
  IPTV.fmtDuration = fmtDuration;
  IPTV.fmtPosition = fmtPosition;
  IPTV.fmtDate = fmtDate;
  IPTV.fmtAgo = fmtAgo;
  IPTV.SORT_OPTIONS = SORT_OPTIONS;
  IPTV.sortCatalog = sortCatalog;
  IPTV.sortLabel = sortLabel;
  IPTV.itemAddedMs = itemAddedMs;
  IPTV.b64Decode = b64Decode;
  IPTV.normalizeServer = normalizeServer;
  IPTV.parseProviderInput = parseProviderInput;
  IPTV.absUrl = absUrl;
  IPTV.hash = hash;
  IPTV.uid = uid;
  IPTV.debounce = debounce;
  IPTV.sleep = sleep;
  IPTV.storageGet = storageGet;
  IPTV.storageSet = storageSet;
  IPTV.storageRemove = storageRemove;
  IPTV.errorMessage = errorMessage;
  IPTV.Store = Store;
  IPTV.Xtream = Xtream;
  IPTV.XtreamError = XtreamError;
})();
