/** Bot tuning. Difficulty presets override the base values. */
export const BOT = {
  difficulty: 'fair',
  presets: {
    easy: { decisionInterval: 0.12, useBoost: false, aimNoise: 0.28, allowDodgeShots: false, allowJumpShots: true, maxThrottle: 0.8, speedBias: 0.8, boostBias: 0.72, mistakeRate: 0.22 },
    fair: { decisionInterval: 0.07, useBoost: true, aimNoise: 0.16, allowDodgeShots: true, allowJumpShots: true, maxThrottle: 0.92, speedBias: 0.9, boostBias: 0.88, mistakeRate: 0.14 },
    normal: { decisionInterval: 0.05, useBoost: true, aimNoise: 0.09, allowDodgeShots: true, allowJumpShots: true, maxThrottle: 0.97, speedBias: 0.96, boostBias: 0.94, mistakeRate: 0.08 },
    hard: { decisionInterval: 0.0, useBoost: true, aimNoise: 0.03, allowDodgeShots: true, allowJumpShots: true, maxThrottle: 1, speedBias: 1, boostBias: 1, mistakeRate: 0.02 },
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
