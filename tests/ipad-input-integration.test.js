import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/input/InputManager.js';
import { CONTROLS } from '../src/config/controls.js';

test('iPad touches steer + accelerate + boost together; keyboard still works after hiding touch UI', () => {
  const rootListeners = new Map();
  const buttonListeners = new Map();
  const docListeners = new Map();
  const windowListeners = new Map();
  const keyListeners = new Map();
  const classes = new Set();
  const list = () => ({add(){},remove(){},toggle(){}});
  const buttons = Object.fromEntries(['steerLeft', 'steerRight', 'throttle', 'jump', 'boost'].map(action => [action, {
    dataset: {touchAction: action},
    classList:list(),
    closest() {return this;},
    setPointerCapture() {},
  }]));
  const root = {
    classList: { toggle(name, force) { if(force) classes.add(name); else classes.delete(name); } },
    ownerDocument: {body:{classList:list()}},
    contains(button) { return Object.values(buttons).includes(button); },
    addEventListener(name, fn) {rootListeners.set(name, fn);},
    removeEventListener(name) {rootListeners.delete(name);},
  };
  const toggle = {
    classList:list(),
    addEventListener(name, fn) {buttonListeners.set(name, fn);},
    removeEventListener(name) {buttonListeners.delete(name);},
    setAttribute() {},
  };
  const target = {
    addEventListener(name, fn) {keyListeners.set(name, fn);},
    removeEventListener(name) {keyListeners.delete(name);},
  };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = {
    addEventListener(name, fn) {windowListeners.set(name, fn);},
    removeEventListener(name) {windowListeners.delete(name);},
  };
  globalThis.document = {
    getElementById(name) { return name === 'touch-controls' ? root : name === 'touch-toggle' ? toggle : null; },
    addEventListener(name, fn) {docListeners.set(name, fn);},
    removeEventListener(name) {docListeners.delete(name);},
  };
  let input;
  try {
    input = new InputManager(CONTROLS, target);
    // Emulate iPad detection even when test runs on a headless Linux server.
    input.touch.isTouch = true;
    input.setGameActive(true);
    const press = (action, id) => rootListeners.get('pointerdown')({
      pointerId:id, target:buttons[action], preventDefault(){},
    });
    press('throttle',1);
    press('steerLeft',2);
    press('boost',3);
    press('jump',4);
    const first = input.poll();
    assert.equal(first.controls.throttle, 1);
    assert.equal(first.controls.steer, -1);
    assert.equal(first.controls.boost, true);
    assert.equal(first.controls.jumpPressed, true);
    assert.equal(input.poll().controls.jumpPressed, false, 'jump edge delivered once');
    buttonListeners.get('click')(); // Hide virtual buttons
    assert.ok(classes.has('hidden'));
    assert.equal(input.poll().controls.throttle, 0, 'no stuck throttle after hiding');
    keyListeners.get('keydown')({code:'KeyW', target:{tagName:'BODY'}, preventDefault(){}});
    keyListeners.get('keydown')({code:'KeyD', target:{tagName:'BODY'}, preventDefault(){}});
    const physicalKeys = input.poll();
    assert.equal(physicalKeys.controls.throttle, 1);
    assert.equal(physicalKeys.controls.steer, 1);
    keyListeners.get('keyup')({code:'KeyW'});
    keyListeners.get('keyup')({code:'KeyD'});
    buttonListeners.get('click')(); // Show virtual buttons again
    assert.ok(!classes.has('hidden'));
    press('throttle',5);
    assert.equal(input.poll().controls.throttle, 1);
  } finally {
    input?.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
