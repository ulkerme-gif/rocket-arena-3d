import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CARS, DEFAULT_CAR, botCar, cleanCar, loadCar, saveCar } from '../src/visuals/cars.js';
import { WHEEL_KEYS, carModel, disposeTree, registerCarModels } from '../src/visuals/carModels.js';
import { CarView, TEAM_GLOW, restHeightOf } from '../src/visuals/CarView.js';
import { makeStaticCar } from '../src/visuals/staticCar.js';
import { carPhysicsConfig, carShape, shapeRestHeight } from '../src/game/carPhysics.js';
import { CarController } from '../src/physics/CarController.js';
import { CONFIG } from '../src/config/index.js';
import { createSim, steps, C, place, initRapier } from './helpers.js';
import { MatchHost } from '../src/net/MatchHost.js';
import { PROTOCOL_VERSION } from '../src/net/roomCode.js';

const GLB = new URL('../public/cars/cars.glb', import.meta.url);
const BANANA = new URL('../public/cars/banana.glb', import.meta.url);
// Node has no image decoder: the palette texture becomes an empty texture (geometry is what's tested).
globalThis.self ??= globalThis;
THREE.TextureLoader.prototype.load = function (url, onLoad) {
  const texture = new THREE.Texture();
  queueMicrotask(() => onLoad?.(texture));
  return texture;
};
let loaded = null;
const parse = (url) => new Promise((res, rej) => {
  const buf = readFileSync(url);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej);
});
const loadAll = () => (loaded ??= Promise.all([GLB, BANANA].map(parse)).then((all) => all.reduce((n, gltf) => n + registerCarModels(gltf), 0)));
const BALL_DIAMETER = CONFIG.physics.ball.radius * 2;

test('car choice: 23 cars (pack + banana), only known ids, persisted, bots get the same car on every tablet', () => {
  assert.equal(CARS.length, 23);
  assert.equal(new Set(CARS.map((c) => c.id)).size, 23);
  assert.equal(CARS[0].id, 'muz', 'the banana car is first in the garage');
  assert.equal(cleanCar('pikap-sari'), 'pikap-sari');
  for (const junk of [null, undefined, '', 'gtr', 'porsche', 42, {}, '__proto__']) assert.equal(cleanCar(junk), DEFAULT_CAR);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadCar(storage), DEFAULT_CAR);
  saveCar('arazi-beyaz', storage);
  assert.equal(loadCar(storage), 'arazi-beyaz');
  assert.equal(botCar('orange-2'), botCar('orange-2'));
  assert.ok(new Set(['blue-1', 'blue-2', 'blue-3', 'orange-1', 'orange-2', 'orange-3'].map(botCar)).size > 1);
});

test('size against the ball: every car is close to the ball in length and clearly bigger than before', () => {
  for (const car of CARS) {
    const s = car.shape, len = s.hitbox.halfLength * 2, width = s.hitbox.halfWidth * 2, height = s.hitbox.top;
    assert.ok(len > 0.9 * BALL_DIAMETER && len < 1.15 * BALL_DIAMETER, `${car.id} length ${len} vs ball ${BALL_DIAMETER}`);
    assert.ok(width > 0.65 && width < 0.95, `${car.id} width ${width}`);
    assert.ok(height > 0.5 && height < 0.85, `${car.id} height ${height}`);
    assert.ok(s.hitbox.bottom > 0.05, `${car.id}: the box clears the floor`);
    assert.ok(s.front.z < 0 && s.rear.z > 0 && s.front.z > -s.hitbox.halfLength && s.rear.z < s.hitbox.halfLength, `${car.id}: wheels under the body`);
  }
});

test('model files: small, every car has a body + four wheels touching the ground where the physics has them', async () => {
  assert.ok(statSync(GLB).size < 2.5e6, 'cars.glb stays small');
  assert.ok(statSync(BANANA).size < 1.2e6, 'banana.glb stays small');
  assert.equal(await loadAll(), CARS.length);
  for (const car of CARS) {
    const model = carModel(car.id);
    assert.ok(model, car.id);
    assert.deepEqual(model.wheels.map((w) => w.key), WHEEL_KEYS);
    for (const w of model.wheels) {
      assert.equal(w.center.z < 0, w.key[0] === 'F', `${car.id} ${w.key} front/back`);
      assert.equal(w.center.x < 0, w.key[1] === 'L', `${car.id} ${w.key} left/right`);
      assert.ok(Math.abs(w.center.y - car.shape.wheelRadius) < 0.02, `${car.id} ${w.key} tyre on the ground`);
      const p = w.key[0] === 'F' ? car.shape.front : car.shape.rear;
      assert.ok(Math.abs(Math.abs(w.center.x) - p.x) < 0.02 && Math.abs(w.center.z - p.z) < 0.02, `${car.id} ${w.key} matches the physics wheel`);
    }
    const box = new THREE.Box3().setFromObject(model.body);
    assert.ok(Math.abs(box.max.z - car.shape.hitbox.halfLength) < 0.02 && Math.abs(box.min.z + car.shape.hitbox.halfLength) < 0.02, `${car.id}: hitbox = drawn length`);
    assert.ok(Math.abs(box.max.x - car.shape.hitbox.halfWidth) < 0.02, `${car.id}: hitbox = drawn width`);
  }
});

test('per-car physics: each car rests on its own wheels at its own height, hitbox matches the model', async () => {
  for (const id of ['sedan-sari', 'arazi-beyaz', 'pikap-sari', 'muz']) {
    const sim = await createSim({ players: [{ id: 'player', team: 'blue', kind: 'human', car: id }] });
    sim.ball.setEnabled(false);
    const car = sim.cars[0];
    place(car, 0, 30, 0);
    steps(sim, 2, () => ({ player: C({}) }));
    assert.equal(car.state.numWheelsContact, 4, `${id} on four wheels`);
    assert.ok(Math.abs(car.position.y - shapeRestHeight(carShape(id))) < 0.03, `${id} rests at ${car.position.y}`);
    assert.equal(car.cfg.hitbox.halfLength, carShape(id).hitbox.halfLength);
    steps(sim, 3, () => ({ player: C({ throttle: 1 }) }));
    assert.ok(car.velocity.length() > 12 && car.up.y > 0.99, `${id} drives normally`);
    sim.dispose();
  }
  assert.equal(carPhysicsConfig(CONFIG.physics, 'nope'), CONFIG.physics, 'unknown car keeps the base shape');
  assert.ok(Math.abs(CarController.restHeight(carPhysicsConfig(CONFIG.physics, 'cip-sari')) - restHeightOf('cip-sari')) < 1e-9);
});

test('a guest taking over a bot mid-match gets their own car\'s hitbox; a leaver\'s seat goes back to the bot\'s car', async () => {
  const RAPIER = await initRapier();
  const match = new MatchHost({ RAPIER, roomCode: 'K7M2', teamSize: 2 });
  match.join({ send() {} }, 'Kurucu', { local: true, car: 'sedan-sari' });
  match.handlePacket(match.players[0].handle, { type: 'start' });
  assert.equal(match.sim.carById.get('blue-1').cfg.hitbox.halfLength, carShape('sedan-sari').hitbox.halfLength);
  const guest = { send() {} };
  match.handlePacket(guest, { type: 'join', name: 'Misafir', version: PROTOCOL_VERSION, car: 'arazi-beyaz' });
  const seat = match.playerFor(guest).id;
  const car = match.sim.carById.get(seat);
  assert.equal(car.cfg.hitbox.top ?? car.cfg.hitbox.halfHeight, carPhysicsConfig(CONFIG.physics, 'arazi-beyaz').car.hitbox.halfHeight);
  for (let i = 0; i < 240; i++) match.step();
  assert.ok(Number.isFinite(car.position.y) && car.position.y > 0.2, 'stands normally after the swap');
  match.leave(guest);
  assert.equal(car.model, botCar(seat));
  match.dispose();
});

test('CarView: model sits on the physics box, wheels touch the ground, team glow, placeholder when not loaded', async () => {
  await loadAll();
  const parent = new THREE.Group();
  const id = 'arazi-turuncu';
  const car = makeStaticCar({ id: 'x', team: 'orange', position: { x: 0, y: restHeightOf(id), z: 0 } });
  const view = new CarView(car, parent, id);
  view.update(1);
  parent.updateMatrixWorld(true);
  for (const v of view.wheelViews) assert.ok(Math.abs(new THREE.Box3().setFromObject(v.spin).min.y) < 0.02, 'tyre on the ground');
  const body = new THREE.Box3().setFromObject(view.shell.children[0]);
  const hb = carShape(id).hitbox;
  assert.ok(Math.abs(body.max.y - hb.top) < 0.02, 'roof where the hitbox ends');
  assert.equal(view.glowMat.color.getHex(), new THREE.Color(TEAM_GLOW.orange).getHex());
  car.wheels[0].steer = 0.3; car.wheels[0].spin = 1; view.update(1);
  assert.equal(view.wheelViews[0].steer.rotation.y, -0.3);
  assert.equal(view.wheelViews[0].spin.rotation.x, -1);
  view.setCar('sedan-lacivert');
  disposeTree(parent);
  let alive = true;
  carModel(id).body.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) alive = false; });
  assert.ok(alive, 'shared model geometry survives a view being disposed');
  assert.ok(view.nozzleLocal.z > 0.8, 'boost comes out of the rear');
  const lonely = new CarView(makeStaticCar({ id: 'y', team: 'blue' }), new THREE.Group(), 'not-a-car');
  assert.equal(lonely.carId, DEFAULT_CAR);
  assert.equal(lonely.wheelViews.length, 4);
});

test('garage markup: car grid with pictures; the old cars and the paint editor are gone', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const gone of ['garage-art', 'garage-base', 'garage-pattern', 'KAPLAMA']) assert.doesNotMatch(html, new RegExp(gone));
  for (const idName of ['garage-cars', 'garage-save', 'garage-cancel']) assert.match(html, new RegExp(`id="${idName}"`));
  assert.ok(statSync(new URL('../public/cars/thumbs.webp', import.meta.url)).size < 200e3);
  for (const old of ['gtr.glb', 'porsche.glb']) assert.throws(() => statSync(new URL(`../public/cars/${old}`, import.meta.url)));
});
