/* Nakładki zarządu na wydarzenia z 0.3 (src/content/events.ts zostaje bajt w bajt): pora dnia, tryby gry (`tryby`:
   w trybie zombie nie przychodzą karty o ludziach, których na mapie nie ma), flaga pierwszej nocy, waga z warunkami
   miejsca, teksty i napisy według miejsca (dom albo blok, jacy sąsiedzi), zwroty w kronice i własne wybory tam, gdzie
   skutek z 0.3 nie ma w M1 sensu (przyjęcia według wolnych miejsc, podwójne liczenie ludzi).
   Czego nakładka nie zmienia, idzie z 0.3: losowanie danych, skutki, liczby. „Opał” z 0.3 to w grze „Drewno”:
   tę zamianę robi wydarzenia.ts dla tytułów, tekstów, napisów i kroniki. Teksty: docs/superpowers/specs/
   2026-10-17-wydarzenia-z-miejsca-design.md, punkty 5 i 5a.

   Karty z prawdziwych ludzi (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 2): w bloku z mieszkańcami
   z osobą z generatora (`GovHost.lokatorzy()`) `fachowiec` to mieszkaniec z klatki z umiejętnością, której zarząd nie
   zna (Wciągnąć do roboty to awans), a `kradziez` przychodzi z głodu (bez uchwały u_kociol; sprawca to mieszkaniec
   z najniższym nastrojem, waga razy czynnik z jego nastroju, nowy wybór „Dać mu jeść z kotła”, odstęp 48 godzin). Dane takiej
   karty niosą `lok` (id osoby) i `p` (imię, rodzaj, fach); bez nich i bez mieszkańców z osobą karty grają jak z 0.3.
   `odejscie` (Niech idzie) i `klotnia` (przegrany się wyprowadza) wyprowadzają osobę zarządu bramą (`wyrzuc`) zamiast
   ją kasować; `odejscie` nie przychodzi, gdy w zarządzie jest mniej niż dwie osoby, a `klotnia` bierze dwie osoby
   z najniższym nastrojem i tylko gdy obie mają go poniżej 55. Zdanie o stracie w `kradziez` jest przepisane zawsze (0.3
   ma „… w budynku X Jedzenie 3.” bez znaku przed liczbą): „zapasy z piwnicy w budynku X: jedzenie 3”.

   Karty z gościem pod bramą (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Karty z gościem”):
   `uchodzcy`, `influencer`, `aktywisci`, `dzieci`, `krypto` i w domu `fachowiec` mają `gosc` (kogo wystawić: `GoscKarty`)
   i wagę 0 bez `GovInput.goscie` (gra bez obcych) oraz przy wizycie w toku. Wypadnięcie takiej karty planuje wizytę
   (`planujKarte` w wizyta.ts), a karta otwiera się dopiero pod bramą, z `gid` w danych. Z `gid` tekst czyta żywą grupę
   (`GovHost.grupa`: ilu ludzi stoi, czy mówiący to fachowiec), a wybory sterują jej pionkami zamiast dokładać
   mieszkańców: uchodźcy „Przyjąć wszystkich” to `przyjmijGosci` (mówiący z fachem idzie do zarządu, jak w 0.3 przez
   `joinPerson`), jedzenie `nakarmGosci`, odprawa `odprawGosci`; influencerka i fachowiec w domu `przyjmijDoZarzadu`;
   aktywiści „Zaprosić do ciepła” `nocGosci` (rano odchodzą bramą); dzieciaki i sąsiad od tokenów po decyzji
   `odprawGosci`. Przyjęcie całej grupy to jedyne przyjęcie z liczbą: „Przyjąć tylu, ilu się zmieści” z 0.3 odpada, bo
   symulacja przyjmuje albo odprawia całą grupę. Wybory są dostępne tylko, gdy grupa wciąż stoi pod bramą. Karta bez
   `gid` (z zapisu sprzed wizyt, albo gdy `gosc` oddało null) gra jak w 0.3. */

import { TECH_DOMS } from '../content/data.ts';
import { type EventChoice, eventDef } from '../content/events.ts';
import { g, type Person } from '../content/people.ts';
import { wielka } from '../core/jezyk.ts';
import { pick, ri } from '../core/rng.ts';
import { type KtoId, osobyGrupy } from './goscie.ts';
import type { GoscKarty, GovHost, Pora } from './tresc.ts';
import type { GameMode, GovLokator, GovPerson } from './typy.ts';

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzeń z 0.3 mają różne kształty
type D = any;

export interface OldEvent {
  id: string;
  when: readonly Pora[];
  /** w jakich trybach gry wydarzenie wchodzi do puli (brak: w obu) */
  tryby?: readonly GameMode[];
  /** dozwolone pierwszego dnia po ciszy i pierwszej nocy */
  first?: boolean;
  /** ton karty dla narratora (`GEventDef.ton`): brak oznacza kartę zwykłą */
  ton?: 'ostre' | 'lagodne';
  /** najmniej tyle godzin gry między powtórkami (brak: REPEAT_GAP) */
  gap?: number;
  /** waga w M1; base to waga z 0.3 na tym samym hoście */
  w?: (h: GovHost, base: number) => number;
  /** własne dane zamiast make z 0.3 */
  make?: (h: GovHost) => D | null;
  /** karta, w której ktoś przychodzi pod bramę: kogo wystawić (grupa z danych karty); null: tym razem bez gościa */
  gosc?: (h: GovHost, d: D) => GoscKarty | null;
  /** null: tytuł albo tekst z 0.3 */
  title?: (h: GovHost, d: D) => string | null;
  text?: (h: GovHost, d: D) => string | null;
  /** napisy na przyciskach po numerze wyboru (brak albo null: z 0.3); skutki zostają */
  labels?: (h: GovHost, d: D) => (string | null)[];
  /** własne wybory; base to wybory z 0.3 (napisy już z drewnem) */
  choices?: (h: GovHost, d: D, base: EventChoice[]) => EventChoice[];
  /** zwroty do podmiany w kronice z wyborów tego wydarzenia */
  log?: (h: GovHost) => Record<string, string> | null;
}

/** kradzież z piwnicy w grze z mieszkańcami z osobą: waga z 0.3 razy czynnik z nastroju najgłodniejszego (patrz
    `czynnikKradziezy`): do tego nastroju (włącznie) kradnie się z pełną wagą, od `NASTROJ_SYTY` w górę z jedną czwartą */
export const NASTROJ_GLODNY = 45;
export const NASTROJ_SYTY = 65;
/** dwie osoby zarządu z nastrojem poniżej tej wartości mogą się pokłócić o grafik */
export const KLOTNIA_NASTROJ = 55;
/** dziedzina, w której zarząd wiedzy poniżej tej wartości „nie zna się” (jak w 0.3) */
const ZNA_SIE = 3;

/** osoba z karty w danych wydarzenia (JSON): imię, rodzaj i fach, do tekstów po zmianie stanu gry */
export interface OsobaKarty {
  id: string;
  first: string;
  name: string;
  f: boolean;
  prof: string;
  age: number;
}
export const osobaKarty = (l: GovLokator): OsobaKarty => ({
  id: l.id,
  first: l.first,
  name: l.name,
  f: l.f,
  prof: l.prof,
  age: l.age,
});

/** Mieszkaniec z klatki, który zna się na dziedzinie, której zarząd nie zna (`know(d) < 3`): ten z najwyższą
    umiejętnością w takiej dziedzinie, przy remisie starszy, przy remisie pierwszy w kolejności pionków; null: nikogo
    (albo brak mieszkańców z osobą). */
export function fachowiecZKlatki(h: GovHost): GovLokator | null {
  const nieznane = TECH_DOMS.filter((d) => h.know(d) < ZNA_SIE);
  let best: GovLokator | null = null;
  let bv = 0;
  for (const l of h.lokatorzy()) {
    const v = Math.max(0, ...nieznane.map((d) => l.skills[d] ?? 0));
    if (v > bv || (v > 0 && v === bv && best && l.age > best.age)) {
      best = l;
      bv = v;
    }
  }
  return best;
}

/** czynnik wagi kradzieży z nastroju sprawcy: clamp((65 − nastrój) / 20, 0,25, 1), czyli 1 przy nastroju do 45,
    0,25 od 65 w górę (zadowoleni mieszkańcy kradną rzadko, ale się zdarza) */
export const czynnikKradziezy = (nastroj: number): number =>
  Math.min(1, Math.max(0.25, (NASTROJ_SYTY - nastroj) / (NASTROJ_SYTY - NASTROJ_GLODNY)));

/** mieszkaniec, który ukradł z piwnicy: ten z najniższym nastrojem (remis: pierwszy w kolejności pionków), o ile nie
    podpisano wspólnego kotła; null: nikt (albo brak mieszkańców z osobą). Głód mieszkańców w symulacji jest tylko
    przybliżony nastrojem (jedzą wspólnie albo wcale), więc nie ma progu, a o wadze decyduje `czynnikKradziezy`. */
export function sprawcaKradziezy(h: GovHost): GovLokator | null {
  if (h.law('u_kociol')) return null;
  let best: GovLokator | null = null;
  for (const l of h.lokatorzy()) if (!best || l.needs.mood < best.needs.mood) best = l;
  return best;
}

/** Najstarsza mieszkanka siedziby, a gdy żadnej nie ma, najstarszy mieszkaniec (remis: pierwszy w kolejności pionków);
    bohaterka kart `dym` i `latarka`. null: brak mieszkańców z osobą. */
export function najstarszaMieszkanka(h: GovHost): GovLokator | null {
  const lista = h.lokatorzy().map((l, k) => ({ l, k }));
  lista.sort((a, b) => Number(b.l.f) - Number(a.l.f) || b.l.age - a.l.age || a.k - b.k);
  return lista[0]?.l ?? null;
}

/** dwie osoby zarządu z najniższym nastrojem (remis: kolejność osób), o ile obie mają go poniżej `KLOTNIA_NASTROJ` */
export function parDoKlotni(h: GovHost): [GovPerson, GovPerson] | null {
  const lista = h.zarzad().map((p, k) => ({ p, k }));
  lista.sort((a, b) => a.p.needs.mood - b.p.needs.mood || a.k - b.k);
  const [a, b] = lista;
  return a && b && a.p.needs.mood < KLOTNIA_NASTROJ && b.p.needs.mood < KLOTNIA_NASTROJ ? [a.p, b.p] : null;
}

/** „Opał 5” z 0.3 to w grze „Drewno 5”, jak na pasku i w nowych wydarzeniach */
export const drewno = (s: string): string => s.replaceAll('Opał', 'Drewno');

/** waga wydarzeń z przyjęciem: rzadziej, kiedy jest ciasno */
export const admitWeight = (free: number): number => (free >= 4 ? 1 : free >= 1 ? 0.5 : 0.15);

/** „osoba”, „osoby”, „osób” do liczby */
export function osob(n: number): string {
  if (n === 1) return 'osoba';
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'osoby' : 'osób';
}

/** „4 osoby będą”, „7 osób będzie” (przed „spać na podłodze”) */
export const osobyNaPodlodze = (n: number): string => `${n} ${osob(n)} ${osob(n) === 'osoby' ? 'będą' : 'będzie'}`;

const dom = (h: GovHost) => h.place().kind === 'dom';
/** sąsiedzi to domy: teksty o domach obok zamiast o blokach */
const domyObok = (h: GovHost) => h.neighbours() === 'domy';
/** w okolicy nie ma sąsiadów: wydarzenia o nich nie przychodzą (samotny dom w polu, samotny blok) */
const nikt = (h: GovHost) => h.neighbours() === null;

// ---------------------------------------------------------------- karty z gościem pod bramą

/** karta z gościem może wypaść: gra z obcymi (`GovInput.goscie`) i zarząd nie prowadzi już innej wizyty */
const zGosciem = (h: GovHost): boolean => !!h.goscie() && !h.goscAktywny();

/** imiona zajęte w osiedlu (zarząd, mieszkańcy z osobą i podane osoby) i imiona postaci znanych z kart (znajomi, gość, ludzie
    z łańcuchów): grupa z karty ich nie powtarza */
const imionaZajete = (h: GovHost, ...osoby: (Person | null | undefined)[]): Set<string> =>
  new Set([
    ...[...h.alive(), ...h.lokatorzy(), ...osoby.filter((p): p is Person => !!p)].map((p) => p.first),
    ...h.imionaPostaci(),
  ]);

/** Grupa z karty: `ilu` osób archetypu `kto` (id z licznika, `planujKarte` nadaje właściwe), mówiący z karty, jeśli jest. */
function grupaKarty(h: GovHost, kto: KtoId, ilu: number, mowiacy?: Person | null): Person[] {
  let n = 1;
  return osobyGrupy(h.rng, () => n++, kto, ilu, imionaZajete(h, mowiacy), mowiacy ?? undefined);
}

/** Karta z gościem pod bramą ma `gid` w danych (id wizyty), karta z zapisu sprzed wizyt albo bez gościa tym razem go nie ma */
const zGrupa = (d: D): boolean => typeof d?.gid === 'string';

/** czy grupa tej karty wciąż stoi pod bramą (wybory są dostępne tylko wtedy) */
const podBrama = (h: GovHost, d: D): boolean => !!h.grupa(d.gid)?.pod;

/** Wybory karty z gościem: skutki z 0.3 (`base`), potem rozkaz dla grupy (`po`, numer wyboru); dostępne tylko pod bramą. */
const poDecyzji = (h: GovHost, d: D, base: EventChoice[], po: (k: number) => void): EventChoice[] => {
  const pod = podBrama(h, d);
  return base.map((c, k) => ({
    ...c,
    ok: c.ok && pod,
    run: () => {
      c.run();
      po(k);
    },
  }));
};

/** ilu ludzi stoi pod bramą w karcie `uchodzcy`: żywi z grupy (z `gid`), inaczej liczba z danych karty */
export function uchodzcyN(h: GovHost, d: D): number {
  const k = zGrupa(d) ? h.grupa(d.gid) : null;
  return k ? k.osoby.length : d.n;
}

/** mówiący z fachem w karcie `uchodzcy` (`d.spec`): z grupą tylko, gdy wciąż stoi pierwszy (umarł mówiący, fachowca nie ma) */
export function uchodzcySpec(h: GovHost, d: D): Person | null {
  if (!d.spec) return null;
  const k = zGrupa(d) ? h.grupa(d.gid) : null;
  return !k || k.osoby[0]?.name === d.spec.name ? d.spec : null;
}

/** W domu pod furtką stoi rodzina, chyba że mówiący fachowiec jest za młody na dzieci (poniżej 28 lat): wtedy `gosc` buduje
    dorosłych (`wedrowiec`), a tekst mówi o grupie. Tylko karta z grupą pod bramą (`gid`); stara karta z zapisu zawsze
    o rodzinie, jak w 0.3. */
export const RODZINA_OD = 28;
export function uchodzcyGrupa(h: GovHost, d: D): boolean {
  return dom(h) && zGrupa(d) && !!d.spec && d.spec.age < RODZINA_OD;
}

/** Wybory karty `uchodzcy` z grupą pod bramą: przyjąć wszystkich (mówiący z fachem idzie do zarządu), nakarmić na drogę
    albo odprawić. „Przyjąć tylu, ilu się zmieści” z 0.3 odpada: grupę przyjmuje się w całości albo wcale, a na podłogę
    kładzie się brakujących (jak w przycisku „Przyjąć wszystkich”). */
function uchodzcyZGrupa(h: GovHost, d: D): EventChoice[] {
  const pod = podBrama(h, d);
  const n = uchodzcyN(h, d);
  const free = h.free();
  const admit = () => {
    if (uchodzcySpec(h, d)) h.przyjmijDoZarzadu();
    else h.przyjmijGosci();
    h.mood(1, n > free ? 2 : 0);
    h.log(
      `Przyjęliście ${n} ${n === 1 ? 'osobę' : osob(n)} ${d.from}.${n > free ? ` ${osobyNaPodlodze(n - free)} spać na podłodze.` : ''}`,
      true,
    );
  };
  const out: EventChoice[] = [];
  if (free >= n) out.push({ label: 'Przyjąć wszystkich', ok: pod, run: admit });
  out.push({
    label: 'Dać Jedzenie 3 na drogę',
    ok: pod && h.res.jedzenie >= 3,
    run: () => {
      h.nakarmGosci(3);
      h.mood(1, 0);
    },
  });
  if (free < n)
    out.push({ label: `Przyjąć wszystkich (${osobyNaPodlodze(n - free)} spać na podłodze)`, ok: pod, run: admit });
  out.push({
    label: 'Odprawić',
    ok: pod,
    run: () => {
      h.odprawGosci();
      h.mood(-2, -1);
    },
  });
  return out;
}

/** zdanie o dzieciakach w trybie zombie (karta `dzieci`); po angielsku `DZIECI_ZOMBIE_EN` w warianty.en.ts */
export const DZIECI_ZOMBIE = 'Wózek terkocze na bruku, a dzieciaki co chwilę oglądają się na ulicę.';

/** skąd ktoś patrzy przez lornetkę: z najwyższego budynku w okolicy */
const TOWER: Record<string, string> = {
  wiezowiec: 'Z dachu wieżowca',
  blok: 'Z dachu wysokiego bloku',
  szkola: 'Z dachu szkoły',
  kosciol: 'Z wieży kościoła',
  hala: 'Z dachu hali',
  market: 'Z dachu marketu',
};

/** skąd przychodzą ludzie pod bramę: w bloku jak w 0.3, w domu rodzina */
const FROM_BLOK = [
  'z Wilanowa',
  'z zamkniętego osiedla z ochroną',
  'z bloku, w którym pękł pion',
  'ze wsi, gdzie skończyła się woda',
  'z kampusu dawnej korporacji',
  'z osiedla za obwodnicą',
];
const FROM_DOM = [
  'z miasta, gdzie pękł wodociąg',
  'ze wsi, gdzie skończyła się woda',
  'z domu, któremu zawalił się dach',
  'z osiedla za obwodnicą',
];

/** wydarzenia z 0.3, które pasują do pierwszych nocy, z porą dnia, warunkami miejsca i wariantami tekstów */
export const OLD_EVENTS: OldEvent[] = [
  {
    id: 'handlarz',
    when: ['dzien'],
    // prawdziwy handlarz chodzi w symulacji (src/sim/handlarz.ts), a ta karta opisuje go bez nikogo pod bramą: waga 0
    // w obu trybach; tryby tylko zwykły, żeby przy ewentualnym powrocie karty zombie jej nie dostał
    tryby: ['zwykly'],
    w: () => 0,
    text: (h) => `${wielka(h.words().brama.pod)} stoi facet z wózkiem z marketu. Wymieni jedną rzecz i idzie dalej.`,
  },
  {
    id: 'dzieci',
    ton: 'lagodne',
    when: ['dzien'],
    w: (h, base) => (nikt(h) || !zGosciem(h) ? 0 : base),
    // dwoje albo troje dzieciaków (9–15 lat, rodzeństwo z jednym nazwiskiem), najstarsze mówi
    gosc: (h) => {
      const osoby = grupaKarty(h, 'dziecko', ri(2, 3, h.rng));
      const wiek = osoby.map(() => ri(9, 15, h.rng)).sort((a, b) => b - a);
      osoby.forEach((p, k) => {
        p.age = wiek[k];
      });
      return { osoby, kto: 'dzieci' };
    },
    // w trybie zombie dzieciaki z wózkiem na ulicy to ryzyko, więc jedno zdanie o tym (w 0.3 tekst bez zmian)
    text: (h, d) => {
      const baza = domyObok(h)
        ? 'Dzieciaki z sąsiednich domów przyciągnęły taczkę blach i rur z rozbiórki szopy. Chcą coś do jedzenia.'
        : eventDef('dzieci')!.text(h, d);
      return h.tryb() === 'zombie' ? `${baza} ${DZIECI_ZOMBIE}` : domyObok(h) ? baza : null;
    },
    // po wymianie (albo odmowie) dzieciaki idą dalej z wózkiem
    choices: (h, d, base) => (zGrupa(d) ? poDecyzji(h, d, base, () => h.odprawGosci()) : base),
  },
  {
    id: 'lodowka',
    ton: 'lagodne',
    when: ['dzien'],
    // w domu lodówka stoi u sąsiadów: bez sąsiadów jej nie ma
    w: (h, base) => (dom(h) && nikt(h) ? 0 : base),
    text: (h) =>
      dom(h)
        ? 'W domu obok, u sąsiadów, którzy wyjechali w 2048 roku, stoi pełna lodówka. Zamknięta na amen, bo abonament wygasł razem z serwerem producenta.'
        : null,
  },
  {
    id: 'dron',
    ton: 'lagodne',
    when: ['dzien'],
    text: (h) =>
      dom(h)
        ? 'Nad ulicą od trzech lat krąży dron z zamówieniem, którego nikt nie odebrał. Ładuje się ze słońca i nie odpuszcza.'
        : null,
    log: (h) =>
      dom(h)
        ? {
            'maskotką osiedla': 'maskotką ulicy',
            ...(h.place().garages === null
              ? { 'spadł za garażami': nikt(h) ? 'spadł za płotem' : 'spadł w ogrodzie sąsiadów' }
              : {}),
          }
        : null,
  },
  {
    id: 'automat',
    ton: 'lagodne',
    when: ['dzien'],
    // automat paczkowy stoi przy sklepie, więc tylko tam, gdzie sklep jest
    w: (h, base) => (h.place().shop === null ? 0 : base),
    text: (h) =>
      dom(h)
        ? 'Po trzech latach automat z paczkami przy sklepie otworzył wszystkie skrytki naraz. Zbiega się pół ulicy.'
        : null,
    labels: (h) => (dom(h) ? [null, 'Zabrać do szopy komitetu'] : []),
  },
  {
    id: 'auto',
    ton: 'lagodne',
    when: ['dzien'],
    // w domu auto stoi na podjeździe u sąsiadów: bez sąsiadów go nie ma
    w: (h, base) => (dom(h) && nikt(h) ? 0 : base),
    text: (h) =>
      dom(h)
        ? 'Na podjeździe u sąsiadów stoi autonomiczne auto, które od 2048 roku czeka na aktualizację. Mruga światłami, kiedy ktoś przechodzi.'
        : null,
  },
  {
    id: 'czynsz',
    when: ['dzien', 'wieczor'],
    // w trybie zombie nikt nie ściąga czynszu ani rat
    tryby: ['zwykly'],
    // w domu nie ma czynszu, jest rata kredytu; skutki te same
    title: (h) => (dom(h) ? 'Rata kredytu za 2047' : null),
    text: (h) =>
      dom(h)
        ? `Ktoś przyniósł list z banku: zaległa rata kredytu za dom z 2047 roku plus odsetki i opłata za upomnienie. ${nikt(h) ? 'Ludzie' : 'Sąsiedzi'} pytają, czy komitet ulicy też będzie zbierał składki.`
        : null,
    labels: (h) => [
      dom(h) ? 'Ogłosić, że komitet składek nie zbiera' : null,
      h.campfire() ? null : 'Spalić list w kozie',
    ],
  },
  {
    id: 'krypto',
    ton: 'lagodne',
    when: ['dzien'],
    // w trybie zombie sąsiad zza płotu nie handluje tokenami
    tryby: ['zwykly'],
    w: (h, base) => (nikt(h) || !zGosciem(h) ? 0 : base),
    // sąsiad jest mężczyzną (tekst mówi „sąsiad”, „on”, „him”); ta sama osoba stoi pod bramą jako pionek
    make: (h) => ({ p: h.makePerson({ f: false }) }),
    // sąsiad z bloku obok (zza płotu) stoi sam pod bramą
    gosc: (_h, d) => ({ osoby: [d.p], kto: 'sasiad' }),
    text: (h) =>
      domyObok(h)
        ? 'Sąsiad zza płotu chce kupić od was Drewno 5. Płaci tokenami, które według niego zaraz odbiją.'
        : null,
    // po decyzji (tokeny albo śmiech) sąsiad wraca do siebie
    choices: (h, d, base) => (zGrupa(d) ? poDecyzji(h, d, base, () => h.odprawGosci()) : base),
  },
  {
    id: 'ksiazki',
    ton: 'lagodne',
    when: ['dzien'],
    title: (h) => (dom(h) ? 'Karton na strychu' : null),
    text: (h, d) => (dom(h) ? `Na strychu znalazł się karton z książkami. Na wierzchu leży „${d.name}”.` : null),
    labels: (h) => (dom(h) ? ['Na półkę przy kozie'] : []),
    log: (h) => (dom(h) ? { 'w świetlicy': 'na półce przy kozie' } : null),
  },
  {
    id: 'aktywisci',
    ton: 'lagodne',
    when: ['dzien'],
    // protest przy stadzie nie ma sensu
    tryby: ['zwykly'],
    // protest przeciw kozom jest też początkiem łańcucha „Aktywistka od kóz” (src/gov/watki-tresc.ts): gdy ten jest wątkiem
    // sezonu, protestuje tamta jedna kobieta, nie grupka
    w: (h, base) => (zGosciem(h) && !h.watek('aktywistka') ? base : 0),
    // czterech aktywistów pod bramą (dorośli, bez wspólnego nazwiska)
    gosc: (h) => ({ osoby: grupaKarty(h, 'wedrowiec', 4), kto: 'aktywisci' }),
    text: (h) =>
      dom(h)
        ? 'Grupka aktywistów z sąsiedniej ulicy protestuje przeciw dymowi z waszego komina. Sami są zmarznięci na kość.'
        : null,
    // grzeją się do rana i odchodzą: bez dokwaterowania czterech osób (mniej źródeł przyjęć). Z grupą pod bramą wchodzą na
    // noc (brama na kłódkę po 20:00 ich nie wpuści), a rano o 6–8 wychodzą bramą
    choices: (h, d, base) =>
      zGrupa(d)
        ? [
            {
              ...base[0],
              ok: podBrama(h, d) && !h.gateClosed(),
              run: () => {
                h.nocGosci();
                h.mood(1, 0);
                h.log('Aktywiści weszli do ciepła. Rano pójdą protestować gdzie indziej.');
              },
            },
            ...poDecyzji(h, d, base, () => h.odprawGosci()).slice(1),
          ]
        : [
            {
              ...base[0],
              run: () => {
                h.mood(1, 0);
                h.log('Aktywiści grzali się przy kozie do rana i poszli protestować gdzie indziej.');
              },
            },
            ...base.slice(1),
          ],
  },
  {
    id: 'influencer',
    ton: 'lagodne',
    when: ['dzien'],
    // vlog przy stadzie też nie
    tryby: ['zwykly'],
    w: (h, base) => (zGosciem(h) ? base : 0),
    // influencerka z karty stoi pod bramą sama: ta sama osoba, to samo imię
    gosc: (_h, d) => ({ osoby: [d.p], kto: 'influencer' }),
    text: (h, d) =>
      dom(h)
        ? `Pod furtką nagrywa vloga ${d.p.name} z ring lightem na baterie. Mówi, że ma dwa miliony obserwujących. Internetu nie ma od trzech lat.`
        : null,
    // dołącza do rdzenia i nie liczy się drugi raz jako mieszkanka; z grupą pod bramą ten sam pionek idzie do zarządu
    choices: (h, d, base) =>
      zGrupa(d)
        ? [
            {
              ...base[0],
              label: dom(h) ? 'Przyjąć do domu' : base[0].label,
              ok: podBrama(h, d),
              run: () => h.przyjmijDoZarzadu(),
            },
            ...poDecyzji(h, d, base, () => h.odprawGosci()).slice(1),
          ]
        : [
            { ...base[0], label: dom(h) ? 'Przyjąć do domu' : base[0].label, run: () => h.joinPerson(d.p) },
            ...base.slice(1),
          ],
  },
  {
    id: 'uchodzcy',
    when: ['dzien'],
    // w trybie zombie ocaleni przychodzą jako goście (ukryte ugryzienie potrzebuje prawdziwej osoby pod bramą)
    tryby: ['zwykly'],
    // obcy pod bramą od drugiego dnia; rzadziej, kiedy jest ciasno; tylko w grze z obcymi, bo ktoś musi stanąć pod bramą
    w: (h) => (zGosciem(h) && h.day() >= 2 ? 0.8 * admitWeight(h.free()) : 0),
    make: (h) => {
      const house = dom(h);
      return {
        n: house ? ri(2, 4, h.rng) : ri(4, 12, h.rng),
        from: pick(house ? FROM_DOM : FROM_BLOK, h.rng),
        spec: h.rng() < 0.3 ? h.makePerson() : null,
      };
    },
    // n osób z karty; mówiący to fachowiec z karty, gdy jest. W domu to rodzina (o ile mówiący ma wiek na dzieci), w bloku
    // dorośli z jednego osiedla
    gosc: (h, d) => {
      const spec: Person | null = d.spec ?? null;
      const rodzina = dom(h) && (!spec || spec.age >= RODZINA_OD);
      return {
        osoby: grupaKarty(h, rodzina ? 'rodzina' : 'wedrowiec', d.n, spec),
        kto: rodzina ? 'rodzina' : 'wedrowiec',
      };
    },
    title: (h, d) => (dom(h) ? (uchodzcyGrupa(h, d) ? 'Ludzie pod furtką' : 'Rodzina pod furtką') : 'Ludzie pod bramą'),
    text: (h, d) => {
      const free = h.free();
      const n = uchodzcyN(h, d);
      const many = osob(n) === 'osoby';
      const sp = uchodzcySpec(h, d);
      const spec = sp ? ` Wśród nich jest ${sp.prof.toLowerCase()}, ${sp.name}.` : '';
      if (dom(h))
        return `Pod furtką stoi ${uchodzcyGrupa(h, d) ? 'grupa' : 'rodzina'}, ${n} ${osob(n)}. Przyszli ${d.from}${d.from.includes(',') ? ',' : ''} i proszą o miejsce. ${free ? `Wolnych łóżek w domu: ${free}.` : 'W domu nie ma wolnych łóżek, spaliby na podłodze w kuchni.'}${spec}`;
      return `Pod bramą ${many ? 'stoją' : 'stoi'} ${n} ${osob(n)} i ${many ? 'proszą' : 'prosi'} o miejsce. Przyszli ${d.from}. Wolnych miejsc w bloku: ${free}.${spec}`;
    },
    choices: (h, d) => {
      if (zGrupa(d)) return uchodzcyZGrupa(h, d);
      const free = h.free();
      const admit = (k: number) => () => {
        const joined = d.spec && k > 0 ? 1 : 0;
        if (joined) h.joinPerson(d.spec);
        h.addPeople(k - joined);
        h.mood(1, k > free ? 2 : 0);
        h.log(
          `Przyjęliście ${k} ${k === 1 ? 'osobę' : osob(k)} ${d.from}.${k > free ? ` ${osobyNaPodlodze(k - free)} spać na podłodze.` : ''}`,
          true,
        );
      };
      const out: EventChoice[] = [];
      if (free >= d.n) out.push({ label: 'Przyjąć wszystkich', ok: true, run: admit(d.n) });
      else if (free > 0) out.push({ label: `Przyjąć tylu, ilu się zmieści (${free})`, ok: true, run: admit(free) });
      out.push({
        label: 'Dać Jedzenie 3 na drogę',
        ok: h.res.jedzenie >= 3,
        run: () => {
          h.addRes('jedzenie', -3);
          h.mood(1, 0);
        },
      });
      if (free < d.n)
        out.push({
          label: `Przyjąć wszystkich (${osobyNaPodlodze(d.n - free)} spać na podłodze)`,
          ok: true,
          run: admit(d.n),
        });
      out.push({ label: 'Odprawić', ok: true, run: () => h.mood(-2, -1) });
      return out;
    },
  },
  {
    id: 'fachowiec',
    ton: 'lagodne',
    when: ['wieczor'],
    // w bloku z mieszkańcami z osobą to jeden z nich, z umiejętnością, której zarząd nie zna (bez takiego karty nie ma);
    // w bloku bez nich ktoś z mieszkańców, w domu sąsiad zza płotu; bez nich nie ma komu się przyznać
    w: (h, base) =>
      dom(h)
        ? h.neighbour() && zGosciem(h)
          ? base
          : 0
        : h.lokatorzy().length
          ? fachowiecZKlatki(h)
            ? base
            : 0
          : h.residents() > 0
            ? base
            : 0,
    make: (h) => {
      const l = dom(h) ? null : fachowiecZKlatki(h);
      return l ? { p: osobaKarty(l), b: h.hqName(), lok: l.id } : eventDef('fachowiec')!.make(h);
    },
    // w domu sąsiad zza płotu podchodzi do furtki; w bloku fachowiec jest już w środku (mieszkaniec z klatki albo z 0.3)
    gosc: (h, d) => (dom(h) && !d.lok ? { osoby: [d.p], kto: 'sasiad' } : null),
    text: (h, d) => {
      const p = d.p;
      const who = dom(h)
        ? `${p.name} ${h.neighbour() ?? 'zza płotu'}`
        : d.lok
          ? `${p.name} z waszej klatki`
          : `${p.name} z budynku ${d.b}`;
      // sąsiad z furtki (karta z gościem pod bramą) podchodzi i przyznaje się tam, a nie przy kozie, której tu nie ma
      if (dom(h) && zGrupa(d))
        return `${who} ${g(p, 'podszedł', 'podeszła')} do ${h.words().brama.d} i ${g(p, 'przyznał', 'przyznała')}, że ${g(p, 'był', 'była')} kiedyś: ${p.prof.toLowerCase()}. Do tej pory ${g(p, 'siedział', 'siedziała')} cicho, bo bał${g(p, '', 'a')} się, że każą ${g(p, 'mu', 'jej')} pracować.`;
      return `${who} ${g(p, 'przyznał', 'przyznała')} ${h.campfire() ? 'przy ognisku' : 'przy kozie'}, że ${g(p, 'był', 'była')} kiedyś: ${p.prof.toLowerCase()}. Do tej pory ${g(p, 'siedział', 'siedziała')} cicho, bo bał${g(p, '', 'a')} się, że każą ${g(p, 'mu', 'jej')} pracować.`;
    },
    // mieszkaniec z klatki przechodzi do zarządu jako ta sama osoba (awans: mieszkańców o jednego mniej bez ruszania
    // liczby przyjętych); bez niego w bloku mieszkaniec z 0.3 dołącza do zarządu (mieszkańców o jednego mniej), w domu
    // sąsiad dołącza do domowników
    choices: (h, d, base) =>
      zGrupa(d)
        ? [
            {
              ...base[0],
              ok: podBrama(h, d),
              run: () => {
                h.przyjmijDoZarzadu();
                h.mood(1, 0);
              },
            },
            ...poDecyzji(h, d, base, () => h.odprawGosci()).slice(1),
          ]
        : d.lok && !dom(h)
          ? [
              {
                ...base[0],
                ok: !!h.lokator(d.lok),
                run: () => {
                  h.awansuj(d.lok);
                  h.mood(1, 0);
                },
              },
              ...base.slice(1),
            ]
          : [
              {
                ...base[0],
                run: () => {
                  base[0].run();
                  if (!dom(h)) h.removeResident(0);
                },
              },
              ...base.slice(1),
            ],
  },
  {
    id: 'klotnia',
    when: ['wieczor'],
    // dwie osoby zarządu z najniższym nastrojem i tylko wtedy, gdy obie mają go poniżej 55
    w: (h, base) => (base > 0 && parDoKlotni(h) ? base : 0),
    make: (h) => {
      const par = parDoKlotni(h);
      return par ? { a: par[0].id, b: par[1].id } : null;
    },
    text: (h, d) =>
      dom(h)
        ? `${h.spec(d.a)?.name} i ${h.spec(d.b)?.name} pokłócili się o grafik dyżurów przy kozie. Reszta domu słucha zza ściany.`
        : null,
    // przegrany wychodzi bramą (nie znika), a jego odejście losuje się jak w 0.3 (30%)
    choices: (h, d, base) => {
      const A = h.spec(d.a);
      const B = h.spec(d.b);
      const strona = (przegrany: Person | undefined) => () => {
        h.mood(0, 1);
        if (przegrany && h.rng() < 0.3) {
          h.wyrzuc(przegrany.id);
          h.log(
            `${przegrany.name} ${g(przegrany, 'obraził się i wyprowadził', 'obraziła się i wyprowadziła')} do innego osiedla.`,
            true,
          );
        }
      };
      return [
        { ...base[0], label: dom(h) ? 'Mediacja przy stole' : base[0].label },
        { ...base[1], run: strona(B) },
        { ...base[2], run: strona(A) },
      ];
    },
    log: (h) => (dom(h) ? { 'do innego osiedla': 'na inną ulicę' } : null),
  },
  {
    id: 'pozar',
    ton: 'ostre',
    when: ['wieczor', 'noc'],
    first: true,
    text: (h) => (dom(h) ? 'Od źle postawionej kozy zajęła się podłoga w kuchni. Dym idzie na cały dom.' : null),
    labels: (h) => (dom(h) ? [null, 'Uciekać do ogrodu'] : []),
    log: (h) =>
      dom(h)
        ? {
            'Spłonął zapas opału z piwnicy.': 'Spłonęło drewno ułożone przy kozie.',
            [`Klatka w budynku ${h.buildingName(0)} spłonęła. Mniej miejsc do mieszkania.`]:
              'Ogień zjadł meble przy kozie. Dym wszedł do każdego pokoju.',
          }
        : null,
  },
  // złodziej z piwnicy to ktoś z mieszkańców bloku; w domu tego wydarzenia nie ma (projekt), także z przyjętymi ludźmi.
  // Z mieszkańcami z osobą przychodzi z głodu: bez uchwały o wspólnym kotle, sprawcą jest mieszkaniec z najniższym
  // nastrojem, a waga to waga z 0.3 razy czynnik z jego nastroju (1 do 45, jedna czwarta od 65; prawdziwy głód
  // mieszkańców w symulacji to osobna decyzja). Rzadziej niż w 0.3: co 48 godzin gry.
  {
    id: 'kradziez',
    ton: 'ostre',
    when: ['noc'],
    first: true,
    gap: 48,
    w: (h, base) => {
      if (dom(h)) return 0;
      if (!h.lokatorzy().length) return h.residents() > 0 ? base : 0;
      const sprawca = sprawcaKradziezy(h);
      return sprawca ? base * czynnikKradziezy(sprawca.needs.mood) : 0;
    },
    make: (h) => {
      const dane = eventDef('kradziez')!.make(h);
      const sprawca = dane && !dom(h) ? sprawcaKradziezy(h) : null;
      return sprawca ? { ...dane, p: osobaKarty(sprawca), lok: sprawca.id } : dane;
    },
    // zdanie z 0.3 („… w budynku X Jedzenie 3.”) nie ma znaku przed liczbą, więc przepisane w obu przypadkach: zapasy
    // z dwukropkiem po budynku
    text: (_h, d) =>
      d.lok
        ? `Ktoś wyniósł nocą zapasy z piwnicy w budynku ${d.b}: jedzenie ${d.loss}. Ślady prowadzą na waszą klatkę, a wszyscy wiedzą, kto od kilku dni je za mało: ${d.p.name}.`
        : `Ktoś wyniósł nocą zapasy z piwnicy w budynku ${d.b}: jedzenie ${d.loss}. Ślady prowadzą do mieszkania na parterze.`,
    // sprawca z klatki: wyrzucony wychodzi bramą, a nowy wybór daje mu jeść z kotła (zamiast sądu i wyrzucenia)
    choices: (h, d, base) => {
      if (!d.lok) return base;
      const p = d.p;
      const jest = !!h.lokator(d.lok);
      const wyrzucenie = base.length - 2;
      return [
        ...base.slice(0, wyrzucenie),
        {
          ...base[wyrzucenie],
          ok: jest,
          run: () => {
            h.wyrzuc(d.lok);
            h.mood(-2, -2);
          },
        },
        {
          label: `Dać ${g(p, 'mu', 'jej')} jeść z kotła`,
          ok: jest && h.res.jedzenie >= 2,
          run: () => {
            h.addRes('jedzenie', -2);
            h.moodOf(d.lok, g(p, 'Najadł się z kotła', 'Najadła się z kotła'), 6, 24);
            h.mood(1, 0);
            h.log(`${p.name} ${g(p, 'zjadł', 'zjadła')} miskę z kotła, pierwszy raz od kilku dni do syta.`);
          },
        },
        base[wyrzucenie + 1],
      ];
    },
  },
  // dwoje losowych z zarządu i „pierwszy od upadku” (upadek trwał 25 lat): wróci z parami z generatora mieszkańców
  { id: 'wesele', when: ['dzien', 'wieczor'], w: () => 0 },
  {
    id: 'odejscie',
    when: ['dzien', 'wieczor'],
    // ostatnia osoba zarządu nie wychodzi kartą: gra, która nie umie się skończyć (wyjście bramą jej nie kasuje)
    w: (h, base) => (h.alive().length < 2 ? 0 : base),
    text: (h, d) => {
      const p = h.spec(d.p);
      return dom(h) && p ? `${p.name} mówi, że na sąsiedniej ulicy jest lepiej i chce się wyprowadzić.` : null;
    },
    // odchodzi z rdzenia bramą (nie znika); w M1 rdzeń nie jest liczony drugi raz wśród mieszkańców
    choices: (h, d, base) => [
      ...base.slice(0, 1),
      {
        ...base[1],
        run: () => {
          const p = h.spec(d.p);
          if (!p) return;
          h.wyrzuc(p.id);
          h.log(`${p.name} ${g(p, 'odszedł', 'odeszła')} ${dom(h) ? 'z ulicy' : 'z osiedla'}.`, true);
        },
      },
    ],
  },
  {
    id: 'obserwacja',
    ton: 'ostre',
    when: ['dzien'],
    // zapowiada szabrowników, których w trybie zombie nie ma
    tryby: ['zwykly'],
    // w 0.3 od piątego dnia; w M1 pierwsza noc jest o szabrownikach, więc już po południu pierwszego
    w: (h) => (h.hour() >= 13 ? 1.2 : 0),
    first: true,
    text: (h) => {
      const t = h.place().tower;
      const from = t ? TOWER[t] : dom(h) ? 'Zza krzaków na końcu ulicy' : 'Z dachu galerii handlowej';
      return `${from} ktoś patrzy przez lornetkę na ${dom(h) ? 'wasz dom' : 'wasz blok'}. Od rana.`;
    },
  },
];
