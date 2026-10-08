import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientPredictionEngine } from '../src/online/ClientPredictionEngine.js';
import { SnapshotTimeline } from '../src/online/SnapshotTimeline.js';

const car = { position: { x: 0, y: 1, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
  velocity: { x: 0, y: 0, z: -10 }, onGround: true };

test('prediction records input and removes acknowledged history', () => {
  const p = new ClientPredictionEngine('blue-player');
  p.recordInput(1, { throttle: 1 }, 1 / 30);
  p.recordInput(2, { throttle: 1 }, 1 / 30);
  p.recordInput(2, { throttle: 1 }, 1 / 30); // duplicate ignored
  assert.deepEqual(p.inputHistory.map(i => i.sequence), [1, 2]);
  p.reconcile({ lastProcessedSequence: 1 });
  assert.deepEqual(p.inputHistory.map(i => i.sequence), [2]);
  p.reconcile({ lastProcessedSequence: 0 }); // stale ACK ignored
  assert.deepEqual(p.inputHistory.map(i => i.sequence), [2]);
  p.reconcile({ lastProcessedSequence: 2 });
  assert.equal(p.inputHistory.length, 0);
});

test('local visual prediction is bounded and resets', () => {
  const p = new ClientPredictionEngine('blue-player');
  for (let i = 1; i <= 12; i++) p.recordInput(i, { throttle: 1 }, 0.05);
  const result = p.estimate(car);
  assert.ok(result.z < -0.9 && result.z > -1.2, `Expected around 1 meter; got ${result.z}`);
  assert.deepEqual(p.estimate(car), result);
  p.reset();
  assert.deepEqual(p.estimate(car), car.position);
});

test('timeline interpolates between snapshots and caps extrapolation at 100ms', () => {
  const t = new SnapshotTimeline({ delayMs: 0 });
  t.push({ tick: 1 }, 1000);
  t.push({ tick: 4 }, 1050);
  const frame = t.sample(1025);
  assert.equal(frame.a.tick, 1);
  assert.equal(frame.b.tick, 4);
  assert.equal(frame.alpha, 0.5);
  assert.equal(t.sample(1075).extrapolationMs, 25);
  assert.equal(t.sample(1400).extrapolationMs, 100);
});

test('timeline ignores duplicate snapshots and resets on rematch tick restart', () => {
  const t = new SnapshotTimeline({ delayMs: 0 });
  t.push({ tick: 100 }, 1000);
  t.push({ tick: 100 }, 1010);
  assert.equal(t.entries.length, 1);
  t.push({ tick: 0 }, 1020);
  assert.equal(t.entries.length, 1);
  assert.equal(t.sample(2000).a.tick, 0);
});
