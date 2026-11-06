'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStorage } = require('./helpers/memory-storage.js');
require('../../js/lib/url.js');
require('../../js/lib/history.js');
const storeModule = require('../../js/lib/store.js');

const PREFIX = 'perfectiptv.v1.';

function freshStore(initial) {
  const backend = createMemoryStorage(initial);
  return { backend, store: storeModule.createStore(backend) };
}

test('account save/load round-trips and uses the v1 key prefix', () => {
  const { backend, store } = freshStore();
  store.addAccount({
    name: 'Mock Provider', server: 'http://localhost:4173',
    username: 'demo', password: 'demo'
  });
  store.saveSettings();

  const keys = Object.keys(backend.dump()).sort();
  assert.deepEqual(keys, [PREFIX + 'accounts', PREFIX + 'activeId', PREFIX + 'settings']);
  assert.equal(Object.keys(backend.dump()).some((key) => !key.startsWith(PREFIX)), false);

  const loaded = storeModule.createStore(backend);
  loaded.load();
  assert.equal(loaded.accounts.length, 1);
  assert.equal(loaded.activeAccount().name, 'Mock Provider');
  assert.equal(loaded.activeId, store.activeId);
  assert.equal(loaded.settings.textSize, 'standard');
});

test('adding the same server and username updates the existing account', () => {
  const { store } = freshStore();
  const first = store.addAccount({ server: 'http://h', username: 'u', password: 'p', name: 'Old' });
  const second = store.addAccount({ server: 'http://h', username: 'u', password: 'new', name: 'New' });
  assert.equal(first.id, second.id);
  assert.equal(store.accounts.length, 1);
  assert.equal(store.activeAccount().name, 'New');
  assert.equal(store.activeAccount().password, 'new');
});

test('corrupt localStorage JSON falls back to defaults', () => {
  const { store } = freshStore({
    [PREFIX + 'accounts']: '{not json',
    [PREFIX + 'activeId']: 'broken',
    [PREFIX + 'favorites']: 'not json',
    [PREFIX + 'history']: 'not json',
    [PREFIX + 'settings']: 'not json'
  });
  store.load();
  assert.deepEqual(store.accounts, []);
  assert.equal(store.activeId, null);
  assert.deepEqual(store.favorites, { live: {}, vod: {}, series: {} });
  assert.deepEqual(store.history, {});
  assert.equal(store.settings.textSize, 'standard');
  assert.equal(store.settings.playerEngine, 'auto');
});

test('settings merge stored values over defaults', () => {
  const { backend, store } = freshStore();
  store.settings.timeFormat = '12h';
  store.settings.textSize = 'large';
  store.saveSettings();

  const loaded = storeModule.createStore(backend);
  loaded.load();
  assert.equal(loaded.settings.timeFormat, '12h');
  assert.equal(loaded.settings.textSize, 'large');
  assert.equal(loaded.settings.streamFormat, 'm3u8');
});

test('favorites toggle, persist, and update the snapshot', () => {
  const { backend, store } = freshStore();
  const movie = {
    stream_id: 501, name: 'Nightfall', stream_icon: '/art.png',
    container_extension: 'mkv', rating: '7.2', year: '2024'
  };
  assert.equal(store.toggleFavorite('vod', movie), true);
  assert.equal(store.isFavorite('vod', 501), true);
  assert.equal(store.favoritesOf('vod').length, 1);
  assert.equal(store.favoritesOf('vod')[0].container_extension, 'mkv');

  const loaded = storeModule.createStore(backend);
  loaded.load();
  assert.equal(loaded.isFavorite('vod', '501'), true);
  assert.equal(loaded.toggleFavorite('vod', movie), false);
  assert.equal(loaded.isFavorite('vod', 501), false);
});

test('history writes one row per episode and keeps the 60 newest', () => {
  const { store } = freshStore();
  for (let i = 1; i <= 65; i++) {
    store.setHistory('live', String(i), { stream_id: i, name: 'Channel ' + i });
  }
  assert.equal(Object.keys(store.history).length, 60);
  assert.equal(store.getHistory('live', '1'), null);
  assert.ok(store.getHistory('live', '65'));

  store.setHistory('series', '901:9111', {
    seriesId: '901', episodeId: '9111', season: 1, episode: 1, name: 'The Division'
  });
  assert.equal(store.continueWatching('series').length, 1);
  assert.equal(store.latestFor('series', '901').episodeId, '9111');
  assert.equal(store.getHistory('series', '901:9111').episode, 1);
});

test('removing one account keeps shared favorites and history', () => {
  const { store } = freshStore();
  const a = store.addAccount({ server: 'http://a', username: 'a', password: 'a', name: 'A' });
  const b = store.addAccount({ server: 'http://b', username: 'b', password: 'b', name: 'B' });
  store.toggleFavorite('live', { stream_id: 101, name: 'World News 24' });
  store.setHistory('live', '101', { stream_id: 101, name: 'World News 24' });

  store.removeAccount(a.id);
  assert.equal(store.accounts.length, 1);
  assert.equal(store.activeId, b.id);
  assert.equal(store.isFavorite('live', 101), true);
  assert.ok(store.getHistory('live', '101'));

  store.removeAccount(b.id);
  assert.equal(store.accounts.length, 0);
  assert.equal(store.activeId, null);
  assert.equal(store.isFavorite('live', 101), false);
  assert.equal(store.getHistory('live', '101'), null);
});

test('load clears an activeId that no longer has an account', () => {
  const { backend } = freshStore();
  backend.setItem(PREFIX + 'accounts', JSON.stringify([]));
  backend.setItem(PREFIX + 'activeId', JSON.stringify('missing'));
  const store = storeModule.createStore(backend);
  store.load();
  assert.equal(store.activeId, null);
  assert.equal(backend.getItem(PREFIX + 'activeId'), null);
});

test('setActive only accepts known account ids', () => {
  const { store } = freshStore();
  const account = store.addAccount({ server: 'http://h', username: 'u', password: 'p', name: 'One' });
  assert.equal(store.setActive('missing'), false);
  assert.equal(store.setActive(account.id), true);
  assert.equal(store.activeId, account.id);
});
