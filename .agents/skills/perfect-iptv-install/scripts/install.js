#!/usr/bin/env node
'use strict';
/*
 * Install a Perfect IPTV .wgt on the Samsung TV through Tizen Homebrew.
 *
 *   node .agents/skills/perfect-iptv-install/scripts/install.js \
 *     --url http://192.168.1.133:8091
 *
 * The PIN comes from HB_PIN and is never printed. The TV's Homebrew page
 * re-signs the unsigned package for that TV, so this works without Tizen Studio.
 *
 * Exit codes: 0 installed, 1 preflight, 2 TV rejected, 3 pairing, 4 timeout.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_URL = 'http://192.168.1.133:8091';
const EXPECTED_PACKAGE = 'iTzFaisal1';
const EXPECTED_APP_ID = 'iTzFaisal1.PerfectIPTV';
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

function usage() {
  console.log([
    'Usage: node .agents/skills/perfect-iptv-install/scripts/install.js [options]',
    '',
    'Options:',
    '  --url <url>    Tizen Homebrew address shown on the TV (default ' + DEFAULT_URL + ')',
    '  --wgt <file>   package to install (default dist/PerfectIPTV-<config version>.wgt)',
    '  --dry-run      check the TV page and the package, do not pair or install',
    '  --help         show this help',
    '',
    'Environment:',
    '  HB_PIN         six-digit PIN shown on the TV; required unless --dry-run'
  ].join('\n'));
}

function parseArgs(argv) {
  const opts = { url: DEFAULT_URL, wgt: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--url' || arg === '--wgt') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(arg + ' needs a value', 1);
      opts[arg.slice(2)] = value;
      i += 1;
    } else {
      fail('unknown option: ' + arg + ' (use --help)', 1);
    }
  }
  return opts;
}

function fail(message, code) {
  console.error('ERROR: ' + message);
  process.exit(code || 1);
}

function normalizeUrl(value) {
  const url = /^https?:\/\//i.test(value) ? value : 'http://' + value;
  return url.replace(/\/+$/, '');
}

function configVersion() {
  const xml = fs.readFileSync(path.join(ROOT, 'config.xml'), 'utf8');
  const match = xml.match(/<widget\b[^>]*\bversion="([^"]+)"/);
  if (!match) fail('could not read the version from config.xml', 1);
  return match[1];
}

function inspectWgt(file) {
  if (!fs.existsSync(file)) {
    fail('package not found: ' + file + '\nBuild it with perfect-iptv-build first.', 1);
  }
  let xml;
  try {
    xml = execFileSync('unzip', ['-p', file, 'config.xml'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    });
  } catch (err) {
    if (err.code === 'ENOENT') fail('unzip is required but was not found on PATH', 1);
    fail('could not read config.xml from ' + file + ' (is it a .wgt?)', 1);
  }
  const version = (xml.match(/<widget\b[^>]*\bversion="([^"]+)"/) || [])[1];
  const packageId = (xml.match(/<tizen:application\b[^>]*\bpackage="([^"]+)"/) || [])[1];
  const appId = (xml.match(/<tizen:application\b[^>]*\bid="([^"]+)"/) || [])[1];
  const name = (xml.match(/<name>([^<]+)<\/name>/) || [])[1] || 'Perfect IPTV';
  if (!version) fail('package has no version: ' + file, 1);
  if (packageId !== EXPECTED_PACKAGE || appId !== EXPECTED_APP_ID) {
    fail('unexpected package (' + (packageId || '?') + ' / ' + (appId || '?') +
      '); expected ' + EXPECTED_PACKAGE + ' / ' + EXPECTED_APP_ID, 1);
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { file, name, version, packageId, appId, hash, size: fs.statSync(file).size };
}

async function checkHomebrew(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
  } catch (err) {
    const reason = err.cause && (err.cause.code || err.cause.message) || err.message;
    fail('cannot reach ' + url + ' (' + reason + ').\n' +
      'Read the current address from Tizen Homebrew on the TV and pass --url.', 1);
  }
  const body = await res.text();
  if (!res.ok) fail(url + ' answered HTTP ' + res.status + '; is this the TV?', 1);
  if (!/tizen\s*homebrew/i.test(body)) {
    fail(url + ' does not look like the Tizen Homebrew page; check the address on the TV.', 1);
  }
}

function pkgLine(pkg) {
  return pkg.name + ' ' + pkg.version + ' (' + pkg.packageId + ', ' + Math.round(pkg.size / 1024) + ' KB)';
}

async function runInstall(opts, pin, pkg) {
  const screenshot = path.join(ROOT, 'screenshots', 'homebrew-install-' + pkg.version + '.png');
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (err) => console.error('[page] ' + err.message));

  try {
    console.log('Opening ' + opts.url + ' ...');
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#pin, button[data-focus="tab:upload"]', { timeout: 15000 });

    if (await page.locator('#pin').count()) {
      console.log('Pairing with the PIN from the TV (one attempt)...');
      await page.fill('#pin', pin);
      const paired = await Promise.race([
        page.waitForSelector('button[data-focus="tab:upload"]', { timeout: 20000 }).then(() => true),
        page.waitForSelector('#status .state-fault', { timeout: 20000 }).then(() => false)
      ]).catch(() => null);

      if (paired === false) {
        const message = (await page.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
        await page.screenshot({ path: screenshot, fullPage: true });
        console.error('PAIRING FAILED: ' + message);
        console.error('The PIN is wrong, stale, or pairing is locked. Restart Tizen Homebrew, ' +
          'ask for the new PIN, and try once. Not retrying automatically.');
        return 3;
      }
      if (paired === null) {
        await page.screenshot({ path: screenshot, fullPage: true });
        console.error('PAIRING TIMED OUT: the TV did not respond to the PIN.');
        return 4;
      }
      console.log('Paired.');
    }

    console.log('Uploading ' + pkgLine(pkg) + ' ...');
    await page.click('button[data-focus="tab:upload"]');
    await page.setInputFiles('#file', pkg.file);
    await page.waitForSelector('#panel button[data-focus="upload"]', { timeout: 20000 });

    const identity = (await page.locator('#panel .ident').first().innerText()).replace(/\s+/g, ' ').trim();
    console.log('Selected: ' + identity);

    await page.click('#panel button[data-focus="upload"]');

    let lastProgress = '';
    const timer = setInterval(async () => {
      try {
        const current = (await page.locator('#outcome').innerText()).replace(/\s+/g, ' ').trim();
        if (current && current !== lastProgress) {
          lastProgress = current;
          console.log('[homebrew] ' + current);
        }
      } catch (err) { /* page closing */ }
    }, 3000);

    const result = await Promise.race([
      page.waitForSelector('#outcome .state-ok', { timeout: INSTALL_TIMEOUT_MS }).then(() => 'ok'),
      page.waitForSelector('#outcome .state-fault', { timeout: INSTALL_TIMEOUT_MS }).then(() => 'fault')
    ]).catch(() => 'timeout');
    clearInterval(timer);

    await page.waitForTimeout(800);
    const outcome = (await page.locator('#outcome').innerText()).trim();
    await page.screenshot({ path: screenshot, fullPage: true });

    if (result === 'ok' && /INSTALLED/i.test(outcome)) {
      console.log('INSTALLED: ' + outcome.replace(/\s+/g, ' ').trim());
      console.log('Screenshot: ' + path.relative(ROOT, screenshot));
      return 0;
    }
    if (result === 'fault') {
      console.error('TV REJECTED THE INSTALL:\n' + outcome);
      console.error('Screenshot: ' + path.relative(ROOT, screenshot));
      return 2;
    }
    console.error('TIMEOUT waiting for the TV to finish installing. Check the TV screen.');
    console.error('Screenshot: ' + path.relative(ROOT, screenshot));
    return 4;
  } catch (err) {
    console.error('ERROR: ' + (err && err.message ? err.message : err));
    return 1;
  } finally {
    try { await browser.close(); } catch (err) { /* ignore */ }
  }
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return 0;
  }

  opts.url = normalizeUrl(opts.url);
  const version = configVersion();
  opts.wgt = path.resolve(ROOT, opts.wgt || path.join('dist', 'PerfectIPTV-' + version + '.wgt'));

  const pkg = inspectWgt(opts.wgt);
  console.log('Package: ' + pkg.file);
  console.log('Identity: ' + pkgLine(pkg));
  console.log('SHA256: ' + pkg.hash);

  await checkHomebrew(opts.url);
  console.log('Tizen Homebrew: ' + opts.url);

  if (opts.dryRun) {
    console.log('DRY RUN OK: page reachable and package valid; nothing was installed.');
    return 0;
  }

  const pin = process.env.HB_PIN || '';
  if (!/^\d{6}$/.test(pin)) {
    fail('set HB_PIN to the 6-digit PIN shown on the TV (do not guess).', 1);
  }

  return runInstall(opts, pin, pkg);
})().then((code) => process.exit(code)).catch((err) => {
  console.error('ERROR: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
