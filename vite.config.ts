import { defineConfig } from 'vite';

// Względna ścieżka bazowa: ten sam build działa lokalnie i pod agentsmill.github.io/za-murem/.
// Gra z sąsiadami (?siec=1): przy npm run dev /api idzie do lokalnego serwera gry (node server/main.ts, server/README.md);
// bez niego gra po prostu nie widzi serwera.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // Gra to jedna paczka: PixiJS 8, symulacja, zarząd z tekstami w obu językach, grafika zastępcza. index-*.js ma 1729,6 kB
    // (616,5 kB po gzip), pomiar z 24.10.2026. Wydzielenie dwunastu łańcuchów historii (src/gov/watki-tresc.ts, 129 kB źródła)
    // do import() zdjęłoby z niej tylko 74 kB (1655,3 kB bez nich), czyli nadal ponad dawny próg 1200 kB, więc ładowania nie
    // dzielimy dla samego ostrzeżenia. Próg leży tuż nad pomiarem: ostrzeżenie wróci, gdy paczka urośnie o kilka procent.
    chunkSizeWarningLimit: 1800,
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  preview: { port: 4173, strictPort: true },
});
