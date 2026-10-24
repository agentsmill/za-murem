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

   Stan gry scenariusze prowadzą grą (samouczek, noc, raport, przewijanie przez `zm.ff` z odpowiedziami na okna zarządu),
   a tam, gdzie gra potrzebuje do tego godzin ludzkiej roboty, ustawiają stan wprost jak dzisiejsze scenariusze (pracownia,
   ugryzienie, zapas drewna), a rozdział hakiem `zm.rozdzial`. Tekst jest sprawdzany w DOM, nie w widoku `zm.cele()`; widok
   służy do sprawdzenia, co jest zaliczone, a co przepadło. */

import path from 'node:path';
import type { Page } from '@playwright/test';
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

/** przewija do minuty gry `cel` (krok skraca się przy celu, żeby nie przeskoczyć np. 20:00) */
const doChwili = (page: Page, cel: number, o: Przewijanie): Promise<Okno | null> =>
  przewin(page, (t) => t >= cel, { ...o, krok: (t) => Math.min(15, Math.max(0.1, cel - t)) });

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

/** Okienko celów nie nachodzi na nic, co stoi obok (pasek u góry, chipy listy ludzi, karta osoby, panele budowy i Pracy,
    przyciski przybliżenia, minimapa, komunikat o przybyszach, znacznik suchego drzewa, pasek stawiania, podpowiedź u dołu),
    mieści się w oknie, nie jest szersze niż jego ramka i nie przewija strony w bok. Zwraca opisy naruszeń. */
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
    const cele = document.getElementById('goals')!;
    if (!widoczny(cele)) return ['okienko celów jest niewidoczne'];
    const opis = (r: DOMRect) =>
      `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
    const a = cele.getBoundingClientRect();
    const bledy: string[] = [];
    if (a.left < 0 || a.top < 0 || a.right > innerWidth + 0.5 || a.bottom > innerHeight + 0.5)
      bledy.push(`okienko celów wystaje z okna (${opis(a)} w oknie ${innerWidth}×${innerHeight})`);
    if (cele.scrollWidth > cele.clientWidth + 1)
      bledy.push(`treść okienka szersza niż ono samo (${cele.scrollWidth} > ${cele.clientWidth})`);
    const przeszkody: [string, string][] = [
      ['#top', 'pasek u góry'],
      ['#lista .lp', 'listę ludzi'],
      ['#card', 'kartę osoby'],
      ['#buildPanel', 'panel budowy'],
      ['#pracaPanel', 'panel Pracy'],
      ['.mapctl', 'przyciski przybliżenia'],
      ['#minimapa', 'minimapę'],
      ['#arrive', 'komunikat o przybyszach'],
      ['#treeMark .treemark-t', 'znacznik suchego drzewa'],
      ['#placeBar', 'pasek stawiania'],
      ['#hint', 'podpowiedź u dołu'],
    ];
    for (const [sel, nazwa] of przeszkody)
      for (const e of document.querySelectorAll(sel)) {
        if (!widoczny(e)) continue;
        const b = e.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1)
          bledy.push(
            `okienko celów nachodzi na ${nazwa} o ${Math.round(w)}×${Math.round(h)} px (okienko ${opis(a)}, ${nazwa} ${opis(b)})`,
          );
      }
    if (document.documentElement.scrollWidth > innerWidth + 1) bledy.push('strona przewija się w poziomie');
    return bledy;
  });
}

async function bezNachodzenia(page: Page, opis: string): Promise<void> {
  const b = await naruszenia(page);
  const r = await page.$eval('#goals', (e) => {
    const x = e.getBoundingClientRect();
    return `${Math.round(x.left)},${Math.round(x.top)}–${Math.round(x.right)},${Math.round(x.bottom)}`;
  });
  console.log(`  ${opis}: okienko ${r}${b.length ? ` NARUSZENIA: ${b.length}` : ', bez nachodzenia'}`);
  if (b.length) throw new Error(`${opis}: ${b.join('; ')}`);
}

/** Układ okienka celów w trzech stanach: samo, z kartą osoby (zaznaczoną przez chip na liście) i z kartą oraz panelem
    budowy. Po sprawdzeniu zamyka panel i zaznaczenie (Esc dwa razy) i przywraca kamerę, którą klik w chip przesuwa.
    `zrzut` to nazwa zrzutu stanu z kartą i panelem (nic, gdy nie podano). */
async function ukladZPanelami(
  page: Page,
  opis: string,
  dotyk: boolean,
  zrzut?: (nazwa: string) => Promise<unknown>,
  nazwa?: string,
): Promise<void> {
  await bezNachodzenia(page, `${opis}, samo okienko`);
  const cam = await kamera(page);
  await kliknij(page, '#lista .lp >> nth=0', dotyk);
  await page.waitForSelector('#card:not([hidden])');
  await page.waitForTimeout(500);
  await bezNachodzenia(page, `${opis}, z kartą osoby`);
  await kliknij(page, '#btnBuild', dotyk);
  await page.waitForSelector('#buildPanel .tile');
  await page.waitForTimeout(500);
  await bezNachodzenia(page, `${opis}, z kartą osoby i panelem budowy`);
  if (zrzut && nazwa) await zrzut(nazwa);
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
    const ciało = document.querySelector('#sheet .sheet-body')!.getBoundingClientRect();
    return {
      tekst: l.textContent ?? '',
      wOknie: lr.left >= sr.left - 0.5 && lr.right <= sr.right + 0.5 && lr.top >= sr.top && lr.bottom <= sr.bottom,
      podNaglowkiem: lr.top >= glowa.bottom - 0.5,
      nadTrescia: lr.bottom <= ciało.top + 0.5,
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

/* ---------------------------------------------------------------- scenariusze */

export function celeShots(out: string): ShotCele[] {
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
        await ukladZPanelami(page, `${name} 1440×900`, false, (n) => zrzut(page, n), `${name}-karta-budowa`);
      },
    });

  return [
    drugiDzien('cele-r1', 'przymorze', {}),
    drugiDzien('cele-r1-dom', 'zielonki', { dom: true }),
    drugiDzien('cele-r1-zombie', 'przymorze', { zombie: true }),
  ];
}
