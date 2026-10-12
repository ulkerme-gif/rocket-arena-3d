import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('Pages links use relative paths and the lobby offers create / join by code', () => {
  const home = read('../index.html'); const online = read('../online.html');
  assert.match(home, /href="\.\/online\.html"/);
  assert.match(online, /href="\.\/"/);
  assert.match(online, /id="room-create"/);
  assert.match(online, /id="room-code"[^>]*maxlength="4"/);
  assert.match(online, /id="online-join"/);
  assert.match(online, /id="room-code-display"/);
  assert.doesNotMatch(online, /server-url|Raspberry|Render/i);
});

test('GitHub Pages workflow and Vite base path are unchanged', () => {
  const workflow = read('../.github/workflows/pages.yml');
  for (const step of ['npm ci', 'npm test', 'npm run build', 'npm run test:smoke']) assert.match(workflow, new RegExp(step.replace(/[.]/g, '\\.')));
  assert.match(read('../vite.config.js'), /GITHUB_REPOSITORY/);
});
