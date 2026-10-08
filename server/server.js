import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomManager } from './rooms.js';
import { message } from './protocol.js';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const port = Number(process.env.PORT || 3000);
const maxRooms = Math.max(1, Math.min(12, Number(process.env.MAX_ROOMS || 4)));
const tickRate = [60, 120].includes(Number(process.env.TICK_RATE)) ? Number(process.env.TICK_RATE) : 60;
// Example: ALLOWED_ORIGINS=https://yourname.github.io (no /repo/ path)
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',')
  .map(item => item.trim()).filter(Boolean).map(item => {
    try { return new URL(item).origin; } catch { return ''; }
  }).filter(Boolean));
await RAPIER.init();
const rooms = new RoomManager(RAPIER, { maxRooms, tickRate });
rooms.begin();
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, ...rooms.status() }));
  }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (requested === '/') requested = '/index.html';
  if (requested === '/online') requested = '/online.html';
  const resolved = path.resolve(dist, '.' + requested);
  if (!resolved.startsWith(dist + path.sep) || !path.extname(resolved)) { res.writeHead(404); return res.end(); }
  try {
    const fileStat = await stat(resolved);
    if (!fileStat.isFile() || fileStat.size > 16 * 1024 * 1024) throw Error('invalid file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream',
      'Cache-Control': requested.includes('/assets/') ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(await readFile(resolved));
  } catch { res.writeHead(404); res.end('Not found'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
  // Same-origin browser requests; proxy / Cloudflare Tunnel retain Host.
  const origin = req.headers.origin;
  let permitted = false;
  try {
    const parsedOrigin = new URL(origin);
    permitted = (['http:', 'https:'].includes(parsedOrigin.protocol) && parsedOrigin.host === req.headers.host)
      || allowedOrigins.has(parsedOrigin.origin);
  } catch {}
  if (url.pathname !== '/ws' || !permitted || wss.clients.size >= maxRooms * 4) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  // Protect publicly tunneled servers from idle, unjoined websocket hoarding.
  const joinTimeout = setTimeout(() => {
    if (!rooms.clients.has(ws) && ws.readyState === 1) ws.close(1008, 'Join timeout');
  }, 10000);
  joinTimeout.unref?.();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let messages = 0; let second = Date.now();
  ws.on('message', data => {
    if (Date.now() - second >= 1000) { second = Date.now(); messages = 0; }
    if (++messages > 45) return ws.close(1008, 'Rate limit');
    const packet = message(data);
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'join') rooms.join(ws, packet.room, packet.name);
    else if (packet.type === 'input') rooms.input(ws, packet);
    else if (packet.type === 'rematch') rooms.rematch(ws);
  });
  ws.on('close', () => { clearTimeout(joinTimeout); rooms.leave(ws); });
  ws.on('error', () => { clearTimeout(joinTimeout); rooms.leave(ws); });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
heartbeat.unref?.();
server.listen(port, '0.0.0.0', () => console.log(`[Rocket Arena] Pi server listening on port ${port}; ${tickRate} Hz; rooms ${maxRooms}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearInterval(heartbeat); rooms.stop(); wss.close(); server.close(); });
