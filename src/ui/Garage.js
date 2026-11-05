import { CARS, cleanCar } from '../visuals/cars.js';

/**
 * GARAJ screen: pick a car. Every choice shows up straight away on the turntable
 * (onChange); "BU ARABAYI SEÇ" stores it (onSave). DOM ids live in index.html (#garage).
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
    for (const car of CARS) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'car-card';
      b.dataset.car = car.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      const maker = doc.createElement('span');
      maker.className = 'car-maker';
      maker.textContent = car.maker;
      const name = doc.createElement('span');
      name.className = 'car-name';
      name.textContent = car.name;
      const mine = doc.createElement('span');
      mine.className = 'car-mine';
      mine.textContent = 'Şu an bunu kullanıyorsun';
      b.append(maker, name, mine);
      b.addEventListener('click', () => this.select(car.id));
      list.append(b);
    }
    // Arrow keys move between cars, like any radio group.
    list.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const i = CARS.findIndex((c) => c.id === this.selected);
      this.select(CARS[(i + step + CARS.length) % CARS.length].id);
      list.querySelector(`[data-car="${this.selected}"]`)?.focus();
    });
    this.el('garage-save').addEventListener('click', () => this.onSave?.(this.selected));
    this.el('garage-cancel').addEventListener('click', () => this.onClose?.());
  }

  open(carId) {
    this.selected = cleanCar(carId);
    this.saved = this.selected;
    this._render();
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
