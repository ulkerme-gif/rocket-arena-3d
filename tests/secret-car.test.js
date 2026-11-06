import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNLOCKS_KEY, codeReward, isUnlocked, loadUnlocks, unlock } from '../src/game/unlocks.js';
import { generateRoomCode } from '../src/net/roomCode.js';
import { CARS, OPEN_CARS, botCar, garageCars } from '../src/visuals/cars.js';

const memoryStorage = () => {
  const store = new Map();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
};

test('GERÇ (or GERC) unlocks the banana car; other codes do nothing', () => {
  for (const code of ['GERÇ', 'gerç', 'GERC', 'gerc', ' ger-ç ']) assert.equal(codeReward(code), 'muz', code);
  for (const other of ['', 'GER', 'GERCE', '1331', 'K7M2', null, undefined, 'toString', '__proto__']) assert.equal(codeReward(other), null, String(other));
});

test('a room is never created with a secret code, even if the dice say so', () => {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const seq = [...'GERC', ...'K7M2'].map((ch) => (letters.indexOf(ch) + 0.5) / letters.length);
  let i = 0;
  assert.equal(generateRoomCode(() => seq[i++]), 'K7M2', 'GERC was rolled first and thrown away');
});

test('unlocks persist on the tablet and survive broken storage', () => {
  const storage = memoryStorage();
  assert.equal(isUnlocked('muz', storage), false);
  assert.equal(unlock('muz', storage), true);
  assert.equal(unlock('muz', storage), false, 'second time: already unlocked');
  assert.equal(isUnlocked('muz', storage), true);
  storage.store.set(UNLOCKS_KEY, '{broken');
  assert.deepEqual([...loadUnlocks(storage)], []);
  assert.equal(isUnlocked('muz', null), false);
});

test('the banana car is secret: hidden in the garage until unlocked, and bots never drive it', () => {
  assert.deepEqual(CARS.filter((c) => c.secret).map((c) => c.id), ['muz']);
  const storage = memoryStorage();
  assert.ok(!garageCars(storage).some((c) => c.id === 'muz'), 'locked: not in the garage');
  assert.equal(garageCars(storage).length, CARS.length - 1);
  assert.ok(garageCars(storage, 'muz').some((c) => c.id === 'muz'), 'already driving it: shown');
  unlock('muz', storage);
  assert.equal(garageCars(storage)[0].id, 'muz', 'unlocked: first in the garage');
  for (let i = 0; i < 200; i++) assert.notEqual(botCar(`seat-${i}`), 'muz');
  assert.equal(OPEN_CARS.length, CARS.length - 1);
});

test('online page: the code is checked before joining a room, Ç is allowed in the box, garage hides locked cards', () => {
  const online = readFileSync(new URL('../src/online-main.js', import.meta.url), 'utf8');
  assert.match(online, /redeemSecret\(el\('room-code'\)\)\) return;\s+const typed/);
  assert.match(online, /\[\^A-Z0-9Ç\]/);
  assert.match(online, /this\.redeemSecret\(e\.target\)/);
  const garage = readFileSync(new URL('../src/ui/Garage.js', import.meta.url), 'utf8');
  assert.match(garage, /b\.hidden = !shown\.has/);
});
