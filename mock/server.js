/* Local mock Xtream Codes provider for UI testing. Run: node mock/server.js */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

const liveCategories = [
  { category_id: '1', category_name: 'News & World', parent_id: 0 },
  { category_id: '2', category_name: 'Sports', parent_id: 0 },
  { category_id: '3', category_name: 'Entertainment', parent_id: 0 },
  { category_id: '4', category_name: 'Kids', parent_id: 0 },
  { category_id: '5', category_name: 'Music', parent_id: 0 }
];

const channelNames = [
  ['World News 24', '1', 1], ['Global Update', '1', 1], ['Business Today', '1', 0],
  ['Arena Sports', '2', 1], ['Football Live', '2', 1], ['Extreme Sports', '2', 0],
  ['Cinema One', '3', 1], ['Drama Central', '3', 0], ['Comedy Club', '3', 1],
  ['Kids Planet', '4', 0], ['Cartoon Universe', '4', 0], ['Little Learners', '4', 0],
  ['Hits Radio TV', '5', 0], ['Classic Clips', '5', 0], ['Fresh Music', '5', 0],
  ['Docu World', '3', 0], ['Nature HD', '3', 0], ['Travel & Taste', '3', 0],
  ['24/7 Movies', '3', 1], ['Sports Extra', '2', 0], ['Newsroom', '1', 0],
  ['Retro TV', '3', 0]
];

const liveStreams = channelNames.map(([name, category, archive], i) => ({
  num: i + 1,
  name,
  stream_type: 'live',
  stream_id: 101 + i,
  stream_icon: i === 3 ? '' : '/art?k=live&t=' + encodeURIComponent(name) + '&i=' + (i + 1),
  epg_channel_id: 'ch' + (i + 1),
  added: String(1700000000 + i * 3600),
  category_id: category,
  custom_sid: '',
  tv_archive: archive,
  direct_source: '',
  tv_archive_duration: archive ? 7 : 0
}));

const movieTitles = [
  'Nightfall', 'The Last Orbit', 'Desert Run', 'Neon Harbor', 'Silent Signal',
  'Paper Kingdom', 'North of Nowhere', 'The Glass Hour', 'Wild Current', 'After the Rain',
  'Crimson Sky', 'Small Miracles', 'The Long Road', 'Echoes', 'Midnight Diner',
  'Ocean Floor', 'The Cartographer', 'Bright Side'
];
const movieCategories = [
  { category_id: '10', category_name: 'Action & Adventure', parent_id: 0 },
  { category_id: '11', category_name: 'Drama', parent_id: 0 },
  { category_id: '12', category_name: 'Comedy', parent_id: 0 },
  { category_id: '13', category_name: 'Sci-Fi', parent_id: 0 }
];
const movieCatIds = ['10', '10', '10', '13', '13', '11', '11', '11', '11', '12', '12', '12', '11', '13', '12', '11', '11', '12'];
const vodStreams = movieTitles.map((name, i) => ({
  num: i + 1,
  name,
  stream_type: 'movie',
  stream_id: 501 + i,
  stream_icon: '/art?k=vod&t=' + encodeURIComponent(name) + '&i=' + (i + 1),
  rating: (6.8 + (i % 4) * 0.4).toFixed(1),
  rating_5based: 3.5,
  added: String(1700000000 + i * 86400),
  category_id: movieCatIds[i],
  container_extension: 'mp4',
  custom_sid: '',
  direct_source: ''
}));

const seriesTitles = [
  'The Division', 'Harbor Lights', 'Deep State', 'Family Business', 'Orbit Station',
  'The Quiet House', 'Runner', 'Golden Age', 'Night Shift', 'The Visitors'
];
const seriesCategories = [
  { category_id: '20', category_name: 'Drama', parent_id: 0 },
  { category_id: '21', category_name: 'Comedy', parent_id: 0 },
  { category_id: '22', category_name: 'Sci-Fi', parent_id: 0 }
];
const seriesCatIds = ['20', '20', '20', '21', '22', '20', '20', '21', '20', '22'];
const seriesList = seriesTitles.map((name, i) => ({
  num: i + 1,
  name,
  series_id: 901 + i,
  cover: '/art?k=series&t=' + encodeURIComponent(name) + '&i=' + (i + 1),
  plot: name + ' follows a group of people whose lives collide in unexpected ways.',
  cast: 'Maya Collins, Adam Reed, Sofia Grant',
  director: 'A. Director',
  genre: 'Drama',
  releaseDate: '2023-05-12',
  last_modified: String(1710000000 + i * 86400),
  rating: (7.4 + (i % 3) * 0.3).toFixed(1),
  rating_5based: 4.0,
  backdrop_path: '',
  youtube_trailer: '',
  episode_run_time: '48',
  category_id: seriesCatIds[i]
}));

function seriesInfo(series) {
  const base = series.series_id * 10;
  const episodes = {};
  const seasons = [];
  for (let s = 1; s <= 2; s++) {
    seasons.push({ season_number: s, name: 'Season ' + s });
    episodes[String(s)] = [];
    for (let e = 1; e <= 6; e++) {
      const id = base + s * 100 + e;
      episodes[String(s)].push({
        id,
        episode_num: e,
        title: 'Episode ' + e + ': ' + ['The Beginning', 'Crossroads', 'The Truth', 'Fallout', 'Recovery', 'A New Day'][e - 1],
        container_extension: 'mp4',
        season: s,
        info: { duration: '48 min', plot: 'Episode ' + e + ' of ' + series.name + '.' }
      });
    }
  }
  return {
    seasons,
    info: {
      name: series.name,
      cover: series.cover,
      cover_big: series.cover,
      plot: series.plot,
      cast: series.cast,
      director: series.director,
      genre: series.genre,
      releaseDate: series.releaseDate,
      rating: series.rating,
      episode_run_time: series.episode_run_time
    },
    episodes
  };
}

function vodInfo(movie) {
  return {
    info: {
      name: movie.name,
      movie_image: movie.stream_icon,
      plot: movie.name + ' is a story about second chances, set against a landscape that refuses to stay still.',
      cast: 'Lena Ortiz, Marcus Bell, Priya Nair',
      director: 'J. Filmmaker',
      genre: ['Action', 'Drama', 'Comedy', 'Sci-Fi'][Number(movie.category_id) % 4] || 'Drama',
      releasedate: '2024-03-08',
      releaseDate: '2024-03-08',
      duration: '1h 52m',
      rating: movie.rating,
      country: 'United States',
      tmdb_id: '12345'
    },
    movie_data: {
      stream_id: movie.stream_id,
      name: movie.name,
      container_extension: movie.container_extension
    }
  };
}

function epgFor(channel) {
  const now = Date.now();
  const start = now - 2 * 60 * 60 * 1000;
  const listing = [];
  for (let i = 0; i < 10; i++) {
    const s = start + i * 60 * 60 * 1000;
    const e = s + 60 * 60 * 1000;
    const title = channel.name + ' — ' + ['Morning Report', 'Midday Live', 'The Big Story', 'Afternoon Focus', 'Evening Update', 'Night Report'][i % 6];
    listing.push({
      id: channel.stream_id * 100 + i,
      epg_id: 'epg' + channel.stream_id,
      title: Buffer.from(title).toString('base64'),
      lang: 'en',
      start: new Date(s).toISOString().slice(0, 19).replace('T', ' '),
      end: new Date(e).toISOString().slice(0, 19).replace('T', ' '),
      description: Buffer.from('A full hour of ' + title + ', with reports, interviews, and analysis.').toString('base64'),
      channel_id: channel.epg_channel_id,
      start_timestamp: String(Math.floor(s / 1000)),
      stop_timestamp: String(Math.floor(e / 1000)),
      now_playing: s <= now && e > now ? '1' : '0',
      has_archive: String(channel.tv_archive) === '1' && e <= now ? '1' : '0'
    });
  }
  return listing;
}

function userInfo() {
  return {
    username: 'demo',
    password: 'demo',
    message: 'Welcome to the mock provider',
    auth: 1,
    status: 'Active',
    exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 365),
    is_trial: '0',
    active_cons: '1',
    created_at: String(Math.floor(Date.now() / 1000) - 86400 * 30),
    max_connections: '2',
    allowed_output_formats: ['m3u8', 'ts']
  };
}

function apiResponse(url) {
  const action = url.searchParams.get('action');
  const category = url.searchParams.get('category_id');
  if (url.searchParams.get('username') !== 'demo' || url.searchParams.get('password') !== 'demo') {
    return { user_info: { auth: 0, status: 'Invalid' } };
  }
  if (!action) {
    return {
      user_info: userInfo(),
      server_info: {
        url: 'localhost',
        port: String(PORT),
        https_port: '',
        server_protocol: 'http',
        rtmp_port: '',
        timezone: 'UTC',
        timestamp_now: Math.floor(Date.now() / 1000),
        time_now: new Date().toISOString()
      }
    };
  }
  if (action === 'get_live_categories') return liveCategories;
  if (action === 'get_live_streams') {
    return category ? liveStreams.filter(s => s.category_id === category) : liveStreams;
  }
  if (action === 'get_vod_categories') return movieCategories;
  if (action === 'get_vod_streams') {
    return category ? vodStreams.filter(s => s.category_id === category) : vodStreams;
  }
  if (action === 'get_vod_info') {
    const movie = vodStreams.find(m => String(m.stream_id) === String(url.searchParams.get('vod_id')));
    return movie ? vodInfo(movie) : { info: {}, movie_data: {} };
  }
  if (action === 'get_series_categories') return seriesCategories;
  if (action === 'get_series') {
    return category ? seriesList.filter(s => s.category_id === category) : seriesList;
  }
  if (action === 'get_series_info') {
    const series = seriesList.find(s => String(s.series_id) === String(url.searchParams.get('series_id')));
    return series ? seriesInfo(series) : { seasons: [], info: {}, episodes: {} };
  }
  if (action === 'get_short_epg' || action === 'get_simple_data_table') {
    const channel = liveStreams.find(s => String(s.stream_id) === String(url.searchParams.get('stream_id')));
    if (!channel) return { epg_listings: [] };
    let listing = epgFor(channel);
    if (action === 'get_short_epg') {
      const limit = Number(url.searchParams.get('limit') || 6);
      const now = Date.now();
      const currentIndex = listing.findIndex(item => Number(item.start_timestamp) * 1000 <= now && Number(item.stop_timestamp) * 1000 > now);
      listing = listing.slice(Math.max(0, currentIndex - 1), Math.max(0, currentIndex - 1) + limit);
    }
    return { epg_listings: listing };
  }
  return { user_info: { auth: 0, status: 'Unknown action' } };
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function artSvg(kind, title, index) {
  const palettes = [
    ['#241b4f', '#ff4d6d'], ['#0f2a3f', '#4cc9f0'], ['#2b1d12', '#ffb347'],
    ['#123a2a', '#3ddc97'], ['#351427', '#ff7ab6'], ['#1a1a2e', '#7c5cff']
  ];
  const p = palettes[Number(index) % palettes.length];
  const isLive = kind === 'live';
  const w = isLive ? 400 : 400;
  const h = isLive ? 240 : 600;
  const fontSize = isLive ? 30 : 40;
  const lines = String(title).split(' ');
  const mid = Math.ceil(lines.length / 2);
  const line1 = escapeXml(lines.slice(0, mid).join(' '));
  const line2 = escapeXml(lines.slice(mid).join(' '));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="#0a0f1a"/>
  <rect width="${w}" height="${h}" fill="url(#g)" opacity=".82"/>
  <circle cx="${w * 0.82}" cy="${h * 0.18}" r="${w * 0.22}" fill="#fff" opacity=".08"/>
  <text x="32" y="${h / 2 - 10}" fill="#fff" font-family="Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="700">${line1}</text>
  <text x="32" y="${h / 2 + fontSize + 4}" fill="#fff" opacity=".9" font-family="Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="700">${line2}</text>
  <text x="32" y="${h - 28}" fill="#fff" opacity=".55" font-family="Helvetica,Arial,sans-serif" font-size="14" letter-spacing="3">${kind.toUpperCase()} · PERFECT IPTV</text>
</svg>`;
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/player_api.php') {
    return send(res, 200, JSON.stringify(apiResponse(url)), 'application/json; charset=utf-8');
  }
  if (url.pathname === '/$WEBAPIS/webapis/webapis.js') {
    return send(res, 200, '/* Tizen webapis shim for desktop browser testing */', 'application/javascript; charset=utf-8');
  }
  if (url.pathname === '/art') {
    return send(res, 200, artSvg(url.searchParams.get('k') || 'vod', url.searchParams.get('t') || 'Untitled', url.searchParams.get('i') || 1), 'image/svg+xml');
  }
  if (url.pathname.startsWith('/live/') || url.pathname.startsWith('/movie/') || url.pathname.startsWith('/series/')) {
    res.writeHead(302, { Location: HLS, 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  if (url.pathname === '/streaming/timeshift.php') {
    res.writeHead(302, { Location: HLS, 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.resolve(ROOT, '.' + file);
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Xtream provider running at http://localhost:${PORT}`);
  console.log('Login: demo / demo');
});
