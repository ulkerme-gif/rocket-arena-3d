import * as THREE from 'three';
import { ATLAS_SIZE, bodyUVGenerator, cleanSkin, drawSkinAtlas, isDefaultSkin } from './skins.js';

const PALETTE = {
  blue: { body: 0x1f74e0, accent: 0x8fd0ff, trim: 0x0d2a52 },
  orange: { body: 0xf0661a, accent: 0xffc68f, trim: 0x5a2208 },
};

function profile(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Extrudes a side profile (x = towards the nose, y = up) across the car width. */
function extrudeProfile(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2); // nose -> -Z (car forward), width -> X
  return g;
}

const BODY_PROFILE = [[-0.6, -0.12], [-0.62, 0.05], [-0.5, 0.1], [0.18, 0.085], [0.56, 0], [0.64, -0.05], [0.6, -0.12]];
const BODY_WIDTH = 0.76;
const BODY_BEVEL = 0.03;

/** Body with UVs laid out for skins (sides, roof). Same shape as before. */
function bodyGeometry() {
  const xs = BODY_PROFILE.map((p) => p[0]);
  const ys = BODY_PROFILE.map((p) => p[1]);
  const m = BODY_BEVEL * 1.6; // bevel corners poke out a little further than the bevel size
  const bounds = {
    minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m,
    minY: Math.min(...ys) - m, maxY: Math.max(...ys) + m,
    minZ: -BODY_BEVEL, maxZ: BODY_WIDTH + BODY_BEVEL,
  };
  const g = new THREE.ExtrudeGeometry(profile(BODY_PROFILE), {
    depth: BODY_WIDTH, bevelEnabled: true, bevelThickness: BODY_BEVEL, bevelSize: BODY_BEVEL, bevelSegments: 2,
    steps: 1, curveSegments: 4, UVGenerator: bodyUVGenerator(bounds),
  });
  g.translate(0, 0, -BODY_WIDTH / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/**
 * Original low-poly "Rocket Arena" car. Reads the CarController state each
 * frame (interpolated transform, wheel suspension/steer/spin, boost) and
 * never writes back to physics.
 */
export class CarView {
  constructor(car, parent) {
    this.car = car;
    const pal = PALETTE[car.team] ?? PALETTE.blue;
    this.pal = pal;
    this.skinKey = '';
    this.skinTexture = null;
    this.group = new THREE.Group();
    this.group.name = `car-${car.id}`;
    const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.45, roughness: 0.32 });
    this.bodyMat = bodyMat;
    const trimMat = new THREE.MeshStandardMaterial({ color: pal.trim, metalness: 0.5, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1622, metalness: 0.9, roughness: 0.15 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x6cc9e8, metalness: 0.65, roughness: 0.18, emissive: 0x12303d, emissiveIntensity: 0.35 });
    this.accentMat = new THREE.MeshStandardMaterial({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.2 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2a3a, emissiveIntensity: 1.6 });
    const fenderMat = new THREE.MeshStandardMaterial({ color: pal.body, metalness: 0.55, roughness: 0.28 });

    const body = new THREE.Mesh(bodyGeometry(), bodyMat);
    const cabin = new THREE.Mesh(extrudeProfile(profile([[-0.34, 0.08], [-0.18, 0.25], [0.1, 0.26], [0.32, 0.075]]), 0.56, 0.02), glassMat);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    const windshield = box(0.42, 0.012, 0.22, windowMat, 0, 0.17, -0.255);
    windshield.rotation.x = -0.62;
    const rearGlass = box(0.38, 0.012, 0.16, windowMat, 0, 0.17, 0.205);
    rearGlass.rotation.x = 0.62;
    const fenderGeo = new THREE.TorusGeometry(0.16, 0.025, 6, 20, Math.PI);
    fenderGeo.rotateY(Math.PI / 2);
    const fenders = [];
    for (const z of [-0.38, 0.4]) for (const side of [-1, 1]) {
      const fender = new THREE.Mesh(fenderGeo, fenderMat);
      fender.position.set(side * 0.39, -0.085, z);
      fenders.push(fender);
    }
    this.group.add(body, cabin,
      windshield, rearGlass, ...fenders,
      box(0.86, 0.035, 0.16, trimMat, 0, 0.24, 0.52),
      box(0.035, 0.13, 0.06, trimMat, 0.28, 0.16, 0.52),
      box(0.035, 0.13, 0.06, trimMat, -0.28, 0.16, 0.52),
      box(0.72, 0.07, 0.075, trimMat, 0, -0.09, -0.6),
      box(0.72, 0.045, 0.08, trimMat, 0, -0.105, 0.61),
      box(0.055, 0.055, 0.72, trimMat, 0.385, -0.105, 0),
      box(0.055, 0.055, 0.72, trimMat, -0.385, -0.105, 0),
      box(0.04, 0.03, 0.92, this.accentMat, 0.405, -0.03, 0),
      box(0.04, 0.03, 0.92, this.accentMat, -0.405, -0.03, 0),
      box(0.16, 0.035, 0.02, lightMat, 0.24, -0.02, -0.66),
      box(0.16, 0.035, 0.02, lightMat, -0.24, -0.02, -0.66),
      box(0.2, 0.035, 0.02, tailMat, 0.27, 0.03, 0.645),
      box(0.2, 0.035, 0.02, tailMat, -0.27, 0.03, 0.645));
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 14).rotateX(Math.PI / 2), trimMat);
    nozzle.position.set(0, -0.03, 0.64);
    this.group.add(nozzle);
    body.castShadow = true;
    cabin.castShadow = true;

    const tireGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.125, 6).rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.8, roughness: 0.3 });
    const spokeGeo = new THREE.BoxGeometry(0.022, 0.095, 0.018);
    this.wheels = car.wheels.map(() => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      tire.castShadow = true;
      spin.add(tire, rim, new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.135, 12).rotateZ(Math.PI / 2), trimMat));
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.position.set(side * 0.067, 0.045, 0);
        spoke.rotation.x = (i * Math.PI) / 3;
        spin.add(spoke);
      }
      steer.add(spin);
      this.group.add(steer);
      return { steer, spin };
    });

    const flameOuter = new THREE.ConeGeometry(0.11, 0.75, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.375);
    const flameInner = new THREE.ConeGeometry(0.06, 0.45, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.225);
    const flameMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flame = new THREE.Group();
    this.flame.add(new THREE.Mesh(flameOuter, flameMat(0xff8a2a, 0.85)), new THREE.Mesh(flameInner, flameMat(0xfff1b0, 0.95)));
    this.flame.position.set(0, -0.03, 0.68);
    this.flame.visible = false;
    this.group.add(this.flame);

    this.nozzleLocal = new THREE.Vector3(0, -0.03, 0.72);
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    parent.add(this.group);
  }

  update(alpha) {
    const car = this.car;
    car.getRenderTransform(alpha, this.renderPos, this.renderQuat);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i], n = this.wheels[i];
      n.steer.position.set(w.local.x + w.side * 0.02, w.local.y - w.suspension, w.local.z);
      n.steer.rotation.y = -w.steer;
      n.spin.rotation.x = -w.spin;
    }
    const s = car.state;
    this.flame.visible = s.isBoosting;
    if (s.isBoosting) this.flame.scale.set(1, 1, (s.isSupersonic ? 1.45 : 1) * (0.8 + Math.random() * 0.4));
    this.accentMat.emissiveIntensity = s.isSupersonic ? 2.4 : 1.2;
  }

  /**
   * Applies a player's skin (null = plain team colour). The glowing side strips,
   * spoiler and name tag keep the team colour, so teams stay recognisable.
   */
  setSkin(skin) {
    const clean = skin ? cleanSkin(skin) : null;
    const key = clean && !isDefaultSkin(clean) ? JSON.stringify(clean) : '';
    if (key === this.skinKey) return;
    this.skinKey = key;
    this.skinTexture?.dispose();
    this.skinTexture = null;
    this.bodyMat.map = null;
    this.bodyMat.color.set(this.pal.body);
    if (key) {
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      let ctx = null;
      if (canvas) { canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE; }
      try { ctx = canvas?.getContext?.('2d') ?? null; } catch { ctx = null; }
      if (ctx) {
        drawSkinAtlas(ctx, clean, this.car.team);
        this.skinTexture = new THREE.CanvasTexture(canvas);
        this.skinTexture.colorSpace = THREE.SRGBColorSpace;
        this.skinTexture.anisotropy = 4;
        this.bodyMat.map = this.skinTexture;
        this.bodyMat.color.set(0xffffff);
      } else if (clean.base !== 'team') {
        this.bodyMat.color.set(clean.base); // no 2D canvas available: at least the colour
      }
    }
    this.bodyMat.needsUpdate = true;
  }

  nozzleWorld(out) {
    return out.copy(this.nozzleLocal).applyQuaternion(this.renderQuat).add(this.renderPos);
  }
}
