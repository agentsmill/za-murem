import { defineConfig } from 'vite';

// Względna ścieżka bazowa: ten sam build działa lokalnie i pod agentsmill.github.io/za-murem/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
