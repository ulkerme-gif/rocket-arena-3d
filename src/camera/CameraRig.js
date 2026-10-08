import { Vector3, MathUtils } from 'three';
import { clamp, smoothFactor } from '../core/math.js';

const WORLD_UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();

/**
 * Car camera + ball camera (RL style), plus broadcast/orbit cameras for the
 * menu and end screen. Works on interpolated render transforms only, so it
 * never jitters with the physics tick. All tuning lives in config/camera.js.
 */
export class CameraRig {
  constructor(camera, cameraConfig) {
    this.camera = camera;
    this.cfg = cameraConfig;
    this.ballCam = !!cameraConfig.defaultBallCam;
    this.pos = new Vector3(0, 14, 45);
    this.lookDir = new Vector3(0, -0.3, -1).normalize();
    this.up = new Vector3(0, 1, 0);
    this.heading = new Vector3(0, 0, -1);
    this.ballDir = new Vector3(0, 0, -1);
    this.fov = cameraConfig.fov;
    this.initialized = false;
    this.orbit = 0.4;
  }

  setBallCam(on) {
    this.ballCam = !!on;
  }

  toggleBallCam() {
    this.ballCam = !this.ballCam;
    return this.ballCam;
  }

  /** Skip smoothing on the next update (after respawns / mode changes). */
  snap() {
    this.initialized = false;
  }

  _flatten(v, U) {
    v.addScaledVector(U, -v.dot(U));
    if (v.lengthSq() < 1e-6) v.crossVectors(U, Math.abs(U.x) < 0.9 ? X_AXIS : Z_AXIS);
    return v.normalize();
  }

  /**
   * @param {number} dt frame time
   * @param {{carPos, carQuat, carVel, grounded:boolean, ballPos, ballVisible:boolean, arenaHeight:number}} t
   */
  update(dt, t) {
    const cfg = this.cfg;
    const fwd = _a.set(0, 0, -1).applyQuaternion(t.carQuat);
    const carUp = _b.set(0, 1, 0).applyQuaternion(t.carQuat);
    const desiredUp = t.grounded ? carUp : WORLD_UP; // roll onto walls only while driving on them
    if (!this.initialized) this.up.copy(desiredUp);
    else this.up.lerp(desiredUp, smoothFactor(cfg.upSmoothing, dt)).normalize();
    const U = this.up;

    const h = _c.copy(fwd).addScaledVector(U, -fwd.dot(U));
    if (h.lengthSq() < 0.04) h.copy(t.carVel).addScaledVector(U, -t.carVel.dot(U));
    if (h.lengthSq() > 1e-4) {
      h.normalize();
      if (!this.initialized) this.heading.copy(h);
      else this.heading.lerp(h, smoothFactor(cfg.swivelSmoothing, dt));
    }
    this._flatten(this.heading, U);

    const useBall = this.ballCam && t.ballVisible;
    if (useBall) {
      const toBall = _c.copy(t.ballPos).sub(t.carPos);
      toBall.addScaledVector(U, -toBall.dot(U));
      if (toBall.lengthSq() > 2.25) {
        toBall.normalize();
        if (!this.initialized) this.ballDir.copy(toBall);
        else this.ballDir.lerp(toBall, smoothFactor(cfg.ballCamSmoothing, dt));
      }
      this._flatten(this.ballDir, U);
    } else {
      this.ballDir.copy(this.heading);
    }
    const camDir = useBall ? this.ballDir : this.heading;

    const desiredPos = _a.copy(t.carPos).addScaledVector(camDir, -cfg.distance).addScaledVector(U, cfg.height);
    const look = _b;
    if (useBall) {
      look.copy(t.ballPos).sub(desiredPos).normalize();
      const carDir = _d.copy(t.carPos).sub(desiredPos).normalize();
      const carElev = Math.asin(clamp(carDir.dot(U), -1, 1));
      const halfV = MathUtils.degToRad(this.camera.fov) / 2;
      const maxElev = Math.min(cfg.ballCamMaxElevation, carElev + halfV * 0.82);
      const minElev = carElev - halfV * 0.4;
      const elev = Math.asin(clamp(look.dot(U), -1, 1));
      const ce = clamp(elev, minElev, maxElev);
      if (Math.abs(ce - elev) > 1e-4) {
        _c.copy(look).addScaledVector(U, -look.dot(U));
        if (_c.lengthSq() < 1e-6) _c.copy(camDir);
        _c.normalize();
        look.copy(_c).multiplyScalar(Math.cos(ce)).addScaledVector(U, Math.sin(ce));
      }
    } else {
      const ang = MathUtils.degToRad(cfg.angle);
      look.copy(camDir).multiplyScalar(Math.cos(ang)).addScaledVector(U, Math.sin(ang));
    }

    const posRate = 8 + 32 * clamp(cfg.stiffness, 0, 1);
    if (!this.initialized) {
      this.pos.copy(desiredPos);
      this.lookDir.copy(look);
      this.initialized = true;
    } else {
      this.pos.lerp(desiredPos, smoothFactor(posRate, dt));
      this.lookDir.lerp(look, smoothFactor(cfg.transitionRate, dt)).normalize();
    }
    if (t.arenaHeight) this.pos.y = clamp(this.pos.y, 0.3, t.arenaHeight - 0.3);
    this._apply(U, cfg.fov + cfg.speedFovBoost * clamp(t.carVel.length() / 23, 0, 1), dt);
  }

  _apply(U, fov, dt) {
    this.fov += (fov - this.fov) * smoothFactor(4, dt);
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.up.copy(U);
    cam.lookAt(_c.copy(this.pos).add(this.lookDir));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  _follow(dt, desired, focus, posRate, lookRate, fov) {
    const look = _b.copy(focus).sub(desired).normalize();
    if (!this.initialized) {
      this.pos.copy(desired);
      this.lookDir.copy(look);
      this.initialized = true;
    } else {
      this.pos.lerp(desired, smoothFactor(posRate, dt));
      this.lookDir.lerp(look, smoothFactor(lookRate, dt)).normalize();
    }
    this.up.copy(WORLD_UP);
    this._apply(this.up, fov, dt);
  }

  /** TV-style side camera that follows the ball (menu background demo). */
  updateBroadcast(dt, ballPos, dims) {
    const desired = _a.set(-(dims.a - 4), 12, clamp(ballPos.z * 0.7, -dims.b + 12, dims.b - 12));
    this._follow(dt, desired, ballPos, 1.2, 2.5, this.cfg.fov - 8);
  }

  /** Slow orbit inside the arena (end screen). */
  updateOrbit(dt, dims, focus) {
    this.orbit += dt * 0.15;
    const desired = _a.set(Math.sin(this.orbit) * (dims.a - 8), 14, Math.cos(this.orbit) * (dims.b - 12));
    this._follow(dt, desired, focus ?? _d.set(0, 1, 0), 2, 2, this.cfg.fov);
  }
}
