/* Zrzuty i sprawdzenia osady AI w grze (src/ui/osada.ts, ?osada=1) do `npm run shots` (scenariusze osada-*), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3). Każdy scenariusz sprawdza stan osady przez `window.zm.osada()`
   (stan, klucz kwadratu, skrót gry, tick osady, liczniki błędów i zawieszonych okien) razem z naszym tickiem, odczytane w jednym
   wywołaniu `page.evaluate`, więc pomiędzy nimi nie przeskakuje żadna klatka:
   - `osada-start`: demo Przymorze z `?osada=1`, przewinięcie do 7:00 drugiego dnia (`przewin`, samouczek i odpowiedzi na okna
     zarządu): przed startem osada czeka, o 6:00 powstaje, tick osady równa się naszemu, zero błędów i zawieszonych okien, osada
     nieodkryta; zapis i „Kontynuuj” z adresem bez `osada=1` (zapis wygrywa z adresem) przywracają tę samą osadę z tym samym skrótem;
   - `osada-8x`: tempo 8× przy ekranie przez 6:00 drugiego dnia (start osady w pętli klatek; do 7:00 i 30 próbek, najwyżej 2 minuty), z celowym zawieszeniem wątku
     głównego na pół sekundy: pętla klatek ścina wtedy `dt` do 100 ms, więc nadrabia najwyżej kilkanaście kroków na klatkę (do gałęzi
     `acc = 0` przy 40 krokach nie dochodzi, osiągnąć jej się przy ≤ 8× nie da). W każdej próbce tick osady równa się naszemu; do
     dziennika klatki ponad 100 ms;
   - `osada-nadrabianie`: demo Przymorze od 3:00 drugiego dnia w tempie 8× do 7:00: nadrabianie gry osady idzie po kawałku na klatkę
     (postęp `przygotowanie.tick` rośnie w kilku próbkach, osada `czeka` do 6:00 i jest gotowa przed startem), a żadna klatka
     przed 6:00 ani w chwili startu nie trwa dłużej niż 33 ms, liczone dwojako: praca tyknięcia gry (`frame()` z rysowaniem,
     mierzona w tickerze PixiJS) i odstęp od początku jednej klatki do początku następnej (zegar); do dziennika najdłuższe klatki
     z osadą i ta sama próba bez osady (szum tej maszyny), klatka, w której osada powstaje, i czas startu gry z osadą i bez;
   - `osada-zapis-w-przygotowaniu`: zapis w połowie nadrabiania daje samo `czeka`, „Kontynuuj” zaczyna przygotowanie od nowa, a osada
     o 7:00 ma ten sam skrót gry co osada z Node, nadrabiająca naraz w ticku startu (to samo sprawdza koniec `osada-nadrabianie`);
   - `osada-siec`: nowa gra z `?osada=1` i `?siec=1` nie dostaje osady (`zm.osada()` to null), w konsoli jedno ostrzeżenie o tym, a
     zapis nie ma pola `osada`;
   - `osada-modul-blad`: plik z kodem osady jest zablokowany: nowa gra z `?osada=1` rusza bez niej (`brak`, powód `blad`, jedno
     ostrzeżenie, zapis z tym stanem), a „Kontynuuj” z zapisem, w którym osada jest, kończy się dotychczasowym komunikatem błędu
     wczytania (gra się nie zaczyna); po odblokowaniu ten sam zapis wczytuje się;
   - `osada-adres-klatki`: adres spoza dem (Lanciego z danych testowych): przygotowanie osady idzie w grze, w tle po starcie, więc jej
     niepodzielne kroki (wybór kwadratu, budowa gry, rozgrzewka) są po jednej dłuższej klatce (ok. 70, 21 i 67 ms); do dziennika
     najdłuższe klatki z fazą przygotowania, jako warunek tylko pułapy (krok niepodzielny 250 ms, klatka z kawałkiem 50 ms);
   - `osada-adres`: adres spoza dem (Lanciego z danych testowych) z działającymi kafelkami: osiem sąsiednich kwadratów z kafelków w tle
     (`geoKwadratu`, `pobierzKandydatow`), po 6:00 drugiego dnia osada jest, bez ostrzeżeń, a jej geo z kafelków siedzi w zapisie;
   - `osada-bez-sieci`: adres spoza dem (Lanciego z danych testowych), ale kafelki sąsiednich kwadratów nie przychodzą (`fetch`
     rzuca po wczytaniu domu): gra startuje i idzie, o 6:00 drugiego dnia osada ma stan `brak` z powodem `dane`, w konsoli
     najwyżej jedno ostrzeżenie o osadzie, żadnego błędu; `osada-wolna-siec`: te kafelki wiszą bez końca (przerwane dopiero
     limitem pobierania, 20 s na kafelek): start gry i pętla na nie nie czekają, o 6:00 drugiego dnia `brak` z powodem `dane`;
   - `osada-zombie`: tryb zombie z flagą od razu nie ma osady (`brak`, powód `regula`), pole `osada` jest w zapisie;
   - `osada-bez-tabel`: tabele mieszkańców niedostępne (404, gra idzie starą ścieżką): osada czeka do 6:00 drugiego dnia jak zawsze,
     o 6:00 ma `brak` z powodem `regula` (reguła miejsca wymaga bloku z mieszkańcami z generatora), a gra nie pobiera ośmiu
     sąsiednich kwadratów, których nikt by nie użył (żadnego żądania `demo/przymorze-kwadraty.json`; kontrola na tej samej stronie:
     z tabelami to żądanie jest), bez ostrzeżeń o osadzie i bez mgły po starcie, a zapis pamięta `brak, regula`;
   - `osada-bez-flagi`: gra bez `?osada=1`: `zm.osada()` to null, zapis bez pola `osada`, o 6:00 drugiego dnia nic się nie dzieje.
   Pierwszy kontakt (zadanie 4, karta „Poseł z osady …”, src/gov/kontakt.ts):
   - `osada-kontakt`: demo Przymorze po polsku na komputerze, gra przewinięta do karty posła (inne karty po drodze dostają pierwszy
     wybór): karta przychodzi w dniu kontaktu osady (4–6, z ziarna), od 9:00; tytuł, nagłówek i kierunek z gry, liczby w tekście
     (ludność i budowle) równe osadzie z Node w tym samym ticku, skrót osady w przeglądarce równy skrótowi z Node; zapis, gdy karta
     czeka, i „Kontynuuj” otwierają tę samą kartę. Zrzut na końcu to ta karta (komputer, polski);
   - `osada-kontakt-odpowiedz`: ta sama karta, wybór „Zaprosić do środka…”: osada odkryta, kontakt w stanie osady i w zapisie z liczbami
     z karty, skrót gry osady bez zmian, zaufanie +2 i wkurzenie +1, dwa wpisy w kronice; trzy doby dalej bez drugiej karty, a zapis i
     wczytanie pamiętają odkrycie;
   - `osada-kontakt-ziarna`: ziarna gry 2 i 1 (osada na północnym zachodzie z kontaktem w dniu 6 i na południowym wschodzie w dniu 5):
     karta przychodzi w tych dniach, z tym samym sprawdzeniem co w `osada-kontakt`;
   - `osada-kontakt-en`: to samo na telefonie (390×844) po angielsku: tytuł, treść i wybory bez polskich liter, okno mieści się na ekranie
     razem z przyciskami. Zrzut na końcu to ta karta (telefon, angielski);
   - `osada-kontakt-bez-flagi`: gra bez `?osada=1` przez siedem dób: żadnej karty posła w kronice, `zm.osada()` null, zapis bez osady.
   Widok ich kwadratu i karta osady (zadanie 5, src/ui/kartaOsady.ts, src/ui/osadaWidok.ts); każdy z nich sprawdza atrybucję map
   (widoczna i na wierzchu) i milczy w konsoli:
   - `osada-mgla`: przed odkryciem ośmiu sąsiadów domu pod mgłą (także po starcie osady o 6:00 drugiego dnia), `zm.osada().kwadrat`
     to −1, bez etykiety i karty, a klik w mgłę niczego nie rusza (bez podpowiedzi, menu, karty i polecenia; kontrola: prawy klik
     w domu daje podpowiedź). Zrzut: zachodni brzeg domu i mgła ze znakiem zapytania;
   - `osada-widok`: po odkryciu przez kartę posła kwadrat osady stoi w widoku (numer, położenie, mgła na nieodkrytych sąsiadach domu
     i osady), siedziba znaleziona po kluczu budynku, etykieta z nazwą nad nią niczego nie zasłania; zapis i wczytanie budują kwadrat
     od nowa z tą samą siedzibą; budowa kwadratu zaczyna się przy otwarciu karty posła, a po dołożeniu kwadratu do widoku gra jej nie
     trzyma (`zm.osada().budowa`, sprawdza to `doOdkrycia` w każdym scenariuszu, który odkrywa osadę). Zrzuty: siedziba z bliska
     (`osada-widok`) i dom z osadą z daleka (`osada-widok-daleko`);
   - `osada-karta`: klik w budynek siedziby (albo w napis etykiety) otwiera kartę osady z nazwą, kierunkiem i liczbami z ostatniego
     kontaktu (nie z gry osady), jedynym przyciskiem „×” i bez dyplomacji, a cały jej tekst to wiedza z kontaktu (bez wieści o
     upadku i odwołaniu); zamykają ją „×”, Esc, zaznaczenie kogoś i klik w dom, klik w siedzibę z zaznaczoną osobą nie wydaje
     polecenia. Etykieta przepuszcza wskaźnik do mapy: kółko nad napisem przybliża, przeciągnięcie myszą od napisu przesuwa mapę i
     nie otwiera karty; po kliknięciu etykiety myszą spacja dalej zatrzymuje i puszcza grę (etykieta nie trzyma fokusu); przy brzegu
     ekranu napis jedzie do środka, a jego ogonek zostaje przy kotwicy. Zrzuty: karta na komputerze po polsku (`osada-karta`,
     `osada-karta-otwarta`);
   - `osada-karta-en`: to samo na telefonie 390×844 po angielsku: karta w ekranie, nic na nic nie nachodzi (`nachodzenia`), etykieta
     niczego nie zasłania, „×” na palec, tekst bez polskich liter; palec zaczęty na napisie etykiety przesuwa mapę, a dwa palce
     (jeden na napisie) przybliżają (zdarzenia dotyku przez CDP); ogonek przy lewym brzegu ekranu zostaje przy kotwicy;
   - `osada-mapa`: mapa miasta ma znacznik osady po odkryciu (nie ma go przed).
   Zrzut na końcu pozostałych scenariuszy to zwykła gra, po nim ogląda się, że gra wygląda jak zawsze (atrybucja mapy, brak plam po
   błędzie). */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { skrotGry } from '../src/ai/gra.ts';
import { kierunekOsady, nazwaOsady, ziarnoOsady } from '../src/ai/kwadrat.ts';
import { hashString } from '../src/core/rng.ts';
import { dzienKontaktu } from '../src/gov/kontakt.ts';
import { dayOf, hourOf } from '../src/sim/clock.ts';
import { tickAt } from '../src/sim/handlarz.ts';
import { nowaOsadaGry, type OsadaGry } from '../src/ui/osada.ts';
import { ukladZGeo, zKlucza } from '../src/world/kwadraty.ts';
import { ADDRESSES } from '../tests/unit/fixtures.ts';
import { kafelkiMapy, waitIdle } from './browser.ts';
import { daneDema, wczytajDemo } from './osada-kwadraty.ts';
import { chopDryTree, GRA, kliknij, minutaGry, poHudzie, przewin, type ShotCele } from './shots-cele.ts';
import { nachodzenia, stos } from './shots-uklad.ts';

/** katalog kafelków testowych i TileJSON (jak w tools/shots.ts) */
const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/mvt');
const SAVE = 'za-murem-0.4-zapis';

/** odczyt osady i naszego ticka w jednym wywołaniu */
interface Odczyt {
  osada: ReturnType<NonNullable<typeof window.zm>['osada']>;
  nasz: number;
}
const odczyt = (page: Page): Promise<Odczyt> =>
  page.evaluate(() => ({ osada: window.zm!.osada(), nasz: window.zm!.sim!.st.tick }));

/** Zamyka otwarte okno zarządu pierwszą odpowiedzią: raport, karta nocy, uchwała bez podpisu, wydarzenie, spotkanie; okno innego
    rodzaju pierwszym aktywnym przyciskiem, a bez przycisku klawiszem Esc. false, gdy żadnego okna nie ma. Czas gry zależy od czasu
    przy ekranie (zarząd losuje karty z zegara ekranu), więc w tempie 8× okno, którego scenariusz nie zna, trafia się różnie. */
const zamknijOkno = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const m = document.getElementById('modal');
    if (!m || m.hidden) return false;
    const znany = m.querySelector<HTMLElement>(
      '[data-act="report-ok"], [data-act="night-go"], [data-act="law-skip"], .choices [data-act="event"]:not([disabled]), [data-act="meet"]:not([disabled])',
    );
    const przycisk = znany ?? m.querySelector<HTMLElement>('[data-act]:not([disabled])');
    if (przycisk) przycisk.click();
    else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
    return true;
  });

/** warunek scenariusza: przerywa z opisem i stanem, który go złamał */
function wymagaj(warunek: unknown, opis: string, stan?: unknown): asserts warunek {
  if (!warunek) throw new Error(`${opis}${stan === undefined ? '' : `: ${JSON.stringify(stan)}`}`);
}

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

/** Wzorzec skrótu gry osady dla dema Przymorze, z Node: osada z tymi samymi danymi i ziarnem co w przeglądarce (z adresu dema),
    bez przygotowania na zapas, czyli z nadrabianiem naraz w ticku startu, potem krok po kroku do ticku `tick`. Z nim porównuje się
    osadę z przeglądarki, która nadrabiała po kawałku na klatkę (także po zapisie w trakcie tego i wczytaniu). */
async function skrotWzorcaPrzymorze(tick: number): Promise<string> {
  const osada = await osadaWzorcowaPrzymorze(tick);
  return skrotGry(osada.gra!);
}

/** ziarno naszej gry na demie Przymorze, jak w przeglądarce (skrót adresu dema) */
const ziarnoPrzymorza = (): number => Number.parseInt(hashString(wczytajDemo('przymorze').addr), 16) || 2051;

/** Osada z Node dla dema Przymorze (z ziarnem gry `seed`, domyślnie z adresu dema, jak w przeglądarce bez `?seed=`), doprowadzona
    do ticku `tick` bez przygotowania na zapas i bez żadnego kontaktu (ani karty posła, ani `odkryj`): wzorzec skrótu gry osady
    i liczb, które zarząd o niej widzi. */
async function osadaWzorcowaPrzymorze(tick: number, seed = ziarnoPrzymorza()): Promise<OsadaGry> {
  const demo = wczytajDemo('przymorze');
  const osada = nowaOsadaGry(seed, await daneDema('przymorze'), ukladZGeo(demo.geo));
  osada.dane(demo.kwadraty);
  for (let t = 1; t <= tick; t++) osada.krok(t);
  if (!osada.gra) throw new Error(`wzorzec: osada nie powstała do ticku ${tick} (${osada.stan})`);
  return osada;
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

/** Rejestr klatek od `instalujRejestrKlatek`: odstępy między początkami klatek ([ms od poprzedniej, nasz tick w klatce]), praca
    każdej klatki gry ([ms od początku do końca tyknięcia PixiJS: `frame()` w main.ts razem z rysowaniem, nasz tick, faza
    przygotowania osady po klatce albo pusty napis, tick gry osady po klatce albo -1]) i, do porównania z zegarem, odstępy z rAF (znaczniki czasu wyrównane do
    odświeżania ekranu, nie widzą kilkunastu ms spóźnienia). Tick -1 to klatka przed startem gry (ekran ładowania). */
interface Klatki {
  odstepy: [number, number][];
  praca: [number, number, string, number][];
  raf: [number, number][];
}

/** Treść rejestru klatek w stronie, wspólna dla `evaluate` (gra już stoi) i `addInitScript` (od pierwszej klatki strony; czeka na
    ticker PixiJS). Dwa znaczniki tickera: priorytet 50 (INTERACTION) idzie przed grą, -100 po rysowaniu (UTILITY to -50). Faza
    przygotowania osady jest czytana tylko do ticku `fazaDoTicku` (potem `osada()` liczy skrót gry i zaburzałoby to pomiar). Nic
    poza zapisem czasu i odczytem ticku, więc nie rusza tego, co mierzy. */
function instalujRejestrKlatek(opcje: { fazaDoTicku: number }): void {
  type Rejestr = {
    ost: number;
    ostRaf: number;
    od: number;
    on: boolean;
    odstepy: [number, number][];
    praca: [number, number, string, number][];
    raf: [number, number][];
  };
  const w = window as unknown as { __zmKl?: Rejestr };
  if (w.__zmKl) return;
  const k: Rejestr = { ost: 0, ostRaf: performance.now(), od: 0, on: true, odstepy: [], praca: [], raf: [] };
  w.__zmKl = k;
  const tick = (): number => window.zm?.sim?.st.tick ?? -1;
  const podlacz = () => {
    const ticker = window.zm?.view?.app?.ticker;
    if (!ticker) {
      requestAnimationFrame(podlacz);
      return;
    }
    ticker.add(
      () => {
        if (!k.on) return;
        k.od = performance.now();
        if (k.ost) k.odstepy.push([k.od - k.ost, tick()]);
        k.ost = k.od;
      },
      null,
      50,
    );
    ticker.add(
      () => {
        if (!k.on) return;
        const t = tick();
        const p = t >= 0 && t < opcje.fazaDoTicku ? window.zm?.osada()?.przygotowanie : undefined;
        k.praca.push([performance.now() - k.od, t, p?.faza ?? '', p?.tick ?? -1]);
      },
      null,
      -100,
    );
    const krok = (t: number) => {
      if (!k.on) return;
      k.raf.push([t - k.ostRaf, tick()]);
      k.ostRaf = t;
      requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  };
  podlacz();
}

/** włącza rejestr klatek w już działającej stronie */
const zacznijMierzycKlatki = (page: Page, fazaDoTicku = 0): Promise<void> =>
  page.evaluate(instalujRejestrKlatek, { fazaDoTicku });

/** wyłącza rejestr i oddaje zebrane klatki */
const zbierzKlatki = (page: Page): Promise<Klatki> =>
  page.evaluate(() => {
    const k = (window as unknown as { __zmKl: Klatki & { on: boolean } }).__zmKl;
    k.on = false;
    return { odstepy: k.odstepy, praca: k.praca, raf: k.raf };
  });

/** Klatki z okna ticków [od, do): liczba, najdłuższy odstęp i jego 99. percentyl oraz najdłuższa praca klatki i jej 99. percentyl
    (ms). Dwie pierwsze klatki rejestru niosą sam jego start (czas `evaluate`), więc się ich nie liczy. */
function opisOkna(kl: Klatki, od: number, doTicku: number) {
  const z = (lista: [number, number, ...unknown[]][]) => {
    const w = lista
      .slice(2)
      .filter(([, t]) => t >= od && t < doTicku)
      .map(([ms]) => ms)
      .sort((a, b) => a - b);
    return {
      n: w.length,
      max: Math.round((w.at(-1) ?? 0) * 10) / 10,
      p99: Math.round((w[Math.floor(0.99 * w.length)] ?? 0) * 10) / 10,
    };
  };
  const odstepy = z(kl.odstepy);
  const praca = z(kl.praca);
  const raf = z(kl.raf);
  return {
    n: odstepy.n,
    max: odstepy.max,
    p99: odstepy.p99,
    pracaMax: praca.max,
    pracaP99: praca.p99,
    rafMax: raf.max,
  };
}

/** Postęp przygotowania osady widziany z zewnątrz: nasz tick, faza i tick hodowanej gry osady (`przygotowanie` z podglądu). */
interface Postep {
  nasz: number;
  faza: string;
  tick: number;
}

/** Jedna próba przez 6:00 drugiego dnia w tempie 8×: start gry z `query`, rejestr klatek, odpowiedzi na okna zarządu, aż nasz tick
    minie 7:00 (najwyżej 3 minuty). Dopóki przed 6:00, odczytuje postęp przygotowania osady (`osada()` w stanie `jest` liczy skrót
    gry, więc po starcie nie jest wołane, żeby nie wydłużać mierzonych klatek). */
async function biegPrzezStart(
  page: Page,
  base: string,
  query: string,
): Promise<{ startMs: number; klatki: Klatki; postep: Postep[]; koniec: Odczyt }> {
  const t0 = Date.now();
  await page.goto(`${base}?${query}`);
  await waitIdle(page);
  const startMs = Date.now() - t0;
  await zacznijMierzycKlatki(page, tickAt(2, 6));
  // klik w stronie, a nie `page.click`: sprawdzanie widoczności i przewijanie Playwrighta wydłuża jedną klatkę o kilkanaście ms
  // (także bez osady), co do gry nie należy
  await page.evaluate(() => document.querySelector<HTMLElement>('#speed [data-s="4"]')?.click());
  const start = tickAt(2, 6);
  const postep: Postep[] = [];
  const od = Date.now();
  let tick = 0;
  while (tick < tickAt(2, 7) && Date.now() - od < 180_000) {
    await zamknijOkno(page);
    const o = await page.evaluate((s) => {
      const zm = window.zm!;
      const t = zm.sim!.st.tick;
      return { t, p: t < s ? (zm.osada()?.przygotowanie ?? null) : null };
    }, start);
    tick = o.t;
    if (o.p) postep.push({ nasz: tick, faza: o.p.faza, tick: o.p.tick ?? -1 });
    await page.waitForTimeout(60);
  }
  const klatki = await zbierzKlatki(page);
  await page.evaluate(() => document.querySelector<HTMLElement>('#speed [data-s="0"]')?.click());
  return { startMs, klatki, postep, koniec: await odczyt(page) };
}

/** Karta zarządu (okno wydarzenia) tak, jak widzi ją gracz: nagłówek, tytuł, akapity treści i napisy wyborów. */
interface KartaZEkranu {
  kicker: string;
  tytul: string;
  akapity: string[];
  wybory: string[];
}

/** otwarte okno wydarzenia albo null (bez okna albo okno innego rodzaju) */
const kartaZEkranu = (page: Page): Promise<KartaZEkranu | null> =>
  page.evaluate(() => {
    const m = document.getElementById('modal');
    if (!m || m.hidden) return null;
    const wybory = [...m.querySelectorAll<HTMLElement>('.choices [data-act="event"]')];
    if (!wybory.length) return null;
    return {
      kicker: m.querySelector('.sheet-kicker')?.textContent ?? '',
      tytul: m.querySelector('.sheet-title')?.textContent ?? '',
      akapity: [...m.querySelectorAll('.sheet-body p')].map((p) => p.textContent ?? ''),
      wybory: wybory.map((b) => b.textContent ?? ''),
    };
  });

/** tytuł karty posła po polsku albo po angielsku */
const TYTUL_POSLA = /^(Poseł z osady |An envoy from the settlement )/;

/** Gra do karty posła (najwyżej do 9. dnia): przewija po 15 minut, a na każde inne okno zarządu odpowiada pierwszym wyborem
    (`zamknijOkno`), jak gracz, który bierze propozycję. Staje na karcie posła, zanim ktoś na nią odpowie. */
async function doPosla(page: Page): Promise<KartaZEkranu> {
  for (let k = 0; k < 4000; k++) {
    const karta = await kartaZEkranu(page);
    if (karta && TYTUL_POSLA.test(karta.tytul)) return karta;
    if (await zamknijOkno(page)) continue;
    const dzien = await page.evaluate(() => window.zm!.sim!.st.tick);
    wymagaj(dayOf(dzien) <= 9, 'poseł nie przyszedł do 9. dnia', dayOf(dzien));
    await page.evaluate(() => window.zm!.ff(15));
  }
  throw new Error('poseł nie przyszedł w 4000 krokach przewijania');
}

/** Ludność i budowle, które poseł podał w tekście karty (po polsku albo po angielsku; „nic jeszcze nie postawili” to zero). */
function liczbyZKarty(akapity: readonly string[]): { ludnosc: number; budowle: number } {
  const tekst = akapity.join(' ');
  const ludnosc = tekst.match(/(\d+) (?:osoba|osoby|osób)\b/) ?? tekst.match(/(\d+) (?:person|people) living/);
  wymagaj(ludnosc, 'w tekście karty nie ma liczby ludności', tekst);
  const budowle = tekst.match(/(\d+) budowl(?:a|e|i)\b/) ?? tekst.match(/(\d+) buildings? standing/);
  const zero = /nic jeszcze nie postawili|nothing built yet/.test(tekst);
  wymagaj(budowle || zero, 'w tekście karty nie ma liczby budowli', tekst);
  return { ludnosc: Number(ludnosc[1]), budowle: budowle ? Number(budowle[1]) : 0 };
}

/** Karta posła zgadza się z grą: dzień kontaktu osady (4–6 z jej ziarna) od 9:00, kierunek i nazwa z klucza kwadratu, a liczby
    w tekście z osadą z Node w tym samym ticku, której skrót równa się skrótowi osady z przeglądarki. Zwraca liczby posła. */
async function sprawdzKarte(
  page: Page,
  karta: KartaZEkranu,
  en: boolean,
  seed = ziarnoPrzymorza(),
): Promise<{ ludnosc: number; budowle: number }> {
  const o = await odczyt(page);
  wymagaj(o.osada?.stan === 'jest' && o.osada.odkryta === false, 'osada jest i jeszcze nieodkryta', o.osada);
  const [sx, sy] = zKlucza(o.osada.klucz!);
  const dzien = dayOf(o.nasz);
  const oczekiwany = dzienKontaktu(ziarnoOsady(seed, sx, sy));
  console.log(
    `  karta w dniu ${dzien}, godzina ${hourOf(o.nasz)}, kwadrat ${o.osada.klucz}, dzień kontaktu osady ${oczekiwany}`,
  );
  wymagaj(dzien === oczekiwany, 'poseł przyszedł w dniu kontaktu osady', [dzien, oczekiwany]);
  wymagaj(hourOf(o.nasz) >= 9 && hourOf(o.nasz) < 22, 'poseł przyszedł od 9:00 do 22:00', hourOf(o.nasz));
  const { nazwaZ } = nazwaOsady(sx, sy);
  const { kierunek } = kierunekOsady(sx, sy);
  wymagaj(
    karta.tytul === (en ? `An envoy ${nazwaZ.en}` : `Poseł ${nazwaZ.pl}`),
    'tytuł karty z nazwą osady',
    karta.tytul,
  );
  wymagaj(karta.akapity.length === 2, 'karta ma scenę i to, co poseł mówi', karta.akapity);
  wymagaj(
    karta.akapity[1].includes(en ? `lies ${kierunek.en} of you` : `leży ${kierunek.pl} od was`),
    'kierunek osady w tekście',
    karta.akapity[1],
  );
  wymagaj(karta.wybory.length === 3, 'trzy wybory', karta.wybory);
  const liczby = liczbyZKarty(karta.akapity);
  const wzor = await osadaWzorcowaPrzymorze(o.nasz, seed);
  const wej = wzor.dlaZarzadu()!;
  console.log(
    `  poseł podał: ${JSON.stringify(liczby)}, osada z Node w tym ticku: ludność ${wej.ludnosc}, budowle ${wej.budowle}`,
  );
  wymagaj(
    liczby.ludnosc === wej.ludnosc && liczby.budowle === wej.budowle,
    'liczby posła to stan osady z Node w tym ticku',
    [liczby, wej.ludnosc, wej.budowle],
  );
  wymagaj(o.osada.skrot === skrotGry(wzor.gra!), 'skrót osady z przeglądarki równy skrótowi z Node w ticku karty', [
    o.osada.skrot,
    skrotGry(wzor.gra!),
  ]);
  return liczby;
}

/** Gra do odkrycia osady przez kartę posła (inne okna zarządu dostają pierwszy wybór), odpowiada wyborem `wybor` (stuknięciem na
    telefonie) i czeka, aż jej kwadrat stanie w widoku i dorysują się kawałki. Zwraca odczyt osady po odkryciu. */
async function doOdkrycia(page: Page, dotyk: boolean, wybor = 0): Promise<NonNullable<Odczyt['osada']>> {
  await doPosla(page);
  // budowa ich kwadratu zaczyna się przy otwarciu karty posła, jeszcze przed odpowiedzią
  const przedOdpowiedzia = (await odczyt(page)).osada;
  wymagaj(
    przedOdpowiedzia?.budowa === true,
    'budowa kwadratu osady zaczęła się przy otwarciu karty posła',
    przedOdpowiedzia,
  );
  await kliknij(page, `#sheet .choices [data-act="event"][data-arg="${wybor}"]`, dotyk);
  await page.waitForFunction(() => document.getElementById('modal')!.hidden);
  await page.waitForFunction(() => (window.zm!.osada()?.kwadrat ?? -1) > 0, null, { timeout: 30_000 });
  await waitIdle(page);
  const o = (await odczyt(page)).osada;
  wymagaj(o?.stan === 'jest' && o.odkryta === true && o.kwadrat > 0, 'osada odkryta i jej kwadrat w widoku', o);
  wymagaj(o.siedziba !== null, 'siedziba osady znaleziona w jej kwadracie', o);
  // kwadrat jest w widoku, więc gra nie trzyma już budowy (a z nią kopii geo kwadratu)
  wymagaj(o.budowa === false, 'po dołożeniu kwadratu do widoku gra nie trzyma jego budowy', o);
  return o;
}

/** Kamera na cały zakres widoku (dom, a po odkryciu też kwadrat osady) przy najmniejszym przybliżeniu, środkiem zakresu albo w kafelku `x`
    (kolumna, w której ma stać środek ekranu; domyślnie środek zakresu). `zm.setCam` przerywa przelot kamery, który mogło zacząć okno
    zarządu („Pokaż”): przypisanie do `view.cam` zrobiłoby to dopiero po jego końcu, bo przelot nadpisuje kamerę do ostatniej klatki. */
async function kameraNaCalosc(page: Page, x?: number): Promise<void> {
  await page.evaluate((kolumna) => {
    const v = window.zm!.view;
    window.zm!.setCam(kolumna ?? v.srodek.x / 32, v.srodek.y / 32, v.minZoom);
  }, x);
}

/** Kamera na siedzibę osady przy zoomie `zoom` i czekanie na dorysowanie kawałków: środek ekranu leży 8 kafelków pod środkiem górnej
    krawędzi obrysu (kotwicą etykiety), więc etykieta stoi nad środkiem ekranu, daleko od okienka celów po lewej, a dach pod nią. */
async function naSiedzibe(page: Page, zoom: number, pod = 8): Promise<void> {
  await page.evaluate(
    ([z, d]) => {
      const e = window.zm!.osada()!.siedziba!.etykieta;
      window.zm!.setCam(e.x, e.y + d, z);
    },
    [zoom, pod] as const,
  );
  await waitIdle(page);
  // kamera dochodzi w pętli klatek (przycięcie do zakresu), a etykieta ustawia się po niej
  await page.waitForTimeout(150);
}

/** Punkt ekranu (px) na górnym rzędzie obrysu siedziby osady, w środku kafelka: tam klika się w jej budynek. */
const punktSiedziby = (page: Page): Promise<[number, number]> =>
  page.evaluate(() => {
    const e = window.zm!.osada()!.siedziba!.etykieta;
    return window.zm!.screenOf(e.x, e.y + 0.5);
  });

/** Klik albo stuknięcie w punkt ekranu. */
const klikPunkt = (page: Page, [x, y]: [number, number], dotyk: boolean): Promise<void> =>
  dotyk ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);

/** Środek napisu etykiety osady (px ekranu). Etykieta przepuszcza wskaźnik do mapy (nie jest celem kliknięcia), więc klika się w ekran
    w tym miejscu, tak jak robi to gracz. */
const srodekEtykiety = (page: Page): Promise<[number, number]> =>
  page.evaluate(() => {
    const r = document.querySelector('#osadaMark .treemark-t')!.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2] as [number, number];
  });

/** Klik albo stuknięcie w napis etykiety osady. */
const kliknijEtykiete = async (page: Page, dotyk: boolean): Promise<void> =>
  klikPunkt(page, await srodekEtykiety(page), dotyk);

/** kamera gry: środek w pikselach świata i przybliżenie */
const kamera = (page: Page) => page.evaluate(() => ({ ...window.zm!.view.cam }));

/** czeka (do 3 s), aż przybliżenie kamery przekroczy `prog`; false zamiast wyjątku, żeby scenariusz opisał, co się nie stało */
const zoomPowyzej = (page: Page, prog: number): Promise<boolean> =>
  page
    .waitForFunction((p) => window.zm!.view.cam.zoom > p, prog, { timeout: 3000 })
    .then(
      () => true,
      () => false,
    );

/** Ogonek etykiety wskazuje kotwicę (siedzibę), także gdy napis jedzie do środka ekranu przy jego brzegu: kamera ustawia kotwicę w
    punkcie ekranu (gx, gy), potem ogonek (pseudoelement `::after` napisu: jego `left` to środek trójkąta) leży w kotwicy, a gdyby
    wypadła dalej niż 12 px od krawędzi napisu, przy najbliższym takim miejscu. Wymaga, żeby napis rzeczywiście się przesunął (`--shift`
    ponad 20 px), inaczej próba nic by nie dowodziła. Zmienia kamerę (wołający ustawia ją od nowa). */
async function sprawdzOgonek(page: Page, opis: string, gx: number, gy: number): Promise<void> {
  await page.evaluate(
    ([x, y]) => {
      const zm = window.zm!;
      const e = zm.osada()!.siedziba!.etykieta;
      const z = zm.view.cam.zoom;
      zm.setCam(e.x - (x - innerWidth / 2) / (z * 32), e.y - (y - innerHeight / 2) / (z * 32), z);
    },
    [gx, gy] as const,
  );
  // etykieta doszła do kotwicy (pozycja liczy się w klatce, nakładki co 150 ms) i jest widoczna
  const doszla = await page
    .waitForFunction(
      () => {
        const wm = document.getElementById('osadaMark')!;
        const e = window.zm!.osada()!.siedziba!.etykieta;
        const [ax] = window.zm!.screenOf(e.x, e.y);
        return !wm.hidden && Math.abs(Number(/translate\(([-\d.]+)px/.exec(wm.style.transform)?.[1]) - ax) < 1.5;
      },
      null,
      { timeout: 3000 },
    )
    .then(
      () => true,
      () => false,
    );
  wymagaj(doszla, `${opis}: etykieta jest widoczna przy kotwicy blisko brzegu ekranu (${gx}, ${gy})`);
  const m = await page.evaluate(() => {
    const wm = document.getElementById('osadaMark')!;
    const t = wm.querySelector<HTMLElement>('.treemark-t')!;
    const q = t.getBoundingClientRect();
    const e = window.zm!.osada()!.siedziba!.etykieta;
    const [ax] = window.zm!.screenOf(e.x, e.y);
    return {
      kotwica: ax,
      lewy: q.left,
      prawy: q.right,
      ogonek: q.left + Number.parseFloat(getComputedStyle(t, '::after').left),
      przesuniecie: Number.parseFloat(wm.style.getPropertyValue('--shift')),
    };
  });
  wymagaj(Math.abs(m.przesuniecie) > 20, `${opis}: napis jedzie do środka ekranu (przesunięcie ponad 20 px)`, m);
  const oczekiwany = Math.min(Math.max(m.kotwica, m.lewy + 12), m.prawy - 12);
  wymagaj(Math.abs(m.ogonek - oczekiwany) <= 1, `${opis}: ogonek etykiety stoi przy kotwicy, nie pośrodku napisu`, m);
}

/** Wskaźnik zaczęty na napisie etykiety trafia do mapy (etykieta go przepuszcza, a nie pochłania jak przycisk): kółko nad napisem
    przybliża tak samo jak obok niego, a przeciągnięcie myszą od napisu przesuwa mapę i nie otwiera karty. Wymaga zamkniętej karty i
    kamery, przy której etykieta jest widoczna; zmienia kamerę (wołający ustawia ją od nowa). */
async function sprawdzPrzepuszczanieMyszy(page: Page, opis: string): Promise<void> {
  const [x, y] = await srodekEtykiety(page);
  const k0 = await kamera(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -400);
  const przyblizylo = await zoomPowyzej(page, k0.zoom * 1.15);
  wymagaj(przyblizylo, `${opis}: kółko nad napisem etykiety przybliża mapę`, [k0.zoom, (await kamera(page)).zoom]);
  // przeciągnięcie od napisu przesuwa mapę o tyle, o ile przesunięto mysz (w pikselach świata: piksele ekranu / przybliżenie)
  const [x1, y1] = await srodekEtykiety(page);
  const k1 = await kamera(page);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1 + 90, y1 + 50, { steps: 8 });
  await page.mouse.up();
  const k2 = await kamera(page);
  wymagaj(
    Math.abs(k2.x - (k1.x - 90 / k1.zoom)) < 1 && Math.abs(k2.y - (k1.y - 50 / k1.zoom)) < 1,
    `${opis}: przeciągnięcie od napisu etykiety przesuwa mapę o 90 × 50 px`,
    [k1, k2],
  );
  wymagaj(!(await widokKarty(page)).widac, `${opis}: przeciągnięcie od napisu nie otwiera karty osady`);
}

/** palce przez CDP jak z telefonu: każdy od a[i] do b[i] w 10 krokach */
async function palce(page: Page, a: [number, number][], b: [number, number][]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const n = 10;
  const w = (k: number) =>
    a.map(([x, y], id) => ({ id, x: x + ((b[id][0] - x) * k) / n, y: y + ((b[id][1] - y) * k) / n }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: w(0) });
  for (let k = 1; k <= n; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: w(k) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** To samo dla palców: jeden palec zaczęty na napisie etykiety przesuwa mapę i nie otwiera karty, a dwa palce (jeden na napisie)
    przybliżają. Wymaga zamkniętej karty i kamery, przy której etykieta jest widoczna; zmienia kamerę. */
async function sprawdzPrzepuszczaniePalcow(page: Page, opis: string): Promise<void> {
  const [x, y] = await srodekEtykiety(page);
  const k0 = await kamera(page);
  await palce(page, [[x, y]], [[x - 60, y + 40]]);
  const k1 = await kamera(page);
  wymagaj(
    Math.abs(k1.x - (k0.x + 60 / k0.zoom)) < 1 && Math.abs(k1.y - (k0.y - 40 / k0.zoom)) < 1,
    `${opis}: palec zaczęty na napisie etykiety przesuwa mapę o 60 × 40 px`,
    [k0, k1],
  );
  wymagaj(!(await widokKarty(page)).widac, `${opis}: przeciągnięcie palcem od napisu nie otwiera karty osady`);
  // dwa palce rozsuwane ze 100 na 200 px, pierwszy na napisie: przybliżenie ×2
  const [x2, y2] = await srodekEtykiety(page);
  await palce(
    page,
    [
      [x2, y2],
      [x2, y2 + 100],
    ],
    [
      [x2, y2 - 50],
      [x2, y2 + 150],
    ],
  );
  const k2 = await kamera(page);
  wymagaj(k2.zoom > k1.zoom * 1.6, `${opis}: dwa palce, jeden na napisie etykiety, przybliżają mapę`, [
    k1.zoom,
    k2.zoom,
  ]);
}

/** Co widać z karty osady: nagłówek, akapity i etykiety, liczby z listy, przyciski i atrybuty (ta sama karta co `#card`). */
async function widokKarty(page: Page): Promise<{
  widac: boolean;
  nazwa: string;
  tekst: string;
  liczby: string[];
  przyciski: string[];
  dataAct: number;
}> {
  return page.evaluate(() => {
    const k = document.getElementById('card')!;
    return {
      widac: !k.hidden && !!k.querySelector('.osada-glowa'),
      nazwa: k.querySelector('h2')?.textContent ?? '',
      tekst: (k.textContent ?? '').replace(/\s+/g, ' ').trim(),
      liczby: [...k.querySelectorAll('.apt-c')].map((e) => e.textContent ?? ''),
      przyciski: [...k.querySelectorAll('button')].map((b) => b.getAttribute('data-card') ?? ''),
      dataAct: k.querySelectorAll('[data-act]').length,
    };
  });
}

/** Prostokąty nakładek gry (px ekranu), pod którymi etykieta osady nie może stać, i prostokąt samej etykiety, gdy jest widoczna. */
async function etykietaINakladki(page: Page): Promise<{
  etykieta: { l: number; t: number; r: number; b: number; tekst: string } | null;
  nakladki: { nazwa: string; l: number; t: number; r: number; b: number }[];
}> {
  return page.evaluate(() => {
    const widoczny = (e: Element | null): e is HTMLElement => {
      if (!(e instanceof HTMLElement) || e.hidden || getComputedStyle(e).display === 'none') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const prosty = (nazwa: string, e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      return { nazwa, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    // pojemnik etykiety nie ma własnych wymiarów (napis leży w nim absolutnie), więc o widoczności mówi napis
    const mark = document.querySelector<HTMLElement>('#osadaMark .treemark-t');
    const wm = document.getElementById('osadaMark');
    const etykieta =
      wm && !wm.hidden && widoczny(mark) && mark
        ? (() => {
            const r = mark.getBoundingClientRect();
            return { l: r.left, t: r.top, r: r.right, b: r.bottom, tekst: mark.textContent ?? '' };
          })()
        : null;
    const sel = [
      '#top',
      '#goals',
      '#card',
      '#hint',
      '#arrive',
      '#minimapa',
      '#buildPanel',
      '#pracaPanel',
      '#placeBar',
      '.mapctl',
      '.attrib',
    ];
    const nakladki = sel.flatMap((s) => [...document.querySelectorAll(s)].filter(widoczny).map((e) => prosty(s, e)));
    for (const chip of document.querySelectorAll('#lista .lp'))
      if (widoczny(chip)) nakladki.push(prosty('#lista .lp', chip));
    return { etykieta, nakladki };
  });
}

/** Etykieta osady nie nachodzi na żadną nakładkę (pasek, cele, karta, lista ludzi, podpowiedź, przyciski, atrybucja). */
async function sprawdzEtykiete(page: Page, opis: string): Promise<void> {
  const { etykieta, nakladki } = await etykietaINakladki(page);
  wymagaj(etykieta, `${opis}: etykieta osady jest widoczna`);
  const zle = nakladki.filter((n) => etykieta.l < n.r && etykieta.r > n.l && etykieta.t < n.b && etykieta.b > n.t);
  wymagaj(zle.length === 0, `${opis}: etykieta „${etykieta.tekst}” nie zasłania nakładek`, { etykieta, zle });
  const [szer, wys] = await page.evaluate(() => [innerWidth, innerHeight]);
  wymagaj(
    etykieta.l >= -0.5 && etykieta.r <= szer + 0.5 && etykieta.t >= -0.5 && etykieta.b <= wys + 0.5,
    `${opis}: etykieta mieści się na ekranie`,
    etykieta,
  );
}

/** Atrybucja map (stopka `.attrib`) jest widoczna i niczym niezasłonięta w środku swojego napisu: wymóg każdego zrzutu. */
async function sprawdzAtrybucje(page: Page, opis: string): Promise<void> {
  const a = await page.evaluate(() => {
    const e = document.querySelector<HTMLElement>('#app .attrib');
    if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
    const r = e.getBoundingClientRect();
    const srodek = document.elementFromPoint(r.left + 24, r.top + r.height / 2);
    return {
      tekst: e.textContent ?? '',
      widac: r.width > 0 && r.height > 0 && r.bottom <= innerHeight + 0.5,
      naWierzchu: !!srodek && (srodek === e || e.contains(srodek)),
    };
  });
  wymagaj(a?.widac && a.naWierzchu, `${opis}: atrybucja map widoczna i na wierzchu`, a);
  wymagaj(
    /OpenStreetMap/.test(a.tekst) && /OpenFreeMap/.test(a.tekst) && /OpenMapTiles/.test(a.tekst),
    `${opis}: atrybucja wymienia OpenStreetMap, OpenFreeMap i OpenMapTiles`,
    a.tekst,
  );
}

/** Po kliknięciu myszą etykieta osady nie trzyma fokusu, więc spacja dalej zatrzymuje i puszcza grę (zamiast klikać etykietę drugi raz i
    otwierać kartę od nowa), jak po kliknięciu chipa listy ludzi (tools/shots-lista.ts). Dwie spacje wracają do tempa sprzed próby. */
async function sprawdzSpacje(page: Page, opis: string): Promise<void> {
  const tempo = () => page.evaluate(() => window.zm!.speed());
  const wEtykiecie = await page.evaluate(() => document.activeElement?.closest('#osadaMark') != null);
  wymagaj(!wEtykiecie, `${opis}: etykieta nie trzyma fokusu`);
  const przed = await tempo();
  await page.keyboard.press('Space');
  const po = await tempo();
  wymagaj((przed === 0) !== (po === 0), `${opis}: spacja zatrzymuje albo puszcza grę`, [przed, po]);
  wymagaj(
    (await widokKarty(page)).widac,
    `${opis}: karta osady dalej stoi (spacja nie zamyka jej ani nie otwiera od nowa)`,
  );
  await page.keyboard.press('Space');
  const wrocilo = await tempo();
  wymagaj((wrocilo === 0) === (przed === 0), `${opis}: druga spacja odwraca pierwszą`, [przed, po, wrocilo]);
  // tempo sprzed próby (spacja puszcza zawsze na 1×)
  if (przed > 1) await page.keyboard.press(`Digit${przed}`);
}

/** ile kwadratów pod mgłą dla zbioru odkrytych (klucze „sx,sy”): ich nieodkryci sąsiedzi (osiem kierunków), jak `polaMgly` */
function ileMgly(odkryte: readonly string[]): number {
  const zbior = new Set(odkryte);
  const mgla = new Set<string>();
  for (const k of odkryte) {
    const [sx, sy] = zKlucza(k);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && !zbior.has(`${sx + dx},${sy + dy}`)) mgla.add(`${sx + dx},${sy + dy}`);
  }
  return mgla.size;
}

/** Widok ich kwadratu i karta osady (zadanie 5 etapu 2 osady AI): mgła przed odkryciem, kwadrat obok domu po odkryciu z etykietą
    nad siedzibą, karta osady po kliknięciu, mapa miasta, zapis i wczytanie; każdy zrzut ma widoczną atrybucję map. `out` to katalog
    dodatkowych zrzutów (poza tym, który runner robi na końcu scenariusza). */
function widokOsadyShots(out: string): ShotCele[] {
  /** stan widoku osady w jednym wywołaniu: osada, mgła, kwadraty obok, etykieta, karta i kolejka poleceń */
  const stan = (page: Page) =>
    page.evaluate(() => {
      const zm = window.zm!;
      return {
        o: zm.osada(),
        mgla: zm.view.mgla.liczba,
        obok: zm.view.kwadratyObok(),
        etykieta: !document.getElementById('osadaMark')!.hidden,
        karta: !document.getElementById('card')!.hidden,
        cmds: zm.sim!.st.cmds.length,
      };
    });
  return [
    {
      // przed odkryciem: ośmiu sąsiadów domu pod mgłą (żaden nie zdradza, który kryje osadę), kwadratu osady w widoku nie ma, a klik
      // w mgłę niczego nie rusza. Zrzut: cały dom z mgłą po bokach
      name: 'osada-mgla',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&speed=0&cam=all`);
        await waitIdle(page);
        let s = await stan(page);
        wymagaj(s.o?.stan === 'czeka' && s.o.kwadrat === -1, 'przed startem osady jej kwadratu w widoku nie ma', s.o);
        wymagaj(s.mgla === 8 && s.obok.length === 0, 'ośmiu sąsiadów domu pod mgłą, żadnego kwadratu obok', s);
        // do 7:00 drugiego dnia osada już jest, ale gracz o niej nie wie: widok ten sam, bez etykiety i karty
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        await kameraNaCalosc(page);
        await waitIdle(page);
        s = await stan(page);
        wymagaj(s.o?.stan === 'jest' && s.o.odkryta === false, 'osada jest i nie jest odkryta', s.o);
        wymagaj(s.o.kwadrat === -1 && s.o.siedziba === null, 'przed odkryciem jej kwadratu w widoku nie ma', s.o);
        wymagaj(s.mgla === 8 && s.obok.length === 0, 'mgła na ośmiu sąsiadach, nic obok domu', s);
        wymagaj(!s.etykieta && !s.karta, 'bez etykiety i karty przed odkryciem', s);
        // kliknięcie w mgłę (na prawo od domu) niczego nie rusza: bez podpowiedzi „zaznacz kogoś”, bez menu, bez karty i bez
        // polecenia; w domu to samo kliknięcie daje podpowiedź (kontrola)
        const wBloku = () =>
          page.evaluate(() => ({
            podpowiedz: document.getElementById('hint')!.textContent ?? '',
            menu: !document.getElementById('ctx')!.hidden,
            karta: !document.getElementById('card')!.hidden,
            rozkazy: window.zm!.sim!.st.cmds.length,
          }));
        // podpowiedź u dołu (wieść z nocy, kronika) mija sama po kilku sekundach: kontrola zaczyna od pustej, żeby jej zgaśnięcie
        // w trakcie nie wyglądało jak reakcja na klik
        await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, {
          timeout: 15_000,
        });
        const przed = await wBloku();
        const [mx, my] = await page.evaluate(() => window.zm!.screenOf(384 + 40, 192));
        wymagaj(mx > 20 && mx < 1390, 'punkt w mgle leży na ekranie', [mx, my]);
        await page.mouse.click(mx, my, { button: 'right' });
        await page.waitForTimeout(350);
        await page.mouse.click(mx, my);
        await page.waitForTimeout(350);
        const po = await wBloku();
        wymagaj(
          po.podpowiedz === przed.podpowiedz && !po.menu && !po.karta && po.rozkazy === przed.rozkazy,
          'klik w mgłę niczego nie rusza',
          { przed, po },
        );
        const [dx, dy] = await page.evaluate(() => window.zm!.screenOf(192, 192));
        await page.mouse.click(dx, dy, { button: 'right' });
        await page.waitForTimeout(350);
        wymagaj(
          (await wBloku()).podpowiedz !== przed.podpowiedz,
          'kontrola: prawy klik w domu bez zaznaczonych daje podpowiedź, więc klik w mgłę naprawdę był ignorowany',
        );
        // zapis i wczytanie przed odkryciem: osada nadal nieodkryta, jej kwadratu w widoku nie ma, mgła jak przed zapisem
        wymagaj(await page.evaluate(() => window.zm!.save()), 'zapis gry się nie udał');
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        await page.waitForTimeout(300);
        const wczytana = await stan(page);
        wymagaj(
          wczytana.o?.stan === 'jest' && wczytana.o.odkryta === false && wczytana.o.kwadrat === -1,
          'po wczytaniu osada nadal nieodkryta, bez kwadratu w widoku',
          wczytana.o,
        );
        wymagaj(wczytana.mgla === 8 && wczytana.obok.length === 0, 'po wczytaniu mgła na ośmiu sąsiadach', wczytana);
        // zrzut: zachodni brzeg domu i mgła obok niego, ze znakiem zapytania w środku kwadratu (podpowiedź z kontroli już zgasła)
        await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, {
          timeout: 15_000,
        });
        await kameraNaCalosc(page, 0);
        await waitIdle(page);
        await page.waitForTimeout(200);
        await sprawdzAtrybucje(page, 'mgła');
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      // po odkryciu przez kartę posła: kwadrat osady stoi obok domu (numer w widoku, na swoim miejscu), pozostali sąsiedzi pod mgłą,
      // etykieta z nazwą nad siedzibą i niczego nie zasłania; zapis i wczytanie budują go od nowa. Zrzut: siedziba z bliska
      name: 'osada-widok',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const o = await doOdkrycia(page, false, 0);
        const [sx, sy] = zKlucza(o.klucz!);
        const { nazwa } = nazwaOsady(sx, sy);
        const u = await stan(page);
        console.log(
          `  kwadrat ${o.klucz} w widoku jako ${o.kwadrat}, mgła na ${u.mgla} kwadratach, siedziba ${JSON.stringify(o.siedziba)}`,
        );
        wymagaj(
          u.obok.length === 1 && u.obok[0].q === o.kwadrat && u.obok[0].sx === sx && u.obok[0].sy === sy,
          'w widoku dom i jeden kwadrat obok: kwadrat osady',
          u.obok,
        );
        wymagaj(u.mgla === ileMgly(['0,0', o.klucz!]), 'mgła na nieodkrytych sąsiadach domu i osady', [
          u.mgla,
          ileMgly(['0,0', o.klucz!]),
        ]);
        // siedziba leży w kwadracie osady (jej kotwica to środek górnej krawędzi obrysu)
        const sied = o.siedziba!;
        wymagaj(
          sied.etykieta.x > sx * 384 &&
            sied.etykieta.x < (sx + 1) * 384 &&
            sied.etykieta.y > sy * 384 &&
            sied.etykieta.y < (sy + 1) * 384,
          'siedziba w kwadracie osady',
          [sied, sx, sy],
        );
        // widok z daleka: dom i kwadrat osady razem z mgłą (zakres kamery obejmuje oba)
        await kameraNaCalosc(page);
        await waitIdle(page);
        await page.waitForTimeout(150);
        const zoom = await page.evaluate(() => window.zm!.view.cam.zoom);
        wymagaj(zoom < 0.08, 'zakres kamery objął dom i kwadrat osady', zoom);
        await page.screenshot({ path: path.join(out, 'osada-widok-daleko.png') });
        await sprawdzAtrybucje(page, 'widok z daleka');
        // z bliska: etykieta z nazwą nad siedzibą, niczego nie zasłania
        await naSiedzibe(page, 0.45);
        await sprawdzEtykiete(page, 'komputer');
        const et = (await etykietaINakladki(page)).etykieta!;
        wymagaj(et.tekst === nazwa.pl, 'etykieta niesie nazwę osady', [et.tekst, nazwa.pl]);
        // etykieta stoi nad siedzibą: jej dolna krawędź leży nad górnym rzędem obrysu, środek przy kotwicy
        const [ax, ay] = await punktSiedziby(page);
        wymagaj(Math.abs((et.l + et.r) / 2 - ax) < 40 && et.b <= ay + 2, 'etykieta nad górną krawędzią siedziby', [
          et,
          ax,
          ay,
        ]);
        await sprawdzAtrybucje(page, 'komputer');
        // zapis i wczytanie: kwadrat staje w widoku od nowa (z zapisanego geo osady), z tą samą siedzibą i etykietą
        const siedzibaZywa = JSON.stringify(sied);
        wymagaj(await page.evaluate(() => window.zm!.save()), 'zapis gry się nie udał');
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        const w = await odczyt(page);
        wymagaj(
          w.osada?.odkryta === true && w.osada.kwadrat > 0,
          'po wczytaniu kwadrat osady od razu w widoku',
          w.osada,
        );
        wymagaj(JSON.stringify(w.osada.siedziba) === siedzibaZywa, 'siedziba po wczytaniu ta sama co żywa', [
          w.osada.siedziba,
          siedzibaZywa,
        ]);
        await naSiedzibe(page, 0.45);
        await sprawdzEtykiete(page, 'po wczytaniu');
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      // klik w budynek siedziby otwiera kartę osady (nazwa, kierunek, liczby z kontaktu, jeden przycisk „×”); zamyka ją „×”, Esc,
      // zaznaczenie kogoś i klik w dom; etykieta nad siedzibą otwiera ją też. Komputer, polski
      name: 'osada-karta',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const o = await doOdkrycia(page, false, 1);
        const [sx, sy] = zKlucza(o.klucz!);
        const { nazwa } = nazwaOsady(sx, sy);
        const { kierunek } = kierunekOsady(sx, sy);
        await naSiedzibe(page, 0.45);
        wymagaj((await widokKarty(page)).widac === false, 'karta osady nie jest otwarta przed kliknięciem');
        const otwarta = () => page.waitForSelector('#card:not([hidden]) .osada-glowa');
        const zamknieta = () =>
          page.waitForFunction(
            () => document.getElementById('card')!.hidden || !document.querySelector('#card .osada-glowa'),
          );
        // klik w budynek siedziby otwiera kartę
        await klikPunkt(page, await punktSiedziby(page), false);
        await otwarta();
        let k = await widokKarty(page);
        console.log(`  karta: ${k.tekst}`);
        wymagaj(k.nazwa === nazwa.pl, 'nagłówek karty to nazwa osady', k.nazwa);
        wymagaj(k.tekst.includes(`Leży ${kierunek.pl} od was.`), 'kierunek od domu', k.tekst);
        wymagaj(
          k.tekst.toLowerCase().includes(`z ostatniego kontaktu (dzień ${o.kontakt!.dzien})`),
          'liczby z ostatniego kontaktu z jego dniem',
          [k.tekst, o.kontakt],
        );
        wymagaj(
          k.liczby.join('|') === `${o.kontakt!.ludnosc}|${o.kontakt!.budowle}`,
          'ludność i budowle z kontaktu, nie z gry osady',
          [k.liczby, o.kontakt],
        );
        wymagaj(
          k.przyciski.join(',') === 'osada-zamknij' && k.dataAct === 0,
          'jedyny przycisk to zamknięcie, żadnej dyplomacji',
          k,
        );
        wymagaj(k.tekst.includes('To wszystko, co o nich wiecie.'), 'karta mówi, skąd to wie', k.tekst);
        // karta to tylko wiedza z kontaktu (decyzja 6): nazwa, kierunek, dzień kontaktu, ludność, budowle i zdanie o źródle, bez wieści z
        // żywej gry osady (upadek, odwołanie zarządu); cały tekst co do znaku, bez odstępów
        const oczekiwany = `${nazwa.pl}×Leży ${kierunek.pl} od was.Z ostatniego kontaktu (dzień ${o.kontakt!.dzien})Mieszkańcy${o.kontakt!.ludnosc}Budowle${o.kontakt!.budowle}To wszystko, co o nich wiecie.`;
        wymagaj(
          k.tekst.replace(/\s/g, '') === oczekiwany.replace(/\s/g, ''),
          'cały tekst karty to nazwa, kierunek i liczby z kontaktu, bez wieści o upadku i odwołaniu',
          [k.tekst, oczekiwany],
        );
        await sprawdzAtrybucje(page, 'karta otwarta');
        await page.screenshot({ path: path.join(out, 'osada-karta-otwarta.png') });
        // „×” zamyka
        await page.click('#card .card-x');
        await zamknieta();
        // klik jeszcze raz i Esc
        await klikPunkt(page, await punktSiedziby(page), false);
        await otwarta();
        await page.keyboard.press('Escape');
        await zamknieta();
        // wskaźnik zaczęty na napisie etykiety trafia do mapy (kółko, przeciąganie), zanim zacznie się nim otwierać kartę
        await sprawdzPrzepuszczanieMyszy(page, 'komputer');
        // przy brzegu ekranu napis jedzie do środka, a ogonek zostaje przy kotwicy
        await naSiedzibe(page, 0.45);
        await sprawdzOgonek(page, 'komputer, lewy brzeg', 10, 520);
        await sprawdzOgonek(page, 'komputer, prawy brzeg', 1430, 520);
        await naSiedzibe(page, 0.45);
        // etykieta otwiera kartę, a po kliknięciu myszą spacja dalej zatrzymuje i puszcza grę
        await kliknijEtykiete(page, false);
        await otwarta();
        await sprawdzSpacje(page, 'po kliknięciu etykiety');
        // zaznaczenie kogoś zamyka kartę osady (pokazuje się karta osoby)
        await page.click('#lista .lp >> nth=0');
        await page.waitForFunction(
          () => !document.getElementById('card')!.hidden && !document.querySelector('#card .osada-glowa'),
        );
        // klik w siedzibę osady z zaznaczoną osobą otwiera kartę (nie wydaje polecenia): kamera wraca do osady
        await naSiedzibe(page, 0.45);
        const cmds = (await stan(page)).cmds;
        await klikPunkt(page, await punktSiedziby(page), false);
        await otwarta();
        wymagaj((await stan(page)).cmds === cmds, 'klik w siedzibę osady nie wydaje polecenia', cmds);
        // klik w dom (kamera na siedzibie domu) zamyka kartę osady
        await page.evaluate(() => {
          const w = window.zm!.sim!.w;
          const b = w.buildings[w.hq];
          window.zm!.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, 1.3);
        });
        await waitIdle(page);
        const [hx, hy] = await page.evaluate(() => {
          const w = window.zm!.sim!.w;
          const b = w.buildings[w.hq];
          return window.zm!.screenOf((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2);
        });
        await page.mouse.click(hx, hy);
        await zamknieta();
        // na koniec: karta osady otwarta nad widokiem ich kwadratu (zrzut)
        await naSiedzibe(page, 0.45);
        await klikPunkt(page, await punktSiedziby(page), false);
        await otwarta();
        k = await widokKarty(page);
        wymagaj(k.nazwa === nazwa.pl, 'karta po wszystkim jest ta sama', k);
        await sprawdzAtrybucje(page, 'zrzut');
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      // telefon 390×844, angielski: karta osady po stuknięciu w siedzibę (albo w etykietę) mieści się na ekranie, niczego nie zasłania,
      // etykieta nie zasłania przycisków ani listy ludzi, tekst bez polskich liter
      name: 'osada-karta-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      touch: true,
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const o = await doOdkrycia(page, true, 0);
        const [sx, sy] = zKlucza(o.klucz!);
        const { nazwa } = nazwaOsady(sx, sy);
        const { kierunek } = kierunekOsady(sx, sy);
        // telefon ma u góry pasek, cele i chipy ludzi do 300 px: kotwica etykiety niżej, żeby nie wchodziła pod nie
        await naSiedzibe(page, 0.4, 2);
        await poHudzie(page);
        await sprawdzEtykiete(page, 'telefon');
        const et = (await etykietaINakladki(page)).etykieta!;
        wymagaj(et.tekst === nazwa.en, 'etykieta po angielsku', [et.tekst, nazwa.en]);
        // stuknięcie w siedzibę otwiera kartę
        await klikPunkt(page, await punktSiedziby(page), true);
        await page.waitForSelector('#card:not([hidden]) .osada-glowa');
        await poHudzie(page);
        const k = await widokKarty(page);
        console.log(`  card: ${k.tekst}`);
        wymagaj(k.nazwa === nazwa.en, 'nagłówek karty po angielsku', k.nazwa);
        wymagaj(k.tekst.includes(`It lies ${kierunek.en} of you.`), 'kierunek po angielsku', k.tekst);
        wymagaj(
          k.tekst.toLowerCase().includes(`from the last contact (day ${o.kontakt!.dzien})`),
          'liczby z ostatniego kontaktu',
          [k.tekst, o.kontakt],
        );
        wymagaj(k.liczby.join('|') === `${o.kontakt!.ludnosc}|${o.kontakt!.budowle}`, 'liczby z kontaktu', [
          k.liczby,
          o.kontakt,
        ]);
        const polskie = k.tekst.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g);
        wymagaj(!polskie, 'polskie litery w angielskiej karcie', polskie);
        wymagaj(k.przyciski.join(',') === 'osada-zamknij' && k.dataAct === 0, 'jedyny przycisk to zamknięcie', k);
        // układ: karta w ekranie, nic na nic nie nachodzi (lista ludzi, cele, podpowiedź, przyciski), etykieta niczego nie zasłania
        const s = await stos(page);
        const zle = nachodzenia(s, { szufladaNaCelach: true });
        wymagaj(zle.length === 0, 'nakładki telefonu na siebie nie nachodzą', zle);
        const u = await page.evaluate(() => {
          const r = document.getElementById('card')!.getBoundingClientRect();
          const x = document.querySelector('#card .card-x')!.getBoundingClientRect();
          return {
            karta: [r.left, r.top, r.right, r.bottom],
            x: [x.width, x.height],
            stronaWBok: document.documentElement.scrollWidth - innerWidth,
            w: innerWidth,
            h: innerHeight,
          };
        });
        wymagaj(
          u.karta[0] >= 0 && u.karta[2] <= u.w + 0.5 && u.karta[1] >= 0 && u.karta[3] <= u.h + 0.5,
          'karta mieści się w ekranie',
          u,
        );
        wymagaj(u.stronaWBok <= 1, 'bez przewijania w bok', u);
        wymagaj(u.x[0] >= 36 && u.x[1] >= 36, '„×” na palec (od 36 px)', u.x);
        await sprawdzEtykiete(page, 'telefon z kartą');
        await sprawdzAtrybucje(page, 'telefon');
        // „×” (stuknięcie) zamyka kartę, etykieta otwiera ją znów
        await kliknij(page, '#card .card-x', true);
        await page.waitForFunction(() => document.getElementById('card')!.hidden);
        // palec zaczęty na napisie etykiety przesuwa mapę, a dwa przybliżają; potem kamera wraca i stuknięcie w napis otwiera kartę
        await sprawdzEtykiete(page, 'telefon po zamknięciu karty');
        await sprawdzPrzepuszczaniePalcow(page, 'telefon');
        await naSiedzibe(page, 0.4, 2);
        await sprawdzOgonek(page, 'telefon, lewy brzeg', 10, 520);
        await naSiedzibe(page, 0.4, 2);
        await poHudzie(page);
        await sprawdzEtykiete(page, 'telefon po powrocie kamery');
        await kliknijEtykiete(page, true);
        await page.waitForSelector('#card:not([hidden]) .osada-glowa');
        await poHudzie(page);
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      // mapa miasta po odkryciu pokazuje nazwę osady na jej kwadracie (znak przy siedzibie, obrys kwadratu); przed odkryciem nic
      name: 'osada-mapa',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await kafelkiMapy(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const czekajNaMape = async () => {
          await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
          await page.waitForFunction(() => window.zm!.mapa()!.stan().wTrakcie === 0, null, {
            timeout: 30_000,
            polling: 100,
          });
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        };
        const zamknijMape = async () => {
          await page.click('#sheet [data-act="miasto-zamknij"]');
          await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        };
        // przed odkryciem mapa nie ma znacznika osady
        await page.click('#btnMiasto');
        await czekajNaMape();
        wymagaj(
          (await page.evaluate(() => window.zm!.mapa()!.stan().znaczniki)) === 0,
          'przed odkryciem bez znacznika osady',
        );
        await zamknijMape();
        const o = await doOdkrycia(page, false, 0);
        await page.click('#btnMiasto');
        await czekajNaMape();
        const st = await page.evaluate(() => window.zm!.mapa()!.stan());
        console.log(`  mapa po odkryciu: ${JSON.stringify(st)}`);
        wymagaj(st.znaczniki === 1, 'mapa rysuje znacznik osady', st);
        await sprawdzAtrybucjeMapy(page);
        wymagaj(o.kwadrat > 0, 'kwadrat osady w widoku');
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
  ];
}

/** Okno mapy miasta ma w stopce atrybucję (OpenStreetMap, OpenFreeMap, OpenMapTiles) i widać ją w ekranie. */
async function sprawdzAtrybucjeMapy(page: Page): Promise<void> {
  const a = await page.evaluate(() => {
    const e = document.querySelector<HTMLElement>('#sheet .miasto-attrib');
    const r = e?.getBoundingClientRect();
    return { tekst: e?.textContent ?? '', widac: !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5 };
  });
  wymagaj(a.widac, 'atrybucja w oknie mapy widoczna', a);
  wymagaj(
    /OpenStreetMap/.test(a.tekst) && /OpenFreeMap/.test(a.tekst) && /OpenMapTiles/.test(a.tekst),
    'atrybucja mapy wymienia OpenStreetMap, OpenFreeMap i OpenMapTiles',
    a.tekst,
  );
}

export function osadaShots(out: string): ShotCele[] {
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
        // do 7:00 drugiego dnia i co najmniej 30 próbek, najwyżej 2 minuty przy ekranie (obciążona maszyna gra wolniej)
        let gotowe = false;
        while (!gotowe && Date.now() - od < 120_000) {
          await zamknijOkno(page);
          const o = await odczyt(page);
          if (o.osada?.stan === 'jest') {
            probek++;
            if (o.osada.tick !== o.nasz) rozjazd ??= o;
            if (!jank) {
              jank = true;
              // wątek główny stoi pół sekundy: pętla klatek ścina `dt` do 100 ms (najwyżej kilkanaście kroków na klatkę), a obie gry
              // i tak mają tyle samo kroków, bo każdy krok naszej gry niesie krok osady
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
          gotowe = probek >= 30 && o.nasz >= tickAt(2, 7);
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
        wymagaj(koniec.nasz > tickAt(2, 7), 'gra przeszła 7:00 drugiego dnia w tempie 8×', koniec.nasz);
        await page.click('#speed [data-s="0"]');
      },
    },
    {
      name: 'osada-nadrabianie',
      query: '',
      run: async (page, base) => {
        const start = tickAt(2, 6);
        // z osadą pierwsza (zimna strona), potem ta sama próba bez osady jako szum tej maszyny
        const z = await biegPrzezStart(page, base, 'demo=przymorze&osada=1&godzina=3&speed=0&cam=hq,1');
        const bez = await biegPrzezStart(page, base, 'demo=przymorze&godzina=3&speed=0&cam=hq,1');
        const okna = { przed: [0, start - 40], start: [start - 40, start + 400], po: [start + 400, Infinity] } as const;
        const opis = (kl: Klatki) =>
          Object.entries(okna)
            .map(([nazwa, [od, doTicku]]) => {
              const o = opisOkna(kl, od, doTicku);
              return `${nazwa} ${o.n} klatek: odstęp najdłuższy ${o.max} ms (p99 ${o.p99}), praca klatki najdłuższa ${o.pracaMax} ms (p99 ${o.pracaP99}), rAF najdłuższy ${o.rafMax}`;
            })
            .join('; ');
        console.log(`  start gry (adres do gotowej gry): z osadą ${z.startMs} ms, bez ${bez.startMs} ms`);
        console.log(`  klatki z osadą: ${opis(z.klatki)}`);
        console.log(`  klatki bez osady: ${opis(bez.klatki)}`);
        const nad = z.postep.filter((p) => p.faza === 'nadrabianie');
        const roznych = new Set(nad.map((p) => p.tick)).size;
        console.log(
          `  postęp przygotowania w ${z.postep.length} próbkach: ${roznych} różnych ticków w nadrabianiu, ostatnia próbka ${JSON.stringify(z.postep.at(-1))}`,
        );
        // nadrabianie idzie po kawałku na klatkę, a nie naraz: wiele różnych ticków, skończone przed startem
        wymagaj(
          roznych >= 4,
          'nadrabianie ma iść w kawałkach (kilka różnych ticków w próbkach)',
          z.postep.slice(0, 10),
        );
        wymagaj(
          z.postep.some((p) => p.faza === 'gotowa' && p.tick === start && p.nasz < start),
          'przed ticku startu gra osady jest już nadrobiona',
          z.postep.at(-1),
        );
        wymagaj(
          z.postep.every((p) => p.nasz < start),
          'próbki postępu są sprzed startu',
        );
        // osada powstała w ticku startu i idzie krok w krok
        wymagaj(z.koniec.osada?.stan === 'jest', 'o 7:00 osada ma być', z.koniec);
        wymagaj(z.koniec.osada.tick === z.koniec.nasz, 'ticki równe po starcie', z.koniec);
        wymagaj(z.koniec.osada.bledowRazem === 0, 'osada bez błędów', z.koniec.osada);
        // stan gry osady po nadrabianiu w kawałkach jest ten sam, co z Node przy nadrabianiu naraz w ticku startu
        const wzorzec = await skrotWzorcaPrzymorze(z.koniec.osada.tick ?? 0);
        console.log(
          `  skrót osady w przeglądarce ${z.koniec.osada.skrot} przy ticku ${z.koniec.osada.tick}, wzorzec z Node ${wzorzec}`,
        );
        wymagaj(z.koniec.osada.skrot === wzorzec, 'skrót osady z przeglądarki różni się od wzorca z Node', [
          z.koniec.osada.skrot,
          wzorzec,
        ]);
        // Rozstrzygnięcie 1 kontrolera: żadna klatka przed 6:00 (nadrabianie) ani w chwili startu osady nie trwa dłużej niż 33 ms.
        // Mierzone dwojako: praca tyknięcia gry (`frame()` z rysowaniem, czyli to, co dokłada nasz kod) i odstęp od początku jednej
        // klatki do początku następnej (zegar; do niego wchodzą też zatrzymania poza grą, np. obciążona maszyna)
        const przed = opisOkna(z.klatki, ...okna.przed);
        const naStarcie = opisOkna(z.klatki, ...okna.start);
        const klatkaStartu = z.klatki.praca.find(([, t]) => t >= start);
        const najdluzsze = (kl: Klatki) =>
          [...kl.odstepy.slice(2)]
            .sort((a, b) => b[0] - a[0])
            .slice(0, 3)
            .map(([ms, t]) => `${ms.toFixed(1)} ms przy ${t}`)
            .join(', ');
        console.log(
          `  klatka, w której osada powstaje (nasz tick ${klatkaStartu?.[1]}): praca ${klatkaStartu?.[0].toFixed(1)} ms; trzy najdłuższe odstępy z osadą: ${najdluzsze(z.klatki)}; bez osady: ${najdluzsze(bez.klatki)}`,
        );
        wymagaj(przed.n >= 100, 'za mało klatek przed startem, żeby coś znaczyły', przed);
        wymagaj(naStarcie.n >= 10, 'za mało klatek w chwili startu', naStarcie);
        wymagaj(przed.pracaMax <= 33, `klatka z nadrabiania osady pracowała ${przed.pracaMax} ms (limit 33 ms)`, przed);
        wymagaj(
          naStarcie.pracaMax <= 33,
          `klatka w chwili startu osady pracowała ${naStarcie.pracaMax} ms (limit 33 ms)`,
          naStarcie,
        );
        wymagaj(przed.max <= 33, `odstęp między klatkami przy nadrabianiu osady ${przed.max} ms (limit 33 ms)`, przed);
        wymagaj(
          naStarcie.max <= 33,
          `odstęp między klatkami w chwili startu osady ${naStarcie.max} ms (limit 33 ms)`,
          naStarcie,
        );
      },
    },
    {
      name: 'osada-zapis-w-przygotowaniu',
      query: '',
      run: async (page, base) => {
        const start = tickAt(2, 6);
        // przygotowanie idzie też przy pauzie (speed=0), więc po zapisie w jego połowie wystarczy odczekać
        await page.goto(`${base}?demo=przymorze&osada=1&godzina=3&speed=0&cam=hq,1`);
        await waitIdle(page);
        const w = await page.waitForFunction(
          (s) => {
            const p = window.zm!.osada()?.przygotowanie;
            return p?.faza === 'nadrabianie' && (p.tick ?? 0) >= s / 2 ? p.tick : false;
          },
          start,
          { timeout: 30_000, polling: 20 },
        );
        const postepPrzedZapisem = (await w.jsonValue()) as number;
        await page.evaluate(() => window.zm!.save());
        const zapis = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.osada, SAVE);
        console.log(`  zapis w połowie przygotowania (tick gry osady ${postepPrzedZapisem}): ${JSON.stringify(zapis)}`);
        wymagaj(zapis?.stan === 'czeka', 'zapis w trakcie przygotowania ma osadę „czeka”', zapis);
        wymagaj(Object.keys(zapis).sort().join() === 'stan,v', 'zapis „czeka” nie niesie przygotowania', zapis);
        // „Kontynuuj”: przygotowanie zaczyna się od nowa (pierwsza widoczna wartość tuż po starcie, daleko od zapisanej)
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        const odNowa = await page.waitForFunction(() => window.zm?.osada()?.przygotowanie ?? false, null, {
          timeout: 30_000,
          polling: 5,
        });
        const pierwsze = (await odNowa.jsonValue()) as { faza: string; tick?: number };
        console.log(`  po „Kontynuuj” pierwszy odczyt przygotowania: ${JSON.stringify(pierwsze)}`);
        wymagaj(
          pierwsze.faza === 'nadrabianie' && (pierwsze.tick ?? start) < postepPrzedZapisem,
          'po wczytaniu przygotowanie zaczyna się od nowa',
          [pierwsze, postepPrzedZapisem],
        );
        // do 7:00: osada powstaje w ticku startu i ma ten sam stan co wzorzec z Node
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        const po = await odczyt(page);
        wymagaj(po.osada?.stan === 'jest' && po.osada.tick === po.nasz, 'o 7:00 osada jest, ticki równe', po);
        const wzorzec = await skrotWzorcaPrzymorze(po.osada.tick ?? 0);
        console.log(
          `  skrót osady po wczytaniu w przygotowaniu ${po.osada.skrot} przy ticku ${po.osada.tick}, wzorzec z Node ${wzorzec}`,
        );
        wymagaj(po.osada.skrot === wzorzec, 'skrót osady po zapisie w przygotowaniu różni się od wzorca z Node', [
          po.osada.skrot,
          wzorzec,
        ]);
      },
    },
    {
      name: 'osada-siec',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&siec=1&${GRA}`);
        await waitIdle(page);
        wymagaj(
          (await page.evaluate(() => window.zm!.osada())) === null,
          'z ?siec=1 nowa gra nie dostaje osady (zm.osada() to null)',
        );
        wymagaj(
          ostrzezenia.length === 1 && ostrzezenia[0].includes('?siec=1'),
          'jedno ostrzeżenie o osadzie razem z ?siec=1',
          ostrzezenia,
        );
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        wymagaj((await page.evaluate(() => window.zm!.osada())) === null, 'o 7:00 drugiego dnia nadal bez osady');
        wymagaj(ostrzezenia.length === 1, 'ostrzeżenie jest jedno na całą grę', ostrzezenia);
        await page.evaluate(() => window.zm!.save());
        const tekst = await page.evaluate((k) => localStorage.getItem(k) ?? '', SAVE);
        wymagaj(tekst.length > 0, 'gra zapisała się');
        wymagaj(!tekst.includes('"osada"'), 'zapis bez osady nie ma pola osada');
        console.log(`  ostrzeżenie: ${ostrzezenia[0]}`);
      },
    },
    {
      name: 'osada-modul-blad',
      query: '',
      allow: /Failed to load resource: net::ERR_FAILED|dynamically imported module/,
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        // kod osady: moduł src/ui/osada.ts w trybie dev, kawałek assets/osada-*.js w buildzie (osada-brak.ts siedzi w głównym pakiecie)
        const KOD_OSADY = /\/(src\/ui\/osada\.ts|assets\/osada-[\w-]+\.js)(\?.*)?$/;
        let zablokowane = 0;
        await page.route(KOD_OSADY, (r) => {
          zablokowane++;
          return r.abort('failed');
        });
        // nowa gra: rusza bez osady
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        wymagaj(zablokowane >= 1, 'plik z kodem osady miał być zablokowany', zablokowane);
        const nowa = await odczyt(page);
        console.log(`  nowa gra bez kodu osady: ${JSON.stringify(nowa.osada)}`);
        wymagaj(
          nowa.osada?.stan === 'brak' && nowa.osada.powod === 'blad',
          'bez kodu osady nowa gra ma osadę „brak, blad”',
          nowa.osada,
        );
        wymagaj(!!nowa.osada.blad, 'podgląd niesie tekst błędu', nowa.osada);
        wymagaj(ostrzezenia.length === 1, 'dokładnie jedno ostrzeżenie o osadzie', ostrzezenia);
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        const po = await odczyt(page);
        wymagaj(po.nasz > tickAt(2, 6), 'gra idzie dalej bez osady', po);
        wymagaj(po.osada?.stan === 'brak' && po.osada.powod === 'blad', 'osada dalej „brak, blad”', po.osada);
        wymagaj(ostrzezenia.length === 1, 'o osadzie nadal jedno ostrzeżenie', ostrzezenia);
        await page.evaluate(() => window.zm!.save());
        const zapis = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.osada, SAVE);
        wymagaj(zapis?.stan === 'brak' && zapis.powod === 'blad', 'zapis pamięta „brak, blad”', zapis);

        // gra z zapisu, w którym osada jest, a kodu brak: dotychczasowy błąd wczytania, gra się nie zaczyna
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await page.waitForFunction(
          () =>
            /Nie mogę połączyć|Can’t reach|Something went wrong/.test(
              document.getElementById('startStatus')?.textContent ?? '',
            ),
          null,
          {
            timeout: 20_000,
          },
        );
        const komunikat = await page.evaluate(() => document.getElementById('startStatus')?.textContent ?? '');
        console.log(`  wczytanie zapisu z osadą bez kodu osady: „${komunikat}”`);
        wymagaj(
          komunikat.startsWith('Nie mogę połączyć się z serwerami map'),
          'dotychczasowy komunikat błędu wczytania',
          komunikat,
        );
        wymagaj((await page.evaluate(() => window.zm?.sim ?? null)) === null, 'gra z tym zapisem nie ruszyła');

        // po odblokowaniu ten sam zapis wczytuje się, osada zostaje „brak, blad” (zapisu nic nie zgubiło)
        await page.unroute(KOD_OSADY);
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        const wczytana = await odczyt(page);
        wymagaj(
          wczytana.osada?.stan === 'brak' && wczytana.osada.powod === 'blad',
          'po odblokowaniu zapis wczytuje się z tą samą osadą',
          wczytana.osada,
        );
        wymagaj(wczytana.nasz >= po.nasz - 1600, 'wczytana gra jest z późnego zapisu', [wczytana.nasz, po.nasz]);
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
      name: 'osada-adres-klatki',
      query: '',
      run: async (page, base) => {
        // Adres spoza dem: dane ośmiu sąsiadów przychodzą w tle po starcie gry, więc niepodzielne kroki osady (wybór kwadratu,
        // budowa gry, rozgrzewka) idą w grze, po jednym na klatkę, a nie pod ekranem ładowania: trzy jednorazowe klatki na początku gry
        // (zmierzone: ok. 70, 21 i 67 ms; wszystkie trzy niepodzielne, kawałki nadrabiania to potem najwyżej 11 ms). Tu się je
        // mierzy do dziennika, a jako warunek jest tylko rozsądny pułap: niepodzielny krok najwyżej 250 ms, klatka z kawałkiem
        // nadrabiania najwyżej 50 ms (sama gra z adresu ma w pierwszych sekundach własne klatki po ok. 25 ms, także bez osady).
        const ostrzezenia = liczOstrzezenia(page);
        await sieczLanciego(page);
        await page.addInitScript(instalujRejestrKlatek, { fazaDoTicku: tickAt(2, 6) });
        await page.goto(`${base}?osada=1&speed=0`);
        await page.fill('#addr', 'Lanciego 10G, Warszawa');
        await page.click('#startForm button[type=submit]');
        await waitIdle(page);
        await page.waitForFunction(() => window.zm!.osada()?.przygotowanie?.faza === 'gotowa', null, {
          timeout: 60_000,
          polling: 100,
        });
        const kl = await zbierzKlatki(page);
        const wGrze = kl.praca.filter(([, t]) => t >= 0);
        const kroki: Record<string, string> = {
          budowa: 'wybór kwadratu',
          rozgrzewka: 'budowa gry',
          nadrabianie: 'rozgrzewka albo kawałek nadrabiania',
          gotowa: 'ostatni kawałek nadrabiania',
        };
        const najdluzsze = [...wGrze]
          .sort((a, b) => b[0] - a[0])
          .slice(0, 6)
          .map(
            ([ms, , faza, tickOsady]) =>
              `${ms.toFixed(0)} ms (po nim faza „${faza || '-'}” tick ${tickOsady}: ${kroki[faza] ?? 'nie osada'})`,
          );
        const kawalki = wGrze.filter(
          ([, , faza, tickOsady]) => (faza === 'nadrabianie' || faza === 'gotowa') && tickOsady > 0,
        );
        const kawalkiMax = Math.max(0, ...kawalki.map(([ms]) => ms));
        const ciezkieMax = Math.max(
          0,
          ...wGrze.filter(([, , faza, tickOsady]) => tickOsady <= 0 && faza !== '').map(([ms]) => ms),
        );
        console.log(`  klatek w grze do końca przygotowania: ${wGrze.length}; najdłuższe: ${najdluzsze.join('; ')}`);
        console.log(
          `  klatki z kawałkami nadrabiania: ${kawalki.length}, najdłuższa ${kawalkiMax.toFixed(1)} ms; klatki z niepodzielnymi krokami: najdłuższa ${ciezkieMax.toFixed(1)} ms`,
        );
        wymagaj(
          wGrze.length > 0 && wGrze.some(([, , faza]) => faza === 'gotowa'),
          'przygotowanie doszło do końca w grze',
          wGrze.length,
        );
        wymagaj(
          ciezkieMax <= 250,
          `niepodzielny krok osady w klatce pracował ${ciezkieMax.toFixed(1)} ms (pułap 250 ms)`,
        );
        wymagaj(kawalkiMax <= 50, `kawałek nadrabiania w klatce pracował ${kawalkiMax.toFixed(1)} ms (pułap 50 ms)`);
        wymagaj(ostrzezenia.length === 0, 'kafelki przyszły, więc bez ostrzeżeń', ostrzezenia);
        const o = await odczyt(page);
        wymagaj(o.osada?.stan === 'czeka', 'osada czeka do 6:00 drugiego dnia', o.osada);
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
        // osady nie będzie, więc i mgły „nieodkrytego” nie ma: widok jak bez flagi
        await page.waitForTimeout(300);
        const widokZombie = await page.evaluate(() => ({
          mgla: window.zm!.view.mgla.liczba,
          maKwadraty: window.zm!.view.maKwadraty,
          kwadrat: window.zm!.osada()?.kwadrat,
        }));
        wymagaj(
          widokZombie.mgla === 0 && !widokZombie.maKwadraty && widokZombie.kwadrat === -1,
          'tryb zombie z flagą bez mgły i bez kwadratu osady',
          widokZombie,
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
      name: 'osada-bez-tabel',
      query: '',
      // 404 zablokowanych tabel to spodziewany błąd konsoli, ale tylko dla plików z data/mieszkancy/
      allow: /status of 404/,
      allowUrl: /\/data\/mieszkancy\//,
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        // pobranie ośmiu sąsiednich kwadratów dema to jeden plik (`loadDemoKwadraty`): policzone żądania do niego
        const sasiedzi: string[] = [];
        page.on('request', (r) => {
          if (/\/demo\/przymorze-kwadraty\.json/.test(r.url())) sasiedzi.push(r.url());
        });
        await page.route('**/data/mieszkancy/**', (r) => r.fulfill({ status: 404, body: 'brak' }));
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        const przed = await odczyt(page);
        wymagaj(przed.osada?.stan === 'czeka', 'bez tabel osada do 6:00 drugiego dnia czeka jak zawsze', przed.osada);
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(2, 7), { dotyk: false });
        const po = await odczyt(page);
        console.log(`  o 7:00 drugiego dnia: ${JSON.stringify(po.osada)}, pobrań sąsiadów: ${sasiedzi.length}`);
        wymagaj(
          po.osada?.stan === 'brak' && po.osada.powod === 'regula',
          'bez tabel mieszkańców osady nie ma (brak, regula)',
          po.osada,
        );
        wymagaj(sasiedzi.length === 0, 'bez tabel gra nie pobiera ośmiu sąsiadów osady', sasiedzi);
        wymagaj(ostrzezenia.length === 0, 'bez tabel osada milczy w konsoli', ostrzezenia);
        // osady nie ma, więc i mgły „nieodkrytego” już nie ma
        const widok = await page.evaluate(() => ({
          mgla: window.zm!.view.mgla.liczba,
          maKwadraty: window.zm!.view.maKwadraty,
          kwadrat: window.zm!.osada()?.kwadrat,
        }));
        wymagaj(
          widok.mgla === 0 && !widok.maKwadraty && widok.kwadrat === -1,
          'po starcie bez osady widok jak bez flagi',
          widok,
        );
        await page.evaluate(() => window.zm!.save());
        const zapis = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.osada, SAVE);
        wymagaj(zapis?.stan === 'brak' && zapis.powod === 'regula', 'zapis pamięta „brak, regula”', zapis);
        // kontrola, że liczenie żądań widzi pobranie: z tabelami ta sama gra pobiera sąsiadów
        await page.unroute('**/data/mieszkancy/**');
        sasiedzi.length = 0;
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        wymagaj(sasiedzi.length >= 1, 'kontrola: z tabelami gra pobiera sąsiadów osady', sasiedzi);
        const z = await odczyt(page);
        wymagaj(z.osada?.stan === 'czeka', 'kontrola: z tabelami osada czeka na start', z.osada);
        console.log(`  kontrola z tabelami: pobrań sąsiadów ${sasiedzi.length}, osada ${z.osada?.stan}`);
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
        // widok jak dawniej: bez mgły wokół domu, bez kwadratów obok, bez etykiety osady, klik poza mapą trafia w brzeg
        await page.waitForTimeout(300);
        const widokBezFlagi = await page.evaluate(() => ({
          mgla: window.zm!.view.mgla.liczba,
          maKwadraty: window.zm!.view.maKwadraty,
          obok: window.zm!.view.kwadratyObok().length,
          etykieta: !document.getElementById('osadaMark')!.hidden,
        }));
        wymagaj(
          widokBezFlagi.mgla === 0 && !widokBezFlagi.maKwadraty && widokBezFlagi.obok === 0 && !widokBezFlagi.etykieta,
          'bez flagi widok bez mgły, kwadratów obok i etykiety osady',
          widokBezFlagi,
        );
        await page.evaluate(() => window.zm!.save());
        const tekst = await page.evaluate((k) => localStorage.getItem(k) ?? '', SAVE);
        wymagaj(tekst.length > 0, 'gra zapisała się');
        wymagaj(!tekst.includes('"osada"'), 'zapis bez flagi nie ma pola osada');
        wymagaj(ostrzezenia.length === 0, 'gra bez flagi nie mówi nic o osadzie', ostrzezenia);
        console.log(`  zapis bez flagi: ${tekst.length} znaków, bez pola osada`);
      },
    },
    {
      name: 'osada-kontakt',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const karta = await doPosla(page);
        console.log(
          `  karta: „${karta.tytul}” (${karta.kicker})\n    ${karta.akapity.join('\n    ')}\n    wybory: ${karta.wybory.join(' | ')}`,
        );
        wymagaj(/^(Na osiedlu|Na ulicy)$/.test(karta.kicker), 'nagłówek okna ze słownika miejsca', karta.kicker);
        await sprawdzKarte(page, karta, false);
        // zapis, gdy karta czeka na odpowiedź, i „Kontynuuj”: ta sama karta od razu po wczytaniu
        wymagaj(await page.evaluate(() => window.zm!.save()), 'zapis gry się nie udał');
        const czeka = await page.evaluate((k) => {
          const s = JSON.parse(localStorage.getItem(k) ?? 'null');
          const gov = typeof s?.gov === 'string' ? JSON.parse(s.gov) : s?.gov;
          return { osada: s?.osada?.stan, odkryta: s?.osada?.odkryta, aktywna: gov?.ev?.active?.id };
        }, SAVE);
        wymagaj(
          czeka.osada === 'jest' && czeka.odkryta === false && czeka.aktywna === 'posel',
          'zapis ma osadę nieodkrytą i kartę posła, która czeka',
          czeka,
        );
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        await page.waitForSelector('#sheet .choices [data-act="event"]');
        const po = await kartaZEkranu(page);
        wymagaj(JSON.stringify(po) === JSON.stringify(karta), 'po wczytaniu ta sama karta', [karta, po]);
        const wczytana = await odczyt(page);
        wymagaj(
          wczytana.osada?.stan === 'jest' && wczytana.osada.odkryta === false,
          'osada po wczytaniu',
          wczytana.osada,
        );
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      name: 'osada-kontakt-odpowiedz',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const karta = await doPosla(page);
        const liczby = await sprawdzKarte(page, karta, false);
        const przed = await odczyt(page);
        const dzien = dayOf(przed.nasz);
        const nastroj = () => page.evaluate(() => ({ trust: window.zm!.gov!.trust, anger: window.zm!.gov!.anger }));
        const n0 = await nastroj();
        const log0 = await page.evaluate(() => window.zm!.gov!.log.length);
        // drugi wybór: zaprosić do środka (zaufanie +2, wkurzenie +1)
        await page.click('#sheet .choices [data-act="event"][data-arg="1"]');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        const po = await odczyt(page);
        wymagaj(po.osada?.odkryta === true, 'po odpowiedzi osada jest odkryta', po.osada);
        wymagaj(
          JSON.stringify(po.osada.kontakt) ===
            JSON.stringify({ dzien, ludnosc: liczby.ludnosc, budowle: liczby.budowle }),
          'kontakt w stanie osady to dzień i liczby z karty',
          po.osada.kontakt,
        );
        wymagaj(
          po.osada.tick === przed.osada?.tick && po.osada.skrot === przed.osada?.skrot,
          'kontakt nie zmienia gry osady',
          [przed.osada?.skrot, po.osada.skrot],
        );
        const n1 = await nastroj();
        wymagaj(n1.trust - n0.trust === 2 && n1.anger - n0.anger === 1, 'zaufanie +2 i wkurzenie +1', [n0, n1]);
        const logi = await page.evaluate((od) => window.zm!.gov!.log.slice(od).map((l) => l.txt.pl), log0);
        console.log(`  kronika po odpowiedzi: ${JSON.stringify(logi)}`);
        wymagaj(
          logi.length === 2 && logi[0].startsWith('Poseł z osady na ') && logi[1].includes('herbaty z pokrzyw'),
          'dwa wpisy w kronice',
          logi,
        );
        const zapis = await page.evaluate((k) => {
          window.zm!.save();
          return JSON.parse(localStorage.getItem(k) ?? 'null')?.osada;
        }, SAVE);
        wymagaj(
          zapis?.stan === 'jest' &&
            zapis.odkryta === true &&
            JSON.stringify(zapis.kontakt) === JSON.stringify(po.osada.kontakt),
          'zapis ma osadę odkrytą z kontaktem',
          zapis && { stan: zapis.stan, odkryta: zapis.odkryta, kontakt: zapis.kontakt },
        );
        // trzy doby dalej: żadnej drugiej karty posła, osada krok w krok
        await przewin(page, (teraz) => teraz >= minutaGry(dzien + 3, 7), { dotyk: false });
        const dalej = await odczyt(page);
        const wKronice = await page.evaluate(
          (t) => window.zm!.gov!.log.filter((l) => l.txt.pl === t).length,
          karta.tytul,
        );
        wymagaj(wKronice === 1, 'karta posła przyszła dokładnie raz', wKronice);
        wymagaj(dalej.osada?.odkryta === true && dalej.osada.tick === dalej.nasz, 'osada odkryta i krok w krok', dalej);
        // wczytanie: odkrycie przeżywa
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        const wczytana = await odczyt(page);
        wymagaj(
          wczytana.osada?.odkryta === true &&
            JSON.stringify(wczytana.osada.kontakt) === JSON.stringify(po.osada.kontakt),
          'po wczytaniu osada nadal odkryta, kontakt ten sam',
          wczytana.osada,
        );
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      // inne ziarna gry dają osadę na innym kwadracie i inny dzień kontaktu (dla Przymorza: ziarno 2 to północny zachód i dzień 6,
      // ziarno 1 to południowy wschód i dzień 5; tabela z `dzienKontaktu(ziarnoOsady(ziarno, sx, sy))` dla ziaren 1–24 jest w
      // raporcie zadania 4): karta przychodzi w tym dniu po kilku nocach z kartami nocy i raportami, z liczbami osady z Node
      name: 'osada-kontakt-ziarna',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        const oczekiwane = [
          { seed: 2, klucz: '-1,-1', dzien: 6 },
          { seed: 1, klucz: '1,1', dzien: 5 },
        ];
        for (const { seed, klucz, dzien } of oczekiwane) {
          await page.evaluate(() => localStorage.clear()).catch(() => {});
          await page.goto(`${base}?demo=przymorze&osada=1&seed=${seed}&${GRA}`);
          await waitIdle(page);
          await chopDryTree(page);
          const karta = await doPosla(page);
          const o = await odczyt(page);
          console.log(`  ziarno ${seed}: „${karta.tytul}”, kwadrat ${o.osada?.klucz}, dzień ${dayOf(o.nasz)}`);
          wymagaj(o.osada?.klucz === klucz, 'osada na kwadracie z tego ziarna', [klucz, o.osada?.klucz]);
          wymagaj(dayOf(o.nasz) === dzien, 'dzień kontaktu z tego ziarna', [dzien, dayOf(o.nasz)]);
          await sprawdzKarte(page, karta, false, seed);
        }
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      name: 'osada-kontakt-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&osada=1&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        const karta = await doPosla(page);
        console.log(
          `  card: “${karta.tytul}” (${karta.kicker})\n    ${karta.akapity.join('\n    ')}\n    choices: ${karta.wybory.join(' | ')}`,
        );
        wymagaj(
          /^(On the estate|On the street)$/.test(karta.kicker),
          'nagłówek okna ze słownika miejsca',
          karta.kicker,
        );
        await sprawdzKarte(page, karta, true);
        const polskie = [karta.kicker, karta.tytul, ...karta.akapity, ...karta.wybory]
          .join(' ')
          .match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g);
        wymagaj(!polskie, 'polskie litery w angielskiej karcie', polskie);
        // okno mieści się na ekranie telefonu razem z przyciskami, bez przewijania w bok
        const uklad = await page.evaluate(() => {
          const sheet = document.getElementById('sheet')!.getBoundingClientRect();
          const body = document.querySelector<HTMLElement>('#sheet .sheet-body')!;
          const przyciski = [...document.querySelectorAll<HTMLElement>('#sheet .choices [data-act="event"]')].map(
            (b) => {
              const r = b.getBoundingClientRect();
              return { lewo: r.left, prawo: r.right, gora: r.top, dol: r.bottom };
            },
          );
          return {
            okno: { lewo: sheet.left, prawo: sheet.right, gora: sheet.top, dol: sheet.bottom },
            szerokosc: innerWidth,
            wysokosc: innerHeight,
            trescWBok: body.scrollWidth - body.clientWidth,
            stronaWBok: document.documentElement.scrollWidth - innerWidth,
            przyciski,
          };
        });
        console.log(`  układ: ${JSON.stringify(uklad)}`);
        wymagaj(
          uklad.okno.lewo >= 0 && uklad.okno.prawo <= uklad.szerokosc + 0.5,
          'okno mieści się w szerokości ekranu',
          uklad.okno,
        );
        wymagaj(
          uklad.okno.gora >= 0 && uklad.okno.dol <= uklad.wysokosc + 0.5,
          'okno mieści się w wysokości ekranu',
          uklad.okno,
        );
        wymagaj(uklad.trescWBok <= 1 && uklad.stronaWBok <= 1, 'treść ani strona nie przewijają się w bok', uklad);
        for (const b of uklad.przyciski)
          wymagaj(
            b.lewo >= uklad.okno.lewo - 0.5 &&
              b.prawo <= uklad.okno.prawo + 0.5 &&
              b.gora >= uklad.okno.gora - 0.5 &&
              b.dol <= uklad.okno.dol + 0.5,
            'przycisk wyboru w oknie, bez ucięcia',
            { b, okno: uklad.okno },
          );
        // dotyk działa: pierwszy wybór stuknięty palcem zamyka okno i odsłania osadę. Odpowiedź zapisuje grę (`decided`), więc zapis
        // sprzed niej wraca do pamięci przed wczytaniem, a zrzut na końcu pokazuje znów tę kartę (na telefonie, po angielsku)
        const przedOdpowiedzia = await page.evaluate((k) => {
          window.zm!.save();
          return localStorage.getItem(k);
        }, SAVE);
        wymagaj(przedOdpowiedzia, 'zapis sprzed odpowiedzi');
        await kliknij(page, '#sheet .choices [data-act="event"][data-arg="0"]', true);
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        wymagaj((await odczyt(page)).osada?.odkryta === true, 'stuknięcie odsłania osadę');
        // gra zapisuje się też przy wyjściu ze strony (`pagehide`), więc zapis sprzed odpowiedzi wraca dopiero w nowej stronie, przed
        // skryptami gry
        await page.addInitScript(
          ([k, v]) => {
            if (sessionStorage.getItem('zmPrzywrocony')) return;
            sessionStorage.setItem('zmPrzywrocony', '1');
            localStorage.setItem(k, v);
          },
          [SAVE, przedOdpowiedzia] as const,
        );
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await kliknij(page, '#btnResume', true);
        await waitIdle(page);
        await page.waitForSelector('#sheet .choices [data-act="event"]');
        const znowu = await kartaZEkranu(page);
        wymagaj(
          JSON.stringify(znowu) === JSON.stringify(karta),
          'po wczytaniu zapisu sprzed odpowiedzi ta sama karta',
          [karta, znowu],
        );
        wymagaj(ostrzezenia.length === 0, 'zwykła gra osady milczy w konsoli', ostrzezenia);
      },
    },
    {
      name: 'osada-kontakt-bez-flagi',
      query: '',
      run: async (page, base) => {
        const ostrzezenia = liczOstrzezenia(page);
        await page.goto(`${base}?demo=przymorze&${GRA}`);
        await waitIdle(page);
        await chopDryTree(page);
        await przewin(page, (teraz) => teraz >= minutaGry(7, 7), { dotyk: false });
        wymagaj(
          (await page.evaluate(() => window.zm!.osada())) === null,
          'bez flagi zm.osada() to null przez siedem dób',
        );
        const posel = await page.evaluate(
          () =>
            window.zm!.gov!.log.filter(
              (l) => /^(Poseł z osady|An envoy from)/.test(l.txt.pl) || /^An envoy/.test(l.txt.en),
            ).length,
        );
        wymagaj(posel === 0, 'bez flagi żadnej karty posła w kronice', posel);
        wymagaj(await page.evaluate(() => window.zm!.save()), 'zapis gry się nie udał');
        const tekst = await page.evaluate((k) => localStorage.getItem(k) ?? '', SAVE);
        wymagaj(
          !tekst.includes('"osada"') && !tekst.includes('"posel"'),
          'zapis bez flagi nie ma pola osada ani karty posła',
        );
        wymagaj(ostrzezenia.length === 0, 'gra bez flagi nie mówi nic o osadzie', ostrzezenia);
        console.log(
          `  siedem dób bez flagi: kronika ${await page.evaluate(() => window.zm!.gov!.log.length)} wpisów, zapis ${tekst.length} znaków`,
        );
      },
    },
    ...widokOsadyShots(out),
  ];
}
