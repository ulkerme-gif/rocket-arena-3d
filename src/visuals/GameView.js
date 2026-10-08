import * as THREE from 'three';
import { CarView } from './CarView.js';
import { BallView } from './BallView.js';
import { BoostPadView } from './BoostPadView.js';
import { Effects } from './Effects.js';
import { TEAM_COLORS } from './ArenaView.js';

const _p = new THREE.Vector3();

/**
 * Per-session visuals (cars, ball, pads, effects) for one Simulation.
 * Read-only consumer of simulation state and events.
 */
export class GameView {
  constructor(renderer, sim) {
    this.renderer = renderer;
    this.sim = sim;
    this.time = 0;
    this.root = new THREE.Group();
    this.root.name = 'session';
    renderer.scene.add(this.root);
    this.carViews = new Map(sim.cars.map((car) => [car.id, new CarView(car, this.root)]));
    this.ballView = new BallView(sim.ball.radius, this.root);
    this.padsView = new BoostPadView(sim.boostPads.pads, this.root);
    this.effects = new Effects(this.root);
    this.ballRenderPos = new THREE.Vector3(0, sim.ball.radius, 0);
    this.ballRenderQuat = new THREE.Quaternion();
    const ev = sim.events;
    this._unsubs = [
      ev.on('goal', (e) => this.effects.explosion(e.position, TEAM_COLORS[e.team])),
      ev.on('ballHit', (e) => e.relativeSpeed > 4 && this.effects.sparks(e.position, e.relativeSpeed)),
      ev.on('boostPickup', (e) => this.effects.pickup(sim.boostPads.pads[e.padIndex], e.big)),
    ];
  }

  update(alpha, dt) {
    this.time += dt;
    const sim = this.sim;
    sim.ball.getRenderTransform(alpha, this.ballRenderPos, this.ballRenderQuat);
    this.ballView.update(this.ballRenderPos, this.ballRenderQuat, sim.ball.enabled);
    for (const view of this.carViews.values()) {
      view.update(alpha);
      const car = view.car;
      if (car.state.isBoosting) this.effects.trail(view.nozzleWorld(_p), car.forward, car.state.isSupersonic, TEAM_COLORS[car.team]);
    }
    this.padsView.update(this.time);
    const fov = THREE.MathUtils.degToRad(this.renderer.camera.fov);
    this.effects.update(dt, this.renderer.pixelHeight / (2 * Math.tan(fov / 2)));
  }

  dispose() {
    this._unsubs.forEach((u) => u());
    this.renderer.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
  }
}
