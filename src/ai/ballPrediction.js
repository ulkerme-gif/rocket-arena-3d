/**
 * Lightweight ball prediction for the AI: gravity, drag, floor/ceiling and
 * flat-wall bounces (curved ramps are ignored). Pure function, plain objects.
 * @returns {Array<{t:number, p:{x,y,z}, v:{x,y,z}}>}
 */
export function predictBall(ball, arena, gravity, horizon = 3, step = 1 / 30, restitution = 0.6, drag = 0.03) {
  const out = [];
  const r = ball.radius;
  const p = { ...ball.position };
  const v = { ...ball.velocity };
  const maxX = arena.halfWidth - r, maxZ = arena.halfLength - r, top = arena.height - r;
  const n = Math.ceil(horizon / step);
  for (let i = 1; i <= n; i++) {
    v.y += gravity * step;
    p.x += v.x * step;
    p.y += v.y * step;
    p.z += v.z * step;
    if (p.y < r) {
      p.y = r;
      v.y = Math.abs(v.y) * restitution;
      if (v.y < 0.8) v.y = 0;
    } else if (p.y > top) {
      p.y = top;
      v.y = -Math.abs(v.y) * restitution;
    }
    if (Math.abs(p.x) > maxX) {
      p.x = Math.sign(p.x) * maxX;
      v.x = -v.x * restitution;
    }
    const inMouth = Math.abs(p.x) < arena.goalHalfWidth - r && p.y < arena.goalHeight - r;
    if (!inMouth && Math.abs(p.z) > maxZ) {
      p.z = Math.sign(p.z) * maxZ;
      v.z = -v.z * restitution;
    }
    const k = Math.max(0, 1 - drag * step);
    v.x *= k; v.y *= k; v.z *= k;
    out.push({ t: i * step, p: { x: p.x, y: p.y, z: p.z }, v: { x: v.x, y: v.y, z: v.z } });
  }
  return out;
}
