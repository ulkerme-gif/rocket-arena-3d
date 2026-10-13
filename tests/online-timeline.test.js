import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotTimeline } from '../src/online/SnapshotTimeline.js';

const snap = (tick) => ({ tick, x: tick / 120 });
const xAt = (f) => f.a.x + (f.b.x - f.a.x) * f.alpha + f.extrapolationMs / 1000;

test('positions follow the host clock, not packet arrival: bursts and late packets do not stutter', () => {
  const t = new SnapshotTimeline({ tickRate: 120 });
  // 60 Hz snapshots (every 2 ticks); every 5th arrives 40 ms late and the next ones bunch up behind it.
  const arrivals = [];
  let lastArrival = 0;
  for (let i = 1; i <= 300; i++) {
    const hostMs = (i * 2 * 1000) / 120;
    const arrival = Math.max(lastArrival, hostMs + 10 + (i % 5 === 0 ? 40 : 0));
    lastArrival = arrival;
    arrivals.push({ tick: i * 2, arrival });
  }
  let p = 0, prev = null;
  const speeds = [];
  for (let now = 100; now < 4900; now += 16.7) {
    while (p < arrivals.length && arrivals[p].arrival <= now) { t.push(snap(arrivals[p].tick), arrivals[p].arrival); p++; }
    const f = t.sample(now);
    if (!f) continue;
    const x = xAt(f);
    if (prev !== null && now > 1500) speeds.push((x - prev) / 0.0167);
    prev = x;
  }
  const worst = Math.max(...speeds.map((v) => Math.abs(v - 1)));
  assert.ok(worst < 0.15, `speed never deviates more than 15 % (worst ${(worst * 100).toFixed(1)} %)`);
  assert.ok(t.delayMs >= 30 && t.delayMs <= 160, `buffer ${t.delayMs.toFixed(0)} ms`);
});

test('buffer is small on a clean network and grows with jitter', () => {
  const clean = new SnapshotTimeline();
  for (let i = 1; i <= 120; i++) clean.push(snap(i * 2), (i * 2 * 1000) / 120 + 8);
  const jittery = new SnapshotTimeline();
  for (let i = 1; i <= 120; i++) jittery.push(snap(i * 2), (i * 2 * 1000) / 120 + 8 + (i % 3) * 25);
  assert.ok(clean.delayMs < 45, `clean ${clean.delayMs}`);
  assert.ok(jittery.delayMs > clean.delayMs + 30, `jittery ${jittery.delayMs}`);
});

test('duplicates are ignored, extrapolation is capped, a rematch restarts the clock', () => {
  const t = new SnapshotTimeline({ tickRate: 120 });
  t.push(snap(100), 1000);
  t.push(snap(100), 1010);
  assert.equal(t.entries.length, 1);
  t.push(snap(102), 1017);
  const late = t.sample(5000); // nothing new for a long time
  assert.ok(late.extrapolationMs <= 100);
  t.push(snap(0), 5010); // new match: tick counter starts again
  assert.equal(t.entries.length, 1);
  assert.equal(t.sample(5011).a.tick, 0);
  t.clear();
  assert.equal(t.sample(6000), null);
});
