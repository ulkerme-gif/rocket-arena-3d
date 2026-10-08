import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, cleanInput, cleanName, message } from '../server/protocol.js';

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
test('room codes are validated', () => {
  assert.equal(cleanCode('arena_12'), 'ARENA_12');
  for (const str of ['A', '../../etc', '', 'a/'.repeat(15)]) assert.equal(cleanCode(str), null);
});
test('player names are length-limited and stripped of markup', () => {
  assert.equal(cleanName('<script>alert</script>'), 'scriptalert/script');
  assert.equal(cleanName('X'.repeat(100)).length, 24);
});
test('bad WebSocket payload returns null', () => { assert.equal(message(Buffer.from('{')), null); });
