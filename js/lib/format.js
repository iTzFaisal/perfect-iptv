/* @requires: none
   @exports: IPTV.fmtTime, IPTV.fmtClock, IPTV.fmtDuration, IPTV.fmtPosition,
             IPTV.fmtDate, IPTV.fmtAgo */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(ms, mode) {
    if (!ms || isNaN(ms)) return '--:--';
    var d = new Date(ms);
    var h = d.getHours();
    var m = pad(d.getMinutes());
    if (mode === '12h') {
      var suffix = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 || 12;
      return h12 + ':' + m + ' ' + suffix;
    }
    return pad(h) + ':' + m;
  }

  function fmtClock(date, mode) {
    date = date || new Date();
    return fmtTime(date.getTime(), mode);
  }

  function fmtDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '—';
    seconds = Math.max(0, Math.round(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.round((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function fmtPosition(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    seconds = Math.max(0, Math.round(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  }

  function fmtDate(timestamp) {
    if (!timestamp) return '—';
    var ms = Number(timestamp);
    if (ms < 100000000000) ms *= 1000;
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtAgo(timestamp) {
    var ms = Number(timestamp || 0);
    if (!ms) return '';
    var diff = Date.now() - ms;
    if (diff < 0) diff = 0;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' hr ago';
    var days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    return fmtDate(ms);
  }

  return {
    fmtTime: fmtTime,
    fmtClock: fmtClock,
    fmtDuration: fmtDuration,
    fmtPosition: fmtPosition,
    fmtDate: fmtDate,
    fmtAgo: fmtAgo
  };
});
