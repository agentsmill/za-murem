/* Angielskie nazwy zawodów mieszkańców z adresu do rysowania (docs/superpowers/specs/2026-10-18-angielski-design.md).
   W stanie gry zawód osoby z generatora to polski napis w formie płci (fach na 2051, dawny zawód albo „dziecko”,
   „mieszkanka”, „mieszkaniec”); `ZAWODY_MIESZKANCOW_EN` tłumaczy go po napisie, bez względu na formę. `zawodEn`
   z src/content/data.en.ts zagląda tu po zawodach spoza tablicy z 0.3, a angielskie historie (angielski.ts) biorą fach
   po id (`fachEn`) i dawny zawód po polskiej nazwie (`dawnyZawodEn`). Polskie nazwy zostają w fachy.ts bez zmian.

   Słowa: brytyjski angielski i słowniczek (docs/SLOWNICZEK-EN.md). Po angielsku zawód ma zwykle jedną formę dla obu
   płci; dwie (męska, żeńska) tylko tam, gdzie angielski je ma (postman, postwoman). Satyra zostaje satyrą: prompt
   engineer, ESG consultant, metaverse estate agent. Wszystko małymi literami jak w fachy.ts (wielkość pierwszej litery
   dopasowuje `zawodEn`). */

import { DAWNE_ZAWODY, FACHY, type IdFachu } from './fachy.ts';
import type { Plec } from './typy.ts';

/** Fachy na 2051 po id z fachy.ts, jedna nazwa dla obu płci. */
export const FACHY_EN: Readonly<Record<IdFachu, string>> = {
  // budowa
  murarz: 'bricklayer',
  majster: 'master builder',
  pomocnikBud: 'builder’s labourer',
  uszczelniacz: 'draught-proofer',
  spawacz: 'battery welder',
  barykadnik: 'barricade builder',
  // ciepło
  zdun: 'stove mason',
  instalator: 'heating fitter',
  palacz: 'boiler-room stoker',
  kozowy: 'stove fitter',
  drwal: 'woodcutter',
  pompiarz: 'heat pump fitter',
  // prąd
  elektryk: 'electrician',
  lataczKabli: 'cable patcher',
  panelowy: 'solar panel keeper',
  krotkofalowiec: 'radio ham',
  gazogenerator: 'wood-gas operator',
  akumulatory: 'battery technician',
  // medycyna
  felczer: 'medic',
  lekarz: 'doctor',
  pielegniarz: 'nurse',
  zielarz: 'herbalist',
  sanitariusz: 'first-aider',
  polozny: 'midwife',
  opiekunChorych: 'carer',
  lowcaFagow: 'phage hunter',
  // uprawy
  ogrodnik: 'gardener',
  ogrodDach: 'rooftop gardener',
  dzialkowiec: 'allotment holder',
  pieczarkarz: 'mushroom grower',
  hodowcaKur: 'chicken keeper',
  szklarniarz: 'greenhouse keeper',
  kucharz: 'soup kitchen cook',
  przetwory: 'pickling pensioner',
  // informatyka
  serwerOlej: 'oil-cooled server minder',
  mesh: 'mesh network technician',
  dron: 'drone pilot',
  odzysk: 'salvage IT technician',
  szeptacz: 'model whisperer',
  ksiegowy: 'rations accountant',
  // obrona
  wartownik: 'guard',
  straznik: 'estate warden',
  zwiadowca: 'supply-run scout',
  kurierPieszy: 'foot courier',
};

/** Dawne zawody po męskiej nazwie z fachy.ts: jedna nazwa albo [męska, żeńska]. */
export const DAWNE_ZAWODY_EN: Readonly<Record<string, string | readonly [string, string]>> = {
  // zwykłe
  student: 'student',
  'uczeń technikum': 'technical college student',
  'student biotechnologii': 'biotech student',
  sprzedawca: 'shop assistant',
  kasjer: 'cashier',
  kucharz: 'cook',
  kurier: 'courier',
  fryzjer: 'hairdresser',
  ochroniarz: 'security guard',
  murarz: 'bricklayer',
  spawacz: 'welder',
  'mechanik samochodowy': 'car mechanic',
  hydraulik: 'plumber',
  elektryk: 'electrician',
  'monter klimatyzacji': 'air-con fitter',
  magazynier: 'warehouse worker',
  listonosz: ['postman', 'postwoman'],
  rolnik: 'farmer',
  ogrodnik: 'gardener',
  dozorca: 'caretaker',
  strażak: 'firefighter',
  policjant: 'police officer',
  programista: 'programmer',
  'kierowca autobusu': 'bus driver',
  'kierowca ciężarówki': 'lorry driver',
  nauczyciel: 'teacher',
  księgowy: 'accountant',
  urzędnik: 'civil servant',
  bibliotekarz: 'librarian',
  pielęgniarz: 'nurse',
  'ratownik medyczny': 'paramedic',
  lekarz: 'doctor',
  farmaceuta: 'pharmacist',
  weterynarz: 'vet',
  emeryt: 'pensioner',
  // satyra
  'stażysta w startupie': 'startup intern',
  'kurier z hulajnogą': 'e-scooter courier',
  influencer: 'influencer',
  'prompt engineer': 'prompt engineer',
  'tester lodówek na abonament': 'subscription fridge tester',
  'twórca NFT': 'NFT creator',
  'projektant aplikacji do segregacji śmieci': 'recycling app designer',
  'coach mindfulness': 'mindfulness coach',
  'doradca ds. ESG': 'ESG consultant',
  'scrum master': 'scrum master',
  'pośrednik w handlu gruntami w metawersum': 'metaverse estate agent',
  'sprzedawca kredytów węglowych': ['carbon credit salesman', 'carbon credit saleswoman'],
  'menedżer ds. doświadczeń klienta': 'customer experience manager',
  'specjalista ds. rezygnacji z subskrypcji': 'subscription cancellation specialist',
};

const wFormie = (en: string | readonly [string, string], plec: Plec): string =>
  typeof en === 'string' ? en : plec === 'K' ? en[1] : en[0];

/** polska nazwa (męska albo żeńska, jak w stanie gry) → angielska; fachy, dawne zawody i trzy napisy bez zawodu */
export const ZAWODY_MIESZKANCOW_EN: Readonly<Record<string, string>> = (() => {
  const t: Record<string, string> = { dziecko: 'child', mieszkanka: 'resident', mieszkaniec: 'resident' };
  for (const f of FACHY) {
    t[f.m] = FACHY_EN[f.id];
    t[f.k] = FACHY_EN[f.id];
  }
  for (const z of DAWNE_ZAWODY) {
    const en = DAWNE_ZAWODY_EN[z.m];
    if (en === undefined) continue; // test pilnuje, że każdy zawód ma wpis
    // ta sama polska nazwa fachu i zawodu (murarz, lekarz) ma po angielsku tę samą nazwę: pilnuje test
    t[z.m] ??= wFormie(en, 'M');
    t[z.k] ??= wFormie(en, 'K');
  }
  return t;
})();

/** te same nazwy małymi literami (wydarzenia z 0.3 piszą `prof.toLowerCase()`, nagłówek karty bywa z wielkiej) */
const MALYMI = new Map(Object.entries(ZAWODY_MIESZKANCOW_EN).map(([pl, en]) => [pl.toLowerCase(), en]));

/** zawód osoby z generatora po angielsku (polska nazwa w dowolnej wielkości liter) albo undefined, gdy tablica go nie
    zna */
export const mieszkancyEn = (prof: string): string | undefined =>
  Object.hasOwn(ZAWODY_MIESZKANCOW_EN, prof) ? ZAWODY_MIESZKANCOW_EN[prof] : MALYMI.get(prof.toLowerCase());

/** fach po id (`Osoba.fach`) po angielsku albo undefined dla id spoza tabeli */
export const fachEn = (id: string): string | undefined =>
  Object.hasOwn(FACHY_EN, id) ? FACHY_EN[id as IdFachu] : undefined;

/** dawny zawód (polska nazwa w formie płci, `Osoba.dawnyZawod`) po angielsku albo undefined */
export const dawnyZawodEn = (zawod: string): string | undefined => mieszkancyEn(zawod);
