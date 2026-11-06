/* @requires: IPTV.b64Decode, IPTV.fmtDate
   @exports: IPTV.Xtream, IPTV.XtreamError, IPTV.parseApiText, IPTV.normalizeEpg */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function decode(value) {
    var fn = root.IPTV && root.IPTV.b64Decode;
    return typeof fn === 'function' ? fn(value) : String(value || '');
  }

  function formatDate(timestamp) {
    var fn = root.IPTV && root.IPTV.fmtDate;
    if (typeof fn === 'function') return fn(timestamp);
    var ms = Number(timestamp || 0);
    if (ms < 100000000000) ms *= 1000;
    var date = new Date(ms);
    return isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
  }

  function XtreamError(message, code, cause) {
    this.name = 'XtreamError';
    this.message = message;
    this.code = code || 'error';
    this.cause = cause || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, XtreamError);
  }
  XtreamError.prototype = Object.create(Error.prototype);
  XtreamError.prototype.constructor = XtreamError;

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
        title: decode(item.title) || 'No program information',
        description: decode(item.description) || '',
        start: start || 0,
        end: end || 0,
        nowPlaying: String(item.now_playing) === '1',
        hasArchive: String(item.has_archive) === '1'
      };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function Xtream(account, options) {
    account = account || {};
    options = options || {};
    this.account = account;
    this.server = String(account.server || '').replace(/\/+$/, '');
    this.username = account.username || '';
    this.password = account.password || '';
    this.proxy = String(account.proxy || '').replace(/\/+$/, '');
    this._cache = {};
    this._cacheOrder = [];
    this._fetch = options.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    this._nativeDownload = options.nativeDownload || null;
    this._canNative = options.canNative || null;
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

  Xtream.prototype.request = function (action, params, options) {
    options = options || {};
    var self = this;
    var url = this.apiUrl(action, params);

    function fetchOnce() {
      if (!self._fetch) {
        return Promise.reject(new XtreamError(
          'Could not reach your provider. This is usually a wrong server URL, a blocked network, or missing CORS support.',
          'network'
        ));
      }
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, options.timeout || 30000);
      return self._fetch(url, {
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
      if (root.IPTV) root.IPTV.apiMode = self.proxy ? 'proxy' : 'direct';
      return parseApiText(text);
    }).catch(function (err) {
      var retryable = err instanceof XtreamError && (err.code === 'network' || err.code === 'timeout');
      var injected = typeof self._nativeDownload === 'function';
      var nativeFn = self._nativeDownload || (root.IPTV && root.IPTV.nativeDownloadText);
      if (!retryable || typeof nativeFn !== 'function' || (!injected && !self.canUseNativeDownload())) throw err;
      return nativeFn(url, options.nativeTimeout || 60000).then(function (text) {
        if (root.IPTV) root.IPTV.apiMode = 'native';
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

  Xtream.prototype.canUseNativeDownload = function () {
    if (typeof this._canNative === 'function') return !!this._canNative();
    var fn = root.IPTV && root.IPTV.canUseNativeDownload;
    return typeof fn === 'function' ? !!fn() : false;
  };

  Xtream.prototype.authenticate = function () {
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
        throw new XtreamError('This account expired on ' + formatDate(exp) + '.', 'expired');
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
    var abs = root.IPTV && root.IPTV.absUrl;
    if (typeof abs === 'function') return abs(this.server, value);
    var url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return this.server + '/' + url.replace(/^\/+/, '');
  };

  return {
    Xtream: Xtream,
    XtreamError: XtreamError,
    parseApiText: parseApiText,
    normalizeEpg: normalizeEpg
  };
});
