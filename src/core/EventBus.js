/** Minimal synchronous publish/subscribe bus used for game events. */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${type}" failed`, err);
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}
