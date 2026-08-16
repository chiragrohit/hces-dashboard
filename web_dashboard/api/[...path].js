/* Vercel serverless proxy for /api/* -> Modal FastAPI.

   The Modal endpoint is NOT hardcoded here: set your own in the Vercel
   project env and this proxy picks it up:

       vercel env add MODAL_API_URL production

   (value e.g. https://yourname--hces-api-api.modal.run — the URL of your
   own `modal deploy deploy/modal_app.py` app). Until it is set, API calls
   return 503 with a hint. Each deployer runs their own Modal app, so no
   shared secret or auth token is needed — the LLM key lives in their own
   Modal secret (hces-opencode-key).
*/
export default async function handler(req, res) {
  const modalApi = (process.env.MODAL_API_URL || '').replace(/\/+$/, '');
  if (!modalApi) {
    res.status(503).json({ detail: 'MODAL_API_URL not set in Vercel env. Add it to enable the API.' });
    return;
  }

  const url = new URL(req.url, 'https://proxy.local');
  const rest = url.pathname.replace(/^\/api\/?/, '');
  const target = modalApi + '/api' + (rest ? '/' + rest : '') + url.search;

  const init = {
    method: req.method,
    headers: { 'content-type': req.headers['content-type'] || 'application/json' },
  };
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }

  try {
    const r = await fetch(target, init);
    const text = await r.text();
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.setHeader('cache-control', 'no-store'); // filter queries are per-request
    res.end(text);
  } catch (e) {
    res.status(502).json({ detail: 'API proxy error: ' + (e && e.message ? e.message : e) });
  }
}
