'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const seek = require('../../js/lib/seek.js');

test('short taps stay at the base seek step', () => {
  assert.equal(seek.distanceAt(0), 0);
  assert.equal(seek.distanceAt(seek.HOLD_DELAY_MS - 1), 0);
  assert.equal(seek.speedAt(seek.HOLD_DELAY_MS - 1), 0);
});

test('holding accelerates through increasing speeds', () => {
  assert.equal(seek.speedAt(seek.HOLD_DELAY_MS), 8);
  assert.equal(seek.speedAt(seek.HOLD_DELAY_MS + 400), 16);
  assert.equal(seek.speedAt(seek.HOLD_DELAY_MS + 2400), 512);
  assert.ok(seek.speedAt(4000) >= seek.speedAt(1500), 'speed never decreases while held');
});

test('distance grows smoothly and faster over time', () => {
  const oneSecond = seek.distanceAt(1000);
  const twoSeconds = seek.distanceAt(2000);
  const fiveSeconds = seek.distanceAt(5000);
  assert.ok(oneSecond > 0, 'hold should add distance after the delay');
  assert.ok(twoSeconds > oneSecond, 'distance should keep growing');
  assert.ok(fiveSeconds > twoSeconds * 2, 'later hold time should sweep faster');
  assert.ok(fiveSeconds > 600, 'five seconds of hold should cover more than ten minutes');
});

test('clamp keeps seeks inside the media', () => {
  assert.equal(seek.clamp(-5, 100), 0);
  assert.equal(seek.clamp(50, 100), 50);
  assert.equal(seek.clamp(500, 100), 99);
  assert.equal(seek.clamp(500, 0), 500);
});
