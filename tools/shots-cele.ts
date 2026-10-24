/* Zrzuty i sprawdzenia okienka celów ze ścieżki (src/ui/sciezka.ts) do `npm run shots` (scenariusze cele-* i en-cele-r1):
   drugi dzień (R1) w bloku, w domu i w trybie zombie, rozdział „Praca” (R3) obok panelu Pracy i karty osoby (`cele-r3*`) oraz
   przeklikany prawdziwymi zdarzeniami (`cele-r3-ustawienia*`), cel czekający, okazje (handlarz, wędrowiec z werbunkiem, ugryzienie), linia „Cel: …” w oknach
   karty nocy, uchwały, spotkania z sąsiadami i na tablicy badań, widok dróg do zwycięstwa po ostatnim rozdziale (świeża gra),
   telefon 390×844 i 360 px, angielski bez polskich liter, okienko ograniczone do miejsca nad kartą osoby i przewijane do
   bieżącego celu (`cele-przewijanie`) oraz zaliczenie drewna na wieczór, które przeżywa zapis, zjedzenie zapasu przez kozę
   i przeładowanie strony („Kontynuuj”).

   Każdy scenariusz sam sprawdza tekst okienka `#goals` (tytuł, licznik, teksty celów, podpowiedź tylko przy bieżącym,
   dopisek „czeka”, kolejność bloku okazji i rozdziału) i to, że okienko nie nachodzi na pasek u góry, listę ludzi, kartę
   osoby i panel budowy (`sprawdzUklad` → `ukladZPanelami`: zaznacza osobę, otwiera panel budowy i po każdym kroku sprawdza
   przecięcia prostokątów, a także że okienko mieści się w oknie i nie przewija strony w bok). Okna z linią „Cel: …”
   sprawdza po tekście linii i po tym, że mieści się w oknie na komputerze i na telefonie.

   Okienko ma ograniczoną wysokość (src/style.css, `.goals`: nie dalej niż karta osoby) i przewija się w środku, więc
   `naruszenia` sprawdza też, że pierwszy bieżący cel z podpowiedzią mieści się w całości w widocznej części okienka (bez
   tego przycięta lista przechodziłaby, bo prostokąt okienka się mieści), a w przewiniętym okienku, że nagłówek rozdziału
   (przykleja się u góry, `.goals > .goals-head`) jest w jego widocznej części i że cel pod nim leży poniżej nagłówka;
   nachodzenie okienka na kartę osoby, pasek, listę ludzi i panel budowy jest po prostu usterką, także na komputerze.
   Przewijanie do bieżącego celu robi `pokazBiezacyCel` w src/main.ts, a `cele-przewijanie` pilnuje go na długiej liście
   zrobionych i po zmianie rozdziału, a także tego, że spod nagłówka nie wystaje przecięty wiersz.

   Układ na telefonie sprawdza okienko w jego stanie domyślnym, zwiniętym do jednego bieżącego celu; rozwiniętą listę
   (stuknięcie w nagłówek) tylko tak, że karta osoby, arkusz budowy od dołu i podpowiedź u dołu, które rysuje się nad nią, są
   zamierzone (`dozwolone`), ale zakrywają najwyżej to, co leży pod bieżącym celem z jego podpowiedzią, a pasek, lista ludzi
   i krawędzie okna dalej muszą się zgadzać. Lista ludzi na telefonie schodzi pod okienko, więc jej nachodzenie na arkusz
   budowy albo kartę osoby idzie do logu, ale nie może przekroczyć `LISTA_NA_PRZESZKODZIE_MAX` px.

   Stan gry scenariusze prowadzą grą (samouczek, noc, raport, przewijanie przez `zm.ff` z odpowiedziami na okna zarządu),
   a tam, gdzie gra potrzebuje do tego godzin ludzkiej roboty, ustawiają stan wprost jak dzisiejsze scenariusze (pracownia,
   ugryzienie, zapas drewna, trzy pierwsze cele), a rozdział hakiem `zm.rozdzial` (na świeżej grze czekają wtedy, aż zniknie
   podpowiedź startowa). Tekst jest sprawdzany w DOM, nie w widoku `zm.cele()`; widok służy do sprawdzenia, co jest
   zaliczone, a co przepadło. Hak `window.zm` ma już `cele()` i `rozdzial()`. Czekanie na stan idzie przez selektory
   i treść okienka; tam, gdzie nie ma na co czekać, przez `poHudzie` (jedyne `waitForTimeout` w pliku). */

import path from 'node:path';
import type { Page } from '@playwright/test';
import type { BuildKind } from '../src/sim/budowle.ts';
import { minutesAt, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { NIGHT_WOOD } from '../src/ui/cele.ts';
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
const TILE = 32;
const GRA = 'speed=0&cam=hq,1.3';
/** słowa z bloku, których w domu nie ma w celach i w ich podpowiedziach (jak BLOKOWE_UI w tools/shots.ts) */
const BLOKOWE_UI = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;

/** telefon: okno węższe niż 640 px (jak w tools/shots.ts: `isMobile` i dotyk) */
const dotykowy = (w: number): boolean => w < 640;
/** klik albo stuknięcie, zależnie od ekranu */
const kliknij = (page: Page, sel: string, dotyk: boolean) => (dotyk ? page.tap(sel) : page.click(sel));

/** Co ile `hud` w main.ts odświeża okienko celów, listę ludzi i kartę osoby (ms). */
const HUD_MS = 200;
/** Czeka, aż odświeży się wszystko, co rysuje `hud`, i dojdzie układ: po zmianie stanu gry, której żaden hak nie odświeża od razu
    (`zm.rozdzial` i `zm.cele` odświeżają okienko same), trzeba odczekać dwa okresy `HUD_MS` oraz klatkę, w której
    ResizeObserver ustawia `--goals-h` i `--card-h`; `okresy` to liczba okresów (dłuższe czekanie sprawdza, że odświeżenia
    czegoś nie cofają). Tylko tu jest `waitForTimeout`: gdzie jest stan, na który da się poczekać (selektor, treść okienka),
    scenariusze czekają na niego. */
const poHudzie = (page: Page, okresy = 2): Promise<void> => page.waitForTimeout(okresy * HUD_MS + 50);

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

/** Czcionki Barlow i Barlow Condensed z Google Fonts są wczytane (bez sieci strona używa zapasowych, o innej szerokości, więc
    układ w zrzutach byłby inny i nic by nie dowodził: lepiej od razu przerwać i powtórzyć scenariusz). */
async function sprawdzCzcionki(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    await document.fonts.ready;
    const wczytane = (rodzina: string) =>
      [...document.fonts].some((f) => f.family.replaceAll('"', '') === rodzina && f.status === 'loaded');
    return wczytane('Barlow') && wczytane('Barlow Condensed');
  });
  if (!ok) throw new Error('czcionki Barlow z Google Fonts się nie wczytały (sieć?): powtórz scenariusz');
}

/** Przejście na adres z jedną ponowną próbą po przekroczeniu czasu: strona czeka na arkusz stylów z Google Fonts, a gdy sieć
    się zacina, `load` nie przychodzi przez pół minuty (zrzuty padają wtedy z `TimeoutError`, nie z błędu gry). */
async function idz(page: Page, adres: string): Promise<void> {
  try {
    await page.goto(adres);
  } catch (e) {
    if ((e as Error).name !== 'TimeoutError') throw e;
    console.log('  (sieć: przejście na stronę przekroczyło czas, druga próba)');
    await page.goto(adres);
  }
}

/** start gry i czekanie na pierwsze chipy listy ludzi (portrety rysuje `hud` co 200 ms) */
async function start(page: Page, base: string, query: string): Promise<void> {
  await idz(page, `${base}?${query}`);
  await waitIdle(page);
  await page.waitForSelector('#lista:not([hidden]) .lp');
  await sprawdzCzcionki(page);
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

/** ustawia rozdział ścieżki hakiem do zrzutów (haczyk rysuje okienko od razu) i czeka na układ po jego zmianie; `dobyTemu` cofa
    tick otwarcia o tyle dób gry (rozdział otwarty wcześniej, bez grania tych dób) */
async function rozdzial(page: Page, k: KluczRozdzialu, dobyTemu = 0): Promise<void> {
  await page.evaluate(([r, d]) => window.zm!.rozdzial(r as KluczRozdzialu, d as number), [k, dobyTemu] as const);
  await poHudzie(page);
}

/** Podpowiedź z początku nowej gry („To wasz zarząd… Cele pierwszego dnia są po lewej.”) wisi 9 s od startu (`say(…, 9000)`
    w main.ts) i mija sama. Scenariusze, które ustawiają rozdział hakiem na świeżej grze (uchwała, spotkanie, tablica,
    drogi), czekają, aż zniknie, tak jak w grze: inaczej zrzut pokazywałby obok rozdziału R4, R6, R7 albo „Dróg do
    zwycięstwa” zdanie o celach pierwszego dnia, którego gracz w tym rozdziale nie zobaczy. */
async function poPodpowiedziStartowej(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, { timeout: 15_000 });
}

/** Wieść z rozmowy z wędrowcem (`say(…, 7000)` w main.ts, gdy `obcy.wiesc` się zmienia) wisi 7 s w podpowiedzi u dołu, na telefonie
    wąskiej i wysokiej (`left: 50%` zostawia jej połowę szerokości), nad kartą osoby. Przez te sekundy może zakrywać dolną
    krawędź okienka celów (przed zmianą podpowiedzi zaproszenia o 3 px, po niej o 20 px); mija sama, więc scenariusz sprawdza
    układ po niej, jak gracz, który zdążył ją przeczytać. */
async function poWiesci(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, { timeout: 15_000 });
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
  /** dopisek zaliczonego celu (`goal-uwaga`) */
  uwaga: string | null;
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
        uwaga: e.querySelector('.goal-uwaga')?.textContent ?? null,
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

/** Nachodzenie okienka celów na inny element ekranu: `co` to nazwa przeszkody (do listy `dozwolone`), `gora` to jej górna
    krawędź na ekranie, `w` i `h` to wymiary części wspólnej w pikselach, `tekst` to opis do komunikatu. */
interface Nachodzenie {
  co: string;
  gora: number;
  w: number;
  h: number;
  tekst: string;
}

/** Wynik `naruszenia`: nachodzenia na przeszkody, inne naruszenia (opisy) i położenie na ekranie pierwszego bieżącego celu
    z podpowiedzią (null, gdy okienko nie ma bieżącego celu). */
interface Naruszenia {
  nachodzi: Nachodzenie[];
  inne: string[];
  cel: { gora: number; dol: number } | null;
}

/** nazwy przeszkód w bierniku (do komunikatów i do listy `dozwolone` niżej) */
const KARTA = 'kartę osoby';
const PANEL_BUDOWY = 'panel budowy';
const PODPOWIEDZ = 'podpowiedź u dołu';

/** Okienko celów nie nachodzi na nic, co stoi obok (pasek u góry, chipy listy ludzi, karta osoby, panele budowy i Pracy,
    przyciski przybliżenia, minimapa, komunikat o przybyszach, znacznik suchego drzewa, pasek stawiania, podpowiedź u dołu),
    mieści się w oknie, nie jest szersze niż jego ramka i nie przewija strony w bok. Okienko wyższe od miejsca nad kartą
    przewija się w środku (`max-height` w style.css), więc dodatkowo pierwszy bieżący cel z podpowiedzią (`ol.goal-list
    li.now` i jego `.goal-how`) ma być w całości w widocznej części okienka (między jego ramkami), a nie pod dolną krawędzią
    ani nad górną: bez tego przycięta lista przechodziłaby, bo prostokąt okienka się mieści. Zwraca nachodzenia, inne
    naruszenia (opisy) i położenie tego celu. */
async function naruszenia(page: Page): Promise<Naruszenia> {
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
      if (!widoczny(cele)) return { nachodzi: [], inne: ['okienko celów jest niewidoczne'], cel: null };
      const opis = (r: DOMRect) =>
        `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
      const a = cele.getBoundingClientRect();
      const inne: string[] = [];
      if (a.left < 0 || a.top < 0 || a.right > innerWidth + 0.5 || a.bottom > innerHeight + 0.5)
        inne.push(`okienko celów wystaje z okna (${opis(a)} w oknie ${innerWidth}×${innerHeight})`);
      if (cele.scrollWidth > cele.clientWidth + 1)
        inne.push(`treść okienka szersza niż ono samo (${cele.scrollWidth} > ${cele.clientWidth})`);
      if (document.documentElement.scrollWidth > innerWidth + 1) inne.push('strona przewija się w poziomie');
      // widoczna część okienka: pole z dopełnieniem, bez ramki (i bez paska przewijania)
      const widocznaGora = a.top + cele.clientTop;
      const widocznyDol = widocznaGora + cele.clientHeight;
      // nagłówek rozdziału (bezpośrednie dziecko okienka; nagłówek okazji siedzi w jej bloku) przykleja się do góry
      // przewiniętego okienka, więc przewinięte okienko ma go w widocznej części, a cel pod nim leży poniżej jego dołu
      const glowa = cele.querySelector<HTMLElement>(':scope > .goals-head');
      const g = glowa?.getBoundingClientRect() ?? null;
      if (g && cele.scrollTop > 0 && (g.top < widocznaGora - 1 || g.bottom > widocznyDol + 1))
        inne.push(
          `nagłówek rozdziału poza widoczną częścią przewiniętego okienka (nagłówek ${Math.round(g.top)}–${Math.round(g.bottom)} px, widoczna część okienka ${Math.round(widocznaGora)}–${Math.round(widocznyDol)} px, przewinięcie ${Math.round(cele.scrollTop)} px)`,
        );
      let cel: { gora: number; dol: number } | null = null;
      const biezacy = cele.querySelector<HTMLElement>('ol.goal-list li.now');
      if (biezacy) {
        const r = biezacy.getBoundingClientRect();
        const jak = biezacy.querySelector('.goal-how')?.getBoundingClientRect();
        const dol = Math.max(r.bottom, jak?.bottom ?? r.bottom);
        cel = { gora: r.top, dol };
        // od góry widoczna część zaczyna się pod nagłówkiem rozdziału, ale tylko dla celu pod nim (cel w bloku okazji leży nad nim)
        const podNaglowkiem =
          !!glowa && (glowa.compareDocumentPosition(biezacy) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        const gora = g && podNaglowkiem ? Math.max(widocznaGora, g.bottom) : widocznaGora;
        if (dol > widocznyDol + 1)
          inne.push(
            `bieżący cel albo jego podpowiedź przycięte u dołu okienka (kończą się na ${Math.round(dol)} px, widoczna część okienka na ${Math.round(widocznyDol)} px, przewinięcie ${Math.round(cele.scrollTop)} px z ${Math.round(cele.scrollHeight - cele.clientHeight)})`,
          );
        if (r.top < gora - 1)
          inne.push(
            `bieżący cel przycięty u góry okienka (zaczyna się na ${Math.round(r.top)} px, widoczna część okienka od ${Math.round(gora)} px${gora > widocznaGora ? ', pod nagłówkiem rozdziału' : ''}, przewinięcie ${Math.round(cele.scrollTop)} px)`,
          );
      }
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
      const nachodzi: { co: string; gora: number; w: number; h: number; tekst: string }[] = [];
      for (const [sel, nazwa] of przeszkody)
        for (const e of document.querySelectorAll(sel)) {
          if (!widoczny(e)) continue;
          const b = e.getBoundingClientRect();
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > 1)
            nachodzi.push({
              co: nazwa,
              gora: b.top,
              w: Math.round(w),
              h: Math.round(h),
              tekst: `okienko celów nachodzi na ${nazwa} o ${Math.round(w)}×${Math.round(h)} px (okienko ${opis(a)}, ${nazwa} ${opis(b)})`,
            });
        }
      return { nachodzi, inne, cel };
    },
    [KARTA, PANEL_BUDOWY, PODPOWIEDZ] as const,
  );
}

/** Ile pikseli listy ludzi na telefonie może leżeć na arkuszu budowy albo na karcie osoby (log, ale nie więcej niż tyle:
    najwięcej mierzę 54 px przy rozwiniętym okienku z okazją; granica ma pilnować, żeby nie urosło po cichu). */
const LISTA_NA_PRZESZKODZIE_MAX = 60;

/** Lista ludzi stoi pod okienkiem celów (na telefonie pod jego dolną krawędzią), więc wysokość okienka przesuwa ją, a arkusz
    budowy (od dołu) i karta osoby mogą ją przykryć. Zwraca, o ile pikseli chip listy leży na każdej z tych przeszkód
    (największe nachodzenie jednego chipa); pusta lista, gdy na żadnej. */
const listaNaPrzeszkodach = (page: Page): Promise<{ co: string; px: number }[]> =>
  page.evaluate(() => {
    const widoczny = (e: Element): boolean => {
      const h = e as HTMLElement;
      if (h.hidden) return false;
      const r = h.getBoundingClientRect();
      return getComputedStyle(h).display !== 'none' && r.width > 0 && r.height > 0;
    };
    const wynik: { co: string; px: number }[] = [];
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
      if (naj > 1) wynik.push({ co: nazwa, px: Math.round(naj) });
    }
    return wynik;
  });

interface DozwolonePrzeszkody {
  /** przeszkody, na które okienko może nachodzić, bo je rysuje się nad nim (zamierzone), ale tylko poniżej bieżącego celu
      z jego podpowiedzią */
  dozwolone?: readonly string[];
}

/** Sprawdza układ okienka celów w tej chwili: każde naruszenie przerywa scenariusz. Wyjątek to nachodzenie na przeszkodę
    z `dozwolone` (telefon, rozwinięta lista: karta, arkusz budowy i podpowiedź u dołu leżą nad nią z zamysłu), ale i ono ma
    granicę: przeszkoda zaczyna się poniżej bieżącego celu z jego podpowiedzią (pierwszy `li.now`), więc nie zakrywa tego,
    co gracz ma przeczytać. */
async function bezNachodzenia(page: Page, opis: string, o: DozwolonePrzeszkody = {}): Promise<void> {
  const n = await naruszenia(page);
  const r = await page.$eval('#goals', (e) => {
    const x = e.getBoundingClientRect();
    return `${Math.round(x.left)},${Math.round(x.top)}–${Math.round(x.right)},${Math.round(x.bottom)}`;
  });
  const zle: string[] = [...n.inne];
  const zamierzone: string[] = [];
  for (const x of n.nachodzi) {
    if (!o.dozwolone?.includes(x.co)) zle.push(x.tekst);
    else if (n.cel && x.gora < n.cel.dol - 1)
      zle.push(
        `${x.co} zakrywa bieżący cel okienka (${x.co} od ${Math.round(x.gora)} px, bieżący cel z podpowiedzią do ${Math.round(n.cel.dol)} px)`,
      );
    else zamierzone.push(`${x.co} ${x.w}×${x.h}`);
  }
  const dopisek = zamierzone.length ? `zamierzone: ${zamierzone.join(', ')}` : 'bez nachodzenia';
  console.log(`  ${opis}: okienko ${r}, ${zle.length ? `NARUSZENIA: ${zle.length}` : dopisek}`);
  if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
}

/** Opcje `ukladZPanelami`. `rozwiniete` (telefon): sprawdź okienko rozwinięte, a nie zwinięte (domyślne); karta osoby, arkusz
    budowy i podpowiedź u dołu leżą wtedy nad rozwiniętą listą, co jest zamierzone, dopóki nie zakrywają bieżącego celu.
    `zrzut`: nazwa zrzutu stanu z kartą osoby i panelem budowy. */
interface OpcjeUkladu {
  rozwiniete?: boolean;
  zrzut?: string;
}

/** Układ okienka celów w trzech stanach: samo, z kartą osoby (zaznaczoną przez chip na liście) i z kartą oraz panelem
    budowy. Na telefonie sprawdza okienko w jego domyślnym stanie, zwiniętym (z `rozwiniete` w rozwiniętym). Po sprawdzeniu
    zamyka panel i zaznaczenie (Esc dwa razy) i przywraca kamerę, którą klik w chip przesuwa. `out` to katalog zrzutów. */
async function ukladZPanelami(
  page: Page,
  opis: string,
  dotyk: boolean,
  out: string,
  o: OpcjeUkladu = {},
): Promise<void> {
  if (dotyk) await ustawOkienko(page, !!o.rozwiniete, true);
  const opcje = { dozwolone: dotyk && o.rozwiniete ? [KARTA, PANEL_BUDOWY, PODPOWIEDZ] : [] };
  await bezNachodzenia(page, `${opis}, samo okienko`, opcje);
  const cam = await kamera(page);
  await kliknij(page, '#lista .lp >> nth=0', dotyk);
  await page.waitForSelector('#card:not([hidden])');
  // karta zmienia wysokość okienka (`--card-h` w `max-height`), a `hud` przewija je do bieżącego celu
  await poHudzie(page);
  await bezNachodzenia(page, `${opis}, z kartą osoby`, opcje);
  await kliknij(page, '#btnBuild', dotyk);
  await page.waitForSelector('#buildPanel .tile');
  await poHudzie(page);
  await bezNachodzenia(page, `${opis}, z kartą osoby i panelem budowy`, opcje);
  const nakladaSie = await listaNaPrzeszkodach(page);
  for (const x of nakladaSie)
    console.log(`    uwaga (poza okienkiem celów): lista ludzi nachodzi na ${x.co} o ${x.px} px`);
  const za = nakladaSie.filter((x) => x.px > LISTA_NA_PRZESZKODZIE_MAX);
  if (za.length)
    throw new Error(
      `${opis}: lista ludzi nachodzi za bardzo (limit ${LISTA_NA_PRZESZKODZIE_MAX} px): ${za.map((x) => `${x.co} o ${x.px} px`).join(', ')}`,
    );
  if (o.zrzut) await page.screenshot({ path: path.join(out, `${o.zrzut}.png`) });
  // pierwszy Esc zamyka panel budowy, drugi zdejmuje zaznaczenie (karta znika)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.getElementById('card')!.hidden && document.getElementById('buildPanel')!.hidden,
    null,
    { timeout: 3000 },
  );
  await przywrocKamere(page, cam);
  // bez karty i panelu okienko odzyskuje wysokość, a lista ludzi miejsce
  await poHudzie(page);
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
  if (en && v.dotyk) zawiera(opis, jak, 'Tap someone', 'press and hold', 'Search the');
  else if (en) zawiera(opis, jak, 'Select someone', 'right-click', 'Search the');
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

/** Budowla gotowa w stanie gry, na pierwszym dozwolonym miejscu z menu budowy: sama rzecz w `st.things`, jak w scenariuszu
    `badania-tablica-sama` w tools/shots.ts. To nie jest `finishBuild` z src/sim/sim.ts: nie ma planu budowy do zdjęcia
    z `st.builds`, zasieki nie mają `prev` (stanu odcinka siatki sprzed budowy) i nie wzmacniają siatki (`fenceAt`), a `st.cap`
    (miejsca dla mieszkańców) nie jest przeliczone (`updateCap`). Cele „budowla” i „obwód” patrzą tylko na rzecz, więc okienko
    jest takie jak po prawdziwej budowie; skutków dla siatki i miejsc scenariusze nie sprawdzają. */
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

/** n sztuk drewna na składzie przy kozie: sama sterta w `st.things`, jak po zniesieniu ściętego drzewa (bez ścinania i noszenia) */
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
  // zmiana języka przerysowuje okno i okienko od razu, a układ dochodzi w następnej klatce
  await poHudzie(page);
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
  // okienko liczy zrobione cele w nagłówku: trzy z pięciu
  await page.waitForFunction(
    () => /^3\//.test(document.querySelector('#goals > .goals-head .goals-n')?.textContent ?? ''),
    null,
    { timeout: 5000 },
  );
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
  // HTML okienka zmienia się od razu, układ (`--goals-h`, przewinięcie do bieżącego celu) w następnej klatce
  await poHudzie(page);
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

/** Teksty celów w kolejności okienka to dokładnie te z projektu (sam zestaw kluczy nie wystarczy: tekst celu jest tym, co
    gracz czyta). */
function tekstyCelow(opis: string, wr: readonly Wiersz[], klucze: readonly string[], teksty: readonly string[]): void {
  if (wr.map((x) => x.key).join() !== klucze.join()) throw new Error(`${opis}: cele ${wr.map((x) => x.key).join()}`);
  wr.forEach((x, k) => {
    if (x.tekst !== teksty[k]) throw new Error(`${opis}: cel ${k + 1} „${x.tekst}” zamiast „${teksty[k]}”`);
  });
}

/** Blok okazji stoi w okienku przed nagłówkiem rozdziału (jest jego pierwszym dzieckiem), a oba mają oczekiwane tytuły. */
async function okazjaPrzedRozdzialem(page: Page, opis: string, okazja: string, rozdzial: string): Promise<void> {
  const u = await page.evaluate(() => {
    const g = document.getElementById('goals')!;
    const blok = g.querySelector('.goals-okazja');
    const glowa = g.querySelector(':scope > .goals-head');
    return {
      pierwszy: g.firstElementChild?.className ?? '',
      tytul: blok?.querySelector('.goals-head span')?.textContent ?? '',
      rozdzial: glowa?.querySelector('span')?.textContent ?? '',
      blokPrzed: !!blok && !!glowa && !!(blok.compareDocumentPosition(glowa) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  if (u.pierwszy !== 'goals-okazja' || !u.blokPrzed)
    throw new Error(`${opis}: blok okazji nie stoi przed rozdziałem: ${JSON.stringify(u)}`);
  if (u.tytul !== okazja || u.rozdzial !== rozdzial)
    throw new Error(`${opis}: tytuły „${u.tytul}” / „${u.rozdzial}” zamiast „${okazja}” / „${rozdzial}”`);
}

/** Ile temu ugryziona jest osoba w scenariuszu ugryzienia: pół godziny gry, więc do końca okna amputacji (dwie godziny)
    zostaje półtorej. */
const UGRYZIONA_PRZED = TICKS_PER_HOUR / 2;

/* ---------------------------------------------------------------- scenariusze */

export function celeShots(out: string): ShotCele[] {
  const shot = (s: ShotCele) => s;
  const zrzut = (page: Page, nazwa: string) => page.screenshot({ path: path.join(out, `${nazwa}.png`) });
  /** układ okienka celów (`ukladZPanelami`) ze zrzutami w katalogu `out` */
  const sprawdzUklad = (page: Page, opis: string, dotyk: boolean, o: OpcjeUkladu = {}) =>
    ukladZPanelami(page, opis, dotyk, out, o);

  /** drugi dzień w trzech miejscach i dwóch trybach: tekst okienka i układ z kartą osoby i panelem budowy; na telefonie okienko
      najpierw rozwinięte do sprawdzenia tekstów, a układ w jego domyślnym, zwiniętym stanie */
  const drugiDzien = (
    name: string,
    demo: string,
    opcje: { zombie?: boolean; dom?: boolean },
    w = 1440,
    h = 900,
  ): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=${demo}${opcje.zombie ? '&tryb=zombie' : ''}&${GRA}`);
        await doDrugiegoDnia(page, dotyk);
        if (dotyk) await ustawOkienko(page, true, true);
        const wr = await sprawdzR1(page, name, { ...opcje, dotyk });
        console.log(`  ${wr.map((x) => `${x.key}${x.klasy.length ? `(${x.klasy.join('+')})` : ''}`).join(' ')}`);
        const v = await widok(page);
        if (v.okazja) throw new Error(`${name}: okazja „${v.okazja.tytul}” przed południem dnia 2`);
        // zombie: podpowiedzi celów, które nie są bieżące, są w widoku, a nie w DOM
        if (opcje.zombie) {
          const cele = v.rozdzial!.cele;
          zawiera(name, cele.find((c) => c.key === 'dzida')!.how, 'Zrobić dzidę', '2 deski i 1 złom');
          zawiera(name, cele.find((c) => c.key === 'drewno2')!.how, 'Za siatką są szwendacze', 'Spalić');
          if (dotyk) zawiera(name, cele.find((c) => c.key === 'dzida')!.how, 'Przytrzymajcie palec na stercie');
        }
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk, { zrzut: `${name}-karta-budowa` });
        if (!opcje.zombie && !opcje.dom && !dotyk) {
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
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk);
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
        await poHudzie(page);
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
        await sprawdzUklad(page, `${name} po karcie`, dotyk, { zrzut: `${name}-po-karcie` });
      },
    });

  /** Uchwała (R4) z linią „Cel: …”: zebranie o 19:30 pierwszego dnia, ścieżka ustawiona na R4. Przed zebraniem cel uchwały
      i raportu czekają (przyciemnione, z dopiskiem „czeka do zebrania” i „czeka do rana”), w oknie uchwały cel jest bieżący,
      a podpis go zalicza. Potem gra idzie przez noc do porannego raportu: cel „wkurzenie” zalicza się razem z nim i niesie
      pod spodem lekcję („Wkurzenie spada, gdy ludzie są najedzeni i w cieple.”), czytelną w okienku na komputerze i na telefonie. */
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
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Zarząd' || n.licznik !== '0/4')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        tekstyCelow(
          name,
          wr,
          ['uchwala', 'wkurzenie', 'nowi', 'ludzie'],
          [
            'Podpiszcie kolejną uchwałę.',
            'Sprawdźcie rano w raporcie, jak zmieniło się wkurzenie.',
            'Przyjmijcie kogoś nowego.',
            'Poznajcie mieszkańców siedziby.',
          ],
        );
        const [u, k, nowi] = wr;
        if (!u.klasy.includes('czeka') || u.czeka !== 'czeka do zebrania')
          throw new Error(`${name}: uchwała przed zebraniem ${u.klasy.join('+')} / ${u.czeka}`);
        if (!k.klasy.includes('czeka') || k.czeka !== 'czeka do rana' || k.uwaga)
          throw new Error(`${name}: wkurzenie przed rankiem ${k.klasy.join('+')} / ${k.czeka} / ${k.uwaga}`);
        if (!nowi.klasy.includes('now') || !nowi.jak)
          throw new Error(`${name}: bieżący cel to nie „nowi” (${nowi.klasy.join('+')})`);
        // zrzut przed sprawdzeniem układu (ono otwiera kartę osoby i panel budowy, a na telefonie okienko się wtedy zwija)
        await zrzut(page, `${name}-przed`);
        await sprawdzUklad(page, `${name} ${w}×${h}, przed zebraniem`, dotyk);
        const p = await page.evaluate(() => window.zm!.govTick());
        if (p !== 'uchwala') throw new Error(`${name}: o 19:30 zamiast uchwały ${p}`);
        await page.waitForSelector('#sheet [data-act="law-skip"]');
        const linia = await liniaCeluOkna(page, `${name}, okno uchwały`);
        if (linia !== 'Cel: Podpiszcie kolejną uchwałę.') throw new Error(`${name}: linia celu „${linia}”`);
        await zrzut(page, `${name}-okno`);
        await kliknij(page, '#sheet [data-act="law"][data-arg="u_warty"]', dotyk);
        await zamknijOkna(page, dotyk);
        await poHudzie(page);
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        if (!po[0].klasy.includes('done')) throw new Error(`${name}: uchwała po podpisie ${po[0].klasy.join('+')}`);
        console.log(`  po podpisie: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        await sprawdzUklad(page, `${name} ${w}×${h}, po podpisie`, dotyk);
        // noc i poranny raport: wkurzenie zalicza się razem z raportem i niesie lekcję pod spodem, a bieżącym celem zostaje „nowi”
        const rano = await przewin(page, () => false, { dotyk, stop: ['raport'] });
        if (rano !== 'raport') throw new Error(`${name}: do rana bez raportu (${rano})`);
        await kliknij(page, '#sheet [data-act="report-ok"]', dotyk);
        await zamknijOkna(page, dotyk);
        await poHudzie(page);
        await ustawOkienko(page, true, dotyk);
        const raport = await wiersze(page, 'rozdzial');
        const wk = raport.find((x) => x.key === 'wkurzenie');
        if (
          !wk?.klasy.includes('done') ||
          wk.czeka ||
          wk.uwaga !== 'Wkurzenie spada, gdy ludzie są najedzeni i w cieple.'
        )
          throw new Error(`${name}: wkurzenie po raporcie to ${JSON.stringify(wk)}`);
        if (!raport.find((x) => x.key === 'nowi')?.klasy.includes('now'))
          throw new Error(`${name}: po raporcie bieżący cel to nie „nowi”`);
        console.log(`  po raporcie: ${raport.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        await zrzut(page, `${name}-rano`);
        await sprawdzUklad(page, `${name} ${w}×${h}, po raporcie`, dotyk);
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
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Sąsiedzi' || n.licznik !== '0/4')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        tekstyCelow(
          name,
          wr,
          ['pukanie', 'spotkanie', 'wejscie', 'szaber'],
          [
            'Zapukajcie do sąsiadów.',
            'Porozmawiajcie z sąsiadami.',
            'Wejdźcie do zamkniętego budynku.',
            'Przeszukajcie pomieszczenie u sąsiadów.',
          ],
        );
        if (!wr[0].klasy.includes('now')) throw new Error(`${name}: bieżący cel to nie pukanie`);
        await sprawdzUklad(page, `${name} ${w}×${h}, przed pukaniem`, dotyk);
        await zapukajAzOtworza(page);
        const linia = await liniaCeluOkna(page, `${name}, okno spotkania`);
        if (linia !== 'Cel: Porozmawiajcie z sąsiadami.') throw new Error(`${name}: linia celu „${linia}”`);
        await zrzut(page, `${name}-okno`);
        await kliknij(page, '#sheet [data-act="meet"][data-arg="odejscie"]', dotyk);
        await page.evaluate(() => window.zm!.ff(3));
        await zamknijOkna(page, dotyk);
        await poHudzie(page);
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        console.log(`  po spotkaniu: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (!po[0].klasy.includes('done') || !po[1].klasy.includes('done'))
          throw new Error(
            `${name}: pukanie i rozmowa po spotkaniu: ${po[0].klasy.join('+')}, ${po[1].klasy.join('+')}`,
          );
        await sprawdzUklad(page, `${name} ${w}×${h}, po spotkaniu`, dotyk);
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
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Badania' || n.licznik !== '0/5')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}”`);
        const wr = await wiersze(page, 'rozdzial');
        tekstyCelow(
          name,
          wr,
          ['pracownia', 'badanie', 'stol', 'odkrycie', 'era2'],
          [
            'Postawcie pracownię.',
            'Wybierzcie pierwsze badanie.',
            'Posadźcie kogoś przy stole pracowni.',
            'Zbadajcie pierwszą technologię.',
            'Zacznijcie badanie z ery 2.',
          ],
        );
        if (!wr[0].klasy.includes('now')) throw new Error(`${name}: bieżący cel to nie pracownia`);
        await sprawdzUklad(page, `${name} ${w}×${h}, bez pracowni`, dotyk);
        await postawBudowle(page, 'pracownia');
        await page.waitForFunction(() => window.zm!.badania().open, null, { timeout: 5000 });
        await page.waitForSelector('#tablica .tb-bar');
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
        await page.waitForFunction(() => !window.zm!.badania().open, null, { timeout: 5000 });
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
        await sprawdzUklad(page, `${name} ${w}×${h}, po wyborze badania`, dotyk);
      },
    });

  /** Zombie, R5 (z `miasto=0` ogródek jest jedynym celem, więc bieżącym) i R6 (bieżąca pracownia): dopisek o „Budować …”
      z menu planu (deski w innych klatkach albo za ulicą) stoi na końcu podpowiedzi bieżącego celu, w domu bez klatek, a okienko
      z nim niczego nie zasłania (na telefonie zwinięte okienko ma w sobie całą podpowiedź bieżącego celu, więc długie zdanie
      wypycha je na panel budowy: pracownia mieści się w 8 liniach, każda dodatkowa to 17 px i nachodzenie). Sprawdza oba
      języki, bo angielska podpowiedź pracowni jest dłuższa od polskiej i to ona pierwsza wypycha okienko na panel. */
  const zombieBudowa = (name: string, demo: string, dom: boolean, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=${demo}&tryb=zombie&miasto=0&${GRA}&godzina=11`);
        for (const [k, cel] of [
          ['r5', 'ogrodek'],
          ['r6', 'pracownia'],
        ] as const) {
          await rozdzial(page, k);
          await poPodpowiedziStartowej(page);
          await ustawOkienko(page, true, dotyk);
          const wr = await wiersze(page, 'rozdzial');
          const biezacy = wr.find((x) => x.klasy.includes('now'));
          if (biezacy?.key !== cel) throw new Error(`${name} ${k}: bieżący cel to ${biezacy?.key}, nie ${cel}`);
          const jak = biezacy.jak ?? '';
          zawiera(
            `${name} ${k}`,
            jak,
            dotyk ? 'stuknijcie osobę i przytrzymajcie plan' : 'zaznaczcie osobę i prawy przycisk na planie',
            dom ? 'Po deski zza ulicy:' : 'Po deski z innych klatek i zza ulicy:',
            '„Budować …”',
          );
          if (!jak.endsWith('(uwaga na szwendacze).'))
            throw new Error(`${name} ${k}: dopisek nie jest na końcu podpowiedzi: …${jak.slice(-120)}`);
          console.log(`  ${k}: ${biezacy.tekst} (${jak.length} znaków podpowiedzi)`);
          await sprawdzUklad(page, `${name} ${w}×${h}, ${k}`, dotyk);
          await zrzut(page, `${name}-${k}`);
          // po angielsku to samo zdanie na końcu i ten sam układ (zwinięte okienko na telefonie bez nachodzenia na panel budowy)
          await ustawJezyk(page, 'en');
          const wrEn = await wiersze(page, 'rozdzial');
          const biezacyEn = wrEn.find((x) => x.klasy.includes('now'));
          if (biezacyEn?.key !== cel) throw new Error(`${name} ${k} EN: bieżący cel to ${biezacyEn?.key}, nie ${cel}`);
          const jakEn = biezacyEn.jak ?? '';
          zawiera(
            `${name} ${k} EN`,
            jakEn,
            dotyk
              ? 'tap a person and press and hold on the plan, “Build …”'
              : 'select a person and right-click the plan, “Build …”',
            dom ? 'For planks across the street:' : 'For planks from other stairwells or across the street:',
          );
          if (!jakEn.endsWith('(best if no shamblers near).'))
            throw new Error(`${name} ${k} EN: dopisek nie jest na końcu podpowiedzi: …${jakEn.slice(-120)}`);
          console.log(`  ${k} EN: ${biezacyEn.tekst} (${jakEn.length} znaków podpowiedzi)`);
          await okienkoBezPolskich(page, `${name} ${k} EN`);
          await sprawdzUklad(page, `${name} ${w}×${h}, ${k}, EN`, dotyk);
          await zrzut(page, `${name}-${k}-en`);
          await ustawJezyk(page, 'pl');
        }
      },
    });

  /** Zombie, R4 otwarty tyle czasu przy ekranie, ile trzy doby przy 1× w prawdziwej grze (1880 s: doba to około 627 s, bo noc po
      karcie biegnie 6×), i nikt nie został przyjęty: cel „nowi” zalicza się sam
      (zapas) i mówi to linią „Nikt nie został przyjęty, więc cel zaliczył się sam. …” pod celem; bieżącym celem zostaje „ludzie”.
      Okienko z tą linią niczego nie zasłania (na telefonie nie nachodzi na panel budowy), po polsku i po angielsku. Przed tym
      czasem cel jest jeszcze do zrobienia i jest bieżący: jego podpowiedź mówi o ocalałych pod bramą, ich karcie z „Pokaż” i
      wyborze „Przyjąć do spółdzielni”, a „Przyjąć wszystkich” (kart uchodźców w zombie nie ma) w niej nie ma. */
  const zombieNowiZapas = (name: string, demo: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=${demo}&tryb=zombie&miasto=0&${GRA}&godzina=11`);
        // dwie doby i dwadzieścia trzy godziny (około pół minuty przed progiem): zapasu jeszcze nie ma
        await rozdzial(page, 'r4', 2.95);
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const przed = (await wiersze(page, 'rozdzial')).find((x) => x.key === 'nowi');
        if (!przed || przed.klasy.includes('done') || przed.tekst !== 'Przyjmijcie kogoś nowego.')
          throw new Error(`${name}: przed trzecią dobą „nowi” to ${JSON.stringify(przed)}`);
        if (!przed.klasy.includes('now')) throw new Error(`${name}: przed trzecią dobą „nowi” nie jest bieżący`);
        zawiera(
          `${name} przed zapasem`,
          przed.jak ?? '',
          'Ocaleni pod bramą mają kartę z „Pokaż”',
          '„Przyjąć do spółdzielni”',
          '„Wciągnąć do roboty”',
          'komunikat o ich drodze ma ten sam „Pokaż”',
        );
        nieZawiera(`${name} przed zapasem`, przed.jak ?? '', 'Przyjąć wszystkich');
        await zrzut(page, `${name}-przed-pl`);
        await sprawdzUklad(page, `${name} ${w}×${h}, przed zapasem`, dotyk);
        await ustawJezyk(page, 'en');
        await ustawOkienko(page, true, dotyk);
        const przedEn = (await wiersze(page, 'rozdzial')).find((x) => x.key === 'nowi');
        zawiera(
          `${name} przed zapasem EN`,
          przedEn?.jak ?? '',
          'Survivors at the gate have a card with “Show”',
          '“Take him/her/them into the co-op”',
          '“Put him/her to work”',
          'the notice about them coming in has the same “Show”',
        );
        nieZawiera(`${name} przed zapasem EN`, przedEn?.jak ?? '', 'Take everyone in');
        await okienkoBezPolskich(page, `${name} przed zapasem EN`);
        await zrzut(page, `${name}-przed-en`);
        await sprawdzUklad(page, `${name} ${w}×${h}, przed zapasem, EN`, dotyk);
        await ustawJezyk(page, 'pl');
        await ustawOkienko(page, true, dotyk);
        // trzy doby: zapas
        await rozdzial(page, 'r4', 3);
        await ustawOkienko(page, true, dotyk);
        const wr = await wiersze(page, 'rozdzial');
        const nowi = wr.find((x) => x.key === 'nowi');
        if (
          !nowi?.klasy.includes('done') ||
          nowi.tekst !== 'Przyjmijcie kogoś nowego.' ||
          nowi.uwaga !==
            'Nikt nie został przyjęty, więc cel zaliczył się sam. Gdy ktoś poprosi o miejsce, karta zapyta.'
        )
          throw new Error(`${name}: po trzech dobach „nowi” to ${JSON.stringify(nowi)}`);
        const biezacy = wr.find((x) => x.klasy.includes('now'));
        if (biezacy?.key !== 'ludzie') throw new Error(`${name}: bieżący cel to ${biezacy?.key}, nie ludzie`);
        console.log(`  R4 po trzech dobach: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        // zrzut przed sprawdzeniem układu (ono otwiera kartę osoby i panel budowy, a na telefonie okienko się wtedy zwija) i pod
        // osobną nazwą: plik `name` zapisuje po scenariuszu sam wykonawca, już ze zwiniętym okienkiem
        await zrzut(page, `${name}-pl`);
        await sprawdzUklad(page, `${name} ${w}×${h}, zapas`, dotyk);
        await ustawJezyk(page, 'en');
        // zmiana języka przerysowuje okienko, na telefonie zwinięte
        await ustawOkienko(page, true, dotyk);
        const wrEn = await wiersze(page, 'rozdzial');
        const nowiEn = wrEn.find((x) => x.key === 'nowi');
        if (
          !nowiEn?.klasy.includes('done') ||
          nowiEn.tekst !== 'Take someone new in.' ||
          nowiEn.uwaga !==
            'Nobody was taken in, so the goal completed itself. When someone asks for a place, a card will ask you.'
        )
          throw new Error(`${name} EN: po trzech dobach „nowi” to ${JSON.stringify(nowiEn)}`);
        await okienkoBezPolskich(page, `${name} EN`);
        await zrzut(page, `${name}-en`);
        await sprawdzUklad(page, `${name} ${w}×${h}, zapas, EN`, dotyk);
        await ustawJezyk(page, 'pl');
      },
    });

  /** Zombie, R4 otwarty od razu, a gra idzie ponad trzy doby gry przy 8× (`zm.ff(minuty, 8)`: sekunda przy ekranie to 160 ticków,
      więc to około 6 minut przy ekranie): zapas celu „nowi” liczy czas przy ekranie, a nie doby gry, więc cel jeszcze czeka
      (zapas liczony w dobach gry zaliczyłby go po trzech dobach), a gdy nikt nie jest przyjęty i czasu przy ekranie nie przybywa
      od progu (1880 s), niczego nie zalicza. Dowód, że okienko celów dostaje z gry prawdziwy czas przy ekranie (`ekran` w
      `odczytCelow`, src/main.ts), a nie tick podzielony przez 20, czego żaden test w Node nie widzi. */
  const zombieNowiTempo = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&tryb=zombie&miasto=0&${GRA}&godzina=11`);
        await rozdzial(page, 'r4');
        await poPodpowiedziStartowej(page);
        const stan = () =>
          page.evaluate(() => ({
            tick: window.zm!.sim!.st.tick,
            ekran: window.zm!.screen(),
            koniec: !!window.zm!.gov!.over,
          }));
        const od = await stan();
        const cel = od.tick + Math.round(3.05 * TICKS_PER_DAY);
        for (let k = 0; k < 400; k++) {
          const w = await okno(page);
          if (w) {
            await odpowiedz(page, w, dotyk);
            continue;
          }
          const teraz = await stan();
          if (teraz.koniec) throw new Error(`${name}: gra skończyła się po ${teraz.tick - od.tick} tickach`);
          if (teraz.tick >= cel) break;
          // krok przy 8×: godzina gry naraz
          await page.evaluate(() => window.zm!.ff(60, 8));
        }
        const po = await stan();
        const dobyGry = (po.tick - od.tick) / TICKS_PER_DAY;
        const sekundy = po.ekran - od.ekran;
        console.log(`  ${dobyGry.toFixed(2)} doby gry, ${sekundy.toFixed(0)} s przy ekranie`);
        if (dobyGry < 3.05) throw new Error(`${name}: przewinięte tylko ${dobyGry.toFixed(2)} doby`);
        if (sekundy > 500) throw new Error(`${name}: ${sekundy} s przy ekranie, a przy 8× powinno być około 370`);
        await zamknijOkna(page, dotyk);
        await poHudzie(page);
        await ustawOkienko(page, true, dotyk);
        const wr = await wiersze(page, 'rozdzial');
        const nowi = wr.find((x) => x.key === 'nowi');
        if (!nowi || nowi.klasy.includes('done'))
          throw new Error(
            `${name}: po ${dobyGry.toFixed(2)} doby gry i ${sekundy.toFixed(0)} s przy ekranie „nowi” to ${JSON.stringify(nowi)}`,
          );
        await zrzut(page, name);
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk);
      },
    });

  /** Podpowiedź bieżącego celu R4 „Przyjmijcie kogoś nowego” (R4 otwarty od razu, uchwała i raport czekają, więc „nowi” jest
      bieżący): w zwykłym trybie mówi o uchodźcach („Przyjąć wszystkich”), „Wciągnąć do roboty” i gościu pod bramą (furtką w
      domu) z kartą z „Pokaż” i wyborem „Przyjąć do spółdzielni” (w domu „Przyjąć do domu”), w zombie o ocalałych i bez „Przyjąć
      wszystkich”. Po polsku i po angielsku bez polskich liter, a okienko (na telefonie zwinięte do tego jednego celu) nie
      nachodzi na kartę osoby, panel budowy ani listę ludzi. */
  const nowiPodpowiedz = (name: string, demo: string, zombie: boolean, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        const dom = demo === 'zielonki';
        await start(page, base, `demo=${demo}${zombie ? '&tryb=zombie' : ''}&miasto=0&${GRA}&godzina=11`);
        await rozdzial(page, 'r4');
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const biezacy = (await wiersze(page, 'rozdzial')).find((x) => x.klasy.includes('now'));
        if (biezacy?.key !== 'nowi') throw new Error(`${name}: bieżący cel to ${biezacy?.key}, nie nowi`);
        const miejsce = dom ? 'pod furtką' : 'pod bramą';
        const jak = biezacy.jak ?? '';
        zawiera(
          name,
          jak,
          '„Pokaż”',
          '„Wciągnąć do roboty”',
          `„Przyjąć do ${dom ? 'domu' : 'spółdzielni'}”`,
          'komunikat o ich drodze ma ten sam „Pokaż”',
        );
        if (zombie) {
          zawiera(name, jak, `Ocaleni ${miejsce} mają kartę z „Pokaż”`);
          nieZawiera(name, jak, 'Przyjąć wszystkich');
        } else {
          zawiera(name, jak, `Gość ${miejsce} ma kartę z „Pokaż”`, '„Przyjąć wszystkich”');
        }
        const blokowe = dom ? BLOKOWE_UI.exec(jak) : null;
        if (blokowe) throw new Error(`${name}: w domu podpowiedź ma słowo z bloku „${blokowe[0]}”: ${jak}`);
        console.log(`  ${jak.length} znaków podpowiedzi: ${jak}`);
        // zrzut przed sprawdzeniem układu (ono otwiera kartę osoby i panel budowy, a na telefonie okienko się wtedy zwija)
        await zrzut(page, `${name}-pl`);
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk);
        await ustawJezyk(page, 'en');
        await ustawOkienko(page, true, dotyk);
        const biezacyEn = (await wiersze(page, 'rozdzial')).find((x) => x.klasy.includes('now'));
        if (biezacyEn?.key !== 'nowi') throw new Error(`${name} EN: bieżący cel to ${biezacyEn?.key}, nie nowi`);
        const jakEn = biezacyEn.jak ?? '';
        const brama = dom ? 'the garden gate' : 'the gate';
        zawiera(
          name,
          jakEn,
          '“Show”',
          '“Put him/her to work”',
          `“Take him/her/them into ${dom ? 'the house' : 'the co-op'}”`,
          'the notice about them coming in has the same “Show”',
        );
        if (zombie) {
          zawiera(name, jakEn, `Survivors at ${brama} have a card with “Show”`);
          nieZawiera(name, jakEn, 'Take everyone in');
        } else zawiera(name, jakEn, `A guest at ${brama} has a card with “Show”`, '“Take everyone in”');
        console.log(`  EN ${jakEn.length} znaków podpowiedzi: ${jakEn}`);
        await okienkoBezPolskich(page, `${name} EN`);
        await zrzut(page, `${name}-en`);
        await sprawdzUklad(page, `${name} ${w}×${h}, EN`, dotyk);
        await ustawJezyk(page, 'pl');
      },
    });

  /** R8 z celem „teren” (wspólny płot) jako bieżącym, na osiedlu, gdzie płot dosięga sąsiada (Lanciego, Zielonki). Dwa pierwsze cele
      zalicza gra, a nie hak: „drogi” prawdziwymi kliknięciami (Menu, „Drogi do zwycięstwa”, zamknięcie ekranu), „ludnosc”
      kamieniem drogi ludnościowej wpisanym w stan zarządu (prawdziwy kosztuje kilkanaście osób więcej, niż mieści zrzut).
      Podpowiedź mówi, że płot zabiera deski i złom, że zleconego nie da się odwołać i że drugi można zlecić dopiero, gdy
      pierwszy stanie. Okienko ma w sobie całą podpowiedź bieżącego celu, więc na telefonie po angielsku najdłuższa
      podpowiedź R8 jest tym, co wypchnęłoby je na panel budowy: układ sprawdza się z kartą osoby i panelem budowy, w obu
      językach, w trybie zwykłym i zombie (w zombie górny pasek ma więcej pól, więc okienko zaczyna się niżej). */
  const r8Teren = (name: string, demo: string, zombie: boolean, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=${demo}${zombie ? '&tryb=zombie' : ''}&miasto=0&${GRA}&godzina=11`);
        await rozdzial(page, 'r8');
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const przed = await wiersze(page, 'rozdzial');
        if (przed.map((x) => x.key).join() !== 'drogi,ludnosc,teren' || przed[0].klasy.includes('done'))
          throw new Error(`${name}: R8 na starcie ${przed.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        // „drogi”: ekran dróg z Menu, tak jak otwiera go gracz, i zamknięcie go
        await kliknij(page, '#btnMenu', dotyk);
        await page.waitForSelector('#sheet [data-act="menu-zwyciestwo"]');
        await kliknij(page, '#sheet [data-act="menu-zwyciestwo"]', dotyk);
        await page.waitForSelector('#sheet .zw-drogi .zw-droga');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden, null, { timeout: 5000 });
        // „ludnosc”: kolejny kamień drogi ludnościowej niż przy otwarciu rozdziału (krok zarządu liczy go z tego pola)
        await page.evaluate(() => {
          const k = window.zm!.gov!.zwyciestwo!.kamienie;
          k.ludnosc = (k.ludnosc ?? 0) + 1;
        });
        await poHudzie(page, 3);
        await ustawOkienko(page, true, dotyk);
        const wr = await wiersze(page, 'rozdzial');
        console.log(`  R8: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        const biezacy = wr.find((x) => x.klasy.includes('now'));
        if (biezacy?.key !== 'teren' || wr.slice(0, 2).some((x) => !x.klasy.includes('done')))
          throw new Error(`${name}: bieżący cel to ${biezacy?.key}, a nie teren po dwóch zrobionych`);
        if (biezacy.tekst !== 'Zacznijcie otaczać wspólnym płotem pierwszy sąsiedni budynek.')
          throw new Error(`${name}: tekst celu „${biezacy.tekst}”`);
        const jak = biezacy.jak ?? '';
        zawiera(
          name,
          jak,
          dotyk
            ? 'Przytrzymajcie palec na drzwiach otwartego budynku obok'
            : 'Prawy przycisk na drzwiach otwartego budynku obok',
          '„Otoczyć wspólnym płotem (…)”',
          'desek i złomu',
          'a zlecenia nie da się odwołać',
          'drugi zlecicie, gdy ten stanie',
          'pierwszą sztukę materiału',
        );
        const blokowe = demo === 'zielonki' ? BLOKOWE_UI.exec(jak) : null;
        if (blokowe) throw new Error(`${name}: w domu podpowiedź ma słowo z bloku „${blokowe[0]}”: ${jak}`);
        console.log(`  ${jak.length} znaków podpowiedzi: ${jak}`);
        // zrzut przed sprawdzeniem układu (ono otwiera kartę osoby i panel budowy, a na telefonie okienko się wtedy zwija)
        await zrzut(page, `${name}-pl`);
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk);
        await ustawJezyk(page, 'en');
        await ustawOkienko(page, true, dotyk);
        const biezacyEn = (await wiersze(page, 'rozdzial')).find((x) => x.klasy.includes('now'));
        if (biezacyEn?.key !== 'teren') throw new Error(`${name} EN: bieżący cel to ${biezacyEn?.key}, nie teren`);
        const jakEn = biezacyEn.jak ?? '';
        zawiera(
          name,
          jakEn,
          dotyk
            ? 'Press and hold on the door of an open building next door'
            : 'Right-click the door of an open building next door',
          '“Put up a shared fence (…)”',
          'planks and scrap',
          'and can’t be cancelled',
          'a second one waits until it stands',
          'first piece of material',
        );
        console.log(`  EN ${jakEn.length} znaków podpowiedzi: ${jakEn}`);
        await okienkoBezPolskich(page, `${name} EN`);
        await zrzut(page, `${name}-en`);
        await sprawdzUklad(page, `${name} ${w}×${h}, EN`, dotyk);
        await ustawJezyk(page, 'pl');
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
        await sprawdzUklad(page, `${name} 1440×900`, false, { zrzut: `${name}-karta-budowa` });
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
      i jego podpowiedź, a rozdział pod nim swoją. Prawy przycisk na handlarzu daje w menu oferty „Dać … za …”, a wymiana
      zamyka okazję. Na Przymorzu handlarz staje pod bramą dnia 2 około 12:00 (plan mówił o 11:00), więc scenariusz przewija do
      chwili, w której okazja się otwiera, a nie do godziny. */
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
        await okazjaPrzedRozdzialem(page, name, 'Teraz: handlarz pod bramą', 'Drugi dzień');
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
        await sprawdzUklad(page, `${name} 1440×900`, false, { zrzut: `${name}-karta-budowa` });
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
        // wymiana: pierwsza oferta, na którą starcza materiału; po jej zakończeniu okazja jest zrobiona i blok znika. Gdy
        // handlarz nie ma żadnej dostępnej oferty, scenariusz pada: bez wymiany nie sprawdza, że okazja się zalicza
        const mozliwa = page.locator('#ctx .ctx-item:not(.off)', { hasText: /^Dać / });
        if (!(await mozliwa.count()))
          throw new Error(
            `${name}: w menu handlarza nie ma oferty, na którą starcza materiału (${pozycje.join(' | ')})`,
          );
        await mozliwa.first().click();
        // osoba idzie do handlarza i targuje się kilka minut gry; okna zarządu po drodze dostają odpowiedź
        await przewin(page, async () => (await widok(page)).okazja?.tytul !== 'Teraz: handlarz pod bramą', {
          dotyk: false,
          krok: () => 4,
          maks: 40,
        });
        await poHudzie(page);
        const handel = await page.evaluate(() => window.zm!.sim!.st.obcy!.offers.some((o) => o.left < 2));
        const v = await widok(page);
        console.log(
          `  po wymianie: oferta przyjęta ${handel}, okazja ${v.okazja ? `„${v.okazja.tytul}”` : 'zamknięta'}`,
        );
        if (!handel) throw new Error(`${name}: okazja zamknięta bez wymiany`);
        if (await page.$('#goals .goals-okazja'))
          throw new Error(`${name}: po wymianie blok okazji dalej jest w okienku`);
        await przywrocKamere(page, cam);
        await page.keyboard.press('Escape');
        // zrzut końcowy scenariusza ma pokazywać układ bez karty osoby
        await poHudzie(page);
      },
    });

  /** Przewija drugi dzień do chwili, w której przy siatce stoi wędrowiec (okazja O1, zwykły tryb), z odpowiedziami na okna po
      drodze. Pierwszy przychodzi drugiego dnia między 8:00 a 12:00 i stoi do 40 minut, więc krok jest krótki. */
  const doWedrowca = async (page: Page, dotyk: boolean): Promise<void> => {
    const limit = minutaGry(2, 22);
    await przewin(
      page,
      async (t) => {
        if (t > limit) throw new Error('wędrowiec nie stanął przy siatce do 22:00 dnia 2');
        return (await widok(page)).okazja?.tytul === 'Teraz: wędrowiec przy siatce';
      },
      { dotyk, krok: () => 10 },
    );
    await page.waitForSelector('#goals .goals-okazja');
  };

  /** Prawy przycisk na wędrowcu przy siatce z zaznaczoną osobą (jak w grze): kamera na wędrowcu, menu pod kursorem, teksty pozycji. */
  const menuNaWedrowcu = async (page: Page): Promise<string[]> => {
    await kliknij(page, '#lista .lp >> nth=0', false);
    await page.waitForSelector('#card:not([hidden])');
    const xy = await page.evaluate(() => {
      const zm = window.zm!;
      const w = zm.sim!.st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1)!;
      zm.setCam(w.x, w.y, 1.6);
      return [w.x, w.y];
    });
    await waitIdle(page);
    const [sx, sy] = await page.evaluate(([x, y]) => window.zm!.screenOf(x, y - 0.4), xy);
    await page.mouse.click(sx, sy, { button: 'right' });
    await page.waitForSelector('#ctx:not([hidden])');
    return page.locator('#ctx .ctx-item').allTextContents();
  };

  /** Okazja z wędrowcem przy siatce (O1, zwykły tryb) nad rozdziałem „Drugi dzień”, na komputerze: dwa cele werbunku. Gracz robi
      to, co mówią podpowiedzi: zaznacza osobę, prawym przyciskiem na wędrowcu wybiera „Zagadać”, a po rozmowie szuka w menu
      „Zaprosić do nas”, czyli nazwy z podpowiedzi bez liczby. Menu ma przy niej prawdziwą szansę w procentach („Zaprosić do nas
      (N% szans)”), a podpowiedź nie ma niedokończonego „(… szans)” i mówi, że szansę podaje menu. Zaproszenie zalicza cel, także
      gdy wędrowiec odmówi, i zamyka okazję. */
  const wedrowiec = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, false);
        await doWedrowca(page, false);
        await poHudzie(page);
        const hm = await page.evaluate(
          () => `${document.getElementById('hDay')!.textContent} ${document.getElementById('hTime')!.textContent}`,
        );
        console.log(`  wędrowiec przy siatce: ${hm}`);
        // pierwszy cel: rozmowa, z podpowiedzią dla myszy; zaproszenie czeka pod nim bez podpowiedzi
        await okazjaPrzedRozdzialem(page, name, 'Teraz: wędrowiec przy siatce', 'Drugi dzień');
        let ok = await wiersze(page, 'okazja');
        if (ok.map((x) => x.key).join() !== 'zagadaj,zapros' || !ok[0].klasy.includes('now') || ok[1].jak !== null)
          throw new Error(`${name}: cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        zawiera(name, ok[0].tekst, 'Zagadajcie wędrowca.');
        zawiera(name, ok[0].jak ?? '', 'Zaznaczcie kogoś i prawy przycisk na wędrowcu', '„Zagadać”');
        nieZawiera(name, ok[0].jak ?? '', 'palec');
        zawiera(name, ok[1].tekst, 'Zaproście wędrowca do siebie.');
        const wr = await wiersze(page, 'rozdzial');
        if (wr.length !== 5 || wr.filter((x) => x.jak !== null).length > 1)
          throw new Error(`${name}: rozdział pod okazją ${wr.map((x) => x.key).join()}`);
        await sprawdzUklad(page, `${name} 1440×900, zagadać`, false, { zrzut: `${name}-zagadac` });
        // „Zagadać” z menu na wędrowcu
        const cam = await kamera(page);
        let pozycje = await menuNaWedrowcu(page);
        console.log(`  menu na wędrowcu: ${pozycje.join(' | ')}`);
        if (!pozycje.includes('Zagadać')) throw new Error(`${name}: w menu wędrowca nie ma „Zagadać”`);
        await zrzut(page, `${name}-menu-zagadac`);
        await page.locator('#ctx .ctx-item', { hasText: /^Zagadać$/ }).click();
        // osoba idzie do siatki i rozmawia kilka minut gry; po rozmowie bieżący jest cel zaproszenia
        await przewin(page, async () => (await widok(page)).okazja?.biezacy?.key === 'zapros', {
          dotyk: false,
          krok: () => 2,
          maks: 60,
        });
        await page.keyboard.press('Escape');
        await przywrocKamere(page, cam);
        await poHudzie(page);
        // zaproszenie: podpowiedź cytuje „Zaprosić do nas” bez liczby i mówi, że szansę w procentach podaje menu
        ok = await wiersze(page, 'okazja');
        if (
          ok.map((x) => x.key).join() !== 'zagadaj,zapros' ||
          !ok[0].klasy.includes('done') ||
          !ok[1].klasy.includes('now')
        )
          throw new Error(
            `${name}: po rozmowie cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`,
          );
        const jak = ok[1].jak ?? '';
        zawiera(
          name,
          jak,
          'Po rozmowie prawy przycisk na wędrowcu: „Zaprosić do nas”.',
          'Gdy jest miejsce, menu podaje przy tej pozycji szansę w procentach',
          'rośnie z jedzeniem w zapasie i wolnym łóżkiem, spada po napaści na obcych.',
        );
        nieZawiera(name, jak, '…', 'szans)');
        await sprawdzUklad(page, `${name} 1440×900, zaprosić`, false, { zrzut: `${name}-zaprosic` });
        // menu na wędrowcu ma tę pozycję, którą cytuje podpowiedź, i z prawdziwą szansą
        pozycje = await menuNaWedrowcu(page);
        console.log(`  menu na wędrowcu po rozmowie: ${pozycje.join(' | ')}`);
        const zaprosic = pozycje.find((p) => /^Zaprosić do nas \(\d+% szans\)$/.test(p));
        if (!zaprosic)
          throw new Error(`${name}: w menu wędrowca nie ma „Zaprosić do nas (N% szans)”: ${pozycje.join(' | ')}`);
        await zrzut(page, `${name}-menu-zaprosic`);
        await page.locator('#ctx .ctx-item', { hasText: /^Zaprosić do nas/ }).click();
        // próba zalicza cel i zamyka okazję: wędrowiec zostaje albo odmawia, a okazja i tak mija
        await przewin(page, async () => !(await widok(page)).okazja, { dotyk: false, krok: () => 2, maks: 90 });
        await poHudzie(page);
        const wynik = await page.evaluate(() => {
          const st = window.zm!.sim!.st;
          return {
            zwerbowany: (st.obcy?.werbunek ?? 0) > 0,
            wiesc: st.obcy?.wiesc?.text.split('\n')[0] ?? '',
          };
        });
        console.log(
          `  po zaproszeniu: ${wynik.zwerbowany ? 'wędrowiec został' : 'wędrowiec odmówił'} (${wynik.wiesc}), okazja zamknięta`,
        );
        await przywrocKamere(page, cam);
        await page.keyboard.press('Escape');
        await poHudzie(page);
      },
    });

  /** Okazja z wędrowcem na telefonie (390×844): okienko zwinięte do samej okazji z bieżącym celem i podpowiedzią dla dotyku
      („Stuknijcie kogoś i przytrzymajcie palec na wędrowcu”), po stuknięciu w nagłówek okazja nad rozdziałem. Rozmowę zleca
      polecenie `talk` wprost do symulacji (długiego przytrzymania na mapie scenariusz nie sprawdza); po niej bieżący jest cel
      zaproszenia z najdłuższą podpowiedzią okazji, w obu stanach okienka z kartą osoby i panelem budowy. */
  const wedrowiecTelefon = (name: string, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      touch: true,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, true);
        await doWedrowca(page, true);
        await poHudzie(page);
        /** zwinięte okienko ma tylko okazję (bez rozdziału) i jej bieżący cel z podpowiedzią */
        const zwiniete = async (klucz: string, ...fragmenty: string[]): Promise<void> => {
          await ustawOkienko(page, false, true);
          const blok = await page.evaluate(() => ({
            rozdzial: !!document.querySelector('#goals ol[data-blok="rozdzial"]'),
            okazja: document.querySelector('#goals .goals-okazja .goals-head span')?.textContent ?? '',
            rozwiniete: document.querySelector('#goals .goals-head')?.getAttribute('aria-expanded'),
          }));
          if (blok.rozdzial || blok.okazja !== 'Teraz: wędrowiec przy siatce' || blok.rozwiniete !== 'false')
            throw new Error(`${name}: zwinięte okienko z okazją: ${JSON.stringify(blok)}`);
          const ok = await wiersze(page, 'okazja');
          if (ok.length !== 1 || ok[0].key !== klucz || !ok[0].klasy.includes('now') || !ok[0].jak)
            throw new Error(`${name}: zwinięta okazja ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
          zawiera(name, ok[0].jak, ...fragmenty);
          nieZawiera(name, ok[0].jak, 'prawy przycisk', 'Kliknijcie', 'Zaznaczcie');
        };
        // przed rozmową
        await zwiniete('zagadaj', 'Stuknijcie kogoś i przytrzymajcie palec na wędrowcu', '„Zagadać”');
        await sprawdzUklad(page, `${name} ${w}×${h}, zagadać, zwinięte`, true, { zrzut: `${name}-zagadac-zwiniete` });
        await ustawOkienko(page, true, true);
        await okazjaPrzedRozdzialem(page, name, 'Teraz: wędrowiec przy siatce', 'Drugi dzień');
        await sprawdzUklad(page, `${name} ${w}×${h}, zagadać, rozwinięte`, true, {
          zrzut: `${name}-zagadac-rozwiniete`,
          rozwiniete: true,
        });
        // rozmowa jak po „Zagadać” z menu: polecenie `talk` osoby z zarządu do wędrowca przy siatce
        await page.evaluate(() => {
          const sim = window.zm!.sim!;
          const wd = sim.st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1)!;
          const kto = sim.st.pawns.find((p) => p.kind === 'core')!;
          sim.push({ t: 'talk', ids: [kto.id], target: wd.id });
        });
        await przewin(page, async () => (await widok(page)).okazja?.biezacy?.key === 'zapros', {
          dotyk: true,
          krok: () => 2,
          maks: 60,
        });
        await poWiesci(page);
        await poHudzie(page);
        // po rozmowie: bieżące jest zaproszenie, z podpowiedzią bez „(… szans)”
        await zwiniete(
          'zapros',
          'Po rozmowie przytrzymajcie palec na wędrowcu: „Zaprosić do nas”.',
          'Gdy jest miejsce, menu podaje przy tej pozycji szansę w procentach',
        );
        await sprawdzUklad(page, `${name} ${w}×${h}, zaprosić, zwinięte`, true, { zrzut: `${name}-zaprosic-zwiniete` });
        await ustawOkienko(page, true, true);
        await okazjaPrzedRozdzialem(page, name, 'Teraz: wędrowiec przy siatce', 'Drugi dzień');
        const ok = await wiersze(page, 'okazja');
        if (
          ok.map((x) => x.key).join() !== 'zagadaj,zapros' ||
          !ok[0].klasy.includes('done') ||
          !ok[1].klasy.includes('now')
        )
          throw new Error(
            `${name}: po rozmowie cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`,
          );
        await sprawdzUklad(page, `${name} ${w}×${h}, zaprosić, rozwinięte`, true, {
          zrzut: `${name}-zaprosic-rozwiniete`,
          rozwiniete: true,
        });
      },
    });

  /** Okazja ugryzienia w trybie zombie nad pierwszym dniem: po samouczku ktoś z zarządu ma ugryzienie w kończynę w stanie gry,
      okazja pokazuje jego imię i cel amputacji, a karta ugryzionego ma przycisk „Amputować”, o którym mówi podpowiedź. */
  const ugryzienie = (name: string, w = 1440, h = 900): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&tryb=zombie&${GRA}`);
        await chopDryTree(page);
        // okazje ruszają dopiero po krokach samouczka
        await przewin(page, async () => (await page.evaluate(() => window.zm!.sim!.st.tut.step)) >= 6, {
          dotyk,
          krok: () => 10,
        });
        // w trybie zombie samouczek kończy się dopiero wieczorem (drewno z suchego drzewa dochodzi do składu po 21:00), więc pod
        // ugryzieniem może już stać okazja stada; ugryzienie jest ważniejsze i ją wypiera
        const przed = (await widok(page)).okazja;
        console.log(`  przed ugryzieniem: ${przed ? `„${przed.tytul}”` : 'bez okazji'}`);
        if (przed && przed.tytul !== 'Teraz: stado pod siatką')
          throw new Error(`${name}: okazja „${przed.tytul}” przed ugryzieniem`);
        // Pierwsza osoba ugryziona w kończynę `UGRYZIONA_PRZED` temu, ustawione wprost (`p.bite` i `p.limb`, jak w scenariuszu listy
        // w trybie zombie), a nie przez `infect()` z src/sim/sim.ts: bez nastroju „Gorączka po ugryzieniu” (−15) na karcie.
        // Okazja i karta czytają tylko `bite` i `limb`. Ktoś inny z zarządu jest na miejscu i zdrowy, więc jest komu amputować.
        const kto = await page.evaluate((przed) => {
          const zm = window.zm!;
          const st = zm.sim!.st;
          const p = st.pawns.find((q) => q.kind === 'core')!;
          p.bite = st.tick - przed;
          p.limb = true;
          return { pawn: p.id, imie: st.people[p.person].first };
        }, UGRYZIONA_PRZED);
        // okazja ugryzienia wypiera stado: okienko pokazuje ją w następnym odświeżeniu
        await page.waitForFunction(
          () => document.querySelector('#goals .goals-okazja .goals-head span')?.textContent === 'Teraz: ugryzienie',
          null,
          { timeout: 5000 },
        );
        const v = await widok(page);
        console.log(`  okazja: ${v.okazja?.tytul} | ${v.okazja?.cele[0]?.text} | rozdział ${v.rozdzial?.k}`);
        if (v.okazja?.tytul !== 'Teraz: ugryzienie') throw new Error(`${name}: okazja „${v.okazja?.tytul}”`);
        const ok = await wiersze(page, 'okazja');
        if (ok.length !== 1 || ok[0].key !== 'amputacja' || !ok[0].klasy.includes('now'))
          throw new Error(`${name}: cele okazji ${ok.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (ok[0].tekst !== `Ratujcie: ${kto.imie} potrzebuje amputacji.`)
          throw new Error(`${name}: cel „${ok[0].tekst}”`);
        zawiera(name, ok[0].jak ?? '', 'Amputować', 'pół godziny', 'Po dwóch godzinach jest za późno');
        // na telefonie okienko jest zwinięte do samej okazji: rozdział pod nią widać po rozwinięciu
        if (dotyk) await ustawOkienko(page, true, true);
        await okazjaPrzedRozdzialem(page, name, 'Teraz: ugryzienie', 'Pierwszy dzień');
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk, { zrzut: `${name}-karta-budowa` });
        // karta ugryzionego (chip tej osoby na liście) ma przycisk „Amputować”
        await kliknij(page, `#lista .lp[data-pawn="${kto.pawn}"]`, dotyk);
        await page.waitForSelector('#card .bite');
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
        await poPodpowiedziStartowej(page);
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
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk, { zrzut: `${name}-karta-budowa`, rozwiniete: true });
        // nagłówek zwija okienko do pierwszego wiersza (także na komputerze) i rozwija z powrotem
        await ustawOkienko(page, false, dotyk);
        if ((await wiersze(page, 'drogi')).length !== 1)
          throw new Error(`${name}: zwinięte okienko dróg ma więcej niż jeden wiersz`);
        await zrzut(page, `${name}-zwiniete`);
        await sprawdzUklad(page, `${name} ${w}×${h}, zwinięte`, dotyk);
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
        await sprawdzUklad(page, `${name} ${w}×${h}, rozdział zwinięty`, true, { zrzut: `${name}-r1-zwiniete` });
        // rozwinięte: wszystkie pięć celów, tylko bieżący z podpowiedzią
        await ustawOkienko(page, true, true);
        wr = await wiersze(page, 'rozdzial');
        if (wr.length !== 5 || wr.filter((x) => x.jak !== null).length !== 1)
          throw new Error(`${name}: rozwinięty rozdział ${wr.map((x) => x.key).join()}`);
        await sprawdzUklad(page, `${name} ${w}×${h}, rozdział rozwinięty`, true, {
          zrzut: `${name}-r1-rozwiniete`,
          rozwiniete: true,
        });
        await ustawOkienko(page, false, true);
        // okazja: handlarz pod bramą
        await doHandlarza(page, true);
        await poHudzie(page);
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
        await sprawdzUklad(page, `${name} ${w}×${h}, okazja zwinięta`, true, { zrzut: `${name}-okazja-zwinieta` });
        await ustawOkienko(page, true, true);
        await okazjaPrzedRozdzialem(page, name, 'Teraz: handlarz pod bramą', 'Drugi dzień');
        const razem = await page.evaluate(() => ({
          okazja: !!document.querySelector('#goals .goals-okazja ol'),
          rozdzial: document.querySelectorAll('#goals ol[data-blok="rozdzial"] li').length,
        }));
        if (!razem.okazja || razem.rozdzial !== 5)
          throw new Error(`${name}: rozwinięte okienko z okazją: ${JSON.stringify(razem)}`);
        await sprawdzUklad(page, `${name} ${w}×${h}, okazja rozwinięta`, true, {
          zrzut: `${name}-okazja-rozwinieta`,
          rozwiniete: true,
        });
      },
    });

  /** Angielski: drugi dzień i karta nocy bez polskich liter (w tekście i w atrybutach okienka), z linią „Goal: …” w oknie. */
  const angielski = (name: string, w = 1440, h = 900): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      lang: 'en',
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        await start(page, base, `demo=przymorze&${GRA}`);
        await doDrugiegoDnia(page, dotyk);
        if (dotyk) await ustawOkienko(page, true, true);
        const wr = await sprawdzR1(page, name, { en: true, dotyk });
        console.log(`  ${wr.map((x) => `${x.key}${x.klasy.length ? `(${x.klasy.join('+')})` : ''}`).join(' ')}`);
        await okienkoBezPolskich(page, name);
        const tytul = await page.$eval('#goals .goals-head', (e) => e.getAttribute('title') ?? '');
        const oczekiwany = dotyk ? 'Tap to collapse the list' : 'Click to collapse the list';
        if (tytul !== oczekiwany) throw new Error(`${name}: podpowiedź nagłówka „${tytul}” zamiast „${oczekiwany}”`);
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk, { zrzut: `${name}-karta-budowa` });
        // karta nocy dnia 2: linia celu po angielsku
        const o = await przewin(page, () => false, { dotyk, stop: ['karta'] });
        if (o !== 'karta') throw new Error(`${name}: przed 20:00 nie otworzyła się karta nocy`);
        const linia = await liniaCeluOkna(page, `${name}, karta nocy`);
        if (linia !== 'Goal: Put someone on stove watch.') throw new Error(`${name}: linia celu „${linia}”`);
        const kartaPl = polskieLitery(linia);
        if (kartaPl.length) throw new Error(`${name}: polskie litery w linii celu: ${kartaPl.join(', ')}`);
        await zrzut(page, `${name}-karta`);
        await kliknij(page, '#sheet [data-act="night-go"]', dotyk);
        await zamknijOkna(page, dotyk);
        await poHudzie(page);
        await ustawOkienko(page, true, dotyk);
        const po = await wiersze(page, 'rozdzial');
        const pl2 = polskieLitery(await tekstOkienka(page));
        if (pl2.length) throw new Error(`${name}: polskie litery po karcie: ${pl2.join(', ')}`);
        console.log(`  po karcie: ${po.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
      },
    });

  /** Zaliczenie drewna na wieczór przeżywa zapis, zjedzenie zapasu przez kozę i przeładowanie strony: po samouczku trzy sztuki
      drewna na składzie zaliczają cel, stan idzie do zapisu (`Save.cele`), koza zjada zapas przed zebraniem, gra zapisuje się
      jeszcze raz sama (autozapis co godzinę gry w klatce albo wyjście ze strony: `save()` z tego samego miejsca w `main.ts`),
      już bez drewna w świecie, a po „Kontynuuj” cel dalej jest zaliczony, choć zapasu nie ma. To jedyne sprawdzenie okablowania
      zapisu i wczytania stanu ścieżki w `main.ts` (`cele: sciezka` w `save()`, `stanZZapisu` w `enter()`): zapis zrobiony
      wyłącznie w chwili zaliczenia nic by nie dowodził, bo ten stan świata ma jeszcze drewno i cel zaliczyłby się po
      wczytaniu od nowa, a scenariusz sprawdza, że po wczytaniu drewna już nie ma. */
  const przeladowanie = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      h: 900,
      run: async (page, base) => {
        /** to, co leży w pamięci przeglądarki pod kluczem zapisu: tick gry i zaliczone cele ścieżki */
        const zapis = (): Promise<{ tick: number; zrobione: Record<string, number>; rozdzial: string } | null> =>
          page.evaluate((k) => {
            const raw = localStorage.getItem(k);
            if (!raw) return null;
            const z = JSON.parse(raw);
            return { tick: z.sim.tick as number, zrobione: z.cele?.zrobione ?? {}, rozdzial: z.cele?.rozdzial ?? '' };
          }, SAVE);
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
        // NIGHT_WOOD sztuk na składzie: zapas wystarczy na ogień do snu
        await dolozDrewno(page, NIGHT_WOOD);
        await page.waitForSelector('#goals li.goal[data-key="drewno"].done');
        if (!(await drewno()).done) throw new Error(`${name}: ${NIGHT_WOOD} sztuki na składzie nie zaliczyły drewna`);
        console.log(`  zaliczone przy zapasie ${await zapasDrewna(page)} szt.`);
        // zapis w chwili zaliczenia: zaliczenie jest już w stanie ścieżki, który idzie do zapisu
        if (!(await page.evaluate(() => window.zm!.save()))) throw new Error(`${name}: zapis się nie udał`);
        const pierwszy = await zapis();
        console.log(`  zapis w chwili zaliczenia: tick ${pierwszy?.tick}, rozdział ${pierwszy?.rozdzial}`);
        if (!pierwszy || pierwszy.zrobione['r0.drewno'] === undefined)
          throw new Error(`${name}: zapis bez zaliczonego drewna`);
        // koza zjada zapas (zarząd dokłada ze składu do kozy), zanim przyjdzie zebranie o 19:30
        await przewin(page, async () => (await zapasDrewna(page)) < NIGHT_WOOD, {
          dotyk: false,
          krok: () => 5,
          maks: 60,
        });
        const zapas = await zapasDrewna(page);
        const hm = await page.evaluate(() => document.getElementById('hTime')!.textContent);
        console.log(`  koza zjadła zapas: ${zapas} szt. o ${hm}`);
        if (!(await drewno()).done) throw new Error(`${name}: po zjedzeniu zapasu drewno nie jest już zaliczone`);
        await zrzut(page, `${name}-przed`);
        // wyjście ze strony bez ręcznego zapisu: do pamięci przeglądarki trafia zapis, który zrobiła sama gra (autozapis
        // co godzinę gry w klatce albo `pagehide` i `visibilitychange` przy zamknięciu karty), już po zjedzeniu zapasu
        await idz(page, `${base}?speed=0`);
        const drugi = await zapis();
        console.log(
          `  zapis zrobiony przez grę po zjedzeniu zapasu: tick ${drugi?.tick}, zaliczone ${Object.keys(drugi?.zrobione ?? {}).join(', ')}`,
        );
        if (!drugi || drugi.tick <= (pierwszy?.tick ?? 0))
          throw new Error(
            `${name}: gra nie zapisała się po zjedzeniu zapasu (tick ${drugi?.tick}, wcześniej ${pierwszy?.tick})`,
          );
        if (drugi.zrobione['r0.drewno'] === undefined)
          throw new Error(`${name}: zapis po zjedzeniu zapasu bez zaliczonego drewna`);
        await page.waitForSelector('#resume:not([hidden])');
        await page.click('#btnResume');
        await waitIdle(page);
        await page.waitForSelector('#goals:not([hidden]) .goal');
        // po wczytaniu świat ma tyle drewna co przy wyjściu (mniej niż NIGHT_WOOD), a cel dalej jest zaliczony
        const po = await zapasDrewna(page);
        console.log(`  po „Kontynuuj”: zapas ${po} szt.`);
        if (po >= NIGHT_WOOD)
          throw new Error(`${name}: po wczytaniu zapas wrócił do ${po} szt., więc scenariusz niczego nie dowodzi`);
        const v = await widok(page);
        if (v.rozdzial?.k !== 'r0') throw new Error(`${name}: po wczytaniu rozdział ${v.rozdzial?.k}`);
        if (!(await drewno(v)).done) throw new Error(`${name}: po „Kontynuuj” drewno na wieczór nie jest zaliczone`);
        const wr = await wiersze(page, 'rozdzial');
        const wiersz = wr.find((x) => x.key === 'drewno')!;
        if (!wiersz.klasy.includes('done')) throw new Error(`${name}: w okienku drewno ${wiersz.klasy.join('+')}`);
        zawiera(name, wiersz.tekst, 'Przygotujcie drewno na wieczór.');
        console.log(`  okienko po wczytaniu: ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        await sprawdzUklad(page, `${name} po wczytaniu`, false);
      },
    });

  /** Okienko celów ograniczone do miejsca nad kartą osoby przewija się w środku do bieżącego celu. Stan z długą listą zrobionych:
      po samouczku i `NIGHT_WOOD` sztukach drewna R0 ma siedem zrobionych celów, a bieżący „Przetrwajcie pierwszą noc.” stoi na
      samym dole (z podpowiedzią), więc przy otwartej karcie osoby nie mieści się nad nią bez przewijania. Sprawdza, że: okienko
      jest ograniczone (`scrollHeight` większe od `clientHeight`) i nie nachodzi na kartę, bieżący cel z podpowiedzią jest
      w całości widoczny (to sprawdza `naruszenia` i to ono pada, gdy `pokazBiezacyCel` w main.ts nie przewija), lista jest
      przewinięta, nagłówek rozdziału stoi przyklejony u góry (to sprawdza `naruszenia`, pada bez reguły `position: sticky`
      w style.css), a spod niego nie wystaje przecięty wiersz, ręczne przewinięcie w górę nie jest cofane przy odświeżeniach,
      po zamknięciu karty okienko wraca do pełnej wysokości, a po ponownym otwarciu znowu pokazuje bieżący cel. Na końcu
      zmiana rozdziału na R1 przy przewiniętym okienku (zrzut `-r1`): pierwszy cel nowego rozdziału ma stanąć pod nagłówkiem,
      a nie za nim, i powrót do R0 z bieżącym celem na dole. */
  const przewijanie = (name: string): ShotCele =>
    shot({
      name,
      query: '',
      w: 1440,
      // niższe okno niż zwykłe 900 px: przy 900 karta Maksyma zostawia nad sobą 297 px, a lista ma 284 i mieści się bez cięcia
      h: 800,
      run: async (page, base) => {
        await start(page, base, `demo=przymorze&${GRA}`);
        await chopDryTree(page);
        await przewin(page, async () => (await page.evaluate(() => window.zm!.sim!.st.tut.step)) >= 6, {
          dotyk: false,
          krok: () => 10,
        });
        await dolozDrewno(page, NIGHT_WOOD);
        await page.waitForSelector('#goals li.goal[data-key="drewno"].done');
        const wr = await wiersze(page, 'rozdzial');
        const bie = wr.find((x) => x.klasy.includes('now'));
        console.log(`  ${wr.map((x) => `${x.key}(${x.klasy.join('+')})`).join(' ')}`);
        if (wr.filter((x) => x.klasy.includes('done')).length !== 7 || bie?.key !== 'noc' || !bie.jak)
          throw new Error(`${name}: stan bez długiej listy zrobionych celów i bieżącego „noc”`);
        const stan = () =>
          page.$eval('#goals', (e) => ({
            wysokosc: e.clientHeight,
            tresc: e.scrollHeight,
            przewiniecie: Math.round(e.scrollTop),
            gora: Math.round(e.getBoundingClientRect().top),
          }));
        // bez karty osoby okienko mieści się w całości i nie przewija się
        const bez = await stan();
        console.log(`  bez karty: okienko ${bez.wysokosc} px, treść ${bez.tresc} px`);
        if (bez.tresc > bez.wysokosc + 1)
          throw new Error(`${name}: okienko bez karty osoby jest przycięte (${bez.tresc} > ${bez.wysokosc})`);
        await bezNachodzenia(page, `${name}, bez karty osoby`);
        const otworzKarte = async () => {
          await page.click('#lista .lp >> nth=0');
          await page.waitForSelector('#card:not([hidden])');
          await poHudzie(page);
        };
        const zamknijKarte = async () => {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.getElementById('card')!.hidden, null, { timeout: 3000 });
          await poHudzie(page);
        };
        // z kartą osoby okienko jest ograniczone, przewinięte do bieżącego celu i nie nachodzi na kartę
        const cam = await kamera(page);
        await otworzKarte();
        const z = await stan();
        console.log(`  z kartą: okienko ${z.wysokosc} px, treść ${z.tresc} px, przewinięcie ${z.przewiniecie} px`);
        if (z.tresc <= z.wysokosc + 1)
          throw new Error(
            `${name}: z kartą okienko nie jest ograniczone (${z.tresc} <= ${z.wysokosc}), stan niczego nie dowodzi`,
          );
        // najpierw ogólne sprawdzenie układu (w nim pada przycięty bieżący cel), potem to, że lista faktycznie się przewinęła
        await bezNachodzenia(page, `${name}, z kartą osoby`);
        if (z.przewiniecie <= 0) throw new Error(`${name}: okienko ograniczone, ale nie przewinięte do bieżącego celu`);
        // nagłówek rozdziału jest przyklejony u góry (inaczej `naruszenia` by padło), a żaden wiersz nie jest przecięty jego
        // dolną krawędzią: spod nagłówka nie wystaje sam dół wiersza (`pokazBiezacyCel` chowa taki wiersz pod nagłówkiem)
        const przeciete = await page.evaluate(() => {
          const dol = document.querySelector('#goals > .goals-head')!.getBoundingClientRect().bottom;
          return [...document.querySelectorAll<HTMLElement>('#goals > ol.goal-list > li')]
            .filter((li) => {
              const b = li.getBoundingClientRect();
              return b.top < dol - 1 && b.bottom > dol + 1;
            })
            .map((li) => li.dataset.key ?? '?');
        });
        if (przeciete.length)
          throw new Error(`${name}: wiersz przecięty dolną krawędzią nagłówka rozdziału: ${przeciete.join(', ')}`);
        await zrzut(page, `${name}-karta`);
        // ręczne przewinięcie do początku listy nie jest cofane przez odświeżenia (`hud` co 200 ms): bieżący cel zostaje poza
        // widokiem, bo tak zdecydował gracz
        await page.mouse.move(150, 250);
        await page.mouse.wheel(0, -2000);
        await page.waitForFunction(() => document.getElementById('goals')!.scrollTop === 0, null, { timeout: 3000 });
        await poHudzie(page, 3);
        const reka = await stan();
        console.log(`  po ręcznym przewinięciu: przewinięcie ${reka.przewiniecie} px`);
        if (reka.przewiniecie !== 0)
          throw new Error(`${name}: odświeżenie cofnęło ręczne przewinięcie (${reka.przewiniecie} px)`);
        // karta znika: okienko odzyskuje wysokość i mieści się w całości
        await zamknijKarte();
        const po = await stan();
        if (po.tresc > po.wysokosc + 1) throw new Error(`${name}: po zamknięciu karty okienko dalej jest przycięte`);
        await bezNachodzenia(page, `${name}, po zamknięciu karty`);
        // druga karta: okienko znowu się kurczy i znowu pokazuje bieżący cel, choć gracz przewinął je wcześniej do góry
        await otworzKarte();
        const drugi = await stan();
        console.log(`  z kartą po raz drugi: przewinięcie ${drugi.przewiniecie} px`);
        if (drugi.przewiniecie <= 0)
          throw new Error(`${name}: po ponownym otwarciu karty okienko nie wróciło do bieżącego celu`);
        await bezNachodzenia(page, `${name}, z kartą po raz drugi`);
        // nowy rozdział wymienia listę pod przewiniętym okienkiem (hak `zm.rozdzial` robi to, co gra po pierwszej nocy):
        // przeglądarka przycina przewinięcie do zakresu listy R1, więc jej pierwszy, bieżący cel leży wtedy w polu okienka, ale pod
        // przyklejonym nagłówkiem, a `pokazBiezacyCel` ma go stamtąd wyciągnąć (bez wysokości nagłówka w obliczeniu uznałby go za
        // widoczny)
        await rozdzial(page, 'r1');
        const r1 = await stan();
        console.log(
          `  po zmianie rozdziału na R1: okienko ${r1.wysokosc} px, treść ${r1.tresc} px, przewinięcie ${r1.przewiniecie} px`,
        );
        if (r1.tresc <= r1.wysokosc + 1)
          throw new Error(
            `${name}: lista R1 mieści się w okienku (${r1.tresc} <= ${r1.wysokosc}), stan niczego nie dowodzi`,
          );
        await bezNachodzenia(page, `${name}, po zmianie rozdziału na R1`);
        await zrzut(page, `${name}-r1`);
        // z powrotem R0 (bieżący „noc” znowu na dole listy), żeby końcowy zrzut scenariusza pokazywał to, co dawniej
        await rozdzial(page, 'r0');
        await bezNachodzenia(page, `${name}, po powrocie do R0`);
        await zamknijKarte();
        await przywrocKamere(page, cam);
      },
    });

  /** Rozdział „Praca” (R3) obok panelu Pracy i karty osoby: okienko ma tytuł „Praca”, licznik 0/3 i trzy cele (bez celu
      „za siatkę”), bieżący pierwszy z podpowiedzią dla myszy albo dotyku, a zdanie o przełączniku „Może wychodzić za siatkę”
      w podpowiedzi stałego zajęcia mówi, jak jest w tym trybie (włączony: za dnia wychodzą sami, zombie: wyłączony i ryzyko
      ugryzienia); angielski bez polskich liter. Układ: okienko nie nachodzi na pasek, listę ludzi, kartę, panel budowy i panel
      Pracy (na komputerze stoją obok siebie; do 640 px arkusz Pracy zasłania okienko, kartę i podpowiedź, co robi CSS, więc na
      telefonie scenariusz sprawdza, że okienko jest wtedy schowane, a przed i po panelu ma swoje miejsce). Zrzut scenariusza
      to ostatni stan: otwarty panel Pracy (na komputerze z kartą osoby, na której stoi lista „Stałe zajęcie”) i rozdział
      z pierwszym celem. */
  const praca = (name: string, demo: string, opcje: { zombie?: boolean; dom?: boolean }, w = 1440, h = 900): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        const zombie = !!opcje.zombie;
        await start(page, base, `demo=${demo}${zombie ? '&tryb=zombie' : ''}&${GRA}&godzina=11`);
        await rozdzial(page, 'r3');
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        const n = await naglowek(page);
        if (n.tytul !== 'Praca' || n.licznik !== '0/3')
          throw new Error(`${name}: nagłówek „${n.tytul}” „${n.licznik}” zamiast „Praca” „0/3”`);
        const wr = await wiersze(page, 'rozdzial');
        tekstyCelow(
          name,
          wr,
          ['priorytet', 'stale', 'zapas'],
          [
            'Ustawcie, kto czym zajmuje się sam.',
            'Dajcie komuś stałe zajęcie.',
            'Ustawcie, ile czego trzymać w zapasie.',
          ],
        );
        console.log(`  ${wr.map((x) => `${x.key}${x.klasy.length ? `(${x.klasy.join('+')})` : ''}`).join(' ')}`);
        // bieżący jest pierwszy i tylko on ma podpowiedź; nic nie czeka i nic nie przepadło
        if (!wr[0].klasy.includes('now') || !wr[0].jak)
          throw new Error(`${name}: pierwszy cel nie jest bieżący z podpowiedzią`);
        if (wr.slice(1).some((x) => x.jak !== null || x.klasy.length))
          throw new Error(`${name}: cele 2–3 mają podpowiedź albo klasy ${wr.slice(1).map((x) => x.klasy.join('+'))}`);
        zawiera(
          name,
          wr[0].jak,
          dotyk
            ? 'Przycisk Praca u góry: stuknięcie w komórkę zmienia priorytet'
            : 'Praca (przycisk u góry albo P): klik w komórkę zmienia priorytet',
        );
        nieZawiera(name, wr[0].jak, dotyk ? 'klik' : 'stuknięcie');
        // podpowiedzi celów dalej na liście są w widoku (w DOM jest tylko bieżąca)
        const cele = (await widok(page)).rozdzial!.cele;
        zawiera(
          name,
          cele[1].how,
          'Na karcie osoby wybierzcie „Stałe zajęcie”',
          'Drwal albo Szaber',
          'przełącznik „Może wychodzić za siatkę”, ustawiany osobno dla każdej osoby; domyślnie jest ',
        );
        if (zombie) {
          zawiera(
            name,
            cele[1].how,
            'domyślnie jest wyłączony',
            'Za siatką są szwendacze: kto tam wyjdzie sam, ryzykuje ugryzienie.',
          );
          zawiera(name, cele[2].how, 'drewnie, deskach, częściach i dzidach');
        } else {
          zawiera(
            name,
            cele[1].how,
            'domyślnie jest włączony, więc za dnia ludzie sami wychodzą za siatkę po drewno i łup.',
          );
          nieZawiera(name, cele[1].how + cele[2].how, 'szwendacz', 'dzid');
          zawiera(name, cele[2].how, 'drewnie, deskach i częściach');
        }
        zawiera(name, cele[2].how, dotyk ? 'stuknijcie plus albo minus' : 'plus i minus', '„Trzymać w zapasie”');
        if (opcje.dom) {
          const slowo = BLOKOWE_UI.exec(await tekstOkienka(page))?.[0];
          if (slowo) throw new Error(`${name}: w celach domu słowo z bloku „${slowo}”`);
        }
        // angielski: tytuł „Work”, podpowiedź z „Work (button at the top, or P)”, bez polskich liter w tekście i w atrybutach
        await ustawJezyk(page, 'en');
        const ne = await naglowek(page);
        if (ne.tytul !== 'Work' || ne.licznik !== '0/3')
          throw new Error(`${name}: nagłówek po angielsku „${ne.tytul}” „${ne.licznik}”`);
        const we = await wiersze(page, 'rozdzial');
        zawiera(
          name,
          we[0].jak ?? '',
          dotyk
            ? 'The Work button at the top: tap a cell to change the priority'
            : 'Work (button at the top, or P): click a cell to change the priority',
        );
        await okienkoBezPolskich(page, `${name} po zmianie na angielski`);
        await ustawJezyk(page, 'pl');
        // układ okienka z kartą osoby i panelem budowy (na telefonie w stanie zwiniętym)
        await sprawdzUklad(page, `${name} ${w}×${h}`, dotyk);
        // panel Pracy: przycisk w pasku (na telefonie stuknięcie)
        await kliknij(page, '#btnPraca', dotyk);
        await page.waitForSelector('#pracaPanel:not([hidden]) .pr-tab');
        await poHudzie(page);
        const tabela = await page.$$eval('#pracaPanel .pr-tab tbody tr', (r) => r.length);
        if (tabela < 1) throw new Error(`${name}: panel Pracy bez wierszy osób`);
        const dzidy = await page.$$eval('#pracaPanel [data-prog^="dzidy:"]', (e) => e.length);
        if (dzidy > 0 !== zombie) throw new Error(`${name}: progi dzid w panelu: ${dzidy}, tryb zombie: ${zombie}`);
        if (dotyk) {
          // do 640 px arkusz od dołu zasłania okienko celów, kartę i podpowiedź (CSS `.praca-open`)
          const widoczne = await page.evaluate(() => getComputedStyle(document.getElementById('goals')!).display);
          if (widoczne !== 'none') throw new Error(`${name}: okienko celów nie schowało się pod arkuszem Pracy`);
          console.log(`  ${name} ${w}×${h}: arkusz Pracy chowa okienko celów`);
        } else {
          await bezNachodzenia(page, `${name} ${w}×${h}, z panelem Pracy`);
          // osoba z listy: karta ma „Stałe zajęcie” z rodzajami z podpowiedzi i przełącznik „za siatkę” w stanie trybu
          await kliknij(page, '#lista .lp >> nth=0', false);
          await page.waitForSelector('#card:not([hidden]) select[data-card="stale"]');
          await poHudzie(page);
          await bezNachodzenia(page, `${name} ${w}×${h}, z panelem Pracy i kartą osoby`);
          const lista = await page.$$eval('#card select[data-card="stale"] option', (o) => o.map((x) => x.textContent));
          zawiera(name, lista.join(), 'Drwal', 'Szaber');
          const przelacznik = await page.$eval('#card [data-card="zasiatke"]', (e) => ({
            wcisniety: e.getAttribute('aria-pressed'),
            tekst: e.textContent ?? '',
          }));
          if (przelacznik.tekst !== 'Może wychodzić za siatkę')
            throw new Error(`${name}: przełącznik na karcie „${przelacznik.tekst}”`);
          if (przelacznik.wcisniety !== String(!zombie))
            throw new Error(
              `${name}: przełącznik „za siatkę” ${przelacznik.wcisniety}, a podpowiedź mówi, że domyślnie jest ${zombie ? 'wyłączony' : 'włączony'}`,
            );
        }
      },
    });

  /** Rozdział „Praca” (R3) prawdziwymi kliknięciami: komórka priorytetu w panelu Pracy, stałe zajęcie z listy na karcie osoby i
      plus przy progu zapasu zaliczają po jednym celu, a trzeci otwiera R4. Gra stoi na pauzie, więc polecenia wchodzą do
      symulacji z krokiem (`zm.ff`); panel pokazuje zmianę od razu (nakłada czekające polecenia), a cel zalicza się dopiero z
      krokiem. Na telefonie arkusz Pracy chowa okienko celów i kartę, więc panel zamyka się przed wyborem osoby i przed
      sprawdzeniem celów. Z `zombie` najdłuższa podpowiedź stałego zajęcia (z ostrzeżeniem o szwendaczach) jest bieżącym celem
      przy karcie osoby, także po angielsku. */
  const pracaUstawienia = (name: string, opcje: { zombie?: boolean }, w: number, h: number): ShotCele =>
    shot({
      name,
      query: '',
      w,
      h,
      run: async (page, base) => {
        const dotyk = dotykowy(w);
        const zombie = !!opcje.zombie;
        await start(page, base, `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}&godzina=11`);
        await rozdzial(page, 'r3');
        await poPodpowiedziStartowej(page);
        await ustawOkienko(page, true, dotyk);
        /** klasy wszystkich celów rozdziału; na telefonie okienko po sprawdzeniu układu jest zwinięte do jednego celu, więc najpierw
            je rozwija */
        const klasy = async (): Promise<string> => {
          if (dotyk) await ustawOkienko(page, true, true);
          return (await wiersze(page, 'rozdzial')).map((x) => `${x.key}:${x.klasy.join('+') || '-'}`).join(' ');
        };
        const oczekuj = async (opis: string, ma: string): Promise<void> => {
          const jest = await klasy();
          if (jest !== ma) throw new Error(`${name}: ${opis}: cele „${jest}” zamiast „${ma}”`);
          console.log(`  ${opis}: ${jest}`);
        };
        /** polecenia z panelu i karty wchodzą do symulacji z następnym krokiem (pauza ich nie wykonuje) */
        const krokGry = async (): Promise<void> => {
          await page.evaluate(() => window.zm!.ff(1));
          await poHudzie(page);
        };
        const otworzPanel = async (): Promise<void> => {
          await kliknij(page, '#btnPraca', dotyk);
          await page.waitForSelector('#pracaPanel:not([hidden]) .pr-tab');
          await poHudzie(page);
        };
        const zamknijPanel = async (): Promise<void> => {
          await kliknij(page, '#pracaPanel .bp-x', dotyk);
          await page.waitForFunction(() => document.getElementById('pracaPanel')!.hidden, null, { timeout: 3000 });
          await poHudzie(page);
        };
        await oczekuj('na początku', 'priorytet:now stale:- zapas:-');
        // 1. komórka „Szaber” pierwszej osoby: priorytet 3 → 4 (panel pokazuje go od razu)
        await otworzPanel();
        const komorka = '#pracaPanel [data-prio$=":szaber"] >> nth=0';
        const przed = await page.$eval(komorka, (e) => e.textContent);
        await kliknij(page, komorka, dotyk);
        await page.waitForFunction(
          (s) => document.querySelector(s as string)?.textContent === '4',
          '#pracaPanel [data-prio$=":szaber"]',
          { timeout: 3000 },
        );
        if (przed !== '3') throw new Error(`${name}: komórka Szaber miała „${przed}” zamiast 3`);
        await krokGry();
        // na telefonie arkusz Pracy chowa okienko celów: zamykamy go (✕), żeby zobaczyć cele
        if (dotyk) await zamknijPanel();
        await oczekuj('po kliknięciu komórki', 'priorytet:done stale:now zapas:-');
        const jak2 = (await wiersze(page, 'rozdzial'))[1].jak ?? '';
        zawiera(name, jak2, '„Stałe zajęcie”');
        if (zombie) zawiera(name, jak2, 'Za siatką są szwendacze');
        await sprawdzUklad(page, `${name} ${w}×${h}, bieżące stałe zajęcie`, dotyk, { zrzut: `${name}-stale` });
        if (zombie && dotyk) {
          // angielska podpowiedź jest najdłuższa: okienko dalej mieści się nad listą ludzi i kartą
          await ustawJezyk(page, 'en');
          await okienkoBezPolskich(page, `${name} po zmianie na angielski`);
          await sprawdzUklad(page, `${name} ${w}×${h}, bieżące stałe zajęcie po angielsku`, dotyk, {
            zrzut: `${name}-stale-en`,
          });
          await ustawJezyk(page, 'pl');
        }
        // 2. karta osoby: stałe zajęcie z listy (zdarzenie `change` jak wybór gracza)
        await kliknij(page, '#lista .lp >> nth=0', dotyk);
        await page.waitForSelector('#card:not([hidden]) select[data-card="stale"]');
        await page.selectOption('#card select[data-card="stale"]', 'drwal');
        await krokGry();
        await oczekuj('po wyborze stałego zajęcia', 'priorytet:done stale:done zapas:now');
        // 3. panel Pracy: plus przy drewnie (próg 30 → 35)
        await otworzPanel();
        const prog = '#pracaPanel [data-prog="drewno:+5"]';
        const wartoscPrzed = await page.$eval('#pracaPanel [data-wart="drewno"]', (e) => e.textContent);
        await kliknij(page, prog, dotyk);
        await page.waitForFunction(
          (v) => document.querySelector('#pracaPanel [data-wart="drewno"]')?.textContent === String(Number(v) + 5),
          wartoscPrzed,
          { timeout: 3000 },
        );
        await krokGry();
        if (dotyk) await zamknijPanel();
        // rozdział skończony: R4 „Zarząd” z czterema celami
        const n = await naglowek(page);
        if (n.tytul !== 'Zarząd' || n.licznik !== '0/4')
          throw new Error(
            `${name}: po trzech ustawieniach nagłówek „${n.tytul}” „${n.licznik}” zamiast „Zarząd” „0/4”`,
          );
        console.log(`  po zapasie: ${n.tytul} ${n.licznik}`);
        const v = await widok(page);
        if (v.rozdzial?.k !== 'r4') throw new Error(`${name}: po trzech ustawieniach rozdział ${v.rozdzial?.k}`);
        await sprawdzUklad(page, `${name} ${w}×${h}, po rozdziale Praca`, dotyk);
        if (!dotyk) await otworzPanel();
      },
    });

  return [
    drugiDzien('cele-r1', 'przymorze', {}),
    drugiDzien('cele-r1-dom', 'zielonki', { dom: true }),
    drugiDzien('cele-r1-zombie', 'przymorze', { zombie: true }),
    drugiDzien('cele-r1-telefon', 'przymorze', {}, 390, 844),
    drugiDzien('cele-r1-dom-telefon', 'zielonki', { dom: true }, 390, 844),
    drugiDzien('cele-r1-zombie-telefon', 'przymorze', { zombie: true }, 390, 844),
    praca('cele-r3', 'przymorze', {}),
    praca('cele-r3-dom', 'zielonki', { dom: true }),
    praca('cele-r3-zombie', 'przymorze', { zombie: true }),
    praca('cele-r3-telefon', 'przymorze', {}, 390, 844),
    pracaUstawienia('cele-r3-ustawienia', {}, 1440, 900),
    pracaUstawienia('cele-r3-ustawienia-zombie-telefon', { zombie: true }, 390, 844),
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
    zombieBudowa('cele-zombie-budowa', 'przymorze', false, 1440, 900),
    zombieBudowa('cele-zombie-budowa-telefon', 'przymorze', false, 390, 844),
    zombieBudowa('cele-zombie-budowa-dom', 'zielonki', true, 1440, 900),
    zombieBudowa('cele-zombie-budowa-dom-telefon', 'zielonki', true, 390, 844),
    zombieNowiZapas('cele-zombie-nowi-zapas', 'przymorze', 1440, 900),
    zombieNowiZapas('cele-zombie-nowi-zapas-telefon', 'przymorze', 390, 844),
    zombieNowiTempo('cele-zombie-nowi-tempo', 1440, 900),
    nowiPodpowiedz('cele-nowi-gosc', 'przymorze', false, 1440, 900),
    nowiPodpowiedz('cele-nowi-gosc-telefon', 'przymorze', false, 390, 844),
    nowiPodpowiedz('cele-nowi-gosc-dom', 'zielonki', false, 1440, 900),
    nowiPodpowiedz('cele-nowi-gosc-dom-telefon', 'zielonki', false, 390, 844),
    nowiPodpowiedz('cele-nowi-gosc-zombie', 'przymorze', true, 1440, 900),
    nowiPodpowiedz('cele-nowi-gosc-zombie-telefon', 'przymorze', true, 390, 844),
    nowiPodpowiedz('cele-nowi-gosc-zombie-dom-telefon', 'zielonki', true, 390, 844),
    r8Teren('cele-r8-teren', 'lanciego', false, 1440, 900),
    r8Teren('cele-r8-teren-telefon', 'lanciego', false, 390, 844),
    r8Teren('cele-r8-teren-zombie-telefon', 'lanciego', true, 390, 844),
    r8Teren('cele-r8-teren-dom-telefon', 'zielonki', false, 390, 844),
    czeka('cele-czeka'),
    handlarz('cele-okazja-handlarz'),
    wedrowiec('cele-okazja-wedrowiec'),
    wedrowiecTelefon('cele-okazja-wedrowiec-telefon', 390, 844),
    ugryzienie('cele-okazja-ugryzienie'),
    ugryzienie('cele-okazja-ugryzienie-telefon', 390, 844),
    drogi('cele-drogi', 1440, 900),
    drogi('cele-drogi-telefon', 390, 844),
    telefon('cele-telefon', 390, 844),
    telefon('cele-telefon-360', 360, 780),
    angielski('en-cele-r1'),
    angielski('en-cele-r1-telefon', 390, 844),
    przewijanie('cele-przewijanie'),
    przeladowanie('cele-przeladowanie'),
  ];
}
