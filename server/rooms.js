import { Simulation } from '../src/game/Simulation.js';
import { CONFIG } from '../src/config/index.js';
import { MODE, TEAM } from '../src/game/constants.js';
import { cleanCode, cleanInput, cleanName, ZERO_INPUT } from './protocol.js';

const OPEN = 1;
const safeSend = (socket, payload) => {
  if (!socket || socket.readyState !== OPEN || socket.bufferedAmount > 512_000) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {}
};
const nowMs = () => performance.now();

export class RoomManager {
  constructor(RAPIER, { maxRooms = 4, tickRate = 60, snapshotRate = 20 } = {}) {
    this.RAPIER = RAPIER;
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.tickRate = tickRate;
    this.snapshotRate = snapshotRate;
    this.tickIntervalMs = 1000 / tickRate;
    this.snapshotEvery = Math.max(1, Math.round(tickRate / snapshotRate));
    this.clients = new Map();
    this.config = structuredClone(CONFIG);
    this.config.physics.world.tickRate = tickRate;
    this._last = nowMs();
    this._accumulator = 0;
    this.timer = null;
  }

  begin() {
    if (this.timer) return;
    this._last = nowMs();
    this.timer = setInterval(() => this._pump(), Math.max(4, Math.floor(this.tickIntervalMs / 2)));
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const room of this.rooms.values()) room.sim?.dispose();
    this.rooms.clear();
    this.clients.clear();
  }

  _pump() {
    const n = nowMs();
    this._accumulator += Math.min(100, n - this._last);
    this._last = n;
    let steps = 0;
    while (this._accumulator >= this.tickIntervalMs && steps++ < 5) {
      for (const room of this.rooms.values()) {
        if (!room.sim) continue;
        const inputs = {};
        for (const p of room.players) {
          inputs[p.id] = (nowMs() - p.updatedAt < 300) ? p.input : { ...ZERO_INPUT, sequence: p.lastSequence };
        }
        room.sim.step(inputs);
        // ACK only controls actually passed to this physics tick, never merely received.
        for (const p of room.players) {
          if (inputs[p.id] === p.input) p.lastProcessedSequence = p.lastSequence;
        }
        if (room.sim.tick % this.snapshotEvery === 0) {
          const state = room.sim.getState();
          for (const p of room.players) {
            const msg = {
              type: 'snapshot',
              state: {
                ...state,
                lastProcessedSequence: p.lastProcessedSequence,
                serverTimestamp: Date.now()
              }
            };
            safeSend(p.socket, msg);
          }
        }
      }
      this._accumulator -= this.tickIntervalMs;
    }
    if (steps > 5) this._accumulator = 0;
  }

  join(socket, roomCode, name) {
    if (this.clients.has(socket)) return safeSend(socket, { type: 'error', detail: 'Zaten bir odadasın.' });
    const code = cleanCode(roomCode);
    if (!code) return safeSend(socket, { type: 'error', detail: 'Oda kodu 3–14 harf/rakam olmalı.' });
    let room = this.rooms.get(code);
    if (!room) {
      if (this.rooms.size >= this.maxRooms) return safeSend(socket, { type: 'error', detail: 'Sunucudaki oda sınırına ulaşıldı.' });
      room = { code, players: [], sim: null, eventOff: [], rematchVotes: new Set() };
      this.rooms.set(code, room);
    }
    if (room.players.length >= 2) return safeSend(socket, { type: 'error', detail: 'Oda dolu.' });
    const team = room.players.some(p => p.team === TEAM.BLUE) ? TEAM.ORANGE : TEAM.BLUE;
    const player = {
      socket,
      id: team === TEAM.BLUE ? 'blue-player' : 'orange-player',
      team,
      name: cleanName(name),
      input: { ...ZERO_INPUT, sequence: 0 },
      lastSequence: 0,
      lastProcessedSequence: 0,
      updatedAt: 0
    };
    room.players.push(player);
    this.clients.set(socket, room);
    safeSend(socket, { type: 'joined', room: code, playerId: player.id, team, name: player.name });
    if (room.players.length === 2) this.startMatch(room);
    else this.broadcast(room, { type: 'roomStatus', status: 'waiting', players: [{ name: player.name, team }] });
  }

  startMatch(room) {
    if (room.sim) {
      for (const off of room.eventOff) off();
      room.sim.dispose();
    }
    room.eventOff = [];
    room.rematchVotes.clear();
    for (const p of room.players) {
      p.input = { ...ZERO_INPUT, sequence: 0 };
      p.lastSequence = 0;
      p.lastProcessedSequence = 0;
      p.updatedAt = 0;
    }
    room.sim = new Simulation({
      RAPIER: this.RAPIER,
      config: this.config,
      mode: MODE.MATCH,
      players: room.players.map(p => ({ id: p.id, team: p.team, kind: 'human' }))
    });
    room.eventOff = [
      room.sim.events.on('goal', e => this.broadcast(room, { type: 'goal', goal: e })),
      room.sim.events.on('matchEnd', e => this.broadcast(room, { type: 'matchEnd', result: e })),
    ];
    room.sim.start();
    this.broadcast(room, { type: 'roomStatus', status: 'playing', players: room.players.map(p => ({ name: p.name, team: p.team })) });
    const initialSnapshot = room.sim.getState();
    for (const p of room.players) {
      safeSend(p.socket, { type: 'snapshot', state: { ...initialSnapshot, lastProcessedSequence: 0, serverTimestamp: Date.now() } });
    }
  }

  rematch(socket) {
    const room = this.clients.get(socket);
    if (!room || !room.sim || room.sim.rules.phase !== 'ended') return;
    const player = room.players.find(p => p.socket === socket);
    if (!player) return;
    room.rematchVotes.add(player.id);
    if (room.rematchVotes.size === 2) this.startMatch(room);
    else this.broadcast(room, { type: 'rematchPending' });
  }

  input(socket, data) {
    const room = this.clients.get(socket);
    if (!room || !room.sim || !data || data.type !== 'input') return;
    const player = room.players.find(p => p.socket === socket);
    if (!player) return;
    const cleaned = cleanInput(data.controls);
    if (cleaned.sequence !== null && cleaned.sequence > player.lastSequence) {
      player.lastSequence = cleaned.sequence;
      player.input = cleaned;
      player.updatedAt = nowMs();
    }
  }

  leave(socket) {
    const room = this.clients.get(socket);
    if (!room) return;
    this.clients.delete(socket);
    room.players = room.players.filter(p => p.socket !== socket);
    if (room.sim) {
      for (const off of room.eventOff) off();
      room.eventOff = [];
      room.sim.dispose();
      room.sim = null;
    }
    if (room.players.length) {
      this.broadcast(room, { type: 'roomStatus', status: 'waiting', players: room.players.map(p => ({ name: p.name, team: p.team })) });
    } else {
      this.rooms.delete(room.code);
    }
  }

  broadcast(room, data) {
    for (const p of room.players) safeSend(p.socket, data);
  }

  status() {
    return { rooms: this.rooms.size, players: this.clients.size, maxRooms: this.maxRooms };
  }
}
