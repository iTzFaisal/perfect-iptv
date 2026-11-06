/* @requires: none
   @exports: IPTV.Seek */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.IPTV = root.IPTV || {};
  root.IPTV.Seek = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // A quick tap always seeks this many seconds.
  var TAP_SECONDS = 10;

  // Acceleration only starts once the direction key has been held this long,
  // so a tap never picks up a stray fraction of a second.
  var HOLD_DELAY_MS = 350;

  // Speed is seconds of content per second of wall-clock time. Holding the
  // key walks through these tiers, so a long press sweeps a movie quickly.
  var TIERS = [
    { at: 0, speed: 8 },
    { at: 400, speed: 16 },
    { at: 800, speed: 32 },
    { at: 1200, speed: 64 },
    { at: 1600, speed: 128 },
    { at: 2000, speed: 256 },
    { at: 2400, speed: 512 }
  ];

  function speedAt(holdMs) {
    holdMs = Number(holdMs) || 0;
    if (holdMs < HOLD_DELAY_MS) return 0;
    var elapsed = holdMs - HOLD_DELAY_MS;
    var speed = TIERS[0].speed;
    for (var i = 0; i < TIERS.length; i++) {
      if (elapsed < TIERS[i].at) break;
      speed = TIERS[i].speed;
    }
    return speed;
  }

  // Integral of the speed curve: extra seconds to add after the first tap.
  function distanceAt(holdMs) {
    holdMs = Number(holdMs) || 0;
    if (holdMs < HOLD_DELAY_MS) return 0;
    var elapsed = holdMs - HOLD_DELAY_MS;
    var distance = 0;
    for (var i = 0; i < TIERS.length; i++) {
      var start = TIERS[i].at;
      var end = i + 1 < TIERS.length ? TIERS[i + 1].at : Infinity;
      if (elapsed <= start) break;
      distance += (Math.min(elapsed, end) - start) * TIERS[i].speed;
    }
    return distance / 1000;
  }

  function clamp(target, duration) {
    target = Number(target) || 0;
    duration = Number(duration) || 0;
    if (duration > 0) target = Math.min(target, Math.max(0, duration - 1));
    return Math.max(0, target);
  }

  return {
    TAP_SECONDS: TAP_SECONDS,
    HOLD_DELAY_MS: HOLD_DELAY_MS,
    speedAt: speedAt,
    distanceAt: distanceAt,
    clamp: clamp
  };
});
