import * as THREE from 'three';
import { CONFIG } from '../config/index.js';
import { CarController } from '../physics/CarController.js';
import { DEFAULT_CAR, cleanCar } from './cars.js';
import { carModel } from './carModels.js';

/** Paint colour per team: every car model is painted in its team's colour. */
export const TEAM_PAINT = Object.freeze({ blue: 0x1f74e0, orange: 0xf0661a });

const WHEELS = CONFIG.physics.car.wheels;
/** Where the physics keeps a car at rest: its body origin height and wheel suspension. */
export const REST = Object.freeze({
  height: CarController.restHeight(CONFIG.physics),
  suspension: WHEELS.suspensionRestLength
    - ((1 + CONFIG.physics.car.sticky.base) * Math.abs(CONFIG.physics.world.gravity)) / WHEELS.suspensionStiffness,
});
// Models are centred between their axles; the physics wheelbase centre sits slightly back.
const MODEL_Z = (WHEELS.front.z + WHEELS.rear.z) / 2;
const MAX_DROP = 0.05; // m a wheel can visibly hang down / compress beyond rest

/**
 * One car on screen. Reads the CarController state each frame (interpolated
 * transform, wheel suspension/steer/spin, boost) and never writes back to physics.
 * Every model shares the same hitbox; only the look changes.
 */
export class CarView {
  constructor(car, parent, carId = DEFAULT_CAR) {
    this.car = car;
    this.group = new THREE.Group();
    this.group.name = `car-${car.id}`;
    this.paintMat = new THREE.MeshStandardMaterial({
      name: 'paint', color: TEAM_PAINT[car.team] ?? TEAM_PAINT.blue, metalness: 0.55, roughness: 0.28, vertexColors: true,
    });
    this.shell = new THREE.Group();
    this.shell.name = 'shell';
    this.shell.position.set(0, -REST.height, MODEL_Z);
    this.group.add(this.shell);
    this.wheelViews = [];

    const flameOuter = new THREE.ConeGeometry(0.1, 0.7, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.35);
    const flameInner = new THREE.ConeGeometry(0.055, 0.42, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.21);
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
    const model = carModel(next);
    if (model) this._buildFromModel(model);
    else this._buildPlaceholder();
    this.flame.position.copy(this.nozzleLocal).setZ(this.nozzleLocal.z - 0.04);
  }

  _paint(object) {
    object.traverse((o) => { if (o.isMesh && o.material.name === 'paint') o.material = this.paintMat; });
    return object;
  }

  _buildFromModel(model) {
    const body = this._paint(model.body.clone());
    this.shell.add(body);
    this.wheelViews = model.wheels.map((w) => {
      const steer = new THREE.Group();
      steer.position.copy(w.center);
      const spin = w.spin ? this._paint(w.spin.clone()) : new THREE.Group();
      spin.position.set(0, 0, 0);
      steer.add(spin);
      if (w.hub) { const hub = this._paint(w.hub.clone()); hub.position.set(0, 0, 0); steer.add(hub); }
      this.shell.add(steer);
      return { steer, spin, base: w.center.clone() };
    });
    // Boost comes out of the middle of the rear bumper.
    const b = model.box;
    this.nozzleLocal.set(0, b.min.y + (b.max.y - b.min.y) * 0.3 - REST.height, b.max.z + MODEL_Z + 0.02);
  }

  /** Used when a model file could not be loaded (and in Node tests): a plain box car. */
  _buildPlaceholder() {
    const trim = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 1.4).translate(0, 0.22, 0), this.paintMat);
    body.castShadow = true;
    this.shell.add(body);
    const tire = new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16).rotateZ(Math.PI / 2);
    this.wheelViews = this.car.wheels.map((w) => {
      const steer = new THREE.Group();
      steer.position.set(w.side * 0.26, 0.11, w.local.z - MODEL_Z);
      const spin = new THREE.Mesh(tire, trim);
      steer.add(spin);
      this.shell.add(steer);
      return { steer, spin, base: steer.position.clone() };
    });
    this.nozzleLocal.set(0, 0.12 - REST.height, 0.72 + MODEL_Z);
  }

  update(alpha) {
    const car = this.car;
    car.getRenderTransform(alpha, this.renderPos, this.renderQuat);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);
    for (let i = 0; i < this.wheelViews.length; i++) {
      const w = car.wheels[i], v = this.wheelViews[i];
      if (!w) continue;
      const drop = THREE.MathUtils.clamp(w.suspension - REST.suspension, -MAX_DROP, MAX_DROP);
      v.steer.position.set(v.base.x, v.base.y - drop, v.base.z);
      v.steer.rotation.y = -w.steer;
      v.spin.rotation.x = -w.spin;
    }
    const s = car.state;
    this.flame.visible = s.isBoosting;
    if (s.isBoosting) this.flame.scale.set(1, 1, (s.isSupersonic ? 1.45 : 1) * (0.8 + Math.random() * 0.4));
  }

  nozzleWorld(out) {
    return out.copy(this.nozzleLocal).applyQuaternion(this.renderQuat).add(this.renderPos);
  }
}
