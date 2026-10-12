import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const exists = f => existsSync(fileURLToPath(new URL(f, root)));

test('online entry, P2P host and renderer sources are packaged', () => {
  for (const file of ['online.html', 'src/online-main.js', 'src/online/RemoteGameView.js',
    'src/net/MatchHost.js', 'src/net/PeerTransport.js', 'src/net/protocol.js', 'src/net/roomCode.js', 'src/net/snapshot.js']) {
    assert.equal(exists(file), true, file);
  }
});
test('no Raspberry Pi / Render server is needed any more', () => {
  for (const file of ['server/server.js', 'server/rooms.js', 'render.yaml', 'scripts/install-pi-service.sh', 'src/online/connectionUrl.js']) {
    assert.equal(exists(file), false, `${file} should be removed`);
  }
  const js = read('src/online-main.js');
  assert.doesNotMatch(js, /new WebSocket\(/);
  assert.doesNotMatch(js, /server-url/);
});
test('online DOM IDs referenced in online-main exist exactly once', () => {
  const js = read('src/online-main.js'); const html = read('online.html');
  const ids = new Set([...js.matchAll(/\b(?:el|show)\('([^']+)'/g)].map(m => m[1]));
  assert.ok(ids.size > 20);
  for (const id of ids) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(all).size, all.length, 'online.html has no duplicate ids');
});
test('online-main only imports local modules that exist', () => {
  const source = read('src/online-main.js');
  for (const m of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    assert.ok(exists(new URL(m[1], new URL('src/', root)).pathname.replace(fileURLToPath(root), '')), `missing ${m[1]}`);
  }
  // PeerJS and Rapier are loaded on demand so the lobby opens fast.
  assert.match(read('src/net/PeerTransport.js'), /import\('peerjs'\)/);
  assert.doesNotMatch(read('src/net/PeerTransport.js'), /^import .* from 'peerjs'/m);
  assert.match(source, /import\('@dimforge\/rapier3d-compat'\)/);
});
test('vite configuration builds both offline and online pages', () => {
  const vite = read('vite.config.js');
  assert.match(vite, /online\.html/);
  assert.match(vite, /index\.html/);
});
test('npm lockfile matches package.json: peerjs in, ws out', () => {
  const p = JSON.parse(read('package.json')); const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages[''].dependencies.peerjs, p.dependencies.peerjs);
  assert.match(lock.packages['node_modules/peerjs'].version, /^1\.5\./);
  assert.equal(p.dependencies.ws, undefined);
  assert.equal(lock.packages['node_modules/ws'], undefined);
  assert.equal(p.scripts.start, undefined, 'no server process to start');
});
