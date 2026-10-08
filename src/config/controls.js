/**
 * Input bindings. Keyboard uses KeyboardEvent.code (physical key position,
 * independent of the keyboard language layout).
 * Gamepad uses the W3C "standard" mapping indices.
 */
export const CONTROLS = {
  keyboard: {
    throttle: ['KeyW'],
    reverse: ['KeyS'],
    steerLeft: ['KeyA'],
    steerRight: ['KeyD'],
    jump: ['Space'],
    boost: ['ShiftLeft'],
    handbrake: ['ControlLeft'],
    rollLeft: ['KeyQ'],
    rollRight: ['KeyE'],
    ballCam: ['KeyC'],
    reset: ['KeyR'],
    resetBall: ['KeyT'],
    pause: ['KeyP', 'Escape'],
    debug: ['KeyH'],
  },
  gamepad: {
    deadzone: 0.15,
    axes: { steer: 0, pitch: 1 },
    invertPitch: false,        // false: stick up = nose down (RL default)
    buttons: {
      throttle: 7,             // RT / R2 (analog)
      reverse: 6,              // LT / L2 (analog)
      jump: 0,                 // A / Cross
      boost: 1,                // B / Circle
      handbrake: 2,            // X / Square (also free air roll)
      ballCam: 3,              // Y / Triangle
      rollLeft: 4,             // LB / L1
      rollRight: 5,            // RB / R1
      reset: 8,                // Back / Share
      pause: 9,                // Start / Options
    },
  },
};
