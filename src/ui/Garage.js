import { CARS, THUMB, cleanCar } from '../visuals/cars.js';
import { assetBase } from '../visuals/carModels.js';

/**
 * GARAJ screen: pick a car from the grid. Every choice shows up straight away on the
 * turntable (onChange); "BU ARABAYI SEÇ" stores it (onSave). DOM ids live in index.html (#garage).
 * Pictures come from one sprite sheet (public/cars/thumbs.webp, THUMB in carCatalog.js).
 */
export class Garage {
  constructor(doc, { onChange, onSave, onClose } = {}) {
    this.doc = doc;
    this.el = (id) => doc.getElementById(id);
    this.onChange = onChange;
    this.onSave = onSave;
    this.onClose = onClose;
    this.selected = CARS[0].id;
    this.saved = this.selected;

    const list = this.el('garage-cars');
    const rows = Math.ceil(CARS.length / THUMB.columns);
    const sheet = `url("${assetBase()}${THUMB.file}")`;
    for (const car of CARS) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'car-card';
      b.dataset.car = car.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', `${car.name}, ${car.color}`);
      const pic = doc.createElement('span');
      pic.className = 'car-pic';
      const col = car.thumb % THUMB.columns, row = Math.floor(car.thumb / THUMB.columns);
      pic.style.backgroundImage = sheet;
      pic.style.backgroundSize = `${THUMB.columns * 100}% ${rows * 100}%`;
      pic.style.backgroundPosition = `${(col / Math.max(1, THUMB.columns - 1)) * 100}% ${(row / Math.max(1, rows - 1)) * 100}%`;
      const name = doc.createElement('span');
      name.className = 'car-name';
      name.textContent = car.name;
      const color = doc.createElement('span');
      color.className = 'car-color';
      color.textContent = car.color;
      b.append(pic, name, color);
      b.addEventListener('click', () => this.select(car.id));
      list.append(b);
    }
    // Arrow keys move through the grid, like any radio group.
    list.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = CARS.findIndex((c) => c.id === this.selected);
      this.select(CARS[Math.min(CARS.length - 1, Math.max(0, i + step))].id);
      list.querySelector(`[data-car="${this.selected}"]`)?.focus();
    });
    this.el('garage-save').addEventListener('click', () => this.onSave?.(this.selected));
    this.el('garage-cancel').addEventListener('click', () => this.onClose?.());
  }

  open(carId) {
    this.selected = cleanCar(carId);
    this.saved = this.selected;
    this._render();
    this.el('garage-cars').querySelector(`[data-car="${this.selected}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }

  select(carId) {
    const next = cleanCar(carId);
    if (next === this.selected) return;
    this.selected = next;
    this._render();
    this.onChange?.(next);
  }

  _render() {
    for (const b of this.el('garage-cars').querySelectorAll('.car-card')) {
      const on = b.dataset.car === this.selected;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-mine', b.dataset.car === this.saved);
    }
    const save = this.el('garage-save');
    const same = this.selected === this.saved;
    save.querySelector('b').textContent = same ? 'BU ARABA SEÇİLİ' : 'BU ARABAYI SEÇ';
    save.classList.toggle('is-current', same);
  }
}
