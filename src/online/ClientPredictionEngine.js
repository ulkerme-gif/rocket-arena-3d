/**
 * Bounded CLIENT-SIDE VISUAL prediction, NOT a deterministic Rapier replay.
 * The server owns physics. On each snapshot discard server-acknowledged inputs
 * and estimate at most 100ms of movement for the local car from remaining inputs.
 * Jumping, walls, collision and steering physics are intentionally NOT predicted.
 */
export class ClientPredictionEngine {
  constructor(localCarId, { maxPredictionMs = 100 } = {}) {
    this.localCarId = localCarId;
    this.maxPredictionMs = maxPredictionMs;
    this.inputHistory = [];
    this.lastAck = 0;
  }

  reset() { this.inputHistory.length = 0; this.lastAck = 0; }

  recordInput(sequence, controls, dt = 1 / 30) {
    if (!Number.isSafeInteger(sequence) || sequence <= 0 || sequence <= this.lastAck) return;
    if (this.inputHistory.length && sequence <= this.inputHistory.at(-1).sequence) return;
    this.inputHistory.push({ sequence, controls: { ...controls }, dt: Math.max(0, Math.min(0.05, Number(dt) || 0)) });
    if (this.inputHistory.length > 12) this.inputHistory.shift();
  }

  reconcile(snapshot) {
    if (!snapshot || !Number.isSafeInteger(snapshot.lastProcessedSequence)) return;
    const ack = snapshot.lastProcessedSequence;
    if (ack < this.lastAck) return;
    this.lastAck = ack;
    this.inputHistory = this.inputHistory.filter(item => item.sequence > ack);
  }

  /** Predict position only. The authoritative quaternion stays unchanged. */
  estimate(car) {
    const p = car.position;
    const v = car.velocity;
    const q = car.quaternion;
    const result = { x: p.x, y: p.y, z: p.z };
    if (!this.inputHistory.length) return result;
    let vx = v.x, vy = v.y, vz = v.z;
    // Car forward = (0,0,-1) rotated by authoritative orientation.
    const fx = -2 * (q.x * q.z + q.w * q.y);
    const fy = -2 * (q.y * q.z - q.w * q.x);
    const fz = -1 + 2 * (q.x * q.x + q.y * q.y);
    let remaining = this.maxPredictionMs / 1000;
    for (const input of this.inputHistory) {
      if (remaining <= 0) break;
      const dt = Math.min(remaining, input.dt);
      const throttle = Number(input.controls.throttle) || 0;
      // Conservative speed correction for ground vehicles (no collision / rotation prediction).
      const accel = car.onGround ? (10 * throttle + (input.controls.boost ? 8 : 0)) : 0;
      vx += fx * accel * dt; vy += fy * accel * dt; vz += fz * accel * dt;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > 23) { vx *= 23 / speed; vy *= 23 / speed; vz *= 23 / speed; }
      result.x += vx * dt; result.y += vy * dt; result.z += vz * dt;
      remaining -= dt;
    }
    return result;
  }
}
