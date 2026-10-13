import './styles/main.css';
import './online/online.css';
import * as THREE from 'three';
import { CONFIG } from './config/index.js';
import { buildArenaGeometry } from './arena/ArenaGeometry.js';
import { Renderer } from './visuals/Renderer.js';
import { ArenaView } from './visuals/ArenaView.js';
import { GameView } from './visuals/GameView.js';
import { CameraRig } from './camera/CameraRig.js';
import { InputManager } from './input/InputManager.js';
import { Settings } from './ui/Settings.js';
import { advanceAccumulator } from './core/GameLoop.js';
import { RemoteGameView } from './online/RemoteGameView.js';
import { MatchHost } from './net/MatchHost.js';
import { ZERO_INPUT, asPacket, cleanName } from './net/protocol.js';
import { expandState } from './net/snapshot.js';
import { HostedRoom, describePeerError, joinHostedRoom, loadPeerClass } from './net/PeerTransport.js';
import { describeNetwork, probeBroker, probeIce } from './net/networkCheck.js';
import { PROTOCOL_VERSION, codeFromLocation, inviteLink, normalizeRoomCode, roomCodeProblem } from './net/roomCode.js';
import { formatLabel, normalizeTeamSize } from './game/teams.js';
import { NameTags } from './visuals/NameTags.js';
import { loadSkin } from './visuals/skins.js';

const el = id => document.getElementById(id);
const show = (id, visible) => el(id).classList.toggle('hidden', !visible);
const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const vel = new THREE.Vector3();
const ball = new THREE.Vector3(); const ballQuat = new THREE.Quaternion(); const focus = new THREE.Vector3(0, 1, 0);
const clock = sec => `${Math.floor(Math.max(0,sec)/60)}:${String(Math.floor(Math.max(0,sec)%60)).padStart(2,'0')}`;
const teamName = team => (team === 'blue' ? 'MAVİ' : 'TURUNCU');
const NAME_KEY = 'rocket-arena-player-name';
const SIZE_KEY = 'rocket-arena-room-size';
const INPUT_INTERVAL_MS = 1000 / 60 - 2; // ~60 Hz guest input (every frame at 60 fps)
const LOST_CONNECTION = {
  'host-closed': 'Odayı kuran kişi odayı kapattı.',
  timeout: 'Bağlantı koptu. Odayı kuran tablet uykuya geçmiş ya da internet kesilmiş olabilir.',
  webrtc: 'Tabletler arasındaki bağlantı koptu.',
};

/**
 * Online 1v1 / 2v2 / 3v3 without a server. The player who presses ODA KUR becomes
 * the host: the match (Rapier physics, rules, score, bots in empty seats) runs on
 * their tablet through MatchHost, and their own car is rendered straight from the
 * simulation. Guests connect with the room code over WebRTC, send controls and draw
 * the host's snapshots with RemoteGameView (interpolation + light prediction).
 */
class OnlineApp {
  constructor() {
    new Settings(CONFIG); // same FOV / camera / shadow preferences as the single-player game
    this.renderer = new Renderer(el('game-canvas'), CONFIG);
    this.arenaGeometry = buildArenaGeometry(CONFIG.arena);
    this.arena = new ArenaView(this.renderer.scene, this.arenaGeometry, this.renderer.renderer);
    this.orbitDims = this.arenaGeometry.dims;
    this.camera = new CameraRig(this.renderer.camera, CONFIG.camera);
    this.input = new InputManager(CONFIG.controls);
    this.nameTags = new NameTags(el('name-tags'));
    this.tagObjects = null; // id -> car render group of the current view
    this.cameraLabel = '';

    this.role = null;        // 'host' | 'guest' | null
    this.session = null;     // host: { room, match, local } · guest: { connection, code }
    this.teamSize = 1;       // size picked in the lobby (host) / reported by the room (guest)
    this.roomCode = null; this.roster = null;
    this.sessionToken = 0;   // invalidates late async results after leaving
    this.busy = false;
    this.rapier = null;
    this.myId = null; this.myTeam = null; this.state = null; this.padLayout = null;
    this.ready = false; this.lastCount = null;
    this.view = null;                         // guest: RemoteGameView
    this.gameView = null; this.viewSim = null; this.viewOff = null; this.accumulator = 0; // host
    this.pendingJump = false; this.lastSend = 0; this.inputSequence = 0;
    this.toastUntil = 0; this.wakeLock = null; this.wakeLockPending = false; this.wantWakeLock = false; this.prevTime = performance.now();

    try { el('player-name').value = localStorage.getItem(NAME_KEY) || el('player-name').value; } catch { /* private mode */ }
    let savedSize = 1;
    try { savedSize = localStorage.getItem(SIZE_KEY); } catch { /* private mode */ }
    for (const button of el('room-size').querySelectorAll('[data-team-size]')) {
      button.addEventListener('click', () => this.setLobbySize(button.dataset.teamSize));
    }
    this.setLobbySize(savedSize);
    const skin = loadSkin();
    el('skin-chip').style.setProperty('--chip', skin.base === 'team' ? 'linear-gradient(90deg,#1f74e0 50%,#f0661a 50%)' : skin.base);
    const invited = codeFromLocation();
    if (invited) {
      el('room-code').value = invited;
      this.status(`Davet kodu ${invited} hazır. ODAYA KATIL'a bas.`);
    }

    el('room-create').onclick = () => this.createRoom();
    el('online-join').onclick = () => this.joinRoom();
    el('network-test').onclick = () => this.testNetwork();
    el('room-code').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    });
    el('room-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.joinRoom(); } });
    el('room-share').onclick = () => this.shareInvite();
    el('room-start').onclick = () => this.sendToHost({ type: 'start' });
    el('room-close').onclick = () => this.leave();
    el('online-leave').onclick = () => {
      if (this.role === 'host' && this.ready && !window.confirm('Odayı kapatırsan maç herkes için biter. Çıkılsın mı?')) return;
      this.leave();
    };
    el('online-rematch').onclick = () => {
      this.sendToHost({ type: 'rematch' });
      show('online-rematch', false);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wantWakeLock && !this.wakeLock) this.requestWakeLock();
    });
    // Safari may only grant the screen wake lock right after a tap, so retry on the next touch.
    document.addEventListener('pointerdown', () => { if (this.wantWakeLock && !this.wakeLock) this.requestWakeLock(); }, { passive: true });
    window.addEventListener('pagehide', () => this.leave({ silent: true, immediate: true }));

    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  status(text, tone = 'info') {
    el('online-status').textContent = text;
    el('online-status').dataset.tone = tone;
  }
  roomStatus(text) { el('room-card-status').textContent = text; }
  toast(text, ms = 2300) { el('online-toast').textContent = text; show('online-toast', true); this.toastUntil = performance.now() + ms; }
  hideToast() { show('online-toast', false); this.toastUntil = 0; }

  setLobbySize(value) {
    this.teamSize = normalizeTeamSize(value);
    try { localStorage.setItem(SIZE_KEY, String(this.teamSize)); } catch { /* private mode */ }
    for (const button of el('room-size').querySelectorAll('[data-team-size]')) {
      const on = Number(button.dataset.teamSize) === this.teamSize;
      button.setAttribute('aria-checked', String(on));
      button.classList.toggle('active', on);
    }
    el('room-create-label').textContent = `${formatLabel(this.teamSize)} ODA KUR`;
  }

  setBusy(busy) {
    this.busy = busy;
    for (const id of ['room-create', 'online-join', 'room-code', 'player-name', 'network-test']) el(id).disabled = busy;
    for (const button of el('room-size').querySelectorAll('button')) button.disabled = busy;
  }

  saveName() {
    const name = cleanName(el('player-name').value);
    el('player-name').value = name;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
    return name;
  }

  async loadRapier() {
    if (!this.rapier) {
      const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
      this.rapier = RAPIER;
    }
    return this.rapier;
  }

  // ---------------------------------------------------------------- host
  async createRoom() {
    if (this.busy) return;
    const name = this.saveName();
    this.leave({ silent: true });
    this.keepScreenOn(); // still inside the tap: Safari only grants the wake lock here
    const token = ++this.sessionToken;
    this.setBusy(true);
    this.status('Oda hazırlanıyor…');
    let room = null;
    try {
      const [RAPIER, Peer] = await Promise.all([this.loadRapier(), loadPeerClass()]);
      if (token !== this.sessionToken) return;
      room = await HostedRoom.open({ Peer });
      if (token !== this.sessionToken) { room.close(); return; }
      const local = { send: msg => queueMicrotask(() => { if (this.session?.local === local) this.handleMessage(msg); }) };
      const match = new MatchHost({ RAPIER, roomCode: room.code, teamSize: this.teamSize,
        onReject: link => setTimeout(() => link.close('rejected'), 400) });
      this.role = 'host';
      this.session = { room, match, local };
      this.roomCode = room.code;
      room.onConnection = link => this.acceptGuest(link);
      match.join(local, name, { local: true, skin: loadSkin() });
      this.accumulator = 0;
      this.showRoomCard();
    } catch (error) {
      if (token !== this.sessionToken) return;
      console.warn('[Online] room could not be created', error);
      room?.close();
      this.leave({ silent: true });
      this.status(describePeerError(error), 'error');
    } finally {
      if (token === this.sessionToken) this.setBusy(false);
    }
  }

  acceptGuest(link) {
    const session = this.session;
    if (!session?.room || this.role !== 'host') { link.close('host-closed'); return; }
    const { match } = session;
    const joinTimer = setTimeout(() => { if (!match.playerFor(link)) link.close('timeout'); }, 10000);
    link.onMessage = data => match.handlePacket(link, data);
    link.onClose = () => {
      clearTimeout(joinTimer);
      match.leave(link);
    };
  }

  /** Lobby card for everyone in a room that has not started yet (host: start button). */
  showRoomCard() {
    const code = this.roomCode ?? '';
    const host = this.role === 'host';
    const display = el('room-code-display');
    display.replaceChildren(...[...code].map(ch => {
      const tile = document.createElement('span');
      tile.textContent = ch;
      return tile;
    }));
    display.setAttribute('aria-label', `Oda kodu: ${[...code].join(' ')}`);
    el('room-card-title').textContent = host ? 'ODA KODUN' : 'ODA KODU';
    el('room-help').textContent = host
      ? 'Arkadaşların bu kodu yazsın. Boş yerlere bot geçer; maçı istediğin an başlatabilirsin. Maç bu tablette çalışacak, ekran açık kalsın.'
      : 'Odayı kuran kişi maçı başlatınca oyun açılır. Başka arkadaşını da bu kodla çağırabilirsin.';
    el('room-close').textContent = host ? 'ODAYI KAPAT' : 'ODADAN ÇIK';
    show('room-start', host);
    this.renderRoster();
    show('online-panel', false);
    show('room-card', true);
  }

  renderRoster() {
    const seats = this.roster?.seats ?? [];
    const size = this.roster?.teamSize ?? this.teamSize;
    const column = team => {
      const list = document.createElement('ul');
      list.className = `roster roster-${team}`;
      for (const seat of seats.filter(s => s.team === team)) {
        const item = document.createElement('li');
        item.className = seat.name ? 'human' : 'bot';
        item.textContent = seat.name ? `${seat.name}${seat.seat === this.myId ? ' (sen)' : ''}` : 'Bot';
        if (seat.host) item.dataset.host = 'true';
        list.append(item);
      }
      return list;
    };
    el('room-roster').replaceChildren(column('blue'), column('orange'));
    const humans = seats.filter(s => s.name).length;
    el('room-format').textContent = `${formatLabel(size)} · ${humans}/${seats.length || size * 2} OYUNCU`;
    if (this.role === 'host') {
      this.roomStatus(humans >= seats.length && seats.length ? 'Oda dolu, maç başlıyor…'
        : humans > 1 ? 'Hazırsan maçı başlat. Boş yerlere bot geçecek.' : 'Arkadaşların bekleniyor… İstersen botlarla başla.');
    } else {
      this.roomStatus('Odayı kuran kişinin maçı başlatması bekleniyor…');
    }
  }

  async shareInvite() {
    const code = this.roomCode;
    if (!code) return;
    const url = inviteLink(code);
    const text = `Rocket Arena 3D'de oda kurdum. Oda kodu: ${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Rocket Arena 3D', text, url }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      this.roomStatus('Davet linki kopyalandı. Arkadaşına gönder.');
    } catch {
      this.roomStatus(url);
    }
  }

  // ---------------------------------------------------------------- guest
  async joinRoom() {
    if (this.busy) return;
    const typed = el('room-code').value;
    const code = normalizeRoomCode(typed);
    if (!code) { this.status(roomCodeProblem(typed), 'error'); el('room-code').focus(); return; }
    el('room-code').value = code;
    const name = this.saveName();
    this.leave({ silent: true });
    this.keepScreenOn();
    const token = ++this.sessionToken;
    this.setBusy(true);
    this.status('Eşleştirme servisine bağlanılıyor…');
    try {
      const Peer = await loadPeerClass();
      if (token !== this.sessionToken) return;
      const connection = await joinHostedRoom({ Peer, code, onProgress: stage => {
        if (token !== this.sessionToken) return;
        if (stage === 'searching') this.status(`${code} odası aranıyor…`);
        else if (stage === 'found') this.status('Oda bulundu, tabletler birbirine bağlanıyor…');
      } });
      if (token !== this.sessionToken) { connection.close(); return; }
      this.role = 'guest';
      this.session = { connection, code };
      this.roomCode = code;
      connection.link.onMessage = data => { if (this.session?.connection === connection) this.handleMessage(data); };
      connection.link.onClose = reason => { if (this.session?.connection === connection) this.lostConnection(reason); };
      connection.link.send({ type: 'join', name, version: PROTOCOL_VERSION, skin: loadSkin() });
      this.status(`${code} odasına bağlandın. Maç hazırlanıyor…`);
    } catch (error) {
      if (token !== this.sessionToken) return;
      console.warn('[Online] could not join room', error);
      this.leave({ silent: true });
      this.status(describePeerError(error), 'error');
    } finally {
      if (token === this.sessionToken) this.setBusy(false);
    }
  }

  lostConnection(reason) {
    const why = this.session?.closingReason ?? reason;
    this.leave({ message: LOST_CONNECTION[why] ?? 'Bağlantı kapandı. Tekrar katılabilirsin.', tone: 'error' });
  }

  sendToHost(payload) {
    if (this.role === 'host') this.session?.match.handlePacket(this.session.local, payload);
    else if (this.role === 'guest') this.session?.connection.link.send(payload);
  }

  // ---------------------------------------------------------------- shared protocol
  handleMessage(data) {
    const msg = asPacket(data);
    if (!msg) return;
    if (msg.type === 'error') {
      this.leave({ message: msg.detail || 'Odaya katılınamadı.', tone: 'error' });
    } else if (msg.type === 'joined') {
      this.myId = msg.playerId;
      this.myTeam = msg.team;
      this.roster = { teamSize: normalizeTeamSize(msg.teamSize), seats: this.roster?.seats ?? [] };
      el('online-room-tag').textContent = `ONLINE · ${this.roomCode ?? ''}`;
      show('online-panel', false);
    } else if (msg.type === 'roster') {
      this.roster = { teamSize: normalizeTeamSize(msg.teamSize), seats: Array.isArray(msg.seats) ? msg.seats : [] };
      if (!this.ready) this.renderRoster();
      this.applyRoster();
    } else if (msg.type === 'notice') {
      if (typeof msg.text === 'string') this.toast(msg.text.slice(0, 80), 2600);
    } else if (msg.type === 'roomStatus') {
      const playing = msg.status === 'playing';
      this.ready = playing;
      this.disposeView();
      show('online-rematch', false);
      this.lastCount = null;
      if (playing) {
        this.padLayout = Array.isArray(msg.padLayout) ? msg.padLayout : null;
        this.inputSequence = 0; this.pendingJump = false; this.lastSend = 0;
        show('room-card', false);
        this.toast('MAÇ BAŞLIYOR!', 2000);
      } else {
        this.hideToast();
        this.showRoomCard();
      }
      this.input.setGameActive(playing);
    } else if (msg.type === 'snapshot') {
      if (msg.state) this.applySnapshot(msg.state);
    } else if (msg.type === 'goal') {
      this.toast(`${teamName(msg.goal?.team)} GOL!`);
    } else if (msg.type === 'matchEnd') {
      const winner = msg.result?.winner;
      this.input.setGameActive(false); // free the screen for the buttons below
      if (this.role === 'host') {
        this.toast(winner === this.myTeam ? 'KAZANDINIZ!' : 'MAÇ BİTTİ', 5000);
        show('online-rematch', true);
      } else {
        this.toast(winner === this.myTeam ? 'KAZANDINIZ! Yeni maçı oda kurucusu başlatır.' : 'MAÇ BİTTİ. Yeni maçı oda kurucusu başlatır.', 8000);
      }
    } else if (msg.type === 'roomClosed') {
      if (this.session) this.session.closingReason = 'host-closed';
    }
  }

  applySnapshot(state) {
    if (!this.ready || !state.score || !Array.isArray(state.cars)) return;
    this.state = state;
    if (this.role === 'guest') {
      const full = expandState(state, this.padLayout);
      if (!this.view) {
        this.view = new RemoteGameView(this.renderer, full, this.myId);
        this.tagObjects = new Map([...this.view.views].map(([id, v]) => [id, v.group]));
        this.applyRoster();
        this.camera.snap();
      } else this.view.onSnapshot(full);
    }
    show('online-hud', true); show('online-boost', true); show('online-camera', true);
    el('online-blue').textContent = state.score.blue;
    el('online-orange').textContent = state.score.orange;
    el('online-clock').textContent = state.isOvertime ? `+${clock(state.overtimeElapsed)}` : clock(state.timeRemaining);
    el('online-period').textContent = state.isOvertime ? 'OVERTIME' : formatLabel(this.roster?.teamSize ?? 1);
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

  /** Names above other cars and everyone's skins, from the latest roster. */
  applyRoster() {
    const seats = this.roster?.seats ?? [];
    this.nameTags.set(seats.filter(s => s.seat !== this.myId).map(s => ({ id: s.seat, text: s.name ?? 'BOT', team: s.team })));
    for (const seat of seats) {
      if (this.role === 'host') this.gameView?.carViews.get(seat.seat)?.setSkin(seat.skin);
      else this.view?.setSkin(seat.seat, seat.skin);
    }
  }

  updateNameTags() {
    this.renderer.camera.updateMatrixWorld();
    this.nameTags.update(this.renderer.camera, this.tagObjects, window.innerWidth, window.innerHeight);
  }

  disposeView() {
    if (this.view) this.tagObjects = null;
    this.view?.dispose(); this.view = null; this.state = null;
    show('online-hud', false); show('online-boost', false); show('online-camera', false);
    this.camera.snap();
  }

  /** Host: keep a GameView bound to whatever Simulation MatchHost currently runs (rematch makes a new one). */
  syncHostView() {
    const sim = this.role === 'host' ? this.session?.match.sim ?? null : null;
    if (this.viewSim === sim) return;
    this.viewOff?.();
    this.gameView?.dispose();
    this.gameView = null; this.viewOff = null; this.viewSim = sim; this.accumulator = 0;
    this.tagObjects = null;
    if (sim) {
      this.gameView = new GameView(this.renderer, sim);
      this.tagObjects = new Map([...this.gameView.carViews].map(([id, v]) => [id, v.group]));
      this.applyRoster();
      this.viewOff = sim.events.on('kickoff', () => this.camera.snap());
      this.camera.snap();
    }
  }

  /** Lobby self-check: broker, direct internet path (STUN) and relay (TURN), on this tablet alone. */
  async testNetwork() {
    if (this.busy) return;
    this.setBusy(true);
    this.status('Bağlantı test ediliyor… (10 saniye kadar sürebilir)');
    try {
      const Peer = await loadPeerClass();
      const [broker, ice] = await Promise.all([probeBroker({ Peer }), probeIce()]);
      this.status(describeNetwork({ broker, ice }), broker && ice.supported ? 'info' : 'error');
    } catch (error) {
      console.warn('[Online] network test failed', error);
      this.status('Test yapılamadı. İnternet bağlantını kontrol edip tekrar dene.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  leave({ message = 'Odadan çıktın.', tone = 'info', silent = false, immediate = false } = {}) {
    const session = this.session;
    const role = this.role;
    this.session = null;
    this.role = null;
    if (role === 'host' && session) {
      for (const link of session.room.links) link.send({ type: 'roomClosed' });
      session.match.dispose();
      // Give the goodbye message a moment to leave before the connections are torn down.
      if (immediate) session.room.close(); else setTimeout(() => session.room.close(), 150);
    } else if (role === 'guest' && session) {
      session.connection.link.send({ type: 'leave' });
      session.connection.close();
    }
    this.ready = false; this.myId = null; this.myTeam = null; this.padLayout = null; this.pendingJump = false;
    this.roomCode = null; this.roster = null;
    this.nameTags.clear();
    el('online-room-tag').textContent = 'ONLINE';
    this.disposeView();
    this.syncHostView();
    this.input.setGameActive(false);
    show('room-card', false);
    show('online-rematch', false);
    this.hideToast();
    this.wantWakeLock = false;
    this.releaseWakeLock();
    if (!silent) {
      show('online-panel', true);
      this.status(message, tone);
    }
  }

  /** Keep the screen awake while in a room (host: the match runs here). Call from a tap. */
  keepScreenOn() {
    this.wantWakeLock = true;
    this.requestWakeLock();
  }

  async requestWakeLock() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible' || this.wakeLockPending || this.wakeLock) return;
    this.wakeLockPending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!this.wantWakeLock) { lock.release().catch(() => {}); return; }
      this.wakeLock = lock;
      lock.addEventListener?.('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
    } catch { /* low power mode or unsupported: the game still works, the screen may dim */ }
    finally { this.wakeLockPending = false; }
  }

  releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock?.release?.().catch(() => {});
  }

  // ---------------------------------------------------------------- frame loop
  _frame(now) {
    const frameDt = Math.max(0, (now - this.prevTime) / 1000);
    const dt = Math.min(0.06, frameDt);
    this.prevTime = now;
    const input = this.input.poll();
    if (input.actions.ballCam) this.camera.toggleBallCam();

    if (this.role === 'host' && this.session) this.hostFrame(frameDt, dt, input);
    else if (this.role === 'guest' && this.session) this.guestFrame(now, dt, input);
    else this.camera.updateOrbit(dt, this.orbitDims, focus.set(0, 1, 0));

    const cameraLabel = this.camera.ballCam ? 'ON' : 'OFF';
    if (cameraLabel !== this.cameraLabel) {
      this.cameraLabel = cameraLabel;
      el('online-camera').innerHTML = `BALL CAM <strong>${cameraLabel}</strong>`;
    }
    if (this.tagObjects) this.updateNameTags();
    if (this.toastUntil && now > this.toastUntil) this.hideToast();
    this.renderer.render();
    requestAnimationFrame(this._frame);
  }

  hostFrame(frameDt, dt, input) {
    const { match, local } = this.session;
    match.setLocalControls(local, this.ready ? input.controls : ZERO_INPUT);
    let alpha = 1;
    if (match.sim) {
      const r = advanceAccumulator(this.accumulator, frameDt, match.sim.dt, 12);
      this.accumulator = r.accumulator;
      alpha = r.alpha;
      for (let i = 0; i < r.steps && match.sim; i++) match.step();
    }
    this.syncHostView();
    const sim = match.sim;
    const car = sim?.carById.get(this.myId);
    if (!this.gameView || !sim || !car) { this.camera.updateOrbit(dt, this.orbitDims, focus.set(0, 1, 0)); return; }
    this.gameView.update(alpha, dt);
    car.getRenderTransform(alpha, pos, quat);
    vel.copy(car.velocity);
    sim.ball.getRenderTransform(alpha, ball, ballQuat);
    if (sim.rules.phase === 'ended') this.camera.updateOrbit(dt, sim.dims, focus.copy(ball));
    else this.camera.update(dt, { carPos: pos, carQuat: quat, carVel: vel, grounded: car.state.onGround, ballPos: ball,
      ballVisible: sim.ball.enabled, arenaHeight: sim.dims.H });
  }

  guestFrame(now, dt, input) {
    if (this.view && this.myId) {
      this.view.update(dt);
      const car = this.view.cars.get(this.myId);
      if (car) {
        car.getRenderTransform(1, pos, quat);
        vel.copy(car.velocity); ball.copy(this.view.ballPosition);
        this.camera.update(dt, { carPos: pos, carQuat: quat, carVel: vel, grounded: car.state.onGround, ballPos: ball,
          ballVisible: this.view.ballTarget?.enabled ?? true, arenaHeight: this.orbitDims.H });
      }
    } else this.camera.updateOrbit(dt, this.orbitDims, focus.set(0, 1, 0));

    const link = this.session.connection.link;
    if (this.ready && link.open) {
      this.pendingJump ||= input.controls.jump;
      if (now - this.lastSend >= INPUT_INTERVAL_MS) {
        this.lastSend = now;
        this.inputSequence++;
        const controls = { ...input.controls, jump: this.pendingJump || input.controls.jump, sequence: this.inputSequence, timestamp: Date.now() };
        this.pendingJump = false;
        link.send({ type: 'input', controls });
      }
    } else this.pendingJump = false;
  }
}

new OnlineApp();
