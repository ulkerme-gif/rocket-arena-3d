import {
  ART_H, ART_PALETTE, ART_W, DEFAULT_SKIN, PATTERN_LABELS, SKIN_COLORS, SKIN_PATTERNS, TEAM_BODY,
  artCell, cleanSkin, paintCell,
} from '../visuals/skins.js';

const COLOR_NAMES = ['Mavi', 'Turuncu', 'Beyaz', 'Siyah', 'Kırmızı', 'Sarı', 'Yeşil', 'Turkuaz', 'Mor', 'Pembe', 'Kahverengi', 'Gri'];
const ART_NAMES = [null, 'Beyaz', 'Siyah', 'Kırmızı', 'Turuncu', 'Sarı', 'Açık yeşil', 'Yeşil', 'Turkuaz', 'Mavi', 'Lacivert', 'Mor', 'Pembe', 'Kahverengi', 'Gri', 'Altın'];
const ACCENTS = ['#ffffff', ...SKIN_COLORS.filter((c) => c !== '#e8eef5')];
const ACCENT_NAMES = ['Beyaz', ...COLOR_NAMES.filter((_, i) => SKIN_COLORS[i] !== '#e8eef5')];

/**
 * GARAJ screen: edits a skin and reports every change for the live 3D preview.
 * DOM ids live in index.html (#garage ...). Painting works with a finger or a mouse.
 */
export class Garage {
  constructor(doc, { onChange, onSave, onClose } = {}) {
    this.doc = doc;
    this.el = (id) => doc.getElementById(id);
    this.onChange = onChange;
    this.onSave = onSave;
    this.onClose = onClose;
    this.skin = { ...DEFAULT_SKIN };
    this.tool = 1; // drawing colour index, 0 = eraser
    this.painting = null;

    this._swatches('garage-base', [['team', 'TAKIM RENGİ', 'Takım rengi']].concat(SKIN_COLORS.map((c, i) => [c, '', COLOR_NAMES[i]])),
      (value) => this.set({ base: value }));
    this._swatches('garage-accent', ACCENTS.map((c, i) => [c, '', ACCENT_NAMES[i]]), (value) => this.set({ accent: value }));
    const patterns = this.el('garage-pattern');
    for (const p of SKIN_PATTERNS) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.value = p;
      b.textContent = PATTERN_LABELS[p];
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => this.set({ pattern: p }));
      patterns.append(b);
    }
    this._swatches('garage-art-palette', ART_PALETTE.slice(1).map((c, i) => [String(i + 1), '', ART_NAMES[i + 1], c]),
      (value) => { this.tool = Number(value); this._renderTools(); });
    this.el('garage-art-erase').addEventListener('click', () => { this.tool = 0; this._renderTools(); });
    this.el('garage-art-clear').addEventListener('click', () => this.set({ art: '' }));
    this.el('garage-number').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
      this.set({ number: e.target.value }, { keepInput: true });
    });
    this.el('garage-save').addEventListener('click', () => this.onSave?.(cleanSkin(this.skin)));
    this.el('garage-cancel').addEventListener('click', () => this.onClose?.());
    this.el('garage-reset').addEventListener('click', () => this.set({ ...DEFAULT_SKIN }));

    const canvas = this.el('garage-art');
    canvas.addEventListener('pointerdown', (e) => this._paintStart(e));
    canvas.addEventListener('pointermove', (e) => this._paintMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { this.painting = null; });
  }

  _swatches(id, items, onPick) {
    const box = this.el(id);
    for (const [value, label, name, color] of items) {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = label ? 'swatch swatch-wide' : 'swatch';
      b.dataset.value = value;
      b.style.setProperty('--swatch', value === 'team' ? `linear-gradient(90deg, ${TEAM_BODY.blue} 50%, ${TEAM_BODY.orange} 50%)` : color ?? value);
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', 'false');
      if (label) b.textContent = label;
      b.addEventListener('click', () => onPick(value));
      box.append(b);
    }
  }

  open(skin) {
    this.skin = cleanSkin(skin);
    this.tool = this.tool || 1;
    this.el('garage-number').value = this.skin.number;
    this._render();
  }

  set(patch, { keepInput = false } = {}) {
    this.skin = cleanSkin({ ...this.skin, ...patch });
    if (!keepInput) this.el('garage-number').value = this.skin.number;
    this._render();
    this.onChange?.(this.skin);
  }

  _pressed(id, value) {
    for (const b of this.el(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }

  _render() {
    this._pressed('garage-base', this.skin.base);
    this._pressed('garage-accent', this.skin.accent);
    this._pressed('garage-pattern', this.skin.pattern);
    this._renderTools();
    this._drawArt();
  }

  _renderTools() {
    this._pressed('garage-art-palette', String(this.tool));
    this.el('garage-art-erase').setAttribute('aria-pressed', String(this.tool === 0));
  }

  _cellAt(e) {
    const canvas = this.el('garage-art');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * ART_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * ART_H);
    return x >= 0 && y >= 0 && x < ART_W && y < ART_H ? [x, y] : null;
  }

  _paintStart(e) {
    e.preventDefault();
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const cell = this._cellAt(e);
    // Tapping a cell that already has the chosen colour erases it (quick undo).
    const tool = cell && this.tool && artCell(this.skin.art, cell[0], cell[1]) === this.tool ? 0 : this.tool;
    this.painting = { pointerId: e.pointerId, tool };
    this._paintMove(e);
  }

  _paintMove(e) {
    if (!this.painting || e.pointerId !== this.painting.pointerId) return;
    const cell = this._cellAt(e);
    if (!cell) return;
    // Fill every cell between the previous and the current touch point: fast swipes leave no gaps.
    const [x1, y1] = cell;
    let [x0, y0] = this.painting.last ?? cell;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let art = this.skin.art;
    for (;;) {
      art = paintCell(art, x0, y0, this.painting.tool);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    this.painting.last = cell;
    if (art !== this.skin.art) this.set({ art });
  }

  _drawArt() {
    const canvas = this.el('garage-art');
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    const cw = canvas.width / ART_W, ch = canvas.height / ART_H;
    ctx.fillStyle = this.skin.base === 'team' ? TEAM_BODY.blue : this.skin.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < ART_H; y++) {
      for (let x = 0; x < ART_W; x++) {
        const color = ART_PALETTE[artCell(this.skin.art, x, y)];
        if (color) { ctx.fillStyle = color; ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch)); }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < ART_W; x++) { ctx.moveTo(Math.round(x * cw) + 0.5, 0); ctx.lineTo(Math.round(x * cw) + 0.5, canvas.height); }
    for (let y = 1; y < ART_H; y++) { ctx.moveTo(0, Math.round(y * ch) + 0.5); ctx.lineTo(canvas.width, Math.round(y * ch) + 0.5); }
    ctx.stroke();
  }
}
