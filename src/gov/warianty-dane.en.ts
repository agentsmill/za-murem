/* Tabele do angielskich wydarzeń z 0.3 (src/gov/warianty.en.ts): polskie napisy z list, z których wydarzenia losują
   dane (skąd przychodzą ludzie spod bramy, tytuły książek z kartonu), punkt, z którego ktoś patrzy przez lornetkę,
   i nazwy zapasów w kosztach. Każda pozycja polskich list ma tu wpis (pilnuje tego
   tests/unit/wydarzenia03-en.test.ts), a napis spoza tablicy wraca po polsku. Nazwy własne zostają polskie i bez
   odmiany: „z Wilanowa” to „from Wilanów”. Słowa: docs/SLOWNICZEK-EN.md. */

import { DOM_EN, RL_EN } from '../content/data.en.ts';
import { type Cost, DOM, type Dom, RES, type Res, RL } from '../content/data.ts';
import type { GovPlace } from './typy.ts';

/** skąd przychodzą ludzie pod bramę: FROM_BLOK i FROM_DOM z warianty.ts (lista z 0.3 w events.ts to FROM_BLOK) */
export const FROM_EN: Readonly<Record<string, string>> = {
  'z Wilanowa': 'from Wilanów',
  'z zamkniętego osiedla z ochroną': 'from a gated estate with private security',
  'z bloku, w którym pękł pion': 'from a block where the main pipe burst',
  'ze wsi, gdzie skończyła się woda': 'from a village where the water ran out',
  'z kampusu dawnej korporacji': 'from the campus of a former corporation',
  'z osiedla za obwodnicą': 'from the estate beyond the ring road',
  'z miasta, gdzie pękł wodociąg': 'from a town where the water main burst',
  'z domu, któremu zawalił się dach': 'from a house whose roof caved in',
};
export const fromEn = (pl: string): string => FROM_EN[pl] ?? pl;

/** tytuły z BOOKS (data.ts); wewnętrzny cudzysłów pojedynczy, bo tytuł stoi w tekście w “ ” */
export const BOOKS_EN: Readonly<Record<string, string>> = {
  'Poradnik budowlany z 1987 roku': 'The Home Builder’s Guide, 1987',
  'Murowanie dla każdego': 'Bricklaying for Everyone',
  'Spawanie. Teoria i praktyka': 'Welding: Theory and Practice',
  'Hydraulika bez tajemnic': 'Plumbing Demystified',
  'Kotły i piece, wydanie z PRL': 'Boilers and Stoves, communist-era edition',
  'Instrukcja obsługi węzła cieplnego': 'Heating Substation: Operating Manual',
  'Elektronika dla opornych, wyd. 2031': 'Electronics for the Hopeless, 2031 edition',
  'Podręcznik fizyki dla liceum': 'Physics for Secondary Schools',
  'Fotowoltaika krok po kroku': 'Solar Panels Step by Step',
  'Pierwsza pomoc. Podręcznik do EDB': 'First Aid: A School Safety Textbook',
  'Farmakologia dla pielęgniarek': 'Pharmacology for Nurses',
  'Choroby wewnętrzne, tom 2': 'Internal Medicine, Volume 2',
  'Ogród na balkonie': 'The Balcony Garden',
  'Atlas grzybów z dopiskiem „nie jeść”': 'Atlas of Mushrooms, annotated ‘do not eat’',
  'Uprawa warzyw pod osłonami': 'Growing Vegetables Under Cover',
  'Python dla zaawansowanych, wyd. 7': 'Advanced Python, 7th edition',
  'Sieci komputerowe w praktyce': 'Computer Networks in Practice',
  'Linux. Biblia administratora': 'Linux: The Administrator’s Bible',
};
export const bookEn = (pl: string): string => BOOKS_EN[pl] ?? pl;

/** skąd ktoś patrzy przez lornetkę: najwyższy budynek w okolicy (TOWER w warianty.ts) */
export const TOWER_EN: Readonly<Record<NonNullable<GovPlace['tower']>, string>> = {
  wiezowiec: 'From the roof of the tower block',
  blok: 'From the roof of a tall block',
  szkola: 'From the school roof',
  kosciol: 'From the church tower',
  hala: 'From the warehouse roof',
  market: 'From the supermarket roof',
};

/** nazwy zapasów w kosztach; „Opał” z 0.3 gra pokazuje jako „Drewno”, więc po angielsku Wood, nie Fuel */
export const RES_EN: Readonly<Record<Res, string>> = { ...RL_EN, opal: 'Wood' };

/** koszt jak costText z data.ts, po angielsku: „Parts 2, Scrap 2” */
export const costEn = (c: Cost): string =>
  (Object.entries(c) as [Res, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${RES_EN[k]} ${v}`)
    .join(', ');

/** polska nazwa zapasu z wpisu do kroniki (już z „Drewno”) po angielsku */
const RES_PL: ReadonlyMap<string, string> = new Map([
  ...RES.map((r) => [RL[r], RES_EN[r]] as const),
  ['Drewno', RES_EN.opal],
]);

/** koszt z polskiego wpisu do kroniki („Części 2, Złom 2”) po angielsku; nieznana nazwa zostaje */
export const costPlEn = (s: string): string =>
  s
    .split(', ')
    .map((part) => {
      const m = /^(\S+) (\d+)$/.exec(part);
      return m ? `${RES_PL.get(m[1]) ?? m[1]} ${m[2]}` : part;
    })
    .join(', ');

/** dziedzina z polskiej nazwy (DOM: „Elektryka”) po angielsku; nieznana zostaje */
const DOM_PL: ReadonlyMap<string, string> = new Map(
  (Object.entries(DOM) as [Dom, string][]).map(([k, v]) => [v, DOM_EN[k]]),
);
export const dziedzinaEn = (pl: string): string => DOM_PL.get(pl) ?? pl;
