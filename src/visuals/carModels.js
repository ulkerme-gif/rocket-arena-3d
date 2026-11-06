import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CARS } from './cars.js';

/**
 * Car models: public/cars/cars.glb (low-poly pack) and banana.glb (banana car), a node per car (CARS[].node).
 * Each car node has "<node>_body" and four "<node>_wheel_FL/FR/RL/RR" nodes placed at
 * their axles (extras.radius). Ground is y = 0, the nose points to -Z and the body is
 * centred on z = 0, the same frame as the physics shape in carCatalog.js.
 * Meshes and the palette material are shared by every CarView: never dispose them.
 */
const models = new Map();
export const WHEEL_KEYS = Object.freeze(['FL', 'FR', 'RL', 'RR']); // CarController wheel order

export function assetBase() {
  const env = import.meta.env;
  return env?.BASE_URL ?? './';
}

/** Registers every car found in a parsed cars.glb. Returns how many were found. */
export function registerCarModels(gltf) {
  let found = 0;
  for (const car of CARS) {
    const node = gltf.scene.getObjectByName(car.node);
    const body = node?.getObjectByName(`${car.node}_body`);
    if (!body) continue;
    const wheels = WHEEL_KEYS.map((key) => {
      const w = node.getObjectByName(`${car.node}_wheel_${key}`);
      return w ? { key, part: w, center: w.position.clone(), radius: w.userData.radius ?? car.shape.wheelRadius } : null;
    });
    if (wheels.some((w) => !w)) continue;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.geometry.userData.shared = true;
      o.material.userData.shared = true;
      if (o.material.map) o.material.map.userData.shared = true;
    });
    models.set(car.id, { id: car.id, body, wheels });
    found++;
  }
  return found;
}

export const carModel = (id) => models.get(id) ?? null;
export const carModelsLoaded = () => CARS.every((c) => models.has(c.id));

export const MODEL_FILES = Object.freeze(['cars/cars.glb', 'cars/banana.glb']);

/** Loads every model file once. A file that fails leaves its cars as plain placeholder boxes. */
let loading = null;
export function loadCarModels(base = assetBase()) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading ??= Promise.all(MODEL_FILES.map((file) => loader.loadAsync(`${base}${file}`)
    .then((gltf) => { registerCarModels(gltf); })
    .catch((error) => { console.warn(`[Cars] ${file} could not be loaded`, error); })));
  return loading;
}

/** Frees a view's own resources; shared car meshes and materials are kept for the next match. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData?.shared) continue;
      if (m.map && !m.map.userData?.shared) m.map.dispose();
      m.dispose();
    }
  });
}
