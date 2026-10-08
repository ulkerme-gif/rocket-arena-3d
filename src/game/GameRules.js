import { MODE, PHASE, TEAM, opponentOf } from './constants.js';

/**
 * Match flow: kickoff countdown, clock, goal detection, score, golden-goal
 * overtime, the "zero-second" rule and match end. Also drives training and
 * demo modes. Communicates outward only through events.
 *
 * Events: phase, kickoff, countdown, goal, overtime, matchEnd, ballReset
 */
export class GameRules {
  constructor(sim, rulesConfig, events) {
    this.sim = sim;
    this.cfg = rulesConfig;
    this.events = events;
    this.mode = sim.mode;
    this.phase = PHASE.IDLE;
    this._resetMatchState();
  }

  _resetMatchState() {
    this.score = { [TEAM.BLUE]: 0, [TEAM.ORANGE]: 0 };
    this.timeRemaining = this.cfg.matchDuration;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.regulationOver = false;
    this.clockRunning = false;
    this.kickoffActive = false;
    this.countdown = 0;
    this.goalTimer = 0;
    this.winner = null;
    this.lastTouch = null;
    this.lastGoal = null;
    this.trainingGoals = 0;
    this._lastCount = null;
  }

  get hasClock() {
    return this.mode === MODE.MATCH;
  }

  start() {
    this._resetMatchState();
    if (this.mode === MODE.TRAINING) {
      this.sim.resetTraining();
      this._setPhase(PHASE.PLAYING);
    } else {
      this._kickoff();
    }
  }

  controlsEnabled() {
    return this.phase === PHASE.PLAYING || this.phase === PHASE.GOAL;
  }

  _setPhase(phase) {
    this.phase = phase;
    this.events.emit('phase', { phase });
  }

  _kickoff() {
    this.sim.resetForKickoff();
    this.countdown = this.cfg.countdown;
    this.clockRunning = !this.cfg.clockStartsOnFirstTouch;
    this.kickoffActive = true;
    this._lastCount = null;
    this._setPhase(PHASE.COUNTDOWN);
    this.events.emit('kickoff', { overtime: this.overtime });
  }

  preTick(dt) {
    if (this.phase !== PHASE.COUNTDOWN) return;
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n > 0 && n !== this._lastCount) {
      this._lastCount = n;
      this.events.emit('countdown', { value: n });
    }
    if (this.countdown <= 0) {
      this.countdown = 0;
      this.events.emit('countdown', { value: 0 });
      this._setPhase(PHASE.PLAYING);
    }
  }

  onTouch(touch) {
    this.lastTouch = { carId: touch.car.id, team: touch.car.team, time: this.sim.time };
    this.kickoffActive = false;
    if (this.phase === PHASE.PLAYING && this.hasClock) this.clockRunning = true;
  }

  /** Which goal the ball is fully inside ('blue' = +Z goal), or null. */
  checkGoal() {
    const ball = this.sim.ball;
    if (!ball.enabled) return null;
    const { b, hg, gh } = this.sim.dims;
    const p = ball.position;
    if (Math.abs(p.x) > hg || p.y > gh) return null;
    if (p.z > b + ball.radius) return TEAM.BLUE;
    if (p.z < -(b + ball.radius)) return TEAM.ORANGE;
    return null;
  }

  postTick(dt) {
    if (this.phase === PHASE.PLAYING) {
      if (this.hasClock && this.clockRunning) {
        if (this.overtime) this.overtimeElapsed += dt;
        else if (!this.regulationOver) {
          this.timeRemaining -= dt;
          if (this.timeRemaining <= 0) {
            this.timeRemaining = 0;
            this.regulationOver = true;
            this.events.emit('timeUp', {});
            if (!this.cfg.zeroSecondRule) return this._endRegulation();
          }
        }
      }
      const goalHit = this.checkGoal();
      if (goalHit) return this._onGoal(opponentOf(goalHit));
      if (this.regulationOver && !this.overtime) {
        const ball = this.sim.ball;
        if (ball.position.y <= ball.radius + 0.12) return this._endRegulation();
      }
    } else if (this.phase === PHASE.GOAL) {
      this.goalTimer -= dt;
      if (this.goalTimer > 0) return;
      if (this.mode === MODE.TRAINING) {
        this.sim.resetBall();
        this._setPhase(PHASE.PLAYING);
      } else if (this.overtime) {
        this._endMatch();
      } else if (this.regulationOver) {
        this._endRegulation();
      } else {
        this._kickoff();
      }
    }
  }

  _onGoal(scoringTeam) {
    const ball = this.sim.ball;
    if (this.mode === MODE.TRAINING) this.trainingGoals++;
    else this.score[scoringTeam]++;
    const lt = this.lastTouch;
    this.lastGoal = {
      team: scoringTeam,
      scorerId: lt ? lt.carId : null,
      ownGoal: !!lt && lt.team !== scoringTeam,
      ballSpeed: ball.velocity.length(),
      position: { x: ball.position.x, y: ball.position.y, z: ball.position.z },
    };
    ball.setEnabled(false);
    this.goalTimer = this.mode === MODE.TRAINING ? this.cfg.trainingGoalReset : this.cfg.goalCelebration;
    this._setPhase(PHASE.GOAL);
    this.events.emit('goal', { ...this.lastGoal, score: { ...this.score }, trainingGoals: this.trainingGoals });
  }

  _endRegulation() {
    this.regulationOver = true;
    this.timeRemaining = 0;
    if (this.score.blue === this.score.orange) {
      this.overtime = true;
      this.overtimeElapsed = 0;
      this.events.emit('overtime', {});
      this._kickoff();
    } else {
      this._endMatch();
    }
  }

  _endMatch() {
    this.winner = this.score.blue > this.score.orange ? TEAM.BLUE : TEAM.ORANGE;
    this._setPhase(PHASE.ENDED);
    this.events.emit('matchEnd', { winner: this.winner, score: { ...this.score }, overtime: this.overtime });
  }
}
