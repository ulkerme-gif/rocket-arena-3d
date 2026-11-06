/**
 * The cars a player can drive (src/game/carCatalog.js, built from the low-poly car pack).
 * Every car has its own hitbox and wheels measured from its model; engine, boost and
 * handling are shared. The original paint is kept; a team-coloured glow shows the team.
 */
import { CAR_LIST, THUMB } from '../game/carCatalog.js';
import { isUnlocked } from '../game/unlocks.js';

export const CAR_KEY = 'rocket-arena-car';
export const CARS = CAR_LIST;
export { THUMB };
export const DEFAULT_CAR = 'kas-turkuaz';

/** Accepts anything (storage, network) and returns a known car id. */
export function cleanCar(value) {
  return typeof value === 'string' && CARS.some((c) => c.id === value) ? value : DEFAULT_CAR;
}

export const carInfo = (id) => CARS.find((c) => c.id === cleanCar(id));
export const carLabel = (id) => { const c = carInfo(id); return `${c.name} · ${c.color}`; };

export function loadCar(storage = globalThis.localStorage) {
  try { return cleanCar(storage?.getItem(CAR_KEY)); } catch { return DEFAULT_CAR; }
}

export function saveCar(id, storage = globalThis.localStorage) {
  const car = cleanCar(id);
  try { storage?.setItem(CAR_KEY, car); } catch { /* private mode */ }
  return car;
}

/** Cars anyone can pick; secret ones (e.g. MUZ) need an unlock code first. */
export const OPEN_CARS = CARS.filter((c) => !c.secret);

/** Garage list: open cars + secret cars unlocked on this tablet (or already being driven). */
export function garageCars(storage = globalThis.localStorage, current = null) {
  return CARS.filter((c) => !c.secret || c.id === current || isUnlocked(c.id, storage));
}

/** Bots get their car from the seat id, so every tablet shows the same one. Never a secret car. */
export function botCar(seatId) {
  let h = 7;
  for (const ch of String(seatId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return OPEN_CARS[h % OPEN_CARS.length].id;
}
