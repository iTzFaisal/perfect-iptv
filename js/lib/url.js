/* @requires: none
   @exports: IPTV.normalizeServer, IPTV.parseProviderInput, IPTV.absUrl,
             IPTV.hash, IPTV.uid */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function normalizeServer(input) {
    var raw = String(input || '').trim();
    if (!raw) throw new Error('Please enter your provider server URL.');
    raw = raw.replace(/\s+/g, '');
    if (raw.indexOf('//') === 0) raw = 'http:' + raw;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'http://' + raw;
    raw = raw.replace(/\/player_api\.php.*$/i, '');
    raw = raw.replace(/\/get\.php.*$/i, '');
    raw = raw.replace(/\/+$/, '');
    var url;
    try { url = new URL(raw); } catch (err) { throw new Error('That server URL does not look valid.'); }
    if (!url.hostname) throw new Error('That server URL does not look valid.');
    return url.protocol + '//' + url.host + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''));
  }

  function parseProviderInput(input) {
    var raw = String(input || '').trim();
    var out = { server: raw, username: '', password: '' };
    if (!raw) return out;
    try {
      var withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw;
      var url = new URL(withScheme);
      var u = url.searchParams.get('username');
      var p = url.searchParams.get('password');
      if (u) out.username = u;
      if (p) out.password = p;
      out.server = url.protocol + '//' + url.host + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''))
        .replace(/\/player_api\.php$/i, '')
        .replace(/\/get\.php$/i, '');
    } catch (err) { /* leave as typed */ }
    return out;
  }

  function absUrl(server, value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return (String(server).indexOf('https://') === 0 ? 'https:' : 'http:') + url;
    if (/^data:/i.test(url)) return url;
    return String(server || '').replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
  }

  function hash(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'a' + h.toString(36);
  }

  function uid() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    normalizeServer: normalizeServer,
    parseProviderInput: parseProviderInput,
    absUrl: absUrl,
    hash: hash,
    uid: uid
  };
});
