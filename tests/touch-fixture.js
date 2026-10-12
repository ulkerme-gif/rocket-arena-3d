/** Minimal DOM stand-ins for the touch overlay, enough for TouchControls / InputManager in Node. */
export function classList() {
  const values = new Set();
  return {
    values,
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    toggle(name, force) { if (force ?? !values.has(name)) values.add(name); else values.delete(name); },
    contains(name) { return values.has(name); },
  };
}

export function element(extra = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    classList: classList(), listeners, attributes, style: {}, dataset: {},
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    setAttribute(name, val) { attributes.set(name, val); },
    setPointerCapture() {},
    ...extra,
  };
}

/**
 * Builds #touch-controls with a stick zone and the right-hand buttons.
 * `under` decides what document.elementFromPoint returns (to simulate sliding fingers).
 */
export function touchOverlay(actions = ['jump', 'boost', 'handbrake', 'ballCam', 'reset', 'resetBall']) {
  const state = { under: null };
  const body = { classList: classList() };
  const doc = { body, elementFromPoint: () => state.under };
  const buttons = {};
  for (const action of actions) {
    const button = element({ closest(sel) { return sel === '[data-touch-action]' ? this : null; } });
    button.dataset.touchAction = action;
    buttons[action] = button;
  }
  const knob = element();
  const base = element();
  const zone = element({
    closest(sel) { return sel === '[data-touch-stick]' ? this : null; },
    querySelector(sel) { return sel === '.stick-base' ? base : sel === '.stick-knob' ? knob : null; },
    getBoundingClientRect() { return { left: 0, top: 300, width: 500, height: 400 }; },
  });
  const root = element({
    ownerDocument: doc,
    querySelector(sel) { return sel === '[data-touch-stick]' ? zone : null; },
    contains(node) { return node === zone || Object.values(buttons).includes(node); },
  });
  const toggle = element();
  const win = element();
  const store = new Map();
  const storage = { getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k, v) { store.set(k, v); } };
  const event = (target, pointerId, x = 0, y = 0) => ({ target, pointerId, clientX: x, clientY: y, preventDefault() {} });
  const empty = { closest() { return null; } };
  return { root, zone, base, knob, buttons, toggle, win, storage, store, doc, state, event, empty };
}
