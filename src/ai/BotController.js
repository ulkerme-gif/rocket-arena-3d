import { Vector3, Quaternion } from 'three';
import { clamp } from '../core/math.js';
import { predictBall } from './ballPrediction.js';
import { NEUTRAL_CONTROLS } from '../physics/CarController.js';

const V = (o) => new Vector3(o.x, o.y, o.z);
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Rule-based opponent. It reads only the plain GameState snapshot and
 * returns a ControlState — exactly what a human produces with a keyboard.
 * It never moves physics bodies. Swap it out via src/ai/index.js.
 *
 * Behaviour: kickoff (boost + front dodge), intercept via ball prediction,
 * approach from behind the ball towards the opponent goal, rotate back when
 * on the wrong side, jump/dodge shots, air recovery, roof recovery, unstuck.
 */
export class BotController {
  constructor({ carId, team, config, difficulty, random = Math.random }) {
    this.carId = carId;
    this.team = team;
    this.cfg = config;
    this.random = random;
    this.setDifficulty(difficulty ?? config.difficulty);
    this.reset();
  }

  setDifficulty(name) {
    this.difficulty = this.cfg.presets[name] ? name : 'normal';
    this.preset = this.cfg.presets[this.difficulty];
  }

  reset() {
    this.maneuver = null;
    this.plan = null;
    this.decisionTimer = 0;
    this.stuckTime = 0;
    this.pinnedTime = 0;
    this.recoverCooldown = 0;
    this.noise = new Vector3();
    this.debug = { mode: 'idle' };
  }

  /** @returns {object} ControlState */
  update(state, dt) {
    const ctrl = { ...NEUTRAL_CONTROLS };
    const me = state.cars.find((c) => c.id === this.carId);
    if (!me || state.phase === 'countdown' || state.phase === 'ended' || state.phase === 'idle' || !state.ball.enabled) {
      this.maneuver = null;
      this.plan = null;
      return ctrl;
    }
    const ctx = this._context(state, me);
    this.recoverCooldown = Math.max(0, this.recoverCooldown - dt);

    if (this.maneuver) {
      if (this._runManeuver(ctx, ctrl, dt)) return ctrl;
      this.maneuver = null;
      Object.assign(ctrl, NEUTRAL_CONTROLS);
    }
    if (me.onRoofOrSide && me.numWheelsContact < 2 && this.recoverCooldown <= 0) {
      this.recoverCooldown = 1.2;
      this.maneuver = { type: 'recover', t: 0 };
      this._runManeuver(ctx, ctrl, dt);
      return ctrl;
    }
    if (me.numWheelsContact === 0) {
      this._airRecovery(ctx, ctrl);
      // Pinned without wheel contact (e.g. leaning on the ball): pop free with a jump.
      if (ctx.speed < 3 && me.position.y < 2.5) this.pinnedTime += dt;
      else this.pinnedTime = 0;
      if (this.pinnedTime > 0.8) {
        this.pinnedTime = 0;
        this.maneuver = { type: 'recover', t: 0 };
      }
      return ctrl;
    }
    this.pinnedTime = 0;

    this.decisionTimer -= dt;
    if (!this.plan || this.decisionTimer <= 0 || (this.plan.kickoff && !state.isKickoff)) {
      this.plan = this._decide(ctx, state);
      this.decisionTimer = this.preset.decisionInterval;
    }
    this._driveTo(ctx, ctrl, this.plan);
    if (me.onGround && !ctx.onWall) this._considerShots(ctx);

    if (me.onGround && Math.abs(ctrl.throttle) > 0.5 && ctx.speed < 3 && !this.maneuver) this.stuckTime += dt;
    else this.stuckTime = 0;
    if (this.stuckTime > this.cfg.stuckTime) {
      this.stuckTime = 0;
      this.maneuver = { type: 'reverse', t: 0, steer: ctrl.steer >= 0 ? -1 : 1 };
    }
    return ctrl;
  }

  _context(state, me) {
    const pos = V(me.position);
    const qInv = new Quaternion(me.quaternion.x, me.quaternion.y, me.quaternion.z, me.quaternion.w).invert();
    const ownSign = this.team === 'blue' ? 1 : -1;
    const vel = V(me.velocity);
    const fwd = V(me.forward);
    return {
      me,
      pos,
      vel,
      fwd,
      up: V(me.up),
      right: V(me.right),
      qInv,
      speed: vel.length(),
      fwdSpeed: vel.dot(fwd),
      bpos: V(state.ball.position),
      bvel: V(state.ball.velocity),
      ownSign,
      A: state.arena,
      onWall: me.up.y < 0.7,
      toLocal: (p) => new Vector3(p.x - pos.x, p.y - pos.y, p.z - pos.z).applyQuaternion(qInv),
    };
  }

  _reach(ctx, t) {
    const boosting = this.preset.useBoost && ctx.me.boost > 5;
    const a = boosting ? 18 : 9;
    const vmax = boosting ? 23 : 14;
    const v0 = Math.max(0, ctx.fwdSpeed);
    const tAcc = Math.max(0, (vmax - v0) / a);
    if (t <= tAcc) return v0 * t + 0.5 * a * t * t;
    return v0 * tAcc + 0.5 * a * tAcc * tAcc + vmax * (t - tAcc);
  }

  _decide(ctx, state) {
    const { pos, bpos, ownSign, A } = ctx;
    const b = A.halfLength;
    if (state.isKickoff) {
      // Aim slightly behind the ball on the line to the opponent goal (off-centre hit).
      const dir = new Vector3(0, 0, -ownSign * b).sub(bpos).setY(0).normalize();
      return { mode: 'kickoff', target: new Vector3(bpos.x, 0, bpos.z).addScaledVector(dir, -0.9), boost: true, kickoff: true };
    }

    const pred = predictBall(state.ball, A, state.gravity, this.cfg.predictionHorizon, 1 / 30);
    let ip = null;
    for (const s of pred) {
      if (s.p.y > 2.5) continue;
      if (this._reach(ctx, s.t) >= Math.hypot(s.p.x - pos.x, s.p.z - pos.z) - 2) {
        ip = s.p;
        break;
      }
    }
    if (!ip && state.ball.position.y > 2.5) {
      // High ball we cannot reach in time: wait between its landing spot and our goal.
      const landing = pred.find((s) => s.p.y < 2.5) ?? pred[pred.length - 1];
      const t = new Vector3(landing.p.x, 0, landing.p.z).lerp(new Vector3(0, 0, ownSign * b), 0.35);
      t.x = clamp(t.x, -A.halfWidth + 6, A.halfWidth - 6);
      t.z = clamp(t.z, -b + 6, b - 6);
      return { mode: 'shadow', target: t, boost: false, arrive: true };
    }
    ip ??= pred[pred.length - 1].p;
    const ballP = new Vector3(ip.x, 0, ip.z);
    if (this.preset.aimNoise > 0) this.noise.set(this.random() - 0.5, 0, this.random() - 0.5).multiplyScalar(this.preset.aimNoise * 6);
    else this.noise.set(0, 0, 0);

    // Wrong side of the ball? Rotate back past it towards our own goal.
    if ((pos.z - ballP.z) * ownSign < -1.5) {
      let sideX = Math.sign(pos.x - ballP.x) || 1;
      if (Math.abs(ballP.x + sideX * 5) > A.halfWidth - 6) sideX = -sideX; // no room: pass on the other side
      const target = new Vector3(
        clamp(ballP.x + sideX * 5, -A.halfWidth + 5, A.halfWidth - 5),
        0,
        clamp(ballP.z + ownSign * 9, -b + 5, b - 5),
      );
      return { mode: 'rotate', target, boost: true };
    }
    // Approach from behind the ball, lined up with the opponent goal.
    const aim = new Vector3(clamp(ballP.x * 0.25, -A.goalHalfWidth * 0.5, A.goalHalfWidth * 0.5), 0, -ownSign * (b + 3));
    const shotDir = aim.clone().sub(ballP).normalize();
    const dist = Math.hypot(ballP.x - pos.x, ballP.z - pos.z);
    const target = ballP.clone().addScaledVector(shotDir, -clamp(dist * 0.35, 0.6, 6)).add(this.noise);
    target.x = clamp(target.x, -A.halfWidth + 1.5, A.halfWidth - 1.5);
    target.z = clamp(target.z, -b + 1.5, b - 1.5);
    return { mode: 'attack', target, boost: true, shotDir };
  }

  _driveTo(ctx, ctrl, plan) {
    const cfg = this.cfg;
    const local = ctx.toLocal(plan.target);
    const angle = Math.atan2(local.x, -local.z);
    const dist = Math.hypot(local.x, local.z);
    ctrl.steer = clamp(angle * cfg.steerGain, -1, 1);
    ctrl.throttle = this.preset.maxThrottle;
    if (Math.abs(angle) > cfg.reverseAngle && dist < 6 && ctx.fwdSpeed < 3) {
      ctrl.throttle = -1;
      ctrl.steer = Math.sign(angle) || 1;
    }
    ctrl.handbrake = Math.abs(angle) > cfg.handbrakeAngle && ctx.fwdSpeed > 8 && !ctx.onWall;
    ctrl.boost =
      !!plan.boost && this.preset.useBoost && Math.abs(angle) < cfg.boostAngle && ctx.fwdSpeed > 2 &&
      ctx.speed < 22.5 && ctx.me.boost > 0 && !ctx.onWall && (dist > 7 || !!plan.kickoff);
    if (plan.arrive && dist < 4) {
      ctrl.throttle = ctx.fwdSpeed > 1.5 ? -0.4 : 0;
      ctrl.boost = false;
      ctrl.handbrake = false;
    }
    this.debug = { mode: plan.mode, angle, dist };
  }

  _considerShots(ctx) {
    const { bpos, bvel, fwdSpeed } = ctx;
    const cfg = this.cfg;
    const local = ctx.toLocal(bpos);
    const angle = Math.atan2(local.x, -local.z);
    const hdist = Math.hypot(local.x, local.z);
    if (this.plan?.kickoff) {
      if (hdist < cfg.kickoffDodgeDistance + fwdSpeed * 0.04 && Math.abs(angle) < 0.25 && fwdSpeed > 8) {
        this.maneuver = { type: 'dodge', t: 0, fwd: 1, side: 0, boost: true };
      }
      return;
    }
    if (local.z > 0) return;
    if (this.preset.allowJumpShots && bpos.y > cfg.jumpShotMinHeight && bpos.y < cfg.jumpShotMaxHeight &&
        hdist < 2.4 + Math.max(0, fwdSpeed) * 0.15 && Math.abs(angle) < 0.35 && bvel.y < 3) {
      this.maneuver = { type: 'jump', t: 0, double: bpos.y > 3.3 };
      return;
    }
    if (this.preset.allowDodgeShots && bpos.y < 1.5 && hdist < cfg.dodgeShotDistance + fwdSpeed * 0.05 &&
        Math.abs(angle) < 0.2 && fwdSpeed > 7) {
      const sd = this.plan?.shotDir;
      if (!sd || ctx.fwd.x * sd.x + ctx.fwd.z * sd.z > 0.6) this.maneuver = { type: 'dodge', t: 0, fwd: 1, side: 0 };
    }
  }

  _runManeuver(ctx, ctrl, dt) {
    const m = this.maneuver;
    m.t += dt;
    const t = m.t;
    switch (m.type) {
      case 'dodge':
        ctrl.throttle = 1;
        ctrl.boost = !!m.boost && t < 0.15 && ctx.me.boost > 0;
        if (t < 0.07) ctrl.jump = true;
        else if (t < 0.12) ctrl.jump = false;
        else if (t < 0.18) {
          ctrl.jump = true;
          ctrl.pitch = m.fwd;
          ctrl.steer = m.side;
        } else if (t < 0.75) ctrl.pitch = m.fwd;
        else this._airRecovery(ctx, ctrl);
        if (t > 0.3 && ctx.me.numWheelsContact >= 3) return false;
        return t < 1.6;
      case 'jump':
        ctrl.throttle = 1;
        ctrl.jump = t < 0.2 || (m.double && t > 0.24 && t < 0.3);
        if (t > 0.3) this._airFaceBall(ctx, ctrl);
        if (t > 0.35 && ctx.me.numWheelsContact >= 3) return false;
        return t < 2.2;
      case 'reverse':
        ctrl.throttle = -1;
        ctrl.steer = m.steer;
        return t < 0.8;
      case 'recover':
        ctrl.jump = t < 0.08;
        return t < 0.7;
      default:
        return false;
    }
  }

  /** Orient the car to land on its wheels, nose along the travel direction. */
  _airRecovery(ctx, ctrl) {
    const { up, fwd, right, me } = ctx;
    const w = V(me.angularVelocity);
    const axis = new Vector3().crossVectors(up, WORLD_UP);
    if (axis.lengthSq() < 0.04 && up.y < 0) axis.copy(fwd);
    const wR = w.dot(right), wF = w.dot(fwd), wU = w.dot(up);
    ctrl.pitch = clamp(-(axis.dot(right) * 4 - wR) * 0.5, -1, 1);
    ctrl.roll = clamp((axis.dot(fwd) * 4 - wF) * 0.5, -1, 1);
    const hv = new Vector3(ctx.vel.x, 0, ctx.vel.z);
    if (hv.lengthSq() > 4) {
      const l = hv.normalize().applyQuaternion(ctx.qInv);
      ctrl.yaw = clamp(Math.atan2(l.x, -l.z) * 1.5 + wU * 0.3, -1, 1);
    }
    ctrl.throttle = 1;
  }

  /** In the air after a jump shot: point the nose at the ball, keep the roof up. */
  _airFaceBall(ctx, ctrl) {
    const { fwd, up, right, me, bpos, pos } = ctx;
    const w = V(me.angularVelocity);
    const want = bpos.clone().sub(pos).normalize();
    const axis = new Vector3().crossVectors(fwd, want);
    ctrl.pitch = clamp(-(axis.dot(right) * 5 - w.dot(right)) * 0.5, -1, 1);
    ctrl.yaw = clamp(-(axis.dot(up) * 5 - w.dot(up)) * 0.5, -1, 1);
    const rollAxis = new Vector3().crossVectors(up, WORLD_UP);
    ctrl.roll = clamp((rollAxis.dot(fwd) * 4 - w.dot(fwd)) * 0.5, -1, 1);
  }
}
