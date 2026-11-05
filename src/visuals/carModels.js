import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CARS } from './cars.js';

/**
 * Car models (public/cars/<id>.glb), loaded once and shared by every CarView.
 * Each file has a "body" node and four "wheel_FL/FR/RL/RR" nodes placed at their
 * axle, each with a "spin" part (tyre, rim, disc) and a fixed "hub" part (caliper).
 * Ground is y = 0, the car points to -Z and is centred between its axles.
 */
const models = new Map();
export const WHEEL_KEYS = Object.freeze(['FL', 'FR', 'RL', 'RR']); // CarController wheel order

/** Prepares a parsed glTF for CarView. Its meshes and materials are shared: never dispose them. */
export function registerCarModel(id, gltf) {
  const scene = gltf.scene;
  const body = scene.getObjectByName('body');
  if (!body) throw new Error(`car model ${id}: no body`);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.geometry.userData.shared = true;
    o.material.userData.shared = true;
  });
  const wheels = WHEEL_KEYS.map((key) => {
    const node = scene.getObjectByName(`wheel_${key}`);
    if (!node) throw new Error(`car model ${id}: no wheel_${key}`);
    // GLTFLoader renames repeated node names (spin, spin_1, ...): match the prefix.
    const part = (kind) => node.children.find((c) => c.name === kind || c.name.startsWith(`${kind}_`)) ?? null;
    return { key, center: node.position.clone(), radius: node.userData.radius ?? 0.11, spin: part('spin'), hub: part('hub') };
  });
  const box = new THREE.Box3().setFromObject(body);
  const model = { id, body, wheels, box };
  models.set(id, model);
  return model;
}

export const carModel = (id) => models.get(id) ?? null;
export const carModelsLoaded = () => CARS.every((c) => models.has(c.id));

function defaultBase() {
  const env = import.meta.env;
  return env?.BASE_URL ?? './';
}

/** Loads every car once. A model that fails to load falls back to a plain placeholder car. */
export async function loadCarModels(base = defaultBase()) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(CARS.map(async (car) => {
    if (models.has(car.id)) return;
    try {
      registerCarModel(car.id, await loader.loadAsync(`${base}cars/${car.id}.glb`));
    } catch (error) {
      console.warn(`[Cars] ${car.id} could not be loaded`, error);
    }
  }));
}

/** Frees a view's own resources; shared car meshes and materials are kept for the next match. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData?.shared) continue;
      m.map?.dispose();
      m.dispose();
    }
  });
}
