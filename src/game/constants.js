export const TEAM = Object.freeze({ BLUE: 'blue', ORANGE: 'orange' });
export const MODE = Object.freeze({ MATCH: 'match', TRAINING: 'training', DEMO: 'demo' });
export const PHASE = Object.freeze({ IDLE: 'idle', COUNTDOWN: 'countdown', PLAYING: 'playing', GOAL: 'goal', ENDED: 'ended' });

/** BLUE defends the +Z goal and attacks towards -Z. */
export const goalZSign = (team) => (team === TEAM.BLUE ? 1 : -1);
export const opponentOf = (team) => (team === TEAM.BLUE ? TEAM.ORANGE : TEAM.BLUE);
