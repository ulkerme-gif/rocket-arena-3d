import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, steps, C, place, headingFor, restHeight } from './helpers.js';
import { isInsideArena } from '../src/arena/ArenaGeometry.js';

const ctl = (o) => () => ({ player: C(o) });
const hspeed = (v) => Math.hypot(v.x, v.z);
async function carSim() {
  const sim = await createSim();
  sim.ball.setEnabled(false);
  return { sim, car: sim.cars[0] };
}

test('car settles on four wheels at the rest height', async () => {
  const { sim, car } = await carSim();
  steps(sim, 2, ctl({}));
  assert.equal(car.state.numWheelsContact, 4);
  assert.ok(car.velocity.length() < 0.05, `speed ${car.velocity.length()}`);
  assert.ok(car.up.y > 0.995, `up.y ${car.up.y}`);
  assert.ok(Math.abs(car.position.y - restHeight()) < 0.03, `y ${car.position.y} vs ${restHeight()}`);
  sim.dispose();
});

test('throttle accelerates to ~14 m/s and the car stays upright and straight', async () => {
  const { sim, car } = await carSim();
  place(car, 0, 40, 0);
  steps(sim, 4, ctl({ throttle: 1 }));
  const v = car.velocity.length();
  assert.ok(v > 13 && v < 14.3, `speed ${v}`);
  assert.ok(car.forward.z < -0.99 && car.up.y > 0.99, `fwd ${car.forward.toArray()} up ${car.up.toArray()}`);
  steps(sim, 1, ctl({ throttle: -1 }));
  assert.ok(car.velocity.dot(car.forward) < 2, `braking failed ${car.velocity.dot(car.forward)}`);
  sim.dispose();
});

test('boost accelerates to the 23 m/s cap and drains 33.3 per second', async () => {
  const { sim, car } = await carSim();
  place(car, 4, 44, 0, 100); // x = 4 avoids the boost pads on the center line
  let maxV = 0;
  steps(sim, 2.5, ctl({ throttle: 1, boost: true }), () => (maxV = Math.max(maxV, car.velocity.length())));
  assert.ok(maxV > 22.5 && maxV <= 23.001, `max speed ${maxV}`);
  assert.ok(Math.abs(car.boost - (100 - 33.3 * 2.5)) < 1.5, `boost ${car.boost}`);
  steps(sim, 1.2, ctl({ boost: true }));
  assert.equal(car.boost, 0);
  assert.equal(car.state.isBoosting, false);
  sim.dispose();
});

test('steering right turns the car clockwise (towards +X)', async () => {
  const { sim, car } = await carSim();
  place(car, -10, 30, 0);
  steps(sim, 1.2, ctl({ throttle: 1 }));
  steps(sim, 0.8, ctl({ throttle: 1, steer: 1 }));
  assert.ok(car.forward.x > 0.4, `forward ${car.forward.toArray()}`);
  assert.ok(car.up.y > 0.97, `up.y ${car.up.y}`);
  sim.dispose();
});

test('powerslide (handbrake) reduces lateral grip', async () => {
  const measure = async (handbrake) => {
    const { sim, car } = await carSim();
    place(car, 0, 35, 0);
    steps(sim, 1.5, ctl({ throttle: 1 }));
    let slip = 0;
    steps(sim, 0.7, ctl({ throttle: 1, steer: 1, handbrake }), () => (slip = Math.max(slip, Math.abs(car.velocity.dot(car.right)))));
    sim.dispose();
    return slip;
  };
  const normal = await measure(false);
  const drift = await measure(true);
  assert.ok(drift > normal * 2 && drift > 2, `normal ${normal} drift ${drift}`);
});

test('single jump reaches a RL-like height and lands', async () => {
  const { sim, car } = await carSim();
  steps(sim, 0.5, ctl({}));
  const y0 = car.position.y;
  let peak = y0;
  steps(sim, 0.35, ctl({ jump: true }), () => (peak = Math.max(peak, car.position.y)));
  steps(sim, 2.5, ctl({}), () => (peak = Math.max(peak, car.position.y)));
  assert.ok(peak - y0 > 1.6 && peak - y0 < 3.0, `jump height ${peak - y0}`);
  assert.ok(car.state.onGround && !car.state.hasJumped, 'landed and reset');
  sim.dispose();
});

test('double jump goes higher than a single jump', async () => {
  const { sim, car } = await carSim();
  steps(sim, 0.5, ctl({}));
  const y0 = car.position.y;
  let peak = y0;
  steps(sim, 3, (t) => ({ player: C({ jump: t < 0.2 || (t > 0.3 && t < 0.4) }) }), () => (peak = Math.max(peak, car.position.y)));
  assert.ok(peak - y0 > 3.3, `double jump height ${peak - y0}`);
  sim.dispose();
});

test('forward dodge adds ~5 m/s and flips the car', async () => {
  const { sim, car } = await carSim();
  place(car, 0, 40, 0);
  steps(sim, 1.0, ctl({ throttle: 1 }));
  steps(sim, 0.1, ctl({ throttle: 1, jump: true }));
  steps(sim, 0.05, ctl({ throttle: 1 }));
  const v0 = hspeed(car.velocity);
  steps(sim, 1 / 120, ctl({ throttle: 1, pitch: 1, jump: true }));
  assert.ok(car.state.hasFlipped && car.state.isFlipping, 'dodge started');
  let minPitch = 0;
  steps(sim, 0.3, ctl({ throttle: 1, pitch: 1 }), () => (minPitch = Math.min(minPitch, car.angularVelocity.dot(car.right))));
  assert.ok(hspeed(car.velocity) - v0 > 3.5, `dodge gain ${hspeed(car.velocity) - v0}`);
  assert.ok(minPitch < -4, `pitch rate ${minPitch}`);
  sim.dispose();
});

test('air roll spins the car around its forward axis', async () => {
  const { sim, car } = await carSim();
  steps(sim, 0.3, ctl({}));
  steps(sim, 0.2, ctl({ jump: true }));
  steps(sim, 0.3, ctl({ roll: 1 }));
  const w = car.angularVelocity.dot(car.forward);
  assert.ok(w > 3, `roll rate ${w}`);
  sim.dispose();
});

test('car drives from the floor up onto the side wall', async () => {
  const { sim, car } = await carSim();
  place(car, 5, 0, headingFor(1, 0));
  let wallHeight = 0;
  steps(sim, 4, ctl({ throttle: 1 }), () => {
    if (car.up.x < -0.8 && car.state.numWheelsContact >= 3) wallHeight = Math.max(wallHeight, car.position.y);
  });
  assert.ok(wallHeight > 4, `max height while on the wall ${wallHeight}`);
  sim.dispose();
});

test('upside-down car recovers with a jump', async () => {
  const { sim, car } = await carSim();
  car.reset({ x: 0, y: 0.3, z: 20 }, 0);
  car.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
  car._readBody();
  car.snapInterpolation();
  steps(sim, 1.5, ctl({}));
  assert.ok(car.up.y < -0.8 && car.state.onRoofOrSide, `before: up.y ${car.up.y} roof ${car.state.onRoofOrSide}`);
  steps(sim, 0.1, ctl({ jump: true }));
  steps(sim, 2.0, ctl({}));
  assert.ok(car.up.y > 0.9 && car.state.numWheelsContact >= 3, `after: up.y ${car.up.y} wheels ${car.state.numWheelsContact}`);
  sim.dispose();
});

test('ball bounces with ~0.6 restitution', async () => {
  const sim = await createSim();
  sim.cars[0].reset({ x: 25, z: 30 }, 0);
  sim.ball.reset({ x: 0, y: 10, z: 0 });
  let landed = false, prevVy = 0, peak = 0;
  steps(sim, 4, ctl({}), () => {
    const b = sim.ball;
    if (!landed && b.velocity.y > 0 && prevVy < 0) landed = true;
    if (landed) peak = Math.max(peak, b.position.y);
    prevVy = b.velocity.y;
  });
  assert.ok(peak > 3.5 && peak < 5.2, `rebound peak ${peak}`);
  sim.dispose();
});

test('ball at max speed never tunnels through walls, corners or ceiling', async () => {
  const sim = await createSim();
  sim.cars[0].reset({ x: -25, z: 30 }, 0);
  for (const [dx, dy, dz] of [[1, 0, 0], [0, 0, 1], [0.7, 0, 0.7], [0, 1, 0], [-0.5, 0.2, -1], [1, -0.5, 0], [-0.6, -0.3, 0.8]]) {
    const L = Math.hypot(dx, dy, dz);
    sim.ball.setEnabled(true);
    sim.ball.reset({ x: 0, y: 10, z: 0 }, { x: (60 * dx) / L, y: (60 * dy) / L, z: (60 * dz) / L });
    let escaped = null;
    steps(sim, 1.5, ctl({}), () => {
      const p = sim.ball.position;
      if (!escaped && !isInsideArena(sim.dims, p.x, p.y, p.z, -0.25)) escaped = p.toArray();
    });
    assert.equal(escaped, null, `ball escaped going ${[dx, dy, dz]} at ${escaped}`);
  }
  sim.dispose();
});

test('a car hit launches the ball forward, faster than the car', async () => {
  const sim = await createSim();
  const car = sim.cars[0];
  place(car, 0, 20, 0, 100);
  let carSpeedAtHit = null;
  sim.events.on('ballHit', (e) => {
    if (carSpeedAtHit === null && e.carId === 'player') {
      carSpeedAtHit = car.velocity.length();
      console.log(`  first touch: relSpeed ${e.relativeSpeed.toFixed(2)} car ${carSpeedAtHit.toFixed(2)}`);
    }
  });
  steps(sim, 2.2, ctl({ throttle: 1, boost: true }));
  const bv = sim.ball.velocity;
  assert.ok(carSpeedAtHit !== null, 'no touch detected');
  assert.ok(bv.z < -15, `ball vz ${bv.z}`);
  assert.ok(bv.length() > carSpeedAtHit + 3, `ball ${bv.length()} car ${carSpeedAtHit}`);
  assert.ok(sim.ball.position.distanceTo(car.position) > 3, 'ball separated from the car');
  sim.dispose();
});
