/* Wspólne dla narzędzi z przeglądarką: serwer Vite w tym samym procesie i Chromium z Playwright. */

import fs from 'node:fs';
import path from 'node:path';
import { type Browser, chromium, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';

export interface Session {
  server: { close: () => Promise<void> };
  browser: Browser;
  base: string;
  close: () => Promise<void>;
}

/** dist: true serwuje zbudowaną wersję (vite preview), inaczej serwer deweloperski */
export async function openSession(opts: { headless?: boolean; dist?: boolean } = {}): Promise<Session> {
  let server: Session['server'];
  let port: number;
  if (opts.dist) {
    const pv = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
    const addr = pv.httpServer.address();
    port = typeof addr === 'object' && addr ? addr.port : 4173;
    server = { close: () => pv.close() };
  } else {
    const dev = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
    await dev.listen();
    const addr = dev.httpServer!.address();
    port = typeof addr === 'object' && addr ? addr.port : 5173;
    server = dev;
  }
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    // Metal tylko na Macu; gdzie indziej Chromium sam wybiera GPU albo SwiftShader
    args: [
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
    ],
  });
  return {
    server,
    browser,
    base: `http://127.0.0.1:${port}/`,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

/** czeka, aż gra wczyta osiedle i dorysuje widoczne kawałki */
export async function waitIdle(page: Page, timeout = 60_000): Promise<void> {
  const twoFrames = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(() => window.zm?.ready && window.zm.sim, null, { timeout });
  // najpierw klatka z obecną kamerą: idle() bez niej mówi jeszcze o widoku sprzed setCam
  await twoFrames();
  await page.waitForFunction(() => window.zm?.idle(), null, { timeout, polling: 100 });
  // dwie klatki zapasu
  await twoFrames();
}

export async function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'brak WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
}

/** katalog kafelków testowych i TileJSON */
const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/mvt');

/** kafelki dla okna mapy miasta: szablon i z=14 z tests/fixtures; inne z=14 puste albo (zerwane) bez sieci; z=12 puste */
export async function kafelkiMapy(page: Page, zerwane = false): Promise<void> {
  await page.route('https://tiles.openfreemap.org/planet', (r) =>
    r.fulfill({ contentType: 'application/json', body: fs.readFileSync(path.join(FIX, 'tj.json'), 'utf8') }),
  );
  await page.route(/tiles\.openfreemap\.org\/planet\/.+\/(\d+)\/(\d+)\/(\d+)\.pbf/, (r) => {
    const m = r
      .request()
      .url()
      .match(/\/(\d+)\/(\d+)\/(\d+)\.pbf/)!;
    const f = path.join(FIX, `t_${m[2]}_${m[3]}.pbf`);
    if (m[1] === '14' && fs.existsSync(f))
      return r.fulfill({ contentType: 'application/x-protobuf', body: fs.readFileSync(f) });
    if (m[1] === '14' && zerwane) return r.abort('internetdisconnected');
    return r.fulfill({ status: 204, body: '' });
  });
}
