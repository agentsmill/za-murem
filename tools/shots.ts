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
    // na telefonie formularz adresu ma się mieścić na pierwszym ekranie
    name: 'start-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(base);
      await page.waitForSelector('#demos button');
      const bottom = await page.$eval('#startForm', (f) => f.getBoundingClientRect().bottom);
      console.log(`  formularz kończy się na ${Math.round(bottom)} px z 844`);
      if (bottom > 844) throw new Error('formularz adresu poza pierwszym ekranem telefonu');
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
          (window.zm!.view as unknown as { gameLights: { r: number }[] }).gameLights.filter((l) => l.r === 5).length,
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
      console.log(
        `  drzewo ${r.tree}: krycie korony ${r.alpha}, zarys za koroną: ${r.xray}, przed nią: ${r.xrayFront}`,
      );
      if (r.alpha !== 1) throw new Error('korona ma zostać pełna');
      if (!r.xray) throw new Error('kogoś z zarządu za koroną nie widać (brak zarysu)');
      if (r.xrayFront) throw new Error('zarys przy kimś, kto stoi przed drzewem');
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
  // mapa światła po przybliżeniu: start z oddalenia (bufor rośnie), potem przybliżenie na wartownika z lampą;
  // ziemia przy lampie ma być jaśniejsza niż 7 m dalej, a rogi ekranu zaciemnione
  {
    name: 'swiatlo-po-przyblizeniu',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.12&godzina=22`);
      await waitIdle(page);
      const at = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const size = sim.w.size;
        // wartownik z latarnią przy bramie, od strony podwórka (skrzydła otwierają się w stronę rot)
        const gate = sim.w.fence.gate;
        const [dx, dy] = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][gate.rot];
        const x = gate.x + 0.5 + dx * (gate.w > 1 ? 0 : 1) + (gate.w > 1 ? 0.5 : 0);
        const y = gate.y + 0.5 + dy * (gate.h > 1 ? 0 : 1) + (gate.h > 1 ? 0.5 : 0);
        const p = st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        const tile = Math.floor(y) * size + Math.floor(x);
        const job = {
          t: 'guard',
          target: 0,
          tile,
          phase: 1,
          from: -1,
          t0: st.tick,
          until: st.tick + 99999,
          order: true,
        };
        Object.assign(p, { x, y, path: [], pi: 0, dir: 0, carry: 0, wait: st.tick + 99999, job });
        return { x, y };
      });
      await frames(page, 4);
      for (const z of [0.3, 0.7, 1.3, 1.7]) {
        await page.evaluate(([x, y, z]) => window.zm!.setCam(x, y, z), [at.x, at.y, z] as const);
        await frames(page, 3);
      }
      await waitIdle(page);
      const r = await lampCheck(page, 1.7);
      console.log(
        `  przy lampie ${r.lamp}, 7 m dalej ${r.dark} (mediana), rogi ${r.corners.join(', ')}, warstwa ${r.layer}`,
      );
      if (r.lamp < r.dark * 1.6) throw new Error('po przybliżeniu nie ma światła lampy w miejscu lampy');
      if (Math.max(...r.corners) > r.dark * 2.2) throw new Error('po przybliżeniu przy krawędzi zostaje jasny pas');
    },
  },
  {
    // czuwanie przy kozie (guard na posterunku koza): klęczy przy ogniu, bez latarni i bez jej światła
    name: 'czuwanie-koza',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2.2&godzina=23`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const size = sim.w.size;
        const koza = st.things.find((t) => t.kind === 'koza')!;
        koza.fuel = 1200;
        const [dx, dy] = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][(koza.rot + 2) % 4];
        const x = koza.x + dx + 0.5;
        const y = koza.y + dy + 0.5;
        const p = st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        const tile = Math.floor(y) * size + Math.floor(x);
        const job = {
          t: 'guard',
          target: -1,
          tile,
          phase: 1,
          from: -1,
          t0: st.tick,
          until: st.tick + 99999,
          order: true,
        };
        Object.assign(p, {
          x,
          y,
          path: [],
          pi: 0,
          dir: dy < 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 3 : 2,
          carry: 0,
          wait: st.tick + 99999,
          job,
        });
        for (let k = 0; k < 20 && !sim.light.some((v) => v > 0); k++) sim.step();
        zm.setCam(x, y, 2.2);
      });
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const view = zm.view as unknown as {
          gameLights: { r: number; inside?: boolean }[];
          pawnSprites: Map<number, { texture: { frame: { x: number } } }>;
        };
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        return {
          lamps: view.gameLights.filter((l) => l.r === 5).length,
          fire: view.gameLights.filter((l) => l.inside).length,
          x: view.pawnSprites.get(p.id)!.texture.frame.x,
        };
      });
      const pose = poseAt(r.x);
      console.log(`  czuwa przy kozie: poza ${pose}, latarnie ${r.lamps}, ogień kozy ${r.fire}`);
      if (pose !== 'crouch' && pose !== 'walk') throw new Error(`czuwający w pozie ${pose}`);
      if (r.lamps !== 0) throw new Error('czuwający przy kozie ma latarnię');
      if (r.fire !== 1) throw new Error('brak ognia kozy');
    },
  },
  // dyżur przy kozie: karta nocy z opcją i pasem „Koza w nocy”, osoba przy kozie w nocy, raport o kuchni rano
  {
    name: 'm1-karta-koza',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      // samouczek poleceniami (kliknięcia sprawdzają inne zrzuty): suche drzewo, koza grzeje; potem do karty nocy
      await page.evaluate(() => {
        const zm = window.zm!;
        const core = zm.sim!.st.pawns.find((p) => p.kind === 'core')!;
        zm.sim!.push({ t: 'chop', ids: [core.id], tree: zm.sim!.w.dryTree });
      });
      let p: string | null = null;
      for (let k = 0; k < 80 && p !== 'karta'; k++) {
        // od 16:00 zapas na noc jak w bocie: następne drzewo przy kozie, dopóki drewna jest mniej niż 16 sztuk
        await page.evaluate(() => {
          const zm = window.zm!;
          const st = zm.sim!.st;
          const w = zm.sim!.w;
          const h = Math.floor((st.tick / 800 + 15) % 24);
          const wood = st.things.reduce((a, t) => a + (t.kind === 'drewno' ? t.n : 0), 0);
          if (h < 16 || wood >= 16 || st.pawns.some((q) => q.job?.t === 'chop')) return;
          const k = st.things.find((t) => t.kind === 'koza')!;
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
          const core =
            st.pawns.find((q) => q.kind === 'core' && !q.job)?.id ?? st.pawns.find((q) => q.kind === 'core')!.id;
          if (best >= 0) zm.sim!.push({ t: 'chop', ids: [core], tree: best });
        });
        p = await page.evaluate(() => window.zm!.ff(10));
        if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
        else if (p === 'uchwala') await page.click('#sheet [data-act="law-skip"]');
        else if (p && p !== 'karta') throw new Error(`przed kartą okno: ${p}`);
      }
      if (p !== 'karta') throw new Error('karta nocy się nie pokazała');
      const fuel = () => page.textContent('#sheet .odd.fuel');
      const before = await fuel();
      if (!before?.includes('zgaśnie') || !before.includes('nikt nie czuwa'))
        throw new Error(`pas kozy bez dyżuru: ${before}`);
      // dyżur dla najbardziej wypoczętej osoby, która według propozycji śpi
      const who = await page.evaluate(() => {
        const n = window.zm!.gov!.night!;
        const free = n.card.people.filter((c) => n.assign[c.id] === 'sen');
        const best = free.sort((a, b) => b.needs.rest - a.needs.rest)[0];
        return { id: best.id, name: best.name };
      });
      await page.selectOption(`#sheet select.pick[data-id="${who.id}"]`, 'warta:koza');
      await page.waitForTimeout(200);
      const card = await page.evaluate(() => ({
        fuel: document.querySelector('#sheet .odd.fuel')?.textContent ?? '',
        advice: document.querySelector('#sheet [data-advice]')?.textContent ?? '',
      }));
      console.log(`  karta: ${card.fuel} | rada: ${card.advice}`);
      if (!card.fuel.includes(`czuwa ${who.name}`)) throw new Error(`pas kozy po wyborze: ${card.fuel}`);
      await page.screenshot({ path: path.join(OUT, 'm1-karta-koza-karta.png') });
      await page.click('#sheet [data-act="night-go"]');
      // pół godziny później: osoba na posterunku przy kozie, karta osoby i pasek o tym mówią (wydarzenia po drodze
      // dostają pierwszą możliwą odpowiedź, żeby okno nie zasłaniało mapy)
      for (let k = 0; k < 6; k++) {
        const q = await page.evaluate(() => window.zm!.ff(5));
        if (q === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
        else if (q) throw new Error(`po karcie okno: ${q}`);
      }
      const at = await page.evaluate((id) => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        const pawn = st.pawns.find((q) => q.kind === 'core' && st.people[q.person].id === id)!;
        // przybliżenie jak na starcie (przy większym mapa światła się rozjeżdża, błąd rysowania opisany w notatce)
        zm.setCam(pawn.x, pawn.y - 1, 1.3);
        return { koza: pawn.job?.t === 'guard' && pawn.job.target === -1, x: pawn.x, y: pawn.y };
      }, who.id);
      if (!at.koza) throw new Error(`${who.name} nie czuwa przy kozie`);
      await waitIdle(page);
      const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.55), [at.x, at.y]);
      await page.mouse.click(sx, sy);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'm1-karta-koza-noc.png') });
      const person = await page.evaluate(() => ({
        tonight: document.querySelector('#card .tonight')?.textContent ?? '',
        doing: document.querySelector('#card .doing')?.textContent ?? '',
        fire: document.getElementById('sFire')?.getAttribute('title') ?? '',
      }));
      console.log(`  ${await page.textContent('#hTime')}: ${person.tonight} ${person.doing}`);
      if (person.tonight !== 'Tej nocy: czuwa przy kozie.') throw new Error(`karta osoby: ${person.tonight}`);
      if (!person.fire.includes(`Przy kozie czuwa ${who.name}`)) throw new Error(`pasek kozy: ${person.fire}`);
      // raport rano: kto czuwał i ile stopni w kuchni
      for (let k = 0; k < 40; k++) {
        const q = await page.evaluate(() => window.zm!.ff(30));
        if (q === 'raport') break;
        if (q === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
        else if (q) throw new Error(`w nocy okno: ${q}`);
      }
      const rep = await page.evaluate(() => ({
        kitchen: document.querySelector('#sheet .tal')?.textContent ?? '',
        lines: [...document.querySelectorAll('#sheet .line')].map((l) => l.textContent ?? ''),
      }));
      const line = rep.lines.find((l) => l.includes('przy kozie')) ?? '';
      console.log(`  raport: ${line} | ${rep.kitchen}`);
      if (!line.startsWith(who.name) || !rep.kitchen.startsWith('Kuchnia rano'))
        throw new Error(`raport bez kuchni: ${rep.lines.join(' ')}`);
      await page.screenshot({ path: path.join(OUT, 'm1-karta-koza-raport.png') });
    },
  },
  // przegląd wizualny przed playtestem: poprawki w rysowaniu
  {
    // siatka schodzi po skosie (Zielonki, wzdłuż podjazdu): łączniki w narożnikach, linia bez przerw
    name: 'przeglad-siatka-schodki',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const f = zm.sim!.w.fence;
        const keys = [...(zm.view as unknown as { things: Map<string, unknown> }).things.keys()];
        zm.setCam(f.gate.x - 6, f.gate.y + 5, 1.6);
        return { tiles: f.tiles.length, drawn: keys.filter((k) => k.includes('"siatka"')).length };
      });
      await waitIdle(page);
      console.log(`  kafelków siatki ${r.tiles}, narysowanych z łącznikami ${r.drawn}`);
      if (r.drawn <= r.tiles) throw new Error('brak łączników siatki na schodkach');
    },
  },
  {
    // nocą zaznaczony ktoś z zarządu w ciemności: obwódka nad mapą światła i zarys
    name: 'przeglad-zaznaczenie-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=23`);
      await waitIdle(page);
      const at = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const p = sim.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        const g = sim.w.fence.gate;
        Object.assign(p, { x: g.x + 0.5, y: g.y + 4.5, path: [], pi: 0, job: null, wait: sim.st.tick + 99999 });
        zm.setCam(p.x, p.y, 1.6);
        return { id: p.id };
      });
      await waitIdle(page);
      await page.mouse.click(720, 430);
      await frames(page, 3);
      const r = await page.evaluate((id) => {
        const v = window.zm!.view as unknown as {
          root: { getChildIndex: (c: unknown) => number };
          marks: unknown;
          light: { sprite: unknown };
          xraySprites: Map<number, { visible: boolean }>;
        };
        return {
          marksAbove: v.root.getChildIndex(v.marks) > v.root.getChildIndex(v.light.sprite),
          outline: !!v.xraySprites.get(id)?.visible,
        };
      }, at.id);
      console.log(`  obwódka nad mapą światła: ${r.marksAbove}, zarys zaznaczonego: ${r.outline}`);
      if (!r.marksAbove || !r.outline) throw new Error('zaznaczony nocą ginie w ciemności');
    },
  },
  {
    // latarnia warty świeci tak daleko, jak warta widzi (LAMP_REACH): szabrownika 3 m dalej widać
    name: 'przeglad-latarnia-zasieg',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=23`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const size = sim.w.size;
        const g = sim.w.fence.gate;
        const x = g.x + 1;
        const y = g.y + 2.5;
        const p = st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        const tile = Math.floor(y) * size + Math.floor(x);
        const job = {
          t: 'guard',
          target: 0,
          tile,
          phase: 1,
          from: -1,
          t0: st.tick,
          until: st.tick + 99999,
          order: true,
        };
        Object.assign(p, { x, y, path: [], pi: 0, dir: 1, carry: 0, wait: st.tick + 99999, job });
        const base = st.pawns.find((q) => q.kind === 'resident') ?? st.pawns[0];
        st.pawns.push({
          ...base,
          id: 990101,
          kind: 'szabrownik',
          x: x + 3,
          y,
          path: [],
          pi: 0,
          job: null,
          away: false,
        });
        zm.setCam(x + 1.5, y, 1.6);
      });
      await waitIdle(page);
      const a = await page.evaluate(() => {
        const sp = (
          window.zm!.view as unknown as { pawnSprites: Map<number, { visible: boolean; alpha: number }> }
        ).pawnSprites.get(990101)!;
        return sp.visible ? Math.round(sp.alpha * 100) / 100 : 0;
      });
      console.log(`  szabrownik 3 m od wartownika: krycie ${a}`);
      if (a < 0.6) throw new Error('szabrownika w zasięgu warty nie widać');
    },
  },
  {
    // dym z okna od ulicy przy odkrytym przekroju nie zasłania pokoi (Lanciego, koza przy oknie od południa)
    name: 'przeglad-dym-przekroj',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=lanciego&speed=0&cam=hq,1.3&godzina=22`);
      await nightWithFire(page);
      const r = await page.evaluate(() => {
        const v = window.zm!.view as unknown as {
          smoke: { container: { children: { visible: boolean; x: number; y: number; alpha: number }[] } };
          scene: { section: { cell: Uint8Array } | null; w: { size: number } };
        };
        const sec = v.scene.section!;
        const size = v.scene.w.size;
        const vis = v.smoke.container.children.filter((c) => c.visible);
        const over = vis.filter((c) => sec.cell[Math.floor(c.y / 32) * size + Math.floor(c.x / 32)] !== 0);
        return { all: vis.length, over: over.length, max: Math.max(0, ...over.map((c) => c.alpha)) };
      });
      console.log(`  kłębów ${r.all}, nad wnętrzem ${r.over}, największe krycie nad wnętrzem ${r.max.toFixed(2)}`);
      if (r.over > 0 && r.max > 0.25) throw new Error('dym zasłania odkryte wnętrze');
    },
  },
  // etykieta „Suche drzewo” na trzech adresach w dzień, nocą z wartą przy bramie i na telefonie: pod napisem
  // nie ma bramy, siatki, rzeczy, budynków ani ludzi, a przy przesuwaniu mapy napis nie skacze (bez
  // sprawdzania konkretnej strony, bo świat się jeszcze zmienia)
  {
    name: 'm1-etykieta-drzewa',
    query: '',
    run: async (page, base) => {
      /** co leży pod napisem na ekranie: kafelki pod nim (brama, siatka i rzeczy też wiersz niżej, bo tam
          stoją ludzie i sterczą rzeczy), budynki i ludzie (sprite od stóp do 1,6 m w górę) */
      const probe = () =>
        page.evaluate(() => {
          const zm = window.zm!;
          const el = document.getElementById('treeMark')!;
          const b = (el.firstElementChild as HTMLElement).getBoundingClientRect();
          const w = zm.sim!.w;
          const [x0, y0] = zm.view.toWorld(b.left, b.top).map((v) => v / 32);
          const [x1, y1] = zm.view.toWorld(b.right, b.bottom).map((v) => v / 32);
          const g = w.fence.gate;
          const fence = new Set(w.fence.tiles);
          const hits: string[] = [];
          for (let y = Math.floor(y0); y <= Math.floor(y1) + 1; y++)
            for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
              if (x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h) hits.push(`brama ${x},${y}`);
              if (fence.has(y * w.size + x)) hits.push(`siatka ${x},${y}`);
              if (w.props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h))
                hits.push(`rzecz ${x},${y}`);
              if (y <= Math.floor(y1) && w.bid[y * w.size + x] >= 0) hits.push(`budynek ${x},${y}`);
            }
          for (const p of zm.sim!.st.pawns) {
            if (p.away) continue;
            const [px0, py0] = zm.screenOf(p.x - 0.35, p.y - 1.6);
            const [px1, py1] = zm.screenOf(p.x + 0.35, p.y);
            if (b.left < px1 && b.right > px0 && b.top < py1 && b.bottom > py0) hits.push(`${p.kind} ${p.id}`);
          }
          return {
            hidden: el.hidden,
            edge: el.classList.contains('edge'),
            side: el.dataset.side ?? '',
            inside: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight,
            hits,
          };
        });
      const check = async (when: string) => {
        const p = await probe();
        console.log(
          `  ${when}: strona ${p.side}${p.hits.length ? `, pod napisem: ${p.hits.join(', ')}` : ', pod napisem nic'}`,
        );
        if (p.hidden || p.edge || !p.inside)
          throw new Error(`${when}: etykieta ukryta, przy krawędzi albo poza kadrem`);
        if (p.hits.length) throw new Error(`${when}: etykieta zasłania ${p.hits.join(', ')}`);
      };
      /** kamera na suchym drzewie (jak gracz, który przesunął mapę do celu) */
      const look = async () => {
        await page.evaluate(() => {
          const zm = window.zm!;
          const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
          zm.setCam(t.x, t.y - 1, 1.3);
        });
        await waitIdle(page);
        await page.waitForTimeout(250);
      };
      /** okna zarządu zwykłymi decyzjami: uchwała bez, karta z propozycją, wydarzenie pierwszą odpowiedzią */
      const clear = async () => {
        for (let k = 0; k < 6; k++) {
          const tone = await page.evaluate(() =>
            document.getElementById('modal')!.hidden ? null : document.getElementById('sheet')!.className,
          );
          if (!tone) return;
          if (tone.includes('uchwala')) await page.click('#sheet [data-act="law-skip"]');
          else if (tone.includes('noc')) await page.click('#sheet [data-act="night-go"]');
          else if (tone.includes('wydarzenie')) await page.click('#sheet .choices [data-act="event"]:not([disabled])');
          else await page.keyboard.press('Escape');
          await page.waitForTimeout(150);
        }
      };
      for (const key of ['przymorze', 'lanciego', 'zielonki']) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${base}?demo=${key}&speed=0&cam=hq,1.3`);
        await waitIdle(page);
        await look();
        await check(`${key}, dzień`);
        await page.screenshot({ path: path.join(OUT, `m1-etykieta-${key}-dzien.png`) });
        // przesuwanie mapy: odległość napisu od pnia na ekranie się nie zmienia (najwyżej piksel zaokrąglenia)
        const offs: [number, number][] = [];
        for (let k = 0; k < 6; k++) {
          await page.evaluate((k) => {
            const zm = window.zm!;
            const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
            zm.setCam(t.x - 3 + k * 1.2, t.y - 2 + k * 0.5, 1.3);
          }, k);
          await page.waitForTimeout(120);
          offs.push(
            await page.evaluate(() => {
              const zm = window.zm!;
              const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
              const [tx, ty] = zm.screenOf(t.x, t.y);
              const b = (document.getElementById('treeMark')!.firstElementChild as HTMLElement).getBoundingClientRect();
              return [b.left - tx, b.top - ty] as [number, number];
            }),
          );
        }
        const jump = Math.max(...offs.map(([x, y]) => Math.hypot(x - offs[0][0], y - offs[0][1])));
        console.log(`  ${key}, przesuwanie: największa zmiana odległości od pnia ${jump.toFixed(1)} px`);
        if (jump > 1.5) throw new Error(`${key}: etykieta skacze przy przesuwaniu mapy`);
        // noc: wartownik z latarnią przy bramie
        await page.goto(`${base}?demo=${key}&speed=0&cam=hq,1.3&godzina=21.5`);
        await waitIdle(page);
        await page.evaluate(() => window.zm!.govTick());
        await clear();
        await page.evaluate(() => {
          const zm = window.zm!;
          const core = zm.sim!.st.pawns.find((p) => p.kind === 'core' && p.job?.t !== 'guard')!;
          zm.sim!.push({ t: 'guard', ids: [core.id], post: 'brama' });
        });
        for (let k = 0; k < 4; k++) {
          await page.evaluate(() => window.zm!.ff(10));
          await clear();
        }
        const lamp = await page.evaluate(() =>
          window.zm!.sim!.st.pawns.some(
            (p) => p.kind === 'core' && p.job?.t === 'guard' && p.job.target === 0 && p.job.phase === 1,
          ),
        );
        if (!lamp) throw new Error(`${key}: nikt nie stoi z latarnią przy bramie`);
        await look();
        await check(`${key}, noc z wartą przy bramie`);
        await page.screenshot({ path: path.join(OUT, `m1-etykieta-${key}-noc.png`) });
        // telefon: na wąskim ekranie napis nad koroną albo pod pniem, cały w kadrze
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${base}?demo=${key}&speed=0&cam=hq,1.3`);
        await waitIdle(page);
        await look();
        await check(`${key}, telefon`);
        await page.screenshot({ path: path.join(OUT, `m1-etykieta-${key}-telefon.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      await look();
    },
  },
  {
    // mysz: przeciąganie lewym przyciskiem przesuwa mapę i nie gubi zaznaczenia, Shift i przeciąganie to ramka
    name: 'mysz-przesuwanie',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      // karta osoby odświeża się w pętli klatek, więc po kliknięciu trzeba na nią poczekać
      const cardOn = () => page.evaluate(() => !document.getElementById('card')!.hidden);
      const cardShown = () =>
        page
          .waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 })
          .then(() => true)
          .catch(() => false);
      const core = await page.evaluate(() => {
        const zm = window.zm!;
        return zm
          .sim!.st.pawns.filter((q) => q.kind === 'core')
          .map((q) => {
            const [x, y] = zm.screenOf(q.x, q.y - 0.6);
            return { x, y };
          });
      });
      await page.mouse.click(core[0].x, core[0].y);
      if (!(await cardShown())) throw new Error('kliknięcie nie zaznaczyło nikogo z zarządu');
      const cam0 = await page.evaluate(() => ({ ...window.zm!.view.cam }));
      await page.mouse.move(700, 420);
      await page.mouse.down();
      await page.mouse.move(700, 620, { steps: 10 });
      await page.mouse.up();
      const cam1 = await page.evaluate(() => ({ ...window.zm!.view.cam }));
      await page.waitForTimeout(500);
      const moved = Math.round((cam0.y - cam1.y) * cam0.zoom);
      const kept = await cardOn();
      console.log(`  przeciąganie: mapa o ${moved} px ekranu, zaznaczenie zostało: ${kept}`);
      if (moved < 150) throw new Error('przeciąganie lewym przyciskiem nie przesunęło mapy');
      if (!kept) throw new Error('przeciąganie zgubiło zaznaczenie');
      // Shift i przeciąganie: ramka wokół całego zarządu zaznacza wszystkich
      const pts = await page.evaluate(() => {
        const zm = window.zm!;
        return zm.sim!.st.pawns.filter((q) => q.kind === 'core').map((q) => zm.screenOf(q.x, q.y - 0.6));
      });
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      await page.keyboard.down('Shift');
      await page.mouse.move(Math.min(...xs) - 30, Math.min(...ys) - 30);
      await page.mouse.down();
      await page.mouse.move(Math.max(...xs) + 30, Math.max(...ys) + 30, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      const cam2 = await page.evaluate(() => ({ ...window.zm!.view.cam }));
      // karta grupy („Zaznaczeni: N”) pojawia się po odświeżeniu w pętli klatek
      const group = await page
        .waitForFunction(
          () => /Zaznaczeni: (\d+)/.exec(document.getElementById('card')!.textContent ?? '')?.[1],
          null,
          {
            timeout: 3000,
          },
        )
        .then((h) => h.jsonValue())
        .catch(() => '0');
      console.log(`  ramka z Shiftem: zaznaczonych ${group} z ${pts.length}`);
      if (cam2.x !== cam1.x || cam2.y !== cam1.y) throw new Error('ramka z Shiftem przesunęła mapę');
      if (Number(group) !== pts.length) throw new Error('ramka z Shiftem nie zaznaczyła całego zarządu');
    },
  },
  // M2, fala 1: menu budowy z przycisku i klawisza B (kategorie, koszt, czas, działanie, niedostępne z powodem)
  {
    name: 'm2-menu-budowy',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const menu = () =>
        page.evaluate(() => ({
          open: !document.getElementById('modal')!.hidden,
          cats: [...document.querySelectorAll('#sheet .bcat-h')].map((h) => h.textContent ?? ''),
          items: [...document.querySelectorAll('#sheet .build')].map((b) => ({
            name: b.querySelector('.build-n')?.textContent ?? '',
            ok: b.classList.contains('ok'),
            meta: b.querySelector('.build-m')?.textContent ?? '',
            effect: b.querySelector('.build-d')?.textContent ?? '',
            button: !!b.querySelector('[data-act="build"]'),
            why: b.querySelector('.build-why')?.textContent ?? '',
          })),
        }));
      await page.click('#btnBuild');
      await page.waitForSelector('#sheet .bcat');
      const m = await menu();
      for (const b of m.items) console.log(`  ${b.name}: ${b.ok ? 'można' : b.why} (${b.meta})`);
      if (m.cats.join('|') !== 'Pomieszczenie|Podwórko|Obwód') throw new Error(`kategorie: ${m.cats.join(', ')}`);
      if (m.items.length !== 6) throw new Error(`budowli w menu: ${m.items.length}`);
      for (const b of m.items) {
        if (!b.meta.includes('pracy') || !b.effect) throw new Error(`${b.name}: bez czasu albo działania`);
        if (b.ok !== b.button || (!b.ok && !b.why)) throw new Error(`${b.name}: niedostępna bez powodu`);
      }
      if (!m.items.some((b) => b.ok) || !m.items.some((b) => !b.ok))
        throw new Error('menu bez dostępnych albo bez wyszarzonych');
      await page.screenshot({ path: path.join(OUT, 'm2-menu-budowy-okno.png') });
      await page.keyboard.press('Escape');
      if ((await menu()).open) throw new Error('Esc nie zamknął menu budowy');
      await page.keyboard.press('b');
      await page.waitForSelector('#sheet .bcat');
      await page.click('#sheet [data-act="build-close"]');
      if ((await menu()).open) throw new Error('przycisk Zamknij nie zamknął menu budowy');
    },
  },
  // tryb stawiania myszą: duch za kursorem (zielony, gdzie wolno, czerwony z powodem), R obraca, prawy klik
  // i Esc anulują, lewy klik stawia plan (polecenie budowy w kolejce symulacji na pauzie)
  {
    name: 'm2-stawianie',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const choose = async (kind: string) => {
        await page.keyboard.press('b');
        await page.waitForSelector('#sheet .bcat');
        await page.click(`#sheet [data-act="build"][data-arg="${kind}"]`);
      };
      const state = () =>
        page.evaluate(() => ({
          p: window.zm!.placing(),
          ghost: !document.getElementById('ghost')!.hidden,
          bad: document.getElementById('ghost')!.classList.contains('bad'),
          bar: !document.getElementById('placeBar')!.hidden,
          text: document.getElementById('placeText')!.textContent ?? '',
        }));
      /** kamera i kursor na kafelku (x, y) */
      const point = async (x: number, y: number) => {
        await page.evaluate(([x, y]) => window.zm!.setCam(x + 1, y + 1, 1.6), [x, y]);
        await waitIdle(page);
        const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), [x, y]);
        await page.mouse.move(sx, sy);
        await page.waitForTimeout(150);
        return [sx, sy] as const;
      };
      await choose('warsztat');
      const p0 = await page.evaluate(() => window.zm!.placing());
      if (!p0 || p0.allowed < 1) throw new Error('warsztat bez dozwolonego miejsca');
      const size = await page.evaluate(() => window.zm!.sim!.w.size);
      const spot = [p0.first % size, Math.floor(p0.first / size)] as const;
      const [sx, sy] = await point(spot[0], spot[1]);
      const good = await state();
      console.log(`  dobre miejsce ${spot.join(',')}: ${good.text}`);
      if (!good.p?.ok || !good.ghost || good.bad || !good.bar)
        throw new Error('duch na dozwolonym miejscu nie jest zielony');
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-dobrze.png') });
      // podwórko nie jest pokojem: duch czerwony, a pasek mówi czemu
      const yard = await page.evaluate(() => window.zm!.sim!.w.fence.yard[0]);
      await point(yard % size, Math.floor(yard / size));
      const bad = await state();
      console.log(`  podwórko: ${bad.text}`);
      if (bad.p?.ok || !bad.bad || !bad.text.includes('w pokoju naszego mieszkania'))
        throw new Error('duch poza pokojem nie mówi, czemu nie');
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-zle.png') });
      await page.keyboard.press('r');
      if ((await state()).p?.rot !== 1) throw new Error('R nie obrócił planu');
      await page.mouse.click(sx, sy, { button: 'right' });
      if ((await state()).p || (await state()).bar) throw new Error('prawy klik nie anulował planu');
      await choose('warsztat');
      await page.keyboard.press('Escape');
      if ((await state()).p) throw new Error('Esc nie anulował planu');
      // przeciąganie w trybie stawiania przesuwa mapę i niczego nie stawia (klik bez przeciągnięcia stawia)
      await choose('warsztat');
      await point(spot[0], spot[1]);
      const cam0 = await page.evaluate(() => ({ ...window.zm!.view.cam }));
      await page.mouse.down();
      await page.mouse.move(sx + 120, sy + 160, { steps: 10 });
      await page.mouse.up();
      const dragged = await page.evaluate(
        ([x, y]) => ({
          moved: Math.round(
            Math.hypot(window.zm!.view.cam.x - x, window.zm!.view.cam.y - y) * window.zm!.view.cam.zoom,
          ),
          placing: !!window.zm!.placing(),
          cmds: window.zm!.sim!.st.cmds.filter((c) => (c as { t: string }).t === 'build').length,
        }),
        [cam0.x, cam0.y],
      );
      console.log(
        `  przeciąganie w trybie stawiania: mapa o ${dragged.moved} px, plan ${dragged.placing ? 'dalej w ręku' : 'zgubiony'}, postawionych ${dragged.cmds}`,
      );
      if (dragged.moved < 100 || !dragged.placing || dragged.cmds)
        throw new Error('przeciąganie w trybie stawiania postawiło plan albo nie przesunęło mapy');
      // lewy klik stawia plan na dozwolonym miejscu
      const [px, py] = await point(spot[0], spot[1]);
      await page.mouse.click(px, py);
      const cmds = await page.evaluate(() =>
        window.zm!.sim!.st.cmds.filter((c) => (c as { t: string }).t === 'build').map((c) => ({ ...(c as object) })),
      );
      console.log(`  postawione: ${JSON.stringify(cmds)}`);
      const c = cmds[0] as { kind?: string; x?: number; y?: number; rot?: number } | undefined;
      if (c?.kind !== 'warsztat' || c.x !== spot[0] || c.y !== spot[1] || c.rot !== 0)
        throw new Error('lewy klik nie postawił planu warsztatu');
      if ((await state()).p) throw new Error('po postawieniu tryb stawiania został');
    },
  },
  // tryb stawiania na telefonie: stuknięcie stawia, przyciski na dole obracają i anulują
  {
    name: 'm2-stawianie-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const placing = () => page.evaluate(() => window.zm!.placing());
      const choose = async () => {
        await page.tap('#btnBuild');
        await page.waitForSelector('#sheet .bcat');
        await page.tap('#sheet [data-act="build"][data-arg="zasieki"]');
        await page.waitForTimeout(150);
      };
      await choose();
      const bar = await page.evaluate(() => ({
        shown: !document.getElementById('placeBar')!.hidden,
        buttons: [...document.querySelectorAll('#placeBar [data-place]')].map((b) => b.textContent),
      }));
      if (!bar.shown || bar.buttons.join('|') !== 'Obróć|Anuluj')
        throw new Error(`pasek stawiania: ${bar.buttons.join(', ')}`);
      await page.tap('#placeBar [data-place="rot"]');
      if ((await placing())?.rot !== 1) throw new Error('przycisk Obróć nie obrócił planu');
      await page.tap('#placeBar [data-place="cancel"]');
      if (await placing()) throw new Error('przycisk Anuluj nie anulował planu');
      await choose();
      const p = (await placing())!;
      const size = await page.evaluate(() => window.zm!.sim!.w.size);
      const spot = [p.first % size, Math.floor(p.first / size)] as const;
      await page.evaluate(([x, y]) => window.zm!.setCam(x + 0.5, y + 2, 1.6), spot);
      await waitIdle(page);
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-telefon-plan.png') });
      const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), spot);
      await page.touchscreen.tap(sx, sy);
      await page.waitForTimeout(150);
      const cmds = await page.evaluate(() =>
        window.zm!.sim!.st.cmds.filter((c) => (c as { t: string }).t === 'build').map((c) => ({ ...(c as object) })),
      );
      console.log(`  postawione stuknięciem: ${JSON.stringify(cmds)}`);
      const c = cmds[0] as { kind?: string; x?: number; y?: number } | undefined;
      if (c?.kind !== 'zasieki' || c.x !== spot[0] || c.y !== spot[1])
        throw new Error('stuknięcie nie postawiło zasieków');
      if (await placing()) throw new Error('po postawieniu tryb stawiania został');
    },
  },
  // karta pustego mieszkania po kliknięciu w nie: stan, powód, co do naprawy, co już przeszukane
  {
    name: 'm2-karta-mieszkania',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      // puste mieszkanie z uszkodzeniami (ze świata albo z atrapy interfejsu): środek jego największego pokoju
      const target = await page.evaluate(() => {
        const zm = window.zm!;
        const w = zm.sim!.w;
        const i = w.interior;
        const apt = zm.apts().find((a) => a.state === 'puste' && a.why && a.why !== 'wyjazd' && a.why !== 'wymarcie');
        if (!apt) return null;
        const room = i.rooms.filter((r) => r.apt === apt.apt && r.kind === 'pokoj').sort((a, b) => b.area - a.area)[0];
        const tiles: number[] = [];
        i.room.forEach((r, t) => {
          if (r === room.id && !w.blocked[t]) tiles.push(t);
        });
        const t = tiles[Math.floor(tiles.length / 2)];
        return { apt: apt.apt, x: t % w.size, y: Math.floor(t / w.size) };
      });
      if (!target) throw new Error('nie ma pustego mieszkania z uszkodzeniami');
      await page.evaluate(([x, y]) => window.zm!.setCam(x + 3, y, 1.6), [target.x, target.y]);
      await waitIdle(page);
      const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), [target.x, target.y]);
      await page.mouse.click(sx, sy);
      await page.waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 });
      // textContent: nagłówki karty są wielkimi literami tylko w CSS
      const card = await page.evaluate(() => document.getElementById('card')!.textContent ?? '');
      console.log(
        `  ${await page.evaluate(() => document.getElementById('card')!.innerText.split('\n').filter(Boolean).slice(0, 6).join(' | '))}`,
      );
      for (const want of [
        `Mieszkanie ${target.apt + 1}`,
        'Puste od',
        'Do naprawy',
        'Przeszukane: 0 z',
        'Prawy przycisk w mieszkaniu',
      ])
        if (!card.includes(want)) throw new Error(`karta mieszkania bez „${want}”`);
      await page.screenshot({ path: path.join(OUT, 'm2-karta-mieszkania-karta.png') });
      // Esc zamyka kartę
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if (await page.evaluate(() => !document.getElementById('card')!.hidden))
        throw new Error('Esc nie zamknął karty mieszkania');
    },
  },
];

/** n klatek przeglądarki */
async function frames(page: Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        let k = 0;
        const f = () => (++k >= n ? done() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );
}

/**
 * Jasność zrzutu: pierścień ziemi 0,8–1,4 m od środka ekranu (lampa w ręce wartownika na środku, bez samego
 * pionka), mediana czterech miejsc 7 m dalej i cztery rogi ekranu; do tego rozmiar sprite'a mapy światła
 * wobec widoku (ile komórek pokazuje).
 */
async function lampCheck(page: Page, zoom: number) {
  const layer = await page.evaluate(() => {
    const l = (window.zm!.view as unknown as { light: { sprite: { width: number; height: number } } }).light;
    return `${Math.round(l.sprite.width)}×${Math.round(l.sprite.height)} px świata`;
  });
  const img = decodePng(await page.screenshot());
  const lum = (x0: number, y0: number, r: number) => {
    let s = 0;
    let n = 0;
    for (let y = Math.max(0, y0 - r); y < Math.min(img.height, y0 + r); y++)
      for (let x = Math.max(0, x0 - r); x < Math.min(img.width, x0 + r); x++) {
        const o = (y * img.width + x) * 4;
        s += img.rgba[o] + img.rgba[o + 1] + img.rgba[o + 2];
        n++;
      }
    return Math.round(s / Math.max(1, n) / 3);
  };
  const cx = img.width >> 1;
  const cy = img.height >> 1;
  const m = 32 * zoom;
  const ring = [
    [-1.1, 0.3],
    [1.2, 0.2],
    [0.2, 1.1],
    [-0.9, 0.9],
    [1, 0.9],
  ].map(([dx, dy]) => lum(Math.round(cx + dx * m), Math.round(cy + dy * m), 8));
  const far = [
    [-7, 0],
    [7, 0],
    [0, -7],
    [0, 7],
  ]
    .map(([dx, dy]) => lum(Math.round(cx + dx * m), Math.round(cy + dy * m), 10))
    .sort((a, b) => a - b);
  // rogi mapy z dala od paska, panelu celów, przycisków zoomu i podpisu atrybucji
  const corners = [
    [340, 110],
    [img.width - 100, 110],
    [40, img.height - 40],
    [img.width - 40, img.height - 60],
  ].map(([x, y]) => lum(x, y, 20));
  return {
    lamp: Math.round(ring.reduce((a, b) => a + b, 0) / ring.length),
    dark: Math.round((far[1] + far[2]) / 2),
    corners,
    layer,
  };
}

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
        // warta z latarnią przy bramie (posterunek 0); -1 to czuwanie przy kozie, bez latarni
        put(2, gate.x, gate.y + (gate.rot === 0 ? -1 : 1), 0, job('guard', 0, 0));
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
      xraySprites: Map<number, { visible: boolean }>;
    };
    const sp = view.trees.sprites.get(k)!;
    const pick = sim.st.pawns.filter((p) => (zarzad ? p.kind === 'core' : p.kind !== 'core') && !p.away);
    return {
      tree: k,
      behind: view.pawnSprites.get(pick[0].id)!.zIndex,
      trunk: sp.zIndex,
      front: view.pawnSprites.get(pick[1].id)!.zIndex,
      alpha: sp.alpha,
      xray: !!view.xraySprites.get(pick[0].id)?.visible,
      xrayFront: !!view.xraySprites.get(pick[1].id)?.visible,
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
