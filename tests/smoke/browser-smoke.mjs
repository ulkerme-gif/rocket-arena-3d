/** Production HTTP/WebSocket smoke check, not a graphical WebGL test. Requires npm ci + npm run build. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';

const listen = createServer();
await new Promise((resolve, reject) => listen.once('error', reject).listen(0, '127.0.0.1', resolve));
const port = listen.address().port;
await new Promise(resolve => listen.close(resolve));
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/server.js'], {
  cwd: new URL('../../', import.meta.url).pathname,
  env: { ...process.env, PORT: String(port), MAX_ROOMS: '2' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', c => { logs += c.toString(); });
server.stderr.on('data', c => { logs += c.toString(); });
const sockets = [];

async function waitMessage(ws, predicate, timeoutMs = 4000) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for WebSocket message')); }, timeoutMs);
    function onMessage(raw) {
      let data; try { data = JSON.parse(raw.toString()); } catch { return; }
      if (predicate(data)) { cleanup(); resolve(data); }
    }
    function onClose() { cleanup(); reject(new Error('Socket closed before expected response')); }
    function cleanup() { clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose); }
    ws.on('message', onMessage); ws.on('close', onClose);
  });
}
async function join(name) {
  const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { origin: url });
  sockets.push(ws);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const joined = waitMessage(ws, d => d.type === 'joined');
  ws.send(JSON.stringify({ type: 'join', room: 'SMOKETEST', name }));
  await joined;
  return ws;
}

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited early: ${logs}`);
    try { const r = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(300) }); if (r.ok) { ready = true; break; } }
    catch {}
    await sleep(100);
  }
  assert.ok(ready, `Server did not start: ${logs}`);
  const html = await fetch(`${url}/online.html`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /online-main|assets\//);
  const p1 = await join('Smoke player1');
  const next = waitMessage(p1, d => d.type === 'roomStatus' && d.status === 'playing');
  const p2 = await join('Smoke player2');
  await next;
  const snapshotReady = waitMessage(p1, d => d.type === 'snapshot' && d.state?.tick >= 1);
  await snapshotReady;
  const acknowledged = waitMessage(p1, d => d.type === 'snapshot' && d.state?.lastProcessedSequence === 1);
  p1.send(JSON.stringify({ type: 'input', controls: { sequence: 1, timestamp: Date.now(), throttle: 1 } }));
  await acknowledged;
  assert.equal(p2.readyState, WebSocket.OPEN);
  console.log('SMOKE PASS: production HTTP, 2-player room, authoritative snapshots, processed-input ACK');
} finally {
  for (const socket of sockets) socket.terminate();
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(2500)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}
