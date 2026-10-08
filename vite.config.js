import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// GitHub Actions supplies "owner/repo"; Pages project sites live under /repo/.
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const ghPages = process.env.GITHUB_ACTIONS === 'true';
const base = ghPages && repo && repo !== `${owner}.github.io` ? `/${repo}/` : '/';

export default defineConfig({
  base,
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    rollupOptions: { input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      online: fileURLToPath(new URL('./online.html', import.meta.url)),
    } },
  },
});
