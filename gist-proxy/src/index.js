const GIST_ID   = '7b44b22bea74e5b33238c0d3734beaf5';
const GIST_FILE = 'livi-list.json';
const GIST_URL  = 'https://api.github.com/gists/' + GIST_ID;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ── /og?url=... — fetch OG image from any URL ──────────────────
    if (url.pathname === '/og') {
      const target = url.searchParams.get('url');
      if (!target) return new Response('missing url param', { status: 400, headers: CORS });
      try {
        const res = await fetch(target, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GiftListBot/1.0)' },
          redirect: 'follow',
        });
        if (!res.ok) return new Response('', { status: 204, headers: CORS });
        const html = await res.text();
        // extract og:image
        const match =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
        if (!match) return new Response('', { status: 204, headers: CORS });
        let imgUrl = match[1];
        // resolve relative URLs
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        else if (imgUrl.startsWith('/')) {
          const base = new URL(target);
          imgUrl = base.origin + imgUrl;
        }
        return new Response(JSON.stringify({ image: imgUrl }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response('', { status: 204, headers: CORS });
      }
    }

    // ── /progress — read/write Gist ────────────────────────────────
    const pat = env.GIST_PAT;
    if (!pat) return new Response('GIST_PAT secret missing', { status: 500, headers: CORS });

    const auth = {
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'gist-proxy/1.0'
    };

    if (request.method === 'GET') {
      const res = await fetch(GIST_URL, { headers: auth });
      if (!res.ok) {
        const text = await res.text();
        return new Response('GitHub error ' + res.status + ': ' + text, { status: 502, headers: CORS });
      }
      const gist = await res.json();
      const file = gist.files && gist.files[GIST_FILE];
      let data = {};
      if (file && file.content) {
        try { data = JSON.parse(file.content); }
        catch { return new Response('Gist file contains invalid JSON', { status: 502, headers: CORS }); }
      }
      return new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body    = await request.json();
      const payload = { files: { [GIST_FILE]: { content: JSON.stringify(body, null, 2) } } };
      const res = await fetch(GIST_URL, {
        method:  'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        return new Response('GitHub error ' + res.status + ': ' + text, { status: 502, headers: CORS });
      }
      return new Response('ok', { status: 200, headers: CORS });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
