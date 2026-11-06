'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../../js/lib/format.js');

test('fmtDuration handles zero, minutes, hours, and invalid values', () => {
  assert.equal(format.fmtDuration(0), '—');
  assert.equal(format.fmtDuration(65), '1m');
  assert.equal(format.fmtDuration(3600), '1h 0m');
  assert.equal(format.fmtDuration(3725), '1h 2m');
  assert.equal(format.fmtDuration(-1), '0m');
  assert.equal(format.fmtDuration(NaN), '—');
});

test('fmtPosition pads minutes and seconds and supports hours', () => {
  assert.equal(format.fmtPosition(0), '00:00');
  assert.equal(format.fmtPosition(65), '01:05');
  assert.equal(format.fmtPosition(3725), '1:02:05');
  assert.equal(format.fmtPosition(-1), '00:00');
  assert.equal(format.fmtPosition(NaN), '00:00');
});

test('fmtTime supports 24-hour and 12-hour clocks', () => {
  const at = new Date(2024, 0, 1, 9, 5, 0).getTime();
  assert.equal(format.fmtTime(at, '24h'), '09:05');
  assert.equal(format.fmtTime(at, '12h'), '9:05 AM');
  const evening = new Date(2024, 0, 1, 21, 7, 0).getTime();
  assert.equal(format.fmtTime(evening, '24h'), '21:07');
  assert.equal(format.fmtTime(evening, '12h'), '9:07 PM');
  assert.equal(format.fmtTime(0), '--:--');
});

test('fmtClock defaults to now', () => {
  const fixed = new Date(2024, 0, 1, 0, 0, 0);
  assert.equal(format.fmtClock(fixed, '24h'), '00:00');
});

test('fmtDate accepts seconds and milliseconds', () => {
  assert.equal(format.fmtDate(0), '—');
  assert.equal(format.fmtDate('nope'), '—');
  const seconds = 1704160800;
  const millis = seconds * 1000;
  assert.equal(format.fmtDate(seconds), format.fmtDate(millis));
  assert.match(format.fmtDate(seconds), /2024/);
});

test('fmtAgo covers just now, minutes, hours, days, and older dates', () => {
  const now = Date.now();
  assert.equal(format.fmtAgo(0), '');
  assert.equal(format.fmtAgo(now), 'just now');
  assert.equal(format.fmtAgo(now - 5 * 60 * 1000), '5 min ago');
  assert.equal(format.fmtAgo(now - 2 * 60 * 60 * 1000), '2 hr ago');
  assert.equal(format.fmtAgo(now - 26 * 60 * 60 * 1000), 'yesterday');
  assert.equal(format.fmtAgo(now - 3 * 24 * 60 * 60 * 1000), '3 days ago');
});
