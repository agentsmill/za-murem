/* Napisy fali 2 M2 (sąsiednie budynki, docs/M2-fala-2.md) w obu językach: menu przy cudzych drzwiach i w pomieszczeniach
   sąsiada, opisy prac, podpowiedzi po poleceniu, karta spotkania z lokatorami, zdania po spotkaniu i przy drzwiach,
   karta budynku i cel drugiego dnia w domu. Do gry idzie na razie polski (pl); angielski (en) podłączy warstwa języka,
   tak jak napisy surowców (src/sim/surowce.ts). Czyste dane i funkcje bez DOM. */

import type { RoomKind } from '../world/interior.ts';

/** napis w obu językach */
export interface Dwa {
  pl: string;
  en: string;
}

/** polska liczba mnoga: 1, 2–4 (bez 12–14), reszta */
const pl3 = (n: number, one: string, few: string, many: string): string => {
  const d = n % 10;
  const t = n % 100;
  return n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

/** pomieszczenia: biernik do „Przeszukać …” i angielska nazwa */
const POKOJ: Record<RoomKind, Dwa> = {
  klatka: { pl: 'klatkę', en: 'stairwell' },
  przedpokoj: { pl: 'przedpokój', en: 'hallway' },
  pokoj: { pl: 'pokój', en: 'room' },
  kuchnia: { pl: 'kuchnię', en: 'kitchen' },
  lazienka: { pl: 'łazienkę', en: 'bathroom' },
  sala: { pl: 'salę', en: 'hall' },
  hala: { pl: 'halę', en: 'shop floor' },
  zaplecze: { pl: 'zaplecze', en: 'back room' },
};

/** materiały w zdaniach o łupie i zapasach */
const MAT: Record<string, Dwa> = {
  deski: { pl: 'deski', en: 'boards' },
  zlom: { pl: 'złom', en: 'scrap' },
  czesci: { pl: 'części', en: 'parts' },
  jedzenie: { pl: 'jedzenie', en: 'food' },
  leki: { pl: 'leki', en: 'medicine' },
  drewno: { pl: 'drewno', en: 'firewood' },
};

/** „jedzenie 3, leki 1” (bez zer); pusty napis, gdy nic */
export function ileTekst(ile: Partial<Record<string, number>> | undefined): Dwa {
  const list = Object.entries(ile ?? {}).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  const one = (lang: keyof Dwa) => list.map(([m, n]) => `${MAT[m]?.[lang] ?? m} ${n}`).join(', ');
  return { pl: one('pl'), en: one('en') };
}

// ---------------------------------------------------------------- menu i prace

export const MENU = {
  otworz: { pl: 'Otworzyć drzwi', en: 'Open the door' },
  otworzMieszkanie: { pl: 'Otworzyć drzwi mieszkania', en: 'Open the flat door' },
  zapukaj: { pl: 'Zapukać', en: 'Knock' },
  zapukajMieszkanie: { pl: 'Zapukać do mieszkania', en: 'Knock on the flat door' },
  wywaz: { pl: 'Wyważyć drzwi', en: 'Force the door' },
  wywazMieszkanie: { pl: 'Wyważyć drzwi mieszkania', en: 'Force the flat door' },
  wejdz: { pl: 'Wejść', en: 'Go in' },
  zabij: { pl: 'Zabić drzwi deskami', en: 'Board up the door' },
  odbij: { pl: 'Odbić deski', en: 'Pull off the boards' },
  /** dopisek przy drzwiach od ulicy budynku, który stoi przy podwórku */
  wylom: { pl: ' (droga z ulicy na podwórko)', en: ' (opens a way from the street into the yard)' },
  przeszukaj: (k: RoomKind): Dwa => ({ pl: `Przeszukać ${POKOJ[k].pl}`, en: `Search the ${POKOJ[k].en}` }),
  /** etap 2: na schodach otwartego budynku; left: ile pięter zostało */
  pietro: (left: number): Dwa => ({
    pl: `Przeszukać piętro (zostało ${left})`,
    en: `Search a floor upstairs (${left} left)`,
  }),
  okradnij: { pl: 'Okraść mieszkanie (lokatorów nie ma)', en: 'Rob the flat (nobody is home)' },
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
    { pl: 'Idzie zabić drzwi deskami.', en: 'Going to board up the door.' },
    { pl: 'Zabija drzwi deskami.', en: 'Boarding up the door.' },
  ],
  unboard: [
    { pl: 'Idzie odbić deski z drzwi.', en: 'Going to pull the boards off.' },
    { pl: 'Odbija deski z drzwi.', en: 'Pulling the boards off.' },
  ],
};

export const PRACA = {
  idziePrzeszukac: (k: RoomKind | null): Dwa => ({
    pl: `Idzie przeszukać ${k ? POKOJ[k].pl : 'pomieszczenie'} u sąsiadów.`,
    en: `Going to search the neighbours' ${k ? POKOJ[k].en : 'room'}.`,
  }),
  przeszukuje: (k: RoomKind | null): Dwa => ({
    pl: `Przeszukuje ${k ? POKOJ[k].pl : 'pomieszczenie'} u sąsiadów.`,
    en: `Searching the neighbours' ${k ? POKOJ[k].en : 'room'}.`,
  }),
  rozmawia: { pl: 'Rozmawia z sąsiadami.', en: 'Talking to the neighbours.' },
  idzieNaSchody: { pl: 'Idzie na schody.', en: 'Heading for the stairs.' },
  naPietrze: { pl: 'Przeszukuje piętro.', en: 'Searching a floor upstairs.' },
} as const;

/** podpowiedzi po poleceniu: jedna osoba, kilka zaznaczonych (polecenie bierze jedna) */
export const PO_POLECENIU: Record<'open' | 'knock' | 'force' | 'board' | 'unboard' | 'loot' | 'upstairs', [Dwa, Dwa]> =
  {
    upstairs: [
      {
        pl: 'Pójdzie przeszukać piętro. Wróci za godzinę.',
        en: 'Will search a floor upstairs and be back in an hour.',
      },
      {
        pl: 'Jedna osoba pójdzie przeszukać piętro. Wróci za godzinę.',
        en: 'One person will search a floor upstairs and be back in an hour.',
      },
    ],
    open: [
      { pl: 'Otworzy drzwi.', en: 'Will open the door.' },
      { pl: 'Jedna osoba otworzy drzwi.', en: 'One person will open the door.' },
    ],
    knock: [
      { pl: 'Zapuka.', en: 'Will knock.' },
      { pl: 'Jedna osoba zapuka.', en: 'One person will knock.' },
    ],
    force: [
      { pl: 'Wyważy drzwi. Będzie głośno.', en: 'Will force the door. It will be loud.' },
      { pl: 'Jedna osoba wyważy drzwi. Będzie głośno.', en: 'One person will force the door. It will be loud.' },
    ],
    board: [
      { pl: 'Zabije drzwi deskami.', en: 'Will board up the door.' },
      { pl: 'Jedna osoba zabije drzwi deskami.', en: 'One person will board up the door.' },
    ],
    unboard: [
      { pl: 'Odbije deski z drzwi.', en: 'Will pull the boards off the door.' },
      { pl: 'Jedna osoba odbije deski z drzwi.', en: 'One person will pull the boards off the door.' },
    ],
    loot: [
      {
        pl: 'Przeszuka pomieszczenie i zaniesie łup na podwórko.',
        en: 'Will search the room and carry the loot into the yard.',
      },
      {
        pl: 'Jedna osoba przeszuka pomieszczenie i zaniesie łup.',
        en: 'One person will search the room and carry the loot.',
      },
    ],
  };

/** dopisek przy wyważaniu w trybie zombie */
export const HALAS_ZOMBIE: Dwa = { pl: ' Hałas ściągnie szwendaczy.', en: ' The noise will draw the walkers.' };

// ---------------------------------------------------------------- karta spotkania

export const KARTA = {
  naglowek: { pl: 'Sąsiedzi', en: 'Neighbours' },
  tytul: {
    atak: { pl: 'Rzucają się na was', en: 'They are coming at you' },
    drzwi: { pl: 'Ktoś otworzył drzwi', en: 'Someone opened the door' },
    mieszkanie: { pl: 'W mieszkaniu ktoś jest', en: 'Someone is in the flat' },
    /** spotkanie w środku domu jednorodzinnego (dom jest jednym mieszkaniem) */
    dom: { pl: 'W domu ktoś jest', en: 'Someone is in the house' },
    pietro: { pl: 'Na piętrze ktoś jest', en: 'Someone is upstairs' },
    szabrownicy: { pl: 'W środku są szabrownicy', en: 'There are looters inside' },
  },
  znani: { pl: 'Znacie ich z widzenia.', en: 'You know them by sight.' },
  obcy: { pl: 'Nie znacie ich.', en: 'You do not know them.' },
  zamiar: {
    zyczliwi: { pl: 'Patrzą na was życzliwie.', en: 'They look at you kindly.' },
    nieufni: { pl: 'Patrzą nieufnie.', en: 'They look wary.' },
    wrodzy: { pl: 'Są wrogo nastawieni.', en: 'They are hostile.' },
    zdesperowani: { pl: 'Widać, że są w potrzebie.', en: 'They are clearly in need.' },
  },
  nastroj: {
    spokoj: { pl: 'Są spokojni.', en: 'They are calm.' },
    strach: { pl: 'Boją się.', en: 'They are scared.' },
    gniew: { pl: 'Są wściekli.', en: 'They are furious.' },
    zal: { pl: 'Niedawno kogoś stracili.', en: 'They lost someone recently.' },
    nadzieja: { pl: 'Mają nadzieję, że pomożecie.', en: 'They hope you will help.' },
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
    return { pl: `Stosunek do was: ${pl}.`, en: `Feelings towards you: ${en}.` };
  },
  wywazone: { pl: 'Wyważyliście im drzwi.', en: 'You forced their door.' },
  /** tryb zombie: ktoś z nich ukrywa ugryzienie */
  reka: {
    pl: 'Ktoś z nich ma obandażowaną rękę i trzyma się z tyłu.',
    en: 'One of them has a bandaged hand and hangs back.',
  },
  szabrownicy: {
    pl: 'To nie lokatorzy. Siedzą tu od nocy i pilnują tego, co zabrali.',
    en: 'They are not tenants. They have been here since the night, guarding what they took.',
  },
  bezRozmowy: { pl: 'Nie ma czasu na rozmowę.', en: 'There is no time to talk.' },
  /** osoba: imię i nazwisko, wiek, zawód (małą literą: zawody 0.3 są pisane wielką) */
  osoba: (name: string, age: number, prof: string): Dwa => {
    const p = prof ? `, ${prof.charAt(0).toLowerCase()}${prof.slice(1)}` : '';
    return { pl: `${name}, ${age} ${pl3(age, 'rok', 'lata', 'lat')}${p}`, en: `${name}, ${age}${p}` };
  },
  zapasy: (n: number): Dwa => ({
    pl: `W zapasach macie ${n} ${pl3(n, 'porcję', 'porcje', 'porcji')} jedzenia.`,
    en: `You have ${n} ${n === 1 ? 'ration' : 'rations'} of food in stock.`,
  }),
} as const;

/** wybory na karcie spotkania; szansa w procentach już sformatowana („45%”) */
export const WYBOR = {
  rozmowa: (): Dwa => ({ pl: 'Porozmawiać', en: 'Talk' }),
  jedzenie: (): Dwa => ({ pl: 'Dać jedzenie (2 porcje)', en: 'Give food (2 rations)' }),
  zaproszenie: (s: string): Dwa => ({
    pl: `Zaprosić do nas (${s} szans)`,
    en: `Invite them to join you (${s} chance)`,
  }),
  zabranie: (s: string): Dwa => ({
    pl: `Zabrać im zapasy (${s}, że się postawią)`,
    en: `Take their supplies (${s} they fight back)`,
  }),
  odejscie: (): Dwa => ({ pl: 'Odejść', en: 'Walk away' }),
  obrona: (s: string): Dwa => ({ pl: `Bronić się (${s} szans)`, en: `Fight back (${s} chance)` }),
  uspokojenie: (s: string): Dwa => ({ pl: `Uspokoić ich (${s} szans)`, en: `Calm them down (${s} chance)` }),
  ucieczka: (): Dwa => ({ pl: 'Uciekać do siebie', en: 'Run back home' }),
  przegonic: (s: string): Dwa => ({ pl: `Przegonić ich (${s} szans)`, en: `Drive them off (${s} chance)` }),
  reka: (): Dwa => ({ pl: 'Zapytać o rękę', en: 'Ask about the hand' }),
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
    ? { pl: `budynku „${o.nazwa}”`, en: `“${o.nazwa}”` }
    : { pl: 'budynku obok', en: 'the building next door' };
  const gdzie: Dwa = {
    pl: `w ${nazwa.pl}${inne > 0 ? ` i w ${inne} ${pl3(inne, 'innym', 'innych', 'innych')}` : ''}`,
    en: `${nazwa.en}${inne > 0 ? ` and ${inne} more ${inne === 1 ? 'building' : 'buildings'}` : ''}`,
  };
  const dokad: Dwa = {
    pl: `do ${nazwa.pl}${inne > 0 ? ` i do ${inne} ${pl3(inne, 'innego', 'innych', 'innych')}` : ''}`,
    en: gdzie.en,
  };
  switch (co) {
    case 'szabr_rozmowa':
      return { pl: 'Nie chcą gadać. Każą wam się wynosić.', en: 'They will not talk. They tell you to get lost.' };
    case 'reka':
      return {
        pl: 'Przyznają się: ktoś z nich jest ugryziony. Gdy ich zaprosicie, ta osoba zostanie.',
        en: 'They admit one of them is bitten. If you invite them, that person stays behind.',
      };
    case 'przegonic_tak':
      return { pl: 'Przegoniliście ich. Zostawili, co zabrali.', en: 'You drove them off. They left what they took.' };
    case 'przegonic_nie': {
      const h = oberwal(kto);
      return { pl: `Nie dali się przegonić. ${h.pl}.`, en: `They would not leave. ${h.en}.` };
    }
    case 'pietro':
      return ile.pl
        ? { pl: `Piętro przeszukane: ${ile.pl}.`, en: `Floor searched: ${ile.en}.` }
        : { pl: 'Piętro przeszukane, ale nic tam nie zostało.', en: 'Floor searched, but nothing was left.' };
    case 'pietro_szwendacz': {
      const h = oberwal(kto);
      return { pl: `Na piętrze był szwendacz. ${h.pl}.`, en: `There was a walker upstairs. ${h.en}.` };
    }
    case 'pietro_ugryzienie':
      return kto
        ? {
            pl: `Na piętrze był szwendacz. ${kto.first} ${kto.f ? 'jest ugryziona' : 'jest ugryziony'}!`,
            en: `There was a walker upstairs. ${kto.first} has been bitten!`,
          }
        : {
            pl: 'Na piętrze był szwendacz. Ktoś z was jest ugryziony!',
            en: 'There was a walker upstairs. One of you is bitten!',
          };
    case 'noc':
      return ile.pl
        ? {
            pl: `W nocy ktoś był ${gdzie.pl}. Zniknęło: ${ile.pl}.`,
            en: `Someone was in ${gdzie.en} at night. Gone: ${ile.en}.`,
          }
        : { pl: `W nocy ktoś był ${gdzie.pl}.`, en: `Someone was in ${gdzie.en} at night.` };
    case 'noc_zombie':
      return { pl: `W nocy ${dokad.pl} weszły szwendacze.`, en: `At night walkers got into ${dokad.en}.` };
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
      return { pl: 'Ktoś jest w środku, ale nie otwiera.', en: 'Someone is inside, but will not open.' };
    case 'szwendacz':
      return { pl: 'Ze środka wytoczył się szwendacz!', en: 'A walker staggers out!' };
    case 'odbite':
      return { pl: 'Deski odbite. Drzwi znowu są otwarte.', en: 'The boards are off. The door is open again.' };
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
          en: 'You talked. They told you which flat stands empty.',
        };
      if (o.info === 'lazi')
        return {
          pl: 'Porozmawialiście. Ostrzegają, że coś tu łazi.',
          en: 'You talked. They warn you that something is prowling here.',
        };
      return { pl: 'Porozmawialiście chwilę.', en: 'You talked for a while.' };
    case 'jedzenie': {
      const n = o.ile?.jedzenie ?? 0;
      return {
        pl: `Daliście im ${n} ${pl3(n, 'porcję', 'porcje', 'porcji')} jedzenia. Są wdzięczni.`,
        en: `You gave them ${n} ${n === 1 ? 'ration' : 'rations'} of food. They are grateful.`,
      };
    }
    case 'zaproszenie_tak':
      return { pl: 'Przyjęli zaproszenie i idą do was.', en: 'They accepted and are coming over.' };
    case 'zaproszenie_nie':
      return { pl: 'Odmówili. Wolą zostać u siebie.', en: 'They declined. They would rather stay put.' };
    case 'zabranie':
      return ile.pl
        ? { pl: `Oddali zapasy bez walki: ${ile.pl}.`, en: `They handed over their supplies: ${ile.en}.` }
        : { pl: 'Oddali zapasy bez walki, ale nic nie mieli.', en: 'They gave in, but they had nothing.' };
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
      return { pl: 'Odparliście ich. Uciekli z budynku.', en: 'You beat them off. They fled the building.' };
    case 'obrona_przegrana': {
      const h = oberwal(kto);
      return { pl: `${h.pl}. Wracacie do siebie.`, en: `${h.en}. You fall back home.` };
    }
    case 'uspokojenie_tak':
      return { pl: 'Udało się ich uspokoić. Słuchają.', en: 'You calmed them down. They are listening.' };
    case 'uspokojenie_nie': {
      const h = oberwal(kto);
      return { pl: `Nie dali się uspokoić. ${h.pl}.`, en: `They would not calm down. ${h.en}.` };
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
  hala: { pl: 'Hala', en: 'Hall' },
};

const GDZIE: Record<string, Dwa> = {
  u_siebie: { pl: 'u siebie', en: 'at home' },
  odeszli: { pl: 'odeszli', en: 'moved out' },
  u_nas: { pl: 'mieszkają u was', en: 'live with you' },
  nie_zyja: { pl: 'nie żyją', en: 'dead' },
};

const STAN_DRZWI: Record<string, [string, string, string, string]> = {
  zamkniete: ['zamknięte', 'zamknięte', 'zamkniętych', 'closed'],
  na_klucz: ['na klucz', 'na klucz', 'na klucz', 'locked'],
  otwarte: ['otwarte', 'otwarte', 'otwartych', 'open'],
  wywazone: ['wyważone', 'wyważone', 'wyważonych', 'forced'],
  zabite: ['zabite deskami', 'zabite deskami', 'zabitych deskami', 'boarded up'],
};

export const BUDYNEK = {
  rodzaj: (cls: string): Dwa => RODZAJ[cls] ?? { pl: 'Budynek', en: 'Building' },
  /** „4 piętra” do bloku */
  pietra: (levels: number): Dwa => ({
    pl: `${levels} ${pl3(levels, 'kondygnacja', 'kondygnacje', 'kondygnacji')}`,
    en: `${levels} ${levels === 1 ? 'storey' : 'storeys'}`,
  }),
  nieWiecie: { pl: 'Nie wiecie, kto tu mieszka.', en: 'You do not know who lives here.' },
  bezMieszkan: { pl: 'Nikt tu nie mieszkał. Można przeszukać.', en: 'Nobody lived here. Worth a search.' },
  znacieStad: { pl: 'Znacie stąd', en: 'You know from here' },
  wiecejLudzi: {
    pl: 'Może tu mieszkać więcej osób, których nie znacie.',
    en: 'More people you do not know may live here.',
  },
  gdzie: (g: string): Dwa => GDZIE[g] ?? GDZIE.u_siebie,
  klatka: (k: number): Dwa => ({ pl: `klatka ${k + 1}`, en: `entrance ${k + 1}` }),
  /** „Drzwi na zewnątrz: 1 otwarte, 2 na klucz.” */
  drzwi: (ile: Partial<Record<string, number>>): Dwa => {
    const list = Object.entries(ile).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
    const pl = list.map(([s, n]) => `${n} ${pl3(n, STAN_DRZWI[s][0], STAN_DRZWI[s][1], STAN_DRZWI[s][2])}`);
    const en = list.map(([s, n]) => `${n} ${STAN_DRZWI[s][3]}`);
    return { pl: `Drzwi na zewnątrz: ${pl.join(', ')}.`, en: `Outer doors: ${en.join(', ')}.` };
  },
  pietraPrzeszukane: (n: number, z: number): Dwa => ({
    pl: `Piętra przeszukane: ${n} z ${z}.`,
    en: `Floors searched: ${n} of ${z}.`,
  }),
  /** nocny gość: dzień gry, kto i co zniknęło */
  noc: (dzien: number, kto: 'szabrownicy' | 'szwendacze', zniknelo: Dwa): Dwa =>
    kto === 'szwendacze'
      ? { pl: `Dnia ${dzien} w nocy weszły tu szwendacze.`, en: `On night ${dzien} walkers got in here.` }
      : zniknelo.pl
        ? {
            pl: `Dnia ${dzien} w nocy byli tu szabrownicy. Zniknęło: ${zniknelo.pl}.`,
            en: `On night ${dzien} looters were here. Gone: ${zniknelo.en}.`,
          }
        : { pl: `Dnia ${dzien} w nocy byli tu szabrownicy.`, en: `On night ${dzien} looters were here.` },
  przeszukane: (n: number, z: number): Dwa => ({
    pl: `Przeszukane: ${n} z ${z} ${pl3(z, 'pomieszczenia', 'pomieszczeń', 'pomieszczeń')}.`,
    en: `Searched: ${n} of ${z} rooms.`,
  }),
  zamkniety: {
    pl: 'Wnętrza jeszcze nie widzieliście.',
    en: 'You have not seen the inside yet.',
  },
  jak: (touch: boolean): Dwa =>
    touch
      ? {
          pl: 'Przytrzymajcie palec na drzwiach: Otworzyć, Zapukać albo Wyważyć. W środku na pomieszczeniu: Przeszukać.',
          en: 'Hold your finger on the door: Open, Knock or Force. Inside, on a room: Search.',
        }
      : {
          pl: 'Prawy przycisk na drzwiach: Otworzyć, Zapukać albo Wyważyć. W środku na pomieszczeniu: Przeszukać.',
          en: 'Right-click the door: Open, Knock or Force. Inside, on a room: Search.',
        },
} as const;

// ---------------------------------------------------------------- cel drugiego dnia w domu

export const CEL_DOM = {
  tekst: { pl: 'Przeszukajcie pokój u sąsiadów.', en: "Search a room at the neighbours'." },
  jak: (touch: boolean): Dwa =>
    touch
      ? {
          pl: 'Stuknijcie sąsiedni dom: karta powie, co o nim wiecie. Przytrzymajcie palec na jego drzwiach: Otworzyć albo Zapukać. W pustym domu przytrzymajcie palec w pokoju: Przeszukać.',
          en: 'Tap a neighbouring house: its card tells you what you know. Hold your finger on its door: Open or Knock. In an empty house, hold your finger on a room: Search.',
        }
      : {
          pl: 'Kliknijcie sąsiedni dom: karta powie, co o nim wiecie. Prawy przycisk na jego drzwiach: Otworzyć albo Zapukać. W pustym domu prawy przycisk w pokoju: Przeszukać.',
          en: 'Click a neighbouring house: its card tells you what you know. Right-click its door: Open or Knock. In an empty house, right-click a room: Search.',
        },
} as const;
