import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchHost } from '../src/net/MatchHost.js';
import { PROTOCOL_VERSION } from '../src/net/roomCode.js';
import { expandState } from '../src/net/snapshot.js';
import { initRapier, seeded, C } from './helpers.js';

/** A player handle whose inbox receives exactly what would cross the wire (JSON copies). */
function handle(name) {
  const inbox = [];
  return {
    name,
    inbox,
    send(msg) { inbox.push(JSON.parse(JSON.stringify(msg))); },
    last(type) { return inbox.filter((m) => m.type === type).at(-1); },
    count(type) { return inbox.filter((m) => m.type === type).length; },
  };
}

async function hostedRoom(teamSize = 1) {
  const RAPIER = await initRapier();
  const clock = { t: 0 };
  const rejected = [];
  const match = new MatchHost({
    RAPIER, roomCode: 'K7M2', teamSize, now: () => clock.t, random: seeded(3),
    onReject: (h, detail) => rejected.push([h.name, detail]),
  });
  const host = handle('host');
  match.join(host, 'Ev Sahibi', { local: true });
  return { match, host, clock, rejected };
}

const join = (match, guest, name = 'Misafir', version = PROTOCOL_VERSION) =>
  match.handlePacket(guest, { type: 'join', name, version });

function tick(match, clock, n, before) {
  for (let i = 0; i < n; i++) {
    before?.(i);
    clock.t += 1000 / 120;
    match.step();
  }
}

const humansIn = (roster) => roster.seats.filter((s) => s.name).map((s) => `${s.seat}:${s.name}`);

test('1v1 room: second player fills it and the match starts by itself; extra players and old versions are refused', async () => {
  const { match, host, rejected } = await hostedRoom(1);
  assert.equal(host.last('joined').playerId, 'blue-1');
  assert.equal(host.last('joined').host, true);
  assert.equal(host.last('joined').teamSize, 1);
  assert.equal(host.last('roomStatus').status, 'waiting');
  assert.equal(match.sim, null, 'no physics until the match starts');

  const oldApp = handle('old');
  join(match, oldApp, 'Eski', 1);
  assert.match(oldApp.last('error').detail, /sürümleri farklı/);

  const guest = handle('guest');
  join(match, guest);
  assert.equal(guest.last('joined').playerId, 'orange-1');
  assert.equal(guest.last('joined').host, false);
  const status = guest.last('roomStatus');
  assert.equal(status.status, 'playing');
  assert.equal(status.padLayout.length, 34);
  assert.deepEqual(humansIn(guest.last('roster')), ['blue-1:Ev Sahibi', 'orange-1:Misafir']);
  assert.equal(match.sim.cars.length, 2);
  assert.equal(match.sim.bots.size, 0, 'full room: no bots');

  const third = handle('third');
  join(match, third, 'Üçüncü');
  assert.equal(third.last('error').detail, 'Oda dolu.');
  assert.deepEqual(rejected.map(([who]) => who), ['old', 'third']);
  match.dispose();
});

test('3v3 room: players are balanced across teams, the host starts early and bots fill the gaps', async () => {
  const { match, host } = await hostedRoom(3);
  const guests = ['Ali', 'Ayşe', 'Can'].map((n) => handle(n));
  for (const g of guests) join(match, g, g.name);
  assert.deepEqual(guests.map((g) => g.last('joined').playerId), ['orange-1', 'blue-2', 'orange-2']);
  assert.equal(match.sim, null, 'still waiting: 4 of 6 seats taken');
  const roster = host.last('roster');
  assert.equal(roster.teamSize, 3);
  assert.equal(roster.seats.length, 6);
  assert.equal(roster.seats.filter((s) => !s.name).length, 2);

  // A guest cannot start the match; the host can.
  match.handlePacket(guests[0], { type: 'start' });
  assert.equal(match.sim, null);
  match.handlePacket(host, { type: 'start' });
  assert.ok(match.sim);
  assert.equal(match.sim.cars.length, 6);
  assert.deepEqual([...match.sim.bots.keys()].sort(), ['blue-3', 'orange-3']);
  for (const g of guests) assert.equal(g.last('roomStatus').status, 'playing');
  match.dispose();
});

test('mid-match: a newcomer takes over a bot seat, a leaver is replaced by a bot', async () => {
  const { match, host, clock } = await hostedRoom(2);
  match.handlePacket(host, { type: 'start' }); // host alone + 3 bots
  assert.equal(match.sim.bots.size, 3);
  tick(match, clock, 40);

  const late = handle('late');
  join(match, late, 'Geç Kalan');
  assert.equal(late.last('joined').playerId, 'orange-1');
  assert.equal(late.last('roomStatus').status, 'playing');
  assert.equal(late.last('roomStatus').padLayout.length, 34);
  assert.equal(late.count('snapshot'), 1, 'gets the current state immediately');
  assert.equal(match.sim.bots.has('orange-1'), false, 'bot handed over the wheel');
  assert.equal(match.sim.bots.size, 2);
  assert.match(host.last('notice').text, /Geç Kalan katıldı/);
  const simBefore = match.sim;

  match.handlePacket(late, { type: 'leave' });
  assert.equal(match.sim, simBefore, 'the match keeps going');
  assert.equal(match.sim.bots.has('orange-1'), true, 'a bot takes the empty seat');
  assert.match(host.last('notice').text, /Geç Kalan ayrıldı/);
  assert.deepEqual(humansIn(host.last('roster')), ['blue-1:Ev Sahibi']);
  match.dispose();
});

test('snapshots stream at 30 Hz, are compact, and acknowledge only inputs used by physics', async () => {
  const { match, host, clock } = await hostedRoom(1);
  const guest = handle('guest');
  join(match, guest);
  const before = guest.count('snapshot');
  tick(match, clock, 120); // one second of physics
  assert.equal(guest.count('snapshot') - before, 30);
  assert.equal(host.count('snapshot') - 1, 30, 'host HUD gets the same stream locally');

  const snap = guest.last('snapshot').state;
  const bytes = JSON.stringify(guest.last('snapshot')).length;
  assert.ok(bytes < 1500, `1v1 snapshot is ${bytes} bytes`);
  for (const key of ['tick', 'phase', 'score', 'timeRemaining', 'ball', 'cars', 'pads', 'lastProcessedSequence']) assert.ok(key in snap, key);
  const full = expandState(snap, guest.last('roomStatus').padLayout);
  assert.equal(full.boostPads.length, 34);
  assert.equal(typeof full.boostPads[0].position.x, 'number');
  assert.equal(full.cars.find((c) => c.id === 'orange-1').team, 'orange');

  match.handlePacket(guest, { type: 'input', controls: { sequence: 1, timestamp: 5, throttle: 1 } });
  tick(match, clock, 4);
  assert.equal(guest.last('snapshot').state.lastProcessedSequence, 1);
  assert.equal(host.last('snapshot').state.lastProcessedSequence, 0, 'each player gets their own ACK');
  match.handlePacket(guest, { type: 'input', controls: { sequence: 1, throttle: -1 } });
  assert.equal(match.playerFor(guest).input.throttle, 1, 'replayed sequence ignored');
  match.handlePacket(guest, { type: 'input', controls: { sequence: 2, position: { x: 99, y: 99, z: 99 } } });
  assert.equal('position' in match.playerFor(guest).input, false, 'positions never accepted');
  tick(match, clock, 4);
  assert.equal(guest.last('snapshot').state.lastProcessedSequence, 2);

  match.handlePacket(guest, { type: 'input', controls: { sequence: 3, throttle: 1 } });
  clock.t += 400;
  tick(match, clock, 8);
  assert.equal(guest.last('snapshot').state.lastProcessedSequence, 2, 'stale input (>300 ms) is replaced by neutral controls');
  match.dispose();
});

test('3v3 snapshot stays small enough for five guests on one tablet', async () => {
  const { match, clock } = await hostedRoom(3);
  const guest = handle('guest');
  join(match, guest);
  match.startMatch();
  tick(match, clock, 8);
  const bytes = JSON.stringify(guest.last('snapshot')).length;
  assert.ok(bytes < 2600, `3v3 snapshot is ${bytes} bytes`);
  assert.equal(guest.last('snapshot').state.cars.length, 6);
  match.dispose();
});

test('host and guest both drive; bots drive the rest', async () => {
  const { match, host, clock } = await hostedRoom(2);
  const guest = handle('guest');
  join(match, guest);
  match.handlePacket(host, { type: 'start' });
  const start = Object.fromEntries(match.sim.cars.map((c) => [c.id, { ...c.position }]));
  let seq = 0;
  tick(match, clock, 120 * 5, () => {
    match.setLocalControls(host, C({ throttle: 1 }));
    match.handlePacket(guest, { type: 'input', controls: { sequence: ++seq, throttle: 1 } });
  });
  const moved = (id) => {
    const p = match.sim.carById.get(id).position;
    return Math.hypot(p.x - start[id].x, p.z - start[id].z);
  };
  for (const id of ['blue-1', 'orange-1', 'blue-2', 'orange-2']) assert.ok(moved(id) > 3, `${id} moved ${moved(id).toFixed(1)} m`);
  match.setLocalControls(guest, C({ throttle: -1 }));
  assert.equal(match.playerFor(guest).input.throttle, 1, 'a guest cannot use the host-only local path');
  match.dispose();
});

test('only the host restarts a finished match; closed rooms accept nobody', async () => {
  const { match, host, clock } = await hostedRoom(1);
  const guest = handle('guest');
  join(match, guest);
  const sim = match.sim;
  match.handlePacket(host, { type: 'rematch' });
  assert.equal(match.sim, sim, 'no rematch while the match is still running');
  sim.rules._endMatch();
  assert.ok(['blue', 'orange'].includes(guest.last('matchEnd').result.winner));
  match.handlePacket(guest, { type: 'rematch' });
  assert.equal(match.sim, sim, 'guests cannot restart');
  match.handlePacket(host, { type: 'rematch' });
  assert.notEqual(match.sim, sim);
  assert.equal(match.sim.tick, 0);
  tick(match, clock, 4);
  assert.ok(guest.last('snapshot').state.tick >= 4);

  match.handlePacket(guest, { type: 'leave' });
  assert.equal(match.sim.bots.has('orange-1'), true);
  match.dispose();
  assert.equal(match.sim, null);
  join(match, handle('late'));
  assert.equal(match.players.length, 0);
});

test('garbage packets and floods are ignored without crashing the host', async () => {
  const { match, clock } = await hostedRoom(1);
  const guest = handle('guest');
  for (const junk of [null, 42, 'not json', '[1,2]', [], { type: 7 }, { type: 'input' }]) match.handlePacket(guest, junk);
  assert.equal(match.players.length, 1, 'nothing joined');
  join(match, guest);
  for (let seq = 1; seq <= 200; seq++) match.handlePacket(guest, { type: 'input', controls: { sequence: seq, throttle: 1 } });
  assert.equal(match.playerFor(guest).lastSequence, 150, 'at most 150 messages per second');
  clock.t += 1000;
  match.handlePacket(guest, { type: 'input', controls: { sequence: 201, steer: 'NaN', throttle: 1e9 } });
  assert.equal(match.playerFor(guest).lastSequence, 201);
  assert.equal(match.playerFor(guest).input.throttle, 1);
  assert.equal(match.playerFor(guest).input.steer, 0);
  match.dispose();
});
