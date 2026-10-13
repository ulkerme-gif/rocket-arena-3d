import * as THREE from 'three';
import { CONFIG } from './config/index.js';
import { buildArenaGeometry } from './arena/ArenaGeometry.js';
import { BotController } from './ai/BotController.js';
import { CameraRig } from './camera/CameraRig.js';
import { GameLoop } from './core/GameLoop.js';
import { MODE, PHASE, TEAM } from './game/constants.js';
import { Simulation } from './game/Simulation.js';
import { formatLabel, normalizeTeamSize, TEAM_SIZES } from './game/teams.js';
import { InputManager } from './input/InputManager.js';
import { Settings } from './ui/Settings.js';
import { ArenaView } from './visuals/ArenaView.js';
import { GameView } from './visuals/GameView.js';
import { Renderer } from './visuals/Renderer.js';
import { CarView } from './visuals/CarView.js';
import { NameTags } from './visuals/NameTags.js';
import { makeStaticCar } from './visuals/staticCar.js';
import { loadSkin, saveSkin } from './visuals/skins.js';
import { Garage } from './ui/Garage.js';

const el = (id) => document.getElementById(id);
const show = (id, visible) => el(id).classList.toggle('hidden', !visible);
const fmtTime = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const _carPos = new THREE.Vector3();
const _carQuat = new THREE.Quaternion();
const _vel = new THREE.Vector3();
const _ballPos = new THREE.Vector3();
const _ballQuat = new THREE.Quaternion();
const _focus = new THREE.Vector3(0, 2, 0);
const TEAM_SIZE_KEY = 'rocket-arena-team-size';
const _up = new THREE.Vector3(0, 1, 0);
const PREVIEW_Y = 0.39; // resting height of a car on its wheels

/** Browser-facing composition root. The simulation remains pure and headless-testable. */
export class App {
  constructor(RAPIER) {
    this.RAPIER = RAPIER;
    this.settings = new Settings(CONFIG);
    this.renderer = new Renderer(el('game-canvas'), CONFIG);
    this.arenaGeometry = buildArenaGeometry(CONFIG.arena);
    this.arenaView = new ArenaView(this.renderer.scene, this.arenaGeometry, this.renderer.renderer);
    this.camera = new CameraRig(this.renderer.camera, CONFIG.camera);
    this.input = new InputManager(CONFIG.controls);
    this.sim = null;
    this.view = null;
    this.mode = null;
    this.teamSize = 1;
    try { this.teamSize = normalizeTeamSize(localStorage.getItem(TEAM_SIZE_KEY)); } catch { /* private mode */ }
    this.paused = false;
    this.settingsFrom = 'menu';
    this.showDebug = false;
    this.controls = {};
    this.unsubs = [];
    this.messageExpires = 0;
    this.matchEnded = false;
    this.running = false;
    this.loop = new GameLoop({
      fixedDt: 1 / CONFIG.physics.world.tickRate,
      onStep: () => this._step(),
      onRender: (alpha, dt) => this._render(alpha, dt),
    });
    this.nameTags = new NameTags(el('name-tags'));
    this.tagObjects = null;
    this.preview = null;
    this.returnToOnline = false;
    this.garage = new Garage(document, {
      onChange: (skin) => this.preview?.view.setSkin(skin),
      onSave: (skin) => this.closeGarage(saveSkin(skin)),
      onClose: () => this.closeGarage(null),
    });
    this._bindUI();
    this._renderSettings();
    this._setMenu(true);
    const garageParam = new URLSearchParams(location.search).get('garaj');
    if (garageParam) {
      this.returnToOnline = garageParam === 'online';
      this.openGarage();
    }
    this.settings.onChange(() => {
      this.renderer.setShadows(CONFIG.graphics.shadows);
      this._renderSettings();
      if (this.sim) for (const bot of this.sim.bots.values()) bot.setDifficulty(CONFIG.bot.difficulty);
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop.start();
  }

  _bindUI() {
    el('play-match').addEventListener('click', () => this.startGame(MODE.MATCH));
    for (const button of el('team-size').querySelectorAll('[data-team-size]')) {
      button.addEventListener('click', () => this.setTeamSize(button.dataset.teamSize));
    }
    this.setTeamSize(this.teamSize);
    el('play-training').addEventListener('click', () => this.startGame(MODE.TRAINING));
    el('open-garage').addEventListener('click', () => this.openGarage());
    // Garage: drag on the 3D view to turn the car.
    const canvas = el('game-canvas');
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.preview) return;
      this.preview.drag = { id: e.pointerId, x: e.clientX };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const drag = this.preview?.drag;
      if (!drag || drag.id !== e.pointerId) return;
      this.preview.angle += (e.clientX - drag.x) * 0.012;
      drag.x = e.clientX;
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { if (this.preview) this.preview.drag = null; });
    el('open-settings').addEventListener('click', () => this.openSettings('menu'));
    el('pause-button').addEventListener('click', () => this.pause());
    el('resume').addEventListener('click', () => this.resume());
    el('pause-settings').addEventListener('click', () => this.openSettings('pause'));
    el('back-to-menu').addEventListener('click', () => this.returnToMenu());
    el('end-to-menu').addEventListener('click', () => this.returnToMenu());
    el('rematch').addEventListener('click', () => this.startGame(this.mode ?? MODE.MATCH));
    el('close-settings').addEventListener('click', () => this.closeSettings());
    el('reset-settings').addEventListener('click', () => this.settings.reset());
    const bind = (id, key, parser = Number) => el(id).addEventListener('input', (e) => this.settings.set(key, parser(e.target.value)));
    bind('setting-fov', 'fov');
    bind('setting-distance', 'distance');
    bind('setting-bot', 'botDifficulty', String);
    el('setting-shadows').addEventListener('change', (e) => this.settings.set('shadows', e.target.checked));
    el('setting-ballcam').addEventListener('change', (e) => {
      this.settings.set('ballCamDefault', e.target.checked);
      this.camera.setBallCam(e.target.checked);
    });
  }

  /** 1v1 / 2v2 / 3v3 against bots; remembered for next time. */
  setTeamSize(value) {
    this.teamSize = normalizeTeamSize(value);
    try { localStorage.setItem(TEAM_SIZE_KEY, String(this.teamSize)); } catch { /* private mode */ }
    for (const button of el('team-size').querySelectorAll('[data-team-size]')) {
      const on = Number(button.dataset.teamSize) === this.teamSize;
      button.setAttribute('aria-checked', String(on));
      button.classList.toggle('active', on);
    }
    el('play-match-label').textContent = `${formatLabel(this.teamSize)} · BOTLARA KARŞI`;
  }

  _renderSettings() {
    const v = this.settings.values;
    el('setting-fov').value = v.fov;
    el('fov-output').value = `${v.fov}°`;
    el('setting-distance').value = v.distance;
    el('distance-output').value = Number(v.distance).toFixed(1);
    el('setting-bot').value = v.botDifficulty;
    el('setting-shadows').checked = !!v.shadows;
    el('setting-ballcam').checked = !!v.ballCamDefault;
  }

  _setMenu(visible) {
    show('main-menu', visible);
    show('hud', !visible && !!this.sim);
    show('boost-widget', !visible && !!this.sim);
    show('camera-label', !visible && !!this.sim);
    show('control-strip', true);
    this.input.setGameActive(!visible && !this.paused);
  }

  startGame(mode) {
    this._clearSession();
    this.mode = mode;
    this.matchEnded = false;
    const n = TEAM_SIZES.includes(this.teamSize) ? this.teamSize : 1;
    // You drive blue 'player'; bots take every other seat (teammates and opponents).
    const bots = mode === MODE.MATCH ? [
      ...Array.from({ length: n - 1 }, (_, i) => ({ id: `blue-${i + 2}`, team: TEAM.BLUE, kind: 'bot' })),
      ...Array.from({ length: n }, (_, i) => ({ id: `orange-${i + 1}`, team: TEAM.ORANGE, kind: 'bot' })),
    ] : [];
    this.sim = new Simulation({
      RAPIER: this.RAPIER,
      config: CONFIG,
      mode,
      players: [{ id: 'player', team: TEAM.BLUE, kind: 'human' }, ...bots],
    });
    for (const bot of bots) {
      this.sim.attachBot(bot.id, new BotController({ carId: bot.id, team: bot.team, config: CONFIG.bot }));
    }
    this.matchLabel = mode === MODE.MATCH ? formatLabel(n) : 'FREE PLAY';
    document.body.classList.toggle('mode-training', mode === MODE.TRAINING);
    this.view = new GameView(this.renderer, this.sim);
    this.view.carViews.get('player')?.setSkin(loadSkin());
    this.tagObjects = new Map([...this.view.carViews].map(([id, view]) => [id, view.group]));
    this.nameTags.set(this.sim.cars.filter((c) => c.id !== 'player').map((c) => ({ id: c.id, text: 'BOT', team: c.team })));
    this.unsubs.push(
      this.sim.events.on('goal', (e) => this._announce(`${e.team === TEAM.BLUE ? 'MAVİ' : 'TURUNCU'} GOL!`, 2500)),
      this.sim.events.on('matchEnd', () => this._finishMatch()),
      this.sim.events.on('kickoff', () => this.camera.snap()),
      this.sim.events.on('warning', (e) => console.warn('[Arena]', e)),
    );
    this.sim.start();
    this.controls = {};
    this.camera.setBallCam(CONFIG.camera.defaultBallCam);
    this.camera.snap();
    this.paused = false;
    this.loop.setPaused(false);
    this._setMenu(false);
    show('pause-menu', false);
    show('end-menu', false);
    show('settings-menu', false);
    show('center-message', false);
  }

  _clearSession() {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.nameTags.clear();
    this.tagObjects = null;
    this.view?.dispose();
    this.view = null;
    this.sim?.dispose();
    this.sim = null;
    this.controls = {};
    this.messageExpires = 0;
    this.matchEnded = false;
  }

  returnToMenu() {
    this._clearSession();
    document.body.classList.remove('mode-training');
    this.paused = false;
    this.loop.setPaused(false);
    this.camera.snap();
    this._setMenu(true);
    for (const id of ['pause-menu', 'settings-menu', 'end-menu', 'center-message', 'debug-panel']) show(id, false);
  }

  pause() {
    if (!this.sim || this.paused || this.matchEnded) return;
    this.paused = true;
    this.loop.setPaused(true);
    this.input.setGameActive(false);
    show('pause-menu', true);
    show('center-message', false);
  }

  resume() {
    if (!this.sim || this.matchEnded) return;
    this.paused = false;
    this.controls = {};
    this.loop.setPaused(false);
    this.input.setGameActive(true);
    show('pause-menu', false);
    show('settings-menu', false);
  }

  openSettings(from) {
    this.settingsFrom = from;
    if (from === 'pause') show('pause-menu', false);
    this._renderSettings();
    this.input.setGameActive(false);
    show('settings-menu', true);
  }

  closeSettings() {
    show('settings-menu', false);
    if (this.settingsFrom === 'pause') show('pause-menu', true);
  }

  _finishMatch() {
    if (!this.sim) return;
    this.matchEnded = true;
    const s = this.sim.rules.score;
    el('match-result').textContent = s.blue > s.orange ? 'KAZANDIN!' : s.orange > s.blue ? 'MAÇ SONA ERDİ' : 'BERABERE';
    el('final-score').textContent = `${s.blue} — ${s.orange}`;
    show('end-menu', true);
    show('center-message', false);
    this.input.setGameActive(false);
  }

  _announce(text, ms = 1800) {
    el('center-message').textContent = text;
    this.messageExpires = performance.now() + ms;
    show('center-message', true);
  }

  _step() {
    if (!this.sim || this.matchEnded || this.paused) return;
    this.sim.step({ player: this.controls });
  }

  _render(alpha, dt) {
    const input = this.input.poll();
    if (this.sim) {
      if (input.actions.pause && !this.matchEnded && !this._settingsOpen()) {
        this.paused ? this.resume() : this.pause();
      }
      if (!this.paused && !this.matchEnded) {
        this.controls = input.controls;
        if (input.actions.ballCam) this.camera.toggleBallCam();
        if (input.actions.reset && this.mode === MODE.TRAINING) { this.sim.resetCar('player'); this.camera.snap(); }
        if (input.actions.resetBall && this.mode === MODE.TRAINING) this.sim.resetBall();
      } else {
        this.controls = {};
      }
      if (input.actions.debug) this.showDebug = !this.showDebug;
      this.view.update(alpha, dt);
      const car = this.sim.carById.get('player');
      if (car) {
        car.getRenderTransform(alpha, _carPos, _carQuat);
        _vel.copy(car.velocity);
        this.sim.ball.getRenderTransform(alpha, _ballPos, _ballQuat);
        if (this.matchEnded) this.camera.updateOrbit(dt, this.sim.dims, _focus.copy(_ballPos));
        else this.camera.update(dt, { carPos: _carPos, carQuat: _carQuat, carVel: _vel,
          grounded: car.state.onGround, ballPos: _ballPos, ballVisible: this.sim.ball.enabled,
          arenaHeight: this.sim.dims.H });
      }
      this.renderer.camera.updateMatrixWorld();
      this.nameTags.update(this.renderer.camera, this.tagObjects, window.innerWidth, window.innerHeight);
      this._updateHUD();
    } else if (this.preview) {
      this._renderGarage(dt);
    } else {
      this.camera.updateOrbit(dt, this.arenaGeometry.dims, _focus);
    }
    this.renderer.render();
  }

  // ---------------------------------------------------------------- garage
  openGarage() {
    if (this.sim) return;
    show('main-menu', false);
    show('garage', true);
    const skin = loadSkin();
    this.garage.open(skin);
    if (!this.preview) {
      const root = new THREE.Group();
      root.name = 'garage-preview';
      this.renderer.scene.add(root);
      const car = makeStaticCar({ id: 'preview', team: TEAM.BLUE, position: { x: 0, y: PREVIEW_Y, z: 0 } });
      for (const wheel of car.wheels) wheel.suspension = 0.14;
      const view = new CarView(car, root);
      this.preview = { root, car, view, angle: 2.3, drag: null };
    }
    this.preview.view.setSkin(skin);
  }

  closeGarage() {
    if (this.preview) {
      this.renderer.scene.remove(this.preview.root);
      this.preview.root.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.map?.dispose(); m.dispose(); }
      });
      this.preview = null;
    }
    show('garage', false);
    if (this.returnToOnline) { location.href = './online.html'; return; }
    show('main-menu', true);
    this.camera.snap();
  }

  /** Turntable + a camera that frames the car beside (landscape) or above (portrait) the panel. */
  _renderGarage(dt) {
    const p = this.preview;
    if (!p.drag) p.angle += dt * 0.35;
    p.car.quaternion.setFromAxisAngle(_up, p.angle);
    p.view.update(1);
    const cam = this.renderer.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const panel = el('garage').querySelector('.garage-panel').getBoundingClientRect();
    const sheet = panel.width >= W * 0.9; // portrait: panel is a bottom sheet
    const dist = sheet ? 2.7 : 3.2;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const offX = sheet ? 0 : -(Math.min(panel.right, W * 0.7) / W) * dist * tanHalf * cam.aspect;
    const offY = sheet ? -(Math.min(H - panel.top, H * 0.7) / H) * dist * tanHalf : 0;
    cam.position.set(offX, PREVIEW_Y + 0.75 + offY, dist);
    cam.lookAt(offX, PREVIEW_Y + 0.05 + offY, 0);
  }

  _settingsOpen() { return !el('settings-menu').classList.contains('hidden'); }

  _updateHUD() {
    const s = this.sim.getState();
    el('score-blue').textContent = s.score.blue;
    el('score-orange').textContent = s.score.orange;
    el('clock').textContent = this.mode === MODE.TRAINING ? '∞' : s.isOvertime ? `+${fmtTime(s.overtimeElapsed)}` : fmtTime(s.timeRemaining);
    el('period').textContent = this.mode === MODE.TRAINING ? 'FREE PLAY' : s.isOvertime ? 'OVERTIME' : this.matchLabel;
    const me = s.cars.find((c) => c.id === 'player');
    const boost = Math.round(me?.boost ?? 0);
    el('boost-number').textContent = boost;
    el('boost-fill').style.width = `${boost}%`;
    el('camera-label').innerHTML = `BALL CAM <strong>${this.camera.ballCam ? 'ON' : 'OFF'}</strong>`;
    if (!this.paused && !this.matchEnded && s.phase === PHASE.COUNTDOWN) {
      el('center-message').textContent = String(Math.max(1, Math.ceil(this.sim.rules.countdown)));
      show('center-message', true);
    } else if (!this.paused && !this.matchEnded && performance.now() > this.messageExpires) {
      show('center-message', false);
    }
    show('debug-panel', this.showDebug);
    if (this.showDebug) {
      const bot = this.sim.bots.values().next().value;
      el('debug-panel').textContent = `FPS ${this.loop.stats.fps} · TICK ${s.tick} · BOT ${bot?.debug?.mode ?? '-'} · BALL ${s.ball.position.x.toFixed(1)},${s.ball.position.y.toFixed(1)},${s.ball.position.z.toFixed(1)}`;
    }
  }
}
