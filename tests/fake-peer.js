/**
 * In-memory stand-in for PeerJS + its cloud broker, for Node tests.
 * Mirrors the parts of the PeerJS API that src/net/PeerTransport.js uses:
 * Peer(id?, options) with open / error / connection / disconnected events,
 * peer.connect(id, options) returning a DataConnection with open / data / close,
 * and JSON-copied message delivery (like the 'json' serialization).
 */
class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return this; }
  off(type, fn) { this.handlers.get(type)?.delete(fn); return this; }
  emit(type, ...args) { for (const fn of [...(this.handlers.get(type) ?? [])]) fn(...args); }
}

const later = (fn, ms = 0) => setTimeout(fn, ms);
const error = (type) => Object.assign(new Error(type), { type });

/** Minimal RTCPeerConnection stand-in: only what ConnectionLink observes. */
class FakePeerConnection extends Emitter {
  constructor() { super(); this.signalingState = 'stable'; this.iceConnectionState = 'new'; }
  addEventListener(type, fn) { this.on(type, fn); }
  set(field, value, event) { this[field] = value; this.emit(event); }
}

/**
 * Options: offline (broker unreachable), hostAnswers (host replies to offers),
 * directPath (the data channel opens; false = NAT blocks every path).
 */
export function createFakeBroker({ delayMs = 1, offline = false, hostAnswers = true, directPath = true } = {}) {
  const peers = new Map();
  const created = [];
  let anon = 0;

  class FakeConnection extends Emitter {
    constructor(owner, remoteId, options = {}) {
      super();
      this.owner = owner;
      this.peer = remoteId;
      this.options = options;
      this.open = false;
      this.closed = false;
      this.other = null;
      this.dataChannel = { bufferedAmount: 0 };
      this.peerConnection = new FakePeerConnection();
      this.sent = [];
      owner.connections.add(this);
    }
    send(data) {
      if (!this.open) throw new Error('connection not open');
      const copy = JSON.parse(JSON.stringify(data));
      this.sent.push(copy);
      const target = this.other;
      later(() => { if (target?.open) target.emit('data', copy); }, delayMs);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.open = false;
      this.owner.connections.delete(this);
      this.emit('close');
      const other = this.other;
      if (other && !other.closed) later(() => other.close(), delayMs);
    }
  }

  class FakePeer extends Emitter {
    constructor(id, options) {
      super();
      if (id && typeof id === 'object') { options = id; id = undefined; }
      this.options = options;
      this.requestedId = id;
      this.id = null;
      this.destroyed = false;
      this.disconnected = false;
      this.connections = new Set();
      created.push(this);
      later(() => {
        if (this.destroyed) return;
        if (offline) { this.emit('error', error('network')); return; }
        if (id && peers.has(id)) { this.emit('error', error('unavailable-id')); return; }
        this.id = id ?? `anon-${++anon}`;
        peers.set(this.id, this);
        this.emit('open', this.id);
      }, delayMs);
    }

    connect(remoteId, options) {
      const conn = new FakeConnection(this, remoteId, options);
      later(() => {
        conn.peerConnection.set('signalingState', 'have-local-offer', 'signalingstatechange');
        const host = peers.get(remoteId);
        if (!host || host.destroyed) { this.emit('error', error('peer-unavailable')); return; }
        if (!hostAnswers) return; // host tab asleep / in another app: the offer is never answered
        const remote = new FakeConnection(host, this.id, options);
        remote.other = conn;
        conn.other = remote;
        host.emit('connection', remote);
        conn.peerConnection.set('signalingState', 'stable', 'signalingstatechange');
        if (!directPath) return; // answered, but no network path works (no TURN)
        later(() => {
          if (conn.closed || remote.closed) return;
          conn.open = true;
          remote.open = true;
          remote.emit('open');
          conn.emit('open');
        }, delayMs);
      }, delayMs);
      return conn;
    }

    reconnect() { this.disconnected = false; }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.id && peers.get(this.id) === this) peers.delete(this.id);
      for (const conn of [...this.connections]) conn.close();
    }
  }

  /** Occupies an id on the broker, as if another room already used that code. */
  function occupy(id) {
    const ghost = { destroyed: false, connections: new Set(), emit() {} };
    peers.set(id, ghost);
  }

  return { Peer: FakePeer, peers, created, occupy };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(predicate, timeoutMs = 2000, stepMs = 5) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await wait(stepMs);
  }
}

/** Transport timers are unref'd (they must never hold CI open), so tests that wait on them keep the loop alive. */
export function keepAlive() {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);
}
