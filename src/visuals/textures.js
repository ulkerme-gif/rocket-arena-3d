import * as THREE from 'three';

/** Procedural canvas textures (no external image assets). */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Turf and markings drawn in world coordinates (x across, z along the field). */
export function createFieldTexture(geometry, anisotropy = 8) {
  const d = geometry.dims;
  const bT = d.b + d.gd;
  const W = 1024, H = Math.round((W * bT) / d.a);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const sx = W / (2 * d.a), sz = H / (2 * bT);
  const X = (x) => (x + d.a) * sx;
  const Z = (z) => (bT - z) * sz;
  g.fillStyle = '#1b5a35';
  g.fillRect(0, 0, W, H);
  for (let z = -bT, i = 0; z < bT; z += 5, i++) {
    if (i % 2) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(0, Z(z + 5), W, 5 * sz);
    }
  }
  const tint = (zFrom, zTo, rgba) => {
    const y0 = Z(zFrom), y1 = Z(zTo);
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, rgba);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  };
  tint(bT, 8, 'rgba(43,140,255,0.30)');
  tint(-bT, -8, 'rgba(255,122,26,0.30)');

  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 0.3 * sx;
  g.beginPath();
  geometry.floorOutline.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
  g.closePath();
  g.stroke();
  g.beginPath();
  g.moveTo(X(-(d.a - d.Rf)), Z(0));
  g.lineTo(X(d.a - d.Rf), Z(0));
  g.stroke();
  g.beginPath();
  g.ellipse(X(0), Z(0), 9 * sx, 9 * sz, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(X(0), Z(0), 0.45 * sx, 0.45 * sz, 0, 0, Math.PI * 2);
  g.fill();
  for (const s of [1, -1]) {
    const zIn = s * (d.b - d.Rf), z1 = zIn - s * 12;
    g.strokeRect(X(-14), Math.min(Z(zIn), Z(z1)), 28 * sx, 12 * sz);
    g.save();
    g.strokeStyle = s > 0 ? 'rgba(140,200,255,1)' : 'rgba(255,180,120,1)';
    g.lineWidth = 0.4 * sx;
    g.beginPath();
    g.moveTo(X(-d.hg), Z(s * d.b));
    g.lineTo(X(d.hg), Z(s * d.b));
    g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createGridTexture({ size = 256, line = 'rgba(200,225,255,0.5)', fill = 'rgba(110,160,230,0.06)', width = 3 } = {}) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = fill;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = line;
  g.lineWidth = width;
  g.strokeRect(width / 2, width / 2, size - width, size - width);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNetTexture() {
  const s = 128;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, s / 2);
  g.lineTo(s / 2, 0);
  g.lineTo(s, s / 2);
  g.lineTo(s / 2, s);
  g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let ballTexture = null;
/** Classic ball pattern: 12 dark pentagons around icosahedron vertices (cached). */
export function getBallTexture() {
  if (ballTexture) return ballTexture;
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const data = img.data;
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [[0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]];
  const V = raw.map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const frames = V.map((v) => {
    let best = null, bd = -2;
    for (const u of V) {
      const dd = dot(u, v);
      if (dd < 0.99 && dd > bd) { bd = dd; best = u; }
    }
    const t0 = [best[0] - v[0] * bd, best[1] - v[1] * bd, best[2] - v[2] * bd];
    const l = Math.hypot(t0[0], t0[1], t0[2]);
    t0[0] /= l; t0[1] /= l; t0[2] /= l;
    const t1 = [v[1] * t0[2] - v[2] * t0[1], v[2] * t0[0] - v[0] * t0[2], v[0] * t0[1] - v[1] * t0[0]];
    return { v, t0, t1 };
  });
  const Rin = 0.2956, seam = 0.014, seg = (2 * Math.PI) / 5;
  for (let py = 0; py < H; py++) {
    const th = (Math.PI * (py + 0.5)) / H, st = Math.sin(th), ct = Math.cos(th);
    for (let px = 0; px < W; px++) {
      const ph = (2 * Math.PI * (px + 0.5)) / W;
      const d = [-Math.cos(ph) * st, ct, Math.sin(ph) * st];
      let f = frames[0], bd = -2;
      for (const fr of frames) {
        const dd = dot(d, fr.v);
        if (dd > bd) { bd = dd; f = fr; }
      }
      const tanT = Math.sqrt(Math.max(0, 1 - bd * bd)) / bd;
      let a = Math.atan2(dot(d, f.t1), dot(d, f.t0));
      a = (((a % seg) + seg) % seg) - seg / 2;
      const r = Rin / Math.cos(a);
      let R = 244, G = 246, B = 248;
      if (tanT < r - seam) { R = 28; G = 36; B = 50; }
      else if (tanT < r + seam) { R = 120; G = 132; B = 148; }
      const i = (py * W + px) * 4;
      data[i] = R; data[i + 1] = G; data[i + 2] = B; data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ballTexture = new THREE.CanvasTexture(c);
  ballTexture.colorSpace = THREE.SRGBColorSpace;
  ballTexture.anisotropy = 4;
  return ballTexture;
}

export function createSkyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x04070d) },
      horizon: { value: new THREE.Color(0x1a3352) },
      glow: { value: new THREE.Color(0x3a5f8c) },
    },
    vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = mix(horizon, top, smoothstep(-0.05, 0.6, h));
  c += glow * exp(-abs(h) * 10.0) * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
