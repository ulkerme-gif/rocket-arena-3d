/** Server-side input protocol and validation; never accept positions/velocities from clients. */
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
  
  // Sequence and timestamp validation
  const seq = data.sequence;
  out.sequence = Number.isSafeInteger(seq) && seq > 0 ? seq : null;
  
  const ts = data.timestamp;
  out.timestamp = Number.isSafeInteger(ts) && ts >= 0 ? ts : null;
  
  return out;
}

export function cleanCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{3,14}$/.test(code) ? code.toUpperCase() : null;
}

export function cleanName(name) {
  if (typeof name !== 'string') return 'Oyuncu';
  return name.replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 24) || 'Oyuncu';
}

export function message(data) {
  try {
    if (typeof data === 'string') return JSON.parse(data);
    return JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
}
