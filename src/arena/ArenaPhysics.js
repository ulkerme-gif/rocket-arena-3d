import { GROUPS } from '../physics/collisionGroups.js';

/**
 * Creates the static Rapier colliders for the arena from ArenaGeometry:
 * a floor cuboid, a ceiling cuboid and one welded triangle mesh for walls,
 * fillets, corners and goal interiors.
 */
export class ArenaPhysics {
  constructor(physicsWorld, geometry, surfaceConfig) {
    const R = physicsWorld.RAPIER;
    const world = physicsWorld.world;
    const { a, b, H, gd } = geometry.dims;
    this.colliders = [];
    this.trimeshFlags = 'none';

    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    this.body = body;
    const surface = (desc) =>
      desc
        .setFriction(surfaceConfig.friction)
        .setRestitution(surfaceConfig.restitution)
        .setFrictionCombineRule(R.CoefficientCombineRule.Multiply)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply)
        .setCollisionGroups(GROUPS.arena);

    const slab = 2;
    const hx = a + 20, hz = b + gd + 20;
    this.colliders.push(world.createCollider(surface(R.ColliderDesc.cuboid(hx, slab, hz).setTranslation(0, -slab, 0)), body));
    this.colliders.push(world.createCollider(surface(R.ColliderDesc.cuboid(hx, slab, hz).setTranslation(0, H + slab, 0)), body));

    const { positions, indices } = geometry.collision;
    let mesh = null;
    const flagSets = [
      ['FIX_INTERNAL_EDGES', R.TriMeshFlags?.FIX_INTERNAL_EDGES],
      ['none', undefined],
    ];
    for (const [name, flags] of flagSets) {
      try {
        mesh = world.createCollider(surface(R.ColliderDesc.trimesh(positions, indices, flags)), body);
        this.trimeshFlags = name;
        break;
      } catch (err) {
        console.warn(`[ArenaPhysics] trimesh with flags ${name} failed, falling back`, err);
      }
    }
    if (!mesh) throw new Error('ArenaPhysics: could not create the arena trimesh');
    this.colliders.push(mesh);
    this.meshCollider = mesh;
  }
}
