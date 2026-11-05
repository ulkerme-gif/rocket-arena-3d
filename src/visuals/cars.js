/**
 * The cars a player can drive. Every car shares the same hitbox and physics:
 * the choice is purely visual. The paint follows the team (blue / orange).
 * Models live in public/cars/<id>.glb (built from the original FBX files).
 */
export const CAR_KEY = 'rocket-arena-car';

export const CARS = Object.freeze([
  Object.freeze({ id: 'gtr', name: 'GT-R NISMO', maker: 'Nissan' }),
  Object.freeze({ id: 'porsche', name: '718 CAYMAN GT4', maker: 'Porsche' }),
]);

export const DEFAULT_CAR = 'gtr';

/** Accepts anything (storage, network) and returns a known car id. */
export function cleanCar(value) {
  return typeof value === 'string' && CARS.some((c) => c.id === value) ? value : DEFAULT_CAR;
}

export const carInfo = (id) => CARS.find((c) => c.id === cleanCar(id));

export function loadCar(storage = globalThis.localStorage) {
  try { return cleanCar(storage?.getItem(CAR_KEY)); } catch { return DEFAULT_CAR; }
}

export function saveCar(id, storage = globalThis.localStorage) {
  const car = cleanCar(id);
  try { storage?.setItem(CAR_KEY, car); } catch { /* private mode */ }
  return car;
}

/** Bots get their car from the seat id, so every tablet shows the same one. */
export function botCar(seatId) {
  let h = 7;
  for (const ch of String(seatId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARS[h % CARS.length].id;
}
