import * as THREE from 'three';
import { CarView } from '../visuals/CarView.js';
import { BallView } from '../visuals/BallView.js';
import { BoostPadView } from '../visuals/BoostPadView.js';
import { makeStaticCar } from '../visuals/staticCar.js';
import { CONFIG } from '../config/index.js';
import { SnapshotTimeline } from './SnapshotTimeline.js';

const _from = new THREE.Quaternion();
const _to = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Guest-side view of the host's match. Every car (including your own, which the
 * camera follows) and the ball are drawn from the same smooth timeline on the
 * host's simulation clock, so nothing jitters and ball contacts look consistent.
 */
export class RemoteGameView {
  constructor(renderer, snapshot, localPlayerId, { tickRate = CONFIG.physics.world.tickRate } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'remote-session';
    renderer.scene.add(this.root);
    this.renderer = renderer;
    this.localPlayerId = localPlayerId;
    this.cars = new Map();
    this.views = new Map();
    this.timeline = new SnapshotTimeline({ tickRate });

    for (const item of snapshot.cars) {
      const car = makeStaticCar(item);
      this.cars.set(item.id, car);
      this.views.set(item.id, new CarView(car, this.root));
    }
    this.ball = new BallView(snapshot.ball.radius, this.root);
    this.ballRadius = snapshot.ball.radius;
    this.ballPosition = new THREE.Vector3(snapshot.ball.position.x, snapshot.ball.position.y, snapshot.ball.position.z);
    this.ballQuaternion = new THREE.Quaternion();
    this.ballVelocity = new THREE.Vector3();
    this.ballEnabled = !!snapshot.ball.enabled;
    this.padList = snapshot.boostPads.map(p => ({ index: p.index, x: p.position.x, z: p.position.z, big: p.big, active: p.active, timer: p.timer }));
    this.pads = new BoostPadView(this.padList, this.root);
    this.lastSnapshot = null;
    this.time = 0;
    this.onSnapshot(snapshot);
  }

  /** Kept for the camera: true while the ball is in play. */
  get ballTarget() { return { enabled: this.ballEnabled }; }

  setSkin(id, skin) { this.views.get(id)?.setSkin(skin); }

  onSnapshot(snapshot) {
    const previous = this.lastSnapshot;
    const teleport = previous && (
      previous.score.blue !== snapshot.score.blue ||
      previous.score.orange !== snapshot.score.orange ||
      (previous.phase === 'goal' && snapshot.phase === 'countdown')
    );
    // Kickoff teleports must not be interpolated across the whole arena.
    if (teleport) this.timeline.clear();
    this.lastSnapshot = snapshot;
    this.timeline.push(snapshot);
    for (const [i, p] of snapshot.boostPads.entries()) {
      if (this.padList[i]) {
        this.padList[i].active = p.active;
        this.padList[i].timer = p.timer;
      }
    }
  }

  update(dt) {
    this.time += dt;
    const frame = this.timeline.sample();
    if (!frame) return;
    const f = frame.alpha;
    const ahead = frame.extrapolationMs / 1000;

    for (const to of frame.b.cars) {
      const car = this.cars.get(to.id);
      if (!car) continue;
      const from = frame.a.cars.find(c => c.id === to.id) || to;
      car.position.set(
        from.position.x + (to.position.x - from.position.x) * f + to.velocity.x * ahead,
        from.position.y + (to.position.y - from.position.y) * f + to.velocity.y * ahead,
        from.position.z + (to.position.z - from.position.z) * f + to.velocity.z * ahead,
      );
      _from.set(from.quaternion.x, from.quaternion.y, from.quaternion.z, from.quaternion.w);
      _to.set(to.quaternion.x, to.quaternion.y, to.quaternion.z, to.quaternion.w);
      car.quaternion.slerpQuaternions(_from, _to, f);
      car.velocity.set(
        from.velocity.x + (to.velocity.x - from.velocity.x) * f,
        from.velocity.y + (to.velocity.y - from.velocity.y) * f,
        from.velocity.z + (to.velocity.z - from.velocity.z) * f,
      );
      car.forward.set(0, 0, -1).applyQuaternion(car.quaternion);
      car.state.onGround = to.onGround;
      car.state.isBoosting = to.isBoosting;
      car.state.isSupersonic = to.isSupersonic;
      const forwardSpeed = car.velocity.dot(car.forward);
      for (const wheel of car.wheels) {
        wheel.spin = (wheel.spin + (dt * forwardSpeed) / CONFIG.physics.car.wheels.radius) % (Math.PI * 2);
        wheel.steer = 0;
      }
      this.views.get(to.id).update(1);
    }

    const from = frame.a.ball, to = frame.b.ball;
    this.ballPosition.set(
      from.position.x + (to.position.x - from.position.x) * f + to.velocity.x * ahead,
      from.position.y + (to.position.y - from.position.y) * f + to.velocity.y * ahead,
      from.position.z + (to.position.z - from.position.z) * f + to.velocity.z * ahead,
    );
    // Snapshots carry no ball spin: roll it visually from its velocity.
    this.ballVelocity.set(to.velocity.x, to.velocity.y, to.velocity.z);
    const speed = Math.hypot(to.velocity.x, to.velocity.z);
    if (speed > 0.05 && this.ballRadius > 0) {
      _axis.set(to.velocity.z, 0, -to.velocity.x).normalize();
      _spin.setFromAxisAngle(_axis, (speed * dt) / this.ballRadius);
      this.ballQuaternion.premultiply(_spin);
    }
    this.ballEnabled = !!to.enabled;
    this.ball.update(this.ballPosition, this.ballQuaternion, to.enabled);
    this.pads.update(this.time);
  }

  dispose() {
    this.renderer.scene.remove(this.root);
    this.root.traverse(o => {
      o.geometry?.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.map?.dispose(); m.dispose(); }
    });
    this.timeline.clear();
    this.cars.clear();
    this.views.clear();
  }
}
