import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TouchControls } from '../src/input/TouchControls.js';

function fixture(action) {
  const listeners = new Map();
  const changes = [];
  const classes = new Set();
  const root = {
    classList: { toggle(name, disabled) { changes.push([name, disabled]); } },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const btn = {
    dataset: { touchAction: action },
    closest() { return this; },
    setPointerCapture() {},
    classList: { add(x) { classes.add(x); }, remove(x) { classes.delete(x); } },
  };
  const event = (id) => ({pointerId:id,target:btn,preventDefault(){}});
  return {listeners,changes,classes,root,btn,event};
}

test('multi-touch holds throttle while jump edge is consumed once', () => {
  const f=fixture('throttle'); const c=new TouchControls(f.root,true);c.setActive(true);
  f.listeners.get('pointerdown')(f.event(1));
  assert.equal(c.held('throttle'),true);
  assert.equal(c.consumeEdge('throttle'),true);
  assert.equal(c.consumeEdge('throttle'),false);
  f.listeners.get('pointerup')(f.event(1));
  assert.equal(c.held('throttle'),false);
  assert.equal(f.classes.has('pressed'),false);
  c.dispose();
  assert.equal(f.listeners.size,0);
});

test('touch buttons appear in local and online HTML with correct input actions', () => {
  for (const html of ['index.html','online.html']) {
    const page = readFileSync(new URL(`../${html}`,import.meta.url),'utf8');
    for (const action of ['throttle','reverse','steerLeft','steerRight','jump','boost','handbrake','ballCam']) {
      assert.match(page,new RegExp(`data-touch-action="${action}"`),`${html} missing ${action}`);
    }
  }
  const manager = readFileSync(new URL('../src/input/InputManager.js',import.meta.url),'utf8');
  assert.match(manager,/this\.touch\?\.setActive\(active\)/);
  assert.match(manager,/this\.touch\?\.held\(action\)/);
  assert.match(manager,/this\.touch\?\.consumeEdge\(action\)/);
});

test('iPad touch overlay toggles on/off, releases held actions and remembers preference', () => {
  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
      contains(name) { return values.has(name); },
    };
  }
  function element() {
    const listeners = new Map();
    const attributes = new Map();
    return {
      classList: classList(), listeners, attributes,
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name) { listeners.delete(name); },
      setAttribute(name, val) { attributes.set(name, val); },
    };
  }
  const store = new Map();
  const storage = { getItem(k) { return store.get(k) ?? null; }, setItem(k, v) { store.set(k, v); } };
  const root = element();
  root.ownerDocument = {body:{classList:classList()}};
  const button = element();
  button.dataset = {touchAction:'throttle'};
  button.closest = () => button;
  button.setPointerCapture = () => {};
  root.contains = (candidate) => candidate === button;
  const toggle = element();
  let controls = new TouchControls(root, true, toggle, storage);
  assert.ok(toggle.classList.contains('hidden'), 'Toggle hidden outside a match');
  controls.setActive(true);
  assert.equal(root.classList.contains('hidden'), false);
  assert.equal(toggle.classList.contains('hidden'), false);
  root.listeners.get('pointerdown')({target:button, pointerId:12, preventDefault(){}});
  assert.equal(controls.held('throttle'), true);

  toggle.listeners.get('click')();
  assert.equal(root.classList.contains('hidden'), true);
  assert.equal(toggle.classList.contains('hidden'), false, 'Show button must stay visible');
  assert.equal(controls.held('throttle'), false, 'Hide must release gas');
  assert.equal(toggle.attributes.get('aria-pressed'), 'false');
  assert.match(toggle.textContent, /GÖSTER/);
  assert.ok(root.ownerDocument.body.classList.contains('touch-keyboard-mode'));
  assert.equal(storage.getItem('rocket-arena-touch-controls-visible'), 'false');
  controls.dispose();

  controls = new TouchControls(root, true, toggle, storage);
  controls.setActive(true);
  assert.ok(root.classList.contains('hidden'), 'Preference survives navigation/reload');
  toggle.listeners.get('click')();
  assert.equal(root.classList.contains('hidden'), false, 'Touch can be re-enabled');
  assert.equal(toggle.attributes.get('aria-pressed'), 'true');
  assert.equal(storage.getItem('rocket-arena-touch-controls-visible'), 'true');
  controls.setActive(false);
  assert.ok(root.classList.contains('hidden'));
  assert.ok(toggle.classList.contains('hidden'));
  controls.dispose();
  assert.equal(toggle.listeners.size, 0);
});

test('all touch actions on both pages have keyboard-safe persistent toggle', () => {
  for (const html of ['index.html', 'online.html']) {
    const page = readFileSync(new URL(`../${html}`,import.meta.url),'utf8');
    assert.match(page, /id="touch-toggle"/);
    assert.match(page, /aria-pressed="true"/);
    assert.match(page, /viewport-fit=cover/);
    assert.match(page, /data-touch-action="boost"/);
  }
  const css = readFileSync(new URL('../src/styles/main.css',import.meta.url),'utf8');
  assert.match(css, /touch-keyboard-mode/);
  assert.match(css, /\.touch-toggle/);
});
