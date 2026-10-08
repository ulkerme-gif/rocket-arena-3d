import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/game/Simulation.js';
import { MODE } from '../src/game/constants.js';
import { CONFIG } from '../src/config/index.js';
import { CarController } from '../src/physics/CarController.js';

let ready = null;
export async function initRapier() {
  ready ??= RAPIER.init();
  await ready;
  return RAPIER;
}

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function createSim({ mode = MODE.TRAINING, players, config = CONFIG, random } = {}) {
  await initRapier();
  const sim = new Simulation({ RAPIER, mode, players, config, random: random ?? seeded(1) });
  sim.start();
  return sim;
}

/** Runs the simulation for `seconds`; controlsFn(time) returns external controls. */
export function steps(sim, seconds, controlsFn = () => ({}), onTick) {
  const n = Math.round(seconds / sim.dt);
  for (let i = 0; i < n; i++) {
    sim.step(controlsFn(i * sim.dt));
    if (onTick) onTick(i * sim.dt);
  }
}

export const C = (o = {}) => ({ throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false, ...o });
export const restHeight = () => CarController.restHeight(CONFIG.physics);
export function place(car, x, z, heading = 0, boost = 100) {
  car.reset({ x, z }, heading, boost);
}
export const headingFor = (dx, dz) => Math.atan2(-dx, -dz);
