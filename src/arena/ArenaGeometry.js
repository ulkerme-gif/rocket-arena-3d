/**
 * Procedural arena geometry — the single source for BOTH the physics
 * collision mesh and the visual meshes, so they always match.
 * Pure math: no Three.js and no Rapier imports.
 *
 * Shape: a rounded-rectangle "bowl" (plan view corner radius Rc) whose
 * walls meet the floor through a concave fillet (radius Rf) and the
 * ceiling through another fillet (radius Rt). Goal boxes are cut into the
 * two end walls (BLUE goal at +Z, ORANGE goal at -Z).
 *
 * Floor and ceiling are flat and handled as cuboids by the physics layer;
 * everything else is a welded, consistently oriented triangle mesh whose
 * normals point INTO the playable volume.
 */
const HALF_PI = Math.PI / 2;
const UV_SCALE = 4; // meters per texture repeat on walls
const EPS = 1e-6;

export function computeArenaDims(cfg) {
  const d = {
    a: cfg.width / 2,
    b: cfg.length / 2,
    H: cfg.height,
    Rc: cfg.cornerRadius,
    Rf: cfg.floorFilletRadius,
    Rt: cfg.ceilingFilletRadius,
    gw: cfg.goal.width,
    gh: cfg.goal.height,
    gd: cfg.goal.depth,
  };
  d.hg = d.gw / 2;
  const problems = [];
  if (d.Rc <= d.Rf || d.Rc <= d.Rt) problems.push('cornerRadius must exceed both fillet radii');
  if (d.a - d.Rc <= d.hg) problems.push('goal is wider than the straight part of the end wall');
  if (d.Rf + d.Rt >= d.H) problems.push('fillets do not fit into the arena height');
  if (!(d.gh > d.Rf && d.gh < d.H - d.Rt)) problems.push('goal height must be between floorFilletRadius and height - ceilingFilletRadius');
  if (problems.length) throw new Error('Invalid arena config: ' + problems.join('; '));
  return d;
}

/** Collects vertices/triangles; optionally welds identical positions. */
class SurfaceBuilder {
  constructor(weld = false) {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.map = weld ? new Map() : null;
  }

  vertex(v) {
    const [x, y, z] = v.p;
    let key;
    if (this.map) {
      key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      const found = this.map.get(key);
      if (found !== undefined) return found;
    }
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(v.n[0], v.n[1], v.n[2]);
    this.uvs.push(v.uv[0], v.uv[1]);
    if (this.map) this.map.set(key, i);
    return i;
  }

  /** Adds a triangle oriented so its normal agrees with `ref` (points into the play space). */
  tri(i0, i1, i2, ref) {
    if (i0 === i1 || i1 === i2 || i0 === i2) return;
    const P = this.positions;
    const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) return;
    if (nx * ref[0] + ny * ref[1] + nz * ref[2] < 0) this.indices.push(i0, i2, i1);
    else this.indices.push(i0, i1, i2);
  }

  toArrays() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

function addTri(builders, a, b, c, ref) {
  for (const bl of builders) bl.tri(bl.vertex(a), bl.vertex(b), bl.vertex(c), ref);
}

function addQuad(builders, A, B, C, D) {
  const ref = [0, 0, 0];
  for (const v of [A, B, C, D]) { ref[0] += v.n[0]; ref[1] += v.n[1]; ref[2] += v.n[2]; }
  addTri(builders, A, B, C, ref);
  addTri(builders, A, C, D, ref);
}

/** Wall "stations": points around the plan-view perimeter with outward normals. */
function buildStations(d, seg) {
  const { a, b, Rc, hg } = d;
  const stations = [];
  const snap = (v, target) => (Math.abs(Math.abs(v) - target) < 1e-6 ? Math.sign(v) * target : v);
  const add = (x, z, nx, nz) => stations.push({ x: snap(snap(x, hg), a), z: snap(z, b), nx, nz });

  function straight(x0, z0, x1, z1, nx, nz, breaks = []) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ts = [0, ...breaks.filter((t) => t > EPS && t < 1 - EPS), 1].sort((p, q) => p - q);
    for (let i = 0; i < ts.length - 1; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      const n = Math.max(1, Math.ceil(((t1 - t0) * len) / seg.maxStraight));
      for (let k = 0; k < n; k++) {
        const t = t0 + ((t1 - t0) * k) / n;
        add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz);
      }
    }
  }
  function arc(cx, cz, a0, a1) {
    for (let k = 0; k < seg.corner; k++) {
      const t = a0 + ((a1 - a0) * k) / seg.corner;
      add(cx + Rc * Math.cos(t), cz + Rc * Math.sin(t), Math.cos(t), Math.sin(t));
    }
  }

  const ex = a - Rc, ez = b - Rc;
  const goalBreaks = [(ex - hg) / (2 * ex), (ex + hg) / (2 * ex)];
  straight(a, -ez, a, ez, 1, 0);
  arc(ex, ez, 0, HALF_PI);
  straight(ex, b, -ex, b, 0, 1, goalBreaks);
  arc(-ex, ez, HALF_PI, Math.PI);
  straight(-a, ez, -a, -ez, -1, 0);
  arc(-ex, -ez, Math.PI, 1.5 * Math.PI);
  straight(-ex, -b, ex, -b, 0, -1, goalBreaks);
  arc(ex, -ez, 1.5 * Math.PI, 2 * Math.PI);

  let s = 0;
  const n = stations.length;
  for (let i = 0; i < n; i++) {
    const st = stations[i];
    const nx = stations[(i + 1) % n];
    st.s = s;
    s += Math.hypot(nx.x - st.x, nx.z - st.z);
    const onEnd = (p) => Math.abs(Math.abs(p.z) - b) < EPS && Math.abs(p.x) <= hg + EPS;
    st.mouthAfter = onEnd(st) && onEnd(nx);
  }
  return { stations, perimeter: s };
}

/** Vertical cross-section of the wall band (d = inward offset from the wall plane). */
function buildProfiles(d, seg) {
  const { H, Rf, Rt, gh } = d;
  const full = [];
  for (let i = 0; i <= seg.floorFillet; i++) {
    const th = (HALF_PI * i) / seg.floorFillet;
    full.push({ d: Rf * (1 - Math.sin(th)), y: Rf * (1 - Math.cos(th)), nN: -Math.sin(th), nY: Math.cos(th), region: 'ramp' });
  }
  const wallTop = H - Rt;
  const breaks = [Rf, gh, wallTop].sort((p, q) => p - q);
  for (let i = 0; i < breaks.length - 1; i++) {
    const y0 = breaks[i], y1 = breaks[i + 1];
    const n = Math.max(1, Math.ceil((y1 - y0) / seg.maxWallRow));
    for (let k = 1; k <= n; k++) full.push({ d: 0, y: k === n ? y1 : y0 + ((y1 - y0) * k) / n, nN: -1, nY: 0, region: 'wall' });
  }
  for (let j = 1; j <= seg.ceilingFillet; j++) {
    const ph = HALF_PI * (1 - j / seg.ceilingFillet);
    full.push({ d: Rt * (1 - Math.sin(ph)), y: wallTop + Rt * Math.cos(ph), nN: -Math.sin(ph), nY: -Math.cos(ph), region: 'ceilingRamp' });
  }
  let v = 0;
  for (let i = 0; i < full.length; i++) {
    if (i > 0) v += Math.hypot(full[i].d - full[i - 1].d, full[i].y - full[i - 1].y);
    full[i].v = v;
  }
  const gi = full.findIndex((p) => p.region === 'wall' && Math.abs(p.y - gh) < EPS);
  return { full, mouth: full.slice(gi) };
}

function stationPoint(st, pr, s = st.s) {
  return {
    p: [st.x - st.nx * pr.d, pr.y, st.z - st.nz * pr.d],
    n: [pr.nN * st.nx, pr.nY, pr.nN * st.nz],
    uv: [s / UV_SCALE, pr.v / UV_SCALE],
  };
}

/** Planar rectangular grid of quads. pointFn(i, j) returns a vertex record. */
function addGrid(builders, ni, nj, pointFn) {
  for (let i = 0; i < ni - 1; i++) {
    for (let j = 0; j < nj - 1; j++) {
      addQuad(builders, pointFn(i, j), pointFn(i + 1, j), pointFn(i + 1, j + 1), pointFn(i, j + 1));
    }
  }
}

/**
 * Builds the whole arena description.
 * @param {object} cfg CONFIG.arena
 */
export function buildArenaGeometry(cfg) {
  const d = computeArenaDims(cfg);
  const seg = cfg.segments;
  const { stations, perimeter } = buildStations(d, seg);
  const { full, mouth } = buildProfiles(d, seg);

  const collision = new SurfaceBuilder(true);
  const visual = {
    ramp: new SurfaceBuilder(),
    wall: new SurfaceBuilder(),
    ceilingRamp: new SurfaceBuilder(),
    goalBlue: new SurfaceBuilder(),
    goalOrange: new SurfaceBuilder(),
  };

  // --- Wall band (floor fillet, wall, ceiling fillet) around the perimeter.
  const n = stations.length;
  for (let k = 0; k < n; k++) {
    const st = stations[k];
    const nx = stations[(k + 1) % n];
    const nextS = k === n - 1 ? perimeter : nx.s;
    const prof = st.mouthAfter ? mouth : full;
    for (let r = 0; r < prof.length - 1; r++) {
      const p0 = prof[r], p1 = prof[r + 1];
      const region = p1.region;
      addQuad(
        [visual[region], collision],
        stationPoint(st, p0),
        stationPoint(nx, p0, nextS),
        stationPoint(nx, p1, nextS),
        stationPoint(st, p1),
      );
    }
  }

  // --- Goals: cheeks (side faces of the floor fillet at the posts) + interior box.
  const fillet = full.filter((p) => p.region === 'ramp');
  const wallLineYs = [0, ...full.filter((p) => p.d < EPS && p.y <= d.gh + EPS).map((p) => p.y)];
  const goals = [];
  for (const zSign of [1, -1]) {
    const team = zSign > 0 ? 'blue' : 'orange';
    const builders = [team === 'blue' ? visual.goalBlue : visual.goalOrange, collision];
    const zLine = zSign * d.b;
    const zBack = zSign * (d.b + d.gd);

    for (const xSign of [1, -1]) {
      const x = xSign * d.hg;
      const ref = [-xSign, 0, 0];
      const corner = { p: [x, 0, zLine], n: ref, uv: [zLine / UV_SCALE, 0] };
      for (let i = 0; i < fillet.length - 1; i++) {
        const mk = (pr) => ({ p: [x, pr.y, zSign * (d.b - pr.d)], n: ref, uv: [zSign * (d.b - pr.d) / UV_SCALE, pr.y / UV_SCALE] });
        addTri([visual.ramp, collision], corner, mk(fillet[i]), mk(fillet[i + 1]), ref);
      }
    }

    const nz = Math.max(1, Math.ceil(d.gd / seg.goalGrid));
    const zs = Array.from({ length: nz + 1 }, (_, i) => zLine + ((zBack - zLine) * i) / nz);
    const xs = stations
      .filter((st) => Math.abs(st.z - zLine) < EPS && Math.abs(st.x) <= d.hg + EPS)
      .map((st) => st.x)
      .sort((p, q) => p - q);
    const ys = wallLineYs;

    for (const xSign of [1, -1]) {
      const x = xSign * d.hg;
      const nrm = [-xSign, 0, 0];
      addGrid(builders, zs.length, ys.length, (i, j) => ({ p: [x, ys[j], zs[i]], n: nrm, uv: [zs[i] / UV_SCALE, ys[j] / UV_SCALE] }));
    }
    addGrid(builders, xs.length, zs.length, (i, j) => ({ p: [xs[i], d.gh, zs[j]], n: [0, -1, 0], uv: [xs[i] / UV_SCALE, zs[j] / UV_SCALE] }));
    addGrid(builders, xs.length, ys.length, (i, j) => ({ p: [xs[i], ys[j], zBack], n: [0, 0, -zSign], uv: [xs[i] / UV_SCALE, ys[j] / UV_SCALE] }));

    goals.push({
      team,
      zSign,
      lineZ: zLine,
      backZ: zBack,
      halfWidth: d.hg,
      height: d.gh,
      depth: d.gd,
      center: { x: 0, y: d.gh / 2, z: zSign * (d.b + d.gd / 2) },
    });
  }

  // --- Flat outlines (plan view polygons as [x, z]) for the visual floor/ceiling.
  const floorOutline = [];
  for (let k = 0; k < n; k++) {
    const st = stations[k];
    const prevMouth = stations[(k - 1 + n) % n].mouthAfter;
    if (st.mouthAfter && !prevMouth) {
      floorOutline.push([st.x, st.z - st.nz * d.Rf], [st.x, st.z + st.nz * d.gd]);
    } else if (!st.mouthAfter && prevMouth) {
      floorOutline.push([st.x, st.z + st.nz * d.gd], [st.x, st.z - st.nz * d.Rf]);
    } else if (!st.mouthAfter) {
      floorOutline.push([st.x - st.nx * d.Rf, st.z - st.nz * d.Rf]);
    }
  }
  const ceilingOutline = stations.map((st) => [st.x - st.nx * d.Rt, st.z - st.nz * d.Rt]);

  return {
    dims: d,
    stations,
    perimeter,
    collision: collision.toArrays(),
    visual: Object.fromEntries(Object.entries(visual).map(([k, v]) => [k, v.toArrays()])),
    floorOutline,
    ceilingOutline,
    goals,
  };
}

/**
 * Analytic "is this point inside the playable volume?" test (used by tests,
 * the bot and out-of-bounds safety checks). margin shrinks the volume.
 */
export function isInsideArena(dims, x, y, z, margin = 0) {
  const { a, b, H, Rc, hg, gh, gd } = dims;
  if (y < margin || y > H - margin) return false;
  // inside a goal box?
  if (Math.abs(z) > b) {
    return Math.abs(x) <= hg - margin && y <= gh - margin && Math.abs(z) <= b + gd - margin;
  }
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > a - margin || az > b - margin) return false;
  const cx = a - Rc, cz = b - Rc;
  if (ax > cx && az > cz) return Math.hypot(ax - cx, az - cz) <= Rc - margin;
  return true;
}
