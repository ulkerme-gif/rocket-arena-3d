import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanInput, cleanName, asPacket } from '../src/net/protocol.js';
import {
  ROOM_CODE_LENGTH, generateRoomCode, normalizeRoomCode, roomCodeProblem, peerIdForRoom, inviteLink, codeFromLocation,
} from '../src/net/roomCode.js';
import { seeded } from './helpers.js';

test('input axes are clamped, invalid controls discarded and new metadata validated', () => {
  const result = cleanInput({ throttle: 999, steer: -6, pitch: 'NaN', boost: true, jump: 1,
    sequence: 12, timestamp: 1700000000000 });
  assert.deepEqual(result, { throttle: 1, steer: -1, pitch: 0, yaw: 0, roll: 0,
    jump: false, boost: true, handbrake: false, sequence: 12, timestamp: 1700000000000 });
});
test('invalid, replay-like and unsafe sequence numbers are rejected', () => {
  for (const sequence of [0, -1, '12', 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.equal(cleanInput({ sequence }).sequence, null);
  }
});
test('input does not accept a client-supplied position', () => {
  assert.equal('position' in cleanInput({ sequence: 1, position: { x: 999, y: 999, z: 999 } }), false);
});
test('player names are length-limited and stripped of markup', () => {
  assert.equal(cleanName('<script>alert</script>'), 'scriptalert/script');
  assert.equal(cleanName('X'.repeat(100)).length, 24);
  assert.equal(cleanName('   '), 'Oyuncu');
});
test('packets: objects pass through, JSON strings are parsed, junk returns null', () => {
  assert.deepEqual(asPacket({ type: 'input' }), { type: 'input' });
  assert.deepEqual(asPacket('{"type":"join"}'), { type: 'join' });
  for (const junk of ['{', '[1]', 'x'.repeat(5000), null, 7, []]) assert.equal(asPacket(junk), null);
});

test('room codes are short, typeable and unambiguous', () => {
  const random = seeded(42);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const code = generateRoomCode(random);
    assert.equal(code.length, ROOM_CODE_LENGTH);
    assert.equal(normalizeRoomCode(code), code);
    assert.doesNotMatch(code, /[01OIL]/);
    seen.add(code);
  }
  assert.ok(seen.size > 480, 'codes rarely repeat');
});
test('typed codes are normalised; typos get a helpful reason', () => {
  assert.equal(normalizeRoomCode(' k7m-2 '), 'K7M2');
  assert.equal(normalizeRoomCode('k7 m2'), 'K7M2');
  for (const bad of ['', 'K7M', 'K7M22', 'K0M2', 'KOM2', 'K1M2', '../x', null]) assert.equal(normalizeRoomCode(bad), null);
  assert.match(roomCodeProblem(''), /oda kodunu yaz/);
  assert.match(roomCodeProblem('K7M'), /4 karakter/);
  assert.match(roomCodeProblem('K0M2'), /0, O, 1, I ve L/);
  assert.match(roomCodeProblem('K?M2'), /harf ve rakam/);
  assert.equal(roomCodeProblem('k7m2'), null);
});
test('room code maps to one broker id and an invite link round-trips', () => {
  assert.equal(peerIdForRoom('k7m2'), 'rocket-arena-3d-K7M2');
  assert.throws(() => peerIdForRoom('nope'), /Geçersiz/);
  const page = { href: 'https://kullanici.github.io/rocket-arena-3d/online.html?eski=1#x' };
  const link = inviteLink('k7m2', page);
  assert.equal(link, 'https://kullanici.github.io/rocket-arena-3d/online.html?oda=K7M2');
  assert.equal(codeFromLocation({ href: link }), 'K7M2');
  assert.equal(codeFromLocation({ href: 'https://x.github.io/online.html?oda=0000' }), null);
  assert.equal(codeFromLocation({ href: 'https://x.github.io/online.html' }), null);
});
