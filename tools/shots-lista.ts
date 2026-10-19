/* Zrzuty i sprawdzenia listy „moich ludzi” (src/ui/lista.ts) do `npm run shots` (scenariusze lista-*): układ przy 1440,
   1280 i 1024 px, na telefonie 390×844, po angielsku i w trybie zombie; wszystkie znaczniki stanu; kliknięcie, drugie
   kliknięcie (kamera idzie za osobą), przełączanie klawiszem, osoba na wyprawie, dwanaście osób, komunikat o przybyszach
   i panel budowy. Każdy scenariusz sam sprawdza, że lista nie nachodzi na pasek u góry, cele dnia, kartę osoby, przyciski
   przybliżenia, minimapę, komunikat o przybyszach, panel budowy ani znacznik suchego drzewa. */

import path from 'node:path';
import type { Page } from '@playwright/test';
import { waitIdle } from './browser.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts (jego `Shot` nie jest wyeksportowany) */
export interface ShotLista {
  name: string;
  query: string;
  w?: number;
  h?: number;
  touch?: boolean;
  lang?: 'en' | 'pl';
  run: (page: Page, base: string) => Promise<void>;
}

const TILE = 32;
const GRA = 'demo=przymorze&speed=0&cam=hq,1.3';

/** start gry i czekanie na pierwsze chipy listy (portrety i znaczniki rysuje `hud` co 200 ms) */
async function start(page: Page, base: string, query = GRA): Promise<void> {
  await page.goto(`${base}?${query}`);
  await waitIdle(page);
  await page.waitForSelector('#lista:not([hidden]) .lp');
  await page.waitForTimeout(350);
}

/** klik albo stuknięcie, zależnie od ekranu */
const kliknij = (page: Page, sel: string, dotyk: boolean) => (dotyk ? page.tap(sel) : page.click(sel));

/** numery pionków zarządu w kolejności chipów na liście */
const chipy = (page: Page): Promise<number[]> =>
  page.$$eval('#lista .lp', (l) => l.map((e) => Number((e as HTMLElement).dataset.pawn)));

/** numery pionków, których chip jest teraz zaznaczony (aria-pressed) */
const zaznaczone = (page: Page): Promise<number[]> =>
  page.$$eval('#lista .lp[aria-pressed="true"]', (l) => l.map((e) => Number((e as HTMLElement).dataset.pawn)));

/** kamera w kafelkach */
const kamera = (page: Page): Promise<{ x: number; y: number; zoom: number }> =>
  page.evaluate((t) => {
    const c = window.zm!.view.cam;
    return { x: c.x / t, y: c.y / t, zoom: c.zoom };
  }, TILE);

/** pozycja pionka w kafelkach */
const pozycja = (page: Page, pawn: number): Promise<{ x: number; y: number }> =>
  page.evaluate((id) => {
    const p = window.zm!.sim!.st.pawns.find((q) => q.id === id)!;
    return { x: p.x, y: p.y };
  }, pawn);

/** zmiana stanu pionka zarządu (ludzie na liście czytają ją przy najbliższym odświeżeniu, co 200 ms) */
async function ustaw(page: Page, pawn: number, zmiana: string): Promise<void> {
  await page.evaluate(
    ([id, kod]) => {
      const st = window.zm!.sim!.st;
      const p = st.pawns.find((q) => q.id === id)!;
      new Function('p', 'st', kod)(p, st);
    },
    [pawn, zmiana] as const,
  );
}

/** dokłada n osób do zarządu (kopie pierwszej z nowymi imionami), do sprawdzenia dłuższej listy */
async function dolozOsoby(page: Page, n: number): Promise<void> {
  await page.evaluate((ile) => {
    const st = window.zm!.sim!.st;
    const wzor = st.pawns.find((p) => p.kind === 'core')!;
    for (let k = 0; k < ile; k++) {
      st.people.push({
        ...st.people[wzor.person],
        id: `lista-test-${k}`,
        name: `Osoba${k + 5} Testowa`,
        first: `Osoba${k + 5}`,
        ref: undefined,
      });
      st.pawns.push({
        ...wzor,
        id: st.nextPawn++,
        person: st.people.length - 1,
        x: wzor.x + 1 + (k % 4) * 0.8,
        y: wzor.y + 1 + Math.floor(k / 4) * 0.8,
        path: [],
        pi: 0,
        job: null,
        needs: { ...wzor.needs! },
        moods: [],
        carry: 0,
        look: (wzor.look + k + 1) % 16,
      });
    }
  }, n);
  await page.waitForTimeout(450);
}

/**
 * Lista nie nachodzi na nic, co stoi obok: dla każdego chipa i każdej widocznej przeszkody sprawdza przecięcie
 * prostokątów, a dla chipów i samej listy położenie w oknie. Zwraca opisy naruszeń.
 */
async function naruszenia(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const widoczny = (e: Element): boolean => {
      const h = e as HTMLElement;
      if (h.hidden) return false;
      const cs = getComputedStyle(h);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const przeszkody: [string, string][] = [
      ['#top', 'pasek u góry'],
      ['#goals', 'cele dnia'],
      ['#card', 'karta osoby'],
      ['.mapctl', 'przyciski przybliżenia'],
      ['#minimapa', 'minimapa'],
      ['#arrive', 'komunikat o przybyszach'],
      ['#buildPanel', 'panel budowy'],
      ['#treeMark .treemark-t', 'znacznik suchego drzewa'],
      ['#placeBar', 'pasek stawiania'],
    ];
    const bledy: string[] = [];
    const chipy = [...document.querySelectorAll('#lista .lp')].filter(widoczny);
    for (const c of chipy) {
      const a = c.getBoundingClientRect();
      const imie = c.querySelector('.lp-nm')?.textContent ?? '?';
      if (a.left < 0 || a.top < 0 || a.right > innerWidth || a.bottom > innerHeight)
        bledy.push(
          `chip ${imie} wystaje z okna (${Math.round(a.left)},${Math.round(a.top)}–${Math.round(a.right)},${Math.round(a.bottom)})`,
        );
      for (const [sel, opis] of przeszkody) {
        const e = document.querySelector(sel);
        if (!e || !widoczny(e)) continue;
        const b = e.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1)
          bledy.push(
            `chip ${imie} nachodzi na ${opis} o ${Math.round(w)}×${Math.round(h)} px (chip ${Math.round(a.left)},${Math.round(a.top)}–${Math.round(a.right)},${Math.round(a.bottom)})`,
          );
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) bledy.push('strona przewija się w poziomie');
    return bledy;
  });
}

async function bezNaruszen(page: Page, opis: string): Promise<void> {
  const b = await naruszenia(page);
  const chipyPos = await page.$$eval('#lista .lp', (l) =>
    l.map((e) => {
      const r = e.getBoundingClientRect();
      return `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
    }),
  );
  console.log(
    `  ${opis}: ${chipyPos.length} chipów ${chipyPos.slice(0, 3).join(' | ')}${chipyPos.length > 3 ? ' …' : ''}`,
  );
  if (b.length) throw new Error(`${opis}: ${b.join('; ')}`);
}

/** nazwa osoby z karty, gdy karta jest otwarta */
const nazwaNaKarcie = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const k = document.getElementById('card')!;
    return k.hidden ? null : (k.querySelector('h2')?.textContent ?? null);
  });

/** imię pierwszej osoby z listy (do porównania z nazwą z symulacji) */
const imionaZSymulacji = (page: Page): Promise<Record<number, { first: string; name: string }>> =>
  page.evaluate(() => {
    const st = window.zm!.sim!.st;
    return Object.fromEntries(
      st.pawns
        .filter((p) => p.kind === 'core')
        .map((p) => [p.id, { first: st.people[p.person].first, name: st.people[p.person].name }]),
    );
  });

export function listaShots(out: string): ShotLista[] {
  const shot = (s: ShotLista) => s;
  const zrzut = (page: Page, nazwa: string) => page.screenshot({ path: path.join(out, `${nazwa}.png`) });

  /** układ listy na komputerze: cztery chipy z imionami z symulacji, kliknięcie otwiera kartę tej osoby */
  const komputer = (name: string, w: number, h: number): ShotLista =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        await start(page, base);
        const ludzie = await imionaZSymulacji(page);
        const id = await chipy(page);
        if (id.length !== 4) throw new Error(`${id.length} chipów zamiast 4`);
        const imiona = await page.$$eval('#lista .lp-nm', (l) => l.map((e) => e.textContent));
        if (imiona.join() !== id.map((i) => ludzie[i].first).join())
          throw new Error(`imiona na liście ${imiona.join()} a w symulacji ${id.map((i) => ludzie[i].first).join()}`);
        const portrety = await page.$$eval('#lista .lp-img', (l) => l.map((e) => (e as HTMLImageElement).src.length));
        if (portrety.some((d) => d < 100)) throw new Error(`pusty portret: ${portrety.join()}`);
        await bezNaruszen(page, `${w}×${h} bez zaznaczenia`);
        await zrzut(page, `${name}-start`);
        // między chipami (pojemnik listy ma szerokość całego pasa) klik trafia w mapę, nie w listę
        const miedzy = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#lista') !== null, [
          w - 200,
          150,
        ] as const);
        if (miedzy) throw new Error('pusty kawałek pasa listy łapie wskaźnik zamiast mapy');
        await page.click(`#lista .lp[data-pawn="${id[1]}"]`);
        await page.waitForTimeout(500);
        const karta = await nazwaNaKarcie(page);
        if (karta !== ludzie[id[1]].name) throw new Error(`karta „${karta}” zamiast „${ludzie[id[1]].name}”`);
        if ((await zaznaczone(page)).join() !== String(id[1])) throw new Error('chip nie jest zaznaczony');
        // po kliknięciu myszą chip oddaje fokus: spacja dalej zatrzymuje i puszcza grę (start jest na pauzie)
        if (await page.evaluate(() => document.activeElement?.closest('#lista') !== null))
          throw new Error('chip zatrzymał fokus po kliknięciu myszą');
        await page.keyboard.press('Space');
        if ((await page.evaluate(() => window.zm!.speed())) !== 1)
          throw new Error('spacja po kliknięciu chipa nie puściła gry');
        await page.keyboard.press('Space');
        if ((await page.evaluate(() => window.zm!.speed())) !== 0) throw new Error('druga spacja nie zatrzymała gry');
        await bezNaruszen(page, `${w}×${h} z kartą osoby`);
      },
    });

  return [
    komputer('lista-1440', 1440, 900),
    komputer('lista-1280', 1280, 720),
    komputer('lista-1024', 1024, 768),

    shot({
      // telefon: stuknięcie zaznacza i otwiera kartę, lista mieści się w jednym rzędzie pod celami dnia i nie zasłania
      // karty ani przycisków przybliżenia
      name: 'lista-telefon',
      query: '',
      w: 390,
      h: 844,
      touch: true,
      run: async (page, base) => {
        await start(page, base);
        const id = await chipy(page);
        await bezNaruszen(page, '390×844 bez zaznaczenia');
        const wys = await page.$eval('#lista', (e) => Math.round(e.getBoundingClientRect().height));
        console.log(`  wysokość listy ${wys} px`);
        if (wys > 80) throw new Error(`lista na telefonie ma ${wys} px wysokości (jeden rząd ma być niższy niż 80)`);
        await zrzut(page, 'lista-telefon-start');
        const miedzy = await page.evaluate(() => {
          const r = document.querySelector('#lista li:last-child .lp')!.getBoundingClientRect();
          return document.elementFromPoint(innerWidth - 20, r.top + 10)?.closest('#lista') !== null;
        });
        if (miedzy) throw new Error('pusty kawałek pasa listy łapie dotyk zamiast mapy');
        await page.tap(`#lista .lp[data-pawn="${id[2]}"]`);
        await page.waitForTimeout(600);
        if ((await zaznaczone(page)).join() !== String(id[2])) throw new Error('stuknięcie nie zaznaczyło osoby');
        if (!(await nazwaNaKarcie(page))) throw new Error('stuknięcie nie otworzyło karty');
        await bezNaruszen(page, '390×844 z kartą osoby');
      },
    }),

    shot({
      // angielski: nazwa grupy, podpowiedź chipa i znaczniki po angielsku, bez polskich słów
      name: 'lista-en',
      query: '',
      w: 1280,
      h: 720,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base);
        const [id] = await chipy(page);
        await ustaw(page, id, 'p.needs.food = 10; p.needs.warm = 20;');
        await page.waitForTimeout(450);
        const t = await page.$eval(`#lista .lp[data-pawn="${id}"]`, (e) => ({
          title: (e as HTMLElement).title,
          aria: e.getAttribute('aria-label'),
          grupa: e.closest('#lista')!.getAttribute('aria-label'),
        }));
        console.log(`  ${JSON.stringify(t)}`);
        if (t.grupa !== 'Your people') throw new Error(`nazwa grupy „${t.grupa}”`);
        if (!/Hungry \(Fed 10\)/.test(t.title) || !/Cold \(Warmth 20\)/.test(t.title))
          throw new Error(`podpowiedź bez angielskich znaczników: ${t.title}`);
        if (/[ąćęłńóśźż]|Głodn|Zmarzn|Kliknij/.test(`${t.title} ${t.aria}`))
          throw new Error('polskie słowa po angielsku');
        await bezNaruszen(page, 'en 1280×720');
        await zrzut(page, 'lista-en-stany');
      },
    }),

    shot({
      // tryb zombie: ugryziony z godzinami do śmierci, warta i wyprawa; pasek ma tu dodatkowe pola (siatka, stado)
      name: 'lista-zombie',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base, 'tryb=zombie&demo=przymorze&speed=0&cam=hq,1.3');
        const id = await chipy(page);
        await ustaw(page, id[0], 'st.tick; p.bite = st.tick - 400; p.limb = true;');
        await ustaw(
          page,
          id[1],
          "p.job = { t: 'guard', target: 0, phase: 1, from: -1, t0: st.tick, until: st.tick + 99999, order: false };",
        );
        await ustaw(page, id[2], 'p.away = true;');
        await page.waitForTimeout(450);
        const stan = await page.$$eval('#lista .lp', (l) =>
          l.map((e) => ({
            pawn: Number((e as HTMLElement).dataset.pawn),
            mk: [...e.querySelectorAll('.mk')].map((m) => m.className.replace(/\bmk\b\s*/, '')),
          })),
        );
        console.log(`  ${JSON.stringify(stan)}`);
        const m = (p: number) => stan.find((s) => s.pawn === p)!.mk.join(' ');
        if (!/mk-ugryzienie/.test(m(id[0]))) throw new Error('ugryziony bez znacznika');
        if (!/mk-warta/.test(m(id[1]))) throw new Error('wartownik bez znacznika');
        if (!/mk-wyprawa/.test(m(id[2]))) throw new Error('osoba na wyprawie bez znacznika');
        const h = await page.$eval(`#lista .lp[data-pawn="${id[0]}"] .mk-ugryzienie`, (e) => e.textContent?.trim());
        if (!/^\d+ ?h$/.test(h ?? '')) throw new Error(`godziny przy ugryzieniu: „${h}”`);
        await bezNaruszen(page, 'zombie 1280×720');
        await zrzut(page, 'lista-zombie-stany');
      },
    }),

    shot({
      // wszystkie znaczniki naraz: głód, zimno, rana, ugryzienie, sen, warta, wyprawa, praca przy stole badań
      name: 'lista-stany',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        await dolozOsoby(page, 4);
        const id = await chipy(page);
        const praca = (t: string) =>
          `p.job = { t: '${t}', target: 0, phase: 1, from: -1, t0: st.tick, until: st.tick + 99999, order: false };`;
        await ustaw(page, id[0], 'p.needs.food = 20; p.needs.warm = 30; p.needs.health = 40;');
        await ustaw(page, id[1], 'p.bite = st.tick - 400; p.needs.health = 15;');
        await ustaw(page, id[2], praca('guard'));
        await ustaw(page, id[3], praca('sleep'));
        await ustaw(page, id[4], praca('research'));
        await ustaw(page, id[5], 'p.away = true;');
        await ustaw(page, id[6], 'p.needs.food = 5; p.needs.warm = 5; p.needs.health = 5;');
        await page.waitForTimeout(500);
        const wszystkie = await page.$$eval('#lista .mk', (l) => [
          ...new Set(l.map((e) => e.className.match(/mk-([a-z]+)/)?.[1])),
        ]);
        console.log(`  znaczniki na liście: ${wszystkie.join(', ')}`);
        for (const r of ['ugryzienie', 'rana', 'glod', 'zimno', 'wyprawa', 'warta', 'badania'])
          if (!wszystkie.includes(r)) throw new Error(`brak znacznika „${r}”`);
        await bezNaruszen(page, 'wszystkie znaczniki');
        await zrzut(page, 'lista-stany-pl');
        await page.click(`#lista .lp[data-pawn="${id[1]}"]`);
        await page.waitForTimeout(400);
      },
    }),

    shot({
      // kliknięcie zaznacza i wiezie kamerę do osoby; drugie kliknięcie prowadzi kamerę za nią, trzecie (i przeciągnięcie
      // mapy) kończy; kliknięcie ze Shiftem dokłada do zaznaczenia bez ruszania kamery
      name: 'lista-klik',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        const id = await chipy(page);
        const cel = id[3];
        const chip = `#lista .lp[data-pawn="${cel}"]`;
        const przed = await kamera(page);
        await page.click(chip);
        await page.waitForTimeout(1800);
        const p = await pozycja(page, cel);
        const po = await kamera(page);
        const odleglosc = Math.hypot(po.x - p.x, po.y - p.y + 0.4) * TILE;
        console.log(
          `  kamera ${przed.x.toFixed(1)},${przed.y.toFixed(1)} → ${po.x.toFixed(1)},${po.y.toFixed(1)}, osoba ${p.x.toFixed(1)},${p.y.toFixed(1)}, ${odleglosc.toFixed(1)} px od środka`,
        );
        if (odleglosc > 6) throw new Error(`kamera nie dojechała do osoby (${odleglosc.toFixed(1)} px)`);
        if (Math.abs(po.zoom - przed.zoom) > 1e-6) throw new Error('kamera zmieniła przybliżenie');
        if ((await zaznaczone(page)).join() !== String(cel)) throw new Error('klik nie zaznaczył osoby');
        if (await page.$(`${chip}[data-sledzi]`)) throw new Error('pierwszy klik włączył śledzenie');
        // drugie kliknięcie: śledzenie. Osoba odchodzi o 12 kafelków, kamera jedzie za nią
        await page.click(chip);
        await page.waitForTimeout(250);
        if (!(await page.$(`${chip}[data-sledzi]`))) throw new Error('drugie kliknięcie nie włączyło śledzenia');
        await page.evaluate(
          ([id2]) => {
            const p2 = window.zm!.sim!.st.pawns.find((q) => q.id === id2)!;
            p2.x += 12;
            p2.y -= 5;
          },
          [cel] as const,
        );
        await page.waitForTimeout(1800);
        const p2 = await pozycja(page, cel);
        const k2 = await kamera(page);
        const d2 = Math.hypot(k2.x - p2.x, k2.y - p2.y + 0.4) * TILE;
        console.log(
          `  śledzenie: kamera ${k2.x.toFixed(1)},${k2.y.toFixed(1)}, osoba ${p2.x.toFixed(1)},${p2.y.toFixed(1)}, ${d2.toFixed(1)} px`,
        );
        if (d2 > 6) throw new Error(`kamera nie poszła za osobą (${d2.toFixed(1)} px)`);
        await zrzut(page, 'lista-klik-sledzenie');
        // przybliżenie kółkiem w trakcie śledzenia go nie przerywa: kamera wraca do osoby
        const zoom0 = (await kamera(page)).zoom;
        await page.mouse.move(900, 520);
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(1200);
        const kz = await kamera(page);
        const pz = await pozycja(page, cel);
        console.log(
          `  zoom kółkiem: ${zoom0.toFixed(2)} → ${kz.zoom.toFixed(2)}, ${(Math.hypot(kz.x - pz.x, kz.y - pz.y + 0.4) * TILE).toFixed(1)} px od osoby`,
        );
        if (kz.zoom - zoom0 < 0.1) throw new Error('kółko nie przybliżyło');
        if (!(await page.$(`${chip}[data-sledzi]`))) throw new Error('zoom kółkiem przerwał śledzenie');
        if (Math.hypot(kz.x - pz.x, kz.y - pz.y + 0.4) * TILE > 6)
          throw new Error('po zoomie kamera nie wróciła do osoby');
        // WASD kończy śledzenie
        await page.keyboard.down('d');
        await page.waitForTimeout(250);
        await page.keyboard.up('d');
        await page.waitForTimeout(250);
        if (await page.$(`${chip}[data-sledzi]`)) throw new Error('klawisz D nie przerwał śledzenia');
        await page.click(chip);
        await page.waitForTimeout(300);
        if (!(await page.$(`${chip}[data-sledzi]`)))
          throw new Error('klik po przerwaniu nie włączył śledzenia od nowa');
        // przeciągnięcie mapy kończy śledzenie
        await page.mouse.move(400, 360);
        await page.mouse.down();
        await page.mouse.move(520, 380, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        if (await page.$(`${chip}[data-sledzi]`)) throw new Error('przeciągnięcie mapy nie przerwało śledzenia');
        const k3 = await kamera(page);
        await page.evaluate(
          ([id2]) => {
            window.zm!.sim!.st.pawns.find((q) => q.id === id2)!.x += 6;
          },
          [cel] as const,
        );
        await page.waitForTimeout(700);
        const k4 = await kamera(page);
        if (Math.hypot(k4.x - k3.x, k4.y - k3.y) > 0.01)
          throw new Error('kamera dalej idzie za osobą po przeciągnięciu');
        // klik w inną osobę: kamera jedzie do niej, śledzenie wyłączone
        await page.click(`#lista .lp[data-pawn="${id[0]}"]`);
        await page.waitForTimeout(1800);
        const p5 = await pozycja(page, id[0]);
        const k5 = await kamera(page);
        if (Math.hypot(k5.x - p5.x, k5.y - p5.y + 0.4) * TILE > 6)
          throw new Error('kamera nie dojechała do drugiej osoby');
        // Shift: dokłada drugą osobę, karta mówi o dwóch, kamera stoi
        await page.click(`#lista .lp[data-pawn="${id[1]}"]`, { modifiers: ['Shift'] });
        await page.waitForTimeout(400);
        const k6 = await kamera(page);
        if (Math.hypot(k6.x - k5.x, k6.y - k5.y) > 0.01) throw new Error('Shift+klik ruszył kamerą');
        if ((await zaznaczone(page)).length !== 2)
          throw new Error(`po Shift+klik zaznaczonych ${(await zaznaczone(page)).length}`);
        const karta = await nazwaNaKarcie(page);
        if (!/^(Zaznaczeni|Selected)/.test(karta ?? '')) throw new Error(`karta grupy: „${karta}”`);
        await bezNaruszen(page, 'po Shift+klik');
        // Esc czyści zaznaczenie, a lista je odzwierciedla
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        if ((await zaznaczone(page)).length) throw new Error('po Esc chipy dalej są zaznaczone');
      },
    }),

    shot({
      // klawisze E (następna osoba) i Q (poprzednia): zawijanie, pomijanie wyprawy, ignorowanie z Ctrl i Cmd, a po
      // jednym klawiszu karta i kamera są przy tej osobie
      name: 'lista-klawisz',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        const id = await chipy(page);
        const wybrany = async () => (await zaznaczone(page)).join();
        await page.keyboard.press('e');
        await page.waitForTimeout(300);
        if ((await wybrany()) !== String(id[0]))
          throw new Error(`E bez zaznaczenia: ${await wybrany()} zamiast ${id[0]}`);
        await page.keyboard.press('e');
        await page.waitForTimeout(300);
        if ((await wybrany()) !== String(id[1])) throw new Error(`E: ${await wybrany()} zamiast ${id[1]}`);
        await page.keyboard.press('q');
        await page.keyboard.press('q');
        await page.waitForTimeout(300);
        if ((await wybrany()) !== String(id[3]))
          throw new Error(`dwa razy Q (zawinięcie): ${await wybrany()} zamiast ${id[3]}`);
        // Ctrl i Cmd z E to skróty przeglądarki, nie gry
        await page.keyboard.press('Control+e');
        await page.keyboard.press('Meta+e');
        await page.waitForTimeout(300);
        if ((await wybrany()) !== String(id[3])) throw new Error('Ctrl+E albo Cmd+E przełączyło osobę');
        // trzecia osoba na wyprawie: E ją pomija
        await ustaw(page, id[0], 'p.away = true;');
        await page.waitForTimeout(450);
        await page.keyboard.press('e');
        await page.waitForTimeout(300);
        if ((await wybrany()) !== String(id[1]))
          throw new Error(`E pominęło wyprawę źle: ${await wybrany()} zamiast ${id[1]}`);
        await page.waitForTimeout(1800);
        const p = await pozycja(page, id[1]);
        const k = await kamera(page);
        if (Math.hypot(k.x - p.x, k.y - p.y + 0.4) * TILE > 6) throw new Error('po E kamera nie jest przy osobie');
        if ((await nazwaNaKarcie(page)) === null) throw new Error('po E nie ma karty osoby');
        await bezNaruszen(page, 'po przełączaniu klawiszem');
      },
    }),

    shot({
      // osoba na wyprawie: chip przygaszony, klik pokazuje jej kartę i nie rusza kamery (nie ma jej na mapie)
      name: 'lista-wyprawa',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        const id = await chipy(page);
        await ustaw(page, id[2], 'p.away = true;');
        await page.waitForTimeout(450);
        if (!(await page.$(`#lista .lp[data-pawn="${id[2]}"][data-poza]`)))
          throw new Error('chip osoby na wyprawie bez data-poza');
        const przed = await kamera(page);
        await page.click(`#lista .lp[data-pawn="${id[2]}"]`);
        await page.waitForTimeout(1200);
        const po = await kamera(page);
        if (Math.hypot(po.x - przed.x, po.y - przed.y) > 0.01)
          throw new Error('kamera ruszyła do osoby, której nie ma na mapie');
        if ((await zaznaczone(page)).join() !== String(id[2])) throw new Error('klik nie zaznaczył osoby na wyprawie');
        if (!(await nazwaNaKarcie(page))) throw new Error('brak karty osoby na wyprawie');
        // drugie kliknięcie nic nie włącza
        await page.click(`#lista .lp[data-pawn="${id[2]}"]`);
        await page.waitForTimeout(300);
        if (await page.$('#lista .lp[data-sledzi]')) throw new Error('śledzenie osoby spoza mapy');
        await zrzut(page, 'lista-wyprawa');
      },
    }),

    ...[
      { w: 1024, h: 768, touch: false },
      { w: 390, h: 844, touch: true },
    ].map(({ w, h, touch }) =>
      shot({
        // dłuższy zarząd (dwanaście osób, a gra pozwala dziś na pięć, przybysze mogą dołożyć więcej): chipy zawijają się
        // w kolejne rzędy w obrębie okna, bez nachodzenia na cokolwiek
        name: `lista-wielu-${w}`,
        query: '',
        w,
        h,
        touch,
        run: async (page, base) => {
          await start(page, base);
          await dolozOsoby(page, 8);
          const n = await page.locator('#lista .lp').count();
          if (n !== 12) throw new Error(`${n} chipów zamiast 12`);
          await bezNaruszen(page, `${w}×${h} dwanaście osób`);
          await kliknij(page, `#lista li:last-child .lp`, touch);
          await page.waitForTimeout(500);
          await bezNaruszen(page, `${w}×${h} dwanaście osób, ostatnia zaznaczona`);
          await zrzut(page, `lista-wielu-${w}`);
        },
      }),
    ),

    shot({
      // przybysze idą od bramy: komunikat „Pokaż” stoi pod paskiem, lista schodzi pod niego
      name: 'lista-przybysze',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        await page.evaluate(() => window.zm!.admit(3));
        await page.waitForSelector('#arrive:not([hidden])');
        await page.waitForTimeout(500);
        await bezNaruszen(page, 'z komunikatem o przybyszach');
        await zrzut(page, 'lista-przybysze');
      },
    }),

    shot({
      // panel budowy po prawej (310 px): lista kończy się przed nim i przed przyciskami przybliżenia, które się odsuwają
      name: 'lista-budowa',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        await dolozOsoby(page, 3);
        await page.keyboard.press('b');
        await page.waitForSelector('#buildPanel .tile');
        await page.waitForTimeout(400);
        await bezNaruszen(page, 'z panelem budowy');
        await zrzut(page, 'lista-budowa');
      },
    }),

    shot({
      // dom jednorodzinny (Zielonki, słowa „komitet ulicy”) ma inny pasek i cele: lista dalej nie nachodzi na nic
      name: 'lista-dom',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base, 'demo=zielonki&speed=0&cam=hq,1.3');
        await bezNaruszen(page, 'Zielonki 1280×720');
        const [id] = await chipy(page);
        await page.click(`#lista .lp[data-pawn="${id}"]`);
        await page.waitForTimeout(500);
        await bezNaruszen(page, 'Zielonki z kartą osoby');
        await zrzut(page, 'lista-dom');
      },
    }),

    shot({
      // okna węższe niż komputer i szersze niż telefon (tablet pionowo 768, granica układu telefonu 641 i 640): lista
      // zawsze w oknie i bez nachodzenia; układ telefonu zaczyna się od 640 px
      name: 'lista-waskie',
      query: '',
      w: 768,
      h: 1024,
      run: async (page, base) => {
        await start(page, base);
        for (const [w, h] of [
          [768, 1024],
          [700, 900],
          [641, 900],
          [640, 900],
          [360, 740],
        ] as const) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(500);
          await bezNaruszen(page, `${w}×${h}`);
        }
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(400);
        await zrzut(page, 'lista-waskie');
      },
    }),

    shot({
      // cele dnia znikają po drugiej nocy: lista ludzi sięga wtedy lewej krawędzi (8 px), jak pasek u góry
      name: 'lista-bez-celow',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        const lewy = await page.evaluate(() => {
          const g = document.getElementById('goals')!;
          const l = document.getElementById('lista')!;
          const z = getComputedStyle(l).left;
          g.hidden = true;
          const bez = getComputedStyle(l).left;
          g.hidden = false;
          return { z, bez };
        });
        console.log(`  lewy brzeg listy: z celami ${lewy.z}, bez nich ${lewy.bez}`);
        if (lewy.z !== '316px' || lewy.bez !== '8px') throw new Error(`lewy brzeg listy: ${JSON.stringify(lewy)}`);
      },
    }),

    shot({
      // zmiana języka w trakcie gry przerysowuje podpowiedzi chipów i nazwę grupy, a stan listy (zaznaczenie) zostaje
      name: 'lista-jezyk',
      query: '',
      w: 1280,
      h: 720,
      run: async (page, base) => {
        await start(page, base);
        const [id] = await chipy(page);
        await ustaw(page, id, 'p.needs.food = 10;');
        await page.click(`#lista .lp[data-pawn="${id}"]`);
        await page.waitForTimeout(450);
        const tytul = () => page.$eval(`#lista .lp[data-pawn="${id}"]`, (e) => (e as HTMLElement).title);
        if (!/Głodny|Głodna/.test(await tytul())) throw new Error(`po polsku: ${await tytul()}`);
        await page.evaluate(async () => {
          // ten sam moduł, który zna gra (singleton po adresie z serwera Vite); specyfikator w zmiennej, żeby tsc go nie szukał
          const adres = '/src/core/jezyk.ts';
          const m = await import(/* @vite-ignore */ adres);
          m.ustawJezyk('en');
        });
        await page.waitForTimeout(300);
        if (!/Hungry \(Fed 10\)/.test(await tytul())) throw new Error(`po angielsku: ${await tytul()}`);
        if ((await zaznaczone(page)).join() !== String(id)) throw new Error('zmiana języka zgubiła zaznaczenie');
      },
    }),
  ];
}
