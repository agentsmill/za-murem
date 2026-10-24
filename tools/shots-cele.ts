/* Zrzuty i sprawdzenia okienka celów ze ścieżki (src/ui/sciezka.ts) do `npm run shots` (scenariusze cele-* i en-cele-r1):
   drugi dzień (R1) w bloku, w domu i w trybie zombie, cel czekający, okazje (handlarz, ugryzienie), linia „Cel: …” w oknach
   karty nocy, uchwały, spotkania z sąsiadami i na tablicy badań, widok dróg do zwycięstwa po ostatnim rozdziale (świeża gra),
   telefon 390×844 i 360 px, angielski bez polskich liter oraz zaliczenie drewna na wieczór, które przeżywa zapis, zjedzenie
   zapasu przez kozę i przeładowanie strony („Kontynuuj”).

   Każdy scenariusz sam sprawdza tekst okienka `#goals` (tytuł, licznik, teksty celów, podpowiedź tylko przy bieżącym,
   dopisek „czeka”, kolejność bloku okazji i rozdziału) i to, że okienko nie nachodzi na pasek u góry, listę ludzi, kartę
   osoby i panel budowy (`ukladZPanelami`: zaznacza osobę, otwiera panel budowy i po każdym kroku sprawdza przecięcia
   prostokątów, a także że okienko mieści się w oknie i nie przewija strony w bok). Okna z linią „Cel: …” sprawdza po
   tekście linii i po tym, że mieści się w oknie na komputerze i na telefonie.

   Układ na telefonie sprawdza okienko w jego stanie domyślnym, zwiniętym do jednego bieżącego celu; rozwiniętą listę
   (stuknięcie w nagłówek) tylko tak, że karta osoby, arkusz budowy od dołu i podpowiedź u dołu, które rysuje się nad nią, są
   zamierzone (`dozwolone`), a pasek, lista ludzi i krawędzie okna dalej muszą się zgadzać. Znane nachodzenie na komputerze
   (karta osoby przy wysokim okienku, `ZNANE_NA_KOMPUTERZE`) jest zapisane i pilnowane. Uwagi o liście ludzi na arkuszu
   budowy (poza okienkiem celów) idą tylko do logu.

   Stan gry scenariusze prowadzą grą (samouczek, noc, raport, przewijanie przez `zm.ff` z odpowiedziami na okna zarządu),
   a tam, gdzie gra potrzebuje do tego godzin ludzkiej roboty, ustawiają stan wprost jak dzisiejsze scenariusze (pracownia,
   ugryzienie, zapas drewna, trzy pierwsze cele), a rozdział hakiem `zm.rozdzial`. Tekst jest sprawdzany w DOM, nie w widoku
   `zm.cele()`; widok służy do sprawdzenia, co jest zaliczone, a co przepadło. Żadnych zmian w `src/`: hak `window.zm` ma już
   `cele()` i `rozdzial()`. */

import path from 'node:path';
import type { Page } from '@playwright/test';
import type { BuildKind } from '../src/sim/budowle.ts';
import { minutesAt } from '../src/sim/clock.ts';
import type { KluczRozdzialu, WidokSciezki } from '../src/ui/sciezka.ts';
import { waitIdle } from './browser.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts (jego `Shot` nie jest wyeksportowany) */
export interface ShotCele {
  name: string;
  query: string;
  w?: number;
  h?: number;
  touch?: boolean;
  lang?: 'en' | 'pl';
  run: (page: Page, base: string) => Promise<void>;
}

const SAVE = 'za-murem-0.4-zapis';
/** katalog zrzutów (ustawia `celeShots`), do zrzutów zapisywanych przez `ukladZPanelami` */
let WYJSCIE = '';
const TILE = 32;
const GRA = 'speed=0&cam=hq,1.3';
/** słowa z bloku, których w domu nie ma w celach i w ich podpowiedziach (jak BLOKOWE_UI w tools/shots.ts) */
const BLOKOWE_UI = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;

/** telefon: okno węższe niż 640 px (jak w tools/shots.ts: `isMobile` i dotyk) */
const dotykowy = (w: number): boolean => w < 640;
/** klik albo stuknięcie, zależnie od ekranu */
const kliknij = (page: Page, sel: string, dotyk: boolean) => (dotyk ? page.tap(sel) : page.click(sel));

/** minuta gry (od początku dnia 1, 0:00) dla dnia, godziny i minuty */
const minutaGry = (dzien: number, godz: number, min = 0): number => (dzien - 1) * 1440 + godz * 60 + min;

/** słowa z polskimi literami w tekście po angielsku */
const polskieLitery = (tekst: string): string[] => [
  ...new Set(tekst.split(/[^\p{L}]+/u).filter((s) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s))),
];

function zawiera(opis: string, tekst: string, ...fragmenty: string[]): void {
  const brak = fragmenty.filter((f) => !tekst.includes(f));
  if (brak.length) throw new Error(`${opis}: brakuje „${brak.join('”, „')}” w: ${tekst.slice(0, 500)}`);
}

function nieZawiera(opis: string, tekst: string, ...fragmenty: string[]): void {
  const sa = fragmenty.filter((f) => tekst.includes(f));
  if (sa.length) throw new Error(`${opis}: jest „${sa.join('”, „')}” w: ${tekst.slice(0, 500)}`);
}

/* ---------------------------------------------------------------- start i przewijanie */

/** start gry i czekanie na pierwsze chipy listy ludzi (portrety rysuje `hud` co 200 ms) */
async function start(page: Page, base: string, query: string): Promise<void> {
  await page.goto(`${base}?${query}`);
  await waitIdle(page);
  await page.waitForSelector('#lista:not([hidden]) .lp');
}

/** samouczek bez klikania: pierwszy z zarządu ścina suche drzewo (jak polecenie z menu) */
async function chopDryTree(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    const who = sim.st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'select', ids: [who.id] });
    sim.push({ t: 'chop', ids: [who.id], tree: sim.w.dryTree });
  });
}

type Okno = 'raport' | 'karta' | 'uchwala' | 'wydarzenie' | 'spotkanie' | 'inne';

/** rodzaj otwartego okna zarządu po przyciskach w środku (`zm.ff` przy otwartym oknie zwraca odcień okna, nie rodzaj) */
const okno = (page: Page): Promise<Okno | null> =>
  page.evaluate((): Okno | null => {
    const m = document.getElementById('modal');
    if (!m || m.hidden) return null;
    const ma = (s: string) => !!m.querySelector(s);
    if (ma('[data-act="report-ok"]')) return 'raport';
    if (ma('[data-act="night-go"]')) return 'karta';
    if (ma('[data-act="law-skip"]')) return 'uchwala';
    if (ma('.choices [data-act="event"]')) return 'wydarzenie';
    if (ma('[data-act="meet"]')) return 'spotkanie';
    return 'inne';
  });

/** odpowiedź na okno zarządu, żeby gra szła dalej: pierwszy dostępny wybór, bez uchwały, karta jak proponuje zarząd */
async function odpowiedz(page: Page, o: Okno, dotyk: boolean): Promise<void> {
  if (o === 'raport') await kliknij(page, '#sheet [data-act="report-ok"]', dotyk);
  else if (o === 'uchwala') await kliknij(page, '#sheet [data-act="law-skip"]', dotyk);
  else if (o === 'karta') await kliknij(page, '#sheet [data-act="night-go"]', dotyk);
  else if (o === 'wydarzenie') await kliknij(page, '#sheet .choices [data-act="event"]:not([disabled])', dotyk);
  else throw new Error(`w trakcie przewijania otworzyło się okno „${o}”, na które scenariusz nie umie odpowiedzieć`);
}

interface Przewijanie {
  dotyk: boolean;
  /** okna, na których przewijanie staje bez odpowiedzi; na inne odpowiada pierwszym wyborem */
  stop?: Okno[];
  /** ile minut gry w jednym kroku, z chwili gry (minuty od początku dnia 1); domyślnie 15 */
  krok?: (teraz: number) => number;
  maks?: number;
}

/** Przewija grę po kilka minut (`zm.ff`), odpowiadając na okna zarządu, aż `gotowe(minuta gry)` będzie prawdziwe (zwraca
    null) albo stanie okno z `stop` (zwraca je, nie odpowiadając). Rzuca, gdy przez `maks` kroków nic z tego. */
async function przewin(
  page: Page,
  gotowe: (teraz: number) => boolean | Promise<boolean>,
  o: Przewijanie,
): Promise<Okno | null> {
  const maks = o.maks ?? 900;
  for (let k = 0; k < maks; k++) {
    const w = await okno(page);
    if (w) {
      if (o.stop?.includes(w)) return w;
      await odpowiedz(page, w, o.dotyk);
      continue;
    }
    const teraz = minutesAt(await page.evaluate(() => window.zm!.sim!.st.tick));
    if (await gotowe(teraz)) return null;
    await page.evaluate((m) => window.zm!.ff(m), o.krok?.(teraz) ?? 15);
  }
  throw new Error(`przewijanie nie doszło do celu w ${maks} krokach`);
}

/** odpowiada na okna zarządu, które już czekają (bez przewijania czasu), aż żadne nie zostanie */
async function zamknijOkna(page: Page, dotyk: boolean): Promise<void> {
  for (let k = 0; k < 12; k++) {
    const w = await okno(page);
    if (!w) return;
    await odpowiedz(page, w, dotyk);
  }
  throw new Error('okna zarządu nie kończą się po 12 odpowiedziach');
}

/** Pierwszy dzień i pierwsza noc samą grą: samouczek (suche drzewo), odpowiedzi na okna po drodze, poranny raport i jego
    zamknięcie. Ścieżka otwiera wtedy drugi dzień (R1), około 6:00 dnia 2. */
async function doDrugiegoDnia(page: Page, dotyk: boolean): Promise<void> {
  await chopDryTree(page);
  const o = await przewin(page, () => false, { dotyk, stop: ['raport'] });
  if (o !== 'raport') throw new Error(`pierwszej nocy bez raportu (${o})`);
  await kliknij(page, '#sheet [data-act="report-ok"]', dotyk);
  await zamknijOkna(page, dotyk);
  await page.waitForFunction(() => window.zm!.cele()?.rozdzial?.k === 'r1', null, { timeout: 5000 });
  // okienko rysuje `hud` co 200 ms
  await page.waitForFunction(
    () =>
      document.querySelector('#goals .goals-head span')?.textContent === 'Drugi dzień' ||
      document.querySelector('#goals .goals-head span')?.textContent === 'Day two',
    null,
    { timeout: 5000 },
  );
}

/** nikt z zarządu nie rąbie drzew sam (jak `wylaczAutomat` w testach): gracz, który drewna nie zbiera */
async function bezDrwala(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    for (const p of sim.st.pawns)
      if (p.kind === 'core') sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'drwal', prio: 0 });
  });
}

/** ustawia rozdział ścieżki hakiem do zrzutów i czeka, aż okienko go pokaże */
async function rozdzial(page: Page, k: KluczRozdzialu): Promise<void> {
  await page.evaluate((r) => window.zm!.rozdzial(r), k);
  await page.waitForTimeout(450);
}

async function widok(page: Page): Promise<WidokSciezki> {
  const v = await page.evaluate(() => window.zm!.cele());
  if (!v) throw new Error('zm.cele() bez gry');
  return v;
}

/** kamera w kafelkach (do przywrócenia po kliknięciu osoby na liście, które wiezie kamerę do niej) */
const kamera = (page: Page): Promise<{ x: number; y: number; zoom: number }> =>
  page.evaluate((t) => {
    const c = window.zm!.view.cam;
    return { x: c.x / t, y: c.y / t, zoom: c.zoom };
  }, TILE);

async function przywrocKamere(page: Page, k: { x: number; y: number; zoom: number }): Promise<void> {
  await page.evaluate((c) => window.zm!.setCam(c.x, c.y, c.zoom), k);
  await waitIdle(page);
}

/* ---------------------------------------------------------------- okienko celów: tekst i układ */

/** wiersz listy okienka: klucz celu, klasy (now, done, missed, czeka), tekst celu bez podpowiedzi, podpowiedź, dopisek
    „czeka” i postęp drogi */
interface Wiersz {
  key: string;
  klasy: string[];
  tekst: string;
  jak: string | null;
  czeka: string | null;
  postep: string | null;
}

async function wiersze(page: Page, blok: 'okazja' | 'rozdzial' | 'drogi'): Promise<Wiersz[]> {
  return page.$$eval(`#goals ol[data-blok="${blok}"] > li`, (l) =>
    l.map((li) => {
      const e = li as HTMLElement;
      let tekst = '';
      for (const n of e.childNodes) if (n.nodeType === Node.TEXT_NODE) tekst += n.textContent ?? '';
      return {
        key: e.dataset.key ?? '',
        klasy: [...e.classList].filter((c) => c !== 'goal'),
        tekst,
        jak: e.querySelector('.goal-how')?.textContent ?? null,
        czeka: e.querySelector('.goal-czeka')?.textContent ?? null,
        postep: e.querySelector('.goal-postep')?.textContent ?? null,
      };
    }),
  );
}

const tekstOkienka = (page: Page): Promise<string> => page.$eval('#goals', (e) => e.textContent ?? '');

/** nagłówek rozdziału (tytuł i licznik zrobionych celów) z okienka */
const naglowek = (page: Page): Promise<{ tytul: string; licznik: string }> =>
  page.evaluate(() => {
    const g = document.querySelector('#goals > .goals-head');
    return {
      tytul: g?.querySelector('span')?.textContent ?? '',
      licznik: g?.querySelector('.goals-n')?.textContent ?? '',
    };
  });

/** Nachodzenie okienka celów na inny element ekranu: `co` to nazwa przeszkody (do list `znane` i `dozwolone`), `w` i `h`
    to wymiary części wspólnej w pikselach, `tekst` to opis do komunikatu. */
interface Nachodzenie {
  co: string;
  w: number;
  h: number;
  tekst: string;
}

/** nazwy przeszkód w bierniku (do komunikatów i do list `dozwolone` i `znane` niżej) */
const KARTA = 'kartę osoby';
const PANEL_BUDOWY = 'panel budowy';
const PODPOWIEDZ = 'podpowiedź u dołu';

/** Znana usterka układu na komputerze 1440×900 (raport zadania 10): okienko celów nie ma ograniczenia wysokości, a karta
    zaznaczonej osoby stoi 40 px od dołu i ma 470–540 px, więc dolna część okienka znika pod kartą, gdy okienko jest wysokie:
    blok okazji nad rozdziałem (handlarz 410 px, ugryzienie przy pierwszym dniu 450 px) albo długa podpowiedź bieżącego celu
    po nocy (R1 „budowla”: 262 px, 19 px za dużo). Scenariusze z takim stanem zapisują ją tu, zamiast ją ukrywać, i pilnują,
    że nadal występuje: po poprawce układu (np. `max-height` okienka do górnej krawędzi karty, `--card-h` mierzy main.ts)
    przerwą się z komunikatem „zniknęło” i wystarczy usunąć ten wpis. */
const ZNANE_NA_KOMPUTERZE: readonly string[] = [KARTA];

/** Okienko celów nie nachodzi na nic, co stoi obok (pasek u góry, chipy listy ludzi, karta osoby, panele budowy i Pracy,
    przyciski przybliżenia, minimapa, komunikat o przybyszach, znacznik suchego drzewa, pasek stawiania, podpowiedź u dołu),
    mieści się w oknie, nie jest szersze niż jego ramka i nie przewija strony w bok. Zwraca nachodzenia i inne naruszenia
    (opisy). */
async function naruszenia(page: Page): Promise<{ nachodzi: Nachodzenie[]; inne: string[] }> {
  return page.evaluate(
    ([karta, panel, podpowiedz]) => {
      const widoczny = (e: Element): boolean => {
        const h = e as HTMLElement;
        if (h.hidden) return false;
        const cs = getComputedStyle(h);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const cele = document.getElementById('goals')!;
      if (!widoczny(cele)) return { nachodzi: [], inne: ['okienko celów jest niewidoczne'] };
      const opis = (r: DOMRect) =>
        `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
      const a = cele.getBoundingClientRect();
      const inne: string[] = [];
      if (a.left < 0 || a.top < 0 || a.right > innerWidth + 0.5 || a.bottom > innerHeight + 0.5)
        inne.push(`okienko celów wystaje z okna (${opis(a)} w oknie ${innerWidth}×${innerHeight})`);
      if (cele.scrollWidth > cele.clientWidth + 1)
        inne.push(`treść okienka szersza niż ono samo (${cele.scrollWidth} > ${cele.clientWidth})`);
      if (document.documentElement.scrollWidth > innerWidth + 1) inne.push('strona przewija się w poziomie');
      const przeszkody: [string, string][] = [
        ['#top', 'pasek u góry'],
        ['#lista .lp', 'listę ludzi'],
        ['#card', karta],
        ['#buildPanel', panel],
        ['#pracaPanel', 'panel Pracy'],
        ['.mapctl', 'przyciski przybliżenia'],
        ['#minimapa', 'minimapę'],
        ['#arrive', 'komunikat o przybyszach'],
        ['#treeMark .treemark-t', 'znacznik suchego drzewa'],
        ['#placeBar', 'pasek stawiania'],
        ['#hint', podpowiedz],
      ];
      const nachodzi: { co: string; w: number; h: number; tekst: string }[] = [];
      for (const [sel, nazwa] of przeszkody)
        for (const e of document.querySelectorAll(sel)) {
          if (!widoczny(e)) continue;
          const b = e.getBoundingClientRect();
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > 1)
            nachodzi.push({
              co: nazwa,
              w: Math.round(w),
              h: Math.round(h),
              tekst: `okienko celów nachodzi na ${nazwa} o ${Math.round(w)}×${Math.round(h)} px (okienko ${opis(a)}, ${nazwa} ${opis(b)})`,
            });
        }
      return { nachodzi, inne };
    },
    [KARTA, PANEL_BUDOWY, PODPOWIEDZ] as const,
  );
}

/** Uwagi poza okienkiem celów (tylko do logu, nic nie przerywa): lista ludzi stoi pod okienkiem, więc jego wysokość
    przesuwa ją, a na telefonie arkusz budowy (od dołu) i karta osoby mogą ją przykryć. Zwraca opisy nachodzenia chipów listy
    na panel budowy i kartę osoby. */
const uwagiOLiscie = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const widoczny = (e: Element): boolean => {
      const h = e as HTMLElement;
      if (h.hidden) return false;
      const r = h.getBoundingClientRect();
      return getComputedStyle(h).display !== 'none' && r.width > 0 && r.height > 0;
    };
    const wynik: string[] = [];
    for (const [sel, nazwa] of [
      ['#buildPanel', 'panel budowy'],
      ['#card', 'kartę osoby'],
    ] as const) {
      const e = document.querySelector(sel);
      if (!e || !widoczny(e)) continue;
      const b = e.getBoundingClientRect();
      let naj = 0;
      for (const c of document.querySelectorAll('#lista .lp')) {
        if (!widoczny(c)) continue;
        const a = c.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > naj) naj = h;
      }
      if (naj > 1) wynik.push(`lista ludzi nachodzi na ${nazwa} o ${Math.round(naj)} px`);
    }
    return wynik;
  });

interface DozwolonePrzeszkody {
  /** przeszkody, na które okienko może nachodzić, bo je rysuje się nad nim (zamierzone) */
  dozwolone?: readonly string[];
  /** znane nachodzenie na te przeszkody (opisane w raporcie zadania 10): nie przerywa scenariusza, ale musi dalej występować */
  znane?: readonly string[];
}

/** Sprawdza układ okienka celów w tej chwili. Nachodzenie na przeszkodę z `dozwolone` jest zamierzone (tylko log), na
    przeszkodę ze `znane` to znana usterka (log z oznaczeniem), każde inne przerywa scenariusz. Zwraca znane nachodzenia,
    które wystąpiły (do sprawdzenia, że usterka dalej jest, dopóki scenariusz ją zna). */
async function bezNachodzenia(page: Page, opis: string, o: DozwolonePrzeszkody = {}): Promise<string[]> {
  const n = await naruszenia(page);
  const r = await page.$eval('#goals', (e) => {
    const x = e.getBoundingClientRect();
    return `${Math.round(x.left)},${Math.round(x.top)}–${Math.round(x.right)},${Math.round(x.bottom)}`;
  });
  const zle: string[] = [...n.inne];
  const znane: string[] = [];
  const zamierzone: string[] = [];
  for (const x of n.nachodzi) {
    if (o.dozwolone?.includes(x.co)) zamierzone.push(`${x.co} ${x.w}×${x.h}`);
    else if (o.znane?.includes(x.co)) znane.push(x.co);
    else zle.push(x.tekst);
  }
  const dopisek = [
    ...(zamierzone.length ? [`zamierzone: ${zamierzone.join(', ')}`] : []),
    ...(znane.length
      ? [
          `ZNANE nachodzenie: ${n.nachodzi
            .filter((x) => znane.includes(x.co))
            .map((x) => `${x.co} ${x.w}×${x.h}`)
            .join(', ')}`,
        ]
      : []),
  ].join('; ');
  console.log(`  ${opis}: okienko ${r}, ${zle.length ? `NARUSZENIA: ${zle.length}` : dopisek || 'bez nachodzenia'}`);
  if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
  return znane;
}

/** Opcje `ukladZPanelami`. `rozwiniete` (telefon): sprawdź okienko rozwinięte, a nie zwinięte (domyślne); karta osoby, arkusz
    budowy i podpowiedź u dołu leżą wtedy nad rozwiniętą listą, co jest zamierzone. `znane`: znane nachodzenie na te przeszkody
    (komputer 1440×900, karta osoby: raport zadania 10). `zrzut`: nazwa zrzutu stanu z kartą osoby i panelem budowy. */
interface OpcjeUkladu {
  rozwiniete?: boolean;
  znane?: readonly string[];
  zrzut?: string;
}

/** Układ okienka celów w trzech stanach: samo, z kartą osoby (zaznaczoną przez chip na liście) i z kartą oraz panelem
    budowy. Na telefonie sprawdza okienko w jego domyślnym stanie, zwiniętym (z `rozwiniete` w rozwiniętym). Po sprawdzeniu
    zamyka panel i zaznaczenie (Esc dwa razy) i przywraca kamerę, którą klik w chip przesuwa. */
async function ukladZPanelami(page: Page, opis: string, dotyk: boolean, o: OpcjeUkladu = {}): Promise<void> {
  if (dotyk) await ustawOkienko(page, !!o.rozwiniete, true);
  const dozwolone = dotyk && o.rozwiniete ? [KARTA, PANEL_BUDOWY, PODPOWIEDZ] : [];
  const opcje = { dozwolone, ...(o.znane ? { znane: o.znane } : {}) };
  await bezNachodzenia(page, `${opis}, samo okienko`, opcje);
  const cam = await kamera(page);
  await kliknij(page, '#lista .lp >> nth=0', dotyk);
  await page.waitForSelector('#card:not([hidden])');
  await page.waitForTimeout(500);
  const znane = await bezNachodzenia(page, `${opis}, z kartą osoby`, opcje);
  // znane nachodzenie ma dalej występować: gdy go nie ma, lista znanych jest nieaktualna (i odwrotnie przy nowej usterce)
  const zniklo = (o.znane ?? []).filter((z) => !znane.includes(z));
  if (zniklo.length)
    throw new Error(`${opis}: znane nachodzenie na ${zniklo.join(', ')} zniknęło, usuń je z listy znanych`);
  await kliknij(page, '#btnBuild', dotyk);
  await page.waitForSelector('#buildPanel .tile');
  await page.waitForTimeout(500);
  await bezNachodzenia(page, `${opis}, z kartą osoby i panelem budowy`, opcje);
  const uwagi = await uwagiOLiscie(page);
  if (uwagi.length) console.log(`    uwaga (poza okienkiem celów): ${uwagi.join('; ')}`);
  if (o.zrzut) await page.screenshot({ path: path.join(WYJSCIE, `${o.zrzut}.png`) });
  // pierwszy Esc zamyka panel budowy, drugi zdejmuje zaznaczenie (karta znika)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.getElementById('card')!.hidden && document.getElementById('buildPanel')!.hidden,
    null,
    { timeout: 3000 },
  );
  await przywrocKamere(page, cam);
  await page.waitForTimeout(300);
}

/** Linia „Cel: …” otwartego okna (`.sheet-cel`): jej tekst, położenie w oknie na ekranie i to, że okno mieści się
    w oknie przeglądarki (na telefonie bez przewijania w bok). */
async function liniaCeluOkna(page: Page, opis: string): Promise<string> {
  const r = await page.evaluate(() => {
    const s = document.querySelector('#sheet') as HTMLElement | null;
    const l = document.querySelector('#sheet .sheet-cel') as HTMLElement | null;
    if (!s || !l) return null;
    const sr = s.getBoundingClientRect();
    const lr = l.getBoundingClientRect();
    const glowa = document.querySelector('#sheet .sheet-head')!.getBoundingClientRect();
    const cialo = document.querySelector('#sheet .sheet-body')!.getBoundingClientRect();
    return {
      tekst: l.textContent ?? '',
      wOknie: lr.left >= sr.left - 0.5 && lr.right <= sr.right + 0.5 && lr.top >= sr.top && lr.bottom <= sr.bottom,
      podNaglowkiem: lr.top >= glowa.bottom - 0.5,
      nadTrescia: lr.bottom <= cialo.top + 0.5,
      okno: sr.left >= 0 && sr.right <= innerWidth + 0.5 && sr.top >= 0 && sr.bottom <= innerHeight + 0.5,
      szerokosc: l.scrollWidth <= l.clientWidth + 1,
      strona: document.documentElement.scrollWidth <= innerWidth + 1,
    };
  });
  if (!r) throw new Error(`${opis}: okno bez linii „Cel: …” (.sheet-cel)`);
  console.log(`  ${opis}: „${r.tekst}”`);
  const zle = Object.entries({
    'linia poza oknem': r.wOknie,
    'linia nie pod nagłówkiem': r.podNaglowkiem,
    'linia nie nad treścią': r.nadTrescia,
    'okno poza ekranem': r.okno,
    'linia szersza niż okno': r.szerokosc,
    'strona przewija się w bok': r.strona,
  })
    .filter(([, ok]) => !ok)
    .map(([nazwa]) => nazwa);
  if (zle.length) throw new Error(`${opis}: ${zle.join(', ')}`);
  return r.tekst;
}

/* ---------------------------------------------------------------- drugi dzień (R1) */

interface WariantR1 {
  dom?: boolean;
  zombie?: boolean;
  en?: boolean;
  dotyk?: boolean;
}

/** Sprawdza okienko R1 po zamknięciu pierwszego raportu: tytuł i licznik 0/5, pięć celów w kolejności w DOM (w zombie dzida
    zamiast obwodu), pierwszy bieżący i jedyny z podpowiedzią, ostatni czeka do 20:00. Zwraca wiersze. */
async function sprawdzR1(page: Page, opis: string, v: WariantR1): Promise<Wiersz[]> {
  const en = !!v.en;
  const t = (pl: string, eng: string) => (en ? eng : pl);
  const n = await naglowek(page);
  if (n.tytul !== t('Drugi dzień', 'Day two') || n.licznik !== '0/5')
    throw new Error(`${opis}: nagłówek „${n.tytul}” „${n.licznik}” zamiast „${t('Drugi dzień', 'Day two')}” „0/5”`);
  const w = await wiersze(page, 'rozdzial');
  const klucze = ['przeszukaj', 'budowla', v.zombie ? 'dzida' : 'obwod', 'drewno2', 'dyzur'];
  if (w.map((x) => x.key).join() !== klucze.join()) throw new Error(`${opis}: cele ${w.map((x) => x.key).join()}`);
  const teksty = [
    v.dom
      ? t('Przeszukajcie dom.', 'Search the house.')
      : t('Przeszukajcie puste mieszkanie.', 'Search an empty flat.'),
    t('Postawcie pierwszą budowlę.', 'Put up your first structure.'),
    v.zombie
      ? t('Zróbcie dzidę dla warty.', 'Make a spear for the watch.')
      : t('Wzmocnijcie obwód.', 'Strengthen the perimeter.'),
    t('Zbierzcie drewno na całą noc.', 'Get in enough wood for the whole night.'),
    t('Dajcie komuś dyżur przy kozie.', 'Put someone on stove watch.'),
  ];
  w.forEach((x, k) => {
    if (x.tekst !== teksty[k]) throw new Error(`${opis}: cel ${k + 1} „${x.tekst}” zamiast „${teksty[k]}”`);
  });
  // bieżący to pierwszy cel, tylko on ma podpowiedź; ostatni czeka (przyciemniony, z dopiskiem), reszta bez klas
  if (!w[0].klasy.includes('now') || !w[0].jak)
    throw new Error(`${opis}: pierwszy cel nie jest bieżący z podpowiedzią`);
  if (w.slice(1).some((x) => x.jak !== null))
    throw new Error(`${opis}: podpowiedź także przy celu, który nie jest bieżący`);
  const czeka = t('czeka do 20:00', 'waiting for 20:00');
  if (!w[4].klasy.includes('czeka') || w[4].czeka !== czeka)
    throw new Error(`${opis}: dyżur bez dopisku „${czeka}” (${w[4].klasy.join(' ')} / ${w[4].czeka})`);
  if (w.slice(1, 4).some((x) => x.klasy.length))
    throw new Error(`${opis}: cele 2–4 mają klasy ${w.slice(1, 4).map((x) => x.klasy.join('+'))}`);
  // podpowiedź przeszukania: najpierw osoba, potem prawy przycisk (na dotyku palec), w bloku mieszkanie, w domu pokój
  const jak = w[0].jak;
  if (en) zawiera(opis, jak, 'Select someone', 'right-click', 'Search the');
  else if (v.dotyk) zawiera(opis, jak, 'przytrzymajcie palec', 'Przeszukać');
  else
    zawiera(
      opis,
      jak,
      v.dom
        ? 'Zaznaczcie kogoś z komitetu i prawy przycisk w pokoju domu'
        : 'Zaznaczcie kogoś z zarządu i prawy przycisk w pustym mieszkaniu',
      'Przeszukać',
    );
  if (v.dom) {
    const slowo = BLOKOWE_UI.exec(await tekstOkienka(page))?.[0];
    if (slowo) throw new Error(`${opis}: w celach domu słowo z bloku „${slowo}”`);
  }
  return w;
}

/* ---------------------------------------------------------------- stan ustawiany wprost */

/** budowla gotowa w stanie gry (jak po `finishBuild`), na pierwszym dozwolonym miejscu z menu budowy */
async function postawBudowle(page: Page, kind: BuildKind): Promise<void> {
  await page.evaluate(async (k) => {
    const budowa = '/src/ui/budowa.ts';
    const budowle = '/src/sim/budowle.ts';
    const { allowedAnchors } = (await import(/* @vite-ignore */ budowa)) as typeof import('../src/ui/budowa.ts');
    const { footprint } = (await import(/* @vite-ignore */ budowle)) as typeof import('../src/sim/budowle.ts');
    const zm = window.zm!;
    const st = zm.sim!.st;
    const w = zm.sim!.w;
    const i = allowedAnchors(st, w, k, 0)[0];
    if (i === undefined) throw new Error(`brak miejsca na budowlę „${k}”`);
    const f = footprint(k, 0);
    st.things.push({
      id: st.nextThing++,
      kind: k,
      x: i % w.size,
      y: Math.floor(i / w.size),
      w: f.w,
      h: f.h,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
  }, kind);
}

/** zapas drewna jak liczy go cel „drewno na wieczór”: skład, luzem i w rękach (bez drewna w ogniu) */
const zapasDrewna = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const modul = '/src/sim/snapshot.ts';
    const { snapshot } = (await import(/* @vite-ignore */ modul)) as typeof import('../src/sim/snapshot.ts');
    const zm = window.zm!;
    const s = snapshot(zm.sim!.st, zm.sim!.w).stock;
    return s.woodSklad + s.woodLoose + s.woodCarried;
  });

/** n sztuk drewna na składzie przy kozie (jak po zniesieniu ściętego drzewa) */
async function dolozDrewno(page: Page, n: number): Promise<void> {
  await page.evaluate(async (ile) => {
    const modul = '/src/sim/house.ts';
    const { houseOf } = (await import(/* @vite-ignore */ modul)) as typeof import('../src/sim/house.ts');
    const zm = window.zm!;
    const st = zm.sim!.st;
    const w = zm.sim!.w;
    const h = houseOf(w)!;
    const zajete = (i: number) =>
      st.things.some(
        (t) =>
          i % w.size >= t.x &&
          i % w.size < t.x + t.w &&
          Math.floor(i / w.size) >= t.y &&
          Math.floor(i / w.size) < t.y + t.h,
      );
    const kafel = h.sklad.find((i) => !zajete(i));
    if (kafel === undefined) throw new Error('brak wolnego kafelka składu drewna');
    st.things.push({
      id: st.nextThing++,
      kind: 'drewno',
      x: kafel % w.size,
      y: Math.floor(kafel / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: ile,
      fuel: 0,
      by: -1,
      owner: -1,
    });
  }, n);
}

/** język gry jak wybór gracza w trakcie gry (ten sam moduł, który zna gra: singleton po adresie z serwera Vite) */
async function ustawJezyk(page: Page, jezyk: 'pl' | 'en'): Promise<void> {
  await page.evaluate(async (l) => {
    const adres = '/src/core/jezyk.ts';
    const m = await import(/* @vite-ignore */ adres);
    m.ustawJezyk(l);
  }, jezyk);
  await page.waitForTimeout(350);
}

/** drewno z karty nocy: ile jest i ile zje noc (z wiersza „Koza w nocy”) */
async function drewnoNaKarcie(page: Page): Promise<{ jest: number; trzeba: number }> {
  const t = await page.$eval('#sheet .fuel .odd-note', (e) => e.textContent ?? '');
  const m = /drewno (\d+) szt\., noc zje (\d+)|wood (\d+), the night needs (\d+)/.exec(t);
  if (!m) throw new Error(`karta nocy bez wiersza o drewnie: ${t}`);
  return { jest: Number(m[1] ?? m[3]), trzeba: Number(m[2] ?? m[4]) };
}

/** trzy pierwsze cele drugiego dnia ustawione w stanie gry: puste mieszkanie przeszukane (jak po „Przeszukać”) i zasieki
    na obwodzie, które liczą się jako pierwsza budowla i jako obwód. Bieżący jest wtedy cel „drewno na całą noc”. */
async function trzyPierwsze(page: Page): Promise<void> {
  await page.evaluate(() => {
    const zm = window.zm!;
    const st = zm.sim!.st;
    const w = zm.sim!.w;
    const mieszkanie = st.apts.find((a) => a.state !== 'zarzad') ?? st.apts[0];
    const pokoj = w.interior.rooms.find((r) => r.apt === mieszkanie.apt && r.kind === 'pokoj');
    if (!pokoj) throw new Error('mieszkanie bez pokoju do przeszukania');
    mieszkanie.searched.push(pokoj.id);
  });
  await postawBudowle(page, 'zasieki');
  await page.waitForTimeout(450);
}

/** okienko celów rozwiniete (cała lista) albo zwinięte (jeden bieżący cel), przez klik albo stuknięcie w nagłówek rozdziału
    (a bez niego okazji); nic, gdy już jest w tym stanie */
async function ustawOkienko(page: Page, rozwiniete: boolean, dotyk: boolean): Promise<void> {
  const jest = (await page.$eval('#goals .goals-head', (e) => e.getAttribute('aria-expanded'))) === 'true';
  if (jest === rozwiniete) return;
  await kliknij(page, '#goals .goals-head >> nth=0', dotyk);
  await page.waitForFunction(
    (r) => document.querySelector('#goals .goals-head')?.getAttribute('aria-expanded') === String(r),
    rozwiniete,
    { timeout: 3000 },
  );
  await page.waitForTimeout(400);
}

/** Puka do domów w Zielonkach od najbliższego, aż ktoś otworzy (spotkanie w drzwiach); lokatorzy z generatora mieszkańców,
    a gdy nikt nie otworzy, życzliwi z cechą lubiany (jak `m2f2Knock` w tools/shots.ts). Czeka na okno spotkania. */
async function zapukajAzOtworza(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const zm = window.zm!;
    const sim = zm.sim!;
    const w = sim.w;
    const size = w.size;
    const door = w.buildings[w.hq].entrances[0].out;
    const d2 = (t: number) => ((t % size) - (door % size)) ** 2 + (Math.floor(t / size) - Math.floor(door / size)) ** 2;
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
    const people = [
      os('Teresa', 'Teresa Wilk', true, 'krawcowa', 63, ['lubiany']),
      os('Zdzisław', 'Zdzisław Wilk', false, 'kolejarz', 66, ['lubiany']),
    ];
    const own = (bid: number) => ({
      stany: [{ bid, apt: 0, state: 'mieszkancy' as const }],
      domy: [{ apt: 0, klatka: -1, zal: false, osoby: people }],
    });
    let k = 0;
    for (; k < houses.length && k < 14; k++) {
      if (knock(houses[k])) break;
      if (k === 7) sim.lokatorzy = own;
    }
    zm.setCam(p.x, p.y - 1, 1.7);
    return { dom: houses[k]?.name ?? '', k, spotkanie: !!sim.st.sasiedzi?.spotkanie };
  });
  console.log(`  pukanie: ${r.dom} (${r.k + 1}. dom), spotkanie ${r.spotkanie}`);
  if (!r.spotkanie) throw new Error('nikt nie otworzył drzwi');
  await page.waitForSelector('#sheet [data-act="meet"]');
  await waitIdle(page);
}

/** Okienko celów po angielsku nie ma polskich liter ani w tekście, ani w opisach atrybutów (podpowiedź nagłówka, etykiety). */
async function okienkoBezPolskich(page: Page, opis: string): Promise<void> {
  const html = await page.$eval('#goals', (e) => e.innerHTML);
  const tekst = polskieLitery(html.replace(/<[^>]*>/g, ' '));
  const atrybuty = polskieLitery([...html.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((m) => m[1]).join(' '));
  if (tekst.length || atrybuty.length)
    throw new Error(`${opis}: polskie litery w okienku po angielsku: ${[...tekst, ...atrybuty].join(', ')}`);
}

/* ---------------------------------------------------------------- scenariusze */

export function celeShots(out: string): ShotCele[] {
  WYJSCIE = out;
  const shot = (s: ShotCele) => s;
  const zrzut = (page: Page, nazwa: string) => page.screenshot({ path: path.join(out, `${nazwa}.png`) });

  /** drugi dzień w trzech miejscach i dwóch trybach: tekst okienka i układ z kartą osoby i panelem budowy */
  const drugiDzien = (name: string, demo: string, opcje: { zombie?: boolean; dom?: boolean }): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=${demo}${opcje.zombie ? '&tryb=zombie' : ''}&${GRA}`);
        await doDrugiegoDnia(page, false);
        const w = await sprawdzR1(page, name, opcje);
        console.log(`  ${w.map((x) => `${x.key}${x.klasy.length ? `(${x.klasy.join('+')})` : ''}`).join(' ')}`);
        const v = await widok(page);
        if (v.okazja) throw new Error(`${name}: okazja „${v.okazja.tytul}” przed południem dnia 2`);
        // zombie: podpowiedzi celów, które nie są bieżące, są w widoku, a nie w DOM
        if (opcje.zombie) {
          const cele = v.rozdzial!.cele;
          zawiera(name, cele.find((c) => c.key === 'dzida')!.how, 'Zrobić dzidę', '2 deski i 1 złom');
          zawiera(name, cele.find((c) => c.key === 'drewno2')!.how, 'Za siatką są szwendacze', 'Spalić');
        }
        await ukladZPanelami(page, `${name} 1440×900`, false, { zrzut: `${name}-karta-budowa` });
        if (!opcje.zombie && !opcje.dom) {
          // zmiana języka przy otwartym okienku przerysowuje je od nowa (bez polskich liter po angielsku), a po powrocie
          // do polskiego wszystko jest jak było
          await ustawJezyk(page, 'en');
          await sprawdzR1(page, `${name} po zmianie na angielski`, { en: true });
          await okienkoBezPolskich(page, `${name} po zmianie na angielski`);
          await zrzut(page, `${name}-en`);
          await ustawJezyk(page, 'pl');
          await sprawdzR1(page, `${name} po powrocie do polskiego`, {});
        }
      },
    });

  /** Karta nocy dnia 2 z linią „Cel: …”. `malo`: nikt nie rąbie drzew, więc karta pokazuje za mało drewna, a linia i tak mówi
      o dyżurze przy kozie (cel „drewno na całą noc” nie ma okna, cel dyżuru tak). `trzy`: trzy pierwsze cele dnia ustawione
      w stanie, więc przy za małym zapasie bieżącym celem jest drewno, a przy dużym (karta je zalicza) dyżur; po wyborze
      dyżuru i zatwierdzeniu karty rozdział się kończy i ścieżka otwiera R2. Bez `trzy` rozdział zostaje otwarty i okienko
      pokazuje dyżur zaliczony, a drewno (przy małym zapasie) przepadłe. */
  const kartaNocy = (name: string, w: number, h: number, v: { malo: boolean; trzy: boolean }): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, dotyk);
        if (v.malo) await bezDrwala(page);
        if (v.trzy) await trzyPierwsze(page);
        await ukladZPanelami(page, `${name} ${w}×${h}`, dotyk);
        const o = await przewin(page, () => false, { dotyk, stop: ['karta'] });
        if (o !== 'karta') throw new Error(`${name}: przed 20:00 nie otworzyła się karta nocy`);
        const drewno = await drewnoNaKarcie(page);
        console.log(`  drewno na karcie: ${drewno.jest}, noc zje ${drewno.trzeba}`);
        if (v.malo !== drewno.jest < drewno.trzeba)
          throw new Error(
            `${name}: drewno na karcie ${drewno.jest} z ${drewno.trzeba}, a scenariusz chciał ${v.malo ? 'za mało' : 'dość'}`,
          );
        const linia = await liniaCeluOkna(page, `${name}, karta nocy`);
        if (linia !== 'Cel: Dajcie komuś dyżur przy kozie.') throw new Error(`${name}: linia celu „${linia}”`);
        const przed = (await widok(page)).rozdzial!;
        const cel = (k: string) => przed.cele.find((c) => c.key === k)!;
        if (cel('dyzur').czeka || cel('dyzur').done)
          throw new Error(`${name}: dyżur przy karcie czeka albo jest zrobiony`);
        if (cel('drewno2').done !== !v.malo)
          throw new Error(`${name}: drewno na całą noc zaliczone ${cel('drewno2').done}`);
        if (v.trzy) {
          const biezacy = v.malo ? 'drewno2' : 'dyzur';
          if (przed.biezacy?.key !== biezacy)
            throw new Error(`${name}: bieżący cel ${przed.biezacy?.key} zamiast ${biezacy}`);
        }
        await zrzut(page, `${name}-karta`);
        if (!dotyk && !v.trzy) {
          // zmiana języka przy otwartej karcie przerysowuje linię celu, a karta zostaje
          await ustawJezyk(page, 'en');
          const en = await liniaCeluOkna(page, `${name}, karta nocy po angielsku`);
          if (en !== 'Goal: Put someone on stove watch.') throw new Error(`${name}: linia po angielsku „${en}”`);
          const pl = polskieLitery(en);
          if (pl.length) throw new Error(`${name}: polskie litery w linii po angielsku: ${pl.join(', ')}`);
          await zrzut(page, `${name}-karta-en`);
          await ustawJezyk(page, 'pl');
          const wrocil = await liniaCeluOkna(page, `${name}, karta nocy po powrocie do polskiego`);
          if (wrocil !== 'Cel: Dajcie komuś dyżur przy kozie.')
            throw new Error(`${name}: linia po powrocie „${wrocil}”`);
        }
        // dyżur przy kozie dla drugiej osoby i zatwierdzenie karty
        await page.selectOption('#sheet select.pick >> nth=1', 'warta:koza');
        await kliknij(page, '#sheet [data-act="night-go"]', dotyk);
        await zamknijOkna(page, dotyk);
        await page.waitForTimeout(500);
        const po = await widok(page);
        if (v.trzy) {
          if (po.rozdzial?.k !== 'r2') throw new Error(`${name}: po rozdziale R1 otwarty ${po.rozdzial?.k}`);
          zawiera(name, await tekstOkienka(page), 'Ludzie i noc');
        } else {
          await ustawOkienko(page, true, dotyk);
          const wr = await wiersze(page, 'rozdzial');
          const dyzur = wr.find((x) => x.key === 'dyzur')!;
          const drewno2 = wr.find((x) => x.key === 'drewno2')!;
          if (!dyzur.klasy.includes('done')) throw new Error(`${name}: dyżur po karcie ${dyzur.klasy.join('+')}`);
          const oczekiwane = v.malo ? 'missed' : 'done';
          if (!drewno2.klasy.includes(oczekiwane))
            throw new Error(`${name}: drewno po karcie ${drewno2.klasy.join('+')}`);
          // licznik liczy cele zrobione i przepadłe; resztę rozdziału mógł zrobić automat pracy (naprawy łatają siatkę,
          // szaber przeszukuje puste mieszkania), więc liczy się to, co karta zmieniła, a nie liczba
          const n = await naglowek(page);
          const rozstrzygniete = wr.filter((x) => x.klasy.includes('done') || x.klasy.includes('missed')).length;
          if (n.licznik !== `${rozstrzygniete}/5`)
            throw new Error(`${name}: licznik ${n.licznik} przy ${rozstrzygniete} rozstrzygniętych`);
          console.log(
            `  po karcie: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}, licznik ${n.licznik}`,
          );
        }
        await ukladZPanelami(page, `${name} po karcie`, dotyk, dotyk || v.trzy ? {} : { znane: ZNANE_NA_KOMPUTERZE });
      },
    });

  /** Uchwała (R4) z linią „Cel: …”: zebranie o 19:30 pierwszego dnia, ścieżka ustawiona na R4. Przed zebraniem cel uchwały
      i raportu czekają (przyciemnione, z dopiskiem), w oknie uchwały cel jest bieżący, a podpis go zalicza. */
  const uchwala = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&${GRA}&godzina=19.5`);
        await rozdzial(page, 'r4');
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Zarząd' || n.licznik !== '0/4')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        if (wr.map((x) => x.key).join() !== 'uchwala,wkurzenie,nowi,ludzie')
          throw new Error(`${name}: cele ${wr.map((x) => x.key).join()}`);
        const [u, k, nowi] = wr;
        if (!u.klasy.includes('czeka') || u.czeka !== 'czeka do zebrania')
          throw new Error(`${name}: uchwała przed zebraniem ${u.klasy.join('+')} / ${u.czeka}`);
        if (!k.klasy.includes('czeka') || !k.czeka?.startsWith('Raport rano. Wkurzenie spada'))
          throw new Error(`${name}: wkurzenie przed rankiem ${k.klasy.join('+')} / ${k.czeka}`);
        if (!nowi.klasy.includes('now') || !nowi.jak)
          throw new Error(`${name}: bieżący cel to nie „nowi” (${nowi.klasy.join('+')})`);
        await ukladZPanelami(page, `${name} ${w}×${h}, przed zebraniem`, dotyk);
        await zrzut(page, `${name}-przed`);
        const p = await page.evaluate(() => window.zm!.govTick());
        if (p !== 'uchwala') throw new Error(`${name}: o 19:30 zamiast uchwały ${p}`);
        await page.waitForSelector('#sheet [data-act="law-skip"]');
        const linia = await liniaCeluOkna(page, `${name}, okno uchwały`);
        if (linia !== 'Cel: Podpiszcie kolejną uchwałę.') throw new Error(`${name}: linia celu „${linia}”`);
        await zrzut(page, `${name}-okno`);
        await kliknij(page, '#sheet [data-act="law"][data-arg="u_warty"]', dotyk);
        await zamknijOkna(page, dotyk);
        await page.waitForTimeout(500);
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        if (!po[0].klasy.includes('done')) throw new Error(`${name}: uchwała po podpisie ${po[0].klasy.join('+')}`);
        console.log(`  po podpisie: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        await ukladZPanelami(page, `${name} ${w}×${h}, po podpisie`, dotyk);
      },
    });

  /** Spotkanie z sąsiadami (R7) z linią „Cel: …”: Zielonki o zmierzchu, pukanie do domów aż ktoś otworzy. W oknie spotkania
      linia mówi o rozmowie, wybór „Odejść” kończy spotkanie i zalicza pukanie oraz rozmowę. */
  const spotkanie = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, 'demo=zielonki&speed=0&cam=hq,1&godzina=18.5');
        await rozdzial(page, 'r7');
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Sąsiedzi' || n.licznik !== '0/4')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        if (wr.map((x) => x.key).join() !== 'pukanie,spotkanie,wejscie,szaber')
          throw new Error(`${name}: cele ${wr.map((x) => x.key).join()}`);
        if (!wr[0].klasy.includes('now')) throw new Error(`${name}: bieżący cel to nie pukanie`);
        zawiera(name, wr[1].tekst, 'Porozmawiajcie z sąsiadami.');
        await ukladZPanelami(page, `${name} ${w}×${h}, przed pukaniem`, dotyk);
        await zapukajAzOtworza(page);
        const linia = await liniaCeluOkna(page, `${name}, okno spotkania`);
        if (linia !== 'Cel: Porozmawiajcie z sąsiadami.') throw new Error(`${name}: linia celu „${linia}”`);
        await zrzut(page, `${name}-okno`);
        await kliknij(page, '#sheet [data-act="meet"][data-arg="odejscie"]', dotyk);
        await page.evaluate(() => window.zm!.ff(3));
        await zamknijOkna(page, dotyk);
        await page.waitForTimeout(500);
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        console.log(`  po spotkaniu: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (!po[0].klasy.includes('done') || !po[1].klasy.includes('done'))
          throw new Error(
            `${name}: pukanie i rozmowa po spotkaniu: ${po[0].klasy.join('+')}, ${po[1].klasy.join('+')}`,
          );
        await ukladZPanelami(page, `${name} ${w}×${h}, po spotkaniu`, dotyk);
      },
    });

  /** Tablica badań (R6) z linią „Cel: …”: ścieżka ustawiona na R6, pracownia staje w stanie gry, tablica otwiera się sama
      z pauzą i linią o wyborze pierwszego badania w nagłówku. Po wyborze badania cel jest zaliczony i linii nie ma. */
  const tablica = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&${GRA}&godzina=11`);
        await rozdzial(page, 'r6');
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Badania' || n.licznik !== '0/5')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        if (wr.map((x) => x.key).join() !== 'pracownia,badanie,stol,odkrycie,era2')
          throw new Error(`${name}: cele ${wr.map((x) => x.key).join()}`);
        if (!wr[0].klasy.includes('now')) throw new Error(`${name}: bieżący cel to nie pracownia`);
        await ukladZPanelami(page, `${name} ${w}×${h}, bez pracowni`, dotyk);
        await postawBudowle(page, 'pracownia');
        await page.waitForFunction(() => window.zm!.badania().open, null, { timeout: 5000 });
        await page.waitForTimeout(500);
        const linia = await page.evaluate(() => {
          const l = document.querySelector('#tablica .tb-linia-celu') as HTMLElement | null;
          if (!l) return null;
          const lr = l.getBoundingClientRect();
          const pasek = document.querySelector('#tablica .tb-bar')!.getBoundingClientRect();
          const przycisk = document.querySelector('#tablica .tb-bar .btn')!.getBoundingClientRect();
          const wspolne = Math.min(lr.right, przycisk.right) - Math.max(lr.left, przycisk.left);
          const wysokie = Math.min(lr.bottom, przycisk.bottom) - Math.max(lr.top, przycisk.top);
          return {
            tekst: l.textContent ?? '',
            wPasku:
              lr.left >= pasek.left - 0.5 &&
              lr.right <= pasek.right + 0.5 &&
              lr.top >= pasek.top - 0.5 &&
              lr.bottom <= pasek.bottom + 0.5,
            nachodziNaPrzycisk: wspolne > 1 && wysokie > 1,
            wOknie: lr.left >= 0 && lr.right <= innerWidth + 0.5 && lr.top >= 0 && lr.bottom <= innerHeight + 0.5,
            strona: document.documentElement.scrollWidth <= innerWidth + 1,
          };
        });
        if (!linia) throw new Error(`${name}: tablica bez linii „Cel: …” (.tb-linia-celu)`);
        console.log(`  tablica: „${linia.tekst}”`);
        if (linia.tekst !== 'Cel: Wybierzcie pierwsze badanie.')
          throw new Error(`${name}: linia celu „${linia.tekst}”`);
        if (!linia.wPasku || linia.nachodziNaPrzycisk || !linia.wOknie || !linia.strona)
          throw new Error(`${name}: linia celu poza paskiem tablicy albo na przycisku: ${JSON.stringify(linia)}`);
        await zrzut(page, `${name}-tablica`);
        // wybór badania z tablicy zalicza cel: po ponownym otwarciu linii nie ma
        await kliknij(page, '#tablica [data-akcja="badaj"]', dotyk);
        await page.waitForTimeout(500);
        await page.evaluate(() => window.zm!.ff(1));
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        if (
          po
            .map((x) => `${x.key}:${x.klasy.join('+')}`)
            .join(' ')
            .includes('badanie:now')
        )
          throw new Error(`${name}: badanie dalej bieżące po wyborze`);
        console.log(`  po wyborze badania: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (!po[1].klasy.includes('done')) throw new Error(`${name}: badanie po wyborze ${po[1].klasy.join('+')}`);
        await page.keyboard.press('t');
        await page.waitForFunction(() => window.zm!.badania().open, null, { timeout: 5000 });
        if (await page.$('#tablica .tb-linia-celu'))
          throw new Error(`${name}: linia celu została po zaliczeniu badania`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !window.zm!.badania().open, null, { timeout: 5000 });
        await ukladZPanelami(page, `${name} ${w}×${h}, po wyborze badania`, dotyk);
      },
    });

  /** Cel czekający: R1 w ciągu dnia z trzema pierwszymi celami zrobionymi (w stanie gry). Bieżący jest wtedy cel drewna, a dyżur
      przy kozie czeka do karty nocy: przyciemniony, z przerywanym kółkiem i dopiskiem „czeka do 20:00”, bez podpowiedzi. */
  const czeka = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, false);
        await trzyPierwsze(page);
        const wr = await wiersze(page, 'rozdzial');
        console.log(`  ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        const klasy = wr.map((x) => x.klasy.join('+'));
        if (klasy.join() !== 'done,done,done,now,czeka') throw new Error(`${name}: klasy celów ${klasy.join()}`);
        const czekajacy = wr[4];
        if (czekajacy.czeka !== 'czeka do 20:00' || czekajacy.jak !== null)
          throw new Error(`${name}: cel czekający „${czekajacy.czeka}” z podpowiedzią ${czekajacy.jak}`);
        zawiera(name, wr[3].jak ?? '', 'Drewna ');
        const n = await naglowek(page);
        if (n.licznik !== '3/5') throw new Error(`${name}: licznik ${n.licznik} zamiast 3/5`);
        // wygląd: cel czekający ma inny kolor tekstu niż bieżący i zrobiony, przerywane kółko, pełną nieprzezroczystość i
        // pochyły dopisek; bieżący i zrobiony go nie mają
        const styl = await page.evaluate(() => {
          const li = (k: string) => document.querySelector(`#goals li.goal[data-key="${k}"]`) as HTMLElement;
          const kolor = (e: Element) => getComputedStyle(e).color;
          const czeka = li('dyzur');
          const dopisek = czeka.querySelector('.goal-czeka') as HTMLElement;
          return {
            czeka: kolor(czeka),
            biezacy: kolor(li('drewno2')),
            zrobiony: kolor(li('przeszukaj')),
            kolko: getComputedStyle(czeka, '::before').borderTopStyle,
            kolkoBiezacego: getComputedStyle(li('drewno2'), '::before').borderTopStyle,
            nieprzezroczystosc: getComputedStyle(czeka).opacity,
            dopisek: getComputedStyle(dopisek).fontStyle,
            kreska: getComputedStyle(czeka).textDecorationLine,
          };
        });
        console.log(`  styl: ${JSON.stringify(styl)}`);
        if (styl.czeka === styl.biezacy || styl.czeka === styl.zrobiony)
          throw new Error(`${name}: cel czekający wygląda jak bieżący albo zrobiony (${styl.czeka})`);
        if (styl.kolko !== 'dashed' || styl.kolkoBiezacego === 'dashed')
          throw new Error(`${name}: kółko czekającego ${styl.kolko}, bieżącego ${styl.kolkoBiezacego}`);
        if (styl.nieprzezroczystosc !== '1' || styl.dopisek !== 'italic' || styl.kreska.includes('line-through'))
          throw new Error(`${name}: styl czekającego ${JSON.stringify(styl)}`);
        await ukladZPanelami(page, `${name} 1440×900`, false, { zrzut: `${name}-karta-budowa` });
      },
    });

  /** Przewija drugi dzień do chwili, w której pod bramą stoi handlarz (okazja O2), z odpowiedziami na okna po drodze. */
  const doHandlarza = async (page: Page, dotyk: boolean): Promise<void> => {
    const limit = minutaGry(2, 20);
    await przewin(
      page,
      async (t) => {
        if (t > limit) throw new Error('handlarz nie stanął pod bramą do 20:00 dnia 2');
        return (await widok(page)).okazja?.tytul === 'Teraz: handlarz pod bramą';
      },
      { dotyk, krok: () => 10 },
    );
    await page.waitForSelector('#goals .goals-okazja');
  };

  /** Okazja z handlarzem pod bramą nad rozdziałem „Drugi dzień”: blok okazji stoi przed nagłówkiem rozdziału, ma bieżący cel
      i jego podpowiedź, a rozdział pod nim swoją. Prawy przycisk na handlarzu daje w menu oferty „Dać … za …”. */
  const handlarz = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, false);
        await doHandlarza(page, false);
        const hm = await page.evaluate(
          () => `${document.getElementById('hDay')!.textContent} ${document.getElementById('hTime')!.textContent}`,
        );
        console.log(`  handlarz pod bramą: ${hm}`);
        const uklad = await page.evaluate(() => {
          const g = document.getElementById('goals')!;
          return {
            pierwszy: g.firstElementChild?.className ?? '',
            tytul: g.querySelector('.goals-okazja .goals-head span')?.textContent ?? '',
            rozdzial: g.querySelector(':scope > .goals-head span')?.textContent ?? '',
            blokPrzed:
              !!g.querySelector('.goals-okazja')?.compareDocumentPosition(g.querySelector(':scope > .goals-head')!) &&
              !!(
                g.querySelector('.goals-okazja')!.compareDocumentPosition(g.querySelector(':scope > .goals-head')!) &
                Node.DOCUMENT_POSITION_FOLLOWING
              ),
          };
        });
        if (uklad.pierwszy !== 'goals-okazja' || !uklad.blokPrzed)
          throw new Error(`${name}: blok okazji nie stoi przed rozdziałem: ${JSON.stringify(uklad)}`);
        if (uklad.tytul !== 'Teraz: handlarz pod bramą' || uklad.rozdzial !== 'Drugi dzień')
          throw new Error(`${name}: tytuły „${uklad.tytul}” / „${uklad.rozdzial}”`);
        const ok = await wiersze(page, 'okazja');
        if (ok.length !== 1 || ok[0].key !== 'wymiana' || !ok[0].klasy.includes('now'))
          throw new Error(`${name}: cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        zawiera(name, ok[0].tekst, 'Wymieńcie coś z handlarzem.');
        zawiera(
          name,
          ok[0].jak ?? '',
          'Zaznaczcie kogoś i prawy przycisk na handlarzu albo wózku',
          'Dać … za …',
          'Złom jest tu walutą',
        );
        const wr = await wiersze(page, 'rozdzial');
        if (wr.length !== 5 || wr.filter((x) => x.jak !== null).length > 1)
          throw new Error(`${name}: rozdział pod okazją ${wr.map((x) => x.key).join()}`);
        console.log(
          `  okazja: ${ok[0].tekst} | rozdział: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`,
        );
        await ukladZPanelami(page, `${name} 1440×900`, false, {
          zrzut: `${name}-karta-budowa`,
          znane: ZNANE_NA_KOMPUTERZE,
        });
        // to, co mówi podpowiedź: osoba zaznaczona, prawy przycisk na handlarzu, w menu oferty „Dać … za …”
        await kliknij(page, '#lista .lp >> nth=0', false);
        await page.waitForSelector('#card:not([hidden])');
        const cam = await kamera(page);
        const xy = await page.evaluate(() => {
          const zm = window.zm!;
          const st = zm.sim!.st;
          const h = st.pawns.find((p) => p.id === st.obcy!.trader)!;
          zm.setCam(h.x, h.y, 1.6);
          return [h.x, h.y];
        });
        await waitIdle(page);
        const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.4), xy);
        await page.mouse.click(sx, sy, { button: 'right' });
        await page.waitForSelector('#ctx:not([hidden])');
        const pozycje = await page.locator('#ctx .ctx-item').allTextContents();
        console.log(`  menu na handlarzu: ${pozycje.join(' | ')}`);
        if (!pozycje.some((p) => p.startsWith('Dać ')))
          throw new Error(`${name}: w menu handlarza nie ma „Dać … za …”`);
        await zrzut(page, `${name}-menu`);
        // wymiana: pierwsza oferta, na którą starcza materiału; po jej zakończeniu okazja jest zrobiona i blok znika
        const mozliwa = page.locator('#ctx .ctx-item:not(.off)', { hasText: /^Dać / });
        if (await mozliwa.count()) {
          await mozliwa.first().click();
          // osoba idzie do handlarza i targuje się kilka minut gry; okna zarządu po drodze dostają odpowiedź
          await przewin(page, async () => (await widok(page)).okazja?.tytul !== 'Teraz: handlarz pod bramą', {
            dotyk: false,
            krok: () => 4,
            maks: 40,
          });
          await page.waitForTimeout(500);
          const handel = await page.evaluate(() => window.zm!.sim!.st.obcy!.offers.some((o) => o.left < 2));
          const v = await widok(page);
          console.log(
            `  po wymianie: oferta przyjęta ${handel}, okazja ${v.okazja ? `„${v.okazja.tytul}”` : 'zamknięta'}`,
          );
          if (!handel) throw new Error(`${name}: okazja zamknięta bez wymiany`);
          if (await page.$('#goals .goals-okazja'))
            throw new Error(`${name}: po wymianie blok okazji dalej jest w okienku`);
        } else {
          console.log('  żadna oferta nie jest dostępna (brak materiału): wymiany nie próbuję');
          await page.keyboard.press('Escape');
        }
        await przywrocKamere(page, cam);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      },
    });

  /** Okazja ugryzienia w trybie zombie nad pierwszym dniem: po samouczku ktoś z zarządu ma ugryzienie w kończynę w stanie gry,
      okazja pokazuje jego imię i cel amputacji, a karta ugryzionego ma przycisk „Amputować”, o którym mówi podpowiedź. */
  const ugryzienie = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&tryb=zombie&${GRA}`);
        await chopDryTree(page);
        // okazje ruszają dopiero po krokach samouczka
        await przewin(page, async () => (await page.evaluate(() => window.zm!.sim!.st.tut.step)) >= 6, {
          dotyk: false,
          krok: () => 10,
        });
        // w trybie zombie samouczek kończy się dopiero wieczorem (drewno z suchego drzewa dochodzi do składu po 21:00), więc pod
        // ugryzieniem może już stać okazja stada; ugryzienie jest ważniejsze i ją wypiera
        const przed = (await widok(page)).okazja;
        console.log(`  przed ugryzieniem: ${przed ? `„${przed.tytul}”` : 'bez okazji'}`);
        if (przed && przed.tytul !== 'Teraz: stado pod siatką')
          throw new Error(`${name}: okazja „${przed.tytul}” przed ugryzieniem`);
        // pierwsza osoba ugryziona w kończynę pół godziny gry temu (jak w scenariuszu listy w trybie zombie); ktoś inny z zarządu
        // jest na miejscu i zdrowy, więc jest komu amputować
        const kto = await page.evaluate(() => {
          const zm = window.zm!;
          const st = zm.sim!.st;
          const p = st.pawns.find((q) => q.kind === 'core')!;
          p.bite = st.tick - 400;
          p.limb = true;
          return { pawn: p.id, imie: st.people[p.person].first };
        });
        await page.waitForSelector('#goals .goals-okazja');
        await page.waitForTimeout(450);
        const v = await widok(page);
        console.log(`  okazja: ${v.okazja?.tytul} | ${v.okazja?.cele[0]?.text} | rozdział ${v.rozdzial?.k}`);
        if (v.okazja?.tytul !== 'Teraz: ugryzienie') throw new Error(`${name}: okazja „${v.okazja?.tytul}”`);
        const ok = await wiersze(page, 'okazja');
        if (ok.length !== 1 || ok[0].key !== 'amputacja' || !ok[0].klasy.includes('now'))
          throw new Error(`${name}: cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (ok[0].tekst !== `Ratujcie: ${kto.imie} potrzebuje amputacji.`)
          throw new Error(`${name}: cel „${ok[0].tekst}”`);
        zawiera(name, ok[0].jak ?? '', 'Amputować', 'pół godziny', 'Po dwóch godzinach jest za późno');
        const n = await naglowek(page);
        if (n.tytul !== 'Pierwszy dzień') throw new Error(`${name}: pod okazją rozdział „${n.tytul}”`);
        await ukladZPanelami(page, `${name} 1440×900`, false, {
          zrzut: `${name}-karta-budowa`,
          znane: ZNANE_NA_KOMPUTERZE,
        });
        // karta ugryzionego ma przycisk „Amputować” (chip pierwszej osoby to ta sama osoba)
        await kliknij(page, `#lista .lp[data-pawn="${kto.pawn}"]`, false);
        await page.waitForSelector('#card:not([hidden])');
        await page.waitForTimeout(450);
        const karta = await page.evaluate(() => ({
          przycisk: document.querySelector('#card [data-card="amputate"]')?.textContent ?? '',
          ugryzienie: document.querySelector('#card .bite')?.textContent ?? '',
        }));
        console.log(`  karta: ${karta.ugryzienie} [${karta.przycisk}]`);
        if (karta.przycisk !== 'Amputować') throw new Error(`${name}: na karcie ugryzionego nie ma „Amputować”`);
        zawiera(name, karta.ugryzienie, 'Ugryzion', 'w rękę albo nogę');
        await zrzut(page, `${name}-karta`);
        await page.keyboard.press('Escape');
      },
    });

  /** Droga do zwycięstwa po ostatnim rozdziale na świeżej grze (`zm.rozdzial('koniec')` bez wpisów zostaje przy „koniec”;
      w grze, która ma już zaliczone cele, następny krok ścieżki otworzyłby kolejny rozdział): okienko ma wiersze „{nazwa}:
      {co dalej}” z ekranu dróg, na Przymorzu bez terenu (tam wspólny płot nie dosięga sąsiada), a nagłówek zwija je do
      pierwszego. */
  const drogi = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&${GRA}`);
        await rozdzial(page, 'koniec');
        const v = await widok(page);
        if (v.rozdzial || !v.drogi?.length)
          throw new Error(`${name}: widok po ostatnim rozdziale ${JSON.stringify(v)}`);
        const n = await page.evaluate(() => document.querySelector('#goals > .goals-head span')?.textContent ?? '');
        if (n !== 'Drogi do zwycięstwa') throw new Error(`${name}: nagłówek „${n}”`);
        await ustawOkienko(page, true, dotyk);
        const wr = await wiersze(page, 'drogi');
        const teksty = wr.map((x) => x.tekst);
        console.log(`  wiersze: ${teksty.join(' | ')} (${wr.map((x) => x.postep ?? '-').join(', ')})`);
        // te same wiersze, co na ekranie dróg: kolejność i teksty z `zm.zwyciestwo()`, tylko drogi z „co dalej”
        const ekran = await page.evaluate(() =>
          window
            .zm!.zwyciestwo()
            .filter((p) => p.dalej)
            .map((p) => `${p.nazwa.pl}: ${p.dalej!.pl}`),
        );
        if (teksty.join('\n') !== ekran.join('\n'))
          throw new Error(`${name}: okienko ${teksty.join(' | ')}, ekran dróg ${ekran.join(' | ')}`);
        if (teksty.some((t) => t.startsWith('Za Murem')))
          throw new Error(`${name}: na Przymorzu okienko ma drogę terenu, choć wspólny płot nie dosięga sąsiada`);
        if (!wr[0].klasy.includes('now') || wr.slice(1).some((x) => x.klasy.length))
          throw new Error(
            `${name}: tylko pierwszy wiersz ma być bieżący (${wr.map((x) => x.klasy.join('+')).join(', ')})`,
          );
        const ludnosc = wr.find((x) => x.tekst.startsWith('Nowe osiedle'));
        if (!ludnosc?.postep || !/^\d+ z \d+$/.test(ludnosc.postep))
          throw new Error(`${name}: postęp ludności „${ludnosc?.postep}”`);
        await ukladZPanelami(page, `${name} ${w}×${h}`, dotyk, { zrzut: `${name}-karta-budowa`, rozwiniete: true });
        // nagłówek zwija okienko do pierwszego wiersza (także na komputerze) i rozwija z powrotem
        await ustawOkienko(page, false, dotyk);
        if ((await wiersze(page, 'drogi')).length !== 1)
          throw new Error(`${name}: zwinięte okienko dróg ma więcej niż jeden wiersz`);
        await zrzut(page, `${name}-zwiniete`);
        await ukladZPanelami(page, `${name} ${w}×${h}, zwinięte`, dotyk);
        await ustawOkienko(page, true, dotyk);
        if ((await wiersze(page, 'drogi')).length !== wr.length)
          throw new Error(`${name}: po rozwinięciu nie wróciły wszystkie wiersze`);
      },
    });

  /** Telefon (390×844, a jeden scenariusz na 360 px): okienko zwinięte do jednego bieżącego celu, po stuknięciu w nagłówek
      rozwinięte; z okazją (handlarz) zwinięte okienko pokazuje samą okazję (bez rozdziału), rozwinięte okazję nad
      rozdziałem. W każdym stanie osoba zaznaczona i panel budowy (arkusz od dołu) sprawdzają układ. */
  const telefon = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      touch: true,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, true);
        // zwinięte (na telefonie od początku): nagłówek rozdziału z licznikiem i bieżący cel z podpowiedzią dla dotyku
        const zwiniete = await page.$eval('#goals .goals-head', (e) => e.getAttribute('aria-expanded'));
        if (zwiniete !== 'false') throw new Error(`${name}: okienko na telefonie nie jest zwinięte (${zwiniete})`);
        let wr = await wiersze(page, 'rozdzial');
        if (wr.length !== 1 || wr[0].key !== 'przeszukaj' || !wr[0].klasy.includes('now') || !wr[0].jak)
          throw new Error(`${name}: zwinięty rozdział ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        zawiera(name, wr[0].jak, 'Stuknijcie kogoś', 'przytrzymajcie palec');
        nieZawiera(name, wr[0].jak, 'prawy przycisk', 'Kliknijcie');
        const n = await naglowek(page);
        if (n.tytul !== 'Drugi dzień' || n.licznik !== '0/5')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const podpowiedz = await page.$eval('#goals .goals-head', (e) => e.getAttribute('title') ?? '');
        if (podpowiedz !== 'Stuknij, żeby rozwinąć listę')
          throw new Error(`${name}: podpowiedź nagłówka „${podpowiedz}”`);
        await ukladZPanelami(page, `${name} ${w}×${h}, rozdział zwinięty`, true, { zrzut: `${name}-r1-zwiniete` });
        // rozwinięte: wszystkie pięć celów, tylko bieżący z podpowiedzią
        await ustawOkienko(page, true, true);
        wr = await wiersze(page, 'rozdzial');
        if (wr.length !== 5 || wr.filter((x) => x.jak !== null).length !== 1)
          throw new Error(`${name}: rozwinięty rozdział ${wr.map((x) => x.key).join()}`);
        await ukladZPanelami(page, `${name} ${w}×${h}, rozdział rozwinięty`, true, {
          zrzut: `${name}-r1-rozwiniete`,
          rozwiniete: true,
        });
        await ustawOkienko(page, false, true);
        // okazja: handlarz pod bramą
        await doHandlarza(page, true);
        await page.waitForTimeout(450);
        const blok = await page.evaluate(() => ({
          rozdzial: !!document.querySelector('#goals ol[data-blok="rozdzial"]'),
          naglowekRozdzialu: !!document.querySelector('#goals > .goals-head'),
          okazja: document.querySelector('#goals .goals-okazja .goals-head span')?.textContent ?? '',
          rozwiniete: document.querySelector('#goals .goals-head')?.getAttribute('aria-expanded'),
        }));
        if (
          blok.rozdzial ||
          blok.naglowekRozdzialu ||
          blok.okazja !== 'Teraz: handlarz pod bramą' ||
          blok.rozwiniete !== 'false'
        )
          throw new Error(`${name}: zwinięte okienko z okazją: ${JSON.stringify(blok)}`);
        const ok = await wiersze(page, 'okazja');
        if (ok.length !== 1 || ok[0].key !== 'wymiana' || !ok[0].klasy.includes('now') || !ok[0].jak)
          throw new Error(`${name}: zwinięta okazja ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        zawiera(name, ok[0].jak, 'Stuknijcie kogoś i przytrzymajcie palec na handlarzu albo wózku');
        await ukladZPanelami(page, `${name} ${w}×${h}, okazja zwinięta`, true, { zrzut: `${name}-okazja-zwinieta` });
        await ustawOkienko(page, true, true);
        const razem = await page.evaluate(() => ({
          okazja: !!document.querySelector('#goals .goals-okazja ol'),
          rozdzial: document.querySelectorAll('#goals ol[data-blok="rozdzial"] li').length,
          kolejnosc: document.getElementById('goals')!.firstElementChild?.className ?? '',
        }));
        if (!razem.okazja || razem.rozdzial !== 5 || razem.kolejnosc !== 'goals-okazja')
          throw new Error(`${name}: rozwinięte okienko z okazją: ${JSON.stringify(razem)}`);
        await ukladZPanelami(page, `${name} ${w}×${h}, okazja rozwinięta`, true, {
          zrzut: `${name}-okazja-rozwinieta`,
          rozwiniete: true,
        });
      },
    });

  /** Angielski: drugi dzień i karta nocy bez polskich liter (w tekście i w atrybutach okienka), z linią „Goal: …” w oknie. */
  const angielski = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, false);
        const w = await sprawdzR1(page, name, { en: true });
        console.log(`  ${w.map((x) => `${x.key}${x.klasy.length ? `(${x.klasy.join('+')})` : ''}`).join(' ')}`);
        await okienkoBezPolskich(page, name);
        const tytul = await page.$eval('#goals .goals-head', (e) => e.getAttribute('title') ?? '');
        if (tytul !== 'Click to collapse the list') throw new Error(`${name}: podpowiedź nagłówka „${tytul}”`);
        await ukladZPanelami(page, `${name} 1440×900`, false, { zrzut: `${name}-karta-budowa` });
        // karta nocy dnia 2: linia celu po angielsku
        const o = await przewin(page, () => false, { dotyk: false, stop: ['karta'] });
        if (o !== 'karta') throw new Error(`${name}: przed 20:00 nie otworzyła się karta nocy`);
        const linia = await liniaCeluOkna(page, `${name}, karta nocy`);
        if (linia !== 'Goal: Put someone on stove watch.') throw new Error(`${name}: linia celu „${linia}”`);
        const kartaPl = polskieLitery(linia);
        if (kartaPl.length) throw new Error(`${name}: polskie litery w linii celu: ${kartaPl.join(', ')}`);
        await zrzut(page, `${name}-karta`);
        await kliknij(page, '#sheet [data-act="night-go"]', false);
        await zamknijOkna(page, false);
        await page.waitForTimeout(450);
        const po = await wiersze(page, 'rozdzial');
        const html2 = await page.$eval('#goals', (e) => e.textContent ?? '');
        const pl2 = polskieLitery(html2);
        if (pl2.length) throw new Error(`${name}: polskie litery po karcie: ${pl2.join(', ')}`);
        console.log(`  po karcie: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
      },
    });

  /** Zaliczenie drewna na wieczór przeżywa zapis, zjedzenie zapasu przez kozę i przeładowanie strony: po samouczku trzy sztuki
      drewna na składzie zaliczają cel, koza zjada je przed zebraniem, stan idzie do zapisu (`Save.cele`) i po „Kontynuuj”
      cel dalej jest zaliczony, choć zapasu w świecie już nie ma. To jedyne sprawdzenie okablowania zapisu stanu ścieżki
      w `main.ts`. */
  const przeladowanie = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await chopDryTree(page);
        await przewin(page, async () => (await page.evaluate(() => window.zm!.sim!.st.tut.step)) >= 6, {
          dotyk: false,
          krok: () => 10,
        });
        const drewno = async (v?: WidokSciezki) =>
          (v ?? (await widok(page))).rozdzial!.cele.find((c) => c.key === 'drewno')!;
        if ((await drewno()).done)
          throw new Error(`${name}: drewno zaliczone przed zapasem (${await zapasDrewna(page)} szt.)`);
        // trzy sztuki na składzie: zapas wystarczy na ogień do snu
        await dolozDrewno(page, 3);
        await page.waitForTimeout(450);
        if (!(await drewno()).done) throw new Error(`${name}: trzy sztuki na składzie nie zaliczyły drewna`);
        console.log(`  zaliczone przy zapasie ${await zapasDrewna(page)} szt.`);
        // koza zjada zapas (zarząd dokłada ze składu do kozy), zanim przyjdzie zebranie o 19:30
        await przewin(page, async () => (await zapasDrewna(page)) < 3, { dotyk: false, krok: () => 5, maks: 60 });
        const zapas = await zapasDrewna(page);
        const hm = await page.evaluate(() => document.getElementById('hTime')!.textContent);
        console.log(`  koza zjadła zapas: ${zapas} szt. o ${hm}`);
        if (!(await drewno()).done) throw new Error(`${name}: po zjedzeniu zapasu drewno nie jest już zaliczone`);
        await zrzut(page, `${name}-przed`);
        // zapis i przeładowanie strony: ekran startowy z „Kontynuuj”
        if (!(await page.evaluate(() => window.zm!.save()))) throw new Error(`${name}: zapis się nie udał`);
        const wZapisie = await page.evaluate((k) => {
          const z = JSON.parse(localStorage.getItem(k)!);
          return z.cele as { rozdzial: string; zrobione: Record<string, number> } | undefined;
        }, SAVE);
        console.log(
          `  w zapisie: rozdział ${wZapisie?.rozdzial}, zaliczone ${Object.keys(wZapisie?.zrobione ?? {}).join(', ')}`,
        );
        if (!wZapisie || wZapisie.zrobione['r0.drewno'] === undefined)
          throw new Error(`${name}: zapis bez zaliczonego drewna`);
        await page.goto(`${base}?speed=0`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        await page.waitForSelector('#goals:not([hidden]) .goal');
        // po wczytaniu świat ma tyle drewna co przed zapisem (mniej niż trzy), a cel dalej jest zaliczony
        const po = await zapasDrewna(page);
        console.log(`  po „Kontynuuj”: zapas ${po} szt.`);
        if (po >= 3)
          throw new Error(`${name}: po wczytaniu zapas wrócił do ${po} szt., więc scenariusz niczego nie dowodzi`);
        const v = await widok(page);
        if (v.rozdzial?.k !== 'r0') throw new Error(`${name}: po wczytaniu rozdział ${v.rozdzial?.k}`);
        if (!(await drewno(v)).done) throw new Error(`${name}: po „Kontynuuj” drewno na wieczór nie jest zaliczone`);
        const wr = await wiersze(page, 'rozdzial');
        const wiersz = wr.find((x) => x.key === 'drewno')!;
        if (!wiersz.klasy.includes('done')) throw new Error(`${name}: w okienku drewno ${wiersz.klasy.join('+')}`);
        zawiera(name, wiersz.tekst, 'Przygotujcie drewno na wieczór.');
        console.log(`  okienko po wczytaniu: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        await ukladZPanelami(page, `${name} po wczytaniu`, false);
      },
    });

  return [
    drugiDzien('cele-r1', 'przymorze', {}),
    drugiDzien('cele-r1-dom', 'zielonki', { dom: true }),
    drugiDzien('cele-r1-zombie', 'przymorze', { zombie: true }),
    kartaNocy('cele-karta-nocy', 1440, 900, { malo: true, trzy: false }),
    kartaNocy('cele-karta-nocy-telefon', 390, 844, { malo: true, trzy: false }),
    kartaNocy('cele-karta-nocy-drewno2', 1440, 900, { malo: true, trzy: true }),
    kartaNocy('cele-karta-nocy-dosc', 1440, 900, { malo: false, trzy: true }),
    uchwala('cele-uchwala', 1440, 900),
    uchwala('cele-uchwala-telefon', 390, 844),
    spotkanie('cele-spotkanie', 1440, 900),
    spotkanie('cele-spotkanie-telefon', 390, 844),
    tablica('cele-r6-tablica', 1440, 900),
    tablica('cele-r6-tablica-telefon', 390, 844),
    czeka('cele-czeka'),
    handlarz('cele-okazja-handlarz'),
    ugryzienie('cele-okazja-ugryzienie'),
    drogi('cele-drogi', 1440, 900),
    drogi('cele-drogi-telefon', 390, 844),
    telefon('cele-telefon', 390, 844),
    telefon('cele-telefon-360', 360, 780),
    angielski('en-cele-r1'),
    przeladowanie('cele-przeladowanie'),
  ];
}
