import './styles/main.css';
import './online/online.css';
import * as THREE from 'three';
import { CONFIG } from './config/index.js';
import { buildArenaGeometry } from './arena/ArenaGeometry.js';
import { Renderer } from './visuals/Renderer.js';
import { ArenaView } from './visuals/ArenaView.js';
import { CameraRig } from './camera/CameraRig.js';
import { InputManager } from './input/InputManager.js';
import { RemoteGameView } from './online/RemoteGameView.js';
import { websocketEndpoint } from './online/connectionUrl.js';

const el = id => document.getElementById(id);
const show = (id, visible) => el(id).classList.toggle('hidden', !visible);
const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const vel = new THREE.Vector3();
const ball = new THREE.Vector3(); const focus = new THREE.Vector3(0, 1, 0);
const clock = sec => `${Math.floor(Math.max(0,sec)/60)}:${String(Math.floor(Math.max(0,sec)%60)).padStart(2,'0')}`;

class OnlineApp {
  constructor() {
    this.renderer = new Renderer(el('game-canvas'), CONFIG);
    this.arena = new ArenaView(this.renderer.scene, buildArenaGeometry(CONFIG.arena), this.renderer.renderer);
    this.camera = new CameraRig(this.renderer.camera, CONFIG.camera);
    this.input = new InputManager(CONFIG.controls);
    this.ws = null; this.view = null; this.myId = null; this.state = null;
    this.ready = false; this.pendingJump = false; this.lastCount = null; this.lastSend = 0; this.prevTime = performance.now();
    this.inputSequence = 0;
    // An optional shared ?server=https://... link overrides the saved address.
    const linkedServer = new URLSearchParams(location.search).get('server');
    let savedServer = '';
    try { savedServer = localStorage.getItem('rocket-arena-ws-server') || ''; } catch {}
    el('server-url').value = linkedServer || savedServer || import.meta.env.VITE_WS_URL || '';
    this.toastUntil = 0; this.orbitDims = buildArenaGeometry(CONFIG.arena).dims;
    el('online-join').onclick = () => this.join();
    el('online-leave').onclick = () => this.leave();
    el('online-rematch').onclick = () => { if (this.ws?.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify({ type: 'rematch' })); this.toast('Rakibin tekrar maç oyu bekleniyor…', 180000); show('online-rematch', false); } };
    this._render = this._render.bind(this);
    requestAnimationFrame(this._render);
  }
  status(text) { el('online-status').textContent = text; }
  toast(text, ms = 2300) { el('online-toast').textContent = text; show('online-toast', true); this.toastUntil = performance.now() + ms; }
  join() {
    this.leave(false);
    this.inputSequence = 0;
    const room = el('room-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,14}$/.test(room)) { this.status('Oda kodu 3–14 harf/rakam olmalı.'); return; }
    let url;
    try { url = websocketEndpoint(el('server-url').value); }
    catch (error) { this.status(error.message); return; }
    try { localStorage.setItem('rocket-arena-ws-server', el('server-url').value.trim()); } catch {}
    el('online-join').disabled = true;
    this.status('Sunucuya bağlanılıyor… (ilk ücretsiz bağlantı biraz sürebilir)');
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, name: el('player-name').value }));
    ws.onmessage = event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'error') { this.status(data.detail); show('online-panel', true); el('online-join').disabled = false; ws.close(); }
      else if (data.type === 'joined') {
        this.myId = data.playerId;
        this.status(`Oda: ${data.room} · ${data.team === 'blue' ? 'MAVİ' : 'TURUNCU'} takım`);
        show('online-panel', false);
        this.toast('Rakip oyuncu bekleniyor…', 180000);
      } else if (data.type === 'roomStatus') {
        this.ready = data.status === 'playing';
        if (this.ready) {
          this.inputSequence = 0; this.pendingJump = false; this.lastSend = 0;
          this.disposeMatch(); show('online-rematch', false); this.lastCount = null;
        }
        this.input.setGameActive(this.ready);
        if (!this.ready) { this.disposeMatch(); this.toast('Rakip bekleniyor…', 180000); }
        else this.toast('MAÇ BAŞLIYOR!', 2000);
      } else if (data.type === 'snapshot') this.applySnapshot(data.state);
      else if (data.type === 'goal') this.toast(`${data.goal.team === 'blue' ? 'MAVİ' : 'TURUNCU'} GOL!`);
      else if (data.type === 'matchEnd') { this.toast('MAÇ BİTTİ!', 5000); show('online-rematch', true); }
      else if (data.type === 'rematchPending') this.toast('Tekrar maç için ikinci oyuncu bekleniyor…', 4000);
    };
    ws.onerror = () => this.status('Sunucuya bağlantı sağlanamadı.');
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.ready = false; this.myId = null;
      this.disposeMatch(); this.input.setGameActive(false);
      show('online-panel', true); el('online-join').disabled = false;
      this.status('Bağlantı kapandı. Tekrar bağlanabilirsin.');
    };
  }
  applySnapshot(state) {
    this.state = state;
    if (!this.view) { this.view = new RemoteGameView(this.renderer, state, this.myId); this.camera.snap(); }
    else this.view.onSnapshot(state);
    show('online-hud', true); show('online-boost', true); show('online-camera', true);
    el('online-blue').textContent = state.score.blue;
    el('online-orange').textContent = state.score.orange;
    el('online-clock').textContent = state.isOvertime ? `+${clock(state.overtimeElapsed)}` : clock(state.timeRemaining);
    el('online-period').textContent = state.isOvertime ? 'OVERTIME' : 'ONLINE 1V1';
    const me = state.cars.find(c => c.id === this.myId);
    const boost = Math.round(me?.boost || 0);
    el('online-boost-number').textContent = boost;
    el('online-boost-fill').style.width = `${boost}%`;
    if (state.phase === 'countdown') {
      const n = Math.max(1, Math.ceil(state.countdown ?? 3));
      if (this.lastCount !== n) { this.toast(String(n), 850); this.lastCount = n; }
    } else if (this.lastCount !== null && state.phase === 'playing') {
      this.lastCount = null; this.toast('BAŞLA!', 850);
    }
  }
  disposeMatch() {
    this.view?.dispose(); this.view = null; this.state = null;
    show('online-rematch', false);
    show('online-hud', false); show('online-boost', false); show('online-camera', false);
    this.camera.snap();
  }
  leave(showPanel = true) {
    if (this.ws) { const s = this.ws; this.ws = null; s.close(); }
    this.ready = false; this.myId = null; this.pendingJump = false; this.input.setGameActive(false);
    this.disposeMatch();
    if (showPanel) { show('online-panel', true); el('online-join').disabled = false; this.status('Odadan çıktın.'); }
  }
  _render(now) {
    const dt = Math.min(0.06, (now - this.prevTime) / 1000);
    this.prevTime = now;
    const input = this.input.poll();
    if (input.actions.ballCam) this.camera.toggleBallCam();
    if (this.view && this.myId) {
      this.view.update(dt);
      const car = this.view.cars.get(this.myId);
      if (car) {
        car.getRenderTransform(1, pos, quat);
        vel.copy(car.velocity); ball.copy(this.view.ballPosition);
        this.camera.update(dt, { carPos: pos, carQuat: quat, carVel: vel, grounded: car.state.onGround, ballPos: ball,
          ballVisible: this.view.ballTarget?.enabled ?? true, arenaHeight: this.orbitDims.H });
      }
    } else this.camera.updateOrbit(dt, this.orbitDims, focus);
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.pendingJump ||= input.controls.jump;
      if (now - this.lastSend >= 1000 / 30) {
        this.lastSend = now;
        this.inputSequence++;
        const controls = { ...input.controls, jump: this.pendingJump || input.controls.jump, sequence: this.inputSequence, timestamp: Date.now() };
        this.pendingJump = false;
        this.ws.send(JSON.stringify({ type: 'input', controls }));
        this.view?.predictionEngine.recordInput(this.inputSequence, controls, 1 / 30);
      }
    } else this.pendingJump = false;
    el('online-camera').innerHTML = `BALL CAM <strong>${this.camera.ballCam ? 'ON' : 'OFF'}</strong>`;
    if (this.toastUntil && now > this.toastUntil) { show('online-toast', false); this.toastUntil = 0; }
    this.renderer.render();
    requestAnimationFrame(this._render);
  }
}
new OnlineApp();
