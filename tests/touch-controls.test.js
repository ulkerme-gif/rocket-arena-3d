import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TouchControls, stickToControls, STICK_RADIUS } from '../src/input/TouchControls.js';
import { touchOverlay } from './touch-fixture.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('stick mapping: dead zone, early full gas, full lock with gas, deliberate reverse, analog pitch', () => {
  assert.deepEqual(stickToControls(0, 0), { steer: 0, throttle: 0, pitch: 0, engaged: false });
  assert.equal(stickToControls(0.08, -0.08).engaged, false, 'thumb resting slightly off-centre does nothing');
  const up = stickToControls(0, -1);
  assert.equal(up.throttle, 1); assert.equal(up.pitch, 1); assert.equal(up.steer, 0);
  assert.equal(stickToControls(0, -0.3).throttle, 1, 'a small push already gives full gas');
  const lockWithGas = stickToControls(-0.95, -0.31);
  assert.equal(lockWithGas.steer, -1, 'full steering lock');
  assert.equal(lockWithGas.throttle, 1, 'while keeping full gas');
  const sideways = stickToControls(1, 0);
  assert.equal(sideways.steer, 1); assert.equal(sideways.throttle, 0, 'pure sideways coasts, never brakes');
  assert.ok(stickToControls(0, 0.25).throttle < 0 && stickToControls(0, 0.25).throttle > -1, 'light pull = gentle reverse');
  assert.equal(stickToControls(0, 1).throttle, -1);
  assert.ok(near(stickToControls(0, 0.56).pitch, -0.5), 'pitch stays analog for aerial control');
});

test('floating stick: centre is where the thumb lands, travel is clamped, lift recentres', () => {
  const f = touchOverlay();
  const c = new TouchControls(f.root, true, f.toggle, f.storage, f.win);
  c.setActive(true);
  assert.equal(c.axes(), null, 'untouched stick gives no axes');
  f.root.listeners.get('pointerdown')(f.event(f.zone, 7, 120, 600));
  assert.equal(f.base.style.left, '120px');
  assert.equal(f.base.style.top, '300px', 'relative to the zone');
  assert.ok(f.zone.classList.contains('engaged'));
  f.win.listeners.get('pointermove')(f.event(f.zone, 7, 120, 600 - STICK_RADIUS));
  assert.equal(c.axes().throttle, 1);
  assert.equal(c.axes().steer, 0);
  f.win.listeners.get('pointermove')(f.event(f.zone, 7, 120 + 10 * STICK_RADIUS, 600));
  assert.equal(c.stick.x, 1, 'clamped to the unit circle');
  assert.equal(c.axes().steer, 1);
  assert.match(f.knob.style.transform, /translate\(58\.0px, 0\.0px\)/);

  // A second finger landing in the zone does not hijack steering.
  f.root.listeners.get('pointerdown')(f.event(f.zone, 8, 300, 500));
  assert.equal(c.stick.pointerId, 7);

  // Finger lifted far outside the overlay: the global listener still releases it.
  f.win.listeners.get('pointerup')(f.event(f.empty, 7, 900, 100));
  assert.equal(c.axes(), null);
  assert.equal(f.base.style.left, '');
  assert.equal(f.knob.style.transform, '');
  assert.equal(f.zone.classList.contains('engaged'), false);
  c.dispose();
});

test('buttons: multi-touch, jump edge once, slide BOOST -> ZIPLA without lifting, no stuck input', () => {
  const f = touchOverlay();
  const c = new TouchControls(f.root, true, f.toggle, f.storage, f.win);
  c.setActive(true);
  const down = (action, id) => f.root.listeners.get('pointerdown')(f.event(f.buttons[action], id));
  down('boost', 1);
  down('handbrake', 2);
  assert.equal(c.held('boost'), true);
  assert.equal(c.held('handbrake'), true);
  assert.equal(c.consumeEdge('boost'), true);
  assert.equal(c.consumeEdge('boost'), false);

  f.state.under = f.buttons.jump; // finger 1 rolls from BOOST onto ZIPLA
  f.win.listeners.get('pointermove')(f.event(f.buttons.boost, 1, 50, 50));
  assert.equal(c.held('boost'), false);
  assert.equal(f.buttons.boost.classList.contains('pressed'), false);
  assert.equal(c.held('jump'), true);
  assert.equal(c.consumeEdge('jump'), true, 'sliding onto ZIPLA jumps');

  f.state.under = f.empty; // drifting onto empty space keeps the button held
  f.win.listeners.get('pointermove')(f.event(f.buttons.boost, 1, 60, 60));
  assert.equal(c.held('jump'), true);

  f.root.listeners.get('pointercancel')(f.event(f.buttons.jump, 1)); // iOS gesture interrupt
  assert.equal(c.held('jump'), false);
  f.win.listeners.get('pointerup')(f.event(f.empty, 2));
  assert.equal(c.held('handbrake'), false);
  assert.equal(c.pointers.size, 0);
  c.dispose();
  assert.equal(f.root.listeners.size, 0);
  assert.equal(f.win.listeners.size, 0);
});

test('hide / show toggle releases everything and the choice survives a reload', () => {
  const f = touchOverlay();
  let c = new TouchControls(f.root, true, f.toggle, f.storage, f.win);
  assert.ok(f.toggle.classList.contains('hidden'), 'toggle hidden outside a match');
  c.setActive(true);
  assert.equal(f.root.classList.contains('hidden'), false);
  f.root.listeners.get('pointerdown')(f.event(f.zone, 3, 100, 600));
  f.win.listeners.get('pointermove')(f.event(f.zone, 3, 100, 500));
  f.root.listeners.get('pointerdown')(f.event(f.buttons.boost, 4));
  assert.equal(c.axes().throttle, 1);

  f.toggle.listeners.get('click')();
  assert.ok(f.root.classList.contains('hidden'));
  assert.equal(f.toggle.classList.contains('hidden'), false, 'show button stays reachable');
  assert.equal(c.axes(), null, 'hiding releases the stick');
  assert.equal(c.held('boost'), false, 'hiding releases boost');
  assert.equal(f.toggle.attributes.get('aria-pressed'), 'false');
  assert.match(f.toggle.textContent, /GÖSTER/);
  assert.ok(f.doc.body.classList.contains('touch-keyboard-mode'));
  assert.equal(f.storage.getItem('rocket-arena-touch-controls-visible'), 'false');
  c.dispose();

  c = new TouchControls(f.root, true, f.toggle, f.storage, f.win);
  c.setActive(true);
  assert.ok(f.root.classList.contains('hidden'), 'preference survives a reload');
  f.toggle.listeners.get('click')();
  assert.equal(f.root.classList.contains('hidden'), false);
  c.setActive(false);
  assert.ok(f.root.classList.contains('hidden'));
  assert.ok(f.toggle.classList.contains('hidden'));
  c.dispose();
  assert.equal(f.toggle.listeners.size, 0);
});

test('touch is inert on non-touch devices and outside matches', () => {
  const f = touchOverlay();
  const c = new TouchControls(f.root, false, f.toggle, f.storage, f.win);
  c.setActive(true);
  f.root.listeners.get('pointerdown')(f.event(f.buttons.boost, 1));
  assert.equal(c.held('boost'), false);
  assert.ok(f.root.classList.contains('hidden'));
  c.dispose();
});

test('both pages ship the stick and the right-hand buttons; training adds reset buttons', () => {
  for (const html of ['index.html', 'online.html']) {
    const page = readFileSync(new URL(`../${html}`, import.meta.url), 'utf8');
    assert.match(page, /data-touch-stick/);
    assert.match(page, /class="stick-knob"/);
    for (const action of ['jump', 'boost', 'handbrake', 'ballCam']) {
      assert.match(page, new RegExp(`data-touch-action="${action}"`), `${html} missing ${action}`);
    }
    assert.match(page, /id="touch-toggle"/);
    assert.match(page, /aria-pressed="true"/);
    assert.match(page, /viewport-fit=cover/);
  }
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /data-touch-action="reset"/);
  assert.match(index, /data-touch-action="resetBall"/);
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  for (const rule of ['touch-keyboard-mode', '.touch-toggle', '.touch-stick', '.stick-knob', 'body.mode-training .touch-training']) assert.ok(css.includes(rule), rule);
  const manager = readFileSync(new URL('../src/input/InputManager.js', import.meta.url), 'utf8');
  assert.match(manager, /this\.touch\?\.setActive\(active\)/);
  assert.match(manager, /this\.touch\?\.held\(action\)/);
  assert.match(manager, /this\.touch\?\.consumeEdge\(action\)/);
  assert.match(manager, /this\.touch\?\.axes/);
});
