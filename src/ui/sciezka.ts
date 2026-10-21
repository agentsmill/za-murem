/* Ścieżka celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): stan w zapisie interfejsu, silnik rozdziałów
   i rozdziały R0 (pierwszy dzień) i R1 (drugi dzień). Dalsze rozdziały i okazje dochodzą w kolejnych zadaniach planu.

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
   rozdziale stan to „koniec”. Cel, który wygrał z terminem w tym samym kroku, jest zaliczony; cel przepadły nie wraca.
   Zaliczenie jest trwałe, przepadnięcie też. `widokSciezki(stan, odczyt)` robi z zapisanego stanu to, co rysuje okienko
   (tytuł, cele z tekstem, podpowiedzią, dopiskiem „czeka” i znacznikiem przepadnięcia, bieżący cel); niczego nie
   zalicza, więc przed nim woła się krok. Odczyt jest migawką z jednej chwili: kto zmienia stan gry, buduje nowy.

   Kontrakt: wszystkie funkcje są czyste. Stan (i odczyt gry) na wejściu, nowy stan na wyjściu; wejście zostaje
   nietknięte, a wynik nie dzieli z nim żadnego obiektu (kopia, więc wynik wolno zmieniać bez skutku dla wejścia).
   Klucz zaliczonego celu to „rozdział.cel” albo „okazja.cel”: 'r0.drewno', 'r1.przeszukaj', 'o2.wymiana'. Zły kształt
   pola w zapisie to brak pola: `jestStanSciezki` sprawdza kształt (woła ją `readSave`, który takie pole zdejmuje,
   i `stanZZapisu`, który wtedy zaczyna od stanu na start).

   R0 to `goalsOf` (src/ui/cele.ts) opakowany w rozdział: te same teksty, te same zaliczenia, a drewno na wieczór trzyma
   stan ścieżki. R1 to cele drugiego dnia: przeszukać, postawić pierwszą budowlę, wzmocnić obwód (w trybie zombie zrobić
   dzidę), zebrać drewno na całą noc i dać komuś dyżur przy kozie. Dwa ostatnie mają termin i rozstrzyga je karta nocy:
   drewno liczy się z karty (`gov.night.card.wood`, a przed kartą z tą samą potrzebą, którą karta pokaże o 20:00),
   dyżur z przydziału `warta:koza` po zatwierdzeniu karty. Liczą się tylko karty, które powstały po otwarciu rozdziału
   (plan nocy z tego samego dnia, ale sprzed wczytania gry, czeka na następną noc). */

import { L } from '../core/jezyk.ts';
import type { Words, WordsEn } from '../gov/miejsce.ts';
import { CARD_HOUR, KOZA_KEY, MORNING, WOOD_PER_HOUR } from '../gov/noc.ts';
import type { GovInput, GovState, NightPlan } from '../gov/typy.ts';
import { atHour } from '../gov/wspolne.ts';
import { START_KIT } from '../sim/bron.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS } from '../sim/budowle.ts';
import { minutesAt } from '../sim/clock.ts';
import { PATCH_COST, type SimState, SPEAR_BOARDS, SPEAR_SCRAP } from '../sim/sim.ts';
import { populacja, type SimSnapshot } from '../sim/snapshot.ts';
import { TUT_STEPS } from '../sim/tutorial.ts';
import type { World } from '../world/world.ts';
import { costText } from './budowa.ts';
import { type Goal, goalsOf, NIGHT_WOOD, najtanszeBudowle, zombieMode } from './cele.ts';
import { manyEn, num } from './tekst.ts';

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

/** Widok okienka celów. `okazja` i `drogi` dochodzą w kolejnych zadaniach planu; `rozdzial` jest pusty po ostatnim
    rozdziale (okienko się chowa). `biezacy` to jeden z elementów `cele`. */
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

/** Krok ścieżki: nowy stan z odczytu gry (wejście i odczyt zostają nietknięte). Zalicza cele otwartego rozdziału, których
    warunek jest prawdziwy, i oznacza przepadłe (zaliczenie wygrywa z terminem, a rozstrzygnięty cel nie zmienia się już
    nigdy). Gdy rozdział jest skończony, otwiera następny: zapisuje tick otwarcia i liczniki `start` z tej chwili, a cele
    nowego rozdziału, które gra już spełnia, zalicza od razu, w tym samym kroku (może to zamknąć i ten rozdział). Rozdział
    z `otwiera` otwiera się po swoim warunku, choćby poprzedni nie był skończony. Po ostatnim rozdziale stan to „koniec”.
    Stan z rozdziałem, którego nie ma wśród definicji, zostaje bez zmian. `rozdzialy` pozwala podstawić inne definicje
    (testy zasad); w grze zawsze `ROZDZIALY`. */
export function krokSciezki(
  s: StanSciezki,
  o: OdczytCelow,
  rozdzialy: readonly DefRozdzialu[] = ROZDZIALY,
): StanSciezki {
  const t = kopia(s);
  const tick = o.st.tick;
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

/* ---------------------------------------------------------------- R0. Pierwszy dzień */

/** zapas drewna jak w oknie celów od zawsze: skład, luzem i w rękach (bez drewna w ogniu) */
const zapasDrewna = (o: OdczytCelow): number =>
  o.snap.stock.woodSklad + o.snap.stock.woodLoose + o.snap.stock.woodCarried;

/** Cele pierwszego dnia z `goalsOf` (src/ui/cele.ts) dla tego odczytu. Zaliczenie drewna rozstrzyga stan ścieżki, nie
    ta lista, więc `woodReady` nie jest tu potrzebne: teksty i kroki samouczka od niego nie zależą. */
const r0Lista = (o: OdczytCelow): Goal[] =>
  goalsOf(o.st, o.gov, {
    touch: o.touch,
    kitchen: o.snap.kitchen,
    hour: o.snap.hour,
    ...(o.zaznaczony !== undefined ? { selected: o.zaznaczony } : {}),
    wood: zapasDrewna(o),
    words: o.words,
    wordsEn: o.wordsEn,
    w: o.w,
  });

const r0Cel = (o: OdczytCelow, key: Goal['key']): Goal =>
  r0Lista(o).find((g) => g.key === key) ?? { key, text: '', how: '', done: false };

/** po pierwszej nocy albo po zatwierdzeniu karty nocy: termin drewna na wieczór minął */
const poTerminieWieczoru = (o: OdczytCelow): boolean => (o.gov?.reports.length ?? 0) > 0 || !!o.gov?.night?.confirmed;

const R0: DefRozdzialu = {
  k: 'r0',
  tytul: () => L('Pierwszy dzień', 'Day one'),
  cele: [
    ...TUT_STEPS.map(
      (key): DefCelu => ({
        key,
        jest: (o) => o.st.tut.step >= 0,
        tekst: (o) => r0Cel(o, key).text,
        jak: (o) => r0Cel(o, key).how,
        zrobiony: (o) => r0Cel(o, key).done,
      }),
    ),
    {
      key: 'drewno',
      jest: (o) => o.st.tut.step >= 0,
      tekst: (o) => r0Cel(o, 'drewno').text,
      jak: (o) => r0Cel(o, 'drewno').how,
      // zapas raz zaliczony zostaje zaliczony (koza zje drewno do wieczora); po terminie zaliczyć się już nie da
      zrobiony: (o) => !poTerminieWieczoru(o) && o.st.tut.step >= TUT_STEPS.length && zapasDrewna(o) >= NIGHT_WOOD,
      przepadl: poTerminieWieczoru,
    },
    {
      key: 'noc',
      tekst: (o) => r0Cel(o, 'noc').text,
      jak: (o) => r0Cel(o, 'noc').how,
      zrobiony: (o) => (o.gov?.reports.length ?? 0) > 0,
    },
  ],
};

/* ---------------------------------------------------------------- R1. Drugi dzień */

/** Drewno na całą noc przy dyżurze, jak liczy je karta nocy o 20:00 (`nightWood` w src/gov/noc.ts): WOOD_PER_HOUR na
    godzinę razy 10 godzin od CARD_HOUR do MORNING razy liczba palenisk (`GovInput.paleniska`, bez pola jedno). Ta sama
    liczba stoi w podpowiedzi celu przed kartą, a karta pokaże ją o 20:00. */
export const potrzebaDrewna = (i: Pick<GovInput, 'paleniska'> | null): number =>
  Math.ceil(((MORNING - CARD_HOUR + 24) % 24) * WOOD_PER_HOUR * (i?.paleniska ?? 1));

/** po zamknięciu pierwszego raportu: raport jest, a okno raportu już nie */
const poPierwszymRaporcie = (o: OdczytCelow): boolean => !!o.gov && o.gov.reports.length >= 1 && !o.gov.report;

/** Plan nocy (karta), który powstał po otwarciu rozdziału. Karta powstaje o CARD_HOUR dnia `plan.day`, więc liczy się, jeśli
    ta godzina nie jest wcześniejsza niż chwila otwarcia rozdziału. Plan sprzed otwarcia (gra wczytana po zatwierdzeniu
    karty) czeka na następną noc. Plan bez dnia (atrapa) się nie liczy. */
const kartaPoOtwarciu = (o: OdczytCelow, s: StanSciezki): NightPlan | null => {
  const n = o.gov?.night;
  return n && atHour(n.day, CARD_HOUR) >= minutesAt(s.od) ? n : null;
};

/** karta nocy z tej nocy ma w przydziałach dyżur przy kozie */
const maDyzur = (n: NightPlan): boolean => Object.values(n.assign ?? {}).includes(KOZA_KEY);

/** „Budowa (przycisk u góry albo B)”; na dotyku sam przycisk */
const przyciskBudowy = (touch: boolean): string =>
  touch
    ? L('Przycisk Budowa u góry', 'The Build button at the top')
    : L('Budowa (przycisk u góry albo B)', 'Build (button at the top, or B)');

function budowlaJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  const b = przyciskBudowy(touch);
  // dwie budowle, które biorą najmniej materiału spośród tych, które da się postawić (koszty stroi bot, więc nie wpisuję
  // ich na sztywno)
  const kinds = najtanszeBudowle(o.st);
  const tanie = kinds.map((k) => `${L(BUILDS[k].name.toLowerCase(), BUILDS_EN[k].the)} (${costText(BUILDS[k].cost)})`);
  // dopiski: zasieki liczą się też do celu obwodu (którego w zombie nie ma), a w domu jednorodzinnym deski i złom mają
  // też sąsiednie domy
  const obok = (x: Words['szukanie']['obok'] | WordsEn['szukanie']['obok']): string =>
    x ? (touch ? x.dotyk : x.mysz) : '';
  const dopisek = (...zdania: string[]): string =>
    zdania
      .filter(Boolean)
      .map((z) => ` ${z}`)
      .join('');
  const zasieki = !zombieMode(o.st, o.gov) && kinds.includes('zasieki');
  return L(
    `${b}: dowolna budowla. Najmniej materiału biorą ${tanie.join(' i ')}. ${w.Zarzad} sam przyniesie materiały i zbuduje. Materiał daje przeszukiwanie i rozbiórka.${dopisek(
      zasieki ? 'Zasieki liczą się też do obwodu.' : '',
      obok(w.szukanie.obok),
    )}`,
    `${b}: any structure will do. The cheapest are ${tanie.join(' and ')}. ${e.Zarzad} will fetch the materials and do the building. Searching and taking things apart give you materials.${dopisek(
      zasieki ? 'A barricade also counts for the perimeter.' : '',
      obok(e.szukanie.obok),
    )}`,
  );
}

function obwodJak(o: OdczytCelow): string {
  const dziury = num(o.snap.fence.holes.length, 0);
  const zasieki = costText(BUILDS.zasieki.cost);
  const b = o.touch ? L('Przycisk Budowa u góry', 'The Build button at the top') : L('Budowa', 'Build');
  return L(
    `${b}, zakładka Obwód: ${BUILDS.zasieki.name} w miejscu odcinka siatki (${zasieki}) albo łatanie: ${
      o.touch ? 'przytrzymajcie palec na dziurze' : 'prawy przycisk na dziurze'
    }, „Załatać dziurę” (${PATCH_COST} deski albo ${PATCH_COST} złomu na łatę). Otwartych dziur: ${dziury}.`,
    `${b}, Perimeter tab: a ${BUILDS_EN.zasieki.name.toLowerCase()} in place of a stretch of fence (${zasieki}), or patch the holes: ${
      o.touch ? 'press and hold on a hole' : 'right-click a hole'
    }, “Patch the hole” (${PATCH_COST} planks or ${PATCH_COST} scrap a patch). Open holes: ${dziury}.`,
  );
}

/** dzidy w rękach zarządu i w magazynie oraz tyle, ile było ich na starcie trybu zombie */
const dzidy = (o: OdczytCelow): { sa: number; start: number } => ({
  sa:
    o.st.pawns.filter((p) => p.kind === 'core' && p.weapon === 'dzida').length +
    (o.st.store.arms ?? []).filter((x) => x === 'dzida').length,
  start: [...START_KIT.zombie.core, ...START_KIT.zombie.store].filter((x) => x === 'dzida').length,
});

function dzidaJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  return L(
    `${touch ? 'Przytrzymajcie palec na stercie desek albo złomu' : 'Prawy przycisk na stercie desek albo złomu'}: „Zrobić dzidę” (${SPEAR_BOARDS} deski i ${SPEAR_SCRAP} złom). Dzida sięga szwendaczy przez siatkę. Deski i złom dają przeszukiwanie ${w.szukanie.d} i rozbiórka.`,
    `${touch ? 'Press and hold on a pile of planks or scrap' : 'Right-click a pile of planks or scrap'}: “Make a spear” (${manyEn(SPEAR_BOARDS, 'plank', 'planks')} and ${SPEAR_SCRAP} scrap). A spear reaches shamblers through the fence. Planks and scrap come from searching ${e.szukanie.d} and taking things apart.`,
  );
}

function drewnoNaNocJak(o: OdczytCelow): string {
  const { words: w, wordsEn: e, touch } = o;
  const mam = num(Math.floor(o.snap.stock.wood), 0);
  const trzeba = num(potrzebaDrewna(o.input), 0);
  if (zombieMode(o.st, o.gov))
    return L(
      `Drewna ${mam} z ${trzeba}, razem z tym w kozie. Za siatką są szwendacze: spalcie meble ${w.szukanie.w} („Spalić …”) albo idźcie po drzewo za dnia z dzidą, kiedy pod siatką jest pusto.`,
      `Wood: ${mam} of ${trzeba}, counting what’s in the stove. There are shamblers outside the fence: burn furniture ${e.szukanie.w} (“Burn the …”), or go for a tree by day with a spear when nobody is at the fence.`,
    );
  return L(
    `Drewna ${mam} z ${trzeba}, razem z tym w kozie: tyle zje noc od ${CARD_HOUR}:00 do ${MORNING}:00 przy dyżurze, sztuka na godzinę. ${
      touch ? 'Stuknijcie pień drzewa' : 'Prawy przycisk na drzewie: „Ściąć drzewo”'
    }; za dnia ${w.brama.m} stoi otwarta.`,
    `Wood: ${mam} of ${trzeba}, counting what’s in the stove: that’s what the night from ${CARD_HOUR}:00 to ${MORNING}:00 burns with a stove watch, one piece an hour. ${
      touch ? 'Tap the trunk of a tree' : 'Right-click a tree: “Chop down the tree”'
    }; ${e.brama} stays open by day.`,
  );
}

const R1: DefRozdzialu = {
  k: 'r1',
  tytul: () => L('Drugi dzień', 'Day two'),
  otwiera: poPierwszymRaporcie,
  cele: [
    {
      key: 'przeszukaj',
      tekst: (o) => L(`Przeszukajcie ${o.words.szukanie.b}.`, `Search ${o.wordsEn.szukanie.b}.`),
      jak: (o) =>
        o.touch
          ? L(o.words.szukanie.jak.dotyk, o.wordsEn.szukanie.jak.dotyk)
          : L(o.words.szukanie.jak.mysz, o.wordsEn.szukanie.jak.mysz),
      // co przeszukane, daje stan gry: mieszkania siedziby, a od fali 2 także pomieszczenia sąsiednich budynków
      zrobiony: (o) =>
        o.st.apts.some((a) => a.searched.length > 0) ||
        (o.st.sasiedzi?.budynki ?? []).some(
          (b) => b.przeszukane.length > 0 || b.mieszkania.some((m) => m.przeszukane.length > 0),
        ),
    },
    {
      key: 'budowla',
      tekst: () => L('Postawcie pierwszą budowlę.', 'Put up your first structure.'),
      jak: budowlaJak,
      zrobiony: (o) => o.st.things.some((t) => t.kind in BUILDS),
    },
    {
      key: 'obwod',
      // w trybie zombie siatka jest wzmocniona i bez dziur, a zasieki przed szwendaczami nie chronią lepiej niż ona:
      // zamiast obwodu dzida dla warty
      jest: (o) => !zombieMode(o.st, o.gov),
      tekst: () => L('Wzmocnijcie obwód.', 'Strengthen the perimeter.'),
      jak: obwodJak,
      zrobiony: (o) => o.st.things.some((t) => t.kind === 'zasieki') || o.snap.fence.holes.length === 0,
    },
    {
      key: 'dzida',
      jest: (o) => zombieMode(o.st, o.gov),
      tekst: () => L('Zróbcie dzidę dla warty.', 'Make a spear for the watch.'),
      jak: dzidaJak,
      zrobiony: (o) => {
        const d = dzidy(o);
        return d.sa > d.start;
      },
    },
    {
      key: 'drewno2',
      tekst: () => L('Zbierzcie drewno na całą noc.', 'Get in enough wood for the whole night.'),
      jak: drewnoNaNocJak,
      // rozstrzyga karta nocy: zaliczony, gdy karta pokazuje zapas równy potrzebie, przepadł, gdy zatwierdzona bez niego
      zrobiony: (o, s) => {
        const wood = kartaPoOtwarciu(o, s)?.card?.wood;
        return !!wood && wood.have >= wood.need;
      },
      przepadl: (o, s) => !!kartaPoOtwarciu(o, s)?.confirmed,
    },
    {
      key: 'dyzur',
      tekst: () => L('Dajcie komuś dyżur przy kozie.', 'Put someone on stove watch.'),
      jak: () =>
        L(
          'Na karcie nocy o 20:00 wybierzcie przy jednej osobie „Czuwa przy kozie”. Bez dyżuru koza gaśnie, kiedy wszyscy zasną.',
          'On the Night orders at 20:00, pick “Watches the stove” for one person. Without a stove watch the fire goes out once everyone is asleep.',
        ),
      okno: 'karta',
      // czeka do karty nocy; zaliczony przy zatwierdzeniu karty z `warta:koza`, przepadł przy zatwierdzeniu bez niego
      czeka: (o, s) => (kartaPoOtwarciu(o, s) ? null : L(`czeka do ${CARD_HOUR}:00`, `waiting for ${CARD_HOUR}:00`)),
      zrobiony: (o, s) => {
        const n = kartaPoOtwarciu(o, s);
        return !!n?.confirmed && maDyzur(n);
      },
      przepadl: (o, s) => !!kartaPoOtwarciu(o, s)?.confirmed,
    },
  ],
};

/** Rozdziały głównej ścieżki po kolei; dalsze (R2–R8) dochodzą w kolejnych zadaniach planu. */
export const ROZDZIALY: readonly DefRozdzialu[] = [R0, R1];
