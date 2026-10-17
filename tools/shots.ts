/* Zrzuty ekranu w prawdziwym Chromium: mapy testowe, kamera i pora dnia ustawiane w adresie.
   Uruchomienie: npm run shots [-- filtr] [--dist]   (filtr: fragment nazwy; --dist: zbudowana wersja)
   Wynik: shots/<nazwa>.png. Każdy zrzut obejrzyj, zanim zgłosisz zmianę. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { frameRect, LIE, POSES } from '../src/render/art/people.ts';
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
  // sterty materiału ze świata, potem przejęte przez symulację; garnek na stole; wraki z atrapy
  {
    name: 'sterty',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const heaps = zm.sim!.w.props.filter((p) => p.kind === 'gruz' || p.kind === 'deski' || p.kind === 'zlom');
        const cx = heaps.reduce((a, p) => a + p.x, 0) / heaps.length;
        const cy = heaps.reduce((a, p) => a + p.y, 0) / heaps.length;
        zm.setCam(cx + 0.5, cy + 0.5, 1.6);
      });
      await waitIdle(page);
      const n = await heapSprites(page);
      console.log(`  sterty ze świata: ${n.props}, narysowane: ${n.drawn} (${n.kinds})`);
      if (n.props < 3 || n.drawn !== n.props) throw new Error('nie widać stert ze świata');
    },
  },
  {
    // symulacja trzyma sterty u siebie od startu (jedną zabieramy, jak przy łataniu): rysują się tylko te ze stanu gry
    name: 'sterty-z-gry',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const left = await page.evaluate(() => {
        const zm = window.zm!;
        const things = zm.sim!.st.things;
        const heaps = things.filter((t) => t.kind === 'gruz' || t.kind === 'deski' || t.kind === 'zlom');
        things.splice(things.indexOf(heaps[0]), 1);
        zm.setCam(heaps[0].x + 0.5, heaps[0].y + 0.5, 1.6);
        return heaps.length - 1;
      });
      await waitIdle(page);
      const n = await heapSprites(page);
      console.log(`  sterty ze świata: ${n.props}, w stanie gry: ${left}, narysowane: ${n.drawn}`);
      if (n.drawn !== left) throw new Error('sterty ze świata nie ustąpiły tym ze stanu gry');
    },
  },
  {
    name: 'garnek',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        // stół najbliżej kozy zarządu, jak w symulacji (garnek na stole w mieszkaniu zarządu)
        const koza = sim.st.things.find((t) => t.kind === 'koza')!;
        const tables = sim.st.things.filter((t) => t.kind === 'stol');
        const d = (t: { x: number; y: number }) => (t.x - koza.x) ** 2 + (t.y - koza.y) ** 2;
        const table = tables.sort((a, b) => d(a) - d(b))[0];
        sim.st.things.push({
          id: 991000,
          kind: 'posilek',
          x: table.x,
          y: table.y,
          w: 1,
          h: 1,
          rot: 0,
          n: 4,
          fuel: 0,
          by: -1,
          owner: -1,
        });
        zm.setCam(table.x + table.w / 2, table.y + table.h / 2, 2.4);
      });
      await waitIdle(page);
      const keys = await thingKeys(page);
      const pot = keys.find((k) => k.includes('"posilek"'));
      console.log(`  garnek: ${pot ?? 'brak'}`);
      if (!pot?.includes('"table":true') || !pot.includes('"size":2')) throw new Error('garnka nie ma na stole');
    },
  },
  {
    name: 'wraki',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1&wraki=atrapa`);
      await waitIdle(page);
      const w = await wrecks(page, 1.4);
      console.log(`  wraki: ${w.n} (${w.models}), kamera na ${w.at}`);
      if (w.n < 2 || !w.models.includes('maluch') || !w.models.includes('polonez')) throw new Error('nie widać wraków');
    },
  },
  {
    name: 'wraki-daleko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1&wraki=atrapa`);
      await waitIdle(page);
      const w = await wrecks(page, 0.7);
      if (w.n < 2) throw new Error('nie widać wraków');
    },
  },
  // M1: interfejs i zarząd (karta osoby, menu pod prawym, okna nocy, zapis, telefon); pomocnicze funkcje
  // w środku, żeby reszta pliku została bez zmian
  ...((): Shot[] => {
    const game = async (page: Page, base: string, q = '') => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3${q}`);
      await waitIdle(page);
    };
    /** punkt na ekranie: głowa k-tej osoby z zarządu */
    const corePos = (page: Page, k = 0) =>
      page.evaluate((k) => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[k];
        const [x, y] = zm.screenOf(p.x, p.y - 0.55);
        return { x, y };
      }, k);
    /** środek mebla do spalenia w kuchni zarządu (albo gdziekolwiek w jego mieszkaniu) */
    const furniturePos = (page: Page) =>
      page.evaluate(() => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        const w = zm.sim!.w;
        const h = w.interior;
        const size = w.size;
        const apt = (t: { x: number; y: number }) => h.rooms[h.room[t.y * size + t.x]]?.apt;
        const room = (t: { x: number; y: number }) => h.room[t.y * size + t.x];
        const koza = st.things.find((t) => t.kind === 'koza' && apt(t) === h.home)!;
        const burn = ['krzeslo', 'stol', 'mebloscianka', 'wersalka', 'lozko'];
        const t =
          st.things.find((q) => burn.includes(q.kind) && room(q) === room(koza)) ??
          st.things.find((q) => burn.includes(q.kind) && apt(q) === h.home)!;
        const [x, y] = zm.screenOf(t.x + t.w / 2, t.y + t.h / 2);
        return { x, y, kind: t.kind };
      });
    const select = async (page: Page, touch = false) => {
      const a = await corePos(page);
      if (touch) await page.touchscreen.tap(a.x, a.y);
      else await page.mouse.click(a.x, a.y);
      await page.waitForTimeout(300);
      if (!(await page.isVisible('#card'))) throw new Error('karta osoby nie pokazała się po zaznaczeniu');
    };
    /** kamera na suchym drzewie; zwraca jego pień na ekranie */
    const dryTree = async (page: Page) => {
      await page.evaluate(() => {
        const zm = window.zm!;
        const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
        zm.setCam(t.x, t.y - 1, 1.3);
      });
      await waitIdle(page);
      return page.evaluate(() => {
        const zm = window.zm!;
        const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
        const [x, y] = zm.screenOf(t.x, t.y);
        return { x, y };
      });
    };
    const kind = (page: Page) => page.evaluate(() => document.querySelector('#sheet')?.className ?? '');
    /** przewija noc do raportu, odpowiadając po drodze na wydarzenia pierwszą możliwą odpowiedzią */
    const toReport = async (page: Page) => {
      for (let k = 0; k < 30; k++) {
        const p = await page.evaluate(() => window.zm!.ff(30));
        if (p === 'raport') return;
        if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
        else if (p === 'uchwala') await page.click('#sheet [data-act="law-skip"]');
        else if (p === 'karta') await page.click('#sheet [data-act="night-go"]');
      }
      throw new Error('raport po nocy się nie pokazał');
    };
    /** okno mieści się na ekranie bez przewijania w bok */
    const fits = (page: Page) =>
      page.evaluate(() => {
        const s = document.querySelector('#sheet') as HTMLElement;
        const r = s.getBoundingClientRect();
        const body = s.querySelector('.sheet-body') as HTMLElement;
        const bad: string[] = [];
        if (r.left < 0 || r.right > innerWidth + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5)
          bad.push(`okno poza ekranem: ${JSON.stringify(r)}`);
        if (body && body.scrollWidth > body.clientWidth + 1)
          bad.push(`treść szersza niż okno: ${body.scrollWidth} > ${body.clientWidth}`);
        for (const el of s.querySelectorAll<HTMLElement>('select, .btn'))
          if (el.getBoundingClientRect().right > r.right + 0.5) bad.push(`wystaje: ${el.textContent?.slice(0, 30)}`);
        return bad;
      });
    /** przytrzymanie palca (pół sekundy z hakiem) przez CDP: zdarzenia dotyku jak z telefonu */
    const hold = async (page: Page, x: number, y: number) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
    return [
      {
        // pierwszy widok: cele dnia, pasek ze stanem osiedla, znacznik nad suchym drzewem
        name: 'm1-cele',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
          await waitIdle(page);
          await page.waitForTimeout(400);
          if (!(await page.isVisible('#goals'))) throw new Error('nie ma listy celów');
        },
      },
      {
        name: 'm1-karta-osoby',
        query: '',
        run: async (page, base) => {
          await game(page, base);
          await select(page);
          // spalone krzesło daje nastrój „Palimy meble” na karcie
          const f = await furniturePos(page);
          await page.mouse.click(f.x, f.y, { button: 'right' });
          await page.click('#ctx .ctx-item.risky');
          await page.click('#sheet [data-act="burn-yes"]');
          await page.evaluate(() => window.zm!.ff(45));
          await waitIdle(page);
          await page.waitForTimeout(400);
          const moods = await page.locator('#card .mood').count();
          console.log(`  karta: nastroje ${moods}, mebel ${f.kind}`);
        },
      },
      {
        name: 'm1-menu-prawy',
        query: '',
        run: async (page, base) => {
          await game(page, base);
          await select(page);
          const t = await dryTree(page);
          await page.mouse.click(t.x, t.y, { button: 'right' });
          await page.waitForSelector('#ctx:not([hidden])');
          const items = await page.locator('#ctx .ctx-item').allTextContents();
          console.log(`  menu: ${items.join(' | ')}`);
          if (!items.includes('Ściąć drzewo')) throw new Error('w menu nie ma ścinania drzewa');
          await page.mouse.move(t.x + 400, t.y + 300);
        },
      },
      {
        // potwierdzenie palenia mebli we własnym oknie
        name: 'm1-spalic',
        query: '',
        run: async (page, base) => {
          await game(page, base);
          await select(page);
          const f = await furniturePos(page);
          await page.mouse.click(f.x, f.y, { button: 'right' });
          await page.click('#ctx .ctx-item.risky');
          await page.waitForSelector('#modal:not([hidden])');
        },
      },
      {
        name: 'm1-uchwala',
        query: '',
        run: async (page, base) => {
          await game(page, base, '&godzina=19.5');
          const p = await page.evaluate(() => window.zm!.govTick());
          if (p !== 'uchwala') throw new Error(`o 19:30 zamiast uchwały: ${p}`);
          await page.waitForTimeout(300);
        },
      },
      {
        name: 'm1-karta-nocy',
        query: '',
        run: async (page, base) => {
          await game(page, base, '&godzina=19.5');
          await page.evaluate(() => window.zm!.govTick());
          await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
          const p = await page.evaluate(() => window.zm!.ff(31));
          if (p !== 'karta') throw new Error(`o 20:00 zamiast karty nocy: ${p}`);
          // druga osoba na wartę przy bramie: szansa na karcie musi się zmienić
          const before = await page.textContent('#sheet .odd-v');
          const sel = page.locator('#sheet select.pick').nth(1);
          const opts = await sel
            .locator('option:not([disabled])')
            .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
          const gate = opts.find((v) => v === 'warta:brama') ?? opts.find((v) => v.startsWith('warta:'));
          if (gate) await sel.selectOption(gate);
          const after = await page.textContent('#sheet .odd-v');
          console.log(`  karta: szansa ${before} → ${after}, opcje drugiej osoby: ${opts.join(', ')}`);
          await page.waitForTimeout(200);
        },
      },
      {
        name: 'm1-raport',
        query: '',
        run: async (page, base) => {
          await game(page, base, '&godzina=19.5');
          await page.evaluate(() => window.zm!.govTick());
          await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
          await page.evaluate(() => window.zm!.ff(31));
          await page.click('#sheet [data-act="night-go"]');
          await toReport(page);
          await waitIdle(page);
          const r = await page.evaluate(() => window.zm!.gov!.reports[0]);
          console.log(`  raport: ${r.raid}, linie ${r.lines.length}, zaufanie ${r.trust} (${r.dTrust})`);
        },
      },
      {
        name: 'm1-wydarzenie',
        query: '',
        run: async (page, base) => {
          await game(page, base);
          let p: string | null = null;
          for (let k = 0; k < 12 && p !== 'wydarzenie'; k++) {
            p = await page.evaluate(() => window.zm!.ff(20));
            if (p && p !== 'wydarzenie') throw new Error(`zamiast wydarzenia: ${p}`);
          }
          if (p !== 'wydarzenie') throw new Error('przez cztery godziny gry nie było wydarzenia');
          await waitIdle(page);
          console.log(`  wydarzenie: ${await page.textContent('#sheet .sheet-title')}`);
        },
      },
      {
        name: 'm1-menu',
        query: '',
        run: async (page, base) => {
          await game(page, base);
          await page.click('#btnMenu');
          await page.waitForSelector('#modal:not([hidden])');
        },
      },
      {
        // zapis i wczytanie: ten sam czas, ci sami ludzie, ten sam zarząd
        name: 'm1-zapis',
        query: '',
        run: async (page, base) => {
          await game(page, base, '&godzina=19.5');
          await page.evaluate(() => window.zm!.govTick());
          await page.click('#sheet [data-act="law"][data-arg="u_kociol"]');
          await page.evaluate(() => window.zm!.ff(20));
          const a = await page.evaluate(() => {
            const zm = window.zm!;
            zm.save();
            return { tick: zm.sim!.st.tick, trust: zm.gov!.trust, hash: zm.sim!.hash(), laws: zm.gov!.laws.signed };
          });
          await page.goto(`${base}?speed=0`);
          await page.waitForSelector('#resume:not([hidden])');
          const label = await page.textContent('#btnResume');
          await page.click('#btnResume');
          await waitIdle(page);
          const b = await page.evaluate(() => {
            const zm = window.zm!;
            return { tick: zm.sim!.st.tick, trust: zm.gov!.trust, hash: zm.sim!.hash(), laws: zm.gov!.laws.signed };
          });
          console.log(`  zapis: ${label}; tick ${a.tick} → ${b.tick}, zaufanie ${a.trust} → ${b.trust}`);
          if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('po wczytaniu stan gry jest inny');
        },
      },
      {
        // telefon: cele zwinięte do bieżącego, karta osoby po stuknięciu
        name: 'm1-telefon',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.1`);
          await waitIdle(page);
          await select(page, true);
          await page.waitForTimeout(300);
        },
      },
      {
        name: 'm1-telefon-menu',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.1`);
          await waitIdle(page);
          await select(page, true);
          const t = await dryTree(page);
          await hold(page, t.x, t.y);
          await page.waitForSelector('#ctx:not([hidden])', { timeout: 3000 });
        },
      },
      {
        name: 'm1-telefon-karta-nocy',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.1&godzina=19.5`);
          await waitIdle(page);
          await page.evaluate(() => window.zm!.govTick());
          let bad = await fits(page);
          await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
          await page.evaluate(() => window.zm!.ff(31));
          if (!(await kind(page)).includes('noc')) throw new Error('na telefonie nie ma karty nocy');
          bad = [...bad, ...(await fits(page))];
          if (bad.length) throw new Error(`telefon: ${bad.join('; ')}`);
        },
      },
      {
        name: 'm1-telefon-raport',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.1&godzina=19.5`);
          await waitIdle(page);
          await page.evaluate(() => window.zm!.govTick());
          await page.click('#sheet [data-act="law-skip"]');
          await page.evaluate(() => window.zm!.ff(31));
          await page.click('#sheet [data-act="night-go"]');
          await toReport(page);
          const bad = await fits(page);
          if (bad.length) throw new Error(`telefon: ${bad.join('; ')}`);
        },
      },
      // po playteście: noc w tempie 6× i powrót tempa rano, cel „drewno na noc”, podpowiedź o zimnej kozie
      {
        name: 'm1-noc-szybciej',
        query: '',
        run: async (page, base) => {
          await game(page, base, '&godzina=19.5');
          await page.click('#speed button[data-s="1"]');
          await page.evaluate(() => window.zm!.govTick());
          await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
          await page.evaluate(() => window.zm!.ff(31));
          await page.click('#sheet [data-act="night-go"]');
          await page.waitForTimeout(300);
          const night = await page.evaluate(() => ({
            speed: window.zm!.speed(),
            hint: document.getElementById('hint')!.textContent,
          }));
          if (night.speed !== 3 || !night.hint?.includes('6×'))
            throw new Error(`noc: tempo ${night.speed}, podpowiedź „${night.hint}”`);
          console.log(`  noc: ${night.hint}`);
          await page.screenshot({ path: path.join(OUT, 'm1-noc-szybciej-6x.png') });
          await toReport(page);
          await page.click('#sheet [data-act="report-ok"]');
          const morning = await page.evaluate(() => window.zm!.speed());
          if (morning !== 1) throw new Error(`rano tempo ${morning} zamiast 1×`);
          await page.evaluate(() => {
            const zm = window.zm!;
            const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
            zm.setCam(p.x, p.y, 1.1);
          });
          await waitIdle(page);
        },
      },
      ...(() => {
        /** samouczek przez interfejs: zaznaczenie i ścięcie z menu, dalej przewijanie do ciepłej kuchni */
        const tutorial = async (page: Page, base: string) => {
          await game(page, base);
          await select(page);
          const t = await dryTree(page);
          await page.mouse.click(t.x, t.y, { button: 'right' });
          await page.click('#ctx .ctx-item:has-text("Ściąć drzewo")');
          for (let k = 0; k < 60; k++) {
            if (await page.evaluate(() => window.zm!.sim!.st.tut.step >= 6)) return;
            const p = await page.evaluate(() => window.zm!.ff(10));
            if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
            else if (p) throw new Error(`w samouczku okno: ${p}`);
          }
          throw new Error('samouczek się nie skończył');
        };
        const goal = (page: Page) => page.evaluate(() => document.querySelector('#goals .goal.now')?.textContent ?? '');
        return [
          {
            name: 'm1-drewno-na-noc',
            query: '',
            run: async (page: Page, base: string) => {
              await tutorial(page, base);
              await page.waitForTimeout(400);
              const g = await goal(page);
              if (!g.startsWith('Przygotujcie drewno na noc.') || !g.includes('Drewna na zapas:'))
                throw new Error(`po samouczku cel: ${g}`);
              console.log(`  cel: ${g}`);
              await page.evaluate(() => {
                const zm = window.zm!;
                const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
                zm.setCam(p.x + 6, p.y - 2, 1);
              });
              await waitIdle(page);
              await page.screenshot({ path: path.join(OUT, 'm1-drewno-na-noc-cel.png') });
              // drugie drzewo z menu, potem zapas na noc i następny cel
              const t = await page.evaluate(() => {
                const zm = window.zm!;
                const w = zm.sim!.w;
                const st = zm.sim!.st;
                const h = w.interior;
                const k = st.things.find(
                  (q) => q.kind === 'koza' && h.rooms[h.room[q.y * w.size + q.x]]?.apt === h.home,
                )!;
                let best = -1;
                let bd = 1e9;
                w.trees.forEach((q, i) => {
                  if (i === w.dryTree || q.kind === 2 || q.r < 1.5 || st.felled.includes(i)) return;
                  const d = Math.hypot(q.x - k.x, q.y - k.y);
                  if (d < bd) {
                    bd = d;
                    best = i;
                  }
                });
                const q = w.trees[best];
                zm.setCam(q.x, q.y - 1, 1.3);
                return [q.x, q.y];
              });
              await waitIdle(page);
              const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y), t);
              await page.mouse.click(sx, sy, { button: 'right' });
              await page.click('#ctx .ctx-item:has-text("Ściąć drzewo")');
              for (let k = 0; k < 30 && !(await goal(page)).startsWith('Przetrwajcie'); k++) {
                const p = await page.evaluate(() => window.zm!.ff(10));
                if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
                else if (p) break;
              }
              const after = await goal(page);
              console.log(`  po drugim drzewie: ${after}`);
              if (!after.startsWith('Przetrwajcie')) throw new Error(`zapas drewna nie zaliczył celu: ${after}`);
            },
          },
          {
            name: 'm1-koza-zimna',
            query: '',
            run: async (page: Page, base: string) => {
              await tutorial(page, base);
              // bez drugiego drzewa koza zjada resztę drewna; gra mówi o tym wprost
              let hint = '';
              for (let k = 0; k < 50 && !hint.includes('Koza wygasła'); k++) {
                const p = await page.evaluate(() => window.zm!.ff(10));
                if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
                else if (p === 'uchwala') await page.click('#sheet [data-act="law-skip"]');
                else if (p === 'karta') await page.click('#sheet [data-act="night-go"]');
                else if (p) throw new Error(`okno ${p} przed zgaśnięciem kozy`);
                hint = (await page.textContent('#hint')) ?? '';
              }
              if (!hint.includes('Koza wygasła')) throw new Error('nie było podpowiedzi o zgasłej kozie');
              const fire = await page.textContent('#sFire .stat-v');
              console.log(`  ${await page.textContent('#hTime')}: ${hint} (koza: ${fire})`);
              if (fire !== 'zimna') throw new Error(`na pasku koza: ${fire}`);
              await page.evaluate(() => {
                const zm = window.zm!;
                const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
                zm.setCam(p.x, p.y, 1.2);
              });
              await waitIdle(page);
              // ostrzeżenie zostaje na ekranie, dopóki koza jest zimna (nie znika pod innymi podpowiedziami)
              const still = await page.evaluate(() => document.getElementById('hint')!.className);
              if (!still.includes('warn')) throw new Error('ostrzeżenie o zimnej kozie zniknęło');
            },
          },
        ];
      })(),
    ];
  })(),
  // dym z kozy (przez okno) i ogniska: z czasu gry, nad mapą światła, widać go z daleka i przy dachu
  {
    name: 'dym-dzien',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2`);
      await nightWithFire(page);
      await smokeCheck(page, 1.4, 12);
    },
  },
  {
    // nocą z kozą i ogniskiem na podwórku (w stanie gry): dym przy ogniu podświetlony od dołu
    name: 'dym-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=22`);
      await nightWithFire(page);
      await page.evaluate(() => {
        const sim = window.zm!.sim!;
        const size = sim.w.size;
        const free = sim.w.fence.yard.filter(
          (i) => !sim.blocked[i] && !sim.st.things.some((t) => t.y * size + t.x === i),
        );
        const i = free[Math.floor(free.length * 0.6)];
        sim.st.things.push({
          id: 992000,
          kind: 'ognisko',
          x: i % size,
          y: Math.floor(i / size),
          w: 1,
          h: 1,
          rot: 0,
          n: 0,
          fuel: 1200,
          by: -1,
          owner: -1,
        });
      });
      await smokeCheck(page, 1.3, 24);
    },
  },
  {
    name: 'dym-daleko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.4`);
      await nightWithFire(page);
      await smokeCheck(page, 0.4, 12);
    },
  },
  {
    name: 'dym-daleko-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.4&godzina=21`);
      await nightWithFire(page);
      await smokeCheck(page, 0.4, 12);
    },
  },
  {
    // w mieszkaniu zarządu: śpi w łóżku, siedzi przy stole, dokłada do kozy, gotuje
    name: 'pozy-dom',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await stage(page, 'dom', 0);
      await stage(page, 'dom', 1);
      await waitIdle(page);
      await poseCheck(page, ['lie', 'sit', 'crouch', 'cook']);
    },
  },
  {
    // na podwórku: rąbie suche drzewo, niesie drewno, wartuje z lampą
    name: 'pozy-podworko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await stage(page, 'podworko', 0);
      await waitIdle(page);
      await poseCheck(page, ['chop', 'carry', 'guard', 'carry']);
    },
  },
  {
    name: 'warta-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2&godzina=22`);
      await waitIdle(page);
      await stage(page, 'podworko', 0);
      await waitIdle(page);
      const lamps = await page.evaluate(
        () =>
          (window.zm!.view as unknown as { gameLights: { r: number }[] }).gameLights.filter((l) => l.r === 3).length,
      );
      console.log(`  latarnie w rękach: ${lamps}`);
      if (lamps < 1) throw new Error('wartownik nie ma światła latarni');
    },
  },
  // drzewa z bliska jako sprite'y sortowane z pionkami: za drzewem i przed nim, korona nad zarządem, z daleka
  {
    name: 'drzewa-przed-za',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await treeStage(page, false);
      console.log(
        `  drzewo ${r.tree}: za nim z=${r.behind}, pień z=${r.trunk}, przed nim z=${r.front}, krycie korony ${r.alpha}`,
      );
      if (!(r.behind < r.trunk && r.trunk < r.front)) throw new Error('drzewo nie sortuje się z pionkami');
      if (r.alpha !== 1) throw new Error('korona nad mieszkańcem nie powinna znikać');
    },
  },
  {
    // ktoś z zarządu za koroną: korona półprzezroczysta
    name: 'drzewa-zarzad',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await treeStage(page, true);
      console.log(`  drzewo ${r.tree}: krycie korony nad zarządem ${r.alpha}`);
      if (r.alpha >= 1) throw new Error('korona zasłania kogoś z zarządu');
    },
  },
  {
    name: 'drzewa-daleko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.4`);
      await waitIdle(page);
      const n = await page.evaluate(() => (window.zm!.view as unknown as { trees: { count: number } }).trees.count);
      console.log(`  sprite'ów drzew z daleka: ${n} (drzewa są w kawałkach)`);
      if (n !== 0) throw new Error(`z daleka drzewa nie powinny być sprite'ami`);
    },
  },
  {
    name: 'drzewa-blisko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=lanciego&speed=0&cam=hq,1.5`);
      await waitIdle(page);
      const n = await page.evaluate(() => (window.zm!.view as unknown as { trees: { count: number } }).trees.count);
      console.log(`  sprite'ów drzew z bliska: ${n}`);
      if (n < 5) throw new Error(`z bliska nie ma drzew jako sprite'ów`);
    },
  },
  {
    // napad w świetle: warta z menu stoi tam, gdzie przyjdą; noc (6× po karcie) zwalnia do 1×, kamera na miejscu,
    // szabrowników widać w świetle lampy
    name: 'm1-napad-w-swietle',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=19.5`);
      await waitIdle(page);
      await page.click('#speed button[data-s="1"]');
      await page.evaluate(() => window.zm!.govTick());
      await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
      await page.evaluate(() => window.zm!.ff(31));
      for (const sel of await page.locator('#sheet select.pick').all()) await sel.selectOption('sen');
      await page.click('#sheet [data-act="night-go"]');
      const plan = await page.evaluate(() => {
        const zm = window.zm!;
        const r = zm.gov!.night!.raid!;
        const core = zm.sim!.st.pawns.find((p) => p.kind === 'core' && !p.away)!;
        // bez napadu w planie zarządu napad z samej symulacji przy bramie, półtorej godziny później
        const post = r.come ? r.post : 'brama';
        if (!r.come) zm.sim!.push({ t: 'raid', ids: [], at: zm.sim!.st.tick + 1200, post });
        zm.sim!.push({ t: 'guard', ids: [core.id], post });
        return { come: r.come, post };
      });
      await page.waitForFunction(() => document.getElementById('hint')!.textContent!.includes('Warta widzi'), null, {
        timeout: 90_000,
      });
      await page.waitForTimeout(2200);
      const s = await page.evaluate(() => {
        const zm = window.zm!;
        const sprites = (zm.view as unknown as { pawnSprites: Map<number, { visible: boolean; alpha: number }> })
          .pawnSprites;
        return {
          speed: zm.speed(),
          hint: document.getElementById('hint')!.textContent,
          clock: document.getElementById('hTime')!.textContent,
          seen: zm
            .sim!.st.pawns.filter((p) => p.kind === 'szabrownik')
            .map((p) => {
              const sp = sprites.get(p.id);
              return Math.round((sp?.visible ? sp.alpha : 0) * 100) / 100;
            }),
        };
      });
      console.log(
        `  ${s.clock} (${plan.come ? 'napad z planu' : 'napad z symulacji'} ${plan.post}): ${s.hint}; widać: ${s.seen.join(', ')}`,
      );
      if (s.speed !== 1) throw new Error(`w czasie napadu tempo ${s.speed} zamiast 1×`);
      if (!s.seen.some((a) => a > 0.3)) throw new Error('szabrowników nie widać w świetle lampy');
    },
  },
];

/** klucze rzeczy narysowanych w warstwie pionków (miejsce i opis sprite'a) */
async function thingKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.zm!.view as unknown as { things: Map<string, unknown> }).things.keys()]);
}

/** ile stert jest w świecie i ile narysowano (ze świata albo ze stanu gry) */
async function heapSprites(page: Page) {
  const props = await page.evaluate(
    () => window.zm!.sim!.w.props.filter((p) => p.kind === 'gruz' || p.kind === 'deski' || p.kind === 'zlom').length,
  );
  const heaps = (await thingKeys(page)).filter((k) => /"kind":"(gruz|deski|zlom)"/.test(k));
  const kinds = heaps.map((k) => /"kind":"(\w+)"/.exec(k)![1]).join(', ');
  return { props, drawn: heaps.length, kinds };
}

/** wraki narysowane w warstwie pionków; kamera na ich środek w powiększeniu zoom */
async function wrecks(page: Page, zoom: number) {
  const r = await page.evaluate((z) => {
    const zm = window.zm!;
    const list = [
      ...(
        zm.view as unknown as {
          things: Map<string, { thing: { kind: string; x: number; y: number; w: number; h: number; model?: string } }>;
        }
      ).things.values(),
    ]
      .map((e) => e.thing)
      .filter((t) => t.kind === 'wrak');
    if (!list.length) return { n: 0, models: '', at: '' };
    // najbliższe dwa wraki: kamera między nimi
    const pair = list.slice(0, 2);
    const cx = pair.reduce((a, t) => a + t.x + t.w / 2, 0) / pair.length;
    const cy = pair.reduce((a, t) => a + t.y + t.h / 2, 0) / pair.length;
    zm.setCam(cx, cy, z);
    return { n: list.length, models: [...new Set(list.map((t) => t.model))].join(', '), at: `${cx}, ${cy}` };
  }, zoom);
  await waitIdle(page);
  return r;
}

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

/** kłęby dymu: kamera na ich środek (trochę niżej, żeby było widać wylot), co najmniej min kłębów */
async function smokeCheck(page: Page, zoom: number, min: number) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await page.evaluate((z) => {
    const zm = window.zm!;
    const sm = (
      zm.view as unknown as {
        smoke: { count: number; container: { children: { visible: boolean; x: number; y: number }[] } };
      }
    ).smoke;
    const vis = sm.container.children.filter((c) => c.visible);
    if (!vis.length) return { n: 0, cut: false };
    const cx = vis.reduce((a, c) => a + c.x, 0) / vis.length / 32;
    const cy = Math.max(...vis.map((c) => c.y)) / 32;
    zm.setCam(cx, cy - 1.5, z);
    return { n: sm.count, cut: (zm.view as unknown as { cutOn: boolean }).cutOn };
  }, zoom);
  await waitIdle(page);
  console.log(`  kłębów dymu: ${r.n}${r.cut ? '' : ', przy dachu (bez przekroju)'}`);
  if (r.n < min) throw new Error(`za mało dymu: ${r.n}`);
}

/**
 * Pionki zarządu ustawione w pracy (faza 1, w miejscu): w domu śpi, siedzi przy stole, dokłada do kozy
 * (krok 0: niesie drewno do kozy, krok 1: drewno już w kozie) i gotuje; na podwórku rąbie suche drzewo,
 * niesie drewno i wartuje z lampą (praca 'guard' z symulacji).
 */
async function stage(page: Page, where: 'dom' | 'podworko', step: number) {
  await page.evaluate(
    ([where, step]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const size = sim.w.size;
      const core = st.pawns.filter((p) => p.kind === 'core');
      const STEP = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      const face = (x: number, y: number, tx: number, ty: number) =>
        Math.abs(tx - x) > Math.abs(ty - y) ? (tx > x ? 3 : 2) : ty > y ? 0 : 1;
      type Job = NonNullable<(typeof core)[number]['job']>;
      const job = (t: string, target: number, tile: number): Job =>
        ({ t, target, tile, phase: 1, from: -1, t0: st.tick, until: st.tick + 99999, order: false }) as Job;
      const put = (k: number, x: number, y: number, dir: number, j: Job | null, carry = 0) => {
        const p = core[k];
        Object.assign(p, { x: x + 0.5, y: y + 0.5, path: [], pi: 0, dir, job: j, carry, wait: st.tick + 99999 });
      };
      if (where === 'dom') {
        const koza = st.things.find((t) => t.kind === 'koza')!;
        koza.fuel = 1200;
        const d = (t: { x: number; y: number }) => (t.x - koza.x) ** 2 + (t.y - koza.y) ** 2;
        const near = (kind: string) => st.things.filter((t) => t.kind === kind).sort((a, b) => d(a) - d(b))[0];
        const bed = near('lozko') ?? near('wersalka');
        const table = near('stol');
        const chair = near('krzeslo');
        const stove = near('kuchenka');
        // dokładający klęczy z boku kozy (wolny kafelek), kucharz przy kuchence
        const freeAt = (x: number, y: number) =>
          !sim.blocked[y * size + x] && !st.things.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
        const [cx, cy] = STEP[(stove.rot + 2) % 4];
        const cook = [stove.x + cx, stove.y + cy];
        const side = [STEP[(koza.rot + 1) % 4], STEP[(koza.rot + 3) % 4], STEP[(koza.rot + 2) % 4]]
          .map(([dx, dy]) => [koza.x + dx, koza.y + dy])
          .find(([x, y]) => freeAt(x, y) && !(x === cook[0] && y === cook[1])) ?? [
          koza.x + STEP[(koza.rot + 2) % 4][0],
          koza.y + STEP[(koza.rot + 2) % 4][1],
        ];
        const [sx, sy] = side;
        if (step === 0) {
          put(0, bed.x, bed.y, 0, job('sleep', bed.id, bed.y * size + bed.x));
          put(
            1,
            chair.x,
            chair.y,
            face(chair.x, chair.y, table.x + table.w / 2 - 0.5, table.y + table.h / 2 - 0.5),
            job('eat', table.id, chair.y * size + chair.x),
          );
          put(2, sx, sy, face(sx, sy, koza.x, koza.y), job('refuel', koza.id, sy * size + sx), 2);
          put(3, cook[0], cook[1], face(cook[0], cook[1], stove.x, stove.y), job('cook', stove.id, 0));
          const xs = core.map((p) => p.x);
          const ys = core.map((p) => p.y);
          zm.setCam((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 2.2);
        } else {
          // drewno trafiło do kozy: praca refuel skończona, w rękach pusto
          Object.assign(core[2], { job: null, carry: 0 });
        }
      } else {
        const tree = sim.w.trees[sim.w.dryTree];
        const tx = Math.floor(tree.x);
        const ty = Math.floor(tree.y);
        const gate = sim.w.fence.gate;
        put(0, tx - 1, ty, 3, job('chop', sim.w.dryTree, ty * size + tx - 1));
        put(1, tx + 2, ty + 1, 0, null, 3);
        put(2, gate.x, gate.y + (gate.rot === 0 ? -1 : 1), 0, job('guard', -1, 0));
        put(3, tx - 2, ty + 2, 3, null, 2);
        zm.setCam(tx, ty + 1, 2);
      }
    },
    [where, step] as const,
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** pozy pionków zarządu po kolei: jaka klatka atlasu jest na sprite'cie (kolumna pozy albo leżenie) */
async function poseCheck(page: Page, want: string[]) {
  const got = await page.evaluate(() => {
    const zm = window.zm!;
    const sprites = (
      zm.view as unknown as { pawnSprites: Map<number, { texture: { frame: { x: number; width: number } } }> }
    ).pawnSprites;
    return zm
      .sim!.st.pawns.filter((p) => p.kind === 'core')
      .map((p) => {
        const f = sprites.get(p.id)!.texture.frame;
        return { x: f.x, w: f.width };
      });
  });
  const names = got.map((f) => (f.w === LIE ? 'lie' : poseAt(f.x)));
  console.log(`  pozy: ${names.join(', ')}`);
  if (names.join() !== want.join()) throw new Error(`pozy ${names.join()} zamiast ${want.join()}`);
}

/** poza z kolumny atlasu ludzi */
function poseAt(x: number): string {
  for (const pose of [...POSES].reverse()) if (x >= frameRect(0, pose, 0, 0)[0]) return pose;
  return '?';
}

/**
 * Pionki przy żywym drzewie najbliżej siedziby: jeden metr za pniem (na północ, pod koroną) i pół metra
 * przed nim; zarzad: za drzewem stoi ktoś z zarządu, inaczej mieszkaniec. Zwraca kolejność rysowania
 * (zIndex) obu pionków i pnia oraz krycie korony.
 */
async function treeStage(page: Page, zarzad: boolean) {
  await page.evaluate((zarzad) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const w = sim.w;
    const b = w.buildings[w.hq];
    const hx = (b.x0 + b.x1) / 2;
    const hy = (b.y0 + b.y1) / 2;
    const k = w.trees
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => t.kind === 0 && t.r >= 1.4 && i !== w.dryTree && !sim.st.felled.includes(i))
      .sort((a, c) => (a.t.x - hx) ** 2 + (a.t.y - hy) ** 2 - ((c.t.x - hx) ** 2 + (c.t.y - hy) ** 2))[0].i;
    const t = w.trees[k];
    const core = sim.st.pawns.filter((p) => p.kind === 'core' && !p.away);
    const other = sim.st.pawns.filter((p) => p.kind !== 'core' && !p.away);
    const put = (p: (typeof core)[number], x: number, y: number) =>
      Object.assign(p, { x, y, path: [], pi: 0, job: null, carry: 0, dir: 0, wait: sim.st.tick + 99999 });
    put(zarzad ? core[0] : other[0], t.x, t.y - 1);
    put(zarzad ? core[1] : other[1], t.x + 0.3, t.y + 0.6);
    // reszta zarządu z dala od drzewa (żeby nie zmieniała krycia korony)
    for (const p of core.slice(zarzad ? 2 : 0)) put(p, t.x + 6, t.y + 4);
    (window as unknown as { __tree: number }).__tree = k;
    zm.setCam(t.x, t.y - 1, 2);
  }, zarzad);
  await waitIdle(page);
  return page.evaluate((zarzad) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const k = (window as unknown as { __tree: number }).__tree;
    const view = zm.view as unknown as {
      trees: { sprites: Map<number, { zIndex: number; alpha: number }> };
      pawnSprites: Map<number, { zIndex: number }>;
    };
    const sp = view.trees.sprites.get(k)!;
    const pick = sim.st.pawns.filter((p) => (zarzad ? p.kind === 'core' : p.kind !== 'core') && !p.away);
    return {
      tree: k,
      behind: view.pawnSprites.get(pick[0].id)!.zIndex,
      trunk: sp.zIndex,
      front: view.pawnSprites.get(pick[1].id)!.zIndex,
      alpha: sp.alpha,
    };
  }, zarzad);
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
