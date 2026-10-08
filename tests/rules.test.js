import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, steps, C, place } from './helpers.js';
import { MODE, PHASE } from '../src/game/constants.js';

const players = [{ id: 'player', team: 'blue' }, { id: 'p2', team: 'orange' }];
const idle = () => ({});
const matchSim = () => createSim({ mode: MODE.MATCH, players });
function clearCars(sim) {
  sim.cars[0].reset({ x: 25, z: 25 }, 0);
  sim.cars[1].reset({ x: -25, z: -25 }, Math.PI);
}

test('countdown blocks input; the clock starts on the first touch', async () => {
  const sim = await matchSim();
  assert.equal(sim.rules.phase, PHASE.COUNTDOWN);
  steps(sim, 2.5, () => ({ player: C({ throttle: 1 }) }));
  assert.ok(sim.cars[0].velocity.length() < 0.2, 'car moved during countdown');
  steps(sim, 0.8, idle);
  assert.equal(sim.rules.phase, PHASE.PLAYING);
  assert.equal(sim.rules.timeRemaining, 300);
  steps(sim, 4, () => ({ player: C({ throttle: 1, boost: true }) }));
  assert.ok(sim.rules.clockRunning && sim.rules.timeRemaining < 300, `clock ${sim.rules.timeRemaining}`);
  sim.dispose();
});

test('goal counts only after the whole ball crosses the line, then kickoff resets', async () => {
  const sim = await matchSim();
  steps(sim, 3.2, idle);
  clearCars(sim);
  const b = sim.dims.b;
  sim.ball.reset({ x: 0, y: 2, z: -(b - 5) }, { x: 0, y: 0, z: -8 });
  let goal = null, partial = false;
  sim.events.on('goal', (e) => (goal = e));
  steps(sim, 2, idle, () => {
    const z = sim.ball.position.z;
    if (z < -b && z > -(b + sim.ball.radius) && !goal) {
      partial = true;
      assert.equal(sim.rules.score.blue, 0, 'goal counted while the ball was on the line');
    }
  });
  assert.ok(partial, 'ball never sat on the line');
  assert.ok(goal, 'goal not detected');
  assert.deepEqual(sim.rules.score, { blue: 1, orange: 0 });
  assert.equal(sim.rules.phase, PHASE.GOAL);
  steps(sim, 3.2, idle);
  assert.equal(sim.rules.phase, PHASE.COUNTDOWN);
  assert.ok(sim.ball.enabled && Math.hypot(sim.ball.position.x, sim.ball.position.z) < 0.01, 'ball not at center');
  for (const car of sim.cars) assert.ok(Math.abs(car.position.z) > 15, `car not at kickoff spot ${car.position.z}`);
  sim.dispose();
});

test('ball hitting the post is not a goal', async () => {
  const sim = await matchSim();
  steps(sim, 3.2, idle);
  clearCars(sim);
  const { b, hg } = sim.dims;
  sim.ball.reset({ x: hg + 0.6, y: 2, z: -(b - 6) }, { x: 0, y: 0, z: -15 });
  steps(sim, 2, idle);
  assert.deepEqual(sim.rules.score, { blue: 0, orange: 0 });
  assert.ok(sim.ball.velocity.z > 0 || sim.ball.position.z > -b, 'ball should bounce back off the post');
  sim.dispose();
});

test('tie at 0:00 -> golden goal overtime; overtime goal ends the match', async () => {
  const sim = await matchSim();
  steps(sim, 3.2, idle);
  clearCars(sim);
  const r = sim.rules;
  r.clockRunning = true;
  r.timeRemaining = 0.05;
  steps(sim, 0.3, idle);
  assert.ok(r.overtime, 'overtime not started');
  assert.equal(r.phase, PHASE.COUNTDOWN);
  steps(sim, 3.2, idle);
  clearCars(sim);
  sim.ball.reset({ x: 0, y: 2, z: sim.dims.b - 4 }, { x: 0, y: 0, z: 10 });
  steps(sim, 1.5, idle);
  assert.equal(r.score.orange, 1);
  steps(sim, 3.5, idle);
  assert.equal(r.phase, PHASE.ENDED);
  assert.equal(r.winner, 'orange');
  sim.dispose();
});

test('zero-second rule: the match ends when the airborne ball lands', async () => {
  const sim = await matchSim();
  steps(sim, 3.2, idle);
  clearCars(sim);
  const r = sim.rules;
  r.score.blue = 1;
  r.clockRunning = true;
  r.timeRemaining = 0.02;
  sim.ball.reset({ x: 0, y: 8, z: 0 });
  steps(sim, 0.4, idle);
  assert.equal(r.phase, PHASE.PLAYING, 'match ended while the ball was in the air');
  steps(sim, 2.5, idle);
  assert.equal(r.phase, PHASE.ENDED);
  assert.equal(r.winner, 'blue');
  sim.dispose();
});

test('boost pads refill and respawn', async () => {
  const sim = await createSim();
  sim.ball.setEnabled(false);
  const car = sim.cars[0];
  const pad = sim.boostPads.pads.find((p) => !p.big && Math.abs(p.x) < 0.01 && p.z > 5 && p.z < 15);
  assert.ok(pad, 'expected a small pad on the center line');
  place(car, 0, pad.z + 6, 0, 20);
  steps(sim, 1.2, () => ({ player: C({ throttle: 1 }) }));
  assert.ok(Math.abs(car.boost - 32) < 0.2, `boost ${car.boost}`);
  assert.equal(pad.active, false);
  steps(sim, 4.1, idle);
  assert.equal(pad.active, true);
  sim.dispose();
});

test('training: a goal is counted and the ball respawns', async () => {
  const sim = await createSim();
  sim.cars[0].reset({ x: 25, z: 25 }, 0);
  sim.ball.reset({ x: 0, y: 2, z: -(sim.dims.b - 4) }, { x: 0, y: 0, z: -10 });
  steps(sim, 1.5, idle);
  assert.equal(sim.rules.trainingGoals, 1);
  steps(sim, 2.2, idle);
  assert.equal(sim.rules.phase, PHASE.PLAYING);
  assert.ok(sim.ball.enabled && Math.abs(sim.ball.position.z) < 0.01);
  sim.dispose();
});
