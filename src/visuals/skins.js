import * as THREE from 'three';

/**
 * Car skins ("kaplama"): a small JSON description that is saved on the tablet,
 * sent to the host when joining a room, and painted into a canvas texture.
 *
 * { v: 1, base: 'team' | '#rrggbb', accent: '#rrggbb', pattern, number: '' | '0'..'99', art: '' | 384 hex chars }
 * art = 32 x 12 pixel drawing for the doors, one hex digit per cell (0 = transparent).
 */
export const SKIN_KEY = 'rocket-arena-skin';
export const ART_W = 32;
export const ART_H = 12;
export const SKIN_PATTERNS = Object.freeze(['solid', 'stripes', 'twotone', 'flames', 'checker', 'camo', 'bolt']);
export const PATTERN_LABELS = Object.freeze({
  solid: 'DÜZ', stripes: 'ŞERİT', twotone: 'İKİ RENK', flames: 'ALEV', checker: 'DAMA', camo: 'KAMUFLAJ', bolt: 'ŞİMŞEK',
});
export const SKIN_COLORS = Object.freeze([
  '#1f74e0', '#f0661a', '#e8eef5', '#15181d', '#d92b3a', '#ffc21a',
  '#3fbf4f', '#18c6c9', '#7b4fe0', '#ff5fa8', '#8a5a2b', '#9aa6b2',
]);
/** Drawing palette: index 1..15 (0 = transparent). */
export const ART_PALETTE = Object.freeze([
  null, '#ffffff', '#111111', '#e5243b', '#ff8a1f', '#ffd21f', '#b6f03a', '#2fbf4f', '#20d0d6',
  '#2f86df', '#1b2f7a', '#8c4be6', '#ff6fb5', '#7a4a22', '#8f9aa6', '#d4a72c',
]);
export const TEAM_BODY = Object.freeze({ blue: '#1f74e0', orange: '#f0661a' });
export const DEFAULT_SKIN = Object.freeze({ v: 1, base: 'team', accent: '#ffffff', pattern: 'solid', number: '', art: '' });

const HEX = /^#[0-9a-f]{6}$/i;
const EMPTY_ART = '0'.repeat(ART_W * ART_H);

/** Accepts anything (user input, network packets) and returns a safe skin. */
export function cleanSkin(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SKIN };
  const art = typeof raw.art === 'string' && raw.art.length === ART_W * ART_H && /^[0-9a-f]+$/i.test(raw.art)
    ? raw.art.toLowerCase() : '';
  return {
    v: 1,
    base: raw.base === 'team' || (typeof raw.base === 'string' && HEX.test(raw.base)) ? String(raw.base).toLowerCase() : 'team',
    accent: typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_SKIN.accent,
    pattern: SKIN_PATTERNS.includes(raw.pattern) ? raw.pattern : 'solid',
    number: typeof raw.number === 'string' && /^\d{0,2}$/.test(raw.number) ? raw.number : '',
    art: art === EMPTY_ART ? '' : art,
  };
}

export const isDefaultSkin = (skin) => {
  const s = cleanSkin(skin);
  return s.base === 'team' && s.pattern === 'solid' && !s.number && !s.art;
};

export function loadSkin(storage = globalThis.localStorage) {
  try { return cleanSkin(JSON.parse(storage?.getItem(SKIN_KEY) ?? 'null')); } catch { return { ...DEFAULT_SKIN }; }
}

export function saveSkin(skin, storage = globalThis.localStorage) {
  const clean = cleanSkin(skin);
  try { storage?.setItem(SKIN_KEY, JSON.stringify(clean)); } catch { /* private mode */ }
  return clean;
}

/** Sets one drawing cell; returns the new art string. */
export function paintCell(art, x, y, colorIndex) {
  if (x < 0 || y < 0 || x >= ART_W || y >= ART_H) return art || '';
  const cells = (art || EMPTY_ART).split('');
  cells[y * ART_W + x] = Math.max(0, Math.min(15, colorIndex | 0)).toString(16);
  const next = cells.join('');
  return next === EMPTY_ART ? '' : next;
}

export const artCell = (art, x, y) => (art ? parseInt(art[y * ART_W + x], 16) : 0);

// ---------------------------------------------------------------- texture atlas
/** 512 x 512 texture: one strip per car side (text reads correctly on both) + the top. */
export const ATLAS_SIZE = 512;
export const ATLAS = Object.freeze({
  sideA: { x: 0, y: 2, w: 512, h: 104 },   // nose on the right of the image
  sideB: { x: 0, y: 110, w: 512, h: 104 }, // nose on the left of the image
  top: { x: 0, y: 220, w: 512, h: 290 },   // roof/hood/bottom: nose right, car width vertical
});
const vRange = (r) => [1 - (r.y + r.h) / ATLAS_SIZE, 1 - r.y / ATLAS_SIZE];

/**
 * UV generator for the extruded body: caps (= car sides) map into sideA / sideB,
 * the extruded walls (roof, hood, nose, rear, floor) into top.
 * bounds = { minX, maxX, minY, maxY, minZ, maxZ } of the raw extrusion.
 */
export function bodyUVGenerator(b) {
  const [a0, a1] = vRange(ATLAS.sideA);
  const [b0, b1] = vRange(ATLAS.sideB);
  const [t0, t1] = vRange(ATLAS.top);
  const lenX = (x) => (x - b.minX) / (b.maxX - b.minX);
  const upY = (y) => (y - b.minY) / (b.maxY - b.minY);
  const acrossZ = (z) => (z - b.minZ) / (b.maxZ - b.minZ);
  const midZ = (b.minZ + b.maxZ) / 2;
  return {
    generateTopUV(_g, v, ia, ib, ic) {
      return [ia, ib, ic].map((i) => {
        const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        // Cap facing +Z reads with the nose on the right; the -Z cap is seen mirrored, so flip u.
        return z >= midZ
          ? new THREE.Vector2(lenX(x), a0 + (a1 - a0) * upY(y))
          : new THREE.Vector2(1 - lenX(x), b0 + (b1 - b0) * upY(y));
      });
    },
    generateSideWallUV(_g, v, ia, ib, ic, id) {
      return [ia, ib, ic, id].map((i) => new THREE.Vector2(lenX(v[i * 3]), t0 + (t1 - t0) * acrossZ(v[i * 3 + 2])));
    },
  };
}

function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + amount))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Runs fn in a coordinate system where the nose is at the right edge of r. */
function noseRight(ctx, r, isNoseRight, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (!isNoseRight) { ctx.translate(r.x * 2 + r.w, 0); ctx.scale(-1, 1); }
  fn();
  ctx.restore();
}

const PATTERNS = {
  solid() {},
  stripes(ctx, r, c, where) {
    ctx.fillStyle = c.accent;
    if (where === 'side') {
      ctx.fillRect(r.x, r.y + r.h * 0.46, r.w, r.h * 0.16);
      ctx.fillRect(r.x, r.y + r.h * 0.68, r.w, r.h * 0.04);
    } else {
      ctx.fillRect(r.x, r.y + r.h * 0.34, r.w, r.h * 0.1);
      ctx.fillRect(r.x, r.y + r.h * 0.56, r.w, r.h * 0.1);
    }
  },
  twotone(ctx, r, c, where) {
    if (where !== 'side') return;
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h * 0.5);
    ctx.lineTo(r.x + r.w, r.y + r.h * 0.42);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x, r.y + r.h);
    ctx.fill();
    ctx.fillStyle = c.dark;
    ctx.fillRect(r.x, r.y + r.h * 0.44, r.w, r.h * 0.03);
  },
  flames(ctx, r, c, where) {
    const side = where === 'side';
    const tongues = side ? 4 : 5;
    const reach = side ? 0.72 : 0.45;
    const half = side ? 0.2 : 0.11;
    for (let i = 0; i < tongues; i++) {
      const y0 = r.y + r.h * ((side ? 0.2 : 0.12) + ((side ? 0.62 : 0.76) * i) / (tongues - 1));
      const len = r.w * reach * (0.55 + 0.45 * Math.sin(i * 2.1 + 1) ** 2);
      ctx.beginPath();
      ctx.moveTo(r.x + r.w, y0 - r.h * half);
      ctx.quadraticCurveTo(r.x + r.w - len * 0.55, y0 - r.h * half * 1.4, r.x + r.w - len, y0);
      ctx.quadraticCurveTo(r.x + r.w - len * 0.5, y0 + r.h * half * 0.2, r.x + r.w, y0 + r.h * half);
      ctx.closePath();
      ctx.fillStyle = c.accent;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.dark;
      ctx.stroke();
    }
  },
  checker(ctx, r, c) {
    const cell = r.h / (r.h > 200 ? 8 : 4);
    ctx.fillStyle = c.accent;
    for (let y = 0; y * cell < r.h; y++) {
      for (let x = 0; x * cell < r.w; x++) if ((x + y) % 2) ctx.fillRect(r.x + x * cell, r.y + y * cell, cell, cell);
    }
  },
  camo(ctx, r, c) {
    const rnd = seededRandom(`${c.accent}${c.base}${r.y}`);
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = i % 3 === 0 ? c.dark : c.accent;
      ctx.beginPath();
      ctx.ellipse(r.x + rnd() * r.w, r.y + rnd() * r.h, 14 + rnd() * 34, 8 + rnd() * 18, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  bolt(ctx, r, c, where) {
    const mid = r.y + r.h * (where === 'side' ? 0.55 : 0.5);
    const amp = r.h * (where === 'side' ? 0.22 : 0.12);
    const pts = [[0.04, 0], [0.32, -1], [0.5, 0.2], [0.68, -0.9], [0.98, 0.1]];
    ctx.beginPath();
    pts.forEach(([u, k], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, r.x + u * r.w, mid + k * amp));
    ctx.lineWidth = r.h * (where === 'side' ? 0.16 : 0.07);
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = c.dark;
    ctx.stroke();
    ctx.lineWidth *= 0.62;
    ctx.strokeStyle = c.accent;
    ctx.stroke();
  },
};

function drawArt(ctx, art, cx, cy, cell) {
  if (!art) return;
  const x0 = Math.round(cx - (ART_W * cell) / 2);
  const y0 = Math.round(cy - (ART_H * cell) / 2);
  for (let y = 0; y < ART_H; y++) {
    for (let x = 0; x < ART_W; x++) {
      const color = ART_PALETTE[artCell(art, x, y)];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

function drawNumber(ctx, text, cx, cy, size, base) {
  if (!text) return;
  ctx.font = `900 ${size}px "Barlow Condensed", Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const light = parseInt(base.slice(1, 3), 16) * 0.3 + parseInt(base.slice(3, 5), 16) * 0.59 + parseInt(base.slice(5, 7), 16) * 0.11 > 150;
  ctx.lineWidth = size * 0.12;
  ctx.strokeStyle = light ? '#ffffff' : '#0b0f14';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = light ? '#0b0f14' : '#ffffff';
  ctx.fillText(text, cx, cy);
}

/** Paints the whole atlas for a car of the given team. */
export function drawSkinAtlas(ctx, rawSkin, team = 'blue') {
  const skin = cleanSkin(rawSkin);
  const base = skin.base === 'team' ? TEAM_BODY[team] ?? TEAM_BODY.blue : skin.base;
  const c = { base, accent: skin.accent, dark: shade(base, -0.45) };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const pattern = PATTERNS[skin.pattern] ?? PATTERNS.solid;
  for (const [r, nose] of [[ATLAS.sideA, true], [ATLAS.sideB, false]]) {
    noseRight(ctx, r, nose, () => pattern(ctx, r, c, 'side'));
    // Text and drawings are never mirrored, so they read correctly on both sides.
    const cy = r.y + r.h * 0.5;
    if (skin.art) {
      drawArt(ctx, skin.art, r.x + r.w * 0.5, cy, Math.min((r.w * 0.56) / ART_W, (r.h * 0.9) / ART_H));
      const rear = nose ? r.x + r.w * 0.11 : r.x + r.w * 0.89;
      drawNumber(ctx, skin.number, rear, cy, r.h * 0.62, base);
    } else {
      drawNumber(ctx, skin.number, r.x + r.w * 0.47, cy, r.h * 0.86, base);
    }
  }
  noseRight(ctx, ATLAS.top, true, () => pattern(ctx, ATLAS.top, c, 'top'));
  return skin;
}
