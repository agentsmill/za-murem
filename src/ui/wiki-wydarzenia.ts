/* Wiki w grze, kategoria „Wydarzenia”: karty wydarzeń i ich tempo, gość pod bramą (rodzaje, prośby, haczyki, odpowiedzi na
   karcie, „Złapany na kradzieży”), handlarz i napaść na obcych, wędrowcy z ekipami i werbunek, ciągi dalsze kart oraz pamięć o
   znajomych twarzach. Liczby biorą się z tabel gry i z jej funkcji: tempo kart z src/gov/wydarzenia.ts (`FIRST_EVENT`, `EARLY`,
   `GAP_PO`, `nextGap`, cisza pierwszego dnia), gość z src/gov/goscie.ts (`KTO`, wagi `BAZA_KTO` i `BAZA_HACZYK`, `wagaGoscia`),
   wizyta z src/gov/wizyta.ts i src/sim/gosc.ts (czasy, kradzież, poranne wyjście), handlarz z src/sim/handlarz.ts (terminy,
   tabela ofert `BUYS_SCRAP` i `OTHER`, walka, zła sława), wędrowcy z src/sim/wedrowcy.ts (terminy, rozmowa, wieści,
   `szansaWerbunku`), cena napaści z src/gov/wiesci.ts (`CENA`), ciągi z src/gov/watki.ts (`LANCUCHY`) i znajomi z
   src/gov/znajomi.ts (`NASTAWIENIE`, warunki powrotu). Terminy losowane (pierwsza wizyta handlarza, odstępy) wiki liczy z
   funkcji gry na próbie ziaren (`przedzial`), więc zmiana w grze zmienia i artykuł. Napisy odpowiedzi na karcie gościa
   (`etykietaWyboru`) są kopią napisów z `wyboryGoscia`, a test porównuje je z prawdziwą kartą w obu językach i obu miejscach.
   Zasady są wspólne dla obu trybów; różnice trybu zombie opisują uwagi (`WikiCtx.zombie`). Treści łańcuchów kart wiki nie
   zdradza: mówi tylko, czym są i jak się pokazują. */

import type { Person } from '../content/people.ts';
import { L, mnogaPl, tr, tx, wielka } from '../core/jezyk.ts';
import { mulberry, type RngState } from '../core/rng.ts';
import {
  BAZA_HACZYK,
  BAZA_KTO,
  type ChceId,
  type Gosc,
  type HaczykId,
  KTO,
  type KtoId,
  PROG_FACHU,
  skladPowrotu,
  tytulGoscia,
  wagaGoscia,
} from '../gov/goscie.ts';
import { lawNameTx } from '../gov/tresc.ts';
import type { GameMode } from '../gov/typy.ts';
import { LANCUCHY, SZANSA_KROKU, WATKOW } from '../gov/watki.ts';
import { CENA } from '../gov/wiesci.ts';
import { GOSC_GAP, HALAS_PROMIEN, MIN_WAGA_GOSCIA, WAGA_GOSCIA } from '../gov/wizyta.ts';
import { QUIET } from '../gov/wspolne.ts';
import { CALM_END, EARLY, nextGap, POGRZEB_DO, POGRZEB_ODSTEP, WARM_KITCHEN } from '../gov/wydarzenia.ts';
import { newGov } from '../gov/zarzad.ts';
import { NASTAWIENIE, ODMOWA, POWROT_ODSTEP_DNI, POWROT_WIEK_DNI, WAGA_POWROTU, ZAPAS_ODMOWY } from '../gov/znajomi.ts';
import { minutesAt, TICKS_PER_HOUR } from '../sim/clock.ts';
import {
  GOSC_CZEKA,
  GOSC_DOJSCIE,
  GOSC_LUP,
  GOSC_ZASIEG,
  GOSC_ZLAPANY_DO,
  ranoGoscia,
  SPOOK_GOSC,
} from '../sim/gosc.ts';
import {
  BUYS_SCRAP,
  CALM_TICKS,
  type Deal,
  firstVisit,
  firstVisitZombie,
  HAGGLE_TICKS,
  NAPISY as HANDEL,
  KILL_DELAY_DAYS,
  LEAVE_HOUR,
  nextVisit,
  nextVisitZombie,
  OFFER_TIMES,
  OTHER,
  REVENGE_CHANCE,
  ROB_MOOD,
  ROB_MOOD_OTHERS,
  SLAWA_DAYS,
  SLAWA_EXTRA_DAYS,
  SLAWA_MAX,
  TRADER_FLEE,
  TRADER_HP,
  TRADER_NOSHOW,
  tickAt,
  WAIT_TICKS,
  WAIT_ZOMBIE,
  ZBIR_FLEE,
  ZBIR_HP,
  ZBIR_LEAVE_HOUR,
  ZBIR_STAY,
  ZOMBIE_DELAY,
  ZOMBIE_SCARE_ARRIVE,
  ZOMBIE_SCARE_WAIT,
} from '../sim/handlarz.ts';
import { ZARZAD_MAX } from '../sim/praca.ts';
import { UKRYTY_UGRYZIONY } from '../sim/sasiedzi.ts';
import {
  CREW_SEARCH_TICKS,
  firstCrew,
  firstCrewZombie,
  firstWanderer,
  gossipText,
  MUG_MOOD,
  MUG_MOOD_OTHERS,
  mugLoot,
  NAPAD_PAMIEC,
  NOWY_MOOD,
  NOWY_MOOD_TICKS,
  nextCrew,
  nextCrewZombie,
  nextWanderer,
  nextWandererZombie,
  NAPISY as OBCY,
  PAUSE_MAX,
  PAUSE_MIN,
  PAUSE_ZOMBIE_MAX,
  PAUSE_ZOMBIE_MIN,
  PO_ROZMOWIE,
  RADY,
  SHOO_REACH,
  SPOOK_R,
  szansaWerbunku,
  TALK_MOOD,
  TALK_MOOD_TICKS,
  TALK_TICKS,
  ZAPROS_TICKS,
} from '../sim/wedrowcy.ts';
import { deg, manyEn, num, signed } from './tekst.ts';
import { cyt, czasTickow, listaI, polecenie, proc, wCyt } from './wiki-slowa.ts';
import { type Def, def, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

// ---------------------------------------------------------------- drobiazgi

const NB = ' ';

/** sekundy z jednostką (twarda spacja) */
const sek = (v: number): string => `${num(v, 0)}${NB}s`;

/** zakres sekund do faktów: „38–56 s” */
const zakresS = (a: number, b: number): string => `${num(a, 0)}–${num(b, 0)}${NB}s`;

/** metry z jednostką; ułamek z przecinkiem */
const m = (v: number): string => `${num(v, v === Math.round(v) ? 0 : 1)}${NB}m`;

/** godzina doby pełna: „9:00” */
const godzina = (h: number): string => `${h}:00`;

/** „od 9:00 do 13:00” / „9:00 to 13:00” w zdaniach */
const odDoH = (a: number, b: number): string =>
  L(`między ${godzina(a)} a ${godzina(b)}`, `between ${godzina(a)} and ${godzina(b)}`);

/** zakres całkowity: „2–3” (albo „2”, gdy równe) */
const zakresN = (a: number, b: number): string => (a === b ? num(a, 0) : `${num(a, 0)}–${num(b, 0)}`);

/** „od 2 do 3” / „2 to 3” (albo „2”, gdy równe) */
const odDoN = (a: number, b: number): string =>
  a === b ? num(a, 0) : L(`od ${num(a, 0)} do ${num(b, 0)}`, `${num(a, 0)} to ${num(b, 0)}`);

/** Uwaga o różnicy trybu zombie: w trybie zombie „Grasz w trybie zombie: …”, w zwykłym „W trybie zombie …” (zdanie `pl`/`en`
    musi pasować do obu początków, np. „przychodzą też ocaleni …”). */
function uwagaZombie(c: WikiCtx, pl: string, en: string): string {
  return c.zombie
    ? L(`Grasz w trybie zombie: ${pl}`, `You are playing Zombie mode: ${en}`)
    : L(`W trybie zombie ${pl}`, `In Zombie mode ${en}`);
}

/** liczba osób: „1 osoba”, „2–4 osoby”, „3–5 osób” */
function osobyZakres(a: number, b: number): string {
  if (a === b) return L(mnogaPl(a, 'osoba', 'osoby', 'osób'), manyEn(a, 'person', 'people'));
  return L(`${a}–${mnogaPl(b, 'osoba', 'osoby', 'osób')}`, `${a}–${b} people`);
}

// ---------------------------------------------------------------- terminy liczone z funkcji gry

const PROBA = 400;
const ZIARNA: readonly number[] = Array.from({ length: PROBA }, (_, k) => 1000 + k * 7919);
const EPS = 1e-6;

/** Przedział terminu (tick) z funkcji gry na próbie ziaren: dni (bezwzględne) i godziny doby zaokrąglone na zewnątrz do pełnych. */
export interface Przedzial {
  dniOd: number;
  dniDo: number;
  hOd: number;
  hDo: number;
}

export function przedzial(f: (rng: RngState) => number): Przedzial {
  let dniOd = Number.POSITIVE_INFINITY;
  let dniDo = Number.NEGATIVE_INFINITY;
  let hOd = Number.POSITIVE_INFINITY;
  let hDo = Number.NEGATIVE_INFINITY;
  for (const s of ZIARNA) {
    const min = minutesAt(f({ s }));
    const dzien = Math.floor(min / 1440) + 1;
    const h = (min % 1440) / 60;
    dniOd = Math.min(dniOd, dzien);
    dniDo = Math.max(dniDo, dzien);
    hOd = Math.min(hOd, h);
    hDo = Math.max(hDo, h);
  }
  return { dniOd, dniDo, hOd: Math.floor(hOd + EPS), hDo: Math.ceil(hDo - EPS) };
}

/** Przedział w pełnych godzinach, o ile funkcja przesuwa termin względem `start` (tick). */
export function przesuniecie(f: (rng: RngState) => number, start: number): { od: number; do: number } {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of ZIARNA) {
    const h = (f({ s }) - start) / TICKS_PER_HOUR;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return { od: Math.floor(lo + EPS), do: Math.ceil(hi - EPS) };
}

/** różnica w dniach między dniem terminu a dniem odniesienia: przedział odstępów między wizytami */
const dniOd = (p: Przedzial, baza: number): [number, number] => [p.dniOd - baza, p.dniDo - baza];

const DZIEN_PRZED = 5;

interface Terminy {
  handlarz1: Przedzial;
  handlarzN: Przedzial;
  handlarzZ1: Przedzial;
  handlarzZN: Przedzial;
  wedrowiec1: Przedzial;
  wedrowiecN: { od: number; do: number };
  wedrowiecZN: { od: number; do: number };
  ekipa1: Przedzial;
  ekipaN: Przedzial;
  ekipaZ1: Przedzial;
  ekipaZN: Przedzial;
  rano: { od: number; do: number };
}

let terminy: Terminy | null = null;

/** wszystkie terminy z funkcji gry, liczone raz */
export function terminyGry(): Terminy {
  terminy ??= {
    handlarz1: przedzial(firstVisit),
    handlarzN: przedzial((r) => nextVisit(DZIEN_PRZED, r)),
    handlarzZ1: przedzial(firstVisitZombie),
    handlarzZN: przedzial((r) => nextVisitZombie(DZIEN_PRZED, r)),
    wedrowiec1: przedzial(firstWanderer),
    wedrowiecN: przesuniecie((r) => nextWanderer(tickAt(3, 8), r), tickAt(3, 8)),
    wedrowiecZN: przesuniecie((r) => nextWandererZombie(tickAt(3, 0), r), tickAt(3, 0)),
    ekipa1: przedzial(firstCrew),
    ekipaN: przedzial((r) => nextCrew(DZIEN_PRZED, r)),
    ekipaZ1: przedzial(firstCrewZombie),
    ekipaZN: przedzial((r) => nextCrewZombie(DZIEN_PRZED, r)),
    rano: godzinyRana(),
  };
  return terminy;
}

/** Godziny, między którymi wychodzą rano goście wpuszczeni na noc (`ranoGoscia`: 6:00 plus 0–2 godziny ze skrótu id). */
function godzinyRana(): { od: number; do: number } {
  const wieczor = tickAt(3, 23);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let k = 1; k <= PROBA; k++) {
    const h = (minutesAt(ranoGoscia(wieczor, `g${k}`)) % 1440) / 60;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return { od: Math.floor(lo + EPS), do: Math.ceil(hi - EPS) };
}

/** Odstępy między kartami w sekundach przy ekranie: pierwsza karta, odstęp w pierwszych `EARLY` sekundach i później (`nextGap`). */
export function odstepyKart(): { pierwsza: [number, number]; wczesny: [number, number]; pozniej: [number, number] } {
  odstepy ??= (() => {
    const zakres = (f: (s: number) => number): [number, number] => {
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < PROBA_ODSTEPOW; k++) {
        const v = f(1000 + k * 7919);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return [lo, hi];
    };
    return {
      pierwsza: zakres((s) => newGov(s).ev.next),
      wczesny: zakres((s) => nextGap(newGov(s), 0)),
      pozniej: zakres((s) => nextGap(newGov(s), EARLY)),
    };
  })();
  return odstepy;
}

/** odstępy między kartami liczone raz; próba większa niż przy terminach, bo odstęp „później” ma 91 możliwych wartości */
const PROBA_ODSTEPOW = 2000;
let odstepy: ReturnType<typeof odstepyKart> | null = null;

// ---------------------------------------------------------------- gość: rodzaje, prośby, odpowiedzi

/** nazwy rodzajów gości w zdaniach: polska i angielska (tytuł karty bierze się z gry, `tytulKarty`) */
export const NAZWA_KTO: Record<KtoId, [string, string]> = {
  wedrowiec: ['wędrowiec', 'drifter'],
  rodzina: ['rodzina', 'family'],
  dezerter: ['dezerter', 'deserter'],
  uciekinier: ['uciekinier', 'runaway'],
  chory: ['chory', 'sick person'],
  dziecko: ['dziecko', 'child'],
  znajomy: ['znajomy', 'acquaintance'],
  ocaleni: ['ocaleni', 'survivors'],
  z_ugryzionym: ['ludzie z ugryzionym bliskim', 'people with a bitten loved one'],
};

const nazwaKto = (k: KtoId): string => L(NAZWA_KTO[k][0], NAZWA_KTO[k][1]);

/** o co prosi gość: biernik po „prosi o” */
export const NAZWA_CHCE: Record<ChceId, [string, string]> = {
  nocleg: ['nocleg', 'a bed for the night'],
  jedzenie: ['jedzenie', 'food'],
  leki: ['leki', 'meds'],
  wymiana: ['wymianę', 'a swap'],
  dolaczyc: ['miejsce u was', 'a place with you'],
  przechowac: ['przechowanie rzeczy', 'safekeeping of a bundle'],
  wiadomosc: ['wysłuchanie wiadomości', 'a hearing for news'],
  dobic: ['dobicie bliskiego', 'a mercy killing for a bitten loved one'],
};

const nazwaChce = (k: ChceId): string => L(NAZWA_CHCE[k][0], NAZWA_CHCE[k][1]);

/** wszystkie prośby występujące w tabeli gości, w kolejności pierwszego wystąpienia */
export const PROSBY: readonly ChceId[] = [
  ...new Set((Object.values(KTO) as (typeof KTO)[KtoId][]).flatMap((k) => k.chce)),
];

const KTOS = Object.keys(KTO) as KtoId[];

/** rodzaje gości bywające w danym trybie */
const rodzajeW = (mode: GameMode): KtoId[] => KTOS.filter((k) => KTO[k].tryby.includes(mode));

/** bazowy udział rodzaju wśród gości w trybie (bez zimy, domu i wątków sezonu): waga rodzaju przez sumę wag */
export function udzial(k: KtoId, mode: GameMode): number {
  const wszyscy = rodzajeW(mode);
  if (!wszyscy.includes(k)) return 0;
  return BAZA_KTO[k] / wszyscy.reduce((a, x) => a + BAZA_KTO[x], 0);
}

const OSOBA_WZOR: Person = {
  id: 'wiki',
  first: 'Jan',
  name: 'Jan Kowalski',
  f: false,
  prof: 'Kurier',
  skills: {},
  age: 30,
  traits: [],
  home: -1,
  assign: null,
  sick: false,
  dead: false,
  gone: false,
};

/** Tytuł karty gościa danego rodzaju (z gry: `tytulGoscia`) w słowniku miejsca z kontekstu, dla grupy o domyślnej liczbie osób. */
export function tytulKarty(kto: KtoId, c: WikiCtx, n: number = KTO[kto].ilu[0]): string {
  const g: Gosc = {
    id: 'wiki',
    kto,
    chce: 'nocleg',
    ma: 'nic',
    haczyk: 'prawda',
    osoby: Array.from({ length: n }, (_, k) => ({ ...OSOBA_WZOR, id: `wiki${k}` })),
    skad: { strona: 'n', nazwa: tx('', '') },
  };
  return tr(tytulGoscia(g, c.words, c.e));
}

/** identyfikatory odpowiedzi na karcie gościa (src/gov/wizyta.ts, `wyboryGoscia`) */
export const WYBORY_IDS = [
  'noc',
  'jedzenie',
  'odprawic',
  'zostan',
  'zarzad',
  'leki',
  'wymiana',
  'przechowac',
  'wiadomosc',
  'dobic',
  'obejrzec',
] as const;
export type WyborId = (typeof WYBORY_IDS)[number];

/** Napis odpowiedzi na karcie gościa w formie dla grupy. „Przyjąć do …” w grze dopisuje jeszcze, ilu będzie spać na podłodze, a
    odpowiedź o zarządzie imię mówiącego; wiki podaje samą treść (w faktach imię to „imię” / „[name]”). */
export function etykietaWyboru(id: WyborId, c: WikiCtx): string {
  switch (id) {
    case 'noc':
      return L('Wpuścić na noc', 'Let them in for the night');
    case 'jedzenie':
      return L('Podać jedzenie przez siatkę (Jedzenie 1)', 'Pass some food through the fence (Food 1)');
    case 'odprawic':
      return L('Odprawić', 'Send them away');
    case 'zostan':
      return L(`Przyjąć do ${c.dom ? 'domu' : 'spółdzielni'}`, `Take them into ${c.dom ? 'the house' : 'the co-op'}`);
    case 'zarzad':
      return L(`Przyjąć do ${c.words.zarzad.dk} (imię)`, `Take [name] onto ${c.e.krotko}`);
    case 'leki':
      return L('Dać leki (Leki 1)', 'Give them meds (Meds 1)');
    case 'wymiana':
      return L('Przystać na wymianę (Jedzenie 2)', 'Agree to the swap (Food 2)');
    case 'przechowac':
      return L('Przyjąć na przechowanie', 'Take it in for safekeeping');
    case 'wiadomosc':
      return L('Wysłuchać, co mają do powiedzenia', 'Hear what they have to say');
    case 'dobic':
      return L('Dobić przez siatkę dzidą', 'Finish the bitten one off with a spear through the fence');
    case 'obejrzec':
      return L('Obejrzeć ręce', 'Check their hands');
  }
}

/** odpowiedź, która odpowiada na prośbę (pierwsza na karcie) */
export const ODPOWIEDZ_NA: Record<ChceId, WyborId> = {
  nocleg: 'noc',
  jedzenie: 'jedzenie',
  leki: 'leki',
  wymiana: 'wymiana',
  dolaczyc: 'zostan',
  przechowac: 'przechowac',
  wiadomosc: 'wiadomosc',
  dobic: 'dobic',
};

/** pole „zaufanie +1, wkurzenie +2” do opisu skutku odpowiedzi */
function nastroj(zaufanie: number, wkurzenie = 0, laczy = ', '): string {
  const t = L('zaufanie', 'trust');
  const a = L('wkurzenie', 'anger');
  return wkurzenie ? `${t} ${signed(zaufanie, 0)}${laczy}${a} ${signed(wkurzenie, 0)}` : `${t} ${signed(zaufanie, 0)}`;
}

/** skutek odpowiedzi na karcie gościa do faktu; wartości sprawdza test na prawdziwej karcie */
function skutekWyboru(id: WyborId, c: WikiCtx): string {
  const rano = terminyGry().rano;
  switch (id) {
    case 'noc':
      return L(
        `${nastroj(1)}; goście śpią na ziemi, rano między ${godzina(rano.od)} a ${godzina(rano.do)} wychodzą; wymaga otwartej ${c.words.brama.d}`,
        `${nastroj(1)}; the guests sleep on the ground and leave between ${godzina(rano.od)} and ${godzina(rano.do)}; needs ${c.e.brama} to be open`,
      );
    case 'jedzenie':
      return L(`−1 Jedzenie, ${nastroj(1)}; grupa odchodzi`, `−1 Food, ${nastroj(1)}; the group leaves`);
    case 'odprawic':
      return L(`${nastroj(-1)}; grupa odchodzi`, `${nastroj(-1)}; the group leaves`);
    case 'zostan':
      return L(
        `${nastroj(1)} (wkurzenie +2, gdy ktoś musi spać na podłodze); cała grupa zostaje jako ${c.words.mieszkancy.m}`,
        `${nastroj(1)} (anger +2 if someone has to sleep on the floor); the whole group stays as ${c.e.mieszkancy}`,
      );
    case 'zarzad':
      return L(
        `jak wyżej, ale pierwsza żywa osoba z grupy wchodzi do ${c.words.zarzad.dk}; tylko gdy ma fach, którego brakuje`,
        `as above, but the first living person of the group joins ${c.e.krotko}; only if they have a skill you lack`,
      );
    case 'leki':
      return L(`−1 Leki, ${nastroj(1)}; grupa odchodzi`, `−1 Meds, ${nastroj(1)}; the group leaves`);
    case 'wymiana':
      return L('−2 Jedzenie, zaufanie bez zmian; grupa odchodzi', '−2 Food, trust unchanged; the group leaves');
    case 'przechowac':
      return L(
        `${nastroj(1)}; rzecz z zawiniątka zostaje u was; grupa odchodzi`,
        `${nastroj(1)}; the item from the bundle stays with you; the group leaves`,
      );
    case 'wiadomosc':
      return L('bez kosztu, zaufanie bez zmian; grupa odchodzi', 'no cost, trust unchanged; the group leaves');
    case 'dobic':
      return L(
        'ugryziony ginie, a dobijający ma nastrój −6 na 24 h; trzeba kogoś z dzidą',
        'the bitten one dies and the one who did it has a −6 mood for 24 h; you need someone with a spear',
      );
    case 'obejrzec':
      return L(
        'odsłania ugryzienie; zdrowy gość kosztuje 1 punkt zaufania; karta zostaje otwarta; tylko tryb zombie',
        'reveals a bite; a healthy guest costs 1 point of trust; the card stays open; Zombie mode only',
      );
  }
}

// ---------------------------------------------------------------- handlarz

/** oferta handlarza w napisie z gry: „Dać 6 złomu za 3 deski” */
function ofertaTekst(d: Deal): string {
  const n = HANDEL.oferta({ give: d[1], take: d[0], left: OFFER_TIMES });
  return L(n.pl, n.en);
}

/** próbka worka po napaści na wędrowca: zakres jedzenia i czy trafia się część albo lek (z `mugLoot` na próbie ziaren) */
export function workWedrowca(): { jedzenieOd: number; jedzenieDo: number; czesc: number; lek: number } {
  worek ??= liczWorekWedrowca();
  return worek;
}

let worek: ReturnType<typeof workWedrowca> | null = null;

function liczWorekWedrowca(): { jedzenieOd: number; jedzenieDo: number; czesc: number; lek: number } {
  let od = Number.POSITIVE_INFINITY;
  let doo = Number.NEGATIVE_INFINITY;
  let czesc = 0;
  let lek = 0;
  for (const s of ZIARNA) {
    const w = mugLoot({ s });
    od = Math.min(od, w.jedzenie ?? 0);
    doo = Math.max(doo, w.jedzenie ?? 0);
    if (w.czesci) czesc++;
    if (w.leki) lek++;
  }
  return { jedzenieOd: od, jedzenieDo: doo, czesc: czesc / PROBA, lek: lek / PROBA };
}

/** Szansa zaproszenia przy zadanych okolicznościach (`szansaWerbunku`), w punktach procentowych, zaokrąglona jak w menu. */
const szansaProc = (o: Partial<Parameters<typeof szansaWerbunku>[0]>): number =>
  Math.round(100 * szansaWerbunku({ jedzenieNaGlowe: 0, wolneLozko: false, napadDwieDoby: false, maCel: false, ...o }));

/** Liczby szansy zaproszenia: baza, premie i kara (z różnic `szansaWerbunku`), granice i próg jedzenia na osobę. */
export function liczbySzansy(): {
  baza: number;
  jedzenie: number;
  lozko: number;
  napad: number;
  min: number;
  max: number;
  cel: [number, number];
  prog: number;
} {
  const baza = szansaProc({});
  const prog = [0, 0.5, 1, 1.5, 2, 2.5, 3].find((j) => szansaProc({ jedzenieNaGlowe: j }) > baza) ?? 0;
  const maxO = { jedzenieNaGlowe: prog, wolneLozko: true };
  return {
    baza,
    prog,
    jedzenie: szansaProc({ jedzenieNaGlowe: prog }) - baza,
    lozko: szansaProc({ wolneLozko: true }) - baza,
    napad: szansaProc(maxO) - szansaProc({ ...maxO, napadDwieDoby: true }),
    min: szansaProc({ napadDwieDoby: true }),
    max: szansaProc(maxO),
    cel: [szansaProc({ napadDwieDoby: true, maCel: true }), szansaProc({ ...maxO, maCel: true })],
  };
}

// ---------------------------------------------------------------- ciągi kart

/** liczby o ciągach kart z tabeli `LANCUCHY` */
export function liczbyCiagow(): {
  razem: number;
  kartMin: number;
  kartMax: number;
  poMin: number;
  poMax: number;
  zwykly: number;
  zombie: number;
  wspolne: number;
  zGosciem: number;
  zObcymi: number;
  zLokatorami: number;
} {
  const kroki = LANCUCHY.map((l) => l.kroki.length);
  const po = LANCUCHY.flatMap((l) => l.kroki.filter((k) => k.nr > 1).map((k) => k.po));
  const wTrybie = (t: GameMode) => LANCUCHY.filter((l) => l.tryby.includes(t)).length;
  return {
    razem: LANCUCHY.length,
    kartMin: Math.min(...kroki),
    kartMax: Math.max(...kroki),
    poMin: Math.min(...po),
    poMax: Math.max(...po),
    zwykly: wTrybie('zwykly'),
    zombie: wTrybie('zombie'),
    wspolne: LANCUCHY.filter((l) => l.tryby.includes('zwykly') && l.tryby.includes('zombie')).length,
    zGosciem: LANCUCHY.filter((l) => l.kroki.some((k) => k.gosc)).length,
    zObcymi: LANCUCHY.filter((l) => l.obcy).length,
    zLokatorami: LANCUCHY.filter((l) => l.lokatorzy).length,
  };
}

// ---------------------------------------------------------------- powroty znajomych

/** zdarzenia pamięci o znajomych w kolejności tabeli `NASTAWIENIE`: polski i angielski opis (wyrzucenie bramą: słowa miejsca) */
function opisJak(jak: keyof typeof NASTAWIENIE, c: WikiCtx): string {
  switch (jak) {
    case 'nakarmiony':
      return L(
        'Pomoc przez siatkę: jedzenie, leki, wymiana, przechowanie, wysłuchanie',
        'Help through the fence: food, meds, a swap, safekeeping, a hearing',
      );
    case 'nocleg':
      return L('Wpuszczony na noc', 'Let in for the night');
    case 'przyjety':
      return L(`Przyjęty do osiedla albo do ${c.words.zarzad.dk}`, `Taken in to stay or onto ${c.e.krotko}`);
    case 'odprawiony':
      return L('Odprawiony', 'Sent away');
    case 'okradl':
      return L('Okradł was', 'Stole from you');
    case 'wyrzucony':
      return c.dom
        ? L(`Sąsiad wyrzucony przez ${c.words.brama.b}`, `A neighbour thrown out through ${c.e.brama}`)
        : L(`Mieszkaniec wyrzucony przez ${c.words.brama.b}`, `A resident thrown out through ${c.e.brama}`);
    case 'zlapany':
      return L('Złapany na kradzieży', 'Caught stealing');
  }
}

/** próbka worka jedzenia od wracającego znajomego (2–4 porcje, z `skladPowrotu`) */
export function workPowrotu(): { od: number; do: number } {
  workP ??= liczWorekPowrotu();
  return workP;
}

let workP: { od: number; do: number } | null = null;

function liczWorekPowrotu(): { od: number; do: number } {
  let od = Number.POSITIVE_INFINITY;
  let doo = Number.NEGATIVE_INFINITY;
  const z = {
    id: 'z1',
    osoba: { first: 'Jan', name: 'Jan Kowalski', f: false, age: 30 },
    prof: 'Kurier',
    kto: 'wedrowiec' as KtoId,
  };
  for (let k = 1; k <= 200; k++) {
    const g = skladPowrotu(
      mulberry(k * 31 + 7),
      1,
      z,
      { mode: 'zwykly', okolica: [], dom: false },
      new Set<string>(),
      'jedzenie',
    );
    od = Math.min(od, g.porcje ?? Number.POSITIVE_INFINITY);
    doo = Math.max(doo, g.porcje ?? Number.NEGATIVE_INFINITY);
  }
  return { od, do: doo };
}

// ---------------------------------------------------------------- artykuły

export function definicjeWydarzenia(): Def[] {
  return [
    def(
      'wydarzenia:karty',
      'wydarzenia',
      () => L('Karty wydarzeń', 'Event cards'),
      (c): Tresc => {
        const o = odstepyKart();
        const wczesne = Math.round(EARLY / 60);
        return {
          zdania: [
            L(
              'Wydarzenie to karta w oknie: tytuł, kilka zdań o tym, co się dzieje, i przyciski z odpowiedziami, z których wybieracie jedną.',
              'An event is a card in a window: a title, a few sentences about what is going on and buttons with answers, of which you pick one.',
            ),
            L(
              `Odpowiedź, na którą was nie stać, jest wyszarzona, a gdy karta dotyczy miejsca na mapie, przycisk ${cyt('Pokaż', 'Show')} pokazuje je kamerą i zostawia okno otwarte.`,
              `An answer you cannot afford is greyed out, and when a card is about a spot on the map, the ${cyt('Pokaż', 'Show')} button points the camera at it and leaves the window open.`,
            ),
            L(
              `Pierwsza karta wypada po ${zakresS(...o.pierwsza)}, a każda następna po decyzji o poprzedniej: w pierwszych ${wczesne} minutach po ${zakresS(...o.wczesny)}, później po ${zakresS(...o.pozniej)}; liczą się prawdziwe sekundy, w których gra biegnie.`,
              `The first card comes after ${zakresS(...o.pierwsza)}, and each next one after your decision on the previous one: ${zakresS(...o.wczesny)} later in the first ${wczesne} minutes and ${zakresS(...o.pozniej)} later after that; the clock counts real seconds while the game is running.`,
            ),
            L(
              `Nowa karta nie przychodzi, gdy czeka karta nocy, uchwała, raport albo poprzednia karta, a po każdej waszej decyzji dopiero po ${sek(QUIET)}.`,
              `A new card does not come while the night card, a resolution, a report or the previous card is waiting, and after each of your decisions only after ${sek(QUIET)}.`,
            ),
            L(
              `Pierwszego dnia jest cisza, dopóki kuchnia nie ma ${deg(WARM_KITCHEN)} (najpóźniej do ${godzina(CALM_END)}), a do ósmej rano drugiego dnia przychodzą tylko karty pasujące do pierwszej nocy.`,
              `The first day is quiet until the kitchen reaches ${deg(WARM_KITCHEN)} (at the latest until ${godzina(CALM_END)}), and until eight the next morning only cards that suit the first night come.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            'nie przychodzą karty ulicy ani karty o ludziach, których na mapie nie ma, za to wypadają karty o szwendaczach i śladach przy siatce.',
            'the street cards and the cards about people who are not on the map do not come, but there are cards about shamblers and tracks at the fence.',
          ),
          fakty: [
            fakt('pierwsza', L('Pierwsza karta po', 'First card after'), zakresS(...o.pierwsza)),
            fakt(
              'wczesny',
              L(
                `Od decyzji do następnej karty w pierwszych ${wczesne} minutach`,
                `From a decision to the next card in the first ${wczesne} minutes`,
              ),
              zakresS(...o.wczesny),
            ),
            fakt(
              'pozniej',
              L('Od decyzji do następnej karty później', 'From a decision to the next card later'),
              zakresS(...o.pozniej),
            ),
            fakt(
              'po-decyzji',
              L('Po decyzji następna karta najwcześniej po', 'After a decision the next card comes no sooner than'),
              sek(QUIET),
            ),
            fakt(
              'cisza',
              L('Cisza pierwszego dnia', 'Quiet first day'),
              L(
                `do ${deg(WARM_KITCHEN)} w kuchni, najpóźniej do ${godzina(CALM_END)}`,
                `until the kitchen reaches ${deg(WARM_KITCHEN)}, at the latest until ${godzina(CALM_END)}`,
              ),
            ),
            fakt(
              'pogrzeb',
              L('Karta pogrzebu po zgonie osoby z imieniem', 'Funeral card after a named person dies'),
              L(
                `najwyżej ${sek(POGRZEB_ODSTEP)} po ostatniej decyzji; zgon starszy niż ${Math.round(POGRZEB_DO / 1440)} doby jej nie dostaje`,
                `at most ${sek(POGRZEB_ODSTEP)} after the last decision; a death older than ${Math.round(POGRZEB_DO / 1440)} days gets none`,
              ),
            ),
          ],
          jak: [
            L(
              `${c.touch ? 'Stuknijcie' : 'Kliknijcie'} odpowiedź na karcie: decyzja zamyka okno i zostaje zapisana w kronice.`,
              `${c.touch ? 'Tap' : 'Click'} an answer on the card: the decision closes the window and is written into the log.`,
            ),
            L(
              `Przy karcie z miejscem na mapie ${c.touch ? 'stuknijcie' : 'kliknijcie'} ${cyt('Pokaż', 'Show')}, żeby kamera pojechała na to miejsce.`,
              `On a card with a spot on the map ${c.touch ? 'tap' : 'click'} ${cyt('Pokaż', 'Show')} to send the camera there.`,
            ),
          ],
          zobacz: [
            'wydarzenia:goscie',
            'wydarzenia:lancuchy',
            'wydarzenia:handlarz',
            'wydarzenia:wedrowcy',
            'zombie:tryb',
          ],
        };
      },
      'event card okno decyzja odstęp tempo pogrzeb cisza',
    ),

    def(
      'wydarzenia:goscie',
      'wydarzenia',
      (c) => L(`Gość ${c.words.brama.pod}`, `A guest at ${c.e.brama}`),
      (c): Tresc => {
        const rano = terminyGry().rano;
        const utrata = 1 - wagaGoscia({ napady: 1 });
        return {
          zdania: [
            L(
              `Gość to jedna osoba albo grupa, która staje ${c.words.brama.pod} i czeka, aż zdecydujecie, co z nią zrobić.`,
              `A guest is one person or a group that stops at ${c.e.brama} and waits for you to decide what to do about them.`,
            ),
            L(
              `Wypadnięcie gościa z losowania nie otwiera karty: grupa najpierw idzie ulicą, a karta otwiera się dopiero wtedy, gdy stoją ${c.words.brama.pod} i nic innego nie czeka na decyzję.`,
              `When a guest comes up in the draw no card opens at once: the group first walks down the street, and the card opens only when they stand at ${c.e.brama} and nothing else is waiting for a decision.`,
            ),
            L(
              `Naraz trwa najwyżej jedna wizyta, następna wypada najwcześniej po ${czasTickow(GOSC_GAP * TICKS_PER_HOUR)} gry, a każda napaść na obcego odbiera ${proc(utrata)} szansy na gościa, nie niżej niż do ${proc(MIN_WAGA_GOSCIA)} wyjściowej.`,
              `Only one visit runs at a time, the next comes no sooner than ${czasTickow(GOSC_GAP * TICKS_PER_HOUR)} of game time later, and every attack on a stranger takes ${proc(utrata)} off the chance of a guest, down to ${proc(MIN_WAGA_GOSCIA)} of the original at the lowest.`,
            ),
            L(
              `Grupa czeka na waszą decyzję do ${czasTickow(GOSC_CZEKA)} gry i odchodzi sama, a jeśli nie dojdzie pod ${c.words.brama.b} w ${czasTickow(GOSC_DOJSCIE)}, wizyta przepada.`,
              `The group waits for your decision for up to ${czasTickow(GOSC_CZEKA)} of game time and then leaves on its own, and if it does not reach ${c.e.brama} within ${czasTickow(GOSC_DOJSCIE)}, the visit is cancelled.`,
            ),
            L(
              `Kilka starszych kart wydarzeń też stawia grupę ${c.words.brama.pod}; wizyta zajmuje wtedy miejsce tej karty i nie dokłada drugiej.`,
              `A few older event cards also put a group at ${c.e.brama}; the visit then takes the place of that card instead of adding a second one.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `przychodzą też ocaleni i ludzie z ugryzionym bliskim, a szwendacz, który podejdzie do grupy na ${m(SPOOK_GOSC)} (zasięg ugryzienia), płoszy ją.`,
            `survivors and people with a bitten loved one come as well, and a shambler that gets within ${m(SPOOK_GOSC)} of the group (biting reach) scares it off.`,
          ),
          fakty: [
            fakt('waga', L('Waga gościa w losowaniu kart', 'Guest weight in the card draw'), num(WAGA_GOSCIA, 1)),
            fakt('odstep', L('Odstęp między wizytami', 'Gap between visits'), czasTickow(GOSC_GAP * TICKS_PER_HOUR)),
            fakt('czeka', L('Czeka na decyzję najdłużej', 'Waits for a decision at most'), czasTickow(GOSC_CZEKA)),
            fakt(
              'dojscie',
              L(`Czas na dojście pod ${c.words.brama.b}`, `Time to reach ${c.e.brama}`),
              czasTickow(GOSC_DOJSCIE),
            ),
            fakt(
              'napasc',
              L('Każda napaść na obcego', 'Every attack on a stranger'),
              L(
                `−${proc(utrata)} szansy na gościa, najniżej ${proc(MIN_WAGA_GOSCIA)}`,
                `−${proc(utrata)} of the chance of a guest, ${proc(MIN_WAGA_GOSCIA)} at the lowest`,
              ),
            ),
            fakt(
              'rano',
              L('Wpuszczeni na noc wychodzą', 'Guests let in for the night leave'),
              L(
                `rano między ${godzina(rano.od)} a ${godzina(rano.do)}`,
                `in the morning between ${godzina(rano.od)} and ${godzina(rano.do)}`,
              ),
            ),
          ],
          zobacz: [
            'wydarzenia:rodzaje',
            'wydarzenia:prosby',
            'wydarzenia:wybory',
            'wydarzenia:haczyk',
            'wydarzenia:znajomi',
            'zombie:tryb',
          ],
        };
      },
      'gosc gość visitor strangers wizyta brama furtka',
    ),

    def(
      'wydarzenia:rodzaje',
      'wydarzenia',
      () => L('Kto może przyjść', 'Who can show up'),
      (c): Tresc => {
        const mode: GameMode = c.zombie ? 'zombie' : 'zwykly';
        const wszystkie = KTOS.length;
        const zwykle = rodzajeW('zwykly').length;
        const pojedyncze = KTOS.filter((k) => KTO[k].ilu[1] === 1);
        const najwieksza = [...KTOS].sort((x, y) => KTO[y].ilu[1] - KTO[x].ilu[1])[0];
        const minIlu = Math.min(...KTOS.map((k) => KTO[k].ilu[0]));
        const maxIlu = Math.max(...KTOS.map((k) => KTO[k].ilu[1]));
        const najczestsze = [...rodzajeW(mode)].sort((a, b) => BAZA_KTO[b] - BAZA_KTO[a]).slice(0, 3);
        return {
          zdania: [
            L(
              `Gość z losowania należy do jednego z ${wszystkie} rodzajów (${zwykle} w zwykłym trybie), a tytuł karty mówi który, ale nie zdradza, czy gość mówi prawdę.`,
              `A guest from the draw is one of ${wszystkie} kinds (${zwykle} in the normal mode), and the card title says which, but it does not give away whether the guest is telling the truth.`,
            ),
            L(
              `Grupa liczy od ${minIlu} do ${maxIlu} osób zależnie od rodzaju: najwięcej osób ma ${nazwaKto(najwieksza)} (${osobyZakres(KTO[najwieksza].ilu[0], KTO[najwieksza].ilu[1])}), a pojedynczo przychodzą: ${listaI(pojedyncze.map(nazwaKto))}.`,
              `A group has ${minIlu} to ${maxIlu} people depending on the kind: the ${nazwaKto(najwieksza)} has the most (${osobyZakres(KTO[najwieksza].ilu[0], KTO[najwieksza].ilu[1])}), and these kinds come alone: ${listaI(pojedyncze.map(nazwaKto))}.`,
            ),
            L(
              `Bez poprawek na zimę, dom i wątki sezonu najczęściej przychodzi ${nazwaKto(najczestsze[0])} (${proc(udzial(najczestsze[0], mode))}), potem ${nazwaKto(najczestsze[1])} (${proc(udzial(najczestsze[1], mode))}) i ${nazwaKto(najczestsze[2])} (${proc(udzial(najczestsze[2], mode))}).`,
              `Without the winter, house and storyline adjustments, the most common is the ${nazwaKto(najczestsze[0])} (${proc(udzial(najczestsze[0], mode))}), then the ${nazwaKto(najczestsze[1])} (${proc(udzial(najczestsze[1], mode))}) and the ${nazwaKto(najczestsze[2])} (${proc(udzial(najczestsze[2], mode))}).`,
            ),
            L(
              'Rodzaj gościa wyznacza, o co może prosić i co może mieć przy sobie, a to opisuje osobny artykuł.',
              'A guest’s kind sets what the guest may ask for and what they may carry, and a separate article covers that.',
            ),
          ],
          uwaga: uwagaZombie(
            c,
            'dochodzą jeszcze ocaleni i ludzie z ugryzionym bliskim, a w zwykłej grze ich nie ma.',
            'survivors and people with a bitten loved one join the list, and in the normal game they do not exist.',
          ),
          fakty: KTOS.map((k) => {
            const prosi = KTO[k].chce.map(nazwaChce).join(', ');
            const ile = osobyZakres(KTO[k].ilu[0], KTO[k].ilu[1]);
            const wTrybie = KTO[k].tryby.includes(mode);
            const koniec = wTrybie
              ? L(`udział bazowy ${proc(udzial(k, mode))}`, `base share ${proc(udzial(k, mode))}`)
              : L('tylko w trybie zombie', 'Zombie mode only');
            return fakt(
              `kto-${k}`,
              tytulKarty(k, c),
              L(`${ile}; prośby: ${prosi}; ${koniec}`, `${ile}; requests: ${prosi}; ${koniec}`),
            );
          }),
          zobacz: ['wydarzenia:goscie', 'wydarzenia:prosby', 'wydarzenia:haczyk'],
        };
      },
      'rodzaje gości wędrowiec rodzina dezerter uciekinier chory dziecko znajomy ocaleni kinds',
    ),

    def(
      'wydarzenia:prosby',
      'wydarzenia',
      () => L('Czego goście chcą i co mają', 'What guests want and what they carry'),
      (c): Tresc => ({
        zdania: [
          L(
            `Każdy gość o coś prosi: ${listaI(PROSBY.map(nazwaChce))}.`,
            `Every guest asks for something: ${listaI(PROSBY.map(nazwaChce))}.`,
          ),
          L(
            'Pierwsza odpowiedź na karcie odpowiada na tę prośbę, a dalej są zwykle wpuszczenie na noc, jedzenie przez siatkę i odprawa.',
            'The first answer on the card answers that request, and after it usually come letting them in for the night, food through the fence and sending them away.',
          ),
          L(
            'Po zmroku goście częściej proszą o dach, a za dnia o jedzenie.',
            'After dark guests more often ask for a roof, and by day for food.',
          ),
          L(
            'Poza prośbą gość może mieć przy sobie fach, rzecz (broń, amunicję albo leki), wiadomość o miejscu na mapie miasta albo ostrzeżenie przed nocą, a bywa, że nic.',
            'Besides the request a guest may carry a skill, an item (a weapon, ammo or meds), news of a place on the city map or a warning about the night, or nothing at all.',
          ),
          L(
            'To, co gość ma, dostajecie, gdy mu pomożecie albo go wysłuchacie, a nie wtedy, gdy go odprawicie.',
            'You get what the guest has when you help them or hear them out, not when you send them away.',
          ),
        ],
        fakty: [
          ...PROSBY.map((p) =>
            fakt(
              `chce-${p}`,
              L(`Prosi o ${nazwaChce(p)}`, `Asks for ${nazwaChce(p)}`),
              wCyt(etykietaWyboru(ODPOWIEDZ_NA[p], c)),
            ),
          ),
          fakt(
            'ma-fach',
            L('Ma fach', 'Has a skill'),
            L(
              `umiejętność od poziomu ${PROG_FACHU} w dziedzinie, której ${c.words.zarzad.m} jeszcze nie zna; jej właściciel wchodzi do ${c.words.zarzad.dk} po ${wCyt(etykietaWyboru('zarzad', c))}`,
              `a skill at level ${PROG_FACHU} or more in a field ${c.e.krotko} does not know yet; its owner joins ${c.e.krotko} after ${wCyt(etykietaWyboru('zarzad', c))}`,
            ),
          ),
          fakt(
            'ma-rzecz',
            L('Ma rzecz', 'Has an item'),
            L(
              'broń i amunicja trafiają do magazynu, leki do zapasów; kto prosi o leki, leków nie niesie',
              'weapons and ammo go to the storeroom, meds to the stock; someone who asks for meds does not carry any',
            ),
          ),
          fakt(
            'ma-wiadomosc',
            L('Ma wiadomość', 'Has news'),
            L(
              'wskazówka o miejscu z mapy miasta, ważna na jedną wyprawę',
              'a tip about a place on the city map, good for one run',
            ),
          ),
          fakt(
            'ma-ostrzezenie',
            L('Ma ostrzeżenie', 'Has a warning'),
            L('warta tej nocy jest czujniejsza', 'the watch is sharper tonight'),
          ),
        ],
        zobacz: ['wydarzenia:wybory', 'wydarzenia:haczyk', 'miasto:wyprawa'],
      }),
      'prośby nocleg jedzenie leki wymiana wiadomość ostrzeżenie fach rzecz',
    ),

    def(
      'wydarzenia:wybory',
      'wydarzenia',
      () => L('Co robią odpowiedzi na karcie gościa', 'What the answers on a guest card do'),
      (c): Tresc => {
        const zarzad = c.words.zarzad.dk;
        return {
          zdania: [
            L(
              `Odpowiedzi na karcie gościa to rozkazy dla prawdziwych ludzi ${c.words.brama.pod}: grupa wchodzi, dostaje jedzenie, zostaje albo odchodzi.`,
              `The answers on a guest card are orders for real people at ${c.e.brama}: the group comes in, gets food, stays or leaves.`,
            ),
            L(
              'Pomoc (nocleg, jedzenie, leki, przyjęcie, przechowanie) podnosi zaufanie o 1, odprawa obniża je o 1, a wymiana i wysłuchanie go nie ruszają.',
              'Help (a night’s shelter, food, meds, taking in, safekeeping) raises trust by 1, sending away lowers it by 1, and the swap and the hearing leave it alone.',
            ),
            L(
              `Przyjęcie dokłada wkurzenie, gdy zabraknie łóżek i ktoś musi spać na podłodze, a ${wCyt(etykietaWyboru('zarzad', c))} bierze do ${zarzad} tylko pierwszą żywą osobę z grupy, resztę zostawiając jako ${c.words.mieszkancy.m}.`,
              `Taking in adds anger when the beds run out and someone has to sleep on the floor, and ${wCyt(etykietaWyboru('zarzad', c))} takes only the first living person of the group onto ${c.e.krotko}, leaving the rest as ${c.e.mieszkancy}.`,
            ),
            L(
              `Nocleg wymaga otwartej ${c.words.brama.d}: z uchwałą ${wCyt(tr(lawNameTx('u_brama', c.place)))} odpowiedź ${wCyt(etykietaWyboru('noc', c))} jest wyszarzona od 20:00 do 6:00.`,
              `Shelter for the night needs ${c.e.brama} to be open: with the ${wCyt(tr(lawNameTx('u_brama', c.place)))} resolution the answer ${wCyt(etykietaWyboru('noc', c))} is greyed out from 20:00 to 6:00.`,
            ),
            L(
              'Wszystko, co gość ma, dostajecie przy każdej pomocy, ale nigdy za odprawę ani za dobicie.',
              'You get everything the guest has with every kind of help, but never for sending them away or for the mercy kill.',
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `karta ma dodatkową odpowiedź ${wCyt(etykietaWyboru('obejrzec', c))}, a prośbę o dobicie bliskiego załatwia ${wCyt(etykietaWyboru('dobic', c))}.`,
            `the card has an extra answer ${wCyt(etykietaWyboru('obejrzec', c))}, and a request to put down a bitten loved one is met with ${wCyt(etykietaWyboru('dobic', c))}.`,
          ),
          fakty: WYBORY_IDS.map((id) => fakt(`wybor-${id}`, wCyt(etykietaWyboru(id, c)), skutekWyboru(id, c))),
          zobacz: ['wydarzenia:prosby', 'wydarzenia:haczyk', 'wydarzenia:zlapany', 'uchwala:u_brama', 'zombie:dzida'],
        };
      },
      'odpowiedzi wybory karta gościa zaufanie wkurzenie przyjąć odprawić wpuścić',
    ),

    def(
      'wydarzenia:haczyk',
      'wydarzenia',
      () => L('Czy gość mówi prawdę', 'Is the guest telling the truth'),
      (c): Tresc => {
        const sumaZwykly = (['prawda', 'klamie', 'chory', 'poscig'] as HaczykId[]).reduce(
          (a, h) => a + BAZA_HACZYK[h],
          0,
        );
        return {
          zdania: [
            L(
              'Karta nie zdradza, czy gość mówi prawdę: tytuł jest ten sam, a tekst daje tylko trop.',
              'The card does not give away whether the guest is telling the truth: the title is the same, and the text only gives a hint.',
            ),
            L(
              'W zwykłym trybie gość może kłamać, być chory albo mieć za sobą pościg, a w trybie zombie nikt nie kłamie, za to bywa chory albo ugryziony, i najczęściej mówi prawdę.',
              'In the normal mode a guest may be lying, ill or chased, and in Zombie mode nobody lies, but a guest may be ill or bitten, and most often they tell the truth.',
            ),
            L(
              `Kłamca wpuszczony na noc idzie po jedzenie i bierze najwyżej ${GOSC_LUP} porcje, a ktoś czuwający w promieniu ${m(GOSC_ZASIEG)} go łapie i otwiera się karta „Złapany na kradzieży”.`,
              `A liar let in for the night goes for the food and takes ${GOSC_LUP} portions at most, and someone on watch within ${m(GOSC_ZASIEG)} catches them, which opens the “Caught stealing” card.`,
            ),
            L(
              `Chory wpuszczony albo przyjęty zaraża rano kogoś z ${c.words.zarzad.dk}, a pościg w zwykłym trybie podnosi szansę napadu tej nocy mniej więcej o połowę i sprowadza go pod ${c.words.brama.b}.`,
              `An ill guest let in or taken in infects someone on ${c.e.krotko} in the morning, and a pursuit in the normal mode raises the chance of a raid that night by about half and brings it to ${c.e.brama}.`,
            ),
            L(
              `Ugryziony wpuszczony albo przyjęty zaczyna gorączkować, a ${wCyt(etykietaWyboru('obejrzec', c))} odsłania ugryzienie z pewnością; w zwykłej grze to się nie zdarza.`,
              `A bitten guest let in or taken in starts to run a fever, and ${wCyt(etykietaWyboru('obejrzec', c))} reveals the bite for certain; in the normal game this does not happen.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `nikt nie kłamie ani nie jest ścigany przez ludzi, a hałas ${c.words.brama.przy} (${m(HALAS_PROMIEN)}) robi ten, kto idzie za gościem.`,
            `nobody lies or is chased by people, and whoever follows a guest makes noise at ${c.e.brama} (${m(HALAS_PROMIEN)}).`,
          ),
          fakty: [
            fakt(
              'haczyk-prawda',
              L('Mówi prawdę', 'Tells the truth'),
              L(
                `waga ${num(BAZA_HACZYK.prawda, 1)} z ${num(sumaZwykly, 1)} w zwykłym trybie; dzieje się to, co na karcie`,
                `weight ${num(BAZA_HACZYK.prawda, 1)} of ${num(sumaZwykly, 1)} in the normal mode; what the card says is what happens`,
              ),
            ),
            fakt(
              'haczyk-klamie',
              L('Kłamie', 'Lies'),
              L(
                `waga ${num(BAZA_HACZYK.klamie, 1)}, tylko zwykły tryb; wpuszczony na noc idzie po jedzenie (do ${GOSC_LUP} porcji)`,
                `weight ${num(BAZA_HACZYK.klamie, 1)}, normal mode only; once let in for the night goes for the food (up to ${GOSC_LUP} portions)`,
              ),
            ),
            fakt(
              'haczyk-chory',
              L('Jest chory', 'Is ill'),
              L(
                `waga ${num(BAZA_HACZYK.chory, 1)}, w obu trybach; zaraża rano kogoś z ${c.words.zarzad.dk}`,
                `weight ${num(BAZA_HACZYK.chory, 1)}, in both modes; infects someone on ${c.e.krotko} in the morning`,
              ),
            ),
            fakt(
              'haczyk-poscig',
              L('Ktoś za nim idzie', 'Someone is after them'),
              L(
                `waga ${num(BAZA_HACZYK.poscig, 1)}, tylko zwykły tryb; napad pod ${c.words.brama.b} tej nocy`,
                `weight ${num(BAZA_HACZYK.poscig, 1)}, normal mode only; a raid at ${c.e.brama} that night`,
              ),
            ),
            fakt(
              'haczyk-ugryziony',
              L('Jest ugryziony', 'Is bitten'),
              L(
                `waga ${num(BAZA_HACZYK.ugryziony, 1)}, tylko tryb zombie; po wpuszczeniu gorączka`,
                `weight ${num(BAZA_HACZYK.ugryziony, 1)}, Zombie mode only; fever after being let in`,
              ),
            ),
          ],
          zobacz: ['wydarzenia:wybory', 'wydarzenia:zlapany', 'noc:napad', 'zombie:ugryzienie'],
        };
      },
      'haczyk kłamca chory pościg ugryziony prawda lie liar',
    ),

    def(
      'wydarzenia:zlapany',
      'wydarzenia',
      () => L('Złapany na kradzieży', 'Caught stealing'),
      (c): Tresc => ({
        zdania: [
          L(
            `Kłamca wpuszczony na noc idzie po jedzenie o 2:00, a jeśli ktoś z ${c.words.zarzad.dk} czuwa w promieniu ${m(GOSC_ZASIEG)}, łapie go na gorącym uczynku.`,
            `A liar let in for the night goes for the food at 2:00, and if someone on ${c.e.krotko} is awake within ${m(GOSC_ZASIEG)}, they catch the thief in the act.`,
          ),
          L(
            `Wtedy otwiera się karta ${wCyt(L('Złapany na kradzieży', 'Caught stealing'))} z trzema odpowiedziami.`,
            `Then the ${wCyt(L('Złapany na kradzieży', 'Caught stealing'))} card opens, with three answers.`,
          ),
          L(
            `${wCyt('Oddać jedzenie i wyrzucić')} zwraca zapasy i daje ${nastroj(1)}; ${wCyt('Wyrzucić z łupem')} kosztuje ${nastroj(-1)} (i wkurzenie ${signed(1, 0)}, gdy zginęło jedzenie); ${wCyt('Zatrzymać do rana')} zostawia jedzenie na podwórku, ale pilnującemu odbiera 10 punktów wypoczynku.`,
            `${wCyt('Take the food back and throw them out')} returns the stores and gives ${nastroj(1)}; ${wCyt('Throw them out with the loot')} costs ${nastroj(-1)} (and anger ${signed(1, 0)} if food went missing); ${wCyt('Hold them until morning')} keeps the food in the yard but costs the guard 10 points of rest.`,
          ),
          L(
            `Bez waszej decyzji złapany stoi do ${godzina(GOSC_ZLAPANY_DO)} rano, a potem go puszczają bez łupu.`,
            `Without your decision the caught guest stands there until ${godzina(GOSC_ZLAPANY_DO)} in the morning, and then they let the thief go without the loot.`,
          ),
          L(
            `${wielka(c.words.zarzad.krotko)} zapamiętuje złapanego z nastawieniem ${signed(NASTAWIENIE.zlapany, 0)}, a taki znajomy może wrócić z szabrownikami na napad.`,
            `${wielka(c.e.krotko)} remembers the caught guest with an attitude of ${signed(NASTAWIENIE.zlapany, 0)}, and such a familiar face may come back with the looters for a raid.`,
          ),
        ],
        fakty: [
          fakt(
            'zasieg',
            L('Czuwający łapie złodzieja w promieniu', 'Someone awake catches the thief within'),
            m(GOSC_ZASIEG),
          ),
          fakt(
            'lup',
            L('Kłamca bierze najwyżej', 'The liar takes at most'),
            L(`${GOSC_LUP} porcje jedzenia`, `${GOSC_LUP} portions of food`),
          ),
          fakt(
            'do-rana',
            L('Bez decyzji puszczają go o', 'Without a decision they let the thief go at'),
            L(`${godzina(GOSC_ZLAPANY_DO)} rano`, `${godzina(GOSC_ZLAPANY_DO)} in the morning`),
          ),
          fakt(
            'nastawienie',
            L('Nastawienie zapisane w pamięci', 'Attitude written into memory'),
            signed(NASTAWIENIE.zlapany, 0),
          ),
        ],
        zobacz: ['wydarzenia:haczyk', 'wydarzenia:znajomi', 'noc:napad'],
      }),
      'złapany kradzież złodziej thief caught',
    ),

    def(
      'wydarzenia:handlarz',
      'wydarzenia',
      (c) => L(`Handlarz ${c.words.brama.pod}`, `The trader at ${c.e.brama}`),
      (c): Tresc => {
        const t = terminyGry();
        const [odN, doN] = dniOd(t.handlarzN, DZIEN_PRZED);
        const [odZ, doZ] = dniOd(t.handlarzZN, DZIEN_PRZED);
        const zlomowe = BUYS_SCRAP.length - 1;
        return {
          zdania: [
            L(
              `Handlarz z wózkiem staje ${c.words.brama.pod} za dnia i wymienia towar na wasze materiały.`,
              `A trader with a cart stops at ${c.e.brama} by day and swaps goods for your materials.`,
            ),
            L(
              `Pierwsza wizyta wypada w dniu ${zakresN(t.handlarz1.dniOd, t.handlarz1.dniDo)} ${odDoH(t.handlarz1.hOd, t.handlarz1.hDo)}, kolejne co ${zakresN(odN, doN)} dni ${odDoH(t.handlarzN.hOd, t.handlarzN.hDo)}.`,
              `The first visit falls on day ${zakresN(t.handlarz1.dniOd, t.handlarz1.dniDo)} ${odDoH(t.handlarz1.hOd, t.handlarz1.hDo)}, later ones every ${zakresN(odN, doN)} days ${odDoH(t.handlarzN.hOd, t.handlarzN.hDo)}.`,
            ),
            L(
              `Towar jest losowy: zawsze jedna oferta kupująca złom i dwie inne z tabeli, a każdą można przyjąć ${OFFER_TIMES} razy.`,
              `The goods are random: always one offer that buys scrap and two others from the table, and each offer can be taken ${OFFER_TIMES} times.`,
            ),
            L(
              `Wymiana to polecenie z menu przy handlarzu albo jego wózku: ktoś z ${c.words.zarzad.dk} idzie pod ${c.words.brama.b}, targuje się ${czasTickow(HAGGLE_TICKS)} gry i zanosi towar na podwórko.`,
              `A trade is a command from the menu on the trader or his cart: someone from ${c.e.krotko} goes to ${c.e.brama}, haggles for ${czasTickow(HAGGLE_TICKS)} of game time and carries the goods into the yard.`,
            ),
            L(
              `Handlarz czeka najdłużej ${czasTickow(WAIT_TICKS)} gry, nie dłużej niż do ${godzina(LEAVE_HOUR)}, i odchodzi z wózkiem.`,
              `The trader waits ${czasTickow(WAIT_TICKS)} of game time at most, not past ${godzina(LEAVE_HOUR)}, and leaves with his cart.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `handlarz przychodzi rzadziej: pierwszy raz w dniu ${zakresN(t.handlarzZ1.dniOd, t.handlarzZ1.dniDo)}, potem co ${zakresN(odZ, doZ)} dni, zostaje tylko ${czasTickow(WAIT_ZOMBIE)}, a ${proc(TRADER_NOSHOW)} wizyt nie dochodzi do skutku. Gdy szwendacz jest w ${m(ZOMBIE_SCARE_ARRIVE)} od ${c.words.brama.d}, handlarz przychodzi o ${czasTickow(ZOMBIE_DELAY)} później, a gdy podejdzie na ${m(ZOMBIE_SCARE_WAIT)}, odchodzi od razu.`,
            `the trader comes less often: the first time on day ${zakresN(t.handlarzZ1.dniOd, t.handlarzZ1.dniDo)}, then every ${zakresN(odZ, doZ)} days, stays only ${czasTickow(WAIT_ZOMBIE)}, and ${proc(TRADER_NOSHOW)} of the visits never happen. If a shambler is within ${m(ZOMBIE_SCARE_ARRIVE)} of ${c.e.brama}, he comes ${czasTickow(ZOMBIE_DELAY)} later, and if one gets within ${m(ZOMBIE_SCARE_WAIT)}, he leaves at once.`,
          ),
          fakty: [
            fakt(
              'pierwsza',
              L('Pierwsza wizyta', 'First visit'),
              L(
                `dzień ${zakresN(t.handlarz1.dniOd, t.handlarz1.dniDo)}, ${godzina(t.handlarz1.hOd)}–${godzina(t.handlarz1.hDo)}`,
                `day ${zakresN(t.handlarz1.dniOd, t.handlarz1.dniDo)}, ${godzina(t.handlarz1.hOd)}–${godzina(t.handlarz1.hDo)}`,
              ),
            ),
            fakt(
              'kolejne',
              L('Kolejne wizyty', 'Later visits'),
              L(
                `co ${zakresN(odN, doN)} dni, ${godzina(t.handlarzN.hOd)}–${godzina(t.handlarzN.hDo)}`,
                `every ${zakresN(odN, doN)} days, ${godzina(t.handlarzN.hOd)}–${godzina(t.handlarzN.hDo)}`,
              ),
            ),
            fakt(
              'czeka',
              L(`Czeka ${c.words.brama.pod}`, `Waits at ${c.e.brama}`),
              L(
                `${czasTickow(WAIT_TICKS)}, nie dłużej niż do ${godzina(LEAVE_HOUR)}`,
                `${czasTickow(WAIT_TICKS)}, not past ${godzina(LEAVE_HOUR)}`,
              ),
            ),
            fakt('targ', L('Jedna wymiana trwa', 'One trade takes'), czasTickow(HAGGLE_TICKS)),
            fakt(
              'oferty',
              L('Ofert na wizytę', 'Offers per visit'),
              L(`3, każda do ${OFFER_TIMES} razy`, `3, each up to ${OFFER_TIMES} times`),
            ),
            fakt(
              'kupuje-zlom',
              L('Pierwsza oferta (kupuje złom, jedna z trzech)', 'First offer (buys scrap, one of three)'),
              BUYS_SCRAP.map(ofertaTekst).join('; '),
            ),
            fakt(
              'reszta',
              L(
                `Dwie kolejne (z pozostałych ${zlomowe + OTHER.length})`,
                `The next two (of the remaining ${zlomowe + OTHER.length})`,
              ),
              `${OTHER.map(ofertaTekst).join('; ')}; ${L(`albo jedna z ${zlomowe} niewylosowanych ofert na złom`, `or one of the ${zlomowe} scrap offers that were not drawn`)}`,
            ),
            fakt(
              'zombie-pierwsza',
              L('Tryb zombie: pierwsza wizyta', 'Zombie mode: first visit'),
              L(
                `dzień ${zakresN(t.handlarzZ1.dniOd, t.handlarzZ1.dniDo)}, ${godzina(t.handlarzZ1.hOd)}–${godzina(t.handlarzZ1.hDo)}`,
                `day ${zakresN(t.handlarzZ1.dniOd, t.handlarzZ1.dniDo)}, ${godzina(t.handlarzZ1.hOd)}–${godzina(t.handlarzZ1.hDo)}`,
              ),
            ),
            fakt(
              'zombie-kolejne',
              L('Tryb zombie: kolejne wizyty', 'Zombie mode: later visits'),
              L(`co ${zakresN(odZ, doZ)} dni`, `every ${zakresN(odZ, doZ)} days`),
            ),
            fakt('zombie-czeka', L('Tryb zombie: czeka', 'Zombie mode: waits'), czasTickow(WAIT_ZOMBIE)),
            fakt(
              'zombie-nie-dochodzi',
              L('Tryb zombie: wizyta nie dochodzi do skutku', 'Zombie mode: a visit never happens'),
              proc(TRADER_NOSHOW),
            ),
          ],
          jak: [
            polecenie(c, ['handlarzu', 'the trader'], [ofertaTekst(BUYS_SCRAP[0]), ofertaTekst(BUYS_SCRAP[0])]),
            L(
              `Oferta, na którą brakuje materiału, jest wyszarzona i mówi, czego brakuje, np. ${wCyt(L(HANDEL.brakuje({ deski: 2 }).pl, HANDEL.brakuje({ deski: 2 }).en))}.`,
              `An offer you lack the material for is greyed out and says what is missing, e.g. ${wCyt(L(HANDEL.brakuje({ deski: 2 }).pl, HANDEL.brakuje({ deski: 2 }).en))}.`,
            ),
          ],
          zobacz: [
            'wydarzenia:napasc',
            'wydarzenia:wedrowcy',
            'zasob:zlom',
            'zasob:deski',
            'zasob:czesci',
            'zasob:jedzenie',
            'zasob:leki',
          ],
        };
      },
      'handlarz trader merchant wymiana handel barter wózek kupiec',
    ),

    def(
      'wydarzenia:napasc',
      'wydarzenia',
      () => L('Napaść na handlarza albo wędrowca', 'Robbing the trader or a wanderer'),
      (c): Tresc => {
        const w = workWedrowca();
        return {
          zdania: [
            L(
              `Na handlarza i wędrowca można napaść: w menu przy nich są polecenia ${wCyt(HANDEL.napasc.pl)} i ${wCyt(OBCY.napasc.pl)}, a gra prosi o potwierdzenie.`,
              `You can rob the trader and a wanderer: the menu on them has the commands ${wCyt(HANDEL.napasc.en)} and ${wCyt(OBCY.napasc.en)}, and the game asks you to confirm.`,
            ),
            L(
              `Cena idzie od razu: napaść na handlarza to ${nastroj(CENA.handlarz.trust, CENA.handlarz.anger, ' i ')}, na wędrowca ${nastroj(CENA.wedrowiec.trust, CENA.wedrowiec.anger, ' i ')}, a napastnik traci nastrój na dobę, reszta ${c.words.zarzad.dk} trochę mniej.`,
              `The price is paid at once: robbing the trader means ${nastroj(CENA.handlarz.trust, CENA.handlarz.anger, ' and ')}, a wanderer ${nastroj(CENA.wedrowiec.trust, CENA.wedrowiec.anger, ' and ')}, and the attacker’s mood drops for a day, the rest of ${c.e.krotko} a little less.`,
            ),
            L(
              `Napadnięty handlarz rzuca wózek i walczy siekierą (${TRADER_HP} życia), poniżej ${TRADER_FLEE} życia ucieka, a jego towar zostaje na ziemi za siatką.`,
              `The robbed trader drops his cart and fights with an axe (${TRADER_HP} health), runs below ${TRADER_FLEE} health, and his goods stay on the ground outside the fence.`,
            ),
            L(
              `Wędrowiec po ciosie upuszcza worek z ${zakresN(w.jedzenieOd, w.jedzenieDo)} porcjami jedzenia, czasem z częścią albo lekiem, i ucieka.`,
              `A wanderer drops a sack with ${zakresN(w.jedzenieOd, w.jedzenieDo)} portions of food after the blow, sometimes with a part or a medicine, and runs.`,
            ),
            L(
              `Handlarz, który przeżyje, roznosi wieść: zła sława rośnie o poziom (najwyżej ${SLAWA_MAX}), a z szansą ${proc(REVENGE_CHANCE)} wracają jego ludzie z pałkami.`,
              `A trader who survives spreads the word: the bad reputation rises a level (${SLAWA_MAX} at most), and with a ${proc(REVENGE_CHANCE)} chance his men come back with clubs.`,
            ),
          ],
          fakty: [
            fakt(
              'cena-handlarz',
              L('Napaść na handlarza', 'Robbing the trader'),
              nastroj(CENA.handlarz.trust, CENA.handlarz.anger),
            ),
            fakt(
              'cena-wedrowiec',
              L('Napaść na wędrowca', 'Robbing a wanderer'),
              nastroj(CENA.wedrowiec.trust, CENA.wedrowiec.anger),
            ),
            fakt(
              'nastroj-handlarz',
              L('Nastrój po napaści na handlarza (na dobę)', 'Mood after robbing the trader (for a day)'),
              L(
                `napastnik ${signed(ROB_MOOD, 0)}, reszta ${signed(ROB_MOOD_OTHERS, 0)}`,
                `the attacker ${signed(ROB_MOOD, 0)}, the others ${signed(ROB_MOOD_OTHERS, 0)}`,
              ),
            ),
            fakt(
              'nastroj-wedrowiec',
              L('Nastrój po napaści na wędrowca (na dobę)', 'Mood after robbing a wanderer (for a day)'),
              L(
                `napastnik ${signed(MUG_MOOD, 0)}, reszta ${signed(MUG_MOOD_OTHERS, 0)}`,
                `the attacker ${signed(MUG_MOOD, 0)}, the others ${signed(MUG_MOOD_OTHERS, 0)}`,
              ),
            ),
            fakt(
              'handlarz-walka',
              L('Handlarz w walce', 'The trader in a fight'),
              L(
                `${TRADER_HP} życia, ucieka poniżej ${TRADER_FLEE}, bez przeciwnika przez ${czasTickow(CALM_TICKS)} odchodzi`,
                `${TRADER_HP} health, runs below ${TRADER_FLEE}, leaves after ${czasTickow(CALM_TICKS)} with no one to fight`,
              ),
            ),
            fakt(
              'slawa',
              L('Zła sława po przeżytej napaści', 'Bad reputation after a survived robbery'),
              L(
                `poziom +1 (najwyżej ${SLAWA_MAX}): ceny razy 1 + 0,5 na poziom, wizyty rzadsze o ${SLAWA_EXTRA_DAYS} dni na poziom, spadek o poziom co ${SLAWA_DAYS} dni`,
                `level +1 (${SLAWA_MAX} at most): prices times 1 + 0.5 per level, visits ${SLAWA_EXTRA_DAYS} days rarer per level, one level lost every ${SLAWA_DAYS} days`,
              ),
            ),
            fakt(
              'zemsta',
              L('Ludzie handlarza', 'The trader’s men'),
              L(
                `szansa ${proc(REVENGE_CHANCE)}, 3–4 osoby z pałkami w nocy 22:00–1:00, ${ZBIR_HP} życia, uciekają poniżej ${ZBIR_FLEE}, stoją pod siatką do ${godzina(ZBIR_LEAVE_HOUR)}, najwyżej ${czasTickow(ZBIR_STAY)}`,
                `${proc(REVENGE_CHANCE)} chance, 3–4 people with clubs at night 22:00–1:00, ${ZBIR_HP} health, they run below ${ZBIR_FLEE}, they stand at the fence until ${godzina(ZBIR_LEAVE_HOUR)}, ${czasTickow(ZBIR_STAY)} at most`,
              ),
            ),
            fakt(
              'zabity',
              L('Zabity handlarz', 'A dead trader'),
              L(
                `nowy przejmuje trasę po ${KILL_DELAY_DAYS} dniach, a wieści nikt nie roznosi`,
                `a new one takes over the route after ${KILL_DELAY_DAYS} days, and nobody spreads the word`,
              ),
            ),
            fakt(
              'goscie',
              L('Szansa na gościa', 'Chance of a guest'),
              L(
                `każda napaść odbiera ${proc(1 - wagaGoscia({ napady: 1 }))}, najniżej ${proc(MIN_WAGA_GOSCIA)}`,
                `every robbery takes ${proc(1 - wagaGoscia({ napady: 1 }))}, ${proc(MIN_WAGA_GOSCIA)} at the lowest`,
              ),
            ),
            fakt(
              'werbunek',
              L('Zaproszenie wędrowca po napaści', 'Inviting a wanderer after a robbery'),
              L(`trudniejsze przez ${czasTickow(NAPAD_PAMIEC)}`, `harder for ${czasTickow(NAPAD_PAMIEC)}`),
            ),
          ],
          jak: [
            polecenie(c, ['handlarzu', 'the trader'], [HANDEL.napasc.pl, HANDEL.napasc.en]),
            L(
              'Gra poprosi o potwierdzenie; po napaści pozostaje już tylko walka albo pościg.',
              'The game asks you to confirm; after the robbery all that is left is a fight or a chase.',
            ),
          ],
          zobacz: ['wydarzenia:handlarz', 'wydarzenia:wedrowcy', 'wydarzenia:werbunek', 'wydarzenia:goscie'],
        };
      },
      'napaść rob mug handlarz wędrowiec zła sława zemsta reputation revenge',
    ),

    def(
      'wydarzenia:wedrowcy',
      'wydarzenia',
      () => L('Wędrowcy i obce ekipy', 'Wanderers and strange crews'),
      (c): Tresc => {
        const t = terminyGry();
        const [eod, edo] = dniOd(t.ekipaN, DZIEN_PRZED);
        const [ezod, ezdo] = dniOd(t.ekipaZN, DZIEN_PRZED);
        const ctx = { traderIn: 1, wrecksLeft: 3 };
        const wiesc = (k: number) => gossipText(k, ctx, 0);
        return {
          zdania: [
            L(
              `Za dnia ulicą idzie wędrowiec i przystaje przy siatce na ${zakresMin(PAUSE_MIN, PAUSE_MAX)}; pierwszy przychodzi w dniu ${zakresN(t.wedrowiec1.dniOd, t.wedrowiec1.dniDo)} ${odDoH(t.wedrowiec1.hOd, t.wedrowiec1.hDo)}, potem co ${zakresN(t.wedrowiecN.od, t.wedrowiecN.do)} godzin.`,
              `By day a wanderer walks down the street and stops by the fence for ${zakresMin(PAUSE_MIN, PAUSE_MAX)}; the first comes on day ${zakresN(t.wedrowiec1.dniOd, t.wedrowiec1.dniDo)} ${odDoH(t.wedrowiec1.hOd, t.wedrowiec1.hDo)}, then one every ${zakresN(t.wedrowiecN.od, t.wedrowiecN.do)} hours.`,
            ),
            L(
              `Można go zagadać: ktoś z ${c.words.zarzad.dk} idzie na podwórko, rozmawia przez siatkę ${czasTickow(TALK_TICKS)} i poprawia sobie nastrój o ${TALK_MOOD} na ${czasTickow(TALK_MOOD_TICKS)}.`,
              `You can talk to him: someone from ${c.e.krotko} goes into the yard, talks through the fence for ${czasTickow(TALK_TICKS)} and gets a mood boost of ${TALK_MOOD} for ${czasTickow(TALK_MOOD_TICKS)}.`,
            ),
            L(
              'Z rozmowy wraca wieść (kiedy będzie handlarz, ile aut nikt nie przeszukał, że chodzą ludzie z łomami albo ogłoszenie ze słupa) i to, kim jest wędrowiec.',
              'The talk brings back news (when the trader is due, how many cars nobody has searched, that people with crowbars are about, or a notice from a pole) and who the wanderer is.',
            ),
            L(
              `Po rozmowie wędrowiec czeka przy siatce jeszcze ${czasTickow(PO_ROZMOWIE)} gry, a w tym czasie można go zaprosić do siebie albo na niego napaść.`,
              `After the talk the wanderer waits by the fence for another ${czasTickow(PO_ROZMOWIE)} of game time, and in that time you can invite him in or rob him.`,
            ),
            L(
              `Osobno chodzą obce ekipy: dwie osoby z łomami przeszukują wrak przy ulicy dwa razy dłużej niż wy i zabierają z niego łup, chyba że ich przegonicie poleceniem ${wCyt(L(OBCY.przegonic.pl, OBCY.przegonic.en))}.`,
              `Strange crews walk separately: two people with crowbars search a wreck by the road twice as long as you would and take its loot, unless you chase them off with ${wCyt(L(OBCY.przegonic.pl, OBCY.przegonic.en))}.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `zamiast wędrowców przychodzą ocaleni, rzadziej (co ${zakresN(t.wedrowiecZN.od, t.wedrowiecZN.do)} godzin) i na krótko (${zakresMin(PAUSE_ZOMBIE_MIN, PAUSE_ZOMBIE_MAX)}), uciekają przed szwendaczem w ${m(SPOOK_R)}, a zamiast ogłoszeń dają jedną z ${RADY.length} rad o hałasie, trzymaniu zamkniętej ${c.words.brama.d}, amputacji i dobijaniu zmarłych; ekipy przychodzą co ${zakresN(ezod, ezdo)} dni.`,
            `survivors come instead of wanderers, less often (every ${zakresN(t.wedrowiecZN.od, t.wedrowiecZN.do)} hours) and briefly (${zakresMin(PAUSE_ZOMBIE_MIN, PAUSE_ZOMBIE_MAX)}), they run from a shambler within ${m(SPOOK_R)}, and instead of notices they give one of ${RADY.length} pieces of advice about noise, keeping ${c.e.brama} shut, amputation and finishing off the dead; crews come every ${zakresN(ezod, ezdo)} days.`,
          ),
          fakty: [
            fakt(
              'pierwszy',
              L('Pierwszy wędrowiec', 'First wanderer'),
              L(
                `dzień ${zakresN(t.wedrowiec1.dniOd, t.wedrowiec1.dniDo)}, ${godzina(t.wedrowiec1.hOd)}–${godzina(t.wedrowiec1.hDo)}`,
                `day ${zakresN(t.wedrowiec1.dniOd, t.wedrowiec1.dniDo)}, ${godzina(t.wedrowiec1.hOd)}–${godzina(t.wedrowiec1.hDo)}`,
              ),
            ),
            fakt(
              'odstep',
              L('Następny po poprzednim', 'The next one after the previous'),
              L(
                `${zakresN(t.wedrowiecN.od, t.wedrowiecN.do)} godzin`,
                `${zakresN(t.wedrowiecN.od, t.wedrowiecN.do)} hours`,
              ),
            ),
            fakt('przystaje', L('Przystaje przy siatce', 'Stops by the fence'), zakresMin(PAUSE_MIN, PAUSE_MAX)),
            fakt('rozmowa', L('Rozmowa przez siatkę', 'Talk through the fence'), czasTickow(TALK_TICKS)),
            fakt(
              'humor',
              L('Nastrój po rozmowie', 'Mood after the talk'),
              L(`+${TALK_MOOD} na ${czasTickow(TALK_MOOD_TICKS)}`, `+${TALK_MOOD} for ${czasTickow(TALK_MOOD_TICKS)}`),
            ),
            fakt('po-rozmowie', L('Czeka po rozmowie', 'Waits after the talk'), czasTickow(PO_ROZMOWIE)),
            fakt('wiesc-handlarz', L('Wieść o handlarzu', 'News of the trader'), L(wiesc(0).pl, wiesc(0).en)),
            fakt('wiesc-auta', L('Wieść o autach', 'News of the cars'), L(wiesc(1).pl, wiesc(1).en)),
            fakt(
              'wiesc-lomy',
              L('Wieść o ludziach z łomami', 'News of people with crowbars'),
              L(wiesc(2).pl, wiesc(2).en),
            ),
            fakt(
              'ekipa-pierwsza',
              L('Pierwsza ekipa', 'First crew'),
              L(
                `dzień ${zakresN(t.ekipa1.dniOd, t.ekipa1.dniDo)}, ${godzina(t.ekipa1.hOd)}–${godzina(t.ekipa1.hDo)}`,
                `day ${zakresN(t.ekipa1.dniOd, t.ekipa1.dniDo)}, ${godzina(t.ekipa1.hOd)}–${godzina(t.ekipa1.hDo)}`,
              ),
            ),
            fakt(
              'ekipa-kolejna',
              L('Kolejne ekipy', 'Later crews'),
              L(`co ${zakresN(eod, edo)} dni`, `every ${zakresN(eod, edo)} days`),
            ),
            fakt('ekipa-wrak', L('Ekipa przeszukuje wrak', 'A crew searches a wreck'), czasTickow(CREW_SEARCH_TICKS)),
            fakt(
              'przegonic',
              L('Aby przegonić ekipę, trzeba podejść na', 'To chase a crew off you have to get within'),
              m(SHOO_REACH),
            ),
          ],
          jak: [
            polecenie(c, ['wędrowcu', 'the wanderer'], [OBCY.zagadac.pl, OBCY.zagadac.en]),
            polecenie(c, ['obcych', 'the strangers'], [OBCY.przegonic.pl, OBCY.przegonic.en]),
          ],
          zobacz: ['wydarzenia:werbunek', 'wydarzenia:napasc', 'wydarzenia:handlarz', 'zasob:wraki', 'zombie:halas'],
        };
      },
      'wędrowiec wanderer ekipa crew ocalały survivor rozmowa wieść gossip wrak',
    ),

    def(
      'wydarzenia:werbunek',
      'wydarzenia',
      () => L('Zapraszanie wędrowców', 'Inviting wanderers to stay'),
      (c): Tresc => {
        const s = liczbySzansy();
        const dom = c.dom;
        return {
          zdania: [
            L(
              `Gdy wędrowiec po rozmowie wciąż stoi przy siatce, w menu pojawia się ${wCyt(OBCY.zaprosicBez.pl)} z szansą w procentach, a w trybie zombie najpierw ${wCyt(OBCY.zapytacORege.pl)}.`,
              `While the wanderer still stands by the fence after the talk, the menu shows ${wCyt(OBCY.zaprosicBez.en)} with the chance in percent, and in Zombie mode ${wCyt(OBCY.zapytacORege.en)} first.`,
            ),
            L(
              `Szansa to ${s.baza}%, plus ${s.jedzenie} punktów przy co najmniej ${num(s.prog, 0)} porcjach jedzenia na osobę z ${c.words.zarzad.dk}, plus ${s.lozko} przy wolnym łóżku, minus ${s.napad} po napaści w ostatnich ${Math.round(NAPAD_PAMIEC / 800 / 24)} dobach.`,
              `The chance is ${s.baza}%, plus ${s.jedzenie} points with at least ${num(s.prog, 0)} portions of food per person on ${c.e.krotko}, plus ${s.lozko} with a free bed, minus ${s.napad} after a robbery in the last ${Math.round(NAPAD_PAMIEC / 800 / 24)} days.`,
            ),
            dom
              ? L(
                  `Zaproszony dołącza do ${c.words.zarzad.dk}, gdy jest tam miejsce (najwyżej ${ZARZAD_MAX} osób), a gdy ${c.words.zarzad.krotko} jest pełny, zaproszenia nie ma wcale.`,
                  `The invited one joins ${c.e.krotko} when there is room (${ZARZAD_MAX} people at most), and when ${c.e.krotko} is full there is no invitation at all.`,
                )
              : L(
                  `Zaproszony dołącza do ${c.words.zarzad.dk}, gdy jest tam miejsce (najwyżej ${ZARZAD_MAX} osób), a gdy ${c.words.zarzad.krotko} jest pełny, zostaje mieszkańcem, o ile jest wolne łóżko; inaczej odpowiedź jest wyszarzona.`,
                  `The invited one joins ${c.e.krotko} when there is room (${ZARZAD_MAX} people at most), and when ${c.e.krotko} is full they become a resident if there is a free bed; otherwise the answer is greyed out.`,
                ),
            L(
              `Nieudane zaproszenie nic nie kosztuje: wędrowiec dziękuje i idzie dalej, a przyjęty do ${c.words.zarzad.dk} poprawia reszcie nastrój o ${NOWY_MOOD} na ${czasTickow(NOWY_MOOD_TICKS)}.`,
              `A failed invitation costs nothing: the wanderer thanks you and moves on, and someone who joins ${c.e.krotko} lifts everyone else’s mood by ${NOWY_MOOD} for ${czasTickow(NOWY_MOOD_TICKS)}.`,
            ),
            L(
              `Rozmowa mówi, kim jest wędrowiec (imię, zawód, wiek), a część z nich idzie do rodziny i ma o połowę mniejszą szansę, że zostanie; samo zaproszenie trwa ${czasTickow(ZAPROS_TICKS)}.`,
              `The talk tells you who the wanderer is (name, trade, age), and some of them are heading to family and are half as likely to stay; the invitation itself takes ${czasTickow(ZAPROS_TICKS)}.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `przed zaproszeniem można raz wybrać ${wCyt(OBCY.zapytacORege.pl)}: zdrowy podwija rękaw, a ukryty ugryziony odmawia i odchodzi; ${proc(UKRYTY_UGRYZIONY)} ocalałych ukrywa ugryzienie, a przyjęty bez pytania zaczyna z gorączką.`,
            `you can pick ${wCyt(OBCY.zapytacORege.en)} once before inviting: a healthy one rolls up a sleeve, and a hidden bitten one refuses and walks away; ${proc(UKRYTY_UGRYZIONY)} of survivors hide a bite, and one taken in without asking starts with a fever.`,
          ),
          fakty: [
            fakt('szansa-baza', L('Szansa zaproszenia, baza', 'Invitation chance, base'), `${s.baza}%`),
            fakt(
              'szansa-jedzenie',
              L(`Jedzenie na osobę z ${c.words.zarzad.dk}`, `Food per person on ${c.e.krotko}`),
              L(
                `+${s.jedzenie} punktów od ${num(s.prog, 0)} porcji`,
                `+${s.jedzenie} points from ${num(s.prog, 0)} portions`,
              ),
            ),
            fakt('szansa-lozko', L('Wolne łóżko', 'A free bed'), L(`+${s.lozko} punktów`, `+${s.lozko} points`)),
            fakt(
              'szansa-napad',
              L('Napaść w ostatnich dwóch dobach', 'A robbery in the last two days'),
              L(`−${s.napad} punktów`, `−${s.napad} points`),
            ),
            fakt('szansa-zakres', L('Szansa w granicach', 'The chance stays between'), `${s.min}–${s.max}%`),
            fakt(
              'szansa-cel',
              L('Wędrowiec idzie do rodziny', 'The wanderer is heading to family'),
              L(`połowa, czyli ${s.cel[0]}–${s.cel[1]}%`, `half, so ${s.cel[0]}–${s.cel[1]}%`),
            ),
            fakt('zarzad-max', L(`Pojemność ${c.words.zarzad.dk}`, `Capacity of ${c.e.krotko}`), num(ZARZAD_MAX, 0)),
            fakt('zaproszenie', L('Zaproszenie trwa', 'An invitation takes'), czasTickow(ZAPROS_TICKS)),
            fakt(
              'nowy-humor',
              L(`Przyjęty do ${c.words.zarzad.dk}: nastrój reszty`, `Joins ${c.e.krotko}: everyone else’s mood`),
              L(`+${NOWY_MOOD} na ${czasTickow(NOWY_MOOD_TICKS)}`, `+${NOWY_MOOD} for ${czasTickow(NOWY_MOOD_TICKS)}`),
            ),
          ],
          jak: [
            polecenie(
              c,
              ['wędrowcu po rozmowie', 'a wanderer after the talk'],
              [OBCY.zaprosicBez.pl, OBCY.zaprosicBez.en],
            ),
          ],
          zobacz: ['wydarzenia:wedrowcy', 'wydarzenia:napasc', 'zasob:jedzenie', 'potrzeba:food'],
        };
      },
      'werbunek zaprosić zaproszenie recruit invite wędrowiec ręka arm',
    ),

    def(
      'wydarzenia:lancuchy',
      'wydarzenia',
      () => L('Ciągi dalsze kart', 'Story chains'),
      (c): Tresc => {
        const n = liczbyCiagow();
        return {
          zdania: [
            L(
              'Niektóre karty mają ciąg dalszy: wasza odpowiedź zostawia ślad, a po kilku godzinach gry przychodzi kolejna karta w tej samej sprawie.',
              'Some cards have a sequel: your answer leaves a trace, and a few game hours later another card on the same matter arrives.',
            ),
            L(
              `Takich opowieści jest ${n.razem}, a w jednej grze toczy się najwyżej ${WATKOW}, wybrane na początku z ziarna gry.`,
              `There are ${n.razem} such stories, and a single game runs at most ${WATKOW} of them, picked at the start from the game seed.`,
            ),
            L(
              `Każda ma ${odDoN(n.kartMin, n.kartMax)} karty; następna czeka co najmniej tyle godzin gry, ile zapisano przy niej (od ${n.poMin} do ${n.poMax}), a gdy dojrzeje, wypada przed zwykłą pulą z szansą ${proc(SZANSA_KROKU)}.`,
              `Each has ${odDoN(n.kartMin, n.kartMax)} cards; the next one waits at least as many game hours as are set for it (from ${n.poMin} to ${n.poMax}), and when it is ripe it jumps ahead of the ordinary pool with a ${proc(SZANSA_KROKU)} chance.`,
            ),
            L(
              `Część opowieści potrzebuje obcych ${c.words.brama.pod} albo prawdziwych ludzi, którzy mieszkają w siedzibie, więc w grze bez nich się nie zaczyna.`,
              `Some stories need strangers at ${c.e.brama} or real people who live in your seat, so they do not start in a game without them.`,
            ),
            L(
              'Treści nie zdradzamy: o tym, co się stanie, przekonacie się z kart, a gra zapisana przed pojawieniem się ciągów toczy się dalej bez nich.',
              'We do not give the plots away: you will find out from the cards, and a game saved before chains existed carries on without them.',
            ),
          ],
          uwaga: c.zombie
            ? L(
                `Grasz w trybie zombie: do wyboru jest ${n.zombie} opowieści, z czego ${n.wspolne} wspólnych ze zwykłym trybem.`,
                `You are playing Zombie mode: there are ${n.zombie} stories to pick from, ${n.wspolne} of them shared with the normal mode.`,
              )
            : L(
                `Grasz w trybie zwykłym: do wyboru jest ${n.zwykly} opowieści, z czego ${n.wspolne} wspólnych z trybem zombie.`,
                `You are playing the normal mode: there are ${n.zwykly} stories to pick from, ${n.wspolne} of them shared with Zombie mode.`,
              ),
          fakty: [
            fakt('ile', L('Opowieści w grze', 'Stories in the game'), num(n.razem, 0)),
            fakt('na-gre', L('W jednej grze najwyżej', 'In one game at most'), num(WATKOW, 0)),
            fakt('kart', L('Kart w opowieści', 'Cards in a story'), zakresN(n.kartMin, n.kartMax)),
            fakt(
              'odstep',
              L('Odstęp do następnej karty', 'Gap to the next card'),
              L(`${n.poMin}–${n.poMax} h gry`, `${n.poMin}–${n.poMax} game hours`),
            ),
            fakt(
              'szansa',
              L('Szansa dojrzałej karty przed zwykłą pulą', 'Chance of a ripe card ahead of the pool'),
              proc(SZANSA_KROKU),
            ),
            fakt('zwykly', L('Opowieści w trybie zwykłym', 'Stories in the normal mode'), num(n.zwykly, 0)),
            fakt('zombie', L('Opowieści w trybie zombie', 'Stories in Zombie mode'), num(n.zombie, 0)),
            fakt('wspolne', L('Wspólne dla obu trybów', 'Shared by both modes'), num(n.wspolne, 0)),
          ],
          zobacz: ['wydarzenia:karty', 'wydarzenia:goscie', 'wydarzenia:handlarz'],
        };
      },
      'ciągi łańcuchy wątki chain storyline sezon opowieść',
    ),

    def(
      'wydarzenia:znajomi',
      'wydarzenia',
      () => L('Znajome twarze', 'Familiar faces'),
      (c): Tresc => {
        const worek = workPowrotu();
        return {
          zdania: [
            L(
              `${wielka(c.words.zarzad.krotko)} pamięta każdego, o kim zdecydował ${c.words.brama.pod}: nakarmionego, wpuszczonego, przyjętego, odprawionego, okradającego i złapanego, a także ${c.dom ? 'sąsiada' : 'mieszkańca'} wyrzuconego przez ${c.words.brama.b}.`,
              `${wielka(c.e.krotko)} remembers everyone it has decided on at ${c.e.brama}: fed, let in, taken in, sent away, stealing or caught, and a ${c.dom ? 'neighbour' : 'resident'} thrown out through ${c.e.brama}.`,
            ),
            L(
              `Każda decyzja zmienia nastawienie w granicach od ${signed(-2, 0)} do ${signed(2, 0)}: nakarmienie i nocleg dają ${signed(NASTAWIENIE.nakarmiony, 0)}, przyjęcie ${signed(NASTAWIENIE.przyjety, 0)}, kradzież ${signed(NASTAWIENIE.okradl, 0)}, a złapanie i wyrzucenie ustawiają od razu ${signed(NASTAWIENIE.zlapany, 0)}.`,
              `Every decision shifts the attitude between ${signed(-2, 0)} and ${signed(2, 0)}: feeding and a night’s shelter give ${signed(NASTAWIENIE.nakarmiony, 0)}, taking in ${signed(NASTAWIENIE.przyjety, 0)}, stealing ${signed(NASTAWIENIE.okradl, 0)}, and getting caught or thrown out sets ${signed(NASTAWIENIE.zlapany, 0)} at once.`,
            ),
            L(
              `Kto zostawił dobre wspomnienie, wraca po co najmniej ${POWROT_WIEK_DNI} dobach jako „[imię] znowu ${c.words.brama.pod}”, ale najwyżej jeden powrót na ${POWROT_ODSTEP_DNI} doby i nigdy ktoś, kto mieszka u was albo nie żyje.`,
              `Someone who left a good memory comes back after at least ${POWROT_WIEK_DNI} days as “[name] is back at ${c.e.brama}”, but at most one return every ${POWROT_ODSTEP_DNI} days and never someone who lives with you or is dead.`,
            ),
            L(
              `Wracający przynosi dar: worek ${odDoN(worek.od, worek.do)} porcji jedzenia, wiadomość o miejscu na mapie albo rodzeństwo, które prosi o przyjęcie.`,
              `A returning visitor brings a gift: a sack of ${odDoN(worek.od, worek.do)} portions of food, news of a place on the map, or a sibling who asks to be taken in.`,
            ),
            L(
              'Ci o złym nastawieniu nie wracają jako goście, a w zwykłym trybie jeden z nich idzie z szabrownikami na najbliższy napad.',
              'Those with a bad attitude do not come back as guests, and in the normal mode one of them goes along with the looters on the next raid.',
            ),
          ],
          uwaga: uwagaZombie(
            c,
            'powroty działają tak samo, ale znajomi o złym nastawieniu nie wracają ani nie dołączają do niczego, bo napadów szabrowników nie ma.',
            'returns work the same, but familiar faces with a bad attitude neither come back nor join anything, because there are no looter raids.',
          ),
          fakty: [
            ...(Object.keys(NASTAWIENIE) as (keyof typeof NASTAWIENIE)[]).map((jak) =>
              fakt(
                `nastawienie-${jak}`,
                opisJak(jak, c),
                jak === 'odprawiony'
                  ? L(
                      `${signed(NASTAWIENIE[jak], 0)} (${signed(ODMOWA, 0)}, gdy prosił o jedzenie, a zapasów jest ponad ${ZAPAS_ODMOWY})`,
                      `${signed(NASTAWIENIE[jak], 0)} (${signed(ODMOWA, 0)} if they asked for food and the stores hold more than ${ZAPAS_ODMOWY})`,
                    )
                  : signed(NASTAWIENIE[jak], 0),
              ),
            ),
            fakt(
              'powrot-wiek',
              L('Powrót najwcześniej po', 'A return comes no sooner than'),
              L(`${POWROT_WIEK_DNI} dobach od ostatniego spotkania`, `${POWROT_WIEK_DNI} days after the last meeting`),
            ),
            fakt(
              'powrot-odstep',
              L('Najwyżej jeden powrót na', 'At most one return in'),
              L(`${POWROT_ODSTEP_DNI} doby`, `${POWROT_ODSTEP_DNI} days`),
            ),
            fakt(
              'powrot-waga',
              L('Waga powrotu w losowaniu kart', 'Weight of a return in the card draw'),
              num(WAGA_POWROTU, 1),
            ),
            fakt(
              'dar-jedzenie',
              L('Worek jedzenia od wracającego', 'A sack of food from a returning visitor'),
              L(
                `${zakresN(worek.od, worek.do)} porcje, rano w zapasach`,
                `${zakresN(worek.od, worek.do)} portions, in the stores in the morning`,
              ),
            ),
          ],
          zobacz: ['wydarzenia:goscie', 'wydarzenia:zlapany', 'noc:napad'],
        };
      },
      'znajomi powrót pamięć nastawienie return memory attitude',
    ),
  ];
}

// ---------------------------------------------------------------- minuty

/** zakres minut z dwóch wartości w tickach: „20–40 min” */
function zakresMin(a: number, b: number): string {
  const x = Math.round((a / TICKS_PER_HOUR) * 60);
  const y = Math.round((b / TICKS_PER_HOUR) * 60);
  return `${num(x, 0)}–${num(y, 0)}${NB}min`;
}
