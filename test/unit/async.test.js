'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const async = require('../../js/lib/async.js');

test('debounce runs only the latest call', async () => {
  const calls = [];
  const fn = async.debounce((value) => calls.push(value), 20);
  fn('a');
  fn('b');
  fn('c');
  assert.deepEqual(calls, []);
  await async.sleep(100);
  assert.deepEqual(calls, ['c']);
});

test('debounce forwards the latest arguments and context', async () => {
  const target = {
    seen: null,
    run: async.debounce(function (value) { this.seen = value; }, 10)
  };
  target.run('ctx');
  await async.sleep(80);
  assert.equal(target.seen, 'ctx');
});

test('sleep resolves after a timer', async () => {
  const start = Date.now();
  await async.sleep(15);
  assert.ok(Date.now() - start >= 10, 'sleep should wait at least most of the delay');
});

test('errorMessage handles null, abort, and generic errors', () => {
  assert.equal(async.errorMessage(null), 'Something went wrong.');
  assert.equal(async.errorMessage({ name: 'AbortError' }), 'The server took too long to respond.');
  assert.equal(async.errorMessage(new Error('boom')), 'boom');
  assert.equal(async.errorMessage('plain'), 'plain');
});
