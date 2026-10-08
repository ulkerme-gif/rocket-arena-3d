/**
 * Boost pads: pickup detection, refill amounts and respawn timers.
 * Pads are plain data so visuals and bots can read them.
 */
export class BoostPadSystem {
  constructor(layoutPads, padConfig, boostConfig) {
    this.cfg = padConfig;
    this.boostMax = boostConfig.max;
    this.pads = layoutPads.map((p) => ({
      index: p.index,
      x: p.x,
      z: p.z,
      big: p.big,
      radius: p.radius,
      active: true,
      timer: 0,
    }));
    this.onPickup = null; // (pad, car) => void
  }

  update(dt, cars) {
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) {
          pad.active = true;
          pad.timer = 0;
        }
      }
    }
    for (const car of cars) {
      if (car.boost >= this.boostMax) continue;
      const p = car.position;
      if (p.y > this.cfg.pickupHeight) continue;
      for (const pad of this.pads) {
        if (!pad.active) continue;
        const dx = p.x - pad.x, dz = p.z - pad.z;
        if (dx * dx + dz * dz > pad.radius * pad.radius) continue;
        const kind = pad.big ? this.cfg.big : this.cfg.small;
        car.addBoost(kind.amount);
        pad.active = false;
        pad.timer = kind.respawnTime;
        if (this.onPickup) this.onPickup(pad, car);
        if (car.boost >= this.boostMax) break;
      }
    }
  }

  reset() {
    for (const pad of this.pads) {
      pad.active = true;
      pad.timer = 0;
    }
  }
}
