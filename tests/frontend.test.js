import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(project, name), 'utf8');

const required = ['index.html', 'src/main.js', 'src/App.js', 'src/styles/main.css', 'vite.config.js'];

test('browser entrypoint files exist', () => {
  for (const file of required) assert.ok(existsSync(resolve(project, file)), `Missing ${file}`);
  assert.match(read('index.html'), /src="\/src\/main\.js"/);
  assert.match(read('src/main.js'), /await RAPIER\.init\(\)/);
});

test('all DOM ids referenced in App exist in index.html', () => {
  const html = read('index.html');
  const app = read('src/App.js');
  const ids = [...app.matchAll(/\bel\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 30);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `Missing HTML element id ${id}`);
});

test('frontend references existing local module files', () => {
  for (const path of ['src/main.js', 'src/App.js']) {
    const source = read(path);
    for (const m of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      assert.ok(existsSync(resolve(project, dirname(path), m[1])), `${path} missing import ${m[1]}`);
    }
  }
});

test('frontend connects physics, bot, camera, input and rendering', () => {
  const app = read('src/App.js');
  for (const name of ['Simulation', 'BotController', 'GameView', 'CameraRig', 'InputManager', 'Renderer', 'GameLoop']) {
    assert.match(app, new RegExp(`new ${name}\\(`));
  }
});
