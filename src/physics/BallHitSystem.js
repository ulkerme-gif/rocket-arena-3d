import { Vector3, Quaternion } from 'three';
import { clamp, evalCurve } from '../core/math.js';

const _rel = new Vector3();
const _dir = new Vector3();
const _q = new Quaternion();

/**
 * Car-ball touch detection + RL-style extra hit impulse.
 * Rapier resolves the actual contact (car/ball restitution is 0); on top of
 * that the ball receives an additional, consistent velocity change based on
 * the pre-collision relative speed and the hit direction. This is what makes
 * hits feel powerful yet predictable.
 */
export class BallHitSystem {
  constructor(physicsConfig, physicsWorld = null) {
    this.cfg = physicsConfig.ballHit;
    this.world = physicsWorld?.world ?? null;
    this.contacts = new Map();
    this.pending = [];
    this._preBall = new Vector3();
    this._prevPreBall = new Vector3();
    this._preCars = new Map();
    this._prevPreCars = new Map();
  }

  /** Record velocities right before world.step() (after controller impulses). */
  capturePreStep(cars, ball) {
    // Keep the previous tick too: the solver may resolve a fast contact one
    // tick before the bodies are measured as touching.
    this._prevPreBall.copy(this._preBall);
    const v = ball.body.linvel();
    this._preBall.set(v.x, v.y, v.z);
    for (const car of cars) {
      const cv = car.body.linvel();
      let pre = this._preCars.get(car.id);
      let prev = this._prevPreCars.get(car.id);
      if (!pre) this._preCars.set(car.id, (pre = new Vector3(cv.x, cv.y, cv.z)));
      if (!prev) this._prevPreCars.set(car.id, (prev = new Vector3()));
      prev.copy(pre);
      pre.set(cv.x, cv.y, cv.z);
    }
  }

  /** Distance-based OBB vs sphere test using post-step transforms. */
  isTouching(car, ball, margin = this.cfg.touchMargin) {
    const hb = car.cfg.hitbox;
    _rel.copy(ball.position).sub(car.position).applyQuaternion(_q.copy(car.quaternion).invert());
    const dx = _rel.x - clamp(_rel.x, -hb.halfWidth, hb.halfWidth);
    const dy = _rel.y - clamp(_rel.y, -hb.halfHeight, hb.halfHeight);
    const dz = _rel.z - clamp(_rel.z, -hb.halfLength, hb.halfLength);
    return Math.hypot(dx, dy, dz) <= ball.radius + margin;
  }

  /**
   * Call after world.step() and after cars/ball refreshed their state.
   * @returns {Array<{car, relativeSpeed:number, isNewTouch:boolean, addedSpeed:number}>}
   */
  update(cars, ball, time) {
    const touches = [];
    // Rapier's speculative contacts can stop the car exactly at the ball one
    // tick before the momentum exchange happens. Applying the extra impulse
    // one tick after detection guarantees it is added on top of the real
    // collision response instead of being absorbed by it.
    for (const p of this.pending) if (ball.enabled) this._applyExtraImpulse(p.car, ball, p.relSpeed);
    this.pending.length = 0;
    if (!ball.enabled) return touches;
    for (const car of cars) {
      let info = this.contacts.get(car.id);
      if (!info) this.contacts.set(car.id, (info = { touching: false, lastImpulseTime: -Infinity }));
      // A touch = Rapier really processed a car/ball contact this step (so the
      // extra impulse lands AFTER the physical collision), or resting contact.
      const touching = this._solverContact(car, ball) || this.isTouching(car, ball, 0.015);
      if (touching) {
        const isNew = !info.touching;
        if (isNew || time - info.lastImpulseTime >= this.cfg.repeatInterval) {
          const pre = this._preCars.get(car.id) ?? car.velocity;
          let rel = _rel.copy(this._preBall).sub(pre).length();
          if (isNew) {
            const prev = this._prevPreCars.get(car.id);
            if (prev) rel = Math.max(rel, _rel.copy(this._prevPreBall).sub(prev).length());
          }
          const relSpeed = Math.min(rel, this.cfg.maxRelativeSpeed);
          const added = relSpeed * evalCurve(this.cfg.strengthCurve, relSpeed);
          if (relSpeed > 1e-3) this.pending.push({ car, relSpeed });
          info.lastImpulseTime = time;
          touches.push({ car, relativeSpeed: relSpeed, isNewTouch: isNew, addedSpeed: added });
        }
      }
      info.touching = touching;
    }
    return touches;
  }

  _applyExtraImpulse(car, ball, relSpeed) {
    _dir.copy(ball.position).sub(car.com);
    _dir.y *= this.cfg.zScale;
    _dir.normalize();
    _dir.addScaledVector(car.forward, -_dir.dot(car.forward) * (1 - this.cfg.forwardScale)).normalize();
    ball.addVelocity(_dir.multiplyScalar(relSpeed * evalCurve(this.cfg.strengthCurve, relSpeed)));
  }

  _solverContact(car, ball) {
    if (!this.world || typeof this.world.contactPair !== 'function') return false;
    let found = false;
    this.world.contactPair(car.collider, ball.collider, (m) => {
      if (found) return;
      // Only real (non-speculative) contacts: the solver has already resolved them.
      for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) <= 0.015) { found = true; break; }
    });
    return found;
  }

  reset() {
    this.contacts.clear();
    this.pending.length = 0;
  }
}
