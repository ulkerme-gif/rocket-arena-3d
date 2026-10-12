/**
 * Production smoke check run by GitHub Actions after `npm run build`.
 * 1) The built site contains both pages, their assets and the on-demand PeerJS chunk.
 * 2) A full room runs end to end without a server: a host tablet (MatchHost) and two
 *    guests connect through the PeerTransport layer (in-memory PeerJS stand-in),
 *    a 2v2 match starts with a bot in the empty seat, inputs are acknowledged,
 *    and a guest leaving hands the seat to a bot.
 * This is not a WebGL/browser test.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { MatchHost } from '../../src/net/MatchHost.js';
import { HostedRoom, joinHostedRoom } from '../../src/net/PeerTransport.js';
import { PROTOCOL_VERSION } from '../../src/net/roomCode.js';
import { createFakeBroker, until } from '../fake-peer.js';

const dist = new URL('../../dist/', import.meta.url);
for (const page of ['index.html', 'online.html']) {
  assert.ok(existsSync(new URL(page, dist)), `dist/${page} missing — run npm run build first`);
  const html = readFileSync(new URL(page, dist), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+)"/g)) {
    assert.ok(existsSync(new URL(asset, dist)), `${page} references missing ${asset}`);
  }
}
const chunks = readdirSync(new URL('assets/', dist)).filter((f) => f.endsWith('.js'));
assert.ok(chunks.some((f) => readFileSync(new URL(`assets/${f}`, dist), 'utf8').includes('0.peerjs.com')), 'PeerJS chunk not bundled');
console.log(`SMOKE: build ok (${chunks.length} JS chunks)`);

await RAPIER.init();
const broker = createFakeBroker();
const room = await HostedRoom.open({ Peer: broker.Peer });
const local = { inbox: [], send(m) { this.inbox.push(m); } };
const match = new MatchHost({ RAPIER, roomCode: room.code, teamSize: 2, onReject: (link) => link.close('rejected') });
room.onConnection = (link) => {
  link.onMessage = (data) => match.handlePacket(link, data);
  link.onClose = () => match.leave(link);
};
match.join(local, 'Kurucu', { local: true });

async function guest(name) {
  const g = await joinHostedRoom({ Peer: broker.Peer, code: room.code });
  const inbox = [];
  g.link.onMessage = (m) => inbox.push(m);
  g.link.send({ type: 'join', name, version: PROTOCOL_VERSION });
  await until(() => inbox.some((m) => m.type === 'joined'));
  return { ...g, inbox, last: (type) => inbox.filter((m) => m.type === type).at(-1) };
}

const a = await guest('Ali');
const b = await guest('Ayşe');
assert.deepEqual([a.last('joined').playerId, b.last('joined').playerId], ['orange-1', 'blue-2']);
match.handlePacket(local, { type: 'start' });
assert.deepEqual([...match.sim.bots.keys()], ['orange-2'], 'one bot fills the empty seat');

let seq = 0;
const timer = setInterval(() => {
  for (let i = 0; i < 2; i++) match.step();
  a.link.send({ type: 'input', controls: { sequence: ++seq, timestamp: Date.now(), throttle: 1 } });
}, 1000 / 60);
try {
  await until(() => a.last('snapshot')?.state.lastProcessedSequence >= 5, 4000);
  await until(() => b.last('snapshot')?.state.tick >= 120, 4000);
  assert.equal(a.last('roomStatus').status, 'playing');
  assert.equal(b.last('snapshot').state.cars.length, 4);

  b.close();
  await until(() => match.sim?.bots.has('blue-2'), 4000);
  assert.equal(a.link.open, true, 'the others keep playing');
  console.log('SMOKE PASS: serverless room code, 2v2 with bot, guest inputs acknowledged, leaver replaced by a bot');
} finally {
  clearInterval(timer);
  a.close();
  match.dispose();
  room.close();
}
