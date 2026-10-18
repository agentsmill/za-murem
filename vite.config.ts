import { defineConfig } from 'vite';

// Względna ścieżka bazowa: ten sam build działa lokalnie i pod agentsmill.github.io/za-murem/.
// Gra z sąsiadami (?siec=1): przy npm run dev /api idzie do lokalnego serwera gry (node server/main.ts, server/README.md);
// bez niego gra po prostu nie widzi serwera.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  preview: { port: 4173, strictPort: true },
});
