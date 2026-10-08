/**
 * Fixed-timestep loop: physics runs at a constant rate (e.g. 120 Hz),
 * rendering runs on requestAnimationFrame and receives an interpolation
 * factor alpha in [0, 1) between the previous and current physics state.
 */

/**
 * Pure accumulator logic (unit-tested). Returns how many fixed steps to run
 * and the new accumulator value.
 */
export function advanceAccumulator(accumulator, frameDt, fixedDt, maxSteps, maxFrameTime = 0.25) {
  const dt = Math.min(Math.max(frameDt, 0), maxFrameTime);
  let acc = accumulator + dt;
  let steps = Math.floor(acc / fixedDt);
  if (steps > maxSteps) {
    // Too far behind (tab switch, debugger, slow device): drop the backlog
    // instead of spiralling into ever longer frames.
    steps = maxSteps;
    acc = 0;
  } else {
    acc -= steps * fixedDt;
  }
  return { steps, accumulator: acc, alpha: acc / fixedDt };
}

export class GameLoop {
  /**
   * @param {object} o
   * @param {number} o.fixedDt seconds per physics tick
   * @param {(dt:number)=>void} o.onStep called once per physics tick
   * @param {(alpha:number, frameDt:number)=>void} o.onRender called once per frame
   */
  constructor({ fixedDt, onStep, onRender, maxStepsPerFrame = 12, maxFrameTime = 0.25 }) {
    this.fixedDt = fixedDt;
    this.onStep = onStep;
    this.onRender = onRender;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.maxFrameTime = maxFrameTime;
    this.accumulator = 0;
    this.paused = false;
    this.running = false;
    this._last = 0;
    this._raf = 0;
    this.stats = { fps: 0, stepsLastFrame: 0, frameMs: 0 };
    this._fpsTime = 0;
    this._fpsFrames = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  setPaused(paused) {
    this.paused = paused;
    this.accumulator = 0;
  }

  _tick(now) {
    if (!this.running) return;
    const frameDt = (now - this._last) / 1000;
    this._last = now;

    let alpha = 1;
    let steps = 0;
    if (!this.paused) {
      const r = advanceAccumulator(this.accumulator, frameDt, this.fixedDt, this.maxStepsPerFrame, this.maxFrameTime);
      this.accumulator = r.accumulator;
      steps = r.steps;
      alpha = r.alpha;
      for (let i = 0; i < steps; i++) this.onStep(this.fixedDt);
    }
    this.onRender(alpha, Math.min(frameDt, this.maxFrameTime));

    this.stats.stepsLastFrame = steps;
    this.stats.frameMs = frameDt * 1000;
    this._fpsFrames++;
    this._fpsTime += frameDt;
    if (this._fpsTime >= 0.5) {
      this.stats.fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }
    this._raf = requestAnimationFrame(this._tick);
  }
}
