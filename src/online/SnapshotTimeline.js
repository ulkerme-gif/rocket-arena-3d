/**
 * Playback buffer for host snapshots (guest side), dependency-free for unit testing.
 *
 * Snapshots are placed on the HOST's simulation clock (tick / tickRate), not on
 * their arrival time, so Wi-Fi jitter and the host's bursty frame timing do not
 * turn into stutter. A playback clock runs at real-time speed a little behind the
 * newest snapshot; it is nudged (at most ±10 % speed) toward its target instead
 * of jumping, and the buffer grows or shrinks with the measured network jitter.
 */
export class SnapshotTimeline {
  constructor({
    tickRate = 120,
    minDelayMs = 30,
    maxDelayMs = 160,
    maxExtrapolationMs = 100,
    maxSnapshots = 40,
  } = {}) {
    this.tickRate = tickRate;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.maxExtrapolationMs = maxExtrapolationMs;
    this.maxSnapshots = maxSnapshots;
    this.entries = [];
    this._resetClock();
  }

  _resetClock() {
    this.offset = null;     // arrival time minus host time for the fastest recent packet
    this.jitter = 0;        // 95th percentile of lateness vs. that fastest packet (last ~2 s)
    this.lateness = [];
    this.intervalMs = 1000 / 30;
    this.playMs = null;     // current playback position on the host clock
    this.lastNow = null;
  }

  clear() { this.entries.length = 0; }

  /** Current buffering delay behind the newest snapshot, in ms. */
  get delayMs() {
    return Math.min(this.maxDelayMs, Math.max(this.minDelayMs, this.intervalMs * 1.5 + this.jitter * 1.2 + 8));
  }

  push(snapshot, receivedAt = now()) {
    if (!snapshot || !Number.isSafeInteger(snapshot.tick)) return;
    const last = this.entries.at(-1);
    // Tick counters restart on rematch: start a fresh timeline and clock.
    if (last && snapshot.tick < last.snapshot.tick) { this.clear(); this._resetClock(); }
    if (this.entries.length && snapshot.tick <= this.entries.at(-1).snapshot.tick) return;
    const hostMs = (snapshot.tick * 1000) / this.tickRate;
    const prev = this.entries.at(-1);
    if (prev) this.intervalMs += (Math.min(250, hostMs - prev.hostMs) - this.intervalMs) * 0.1;
    this.entries.push({ snapshot, hostMs });
    if (this.entries.length > this.maxSnapshots) this.entries.shift();

    const offset = receivedAt - hostMs;
    if (this.offset === null || offset < this.offset) this.offset = offset; // a faster packet: new floor
    else this.offset += (offset - this.offset) * 0.002;                      // slow drift if the path got slower
    // p95 instead of the maximum: one rare spike should not keep the whole game delayed.
    this.lateness.push(offset - this.offset);
    if (this.lateness.length > 120) this.lateness.shift();
    const sorted = [...this.lateness].sort((x, y) => x - y);
    this.jitter = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  }

  /** Returns 2 snapshot endpoints, interpolation fraction, and capped forward time. */
  sample(nowMs = now()) {
    if (!this.entries.length) return null;
    const target = nowMs - this.offset - this.delayMs;
    if (this.playMs === null || Math.abs(target - this.playMs) > 300) {
      this.playMs = target; // first frame, long pause or rematch: resync
    } else {
      const dt = Math.max(0, Math.min(100, nowMs - this.lastNow));
      const correction = Math.max(-0.1, Math.min(0.1, (target - this.playMs) / 400));
      this.playMs += dt * (1 + correction);
    }
    this.lastNow = nowMs;
    const t = this.playMs;

    const first = this.entries[0];
    if (t <= first.hostMs) return { a: first.snapshot, b: first.snapshot, alpha: 0, extrapolationMs: 0 };
    for (let i = 1; i < this.entries.length; i++) {
      const a = this.entries[i - 1], b = this.entries[i];
      if (t <= b.hostMs) {
        const span = b.hostMs - a.hostMs;
        return { a: a.snapshot, b: b.snapshot, alpha: span > 0 ? (t - a.hostMs) / span : 1, extrapolationMs: 0 };
      }
    }
    const lastEntry = this.entries.at(-1);
    return { a: lastEntry.snapshot, b: lastEntry.snapshot, alpha: 1,
      extrapolationMs: Math.min(this.maxExtrapolationMs, Math.max(0, t - lastEntry.hostMs)) };
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
