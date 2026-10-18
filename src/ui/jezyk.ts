/* Wybór języka w przeglądarce (docs/superpowers/specs/2026-10-18-angielski-design.md): parametr adresu `lang=en|pl`
   (do zrzutów i prób ręcznych: wygrywa z pamięcią, ale jej nie nadpisuje), pamięć przeglądarki pod JEZYK_KEY,
   a bez obu angielski, niezależnie od języka przeglądarki. Napisy statyczne z index.html są tu w jednej tablicy
   (STATYCZNE): index.html ma wersję angielską, a nalozStatyczne() wpisuje teksty w bieżącym języku przy starcie
   i po każdej zmianie. Przełącznik EN/PL (karta startowa i Menu) woła zmienJezyk(): zapis w pamięci, `<html lang>`,
   napisy statyczne i słuchacze z src/core/jezyk.ts, po których main.ts rysuje resztę od nowa. */

import { type Lang, poZmianieJezyka, type Tx, tr, tx, ustawJezyk } from '../core/jezyk.ts';
import { esc } from './tekst.ts';

export const JEZYK_KEY = 'za-murem-0.4-jezyk';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const poprawny = (v: string | null | undefined): v is Lang => v === 'en' || v === 'pl';

/** język gry: poprawny parametr adresu, potem poprawny zapisany wybór, potem angielski */
export function wybierzJezyk(param: string | null, zapisany: string | null): Lang {
  if (poprawny(param)) return param;
  if (poprawny(zapisany)) return zapisany;
  return 'en';
}

/** zapisany wybór gracza albo null (pamięć niedostępna, tryb prywatny) */
export function zapisanyJezyk(s: Store | null = store()): string | null {
  try {
    return s?.getItem(JEZYK_KEY) ?? null;
  } catch {
    return null;
  }
}

const dom = (): boolean => typeof document !== 'undefined';

/** start: ustawia język gry, `<html lang>` i napisy statyczne; parametr `lang` nie trafia do pamięci */
export function startJezyka(o: { params?: URLSearchParams; store?: Store | null } = {}): Lang {
  const params = o.params ?? new URLSearchParams(globalThis.location?.search ?? '');
  const l = wybierzJezyk(params.get('lang'), zapisanyJezyk(o.store === undefined ? store() : o.store));
  ustawJezyk(l);
  if (dom()) {
    document.documentElement.lang = l;
    nalozStatyczne();
  }
  return l;
}

/** zmiana języka przez gracza: zapis w pamięci, adres bez `lang` (żeby przeładowanie go nie cofnęło), napisy
    statyczne i słuchacze */
export function zmienJezyk(l: Lang, s: Store | null = store()): void {
  try {
    s?.setItem(JEZYK_KEY, l);
  } catch {
    // bez pamięci wybór działa do zamknięcia karty
  }
  if (dom()) {
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) {
      u.searchParams.delete('lang');
      history.replaceState(history.state, '', u.toString());
    }
  }
  // `<html lang>` i napisy statyczne robi słuchacz niżej, przed słuchaczami main.ts
  ustawJezyk(l);
}

/* Po każdej zmianie języka najpierw napisy statyczne i `<html lang>`: słuchacz z chwili importu tego modułu woła się
   przed słuchaczami main.ts, więc te mogą nadpisać napis, który zależy od stanu gry (przycisk alarmu). */
poZmianieJezyka((l) => {
  if (!dom()) return;
  document.documentElement.lang = l;
  nalozStatyczne();
});

/** napis statyczny z index.html: selektor i teksty w obu językach (treść, title, aria-label, placeholder albo HTML) */
export interface Statyczny {
  sel: string;
  tekst?: Tx;
  title?: Tx;
  aria?: Tx;
  placeholder?: Tx;
  html?: Tx;
}

const LICENCJE = 'data/mieszkancy/LICENCJE.md';
const a = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** pole paska: krótki podpis i dymek */
const stat = (id: string, k: Tx, title: Tx): Statyczny[] => [
  { sel: `#${id}`, title },
  { sel: `#${id} .stat-k`, tekst: k },
];

export const STATYCZNE: readonly Statyczny[] = [
  // karta startowa
  { sel: '.start-card .sign.big small', tekst: tx('spółdzielnia po upadku', 'a housing co-op after the fall') },
  { sel: '#btnForget', tekst: tx('Usuń zapis', 'Delete save') },
  { sel: 'label[for="addr"]', tekst: tx('Adres twojego osiedla', 'Your estate’s address') },
  { sel: '#startForm .mode', aria: tx('Tryb gry', 'Game mode') },
  { sel: '#startForm .mode-o:not(.zombie) span', tekst: tx('Zwykły', 'Normal') },
  { sel: '#addr', placeholder: tx('np. Wołoska 12, Warszawa', 'e.g. Wołoska 12, Warszawa') },
  { sel: '#startForm button[type="submit"]', tekst: tx('Wczytaj osiedle', 'Load the estate') },
  {
    sel: '.start-card > p.fine',
    html: tx(
      `Adres trafia do wyszukiwarki OpenStreetMap (Nominatim), mapę pobieramy z darmowych kafelków ${a('https://openfreemap.org', 'OpenFreeMap')}. Dane mapy © współtwórcy ${a('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}, kafelki © ${a('https://www.openmaptiles.org/', 'OpenMapTiles')}. Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL (${a(LICENCJE, 'źródła i licencje')}).`,
      `Your address goes to the OpenStreetMap search (Nominatim), and the map comes from free ${a('https://openfreemap.org', 'OpenFreeMap')} tiles. Map data © ${a('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} contributors, tiles © ${a('https://www.openmaptiles.org/', 'OpenMapTiles')}. The residents are made up from Polish statistics, GUS and PESEL (${a(LICENCJE, 'sources and licences')}).`,
    ),
  },
  // ekran gry
  { sel: '#treeMark .treemark-t', tekst: tx('Suche drzewo', 'Dead tree') },
  { sel: '#hSeason', tekst: tx('jesień 2051', 'autumn 2051') },
  { sel: '#speed .sr', tekst: tx('Tempo gry', 'Game speed') },
  { sel: '#speed [data-s="0"]', tekst: tx('Pauza', 'Pause') },
  {
    sel: '#btnAlarm',
    tekst: tx('Do broni!', 'To arms!'),
    title: tx('Wszyscy zdolni z zarządu na wartę', 'Everyone fit on the board goes on watch'),
  },
  ...stat('sFence', tx('siatka', 'fence'), tx('Siatka', 'Fence')),
  ...stat('sHorde', tx('stado', 'herd'), tx('Szwendacze przy siatce', 'Shamblers at the fence')),
  ...stat('sOut', tx('dwór', 'outside'), tx('Temperatura na dworze', 'Temperature outside')),
  ...stat('sKit', tx('kuchnia', 'kitchen'), tx('Temperatura w kuchni zarządu', 'Temperature in the board’s kitchen')),
  ...stat('sFire', tx('koza', 'stove'), tx('Ogień w kozie zarządu', 'Fire in the board’s stove')),
  ...stat(
    'sWood',
    tx('drewno', 'wood'),
    tx('Drewno: w składzie, luzem i w kozie', 'Wood: on the woodpile, lying around and in the stove'),
  ),
  ...stat('sBoards', tx('deski', 'planks'), tx('Deski', 'Planks')),
  ...stat('sScrap', tx('złom', 'scrap'), tx('Złom', 'Scrap')),
  ...stat('sParts', tx('części', 'parts'), tx('Części', 'Parts')),
  ...stat('sMats', tx('d·z·cz', 'pl·sc·pa'), tx('Deski, złom, części', 'Planks, scrap, parts')),
  ...stat(
    'sFood',
    tx('jedzenie', 'food'),
    tx('Jedzenie: zapasy i ugotowane porcje', 'Food: supplies and cooked portions'),
  ),
  ...stat('sTrust', tx('zaufanie', 'trust'), tx('Zaufanie mieszkańców do zarządu', 'Residents’ trust in the board')),
  ...stat('sAnger', tx('wkurzenie', 'anger'), tx('Wkurzenie mieszkańców', 'Residents’ anger')),
  // mapa miasta: na telefonie krótki napis (src/ui/miasto.css), pełny w aria-label i dymku
  {
    sel: '#btnMiasto',
    html: tx(
      '<span class="mm-dlugi">Mapa miasta</span><span class="mm-krotki">Mapa</span>',
      '<span class="mm-dlugi">City map</span><span class="mm-krotki">Map</span>',
    ),
    aria: tx('Mapa miasta', 'City map'),
    title: tx('Mapa miasta: miejsca na wyprawy (M)', 'City map: places for supply runs (M)'),
  },
  // minimapa miasta (src/ui/minimapa.ts): przycisk z płótnem i atrybucja map pod nim (te same trzy źródła co w oknie mapy)
  {
    sel: '#minimapaBtn',
    aria: tx('Minimapa: otwórz mapę miasta', 'Minimap: open the city map'),
    title: tx('Minimapa: otwórz mapę miasta (M)', 'Minimap: open the city map (M)'),
  },
  {
    sel: '.minimapa-attrib',
    html: tx(
      `© ${a('https://www.openstreetmap.org/copyright', 'współtwórcy OpenStreetMap')}, ${a('https://openfreemap.org', 'OpenFreeMap')}, ${a('https://www.openmaptiles.org/', 'OpenMapTiles')}`,
      `© ${a('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}, ${a('https://openfreemap.org', 'OpenFreeMap')}, ${a('https://www.openmaptiles.org/', 'OpenMapTiles')}`,
    ),
  },
  { sel: '#btnBuild', tekst: tx('Budowa', 'Build') },
  { sel: '#goals', aria: tx('Cele', 'Goals') },
  { sel: '#arriveShow', tekst: tx('Pokaż', 'Show') },
  { sel: '#placeBar [data-place="rot"]', tekst: tx('Obróć', 'Rotate') },
  { sel: '#placeBar [data-place="cancel"]', tekst: tx('Anuluj', 'Cancel') },
  { sel: '#zIn', aria: tx('Przybliż', 'Zoom in') },
  { sel: '#zOut', aria: tx('Oddal', 'Zoom out') },
  { sel: '#zHome', aria: tx('Pokaż siedzibę zarządu', 'Show the board’s HQ') },
  {
    sel: '.attrib',
    html: tx(
      `© ${a('https://www.openstreetmap.org/copyright', 'współtwórcy OpenStreetMap')} · ${a('https://openfreemap.org', 'OpenFreeMap')} · ${a('https://www.openmaptiles.org/', 'OpenMapTiles')} · ${a(LICENCJE, 'mieszkańcy: GUS, PESEL, SGJP')}`,
      `© ${a('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')} · ${a('https://openfreemap.org', 'OpenFreeMap')} · ${a('https://www.openmaptiles.org/', 'OpenMapTiles')} · ${a(LICENCJE, 'residents: GUS, PESEL, SGJP')}`,
    ),
  },
];

/** wpisuje napisy statyczne w bieżącym języku (brakujące elementy pomija) */
export function nalozStatyczne(root: ParentNode = document): void {
  for (const s of STATYCZNE)
    for (const el of root.querySelectorAll<HTMLElement>(s.sel)) {
      if (s.tekst) el.textContent = tr(s.tekst);
      if (s.html) el.innerHTML = tr(s.html);
      if (s.title) el.title = tr(s.title);
      if (s.aria) el.setAttribute('aria-label', tr(s.aria));
      if (s.placeholder) (el as HTMLInputElement).placeholder = tr(s.placeholder);
    }
}

/** przełącznik EN/PL: dwa przyciski z data-lang, wciśnięty ten w bieżącym języku */
export function przelacznikHtml(l: Lang): string {
  const b = (k: Lang, label: string, name: string) =>
    `<button type="button" class="lang-b" data-lang="${k}" aria-pressed="${k === l}" lang="${k}" title="${esc(name)}">${label}</button>`;
  return `<div class="lang" role="group" aria-label="Language / Język">${b('en', 'EN', 'English')}${b('pl', 'PL', 'Polski')}</div>`;
}

/** obsługa kliknięć przełącznika w elemencie (raz na element); `po` woła się po zmianie */
export function podepnijPrzelacznik(el: HTMLElement, po?: (l: Lang) => void): void {
  if (el.dataset.przelacznik) return;
  el.dataset.przelacznik = '1';
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]');
    const l = b?.dataset.lang;
    if (!poprawny(l)) return;
    zmienJezyk(l);
    po?.(l);
  });
}
