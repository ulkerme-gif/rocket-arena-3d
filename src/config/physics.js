/**
 * Rocket Arena 3D — PHYSICS TUNING
 * ------------------------------------------------------------------
 * Single source of truth for every physics parameter (car, ball, boost,
 * world). Change values here; no physics constant lives anywhere else.
 *
 * Units: 1 unit = 1 meter, seconds, abstract mass units. +Y is up.
 * Many defaults are converted from public Rocket League research
 * (Unreal units / 100), then adjusted for this arena. See docs/TUNING.md.
 */
export const PHYSICS = {
  world: {
    tickRate: 120,            // fixed physics ticks per second
    gravity: -6.5,            // m/s² (RL feels floaty: 650 uu/s²)
    solverIterations: 8,
    maxCcdSubsteps: 2,
  },

  car: {
    mass: 180,
    // Collision box ("hitbox"), relative to the body origin.
    hitbox: { halfWidth: 0.42, halfHeight: 0.18, halfLength: 0.59 },
    // Center of mass offset in car-local space (+z = towards the rear).
    // A low CoM keeps the car planted, similar to RL.
    centerOfMass: { x: 0, y: -0.12, z: 0.08 },
    friction: 0.5,
    restitution: 0,
    maxSpeed: 23,             // hard cap on |velocity|
    supersonicSpeed: 22,
    maxAngularSpeed: 5.5,     // rad/s, hard cap (RL value)

    wheels: {
      radius: 0.15,
      // Suspension anchor points (car-local; forward is -Z, right is +X).
      front: { x: 0.36, y: -0.1, z: -0.38 },
      rear: { x: 0.37, y: -0.1, z: 0.4 },
      suspensionRestLength: 0.151,
      // Per-wheel spring, normalized by the wheel's share of the mass:
      // accel = k * compression + c * compressionVelocity.
      suspensionStiffness: 900,
      dampingCompression: 40,
      dampingRelaxation: 50,
      maxSuspensionAccel: 600,
      groundedWheelCount: 3,  // wheels needed to count as "on ground"
    },

    drive: {
      // forward speed (m/s) -> acceleration (m/s²) while holding throttle
      throttleAccelCurve: [[0, 16], [14, 1.6], [14.1, 0]],
      brakeAccel: 35,
      coastDecel: 5.25,
      stopSpeed: 0.25,
      airThrottleAccel: 0.667,
    },

    steering: {
      // forward speed (m/s) -> max steering angle (rad)
      steerAngleCurve: [[0, 0.5336], [5, 0.3193], [10, 0.18203], [15, 0.1057], [17.5, 0.08507], [30, 0.03454]],
      powerslideSteerAngleCurve: [[0, 0.39235], [25, 0.1261]],
      wheelBase: 0.8,          // effective, used by the yaw-rate (bicycle) model
      yawResponse: 20,         // 1/s, how fast the yaw rate tracks its target
      lateralGrip: 30,         // 1/s, how fast sideways slip is removed
      lateralFrictionCurve: [[0, 1], [1, 0.2]],   // slip ratio -> grip multiplier
      handbrakeGripMultiplier: 0.1,
      handbrakeRiseRate: 5,
      handbrakeFallRate: 2,
      groundTiltDamping: 1.5,  // extra pitch/roll damping with wheels down
    },

    sticky: {
      base: 0.5,               // × gravity, pushes the car into the surface
      wallExtra: 1.0,          // + (1 - |up.y|) × this while driving (walls)
      minWheels: 2,
    },

    air: {
      // RL air control: angular acceleration (rad/s²) and damping (1/s).
      torque: { pitch: 12.146, yaw: 8.92, roll: 36.08 },
      damping: { pitch: 2.798, yaw: 1.886, roll: 4.472 },
    },

    jump: {
      impulse: 2.9167,         // m/s instant
      holdAccel: 14.583,       // m/s² while held
      minHoldTime: 0.025,
      maxHoldTime: 0.2,
      doubleJumpImpulse: 2.9167,
      doubleJumpWindow: 1.25,  // s after the first jump ends
      landingGuard: 0.1,       // s; ignore ground contact right after a jump
    },

    dodge: {
      impulse: 5,              // m/s
      deadzone: 0.5,           // |pitch| + |steer| needed for a dodge
      forwardMaxSpeedScale: 1.0,
      sideMaxSpeedScale: 1.9,
      backwardMaxSpeedScale: 2.5,
      backwardScale: 16 / 15,
      torqueTime: 0.65,        // s of flip rotation
      angularSpeed: 5.5,       // rad/s target spin
      angularAccel: 140,       // rad/s² to reach the spin
      zDampStart: 0.15,
      zDampEnd: 0.21,
      zDampPerTick120: 0.35,   // vertical velocity damping per 1/120 s
      cancelEnabled: true,
    },

    recovery: {
      // "Auto flip": jump while lying on the roof or side.
      impulse: 2.6,
      maxTime: 0.9,
      angularGain: 7,
      probeMargin: 0.3,
      maxSpeed: 6,
    },
  },

  ball: {
    radius: 0.93,
    mass: 30,
    friction: 0.35,
    restitution: 0.6,
    linearDamping: 0.03,
    angularDamping: 0.03,
    maxSpeed: 60,
    maxAngularSpeed: 6,
  },

  // Extra impulse added to the ball when a car touches it (RL "Psyonix hit").
  ballHit: {
    zScale: 0.35,              // vertical component of hit direction is scaled by this
    forwardScale: 0.65,        // forward component scale (relative to car)
    maxRelativeSpeed: 46,
    strengthCurve: [[0, 0.65], [5, 0.65], [23, 0.55], [46, 0.3]],
    touchMargin: 0.1,          // m; ball is "touching" within this gap
    repeatInterval: 0.1,       // s; re-apply during continuous contact
  },

  boost: {
    max: 100,
    startAmount: 33.3,
    consumptionPerSecond: 33.3,
    groundAccel: 9.9167,
    airAccel: 10.583,
    minActiveTime: 0.1,
  },

  boostPads: {
    big: { amount: 100, respawnTime: 10, radius: 2.08 },
    small: { amount: 12, respawnTime: 4, radius: 1.44 },
    pickupHeight: 1.7,
  },

  arenaSurface: {
    friction: 1.0,             // multiplied with the other collider's value
    restitution: 1.0,
  },
};
