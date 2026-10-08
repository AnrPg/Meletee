// Hash router: routes are patterns like '/learn/method/:id'.
const routes = [];
let onRender = null;

export function route(pattern, view) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, view, pattern });
}

export function current() {
  return decodeURI(location.hash.replace(/^#/, '')) || '/';
}

export function go(path) { location.hash = '#' + path; }

export function match(path = current()) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { view: r.view, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), pattern: r.pattern };
  }
  return null;
}

export function start(render) {
  onRender = render;
  window.addEventListener('hashchange', () => onRender(match()));
  onRender(match());
}

export function refresh() { onRender?.(match()); }
