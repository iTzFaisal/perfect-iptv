/* ============================================================
   Perfect IPTV — AVPlay (Samsung hardware) + HTML5/hls.js player
   ============================================================ */
/* @requires: IPTV.$, IPTV.UI, IPTV.Store, IPTV.fmtTime, IPTV.fmtPosition
   @exports: IPTV.Player */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var $ = IPTV.$;
  var UI = IPTV.UI;

  var PLAYER_STATES = { NONE: 'NONE', IDLE: 'IDLE', READY: 'READY', PLAYING: 'PLAYING', PAUSED: 'PAUSED' };

  var session = null;
  var controlsTimer = null;
  var saveTimer = null;
  var subtitleTimer = null;
  var endPromptOpen = false;

  function hasAvplay() {
    try { return !!(window.webapis && window.webapis.avplay && webapis.avplay.open); }
    catch (err) { return false; }
  }

  function avState() {
    try { return webapis.avplay.getState(); } catch (err) { return PLAYER_STATES.NONE; }
  }

  function isHls(url) {
    return /\.m3u8(\?|$)/i.test(url || '') || /(?:format|output)=m3u8/i.test(url || '');
  }

  function el(id) { return document.getElementById(id); }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text || '';
  }

  function setToggleIcon(paused) {
    var use = document.querySelector('#player-toggle-icon use');
    if (use) use.setAttribute('href', paused ? '#i-play' : '#i-pause');
    var btn = document.querySelector('[data-player="toggle"]');
    if (btn) btn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }

  function showBuffering(show) {
    var node = el('player-buffering');
    if (!node) return;
    node.classList.toggle('hidden', !show);
  }

  function hideError() {
    var node = el('player-error');
    if (node) node.classList.add('hidden');
  }

  function showError(message) {
    if (!session) return;
    session.error = true;
    session.paused = true;
    setToggleIcon(true);
    setText('player-error-text', message || 'This stream could not be played.');
    var node = el('player-error');
    if (node) node.classList.remove('hidden');
    showBuffering(false);
    setControlsVisible(true);
    var retry = document.querySelector('[data-player="retry"]');
    if (retry) UI.focus(retry);
  }

  function setControlsVisible(visible) {
    var ui = el('player-ui');
    if (!ui) return;
    ui.classList.toggle('controls-hidden', !visible);
    clearTimeout(controlsTimer);
    if (visible && session && !session.paused && !session.error) {
      controlsTimer = setTimeout(function () {
        if (session && !session.paused && !session.error) setControlsVisible(false);
      }, 5200);
    }
  }

  function updateProgress() {
    if (!session) return;
    var options = session.options;
    var isLive = options.type === 'live';
    var wrap = el('player-progress-wrap');
    if (wrap) wrap.classList.toggle('hidden', isLive);
    if (isLive) {
      setText('player-time', '');
      setText('player-duration', 'LIVE');
      return;
    }
    var duration = session.duration || 0;
    var position = Math.min(session.position || 0, duration || Infinity);
    var pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
    var fill = el('player-progress');
    if (fill) fill.style.width = pct + '%';
    setText('player-time', IPTV.fmtPosition(position));
    setText('player-duration', duration > 0 ? IPTV.fmtPosition(duration) : '—');
  }

  function nowProgram(epg) {
    if (!Array.isArray(epg) || !epg.length) return null;
    var now = Date.now();
    return epg.find(function (p) { return p.start <= now && p.end > now; }) || null;
  }

  function updateSubtitle() {
    if (!session) return;
    var options = session.options;
    if (options.type !== 'live') return;
    var program = nowProgram(options.epg);
    if (program) {
      setText('player-subtitle', program.title + '  ·  ' +
        IPTV.fmtTime(program.start, IPTV.Store.settings.timeFormat) + ' – ' +
        IPTV.fmtTime(program.end, IPTV.Store.settings.timeFormat));
      setText('player-hint', program.description ? program.description.slice(0, 160) : 'Back to stop · OK to pause');
    } else if (options.subtitle) {
      setText('player-subtitle', options.subtitle);
    }
  }

  function saveProgress(force) {
    if (!session) return;
    var options = session.options;
    if (!options.onProgress || options.type === 'live') return;
    if (!session.duration || session.duration === Infinity) return;
    var now = Date.now();
    if (!force && now - (session.lastSave || 0) < 5000) return;
    session.lastSave = now;
    try {
      options.onProgress(session.position || 0, session.duration || 0);
    } catch (err) { /* ignore */ }
  }

  function destroyEngine() {
    if (!session) return;
    if (session.engine === 'avplay') {
      try {
        var state = avState();
        if (state === PLAYER_STATES.PLAYING || state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.READY) {
          webapis.avplay.stop();
        }
      } catch (err) { /* ignore */ }
      try { webapis.avplay.close(); } catch (err) { /* ignore */ }
      try { webapis.avplay.setListener({}); } catch (err) { /* ignore */ }
      session.engine = null;
    }
    if (session.hls) {
      try { session.hls.destroy(); } catch (err) { /* ignore */ }
      session.hls = null;
    }
    var video = el('html5-video');
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (err) { /* ignore */ }
    }
  }

  function teardown() {
    clearTimeout(controlsTimer);
    clearTimeout(saveTimer);
    clearInterval(subtitleTimer);
    if (session) saveProgress(true);
    destroyEngine();
    session = null;
    endPromptOpen = false;
    document.body.classList.remove('playing');
    var player = el('player');
    if (player) {
      player.classList.add('hidden');
      player.classList.remove('avplay-mode');
      player.setAttribute('aria-hidden', 'true');
    }
    hideError();
    showBuffering(false);
    var ui = el('player-ui');
    if (ui) ui.classList.remove('controls-hidden');
  }

  function handleEnded() {
    if (!session) return;
    var options = session.options;
    saveProgress(true);
    if (options.type === 'live') {
      showError('The live stream ended. It may be temporarily offline.');
      return;
    }
    if (options.next && !endPromptOpen) {
      endPromptOpen = true;
      pause();
      UI.modal({
        eyebrow: 'Up next',
        title: options.nextTitle || 'Play the next episode?',
        body: '<p class="modal-copy">You finished this episode. Continue with the next one?</p>',
        actions: [
          { label: 'Not now', value: 'close' },
          { label: 'Play next', value: 'next', primary: true }
        ],
        autofocusSelector: '[data-modal-action="next"]',
        onAction: function (value) {
          endPromptOpen = false;
          UI.closeModal();
          if (value === 'next') {
            var next = options.next;
            closePlayer();
            try { next(); } catch (err) { UI.toast('Could not start the next episode.'); }
          } else {
            resume();
          }
        },
        onClose: function () {
          if (endPromptOpen && session) {
            endPromptOpen = false;
            resume();
          }
        }
      });
      return;
    }
    var label = options.title || 'Playback';
    closePlayer();
    UI.toast(label + ' finished.');
  }

  /* ---------------- AVPlay ---------------- */

  function startAvplay() {
    session.engine = 'avplay';
    var player = el('player');
    if (player) player.classList.add('avplay-mode');
    var options = session.options;
    var av = window.webapis.avplay;

    try {
      av.open(options.url);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (err) { /* optional */ }
      av.setListener({
        onbufferingstart: function () {
          showBuffering(true);
        },
        onbufferingprogress: function () {
          showBuffering(true);
        },
        onbufferingcomplete: function () {
          showBuffering(false);
        },
        oncurrentplaytime: function (ms) {
          if (!session) return;
          session.position = (ms || 0) / 1000;
          updateProgress();
          saveProgress(false);
        },
        onstreamcompleted: function () {
          handleEnded();
        },
        onerror: function (eventType) {
          if (!session) return;
          // Some codecs/containers are unsupported by AVPlay; try the browser player once.
          if (!session.fallbackTried && IPTV.Store.settings.playerEngine === 'auto') {
            session.fallbackTried = true;
            destroyEngine();
            UI.toast('Using the browser player for this stream…');
            startHtml5();
            return;
          }
          showError('This stream could not be played (AVPlay error ' + eventType + ').');
        },
        onevent: function () { /* no-op */ },
        onsubtitlechange: function () { /* subtitles are rendered by AVPlay */ }
      });

      av.prepareAsync(function () {
        if (!session) return;
        try {
          var duration = av.getDuration();
          session.duration = duration ? duration / 1000 : 0;
        } catch (err) { session.duration = 0; }
        if (options.startAt && options.startAt > 5) {
          try { av.seekTo(Math.floor(options.startAt * 1000)); }
          catch (err) { session.resumeAfterPlay = options.startAt; }
        }
        if (options.autoplay !== false) {
          try { av.play(); } catch (err) { showError('Could not start playback.'); return; }
        }
        if (session.resumeAfterPlay) {
          var resumeAt = session.resumeAfterPlay;
          delete session.resumeAfterPlay;
          setTimeout(function () {
            if (!session) return;
            try { av.seekTo(Math.floor(resumeAt * 1000)); } catch (err) { /* ignore */ }
          }, 800);
        }
        session.paused = options.autoplay === false;
        session.ready = true;
        setToggleIcon(session.paused);
        showBuffering(false);
        updateProgress();
        setControlsVisible(true);
      }, function (err) {
        if (!session) return;
        if (!session.fallbackTried && IPTV.Store.settings.playerEngine === 'auto') {
          session.fallbackTried = true;
          destroyEngine();
          UI.toast('Using the browser player for this stream…');
          startHtml5();
          return;
        }
        showError('This stream could not be prepared. The channel may be offline or in an unsupported format.');
      });
    } catch (err) {
      if (!session.fallbackTried && IPTV.Store.settings.playerEngine === 'auto') {
        session.fallbackTried = true;
        destroyEngine();
        startHtml5();
        return;
      }
      showError('Could not open this stream: ' + (err.message || 'unknown error'));
    }
  }

  /* ---------------- HTML5 / hls.js ---------------- */

  function startHtml5() {
    session.engine = 'html5';
    var player = el('player');
    if (player) player.classList.remove('avplay-mode');
    var options = session.options;
    var video = el('html5-video');
    if (!video) { showError('The browser player is unavailable.'); return; }

    showBuffering(true);
    hideError();

    video.onloadedmetadata = function () {
      if (!session) return;
      var d = video.duration;
      session.duration = (d && isFinite(d)) ? d : 0;
      if (options.startAt && options.startAt > 5 && session.duration > options.startAt) {
        try { video.currentTime = options.startAt; } catch (err) { /* ignore */ }
      }
      updateProgress();
    };
    video.ontimeupdate = function () {
      if (!session) return;
      session.position = video.currentTime || 0;
      if (video.duration && isFinite(video.duration)) session.duration = video.duration;
      updateProgress();
      saveProgress(false);
    };
    video.onwaiting = function () { showBuffering(true); };
    video.onstalled = function () { showBuffering(true); };
    video.onplaying = function () {
      showBuffering(false);
      if (session) { session.paused = false; session.ready = true; setToggleIcon(false); }
    };
    video.oncanplay = function () { showBuffering(false); };
    video.onpause = function () {
      if (!session) return;
      session.paused = true;
      setToggleIcon(true);
      setControlsVisible(true);
    };
    video.onplay = function () {
      if (!session) return;
      session.paused = false;
      setToggleIcon(false);
      setControlsVisible(true);
    };
    video.onended = function () { handleEnded(); };
    video.onerror = function () {
      var code = video.error ? video.error.code : 0;
      var messages = {
        1: 'Playback was aborted.',
        2: 'A network error interrupted the stream.',
        3: 'This stream uses a format the TV browser cannot decode.',
        4: 'This stream is not supported by the TV browser.'
      };
      showError(messages[code] || 'This stream could not be played.');
    };

    var url = options.url;
    if (isHls(url) && window.Hls && window.Hls.isSupported() && !video.canPlayType('application/vnd.apple.mpegurl')) {
      try {
        var hls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          liveSyncDurationCount: 3,
          manifestLoadingTimeOut: 20000,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 6
        });
        session.hls = hls;
        hls.on(window.Hls.Events.ERROR, function (event, data) {
          if (!data || !data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            showError('A network error interrupted this stream. Check your connection and try again.');
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch (err) { showError('This stream has a decoding problem.'); }
          } else {
            showError('This HLS stream could not be played.');
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          if (options.autoplay !== false) {
            video.play().catch(function () {
              if (session) { session.paused = true; setToggleIcon(true); }
            });
          }
        });
      } catch (err) {
        showError('Could not initialize the browser HLS player.');
      }
    } else {
      video.src = url;
      if (options.autoplay !== false) {
        var p = video.play();
        if (p && p.catch) p.catch(function () { if (session) { session.paused = true; setToggleIcon(true); } });
      }
    }
  }

  /* ---------------- Public API ---------------- */

  function play(options) {
    if (session) teardown();
    if (!options || !options.url) throw new Error('No stream URL');

    session = {
      options: options,
      engine: null,
      position: options.startAt || 0,
      duration: 0,
      paused: false,
      ready: false,
      error: false,
      lastSave: 0,
      fallbackTried: false
    };

    document.body.classList.add('playing');
    var player = el('player');
    player.classList.remove('hidden');
    player.classList.remove('avplay-mode');
    player.setAttribute('aria-hidden', 'false');
    player.setAttribute('tabindex', '-1');

    setText('player-title', options.title || '—');
    setText('player-subtitle', options.subtitle || '');
    setText('player-kicker', options.kicker || (options.type === 'live' ? 'LIVE' : 'PLAYING'));
    var kicker = el('player-kicker');
    if (kicker) kicker.classList.toggle('vod', options.type !== 'live');
    setText('player-hint', options.type === 'live'
      ? 'Back to stop · OK to pause'
      : '← → to seek · Back to stop');
    setToggleIcon(false);
    hideError();
    showBuffering(true);
    updateProgress();
    setControlsVisible(true);

    if (IPTV.Store.settings.playerEngine !== 'html5' && hasAvplay()) {
      startAvplay();
    } else {
      startHtml5();
    }

    clearInterval(subtitleTimer);
    if (options.type === 'live' && options.epg && options.epg.length) {
      updateSubtitle();
      subtitleTimer = setInterval(updateSubtitle, 30000);
    }

    try { player.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  }

  function closePlayer() {
    if (!session) return;
    var options = session.options;
    teardown();
    if (options.onClose) {
      try { options.onClose(); } catch (err) { /* ignore */ }
    }
  }

  function toggle() {
    if (!session || session.error) return;
    if (session.engine === 'avplay') {
      var state = avState();
      if (state === PLAYER_STATES.PLAYING) pause();
      else if (state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.READY) resume();
    } else {
      var video = el('html5-video');
      if (!video) return;
      if (video.paused) {
        video.play().catch(function () { UI.toast('Could not resume playback.'); });
      } else {
        video.pause();
      }
    }
    setControlsVisible(true);
  }

  function pause() {
    if (!session) return;
    if (session.engine === 'avplay') {
      try {
        if (avState() === PLAYER_STATES.PLAYING) webapis.avplay.pause();
      } catch (err) { /* ignore */ }
    } else {
      var video = el('html5-video');
      if (video && !video.paused) video.pause();
    }
    session.paused = true;
    setToggleIcon(true);
    setControlsVisible(true);
  }

  function resume() {
    if (!session) return;
    if (session.engine === 'avplay') {
      try {
        var state = avState();
        if (state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.READY) webapis.avplay.play();
      } catch (err) { /* ignore */ }
    } else {
      var video = el('html5-video');
      if (video && video.paused) video.play().catch(function () { /* ignore */ });
    }
    session.paused = false;
    setToggleIcon(false);
    setControlsVisible(true);
  }

  function seekBy(seconds) {
    if (!session) return;
    if (session.options.type === 'live') {
      UI.toast('Live TV cannot be seeked. Use catch-up for past programs.');
      return;
    }
    var target = Math.max(0, Math.min((session.position || 0) + seconds, (session.duration || 0) - 1));
    if (!session.duration) return;
    if (session.engine === 'avplay') {
      try { webapis.avplay.seekTo(Math.floor(target * 1000)); } catch (err) { /* ignore */ }
    } else {
      var video = el('html5-video');
      if (video) video.currentTime = target;
    }
    session.position = target;
    updateProgress();
    UI.toast((seconds > 0 ? '+' : '') + seconds + 's  ·  ' + IPTV.fmtPosition(target), 900);
    setControlsVisible(true);
  }

  function handleKey(e) {
    if (!session) return false;
    if (UI.isModalOpen()) return false;
    var code = e.keyCode;
    var handled = true;
    if (code === 10009 || code === 27) {
      closePlayer();
    } else if (code === 13 || code === 32 || code === 415 || code === 10252) {
      if (session.error) retry();
      else toggle();
    } else if (code === 19) {
      pause();
    } else if (code === 413) {
      closePlayer();
    } else if (code === 412 || code === 37) {
      seekBy(-10);
    } else if (code === 417 || code === 39) {
      seekBy(10);
    } else if (code === 38 || code === 40) {
      setControlsVisible(true);
    } else if (code === 427) {
      if (session.options.onChannelUp) session.options.onChannelUp();
    } else if (code === 428) {
      if (session.options.onChannelDown) session.options.onChannelDown();
    } else if (code === 457) {
      if (session.options.onInfo) session.options.onInfo();
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      if (!session || !session.error) setControlsVisible(true);
    }
    return handled;
  }

  function retry() {
    if (!session) return;
    var options = session.options;
    var fallback = session.fallbackTried;
    var engine = session.engine;
    destroyEngine();
    session.error = false;
    session.position = options.startAt || 0;
    session.duration = 0;
    session.ready = false;
    hideError();
    showBuffering(true);
    setControlsVisible(true);
    if (engine === 'avplay' && fallback && IPTV.Store.settings.playerEngine === 'auto') {
      startHtml5();
    } else if (IPTV.Store.settings.playerEngine !== 'html5' && hasAvplay()) {
      startAvplay();
    } else {
      startHtml5();
    }
  }

  function setNext(next, title) {
    if (!session) return;
    session.options.next = next;
    session.options.nextTitle = title || session.options.nextTitle;
  }

  function setEpg(epg) {
    if (!session) return;
    session.options.epg = epg || [];
    if (session.options.type === 'live') updateSubtitle();
  }

  function isOpen() { return !!session; }

  function current() { return session ? session.options : null; }

  function init() {
    var player = el('player');
    if (!player) return;
    player.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-player]');
      if (!btn) return;
      var action = btn.getAttribute('data-player');
      if (action === 'close') closePlayer();
      else if (action === 'toggle') toggle();
      else if (action === 'back10') seekBy(-10);
      else if (action === 'fwd10') seekBy(10);
      else if (action === 'retry') retry();
    });

    document.addEventListener('visibilitychange', function () {
      if (!session || session.engine !== 'avplay') return;
      try {
        if (document.hidden) {
          var state = avState();
          if (state === PLAYER_STATES.PLAYING || state === PLAYER_STATES.PAUSED) webapis.avplay.suspend();
        } else {
          var state2 = avState();
          if (state2 === PLAYER_STATES.PLAYING || state2 === PLAYER_STATES.PAUSED) webapis.avplay.restore();
        }
      } catch (err) { /* ignore */ }
    });
  }

  IPTV.Player = {
    init: init,
    play: play,
    close: closePlayer,
    toggle: toggle,
    pause: pause,
    resume: resume,
    seekBy: seekBy,
    handleKey: handleKey,
    isOpen: isOpen,
    current: current,
    setNext: setNext,
    setEpg: setEpg
  };
})();
