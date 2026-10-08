import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomManager } from '../server/rooms.js';
import { message } from '../server/protocol.js';

test('WebSocket online 1v1 integration & room lifecycle', async (t) => {
  await RAPIER.init();
  const PORT = 3892;
  const rooms = new RoomManager(RAPIER, { maxRooms: 2, tickRate: 60 });
  rooms.begin();

  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });

  wss.on('connection', ws => {
    ws.on('message', data => {
      const packet = message(data);
      if (!packet) return;
      if (packet.type === 'join') rooms.join(ws, packet.room, packet.name);
      else if (packet.type === 'input') rooms.input(ws, packet);
      else if (packet.type === 'rematch') rooms.rematch(ws);
    });
    ws.on('close', () => rooms.leave(ws));
  });

  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  const connectClient = (name, room) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const events = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', room, name }));
    });
    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      events.push(parsed);
      if (parsed.type === 'joined') {
        resolve({ ws, events });
      } else if (parsed.type === 'error') {
        resolve({ ws, events, error: parsed });
      }
    });
  });

  // Player 1 joins ROOM1
  const p1 = await connectClient('Oyuncu1', 'ROOM1');
  assert.equal(p1.events[0].type, 'joined');
  assert.equal(p1.events[0].team, 'blue');

  // Player 2 joins ROOM1 -> Match should start
  const p2 = await connectClient('Oyuncu2', 'ROOM1');
  assert.equal(p2.events[0].type, 'joined');
  assert.equal(p2.events[0].team, 'orange');

  await new Promise(r => setTimeout(r, 100));

  // Player 3 attempts joining ROOM1 -> should be rejected (Room Full)
  const p3 = await connectClient('Oyuncu3', 'ROOM1');
  assert.ok(p3.error, '3rd player must be rejected');
  assert.equal(p3.error.detail, 'Oda dolu.');

  // Clean up
  p1.ws.close();
  p2.ws.close();
  p3.ws.close();
  rooms.stop();
  wss.close();
  await new Promise(r => server.close(r));
});
