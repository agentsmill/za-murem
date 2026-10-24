/* Wiki w grze, kategoria „Praca”: dziewięć rodzajów pracy zarządu (`RODZAJE` z src/sim/praca.ts, po jednym artykule pod
   identyfikatorem `praca:<klucz rodzaju>`) i artykuły o panelu Pracy: priorytety, stałe zajęcie, progi zapasów, przełącznik
   „za siatkę”, praca bez poleceń od pierwszego ranka i polecenia z menu. Fakty rodzajów liczą się z tabel i z samych funkcji
   gry, bez kopiowania liczb: domyślny priorytet z `domyslnyPriorytet`, to, czy umiejętność przyspiesza pracę, z `tempoPracy`,
   progi z `PROGI_DOMYSLNE`, koszty napraw z `REPAIR`, start od pierwszego ranka z `NOWE`. Jedyna ręcznie wpisana tabela to
   „którą umiejętność czyta który rodzaj” (`UMIEJETNOSCI`), a test sprawdza ją na funkcjach z `WPISY`. */

import { DOM_EN } from '../content/data.en.ts';
import type { Dom, TechDom } from '../content/data.ts';
import { DOM } from '../content/data.ts';
import type { Person } from '../content/people.ts';
import { L } from '../core/jezyk.ts';
import type { Mat } from '../sim/budowle.ts';
import { TICKS_PER_DAY } from '../sim/clock.ts';
import { MAT_EN } from '../sim/mieszkania.en.ts';
import { REPAIR } from '../sim/mieszkania.ts';
import {
  DZIDY_ZOMBIE,
  domyslnyPriorytet,
  NOWE,
  PROG_MAX,
  PROGI_DOMYSLNE,
  RODZAJE,
  type RodzajPracy,
  TEMPO_KROK,
  tempoPracy,
  ZAPAS_OPALU,
  zaSiatkeDomyslnie,
} from '../sim/praca.ts';
import type { Pawn, SimState } from '../sim/sim.ts';
import { PATCH_COST } from '../sim/sim.ts';
import { CARRY_MATS } from '../sim/surowce.ts';
import { MAT_NAME } from './budowa.ts';
import { DAMAGE_EN } from './mieszkania.en.ts';
import { DAMAGE_NAME } from './mieszkania.ts';
import { KROK_PROGU, nazwaRodzaju, opisRodzaju } from './praca.ts';
import { kliknijcie, listaI, polecenie, proc } from './wiki-slowa.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

const en = (): boolean => L('', 'e') === 'e';

/** nazwa rodzaju pracy w bieżącym języku */
export const rodzajNazwa = (r: RodzajPracy): string => nazwaRodzaju(r, en());

const domNazwa = (d: Dom): string => L(DOM[d], DOM_EN[d]);

/** Które umiejętności czyta rodzaj pracy (od nich zależy domyślny priorytet, a przy rodzajach z przyspieszeniem tempo).
    `'badanie'`: dziedzina bieżącego badania. Test sprawdza tę tabelę na `WPISY[…].umiejetnosc`. */
export const UMIEJETNOSCI: Record<RodzajPracy, readonly TechDom[] | 'badanie'> = {
  ogien: ['cieplo'],
  kuchnia: ['uprawa'],
  budowa: ['bud'],
  naprawy: ['bud'],
  drwal: ['cieplo'],
  noszenie: [],
  warsztat: ['elek', 'it'],
  szaber: [],
  badania: 'badanie',
};

/** stan do pytań o domyślny priorytet i tempo: pracownia stoi (rodzaj Badania jest widoczny), dzień 6, samouczek skończony */
function probeStan(dom?: TechDom): SimState {
  return {
    tick: 5 * TICKS_PER_DAY,
    tut: { step: -1, at: [] },
    things: [],
    people: [],
    research: { cur: dom ? PROBE_TECH[dom] : null, prog: {}, at: {} },
  } as unknown as SimState;
}

/** technologie, których dziedzina to dana umiejętność (do sondowania rodzaju Badania) */
const PROBE_TECH: Record<TechDom, string> = {
  bud: 't_okna',
  cieplo: 't_kozy',
  elek: 't_panele',
  med: 't_zielarstwo',
  uprawa: 't_konserwy',
  it: 't_mesh',
};

const osoba = (skills: Partial<Record<Dom, number>>): Person =>
  ({ id: 'x', first: 'X', name: 'X', f: false, prof: '', skills, age: 30, traits: [] }) as unknown as Person;

/** domyślny priorytet rodzaju dla osoby z umiejętnością `poziom` w jego dziedzinie (z `domyslnyPriorytet`) */
function domyslny(r: RodzajPracy, poziom: number): number {
  const u = UMIEJETNOSCI[r];
  const dom: TechDom = u === 'badanie' ? 'cieplo' : (u[0] ?? 'bud');
  return domyslnyPriorytet(probeStan(u === 'badanie' ? dom : undefined), osoba({ [dom]: poziom }), r);
}

/** czy umiejętność przyspiesza pracę tego rodzaju (z `tempoPracy`: pierwsza noc to poziom 4, dzień 6) */
function przyspiesza(r: RodzajPracy): boolean {
  const u = UMIEJETNOSCI[r];
  const dom: TechDom = u === 'badanie' ? 'cieplo' : (u[0] ?? 'bud');
  const st = probeStan(u === 'badanie' ? dom : undefined);
  st.people = [osoba({ [dom]: 4, ...(u !== 'badanie' && u[1] ? { [u[1]]: 4 } : {}) })];
  return tempoPracy(st, { person: 0 } as Pawn, r) > 1;
}

/** „3” albo „bez umiejętności 3, poziom 1–2: 2, poziom 3–4: 1” */
function domyslnyOpis(r: RodzajPracy): string {
  const [p0, p1, p3] = [domyslny(r, 0), domyslny(r, 1), domyslny(r, 3)];
  if (p0 === p1 && p1 === p3) return `${p0}`;
  return L(
    `bez umiejętności ${p0}, poziom 1–2: ${p1}, poziom 3–4: ${p3}`,
    `no skill ${p0}, level 1–2: ${p1}, level 3–4: ${p3}`,
  );
}

const umiejetnoscOpis = (r: RodzajPracy): string => {
  const u = UMIEJETNOSCI[r];
  if (u === 'badanie') return L('dziedzina bieżącego badania', 'the field of the current research');
  if (!u.length) return L('żadna', 'none');
  return u.map(domNazwa).join(L(' albo ', ' or '));
};

const matNazwa = (m: Mat): string => L(MAT_NAME[m], MAT_EN[m]);

function faktyRodzaju(r: RodzajPracy): Fakt[] {
  const przysp = przyspiesza(r);
  return [
    fakt(
      'kolumna',
      L('Kolumna w panelu Pracy', 'Column in the Work panel'),
      `${RODZAJE.indexOf(r) + 1} / ${RODZAJE.length}`,
    ),
    fakt('umiejetnosc', L('Umiejętność', 'Skill'), umiejetnoscOpis(r)),
    fakt('priorytet', L('Domyślny priorytet', 'Default priority'), domyslnyOpis(r)),
    fakt(
      'przyspieszenie',
      L('Umiejętność przyspiesza pracę', 'Skill speeds the work up'),
      przysp ? L(`tak, o ${proc(TEMPO_KROK)} na poziom`, `yes, by ${proc(TEMPO_KROK)} per level`) : L('nie', 'no'),
    ),
    fakt(
      'start',
      L('Zarząd bierze się za to sam', 'The board starts doing it on its own'),
      NOWE.has(r)
        ? L('od pierwszego ranka', 'from the first morning')
        : L('od początku gry', 'from the start of the game'),
    ),
  ];
}

/** Krótki opis z tabeli panelu (`opisRodzaju`) jest pierwszym zdaniem artykułu; reszta to zdania o zachowaniu rodzaju. */
type Opis = (c: WikiCtx) => { zdania: string[]; fakty?: Fakt[]; jak?: string[]; zobacz?: string[] };

const OPISY: Record<RodzajPracy, Opis> = {
  ogien: (c) => ({
    zdania: [
      L(
        'Ogień dokłada do kozy ze składu i znosi leżące drewno do składu przy kozie.',
        'Fire feeds the stove from the woodpile and carries loose wood to the woodpile by the stove.',
      ),
      L(
        'Razem z kuchnią to jedyna praca, którą zarząd robi też w nocy, i u każdego stoi domyślnie na pierwszym miejscu.',
        'Together with the kitchen it is the only job the people also do at night, and for everyone it is first by default.',
      ),
      L(
        'Kto ma Ogień wyłączony (puste pole) i nie ma go jako stałego zajęcia, sam do kozy nie dołoży, a panel ostrzega, gdy nikt w zarządzie go nie ma.',
        'Anyone with Fire switched off (a blank cell) and not as a fixed job will not feed the stove on their own, and the panel warns when nobody on the board has it.',
      ),
    ],
    zobacz: ['zasob:koza', 'zasob:drewno', 'noc:koza'],
    jak: [polecenie(c, ['kozie', 'the stove'], ['Dołożyć do kozy', 'Feed the stove'])],
  }),
  kuchnia: (c) => ({
    zdania: [
      L(
        'Kuchnia gotuje porcje, kiedy ktoś z zarządu zaraz zgłodnieje, a są zapasy i ogień albo gaz.',
        'The kitchen cooks portions when someone on the board is about to get hungry and there are supplies and fire or gas.',
      ),
      L(
        `Z kuchnią społeczną albo uchwałą „Wspólny kocioł” gotuje się raz dziennie, godzinę przed obiadem, dla wszystkich.`,
        'With the community kitchen or the “The common pot” resolution, cooking is done once a day, an hour before lunch, for everybody.',
      ),
      L('Ta praca idzie także w nocy.', 'This job also runs at night.'),
    ],
    jak: [polecenie(c, ['kuchence albo zapasach', 'the cooker or the supplies'], ['Gotować', 'Cook'])],
    zobacz: ['zasob:jedzenie', 'budowla:kuchnia_spoleczna', 'uchwala:u_kociol', 'potrzeba:food'],
  }),
  budowa: (c) => ({
    zdania: [
      L(
        'Budowa bierze najstarszy plan budowli, który da się zacząć, i przynosi do niego materiały.',
        'Build takes the oldest building plan that can be started and brings the materials to it.',
      ),
      L('Pracuje tylko za dnia.', 'It works only by day.'),
      L(
        'Od pierwszego ranka dokańcza też porzucony plan wspólnego płotu.',
        'From the first morning it also finishes an abandoned shared-fence plan.',
      ),
    ],
    jak: [
      L(
        `Plan stawia się w panelu Budowa${c.touch ? '' : ' (klawisz B)'}; wolna osoba z priorytetem Budowy sama przyniesie materiały.`,
        `Place a plan in the Build panel${c.touch ? '' : ' (B key)'}; a free person with Build priority fetches the materials on their own.`,
      ),
    ],
    zobacz: ['budowle:jak', 'zasob:odzysk'],
  }),
  naprawy: (c) => ({
    zdania: [
      L(
        'Naprawy łatają otwarte dziury w siatce, a potem naprawiają uszkodzenia w pomieszczeniach waszej siedziby.',
        'Repair patches the open holes in the fence and then fixes the damage in the rooms of your HQ.',
      ),
      L(
        'Ruszają, gdy starczy materiału: łata to deski albo złom, a naprawy kosztują deski, złom albo części.',
        'They start once there is enough material: a patch takes planks or scrap, and repairs take planks, scrap or parts.',
      ),
      L(
        `Z warsztatem i umiejętnością Budowa idą szybciej. ${c.words.Zarzad} robi to dopiero od pierwszego ranka.`,
        `They go faster with a workshop and the Building skill. ${c.e.Zarzad} does this only from the first morning.`,
      ),
    ],
    fakty: [
      fakt(
        'lata',
        L('Łata na dziurę', 'Patch for a hole'),
        L(`${PATCH_COST} szt. desek albo złomu`, `${PATCH_COST} planks or scrap`),
      ),
      ...(Object.keys(REPAIR) as (keyof typeof REPAIR)[]).map((k) =>
        fakt(
          `naprawa-${k}`,
          L(DAMAGE_NAME[k], DAMAGE_EN[k]),
          (Object.entries(REPAIR[k].cost) as [Mat, number][]).map(([m, n]) => `${matNazwa(m)} ${n}`).join(', '),
        ),
      ),
    ],
    jak: [polecenie(c, ['dziurze w siatce', 'a hole in the fence'], ['Załatać dziurę', 'Patch the hole'])],
    zobacz: ['zasob:deski', 'zasob:zlom', 'zasob:czesci', 'budowla:warsztat'],
  }),
  drwal: (c) => ({
    zdania: [
      L(
        'Drwal ścina najbliższe wolne drzewo, póki drewna w zapasie jest mniej niż próg z panelu Pracy.',
        'Woodcutting fells the nearest free tree while there is less wood in stock than the level set in the Work panel.',
      ),
      L(
        'Drzewa za siatką ścina tylko ten, kto ma włączony przełącznik wyjścia, a w trybie zombie stoją tam szwendacze.',
        'Only someone with the go-outside switch on fells trees beyond the fence, and in Zombie mode shamblers stand there.',
      ),
      L('Umiejętność Ciepło przyspiesza ścinanie.', 'The Heating skill speeds up chopping.'),
    ],
    fakty: [fakt('prog', L('Próg drewna', 'Wood level'), `${PROGI_DOMYSLNE.drewno}`)],
    jak: [polecenie(c, ['drzewie', 'a tree'], ['Ściąć drzewo', 'Chop down the tree'])],
    zobacz: ['zasob:drewno', 'praca:zapas', 'praca:zasiatke'],
  }),
  noszenie: () => ({
    zdania: [
      L(
        'Noszenie przenosi na podwórko łup, który leży poza siatką: deski, złom, części, leki i jedzenie.',
        'Hauling carries into the yard the loot that lies outside the fence: planks, scrap, parts, meds and food.',
      ),
      L(
        'Poza własnym terenem robi to tylko ten, kto ma włączony przełącznik wyjścia za siatkę, i tylko za dnia.',
        'Beyond your own ground only someone with the go-outside switch on does it, and only by day.',
      ),
    ],
    fakty: [
      fakt('materialy', L('Co nosi', 'What it carries'), [...CARRY_MATS].map((m) => matNazwa(m as Mat)).join(', ')),
    ],
    zobacz: ['zasob:wraki', 'zasob:odzysk', 'praca:zasiatke'],
  }),
  warsztat: () => ({
    zdania: [
      L(
        'Warsztat robi deski z drewna, części ze złomu i dzidy z desek i złomu, do progów zapasu z panelu Pracy.',
        'Workshop saws planks from wood, makes parts from scrap and spears from planks and scrap, up to the stock levels in the Work panel.',
      ),
      L(
        'Praca idzie tylko wtedy, gdy stoi budowla „Warsztat”, i nie rusza zapasu opału ani materiału na łaty i plany.',
        'It works only once the “Workshop” building stands, and it leaves the fuel reserve and the material for patches and plans alone.',
      ),
      L(
        'Przyspiesza ją umiejętność Elektryka albo Informatyka, a po badaniu spawania części powstają szybciej.',
        'The Electrics or IT skill speeds it up, and after the welding research parts come faster.',
      ),
    ],
    fakty: [
      fakt(
        'progi',
        L('Progi domyślne', 'Default levels'),
        L(
          `deski ${PROGI_DOMYSLNE.deski}, części ${PROGI_DOMYSLNE.czesci}, dzidy ${PROGI_DOMYSLNE.dzidy}`,
          `planks ${PROGI_DOMYSLNE.deski}, parts ${PROGI_DOMYSLNE.czesci}, spears ${PROGI_DOMYSLNE.dzidy}`,
        ),
      ),
      fakt(
        'rezerwa',
        L('Rezerwa opału', 'Fuel reserve'),
        L(`${ZAPAS_OPALU} szt. drewna`, `${ZAPAS_OPALU} pieces of wood`),
      ),
    ],
    jak: [
      L(
        'Postawcie warsztat; potem wystarczy ustawić progi w panelu Pracy w sekcji „Trzymać w zapasie”.',
        'Build a workshop; then just set the levels in the Work panel under “Keep in stock”.',
      ),
    ],
    zobacz: ['budowla:warsztat', 'praca:zapas', 'zasob:deski', 'zasob:czesci'],
  }),
  szaber: (c) => ({
    zdania: [
      L(
        'Szaber przeszukuje nieprzeszukane pomieszczenia siedziby, otwarte budynki sąsiadów i wraki.',
        'Scavenging searches the HQ rooms nobody has searched yet, the open buildings next door and the wrecks.',
      ),
      L(
        'Łup zostaje w stertach, a nosi go praca „Noszenie”.',
        'The loot stays in heaps, and the “Hauling” job carries it.',
      ),
      L(
        `Poza własnym terenem szabruje tylko ten, kto ma włączony przełącznik wyjścia za siatkę, i tylko za dnia; w trybie zombie przełącznik jest domyślnie wyłączony.`,
        'Beyond your own ground only someone with the go-outside switch on scavenges, and only by day; in Zombie mode the switch is off by default.',
      ),
    ],
    jak: [L(c.words.szukanie.jak[c.touch ? 'dotyk' : 'mysz'], c.e.szukanie.jak[c.touch ? 'dotyk' : 'mysz'])],
    zobacz: ['zasob:wraki', 'zasob:odzysk', 'praca:noszenie', 'praca:zasiatke', 'badania:ksiazki'],
  }),
  badania: (c) => ({
    zdania: [
      L(
        'Badania sadzają osobę przy stole pracowni, kiedy wybrane badanie idzie i jest wolne miejsce.',
        'Research seats a person at the research room desk when the chosen research is under way and a seat is free.',
      ),
      L(
        'Kolumna pojawia się dopiero wtedy, gdy stoi pracownia albo istnieje stan badań.',
        'The column appears only once the research room stands or research has been started.',
      ),
      L(
        'Bez umiejętności w dziedzinie badania domyślny priorytet to puste pole, żeby nie zajmować obu miejsc przy stole bez potrzeby.',
        'Without a skill in the research field the default priority is blank, so nobody takes both seats at the desk for no reason.',
      ),
    ],
    jak: [polecenie(c, ['pracowni', 'the research room'], ['Badać: …', 'Research: …'])],
    zobacz: ['badania:jak', 'budowla:pracownia', 'badania:wiedza'],
  }),
};

function rodzaj(r: RodzajPracy): Def {
  return def(
    `praca:${r}`,
    'praca',
    () => rodzajNazwa(r),
    (c): Tresc => {
      const o = OPISY[r](c);
      return {
        zdania: o.zdania,
        fakty: [
          fakt('opis', L('Tak mówi panel Pracy', 'What the Work panel says'), opisRodzaju(r, en())),
          ...faktyRodzaju(r),
          ...(o.fakty ?? []),
        ],
        jak: o.jak ?? [],
        zobacz: [...(o.zobacz ?? []), 'praca:panel', 'praca:priorytety'],
      };
    },
  );
}

/** polecenie z menu: etykieta po polsku i angielsku, co robi po polsku i angielsku */
interface Polecenie {
  pl: string;
  en: string;
  coPl: string;
  coEn: string;
}

/** Polecenia z menu pod prawym przyciskiem (przytrzymaniem palca): napisy jak w src/sim/orders.ts, src/sim/surowce.ts
    i src/sim/wedrowcy.ts; test sprawdza, że każdy napis występuje w kodzie menu. Brama i mieszkania według słownika miejsca. */
export const POLECENIA = (c: WikiCtx): Polecenie[] => [
  { pl: 'Idź tu', en: 'Go here', coPl: 'osoba idzie na miejsce i tam czeka', coEn: 'the person walks there and waits' },
  {
    pl: 'Ściąć drzewo',
    en: 'Chop down the tree',
    coPl: 'ścina drzewo i niesie drewno do składu',
    coEn: 'fells the tree and carries the wood to the woodpile',
  },
  {
    pl: 'Zanieść do składu',
    en: 'Carry to the woodpile',
    coPl: 'przenosi leżące drewno do składu przy kozie',
    coEn: 'moves loose wood to the woodpile by the stove',
  },
  { pl: 'Dołożyć do kozy', en: 'Feed the stove', coPl: 'dokłada drewno do kozy', coEn: 'puts wood into the stove' },
  {
    pl: 'Czuwać przy kozie',
    en: 'Keep watch by the stove',
    coPl: 'dyżur przy kozie do rana',
    coEn: 'a stove watch till morning',
  },
  { pl: 'Gotować', en: 'Cook', coPl: 'gotuje porcje z zapasów', coEn: 'cooks portions from the supplies' },
  {
    pl: 'Spalić …',
    en: 'Burn the …',
    coPl: 'pali mebel na opał (z potwierdzeniem)',
    coEn: 'burns a piece of furniture for fuel (with a confirmation)',
  },
  {
    pl: 'Przeszukać …',
    en: 'Search the …',
    coPl: 'przeszukuje pomieszczenie albo wrak',
    coEn: 'searches a room or a wreck',
  },
  {
    pl: 'Rozebrać …',
    en: 'Take apart the …',
    coPl: 'rozbiera rzecz na materiały',
    coEn: 'takes a thing apart for materials',
  },
  {
    pl: 'Naprawić …',
    en: 'Fix the …',
    coPl: 'naprawia uszkodzenie, gdy starczy materiałów',
    coEn: 'fixes the damage once there is enough material',
  },
  ...(c.dom
    ? []
    : [
        {
          pl: 'Zająć mieszkanie',
          en: 'Claim the flat',
          coPl: 'zajmuje puste mieszkanie, w którym wolno już budować',
          coEn: 'claims an empty flat, where you may then build',
        },
      ]),
  {
    pl: 'Załatać dziurę',
    en: 'Patch the hole',
    coPl: 'łata dziurę w siatce deskami albo złomem',
    coEn: 'patches a hole in the fence with planks or scrap',
  },
  {
    pl: 'Wzmocnić siatkę',
    en: 'Shore up the fence',
    coPl: 'wzmacnia uszkodzony kafelek siatki',
    coEn: 'shores up a damaged tile of the fence',
  },
  {
    pl: 'Zrobić dzidę',
    en: 'Make a spear',
    coPl: 'robi dzidę z desek i złomu na stercie',
    coEn: 'makes a spear from planks and scrap on a heap',
  },
  {
    pl: 'Piłować deskę z drewna',
    en: 'Saw wood into a plank',
    coPl: 'w warsztacie: deska z drewna',
    coEn: 'at the workshop: a plank from wood',
  },
  {
    pl: 'Zrobić część ze złomu',
    en: 'Make a part from scrap',
    coPl: 'w warsztacie: część ze złomu',
    coEn: 'at the workshop: a part from scrap',
  },
  {
    pl: 'Zanieść na podwórko',
    en: 'Carry into the yard',
    coPl: 'przenosi łup zza siatki na podwórko',
    coEn: 'brings loot from beyond the fence into the yard',
  },
  {
    pl: 'Rozpalić ognisko tutaj',
    en: 'Light a campfire here',
    coPl: 'rozpala ognisko na podwórku',
    coEn: 'lights a campfire in the yard',
  },
  {
    pl: 'Pilnować tutaj',
    en: 'Keep watch here',
    coPl: 'warta przy dziurze w siatce',
    coEn: 'a watch at a hole in the fence',
  },
  {
    pl: `Pilnować ${c.words.brama.d}`,
    en: `Keep watch at ${c.e.brama}`,
    coPl: `warta ${c.words.brama.przy}`,
    coEn: `a watch at ${c.e.brama}`,
  },
  {
    pl: `Otworzyć ${c.words.brama.b}`,
    en: `Open ${c.e.brama}`,
    coPl: 'otwiera wejście na podwórko; „Zamknąć” je zamyka',
    coEn: 'opens the way into the yard; “Close” shuts it',
  },
  {
    pl: 'Badać: …',
    en: 'Research: …',
    coPl: 'przy pracowni: siada do wybranego badania',
    coEn: 'at the research room: sits down to the chosen research',
  },
  {
    pl: 'Tablica badań',
    en: 'Research board',
    coPl: 'przy pracowni: otwiera tablicę badań',
    coEn: 'at the research room: opens the Research board',
  },
];

export function definicjePraca(): Def[] {
  return [
    def(
      'praca:panel',
      'praca',
      () => L('Panel Pracy', 'The Work panel'),
      (c) => ({
        zdania: [
          L(
            'Panel Pracy to tabela: wiersz to osoba z zarządu, kolumna to rodzaj pracy, a cyfra w komórce mówi, jak chętnie osoba sama się tym zajmie.',
            'The Work panel is a table: a row is a person on the board, a column is a kind of work, and the digit in a cell says how readily the person does it on their own.',
          ),
          L(
            '1 znaczy najpierw, 4 na końcu, a puste pole: nie robi tego wcale.',
            '1 means first, 4 means last, and a blank cell means they will not do it at all.',
          ),
          L(
            'Pod tabelą są progi zapasów i przy każdej osobie przełącznik wyjścia za siatkę; stałe zajęcie osoby ustawia się na jej karcie.',
            'Under the table are the stock levels and, for each person, the go-outside-the-fence switch; a person’s fixed job is set on their card.',
          ),
          L(
            'Wszystko to dotyczy pracy bez poleceń: rozkaz z menu zawsze wygrywa z tabelą.',
            'All of this is about work without orders: an order from the menu always beats the table.',
          ),
        ],
        fakty: [
          fakt('kolumny', L('Kolumny', 'Columns'), RODZAJE.map(rodzajNazwa).join(', ')),
          fakt(
            'priorytety',
            L('Priorytety', 'Priorities'),
            L('0 (pusto) = nie robi, 1 = najpierw, 4 = na końcu', '0 (blank) = never, 1 = first, 4 = last'),
          ),
          fakt('krok', L('Plus i minus przy progu', 'The plus and minus step'), `${KROK_PROGU}`),
        ],
        jak: [
          c.touch
            ? L(
                'Przycisk Praca u góry otwiera panel. Stuknij komórkę, żeby zmienić priorytet, przytrzymaj, żeby cofnąć.',
                'The Work button at the top opens the panel. Tap a cell to change the priority, press and hold to go back.',
              )
            : L(
                'Przycisk Praca u góry albo klawisz P otwiera panel. Klik w komórkę zmienia priorytet, prawy przycisk w drugą stronę.',
                'The Work button at the top, or the P key, opens the panel. Click a cell to change the priority, right-click to go back.',
              ),
          ...(c.touch
            ? []
            : [
                L(
                  'Z klawiatury: Tab i strzałki wybierają komórkę, cyfry 0–4 ustawiają jej priorytet.',
                  'From the keyboard: Tab and the arrows pick a cell, the digits 0–4 set its priority.',
                ),
              ]),
        ],
        zobacz: [
          'praca:priorytety',
          'praca:stale',
          'praca:zapas',
          'praca:zasiatke',
          'praca:automat',
          'praca:polecenia',
        ],
      }),
      'tabela priorytety kolumny work panel',
    ),

    def(
      'praca:priorytety',
      'praca',
      () => L('Priorytety', 'Priorities'),
      () => ({
        zdania: [
          L(
            'Bez poleceń osoba szuka zajęcia po kolei: najpierw stałe zajęcie, potem rodzaje z cyfrą 1, 2, 3 i 4, a w każdej cyfrze według kolejności kolumn.',
            'With no orders a person looks for something to do in turn: first the fixed job, then the kinds marked 1, 2, 3 and 4, and within each digit in column order.',
          ),
          L(
            'Domyślny priorytet bierze się z umiejętności: poziom 3–4 daje 1, poziom 1–2 daje 2, brak daje 3.',
            'The default priority comes from skill: level 3–4 gives 1, level 1–2 gives 2, and no skill gives 3.',
          ),
          L(
            'Wyjątki: Ogień ma 1 u każdego, Noszenie i Szaber mają 3, a Badania bez umiejętności w dziedzinie badania mają puste pole.',
            'Exceptions: Fire is 1 for everyone, Hauling and Scavenging are 3, and Research without a skill in the research field is blank.',
          ),
          L(
            'Ciepło poniżej progu idzie przed nowymi rodzajami z cyfrą 3 i 4: nikt nie wchodzi w noc wyziębiony.',
            'Being cold comes before the newer kinds marked 3 and 4: nobody goes into the night chilled.',
          ),
        ],
        fakty: RODZAJE.map((r) => fakt(`domyslny-${r}`, rodzajNazwa(r), domyslnyOpis(r))),
        zobacz: ['praca:panel', 'praca:stale', 'praca:automat', 'ludzie:umiejetnosci'],
      }),
      'priorytet cyfra domyślny kolejność',
    ),

    def(
      'praca:stale',
      'praca',
      () => L('Stałe zajęcie', 'Fixed job'),
      () => ({
        zdania: [
          L(
            'Stałe zajęcie to rodzaj pracy, który osoba bierze przed wszystkimi innymi, także wtedy, gdy w tabeli ma tam puste pole.',
            'A fixed job is a kind of work a person takes before anything else, even when the table has that cell blank.',
          ),
          L(
            'Przydaje się, żeby jedna osoba na stałe dokładała do kozy albo siedziała przy stole pracowni.',
            'It is handy for making one person feed the stove for good or sit at the research room desk.',
          ),
        ],
        jak: [
          L(
            'Na karcie osoby wybierzcie rodzaj z listy „Stałe zajęcie”; „brak” je zdejmuje.',
            'On the person card pick a kind from the “Fixed job” list; “none” removes it.',
          ),
        ],
        zobacz: ['praca:panel', 'praca:priorytety', 'ludzie:karta'],
      }),
      'stałe zajęcie fixed job',
    ),

    def(
      'praca:zapas',
      'praca',
      () => L('Trzymać w zapasie', 'Keep in stock'),
      () => ({
        zdania: [
          L(
            'Progi zapasów mówią, ile drewna, desek, części (a w trybie zombie dzid) zarząd ma sam trzymać na stanie.',
            'The stock levels say how much wood, planks, parts (and, in Zombie mode, spears) the people should keep in store on their own.',
          ),
          L(
            'Drwal tnie drzewa, póki drewna jest mniej niż próg, a Warsztat robi deski i części z nadwyżki do ich progów.',
            'Woodcutting fells trees while there is less wood than its level, and the workshop makes planks and parts from the surplus up to theirs.',
          ),
          L(
            'Zero wyłącza robienie danego zasobu. Warsztat nigdy nie zjada zapasu opału na deski.',
            'Zero switches off making that resource. The workshop never eats the fuel reserve for planks.',
          ),
        ],
        fakty: [
          fakt('drewno', L('Drewno', 'Wood'), `${PROGI_DOMYSLNE.drewno}`),
          fakt('deski', L('Deski', 'Planks'), `${PROGI_DOMYSLNE.deski}`),
          fakt('czesci', L('Części', 'Parts'), `${PROGI_DOMYSLNE.czesci}`),
          fakt(
            'dzidy',
            L('Dzidy', 'Spears'),
            L(
              `${PROGI_DOMYSLNE.dzidy} (w trybie zombie ${DZIDY_ZOMBIE})`,
              `${PROGI_DOMYSLNE.dzidy} (${DZIDY_ZOMBIE} in Zombie mode)`,
            ),
          ),
          fakt(
            'rezerwa',
            L('Rezerwa opału', 'Fuel reserve'),
            L(`${ZAPAS_OPALU} szt. drewna`, `${ZAPAS_OPALU} pieces of wood`),
          ),
          fakt('max', L('Największy próg', 'Highest level'), `${PROG_MAX}`),
        ],
        jak: [
          L(
            `W panelu Pracy plus i minus pod „Trzymać w zapasie” zmieniają próg o ${KROK_PROGU}.`,
            `In the Work panel the plus and minus buttons under “Keep in stock” change the level by ${KROK_PROGU}.`,
          ),
        ],
        zobacz: ['praca:drwal', 'praca:warsztat', 'zasob:drewno', 'zasob:deski', 'zasob:czesci'],
      }),
      'próg zapas keep in stock dzidy',
    ),

    def(
      'praca:zasiatke',
      'praca',
      () => L('Wychodzenie za siatkę', 'Going outside the fence'),
      (c) => {
        const zwykly = zaSiatkeDomyslnie({ mode: 'zwykly' } as unknown as SimState);
        const zombie = zaSiatkeDomyslnie({ mode: 'zombie' } as unknown as SimState);
        const wl = (b: boolean) => (b ? L('włączony', 'on') : L('wyłączony', 'off'));
        return {
          zdania: [
            L(
              'Przełącznik „Może wychodzić za siatkę” pozwala osobie podejmować pracę poza podwórkiem bez polecenia: ścinać drzewa, nosić łup i szabrować.',
              'The “Can go outside the fence” switch lets a person take jobs outside the yard without orders: felling trees, hauling loot and scavenging.',
            ),
            L(
              'Dotyczy tylko dnia i tylko miejsc bez wroga w pobliżu; nocą nikt bez polecenia nie wychodzi.',
              'It applies only by day and only to places with no enemy nearby; at night nobody goes out without orders.',
            ),
            L(
              `W trybie zwykłym jest domyślnie ${wl(zwykly)}, w trybie zombie ${wl(zombie)}, bo za siatką chodzą szwendacze.`,
              `In Normal mode it is ${wl(zwykly)} by default, in Zombie mode ${wl(zombie)}, because shamblers walk beyond the fence.`,
            ),
            L(
              'Polecenie z menu działa zawsze, także za siatką.',
              'An order from the menu always works, beyond the fence too.',
            ),
          ],
          fakty: [
            fakt('zwykly', L('Tryb zwykły', 'Normal mode'), wl(zwykly)),
            fakt('zombie', L('Tryb zombie', 'Zombie mode'), wl(zombie)),
          ],
          jak: [
            L(
              `Przełącznik jest na karcie osoby i w panelu Pracy przy jej imieniu: ${kliknijcie(c)} go, żeby zmienić.`,
              `The switch is on the person card and next to their name in the Work panel: ${kliknijcie(c)} it to change it.`,
            ),
          ],
          zobacz: ['praca:drwal', 'praca:noszenie', 'praca:szaber', 'praca:panel'],
        };
      },
      'za siatkę wychodzić przełącznik outside the fence',
    ),

    def(
      'praca:automat',
      'praca',
      () => L('Praca bez poleceń', 'Work without orders'),
      () => {
        const nowe = RODZAJE.filter((r) => NOWE.has(r));
        const odRazu = RODZAJE.filter((r) => !NOWE.has(r));
        return {
          zdania: [
            L(
              'Wolny człowiek z zarządu sam bierze zlecenia według tabeli pracy; polecenie z menu zawsze ma pierwszeństwo.',
              'A free person on the board picks up jobs by itself according to the work table; an order from the menu always comes first.',
            ),
            L(
              `${listaI(odRazu.map(rodzajNazwa))} działają od początku gry, a ${listaI(nowe.map(rodzajNazwa))} dopiero od pierwszego ranka.`,
              `${listaI(odRazu.map(rodzajNazwa))} work from the start of the game, but ${listaI(nowe.map(rodzajNazwa))} only from the first morning.`,
            ),
            L(
              'Nocą pracują tylko Ogień i Kuchnia, a pilne sprawy (zimno, głód, sen) wyprzedzają każdą pracę.',
              'At night only Fire and Kitchen run, and urgent needs (cold, hunger, sleep) come before any work.',
            ),
          ],
          fakty: [
            fakt(
              'start',
              L('Pierwszy ranek', 'First morning'),
              L(
                'dzień 2 o 6:00 po samouczku, a najpóźniej dzień 3 o 6:00',
                'day 2 at 6:00 after the tutorial, and day 3 at 6:00 at the latest',
              ),
            ),
            fakt('nowe', L('Od pierwszego ranka', 'From the first morning'), nowe.map(rodzajNazwa).join(', ')),
          ],
          zobacz: ['praca:panel', 'praca:priorytety', 'praca:zasiatke', 'praca:ogien', 'ludzie:zarzad'],
        };
      },
      'automat bez poleceń pierwszy ranek noc',
    ),

    def(
      'praca:polecenia',
      'praca',
      () => L('Polecenia z menu', 'Orders from the menu'),
      (c) => ({
        zdania: [
          L(
            `Polecenia wydaje się zaznaczonej osobie z ${c.words.zarzad.dk}: ${c.touch ? 'stuknięcie w miejsce daje najprostsze, a przytrzymanie palca pokazuje wszystkie' : 'prawy przycisk w danym miejscu pokazuje wszystkie, a lewy klik wykonuje najprostsze'}.`,
            `You give orders to a selected person from ${c.e.krotko}: ${c.touch ? 'tapping a spot gives the simplest one, and pressing and holding shows all of them' : 'right-click on a spot shows all of them, and a left click does the simplest one'}.`,
          ),
          L(
            'Menu pokazuje tylko to, co ma sens w danym miejscu i na co starczy materiałów.',
            'The menu shows only what makes sense at that spot and what the materials allow.',
          ),
          L(
            'Rozkaz przerwany walką wraca, ale najwyżej dwa razy; potem przepada z wpisem w kronice.',
            'An order interrupted by a fight comes back, but at most twice; after that it lapses with a note in the log.',
          ),
        ],
        fakty: POLECENIA(c).map((p, k) => fakt(`polecenie-${k}`, L(p.pl, p.en), L(p.coPl, p.coEn))),
        jak: [
          c.touch
            ? L(
                'Zaznacz osobę stuknięciem, potem przytrzymaj palec w miejscu, którego dotyczy polecenie.',
                'Select someone with a tap, then press and hold on the spot the order is for.',
              )
            : L(
                'Zaznacz osobę klikiem (Shift i ramka: kilka naraz), potem kliknij prawym przyciskiem miejsce.',
                'Select someone with a click (Shift-drag selects several), then right-click the spot.',
              ),
        ],
        zobacz: ['praca:panel', 'start:sterowanie', 'noc:warta', 'zasob:wraki'],
      }),
      'menu kontekstowe prawy przycisk polecenie rozkaz order',
    ),

    ...RODZAJE.map(rodzaj),
  ];
}
