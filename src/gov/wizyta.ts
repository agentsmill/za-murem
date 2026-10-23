/* Wizyta gościa w zarządzie (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Wizyta”, punkty 1–7):
   zarząd składa gościa z klocków (src/gov/goscie.ts), wysyła symulacji plan (`GovEffects.gosc`), prowadzi wizytę po
   odczycie `GovInput.goscie` i otwiera kartę dopiero wtedy, gdy grupa stoi pod bramą (faza `brama`). Wybory na karcie to
   rozkazy dla prawdziwych pionków (`GovEffects.goscRozkaz`), a haczyk i to, co gość ma, mają prawdziwe skutki.

   Przebieg.
   - Pula: wydarzenie `gosc` (oba tryby, dzień, wieczór i noc, waga 1,2 razy `wagaGoscia` z dolnym progiem 0,2, odstęp 6
     godzin gry) ma wagę 0 bez `GovInput.goscie` (gra bez obcych) i gdy zarząd prowadzi już jakiegoś gościa (jeden naraz).
     Kiedy wypada, `eventTick` (wydarzenia.ts) nie pokazuje karty, tylko woła `planujGoscia`: gość z klocków, plan dla
     symulacji, wpis `GovState.goscie.aktywny`. Tylko ziarno zarządu (`st.rng`), w stałej kolejności: klocki gościa, potem
     wygląd. Plan nie jest kartą, więc nie zjada odstępu między wydarzeniami: zaraz po nim losuje się jeszcze raz wśród
     reszty (gość ma już odstęp i wagę 0), a gdy nic nie pasuje, następna próba za `RETRY` sekund (bez tego w pierwszych
     dziesięciu minutach gry z obcymi brakowało decyzji w co piątej minucie).
   - `goscTick` (co sekundę przy ekranie, z `eventTick`): znajduje wpis wizyty w `GovInput.goscie`, oddaje kartę gościa,
     gdy faza to `brama`, a nic innego nie czeka na decyzję, i kartę „Złapany”, gdy faza to `zlapany`; zamyka kartę,
     której gość odszedł albo zginął (wpis w kronice, wybór nie steruje niczym, bo każdy wybór sprawdza fazę w chwili
     kliknięcia); zapisuje do porannego raportu jedną linię o nocy z gościem: o 5:00, jeśli wciąż śpi u nas, żyje i niczego
     nie wziął, a inaczej linię o skradzionych porcjach (kłamca, który uciekł z łupem) albo o śmierci, żeby raport nie
     przeczył sam sobie; kończy wizytę, gdy symulacja ją skończyła (`poszedl`, `nie_doszedl`, `zginal`) albo zarząd wydał
     ostatni rozkaz (`koniec`).
   - Wybory zależą od tego, czego gość chce (`chce`), co ma (`ma`), pory (brama na kłódkę po 20:00 odbiera „Wpuścić na
     noc”), zapasów (jedzenie, leki), wolnych miejsc (`h.free()`: „Przyjąć” przy mniejszej liczbie miejsc mówi, ilu
     będzie spać na podłodze, jak `uchodzcy`) i trybu (zombie: „Obejrzeć ręce”, „Dobić przez siatkę”). Karta mówi o żywych:
     `widoczny` bierze z `osoby` tylko indeksy z `GovGosc.zywi` (symulacja zachowuje kolejność planu i usuwa zmarłych), więc
     mówiący to pierwsza żywa osoba (tak samo kradnie i jest łapana w symulacji), liczba osób to liczba pionków, a ugryzienie
     idzie za nosicielem; zmarły nosiciel robi z gościa dla karty zdrowego (nie ma co oglądać ani dobijać).
   - Haczyk. Kłamca wpuszczony na noc dostaje rozkaz `klamie` (o 2:00 idzie po jedzenie, patrz src/sim/sim.ts); chory
     wpuszczony albo przyjęty rozdaje rano chorobę (`GovState.later[].sick`); ktoś za nim idzie: w zwykłym trybie szansa
     napadu tej nocy ×1,5 i napad przy bramie (`poscigNocy` w noc.ts), w zombie hałas przy bramie (`GovEffects.halas`,
     `HALAS_PROMIEN`); ugryziony wpuszczony albo przyjęty dostaje rozkaz `ugryziony`, a „Obejrzeć ręce” odsłania
     ugryzienie z pewnością (przy zdrowym kosztuje zaufanie −1, a karta zostaje bez tego wyboru).
   - Co ma: rzecz (broń i amunicja do magazynu przez `fx.arms` i `fx.ammo`, leki do zapasów), wiadomość (wskazówka na
     miejsce: `GovState.wskazowki`, patrz src/gov/wyprawy.ts), ostrzeżenie (`setAlertNight`, podwójna warta tej nocy),
     fach (po „Przyjąć do zarządu”, bo do zarządu wchodzi pierwsza żywa osoba z jej umiejętnościami). Nagroda idzie po nakarmieniu,
     nocy, przyjęciu, wymianie, lekach i przechowaniu, nie po odprawie.
   - Wiadomość dotyczy miejsca z mapy miasta (`celWiadomosci`): `skad.klucz` gościa, o ile da się tam jeszcze iść z karty
     nocy (poza mapą lokalną, do `MAX_OKOLICA_M`, z zapasem), a inaczej najbliższe takie miejsce po stronie gościa albo
     w ogóle (najbliższe miejsca gościa leżą zwykle na mapie lokalnej, więc wskazówka na nie byłaby martwa); bez mapy
     miasta albo bez miejsc cel z TARGETS (najmniej odwiedzany daleki). Wpis w kronice nazywa miejsce.
   - RODO: nazwy miejsc w tekstach gościa pochodzą z `GovInput.okolica`, czyli z odfiltrowanych przez hosta nazw
     (`nazwaDoOkolicy`); ten moduł niczego nie filtruje i niczego nie omija.

   Karty z 0.3 z gościem (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Karty z gościem”:
   `uchodzcy`, `influencer`, `aktywisci`, `dzieci`, `krypto`, w domu `fachowiec`; nakładki w warianty.ts). Karta z
   `GEventDef.gosc` nie otwiera się od razu: `planujKarte` składa z jej danych grupę (`GoscKarty`), planuje wizytę tą samą
   drogą co gość z klocków (`wystaw`: wpis `GovState.goscie.aktywny` z `kartaId` i `dane` karty, `fx.gosc`), a `goscTick`
   otwiera właśnie tę kartę, gdy grupa stoi pod bramą (jedno czekanie na grupę, zamykanie karty, gdy goście odeszli albo
   zginęli, poranna linia o nocy, wszystko wspólne z kartą `gosc`). Dane otwartej karty dostają `gid` (id wizyty): po nim
   tekst i wybory czytają żywą grupę (`GoscHost.grupa`, tak jak karta `gosc` czyta `widoczny`), a skutki idą do pionków
   przez `przyjmijGosci`, `przyjmijDoZarzadu`, `odprawGosci`, `nakarmGosci` i `nocGosci` zamiast dokładać mieszkańców.
   Karta bez `gid` (z zapisu sprzed wizyt albo gdy `gosc` oddało null) gra po staremu.

   Pamięć o znajomych (src/gov/znajomi.ts, docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 4). Każda decyzja
   o gościu zostawia wpis `Znajomy` (mówiący, czyli pierwsza żywa osoba grupy, z jej wyglądem z planu `AktywnyGosc.looks`):
   rozkaz dla grupy (`goscRozkaz`) zapisuje zdarzenie z `JAK_ROZKAZU`, a wybory z innym sensem podają je same (leki,
   wymiana, przechowanie i wysłuchanie to pomoc przez siatkę, `nakarmiony`; wyrzucenie z łupem złapanego to `zlapany`;
   „Zatrzymać do rana” nie ma rozkazu, więc `zapamietajGoscia`). Noc w tej samej wizycie, która kończy się kradzieżą
   (`goscTick`) albo złapaniem, poprawia wpis (`okradl`, `zlapany`) zamiast dokładać drugi. Gość zabity w całości oznacza
   znajomego jako zmarłego. Powrót (`planujPowrot`): wydarzenie `powrot` z puli (`POWROT_EVENT`) planuje wizytę tego samego
   człowieka i wyglądu (`Gosc.wraca`, `skladPowrotu`), a karta `gosc` rozpoznaje go po imieniu i epitecie (`tekstPowrotu`)
   i zapowiada dar; dar przychodzi z wyborem, który nie jest odprawą (worek jedzenia rano przez `later`, wskazówka na
   miejsce jak wiadomość, rodzeństwo do przyjęcia jako druga osoba grupy).

   Zależności: zarząd nie importuje symulacji, host (`makeHost` w wydarzenia.ts) dostaje metody z `goscHost`. */

import type { Dom } from '../content/data.ts';
import type { ActiveEvent } from '../content/events.ts';
import { type Person, g as plec } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { hashString, pick, type Rng, rngOf } from '../core/rng.ts';
import { type Miejsce, naMapieLokalnej } from '../world/miasto.ts';
import {
  AMUNICJA,
  BRON,
  type Gosc,
  type KontekstGoscia,
  type KtoId,
  opisMiejsca,
  PROG_FACHU,
  STRONY,
  skladGoscia,
  skladPowrotu,
  stronaMiejsca,
  tekstGoscia,
  tytulGoscia,
  wagaGoscia,
} from './goscie.ts';
import { KIERUNEK } from './goscie-teksty.ts';
import { placeIn, type Words, type WordsEn, wordsEn, wordsOf } from './miejsce.ts';
import { poscigNocy } from './noc.ts';
import {
  type GChoice,
  type GEventDef,
  type GoscKarty,
  type GovHost,
  type Pora,
  TARGETS,
  targetNameTx,
} from './tresc.ts';
import type { AktywnyGosc, FazaGoscia, GameMode, GoscRozkaz, GovEffects, GovGosc, GovInput, GovState } from './typy.ts';
import { osob, osobyNaPodlodze } from './warianty.ts';
import { addStock, logGov, nightDay, porcje, portions, stockNow } from './wspolne.ts';
import { celZMiejsca, MAX_OKOLICA_M, zostaloZMiejsca } from './wyprawy.ts';
import {
  doPowrotu,
  type JakId,
  obecniWOsiedlu,
  poprawJak,
  tekstPowrotu,
  tytulPowrotu,
  ZAPAS_ODMOWY,
  type Znajomy,
  zapamietaj,
} from './znajomi.ts';

// ---------------------------------------------------------------- stałe

/** waga wydarzenia `gosc` przy zerowej liczbie napaści na obcych; mnoży ją `wagaGoscia` (dolny próg `MIN_WAGA_GOSCIA`) */
export const WAGA_GOSCIA = 1.2;
/** goście nie znikają całkiem po wielu napaściach na obcych: nie mniej niż tyle z `wagaGoscia` */
export const MIN_WAGA_GOSCIA = 0.2;
/** odstęp między wizytami w godzinach gry */
export const GOSC_GAP = 6;
/** promień hałasu przy bramie (m), gdy w trybie zombie ktoś szedł za wpuszczonym gościem */
export const HALAS_PROMIEN = 15;
/** tyle sekund przy ekranie symulacja ma na pokazanie wpisu wizyty w odczycie; potem plan przepada */
export const GOSC_ZWLOKA = 30;

/** fazy końcowe wizyty w symulacji */
const KONCOWE: ReadonlySet<FazaGoscia> = new Set(['poszedl', 'nie_doszedl', 'zginal']);
/** zdarzenie, które zapisuje w pamięci o znajomych dany rozkaz (noc zapisuje się od razu jako `nocleg`; kradzież albo złapanie
    w tej samej wizycie poprawiają wpis); rozkazy bez wpisu (`klamie`, `ugryziony`, `dobij`) są częścią innej decyzji */
const JAK_ROZKAZU: Partial<Record<GoscRozkaz, JakId>> = {
  jedzenie: 'nakarmiony',
  noc: 'nocleg',
  zostan: 'przyjety',
  zarzad: 'przyjety',
  odejdz: 'odprawiony',
  puscic: 'zlapany',
};
/** rozkazy, po których wizyta przestaje być sprawą zarządu */
const KONCZACE: ReadonlySet<GoscRozkaz> = new Set(['odejdz', 'jedzenie', 'zostan', 'zarzad', 'puscic']);

/** dane karty gościa i karty „Złapany”: id gościa (reszta w `GovState.goscie.aktywny`) */
export interface DaneGoscia {
  id: string;
}

/** Id wizyty, do której należy otwarta karta: karty `gosc` i `zlapany` niosą je w `d.id`, karty z 0.3 z gościem w `d.gid`.
    null: to nie jest karta wizyty (zwykłe wydarzenie, także karta z 0.3 z zapisu sprzed wizyt, bez `gid`). */
export function wizytaKarty(ev: ActiveEvent | null): string | null {
  if (!ev) return null;
  const d = ev.d as { id?: unknown; gid?: unknown } | null | undefined;
  const id = ev.id === 'gosc' || ev.id === 'zlapany' ? d?.id : d?.gid;
  return typeof id === 'string' ? id : null;
}

/** wizyta zaplanowana przez kartę, która nie doszła do bramy: karta z `once` ma wrócić, więc ewidencja jej nie liczy */
const zwolnijKarte = (st: GovState, a: AktywnyGosc): void => {
  if (a.kartaId && !a.karta) delete st.ev.done[a.kartaId];
};

// ---------------------------------------------------------------- host

/** Wizyta gościa widziana z karty: gość z klocków (kopia), jego wpis w odczycie symulacji (kopia; null, gdy symulacja
    jeszcze go nie pokazała) i co pokazało obejrzenie rąk (zombie). */
export interface WidokGoscia {
  gosc: Gosc;
  wpis: GovGosc | null;
  obejrzano: 'ugryziony' | 'czysty' | null;
}

/** Metody hosta zarządu dla gości (część `GovHost`): odczyt wizyty, rozkazy dla pionków, nagrody i haczyki. */
export interface GoscHost {
  /** tryb gry zarządu */
  tryb(): GameMode;
  /** odczyt gości z symulacji (`GovInput.goscie`); null: gra bez obcych, nikt nie przychodzi */
  goscie(): readonly GovGosc[] | null;
  /** napaści zarządu na obcych (handlarza, wędrowca) od początku gry: odbierają szansę na gościa */
  napady(): number;
  /** zarząd prowadzi wizytę gościa (jeden naraz) */
  goscAktywny(): boolean;
  /** wizyta o tym id; null: nie ma takiej (skończona albo nigdy jej nie było) */
  gosc(id: string): WidokGoscia | null;
  /** rozkaz dla całej grupy (`GovEffects.goscRozkaz`); odejście, jedzenie, przyjęcie i `puscic` kończą wizytę. Zapisuje też
      znajomego (`JAK_ROZKAZU`); `jak` podaje inne zdarzenie, gdy rozkaz znaczy tu coś innego (odejście po lekach to pomoc,
      odejście złapanego z łupem to `zlapany`) */
  goscRozkaz(id: string, co: GoscRozkaz, jak?: JakId): void;
  /** zapisuje znajomego bez rozkazu (złapany zatrzymany do rana) */
  zapamietajGoscia(id: string, jak: JakId): void;
  /** wpis znajomego o tym id (kopia); null: nie ma takiego */
  znajomy(id: string): Znajomy | null;
  /** czy ktoś może teraz wrócić jako gość (`doPowrotu` w osiedlu bez obecnych); waga wydarzenia `powrot` */
  doPowrotu(): boolean;
  /** broń i amunicja z rzeczy gościa do magazynu (`fx.arms`, `fx.ammo`) */
  dajBron(id: string): void;
  dajAmunicje(k: 'naboje' | 'loftki' | 'belty', n: number): void;
  /** hałas na kafelku w promieniu r metrów (`fx.halas`) */
  halas(tile: number, r: number): void;
  /** pościg za gościem wpuszczonym na noc w zwykłym trybie: szansa napadu ×1,5 i napad przy bramie */
  poscig(): void;
  /** wiadomość gościa: wskazówka na miejsce (`GovState.wskazowki`); oddaje nazwę miejsca do zdania */
  wskazowka(g: Gosc): Tx;
  /** choroba rano (`GovState.later[].sick`), z linią do raportu */
  chorobaRano(line: Tx): void;
  /** zapamiętuje, co pokazało obejrzenie rąk */
  obejrzano(v: 'ugryziony' | 'czysty'): void;
  /** Grupa wizyty o tym id tak, jak widzi ją karta: tylko żywi (kopie osób, mówiący pierwszy) i czy stoją pod bramą
      (faza `brama`). Dla kart z 0.3 z gościem, które czytają z niej liczbę osób i mówiącego; null: nie ma takiej wizyty. */
  grupa(id: string): GrupaKarty | null;
  /** Rozkazy dla grupy prowadzonej wizyty (jedna naraz; bez wizyty albo po ostatnim rozkazie nic nie robią). Przyjęcie
      i odprawa kończą wizytę, `nocGosci` nie (rano 6–8 goście wychodzą, a `goscTick` pilnuje reszty).
      Cała grupa zostaje w osiedlu jako mieszkańcy (`zostan`). */
  przyjmijGosci(): void;
  /** mówiący (pierwsza żywa osoba grupy) idzie do zarządu, reszta zostaje jak przy `przyjmijGosci` (`zarzad`) */
  przyjmijDoZarzadu(): void;
  /** grupa odchodzi tam, skąd przyszła (`odejdz`) */
  odprawGosci(): void;
  /** grupa dostaje porcję przez siatkę i odchodzi (`jedzenie`); Jedzenie −n z zapasów */
  nakarmGosci(n: number): void;
  /** grupa wchodzi na noc bramą, rano odchodzi (`noc`) */
  nocGosci(): void;
}

/** Grupa wizyty dla karty z gościem: żywi w kolejności symulacji (mówiący pierwszy) i czy stoją pod bramą. */
export interface GrupaKarty {
  osoby: Person[];
  pod: boolean;
}

const kopia = <T>(v: T): T => structuredClone(v);

/** Metody hosta dla gości na stanie zarządu, wejściu i skutkach bieżącego wywołania. */
export function goscHost(st: GovState, i: GovInput, fx: GovEffects): GoscHost {
  const nd = nightDay(i);
  const aktywny = (id: string) => {
    const a = st.goscie?.aktywny;
    return a && a.gosc.id === id ? a : null;
  };
  /** wizyta, którą zarząd prowadzi i której nie zamknął ostatnim rozkazem */
  const prowadzona = () => {
    const a = st.goscie?.aktywny;
    return a && !a.koniec ? a : null;
  };
  /** wygląd osoby k z planu wizyty; zapis sprzed wyglądów: skrót z jej id (4–15 jak w planie) */
  const lookOsoby = (a: AktywnyGosc, k: number): number =>
    a.looks?.[k] ?? 4 + (Number.parseInt(hashString(a.gosc.osoby[k]?.id ?? a.gosc.id), 16) % 12);
  /** Zapisuje w pamięci o znajomych mówiącego wizyty: pierwszą żywą osobę grupy (tę, którą nazywa karta), z jej wyglądem.
      Ta sama wizyta zapisuje się raz, kolejna decyzja (złapany po nocy) poprawia wpis. Zginęli wszyscy: nikogo. */
  const zapisz = (a: AktywnyGosc, jak: JakId): void => {
    const w = i.goscie?.find((x) => x.id === a.gosc.id) ?? null;
    if (w?.faza === 'zginal') return;
    const zywi = w ? w.zywi.filter((k) => k >= 0 && k < a.gosc.osoby.length) : [];
    const k = zywi.length ? zywi[0] : 0;
    const o = a.gosc.osoby[k];
    if (!o) return;
    const odmowa = jak === 'odprawiony' && a.gosc.chce === 'jedzenie' && stockNow(i, fx).supplies > ZAPAS_ODMOWY;
    const z = zapamietaj(
      st,
      {
        // powracający mówiący to znajomy z wpisu; gdyby zginął, a zostało rodzeństwo, to jego decyzja jest nową osobą
        id: k === 0 && a.gosc.wraca ? a.gosc.wraca : o.id,
        osoba: { first: o.first, name: o.name, f: o.f, age: o.age },
        prof: o.prof,
        look: lookOsoby(a, k),
        kto: a.gosc.kto,
        jak,
        dzien: i.day,
      },
      i.day,
      { wizyta: a.gosc.id, odmowa },
    );
    a.znajomy = z.id;
  };
  const rozkaz = (id: string, co: GoscRozkaz, jak?: JakId): void => {
    (fx.goscRozkaz ??= []).push({ id, co });
    const a = aktywny(id);
    if (!a) return;
    if (co === 'noc') a.noc = true;
    if (KONCZACE.has(co)) a.koniec = true;
    const j = jak ?? JAK_ROZKAZU[co];
    if (j) zapisz(a, j);
  };
  const rozkazWizyty = (co: GoscRozkaz): void => {
    const a = prowadzona();
    if (a) rozkaz(a.gosc.id, co);
  };
  return {
    tryb: () => st.mode ?? 'zwykly',
    goscie: () => i.goscie ?? null,
    napady: () => i.napady?.length ?? 0,
    goscAktywny: () => !!st.goscie?.aktywny && !st.goscie.aktywny.koniec,
    gosc: (id) => {
      const a = aktywny(id);
      if (!a) return null;
      const w = i.goscie?.find((x) => x.id === id);
      return { gosc: kopia(a.gosc), wpis: w ? kopia(w) : null, obejrzano: a.obejrzano ?? null };
    },
    goscRozkaz: rozkaz,
    zapamietajGoscia: (id, jak) => {
      const a = aktywny(id);
      if (a) zapisz(a, jak);
    },
    znajomy: (id) => {
      const z = st.znajomi?.find((x) => x.id === id);
      return z ? kopia(z) : null;
    },
    doPowrotu: () => !!doPowrotu(st, i.day, st.mode ?? 'zwykly', obecniWOsiedlu(i)),
    dajBron: (id) => {
      (fx.arms ??= []).push(id);
    },
    dajAmunicje: (k, n) => {
      fx.ammo ??= {};
      fx.ammo[k] = (fx.ammo[k] ?? 0) + n;
    },
    halas: (tile, r) => {
      fx.halas = { tile, r };
    },
    poscig: () => poscigNocy(st, i, fx),
    wskazowka: (g) => {
      const c = celWiadomosci(st, i, g);
      (st.wskazowki ??= {})[c.klucz] = { dzien: i.day };
      return c.nazwa;
    },
    chorobaRano: (line) => {
      st.later.push({ day: nd, stock: {}, line, sick: 1 });
    },
    obejrzano: (v) => {
      const a = st.goscie?.aktywny;
      if (a) a.obejrzano = v;
    },
    grupa: (id) => {
      const a = aktywny(id);
      if (!a) return null;
      const w = i.goscie?.find((x) => x.id === id) ?? null;
      return { osoby: widoczny(a.gosc, w).osoby.map(kopiaOsoby), pod: w?.faza === 'brama' };
    },
    przyjmijGosci: () => rozkazWizyty('zostan'),
    przyjmijDoZarzadu: () => rozkazWizyty('zarzad'),
    odprawGosci: () => rozkazWizyty('odejdz'),
    nakarmGosci: (n) => {
      if (!prowadzona()) return;
      addStock(i, fx, 'supplies', -n);
      rozkazWizyty('jedzenie');
    },
    nocGosci: () => rozkazWizyty('noc'),
  };
}

// ---------------------------------------------------------------- wiadomość: dokąd wskazówka

/** Miejsce z okolicy, do którego karta nocy może wysłać wyprawę: poza mapą lokalną, do `MAX_OKOLICA_M`, z czymś jeszcze
    w zapasie (tyle samo wymagań co `wybierzCeleNocy` w wyprawy.ts). */
const dostepne = (st: GovState, m: Miejsce): boolean =>
  !naMapieLokalnej(m) && m.odl <= MAX_OKOLICA_M && zostaloZMiejsca(st, celZMiejsca(m)) > 0;

/** Miejsce, o którym gość z wiadomością coś wie, i jego opis w zdaniu po „o miejscu”. Z mapą miasta (`GovState.miasto`
    i okolica w wejściu): `skad.klucz` gościa, jeśli da się tam jeszcze pójść z karty nocy; inaczej najbliższe takie miejsce
    po stronie, z której gość przyszedł (`stronaMiejsca`), a gdy po tej stronie nic nie ma, najbliższe w ogóle (najbliższe
    miejsca gościa leżą zwykle na mapie lokalnej, dokąd wypraw się nie wysyła, więc wskazówka byłaby martwa). Bez mapy
    miasta albo bez takich miejsc cel z TARGETS: najmniej odwiedzany daleki (remis: pierwszy na liście). Remisy odległości
    rozstrzyga klucz miejsca. */
export function celWiadomosci(st: GovState, i: GovInput, g: Gosc): { klucz: string; nazwa: Tx } {
  const okolica = st.miasto ? (i.okolica ?? []) : [];
  const wlasne = g.skad.klucz ? okolica.find((x) => x.klucz === g.skad.klucz) : undefined;
  if (wlasne && dostepne(st, wlasne)) return { klucz: wlasne.klucz, nazwa: opisMiejsca(wlasne) };
  const bliskie = (a: Miejsce, b: Miejsce) => a.odl - b.odl || (a.klucz < b.klucz ? -1 : 1);
  const mozliwe = okolica.filter((m) => dostepne(st, m)).sort(bliskie);
  const m = mozliwe.find((x) => stronaMiejsca(x.x, x.y) === g.skad.strona) ?? mozliwe[0];
  if (m) return { klucz: m.klucz, nazwa: opisMiejsca(m) };
  const t = TARGETS.filter((x) => x.range === 'daleko').sort(
    (a, b) => (st.visits[a.id] ?? 0) - (st.visits[b.id] ?? 0),
  )[0];
  return { klucz: t.id, nazwa: targetNameTx(t, placeIn(i)) };
}

// ---------------------------------------------------------------- plan

const kopiaOsoby = (p: Person): Person => structuredClone(p);

/** dziedziny, w których zarząd (osoby i lokatorzy z osobą) ma umiejętność od `PROG_FACHU`: fach gościa kusi mniej */
function znaneDziedziny(i: GovInput): Set<Dom> {
  const znane = new Set<Dom>();
  const ludzie: { skills: Partial<Record<Dom, number>> }[] = [...i.people, ...(i.lokatorzy ?? [])];
  for (const p of ludzie)
    for (const [d, v] of Object.entries(p.skills) as [Dom, number][]) if (v >= PROG_FACHU) znane.add(d);
  return znane;
}

/** Zapisuje gościa jako aktywnego i oddaje symulacji plan (`fx.gosc`: osoby z id `g<n>p<i>`, wygląd każdej, strona
    wejścia, ugryziona osoba). Wygląd: jedna liczba z ziarna, kolejne osoby co 5 (5 i 12 są względnie pierwsze, więc w grupie
    żaden się nie powtórzy). Wspólne dla gościa z klocków i karty z gościem; `karta` to id karty z 0.3 i jej dane. */
function wystaw(
  st: GovState,
  i: GovInput,
  fx: GovEffects,
  rng: Rng,
  g: Gosc,
  karta?: { id: string; dane: unknown },
  look0?: number,
): void {
  const s = (st.goscie ??= { n: 0, czytane: 0 });
  // powrót znajomego: pierwsza osoba ma wygląd sprzed lat (bez losowania), reszta co 5 jak zawsze
  const start = look0 !== undefined ? Math.min(15, Math.max(4, look0)) - 4 : Math.floor(rng() * 12);
  const looks = g.osoby.map((_, k) => 4 + ((start + 5 * k) % 12));
  s.aktywny = {
    gosc: g,
    od: i.screen,
    karta: false,
    looks,
    ...(karta ? { kartaId: karta.id, dane: karta.dane } : {}),
  };
  fx.gosc = {
    id: g.id,
    osoby: g.osoby.map(kopiaOsoby),
    looks,
    strona: g.skad.strona,
    ...(g.ugryziony !== undefined ? { ugryziony: g.ugryziony } : {}),
  };
}

/** archetyp gościa dla roli karty z 0.3 (reszta archetypów to już `KtoId`) */
const KTO_KARTY: Record<Exclude<GoscKarty['kto'], KtoId>, KtoId> = {
  sasiad: 'wedrowiec',
  aktywisci: 'wedrowiec',
  influencer: 'wedrowiec',
  dzieci: 'dziecko',
};

/**
 * Planuje wizytę dla karty z 0.3 z gościem (`GEventDef.gosc`): grupa z danych karty (`def.gosc`), strona wejścia
 * z karty albo z ziarna zarządu, plan dla symulacji i wpis aktywnej wizyty z id karty i jej danymi, żeby `goscTick`
 * otworzył właśnie tę kartę, gdy grupa stanie pod bramą. Gość z takiej karty chce tylko tego, co karta (bez haczyka i bez
 * rzeczy), więc klocki mają wartości zerowe. false (nic nie zmienione): karta bez gościa tym razem (`gosc` oddało null),
 * gra bez obcych albo inna wizyta w toku; wtedy karta pokazuje się od razu, po staremu.
 */
export function planujKarte(
  st: GovState,
  i: GovInput,
  fx: GovEffects,
  def: GEventDef,
  h: GovHost,
  d: unknown,
): boolean {
  if (!def.gosc || !i.goscie || h.goscAktywny()) return false;
  const k = def.gosc(h, d);
  if (!k || k.osoby.length === 0) return false;
  const s = (st.goscie ??= { n: 0, czytane: 0 });
  s.n++;
  const id = `g${s.n}`;
  const rng = rngOf(st.rng);
  const strona = k.strona ?? pick(STRONY, rng);
  const osoby = k.osoby.slice(0, 12).map((p, j): Person => ({ ...kopiaOsoby(p), id: `${id}p${j}`, home: -1 }));
  const kto: KtoId = Object.hasOwn(KTO_KARTY, k.kto) ? KTO_KARTY[k.kto as keyof typeof KTO_KARTY] : (k.kto as KtoId);
  const g: Gosc = {
    id,
    osoby,
    kto,
    chce: 'nocleg',
    ma: 'nic',
    haczyk: 'prawda',
    skad: { strona, nazwa: KIERUNEK[strona] },
  };
  wystaw(st, i, fx, rng, g, { id: def.id, dane: structuredClone(d) });
  return true;
}

/** Planuje wizytę: składa gościa z klocków (ziarno zarządu), zapisuje go jako aktywnego i oddaje symulacji plan
    (`fx.gosc`: osoby z id `g<n>p<i>`, wygląd każdej, strona wejścia, ugryziona osoba). Okolica idzie z wejścia bez zmian
    (nazwy już przefiltrowane przez hosta). Karty nie pokazuje: ta przychodzi, gdy grupa stoi pod bramą (`goscTick`). */
export function planujGoscia(st: GovState, i: GovInput, fx: GovEffects, pora: Pora): Gosc {
  const s = (st.goscie ??= { n: 0, czytane: 0 });
  s.n++;
  const rng = rngOf(st.rng);
  const ctx: KontekstGoscia = {
    mode: st.mode ?? 'zwykly',
    pora,
    season: i.season,
    zapasy: i.stock.supplies,
    okolica: i.okolica ?? [],
    znane: znaneDziedziny(i),
    napady: i.napady?.length ?? 0,
    dom: placeIn(i).kind === 'dom',
  };
  const zajete = new Set([...i.people.map((p) => p.first), ...(i.lokatorzy ?? []).map((l) => l.first)]);
  const g = skladGoscia(rng, s.n, ctx, zajete);
  wystaw(st, i, fx, rng, g);
  return g;
}

/** Planuje powrót znajomego (`doPowrotu`): gość z klocków powrotu (`skladPowrotu`: ten sam człowiek, wygląd i archetyp, dar
    do wyboru), zapisany jako aktywny, plan dla symulacji z wyglądem sprzed lat i znacznik powrotu na wpisie (`Znajomy.wrocil`,
    najwyżej jeden powrót na 4 doby). null (nic nie zmienione): gra bez obcych albo nikt nie może wrócić. Losuje tylko z ziarna
    zarządu; karty nie pokazuje, ta przychodzi pod bramą jak dla każdego gościa. */
export function planujPowrot(st: GovState, i: GovInput, fx: GovEffects): Gosc | null {
  // gra bez obcych albo trwa inna wizyta (jedna naraz): nic się nie zmienia
  if (!i.goscie || (st.goscie?.aktywny && !st.goscie.aktywny.koniec)) return null;
  const mode = st.mode ?? 'zwykly';
  const z = doPowrotu(st, i.day, mode, obecniWOsiedlu(i));
  if (!z) return null;
  const s = (st.goscie ??= { n: 0, czytane: 0 });
  s.n++;
  const rng = rngOf(st.rng);
  const zajete = new Set([...i.people.map((p) => p.first), ...(i.lokatorzy ?? []).map((l) => l.first)]);
  const g = skladPowrotu(rng, s.n, z, { mode, okolica: i.okolica ?? [], dom: placeIn(i).kind === 'dom' }, zajete);
  z.wrocil = i.day;
  wystaw(st, i, fx, rng, g, undefined, z.look);
  return g;
}

// ---------------------------------------------------------------- prowadzenie wizyty

/** wpis w kronice o gościu, który zniknął sprzed bramy, zanim ktokolwiek zdecydował (karta była otwarta); słowa miejsca
    (brama albo furtka) według siedziby */
function znikniecie(g: Gosc, faza: FazaGoscia, s: Words, e: WordsEn): Tx {
  const p = g.osoby[0];
  const sam = g.osoby.length === 1;
  if (faza === 'zginal')
    return sam
      ? tx(
          `${p.name} ${plec(p, 'zginął', 'zginęła')} ${s.brama.pod}, zanim ktokolwiek zdecydował.`,
          `${p.name} died at ${e.brama} before anyone had decided.`,
        )
      : tx(
          `Ludzie spod ${s.brama.d} nie żyją. Nikt nie zdążył zdecydować.`,
          `The people at ${e.brama} are dead. Nobody got the chance to decide.`,
        );
  return sam
    ? tx(
        `${p.name} ${plec(p, 'odszedł', 'odeszła')} spod ${s.brama.d}, zanim ktokolwiek zdecydował.`,
        `${p.name} left ${e.brama} before anyone had decided.`,
      )
    : tx(
        `Ludzie spod ${s.brama.d} odeszli, zanim ktokolwiek zdecydował.`,
        `The people at ${e.brama} left before anyone had decided.`,
      );
}

/** wpis o planie, który przepadł: grupa nigdy nie stanęła pod bramą, więc nikt jej nie widział (bez imion) */
function planPrzepadl(faza: FazaGoscia, s: Words, e: WordsEn): Tx {
  if (faza === 'zginal')
    return tx(
      `Ktoś szedł do ${s.brama.d} i nie dotarł: coś go po drodze dopadło.`,
      `Somebody was coming to ${e.brama} and never made it: something got to them on the way.`,
    );
  if (faza === 'nie_doszedl')
    return tx(
      `Ktoś szedł do ${s.brama.d}, ale nie doszedł. Ślad się urwał.`,
      `Somebody was walking up to ${e.brama}, but never arrived. The trail ran cold.`,
    );
  return tx(
    `Ktoś szedł do ${s.brama.d}, ale zawrócił, zanim ktokolwiek go zobaczył.`,
    `Somebody was coming up to ${e.brama}, but turned back before anyone saw them.`,
  );
}

/** gość z nocy, który nie dożył rana (zwłoki przy ogniu, w siatce albo przy drodze): wpis w kronice */
function nocnyZgon(g: Gosc): Tx {
  const p = g.osoby[0];
  return g.osoby.length === 1
    ? tx(`${p.name} nie ${plec(p, 'przeżył', 'przeżyła')} nocy u was.`, `${p.name} did not survive the night with you.`)
    : tx('Goście z nocy nie przeżyli.', 'The guests of the night did not survive.');
}

/**
 * Prowadzi wizytę zarządu co sekundę przy ekranie (z `eventTick`). Bez `GovInput.goscie` (gra bez obcych) i bez aktywnej
 * wizyty nie robi nic. Oddaje kartę do pokazania (`gosc` pod bramą, `zlapany`), gdy `zajete` jest fałszem (nic innego nie
 * czeka na decyzję); flaga karty ustawia się dopiero wtedy, więc zajęty zarząd dostaje ją przy najbliższej okazji.
 */
export function goscTick(st: GovState, i: GovInput, fx: GovEffects, zajete: boolean): ActiveEvent | null {
  const s = st.goscie;
  const a = s?.aktywny;
  const ev = wizytaKarty(st.ev.active) !== null ? st.ev.active : null;
  if (!s || !a || a.koniec || !i.goscie) {
    // wizyta skończona (rozkaz, który ją zamyka), gra bez obcych albo karta z zapisu bez wizyty: karty już nic nie robią
    if (s && a && (a.koniec || !i.goscie)) {
      // plan, który nie doszedł do bramy (gra bez obcych, zapis wczytany bez nich), zwalnia kartę `once`
      zwolnijKarte(st, a);
      delete s.aktywny;
    }
    if (ev) st.ev.active = null;
    return null;
  }
  // wizyty zakończone i rozliczone z początku listy
  while (s.czytane < i.goscie.length) {
    const w = i.goscie[s.czytane];
    if (!KONCOWE.has(w.faza) || w.id === a.gosc.id) break;
    s.czytane++;
  }
  const e = i.goscie.find((x) => x.id === a.gosc.id);
  if (!e) {
    // symulacja pokaże wpis w następnym kroku; jeśli nie pokaże, plan przepada
    if (i.screen - a.od > GOSC_ZWLOKA) {
      if (ev) st.ev.active = null;
      zwolnijKarte(st, a);
      delete s.aktywny;
    }
    return null;
  }
  const g = a.gosc;
  // kłamca uciekł z łupem (albo wyrzucono go z łupem): rano w raporcie liczba zabranych porcji
  if (a.noc && !a.kradl && e.ukradl > 0 && (e.faza === 'odchodzi' || KONCOWE.has(e.faza))) {
    a.kradl = true;
    // noc, która skończyła się kradzieżą, to `okradl`, nie `nocleg` (złapany ma już swoje `zlapany` i go nie ruszamy)
    if (a.znajomy && st.znajomi?.find((x) => x.id === a.znajomy)?.jak === 'nocleg')
      poprawJak(st, a.znajomy, g.id, 'okradl', i.day);
    const line = tx(
      `Rano nie było śladu po gościu, a z zapasów zniknęły ${porcje(e.ukradl)} jedzenia.`,
      `By morning there was no sign of the guest, and ${portions(e.ukradl)} of food were gone from the stores.`,
    );
    st.later.push({ day: nightDay(i), stock: {}, line });
    logGov(st, i, line, true, fx);
  }
  // noc u nas: linia do porannego raportu o 5:00, jeśli gość wciąż śpi u nas, żyje i niczego nie wziął (kto uciekł z łupem,
  // ma linię o kradzieży, kto zginął, o śmierci), żeby raport nie przeczył sam sobie
  if (
    a.noc &&
    !a.liniaNocy &&
    !a.kradl &&
    i.hour === 5 &&
    e.faza === 'w_srodku' &&
    e.pawns.length > 0 &&
    e.ukradl === 0
  ) {
    a.liniaNocy = true;
    st.later.push({ day: nightDay(i), stock: {}, line: nocGoscia(widoczny(g, e)) });
  }
  const slowa = wordsOf(placeIn(i));
  const slowaEn = wordsEn(placeIn(i));
  if (KONCOWE.has(e.faza)) {
    // zginęli wszyscy: znajomy nie wróci
    if (e.faza === 'zginal' && a.znajomy) {
      const x = st.znajomi?.find((y) => y.id === a.znajomy);
      if (x) x.zmarl = true;
    }
    if (ev) logGov(st, i, znikniecie(g, e.faza, slowa, slowaEn), false, fx);
    else if (!a.karta) logGov(st, i, planPrzepadl(e.faza, slowa, slowaEn), false, fx);
    else if (a.noc && e.faza === 'zginal') {
      const zgon = nocnyZgon(g);
      logGov(st, i, zgon, true, fx);
      // do raportu nocy tylko, gdy ta jeszcze trwa (od 20:00 do 6:00): rano 6–8 gość wychodzi, a raport już poszedł, a kto
      // zginął po południu za bramą, nie trafi do raportu następnej nocy jako „nie przeżył nocy u was”
      if (i.hour >= 20 || i.hour < 6) st.later.push({ day: nightDay(i), stock: {}, line: zgon });
    }
    if (ev) st.ev.active = null;
    zwolnijKarte(st, a);
    delete s.aktywny;
    while (s.czytane < i.goscie.length && KONCOWE.has(i.goscie[s.czytane].faza)) s.czytane++;
    return null;
  }
  // karta otwarta, a gość nie stoi już tam, gdzie karta go zakłada (poszedł, zginął, dał się złapać gdzie indziej)
  if (ev && wizytaKarty(ev) === g.id) {
    if (e.faza !== (ev.id === 'zlapany' ? 'zlapany' : 'brama')) {
      logGov(st, i, znikniecie(g, e.faza === 'zginal' ? 'zginal' : 'poszedl', slowa, slowaEn), false, fx);
      st.ev.active = null;
    }
  }
  if (st.ev.active || zajete) return null;
  if (e.faza === 'brama' && !a.karta) {
    a.karta = true;
    // karta z 0.3 z gościem (zaplanowana przez `planujKarte`) dostaje swoje dane z `gid`, reszta kartę `gosc`
    if (a.kartaId) return { id: a.kartaId, d: { ...(a.dane as object), gid: g.id } };
    return { id: 'gosc', d: { id: g.id } };
  }
  if (e.faza === 'zlapany' && !a.zl) {
    a.zl = true;
    return { id: 'zlapany', d: { id: g.id } };
  }
  return null;
}

// ---------------------------------------------------------------- teksty kart

const mowiacy = (g: Gosc): Person => g.osoby[0];
const wielu = (g: Gosc): boolean => g.osoby.length > 1;
/** zaimek w bierniku po angielsku: him, her, them */
const goEn = (g: Gosc): string => (wielu(g) ? 'them' : mowiacy(g).f ? 'her' : 'him');
const ludzieEn = (n: number): string => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Gość tak, jak widzi go karta: tylko żywi członkowie grupy, w kolejności symulacji (`GovGosc.zywi`: indeksy w `osoby`),
    więc mówiący to pierwsza żywa osoba, a liczba osób to liczba pionków pod bramą. Ugryzienie przechodzi na nowy indeks
    nosiciela; gdy nosiciel nie żyje, gość jest dla karty zdrowy (ani oglądanie rąk, ani tekst nie mówią o zwłokach), a ktoś
    z ugryzionym bliskim jest zwykłym wędrowcem, który nie prosi już o dobicie. Wszyscy żywi albo wpis bez żywych (grupa
    skończona): bez zmian. */
function widoczny(g: Gosc, w: GovGosc | null): Gosc {
  if (!w || w.zywi.length === 0) return g;
  const idx = w.zywi.filter((k) => k >= 0 && k < g.osoby.length);
  if (idx.length === 0 || (idx.length === g.osoby.length && idx.every((k, j) => k === j))) return g;
  const out: Gosc = { ...g, osoby: idx.map((k) => g.osoby[k]) };
  delete out.ugryziony;
  if (g.ugryziony === undefined) return out;
  const j = idx.indexOf(g.ugryziony);
  if (j >= 0) {
    out.ugryziony = j;
    return out;
  }
  if (g.haczyk === 'ugryziony') out.haczyk = 'prawda';
  if (g.kto === 'z_ugryzionym') out.kto = 'wedrowiec';
  if (g.chce === 'dobic') out.chce = 'nocleg';
  return out;
}

/** kto w zdaniu o grupie: samo imię i nazwisko albo mówiący z resztą i liczbą osób */
function kto(g: Gosc): Tx {
  const p = mowiacy(g);
  const n = g.osoby.length;
  return n === 1
    ? tx(p.name, p.name)
    : tx(`${p.name} i reszta (${n} ${osob(n)})`, `${p.name} and the others (${ludzieEn(n)})`);
}

/** lista rzeczy gościa do zdania o nagrodzie */
function rzeczy(r: NonNullable<Gosc['rzecz']>): Tx {
  const pl: string[] = [];
  const en: string[] = [];
  if (r.arms) {
    const b = Object.hasOwn(BRON, r.arms) ? BRON[r.arms] : null;
    pl.push(b?.bier ?? 'broń');
    en.push(b?.en ?? 'a weapon');
  }
  for (const typ of ['naboje', 'loftki', 'belty'] as const) {
    const n = r.ammo?.[typ];
    if (n) {
      pl.push(`${AMUNICJA[typ].pl} (${n})`);
      en.push(`${AMUNICJA[typ].en} (${n})`);
    }
  }
  if (r.meds) {
    pl.push(`leki (${r.meds})`);
    en.push(`meds (${r.meds})`);
  }
  return tx(pl.join(', '), en.join(', '));
}

/** Nagroda za to, co gość ma (nie za odprawę): rzecz do magazynu i zapasów, wiadomość jako wskazówka na miejsce,
    ostrzeżenie jako czujniejsza warta tej nocy; powracający znajomy dokłada jeszcze worek jedzenia (rano, w raporcie).
    Fach działa przez przyjęcie do zarządu, nie tutaj. */
function nagroda(h: GovHost, g: Gosc): void {
  if (g.porcje !== undefined) {
    const p = mowiacy(g);
    const line = tx(
      `${p.name} zostawi${plec(p, 'ł', 'ła')} worek z jedzeniem: ${porcje(g.porcje)}.`,
      `${p.name} left a sack of food: ${portions(g.porcje)}.`,
    );
    h.later({ supplies: g.porcje }, line);
    h.log(line);
  }
  if (g.ma === 'rzecz' && g.rzecz) {
    if (g.rzecz.arms) h.dajBron(g.rzecz.arms);
    for (const typ of ['naboje', 'loftki', 'belty'] as const) {
      const n = g.rzecz.ammo?.[typ];
      if (n) h.dajAmunicje(typ, n);
    }
    if (g.rzecz.meds) h.addRes('leki', g.rzecz.meds);
    const r = rzeczy(g.rzecz);
    h.log(tx(`Dostaliście od gościa: ${r.pl}.`, `You got from the visitor: ${r.en}.`));
  } else if (g.ma === 'wiadomosc') {
    const m = h.wskazowka(g);
    h.log(
      tx(
        `Wieść o miejscu: ${m.pl}. Nikt tam nie zaglądał od miesięcy: następna wyprawa będzie bezpieczniejsza i da więcej.`,
        `News of a place: ${m.en}. Nobody has looked in there for months: the next run will be safer and bring back more.`,
      ),
      true,
    );
  } else if (g.ma === 'ostrzezenie') {
    h.setAlertNight();
    h.log(
      tx(
        'Gość ostrzegł: tej nocy ktoś może się kręcić przy siatce. Warta będzie czujniejsza.',
        'The visitor warned of someone who may be prowling by the fence tonight. The watch will be sharper.',
      ),
    );
  }
}

/** linia do porannego raportu o nocy z gościem */
function nocGoscia(g: Gosc): Tx {
  const p = mowiacy(g);
  return wielu(g)
    ? tx(`Noc u was spędzili goście: ${kto(g).pl}.`, `${kto(g).en} spent the night with you.`)
    : tx(`Noc u was ${plec(p, 'spędził', 'spędziła')} ${p.name}.`, `${p.name} spent the night with you.`);
}

/** poranna linia o chorobie od gościa; słowa zarządu według siedziby (komitet w domu) */
const liniaChoroby = (s: Words, e: WordsEn): Tx =>
  tx(
    `Rano ktoś z ${s.zarzad.dk} ma dreszcze. Gość spod ${s.brama.d} był chory i teraz wiadomo, że to się łapie.`,
    `This morning someone on ${e.krotko} has the shivers. The visitor at ${e.brama} was ill, and now it is clear that it is catching.`,
  );

/** zdanie na karcie po obejrzeniu rąk (zombie) */
function poObejrzeniu(g: Gosc, v: 'ugryziony' | 'czysty'): Tx {
  const b = g.osoby[g.ugryziony ?? 0] ?? mowiacy(g);
  return v === 'ugryziony'
    ? tx(
        `Obejrzeliście ręce. U ${b.first} pod rękawem jest świeże ugryzienie.`,
        `You checked their hands. ${b.first} has a fresh bite under the sleeve.`,
      )
    : tx(
        'Obejrzeliście ręce: czyste, bez śladu zębów. Obrażona cisza trwa dłuższą chwilę.',
        'You checked their hands: clean, no sign of teeth. An offended silence hangs in the air.',
      );
}

// ---------------------------------------------------------------- karta gościa pod bramą

/** czy zarząd nie zna jeszcze dziedziny, w której mówiący ma fach (do „Przyjąć do zarządu”) */
const fachNowy = (h: GovHost, p: Person): boolean =>
  (Object.entries(p.skills) as [Dom, number][]).some(([d, v]) => v >= PROG_FACHU && h.know(d) < PROG_FACHU);

/** wybory karty gościa: pierwsze to to, czego gość chce, potem wpuścić na noc, jedzenie, obejrzenie rąk (zombie), odprawa */
function wyboryGoscia(h: GovHost, d: DaneGoscia): GChoice[] {
  const k = h.gosc(d.id);
  if (!k) return [];
  const g0 = k.gosc;
  const g = widoczny(g0, k.wpis);
  const w = k.wpis;
  const pod = w?.faza === 'brama';
  const id = g0.id;
  const p = mowiacy(g);
  const n = g.osoby.length;
  const s = h.words();
  const e = h.wordsEn();
  const dom = h.place().kind === 'dom';
  const free = h.free();
  const podloga = Math.max(0, n - free);
  const zombie = h.tryb() === 'zombie';
  const go = goEn(g);

  /** haczyk po przyjęciu do osiedla albo wpuszczeniu: ugryzienie, choroba i pościg mają skutki (pościg w zwykłym trybie to
      napad przy bramie, w zombie hałas przy bramie) */
  const haczyk = (): void => {
    if (g.haczyk === 'ugryziony') h.goscRozkaz(id, 'ugryziony');
    if (g.haczyk === 'chory') h.chorobaRano(liniaChoroby(s, e));
    if (g.haczyk === 'poscig') {
      if (zombie) h.halas(w?.tile ?? 0, HALAS_PROMIEN);
      else h.poscig();
    }
  };

  const noc: GChoice = {
    label: tx('Wpuścić na noc', n === 1 ? `Let ${go} in for the night` : 'Let them in for the night'),
    ok: pod && !h.gateClosed(),
    run: () => {
      h.goscRozkaz(id, 'noc');
      if (g.haczyk === 'klamie') h.goscRozkaz(id, 'klamie');
      haczyk();
      h.mood(1, 0);
      nagroda(h, g0);
    },
  };
  const jedzenie: GChoice = {
    label: tx('Podać jedzenie przez siatkę (Jedzenie 1)', 'Pass some food through the fence (Food 1)'),
    ok: pod && h.res.jedzenie >= 1,
    run: () => {
      h.addRes('jedzenie', -1);
      h.goscRozkaz(id, 'jedzenie');
      h.mood(1, 0);
      nagroda(h, g0);
    },
  };
  const odprawic: GChoice = {
    label: tx('Odprawić', n === 1 ? `Send ${go} away` : 'Send them away'),
    ok: pod,
    run: () => {
      h.goscRozkaz(id, 'odejdz');
      h.mood(-1, 0);
    },
  };
  const przyjecie = (zarzad: boolean) => (): void => {
    h.goscRozkaz(id, zarzad ? 'zarzad' : 'zostan');
    haczyk();
    h.mood(1, podloga > 0 ? 2 : 0);
    nagroda(h, g0);
    const gdzie = tx(dom ? 'w domu' : 'w spółdzielni', dom ? 'in the house' : 'in the co-op');
    const reszta = n - 1;
    h.log(
      zarzad
        ? tx(
            `${p.name} wchodzi do ${s.zarzad.dk}${reszta > 0 ? `, reszta (${reszta}) zostaje ${gdzie.pl}` : ''}.`,
            `${p.name} joins ${e.krotko}${reszta > 0 ? `, the rest (${reszta}) stay ${gdzie.en}` : ''}.`,
          )
        : tx(
            `Przyjęliście: ${kto(g).pl}.${podloga > 0 ? ` ${osobyNaPodlodze(podloga)} spać na podłodze.` : ''}`,
            `You took in ${kto(g).en}.${podloga > 0 ? ` ${podloga} of them will sleep on the floor.` : ''}`,
          ),
      true,
    );
  };
  const zostan: GChoice = {
    label: tx(
      `Przyjąć do ${dom ? 'domu' : 'spółdzielni'}${podloga > 0 ? ` (${osobyNaPodlodze(podloga)} spać na podłodze)` : ''}`,
      `Take ${n === 1 ? go : 'them'} into ${dom ? 'the house' : 'the co-op'}${podloga > 0 ? ` (${ludzieEn(podloga)} on the floor)` : ''}`,
    ),
    ok: pod,
    run: przyjecie(false),
  };
  const zarzad: GChoice = {
    label: tx(`Przyjąć do ${s.zarzad.dk} (${p.first})`, `Take ${p.first} onto ${e.krotko}`),
    ok: pod,
    run: przyjecie(true),
  };
  const leki: GChoice = {
    label: tx('Dać leki (Leki 1)', 'Give them meds (Meds 1)'),
    ok: pod && h.res.leki >= 1,
    run: () => {
      h.addRes('leki', -1);
      h.goscRozkaz(id, 'odejdz', 'nakarmiony');
      h.mood(1, 0);
      nagroda(h, g0);
    },
  };
  const wymiana: GChoice = {
    label: tx('Przystać na wymianę (Jedzenie 2)', 'Agree to the swap (Food 2)'),
    ok: pod && h.res.jedzenie >= 2,
    run: () => {
      h.addRes('jedzenie', -2);
      h.goscRozkaz(id, 'odejdz', 'nakarmiony');
      nagroda(h, g0);
    },
  };
  const przechowac: GChoice = {
    label: tx('Przyjąć na przechowanie', 'Take it in for safekeeping'),
    ok: pod,
    run: () => {
      h.goscRozkaz(id, 'odejdz', 'nakarmiony');
      h.mood(1, 0);
      nagroda(h, g0);
      h.log(
        tx(
          'Zawiniątko leży w składziku pod kluczem. Wrócą po nie przy pierwszej okazji.',
          'The bundle sits in the storeroom under lock and key. They will be back for it at the first opportunity.',
        ),
      );
    },
  };
  const wiadomosc: GChoice = {
    label: tx('Wysłuchać, co mają do powiedzenia', 'Hear what they have to say'),
    ok: pod,
    run: () => {
      h.goscRozkaz(id, 'odejdz', 'nakarmiony');
      nagroda(h, g0);
    },
  };
  const dobic: GChoice = {
    label: tx('Dobić przez siatkę dzidą', 'Finish the bitten one off with a spear through the fence'),
    ok: pod && !!h.zDzida() && g.ugryziony !== undefined,
    run: () => {
      const dobijajacy = h.zDzida();
      if (!dobijajacy) return;
      h.goscRozkaz(id, 'dobij');
      h.goscRozkaz(id, 'odejdz');
      h.moodOf(dobijajacy.id, 'Zabiłem człowieka', -6, 24);
      h.log(
        tx(
          `${dobijajacy.name} ${plec(dobijajacy, 'wziął', 'wzięła')} dzidę i ${plec(dobijajacy, 'zrobił', 'zrobiła')} to przez siatkę. ${p.first} nie powiedział${plec(p, '', 'a')} ani słowa i odszedł${plec(p, '', 'a')}.`,
          `${dobijajacy.name} took a spear and did it through the fence. ${p.first} did not say a word and walked away.`,
        ),
        true,
      );
    },
  };
  const obejrzec: GChoice = {
    label: tx('Obejrzeć ręce', 'Check their hands'),
    ok: pod,
    zostaje: true,
    run: () => {
      const bity = g.haczyk === 'ugryziony';
      h.obejrzano(bity ? 'ugryziony' : 'czysty');
      if (!bity) h.mood(-1, 0);
    },
  };

  const wedlugChce: Record<Gosc['chce'], GChoice[]> = {
    nocleg: [noc, jedzenie],
    jedzenie: [jedzenie, noc],
    leki: [leki, noc, jedzenie],
    wymiana: [wymiana, noc],
    dolaczyc: [zostan, ...(g.ma === 'fach' && fachNowy(h, mowiacy(g)) ? [zarzad] : []), noc, jedzenie],
    przechowac: [przechowac, noc],
    wiadomosc: [wiadomosc, noc, jedzenie],
    dobic: [dobic, noc],
  };
  return [...wedlugChce[g.chce], ...(zombie && !k.obejrzano ? [obejrzec] : []), odprawic];
}

/** znajomy, który wrócił: gość z `wraca`, którego pierwsza żywa osoba to ten człowiek (zmarły mówiący robi z karty zwykłą kartę) */
function powracajacy(h: GoscHost, g: Gosc): Znajomy | null {
  if (!g.wraca) return null;
  const z = h.znajomy(g.wraca);
  const p = g.osoby[0];
  return z && z.osoba.name === p.name && z.osoba.f === p.f ? z : null;
}

const gosc: GEventDef<DaneGoscia> = {
  id: 'gosc',
  first: true,
  gap: GOSC_GAP,
  when: ['dzien', 'wieczor', 'noc'],
  // waga 0 bez GovInput.goscie (gra bez obcych) i gdy zarząd prowadzi już jakiegoś gościa; wypadnięcie nie otwiera karty,
  // tylko planuje wizytę (eventTick → planujGoscia), a karta przychodzi pod bramą (goscTick)
  w: (h) =>
    h.goscie() && !h.goscAktywny() ? WAGA_GOSCIA * Math.max(MIN_WAGA_GOSCIA, wagaGoscia({ napady: h.napady() })) : 0,
  make: () => ({ id: '' }),
  gdzie: (h, d) => h.gosc(d.id)?.wpis?.gdzie ?? null,
  title: (h, d) => {
    const k = h.gosc(d.id);
    if (!k) return tx('Pod bramą', 'At the gate');
    const g = widoczny(k.gosc, k.wpis);
    return powracajacy(h, g) ? tytulPowrotu(g, h.words(), h.wordsEn()) : tytulGoscia(g, h.words(), h.wordsEn());
  },
  text: (h, d) => {
    const k = h.gosc(d.id);
    if (!k) return tx('Pod bramą nikt już nie stoi.', 'There is nobody at the gate now.');
    const g = widoczny(k.gosc, k.wpis);
    const z = powracajacy(h, g);
    const t = z ? tekstPowrotu(g, z, h.words(), h.wordsEn()) : tekstGoscia(g, h.words(), h.wordsEn());
    if (!k.obejrzano) return t;
    const o = poObejrzeniu(g, k.obejrzano);
    return tx(`${t.pl} ${o.pl}`, `${t.en} ${o.en}`);
  },
  choices: (h, d) => wyboryGoscia(h, d),
};

// ---------------------------------------------------------------- karta „Złapany”

/** wybory karty „Złapany”: oddać i wyrzucić, wyrzucić z łupem, zatrzymać do rana (pilnuje ktoś z zarządu) */
function wyboryZlapanego(h: GovHost, d: DaneGoscia): GChoice[] {
  const k = h.gosc(d.id);
  if (!k) return [];
  const g = widoczny(k.gosc, k.wpis);
  const w = k.wpis;
  const zl = w?.faza === 'zlapany';
  const p = mowiacy(g);
  const id = g.id;
  const ukradl = w?.ukradl ?? 0;
  const brama = h.words().brama.b;
  const gate = h.wordsEn().brama;
  return [
    {
      label: tx('Oddać jedzenie i wyrzucić', 'Take the food back and throw them out'),
      ok: zl,
      run: () => {
        h.goscRozkaz(id, 'puscic');
        h.mood(1, 0);
        const line = tx(
          `${p.name} oddał${plec(p, '', 'a')} jedzenie i ${plec(p, 'wyszedł', 'wyszła')} za ${brama}. Zapasy wróciły na miejsce.`,
          `${p.name} gave the food back and was shown out through ${gate}. The stores are whole again.`,
        );
        h.later({}, line);
        h.log(line);
      },
    },
    {
      label: tx('Wyrzucić z łupem', 'Throw them out with the loot'),
      ok: zl,
      run: () => {
        h.goscRozkaz(id, 'odejdz', 'zlapany');
        h.mood(-1, ukradl > 0 ? 1 : 0);
        const line = tx(
          `${p.name} ${plec(p, 'wyszedł', 'wyszła')} z łupem${ukradl > 0 ? `: ${porcje(ukradl)} jedzenia` : ''}. Nikt nie powiedział ani słowa.`,
          `${p.name} walked out with the loot${ukradl > 0 ? `: ${portions(ukradl)} of food` : ''}. Nobody said a word.`,
        );
        h.later({}, line);
        h.log(line);
      },
    },
    {
      label: tx('Zatrzymać do rana', 'Hold them until morning'),
      ok: zl && !!h.doSprawdzenia(),
      run: () => {
        const straznik = h.doSprawdzenia();
        if (!straznik) return;
        h.zapamietajGoscia(id, 'zlapany');
        h.needsOf(straznik.id, { rest: -10 });
        const line = tx(
          `${straznik.name} ${plec(straznik, 'pilnował', 'pilnowała')} złapanego gościa do rana. Jedzenie nie opuściło podwórka.`,
          `${straznik.name} guarded the caught guest until morning. The food never left the yard.`,
        );
        h.later({}, line);
        h.log(line);
      },
    },
  ];
}

const zlapany: GEventDef<DaneGoscia> = {
  id: 'zlapany',
  when: ['dzien', 'wieczor', 'noc'],
  // z sytuacji, nie z losowania: goscTick pokazuje ją, gdy symulacja złapała kradnącego gościa (faza `zlapany`)
  w: () => 0,
  make: () => null,
  gdzie: (h, d) => h.gosc(d.id)?.wpis?.gdzie ?? null,
  title: () => tx('Złapany na kradzieży', 'Caught stealing'),
  text: (h, d) => {
    const k = h.gosc(d.id);
    if (!k) return tx('Nikt już tu nie stoi.', 'Nobody is standing here now.');
    // kradnie pierwsza żywa osoba (symulacja bierze `m[0]`), więc karta nazywa ją tak samo
    const gz = widoczny(k.gosc, k.wpis);
    const p = mowiacy(gz);
    const ukradl = k.wpis?.ukradl ?? 0;
    const ktore = ukradl === 1 ? 'która nie była' : 'które nie były';
    const reszta = wielu(gz)
      ? tx(
          ' Reszta grupy stoi z boku i udaje, że śpi.',
          ' The rest of the group stand to one side and pretend to be asleep.',
        )
      : tx('', '');
    return tx(
      `Koło drugiej w nocy ktoś z czuwających usłyszał kroki przy zapasach. ${p.name} stoi z workiem w ręku${ukradl > 0 ? `, a w worku ${porcje(ukradl)} jedzenia, ${ktore} ${plec(p, 'jego', 'jej')}` : ''}, a w oczach ma to, co ma każdy, kogo przyłapano.${reszta.pl}`,
      `Around two in the morning someone on watch heard footsteps by the stores. ${p.name} is standing there with a sack in hand${ukradl > 0 ? `, and in the sack ${portions(ukradl)} of food that ${ukradl === 1 ? 'was' : 'were'} not ${p.f ? 'hers' : 'his'}` : ''}, with the look of anyone who has been caught.${reszta.en}`,
    );
  },
  choices: (h, d) => wyboryZlapanego(h, d),
};

/** karty gościa: `gosc` (w puli, planuje wizytę) i `zlapany` (z sytuacji) */
export const GOSC_EVENTS: GEventDef[] = [gosc, zlapany];
