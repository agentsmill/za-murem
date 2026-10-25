/* Zrzuty i sprawdzenia osady AI w grze (src/ui/osada.ts, ?osada=1) do `npm run shots` (scenariusze osada-*), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3). Każdy scenariusz sprawdza stan osady przez `window.zm.osada()`
   (stan, klucz kwadratu, skrót gry, tick osady, liczniki błędów i zawieszonych okien) razem z naszym tickiem, odczytane w jednym
   wywołaniu `page.evaluate`, więc pomiędzy nimi nie przeskakuje żadna klatka:
   - `osada-start`: demo Przymorze z `?osada=1`, przewinięcie do 7:00 drugiego dnia (`przewin`, samouczek i odpowiedzi na okna
     zarządu): przed startem osada czeka, o 6:00 powstaje, tick osady równa się naszemu, zero błędów i zawieszonych okien, osada
     nieodkryta; zapis i „Kontynuuj” z adresem bez `osada=1` (zapis wygrywa z adresem) przywracają tę samą osadę z tym samym skrótem;
   - `osada-8x`: tempo 8× przez 30 s przy ekranie przez 6:00 drugiego dnia (start osady w pętli klatek), z celowym zawieszeniem wątku
     głównego na pół sekundy (pętla ścina zaległość): w każdej próbce tick osady równa się naszemu; do dziennika najdłuższa klatka
     (nadrabianie 12000 kroków osady jest jednorazową kropką w klatce startu);
   - `osada-adres`: adres spoza dem (Lanciego z danych testowych) z działającymi kafelkami: osiem sąsiednich kwadratów z kafelków w tle
     (`geoKwadratu`, `pobierzKandydatow`), po 6:00 drugiego dnia osada jest, bez ostrzeżeń, a jej geo z kafelków siedzi w zapisie;
   - `osada-bez-sieci`: adres spoza dem (Lanciego z danych testowych), ale kafelki sąsiednich kwadratów nie przychodzą (`fetch`
     rzuca po wczytaniu domu): gra startuje i idzie, o 6:00 drugiego dnia osada ma stan `brak` z powodem `dane`, w konsoli
     najwyżej jedno ostrzeżenie o osadzie, żadnego błędu; `osada-wolna-siec`: te kafelki wiszą bez końca (przerwane dopiero
     limitem pobierania, 20 s na kafelek): start gry i pętla na nie nie czekają, o 6:00 drugiego dnia `brak` z powodem `dane`;
   - `osada-zombie`: tryb zombie z flagą od razu nie ma osady (`brak`, powód `regula`), pole `osada` jest w zapisie;
   - `osada-bez-flagi`: gra bez `?osada=1`: `zm.osada()` to null, zapis bez pola `osada`, o 6:00 drugiego dnia nic się nie dzieje.
   Zrzut na końcu każdego scenariusza to zwykła gra (osada w etapie 2 niczego nie rysuje: jej kwadrat pokazuje zadanie 5), po nim
   ogląda się, że gra wygląda jak zawsze (atrybucja mapy, brak plam po błędzie). */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ADDRESSES } from '../tests/unit/fixtures.ts';
import { waitIdle } from './browser.ts';
import { GRA, przewin, type ShotCele } from './shots-cele.ts';

/** katalog kafelków testowych i TileJSON (jak w tools/shots.ts) */
const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/mvt');
const SAVE = 'za-murem-0.4-zapis';

/** minuta gry od początku dnia 1 (0:00) dla dnia i godziny */
const minutaGry = (dzien: number, godz: number, min = 0): number => (dzien - 1) * 1440 + godz * 60 + min;

/** odczyt osady i naszego ticka w jednym wywołaniu */
interface Odczyt {
  osada: ReturnType<NonNullable<typeof window.zm>['osada']>;
  nasz: number;
}
const odczyt = (page: Page): Promise<Odczyt> =>
  page.evaluate(() => ({ osada: window.zm!.osada(), nasz: window.zm!.sim!.st.tick }));

/** samouczek bez klikania (jak w shots-cele.ts): pierwszy z zarządu ścina suche drzewo */
async function chopDryTree(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    const who = sim.st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'select', ids: [who.id] });
    sim.push({ t: 'chop', ids: [who.id], tree: sim.w.dryTree });
  });
}

/** zamyka otwarte okno zarządu pierwszą odpowiedzią (raport, karta nocy, uchwała bez podpisu, wydarzenie); false, gdy żadnego nie ma */
const zamknijOkno = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const m = document.getElementById('modal');
    if (!m || m.hidden) return false;
    const przycisk = m.querySelector<HTMLElement>(
      '[data-act="report-ok"], [data-act="night-go"], [data-act="law-skip"], .choices [data-act="event"]:not([disabled])',
    );
    przycisk?.click();
    return !!przycisk;
  });

/** warunek scenariusza: przerywa z opisem i stanem, który go złamał */
function wymagaj(warunek: unknown, opis: string, stan?: unknown): asserts warunek {
  if (!warunek) throw new Error(`${opis}${stan === undefined ? '' : `: ${JSON.stringify(stan)}`}`);
}

/** tick gry dla minuty gry od początku dnia 1 (gra zaczyna się o 15:00 dnia 1, godzina gry to 800 ticków) */
const tickMinuty = (minuta: number): number => Math.round(((minuta - 900) * 800) / 60);

/** Sieć podmieniona na dane testowe jak w tools/shots.ts (`offlineNetwork`): Nominatim zwraca Lanciego, kafelki z tests/fixtures. */
async function sieczLanciego(page: Page): Promise<void> {
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

/** Od chwili, w której gra prosi o tabele mieszkańców (zaraz po wczytaniu domu, przed pierwszym krokiem), każde pobranie kafelka z=14
    z OpenFreeMap jest zerwane (`zerwana`: `fetch` rzuca jak bez sieci) albo wisi aż do przerwania przez limit pobierania
    (`wisi`). Dom już się wczytał, więc to dotyczy tylko sąsiednich kwadratów osady. Podmiana `fetch` w stronie, a nie `route.abort`,
    bo przerwane żądanie Chromium opisuje w konsoli jako błąd, a bez sieci gra ma milczeć. */
async function sasiedziBezSieci(page: Page, tryb: 'zerwana' | 'wisi'): Promise<void> {
  await page.addInitScript((t) => {
    const oryginal = window.fetch.bind(window);
    let domGotowy = false;
    window.fetch = (wejscie: RequestInfo | URL, init?: RequestInit) => {
      const adres = typeof wejscie === 'string' ? wejscie : wejscie instanceof URL ? wejscie.href : wejscie.url;
      if (adres.includes('data/mieszkancy/')) domGotowy = true;
      if (domGotowy && /tiles\.openfreemap\.org\/planet\/.+\/14\/\d+\/\d+\.pbf/.test(adres)) {
        if (t === 'zerwana') return Promise.reject(new TypeError('Failed to fetch'));
        return new Promise<Response>((_, odrzuc) => {
          init?.signal?.addEventListener('abort', () =>
            odrzuc(new DOMException('The operation was aborted.', 'AbortError')),
          );
        });
      }
      return oryginal(wejscie, init);
    };
  }, tryb);
}

/** liczy ostrzeżenia konsoli o osadzie (komunikaty modułu zaczynają się od „Osada AI”) */
function liczOstrzezenia(page: Page): string[] {
  const lista: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('Osada AI')) lista.push(m.text());
  });
  return lista;
}

/** Start z adresu spoza dem (Lanciego z danych testowych) i przewinięcie do 7:00 drugiego dnia; `tryb` mówi, co dzieje się z
    kafelkami sąsiednich kwadratów: `dziala` (kafelki z tests/fixtures, tam gdzie ich nie ma, pusty kafelek), `zerwana`, `wisi`.
    Zwraca ostrzeżenia o osadzie, czas od wysłania formularza do gotowej gry w ms i odczyt po przewinięciu. */
async function adresDoDrugiegoDnia(
  page: Page,
  base: string,
  tryb: 'dziala' | 'zerwana' | 'wisi',
): Promise<{ ostrzezenia: string[]; startMs: number; po: Odczyt }> {
  const ostrzezenia = liczOstrzezenia(page);
  await sieczLanciego(page);
  if (tryb !== 'dziala') await sasiedziBezSieci(page, tryb);
  await page.goto(`${base}?osada=1&speed=0`);
  await page.fill('#addr', 'Lanciego 10G, Warszawa');
  const t0 = Date.now();
  await page.click('#startForm button[type=submit]');
  await waitIdle(page);
  const startMs = Date.now() - t0;
  console.log(`  start z adresu do gotowej gry: ${startMs} ms`);
  const przed = await odczyt(page);
  wymagaj(przed.osada?.stan === 'czeka', 'tuż po starcie osada ma czekać', przed.osada);
  await chopDryTree(page);
  await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
  return { ostrzezenia, startMs, po: await odczyt(page) };
}

export function osadaShots(): ShotCele[] {
  return [
    {
      name: 'osada-start',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        const start = await odczyt(page);
        wymagaj(start.osada?.stan === 'czeka', 'tuż po starcie osada ma czekać', start.osada);
        wymagaj(start.osada.bledowRazem === undefined, 'czekająca osada nie ma liczników gry', start.osada);
        await chopDryTree(page);
        // do 5:30 drugiego dnia: osada nadal czeka
        await przewin(page, (teraz) => teraz >= minutaGry(2, 5, 30), { dotyk: false });
        const przed = await odczyt(page);
        wymagaj(przed.osada?.stan === 'czeka', 'przed 6:00 drugiego dnia osada ma czekać', przed);
        // do 7:00: osada powstała w ticku startu i idzie krok w krok
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        const po = await odczyt(page);
        console.log(
          `  o 7:00 drugiego dnia: ${JSON.stringify({ ...po.osada, skrot: po.osada?.skrot })}, nasz tick ${po.nasz}`,
        );
        wymagaj(po.osada?.stan === 'jest', 'o 7:00 drugiego dnia osada ma być', po);
        wymagaj(po.osada.tick === po.nasz, 'tick osady ma równać się naszemu', po);
        wymagaj(/^-?\d+,-?\d+$/.test(po.osada.klucz ?? ''), 'klucz kwadratu osady', po.osada);
        wymagaj(
          po.osada.bledowRazem === 0 && po.osada.zawieszonychRazem === 0,
          'zwykła gra osady bez błędów i zawieszeń',
          po.osada,
        );
        wymagaj(po.osada.odkryta === false, 'osada nieodkryta przed pierwszym kontaktem', po.osada);
        wymagaj(po.osada.odwolania === 0 && po.osada.upadla === undefined, 'osada żyje od startu', po.osada);

        // krok zarządu na żądanie (`govTick`) nie przesuwa czasu symulacji, więc nie rusza też osady
        for (let k = 0; k < 3; k++) {
          await page.evaluate(() => window.zm!.govTick());
          while (await zamknijOkno(page)) {
            /* okna zarządu, które otworzył krok */
          }
        }
        const poKrokuZarzadu = await odczyt(page);
        wymagaj(poKrokuZarzadu.nasz === po.nasz, 'govTick nie przesuwa naszego ticka', [po.nasz, poKrokuZarzadu.nasz]);
        wymagaj(poKrokuZarzadu.osada?.tick === po.nasz, 'govTick nie przesuwa ticka osady', poKrokuZarzadu.osada);

        // zapis przez grę i „Kontynuuj” z adresem bez ?osada=1: zapis wygrywa z adresem, osada wraca z tym samym skrótem
        const zapisano = await page.evaluate(() => window.zm!.save());
        wymagaj(zapisano, 'zapis gry się nie udał');
        const wZapisie = await page.evaluate((k) => {
          const s = JSON.parse(localStorage.getItem(k) ?? 'null');
          return (
            s && {
              osada: s.osada?.stan,
              odkryta: s.osada?.odkryta,
              klucz: s.osada?.klucz,
              znaki: localStorage.getItem(k)!.length,
            }
          );
        }, SAVE);
        console.log(`  zapis: ${JSON.stringify(wZapisie)}`);
        wymagaj(
          wZapisie?.osada === 'jest' && wZapisie.klucz === po.osada.klucz,
          'zapis ma osadę „jest” z tym samym kwadratem',
          wZapisie,
        );
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        const wczytana = await odczyt(page);
        wymagaj(wczytana.osada?.stan === 'jest', 'po „Kontynuuj” osada ma być', wczytana);
        wymagaj(wczytana.osada.klucz === po.osada.klucz, 'ten sam kwadrat po wczytaniu', wczytana.osada);
        wymagaj(wczytana.osada.tick === wczytana.nasz, 'po wczytaniu ticki równe', wczytana);
        wymagaj(wczytana.nasz >= po.nasz, 'wczytana gra nie cofa się', wczytana);
        if (wczytana.nasz === po.nasz)
          wymagaj(wczytana.osada.skrot === po.osada.skrot, 'ten tick, ten skrót gry osady po wczytaniu', [
            po.osada.skrot,
            wczytana.osada.skrot,
          ]);
        // kilka godzin gry po wczytaniu: dalej krok w krok, bez błędów
        const ff = await page.evaluate(() => window.zm!.ff(120));
        console.log(`  po wczytaniu i dwóch godzinach gry: okno ${ff}`);
        const dalej = await odczyt(page);
        wymagaj(dalej.osada?.tick === dalej.nasz, 'po przewinięciu ticki nadal równe', dalej);
        wymagaj(dalej.osada.bledowRazem === 0, 'po wczytaniu osada bez błędów', dalej.osada);
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      name: 'osada-8x',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&osada=1&speed=0&cam=hq,1`);
        await waitIdle(page);
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 3, 30), { dotyk: false });
        const przed = await odczyt(page);
        wymagaj(przed.osada?.stan === 'czeka', 'o 3:30 drugiego dnia osada ma czekać', przed.osada);
        // klatki dłuższe niż 100 ms od teraz (rAF mierzy odstępy między klatkami): długość i nasz tick w chwili zapisu
        await page.evaluate(() => {
          const w = window as unknown as { __zmKlatki: { ost: number; duze: [number, number][] } };
          w.__zmKlatki = { ost: performance.now(), duze: [] };
          const krok = (t: number) => {
            const przerwa = t - w.__zmKlatki.ost;
            if (przerwa > 100) w.__zmKlatki.duze.push([Math.round(przerwa), window.zm!.sim!.st.tick]);
            w.__zmKlatki.ost = t;
            requestAnimationFrame(krok);
          };
          requestAnimationFrame(krok);
        });
        await page.click('#speed [data-s="4"]');
        wymagaj((await page.evaluate(() => window.zm!.speed())) === 4, 'tempo 8×');
        let jank = false;
        let probek = 0;
        let rozjazd: unknown = null;
        const od = Date.now();
        while (Date.now() - od < 30_000) {
          await zamknijOkno(page);
          const o = await odczyt(page);
          if (o.osada?.stan === 'jest') {
            probek++;
            if (o.osada.tick !== o.nasz) rozjazd ??= o;
            if (!jank) {
              jank = true;
              // wątek główny stoi pół sekundy: pętla klatek ścina zaległość, ale obie gry mają tyle samo kroków
              await page.evaluate(() => {
                const t = performance.now();
                while (performance.now() - t < 500) {
                  /* zawieszenie wątku */
                }
              });
              const po = await odczyt(page);
              if (po.osada?.stan === 'jest' && po.osada.tick !== po.nasz) rozjazd ??= po;
            }
          }
          await page.waitForTimeout(250);
        }
        const koniec = await odczyt(page);
        const duze = await page.evaluate(
          () => (window as unknown as { __zmKlatki: { duze: [number, number][] } }).__zmKlatki.duze,
        );
        console.log(
          `  próbek z osadą ${probek}, nasz tick ${koniec.nasz}, osada ${koniec.osada?.tick}; klatki ponad 100 ms (długość ms, nasz tick): ${duze.map(([ms, t]) => `${ms} ms przy ${t}`).join('; ') || 'brak'}`,
        );
        wymagaj(rozjazd === null, 'ticki osady i naszej gry rozeszły się', rozjazd);
        wymagaj(probek >= 20, 'za mało próbek z osadą', probek);
        wymagaj(koniec.osada?.stan === 'jest' && koniec.osada.tick === koniec.nasz, 'na końcu ticki równe', koniec);
        wymagaj(
          koniec.osada.bledowRazem === 0 && koniec.osada.zawieszonychRazem === 0,
          'osada bez błędów i zawieszeń',
          koniec.osada,
        );
        wymagaj(koniec.nasz > tickMinuty(minutaGry(2, 7)), 'gra przeszła 7:00 drugiego dnia w tempie 8×', koniec.nasz);
        await page.click('#speed [data-s="0"]');
      },
    },
    {
      name: 'osada-adres',
      query: '',
      run: async (page, base) => {
        const { ostrzezenia, po } = await adresDoDrugiegoDnia(page, base, 'dziala');
        console.log(`  o 7:00 drugiego dnia: ${JSON.stringify(po.osada)}, nasz tick ${po.nasz}`);
        // prawdziwa droga adresu: osiem kwadratów z kafelków w tle, wybór po komplecie, osada z geo zbudowanego w przeglądarce
        wymagaj(po.osada?.stan === 'jest', 'adres spoza dem: sąsiedzi z kafelków dają osadę', po.osada);
        wymagaj(po.osada.tick === po.nasz, 'ticki równe', po);
        wymagaj(po.osada.bledowRazem === 0 && po.osada.zawieszonychRazem === 0, 'osada bez błędów', po.osada);
        wymagaj(ostrzezenia.length === 0, 'kafelki przyszły, więc bez ostrzeżeń', ostrzezenia);
        const zapis = await page.evaluate((k) => {
          window.zm!.save();
          const o = JSON.parse(localStorage.getItem(k) ?? 'null')?.osada;
          return o && { stan: o.stan, klucz: o.klucz, budynkow: o.geo?.b?.length, miejsc: o.geo?.poi?.length };
        }, SAVE);
        console.log(`  zapis osady: ${JSON.stringify(zapis)}`);
        wymagaj(zapis?.stan === 'jest' && zapis.budynkow > 0, 'zapis ma geo kwadratu z kafelków', zapis);
      },
    },
    {
      name: 'osada-bez-sieci',
      query: '',
      run: async (page, base) => {
        const { ostrzezenia, po } = await adresDoDrugiegoDnia(page, base, 'zerwana');
        console.log(`  o 7:00 drugiego dnia: ${JSON.stringify(po.osada)}, ostrzeżeń o osadzie: ${ostrzezenia.length}`);
        wymagaj(
          po.osada?.stan === 'brak' && po.osada.powod === 'dane',
          'bez kafelków sąsiadów osady nie ma (brak, dane)',
          po.osada,
        );
        wymagaj(ostrzezenia.length <= 1, 'w konsoli najwyżej jedno ostrzeżenie o osadzie', ostrzezenia);
        wymagaj(
          ostrzezenia.length === 1,
          'pobrania sąsiadów padły, więc jest dokładnie jedno ostrzeżenie',
          ostrzezenia,
        );
        const zapis = await page.evaluate((k) => {
          window.zm!.save();
          return JSON.parse(localStorage.getItem(k) ?? 'null')?.osada;
        }, SAVE);
        wymagaj(zapis?.stan === 'brak' && zapis.powod === 'dane', 'zapis ma osadę „brak, dane”', zapis);
      },
    },
    {
      name: 'osada-wolna-siec',
      query: '',
      run: async (page, base) => {
        const { ostrzezenia, startMs, po } = await adresDoDrugiegoDnia(page, base, 'wisi');
        console.log(`  o 7:00 drugiego dnia: ${JSON.stringify(po.osada)}, ostrzeżeń o osadzie: ${ostrzezenia.length}`);
        wymagaj(
          po.osada?.stan === 'brak' && po.osada.powod === 'dane',
          'z wiszącymi pobraniami osady nie ma (brak, dane)',
          po.osada,
        );
        // start gry nie czekał na wiszące pobrania sąsiadów (limit pobrania kafelka to 20 s)
        wymagaj(startMs < 15_000, 'start gry czekał na pobieranie sąsiadów', startMs);
        wymagaj(ostrzezenia.length === 0, 'pobieranie jeszcze trwa, więc bez ostrzeżeń', ostrzezenia);
      },
    },
    {
      name: 'osada-zombie',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&tryb=zombie&osada=1&${GRA}`);
        await waitIdle(page);
        const o = await odczyt(page);
        wymagaj(
          o.osada?.stan === 'brak' && o.osada.powod === 'regula',
          'w trybie zombie osady nie ma (brak, regula)',
          o.osada,
        );
        await page.evaluate(() => window.zm!.save());
        const zapis = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.osada, SAVE);
        wymagaj(zapis?.stan === 'brak' && zapis.powod === 'regula', 'zapis pamięta, że zaczęto z flagą', zapis);
        const ff = await page.evaluate(() => window.zm!.ff(60));
        console.log(`  po godzinie gry: okno ${ff}`);
        wymagaj((await odczyt(page)).osada?.stan === 'brak', 'osada dalej bez gry');
      },
    },
    {
      name: 'osada-bez-flagi',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&${GRA}`);
        await waitIdle(page);
        wymagaj((await page.evaluate(() => window.zm!.osada())) === null, 'bez flagi zm.osada() to null');
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        wymagaj((await page.evaluate(() => window.zm!.osada())) === null, 'o 7:00 drugiego dnia nadal null');
        await page.evaluate(() => window.zm!.save());
        const tekst = await page.evaluate((k) => localStorage.getItem(k) ?? '', SAVE);
        wymagaj(tekst.length > 0, 'gra zapisała się');
        wymagaj(!tekst.includes('"osada"'), 'zapis bez flagi nie ma pola osada');
        wymagaj(ostrzezenia.length === 0, 'gra bez flagi nie mówi nic o osadzie', ostrzezenia);
        console.log(`  zapis bez flagi: ${tekst.length} znaków, bez pola osada`);
      },
    },
  ];
}
