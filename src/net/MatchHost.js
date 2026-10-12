import { Simulation } from '../game/Simulation.js';
import { BotController } from '../ai/BotController.js';
import { CONFIG } from '../config/index.js';
import { MODE } from '../game/constants.js';
import { normalizeTeamSize, seatList } from '../game/teams.js';
import { ZERO_INPUT, cleanInput, cleanName, asPacket } from './protocol.js';
import { compactState, padLayoutOf } from './snapshot.js';
import { PROTOCOL_VERSION } from './roomCode.js';

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The "temporary server" that lives on the tablet of whoever created the room
 * (the former server/rooms.js, reduced to one room and decoupled from any
 * transport: every player is a handle with send(payload)).
 *
 * Every car is a seat (blue-1..N, orange-1..N). Humans sit in seats; bots drive
 * the empty ones. A guest who joins mid-match takes over a bot on the smaller
 * team, and a guest who leaves is replaced by a bot, so 2v2 / 3v3 games keep
 * going. The host's own player is a local handle; guests are WebRTC links.
 *
 * Call step() once per fixed physics tick (CONFIG.physics.world.tickRate).
 */
export class MatchHost {
  constructor({
    RAPIER,
    config = CONFIG,
    roomCode = '',
    teamSize = 1,
    snapshotEvery = 4,
    inputTimeoutMs = 300,
    maxMessagesPerSecond = 150,
    now = defaultNow,
    random = Math.random,
    onReject = null,
  }) {
    this.RAPIER = RAPIER;
    this.config = config;
    this.roomCode = roomCode;
    this.teamSize = normalizeTeamSize(teamSize);
    this.seats = seatList(this.teamSize);
    this.snapshotEvery = Math.max(1, snapshotEvery);
    this.inputTimeoutMs = inputTimeoutMs;
    this.maxMessagesPerSecond = maxMessagesPerSecond;
    this.now = now;
    this.random = random;
    this.onReject = onReject;
    this.players = [];
    this.sim = null;
    this.padLayout = null;
    this.eventOff = [];
    this.disposed = false;
  }

  get capacity() { return this.seats.length; }
  get playing() { return !!this.sim; }

  playerFor(handle) {
    return this.players.find((p) => p.handle === handle) ?? null;
  }

  /** Every packet goes through here (rate-limited, validated). */
  handlePacket(handle, data) {
    if (this.disposed) return;
    const packet = asPacket(data);
    if (!packet || typeof packet.type !== 'string') return;
    const player = this.playerFor(handle);
    if (!player) {
      if (packet.type === 'join') this.join(handle, packet.name, { version: packet.version });
      return;
    }
    const t = this.now();
    if (t - player.windowStart >= 1000) { player.windowStart = t; player.messages = 0; }
    if (++player.messages > this.maxMessagesPerSecond) return;
    if (packet.type === 'input') this._input(player, packet.controls);
    else if (packet.type === 'start' && player.local) this.startMatch();
    else if (packet.type === 'rematch' && player.local) this.rematch();
    else if (packet.type === 'leave') this.leave(handle);
  }

  join(handle, name, { local = false, version = PROTOCOL_VERSION } = {}) {
    if (this.disposed || this.playerFor(handle)) return null;
    if (!local && version !== PROTOCOL_VERSION) {
      return this._reject(handle, 'Oyun sürümleri farklı. İki tablette de sayfayı yenileyip tekrar dene.');
    }
    const seat = this._freeSeat();
    if (!seat) return this._reject(handle, 'Oda dolu.');
    const player = {
      handle,
      local,
      id: seat.id,
      team: seat.team,
      name: cleanName(name),
      input: { ...ZERO_INPUT, sequence: 0 },
      lastSequence: 0,
      lastProcessedSequence: 0,
      updatedAt: 0,
      windowStart: this.now(),
      messages: 0,
    };
    this.players.push(player);
    this._send(player, {
      type: 'joined', room: this.roomCode, playerId: player.id, team: player.team, name: player.name,
      teamSize: this.teamSize, host: local,
    });
    if (this.sim) {
      // Mid-match: take the wheel from the bot in this seat.
      this.sim.bots.delete(player.id);
      this._send(player, { type: 'roomStatus', status: 'playing', padLayout: this.padLayout });
      this._send(player, { type: 'snapshot', state: compactState(this.sim.getState(), 0) });
      this._notice(`${player.name} katıldı, botun yerine geçti.`, player);
      this._broadcastRoster();
    } else if (this.players.length === this.capacity) {
      this.startMatch(); // room full: no need to wait for the host
    } else {
      this._send(player, { type: 'roomStatus', status: 'waiting' });
      this._broadcastRoster();
    }
    return player;
  }

  /** Seat on the team with fewer humans (blue on ties), first free slot. */
  _freeSeat() {
    const taken = new Set(this.players.map((p) => p.id));
    const free = this.seats.filter((s) => !taken.has(s.id));
    if (!free.length) return null;
    const humans = (team) => this.players.filter((p) => p.team === team).length;
    return [...free].sort((a, b) => humans(a.team) - humans(b.team))[0];
  }

  _reject(handle, detail) {
    try { handle.send({ type: 'error', detail }); } catch { /* connection already gone */ }
    this.onReject?.(handle, detail);
    return null;
  }

  /** Starts (or restarts) a match with the current humans; bots fill the empty seats. */
  startMatch() {
    if (this.disposed || !this.players.length) return;
    this._disposeSim();
    for (const p of this.players) {
      p.input = { ...ZERO_INPUT, sequence: 0 };
      p.lastSequence = 0;
      p.lastProcessedSequence = 0;
      p.updatedAt = 0;
    }
    const humanSeats = new Set(this.players.map((p) => p.id));
    this.sim = new Simulation({
      RAPIER: this.RAPIER,
      config: this.config,
      mode: MODE.MATCH,
      random: this.random,
      players: this.seats.map((s) => ({ id: s.id, team: s.team, kind: humanSeats.has(s.id) ? 'human' : 'bot' })),
    });
    for (const s of this.seats) if (!humanSeats.has(s.id)) this._attachBot(s);
    this.eventOff = [
      this.sim.events.on('goal', (e) => this.broadcast({ type: 'goal', goal: { team: e.team, scorerId: e.scorerId, ownGoal: e.ownGoal, score: e.score } })),
      this.sim.events.on('matchEnd', (e) => this.broadcast({ type: 'matchEnd', result: { winner: e.winner, score: e.score, overtime: e.overtime } })),
    ];
    this.sim.start();
    const initial = this.sim.getState();
    this.padLayout = padLayoutOf(initial);
    this.broadcast({ type: 'roomStatus', status: 'playing', padLayout: this.padLayout });
    this._broadcastRoster();
    const base = compactState(initial, 0);
    for (const p of this.players) this._send(p, { type: 'snapshot', state: base });
  }

  /** Host-only: a fresh match with the same people once the previous one has ended. */
  rematch() {
    if (this.sim && this.sim.rules.phase === 'ended') this.startMatch();
  }

  _attachBot(seat) {
    this.sim.attachBot(seat.id, new BotController({
      carId: seat.id, team: seat.team, config: this.config.bot, difficulty: this.config.bot.difficulty, random: this.random,
    }));
  }

  /** The host's own controls: read locally every frame, never stale, no sequence numbers. */
  setLocalControls(handle, controls) {
    const player = this.playerFor(handle);
    if (!player || !player.local) return;
    player.input = controls ?? ZERO_INPUT;
    player.updatedAt = this.now();
  }

  _input(player, controls) {
    if (!this.sim || player.local) return;
    const cleaned = cleanInput(controls);
    if (cleaned.sequence !== null && cleaned.sequence > player.lastSequence) {
      player.lastSequence = cleaned.sequence;
      player.input = cleaned;
      player.updatedAt = this.now();
    }
  }

  /** One fixed physics tick. Sends a snapshot every `snapshotEvery` ticks. */
  step() {
    if (!this.sim || this.disposed) return;
    const t = this.now();
    const inputs = {};
    for (const p of this.players) {
      const fresh = p.local || t - p.updatedAt < this.inputTimeoutMs;
      inputs[p.id] = fresh ? p.input : { ...ZERO_INPUT, sequence: p.lastSequence };
    }
    this.sim.step(inputs);
    // ACK only controls actually used by this physics tick, never merely received ones.
    for (const p of this.players) {
      if (inputs[p.id] === p.input) p.lastProcessedSequence = p.lastSequence;
    }
    if (this.sim && this.sim.tick % this.snapshotEvery === 0) {
      const base = compactState(this.sim.getState(), 0);
      for (const p of this.players) this._send(p, { type: 'snapshot', state: { ...base, lastProcessedSequence: p.lastProcessedSequence } });
    }
  }

  leave(handle) {
    const player = this.playerFor(handle);
    if (!player) return;
    this.players = this.players.filter((p) => p !== player);
    if (!this.players.length) { this._disposeSim(); return; }
    if (this.sim) {
      const seat = this.seats.find((s) => s.id === player.id);
      this._attachBot(seat);
      this._notice(`${player.name} ayrıldı, yerine bot geçti.`);
    }
    this._broadcastRoster();
  }

  roster() {
    return this.seats.map((s) => {
      const p = this.players.find((x) => x.id === s.id);
      return { seat: s.id, team: s.team, name: p ? p.name : null, host: !!p?.local };
    });
  }

  broadcast(payload) {
    for (const p of this.players) this._send(p, payload);
  }

  _broadcastRoster() {
    this.broadcast({ type: 'roster', teamSize: this.teamSize, playing: !!this.sim, seats: this.roster() });
  }

  _notice(text, except = null) {
    for (const p of this.players) if (p !== except) this._send(p, { type: 'notice', text });
  }

  _send(player, payload) {
    try { player.handle.send(payload); } catch { /* a dropped guest is cleaned up by its close event */ }
  }

  _disposeSim() {
    for (const off of this.eventOff) off();
    this.eventOff = [];
    this.sim?.dispose();
    this.sim = null;
  }

  dispose() {
    this._disposeSim();
    this.players = [];
    this.disposed = true;
  }
}
