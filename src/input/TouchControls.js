/**
 * Native multi-touch controller for Safari/iPadOS and other pointer-enabled devices.
 * It does not synthesize keyboard events: physical keyboard/gamepad remain independent.
 */
const PREFERENCE_KEY = 'rocket-arena-touch-controls-visible';

const detectTouch = () =>
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches);

export class TouchControls {
  constructor(
    root,
    isTouch = detectTouch(),
    toggle = typeof document !== 'undefined' ? document.getElementById('touch-toggle') : null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
  ) {
    this.root = root;
    this.toggle = toggle;
    this.storage = storage;
    this.isTouch = !!isTouch;
    this.gameActive = false;
    this.active = false;
    this.visible = true;
    try { this.visible = storage?.getItem(PREFERENCE_KEY) !== 'false'; } catch { /* Private browsing */ }

    this.pointers = new Map(); // pointerId -> { action, element }
    this.edges = new Set();
    this.onDown = this._down.bind(this);
    this.onUp = this._up.bind(this);
    this.onToggle = () => this.setVisible(!this.visible);
    this.onWindowBlur = () => this.clear();
    this.onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) this.clear();
    };

    if (root) {
      root.addEventListener('pointerdown', this.onDown);
      root.addEventListener('pointerup', this.onUp);
      root.addEventListener('pointercancel', this.onUp);
      root.addEventListener('lostpointercapture', this.onUp);
    }
    toggle?.addEventListener('click', this.onToggle);
    if (typeof window !== 'undefined') window.addEventListener('blur', this.onWindowBlur);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.setActive(false);
  }

  _down(e) {
    if (!this.active) return;
    const button = e.target.closest?.('[data-touch-action]');
    if (!button || (this.root?.contains && !this.root.contains(button)) || this.pointers.has(e.pointerId)) return;
    // A physical mouse can operate the touch overlay as well; iPad Pencil and fingers work.
    e.preventDefault();
    try { button.setPointerCapture?.(e.pointerId); } catch { /* Safari may refuse capture */ }
    const action = button.dataset.touchAction;
    if (!action) return;
    this.pointers.set(e.pointerId, { action, element: button });
    button.classList.add('pressed');
    this.edges.add(action);
  }

  _up(e) {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;
    e.preventDefault?.();
    this.pointers.delete(e.pointerId);
    if (![...this.pointers.values()].some(p => p.element === pointer.element)) {
      pointer.element.classList.remove('pressed');
    }
  }

  held(action) {
    return this.active && [...this.pointers.values()].some(p => p.action === action);
  }

  consumeEdge(action) {
    if (!this.active) return false;
    const pressed = this.edges.has(action);
    this.edges.delete(action);
    return pressed;
  }

  clear() {
    for (const pointer of this.pointers.values()) pointer.element.classList.remove('pressed');
    this.pointers.clear();
    this.edges.clear();
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
      this.root.removeEventListener('pointerup', this.onUp);
      this.root.removeEventListener('pointercancel', this.onUp);
      this.root.removeEventListener('lostpointercapture', this.onUp);
    }
    this.toggle?.removeEventListener('click', this.onToggle);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onWindowBlur);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
