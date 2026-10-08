import * as THREE from 'three';
import { createFieldTexture, createGridTexture, createNetTexture } from './textures.js';

export const TEAM_COLORS = { blue: new THREE.Color(0x2b8cff), orange: new THREE.Color(0xff7a1a) };

function toGeometry(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(arr.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(arr.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(arr.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Static arena visuals built from the SAME ArenaGeometry data as the physics
 * colliders (floor outline, wall band, goals), plus stadium decoration.
 */
export class ArenaView {
  constructor(scene, geometry, webglRenderer) {
    this.group = new THREE.Group();
    this.group.name = 'arena';
    scene.add(this.group);
    const aniso = webglRenderer ? webglRenderer.capabilities.getMaxAnisotropy() : 4;
    this.textures = {
      field: createFieldTexture(geometry, aniso),
      glass: createGridTexture({ line: 'rgba(200,225,255,0.55)', fill: 'rgba(110,160,230,0.07)', width: 4 }),
      glassFaint: createGridTexture({ line: 'rgba(200,225,255,0.2)', fill: 'rgba(110,160,230,0.02)', width: 3 }),
      rampGlow: createGridTexture({ line: '#ffffff', fill: '#000000', width: 4 }),
      net: createNetTexture(),
    };
    this._buildFloor(geometry);
    this._buildShell(geometry);
    this._buildGoals(geometry);
    this._buildTrim(geometry);
    this._buildStadium(geometry.dims);
  }

  _buildFloor(geometry) {
    const d = geometry.dims;
    const shape = new THREE.Shape(geometry.floorOutline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const bT = d.b + d.gd;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + d.a) / (2 * d.a), (pos.getZ(i) + bT) / (2 * bT));
    uv.needsUpdate = true;
    const floor = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.textures.field, roughness: 0.95, metalness: 0 }));
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  _buildShell(geometry) {
    const d = geometry.dims;
    const t = this.textures;
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x1d2a3d, roughness: 0.55, metalness: 0.25, emissive: 0x2d6fc0, emissiveMap: t.rampGlow, emissiveIntensity: 0.22,
    });
    const glassMat = new THREE.MeshBasicMaterial({ map: t.glass, color: 0xa9cfff, transparent: true, depthWrite: false });
    const glassFaint = new THREE.MeshBasicMaterial({ map: t.glassFaint, color: 0xa9cfff, transparent: true, depthWrite: false });
    const ramp = new THREE.Mesh(toGeometry(geometry.visual.ramp), rampMat);
    ramp.receiveShadow = true;
    const wall = new THREE.Mesh(toGeometry(geometry.visual.wall), glassMat);
    wall.renderOrder = 2;
    const ceilingRamp = new THREE.Mesh(toGeometry(geometry.visual.ceilingRamp), glassFaint);
    ceilingRamp.renderOrder = 2;
    const cg = new THREE.ShapeGeometry(new THREE.Shape(geometry.ceilingOutline.map(([x, z]) => new THREE.Vector2(x, z))));
    cg.rotateX(Math.PI / 2);
    cg.translate(0, d.H, 0);
    const cp = cg.attributes.position, cu = cg.attributes.uv;
    for (let i = 0; i < cp.count; i++) cu.setXY(i, cp.getX(i) / 4, cp.getZ(i) / 4);
    const ceiling = new THREE.Mesh(cg, glassFaint);
    ceiling.renderOrder = 2;
    this.group.add(ramp, wall, ceilingRamp, ceiling);
  }

  _buildGoals(geometry) {
    const d = geometry.dims;
    for (const goal of geometry.goals) {
      const color = TEAM_COLORS[goal.team];
      const netMat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35, map: this.textures.net,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.7,
      });
      const net = new THREE.Mesh(toGeometry(geometry.visual[goal.team === 'blue' ? 'goalBlue' : 'goalOrange']), netMat);
      net.renderOrder = 1;
      const frameMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });
      const r = 0.11;
      for (const xs of [1, -1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.gh, 12), frameMat);
        post.position.set(xs * d.hg, d.gh / 2, goal.lineZ);
        this.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.gw, 12), frameMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, d.gh, goal.lineZ);
      this.group.add(net, bar);
    }
  }

  /** Glowing team-coloured strip where the ramps meet the walls. */
  _buildTrim(geometry) {
    const d = geometry.dims;
    const st = geometry.stations;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const push = (s, y) => {
      pos.push(s.x - s.nx * 0.03, y, s.z - s.nz * 0.03);
      c.copy(TEAM_COLORS.orange).lerp(TEAM_COLORS.blue, THREE.MathUtils.smoothstep(s.z, -12, 12));
      col.push(c.r, c.g, c.b);
    };
    for (let k = 0; k < st.length; k++) {
      const s0 = st[k], s1 = st[(k + 1) % st.length];
      if (s0.mouthAfter) continue;
      const base = pos.length / 3;
      push(s0, d.Rf); push(s1, d.Rf); push(s1, d.Rf + 0.22); push(s0, d.Rf + 0.22);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  _buildStadium(d) {
    const g = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b131d, roughness: 1 }));
    ground.position.y = -0.05;
    g.add(ground);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x18222f, roughness: 0.9 });
    const palette = {
      blue: [0x2b8cff, 0x5aa8ff, 0xdfe8f5, 0x1b4f99],
      orange: [0xff7a1a, 0xffa25a, 0xf2ead8, 0xa8460e],
      neutral: [0xd7dde6, 0x4a5568, 0x9aa5b1],
    };
    const sides = [
      { axis: 'x', sign: 1, half: d.b + 6, start: d.a + 5 },
      { axis: 'x', sign: -1, half: d.b + 6, start: d.a + 5 },
      { axis: 'z', sign: 1, half: d.a + 6, start: d.b + d.gd + 5 },
      { axis: 'z', sign: -1, half: d.a + 6, start: d.b + d.gd + 5 },
    ];
    const crowd = [];
    for (const s of sides) {
      for (let k = 0; k < 9; k++) {
        const depth = 2.4, h = 2 + k * 1.5, dist = s.start + k * depth, len = 2 * s.half + k * 3;
        const box = new THREE.Mesh(new THREE.BoxGeometry(s.axis === 'x' ? depth : len, h, s.axis === 'x' ? len : depth), standMat);
        if (s.axis === 'x') box.position.set(s.sign * (dist + depth / 2), h / 2, 0);
        else box.position.set(0, h / 2, s.sign * (dist + depth / 2));
        g.add(box);
        const n = Math.floor(len / 1.15);
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.12) continue;
          const along = -len / 2 + (i + 0.5) * (len / n) + (Math.random() - 0.5) * 0.3;
          const x = s.axis === 'x' ? s.sign * (dist + depth / 2) : along;
          const z = s.axis === 'x' ? along : s.sign * (dist + depth / 2);
          const pal = palette[z > 3 ? 'blue' : z < -3 ? 'orange' : 'neutral'];
          crowd.push([x, h + 0.42, z, pal[Math.floor(Math.random() * pal.length)]]);
        }
      }
    }
    const people = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, 0.45), new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowd.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    crowd.forEach(([x, y, z, c], i) => {
      m.makeTranslation(x, y, z);
      people.setMatrixAt(i, m);
      people.setColorAt(i, col.setHex(c));
    });
    people.instanceMatrix.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;
    g.add(people);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3442, roughness: 0.6, metalness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const x = sx * (d.a + 30), z = sz * (d.b + d.gd + 22);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 40, 10), poleMat);
        pole.position.set(x, 20, z);
        const head = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.8), lampMat);
        head.position.set(x, 41, z);
        head.lookAt(0, 0, 0);
        g.add(pole, head);
      }
    }
    this.group.add(g);
  }
}
