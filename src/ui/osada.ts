/* Osada AI w grze w przeglądarce: druga gra obok naszej, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md,
   zadanie 3; projekt docs/superpowers/specs/2026-10-20-osada-ai-design.md, „Druga gra obok naszej” i „Start osady i dane
   kwadratu”). Moduł jest po stronie gry, ale bez PixiJS i bez DOM: sieć i pamięć przeglądarki dochodzą tylko przez to, co poda
   gospodarz (src/main.ts: dane kandydatów, układ domu, tryb gry), więc całość chodzi w Node i ma testy (tests/unit/osada-gra.test.ts).
   Wszystko za flagą `?osada=1`: gra bez flagi nie tworzy osady, a jej zapis nie ma pola `osada` (`poleOsady`). Kod osady main.ts
   ładuje dopiero przy fladze (`import()`), więc gra bez flagi nie niesie silnika AI.

   Cykl życia osady (`StanOsady`, to samo trafia do zapisu jako `Save.osada`):
   - `czeka` od nowej gry do `TICK_STARTU_OSADY` (6:00 drugiego dnia, `tickAt(2, 6)`): na zewnątrz niczego nie ma ani nie liczy
     (zapis to samo `czeka`). Przed tą chwilą nic nie łączy obu gier (pierwszy kontakt najwcześniej w 4. dniu), więc przebieg nie
     zależy od tego, kiedy przyszły dane ani kiedy osada policzyła swoją grę, byle w ticku startu miała ją za sobą;
   - praca na zapas, żeby żadna klatka nie liczyła naraz całej gry osady (około 12000 kroków, rzędu 0,2 do 0,5 s): gdy są dane,
     gospodarz woła `przygotujCiezkie()` raz (niepodzielne kroki: wybór kwadratu `wybierzOsade`, src/ai/kwadrat.ts, budowa gry
     `nowaGraAi` z ziarnem z ziarna naszej gry i kwadratu, rozgrzewka, czyli `doOtoczenia` jej świata, którą inaczej liczyłby dopiero
     pierwszy krok zarządu; razem kilkadziesiąt do ponad 200 ms, więc pod ekranem ładowania) i `przygotuj()` raz na klatkę (jedna
     porcja: niepodzielny krok albo `KAWALEK_NADRABIANIA` ticków gry osady od 0 do `TICK_STARTU_OSADY`). Praca jest ukryta (`prep`,
     w podglądzie `przygotowanie`) i poza zapisem: zapis w jej trakcie to `czeka`, a po wczytaniu gospodarz podaje dane od nowa i
     przygotowanie zaczyna się od początku, z tym samym skutkiem. Nowy rekord danych przed startem zaczyna ją od nowa;
   - w ticku startu gospodarz woła `krok(nasz tick)` i osada powstaje z tego, co przygotowano, a resztę (wybór, budowę, nadrabianie)
     robi naraz, jak wtedy, gdy gospodarz nie przygotował niczego; stan jest ten sam bajt w bajt (skrót gry w ticku startu). Wybór idzie
     dopiero na komplecie danych: `dane()` woła gospodarz raz, gdy wszystkie osiem pobrań sąsiednich kwadratów się skończyło (dobrze
     albo błędem; nieudane kwadraty po prostu brakują w rekordzie). Bez wywołania do ticku startu osady nie ma (`brak`, powód
     `dane`), a dane podane później nic nie zmieniają. Rekord bez żadnego kandydata to też `dane`. Żaden kandydat nie spełnia reguły
     miejsca albo brak tabel mieszkańców: `brak`, powód `regula` (też dopiero w ticku startu, choć wiadomo o tym wcześniej). Wyjątek
     z wyboru, z budowy gry albo z jej nadrabiania: `brak`, powód `blad`, jedno ostrzeżenie w konsoli i żadnej drugiej próby (wyjątek
     z przygotowania na zapas wyłącza osadę od razu, bo wiadomo już, że jej nie będzie);
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

import {
  type GraAi,
  krokGry,
  nowaGraAi,
  skrotGry,
  tekstBledu,
  wczytajGre,
  type ZapisGryAi,
  zapiszGre,
} from '../ai/gra.ts';
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
import { doOtoczenia } from '../sim/sasiedzi.ts';
import type { GameMode } from '../sim/tryb.ts';
import type { Geo } from '../world/geo.ts';
import { kluczKwadratu, type Uklad, zKlucza } from '../world/kwadraty.ts';
import { geoKwadratu, type Loaded, loadDemoKwadraty, type PamiecKafelkow } from '../world/load.ts';
import { worldKey } from './zapis.ts';

/** Tick, w którym osada powstaje: 6:00 drugiego dnia gry (nasz tick; osada nadrabia swoją grę od ticku 0 do niego). */
export const TICK_STARTU_OSADY: number = tickAt(2, 6);

/** Ile ticków gry osady nadrabia jedno `przygotuj()` (jedno wywołanie na klatkę). Stała liczba, a nie budżet czasu: moduł nie czyta
    zegara, a liczba klatek do końca nadrabiania wynika tylko z niej (`TICK_STARTU_OSADY / KAWALEK_NADRABIANIA` = 120, czyli 2 s przy
    60 klatkach na sekundę, a do startu osady jest co najmniej 10 minut gry). Koszt kawałka zmierzony w Node (Przymorze i Lanciego,
    po rozgrzewce `doOtoczenia`): średnio 0,7 do 1,6 ms, 95. percentyl 3,8 do 5,8 ms, najdroższy kawałek 6,7 do 11,6 ms; w Chromium
    w grze (`przygotuj()` mierzone w `frame()`): średnio ok. 2 ms, najdroższy 9 do 11 ms. Najdroższy kawałek robi pojedynczy tick
    zarządu osady (do ok. 8 ms), więc mniejsze kawałki go nie zbijają, a większe go tylko podnoszą. */
export const KAWALEK_NADRABIANIA = 100;

/** Dlaczego osady nie ma: `dane` (do ticku startu nie przyszły wszystkie osiem pobrań albo żadne się nie udało), `regula` (żaden
    kandydat nie spełnia reguły miejsca, brak tabel mieszkańców albo tryb zombie), `blad` (wyjątek przy wyborze, budowie, nadrabianiu
    albo wczytaniu zapisu). */
export type PowodBraku = 'dane' | 'regula' | 'blad';

/** Co osada ma już zrobione na zapas przed startem (poza zapisem; `PodgladOsady.przygotowanie`): faza to następny krok. `budowa`:
    kwadrat wybrany, gry jeszcze nie ma; `rozgrzewka`: gra zbudowana (tick 0); `nadrabianie`: kawałki ticków; `gotowa`: gra osady
    jest w ticku startu i czeka na niego; `bez-osady`: wybór nie dał kwadratu (w ticku startu będzie `brak`, powód `regula`). */
export type FazaPrzygotowania = 'budowa' | 'rozgrzewka' | 'nadrabianie' | 'gotowa' | 'bez-osady';

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
  /** praca na zapas przed startem (tylko `czeka`, od pierwszego kroku przygotowania; poza zapisem): faza i tick gry osady, gdy ją
      już zbudowano */
  przygotowanie?: { faza: FazaPrzygotowania; tick?: number };
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
  /** Jedna porcja pracy na zapas przed startem osady, wołana raz na klatkę: jeden niepodzielny krok (wybór kwadratu, budowa gry,
      rozgrzewka) albo kawałek nadrabiania `KAWALEK_NADRABIANIA` ticków gry osady. Nic nie zmienia na zewnątrz (osada `czeka`, zapis to
      `czeka`) i niczego nie robi bez danych, po starcie ani w `brak`; nie rzuca (błąd to `brak`, powód `blad`). Wynik w ticku
      startu jest ten sam, co gdy osada robi całą pracę dopiero wtedy, a czego nie zdążono zrobić, dokańcza się w ticku startu. */
  przygotuj(): void;
  /** Wszystkie niepodzielne kroki pracy na zapas naraz (wybór kwadratu, budowa gry, rozgrzewka), bez nadrabiania ticków: dla
      gospodarza, który robi to pod ekranem ładowania, żeby żadna klatka gry nie niosła ich kosztu (razem kilkadziesiąt do ponad
      200 ms). Nie rzuca. */
  przygotujCiezkie(): void;
  /** Krok po kroku naszej symulacji, z naszym tickiem po kroku: przed startem nic, w ticku startu osada powstaje (z tego, co
      przygotowano na zapas, a resztę robi naraz), potem tyle kroków gry osady, żeby jej tick równał się naszemu. Nie rzuca: błąd
      gry osady wyłącza ją (`brak`, powód `blad`). */
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

/** Praca na zapas przed startem (tylko w stanie `czeka`, poza zapisem): wynik ostatniego ukończonego kroku, a następny krok to
    jego `faza`. Bez niej (`null`) następny krok to wybór kwadratu. Gra w `s` to przyszły stan `jest`; do ticku startu nikt poza
    osadą jej nie widzi. */
type Przygotowanie =
  | { faza: 'budowa'; swiat: SwiatOsady }
  | { faza: 'rozgrzewka' | 'nadrabianie' | 'gotowa'; s: Jest }
  | { faza: 'bez-osady' };

class OsadaWGrze implements OsadaGry {
  private s: Stan;
  private kandydaci: Readonly<Record<string, Geo>> | null = null;
  /** praca na zapas przed startem; tylko w `czeka` (poza zapisem: po wczytaniu zaczyna się od nowa) */
  private prep: Przygotowanie | null = null;
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
    if (this.s.stan !== 'czeka') return;
    this.kandydaci = kandydaci;
    // praca na zapas liczyła się z poprzedniego rekordu: z nowego zaczyna się od nowa
    this.prep = null;
  }

  przygotuj(): void {
    try {
      this.porcja();
    } catch (e) {
      this.zepsuta(e, 'przy przygotowaniu osady');
    }
  }

  przygotujCiezkie(): void {
    try {
      while (this.czekaCiezki()) this.porcja();
    } catch (e) {
      this.zepsuta(e, 'przy przygotowaniu osady');
    }
  }

  krok(nasz: number): void {
    let gdzie = 'w trakcie gry';
    try {
      const s = this.s;
      if (s.stan === 'czeka') {
        if (nasz >= TICK_STARTU_OSADY) {
          gdzie = 'przy starcie osady';
          this.start(nasz);
        }
      } else if (s.stan === 'jest') this.graj(s, nasz);
    } catch (e) {
      this.zepsuta(e, gdzie);
    }
  }

  /** czy są dane kandydatów, z których da się wybierać (pusty rekord to brak danych: w ticku startu `brak`, powód `dane`) */
  private maDane(): boolean {
    return !!this.kandydaci && Object.keys(this.kandydaci).length > 0;
  }

  /** czy następny krok pracy na zapas jest niepodzielny (wybór kwadratu, budowa gry albo rozgrzewka) i da się go zrobić */
  private czekaCiezki(): boolean {
    if (this.s.stan !== 'czeka' || !this.maDane()) return false;
    const faza = this.prep?.faza;
    return faza === undefined || faza === 'budowa' || faza === 'rozgrzewka';
  }

  /** Jedna porcja pracy na zapas (rzuca przy błędzie, łapią ją `przygotuj` i `przygotujCiezkie`): wybór kwadratu, budowa jego gry,
      rozgrzewka albo kawałek nadrabiania. Te same porcje, tylko pod rząd, robi `start`, jeśli nie zdążono ich zrobić przed nim. */
  private porcja(): void {
    const kandydaci = this.kandydaci;
    if (this.s.stan !== 'czeka' || !kandydaci || !this.maDane()) return;
    const p = this.prep;
    if (!p) {
      const swiat = wybierzOsade(this.seed, kandydaci, this.tabele, this.uklad);
      this.prep = swiat ? { faza: 'budowa', swiat } : { faza: 'bez-osady' };
    } else if (p.faza === 'budowa') {
      const swiat = p.swiat;
      const gra = nowaGraAi(swiat.world, ziarnoOsady(this.seed, swiat.sx, swiat.sy), swiat.opcje);
      const { pomiar: _pomiar, ...bezPomiaru } = swiat;
      this.prep = { faza: 'rozgrzewka', s: { stan: 'jest', swiat: bezPomiaru, gra, odkryta: false, odwolania: 0 } };
    } else if (p.faza === 'rozgrzewka') {
      // pierwszy krok zarządu osady liczy `doOtoczenia` świata (kilkadziesiąt ms, raz na świat): tu, osobno, zamiast w pierwszym
      // kawałku nadrabiania; wynik to cecha świata, więc gra jest ta sama (sasiedzi.ts, `doOtoczenia`)
      doOtoczenia(p.s.gra.sim.w);
      this.prep = { faza: 'nadrabianie', s: p.s };
    } else if (p.faza === 'nadrabianie') {
      const g = p.s.gra;
      this.graj(p.s, Math.min(TICK_STARTU_OSADY, g.sim.st.tick + KAWALEK_NADRABIANIA));
      if (g.sim.st.tick >= TICK_STARTU_OSADY || p.s.upadla) this.prep = { faza: 'gotowa', s: p.s };
    }
  }

  /** Start w ticku startu (albo później, gdy zapis stanu `czeka` wczytano po nim): to, czego nie zrobiono na zapas (wybór kwadratu,
      budowa gry, rozgrzewka, nadrabianie), robi się teraz naraz, i osada jest. Efekt ten sam, co gdyby wszystko poszło dopiero tu. */
  private start(nasz: number): void {
    const kandydaci = this.kandydaci;
    if (!kandydaci || !this.maDane()) {
      this.kandydaci = null;
      this.prep = null;
      this.s = { stan: 'brak', powod: 'dane' };
      return;
    }
    let p = this.prep;
    while (!p || (p.faza !== 'gotowa' && p.faza !== 'bez-osady')) {
      this.porcja();
      p = this.prep;
    }
    this.kandydaci = null;
    this.prep = null;
    if (p.faza === 'bez-osady') {
      this.s = { stan: 'brak', powod: 'regula' };
      return;
    }
    this.s = p.s;
    this.graj(p.s, nasz);
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
    this.s = { stan: 'brak', powod: 'blad', blad: tekstBledu(e) };
    this.kandydaci = null;
    this.prep = null;
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
    if (s.stan === 'czeka') {
      const p = this.prep;
      if (!p) return { stan: 'czeka' };
      const tick = 's' in p ? { tick: p.s.gra.sim.st.tick } : {};
      return { stan: 'czeka', przygotowanie: { faza: p.faza, ...tick } };
    }
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
