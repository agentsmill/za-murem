/* Wędrowcy i obce ekipy za dnia (docs/superpowers/specs/2026-10-18-wedrowcy-design.md): terminy, czasy, worek
   wędrowca, wieści z rozmowy i napisy. Czyste dane i funkcje dla symulacji i menu. Chodzą tylko w grze z opcją
   SimOpts.obcy (jak handlarz), więc losowanie ze st.rng nie rusza gier i botów bez niej. Napisy w obu językach:
   menu i opisy prac biorą je przez tr() w bieżącym języku, a wieść zostaje w stanie po polsku (st.obcy.wiesc,
   jak inne napisy symulacji) i po angielsku pokazuje ją wiescEn, ze słownika wszystkich wariantów.

   Werbunek (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, część B): po rozmowie wędrowiec ma osobę
   (imię, zawód, umiejętności), cel (idzie do rodziny) i ewentualnie ukryte ugryzienie, wszystko z ziarna świata
   i numeru wędrowca (id jego pionka), nigdy ze st.rng, żeby gry bez rozmów biegły jak dotąd. Szansa zaproszenia
   to czysta funkcja szansaWerbunku; samo losowanie robi symulacja ze st.rng. Zaufania we wzorze nie ma, bo
   symulacja go nie zna. */

import { ADS_EN, zawodEn } from '../content/data.en.ts';
import { ADS } from '../content/data.ts';
import { makePerson, type Person, wiek } from '../content/people.ts';
import { clamp, hashString, mulberry, nextRandom, type RngState } from '../core/rng.ts';
import type { Mat } from './budowle.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from './clock.ts';
import { NAPISY as HANDEL, tickAt } from './handlarz.ts';
import { UKRYTY_UGRYZIONY } from './sasiedzi.ts';
import { WRECK_SEARCH_TICKS } from './surowce.ts';

/** wędrowiec przystaje przy siatce 20–40 minut gry; rozmowa i zaproszenie dokładają mu jeszcze 10 minut (`TALK_EXTRA`) */
export const PAUSE_MIN = TICKS_PER_HOUR / 3;
export const PAUSE_MAX = (2 * TICKS_PER_HOUR) / 3;
export const TALK_EXTRA = TICKS_PER_HOUR / 6;
/** po skończonej rozmowie wędrowiec czeka przy siatce na zaproszenie jeszcze godzinę gry (10 minut gry to około 7 s przy
    1×, gracz nie zdążyłby kliknąć); gra bez rozmów go nie zna */
export const PO_ROZMOWIE = TICKS_PER_HOUR;
/** rozmowa przez siatkę trwa 5 minut */
export const TALK_TICKS = TICKS_PER_HOUR / 12;
/** wędrowiec z plecakiem chodzi wolniej od zarządu, uciekający szybciej */
export const WANDER_SPEED = 0.8;
export const FLEE_SPEED = 1.3;
export const WANDERER_HP = 60;
/** ekipa przeszukuje wrak ostrożnie: dwa razy dłużej niż zarząd */
export const CREW_SEARCH_TICKS = 2 * WRECK_SEARCH_TICKS;
/** przegonić: wystarczy podejść na tyle metrów */
export const SHOO_REACH = 3;
/** pościg przy napaści i przeganianiu: najwyżej tyle, potem zarząd odpuszcza */
export const CHASE_TICKS = TICKS_PER_HOUR / 2;
/** nastroje: rozmowa (na 6 godzin), napaść na wędrowca (na dobę, napastnik i reszta) */
export const TALK_MOOD = 3;
export const TALK_MOOD_TICKS = 6 * TICKS_PER_HOUR;
export const MUG_MOOD = -4;
export const MUG_MOOD_OTHERS = -2;

/** zaproszenie albo pytanie o rękę przez siatkę trwa 2 minuty gry */
export const ZAPROS_TICKS = Math.round(TICKS_PER_HOUR / 30);
/** nastrój reszty zarządu po nowej osobie w zarządzie (na pół doby) */
export const NOWY_MOOD = 3;
export const NOWY_MOOD_TICKS = 12 * TICKS_PER_HOUR;
/** napaść na wędrowca albo handlarza obniża szansę zaproszenia przez tyle czasu */
export const NAPAD_PAMIEC = 2 * TICKS_PER_DAY;

/** ziarno wędrowca z ziarna świata i numeru (id jego pionka), nigdy ze st.rng: gra, w której nikt z wędrowcem nie
    rozmawia, biegnie dokładnie tak jak bez werbunku. sol rozdziela niezależne losowania tego samego wędrowca. */
const ziarnoWedrowca = (seed: number, nr: number, sol = ''): number =>
  Number.parseInt(hashString(`${seed}:wedrowiec:${nr}${sol}`), 16);

/** Osoba wędrowca (imię, wiek, zawód, umiejętności, cechy) z generatora przybyszów (makePerson). Id puste: dostaje
    je dopiero przyjęty (w1, w2…). zajete to imiona, których generator ma unikać (zarząd), jak przy przybyszach. */
export function osobaWedrowca(seed: number, nr: number, zajete: ReadonlySet<string> = new Set()): Person {
  return { ...makePerson(mulberry(ziarnoWedrowca(seed, nr)), zajete, () => 0), id: '' };
}

/** połowa wędrowców idzie do rodziny: ma swój cel i o połowę mniejszą szansę, że zostanie */
export const celWedrowca = (seed: number, nr: number): boolean => mulberry(ziarnoWedrowca(seed, nr, ':cel'))() < 0.5;

/** tryb zombie: co piąty wędrowiec ukrywa ugryzienie, jak gospodarstwa sąsiadów (UKRYTY_UGRYZIONY) */
export const ugryzienieWedrowca = (seed: number, nr: number): boolean =>
  mulberry(ziarnoWedrowca(seed, nr, ':ugryzienie'))() < UKRYTY_UGRYZIONY;

/** od ilu godzin ukryty ugryziony ma gorączkę w chwili przyjęcia (1–6, jak u sąsiadów) */
export const ugryzionyOdGodzin = (seed: number, nr: number): number =>
  1 + Math.floor(mulberry(ziarnoWedrowca(seed, nr, ':godziny'))() * 6);

/** co wpływa na szansę, że wędrowiec zgodzi się zostać */
export interface OkolicznosciWerbunku {
  /** porcje jedzenia w zapasach na osobę z zarządu */
  jedzenieNaGlowe: number;
  /** jest wolne łóżko tam, dokąd miałby trafić */
  wolneLozko: boolean;
  /** w ciągu ostatnich dwóch dób zarząd napadł na wędrowca albo handlarza */
  napadDwieDoby: boolean;
  /** wędrowiec idzie do rodziny */
  maCel: boolean;
}

/** Szansa zaproszenia: 0,30, +0,20 przy jedzeniu na co najmniej 2 porcje na osobę, +0,15 przy wolnym łóżku, −0,30
    po niedawnej napaści; w zakresie 0,05–0,85, a przy celu połowa tego. Zaufania nie ma, bo symulacja go nie zna. */
export function szansaWerbunku(o: OkolicznosciWerbunku): number {
  const s = clamp(
    0.3 + (o.jedzenieNaGlowe >= 2 ? 0.2 : 0) + (o.wolneLozko ? 0.15 : 0) - (o.napadDwieDoby ? 0.3 : 0),
    0.05,
    0.85,
  );
  return o.maCel ? s / 2 : s;
}

/** pierwszy wędrowiec: dzień 2, między 8:00 a 12:00 */
export const firstWanderer = (rng: RngState): number => tickAt(2, 8 + 4 * nextRandom(rng));

/** następny wędrowiec 3–8 godzin po przyjściu poprzedniego; po 17:00 następnego dnia między 8:00 a 11:00 */
export function nextWanderer(tick: number, rng: RngState): number {
  const t = tick + Math.round((3 + 5 * nextRandom(rng)) * TICKS_PER_HOUR);
  if (dayOf(t) === dayOf(tick) && hourOf(t) < 17) return t;
  return tickAt(dayOf(tick) + 1, 8 + 3 * nextRandom(rng));
}

/** Tryb zombie, jak w The Walking Dead (Mateusz 18.10.2026): wędrowcy to ocaleni, którzy przemykają rzadko i tylko
    na chwilę (10–20 minut przy siatce), ekipy przychodzą co 3–5 dni, a jedni i drudzy uciekają, gdy szwendacz
    podejdzie do SPOOK_R m, i są dla szwendaczy ofiarą (zagryziony wstaje jak każdy zmarły). */
export const PAUSE_ZOMBIE_MIN = TICKS_PER_HOUR / 6;
export const PAUSE_ZOMBIE_MAX = TICKS_PER_HOUR / 3;
export const SPOOK_R = 6;

/** następny ocalały 6–14 godzin po przyjściu poprzedniego; po 16:00 następnego dnia między 8:00 a 12:00 */
export function nextWandererZombie(tick: number, rng: RngState): number {
  const t = tick + Math.round((6 + 8 * nextRandom(rng)) * TICKS_PER_HOUR);
  if (dayOf(t) === dayOf(tick) && hourOf(t) < 16) return t;
  return tickAt(dayOf(tick) + 1, 8 + 4 * nextRandom(rng));
}

/** pierwsza ekipa w trybie zombie: dzień 3–5; następna za 3–5 dni, zawsze między 9:00 a 14:00 */
export const firstCrewZombie = (rng: RngState): number =>
  tickAt(3 + Math.floor(3 * nextRandom(rng)), 9 + 5 * nextRandom(rng));
export const nextCrewZombie = (day: number, rng: RngState): number =>
  tickAt(day + 3 + Math.floor(3 * nextRandom(rng)), 9 + 5 * nextRandom(rng));

/** pierwsza ekipa: dzień 3 albo 4, między 9:00 a 14:00 */
export const firstCrew = (rng: RngState): number =>
  tickAt(3 + Math.floor(2 * nextRandom(rng)), 9 + 5 * nextRandom(rng));

/** następna ekipa za dwa albo trzy dni, między 9:00 a 14:00 */
export const nextCrew = (day: number, rng: RngState): number =>
  tickAt(day + 2 + Math.floor(2 * nextRandom(rng)), 9 + 5 * nextRandom(rng));

/** worek wędrowca po napaści: 1–3 porcje jedzenia, w połowie przypadków część, w co piątym lek */
export function mugLoot(rng: RngState): Partial<Record<Mat, number>> {
  const out: Partial<Record<Mat, number>> = { jedzenie: 1 + Math.floor(3 * nextRandom(rng)) };
  if (nextRandom(rng) < 0.5) out.czesci = 1;
  if (nextRandom(rng) < 0.2) out.leki = 1;
  return out;
}

/** napis w obu językach */
export interface Napis {
  pl: string;
  en: string;
}

/** auto, auta, aut */
const aut = (n: number): string =>
  n === 1 ? 'auto' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'auta' : 'aut';

/** co wiadomo do wieści: za ile dni handlarz (−1: nie przyjdzie), ile nieprzeszukanych wraków przy ulicy */
export interface GossipCtx {
  traderIn: number;
  wrecksLeft: number;
}

/** Wieść z rozmowy z wędrowcem: kiedy handlarz, ile aut zostało, ludzie z łomami albo ogłoszenie ze słupa (z 0.3).
    Losowanie jak dotąd (rodzaj wieści, przy ogłoszeniu jeszcze jego numer), tekst z gossipText. */
export function gossip(ctx: GossipCtx, rng: RngState): Napis {
  const k = Math.floor(4 * nextRandom(rng));
  const ad = k === 3 ? Math.floor(nextRandom(rng) * ADS.length) : 0;
  return gossipText(k, ctx, ad);
}

/** tekst wieści: k rodzaj (0 handlarz, 1 auta, 2 ludzie z łomami, 3 ogłoszenie), ad numer ogłoszenia z ADS */
export function gossipText(k: number, ctx: GossipCtx, ad: number): Napis {
  if (k === 0) {
    if (ctx.traderIn < 0)
      return {
        pl: 'Wędrowiec mówi, że handlarz z wózkiem omija was teraz szerokim łukiem.',
        en: 'The wanderer says the trader with the cart now gives you a wide berth.',
      };
    const kiedy = ['jeszcze dziś', 'jutro', 'pojutrze'][ctx.traderIn] ?? `za ${ctx.traderIn} dni`;
    const when = ['later today', 'tomorrow', 'the day after tomorrow'][ctx.traderIn] ?? `in ${ctx.traderIn} days`;
    return {
      pl: `Wędrowiec mówi, że handlarz z wózkiem ma tu być ${kiedy}.`,
      en: `The wanderer says the trader with the cart should be here ${when}.`,
    };
  }
  if (k === 1) {
    const n = ctx.wrecksLeft;
    return n > 0
      ? {
          pl: `Wędrowiec mówi, że przy ulicy stoją jeszcze ${n} ${aut(n)}, których nikt nie przeszukał.`,
          en: `The wanderer says there ${n === 1 ? 'is still 1 car' : `are still ${n} cars`} by the road that nobody has searched.`,
        }
      : {
          pl: 'Wędrowiec mówi, że w okolicy nie ma już aut, w których coś zostało.',
          en: 'The wanderer says there are no cars left around here with anything in them.',
        };
  }
  if (k === 2)
    return {
      pl: 'Wędrowiec mówi, że po okolicy chodzą ludzie z łomami i przeszukują auta.',
      en: 'The wanderer says people with crowbars are going round searching cars.',
    };
  return {
    pl: `Wędrowiec mówi, że na słupie przy przystanku wisi ogłoszenie: „${ADS[ad]}”`,
    en: `The wanderer says there’s a notice on the pole by the bus stop: “${ADS_EN[ad]}”`,
  };
}

/** rady ocalałych w trybie zombie: to, czego uczy gra (hałas, zamknięta brama, amputacja, dobijanie) */
const RADY: readonly Napis[] = [
  {
    pl: 'Ocalały mówi, żeby nie strzelać, bo strzał ściąga je z całej okolicy.',
    en: 'The survivor says not to shoot: a gunshot draws them in from all around.',
  },
  {
    pl: 'Ocalały mówi, że widział ludzi, którzy biorą wszystko i nie pytają. Radzi trzymać bramę zamkniętą.',
    en: 'The survivor says he saw people who take everything and ask nothing. He says keep the gate shut.',
  },
  {
    pl: 'Ocalały mówi, że ugryzioną rękę trzeba odciąć od razu, potem jest za późno.',
    en: 'The survivor says a bitten arm has to come off at once; later it is too late.',
  },
  {
    pl: 'Ocalały mówi, że zmarłych trzeba dobijać w głowę, bo po godzinie wstają.',
    en: 'The survivor says the dead must be finished with a blow to the head, or they get up within the hour.',
  },
];

/** Wieść w trybie zombie, od ocalałego: handlarz (prawie ich nie ma), auta, stado, rada (k i r losowane tak jak
    w gossip). */
export function gossipZombie(ctx: GossipCtx, rng: RngState): Napis {
  const k = Math.floor(4 * nextRandom(rng));
  const r = k === 3 ? Math.floor(nextRandom(rng) * RADY.length) : 0;
  return gossipZombieText(k, ctx, r);
}

export function gossipZombieText(k: number, ctx: GossipCtx, r: number): Napis {
  if (k === 0) {
    if (ctx.traderIn < 0 || ctx.traderIn > 7)
      return {
        pl: 'Ocalały mówi, że handlarzy prawie już nie ma: większość nie przetrwała drogi.',
        en: 'The survivor says there are hardly any traders left: most did not survive the road.',
      };
    const kiedy = ['jeszcze dziś', 'jutro', 'pojutrze'][ctx.traderIn] ?? `za ${ctx.traderIn} dni`;
    const when = ['later today', 'tomorrow', 'the day after tomorrow'][ctx.traderIn] ?? `in ${ctx.traderIn} days`;
    return {
      pl: `Ocalały mówi, że widział handlarza z wózkiem za torami. Może dotrze tu ${kiedy}, jeśli przeżyje drogę.`,
      en: `The survivor says he saw a trader with a cart beyond the tracks. He may get here ${when}, if he survives the road.`,
    };
  }
  if (k === 1) {
    const n = ctx.wrecksLeft;
    return n > 0
      ? {
          pl: `Ocalały mówi, że przy ulicy stoją jeszcze ${n} ${aut(n)}, których nikt nie przeszukał. Pełno tam szwendaczy.`,
          en: `The survivor says there ${n === 1 ? 'is still 1 car' : `are still ${n} cars`} by the road nobody has searched. Shamblers all around them.`,
        }
      : {
          pl: 'Ocalały mówi, że w okolicy nie ma już aut, w których coś zostało.',
          en: 'The survivor says there are no cars left around here with anything in them.',
        };
  }
  if (k === 2)
    return {
      pl: 'Ocalały mówi, że stado ciągnie od strony obwodnicy. Tej nocy będzie ich więcej.',
      en: 'The survivor says a herd is moving in from the ring road. There will be more of them tonight.',
    };
  return RADY[r] ?? RADY[0];
}

/** wieść z polskiego tekstu w stanie po angielsku: słownik ze wszystkich wariantów gossipText i przeszukali (liczby
    do 99) oraz wieści po napaści na handlarza; nieznany tekst zostaje jak jest */
let wiesciEn: Map<string, string> | null = null;
export function wiescEn(pl: string): string {
  if (!wiesciEn) {
    wiesciEn = new Map();
    const put = (n: Napis) => wiesciEn!.set(n.pl, n.en);
    for (let n = -1; n < 100; n++) {
      put(gossipText(0, { traderIn: n, wrecksLeft: 0 }, 0));
      if (n >= 0) put(gossipText(1, { traderIn: 0, wrecksLeft: n }, 0));
    }
    put(gossipText(2, { traderIn: 0, wrecksLeft: 0 }, 0));
    // tryb zombie: wieści ocalałych
    for (let n = -1; n < 100; n++) {
      put(gossipZombieText(0, { traderIn: n, wrecksLeft: 0 }, 0));
      if (n >= 0) put(gossipZombieText(1, { traderIn: 0, wrecksLeft: n }, 0));
    }
    put(gossipZombieText(2, { traderIn: 0, wrecksLeft: 0 }, 0));
    for (let r = 0; r < RADY.length; r++) put(gossipZombieText(3, { traderIn: 0, wrecksLeft: 0 }, r));
    for (let ad = 0; ad < ADS.length; ad++) put(gossipText(3, { traderIn: 0, wrecksLeft: 0 }, ad));
    for (const model of ['maluch', 'polonez']) put(NAPISY.przeszukali(model));
    // wieści po napaści na handlarza (src/sim/handlarz.ts)
    put(HANDEL.uciekl);
    put(HANDEL.odszedlZly);
    put(HANDEL.zabity);
    put(HANDEL.szwendacze);
    put(HANDEL.zagryziony);
    for (let n = 1; n < 10; n++) put(HANDEL.zemsta(n));
    // werbunek: odmowa i pytanie o rękę (wędrowiec albo ocalały)
    for (const z of [false, true]) {
      put(NAPISY.odmowa(z));
      put(NAPISY.rekaCzysta(z));
      put(NAPISY.rekaUgryziona(z));
    }
  }
  const znany = wiesciEn.get(pl);
  if (znany) return znany;
  // wieść z rozmowy: plotka, nowa linia i kto to jest (kto: imię, zawód, wiek i cel)
  const k = pl.indexOf('\n');
  if (k > 0) return `${wiescEn(pl.slice(0, k))} ${ktoEn(pl.slice(k + 1))}`;
  return pl;
}

/** angielska wersja linii NAPISY.kto z polskiej (imię, zawód i wiek z tekstu); nieznany kształt zostaje */
function ktoEn(pl: string): string {
  const m = /^Przedstawia się: (.+), (.+), (\d+) (?:rok|lata|lat)\.( .+)?$/.exec(pl);
  if (!m) return pl;
  return NAPISY.kto({ first: m[1], prof: m[2], age: Number(m[3]) }, m[4]?.trim() === CEL_PL).en;
}

/** cel wędrowca w rozmowie (połowa wędrowców idzie do rodziny) */
const CEL_PL = 'Idzie do rodziny, więc raczej nie zostanie.';
const CEL_EN = 'Heading to family, so unlikely to stay.';

export const NAPISY = {
  zagadac: { pl: 'Zagadać', en: 'Talk to the wanderer' },
  napasc: { pl: 'Napaść na wędrowca', en: 'Rob the wanderer' },
  przegonic: { pl: 'Przegonić', en: 'Chase them off' },
  nastrojRozmowa: { pl: 'Wieści ze świata', en: 'News from outside' },
  nastrojNapasc: { pl: 'Napadliśmy na wędrowca', en: 'We robbed a wanderer' },
  przeszukali: (model: string): Napis => ({
    pl: `Obcy przeszukali ${model === 'polonez' ? 'poloneza' : 'malucha'} przy ulicy.`,
    en: `Strangers have searched the ${model === 'polonez' ? 'Polonez' : 'Fiat 126p'} by the road.`,
  }),
  // opisy prac obcych i zarządu
  wander: [
    { pl: 'Idzie ulicą.', en: 'Walking down the street.' },
    { pl: 'Przystanął przy siatce.', en: 'Stopped by the fence.' },
    { pl: 'Odchodzi.', en: 'Leaving.' },
    { pl: 'Ucieka.', en: 'Running away.' },
  ],
  scavenge: [
    { pl: 'Idzie do auta z łomem.', en: 'Heading to a car with a crowbar.' },
    { pl: 'Przeszukuje auto.', en: 'Searching the car.' },
    { pl: 'Odchodzi z łupem.', en: 'Leaving with the loot.' },
    { pl: 'Ucieka.', en: 'Running away.' },
  ],
  idzieZagadac: { pl: 'Idzie zagadać wędrowca.', en: 'Going to talk to the wanderer.' },
  rozmawia: { pl: 'Rozmawia przez siatkę.', en: 'Talking through the fence.' },
  idzieNapasc: { pl: 'Idzie napaść na wędrowca.', en: 'Going to rob the wanderer.' },
  idziePrzegonic: { pl: 'Idzie przegonić obcych.', en: 'Going to chase the strangers off.' },
  poZagadac: { pl: 'Zagada wędrowca.', en: 'Off to talk to the wanderer.' },
  poZagadacWielu: { pl: 'Jedna osoba zagada wędrowca.', en: 'One person goes to talk to the wanderer.' },
  poNapasc: { pl: 'Napadnie na wędrowca.', en: 'Off to rob the wanderer.' },
  poNapascWielu: { pl: 'Jedna osoba napadnie na wędrowca.', en: 'One person goes to rob the wanderer.' },
  poPrzegonic: { pl: 'Przegoni obcych.', en: 'Going to chase the strangers off.' },
  poPrzegonicWielu: { pl: 'Jedna osoba przegoni obcych.', en: 'One person goes to chase the strangers off.' },
  // werbunek: menu, opisy prac i nastrój
  zaprosic: (n: number): Napis => ({
    pl: `Zaprosić do nas (${n}% szans)`,
    en: `Invite to join us (${n}% chance)`,
  }),
  zaprosicMieszkanca: (n: number): Napis => ({
    pl: `Zaprosić do nas jako mieszkańca (${n}%)`,
    en: `Invite to stay as a resident (${n}%)`,
  }),
  zaprosicBez: { pl: 'Zaprosić do nas', en: 'Invite to join us' },
  brakLozka: { pl: 'Nie ma wolnego łóżka', en: 'No free bed' },
  zapytacORege: { pl: 'Zapytać o rękę', en: 'Ask to see their arm' },
  nastrojNowy: { pl: 'Nowa osoba w zarządzie', en: 'New person on the board' },
  idzieZaprosic: { pl: 'Idzie zaprosić wędrowca do nas.', en: 'Going to invite the wanderer to stay.' },
  zaprasza: { pl: 'Zaprasza wędrowca przez siatkę.', en: 'Inviting the wanderer through the fence.' },
  idzieZapytac: { pl: 'Idzie zapytać wędrowca o rękę.', en: 'Going to ask the wanderer about their arm.' },
  pytaORege: { pl: 'Pyta wędrowca o rękę.', en: 'Asking the wanderer about their arm.' },
  poZaprosic: { pl: 'Zaprosi wędrowca.', en: 'Off to invite the wanderer.' },
  poZaprosicWielu: { pl: 'Jedna osoba zaprosi wędrowca.', en: 'One person goes to invite the wanderer.' },
  poRege: { pl: 'Zapyta o rękę.', en: 'Off to ask about their arm.' },
  poRegeWielu: { pl: 'Jedna osoba zapyta o rękę.', en: 'One person goes to ask about their arm.' },
  // wieści po zaproszeniu i pytaniu o rękę (w trybie zombie mówi ocalały)
  odmowa: (zombie: boolean): Napis => ({
    pl: `${zombie ? 'Ocalały' : 'Wędrowiec'} dziękuje za zaproszenie i idzie dalej.`,
    en: `The ${zombie ? 'survivor' : 'wanderer'} thanks you for the invitation and moves on.`,
  }),
  rekaCzysta: (zombie: boolean): Napis => ({
    pl: `${zombie ? 'Ocalały' : 'Wędrowiec'} podwija rękaw: ani śladu zębów.`,
    en: `The ${zombie ? 'survivor' : 'wanderer'} rolls up a sleeve: not a tooth mark.`,
  }),
  rekaUgryziona: (zombie: boolean): Napis => ({
    pl: `${zombie ? 'Ocalały' : 'Wędrowiec'} nie chce pokazać ręki i odchodzi.`,
    en: `The ${zombie ? 'survivor' : 'wanderer'} won’t show their arm and walks away.`,
  }),
  /** kim jest wędrowiec, z rozmowy: imię, zawód (małymi literami), wiek i ewentualnie cel */
  kto: (o: { first: string; prof: string; age: number }, cel: boolean): Napis => ({
    pl: `Przedstawia się: ${o.first}, ${o.prof.toLowerCase()}, ${wiek(o.age)}.${cel ? ` ${CEL_PL}` : ''}`,
    en: `Introduces themselves: ${o.first}, ${zawodEn(o.prof.toLowerCase())}, aged ${o.age}.${cel ? ` ${CEL_EN}` : ''}`,
  }),
} as const;
