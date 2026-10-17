/* Zrzuty ekranu w prawdziwym Chromium: mapy testowe, kamera i pora dnia ustawiane w adresie.
   Uruchomienie: npm run shots [-- filtr] [--dist]   (filtr: fragment nazwy; --dist: zbudowana wersja)
   Wynik: shots/<nazwa>.png. Każdy zrzut obejrzyj, zanim zgłosisz zmianę. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ADDRESSES } from '../tests/unit/fixtures.ts';
import { openSession, waitIdle, webglRenderer } from './browser.ts';
import { decodePng } from './png.ts';

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
  // przy zoomie od 0,6 nad siedzibą widać przekrój (wnętrze ze świata) zamiast dachu
  ...DEMOS.flatMap((d) => [
    { name: `${d}-calosc`, query: `demo=${d}&speed=0&cam=all` },
    { name: `${d}-siedziba`, query: `demo=${d}&speed=0&cam=hq,1` },
    { name: `${d}-blisko`, query: `demo=${d}&speed=0&cam=hq,2` },
    { name: `${d}-przekroj`, query: `demo=${d}&speed=0&cam=hq,0.75` },
    { name: `${d}-przekroj-noc`, query: `demo=${d}&speed=0&cam=hq,1.3&godzina=22&swiatla=test` },
  ]),
  { name: 'przymorze-noc', query: 'demo=przymorze&speed=0&cam=hq,1&hour=22' },
  // noc z trzema światłami przy siedzibie (ognisko, okno z kozą, latarka warty) i zmierzch
  { name: 'noc-swiatla', query: 'demo=przymorze&speed=0&cam=hq,1&godzina=22&swiatla=test' },
  { name: 'noc-swiatla-daleko', query: 'demo=przymorze&speed=0&cam=hq,0.35&godzina=22&swiatla=test' },
  { name: 'noc-swiatla-telefon', query: 'demo=przymorze&speed=0&cam=hq,1&godzina=22&swiatla=test', w: 390, h: 844 },
  { name: 'zmierzch', query: 'demo=przymorze&speed=0&cam=hq,1&godzina=18.5&swiatla=test' },
  // przekrój siedziby z atrapą wnętrza: z bliska wnętrze zamiast dachu, w nocy z kozą, przy 0,5 dach
  { name: 'przekroj-dach', query: 'demo=przymorze&speed=0&cam=hq,0.5' },
  // atrapa siatki z bramą i dziurami, dopóki świat jej nie daje
  { name: 'siatka', query: 'demo=przymorze&speed=0&cam=hq,0.75&siatka=atrapa' },
  { name: 'siatka-blisko', query: 'demo=zielonki&speed=0&cam=hq,1.2&siatka=atrapa' },
  { name: 'przekroj-wylaczony', query: 'demo=przymorze&speed=0&cam=hq,1&przekroj=0' },
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
    // ten sam widok z kawałkami z workerów i z głównego wątku (zapas bez OffscreenCanvas)
    // musi być identyczny co do piksela; licznik klatek ukryty, bo zależy od chwili zrzutu
    // (nie zasłona Playwrighta: ta ma szerokość tekstu, więc „4 kl/s” i „52 kl/s” dają różne prostokąty)
    name: 'worker-zgodnosc',
    query: '',
    run: async (page, base) => {
      const snap = async (q: string) => {
        await page.goto(`${base}?demo=przymorze&speed=0&${q}`);
        await waitIdle(page);
        const painting = await page.evaluate(() => window.zm!.view.painting);
        await page.addStyleTag({ content: '#fps { visibility: hidden !important; }' });
        return { painting, img: decodePng(await page.screenshot()) };
      };
      for (const cam of ['hq,1', 'hq,0.6', 'all', 'hq,1.5', 'hq,1&przekroj=0']) {
        const a = await snap(`cam=${cam}`);
        const b = await snap(`cam=${cam}&worker=0`);
        if (!a.painting.startsWith('worker')) throw new Error(`kawałki rysuje ${a.painting} zamiast workerów`);
        let diff = 0;
        for (let i = 0; i < a.img.rgba.length; i += 4)
          if (
            a.img.rgba[i] !== b.img.rgba[i] ||
            a.img.rgba[i + 1] !== b.img.rgba[i + 1] ||
            a.img.rgba[i + 2] !== b.img.rgba[i + 2]
          )
            diff++;
        console.log(`  cam=${cam}: ${a.painting} i ${b.painting}, różnych pikseli: ${diff}`);
        if (diff) throw new Error(`cam=${cam}: obraz z workerów i z głównego wątku różni się w ${diff} pikselach`);
      }
    },
  },
  {
    // zmiana na mapie przerysowuje tylko swoje kawałki: 2×2 m trawy przy środku ekranu staje się
    // ścieżką i znika drzewo najbliżej środka; poza dotkniętymi kawałkami obraz zostaje co do
    // piksela, z workerami i bez nich
    name: 'przerysowanie',
    query: '',
    run: async (page, base) => {
      for (const q of ['', '&worker=0']) {
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.6${q}`);
        await waitIdle(page);
        await page.addStyleTag({ content: '#fps { visibility: hidden !important; }' });
        const before = decodePng(await page.screenshot());
        const r = await page.evaluate(() => {
          const v = window.zm!.view;
          const sc = v.scene!;
          const size = sc.w.size;
          const span = 32 * 32;
          const cx = v.cam.x / 32;
          const cy = v.cam.y / 32;
          let tree = -1;
          let bd = Number.POSITIVE_INFINITY;
          sc.w.trees.forEach((t, k) => {
            const d = Math.hypot(t.x - cx, t.y - cy);
            if (d < bd && !sc.treeGone[k]) {
              bd = d;
              tree = k;
            }
          });
          // trawa (kod 0) w kawałku pod środkiem ekranu, z dala od jego brzegów
          const x0 = Math.floor(cx / 32) * 32;
          const y0 = Math.floor(cy / 32) * 32;
          let tile = -1;
          for (let y = y0 + 4; y < y0 + 27 && tile < 0; y++)
            for (let x = x0 + 4; x < x0 + 27 && tile < 0; x++) {
              const i = y * size + x;
              if (sc.w.terr[i] === 0 && sc.w.terr[i + 1] === 0 && sc.w.terr[i + size] === 0) tile = i;
            }
          const tiles = [tile, tile + 1, tile + size, tile + size + 1];
          for (const i of tiles) sc.w.terr[i] = 5; // ścieżka
          const made = v.chunksMade;
          const touched = v.redraw({ tiles, felled: [tree] });
          const n = sc.chunks;
          const z = v.cam.zoom;
          const rects = touched.map((k) => [
            ((k % n) * span - v.cam.x) * z + v.width / 2,
            (Math.floor(k / n) * span - v.cam.y) * z + v.height / 2,
            span * z,
          ]);
          return { rects, made, painting: v.painting };
        });
        await waitIdle(page);
        const redrawn = await page.evaluate(() => window.zm!.view.chunksMade);
        const after = decodePng(await page.screenshot());
        let inside = 0;
        let outside = 0;
        const w = after.width;
        for (let i = 0; i < after.rgba.length; i += 4) {
          if (
            after.rgba[i] === before.rgba[i] &&
            after.rgba[i + 1] === before.rgba[i + 1] &&
            after.rgba[i + 2] === before.rgba[i + 2]
          )
            continue;
          const x = (i / 4) % w;
          const y = Math.floor(i / 4 / w);
          // margines 1 px: brzeg kawałka wypada w ułamku piksela
          const hit = r.rects.some(([rx, ry, sz]) => x >= rx - 1 && x < rx + sz + 1 && y >= ry - 1 && y < ry + sz + 1);
          if (hit) inside++;
          else outside++;
        }
        console.log(
          `  ${r.painting}: przerysowanych kawałków ${r.rects.length} (nowych tekstur ${redrawn - r.made}), zmienionych pikseli w nich ${inside}, poza nimi ${outside}`,
        );
        if (!inside) throw new Error(`${r.painting}: zmiany nie widać na obrazie`);
        if (outside) throw new Error(`${r.painting}: ${outside} pikseli zmienionych poza przerysowanymi kawałkami`);
      }
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
  // stan gry (syncGame): noc z prawdziwą kozą ze stanu symulacji, okna, obcy, siatka ze stanem
  {
    name: 'noc-gra',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=22`);
      await nightWithFire(page);
    },
  },
  {
    name: 'noc-gra-dach',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.45&godzina=22`);
      await nightWithFire(page);
    },
  },
  {
    // szabrownik w świetle okna widać, drugiego w ciemności nie; w dzień obu
    name: 'obcy-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=22`);
      await nightWithFire(page);
      const seen = await strangers(page);
      console.log(`  w świetle: ${fmt(seen.lit)}, w ciemności: ${fmt(seen.dark)}`);
      if (!seen.lit.visible || seen.lit.alpha < 0.9) throw new Error('szabrownika w świetle okna nie widać');
      if (seen.dark.visible) throw new Error('szabrownika w ciemności widać');
    },
  },
  {
    name: 'obcy-dzien',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const seen = await strangers(page);
      console.log(`  w dzień: ${fmt(seen.lit)}, ${fmt(seen.dark)}`);
      if (!seen.lit.visible || !seen.dark.visible) throw new Error('obcych w dzień nie widać');
    },
  },
  {
    // symulacja łata dziurę, wybija nową i zamyka bramę (blocked = 1 i 0): siatka rysuje ten stan
    name: 'siatka-stan',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const f = sim.w.fence;
        const whole = f.tiles.find((i) => !f.hole.includes(i) && f.tiles.includes(i - 1) && f.tiles.includes(i + 1))!;
        sim.blocked[f.hole[0]] = 1;
        sim.blocked[whole] = 0;
        for (let dy = 0; dy < f.gate.h; dy++)
          for (let dx = 0; dx < f.gate.w; dx++) sim.blocked[(f.gate.y + dy) * sim.w.size + f.gate.x + dx] = 1;
        zm.setCam((f.gate.x + 1) % sim.w.size, f.gate.y, 1.2);
        return { hole: f.hole[0], whole };
      });
      await waitIdle(page);
      const keys = await page.evaluate(() => [
        ...(window.zm!.view as unknown as { things: Map<string, unknown> }).things.keys(),
      ]);
      const lata = keys.filter((k) => k.includes('"lata"')).length;
      const closed = keys.some((k) => k.includes('"brama"') && k.includes('"open":false'));
      console.log(`  łat: ${lata}, brama zamknięta: ${closed}, kafelki ${r.hole} i ${r.whole}`);
      if (lata !== 1 || !closed) throw new Error('siatka nie pokazuje stanu z symulacji');
    },
  },
];

const fmt = (v: { visible: boolean; alpha: number }) => `${v.visible ? 'widać' : 'nie widać'} (${v.alpha})`;

/** rozpala kozę zarządu w stanie gry i puszcza symulację do najbliższego przeliczenia ciepła i światła */
async function nightWithFire(page: Page) {
  await waitIdle(page);
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    sim.st.things.find((t) => t.kind === 'koza')!.fuel = 1200;
    for (let k = 0; k < 20 && !sim.light.some((v) => v > 0); k++) sim.step();
  });
  await waitIdle(page);
  const info = await page.evaluate(() => {
    const zm = window.zm!;
    const lights = (zm.view as unknown as { gameLights: { inside?: boolean }[] }).gameLights;
    return {
      lit: zm.sim!.light.filter((v) => v > 0).length,
      inside: lights.filter((l) => l.inside).length,
      all: lights.length,
    };
  });
  console.log(`  oświetlonych pomieszczeń: ${info.lit}, światła gry: ${info.all} (koza: ${info.inside})`);
  if (info.inside !== 1 || info.all < 2) throw new Error('brak światła kozy albo okien ze stanu gry');
}

/** dwóch szabrowników: przy oknie oświetlonego pomieszczenia i 10 m dalej w ciemności; ich sprite'y po dwóch klatkach */
async function strangers(page: Page) {
  await page.evaluate(() => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const g = (zm.view as unknown as { game: { windows: { room: number; x: number; y: number }[] } }).game;
    const w = g.windows.find((s) => (sim.light[s.room] ?? 0) >= 1) ?? g.windows[0];
    const base = sim.st.pawns.find((p) => p.kind === 'crowd') ?? sim.st.pawns[0];
    const add = (id: number, x: number, y: number) =>
      sim.st.pawns.push({ ...base, id, kind: 'szabrownik' as 'crowd', x, y, path: [], pi: 0, want: -1 });
    add(900001, w.x, w.y + 0.3);
    add(900002, zm.view.cam.x / 32 - 10, zm.view.cam.y / 32 - 6);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => {
    const sprites = (window.zm!.view as unknown as { pawnSprites: Map<number, { visible: boolean; alpha: number }> })
      .pawnSprites;
    const at = (id: number) => {
      const s = sprites.get(id)!;
      return { visible: s.visible, alpha: Math.round(s.alpha * 100) / 100 };
    };
    return { lit: at(900001), dark: at(900002) };
  });
}

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
