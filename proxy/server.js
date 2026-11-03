/* ============================================================
   Minimal CORS proxy for Xtream Codes panels that do not send
   Access-Control-Allow-Origin. Run on a PC/NAS on the same LAN:

     node proxy/server.js
     # then in the app: http://<computer-ip>:8787

   Optionally restrict targets:
     ALLOWED_HOSTS=provider.example.com node proxy/server.js

   Your provider credentials pass through this process. Only run it
   on a machine you control, and never expose it to the internet.
   ============================================================ */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const ALLOWED = (process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Cache-Control': 'no-store'
};

function deny(res, status, message) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method !== 'GET') return deny(res, 405, 'Only GET is supported.');

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const target = requestUrl.searchParams.get('url');
  if (!target) return deny(res, 400, 'Missing ?url= target.');

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (err) {
    return deny(res, 400, 'Invalid target URL.');
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return deny(res, 400, 'Only HTTP and HTTPS targets are supported.');
  }
  if (ALLOWED.length && !ALLOWED.includes(targetUrl.hostname.toLowerCase())) {
    return deny(res, 403, 'Target host is not in ALLOWED_HOSTS.');
  }

  const lib = targetUrl.protocol === 'https:' ? https : http;
  const upstream = lib.request(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent': req.headers['user-agent'] || 'PerfectIPTV/1.0',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    }
  }, (upstreamRes) => {
    const headers = { ...upstreamRes.headers };
    Object.keys(headers).forEach((key) => {
      if (/^access-control-/i.test(key)) delete headers[key];
    });
    Object.assign(headers, CORS);
    res.writeHead(upstreamRes.statusCode || 502, headers);
    upstreamRes.pipe(res);
  });

  upstream.setTimeout(30000, () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    deny(res, 502, 'Upstream error: ' + err.message);
  });
  upstream.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Perfect IPTV CORS proxy: http://0.0.0.0:${PORT}`);
  console.log('In the app, use: http://<this-computer-ip>:' + PORT);
  if (ALLOWED.length) console.log('Allowed hosts:', ALLOWED.join(', '));
});
