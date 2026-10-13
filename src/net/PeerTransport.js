import { generateRoomCode, peerIdForRoom } from './roomCode.js';
import { hasTurn, iceServers as configuredIceServers } from '../config/network.js';

/**
 * WebRTC transport built on PeerJS.
 *
 * PeerJS' free public broker (0.peerjs.com) is only used so the tablets can
 * find each other and exchange connection details. After that, every game
 * message travels directly between the tablets over a WebRTC data channel,
 * or through the TURN relay from src/config/network.js when a network blocks
 * direct paths. (PeerJS' own free TURN servers were shut down, so its built-in
 * ICE list is replaced here.)
 *
 * The Peer class is injected so the logic can be unit-tested in Node.
 */
/** Fresh PeerJS options; our ICE list replaces PeerJS' default (whose TURN servers are gone). */
export function peerOptions(iceServers = configuredIceServers()) {
  return { debug: 0, config: { iceServers, sdpSemantics: 'unified-plan' } };
}
const CHANNEL_OPTIONS = Object.freeze({ reliable: true, serialization: 'json', label: 'rocket-arena' });

export async function loadPeerClass() {
  const mod = await import('peerjs');
  return mod.Peer ?? mod.default;
}

const DIRECT_FAILED_NO_TURN =
  'Oda bulundu ama tabletler birbirine bağlanamadı. Farklı ağlardaysanız (mobil veri, başka ev) aracı sunucu (TURN) ayarı gerekir. '
  + "Aynı Wi-Fi'daysanız modem cihazların birbirini görmesini engelliyor olabilir. BAĞLANTIYI TEST ET'e bas.";
const DIRECT_FAILED_WITH_TURN =
  "Oda bulundu ama bağlantı kurulamadı. İki tabletin de interneti açık mı? Tekrar dene; olmazsa BAĞLANTIYI TEST ET'e bas.";
const MESSAGES = {
  'browser-incompatible': 'Bu tarayıcı tabletler arası doğrudan bağlantıyı (WebRTC) desteklemiyor. Safari veya Chrome ile aç.',
  'peer-unavailable': 'Bu kodla açık bir oda bulunamadı. Kodu kontrol et; odayı kuran kişinin oyun ekranı açık kalmalı.',
  'no-answer': 'Oda var ama odayı kuran tablet yanıt vermedi. Onun ekranı açık ve oyun sayfasında olmalı (kodu paylaşmak için başka uygulamaya geçtiyse oyuna dönsün). Sonra tekrar dene.',
  'unavailable-id': 'Oda kodu üretilemedi. Tekrar dene.',
  'room-full': 'Oda dolu.',
  'broker-timeout': 'Eşleştirme servisine ulaşılamadı (zaman aşımı). İnternet bağlantını kontrol edip tekrar dene.',
  timeout: 'Bağlantı zaman aşımına uğradı. İnternet bağlantını kontrol edip tekrar dene.',
  'connection-closed': 'Bağlantı kurulurken kapandı. Tekrar dene.',
};
const DIRECT = new Set(['ice-timeout', 'webrtc', 'negotiation-failed']);
const BROKER = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'ssl-unavailable', 'unavailable-key', 'invalid-key']);

export function describePeerError(error, { turnConfigured = hasTurn() } = {}) {
  const type = error?.type ?? error?.code ?? '';
  if (DIRECT.has(type)) return turnConfigured ? DIRECT_FAILED_WITH_TURN : DIRECT_FAILED_NO_TURN;
  if (MESSAGES[type]) return MESSAGES[type];
  if (BROKER.has(type)) return 'Eşleştirme servisine ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.';
  return 'Bağlantı kurulamadı. Tekrar dene.';
}

/** Node test runs must never be kept alive by a forgotten keepalive timer (no-op in browsers). */
const unref = (handle) => { handle?.unref?.(); return handle; };

function peerError(type, message = type) {
  const error = new Error(message);
  error.type = type;
  return error;
}

/** Resolves once the Peer is registered with the broker; rejects on its first error. */
function whenPeerOpen(peer, timeoutMs, timers) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      peer.off?.('open', onOpen);
      peer.off?.('error', onError);
      fn(value);
    };
    const onOpen = (id) => finish(resolve, id);
    const onError = (error) => finish(reject, error);
    const timer = unref(timers.setTimeout(() => finish(reject, peerError('broker-timeout')), timeoutMs));
    peer.on('open', onOpen);
    peer.on('error', onError);
  });
}

/**
 * One data connection with a keepalive. A silent peer (closed laptop lid,
 * Safari suspended in the background, Wi-Fi lost) is treated as gone after
 * `silenceMs`, because WebRTC close events are not guaranteed to arrive.
 */
export class ConnectionLink {
  constructor(conn, { silenceMs = 8000, pingMs = 1500, openTimeoutMs = 20000, now = Date.now, timers = globalThis } = {}) {
    this.conn = conn;
    this.peerId = conn.peer;
    this.silenceMs = silenceMs;
    this.pingMs = pingMs;
    this.now = now;
    this.timers = timers;
    this.onMessage = null;
    this.onOpen = null;
    this.onClose = null;
    this.onAnswered = null;
    this.answered = false; // the other side replied to our offer (so the room exists and is awake)
    this._onCloseInternal = null;
    this.closed = false;
    this.lastReceived = now();
    this.lastSent = now();
    // Never opened: either the host never answered (asleep / in another app), or it
    // answered but no network path worked (needs TURN). The UI explains each case.
    this.openTimer = unref(timers.setTimeout(() => { if (!this.open) this.close(this.answered ? 'ice-timeout' : 'no-answer'); }, openTimeoutMs));
    this.watch = unref(timers.setInterval(() => this._tick(), Math.min(1000, pingMs)));
    conn.on('open', () => {
      this.lastReceived = this.now();
      timers.clearTimeout(this.openTimer);
      this.onOpen?.();
    });
    conn.on('data', (data) => this._receive(data));
    conn.on('close', () => this.close('closed'));
    conn.on('error', () => this.close('error'));
    const pc = conn.peerConnection;
    if (pc && typeof pc.addEventListener === 'function') {
      let offered = false;
      pc.addEventListener('signalingstatechange', () => {
        if (pc.signalingState === 'have-local-offer') offered = true;
        else if (pc.signalingState === 'stable' && offered && !this.answered) {
          this.answered = true;
          this.onAnswered?.();
        }
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        if (pc.iceConnectionState === 'failed') this.close('webrtc');
      });
    }
  }

  get open() {
    return !this.closed && !!this.conn.open;
  }

  /** Bytes queued in the browser's send buffer; used to skip snapshots on a congested link. */
  get bufferedAmount() {
    return this.conn.dataChannel?.bufferedAmount ?? 0;
  }

  send(payload) {
    if (!this.open) return false;
    try {
      this.conn.send(payload);
      this.lastSent = this.now();
      return true;
    } catch {
      this.close('error');
      return false;
    }
  }

  _receive(data) {
    if (this.closed) return;
    this.lastReceived = this.now();
    if (data && typeof data === 'object' && data.type === 'ping') return;
    this.onMessage?.(data);
  }

  _tick() {
    if (this.closed || !this.conn.open) return;
    const t = this.now();
    if (t - this.lastReceived > this.silenceMs) { this.close('timeout'); return; }
    if (t - this.lastSent >= this.pingMs) this.send({ type: 'ping' });
  }

  close(reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    this.timers.clearTimeout(this.openTimer);
    this.timers.clearInterval(this.watch);
    try { this.conn.close(); } catch { /* already closed */ }
    this._onCloseInternal?.(reason);
    this.onClose?.(reason);
  }
}

/**
 * The host side: owns a Peer registered under the room code's id.
 * If the code is already taken on the broker, a new code is drawn.
 */
export class HostedRoom {
  static async open({ Peer, random = Math.random, attempts = 6, timeoutMs = 15000, linkOptions = {}, timers = globalThis, iceServers } = {}) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      const code = generateRoomCode(random);
      const peer = new Peer(peerIdForRoom(code), peerOptions(iceServers));
      try {
        await whenPeerOpen(peer, timeoutMs, timers);
        return new HostedRoom(peer, code, { linkOptions, timers });
      } catch (error) {
        lastError = error;
        try { peer.destroy(); } catch { /* ignore */ }
        if (error?.type !== 'unavailable-id') break;
      }
    }
    throw lastError ?? peerError('unavailable-id');
  }

  constructor(peer, code, { linkOptions = {}, timers = globalThis } = {}) {
    this.peer = peer;
    this.code = code;
    this.linkOptions = linkOptions;
    this.timers = timers;
    this.links = new Set();
    this.onConnection = null;
    this.closed = false;
    this.reconnectTimer = null;
    peer.on('connection', (conn) => {
      if (this.closed) { try { conn.close(); } catch { /* ignore */ } return; }
      const link = new ConnectionLink(conn, { timers, ...linkOptions });
      this.links.add(link);
      link._onCloseInternal = () => this.links.delete(link);
      this.onConnection?.(link);
    });
    // Losing the broker does not drop running matches; reconnect so new guests can still join.
    peer.on('disconnected', () => {
      if (this.closed || this.reconnectTimer) return;
      this.reconnectTimer = unref(timers.setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.closed && !peer.destroyed) { try { peer.reconnect(); } catch { /* try again on next disconnect */ } }
      }, 1500));
    });
    peer.on('error', () => { /* per-connection failures surface through ConnectionLink */ });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.reconnectTimer) this.timers.clearTimeout(this.reconnectTimer);
    for (const link of [...this.links]) link.close('host-closed');
    this.links.clear();
    try { this.peer.destroy(); } catch { /* ignore */ }
  }
}

/** The guest side: a throwaway Peer that dials the host's id. */
export async function joinHostedRoom({ Peer, code, timeoutMs = 15000, linkOptions = {}, timers = globalThis, iceServers, onProgress } = {}) {
  const hostId = peerIdForRoom(code);
  const peer = new Peer(peerOptions(iceServers));
  try {
    await whenPeerOpen(peer, timeoutMs, timers);
    onProgress?.('searching');
    const conn = peer.connect(hostId, { ...CHANNEL_OPTIONS });
    if (!conn) throw peerError('connection-closed');
    const link = new ConnectionLink(conn, { timers, ...linkOptions });
    link.onAnswered = () => onProgress?.('found');
    await new Promise((resolve, reject) => {
      let done = false;
      const settle = (fn, value) => {
        if (done) return;
        done = true;
        peer.off?.('error', onPeerError);
        link.onOpen = null;
        link.onClose = null;
        link.onAnswered = null;
        fn(value);
      };
      // Settle with the broker's reason (e.g. peer-unavailable) before closing the half-open link.
      const onPeerError = (error) => { settle(reject, error); link.close('error'); };
      peer.on('error', onPeerError);
      link.onOpen = () => settle(resolve);
      link.onClose = (reason) => settle(reject, peerError(['ice-timeout', 'no-answer', 'webrtc'].includes(reason) ? reason : 'connection-closed'));
    });
    // Broker hiccups after this point do not affect the direct connection.
    peer.on('error', () => {});
    return {
      peer,
      link,
      close() {
        link.close('left');
        try { peer.destroy(); } catch { /* ignore */ }
      },
    };
  } catch (error) {
    try { peer.destroy(); } catch { /* ignore */ }
    throw error;
  }
}
