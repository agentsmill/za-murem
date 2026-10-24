/* Napisy fali 2 M2 (sąsiednie budynki, docs/M2-fala-2.md) w obu językach: menu przy cudzych drzwiach i w pomieszczeniach
   sąsiada, opisy prac, podpowiedzi po poleceniu, karta spotkania z lokatorami, zdania po spotkaniu i przy drzwiach
   i karta budynku. Każdy napis to Tx (src/core/jezyk.ts): kod, który rysuje, bierze go w bieżącym języku przez tr(),
   a stan gry trzyma tylko identyfikatory (st.sasiedzi.napis.co i liczby), więc zdanie powstaje przy rysowaniu w obu
   językach. Angielski według docs/SLOWNICZEK-EN.md: zawody przez zawodEn, nazwy budynków z mapy przez nazwaBudynkuEn,
   zapasy w zdaniu z liczbą z przodu („5 planks and 2 food”). Czyste dane i funkcje bez DOM. */

import { liczba, type Tx } from '../core/jezyk.ts';
import { nazwaBudynkuEn } from '../world/classify.en.ts';
import type { RoomKind } from '../world/interior.ts';
import { zawodEn } from './data.en.ts';

/** napis w obu językach */
export type Dwa = Tx;

/** polska liczba mnoga: 1, 2–4 (bez 12–14), reszta */
const pl3 = (n: number, one: string, few: string, many: string): string => {
  const d = n % 10;
  const t = n % 100;
  return n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

/** angielska liczba mnoga: 1 i reszta */
const en2 = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** pomieszczenia: biernik do „Przeszukać …” i angielska nazwa (jak ROOM_EN w src/sim/nazwy.en.ts) */
const POKOJ: Record<RoomKind, Dwa> = {
  klatka: { pl: 'klatkę', en: 'stairwell' },
  przedpokoj: { pl: 'przedpokój', en: 'hallway' },
  pokoj: { pl: 'pokój', en: 'room' },
  kuchnia: { pl: 'kuchnię', en: 'kitchen' },
  lazienka: { pl: 'łazienkę', en: 'bathroom' },
  sala: { pl: 'salę', en: 'hall' },
  hala: { pl: 'halę', en: 'shed' },
  zaplecze: { pl: 'zaplecze', en: 'back room' },
};

/** materiały w zdaniach o łupie i zapasach: polska nazwa i angielska z liczbą (jedna sztuka, więcej) */
const MAT: Record<string, { pl: string; en: readonly [string, string] }> = {
  deski: { pl: 'deski', en: ['plank', 'planks'] },
  zlom: { pl: 'złom', en: ['scrap', 'scrap'] },
  czesci: { pl: 'części', en: ['part', 'parts'] },
  jedzenie: { pl: 'jedzenie', en: ['food', 'food'] },
  leki: { pl: 'leki', en: ['pack of meds', 'packs of meds'] },
  drewno: { pl: 'drewno', en: ['wood', 'wood'] },
};

/** „jedzenie 3, leki 1” i „3 food and 1 pack of meds” (bez zer); pusty napis, gdy nic */
export function ileTekst(ile: Partial<Record<string, number>> | undefined): Dwa {
  const list = Object.entries(ile ?? {}).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  const en = list.map(([m, n]) => `${n} ${MAT[m] ? MAT[m].en[n === 1 ? 0 : 1] : m}`);
  return {
    pl: list.map(([m, n]) => `${MAT[m]?.pl ?? m} ${n}`).join(', '),
    en: en.length > 1 ? `${en.slice(0, -1).join(', ')} and ${en[en.length - 1]}` : (en[0] ?? ''),
  };
}

/** nazwa budynku z mapy po angielsku („Blok nr 10F” → „Block 10F”; nazwa własna zostaje) */
const nazwaEn = (nazwa: string): string => nazwaBudynkuEn(nazwa);

// ---------------------------------------------------------------- menu i prace

/** wariant materiału wspólnego płotu (WariantPlotu z src/sim/sasiedzi.ts) */
type WariantNapisu = 'mieszany' | 'deski' | 'zlom';

/** dopisek do nazwy płotu z jednego materiału */
const PLOT_Z: Record<WariantNapisu, Dwa> = {
  mieszany: { pl: '', en: '' },
  deski: { pl: ' z desek', en: 'plank ' },
  zlom: { pl: ' ze złomu', en: 'scrap ' },
};

export const MENU = {
  otworz: { pl: 'Otworzyć drzwi', en: 'Open the door' },
  otworzMieszkanie: { pl: 'Otworzyć drzwi mieszkania', en: 'Open the flat door' },
  zapukaj: { pl: 'Zapukać', en: 'Knock' },
  zapukajMieszkanie: { pl: 'Zapukać do mieszkania', en: 'Knock on the flat door' },
  wywaz: { pl: 'Wyważyć drzwi', en: 'Force the door' },
  wywazMieszkanie: { pl: 'Wyważyć drzwi mieszkania', en: 'Force the flat door' },
  wejdz: { pl: 'Wejść', en: 'Go in' },
  zabij: { pl: 'Zabić drzwi deskami', en: 'Nail planks over the door' },
  odbij: { pl: 'Odbić deski', en: 'Pull the planks off' },
  /** dopisek przy drzwiach od ulicy budynku, który stoi przy podwórku */
  wylom: { pl: ' (droga z ulicy na podwórko)', en: ' (opens a way from the street into the yard)' },
  przeszukaj: (k: RoomKind): Dwa => ({ pl: `Przeszukać ${POKOJ[k].pl}`, en: `Search the ${POKOJ[k].en}` }),
  /** etap 2: na schodach otwartego budynku; left: ile pięter zostało */
  pietro: (left: number): Dwa => ({
    pl: `Przeszukać piętro (zostało ${left})`,
    en: `Search a floor upstairs (${left} left)`,
  }),
  okradnij: { pl: 'Okraść mieszkanie (lokatorów nie ma)', en: 'Rob the flat (nobody’s home)' },
  /** etap 3: wspólny płot z kosztem i czasem; h: godziny pracy; wariant materiału: deska i złom (oba w koszcie) albo
      z desek czy ze złomu (materiał płotu pierwszy, deski na drzwi do zabicia po złomie) */
  plot: (m: number, deski: number, zlom: number, h: number, wariant: WariantNapisu = 'mieszany'): Dwa => {
    const d = {
      pl: `${deski} ${pl3(deski, 'deska', 'deski', 'desek')}`,
      en: `${deski} ${en2(deski, 'plank', 'planks')}`,
    };
    const z = { pl: `${zlom} złomu`, en: `${zlom} scrap` };
    const co = wariant === 'deski' ? [d] : wariant === 'zlom' ? (deski > 0 ? [z, d] : [z]) : [d, z];
    const jaki = PLOT_Z[wariant];
    return {
      pl: `Otoczyć wspólnym płotem${jaki.pl} (${m} m: ${co.map((c) => c.pl).join(', ')}, ${liczba(h, 1, 'pl')} h)`,
      en: `Put up a shared ${jaki.en}fence (${m} m: ${co.map((c) => c.en).join(', ')}, ${liczba(h, 1, 'en')} h)`,
    };
  },
  plotDalej: { pl: 'Budować wspólny płot dalej', en: 'Keep building the shared fence' },
  plotNie: (why: string, m?: number): Dwa =>
    why === 'jezdnia'
      ? { pl: 'Wspólny płot: między wami jest jezdnia', en: 'Shared fence: there’s a road in the way' }
      : why === 'dlugi'
        ? {
            pl: `Wspólny płot: za długi (${m ?? 0} m, najwyżej 120 m)`,
            en: `Shared fence: too long (${m ?? 0} m, 120 m at most)`,
          }
        : { pl: 'Wspólny płot: tu się nie da', en: 'Shared fence: can’t be done here' },
} as const;

/** praca przy drzwiach: w drodze i przy drzwiach */
export const PRACA_DRZWI: Record<string, [Dwa, Dwa]> = {
  open: [
    { pl: 'Idzie otworzyć drzwi.', en: 'Going to open the door.' },
    { pl: 'Otwiera drzwi.', en: 'Opening the door.' },
  ],
  knock: [
    { pl: 'Idzie zapukać.', en: 'Going to knock.' },
    { pl: 'Puka do drzwi.', en: 'Knocking on the door.' },
  ],
  force: [
    { pl: 'Idzie wyważyć drzwi.', en: 'Going to force the door.' },
    { pl: 'Wyważa drzwi.', en: 'Forcing the door.' },
  ],
  board: [
    { pl: 'Idzie zabić drzwi deskami.', en: 'Going to nail planks over the door.' },
    { pl: 'Zabija drzwi deskami.', en: 'Nailing planks over the door.' },
  ],
  unboard: [
    { pl: 'Idzie odbić deski z drzwi.', en: 'Going to pull the planks off the door.' },
    { pl: 'Odbija deski z drzwi.', en: 'Pulling the planks off the door.' },
  ],
};

export const PRACA = {
  idziePrzeszukac: (k: RoomKind | null): Dwa => ({
    pl: `Idzie przeszukać ${k ? POKOJ[k].pl : 'pomieszczenie'} u sąsiadów.`,
    en: `Going to search the neighbours’ ${k ? POKOJ[k].en : 'room'}.`,
  }),
  przeszukuje: (k: RoomKind | null): Dwa => ({
    pl: `Przeszukuje ${k ? POKOJ[k].pl : 'pomieszczenie'} u sąsiadów.`,
    en: `Searching the neighbours’ ${k ? POKOJ[k].en : 'room'}.`,
  }),
  rozmawia: { pl: 'Rozmawia z sąsiadami.', en: 'Talking to the neighbours.' },
  idzieNaSchody: { pl: 'Idzie na schody.', en: 'Heading for the stairs.' },
  naPietrze: { pl: 'Przeszukuje piętro.', en: 'Searching a floor upstairs.' },
  /** etap 3: wspólny płot (faza 0 po materiał, 1 z materiałem, 2 stawia; pct gotowe w procentach) */
  plot: (faza: number, pct: number): Dwa =>
    faza === 0
      ? { pl: 'Idzie po materiał na wspólny płot.', en: 'Fetching materials for the shared fence.' }
      : faza === 1
        ? { pl: 'Niesie materiał na wspólny płot.', en: 'Carrying materials for the shared fence.' }
        : { pl: `Stawia wspólny płot (${pct}%).`, en: `Putting up the shared fence (${pct}%).` },
} as const;

/** podpowiedzi po poleceniu: jedna osoba, kilka zaznaczonych (polecenie bierze jedna) */
export const PO_POLECENIU: Record<
  'open' | 'knock' | 'force' | 'board' | 'unboard' | 'loot' | 'upstairs' | 'enclose',
  [Dwa, Dwa]
> = {
  enclose: [
    {
      pl: 'Postawi wspólny płot: najpierw doniesie deski i złom.',
      en: 'Off to put up the shared fence, planks and scrap first.',
    },
    {
      pl: 'Jedna osoba postawi wspólny płot: najpierw doniesie deski i złom.',
      en: 'One person goes to put up the shared fence, planks and scrap first.',
    },
  ],
  upstairs: [
    {
      pl: 'Pójdzie przeszukać piętro. Wróci za godzinę.',
      en: 'Off to search a floor upstairs. Back in an hour.',
    },
    {
      pl: 'Jedna osoba pójdzie przeszukać piętro. Wróci za godzinę.',
      en: 'One person goes to search a floor upstairs. Back in an hour.',
    },
  ],
  open: [
    { pl: 'Otworzy drzwi.', en: 'Off to open the door.' },
    { pl: 'Jedna osoba otworzy drzwi.', en: 'One person goes to open the door.' },
  ],
  knock: [
    { pl: 'Zapuka.', en: 'Off to knock.' },
    { pl: 'Jedna osoba zapuka.', en: 'One person goes to knock.' },
  ],
  force: [
    { pl: 'Wyważy drzwi. Będzie głośno.', en: 'Off to force the door. It’ll be loud.' },
    { pl: 'Jedna osoba wyważy drzwi. Będzie głośno.', en: 'One person goes to force the door. It’ll be loud.' },
  ],
  board: [
    { pl: 'Zabije drzwi deskami.', en: 'Off to nail planks over the door.' },
    { pl: 'Jedna osoba zabije drzwi deskami.', en: 'One person goes to nail planks over the door.' },
  ],
  unboard: [
    { pl: 'Odbije deski z drzwi.', en: 'Off to pull the planks off the door.' },
    { pl: 'Jedna osoba odbije deski z drzwi.', en: 'One person goes to pull the planks off the door.' },
  ],
  loot: [
    {
      pl: 'Przeszuka pomieszczenie i zaniesie łup na podwórko.',
      en: 'Off to search the room and carry the loot into the yard.',
    },
    {
      pl: 'Jedna osoba przeszuka pomieszczenie i zaniesie łup.',
      en: 'One person goes to search the room and carry the loot.',
    },
  ],
};

/** podpowiedź po poleceniu wspólnego płotu z jednego materiału (deska i złom: PO_POLECENIU.enclose) */
export const PO_PLOCIE: Record<'deski' | 'zlom', [Dwa, Dwa]> = {
  deski: [
    {
      pl: 'Postawi wspólny płot z desek: najpierw doniesie deski.',
      en: 'Off to put up the shared plank fence, planks first.',
    },
    {
      pl: 'Jedna osoba postawi wspólny płot z desek: najpierw doniesie deski.',
      en: 'One person goes to put up the shared plank fence, planks first.',
    },
  ],
  zlom: [
    {
      pl: 'Postawi wspólny płot ze złomu: najpierw doniesie złom.',
      en: 'Off to put up the shared scrap fence, scrap first.',
    },
    {
      pl: 'Jedna osoba postawi wspólny płot ze złomu: najpierw doniesie złom.',
      en: 'One person goes to put up the shared scrap fence, scrap first.',
    },
  ],
};

/** dopisek przy wyważaniu w trybie zombie */
export const HALAS_ZOMBIE: Dwa = { pl: ' Hałas ściągnie szwendaczy.', en: ' The noise will draw shamblers.' };

// ---------------------------------------------------------------- karta spotkania

export const KARTA = {
  naglowek: { pl: 'Sąsiedzi', en: 'Neighbours' },
  tytul: {
    atak: { pl: 'Rzucają się na was', en: 'They’re coming at you' },
    drzwi: { pl: 'Ktoś otworzył drzwi', en: 'Someone opened the door' },
    mieszkanie: { pl: 'W mieszkaniu ktoś jest', en: 'Someone’s in the flat' },
    /** spotkanie w środku domu jednorodzinnego (dom jest jednym mieszkaniem) */
    dom: { pl: 'W domu ktoś jest', en: 'Someone’s in the house' },
    pietro: { pl: 'Na piętrze ktoś jest', en: 'Someone’s upstairs' },
    szabrownicy: { pl: 'W środku są szabrownicy', en: 'There are looters inside' },
  },
  znani: { pl: 'Znacie ich z widzenia.', en: 'You know them by sight.' },
  obcy: { pl: 'Nie znacie ich.', en: 'You don’t know them.' },
  zamiar: {
    zyczliwi: { pl: 'Patrzą na was życzliwie.', en: 'They look friendly.' },
    nieufni: { pl: 'Patrzą nieufnie.', en: 'They look wary.' },
    wrodzy: { pl: 'Są wrogo nastawieni.', en: 'They’re hostile.' },
    zdesperowani: { pl: 'Widać, że są w potrzebie.', en: 'They’re clearly desperate.' },
  },
  nastroj: {
    spokoj: { pl: 'Są spokojni.', en: 'They’re calm.' },
    strach: { pl: 'Boją się.', en: 'They’re scared.' },
    gniew: { pl: 'Są wściekli.', en: 'They’re furious.' },
    zal: { pl: 'Niedawno kogoś stracili.', en: 'They lost someone recently.' },
    nadzieja: { pl: 'Mają nadzieję, że pomożecie.', en: 'They’re hoping you’ll help.' },
  },
  relacja: (rel: number): Dwa => {
    const [pl, en] =
      rel <= -50
        ? ['wrogość', 'hostility']
        : rel < -10
          ? ['niechęć', 'dislike']
          : rel <= 10
            ? ['obojętność', 'indifference']
            : rel <= 40
              ? ['sympatia', 'goodwill']
              : ['zaufanie', 'trust'];
    return { pl: `Stosunek do was: ${pl}.`, en: `How they feel about you: ${en}.` };
  },
  wywazone: { pl: 'Wyważyliście im drzwi.', en: 'You forced their door.' },
  /** tryb zombie: ktoś z nich ukrywa ugryzienie */
  reka: {
    pl: 'Ktoś z nich ma obandażowaną rękę i trzyma się z tyłu.',
    en: 'One of them has a bandaged arm and keeps to the back.',
  },
  szabrownicy: {
    pl: 'To nie lokatorzy. Siedzą tu od nocy i pilnują tego, co zabrali.',
    en: 'They’re not residents. They’ve been here since last night, guarding what they took.',
  },
  bezRozmowy: { pl: 'Nie ma czasu na rozmowę.', en: 'There’s no time to talk.' },
  /** osoba: imię i nazwisko, wiek, zawód małą literą (zawody 0.3 są pisane wielką); po angielsku zawód przed
      wiekiem jak na karcie osoby („Nurse, 52”) */
  osoba: (name: string, age: number, prof: string): Dwa => {
    const low = prof ? `${prof.charAt(0).toLowerCase()}${prof.slice(1)}` : '';
    return {
      pl: `${name}, ${age} ${pl3(age, 'rok', 'lata', 'lat')}${low ? `, ${low}` : ''}`,
      en: `${name}, ${low ? `${zawodEn(low)}, ` : ''}${age}`,
    };
  },
  zapasy: (n: number): Dwa => ({
    pl: `W zapasach macie ${n} ${pl3(n, 'porcję', 'porcje', 'porcji')} jedzenia.`,
    en: `You have ${n} food in stock.`,
  }),
} as const;

/** wybory na karcie spotkania; szansa w procentach już sformatowana („45%”) */
export const WYBOR = {
  rozmowa: (): Dwa => ({ pl: 'Porozmawiać', en: 'Talk' }),
  jedzenie: (): Dwa => ({ pl: 'Dać jedzenie (2 porcje)', en: 'Give them 2 food' }),
  zaproszenie: (s: string): Dwa => ({
    pl: `Zaprosić do nas (${s} szans)`,
    en: `Invite them to join you (${s} chance)`,
  }),
  zabranie: (s: string): Dwa => ({
    pl: `Zabrać im zapasy (${s}, że się postawią)`,
    en: `Take their supplies (${s} chance they fight back)`,
  }),
  odejscie: (): Dwa => ({ pl: 'Odejść', en: 'Walk away' }),
  obrona: (s: string): Dwa => ({ pl: `Bronić się (${s} szans)`, en: `Fight back (${s} chance)` }),
  uspokojenie: (s: string): Dwa => ({ pl: `Uspokoić ich (${s} szans)`, en: `Calm them down (${s} chance)` }),
  ucieczka: (): Dwa => ({ pl: 'Uciekać do siebie', en: 'Run back home' }),
  przegonic: (s: string): Dwa => ({ pl: `Przegonić ich (${s} szans)`, en: `Drive them off (${s} chance)` }),
  /** ta sama para co w menu wędrowca (NAPISY.zapytacORege w src/sim/wedrowcy.ts): ręka to po angielsku zawsze „arm” */
  reka: (): Dwa => ({ pl: 'Zapytać o rękę', en: 'Ask to see their arm' }),
} as const;

export const ZA_MALO_JEDZENIA: Dwa = { pl: 'Za mało jedzenia w zapasach.', en: 'Not enough food in stock.' };

// ---------------------------------------------------------------- zdania po spotkaniu i przy drzwiach

/** kto oberwał: imię i płeć naszej osoby (bez osoby: „Ktoś z was”) */
export interface Kto {
  first: string;
  f: boolean;
}

const oberwal = (k: Kto | null): Dwa =>
  k
    ? { pl: `${k.first} ${k.f ? 'oberwała' : 'oberwał'}`, en: `${k.first} got hurt` }
    : { pl: 'Ktoś z was oberwał', en: 'One of you got hurt' };

/** Zdanie po napisie z symulacji (st.sasiedzi.napis.co); pusty napis dla nieznanego. ile: co dostaliśmy albo daliśmy
    (przy nocnych gościach: co zniknęło), info: co powiedzieli przy rozmowie, nazwa i ilu: budynek nocnych gości i w ilu
    budynkach byli. */
export function zdanie(
  co: string,
  o: { kto?: Kto | null; ile?: Partial<Record<string, number>>; info?: string; nazwa?: string; ilu?: number },
): Dwa {
  const kto = o.kto ?? null;
  const ile = ileTekst(o.ile);
  // budynek po nazwie z mapy (mianownik, więc w cudzysłowie po „budynku”) i ile jeszcze innych
  const inne = (o.ilu ?? 1) - 1;
  const nazwa: Dwa = o.nazwa
    ? { pl: `budynku „${o.nazwa}”`, en: nazwaEn(o.nazwa) }
    : { pl: 'budynku obok', en: 'the building next door' };
  const gdzie: Dwa = {
    pl: `w ${nazwa.pl}${inne > 0 ? ` i w ${inne} ${pl3(inne, 'innym', 'innych', 'innych')}` : ''}`,
    en: `${nazwa.en}${inne > 0 ? ` and ${inne} other ${en2(inne, 'building', 'buildings')}` : ''}`,
  };
  const dokad: Dwa = {
    pl: `do ${nazwa.pl}${inne > 0 ? ` i do ${inne} ${pl3(inne, 'innego', 'innych', 'innych')}` : ''}`,
    en: gdzie.en,
  };
  switch (co) {
    case 'szabr_rozmowa':
      return { pl: 'Nie chcą gadać. Każą wam się wynosić.', en: 'They won’t talk. They tell you to get lost.' };
    case 'reka':
      return {
        pl: 'Przyznają się: ktoś z nich jest ugryziony. Gdy ich zaprosicie, ta osoba zostanie.',
        en: 'They admit one of them has been bitten. If you invite them in, that person stays behind.',
      };
    case 'przegonic_tak':
      return { pl: 'Przegoniliście ich. Zostawili, co zabrali.', en: 'You drove them off. They left what they took.' };
    case 'przegonic_nie': {
      const h = oberwal(kto);
      return { pl: `Nie dali się przegonić. ${h.pl}.`, en: `They wouldn’t leave. ${h.en}.` };
    }
    case 'pietro':
      return ile.pl
        ? { pl: `Piętro przeszukane: ${ile.pl}.`, en: `Floor searched: ${ile.en}.` }
        : { pl: 'Piętro przeszukane, ale nic tam nie zostało.', en: 'Floor searched, but there was nothing left.' };
    case 'pietro_szwendacz': {
      const h = oberwal(kto);
      return { pl: `Na piętrze był szwendacz. ${h.pl}.`, en: `There was a shambler upstairs. ${h.en}.` };
    }
    case 'pietro_ugryzienie':
      return kto
        ? {
            pl: `Na piętrze był szwendacz. ${kto.first} ${kto.f ? 'jest ugryziona' : 'jest ugryziony'}!`,
            en: `There was a shambler upstairs. ${kto.first} has been bitten!`,
          }
        : {
            pl: 'Na piętrze był szwendacz. Ktoś z was jest ugryziony!',
            en: 'There was a shambler upstairs. One of you has been bitten!',
          };
    case 'noc':
      return ile.pl
        ? {
            pl: `W nocy ktoś był ${gdzie.pl}. Zniknęło: ${ile.pl}.`,
            en: `Someone got into ${gdzie.en} last night. Gone: ${ile.en}.`,
          }
        : { pl: `W nocy ktoś był ${gdzie.pl}.`, en: `Someone got into ${gdzie.en} last night.` };
    case 'plot_jezdnia':
      return { pl: 'Nie da się: między wami jest jezdnia.', en: 'Can’t be done: there’s a road in the way.' };
    case 'plot_dlugi':
      return {
        pl: `Nie da się: płot miałby ${o.ilu ?? 0} m, a najwyżej 120 m.`,
        en: `Can’t be done: the fence would be ${o.ilu ?? 0} m long, 120 m at most.`,
      };
    case 'plot_brak':
      return { pl: 'Tu nie da się postawić szczelnego płotu.', en: 'There’s no way to close the fence off here.' };
    case 'plot_gotowy':
      return {
        pl: `Wspólny płot stoi: ${o.ilu ?? 0} m nowej siatki${o.nazwa ? `, „${o.nazwa}” jest za nią` : ''}.`,
        en: `The shared fence is up: ${o.ilu ?? 0} m of new fence${o.nazwa ? `, and ${nazwaEn(o.nazwa)} is inside it` : ''}.`,
      };
    case 'noc_zombie':
      return { pl: `W nocy ${dokad.pl} weszły szwendacze.`, en: `Shamblers got into ${dokad.en} last night.` };
    case 'na_klucz':
      return { pl: 'Zamknięte na klucz. Można zapukać albo wyważyć.', en: 'Locked. You can knock or force it.' };
    case 'nikt':
      return { pl: 'Nikt nie otwiera.', en: 'Nobody answers.' };
    case 'szuranie':
      return {
        pl: 'Nikt nie otwiera, ale za drzwiami coś szura.',
        en: 'Nobody answers, but something is shuffling behind the door.',
      };
    case 'ktos':
      return { pl: 'Ktoś jest w środku, ale nie otwiera.', en: 'Someone’s inside, but they won’t open up.' };
    case 'szwendacz':
      return { pl: 'Ze środka wytoczył się szwendacz!', en: 'A shambler staggers out!' };
    case 'odbite':
      return { pl: 'Deski odbite. Drzwi znowu są otwarte.', en: 'The planks are off. The door is open again.' };
    case 'przerwane':
      return { pl: 'Rozmowa się urwała.', en: 'The conversation broke off.' };
    case 'rozmowa':
      if (o.info === 'inni')
        return {
          pl: 'Porozmawialiście. Mówią, że w budynku mieszka jeszcze ktoś.',
          en: 'You talked. They say someone else lives in the building.',
        };
      if (o.info === 'puste')
        return {
          pl: 'Porozmawialiście. Mówią, które mieszkanie stoi puste.',
          en: 'You talked. They told you which flat is empty.',
        };
      if (o.info === 'lazi')
        return {
          pl: 'Porozmawialiście. Ostrzegają, że coś tu łazi.',
          en: 'You talked. They warn you something is prowling around.',
        };
      return { pl: 'Porozmawialiście chwilę.', en: 'You talked for a while.' };
    case 'jedzenie': {
      const n = o.ile?.jedzenie ?? 0;
      return {
        pl: `Daliście im ${n} ${pl3(n, 'porcję', 'porcje', 'porcji')} jedzenia. Są wdzięczni.`,
        en: `You gave them ${n} food. They’re grateful.`,
      };
    }
    case 'zaproszenie_tak':
      return { pl: 'Przyjęli zaproszenie i idą do was.', en: 'They accepted and are coming over.' };
    case 'zaproszenie_nie':
      return { pl: 'Odmówili. Wolą zostać u siebie.', en: 'They said no. They’d rather stay put.' };
    case 'zabranie':
      return ile.pl
        ? {
            pl: `Oddali zapasy bez walki: ${ile.pl}.`,
            en: `They handed over their supplies without a fight: ${ile.en}.`,
          }
        : { pl: 'Oddali zapasy bez walki, ale nic nie mieli.', en: 'They gave in without a fight, but had nothing.' };
    case 'zabranie_wygrana':
      return ile.pl
        ? { pl: `Szarpanina. Zabraliście zapasy: ${ile.pl}.`, en: `A scuffle. You took their supplies: ${ile.en}.` }
        : { pl: 'Szarpanina. Nie mieli nic do zabrania.', en: 'A scuffle. They had nothing to take.' };
    case 'zabranie_przegrana': {
      const h = oberwal(kto);
      return { pl: `Postawili się. ${h.pl}.`, en: `They fought back. ${h.en}.` };
    }
    case 'odejscie':
      return { pl: 'Odeszliście.', en: 'You walked away.' };
    case 'obrona_wygrana':
      return { pl: 'Odparliście ich. Uciekli z budynku.', en: 'You fought them off. They fled the building.' };
    case 'obrona_przegrana': {
      const h = oberwal(kto);
      return { pl: `${h.pl}. Wracacie do siebie.`, en: `${h.en}. You fall back home.` };
    }
    case 'uspokojenie_tak':
      return { pl: 'Udało się ich uspokoić. Słuchają.', en: 'You calmed them down. They’re listening.' };
    case 'uspokojenie_nie': {
      const h = oberwal(kto);
      return { pl: `Nie dali się uspokoić. ${h.pl}.`, en: `They wouldn’t calm down. ${h.en}.` };
    }
    case 'ucieczka':
      return { pl: 'Uciekacie do siebie.', en: 'You run back home.' };
    default:
      return { pl: '', en: '' };
  }
}

// ---------------------------------------------------------------- karta budynku

const RODZAJ: Record<string, Dwa> = {
  blok: { pl: 'Blok mieszkalny', en: 'Block of flats' },
  dom: { pl: 'Dom', en: 'House' },
  sklep: { pl: 'Sklep', en: 'Shop' },
  szkola: { pl: 'Szkoła', en: 'School' },
  przychodnia: { pl: 'Przychodnia', en: 'Clinic' },
  garaz: { pl: 'Garaże', en: 'Garages' },
  kosciol: { pl: 'Kościół', en: 'Church' },
  hala: { pl: 'Hala', en: 'Warehouse' },
};

const GDZIE: Record<string, Dwa> = {
  u_siebie: { pl: 'u siebie', en: 'at home' },
  odeszli: { pl: 'odeszli', en: 'moved out' },
  u_nas: { pl: 'mieszkają u was', en: 'living with you' },
  nie_zyja: { pl: 'nie żyją', en: 'dead' },
};

const STAN_DRZWI: Record<string, [string, string, string, string]> = {
  zamkniete: ['zamknięte', 'zamknięte', 'zamkniętych', 'closed'],
  na_klucz: ['na klucz', 'na klucz', 'na klucz', 'locked'],
  otwarte: ['otwarte', 'otwarte', 'otwartych', 'open'],
  wywazone: ['wyważone', 'wyważone', 'wyważonych', 'forced'],
  zabite: ['zabite deskami', 'zabite deskami', 'zabitych deskami', 'nailed shut'],
};

export const BUDYNEK = {
  rodzaj: (cls: string): Dwa => RODZAJ[cls] ?? { pl: 'Budynek', en: 'Building' },
  /** nazwa z mapy na nagłówku karty (po angielsku typ budynku z numerem, nazwa własna bez zmian) */
  nazwa: (name: string): Dwa => ({ pl: name, en: nazwaEn(name) }),
  /** „4 piętra” do bloku */
  pietra: (levels: number): Dwa => ({
    pl: `${levels} ${pl3(levels, 'kondygnacja', 'kondygnacje', 'kondygnacji')}`,
    en: `${levels} ${en2(levels, 'storey', 'storeys')}`,
  }),
  nieWiecie: { pl: 'Nie wiecie, kto tu mieszka.', en: 'You don’t know who lives here.' },
  bezMieszkan: { pl: 'Nikt tu nie mieszkał. Można przeszukać.', en: 'Nobody lived here. Worth a search.' },
  znacieStad: { pl: 'Znacie stąd', en: 'People you know here' },
  wiecejLudzi: {
    pl: 'Może tu mieszkać więcej osób, których nie znacie.',
    en: 'More people you don’t know may live here.',
  },
  gdzie: (g: string): Dwa => GDZIE[g] ?? GDZIE.u_siebie,
  klatka: (k: number): Dwa => ({ pl: `klatka ${k + 1}`, en: `stairwell ${k + 1}` }),
  /** „Drzwi na zewnątrz: 1 otwarte, 2 na klucz.” */
  drzwi: (ile: Partial<Record<string, number>>): Dwa => {
    const list = Object.entries(ile).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
    const pl = list.map(([s, n]) => `${n} ${pl3(n, STAN_DRZWI[s][0], STAN_DRZWI[s][1], STAN_DRZWI[s][2])}`);
    const en = list.map(([s, n]) => `${n} ${STAN_DRZWI[s][3]}`);
    return { pl: `Drzwi na zewnątrz: ${pl.join(', ')}.`, en: `Outside doors: ${en.join(', ')}.` };
  },
  pietraPrzeszukane: (n: number, z: number): Dwa => ({
    pl: `Piętra przeszukane: ${n} z ${z}.`,
    en: `Floors searched: ${n} of ${z}.`,
  }),
  /** nocny gość: dzień gry, kto i co zniknęło */
  noc: (dzien: number, kto: 'szabrownicy' | 'szwendacze', zniknelo: Dwa): Dwa =>
    kto === 'szwendacze'
      ? { pl: `Dnia ${dzien} w nocy weszły tu szwendacze.`, en: `Shamblers got in here on night ${dzien}.` }
      : zniknelo.pl
        ? {
            pl: `Dnia ${dzien} w nocy byli tu szabrownicy. Zniknęło: ${zniknelo.pl}.`,
            en: `Looters were here on night ${dzien}. Gone: ${zniknelo.en}.`,
          }
        : { pl: `Dnia ${dzien} w nocy byli tu szabrownicy.`, en: `Looters were here on night ${dzien}.` },
  przeszukane: (n: number, z: number): Dwa => ({
    pl: `Przeszukane: ${n} z ${z} ${pl3(z, 'pomieszczenia', 'pomieszczeń', 'pomieszczeń')}.`,
    en: `Searched: ${n} of ${z} ${en2(z, 'room', 'rooms')}.`,
  }),
  zamkniety: {
    pl: 'Wnętrza jeszcze nie widzieliście.',
    en: 'You haven’t seen inside yet.',
  },
  /** etap 3 */
  otoczony: {
    pl: 'Za wspólnym płotem: łup w środku jest wasz, a nocni goście tu nie wejdą.',
    en: 'Inside the shared fence: the loot in here is yours, and night visitors can’t get in.',
  },
  plotPlan: (pct: number): Dwa => ({
    pl: `Wspólny płot w budowie: ${pct}%.`,
    en: `Shared fence going up: ${pct}%.`,
  }),
  jak: (touch: boolean): Dwa =>
    touch
      ? {
          pl: 'Przytrzymajcie palec na drzwiach: Otworzyć, Zapukać albo Wyważyć. W środku na pomieszczeniu: Przeszukać.',
          en: 'Hold your finger on the door: Open, Knock or Force. Inside, hold it on a room: Search.',
        }
      : {
          pl: 'Prawy przycisk na drzwiach: Otworzyć, Zapukać albo Wyważyć. W środku na pomieszczeniu: Przeszukać.',
          en: 'Right-click the door: Open, Knock or Force. Inside, right-click a room: Search.',
        },
} as const;
