import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/input/InputManager.js';
import { CONTROLS } from '../src/config/controls.js';
import { STICK_RADIUS } from '../src/input/TouchControls.js';
import { touchOverlay } from './touch-fixture.js';

test('iPad without keyboard: stick drives (gas + steer), buttons boost/jump; keyboard still works after hiding', () => {
  const f = touchOverlay();
  const keys = new Map();
  const target = { addEventListener(n, fn) { keys.set(n, fn); }, removeEventListener(n) { keys.delete(n); } };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = f.win;
  globalThis.document = {
    getElementById(id) { return id === 'touch-controls' ? f.root : id === 'touch-toggle' ? f.toggle : null; },
    addEventListener() {}, removeEventListener() {},
  };
  let input;
  try {
    input = new InputManager(CONTROLS, target);
    input.touch.isTouch = true; // headless Linux has no touch screen
    input.touch.storage = f.storage;
    input.setGameActive(true);
    assert.equal(f.root.classList.contains('hidden'), false, 'overlay appears when the match starts');

    // Left thumb: push up and to the left. Right thumb: BOOST, then a second finger taps ZIPLA.
    f.root.listeners.get('pointerdown')(f.event(f.zone, 1, 150, 600));
    f.win.listeners.get('pointermove')(f.event(f.zone, 1, 150 - 0.6 * STICK_RADIUS, 600 - 0.6 * STICK_RADIUS));
    f.root.listeners.get('pointerdown')(f.event(f.buttons.boost, 2));
    f.root.listeners.get('pointerdown')(f.event(f.buttons.jump, 3));
    const first = input.poll().controls;
    assert.equal(first.throttle, 1);
    assert.ok(first.steer < -0.4, `analog steer ${first.steer}`);
    assert.ok(first.pitch > 0.4, 'stick up also pitches the nose down in the air');
    assert.equal(first.boost, true);
    assert.equal(first.jumpPressed, true);
    assert.equal(input.poll().controls.jumpPressed, false, 'jump edge delivered once');
    assert.equal(input.lastDevice, 'touch');

    f.toggle.listeners.get('click')(); // hide the on-screen controls
    const hidden = input.poll().controls;
    assert.equal(hidden.throttle, 0, 'no stuck gas after hiding');
    assert.equal(hidden.boost, false, 'no stuck boost after hiding');

    keys.get('keydown')({ code: 'KeyW', target: { tagName: 'BODY' }, preventDefault() {} });
    keys.get('keydown')({ code: 'KeyD', target: { tagName: 'BODY' }, preventDefault() {} });
    const keyboard = input.poll().controls;
    assert.equal(keyboard.throttle, 1);
    assert.equal(keyboard.steer, 1);
    keys.get('keyup')({ code: 'KeyW' });
    keys.get('keyup')({ code: 'KeyD' });

    f.toggle.listeners.get('click')(); // show again
    f.root.listeners.get('pointerdown')(f.event(f.zone, 5, 150, 600));
    f.win.listeners.get('pointermove')(f.event(f.zone, 5, 150, 600 + STICK_RADIUS));
    assert.equal(input.poll().controls.throttle, -1, 'pull down = reverse');

    input.setGameActive(false); // menu / pause / match end
    assert.ok(f.root.classList.contains('hidden'));
    assert.equal(input.poll().controls.throttle, 0);
  } finally {
    input?.dispose();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
