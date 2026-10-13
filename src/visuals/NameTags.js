import * as THREE from 'three';

const _p = new THREE.Vector3();
const HEIGHT_ABOVE_CAR = 0.85;

/**
 * Name tags above cars, as plain HTML labels laid over the canvas (crisp text,
 * no textures). Call set() when names change and update() every frame.
 */
export class NameTags {
  constructor(container) {
    this.container = container;
    this.tags = new Map(); // id -> { el, text, team }
  }

  /** entries: [{ id, text, team }] — cars without an entry get no tag (e.g. your own car). */
  set(entries) {
    const keep = new Set();
    for (const { id, text, team } of entries) {
      keep.add(id);
      let tag = this.tags.get(id);
      if (!tag) {
        if (!this.container) continue;
        const el = this.container.ownerDocument.createElement('div');
        el.className = 'name-tag';
        el.style.display = 'none';
        this.container.append(el);
        tag = { el, text: null, team: null };
        this.tags.set(id, tag);
      }
      if (tag.text !== text) { tag.el.textContent = text; tag.text = text; }
      if (tag.team !== team) { tag.el.dataset.team = team; tag.team = team; }
    }
    for (const [id, tag] of this.tags) {
      if (!keep.has(id)) { tag.el.remove(); this.tags.delete(id); }
    }
  }

  /**
   * objects: Map id -> Object3D (the car's render group). Labels behind the camera
   * or off screen are hidden; far away labels shrink and fade a little.
   */
  update(camera, objects, width, height) {
    for (const [id, tag] of this.tags) {
      const obj = objects?.get(id);
      if (!obj) { if (tag.shown) { tag.el.style.display = 'none'; tag.shown = false; } continue; }
      _p.copy(obj.position);
      _p.y += HEIGHT_ABOVE_CAR;
      const distance = _p.distanceTo(camera.position);
      _p.project(camera);
      const visible = _p.z < 1 && _p.z > -1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1;
      if (!visible) { if (tag.shown) { tag.el.style.display = 'none'; tag.shown = false; } continue; }
      const x = ((_p.x + 1) / 2) * width;
      const y = ((1 - _p.y) / 2) * height;
      const scale = Math.max(0.62, Math.min(1.1, 14 / Math.max(1, distance)));
      tag.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      tag.el.style.opacity = distance > 60 ? '0.7' : '1';
      if (!tag.shown) { tag.el.style.display = ''; tag.shown = true; }
    }
  }

  clear() { this.set([]); }
}
