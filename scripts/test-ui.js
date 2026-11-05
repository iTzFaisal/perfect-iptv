'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.resolve(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGE: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('$WEBAPIS') && !msg.text().includes('favicon')) {
      errors.push('CONSOLE: ' + msg.text());
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push('HTTP ' + res.status() + ': ' + res.url());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '01-login.png') });
  console.log('login visible:', await page.locator('#login-screen').isVisible());
  console.log('text scale:', await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()));

  await page.fill('#login-name', 'Mock Provider');
  await page.fill('#login-server', BASE);
  await page.fill('#login-username', 'demo');
  await page.fill('#login-password', 'demo');
  await page.click('#login-submit');

  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('.channel-card', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '02-live.png') });

  console.log('nav search items:', await page.locator('.nav-item[data-view="search"]').count());
  console.log('section search buttons:', await page.locator('[data-action="section-search"]').count());
  console.log('channels:', await page.locator('.channel-card').count());
  console.log('preview name:', await page.locator('.preview-name').textContent());

  const focusBefore = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const focusAfter = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  console.log('d-pad focus:', focusBefore, '->', focusAfter, focusBefore !== focusAfter ? 'ok' : 'FAILED');

  // Sort options should reorder the active category without a reload.
  await page.click('[data-action="sort"][data-type="live"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  console.log('sort options:', await page.locator('#modal-root .option-item').count());
  await page.click('[data-modal-action="sort:name-asc"]');
  await page.waitForTimeout(400);
  console.log('live A-Z first:', await page.locator('.channel-card .channel-name').first().textContent());
  await page.click('[data-action="sort"][data-type="live"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:recent"]');
  await page.waitForTimeout(400);
  console.log('live newest first:', await page.locator('.channel-card .channel-name').first().textContent());
  await page.click('[data-action="sort"][data-type="live"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:default"]');
  await page.waitForTimeout(400);
  console.log('live default first:', await page.locator('.channel-card .channel-name').first().textContent());

  await page.click('[data-action="open-epg"]');
  await page.waitForSelector('.epg-row', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '02b-epg.png') });
  console.log('epg rows:', await page.locator('.epg-row').count(),
    'catch-up buttons:', await page.locator('[data-action="catchup"]').count());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Continue watching is an empty category before anything is played.
  await page.click('[data-action="category"][data-category="continue"]');
  await page.waitForSelector('#view .empty-state');
  console.log('continue live empty:', await page.locator('#view .empty-state h3').textContent());
  await page.click('[data-action="category"][data-category="all"]');
  await page.waitForSelector('.channel-card', { timeout: 15000 });

  // Live search is scoped to live channels only.
  await page.click('[data-action="section-search"][data-type="live"]');
  await page.waitForSelector('#search-input');
  console.log('search screen buttons:', await page.locator('.search-bar button').count());
  await page.fill('#search-input', 'Arena');
  await page.waitForSelector('#search-results .channel-card', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '06-search-live.png') });
  console.log('live search results:', await page.locator('#search-results .channel-card').count(),
    'poster cards:', await page.locator('#search-results .poster-card').count());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.channel-card', { timeout: 15000 });

  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '03-movies.png') });
  console.log('movies:', await page.locator('.poster-card').count());

  // Recently added uses provider timestamps; sorting applies to that list.
  await page.click('[data-action="category"][data-category="recent"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.waitForTimeout(500);
  console.log('recent movies first:', await page.locator('.poster-title').first().textContent());
  await page.click('[data-action="sort"][data-type="vod"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:name-asc"]');
  await page.waitForTimeout(400);
  console.log('movies A-Z first:', await page.locator('.poster-title').first().textContent());
  await page.click('[data-action="sort"][data-type="vod"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:name-desc"]');
  await page.waitForTimeout(400);
  console.log('movies Z-A first:', await page.locator('.poster-title').first().textContent());
  await page.click('[data-action="sort"][data-type="vod"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:default"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="category"][data-category="all"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.waitForTimeout(300);

  // Movies search is scoped to movies only.
  await page.click('[data-action="section-search"][data-type="vod"]');
  await page.waitForSelector('#search-input');
  await page.fill('#search-input', 'Night');
  await page.waitForSelector('#search-results .poster-card', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '06-search-movies.png') });
  console.log('movie search results:', await page.locator('#search-results .poster-card').count(),
    'channel cards:', await page.locator('#search-results .channel-card').count());

  await page.click('#search-results .poster-card');
  await page.waitForSelector('#modal-root:not(.hidden) .detail-plot', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04-movie-detail.png') });
  console.log('movie detail:', await page.locator('#modal-root .modal-head h2').textContent());
  await page.click('#modal-root [data-action="toggle-fav"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.poster-card', { timeout: 15000 });

  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('[data-action="category"][data-category="recent"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.waitForTimeout(500);
  console.log('recent series first:', await page.locator('.poster-title').first().textContent());
  await page.click('[data-action="sort"][data-type="series"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:name-asc"]');
  await page.waitForTimeout(400);
  console.log('series A-Z first:', await page.locator('.poster-title').first().textContent());
  await page.click('[data-action="sort"][data-type="series"]');
  await page.waitForSelector('#modal-root .option-item', { timeout: 10000 });
  await page.click('[data-modal-action="sort:default"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="category"][data-category="all"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('[data-action="section-search"][data-type="series"]');
  await page.waitForSelector('#search-input');
  await page.fill('#search-input', 'Night');
  await page.waitForSelector('#search-results .poster-card', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '06-search-series.png') });
  console.log('series search results:', await page.locator('#search-results .poster-card').count(),
    'channel cards:', await page.locator('#search-results .channel-card').count());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('.poster-card');
  await page.waitForSelector('.season-chip', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '05-series-detail.png') });
  console.log('seasons:', await page.locator('.season-chip').count(), 'episodes:', await page.locator('.episode-row').count());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Seed watch history and verify each section's Continue watching category.
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
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('[data-action="category"][data-category="continue"]');
  await page.waitForSelector('[data-action="resume-vod"]', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '07-continue-movies.png') });
  console.log('continue movies:', await page.locator('[data-action="resume-vod"]').count());
  await page.click('[data-action="resume-vod"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1200);
  console.log('movie resume player visible:', await page.locator('#player').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('[data-action="category"][data-category="continue"]');
  await page.waitForSelector('[data-action="resume-series"]', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '08-continue-series.png') });
  console.log('continue series:', await page.locator('[data-action="resume-series"]').count());
  await page.click('[data-action="resume-series"]');
  await page.waitForSelector('#player:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(1200);
  console.log('series resume player visible:', await page.locator('#player').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.click('.nav-item[data-view="favorites"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="fav-tab"][data-tab="vod"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '09-favorites.png') });
  console.log('favorite movies:', await page.locator('#view .poster-card').count());

  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '10-settings.png') });
  console.log('text size buttons:', await page.locator('[data-setting="textSize"]').count());
  console.log('default text size:', await page.evaluate(() => window.IPTV.Store.settings.textSize));
  console.log('standard selected:', await page.locator('[data-setting="textSize"][data-value="standard"]')
    .evaluate((el) => el.classList.contains('is-active')));

  // Text size should apply immediately and persist.
  await page.click('[data-setting="textSize"][data-value="xlarge"]');
  await page.waitForTimeout(300);
  console.log('xlarge scale:', await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()));
  await page.click('[data-setting="textSize"][data-value="large"]');
  await page.waitForTimeout(300);
  console.log('large scale:', await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()));

  await page.click('.nav-item[data-view="live"]');
  await page.waitForSelector('.channel-card');
  await page.waitForTimeout(500);
  await page.click('[data-action="play-live"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '11-player.png') });
  console.log('player visible:', await page.locator('#player').isVisible());
  console.log('video state:', await page.evaluate(() => {
    const v = document.querySelector('#html5-video');
    return v ? { paused: v.paused, currentTime: v.currentTime, readyState: v.readyState, error: v.error && v.error.code } : null;
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Playing live should record it in Continue watching.
  const liveHistory = await page.evaluate(() => {
    const record = window.IPTV.Store.getHistory('live', '101');
    return record ? { name: record.name, updated: !!record.updated } : null;
  });
  console.log('live watch recorded:', JSON.stringify(liveHistory));
  await page.click('[data-action="category"][data-category="continue"]');
  await page.waitForSelector('#view .channel-card', { timeout: 15000 });
  console.log('continue live cards:', await page.locator('#view .channel-card').count());
  await page.screenshot({ path: path.join(OUT, '12-continue-live.png') });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '13-reload.png') });
  console.log('auto-reconnect: shell visible');

  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="logout"]');
  await page.waitForSelector('.modal', { timeout: 10000 });
  await page.click('[data-modal-action="ok"]');
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(500);
  console.log('saved accounts:', await page.locator('#saved-list [data-account-id]').count());
  await page.screenshot({ path: path.join(OUT, '14-saved-accounts.png') });

  await page.click('#saved-list [data-account-id]');
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('.channel-card', { timeout: 15000 });
  console.log('saved account reconnect: shell visible');

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
