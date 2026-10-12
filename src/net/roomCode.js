/**
 * Room codes for the tablet-hosted (peer-to-peer) online mode.
 * The code is what players type; it maps 1:1 to the host tablet's PeerJS id.
 * Characters that are easy to confuse on a touch keyboard (0/O, 1/I/L) never appear.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
/** Shared PeerJS namespace prefix: keeps our rooms apart from other apps on the public broker. */
export const PEER_ID_PREFIX = 'rocket-arena-3d-';
/** Bumped whenever host and guest stop understanding each other's messages. */
export const PROTOCOL_VERSION = 2;

export function generateRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

/** Accepts " k7m-2 " style input. Returns the canonical code, or null if it can never be valid. */
export function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[\s_-]+/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Explains why a typed code is invalid, in the UI's language. */
export function roomCodeProblem(value) {
  const code = (typeof value === 'string' ? value : '').toUpperCase().replace(/[\s_-]+/g, '');
  if (!code) return 'Önce arkadaşının verdiği oda kodunu yaz.';
  if (code.length !== ROOM_CODE_LENGTH) return `Oda kodu ${ROOM_CODE_LENGTH} karakter olmalı.`;
  if (/[01OIL]/.test(code)) return 'Oda kodlarında 0, O, 1, I ve L kullanılmaz. Kodu tekrar kontrol et.';
  if (!normalizeRoomCode(code)) return 'Oda kodu sadece harf ve rakamlardan oluşur.';
  return null;
}

export function peerIdForRoom(code) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error('Geçersiz oda kodu.');
  return PEER_ID_PREFIX + normalized;
}

/** Shareable link that opens the online page with the code already filled in. */
export function inviteLink(code, place = globalThis.location) {
  const url = new URL(place.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('oda', normalizeRoomCode(code) ?? '');
  return url.toString();
}

export function codeFromLocation(place = globalThis.location) {
  try {
    return normalizeRoomCode(new URL(place.href).searchParams.get('oda') ?? '');
  } catch {
    return null;
  }
}
