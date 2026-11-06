'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../../js/lib/history.js');

function map(entries) {
  const result = {};
  for (const [key, value] of Object.entries(entries)) result[key] = value;
  return result;
}

test('historyKey namespaces each media type', () => {
  assert.equal(history.historyKey('live', '101'), 'live:101');
  assert.equal(history.historyKey('series', '901:9111'), 'series:901:9111');
});

test('historyOf filters by type and sorts newest first', () => {
  const records = map({
    'live:101': { name: 'A', updated: 100 },
    'live:102': { name: 'B', updated: 300 },
    'vod:501': { name: 'C', updated: 200 }
  });
  assert.deepEqual(history.historyOf(records, 'live').map((r) => r.name), ['B', 'A']);
  assert.deepEqual(history.historyOf(records, 'vod').map((r) => r.name), ['C']);
  assert.deepEqual(history.historyOf({}, 'live'), []);
});

test('continueWatching dedupes series and keeps the latest episode', () => {
  const records = map({
    'series:901:9111': { seriesId: '901', episodeId: '9111', updated: 100 },
    'series:901:9112': { seriesId: '901', episodeId: '9112', updated: 300 },
    'series:902:9211': { seriesId: '902', episodeId: '9211', updated: 200 },
    'series::999': { episodeId: '999', updated: 400 }
  });
  const rows = history.continueWatching(records, 'series');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seriesId, '901');
  assert.equal(rows[0].episodeId, '9112');
  assert.equal(rows[1].seriesId, '902');
});

test('continueWatching does not dedupe live or movies', () => {
  const records = map({
    'live:101': { stream_id: 101, updated: 100 },
    'live:101:again': { stream_id: 101, updated: 200 },
    'vod:501': { stream_id: 501, updated: 100 }
  });
  assert.equal(history.continueWatching(records, 'live').length, 2);
  assert.equal(history.continueWatching(records, 'vod').length, 1);
});

test('latestFor matches live/movie ids and series ids', () => {
  const records = map({
    'live:101': { stream_id: 101, updated: 100 },
    'live:102': { stream_id: 102, updated: 300 },
    'series:901:9111': { seriesId: '901', episodeId: '9111', updated: 100 },
    'series:901:9112': { seriesId: '901', episodeId: '9112', updated: 300 }
  });
  assert.equal(history.latestFor(records, 'live', '102').updated, 300);
  assert.equal(history.latestFor(records, 'live', 102).updated, 300);
  assert.equal(history.latestFor(records, 'series', 901).episodeId, '9112');
  assert.equal(history.latestFor(records, 'live', 'missing'), null);
});

test('trimHistory removes the oldest rows above the limit', () => {
  const records = {};
  for (let i = 1; i <= 5; i++) records['live:' + i] = { stream_id: i, updated: i };
  history.trimHistory(records, 3);
  assert.deepEqual(Object.keys(records).sort(), ['live:3', 'live:4', 'live:5']);
  history.trimHistory(records, 10);
  assert.equal(Object.keys(records).length, 3);
  assert.deepEqual(history.trimHistory({}, 3), {});
});
