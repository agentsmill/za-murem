/* Wspólne dla narzędzi z przeglądarką: serwer Vite w tym samym procesie i Chromium z Playwright. */

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
