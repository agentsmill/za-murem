/* Osada AI w grze w przeglądarce: druga gra obok naszej, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 3; projekt docs/superpowers/specs/2026-10-20-osada-ai-design.md, „Druga gra obok naszej” i „Start osady i dane
   kwadratu”). Moduł jest po stronie gry, ale bez PixiJS i bez DOM: sieć i pamięć przeglądarki dochodzą tylko przez to, co poda
   gospodarz (src/main.ts: dane kandydatów, układ domu, tryb gry), więc całość chodzi w Node i ma testy (tests/unit/osada-gra.test.ts).
   Wszystko za flagą `?osada=1`: gra bez flagi nie tworzy osady, a jej zapis nie ma pola `osada` (`poleOsady`). Kod osady main.ts
   ładuje dopiero przy fladze (`import()`), więc gra bez flagi nie niesie silnika AI.

   Cykl życia osady (`StanOsady`, to samo trafia do zapisu jako `Save.osada`):
   - `czeka` od nowej gry do `TICK_STARTU_OSADY` (6:00 drugiego dnia, `tickAt(2, 6)`): niczego nie liczy. Przed tą chwilą nic nie łączy
     obu gier (pierwszy kontakt najwcześniej w 4. dniu), więc przebieg nie zależy od tego, kiedy przyszły dane;
   - w ticku startu gospodarz woła `krok(nasz tick)` i osada wybiera kwadrat (`wybierzOsade`, src/ai/kwadrat.ts), buduje swoją grę
     (`nowaGraAi` z ziarnem z ziarna naszej gry i kwadratu) i nadrabia ją od ticku 0 do naszego ticka (około 12000 kroków, rzędu
     pół sekundy). Wybór idzie dopiero na komplecie danych: `dane()` woła gospodarz raz, gdy wszystkie osiem pobrań sąsiednich
     kwadratów się skończyło (dobrze albo błędem; nieudane kwadraty po prostu brakują w rekordzie). Bez wywołania do ticku startu
     osady nie ma (`brak`, powód `dane`), a dane podane później nic nie zmieniają. Rekord bez żadnego kandydata to też `dane`.
     Żaden kandydat nie spełnia reguły miejsca albo brak tabel mieszkańców: `brak`, powód `regula`. Wyjątek z wyboru, z budowy gry
     albo z jej nadrabiania: `brak`, powód `blad`, jedno ostrzeżenie w konsoli i żadnej drugiej próby;
   - `jest`: od startu `krok(nasz tick)` po każdym kroku naszej symulacji robi dokładnie tyle kroków gry osady, ile trzeba, żeby jej tick
     równał się naszemu (zwykle jeden: `krokGry` z silnikiem `silnik`). Krok po kroku w jednej pętli, więc tempo 8×, przewijanie
     (`zm.ff`) i zrzucanie zaległości przez pętlę klatek niczego nie rozjeżdżają: liczy się tylko nasz tick;
   - koniec gry osady po kroku: odwołanie zarządu (wkurzenie 100) daje nowy zarząd (`nowyZarzad`, src/ai/odwolanie.ts; decyzja 10 ze
     specyfikacji) i osada żyje dalej słabsza, a licznik `odwolania` rośnie; pustka i exodus kończą osadę: `upadla` (dzień i powód),
     gra osady stoi, `krok` nic nie robi, zapis i wczytanie to pamiętają;
   - `brak` jest ostateczny: ani dane, ani kolejne kroki go nie zmieniają. Tryb zombie z flagą od razu ma `brak` z powodem `regula`
     (spec, „Nie-cele”: w pierwszej wersji osady w zombie nie ma); pole `osada` zostaje w zapisie, więc wczytana gra dalej wie, że
     zaczęto ją z flagą.

   Zapis (`zapisz`): stan, a dla `jest` klucz kwadratu, jego geo przesunięte do siedziby (zapis nie pobiera sieci od nowa: nowe dane
   zmieniłyby świat po cichu, bo `worldKey` liczy tylko liczniki), odcisk świata osady (`worldKey`), pełny zapis jej gry
   (`zapiszGre`: symulacja, zarząd, pamięć silnika, opcje), to, czy odkryta, ostatni kontakt, licznik odwołań i ewentualny upadek.
   Wczytanie (`osadaZZapisu`) odtwarza świat z zapisanego geo tą samą drogą co wybór (`swiatZGeo`: tagi budynków generatora mieszkańców
   i `buildWorld` z ziarnem osady), sprawdza odcisk (inny odcisk to zmiana generatora: `brak`, powód `blad`, bez wyjątku), nakłada
   stany mieszkań z zapisanej symulacji (`mieszkancyZapisu`, zawsze, bo meble i śmieci świata z wyboru różnią się od `swiatZGeo`) i
   wczytuje grę. Stan `czeka` wraca jako `czeka`: gospodarz pobiera dane od nowa i znów woła `dane()`. Kształt zapisu pilnuje
   `readSave` (src/ui/zapis.ts, `jestStanOsady`); wczytanie i tak łapie każdy wyjątek.

   Moduł niczego nie losuje (kolejność kandydatów, ziarna i wszystko w grze osady idzie z ziaren) i nie czyta zegara. Nic z osady nie
   wpływa na naszą grę: etap 2 nie ma ludzi między grami, handlu ani napadów (zadanie 4 dołoży pierwszy kontakt, jedyny skutek
   w naszą stronę jest po stronie zarządu, `OsadaGry.odkryj`). */

import { type GraAi, krokGry, nowaGraAi, skrotGry, wczytajGre, type ZapisGryAi, zapiszGre } from '../ai/gra.ts';
import {
  jedzenieWZasiegu,
  kandydaciOsady,
  kierunekOsady,
  nazwaOsady,
  type SwiatOsady,
  swiatZGeo,
  wybierzOsade,
  ziarnoOsady,
} from '../ai/kwadrat.ts';
import { nowyZarzad } from '../ai/odwolanie.ts';
import { silnik } from '../ai/silnik.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { dayOf } from '../sim/clock.ts';
import { tickAt } from '../sim/handlarz.ts';
import { mieszkancyZapisu } from '../sim/osiedle.ts';
import type { GameMode } from '../sim/tryb.ts';
import type { Geo } from '../world/geo.ts';
import { kluczKwadratu, type Uklad, zKlucza } from '../world/kwadraty.ts';
import { geoKwadratu, type Loaded, loadDemoKwadraty, type PamiecKafelkow } from '../world/load.ts';
import { worldKey } from './zapis.ts';

/** Tick, w którym osada powstaje: 6:00 drugiego dnia gry (nasz tick; osada nadrabia swoją grę od ticku 0 do niego). */
export const TICK_STARTU_OSADY: number = tickAt(2, 6);

/** Dlaczego osady nie ma: `dane` (do ticku startu nie przyszły wszystkie osiem pobrań albo żadne się nie udało), `regula` (żaden
    kandydat nie spełnia reguły miejsca, brak tabel mieszkańców albo tryb zombie), `blad` (wyjątek przy wyborze, budowie, nadrabianiu
    albo wczytaniu zapisu). */
export type PowodBraku = 'dane' | 'regula' | 'blad';

/** Co gra wie o osadzie z ostatniego kontaktu: dzień, ludność i budowle w tamtej chwili (`OsadaGry.odkryj`). */
export interface KontaktOsady {
  dzien: number;
  ludnosc: number;
  budowle: number;
}

/** Osada upadła: dzień (jej gry) i powód końca, którego nie da się naprawić nowym zarządem. */
export interface UpadekOsady {
  dzien: number;
  powod: 'pustka' | 'exodus';
}

/** Stan osady w zapisie gry (`Save.osada`). */
export type StanOsady =
  | { v: 1; stan: 'czeka' }
  | { v: 1; stan: 'brak'; powod: PowodBraku }
  | {
      v: 1;
      stan: 'jest';
      /** klucz kwadratu „sx,sy” względem domu */
      klucz: string;
      /** geo kwadratu przesunięte do siedziby (`SwiatOsady.geo`), bez tagów generatora */
      geo: Geo;
      /** odcisk świata osady (`worldKey`): inny po zmianie generatora */
      world: string;
      gra: ZapisGryAi;
      odkryta: boolean;
      kontakt?: KontaktOsady;
      /** ile razy odwołano jej zarząd (każde dało nowy zarząd) */
      odwolania: number;
      upadla?: UpadekOsady;
    };

/** Świat osady w grze: to, co niesie `SwiatOsady` z wyboru kwadratu, bez pomiaru wyboru (po wczytaniu zapisu nie ma skąd go wziąć). */
export type SwiatOsadyGry = Omit<SwiatOsady, 'pomiar'>;

/** Podgląd osady dla testów i zrzutów (`window.zm.osada()`): niczego nie zmienia, skrót gry liczy się dopiero na prośbę. */
export interface PodgladOsady {
  stan: StanOsady['stan'];
  /** powód braku */
  powod?: PowodBraku;
  /** tekst błędu, który zepsuł osadę (tylko `brak` z powodem `blad`; poza zapisem) */
  blad?: string;
  klucz?: string;
  odkryta?: boolean;
  kontakt?: KontaktOsady;
  /** skrót gry osady (`skrotGry`) */
  skrot?: string;
  /** tick gry osady: równy naszemu, dopóki osada nie upadła */
  tick?: number;
  odwolania?: number;
  upadla?: UpadekOsady;
  /** błędy decydenta i okna zawieszone w grze osady od jej startu (w zwykłej grze zero) */
  bledowRazem?: number;
  zawieszonychRazem?: number;
}

export interface OsadaGry {
  /** Dane kandydatów: wołane raz, gdy wszystkie osiem pobrań sąsiednich kwadratów się skończyło (demo od razu, prawdziwy adres w tle;
      kwadraty, które się nie pobrały, brakują w rekordzie). Po starcie osady i w stanie `brak` bez skutku. */
  dane(kandydaci: Readonly<Record<string, Geo>>): void;
  /** Krok po kroku naszej symulacji, z naszym tickiem po kroku: przed startem nic, w ticku startu wybór i nadrabianie, potem tyle
      kroków gry osady, żeby jej tick równał się naszemu. Nie rzuca: błąd gry osady wyłącza ją (`brak`, powód `blad`). */
  krok(nasz: number): void;
  readonly stan: StanOsady['stan'];
  readonly gra: GraAi | null;
  readonly swiat: SwiatOsadyGry | null;
  /** czy gracz zna osadę (pierwszy kontakt, zadanie 4) */
  readonly odkryta: boolean;
  readonly kontakt: KontaktOsady | undefined;
  /** ile razy odwołano zarząd osady (każde dało nowy zarząd) */
  readonly odwolania: number;
  /** osada upadła (pustka albo exodus): jej gra stoi */
  readonly upadla: UpadekOsady | null;
  /** Odsłania osadę z tym, co gracz o niej wie (ostatni kontakt zastępuje poprzedni); poza stanem `jest` nic nie robi. */
  odkryj(kontakt: KontaktOsady): void;
  zapisz(): StanOsady;
  podglad(): PodgladOsady;
}

/** Stan osady w pamięci: jak `StanOsady`, ale z żywą grą i światem. */
interface Jest {
  stan: 'jest';
  swiat: SwiatOsadyGry;
  gra: GraAi;
  odkryta: boolean;
  kontakt?: KontaktOsady;
  odwolania: number;
  upadla?: UpadekOsady;
}
type Stan = { stan: 'czeka' } | { stan: 'brak'; powod: PowodBraku; blad?: string } | Jest;

/** Tekst błędu do podglądu: nazwa i komunikat, w jednym wierszu. */
const opisBledu = (e: unknown): string =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, ' ');

class OsadaWGrze implements OsadaGry {
  private s: Stan;
  private kandydaci: Readonly<Record<string, Geo>> | null = null;
  private readonly seed: number;
  private readonly tabele: DaneMieszkancow | null;
  private readonly uklad: Uklad;

  constructor(seed: number, daneMieszkancow: DaneMieszkancow | null, uklad: Uklad, poczatek: Stan) {
    this.seed = seed;
    this.tabele = daneMieszkancow;
    this.uklad = uklad;
    this.s = poczatek;
  }

  get stan(): StanOsady['stan'] {
    return this.s.stan;
  }
  get gra(): GraAi | null {
    return this.s.stan === 'jest' ? this.s.gra : null;
  }
  get swiat(): SwiatOsadyGry | null {
    return this.s.stan === 'jest' ? this.s.swiat : null;
  }
  get odkryta(): boolean {
    return this.s.stan === 'jest' && this.s.odkryta;
  }
  get kontakt(): KontaktOsady | undefined {
    return this.s.stan === 'jest' ? this.s.kontakt : undefined;
  }
  get odwolania(): number {
    return this.s.stan === 'jest' ? this.s.odwolania : 0;
  }
  get upadla(): UpadekOsady | null {
    return this.s.stan === 'jest' ? (this.s.upadla ?? null) : null;
  }

  dane(kandydaci: Readonly<Record<string, Geo>>): void {
    if (this.s.stan === 'czeka') this.kandydaci = kandydaci;
  }

  krok(nasz: number): void {
    try {
      const s = this.s;
      if (s.stan === 'czeka') {
        if (nasz >= TICK_STARTU_OSADY) this.start(nasz);
      } else if (s.stan === 'jest') this.graj(s, nasz);
    } catch (e) {
      this.zepsuta(e, 'w trakcie gry');
    }
  }

  /** Start w ticku startu (albo później, gdy zapis stanu `czeka` wczytano po nim): wybór kwadratu, budowa gry i nadrabianie. */
  private start(nasz: number): void {
    const kandydaci = this.kandydaci;
    this.kandydaci = null;
    if (!kandydaci || !Object.keys(kandydaci).length) {
      this.s = { stan: 'brak', powod: 'dane' };
      return;
    }
    const swiat = wybierzOsade(this.seed, kandydaci, this.tabele, this.uklad);
    if (!swiat) {
      this.s = { stan: 'brak', powod: 'regula' };
      return;
    }
    const gra = nowaGraAi(swiat.world, ziarnoOsady(this.seed, swiat.sx, swiat.sy), swiat.opcje);
    const { pomiar: _pomiar, ...bezPomiaru } = swiat;
    const s: Jest = { stan: 'jest', swiat: bezPomiaru, gra, odkryta: false, odwolania: 0 };
    this.s = s;
    this.graj(s, nasz);
  }

  /** Gra osady do ticku `doTicku`, z obsługą końca gry po każdym kroku: odwołanie to nowy zarząd, reszta to upadek. */
  private graj(s: Jest, doTicku: number): void {
    const g = s.gra;
    while (g.sim.st.tick < doTicku && !s.upadla) {
      if (g.gov.over === null) krokGry(g, silnik);
      if (g.gov.over !== null) this.koniec(s);
    }
  }

  private koniec(s: Jest): void {
    const g = s.gra;
    if (nowyZarzad(g)) {
      s.odwolania++;
      return;
    }
    s.upadla = { dzien: dayOf(g.sim.st.tick), powod: g.gov.over === 'exodus' ? 'exodus' : 'pustka' };
  }

  /** Błąd w osadzie nie może zepsuć naszej gry: osada wyłącza się (`brak`, powód `blad`), jedno ostrzeżenie, bez drugiej próby. */
  zepsuta(e: unknown, gdzie: string): void {
    console.warn(`Osada AI: błąd ${gdzie}, gra idzie dalej bez osady`, e);
    this.s = { stan: 'brak', powod: 'blad', blad: opisBledu(e) };
    this.kandydaci = null;
  }

  odkryj(kontakt: KontaktOsady): void {
    if (this.s.stan !== 'jest') return;
    this.s.odkryta = true;
    this.s.kontakt = { dzien: kontakt.dzien, ludnosc: kontakt.ludnosc, budowle: kontakt.budowle };
  }

  zapisz(): StanOsady {
    const s = this.s;
    if (s.stan === 'czeka') return { v: 1, stan: 'czeka' };
    if (s.stan === 'brak') return { v: 1, stan: 'brak', powod: s.powod };
    return {
      v: 1,
      stan: 'jest',
      klucz: s.swiat.klucz,
      geo: s.swiat.geo,
      world: worldKey(s.swiat.world),
      gra: zapiszGre(s.gra),
      odkryta: s.odkryta,
      ...(s.kontakt ? { kontakt: { ...s.kontakt } } : {}),
      odwolania: s.odwolania,
      ...(s.upadla ? { upadla: { ...s.upadla } } : {}),
    };
  }

  podglad(): PodgladOsady {
    const s = this.s;
    if (s.stan === 'czeka') return { stan: 'czeka' };
    if (s.stan === 'brak') return { stan: 'brak', powod: s.powod, ...(s.blad ? { blad: s.blad } : {}) };
    return {
      stan: 'jest',
      klucz: s.swiat.klucz,
      odkryta: s.odkryta,
      ...(s.kontakt ? { kontakt: { ...s.kontakt } } : {}),
      skrot: skrotGry(s.gra),
      tick: s.gra.sim.st.tick,
      odwolania: s.odwolania,
      ...(s.upadla ? { upadla: { ...s.upadla } } : {}),
      bledowRazem: s.gra.bledowRazem,
      zawieszonychRazem: s.gra.zawieszonychRazem,
    };
  }
}

/** Nowa osada nowej gry: czeka na dane i na `TICK_STARTU_OSADY`. `seed` to ziarno naszej gry, `dane` tabele mieszkańców (null: bez
    nich reguła miejsca nie jest spełniona), `uklad` układ domu (`ukladDomu` z gry). Tryb zombie od razu nie ma osady (`brak`, powód
    `regula`). */
export function nowaOsadaGry(
  seed: number,
  dane: DaneMieszkancow | null,
  uklad: Uklad,
  tryb: GameMode = 'zwykly',
): OsadaGry {
  return new OsadaWGrze(seed, dane, uklad, tryb === 'zombie' ? { stan: 'brak', powod: 'regula' } : { stan: 'czeka' });
}

/** Świat i gra osady ze stanu `jest` zapisu (rzuca przy złym odcisku świata albo uszkodzonym zapisie). */
function wczytajJest(z: Extract<StanOsady, { stan: 'jest' }>, seed: number, dane: DaneMieszkancow | null): Jest {
  const [sx, sy] = zKlucza(z.klucz);
  const { geo, world } = swiatZGeo(z.geo, ziarnoOsady(seed, sx, sy), dane);
  const klucz = worldKey(world);
  if (klucz !== z.world) throw new Error(`odcisk świata osady ${klucz} zamiast zapisanego ${z.world}`);
  mieszkancyZapisu(world, geo, dane, z.gra.sim);
  const gra = wczytajGre(world, z.gra);
  const swiat: SwiatOsadyGry = {
    klucz: z.klucz,
    sx,
    sy,
    geo: z.geo,
    world,
    opcje: gra.opts,
    ...nazwaOsady(sx, sy),
    kierunek: kierunekOsady(sx, sy).kierunek,
    jedzenie: jedzenieWZasiegu(gra.opts.okolica ?? []),
  };
  return {
    stan: 'jest',
    swiat,
    gra,
    odkryta: z.odkryta,
    ...(z.kontakt ? { kontakt: { ...z.kontakt } } : {}),
    odwolania: z.odwolania,
    ...(z.upadla ? { upadla: { ...z.upadla } } : {}),
  };
}

/** Osada z zapisu gry. `czeka` wraca jako `czeka` (gospodarz pobiera dane od nowa i woła `dane()`), `brak` jako `brak`, `jest`
    odbudowuje świat z zapisanego geo i wczytuje grę osady; zły odcisk świata albo uszkodzony zapis to `brak` z powodem `blad` i
    jedno ostrzeżenie, nigdy wyjątek. `seed` to ziarno naszej gry (z zapisu), `dane` tabele mieszkańców, `uklad` układ domu. */
export function osadaZZapisu(z: StanOsady, seed: number, dane: DaneMieszkancow | null, uklad: Uklad): OsadaGry {
  if (z.stan === 'czeka') return new OsadaWGrze(seed, dane, uklad, { stan: 'czeka' });
  if (z.stan === 'brak') return new OsadaWGrze(seed, dane, uklad, { stan: 'brak', powod: z.powod });
  try {
    return new OsadaWGrze(seed, dane, uklad, wczytajJest(z, seed, dane));
  } catch (e) {
    const o = new OsadaWGrze(seed, dane, uklad, { stan: 'brak', powod: 'blad' });
    o.zepsuta(e, 'przy wczytaniu zapisu osady');
    return o;
  }
}

/** Pobiera geo ośmiu kandydatów (`pobierz(sx, sy)`) po kolei w kolejności z ziarna gry (`kandydaciOsady`), jeden po drugim, nigdy
    równolegle. Błąd jednego pobrania nie przerywa reszty i nie jest ponawiany; po wszystkich wraca rekord geo (bez nieudanych), a
    gdy jakieś padły, `ostrzez` woła się raz (pierwszy błąd i klucze nieudanych): domyślnie jedno ostrzeżenie w konsoli. */
export async function pobierzKandydatow(
  seed: number,
  pobierz: (sx: number, sy: number) => Promise<Geo>,
  ostrzez: (blad: unknown, nieudane: string[]) => void = (blad, nieudane) =>
    console.warn(
      `Osada AI: nie udało się pobrać ${nieudane.length} z 8 sąsiednich kwadratów (${nieudane.join('; ')}), osada powstanie z pozostałych albo wcale`,
      blad,
    ),
): Promise<Record<string, Geo>> {
  const wynik: Record<string, Geo> = {};
  const nieudane: string[] = [];
  let pierwszy: unknown;
  for (const [sx, sy] of kandydaciOsady(seed)) {
    const klucz = kluczKwadratu(sx, sy);
    try {
      wynik[klucz] = await pobierz(sx, sy);
    } catch (e) {
      nieudane.push(klucz);
      pierwszy ??= e;
    }
  }
  if (nieudane.length) ostrzez(pierwszy, nieudane);
  return wynik;
}

/** Skąd gospodarz bierze dane kandydatów; w grze to pliki dem i kafelki OpenFreeMap, w testach atrapy. */
export interface ZrodlaKandydatow {
  /** wszystkie sąsiednie kwadraty dema naraz (public/demo/<klucz>-kwadraty.json) */
  demo: (klucz: string) => Promise<Record<string, Geo>>;
  /** geo jednego sąsiedniego kwadratu prawdziwego adresu z kafelków (kafelki wspólne dla kandydatów w `pamiec`) */
  geo: (uklad: Uklad, sx: number, sy: number, pamiec: PamiecKafelkow) => Promise<Geo>;
  /** jedno ostrzeżenie o nieudanych pobraniach (domyślnie do konsoli) */
  ostrzez?: (blad: unknown, nieudane: string[]) => void;
}

/** Dane ośmiu kandydatów osady dla wczytanego osiedla (`data`): dema z jednego pliku, prawdziwy adres kwadrat po kwadracie z kafelków
    (`pobierzKandydatow`, tym samym kafelkom wspólna pamięć), osiedle zapasowe bez prawdziwego położenia (`geo.proc`) bez sąsiadów.
    Nigdy nie odrzuca: brak pliku dema to jedno ostrzeżenie i pusty rekord, nieudane kwadraty prawdziwego adresu po prostu brakują w
    rekordzie. Wynik idzie do `OsadaGry.dane` (dema przed pierwszym krokiem gry, adres w tle po starcie). */
export async function daneKandydatow(
  data: Pick<Loaded, 'src' | 'key'> & { geo: Pick<Geo, 'proc'> },
  uklad: Uklad,
  seed: number,
  zrodla: Partial<ZrodlaKandydatow> = {},
): Promise<Record<string, Geo>> {
  if (data.src === 'demo' && data.key) {
    try {
      return await (zrodla.demo ?? loadDemoKwadraty)(data.key);
    } catch (e) {
      console.warn('Osada AI: brak danych sąsiednich kwadratów przykładu, gra idzie bez osady', e);
      return {};
    }
  }
  if (data.geo.proc) return {};
  const pamiec: PamiecKafelkow = new Map();
  const geo = zrodla.geo ?? geoKwadratu;
  return pobierzKandydatow(seed, (sx, sy) => geo(uklad, sx, sy, pamiec), zrodla.ostrzez);
}
