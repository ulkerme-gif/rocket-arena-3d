import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ART_H, ART_W, ATLAS, ATLAS_SIZE, DEFAULT_SKIN, SKIN_PATTERNS, artCell, cleanSkin, drawSkinAtlas, isDefaultSkin,
  loadSkin, paintCell, saveSkin,
} from '../src/visuals/skins.js';
import { CarView } from '../src/visuals/CarView.js';
import { makeStaticCar } from '../src/visuals/staticCar.js';

test('cleanSkin keeps valid choices and replaces anything else', () => {
  assert.deepEqual(cleanSkin(null), DEFAULT_SKIN);
  assert.deepEqual(cleanSkin({ base: '#ABCDEF', accent: '#123456', pattern: 'camo', number: '42' }),
    { v: 1, base: '#abcdef', accent: '#123456', pattern: 'camo', number: '42', art: '' });
  const junk = cleanSkin({ base: 'red; background:url(x)', accent: 5, pattern: 'x', number: '123', art: 'ff' });
  assert.deepEqual(junk, DEFAULT_SKIN);
  assert.equal(isDefaultSkin({}), true);
  assert.equal(isDefaultSkin({ number: '9' }), false);
});

test('finger painting: cells, eraser, bounds, empty drawing collapses to ""', () => {
  let art = paintCell('', 3, 2, 5);
  assert.equal(art.length, ART_W * ART_H);
  assert.equal(artCell(art, 3, 2), 5);
  art = paintCell(art, ART_W - 1, ART_H - 1, 15);
  assert.equal(artCell(art, ART_W - 1, ART_H - 1), 15);
  assert.equal(paintCell(art, 99, 0, 3), art, 'outside the grid: unchanged');
  art = paintCell(paintCell(art, 3, 2, 0), ART_W - 1, ART_H - 1, 0);
  assert.equal(art, '');
  assert.equal(cleanSkin({ art: '0'.repeat(ART_W * ART_H) }).art, '');
});

test('skins persist in local storage', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadSkin(storage), DEFAULT_SKIN);
  saveSkin({ base: '#d92b3a', pattern: 'stripes', number: '7' }, storage);
  assert.equal(loadSkin(storage).pattern, 'stripes');
  store.set('rocket-arena-skin', '{broken');
  assert.deepEqual(loadSkin(storage), DEFAULT_SKIN);
});

function recordingContext() {
  const calls = [];
  return new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls.push([key, args]); };
    },
    set(target, key, value) { calls.push([`set:${String(key)}`, [value]]); return true; },
  });
}

test('every pattern paints without errors; numbers and drawings are drawn on both sides', () => {
  for (const pattern of SKIN_PATTERNS) {
    const ctx = recordingContext();
    drawSkinAtlas(ctx, { base: '#3fbf4f', accent: '#ffffff', pattern, number: '7', art: paintCell('', 0, 0, 1) }, 'orange');
    assert.ok(ctx.calls.length > 5, pattern);
    assert.equal(ctx.calls.filter(([k]) => k === 'fillText').length, 2, `${pattern}: number on both sides`);
  }
  const team = recordingContext();
  drawSkinAtlas(team, { base: 'team' }, 'orange');
  assert.ok(team.calls.some(([k, [v]]) => k === 'set:fillStyle' && v === '#f0661a'), 'team base uses the team colour');
});

test('body UVs: each side reads correctly from outside, the roof maps to the top strip', () => {
  const view = new CarView(makeStaticCar({ id: 'x', team: 'blue' }), new THREE.Group());
  const g = view.group.children[0].geometry;
  const pos = g.attributes.position, uv = g.attributes.uv, nrm = g.attributes.normal;
  const range = (r) => [1 - (r.y + r.h) / ATLAS_SIZE, 1 - r.y / ATLAS_SIZE];
  const within = (v, [a, b]) => v >= a - 1e-6 && v <= b + 1e-6;
  const corr = (list) => {
    const n = list.length, mu = list.reduce((s, p) => s + p.u, 0) / n, mz = list.reduce((s, p) => s + p.nose, 0) / n;
    const cov = list.reduce((s, p) => s + (p.u - mu) * (p.nose - mz), 0);
    return cov / Math.sqrt(list.reduce((s, p) => s + (p.u - mu) ** 2, 0) * list.reduce((s, p) => s + (p.nose - mz) ** 2, 0));
  };
  const right = [], left = [];
  for (let i = 0; i < pos.count; i++) {
    const nx = nrm.getX(i), v = uv.getY(i), u = uv.getX(i), nose = -pos.getZ(i);
    if (nx > 0.9 && within(v, range(ATLAS.sideA))) right.push({ u, nose });
    if (nx < -0.9 && within(v, range(ATLAS.sideB))) left.push({ u, nose });
    assert.ok(u >= -1e-6 && u <= 1 + 1e-6 && v >= 0 && v <= 1, 'uv inside the texture');
  }
  assert.ok(right.length > 6 && left.length > 6);
  // +X side: viewer's right is the nose -> u grows towards the nose. -X side: the opposite.
  assert.ok(corr(right) > 0.99);
  assert.ok(corr(left) < -0.99);
});

test('CarView.setSkin without a 2D canvas (Node) still applies the body colour and resets cleanly', () => {
  const view = new CarView(makeStaticCar({ id: 'x', team: 'orange' }), new THREE.Group());
  view.setSkin({ base: '#7b4fe0', pattern: 'stripes' });
  assert.equal(view.bodyMat.color.getHexString(), '7b4fe0');
  view.setSkin(null);
  assert.equal(view.bodyMat.color.getHexString(), 'f0661a');
  assert.equal(view.bodyMat.map, null);
});
