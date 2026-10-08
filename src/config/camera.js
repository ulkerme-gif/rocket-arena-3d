/**
 * Camera tuning. Distances in meters, angles in degrees.
 * fov is the VERTICAL field of view used by Three.js.
 */
export const CAMERA = {
  fov: 72,
  speedFovBoost: 6,            // extra degrees at max speed
  distance: 3.1,
  height: 1.15,
  angle: -4,                   // pitch offset (negative looks down)
  stiffness: 0.55,             // 0 = loose/laggy, 1 = rigid
  swivelSmoothing: 9,          // 1/s, car-cam heading smoothing
  upSmoothing: 5,              // 1/s, how fast the camera rolls onto walls
  ballCamSmoothing: 7,         // 1/s, ball-cam heading smoothing
  ballCamMaxElevation: 0.95,   // rad
  transitionRate: 10,          // 1/s, blend between modes
  near: 0.05,
  far: 600,
  defaultBallCam: true,
};
