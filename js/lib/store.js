/* @requires: IPTV.uid, IPTV.historyKey, IPTV.historyOf, IPTV.continueWatching,
               IPTV.latestFor, IPTV.trimHistory
   @exports: IPTV.Store, IPTV.DEFAULT_SETTINGS, IPTV.createStore,
             IPTV.storageGet, IPTV.storageSet, IPTV.storageRemove */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var PREFIX = 'perfectiptv.v1.';

  var DEFAULT_SETTINGS = {
    timeFormat: '24h',
    textSize: 'standard',   // standard | large | xlarge
    playerEngine: 'auto',   // auto | avplay | html5
    streamFormat: 'm3u8',   // m3u8 | ts
    autoplay: true,
    reduceMotion: false
  };

  function sharedFn(name) {
    var fn = root.IPTV && root.IPTV[name];
    if (typeof fn !== 'function') {
      throw new Error('Missing IPTV.' + name + ' — check js/lib script order in index.html');
    }
    return fn;
  }

  function memoryBackend() {
    var data = {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) { data[key] = String(value); },
      removeItem: function (key) { delete data[key]; }
    };
  }

  function browserBackend() {
    try {
      // `globalThis.localStorage` exists in newer Node versions as an
      // experimental getter that warns when touched. The browser runtime is
      // the only place this adapter should activate.
      if (!root.document) return null;
      if (root.localStorage) {
        var probe = PREFIX + '__probe__';
        root.localStorage.setItem(probe, '1');
        root.localStorage.removeItem(probe);
        return root.localStorage;
      }
    } catch (err) { /* private mode or blocked storage */ }
    return null;
  }

  function wrapBackend(backend) {
    return {
      get: function (key) {
        try { return backend.getItem(PREFIX + key); } catch (err) { return null; }
      },
      set: function (key, value) {
        try {
          backend.setItem(PREFIX + key, JSON.stringify(value));
          return true;
        } catch (err) { return false; }
      },
      remove: function (key) {
        try { backend.removeItem(PREFIX + key); } catch (err) { /* ignore */ }
      }
    };
  }

  function createStore(backend) {
    var storage = wrapBackend(backend || browserBackend() || memoryBackend());

    function storageGet(key, fallback) {
      try {
        var raw = storage.get(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (err) { return fallback; }
    }

    function storageSet(key, value) { return storage.set(key, value); }
    function storageRemove(key) { storage.remove(key); }

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
        account.id = account.id || sharedFn('uid')();
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

      historyKey: function (type, id) { return sharedFn('historyKey')(type, id); },

      getHistory: function (type, id) {
        return this.history[this.historyKey(type, id)] || null;
      },

      setHistory: function (type, id, data) {
        this.history[this.historyKey(type, id)] = Object.assign({ updated: Date.now() }, data);
        sharedFn('trimHistory')(this.history, 60);
        this.saveHistory();
      },

      historyOf: function (type) {
        return sharedFn('historyOf')(this.history, type);
      },

      // Series history stores one row per episode. Continue watching should show
      // one card per series, using the most recently watched episode.
      continueWatching: function (type) {
        return sharedFn('continueWatching')(this.history, type);
      },

      latestFor: function (type, id) {
        return sharedFn('latestFor')(this.history, type, id);
      },

      clearHistory: function () {
        this.history = {};
        this.saveHistory();
      }
    };

    return Store;
  }

  var defaultStore = createStore(browserBackend());

  function storageGet(key, fallback) {
    try {
      var backend = browserBackend();
      if (!backend) return fallback;
      var raw = backend.getItem(PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) { return fallback; }
  }

  function storageSet(key, value) {
    try {
      var backend = browserBackend();
      if (!backend) return false;
      backend.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) { return false; }
  }

  function storageRemove(key) {
    try {
      var backend = browserBackend();
      if (!backend) return;
      backend.removeItem(PREFIX + key);
    } catch (err) { /* ignore */ }
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    createStore: createStore,
    Store: defaultStore,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove
  };
});
