/**
 * Online bağlantı ayarları.
 *
 * İki tablet önce doğrudan bağlanmayı dener (STUN, ücretsiz). Farklı ağlarda
 * (mobil veri, başka ev) ya da cihazların birbirini görmesine izin vermeyen
 * Wi-Fi'larda doğrudan bağlantı kurulamaz; o zaman bir aracı sunucu (TURN) gerekir.
 * PeerJS'in eski ücretsiz TURN sunucusu kapandı.
 *
 * TURN AYARI (ücretsiz, 1000 GB/ay): https://www.expressturn.com adresinde hesap aç,
 * Dashboard'daki 3 bilgiyi aşağıya aynen yaz, commit + push et.
 * Not: Bu bilgiler yayınlanan sitede görünür (tarayıcı oyunlarında kaçınılmaz).
 * Biri kotanı kullanırsa Dashboard'da "Refresh Credentials" ile yenileyip buraya tekrar yaz.
 */
export const TURN = {
  server: '',   // Dashboard > TURN Servers satırındaki adres (sonu ...expressturn.com:3478 gibi)
  username: '', // Dashboard > Username
  password: '', // Dashboard > Password
};

export const STUN_URLS = Object.freeze([
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
]);

/** Accepts 'host:port', 'turn:host:port' or 'turn:host:port?transport=udp'. */
export function turnHost(server) {
  if (typeof server !== 'string') return null;
  const host = server.trim().replace(/^turns?:/i, '').replace(/\?.*$/, '').replace(/^\/\//, '');
  return /^[A-Za-z0-9.-]+(:\d{2,5})?$/.test(host) ? (host.includes(':') ? host : `${host}:3478`) : null;
}

export function hasTurn(turn = TURN) {
  return !!(turnHost(turn?.server) && turn.username && turn.password);
}

/** RTCConfiguration.iceServers for every peer connection (host and guests). */
export function iceServers(turn = TURN) {
  const servers = [{ urls: [...STUN_URLS] }];
  if (hasTurn(turn)) {
    const host = turnHost(turn.server);
    servers.push({
      urls: [`turn:${host}?transport=udp`, `turn:${host}?transport=tcp`],
      username: turn.username.trim(),
      credential: turn.password.trim(),
    });
  }
  return servers;
}
