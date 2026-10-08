/** Bot tuning. Difficulty presets override the base values. */
export const BOT = {
  difficulty: 'normal',
  presets: {
    easy: { decisionInterval: 0.12, useBoost: false, aimNoise: 0.25, allowDodgeShots: false, allowJumpShots: true, maxThrottle: 0.85 },
    normal: { decisionInterval: 0.05, useBoost: true, aimNoise: 0.08, allowDodgeShots: true, allowJumpShots: true, maxThrottle: 1 },
    hard: { decisionInterval: 0.0, useBoost: true, aimNoise: 0.0, allowDodgeShots: true, allowJumpShots: true, maxThrottle: 1 },
  },
  steerGain: 2.6,
  handbrakeAngle: 1.5,
  reverseAngle: 2.5,
  boostAngle: 0.3,
  kickoffDodgeDistance: 6.5,
  dodgeShotDistance: 3.4,
  jumpShotMinHeight: 1.75,
  jumpShotMaxHeight: 4.3,
  stuckTime: 1.1,
  predictionHorizon: 3,
};
