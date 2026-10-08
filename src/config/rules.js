/** Match and mode rules. */
export const RULES = {
  matchDuration: 300,          // seconds (5 minutes)
  countdown: 3,                // kickoff countdown
  goalCelebration: 3,          // seconds between goal and next kickoff
  trainingGoalReset: 2,        // training: ball respawn delay after a goal
  clockStartsOnFirstTouch: true,
  zeroSecondRule: true,        // at 0:00 play continues until the ball touches the floor
  training: { unlimitedBoost: false, resetBoostAmount: 100 },
  outOfBoundsMargin: 6,        // safety reset if something escapes the arena
};
