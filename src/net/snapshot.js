/**
 * Wire format between the host tablet and the guest.
 * Simulation.getState() is ~6 KB of JSON; the guest only needs ~0.8 KB of it.
 * Boost pad positions never change during a match, so they are sent once
 * (padLayout, inside the "match is starting" message) and each snapshot only
 * carries a string of active flags.
 */
const round = (digits) => {
  const k = 10 ** digits;
  return (n) => (Number.isFinite(n) ? Math.round(n * k) / k : 0);
};
const r2 = round(2);
const r3 = round(3);
const r4 = round(4);
const vec = (v, r) => ({ x: r(v.x), y: r(v.y), z: r(v.z) });

/** [x, z, big] per pad, in index order. */
export function padLayoutOf(state) {
  return state.boostPads.map((p) => [r2(p.position.x), r2(p.position.z), p.big ? 1 : 0]);
}

export function compactState(state, lastProcessedSequence = 0) {
  return {
    tick: state.tick,
    phase: state.phase,
    countdown: Number.isFinite(state.countdown) ? r2(state.countdown) : null,
    score: { blue: state.score.blue, orange: state.score.orange },
    timeRemaining: r2(state.timeRemaining),
    isOvertime: !!state.isOvertime,
    overtimeElapsed: r2(state.overtimeElapsed),
    lastProcessedSequence,
    ball: {
      position: vec(state.ball.position, r3),
      velocity: vec(state.ball.velocity, r2),
      radius: state.ball.radius,
      enabled: !!state.ball.enabled,
    },
    cars: state.cars.map((c) => ({
      id: c.id,
      team: c.team,
      position: vec(c.position, r3),
      quaternion: { x: r4(c.quaternion.x), y: r4(c.quaternion.y), z: r4(c.quaternion.z), w: r4(c.quaternion.w) },
      velocity: vec(c.velocity, r2),
      boost: Math.round(c.boost),
      onGround: !!c.onGround,
      isBoosting: !!c.isBoosting,
      isSupersonic: !!c.isSupersonic,
    })),
    pads: state.boostPads.map((p) => (p.active ? '1' : '0')).join(''),
  };
}

/** Rebuilds the boostPads array RemoteGameView expects from the layout + active flags. */
export function expandState(compact, padLayout) {
  const flags = typeof compact.pads === 'string' ? compact.pads : '';
  const layout = Array.isArray(padLayout) ? padLayout : [];
  return {
    ...compact,
    boostPads: layout.map(([x, z, big], index) => ({
      index,
      position: { x, y: 0, z },
      big: !!big,
      active: flags[index] !== '0',
      timer: 0,
    })),
  };
}
