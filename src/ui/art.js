// Hand-drawn style inline SVGs: the companion and the icon set.
import { svg } from '../core/dom.js';

// "Mele", a small round companion with a sprout that grows as you study.
// mood: 'happy' | 'calm' | 'sleepy'; leaves: 1..3
export function companion({ mood = 'happy', leaves = 2, label = '' } = {}) {
  const eyes = mood === 'sleepy'
    ? `<path d="M50 63q5 3 10 0M80 63q5 3 10 0" stroke="#1f2330" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<g class="blink"><ellipse cx="55" cy="62" rx="4.2" ry="5.4" fill="#1f2330"/><ellipse cx="85" cy="62" rx="4.2" ry="5.4" fill="#1f2330"/>
       <circle cx="56.5" cy="60" r="1.4" fill="#fff"/><circle cx="86.5" cy="60" r="1.4" fill="#fff"/></g>`;
  const mouth = mood === 'calm' || mood === 'sleepy'
    ? `<path d="M64 76q6 3 12 0" stroke="#1f2330" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<path d="M62 74q8 9 16 0" stroke="#1f2330" stroke-width="2.6" fill="#ff7b8a" stroke-linecap="round" stroke-linejoin="round"/>`;
  const leafPaths = [
    `<path d="M70 26c-10-2-17-9-18-18 10 0 17 7 18 18z" fill="#3fae6a"/>`,
    `<path d="M70 24c4-10 13-14 22-12-2 10-11 15-22 12z" fill="#57c47f"/>`,
    `<path d="M70 14c-4-7-3-13 2-17 4 5 3 11-2 17z" fill="#2f9a5a"/>`,
  ].slice(0, Math.max(1, Math.min(3, leaves))).join('');
  return svg(`<svg class="companion" viewBox="0 0 140 140" role="img" aria-label="${label}">
    <defs><radialGradient id="mBody" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#b6a4ff"/><stop offset="1" stop-color="#7c5cff"/></radialGradient></defs>
    <ellipse cx="70" cy="128" rx="34" ry="5" fill="currentColor" opacity=".08"/>
    <g class="sprout"><path d="M70 40V22" stroke="#3fae6a" stroke-width="3.5" stroke-linecap="round"/>${leafPaths}</g>
    <g class="body"><path d="M70 36c30 0 46 22 46 50 0 26-20 38-46 38S24 112 24 86c0-28 16-50 46-50z" fill="url(#mBody)"/>
    <ellipse cx="56" cy="50" rx="12" ry="7" fill="#fff" opacity=".22"/>
    <circle cx="45" cy="74" r="6" fill="#ff9f7a" opacity=".55"/><circle cx="95" cy="74" r="6" fill="#ff9f7a" opacity=".55"/>
    ${eyes}${mouth}</g></svg>`);
}

export function logo() {
  return svg(`<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="10" fill="#7c5cff"/>
    <path d="M16 9V5" stroke="#9be3b4" stroke-width="2" stroke-linecap="round"/><path d="M16 6c-3-1-5-3-5-6 3 0 5 3 5 6z" fill="#9be3b4" transform="translate(0 1)"/>
    <circle cx="16" cy="19" r="8" fill="#fff" opacity=".95"/><circle cx="13" cy="18.5" r="1.4" fill="#1f2330"/><circle cx="19" cy="18.5" r="1.4" fill="#1f2330"/>
    <path d="M14 22q2 1.6 4 0" stroke="#1f2330" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`);
}

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  home: I('<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>'),
  learn: I('<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/>'),
  do: I('<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/>'),
  grow: I('<path d="M12 21v-9"/><path d="M12 12C12 7 8.5 4.5 4 5c0 5 3.5 7.5 8 7z"/><path d="M12 14c0-4 3-6.5 8-6 0 4.5-3 6.5-8 6z"/>'),
  buddies: I('<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3.5 19c.6-3 2.7-4.5 5-4.5s4.4 1.5 5 4.5M14 15.2c.8-.5 1.6-.7 2.5-.7 2 0 3.6 1.3 4 4"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  book: I('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
};
export function icon(name) { return svg(ICONS[name] || ICONS.home); }
