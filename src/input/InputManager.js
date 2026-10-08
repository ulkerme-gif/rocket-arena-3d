import { clamp } from '../core/math.js';

/**
 * Keyboard + gamepad -> one standard ControlState plus UI actions.
 * Keyboard bindings use KeyboardEvent.code (physical key positions), so
 * they work the same on Turkish Q / US layouts. See config/controls.js.
 */
export class InputManager {
  constructor(controlsConfig, target = window) {
    this.cfg = controlsConfig;
    this.target = target;
    this.keys = new Set();
    this.edges = new Set();
    this.padPrev = new Map();
    this.gameActive = false;
    this.lastDevice = 'keyboard';
    this._gameKeys = new Set(Object.values(controlsConfig.keyboard).flat());
    this._onDown = (e) => this._keyDown(e);
    this._onUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  /** While a match is running, game keys must not scroll or press focused buttons. */
  setGameActive(active) {
    this.gameActive = active;
  }

  _keyDown(e) {
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (this.gameActive && !typing && !e.metaKey && this._gameKeys.has(e.code)) e.preventDefault();
    if (e.metaKey || e.repeat) return; // keep macOS Cmd shortcuts intact
    this.keys.add(e.code);
    this.edges.add(e.code);
    this.lastDevice = 'keyboard';
  }

  _held(action) {
    const list = this.cfg.keyboard[action];
    return !!list && list.some((c) => this.keys.has(c));
  }

  _edge(action) {
    const list = this.cfg.keyboard[action];
    return !!list && list.some((c) => this.edges.has(c));
  }

  getGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  /** Call once per rendered frame. Returns { controls, actions }. */
  poll() {
    const k = (a) => (this._held(a) ? 1 : 0);
    let throttle = k('throttle') - k('reverse');
    let steer = k('steerRight') - k('steerLeft');
    let pitch = throttle; // keyboard: W = gas on the ground, nose down in the air
    let roll = k('rollRight') - k('rollLeft');
    let jump = this._held('jump');
    let jumpPressed = this._edge('jump');
    let boost = this._held('boost');
    let handbrake = this._held('handbrake');
    const actions = {
      ballCam: this._edge('ballCam'),
      reset: this._edge('reset'),
      resetBall: this._edge('resetBall'),
      pause: this._edge('pause'),
      debug: this._edge('debug'),
    };
    this.edges.clear();

    const pad = this.getGamepad();
    if (pad) {
      const g = this.cfg.gamepad;
      const axis = (i) => {
        const v = pad.axes[i] ?? 0;
        const a = Math.abs(v);
        return a < g.deadzone ? 0 : (Math.sign(v) * (a - g.deadzone)) / (1 - g.deadzone);
      };
      const btn = (i) => pad.buttons[i];
      const val = (i) => (btn(i) ? btn(i).value ?? (btn(i).pressed ? 1 : 0) : 0);
      const down = (i) => !!(btn(i) && btn(i).pressed);
      const edge = (name) => down(g.buttons[name]) && !this.padPrev.get(g.buttons[name]);
      const sx = axis(g.axes.steer);
      const sy = axis(g.axes.pitch);
      const padThrottle = val(g.buttons.throttle) - val(g.buttons.reverse);
      if (Math.abs(padThrottle) > 0.05) throttle = clamp(padThrottle, -1, 1);
      if (sx !== 0) steer = sx;
      if (sy !== 0) pitch = g.invertPitch ? sy : -sy;
      const padRoll = (down(g.buttons.rollRight) ? 1 : 0) - (down(g.buttons.rollLeft) ? 1 : 0);
      if (padRoll !== 0) roll = padRoll;
      jump = jump || down(g.buttons.jump);
      jumpPressed = jumpPressed || edge('jump');
      boost = boost || down(g.buttons.boost);
      handbrake = handbrake || down(g.buttons.handbrake);
      actions.ballCam = actions.ballCam || edge('ballCam');
      actions.reset = actions.reset || edge('reset');
      actions.pause = actions.pause || edge('pause');
      if (sx || sy || Math.abs(padThrottle) > 0.05 || pad.buttons.some((b) => b && b.pressed)) this.lastDevice = 'gamepad';
      for (const i of Object.values(g.buttons)) this.padPrev.set(i, down(i));
    }

    let yaw = steer;
    if (handbrake && roll === 0) {
      // Holding powerslide in the air turns steering into "free air roll" (RL style).
      roll = steer;
      yaw = 0;
    }
    return { controls: { throttle, steer, pitch, yaw, roll, jump: jump || jumpPressed, boost, handbrake, jumpPressed }, actions };
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onDown);
    this.target.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
