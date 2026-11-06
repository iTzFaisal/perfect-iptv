/* @requires: none
   @exports: IPTV.historyKey, IPTV.historyOf, IPTV.continueWatching,
             IPTV.latestFor, IPTV.trimHistory */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function historyKey(type, id) { return type + ':' + id; }

  function historyOf(history, type) {
    var prefix = type + ':';
    return Object.keys(history || {})
      .filter(function (key) { return key.indexOf(prefix) === 0; })
      .map(function (key) { return history[key]; })
      .filter(Boolean)
      .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
  }

  // Series history stores one row per episode. Continue watching should show
  // one card per series, using the most recently watched episode.
  function continueWatching(history, type) {
    var records = historyOf(history, type);
    if (type !== 'series') return records;
    var seen = {};
    return records.filter(function (record) {
      var id = String(record.seriesId || '');
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function latestFor(history, type, id) {
    id = String(id);
    return historyOf(history, type).find(function (record) {
      if (type === 'series') return String(record.seriesId) === id;
      return String(record.stream_id || record.id) === id;
    }) || null;
  }

  function trimHistory(history, max) {
    max = max || 60;
    var keys = Object.keys(history || {});
    if (keys.length > max) {
      keys.sort(function (a, b) { return (history[a].updated || 0) - (history[b].updated || 0); });
      keys.slice(0, keys.length - max).forEach(function (key) { delete history[key]; });
    }
    return history;
  }

  return {
    historyKey: historyKey,
    historyOf: historyOf,
    continueWatching: continueWatching,
    latestFor: latestFor,
    trimHistory: trimHistory
  };
});
