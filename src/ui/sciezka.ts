/* Ścieżka celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): stan w zapisie interfejsu, silnik rozdziałów
   oraz HTML okienka celów i linia celu w oknach. Treść rozdziałów (definicje celów R0, R1 i dalszych, lista `ROZDZIALY`)
   leży w src/ui/sciezka-rozdzialy.ts, żeby ten plik nie rósł z każdym rozdziałem; okazje dochodzą w kolejnym zadaniu
   planu.

   Stan. Ścieżka prowadzi gracza przez rozdziały R0–R8 i okazje O1–O7. `StanSciezki` trzyma to, co nie wynika ze stanu gry:
   który rozdział jest otwarty i od kiedy, liczniki z chwili otwarcia, cele zaliczone i przepadłe, zdarzenia samego
   interfejsu (lista ludzi, karty, ekran dróg) i otwartą okazję. Stan to zwykły JSON i leży tylko w zapisie interfejsu
   (`Save.cele`, src/ui/zapis.ts), nigdy w symulacji ani w zarządzie: ścieżka je tylko czyta, więc zasady stałego kroku jej
   nie dotyczą, a skróty botów się nie zmieniają. Zaliczenie celu jest trwałe i dlatego leży w zapisie: stan gry bywa
   chwilowy (koza zjada zapas drewna, który cel już zaliczył), a przeładowanie strony nie może go cofnąć.

   Silnik. Rozdział (`DefRozdzialu`) to lista celów (`DefCelu`): tekst, podpowiedź, warunek zaliczenia, a przy niektórych
   dopisek „czeka” (cel, którego teraz nie da się ruszyć) i warunek przepadnięcia (termin). Warunki czytają grę przez
   `OdczytCelow`: migawkę symulacji z tej chwili, stan zarządu i jego wejście. `krokSciezki(stan, odczyt)` zalicza cele
   otwartego rozdziału i oznacza przepadłe, a gdy wszystkie jego cele są zrobione albo przepadły, otwiera następny
   (z licznikami `start` z tej chwili); rozdział, którego cele gra już spełnia, zalicza je od razu przy otwarciu i może
   się zamknąć w tym samym kroku. Rozdział z własnym warunkiem otwarcia (`otwiera`) otwiera się, gdy ten warunek jest
   prawdziwy, choćby poprzedni nie był skończony: R1 otwiera się po zamknięciu pierwszego raportu, także gdy samouczek
   z R0 nie jest skończony (został pominięty), i w grze wczytanej ze starego stanu „pierwszy dzień”, w której raport jest
   już zamknięty. Rozdział z `jest` fałszywym jest pomijany (R3 istnieje tylko z modułem pracy ludzi), a po ostatnim
   rozdziale stan to „koniec”. „Koniec” zapisany, zanim dopisano późniejsze rozdziały (serwer testowy kończył ścieżkę na
   R1, zanim doszło R2), nie zostaje na zawsze: krok otwiera pierwszy rozdział po ostatnim rozstrzygniętym i ścieżka
   rusza dalej; bez żadnego wpisu (stan ustawiony ręcznie do zrzutu) „koniec” zostaje. Cel, który wygrał z terminem
   w tym samym kroku, jest zaliczony; cel przepadły nie wraca.
   Zaliczenie jest trwałe, przepadnięcie też. `widokSciezki(stan, odczyt)` robi z zapisanego stanu to, co rysuje okienko
   (tytuł, cele z tekstem, podpowiedzią, dopiskiem „czeka” i znacznikiem przepadnięcia, bieżący cel); niczego nie
   zalicza, więc przed nim woła się krok. Odczyt jest migawką z jednej chwili: kto zmienia stan gry, buduje nowy.

   Kontrakt: wszystkie funkcje są czyste. Stan (i odczyt gry) na wejściu, nowy stan na wyjściu; wejście zostaje
   nietknięte, a wynik nie dzieli z nim żadnego obiektu (kopia, więc wynik wolno zmieniać bez skutku dla wejścia).
   Klucz zaliczonego celu to „rozdział.cel” albo „okazja.cel”: 'r0.drewno', 'r1.przeszukaj', 'o2.wymiana'. Zły kształt
   pola w zapisie to brak pola: `jestStanSciezki` sprawdza kształt (woła ją `readSave`, który takie pole zdejmuje,
   i `stanZZapisu`, który wtedy zaczyna od stanu na start).

   Rozdziały. Co każdy cel mówi i kiedy się zalicza, opisuje src/ui/sciezka-rozdzialy.ts (R0 to `goalsOf` z
   src/ui/cele.ts opakowany w rozdział, dalej R1 i kolejne). Silnik bierze stamtąd tylko `ROZDZIALY`.

   Okienko i okna. `celeHtml(widok, { otwarte, touch })` składa wnętrze okienka `#goals` z widoku ścieżki, bez DOM: blok
   okazji („Teraz: …”, jej cele, podpowiedź bieżącego) nad rozdziałem (nagłówek z licznikiem, lista, podpowiedź pod
   bieżącym, cel czekający przyciemniony z dopiskiem, przepadły skreślony), a po ostatnim rozdziale zamiast niego wiersze
   dróg do zwycięstwa. Zwinięte okienko (nagłówek zwija i rozwija je na telefonie i na komputerze, stan podaje main.ts)
   ma w HTML tylko bieżący cel okazji, a bez okazji bieżący cel rozdziału. `celWOknie(widok, okno)` daje tekst celu do
   linii „Cel: …” okna, które zasłania okienko (karta nocy, uchwała, tablica badań, spotkanie): bieżący cel, jeśli
   dotyczy okna, a inaczej pierwszy niezrobiony cel tego okna, który da się ruszyć (karta nocy z za małym zapasem
   drewna pokazuje dyżur przy kozie, choć bieżącym celem jest drewno). */

import { L } from '../core/jezyk.ts';
import type { Words, WordsEn } from '../gov/miejsce.ts';
import type { GovInput, GovState } from '../gov/typy.ts';
import type { SimState } from '../sim/sim.ts';
import { populacja, type SimSnapshot } from '../sim/snapshot.ts';
import type { World } from '../world/world.ts';
import { ROZDZIALY } from './sciezka-rozdzialy.ts';
import { esc } from './tekst.ts';

/** rozdziały głównej ścieżki po kolei (R3 istnieje dopiero po scaleniu pracy ludzi); „koniec”: po ostatnim rozdziale */
export const KLUCZE_ROZDZIALOW = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'koniec'] as const;
export type KluczRozdzialu = (typeof KLUCZE_ROZDZIALOW)[number];

/** okazje: krótkie rozdziały otwierane przez zdarzenie w grze (wędrowiec, handlarz, napad, stado, ugryzienie, zwłoki,
    obcy przy aucie) */
export const KLUCZE_OKAZJI = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'] as const;
export type KluczOkazji = (typeof KLUCZE_OKAZJI)[number];

/** zdarzenia samego interfejsu, które nie zostawiają śladu w stanie gry: wybór z listy ludzi (klik albo Q i E), karta
    mieszkańca, karta cudzego budynku, ekran dróg do zwycięstwa */
export type ZdarzenieUi = 'lista' | 'mieszkaniec' | 'budynek' | 'drogi';

export interface StanSciezki {
  v: 1;
  /** bieżący rozdział głównej ścieżki i tick jego otwarcia */
  rozdzial: KluczRozdzialu;
  od: number;
  /** liczniki z chwili otwarcia rozdziału do warunków „od otwarcia” */
  start: { uchwaly: number; raporty: number; ludnosc: number; lup: number; spotkania: number; kamienLudnosci: number };
  /** zaliczone cele głównej ścieżki i okazji: klucz ('r1.przeszukaj', 'o2.wymiana') → tick zaliczenia */
  zrobione: Record<string, number>;
  /** cele, które przepadły (termin minął) */
  przepadle: string[];
  /** zdarzenia interfejsu bez śladu w stanie gry: 'lista', 'mieszkaniec', 'budynek', 'drogi' → tick ostatniego */
  ui: Record<string, number>;
  /** otwarta okazja: klucz, tick otwarcia, licznik zabitych przy otwarciu, pionek albo rzecz, której dotyczy */
  okazja?: { k: KluczOkazji; od: number; zabici?: number; cel?: number };
}

/** liczniki z `StanSciezki.start`; zapis typu `Record` pilnuje, żeby żaden nie wypadł z listy */
const LICZNIKI: Record<keyof StanSciezki['start'], true> = {
  uchwaly: true,
  raporty: true,
  ludnosc: true,
  lup: true,
  spotkania: true,
  kamienLudnosci: true,
};

/** Stan na start nowej gry: pierwszy dzień (R0) od ticku 0, nic zaliczonego. Każde wywołanie daje osobny obiekt. */
export const nowyStanSciezki = (): StanSciezki => ({
  v: 1,
  rozdzial: 'r0',
  od: 0,
  start: { uchwaly: 0, raporty: 0, ludnosc: 0, lup: 0, spotkania: 0, kamienLudnosci: 0 },
  zrobione: {},
  przepadle: [],
  ui: {},
});

const jestObiektem = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const jestLiczba = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** obiekt, którego wszystkie wartości są liczbami skończonymi (JSON nie przenosi NaN ani nieskończoności) */
const mapaLiczb = (x: unknown): boolean => jestObiektem(x) && Object.values(x).every(jestLiczba);
const naLiscie = (lista: readonly string[], x: unknown): boolean => typeof x === 'string' && lista.includes(x);

/** Czy to stan ścieżki w poprawnym kształcie: wersja 1, rozdział z listy, liczby skończone, `zrobione` i `ui` jako
    mapy liczb, `przepadle` jako lista tekstów, okazja pusta albo z kluczem z listy i tickiem. Pola dopisane przez
    nowszą wersję nie przeszkadzają. Czyta tylko kształt, niczego nie poprawia. */
export function jestStanSciezki(x: unknown): x is StanSciezki {
  if (!jestObiektem(x) || x.v !== 1 || !naLiscie(KLUCZE_ROZDZIALOW, x.rozdzial) || !jestLiczba(x.od)) return false;
  const start = x.start;
  if (!jestObiektem(start) || !Object.keys(LICZNIKI).every((k) => jestLiczba(start[k]))) return false;
  if (!mapaLiczb(x.zrobione) || !mapaLiczb(x.ui)) return false;
  if (!Array.isArray(x.przepadle) || !x.przepadle.every((k) => typeof k === 'string')) return false;
  const o = x.okazja;
  if (o === undefined) return true;
  return (
    jestObiektem(o) &&
    naLiscie(KLUCZE_OKAZJI, o.k) &&
    jestLiczba(o.od) &&
    (o.zabici === undefined || jestLiczba(o.zabici)) &&
    (o.cel === undefined || jestLiczba(o.cel))
  );
}

/** Głęboka kopia stanu tylko z polami, które stan zna: nic nie jest wspólne z wejściem, a pole dopisane przez nowszą
    wersję odpada. */
function kopia(s: StanSciezki): StanSciezki {
  const o = s.okazja;
  return {
    v: 1,
    rozdzial: s.rozdzial,
    od: s.od,
    start: {
      uchwaly: s.start.uchwaly,
      raporty: s.start.raporty,
      ludnosc: s.start.ludnosc,
      lup: s.start.lup,
      spotkania: s.start.spotkania,
      kamienLudnosci: s.start.kamienLudnosci,
    },
    zrobione: { ...s.zrobione },
    przepadle: [...s.przepadle],
    ui: { ...s.ui },
    ...(o
      ? {
          okazja: {
            k: o.k,
            od: o.od,
            ...(o.zabici !== undefined ? { zabici: o.zabici } : {}),
            ...(o.cel !== undefined ? { cel: o.cel } : {}),
          },
        }
      : {}),
  };
}

/** Liczniki do `StanSciezki.start` z odczytu gry w tej chwili: podpisane uchwały (bez cofniętych), raporty, ludność
    pod zarządem (`populacja`, ta sama liczba co `GovInput.ludnosc`), łup zabrany z miejsc z mapy miasta, spotkania
    z sąsiadami (`st.sasiedzi.nr`) i zaliczone kamienie drogi ludnościowej. Zarząd i pola opcjonalne mogą nie istnieć
    (gra bez mapy miasta, dróg albo sąsiadów): wtedy zero. */
export function licznikiStartu(st: SimState, gov: GovState | null): StanSciezki['start'] {
  return {
    uchwaly: gov ? Object.values(gov.laws.signed).filter(Boolean).length : 0,
    raporty: gov?.reports.length ?? 0,
    ludnosc: populacja(st).razem,
    lup: Object.values(gov?.miasto?.zabrano ?? {}).reduce((suma, n) => suma + n, 0),
    spotkania: st.sasiedzi?.nr ?? 0,
    kamienLudnosci: gov?.zwyciestwo?.kamienie.ludnosc ?? 0,
  };
}

/** Stan ścieżki przy wczytaniu gry z `Save.cele`. Poprawne pole wraca jako kopia. Zły kształt albo brak pola (zapis
    sprzed ścieżki, pole zepsute, pole z innej wersji): bez raportu pierwszy dzień, a gdy zarząd ma już raport, drugi
    dzień (R1) otwarty w chwili wczytania, z licznikami z tej chwili. Cele, które stan gry już spełnia, zalicza dopiero
    krok ścieżki. */
export function stanZZapisu(raw: unknown, st: SimState, gov: GovState | null): StanSciezki {
  if (jestStanSciezki(raw)) return kopia(raw);
  if (!gov || gov.reports.length === 0) return nowyStanSciezki();
  return { ...nowyStanSciezki(), rozdzial: 'r1', od: st.tick, start: licznikiStartu(st, gov) };
}

/** Zdarzenie interfejsu (tick ostatniego): nowy stan, wejście nietknięte. */
export function zdarzenieUi(s: StanSciezki, k: ZdarzenieUi, tick: number): StanSciezki {
  const t = kopia(s);
  t.ui[k] = tick;
  return t;
}

/** Czy cel jest zaliczony. Liczy się obecność klucza, nie wartość (tick 0 to też zaliczenie), a klucze z prototypu
    obiektu ('constructor') nie udają zaliczeń. */
export const zaliczony = (s: StanSciezki, klucz: string): boolean => Object.hasOwn(s.zrobione, klucz);

/** Cel zaliczony w danym ticku: nowy stan, wejście nietknięte. Zaliczenie jest trwałe, więc cel zaliczony wcześniej
    zachowuje swój pierwszy tick (wynik to i tak nowy obiekt). */
export function zalicz(s: StanSciezki, klucz: string, tick: number): StanSciezki {
  const t = kopia(s);
  if (!zaliczony(s, klucz)) t.zrobione[klucz] = tick;
  return t;
}

/* ---------------------------------------------------------------- silnik rozdziałów */

/** Odczyt gry dla ścieżki: migawka z jednej chwili, z której liczą się warunki, teksty i podpowiedzi celów. Symulacja,
    zarząd i świat są tylko czytane. */
export interface OdczytCelow {
  st: SimState;
  w: World;
  /** odczyt dla interfejsu z tej samej chwili (`snapshot(st, w)`) */
  snap: SimSnapshot;
  /** stan zarządu; null: gra bez zarządu */
  gov: GovState | null;
  /** wejście zarządu z tej samej chwili (`govInput`); null: bez zarządu. Z niego cele czytają to, co liczy karta nocy
      (`paleniska`) albo ocena dróg do zwycięstwa */
  input: GovInput | null;
  touch: boolean;
  /** słowa miejsca po polsku i po angielsku (w domu komitet, furtka, dom) */
  words: Words;
  wordsEn: WordsEn;
  /** ktoś z zarządu jest zaznaczony w interfejsie; zaznaczenie dociera do symulacji dopiero z następnym krokiem (na pauzie
      wcale), a krok samouczka „zaznacz” ma być widać od razu */
  zaznaczony?: boolean;
}

/** okno, które zasłania okienko celów i dostaje linię „Cel: …”, gdy bieżący cel dotyczy tego okna */
export type OknoCelu = 'karta' | 'uchwala' | 'tablica' | 'spotkanie';

/** Definicja celu. `jest`: cel istnieje w tej grze (tryb, mapa); bez niego (fałsz) nie wchodzi do listy i nie blokuje
    rozdziału. `zrobiony`: warunek zaliczenia (silnik zapisuje zaliczenie na stałe). `czeka`: dopisek, gdy celu teraz nie
    da się ruszyć („czeka do 20:00”), inaczej null. `przepadl`: termin minął (tylko cele jednej nocy). Teksty w bieżącym
    języku (`L()`), nigdy z modułu na poziomie importu. */
export interface DefCelu {
  key: string;
  jest?(o: OdczytCelow): boolean;
  tekst(o: OdczytCelow): string;
  jak(o: OdczytCelow): string;
  zrobiony(o: OdczytCelow, s: StanSciezki): boolean;
  czeka?(o: OdczytCelow, s: StanSciezki): string | null;
  przepadl?(o: OdczytCelow, s: StanSciezki): boolean;
  okno?: OknoCelu;
}

/** Definicja rozdziału. `jest`: rozdział istnieje w tej grze (R3 tylko z modułem pracy); fałsz to pominięcie go.
    `otwiera`: własny warunek otwarcia, który zastępuje „poprzedni rozdział skończony” (R1 otwiera się po zamknięciu
    pierwszego raportu, choćby samouczek nie był skończony). */
export interface DefRozdzialu {
  k: KluczRozdzialu;
  tytul(o: OdczytCelow): string;
  jest?(o: OdczytCelow): boolean;
  otwiera?(o: OdczytCelow): boolean;
  cele: readonly DefCelu[];
}

/** Cel do narysowania. Przepadły cel to `done` i `missed` naraz (liczy się do licznika, ale jest skreślony bez ptaszka);
    `czeka` to dopisek celu, którego teraz nie da się ruszyć. */
export interface Cel {
  key: string;
  text: string;
  how: string;
  done: boolean;
  missed?: boolean;
  czeka?: string;
  okno?: OknoCelu;
}

/** Widok okienka celów (rysuje go `celeHtml`). `okazja` i `drogi` wypełniają kolejne zadania planu; `rozdzial` jest pusty
    po ostatnim rozdziale. `biezacy` to jeden z elementów `cele`. Tytuł okazji to pełny napis z „Teraz: …” / “Now: …”
    (nadaje go definicja okazji, okienko niczego nie dopisuje). `drogi` to wiersze dróg do zwycięstwa po ostatnim
    rozdziale: `nazwa` i `dalej` składają się w „{nazwa}: {dalej}”, `postep` to „{ile} z {cel}” albo null; pusta lista
    albo null znaczy: nic do pokazania, okienko się chowa. */
export interface WidokSciezki {
  okazja: { tytul: string; cele: Cel[]; biezacy: Cel | null } | null;
  rozdzial: { k: KluczRozdzialu; tytul: string; cele: Cel[]; biezacy: Cel | null } | null;
  drogi: { nazwa: string; dalej: string; postep: string | null }[] | null;
}

const kluczCelu = (r: KluczRozdzialu, c: Pick<DefCelu, 'key'>): string => `${r}.${c.key}`;
const przepadly = (s: StanSciezki, klucz: string): boolean => s.przepadle.includes(klucz);

/** cele rozdziału, które istnieją w tej grze */
const celeGry = (d: DefRozdzialu, o: OdczytCelow): readonly DefCelu[] => d.cele.filter((c) => c.jest?.(o) !== false);

/** rozdział skończony: każdy jego cel jest zrobiony albo przepadł */
const skonczony = (d: DefRozdzialu, s: StanSciezki, o: OdczytCelow): boolean =>
  celeGry(d, o).every((c) => {
    const klucz = kluczCelu(d.k, c);
    return zaliczony(s, klucz) || przepadly(s, klucz);
  });

/** Numer ostatniego rozdziału z `rozdzialy`, w którym coś już rozstrzygnięto (wpis w `zrobione` albo `przepadle` z kluczem
    tego rozdziału), albo −1. Wpisy okazji ('o2.wymiana') i rozdziałów bez definicji się nie liczą. Po tym numerze widać, do
    którego rozdziału doszła wersja, która zapisała stan. */
const ostatniRozstrzygniety = (s: StanSciezki, rozdzialy: readonly DefRozdzialu[]): number => {
  const wpisy = [...Object.keys(s.zrobione), ...s.przepadle];
  for (let k = rozdzialy.length - 1; k >= 0; k--) if (wpisy.some((w) => w.startsWith(`${rozdzialy[k].k}.`))) return k;
  return -1;
};

/** Krok ścieżki: nowy stan z odczytu gry (wejście i odczyt zostają nietknięte). Zalicza cele otwartego rozdziału, których
    warunek jest prawdziwy, i oznacza przepadłe (zaliczenie wygrywa z terminem, a rozstrzygnięty cel nie zmienia się już
    nigdy). Gdy rozdział jest skończony, otwiera następny: zapisuje tick otwarcia i liczniki `start` z tej chwili, a cele
    nowego rozdziału, które gra już spełnia, zalicza od razu, w tym samym kroku (może to zamknąć i ten rozdział). Rozdział
    z `otwiera` otwiera się po swoim warunku, choćby poprzedni nie był skończony. Po ostatnim rozdziale stan to „koniec”;
    „koniec” zapisany przez wersję, która nie znała późniejszych rozdziałów (zapis po R1, zanim doszło R2), otwiera w tym
    kroku pierwszy rozdział po ostatnim rozstrzygniętym, od chwili kroku, i ścieżka rusza dalej jak zwykle (zob.
    `ostatniRozstrzygniety`). Stan z rozdziałem, którego nie ma wśród definicji, zostaje bez zmian. `rozdzialy` pozwala
    podstawić inne definicje (testy zasad); w grze zawsze `ROZDZIALY`. */
export function krokSciezki(
  s: StanSciezki,
  o: OdczytCelow,
  rozdzialy: readonly DefRozdzialu[] = ROZDZIALY,
): StanSciezki {
  const t = kopia(s);
  const tick = o.st.tick;
  // „koniec” zapisany, zanim dopisano późniejsze rozdziały (serwer testowy po R1 miał go bez R2): ścieżka rusza od
  // pierwszego rozdziału po ostatnim rozstrzygniętym, który istnieje w tej grze. Bez żadnego wpisu (stan ustawiony ręcznie
  // do zrzutu) i po ostatnim rozdziale „koniec” zostaje
  if (t.rozdzial === 'koniec') {
    const ostatni = ostatniRozstrzygniety(t, rozdzialy);
    const dalej = ostatni < 0 ? undefined : rozdzialy.slice(ostatni + 1).find((n) => n.jest?.(o) !== false);
    if (dalej && (dalej.otwiera ? dalej.otwiera(o) : true)) {
      t.rozdzial = dalej.k;
      t.od = tick;
      t.start = licznikiStartu(o.st, o.gov);
    }
  }
  // każdy obieg zostawia otwarty późniejszy rozdział niż poprzedni, więc kończy się najwyżej po jednym na rozdział
  for (let obieg = 0; obieg <= rozdzialy.length; obieg++) {
    const k = rozdzialy.findIndex((d) => d.k === t.rozdzial);
    if (k < 0) break;
    const d = rozdzialy[k];
    for (const c of celeGry(d, o)) {
      const klucz = kluczCelu(d.k, c);
      if (zaliczony(t, klucz) || przepadly(t, klucz)) continue;
      if (c.zrobiony(o, t)) t.zrobione[klucz] = tick;
      else if (c.przepadl?.(o, t)) t.przepadle.push(klucz);
    }
    const nastepny = rozdzialy.slice(k + 1).find((n) => n.jest?.(o) !== false);
    if (!nastepny) {
      if (skonczony(d, t, o)) t.rozdzial = 'koniec';
      break;
    }
    if (!(nastepny.otwiera ? nastepny.otwiera(o) : skonczony(d, t, o))) break;
    t.rozdzial = nastepny.k;
    t.od = tick;
    t.start = licznikiStartu(o.st, o.gov);
  }
  return t;
}

/** Widok okienka celów ze stanu ścieżki po kroku: tytuł rozdziału, jego cele (tekst, podpowiedź, ptaszek albo skreślenie,
    dopisek „czeka”, okno) i bieżący cel, czyli pierwszy niezrobiony, który nie czeka. Niczego nie zalicza. */
export function widokSciezki(
  s: StanSciezki,
  o: OdczytCelow,
  rozdzialy: readonly DefRozdzialu[] = ROZDZIALY,
): WidokSciezki {
  const d = rozdzialy.find((r) => r.k === s.rozdzial);
  if (!d) return { okazja: null, rozdzial: null, drogi: null };
  const cele: Cel[] = celeGry(d, o).map((c) => {
    const klucz = kluczCelu(d.k, c);
    const zrobiony = zaliczony(s, klucz);
    const missed = !zrobiony && przepadly(s, klucz);
    const done = zrobiony || missed;
    const czeka = done ? null : (c.czeka?.(o, s) ?? null);
    return {
      key: c.key,
      text: c.tekst(o),
      how: c.jak(o),
      done,
      ...(missed ? { missed } : {}),
      ...(czeka ? { czeka } : {}),
      ...(c.okno ? { okno: c.okno } : {}),
    };
  });
  const biezacy = cele.find((c) => !c.done && !c.czeka) ?? null;
  return { okazja: null, rozdzial: { k: d.k, tytul: d.tytul(o), cele, biezacy }, drogi: null };
}

/* ---------------------------------------------------------------- okienko celów (HTML) i linia celu w oknach */

/** Opcje rysowania okienka: `otwarte` to okienko rozwinięte (cała lista), inaczej zwinięte do jednego bieżącego celu;
    `touch` to ekran dotykowy (przycisk nagłówka mówi „Stuknij” zamiast „Kliknij”). */
export type OpcjeOkienka = { otwarte: boolean; touch: boolean };

/** Napis na nagłówku-przycisku: nagłówek zwija i rozwija okienko, na telefonie i na komputerze tak samo. */
const podpowiedzNaglowka = (o: OpcjeOkienka): string =>
  L(
    `${o.touch ? 'Stuknij' : 'Kliknij'}, żeby ${o.otwarte ? 'zwinąć' : 'rozwinąć'} listę`,
    `${o.touch ? 'Tap' : 'Click'} to ${o.otwarte ? 'collapse' : 'expand'} the list`,
  );

/** Nagłówek okienka albo bloku okazji: przycisk z tytułem i (rozdział) licznikiem zrobionych celów. */
const naglowekHtml = (tytul: string, licznik: string, o: OpcjeOkienka): string =>
  `<button type="button" class="goals-head" aria-expanded="${o.otwarte}" title="${esc(podpowiedzNaglowka(o))}"><span>${esc(tytul)}</span>${licznik}</button>`;

/** Jeden cel listy. Klasa mówi, czym jest: zrobiony (ptaszek, przekreślony), przepadły (krzyżyk, przekreślony), bieżący
    (z podpowiedzią) albo czekający (przyciemniony, z dopiskiem „czeka do …”); zwykły niezrobiony nie ma klasy. */
function celHtml(c: Cel, n: number, biezacy: Cel | null): string {
  const bie = !!biezacy && c.key === biezacy.key;
  const klasa = c.missed ? ' missed' : c.done ? ' done' : bie ? ' now' : c.czeka ? ' czeka' : '';
  const jak = bie ? `<small class="goal-how">${esc(c.how)}</small>` : '';
  const dopisek = c.czeka && !c.done ? `<small class="goal-czeka">${esc(c.czeka)}</small>` : '';
  return `<li class="goal${klasa}" data-key="${esc(c.key)}" data-n="${n}">${esc(c.text)}${jak}${dopisek}</li>`;
}

/** Lista celów rozdziału albo okazji. Zwinięta pokazuje tylko bieżący cel, a gdy go nie ma (reszta czeka), pierwszy
    czekający, żeby było widać, na co się czeka. Numer (`data-n`) to miejsce na pełnej liście. Pusta lista to brak tekstu. */
function listaCelow(cele: readonly Cel[], biezacy: Cel | null, otwarte: boolean, blok: 'okazja' | 'rozdzial'): string {
  const pokaz = otwarte ? null : (biezacy ?? cele.find((c) => !c.done && c.czeka) ?? null);
  const wiersze = cele
    .map((c, k) => (otwarte || (pokaz && c.key === pokaz.key) ? celHtml(c, k + 1, biezacy) : ''))
    .join('');
  return wiersze ? `<ol class="goal-list" data-blok="${blok}">${wiersze}</ol>` : '';
}

/** Widok dróg do zwycięstwa po ostatnim rozdziale: wiersze „{nazwa}: {dalej}” z postępem; pierwszy jest bieżący. */
function drogiHtml(drogi: readonly { nazwa: string; dalej: string; postep: string | null }[], o: OpcjeOkienka): string {
  const wiersze = (o.otwarte ? drogi : drogi.slice(0, 1))
    .map(
      (d, k) =>
        `<li class="goal${k === 0 ? ' now' : ''}" data-n="${k + 1}">${esc(`${d.nazwa}: ${d.dalej}`)}${
          d.postep ? `<small class="goal-postep">${esc(d.postep)}</small>` : ''
        }</li>`,
    )
    .join('');
  return `${naglowekHtml(L('Drogi do zwycięstwa', 'Roads to victory'), '', o)}<ol class="goal-list" data-blok="drogi">${wiersze}</ol>`;
}

/** Okienko celów (wnętrze `#goals`) z widoku ścieżki; pusty napis, gdy nie ma czego pokazać (okienko się chowa).
    Rozwinięte: blok okazji (tytuł „Teraz: …” i jej cele z podpowiedzią bieżącego) nad rozdziałem (nagłówek z tytułem
    i licznikiem, lista, podpowiedź pod bieżącym celem); po ostatnim rozdziale zamiast niego drogi do zwycięstwa.
    Zwinięte: jeden bieżący cel, okazji, a bez niej rozdziału; okazja bez bieżącego celu nie zasłania rozdziału. Cel
    czekający ma klasę `czeka` i dopisek, przepadły jest skreślony i liczy się jak zrobiony. Wszystkie teksty i atrybuty
    z widoku idą przez ucieczkę HTML; napisy samego okienka (podpowiedź nagłówka, „Drogi do zwycięstwa”) są w bieżącym
    języku. Czysta funkcja: stan okienka (rozwinięte albo zwinięte, ekran dotykowy) dostaje z zewnątrz. */
export function celeHtml(v: WidokSciezki, o: OpcjeOkienka): string {
  const okazja = v.okazja;
  // zwinięte okienko z okazją pokazuje samą okazję, ale tylko dopóki ma bieżący cel
  const naOkazji = !!okazja && (o.otwarte || okazja.biezacy !== null);
  const blokOkazji =
    okazja && naOkazji
      ? `<div class="goals-okazja">${naglowekHtml(okazja.tytul, '', o)}${listaCelow(okazja.cele, okazja.biezacy, o.otwarte, 'okazja')}</div>`
      : '';
  if (!o.otwarte && naOkazji) return blokOkazji;
  const r = v.rozdzial;
  if (r) {
    const licznik = `<b class="goals-n">${r.cele.filter((c) => c.done).length}/${r.cele.length}</b>`;
    return `${blokOkazji}${naglowekHtml(r.tytul, licznik, o)}${listaCelow(r.cele, r.biezacy, o.otwarte, 'rozdzial')}`;
  }
  if (v.drogi?.length) return `${blokOkazji}${drogiHtml(v.drogi, o)}`;
  return blokOkazji;
}

/** Tekst celu do linii „Cel: …” okna, które zasłania okienko celów (karta nocy, uchwała, tablica badań, spotkanie
    z sąsiadami), albo null, gdy żaden cel nie dotyczy tego okna. Bierze pierwszy niezrobiony cel z `okno` równym oknu,
    najpierw z okazji, potem z rozdziału: gdy bieżący cel dotyczy okna, to on, a gdy bieżący cel jest inny albo nie da
    się go ruszyć w tym oknie (drewno na noc przy karcie z za małym zapasem), cel okna, który da się ruszyć (dyżur przy
    kozie). Cel zrobiony, przepadły i czekający linii nie daje. */
export function celWOknie(v: WidokSciezki, okno: OknoCelu): string | null {
  const cele = [...(v.okazja?.cele ?? []), ...(v.rozdzial?.cele ?? [])];
  return cele.find((c) => c.okno === okno && !c.done && !c.czeka)?.text ?? null;
}
