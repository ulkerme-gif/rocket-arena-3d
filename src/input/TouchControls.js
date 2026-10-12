/**
 * iPad / touch controls: a floating analog stick on the left, action buttons on the right.
 *
 * - Stick (left thumb): wherever the thumb lands in the left zone becomes the centre.
 *   Push up = gas (nose down in the air), pull down = reverse (nose up), left/right = steer.
 * - Buttons (right thumb): ZIPLA, BOOST, DRIFT, KAMERA (+ reset buttons in training).
 *   A finger can slide from one button to another without lifting (e.g. BOOST -> ZIPLA).
 * - Several fingers work at once. Nothing is ever left "stuck" after a lift, a cancel,
 *   hiding the overlay, leaving the match or switching apps.
 * It never synthesizes keyboard events; a hardware keyboard / gamepad keeps working.
 */
const PREFERENCE_KEY = 'rocket-arena-touch-controls-visible';
export const STICK_RADIUS = 58;     // px of thumb travel for full deflection
export const STICK_DEADZONE = 0.12;

const detectTouch = () =>
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches);

const shape = (v, full) => {
  const a = Math.abs(v);
  if (a < STICK_DEADZONE) return 0;
  return Math.sign(v) * Math.min(1, (a - STICK_DEADZONE) / (full - STICK_DEADZONE));
};

/**
 * Stick vector (x right, y down, both in [-1, 1]) -> driving controls.
 * Full steering lock at 85 % deflection; gas reaches 100 % with a small push up so
 * the thumb can sit far left/right (full lock) and still keep full throttle.
 * Reverse needs a more deliberate pull so steering never brakes by accident.
 */
export function stickToControls(x, y) {
  const steer = shape(x, 0.85);
  const up = shape(-y, 1);
  const throttle = up > 0 ? Math.min(1, up / 0.15) : up < 0 ? Math.max(-1, up / 0.3) : 0;
  return { steer, throttle, pitch: up, engaged: steer !== 0 || up !== 0 };
}

export class TouchControls {
  constructor(
    root,
    isTouch = detectTouch(),
    toggle = typeof document !== 'undefined' ? document.getElementById('touch-toggle') : null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    win = typeof window !== 'undefined' ? window : null,
  ) {
    this.root = root;
    this.toggle = toggle;
    this.storage = storage;
    this.win = win;
    this.doc = root?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    this.isTouch = !!isTouch;
    this.gameActive = false;
    this.active = false;
    this.visible = true;
    try { this.visible = storage?.getItem(PREFERENCE_KEY) !== 'false'; } catch { /* Private browsing */ }

    this.pointers = new Map(); // pointerId -> { kind: 'button', action, element } | { kind: 'stick', ox, oy }
    this.edges = new Set();
    this.stick = { x: 0, y: 0, pointerId: null };
    this.stickZone = root?.querySelector?.('[data-touch-stick]') ?? null;
    this.stickBase = this.stickZone?.querySelector?.('.stick-base') ?? null;
    this.stickKnob = this.stickZone?.querySelector?.('.stick-knob') ?? null;

    this.onDown = this._down.bind(this);
    this.onMove = this._move.bind(this);
    this.onUp = this._up.bind(this);
    this.onToggle = () => this.setVisible(!this.visible);
    this.onWindowBlur = () => this.clear();
    this.onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) this.clear();
    };

    if (root) {
      root.addEventListener('pointerdown', this.onDown);
      root.addEventListener('pointermove', this.onMove);
      root.addEventListener('pointerup', this.onUp);
      root.addEventListener('pointercancel', this.onUp);
      root.addEventListener('lostpointercapture', this.onUp);
      // Safari: stop long-press magnifier / selection and double-tap zoom on the controls.
      root.addEventListener('touchstart', this._preventTouch, { passive: false });
      root.addEventListener('contextmenu', this._preventTouch);
    }
    // Lifts can happen outside the overlay (finger slid onto the 3D view): listen globally too.
    win?.addEventListener('pointermove', this.onMove);
    win?.addEventListener('pointerup', this.onUp);
    win?.addEventListener('pointercancel', this.onUp);
    win?.addEventListener('blur', this.onWindowBlur);
    toggle?.addEventListener('click', this.onToggle);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.setActive(false);
  }

  _preventTouch(e) {
    if (e.cancelable) e.preventDefault();
  }

  _down(e) {
    if (!this.active || this.pointers.has(e.pointerId)) return;
    const zone = e.target?.closest?.('[data-touch-stick]');
    if (zone && (!this.root?.contains || this.root.contains(zone))) {
      if (this.stick.pointerId !== null) return; // one thumb steers
      e.preventDefault?.();
      try { zone.setPointerCapture?.(e.pointerId); } catch { /* Safari may refuse capture */ }
      this.pointers.set(e.pointerId, { kind: 'stick', ox: e.clientX ?? 0, oy: e.clientY ?? 0 });
      this.stick.pointerId = e.pointerId;
      this.stick.x = 0; this.stick.y = 0;
      this._placeStick(e.clientX ?? 0, e.clientY ?? 0);
      return;
    }
    const button = e.target?.closest?.('[data-touch-action]');
    if (!button || (this.root?.contains && !this.root.contains(button))) return;
    e.preventDefault?.();
    this._press(e.pointerId, button);
  }

  _move(e) {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;
    if (pointer.kind === 'stick') {
      let x = ((e.clientX ?? 0) - pointer.ox) / STICK_RADIUS;
      let y = ((e.clientY ?? 0) - pointer.oy) / STICK_RADIUS;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      this.stick.x = x; this.stick.y = y;
      this._drawKnob();
      e.preventDefault?.();
      return;
    }
    // Slide between buttons: the button under the finger takes over. Drifting onto
    // empty space keeps the current button held until the finger lifts.
    const under = this.doc?.elementFromPoint?.(e.clientX, e.clientY)?.closest?.('[data-touch-action]');
    if (under && under !== pointer.element && (!this.root?.contains || this.root.contains(under))) {
      this._release(e.pointerId);
      this._press(e.pointerId, under);
    }
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault?.();
    this._release(e.pointerId);
  }

  _press(pointerId, button) {
    const action = button.dataset?.touchAction;
    if (!action) return;
    this.pointers.set(pointerId, { kind: 'button', action, element: button });
    button.classList?.add('pressed');
    this.edges.add(action);
  }

  _release(pointerId) {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return;
    this.pointers.delete(pointerId);
    if (pointer.kind === 'stick') {
      this.stick.pointerId = null;
      this.stick.x = 0; this.stick.y = 0;
      this._resetStickVisual();
      return;
    }
    if (![...this.pointers.values()].some(p => p.element === pointer.element)) {
      pointer.element.classList?.remove('pressed');
    }
  }

  _placeStick(clientX, clientY) {
    if (!this.stickZone || !this.stickBase) return;
    const rect = this.stickZone.getBoundingClientRect?.();
    if (!rect) return;
    this.stickBase.style.left = `${clientX - rect.left}px`;
    this.stickBase.style.top = `${clientY - rect.top}px`;
    this.stickBase.style.bottom = 'auto';
    this.stickZone.classList?.add('engaged');
    this._drawKnob();
  }

  _drawKnob() {
    if (this.stickKnob?.style) {
      this.stickKnob.style.transform = `translate(${(this.stick.x * STICK_RADIUS).toFixed(1)}px, ${(this.stick.y * STICK_RADIUS).toFixed(1)}px)`;
    }
  }

  _resetStickVisual() {
    if (this.stickBase?.style) {
      this.stickBase.style.left = '';
      this.stickBase.style.top = '';
      this.stickBase.style.bottom = '';
    }
    if (this.stickKnob?.style) this.stickKnob.style.transform = '';
    this.stickZone?.classList?.remove('engaged');
  }

  held(action) {
    return this.active && [...this.pointers.values()].some(p => p.kind === 'button' && p.action === action);
  }

  consumeEdge(action) {
    if (!this.active) return false;
    const pressed = this.edges.has(action);
    this.edges.delete(action);
    return pressed;
  }

  /** Analog driving controls from the stick, or null when the stick is not touched. */
  axes() {
    if (!this.active || this.stick.pointerId === null) return null;
    return stickToControls(this.stick.x, this.stick.y);
  }

  clear() {
    for (const pointer of this.pointers.values()) {
      if (pointer.kind === 'button') pointer.element.classList?.remove('pressed');
    }
    this.pointers.clear();
    this.edges.clear();
    this.stick.pointerId = null;
    this.stick.x = 0; this.stick.y = 0;
    this._resetStickVisual();
  }

  setVisible(visible) {
    this.visible = !!visible;
    try { this.storage?.setItem(PREFERENCE_KEY, String(this.visible)); } catch { /* Private browsing */ }
    this._sync();
  }

  setActive(active) {
    this.gameActive = !!active;
    this._sync();
  }

  _sync() {
    const shouldBeActive = this.isTouch && this.gameActive && this.visible;
    if (!shouldBeActive) this.clear(); // Never leave a stuck throttle/boost after switching.
    this.active = shouldBeActive;
    this.root?.classList.toggle('hidden', !shouldBeActive);
    if (this.toggle) {
      this.toggle.classList.toggle('hidden', !this.isTouch || !this.gameActive);
      this.toggle.textContent = this.visible ? '🎮 TUŞLARI GİZLE' : '🎮 TUŞLARI GÖSTER';
      this.toggle.setAttribute('aria-pressed', String(this.visible));
      this.toggle.setAttribute('aria-label', this.visible ? 'Dokunmatik oyun tuşlarını gizle' : 'Dokunmatik oyun tuşlarını göster');
    }
    this.root?.ownerDocument?.body?.classList.toggle('touch-keyboard-mode', this.isTouch && this.gameActive && !this.visible);
  }

  dispose() {
    this.setActive(false);
    if (this.root) {
      this.root.removeEventListener('pointerdown', this.onDown);
      this.root.removeEventListener('pointermove', this.onMove);
      this.root.removeEventListener('pointerup', this.onUp);
      this.root.removeEventListener('pointercancel', this.onUp);
      this.root.removeEventListener('lostpointercapture', this.onUp);
      this.root.removeEventListener('touchstart', this._preventTouch);
      this.root.removeEventListener('contextmenu', this._preventTouch);
    }
    this.win?.removeEventListener('pointermove', this.onMove);
    this.win?.removeEventListener('pointerup', this.onUp);
    this.win?.removeEventListener('pointercancel', this.onUp);
    this.win?.removeEventListener('blur', this.onWindowBlur);
    this.toggle?.removeEventListener('click', this.onToggle);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
