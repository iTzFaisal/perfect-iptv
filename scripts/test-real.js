'use strict';
/* Optional real-provider smoke test. Reads ../iptv-auth.txt (gitignored)
   and expects proxy/server.js on :8787. Never logs credentials. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'iptv-auth.txt'), 'utf8').split(/\r?\n/);
const map = {};
for (const line of lines) {
  const i = line.indexOf(':');
  if (i < 0) continue;
  map[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
}
const server = map.url || map.server || map.host;
const username = map.username || map.user;
const password = map.password || map.pass;
if (!server || !username || !password) {
  console.error('Could not parse iptv-auth.txt (expected username/password/url lines).');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGE: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text().slice(0, 160));
  });

  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await page.fill('#login-server', server);
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('details.advanced summary');
  await page.fill('#login-proxy', 'http://localhost:8787');
  await page.click('#login-submit');

  await page.waitForSelector('#shell:not(.hidden)', { timeout: 90000 });
  await page.waitForSelector('.channel-card', { timeout: 90000 });
  await page.waitForTimeout(1500);

  const live = await page.evaluate(() => ({
    categories: IPTV.App.state.live.categories.length,
    streams: IPTV.App.state.live.items.length,
    rendered: document.querySelectorAll('#view .channel-card').length,
    accountStatus: IPTV.Store.activeAccount() && IPTV.Store.activeAccount().userInfo.status,
    expiry: IPTV.Store.activeAccount() && IPTV.Store.activeAccount().userInfo.exp_date
  }));
  console.log('live:', live);

  await page.waitForTimeout(2500);
  const epgPreview = await page.evaluate(() => ({
    hasProgram: !!document.querySelector('#live-preview .program'),
    loading: IPTV.App.state.live.epgLoading,
    listings: (IPTV.App.state.live.epg || []).length
  }));
  console.log('epg preview:', epgPreview);

  await page.click('[data-action="open-epg"]');
  try {
    await page.waitForSelector('.epg-row', { timeout: 30000 });
    console.log('epg modal rows:', await page.locator('.epg-row').count(),
      'catch-up:', await page.locator('[data-action="catchup"]').count());
  } catch (err) {
    console.log('epg modal: no rows');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('.nav-item[data-view="movies"]');
  await page.waitForSelector('.poster-card', { timeout: 90000 });
  await page.waitForTimeout(800);
  const vod = await page.evaluate(() => ({
    categories: IPTV.App.state.vod.categories.length,
    streams: IPTV.App.state.vod.items.length,
    rendered: document.querySelectorAll('#view .poster-card').length
  }));
  console.log('vod:', vod);

  await page.click('.nav-item[data-view="series"]');
  await page.waitForSelector('.poster-card', { timeout: 90000 });
  await page.waitForTimeout(800);
  const series = await page.evaluate(() => ({
    categories: IPTV.App.state.series.categories.length,
    streams: IPTV.App.state.series.items.length,
    rendered: document.querySelectorAll('#view .poster-card').length
  }));
  console.log('series:', series);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('REAL TEST FAILED:', err.message);
  process.exit(1);
});
