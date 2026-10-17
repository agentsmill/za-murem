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
    ];
  })(),
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
