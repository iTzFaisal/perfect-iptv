/* ============================================================
   Perfect IPTV — DOM helpers and the Tizen native downloader
   ============================================================ */
/* @requires: none
   @exports: IPTV.$, IPTV.$$, IPTV.nativeDownloadText,
             IPTV.canUseNativeDownload */
(function () {
  'use strict';

  var IPTV = window.IPTV = window.IPTV || {};

  /* ---------------- DOM helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------- Native Tizen downloader (CORS bypass) ----------------
     Some IPTV panels do not send Access-Control-Allow-Origin, so browser
     fetch() is blocked even though the TV can reach the server. Tizen's
     native Download API writes the JSON to private storage, where the
     Filesystem API can read it. We use that as an automatic fallback. */

  function canUseNativeDownload() {
    try {
      if (!window.tizen || !tizen.download || !tizen.filesystem) return false;
    } catch (err) {
      return false;
    }
    try {
      if (tizen.systeminfo && tizen.systeminfo.getCapability) {
        var capability = tizen.systeminfo.getCapability('http://tizen.org/feature/download');
        if (capability === false || capability === 'false') return false;
      }
    } catch (err) { /* capability may not be queryable; try anyway */ }
    return true;
  }

  var nativeFileSeq = 0;

  function deleteNativeFile(name) {
    try {
      tizen.filesystem.resolve('wgt-private-tmp', function (dir) {
        try { dir.deleteFile(name); } catch (err) { /* already gone */ }
      }, function () { /* ignore */ }, 'rw');
    } catch (err) { /* ignore */ }
  }

  function readNativeFile(path, name) {
    return new Promise(function (resolve, reject) {
      function openFile(file) {
        var stream = null;
        try {
          try {
            stream = file.openStream('r', 'UTF-8');
          } catch (encodingErr) {
            stream = file.openStream('r');
          }
          var parts = [];
          var chunk;
          while ((chunk = stream.read(65536)) !== null && chunk !== undefined && chunk.length > 0) {
            parts.push(chunk);
          }
          stream.close();
          resolve(parts.join('').replace(/^\uFEFF/, ''));
        } catch (err) {
          try { if (stream) stream.close(); } catch (closeErr) { /* ignore */ }
          reject(err);
        }
      }

      function resolveFromPath() {
        var location = path || ('wgt-private-tmp/' + name);
        tizen.filesystem.resolve(location, openFile, function (err) {
          reject(err || new Error('Could not read the downloaded API response.'));
        }, 'r');
      }

      tizen.filesystem.resolve('wgt-private-tmp', function (dir) {
        try {
          if (dir && dir.resolve) {
            openFile(dir.resolve(name));
            return;
          }
        } catch (err) { /* fall back to the full path */ }
        resolveFromPath();
      }, function () {
        resolveFromPath();
      }, 'r');
    });
  }

  function nativeDownloadOnce(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!canUseNativeDownload()) {
        reject(new Error('The TV native downloader is unavailable.'));
        return;
      }
      var name = 'perfectiptv_' + Date.now() + '_' + (++nativeFileSeq) + '.json';
      var settled = false;
      var downloadId = null;
      var timer = setTimeout(function () {
        try { if (downloadId) tizen.download.cancel(downloadId); } catch (err) { /* ignore */ }
        finish(new Error('The native download timed out.'));
      }, timeoutMs || 60000);

      function finish(err, text) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        deleteNativeFile(name);
        if (err) reject(err);
        else resolve(text);
      }

      var listener = {
        oncompleted: function (id, path) {
          readNativeFile(path, name).then(function (text) {
            finish(null, text);
          }).catch(function (err) {
            finish(err);
          });
        },
        onfailed: function (id, error) {
          var message = (error && (error.message || error.name)) || 'The native download failed.';
          finish(new Error(message));
        },
        oncanceled: function () {
          finish(new Error('The native download was canceled.'));
        }
      };

      try {
        var request = new tizen.DownloadRequest(url, 'wgt-private-tmp', name);
        try {
          request.httpHeader = request.httpHeader || {};
          request.httpHeader['Accept'] = 'application/json,text/plain,*/*';
          request.httpHeader['User-Agent'] = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/6.0 Chrome/108.0.0.0 TV Safari/537.36';
        } catch (headerErr) { /* headers are optional */ }
        downloadId = tizen.download.start(request, listener);
        if (downloadId === -1) finish(new Error('The TV has no network connection.'));
      } catch (err) {
        finish(err);
      }
    });
  }

  var nativeQueue = Promise.resolve();

  function nativeDownloadText(url, timeoutMs) {
    function run() { return nativeDownloadOnce(url, timeoutMs); }
    var result = nativeQueue.then(run, run);
    nativeQueue = result.then(function () { /* keep the queue alive */ }, function () { /* keep the queue alive */ });
    return result;
  }

  IPTV.$ = $;
  IPTV.$$ = $$;
  IPTV.nativeDownloadText = nativeDownloadText;
  IPTV.canUseNativeDownload = canUseNativeDownload;
})();
