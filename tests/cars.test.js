import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CARS, DEFAULT_CAR, botCar, cleanCar, loadCar, saveCar } from '../src/visuals/cars.js';
import { WHEEL_KEYS, carModel, disposeTree, registerCarModel } from '../src/visuals/carModels.js';
import { CarView, REST, TEAM_PAINT } from '../src/visuals/CarView.js';
import { makeStaticCar } from '../src/visuals/staticCar.js';
import { CONFIG } from '../src/config/index.js';

const file = (id) => new URL(`../public/cars/${id}.glb`, import.meta.url);
async function parse(id) {
  const buf = readFileSync(file(id));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((res, rej) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
}
let loaded = null;
const loadAll = () => (loaded ??= Promise.all(CARS.map(async (c) => registerCarModel(c.id, await parse(c.id)))));

test('car choice: only known cars, persisted on the tablet, bots get the same car on every tablet', () => {
  assert.equal(cleanCar('porsche'), 'porsche');
  for (const junk of [null, undefined, '', 'tank', 42, {}, '__proto__']) assert.equal(cleanCar(junk), DEFAULT_CAR);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadCar(storage), DEFAULT_CAR);
  saveCar('porsche', storage);
  assert.equal(loadCar(storage), 'porsche');
  assert.equal(loadCar({ getItem() { throw new Error('private mode'); } }), DEFAULT_CAR);
  assert.equal(botCar('orange-2'), botCar('orange-2'));
  assert.ok(new Set(['blue-1', 'blue-2', 'blue-3', 'orange-1', 'orange-2', 'orange-3'].map(botCar)).size > 1, 'bots are not all the same car');
});

test('car models: small files, light enough for an iPad, body + four wheels at sensible spots', async () => {
  await loadAll();
  for (const car of CARS) {
    assert.ok(statSync(file(car.id)).size < 1.2e6, `${car.id}.glb stays small`);
    const model = carModel(car.id);
    let tris = 0, draws = 0;
    for (const part of [model.body, ...model.wheels.flatMap((w) => [w.spin, w.hub].filter(Boolean))]) {
      part.traverse((o) => { if (o.isMesh) { tris += o.geometry.index.count / 3; draws++; } });
    }
    assert.ok(tris < 60000, `${car.id}: ${tris} triangles`);
    assert.ok(draws <= 30, `${car.id}: ${draws} draw calls`);
    const len = model.box.max.z - model.box.min.z, width = model.box.max.x - model.box.min.x;
    assert.ok(len > 1.3 && len < 1.6, `${car.id} length ${len}`);
    assert.ok(width > 0.5 && width < CONFIG.physics.car.hitbox.halfWidth * 2, `${car.id} width ${width}`);
    assert.ok(model.box.min.y > -0.01, `${car.id}: nothing below the ground`);
    assert.deepEqual(model.wheels.map((w) => w.key), WHEEL_KEYS);
    for (const w of model.wheels) {
      const front = w.key[0] === 'F', left = w.key[1] === 'L';
      assert.equal(w.center.z < 0, front, `${car.id} ${w.key} front/back`);
      assert.equal(w.center.x < 0, left, `${car.id} ${w.key} left/right`);
      assert.ok(Math.abs(w.center.y - w.radius) < 0.01, `${car.id} ${w.key} tyre touches the ground`);
      assert.ok(w.spin, `${car.id} ${w.key} has a spinning part`);
    }
    let paint = 0;
    model.body.traverse((o) => { if (o.isMesh && o.material.name === 'paint') paint++; });
    assert.ok(paint > 0, `${car.id}: has body paint`);
  }
});

test('CarView: team paint, tyres on the ground at rest, wheels steer and spin, switching cars keeps shared meshes alive', async () => {
  await loadAll();
  const parent = new THREE.Group();
  const car = makeStaticCar({ id: 'x', team: 'orange', position: { x: 0, y: REST.height, z: 0 } });
  for (const w of car.wheels) w.suspension = REST.suspension;
  const view = new CarView(car, parent, 'porsche');
  assert.equal(view.carId, 'porsche');
  let painted = 0;
  view.shell.traverse((o) => { if (o.isMesh && o.material === view.paintMat) painted++; });
  assert.ok(painted > 0);
  assert.equal(view.paintMat.color.getHex(), new THREE.Color(TEAM_PAINT.orange).getHex());
  view.update(1);
  parent.updateMatrixWorld(true);
  for (const v of view.wheelViews) {
    const box = new THREE.Box3().setFromObject(v.spin);
    assert.ok(Math.abs(box.min.y) < 0.012, `tyre bottom ${box.min.y} on the ground`);
  }
  car.wheels[0].steer = 0.3; car.wheels[0].spin = 1;
  view.update(1);
  assert.equal(view.wheelViews[0].steer.rotation.y, -0.3);
  assert.equal(view.wheelViews[0].spin.rotation.x, -1);
  const shared = carModel('porsche').body.children.length ? carModel('porsche').body : null;
  view.setCar('gtr');
  assert.equal(view.carId, 'gtr');
  disposeTree(parent);
  let alive = true;
  carModel('porsche').body.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) alive = false; });
  assert.ok(alive && shared, 'shared model geometry is never disposed by a view');
  assert.ok(view.nozzleLocal.z > 0.6, 'boost comes out of the rear');
});

test('CarView without loaded models (Node, failed download) still works with a placeholder car', () => {
  const car = makeStaticCar({ id: 'x', team: 'blue' });
  const view = new CarView(car, new THREE.Group(), 'nope-not-loaded-yet');
  assert.equal(view.carId, DEFAULT_CAR);
  assert.equal(view.wheelViews.length, 4);
  view.update(1);
});

test('the old paint / drawing editor is gone; the garage lists the cars', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const gone of ['garage-art', 'garage-base', 'garage-pattern', 'garage-number', 'KAPLAMA']) assert.doesNotMatch(html, new RegExp(gone));
  for (const id of ['garage-cars', 'garage-save', 'garage-cancel']) assert.match(html, new RegExp(`id="${id}"`));
  const online = readFileSync(new URL('../online.html', import.meta.url), 'utf8');
  assert.match(online, /id="my-car"/);
  assert.match(online, /href="\.\/\?garaj=online"/);
});
