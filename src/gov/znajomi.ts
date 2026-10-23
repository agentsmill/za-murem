/* Pamięć o ludziach (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 4): zarząd zapamiętuje każdego,
   o kim zdecydował, i ci ludzie wracają. Czyste dane i funkcje na `GovState.znajomi`, bez hosta i bez losowania.

   Kto i kiedy. Jeden wpis na człowieka. Po każdej decyzji o gościu (karta gościa z klocków, sześć kart z 0.3 z gościem,
   „Złapany”, kradzież wykryta rano) zapisuje się mówiący, czyli pierwsza żywa osoba grupy, ta sama, którą karta nazywa;
   po wyrzuceniu mieszkańca bramą (`kto: 'lokator'`, `wyrzucony`). Ten sam człowiek (to samo imię i nazwisko, płeć i wiek;
   id osoby zmienia się przy przyjęciu, bo symulacja nadaje swoje) dostaje jeden wpis: `zapamietaj` dolicza nastawienie
   w zakresie −2..2, podnosi licznik wizyt i odświeża `ostatnio`. Decyzja podjęta w tej samej wizycie co poprzednia (noc,
   która skończyła się kradzieżą; złapany po wpuszczeniu na noc) poprawia wpis zamiast dokładać drugi (`opcje.wizyta`,
   `Znajomy.przed` to nastawienie sprzed tej wizyty).

   Nastawienie (`NASTAWIENIE`): nakarmiony +1 (pomoc przez siatkę: jedzenie, leki, wymiana, przechowanie, wysłuchanie),
   nocleg +1, przyjęty +2, odprawiony 0 (−1, gdy chciał jedzenia, a zapasów było ponad 5: `opcje.odmowa`), okradł −1,
   złapany i wyrzucony −2.

   Powrót (`doPowrotu`): wraca ktoś o dodatnim nastawieniu i niewrogim ostatnim zdarzeniu (nie okradł, nie został złapany
   ani wyrzucony), którego ostatnie spotkanie było co najmniej `POWROT_WIEK_DNI` dni temu, najwyżej jeden powrót
   na `POWROT_ODSTEP_DNI` dni we wszystkich wpisach razem (`Znajomy.wrocil`), nie ktoś, kto mieszka u nas, jest w zarządzie
   albo nie żyje (`obecniWOsiedlu`, po imieniu i nazwisku, bo symulacja nadaje przyjętym nowe id). Wybór bez losowania:
   najlepiej nastawiony, potem najdawniejszy, potem po id. Powrót to prawdziwa wizyta gościa (`planujPowrot` w wizyta.ts,
   `Gosc.wraca`), więc nie ma tu żadnej karty: wydarzenie `powrot` tylko ją planuje, jak `gosc`.

   Napad (`wrogDoNapadu`): w zwykłym trybie najbliższy napad bierze jednego ujemnego znajomego (najbardziej ujemny, potem
   najdawniejszy, potem po id), raz na znajomego (`Znajomy.napad`); jeden szabrownik dostaje jego wygląd, raport rano mówi,
   kto to był (`liniaWsrod`). W trybie zombie ujemny nie wraca ani nie dołącza do niczego.

   Epitet (`epitet`): krótka fraza o tym, co się stało, w rodzaju znajomego, z kilkoma wariantami na zdarzenie (wybiera skrót
   z id, więc ten sam znajomy ma ten sam epitet) i dopiskami dla dzieci i chorych. Tekst karty powrotu (`tytulPowrotu`,
   `tekstPowrotu`) rozpoznaje znajomego po imieniu, epitecie i tym, co się stało, i zapowiada dar. Nic tu nie losuje, a angielski
   nie ma polskich słów (imiona zostają, bo są zmyślone). */

import { type Person, g as plec } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { hashString } from '../core/rng.ts';
import { type Gosc, KTO, type KtoId } from './goscie.ts';
import type { Words, WordsEn } from './miejsce.ts';
import type { GEventDef } from './tresc.ts';
import type { GameMode, GovInput, GovState } from './typy.ts';
import { porcje, portions } from './wspolne.ts';

// ---------------------------------------------------------------- typy i stałe

export type JakId = 'nakarmiony' | 'nocleg' | 'przyjety' | 'odprawiony' | 'okradl' | 'wyrzucony' | 'zlapany';

/** Człowiek, o którym zarząd pamięta. `osoba` to to, po czym go poznać (imię, nazwisko, płeć, wiek), `prof` jego zawód
    (do powrotu z tym samym fachem), `look` wygląd pionka. `kto`: archetyp gościa albo `lokator` (mieszkaniec wyrzucony
    bramą), `jak` ostatnie zdarzenie, `nastawienie` suma zdarzeń w −2..2. `dzien` to dzień pierwszego wpisu, `wizyty` ile
    razy o nim decydowano, `ostatnio` dzień ostatniego wpisu. Pola pomocnicze: `wizyta` i `przed` (poprawka w tej samej
    wizycie), `wrocil` (dzień ostatniego powrotu gościem), `napad` (dzień, w którym poszedł z szabrownikami; raz),
    `zmarl` (zginął na oczach zarządu: nie wraca). */
export interface Znajomy {
  id: string;
  osoba: Pick<Person, 'first' | 'name' | 'f' | 'age'>;
  look: number;
  kto: KtoId | 'lokator';
  jak: JakId;
  nastawienie: number;
  dzien: number;
  wizyty: number;
  ostatnio: number;
  prof?: string;
  wizyta?: string;
  przed?: number;
  wrocil?: number;
  napad?: number;
  zmarl?: boolean;
}

/** zmiana nastawienia za zdarzenie */
export const NASTAWIENIE: Record<JakId, number> = {
  nakarmiony: 1,
  nocleg: 1,
  przyjety: 2,
  odprawiony: 0,
  okradl: -1,
  wyrzucony: -2,
  zlapany: -2,
};
/** odprawiony głodny przy zapasach (ponad `ZAPAS_ODMOWY`) schodzi o tyle zamiast o zero */
export const ODMOWA = -1;
export const ZAPAS_ODMOWY = 5;
/** znajomy wraca najwcześniej tyle dni po ostatnim spotkaniu, a powrót w ogóle najwyżej raz na tyle dni */
export const POWROT_WIEK_DNI = 2;
export const POWROT_ODSTEP_DNI = 4;
/** waga wydarzenia `powrot` w puli, gdy ktoś może wrócić (wizyta w puli ma 1,2) */
export const WAGA_POWROTU = 2;

const MIN = -2;
const MAX = 2;
const przytnij = (v: number): number => Math.max(MIN, Math.min(MAX, v));

/** zdarzenia, po których nie wraca się z darem */
const WROGIE: ReadonlySet<JakId> = new Set(['okradl', 'wyrzucony', 'zlapany']);

// ---------------------------------------------------------------- wpisy

export interface OpcjeZapisu {
  /** id wizyty (gościa) albo innego zdarzenia: drugi wpis z tym samym id poprawia pierwszy zamiast dokładać */
  wizyta?: string;
  /** odprawa głodnego, gdy zapasy były (`ZAPAS_ODMOWY`): −1 zamiast 0 */
  odmowa?: boolean;
}

const tenSam = (a: Znajomy['osoba'], b: Znajomy['osoba']): boolean =>
  a.name === b.name && a.f === b.f && a.age === b.age;

/**
 * Zapisuje decyzję o człowieku. Pierwszy raz dodaje wpis, kolejny (to samo id albo ta sama osoba) uaktualnia: `jak`, `kto`,
 * nastawienie (suma z `NASTAWIENIE` przycięta do −2..2), `wizyty` + 1, `ostatnio` = `d`; wygląd i dzień pierwszego wpisu zostają.
 * Z `opcje.wizyta` równą wizycie ostatniego wpisu to poprawka: nastawienie liczy się od stanu sprzed tej wizyty, a `wizyty`
 * nie rosną. Dopisuje do `st.znajomi` (pole powstaje przy pierwszym wpisie) i oddaje wpis.
 */
export function zapamietaj(
  st: GovState,
  z: Omit<Znajomy, 'nastawienie' | 'wizyty' | 'ostatnio'>,
  d: number,
  opcje: OpcjeZapisu = {},
): Znajomy {
  const lista = (st.znajomi ??= []);
  const delta = z.jak === 'odprawiony' && opcje.odmowa ? ODMOWA : NASTAWIENIE[z.jak];
  const x = lista.find((y) => y.id === z.id || tenSam(y.osoba, z.osoba));
  if (!x) {
    const nowy: Znajomy = {
      id: z.id,
      osoba: { first: z.osoba.first, name: z.osoba.name, f: z.osoba.f, age: z.osoba.age },
      ...(z.prof !== undefined ? { prof: z.prof } : {}),
      look: z.look,
      kto: z.kto,
      jak: z.jak,
      nastawienie: przytnij(delta),
      dzien: z.dzien,
      wizyty: 1,
      ostatnio: d,
      ...(opcje.wizyta !== undefined ? { wizyta: opcje.wizyta, przed: 0 } : {}),
    };
    lista.push(nowy);
    return nowy;
  }
  const poprawka = opcje.wizyta !== undefined && x.wizyta === opcje.wizyta;
  const przed = poprawka ? (x.przed ?? 0) : x.nastawienie;
  x.jak = z.jak;
  x.kto = z.kto;
  x.nastawienie = przytnij(przed + delta);
  x.ostatnio = d;
  if (z.prof !== undefined && x.prof === undefined) x.prof = z.prof;
  if (!poprawka) {
    x.wizyty++;
    x.przed = przed;
    if (opcje.wizyta !== undefined) x.wizyta = opcje.wizyta;
    else delete x.wizyta;
  }
  return x;
}

/** Poprawia ostatni wpis tej wizyty (noc, która skończyła się kradzieżą; złapany po wpuszczeniu): `jak` i nastawienie od
    stanu sprzed wizyty, bez nowej wizyty. null: nie ma takiego znajomego. */
export function poprawJak(st: GovState, id: string, wizyta: string, jak: JakId, d: number): Znajomy | null {
  const x = st.znajomi?.find((y) => y.id === id);
  if (!x) return null;
  return zapamietaj(st, { id: x.id, osoba: x.osoba, look: x.look, kto: x.kto, jak, dzien: x.dzien }, d, { wizyta });
}

/** Imiona i nazwiska ludzi, którzy są w osiedlu albo nie żyją: zarząd, mieszkańcy z osobą i zmarli z wejścia. Znajomy
    o takim imieniu nie wraca (przyjęty mieszka u nas, zmarły nie przyjdzie). Po imieniu i nazwisku, bo symulacja nadaje
    przyjętym nowe id. */
export function obecniWOsiedlu(i: Pick<GovInput, 'people' | 'lokatorzy' | 'dead'>): Set<string> {
  return new Set([
    ...i.people.map((p) => p.name),
    ...(i.lokatorzy ?? []).map((l) => l.name),
    ...(i.dead ?? []).map((d) => d.name),
  ]);
}

// ---------------------------------------------------------------- wybór

const najpierwNajdawniejszy = (a: Znajomy, b: Znajomy): number =>
  a.ostatnio - b.ostatnio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Znajomy, który wraca gościem, albo null. Dodatnie nastawienie, niewrogie ostatnie zdarzenie, ostatnie spotkanie
 * co najmniej `POWROT_WIEK_DNI` dni przed `day`, najwyżej jeden powrót na `POWROT_ODSTEP_DNI` dni we wszystkich wpisach,
 * nie ktoś z `obecni` (mieszkaniec, zarząd, zmarły), nie zmarły na oczach zarządu i archetyp, który w tym trybie bywa.
 * Najlepiej nastawiony, remis: najdawniejszy, potem po id. Ujemny nie wraca w żadnym trybie; w zombie nie ma też napadu
 * (`wrogDoNapadu`).
 */
export function doPowrotu(
  st: GovState,
  day: number,
  mode: GameMode,
  obecni: ReadonlySet<string> = new Set(),
): Znajomy | null {
  const lista = st.znajomi;
  if (!lista?.length) return null;
  const ostatniPowrot = lista.reduce(
    (m, z) => Math.max(m, z.wrocil ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY,
  );
  if (day - ostatniPowrot < POWROT_ODSTEP_DNI) return null;
  const mozliwi = lista.filter(
    (z) =>
      z.nastawienie > 0 &&
      !WROGIE.has(z.jak) &&
      !z.zmarl &&
      day - z.ostatnio >= POWROT_WIEK_DNI &&
      !obecni.has(z.osoba.name) &&
      (z.kto === 'lokator' || KTO[z.kto].tryby.includes(mode)),
  );
  mozliwi.sort((a, b) => b.nastawienie - a.nastawienie || najpierwNajdawniejszy(a, b));
  return mozliwi[0] ?? null;
}

/**
 * Znajomy, który idzie z szabrownikami na najbliższy napad, albo null: ujemne nastawienie, jeszcze nie był w napadzie
 * (`Znajomy.napad`), nie jest w osiedlu ani nie żyje. Najbardziej ujemny, remis: najdawniejszy (pierwszy wpis), potem po id.
 * W zombie nikt: tam szabrowników nie ma, a ujemny nie wraca. Nie zaznacza wyboru: robi to napad, który go bierze.
 */
export function wrogDoNapadu(
  st: GovState,
  day: number,
  obecni: ReadonlySet<string> = new Set(),
  mode: GameMode = 'zwykly',
): Znajomy | null {
  if (mode === 'zombie') return null;
  const mozliwi = (st.znajomi ?? []).filter(
    (z) => z.nastawienie < 0 && z.napad === undefined && !z.zmarl && z.ostatnio <= day && !obecni.has(z.osoba.name),
  );
  mozliwi.sort((a, b) => a.nastawienie - b.nastawienie || a.dzien - b.dzien || najpierwNajdawniejszy(a, b));
  return mozliwi[0] ?? null;
}

// ---------------------------------------------------------------- epitet

/** polska forma męska, żeńska i angielska (męska, żeńska) */
interface Wariant {
  m: string;
  f: string;
  en: string;
  enF?: string;
}

const w = (m: string, f: string, en: string, enF?: string): Wariant => ({ m, f, en, ...(enF ? { enF } : {}) });

/** Epitety według zdarzenia: po dwa warianty na `jak`, każdy mówi o tym, co się stało. */
const EPITET: Record<JakId, readonly Wariant[]> = {
  nakarmiony: [
    w('ten od słoików', 'ta od słoików', 'the man with the jars', 'the woman with the jars'),
    w('ten, któremu nie odmówiliście', 'ta, której nie odmówiliście', 'the one you did not turn away'),
  ],
  nocleg: [
    w('ten, który spał u was przy ogniu', 'ta, która spała u was przy ogniu', 'the one who slept by your fire'),
    w(
      'ten, którego wpuściliście na noc',
      'ta, którą wpuściliście na noc',
      'the man you let in for the night',
      'the woman you let in for the night',
    ),
  ],
  przyjety: [
    w('ten, którego przyjęliście', 'ta, którą przyjęliście', 'the man you took in', 'the woman you took in'),
    w('ten, co mieszkał u was', 'ta, co mieszkała u was', 'the one who used to live with you'),
  ],
  odprawiony: [
    w(
      'ten, którego odprawiliście z kwitkiem',
      'ta, którą odprawiliście z kwitkiem',
      'the man you sent away empty-handed',
      'the woman you sent away empty-handed',
    ),
    w('ten, któremu pokazaliście plecy', 'ta, której pokazaliście plecy', 'the one you turned your back on'),
  ],
  okradl: [
    w('ten, który wyniósł wam jedzenie', 'ta, która wyniosła wam jedzenie', 'the one who walked off with your food'),
    w('ten od zniknięcia zapasów', 'ta od zniknięcia zapasów', 'the one behind the missing stores'),
  ],
  wyrzucony: [
    w(
      'ten, którego wyrzuciliście w deszcz',
      'ta, którą wyrzuciliście w deszcz',
      'the man you threw out in the rain',
      'the woman you threw out in the rain',
    ),
    w(
      'ten, którego wyprowadziliście za siatkę',
      'ta, którą wyprowadziliście za siatkę',
      'the one you walked out beyond the fence',
    ),
  ],
  zlapany: [
    w('ten przyłapany przy zapasach', 'ta przyłapana przy zapasach', 'the one you caught at the stores'),
    w('ten, którego złapaliście z workiem', 'ta, którą złapaliście z workiem', 'the one you caught with the sack'),
  ],
};

/** Dopiski do puli epitetów dla dzieci, chorych i wyrzuconych mieszkańców (dołączają do wariantów zdarzenia). */
const EPITET_KTO: Partial<Record<KtoId | 'lokator', Partial<Record<JakId, readonly Wariant[]>>>> = {
  dziecko: {
    nakarmiony: [w('ten mały od miski zupy', 'ta mała od miski zupy', 'the little one with the bowl of soup')],
    nocleg: [
      w('ten mały, który spał przy ogniu', 'ta mała, która spała przy ogniu', 'the little one who slept by the fire'),
    ],
    odprawiony: [w('ten mały, którego odprawiliście', 'ta mała, którą odprawiliście', 'the little one you sent away')],
    okradl: [w('ten mały złodziejaszek', 'ta mała złodziejka', 'the little thief')],
    zlapany: [w('ten mały złodziejaszek', 'ta mała złodziejka', 'the little thief')],
  },
  chory: {
    nakarmiony: [w('ten chory, któremu pomogliście', 'ta chora, której pomogliście', 'the sick one you helped')],
    nocleg: [
      w('ten chory, któremu daliście kąt', 'ta chora, której daliście kąt', 'the sick one you gave a corner to'),
    ],
    odprawiony: [
      w('ten chory, którego odprawiliście', 'ta chora, którą odprawiliście', 'the sick one you turned away'),
    ],
  },
  lokator: {
    wyrzucony: [w('ten, którego stąd wyrzuciliście', 'ta, którą stąd wyrzuciliście', 'the one you threw out of here')],
  },
};

/** numer wariantu z id znajomego: ten sam znajomy ma ten sam epitet w każdym wywołaniu i po zapisie */
const skrot = (id: string): number => Number.parseInt(hashString(id), 16);

/** Epitet znajomego: krótka fraza w jego rodzaju o tym, co się stało („ten od słoików”, „ta, którą wyrzuciliście w deszcz”). */
export function epitet(z: Znajomy): Tx {
  const pula = [...EPITET[z.jak], ...(EPITET_KTO[z.kto]?.[z.jak] ?? [])];
  const v = pula[skrot(z.id) % pula.length];
  return z.osoba.f ? tx(v.f, v.enF ?? v.en) : tx(v.m, v.en);
}

/** Linia raportu o znajomym wśród szabrowników: „Wśród nich był Henryk Kowalski, ten od słoików.” */
export function liniaWsrod(z: Znajomy): Tx {
  const e = epitet(z);
  return tx(
    `Wśród nich ${plec(z.osoba, 'był', 'była')} ${z.osoba.name}, ${e.pl}.`,
    `${z.osoba.name}, ${e.en}, was among them.`,
  );
}

/** Znajomy w planie napadu (`RaidPlan.znajomy`): imię i nazwisko, epitet i wygląd. */
export function wPlanieNapadu(z: Znajomy): { id: string; imie: Tx; epitet: Tx; look: number } {
  return { id: z.id, imie: tx(z.osoba.name, z.osoba.name), epitet: epitet(z), look: z.look };
}

// ---------------------------------------------------------------- karta powrotu

const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Tytuł karty powrotu: „Henryk znowu pod bramą” / „Henryk is back at the gate”. */
export function tytulPowrotu(g: Gosc, s: Words, e: WordsEn): Tx {
  const p = g.osoby[0];
  return tx(`${p.first} znowu ${s.brama.pod}`, `${p.first} is back at ${e.brama}`);
}

/** zdanie o tym, co się stało ostatnio (rodzaj mówiącego) */
function rozpoznanie(z: Znajomy, g: Gosc, s: Words, e: WordsEn): Tx {
  const p = g.osoby[0];
  const he = p.f ? 'She' : 'He';
  const him = p.f ? 'her' : 'him';
  switch (z.jak) {
    case 'nakarmiony':
      return tx(
        `Ostatnim razem ${plec(p, 'nie wyszedł', 'nie wyszła')} stąd z pustymi rękami i nie ${plec(p, 'zapomniał', 'zapomniała')}.`,
        `Last time ${he.toLowerCase()} did not leave empty-handed, and ${he.toLowerCase()} has not forgotten.`,
      );
    case 'nocleg':
      return tx(
        `Ostatnim razem ${plec(p, 'spał', 'spała')} u was przy ogniu i nie ${plec(p, 'zapomniał', 'zapomniała')}.`,
        `Last time ${he.toLowerCase()} slept by your fire, and ${he.toLowerCase()} has not forgotten.`,
      );
    case 'przyjety':
      return tx(
        `${plec(p, 'Mieszkał', 'Mieszkała')} u was, a teraz stoi po drugiej stronie siatki.`,
        `${he} used to live with you, and now stands on the other side of the fence.`,
      );
    case 'odprawiony':
      return tx(
        `Ostatnim razem odprawiliście ${plec(p, 'go', 'ją')} spod ${s.brama.d}, ale nie chowa urazy.`,
        `Last time you sent ${him} away from ${e.brama}, but ${he.toLowerCase()} holds no grudge.`,
      );
    default:
      return tx('Ostatnim razem rozstaliście się źle.', 'You parted badly last time.');
  }
}

/** zdanie o darze: rodzeństwo do przyjęcia, worek jedzenia, wiadomość o miejscu */
function dar(g: Gosc): Tx | null {
  const p = g.osoby[0];
  const he = p.f ? 'She' : 'He';
  const his = p.f ? 'her' : 'his';
  const sib = g.osoby[1];
  if (sib && g.chce === 'dolaczyc')
    return tx(
      `${plec(p, 'Przyprowadził', 'Przyprowadziła')} ze sobą ${sib.f ? 'siostrę' : 'brata'}, ${sib.first}, i prosi, żeby ${sib.f ? 'ją' : 'go'} przyjąć.`,
      `${he} has brought ${his} ${sib.f ? 'sister' : 'brother'}, ${sib.first}, and asks you to take ${sib.f ? 'her' : 'him'} in.`,
    );
  if (g.porcje !== undefined)
    return tx(
      `Niesie worek z jedzeniem: ${porcje(g.porcje)}. Chce się odwdzięczyć.`,
      `${he} is carrying a sack of food, ${portions(g.porcje)}, to pay you back.`,
    );
  if (g.ma === 'wiadomosc')
    return tx(
      'Wie o miejscu niedaleko stąd, do którego nikt nie zaglądał od miesięcy, i chce się odwdzięczyć wieścią.',
      `${he} knows of a place not far from here that nobody has looked into for months, and wants to pay you back with the news.`,
    );
  return null;
}

/**
 * Tekst karty powrotu: kto stoi pod bramą (imię, epitet), co się ostatnio stało i dar. `g` to grupa tak, jak widzi ją karta
 * (żywi, mówiący pierwszy, to ten sam człowiek co `z`); słowa miejsca według siedziby.
 */
export function tekstPowrotu(g: Gosc, z: Znajomy, s: Words, e: WordsEn): Tx {
  const p = g.osoby[0];
  const ep = epitet(z);
  const czesci: Tx[] = [
    tx(`${wielka(s.brama.pod)} znowu stoi ${p.name}, ${ep.pl}.`, `${p.name}, ${ep.en}, is back at ${e.brama}.`),
    rozpoznanie(z, g, s, e),
  ];
  const d = dar(g);
  if (d) czesci.push(d);
  return { pl: czesci.map((t) => t.pl).join(' '), en: czesci.map((t) => t.en).join(' ') };
}

// ---------------------------------------------------------------- wydarzenie w puli

/** Wydarzenie `powrot`: wypadnięcie z puli nie otwiera karty, tylko planuje powrót znajomego jako gościa
    (`planujPowrot` w wizyta.ts, wołane z `eventTick`); karta przychodzi pod bramą jako zwykła karta gościa. Waga zero bez
    obcych (`GovInput.goscie`), przy trwającej wizycie i gdy nikt nie może wrócić (`doPowrotu`); odstęp cztery doby. */
export const POWROT_EVENT: GEventDef<{ id: string }> = {
  id: 'powrot',
  gap: POWROT_ODSTEP_DNI * 24,
  when: ['dzien', 'wieczor', 'noc'],
  w: (h) => (h.goscie() && !h.goscAktywny() && h.doPowrotu() ? WAGA_POWROTU : 0),
  make: () => ({ id: '' }),
  title: () => tx('Ktoś wraca', 'Someone is back'),
  text: () => tx('Ktoś znajomy podchodzi do bramy.', 'Someone familiar is coming up to the gate.'),
  choices: () => [],
};
