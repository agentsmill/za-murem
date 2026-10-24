/* Wiki w grze, kategoria „Ludzie”: zarząd i mieszkańcy, karta osoby, sześć potrzeb (`potrzeba:<klucz z Needs>`), umiejętności,
   cechy, sen, rany i chwilowe nastroje; broń i walka są w src/ui/wiki-bron.ts (ta sama kategoria). Liczby potrzeb (spadek na
   godzinę, progi, wagi nastroju, cele bezpieczeństwa) wiki odczytuje z samych funkcji gry przez sondy (`stawka`, `granica`,
   `progiZdrowia`, `progiKarty`, `safeTarget`, `moodOf`; src/ui/wiki-sondy.ts), a stałe z eksportów (`HUNGRY`, `COLD`, `MEAL`,
   `FLOOR_MOOD`…), więc zmiana w grze zmienia i wiki. Skutki cech i umiejętności liczą te same funkcje, których używa gra
   (`tempoOsoby`, `guardValue`, `expRisk`, `dailyDrift`, `hitChance`, `szansaUspokojenia`). Ręcznie wpisane są tylko liczby,
   których gra nie eksportuje (kary za śmierć w src/gov/zarzad.ts, wartości chwilowych nastrojów w src/sim/sim.ts, szansa
   amputacji, próg znacznika rany na liście ludzi): przypina je tests/unit/wiki-ludzie.test.ts do tekstu źródeł. */

import { DOM_EN, TRAITS_EN } from '../content/data.en.ts';
import { DOM, type Dom, TECH_DOMS, type TechDom, TRAITS } from '../content/data.ts';
import { OSOB_DOMYSLNIE, OSOB_MAX, OSOB_MIN } from '../content/druzyna.ts';
import { nastrojEn } from '../content/nastroje.en.ts';
import { L } from '../core/jezyk.ts';
import { expRisk, guardValue } from '../gov/noc.ts';
import type { GovPerson } from '../gov/typy.ts';
import { dailyDrift, lawEffects } from '../gov/uchwaly.ts';
import { AMBU_TEMPO, tempoOsoby } from '../sim/badania.ts';
import { hitChance, WEAPONS } from '../sim/bron.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../sim/clock.ts';
import {
  COLD,
  COMFORT,
  HUNGRY,
  moodOf,
  NEED_LABELS,
  NEED_LABELS_EN,
  type Needs,
  PECKISH,
  REST_START,
  safeTarget,
  stepNeeds,
  TIRED,
  WARMED,
} from '../sim/needs.ts';
import { RODZAJE, TEMPO_KROK, ZARZAD_MAX } from '../sim/praca.ts';
import { szansaUspokojenia } from '../sim/sasiedzi.ts';
import {
  AMPUTATE_TICKS,
  AMPUTATE_WINDOW,
  BITE_INFECT,
  COLD_MEAL,
  FEVER_TICKS,
  FLOOR_MOOD,
  hungerRate,
  LIMB,
  MEAL,
  RATION_HUNGRY,
  RATION_MEALS,
  REST_UNTIL,
  STARVING,
} from '../sim/sim.ts';
import { NOWY_MOOD, NOWY_MOOD_TICKS, TALK_MOOD, TALK_MOOD_TICKS } from '../sim/wedrowcy.ts';
import { buildName } from './budowa.ts';
import { needLevel } from './karta.ts';
import { deg, num, signed } from './tekst.ts';
import { przyspiesza, rodzajNazwa, UMIEJETNOSCI } from './wiki-praca.ts';
import { czasTickow, godz, listaI, polecenie, proc } from './wiki-slowa.ts';
import {
  karaNastroju,
  leniwie,
  odKtorej,
  progiKarty,
  progiZdrowia,
  sondaOsoba,
  sondaStan,
  sondaStanZUchwalami,
  sondaWejscie,
  stawka,
} from './wiki-sondy.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';
import { mebelNazwa } from './wiki-zasoby.ts';

/** nazwa potrzeby, dziedziny i cechy w bieżącym języku */
export const potrzebaNazwa = (k: keyof Needs): string => L(NEED_LABELS[k], NEED_LABELS_EN[k]);
export const domNazwa = (d: Dom): string => L(DOM[d], DOM_EN[d]);
export const cechaNazwa = (t: string): string => L(TRAITS[t].name, TRAITS_EN[t].name);

/** zmiana w punktach na godzinę z jednostką: „−4 na godzinę”, „+12 na godzinę” */
const naGodz = (v: number): string => {
  const s = signed(v);
  return L(`${s} na godzinę`, `${s} per hour`);
};

/** zmiana mnożnika jako procent: 1,1 → „+10%”, 0,7 → „−30%” */
const zmianaProc = (mnoznik: number): string => `${signed(Math.round((mnoznik - 1) * 100), 0)}%`;

const H = TICKS_PER_HOUR;

// ---------------------------------------------------------------- liczby z funkcji gry

/** progi paska potrzeby na karcie osoby: czerwony poniżej `zle`, żółty poniżej `uwaga` (z `needLevel`) */
export const progiPaska = leniwie(() => ({
  zle: odKtorej((v) => needLevel(v) !== 'bad'),
  uwaga: odKtorej((v) => needLevel(v) === 'ok'),
}));

/** wagi potrzeb w nastroju: ile punktów nastroju daje punkt potrzeby (z `moodOf`) */
export const wagiNastroju = leniwie(() => {
  const wagi = {} as Record<Exclude<keyof Needs, 'mood'>, number>;
  for (const k of ['food', 'warm', 'rest', 'health', 'safe'] as const) {
    const a: Needs = { food: 50, warm: 50, rest: 50, health: 50, safe: 50, mood: 0 };
    wagi[k] = (moodOf({ ...a, [k]: 100 }) - moodOf(a)) / 50;
  }
  return wagi;
});

const zdrowie = leniwie(progiZdrowia);
const karta = leniwie(progiKarty);
const kara = leniwie(karaNastroju);

/** o ile punktów na godzinę zdrowie spada przy danym niedoborze i o ile rośnie, gdy niczego nie brakuje (z `stepNeeds`) */
const stawkaZdrowia = leniwie(() => ({
  zimno: stawka('health', { temp: -10 }, { warm: 0, food: 100, rest: 100, health: 80 }),
  glod: stawka('health', {}, { food: 5, warm: 100, rest: 100, health: 80 }),
  zmeczenie: stawka('health', {}, { rest: 5, warm: 100, food: 100, health: 80 }),
  powrot: stawka('health', {}, { warm: 100, food: 100, rest: 100, health: 50 }),
}));

/** O ile racje przyspieszają ubywanie najedzenia (`hungerRate` od mnożnika porcji z uchwały, `lawEffects`). */
const glodRacji = (): number => hungerRate(lawEffects(sondaStanZUchwalami('u_racje')).foodMult) - 1;

/** Cele bezpieczeństwa w typowych miejscach i jego zmiany od dziur, obcych i napadu (z `safeTarget`), oraz stała czasowa
    dochodzenia do celu (z krótkiego kroku `stepNeeds`). */
const bezpieczenstwo = leniwie(() => {
  const baza = { temp: 20, fire: false, asleep: false, busy: false, dark: false, inside: true, company: 2 };
  const dzien = { ...baza, inside: false };
  const krok = 1e-6;
  const n: Needs = { food: 100, warm: 100, rest: 100, health: 100, safe: 0, mood: 100 };
  stepNeeds(n, baza, krok);
  return {
    dach: safeTarget(baza),
    dwor: safeTarget({ ...baza, dark: true, inside: false, company: 0 }),
    warta: safeTarget({ ...baza, dark: true, fire: true, guard: true }),
    dziura: safeTarget({ ...dzien, holes: 1 }) - safeTarget(dzien),
    dziury: safeTarget({ ...dzien, holes: 10 }) - safeTarget(dzien),
    obcy: safeTarget({ ...dzien, strangers: 1 }) - safeTarget(dzien),
    napad: safeTarget({ ...dzien, raided: true }) - safeTarget(dzien),
    stala: Math.round(((krok * safeTarget(baza)) / n.safe) * 10) / 10,
  };
});

/** o ile cieplej „czuje” się śpiący (`stepNeeds`: ciepło liczone o tyle stopni wyżej) */
const koc = leniwie(() => stawka('warm', { temp: 0, asleep: true }) - stawka('warm', { temp: 0 }));

// ---------------------------------------------------------------- tabele ręczne (przypięte testem do kodu)

/** Zaufanie i wkurzenie po śmierci (`mourn` w src/gov/zarzad.ts): ktoś z zarządu i ktoś spoza niego. */
export const SMIERC_ZARZAD: readonly [number, number] = [-5, 8];
export const SMIERC_MIESZKANIEC: readonly [number, number] = [-2, 3];
/** nastrój wszystkich naszych po śmierci kogoś z naszych (`die` w src/sim/sim.ts), na dobę */
export const SMIERC_NASTROJ = -10;
/** zdrowie, poniżej którego lista ludzi zapala znacznik rany (`ZDROWIE_NISKIE` w src/ui/lista.ts) */
export const ZNACZNIK_RANY = 50;
/** szansa amputacji: 50% plus 15 punktów za poziom Medycyny, lek dokłada 15 punktów, najwyżej 90% (`amputateTick`) */
export const AMPUTACJA = { baza: 0.5, poziom: 0.15, lek: 0.15, max: 0.9 };
/** zdrowie traci ranny w kłopotach na wyprawie (od, do; `rozliczWyprawe`) i strażnik przy wtargnięciu szabrowników */
export const RANA_WYPRAWA: readonly [number, number] = [20, 35];
export const RANA_NAPAD = 25;
/** zdrowie, które zabiera udana amputacja (`amputateTick`) i o ile gorzej celuje po niej ręka (`hitChance`) */
export const RANA_AMPUTACJA = 35;
export const KIKUT_CELNOSC = 15;

interface Nastroj {
  /** powód ze stanu (po polsku, tak jak na karcie) */
  why: string;
  d: number;
  ticks: number;
  /** własna etykieta, gdy powód ze stanu zawiera zmienną część (imię) */
  pl?: string;
  en?: string;
  /** etykieta w domu jednorodzinnym, gdy powód ze stanu mówi o zarządzie (gra pokazuje ten sam napis w obu miejscach) */
  plDom?: string;
  enDom?: string;
}

/** Chwilowe nastroje, które wiki wymienia: dobre, potem złe. Liczby z `addMood` w src/sim/sim.ts (i `infect`), z eksportów
    src/sim/wedrowcy.ts oraz z karty nocy (src/gov/noc.ts, src/sim/gov.ts); test przypina wpisy do tekstu źródeł. */
export const NASTROJE: readonly Nastroj[] = [
  { why: 'Ciepły posiłek', d: 4, ticks: 4 * H },
  { why: 'Wspólny posiłek', d: 5, ticks: 12 * H },
  { why: 'Przegoniliśmy szabrowników', d: 6, ticks: 12 * H },
  { why: 'Uratowaliśmy go', d: 6, ticks: TICKS_PER_DAY },
  { why: 'Wróciłem z łupem', d: 4, ticks: 12 * H },
  { why: 'Wieści ze świata', d: TALK_MOOD, ticks: TALK_MOOD_TICKS },
  {
    why: 'Nowa osoba w zarządzie',
    d: NOWY_MOOD,
    ticks: NOWY_MOOD_TICKS,
    plDom: 'Nowa osoba w komitecie',
    enDom: 'New person on the committee',
  },
  { why: 'Zimne z puszki', d: -3, ticks: 4 * H },
  { why: 'Głodowe racje', d: -3, ticks: 8 * H },
  { why: 'Spanie na podłodze', d: FLOOR_MOOD, ticks: 16 * H },
  { why: 'Palimy meble', d: -6, ticks: 12 * H },
  { why: 'Ledwo uciekłem', d: -6, ticks: 12 * H },
  { why: 'Szabrownicy weszli na podwórko', d: -8, ticks: 12 * H },
  {
    why: 'Śmierć: …',
    d: SMIERC_NASTROJ,
    ticks: TICKS_PER_DAY,
    pl: 'Śmierć kogoś z waszych',
    en: 'Somebody of yours died',
  },
  { why: 'Amputacja', d: -12, ticks: TICKS_PER_DAY },
  { why: 'Gorączka po ugryzieniu', d: -15, ticks: FEVER_TICKS },
];

const nastrojEtykieta = (n: Nastroj, c: WikiCtx): string =>
  c.dom && n.plDom && n.enDom ? L(n.plDom, n.enDom) : L(n.pl ?? n.why, n.en ?? nastrojEn(n.why));

// ---------------------------------------------------------------- skutki cech i umiejętności z funkcji gry

/** siła warty osoby przy bramie w mocnym układzie (broń palna, uchwała o wartach, lampa przy bramie), żeby zaokrąglenie
    do 0,1 w `guardValue` nie psuło ilorazów */
export function wartaWartosc(osoba: Partial<GovPerson>): number {
  const st = sondaStanZUchwalami('u_warty');
  const i = sondaWejscie({ light: { campfire: false, gateLamp: true } });
  return guardValue(st, i, sondaOsoba({ arm: 'palna', ...osoba }), 'brama');
}

/** mnożnik siły warty od cechy (przy umiejętności Obrona 4, żeby wartość była duża) */
export const wartaMnoznik = (cecha: string): number =>
  wartaWartosc({ skills: { obrona: 4 }, traits: [cecha] }) / wartaWartosc({ skills: { obrona: 4 } });

/** o ile rośnie siła warty na poziom umiejętności Obrona (ułamek) */
export const wartaNaPoziom = (): number => (wartaWartosc({ skills: { obrona: 4 } }) / wartaWartosc({}) - 1) / 4;

/** ryzyko kłopotów w wyprawie osoby z daną zmianą w stosunku do osoby bez niej (`expRisk`; ryzyko bazowe 0,4) */
export function ryzykoMnoznik(zmiana: Partial<GovPerson>): number {
  const st = sondaStan();
  const cel = { ryzyko: 0.4 };
  return expRisk(st, sondaOsoba(zmiana), cel) / expRisk(st, sondaOsoba(), cel);
}

/** o ile zmienia się dzienny dryf zaufania i wkurzenia, gdy w zarządzie jest jedna osoba z daną cechą (`dailyDrift`) */
function dryfCechy(cecha: string): { zaufanie: number; wkurzenie: number } {
  const dryf = (traits: string[]) => {
    const [t, a] = dailyDrift(sondaStan(), sondaWejscie({ people: [sondaOsoba({ traits })], burned: [] }));
    return { t, a };
  };
  const b = dryf([]);
  const z = dryf([cecha]);
  return { zaufanie: Math.round((z.t - b.t) * 100) / 100, wkurzenie: Math.round((z.a - b.a) * 100) / 100 };
}

/** mnożnik tempa badań od cechy (`tempoOsoby` na osobie bez umiejętności) */
const tempoBadan = (cecha: string): number =>
  tempoOsoby({ skills: {}, traits: [cecha] }, 'bud') / tempoOsoby({ skills: {}, traits: [] }, 'bud');

/** O ile punktów rośnie szansa uspokojenia wściekłych sąsiadów na spotkaniu, gdy mówi osoba z tą cechą
    (`szansaUspokojenia`; tylko Lubiany i Gaduła). */
function uspokojenie(mowca: 'lubiany' | 'gadula'): number {
  const g = { rel: 0, nastroj: 'spokoj' } as unknown as Parameters<typeof szansaUspokojenia>[0];
  return Math.round((szansaUspokojenia(g, mowca) - szansaUspokojenia(g, null)) * 100);
}

/** cechy z liczbowym skutkiem w grze i te, które na razie niczego nie zmieniają */
const CECHY_Z_SKUTKIEM = [
  'pracowity',
  'leniwy',
  'excel',
  'lubiany',
  'klotliwy',
  'optymista',
  'odwazny',
  'tchorz',
  'gadula',
];
const CECHY_BEZ_SKUTKU = ['twardy', 'hipochondryk'];

/** skutek cechy jednym zdaniem w bieżącym języku */
function skutekCechy(t: string): string {
  const dryf = (): string => {
    const d = dryfCechy(t);
    return d.zaufanie
      ? L(`zaufanie ${signed(d.zaufanie)} dziennie`, `trust ${signed(d.zaufanie)} a day`)
      : L(`wkurzenie ${signed(d.wkurzenie)} dziennie`, `anger ${signed(d.wkurzenie)} a day`);
  };
  const spotkanie = (m: 'lubiany' | 'gadula'): string =>
    L(
      `szansa uspokojenia sąsiadów na spotkaniu ${signed(uspokojenie(m), 0)} pkt`,
      `chance of calming the neighbours at a meeting ${signed(uspokojenie(m), 0)} pts`,
    );
  switch (t) {
    case 'pracowity':
    case 'leniwy':
    case 'excel':
      return L(`tempo badań ${zmianaProc(tempoBadan(t))}`, `research speed ${zmianaProc(tempoBadan(t))}`);
    case 'lubiany':
      return `${dryf()}; ${spotkanie('lubiany')}`;
    case 'gadula':
      return spotkanie('gadula');
    case 'klotliwy':
    case 'optymista':
      return dryf();
    case 'odwazny':
    case 'tchorz': {
      const w = zmianaProc(wartaMnoznik(t));
      const r = zmianaProc(ryzykoMnoznik({ traits: [t] }));
      return L(`siła warty ${w}, ryzyko wyprawy ${r}`, `watch strength ${w}, supply run risk ${r}`);
    }
    default:
      return L('na razie bez wpływu na liczby', 'no effect on numbers for now');
  }
}

/** Gdzie liczy się umiejętność w danej dziedzinie, w bieżącym języku: szybsza praca, domyślny priorytet, badania i skutki
    szczególne (Medycyna: amputacja, Obrona: warta, trafienie, ryzyko wyprawy). */
function gdzieLiczy(d: Dom): string {
  const czesci: string[] = [];
  const rodzaje = RODZAJE.filter((r) => {
    const u = UMIEJETNOSCI[r];
    return u !== 'badanie' && u.includes(d as TechDom);
  });
  const szybsze = rodzaje.filter(przyspiesza).map(rodzajNazwa);
  const priorytet = rodzaje.filter((r) => !przyspiesza(r)).map(rodzajNazwa);
  if (szybsze.length)
    czesci.push(
      L(
        `praca szybsza o ${proc(TEMPO_KROK)} na poziom: ${listaI(szybsze)}`,
        `work ${proc(TEMPO_KROK)} faster per level: ${listaI(szybsze)}`,
      ),
    );
  if (priorytet.length)
    czesci.push(L(`domyślny priorytet: ${listaI(priorytet)}`, `default priority: ${listaI(priorytet)}`));
  if ((TECH_DOMS as readonly Dom[]).includes(d)) czesci.push(L('badania z tej dziedziny', 'research in this field'));
  if (d === 'med')
    czesci.push(
      L(
        `amputacja: ${signed(AMPUTACJA.poziom * 100, 0)} pkt szansy na poziom`,
        `amputation: ${signed(AMPUTACJA.poziom * 100, 0)} pts of success chance per level`,
      ),
    );
  if (d === 'obrona') {
    const celnosc = Math.round((hitChance(WEAPONS.noz, 1, 100, false) - hitChance(WEAPONS.noz, 0, 100, false)) * 100);
    const warta = Math.round(wartaNaPoziom() * 100);
    const ryzyko = (1 - ryzykoMnoznik({ skills: { obrona: 4 } })) / 4;
    czesci.push(
      L(
        `warta ${signed(warta, 0)}% na poziom, trafienie ${signed(celnosc, 0)} pkt na poziom, ryzyko wyprawy −${proc(ryzyko)} na poziom`,
        `watch ${signed(warta, 0)}% per level, hit chance ${signed(celnosc, 0)} pts per level, supply run risk −${proc(ryzyko)} per level`,
      ),
    );
  }
  return czesci.join('; ');
}

// ---------------------------------------------------------------- potrzeby

interface OpisPotrzeby {
  zdania: string[];
  fakty: Fakt[];
  jak: string[];
  zobacz: string[];
}

/** Fakt „zdrowie przy niedoborze”: próg i tempo spadku zdrowia z `stepNeeds` (najedzenie, ciepło albo siły poniżej progu). */
function zdrowieSpada(k: 'food' | 'warm' | 'rest', id = 'zdrowie'): Fakt {
  const prog = zdrowie()[{ food: 'glod', warm: 'zimno', rest: 'zmeczenie' }[k] as 'glod' | 'zimno' | 'zmeczenie'];
  const tempo =
    stawkaZdrowia()[{ food: 'glod', warm: 'zimno', rest: 'zmeczenie' }[k] as 'glod' | 'zimno' | 'zmeczenie'];
  const pl = { food: 'najedzeniu', warm: 'cieple', rest: 'siłach' }[k];
  const en = { food: 'fed', warm: 'warmth', rest: 'energy' }[k];
  return fakt(id, L(`Zdrowie przy ${pl} poniżej ${prog}`, `Health when ${en} is below ${prog}`), naGodz(tempo));
}

const OPISY_POTRZEB: Record<keyof Needs, (c: WikiCtx) => OpisPotrzeby> = {
  food: (c) => ({
    zdania: [
      L(
        `Najedzenie mówi, jak bardzo ktoś jest syty: 100 to pełny żołądek, a poniżej ${zdrowie().glod} głód zaczyna zabierać zdrowie.`,
        `Fed shows how full someone is: 100 is a full stomach, and below ${zdrowie().glod} hunger starts to eat away at health.`,
      ),
      L(
        `Ubywa go przez cały czas, we śnie wolniej, a przy racjach o ${proc(glodRacji())} szybciej.`,
        `It drains all the time, slower in sleep, and ${proc(glodRacji())} faster on rations.`,
      ),
      L(
        `Podnosi je posiłek: ciepły daje +${MEAL}, zimna porcja prosto z zapasów +${COLD_MEAL}.`,
        `A meal raises it: a hot one gives +${MEAL}, a cold portion straight from the stock +${COLD_MEAL}.`,
      ),
      L(
        `Kto zgłodnieje poniżej ${HUNGRY}, sam idzie jeść, a ktoś zaczyna gotować już przy ${PECKISH}.`,
        `Anyone who drops below ${HUNGRY} goes to eat on their own, and somebody starts cooking already at ${PECKISH}.`,
      ),
    ],
    fakty: [
      fakt('jawa', L('Na jawie', 'Awake'), naGodz(stawka('food'))),
      fakt('sen', L('We śnie', 'Asleep'), naGodz(stawka('food', { asleep: true }))),
      fakt('racje', L('Przy racjach ubywa szybciej o', 'On rations it drains faster by'), proc(glodRacji())),
      fakt('posilek', L('Ciepły posiłek', 'A hot meal'), `+${MEAL}`),
      fakt('zimna', L('Zimna porcja', 'A cold portion'), `+${COLD_MEAL}`),
      fakt('idzie', L('Idzie jeść poniżej', 'Goes to eat below'), `${HUNGRY}`),
      fakt('gotuje', L('Ktoś zaczyna gotować poniżej', 'Someone starts cooking below'), `${PECKISH}`),
      fakt('zawsze', L('Je zawsze poniżej', 'Always eats below'), `${STARVING}`),
      fakt(
        'racje-prog',
        L('Przy racjach je dopiero poniżej', 'On rations eats only below'),
        L(
          `${RATION_HUNGRY} i najwyżej ${RATION_MEALS} razy na dobę`,
          `${RATION_HUNGRY}, and at most ${RATION_MEALS} times a day`,
        ),
      ),
      zdrowieSpada('food'),
    ],
    jak: [polecenie(c, ['kozie', 'the stove'], ['Gotować', 'Cook'])],
    zobacz: ['zasob:jedzenie', 'praca:kuchnia', 'uchwala:u_racje', 'uchwala:u_kociol', 'potrzeba:health'],
  }),

  warm: (c) => ({
    zdania: [
      L(
        'Ciepło mówi, jak bardzo ktoś jest ogrzany: zależy od temperatury, w której stoi, a przy palącym się ogniu rośnie najszybciej.',
        'Warmth shows how warmed up someone is: it depends on the temperature they stand in, and by a burning fire it rises fastest.',
      ),
      L(
        `Od ${deg(COMFORT)} rośnie, a w chłodniejszym miejscu maleje o punkt na godzinę za każdy stopień poniżej.`,
        `From ${deg(COMFORT)} it rises, and in a cooler spot it falls by a point per hour for every degree below.`,
      ),
      L(
        `Śpiący marznie wolniej: liczy się tak, jakby było o ${num(koc(), 0)}°C cieplej.`,
        `Someone asleep gets cold slower: it counts as if it were ${num(koc(), 0)}°C warmer.`,
      ),
      L(
        `Kto zmarznie poniżej ${COLD}, sam idzie się ogrzać, a poniżej ${zdrowie().zimno} zimno zabiera zdrowie.`,
        `Anyone who gets colder than ${COLD} goes to warm up on their own, and below ${zdrowie().zimno} the cold takes health.`,
      ),
    ],
    fakty: [
      fakt('komfort', L('Rośnie od temperatury', 'Rises from a temperature of'), deg(COMFORT)),
      fakt('cieplo', L('W cieple', 'In the warm'), naGodz(stawka('warm', { temp: COMFORT + 2 }))),
      fakt('zimno', L('Przy 8°C', 'At 8°C'), naGodz(stawka('warm', { temp: 8 }))),
      fakt('ogien', L('Przy palącym się ogniu', 'By a burning fire'), naGodz(stawka('warm', { fire: true }))),
      fakt('koc', L('Śpiący jest jakby cieplej o', 'Someone asleep is as if warmer by'), `${num(koc(), 0)}°C`),
      fakt('idzie', L('Idzie się ogrzać poniżej', 'Goes to warm up below'), `${COLD}`),
      fakt('grzeje', L('Grzeje się do', 'Warms up to'), `${WARMED}`),
      zdrowieSpada('warm'),
    ],
    jak: [polecenie(c, ['kozie', 'the stove'], ['Dołożyć do kozy', 'Feed the stove'])],
    zobacz: [
      'zasob:koza',
      'zasob:ognisko',
      'start:temperatura',
      'budowla:kociol',
      'budowla:koza_beczka',
      'potrzeba:health',
    ],
  }),

  rest: () => ({
    zdania: [
      L(
        'Siły mówią, jak bardzo ktoś jest wypoczęty: ubywa ich przez cały dzień, a wracają we śnie.',
        'Energy shows how rested someone is: it drains through the day and comes back in sleep.',
      ),
      L(
        'Rąbanie drzewa, łatanie dziury i noszenie drewna zjadają je szybciej niż samo chodzenie.',
        'Chopping a tree, patching a hole and carrying wood use it up faster than just walking about.',
      ),
      L(
        `Za dnia kto spadnie poniżej ${TIRED}, sam idzie spać, a wyspany wstaje przy ${REST_UNTIL}.`,
        `By day anyone who drops below ${TIRED} goes to sleep on their own, and wakes up rested at ${REST_UNTIL}.`,
      ),
      L(
        'Zmęczony strażnik może zasnąć na warcie, a bez sił nikt nie pójdzie na wyprawę.',
        'A tired guard may fall asleep on watch, and nobody without energy goes on a supply run.',
      ),
    ],
    fakty: [
      fakt('start', L('Na początku gry', 'At the start of the game'), `${REST_START}`),
      fakt('jawa', L('Na nogach', 'On foot'), naGodz(stawka('rest'))),
      fakt('praca', L('Przy ciężkiej pracy', 'During heavy work'), naGodz(stawka('rest', { busy: true }))),
      fakt('lozko', L('We śnie w łóżku', 'Asleep in a bed'), naGodz(stawka('rest', { asleep: true }))),
      fakt(
        'podloga',
        L('We śnie na podłodze', 'Asleep on the floor'),
        naGodz(stawka('rest', { asleep: true, floor: true })),
      ),
      fakt('spi', L('Za dnia idzie spać poniżej', 'By day goes to sleep below'), `${TIRED}`),
      fakt('wstaje', L('Wstaje przy', 'Wakes up at'), `${REST_UNTIL}`),
      fakt(
        'wyprawa',
        L('Siły na wyprawę blisko i daleko', 'Energy for a short and a long run'),
        L(
          `od ${karta().blisko.rest} i od ${karta().daleko.rest}`,
          `from ${karta().blisko.rest} and from ${karta().daleko.rest}`,
        ),
      ),
      zdrowieSpada('rest'),
    ],
    jak: [
      L(
        'Noc planujecie na karcie nocy o 20:00: każdy może spać, trzymać wartę, czuwać przy kozie albo iść na wyprawę.',
        'You plan the night on the Night orders at 20:00: everyone can sleep, keep watch, sit up by the stove or go on a supply run.',
      ),
    ],
    zobacz: ['ludzie:sen', 'noc:karta', 'noc:warta', 'potrzeba:health'],
  }),

  health: () => ({
    zdania: [
      L(
        'Zdrowie spada od ran w walce i w kłopotach na wyprawie, a zimno, głód i wyczerpanie obniżają je powoli.',
        'Health falls from wounds in a fight and in trouble on a supply run, and cold, hunger and exhaustion lower it slowly.',
      ),
      L(
        `Wraca samo, gdy ciepło jest wyższe niż ${zdrowie().powrotCiepla} i najedzenie wyższe niż ${zdrowie().powrotJedzenia}; badanie ambulatorium polowego przyspiesza ten powrót.`,
        `It comes back on its own while warmth is above ${zdrowie().powrotCiepla} and fed is above ${zdrowie().powrotJedzenia}; the field infirmary research speeds the recovery up.`,
      ),
      L(
        `Ranny nie pójdzie na wartę poniżej ${karta().warta} zdrowia, na dyżur przy kozie poniżej ${karta().koza} ani na wyprawę (blisko od ${karta().blisko.health}, daleko od ${karta().daleko.health}).`,
        `A wounded person will not go on watch below ${karta().warta} health, on stove duty below ${karta().koza}, or on a supply run (short from ${karta().blisko.health}, long from ${karta().daleko.health}).`,
      ),
      L(
        'Samo zimno i głód nie zabiją, ale ktoś ze zdrowiem na dnie ginie od pierwszego trafienia.',
        'Cold and hunger alone do not kill, but someone with health at the bottom dies from the first hit.',
      ),
    ],
    fakty: [
      fakt('powrot', L('Powrót zdrowia', 'Recovery'), naGodz(stawkaZdrowia().powrot)),
      fakt('ambulatorium', L('Po badaniu ambulatorium', 'After the infirmary research'), `×${num(AMBU_TEMPO)}`),
      zdrowieSpada('warm', 'zimno'),
      zdrowieSpada('food', 'glod'),
      zdrowieSpada('rest', 'wyczerpanie'),
      fakt('warta', L('Warta od zdrowia', 'Watch from health'), `${karta().warta}`),
      fakt('koza', L('Dyżur przy kozie od zdrowia', 'Stove duty from health'), `${karta().koza}`),
      fakt(
        'wyprawa',
        L('Wyprawa blisko i daleko od zdrowia', 'Short and long run from health'),
        `${karta().blisko.health} / ${karta().daleko.health}`,
      ),
    ],
    jak: [
      L(
        'Rannego ogrzejcie, nakarmcie i połóżcie spać; na karcie nocy zostawcie mu „Śpi”.',
        'Warm a wounded person, feed them and let them sleep; on the Night orders leave them on “Sleeps”.',
      ),
    ],
    zobacz: ['ludzie:rany', 'potrzeba:warm', 'potrzeba:food', 'badanie:t_ambu', 'noc:karta'],
  }),

  safe: (c) => ({
    zdania: [
      L(
        'Bezpieczeństwo mówi, jak spokojnie ktoś się czuje: światło, dach, ludzie obok, ogień i warta uspokajają, a ciemność i samotność straszą.',
        'Safety shows how calm someone feels: light, a roof, people nearby, a fire and a watch soothe, while darkness and loneliness frighten.',
      ),
      L(
        'Straszą też dziury w siatce, obcy w zasięgu wzroku i napad, który wszedł na podwórko, a po takim napadzie strach zostaje do rana.',
        'Holes in the fence, strangers in sight and a raid that got into the yard frighten too, and after such a raid the fear stays till morning.',
      ),
      L(
        `Dochodzi do celu stopniowo: w ${godz(bezpieczenstwo().stala)} pokonuje około dwóch trzecich drogi, więc jedna spokojna chwila nie wystarczy.`,
        `It moves towards the target gradually: in ${godz(bezpieczenstwo().stala)} it covers about two thirds of the way, so a single calm moment is not enough.`,
      ),
    ],
    fakty: [
      fakt(
        'dach',
        L('Cel: pod dachem, jasno, z ludźmi', 'Target: indoors, lit, with company'),
        `${bezpieczenstwo().dach}`,
      ),
      fakt('dwor', L('Cel: na dworze nocą, sam', 'Target: outdoors at night, alone'), `${bezpieczenstwo().dwor}`),
      fakt(
        'warta',
        L('Cel: pod dachem nocą, przy ogniu, na warcie', 'Target: indoors at night, by a fire, on watch'),
        `${bezpieczenstwo().warta}`,
      ),
      fakt(
        'dziura',
        L('Dziura w siatce (nocą, na dworze)', 'A hole in the fence (at night, outdoors)'),
        L(
          `${signed(bezpieczenstwo().dziura, 0)} do celu, najwyżej ${signed(bezpieczenstwo().dziury, 0)}`,
          `${signed(bezpieczenstwo().dziura, 0)} to the target, at most ${signed(bezpieczenstwo().dziury, 0)}`,
        ),
      ),
      fakt(
        'obcy',
        L('Obcy w zasięgu wzroku', 'A stranger in sight'),
        L(`${signed(bezpieczenstwo().obcy, 0)} do celu`, `${signed(bezpieczenstwo().obcy, 0)} to the target`),
      ),
      fakt(
        'napad',
        L('Po wtargnięciu szabrowników', 'After looters got in'),
        L(
          `${signed(bezpieczenstwo().napad, 0)} do celu do rana`,
          `${signed(bezpieczenstwo().napad, 0)} to the target till morning`,
        ),
      ),
    ],
    jak: [
      L(
        `Łatajcie dziury w siatce, trzymajcie wartę i rozpalcie ognisko: w ciągu paru godzin ${c.words.zarzad.m} poczuje się pewniej.`,
        `Patch the holes in the fence, keep a watch and light a campfire: within a few hours ${c.e.krotko} will feel safer.`,
      ),
    ],
    zobacz: ['noc:warta', 'zasob:ognisko', 'noc:napad', 'potrzeba:mood'],
  }),

  mood: () => {
    const wagi = wagiNastroju();
    return {
      zdania: [
        L(
          'Nastrój wynika z pozostałych potrzeb: to ich średnia ważona, od której odejmuje się dodatkowe punkty za każdą bardzo niską.',
          'Mood follows from the other needs: it is their weighted average, with extra points taken off for every very low one.',
        ),
        L(
          'Do tego dochodzą chwilowe nastroje z powodem, które widać na karcie osoby: ciepły posiłek, spalony mebel, czyjaś śmierć, dobre wieści.',
          'On top of that come temporary moods with a reason on the person card: a hot meal, burned furniture, somebody’s death, good news.',
        ),
        L(
          'Nastroju nie poprawia się wprost: dbacie o ciepło, jedzenie, sen i bezpieczeństwo, a on idzie za nimi.',
          'You cannot raise mood directly: you look after warmth, food, sleep and safety, and mood follows them.',
        ),
      ],
      fakty: [
        ...(['food', 'warm', 'rest', 'health', 'safe'] as const).map((k) =>
          fakt(`waga-${k}`, L(`Waga: ${NEED_LABELS[k]}`, `Weight: ${NEED_LABELS_EN[k]}`), proc(wagi[k])),
        ),
        fakt(
          'kara',
          L(`Każda potrzeba poniżej ${kara().prog} odejmuje`, `Every need below ${kara().prog} takes off`),
          L(`${num(kara().punkty, 0)} pkt nastroju`, `${num(kara().punkty, 0)} mood points`),
        ),
      ],
      jak: [],
      zobacz: ['ludzie:nastroje', 'ludzie:sen', 'zasob:meble', 'potrzeba:safe'],
    };
  },
};

const KLUCZE_POTRZEB: readonly (keyof Needs)[] = ['food', 'warm', 'rest', 'health', 'safe', 'mood'];

function potrzeba(k: keyof Needs): Def {
  return def(
    `potrzeba:${k}`,
    'ludzie',
    () => potrzebaNazwa(k),
    (c): Tresc => {
      const o = OPISY_POTRZEB[k](c);
      const pasek = progiPaska();
      return {
        zdania: o.zdania,
        fakty: [
          ...o.fakty,
          fakt(
            'pasek',
            L('Kolor paska na karcie', 'Bar colour on the card'),
            L(
              `czerwony poniżej ${pasek.zle}, żółty poniżej ${pasek.uwaga}`,
              `red below ${pasek.zle}, amber below ${pasek.uwaga}`,
            ),
          ),
        ],
        jak: o.jak,
        zobacz: [...o.zobacz, 'ludzie:karta'],
      };
    },
    `${NEED_LABELS[k]} ${NEED_LABELS_EN[k]}`,
  );
}

// ---------------------------------------------------------------- artykuły

export function definicjeLudzie(): Def[] {
  return [
    def(
      'ludzie:zarzad',
      'ludzie',
      (c) => L(`${c.words.Zarzad} i ${c.words.mieszkancy.m}`, `${c.e.Zarzad} and the ${c.e.mieszkancy}`),
      (c) => {
        const { words: w, e } = c;
        const [zt, za] = SMIERC_ZARZAD.map((v) => signed(v, 0));
        const [mt, ma] = SMIERC_MIESZKANIEC.map((v) => signed(v, 0));
        return {
          zdania: [
            L(
              `${w.Zarzad} to wasi ludzie z imionami: mają potrzeby, umiejętności, cechy i broń, i tylko im dajecie polecenia.`,
              `${e.Zarzad} is your named people: they have needs, skills, traits and weapons, and they are the only ones you give orders to.`,
            ),
            c.dom
              ? L(
                  'Inni ludzie w okolicy żyją własnym życiem i poleceń od was nie dostają.',
                  'Other people in the area live their own lives and take no orders from you.',
                )
              : L(
                  `${w.mieszkancy.m[0].toUpperCase()}${w.mieszkancy.m.slice(1)} siedziby mają własny plan dnia: w dzień są na podwórku, wieczorem przy ognisku, jeśli się pali, a w nocy u siebie.`,
                  `The ${e.mieszkancy} of the building have a day plan of their own: in the yard by day, by the campfire in the evening if one burns, and at home at night.`,
                ),
            L(
              `Każda śmierć u was boli: ktoś z ${w.zarzad.dk} zmienia zaufanie o ${zt}, a wkurzenie o ${za}; ktoś spoza ${w.zarzad.dk} o ${mt} i ${ma}.`,
              `Every death among you hurts: someone from ${e.krotko} changes trust by ${zt} and anger by ${za}; someone outside ${e.krotko} by ${mt} and ${ma}.`,
            ),
            L(
              'Ludzie z adresu są zawsze wymyśleni na podstawie zbiorczych danych GUS i PESEL; z prawdziwego świata gra bierze tylko miejsca z OpenStreetMap i statystyki.',
              'The people from your address are always made up from aggregate GUS and PESEL data; from the real world the game takes only places from OpenStreetMap and statistics.',
            ),
          ],
          fakty: [
            fakt(
              'start',
              L('Osób na starcie', 'People at the start'),
              L(
                `${OSOB_DOMYSLNIE} (do wyboru od ${OSOB_MIN} do ${OSOB_MAX})`,
                `${OSOB_DOMYSLNIE} (from ${OSOB_MIN} to ${OSOB_MAX} to choose)`,
              ),
            ),
            fakt('max', L(`Limit osób ${w.zarzad.dk}`, `Size limit of ${e.krotko}`), `${ZARZAD_MAX}`),
            fakt(
              'smierc',
              L(
                `Zaufanie i wkurzenie po śmierci kogoś z ${w.zarzad.dk}`,
                `Trust and anger after a death on ${e.krotko}`,
              ),
              `${zt} / ${za}`,
            ),
            fakt(
              'smierc-inny',
              L(
                `Zaufanie i wkurzenie po śmierci kogoś spoza ${w.zarzad.dk}`,
                `Trust and anger after a death outside ${e.krotko}`,
              ),
              `${mt} / ${ma}`,
            ),
          ],
          jak: [
            L(
              `Skład wybieracie na ekranie startowym, w panelu drużyny: od ${OSOB_MIN} do ${OSOB_MAX} osób z adresu albo własnych.`,
              `You pick the line-up on the start screen, in the team panel: from ${OSOB_MIN} to ${OSOB_MAX} people from the address or your own.`,
            ),
            c.touch
              ? L(
                  `Stuknijcie człowieka albo jego portret pod paskiem; stuknięcie kogoś spoza ${w.zarzad.dk} otwiera kartę tylko do odczytu.`,
                  `Tap a person or their portrait under the top bar; tapping someone outside ${e.krotko} opens a read-only card.`,
                )
              : L(
                  `Kliknijcie człowieka albo jego portret pod paskiem; klik w kogoś spoza ${w.zarzad.dk} otwiera kartę tylko do odczytu.`,
                  `Click a person or their portrait under the top bar; clicking someone outside ${e.krotko} opens a read-only card.`,
                ),
          ],
          zobacz: ['ludzie:karta', 'ludzie:sen', 'praca:panel', 'zarzad:zaufanie', 'zarzad:wkurzenie'],
        };
      },
      'mieszkańcy lokatorzy sąsiedzi zarząd ekipa rdzeń',
    ),

    def(
      'ludzie:karta',
      'ludzie',
      () => L('Karta osoby', 'The person card'),
      (c) => {
        const pasek = progiPaska();
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Karta osoby pokazuje imię, zawód i wiek, umiejętności i cechy, broń, sześć potrzeb, chwilowe nastroje oraz to, co osoba ma tej nocy i robi teraz.',
              'The person card shows the name, trade and age, skills and traits, the weapon, the six needs, temporary moods, and what the person has for tonight and is doing now.',
            ),
            L(
              `Osoba z ${w.zarzad.dk} ma pod opisem pracy jeszcze wybór stałego zajęcia i przełącznik wyjścia za siatkę, a przy broni przycisk zmiany.`,
              `A person from ${e.krotko} also has a fixed-job choice and the go-outside-the-fence switch under the job line, and a swap button by the weapon.`,
            ),
            L(
              `Dopisek „(sam)” przy pracy znaczy, że osoba wzięła ją bez polecenia; karta kogoś spoza ${w.zarzad.dk} jest tylko do odczytu.`,
              `A note “(on own)” beside a job means the person took it without orders; the card of someone outside ${e.krotko} is read-only.`,
            ),
          ],
          fakty: [
            fakt('paski', L('Paski potrzeb', 'Need bars'), listaI(KLUCZE_POTRZEB.map(potrzebaNazwa))),
            fakt(
              'kolor',
              L('Kolor paska', 'Bar colour'),
              L(
                `czerwony poniżej ${pasek.zle}, żółty poniżej ${pasek.uwaga}`,
                `red below ${pasek.zle}, amber below ${pasek.uwaga}`,
              ),
            ),
            fakt(
              'znaczniki',
              L('Znaczniki przy portrecie', 'Markers by the portrait'),
              L(
                `rana (zdrowie poniżej ${ZNACZNIK_RANY}), głód (poniżej ${HUNGRY}), zimno (poniżej ${COLD}), ugryzienie, wyprawa, warta, badania, sen`,
                `wound (health below ${ZNACZNIK_RANY}), hunger (below ${HUNGRY}), cold (below ${COLD}), bite, supply run, watch, research, sleep`,
              ),
            ),
          ],
          jak: [
            c.touch
              ? L(
                  'Stuknijcie człowieka albo jego portret; drugie stuknięcie w portret prowadzi za nim kamerę.',
                  'Tap a person or their portrait; a second tap on the portrait makes the camera follow them.',
                )
              : L(
                  'Kliknijcie człowieka albo jego portret; drugi klik w portret prowadzi za nim kamerę, a Q i E przełączają osoby.',
                  'Click a person or their portrait; a second click on the portrait makes the camera follow them, and Q and E step through people.',
                ),
          ],
          zobacz: [
            ...KLUCZE_POTRZEB.map((k) => `potrzeba:${k}`),
            'ludzie:umiejetnosci',
            'ludzie:cechy',
            'ludzie:bron',
            'praca:stale',
          ],
        };
      },
      'karta osoby portret statystyki',
    ),

    ...KLUCZE_POTRZEB.map(potrzeba),

    def(
      'ludzie:umiejetnosci',
      'ludzie',
      () => L('Umiejętności', 'Skills'),
      (c) => ({
        zdania: [
          L(
            `Umiejętność to poziom od 1 do 4 w jednej z ${Object.keys(DOM).length} dziedzin; widać ją na karcie osoby jako etykietę z poziomem.`,
            `A skill is a level from 1 to 4 in one of ${Object.keys(DOM).length} fields; it shows on the person card as a tag with a level.`,
          ),
          L(
            'Wynikają z zawodu osoby, a nowi ludzie z zawodem przynoszą nowe umiejętności.',
            'They come from a person’s trade, and newcomers with a trade bring new skills.',
          ),
          L(
            `Każdy poziom przyspiesza pracę w swojej dziedzinie o ${proc(TEMPO_KROK)}, a dla badań liczy się najlepsza osoba na miejscu.`,
            `Every level speeds up work in its field by ${proc(TEMPO_KROK)}, and for research the best person on the spot counts.`,
          ),
          L(
            'Obrona to jedyna umiejętność bez badań: mówi o walce, warcie i wyprawach.',
            'Defence is the only skill with no research: it is about fighting, keeping watch and supply runs.',
          ),
        ],
        fakty: (Object.keys(DOM) as Dom[]).map((d) => fakt(`umiejetnosc-${d}`, domNazwa(d), gdzieLiczy(d))),
        jak: [
          c.touch
            ? L(
                'Priorytety i stałe zajęcie ustawiacie w panelu Pracy (przycisk „Praca” u góry).',
                'You set priorities and the fixed job in the Work panel (the “Work” button at the top).',
              )
            : L(
                'Priorytety i stałe zajęcie ustawiacie w panelu Pracy (klawisz P).',
                'You set priorities and the fixed job in the Work panel (key P).',
              ),
        ],
        zobacz: ['badania:dziedziny', 'badania:wiedza', 'praca:priorytety', 'ludzie:cechy', 'noc:warta'],
      }),
      'umiejętność poziom fach zawód skill',
    ),

    def(
      'ludzie:cechy',
      'ludzie',
      () => L('Cechy', 'Traits'),
      () => {
        const nazwy = (l: string[]) => listaI(l.map(cechaNazwa));
        return {
          zdania: [
            L(
              'Cecha to rys charakteru osoby: widać ją na karcie, a większość zmienia jakąś liczbę w grze.',
              'A trait is a feature of a person’s character: it shows on the card, and most change some number in the game.',
            ),
            L(
              `${nazwy(['pracowity', 'leniwy', 'excel'])} zmieniają tempo badań, ${nazwy(['lubiany', 'klotliwy', 'optymista'])} dzienne zaufanie albo wkurzenie, a ${nazwy(['odwazny', 'tchorz'])} siłę warty i ryzyko wypraw.`,
              `${nazwy(['pracowity', 'leniwy', 'excel'])} change research speed, ${nazwy(['lubiany', 'klotliwy', 'optymista'])} the daily trust or anger, and ${nazwy(['odwazny', 'tchorz'])} the strength of a watch and the risk of supply runs.`,
            ),
            L(
              `${nazwy(['lubiany', 'gadula'])} pomagają też uspokajać wściekłych sąsiadów na spotkaniu.`,
              `${nazwy(['lubiany', 'gadula'])} also help to calm angry neighbours at a meeting.`,
            ),
            L(
              `${nazwy(CECHY_BEZ_SKUTKU)} na razie niczego nie zmieniają w liczbach, choć ich opisy na karcie mówią co innego.`,
              `${nazwy(CECHY_BEZ_SKUTKU)} change no numbers for now, whatever their descriptions on the card say.`,
            ),
          ],
          fakty: [...CECHY_Z_SKUTKIEM, ...CECHY_BEZ_SKUTKU].map((t) =>
            fakt(`cecha-${t}`, cechaNazwa(t), skutekCechy(t)),
          ),
          jak: [
            L(
              'Cechy ustawiacie na ekranie startowym w panelu drużyny, jeśli układacie własnych ludzi; ludzie z adresu mają swoje.',
              'You set traits on the start screen in the team panel if you build your own people; the people from the address have theirs.',
            ),
          ],
          zobacz: ['ludzie:umiejetnosci', 'badania:wiedza', 'noc:warta', 'zarzad:zaufanie', 'zarzad:wkurzenie'],
        };
      },
      'cechy charakter pracowity leniwy lubiany odważny tchórz traits',
    ),

    def(
      'ludzie:sen',
      'ludzie',
      () => L('Sen i łóżka', 'Sleep and beds'),
      (c) => ({
        zdania: [
          L(
            `Nocą idzie spać każdy, kto nie ma warty, dyżuru przy kozie ani wyprawy, a za dnia ten, kto spadnie poniżej ${TIRED} sił albo odsypia wartę.`,
            `At night everyone without a watch, stove duty or a supply run goes to sleep, and by day so does anyone who drops below ${TIRED} energy or is catching up after a watch.`,
          ),
          L(
            `W łóżku siły wracają szybciej niż na podłodze, a rano ${c.words.zarzad.m} wstaje wypoczęty do ${REST_UNTIL}.`,
            `In a bed energy comes back faster than on the floor, and in the morning ${c.e.krotko} wakes up rested to ${REST_UNTIL}.`,
          ),
          L(
            `Kto spał na podłodze, ma potem nastrój ${signed(FLOOR_MOOD, 0)} na ${czasTickow(16 * H)}.`,
            `Whoever slept on the floor has a mood of ${signed(FLOOR_MOOD, 0)} for ${czasTickow(16 * H)} afterwards.`,
          ),
          L(
            'Łóżko i wersalka to jedno miejsce, łóżko piętrowe dwa; zepsute łóżko się nie liczy, a kto nie ma łóżka, śpi na podłodze.',
            'A bed and a sofa bed are one place, bunk beds are two; a broken bed does not count, and whoever has no bed sleeps on the floor.',
          ),
        ],
        fakty: [
          fakt('lozko', L('Siły w łóżku', 'Energy in a bed'), naGodz(stawka('rest', { asleep: true }))),
          fakt(
            'podloga',
            L('Siły na podłodze', 'Energy on the floor'),
            naGodz(stawka('rest', { asleep: true, floor: true })),
          ),
          fakt(
            'nastroj',
            L('Nastrój po nocy na podłodze', 'Mood after a night on the floor'),
            `${signed(FLOOR_MOOD, 0)}`,
          ),
          fakt('wstaje', L('Rano wstaje przy siłach', 'In the morning wakes up at energy'), `${REST_UNTIL}`),
          fakt(
            'miejsca',
            L('Miejsca do spania', 'Places to sleep'),
            `${mebelNazwa('lozko')} 1, ${mebelNazwa('wersalka')} 1, ${buildName('lozka_pietrowe').toLowerCase()} 2`,
          ),
        ],
        jak: [
          L(
            'Łóżka piętrowe zbudujecie w menu budowy (klawisz B); noc planujecie na karcie nocy.',
            'You build bunk beds in the build menu (key B); you plan the night on the Night orders.',
          ),
        ],
        zobacz: ['potrzeba:rest', 'budowla:lozka_pietrowe', 'zasob:meble', 'noc:karta'],
      }),
      'spać łóżko podłoga wersalka sleep bed',
    ),

    def(
      'ludzie:rany',
      'ludzie',
      () => L('Rany, gorączka i amputacja', 'Wounds, fever and amputation'),
      (c) => ({
        zdania: [
          L(
            'Rana to utrata zdrowia: dostaje ją ten, kto oberwie w walce albo w kłopotach na wyprawie.',
            'A wound is a loss of health: it hits whoever is struck in a fight or runs into trouble on a supply run.',
          ),
          L(
            'Zdrowie wraca samo, gdy osoba jest ogrzana i najedzona, więc rannego trzeba przede wszystkim ogrzać, nakarmić i dać mu spać.',
            'Health comes back on its own while the person is warm and fed, so first of all you warm up, feed and rest a wounded person.',
          ),
          L(
            `Trafienie ugryzieniem zakaża w ${proc(BITE_INFECT)} przypadków, a gorączka zabija po ${godz(FEVER_TICKS / H)}; w ${proc(LIMB)} zakażeń ugryzienie jest w rękę albo nogę i da się je uciąć.`,
            `A bite that lands infects in ${proc(BITE_INFECT)} of cases, and the fever kills after ${godz(FEVER_TICKS / H)}; in ${proc(LIMB)} of infections the bite is on an arm or a leg and can be cut off.`,
          ),
          L(
            'Ludzie giną od ran, od gorączki po ugryzieniu i od nieudanej amputacji.',
            'People die from wounds, from the fever after a bite and from a failed amputation.',
          ),
          L(
            `Śmierć kogoś z waszych psuje wszystkim nastrój o ${Math.abs(SMIERC_NASTROJ)} na dobę.`,
            `The death of one of your people spoils everyone’s mood by ${Math.abs(SMIERC_NASTROJ)} for a day.`,
          ),
        ],
        fakty: [
          fakt(
            'wyprawa',
            L('Rana w kłopotach na wyprawie', 'Wound in trouble on a supply run'),
            L(`od −${RANA_WYPRAWA[0]} do −${RANA_WYPRAWA[1]}`, `from −${RANA_WYPRAWA[0]} to −${RANA_WYPRAWA[1]}`),
          ),
          fakt(
            'napad',
            L('Rana strażnika przy wtargnięciu szabrowników', 'Wound of a guard when looters get in'),
            `−${RANA_NAPAD}`,
          ),
          fakt('powrot', L('Powrót zdrowia', 'Recovery'), naGodz(stawkaZdrowia().powrot)),
          fakt('ambulatorium', L('Po badaniu ambulatorium', 'After the infirmary research'), `×${num(AMBU_TEMPO)}`),
          fakt('goraczka', L('Gorączka zabija po', 'The fever kills after'), godz(FEVER_TICKS / H)),
          fakt(
            'okno',
            L('Amputacja możliwa przez', 'Amputation possible for'),
            L(
              `${godz(AMPUTATE_WINDOW / H)} od ugryzienia, trwa ${czasTickow(AMPUTATE_TICKS)}`,
              `${godz(AMPUTATE_WINDOW / H)} after the bite, takes ${czasTickow(AMPUTATE_TICKS)}`,
            ),
          ),
          fakt(
            'szansa',
            L('Szansa amputacji', 'Amputation success chance'),
            L(
              `${proc(AMPUTACJA.baza)} plus ${signed(AMPUTACJA.poziom * 100, 0)} pkt za poziom Medycyny i ${signed(AMPUTACJA.lek * 100, 0)} pkt z lekiem, najwyżej ${proc(AMPUTACJA.max)}`,
              `${proc(AMPUTACJA.baza)} plus ${signed(AMPUTACJA.poziom * 100, 0)} pts per Medicine level and ${signed(AMPUTACJA.lek * 100, 0)} pts with a medicine, at most ${proc(AMPUTACJA.max)}`,
            ),
          ),
          fakt(
            'kikut',
            L('Po udanej amputacji', 'After a successful amputation'),
            L(
              `kikut: trafienie −${KIKUT_CELNOSC} pkt, zdrowie −${RANA_AMPUTACJA}`,
              `a stump: hit chance −${KIKUT_CELNOSC} pts, health −${RANA_AMPUTACJA}`,
            ),
          ),
          fakt(
            'smierc',
            L('Nastrój wszystkich po śmierci', 'Everyone’s mood after a death'),
            `${signed(SMIERC_NASTROJ, 0)}`,
          ),
        ],
        jak: [
          c.touch
            ? L(
                `Karta ugryzionego ma przycisk „Amputować”: stuknijcie go w ciągu dwóch godzin, a ktoś z ${c.words.zarzad.dk} utnie kończynę.`,
                `The bitten person’s card has an “Amputate” button: tap it within two hours and someone from ${c.e.krotko} takes the limb off.`,
              )
            : L(
                `Karta ugryzionego ma przycisk „Amputować”: kliknijcie go w ciągu dwóch godzin, a ktoś z ${c.words.zarzad.dk} utnie kończynę.`,
                `The bitten person’s card has an “Amputate” button: click it within two hours and someone from ${c.e.krotko} takes the limb off.`,
              ),
        ],
        zobacz: ['potrzeba:health', 'ludzie:walka', 'zarzad:zaufanie', 'zarzad:wkurzenie', 'badanie:t_ambu'],
      }),
      'rana ranny leczenie zdrowie ugryzienie gorączka amputacja wound bite fever',
    ),

    def(
      'ludzie:nastroje',
      'ludzie',
      () => L('Chwilowe nastroje', 'Temporary moods'),
      (c) => ({
        zdania: [
          L(
            'Chwilowy nastrój to dopisek do nastroju z potrzeb: ma powód, wartość i czas trwania, a widać go na karcie osoby.',
            'A temporary mood is an addition to mood: it has a reason, a value and a duration, and it shows on the person card.',
          ),
          L(
            'Ten sam powód drugi raz tylko przedłuża czas, nie dodaje się po raz drugi.',
            'The same reason a second time only extends the time and is not added twice.',
          ),
          L(
            'Dobre dają ciepły i wspólny posiłek, wieści ze świata, odpędzenie szabrowników i uratowanie kolegi.',
            'Good ones come from a hot and a shared meal, news from outside, driving looters off and saving a friend.',
          ),
          L(
            'Złe dają zimna konserwa, racje, spanie na podłodze, palenie mebli, napad, czyjaś śmierć i gorączka.',
            'Bad ones come from cold tinned food, rations, sleeping on the floor, burning furniture, a raid, somebody’s death and fever.',
          ),
        ],
        fakty: NASTROJE.map((n, k) =>
          fakt(
            `nastroj-${k}`,
            nastrojEtykieta(n, c),
            L(`${signed(n.d, 0)} na ${czasTickow(n.ticks)}`, `${signed(n.d, 0)} for ${czasTickow(n.ticks)}`),
          ),
        ),
        zobacz: ['potrzeba:mood', 'ludzie:sen', 'zasob:meble', 'uchwala:u_meble', 'ludzie:karta'],
      }),
      'nastrój powód dopisek mood Nowa osoba w zarządzie',
    ),
  ];
}
