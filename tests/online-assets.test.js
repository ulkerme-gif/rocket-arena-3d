import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');

test('online entry, renderer and server sources are packaged', () => {
  for (const file of ['online.html', 'src/online-main.js', 'src/online/RemoteGameView.js', 'server/server.js', 'server/rooms.js', 'scripts/install-pi-service.sh']) {
    assert.equal(existsSync(fileURLToPath(new URL(file, root))), true, file);
  }
});
test('online DOM IDs referenced in online-main exist', () => {
  const js = read('src/online-main.js'); const html = read('online.html');
  for (const [, id] of js.matchAll(/\bel\('([^']+)'\)/g)) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});
test('vite configuration builds both offline and online pages', () => {
  const vite = read('vite.config.js');
  assert.match(vite, /online\.html/);
  assert.match(vite, /index\.html/);
});
test('npm lockfile includes exact compatible websocket dependency', () => {
  const p = JSON.parse(read('package.json')); const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages[''].dependencies.ws, p.dependencies.ws);
  assert.equal(lock.packages['node_modules/ws'].version, '8.18.3');
});
