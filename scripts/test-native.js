'use strict';
/* Verify the Tizen-native download fallback without a TV.
   It blocks fetch() (simulating a provider with no CORS headers) and
   emulates tizen.download + tizen.filesystem. */
const { chromium } = require('playwright');
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#login-server', BASE);
  await page.fill('#login-username', 'demo');
  await page.fill('#login-password', 'demo');
  await page.click('#login-submit');
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 20000 });
  await page.waitForSelector('.channel-card', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, '12-native-fallback.png') });

  const stats = await page.evaluate(() => ({
    blockedFetch: window.__blockedFetch,
    nativeDownloads: window.__nativeDownloads,
    leftoverFiles: Object.keys(window.__nativeFiles).length,
    channels: document.querySelectorAll('.channel-card').length,
    preview: document.querySelector('.preview-name') && document.querySelector('.preview-name').textContent
  }));
  console.log('native fallback:', stats);
  console.log('errors:', errors.length ? errors : 'none');

  const ok = stats.channels > 0 && stats.nativeDownloads > 0 && stats.blockedFetch > 0;
  await browser.close();
  if (!ok) process.exit(1);
})().catch((err) => {
  console.error('NATIVE TEST FAILED:', err);
  process.exit(1);
});
