'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../js/lib/catalog.js');
const liveStreams = require('./fixtures/live-streams.json');
const vodStreams = require('./fixtures/vod-streams.json');

test('sortCatalog keeps provider order for default and unknown sorts', () => {
  assert.deepEqual(catalog.sortCatalog(liveStreams, 'default').map((i) => i.name),
    ['World News 24', 'Arena Sports']);
  assert.deepEqual(catalog.sortCatalog(liveStreams, 'unknown').map((i) => i.name),
    ['World News 24', 'Arena Sports']);
  assert.deepEqual(catalog.sortCatalog(null, 'name-asc'), []);
});

test('sortCatalog sorts A-Z and Z-A without mutating the input', () => {
  const original = vodStreams.map((i) => i.name);
  assert.deepEqual(catalog.sortCatalog(vodStreams, 'name-asc').map((i) => i.name),
    ['Nightfall', 'The Last Orbit']);
  assert.deepEqual(catalog.sortCatalog(vodStreams, 'name-desc').map((i) => i.name),
    ['The Last Orbit', 'Nightfall']);
  assert.deepEqual(vodStreams.map((i) => i.name), original);
});

test('sortCatalog keeps equal names stable', () => {
  const equal = [{ name: 'Same', id: 1 }, { name: 'Same', id: 2 }, { name: 'Same', id: 3 }];
  assert.deepEqual(catalog.sortCatalog(equal, 'name-asc').map((i) => i.id), [1, 2, 3]);
  assert.deepEqual(catalog.sortCatalog(equal, 'name-desc').map((i) => i.id), [1, 2, 3]);
});

test('recent sort uses added timestamps and series last_modified', () => {
  assert.deepEqual(catalog.sortCatalog(vodStreams, 'recent').map((i) => i.name),
    ['The Last Orbit', 'Nightfall']);

  const series = [
    { name: 'Old', last_modified: '1700000000' },
    { name: 'New', last_modified: '1710000000' },
    { name: 'No date' }
  ];
  assert.deepEqual(catalog.sortCatalog(series, 'recent', 'series').map((i) => i.name),
    ['New', 'Old', 'No date']);
});

test('itemAddedMs understands seconds, milliseconds, and date strings', () => {
  assert.equal(catalog.itemAddedMs({ added: '1700000000' }), 1700000000000);
  assert.equal(catalog.itemAddedMs({ added: 1700000000000 }), 1700000000000);
  assert.equal(catalog.itemAddedMs({ added: '2023-11-14 22:13:20' }),
    Date.parse('2023-11-14T22:13:20'));
  assert.equal(catalog.itemAddedMs(null), 0);
  assert.equal(catalog.itemAddedMs({}), 0);
});

test('recentList truncates at the recent limit', () => {
  const items = Array.from({ length: 250 }, (_, i) => ({
    name: 'Item ' + i,
    added: String(1700000000 + i)
  }));
  const recent = catalog.recentList(items, 'vod');
  assert.equal(recent.length, catalog.RECENT_LIMIT);
  assert.equal(recent.length, 200);
  assert.equal(recent[0].name, 'Item 249');
  assert.equal(recent[199].name, 'Item 50');
  assert.equal(catalog.recentList(items, 'vod', 5).length, 5);
});

test('applyCatalogSort updates section state in place', () => {
  const state = { rawItems: liveStreams, sort: 'name-asc', items: [] };
  const result = catalog.applyCatalogSort(state, 'live');
  assert.equal(result, state.items);
  assert.deepEqual(state.items.map((i) => i.name), ['Arena Sports', 'World News 24']);
});

test('filterList is case-insensitive and limited', () => {
  const list = liveStreams.concat([{ name: 'Arena Two' }, { name: 'Arena Three' }]);
  assert.deepEqual(catalog.filterList(list, 'arena').map((i) => i.name),
    ['Arena Sports', 'Arena Two', 'Arena Three']);
  assert.deepEqual(catalog.filterList(list, 'ARENA', 1).map((i) => i.name), ['Arena Sports']);
  assert.deepEqual(catalog.filterList(list, 'missing'), []);
  assert.deepEqual(catalog.filterList(null, 'x'), []);
});

test('sortLabel returns long and short labels with a default', () => {
  assert.equal(catalog.sortLabel('name-asc'), 'Name A–Z');
  assert.equal(catalog.sortLabel('name-asc', true), 'Sort: A–Z');
  assert.equal(catalog.sortLabel('missing'), 'Default order');
  assert.equal(catalog.SORT_OPTIONS.length, 4);
});
