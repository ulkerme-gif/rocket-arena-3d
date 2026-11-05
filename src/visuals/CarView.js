import * as THREE from 'three';
import { CONFIG } from '../config/index.js';
import { carShape, restSuspension, shapeRestHeight } from '../game/carPhysics.js';
import { DEFAULT_CAR, cleanCar } from './cars.js';
import { carModel } from './carModels.js';

/** Team colours: the glow under every car (the cars keep their own paint). */
export const TEAM_GLOW = Object.freeze({ blue: 0x2a8cff, orange: 0xff7a1f });

const REST_SUSPENSION = restSuspension(CONFIG.physics);
const MAX_DROP = 0.05; // m a wheel can visibly hang down / compress beyond rest

/** Height of a car's body origin above the ground when it stands still. */
export const restHeightOf = (carId) => shapeRestHeight(carShape(cleanCar(carId)));

// Soft rounded glow, generated once (no canvas needed, so it also works in Node).
let glowTexture = null;
function glow() {
  if (glowTexture) return glowTexture;
  const w = 64, h = 64, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = Math.max(0, Math.abs((x + 0.5) / w * 2 - 1) - 0.55) / 0.45;
    const dy = Math.max(0, Math.abs((y + 0.5) / h * 2 - 1) - 0.55) / 0.45;
    const a = Math.max(0, 1 - Math.hypot(dx, dy)) ** 1.6;
    data.set([255, 255, 255, Math.round(a * 255)], (y * w + x) * 4);
  }
  glowTexture = new THREE.DataTexture(data, w, h);
  glowTexture.needsUpdate = true;
  glowTexture.userData.shared = true;
  return glowTexture;
}

/**
 * One car on screen. Reads the CarController state each frame (interpolated
 * transform, wheel suspension/steer/spin, boost) and never writes back to physics.
 * The model is placed in the same frame as the physics hitbox (carCatalog.js shape),
 * so what you see is what the ball hits.
 */
export class CarView {
  constructor(car, parent, carId = DEFAULT_CAR) {
    this.car = car;
    this.group = new THREE.Group();
    this.group.name = `car-${car.id}`;
    this.shell = new THREE.Group();
    this.shell.name = 'shell';
    this.group.add(this.shell);
    this.wheelViews = [];

    this.glowMat = new THREE.MeshBasicMaterial({
      color: TEAM_GLOW[car.team] ?? TEAM_GLOW.blue, map: glow(), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.glowMat);
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    const flameOuter = new THREE.ConeGeometry(0.11, 0.75, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.375);
    const flameInner = new THREE.ConeGeometry(0.06, 0.45, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.225);
    const flameMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flame = new THREE.Group();
    this.flame.add(new THREE.Mesh(flameOuter, flameMat(0xff8a2a, 0.85)), new THREE.Mesh(flameInner, flameMat(0xfff1b0, 0.95)));
    this.flame.visible = false;
    this.group.add(this.flame);

    this.nozzleLocal = new THREE.Vector3();
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this.carId = null;
    this.setCar(carId);
    parent.add(this.group);
  }

  /** Swaps the car model (see cars.js). Unknown ids fall back to the default car. */
  setCar(id) {
    const next = cleanCar(id);
    if (next === this.carId) return;
    this.carId = next;
    for (const child of [...this.shell.children]) {
      this.shell.remove(child);
      child.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
    const shape = carShape(next);
    const yc = shapeRestHeight(shape);
    this.shell.position.set(0, -yc, 0); // model ground (y = 0) -> under the body origin
    const model = carModel(next);
    if (model) this._buildFromModel(model);
    else this._buildPlaceholder(shape);
    const hb = shape.hitbox;
    this.glow.scale.set(hb.halfWidth * 2 + 0.55, 1, hb.halfLength * 2 + 0.6);
    this.glow.position.set(0, -yc + 0.015, 0);
    this.nozzleLocal.set(0, hb.bottom + (hb.top - hb.bottom) * 0.3 - yc, hb.halfLength + 0.03);
    this.flame.position.copy(this.nozzleLocal).setZ(this.nozzleLocal.z - 0.04);
  }

  _buildFromModel(model) {
    this.shell.add(model.body.clone());
    this.wheelViews = model.wheels.map((w) => {
      const steer = new THREE.Group();
      steer.position.copy(w.center);
      const spin = new THREE.Group(); // turns around the axle
      for (const mesh of w.part.children) spin.add(mesh.clone());
      steer.add(spin);
      this.shell.add(steer);
      return { steer, spin, base: w.center.clone() };
    });
  }

  /** Used when cars.glb could not be loaded (and in Node tests): a box the size of the hitbox. */
  _buildPlaceholder(shape) {
    const hb = shape.hitbox;
    const paint = new THREE.MeshStandardMaterial({ color: 0x8a96a3, roughness: 0.5 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(hb.halfWidth * 2, hb.top - hb.bottom, hb.halfLength * 2)
      .translate(0, (hb.top + hb.bottom) / 2, 0), paint);
    body.castShadow = true;
    this.shell.add(body);
    const r = shape.wheelRadius;
    const tire = new THREE.CylinderGeometry(r, r, 0.12, 16).rotateZ(Math.PI / 2);
    this.wheelViews = [shape.front, shape.front, shape.rear, shape.rear].map((p, i) => {
      const steer = new THREE.Group();
      steer.position.set(i % 2 ? p.x : -p.x, r, p.z);
      const spin = new THREE.Mesh(tire, trim);
      steer.add(spin);
      this.shell.add(steer);
      return { steer, spin, base: steer.position.clone() };
    });
  }

  update(alpha) {
    const car = this.car;
    car.getRenderTransform(alpha, this.renderPos, this.renderQuat);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
    for (let i = 0; i < this.wheelViews.length; i++) {
      const w = car.wheels[i], v = this.wheelViews[i];
      if (!w) continue;
      const drop = THREE.MathUtils.clamp(w.suspension - REST_SUSPENSION, -MAX_DROP, MAX_DROP);
      v.steer.position.set(v.base.x, v.base.y - drop, v.base.z);
      v.steer.rotation.y = -w.steer;
      v.spin.rotation.x = -w.spin;
    }
    const s = car.state;
    this.flame.visible = s.isBoosting;
    if (s.isBoosting) this.flame.scale.set(1, 1, (s.isSupersonic ? 1.45 : 1) * (0.8 + Math.random() * 0.4));
    this.glowMat.opacity = s.onGround ? 0.9 : 0.55;
  }

  nozzleWorld(out) {
    return out.copy(this.nozzleLocal).applyQuaternion(this.renderQuat).add(this.renderPos);
  }
}
