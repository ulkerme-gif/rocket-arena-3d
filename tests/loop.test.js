import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAccumulator } from '../src/core/GameLoop.js';
import { evalCurve } from '../src/core/math.js';

test('fixed-step accumulator', () => {
  let r = advanceAccumulator(0, 1 / 60, 1 / 120, 12);
  assert.equal(r.steps, 2);
  r = advanceAccumulator(0, 0.004, 1 / 120, 12);
  assert.equal(r.steps, 0);
  assert.ok(r.alpha > 0.4 && r.alpha < 0.5);
  r = advanceAccumulator(0, 5, 1 / 120, 12);
  assert.equal(r.steps, 12);
  assert.equal(r.accumulator, 0);
});

test('piecewise-linear curves', () => {
  const c = [[0, 16], [14, 1.6], [14.1, 0]];
  assert.equal(evalCurve(c, -1), 16);
  assert.ok(Math.abs(evalCurve(c, 7) - 8.8) < 1e-9);
  assert.equal(evalCurve(c, 20), 0);
});
