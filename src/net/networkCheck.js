import { hasTurn, iceServers as configuredIceServers } from '../config/network.js';
import { peerOptions } from './PeerTransport.js';

/**
 * "BAĞLANTIYI TEST ET": what this tablet's network allows, without needing a second device.
 * - broker: can we reach PeerJS' matchmaking service?
 * - srflx: STUN works (direct connection over the internet is possible on many networks)
 * - relay: the configured TURN server accepted our credentials (works from any network)
 */
export async function probeIce({ RTCPeerConnection = globalThis.RTCPeerConnection, iceServers = configuredIceServers(), timeoutMs = 7000, timers = globalThis } = {}) {
  if (typeof RTCPeerConnection !== 'function') return { supported: false, host: false, srflx: false, relay: false };
  const found = { supported: true, host: false, srflx: false, relay: false };
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers });
    pc.createDataChannel('probe');
    const gathered = new Promise((resolve) => {
      const timer = timers.setTimeout(resolve, timeoutMs);
      pc.onicecandidate = (event) => {
        const candidate = event.candidate;
        if (!candidate) { timers.clearTimeout(timer); resolve(); return; }
        const type = candidate.type ?? /\btyp (\w+)/.exec(candidate.candidate ?? '')?.[1];
        if (type === 'host' || type === 'srflx' || type === 'relay') found[type] = true;
        if (found.relay && found.srflx) { timers.clearTimeout(timer); resolve(); }
      };
    });
    await pc.setLocalDescription(await pc.createOffer());
    await gathered;
  } catch {
    found.supported = false;
  } finally {
    try { pc?.close(); } catch { /* ignore */ }
  }
  return found;
}

/** Registers a throwaway Peer on the broker and destroys it again. */
export async function probeBroker({ Peer, timeoutMs = 10000, timers = globalThis } = {}) {
  const peer = new Peer(peerOptions());
  try {
    return await new Promise((resolve) => {
      const timer = timers.setTimeout(() => resolve(false), timeoutMs);
      peer.on('open', () => { timers.clearTimeout(timer); resolve(true); });
      peer.on('error', () => { timers.clearTimeout(timer); resolve(false); });
    });
  } finally {
    try { peer.destroy(); } catch { /* ignore */ }
  }
}

/** Plain-language result lines for the lobby status. */
export function describeNetwork({ broker, ice }, { turnConfigured = hasTurn() } = {}) {
  const lines = [];
  lines.push(broker ? '✓ Eşleştirme servisi çalışıyor.' : '✗ Eşleştirme servisine ulaşılamıyor: internet bağlantını kontrol et.');
  if (!ice.supported) {
    lines.push('✗ Bu tarayıcı WebRTC desteklemiyor: Safari veya Chrome kullan.');
    return lines.join('\n');
  }
  lines.push(ice.srflx
    ? '✓ İnternet üzerinden doğrudan bağlantı denenebilir.'
    : '✗ Bu ağ doğrudan bağlantıya izin vermiyor.');
  if (!turnConfigured) {
    lines.push('• Aracı sunucu (TURN) ayarlı değil: farklı ağlardan (mobil veri, başka ev) bağlanmak için gerekli.');
  } else {
    lines.push(ice.relay
      ? '✓ Aracı sunucu (TURN) çalışıyor: farklı ağlardan da bağlanılabilir.'
      : '✗ Aracı sunucuya (TURN) bağlanılamadı: src/config/network.js içindeki bilgileri kontrol et.');
  }
  return lines.join('\n');
}
