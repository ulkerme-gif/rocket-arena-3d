import test from 'node:test';
import assert from 'node:assert/strict';
import { TURN, STUN_URLS, turnHost, hasTurn, iceServers } from '../src/config/network.js';
import { probeIce, probeBroker, describeNetwork } from '../src/net/networkCheck.js';
import { peerOptions } from '../src/net/PeerTransport.js';
import { createFakeBroker } from './fake-peer.js';

test('TURN server field accepts what the ExpressTURN dashboard shows', () => {
  assert.equal(turnHost('turn.example.com:3478'), 'turn.example.com:3478');
  assert.equal(turnHost('turn:relay.example.com:3478?transport=udp'), 'relay.example.com:3478');
  assert.equal(turnHost(' relay.example.com '), 'relay.example.com:3478');
  for (const bad of ['', 'https://x.com/a', 'a b', null]) assert.equal(turnHost(bad), null);
});

test('ICE list: STUN always, TURN only when all three fields are filled', () => {
  assert.deepEqual(iceServers({ server: '', username: '', password: '' }), [{ urls: [...STUN_URLS] }]);
  assert.equal(hasTurn({ server: 'x.example:3478', username: 'u', password: '' }), false);
  const withTurn = iceServers({ server: 'x.example:3478', username: ' u ', password: ' p ' });
  assert.deepEqual(withTurn[1], { urls: ['turn:x.example:3478?transport=udp', 'turn:x.example:3478?transport=tcp'], username: 'u', credential: 'p' });
  assert.equal(typeof TURN.server, 'string', 'config file keeps the three fields');
  assert.deepEqual(peerOptions(withTurn).config.iceServers, withTurn);
});

function fakeRTC(candidates) {
  return class {
    constructor(config) { this.config = config; this.closed = false; }
    createDataChannel() {}
    async createOffer() { return { type: 'offer', sdp: '' }; }
    async setLocalDescription() {
      let i = 0;
      const next = () => {
        const c = candidates[i++];
        this.onicecandidate?.({ candidate: c === undefined ? null : c });
        if (c !== undefined) setTimeout(next, 1);
      };
      setTimeout(next, 1);
    }
    close() { this.closed = true; }
  };
}

test('network check reports direct (STUN) and relay (TURN) paths from gathered candidates', async () => {
  const both = await probeIce({ RTCPeerConnection: fakeRTC([{ type: 'host' }, { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ srflx' }, { type: 'relay' }]), iceServers: [] });
  assert.deepEqual(both, { supported: true, host: true, srflx: true, relay: true });
  const hostOnly = await probeIce({ RTCPeerConnection: fakeRTC([{ type: 'host' }]), iceServers: [] });
  assert.equal(hostOnly.srflx, false);
  assert.equal((await probeIce({ RTCPeerConnection: undefined })).supported, false);

  assert.match(describeNetwork({ broker: true, ice: hostOnly }, { turnConfigured: false }), /✗ Bu ağ doğrudan/);
  assert.match(describeNetwork({ broker: true, ice: hostOnly }, { turnConfigured: false }), /TURN\) ayarlı değil/);
  assert.match(describeNetwork({ broker: true, ice: both }, { turnConfigured: true }), /TURN\) çalışıyor/);
  assert.match(describeNetwork({ broker: true, ice: { ...both, relay: false } }, { turnConfigured: true }), /network\.js/);
  assert.match(describeNetwork({ broker: false, ice: both }, { turnConfigured: true }), /Eşleştirme servisine ulaşılamıyor/);
});

test('broker check uses a throwaway peer and cleans up', async () => {
  const ok = createFakeBroker();
  assert.equal(await probeBroker({ Peer: ok.Peer }), true);
  assert.ok(ok.created.every((p) => p.destroyed));
  assert.equal(await probeBroker({ Peer: createFakeBroker({ offline: true }).Peer }), false);
});
