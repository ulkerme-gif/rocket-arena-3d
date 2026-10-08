import * as THREE from 'three';
import { CarView } from '../visuals/CarView.js';
import { BallView } from '../visuals/BallView.js';
import { BoostPadView } from '../visuals/BoostPadView.js';
import { CONFIG } from '../config/index.js';
import { ClientPredictionEngine } from './ClientPredictionEngine.js';
import { SnapshotTimeline } from './SnapshotTimeline.js';

const smooth = (rate, dt) => 1 - Math.exp(-rate * Math.min(dt, 0.1));

function makeCar(data) {
  const car = {
    id: data.id, team: data.team,
    position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
    quaternion: new THREE.Quaternion(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w),
    velocity: new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z),
    forward: new THREE.Vector3(0, 0, -1),
    state: { isBoosting: false, isSupersonic: false, onGround: false },
    wheels: [],
    getRenderTransform(_alpha, outPos, outQuat) { outPos.copy(this.position); outQuat.copy(this.quaternion); },
  };
  const wheel = CONFIG.physics.car.wheels;
  for (const z of [wheel.front.z, wheel.rear.z]) for (const side of [-1, 1]) {
    car.wheels.push({
      local: { x: side * (z === wheel.front.z ? wheel.front.x : wheel.rear.x), y: z === wheel.front.z ? wheel.front.y : wheel.rear.y, z },
      side, suspension: wheel.suspensionRestLength / 2, steer: 0, spin: 0
    });
  }
  car.forward.applyQuaternion(car.quaternion);
  return car;
}

export class RemoteGameView {
  constructor(renderer, snapshot, localPlayerId) {
    this.root = new THREE.Group();
    renderer.scene.add(this.root);
    this.renderer = renderer;
    this.localPlayerId = localPlayerId;
    this.targets = new Map();
    this.cars = new Map();
    this.views = new Map();
    this.predictionEngine = new ClientPredictionEngine(localPlayerId);
    this.timeline = new SnapshotTimeline();
    this._targetPosition = new THREE.Vector3();
    this._targetQuaternion = new THREE.Quaternion();

    for (const item of snapshot.cars) {
      const car = makeCar(item);
      this.cars.set(item.id, car);
      this.views.set(item.id, new CarView(car, this.root));
    }
    this.ball = new BallView(snapshot.ball.radius, this.root);
    this.ballPosition = new THREE.Vector3(snapshot.ball.position.x, snapshot.ball.position.y, snapshot.ball.position.z);
    this.ballQuaternion = new THREE.Quaternion();
    this.ballTarget = null;
    this.padList = snapshot.boostPads.map(p => ({ index: p.index, x: p.position.x, z: p.position.z, big: p.big, active: p.active, timer: p.timer }));
    this.pads = new BoostPadView(this.padList, this.root);
    this.lastSnapshot = snapshot;
    this.onSnapshot(snapshot, true);
    this.time = 0;
  }

  onSnapshot(snapshot, initial = false) {
    const previous = this.lastSnapshot;
    const goalReset = !initial && previous && (
      previous.score.blue !== snapshot.score.blue ||
      previous.score.orange !== snapshot.score.orange ||
      (previous.phase === 'goal' && snapshot.phase === 'countdown')
    );
    if (goalReset) {
      // Kickoff teleports must not interpolate across the entire arena.
      this.timeline.clear();
      this.predictionEngine.reset();
      for (const item of snapshot.cars) {
        const car = this.cars.get(item.id);
        if (!car) continue;
        car.position.set(item.position.x, item.position.y, item.position.z);
        car.quaternion.set(item.quaternion.x, item.quaternion.y, item.quaternion.z, item.quaternion.w);
      }
      this.ballPosition.set(snapshot.ball.position.x, snapshot.ball.position.y, snapshot.ball.position.z);
    }
    this.lastSnapshot = snapshot;
    this.timeline.push(snapshot);
    this.ballTarget = snapshot.ball;

    if (initial) {
      this.ballPosition.set(snapshot.ball.position.x, snapshot.ball.position.y, snapshot.ball.position.z);
    }

    for (const item of snapshot.cars) {
      const car = this.cars.get(item.id);
      if (!car) continue;
      this.targets.set(item.id, item);
      if (initial) {
        car.position.set(item.position.x, item.position.y, item.position.z);
        car.quaternion.set(item.quaternion.x, item.quaternion.y, item.quaternion.z, item.quaternion.w);
      }
    }

    // Perform reconciliation for local player car
    if (!initial && this.localPlayerId) {
      const localCar = this.cars.get(this.localPlayerId);
      if (localCar) {
        this.predictionEngine.reconcile(snapshot);
      }
    }

    for (const [i, p] of snapshot.boostPads.entries()) {
      if (this.padList[i]) {
        this.padList[i].active = p.active;
        this.padList[i].timer = p.timer;
      }
    }
  }

  update(dt) {
    const k = smooth(19, dt);
    this.time += dt;
    const frame = this.timeline.sample();
    if (!frame) return;

    for (const [id, item] of this.targets) {
      const car = this.cars.get(id);
      if (!car) continue;
      if (id === this.localPlayerId) {
        const estimated = this.lastSnapshot.phase === 'playing'
          ? this.predictionEngine.estimate(item) : item.position;
        this._targetPosition.set(estimated.x, estimated.y, estimated.z);
        this._targetQuaternion.set(item.quaternion.x, item.quaternion.y, item.quaternion.z, item.quaternion.w);
        car.position.lerp(this._targetPosition, k);
        car.quaternion.slerp(this._targetQuaternion, k);
      } else {
        const from = frame.a.cars.find(c => c.id === id) || item;
        const to = frame.b.cars.find(c => c.id === id) || item;
        const f = frame.alpha;
        const ahead = frame.extrapolationMs / 1000;
        car.position.set(
          from.position.x + (to.position.x - from.position.x) * f + to.velocity.x * ahead,
          from.position.y + (to.position.y - from.position.y) * f + to.velocity.y * ahead,
          from.position.z + (to.position.z - from.position.z) * f + to.velocity.z * ahead,
        );
        car.quaternion.set(from.quaternion.x, from.quaternion.y, from.quaternion.z, from.quaternion.w);
        this._targetQuaternion.set(to.quaternion.x, to.quaternion.y, to.quaternion.z, to.quaternion.w);
        car.quaternion.slerp(this._targetQuaternion, f);
      }

      car.velocity.set(item.velocity.x, item.velocity.y, item.velocity.z);
      car.forward.set(0, 0, -1).applyQuaternion(car.quaternion);
      car.state.onGround = item.onGround;
      car.state.isBoosting = item.isBoosting;
      car.state.isSupersonic = item.isSupersonic;
      for (let i = 0; i < car.wheels.length; i++) {
        car.wheels[i].spin += dt * car.velocity.length() / CONFIG.physics.car.wheels.radius;
        car.wheels[i].steer = 0;
      }
      this.views.get(id).update(1);
    }

    if (this.ballTarget) {
      const from = frame.a.ball;
      const to = frame.b.ball;
      const f = frame.alpha;
      const ahead = frame.extrapolationMs / 1000;
      this.ballPosition.set(
        from.position.x + (to.position.x - from.position.x) * f + to.velocity.x * ahead,
        from.position.y + (to.position.y - from.position.y) * f + to.velocity.y * ahead,
        from.position.z + (to.position.z - from.position.z) * f + to.velocity.z * ahead,
      );
      this.ball.update(this.ballPosition, this.ballQuaternion, to.enabled);
    }
    this.pads.update(this.time);
  }

  dispose() {
    this.renderer.scene.remove(this.root);
    this.root.traverse(o => {
      o.geometry?.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
    this.timeline.clear();
    this.predictionEngine.reset();
    this.targets.clear();
    this.cars.clear();
    this.views.clear();
  }
}
