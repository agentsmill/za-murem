/* Treść zarządu w M1 „Pierwsza noc za siatką”: uchwały na pierwsze noce (trzy z 0.3, trzy nowe w tym
   samym tonie), nowe wydarzenia wieczoru i nocy, wybór wydarzeń z 0.3 z porą dnia, cele wypraw.
   Treść 0.3 zostaje w src/content (pilnuje jej test zgodności), tu są tylko dodatki i wybór. */

import { LAW, type LawPath } from '../content/data.ts';
import type { EventChoice, EventHost } from '../content/events.ts';
import { g } from '../content/people.ts';
import { pick } from '../core/rng.ts';
import type { GovNeeds, GovPerson, GovPlace, LootKey } from './typy.ts';

// ---------------------------------------------------------------- uchwały

export interface M1Law {
  name: string;
  path: LawPath;
  req?: string[];
  desc: string;
  /** od razu: [zaufanie, wkurzenie] */
  imm?: [number, number];
  /** codziennie rano: [zaufanie, wkurzenie] */
  daily?: [number, number];
  /** w domu jednorodzinnym (ulica i komitet ulicy): inna nazwa albo opis; liczby te same */
  dom?: { name?: string; desc?: string };
}

/**
 * Uchwały dostępne w M1. Trzy z 0.3 (nazwy, drogi i warunki z src/content), opisy z tym, co robią
 * w nowej grze; trzy nowe. Drogi Porządek i Wspólnota wykluczają się jak w 0.3.
 */
export const M1_LAWS: Record<string, M1Law> = {
  u_warty: {
    name: LAW.u_warty.name,
    path: LAW.u_warty.path,
    desc: 'Co noc przy bramie stoi ktoś z mieszkańców, a warta zarządu pilnuje lepiej. Obrona przy bramie +1,5, warta mocniejsza o ćwierć, szansa napadu −5 punktów.',
    dom: {
      name: 'Warty przy furtce',
      desc: 'Co noc przy furtce stoi ktoś z domowników, a warta komitetu pilnuje lepiej. Obrona przy furtce +1,5, warta mocniejsza o ćwierć, szansa napadu −5 punktów.',
    },
  },
  u_brama: {
    name: 'Brama na kłódkę od 20:00',
    path: 'porzadek',
    req: ['u_warty'],
    desc: 'Po zmroku nikt nie wchodzi ani nie wychodzi, klucz ma tylko zarząd. Szansa napadu −8 punktów, wędrowców spod bramy nikt nie wpuszcza. Wkurzenie +0,2 dziennie.',
    daily: [0, 0.2],
    dom: {
      name: 'Furtka na kłódkę od 20:00',
      desc: 'Po zmroku nikt nie wchodzi ani nie wychodzi, klucz ma tylko komitet. Szansa napadu −8 punktów, wędrowców spod furtki nikt nie wpuszcza. Wkurzenie +0,2 dziennie.',
    },
  },
  u_zebrania: {
    name: LAW.u_zebrania.name,
    path: LAW.u_zebrania.path,
    desc: LAW.u_zebrania.desc,
    daily: [0.4, 0],
    dom: { name: 'Zebrania przy kozie' },
  },
  u_kociol: {
    name: 'Wspólny kocioł',
    path: 'wspolnota',
    desc: 'Wszystkie zapasy idą do jednego garnka przy kozie. Każdy je tyle samo, także ci, co nie pracują. Zaufanie +2 od razu i +0,3 dziennie, jedzenie schodzi o 10% szybciej.',
    imm: [2, 0],
    daily: [0.3, 0],
  },
  u_racje: {
    name: LAW.u_racje.name,
    path: LAW.u_racje.path,
    desc: 'Jedzenie schodzi o 25% wolniej. Wkurzenie +0,4 dziennie.',
    daily: [0, 0.4],
  },
  u_meble: {
    name: 'Meble na opał',
    path: 'base',
    desc: 'Meble z pustych mieszkań idą do kozy bez pytania o zgodę. Palenie cudzych mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.',
    imm: [0, 2],
    daily: [0, 0.1],
    dom: {
      desc: 'Meble idą do kozy bez pytania domowników o zgodę. Palenie mebli boli połowę mniej, ale wkurzenie +2 od razu i +0,1 dziennie.',
    },
  },
};

/** nazwa uchwały według miejsca (w domu furtka i komitet zamiast bramy, klatek i zarządu) */
export const lawName = (id: string, p: GovPlace): string =>
  (p.kind === 'dom' ? M1_LAWS[id].dom?.name : undefined) ?? M1_LAWS[id].name;
export const lawDesc = (id: string, p: GovPlace): string =>
  (p.kind === 'dom' ? M1_LAWS[id].dom?.desc : undefined) ?? M1_LAWS[id].desc;

/** pierwsza uchwała, wieczorem pierwszego dnia: warta, dzielenie jedzenia, palenie mebli */
export const FIRST_LAWS = ['u_warty', 'u_kociol', 'u_meble'] as const;

// ---------------------------------------------------------------- wyprawy

export interface ExpTarget {
  id: string;
  name: string;
  range: 'blisko' | 'daleko';
  /** szansa kłopotów (szabrownicy, zawalone schody) */
  risk: number;
  loot: Partial<Record<LootKey, [number, number]>>;
  /** godzina powrotu */
  back: number;
}

/** cele poza mapą; ryzyko jak POICAT z 0.3 dla podobnych miejsc, łup w jednostkach symulacji */
export const TARGETS: ExpTarget[] = [
  {
    id: 'mieszkania',
    name: 'opuszczone mieszkania w bloku obok',
    range: 'blisko',
    risk: 0.12,
    loot: { wood: [2, 5], supplies: [1, 3] },
    back: 1,
  },
  {
    id: 'garaze',
    name: 'garaże za trzepakiem',
    range: 'blisko',
    risk: 0.1,
    loot: { wood: [1, 3], scrap: [2, 5] },
    back: 1,
  },
  {
    id: 'pawilon',
    name: 'pawilon handlowy',
    range: 'daleko',
    risk: 0.28,
    loot: { supplies: [3, 7], scrap: [1, 3], parts: [0, 2] },
    back: 5,
  },
  {
    id: 'stacja',
    name: 'stacja paliw przy obwodnicy',
    range: 'daleko',
    risk: 0.3,
    loot: { wood: [4, 9], supplies: [1, 4], parts: [0, 1] },
    back: 5,
  },
  {
    id: 'apteka',
    name: 'apteka przy przystanku',
    range: 'daleko',
    risk: 0.32,
    loot: { meds: [1, 3], supplies: [0, 2] },
    back: 5,
  },
];

/** nazwa celu wyprawy według miejsca: w domu bez bloku obok, trzepaka i pawilonu; ryzyko i łup te same */
export function targetName(t: ExpTarget, p: GovPlace): string {
  if (t.id === 'mieszkania' && p.near !== 'bloki') return 'opuszczony dom obok';
  if (p.kind !== 'dom') return t.name;
  if (t.id === 'garaze') return p.garages === null ? 'szopy w ogrodach obok' : 'garaże obok';
  if (t.id === 'pawilon') return 'sklep przy głównej drodze';
  return t.name;
}

/** nazwy dziur w siatce, kiedy świat ich nie poda */
export const HOLE_NAMES = ['przy garażach', 'za trzepakiem', 'od ulicy', 'przy śmietniku', 'od strony bloku obok'];
/** to samo przy domu jednorodzinnym */
export const HOLE_NAMES_DOM = ['przy garażu', 'za szopą', 'od ulicy', 'przy kompostowniku', 'od strony domu obok'];

/** zakończenia gry, które M1 może dać, w domu jednorodzinnym (w bloku zostają te z 0.3 o walnym i klatkach) */
export const KONIEC_DOM: Record<'odwolanie' | 'exodus' | 'pustka', { title: string; text: string }> = {
  odwolanie: {
    title: 'Zebranie ulicy odwołało komitet',
    text: 'Wkurzenie przelało się przez płoty. Sąsiedzi zebrali się przy furtce i odwołali was przez aklamację. Nowy komitet zaczął od wymiany kłódki.',
  },
  exodus: {
    title: 'Ulica opustoszała',
    text: 'Ludzie przestali wierzyć, że z wami przetrwają. Dom po domu odchodzili na inne ulice. Zostały puste ogrody i list z banku o racie kredytu z 2047 roku.',
  },
  pustka: {
    title: 'Nikt nie przeżył',
    text: 'Ostatni domownik zgasił kozę. Ulica stoi pusta, a dron dostawczy dalej krąży nad dachem.',
  },
};

export const LOOT_LABEL: Record<LootKey, string> = {
  wood: 'Drewno',
  supplies: 'Jedzenie',
  scrap: 'Złom',
  parts: 'Części',
  meds: 'Leki',
};

// ---------------------------------------------------------------- wydarzenia

export type Pora = 'dzien' | 'wieczor' | 'noc';

/** wydarzenia przychodzą co minutę, więc to samo nie może wracać co godzinę gry jak w 0.3 co dzień */
export const REPEAT_GAP = 16;

/** pora z godziny: dzień 8–19, wieczór 19–22, noc 22–6 (6–8 bez wydarzeń: poranek i raport) */
export function poraOf(hour: number): Pora | null {
  if (hour >= 8 && hour < 19) return 'dzien';
  if (hour >= 19 && hour < 22) return 'wieczor';
  if (hour >= 22 || hour < 6) return 'noc';
  return null;
}

/** EventHost z 0.3 rozszerzony o to, czego potrzebują wydarzenia przy siatce */
export interface GovHost extends EventHost {
  hour(): number;
  /** dziury w siatce i nazwa najsłabszego miejsca */
  holes(): number;
  weakName(): string;
  patchHole(): void;
  /** premia do obrony na najbliższą noc */
  guardBonus(v: number): void;
  moodAll(why: string, d: number, hours: number): void;
  needsAll(d: Partial<GovNeeds>): void;
  needsOf(id: string, d: Partial<GovNeeds>): void;
  /** najbardziej wypoczęta osoba, która nie śpi i nie jest na wyprawie */
  rested(): GovPerson | null;
  flag(k: 'dog' | 'flashlight' | 'torch'): boolean;
  setFlag(k: 'dog' | 'flashlight' | 'torch'): void;
  gateClosed(): boolean;
  /** czy ktoś trzyma dziś wartę */
  guarded(): boolean;
  /** skutek na rano: zmiana zapasów i linia do raportu */
  later(stock: Partial<Record<LootKey, number>>, line: string): void;
}

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzenia mają różne kształty
export interface GEventDef<D = any> {
  id: string;
  once?: boolean;
  /** najmniej tyle godzin gry między powtórkami (domyślnie REPEAT_GAP) */
  gap?: number;
  when: readonly Pora[];
  w: (h: GovHost) => number;
  make: (h: GovHost) => D | null;
  title: (h: GovHost, d: D) => string;
  text: (h: GovHost, d: D) => string;
  choices: (h: GovHost, d: D) => EventChoice[];
}

/** wydarzenia z 0.3, które pasują do pierwszych nocy, z porą dnia; w zastępuje wagę z 0.3 */
export const OLD_EVENTS: { id: string; when: readonly Pora[]; w?: (h: GovHost) => number }[] = [
  { id: 'handlarz', when: ['dzien'] },
  { id: 'dzieci', when: ['dzien'] },
  { id: 'lodowka', when: ['dzien'] },
  { id: 'dron', when: ['dzien'] },
  { id: 'automat', when: ['dzien'] },
  { id: 'auto', when: ['dzien'] },
  { id: 'czynsz', when: ['dzien', 'wieczor'] },
  { id: 'krypto', when: ['dzien'] },
  { id: 'ksiazki', when: ['dzien'] },
  { id: 'aktywisci', when: ['dzien'] },
  { id: 'influencer', when: ['dzien'] },
  // obcy pod bramą dopiero od drugiego dnia
  { id: 'uchodzcy', when: ['dzien'], w: (h) => (h.day() >= 2 ? 0.8 : 0) },
  { id: 'fachowiec', when: ['wieczor'] },
  { id: 'klotnia', when: ['wieczor'] },
  { id: 'pozar', when: ['wieczor', 'noc'] },
  { id: 'kradziez', when: ['noc'] },
  { id: 'wesele', when: ['dzien', 'wieczor'] },
  { id: 'odejscie', when: ['dzien', 'wieczor'] },
  // w 0.3 od piątego dnia; w M1 pierwsza noc jest o szabrownikach, więc już po południu pierwszego
  { id: 'obserwacja', when: ['dzien'], w: (h) => (h.hour() >= 13 ? 1.2 : 0) },
];

const names = (list: GovPerson[]) =>
  list.length < 2
    ? list[0].name
    : `${list
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ')} i ${list[list.length - 1].name}`;

/** nowe wydarzenia M1: obcy jako wydarzenie, siatka, noc */
export const NEW_EVENTS: GEventDef[] = [
  {
    id: 'wedrowiec',
    gap: 30,
    when: ['wieczor', 'noc'],
    w: (h) => (h.gateClosed() ? 0.4 : 1),
    make: (h) => ({
      thief: h.rng() < 0.3,
      dest: pick(
        ['do brata pod Łódź', 'nad morze, bo tam podobno łowią ryby', 'do Kielc, do matki', 'na południe'],
        h.rng,
      ),
    }),
    title: () => 'Wędrowiec pod bramą',
    text: (h, d) =>
      `Pod bramą stoi chudy facet z plecakiem i psem na sznurku. Prosi, żeby mógł przenocować przy waszym ogniu. Mówi, że idzie ${d.dest}.${h.gateClosed() ? ' Brama jest zamknięta na kłódkę, klucz ma zarząd.' : ''}`,
    choices: (h, d) => [
      {
        label: 'Wpuścić na noc',
        ok: !h.gateClosed(),
        run: () => {
          if (d.thief) {
            h.mood(1, 0);
            h.later({ supplies: -2 }, 'Rano wędrowca nie było. Zniknęły z nim dwa słoiki z piwnicy.');
          } else {
            h.mood(1, 0);
            h.guardBonus(1.5);
            h.later({}, 'Wędrowiec przesiedział noc przy ogniu i pilnował razem z wami. Rano zostawił adres brata.');
          }
        },
      },
      {
        label: 'Podać jedzenie przez siatkę (Jedzenie 1)',
        ok: h.res.jedzenie >= 1,
        run: () => {
          h.addRes('jedzenie', -1);
          h.mood(1, 0);
        },
      },
      { label: 'Odprawić', ok: true, run: () => h.mood(-1, 0) },
    ],
  },
  {
    id: 'slady',
    gap: 20,
    when: ['dzien', 'wieczor'],
    w: (h) => (h.holes() > 0 && h.hour() >= 15 ? 1.4 : 0),
    make: (h) => ({ where: h.weakName() }),
    title: () => 'Ślady przy siatce',
    text: (_h, d) =>
      `Przy dziurze ${d.where} ktoś wydeptał ścieżkę. Na drucie wisi strzęp kurtki, której nikt z was nie nosi.`,
    choices: (h) => [
      {
        label: 'Załatać przed nocą (Złom 2)',
        ok: h.res.zlom >= 2,
        run: () => {
          h.pay({ zlom: 2 });
          h.patchHole();
          h.log('Dziura załatana deskami i drutem.');
        },
      },
      {
        label: 'Powiesić puszki z kamykami',
        ok: true,
        run: () => {
          h.guardBonus(1);
          h.log('Na siatce wiszą puszki z kamykami. Jak ktoś dotknie, będzie słychać.');
        },
      },
      { label: 'Udawać, że nic nie widać', ok: true, run: () => h.setRaidBoost() },
    ],
  },
  {
    id: 'pies',
    once: true,
    when: ['wieczor', 'noc'],
    w: () => 0.7,
    make: () => ({}),
    title: () => 'Pies przy siatce',
    text: () => 'Bury kundel szczeka przy siatce od godziny. Chudy, ale łapy ma jak niedźwiedź i nie odchodzi.',
    choices: (h) => [
      {
        label: 'Przygarnąć (Jedzenie 1)',
        ok: h.res.jedzenie >= 1,
        run: () => {
          h.addRes('jedzenie', -1);
          h.setFlag('dog');
          h.moodAll('Mamy psa', 4, 24);
          h.log('Pies dostał imię Abonament. Śpi przy bramie i warczy na obcych.', true);
        },
      },
      { label: 'Przegonić', ok: true, run: () => h.log('Pies poszedł szczekać pod inny płot.') },
    ],
  },
  {
    id: 'halas',
    gap: 4,
    when: ['noc'],
    w: (h) => (h.hour() >= 22 || h.hour() < 4 ? 1 : 0),
    make: (h) => ({ cat: h.rng() < 0.45 }),
    title: () => 'Hałas za garażami',
    text: (h) =>
      h.guarded()
        ? 'Coś łupnęło za garażami. Może kot, może ktoś. Wartownik patrzy w ciemność i nic nie widzi.'
        : 'Ktoś przy oknie usłyszał łomot za garażami. Może kot, może ktoś. Wszyscy inni śpią.',
    choices: (h, d) => [
      {
        label: 'Sprawdzić z latarką',
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (p) h.needsOf(p.id, { rest: -8 });
          if (d.cat) {
            h.needsAll({ safe: 5 });
            h.log('Tylko kot. Wszyscy wracają spać trochę spokojniejsi.');
          } else {
            h.guardBonus(1);
            h.needsAll({ safe: -3 });
            h.log(
              `${p ? p.name : 'Ktoś'} ${p ? g(p, 'zobaczył', 'zobaczyła') : 'zobaczył'}, jak ktoś ucieka w stronę ulicy. Wiedzą już, że nie śpicie.`,
            );
          }
        },
      },
      {
        label: 'Spać dalej',
        ok: true,
        run: () => {
          h.needsAll({ safe: -4 });
          if (!d.cat) h.setRaidBoost();
        },
      },
    ],
  },
  {
    id: 'krzyk',
    when: ['noc'],
    w: () => 0.9,
    make: (h) => ({ help: h.rng() < 0.5 }),
    title: () => 'Krzyk z bloku obok',
    text: () => 'Z bloku obok niesie się krzyk, potem cisza. Na trzecim piętrze ktoś świeci latarką i zaraz ją gasi.',
    choices: (h, d) => [
      {
        label: 'Wysłać kogoś sprawdzić',
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (!p) return;
          h.needsOf(p.id, { rest: -10 });
          if (d.help) {
            h.mood(2, 0);
            h.later(
              { supplies: 3 },
              'Rano przyszedł sąsiad z bloku obok z workiem ziemniaków. W nocy spadł ze schodów, a wasz człowiek odprowadził go do mieszkania.',
            );
          } else {
            h.needsAll({ safe: -3 });
            h.log(`${p.name} ${g(p, 'znalazł', 'znalazła')} tylko otwarte drzwi i rozsypane słoiki. Nikogo w środku.`);
          }
        },
      },
      {
        label: 'Zamknąć drzwi i nie wychodzić',
        ok: true,
        run: () => {
          h.needsAll({ safe: -2 });
          h.mood(-1, 0);
        },
      },
    ],
  },
  {
    id: 'bezsennosc',
    when: ['noc'],
    w: (h) => (h.alive().length ? 0.8 : 0),
    make: (h) => {
      const all = h.alive();
      return { p: all[Math.floor(h.rng() * all.length)].id };
    },
    title: () => 'Ktoś nie może spać',
    text: (h, d) => {
      const p = h.spec(d.p)!;
      return `${p.name} siedzi przy kozie i nie może zasnąć. Mówi, że ciągle słyszy kroki na klatce.`;
    },
    choices: (h, d) => {
      const p = h.spec(d.p)!;
      return [
        {
          label: `Posiedzieć ${g(p, 'z nim', 'z nią')} przy kozie`,
          ok: true,
          run: () => {
            const o = h.rested();
            if (o && o.id !== d.p) h.needsOf(o.id, { rest: -5 });
            h.needsOf(d.p, { safe: 10, rest: 5 });
          },
        },
        {
          label: 'Niech pilnuje, skoro nie śpi',
          ok: true,
          run: () => {
            h.guardBonus(1.5);
            h.needsOf(d.p, { rest: -10 });
            h.log(`${p.name} ${g(p, 'przesiedział', 'przesiedziała')} resztę nocy przy oknie od podwórka.`);
          },
        },
        { label: 'Kazać się położyć', ok: true, run: () => h.needsOf(d.p, { safe: -5 }) },
      ];
    },
  },
  {
    id: 'sygnal',
    once: true,
    when: ['noc'],
    w: () => 0.8,
    make: () => ({}),
    title: () => 'Światło w oknie naprzeciwko',
    text: () => 'W bloku naprzeciwko ktoś miga latarką: trzy krótkie, trzy długie, trzy krótkie.',
    choices: (h) => [
      {
        label: 'Odmigać latarką',
        ok: true,
        run: () => {
          h.mood(1, 0);
          h.later(
            {},
            'Rano pod bramą stał chłopak z bloku naprzeciwko. Mieszka z babcią i dwoma kocami. Dziękował, że ktoś w ogóle odpowiedział.',
          );
        },
      },
      {
        label: 'Zasłonić okna i nie świecić',
        ok: true,
        run: () => {
          h.needsAll({ safe: 2 });
          h.log('Okna zasłonięte kocami. Z zewnątrz siedziba wygląda na pustą.');
        },
      },
    ],
  },
  {
    id: 'kot',
    once: true,
    when: ['noc'],
    w: () => 0.8,
    make: () => ({}),
    title: () => 'Kot w piwnicy',
    text: () =>
      'Z piwnicy dobiega miauczenie. Rudy kot zaplątał się w starą siatkę na ziemniaki. Na obroży wydrapane: „Algorytm”.',
    choices: (h) => [
      {
        label: 'Uwolnić i przygarnąć',
        ok: true,
        run: () => {
          h.moodAll('Algorytm się znalazł', 3, 24);
          h.log('Kot z ogłoszenia się znalazł. Śpi na kozie i nie reaguje na nic poza kaszą.');
        },
      },
      {
        label: 'Niech łapie myszy w piwnicy',
        ok: true,
        run: () =>
          h.later(
            { supplies: 1 },
            'Kot przez noc wyłapał myszy w piwnicy. Zapasy całe, jeden słoik nawet się znalazł.',
          ),
      },
    ],
  },
  {
    id: 'ulewa',
    gap: 24,
    when: ['noc'],
    w: (h) => (h.res.opal >= 3 ? 0.8 : 0),
    make: () => ({}),
    title: () => 'Ulewa',
    text: () => 'Leje od północy. Przez dziurę w daszku nad wejściem kapie prosto na drewno przy składzie.',
    choices: (h) => [
      {
        label: 'Przenieść drewno do kuchni',
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (p) h.needsOf(p.id, { rest: -8 });
          h.log('Drewno przeniesione pod dach. Kto nosił, ten jest mokry do pasa.');
        },
      },
      {
        label: 'Zostawić, jakoś to będzie',
        ok: true,
        run: () => h.later({ wood: -2 }, 'Część drewna zamokła i nie chce się palić.'),
      },
    ],
  },
  {
    id: 'przymrozek',
    gap: 24,
    when: ['noc'],
    w: (h) => (h.season() <= 1 ? 0.7 : 0),
    make: () => ({}),
    title: () => 'Przymrozek',
    text: () =>
      'Na siatce szron. Sąsiadka z drugiego piętra puka do drzwi: u niej w mieszkaniu zamarzła woda w wiadrze, a mąż kaszle.',
    choices: (h) => [
      {
        label: 'Dać drewno (Drewno 2)',
        ok: h.res.opal >= 2,
        run: () => {
          h.addRes('opal', -2);
          h.mood(2, 0);
        },
      },
      {
        label: 'Zaprosić ich do kozy',
        ok: true,
        run: () => {
          h.mood(1, 0);
          h.needsAll({ safe: 3 });
          h.log('Przy kozie robi się ciasno, ale nikt nie narzeka.');
        },
      },
      { label: 'Nie otwierać', ok: true, run: () => h.mood(-1, 1) },
    ],
  },
  {
    id: 'latarka',
    once: true,
    when: ['dzien', 'wieczor'],
    w: () => 0.9,
    make: () => ({}),
    title: () => 'Latarka na korbkę',
    text: () =>
      'Pani Halina z trzeciego piętra przyniosła latarkę na korbkę. Minuta kręcenia daje pięć minut światła, a ona już nie ma siły kręcić.',
    choices: (h) => [
      {
        label: 'Dla warty',
        ok: true,
        run: () => {
          h.setFlag('flashlight');
          h.log('Latarka wisi przy bramie. Warta ze światłem płoszy lepiej.');
        },
      },
      {
        label: 'Na wyprawy',
        ok: true,
        run: () => {
          h.setFlag('torch');
          h.log('Latarka idzie na wyprawy. Mniej potykania się po ciemnych klatkach.');
        },
      },
    ],
  },
  {
    id: 'domofon',
    once: true,
    when: ['dzien'],
    w: () => 0.8,
    make: () => ({}),
    title: () => 'Domofon przy bramie ożył',
    text: () =>
      'Domofon przy bramie zapiszczał pierwszy raz od lat. Na ekraniku: „Twoja subskrypcja Bezpieczne Osiedle wygasła. Odnów za 49,99 kredytów miesięcznie”.',
    choices: (h) => [
      {
        label: 'Rozkręcić na części',
        ok: true,
        run: () => {
          h.addRes('czesci', 1);
          h.log('W środku płytka w żywicy, cała, i kable bez izolacji. Bakteria zjadła wszystko, co gołe.');
        },
      },
      {
        label: 'Zostawić, niech piszczy',
        ok: true,
        run: () => {
          h.mood(1, -1);
          h.log('Ludzie przychodzą posłuchać, jak domofon prosi o pieniądze. Śmieją się pierwszy raz od dawna.');
        },
      },
    ],
  },
  {
    id: 'sasiadka',
    once: true,
    when: ['wieczor'],
    w: () => 1,
    make: () => ({}),
    title: () => 'Słoik od sąsiadki',
    text: () =>
      'Pani Krysia z czwartego piętra przyniosła słoik powideł z 2049 roku. Pyta, czy może posiedzieć przy kozie, bo u niej w mieszkaniu jest sześć stopni.',
    choices: (h) => [
      {
        label: 'Zaprosić do kozy',
        ok: true,
        run: () => {
          h.addRes('jedzenie', 2);
          h.mood(2, 0);
          h.log('Pani Krysia opowiada, jak wyglądało osiedle, kiedy jeszcze jeździły autobusy.');
        },
      },
      {
        label: 'Wziąć słoik i podziękować',
        ok: true,
        run: () => {
          h.addRes('jedzenie', 2);
          h.mood(-1, 1);
          h.log('Pani Krysia wróciła do zimnego mieszkania. Na klatce już o tym wiedzą.');
        },
      },
    ],
  },
];

export { names as peopleNames };
