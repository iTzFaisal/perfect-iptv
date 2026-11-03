/* ============================================================
   Cloudflare Worker CORS proxy for Perfect IPTV.

   Deploy:
     1. npm create cloudflare@latest -- perfect-iptv-proxy
     2. Replace src/index.js with this file.
     3. (Optional) Set ALLOWED_HOSTS to your provider hostname.
     4. Deploy and use the https://...workers.dev URL in the app's
        Advanced > CORS proxy field.

   Your provider credentials pass through Cloudflare while the app
   talks to the proxy. Use your own deployment and review the code.
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Cache-Control': 'no-store'
};

function text(status, message) {
  return new Response(message, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return text(405, 'Only GET is supported.');

    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');
    if (!target) return text(400, 'Missing ?url= target.');

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (err) {
      return text(400, 'Invalid target URL.');
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return text(400, 'Only HTTP and HTTPS targets are supported.');
    }

    const allowed = String(env.ALLOWED_HOSTS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(targetUrl.hostname.toLowerCase())) {
      return text(403, 'Target host is not in ALLOWED_HOSTS.');
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'PerfectIPTV/1.0',
          'Accept': '*/*',
          'Accept-Encoding': 'identity'
        }
      });
    } catch (err) {
      return text(502, 'Upstream error: ' + err.message);
    }

    const headers = new Headers(upstream.headers);
    for (const key of [...headers.keys()]) {
      if (key.toLowerCase().startsWith('access-control-')) headers.delete(key);
    }
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    headers.delete('content-encoding');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
