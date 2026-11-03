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

  await page.fill('#login-name', 'Mock Provider');
  await page.fill('#login-server', BASE);
  await page.fill('#login-username', 'demo');
  await page.fill('#login-password', 'demo');
  await page.click('#login-submit');

  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('.channel-card', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '02-live.png') });

  console.log('channels:', await page.locator('.channel-card').count());
  console.log('preview name:', await page.locator('.preview-name').textContent());

  const focusBefore = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const focusAfter = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id'));
  console.log('d-pad focus:', focusBefore, '->', focusAfter, focusBefore !== focusAfter ? 'ok' : 'FAILED');

  await page.click('[data-action="open-epg"]');
  await page.waitForSelector('.epg-row', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '02b-epg.png') });
  console.log('epg rows:', await page.locator('.epg-row').count(),
    'catch-up buttons:', await page.locator('[data-action="catchup"]').count());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '03-movies.png') });
  console.log('movies:', await page.locator('.poster-card').count());

  await page.click('.poster-card');
  await page.waitForSelector('#modal-root:not(.hidden) .detail-plot', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04-movie-detail.png') });
  console.log('movie detail:', await page.locator('#modal-root .modal-head h2').textContent());
  await page.click('#modal-root [data-action="toggle-fav"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('.poster-card', { timeout: 15000 });
  await page.click('.poster-card');
  await page.waitForSelector('.season-chip', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '05-series-detail.png') });
  console.log('seasons:', await page.locator('.season-chip').count(), 'episodes:', await page.locator('.episode-row').count());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('.nav-item[data-view="search"]');
  await page.waitForSelector('#search-input');
  await page.fill('#search-input', 'Night');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '06-search.png') });
  console.log('search results:', await page.locator('#search-results .channel-card, #search-results .poster-card').count());

  await page.click('#search-results .poster-card');
  await page.waitForSelector('#modal-root:not(.hidden) .detail-plot', { timeout: 15000 });
  console.log('search detail:', await page.locator('#modal-root .modal-head h2').textContent());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.fill('#search-input', 'Arena');
  await page.press('#search-input', 'Enter');
  await page.waitForTimeout(1200);
  await page.click('#search-results .channel-card');
  await page.waitForTimeout(2000);
  console.log('search live playback:', await page.locator('#player').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.click('.nav-item[data-view="favorites"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="fav-tab"][data-tab="vod"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '07-favorites.png') });
  console.log('favorite movies:', await page.locator('#view .poster-card').count());

  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '08-settings.png') });

  await page.click('.nav-item[data-view="live"]');
  await page.waitForSelector('.channel-card');
  await page.waitForTimeout(500);
  await page.click('[data-action="play-live"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '09-player.png') });
  console.log('player visible:', await page.locator('#player').isVisible());
  console.log('video state:', await page.evaluate(() => {
    const v = document.querySelector('#html5-video');
    return v ? { paused: v.paused, currentTime: v.currentTime, readyState: v.readyState, error: v.error && v.error.code } : null;
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '10-reload.png') });
  console.log('auto-reconnect: shell visible');

  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="logout"]');
  await page.waitForSelector('.modal', { timeout: 10000 });
  await page.click('[data-modal-action="ok"]');
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(500);
  console.log('saved accounts:', await page.locator('#saved-list [data-account-id]').count());
  await page.screenshot({ path: path.join(OUT, '11-saved-accounts.png') });

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
