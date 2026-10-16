/* Wspólne dla narzędzi z przeglądarką: serwer Vite w tym samym procesie i Chromium z Playwright. */

import { type Browser, chromium, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

export interface Session {
  server: ViteDevServer;
  browser: Browser;
  base: string;
  close: () => Promise<void>;
}

export async function openSession(opts: { headless?: boolean } = {}): Promise<Session> {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--use-angle=metal'],
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
  await page.waitForFunction(() => window.zm?.ready && window.zm.sim, null, { timeout });
  await page.waitForFunction(() => window.zm?.idle(), null, { timeout, polling: 100 });
  // dwie klatki zapasu
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function webglRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'brak WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
}
