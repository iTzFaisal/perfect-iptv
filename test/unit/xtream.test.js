'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('../../js/lib/text.js');
require('../../js/lib/format.js');
require('../../js/lib/url.js');
const xtream = require('../../js/lib/xtream.js');
const liveStreams = require('./fixtures/live-streams.json');
const vodStreams = require('./fixtures/vod-streams.json');
const seriesInfo = require('./fixtures/series-info.json');

const malformed = fs.readFileSync(path.join(__dirname, 'fixtures', 'malformed.txt'), 'utf8');

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof value === 'string' ? value : JSON.stringify(value))
  };
}

test('apiUrl builds encoded Xtream URLs and skips empty params', () => {
  const api = new xtream.Xtream({
    server: 'http://host:8080/', username: 'user name', password: 'p@ss'
  });
  assert.equal(api.apiUrl(null),
    'http://host:8080/player_api.php?username=user%20name&password=p%40ss');
  assert.equal(api.apiUrl('get_live_streams', { category_id: '1', empty: '', missing: null }),
    'http://host:8080/player_api.php?username=user%20name&password=p%40ss' +
    '&action=get_live_streams&category_id=1');
});

test('apiUrl routes through the optional proxy', () => {
  const api = new xtream.Xtream({
    server: 'http://host:8080', username: 'u', password: 'p', proxy: 'http://proxy/'
  });
  const built = api.apiUrl('get_series');
  // The proxy URL is normalized without its trailing slash.
  assert.match(built, /^http:\/\/proxy\?url=/);
  assert.equal(decodeURIComponent(built.split('url=')[1]),
    'http://host:8080/player_api.php?username=u&password=p&action=get_series');
});

test('liveUrl, vodUrl, and seriesUrl encode ids and extensions', () => {
  const api = new xtream.Xtream({ server: 'http://host:8080', username: 'u', password: 'p' });
  assert.equal(api.liveUrl({ stream_id: 101 }, 'm3u8'),
    'http://host:8080/live/u/p/101.m3u8');
  assert.equal(api.liveUrl(101, 'ts'), 'http://host:8080/live/u/p/101.ts');
  assert.equal(api.liveUrl({ stream_id: 101, direct_source: 'http://direct/1' }), 'http://direct/1');
  assert.equal(api.vodUrl({ stream_id: '501', container_extension: '.mkv' }),
    'http://host:8080/movie/u/p/501.mkv');
  assert.equal(api.vodUrl({ stream_id: 501 }), 'http://host:8080/movie/u/p/501.mp4');
  assert.equal(api.seriesUrl({ id: '9111', container_extension: 'mkv' }),
    'http://host:8080/series/u/p/9111.mkv');
  assert.equal(api.seriesUrl({ stream_id: 9112 }), 'http://host:8080/series/u/p/9112.mp4');
});

test('catchupUrl contains an encoded local timestamp and duration', () => {
  const api = new xtream.Xtream({ server: 'http://host:8080', username: 'u', password: 'p' });
  const start = new Date(2024, 0, 2, 3, 4, 0).getTime();
  const url = api.catchupUrl(101, start, 60);
  assert.match(url, /^http:\/\/host:8080\/streaming\/timeshift\.php\?/);
  assert.match(url, /[?&]stream=101/);
  assert.match(url, /[?&]duration=60/);
  assert.equal(decodeURIComponent(url.split('start=')[1].split('&')[0]), '2024-01-02:03-04');
});

test('imageUrl resolves relative art and leaves missing icons empty', () => {
  const api = new xtream.Xtream({ server: 'https://host', username: 'u', password: 'p' });
  assert.equal(api.imageUrl('/art.png'), 'https://host/art.png');
  assert.equal(api.imageUrl('https://cdn/art.png'), 'https://cdn/art.png');
  assert.equal(api.imageUrl(''), '');
  assert.equal(api.imageUrl(null), '');
});

test('parseApiText accepts BOM JSON and rejects malformed payloads', () => {
  assert.deepEqual(xtream.parseApiText('\uFEFF{"ok":true}'), { ok: true });
  assert.throws(() => xtream.parseApiText(malformed), (err) => {
    assert.ok(err instanceof xtream.XtreamError);
    assert.equal(err.code, 'json');
    return true;
  });
  assert.throws(() => xtream.parseApiText(JSON.stringify({ user_info: { auth: 0 } })), /Login rejected/);
  assert.throws(() => xtream.parseApiText(JSON.stringify({ error: 'bad panel' })), /bad panel/);
});

test('normalizeEpg decodes base64, sorts by start, and handles empty data', () => {
  assert.deepEqual(xtream.normalizeEpg(undefined), []);
  assert.deepEqual(xtream.normalizeEpg(require('./fixtures/epg-empty.json').epg_listings), []);

  const listings = xtream.normalizeEpg([
    {
      id: 2, title: Buffer.from('Later').toString('base64'),
      description: Buffer.from('Second').toString('base64'),
      start_timestamp: '1700003600', stop_timestamp: '1700007200',
      now_playing: '0', has_archive: '1'
    },
    {
      id: 1, title: Buffer.from('Now').toString('base64'),
      start_timestamp: '1700000000', stop_timestamp: '1700003600',
      now_playing: '1', has_archive: '0'
    },
    { id: 3 }
  ]);
  assert.deepEqual(listings.map((item) => item.id), [3, 1, 2]);
  assert.equal(listings[1].title, 'Now');
  assert.equal(listings[2].description, 'Second');
  assert.equal(listings[0].title, 'No program information');
  assert.equal(listings[1].start, 1700000000000);
  assert.equal(listings[1].nowPlaying, true);
  assert.equal(listings[2].hasArchive, true);
});

test('authenticate returns user and server info', async () => {
  const api = new xtream.Xtream({ server: 'http://host', username: 'u', password: 'p' }, {
    fetch: async () => jsonResponse({
      user_info: { auth: 1, status: 'Active', exp_date: '9999999999' },
      server_info: { timezone: 'UTC' }
    })
  });
  const auth = await api.authenticate();
  assert.equal(auth.userInfo.status, 'Active');
  assert.equal(auth.serverInfo.timezone, 'UTC');
});

test('authenticate rejects inactive and expired accounts', async () => {
  const inactive = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => jsonResponse({ user_info: { auth: 1, status: 'Banned' } })
  });
  await assert.rejects(inactive.authenticate(), /not active/);

  const expired = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => jsonResponse({ user_info: { auth: 1, status: 'Active', exp_date: '1000000000' } })
  });
  await assert.rejects(expired.authenticate(), /expired/);
});

test('request maps HTTP and network failures to XtreamError codes', async () => {
  const http = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => jsonResponse({}, 503)
  });
  await assert.rejects(http.request('get_series'), (err) => {
    assert.equal(err.code, 'http');
    return true;
  });

  const network = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    canNative: () => false
  });
  await assert.rejects(network.request('get_series'), (err) => {
    assert.equal(err.code, 'network');
    assert.match(err.message, /CORS/);
    return true;
  });
});

test('request retries through the injected native downloader', async () => {
  let nativeUrl = null;
  const api = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => { throw new TypeError('Simulated CORS failure'); },
    nativeDownload: async (url) => {
      nativeUrl = url;
      return JSON.stringify(liveStreams);
    },
    canNative: () => true
  });
  const list = await api.request('get_live_streams');
  assert.equal(list.length, 2);
  assert.match(nativeUrl, /action=get_live_streams/);
  assert.equal(globalThis.IPTV.apiMode, 'native');
});

test('catalog getters normalize arrays and reuse the cache', async () => {
  let calls = 0;
  const api = new xtream.Xtream({ server: 'http://h', username: 'u', password: 'p' }, {
    fetch: async () => {
      calls++;
      return jsonResponse({ not: 'an array' });
    }
  });
  assert.deepEqual(await api.getLiveCategories(), []);
  assert.deepEqual(await api.getLiveCategories(), []);
  assert.equal(calls, 1);
});

test('vod and series fixtures have the shapes the app expects', () => {
  assert.equal(String(vodStreams[0].stream_id), '501');
  assert.equal(typeof vodStreams[1].stream_id, 'number');
  assert.equal(seriesInfo.episodes['1'].length, 2);
  assert.equal(String(seriesInfo.episodes['1'][1].id), '9112');
  assert.equal(liveStreams[1].stream_icon, '');
});
