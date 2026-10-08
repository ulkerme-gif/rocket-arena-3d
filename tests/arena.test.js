import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, seeded } from './helpers.js';
import { buildArenaGeometry, isInsideArena } from '../src/arena/ArenaGeometry.js';
import { CONFIG } from '../src/config/index.js';

test('arena collision mesh is watertight (3000 random rays all hit)', async () => {
  const sim = await createSim();
  console.log(`  trimesh flags: ${sim.arena.trimeshFlags}, triangles: ${sim.geometry.collision.indices.length / 3}`);
  const rnd = seeded(7);
  let misses = 0;
  for (let i = 0; i < 3000; i++) {
    let p;
    do p = { x: (rnd() * 2 - 1) * 34, y: 0.3 + rnd() * 19.4, z: (rnd() * 2 - 1) * 58 };
    while (!isInsideArena(sim.dims, p.x, p.y, p.z, 0.2));
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    if (!sim.physics.castArenaRay(p, { x: s * Math.cos(th), y: u, z: s * Math.sin(th) }, 500)) misses++;
  }
  assert.equal(misses, 0);
  sim.dispose();
});

test('visual meshes are built from exactly the collision surface', () => {
  const geo = buildArenaGeometry(CONFIG.arena);
  const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  const P = geo.collision.positions;
  const keys = new Set();
  for (let i = 0; i < P.length; i += 3) keys.add(key(P[i], P[i + 1], P[i + 2]));
  for (const [name, arr] of Object.entries(geo.visual)) {
    for (let i = 0; i < arr.positions.length; i += 3) {
      assert.ok(keys.has(key(arr.positions[i], arr.positions[i + 1], arr.positions[i + 2])), `${name} vertex ${i / 3} not in collision mesh`);
    }
  }
});

test('boost pads and kickoff spots lie on the flat floor', async () => {
  const sim = await createSim();
  const { a, b, Rc, Rf } = sim.dims;
  const onFlat = (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax > a - Rf || az > b - Rf + 0.001) return false;
    const cx = a - Rc, cz = b - Rc;
    return !(ax > cx && az > cz) || Math.hypot(ax - cx, az - cz) <= Rc - Rf;
  };
  for (const p of sim.layout.boostPads) assert.ok(onFlat(p.x, p.z), `pad ${p.index} at ${p.x},${p.z}`);
  for (const s of sim.layout.kickoffSpots) assert.ok(onFlat(s.x, s.z), `kickoff ${s.x},${s.z}`);
  sim.dispose();
});
