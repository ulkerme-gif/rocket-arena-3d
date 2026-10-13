import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoom, joinHostedRoom, describePeerError, ConnectionLink } from '../src/net/PeerTransport.js';
import { PEER_ID_PREFIX, ROOM_CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from '../src/net/roomCode.js';
import { createFakeBroker, until, wait, keepAlive } from './fake-peer.js';
import { seeded } from './helpers.js';

test('host registers its room code on the broker and a guest joins with that code', async () => {
  const broker = createFakeBroker();
  const room = await HostedRoom.open({ Peer: broker.Peer, random: seeded(11) });
  try {
    assert.ok(normalizeRoomCode(room.code), `valid code: ${room.code}`);
    assert.equal(room.peer.id, PEER_ID_PREFIX + room.code);

    const hostSide = [];
    let hostLink = null;
    room.onConnection = (link) => { hostLink = link; link.onMessage = (m) => hostSide.push(m); };

    const guest = await joinHostedRoom({ Peer: broker.Peer, code: room.code.toLowerCase() });
    const guestSide = [];
    guest.link.onMessage = (m) => guestSide.push(m);
    await until(() => hostLink?.open);

    guest.link.send({ type: 'join', name: 'Misafir' });
    hostLink.send({ type: 'joined', playerId: 'orange-player' });
    await until(() => hostSide.length === 1 && guestSide.length === 1);
    assert.deepEqual(hostSide[0], { type: 'join', name: 'Misafir' });
    assert.equal(guestSide[0].playerId, 'orange-player');

    // Keepalive pings are link-level and never reach the game.
    guest.link.conn.send({ type: 'ping' });
    await wait(10);
    assert.equal(hostSide.length, 1);

    let guestClosed = null;
    guest.link.onClose = (reason) => { guestClosed = reason; };
    room.close();
    await until(() => guestClosed !== null);
    assert.equal(guest.link.open, false);
    guest.close();
  } finally {
    room.close();
  }
});

test('a taken room code is skipped and a fresh code is drawn', async () => {
  const broker = createFakeBroker();
  const first = generateRoomCode(seeded(5));
  broker.occupy(PEER_ID_PREFIX + first);
  const room = await HostedRoom.open({ Peer: broker.Peer, random: seeded(5) });
  try {
    assert.notEqual(room.code, first);
    assert.equal(broker.created.length, 2, 'one retry after unavailable-id');
    assert.equal(broker.created[0].destroyed, true, 'failed attempt is cleaned up');
  } finally {
    room.close();
  }
});

test('joining a code nobody hosts fails with a clear Turkish message', async () => {
  const broker = createFakeBroker();
  await assert.rejects(
    joinHostedRoom({ Peer: broker.Peer, code: 'K7M2' }),
    (error) => error.type === 'peer-unavailable' && /bulunamadı/.test(describePeerError(error)),
  );
  assert.ok(broker.created.every((peer) => peer.destroyed), 'guest peer is destroyed after failure');
});

test('broker outage and invalid codes are reported before any game starts', async () => {
  const broker = createFakeBroker({ offline: true });
  await assert.rejects(HostedRoom.open({ Peer: broker.Peer }), (e) => /Eşleştirme servisine/.test(describePeerError(e)));
  await assert.rejects(joinHostedRoom({ Peer: broker.Peer, code: 'OOOO' }), /Geçersiz oda kodu/);
  assert.match(describePeerError({ type: 'browser-incompatible' }), /WebRTC/);
  assert.match(describePeerError({ type: 'something-new' }), /Tekrar dene/);
});

test('a silent peer is dropped by the keepalive watchdog; an active one is kept', async () => {
  const broker = createFakeBroker();
  const room = await HostedRoom.open({ Peer: broker.Peer, linkOptions: { silenceMs: 120, pingMs: 30 } });
  try {
    let hostLink = null;
    room.onConnection = (link) => { hostLink = link; };
    // The guest pings every 30 ms, so the host must keep the link open well past 120 ms.
    const guest = await joinHostedRoom({ Peer: broker.Peer, code: room.code, linkOptions: { silenceMs: 120, pingMs: 30 } });
    await until(() => hostLink?.open);
    await wait(260);
    assert.equal(hostLink.open, true, 'pings keep an idle link alive');
    assert.equal(guest.link.open, true);

    // Now the guest goes silent (Safari suspended): stop its timers without closing the channel.
    clearInterval(guest.link.watch);
    let reason = null;
    hostLink.onClose = (r) => { reason = r; };
    await until(() => reason !== null, 1500);
    assert.equal(reason, 'timeout');
    assert.equal(room.links.size, 0, 'host forgets the dropped link');
    guest.close();
  } finally {
    room.close();
  }
});

test('ConnectionLink never throws on send after close and reports failed ICE', async () => {
  const handlers = new Map();
  const pcHandlers = new Map();
  const conn = {
    peer: 'x', open: true,
    on(type, fn) { handlers.set(type, fn); },
    send() { throw new Error('channel closed'); },
    close() { this.open = false; },
    peerConnection: { iceConnectionState: 'new', addEventListener(type, fn) { pcHandlers.set(type, fn); } },
  };
  const link = new ConnectionLink(conn, { silenceMs: 10_000, pingMs: 10_000 });
  let reason = null;
  link.onClose = (r) => { reason = r; };
  assert.equal(link.send({ type: 'input' }), false);
  assert.equal(reason, 'error');
  assert.equal(link.send({ type: 'input' }), false);

  const link2 = new ConnectionLink({ ...conn, open: true, send() {} }, { silenceMs: 10_000, pingMs: 10_000 });
  let reason2 = null;
  link2.onClose = (r) => { reason2 = r; };
  conn.peerConnection.iceConnectionState = 'failed';
  pcHandlers.get('iceconnectionstatechange')();
  assert.equal(reason2, 'webrtc');
});

test('room code alphabet avoids characters that are easy to mistype', () => {
  for (const ch of '01OIL') assert.equal(ROOM_CODE_ALPHABET.includes(ch), false, ch);
});

test('host that never answers vs. answered-but-no-network-path are told apart', async (t) => {
  t.after(keepAlive());
  const asleep = createFakeBroker({ hostAnswers: false });
  const room1 = await HostedRoom.open({ Peer: asleep.Peer });
  const stages = [];
  await assert.rejects(
    joinHostedRoom({ Peer: asleep.Peer, code: room1.code, linkOptions: { openTimeoutMs: 80 }, onProgress: (s) => stages.push(s) }),
    (e) => e.type === 'no-answer' && /yanıt vermedi/.test(describePeerError(e)),
  );
  assert.deepEqual(stages, ['searching']);
  room1.close();

  const blocked = createFakeBroker({ directPath: false });
  const room2 = await HostedRoom.open({ Peer: blocked.Peer });
  const stages2 = [];
  let caught = null;
  await joinHostedRoom({ Peer: blocked.Peer, code: room2.code, linkOptions: { openTimeoutMs: 80 }, onProgress: (s) => stages2.push(s) })
    .catch((e) => { caught = e; });
  assert.equal(caught?.type, 'ice-timeout');
  assert.deepEqual(stages2, ['searching', 'found'], 'the room was found before the path failed');
  assert.match(describePeerError(caught, { turnConfigured: false }), /TURN/);
  assert.match(describePeerError(caught, { turnConfigured: true }), /BAĞLANTIYI TEST ET/);
  room2.close();
});

test('PeerJS gets our ICE list (STUN + optional TURN), never its discontinued TURN servers', async (t) => {
  t.after(keepAlive());
  const broker = createFakeBroker();
  const ice = [{ urls: ['stun:stun.example:3478'] }, { urls: ['turn:t.example:3478?transport=udp'], username: 'u', credential: 'p' }];
  const room = await HostedRoom.open({ Peer: broker.Peer, iceServers: ice });
  const guest = await joinHostedRoom({ Peer: broker.Peer, code: room.code, iceServers: ice });
  for (const peer of broker.created) {
    assert.deepEqual(peer.options.config.iceServers, ice);
    assert.doesNotMatch(JSON.stringify(peer.options), /peerjs\.com/);
  }
  guest.close();
  room.close();
});
