/* Zrzuty ekranu w prawdziwym Chromium: mapy testowe, kamera i pora dnia ustawiane w adresie.
   Uruchomienie: npm run shots [-- filtr] [--dist] [--kod]   (filtr: fragment nazwy; --dist: zbudowana wersja;
   --kod: ten sam scenariusz z ?grafika=kod, czyli bez grafiki z PixelLab, wynik w shots/kod/, do porównań)
   Wynik: shots/<nazwa>.png. Każdy zrzut obejrzyj, zanim zgłosisz zmianę.
   Język: pole `lang` scenariusza (przez pamięć przeglądarki, jak wybór gracza). Bez pola polski, bo starsze
   scenariusze sprawdzają polskie napisy; angielskie i polskie wersje tych samych ekranów to scenariusze en-* i pl-*. */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { stworzSerwer } from '../server/app.ts';
import type { ZajetaKlatka } from '../src/net/protokol.ts';
import { nazwaBudynkuEn } from '../src/world/classify.en.ts';
import { klatkiBudynku, kluczBudynku } from '../src/world/klucze.ts';
import { toGeoT } from '../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../src/world/world.ts';
import { ADDRESSES, decodedTiles } from '../tests/unit/fixtures.ts';
import { openSession, waitIdle, webglRenderer } from './browser.ts';
import { kotwicaArkusz, kotwicaStylu, kotwicaTlum, kotwicaWysokiBlok } from './kotwica.ts';
import { decodePng } from './png.ts';

const KOD = process.argv.includes('--kod');
const OUT = path.resolve(import.meta.dirname, KOD ? '../shots/kod' : '../shots');
fs.mkdirSync(OUT, { recursive: true });

interface Shot {
  name: string;
  query: string;
  w?: number;
  h?: number;
  /** ekran dotykowy także przy szerokim oknie (tablet): pointer coarse i dotyk w Playwright */
  touch?: boolean;
  /** zamiast samego adresu strony: własny scenariusz */
  run?: (page: Page, base: string) => Promise<void>;
  /** błędy konsoli, których scenariusz się spodziewa (np. 404 tabel zablokowanych przez scenariusz) */
  allow?: RegExp;
  /** z allow: błąd jest spodziewany tylko dla zasobu pod tym adresem (np. tylko tabele z data/mieszkancy/) */
  allowUrl?: RegExp;
  /** język gry (domyślnie polski, nagłówek pliku) */
  lang?: 'en' | 'pl';
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
/** zarząd z bronią walczy ze szwendaczami na podwórku; emeryci: cała czwórka zarządu to starsi mężczyźni (jedna postać
    z PixelLab w czterech wersjach kolorystycznych), żeby w kadrze były postacie z PixelLab z bronią */
async function zombieWalka(page: Page, base: string, emeryci = false) {
  await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&godzina=11&stado=10&cam=hq,1`);
  await waitIdle(page);
  if (emeryci)
    await page.evaluate(() => {
      const zm = window.zm!;
      const st = zm.sim!.st;
      for (const p of st.pawns) if (p.kind === 'core') Object.assign(st.people[p.person], { f: false, age: 70 });
      (zm.view as unknown as { ludzie: { zapomnijWszystko(): void } | null }).ludzie?.zapomnijWszystko();
    });
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
}

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
  // Mapa miasta w grze: okolica z punktów OSM i stan miasta w zarządzie po starcie, opcja ?miasto=0
  ...miastoShots(),
  // Piętra (etap 1, flaga ?pietra=1): przekrój wybranego piętra ze stropem, kafelek z listą, podpowiedzi
  ...pietraShots(),
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
    // tłum ponad próg przy jednym miejscu siatki (płot odporny na napór): zużyta siatka bez desek, pasek na czerwono
    name: 'zombie-tlok',
    query: '',
    run: async (page, base) => zombieCrowd(page, base),
  },
  {
    name: 'zombie-tlok-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => zombieCrowd(page, base),
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
    run: (page, base) => zombieWalka(page, base),
  },
  {
    name: 'kotwica-walka',
    query: '',
    run: (page, base) => zombieWalka(page, base, true),
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
  // surowce (docs/superpowers/specs/2026-10-18-surowce-design.md): wraki w trzech stanach, sterty części i leków,
  // menu wraku i warsztatu
  ...((): Shot[] => {
    /** wraki świata posortowane od najbliższego drzwiom siedziby */
    const nearWrecks = () => {
      const zm = window.zm!;
      const w = zm.sim!.w;
      const door = w.buildings[w.hq].entrances[0].out;
      const dx = door % w.size;
      const dy = Math.floor(door / w.size);
      return w.props
        .filter((p) => p.kind === 'wrak')
        .sort((a, b) => Math.hypot(a.x - dx, a.y - dy) - Math.hypot(b.x - dx, b.y - dy));
    };
    /** zaznaczenie pierwszej osoby z zarządu kliknięciem w głowę (kamera na siedzibie) */
    const select = async (page: Page) => {
      const a = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
        zm.setCam(p.x, p.y, 1.3);
        return [p.x, p.y];
      });
      await waitIdle(page);
      const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py - 0.55), a);
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
      if (!(await page.isVisible('#card'))) throw new Error('karta osoby nie pokazała się po zaznaczeniu');
    };
    const menuAt = async (page: Page, x: number, y: number) => {
      await page.mouse.click(x, y, { button: 'right' });
      await page.waitForSelector('#ctx:not([hidden])');
      return page.locator('#ctx .ctx-item').allTextContents();
    };
    return [
      {
        name: 'surowce-wraki',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
          await waitIdle(page);
          await page.evaluate((src) => {
            const near = new Function(`return (${src})()`) as () => { x: number; y: number; w: number; h: number }[];
            const zm = window.zm!;
            const sim = zm.sim!;
            const size = sim.w.size;
            const wr = near();
            sim.st.wraki = [
              { t: wr[0].y * size + wr[0].x, s: 1 as const },
              { t: wr[1].y * size + wr[1].x, s: 2 as const },
            ].sort((a, b) => a.t - b.t);
            const three = wr.slice(0, 3);
            const cx = three.reduce((a, p) => a + p.x + p.w / 2, 0) / three.length;
            const cy = three.reduce((a, p) => a + p.y + p.h / 2, 0) / three.length;
            zm.setCam(cx, cy, 1.5);
          }, nearWrecks.toString());
          await waitIdle(page);
          const stages = (await thingKeys(page))
            .filter((k) => k.includes('"kind":"wrak"'))
            .map((k) => /"stage":(\d)/.exec(k)?.[1] ?? '0');
          console.log(`  wraki według stanu: ${stages.join(', ')}`);
          for (const s of ['0', '1', '2']) if (!stages.includes(s)) throw new Error(`nie widać wraku w stanie ${s}`);
        },
      },
      {
        name: 'surowce-sterty',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1`);
          await waitIdle(page);
          await page.evaluate(() => {
            const zm = window.zm!;
            const sim = zm.sim!;
            const w = sim.w;
            const size = w.size;
            const st = sim.st;
            const taken = (i: number) =>
              st.things.some(
                (t) =>
                  i % size >= t.x - 1 &&
                  i % size < t.x + t.w + 1 &&
                  Math.floor(i / size) >= t.y - 1 &&
                  Math.floor(i / size) < t.y + t.h + 1,
              );
            // sześć wolnych kafelków podwórka w rzędzie (co drugi, żeby sterty się nie zlewały)
            const yard = new Set(w.fence.yard);
            let row: number[] = [];
            for (const i of w.fence.yard) {
              const ok = (k: number) => yard.has(i + 2 * k) && !w.blocked[i + 2 * k] && !taken(i + 2 * k);
              if ([0, 1, 2, 3, 4, 5].every(ok)) {
                row = [0, 1, 2, 3, 4, 5].map((k) => i + 2 * k);
                break;
              }
            }
            const piles: [string, number][] = [
              ['czesci', 1],
              ['czesci', 4],
              ['czesci', 8],
              ['leki', 1],
              ['leki', 4],
              ['leki', 8],
            ];
            piles.forEach(([kind, n], k) => {
              const i = row[k];
              st.things.push({
                id: 992000 + k,
                kind,
                x: i % size,
                y: Math.floor(i / size),
                w: 1,
                h: 1,
                rot: 0,
                n,
                fuel: 0,
                by: -1,
                owner: -1,
              });
            });
            zm.setCam((row[0] % size) + 6, Math.floor(row[0] / size) + 0.5, 2.4);
          });
          await waitIdle(page);
          const keys = (await thingKeys(page)).filter((k) => /"kind":"(czesci|leki)"/.test(k));
          console.log(`  sterty części i leków: ${keys.length}`);
          if (keys.length !== 6) throw new Error('nie widać stert części i leków');
        },
      },
      {
        name: 'surowce-menu-wrak',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          const at = await page.evaluate((src) => {
            const near = new Function(`return (${src})()`) as () => { x: number; y: number; w: number; h: number }[];
            const r = near()[0];
            window.zm!.setCam(r.x + r.w / 2, r.y + r.h / 2, 1.6);
            return [r.x + r.w / 2, r.y + r.h / 2];
          }, nearWrecks.toString());
          await waitIdle(page);
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          console.log(`  menu: ${items.join(' | ')}`);
          if (!items.some((i) => i.startsWith('Przeszukać'))) throw new Error('w menu wraku nie ma przeszukania');
        },
      },
      {
        // rozbiórka przeszukanego wraku łomem: poza pracy przy aucie, potem łup niesiony na podwórko
        name: 'surowce-praca',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await page.evaluate((src) => {
            const near = new Function(`return (${src})()`) as () => { x: number; y: number; w: number; h: number }[];
            const zm = window.zm!;
            const sim = zm.sim!;
            const r = near()[0];
            const t = r.y * sim.w.size + r.x;
            sim.st.wraki = [{ t, s: 1 }];
            const p = sim.st.pawns.find((q) => q.kind === 'core')!;
            p.weapon = 'lom';
            sim.push({ t: 'wreck', ids: [p.id], tile: t, how: 'rozbierz' });
          }, nearWrecks.toString());
          // do wraku i chwila pracy
          for (let k = 0; k < 12; k++) {
            const busy = await page.evaluate(() => {
              const p = window.zm!.sim!.st.pawns.find((q) => q.kind === 'core')!;
              return p.job?.t === 'wreck' && p.job.phase === 1;
            });
            if (busy) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          await page.evaluate(() => window.zm!.ff(10));
          const job = await page.evaluate(() => {
            const zm = window.zm!;
            const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
            zm.setCam(p.x, p.y, 2.2);
            return `${p.job?.t}/${p.job?.what}/${p.job?.phase}`;
          });
          await waitIdle(page);
          console.log(`  praca: ${job}`);
          if (job !== 'wreck/rozbierz/1') throw new Error(`zarząd nie rozbiera wraku (${job})`);
          await page.screenshot({ path: path.join(OUT, 'surowce-praca-rozbiorka.png') });
          // do końca rozbiórki (z łomem godzina albo pięć kwadransów) i pierwszy kurs z łupem
          for (let k = 0; k < 40; k++) {
            const carrying = await page.evaluate(() => {
              const p = window.zm!.sim!.st.pawns.find((q) => q.kind === 'core')!;
              return p.job?.t === 'carry' && p.job.phase === 1;
            });
            if (carrying) break;
            await page.evaluate(() => window.zm!.ff(3));
          }
          await page.evaluate(() => window.zm!.ff(0.5));
          const after = await page.evaluate(() => {
            const zm = window.zm!;
            const p = zm.sim!.st.pawns.find((q) => q.kind === 'core')!;
            zm.setCam(p.x, p.y, 2.2);
            return {
              job: `${p.job?.t}/${p.job?.phase}`,
              what: p.job?.what,
              n: p.job?.n,
              wraki: JSON.stringify(zm.sim!.st.wraki),
            };
          });
          await waitIdle(page);
          console.log(`  potem: ${after.job}, w rękach ${after.n} ${after.what}, wraki ${after.wraki}`);
          if (after.job !== 'carry/1') throw new Error('łup nie idzie na podwórko');
        },
      },
      {
        // handlarz pod bramą drugiego dnia: z wózkiem, menu z towarem (wyszarzone bez materiału), potem napaść
        name: 'handlarz',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          await page.evaluate(() => {
            const sim = window.zm!.sim!;
            const st = sim.st;
            // dzień 2, 10:00, wizyta od razu
            st.tick = Math.round(((24 + 10 - 15) * 60 * 800) / 60);
            st.obcy!.next = st.tick;
          });
          for (let k = 0; k < 30; k++) {
            const ok = await page.evaluate(
              () => window.zm!.sim!.st.pawns.find((p) => p.kind === 'handlarz')?.job?.phase === 1,
            );
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const t = zm.sim!.st.pawns.find((p) => p.kind === 'handlarz')!;
            zm.setCam(t.x, t.y - 1, 2);
            return [t.x, t.y - 0.4];
          });
          await waitIdle(page);
          const cart = (await thingKeys(page)).filter((k) => k.includes('"kind":"wozek"'));
          console.log(`  wózek: ${cart.length}`);
          if (cart.length !== 1) throw new Error('nie widać wózka handlarza');
          await page.screenshot({ path: path.join(OUT, 'handlarz-brama.png') });
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          const off = await page.locator('#ctx .ctx-item.off').count();
          console.log(`  menu: ${items.join(' | ')} (wyszarzone: ${off})`);
          if (!items.some((i) => i.startsWith('Dać ')) || !items.some((i) => i.startsWith('Napaść')))
            throw new Error('w menu handlarza nie ma towaru albo napaści');
          await page.screenshot({ path: path.join(OUT, 'handlarz-menu.png') });
          await page.keyboard.press('Escape');
          // napaść bez okna potwierdzenia (polecenie wprost) i chwila ucieczki
          await page.evaluate(() => {
            const sim = window.zm!.sim!;
            const p = sim.st.pawns.find((q) => q.kind === 'core')!;
            sim.push({ t: 'rob', ids: [p.id] });
          });
          for (let k = 0; k < 20; k++) {
            const done = await page.evaluate(() => window.zm!.sim!.st.obcy!.napad >= 0);
            if (done) break;
            await page.evaluate(() => window.zm!.ff(1));
          }
          // kilka sekund walki: handlarz z siekierą oddaje, paski życia
          await page.evaluate(() => window.zm!.ff(0.15));
          const after = await page.evaluate(() => {
            const zm = window.zm!;
            const st = zm.sim!.st;
            const c = st.things.find((t) => t.kind === 'wozek')!;
            const t = st.pawns.find((q) => q.kind === 'handlarz');
            zm.setCam(t ? t.x : c.x + 0.5, t ? t.y - 1 : c.y, 2.2);
            return { napad: st.obcy!.napad, cart: c.n, wrogi: !!t?.wrogi, bron: t?.weapon ?? null };
          });
          await waitIdle(page);
          console.log(`  po napaści: ${JSON.stringify(after)}`);
          if (after.napad < 0 || after.cart !== 0) throw new Error('napaść nie zadziałała');
          await page.screenshot({ path: path.join(OUT, 'handlarz-walka.png') });
          // ludzie handlarza pod siatką (za dnia, żeby było ich widać na zrzucie)
          await page.evaluate(() => {
            const st = window.zm!.sim!.st;
            for (const q of st.pawns) if (q.kind === 'handlarz') q.hp = 1;
            st.obcy!.zemsta = { at: st.tick + 1, n: 4 };
          });
          for (let k = 0; k < 20; k++) {
            const ok = await page.evaluate(() => {
              const men = window.zm!.sim!.st.pawns.filter((q) => q.kind === 'zbir');
              return men.length > 0 && men.every((q) => q.job?.phase !== 0);
            });
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(1));
          }
          const men = await page.evaluate(() => {
            const zm = window.zm!;
            const st = zm.sim!.st;
            const m = st.pawns.filter((q) => q.kind === 'zbir');
            if (m.length) zm.setCam(m[0].x, m[0].y - 1, 1.8);
            return m.map((q) => q.weapon).join(', ');
          });
          await waitIdle(page);
          console.log(`  ludzie handlarza: ${men}`);
          if (!men) throw new Error('nie przyszli ludzie handlarza');
        },
      },
      {
        // to samo menu handlarza po angielsku: oferty „Give … for …”, wyszarzona z powodem, napaść
        name: 'en-handlarz-menu',
        query: '',
        lang: 'en',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          await page.evaluate(() => {
            const st = window.zm!.sim!.st;
            st.tick = Math.round(((24 + 10 - 15) * 60 * 800) / 60);
            st.obcy!.next = st.tick;
          });
          for (let k = 0; k < 30; k++) {
            const ok = await page.evaluate(
              () => window.zm!.sim!.st.pawns.find((p) => p.kind === 'handlarz')?.job?.phase === 1,
            );
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const t = zm.sim!.st.pawns.find((p) => p.kind === 'handlarz')!;
            zm.setCam(t.x, t.y - 1, 2);
            return [t.x, t.y - 0.4];
          });
          await waitIdle(page);
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          console.log(`  menu: ${items.join(' | ')}`);
          if (!items.some((i) => i.startsWith('Give ')) || !items.includes('Rob the trader…'))
            throw new Error('w angielskim menu handlarza nie ma towaru albo napaści');
          if (items.some((i) => /[ąćęłńóśźż]|\bboards?\b/i.test(i))) throw new Error('w menu handlarza polskie słowa');
        },
      },
      {
        // tryb zombie: handlarz czwartego dnia przy zamkniętej bramie, na chwilę (szwendacze zdjęte do zrzutu)
        name: 'handlarz-zombie',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          // dzień 4, 10:00; wizyta może nie dojść do skutku, więc ponawiamy termin, aż handlarz wyjdzie
          for (let k = 0; k < 12; k++) {
            const here = await page.evaluate(() => {
              const st = window.zm!.sim!.st;
              if (k0() === 0) st.tick = 15200 + 2 * 19200;
              st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
              if (!st.pawns.some((p) => p.kind === 'handlarz')) st.obcy!.next = st.tick;
              return st.pawns.some((p) => p.kind === 'handlarz');
              function k0() {
                return st.tick < 15200 + 2 * 19200 ? 0 : 1;
              }
            });
            if (here) break;
            await page.evaluate(() => window.zm!.ff(0.2));
          }
          for (let k = 0; k < 30; k++) {
            const ok = await page.evaluate(() => {
              const st = window.zm!.sim!.st;
              st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
              return st.pawns.find((p) => p.kind === 'handlarz')?.job?.phase === 1;
            });
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(1));
          }
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const t = zm.sim!.st.pawns.find((p) => p.kind === 'handlarz');
            if (t) zm.setCam(t.x, t.y - 1, 2);
            return t ? `${t.job?.phase}` : 'brak';
          });
          await waitIdle(page);
          console.log(`  handlarz w trybie zombie: faza ${at}`);
          if (at !== '1') throw new Error('handlarz w trybie zombie nie stanął przy bramie');
        },
      },
      {
        // wędrowiec przy siatce (menu, rozmowa i wieść), potem obca ekipa przy wraku (Przeszukać wyszarzone)
        name: 'obcy',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          // dzień 2, 10:00: tylko wędrowiec (handlarz i ekipa daleko)
          await page.evaluate(() => {
            const o = window.zm!.sim!.st;
            o.tick = 15200;
            o.obcy!.next = 15200 * 20;
            o.obcy!.wnext = 15200;
            o.obcy!.enext = 15200 * 20;
          });
          for (let k = 0; k < 40; k++) {
            const ok = await page.evaluate(
              () => window.zm!.sim!.st.pawns.find((p) => p.kind === 'wedrowiec')?.job?.phase === 1,
            );
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const t = zm.sim!.st.pawns.find((p) => p.kind === 'wedrowiec')!;
            zm.setCam(t.x, t.y - 1, 2);
            return [t.x, t.y - 0.4];
          });
          await waitIdle(page);
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          console.log(`  menu wędrowca: ${items.join(' | ')}`);
          if (!items.includes('Zagadać') || !items.some((i) => i.startsWith('Napaść na wędrowca')))
            throw new Error('w menu wędrowca nie ma rozmowy albo napaści');
          await page.screenshot({ path: path.join(OUT, 'obcy-wedrowiec-menu.png') });
          await page.click('#ctx .ctx-item:has-text("Zagadać")');
          for (let k = 0; k < 20; k++) {
            const done = await page.evaluate(() => !!window.zm!.sim!.st.obcy!.wiesc);
            if (done) break;
            await page.evaluate(() => window.zm!.ff(1));
          }
          const wiesc = await page.evaluate(() => window.zm!.sim!.st.obcy!.wiesc?.text ?? '');
          console.log(`  wieść: ${wiesc}`);
          if (!wiesc.startsWith('Wędrowiec mówi')) throw new Error('rozmowa nie dała wieści');
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(OUT, 'obcy-wiesc.png') });
          // dzień 3, 10:00: obca ekipa przy wraku
          await page.evaluate(() => {
            const o = window.zm!.sim!.st;
            o.tick = 15200 + 19200;
            o.obcy!.wnext = 15200 * 20;
            o.obcy!.enext = o.tick;
          });
          for (let k = 0; k < 40; k++) {
            const ok = await page.evaluate(() => {
              const crew = window.zm!.sim!.st.pawns.filter((p) => p.kind === 'obcy');
              return crew.length === 2 && crew.every((p) => p.job?.phase === 1);
            });
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          const wr = await page.evaluate(() => {
            const zm = window.zm!;
            const sim = zm.sim!;
            const t = sim.st.pawns.find((p) => p.kind === 'obcy')!.job!.target;
            const size = sim.w.size;
            zm.setCam((t % size) + 1.5, Math.floor(t / size) + 0.5, 2);
            return [(t % size) + 1, Math.floor(t / size) + 1];
          });
          await waitIdle(page);
          const [wx, wy] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), wr);
          const wItems = await menuAt(page, wx, wy);
          const off = await page.locator('#ctx .ctx-item.off').allTextContents();
          console.log(`  menu wraku: ${wItems.join(' | ')} (wyszarzone: ${off.join(', ')})`);
          if (!off.some((t) => t.includes('przy aucie są obcy')))
            throw new Error('przeszukanie wraku przy obcych nie jest wyszarzone');
        },
      },
      {
        // wędrowiec po angielsku: menu „Talk to the wanderer” i „Rob the wanderer…”, po rozmowie wieść na dole
        // ekranu po angielsku (w stanie zostaje po polsku, tłumaczy ją wiescEn)
        name: 'en-obcy',
        query: '',
        lang: 'en',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          await page.evaluate(() => {
            const o = window.zm!.sim!.st;
            o.tick = 15200;
            o.obcy!.next = 15200 * 20;
            o.obcy!.wnext = 15200;
            o.obcy!.enext = 15200 * 20;
          });
          for (let k = 0; k < 40; k++) {
            const ok = await page.evaluate(
              () => window.zm!.sim!.st.pawns.find((p) => p.kind === 'wedrowiec')?.job?.phase === 1,
            );
            if (ok) break;
            await page.evaluate(() => window.zm!.ff(2));
          }
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const t = zm.sim!.st.pawns.find((p) => p.kind === 'wedrowiec')!;
            zm.setCam(t.x, t.y - 1, 2);
            return [t.x, t.y - 0.4];
          });
          await waitIdle(page);
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          console.log(`  menu wędrowca: ${items.join(' | ')}`);
          if (!items.includes('Talk to the wanderer') || !items.includes('Rob the wanderer…'))
            throw new Error('w angielskim menu wędrowca nie ma rozmowy albo napaści');
          await page.click('#ctx .ctx-item:has-text("Talk to the wanderer")');
          for (let k = 0; k < 20; k++) {
            const done = await page.evaluate(() => !!window.zm!.sim!.st.obcy!.wiesc);
            if (done) break;
            await page.evaluate(() => window.zm!.ff(1));
          }
          await page.waitForTimeout(300);
          const hint = (await page.textContent('#hint')) ?? '';
          console.log(`  wieść: ${hint}`);
          if (!hint.startsWith('The wanderer says')) throw new Error(`wieść nie po angielsku: ${hint}`);
        },
      },
      {
        name: 'surowce-menu-warsztat',
        query: '',
        run: async (page, base) => {
          await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
          await waitIdle(page);
          await select(page);
          const at = await page.evaluate(() => {
            const zm = window.zm!;
            const sim = zm.sim!;
            const w = sim.w;
            const h = w.interior!;
            const size = w.size;
            const st = sim.st;
            const covered = (i: number) =>
              st.things.some(
                (t) =>
                  i % size >= t.x &&
                  i % size < t.x + t.w &&
                  Math.floor(i / size) >= t.y &&
                  Math.floor(i / size) < t.y + t.h,
              );
            const rooms = h.rooms.filter((r) => r.apt === h.home && r.kind === 'pokoj').map((r) => r.id);
            let at = -1;
            for (let i = 0; i < size * size && at < 0; i++)
              if (
                rooms.includes(h.room[i]) &&
                h.room[i + 1] === h.room[i] &&
                !sim.blocked[i] &&
                !sim.blocked[i + 1] &&
                !covered(i) &&
                !covered(i + 1)
              )
                at = i;
            st.things.push({
              id: 993000,
              kind: 'warsztat',
              x: at % size,
              y: Math.floor(at / size),
              w: 2,
              h: 1,
              rot: 0,
              n: 0,
              fuel: 0,
              by: -1,
              owner: -1,
            });
            // drewno i złom na podwórku
            const free = w.fence.yard.filter((i) => !covered(i) && !sim.blocked[i]);
            st.things.push({
              id: 993001,
              kind: 'drewno',
              x: free[0] % size,
              y: Math.floor(free[0] / size),
              w: 1,
              h: 1,
              rot: 0,
              n: 9,
              fuel: 0,
              by: -1,
              owner: -1,
            });
            st.things.push({
              id: 993002,
              kind: 'zlom',
              x: free[3] % size,
              y: Math.floor(free[3] / size),
              w: 1,
              h: 1,
              rot: 0,
              n: 5,
              fuel: 0,
              by: -1,
              owner: -1,
            });
            zm.setCam((at % size) + 1, Math.floor(at / size) + 0.5, 1.8);
            return [(at % size) + 1, Math.floor(at / size) + 0.5];
          });
          await waitIdle(page);
          const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
          const items = await menuAt(page, x, y);
          console.log(`  menu: ${items.join(' | ')}`);
          for (const want of ['Piłować deskę z drewna', 'Zrobić część ze złomu'])
            if (!items.includes(want)) throw new Error(`w menu warsztatu nie ma „${want}”`);
          if (!items.some((t) => /^Piłować \d desk/.test(t)) || !items.some((t) => /^Zrobić \d części/.test(t)))
            throw new Error('w menu warsztatu nie ma przeróbki kilku sztuk naraz');
        },
      },
    ];
  })(),
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
    // zarząd z PixelLab w pozach pracy: czterech starszych mężczyzn gra jedną postać (emeryta) w czterech wersjach
    // kolorystycznych, na podwórku (rąbie, niesie, wartuje) i w mieszkaniu (śpi, siedzi, dokłada do kozy, gotuje)
    name: 'kotwica-pozy',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        for (const p of st.pawns) if (p.kind === 'core') Object.assign(st.people[p.person], { f: false, age: 70 });
        (zm.view as unknown as { ludzie: { zapomnijWszystko(): void } | null }).ludzie?.zapomnijWszystko();
      });
      await stage(page, 'podworko', 0);
      await waitIdle(page);
      await poseCheck(page, ['chop', 'carry', 'guard', 'carry']);
    },
  },
  {
    name: 'kotwica-pozy-dom',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await page.evaluate(() => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        for (const p of st.pawns) if (p.kind === 'core') Object.assign(st.people[p.person], { f: false, age: 70 });
        (zm.view as unknown as { ludzie: { zapomnijWszystko(): void } | null }).ludzie?.zapomnijWszystko();
      });
      await stage(page, 'dom', 0);
      await stage(page, 'dom', 1);
      await waitIdle(page);
      await poseCheck(page, ['lie', 'sit', 'crouch', 'cook']);
    },
  },
  {
    // leżenie z PixelLab: jeden z zarządu śpi w łóżku (głowa na poduszce, koc), drugi na podłodze obok, reszta pracuje;
    // z --kod to samo z kodu, do porównania
    name: 'kotwica-lezenie-dom',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      await stage(page, 'dom', 0);
      await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const size = sim.w.size;
        const core = st.pawns.filter((p) => p.kind === 'core');
        const lozko = st.things.find((t) => t.kind === 'lozko' || t.kind === 'wersalka')!;
        const wolny = (x: number, y: number) =>
          !sim.blocked[y * size + x] && !st.things.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
        // wolny kafelek najbliżej łóżka (poza nim), na nim ktoś śpi bez łóżka: na podłodze
        let najblizszy: [number, number] | null = null;
        let najblizej = 1e9;
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const x = lozko.x + dx;
            const y = lozko.y + dy;
            const d = Math.hypot(dx, dy);
            // z wolnym otoczeniem 3 × 3, żeby żadna szafa nie zasłaniała leżącego
            if (d >= 2.5 && d < najblizej && [-1, 0, 1].every((a) => [-1, 0, 1].every((b) => wolny(x + a, y + b)))) {
              najblizej = d;
              najblizszy = [x, y];
            }
          }
        const [fx, fy] = najblizszy!;
        const job = {
          t: 'sleep',
          target: -1,
          tile: fy * size + fx,
          phase: 1,
          from: -1,
          t0: st.tick,
          until: st.tick + 99999,
          order: false,
        };
        Object.assign(core[1], {
          x: fx + 0.5,
          y: fy + 0.5,
          path: [],
          pi: 0,
          dir: 0,
          job,
          carry: 0,
          wait: st.tick + 99999,
        });
        // kamera na obu śpiących (łóżko i podłoga), z boku od kozy i kuchni
        zm.setCam((core[0].x + core[1].x) / 2, (core[0].y + core[1].y) / 2, 3.4);
      });
      await waitIdle(page);
      const rodzaje = await page.evaluate(() => {
        const zm = window.zm!;
        return zm
          .sim!.st.pawns.filter((p) => p.kind === 'core')
          .map((p) => zm.view.poses.get(p.id)!.lie?.kind ?? 'stoi');
      });
      console.log(`  leżenie: ${rodzaje.join(', ')}`);
      if (rodzaje[0] !== 'bed' || rodzaje[1] !== 'floor')
        throw new Error(`leżenie ${rodzaje.join()} zamiast bed, floor`);
    },
  },
  {
    // zwłoki z PixelLab w rzędzie co dwa kafelki: osiem postaci (wygląd z gry 0 do 7), głową w cztery strony (strona z
    // numeru rzeczy), a na końcu zmarły z zarządu w swojej postaci; z --kod to samo z kodu
    name: 'kotwica-lezenie-zwloki',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      const start = await wolnyRzad(page, 18);
      if (!start) throw new Error('nie ma wolnego rzędu 18 kafelków na zwłoki');
      const rzad = await page.evaluate(([x0, y0]) => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        // id podzielne przez 4: rzecz o numerze k leży głową w stronę k & 3
        for (let k = 0; k < 8; k++)
          st.things.push({
            id: 993000 + k,
            kind: 'zwloki',
            x: x0 + 2 * k,
            y: y0,
            w: 1,
            h: 1,
            rot: 0,
            n: k,
            fuel: 0,
            by: -1,
            owner: -1,
          });
        // dziewiąte: zmarły z zarządu (wpis zmarłych z id osoby), więc zwłoki mają tę samą postać co on za życia
        const p0 = st.pawns.find((p) => p.kind === 'core')!;
        const dead = st.dead!;
        dead.push({
          id: st.people[p0.person].id,
          name: st.people[p0.person].name,
          look: p0.look,
          kind: 'core',
          tick: st.tick,
          cause: 'rany',
        });
        st.things.push({
          id: 993008,
          kind: 'zwloki',
          x: x0 + 16,
          y: y0,
          w: 1,
          h: 1,
          rot: 0,
          n: p0.look,
          fuel: 0,
          by: -1,
          owner: -1,
          dead: dead.length - 1,
        });
        zm.setCam(x0 + 9, y0 + 0.5, 2.2);
        return 9;
      }, start);
      console.log(`  zwłoki: ${rzad}`);
      await waitIdle(page);
      // zwłoki członka zarządu mają teksturę postaci, którą ten sam człowiek gra za życia
      const zgodne = await page.evaluate(() => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        const v = zm.view as unknown as {
          ludzie: null | {
            dane: { postacPionka(p: unknown, o: unknown): unknown };
            lezenie(p: unknown, w: number, o: number, r: string): { tex: unknown } | null;
          };
          corpseSprites: Map<number, { texture: unknown }>;
        };
        // z --kod (?grafika=kod) warstwy PixelLab nie ma, a zwłoki są z kodu
        if (!v.ludzie) return true;
        const p0 = st.pawns.find((p) => p.kind === 'core')!;
        const tex = v.ludzie.lezenie(v.ludzie.dane.postacPionka(p0, st.people), 0, 993008 & 3, 'floor')!.tex;
        return v.corpseSprites.get(993008)!.texture === tex;
      });
      if (!zgodne) throw new Error('zwłoki członka zarządu nie mają jego postaci');
    },
  },
  {
    // nakładka broni na klatkach ciosu z PixelLab: czterech z zarządu w rzędzie, każdy w innej klatce walki: zamach kijem
    // z przodu i z tyłu, dokończenie z boku, pchnięcie dzidą z przodu; z --kod to samo z kodu, do porównania
    name: 'kotwica-bron-cios',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,2`);
      await waitIdle(page);
      const start = await wolnyRzad(page, 12);
      if (!start) throw new Error('nie ma wolnego rzędu 12 kafelków na walczących');
      await page.evaluate(([x0, y0]) => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        const size = sim.w.size;
        const core = st.pawns.filter((p) => p.kind === 'core');
        // bez ruchu i z pracą walki (faza 1): poza ciosu, klatka z czasu od ostatniego ciosu (cd względem ticku)
        const ustaw = (k: number, x: number, bron: string, dir: number, od: number) => {
          const p = core[k];
          const job = {
            t: 'fight',
            target: -1,
            tile: y0 * size + x,
            phase: 1,
            from: -1,
            t0: st.tick,
            until: st.tick + 99999,
            order: false,
          };
          // od ciosu minęło `od` ticków: klatka 0 przed ciosem (ujemne), 1 tuż po (0 do 3), 2 dokończenie (4 do 9)
          Object.assign(p, { x: x + 0.5, y: y0 + 0.5, path: [], pi: 0, dir, job, weapon: bron, wait: st.tick + 99999 });
          p.cd = st.tick + (bron === 'dzida' ? 24 : 22) - od;
        };
        ustaw(0, x0 + 1, 'kij', 0, -3);
        ustaw(1, x0 + 4, 'kij', 1, -3);
        ustaw(2, x0 + 7, 'kij', 3, 6);
        ustaw(3, x0 + 10, 'dzida', 0, -3);
        zm.setCam(x0 + 4, y0 + 0.5, 3.2);
      }, start);
      await waitIdle(page);
      const pozy = await page.evaluate(() => {
        const zm = window.zm!;
        return zm
          .sim!.st.pawns.filter((p) => p.kind === 'core')
          .map((p) => {
            const pv = zm.view.poses.get(p.id)!;
            return `${pv.pose}${pv.frame}/${pv.dir}`;
          });
      });
      console.log(`  pozy: ${pozy.join(', ')}`);
      if (pozy.join() !== 'swing0/0,swing0/1,swing2/3,aim0/0')
        throw new Error(`pozy ${pozy.join()} zamiast swing0/0, swing0/1, swing2/3, aim0/0`);
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
        const view = zm.view as unknown as { gameLights: { r: number; inside?: boolean }[] };
        const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
        return {
          lamps: view.gameLights.filter((l) => l.r === 5).length,
          fire: view.gameLights.filter((l) => l.inside).length,
          pose: zm.view.poses.get(p.id)!.pose,
        };
      });
      const pose = r.pose;
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
        const sprites = (zm.view as unknown as { pawnSprites: Map<number, { visible: boolean }> }).pawnSprites;
        return res.map((p) => {
          const sp = sprites.get(p.id)!;
          return {
            pose: zm.view.poses.get(p.id)!.pose,
            visible: sp.visible,
            moving: p.pi < p.path.length,
            job: p.job?.t ?? '',
          };
        });
      });
      await waitIdle(page);
      const poses = got.map((g) => g.pose);
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
  // M2, fala 1: panel budowy z przycisku i klawisza B (zakładki, miniatury, koszt, czas, działanie, niedostępne z powodem)
  {
    name: 'm2-menu-budowy',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const panel = () =>
        page.evaluate(() => {
          const root = document.getElementById('buildPanel')!;
          return {
            open: !root.hidden,
            tabs: [...root.querySelectorAll<HTMLElement>('[data-tab]')].map((t) => t.textContent ?? ''),
            tiles: [...root.querySelectorAll<HTMLElement>('.tile')].map((t) => ({
              kind: t.dataset.kind ?? '',
              png: t.querySelector('img')?.getAttribute('src')?.startsWith('data:image/png') ?? false,
            })),
            items: [...root.querySelectorAll<HTMLElement>('.bd')].map((b) => ({
              kind: b.dataset.kind ?? '',
              name: b.querySelector('.build-n')?.textContent ?? '',
              meta: b.querySelector('.build-m')?.textContent ?? '',
              effect: b.querySelector('.build-d')?.textContent ?? '',
              button: !!b.querySelector('[data-act="build"]'),
              why: b.querySelector('.build-why')?.textContent ?? '',
            })),
          };
        });
      /** szczegóły budowli ze wszystkich zakładek (po kolei klika w zakładki) */
      const allItems = async () => {
        const out = new Map<string, Awaited<ReturnType<typeof panel>>['items'][number]>();
        let tiles = 0;
        for (const tab of ['dom', 'podworko', 'obwod']) {
          await page.click(`#buildPanel [data-tab="${tab}"]`);
          const p = await panel();
          tiles += p.tiles.filter((t) => t.png).length;
          for (const it of p.items) out.set(it.kind, it);
        }
        await page.click('#buildPanel [data-tab="dom"]');
        return { items: [...out.values()], tiles };
      };
      // koszty i czasy z symulacji (stroi je bot), więc porównuję z BUILDS, a nie z liczbami wpisanymi tutaj
      const { BUILDS } = await import('../src/sim/budowle.ts');
      const { costText, workText } = await import('../src/ui/budowa.ts');
      const check = (items: Awaited<ReturnType<typeof allItems>>['items']) => {
        if (items.length !== 6) throw new Error(`budowli w panelu: ${items.length}`);
        for (const b of items) {
          const d = Object.values(BUILDS).find((x) => x.name === b.name);
          if (!d) throw new Error(`nieznana budowla: ${b.name}`);
          if (!b.meta.includes(costText(d.cost)) || !b.meta.includes(workText(d.work)) || !b.effect)
            throw new Error(`${b.name}: koszt, czas albo działanie nie jak w BUILDS (${b.meta})`);
          if (b.button === !!b.why || (!b.button && !b.why))
            throw new Error(`${b.name}: przycisk i powód razem albo żadne`);
        }
      };
      // start gry: zapas nie starcza na nic, każda budowla z powodem
      await page.click('#btnBuild');
      await page.waitForSelector('#buildPanel .tile');
      const p0 = await panel();
      if (p0.tabs.join('|') !== 'Dom|Podwórko|Obwód') throw new Error(`zakładki: ${p0.tabs.join(', ')}`);
      const a0 = await allItems();
      for (const b of a0.items) console.log(`  start, ${b.name}: ${b.button ? 'można' : b.why} (${b.meta})`);
      check(a0.items);
      if (a0.tiles !== 6) throw new Error(`miniatur png: ${a0.tiles} z 6`);
      if (a0.items.some((b) => b.button)) throw new Error('na starcie gry coś da się postawić, a koszty są z bota');
      // mapa pod otwartym panelem jest klikalna: w środku ekranu leży płótno gry, nie panel
      const under = await page.evaluate(
        () => !!document.elementFromPoint(innerWidth * 0.4, innerHeight / 2)?.closest('#buildPanel'),
      );
      if (under) throw new Error('panel zasłania środek mapy');
      await page.screenshot({ path: path.join(OUT, 'm2-menu-budowy-start.png') });
      await page.keyboard.press('Escape');
      if ((await panel()).open) throw new Error('Esc nie zamknął panelu budowy');
      // zapas dokładnie na warsztat: warsztat można, magazyn (więcej desek) dalej z powodem
      await stockUp(page, BUILDS.warsztat.cost);
      await page.keyboard.press('b');
      await page.waitForSelector('#buildPanel .bd[data-kind="warsztat"] [data-act="build"]', { state: 'attached' });
      const a1 = await allItems();
      for (const b of a1.items) console.log(`  z zapasem na warsztat, ${b.name}: ${b.button ? 'można' : b.why}`);
      check(a1.items);
      const by = (name: string) => a1.items.find((b) => b.name === name)!;
      if (!by(BUILDS.warsztat.name).button || by(BUILDS.magazyn.name).button)
        throw new Error('przy zapasie na warsztat warsztat niedostępny albo magazyn dostępny');
      // panel żyje: zapas na magazyn dochodzi przy otwartym panelu bez ponownego otwierania
      await stockUp(page, BUILDS.magazyn.cost);
      await page.waitForSelector('#buildPanel .bd[data-kind="magazyn"] [data-act="build"]', { state: 'attached' });
      await page.screenshot({ path: path.join(OUT, 'm2-menu-budowy-okno.png') });
      await page.click('#buildPanel [data-act="build-close"]');
      if ((await panel()).open) throw new Error('przycisk ✕ nie zamknął panelu budowy');
    },
  },
  // panel budowy na komputerze: położenie względem zoomu, paska stawiania i celów, panel zostaje otwarty przy
  // stawianiu (kolejne plany), Esc anuluje plan, drugi Esc zamyka panel, B przełącza, zmiana języka od ręki,
  // odświeżenie bez zmian stanu nie rusza DOM
  {
    name: 'panel-budowy',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const { BUILDS } = await import('../src/sim/budowle.ts');
      await stockUp(page, BUILDS.warsztat.cost);
      const rect = (sel: string) =>
        page.evaluate((sel) => {
          const e = document.querySelector<HTMLElement>(sel);
          if (!e || e.hidden) return null;
          const r = e.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        }, sel);
      const open = () => page.evaluate(() => window.zm!.buildPanel().open);
      await page.keyboard.press('b');
      await page.waitForSelector('#buildPanel .tile');
      await page.waitForTimeout(300); // animacja wysuwania
      const pr = (await rect('#buildPanel'))!;
      const vw = await page.evaluate(() => innerWidth);
      if (pr.r > vw + 0.5 || pr.l < vw * 0.6) throw new Error(`panel poza prawą krawędzią: ${JSON.stringify(pr)}`);
      const zoom = (await rect('.mapctl'))!;
      if (zoom.r > pr.l) throw new Error('zoom nachodzi na panel');
      const goals = await rect('#goals');
      if (goals && goals.r > pr.l) throw new Error('cele nachodzą na panel');
      // klawisz B przełącza
      await page.keyboard.press('b');
      if (await open()) throw new Error('B nie zamknął panelu');
      await page.keyboard.press('b');
      if (!(await open())) throw new Error('B nie otworzył panelu');
      // stawianie: panel zostaje, pasek stawiania obok niego
      await chooseBuild(page, 'warsztat');
      const placing = await page.evaluate(() => window.zm!.placing());
      if (!placing) throw new Error('Postaw nie zaczęło stawiania');
      if (!(await open())) throw new Error('panel zamknął się po Postaw na komputerze');
      const bar = (await rect('#placeBar'))!;
      if (bar.r > pr.l + 0.5) throw new Error(`pasek stawiania nachodzi na panel: ${JSON.stringify(bar)}`);
      await page.keyboard.press('Escape');
      if (await page.evaluate(() => window.zm!.placing())) throw new Error('Esc nie anulował planu');
      if (!(await open())) throw new Error('pierwszy Esc zamknął panel zamiast planu');
      // B przy stawianiu przełącza panel i nie anuluje planu
      await chooseBuild(page, 'warsztat');
      await page.keyboard.press('b');
      if (await open()) throw new Error('B przy stawianiu nie zamknął panelu');
      if (!(await page.evaluate(() => window.zm!.placing()))) throw new Error('B zamknął panel i anulował plan');
      await page.keyboard.press('Escape');
      await page.keyboard.press('b');
      await page.keyboard.press('Escape');
      if (await open()) throw new Error('Esc bez planu nie zamknął panelu');
      // odświeżanie bez zmian stanu: zero mutacji w panelu przez 60 klatek
      await page.keyboard.press('b');
      await page.waitForSelector('#buildPanel .tile');
      const mutations = await page.evaluate(async () => {
        let n = 0;
        const mo = new MutationObserver((l) => {
          n += l.length;
        });
        mo.observe(document.getElementById('buildPanel')!, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        await new Promise((r) => setTimeout(r, 1200));
        mo.disconnect();
        return n;
      });
      if (mutations) throw new Error(`panel przebudował się ${mutations} razy bez zmiany stanu`);
      // fokus na „Postaw” przeżywa odświeżenie po zmianie zapasu (klawiatura)
      await page.click('#buildPanel [data-tab="dom"]');
      await page.click('#buildPanel .tile[data-kind="warsztat"]');
      await page.focus('#buildPanel .bd[data-kind="warsztat"] [data-act="build"]');
      await stockUp(page, { deski: 10 });
      await page.waitForTimeout(400);
      const kept = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.arg ?? '');
      if (kept !== 'warsztat') throw new Error(`odświeżenie panelu zabrało fokus z „Postaw” (fokus: „${kept}”)`);
      // zmiana języka przy otwartym panelu (jak w en-budowa-zmiana-jezyka: przycisk języka w oknie)
      await page.evaluate(() => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.lang = 'en';
        document.querySelector('#sheet')!.appendChild(b);
        b.click();
        b.remove();
      });
      await page.waitForTimeout(150);
      const en = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll('#buildPanel [data-tab]')].map((t) => t.textContent ?? '').join('|'),
        kicker: document.querySelector('#buildPanel .bp-kicker')?.textContent ?? '',
      }));
      if (en.tabs !== 'Home|Yard|Perimeter' || en.kicker !== 'Build (B)')
        throw new Error(`panel po zmianie języka: ${en.tabs} / ${en.kicker}`);
      await page.evaluate(() => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.lang = 'pl';
        document.querySelector('#sheet')!.appendChild(b);
        b.click();
        b.remove();
      });
      await page.waitForTimeout(150);
    },
  },
  // panel budowy na telefonie: szuflada od dołu, po „Postaw” schodzi z drogi, a plan zostaje
  {
    name: 'panel-budowy-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      const { BUILDS } = await import('../src/sim/budowle.ts');
      await stockUp(page, BUILDS.warsztat.cost);
      const geo = () =>
        page.evaluate(() => {
          const r = document.getElementById('buildPanel')!.getBoundingClientRect();
          return {
            open: window.zm!.buildPanel().open,
            l: r.left,
            r: r.right,
            t: r.top,
            b: r.bottom,
            w: innerWidth,
            h: innerHeight,
          };
        });
      await page.tap('#btnBuild');
      await page.waitForSelector('#buildPanel .tile');
      await page.waitForTimeout(300); // animacja wysuwania
      const g = await geo();
      if (!g.open || g.l > 1 || g.r < g.w - 1 || g.b < g.h - 60 || g.b > g.h || g.t < g.h * 0.35)
        throw new Error(`szuflada nie jest u dołu: ${JSON.stringify(g)}`);
      await chooseBuild(page, 'warsztat', { tap: true });
      if ((await geo()).open) throw new Error('szuflada nie zeszła po Postaw');
      if (!(await page.evaluate(() => window.zm!.placing()))) throw new Error('po Postaw nie ma planu');
      // ponowne otwarcie nie anuluje planu
      await page.tap('#btnBuild');
      await page.waitForSelector('#buildPanel .tile');
      if (!(await page.evaluate(() => window.zm!.placing()))) throw new Error('otwarcie panelu anulowało plan');
      await page.waitForTimeout(300); // koniec animacji przed zrzutem
    },
  },
  // panel budowy na tablecie (szeroki ekran z dotykiem): z prawej, ale po „Postaw” też schodzi
  {
    name: 'panel-budowy-tablet',
    query: '',
    w: 1024,
    h: 768,
    touch: true,
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
      await waitIdle(page);
      if (!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)))
        throw new Error('tablet bez pointer: coarse, scenariusz nic nie sprawdza');
      const { BUILDS } = await import('../src/sim/budowle.ts');
      await stockUp(page, BUILDS.warsztat.cost);
      await page.tap('#btnBuild');
      await page.waitForSelector('#buildPanel .tile');
      await page.waitForTimeout(300); // animacja wysuwania
      const r = await page.evaluate(() => {
        const b = document.getElementById('buildPanel')!.getBoundingClientRect();
        return { l: b.left, b: b.bottom, w: innerWidth, h: innerHeight };
      });
      if (r.l < r.w * 0.6 || r.b > r.h - 5)
        throw new Error(`panel na tablecie nie jest z prawej: ${JSON.stringify(r)}`);
      await chooseBuild(page, 'warsztat', { tap: true });
      if (await page.evaluate(() => window.zm!.buildPanel().open))
        throw new Error('panel nie zszedł po Postaw na dotyku');
      await page.tap('#btnBuild');
      await page.waitForSelector('#buildPanel .tile');
      await page.waitForTimeout(300); // koniec animacji przed zrzutem
    },
  },
  // widok z kłódkami (?budowa=klodki: magazyn i ogródek czekają na badanie testowe): wyszarzone, z nazwą badania,
  // bez przycisku „Postaw”
  {
    name: 'panel-budowy-klodki',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&budowa=klodki`);
      await waitIdle(page);
      await page.keyboard.press('b');
      await page.waitForSelector('#buildPanel .tile');
      const dom = await page.evaluate(() => ({
        lock: [...document.querySelectorAll<HTMLElement>('#buildPanel .tile.lock')].map((t) => t.dataset.kind),
        why: document.querySelector('#buildPanel .bd[data-kind="magazyn"] .build-why')?.textContent ?? '',
        button: !!document.querySelector('#buildPanel .bd[data-kind="magazyn"] [data-act="build"]'),
      }));
      if (dom.lock.join() !== 'magazyn') throw new Error(`kłódki w Dom: ${dom.lock.join()}`);
      if (dom.why !== 'Wymaga badania: Badanie testowe' || dom.button)
        throw new Error(`magazyn: „${dom.why}”, przycisk: ${dom.button}`);
      await page.click('#buildPanel .tile[data-kind="magazyn"]');
      await page.click('#buildPanel [data-tab="podworko"]');
      const yard = await page.evaluate(() =>
        [...document.querySelectorAll('#buildPanel .tile.lock')].map((t) => (t as HTMLElement).dataset.kind),
      );
      if (yard.join() !== 'ogrodek') throw new Error(`kłódki w Podwórku: ${yard.join()}`);
      await page.click('#buildPanel [data-tab="dom"]');
      await page.click('#buildPanel .tile[data-kind="magazyn"]');
      await page.waitForTimeout(300); // koniec animacji przed zrzutem
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
      const choose = (kind: string) => chooseBuild(page, kind);
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
        await chooseBuild(page, 'zasieki', { tap: true });
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
    // karta nocy w domu dwa razy: z `miasto=0` (tylko domowe cele z TARGETS, jak przed mapą miasta) i z mapą miasta
    // (domyślnie: wyprawy do miejsc z okolicy albo domowe cele z TARGETS); zrzut zostaje z drugiej, domyślnej gry
    name: 'wydarzenia-dom-karta',
    query: '',
    run: async (page, base) => {
      for (const miasto of [false, true]) await kartaNocyWDomu(page, base, miasto);
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
      await page.waitForSelector('#buildPanel .tile');
      // textContent, bo szczegóły niewybranych budowli są schowane (innerText ich nie widzi)
      const t = await page.evaluate(() => document.getElementById('buildPanel')!.textContent ?? '');
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
  // M2 fala 2 (docs/M2-fala-2.md): cudze drzwi, przekrój sąsiadów, łup, spotkania z lokatorami, karta budynku, tryb
  // zombie; blok na Lanciego (10F obok siedziby), dom w Zielonkach, znajomi sąsiedzi na Przymorzu
  m2f2('m2f2-menu-drzwi', 'lanciego', async (page) => {
    await m2f2Select(page);
    const items = await m2f2DoorMenu(page, 'Blok nr 10F', 1.6);
    console.log(`  menu drzwi bloku: ${items.join(' | ')}`);
    if (!items.some((i) => i.startsWith('Otworzyć drzwi'))) throw new Error('w menu drzwi nie ma „Otworzyć drzwi”');
    if (!items.some((i) => i.startsWith('Wyważyć drzwi'))) throw new Error('w menu drzwi nie ma „Wyważyć drzwi”');
  }),
  m2f2('m2f2-blok-przekroj', 'lanciego', async (page) => {
    const r = await m2f2Open(page, 'Blok nr 10F', true);
    await page.evaluate((bid) => {
      const zm = window.zm!;
      const b = zm.sim!.w.buildings[bid];
      zm.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, 0.95);
    }, r.bid);
    await waitIdle(page);
    const cut = await page.evaluate(() => window.zm!.view.section);
    console.log(`  drzwi: ${r.drzwi.join(', ')}; przekrój ${cut}`);
    if (!cut) throw new Error('przy tym zbliżeniu nie widać przekroju');
    if (!r.drzwi.includes('wywazone')) throw new Error('żadne drzwi mieszkania nie są wyważone');
  }),
  m2f2('m2f2-blok-calosc', 'lanciego', async (page) => {
    // cały blok w przekroju na granicy zbliżenia: drzwi otwarte, zabite deskami i wyważone przy trzech klatkach
    const r = await m2f2Open(page, 'Blok nr 10F', true);
    await page.evaluate((bid) => {
      const zm = window.zm!;
      const b = zm.sim!.w.buildings[bid];
      zm.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, 0.62);
    }, r.bid);
    await waitIdle(page);
    console.log(`  drzwi: ${r.drzwi.join(', ')}`);
    if (!(await page.evaluate(() => window.zm!.view.section))) throw new Error('nie widać przekroju bloku');
  }),
  m2f2('m2f2-dom-przekroj', 'zielonki', async (page) => {
    const r = await m2f2Open(page, 'dom', false, true);
    await page.evaluate((bid) => {
      const zm = window.zm!;
      const b = zm.sim!.w.buildings[bid];
      zm.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, 1.5);
    }, r.bid);
    await waitIdle(page);
    console.log(`  dom ${r.name}: drzwi ${r.drzwi.join(', ')}`);
    if (!(await page.evaluate(() => window.zm!.view.section))) throw new Error('nie widać przekroju domu');
  }),
  m2f2('m2f2-lup', 'lanciego', async (page) => {
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    // pomieszczenia otwartego bloku: środek posadzki każdego (prawy przycisk w środku, jak gracz)
    const rooms = await page.evaluate((bid) => {
      const sim = window.zm!.sim!;
      const k = sim.st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
      const out: [number, number][] = [];
      for (let room = 0; room < 400; room++) {
        const t = sim.kafelkiPokoju(k * 4096 + room);
        if (t.length < 4) continue;
        const i = t[Math.floor(t.length / 2)];
        out.push([(i % sim.w.size) + 0.5, Math.floor(i / sim.w.size) + 0.5]);
      }
      return out;
    }, r.bid);
    await m2f2Select(page);
    let found = '';
    for (const [x, y] of rooms) {
      await page.evaluate(([px, py]) => window.zm!.setCam(px, py, 1.3), [x, y]);
      await waitIdle(page);
      const [sx, sy] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), [x, y]);
      await page.mouse.click(sx, sy, { button: 'right' });
      await page.waitForSelector('#ctx:not([hidden])');
      const items = await page.locator('#ctx .ctx-item').allTextContents();
      const it = items.find((i) => i.startsWith('Przeszukać'));
      if (it) {
        found = it;
        await page.locator('#ctx .ctx-item', { hasText: it }).first().click();
        break;
      }
      await page.keyboard.press('Escape');
    }
    if (!found) throw new Error('w otwartym bloku żadne pomieszczenie nie ma „Przeszukać”');
    // przeszukanie do końca i pierwszy kurs: osoba z łupem w rękach w drodze na podwórko
    const lup = await page.evaluate((bid) => {
      const sim = window.zm!.sim!;
      sim.step();
      const p = sim.st.pawns.find((q) => q.kind === 'core' && q.job?.t === 'loot');
      if (!p) return null;
      for (let i = 0; i < 4000; i++) {
        sim.step();
        if (p.job?.t === 'carry' && (p.job.n ?? 0) > 0) break;
        if (!p.job) break;
      }
      const w = sim.w;
      const piles = sim.st.things.filter((t) => w.bid[t.y * w.size + t.x] === bid && t.n > 0 && t.kind !== 'smieci');
      window.zm!.setCam(p.x, p.y, 1.3);
      return {
        job: p.job?.t ?? null,
        n: p.job?.n ?? 0,
        what: p.job?.what ?? '',
        piles: piles.map((t) => `${t.kind} ${t.n}`),
      };
    }, r.bid);
    await waitIdle(page);
    console.log(`  ${found}: praca ${lup?.job}, w rękach ${lup?.what} ${lup?.n}, w budynku ${lup?.piles.join(', ')}`);
    if (!lup) throw new Error('nikt nie przeszukuje pomieszczenia');
  }),
  m2f2Meet('m2f2-spotkanie', 1440, 900),
  m2f2Meet('m2f2-spotkanie-telefon', 390, 844),
  {
    // po wyborze „Porozmawiać” okno znika, a wynik przychodzi zdaniem w podpowiedzi
    name: 'm2f2-po-rozmowie',
    query: '',
    run: async (page, base) => {
      await m2f2Knock(page, base, 'lubiany');
      await page.click('#sheet [data-act="meet"][data-arg="rozmowa"]');
      await page.evaluate(() => {
        const sim = window.zm!.sim!;
        for (let i = 0; i < 5; i++) sim.step();
      });
      await page
        .waitForFunction(
          () => (document.getElementById('hint')?.textContent ?? '').startsWith('Porozmawialiście'),
          null,
          {
            timeout: 3000,
          },
        )
        .catch(() => null);
      await waitIdle(page);
      const hint = await page.textContent('#hint');
      console.log(`  podpowiedź: ${hint}`);
      if (!hint?.startsWith('Porozmawialiście')) throw new Error(`po rozmowie inna podpowiedź: ${hint}`);
      if (await page.isVisible('#sheet')) throw new Error('okno spotkania nie zniknęło po wyborze');
    },
  },
  {
    // wrodzy lokatorzy nocą rzucają się od razu: czerwone okno z obroną, uspokojeniem i ucieczką
    name: 'm2f2-napad',
    query: '',
    run: async (page, base) => {
      await m2f2Knock(page, base, 'wrogi');
      const tone = await page.getAttribute('#sheet', 'class');
      const acts = await page
        .locator('#sheet [data-act="meet"]')
        .evaluateAll((l) => l.map((b) => (b as HTMLElement).dataset.arg));
      console.log(`  okno ${tone}: ${acts.join(', ')}`);
      if (!tone?.includes('napad')) throw new Error('napad nie ma czerwonego okna');
      if (acts.join() !== 'obrona,uspokojenie,ucieczka') throw new Error(`wybory napadu: ${acts.join()}`);
    },
  },
  {
    // tryb zombie: w domu z wymarcia szwendacz wychodzi zaraz po otwarciu drzwi
    name: 'm2f2-zombie-szwendacz',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=zielonki&tryb=zombie&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const w = sim.w;
        const size = w.size;
        const door = w.buildings[w.hq].entrances[0].out;
        const d2 = (t: number) =>
          ((t % size) - (door % size)) ** 2 + (Math.floor(t / size) - Math.floor(door / size)) ** 2;
        const houses = w.buildings
          .filter((b) => b.id !== w.hq && b.cls === 'dom' && b.entrances.length)
          .sort((a, b) => d2(a.entrances[0].out) - d2(b.entrances[0].out));
        const b = houses.find((x) => sim.budynekDoKarty(x.id)?.b.mieszkania.some((m) => m.zombie));
        if (!b) return null;
        const p = sim.st.pawns.find((q) => q.kind === 'core')!;
        p.weapon = 'lom';
        const e = b.entrances[0];
        p.x = (e.out % size) + 0.5;
        p.y = Math.floor(e.out / size) + 0.5;
        p.path = [];
        p.pi = 0;
        const zombies = () => sim.st.pawns.filter((q) => q.kind === 'zombie').length;
        const before = zombies();
        const open = () => !!sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id)?.otwarty;
        // za dnia przy siatce snują się szwendacze i któryś może przerwać pracę walką: po walce osoba wraca pod drzwi
        // i wyważa dalej (pierwsza próba to „Otworzyć”, dom bywa zamknięty na klucz)
        for (let k = 0; k < 6 && !open(); k++) {
          for (let i = 0; i < 3000 && p.job?.t === 'fight'; i++) sim.step();
          p.x = (e.out % size) + 0.5;
          p.y = Math.floor(e.out / size) + 0.5;
          p.path = [];
          p.pi = 0;
          sim.push({ t: k === 0 ? 'open' : 'force', ids: [p.id], door: e.tile });
          sim.step();
          for (let i = 0; i < 3000 && p.job?.t === 'door'; i++) sim.step();
        }
        for (let i = 0; i < 40; i++) sim.step();
        zm.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, 1.4);
        return { name: b.name, before, after: zombies(), napis: sim.st.sasiedzi?.napis?.co ?? null };
      });
      await page.waitForTimeout(300);
      await waitIdle(page);
      const hint = await page.textContent('#hint');
      console.log(`  ${r?.name}: szwendaczy ${r?.before} → ${r?.after}, napis ${r?.napis}, podpowiedź: ${hint}`);
      if (!r) throw new Error('w Zielonkach nie ma domu ze szwendaczem z wymarcia');
      // szwendaczy przybywa też w stadzie, więc liczy się napis: szwendacz wyszedł z mieszkania
      if (r.after <= r.before || r.napis !== 'szwendacz') throw new Error('po otwarciu domu nie wyszedł szwendacz');
    },
  },
  {
    // wyważanie w trybie zombie: krąg hałasu, który ściąga szwendaczy z okolicy
    name: 'm2f2-wywazanie',
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=lanciego&tryb=zombie&stado=6&speed=0&cam=hq,1`);
      await waitIdle(page);
      const r = await page.evaluate(() => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const w = sim.w;
        const size = w.size;
        const b = w.buildings.find((x) => x.name === 'Blok nr 10F')!;
        const p = sim.st.pawns.find((q) => q.kind === 'core')!;
        p.weapon = null;
        const e = b.entrances[0];
        p.x = (e.out % size) + 0.5;
        p.y = Math.floor(e.out / size) + 0.5;
        p.path = [];
        p.pi = 0;
        sim.push({ t: 'force', ids: [p.id], door: e.tile });
        for (let i = 0; i < 400; i++) {
          sim.step();
          if (p.job?.t === 'door' && p.job.phase === 1 && sim.st.tick - p.job.t0 > 68) break;
        }
        zm.setCam(p.x, p.y, 0.7);
        return { job: p.job?.what ?? null, noise: (sim.st.noise ?? []).map((n) => Math.round(n.r)) };
      });
      await waitIdle(page);
      console.log(`  praca ${r.job}, hałas ${r.noise.join(', ')} m`);
      if (r.job !== 'force') throw new Error('nikt nie wyważa drzwi');
      if (!r.noise.some((n) => n >= 20)) throw new Error('wyważanie bez hałasu');
    },
  },
  m2f2Card('m2f2-karta-budynku', 1440, 900),
  m2f2Card('m2f2-karta-budynku-telefon', 390, 844),
  {
    // etap 2: ukryty ugryziony, wskazówka o ręce i pytanie (telefon)
    name: 'm2f2-reka-telefon',
    query: '',
    w: 390,
    h: 844,
    run: async (page, base) => {
      await m2f2Knock(page, base, 'lubiany', true);
      const t = await sheetText(page);
      console.log(`  ${t.replace(/\s+/g, ' ').slice(0, 260)}`);
      if (!t.includes('obandażowaną rękę')) throw new Error('brak wskazówki o ręce');
      if (!(await page.isVisible('#sheet [data-arg="reka"]'))) throw new Error('brak „Zapytać o rękę”');
    },
  },
  m2f2('m2f2-pietro', 'lanciego', async (page) => {
    // etap 2: piętro bloku przeszukane, łup przy schodach i zdanie w podpowiedzi
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    const out = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const w = sim.w;
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      const it = sim.budynekDoKarty(bid)!;
      const tiles = [...w.bid.keys()].filter((t) => w.bid[t] === bid);
      let phase1 = false;
      for (const tile of tiles) {
        sim.push({ t: 'upstairs', ids: [p.id], bid, tile });
        sim.step();
        if (p.job?.t === 'upstairs') break;
      }
      if (p.job?.t !== 'upstairs') return null;
      for (let i = 0; i < 4000 && p.job?.t === 'upstairs'; i++) {
        sim.step();
        if (p.job?.t === 'upstairs' && p.job.phase === 1) phase1 = true;
      }
      for (let i = 0; i < 3; i++) sim.step();
      zm.setCam(p.x, p.y, 1.4);
      return { phase1, pietra: it.b.pietra, napis: sim.st.sasiedzi?.napis?.co ?? null };
    }, r.bid);
    await page.waitForTimeout(300);
    await waitIdle(page);
    const hint = await page.textContent('#hint');
    console.log(`  piętro: ${JSON.stringify(out)}, podpowiedź: ${hint}`);
    if (!out?.phase1 || out.pietra !== 1) throw new Error('piętro nie zostało przeszukane');
  }),
  m2f2('m2f2-szabrownicy', 'lanciego', async (page) => {
    // etap 2: szabrownicy zostali w otwartym bloku po nocy; nasza osoba wchodzi za dnia
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    const out = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const w = sim.w;
      const rec = st.sasiedzi!.budynki.find((b) => b.bid === bid)!;
      const p = st.pawns.find((q) => q.kind === 'core')!;
      const stand = [p.x, p.y];
      const door = w.buildings[w.hq].entrances[0].out;
      // łup w środku i osoba w domu, a potem kolejne noce o 2:00, aż szabrownicy zostaną
      const proto = st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
      st.things.push({
        ...proto,
        id: st.nextThing++,
        x: Math.floor(p.x),
        y: Math.floor(p.y),
        kind: 'czesci',
        n: 6,
        by: -1,
      });
      let nights = 0;
      for (let n = 0; n < 60 && !rec.domy.some((g) => g.szabrownicy); n++) {
        p.x = (door % w.size) + 0.5;
        p.y = Math.floor(door / w.size) + 0.5;
        p.path = [];
        p.pi = 0;
        p.job = null;
        const day = Math.floor(st.tick / 19200) + 1;
        st.tick = (11 + 24 * day) * 800;
        sim.step();
        nights++;
      }
      // za dnia z powrotem w środku: spotkanie z szabrownikami
      st.tick += 10 * 800;
      p.x = stand[0];
      p.y = stand[1];
      p.weapon = 'siekiera';
      for (let i = 0; i < 100 && !st.sasiedzi!.spotkanie; i++) sim.step();
      zm.setCam(p.x, p.y, 1.4);
      return { nights, sp: !!st.sasiedzi!.spotkanie, noc: rec.noc?.kto ?? null };
    }, r.bid);
    console.log(`  nocy: ${out.nights}, ostatni gość ${out.noc}, spotkanie ${out.sp}`);
    if (!out.sp) throw new Error('szabrownicy nie czekali w środku');
    await page.waitForSelector('#sheet [data-act="meet"]');
    await waitIdle(page);
    const t = await sheetText(page);
    console.log(`  ${t.replace(/\s+/g, ' ').slice(0, 220)}`);
    if (!t.includes('szabrownicy')) throw new Error('okno bez szabrowników');
  }),
  m2f2('m2f2-plot-menu', 'lanciego', async (page) => {
    // etap 3: na drzwiach otwartego 10F „Otoczyć wspólnym płotem” z długością, kosztem i czasem
    await m2f2Open(page, 'Blok nr 10F', false);
    await m2f2Select(page);
    const items = await m2f2DoorMenu(page, 'Blok nr 10F', 1.4);
    console.log(`  menu: ${items.join(' | ')}`);
    if (!items.some((i) => i.startsWith('Otoczyć wspólnym płotem ('))) throw new Error('brak wspólnego płotu w menu');
  }),
  m2f2('m2f2-plot', 'lanciego', async (page) => {
    // etap 3: gotowy wspólny płot wokół korytarza do 10F (plan i od razu koniec pracy poleceniem otocz)
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    const out = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const w = sim.w;
      const before = w.fence.tiles.length;
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      sim.push({ t: 'enclose', ids: [p.id], bid });
      sim.step();
      if (!sim.st.plot?.plan) return null;
      sim.push({ t: 'otocz', ids: [], bid });
      sim.step();
      const b = w.buildings[bid];
      const hq = w.buildings[w.hq];
      zm.setCam((b.x0 + hq.x0) / 2 + 4, (b.y0 + hq.y1) / 2 + 6, 0.62);
      return { before, after: w.fence.tiles.length, bids: sim.st.plot?.bids ?? [], napis: sim.st.sasiedzi?.napis?.co };
    }, r.bid);
    await page.waitForTimeout(300);
    await waitIdle(page);
    const hint = await page.textContent('#hint');
    console.log(
      `  siatka ${out?.before} → ${out?.after}, otoczone ${out?.bids.join(',')}, napis ${out?.napis}, podpowiedź: ${hint}`,
    );
    if (!out?.bids.includes(r.bid)) throw new Error('płot nie stanął');
  }),
  // etap 3: plan wspólnego płotu w toku, duch przyszłego obwodu z postępem: z bliska po polsku, z daleka po angielsku
  m2f2PlotDuch('m2f2-plot-duch', 0.62, 'pl'),
  m2f2PlotDuch('en-m2f2-plot-duch', 0.3, 'en'),
  m2f2('m2f2-plot-pien', 'zielonki', async (page) => {
    // pień na linii wspólnego płotu po ścięciu staje się siatką (Mateusz: dziura po obu stronach pnia i na nim)
    const r = await m2f2Open(page, 'Dom nr 8', false);
    const out = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const w = sim.w;
      const size = w.size;
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      sim.push({ t: 'enclose', ids: [p.id], bid });
      sim.step();
      if (!sim.st.plot?.plan) return null;
      sim.push({ t: 'otocz', ids: [], bid });
      sim.step();
      const yard = new Set(w.fence.yard);
      const line = new Set(w.fence.tiles);
      const ns = (i: number) => [i - size, i + size, i - 1, i + 1];
      // drzewo, którego pień domyka nowy obwód: poza podwórkiem, bokiem przy nim, z drugiej strony wolna ulica
      const k = w.trees.findIndex((t) => {
        const i = Math.floor(t.y) * size + Math.floor(t.x);
        return (
          w.blocked[i] === 1 &&
          !yard.has(i) &&
          !line.has(i) &&
          ns(i).some((n) => yard.has(n)) &&
          ns(i).some((n) => !yard.has(n) && !line.has(n) && !w.blocked[n])
        );
      });
      if (k < 0) return { k };
      const t = w.trees[k];
      const pien = Math.floor(t.y) * size + Math.floor(t.x);
      sim.push({ t: 'chop', ids: [p.id], tree: k });
      for (let n = 0; n < 20000 && !sim.st.felled.includes(k); n++) sim.step();
      zm.setCam(t.x, t.y, 1.6);
      return {
        k,
        sciete: sim.st.felled.includes(k),
        siatka: w.fence.tiles.includes(pien),
        blokuje: sim.blocked[pien],
        pienNaMapie: sim.st.things.some((x) => x.kind === 'pien' && x.y * size + x.x === pien),
      };
    }, r.bid);
    await page.waitForTimeout(300);
    await waitIdle(page);
    console.log(`  pień na linii płotu: ${JSON.stringify(out)}`);
    if (!out || out.k < 0) throw new Error('brak drzewa na linii wspólnego płotu');
    if (!out.sciete || !out.siatka || out.blokuje !== 1 || out.pienNaMapie)
      throw new Error('ścięty pień na linii płotu nie stał się siatką');
  }),
  m2f2('m2f2-plot-deski', 'lanciego', async (page) => {
    // etap 3: na podwórku same deski (złomu brak), więc menu ma tylko płot z desek; potem potwierdzenie, podpowiedź
    // po poleceniu i duch planu na 0%
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    await page.evaluate(() => {
      const st = window.zm!.sim!.st;
      const w = window.zm!.sim!.w;
      const size = w.size;
      const nasze = (t: { x: number; y: number }) => {
        const b = w.bid[t.y * size + t.x];
        return b < 0 || b === w.hq;
      };
      st.things = st.things.filter((t) => !((t.kind === 'deski' || t.kind === 'zlom') && nasze(t)));
      const free = w.fence.yard.filter((i) => !w.blocked[i] && !st.things.some((t) => t.y * size + t.x === i));
      for (let k = 0; k < 30; k++)
        st.things.push({
          id: st.nextThing++,
          kind: 'deski',
          x: free[k] % size,
          y: Math.floor(free[k] / size),
          w: 1,
          h: 1,
          rot: 0,
          n: 10,
          fuel: 0,
          by: -1,
          owner: -1,
        });
    });
    await m2f2Select(page);
    const items = await m2f2DoorMenu(page, 'Blok nr 10F', 1.4);
    console.log(`  menu: ${items.join(' | ')}`);
    const plot = items.filter((i) => i.startsWith('Otoczyć wspólnym płotem'));
    if (plot.length !== 1 || !/^Otoczyć wspólnym płotem z desek \(\d+ m: \d+ desek, [\d,]+ h\)…$/.test(plot[0]))
      throw new Error(`menu płotu bez samego wariantu z desek: ${plot.join(' | ')}`);
    await page.click('#ctx .ctx-item:has-text("Otoczyć wspólnym płotem z desek")');
    await page.click('#sheet [data-act="confirm-yes"]');
    // podpowiedź wchodzi do #hint w następnej klatce
    const want = 'Postawi wspólny płot z desek: najpierw doniesie deski.';
    await page
      .waitForFunction((t) => document.getElementById('hint')?.textContent === t, want, { timeout: 3000 })
      .catch(() => null);
    const hint = (await page.textContent('#hint')) ?? '';
    console.log(`  podpowiedź: ${hint}`);
    if (hint !== want) throw new Error(`inna podpowiedź: ${hint}`);
    const plan = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      for (let i = 0; i < 5; i++) sim.step();
      const w = sim.w;
      const b = w.buildings[bid];
      const hq = w.buildings[w.hq];
      zm.setCam((b.x0 + hq.x0) / 2 + 4, (b.y0 + hq.y1) / 2 + 6, 0.62);
      const p = sim.st.plot?.plan;
      return p ? { wariant: p.wariant, need: p.need } : null;
    }, r.bid);
    await page.waitForTimeout(300);
    await waitIdle(page);
    const n = await page.evaluate(() => (window.zm!.view as unknown as { plotDuch: { count: number } }).plotDuch.count);
    console.log(`  plan ${JSON.stringify(plan)}, duch: ${n} kafelków siatki`);
    if (plan?.wariant !== 'deski' || plan.need.zlom) throw new Error('plan nie pamięta płotu z desek');
    if (!n) throw new Error('nie ma ducha planu płotu');
  }),
  m2f2('m2f2-karta-po-nocy', 'lanciego', async (page) => {
    // etap 2: karta otwartego bloku po nocnym gościu i z przeszukanym piętrem
    const r = await m2f2Open(page, 'Blok nr 10F', false);
    const at = await page.evaluate((bid) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const w = sim.w;
      const rec = st.sasiedzi!.budynki.find((b) => b.bid === bid)!;
      const p = st.pawns.find((q) => q.kind === 'core')!;
      const proto = st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
      st.things.push({
        ...proto,
        id: st.nextThing++,
        x: Math.floor(p.x),
        y: Math.floor(p.y),
        kind: 'deski',
        n: 5,
        by: -1,
      });
      const door = w.buildings[w.hq].entrances[0].out;
      rec.pietra = 2;
      for (let n = 0; n < 60 && !rec.noc; n++) {
        p.x = (door % w.size) + 0.5;
        p.y = Math.floor(door / w.size) + 0.5;
        p.path = [];
        p.pi = 0;
        p.job = null;
        const day = Math.floor(st.tick / 19200) + 1;
        st.tick = (11 + 24 * day) * 800;
        sim.step();
      }
      // 7:00 tej samej nocy (krok przesunął zegar o jeden tick): napis o nocnym gościu
      st.tick += 5 * 800 - 1;
      sim.step();
      const b = w.buildings[bid];
      const xy: [number, number] = [(b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2];
      zm.setCam(xy[0], xy[1], 0.5);
      return xy;
    }, r.bid);
    await waitIdle(page);
    const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y), at);
    await page.mouse.click(sx, sy);
    await page.waitForTimeout(400);
    await waitIdle(page);
    const card = (await page.textContent('#card')) ?? '';
    console.log(`  ${card.replace(/\s+/g, ' ').slice(0, 300)}`);
    if (!card.includes('w nocy')) throw new Error('karta budynku bez nocnego gościa');
    if (!card.includes('Piętra przeszukane: 2')) throw new Error('karta budynku bez pięter');
    const hint = (await page.textContent('#hint')) ?? '';
    console.log(`  podpowiedź: ${hint}`);
    if (!hint.startsWith('W nocy ktoś był')) throw new Error('rano bez napisu o nocnym gościu');
  }),
  // fala 2 po angielsku: menu drzwi, menu wspólnego płotu, okno spotkania na telefonie i karta budynku; poza imionami
  // i nazwami z mapy bez polskich liter, deski to „planks”
  {
    ...m2f2('en-m2f2-menu-drzwi', 'lanciego', async (page) => {
      await m2f2Select(page);
      const items = await m2f2DoorMenu(page, 'Blok nr 10F', 1.6);
      console.log(`  door menu: ${items.join(' | ')}`);
      if (!items.some((i) => i.startsWith('Open the door')) || !items.some((i) => i.startsWith('Force the door')))
        throw new Error('menu drzwi nie po angielsku');
      const pl = polskieLitery(items.join(' '), []);
      if (pl.length) throw new Error(`polskie słowa w menu drzwi: ${pl.join(', ')}`);
    }),
    lang: 'en',
  },
  {
    ...m2f2('en-m2f2-plot-menu', 'lanciego', async (page) => {
      await m2f2Open(page, 'Blok nr 10F', false);
      await m2f2Select(page);
      const items = await m2f2DoorMenu(page, 'Blok nr 10F', 1.4);
      console.log(`  menu: ${items.join(' | ')}`);
      // pozycja z oknem potwierdzenia kończy się wielokropkiem
      if (!items.some((i) => /^Put up a shared fence \(\d+ m: \d+ planks, \d+ scrap, [\d.]+ h\)…?$/.test(i)))
        throw new Error('brak wspólnego płotu w menu po angielsku');
      const pl = polskieLitery(items.join(' '), []);
      if (pl.length) throw new Error(`polskie słowa w menu: ${pl.join(', ')}`);
    }),
    lang: 'en',
  },
  {
    name: 'en-m2f2-spotkanie-telefon',
    query: '',
    w: 390,
    h: 844,
    lang: 'en',
    run: async (page, base) => {
      await m2f2Knock(page, base, 'lubiany');
      const t = await sheetText(page);
      const names = await page.evaluate(() => {
        const s = window.zm!.sim!.st.sasiedzi!;
        const sp = s.spotkanie!;
        return s.budynki[sp.b].domy[sp.dom].osoby.map((o) => o.name);
      });
      console.log(`  ${t.replace(/\s+/g, ' ').slice(0, 260)}`);
      if (!t.includes('Neighbours') || !t.includes('Walk away')) throw new Error('okno spotkania nie po angielsku');
      const pl = polskieLitery(t, names);
      if (pl.length) throw new Error(`polskie słowa w oknie spotkania: ${pl.join(', ')}`);
    },
  },
  m2f2Card('en-m2f2-karta-budynku', 1440, 900, 'en'),
  // angielski i polski (docs/superpowers/specs/2026-10-18-angielski-design.md): te same ekrany w obu językach, na
  // komputerze i telefonie 390×844. Każdy wypisuje słowa, które wyglądają na drugi język (do obejrzenia: imiona
  // i nazwy miejsc zostają polskie), a przełącznik w Menu zmienia język otwartego okna bez przeładowania.
  ...((): Shot[] => {
    const game = async (page: Page, base: string, q = '') => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3${q}`);
      await waitIdle(page);
    };
    const pick = async (page: Page, touch: boolean) => {
      const a = await page.evaluate(() => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
        const [x, y] = zm.screenOf(p.x, p.y - 0.55);
        return { x, y };
      });
      if (touch) await page.touchscreen.tap(a.x, a.y);
      else await page.mouse.click(a.x, a.y);
      await page.waitForTimeout(300);
      if (!(await page.isVisible('#card'))) throw new Error('karta osoby nie pokazała się po zaznaczeniu');
    };
    /** karta nocy pierwszego dnia (po pierwszej uchwale) */
    const nightCard = async (page: Page, base: string) => {
      await game(page, base, '&godzina=19.5');
      await page.evaluate(() => window.zm!.govTick());
      await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
      const p = await page.evaluate(() => window.zm!.ff(31));
      if (p !== 'karta') throw new Error(`o 20:00 zamiast karty nocy: ${p}`);
      await page.waitForTimeout(200);
    };
    /** raport rano po pierwszej nocy (wydarzenia po drodze: pierwsza możliwa odpowiedź) */
    const report = async (page: Page, base: string) => {
      await nightCard(page, base);
      await page.click('#sheet [data-act="night-go"]');
      for (let k = 0; k < 30; k++) {
        const p = await page.evaluate(() => window.zm!.ff(30));
        if (p === 'raport') return waitIdle(page);
        if (p === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
        else if (p === 'uchwala') await page.click('#sheet [data-act="law-skip"]');
        else if (p === 'karta') await page.click('#sheet [data-act="night-go"]');
      }
      throw new Error('raport po nocy się nie pokazał');
    };
    /** słowa widoczne na stronie, które wyglądają na polskie (w angielskim) albo angielskie (w polskim) */
    const obcy = async (page: Page, lang: 'en' | 'pl', name: string) => {
      const words = await page.evaluate((lang) => {
        const text = document.body.innerText;
        const out = new Set<string>();
        for (const w of text.split(/[^\p{L}’']+/u)) {
          if (!w) continue;
          if (lang === 'en' && /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(w)) out.add(w);
          if (lang === 'pl' && /^(the|and|with|from|you|your|board|night|watch|stove|fence)$/i.test(w)) out.add(w);
        }
        return [...out];
      }, lang);
      if (words.length)
        console.log(
          `  ${name}: do sprawdzenia (${lang === 'en' ? 'polskie litery' : 'angielskie słowa'}): ${words.join(', ')}`,
        );
    };
    const out: Shot[] = [];
    for (const lang of ['en', 'pl'] as const)
      for (const phone of [false, true]) {
        const sfx = phone ? '-telefon' : '';
        const size = phone ? { w: 390, h: 844 } : {};
        const shot = (name: string, run: (page: Page, base: string) => Promise<void>): Shot => ({
          name: `${lang}-${name}${sfx}`,
          query: '',
          lang,
          ...size,
          run: async (page, base) => {
            await run(page, base);
            const htmlLang = await page.evaluate(() => document.documentElement.lang);
            if (htmlLang !== lang) throw new Error(`<html lang> to ${htmlLang}, a miało być ${lang}`);
            await obcy(page, lang, `${lang}-${name}${sfx}`);
          },
        });
        out.push(
          shot('start', async (page, base) => {
            await page.goto(base);
            await page.waitForSelector('#demos button');
            const lore = await page.$eval('#lore', (e) => e.textContent ?? '');
            if (lang === 'en' ? !lore.startsWith('It is 2051.') : !lore.startsWith('Rok 2051.'))
              throw new Error(`wstęp nie w tym języku: ${lore.slice(0, 40)}`);
            const pressed = await page.$eval(
              '#langStart [aria-pressed="true"]',
              (b) => (b as HTMLElement).dataset.lang,
            );
            if (pressed !== lang) throw new Error(`przełącznik pokazuje ${pressed}`);
          }),
          shot('pasek', async (page, base) => {
            await game(page, base, '&godzina=15');
            await page.waitForTimeout(300);
          }),
          shot('karta-osoby', async (page, base) => {
            await game(page, base);
            await pick(page, phone);
          }),
          shot('karta-nocy', nightCard),
          shot('raport', report),
        );
      }
    out.push({
      // przełącznik w Menu: z angielskiego na polski przy otwartej karcie nocy (bez przeładowania i bez utraty
      // przydziału), potem z powrotem; zrzut po polsku
      name: 'en-zmiana-jezyka',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await nightCard(page, base);
        const before = await page.textContent('#sheet .sheet-kicker');
        await page.evaluate(() => {
          // przełącznik z Menu działa tak samo: zmienJezyk przez kliknięcie w przycisk data-lang
          const b = document.createElement('div');
          b.innerHTML = '<button type="button" data-lang="pl">PL</button>';
          document.querySelector('#sheet')!.appendChild(b);
          (b.firstChild as HTMLButtonElement).click();
        });
        await page.waitForTimeout(200);
        const after = await page.textContent('#sheet .sheet-kicker');
        const lang = await page.evaluate(() => document.documentElement.lang);
        console.log(`  karta nocy: „${before}” → „${after}”, <html lang> ${lang}`);
        if (before === after || lang !== 'pl') throw new Error('karta nocy nie zmieniła języka');
        if (!(await page.isVisible('#sheet select.pick'))) throw new Error('karta nocy zniknęła po zmianie języka');
      },
    });
    out.push({
      name: 'en-menu',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await game(page, base);
        await page.click('#btnMenu');
        await page.waitForSelector('#modal:not([hidden]) [data-lang="pl"]');
      },
    });
    // najdłuższe angielskie teksty: okno wydarzenia i pomoc, na komputerze i telefonie
    for (const phone of [false, true]) {
      const sfx = phone ? '-telefon' : '';
      const size = phone ? { w: 390, h: 844 } : {};
      out.push(
        {
          name: `en-wydarzenie${sfx}`,
          query: '',
          lang: 'en',
          ...size,
          run: async (page, base) => {
            await game(page, base);
            let p: string | null = null;
            for (let k = 0; k < 12 && p !== 'wydarzenie'; k++) p = await page.evaluate(() => window.zm!.ff(20));
            if (p !== 'wydarzenie') throw new Error('przez cztery godziny gry nie było wydarzenia');
            await waitIdle(page);
            console.log(`  wydarzenie: ${await page.textContent('#sheet .sheet-title')}`);
            await obcy(page, 'en', `en-wydarzenie${sfx}`);
          },
        },
        {
          name: `en-pomoc${sfx}`,
          query: '',
          lang: 'en',
          ...size,
          run: async (page, base) => {
            await game(page, base);
            await page.click('#btnMenu');
            await page.click('#sheet [data-act="menu-help"]');
            await page.waitForSelector('#sheet .help');
            await obcy(page, 'en', `en-pomoc${sfx}`);
          },
        },
      );
    }
    out.push({
      // menu wraku po angielsku (napisy surowców z src/sim/surowce.ts): najbliższy wrak przy siedzibie
      name: 'en-surowce-menu',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await game(page, base);
        await page.evaluate(() => {
          const zm = window.zm!;
          const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
          zm.setCam(p.x, p.y, 1.3);
        });
        await waitIdle(page);
        await pick(page, false);
        const at = await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const door = w.buildings[w.hq].entrances[0].out;
          const [dx, dy] = [door % w.size, Math.floor(door / w.size)];
          const r = w.props
            .filter((p) => p.kind === 'wrak')
            .sort((a, b) => Math.hypot(a.x - dx, a.y - dy) - Math.hypot(b.x - dx, b.y - dy))[0];
          zm.setCam(r.x + r.w / 2, r.y + r.h / 2, 1.6);
          return [r.x + r.w / 2, r.y + r.h / 2];
        });
        await waitIdle(page);
        const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py), at);
        await page.mouse.click(x, y, { button: 'right' });
        await page.waitForSelector('#ctx:not([hidden])');
        const items = await page.locator('#ctx .ctx-item').allTextContents();
        console.log(`  menu: ${items.join(' | ')}`);
        if (!items.some((i) => /^Search the (Fiat 126p|Polonez)$/.test(i)))
          throw new Error('w angielskim menu wraku nie ma przeszukania');
        await obcy(page, 'en', 'en-surowce-menu');
      },
    });
    out.push({
      // plan warsztatu po angielsku na podwórku (tam nie wolno), zmiana języka bez ruchu myszą: powód z canPlace
      // i sterowanie na pasku po polsku od razu, nie dopiero po ruchu kursora
      name: 'en-budowa-zmiana-jezyka',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await game(page, base);
        const { BUILDS } = await import('../src/sim/budowle.ts');
        await stockUp(page, BUILDS.warsztat.cost);
        await chooseBuild(page, 'warsztat');
        const [x, y] = await page.evaluate(() => {
          const w = window.zm!.sim!.w;
          const t = w.fence.yard[0];
          window.zm!.setCam((t % w.size) + 1, Math.floor(t / w.size) + 1, 1.6);
          return [t % w.size, Math.floor(t / w.size)];
        });
        await waitIdle(page);
        const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x + 0.5, y + 0.5), [x, y]);
        await page.mouse.move(sx, sy);
        await page.waitForTimeout(150);
        const en = (await page.textContent('#placeText')) ?? '';
        await page.evaluate(() => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.lang = 'pl';
          document.querySelector('#sheet')!.appendChild(b);
          b.click();
          b.remove();
        });
        await page.waitForTimeout(100);
        const pl = (await page.textContent('#placeText')) ?? '';
        console.log(`  pasek: „${en}” → „${pl}”`);
        if (!/only in a room/i.test(en)) throw new Error(`pasek po angielsku bez powodu: ${en}`);
        if (/\b(only|room|flat|click|rotates|cancels)\b/i.test(pl))
          throw new Error('pasek stawiania po zmianie języka ma angielskie słowa');
      },
    });
    out.push({
      // ?lang=pl wygrywa z zapamiętanym angielskim i zostaje w adresie po „Zapisz i wróć na start”; podpowiedzi
      // przykładów w języku strony (po angielsku bez polskich opisów zabudowy)
      name: 'en-lang-adres',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&lang=pl`);
        await waitIdle(page);
        if ((await page.evaluate(() => document.documentElement.lang)) !== 'pl')
          throw new Error('?lang=pl nie wygrał z pamięcią');
        await page.click('#btnMenu');
        await page.click('#sheet [data-act="menu-start"]');
        await page.waitForSelector('#demos button');
        const lang = await page.evaluate(() => document.documentElement.lang);
        const plTitles = await page.$$eval('#demos button', (l) => l.map((b) => (b as HTMLElement).title));
        console.log(`  po powrocie: ${page.url().replace(base, '/')}, <html lang> ${lang}; ${plTitles.join(' | ')}`);
        if (lang !== 'pl' || !page.url().includes('lang=pl')) throw new Error('powrót na kartę startową zgubił ?lang=');
        await page.goto(base);
        await page.waitForSelector('#demos button');
        const enTitles = await page.$$eval('#demos button', (l) => l.map((b) => (b as HTMLElement).title));
        console.log(`  po angielsku: ${enTitles.join(' | ')}`);
        if (enTitles.some((t) => /falowiec|płyta|bloki|szeregowce|domy|gm\./.test(t)))
          throw new Error('podpowiedzi przykładów po polsku w angielskiej wersji');
      },
    });
    out.push({
      // uzbrojone „Delete save” przy zmianie języka: napis „Na pewno? Usuń” w nowym języku, po 4 s z powrotem
      name: 'en-usun-zapis',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await game(page, base);
        await page.click('#btnMenu');
        await page.click('#sheet [data-act="menu-start"]');
        await page.waitForSelector('#resume:not([hidden]) #btnForget');
        await page.click('#btnForget');
        const armed = await page.textContent('#btnForget');
        await page.click('#langStart [data-lang="pl"]');
        const pl = await page.textContent('#btnForget');
        await page.waitForTimeout(4200);
        const later = await page.textContent('#btnForget');
        console.log(`  przycisk: „${armed}” → „${pl}” → „${later}”`);
        if (armed !== 'Really delete?' || pl !== 'Na pewno? Usuń' || later !== 'Usuń zapis')
          throw new Error('uzbrojony przycisk usuwania nie poszedł za językiem');
        if (!(await page.isVisible('#resume'))) throw new Error('zapis zniknął bez drugiego kliknięcia');
      },
    });
    return out;
  })(),
  // kotwica stylu z PixelLab (M3, do akceptacji): ten sam kadr przy siedzibie dziś i z assetami z assets/raw,
  // do tego arkusz wybranych assetów z kosztami i paletą
  { name: 'kotwica-stylu', query: '', run: kotwicaStylu },
  { name: 'kotwica-wysoki-blok', query: '', run: kotwicaWysokiBlok },
  { name: 'kotwica-tlum', query: '', run: kotwicaTlum },
  { name: 'kotwica-arkusz', query: '', run: (page) => kotwicaArkusz(page) },
  {
    // bez public/assets (404) gra startuje i rysuje wszystko kodem, jak przed grafiką z PixelLab
    name: 'grafika-zapas',
    query: '',
    allow: /status of 404/,
    allowUrl: /\/assets\/grafika\.json/,
    run: async (page, base) => {
      await page.route('**/assets/grafika.json', (r) => r.fulfill({ status: 404, body: 'brak' }));
      await page.goto(`${base}?demo=lanciego&speed=0&cam=hq,1`);
      await waitIdle(page);
      const g = await page.evaluate(() => window.zm!.grafika());
      console.log(`  grafika: ${JSON.stringify(g)}`);
      if (g !== null) throw new Error('bez public/assets gra wzięła grafikę z PixelLab');
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

/** nazwy domowych celów z TARGETS na karcie nocy w domu jednorodzinnym (tresc.ts: `targetName`) */
const CELE_DOMU = ['opuszczony dom obok', 'sklep przy głównej drodze', 'garaże obok', 'szopy'];

/** Karta nocy pierwszej nocy w Zielonkach (dom jednorodzinny): bez słów z bloku, z radą komitetu i z wyprawami, których
    nazwy są domowe. Bez mapy miasta (`miasto=0`) to dokładnie domowe cele z TARGETS, w tym opuszczony dom obok; z mapą
    każda wyprawa jest albo miejscem z okolicy („Przychodnia (Estetica Dent), 423 m”), albo domowym celem z TARGETS
    (druga opcja bywa nim, gdy okolica ma tylko jedno miejsce). */
async function kartaNocyWDomu(page: Page, base: string, miasto: boolean): Promise<void> {
  const etykieta = miasto ? 'z mapą miasta' : 'bez mapy miasta';
  await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1.2${miasto ? '' : '&miasto=0'}`);
  await waitIdle(page);
  await chopDryTree(page);
  for (let k = 0; k < 120; k++) {
    const p = await page.evaluate(() => window.zm!.ff(10));
    if (p === 'karta') {
      const t = await sheetText(page);
      // sheetText skleja wiersze bez separatorów, a po nazwie wyprawy zawsze idzie „, ryzyko”
      const nazwy = [...new Set([...t.matchAll(/Wyprawa (?:blisko|daleko): ([\s\S]*?), ryzyko/g)].map((m) => m[1]))];
      console.log(`  karta nocy w domu (${etykieta}): ${nazwy.join(' | ') || t.slice(0, 120)}`);
      if (BLOKOWE_UI.test(t)) throw new Error(`karta nocy w domu (${etykieta}) z blokowiskiem: ${t}`);
      if (!nazwy.length) throw new Error(`na karcie nocy w domu (${etykieta}) nie ma wypraw`);
      for (const n of nazwy)
        if (!CELE_DOMU.includes(n) && !(miasto && /, \d+ m$/.test(n)))
          throw new Error(
            `wyprawa na karcie nocy w domu (${etykieta}) nie jest domowym celem ani miejscem z okolicy: ${n}`,
          );
      if (!miasto && !nazwy.includes('opuszczony dom obok'))
        throw new Error('na karcie bez mapy miasta nie ma wyprawy do opuszczonego domu obok');
      if (!t.includes('Jak radzi komitet')) throw new Error(`karta nocy w domu (${etykieta}) bez rady komitetu`);
      return;
    }
    if (p) await answerFirst(page, p);
  }
  throw new Error(`karta nocy w domu (${etykieta}) się nie pokazała`);
}

/* ---------- M2 fala 2: pomocnicy scenariuszy m2f2-* ---------- */

/** scenariusz fali 2 na demie: strona z kamerą na siedzibie, w pauzie, i własny ciąg dalszy */
function m2f2(name: string, demo: string, then: (page: Page) => Promise<void>): Shot {
  return {
    name,
    query: '',
    run: async (page, base) => {
      await page.goto(`${base}?demo=${demo}&speed=0&cam=hq,1`);
      await waitIdle(page);
      await then(page);
    },
  };
}

/** zaznaczenie pierwszej osoby z zarządu kliknięciem w głowę */
async function m2f2Select(page: Page) {
  const a = await page.evaluate(() => {
    const zm = window.zm!;
    const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
    zm.setCam(p.x, p.y, 1.3);
    return [p.x, p.y] as [number, number];
  });
  await waitIdle(page);
  const [x, y] = await page.evaluate(([px, py]) => window.zm!.screenOf(px, py - 0.55), a);
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  if (!(await page.isVisible('#card'))) throw new Error('karta osoby nie pokazała się po zaznaczeniu');
}

/** Otwiera sąsiedni budynek (po nazwie albo najbliższy siedzibie budynek tej klasy): pierwsza osoba z zarządu z łomem
    staje przed pierwszym wejściem i otwiera drzwi, a zamknięte na klucz wyważa (praca w symulacji, jak z menu). Drugie
    i trzecie wejście dostają tylko wygląd (zabite deskami, wyważone), żeby było widać wszystkie stany drzwi. */
async function m2f2Open(page: Page, which: string, looks: boolean, pusty = false) {
  const r = await page.evaluate(
    ([which, looks, pusty]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const w = sim.w;
      const size = w.size;
      const door = w.buildings[w.hq].entrances[0].out;
      const d2 = (t: number) =>
        ((t % size) - (door % size)) ** 2 + (Math.floor(t / size) - Math.floor(door / size)) ** 2;
      const b =
        w.buildings.find((x) => x.name === which) ??
        w.buildings
          .filter((x) => x.id !== w.hq && x.cls === which && x.entrances.length)
          .filter((x) => !pusty || !sim.budynekDoKarty(x.id)?.b.domy.length)
          .sort((a, c) => d2(a.entrances[0].out) - d2(c.entrances[0].out))[0];
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      p.weapon = 'lom';
      const e = b.entrances[0];
      p.x = (e.out % size) + 0.5;
      p.y = Math.floor(e.out / size) + 0.5;
      p.path = [];
      p.pi = 0;
      const work = (t: 'open' | 'force', tile: number) => {
        sim.push({ t, ids: [p.id], door: tile });
        sim.step();
        for (let i = 0; i < 4000 && p.job?.t === 'door'; i++) sim.step();
      };
      const rec = () => sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id);
      work('open', e.tile);
      if (!rec()?.otwarty) work('force', e.tile);
      if (looks) {
        // sam wygląd drzwi pozostałych wejść (przechodniość się nie liczy, scena nic nie robi)
        const set = (k: number, s: 'zabite' | 'wywazone') => {
          const d = rec()?.drzwi.find((x) => x.t === b.entrances[k]?.tile);
          if (d) d.s = s;
        };
        set(1, 'zabite');
        set(2, 'wywazone');
        sim.wersjaSasiadow++;
      }
      for (let i = 0; i < 20; i++) sim.step();
      return { bid: b.id, name: b.name, open: !!rec()?.otwarty, drzwi: rec()?.drzwi.map((x) => x.s) ?? [] };
    },
    [which, looks, pusty] as const,
  );
  if (!r.open) throw new Error(`${r.name}: budynek się nie otworzył`);
  return r;
}

/** Etap 3: plan wspólnego płotu do 10F w toku. Materiał już doniesiony, pierwsza osoba z zarządu stawia, aż praca dojdzie
    do 40% (symulacja, jak z menu); potem zaznaczona (karta z opisem pracy), a kamera na duchu przyszłego obwodu: z bliska
    (zoom 0,62, kawałki 32 px na metr) albo z daleka (0,3, kawałki 8 px na metr). */
function m2f2PlotDuch(name: string, zoom: number, lang: 'pl' | 'en'): Shot {
  return {
    ...m2f2(name, 'lanciego', async (page) => {
      const r = await m2f2Open(page, 'Blok nr 10F', false);
      const out = await page.evaluate((bid) => {
        const sim = window.zm!.sim!;
        const p = sim.st.pawns.find((q) => q.kind === 'core')!;
        sim.push({ t: 'enclose', ids: [p.id], bid });
        sim.step();
        const plan = sim.st.plot?.plan;
        if (!plan) return null;
        plan.have = { ...plan.need };
        sim.push({ t: 'enclose', ids: [p.id], bid });
        for (let i = 0; i < 20000 && plan.work < plan.total * 0.4; i++) sim.step();
        return { work: plan.work, total: plan.total, job: p.job?.t ?? null };
      }, r.bid);
      if (!out) throw new Error('plan płotu nie powstał');
      await m2f2Select(page);
      await page.evaluate(
        ([bid, zoom]) => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const b = w.buildings[bid];
          const hq = w.buildings[w.hq];
          zm.setCam((b.x0 + hq.x0) / 2 + 4, (b.y0 + hq.y1) / 2 + 6, zoom);
        },
        [r.bid, zoom] as const,
      );
      await page.waitForTimeout(300);
      await waitIdle(page);
      const seen = await page.evaluate(() => ({
        n: (window.zm!.view as unknown as { plotDuch: { count: number } }).plotDuch.count,
        doing: document.querySelector('#card .doing')?.textContent ?? '',
      }));
      console.log(
        `  praca ${out.work}/${out.total} (${out.job}), duch: ${seen.n} kafelków siatki, karta: ${seen.doing}`,
      );
      if (!seen.n) throw new Error('nie ma ducha planu płotu');
      const want = lang === 'en' ? 'Putting up the shared fence (40%).' : 'Stawia wspólny płot (40%).';
      if (seen.doing !== want) throw new Error(`karta osoby bez postępu płotu: ${seen.doing}`);
    }),
    lang,
  };
}

/** Puka do domów w Zielonkach od najbliższego, aż ktoś otworzy (spotkanie w drzwiach), i czeka na okno spotkania.
    lubiany: o zmierzchu, lokatorzy z generatora mieszkańców (a gdy nikt nie otworzy, życzliwi z cechą lubiany);
    wrogi: o 23, kłótliwi i odważni, którzy nocą rzucają się od razu. */
async function m2f2Knock(page: Page, base: string, kind: 'lubiany' | 'wrogi', ugryziony = false) {
  await page.goto(`${base}?demo=zielonki&speed=0&cam=hq,1&godzina=${kind === 'wrogi' ? 23 : 18.5}`);
  await waitIdle(page);
  const r = await page.evaluate(
    ([kind, ugryziony]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const w = sim.w;
      const size = w.size;
      const door = w.buildings[w.hq].entrances[0].out;
      const d2 = (t: number) =>
        ((t % size) - (door % size)) ** 2 + (Math.floor(t / size) - Math.floor(door / size)) ** 2;
      const houses = w.buildings
        .filter((b) => b.id !== w.hq && b.cls === 'dom' && b.entrances.length)
        .sort((a, b) => d2(a.entrances[0].out) - d2(b.entrances[0].out));
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      const knock = (b: (typeof houses)[number]) => {
        const e = b.entrances[0];
        p.x = (e.out % size) + 0.5;
        p.y = Math.floor(e.out / size) + 0.5;
        p.path = [];
        p.pi = 0;
        sim.push({ t: 'knock', ids: [p.id], door: e.tile });
        sim.step();
        for (let i = 0; i < 3000 && p.job?.t === 'door'; i++) sim.step();
        return !!sim.st.sasiedzi?.spotkanie;
      };
      const os = (first: string, name: string, f: boolean, prof: string, age: number, traits: string[]) => ({
        first,
        name,
        f,
        prof,
        skills: {},
        age,
        traits,
      });
      const people =
        kind === 'wrogi'
          ? [
              os('Roman', 'Roman Kos', false, 'ślusarz', 48, ['klotliwy', 'odwazny']),
              os('Bożena', 'Bożena Kos', true, 'szwaczka', 46, ['klotliwy', 'odwazny']),
            ]
          : [
              os('Teresa', 'Teresa Wilk', true, 'krawcowa', 63, ['lubiany']),
              os('Zdzisław', 'Zdzisław Wilk', false, 'kolejarz', 66, ['lubiany']),
            ];
      const own = (bid: number) => ({
        stany: [{ bid, apt: 0, state: 'mieszkancy' as const }],
        domy: [{ apt: 0, klatka: -1, zal: false, osoby: people }],
      });
      let gen = kind === 'lubiany';
      if (!gen) sim.lokatorzy = own;
      let k = 0;
      for (; k < houses.length && k < 14; k++) {
        if (knock(houses[k])) break;
        if (gen && k === 7) {
          gen = false;
          sim.lokatorzy = own;
        }
      }
      zm.setCam(p.x, p.y - 1, 1.7);
      const sp = sim.st.sasiedzi?.spotkanie;
      // etap 2: ktoś z nich ukrywa ugryzienie (jak w trybie zombie), zanim karta się pokaże
      if (sp && ugryziony) sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom].ugryziony = 0;
      return { house: houses[k]?.name ?? '', k, gen, sp: !!sp, atak: sp?.atak ?? null };
    },
    [kind, ugryziony] as const,
  );
  console.log(
    `  ${r.house} (${r.k + 1}. dom, lokatorzy ${r.gen ? 'z generatora' : 'ze scenariusza'}): spotkanie ${r.sp}, atak ${r.atak}`,
  );
  if (!r.sp) throw new Error('nikt nie otworzył drzwi');
  await page.waitForSelector('#sheet [data-act="meet"]');
  await waitIdle(page);
}

/** okno spotkania z sąsiadami w drzwiach, także na telefonie (mieści się bez przewijania w bok) */
function m2f2Meet(name: string, w: number, h: number): Shot {
  return {
    name,
    query: '',
    w,
    h,
    run: async (page, base) => {
      await m2f2Knock(page, base, 'lubiany');
      const t = await sheetText(page);
      console.log(`  ${t.replace(/\s+/g, ' ').slice(0, 240)}`);
      if (!(await page.getAttribute('#sheet', 'class'))?.includes('sasiedzi'))
        throw new Error('okno bez odcienia sąsiadów');
      const bad = await page.evaluate(() => {
        const s = document.querySelector('#sheet') as HTMLElement;
        const r = s.getBoundingClientRect();
        const out: string[] = [];
        if (r.left < 0 || r.right > innerWidth + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5)
          out.push('okno poza ekranem');
        for (const el of s.querySelectorAll<HTMLElement>('.btn'))
          if (el.getBoundingClientRect().right > r.right + 0.5) out.push(`wystaje: ${el.textContent}`);
        return out;
      });
      if (bad.length) throw new Error(bad.join('; '));
    },
  };
}

/** karta znajomego sąsiedniego budynku na Przymorzu po kliknięciu (na telefonie stuknięciu) bez zaznaczenia; po
    angielsku nazwa budynku z mapy po angielsku i bez polskich liter poza imionami i nazwą */
function m2f2Card(name: string, w: number, h: number, lang: 'pl' | 'en' = 'pl'): Shot {
  return {
    name,
    query: '',
    w,
    h,
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
      await waitIdle(page);
      const at = await page.evaluate(() => {
        const zm = window.zm!;
        const w = zm.sim!.w;
        const size = w.size;
        const door = w.buildings[w.hq].entrances[0].out;
        const d2 = (t: number) =>
          ((t % size) - (door % size)) ** 2 + (Math.floor(t / size) - Math.floor(door / size)) ** 2;
        const b = w.buildings
          .filter((x) => x.id !== w.hq && (x.cls === 'blok' || x.cls === 'dom') && x.entrances.length)
          .sort((a, c) => d2(a.entrances[0].out) - d2(c.entrances[0].out))[0];
        let tile = Math.round((b.y0 + b.y1) / 2) * size + Math.round((b.x0 + b.x1) / 2);
        if (w.bid[tile] !== b.id)
          for (let i = 0; i < size * size; i++)
            if (w.bid[i] === b.id) {
              tile = i;
              break;
            }
        const xy: [number, number] = [(tile % size) + 0.5, Math.floor(tile / size) + 0.5];
        zm.setCam(xy[0], xy[1] + 4, 0.9);
        const names = zm.sim!.budynekDoKarty(b.id)?.b.domy.flatMap((g) => g.osoby.map((o) => o.name)) ?? [];
        return { xy, name: b.name, names };
      });
      await waitIdle(page);
      const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y), at.xy);
      if (w < 640) await page.touchscreen.tap(sx, sy);
      else await page.mouse.click(sx, sy);
      await page.waitForTimeout(400);
      await waitIdle(page);
      const card = (await page.textContent('#card')) ?? '';
      console.log(`  ${at.name}: ${card.replace(/\s+/g, ' ').slice(0, 260)}`);
      if (lang === 'en') {
        const en = nazwaBudynkuEn(at.name);
        if (!card.includes(en)) throw new Error(`nie widać karty budynku „${en}”`);
        if (!card.includes('People you know here')) throw new Error('karta znajomego budynku bez znajomych');
        const pl = polskieLitery(card, [at.name, ...at.names]);
        if (pl.length) throw new Error(`polskie słowa na karcie budynku: ${pl.join(', ')}`);
        return;
      }
      if (!card.includes(at.name)) throw new Error('nie widać karty budynku');
      if (!card.includes('Znacie stąd')) throw new Error('karta znajomego budynku bez znajomych');
    },
  };
}

/** prawy przycisk na pierwszych drzwiach budynku (po nazwie z mapy) przy danym zbliżeniu; pozycje menu */
async function m2f2DoorMenu(page: Page, name: string, zoom: number): Promise<string[]> {
  const xy = await page.evaluate(
    ([name, zoom]) => {
      const zm = window.zm!;
      const w = zm.sim!.w;
      const t = w.buildings.find((x) => x.name === name)!.entrances[0].tile;
      const at: [number, number] = [(t % w.size) + 0.5, Math.floor(t / w.size) + 0.5];
      zm.setCam(at[0], at[1], zoom);
      return at;
    },
    [name, zoom] as const,
  );
  await waitIdle(page);
  const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y), xy);
  await page.mouse.click(sx, sy, { button: 'right' });
  await page.waitForSelector('#ctx:not([hidden])');
  return page.locator('#ctx .ctx-item').allTextContents();
}

/** słowa z polskimi literami w tekście po angielsku, po usunięciu dozwolonych napisów (imiona, nazwy z mapy) */
function polskieLitery(text: string, dozwolone: readonly string[]): string[] {
  let t = text;
  for (const d of [...dozwolone].sort((a, b) => b.length - a.length)) if (d) t = t.replaceAll(d, ' ');
  return [...new Set(t.split(/[^\p{L}]+/u).filter((s) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s)))];
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

/** Wieczór pod tłumem: kilkunastu szwendaczy napiera na jeden kafelek siatki, symulacja idzie kwadrans gry (siatka już
    zużyta, ale jeszcze stoi), kamera na tym miejscu. Pasek ma pokazać tłok ponad próg. */
async function zombieCrowd(page: Page, base: string) {
  // o zmierzchu szwendaczy widać jako szare sylwetki (w nocy bez światła prawie wcale)
  await page.goto(`${base}?demo=przymorze&tryb=zombie&speed=0&godzina=18.8&stado=24&cam=hq,1`);
  await waitIdle(page);
  const info = await page.evaluate(() => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const st = sim.st;
    const w = sim.w;
    const size = w.size;
    const yard = new Set(w.fence.yard);
    const door = w.buildings[w.hq].entrances[0].out;
    // kafelek siatki najbliżej drzwi siedziby, z wolnym miejscem za siatką
    const spot = w.fence.tiles
      .map((t) => ({
        t,
        out: [t - size, t + size, t - 1, t + 1].find((n) => !yard.has(n) && sim.canWalk('zombie', n)),
      }))
      .filter((x) => x.out !== undefined)
      .sort(
        (a, b) =>
          Math.hypot((a.t % size) - (door % size), Math.floor(a.t / size) - Math.floor(door / size)) -
          Math.hypot((b.t % size) - (door % size), Math.floor(b.t / size) - Math.floor(door / size)),
      )[0];
    const out = spot.out!;
    // dwudziestu szwendaczy stoi dokładnie na jednym kafelku tuż za siatką (najgorszy przypadek: sprite'y nałożyłyby się
    // w jeden, widok rozsuwa je z numeru pionka) i napiera na kafelek siatki
    let n = 0;
    for (const z of st.pawns.filter((p) => p.kind === 'zombie').slice(0, 20)) {
      Object.assign(z, { x: (out % size) + 0.5, y: Math.floor(out / size) + 0.5, path: [], pi: 0 });
      z.job!.phase = 2;
      z.job!.target = spot.t;
      n++;
    }
    for (let k = 0; k < 200; k++) sim.step();
    // panel celów zasłania lewą część ekranu komputera, więc kamera trochę w prawo od miejsca naporu
    zm.setCam((spot.t % size) - (window.innerWidth > 600 ? 4 : 0), Math.floor(spot.t / size), 2.2);
    const k = w.fence.tiles.indexOf(spot.t);
    return { pressing: n, hp: Math.round(st.fence!.hp[k]), breaches: st.tally?.breaches ?? 0 };
  });
  console.log(`  tłum: ${JSON.stringify(info)}`);
  if (info.pressing < 17) throw new Error('za mało napierających na jednym kafelku');
  await waitIdle(page);
  // pasek u góry odświeża się co 200 ms
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
/** początek (x, y) wolnego odcinka `dlugosc` kafelków w poziomie najbliżej siedziby (trawa, chodnik, bez rzeczy), albo null */
async function wolnyRzad(page: Page, dlugosc: number): Promise<[number, number] | null> {
  return page.evaluate((dlugosc) => {
    const sim = window.zm!.sim!;
    const st = sim.st;
    const size = sim.w.size;
    const b = sim.w.buildings[sim.w.hq];
    const cx = Math.round((b.x0 + b.x1) / 2);
    const cy = Math.round((b.y0 + b.y1) / 2);
    const wolny = (x: number, y: number) =>
      !sim.blocked[y * size + x] && !st.things.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
    let najlepszy: [number, number] | null = null;
    let najblizej = 1e9;
    for (let y = cy - 30; y <= cy + 30; y++)
      for (let x = cx - 30; x <= cx + 14; x++) {
        let ok = true;
        for (let k = 0; k < dlugosc && ok; k++) ok = wolny(x + k, y);
        const d = Math.hypot(x + dlugosc / 2 - cx, y - cy);
        if (ok && d < najblizej) {
          najblizej = d;
          najlepszy = [x, y];
        }
      }
    return najlepszy;
  }, dlugosc);
}

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

/** pozy pionków zarządu po kolei, z ostatniej klatki widoku: nazwa pozy albo leżenie */
async function poseCheck(page: Page, want: string[]) {
  const names = await page.evaluate(() => {
    const zm = window.zm!;
    return zm
      .sim!.st.pawns.filter((p) => p.kind === 'core')
      .map((p) => {
        const pv = zm.view.poses.get(p.id)!;
        return pv.lie ? 'lie' : pv.pose;
      });
  });
  console.log(`  pozy: ${names.join(', ')}`);
  if (names.join() !== want.join()) throw new Error(`pozy ${names.join()} zamiast ${want.join()}`);
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
/** --dalej: scenariusz, który padł, dostaje drugą próbę, a przebieg idzie dalej i na końcu wypisuje, co padło */
const dalej = process.argv.includes('--dalej');
const s = await openSession({ dist });

/** jeden scenariusz w nowej stronie; strona zamyka się także po błędzie */
async function zrzut(shot: Shot): Promise<void> {
  const mobile = (shot.w ?? 1440) < 640;
  const page = await s.browser.newPage({
    viewport: { width: shot.w ?? 1440, height: shot.h ?? 900 },
    isMobile: mobile,
    hasTouch: mobile || !!shot.touch,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  // język jak wybór gracza zapisany w pamięci przeglądarki (src/ui/jezyk.ts), przed skryptami strony
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('za-murem-0.4-jezyk', l);
    } catch {
      // strona bez pamięci: gra wybierze język domyślny
    }
  }, shot.lang ?? 'pl');
  // --kod: każda strona gry dostaje ?grafika=kod, zanim ruszą jej skrypty (adres w pasku, który czyta main.ts)
  if (KOD)
    await page.addInitScript(() => {
      try {
        const u = new URL(location.href);
        if (!u.searchParams.has('grafika')) {
          u.searchParams.set('grafika', 'kod');
          history.replaceState(null, '', u);
        }
      } catch {
        // strona bez adresu (about:blank, setContent): nic do zmiany
      }
    });
  try {
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
  } finally {
    await page.close().catch(() => {});
  }
}

const padly: string[] = [];
try {
  for (const shot of SHOTS) {
    if (filter && !shot.name.includes(filter)) continue;
    for (let proba = 1; ; proba++) {
      try {
        await zrzut(shot);
        break;
      } catch (e) {
        if (!dalej) throw e;
        const opis = String(e).split('\n')[0];
        if (proba >= 2) {
          console.log(`${shot.name}: BŁĄD ${opis}`);
          padly.push(shot.name);
          process.exitCode = 1;
          break;
        }
        console.log(`${shot.name}: błąd (${opis}), druga próba`);
      }
    }
  }
  if (padly.length) console.log(`Padły: ${padly.join(', ')}`);
} finally {
  await s.close();
}

/** Wybór budowli w panelu budowy: otwiera panel (klawisz B albo przycisk przy dotyku), jeśli zamknięty, wybiera
    zakładkę i kafelek, a „Postaw” zaczyna tryb stawiania. */
async function chooseBuild(page: Page, kind: string, opts: { tap?: boolean } = {}) {
  const { BUILDS } = await import('../src/sim/budowle.ts');
  const open = await page.evaluate(() => !document.getElementById('buildPanel')!.hidden);
  if (!open) {
    if (opts.tap) await page.tap('#btnBuild');
    else await page.keyboard.press('b');
  }
  await page.waitForSelector('#buildPanel .tile');
  const click = (sel: string) => (opts.tap ? page.tap(sel) : page.click(sel));
  await click(`#buildPanel [data-tab="${BUILDS[kind as keyof typeof BUILDS].cat}"]`);
  await click(`#buildPanel .tile[data-kind="${kind}"]`);
  await click(`#buildPanel [data-act="build"][data-arg="${kind}"]`);
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
      // edytor po angielsku z wpisanym imieniem, przełącznik w Menu na polski: edytor po polsku z tym samym wpisem
      name: 'en-imie-zmiana-jezyka',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await wejdz(page, base);
        const r = await mieszkaniecZGeneratora(page, 0, true);
        await waitIdle(page);
        await otworzEdytor(page, r.id, false);
        await wpisz(page, 'Bożenka', false);
        await page.fill('#card input[name="dop"]', 'Bożenki-ręcznie');
        await page.dispatchEvent('#card input[name="dop"]', 'input');
        const en = (await page.textContent('#card form.imie-ed')) ?? '';
        await page.click('#btnMenu');
        await page.click('#modal [data-lang-menu] [data-lang="pl"]');
        await page.click('#sheet [data-act="menu-back"]');
        await page.waitForTimeout(200);
        const pl = (await page.textContent('#card form.imie-ed')) ?? '';
        const pola = await polaEdytora(page);
        console.log(`  edytor: ${en.slice(0, 40)} → ${pl.slice(0, 40)}; ${pola.map((x) => x.value).join(', ')}`);
        if (en === pl) throw new Error('edytor imienia nie zmienił języka');
        if (pola[0].value !== 'Bożenka' || pola[1].value !== 'Bożenki-ręcznie')
          throw new Error('wpisane imię zginęło przy zmianie języka');
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

/** Mapa miasta w grze (src/main.ts): po starcie demo zarząd ma stan miasta (`gov.miasto`), a `zm.okolica` miejsca z
    punktów OSM z kluczami „poi:X:Y”; karta nocy proponuje wyprawy do tych miejsc (nazwa i odległość w metrach). Z
    `?miasto=0` nic z tego nie ma, a karta ma dzisiejsze cele z TARGETS. Zrzut: karta nocy z miejscami z okolicy.
    Okno mapy miasta (src/ui/miasto.ts, zrzuty miasto-mapa*): kafelki z=14 z tests/fixtures (cztery wokół Przymorza),
    reszta z=14 pusta (204) albo zerwana (brak sieci), tło z=12 zawsze puste (204), czyli mapa bez tła z niższego
    poziomu: z daleka widać tylko to, co doczytały kafelki z=14. */
function miastoShots(): Shot[] {
  /** stan po starcie: czy zarząd ma miasto, ile miejsc w okolicy, ile ma zły klucz albo odfiltrowaną (pustą) nazwę */
  const stan = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      const ok = zm.okolica ?? [];
      return {
        miasto: zm.gov?.miasto !== undefined,
        okolica: ok.length,
        zleKlucze: ok.filter((m) => !/^poi:\d+:\d+$/.test(m.klucz)).length,
        bezNazwy: ok.filter((m) => !m.nazwa).length,
        poza: ok.filter((m) => m.x * m.x + m.y * m.y > 192 * 192).length,
      };
    });
  /** nazwy okolicy przy surowych nazwach punktów (po kluczu): osoby z przymorskiego dema, marka, patron szkoły, ile
      wpisów ma niepustą nazwę. Bez filtra podpiętego w main.ts osoby miałyby swoje nazwy, a patron zostawałby w nazwie */
  const nazwy = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      const surowe = new Map(zm.sim!.w.pois.map((p) => [p.k, p.n]));
      const ok = zm.okolica ?? [];
      const wg = (n: string) => ok.filter((m) => surowe.get(m.klucz) === n).map((m) => m.nazwa);
      return {
        osoby: [...wg('Sławomir Mielnik'), ...wg('Kwiaciarnia u Moniki')],
        marki: wg('Żabka'),
        patron: wg('Szkoła Podstawowa Nr 44 im. Adama Mickiewicza'),
        niepuste: ok.filter((m) => m.nazwa).length,
      };
    });
  /** noc dnia 1 do karty: 19:30 uchwała (bez podpisu), 20:00 karta nocy; etykiety opcji wyprawy z listy wyboru osób */
  const doKarty = async (page: Page, base: string, q: string) => {
    await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3&godzina=19.5${q}`);
    await waitIdle(page);
    const u = await page.evaluate(() => window.zm!.govTick());
    if (u !== 'uchwala') throw new Error(`o 19:30 zamiast uchwały: ${u}`);
    await page.click('#sheet [data-act="law"][data-arg="u_warty"]');
    const k = await page.evaluate(() => window.zm!.ff(31));
    if (k !== 'karta') throw new Error(`o 20:00 zamiast karty nocy: ${k}`);
    const opcje = await page
      .locator('#sheet select.pick')
      .first()
      .locator('option')
      .evaluateAll((o) => o.map((x) => x.textContent ?? ''));
    // cel z miejsca ma odległość przy nazwie („Sklep budowlany, 450 m”), cel z TARGETS tylko nazwę
    return opcje.filter((t) => /, \d+ m/.test(t));
  };
  /** kafelki dla okna mapy: szablon i z=14 z tests/fixtures; inne z=14 puste albo (zerwane) bez sieci; z=12 puste */
  const kafelkiMapy = async (page: Page, zerwane = false) => {
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
  };
  const dwieKlatki = (page: Page) =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  /** czeka, aż okno mapy narysuje widok i skończy pobierać jego kafelki */
  const czekajNaMape = async (page: Page) => {
    await dwieKlatki(page);
    await page.waitForFunction(
      () => {
        const s = window.zm!.mapa()?.stan();
        return !!s?.otwarta && s.wTrakcie === 0;
      },
      null,
      { timeout: 30_000, polling: 100 },
    );
    await dwieKlatki(page);
  };
  const otworzMape = async (page: Page, dotyk = false) => {
    if (dotyk) await page.tap('#btnMiasto');
    else await page.click('#btnMiasto');
    await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
    await czekajNaMape(page);
  };
  const ustawMape = async (page: Page, w: { cx: number; cy: number; mNaPiksel: number }) => {
    await page.evaluate((w) => window.zm!.mapa()!.ustaw(w), w);
    await czekajNaMape(page);
  };
  /** okno mapy: przewijanie w bok, atrybucja w stopce i czy ją widać, karta miejsca, stan mapy, tempo gry */
  const okno = (page: Page) =>
    page.evaluate(() => {
      const at = document.querySelector<HTMLElement>('#sheet .miasto-attrib');
      const ar = at?.getBoundingClientRect();
      const karta = document.querySelector<HTMLElement>('#sheet [data-miasto-karta]');
      const kr = karta?.getBoundingClientRect();
      const wyslij = karta?.querySelector<HTMLButtonElement>('[data-act="wyslij"]');
      return {
        bok: document.documentElement.scrollWidth > innerWidth + 1,
        atrybucja: at?.textContent ?? '',
        atrybucjaWidac: !!ar && ar.width > 0 && ar.top >= 0 && ar.bottom <= innerHeight + 0.5,
        karta:
          karta && !karta.hidden && kr
            ? {
                tekst: karta.textContent ?? '',
                prostokat: [kr.left, kr.top, kr.right, kr.bottom].map(Math.round),
                wyslij: wyslij?.textContent ?? '',
                wyszarzony: !!wyslij?.disabled,
              }
            : null,
        tekst: document.querySelector('#sheet')?.textContent ?? '',
        ekran: [innerWidth, innerHeight],
        stan: window.zm!.mapa()!.stan(),
        tempo: window.zm!.speed(),
      };
    });
  /** miejsce poza mapą osiedla w pierścieniu od–do metrów, najchętniej z nazwą */
  const miejsceMapy = (page: Page, od: number, doM: number) =>
    page.evaluate(
      ([od, doM]) => {
        const l = window
          .zm!.mapa()!
          .miejscaMapy()
          .filter((m) => m.odl > od && m.odl < doM);
        const m = l.find((x) => x.nazwa) ?? l[0];
        if (!m) throw new Error(`brak miejsca między ${od} a ${doM} m`);
        return { klucz: m.klucz, x: m.x, y: m.y, nazwa: m.nazwa, kat: m.kat };
      },
      [od, doM],
    );
  const naEkranie = (page: Page, klucz: string) =>
    page.evaluate((k) => {
      const p = window.zm!.mapa()!.naEkranie(k);
      if (!p) throw new Error(`miejsca ${k} nie ma na ekranie`);
      return p;
    }, klucz);
  const ATRYBUCJA_PL = '© współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles';
  const ATRYBUCJA_EN = '© OpenStreetMap contributors, OpenFreeMap, OpenMapTiles';
  /** wspólne sprawdzenia okna: bez przewijania w bok, atrybucja w stopce widoczna */
  const zasady = (o: Awaited<ReturnType<typeof okno>>, atrybucja: string) => {
    if (o.bok) throw new Error('okno mapy przewija się w bok');
    if (!o.atrybucja.includes(atrybucja)) throw new Error(`atrybucja w stopce: ${o.atrybucja}`);
    if (!o.atrybucjaWidac) throw new Error('atrybucji map nie widać na ekranie');
  };
  /** zaznacza w grze `n` pierwszych osób z zarządu: pierwszą kliknięciem w głowę, resztę z Shiftem (kamera na siedzibie) */
  const zaznacz = async (page: Page, n: number) => {
    await page.evaluate(() => {
      const zm = window.zm!;
      const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[0];
      zm.setCam(p.x, p.y, 1.6);
    });
    await waitIdle(page);
    for (let k = 0; k < n; k++) {
      const [x, y] = await page.evaluate((k) => {
        const zm = window.zm!;
        const p = zm.sim!.st.pawns.filter((q) => q.kind === 'core')[k];
        return zm.screenOf(p.x, p.y - 0.55);
      }, k);
      if (k) await page.keyboard.down('Shift');
      await page.mouse.click(x, y);
      if (k) await page.keyboard.up('Shift');
    }
    await page.waitForTimeout(250);
  };
  /** karta wybranego miejsca: czy przycisk „Wyślij” jest aktywny */
  const wyslijAktywny = (page: Page) =>
    page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('#sheet [data-miasto-karta] [data-act="wyslij"]');
      return !!b && !b.disabled;
    });
  /** okno planu wyprawy: osoby (id, napis, wybrana, wyszarzona), podsumowanie, powód, przycisk „Wyślij”, przewijanie w bok */
  const plan = (page: Page) =>
    page.evaluate(() => {
      const sheet = document.getElementById('sheet')!;
      const wyslij = sheet.querySelector<HTMLButtonElement>('[data-act="wyslij"]');
      const body = sheet.querySelector<HTMLElement>('.sheet-body');
      return {
        klasa: sheet.className,
        tytul: sheet.querySelector('.sheet-title')?.textContent ?? '',
        osoby: [...sheet.querySelectorAll<HTMLButtonElement>('[data-act="wp-osoba"]')].map((b) => ({
          id: b.dataset.arg!,
          tekst: b.textContent ?? '',
          wybrana: b.getAttribute('aria-pressed') === 'true',
          wyszarzona: b.disabled,
        })),
        podsumowanie: [...sheet.querySelectorAll('.wp-sum dt')].map((dt) => [
          dt.textContent ?? '',
          dt.nextElementSibling?.textContent ?? '',
        ]),
        powod: sheet.querySelector('.wp-why')?.textContent ?? '',
        wyslij: wyslij ? { tekst: wyslij.textContent ?? '', wyszarzony: wyslij.disabled } : null,
        wroc: sheet.querySelector('[data-act="wp-wroc"]')?.textContent ?? '',
        bok:
          document.documentElement.scrollWidth > innerWidth + 1 || (!!body && body.scrollWidth > body.clientWidth + 1),
        tekst: sheet.textContent ?? '',
        tempo: window.zm!.speed(),
        ekran: [innerWidth, innerHeight],
        stopka: (() => {
          const r = sheet.querySelector('.sheet-foot')?.getBoundingClientRect();
          return r ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null;
        })(),
      };
    });
  /** otwiera mapę i wybiera pierwsze miejsce z pierścienia od–do metrów, do którego karta pozwala wysłać wyprawę;
      zwraca je z klikniętym już „Wyślij wyprawę” (okno planu otwarte) */
  const doPlanu = async (
    page: Page,
    base: string,
    o: {
      dotyk?: boolean;
      zaznacz?: number;
      godzina?: string;
      speed?: number;
      od?: number;
      doM?: number;
      /** dopisek do adresu, np. `&tryb=zombie` */
      q?: string;
    } = {},
  ) => {
    await kafelkiMapy(page);
    await page.goto(`${base}?demo=przymorze&speed=${o.speed ?? 0}&godzina=${o.godzina ?? '8'}&cam=hq,1.6${o.q ?? ''}`);
    await waitIdle(page);
    if (o.zaznacz) await zaznacz(page, o.zaznacz);
    await otworzMape(page, o.dotyk);
    const kandydaci = await page.evaluate(
      ([od, doM]) =>
        window
          .zm!.mapa()!
          .miejscaMapy()
          .filter((m) => m.odl > od && m.odl < doM)
          .sort((a, b) => Number(!!b.nazwa) - Number(!!a.nazwa) || a.odl - b.odl)
          .slice(0, 12)
          .map((m) => ({ klucz: m.klucz, x: m.x, y: m.y, nazwa: m.nazwa, kat: m.kat, odl: Math.round(m.odl) })),
      [o.od ?? 280, o.doM ?? 560],
    );
    for (const m of kandydaci) {
      await ustawMape(page, { cx: m.x - 60, cy: m.y + 40, mNaPiksel: 1.2 });
      const [sx, sy] = await naEkranie(page, m.klucz);
      if (o.dotyk) await page.touchscreen.tap(sx, sy);
      else await page.mouse.click(sx, sy);
      await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
      await dwieKlatki(page);
      if (!(await wyslijAktywny(page))) continue;
      if (o.dotyk) await page.tap('#sheet [data-miasto-karta] [data-act="wyslij"]');
      else await page.click('#sheet [data-miasto-karta] [data-act="wyslij"]');
      await page.waitForSelector('#sheet .wp');
      await dwieKlatki(page);
      return m;
    }
    throw new Error(`żadne z ${kandydaci.length} miejsc nie pozwala wysłać wyprawy`);
  };
  /** minimapa w rogu ekranu: stan, etykieta przycisku, atrybucja pod spodem, gdzie stoi, czy mieści się na ekranie i na
      które nakładki gry (pasek, cele, przyciski przybliżania, karta, pasek stawiania, komunikat o przybyszach, pasek
      atrybucji) nachodzi; liczba kolorów na płótnie (czy jest na nim rysunek) */
  const minimapa = (page: Page) =>
    page.evaluate(() => {
      const root = document.getElementById('minimapa')!;
      const btn = document.getElementById('minimapaBtn')!;
      const cv = root.querySelector<HTMLCanvasElement>('canvas')!;
      const cap = root.querySelector<HTMLElement>('.minimapa-attrib')!;
      const r = root.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      const c = cap.getBoundingClientRect();
      const widac = !root.hidden && r.width > 0 && r.height > 0;
      const zachodzi = (el: Element) => {
        const e = el as HTMLElement;
        if (e.hidden) return false;
        const q = e.getBoundingClientRect();
        return (
          q.width > 0 &&
          q.height > 0 &&
          q.left < r.right - 0.5 &&
          q.right > r.left + 0.5 &&
          q.top < r.bottom - 0.5 &&
          q.bottom > r.top + 0.5
        );
      };
      const nakladki = widac
        ? ['#top', '#goals', '.mapctl', '#card', '#placeBar', '#arrive', '.attrib']
            .filter((sel) => [...document.querySelectorAll(sel)].some(zachodzi))
            .map((sel) => sel)
        : [];
      let kolory = 0;
      if (widac && cv.width) {
        const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
        const uniq = new Set<number>();
        for (let i = 0; i < d.length; i += 4) uniq.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        kolory = uniq.size;
      }
      return {
        stan: window.zm!.minimapa().stan(),
        widac,
        prostokat: [r.left, r.top, r.right, r.bottom].map(Math.round),
        przycisk: [b.left, b.top, b.right, b.bottom].map(Math.round),
        wEkranie: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        // atrybucja stoi pod przyciskiem i w obrysie minimapy
        podpisPoza:
          widac &&
          (c.top < b.bottom - 0.5 || c.bottom > r.bottom + 0.5 || c.left < r.left - 0.5 || c.right > r.right + 0.5),
        aria: btn.getAttribute('aria-label') ?? '',
        podpis: cap.textContent ?? '',
        tekst: root.textContent ?? '',
        czcionka: Number.parseFloat(getComputedStyle(cap).fontSize),
        nakladki,
        karta: !document.getElementById('card')!.hidden,
        kolory,
      };
    });
  return [
    {
      // oddalenie: całe miasto, koło osiedla i zasięg 5 km; po drodze pauza przy otwartym oknie, Esc i klawisz M,
      // przesuwanie myszą i kółko
      name: 'miasto-mapa',
      query: '',
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=1&cam=hq,0.9`);
        await waitIdle(page);
        const przed = await page.evaluate(() => window.zm!.speed());
        if ((await page.getAttribute('#btnMiasto', 'aria-label')) !== 'Mapa miasta')
          throw new Error('brak przycisku mapy');
        await otworzMape(page);
        let o = await okno(page);
        const okolica = await page.evaluate(() => window.zm!.okolica.length);
        console.log(`  otwarta: ${JSON.stringify(o.stan)}, tempo ${o.tempo} (przed ${przed}), okolica ${okolica}`);
        if (o.tempo !== 0) throw new Error('gra nie stoi przy otwartej mapie miasta');
        if (o.stan.z !== 14 || o.stan.rysunki.z14 < 4 || o.stan.brak)
          throw new Error(`kafelki z bliska: ${JSON.stringify(o.stan)}`);
        if (o.stan.miejsca <= okolica) throw new Error('z kafelków nie doszły miejsca spoza okolicy');
        if (o.stan.znaki < 10) throw new Error(`za mało znaków miejsc: ${o.stan.znaki}`);
        zasady(o, ATRYBUCJA_PL);
        // Esc zamyka i gra wraca do tempa sprzed okna; M otwiera znowu, z kafelkami z pamięci
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        const po = await page.evaluate(() => ({
          tempo: window.zm!.speed(),
          otwarta: window.zm!.mapa()!.stan().otwarta,
        }));
        if (po.tempo !== przed || po.otwarta) throw new Error(`po Esc: ${JSON.stringify(po)}`);
        await page.keyboard.press('KeyM');
        await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
        await czekajNaMape(page);
        // przeciągnięcie przesuwa mapę o tyle metrów, ile pikseli razy skala
        const w0 = (await okno(page)).stan.widok!;
        await page.mouse.move(700, 450);
        await page.mouse.down();
        await page.mouse.move(640, 410, { steps: 6 });
        await page.mouse.move(580, 370, { steps: 6 });
        await page.mouse.up();
        await dwieKlatki(page);
        const w1 = (await okno(page)).stan.widok!;
        const dx = (w1.cx - w0.cx) / w0.mNaPiksel;
        const dy = (w1.cy - w0.cy) / w0.mNaPiksel;
        console.log(`  przeciągnięcie o (−120, −80) px: widok o (${dx.toFixed(1)}, ${dy.toFixed(1)}) px`);
        if (Math.abs(dx - 120) > 1 || Math.abs(dy - 80) > 1) throw new Error('przeciąganie nie przesuwa mapy');
        await page.mouse.wheel(0, 400);
        await dwieKlatki(page);
        const w2 = (await okno(page)).stan.widok!;
        if (!(w2.mNaPiksel > w1.mNaPiksel)) throw new Error('kółko nie oddala mapy');
        // całe miasto z daleka: tło z=12 (tu puste), zasięg 5 km, to, co doczytały kafelki z=14
        await ustawMape(page, { cx: 0, cy: 0, mNaPiksel: 12 });
        o = await okno(page);
        console.log(`  z daleka: ${JSON.stringify(o.stan)}`);
        if (o.stan.z !== 12) throw new Error('z daleka nie ma tła z poziomu 12');
        if (!o.stan.napis.includes('Przybliżcie')) throw new Error(`napis z daleka: ${o.stan.napis}`);
        // pamięć: najwyżej 24 kafelki z=14 (zdekodowany waży kilka MB; okno trzyma tylko ścieżki)
        if (o.stan.rysunki.z14 > 24) throw new Error(`za dużo kafelków z=14 w pamięci: ${o.stan.rysunki.z14}`);
        zasady(o, ATRYBUCJA_PL);
      },
    },
    {
      // z bliska: budynki i ulice z kafelków z=14, znaki miejsc i karta miejsca po kliknięciu w znak
      name: 'miasto-mapa-blisko',
      query: '',
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        await otworzMape(page);
        const m = await miejsceMapy(page, 260, 650);
        await ustawMape(page, { cx: m.x - 60, cy: m.y + 40, mNaPiksel: 1.2 });
        const [sx, sy] = await naEkranie(page, m.klucz);
        await page.mouse.click(sx, sy);
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await dwieKlatki(page);
        const o = await okno(page);
        console.log(`  miejsce ${JSON.stringify(m)}, karta: ${o.karta?.tekst}`);
        console.log(`  stan: ${JSON.stringify(o.stan)}`);
        if (o.stan.wybrane !== m.klucz) throw new Error('kliknięcie w znak nie wybrało miejsca');
        if (!o.karta) throw new Error('brak karty miejsca');
        // wysyłanie jest podpięte (zadanie 9): miejsce poza mapą osiedla za dnia ma aktywny przycisk bez dopisku
        if (o.karta.wyszarzony || o.karta.wyslij !== 'Wyślij wyprawę')
          throw new Error(`przycisk wysyłki: ${o.karta.wyslij}, wyszarzony: ${o.karta.wyszarzony}`);
        if (!/km|m stąd/.test(o.karta.tekst) || !/Tam jest (spokojnie|niepewnie|groźnie)/.test(o.karta.tekst))
          throw new Error('karta bez odległości albo ryzyka');
        if (!/Nietknięte|Ktoś tu był|Wybrane do cna/.test(o.karta.tekst)) throw new Error('karta bez stanu miejsca');
        zasady(o, ATRYBUCJA_PL);
        // klik obok znaku zamyka kartę, a klik znowu w znak ją otwiera
        await page.mouse.click(sx - 150, sy + 120);
        await page.waitForSelector('#sheet [data-miasto-karta][hidden]', { state: 'attached' });
        await page.mouse.click(sx, sy);
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await dwieKlatki(page);
      },
    },
    {
      // telefon: dotyk, karta miejsca na dole, bez przewijania w bok; kafelki poza tests/fixtures zerwane (bez sieci),
      // więc mapa rysuje to, co ma, z napisem, że reszta się nie wczytała. Bez tabel mieszkańców (404) filtr nazw nie
      // zna imion, więc także miejsca z kafelków mają same kategorie (RODO: nazwa jednoosobowej firmy to osoba)
      name: 'miasto-mapa-telefon',
      query: '',
      w: 390,
      h: 844,
      allow: /ERR_INTERNET_DISCONNECTED|Failed to load resource|status of 404/,
      allowUrl: /tiles\.openfreemap\.org|\/data\/mieszkancy\//,
      run: async (page, base) => {
        await kafelkiMapy(page, true);
        await bezTabel(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        await otworzMape(page, true);
        let o = await okno(page);
        console.log(`  telefon: ${JSON.stringify(o.stan)}`);
        const nazwy = await page.evaluate(() => {
          const l = window.zm!.mapa()!.miejscaMapy();
          return { razem: l.length, zNazwa: l.filter((m) => m.nazwa).map((m) => m.nazwa) };
        });
        if (nazwy.razem <= 190 || nazwy.zNazwa.length)
          throw new Error(`bez tabel miejsca z kafelków z nazwą: ${JSON.stringify(nazwy)}`);
        if (!o.stan.brak || !o.stan.napis.includes('Reszta miasta się nie wczytała'))
          throw new Error(`bez sieci brak napisu o reszcie miasta: ${JSON.stringify(o.stan)}`);
        if (o.stan.rysunki.z14 < 4) throw new Error('kafelki z tests/fixtures się nie narysowały');
        const m = await miejsceMapy(page, 230, 520);
        const [sx, sy] = await naEkranie(page, m.klucz);
        await page.touchscreen.tap(sx, sy);
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await dwieKlatki(page);
        o = await okno(page);
        console.log(`  miejsce ${JSON.stringify(m)}, karta ${JSON.stringify(o.karta?.prostokat)} na ${o.ekran}`);
        if (o.stan.wybrane !== m.klucz) throw new Error('stuknięcie w znak nie wybrało miejsca');
        const [l, t, r, b] = o.karta!.prostokat;
        if (l < 0 || t < 0 || r > o.ekran[0] || b > o.ekran[1]) throw new Error('karta miejsca wychodzi za ekran');
        zasady(o, ATRYBUCJA_PL);
      },
    },
    {
      // po angielsku: okno, karta miejsca i atrybucja bez polskich słów (poza nazwą miejsca z mapy)
      name: 'en-miasto-mapa',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        if ((await page.getAttribute('#btnMiasto', 'aria-label')) !== 'City map')
          throw new Error('przycisk mapy po angielsku');
        await otworzMape(page);
        const m = await miejsceMapy(page, 300, 700);
        const [sx, sy] = await naEkranie(page, m.klucz);
        await page.mouse.click(sx, sy);
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await dwieKlatki(page);
        const o = await okno(page);
        console.log(`  karta: ${o.karta?.tekst}`);
        if (o.karta?.wyslij !== 'Send a supply run') throw new Error(`przycisk wysyłki: ${o.karta?.wyslij}`);
        if (o.karta.wyszarzony && !/Picked clean|Too far|after dark/i.test(o.karta.tekst))
          throw new Error(`przycisk wyszarzony bez powodu na karcie: ${o.karta.tekst}`);
        const pl = polskieLitery(o.tekst, [m.nazwa]);
        if (pl.length) throw new Error(`polskie słowa w oknie po angielsku: ${pl.join(' ')}`);
        zasady(o, ATRYBUCJA_EN);
      },
    },
    {
      // wysyłanie z mapy (komputer): karta miejsca → „Wyślij wyprawę” → okno planu. Zaznaczeni w grze są wybrani od
      // razu, kliknięcie osoby zmienia podsumowanie, bez wybranych „Wyślij” jest wyszarzony, „Wróć do mapy” wraca
      // do tego samego widoku i karty, a Esc zamyka okno i oddaje grze tempo
      name: 'miasto-wysylanie',
      query: '',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { zaznacz: 2, speed: 2 });
        const widokPrzed = await page.evaluate(() => window.zm!.mapa()!.stan().widok);
        let p = await plan(page);
        console.log(`  miejsce ${JSON.stringify(m)}`);
        console.log(
          `  plan: ${p.tytul}; osoby ${JSON.stringify(p.osoby.map((x) => [x.tekst, x.wybrana, x.wyszarzona]))}`,
        );
        console.log(`  podsumowanie: ${JSON.stringify(p.podsumowanie)}, powód: ${p.powod}, tempo ${p.tempo}`);
        if (!p.klasa.includes('wyprawa')) throw new Error(`odcień okna: ${p.klasa}`);
        if (p.tempo !== 0) throw new Error('gra nie stoi przy oknie planu');
        if (p.osoby.length < 3) throw new Error(`za mało osób na liście: ${p.osoby.length}`);
        const wybrane = () => p.osoby.filter((x) => x.wybrana).length;
        if (wybrane() !== 2) throw new Error(`zaznaczeni w grze nie są wybrani od razu: ${wybrane()} z 2`);
        if (!p.wyslij || p.wyslij.wyszarzony || p.wyslij.tekst !== 'Wyślij wyprawę')
          throw new Error(`przycisk wysyłki: ${JSON.stringify(p.wyslij)}`);
        const klucze = p.podsumowanie.map((r) => r[0]);
        for (const k of ['Wyjście', 'Powrót', 'Czas poza osiedlem', 'Ryzyko', 'Udźwig', 'Zostało w miejscu'])
          if (!klucze.includes(k)) throw new Error(`podsumowanie bez wiersza „${k}”: ${klucze.join(', ')}`);
        if (p.bok) throw new Error('okno planu przewija się w bok');
        // trzecia osoba: udźwig rośnie o 6, powrót jest nie później
        const trzecia = p.osoby.find((x) => !x.wybrana && !x.wyszarzona);
        if (!trzecia) throw new Error('nie ma kogo dobrać');
        const udzwig = () => Number(p.podsumowanie.find((r) => r[0] === 'Udźwig')![1].match(/\d+/)![0]);
        const przed = udzwig();
        await page.click(`#sheet [data-act="wp-osoba"][data-arg="${trzecia.id}"]`);
        p = await plan(page);
        console.log(`  z trzecią osobą: ${JSON.stringify(p.podsumowanie)}`);
        if (wybrane() !== 3 || udzwig() !== przed + 6)
          throw new Error(`dobranie osoby: ${wybrane()} wybranych, udźwig ${udzwig()}`);
        // bez nikogo „Wyślij” jest wyszarzony i okno mówi, czego brakuje
        for (const x of p.osoby.filter((x) => x.wybrana))
          await page.click(`#sheet [data-act="wp-osoba"][data-arg="${x.id}"]`);
        p = await plan(page);
        if (wybrane() !== 0 || !p.wyslij?.wyszarzony || p.podsumowanie.length || !p.powod.includes('Wybierz kogoś'))
          throw new Error(`bez wybranych: ${JSON.stringify([wybrane(), p.wyslij, p.podsumowanie, p.powod])}`);
        // „Wróć do mapy”: ten sam widok i karta tego samego miejsca, a stąd znowu do planu
        await page.click('#sheet [data-act="wp-wroc"]');
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await czekajNaMape(page);
        const mapa = await okno(page);
        if (mapa.stan.wybrane !== m.klucz) throw new Error(`po powrocie do mapy wybrane: ${mapa.stan.wybrane}`);
        if (JSON.stringify(mapa.stan.widok) !== JSON.stringify(widokPrzed)) throw new Error('widok mapy się zmienił');
        if (mapa.tempo !== 0) throw new Error('gra ruszyła po powrocie do mapy');
        await page.click('#sheet [data-miasto-karta] [data-act="wyslij"]');
        await page.waitForSelector('#sheet .wp');
        // Esc zamyka okno i oddaje grze tempo sprzed mapy (2 = 3×)
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        const po = await page.evaluate(() => ({
          tempo: window.zm!.speed(),
          wyprawy: window.zm!.gov!.wyprawy?.length ?? 0,
        }));
        if (po.tempo !== 2 || po.wyprawy) throw new Error(`po Esc: ${JSON.stringify(po)}`);
        await page.keyboard.press('KeyM');
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await czekajNaMape(page);
        // miejsce z mapy osiedla (koło 192 m) nie jest celem: przycisk wyszarzony z powodem, a wołanie wysyłki wprost
        // niczego nie otwiera
        const lokalne = await page.evaluate(() => {
          const l = window
            .zm!.mapa()!
            .miejscaMapy()
            .filter((q) => q.odl < 150);
          return l[0] ? { klucz: l[0].klucz, x: l[0].x, y: l[0].y } : null;
        });
        if (!lokalne) throw new Error('brak miejsca na mapie osiedla');
        await ustawMape(page, { cx: lokalne.x - 30, cy: lokalne.y + 20, mNaPiksel: 0.7 });
        const [lx, ly] = await naEkranie(page, lokalne.klucz);
        await page.mouse.click(lx, ly);
        await page.waitForFunction((k) => window.zm!.mapa()!.stan().wybrane === k, lokalne.klucz);
        await dwieKlatki(page);
        const osiedle = await okno(page);
        console.log(
          `  miejsce z mapy osiedla: ${osiedle.karta?.tekst.slice(-120)}, wyszarzony ${osiedle.karta?.wyszarzony}`,
        );
        if (!osiedle.karta?.wyszarzony || !/mapie osiedla/.test(osiedle.karta.tekst))
          throw new Error('miejsce z mapy osiedla ma aktywne „Wyślij”');
        await page.evaluate((k) => window.zm!.mapa()!.obsluz('wyslij', k), lokalne.klucz);
        await dwieKlatki(page);
        if (await page.locator('#sheet .wp').count()) throw new Error('wysyłka z mapy osiedla otworzyła okno planu');
        // do zrzutu: mapa, karta tamtego miejsca, plan z trzema osobami
        await ustawMape(page, { cx: m.x - 60, cy: m.y + 40, mNaPiksel: 1.2 });
        const [sx, sy] = await naEkranie(page, m.klucz);
        await page.mouse.click(sx, sy);
        await page.waitForFunction((k) => window.zm!.mapa()!.stan().wybrane === k, m.klucz);
        await page.click('#sheet [data-miasto-karta] [data-act="wyslij"]');
        await page.waitForSelector('#sheet .wp');
        for (const x of p.osoby.slice(0, 3)) {
          const stan = (await plan(page)).osoby.find((y) => y.id === x.id)!;
          if (!stan.wybrana && !stan.wyszarzona) await page.click(`#sheet [data-act="wp-osoba"][data-arg="${x.id}"]`);
        }
        await dwieKlatki(page);
        p = await plan(page);
        if (p.bok) throw new Error('okno planu przewija się w bok');
        console.log(`  do zrzutu: ${wybrane()} wybranych, ${JSON.stringify(p.podsumowanie)}`);
      },
    },
    {
      // wysyłanie z mapy (telefon 390×844): dotyk, plan bez przewijania w bok, stopka z przyciskami na ekranie
      name: 'miasto-wysylanie-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        const m = await doPlanu(page, base, { dotyk: true });
        let p = await plan(page);
        console.log(`  miejsce ${JSON.stringify(m)}, plan: ${p.tytul}, osoby ${p.osoby.length}, ekran ${p.ekran}`);
        console.log(`  osoby: ${JSON.stringify(p.osoby.map((x) => [x.tekst, x.wybrana, x.wyszarzona]))}`);
        console.log(`  podsumowanie: ${JSON.stringify(p.podsumowanie)}, stopka ${p.stopka}`);
        if (p.bok) throw new Error('okno planu przewija się w bok na telefonie');
        const [l, t, r, b] = p.stopka!;
        if (l < 0 || t < 0 || r > p.ekran[0] || b > p.ekran[1]) throw new Error('stopka planu wychodzi za ekran');
        // stuknięcie osoby wybiera ją, ponowne cofa wybór
        const kto = p.osoby.find((x) => !x.wyszarzona)!;
        await page.tap(`#sheet [data-act="wp-osoba"][data-arg="${kto.id}"]`);
        const po = (await plan(page)).osoby.find((x) => x.id === kto.id)!;
        if (po.wybrana === kto.wybrana) throw new Error('stuknięcie osoby nie zmieniło wyboru');
        if (!kto.wybrana) {
          // dla zrzutu zostaje wybrana
        } else await page.tap(`#sheet [data-act="wp-osoba"][data-arg="${kto.id}"]`);
        await dwieKlatki(page);
        p = await plan(page);
        if (!p.osoby.some((x) => x.wybrana) || p.wyslij?.wyszarzony)
          throw new Error('na zrzucie nikt nie jest wybrany');
      },
    },
    {
      // wyprawa do końca: wysłanie, osoby wychodzą bramą, podpowiedź i wpis w kronice, przewinięcie do powrotu
      // (zm.ff), rozliczenie łupu: zapasy, st.miasto.zabrano i wizyty, wyprawy znikają ze stanu
      name: 'miasto-powrot',
      query: '',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { zaznacz: 2, speed: 1 });
        const zapasy = () =>
          page.evaluate(async () => {
            const load = (path: string) => import(/* @vite-ignore */ path);
            const { snapshot } = (await load('/src/sim/snapshot.ts')) as typeof import('../src/sim/snapshot.ts');
            const zm = window.zm!;
            const k = snapshot(zm.sim!.st, zm.sim!.w).stock;
            return { drewno: k.wood, jedzenie: k.supplies, zlom: k.scrap, czesci: k.parts, leki: k.meds ?? 0 };
          });
        const przed = await zapasy();
        const p = await plan(page);
        const wybrani = p.osoby.filter((x) => x.wybrana).map((x) => x.id);
        console.log(`  wybrani: ${wybrani.join(', ')}, podsumowanie ${JSON.stringify(p.podsumowanie)}`);
        if (wybrani.length !== 2) throw new Error(`wybranych ${wybrani.length} zamiast 2`);
        const logPrzed = await page.evaluate(() => window.zm!.gov!.log.length);
        await page.click('#sheet [data-act="wyslij"]');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        // podpowiedź (ostatni wpis kroniki) pokazuje pasek przy najbliższym odświeżeniu, nie od razu
        await page.waitForFunction(
          () => document.getElementById('hint')?.textContent?.includes('Wyprawa do miejsca'),
          null,
          { timeout: 3000 },
        );
        const wys = await page.evaluate(() => {
          const zm = window.zm!;
          const g = zm.gov!;
          return {
            tempo: zm.speed(),
            wyprawy: JSON.parse(JSON.stringify(g.wyprawy ?? [])),
            log: g.log.slice(-3).map((l) => l.txt),
            wLogu: g.log.length,
            hint: document.getElementById('hint')!.textContent,
            minuta: (g.log.at(-1)?.day ?? 1) * 1440,
          };
        });
        console.log(`  po wysłaniu: ${JSON.stringify({ ...wys, log: wys.log.map((t) => (t as { pl: string }).pl) })}`);
        if (wys.tempo !== 1) throw new Error(`tempo po wysłaniu: ${wys.tempo} zamiast 1`);
        if (wys.wyprawy.length !== 1) throw new Error(`wypraw w drodze: ${wys.wyprawy.length}`);
        const w = wys.wyprawy[0];
        if (w.cel.klucz !== m.klucz || JSON.stringify(w.ids) !== JSON.stringify(wybrani))
          throw new Error(`wyprawa: ${JSON.stringify(w)}`);
        if (wys.wLogu !== logPrzed + 1) throw new Error(`wpisów w kronice: ${wys.wLogu - logPrzed} zamiast 1`);
        if (!wys.hint?.includes('Wyprawa do miejsca')) throw new Error(`podpowiedź: ${wys.hint}`);
        // osoby wychodzą bramą (flaga away na pionkach), jedna po drugiej; gra przewijana zm.ff
        let poza = 0;
        for (let k = 0; k < 8 && poza < 2; k++) {
          const okno = await page.evaluate(() => window.zm!.ff(5));
          if (okno === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
          else if (okno) throw new Error(`po drodze okno decyzji: ${okno}`);
          poza = await page.evaluate(() => window.zm!.sim!.st.pawns.filter((q) => q.kind === 'core' && q.away).length);
        }
        console.log(`  po wyjściu: poza mapą ${poza}`);
        if (poza !== 2) throw new Error(`poza mapą po wyjściu: ${poza} zamiast 2`);
        // przewijanie do powrotu: po kawałku, bez okien decyzji po drodze
        for (let k = 0; k < 24; k++) {
          const wToku = await page.evaluate(() => window.zm!.gov!.wyprawy?.length ?? 0);
          if (!wToku) break;
          const okno = await page.evaluate(() => window.zm!.ff(30));
          if (okno === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
          else if (okno) throw new Error(`po drodze okno decyzji: ${okno}`);
        }
        const po = await page.evaluate(() => {
          const zm = window.zm!;
          const g = zm.gov!;
          return {
            wyprawy: g.wyprawy?.length ?? 0,
            miasto: g.miasto
              ? { zabrano: g.miasto.zabrano, wizyty: g.miasto.wizyty, ostatnia: g.miasto.ostatnia }
              : null,
            log: g.log.slice(-4).map((l) => `${l.clock} ${(l.txt as { pl: string }).pl}`),
            hint: document.getElementById('hint')!.textContent,
            poza: zm.sim!.st.pawns.filter((q) => q.kind === 'core' && q.away).length,
          };
        });
        const zapasyPo = await zapasy();
        console.log(`  po powrocie: ${JSON.stringify(po)}`);
        console.log(`  zapasy: ${JSON.stringify(przed)} -> ${JSON.stringify(zapasyPo)}`);
        if (po.wyprawy) throw new Error('wyprawa dalej w drodze');
        if (po.miasto?.wizyty[m.klucz] !== 1) throw new Error(`wizyt w miejscu: ${po.miasto?.wizyty[m.klucz]}`);
        const zabrano = po.miasto?.zabrano[m.klucz] ?? 0;
        const przybylo = (Object.keys(zapasyPo) as (keyof typeof zapasyPo)[]).reduce(
          (a, k) => a + Math.max(0, zapasyPo[k] - przed[k]),
          0,
        );
        if (zabrano > 0 && przybylo <= 0) throw new Error(`zabrano ${zabrano}, a zapasy się nie zmieniły`);
        if (!po.log.some((t) => /wróci|trafili|trafił|trafiła|trafiły/.test(t)))
          throw new Error('brak wpisu o powrocie');
      },
    },
    {
      // po angielsku: plan wyprawy bez polskich słów (poza imionami i nazwą miejsca), przycisk i podsumowanie
      name: 'en-miasto-wysylanie',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { zaznacz: 2 });
        const p = await plan(page);
        console.log(`  plan: ${p.tytul}`);
        console.log(`  podsumowanie: ${JSON.stringify(p.podsumowanie)}`);
        const imiona = await page.evaluate(() => window.zm!.sim!.st.people.flatMap((q) => [q.name, q.first]));
        const pl = polskieLitery(p.tekst, [m.nazwa, ...imiona]);
        if (pl.length) throw new Error(`polskie słowa w oknie planu po angielsku: ${pl.join(' ')}`);
        if (p.wyslij?.tekst !== 'Send the supply run' || p.wyslij.wyszarzony)
          throw new Error(`przycisk wysyłki: ${JSON.stringify(p.wyslij)}`);
        if (p.wroc !== 'Back to the map') throw new Error(`przycisk powrotu: ${p.wroc}`);
        const klucze = p.podsumowanie.map((r) => r[0]);
        for (const k of ['Leaving', 'Back', 'Time away', 'Risk', 'Can carry', 'Left there'])
          if (!klucze.includes(k)) throw new Error(`podsumowanie bez wiersza „${k}”: ${klucze.join(', ')}`);
        if (p.bok) throw new Error('okno planu przewija się w bok');
        // zmiana języka przy otwartym planie: to samo okno po polsku z tym samym wyborem osób, i z powrotem
        const zmien = (l: 'en' | 'pl') =>
          page.evaluate(async (l) => {
            const load = (path: string) => import(/* @vite-ignore */ path);
            ((await load('/src/core/jezyk.ts')) as typeof import('../src/core/jezyk.ts')).ustawJezyk(l);
          }, l);
        await zmien('pl');
        await page.waitForFunction(
          () => document.querySelector('#sheet [data-act="wp-wroc"]')?.textContent === 'Wróć do mapy',
        );
        const pol = await plan(page);
        if (JSON.stringify(pol.osoby.map((x) => x.wybrana)) !== JSON.stringify(p.osoby.map((x) => x.wybrana)))
          throw new Error('zmiana języka zmieniła wybór osób');
        if (pol.wyslij?.tekst !== 'Wyślij wyprawę') throw new Error(`po polsku: ${pol.wyslij?.tekst}`);
        await zmien('en');
        await page.waitForFunction(
          () => document.querySelector('#sheet [data-act="wp-wroc"]')?.textContent === 'Back to the map',
        );
        await dwieKlatki(page);
      },
    },
    {
      // minimapa w rogu ekranu (src/ui/minimapa.ts): kwadrat z kropkami kategorii nad paskiem atrybucji, z atrybucją
      // map pod spodem, bez nazw; nie zasłania paska, celów, kart, przycisków przybliżania ani paska atrybucji (kilka
      // rozmiarów okna, schowana poniżej 640 px szerokości i 560 px wysokości); rysowana tylko przy zmianie; klik,
      // Enter i spacja otwierają okno mapy miasta
      name: 'miasto-minimapa',
      query: '',
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=1&godzina=8&cam=hq,1.3`);
        await waitIdle(page);
        await page.waitForFunction(() => window.zm!.minimapa().stan().rysunki >= 1, null, { timeout: 5000 });
        const o = await minimapa(page);
        console.log(`  stan: ${JSON.stringify(o.stan)}, przycisk ${JSON.stringify(o.przycisk)}, podpis „${o.podpis}”`);
        if (!o.stan.wlaczona || !o.stan.widoczna)
          throw new Error(`minimapa nie stoi na ekranie: ${JSON.stringify(o.stan)}`);
        if (o.stan.ikony < 50) throw new Error(`za mało kropek miejsc: ${o.stan.ikony}`);
        if (o.stan.wyprawy) throw new Error(`znaczniki wypraw bez wypraw: ${o.stan.wyprawy}`);
        if (o.aria !== 'Minimapa: otwórz mapę miasta') throw new Error(`etykieta przycisku: ${o.aria}`);
        if (o.tekst.trim() !== o.podpis.trim())
          throw new Error(`na minimapie jest coś poza atrybucją (nazwy?): ${o.tekst}`);
        for (const z of ['współtwórcy OpenStreetMap', 'OpenFreeMap', 'OpenMapTiles'])
          if (!o.podpis.includes(z)) throw new Error(`atrybucja pod minimapą bez „${z}”: ${o.podpis}`);
        if (o.czcionka < 11) throw new Error(`atrybucja pod minimapą za mała: ${o.czcionka} px`);
        if (o.kolory < 6) throw new Error(`na minimapie ${o.kolory} kolorów: nie wygląda na rysunek miejsc`);
        // rysowana tylko przy zmianie: gra chodzi w tempie 1×, a przez półtorej sekundy nic się nie zmienia
        const r0 = (await minimapa(page)).stan.rysunki;
        await page.waitForTimeout(1600);
        const r1 = (await minimapa(page)).stan.rysunki;
        console.log(`  rysunków: ${r0} → ${r1} po 1,6 s gry bez zmian`);
        if (r1 !== r0) throw new Error(`minimapa rysowana bez zmian: ${r0} → ${r1}`);
        // ułożenie przy kilku rozmiarach okna (komputer, mniejszy ekran, granice 640 i 560, telefon poziomo)
        for (const [w, h, stoi] of [
          [1024, 700, true],
          [700, 900, true],
          [641, 900, true],
          [640, 900, false],
          [1024, 560, true],
          [1024, 559, false],
          [844, 390, false],
          [1440, 900, true],
        ] as const) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(700);
          const u = await minimapa(page);
          console.log(
            `  ${w}×${h}: ${u.widac ? `w ${JSON.stringify(u.prostokat)}` : 'schowana'}, nakłada się na: ${u.nakladki.join(', ') || 'nic'}`,
          );
          if (u.widac !== stoi)
            throw new Error(`${w}×${h}: minimapa ${u.widac ? 'jest' : 'schowana'}, a ma ${stoi ? 'być' : 'zniknąć'}`);
          if (u.widac && !u.wEkranie)
            throw new Error(`${w}×${h}: minimapa wychodzi za ekran ${JSON.stringify(u.prostokat)}`);
          if (u.nakladki.length) throw new Error(`${w}×${h}: minimapa zasłania: ${u.nakladki.join(', ')}`);
          if (u.widac && u.podpisPoza)
            throw new Error(`${w}×${h}: atrybucja pod minimapą wychodzi poza minimapę albo na pasek atrybucji`);
          if (!u.widac && (await page.isVisible('#btnMiasto')) !== true)
            throw new Error(`${w}×${h}: przycisk mapy zniknął razem z minimapą`);
        }
        // karta osoby (lewy dolny róg) i zaznaczeni: minimapa jej nie zasłania
        await zaznacz(page, 2);
        const z = await minimapa(page);
        if (!z.karta) throw new Error('po zaznaczeniu osób nie ma karty');
        if (z.nakladki.length) throw new Error(`minimapa zasłania: ${z.nakladki.join(', ')}`);
        // klik otwiera okno mapy (gra staje), Esc zamyka i oddaje tempo
        const tempo = await page.evaluate(() => window.zm!.speed());
        await page.click('#minimapaBtn');
        await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
        await czekajNaMape(page);
        let k = await okno(page);
        console.log(`  po kliknięciu: ${JSON.stringify({ otwarta: k.stan.otwarta, tempo: k.tempo })}`);
        if (k.tempo !== 0) throw new Error('klik w minimapę nie zatrzymał gry');
        if (!/Mapa miasta/.test(k.tekst)) throw new Error('klik w minimapę nie otworzył okna mapy miasta');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        if ((await page.evaluate(() => window.zm!.speed())) !== tempo)
          throw new Error('po Esc gra nie wróciła do tempa');
        // po kliknięciu myszą przycisk nie trzyma fokusu: spacja zatrzymuje grę, zamiast otwierać okno drugi raz
        if ((await page.evaluate(() => document.activeElement?.id)) === 'minimapaBtn')
          throw new Error('po kliknięciu minimapa trzyma fokus');
        await page.keyboard.press('Space');
        if (
          (await page.evaluate(() => window.zm!.speed())) !== 0 ||
          (await page.evaluate(() => window.zm!.mapa()!.stan().otwarta))
        )
          throw new Error('spacja po kliknięciu w minimapę nie zatrzymała gry (otworzyła okno?)');
        await page.keyboard.press('Space');
        if ((await page.evaluate(() => window.zm!.speed())) !== tempo) throw new Error('druga spacja nie wznowiła gry');
        // z klawiatury: przycisk bierze fokus, Enter i spacja otwierają okno (nie zmieniają tempa gry spacją)
        for (const klawisz of ['Enter', 'Space']) {
          await page.focus('#minimapaBtn');
          await page.keyboard.press(klawisz);
          await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta, null, { timeout: 3000 });
          k = await okno(page);
          if (k.tempo !== 0 || !/Mapa miasta/.test(k.tekst))
            throw new Error(`${klawisz} na minimapie nie otworzył okna mapy`);
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.getElementById('modal')!.hidden);
          if ((await page.evaluate(() => window.zm!.speed())) !== tempo)
            throw new Error(`po ${klawisz} i Esc tempo gry się zmieniło`);
        }
        // tryb stawiania: panel budowy zostaje otwarty z prawej, więc minimapy nie ma (na niższym oknie przykrywał ją
        // i spod krawędzi wystawał podpis); klik w jej róg to próba postawienia budowli: okno mapy się nie otwiera,
        // a stawianie trwa
        const { BUILDS } = await import('../src/sim/budowle.ts');
        await stockUp(page, BUILDS.warsztat.cost);
        const rog = (await page.locator('#minimapaBtn').boundingBox())!;
        await chooseBuild(page, 'warsztat');
        if (!(await page.evaluate(() => window.zm!.placing()))) throw new Error('nie ma trybu stawiania');
        for (const [w, h] of [
          [1024, 700],
          [1440, 900],
        ] as const) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(500);
          if (await page.isVisible('#minimapaBtn'))
            throw new Error(`${w}×${h}: minimapa stoi przy otwartym panelu budowy`);
        }
        await page.screenshot({ path: path.join(OUT, 'miasto-minimapa-stawianie.png') });
        await page.mouse.click(rog.x + rog.width / 2, rog.y + rog.height / 2);
        await page.waitForTimeout(300);
        const stawianie = await page.evaluate(() => ({
          placing: !!window.zm!.placing(),
          otwarta: window.zm!.mapa()!.stan().otwarta,
        }));
        if (!stawianie.placing || stawianie.otwarta)
          throw new Error(`klik w minimapę w trybie stawiania: ${JSON.stringify(stawianie)}`);
        await page.keyboard.press('Escape');
        if (await page.evaluate(() => window.zm!.placing())) throw new Error('Esc nie anulował stawiania');
        // po zamknięciu panelu budowy minimapa wraca na swoje miejsce
        if (await page.evaluate(() => window.zm!.buildPanel().open))
          await page.click('#buildPanel [data-act="build-close"]');
        await page.waitForSelector('#minimapaBtn', { state: 'visible', timeout: 3000 });
        // po angielsku: etykieta przycisku i atrybucja pod minimapą
        await page.evaluate(async () => {
          const load = (path: string) => import(/* @vite-ignore */ path);
          ((await load('/src/core/jezyk.ts')) as typeof import('../src/core/jezyk.ts')).ustawJezyk('en');
        });
        const en = await minimapa(page);
        if (en.aria !== 'Minimap: open the city map' || !en.podpis.includes('OpenStreetMap contributors'))
          throw new Error(`po angielsku: ${en.aria} | ${en.podpis}`);
        const pl = polskieLitery(`${en.aria} ${en.podpis}`, []);
        if (pl.length) throw new Error(`polskie słowa w minimapie po angielsku: ${pl.join(' ')}`);
        await page.evaluate(async () => {
          const load = (path: string) => import(/* @vite-ignore */ path);
          ((await load('/src/core/jezyk.ts')) as typeof import('../src/core/jezyk.ts')).ustawJezyk('pl');
        });
        await page.waitForTimeout(300);
      },
    },
    {
      // znacznik wyprawy na minimapie: po wysłaniu wyprawy z mapy w miejscu celu stoi pierścień w kolorze lampy, a po
      // powrocie znika (zrzut w drodze: miasto-minimapa-w-drodze, końcowy: po powrocie)
      name: 'miasto-minimapa-wyprawa',
      query: '',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { zaznacz: 2, speed: 1 });
        await page.waitForFunction(() => window.zm!.minimapa().stan().rysunki >= 1, null, { timeout: 5000 });
        const przed = await minimapa(page);
        if (przed.stan.wyprawy) throw new Error('znacznik wyprawy przed wysłaniem');
        await page.click('#sheet [data-act="wyslij"]');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        // minimapa sprawdza stan co 500 ms, więc znacznik pojawia się najpóźniej po pół sekundy
        await page.waitForFunction(() => window.zm!.minimapa().stan().wyprawy === 1, null, { timeout: 3000 });
        const po = await minimapa(page);
        // gdzie ma stać: Cel.x i Cel.y z gov.wyprawy[0], w skali minimapy (punktyMinimapy)
        const gdzie = await page.evaluate(async () => {
          const load = (path: string) => import(/* @vite-ignore */ path);
          const { punktyMinimapy, ZASIEG_MINIMAPY_M } = (await load(
            '/src/ui/minimapa.ts',
          )) as typeof import('../src/ui/minimapa.ts');
          const zm = window.zm!;
          const cel = zm.gov!.wyprawy![0].cel;
          const bok = Math.round(document.querySelector<HTMLCanvasElement>('#minimapa canvas')!.clientWidth);
          return {
            cel: { klucz: cel.klucz, x: cel.x, y: cel.y, kat: cel.kat },
            ...punktyMinimapy([], [cel], bok, ZASIEG_MINIMAPY_M).wyprawy[0],
            bok,
          };
        });
        console.log(`  w drodze: ${JSON.stringify(po.stan)}, cel ${JSON.stringify(gdzie)}`);
        if (gdzie.cel.kat === null) throw new Error('cel wyprawy bez położenia (TARGETS)');
        if (gdzie.cel.klucz !== m.klucz || gdzie.cel.x !== m.x || gdzie.cel.y !== m.y)
          throw new Error(
            `znacznik nie w miejscu wybranego celu: ${JSON.stringify(gdzie.cel)} zamiast ${JSON.stringify(m)}`,
          );
        const lampa = await page.evaluate(
          ([px, py]) => {
            const cv = document.querySelector<HTMLCanvasElement>('#minimapa canvas')!;
            const dpr = cv.width / cv.clientWidth;
            const R = 8;
            const x0 = Math.max(0, Math.floor((px - R) * dpr));
            const y0 = Math.max(0, Math.floor((py - R) * dpr));
            const d = cv.getContext('2d')!.getImageData(x0, y0, Math.floor(2 * R * dpr), Math.floor(2 * R * dpr)).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4)
              if (d[i] > 200 && d[i + 1] > 140 && d[i + 1] < 200 && d[i + 2] < 110) n++;
            return n;
          },
          [gdzie.px, gdzie.py],
        );
        console.log(`  pikseli w kolorze lampy przy celu: ${lampa}`);
        if (lampa < 15) throw new Error(`przy celu wyprawy nie ma znacznika w kolorze lampy (${lampa} pikseli)`);
        await page.screenshot({ path: path.join(OUT, 'miasto-minimapa-w-drodze.png') });
        // przewinięcie do powrotu: wyprawa znika ze stanu, a znacznik z minimapy (po najbliższym odświeżeniu)
        for (let n = 0; n < 40; n++) {
          if (!(await page.evaluate(() => window.zm!.gov!.wyprawy?.length ?? 0))) break;
          const okno = await page.evaluate(() => window.zm!.ff(30));
          if (okno === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
          else if (okno) throw new Error(`po drodze okno decyzji: ${okno}`);
        }
        await page.waitForFunction(() => window.zm!.minimapa().stan().wyprawy === 0, null, { timeout: 3000 });
        console.log(`  po powrocie: ${JSON.stringify((await minimapa(page)).stan)}`);
      },
    },
    {
      // telefon: minimapy nie ma na ekranie (poniżej 640 px szerokości), nic się nie rysuje, a przycisk „Mapa” w pasku
      // otwiera okno mapy miasta
      name: 'miasto-minimapa-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        await page.waitForTimeout(1200);
        const o = await minimapa(page);
        console.log(`  stan: ${JSON.stringify(o.stan)}, minimapa widoczna: ${await page.isVisible('#minimapa')}`);
        if (!o.stan.wlaczona) throw new Error('minimapa wyłączona na telefonie (ma być tylko schowana stylem)');
        if (o.stan.widoczna || (await page.isVisible('#minimapa'))) throw new Error('minimapa widać na telefonie');
        if (o.stan.rysunki) throw new Error(`schowana minimapa się rysuje: ${o.stan.rysunki} razy`);
        const b = await page.locator('#btnMiasto').boundingBox();
        if (!b || !(await page.isVisible('#btnMiasto'))) throw new Error('przycisk „Mapa” niewidoczny na telefonie');
        console.log(`  przycisk „Mapa”: ${await page.textContent('#btnMiasto')}, ${JSON.stringify(b)}`);
        if (b.x < 0 || b.y < 0 || b.x + b.width > 390 || b.y + b.height > 844)
          throw new Error('przycisk „Mapa” wychodzi za ekran');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
          throw new Error('strona przewija się w bok');
        await otworzMape(page, true);
        const k = await okno(page);
        if (k.tempo !== 0 || !/Mapa miasta/.test(k.tekst))
          throw new Error('przycisk „Mapa” nie otworzył okna mapy miasta');
        await page.tap('#sheet [data-act="miasto-zamknij"]');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
      },
    },
    {
      // telefon po angielsku: okno mapy i karta miejsca bez polskich słów (poza nazwą miejsca), karta na ekranie;
      // kafelki poza tests/fixtures zerwane i bez tabel mieszkańców, jak w miasto-mapa-telefon
      name: 'en-miasto-mapa-telefon',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      allow: /ERR_INTERNET_DISCONNECTED|Failed to load resource|status of 404/,
      allowUrl: /tiles\.openfreemap\.org|\/data\/mieszkancy\//,
      run: async (page, base) => {
        await kafelkiMapy(page, true);
        await bezTabel(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        if ((await page.getAttribute('#btnMiasto', 'aria-label')) !== 'City map')
          throw new Error('przycisk mapy po angielsku');
        await otworzMape(page, true);
        const m = await miejsceMapy(page, 230, 520);
        const [sx, sy] = await naEkranie(page, m.klucz);
        await page.touchscreen.tap(sx, sy);
        await page.waitForSelector('#sheet [data-miasto-karta]:not([hidden])');
        await dwieKlatki(page);
        const o = await okno(page);
        console.log(`  telefon po angielsku, karta: ${o.karta?.tekst}`);
        if (o.stan.wybrane !== m.klucz) throw new Error('stuknięcie w znak nie wybrało miejsca');
        if (!o.stan.napis.includes('The rest of the city didn’t load'))
          throw new Error(`napis o reszcie miasta: ${o.stan.napis}`);
        if (o.karta?.wyslij !== 'Send a supply run') throw new Error(`przycisk wysyłki: ${o.karta?.wyslij}`);
        const pl = polskieLitery(o.tekst, [m.nazwa]);
        if (pl.length) throw new Error(`polskie słowa w oknie po angielsku: ${pl.join(' ')}`);
        const [l, t, r, b] = o.karta!.prostokat;
        if (l < 0 || t < 0 || r > o.ekran[0] || b > o.ekran[1]) throw new Error('karta miejsca wychodzi za ekran');
        zasady(o, ATRYBUCJA_EN);
      },
    },
    {
      // minimapa po angielsku (komputer): przycisk, dymek i atrybucja bez polskich słów; klik otwiera okno mapy
      name: 'en-miasto-minimapa',
      query: '',
      lang: 'en',
      run: async (page, base) => {
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&speed=1&godzina=8&cam=hq,1.3`);
        await waitIdle(page);
        await page.waitForFunction(() => window.zm!.minimapa().stan().rysunki >= 1, null, { timeout: 5000 });
        const o = await minimapa(page);
        console.log(`  stan: ${JSON.stringify(o.stan)}, etykieta „${o.aria}”, podpis „${o.podpis}”`);
        if (!o.stan.wlaczona || !o.stan.widoczna) throw new Error(`minimapa nie stoi: ${JSON.stringify(o.stan)}`);
        if (o.aria !== 'Minimap: open the city map') throw new Error(`etykieta przycisku: ${o.aria}`);
        const tytul = await page.getAttribute('#minimapaBtn', 'title');
        if (tytul !== 'Minimap: open the city map (M)') throw new Error(`dymek przycisku: ${tytul}`);
        for (const z of ['OpenStreetMap contributors', 'OpenFreeMap', 'OpenMapTiles'])
          if (!o.podpis.includes(z)) throw new Error(`atrybucja minimapy bez „${z}”: ${o.podpis}`);
        const pl = polskieLitery(`${o.aria} ${tytul} ${o.tekst}`, []);
        if (pl.length) throw new Error(`polskie słowa przy minimapie po angielsku: ${pl.join(' ')}`);
        if (o.podpisPoza || !o.wEkranie) throw new Error('minimapa albo jej podpis poza ekranem');
        if (o.nakladki.length) throw new Error(`minimapa nachodzi na: ${o.nakladki.join(', ')}`);
        await page.click('#minimapaBtn');
        await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
        await czekajNaMape(page);
        const k = await okno(page);
        if (!/City map/.test(k.tekst)) throw new Error('klik w minimapę nie otworzył okna mapy po angielsku');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        await dwieKlatki(page);
      },
    },
    {
      // tryb zombie (komputer): mapa miasta, karta miejsca, plan i wysłanie wyprawy jak w zwykłym trybie; wyprawa
      // jest w stanie zarządu i na minimapie. Zrzuty: plan wyprawy (miasto-zombie-plan) i minimapa z wyprawą w drodze
      name: 'miasto-zombie',
      query: '',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { zaznacz: 2, speed: 1, q: '&tryb=zombie' });
        const tryb = await page.evaluate(() => window.zm!.sim!.st.mode);
        if (tryb !== 'zombie') throw new Error(`tryb gry: ${tryb}`);
        const p = await plan(page);
        console.log(
          `  zombie, miejsce ${JSON.stringify(m)}, plan: ${p.tytul}, podsumowanie ${JSON.stringify(p.podsumowanie)}`,
        );
        if (p.osoby.filter((x) => x.wybrana).length !== 2) throw new Error('zaznaczeni nie są wybrani');
        if (!p.wyslij || p.wyslij.wyszarzony || p.wyslij.tekst !== 'Wyślij wyprawę')
          throw new Error(`przycisk wysyłki: ${JSON.stringify(p.wyslij)}`);
        if (p.bok) throw new Error('okno planu przewija się w bok');
        if (p.podsumowanie.length < 5) throw new Error(`podsumowanie: ${JSON.stringify(p.podsumowanie)}`);
        await page.screenshot({ path: path.join(OUT, 'miasto-zombie-plan.png') });
        await page.click('#sheet [data-act="wyslij"]');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        const w = await page.evaluate(() => JSON.parse(JSON.stringify(window.zm!.gov!.wyprawy ?? [])));
        if (w.length !== 1 || w[0].cel.klucz !== m.klucz) throw new Error(`wyprawa w stanie: ${JSON.stringify(w)}`);
        await page.waitForFunction(() => window.zm!.minimapa().stan().wyprawy === 1, null, { timeout: 3000 });
        const o = await minimapa(page);
        console.log(`  minimapa w trybie zombie: ${JSON.stringify(o.stan)}`);
        if (!o.stan.widoczna || o.nakladki.length) throw new Error(`minimapa: ${JSON.stringify([o.stan, o.nakladki])}`);
        // wyprawa wraca także w trybie zombie: kłopoty to szwendacze, nie szabrownicy
        for (let n = 0; n < 40; n++) {
          if (!(await page.evaluate(() => window.zm!.gov!.wyprawy?.length ?? 0))) break;
          const okno = await page.evaluate(() => window.zm!.ff(30));
          if (okno === 'wydarzenie') await page.click('#sheet .choices [data-act="event"]:not([disabled])');
          else if (okno) throw new Error(`po drodze okno decyzji: ${okno}`);
        }
        const log = await page.evaluate(() => window.zm!.gov!.log.slice(-4).map((l) => (l.txt as { pl: string }).pl));
        console.log(`  po powrocie: ${log.join(' | ')}`);
        if (await page.evaluate(() => window.zm!.gov!.wyprawy?.length)) throw new Error('wyprawa dalej w drodze');
        if (log.some((t) => /szabrown/.test(t))) throw new Error(`szabrownicy w trybie zombie: ${log.join(' | ')}`);
        await page.waitForFunction(() => window.zm!.minimapa().stan().wyprawy === 0, null, { timeout: 3000 });
      },
    },
    {
      // tryb zombie na telefonie po angielsku: plan wyprawy bez przewijania w bok i bez polskich słów, stopka na ekranie
      name: 'en-miasto-zombie-telefon',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        const m = await doPlanu(page, base, { dotyk: true, q: '&tryb=zombie' });
        const tryb = await page.evaluate(() => window.zm!.sim!.st.mode);
        if (tryb !== 'zombie') throw new Error(`tryb gry: ${tryb}`);
        const p = await plan(page);
        console.log(`  zombie po angielsku, plan: ${p.tytul}, osoby ${p.osoby.length}, ekran ${p.ekran}`);
        console.log(`  podsumowanie: ${JSON.stringify(p.podsumowanie)}, stopka ${p.stopka}`);
        const imiona = await page.evaluate(() => window.zm!.sim!.st.people.flatMap((q) => [q.name, q.first]));
        const pl = polskieLitery(p.tekst, [m.nazwa, ...imiona]);
        if (pl.length) throw new Error(`polskie słowa w oknie planu po angielsku: ${pl.join(' ')}`);
        if (p.bok) throw new Error('okno planu przewija się w bok na telefonie');
        const [l, t, r, b] = p.stopka!;
        if (l < 0 || t < 0 || r > p.ekran[0] || b > p.ekran[1]) throw new Error('stopka planu wychodzi za ekran');
        if (p.wyslij?.tekst !== 'Send the supply run') throw new Error(`przycisk wysyłki: ${JSON.stringify(p.wyslij)}`);
        if (p.wroc !== 'Back to the map') throw new Error(`przycisk powrotu: ${p.wroc}`);
        // wybór osoby dotykiem, jak w zwykłym trybie
        const kto = p.osoby.find((x) => !x.wyszarzona)!;
        await page.tap(`#sheet [data-act="wp-osoba"][data-arg="${kto.id}"]`);
        await dwieKlatki(page);
        const po = (await plan(page)).osoby.find((x) => x.id === kto.id)!;
        if (po.wybrana === kto.wybrana) throw new Error('stuknięcie osoby nie zmieniło wyboru');
        if (!po.wybrana) {
          await page.tap(`#sheet [data-act="wp-osoba"][data-arg="${kto.id}"]`);
          await dwieKlatki(page);
        }
      },
    },
    {
      name: 'miasto-start',
      query: '',
      allow: BRAK_TABEL,
      allowUrl: TABELE_URL,
      run: async (page, base) => {
        // bez tabel mieszkańców (404) filtr nie zna imion, więc okolica ma same puste nazwy: sama kategoria, bez nazwy
        // jednoosobowej firmy z imieniem i nazwiskiem właściciela (RODO), także na karcie nocy
        await bezTabel(page);
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        const bt = await nazwy(page);
        const btStan = await stan(page);
        console.log(`  bez tabel: ${JSON.stringify(btStan)}, nazwy ${JSON.stringify(bt)}`);
        if (!btStan.miasto || btStan.okolica <= 0) throw new Error('bez tabel nie ma miasta albo okolicy');
        if (bt.niepuste) throw new Error(`bez tabel ${bt.niepuste} miejsc z nazwą (może być imię właściciela)`);
        const btKarta = await doKarty(page, base, '');
        console.log(`  bez tabel, karta nocy: ${btKarta.join(' | ')}`);
        if (!btKarta.length) throw new Error('bez tabel karta nocy bez wyprawy do miejsca z okolicy');
        if (btKarta.some((t) => t.includes('(')))
          throw new Error(`bez tabel nazwa miejsca na karcie: ${btKarta.join(' | ')}`);
        await page.unroute('**/data/mieszkancy/**');
        // opcja wyłączona: zarząd bez miasta, okolicy nie ma, karta nocy z celami z TARGETS
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9&miasto=0`);
        await waitIdle(page);
        const wyl = await stan(page);
        console.log(`  ?miasto=0: ${JSON.stringify(wyl)}`);
        if (wyl.miasto || wyl.okolica) throw new Error('?miasto=0 nie wyłączyło miasta albo okolicy');
        if (await page.isVisible('#btnMiasto')) throw new Error('?miasto=0: przycisk mapy miasta widać');
        // minimapa też: schowana i wyłączona (nic się nie rysuje), tak samo jak przycisk
        const mm0 = await page.evaluate(() => window.zm!.minimapa().stan());
        if (mm0.wlaczona || mm0.widoczna || mm0.rysunki || (await page.isVisible('#minimapa')))
          throw new Error(`?miasto=0: minimapa na ekranie albo włączona: ${JSON.stringify(mm0)}`);
        const bez = await doKarty(page, base, '&miasto=0');
        if (bez.length) throw new Error(`?miasto=0: karta nocy z miejscami z okolicy: ${bez.join(' | ')}`);
        // domyślnie: miasto włączone, okolica z kluczami, karta nocy z miejscami z okolicy
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,0.9`);
        await waitIdle(page);
        const wl = await stan(page);
        console.log(`  domyślnie: ${JSON.stringify(wl)}`);
        if (!wl.miasto) throw new Error('zarząd bez stanu miasta (gov.miasto)');
        if (wl.okolica <= 0) throw new Error('okolica pusta (zm.okolica)');
        if (!(await page.isVisible('#minimapa'))) throw new Error('domyślnie minimapy nie widać');
        if (wl.zleKlucze) throw new Error(`${wl.zleKlucze} miejsc bez klucza „poi:X:Y”`);
        if (wl.poza <= 0) throw new Error('w okolicy nie ma miejsc poza mapą lokalną');
        // filtr nazw podpięty w main.ts: nazwy z osobą puste, marka zostaje, patron szkoły odpada z nazwy
        const nz = await nazwy(page);
        console.log(`  nazwy: ${JSON.stringify(nz)}`);
        if (!nz.osoby.length || nz.osoby.some((n) => n))
          throw new Error(`nazwa z osobą w okolicy: ${nz.osoby.join(' | ')}`);
        if (!nz.marki.length || nz.marki.some((n) => n !== 'Żabka'))
          throw new Error(`marka po filtrze: ${nz.marki.join(' | ')}`);
        if (!nz.patron.length || nz.patron.some((n) => n !== 'Szkoła Podstawowa Nr 44'))
          throw new Error(`szkoła z patronem po filtrze: ${nz.patron.join(' | ')}`);
        if (wl.bezNazwy <= 0) throw new Error('żadna nazwa nie została odfiltrowana');
        // zapis sprzed mapy miasta (bez stanu miasta w zarządzie i bez kluczy punktów): po wczytaniu miasto włączone,
        // okolica ta sama co w nowej grze
        await page.evaluate(() => {
          window.zm!.save();
          const raw = JSON.parse(localStorage.getItem('za-murem-0.4-zapis')!);
          delete raw.gov.miasto;
          for (const p of raw.data.geo.poi) delete p.k;
          localStorage.setItem('za-murem-0.4-zapis', JSON.stringify(raw));
        });
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        const stary = await stan(page);
        console.log(`  stary zapis po wczytaniu: ${JSON.stringify(stary)}`);
        if (!stary.miasto) throw new Error('stary zapis bez stanu miasta po wczytaniu');
        if (stary.okolica !== wl.okolica || stary.zleKlucze)
          throw new Error(
            `okolica ze starego zapisu: ${stary.okolica} miejsc z ${wl.okolica}, złych kluczy ${stary.zleKlucze}`,
          );
        const z = await doKarty(page, base, '');
        console.log(`  karta nocy, opcje z miejscami: ${z.join(' | ')}`);
        if (!z.length) throw new Error('karta nocy bez wyprawy do miejsca z okolicy (input() bez okolicy?)');
        await page.waitForTimeout(200);
      },
    },
  ];
}

/**
 * Widok pięter (etap 1, flaga ?pietra=1): przekrój wybranego piętra ze stropem zamiast parteru. Scenariusze wybierają
 * piętro hakiem window.zm.pietro (jak klik na liście kafelka), a stan widoku sprawdzają, nie tylko fotografują.
 */
function pietraShots(): Shot[] {
  /** wybór piętra i czekanie, aż dorysują się kawałki z przekrojem */
  const wybierz = async (page: Page, L: number) => {
    await page.evaluate((L) => window.zm!.pietro(L), L);
    await waitIdle(page);
  };
  /** stan widoku pięter: hak gry, przekrój, zoom, naklejki stropu z PixelLab i tekst notki pod kafelkiem */
  const stan = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      const notka = document.getElementById('floorNote')!;
      return {
        ...zm.pietra(),
        przekroj: zm.view.section,
        zoom: Math.round(zm.view.cam.zoom * 100) / 100,
        strop: zm.grafika()?.strop ?? null,
        notka: notka.hidden ? '' : (notka.textContent ?? ''),
      };
    });
  /** sprawdza, że wybrane jest piętro L, a przekrój jest (nie)widoczny; wypisuje i zwraca stan */
  const sprawdz = async (page: Page, L: number, przekroj: boolean) => {
    const st = await stan(page);
    console.log(`  ${JSON.stringify(st)}`);
    if (!st.wlaczone) throw new Error('flaga ?pietra=1 nie włączyła widoku pięter');
    if (st.pietro !== L) throw new Error(`wybrane piętro ${st.pietro} zamiast ${L} (lista ${st.lista})`);
    if (st.przekroj !== przekroj) throw new Error(`przekrój ${st.przekroj} zamiast ${przekroj} przy zoomie ${st.zoom}`);
    return st;
  };
  /** pierwszy pionek zarządu na ekranie (współrzędne strony): stoi w obrysie siedziby, więc na piętrze jest pod stropem */
  const pionekZarzadu = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
      const r = document.getElementById('stage')!.getBoundingClientRect();
      const [x, y] = zm.screenOf(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5);
      return { x: x + r.x, y: y + r.y };
    });
  /** lista pięter i panel budowy: położenie, liczba pozycji i czy lista się przewija */
  const lista = (page: Page) =>
    page.evaluate(() => {
      const r = (id: string) => {
        const e = document.getElementById(id)!;
        const b = e.getBoundingClientRect();
        return { hidden: e.hidden, l: b.left, r: b.right, t: b.top, b: b.bottom };
      };
      const l = document.getElementById('floorList')!;
      return {
        lista: r('floorList'),
        panel: r('buildPanel'),
        pozycje: document.querySelectorAll('#floorList [data-pietro]').length,
        w: innerWidth,
        h: innerHeight,
        przewija: l.scrollHeight > l.clientHeight,
      };
    });
  /** położenie kafelka „Piętro” i przycisków prawej grupy paska (px okna) */
  const pasek = (page: Page) =>
    page.evaluate(() => {
      const r = (id: string) => {
        const e = document.getElementById(id)!;
        const b = e.getBoundingClientRect();
        return { l: b.left, r: b.right, t: b.top, b: b.bottom, ukryty: getComputedStyle(e).display === 'none' };
      };
      return {
        kafelek: r('btnFloor'),
        miasto: r('btnMiasto'),
        budowa: r('btnBuild'),
        menu: r('btnMenu'),
        w: innerWidth,
      };
    });
  /** Układ paska na ekranie szerszym niż telefon (od 641 px): kafelek stoi po prawej, tuż przed „Mapą miasta” (albo
      „Budową”, gdy mapy nie ma), a nie sam przy lewej krawędzi drugiego wiersza (wybór Mateusza: „po prawej stronie
      obok buduj i menu”), także gdy pasek się zawinie (polski przy 1440 px). `razem`: na szerokim ekranie także „Budowa”
      i „Menu” są w jego wierszu, przy prawej krawędzi okna; na tablecie (820 px) prawa grupa zawija się tak samo jak
      bez flagi (do wiersza zostaje tylko kafelek z „Mapą”), więc tam sprawdzamy sam kafelek. Na telefonie kafelek ma
      własne miejsce w pierwszym wierszu. */
  const sprawdzPasek = async (page: Page, razem: boolean) => {
    const p = await pasek(page);
    console.log(`  pasek: ${JSON.stringify(p)}`);
    if (p.w <= 640) return;
    const srodek = (r: { t: number; b: number }) => (r.t + r.b) / 2;
    const wWierszu = (r: { t: number; b: number }) => Math.abs(srodek(p.kafelek) - srodek(r)) <= 6;
    const nastepny = p.miasto.ukryty ? p.budowa : p.miasto;
    if (!wWierszu(nastepny)) throw new Error('kafelek „Piętro” nie stoi w wierszu następnego przycisku');
    const odstep = nastepny.l - p.kafelek.r;
    if (odstep < 0 || odstep > 40)
      throw new Error(`kafelek „Piętro” stoi ${Math.round(odstep)} px od następnego przycisku`);
    if (!razem) return;
    if (!wWierszu(p.budowa) || !wWierszu(p.menu))
      throw new Error('„Budowa” i „Menu” nie stoją w wierszu kafelka „Piętro”');
    if (p.menu.r > p.w || p.menu.r < p.w - 24) throw new Error('„Menu” nie stoi przy prawej krawędzi okna');
  };
  /** Przymorze, piętro 2 z bliska, z grafiką z PixelLab albo (kod) z ?grafika=kod, czyli strop bez naklejek */
  const przymorzeP2 = async (page: Page, base: string, kod: boolean) => {
    await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75${kod ? '&grafika=kod' : ''}`);
    await waitIdle(page);
    await wybierz(page, 2);
    const st = await sprawdz(page, 2, true);
    if (kod && st.strop !== null) throw new Error('z ?grafika=kod strop wziął naklejki z PixelLab');
    // przy `npm run shots -- --kod` cała strona dostaje ?grafika=kod, więc naklejek stropu nie ma też w „zwykłym” scenariuszu
    if (!kod && !KOD && !st.strop)
      throw new Error('bez ?grafika=kod brak naklejek stropu z PixelLab (atlas strop.png)');
  };
  return [
    // Przymorze, piętro 2 z bliska (zoom 0,75): bloki pod stropem, niższe budynki z dachem
    { name: 'pietra-przymorze-p2', query: '', run: (page, base) => przymorzeP2(page, base, false) },
    // to samo bez grafiki z PixelLab: strop bez naklejek (tło, ziarno i szwy z kodu)
    { name: 'pietra-kod', query: '', run: (page, base) => przymorzeP2(page, base, true) },
    // Lanciego, piętro 1 przy siedzibie (blok 10G)
    {
      name: 'pietra-lanciego-p1',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=lanciego&pietra=1&speed=0&cam=hq,0.85`);
        await waitIdle(page);
        await wybierz(page, 1);
        await sprawdz(page, 1, true);
      },
    },
    // najwyższy blok Przymorza (nie na brzegu mapy), piętro 11: przekrój mają tylko budynki z więcej niż 11 kondygnacjami,
    // reszta ma dach
    {
      name: 'pietra-wysoki-blok-p11',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.7`);
        await waitIdle(page);
        const blok = await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const hq = w.buildings[w.hq];
          const srodek = (b: typeof hq) => [(b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2];
          const [hx, hy] = srodek(hq);
          const odHq = (b: typeof hq) => Math.hypot(srodek(b)[0] - hx, srodek(b)[1] - hy);
          // blok przy brzegu mapy zostawiłby pół kadru pustego; wśród reszty najwyższy, przy remisie najbliższy siedziby
          const wewnatrz = (b: typeof hq) => b.x0 > 10 && b.y0 > 10 && b.x1 < w.size - 10 && b.y1 < w.size - 10;
          const wysokie = w.buildings
            .filter((b) => b.cls === 'blok' && b.levels > 11 && wewnatrz(b))
            .sort((a, c) => c.levels - a.levels || odHq(a) - odHq(c));
          const b = wysokie[0];
          if (!b) return null;
          const [x, y] = srodek(b);
          zm.setCam(x, y, 0.7);
          const nizsze = w.buildings.filter(
            (q) => q.levels <= 11 && q.levels >= 2 && Math.hypot(srodek(q)[0] - x, srodek(q)[1] - y) < 40,
          );
          return {
            id: b.id,
            nazwa: b.name,
            levels: b.levels,
            wysokich: wysokie.length,
            nizszychWPoblizu: nizsze.length,
          };
        });
        console.log(`  najwyższy blok: ${JSON.stringify(blok)}`);
        if (!blok) throw new Error('na Przymorzu nie ma bloku wyższego niż 11 kondygnacji z dala od brzegu mapy');
        await waitIdle(page);
        await wybierz(page, 11);
        await sprawdz(page, 11, true);
      },
    },
    // Zielonki, piętro 1: dom z awansem (druga kondygnacja z flagi) cały pod stropem, ze ścianami działowymi
    {
      name: 'pietra-zielonki-dom-p1',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=zielonki&pietra=1&speed=0&cam=hq,1.6`);
        await waitIdle(page);
        const dom = await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const hq = w.buildings[w.hq];
          const srodek = (b: typeof hq) => [(b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2];
          const [hx, hy] = srodek(hq);
          const daleko = (b: typeof hq) => Math.hypot(srodek(b)[0] - hx, srodek(b)[1] - hy);
          // dom z drugą kondygnacją (z awansu, bo OSM jej tu nie podaje), najbliższy siedzibie, choćby siedziba sama
          const domy = w.buildings
            .filter((b) => b.cls === 'dom' && b.levels >= 2 && b.area >= 60)
            .sort((a, c) => daleko(a) - daleko(c));
          const b = domy[0];
          if (!b) return null;
          const [x, y] = srodek(b);
          zm.setCam(x, y, 1.6);
          return { id: b.id, siedziba: b.id === w.hq, levels: b.levels, pole: b.area, domow: domy.length };
        });
        console.log(`  dom: ${JSON.stringify(dom)}`);
        if (!dom) throw new Error('w Zielonkach żaden dom nie ma piętra');
        await waitIdle(page);
        await wybierz(page, 1);
        await sprawdz(page, 1, true);
      },
    },
    // kafelek „Piętro” z otwartą listą na komputerze (Przymorze, 17 pięter), piętro 2 wybrane
    {
      name: 'pietra-lista-pulpit',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75`);
        await waitIdle(page);
        await wybierz(page, 2);
        await page.click('#btnFloor');
        const l = await lista(page);
        console.log(`  lista: ${JSON.stringify(l)}`);
        if (l.lista.hidden) throw new Error('kliknięcie kafelka nie otworzyło listy pięter');
        if (l.pozycje !== 17) throw new Error(`lista ma ${l.pozycje} pozycji zamiast 17`);
        if (l.lista.r > l.w || l.lista.b > l.h || l.lista.l < 0) throw new Error('lista wystaje poza okno');
        await sprawdzPasek(page, true);
      },
    },
    // pasek z kafelkiem po angielsku przy 1280 px (inne napisy, inna szerokość grup) i na tablecie (dotyk, 820 px)
    {
      name: 'pietra-pasek-en-1280',
      query: '',
      w: 1280,
      h: 800,
      lang: 'en',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75`);
        await waitIdle(page);
        await wybierz(page, 2);
        await page.waitForTimeout(450);
        await sprawdzPasek(page, true);
        await sprawdz(page, 2, true);
      },
    },
    {
      name: 'pietra-pasek-tablet',
      query: '',
      w: 820,
      h: 1180,
      touch: true,
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75`);
        await waitIdle(page);
        await wybierz(page, 2);
        await page.waitForTimeout(450);
        await sprawdzPasek(page, false);
        await sprawdz(page, 2, true);
      },
    },
    // to samo na telefonie 390 × 844 (dotknięcie kafelka)
    {
      name: 'pietra-lista-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75`);
        await waitIdle(page);
        await wybierz(page, 2);
        await page.tap('#btnFloor');
        const l = await lista(page);
        console.log(`  lista: ${JSON.stringify(l)}`);
        if (l.lista.hidden) throw new Error('dotknięcie kafelka nie otworzyło listy pięter');
        if (l.pozycje !== 17) throw new Error(`lista ma ${l.pozycje} pozycji zamiast 17`);
        if (l.lista.r > l.w || l.lista.b > l.h || l.lista.l < 0) throw new Error('lista wystaje poza okno');
        await page.waitForTimeout(150);
      },
    },
    // piętro 1 przy siedzibie: zarząd jest pod stropem, więc pod kafelkiem stoi „Zarząd jest na parterze”, a klik w obrys
    // siedziby (w miejscu pionka zarządu) nic nie zaznacza i podpowiada to samo na dole
    {
      name: 'pietra-zarzad-parter',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=lanciego&pietra=1&speed=0&cam=hq,1`);
        await waitIdle(page);
        await wybierz(page, 1);
        await page.waitForTimeout(450); // pasek odświeża notkę co 200 ms
        const st = await sprawdz(page, 1, true);
        if (st.notka !== 'Zarząd jest na parterze') throw new Error(`notka pod kafelkiem: „${st.notka}”`);
        const p = await pionekZarzadu(page);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(350); // podpowiedź trafia do paska przy odświeżeniu (co 200 ms)
        const hint = await page.evaluate(() => document.getElementById('hint')!.textContent);
        const karta = await page.evaluate(() => !document.getElementById('card')!.hidden);
        console.log(`  klik w pionek zarządu pod stropem: podpowiedź „${hint}”, karta ${karta}`);
        if (hint !== 'Zarząd jest na parterze')
          throw new Error(`klik w pionek zarządu pod stropem: podpowiedź „${hint}”`);
        if (karta) throw new Error('klik w pionek zarządu na piętrze otworzył kartę');
      },
    },
    // widoczny pionek zarządu stoi na dworze tuż pod ścianą budynku: jego głowa leży nad kafelkiem budynku, ale lewy klik
    // zaznacza go także na piętrze (blokada obrysu go przepuszcza), a prawy przycisk (rozkazy) w ten obrys jest zablokowany
    {
      name: 'pietra-pionek-przy-fasadzie',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=lanciego&pietra=1&speed=0&cam=hq,1`);
        await waitIdle(page);
        await wybierz(page, 1);
        const cel = await page.evaluate(() => {
          const zm = window.zm!;
          const w = zm.sim!.w;
          const size = w.size;
          const hq = w.buildings[w.hq];
          const p = zm.sim!.st.pawns.find((q) => q.kind === 'core' && !q.away)!;
          // wolny kafelek poza budynkami, nad którym (na północy) stoi kafelek budynku, najbliższy siedziby
          const sx = (hq.x0 + hq.x1) / 2;
          const sy = (hq.y0 + hq.y1) / 2;
          let best = -1;
          let bd = Number.POSITIVE_INFINITY;
          for (let i = size; i < size * size; i++) {
            if (w.bid[i] >= 0 || w.bid[i - size] < 0 || w.blocked[i]) continue;
            const d = Math.hypot((i % size) - sx, Math.floor(i / size) - sy);
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          p.x = (best % size) + 0.5;
          p.y = Math.floor(best / size) + 0.5;
          zm.setCam(p.x, p.y, 1);
          return {
            x: p.x,
            y: p.y,
            imie: zm.sim!.st.people[p.person].name,
            kafelekPionka: best,
            nadNim: w.bid[best - size],
          };
        });
        console.log(`  pionek: ${JSON.stringify(cel)}`);
        await waitIdle(page);
        await page.waitForTimeout(250);
        // głowa pionka (kafelek wyżej niż stopy) leży nad kafelkiem budynku
        const punkt = await page.evaluate((c) => {
          const zm = window.zm!;
          const r = document.getElementById('stage')!.getBoundingClientRect();
          const [x, y] = zm.screenOf(c.x, c.y - 1.0);
          return { x: x + r.x, y: y + r.y, tile: zm.view.tileAt(x, y), bid: zm.sim!.w.bid[zm.view.tileAt(x, y)] };
        }, cel);
        console.log(`  klik w głowę: ${JSON.stringify(punkt)}`);
        if (punkt.bid < 0)
          throw new Error('głowa pionka nie leży nad kafelkiem budynku, scenariusz niczego nie sprawdza');
        // prawy klik w ten obrys: blokada z podpowiedzią, bez menu rozkazów
        await page.mouse.click(punkt.x, punkt.y, { button: 'right' });
        await page.waitForTimeout(350);
        const prawy = await page.evaluate(() => ({
          hint: document.getElementById('hint')!.textContent,
          menu: !document.getElementById('ctx')!.hidden,
        }));
        console.log(`  prawy klik: ${JSON.stringify(prawy)}`);
        if (prawy.hint !== 'Zarząd jest na parterze' || prawy.menu)
          throw new Error(`prawy klik w obrys nie został zablokowany: ${JSON.stringify(prawy)}`);
        // lewy klik: pionek zaznaczony (karta osoby z jego imieniem), bez blokady
        await page.mouse.click(punkt.x, punkt.y);
        await page.waitForTimeout(350);
        const lewy = await page.evaluate(() => {
          const karta = document.getElementById('card')!;
          return { karta: !karta.hidden, tekst: karta.textContent ?? '' };
        });
        console.log(`  lewy klik: karta ${lewy.karta}`);
        if (!lewy.karta || !lewy.tekst.includes(cel.imie))
          throw new Error(`lewy klik w głowę widocznego pionka go nie zaznaczył (karta ${lewy.karta})`);
      },
    },
    // to samo na telefonie: notka pod paskiem
    {
      name: 'pietra-zarzad-telefon',
      query: '',
      w: 390,
      h: 844,
      run: async (page, base) => {
        await page.goto(`${base}?demo=lanciego&pietra=1&speed=0&cam=hq,1`);
        await waitIdle(page);
        await wybierz(page, 1);
        await page.waitForTimeout(450);
        const st = await sprawdz(page, 1, true);
        if (st.notka !== 'Zarząd jest na parterze') throw new Error(`notka pod kafelkiem: „${st.notka}”`);
        // notka stoi pod listą celów, a nie na jej rogu (tam zasłaniałaby licznik „0 / 8”)
        const u = await page.evaluate(() => {
          const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
          return {
            cele: { t: r('goals').top, b: r('goals').bottom },
            notka: { t: r('floorNote').top, b: r('floorNote').bottom },
          };
        });
        console.log(`  cele i notka: ${JSON.stringify(u)}`);
        if (u.notka.t < u.cele.b) throw new Error('notka „Zarząd jest na parterze” nachodzi na listę celów');
      },
    },
    // piętro 2 z daleka (zoom 0,4, poniżej progu przekroju): dachy i „Przybliż, żeby zajrzeć na piętro”
    {
      name: 'pietra-daleko',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.4`);
        await waitIdle(page);
        await wybierz(page, 2);
        await page.waitForTimeout(450);
        const st = await sprawdz(page, 2, false);
        if (st.notka !== 'Przybliż, żeby zajrzeć na piętro') throw new Error(`notka pod kafelkiem: „${st.notka}”`);
      },
    },
    // panel budowy otwarty razem z listą pięter: nie zasłaniają się
    {
      name: 'pietra-panel-budowy',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&pietra=1&speed=0&cam=hq,0.75`);
        await waitIdle(page);
        await wybierz(page, 1);
        await page.keyboard.press('b');
        await page.waitForSelector('#buildPanel .tile');
        await page.waitForTimeout(300); // animacja wysuwania
        await page.click('#btnFloor');
        const l = await lista(page);
        console.log(`  lista: ${JSON.stringify(l.lista)}, panel: ${JSON.stringify(l.panel)}`);
        if (l.lista.hidden) throw new Error('lista pięter nie otworzyła się przy panelu budowy');
        if (l.panel.hidden) throw new Error('panel budowy zamknął się po otwarciu listy pięter');
        const zachodzi =
          l.lista.l < l.panel.r && l.lista.r > l.panel.l && l.lista.t < l.panel.b && l.lista.b > l.panel.t;
        if (zachodzi) throw new Error('lista pięter nachodzi na panel budowy');
        const st = await sprawdz(page, 1, true);
        // podpowiedź („Przybliż…”, „Zarząd jest na parterze”) nie stoi nad nagłówkiem panelu budowy
        if (st.notka) throw new Error(`przy otwartym panelu budowy stoi podpowiedź „${st.notka}”`);
      },
    },
  ];
}
