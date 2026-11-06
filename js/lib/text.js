/* @requires: none
   @exports: IPTV.esc, IPTV.icon, IPTV.initials, IPTV.b64Decode */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function initials(name) {
    var clean = String(name || '?').replace(/[^\w\s\u0600-\u06FF]/g, ' ').trim();
    var parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function b64Decode(value) {
    if (!value) return '';
    try {
      var binary = atob(value);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
      return String(value);
    }
  }

  return { esc: esc, icon: icon, initials: initials, b64Decode: b64Decode };
});
