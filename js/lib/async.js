/* @requires: none
   @exports: IPTV.debounce, IPTV.sleep, IPTV.errorMessage */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function errorMessage(err) {
    if (!err) return 'Something went wrong.';
    if (err.name === 'AbortError') return 'The server took too long to respond.';
    return err.message || String(err);
  }

  return { debounce: debounce, sleep: sleep, errorMessage: errorMessage };
});
