/* Stan ścieżki celów w zapisie interfejsu (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „Stan i zapis”).
   Ścieżka prowadzi gracza przez rozdziały R0–R8 i okazje O1–O7. Ten moduł trzyma jej stan, czyli to, co nie wynika ze
   stanu gry: który rozdział jest otwarty i od kiedy, liczniki z chwili otwarcia, cele zaliczone i przepadłe, zdarzenia
   samego interfejsu (lista ludzi, karty, ekran dróg) i otwartą okazję. Stan to zwykły JSON i leży tylko w zapisie
   interfejsu (`Save.cele`, src/ui/zapis.ts), nigdy w symulacji ani w zarządzie: ścieżka je tylko czyta, więc zasady
   stałego kroku jej nie dotyczą, a skróty botów się nie zmieniają. Zaliczenie celu jest trwałe i dlatego leży
   w zapisie: stan gry bywa chwilowy (koza zjada zapas drewna, który cel już zaliczył), a przeładowanie strony nie może
   go cofnąć.

   Kontrakt: wszystkie funkcje są czyste. Stan (i odczyt gry) na wejściu, nowy stan na wyjściu; wejście zostaje
   nietknięte, a wynik nie dzieli z nim żadnego obiektu (kopia, więc wynik wolno zmieniać bez skutku dla wejścia).
   Klucz zaliczonego celu to „rozdział.cel” albo „okazja.cel”: 'r0.drewno', 'r1.przeszukaj', 'o2.wymiana'. Zły kształt
   pola w zapisie to brak pola: `jestStanSciezki` sprawdza kształt (woła ją `readSave`, który takie pole zdejmuje,
   i `stanZZapisu`, który wtedy zaczyna od stanu na start). Silnik rozdziałów (definicje celów, krok i widok) dochodzi
   w następnym zadaniu planu. */

import type { GovState } from '../gov/typy.ts';
import type { SimState } from '../sim/sim.ts';
import { populacja } from '../sim/snapshot.ts';

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
