# Security headers and the noema-lite library proxy (to apply in `netlify.toml`)

Written for docs/REVIEW-1.0.md finding 1. The application code is already done: `src/noema/source.js` reads
noema-lite's library **only as data** (fetch + JSON parse) and never loads it as a `<script>`. It tries the
same-origin path `/noema-library/…` first and then `<noemaUrl>/library/…` directly (that second one works once
noema-lite sends CORS headers, and in local dev). What is left is configuration that another agent owns, so it is
written down here instead of being edited in place.

## 1. Add to `netlify.toml`

Append these blocks (keep the existing `[build]` and `/sw.js` blocks as they are). The Supabase project comes
from `config.js` (`supabaseUrl`), including its `wss://` Realtime endpoint; noema-lite's origin comes from
`config.js` (`noemaUrl`). If either changes, change it here too.

```toml
# noema-lite's public library, proxied through Meletee's own origin so that no CORS is needed.
# It is only ever read as data (src/noema/source.js); nothing from it is executed.
[[redirects]]
  from = "/noema-library/*"
  to = "https://noema-lite.netlify.app/library/:splat"
  status = 200
  force = true

# Security headers for every page and file.
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://awlvbxlpvjkhkreumfln.supabase.co wss://awlvbxlpvjkhkreumfln.supabase.co https://api.anthropic.com https://generativelanguage.googleapis.com https://noema-lite.netlify.app; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    X-Frame-Options = "DENY"
    Cross-Origin-Opener-Policy = "same-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"

# The proxied library must never be usable as a script, even though it is same-origin
# (script-src 'self' would otherwise allow it): served as plain text/JSON with nosniff, and sandboxed
# if someone opens it directly.
[[headers]]
  for = "/noema-library/*"
  [headers.values]
    Content-Type = "text/plain; charset=utf-8"
    X-Content-Type-Options = "nosniff"
    Content-Security-Policy = "default-src 'none'; sandbox"
    Cache-Control = "public, max-age=300"
```

Why each source is there:

| Directive | Source | Used by |
|---|---|---|
| `script-src` | `'self'` only | `config.js` and the ES modules under `src/`. No inline scripts, no `eval`, no CDN. |
| `style-src` | `'self' 'unsafe-inline'` + Google Fonts CSS | `'unsafe-inline'` is needed because `src/grow/garden.js` writes `style="--d:…"` into SVG markup (`h()` uses `el.style`, which a CSP allows anyway). |
| `font-src` | Google Fonts files | Plus Jakarta Sans (`index.html`). |
| `img-src` | `'self' data: blob:` | icons, canvas sketches (`src/workspaces/b-sketch.js`), the backup download link. |
| `connect-src` | Supabase REST/Auth/Storage (`https://…supabase.co`) and Realtime (`wss://…supabase.co`) | sync, restore points, buddies, focus-room sockets. |
| | `https://api.anthropic.com` | Claude (`src/ai/claude.js`). |
| | `https://generativelanguage.googleapis.com` | Gemini (`src/ai/gemini.js`). |
| | `https://noema-lite.netlify.app` | the direct library fetch (after noema-lite's CORS change 0). It can be dropped if only the proxy is used. |
| `frame-ancestors 'none'` | | Meletee is never framed (clickjacking). |

Note: `geminiBase` / `anthropicBase` in `window.MELETEE_CONFIG` are only for tests and local work; if a deploy
ever sets them, add those origins to `connect-src`.

## 2. Verify after deploying

```sh
curl -sI https://meletee.netlify.app/ | grep -i -E 'content-security-policy|x-content-type|referrer|frame'
curl -sI https://meletee.netlify.app/noema-library/registry.js   # 200, content-type text/plain, CSP sandbox
curl -s  https://meletee.netlify.app/noema-library/registry.js | head -c 80   # window.NOEMA_REGISTRY = {…
```

- Open `#/noema` and `#/noema/<id>` with DevTools open: the library list and a pack load, the Network panel shows
  `/noema-library/registry.js` and `/noema-library/subjects/<id>/pack.json` as `fetch` requests (never
  `script`), and the Console shows no CSP violations.
- Sign in, sync, open a focus room (`wss://` must connect), run a Claude and a Gemini tutor action: no CSP errors.
- If Netlify does not apply the `/noema-library/*` headers to the proxied response (check the `curl -sI` above),
  the main protection still holds: the code never creates a `<script>` element, and the global CSP blocks every
  cross-origin script. As an extra guard you can then narrow `script-src` from `'self'` to the exact paths
  `https://meletee.netlify.app/config.js https://meletee.netlify.app/src/` (deploy previews would need their own
  origin added).

## 3. Related follow-ups for the files other agents own

- **`sw.js`**: same-origin GETs that do not end in `.json` are cache-first, so `/noema-library/registry.js` would
  be served from the cache until the next app version. Treat `/noema-library/` as network-first (like `.json`),
  for example `const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.startsWith('/noema-library/');`.
- **`tools/build.mjs`**: nothing is required. If the build ever generates `_headers`, put the same headers there
  instead of `netlify.toml`, not in both.
- **`index.html`**: nothing is required (no inline scripts or styles). Keep it that way, or the CSP must change.
- **Local development** (`tools/serve.mjs`) has no proxy: the library loads straight from `noemaUrl` once
  noema-lite sends CORS headers. Until then, either set `noemaLibrary` in a local config to a URL that serves the
  library with CORS, or work without the library list.
