/* @requires: none
   @exports: IPTV.SORT_OPTIONS, IPTV.toTimestampMs, IPTV.itemAddedMs,
             IPTV.compareNames, IPTV.sortCatalog, IPTV.sortLabel,
             IPTV.applyCatalogSort, IPTV.recentList, IPTV.filterList,
             IPTV.RECENT_LIMIT */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var RECENT_LIMIT = 200;

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

  // Mutates the section state the same way the controller always has.
  function applyCatalogSort(state, type) {
    state.items = sortCatalog(state.rawItems || [], state.sort, type);
    return state.items;
  }

  function recentList(list, type, limit) {
    return sortCatalog(list || [], 'recent', type).slice(0, limit || RECENT_LIMIT);
  }

  function filterList(list, query, limit) {
    var q = String(query || '').toLowerCase();
    return (list || []).filter(function (item) {
      return String(item.name || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, limit || 120);
  }

  return {
    RECENT_LIMIT: RECENT_LIMIT,
    SORT_OPTIONS: SORT_OPTIONS,
    toTimestampMs: toTimestampMs,
    itemAddedMs: itemAddedMs,
    compareNames: compareNames,
    sortCatalog: sortCatalog,
    sortLabel: sortLabel,
    applyCatalogSort: applyCatalogSort,
    recentList: recentList,
    filterList: filterList
  };
});
