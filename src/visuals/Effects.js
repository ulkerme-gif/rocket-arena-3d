import * as THREE from 'three';

const MAX = 1600;
const VERT = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying vec3 vColor; varying float vAlpha; uniform float uScale;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = 1.0 - d * 2.0;
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}`;

/** Pooled additive particles (boost trail, hits, pickups, goal explosion) + shockwaves. */
export class Effects {
  constructor(parent) {
    this.parent = parent;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.base = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.count = 0;
    const g = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [attr(this.pos, 3), attr(this.col, 3), attr(this.size, 1), attr(this.alpha, 1)];
    g.setAttribute('position', this.attrs[0]);
    g.setAttribute('aColor', this.attrs[1]);
    g.setAttribute('aSize', this.attrs[2]);
    g.setAttribute('aAlpha', this.attrs[3]);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 400 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.waves = [];
    this._c = new THREE.Color();
    this._white = new THREE.Color(0xffffff);
    this._gold = new THREE.Color(0xffc531);
    this._cyan = new THREE.Color(0x9fe6ff);
  }

  emit(x, y, z, vx, vy, vz, color, size, life, drag = 1.5, grav = 0) {
    if (this.count >= MAX) return;
    const i = this.count++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.base[i] = size; this.size[i] = size; this.alpha[i] = 1;
    this.life[i] = life; this.maxLife[i] = life; this.drag[i] = drag; this.grav[i] = grav;
  }

  explosion(p, color) {
    for (let i = 0; i < 260; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const speed = 6 + Math.random() * 24;
      const c = this._c.copy(color).lerp(this._white, Math.random() * 0.5);
      this.emit(p.x, p.y, p.z, s * Math.cos(th) * speed, Math.abs(u) * speed * 0.8 + 2, s * Math.sin(th) * speed, c, 0.5 + Math.random() * 0.9, 0.8 + Math.random() * 0.9, 1.4, -5);
    }
    const wave = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    wave.position.set(p.x, p.y, p.z);
    this.parent.add(wave);
    this.waves.push({ mesh: wave, t: 0 });
  }

  sparks(p, strength) {
    const n = Math.min(40, 6 + strength * 1.2);
    for (let i = 0; i < n; i++) {
      const v = 2 + Math.random() * strength * 0.4;
      this.emit(p.x, p.y, p.z, (Math.random() - 0.5) * v, Math.random() * v, (Math.random() - 0.5) * v, this._c.copy(this._gold).lerp(this._white, Math.random()), 0.18 + Math.random() * 0.2, 0.3 + Math.random() * 0.3, 2, -6);
    }
  }

  pickup(pad, big) {
    const n = big ? 36 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit(pad.x + Math.cos(a) * 0.8, 0.2, pad.z + Math.sin(a) * 0.8, Math.cos(a) * 1.5, 3 + Math.random() * 3, Math.sin(a) * 1.5, this._gold, big ? 0.35 : 0.22, 0.6, 1.2, -2);
    }
  }

  trail(p, forward, supersonic, teamColor) {
    for (let i = 0; i < 2; i++) {
      const c = supersonic ? this._c.copy(this._cyan).lerp(teamColor, 0.3) : this._c.copy(this._gold).lerp(teamColor, 0.25);
      this.emit(p.x, p.y, p.z, -forward.x * 5 + (Math.random() - 0.5) * 1.5, -forward.y * 5 + (Math.random() - 0.5) * 1.5, -forward.z * 5 + (Math.random() - 0.5) * 1.5, c, supersonic ? 0.32 : 0.24, 0.32, 3, 0);
    }
  }

  update(dt, scale) {
    this.material.uniforms.uScale.value = scale;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this._move(--this.count, i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k + this.grav[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = f;
      this.size[i] = this.base[i] * (0.5 + 0.5 * f);
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    for (const a of this.attrs) a.needsUpdate = true;
    for (let w = this.waves.length - 1; w >= 0; w--) {
      const wave = this.waves[w];
      wave.t += dt;
      wave.mesh.scale.setScalar(1 + wave.t * 40);
      wave.mesh.material.opacity = Math.max(0, 0.55 * (1 - wave.t / 0.6));
      if (wave.t > 0.6) {
        this.parent.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
        this.waves.splice(w, 1);
      }
    }
  }

  _move(from, to) {
    if (from === to) return;
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.col[t3 + k] = this.col[f3 + k];
    }
    this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from]; this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from]; this.base[to] = this.base[from]; this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from];
  }
}
