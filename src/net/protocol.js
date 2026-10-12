/**
 * Host-side input protocol and validation (formerly server/protocol.js).
 * The host tablet never accepts positions or velocities from a guest, only controls.
 */
const AXES = ['throttle', 'steer', 'pitch', 'yaw', 'roll'];
const BUTTONS = ['jump', 'boost', 'handbrake'];

export const ZERO_INPUT = Object.freeze(
  Object.fromEntries([...AXES.map(k => [k, 0]), ...BUTTONS.map(k => [k, false])])
);

export function cleanInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ...ZERO_INPUT, sequence: null, timestamp: null };
  }
  const out = {};
  for (const k of AXES) {
    const n = Number(data[k]);
    out[k] = Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  }
  for (const k of BUTTONS) {
    out[k] = data[k] === true;
  }

  const seq = data.sequence;
  out.sequence = Number.isSafeInteger(seq) && seq > 0 ? seq : null;

  const ts = data.timestamp;
  out.timestamp = Number.isSafeInteger(ts) && ts >= 0 ? ts : null;

  return out;
}

export function cleanName(name) {
  if (typeof name !== 'string') return 'Oyuncu';
  return name.replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 24) || 'Oyuncu';
}

/** Accepts an already-decoded object (PeerJS JSON channel) or a JSON string. */
export function asPacket(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  if (typeof data !== 'string' || data.length > 4096) return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
