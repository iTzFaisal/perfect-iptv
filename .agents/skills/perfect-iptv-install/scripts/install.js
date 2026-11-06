#!/usr/bin/env node
'use strict';
/*
 * Install a Perfect IPTV .wgt on the Samsung TV through Tizen Homebrew.
 *
 *   node .agents/skills/perfect-iptv-install/scripts/install.js \
 *     --url http://192.168.1.133:8091
 *
 * The PIN comes from HB_PIN or the last successful local cache and is never
 * printed. The TV's Homebrew page re-signs the unsigned package for that TV,
 * so this works without Tizen Studio.
 *
 * Exit codes: 0 installed, 1 preflight, 2 TV rejected, 3 pairing, 4 timeout,
 *             5 pairing required (no PIN supplied).
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
// Last known TV address. DHCP can change it, so callers may override --url.
const DEFAULT_URL = 'http://192.168.1.133:8091';
const EXPECTED_PACKAGE = 'iTzFaisal1';
const EXPECTED_APP_ID = 'iTzFaisal1.PerfectIPTV';
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
// Homebrew stores its last successful PIN under this localStorage key.
const PIN_STORAGE_KEY = 'tizen-homebrew.pin';
// Keep the remembered PIN outside the repo, readable only by this user.
const PIN_FILE = path.join(os.homedir(), '.config', 'perfect-iptv', 'homebrew-pin');

function usage() {
  console.log([
    'Usage: node .agents/skills/perfect-iptv-install/scripts/install.js [options]',
    '',
    'Options:',
    '  --url <url>    Tizen Homebrew address shown on the TV (last known: ' + DEFAULT_URL + ')',
    '  --wgt <file>   package to install (default dist/PerfectIPTV-<config version>.wgt)',
    '  --dry-run      check the TV page and the package, do not pair or install',
    '  --help         show this help',
    '',
    'Environment:',
    '  HB_PIN         six-digit PIN shown on the TV; overrides the remembered PIN',
    '',
    'The last successful PIN is remembered at:',
    '  ' + PIN_FILE,
    'and offered automatically while the TV keeps the same PIN.'
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

function readSavedPin() {
  try {
    const pin = fs.readFileSync(PIN_FILE, 'utf8').trim();
    return /^\d{6}$/.test(pin) ? pin : '';
  } catch (err) {
    return '';
  }
}

function savePin(pin) {
  if (!/^\d{6}$/.test(pin)) return;
  try {
    const dir = path.dirname(PIN_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dir, 0o700); } catch (err) { /* best effort */ }
    fs.writeFileSync(PIN_FILE, pin + '\n', { mode: 0o600 });
    try { fs.chmodSync(PIN_FILE, 0o600); } catch (err) { /* best effort */ }
  } catch (err) {
    console.error('WARNING: could not remember the PIN for future runs: ' + err.message);
  }
}

function forgetPin() {
  try {
    fs.unlinkSync(PIN_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('WARNING: could not remove the saved PIN: ' + err.message);
    }
  }
}

async function runInstall(opts, pin, source, pkg) {
  const screenshot = path.join(ROOT, 'screenshots', 'homebrew-install-' + pkg.version + '.png');
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (err) => console.error('[page] ' + err.message));

  if (source === 'saved' && pin) {
    await page.addInitScript(function (args) {
      try { window.localStorage.setItem(args.key, args.pin); } catch (err) { /* ignore */ }
    }, { key: PIN_STORAGE_KEY, pin: pin });
  }

  try {
    if (source === 'saved') {
      console.log('Offering the last successful PIN from this computer (not printed).');
    }
    console.log('Opening ' + opts.url + ' ...');
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#pin, button[data-focus="tab:upload"]', { timeout: 15000 });

    const uploadVisible = await page.locator('button[data-focus="tab:upload"]')
      .isVisible().catch(() => false);
    const pinVisible = await page.locator('#pin').isVisible().catch(() => false);

    if (uploadVisible) {
      console.log(source === 'saved'
        ? 'TV is paired; the remembered PIN was accepted.'
        : 'TV is already paired; no PIN needed.');
    } else if (pinVisible) {
      if (source === 'saved') {
        const fault = page.locator('#status .state-fault').first();
        if (await fault.count()) {
          const message = (await fault.innerText()).replace(/\s+/g, ' ').trim();
          forgetPin();
          console.error('SAVED PIN REJECTED: ' + (message || 'the TV no longer accepts the last PIN.'));
          console.error('The TV or Homebrew probably restarted, so its PIN changed. ' +
            'The stale PIN was forgotten; ask for the current PIN and rerun with HB_PIN.');
          return 5;
        }
        console.log('The saved PIN was not offered automatically; trying it once.');
      }
      if (!/^\d{6}$/.test(pin)) {
        console.error('PAIRING REQUIRED: this TV needs the 6-digit PIN shown on Tizen Homebrew.');
        console.error('Ask for the current PIN, then rerun with HB_PIN set. Not guessing.');
        return 5;
      }
      console.log('Pairing with the PIN from the TV (one attempt)...');
      await page.fill('#pin', pin);
      const paired = await Promise.race([
        page.waitForSelector('button[data-focus="tab:upload"]', { timeout: 20000 }).then(() => true),
        page.waitForSelector('#status .state-fault', { timeout: 20000 }).then(() => false)
      ]).catch(() => null);

      if (paired === false) {
        const message = (await page.locator('#status').innerText()).replace(/\s+/g, ' ').trim();
        forgetPin();
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
      savePin(pin);
      console.log('Paired and remembered for future runs.');
    } else {
      console.error('Could not find the Homebrew upload screen or PIN field on the TV page.');
      console.error('Ask the user for the address shown on the TV, then rerun with --url.');
      return 1;
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

  const envPin = (process.env.HB_PIN || '').trim();
  const savedPin = readSavedPin();
  const pin = envPin || savedPin;
  const source = envPin ? 'env' : (savedPin ? 'saved' : '');
  return runInstall(opts, pin, source, pkg);
})().then((code) => process.exit(code)).catch((err) => {
  console.error('ERROR: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
