import { CONFIG } from '../config/index.js';
import { EventBus } from '../core/EventBus.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { CarController, NEUTRAL_CONTROLS } from '../physics/CarController.js';
import { Ball } from '../physics/Ball.js';
import { BallHitSystem } from '../physics/BallHitSystem.js';
import { buildArenaGeometry, isInsideArena } from '../arena/ArenaGeometry.js';
import { ArenaPhysics } from '../arena/ArenaPhysics.js';
import { buildLayout, headingTowards } from '../arena/layout.js';
import { BoostPadSystem } from './BoostPadSystem.js';
import { GameRules } from './GameRules.js';
import { MODE, TEAM } from './constants.js';

const v3 = (v) => ({ x: v.x, y: v.y, z: v.z });
const q4 = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

/**
 * The complete game simulation, independent of rendering, DOM and input.
 * Runs in the browser and in Node (tests). One call to step() = one fixed
 * physics tick (1 / tickRate seconds).
 */
export class Simulation {
  /**
   * @param {object} o
   * @param {object} o.RAPIER initialized Rapier module
   * @param {object} [o.config] defaults to CONFIG
   * @param {'match'|'training'|'demo'} [o.mode]
   * @param {Array<{id:string, team:'blue'|'orange', kind?:'human'|'bot'}>} [o.players]
   * @param {() => number} [o.random] RNG used for kickoff spots
   */
  constructor({ RAPIER, config = CONFIG, mode = MODE.MATCH, players, random = Math.random }) {
    this.config = config;
    this.mode = mode;
    this.random = random;
    this.events = new EventBus();
    this.physics = new PhysicsWorld(RAPIER, config.physics);
    this.dt = this.physics.dt;
    this.geometry = buildArenaGeometry(config.arena);
    this.dims = this.geometry.dims;
    this.layout = buildLayout(config.arena, this.dims, config.physics.boostPads);
    this.arena = new ArenaPhysics(this.physics, this.geometry, config.physics.arenaSurface);
    this.ball = new Ball(this.physics, config.physics.ball);

    players = players ?? [{ id: 'player', team: TEAM.BLUE, kind: 'human' }];
    this.cars = players.map((p) => {
      const car = new CarController(this.physics, { id: p.id, team: p.team, physicsConfig: config.physics });
      car.kind = p.kind ?? 'human';
      car.onEvent = (type, payload) => this.events.emit(type, payload);
      return car;
    });
    this.carById = new Map(this.cars.map((c) => [c.id, c]));

    this.ballHits = new BallHitSystem(config.physics, this.physics);
    this.boostPads = new BoostPadSystem(this.layout.boostPads, config.physics.boostPads, config.physics.boost);
    this.boostPads.onPickup = (pad, car) => this.events.emit('boostPickup', { padIndex: pad.index, big: pad.big, carId: car.id });
    this.rules = new GameRules(this, config.rules, this.events);
    this.bots = new Map();
    this.tick = 0;
    this.time = 0;
    this.lastTouches = [];

    // One tick so Rapier builds its scene-query structures (raycasts need them).
    this.physics.step();

    if (mode === MODE.TRAINING && config.rules.training.unlimitedBoost) {
      for (const car of this.cars) car.unlimitedBoost = true;
    }
  }

  /** Attach an AI controller: an object with update(gameState, dt) -> ControlState. */
  attachBot(carId, bot) {
    this.bots.set(carId, bot);
  }

  start() {
    this.rules.start();
  }

  /**
   * Advances the simulation by one fixed tick.
   * @param {Record<string, object>} externalControls ControlState per human car id
   */
  step(externalControls = {}) {
    const dt = this.dt;
    this.tick++;
    this.time += dt;
    this.rules.preTick(dt);
    const enabled = this.rules.controlsEnabled();

    let snapshot = null;
    for (const car of this.cars) {
      const bot = this.bots.get(car.id);
      let ctrl;
      if (bot) {
        snapshot ??= this.getState();
        ctrl = bot.update(snapshot, dt);
      } else {
        ctrl = externalControls[car.id];
      }
      car.setControls(enabled ? ctrl ?? NEUTRAL_CONTROLS : null);
    }

    this.ball.capturePrevious();
    for (const car of this.cars) car.capturePrevious();

    for (const car of this.cars) car.preStep(dt);
    this.ballHits.capturePreStep(this.cars, this.ball);
    this.physics.step();
    this.ball.postStep(dt);
    for (const car of this.cars) car.postStep(dt);

    const touches = this.ballHits.update(this.cars, this.ball, this.time);
    this.lastTouches = touches;
    for (const t of touches) {
      this.rules.onTouch(t);
      if (t.isNewTouch) {
        this.events.emit('ballHit', {
          carId: t.car.id,
          team: t.car.team,
          relativeSpeed: t.relativeSpeed,
          position: v3(this.ball.position),
        });
      }
    }

    this.boostPads.update(dt, this.cars);
    this.rules.postTick(dt);
    this._safetyChecks();
  }

  /** Last-resort recovery if a body ever escapes the arena (should not happen). */
  _safetyChecks() {
    const m = -this.config.rules.outOfBoundsMargin;
    const bp = this.ball.position;
    if (this.ball.enabled && (!isInsideArena(this.dims, bp.x, bp.y, bp.z, m) || !Number.isFinite(bp.x + bp.y + bp.z))) {
      console.warn('[Simulation] ball escaped the arena, resetting', v3(bp));
      this.resetBall();
      this.events.emit('warning', { type: 'ballOutOfBounds' });
    }
    for (const car of this.cars) {
      const p = car.position;
      if (!isInsideArena(this.dims, p.x, p.y, p.z, m) || !Number.isFinite(p.x + p.y + p.z)) {
        console.warn('[Simulation] car escaped the arena, resetting', car.id, v3(p));
        this.resetCar(car.id);
        this.events.emit('warning', { type: 'carOutOfBounds', carId: car.id });
      }
    }
  }

  resetBall() {
    this.ball.setEnabled(true);
    this.ball.reset({ x: 0, y: this.ball.radius, z: 0 });
    this.ballHits.reset();
    this.events.emit('ballReset', {});
  }

  /** Puts every car on a kickoff spot (point-mirrored for orange). */
  resetForKickoff() {
    const spots = this.layout.kickoffSpots;
    const start = Math.floor(this.random() * spots.length) % spots.length;
    const perTeam = { [TEAM.BLUE]: 0, [TEAM.ORANGE]: 0 };
    for (const car of this.cars) {
      const k = perTeam[car.team]++;
      const s = spots[(start + k * 2) % spots.length];
      const sign = car.team === TEAM.BLUE ? 1 : -1;
      const pos = { x: s.x * sign, z: s.z * sign };
      car.reset(pos, headingTowards(pos, { x: 0, z: 0 }), this.config.physics.boost.startAmount);
    }
    this.resetBall();
    this.boostPads.reset();
    for (const bot of this.bots.values()) bot.reset?.();
  }

  resetTraining() {
    for (const car of this.cars) this.resetCar(car.id);
    this.resetBall();
    this.boostPads.reset();
  }

  resetCar(carId) {
    const car = this.carById.get(carId);
    if (!car) return;
    const t = this.layout.trainingSpawn;
    const sign = car.team === TEAM.BLUE ? 1 : -1;
    const pos = this.mode === MODE.TRAINING ? { x: t.x, z: t.z * sign } : { x: this.layout.kickoffSpots[4].x * sign, z: this.layout.kickoffSpots[4].z * sign };
    const boost = this.mode === MODE.TRAINING ? this.config.rules.training.resetBoostAmount : this.config.physics.boost.startAmount;
    car.reset(pos, headingTowards(pos, { x: 0, z: 0 }), boost);
  }

  /** Plain-object snapshot of everything a bot, HUD or tool may need. */
  getState() {
    const r = this.rules;
    const d = this.dims;
    return {
      tick: this.tick,
      time: this.time,
      mode: this.mode,
      phase: r.phase,
      isKickoff: r.kickoffActive,
      countdown: r.countdown,
      score: { ...r.score },
      timeRemaining: r.timeRemaining,
      isOvertime: r.overtime,
      overtimeElapsed: r.overtimeElapsed,
      clockRunning: r.clockRunning,
      lastTouch: r.lastTouch ? { ...r.lastTouch } : null,
      arena: {
        halfWidth: d.a,
        halfLength: d.b,
        height: d.H,
        goalHalfWidth: d.hg,
        goalHeight: d.gh,
        goalDepth: d.gd,
        cornerRadius: d.Rc,
        floorFilletRadius: d.Rf,
      },
      gravity: this.physics.gravity,
      ball: {
        position: v3(this.ball.position),
        velocity: v3(this.ball.velocity),
        angularVelocity: v3(this.ball.angularVelocity),
        radius: this.ball.radius,
        enabled: this.ball.enabled,
      },
      cars: this.cars.map((c) => ({
        id: c.id,
        team: c.team,
        isBot: this.bots.has(c.id),
        position: v3(c.position),
        quaternion: q4(c.quaternion),
        velocity: v3(c.velocity),
        angularVelocity: v3(c.angularVelocity),
        forward: v3(c.forward),
        up: v3(c.up),
        right: v3(c.right),
        boost: c.boost,
        onGround: c.state.onGround,
        numWheelsContact: c.state.numWheelsContact,
        hasFlip: c.hasFlipAvailable,
        isJumping: c.state.isJumping,
        isFlipping: c.state.isFlipping,
        isBoosting: c.state.isBoosting,
        isSupersonic: c.state.isSupersonic,
        onRoofOrSide: c.state.onRoofOrSide,
      })),
      boostPads: this.boostPads.pads.map((p) => ({ index: p.index, position: { x: p.x, y: 0, z: p.z }, big: p.big, active: p.active, timer: p.timer })),
    };
  }

  dispose() {
    this.events.clear();
    this.physics.dispose();
  }
}
