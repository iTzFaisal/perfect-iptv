'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const text = require('../../js/lib/text.js');

test('esc neutralizes HTML and attribute characters', () => {
  assert.equal(text.esc('& < > " \''), '&amp; &lt; &gt; &quot; &#39;');
  assert.equal(text.esc(null), '');
  assert.equal(text.esc(undefined), '');
});

test('esc keeps unicode and provider names intact', () => {
  const name = 'قناة & "الأخبار" <HD>';
  assert.equal(text.esc(name), 'قناة &amp; &quot;الأخبار&quot; &lt;HD&gt;');
});

test('initials handles one word, multiple words, and empty input', () => {
  assert.equal(text.initials('John Doe'), 'JD');
  assert.equal(text.initials('CNN'), 'CN');
  assert.equal(text.initials(''), '?');
  assert.equal(text.initials('أحمد علي'), 'أع');
});

test('b64Decode decodes UTF-8 and falls back to the input', () => {
  assert.equal(text.b64Decode(Buffer.from('Hello world').toString('base64')), 'Hello world');
  assert.equal(text.b64Decode(Buffer.from('مرحبا').toString('base64')), 'مرحبا');
  assert.equal(text.b64Decode('***'), '***');
  assert.equal(text.b64Decode(''), '');
});

test('icon renders an escaped SVG sprite reference', () => {
  assert.equal(text.icon('play'), '<svg class="icon " aria-hidden="true"><use href="#i-play"/></svg>');
  assert.match(text.icon('play', 'big'), /class="icon big"/);
});
