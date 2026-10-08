import { Vector3, Quaternion } from 'three';
import { GROUPS } from './collisionGroups.js';

/**
 * The ball: a dynamic sphere with CCD. Its motion comes only from the
 * physics engine (gravity, contacts) plus the car-hit impulse; it is never
 * attached to or steered by a car.
 */
export class Ball {
  constructor(physicsWorld, ballConfig) {
    const R = physicsWorld.RAPIER;
    this.physics = physicsWorld;
    this.config = ballConfig;
    this.radius = ballConfig.radius;
    this.mass = ballConfig.mass;

    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(0, this.radius, 0)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(ballConfig.linearDamping)
      .setAngularDamping(ballConfig.angularDamping);
    this.body = physicsWorld.world.createRigidBody(bodyDesc);
    const inertia = 0.4 * this.mass * this.radius * this.radius;
    const colDesc = R.ColliderDesc.ball(this.radius)
      .setMassProperties(this.mass, { x: 0, y: 0, z: 0 }, { x: inertia, y: inertia, z: inertia }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(ballConfig.friction)
      .setRestitution(ballConfig.restitution)
      .setCollisionGroups(GROUPS.ball);
    this.collider = physicsWorld.world.createCollider(colDesc, this.body);

    this.enabled = true;
    this.position = new Vector3(0, this.radius, 0);
    this.quaternion = new Quaternion();
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.prevPosition = this.position.clone();
    this.prevQuaternion = this.quaternion.clone();
    this.readState();
  }

  readState() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel(), w = this.body.angvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
    this.angularVelocity.set(w.x, w.y, w.z);
  }

  capturePrevious() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  /** Clamp speeds after the physics step (RL: 60 m/s, 6 rad/s). */
  postStep() {
    if (!this.enabled) return;
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > this.config.maxSpeed) {
      const k = this.config.maxSpeed / speed;
      this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
    }
    const w = this.body.angvel();
    const ws = Math.hypot(w.x, w.y, w.z);
    if (ws > this.config.maxAngularSpeed) {
      const k = this.config.maxAngularSpeed / ws;
      this.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
    }
    this.readState();
  }

  /** Adds a velocity change through an impulse (used by the car-hit model). */
  addVelocity(dv) {
    this.body.applyImpulse({ x: dv.x * this.mass, y: dv.y * this.mass, z: dv.z * this.mass }, true);
  }

  /** Respawn (kickoff / after goal). Not used for gameplay movement. */
  reset(position = { x: 0, y: this.radius, z: 0 }, velocity = { x: 0, y: 0, z: 0 }) {
    this.body.setTranslation(position, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel(velocity, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.readState();
    this.snapInterpolation();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.body.setEnabled(enabled);
  }

  snapInterpolation() {
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  /** Interpolated transform for rendering. */
  getRenderTransform(alpha, outPos, outQuat) {
    outPos.lerpVectors(this.prevPosition, this.position, alpha);
    outQuat.slerpQuaternions(this.prevQuaternion, this.quaternion, alpha);
  }
}
