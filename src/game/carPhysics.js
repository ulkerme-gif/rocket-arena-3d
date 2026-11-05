import { CAR_LIST } from './carCatalog.js';

/** Suspension length of a car resting on flat ground (same for every car model). */
export function restSuspension(physics) {
  const car = physics.car, W = car.wheels;
  return W.suspensionRestLength - ((1 + car.sticky.base) * Math.abs(physics.world.gravity)) / W.suspensionStiffness;
}

/** Height of the body origin (hitbox centre) above the ground for a car shape at rest. */
export const shapeRestHeight = (shape) => (shape.hitbox.bottom + shape.hitbox.top) / 2;

export const carShape = (carId) => CAR_LIST.find((c) => c.id === carId)?.shape ?? null;

/**
 * Physics config for one car model: its own hitbox, wheel radius and wheel positions,
 * measured from the model (src/game/carCatalog.js). Everything else (engine, boost,
 * jump, steering feel) is shared, so every car drives the same. Unknown ids keep the
 * base config (used by tests and headless tools).
 */
export function carPhysicsConfig(physics, carId) {
  const shape = carShape(carId);
  if (!shape) return physics;
  const base = physics.car, W = base.wheels;
  const yc = shapeRestHeight(shape);
  // Wheel attachment height so that, at rest, the tyres touch the ground exactly where the model has them.
  const attachY = shape.wheelRadius - yc + restSuspension(physics);
  return {
    ...physics,
    car: {
      ...base,
      hitbox: {
        halfWidth: shape.hitbox.halfWidth,
        halfHeight: (shape.hitbox.top - shape.hitbox.bottom) / 2,
        halfLength: shape.hitbox.halfLength,
      },
      wheels: {
        ...W,
        radius: shape.wheelRadius,
        front: { x: shape.front.x, y: attachY, z: shape.front.z },
        rear: { x: shape.rear.x, y: attachY, z: shape.rear.z },
      },
    },
  };
}
