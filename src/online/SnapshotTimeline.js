/** Snapshot buffering for REMOTE entities, dependency-free for unit testing. */
export class SnapshotTimeline {
  constructor({ delayMs = 100, maxExtrapolationMs = 100, maxSnapshots = 12 } = {}) {
    this.delayMs = delayMs;
    this.maxExtrapolationMs = maxExtrapolationMs;
    this.maxSnapshots = maxSnapshots;
    this.entries = [];
  }

  clear() { this.entries.length = 0; }

  push(snapshot, receivedAt = Date.now()) {
    if (!snapshot || !Number.isSafeInteger(snapshot.tick)) return;
    const last = this.entries.at(-1);
    // Tick counters restart on rematch: clear old timeline.
    if (last && snapshot.tick < last.snapshot.tick) this.clear();
    if (this.entries.length && snapshot.tick <= this.entries.at(-1).snapshot.tick) return;
    this.entries.push({ snapshot, receivedAt });
    if (this.entries.length > this.maxSnapshots) this.entries.shift();
  }

  /** Returns 2 snapshot endpoints, interpolation fraction, and capped forward time. */
  sample(now = Date.now()) {
    if (!this.entries.length) return null;
    const renderAt = now - this.delayMs;
    const first = this.entries[0];
    if (renderAt <= first.receivedAt) {
      return { a: first.snapshot, b: first.snapshot, alpha: 0, extrapolationMs: 0 };
    }
    for (let i = 1; i < this.entries.length; i++) {
      const a = this.entries[i - 1], b = this.entries[i];
      if (renderAt <= b.receivedAt) {
        const duration = b.receivedAt - a.receivedAt;
        return { a: a.snapshot, b: b.snapshot, alpha: duration > 0 ? (renderAt - a.receivedAt) / duration : 1, extrapolationMs: 0 };
      }
    }
    const last = this.entries.at(-1);
    return { a: last.snapshot, b: last.snapshot, alpha: 1,
      extrapolationMs: Math.min(this.maxExtrapolationMs, Math.max(0, renderAt - last.receivedAt)) };
  }
}
