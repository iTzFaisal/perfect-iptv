#!/usr/bin/env node
'use strict';
/* Verify index.html loads every runtime script exactly once, in a safe order. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const scripts = [];
const scriptPattern = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g;
let hit;
while ((hit = scriptPattern.exec(html))) {
  if (hit[1].startsWith('js/')) scripts.push(hit[1]);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}

const onDisk = walk(path.join(ROOT, 'js')).sort();
const counts = {};
for (const src of scripts) counts[src] = (counts[src] || 0) + 1;

const problems = [];
for (const src of scripts) {
  if (counts[src] > 1) problems.push('duplicate script: ' + src);
}
for (const file of onDisk) {
  if (!counts[file]) problems.push('missing from index.html: ' + file);
}
for (const src of scripts) {
  if (!onDisk.includes(src)) problems.push('index.html references a missing file: ' + src);
}

const index = (file) => scripts.indexOf(file);
const core = index('js/core.js');
const app = index('js/app.js');

if (core < 0) problems.push('js/core.js is not loaded');
if (app < 0) problems.push('js/app.js is not loaded');

if (core >= 0) {
  for (const src of scripts) {
    if (src.startsWith('js/lib/') && index(src) > core) {
      problems.push(src + ' must load before js/core.js');
    }
  }
  if (!scripts.slice(0, core).every((src) => src.startsWith('js/lib/'))) {
    problems.push('only js/lib/*.js may load before js/core.js');
  }
}

const chain = [
  'js/core.js',
  'js/ui.js',
  'js/player.js',
  'js/screens.js',
  'js/app-live.js',
  'js/app-vod.js',
  'js/app-series.js',
  'js/app-account.js',
  'js/app-catalog.js',
  'js/app.js'
];
let previous = -1;
let previousName = null;
for (const file of chain) {
  const position = index(file);
  if (position < 0) {
    if (file === 'js/app.js' || file === 'js/core.js') continue;
    // Feature modules are allowed to be absent until they are introduced,
    // but the core chain must never be skipped once it exists.
    continue;
  }
  if (position < previous) {
    problems.push(file + ' must load after ' + previousName);
  }
  previous = position;
  previousName = file;
}

// lib files have their own dependency order.
const libOrder = [
  'js/lib/text.js',
  'js/lib/format.js',
  'js/lib/url.js',
  'js/lib/async.js',
  'js/lib/catalog.js',
  'js/lib/history.js',
  'js/lib/store.js',
  'js/lib/xtream.js'
];
let previousLib = -1;
for (const file of libOrder) {
  const position = index(file);
  if (position < 0) continue;
  if (position < previousLib) problems.push(file + ' is out of dependency order');
  previousLib = position;
}

if (app >= 0 && scripts[scripts.length - 1] !== 'js/app.js') {
  problems.push('js/app.js must be the last script tag');
}

if (problems.length) {
  console.error('Script manifest check failed:');
  problems.forEach((problem) => console.error('  - ' + problem));
  console.error('\nLoad order:');
  scripts.forEach((src, i) => console.error('  ' + String(i + 1).padStart(2) + '. ' + src));
  process.exit(1);
}

console.log('Script manifest OK: ' + scripts.length + ' runtime scripts, ' + onDisk.length + ' files on disk.');
