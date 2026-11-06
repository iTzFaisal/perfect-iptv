'use strict';
/*
 * Playwright UI suite for the mock Xtream provider.
 *
 *   npm test                 full suite
 *   SMOKE=1 npm test         login, live, play-live, reload
 *   ONLY=sort npm test       selected step(s) plus their dependencies
 *
 * Every check asserts. A console error, page error, or HTTP 4xx/5xx fails the
 * run even when all steps pass. Fixed sleeps are only used for animation
 * screenshots; state changes are awaited.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.resolve(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const SMOKE = process.env.SMOKE === '1';
const SMOKE_STEPS = ['login', 'live', 'play-live', 'reload'];

const steps = [];
function step(name, deps, fn) {
  if (typeof deps === 'function') { fn = deps; deps = []; }
  steps.push({ name, deps: deps || [], fn });
}

function selectedNames() {
  if (ONLY.length) return new Set(ONLY);
  if (SMOKE) return new Set(SMOKE_STEPS);
  return new Set(steps.map((s) => s.name));
}

function expandSelection(selected) {
  const known = new Set(steps.map((s) => s.name));
  for (const name of selected) {
    assert.ok(known.has(name), 'Unknown step "' + name + '". Available: ' + [...known].join(', '));
  }
  const needed = new Set();
  function add(name) {
    if (needed.has(name)) return;
    const entry = steps.find((s) => s.name === name);
    assert.ok(entry, 'Unknown step "' + name + '"');
    entry.deps.forEach(add);
    needed.add(name);
  }
  selected.forEach(add);
  return needed;
}

let page;
let playedLive = null;
const errors = [];

/* ---------------- Page helpers ---------------- */

function shot(name) {
  return page.screenshot({ path: path.join(OUT, name) });
}

async function text(selector) {
  return ((await page.locator(selector).first().textContent()) || '').trim();
}

async function count(selector) {
  return page.locator(selector).count();
}

async function waitForFirstText(selector, expected) {
  await page.waitForFunction(({ selector, expected }) => {
    const el = document.querySelector(selector);
    return !!el && el.textContent.trim() === expected;
  }, { selector, expected }, { timeout: 5000 });
}

async function assertOrder(selector, expected, message) {
  await page.waitForFunction(({ selector, expected }) => {
    const actual = Array.from(document.querySelectorAll(selector))
      .slice(0, expected.length)
      .map((el) => el.textContent.trim());
    return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
  }, { selector, expected }, { timeout: 5000 }).catch(async (err) => {
    const actual = await page.$$eval(selector, (els) =>
      els.slice(0, 10).map((el) => el.textContent.trim()));
    throw new Error((message || 'unexpected order') + '\nexpected: ' + JSON.stringify(expected) +
      '\nactual:   ' + JSON.stringify(actual) + '\n' + err.message);
  });
}

async function expectedNames(section, mode) {
  const type = section === 'live' ? 'live' : (section === 'vod' ? 'vod' : 'series');
  return page.evaluate(({ section, mode, type }) => {
    const state = section === 'live' ? IPTV.App.state.live
      : (section === 'vod' ? IPTV.App.state.vod : IPTV.App.state.series);
    const list = (state.rawItems || []).slice();
    if (mode === 'name-asc' || mode === 'name-desc') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined,
        { numeric: true, sensitivity: 'base' }));
      if (mode === 'name-desc') list.reverse();
      return list.map((item) => item.name);
    }
    if (mode === 'recent') {
      list.sort((a, b) => IPTV.itemAddedMs(b, type) - IPTV.itemAddedMs(a, type));
      return list.map((item) => item.name);
    }
    return list.map((item) => item.name);
  }, { section, mode, type });
}

async function chooseSort(type, value) {
  await page.click('[data-action="sort"][data-type="' + type + '"]');
  await page.waitForSelector('#modal-root [data-modal-action="sort:' + value + '"]', { timeout: 5000 });
  await page.click('#modal-root [data-modal-action="sort:' + value + '"]');
  await page.waitForSelector('#modal-root', { state: 'hidden', timeout: 5000 });
}

async function openCategory(category) {
  await page.click('[data-action="category"][data-category="' + category + '"]');
}

async function waitForSection(type, category) {
  if (type === 'live') {
    await page.waitForFunction((category) =>
      IPTV.App.state.live.loadedCategory === category, category, { timeout: 15000 });
  } else if (type === 'vod') {
    await page.waitForFunction((category) =>
      IPTV.App.state.vod.loadedCategory === category, category, { timeout: 15000 });
  } else {
    await page.waitForFunction((category) =>
      IPTV.App.state.series.loadedCategory === category, category, { timeout: 15000 });
  }
}

/* ---------------- Steps ---------------- */

step('login', async () => {
  // Start from a clean TV state even if the browser profile survived a
  // previous run, then wait for boot instead of reading the DOM too early.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  assert.equal(await page.locator('#login-screen').isVisible(), true, 'login screen should be visible');
  assert.equal(await page.locator('#shell').isVisible(), false, 'shell should be hidden before login');
  assert.equal(await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()), '1.25',
  'default text scale should be standard');

  await page.screenshot({ path: path.join(OUT, '01-login.png') });
  await page.fill('#login-name', 'Mock Provider');
  await page.fill('#login-server', BASE);
  await page.fill('#login-username', 'demo');
  await page.fill('#login-password', 'demo');
  await page.click('#login-submit');

  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });
  assert.equal(await page.locator('#login-screen').isVisible(), false, 'login should hide after connect');
  assert.equal(await page.evaluate(() => IPTV.App.view), 'live', 'should land on Live TV');
  assert.equal(await page.evaluate(() => IPTV.App.state.live.categories.length > 0), true,
    'live categories should load');
});

step('live', ['login'], async () => {
  await page.waitForFunction(() => IPTV.App.state.live.loadedCategory === 'all', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '02-live.png') });

  const channels = await count('.channel-card');
  assert.ok(channels > 0, 'expected live channel cards');
  assert.equal(await page.locator('.nav-item[data-view="search"]').count(), 0,
    'search must stay inside each section, not the sidebar');
  assert.equal(await count('[data-action="section-search"]'), 1,
    'live section should have one search button');

  const previewName = await text('.preview-name');
  assert.ok(previewName.length > 0, 'focused channel should have a preview');

  const focusBefore = await page.evaluate(() =>
    document.activeElement && document.activeElement.getAttribute('data-id'));
  assert.ok(focusBefore, 'a channel card should be focused after load');

  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((before) => {
    const active = document.activeElement;
    return !!active && active.getAttribute('data-id') &&
      active.getAttribute('data-id') !== before;
  }, focusBefore, { timeout: 3000 });

  const focusAfter = await page.evaluate(() =>
    document.activeElement && document.activeElement.getAttribute('data-id'));
  assert.notEqual(focusAfter, focusBefore, 'd-pad focus did not move');

  const focusedName = await page.evaluate((id) =>
    (IPTV.App.state.live.items.find((item) => String(item.stream_id) === String(id)) || {}).name,
  focusAfter);
  assert.ok(focusedName, 'focused channel should exist in state');
  await waitForFirstText('.preview-name', focusedName);
  assert.equal(await text('.preview-name'), focusedName, 'preview should follow focus');
});

step('sort', ['live'], async () => {
  await page.click('[data-action="sort"][data-type="live"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 5000 });
  assert.equal(await count('#modal-root .option-item'), 4, 'sort menu should list four options');
  await page.screenshot({ path: path.join(OUT, '15-sort-menu.png') });

  const asc = (await expectedNames('live', 'name-asc')).slice(0, 10);
  await page.click('#modal-root [data-modal-action="sort:name-asc"]');
  await page.waitForSelector('#modal-root', { state: 'hidden' });
  await assertOrder('.channel-card .channel-name', asc, 'live A-Z order');
  assert.equal(await text('.channel-card .channel-name'), asc[0], 'first live channel after A-Z sort');

  const recent = (await expectedNames('live', 'recent')).slice(0, 10);
  await chooseSort('live', 'recent');
  await assertOrder('.channel-card .channel-name', recent, 'live newest-first order');
  assert.equal(await text('.channel-card .channel-name'), recent[0], 'first live channel after recent sort');

  const original = (await expectedNames('live', 'default')).slice(0, 10);
  await chooseSort('live', 'default');
  await assertOrder('.channel-card .channel-name', original, 'live default provider order');
});

step('epg', ['live'], async () => {
  await page.click('[data-action="open-epg"]');
  await page.waitForSelector('#modal-root .epg-row', { timeout: 15000 });
  const rows = await count('#modal-root .epg-row');
  assert.ok(rows > 0, 'TV guide should list programs');
  assert.ok(await count('#modal-root .epg-row .epg-title') >= rows, 'every guide row needs a title');
  assert.ok(await count('#modal-root [data-action="catchup"]') > 0,
    'mock guide should expose catch-up for archived channels');
  assert.ok(await count('#modal-root .chip.live') >= 1, 'guide should mark the current program');
  await page.screenshot({ path: path.join(OUT, '02b-epg.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal-root', { state: 'hidden' });
});

step('continue-empty', ['live'], async () => {
  await openCategory('continue');
  await page.waitForSelector('#view .empty-state');
  assert.equal(await text('#view .empty-state h3'), 'Nothing watched yet',
    'continue watching should be empty before playback');
  assert.equal(await count('#view .channel-card'), 0,
    'empty continue watching should not render channel cards');

  await openCategory('all');
  await waitForSection('live', 'all');
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });
});

step('search', ['live'], async () => {
  await page.click('[data-action="section-search"][data-type="live"]');
  await page.waitForSelector('#search-input');
  assert.equal(await page.evaluate(() => IPTV.App.view), 'search', 'search should open');
  assert.equal(await text('#view-title'), 'Search Live TV', 'search title should name the section');
  assert.equal(await count('.search-bar button'), 0, 'search bar should not contain stray buttons');

  await page.fill('#search-input', 'Arena');
  await page.waitForSelector('#search-results .channel-card', { timeout: 15000 });
  const results = await count('#search-results .channel-card');
  assert.ok(results > 0, 'live search should return channels');
  assert.equal(await count('#search-results .poster-card'), 0,
    'live search must not mix in movies or series');
  const names = await page.$$eval('#search-results .channel-name', (els) =>
    els.map((el) => el.textContent.toLowerCase()));
  assert.ok(names.every((name) => name.includes('arena')), 'every live result should match the query');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '06-search-live.png') });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => IPTV.App.view === 'live', null, { timeout: 15000 });
  await page.waitForSelector('.view-live .channel-card', { timeout: 15000 });
  assert.equal(await page.evaluate(() => IPTV.App.view), 'live', 'Back should leave search');
});

step('movies', ['live'], async () => {
  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  const movies = await count('#view .poster-card');
  assert.ok(movies > 0, 'expected movie poster cards');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-movies.png') });

  // Movie search stays inside Movies.
  await page.click('[data-action="section-search"][data-type="vod"]');
  await page.waitForSelector('#search-input');
  assert.equal(await text('#view-title'), 'Search Movies', 'movie search title');
  await page.fill('#search-input', 'Night');
  await page.waitForSelector('#search-results .poster-card', { timeout: 15000 });
  assert.ok(await count('#search-results .poster-card') > 0, 'movie search should return results');
  assert.equal(await count('#search-results .channel-card'), 0,
    'movie search must not mix in live channels');
  const titles = await page.$$eval('#search-results .poster-title', (els) =>
    els.map((el) => el.textContent.toLowerCase()));
  assert.ok(titles.every((title) => title.includes('night')), 'every movie result should match the query');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '06-search-movies.png') });

  // Open the first result and verify the detail modal.
  const clickedTitle = await text('#search-results .poster-title');
  await page.click('#search-results .poster-card');
  await page.waitForSelector('#modal-root:not(.hidden) .detail-plot', { timeout: 15000 });
  assert.equal(await text('#modal-root .modal-head h2'), clickedTitle, 'movie detail title');
  assert.ok((await text('#modal-root .detail-plot')).length > 0, 'movie detail needs a plot');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-movie-detail.png') });

  const favButton = page.locator('#modal-root [data-action="toggle-fav"]').first();
  const movieId = await page.evaluate(() => {
    const button = document.querySelector('#modal-root [data-action="toggle-fav"]');
    return button && button.getAttribute('data-id');
  });
  await favButton.click();
  await page.waitForFunction((id) => IPTV.Store.isFavorite('vod', id), movieId, { timeout: 5000 });
  assert.equal(await page.evaluate((id) => IPTV.Store.isFavorite('vod', id), movieId), true,
    'toggling the heart should save the movie favorite');
  assert.ok(((await text('#modal-root [data-action="toggle-fav"]')) || '').includes('Remove'),
    'favorite button should switch to Remove');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal-root', { state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => IPTV.App.view === 'movies', null, { timeout: 15000 });
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
});

step('recent', ['movies'], async () => {
  await openCategory('recent');
  await waitForSection('vod', 'recent');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await page.waitForTimeout(300);

  const recent = (await expectedNames('vod', 'recent')).slice(0, 10);
  assert.ok(recent.length > 0, 'recent movies should not be empty');
  await assertOrder('#view .poster-title', recent, 'recently added movie order');

  const asc = (await expectedNames('vod', 'name-asc')).slice(0, 10);
  await chooseSort('vod', 'name-asc');
  await assertOrder('#view .poster-title', asc, 'movie A-Z order');

  const desc = (await expectedNames('vod', 'name-desc')).slice(0, 10);
  await chooseSort('vod', 'name-desc');
  await assertOrder('#view .poster-title', desc, 'movie Z-A order');

  await chooseSort('vod', 'default');
  await openCategory('all');
  await waitForSection('vod', 'all');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
});

step('series', ['live'], async () => {
  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await openCategory('recent');
  await waitForSection('series', 'recent');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });

  const recent = (await expectedNames('series', 'recent')).slice(0, 10);
  await assertOrder('#view .poster-title', recent, 'recently added series order');

  const asc = (await expectedNames('series', 'name-asc')).slice(0, 10);
  await chooseSort('series', 'name-asc');
  await assertOrder('#view .poster-title', asc, 'series A-Z order');

  await chooseSort('series', 'default');
  await openCategory('all');
  await waitForSection('series', 'all');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });

  await page.click('[data-action="section-search"][data-type="series"]');
  await page.waitForSelector('#search-input');
  await page.fill('#search-input', 'Night');
  await page.waitForSelector('#search-results .poster-card', { timeout: 15000 });
  assert.ok(await count('#search-results .poster-card') > 0, 'series search should return results');
  assert.equal(await count('#search-results .channel-card'), 0,
    'series search must not mix in live channels');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '06-search-series.png') });

  await page.keyboard.press('Escape');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await page.click('#view .poster-card');
  await page.waitForSelector('#modal-root .season-chip', { timeout: 15000 });
  assert.ok(await count('#modal-root .season-chip') > 0, 'series detail should list seasons');
  assert.ok(await count('#modal-root .episode-row') > 0, 'series detail should list episodes');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '05-series-detail.png') });

  const firstSeasonEpisodes = await count('#modal-root .episode-row');
  await page.click('#modal-root .season-chip:nth-child(2)');
  await page.waitForFunction((before) =>
    document.querySelectorAll('#modal-root .episode-row').length !== before ||
    document.querySelector('#modal-root .season-chip:nth-child(2)').classList.contains('is-active'),
  firstSeasonEpisodes, { timeout: 5000 });
  assert.ok(await count('#modal-root .episode-row') > 0, 'second season should list episodes');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal-root', { state: 'hidden' });
});

step('favorites', ['movies'], async () => {
  await page.click('.nav-item[data-view="favorites"]');
  await page.waitForSelector('#view .tab-row', { timeout: 15000 });
  await page.click('[data-action="fav-tab"][data-tab="vod"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  assert.equal(await count('#view .poster-card'), 1, 'the movie favorited earlier should be listed');
  assert.equal(await page.evaluate(() => IPTV.Store.favoritesOf('vod').length), 1,
    'favorites store should contain one movie');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '09-favorites.png') });
});

step('settings', ['live'], async () => {
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForSelector('[data-setting="textSize"]', { timeout: 15000 });
  assert.equal(await count('[data-setting="textSize"]'), 3, 'three text sizes should be offered');
  assert.equal(await page.evaluate(() => IPTV.Store.settings.textSize), 'standard',
    'standard text size should be the default');
  assert.equal(await page.locator('[data-setting="textSize"][data-value="standard"]')
    .evaluate((el) => el.classList.contains('is-active')), true, 'standard should be selected');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '10-settings.png') });

  await page.click('[data-setting="textSize"][data-value="xlarge"]');
  await page.waitForFunction(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim() === '1.7',
  null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => IPTV.Store.settings.textSize), 'xlarge',
    'text size setting should persist');
  await page.screenshot({ path: path.join(OUT, 'xlarge-settings.png') });

  await page.click('[data-setting="textSize"][data-value="large"]');
  await page.waitForFunction(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim() === '1.5',
  null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => IPTV.Store.settings.textSize), 'large',
    'large text size should persist');
});

step('continue', ['live'], async () => {
  // Seed history so Continue watching has one row in each section.
  await page.evaluate(() => {
    const S = window.IPTV.Store;
    S.setHistory('live', '101', {
      name: 'World News 24', stream_id: 101, num: 1,
      stream_icon: '/art?k=live&t=World%20News%2024&i=1',
      category_id: '1', epg_channel_id: 'ch1', tv_archive: 1, tv_archive_duration: 7
    });
    S.setHistory('vod', '501', {
      name: 'Nightfall', stream_id: 501, container_extension: 'mp4',
      stream_icon: '/art?k=vod&t=Nightfall&i=1',
      position: 1200, duration: 6720
    });
    S.setHistory('series', '901:9111', {
      seriesId: '901', seriesName: 'The Division', episodeId: '9111',
      season: 1, episode: 1, title: 'Episode 1: The Beginning',
      container_extension: 'mp4', cover: '/art?k=series&t=The%20Division&i=1',
      position: 600, duration: 2880
    });
  });

  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await openCategory('continue');
  await page.waitForSelector('[data-action="resume-vod"]', { timeout: 15000 });
  assert.equal(await count('[data-action="resume-vod"]'), 1, 'continue watching should have one movie');
  assert.ok(((await text('[data-action="resume-vod"] .poster-sub')) || '').length > 0,
    'continue movie should show a resume subtitle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '07-continue-movies.png') });

  await page.click('[data-action="resume-vod"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 10000 });
  assert.equal(await page.locator('#player').isVisible(), true, 'movie resume should open the player');
  assert.equal(await text('#player-kicker'), 'MOVIE', 'movie player kicker');
  await page.waitForFunction(() => {
    const video = document.querySelector('#html5-video');
    return !!video && isFinite(video.duration) && video.duration > 0;
  }, null, { timeout: 10000 });

  // Holding the right arrow accelerates the seek while playback continues.
  // Tizen remotes repeat keydown while held; Playwright sends one, so send
  // repeats manually to exercise the same path.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  const seeking = await page.evaluate(() => {
    const hud = document.querySelector('#player-seek');
    const video = document.querySelector('#html5-video');
    return {
      visible: hud.classList.contains('visible'),
      speed: document.querySelector('#player-seek-speed').textContent.trim(),
      delta: document.querySelector('#player-seek-delta').textContent.trim(),
      paused: video.paused
    };
  });
  assert.equal(seeking.visible, true, 'holding right should show the seek HUD');
  assert.match(seeking.speed, /×/, 'hold should accelerate beyond the base seek step');
  assert.notEqual(seeking.delta, '+10s', 'held seek should travel more than one tap');
  assert.equal(seeking.paused, false, 'holding should keep playback running smoothly');
  await page.screenshot({ path: path.join(OUT, '07b-seek.png') });

  await page.keyboard.up('ArrowRight');
  const released = await page.evaluate(() => ({
    hudVisible: document.querySelector('#player-seek').classList.contains('visible'),
    paused: document.querySelector('#html5-video').paused
  }));
  assert.equal(released.paused, false, 'releasing the key should keep playback running');
  assert.equal(released.hudVisible, true, 'seek HUD should linger after release');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#player', { state: 'hidden', timeout: 10000 });
  // Let the shared <video> element finish tearing down before reusing it.
  await page.waitForTimeout(400);

  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await openCategory('continue');
  await page.waitForSelector('[data-action="resume-series"]', { timeout: 15000 });
  assert.equal(await count('[data-action="resume-series"]'), 1, 'continue watching should have one series');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '08-continue-series.png') });

  await page.click('[data-action="resume-series"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 15000 });
  assert.equal(await page.locator('#player').isVisible(), true, 'series resume should open the player');
  assert.equal(await text('#player-kicker'), 'EPISODE', 'episode player kicker');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#player', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(400);
});

step('seek-avplay', ['continue'], async () => {
  // Stub the Tizen AVPlay bridge so the hold-seek path can be exercised in a
  // desktop browser. The video plane itself is not decoded.
  await page.evaluate(() => {
    window.__avCalls = [];
    var state = 'NONE';
    var listeners = {};
    window.webapis = window.webapis || {};
    window.webapis.avplay = {
      open: function (url) { state = 'IDLE'; window.__avCalls.push(['open', url]); },
      setDisplayRect: function (x, y, w, h) { window.__avCalls.push(['rect', x, y, w, h]); },
      setDisplayMethod: function () {},
      setListener: function (next) { listeners = next || {}; },
      prepareAsync: function (ok) { state = 'READY'; setTimeout(ok, 0); },
      getDuration: function () { return 120000; },
      seekTo: function (ms) {
        window.__avCalls.push(['seek', ms]);
        if (listeners.oncurrentplaytime) listeners.oncurrentplaytime(ms);
      },
      play: function () { state = 'PLAYING'; },
      pause: function () { state = 'PAUSED'; },
      stop: function () { state = 'IDLE'; },
      close: function () { state = 'NONE'; },
      getState: function () { return state; },
      suspend: function () {},
      restore: function () {}
    };
  });

  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('#view .poster-card', { timeout: 15000 });
  await openCategory('continue');
  await page.waitForSelector('[data-action="resume-vod"]', { timeout: 15000 });
  await page.click('[data-action="resume-vod"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 10000 });
  assert.equal(await text('#player-kicker'), 'MOVIE', 'AVPlay seek test should play a movie');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);

  const duringHold = await page.evaluate(() => ({
    hudVisible: document.querySelector('#player-seek').classList.contains('visible'),
    speed: document.querySelector('#player-seek-speed').textContent.trim(),
    delta: document.querySelector('#player-seek-delta').textContent.trim(),
    paused: window.webapis.avplay.getState() === 'PAUSED',
    seekCalls: window.__avCalls.filter((call) => call[0] === 'seek').map((call) => call[1]),
    rectCalls: window.__avCalls.filter((call) => call[0] === 'rect').map((call) => call.slice(1)),
    thumbnails: document.querySelectorAll('#player-seek-image, #player-seek-frame').length
  }));
  assert.equal(duringHold.hudVisible, true, 'holding right should show the seek HUD');
  assert.match(duringHold.speed, /×/, 'hold should accelerate beyond the base seek step');
  assert.notEqual(duringHold.delta, '+10s', 'held seek should travel more than one tap');
  assert.equal(duringHold.paused, false, 'held seek should not pause AVPlay');
  assert.equal(duringHold.seekCalls.length, 1,
    'hold should apply one initial seek, not seek on every tick');
  assert.equal(duringHold.seekCalls[0], 10000, 'first seek should be the base 10 seconds');
  assert.deepEqual(duringHold.rectCalls, [[0, 0, 1920, 1080]],
    'seeking should never resize the video plane');
  assert.equal(duringHold.thumbnails, 0, 'thumbnail elements should be removed');
  await page.screenshot({ path: path.join(OUT, '12-seek-avplay.png') });

  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(150);
  const afterRelease = await page.evaluate(() => {
    const seekCalls = window.__avCalls.filter((call) => call[0] === 'seek').map((call) => call[1]);
    const rectCalls = window.__avCalls.filter((call) => call[0] === 'rect').map((call) => call.slice(1));
    return {
      hudVisible: document.querySelector('#player-seek').classList.contains('visible'),
      seekCalls: seekCalls,
      rectCalls: rectCalls
    };
  });
  assert.equal(afterRelease.hudVisible, true, 'seek HUD should linger after release');
  assert.equal(afterRelease.seekCalls.length, 2, 'release should commit exactly one final seek');
  assert.ok(afterRelease.seekCalls[1] > 10000, 'final seek should move beyond the first step');
  assert.equal(afterRelease.rectCalls.length, 1, 'releasing should not resize the video plane');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#player', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (window.webapis) delete window.webapis.avplay; });
});

step('play-live', ['live'], async () => {
  await page.click('.nav-item[data-view="live"]');
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });

  // Focus the first card and let the debounced preview settle so the play
  // button and history assertion refer to the same channel.
  await page.evaluate(() => {
    const first = document.querySelector('#view .channel-card');
    if (first) first.focus();
  });
  await page.waitForFunction(() => {
    const first = document.querySelector('#view .channel-card .channel-name');
    const preview = document.querySelector('.preview-name');
    return !!first && !!preview && first.textContent.trim() === preview.textContent.trim();
  }, null, { timeout: 5000 });
  playedLive = await page.evaluate(() => {
    const button = document.querySelector('#view [data-action="play-live"]');
    const preview = document.querySelector('.preview-name');
    return {
      id: button && button.getAttribute('data-id'),
      name: preview && preview.textContent.trim()
    };
  });
  assert.ok(playedLive.id, 'preview should expose a playable channel id');
  assert.ok(playedLive.name, 'preview should name the channel');

  await page.click('[data-action="play-live"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 10000 });
  assert.equal(await page.locator('#player').isVisible(), true, 'live player should be visible');
  assert.equal(await text('#player-kicker'), 'LIVE', 'live player kicker');

  // Wait for the HTML5 fallback to actually start decoding audio/video.
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector('#html5-video');
      return !!video && video.readyState >= 2 && video.paused === false && video.currentTime > 0;
    }, null, { timeout: 20000 });
  } catch (err) {
    const diagnostic = await page.evaluate(() => {
      const video = document.querySelector('#html5-video');
      return {
        playerVisible: !document.querySelector('#player').classList.contains('hidden'),
        paused: video && video.paused,
        currentTime: video && video.currentTime,
        readyState: video && video.readyState,
        networkState: video && video.networkState,
        error: video && video.error && { code: video.error.code, message: video.error.message },
        src: video && video.currentSrc,
        hlsPresent: !!window.Hls,
        hlsSupported: !!(window.Hls && window.Hls.isSupported()),
        nativeHls: video && video.canPlayType('application/vnd.apple.mpegurl'),
        playerTitle: document.querySelector('#player-title').textContent,
        playerError: document.querySelector('#player-error-text').textContent
      };
    });
    console.error('Video did not start:', diagnostic);
    throw err;
  }
  const video = await page.evaluate(() => {
    const v = document.querySelector('#html5-video');
    return { paused: v.paused, currentTime: v.currentTime, readyState: v.readyState, error: v.error && v.error.code };
  });
  assert.equal(video.paused, false, 'live video should be playing');
  assert.ok(video.currentTime > 0, 'live video should advance');
  assert.equal(video.error, null, 'live video should not have a media error');
  await page.screenshot({ path: path.join(OUT, '11-player.png') });

  await page.keyboard.press('Escape');
  await page.waitForSelector('#player', { state: 'hidden', timeout: 10000 });
});

step('history', ['play-live'], async () => {
  assert.ok(playedLive && playedLive.id, 'play-live should record the channel it played');
  const record = await page.evaluate((id) => {
    const item = window.IPTV.Store.getHistory('live', id);
    return item ? { name: item.name, updated: item.updated } : null;
  }, playedLive.id);
  assert.ok(record, 'playing a live channel should write history');
  assert.equal(record.name, playedLive.name, 'live history should keep the channel name');
  assert.ok(record.updated > 0, 'live history should have a timestamp');

  await page.click('.nav-item[data-view="live"]');
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });
  await openCategory('continue');
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });
  const names = await page.$$eval('#view .channel-card .channel-name', (els) =>
    els.map((el) => el.textContent.trim()));
  assert.ok(names.length >= 1, 'continue watching should show watched channels');
  assert.ok(names.includes(playedLive.name),
    'continue watching should include the channel that was just played');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '12-continue-live.png') });
});

step('reload', ['live'], async () => {
  const settings = await page.evaluate(() => ({
    textSize: IPTV.Store.settings.textSize,
    scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()
  }));
  assert.ok(settings.scale, 'text scale should be set before reload');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('#view .channel-card', { timeout: 20000 });
  assert.equal(await page.locator('#login-screen').isVisible(), false,
    'saved account should reconnect automatically');
  assert.equal(await page.evaluate(() => IPTV.App.view), 'live', 'reload should land on Live TV');

  const after = await page.evaluate(() => ({
    textSize: IPTV.Store.settings.textSize,
    scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()
  }));
  assert.equal(after.textSize, settings.textSize, 'text size setting should survive reload');
  assert.equal(after.scale, settings.scale, 'text scale should survive reload');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '13-reload.png') });
});

step('logout', ['settings'], async () => {
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForSelector('[data-action="logout"]', { timeout: 15000 });
  await page.click('[data-action="logout"]');
  await page.waitForSelector('#modal-root .modal', { timeout: 10000 });
  assert.equal(await text('#modal-root .modal-head h2'), 'Sign out', 'logout confirmation title');
  await page.click('#modal-root [data-modal-action="ok"]');
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 10000 });
  assert.equal(await page.locator('#shell').isVisible(), false, 'shell should hide after sign out');
  assert.ok(await count('#saved-list [data-account-id]') >= 1, 'signed-out account should stay saved');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '14-saved-accounts.png') });
});

step('saved-account', ['logout'], async () => {
  const saved = await count('#saved-list [data-account-id]');
  assert.ok(saved >= 1, 'a saved account should be available');
  await page.click('#saved-list [data-account-id]');
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('#view .channel-card', { timeout: 20000 });
  assert.equal(await page.locator('#login-screen').isVisible(), false,
    'saved account should reconnect');
  assert.equal(await page.evaluate(() => IPTV.App.account && IPTV.App.account.name), 'Mock Provider',
    'saved account should restore its name');
});

/* ---------------- Runner ---------------- */

(async () => {
  assert.ok(steps.length > 0, 'no test steps registered');
  const needed = expandSelection(selectedNames());

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();

  page.on('pageerror', (err) => errors.push('PAGE: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('$WEBAPIS') && !msg.text().includes('favicon')) {
      errors.push('CONSOLE: ' + msg.text());
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push('HTTP ' + res.status() + ': ' + res.url());
  });

  const ran = [];
  try {
    for (const entry of steps) {
      if (!needed.has(entry.name)) continue;
      console.log('\n▶ ' + entry.name);
      await entry.fn();
      ran.push(entry.name);
      console.log('✓ ' + entry.name);
    }
  } finally {
    try { await browser.close(); } catch (err) { /* ignore */ }
  }

  assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  console.log('\nSteps:  ' + ran.join(', '));
  console.log('Errors: none');
  console.log('UI TESTS PASSED');
})().catch((err) => {
  console.error('\nTEST FAILED:', err && err.stack ? err.stack : err);
  if (errors.length) console.error('\nBrowser errors:\n' + errors.join('\n'));
  process.exit(1);
});
