#!/usr/bin/env node
'use strict';
/* Verify that every place that records the app version agrees. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function match(rel, pattern, label) {
  const found = pattern.exec(read(rel));
  if (!found) {
    console.error('check-version: could not find ' + label + ' in ' + rel);
    process.exit(1);
  }
  return found[1];
}

const values = [
  ['config.xml', match('config.xml', /<widget[\s\S]*?\bversion="([^"]+)"/, 'widget version')],
  ['package.json', JSON.parse(read('package.json')).version],
  ['js/app.js', match('js/app.js', /\bvar VERSION = '([^']+)'/, 'VERSION')],
  ['js/screens.js', match('js/screens.js', /appVersion\s*\|\|\s*'([^']+)'/, 'Settings version fallback')]
];

console.log('Version check:');
for (const [file, version] of values) {
  console.log('  ' + file.padEnd(16) + version);
}

const expected = values[0][1];
const mismatched = values.filter(([, version]) => version !== expected);
if (mismatched.length) {
  console.error('\nVersion mismatch — expected ' + expected + ' from config.xml:');
  for (const [file, version] of mismatched) {
    console.error('  ' + file + ' -> ' + version);
  }
  console.error('Keep config.xml, package.json, js/app.js, and js/screens.js in sync.');
  process.exit(1);
}

// Documentation examples are allowed to lag by one release, but warn so the
// next version bump does not leave copy-paste instructions that build nothing.
const stale = [];
for (const rel of ['README.md', 'scripts/deploy.sh', '.github/workflows/release.yml']) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const pattern = /(?:PerfectIPTV-|v)(\d+\.\d+\.\d+)/g;
  let hit;
  while ((hit = pattern.exec(text))) {
    if (hit[1] !== expected) stale.push(rel + ' -> ' + hit[0]);
  }
}
if (stale.length) {
  const unique = [...new Set(stale)];
  console.warn('\nWarning: stale version examples (not fatal):');
  unique.forEach((entry) => console.warn('  ' + entry));
}

console.log('Versions agree: ' + expected);
