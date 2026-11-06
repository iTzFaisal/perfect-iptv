/* ============================================================
   Perfect IPTV — UI runtime, spatial navigation, modal system
   ============================================================ */
/* @requires: IPTV.$, IPTV.$$, IPTV.esc, IPTV.icon, IPTV.initials
   @exports: IPTV.UI */
(function () {
  'use strict';

  var IPTV = window.IPTV;
  var $ = IPTV.$;
  var $$ = IPTV.$$;
  var esc = IPTV.esc;
  var icon = IPTV.icon;

  var UI = {
    currentModal: null,
    onBack: null,
    toastTimer: null,
    loadingCount: 0
  };

  /* ---------------- Toast / loading ---------------- */

  UI.toast = function (message, duration) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(function () { el.classList.remove('show'); }, duration || 2800);
  };

  UI.loading = function (show, text) {
    var el = $('#loading-overlay');
    if (!el) return;
    if (show) {
      UI.loadingCount++;
      $('#loading-text').textContent = text || 'Loading…';
      el.classList.remove('hidden');
    } else {
      UI.loadingCount = Math.max(0, UI.loadingCount - 1);
      if (UI.loadingCount === 0) el.classList.add('hidden');
    }
  };

  /* ---------------- Image helpers ---------------- */

  UI.img = function (src, name, alt) {
    var fallback = '<span class="channel-fallback">' + esc(IPTV.initials(name)) + '</span>';
    if (!src) return fallback;
    return fallback + '<img src="' + esc(src) + '" alt="' + esc(alt || name || '') +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  };

  function bindImageEvents() {
    document.addEventListener('load', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      var wrap = img.closest('.channel-logo, .preview-art, .poster-art, .detail-poster');
      if (wrap && img.naturalWidth > 0) wrap.classList.add('has-img');
    }, true);
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      img.classList.add('broken');
      var wrap = img.closest('.channel-logo, .preview-art, .poster-art, .detail-poster');
      if (wrap) wrap.classList.remove('has-img');
    }, true);
  }

  /* ---------------- Focus / spatial navigation ---------------- */

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.closest('.hidden')) return false;
    if (el.closest('.controls-hidden')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  function scope() {
    if (UI.currentModal) return UI.currentModal.root;
    return document;
  }

  function focusables() {
    return $$('[data-focusable]', scope()).filter(isVisible);
  }

  UI.focus = function (el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (err) { /* ignore */ }
  };

  UI.focusFirst = function (root) {
    root = root || scope();
    var list = $$('[data-focusable]', root).filter(isVisible);
    if (!list.length) return null;
    var preferred = list.find(function (el) { return el.hasAttribute('data-autofocus'); }) || list[0];
    UI.focus(preferred);
    return preferred;
  };

  UI.focusActiveNav = function () {
    var el = $('.nav-item.is-active');
    if (el) UI.focus(el);
  };

  UI.nav = {
    move: function (direction) {
      var list = focusables();
      if (!list.length) return;
      var current = document.activeElement;
      if (!list.includes(current)) {
        UI.focus(list[0]);
        return;
      }
      var cr = current.getBoundingClientRect();
      var cx = cr.left + cr.width / 2;
      var cy = cr.top + cr.height / 2;
      var best = null;
      var bestScore = Infinity;
      list.forEach(function (el) {
        if (el === current) return;
        var r = el.getBoundingClientRect();
        var x = r.left + r.width / 2;
        var y = r.top + r.height / 2;
        var dx = x - cx;
        var dy = y - cy;
        var primary, secondary;
        if (direction === 'left') {
          if (dx > -6) return;
          primary = -dx; secondary = Math.abs(dy);
        } else if (direction === 'right') {
          if (dx < 6) return;
          primary = dx; secondary = Math.abs(dy);
        } else if (direction === 'up') {
          if (dy > -6) return;
          primary = -dy; secondary = Math.abs(dx);
        } else {
          if (dy < 6) return;
          primary = dy; secondary = Math.abs(dx);
        }
        // Prefer elements in line with the current one. Small overlap bonus.
        var overlapX = Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
        var overlapY = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top);
        var overlapBonus = 0;
        if (direction === 'up' || direction === 'down') overlapBonus = overlapX > 0 ? -18 : 0;
        else overlapBonus = overlapY > 0 ? -18 : 0;
        var score = primary + secondary * 2.4 + overlapBonus;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      });
      if (best) UI.focus(best);
    }
  };

  /* ---------------- Modal ---------------- */

  UI.modal = function (options) {
    options = options || {};
    var root = $('#modal-root');
    if (!root) return null;
    if (UI.currentModal) UI.closeModal(true);

    var previous = document.activeElement;
    var actions = options.actions || [];
    var actionsHtml = actions.map(function (a) {
      return '<button class="btn ' + (a.primary ? 'btn-primary' : (a.danger ? 'btn-danger' : 'btn-ghost')) + '" ' +
        'data-modal-action="' + esc(a.value) + '" data-focusable>' + esc(a.label) + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="modal ' + (options.wide ? 'wide' : '') + '" role="document">' +
        '<div class="modal-head">' +
          '<div>' + (options.eyebrow ? '<span class="eyebrow">' + esc(options.eyebrow) + '</span>' : '') +
          '<h2>' + esc(options.title || '') + '</h2></div>' +
          '<button class="icon-btn modal-close" data-modal-close data-focusable aria-label="Close">' + icon('x') + '</button>' +
        '</div>' +
        '<div class="modal-body">' + (options.body || '') + '</div>' +
        (actionsHtml ? '<div class="modal-actions">' + actionsHtml + '</div>' : '') +
      '</div>';
    root.classList.remove('hidden');

    UI.currentModal = {
      root: root,
      previous: previous,
      onAction: options.onAction || null,
      onClose: options.onClose || null,
      returnFocus: options.returnFocus !== false
    };

    var target = options.autofocusSelector ? $(options.autofocusSelector, root) : null;
    if (target) UI.focus(target);
    else UI.focusFirst(root);

    return UI.currentModal;
  };

  UI.closeModal = function (skipCallback) {
    var root = $('#modal-root');
    if (!root || !UI.currentModal) return;
    var modal = UI.currentModal;
    UI.currentModal = null;
    root.classList.add('hidden');
    root.innerHTML = '';
    if (!skipCallback && modal.onClose) {
      try { modal.onClose(); } catch (err) { /* ignore */ }
    }
    if (!skipCallback && modal.returnFocus && modal.previous && isVisible(modal.previous)) {
      setTimeout(function () { UI.focus(modal.previous); }, 20);
    }
  };

  UI.isModalOpen = function () { return !!UI.currentModal; };

  UI.confirm = function (title, message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        UI.closeModal();
        resolve(value);
      }
      UI.modal({
        title: title,
        body: '<p class="modal-copy">' + esc(message) + '</p>',
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: confirmLabel || 'Continue', value: 'ok', primary: !danger, danger: !!danger }
        ],
        autofocusSelector: '[data-modal-action="cancel"]',
        onAction: function (value) { finish(value === 'ok'); },
        onClose: function () { if (!done) { done = true; resolve(false); } }
      });
    });
  };

  /* ---------------- Key handling ---------------- */

  UI.isEditable = function () {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  function isBackKey(e) {
    return e.keyCode === 10009 || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack';
  }

  function isEnterKey(e) {
    return e.keyCode === 13 || e.key === 'Enter';
  }

  function registerTvKeys() {
    if (!window.tizen || !tizen.tvinputdevice) return;
    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind',
      'MediaFastForward', 'Info', 'ChannelUp', 'ChannelDown'];
    try {
      if (tizen.tvinputdevice.registerKeyBatch) {
        tizen.tvinputdevice.registerKeyBatch(keys);
        return;
      }
    } catch (err) { /* try one by one below */ }
    keys.forEach(function (k) {
      try { tizen.tvinputdevice.registerKey(k); } catch (err) { /* unsupported on this model */ }
    });
  }

  UI.handleKey = function (e) {
    var code = e.keyCode;
    var dir = null;
    if (code === 37 || e.key === 'ArrowLeft') dir = 'left';
    else if (code === 38 || e.key === 'ArrowUp') dir = 'up';
    else if (code === 39 || e.key === 'ArrowRight') dir = 'right';
    else if (code === 40 || e.key === 'ArrowDown') dir = 'down';

    if (isBackKey(e)) {
      if (UI.currentModal) {
        e.preventDefault();
        UI.closeModal();
        return true;
      }
      if (UI.isEditable()) {
        e.preventDefault();
        try { document.activeElement.blur(); } catch (err) { /* ignore */ }
        return true;
      }
      if (UI.onBack) {
        e.preventDefault();
        UI.onBack();
        return true;
      }
      return false;
    }

    if (UI.currentModal) {
      if (dir) {
        e.preventDefault();
        UI.nav.move(dir);
        return true;
      }
      if (isEnterKey(e)) {
        var active = document.activeElement;
        if (active && active.matches('[data-focusable]') && UI.currentModal.root.contains(active)) {
          e.preventDefault();
          active.click();
          return true;
        }
      }
      return false;
    }

    if (UI.isEditable()) {
      // Keep left/right for text editing, but let up/down leave the field so
      // TV users can reach the rest of the form without pressing Back first.
      if (dir === 'up' || dir === 'down') {
        e.preventDefault();
        UI.nav.move(dir);
        return true;
      }
      return false;
    }

    if (dir) {
      e.preventDefault();
      UI.nav.move(dir);
      return true;
    }

    if (isEnterKey(e)) {
      var el = document.activeElement;
      if (el && el.matches('[data-focusable]')) {
        e.preventDefault();
        el.click();
        return true;
      }
      return false;
    }

    if (code === 32) {
      var el2 = document.activeElement;
      if (el2 && el2.matches('[data-focusable]')) {
        e.preventDefault();
        el2.click();
        return true;
      }
    }
    return false;
  };

  UI.init = function () {
    bindImageEvents();
    registerTvKeys();

    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented) return;
      UI.handleKey(e);
    }, false);

    var root = $('#modal-root');
    root.addEventListener('click', function (e) {
      var close = e.target.closest('[data-modal-close]');
      if (close) { UI.closeModal(); return; }
      var action = e.target.closest('[data-modal-action]');
      if (action && UI.currentModal && UI.currentModal.onAction) {
        UI.currentModal.onAction(action.getAttribute('data-modal-action'));
      }
    });

    // Keep the image fallback in sync with cached images.
    $$('img').forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        var wrap = img.closest('.channel-logo, .preview-art, .poster-art, .detail-poster');
        if (wrap) wrap.classList.add('has-img');
      }
    });
  };

  IPTV.UI = UI;
})();
