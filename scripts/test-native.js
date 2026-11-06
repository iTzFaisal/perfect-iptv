'use strict';
/* Verify the Tizen-native download fallback without a TV.
   It blocks fetch() (simulating a provider with no CORS headers) and
   emulates tizen.download + tizen.filesystem. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.resolve(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.__nativeFiles = {};
    window.__nativeDownloads = 0;
    window.__blockedFetch = 0;
    window.fetch = function () {
      window.__blockedFetch++;
      return Promise.reject(new TypeError('Simulated CORS failure'));
    };
    window.tizen = {
      systeminfo: { getCapability: function () { return true; } },
      DownloadRequest: function (url, destination, fileName) {
        this.url = url;
        this.destination = destination;
        this.fileName = fileName;
        this.httpHeader = {};
      },
      download: {
        start: function (request, callback) {
          window.__nativeDownloads++;
          const id = window.__nativeDownloads;
          realFetch(request.url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
          }).then(function (text) {
            window.__nativeFiles[request.fileName] = text;
            setTimeout(function () { callback.oncompleted(id, 'wgt-private-tmp/' + request.fileName); }, 5);
          }).catch(function (err) {
            setTimeout(function () { callback.onfailed(id, { name: err.name, message: err.message }); }, 5);
          });
          return id;
        },
        cancel: function () {}
      },
      filesystem: {
        resolve: function (location, onsuccess, onerror) {
          function fileFor(name) {
            const text = window.__nativeFiles[name];
            if (text == null) throw new Error('File not found');
            return {
              fileSize: text.length,
              openStream: function () {
                let position = 0;
                return {
                  read: function (bytes) {
                    if (position >= text.length) return '';
                    const chunk = text.slice(position, position + bytes);
                    position += chunk.length;
                    return chunk;
                  },
                  close: function () {}
                };
              }
            };
          }
          if (location === 'wgt-private-tmp') {
            setTimeout(function () {
              onsuccess({
                deleteFile: function (name) { delete window.__nativeFiles[name]; },
                resolve: fileFor
              });
            }, 0);
            return;
          }
          const name = String(location).split('/').pop();
          setTimeout(function () {
            try { onsuccess(fileFor(name)); } catch (err) { onerror(err); }
          }, 0);
        }
      }
    };
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGE: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });
  page.on('response', (res) => {
    // The app falls back to native downloads, so only page assets count here.
    if (res.status() >= 400 && res.url().startsWith(BASE)) {
      errors.push('HTTP ' + res.status() + ': ' + res.url());
    }
  });

  const ran = [];
  async function step(name, fn) {
    console.log('\n▶ ' + name);
    await fn();
    ran.push(name);
    console.log('✓ ' + name);
  }

  try {
    await step('native-login', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.fill('#login-server', BASE);
      await page.fill('#login-username', 'demo');
      await page.fill('#login-password', 'demo');
      await page.click('#login-submit');
      await page.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
      await page.waitForSelector('#view .channel-card', { timeout: 20000 });
      await page.waitForTimeout(500);
    });

    await step('native-fallback', async () => {
      const stats = await page.evaluate(() => ({
        blockedFetch: window.__blockedFetch,
        nativeDownloads: window.__nativeDownloads,
        apiMode: window.IPTV.apiMode,
        leftoverFiles: Object.keys(window.__nativeFiles).length,
        channels: document.querySelectorAll('.channel-card').length,
        preview: document.querySelector('.preview-name') && document.querySelector('.preview-name').textContent
      }));

      assert.ok(stats.blockedFetch > 0, 'fetch should be blocked during the native-fallback test');
      assert.ok(stats.nativeDownloads > 0, 'the native downloader should be used');
      assert.equal(stats.apiMode, 'native', 'the app should report native API mode');
      assert.ok(stats.channels > 0, 'channels should load through the native downloader');
      assert.ok(stats.preview, 'a focused channel should have a preview');
      assert.equal(stats.leftoverFiles, 0, 'temporary native download files should be deleted');
      await page.screenshot({ path: path.join(OUT, '12-native-fallback.png') });
      console.log('native stats:', stats);
    });

    assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
    console.log('\nSteps:  ' + ran.join(', '));
    console.log('Errors: none');
    console.log('NATIVE TEST PASSED');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('NATIVE TEST FAILED:', err);
  process.exit(1);
});
