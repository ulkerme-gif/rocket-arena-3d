import { GROUPS } from './collisionGroups.js';

/**
 * Thin wrapper around a Rapier world.
 * Owns the world, the fixed timestep and reusable scene-query helpers.
 * RAPIER must already be initialized (await RAPIER.init()).
 */
export class PhysicsWorld {
  /**
   * @param {typeof import('@dimforge/rapier3d-compat')} RAPIER
   * @param {object} physicsConfig CONFIG.physics
   */
  constructor(RAPIER, physicsConfig) {
    if (!RAPIER || !RAPIER.World) throw new Error('PhysicsWorld: RAPIER is not initialized');
    this.RAPIER = RAPIER;
    this.config = physicsConfig;
    const w = physicsConfig.world;
    this.gravity = w.gravity;
    this.world = new RAPIER.World({ x: 0, y: w.gravity, z: 0 });
    this.world.timestep = 1 / w.tickRate;
    this.world.numSolverIterations = w.solverIterations;
    this.world.maxCcdSubsteps = w.maxCcdSubsteps;
    this.dt = this.world.timestep;
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._hit = { distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, collider: null };
  }

  step() {
    this.world.step();
  }

  /**
   * Cast a ray against the arena only.
   * Returns a REUSED hit object (copy what you need) or null.
   */
  castArenaRay(origin, dir, maxDist, excludeBody = undefined) {
    const ray = this._ray;
    ray.origin.x = origin.x; ray.origin.y = origin.y; ray.origin.z = origin.z;
    ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, GROUPS.arenaQuery, undefined, excludeBody);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    const out = this._hit;
    out.distance = t;
    out.point.x = origin.x + dir.x * t;
    out.point.y = origin.y + dir.y * t;
    out.point.z = origin.z + dir.z * t;
    out.normal.x = hit.normal.x; out.normal.y = hit.normal.y; out.normal.z = hit.normal.z;
    // Always report the normal facing back towards the ray origin.
    if (out.normal.x * dir.x + out.normal.y * dir.y + out.normal.z * dir.z > 0) {
      out.normal.x = -out.normal.x; out.normal.y = -out.normal.y; out.normal.z = -out.normal.z;
    }
    out.collider = hit.collider;
    return out;
  }

  dispose() {
    this.world.free();
  }
}
