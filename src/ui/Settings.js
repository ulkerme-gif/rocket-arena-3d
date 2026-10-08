const STORAGE_KEY = 'rocket-arena-settings-v1';

/** User-adjustable settings, persisted in localStorage and applied to CONFIG live. */
export class Settings {
  constructor(config) {
    this.config = config;
    const c = config.camera;
    this.defaults = {
      fov: c.fov, distance: c.distance, height: c.height, angle: c.angle, stiffness: c.stiffness,
      ballCamDefault: c.defaultBallCam, botDifficulty: config.bot.difficulty, shadows: config.graphics.shadows,
    };
    this.values = { ...this.defaults, ...this._load() };
    this.listeners = new Set();
    this.apply();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* storage unavailable (private mode): settings stay for this session */
    }
  }

  set(key, value) {
    if (!(key in this.defaults)) return;
    this.values[key] = value;
    this.apply();
    this._save();
  }

  reset() {
    this.values = { ...this.defaults };
    this.apply();
    this._save();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  apply() {
    const v = this.values;
    const cam = this.config.camera;
    cam.fov = +v.fov;
    cam.distance = +v.distance;
    cam.height = +v.height;
    cam.angle = +v.angle;
    cam.stiffness = +v.stiffness;
    cam.defaultBallCam = !!v.ballCamDefault;
    this.config.bot.difficulty = v.botDifficulty;
    this.config.graphics.shadows = !!v.shadows;
    for (const fn of this.listeners) fn(v);
  }
}
