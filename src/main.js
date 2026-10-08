import './styles/main.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { App } from './App.js';

async function main() {
  const loading = document.getElementById('loading-screen');
  try {
    await RAPIER.init();
    const app = new App(RAPIER);
    app.start();
    loading.classList.add('hidden');
    // Convenience for local debugging; never a network interface.
    if (import.meta.env.DEV) window.rocketArena = app;
  } catch (err) {
    console.error('[Rocket Arena] Initialization failed', err);
    document.getElementById('loading-text').textContent = 'Oyun başlatılamadı: ' + (err?.message ?? String(err));
    loading.classList.add('loading-error');
  }
}
main();
