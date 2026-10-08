/** Resolve a game server URL on either the same origin or an external WSS host.
 * Accepts https://host, wss://host/ws, or host, and always uses /ws.
 * HTTPS Pages may connect only via secure WebSockets.
 */
export function websocketEndpoint(value, browser = globalThis.location) {
  const raw = (value ?? '').trim();
  if (!raw) {
    if (browser.hostname?.endsWith('.github.io')) {
      throw new Error('Online maç için önce Render veya Raspberry Pi sunucu adresini gir.');
    }
    return `${browser.protocol === 'https:' ? 'wss:' : 'ws:'}//${browser.host}/ws`;
  }
  const endpoint = new URL(/^(?:https?|wss?):\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol)
      || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || (endpoint.pathname !== '/' && endpoint.pathname !== '/ws')) {
    throw new Error('Geçerli bir sunucu adresi gir (ör. https://rocket-arena-server.onrender.com).');
  }
  if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:';
  if (endpoint.protocol === 'http:') endpoint.protocol = 'ws:';
  if (browser.protocol === 'https:' && endpoint.protocol !== 'wss:') {
    throw new Error('GitHub Pages HTTPS kullanır. Sunucu adresi https:// veya wss:// olmalı.');
  }
  endpoint.pathname = '/ws';
  return endpoint.toString();
}
