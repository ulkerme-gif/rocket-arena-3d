import * as THREE from 'three';
import { CONFIG } from '../config/index.js';

/**
 * A car "model" without physics, shaped like CarController enough for CarView
 * (position, quaternion, wheels, state). Used by the guest view and the garage preview.
 */
export function makeStaticCar({ id, team, position = { x: 0, y: 0, z: 0 }, quaternion = { x: 0, y: 0, z: 0, w: 1 }, velocity = { x: 0, y: 0, z: 0 } }) {
  const car = {
    id, team,
    position: new THREE.Vector3(position.x, position.y, position.z),
    quaternion: new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
    velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
    forward: new THREE.Vector3(0, 0, -1),
    state: { isBoosting: false, isSupersonic: false, onGround: true },
    wheels: [],
    getRenderTransform(_alpha, outPos, outQuat) { outPos.copy(this.position); outQuat.copy(this.quaternion); },
  };
  const wheel = CONFIG.physics.car.wheels;
  for (const z of [wheel.front.z, wheel.rear.z]) for (const side of [-1, 1]) {
    const front = z === wheel.front.z;
    car.wheels.push({
      local: { x: side * (front ? wheel.front.x : wheel.rear.x), y: front ? wheel.front.y : wheel.rear.y, z },
      side, suspension: wheel.suspensionRestLength / 2, steer: 0, spin: 0,
    });
  }
  car.forward.applyQuaternion(car.quaternion);
  return car;
}
