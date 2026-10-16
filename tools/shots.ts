/* Zrzuty ekranu w prawdziwym Chromium: mapy testowe, kamera i pora dnia ustawiane w adresie.
   Uruchomienie: npm run shots [-- filtr] [--dist]   (filtr: fragment nazwy; --dist: zbudowana wersja)
   Wynik: shots/<nazwa>.png. Każdy zrzut obejrzyj, zanim zgłosisz zmianę. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ADDRESSES } from '../tests/unit/fixtures.ts';
import { openSession, waitIdle, webglRenderer } from './browser.ts';

const OUT = path.resolve(import.meta.dirname, '../shots');
fs.mkdirSync(OUT, { recursive: true });

interface Shot {
  name: string;
  query: string;
  w?: number;
  h?: number;
  /** zamiast samego adresu strony: własny scenariusz */
  run?: (page: Page, base: string) => Promise<void>;
}

const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/mvt');

/** sieć podmieniona na dane testowe: Nominatim zwraca Lanciego, kafelki z tests/fixtures */
async function offlineNetwork(page: Page) {
  const a = ADDRESSES.find((x) => x.key === 'lanciego')!;
  await page.route('https://nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          lat: String(a.lat),
          lon: String(a.lon),
          display_name: 'Lanciego 10G, Ursynów Północny, Ursynów, Warszawa',
          address: { road: 'Lanciego', neighbourhood: 'Ursynów Północny', city: 'Warszawa' },
        },
      ]),
    }),
  );
  await page.route('https://tiles.openfreemap.org/planet', (r) =>
    r.fulfill({ contentType: 'application/json', body: fs.readFileSync(path.join(FIX, 'tj.json'), 'utf8') }),
  );
  await page.route(/tiles\.openfreemap\.org\/planet\/.+\/14\/(\d+)\/(\d+)\.pbf/, (r) => {
    const m = r
      .request()
      .url()
      .match(/14\/(\d+)\/(\d+)\.pbf/)!;
    const f = path.join(FIX, `t_${m[1]}_${m[2]}.pbf`);
    return fs.existsSync(f)
      ? r.fulfill({ contentType: 'application/x-protobuf', body: fs.readFileSync(f) })
      : r.fulfill({ status: 204, body: '' });
  });
}

const DEMOS = ['przymorze', 'lanciego', 'zielonki'];
const SHOTS: Shot[] = [
  ...DEMOS.flatMap((d) => [
    { name: `${d}-calosc`, query: `demo=${d}&speed=0&cam=all` },
    { name: `${d}-siedziba`, query: `demo=${d}&speed=0&cam=hq,1` },
    { name: `${d}-blisko`, query: `demo=${d}&speed=0&cam=hq,2` },
  ]),
  { name: 'przymorze-noc', query: 'demo=przymorze&speed=0&cam=hq,1&hour=22' },
  { name: 'przymorze-telefon', query: 'demo=przymorze&speed=0&cam=hq,1', w: 390, h: 844 },
  {
    name: 'start',
    query: '',
    run: async (page, base) => {
      await page.goto(base);
      await page.waitForSelector('#demos button');
    },
  },
  {
    name: 'adres-offline',
    query: '',
    run: async (page, base) => {
      await offlineNetwork(page);
      await page.goto(`${base}?speed=0`);
      await page.fill('#addr', 'Lanciego 10G, Warszawa');
      await page.click('#startForm button[type=submit]');
      await waitIdle(page);
      await page.evaluate(() => window.zm!.setCam(192, 192, 0.5));
      await waitIdle(page);
    },
  },
  {
    name: 'ruch',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1`);
      await waitIdle(page);
      // pozycja pierwszej osoby z rdzenia na ekranie
      const pos = () =>
        page.evaluate(() => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
          const v = zm.view;
          return {
            x: (p.x * 32 - v.cam.x) * v.cam.zoom + v.width / 2,
            y: (p.y * 32 - 18 - v.cam.y) * v.cam.zoom + v.height / 2,
            id: p.id,
            tile: Math.floor(p.y) * zm.sim!.w.size + Math.floor(p.x),
          };
        });
      const a = await pos();
      await page.mouse.click(a.x, a.y);
      // cel: 12 m w lewo i 6 m w dół
      await page.mouse.click(a.x - 12 * 32, a.y + 6 * 32, { button: 'right' });
      await page.click('#speed button[data-s="1"]');
      await page.waitForTimeout(1500);
      const b = await pos();
      if (b.tile === a.tile) throw new Error('pionek się nie ruszył po poleceniu');
      console.log(`  ruch: kafelek ${a.tile} → ${b.tile}`);
    },
  },
  {
    // telefon: stuknięcie w osobę zaznacza, stuknięcie w teren wysyła
    name: 'dotyk',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1`);
      await waitIdle(page);
      const pos = () =>
        page.evaluate(() => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
          const v = zm.view;
          return {
            x: (p.x * 32 - v.cam.x) * v.cam.zoom + v.width / 2,
            y: (p.y * 32 - 18 - v.cam.y) * v.cam.zoom + v.height / 2,
            tile: Math.floor(p.y) * zm.sim!.w.size + Math.floor(p.x),
          };
        });
      const a = await pos();
      await page.touchscreen.tap(a.x, a.y);
      await page.touchscreen.tap(a.x - 5 * 32, a.y + 4 * 32);
      await page.evaluate(() => (document.querySelector('#speed button[data-s="1"]') as HTMLButtonElement).click());
      await page.waitForTimeout(1500);
      const b = await pos();
      if (b.tile === a.tile) throw new Error('dotyk: pionek się nie ruszył');
      console.log(`  dotyk: kafelek ${a.tile} → ${b.tile}`);
    },
  },
  {
    // jazda kamerą po całej mapie (ponad limit bliskich kawałków), potem oddalenie:
    // każdy widoczny kawałek musi mieć skalę zgodną ze swoją teksturą
    name: 'pamiec-kawalkow',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.6`);
      await waitIdle(page);
      for (let y = 40; y < 384; y += 48)
        for (let x = 40; x < 384; x += 64) {
          await page.evaluate(([cx, cy]) => window.zm!.setCam(cx, cy, 0.6), [x, y]);
          await waitIdle(page);
        }
      await page.evaluate(() => window.zm!.setCam(192, 192, 0.3));
      await waitIdle(page);
      const bad = await page.evaluate(() => {
        type Slot = {
          sprite: { visible: boolean; texture: unknown; scale: { x: number } };
          near: unknown;
          far: unknown;
        };
        const v = window.zm!.view as unknown as { slots: Slot[]; chunksNear: number };
        let wrong = 0;
        for (const s of v.slots) {
          if (!s.sprite.visible) continue;
          const want = s.sprite.texture === s.far ? 4 : 1;
          if (s.sprite.scale.x !== want) wrong++;
        }
        return { wrong, near: v.chunksNear };
      });
      console.log(`  kawałki ze złą skalą: ${bad.wrong}, bliskich w pamięci: ${bad.near}`);
      if (bad.wrong) throw new Error(`${bad.wrong} kawałków ze złą skalą po wyrzuceniu bliskich`);
    },
  },
  {
    name: 'v03',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}v03/index.html`);
      await page.click('#btnSample');
      await page.click('button[data-sh=close]');
      await page.waitForTimeout(1500);
    },
  },
];

const dist = process.argv.includes('--dist');
const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const s = await openSession({ dist });
try {
  for (const shot of SHOTS) {
    if (filter && !shot.name.includes(filter)) continue;
    const mobile = (shot.w ?? 1440) < 640;
    const page = await s.browser.newPage({
      viewport: { width: shot.w ?? 1440, height: shot.h ?? 900 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const t0 = Date.now();
    if (shot.run) await shot.run(page, s.base);
    else {
      await page.goto(`${s.base}?${shot.query}`);
      await waitIdle(page);
    }
    const file = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${shot.name}: ${Date.now() - t0} ms${errors.length ? `, BŁĘDY: ${errors.join(' | ')}` : ''}`);
    // błąd na stronie to nieudany zrzut, także dla CI
    if (errors.length) process.exitCode = 1;
    if (shot === SHOTS[0]) console.log(`  WebGL: ${await webglRenderer(page)}`);
    await page.close();
  }
} finally {
  await s.close();
}
