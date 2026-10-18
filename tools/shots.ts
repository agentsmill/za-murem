/* Zrzuty ekranu w prawdziwym Chromium: mapy testowe, kamera i pora dnia ustawiane w adresie.
   Uruchomienie: npm run shots [-- filtr] [--dist]   (filtr: fragment nazwy; --dist: zbudowana wersja)
   Wynik: shots/<nazwa>.png. Każdy zrzut obejrzyj, zanim zgłosisz zmianę. */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { stworzSerwer } from '../server/app.ts';
import type { ZajetaKlatka } from '../src/net/protokol.ts';
import { frameRect, LIE, LOOKS, POSE_FRAMES, POSES } from '../src/render/art/people.ts';
import { klatkiBudynku, kluczBudynku } from '../src/world/klucze.ts';
import { toGeoT } from '../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../src/world/world.ts';
import { ADDRESSES, decodedTiles } from '../tests/unit/fixtures.ts';
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
  /** błędy konsoli, których scenariusz się spodziewa (np. 404 tabel zablokowanych przez scenariusz) */
  allow?: RegExp;
  /** z allow: błąd jest spodziewany tylko dla zasobu pod tym adresem (np. tylko tabele z data/mieszkancy/) */
  allowUrl?: RegExp;
}

const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/mvt');

/** karta startowa: dół akapitu z atrybucją mapy i linku do źródeł danych mieszkańców (wypisane; sprawdza wołający) */
async function atrybucjaStartu(page: Page) {
  const a = await page.evaluate(() => {
    const fine = document.querySelector('.start .fine')!.getBoundingClientRect();
    const link = document.querySelector('.start .fine a[href="data/mieszkancy/LICENCJE.md"]')?.getBoundingClientRect();
    return {
      fine: Math.round(fine.bottom),
      link: link ? Math.round(link.bottom) : Number.POSITIVE_INFINITY,
      h: innerHeight,
      side: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  console.log(`  atrybucja mapy kończy się na ${a.fine} px, link do danych mieszkańców na ${a.link} px z ${a.h}`);
  if (!Number.isFinite(a.link)) throw new Error('brak linku do źródeł danych mieszkańców na karcie startowej');
  if (a.side) throw new Error('karta startowa przewija się w bok');
  return a;
}

/** tabele mieszkańców niedostępne (404): gra idzie starą ścieżką, postaci jak przed krokiem 5. `tylko` zawęża blokadę
    do plików, których nazwa pasuje (np. kraj.json: gra bez generatora, ale edytor imienia dalej ma odmianę). */
async function bezTabel(page: Page, tylko?: RegExp) {
  await page.route('**/data/mieszkancy/**', (r) =>
    !tylko || tylko.test(r.request().url()) ? r.fulfill({ status: 404, body: 'brak' }) : r.fallback(),
  );
}
/** 404 zablokowanych tabel to spodziewany błąd konsoli, ale tylko dla plików z data/mieszkancy/ */
const BRAK_TABEL = /status of 404/;
const TABELE_URL = /\/data\/mieszkancy\//;
/** tabele krajowe w innej wersji (200, bez błędu konsoli): gra bez danych mieszkańców, jak bez tabel */
async function zlaWersjaKraju(page: Page) {
  await page.route('**/data/mieszkancy/kraj.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wersja: -1 }) }),
  );
}

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
    // atrybucja mapy i link do źródeł danych mieszkańców na pierwszym ekranie
    name: 'start',
    query: '',
    run: async (page, base) => {
      await page.goto(base);
      await page.waitForSelector('#demos button');
      const a = await atrybucjaStartu(page);
      if (a.fine > a.h || a.link > a.h)
        throw new Error('atrybucja albo link do danych mieszkańców pod pierwszym ekranem');
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
      await atrybucjaStartu(page);
    },
  },
  {
    name: 'start-zombie',
    query: '',
    run: async (page, base) => {
      await page.goto(base);
      await page.waitForSelector('#demos button');
      await page.click('.mode-o.zombie');
      const lore = await page.$eval('#lore', (e) => e.textContent ?? '');
      if (!lore.includes('Szwendacze')) throw new Error('wstęp trybu zombie się nie zmienił');
    },
  },
  {
    name: 'start-zombie-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(`${base}?tryb=zombie`);
      await page.waitForSelector('#demos button');
      const checked = await page.$eval('input[name=tryb][value=zombie]', (e) => (e as HTMLInputElement).checked);
      if (!checked) throw new Error('?tryb=zombie nie zaznaczył trybu');
      const bottom = await page.$eval('#startForm', (f) => f.getBoundingClientRect().bottom);
      console.log(`  formularz kończy się na ${Math.round(bottom)} px z 844`);
      if (bottom > 844) throw new Error('formularz adresu poza pierwszym ekranem telefonu');
    },
  },
  // Wasz zarząd: sekcja zwinięta, edytor na komputerze i telefonie, liczba osób w grze, karta osoby z historią
  ...druzynaShots(),
  // karta osoby z generatora mieszkańców (krok 5): członek zarządu i mieszkaniec, komputer i telefon; zmiana imienia
  // z odmianą (imie-*): edytor, zgadywane formy, błąd, zapis w przeglądarce, przywrócenie
  ...kartaShots(),
  // Gra z sąsiadami (?siec=1) z udawanym serwerem pod /api: karta startowa, znaczniki zajętych, start bez domu
  ...siecShots(),
  {
    name: 'zombie-dzien',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&cam=hq,0.8&stado=14`);
      await waitIdle(page);
      const z = await page.evaluate(() => window.zm!.sim!.st.pawns.filter((p) => p.kind === 'zombie').length);
      console.log(`  szwendaczy: ${z}`);
      if (z < 14) throw new Error('za mało szwendaczy');
    },
  },
  {
    // zwykły start bez ?stado: do 19:30 szwendacze z pasa przy siatce ściągają się pod nią
    name: 'zombie-wieczor',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&cam=hq,1`);
      await waitIdle(page);
      const info = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        for (let k = 0; k < 3600; k++) sim.step();
        const w = sim.w;
        const near = (p: { x: number; y: number }) =>
          w.fence.tiles.some((t) => Math.hypot((t % w.size) + 0.5 - p.x, Math.floor(t / w.size) + 0.5 - p.y) <= 12);
        const z = st.pawns.filter((p) => p.kind === 'zombie');
        const at = z.filter(near);
        if (at.length)
          zm.setCam(at.reduce((a, p) => a + p.x, 0) / at.length - 4, at.reduce((a, p) => a + p.y, 0) / at.length, 1.2);
        return { all: z.length, near: at.length };
      });
      console.log(`  szwendaczy: ${info.all}, do 12 m od siatki: ${info.near}`);
      if (info.near < 4) throw new Error('szwendacze nie ściągają się pod siatkę');
      await waitIdle(page);
      await page.waitForTimeout(350);
    },
  },
  {
    name: 'zombie-noc',
    query: '',
    run: async (page, base) => zombieNight(page, base),
  },
  {
    name: 'zombie-noc-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => zombieNight(page, base),
  },
  {
    name: 'zombie-walka',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&godzina=11&stado=10&cam=hq,1`);
      await waitIdle(page);
      // siatka puszcza przy szwendaczach, zarząd z bronią na podwórku walczy
      const info = await page.evaluate(() => {
        const sim = window.zm!.sim!;
        const st = sim.st;
        const zs = st.pawns.filter((p) => p.kind === 'zombie');
        const fence = sim.w.fence.tiles;
        const size = sim.w.size;
        const z0 = zs[0];
        const tile = fence.reduce((b, t) =>
          Math.hypot((t % size) - z0.x, Math.floor(t / size) - z0.y) <
          Math.hypot((b % size) - z0.x, Math.floor(b / size) - z0.y)
            ? t
            : b,
        );
        sim.damageFence(tile, 500);
        const core = st.pawns.filter((p) => p.kind === 'core');
        core[0].weapon = 'lom';
        core[1].weapon = 'dzida';
        // szwendacze wchodzą na podwórko, potem zarząd dostaje rozkaz ataku na najbliższych
        for (let k = 0; k < 900; k++) sim.step();
        const yard = new Set(sim.w.fence.yard);
        const inYard = () =>
          st.pawns.filter((p) => p.kind === 'zombie' && yard.has(Math.floor(p.y) * size + Math.floor(p.x)));
        for (const c of core.slice(0, 2)) {
          const z = inYard().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
          if (z) sim.push({ t: 'attack', ids: [c.id], target: z.id });
        }
        let fights = 0;
        for (let k = 0; k < 1600 && fights < 1; k++) {
          sim.step();
          if (st.fx?.some((f) => f.t === 'cios' && st.tick - f.tick < 2)) fights++;
        }
        const busy = st.pawns.filter((p) => p.job?.t === 'fight');
        const at = busy.length ? busy : st.pawns.filter((p) => p.kind === 'zombie');
        const x = at.reduce((a, p) => a + p.x, 0) / at.length;
        const y = at.reduce((a, p) => a + p.y, 0) / at.length;
        window.zm!.setCam(x, y, 2.2);
        return {
          fights,
          killed: st.tally?.killed ?? 0,
          bodies: st.things.filter((t) => t.kind === 'trup' || t.kind === 'zwloki').length,
          blood: st.things.filter((t) => t.kind === 'krew').length,
        };
      });
      console.log(`  walka: ${JSON.stringify(info)}`);
      if (!info.fights) throw new Error('nikt nie walczył');
      await waitIdle(page);
      // pasek u góry odświeża się co 200 ms
      await page.waitForTimeout(350);
    },
  },
  {
    name: 'arkusz-walki',
    query: '',
    w: 1300,
    h: 900,
    run: async (page, base) => {
      await page.goto(base);
      await page.waitForSelector('#demos button');
      // arkusz z modułów grafiki (serwer Vite podaje je jako ESM): człowiek z każdą bronią w każdej pozie
      // i kierunku oraz szwendacze, powiększone 3 razy
      await page.evaluate(async () => {
        const load = (path: string) => import(/* @vite-ignore */ path);
        const people = (await load('/src/render/art/people.ts')) as typeof import('../src/render/art/people.ts');
        const bron = (await load('/src/render/art/bron.ts')) as typeof import('../src/render/art/bron.ts');
        const atlas = people.makePeopleAtlas();
        const zat = people.makeZombieAtlas() as HTMLCanvasElement;
        const wat = bron.makeWeaponAtlas() as HTMLCanvasElement;
        const S = 3;
        const c = document.createElement('canvas');
        c.width = 1300;
        c.height = 900;
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.fillStyle = '#5d7a45';
        g.fillRect(0, 0, c.width, c.height);
        const poses = [
          ['walk', 'hold', 0],
          ['swing', 'swing', 0],
          ['swing', 'swing', 1],
          ['aim', 'aim', 0],
          ['aim', 'aim', 1],
        ] as const;
        bron.ARMED.forEach((id, row) => {
          let col = 0;
          for (const [pose, arm, f] of poses)
            for (const dir of [0, 3, 1]) {
              const x = 10 + col * 26 * S * 0.55;
              const y = 10 + row * 52 * S * 0.68;
              const [ax, ay, aw, ah] = people.frameRect(5 + row, pose, dir, f);
              g.drawImage(atlas, ax, ay, aw, ah, x + 16 * S * 0.5, y + 8 * S * 0.5, aw * S * 0.5, ah * S * 0.5);
              const [wx, wy, ww, wh] = bron.weaponRect(id, arm, dir, f);
              g.drawImage(wat, wx, wy, ww, wh, x, y, ww * S * 0.5, wh * S * 0.5);
              col++;
            }
        });
        for (let k = 0; k < 8; k++) {
          const pose = k < 4 ? 'lurch' : 'bite';
          const [ax, ay, aw, ah] = people.zFrameRect(k * 2, pose, k % 4, k < 4 ? 1 : 1);
          g.drawImage(zat, ax, ay, aw, ah, 760 + (k % 4) * 40 * S, 60 + Math.floor(k / 4) * 60 * S, aw * S, ah * S);
        }
        document.body.innerHTML = '';
        document.body.style.margin = '0';
        document.body.appendChild(c);
      });
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
          pawnSprites: Map<number, { texture: { frame: { x: number; y: number } } }>;
        };
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        const f = view.pawnSprites.get(p.id)!.texture.frame;
        return {
          lamps: view.gameLights.filter((l) => l.r === 5).length,
          fire: view.gameLights.filter((l) => l.inside).length,
          x: f.x,
          y: f.y,
        };
      });
      const pose = poseAt(r.x, r.y);
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
  // M2, fala 1: budowle, duchy planów, podgląd stawiania, puste mieszkania w przekroju (atrapy do czasu świata i symulacji)
  {
    name: 'm2-budowle',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.6`);
      await waitIdle(page);
      const r = await m2Stage(page, 'budowle');
      await waitIdle(page);
      const keys = await thingKeys(page);
      const kinds = ['warsztat', 'kuchnia_spoleczna', 'magazyn', 'lozka_pietrowe', 'ogrodek', 'zasieki'];
      const drawn = kinds.filter((k) => keys.some((key) => key.includes(`"kind":"${k}"`)));
      console.log(`  postawione: ${r.placed.join(', ')}; narysowane: ${drawn.join(', ')}`);
      if (drawn.length !== r.placed.length || drawn.length < 5) throw new Error('nie wszystkie budowle się rysują');
    },
  },
  {
    // ogródek na podwórku i zasieki w linii siatki (zamiast jej odcinka)
    name: 'm2-budowle-podworko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.6`);
      await waitIdle(page);
      await m2Stage(page, 'budowle');
      await page.evaluate(() => {
        const zm = window.zm!;
        const t = zm.sim!.st.things.find((q) => q.kind === 'ogrodek')!;
        zm.setCam(t.x + 1.5, t.y + 1, 1.6);
      });
      await waitIdle(page);
    },
  },
  {
    name: 'm2-duch',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.6`);
      await waitIdle(page);
      await m2Stage(page, 'plany');
      await waitIdle(page);
      const n = await page.evaluate(() => (window.zm!.view as unknown as { builds: { count: number } }).builds.count);
      console.log(`  duchów planów: ${n}`);
      if (n < 3) throw new Error('nie widać planów budowy');
    },
  },
  {
    // podgląd stawiania w mapie (view.setPlacement) w dzień; nazwy inne niż scenariusze interfejsu
    // m2-stawianie*, żeby obrazy się nie nadpisywały
    name: 'm2-podglad',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.6`);
      await waitIdle(page);
      await m2Stage(page, 'stawianie-ok');
      await waitIdle(page);
    },
  },
  {
    // podgląd stawiania w niedozwolonym miejscu, nocą (nad mapą światła)
    name: 'm2-podglad-noc',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.6&godzina=22`);
      await waitIdle(page);
      await m2Stage(page, 'stawianie-zle');
      await waitIdle(page);
    },
  },
  {
    // puste mieszkania z atrapy: wyważone drzwi, wybite okno, spalenizna, zalana podłoga, cieknąca rura, śmieci, zepsute meble
    name: 'm2-puste-mieszkania',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2&mieszkania=atrapa`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const v = zm.view as unknown as {
          scene: { section: { damage?: Map<number, string>; why?: Map<number, string> } | null; w: { size: number } };
          things: Map<string, unknown>;
        };
        const sec = v.scene.section!;
        const size = v.scene.w.size;
        const kinds = [...new Set(sec.damage!.values())].sort();
        const whys = [...new Set(sec.why!.values())].sort();
        const keys = [...v.things.keys()];
        // kamera na uszkodzenie wybitego okna (spalone mieszkanie)
        const okno = [...sec.damage!.entries()].find(([, k]) => k === 'okno');
        if (okno) zm.setCam((okno[0] % size) + 0.5, Math.floor(okno[0] / size) + 2.5, 1.7);
        return {
          kinds,
          whys,
          trash: keys.filter((k) => k.includes('"smieci"')).length,
          broken: keys.filter((k) => k.includes('"broken":true')).length,
        };
      });
      await waitIdle(page);
      console.log(
        `  uszkodzenia: ${r.kinds.join(', ')}; ślady: ${r.whys.join(', ')}; śmieci ${r.trash}, zepsutych ${r.broken}`,
      );
      if (r.kinds.length < 4 || r.whys.length < 3 || r.trash < 1 || r.broken < 1)
        throw new Error('puste mieszkania bez śladów');
    },
  },
  {
    name: 'm2-puste-zalanie',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2&mieszkania=atrapa`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const v = zm.view as unknown as { scene: { section: { damage?: Map<number, string> }; w: { size: number } } };
        const size = v.scene.w.size;
        const rura = [...v.scene.section.damage!.entries()].find(([, k]) => k === 'rura');
        if (rura) zm.setCam((rura[0] % size) + 0.5, Math.floor(rura[0] / size) + 0.5, 1.9);
      });
      await waitIdle(page);
    },
  },
  {
    // spalone mieszkanie: okopcona kuchenka (piec na jej kafelku, jak w świecie) z sadzą na posadzce obok
    // i zwęglona podłoga w pokoju
    name: 'm2-puste-pozar',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2&mieszkania=atrapa`);
      await waitIdle(page);
      const tile = await page.evaluate(() => {
        const zm = window.zm!;
        const v = zm.view as unknown as { scene: { section: { damage?: Map<number, string> }; w: { size: number } } };
        const size = v.scene.w.size;
        const piec = [...v.scene.section.damage!.entries()].find(([, k]) => k === 'piec');
        if (piec) zm.setCam((piec[0] % size) + 0.5, Math.floor(piec[0] / size) + 1, 1.9);
        return piec ? piec[0] : -1;
      });
      await waitIdle(page);
      const r = await page.evaluate((i) => {
        const v = window.zm!.view as unknown as { scene: { w: { size: number } }; things: Map<string, unknown> };
        const size = v.scene.w.size;
        const at = `${i % size}:${Math.floor(i / size)}:`;
        return [...v.things.keys()].find((k) => k.startsWith(at)) ?? '';
      }, tile);
      console.log(
        `  piec na kafelku ${tile}: ${r.replace(/:\{.*/, '')} ${r.includes('"burnt":true') ? 'okopcony' : 'cały'}`,
      );
      if (tile < 0 || !r.includes('"kuchenka"') || !r.includes('"burnt":true'))
        throw new Error('kuchenka na kafelku uszkodzenia piec nie jest okopcona');
    },
  },
  // uszkodzona podłoga według przyczyny: wyrwane deski po wyjeździe, zwęglone deski po pożarze
  m2Floor('m2-puste-deski', 'wyjazd'),
  m2Floor('m2-puste-zweglone', 'pozar'),
  {
    // puste mieszkania z prawdziwego świata, bez atrapy: widać tyle, ile świat daje (bez danych sam przekrój)
    name: 'm2-puste-swiat',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const v = zm.view as unknown as {
          scene: { section: { damage?: Map<number, string>; why?: Map<number, string> }; w: { size: number } };
          things: Map<string, unknown>;
        };
        const sec = v.scene.section;
        const size = v.scene.w.size;
        const dmg = [...(sec.damage ?? new Map<number, string>()).entries()];
        const keys = [...v.things.keys()];
        // kamera na uszkodzenie, najchętniej na okno albo drzwi
        const pick = dmg.find(([, k]) => k === 'okno' || k === 'drzwi') ?? dmg[0];
        if (pick) zm.setCam((pick[0] % size) + 0.5, Math.floor(pick[0] / size) + 1.5, 1.6);
        return {
          kinds: [...new Set(dmg.map(([, k]) => k))].sort(),
          whys: [...new Set((sec.why ?? new Map<number, string>()).values())].sort(),
          trash: keys.filter((k) => k.includes('"smieci"')).length,
          broken: keys.filter((k) => k.includes('"broken":true')).length,
          burnt: keys.filter((k) => k.includes('"burnt":true')).length,
        };
      });
      await waitIdle(page);
      console.log(
        `  ze świata: uszkodzenia ${r.kinds.join(', ') || 'brak'}; ślady ${r.whys.join(', ') || 'brak'}; śmieci ${r.trash}, zepsutych ${r.broken}, okopconych ${r.burnt}`,
      );
    },
  },
  {
    // naprawa jak w symulacji M2: wpis st.damage z fixed równym true znika z przekroju (przerysowują się
    // tylko jego kawałki), wpis z fixed równym false zostaje
    name: 'm2-naprawa',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2&mieszkania=atrapa`);
      await waitIdle(page);
      const r = await page.evaluate(async () => {
        const zm = window.zm!;
        const v = zm.view as unknown as { scene: { section: { damage?: Map<number, string> } }; chunksMade: number };
        const dmg = v.scene.section.damage!;
        const [a, b, c] = [...dmg.keys()];
        const before = dmg.size;
        const st = zm.sim!.st as unknown as { damage?: unknown[] };
        if (!st.damage) st.damage = [];
        for (const [tile, fixed] of [
          [a, true],
          [b, true],
          [c, false],
        ] as const)
          st.damage.push({ kind: dmg.get(tile), tile, apt: -1, fixed, have: {} });
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        return { a, b, c, before, after: dmg.size, gone: !dmg.has(a) && !dmg.has(b), kept: dmg.has(c) };
      });
      await waitIdle(page);
      console.log(
        `  uszkodzeń ${r.before} → ${r.after}: kafelki ${r.a} i ${r.b} naprawione: ${r.gone}, ${r.c} bez naprawy zostaje: ${r.kept}`,
      );
      if (!r.gone || !r.kept || r.after !== r.before - 2)
        throw new Error('naprawa ze st.damage nie działa w przekroju');
    },
  },
  {
    // atrapa pustych mieszkań w przekroju: obraz z workerów i z głównego wątku ten sam
    name: 'm2-zgodnosc',
    query: '',
    run: async (page, base) => {
      const snap = async (q: string) => {
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.5&mieszkania=atrapa${q}`);
        await waitIdle(page);
        await page.addStyleTag({ content: '#fps { visibility: hidden !important; }' });
        return decodePng(await page.screenshot());
      };
      const a = await snap('');
      const b = await snap('&worker=0');
      let diff = 0;
      for (let i = 0; i < a.rgba.length; i += 4)
        if (a.rgba[i] !== b.rgba[i] || a.rgba[i + 1] !== b.rgba[i + 1] || a.rgba[i + 2] !== b.rgba[i + 2]) diff++;
      console.log(`  puste mieszkania: worker i główny wątek, różnych pikseli: ${diff}`);
      if (diff) throw new Error(`obraz z workerów i z głównego wątku różni się w ${diff} pikselach`);
    },
  },
  {
    // Mac: Ctrl+klik to prawy przycisk, dwa palce na gładziku przesuwają mapę, szczypanie (wheel z ctrlKey
    // w Chrome i Firefoksie, gesturechange w Safari) i kółko myszy przybliżają
    name: 'mysz-mac',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const cardShown = () =>
        page
          .waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 })
          .then(() => true)
          .catch(() => false);
      const [px, py] = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
        return zm.screenOf(p.x, p.y - 0.6);
      });
      await page.mouse.click(px, py);
      if (!(await cardShown())) throw new Error('kliknięcie nie zaznaczyło nikogo z zarządu');
      // Ctrl+klik w suche drzewo: menu poleceń jak prawy przycisk, zaznaczenie zostaje
      const tree = await page.evaluate(() => {
        const zm = window.zm!;
        const t = zm.sim!.w.trees[zm.sim!.w.dryTree];
        zm.setCam(t.x, t.y - 1, 1.3);
        return [t.x, t.y] as [number, number];
      });
      await waitIdle(page);
      const [tx, ty] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.3), tree);
      await page.keyboard.down('Control');
      await page.mouse.click(tx, ty);
      await page.keyboard.up('Control');
      const menu = await page.evaluate(() => ({
        open: !document.getElementById('ctx')!.hidden,
        items: [...document.querySelectorAll('#ctx .ctx-item')].map((b) => b.textContent ?? ''),
        card: !document.getElementById('card')!.hidden,
      }));
      console.log(
        `  Ctrl+klik w suche drzewo: menu ${menu.open ? menu.items.join(' | ') : 'zamknięte'}, zaznaczenie ${menu.card ? 'zostało' : 'zgubione'}`,
      );
      if (!menu.open || !menu.items.some((t) => t.startsWith('Ściąć drzewo')))
        throw new Error('Ctrl+klik nie otworzył menu poleceń');
      if (!menu.card) throw new Error('Ctrl+klik zgubił zaznaczenie');
      await page.screenshot({ path: path.join(OUT, 'mysz-mac-menu.png') });
      await page.keyboard.press('Escape');
      // zdarzenia wheel i gest Safari na środku mapy (Playwright nie ma gładzika ani Safari)
      const wheel = (o: { dx?: number; dy?: number; mode?: number; ctrl?: boolean }) =>
        page.evaluate((o) => {
          const c = document.querySelector('#stage canvas')!;
          const r = c.getBoundingClientRect();
          c.dispatchEvent(
            new WheelEvent('wheel', {
              deltaX: o.dx ?? 0,
              deltaY: o.dy ?? 0,
              deltaMode: o.mode ?? 0,
              ctrlKey: !!o.ctrl,
              clientX: r.left + r.width / 2,
              clientY: r.top + r.height / 2,
              bubbles: true,
              cancelable: true,
            }),
          );
          const cam = window.zm!.view.cam;
          return { x: cam.x, y: cam.y, zoom: cam.zoom };
        }, o);
      const cam = () => page.evaluate(() => ({ ...window.zm!.view.cam }));
      const c0 = await cam();
      // szczypanie w Chrome i Firefoksie: wheel z ctrlKey przybliża
      const c1 = await wheel({ dy: -8, ctrl: true });
      // gładzik: mała delta i delta w poziomie przesuwają mapę bez zmiany zoomu
      await wheel({ dy: 6 });
      const c2 = await wheel({ dx: 30, dy: 2 });
      // kółko myszy po przerwie w geście gładzika: deltaY 100 oddala, -100 przybliża
      await page.waitForTimeout(400);
      const c3 = await wheel({ dy: 100 });
      const c4 = await wheel({ dy: -100 });
      // Firefox z kółkiem: linie
      await page.waitForTimeout(50);
      const c5 = await wheel({ dy: -3, mode: 1 });
      // Safari: gesturestart, gesturechange ze scale, gestureend (z preventDefault, żeby nie rosła cała strona)
      const g = await page.evaluate(() => {
        const c = document.querySelector('#stage canvas')!;
        const r = c.getBoundingClientRect();
        const ev = (type: string, scale: number) => {
          const e = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(e, { scale, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
          c.dispatchEvent(e);
          return e.defaultPrevented;
        };
        const z0 = window.zm!.view.cam.zoom;
        const p0 = ev('gesturestart', 1);
        const p1 = ev('gesturechange', 1.5);
        const z1 = window.zm!.view.cam.zoom;
        const p2 = ev('gestureend', 1.5);
        return { z0, z1, prevented: p0 && p1 && p2 };
      });
      const f = (n: number) => n.toFixed(3);
      console.log(
        `  zoom: start ${f(c0.zoom)}, szczypanie ${f(c1.zoom)}, gładzik ${f(c2.zoom)} (mapa o ${Math.round(Math.hypot(c2.x - c1.x, c2.y - c1.y))} px świata), kółko +100 ${f(c3.zoom)}, -100 ${f(c4.zoom)}, linie ${f(c5.zoom)}, Safari ${f(g.z0)} → ${f(g.z1)}`,
      );
      if (!(c1.zoom > c0.zoom)) throw new Error('wheel z ctrlKey (szczypanie) nie przybliżył');
      if (c2.zoom !== c1.zoom || (c2.x === c1.x && c2.y === c1.y))
        throw new Error('gładzik zmienił zoom albo nie przesunął mapy');
      if (!(c3.zoom < c2.zoom) || !(c4.zoom > c3.zoom)) throw new Error('kółko myszy (deltaY ±100) nie zmienia zoomu');
      if (!(c5.zoom > c4.zoom)) throw new Error('kółko w liniach nie przybliżyło');
      if (!(g.z1 > g.z0 * 1.4) || !g.prevented)
        throw new Error('gest Safari (gesturechange) nie przybliżył albo nie zablokował strony');
    },
  },
  {
    // telefon: palec przesuwa mapę, dwa palce przybliżają w punkcie między palcami i przesuwają mapę, a gesty
    // Safari z iPhone'a (idą razem z dotykiem) nie przybliżają drugi raz, tylko blokują przybliżanie strony
    name: 'dotyk-szczypanie',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const s = document.getElementById('stage')!.getBoundingClientRect();
        return { x: s.left, y: s.top, w: s.width, h: s.height };
      });
      // środek mapy: punkty CDP są na ekranie, a toWorld liczy od rogu mapy
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const cam = () => page.evaluate(() => ({ ...window.zm!.view.cam }));
      const worldAt = (x: number, y: number) =>
        page.evaluate(([x, y]) => window.zm!.view.toWorld(x, y), [x - r.x, y - r.y] as [number, number]);
      const cdp = await page.context().newCDPSession(page);
      /** palce przez CDP jak z telefonu: każdy od a[i] do b[i] w 10 krokach; step(k) po starcie i każdym kroku */
      const touch = async (a: [number, number][], b: [number, number][], step?: (k: number) => Promise<void>) => {
        const n = 10;
        const at = (k: number) =>
          a.map(([x, y], id) => ({ id, x: x + ((b[id][0] - x) * k) / n, y: y + ((b[id][1] - y) * k) / n }));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
        await step?.(0);
        for (let k = 1; k <= n; k++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
          await step?.(k);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const c0 = await cam();
      // jeden palec: mapa jedzie za palcem, przybliżenie bez zmian
      await touch([[cx, cy - 75]], [[cx, cy + 75]]);
      const c1 = await cam();
      const drag = Math.round((c0.y - c1.y) * c0.zoom);
      // dwa palce rozsuwane ze 100 na 200 px: przybliżenie ×2, a punkt między palcami zostaje pod palcami
      const w0 = await worldAt(cx, cy);
      await touch(
        [
          [cx - 50, cy],
          [cx + 50, cy],
        ],
        [
          [cx - 100, cy],
          [cx + 100, cy],
        ],
      );
      const c2 = await cam();
      const w1 = await worldAt(cx, cy);
      const slip = Math.round(Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) * c2.zoom);
      await page.screenshot({ path: path.join(OUT, 'dotyk-szczypanie-blisko.png') });
      // dwa palce razem w bok: mapa jedzie, przybliżenie bez zmian
      await touch(
        [
          [cx - 60, cy],
          [cx + 60, cy],
        ],
        [
          [cx + 20, cy],
          [cx + 140, cy],
        ],
      );
      const c3 = await cam();
      const pan2 = Math.round((c2.x - c3.x) * c2.zoom);
      // iPhone: Safari wysyła przy szczypaniu też gesturestart, gesturechange i gestureend. Scale celowo inny niż
      // palce (3 zamiast 0,5): gdyby gest przybliżał, zoom poszedłby za nim. Ruch palców Chromium oddaje stronie
      // w następnej klatce, więc gest idzie klatkę po ruchu (jak w Safari, po zdarzeniach dotyku)
      const gesture = (type: string, scale: number) =>
        page.evaluate(
          ({ type, scale, x, y }) => {
            const e = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(e, { scale, clientX: x, clientY: y });
            const z = window.zm!.view.cam.zoom;
            document.querySelector('#stage canvas')!.dispatchEvent(e);
            return { prevented: e.defaultPrevented, changed: window.zm!.view.cam.zoom !== z };
          },
          { type, scale, x: cx, y: cy },
        );
      const gestures: { prevented: boolean; changed: boolean }[] = [];
      await touch(
        [
          [cx - 100, cy],
          [cx + 100, cy],
        ],
        [
          [cx - 50, cy],
          [cx + 50, cy],
        ],
        async (k) => {
          await frames(page, 1);
          gestures.push(await gesture(k ? 'gesturechange' : 'gesturestart', k ? 3 : 1));
        },
      );
      gestures.push(await gesture('gestureend', 3));
      await frames(page, 1);
      const c4 = await cam();
      const prevented = gestures.every((g) => g.prevented);
      const zoomed = gestures.filter((g) => g.changed).length;
      // po szczypaniu stuknięcie w osobę dalej zaznacza
      const pawn = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
        zm.setCam(p.x, p.y, 1);
        return [p.x, p.y] as [number, number];
      });
      await waitIdle(page);
      const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.6), pawn);
      await page.touchscreen.tap(sx, sy);
      const card = await page
        .waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      await cdp.detach();
      const f = (n: number) => n.toFixed(3);
      console.log(
        `  palec: mapa o ${drag} px, zoom ${f(c0.zoom)} → ${f(c1.zoom)}; szczypanie ${f(c1.zoom)} → ${f(c2.zoom)}, punkt między palcami przesunął się o ${slip} px; dwa palce w bok: mapa o ${pan2} px, zoom ${f(c3.zoom)}; iPhone z gestami ${f(c3.zoom)} → ${f(c4.zoom)}, gestów, które zmieniły zoom: ${zoomed} z ${gestures.length}, strona zablokowana: ${prevented}; stuknięcie po szczypaniu zaznacza: ${card}`,
      );
      if (drag < 120 || c1.zoom !== c0.zoom) throw new Error('palec nie przesunął mapy albo zmienił przybliżenie');
      if (Math.abs(c2.zoom / c1.zoom - 2) > 0.05) throw new Error('rozsunięcie palców ×2 nie przybliżyło ×2');
      if (slip > 2) throw new Error('szczypanie nie trzyma punktu między palcami');
      if (pan2 < 60 || c3.zoom !== c2.zoom) throw new Error('dwa palce w bok nie przesunęły mapy albo zmieniły zoom');
      if (zoomed || Math.abs(c4.zoom / c3.zoom - 0.5) > 0.03)
        throw new Error('przy palcach na mapie gest Safari zmienił przybliżenie (drugi raz)');
      if (!prevented) throw new Error('gest Safari na telefonie nie zablokował przybliżania strony');
      if (!card) throw new Error('po szczypaniu stuknięcie nie zaznaczyło osoby');
    },
  },
  {
    // pozy prac M2 w mieszkaniu zarządu: przeszukuje na kolanach, naprawia okno młotkiem, niesie deski,
    // śpi na górnym łóżku piętrowym
    name: 'm2-pozy',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await m2PoseStage(page, 'dom');
      await waitIdle(page);
      await poseCheck(page, ['search', 'hammer', 'planks', 'lie']);
    },
  },
  {
    // pozy prac M2 na podwórku: grządki na kolanach, zasieki młotkiem, niesie złom, wartownik drzemie
    name: 'm2-pozy-podworko',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await m2PoseStage(page, 'podworko');
      await waitIdle(page);
      await poseCheck(page, ['search', 'hammer', 'scrap', 'doze']);
    },
  },
  {
    // przyjęci (praca 'arrive' z symulacji) idą zza bramy do mieszkań jak każdy mieszkaniec: widać ich, chód
    name: 'm2-przyjeci',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
      await waitIdle(page);
      const got = await page.evaluate(async () => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const w = sim.w;
        const size = w.size;
        const g = w.fence.gate;
        const yard = new Set(w.fence.yard);
        // dwa kafelki za bramą, po stronie ulicy
        const out = [
          [g.x, g.y - 2],
          [g.x, g.y + 2],
          [g.x - 2, g.y],
          [g.x + 2, g.y],
        ].find(([x, y]) => !yard.has(y * size + x) && !sim.blocked[y * size + x])!;
        const res = st.pawns.filter((p) => p.kind === 'resident').slice(0, 2);
        res.forEach((p, k) => {
          const dest = Math.floor(p.y) * size + Math.floor(p.x);
          Object.assign(p, {
            x: out[0] + 0.5 + k,
            y: out[1] + 0.5,
            path: [],
            pi: 0,
            job: {
              t: 'arrive',
              target: -1,
              tile: dest,
              phase: 0,
              from: -1,
              t0: st.tick,
              until: st.tick,
              order: false,
              n: 0,
              what: '',
            },
          });
        });
        for (let k = 0; k < 30; k++) sim.step();
        zm.setCam(g.x + 1, g.y + 0.5, 2.2);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const sprites = (
          zm.view as unknown as {
            pawnSprites: Map<number, { visible: boolean; texture: { frame: { x: number; y: number } } }>;
          }
        ).pawnSprites;
        return res.map((p) => {
          const sp = sprites.get(p.id)!;
          return {
            x: sp.texture.frame.x,
            y: sp.texture.frame.y,
            visible: sp.visible,
            moving: p.pi < p.path.length,
            job: p.job?.t ?? '',
          };
        });
      });
      await waitIdle(page);
      const poses = got.map((g) => poseAt(g.x, g.y));
      console.log(
        `  przyjęci: ${got.map((g, k) => `${g.job} ${poses[k]}${g.moving ? ' w drodze' : ''}${g.visible ? '' : ' niewidoczny'}`).join(', ')}`,
      );
      if (
        got.length < 2 ||
        got.some((g) => !g.visible || g.job !== 'arrive' || !g.moving) ||
        poses.some((q) => q !== 'walk')
      )
        throw new Error('przyjęci nie idą jak mieszkańcy');
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
      // koszty i czasy z symulacji (stroi je bot), więc porównuję z BUILDS, a nie z liczbami wpisanymi tutaj
      const { BUILDS } = await import('../src/sim/budowle.ts');
      const { costText, workText } = await import('../src/ui/budowa.ts');
      const check = (m: Awaited<ReturnType<typeof menu>>) => {
        if (m.cats.join('|') !== 'Pomieszczenie|Podwórko|Obwód') throw new Error(`kategorie: ${m.cats.join(', ')}`);
        if (m.items.length !== 6) throw new Error(`budowli w menu: ${m.items.length}`);
        for (const b of m.items) {
          const d = Object.values(BUILDS).find((x) => x.name === b.name);
          if (!d) throw new Error(`nieznana budowla: ${b.name}`);
          if (!b.meta.includes(costText(d.cost)) || !b.meta.includes(workText(d.work)) || !b.effect)
            throw new Error(`${b.name}: koszt, czas albo działanie nie jak w BUILDS (${b.meta})`);
          if (b.ok !== b.button || (!b.ok && !b.why)) throw new Error(`${b.name}: niedostępna bez powodu`);
        }
      };
      // start gry: zapas nie starcza na nic, każda budowla wyszarzona z powodem
      await page.click('#btnBuild');
      await page.waitForSelector('#sheet .bcat');
      const m0 = await menu();
      for (const b of m0.items) console.log(`  start, ${b.name}: ${b.ok ? 'można' : b.why} (${b.meta})`);
      check(m0);
      if (m0.items.some((b) => b.ok)) throw new Error('na starcie gry coś da się postawić, a koszty są z bota');
      await page.screenshot({ path: path.join(OUT, 'm2-menu-budowy-start.png') });
      await page.keyboard.press('Escape');
      // zapas dokładnie na warsztat: warsztat i tańsze można, magazyn (więcej desek) dalej z powodem
      await stockUp(page, BUILDS.warsztat.cost);
      await page.keyboard.press('b');
      await page.waitForSelector('#sheet .bcat');
      const m = await menu();
      for (const b of m.items) console.log(`  z zapasem na warsztat, ${b.name}: ${b.ok ? 'można' : b.why}`);
      check(m);
      const by = (name: string) => m.items.find((b) => b.name === name)!;
      if (!by(BUILDS.warsztat.name).ok || by(BUILDS.magazyn.name).ok)
        throw new Error('przy zapasie na warsztat warsztat niedostępny albo magazyn dostępny');
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
      // zapas na warsztat (koszty z bota są wyższe niż zapas na starcie)
      const { BUILDS } = await import('../src/sim/budowle.ts');
      await stockUp(page, BUILDS.warsztat.cost);
      const choose = async (kind: string) => {
        await page.keyboard.press('b');
        await page.waitForSelector('#sheet .bcat');
        await page.click(`#sheet [data-act="build"][data-arg="${kind}"]`);
      };
      const state = () =>
        page.evaluate(() => {
          // podgląd z rysowania: co dostał view.setPlacement i czy duch stoi na mapie; duch z DOM to atrapa
          const b = window.zm!.view.builds as unknown as {
            placement: { kind: string; x: number; y: number; ok: boolean; tiles?: { ok?: readonly number[] } } | null;
            ghost: { visible: boolean };
          };
          const v = b.placement;
          return {
            p: window.zm!.placing(),
            view: v && { kind: v.kind, x: v.x, y: v.y, ok: v.ok, tiles: v.tiles?.ok?.length ?? 0 },
            drawn: b.ghost.visible,
            dom: !document.getElementById('ghost')!.hidden,
            bar: !document.getElementById('placeBar')!.hidden,
            text: document.getElementById('placeText')!.textContent ?? '',
          };
        });
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
      console.log(
        `  dobre miejsce ${spot.join(',')}: ${good.text} (podgląd ${JSON.stringify(good.view)}, duch na mapie: ${good.drawn}, atrapa z DOM: ${good.dom ? 'widoczna' : 'schowana'})`,
      );
      if (
        !good.p?.ok ||
        !good.view?.ok ||
        good.view.kind !== 'warsztat' ||
        good.view.x !== spot[0] ||
        good.view.y !== spot[1]
      )
        throw new Error('podgląd na dozwolonym miejscu nie jest zielony albo stoi gdzie indziej');
      if (good.view.tiles < 1 || !good.drawn || good.dom || !good.bar)
        throw new Error('podgląd bez dozwolonych kafelków, bez ducha na mapie albo z atrapą z DOM');
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-dobrze.png') });
      // podwórko nie jest pokojem: duch czerwony, a pasek mówi czemu
      const yard = await page.evaluate(() => window.zm!.sim!.w.fence.yard[0]);
      await point(yard % size, Math.floor(yard / size));
      const bad = await state();
      console.log(`  podwórko: ${bad.text}`);
      if (bad.p?.ok || bad.view?.ok !== false || !bad.drawn || bad.dom)
        throw new Error('podgląd poza pokojem nie jest czerwony albo została atrapa z DOM');
      // powód z canPlace symulacji („Tylko w pokoju w naszym mieszkaniu.”) stoi na pasku
      const why = (bad.p?.why ?? '').replace(/\.$/, '').toLowerCase();
      if (!why || !bad.text.toLowerCase().includes(why)) throw new Error('pasek nie mówi, czemu tu nie wolno');
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-zle.png') });
      await page.keyboard.press('r');
      if ((await state()).p?.rot !== 1) throw new Error('R nie obrócił planu');
      await page.mouse.click(sx, sy, { button: 'right' });
      await frames(page, 2);
      const off = await state();
      if (off.p || off.bar) throw new Error('prawy klik nie anulował planu');
      if (off.view || off.drawn) throw new Error('po anulowaniu podgląd został na mapie');
      await choose('warsztat');
      await page.keyboard.press('Escape');
      if ((await state()).p) throw new Error('Esc nie anulował planu');
      // Ctrl+klik (Mac: prawy przycisk na gładziku) anuluje plan jak prawy klik i nie otwiera menu poleceń
      await choose('warsztat');
      const [kx, ky] = await point(spot[0], spot[1]);
      await page.keyboard.down('Control');
      await page.mouse.click(kx, ky);
      await page.keyboard.up('Control');
      await frames(page, 2);
      const ctrl = await page.evaluate(() => ({
        placing: !!window.zm!.placing(),
        menu: !document.getElementById('ctx')!.hidden,
        cmds: window.zm!.sim!.st.cmds.filter((c) => (c as { t: string }).t === 'build').length,
      }));
      console.log(
        `  Ctrl+klik: plan ${ctrl.placing ? 'został' : 'anulowany'}, menu poleceń ${ctrl.menu ? 'otwarte' : 'zamknięte'}, postawionych ${ctrl.cmds}`,
      );
      if (ctrl.placing || ctrl.menu || ctrl.cmds) throw new Error('Ctrl+klik nie anulował planu jak prawy klik');
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
      // plan w grze (chwila symulacji): z zaznaczoną osobą prawy klik na planie daje „Odwołać plan”, a „Budować
      // warsztat” wtedy, gdy symulacja je przyjmie (materiału starczy, nikt inny przy planie nie pracuje)
      const prompt = await page.evaluate(() => window.zm!.ff(1));
      if (prompt) throw new Error(`minuta gry otworzyła okno: ${prompt}`);
      const pawn = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
        zm.setCam(p.x, p.y, 1.6);
        return { id: p.id, x: p.x, y: p.y };
      });
      await waitIdle(page);
      const [qx, qy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.6), [pawn.x, pawn.y]);
      await page.mouse.click(qx, qy);
      await page.waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 });
      const [rx, ry] = await point(spot[0], spot[1]);
      await page.mouse.click(rx, ry, { button: 'right' });
      await page.waitForSelector('#ctx:not([hidden])');
      const planMenu = await page.evaluate((who) => {
        const plan = window.zm!.sim!.st.builds.find((b) => b.kind === 'warsztat');
        return {
          items: [...document.querySelectorAll('#ctx .ctx-item')].map((b) => b.textContent ?? ''),
          by: plan ? plan.by : -2,
          free: !!plan && (plan.by < 0 || plan.by === who),
        };
      }, pawn.id);
      console.log(`  menu na planie: ${planMenu.items.join(' | ')} (pracuje przy nim: ${planMenu.by})`);
      if (planMenu.by === -2) throw new Error('planu warsztatu nie ma w grze po chwili symulacji');
      if (!planMenu.items.some((t) => t.startsWith('Odwołać plan')))
        throw new Error('w menu planu nie ma „Odwołać plan”');
      if (planMenu.free !== planMenu.items.some((t) => t.startsWith('Budować warsztat')))
        throw new Error('„Budować warsztat” w menu planu nie zgadza się z tym, czy symulacja je przyjmie');
      await page.screenshot({ path: path.join(OUT, 'm2-stawianie-plan-menu.png') });
      await page.click('#ctx .ctx-item:has-text("Odwołać plan")');
      await page.evaluate(() => window.zm!.ff(1));
      if (await page.evaluate(() => window.zm!.sim!.st.builds.some((b) => b.kind === 'warsztat')))
        throw new Error('„Odwołać plan” nie usunął planu');
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
      // zapas na zasieki (koszty z bota są wyższe niż zapas na starcie)
      const { BUILDS } = await import('../src/sim/budowle.ts');
      await stockUp(page, BUILDS.zasieki.cost);
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
      const size = await page.evaluate(() => window.zm!.sim!.w.size);
      // stuknięcie w złe miejsce (podwórko, a zasieki stoją tylko na siatce): powód nad paskiem stawiania, nie pod nim
      const yard = await page.evaluate(() => window.zm!.sim!.w.fence.yard[0]);
      await page.evaluate(([x, y]) => window.zm!.setCam(x + 0.5, y + 0.5, 1.6), [yard % size, Math.floor(yard / size)]);
      await waitIdle(page);
      const [bx, by] = await page.evaluate(
        ([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5),
        [yard % size, Math.floor(yard / size)],
      );
      await page.touchscreen.tap(bx, by);
      // podpowiedź odświeża się co 200 ms, a wcześniej wisi jeszcze „Budowa anulowana.” z przycisku Anuluj
      await page
        .waitForFunction(
          () => {
            const t = document.getElementById('hint')!.textContent;
            return !!t && t !== 'Budowa anulowana.';
          },
          null,
          { timeout: 2000 },
        )
        .catch(() => null);
      const why = await page.evaluate(() => {
        const h = document.getElementById('hint')!;
        const b = document.getElementById('placeBar')!.getBoundingClientRect();
        return { text: h.textContent ?? '', bottom: h.getBoundingClientRect().bottom, barTop: b.top };
      });
      console.log(
        `  stuknięcie w podwórko: „${why.text}”, podpowiedź kończy się na ${Math.round(why.bottom)} px, pasek zaczyna na ${Math.round(why.barTop)} px`,
      );
      if (!why.text || why.text === 'Budowa anulowana.' || !(await placing()))
        throw new Error('stuknięcie w złe miejsce nie powiedziało czemu albo zgubiło plan');
      if (why.bottom > why.barTop) throw new Error('powód odmowy chowa się pod paskiem stawiania');
      const p = (await placing())!;
      const spot = [p.first % size, Math.floor(p.first / size)] as const;
      await page.evaluate(([x, y]) => window.zm!.setCam(x + 0.5, y + 2, 1.6), spot);
      await waitIdle(page);
      // na telefonie też podgląd z rysowania (celownik na środku ekranu), a atrapa z DOM schowana
      const shown = await page.evaluate(() => {
        const b = window.zm!.view.builds as unknown as {
          placement: { kind: string; tiles?: { ok?: readonly number[] } } | null;
          ghost: { visible: boolean };
        };
        return {
          kind: b.placement?.kind,
          tiles: b.placement?.tiles?.ok?.length ?? 0,
          drawn: b.ghost.visible,
          dom: !document.getElementById('ghost')!.hidden,
        };
      });
      console.log(`  podgląd na telefonie: ${JSON.stringify(shown)}`);
      if (shown.kind !== 'zasieki' || shown.tiles < 1 || !shown.drawn || shown.dom)
        throw new Error('na telefonie nie ma podglądu z rysowania albo została atrapa z DOM');
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
      // liczby jak w stanie gry: uszkodzenia bez fixed (st.damage) i pomieszczenia mieszkania bez klatki
      const nums = await page.evaluate((apt) => {
        const zm = window.zm!;
        return {
          damaged: zm.sim!.st.damage.filter((d) => d.apt === apt && !d.fixed).length,
          rooms: zm.sim!.w.interior.rooms.filter((r) => r.apt === apt && r.kind !== 'klatka').length,
        };
      }, target.apt);
      for (const want of [
        `Mieszkanie ${target.apt + 1}`,
        'Puste od',
        `Do naprawy (${nums.damaged})`,
        `Przeszukane: 0 z ${nums.rooms}`,
        'Prawy przycisk w mieszkaniu',
      ])
        if (!card.includes(want)) throw new Error(`karta mieszkania bez „${want}”`);
      await page.screenshot({ path: path.join(OUT, 'm2-karta-mieszkania-karta.png') });
      // karta idzie za stanem gry: przeszukany pokój i naprawione uszkodzenie widać przy następnym odświeżeniu
      await page.evaluate((apt) => {
        const zm = window.zm!;
        const room = zm.sim!.w.interior.rooms.find((r) => r.apt === apt && r.kind === 'pokoj')!;
        zm.sim!.st.apts.find((a) => a.apt === apt)!.searched.push(room.id);
        zm.sim!.st.damage.find((d) => d.apt === apt && !d.fixed)!.fixed = true;
      }, target.apt);
      const after = await page
        .waitForFunction(
          (rooms) => {
            const t = document.getElementById('card')!.textContent ?? '';
            return t.includes(`Przeszukane: 1 z ${rooms}`) && t.includes('naprawione') ? t : '';
          },
          nums.rooms,
          { timeout: 3000 },
        )
        .then((h) => h.jsonValue())
        .catch(() => '');
      console.log(`  po przeszukaniu pokoju i naprawie: ${after ? 'karta odświeżona' : 'karta bez zmian'}`);
      if (!after) throw new Error('karta mieszkania nie poszła za stanem gry (st.apts, st.damage)');
      const left = nums.damaged - 1;
      if (!after.includes(left ? `Do naprawy (${left})` : 'Do naprawy'))
        throw new Error(`karta mieszkania nie liczy napraw jak symulacja (zostało ${left})`);
      await page.screenshot({ path: path.join(OUT, 'm2-karta-mieszkania-postep.png') });
      // Esc zamyka kartę
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if (await page.evaluate(() => !document.getElementById('card')!.hidden))
        throw new Error('Esc nie zamknął karty mieszkania');
    },
  },
  // przyjęci przez zarząd idą zza bramy: komunikat „N osób idzie od bramy” z przyciskiem „Pokaż”, który przesuwa
  // kamerę do nich; po dojściu do mieszkań komunikat znika
  {
    name: 'm2-przybycie',
    query: '',
    run: async (page, base) => arrivals(page, base, false),
  },
  {
    name: 'm2-przybycie-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => arrivals(page, base, true),
  },
  // wydarzenia z miejsca: dym z komina pierwszego dnia w bloku i w domu, wydarzenie drugiego dnia i karta nocy w domu
  wydarzeniaDym('wydarzenia-blok-dym', 'przymorze', 'z waszej klatki', false),
  wydarzeniaDym('wydarzenia-dom-dym', 'zielonki', 'zza płotu', true),
  // drugi dzień w domu: wydarzenie „Na ulicy” i cele bez słów z bloku; cel „Przeszukajcie dom” da się zaliczyć:
  // prawy przycisk w pokoju domu komitetu daje „Przeszukać pokój”, a karta domu liczy przeszukane pomieszczenia
  {
    name: 'wydarzenia-dom-dzien2',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      await chopDryTree(page);
      // do raportu i dalej do pierwszego wydarzenia drugiego dnia od 8:00 (okna po drodze: pierwsza odpowiedź)
      let event = false;
      for (let k = 0; k < 200 && !event; k++) {
        const p = await page.evaluate(() => window.zm!.ff(15));
        const day2 = await page.evaluate(() => {
          const st = window.zm!.sim!.st;
          return st.tick >= (24 + 8 - 15) * 800;
        });
        if (p === 'wydarzenie' && day2) {
          const t = await sheetText(page);
          console.log(`  wydarzenie drugiego dnia w domu: ${t.slice(0, 160)}`);
          if (FORBIDDEN_DOM.test(t)) throw new Error(`w domu słowa z bloku: ${t}`);
          const kicker = await page.textContent('#sheet .sheet-kicker');
          if (kicker !== 'Na ulicy') throw new Error(`nagłówek okna wydarzenia w domu: ${kicker}`);
          const goals = (await page.textContent('#goals')) ?? '';
          if (BLOKOWE_UI.test(goals)) throw new Error(`cele drugiego dnia w domu ze słowami z bloku: ${goals}`);
          if (!goals.includes('Przeszukajcie dom.')) throw new Error(`w celach drugiego dnia nie ma domu: ${goals}`);
          await page.screenshot({ path: path.join(OUT, 'wydarzenia-dom-dzien2-wydarzenie.png') });
          await answerFirst(page, p);
          event = true;
        } else if (p) await answerFirst(page, p);
      }
      if (!event) throw new Error('drugiego dnia nie było wydarzenia');
      // okna, które przyszły zaraz po wydarzeniu
      for (let k = 0; k < 10; k++) {
        const p = await page.evaluate(() => window.zm!.ff(0));
        if (!p) break;
        await answerFirst(page, p);
      }
      // ktoś z komitetu (kliknięcie) i wolny kafelek pokoju w domu komitetu (prawy przycisk)
      const pawn = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        zm.setCam(p.x, p.y, 1.6);
        return { x: p.x, y: p.y };
      });
      await waitIdle(page);
      const [qx, qy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.6), [pawn.x, pawn.y]);
      await page.mouse.click(qx, qy);
      await page.waitForFunction(() => !document.getElementById('card')!.hidden, null, { timeout: 3000 });
      const spot = await page.evaluate(() => {
        const { sim } = window.zm!;
        const { w, st } = sim!;
        const it = w.interior;
        const home = st.apts.find((a) => a.state === 'zarzad')!.apt;
        const room = it.rooms.find((r) => r.apt === home && r.kind === 'pokoj')!;
        const covered = (i: number) =>
          st.things.some(
            (t) =>
              i % w.size >= t.x &&
              i % w.size < t.x + t.w &&
              Math.floor(i / w.size) >= t.y &&
              Math.floor(i / w.size) < t.y + t.h,
          );
        const tiles = [...it.room.keys()].filter((i) => it.room[i] === room.id && !w.blocked[i] && !covered(i));
        const t = tiles[Math.floor(tiles.length / 2)];
        window.zm!.setCam((t % w.size) + 0.5, Math.floor(t / w.size) + 0.5, 1.6);
        return { room: room.id, x: t % w.size, y: Math.floor(t / w.size) };
      });
      await waitIdle(page);
      const [rx, ry] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), [spot.x, spot.y]);
      await page.mouse.click(rx, ry, { button: 'right' });
      await page.waitForSelector('#ctx:not([hidden])', { timeout: 3000 });
      const menu = await page.evaluate(() => ({
        head: document.querySelector('#ctx .ctx-head')?.textContent ?? '',
        items: [...document.querySelectorAll('#ctx .ctx-item')].map((b) => b.textContent ?? ''),
      }));
      console.log(`  menu w pokoju domu: ${menu.head}: ${menu.items.join(' | ')}`);
      if (!menu.items.includes('Przeszukać pokój')) throw new Error('w pokoju domu komitetu nie ma „Przeszukać pokój”');
      if (!menu.head.endsWith(' · dom komitetu ulicy')) throw new Error(`nagłówek menu w domu: ${menu.head}`);
      const word = `${menu.head} ${menu.items.join(' ')}`.match(BLOKOWE_UI)?.[0];
      if (word) throw new Error(`menu poleceń w domu ze słowem z bloku: ${word}`);
      await page.screenshot({ path: path.join(OUT, 'wydarzenia-dom-dzien2-menu.png') });
      await page.click('#ctx .ctx-item:has-text("Przeszukać pokój")');
      // przeszukanie trwa około godziny gry; okna po drodze: pierwsza odpowiedź
      for (let k = 0; k < 40; k++) {
        if (await page.evaluate((room) => window.zm!.sim!.st.apts[0].searched.includes(room), spot.room)) break;
        const p = await page.evaluate(() => window.zm!.ff(5));
        if (p) await answerFirst(page, p);
      }
      const done = await page.evaluate(() => ({
        searched: window.zm!.sim!.st.apts[0].searched.length,
        goal: document.querySelector('#goals .goal[data-n="1"]')?.className ?? '',
        count: document.querySelector('#goals .goals-n')?.textContent ?? '',
      }));
      console.log(`  po przeszukaniu: przeszukane ${done.searched}, cel 1: ${done.goal}, cele ${done.count}`);
      if (!done.searched) throw new Error('pokój domu komitetu nie został przeszukany');
      if (!done.goal.includes('done')) throw new Error('cel „Przeszukajcie dom” nie zaliczony po przeszukaniu pokoju');
      // karta domu (lewy klik w domu z dala od ludzi zdejmuje zaznaczenie): dom komitetu, bez mieszkania,
      // z przeszukanymi pomieszczeniami
      const far = await page.evaluate(() => {
        const { w, st } = window.zm!.sim!;
        const it = w.interior;
        const t = [...it.room.keys()].find(
          (i) =>
            it.room[i] >= 0 &&
            !w.blocked[i] &&
            st.pawns.every((p) => Math.hypot(p.x - (i % w.size) - 0.5, p.y - Math.floor(i / w.size) - 0.5) > 2),
        )!;
        window.zm!.setCam((t % w.size) + 0.5, Math.floor(t / w.size) + 0.5, 1.3);
        return [t % w.size, Math.floor(t / w.size)];
      });
      await waitIdle(page);
      const [hx, hy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), far);
      await page.mouse.click(hx, hy);
      const card = await page
        .waitForFunction(
          () => {
            const t = document.getElementById('card')!.textContent ?? '';
            return t.includes('Przeszukane: 1 z') ? t : '';
          },
          null,
          { timeout: 3000 },
        )
        .then((h) => h.jsonValue())
        .catch(() => '');
      if (!card) throw new Error('karta domu nie pokazała przeszukanego pomieszczenia');
      console.log(`  karta domu: ${card.replace(/\s+/g, ' ').slice(0, 140)}`);
      if (!card.includes('Dom komitetu ulicy')) throw new Error(`karta domu bez domu komitetu: ${card}`);
      const cardWord = card.match(BLOKOWE_UI)?.[0];
      if (cardWord) throw new Error(`karta domu ze słowem z bloku: ${cardWord}`);
    },
  },
  {
    name: 'wydarzenia-dom-karta',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      await chopDryTree(page);
      for (let k = 0; k < 120; k++) {
        const p = await page.evaluate(() => window.zm!.ff(10));
        if (p === 'karta') {
          const t = await sheetText(page);
          console.log(
            `  karta nocy w domu: ${
              t
                .match(/Wyprawa[^\n]*/g)
                ?.slice(0, 2)
                .join(' | ') ?? t.slice(0, 120)
            }`,
          );
          if (BLOKOWE_UI.test(t)) throw new Error(`karta nocy w domu z blokowiskiem: ${t}`);
          if (!t.includes('opuszczony dom obok')) throw new Error('na karcie nie ma wyprawy do opuszczonego domu obok');
          if (!t.includes('Jak radzi komitet')) throw new Error('karta nocy w domu bez rady komitetu');
          return;
        }
        if (p) await answerFirst(page, p);
      }
      throw new Error('karta nocy się nie pokazała');
    },
  },
  tekstyPomoc('teksty-blok-pomoc', 'przymorze', false),
  tekstyPomoc('teksty-dom-pomoc', 'zielonki', true),
  {
    // menu budowy w domu: komitet sam przynosi materiały, łóżka piętrowe zmieszczą ludzi „w domu”
    name: 'teksty-dom-budowa',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      await page.click('#btnBuild');
      await page.waitForSelector('#sheet .bcat');
      const t = await sheetText(page);
      console.log(`  menu budowy w domu: ${t.match(/Plan stawia[^.]*\./)?.[0] ?? t.slice(0, 120)}`);
      if (BLOKOWE_UI.test(t)) throw new Error(`menu budowy w domu ze słowem z bloku: ${t.match(BLOKOWE_UI)?.[0]}`);
      if (!t.includes('w domu zmieści się więcej ludzi')) throw new Error('łóżka piętrowe w domu nie mówią o domu');
    },
  },
  {
    // ogród domu: arkusz rzeczy (sznur z praniem i bez, kompost, buda, huśtawka, ławka) w czterech ustawieniach
    name: 'ogrod-arkusz',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await ogrodStage(page, 'arkusz');
      await waitIdle(page);
      console.log(`  narysowane: ${r.drawn.join(', ')}`);
      if (r.missing.length) throw new Error(`brak w rysowaniu: ${r.missing.join(', ')}`);
    },
  },
  {
    // ogród domu w Zielonkach bez trzepaka: sznur z praniem na jego miejscu, kompost, buda, huśtawka, ławka
    name: 'ogrod-dom',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await ogrodStage(page, 'dom');
      await waitIdle(page);
      console.log(`  narysowane: ${r.drawn.join(', ')}`);
      if (r.missing.length) throw new Error(`brak w rysowaniu: ${r.missing.join(', ')}`);
    },
  },
];

/**
 * Zarząd przy pracach M2 (prace ze stanu gry jak w symulacji M2: search, repair, build, guard w fazie 4,
 * sen na łóżkach piętrowych). dom: w mieszkaniu zarządu, podworko: na podwórku i przy bramie.
 */
async function m2PoseStage(page: Page, where: 'dom' | 'podworko') {
  await page.evaluate((where) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const st = sim.st as typeof sim.st & {
      damage?: { kind: string; tile: number; apt: number; fixed: boolean; have: object }[];
      builds?: {
        id: number;
        kind: string;
        x: number;
        y: number;
        rot: number;
        need: object;
        have: object;
        work: number;
        by: number;
      }[];
    };
    const w = sim.w;
    const size = w.size;
    const int = w.interior;
    const core = st.pawns.filter((p) => p.kind === 'core');
    type Job = NonNullable<(typeof core)[number]['job']>;
    const job = (t: string, phase: number, target: number, n = 0, what = ''): Job =>
      ({
        t,
        phase,
        target,
        tile: -1,
        from: -1,
        t0: st.tick,
        until: st.tick + 99999,
        order: false,
        n,
        what,
      }) as unknown as Job;
    const put = (k: number, i: number, dir: number, j: Job | null) => {
      Object.assign(core[k], {
        x: (i % size) + 0.5,
        y: Math.floor(i / size) + 0.5,
        path: [],
        pi: 0,
        dir,
        job: j,
        carry: 0,
        wait: st.tick + 99999,
      });
    };
    const covered = (i: number) =>
      st.things.some((t) => {
        const x = i % size;
        const y = Math.floor(i / size);
        return x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
      });
    const free = (i: number) => !sim.blocked[i] && !covered(i);
    let id = 995000;
    if (where === 'dom') {
      const koza = st.things.find((t) => t.kind === 'koza')!;
      const home = int.rooms[int.room[koza.y * size + koza.x]].apt;
      // wolna posadzka (IN.FLOOR = 4) pomieszczenia danego rodzaju w mieszkaniu zarządu
      const tiles = (kind: string) => {
        const out: number[] = [];
        for (let i = 0; i < size * size; i++) {
          const r = int.room[i];
          if (r >= 0 && int.rooms[r].apt === home && int.rooms[r].kind === kind && int.cell[i] === 4 && free(i))
            out.push(i);
        }
        return out;
      };
      const room = tiles('pokoj');
      // łóżko piętrowe na dwóch wolnych kafelkach jeden pod drugim, z dala od reszty
      const bunkAt = room.find((i) => room.includes(i + size)) ?? room[0];
      const bx = bunkAt % size;
      const by = Math.floor(bunkAt / size);
      const bunk = {
        id: id++,
        kind: 'lozka_pietrowe',
        x: bx,
        y: by,
        w: 1,
        h: 2,
        rot: 0,
        n: 0,
        fuel: 0,
        by: -1,
        owner: -1,
      };
      st.things.push(bunk as (typeof st.things)[number]);
      const left = room.filter((i) => i !== bunkAt && i !== bunkAt + size && Math.abs((i % size) - bx) >= 2);
      // okno mieszkania zarządu: kafelek posadzki pod nim
      const win = int.windows.find((wi) => [wi + size, wi - size, wi + 1, wi - 1].some((j) => left.includes(j)));
      const atWin =
        win !== undefined ? [win + size, win - size, win + 1, win - 1].find((j) => left.includes(j))! : left[0];
      if (!st.damage) st.damage = [];
      const k = st.damage.push({ kind: 'okno', tile: win ?? atWin, apt: home, fixed: false, have: {} }) - 1;
      const rest = left.filter((i) => i !== atWin);
      put(0, rest[Math.floor(rest.length / 2)], 0, job('search', 1, int.room[rest[0]]));
      // twarzą do okna: okno nad, pod, po prawej albo po lewej
      const toWin = win === atWin - size ? 1 : win === atWin + 1 ? 3 : win === atWin - 1 ? 2 : 0;
      put(1, atWin, toWin, job('repair', 2, k));
      put(2, rest[rest.length - 1], 0, job('repair', 1, k, 2, 'deski'));
      put(3, bunkAt + size, 0, job('sleep', 1, bunk.id));
      zm.setCam(bx + 0.5, by + 1, 2);
    } else {
      const yard = w.fence.yard.filter(free);
      const at = (f: number) => yard[Math.floor(yard.length * f)];
      if (!st.builds) st.builds = [];
      const g = at(0.35);
      const garden = {
        id: id++,
        kind: 'ogrodek',
        x: g % size,
        y: Math.floor(g / size),
        rot: 0,
        need: {},
        have: {},
        work: 30,
        by: -1,
      };
      const wire = w.fence.tiles.find((i) => i !== w.fence.gate.y * size + w.fence.gate.x && !covered(i)) ?? at(0.8);
      const fence = {
        id: id++,
        kind: 'zasieki',
        x: wire % size,
        y: Math.floor(wire / size),
        rot: 0,
        need: {},
        have: {},
        work: 10,
        by: -1,
      };
      st.builds.push(garden, fence);
      const gx = garden.x;
      const gy = garden.y;
      put(0, (gy + 2) * size + gx + 1, 1, job('build', 2, garden.id));
      const near = yard.filter((i) => Math.abs((i % size) - fence.x) + Math.abs(Math.floor(i / size) - fence.y) === 1);
      put(1, near[0] ?? at(0.7), 0, job('build', 2, fence.id));
      put(2, (gy + 2) * size + gx + 3, 3, job('build', 1, garden.id, 2, 'zlom'));
      const gate = w.fence.gate;
      put(3, (gate.y + (gate.rot === 0 ? -1 : 1)) * size + gate.x, 0, job('guard', 4, 0));
      zm.setCam(gx + 1.5, gy + 1.5, 2);
    }
  }, where);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** słowa, których w domu jednorodzinnym nie ma w tekstach zarządu (jak FORBIDDEN_DOM w testach) */
const FORBIDDEN_DOM = /klatk|piętr|spółdziel|pawilon|szlaban|świetlic|czynsz|blok|mieszkani/i;
/** słowa z bloku, których w domu nie ma w oknach, celach, pomocy, pasku, menu budowy i poleceń i na karcie domu (jak
    BLOKOWE w tests/unit/teksty-miejsca.test.ts: także mieszkanie, bo lokum komitetu to dom; łóżka piętrowe zostają) */
const BLOKOWE_UI = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;

/** samouczek bez klikania: pierwszy z zarządu ścina suche drzewo (jak polecenie z menu) */
async function chopDryTree(page: Page) {
  await page.evaluate(() => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const who = sim.st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'select', ids: [who.id] });
    sim.push({ t: 'chop', ids: [who.id], tree: sim.w.dryTree });
  });
}

/** tytuł i treść otwartego okna */
const sheetText = (page: Page) =>
  page.evaluate(
    () =>
      `${document.querySelector('#sheet .sheet-title')?.textContent ?? ''}\n${document.querySelector('#sheet')?.textContent ?? ''}`,
  );

/** odpowiedź na okno zarządu, żeby gra szła dalej: pierwszy dostępny wybór, bez uchwały, karta jak proponuje */
async function answerFirst(page: Page, p: string) {
  if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
  else if (p === 'uchwala') await page.click('#sheet [data-act="law-skip"]');
  else if (p === 'karta') await page.click('#sheet [data-act="night-go"]');
  else if (p === 'raport') await page.click('#sheet [data-act="report-ok"]');
}

/** okno „Dym z komina” po rozpaleniu kozy pierwszego dnia, z sąsiadem z miejsca; nagłówek okna, samouczek
    i pasek według miejsca (w domu „Na ulicy”, suche drzewo w ogrodzie i komitet, w bloku osiedle i trzepak) */
function wydarzeniaDym(name: string, demo: string, from: string, dom: boolean): Shot {
  return {
    name,
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=${demo}&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      await chopDryTree(page);
      for (let k = 0; k < 80; k++) {
        const p = await page.evaluate(() => window.zm!.ff(5));
        if (p === 'wydarzenie') {
          const t = await sheetText(page);
          console.log(`  ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
          if (!t.startsWith('Dym z komina')) throw new Error(`pierwsze okno to nie dym z komina: ${t.slice(0, 80)}`);
          if (!t.includes(`pani Krysia ${from}`)) throw new Error(`w dymie nie ma sąsiadki ${from}`);
          const kicker = await page.textContent('#sheet .sheet-kicker');
          const goals = (await page.textContent('#goals')) ?? '';
          const bar = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.stat')].map((e) => e.title).join(' | '),
          );
          console.log(`  nagłówek: ${kicker}; samouczek: ${goals.match(/Wyślijcie[^.]*\./)?.[0]}`);
          if (kicker !== (dom ? 'Na ulicy' : 'Na osiedlu')) throw new Error(`nagłówek okna wydarzenia: ${kicker}`);
          if (!goals.includes(`do suchego drzewa ${dom ? 'w ogrodzie' : 'przy trzepaku'}`))
            throw new Error(`samouczek nie według miejsca: ${goals}`);
          const word = dom ? `${goals} ${bar}`.match(BLOKOWE_UI)?.[0] : undefined;
          if (word) throw new Error(`samouczek albo pasek w domu ze słowem z bloku: ${word}`);
          await waitIdle(page);
          return;
        }
        if (p) throw new Error(`przed dymem okno: ${p}`);
      }
      throw new Error('dym z komina się nie pokazał');
    },
  };
}

/** pomoc z menu według miejsca: w domu komitet ulicy, sąsiedzi i zebranie ulicy, w bloku zarząd spółdzielni
    i walne */
function tekstyPomoc(name: string, demo: string, dom: boolean): Shot {
  return {
    name,
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=${demo}&speed=0&cam=hq,1.2`);
      await waitIdle(page);
      await page.click('#btnMenu');
      await page.click('#sheet [data-act="menu-help"]');
      await page.waitForSelector('#sheet .help');
      const t = await sheetText(page);
      console.log(`  pomoc: ${t.match(/Prowadzicie[^.]*\./)?.[0] ?? t.slice(0, 120)}`);
      const word = t.match(BLOKOWE_UI)?.[0];
      if (dom && word) throw new Error(`pomoc w domu ze słowem z bloku: ${word}`);
      if (!dom && !t.includes('Prowadzicie zarząd spółdzielni'))
        throw new Error('pomoc w bloku nie mówi o spółdzielni');
      // na zrzucie część o zarządzie (w domu o komitecie) i „Na razie”
      await page.evaluate(() => document.querySelectorAll('#sheet .help-h')[2]?.scrollIntoView({ block: 'start' }));
    },
  };
}

/**
 * Rzeczy z ogrodu domu w stanie gry (st.things, jak postawi je świat): arkusz w wolnym miejscu obok
 * domu (rodzaj w wierszu, ustawienia 0–3 w kolumnach, sznur z praniem i bez) albo ogród domu bez
 * trzepaka (sznur z praniem na jego miejscu, reszta na wolnych kafelkach ogrodu). Zwraca, czego nie
 * narysowano.
 */
async function ogrodStage(page: Page, what: 'arkusz' | 'dom') {
  await page.evaluate((what) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const st = sim.st;
    const w = sim.w;
    const size = w.size;
    const view = zm.view as unknown as {
      game: { props: { kind: string; x: number; y: number; w: number; h: number }[] } | null;
    };
    const props = view.game?.props ?? [];
    const covers = (t: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
      x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
    const taken = (x: number, y: number) =>
      x < 1 ||
      y < 1 ||
      x >= size - 1 ||
      y >= size - 1 ||
      sim.blocked[y * size + x] === 1 ||
      w.bid[y * size + x] >= 0 ||
      st.things.some((t) => covers(t, x, y)) ||
      props.some((t) => covers(t, x, y));
    const fits = (x: number, y: number, bw: number, bh: number, pad = 0) => {
      for (let dy = -pad; dy < bh + pad; dy++)
        for (let dx = -pad; dx < bw + pad; dx++) if (taken(x + dx, y + dy)) return false;
      return true;
    };
    let id = 996000;
    const put = (kind: string, x: number, y: number, rot: number, n = 0) => {
      const two = kind === 'hustawka' || kind === 'lawka';
      const long = kind === 'sznur';
      const [bw, bh] = long ? (rot & 1 ? [1, 3] : [3, 1]) : two ? (rot & 1 ? [1, 2] : [2, 1]) : [1, 1];
      st.things.push({
        id: id++,
        kind,
        x,
        y,
        w: bw,
        h: bh,
        rot,
        n,
        fuel: 0,
        by: -1,
        owner: -1,
      } as (typeof st.things)[number]);
      return [bw, bh];
    };
    const hq = w.buildings[w.interior.building];
    const hx = (hq.x0 + hq.x1) / 2;
    const hy = (hq.y0 + hq.y1) / 2;
    // trawa albo park (T.GRASS = 0, T.PARK = 1): arkusz nie na drodze ani chodniku
    const green = (x: number, y: number, bw: number, bh: number) => {
      for (let dy = 0; dy < bh; dy++)
        for (let dx = 0; dx < bw; dx++) if (w.terr[(y + dy) * size + x + dx] > 1) return false;
      return true;
    };
    // drzewo (korona) nad prostokątem: wtedy przesłania rzeczy
    const underTree = (x: number, y: number, bw: number, bh: number) =>
      w.trees.some((t) => t.x > x - t.r - 1 && t.x < x + bw + t.r + 1 && t.y > y - 1 && t.y < y + bh + t.r + 2);
    // kamera na prostokąt świata, przybliżenie dobrane tak, żeby się zmieścił
    const frame = (x0: number, y0: number, x1: number, y1: number) => {
      const z = Math.min(1.5, 1440 / ((x1 - x0 + 4) * 32), 800 / ((y1 - y0 + 4) * 32));
      zm.setCam((x0 + x1) / 2, (y0 + y1) / 2 + 0.5, z);
    };
    if (what === 'arkusz') {
      // wolny prostokąt 18 × 20 kafelków trawy bez drzew, najbliżej domu
      let best: [number, number] | null = null;
      let bd = Number.POSITIVE_INFINITY;
      for (let y = 1; y < size - 21; y += 2)
        for (let x = 1; x < size - 19; x += 2) {
          const d = (x + 9 - hx) ** 2 + (y + 10 - hy) ** 2;
          if (d < bd && fits(x, y, 18, 20) && green(x, y, 18, 20) && !underTree(x, y, 18, 20)) {
            bd = d;
            best = [x, y];
          }
        }
      const [ox, oy] = best ?? [Math.round(hx) + 6, Math.round(hy)];
      const rows: [string, number][] = [
        ['sznur', 6],
        ['sznur', 0],
        ['kompost', 0],
        ['buda', 0],
        ['hustawka', 0],
        ['lawka', 0],
      ];
      let y = oy + 2;
      for (const [kind, n] of rows) {
        for (let rot = 0; rot < 4; rot++) put(kind, ox + 1 + rot * 4, y, rot, n);
        y += kind === 'sznur' ? 4 : 3;
      }
      frame(ox, oy, ox + 17, y);
    } else {
      // trzepak znika z podglądu, sznur z praniem staje w jego miejscu (ten sam obrys 3 × 1)
      const trz = props.find((p) => p.kind === 'trzepak');
      if (view.game) view.game.props = props.filter((p) => p.kind !== 'trzepak');
      const yard = [...w.fence.yard].map((i) => [i % size, Math.floor(i / size)] as [number, number]);
      // odległość od ściany domu (prostokąt budynku) w kafelkach
      const gap = (x: number, y: number) => Math.max(hq.x0 - x, 0, x - hq.x1) + Math.max(hq.y0 - y, 0, y - hq.y1);
      // plecami do domu: rot to strona, po której jest dom
      const backTo = (x: number, y: number) => {
        const dx = x - hx;
        const dy = y - hy;
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 0 : 2;
      };
      const size2 = (kind: string, rot: number) =>
        kind === 'hustawka' || kind === 'lawka' ? (rot & 1 ? [1, 2] : [2, 1]) : [1, 1];
      const placed: [number, number, number, number][] = [];
      if (trz) {
        put('sznur', trz.x, trz.y, trz.w >= trz.h ? 0 : 1, 7);
        placed.push([trz.x, trz.y, trz.x + trz.w, trz.y + trz.h]);
      }
      // buda i ławka przy ścianie domu, huśtawka na trawniku dalej, kompost w najdalszym kącie
      const plan: [string, (x: number, y: number) => boolean, 'blisko' | 'daleko'][] = [
        ['buda', (x, y) => gap(x, y) === 2, 'blisko'],
        ['lawka', (x, y) => gap(x, y) === 2, 'blisko'],
        ['hustawka', (x, y) => gap(x, y) >= 4 && gap(x, y) <= 7, 'blisko'],
        ['kompost', () => true, 'daleko'],
      ];
      for (const [kind, ok, how] of plan) {
        const cands = yard
          .filter(([x, y]) => ok(x, y))
          .map(([x, y]) => {
            const rot = kind === 'hustawka' || kind === 'kompost' ? 0 : backTo(x, y);
            const [bw, bh] = size2(kind, rot);
            return { x, y, rot, bw, bh, d: gap(x, y) };
          })
          .filter((c) => fits(c.x, c.y, c.bw, c.bh, 1))
          .sort((a, b) => (how === 'daleko' ? b.d - a.d : a.d - b.d) || a.y - b.y || a.x - b.x);
        const c = cands[0];
        if (!c) continue;
        put(kind, c.x, c.y, c.rot);
        placed.push([c.x, c.y, c.x + c.bw, c.y + c.bh]);
      }
      const xs = placed.flatMap((p) => [p[0], p[2]]).concat([hq.x0, hq.x1]);
      const ys = placed.flatMap((p) => [p[1], p[3]]).concat([hq.y0, hq.y1]);
      frame(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    }
  }, what);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => {
    const keys = [...(window.zm!.view as unknown as { things: Map<string, unknown> }).things.keys()];
    const kinds = ['sznur', 'kompost', 'buda', 'hustawka', 'lawka'];
    const drawn = kinds.map((k) => `${k} ${keys.filter((key) => key.includes(`"kind":"${k}"`)).length}`);
    const missing = kinds.filter((k) => !keys.some((key) => key.includes(`"kind":"${k}"`)));
    return { drawn, missing };
  });
}

/** kamera na uszkodzoną podłogę (atrapa) w pustym mieszkaniu o danej przyczynie */
function m2Floor(name: string, why: string): Shot {
  return {
    name,
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.2&mieszkania=atrapa`);
      await waitIdle(page);
      const ok = await page.evaluate((why) => {
        const zm = window.zm!;
        const v = zm.view as unknown as {
          scene: {
            section: { damage?: Map<number, string>; why?: Map<number, string>; room: Int16Array; roomApt?: number[] };
            w: { size: number };
          };
        };
        const sec = v.scene.section;
        const size = v.scene.w.size;
        const hit = [...sec.damage!.entries()].find(
          ([i, k]) => k === 'podloga' && sec.why!.get(sec.roomApt![sec.room[i]]) === why,
        );
        if (hit) zm.setCam((hit[0] % size) + 0.5, Math.floor(hit[0] / size) + 0.5, 1.9);
        return !!hit;
      }, why);
      await waitIdle(page);
      if (!ok) throw new Error(`brak uszkodzonej podłogi w mieszkaniu (${why})`);
    },
  };
}

/**
 * Atrapy M2 w stanie gry: gotowe budowle (rzeczy w st.things), plany (st.builds) i podgląd stawiania.
 * Budowle w mieszkaniu zarządu na wolnych kafelkach posadzki pokoju i kuchni, ogródek na podwórku,
 * zasieki zamiast odcinka siatki.
 */
async function m2Stage(page: Page, what: 'budowle' | 'plany' | 'stawianie-ok' | 'stawianie-zle') {
  return page.evaluate((what) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const st = sim.st;
    const w = sim.w;
    const size = w.size;
    const int = w.interior;
    const koza = st.things.find((t) => t.kind === 'koza')!;
    const home = int.rooms[int.room[koza.y * size + koza.x]].apt;
    const busy = new Set<number>();
    for (const t of st.things)
      for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) busy.add((t.y + dy) * size + t.x + dx);
    const yard = new Set(w.fence.yard);
    const fits = (x: number, y: number, fw: number, fh: number, ok: (i: number) => boolean) => {
      for (let dy = 0; dy < fh; dy++)
        for (let dx = 0; dx < fw; dx++) {
          const i = (y + dy) * size + x + dx;
          if (busy.has(i) || !ok(i)) return false;
        }
      return true;
    };
    const roomOk = (kind: string) => (i: number) =>
      int.cell[i] === 4 &&
      int.room[i] >= 0 &&
      int.rooms[int.room[i]].apt === home &&
      int.rooms[int.room[i]].kind === kind;
    const spot = (fw: number, fh: number, ok: (i: number) => boolean) => {
      for (let y = 0; y < size - fh; y++) for (let x = 0; x < size - fw; x++) if (fits(x, y, fw, fh, ok)) return [x, y];
      return null;
    };
    // z kafelkiem odstępu, żeby budowle nie stały jedna na drugiej
    const take = (x: number, y: number, fw: number, fh: number) => {
      for (let dy = -1; dy <= fh; dy++) for (let dx = -1; dx <= fw; dx++) busy.add((y + dy) * size + x + dx);
    };
    const list: [string, number, number, number, (i: number) => boolean][] = [
      ['warsztat', 2, 1, 0, roomOk('pokoj')],
      ['lozka_pietrowe', 1, 2, 0, roomOk('pokoj')],
      ['magazyn', 2, 2, 0, roomOk('pokoj')],
      ['kuchnia_spoleczna', 2, 1, 0, (i) => roomOk('kuchnia')(i) || roomOk('pokoj')(i)],
      ['ogrodek', 3, 2, 0, (i) => yard.has(i) && !w.blocked[i]],
    ];
    const placed: string[] = [];
    let id = 995000;
    const plans: unknown[] = [];
    for (const [kind, fw, fh, rot, ok] of what === 'budowle' || what === 'plany' ? list : []) {
      const at = spot(fw, fh, ok) ?? spot(fh, fw, ok);
      if (!at) continue;
      const turned = !fits(at[0], at[1], fw, fh, ok);
      const [ww, hh] = turned ? [fh, fw] : [fw, fh];
      take(at[0], at[1], ww, hh);
      placed.push(kind);
      if (what === 'budowle')
        st.things.push({
          id: id++,
          kind,
          x: at[0],
          y: at[1],
          w: ww,
          h: hh,
          rot: turned ? 1 : rot,
          n: 0,
          fuel: 0,
          by: -1,
          owner: -1,
        });
      else
        plans.push({
          id: id++,
          kind,
          x: at[0],
          y: at[1],
          rot: turned ? 1 : rot,
          need: { deski: 4, zlom: 2 },
          have: { deski: placed.length % 3, zlom: 1 },
          work: (placed.length * 400) % 900,
          by: -1,
        });
    }
    // zasieki w miejscu odcinka siatki najbliżej bramy
    const g = w.fence.gate;
    const wire = w.fence.tiles
      .filter((i) => !w.fence.hole.includes(i))
      .sort(
        (a, b) =>
          Math.hypot((a % size) - g.x, Math.floor(a / size) - g.y) -
          Math.hypot((b % size) - g.x, Math.floor(b / size) - g.y),
      )[3];
    const wx = wire % size;
    const wy = Math.floor(wire / size);
    const horizontal = w.fence.tiles.includes(wire - 1) || w.fence.tiles.includes(wire + 1);
    if (what === 'budowle') {
      st.things.push({
        id: id++,
        kind: 'zasieki',
        x: wx,
        y: wy,
        w: 1,
        h: 1,
        rot: horizontal ? 0 : 1,
        n: 0,
        fuel: 0,
        by: -1,
        owner: -1,
      });
      placed.push('zasieki');
    }
    if (what === 'plany') (st as unknown as { builds: unknown[] }).builds = plans;
    const view = zm.view as unknown as { setPlacement: (p: unknown) => void };
    if (what === 'stawianie-ok' || what === 'stawianie-zle') {
      // wolne kafelki pokoju zarządu jako dozwolone, kilka zajętych obok jako niedozwolone
      const ok: number[] = [];
      for (let i = 0; i < size * size; i++) if (roomOk('pokoj')(i) && !busy.has(i)) ok.push(i);
      const bad = [...busy].filter((i) => int.room[i] >= 0 && int.rooms[int.room[i]].apt === home).slice(0, 12);
      const at = what === 'stawianie-ok' ? spot(2, 1, roomOk('pokoj'))! : [bad[0] % size, Math.floor(bad[0] / size)];
      // w dzień same dozwolone miejsca (jak z interfejsu), nocą dozwolone i zajęte
      view.setPlacement(
        what === 'stawianie-ok'
          ? { kind: 'warsztat', x: at[0], y: at[1], rot: 0, ok: true, tiles: { ok } }
          : { kind: 'warsztat', x: at[0], y: at[1], rot: 0, ok: false, tiles: { ok, bad } },
      );
      zm.setCam(at[0] + 1, at[1] + 0.5, 1.8);
    } else zm.setCam(koza.x, koza.y + 2, 1.6);
    return { placed };
  }, what);
}

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

/** noc w trybie zombie: stado pod siatką przy siedzibie, alarm, warta z dzidami, kamera na najgorętszym miejscu */
async function zombieNight(page: Page, base: string) {
  await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&godzina=23&stado=24&cam=hq,1`);
  await waitIdle(page);
  const info = await page.evaluate(() => {
    const sim = window.zm!.sim!;
    const st = sim.st;
    const core = st.pawns.filter((p) => p.kind === 'core');
    core[0].weapon = 'dzida';
    core[1].weapon = 'dzida';
    sim.push({ t: 'alarm', ids: core.map((p) => p.id) });
    for (let k = 0; k < 900; k++) sim.step();
    const press = st.pawns.filter((p) => p.kind === 'zombie' && p.job?.phase === 2);
    const guards = st.pawns.filter((p) => p.job?.t === 'guard');
    const at = press.length ? press : st.pawns.filter((p) => p.kind === 'zombie');
    const x = at.reduce((a, p) => a + p.x, 0) / at.length;
    const y = at.reduce((a, p) => a + p.y, 0) / at.length;
    // panel celów zasłania lewą część ekranu: kamera trochę w prawo od miejsca naporu
    window.zm!.setCam(x - 4, y, 2);
    return { press: press.length, guards: guards.length, killed: st.tally?.killed ?? 0 };
  });
  console.log(`  noc: ${JSON.stringify(info)}`);
  if (!info.guards) throw new Error('nikt nie stoi na warcie');
  await waitIdle(page);
  await page.waitForTimeout(350);
}

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
      zm.view as unknown as {
        pawnSprites: Map<number, { texture: { frame: { x: number; y: number; width: number } } }>;
      }
    ).pawnSprites;
    return zm
      .sim!.st.pawns.filter((p) => p.kind === 'core')
      .map((p) => {
        const f = sprites.get(p.id)!.texture.frame;
        return { x: f.x, y: f.y, w: f.width };
      });
  });
  const names = got.map((f) => (f.w === LIE ? 'lie' : poseAt(f.x, f.y)));
  console.log(`  pozy: ${names.join(', ')}`);
  if (names.join() !== want.join()) throw new Error(`pozy ${names.join()} zamiast ${want.join()}`);
}

/** poza z klatki atlasu ludzi (lewy górny róg klatki) */
function poseAt(x: number, y: number): string {
  for (let look = 0; look < LOOKS; look++)
    for (const pose of POSES)
      for (let d = 0; d < 4; d++)
        for (let f = 0; f < POSE_FRAMES[pose]; f++) {
          const [fx, fy] = frameRect(look, pose, d, f);
          if (fx === x && fy === y) return pose;
        }
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
      // odpowiedzi 4xx z /api (niezalogowani, zajęta klatka) to zwykły przebieg gry z sąsiadami, nie błąd strony;
      // błędy, których scenariusz się spodziewa (allow, np. 404 tabel mieszkańców), też nie
      const api = m.text().startsWith('Failed to load resource') && m.location().url.includes('/api/');
      const spodziewany = !!shot.allow?.test(m.text()) && (!shot.allowUrl || shot.allowUrl.test(m.location().url));
      if (m.type() === 'error' && !api && !spodziewany) errors.push(m.text());
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

/** Sterty materiałów na wolnych kafelkach podwórka, od jego końca (po 10, jak w składzie): koszty budowli stroi bot
    i są wyższe niż zapas na starcie gry, a scenariusze fali 1 stawiają prawdziwe plany */
async function stockUp(page: Page, cost: Partial<Record<string, number>>) {
  await page.evaluate((cost) => {
    const zm = window.zm!;
    const st = zm.sim!.st;
    const w = zm.sim!.w;
    const taken = (i: number) =>
      st.things.some(
        (t) =>
          i % w.size >= t.x &&
          i % w.size < t.x + t.w &&
          Math.floor(i / w.size) >= t.y &&
          Math.floor(i / w.size) < t.y + t.h,
      );
    const free = w.fence.yard.filter((i) => !taken(i)).reverse();
    for (const [kind, all] of Object.entries(cost))
      for (let n = all ?? 0; n > 0; n -= 10) {
        const i = free.shift();
        if (i === undefined) throw new Error('brak miejsca na podwórku na materiały');
        st.things.push({
          id: st.nextThing++,
          kind,
          x: i % w.size,
          y: Math.floor(i / w.size),
          w: 1,
          h: 1,
          rot: 0,
          n: Math.min(10, n),
          fuel: 0,
          by: -1,
          owner: -1,
        });
      }
  }, cost);
}

/** Przybysze (M2, fala 1): zarząd przyjmuje 3 osoby (zm.admit, jak po decyzji), komunikat z odmianą i „Pokaż”, który
    nie zasłania paska ani listy celów (na telefonie stoi pod listą); „Pokaż” przesuwa kamerę na środek grupy bez
    zmiany przybliżenia, a po dojściu do mieszkań (około 20 minut gry) komunikat znika */
async function arrivals(page: Page, base: string, phone: boolean) {
  await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
  await waitIdle(page);
  const n = await page.evaluate(() => window.zm!.admit(3));
  if (n !== 3) throw new Error(`przyjętych: ${n} z 3`);
  const text = await page
    .waitForFunction(
      () => {
        const b = document.getElementById('arrive')!;
        return !b.hidden && (b.textContent ?? '');
      },
      null,
      { timeout: 3000 },
    )
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => '');
  console.log(`  komunikat: ${text}`);
  if (!text.includes('3 osoby idą od bramy') || !text.includes('Pokaż'))
    throw new Error('nie ma komunikatu o przybyszach z „Pokaż”');
  // etykieta suchego drzewa ustawia się co klatkę: po dwóch klatkach stoi już pod komunikatem, a nie pod nim schowana
  await frames(page, 2);
  const lay = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    const a = r('arrive');
    const hit = (b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const mark = document.getElementById('treeMark')!;
    return {
      top: hit(r('top')),
      goals: hit(r('goals')),
      mark: !mark.hidden && hit(mark.getBoundingClientRect()),
      inside: a.left >= 0 && a.right <= innerWidth,
    };
  });
  if (lay.top || lay.goals || lay.mark || !lay.inside)
    throw new Error(`komunikat na pasku, na celach, na etykiecie albo poza ekranem: ${JSON.stringify(lay)}`);
  await page.screenshot({ path: path.join(OUT, `m2-przybycie${phone ? '-telefon' : ''}-komunikat.png`) });
  // „Pokaż”: kamera jedzie na środek grupy, przybliżenie bez zmian
  const zoom = await page.evaluate(() => window.zm!.view.cam.zoom);
  if (phone) await page.tap('#arriveShow');
  else await page.click('#arriveShow');
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => {
    const zm = window.zm!;
    const coming = zm.sim!.st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'arrive');
    const [sx, sy] = zm.screenOf(
      coming.reduce((a, p) => a + p.x, 0) / coming.length,
      coming.reduce((a, p) => a + p.y, 0) / coming.length,
    );
    return { sx, sy, w: zm.view.width, h: zm.view.height, zoom: zm.view.cam.zoom };
  });
  const off = Math.round(Math.hypot(r.sx - r.w / 2, r.sy - r.h / 2));
  console.log(`  po „Pokaż”: grupa ${off} px od środka mapy, zoom ${zoom.toFixed(2)} → ${r.zoom.toFixed(2)}`);
  if (off > 40) throw new Error('„Pokaż” nie przesunął kamery do przybyszów');
  if (Math.abs(r.zoom - zoom) > 1e-6) throw new Error('„Pokaż” zmienił przybliżenie');
  await page.screenshot({ path: path.join(OUT, `m2-przybycie${phone ? '-telefon' : ''}-pokaz.png`) });
  // po dojściu do mieszkań komunikat znika
  for (let k = 0; k < 6 && (await page.evaluate(() => !document.getElementById('arrive')!.hidden)); k++) {
    const p = await page.evaluate(() => window.zm!.ff(10));
    if (p) throw new Error(`w trakcie przybycia otworzyło się okno: ${p}`);
  }
  const left = await page.evaluate(() => ({
    hidden: document.getElementById('arrive')!.hidden,
    n: window.zm!.sim!.st.pawns.filter((p) => p.kind === 'resident' && p.job?.t === 'arrive').length,
  }));
  console.log(`  po godzinie gry: idzie jeszcze ${left.n}, komunikat ${left.hidden ? 'schowany' : 'widoczny'}`);
  if (!left.hidden || left.n) throw new Error('komunikat o przybyszach nie zniknął po dojściu');
}

/** Wasz zarząd (src/ui/druzyna.ts): sekcja zwinięta na karcie startowej, edytor osoby na komputerze i na telefonie,
    liczba osób w grze (dwie osoby w trybie zombie, broń ponad liczbę osób w magazynie) i karta osoby z historią z
    drużyny zapisanej w pamięci przeglądarki. Panel losuje drużynę ze świeżym ziarnem, więc imiona w zrzutach edytora
    różnią się między przebiegami; karta osoby ma stałą drużynę. */
function druzynaShots(): Shot[] {
  const KEY = 'za-murem-0.4-druzyna';
  const TEAM = [
    {
      name: 'Halina Wróbel',
      f: true,
      age: 67,
      prof: 'Emerytowany inżynier',
      skills: { bud: 3, cieplo: 2, elek: 1 },
      traits: ['twardy', 'klotliwy'],
      story:
        'Projektowała kotłownie jeszcze przed asystentami AI i do dziś liczy na kartce, więc całe osiedle przychodzi do niej z rysunkiem na odwrocie kalendarza. Na każdym zebraniu ma zdanie odrębne, także wtedy, kiedy sama zgłosiła wniosek. Ma certyfikat neutralności klimatycznej oprawiony w ramkę i zimą wiesza go najbliżej kozy.',
    },
    {
      name: 'Rafał Mazur',
      f: false,
      age: 41,
      prof: 'Hydraulik',
      skills: { cieplo: 4, bud: 2 },
      traits: ['pracowity'],
      story:
        'W szkole zawodowej uczył się w goglach do wirtualnej rzeczywistości, a prawdziwy klucz do rur wziął do ręki dopiero przy pierwszym zamarzniętym pionie. Nie umie usiedzieć bez roboty, więc w wolne dni przebiera gwoździe według rozmiaru.',
    },
    {
      name: 'Natalia Sikora',
      f: true,
      age: 33,
      prof: 'Pielęgniarz',
      skills: { med: 3, uprawa: 2, cieplo: 1 },
      traits: ['optymista', 'gadula'],
      story:
        'Fachu nauczyła się na dyżurach w szkole zamienionej na szpital, gdzie całą aparaturą był termometr i spokojny głos. Uważa, że skoro bakteria zjadła kable, to przynajmniej nikt już nie dzwoni z ofertami.',
    },
  ];
  /** położenie karty startowej: dół formularza, sekcji, przykładów i atrybucji */
  const layout = (page: Page) =>
    page.evaluate(() => {
      const b = (sel: string) => Math.round(document.querySelector(sel)!.getBoundingClientRect().bottom);
      return { form: b('#startForm'), druzyna: b('#druzyna'), demos: b('#demos'), fine: b('.fine'), h: innerHeight };
    });
  const collapsed = (page: Page) =>
    page.evaluate(() => ({
      hidden: (document.getElementById('dzBody') as HTMLElement | null)?.hidden ?? false,
      sum: document.querySelector('#druzyna .dz-sum')?.textContent ?? '',
    }));
  /** bez przewijania w bok: nic nie wystaje poza szerokość ekranu */
  const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  /** edytor osoby na otwartej karcie startowej: zasady punktów, zawód, płeć, wiek, historia, imię; na koniec
      kafelek pokazuje to, co wpisano */
  const editAndCheck = async (page: Page, touch: boolean) => {
    const tap = (sel: string) => (touch ? page.tap(sel) : page.click(sel));
    await tap('#druzyna [data-dz="toggle"]');
    const los = await page.locator('#druzyna .dz-chip.dz-los').count();
    if (los !== 4) throw new Error(`z adresu ${los} kafelków zamiast 4`);
    if (!touch) await page.screenshot({ path: path.join(OUT, 'druzyna-edytor-adres.png') });
    await tap('#druzyna [data-dz="own"]');
    const names = await page.locator('#druzyna .dz-chip b').allTextContents();
    console.log(`  własny zarząd: ${names.join(', ')}`);
    if (names.length !== 4 || new Set(names.map((n) => n.split(' ')[0])).size !== 4)
      throw new Error('własny zarząd bez czterech osób albo z powtórzonym imieniem');
    await tap('#druzyna [data-dz="pick"][data-k="0"]');
    await page.waitForSelector('#druzyna .dz-ed');
    // zawód: murarz, a potem hydraulik; zmiana zawodu wstawia poziomy z PROFS (ciepło 3, zostało 3 z 6)
    await page.selectOption('#dzProf', 'Murarz');
    await page.selectOption('#dzProf', 'Hydraulik');
    const pts = await page.textContent('#druzyna .dz-pts');
    if (pts !== 'zostało 3 z 6') throw new Error(`po zmianie zawodu: ${pts}`);
    // punkty do końca: ciepło do 4, budowa do 2, prąd do 1, ale razem najwyżej 6
    for (let k = 0; k < 8; k++) {
      const plus = page.locator('#druzyna [data-dz="plus"]:not([disabled])').first();
      if (!(await plus.count())) break;
      if (touch) await plus.tap();
      else await plus.click();
    }
    const left = await page.textContent('#druzyna .dz-pts');
    const levels = await page.locator('#druzyna .dz-skv').allTextContents();
    console.log(`  hydraulik: poziomy ${levels.join(', ')}, ${left}`);
    if (left !== 'zostało 0 z 6' || levels.reduce((a, v) => a + Number(v), 0) !== 6)
      throw new Error('punkty nie skończyły się na budżecie 6');
    if (await page.locator('#druzyna [data-dz="plus"]:not([disabled])').count())
      throw new Error('przy wydanym budżecie da się dodać punkt');
    // jeden punkt mniej w cieple i przycisk znowu działa
    await tap('#druzyna [data-dz="minus"][data-d="cieplo"]');
    if ((await page.textContent('#druzyna .dz-pts')) !== 'zostało 1 z 6') throw new Error('odjęcie punktu nie działa');
    if (!touch) {
      // klawiatura: spacja na „+” dodaje punkt, a gdy „+” gaśnie, fokus przechodzi na „−” w tym samym wierszu
      await page.focus('#druzyna [data-dz="plus"][data-d="cieplo"]');
      await page.keyboard.press('Space');
      const f1 = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.dz ?? '');
      const p1 = await page.textContent('#druzyna .dz-pts');
      await page.keyboard.press('Space');
      const f2 = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.dz ?? '');
      const p2 = await page.textContent('#druzyna .dz-pts');
      console.log(`  klawiatura: „${p1}”, fokus na ${f1}; „${p2}”, fokus na ${f2}`);
      if (p1 !== 'zostało 0 z 6' || f1 !== 'minus' || p2 !== 'zostało 1 z 6' || f2 !== 'minus')
        throw new Error('przyciski punktów nie działają z klawiatury albo gubią fokus');
    }
    // płeć: kobieta, zawód w kafelku w żeńskiej formie
    await tap('#druzyna .dz-f-who .mode-o:has(input[value="k"])');
    const chip = await page.textContent('#druzyna .dz-chip.sel small');
    if (!chip?.startsWith('Hydrauliczka')) throw new Error(`kafelek po zmianie płci: ${chip}`);
    // wiek poza widełkami wraca do granicy (hydraulik 28–64)
    await page.fill('#dzAge', '99');
    await page.press('#dzAge', 'Tab');
    const age = await page.inputValue('#dzAge');
    if (age !== '64') throw new Error(`wiek 99 u hydrauliczki: ${age}`);
    await page.fill('#dzAge', '61');
    await page.press('#dzAge', 'Tab');
    // imię i nazwisko trafia do kafelka
    await page.fill('#dzName', 'Halina Wróbel');
    if ((await page.textContent('#druzyna .dz-chip.sel b')) !== 'Halina Wróbel')
      throw new Error('imię nie trafiło do kafelka');
    // cechy i historia z losowania
    await tap('#druzyna [data-dz="traits"]');
    await tap('#druzyna [data-dz="story"]');
    const story = await page.inputValue('#dzStory');
    const traits = await page.locator('#druzyna .dz-tags .tag').allTextContents();
    console.log(`  cechy: ${traits.join(', ')}; historia (${story.length} znaków): ${story}`);
    if (!story || story.length > 400) throw new Error('historia pusta albo za długa');
    if (!traits.length || traits.length > 2) throw new Error('cech nie jest jedna albo dwie');
    if (!(await noSideScroll(page))) throw new Error('karta startowa przewija się w bok');
  };
  return [
    {
      // karta startowa bez ruszania zarządu: sekcja zwinięta do jednej linijki, atrybucja mapy na pierwszym ekranie
      name: 'druzyna-zwinieta',
      query: '',
      run: async (page, base) => {
        await page.goto(base);
        await page.waitForSelector('#demos button');
        const c = await collapsed(page);
        const l = await layout(page);
        console.log(
          `  „${c.sum}”; formularz ${l.form}, sekcja ${l.druzyna}, przykłady ${l.demos}, atrybucja ${l.fine} z ${l.h} px`,
        );
        if (!c.hidden) throw new Error('sekcja zarządu nie jest zwinięta');
        if (c.sum !== '4 osoby z siedziby pod adresem') throw new Error(`podsumowanie: ${c.sum}`);
        if (l.fine > l.h) throw new Error('atrybucja mapy spadła pod pierwszy ekran');
      },
    },
    {
      // edytor osoby rozwinięty na komputerze; po przeładowaniu panel pamięta własny zarząd
      name: 'druzyna-edytor',
      query: '',
      run: async (page, base) => {
        await page.goto(base);
        await page.waitForSelector('#demos button');
        await editAndCheck(page, false);
        await page.screenshot({ path: path.join(OUT, 'druzyna-edytor-cala.png'), fullPage: true });
        // Escape w edytorze zamyka go i oddaje fokus kafelkowi osoby
        await page.focus('#dzStory');
        await page.keyboard.press('Escape');
        const esc = await page.evaluate(() => ({
          editor: !!document.querySelector('#druzyna .dz-ed'),
          focus: (document.activeElement as HTMLElement | null)?.dataset.k ?? '',
        }));
        if (esc.editor || esc.focus !== '0') throw new Error(`Escape: edytor ${esc.editor}, fokus na ${esc.focus}`);
        await page.reload();
        await page.waitForSelector('#demos button');
        const c = await collapsed(page);
        console.log(`  po przeładowaniu: „${c.sum}”`);
        if (!c.sum.startsWith('własny: Halina,')) throw new Error('panel nie pamięta własnego zarządu');
        await page.click('#druzyna [data-dz="toggle"]');
        await page.click('#druzyna [data-dz="pick"][data-k="0"]');
        await page.waitForSelector('#druzyna .dz-ed');
        if ((await page.inputValue('#dzAge')) !== '61') throw new Error('panel nie pamięta wieku');
        await page.locator('#druzyna .dz-ed').scrollIntoViewIfNeeded();
      },
    },
    {
      // telefon: sekcja zwinięta pod formularzem (formularz na pierwszym ekranie), potem edytor w jednej kolumnie
      name: 'druzyna-edytor-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await page.goto(base);
        await page.waitForSelector('#demos button');
        const c = await collapsed(page);
        const l = await layout(page);
        console.log(`  zwinięta: „${c.sum}”; formularz ${l.form}, sekcja ${l.druzyna} z ${l.h} px`);
        if (!c.hidden) throw new Error('na telefonie sekcja zarządu nie jest zwinięta');
        if (l.form > l.h) throw new Error('formularz adresu poza pierwszym ekranem telefonu');
        await editAndCheck(page, true);
        await page.screenshot({ path: path.join(OUT, 'druzyna-edytor-telefon-cala.png'), fullPage: true });
        await page.locator('#druzyna .dz-ed').scrollIntoViewIfNeeded();
      },
    },
    {
      // dwie osoby z adresu w trybie zombie: w grze dwóch z zarządu, łom i nóż z ich listy broni czekają w magazynie
      name: 'druzyna-liczba',
      query: '',
      run: async (page, base) => {
        await page.goto(base);
        await page.waitForSelector('#demos button');
        await page.click('#druzyna [data-dz="toggle"]');
        await page.click('#druzyna .dz-head .mode-o:has(input[value="2"])');
        await page.click('.mode-o.zombie');
        await page.click('#demos button');
        await waitIdle(page);
        const r = await page.evaluate(() => {
          const st = window.zm!.sim!.st;
          return {
            core: st.pawns.filter((p) => p.kind === 'core').length,
            arms: st.store.arms ?? [],
            weapons: st.pawns.filter((p) => p.kind === 'core').map((p) => p.weapon),
          };
        });
        console.log(`  zarząd ${r.core}, broń w rękach ${r.weapons.join(', ')}, w magazynie ${r.arms.join(', ')}`);
        if (r.core !== 2) throw new Error(`w grze ${r.core} osób zarządu zamiast 2`);
        if (!r.arms.includes('lom') || !r.arms.includes('noz'))
          throw new Error('broń ponad liczbę osób nie trafiła do magazynu');
        // kamera na zarządzie w kuchni siedziby (zamiast przelotu nad osiedlem)
        await page.evaluate(() => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
          zm.setCam(p.x, p.y, 1.3);
        });
        await waitIdle(page);
      },
    },
    {
      // karta osoby z historią z drużyny: najpierw jedna linijka, po kliknięciu cała
      name: 'druzyna-karta-osoby',
      query: '',
      run: async (page, base) => {
        await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [
          KEY,
          JSON.stringify({ v: 1, n: 3, wlasny: true, team: TEAM }),
        ] as const);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
        await waitIdle(page);
        const people = await page.evaluate(() =>
          window.zm!.sim!.st.people.slice(0, 3).map((p) => ({ name: p.name, prof: p.prof, story: p.story ?? '' })),
        );
        console.log(`  zarząd: ${people.map((p) => `${p.name} (${p.prof})`).join(', ')}`);
        if (people.map((p) => p.name).join() !== TEAM.map((p) => p.name).join() || people.some((p) => !p.story))
          throw new Error('zarząd w grze nie jest drużyną z panelu');
        const at = await page.evaluate(() => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
          const [x, y] = zm.screenOf(p.x, p.y - 0.55);
          return { x, y };
        });
        await page.mouse.click(at.x, at.y);
        await page.waitForSelector('#card .story');
        const line = await page.$eval('#card .story', (e) => ({
          open: e.getAttribute('aria-expanded'),
          h: Math.round(e.getBoundingClientRect().height),
        }));
        await page.screenshot({ path: path.join(OUT, 'druzyna-karta-osoby-zwinieta.png') });
        await page.click('#card .story');
        await page.waitForSelector('#card .story[aria-expanded="true"]');
        const full = await page.$eval('#card .story', (e) => Math.round(e.getBoundingClientRect().height));
        console.log(`  historia: zwinięta ${line.h} px, rozwinięta ${full} px`);
        if (line.open !== 'false' || full <= line.h * 2) throw new Error('historia nie rozwija się z jednej linijki');
        await page.mouse.move(at.x + 300, at.y - 200);
      },
    },
  ];
}

/** Karta osoby z generatora mieszkańców (krok 5): wiersz rodziny, historia (też na telefonie), napis, że mieszkańcy są
    wymyśleni, i przycisk zmiany imienia; mieszkaniec wybrany kliknięciem ma kartę tylko do odczytu. Scenariusze karta-*
    i imie-* idą starą ścieżką (bez kraj.json gra nie ma generatora, edytor imienia ma odmianę) i wstrzykują stałe dane
    testowe wprost do stanu symulacji (ref, rodzina, historia na osobie z zarządu; nowa osoba pod pionkiem mieszkańca),
    żeby teksty i układ karty były te same w każdym przebiegu. Scenariusze mieszkancy-* biorą prawdziwe osoby
    z generatora na trzech demach, także na telefonie, bez tabel (404) i po wznowieniu zapisu. Kartę otwiera zawsze
    prawdziwe kliknięcie albo stuknięcie. Zrzut końcowy każdego scenariusza to karta zwinięta. */
function kartaShots(): Shot[] {
  const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
  const FIKCJA = 'Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL.';
  const ZARZAD = {
    ref: 'o101',
    rodzina: 'żona Halina (63), syn Piotr (31), wnuczka Zuzia (6)',
    story:
      'Pracował trzydzieści lat w administracji osiedla i zna każdą rurę w piwnicy. Po upadku został, bo zarząd musiał mieć kogoś, kto wie, gdzie są zawory.',
  };
  const MIESZKANIEC = {
    name: 'Wiesława Dąbrowska',
    first: 'Wiesława',
    f: true,
    prof: 'emerytowana księgowa',
    age: 71,
    skills: { uprawa: 1, med: 1 },
    traits: ['lubiany'],
    ref: 'o102',
    rodzina: 'syn Krzysztof (44), wnuk Antek (14)',
    story:
      'Przyjechała na osiedle z synem w latach dziewięćdziesiątych, kiedy blok był jeszcze nowy. Przez wiele lat prowadziła księgi w spółdzielni. Po upadku została, bo nie miała gdzie wracać.',
  };

  /** karta jest cała na ekranie, a napis o fikcji i przycisk imienia widać w jej ramce; zwraca miary do wypisania */
  const sprawdz = async (page: Page, kto: string, fikcja = true) => {
    await page.waitForFunction((n) => document.querySelector('#card:not([hidden]) h2')?.textContent === n, kto, {
      timeout: 5000,
    });
    const m = await page.evaluate(() => {
      const c = document.getElementById('card')!;
      const q = (sel: string) => {
        const e = c.querySelector<HTMLElement>(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return {
          top: b.top,
          bottom: b.bottom,
          left: b.left,
          right: b.right,
          h: b.height,
          shown: cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0,
          text: e.textContent ?? '',
          font: cs.fontSize,
        };
      };
      const r = c.getBoundingClientRect();
      const at = document.querySelector('#app .attrib')!.getBoundingClientRect();
      return {
        card: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        attrib: { top: at.top, bottom: at.bottom, left: at.left, right: at.right },
        vw: innerWidth,
        vh: innerHeight,
        html: c.innerHTML,
        fikcja: q('.fikcja'),
        imie: q('[data-card="imie"]'),
        rodzina: q('.rodzina'),
        sub: q('.sub'),
        story: q('.story'),
        buttons: [...c.querySelectorAll<HTMLElement>('button[data-card]')].map((b) => b.dataset.card),
        sideScroll: document.documentElement.scrollWidth > innerWidth,
      };
    });
    if (RODO.test(m.html)) throw new Error('karta: numer mieszkania albo piętro w tekście');
    if (m.sideScroll) throw new Error('karta przewija stronę w bok');
    if (m.card.top < 0 || m.card.bottom > m.vh || m.card.left < 0 || m.card.right > m.vw)
      throw new Error(`karta poza ekranem: ${JSON.stringify(m.card)}`);
    // atrybucja map i danych zawsze widoczna, także pod kartą na telefonie (dwa wiersze)
    const a = m.attrib;
    if (a.left < m.card.right && a.right > m.card.left && a.top < m.card.bottom && a.bottom > m.card.top)
      throw new Error(`karta zachodzi na atrybucję: karta ${JSON.stringify(m.card)}, atrybucja ${JSON.stringify(a)}`);
    const inCard = (e: { top: number; bottom: number; left: number; right: number } | null) =>
      !!e && e.top >= m.card.top && e.bottom <= m.card.bottom && e.left >= m.card.left && e.right <= m.card.right;
    if (fikcja) {
      if (!m.fikcja?.shown || m.fikcja.text !== FIKCJA || !inCard(m.fikcja))
        throw new Error('nie widać napisu o fikcji');
      if (!m.imie?.shown || !inCard(m.imie)) throw new Error('nie widać przycisku zmiany imienia');
      // zawód i wiek osoby z generatora także na zwartej karcie telefonu (spec §9)
      if (!m.sub?.shown || !inCard(m.sub)) throw new Error('nie widać zawodu i wieku osoby z generatora');
    } else if (m.fikcja || m.imie) throw new Error('osoba spoza generatora ma napis o fikcji');
    if (!m.story?.shown) throw new Error('nie widać historii');
    console.log(
      `  karta „${kto}”: ${Math.round(m.card.right - m.card.left)}×${Math.round(m.card.bottom - m.card.top)} px, ` +
        `napis ${m.fikcja?.font} w ${Math.round(m.fikcja?.h ?? 0)} px, historia ${Math.round(m.story.h)} px, ` +
        `rodzina ${m.rodzina?.shown ? 'jest' : 'schowana'}, przyciski ${m.buttons.join('+')}`,
    );
    return m;
  };

  const wejdz = async (page: Page, base: string) => {
    await zlaWersjaKraju(page);
    await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
    await waitIdle(page);
  };
  /** dane osoby z generatora na osobie z zarządu (k-ta) */
  const zarzadZGeneratora = (page: Page, k: number) =>
    page.evaluate(
      ([k, d]) => {
        const st = window.zm!.sim!.st;
        const p = st.pawns.filter((q) => q.kind === 'core')[k];
        Object.assign(st.people[p.person], d);
        return st.people[p.person].name;
      },
      [k, ZARZAD] as const,
    );
  /** nowa osoba pod pionkiem mieszkańca najbliższego k-tej osoby z zarządu */
  const mieszkaniecZGeneratora = (page: Page, k: number, naNim = false) =>
    page.evaluate(
      ([k, d, naNim]) => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        const core = st.pawns.filter((q) => q.kind === 'core')[k];
        const r = st.pawns
          .filter((q) => q.kind === 'resident' && !q.away && q.person < 0)
          .sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
        st.people.push({
          id: `s${st.nextId++}`,
          home: zm.sim!.w.hq,
          assign: null,
          sick: false,
          dead: false,
          gone: false,
          ...d,
          skills: { ...d.skills },
          traits: [...d.traits],
        });
        r.person = st.people.length - 1;
        // kamera między członkiem zarządu a mieszkańcem, żeby było widać obu (na telefonie: na mieszkańcu)
        if (naNim) zm.setCam(r.x, r.y - 0.5, 1.3);
        else zm.setCam((r.x + core.x) / 2, (r.y + core.y) / 2 - 0.5, 1.3);
        return { id: r.id, name: d.name, dist: Math.hypot(r.x - core.x, r.y - core.y) };
      },
      [k, MIESZKANIEC, naNim] as const,
    );
  const ekran = (page: Page, id: number) =>
    page.evaluate((id) => {
      const zm = window.zm!;
      const p = zm.sim!.st.pawns.find((q) => q.id === id)!;
      const [x, y] = zm.screenOf(p.x, p.y - 0.55);
      return { x, y };
    }, id);
  const rdzen = (page: Page, k: number) =>
    page.evaluate((k) => {
      const zm = window.zm!;
      const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[k];
      const [x, y] = zm.screenOf(p.x, p.y - 0.55);
      return { x, y, id: p.id };
    }, k);
  const cmds = (page: Page) => page.evaluate(() => window.zm!.sim!.st.cmds.length);

  /** historia: jedna linijka, po kliknięciu cała, po drugim kliknięciu znowu jedna */
  const historia = async (page: Page, nazwa: string, tap: boolean) => {
    const zwinieta = await page.$eval('#card .story', (e) => Math.round(e.getBoundingClientRect().height));
    if (tap) await page.tap('#card .story');
    else await page.click('#card .story');
    await page.waitForSelector('#card .story[aria-expanded="true"]');
    const pelna = await page.$eval('#card .story', (e) => Math.round(e.getBoundingClientRect().height));
    console.log(`  historia: zwinięta ${zwinieta} px, rozwinięta ${pelna} px`);
    if (pelna <= zwinieta * 1.5) throw new Error('historia nie rozwija się z jednej linijki');
    await page.screenshot({ path: path.join(OUT, `${nazwa}-rozwinieta.png`) });
    if (tap) await page.tap('#card .story');
    else await page.click('#card .story');
    await page.waitForSelector('#card .story[aria-expanded="false"]');
  };

  /** karta mieszkańca (kliknięcie albo stuknięcie w pionek) i edytor imienia z niej */
  const otworzEdytor = async (page: Page, id: number, tap: boolean) => {
    if (!(await page.$('#card [data-card="imie"]'))) {
      const b = await ekran(page, id);
      if (tap) await page.touchscreen.tap(b.x, b.y);
      else await page.mouse.click(b.x, b.y);
      await page.waitForSelector('#card [data-card="imie"]');
    }
    if (tap) await page.tap('#card [data-card="imie"]');
    else await page.click('#card [data-card="imie"]');
    await page.waitForSelector('#card form.imie-ed');
  };
  /** pola edytora: nazwa, wartość, czy zgadywane */
  const polaEdytora = (page: Page) =>
    page.$$eval('#card form.imie-ed input', (l) =>
      (l as HTMLInputElement[]).map((i) => ({
        name: i.name,
        value: i.value,
        niepewne: i.classList.contains('niepewne'),
      })),
    );
  /** nowe imię w polu mianownika, litera po literze (podpowiedzi form idą przy każdej) */
  const wpisz = async (page: Page, imie: string, tap: boolean) => {
    const pole = page.locator('#card input[name="mian"]');
    if (tap) await pole.tap();
    else await pole.click();
    await pole.fill('');
    await pole.pressSequentially(imie);
  };
  /** edytor cały na ekranie i w karcie, pola dość duże na palec na telefonie, bez przewijania w bok */
  const edytorNaEkranie = async (page: Page) => {
    const m = await page.evaluate(() => {
      const c = document.getElementById('card')!.getBoundingClientRect();
      const inputs = [...document.querySelectorAll<HTMLInputElement>('#card form.imie-ed input')].map((i) => {
        const b = i.getBoundingClientRect();
        return { left: b.left, right: b.right, h: b.height, font: Number.parseFloat(getComputedStyle(i).fontSize) };
      });
      const fik = document.querySelector('#card form.imie-ed .fikcja');
      return {
        card: { top: c.top, bottom: c.bottom, left: c.left, right: c.right },
        inputs,
        fikcja: !!fik && getComputedStyle(fik).display !== 'none',
        palec: matchMedia('(pointer: coarse)').matches,
        vw: innerWidth,
        vh: innerHeight,
        sideScroll: document.documentElement.scrollWidth > innerWidth,
      };
    });
    if (m.sideScroll) throw new Error('edytor przewija stronę w bok');
    if (m.card.top < 0 || m.card.bottom > m.vh || m.card.left < 0 || m.card.right > m.vw)
      throw new Error(`edytor poza ekranem: ${JSON.stringify(m.card)}`);
    if (m.inputs.length !== 7 || m.inputs.some((i) => i.left < m.card.left || i.right > m.card.right))
      throw new Error('pola edytora poza kartą');
    if (!m.fikcja) throw new Error('w edytorze nie widać napisu o fikcji');
    const najmniejsza = Math.min(...m.inputs.map((i) => i.font));
    if ((m.vw < 640 || m.palec) && najmniejsza < 16)
      throw new Error(`pole edytora ${najmniejsza} px: telefon przybliży stronę`);
    console.log(
      `  edytor: ${Math.round(m.card.right - m.card.left)}×${Math.round(m.card.bottom - m.card.top)} px na ${m.vw}×${m.vh}, ` +
        `pola ${najmniejsza} px, ${Math.round(Math.min(...m.inputs.map((i) => i.h)))} px wysokości`,
    );
  };

  /** gra na demie z prawdziwymi osobami z generatora (tabele z public/data/mieszkancy/); wypisuje czasy z konsoli gry
      i liczby osób, rzuca, gdy pierwsza osoba zarządu nie jest z generatora */
  async function zTabel(page: Page, base: string, demo: string) {
    const czasy: string[] = [];
    page.on('console', (m) => {
      if (/^(tabele mieszkańców|mieszkańcy|świat) /.test(m.text())) czasy.push(m.text());
    });
    await page.goto(`${base}?demo=${demo}&speed=0&cam=hq,1.3`);
    await waitIdle(page);
    const s = await page.evaluate(() => {
      const st = window.zm!.sim!.st;
      const core = st.pawns.filter((p) => p.kind === 'core');
      const lok = st.pawns.filter((p) => p.kind === 'resident');
      return {
        refs: st.people.filter((p) => p.ref).length,
        zarzad: core.map((p) => st.people[p.person]?.ref ?? null),
        lok: lok.length,
        zOsoba: lok.filter((p) => p.person >= 0).length,
      };
    });
    console.log(`  ${czasy.join('; ')}`);
    console.log(
      `  osoby z generatora: ${s.refs}, zarząd z osobą ${s.zarzad.filter(Boolean).length}/${s.zarzad.length}, mieszkańcy z osobą ${s.zOsoba}/${s.lok}`,
    );
    // pierwsza osoba zarządu zawsze z generatora; gdy w siedzibie jest mniej dorosłych z fachem niż miejsc (dom w
    // Batowicach), reszta zarządu zostaje z losowania z adresu
    if (!s.zarzad[0]) throw new Error('zarząd bez osób z generatora');
    return s;
  }
  /** imię k-tej osoby z zarządu */
  const imieZarzadu = (page: Page, k: number) =>
    page.evaluate((k) => {
      const st = window.zm!.sim!.st;
      return st.people[st.pawns.filter((q) => q.kind === 'core')[k].person].name;
    }, k);
  /** mieszkaniec z osobą z generatora najbliżej k-tej osoby z zarządu, kamera na nim */
  const lokatorZOsoba = (page: Page, k: number) =>
    page.evaluate((k) => {
      const zm = window.zm!;
      const st = zm.sim!.st;
      const core = st.pawns.filter((q) => q.kind === 'core')[k];
      const r = st.pawns
        .filter((q) => q.kind === 'resident' && !q.away && q.person >= 0)
        .sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
      if (!r) return null;
      zm.setCam(r.x, r.y - 0.5, 1.3);
      return { id: r.id, name: st.people[r.person].name, ref: st.people[r.person].ref };
    }, k);
  /** świat i stan gry mówią o mieszkaniach siedziby to samo (stan, powód, rok) */
  const mieszkaniaZgodne = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      const ws = (zm.sim!.w.apts ?? []).map((a) => `${a.apt}:${a.state}:${a.why ?? ''}:${a.year ?? ''}`).join(' ');
      const gs = zm
        .apts()
        .map((a) => `${a.apt}:${a.state}:${a.why ?? ''}:${a.year ?? ''}`)
        .join(' ');
      return { ok: ws === gs, ws, gs };
    });
  /** karta zarządu z generatora: kliknięcie w k-tą osobę, karta z napisem o fikcji, historia rozwija się */
  const kartaZarzadu = async (page: Page, nazwa: string, tap: boolean) => {
    const kto = await imieZarzadu(page, 0);
    const a = await rdzen(page, 0);
    if (tap) await page.touchscreen.tap(a.x, a.y);
    else await page.mouse.click(a.x, a.y);
    const m = await sprawdz(page, kto);
    if (!m.buttons.includes('arm')) throw new Error('karta zarządu bez zmiany broni');
    console.log(`  rodzina: ${m.rodzina?.shown ? m.rodzina.text : 'brak'}`);
    await historia(page, nazwa, tap);
    if (!tap) await page.mouse.move(a.x + 400, a.y - 250);
  };
  /** karta mieszkańca z generatora: tylko do odczytu, z napisem o fikcji i historią */
  const kartaLokatora = async (page: Page, nazwa: string, tap: boolean) => {
    const r = await lokatorZOsoba(page, 0);
    if (!r) throw new Error('żaden mieszkaniec nie ma osoby z generatora');
    await waitIdle(page);
    const b = await ekran(page, r.id);
    if (tap) await page.touchscreen.tap(b.x, b.y);
    else await page.mouse.click(b.x, b.y);
    const m = await sprawdz(page, r.name);
    if (m.buttons.some((x) => x !== 'story' && x !== 'imie')) throw new Error(`rozkazy na karcie: ${m.buttons}`);
    console.log(`  rodzina: ${m.rodzina?.shown ? m.rodzina.text : 'brak'}`);
    await historia(page, nazwa, tap);
    if (!tap) await page.mouse.move(b.x + 400, b.y - 250);
  };

  function mieszkancy(): Shot[] {
    return [
      {
        // Przymorze: zarząd z mieszkańców falowca, karta z rodziną, historią i napisem o fikcji
        name: 'mieszkancy-przymorze-zarzad',
        query: '',
        run: async (page, base) => {
          await zTabel(page, base, 'przymorze');
          await kartaZarzadu(page, 'mieszkancy-przymorze-zarzad', false);
        },
      },
      {
        // Przymorze: mieszkaniec przy podwórku z osobą z generatora, karta do odczytu
        name: 'mieszkancy-przymorze-lokator',
        query: '',
        run: async (page, base) => {
          const s = await zTabel(page, base, 'przymorze');
          if (!s.zOsoba) throw new Error('mieszkańcy bez osób z generatora');
          const m = await mieszkaniaZgodne(page);
          console.log(`  mieszkania siedziby: ${m.ws}`);
          if (!m.ok) throw new Error(`świat i gra różnią się mieszkaniami: ${m.ws} / ${m.gs}`);
          await kartaLokatora(page, 'mieszkancy-przymorze-lokator', false);
        },
      },
      {
        name: 'mieszkancy-lanciego-lokator',
        query: '',
        run: async (page, base) => {
          const s = await zTabel(page, base, 'lanciego');
          if (!s.zOsoba) throw new Error('mieszkańcy bez osób z generatora');
          await kartaLokatora(page, 'mieszkancy-lanciego-lokator', false);
        },
      },
      {
        // Batowice: dom jednorodzinny, zarząd z jednej rodziny
        name: 'mieszkancy-zielonki-zarzad',
        query: '',
        run: async (page, base) => {
          await zTabel(page, base, 'zielonki');
          await kartaZarzadu(page, 'mieszkancy-zielonki-zarzad', false);
        },
      },
      {
        // telefon 390×844: stuknięcie w mieszkańca, karta zwarta z napisem o fikcji i historią
        name: 'mieszkancy-telefon',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await zTabel(page, base, 'przymorze');
          await kartaLokatora(page, 'mieszkancy-telefon', true);
        },
      },
      {
        // Menu na telefonie: linia o źródłach danych mieszkańców z LICENCJE.md i link do pliku, który się otwiera
        name: 'mieszkancy-menu-telefon',
        query: '',
        w: 390,
        h: 844,
        run: async (page, base) => {
          await zTabel(page, base, 'przymorze');
          await page.tap('#btnMenu');
          await page.waitForSelector('#sheet .fine.dane a');
          const m = await page.evaluate(() => {
            const a = document.querySelector<HTMLAnchorElement>('#sheet .fine.dane a')!;
            a.scrollIntoView({ block: 'nearest' });
            const r = a.getBoundingClientRect();
            return {
              bottom: Math.round(r.bottom),
              right: Math.round(r.right),
              vh: innerHeight,
              vw: innerWidth,
              side: document.documentElement.scrollWidth > innerWidth + 1,
              href: a.href,
              linia: document.querySelector('#sheet .fine.dane')!.textContent ?? '',
            };
          });
          const plik = await page.request.get(m.href);
          const tekst = await plik.text();
          console.log(
            `  link ${m.href.replace(base, '')}: ${plik.status()}, ${tekst.length} znaków; dół linku ${m.bottom} z ${m.vh} px`,
          );
          if (m.side || m.bottom > m.vh || m.right > m.vw) throw new Error('link do źródeł danych poza ekranem');
          if (!plik.ok() || !tekst.includes(m.linia.replace(/ Źródła i licencje$/, '')))
            throw new Error('plik z licencjami nie ma linii z Menu');
        },
      },
      {
        // zmiana imienia na prawdziwych osobach z generatora: nowe imię w linijce rodziny krewnego, Przywróć wraca do
        // imienia z generatora, a zapamiętana zmiana trafia na tę samą osobę w nowej grze pod tym adresem
        name: 'mieszkancy-imie',
        query: '',
        run: async (page, base) => {
          await zTabel(page, base, 'przymorze');
          // osoba z pionkiem (zarząd albo mieszkaniec z osobą), której imię stoi w linijce rodziny kogoś w grze
          const para = await page.evaluate(() => {
            const zm = window.zm!;
            const st = zm.sim!.st;
            for (const pw of st.pawns) {
              if (pw.person < 0 || pw.away || (pw.kind !== 'core' && pw.kind !== 'resident')) continue;
              const p = st.people[pw.person];
              if (!p.ref) continue;
              const k = st.people.findIndex((q) => q !== p && q.rodzina?.includes(` ${p.first} (`));
              if (k < 0) continue;
              zm.setCam(pw.x, pw.y - 0.5, 1.3);
              return { pawn: pw.id, ref: p.ref, name: p.name, f: p.f, krewny: k, rodzina: st.people[k].rodzina! };
            }
            return null;
          });
          if (!para) throw new Error('nikt w grze nie ma krewnego w linijce rodziny innej osoby');
          await waitIdle(page);
          const nowe = para.f ? 'Bożenka' : 'Zbyszko';
          const nazwisko = para.name.split(' ').slice(1).join(' ');
          const stan = () =>
            page.evaluate(
              ([ref, k]) => {
                const st = window.zm!.sim!.st;
                return { name: st.people.find((q) => q.ref === ref)?.name, rodzina: st.people[k].rodzina ?? '' };
              },
              [para.ref, para.krewny] as const,
            );
          await otworzEdytor(page, para.pawn, false);
          await wpisz(page, nowe, false);
          await page.click('#card [data-card="imie-zapisz"]');
          await sprawdz(page, `${nowe} ${nazwisko}`);
          const po = await stan();
          console.log(`  rodzina krewnego: „${para.rodzina}” → „${po.rodzina}”`);
          if (!po.rodzina.includes(` ${nowe} (`)) throw new Error('nowe imię nie trafiło do linijki rodziny krewnego');
          // Przywróć: imię z generatora i ta sama linijka rodziny co na starcie
          await otworzEdytor(page, para.pawn, false);
          await page.click('#card [data-card="imie-przywroc"]');
          await sprawdz(page, para.name);
          const przywrocone = await stan();
          if (przywrocone.name !== para.name || przywrocone.rodzina !== para.rodzina)
            throw new Error(`Przywróć nie wrócił do generatora: ${JSON.stringify(przywrocone)}`);
          // zapamiętana zmiana: nowa gra pod tym samym adresem ma tę osobę z nowym imieniem, także w rodzinie krewnego
          await otworzEdytor(page, para.pawn, false);
          await wpisz(page, nowe, false);
          await page.click('#card [data-card="imie-zapisz"]');
          await sprawdz(page, `${nowe} ${nazwisko}`);
          await zTabel(page, base, 'przymorze');
          const nowaGra = await stan();
          console.log(`  nowa gra: ${nowaGra.name}, rodzina krewnego „${nowaGra.rodzina}”`);
          if (nowaGra.name !== `${nowe} ${nazwisko}` || !nowaGra.rodzina.includes(` ${nowe} (`))
            throw new Error('zapamiętana zmiana imienia nie wróciła w nowej grze');
          // końcowy zrzut: karta osoby z nowym imieniem
          await page.evaluate((id) => {
            const zm = window.zm!;
            const p = zm.sim!.st.pawns.find((q) => q.id === id)!;
            zm.setCam(p.x, p.y - 0.5, 1.3);
          }, para.pawn);
          await waitIdle(page);
          const b = await ekran(page, para.pawn);
          await page.mouse.click(b.x, b.y);
          await sprawdz(page, `${nowe} ${nazwisko}`);
          await page.mouse.move(b.x + 400, b.y - 250);
        },
      },
      {
        // bez tabel (404): stara ścieżka bez błędu, osoby jak przed krokiem 5, bez napisu o fikcji
        name: 'mieszkancy-bez-tabel',
        query: '',
        allow: BRAK_TABEL,
        allowUrl: TABELE_URL,
        run: async (page, base) => {
          await bezTabel(page);
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          const s = await page.evaluate(() => {
            const st = window.zm!.sim!.st;
            return {
              refs: st.people.filter((p) => p.ref).length,
              lok: st.pawns.filter((p) => p.kind === 'resident').length,
              zOsoba: st.pawns.filter((p) => p.kind === 'resident' && p.person >= 0).length,
            };
          });
          console.log(`  bez tabel: osób z generatora ${s.refs}, mieszkańców ${s.lok}, z osobą ${s.zOsoba}`);
          if (s.refs || s.zOsoba) throw new Error('bez tabel są osoby z generatora');
          const m = await mieszkaniaZgodne(page);
          if (!m.ok) throw new Error('świat i gra różnią się mieszkaniami');
          const kto = await imieZarzadu(page, 0);
          const a = await rdzen(page, 0);
          await page.mouse.click(a.x, a.y);
          await page.waitForFunction((n) => document.querySelector('#card:not([hidden]) h2')?.textContent === n, kto);
          if (await page.$('#card .fikcja, #card [data-card="imie"]'))
            throw new Error('osoba spoza generatora ma napis o fikcji albo zmianę imienia');
          await page.mouse.move(a.x + 400, a.y - 250);
        },
      },
      {
        // zapis gry z osobami z generatora: po wczytaniu ten sam stan, świat ze stanami mieszkań z zapisu, karta
        // mieszkańca jak przed zapisem
        name: 'mieszkancy-wznowienie',
        query: '',
        run: async (page, base) => {
          await zTabel(page, base, 'przymorze');
          const a = await page.evaluate(() => {
            const zm = window.zm!;
            zm.ff(30);
            zm.save();
            return { tick: zm.sim!.st.tick, hash: zm.sim!.hash() };
          });
          await page.goto(`${base}?speed=0`);
          await page.waitForSelector('#resume:not([hidden])');
          await page.click('#btnResume');
          await waitIdle(page);
          const b = await page.evaluate(() => ({ tick: window.zm!.sim!.st.tick, hash: window.zm!.sim!.hash() }));
          console.log(`  zapis: tick ${a.tick} → ${b.tick}, skrót ${a.hash} → ${b.hash}`);
          if (a.hash !== b.hash) throw new Error('po wczytaniu stan gry jest inny');
          const m = await mieszkaniaZgodne(page);
          console.log(`  mieszkania siedziby: ${m.ws}`);
          if (!m.ok) throw new Error(`świat i gra różnią się mieszkaniami: ${m.ws} / ${m.gs}`);
          await kartaLokatora(page, 'mieszkancy-wznowienie', false);
        },
      },
      {
        // zapis sprzed kroku 5 (gra bez tabel), wczytany z tabelami: świat zostaje przy stanach mieszkań M2 zapisu,
        // mieszkańcy bez osób; zrzut przekroju siedziby, żeby było widać puste mieszkania tam, gdzie mówi stan gry
        name: 'mieszkancy-stary-zapis',
        query: '',
        allow: BRAK_TABEL,
        allowUrl: TABELE_URL,
        run: async (page, base) => {
          await bezTabel(page);
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.75`);
          await waitIdle(page);
          const a = await page.evaluate(() => {
            const zm = window.zm!;
            zm.ff(30);
            zm.save();
            return { hash: zm.sim!.hash(), refs: zm.sim!.st.people.filter((p) => p.ref).length };
          });
          if (a.refs) throw new Error('gra bez tabel ma osoby z generatora');
          await page.unroute('**/data/mieszkancy/**');
          await page.goto(`${base}?speed=0`);
          await page.waitForSelector('#resume:not([hidden])');
          await page.click('#btnResume');
          await waitIdle(page);
          const b = await page.evaluate(() => ({
            hash: window.zm!.sim!.hash(),
            refs: window.zm!.sim!.st.people.filter((p) => p.ref).length,
          }));
          if (a.hash !== b.hash || b.refs) throw new Error('stary zapis wczytał się inaczej');
          const m = await mieszkaniaZgodne(page);
          console.log(`  mieszkania siedziby: ${m.ws}`);
          if (!m.ok) throw new Error(`świat i gra różnią się mieszkaniami: ${m.ws} / ${m.gs}`);
          await page.evaluate(() => {
            const zm = window.zm!;
            const hq = zm.sim!.w.buildings[zm.sim!.w.hq];
            zm.setCam((hq.x0 + hq.x1 + 1) / 2, (hq.y0 + hq.y1 + 1) / 2, 0.75);
          });
          await waitIdle(page);
        },
      },
    ];
  }

  return [
    {
      // zarząd: osoba z generatora na komputerze; przycisk imienia otwiera edytor, Anuluj wraca do karty
      name: 'karta-zarzad',
      query: '',
      run: async (page, base) => {
        await wejdz(page, base);
        const kto = await zarzadZGeneratora(page, 0);
        const a = await rdzen(page, 0);
        await page.mouse.click(a.x, a.y);
        const m = await sprawdz(page, kto);
        if (!m.rodzina?.shown || m.rodzina.text !== `Rodzina: ${ZARZAD.rodzina}`)
          throw new Error('brak wiersza rodziny');
        if (!m.buttons.includes('arm')) throw new Error('karta zarządu straciła zmianę broni');
        await historia(page, 'karta-zarzad', false);
        await page.click('#card [data-card="imie"]');
        await page.waitForSelector('#card form.imie-ed');
        await page.click('#card [data-card="imie-anuluj"]');
        await sprawdz(page, kto);
        await page.mouse.move(a.x + 400, a.y - 250);
      },
    },
    {
      // zarząd na telefonie (390×844): historia zwinięta do jednej linijki nadal jest, napis o fikcji też
      name: 'karta-zarzad-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await wejdz(page, base);
        const kto = await zarzadZGeneratora(page, 0);
        const a = await rdzen(page, 0);
        await page.touchscreen.tap(a.x, a.y);
        await sprawdz(page, kto);
        await historia(page, 'karta-zarzad-telefon', true);
        await page.tap('#card [data-card="imie"]');
        await page.waitForSelector('#card form.imie-ed');
        await page.tap('#card [data-card="imie-anuluj"]');
        await sprawdz(page, kto);
      },
    },
    {
      // mieszkaniec wybrany kliknięciem: karta do odczytu, zaznaczony z zarządu zostaje zaznaczony, zarząd wygrywa
      name: 'karta-mieszkanca',
      query: '',
      run: async (page, base) => {
        await wejdz(page, base);
        const kto0 = await zarzadZGeneratora(page, 0);
        const r = await mieszkaniecZGeneratora(page, 0);
        await waitIdle(page);
        // zaznaczony członek zarządu, potem mieszkaniec
        const a = await rdzen(page, 0);
        await page.mouse.click(a.x, a.y);
        await sprawdz(page, kto0);
        // otwarty edytor imienia zarządu nie zostaje nad klikniętym mieszkańcem
        await page.click('#card [data-card="imie"]');
        await page.waitForSelector('#card form.imie-ed');
        const b1 = await ekran(page, r.id);
        await page.mouse.click(b1.x, b1.y);
        await sprawdz(page, r.name);
        await page.keyboard.press('Escape');
        await page.mouse.click(a.x, a.y);
        await sprawdz(page, kto0);
        const przed = await cmds(page);
        const b = await ekran(page, r.id);
        await page.mouse.click(b.x, b.y);
        const m = await sprawdz(page, r.name);
        if (m.buttons.some((x) => x !== 'story' && x !== 'imie')) throw new Error(`rozkazy na karcie: ${m.buttons}`);
        if ((await cmds(page)) !== przed) throw new Error('kliknięcie mieszkańca wysłało polecenie');
        // zaznaczenie zostało: prawy przycisk na ziemi daje polecenie, a nie „Najpierw zaznaczcie”
        await page.mouse.click(b.x + 120, b.y + 90, { button: 'right' });
        await page.waitForTimeout(300);
        const hint = await page.textContent('#hint');
        if (hint?.includes('Najpierw zaznaczcie')) throw new Error('klik w mieszkańca zdjął zaznaczenie zarządu');
        console.log(`  po prawym przycisku: polecenia ${przed} → ${await cmds(page)}, podpowiedź „${hint}”`);
        await page.keyboard.press('Escape');
        // mieszkaniec stoi dokładnie pod członkiem zarządu: wygrywa zarząd
        const stos = await page.evaluate(
          ([rid, cid]) => {
            const st = window.zm!.sim!.st;
            const rr = st.pawns.find((q) => q.id === rid)!;
            const cc = st.pawns.find((q) => q.id === cid)!;
            const was = { x: rr.x, y: rr.y };
            rr.x = cc.x;
            rr.y = cc.y;
            return was;
          },
          [r.id, a.id] as const,
        );
        const c = await rdzen(page, 0);
        await page.mouse.click(c.x, c.y);
        await sprawdz(page, kto0);
        await page.evaluate(
          ([rid, was]) => {
            const rr = window.zm!.sim!.st.pawns.find((q) => q.id === rid)!;
            rr.x = was.x;
            rr.y = was.y;
          },
          [r.id, stos] as const,
        );
        // pusty teren zdejmuje kartę, jak dotąd
        const pusty = await page.evaluate(() => {
          // punkt mapy bez przycisków i paneli nad nią, jak najdalej od zarządu (w lewym górnym rogu mapy)
          for (let y = 140; y < innerHeight - 200; y += 40)
            for (let x = 40; x < innerWidth - 300; x += 40)
              if (
                document.elementFromPoint(x, y)?.closest('#stage') &&
                !document.elementFromPoint(x, y)?.closest('#card')
              )
                return { x, y };
          return { x: 40, y: 140 };
        });
        await page.mouse.click(pusty.x, pusty.y);
        await page.waitForTimeout(300);
        const po = await page.evaluate(() => document.querySelector('#card:not([hidden]) h2')?.textContent ?? null);
        if (po === r.name || po === kto0) throw new Error(`pusty teren zostawił kartę: ${po}`);
        await page.keyboard.press('Escape');
        // końcowy zrzut: sam mieszkaniec, historia zwinięta, bez podpowiedzi po poleceniu z prawego przycisku
        await page.waitForTimeout(2800);
        const d = await ekran(page, r.id);
        await page.mouse.click(d.x, d.y);
        await sprawdz(page, r.name);
        await historia(page, 'karta-mieszkanca', false);
        await page.mouse.move(d.x + 400, d.y - 250);
      },
    },
    {
      // mieszkaniec na telefonie: stuknięcie, karta zwarta, ale z historią i napisem
      name: 'karta-mieszkanca-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await wejdz(page, base);
        const kto0 = await zarzadZGeneratora(page, 0);
        const r = await mieszkaniecZGeneratora(page, 0, true);
        // dotyk z zaznaczonym członkiem zarządu: stuknięcie przy mieszkańcu to polecenie (jak przed krokiem 5), bez
        // karty mieszkańca; bez zaznaczenia stuknięcie otwiera kartę mieszkańca, a stuknięcie w pusty teren ją zamyka
        // bez polecenia; kamera po kolei na każdym z nich
        const naPionku = async (id: number) => {
          await page.evaluate((id) => {
            const zm = window.zm!;
            const p = zm.sim!.st.pawns.find((q) => q.id === id)!;
            zm.setCam(p.x, p.y - 0.5, 1.3);
          }, id);
          await waitIdle(page);
          return ekran(page, id);
        };
        const a = await naPionku((await rdzen(page, 0)).id);
        await page.touchscreen.tap(a.x, a.y);
        await sprawdz(page, kto0);
        const przed = await cmds(page);
        const b0 = await naPionku(r.id);
        await page.touchscreen.tap(b0.x, b0.y);
        await page.waitForTimeout(400);
        const poZaznaczonym = await page.evaluate(
          () => document.querySelector('#card:not([hidden]) h2')?.textContent ?? null,
        );
        console.log(
          `  stuknięcie przy mieszkańcu z zaznaczonym: karta „${poZaznaczonym}”, polecenia ${przed} → ${await cmds(page)}`,
        );
        if ((await cmds(page)) !== przed + 1) throw new Error('stuknięcie z zaznaczonym zarządem nie dało polecenia');
        if (poZaznaczonym !== kto0) throw new Error(`stuknięcie z zaznaczonym zarządem dało kartę „${poZaznaczonym}”`);
        await page.keyboard.press('Escape');
        // podpowiedź „Idzie.” po poleceniu znika, zanim zrobimy zrzut końcowy
        await page.waitForTimeout(2800);
        const przed2 = await cmds(page);
        const b1 = await naPionku(r.id);
        await page.touchscreen.tap(b1.x, b1.y);
        await sprawdz(page, r.name);
        // pusty teren obok mieszkańca: mapa bez paneli nad nią i bez pionka w promieniu 2 m
        const pusty = await page.evaluate(
          ([bx, by]) => {
            const zm = window.zm!;
            const v = zm.view!;
            for (const [dx, dy] of [
              [120, -60],
              [-120, -60],
              [120, 0],
              [-120, 0],
              [150, -120],
              [-150, -120],
            ]) {
              const x = bx + dx;
              const y = by + dy;
              const e = document.elementFromPoint(x, y);
              if (!e?.closest('#stage') || e.closest('#card, #goals, #top')) continue;
              const wx = ((x - v.width / 2) / v.cam.zoom + v.cam.x) / 32;
              const wy = ((y - v.height / 2) / v.cam.zoom + v.cam.y) / 32;
              if (zm.sim!.st.pawns.every((p) => p.away || Math.hypot(p.x - wx, p.y - wy) > 2)) return { x, y };
            }
            return null;
          },
          [b1.x, b1.y] as const,
        );
        if (!pusty) throw new Error('brak pustego miejsca na mapie do stuknięcia');
        await page.touchscreen.tap(pusty.x, pusty.y);
        await page.waitForTimeout(400);
        const po = await page.evaluate(() => document.querySelector('#card:not([hidden]) h2')?.textContent ?? null);
        console.log(`  stuknięcie obok karty mieszkańca: karta „${po}”, polecenia ${przed2} → ${await cmds(page)}`);
        if ((await cmds(page)) !== przed2) throw new Error('stuknięcie obok karty mieszkańca wysłało polecenie');
        if (po !== null) throw new Error(`po stuknięciu obok karty mieszkańca karta „${po}”`);
        await page.keyboard.press('Escape');
        // końcowy zrzut: sam mieszkaniec, kamera na nim
        const b = await naPionku(r.id);
        await page.touchscreen.tap(b.x, b.y);
        const m = await sprawdz(page, r.name);
        if (m.buttons.some((x) => x !== 'story' && x !== 'imie')) throw new Error(`rozkazy na karcie: ${m.buttons}`);
        await historia(page, 'karta-mieszkanca-telefon', true);
      },
    },
    {
      // edytor imienia mieszkańca: siedem form ze słownika, zgadywane formy na bursztynowo, błąd przy znakach HTML,
      // Escape bez zapisu; końcowy zrzut to edytor z nowym imieniem i podpowiedzianymi formami
      name: 'imie-edytor',
      query: '',
      run: async (page, base) => {
        await wejdz(page, base);
        const r = await mieszkaniecZGeneratora(page, 0, true);
        await waitIdle(page);
        await otworzEdytor(page, r.id, false);
        const pola = await polaEdytora(page);
        const WIESLAWA = ['Wiesława', 'Wiesławy', 'Wiesławie', 'Wiesławę', 'Wiesławą', 'Wiesławie', 'Wiesławo'];
        if (pola.map((x) => x.value).join() !== WIESLAWA.join()) throw new Error(`formy: ${pola.map((x) => x.value)}`);
        if (pola.some((x) => x.niepewne)) throw new Error('słownikowe imię ma zgadywane formy');
        await edytorNaEkranie(page);
        // zgadywane formy: pola na bursztynowo i podpowiedź
        await wpisz(page, 'Xyz', false);
        const xyz = await polaEdytora(page);
        if (!xyz.slice(1).every((x) => x.niepewne)) throw new Error('„Xyz” bez zaznaczonych form');
        if (!(await page.isVisible('#card .imie-uwaga'))) throw new Error('brak podpowiedzi o zgadywanych formach');
        await page.screenshot({ path: path.join(OUT, 'imie-edytor-niepewne.png') });
        // znaki HTML: błąd w karcie, nic nie trafia do pamięci ani na stronę
        await wpisz(page, '<img src=x onerror=alert(1)>', false);
        await page.click('#card [data-card="imie-zapisz"]');
        await page.waitForSelector('#card .imie-blad:not([hidden])');
        const blad = await page.textContent('#card .imie-blad');
        console.log(`  błąd: „${blad}”`);
        if (await page.$('#card img')) throw new Error('imię z HTML weszło na stronę');
        if ((await polaEdytora(page)).slice(1).some((x) => x.value !== ''))
          throw new Error('złe imię dostało podpowiedzi form');
        if (await page.evaluate(() => localStorage.getItem('za-murem-0.4-imiona')))
          throw new Error('złe imię trafiło do pamięci');
        await page.screenshot({ path: path.join(OUT, 'imie-edytor-blad.png') });
        // Escape zamyka bez zapisu
        await page.focus('#card input[name="mian"]');
        await page.keyboard.press('Escape');
        await sprawdz(page, r.name);
        await otworzEdytor(page, r.id, false);
        await wpisz(page, 'Bożenka', false);
        const bozenka = await polaEdytora(page);
        console.log(`  formy: ${bozenka.map((x) => x.value).join(', ')}`);
        if (bozenka[4].value !== 'Bożenką') throw new Error(`narzędnik: ${bozenka[4].value}`);
      },
    },
    {
      // edytor na telefonie (390×844) na karcie zarządu: cały na ekranie, pola od 16 px, bez przewijania w bok
      name: 'imie-edytor-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await wejdz(page, base);
        await zarzadZGeneratora(page, 0);
        const a = await rdzen(page, 0);
        await page.touchscreen.tap(a.x, a.y);
        await page.waitForSelector('#card [data-card="imie"]');
        await page.tap('#card [data-card="imie"]');
        await page.waitForSelector('#card form.imie-ed');
        const f = await page.evaluate(() => {
          const st = window.zm!.sim!.st;
          return st.people[st.pawns.filter((q) => q.kind === 'core')[0].person].f;
        });
        await wpisz(page, f ? 'Bożenka' : 'Zbyszko', true);
        await edytorNaEkranie(page);
      },
    },
    {
      // po zapisie: nowe imię na karcie i w zapisie gry, pamięć tylko w przeglądarce (bez adresu otwartym tekstem
      // i bez żądań sieci z imieniem), Przywróć wraca do imienia z generatora; końcowy zrzut to karta po zmianie
      name: 'imie-po-zmianie',
      query: '',
      run: async (page, base) => {
        const siec: string[] = [];
        page.on('request', (q) => siec.push(`${q.url()} ${q.postData() ?? ''}`));
        await wejdz(page, base);
        const r = await mieszkaniecZGeneratora(page, 0, true);
        await waitIdle(page);
        const nazwisko = r.name.split(' ').slice(1).join(' ');
        await otworzEdytor(page, r.id, false);
        await wpisz(page, 'Bożenka', false);
        await page.click('#card [data-card="imie-zapisz"]');
        await sprawdz(page, `Bożenka ${nazwisko}`);
        const pamiec = await page.evaluate(() => localStorage.getItem('za-murem-0.4-imiona') ?? '');
        console.log(`  pamięć: ${pamiec}`);
        if (!pamiec.includes('"Bożenką"') || /przymorze|Przymorze|Gdańsk/.test(pamiec))
          throw new Error('pamięć imion bez zmiany albo z adresem');
        // przywrócenie: z powrotem imię z generatora i pusta pamięć
        await otworzEdytor(page, r.id, false);
        if (!(await page.$('#card [data-card="imie-przywroc"]'))) throw new Error('brak przycisku Przywróć');
        const zapisane = (await polaEdytora(page)).map((x) => x.value);
        if (zapisane[0] !== 'Bożenka') throw new Error(`edytor bez zapisanych form: ${zapisane}`);
        await page.click('#card [data-card="imie-przywroc"]');
        await sprawdz(page, r.name);
        if (await page.evaluate(() => localStorage.getItem('za-murem-0.4-imiona')))
          throw new Error('Przywróć nie wyczyścił pamięci');
        // jeszcze raz Enterem w polu imienia
        await otworzEdytor(page, r.id, false);
        await wpisz(page, 'Bożenka', false);
        await page.keyboard.press('Enter');
        await sprawdz(page, `Bożenka ${nazwisko}`);
        // zapis gry niesie nowe imię osoby
        const save = await page.evaluate(() => {
          window.zm!.save();
          return localStorage.getItem('za-murem-0.4-zapis') ?? '';
        });
        if (!save.includes(`Bożenka ${nazwisko}`)) throw new Error('zapis gry bez nowego imienia');
        if (siec.some((x) => x.includes('Bo%C5%BCenka') || x.includes('Bożenka')))
          throw new Error('imię poszło do sieci');
        console.log(`  żądań sieci: ${siec.length}, żadne z imieniem`);
        const d = await ekran(page, r.id);
        await page.mouse.move(d.x + 400, d.y - 250);
      },
    },
    ...mieszkancy(),
  ];
}

/** Udawany serwer gry pod /api (page.route): zdrowie, konto, klatki w pamięci, zapis w chmurze. zalogowani: GET
    /api/konto daje nick; zajete: cudze klatki na starcie; pierwsze: odpowiedź na pierwsze zajęcie (409: ktoś był
    szybszy, start bez domu). */
async function fakeApi(
  page: Page,
  o: {
    zalogowani?: boolean;
    zajete?: ZajetaKlatka[];
    pierwsze?: 201 | 409;
    chmura?: { dane: unknown; wersja: number };
  } = {},
) {
  const klatki = [...(o.zajete ?? [])];
  let zajec = 0;
  await page.route('**/api/**', async (r) => {
    const req = r.request();
    const path0 = new URL(req.url()).pathname.replace(/^.*\/api/, '');
    const m = req.method();
    const json = (status: number, body: unknown) =>
      r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path0 === '/zdrowie') return json(200, { ok: true, gra: 'za-murem', wersja: 1 });
    if (path0 === '/konto' && m === 'GET')
      return o.zalogowani
        ? json(200, { nick: 'Sasiedzi_z_Lanciego', utworzone: 1, klatki: 0, zapis: false })
        : json(401, { blad: 'brak_sesji', komunikat: 'Zalogujcie się.' });
    if (path0 === '/zapis' && m === 'GET')
      return o.chmura
        ? json(200, { dane: o.chmura.dane, wersja: o.chmura.wersja, zmieniony: 1, rozmiar: 1 })
        : json(404, { blad: 'brak_zapisu', komunikat: 'Nie ma zapisu.' });
    if (path0 === '/zapis' && m === 'PUT') {
      // zapis zostaje w udawanym serwerze (o.chmura) z wersją jak w prawdziwym: inna wersja bazowa to konflikt
      const body = req.postDataJSON() as { dane: unknown; wersja?: number };
      const obecna = o.chmura?.wersja ?? 0;
      if (body.wersja !== undefined && body.wersja !== obecna)
        return json(409, { blad: 'konflikt_wersji', komunikat: 'Na serwerze jest nowszy zapis.', wersja: obecna });
      o.chmura = { dane: body.dane, wersja: obecna + 1 };
      return json(200, { wersja: obecna + 1, zmieniony: 1, rozmiar: req.postData()?.length ?? 0 });
    }
    if (path0 === '/zapis' && m === 'DELETE') {
      o.chmura = undefined;
      return r.fulfill({ status: 204, body: '' });
    }
    if (path0 === '/klatki/moje' && m === 'DELETE') return r.fulfill({ status: 204, body: '' });
    if (path0 === '/klatki' && m === 'GET') return json(200, { klatki });
    if (path0 === '/klatki' && m === 'POST') {
      const k = req.postDataJSON() as Omit<ZajetaKlatka, 'moja'>;
      zajec++;
      if (zajec === 1 && o.pierwsze === 409) {
        klatki.push({ ...k, moja: false });
        return json(409, { blad: 'zajeta', komunikat: 'Ta klatka jest zajęta przez inną drużynę.' });
      }
      const kl: ZajetaKlatka = { ...k, moja: true, siedziba: zajec === 1 };
      klatki.push(kl);
      return json(201, { klatka: kl });
    }
    return json(404, { blad: 'nie_ma', komunikat: 'Nie ma takiego adresu API.' });
  });
}

/** osoby z generatora mieszkańców w grze: ile osób ma ref, zarząd z osobą z generatora, lokatorzy z osobą */
async function mieszkancyGry(page: Page) {
  return page.evaluate(() => {
    const st = window.zm!.sim!.st;
    const core = st.pawns.filter((p) => p.kind === 'core');
    const lok = st.pawns.filter((p) => p.kind === 'resident');
    return {
      refs: st.people.filter((p) => p.ref).length,
      core: core.length,
      zarzad: core.filter((p) => !!st.people[p.person]?.ref).length,
      lok: lok.length,
      zOsoba: lok.filter((p) => p.person >= 0).length,
    };
  });
}

/** cudze klatki z pięciu budynków mieszkalnych najbliżej siedziby Lanciego (bez samej siedziby) */
function cudzeKlatkiLanciego(): ZajetaKlatka[] {
  const a = ADDRESSES.find((x) => x.key === 'lanciego')!;
  const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
  const w = buildWorld(geo, { seed: 1 });
  const hq = w.buildings[w.hq];
  return w.buildings
    .filter((b) => b.id !== w.hq && (b.cls === 'blok' || b.cls === 'dom') && kluczBudynku(b))
    .sort((p, q) => Math.hypot(p.x0 - hq.x0, p.y0 - hq.y0) - Math.hypot(q.x0 - hq.x0, q.y0 - hq.y0) || p.id - q.id)
    .slice(0, 5)
    .map((b) => klatkiBudynku(b)[0])
    .map((k) => ({
      klucz: k.klucz,
      budynek: k.budynek,
      lat: Math.round(k.lat * 1e5) / 1e5,
      lon: Math.round(k.lon * 1e5) / 1e5,
      moja: false,
    }));
}

/** start gry z sąsiadami na Lanciego (sieć map z danych testowych, /api udawane) */
async function startSieci(page: Page, base: string) {
  await offlineNetwork(page);
  await page.goto(`${base}?siec=1&speed=0`);
  await page.waitForSelector('#siec:not([hidden]) .sc-who');
  await page.fill('#addr', 'Lanciego 10G, Warszawa');
  await page.click('#startForm button[type=submit]');
  await waitIdle(page);
}

/** zakłada konto w bloku „Gra z sąsiadami” (prawdziwy serwer za proxy Vite) i czeka na zalogowanie */
async function zalozKonto(page: Page, nick: string) {
  await page.waitForSelector('#siec:not([hidden]) #scNick');
  await page.fill('#scNick', nick);
  await page.fill('#scHaslo', `${nick}-haslo-123`);
  await page.click('[data-siec=zaloz]');
  await page.waitForSelector('#siec .sc-who');
}

function siecShots(): Shot[] {
  return [
    {
      // dwie drużyny na prawdziwym serwerze gry (w procesie, :memory:, za proxy /api z vite.config.ts): pierwsza zajmuje
      // klatkę pod adresem, druga z tym samym adresem zaczyna bez domu, a w bazie są obie drużyny bez adresu
      name: 'siec-dwie-druzyny',
      query: '',
      run: async (page, base) => {
        const gra = stworzSerwer({ baza: ':memory:', bezpieczneCiasteczko: false, hasla: { logN: 10, r: 8, p: 1 } });
        const srv = http.createServer((req, res) => gra.obsluz(req, res));
        const wolny = await new Promise<boolean>((ok) => {
          srv.once('error', () => ok(false));
          srv.listen(8787, '127.0.0.1', () => ok(true));
        });
        if (!wolny) {
          console.log('  port 8787 zajęty (działa inny serwer gry?): pomijam scenariusz');
          gra.zamknij();
          return;
        }
        try {
          await offlineNetwork(page);
          await page.goto(`${base}?siec=1&speed=0`);
          await zalozKonto(page, 'Pierwsi');
          await page.fill('#addr', 'Lanciego 10G, Warszawa');
          await page.click('#startForm button[type=submit]');
          await waitIdle(page);
          const a = await page.evaluate(() => window.zm!.siec());
          console.log(`  pierwsza drużyna: ${JSON.stringify(a.stan)}`);
          if (!a.stan?.dom) throw new Error('pierwsza drużyna nie dostała klatki pod adresem');
          // druga drużyna w tej samej przeglądarce: wylogowanie, nowe konto, ten sam adres
          await page.goto(`${base}?siec=1&speed=0`);
          await page.waitForSelector('#siec:not([hidden]) .sc-who');
          await page.click('[data-siec=wyloguj]');
          await zalozKonto(page, 'Drudzy');
          await page.fill('#addr', 'Lanciego 10G, Warszawa');
          await page.click('#startForm button[type=submit]');
          await waitIdle(page);
          const b = await page.evaluate(() => window.zm!.siec());
          console.log(`  druga drużyna: ${JSON.stringify(b.stan)}, znaczniki ${b.znaczniki.join(' ')}`);
          if (b.stan?.dom !== false || !b.znaczniki.includes('obca') || !b.znaczniki.includes('cel'))
            throw new Error('druga drużyna nie zaczęła bez domu przy zajętej klatce');
          const wiersze = gra.baza.db.prepare('SELECT konto, siedziba FROM klatki').all();
          const konta = gra.baza.db.prepare('SELECT * FROM konta').all() as Record<string, unknown>[];
          console.log(
            `  w bazie: ${konta.length} konta, ${wiersze.length} klatka; kolumny konta: ${Object.keys(konta[0]).join(', ')}`,
          );
          if (wiersze.length !== 1) throw new Error('w bazie powinna być jedna zajęta klatka');
          await page.evaluate(() => {
            const zm = window.zm!;
            const w = zm.sim!.w;
            const core = zm.sim!.st.pawns.filter((p) => p.kind === 'core');
            const door = w.buildings[w.hq].entrances[0].out;
            const dx = (door % w.size) + 0.5;
            const dy = Math.floor(door / w.size) + 0.5;
            const d = Math.hypot(core[0].x - dx, core[0].y - dy);
            zm.setCam((core[0].x + dx) / 2, (core[0].y + dy) / 2, Math.max(0.3, Math.min(0.9, 700 / ((d + 20) * 32))));
          });
          await waitIdle(page);
        } finally {
          srv.closeAllConnections();
          await new Promise<void>((ok) => srv.close(() => ok()));
          gra.zamknij();
        }
      },
    },
    {
      // blok „Gra z sąsiadami” tylko z ?siec=1 i przy działającym serwerze; niezalogowani widzą formularz i notkę
      name: 'siec-start',
      query: '',
      run: async (page, base) => {
        await fakeApi(page);
        // bez ?siec=1 blok zostaje ukryty, nawet gdy serwer odpowiada
        await page.goto(base);
        await page.waitForSelector('#demos button');
        if (!(await page.$eval('#siec', (e) => (e as HTMLElement).hidden))) throw new Error('blok sieci bez ?siec=1');
        await page.goto(`${base}?siec=1`);
        await page.waitForSelector('#siec:not([hidden]) #scNick');
        const note = await page.$eval('#siec', (e) => e.textContent ?? '');
        if (!note.includes('bez e-maila')) throw new Error('brak notki o koncie bez e-maila');
        // blok sieci spycha atrybucję mapy i link do danych mieszkańców niżej, ale oba zostają na karcie
        await atrybucjaStartu(page);
      },
    },
    {
      name: 'siec-start-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await fakeApi(page, { zalogowani: true });
        await page.goto(`${base}?siec=1`);
        await page.waitForSelector('#siec:not([hidden]) .sc-who');
        const bottom = await page.$eval('#startForm', (f) => f.getBoundingClientRect().bottom);
        console.log(`  formularz kończy się na ${Math.round(bottom)} px z 844`);
        if (bottom > 844) throw new Error('formularz adresu poza pierwszym ekranem telefonu');
      },
    },
    {
      // klatka pod adresem wolna: nasza (zielona), dookoła klatki innych drużyn (czerwone)
      name: 'siec-znaczniki',
      query: '',
      run: async (page, base) => {
        await fakeApi(page, { zalogowani: true, zajete: cudzeKlatkiLanciego() });
        await startSieci(page, base);
        const s = await page.evaluate(() => window.zm!.siec());
        console.log(`  stan ${JSON.stringify(s.stan)}, znaczniki ${s.znaczniki.join(' ')}`);
        if (!s.stan?.dom) throw new Error('klatka pod adresem nie została nasza');
        if (!s.znaczniki.includes('nasza') || !s.znaczniki.includes('obca')) throw new Error('brak znaczników');
        await page.evaluate(() => {
          const zm = window.zm!;
          const hq = zm.sim!.w.buildings[zm.sim!.w.hq];
          zm.setCam((hq.x0 + hq.x1) / 2, (hq.y0 + hq.y1) / 2, 0.3);
        });
        await waitIdle(page);
        const shown = await page.$$eval('#klatki .kl-zn:not([hidden])', (l) => l.length);
        console.log(`  znaczników na ekranie: ${shown}`);
        if (shown < 3) throw new Error('za mało znaczników na ekranie');
      },
    },
    {
      // ktoś zajął naszą klatkę: zarząd na ulicy przed jej drzwiami, cel „Bez domu”, znacznik wolnej klatki
      name: 'siec-bez-domu',
      query: '',
      run: async (page, base) => {
        await fakeApi(page, { zalogowani: true, zajete: cudzeKlatkiLanciego(), pierwsze: 409 });
        await startSieci(page, base);
        const s = await page.evaluate(() => window.zm!.siec());
        console.log(`  stan ${JSON.stringify(s.stan)}, znaczniki ${s.znaczniki.join(' ')}`);
        if (s.stan?.dom !== false) throw new Error('drużyna nie zaczęła bez domu');
        if (!s.znaczniki.includes('cel')) throw new Error('brak znacznika wolnej klatki');
        const goals = await page.$eval('#goals', (e) => e.textContent ?? '');
        if (!goals.includes('Bez domu')) throw new Error('brak celów „Bez domu”');
        const outside = await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          return zm
            .sim!.st.pawns.filter((p) => p.kind === 'core')
            .every((p) => w.bid[Math.floor(p.y) * w.size + Math.floor(p.x)] !== w.hq);
        });
        if (!outside) throw new Error('zarząd startuje w siedzibie zamiast na ulicy');
        // mieszkańcy z generatora także w grze z sąsiadami: zarząd z budynku siedziby, którą wybrał start sieciowy
        // (lokatorzy tylko w wydruku: ta siedziba nie ma pionków mieszkańców także bez generatora)
        const m = await mieszkancyGry(page);
        console.log(
          `  mieszkańcy z generatora: osób ${m.refs}, zarząd z osobą ${m.zarzad}/${m.core}, lokatorzy ${m.zOsoba}/${m.lok}`,
        );
        if (!m.refs || m.zarzad !== m.core) throw new Error('gra z sąsiadami bez mieszkańców z generatora');
        // karta osoby z generatora w grze z sąsiadami: napis o fikcji jest, zmiany imienia nie ma (zapis idzie na
        // serwer, imiona gracza zostają w przeglądarce)
        const kto = await page.evaluate(() => {
          const zm = window.zm!;
          const st = zm.sim!.st;
          const p = st.pawns.filter((q) => q.kind === 'core')[0];
          zm.setCam(p.x, p.y - 0.5, 1.3);
          return { id: p.id, name: st.people[p.person].name };
        });
        await waitIdle(page);
        const [kx, ky] = await page.evaluate((id) => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.find((q) => q.id === id)!;
          return zm.screenOf(p.x, p.y - 0.55);
        }, kto.id);
        await page.mouse.click(kx, ky);
        await page.waitForFunction(
          (n) => document.querySelector('#card:not([hidden]) h2')?.textContent === n,
          kto.name,
        );
        const karta = await page.evaluate(() => ({
          fikcja: !!document.querySelector('#card .fikcja'),
          imie: !!document.querySelector('#card [data-card="imie"]'),
        }));
        console.log(`  karta „${kto.name}”: napis o fikcji ${karta.fikcja}, zmiana imienia ${karta.imie}`);
        if (!karta.fikcja || karta.imie)
          throw new Error('w grze z sąsiadami karta daje zmianę imienia albo nie ma napisu');
        // kamera tak, żeby było widać zarząd na ulicy i drzwi nowej siedziby
        await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const core = zm.sim!.st.pawns.filter((p) => p.kind === 'core');
          const door = w.buildings[w.hq].entrances[0].out;
          const dx = (door % w.size) + 0.5;
          const dy = Math.floor(door / w.size) + 0.5;
          const d = Math.hypot(core[0].x - dx, core[0].y - dy);
          zm.setCam((core[0].x + dx) / 2, (core[0].y + dy) / 2, Math.max(0.3, Math.min(0.9, 700 / ((d + 20) * 32))));
        });
        await waitIdle(page);
      },
    },
    {
      // zapis w chmurze: gra bez domu zapisana, przeładowanie, „Kontynuuj z chmury” wraca do tej samej siedziby i stanu
      name: 'siec-chmura',
      query: '',
      run: async (page, base) => {
        const serwer: Parameters<typeof fakeApi>[1] = {
          zalogowani: true,
          zajete: cudzeKlatkiLanciego(),
          pierwsze: 409,
        };
        await fakeApi(page, serwer);
        await startSieci(page, base);
        // gra stoi (speed=0): zapis i stan w tej samej chwili
        const gra = () =>
          page.evaluate(() => {
            const zm = window.zm!;
            return {
              hq: zm.sim!.w.hq,
              stan: zm.siec().stan,
              tick: zm.sim!.st.tick,
              zarzad: zm
                .sim!.st.pawns.filter((p) => p.kind === 'core')
                .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                .join(' '),
              // osoby z generatora mieszkańców (imiona i ref) wracają z chmury takie same
              osoby: zm
                .sim!.st.people.filter((p) => p.ref)
                .map((p) => `${p.ref}:${p.name}`)
                .join(' '),
            };
          });
        const przed = await gra();
        if (!przed.osoby) throw new Error('gra z sąsiadami bez mieszkańców z generatora');
        await page.evaluate(() => window.zm!.save());
        for (let k = 0; k < 50 && !serwer.chmura; k++) await page.waitForTimeout(100);
        if (!serwer.chmura) throw new Error('zapis nie trafił do chmury');
        const tekst = JSON.stringify(serwer.chmura.dane);
        console.log(`  zapis w chmurze: ${Math.round(tekst.length / 1024)} KB`);
        if (tekst.includes('"addr"') || tekst.includes('"addr:')) throw new Error('adres w zapisie w chmurze');
        // nazwa ulicy z wpisanego adresu nie trafia do nazw budynków gry sieciowej
        if (tekst.includes('Lanciego 10G')) throw new Error('adres z formularza w nazwie budynku w zapisie w chmurze');
        await page.evaluate(() => localStorage.clear());
        await page.goto(`${base}?siec=1&speed=0`);
        await page.waitForSelector('[data-siec=chmura]');
        const label = await page.$eval('[data-siec=chmura]', (e) => e.textContent ?? '');
        console.log(`  przycisk: ${label}`);
        await page.click('[data-siec=chmura]');
        await waitIdle(page);
        const po = await gra();
        console.log(`  przed ${JSON.stringify(przed)}`);
        console.log(`  po    ${JSON.stringify(po)}`);
        if (JSON.stringify(po) !== JSON.stringify(przed))
          throw new Error('gra z chmury ma inną siedzibę, stan sieci, chwilę albo miejsca zarządu');
        // następny zapis idzie od wersji z chmury (bez konfliktu wersji)
        await page.evaluate(() => window.zm!.save());
        for (let k = 0; k < 50 && serwer.chmura.wersja < 2; k++) await page.waitForTimeout(100);
        console.log(`  wersja zapisu w chmurze po drugim zapisie: ${serwer.chmura.wersja}`);
        if (serwer.chmura.wersja !== 2) throw new Error('drugi zapis do chmury nie przeszedł');
      },
    },
    {
      // „Zajmij klatkę” pod prawym przyciskiem na wolnym budynku, bez zaznaczonych ludzi: potwierdzenie, zajęcie na
      // serwerze i zielony znacznik; na zrzucie menu na następnym wolnym budynku
      name: 'siec-menu',
      query: '',
      run: async (page, base) => {
        await fakeApi(page, { zalogowani: true, zajete: cudzeKlatkiLanciego() });
        await startSieci(page, base);
        /** prawy przycisk na drzwiach k-tego budynku mieszkalnego od siedziby; pozycje menu */
        const menuNa = async (k: number) => {
          const ok = await page.evaluate((k) => {
            const zm = window.zm!;
            const w = zm.sim!.w;
            const hq = w.buildings[w.hq];
            const b = w.buildings
              .filter((x) => x.id !== w.hq && (x.cls === 'blok' || x.cls === 'dom') && x.entrances.length)
              .sort((p, q) => Math.hypot(p.x0 - hq.x0, p.y0 - hq.y0) - Math.hypot(q.x0 - hq.x0, q.y0 - hq.y0))[k];
            if (!b) return false;
            const t = b.entrances[0].tile;
            zm.setCam((t % w.size) + 0.5, Math.floor(t / w.size) + 0.5, 0.9);
            return true;
          }, k);
          if (!ok) return null;
          await waitIdle(page);
          const xy = await page.evaluate((k) => {
            const zm = window.zm!;
            const w = zm.sim!.w;
            const hq = w.buildings[w.hq];
            const b = w.buildings
              .filter((x) => x.id !== w.hq && (x.cls === 'blok' || x.cls === 'dom') && x.entrances.length)
              .sort((p, q) => Math.hypot(p.x0 - hq.x0, p.y0 - hq.y0) - Math.hypot(q.x0 - hq.x0, q.y0 - hq.y0))[k];
            const t = b.entrances[0].tile;
            return zm.screenOf((t % w.size) + 0.5, Math.floor(t / w.size) + 0.5);
          }, k);
          await page.mouse.click(xy[0], xy[1], { button: 'right' });
          if (!(await page.waitForSelector('#ctx:not([hidden])', { timeout: 1500 }).catch(() => null))) return [];
          return page.locator('#ctx .ctx-item').allTextContents();
        };
        let k = 0;
        let items: string[] | null = [];
        for (; k < 20; k++) {
          items = await menuNa(k);
          if (!items || items.includes('Zajmij klatkę…')) break;
          await page.keyboard.press('Escape');
        }
        console.log(`  budynek ${k}: menu ${items?.join(' | ')}`);
        if (!items?.includes('Zajmij klatkę…')) throw new Error('brak „Zajmij klatkę” w menu');
        const przed = await page.evaluate(() => window.zm!.siec().klatki);
        await page.click('#ctx .ctx-item:has-text("Zajmij klatkę")');
        await page.click('#sheet [data-act="confirm-yes"]');
        await page.waitForFunction((n) => window.zm!.siec().klatki > n, przed, { timeout: 5000 });
        const s = await page.evaluate(() => window.zm!.siec());
        console.log(`  klatek ${przed} → ${s.klatki}, znaczniki ${s.znaczniki.join(' ')}`);
        if (s.znaczniki.filter((z) => z === 'nasza').length < 2) throw new Error('brak znacznika zajętej klatki');
        for (k++; k < 25; k++) {
          items = await menuNa(k);
          if (!items || items.includes('Zajmij klatkę…')) break;
          await page.keyboard.press('Escape');
        }
        console.log(`  budynek ${k}: menu ${items?.join(' | ')}`);
        await page.waitForTimeout(200);
      },
    },
    {
      // ktoś z zarządu staje w drzwiach nowej siedziby: klatka zajęta na serwerze i znacznik „wasza klatka”
      name: 'siec-dom',
      query: '',
      run: async (page, base) => {
        await fakeApi(page, { zalogowani: true, zajete: cudzeKlatkiLanciego(), pierwsze: 409 });
        await startSieci(page, base);
        await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const door = w.buildings[w.hq].entrances[0].out;
          const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
          p.x = (door % w.size) + 0.5;
          p.y = Math.floor(door / w.size) + 0.5;
          zm.setCam(p.x, p.y, 0.8);
        });
        await page.waitForFunction(() => window.zm!.siec().stan?.dom === true, null, { timeout: 10_000 });
        const s = await page.evaluate(() => window.zm!.siec());
        console.log(`  stan ${JSON.stringify(s.stan)}, znaczniki ${s.znaczniki.join(' ')}`);
        if (!s.znaczniki.includes('nasza')) throw new Error('brak znacznika naszej klatki');
        // cele odświeżają się co 200 ms: po zajęciu klatki wracają cele pierwszego dnia
        await page.waitForFunction(
          () => !(document.getElementById('goals')?.textContent ?? '').includes('Bez domu'),
          null,
          {
            timeout: 5000,
          },
        );
        await waitIdle(page);
      },
    },
  ];
}
