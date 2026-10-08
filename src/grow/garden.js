// Pure: light points -> garden stage, and the garden picture as an SVG string.
// Colours come from CSS classes (styles/grow.css) so the garden follows the theme.

export const STAGES = [0, 5, 15, 30, 50, 80, 120, 170, 230, 300, 380, 470, 570, 680, 800];

export function stageFor(points = 0) {
  let stage = 0;
  for (let i = 0; i < STAGES.length; i++) if (points >= STAGES[i]) stage = i;
  const prev = STAGES[stage];
  const next = STAGES[stage + 1] ?? null;
  const progress = next == null ? 1 : (points - prev) / (next - prev);
  return { stage, prev, next, progress: Math.max(0, Math.min(1, progress)), max: stage === STAGES.length - 1 };
}

// Ground line and plant slots (x, row). Mele sits in the middle.
const GROUND = 150;
const SLOTS = [112, 208, 84, 236, 56, 264, 28, 292, 70, 250, 98, 222];
export const MELE = { x: 128, y: GROUND - 60, size: 64 };

const leaf = (x, y, s, flip, cls) =>
  `<path class="${cls}" transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" d="M0 0c-10-2-17-9-18-18 10 0 17 7 18 18z"/>`;

function plant(i, level) {
  const x = SLOTS[i % SLOTS.length];
  const h = [0, 12, 22, 32, 40][level];
  const top = GROUND - h;
  const kind = i % 4;
  const s = [0, 0.45, 0.6, 0.72, 0.8][level];
  let out = `<g class="g-plant" style="--d:${(i % 5) * 0.4}s">`;
  out += `<path class="g-stem" d="M${x} ${GROUND}V${top}"/>`;
  out += leaf(x, top + h * 0.55, s, false, 'g-leaf') + leaf(x, top + h * 0.35, s * 0.9, true, 'g-leaf2');
  if (level >= 2) {
    const r = level >= 3 ? 6.5 : 4;
    if (level >= 3) {
      const petals = [0, 72, 144, 216, 288].map((a) => {
        const rad = (a * Math.PI) / 180;
        return `<circle cx="${(x + Math.cos(rad) * r).toFixed(1)}" cy="${(top + Math.sin(rad) * r).toFixed(1)}" r="${r * 0.75}"/>`;
      }).join('');
      out += `<g class="g-f${kind}">${petals}</g><circle class="g-heart" cx="${x}" cy="${top}" r="${r * 0.6}"/>`;
    } else out += `<ellipse class="g-f${kind}" cx="${x}" cy="${top - 2}" rx="${r * 0.7}" ry="${r}"/>`;
  }
  return out + '</g>';
}

const tree = () => `<g class="g-tree"><path class="g-trunk" d="M30 ${GROUND}c2-14 2-30-2-44h10c-4 14-4 30-2 44z"/>
  <circle class="g-crown" cx="33" cy="${GROUND - 62}" r="24"/><circle class="g-crown2" cx="18" cy="${GROUND - 50}" r="15"/><circle class="g-crown2" cx="48" cy="${GROUND - 52}" r="14"/>
  <circle class="g-fruit" cx="26" cy="${GROUND - 60}" r="3.2"/><circle class="g-fruit" cx="42" cy="${GROUND - 70}" r="3.2"/><circle class="g-fruit" cx="38" cy="${GROUND - 50}" r="3.2"/></g>`;

const butterfly = (x, y, n) => `<g class="g-fly" style="--d:${n * 1.3}s" transform="translate(${x} ${y})">
  <g class="g-wings"><ellipse class="g-wing" cx="-4" cy="0" rx="4.5" ry="3.4"/><ellipse class="g-wing" cx="4" cy="0" rx="4.5" ry="3.4"/></g>
  <path class="g-body-line" d="M0 -3V3"/></g>`;

// Number of plants and their growth for a stage: plant i appears at stage i+1
// and grows one level every three stages after that.
export function plants(stage) {
  const out = [];
  for (let i = 0; i < Math.min(stage, SLOTS.length); i++) out.push({ i, level: Math.min(3, 1 + Math.floor((stage - i - 1) / 3)) });
  return out;
}

export function gardenSvg({ stage = 0, sunny = false, label = '' } = {}) {
  const ps = plants(stage);
  const sky = sunny
    ? `<g class="g-sun"><circle cx="286" cy="34" r="14"/></g>`
    : `<g class="g-cloud"><ellipse cx="276" cy="36" rx="20" ry="9"/><ellipse cx="266" cy="31" rx="11" ry="9"/><ellipse cx="284" cy="29" rx="9" ry="8"/></g>`;
  const seed = stage === 0 ? `<ellipse class="g-seed" cx="${SLOTS[0]}" cy="${GROUND - 2}" rx="5" ry="3.5"/>` : '';
  return `<svg class="garden" viewBox="0 0 320 180" role="img" aria-label="${label.replace(/"/g, '&quot;')}">
    ${sky}
    ${stage >= 8 ? tree() : ''}
    <path class="g-hill" d="M0 ${GROUND + 2}c60-16 120-18 160-16s110 6 160 16v40H0z"/>
    <path class="g-ground" d="M0 ${GROUND}c70-6 250-6 320 0v40H0z"/>
    ${seed}${ps.map((p) => plant(p.i, p.level)).join('')}
    ${stage >= 5 ? butterfly(70, 70, 0) : ''}${stage >= 10 ? butterfly(230, 58, 1) : ''}
  </svg>`;
}
