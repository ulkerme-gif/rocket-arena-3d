import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { websocketEndpoint } from '../src/online/connectionUrl.js';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('Pages resolves external secure WebSocket URL', () => {
  const browser = { protocol: 'https:', hostname: 'myname.github.io', host: 'myname.github.io' };
  assert.equal(websocketEndpoint('https://my-game.onrender.com', browser), 'wss://my-game.onrender.com/ws');
  assert.equal(websocketEndpoint('wss://my-game.onrender.com/ws', browser), 'wss://my-game.onrender.com/ws');
  assert.equal(websocketEndpoint('my-game.onrender.com', browser), 'wss://my-game.onrender.com/ws');
  assert.throws(() => websocketEndpoint('', browser), /sunucu adresini gir/);
  assert.throws(() => websocketEndpoint('http://localhost:3000', browser), /HTTPS/);
  assert.throws(() => websocketEndpoint('https://example.org/path', browser), /Geçerli/);
});

test('Local Pi server keeps same-origin websocket fallback', () => {
  assert.equal(websocketEndpoint('', { protocol:'http:', hostname:'raspberrypi.local', host:'raspberrypi.local:3000' }), 'ws://raspberrypi.local:3000/ws');
});

test('Pages links use relative paths, backend has explicit origins, workflow exists', () => {
  const home = read('../index.html'); const online = read('../online.html');
  assert.match(home, /href="\.\/online\.html"/);
  assert.match(online, /href="\.\/"/);
  assert.match(online, /id="server-url"/);
  assert.match(read('../server/server.js'), /ALLOWED_ORIGINS/);
  assert.match(read('../.github/workflows/pages.yml'), /npm run build/);
  assert.match(read('../vite.config.js'), /GITHUB_REPOSITORY/);
});
