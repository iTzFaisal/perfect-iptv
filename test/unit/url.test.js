'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const url = require('../../js/lib/url.js');

test('normalizeServer accepts full URLs, bare hosts, ports, and trailing slashes', () => {
  assert.equal(url.normalizeServer('http://example.com:8080/player_api.php?username=x'), 'http://example.com:8080');
  assert.equal(url.normalizeServer('example.com:8080'), 'http://example.com:8080');
  assert.equal(url.normalizeServer('https://example.com/'), 'https://example.com');
  assert.equal(url.normalizeServer('https://example.com/foo/'), 'https://example.com/foo');
  assert.equal(url.normalizeServer('//example.com'), 'http://example.com');
});

test('normalizeServer is idempotent', () => {
  for (const input of ['https://example.com/', 'example.com:8080', 'http://example.com/foo/']) {
    const once = url.normalizeServer(input);
    assert.equal(url.normalizeServer(once), once, 'normalizing twice should not change ' + input);
  }
});

test('normalizeServer rejects empty and invalid input', () => {
  assert.throws(() => url.normalizeServer(''), /server URL/);
  assert.throws(() => url.normalizeServer('   '), /server URL/);
  assert.throws(() => url.normalizeServer('http://'), /does not look valid/);
});

test('parseProviderInput extracts credentials from an Xtream URL', () => {
  const parsed = url.parseProviderInput(
    'http://host.example:8080/get.php?username=user%20one&password=p%40ss'
  );
  assert.equal(parsed.server, 'http://host.example:8080');
  assert.equal(parsed.username, 'user one');
  assert.equal(parsed.password, 'p@ss');
});

test('parseProviderInput handles host only, ports, and trailing slashes', () => {
  assert.deepEqual(url.parseProviderInput('host.example:8080'), {
    server: 'http://host.example:8080', username: '', password: ''
  });
  assert.deepEqual(url.parseProviderInput('https://host.example/player_api.php'), {
    server: 'https://host.example', username: '', password: ''
  });
  assert.deepEqual(url.parseProviderInput(''), {
    server: '', username: '', password: ''
  });
});

test('absUrl resolves protocol-relative, relative, data, and absolute values', () => {
  assert.equal(url.absUrl('https://server', '/art.png'), 'https://server/art.png');
  assert.equal(url.absUrl('https://server/', 'art.png'), 'https://server/art.png');
  assert.equal(url.absUrl('https://server', '//cdn.example/art.png'), 'https://cdn.example/art.png');
  assert.equal(url.absUrl('http://server', '//cdn.example/art.png'), 'http://cdn.example/art.png');
  assert.equal(url.absUrl('https://server', 'data:image/png;base64,xx'), 'data:image/png;base64,xx');
  assert.equal(url.absUrl('https://server', 'https://cdn/art.png'), 'https://cdn/art.png');
  assert.equal(url.absUrl('https://server', ''), '');
});

test('hash is deterministic and uid values are unique', () => {
  assert.equal(url.hash('hello'), url.hash('hello'));
  assert.notEqual(url.hash('hello'), url.hash('world'));
  assert.match(url.hash('hello'), /^a[0-9a-z]+$/);

  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(url.uid());
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^a[0-9a-z]+$/);
});
