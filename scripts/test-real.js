'use strict';
/* Optional real-provider smoke test. Reads ../iptv-auth.txt (gitignored)
   and expects proxy/server.js on :8787. Never logs credentials. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
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

  const ran = [];
  async function step(name, fn) {
    console.log('\n▶ ' + name);
    await fn();
    ran.push(name);
    console.log('✓ ' + name);
  }

  try {
    await step('real-login', async () => {
      await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
      await page.fill('#login-server', server);
      await page.fill('#login-username', username);
      await page.fill('#login-password', password);
      await page.click('details.advanced summary');
      await page.fill('#login-proxy', 'http://localhost:8787');
      await page.click('#login-submit');
      await page.waitForSelector('#shell:not(.hidden)', { timeout: 90000 });
      await page.waitForSelector('#view .channel-card', { timeout: 90000 });
      await page.waitForTimeout(1200);
    });

    await step('real-live', async () => {
      const live = await page.evaluate(() => ({
        categories: IPTV.App.state.live.categories.length,
        streams: IPTV.App.state.live.items.length,
        rendered: document.querySelectorAll('#view .channel-card').length,
        accountStatus: IPTV.Store.activeAccount() && IPTV.Store.activeAccount().userInfo.status,
        expiry: IPTV.Store.activeAccount() && IPTV.Store.activeAccount().userInfo.exp_date
      }));
      console.log('live:', live);
      assert.ok(live.categories > 0, 'live categories should load');
      assert.ok(live.streams > 0, 'live streams should load');
      assert.ok(live.rendered > 0, 'live channels should render');
      assert.ok(live.accountStatus, 'the account should report a status');
    });

    await step('real-epg', async () => {
      await page.waitForTimeout(2000);
      const epgPreview = await page.evaluate(() => ({
        hasProgram: !!document.querySelector('#live-preview .program'),
        loading: IPTV.App.state.live.epgLoading,
        listings: (IPTV.App.state.live.epg || []).length
      }));
      console.log('epg preview:', epgPreview);
      assert.equal(epgPreview.loading, false, 'EPG loading should finish');

      await page.click('[data-action="open-epg"]');
      try {
        await page.waitForSelector('#modal-root .epg-row', { timeout: 30000 });
        const rows = await page.locator('#modal-root .epg-row').count();
        assert.ok(rows > 0, 'guide modal should list rows when the provider publishes EPG');
        console.log('epg modal rows:', rows,
          'catch-up:', await page.locator('#modal-root [data-action="catchup"]').count());
      } catch (err) {
        // Some panels publish no EPG at all; the modal must still open cleanly.
        assert.ok(await page.locator('#modal-root .empty-state').count() > 0,
          'a provider without EPG should show an empty guide, not fail');
        console.log('epg modal: provider publishes no guide data');
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('#modal-root', { state: 'hidden' });
    });

    await step('real-vod', async () => {
      await page.click('.nav-item[data-view="movies"]');
      await page.waitForSelector('#view .poster-card', { timeout: 90000 });
      const vod = await page.evaluate(() => ({
        categories: IPTV.App.state.vod.categories.length,
        streams: IPTV.App.state.vod.items.length,
        rendered: document.querySelectorAll('#view .poster-card').length
      }));
      console.log('vod:', vod);
      assert.ok(vod.categories > 0, 'VOD categories should load');
      assert.ok(vod.streams > 0, 'VOD streams should load');
      assert.ok(vod.rendered > 0, 'movies should render');
    });

    await step('real-series', async () => {
      await page.click('.nav-item[data-view="series"]');
      await page.waitForSelector('#view .poster-card', { timeout: 90000 });
      const series = await page.evaluate(() => ({
        categories: IPTV.App.state.series.categories.length,
        streams: IPTV.App.state.series.items.length,
        rendered: document.querySelectorAll('#view .poster-card').length
      }));
      console.log('series:', series);
      assert.ok(series.categories > 0, 'series categories should load');
      assert.ok(series.streams > 0, 'series should load');
      assert.ok(series.rendered > 0, 'series should render');
    });

    assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
    console.log('\nSteps:  ' + ran.join(', '));
    console.log('Errors: none');
    console.log('REAL TEST PASSED');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('REAL TEST FAILED:', err);
  process.exit(1);
});
