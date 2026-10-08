import { Vector3, Quaternion } from 'three';
import { GROUPS } from './collisionGroups.js';
import { clamp, lerp, evalCurve, moveTowards } from '../core/math.js';

/**
 * Standard control input consumed by a car (from keyboard, gamepad or a bot).
 *   throttle  -1..1   ground: forward/reverse; also boosts forward in air (tiny)
 *   steer     -1..1   ground steering, +1 = right; also used for side dodges
 *   pitch     -1..1   air pitch, +1 = nose down; also used for front/back dodges
 *   yaw       -1..1   air yaw, +1 = right
 *   roll      -1..1   air roll, +1 = roll right
 *   jump, boost, handbrake: booleans (held state)
 */
export const NEUTRAL_CONTROLS = Object.freeze({
  throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false,
});

const WORLD_UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const TWO_PI = Math.PI * 2;

/**
 * Car physics + controller. The car is a dynamic rigid body (cuboid hitbox)
 * driven only by impulses and torque impulses computed every physics tick:
 *  - 4 raycast wheels with spring/damper suspension
 *  - longitudinal drive / brake / coast from RL-like curves
 *  - lateral grip (with handbrake powerslide) and a yaw-rate steering model
 *  - "sticky" force that lets the car drive on walls
 *  - RL air control (pitch/yaw/roll torques + damping)
 *  - jump (with hold), double jump, directional dodges, flip cancel
 *  - boost, speed clamps and roof/side auto-flip recovery
 */
export class CarController {
  /**
   * @param {import('./PhysicsWorld.js').PhysicsWorld} physicsWorld
   * @param {object} o
   * @param {string} o.id
   * @param {'blue'|'orange'} o.team
   * @param {object} o.physicsConfig CONFIG.physics
   * @param {{x:number,z:number}} [o.spawn]
   * @param {number} [o.heading]
   */
  constructor(physicsWorld, { id, team, physicsConfig, spawn = { x: 0, z: 0 }, heading = 0 }) {
    this.id = id;
    this.team = team;
    this.physics = physicsWorld;
    this.cfg = physicsConfig.car;
    this.boostCfg = physicsConfig.boost;
    this.gravity = Math.abs(physicsWorld.gravity);
    this.mass = this.cfg.mass;
    this.unlimitedBoost = false;
    this.onEvent = null; // (type, payload) => void, set by the Simulation

    const R = physicsWorld.RAPIER;
    const c = this.cfg;
    const hb = c.hitbox;
    const w = hb.halfWidth * 2, h = hb.halfHeight * 2, l = hb.halfLength * 2;
    // Principal inertia of the hitbox (local axes: x=right, y=up, z=back).
    this.inertia = new Vector3((c.mass / 12) * (h * h + l * l), (c.mass / 12) * (w * w + l * l), (c.mass / 12) * (w * w + h * h));

    this.body = physicsWorld.world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true));
    const colDesc = R.ColliderDesc.cuboid(hb.halfWidth, hb.halfHeight, hb.halfLength)
      .setMassProperties(c.mass, c.centerOfMass, { x: this.inertia.x, y: this.inertia.y, z: this.inertia.z }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(c.friction)
      .setRestitution(c.restitution)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Min)
      .setCollisionGroups(GROUPS.car);
    this.collider = physicsWorld.world.createCollider(colDesc, this.body);
    this.comLocal = new Vector3(c.centerOfMass.x, c.centerOfMass.y, c.centerOfMass.z);

    const W = c.wheels;
    const mk = (p, front, side) => ({
      local: new Vector3(p.x * side, p.y, p.z),
      world: new Vector3(),
      front,
      side,
      contact: false,
      hitDistance: W.suspensionRestLength + W.radius,
      suspension: W.suspensionRestLength,
      normal: new Vector3(0, 1, 0),
      steer: 0,
      spin: 0,
      spinRate: 0,
    });
    // Order: front-left, front-right, rear-left, rear-right.
    this.wheels = [mk(W.front, true, -1), mk(W.front, true, 1), mk(W.rear, false, -1), mk(W.rear, false, 1)];

    this.position = new Vector3();
    this.quaternion = new Quaternion();
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.forward = new Vector3(0, 0, -1);
    this.up = new Vector3(0, 1, 0);
    this.right = new Vector3(1, 0, 0);
    this.com = new Vector3();
    this.prevPosition = new Vector3();
    this.prevQuaternion = new Quaternion();
    this.controls = { ...NEUTRAL_CONTROLS };
    this.state = this._freshState();
    this.boost = this.boostCfg.startAmount;
    this.reset(spawn, heading);
  }

  /** Height of the body origin above a flat floor when resting on its wheels. */
  static restHeight(physicsConfig) {
    const c = physicsConfig.car, W = c.wheels;
    const loaded = ((1 + c.sticky.base) * Math.abs(physicsConfig.world.gravity)) / W.suspensionStiffness;
    return W.radius + W.suspensionRestLength - loaded - W.front.y;
  }

  _freshState() {
    return {
      numWheelsContact: 0,
      onGround: false,
      groundNormal: new Vector3(0, 1, 0),
      forwardSpeed: 0,
      isSupersonic: false,
      handbrake: 0,
      isBoosting: false,
      boostActiveTimer: 0,
      prevJump: false,
      isJumping: false,
      jumpTime: 0,
      timeSinceJump: 10,
      hasJumped: false,
      hasDoubleJumped: false,
      hasFlipped: false,
      airTimeSinceJump: 0,
      isFlipping: false,
      flipTime: 0,
      flipFwd: 0,
      flipSide: 0,
      onRoofOrSide: false,
      bodySurfaceNormal: new Vector3(0, 1, 0),
      autoFlip: false,
      autoFlipTime: 0,
      autoFlipTarget: new Vector3(0, 1, 0),
    };
  }

  /** Copies and sanitizes a ControlState. Pass null for "no input". */
  setControls(ctrl) {
    const c = this.controls;
    if (!ctrl) {
      Object.assign(c, NEUTRAL_CONTROLS);
      return;
    }
    const n = (v) => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
    c.throttle = n(ctrl.throttle);
    c.steer = n(ctrl.steer);
    c.pitch = n(ctrl.pitch);
    c.yaw = n(ctrl.yaw);
    c.roll = n(ctrl.roll);
    c.jump = !!ctrl.jump;
    c.boost = !!ctrl.boost;
    c.handbrake = !!ctrl.handbrake;
  }

  /** Whether a jump press right now would start a double jump / dodge. */
  get hasFlipAvailable() {
    const s = this.state;
    return !s.onGround && !s.hasDoubleJumped && !s.hasFlipped && (!s.hasJumped || s.airTimeSinceJump < this.cfg.jump.doubleJumpWindow);
  }

  // ------------------------------------------------------------------ tick

  /** Applies all controller forces for this tick. Call before world.step(). */
  preStep(dt) {
    const s = this.state;
    const ctrl = this.controls;
    this._readBody();
    this._updateWheels();
    const n = s.numWheelsContact;
    const grounded = n >= this.cfg.wheels.groundedWheelCount;
    s.onGround = grounded;
    s.onRoofOrSide = n < 2 ? this._probeBodySurface() : false;

    this._applySuspension(dt);

    const S = this.cfg.steering;
    s.handbrake = ctrl.handbrake ? Math.min(1, s.handbrake + S.handbrakeRiseRate * dt) : Math.max(0, s.handbrake - S.handbrakeFallRate * dt);

    const boosting = this._updateBoost(dt);
    this._updateJumpAndDodge(dt, grounded);

    if (s.autoFlip) this._applyAutoFlip(dt);
    else if (n > 0) this._applyGroundDrive(dt, boosting);
    else this._applyAirControl(dt);

    if (boosting) {
      const accel = n > 0 ? this.boostCfg.groundAccel : this.boostCfg.airAccel;
      this._addVelocity(_c.copy(this.forward).multiplyScalar(accel * dt));
    } else if (n === 0 && ctrl.throttle !== 0) {
      this._addVelocity(_c.copy(this.forward).multiplyScalar(this.cfg.drive.airThrottleAccel * ctrl.throttle * dt));
    }

    this._applySticky(dt);
  }

  /** Clamps speeds and refreshes cached state. Call after world.step(). */
  postStep(dt) {
    const c = this.cfg;
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > c.maxSpeed) {
      const k = c.maxSpeed / speed;
      this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
    }
    const w = this.body.angvel();
    const ws = Math.hypot(w.x, w.y, w.z);
    if (ws > c.maxAngularSpeed) {
      const k = c.maxAngularSpeed / ws;
      this.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
    }
    this._readBody();
    const s = this.state;
    s.forwardSpeed = this.velocity.dot(this.forward);
    s.isSupersonic = this.velocity.length() >= c.supersonicSpeed;

    // Visual wheel spin (rad/s), kept here so views never touch physics.
    const r = c.wheels.radius;
    for (const wh of this.wheels) {
      wh.spinRate = wh.contact ? s.forwardSpeed / r : wh.spinRate * Math.max(0, 1 - 0.6 * dt) + this.controls.throttle * 30 * dt;
      wh.spin = (wh.spin + wh.spinRate * dt) % TWO_PI;
    }
  }

  // ------------------------------------------------------------ internals

  _readBody() {
    const b = this.body;
    const t = b.translation(), r = b.rotation(), v = b.linvel(), w = b.angvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
    this.angularVelocity.set(w.x, w.y, w.z);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.com.copy(this.comLocal).applyQuaternion(this.quaternion).add(this.position);
  }

  _emit(type, payload = {}) {
    if (this.onEvent) this.onEvent(type, { carId: this.id, team: this.team, ...payload });
  }

  /** Velocity change through a central impulse. */
  _addVelocity(dv) {
    const m = this.mass;
    this.body.applyImpulse({ x: dv.x * m, y: dv.y * m, z: dv.z * m }, true);
  }

  /** Angular velocity change through a torque impulse: tau = R I R^T dw. */
  _addAngularVelocity(dw) {
    const local = _d.copy(dw).applyQuaternion(_q.copy(this.quaternion).invert());
    local.x *= this.inertia.x;
    local.y *= this.inertia.y;
    local.z *= this.inertia.z;
    local.applyQuaternion(this.quaternion);
    this.body.applyTorqueImpulse({ x: local.x, y: local.y, z: local.z }, true);
  }

  _updateWheels() {
    const W = this.cfg.wheels;
    const maxLen = W.suspensionRestLength + W.radius;
    const down = _a.copy(this.up).negate();
    const avg = this.state.groundNormal.set(0, 0, 0);
    let count = 0;
    for (const w of this.wheels) {
      w.world.copy(w.local).applyQuaternion(this.quaternion).add(this.position);
      const hit = this.physics.castArenaRay(w.world, down, maxLen);
      if (hit) {
        w.contact = true;
        w.hitDistance = hit.distance;
        w.suspension = Math.max(0, hit.distance - W.radius);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        avg.add(w.normal);
        count++;
      } else {
        w.contact = false;
        w.hitDistance = maxLen;
        w.suspension = W.suspensionRestLength;
      }
    }
    if (count > 0) avg.normalize();
    else avg.copy(this.up);
    this.state.numWheelsContact = count;
  }

  _applySuspension(dt) {
    const W = this.cfg.wheels;
    const share = this.mass / 4;
    const maxLen = W.suspensionRestLength + W.radius;
    for (const w of this.wheels) {
      if (!w.contact) continue;
      const compression = maxLen - w.hitDistance;
      const r = _b.copy(w.world).sub(this.com);
      const pointVel = _c.crossVectors(this.angularVelocity, r).add(this.velocity);
      const compVel = -pointVel.dot(this.up);
      const damping = compVel > 0 ? W.dampingCompression : W.dampingRelaxation;
      const accel = clamp(W.suspensionStiffness * compression + damping * compVel, 0, W.maxSuspensionAccel);
      const j = share * accel * dt;
      this.body.applyImpulseAtPoint(
        { x: this.up.x * j, y: this.up.y * j, z: this.up.z * j },
        { x: w.world.x, y: w.world.y, z: w.world.z },
        true,
      );
    }
  }

  _updateBoost(dt) {
    const s = this.state;
    const B = this.boostCfg;
    s.boostActiveTimer = Math.max(0, s.boostActiveTimer - dt);
    let active = false;
    if (this.boost > 0 && (this.controls.boost || s.boostActiveTimer > 0)) {
      if (!s.isBoosting) s.boostActiveTimer = B.minActiveTime;
      active = true;
      if (!this.unlimitedBoost) this.boost = Math.max(0, this.boost - B.consumptionPerSecond * dt);
    }
    s.isBoosting = active;
    return active;
  }

  _updateJumpAndDodge(dt, grounded) {
    const s = this.state;
    const J = this.cfg.jump;
    const D = this.cfg.dodge;
    const ctrl = this.controls;
    const pressed = ctrl.jump && !s.prevJump;
    s.prevJump = ctrl.jump;
    s.timeSinceJump += dt;

    if (grounded && !s.isJumping && s.timeSinceJump > J.landingGuard) {
      s.hasJumped = false;
      s.hasDoubleJumped = false;
      s.hasFlipped = false;
      s.airTimeSinceJump = 0;
      s.isFlipping = false;
    }

    if (s.isJumping) {
      s.jumpTime += dt;
      if (s.jumpTime < J.minHoldTime || (ctrl.jump && s.jumpTime < J.maxHoldTime)) {
        this._addVelocity(_c.copy(this.up).multiplyScalar(J.holdAccel * dt));
      } else {
        s.isJumping = false;
      }
    } else if (s.hasJumped && !grounded) {
      s.airTimeSinceJump += dt;
    }

    if (s.isFlipping) {
      s.flipTime += dt;
      if (grounded && s.flipTime > 0.1) s.isFlipping = false;
      else {
        // RL: the dodge damps vertical velocity at its start, making flips flat.
        if (s.flipTime < D.zDampEnd && (this.velocity.y < 0 || s.flipTime < D.zDampStart)) {
          const f = Math.pow(1 - D.zDampPerTick120, dt * 120);
          this._addVelocity(_c.set(0, this.velocity.y * (f - 1), 0));
        }
        if (s.flipTime >= D.torqueTime) s.isFlipping = false;
      }
    }

    if (!pressed) return;

    if (grounded && !s.isJumping) {
      s.isJumping = true;
      s.jumpTime = 0;
      s.hasJumped = true;
      s.timeSinceJump = 0;
      s.airTimeSinceJump = 0;
      this._addVelocity(_c.copy(this.up).multiplyScalar(J.impulse));
      this._emit('jump');
      return;
    }

    if (s.onRoofOrSide && s.numWheelsContact < 2 && this.velocity.length() < this.cfg.recovery.maxSpeed) {
      this._startAutoFlip();
      return;
    }

    if (!grounded && !s.isJumping) {
      const canAir = !s.hasDoubleJumped && !s.hasFlipped && (!s.hasJumped || s.airTimeSinceJump < J.doubleJumpWindow);
      if (!canAir) return;
      const fwdIn = ctrl.pitch, sideIn = ctrl.steer;
      if (Math.abs(fwdIn) + Math.abs(sideIn) >= D.deadzone) {
        this._startDodge(fwdIn, sideIn);
      } else {
        s.hasDoubleJumped = true;
        this._addVelocity(_c.copy(this.up).multiplyScalar(J.doubleJumpImpulse));
        this._emit('doubleJump');
      }
    }
  }

  _startDodge(fwdIn, sideIn) {
    const s = this.state;
    const D = this.cfg.dodge;
    s.hasFlipped = true;
    s.isFlipping = true;
    s.flipTime = 0;
    const mag = Math.hypot(fwdIn, sideIn);
    let df = fwdIn / mag, ds = sideIn / mag;
    if (Math.abs(df) < 0.1) df = 0;
    if (Math.abs(ds) < 0.1) ds = 0;
    const m2 = Math.hypot(df, ds) || 1;
    s.flipFwd = df / m2;
    s.flipSide = ds / m2;

    // Horizontal frame from the car's yaw.
    const f2 = _a.set(this.forward.x, 0, this.forward.z);
    if (f2.lengthSq() < 1e-4) f2.set(this.velocity.x, 0, this.velocity.z);
    if (f2.lengthSq() < 1e-4) f2.set(-this.up.x, 0, -this.up.z);
    if (f2.lengthSq() < 1e-6) f2.set(0, 0, -1);
    f2.normalize();
    const r2 = _b.crossVectors(f2, WORLD_UP).normalize();
    const fwdSpeed = this.velocity.dot(f2);
    const ratio = Math.min(1, Math.abs(fwdSpeed) / this.cfg.maxSpeed);
    const backwards = Math.abs(fwdSpeed) < 1 ? df < 0 : df >= 0 !== fwdSpeed >= 0;
    let ix = df * D.impulse;
    let iy = ds * D.impulse;
    ix *= ((backwards ? D.backwardMaxSpeedScale : D.forwardMaxSpeedScale) - 1) * ratio + 1;
    iy *= (D.sideMaxSpeedScale - 1) * ratio + 1;
    if (backwards) ix *= D.backwardScale;
    this._addVelocity(_c.copy(f2).multiplyScalar(ix).addScaledVector(r2, iy));
    this._emit('dodge', { forward: s.flipFwd, side: s.flipSide });
  }

  _applyGroundDrive(dt, boosting) {
    const s = this.state;
    const c = this.cfg;
    const ctrl = this.controls;
    const g = s.numWheelsContact / 4;
    const N = s.groundNormal;

    const fwdG = _a.copy(this.forward).addScaledVector(N, -this.forward.dot(N));
    if (fwdG.lengthSq() < 1e-6) return;
    fwdG.normalize();
    const rightG = _b.crossVectors(fwdG, N).normalize();
    const vF = this.velocity.dot(fwdG);
    const vR = this.velocity.dot(rightG);
    const absVF = Math.abs(vF);
    s.forwardSpeed = vF;

    // Longitudinal: throttle / brake / coast.
    const D = c.drive;
    const throttle = boosting ? 1 : ctrl.throttle;
    let dv = 0;
    if (throttle !== 0) {
      if (absVF > D.stopSpeed && Math.sign(throttle) !== Math.sign(vF)) {
        dv = -Math.sign(vF) * Math.min(D.brakeAccel * Math.abs(throttle) * dt * g, absVF);
      } else {
        dv = throttle * evalCurve(D.throttleAccelCurve, absVF) * dt * g;
      }
    } else if (absVF > 0) {
      dv = -Math.sign(vF) * Math.min((absVF < D.stopSpeed ? absVF / dt : D.coastDecel) * dt * g, absVF);
    }
    if (dv !== 0) this._addVelocity(_c.copy(fwdG).multiplyScalar(dv));

    // Lateral grip (reduced while powersliding).
    const S = c.steering;
    const slip = Math.abs(vR) / Math.max(absVF + Math.abs(vR), 0.5);
    const grip = evalCurve(S.lateralFrictionCurve, slip) * lerp(1, S.handbrakeGripMultiplier, s.handbrake);
    const dvR = -vR * Math.min(1, S.lateralGrip * grip * dt) * g;
    this._addVelocity(_c.copy(rightG).multiplyScalar(dvR));

    // Steering: track the yaw rate of a bicycle model with a speed-dependent angle.
    const angN = evalCurve(S.steerAngleCurve, absVF);
    const angP = evalCurve(S.powerslideSteerAngleCurve, absVF);
    const steerAngle = ctrl.steer * lerp(angN, angP, s.handbrake);
    const targetYaw = (-vF * Math.tan(steerAngle)) / S.wheelBase;
    const curYaw = this.angularVelocity.dot(N);
    const dYaw = (targetYaw - curYaw) * Math.min(1, S.yawResponse * dt) * g;
    const dw = _d.copy(N).multiplyScalar(dYaw);
    if (S.groundTiltDamping > 0) {
      const tilt = _c.copy(this.angularVelocity).addScaledVector(N, -curYaw);
      dw.addScaledVector(tilt, -Math.min(1, S.groundTiltDamping * dt) * g);
    }
    this._addAngularVelocity(dw.clone());

    for (const w of this.wheels) w.steer = w.front ? steerAngle : 0;
  }

  _applyAirControl(dt) {
    const s = this.state;
    const A = this.cfg.air;
    const D = this.cfg.dodge;
    const ctrl = this.controls;
    let wR = this.angularVelocity.dot(this.right);
    let wU = this.angularVelocity.dot(this.up);
    let wF = this.angularVelocity.dot(this.forward);
    const p = ctrl.pitch, y = ctrl.yaw, r = ctrl.roll;

    if (s.isFlipping && s.flipTime < D.torqueTime) {
      let tR = -s.flipFwd * D.angularSpeed;
      const tF = s.flipSide * D.angularSpeed;
      if (D.cancelEnabled && s.flipFwd !== 0 && Math.sign(p) === -Math.sign(s.flipFwd)) tR *= 1 - Math.abs(p);
      wR = moveTowards(wR, tR, D.angularAccel * dt);
      wF = moveTowards(wF, tF, D.angularAccel * dt);
    } else {
      wR += (-A.torque.pitch * p - A.damping.pitch * (1 - Math.abs(p)) * wR) * dt;
      wF += (A.torque.roll * r - A.damping.roll * wF) * dt;
    }
    wU += (-A.torque.yaw * y - A.damping.yaw * (1 - Math.abs(y)) * wU) * dt;

    const target = _c.copy(this.right).multiplyScalar(wR).addScaledVector(this.up, wU).addScaledVector(this.forward, wF);
    if (target.length() > this.cfg.maxAngularSpeed) target.setLength(this.cfg.maxAngularSpeed);
    this._addAngularVelocity(_b.copy(target).sub(this.angularVelocity));
    for (const w of this.wheels) w.steer = w.front ? ctrl.steer * 0.3 : 0;
  }

  _applySticky(dt) {
    const s = this.state;
    const St = this.cfg.sticky;
    if (s.numWheelsContact < St.minWheels || s.isJumping || s.autoFlip) return;
    const N = s.groundNormal;
    const driving = this.controls.throttle !== 0 || Math.abs(s.forwardSpeed) > this.cfg.drive.stopSpeed;
    const scale = St.base + (driving ? St.wallExtra * (1 - Math.abs(N.y)) : 0);
    const g = s.numWheelsContact / 4;
    this._addVelocity(_c.copy(N).multiplyScalar(-scale * this.gravity * dt * g));
  }

  _probeBodySurface() {
    const hb = this.cfg.hitbox;
    const m = this.cfg.recovery.probeMargin;
    const probes = [
      [this.up, hb.halfHeight + m],
      [this.right, hb.halfWidth + m],
      [_b.copy(this.right).negate(), hb.halfWidth + m],
    ];
    for (const [dir, len] of probes) {
      const hit = this.physics.castArenaRay(this.position, dir, len);
      if (hit) {
        this.state.bodySurfaceNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        return true;
      }
    }
    return false;
  }

  _startAutoFlip() {
    const s = this.state;
    s.autoFlip = true;
    s.autoFlipTime = 0;
    s.autoFlipTarget.copy(s.bodySurfaceNormal);
    this._addVelocity(_c.copy(s.bodySurfaceNormal).multiplyScalar(this.cfg.recovery.impulse));
    this._emit('recover');
  }

  _applyAutoFlip(dt) {
    const s = this.state;
    const Rc = this.cfg.recovery;
    s.autoFlipTime += dt;
    const target = s.autoFlipTarget;
    const angle = Math.acos(clamp(this.up.dot(target), -1, 1));
    if (angle < 0.12 || s.autoFlipTime > Rc.maxTime) {
      s.autoFlip = false;
      return;
    }
    const axis = _a.crossVectors(this.up, target);
    if (axis.lengthSq() < 1e-6) axis.copy(this.forward);
    axis.normalize().multiplyScalar(Math.min(this.cfg.maxAngularSpeed, angle * Rc.angularGain));
    this._addAngularVelocity(axis.sub(this.angularVelocity));
  }

  // ------------------------------------------------------------ utilities

  addBoost(amount) {
    this.boost = Math.min(this.boostCfg.max, this.boost + amount);
  }

  /** Respawn (kickoff, training reset). Never used for driving. */
  reset(spawn, heading = 0, boost = this.boostCfg.startAmount) {
    const y = spawn.y ?? CarController.restHeight({ car: this.cfg, world: { gravity: -this.gravity } });
    this.body.setTranslation({ x: spawn.x, y, z: spawn.z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.state = this._freshState();
    this.boost = boost;
    for (const w of this.wheels) {
      w.spin = 0;
      w.spinRate = 0;
      w.steer = 0;
    }
    this._readBody();
    this.snapInterpolation();
  }

  capturePrevious() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  snapInterpolation() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  getRenderTransform(alpha, outPos, outQuat) {
    outPos.lerpVectors(this.prevPosition, this.position, alpha);
    outQuat.slerpQuaternions(this.prevQuaternion, this.quaternion, alpha);
  }
}
