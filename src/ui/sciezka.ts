/* Ścieżka celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md): stan w zapisie interfejsu, silnik rozdziałów
   i okazji oraz HTML okienka celów i linia celu w oknach. Treść rozdziałów (definicje celów R0, R1 i dalszych, lista
   `ROZDZIALY`) leży w src/ui/sciezka-rozdzialy.ts, a okazji (lista `OKAZJE`) w src/ui/sciezka-okazje.ts, żeby ten plik nie
   rósł z każdym rozdziałem.

   Stan. Ścieżka prowadzi gracza przez rozdziały R0–R8 i okazje O1–O8. `StanSciezki` trzyma to, co nie wynika ze stanu gry:
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
   już zamknięty. Rozdział z `jest` fałszywym jest pomijany (R3 „Praca” istnieje tylko tam, gdzie gra ma rodzaje pracy
   w panelu Pracy; zapis sprzed R3 nie otwiera go wstecz), a po ostatnim rozdziale stan to „koniec”. „Koniec” zapisany,
   zanim dopisano późniejsze rozdziały (serwer testowy kończył ścieżkę na R1, zanim doszło R2), nie zostaje na zawsze:
   krok otwiera pierwszy rozdział po ostatnim rozstrzygniętym i ścieżka rusza dalej; bez żadnego wpisu (stan ustawiony
   ręcznie do zrzutu) „koniec” zostaje. Cel, który wygrał z terminem w tym samym kroku, jest zaliczony; cel przepadły
   nie wraca.
   Zapas. Cel rozdziału może mieć zapasowy warunek zaliczenia (`DefCelu.zapas`): gdy nic nie zależy od gracza (R4 „Przyjmijcie
   kogoś nowego” w trybie zombie, kiedy nikt nie poprosił o miejsce), cel zalicza się sam, ale tylko jeśli nie zrobił się zwykłą
   drogą w tym samym kroku. Silnik zapisuje takie zaliczenie w `StanSciezki.zapasem`, żeby dopisek pod celem wiedział, czemu cel
   zaliczył się sam, także po zapisie i wczytaniu. Zapas mierzy czas, który gracz widział (`OdczytCelow.ekran`, sekundy przy
   ekranie jak tempo kart zarządu), od chwili otwarcia rozdziału (`StanSciezki.odEkran`), a nie doby gry, bo przy szybszym tempie
   doby biegną szybciej niż karty.
   Zaliczenie jest trwałe, przepadnięcie też. `widokSciezki(stan, odczyt)` robi z zapisanego stanu to, co rysuje okienko
   (tytuł, cele z tekstem, podpowiedzią, dopiskiem „czeka” i znacznikiem przepadnięcia, bieżący cel); niczego nie
   zalicza, więc przed nim woła się krok. Tekst i podpowiedź celu dostają też stan ścieżki, żeby cel mógł nieść w tekście
   to, co było przy otwarciu rozdziału (zaliczony cel drogi ludnościowej mówi dalej o progu, który zaliczył). Po ostatnim
   rozdziale („koniec”) widok nie ma rozdziału, tylko wiersze dróg do zwycięstwa (`wierszeDrog` z
   src/ui/sciezka-rozdzialy.ts), o ile gra ma włączone drogi. Odczyt jest migawką z jednej chwili: kto zmienia stan gry,
   buduje nowy.

   Okazje. Okazja (`DefOkazji`) to krótki rozdział (1–3 cele) otwierany przez zdarzenie w grze: wędrowiec przy siatce
   (rozmowa, w zombie pytanie o rękę i zaproszenie), handlarz pod bramą, napad, stado pod siatką, ugryzienie w kończynę,
   zwłoki, które wstaną, obca ekipa przy aucie i od 20.10.2026 „Zima idzie” (dni 8–13 każdego roku). Stoi nad rozdziałem
   w okienku, dopóki zdarzenie trwa, i zamyka się sama, kiedy zdarzenie mija albo wszystkie jej cele są zrobione. Cele
   okazji nie mają terminu: niezrobiony czeka na następne takie zdarzenie, zrobiony nie wraca, a okazja bez
   niezrobionych celów w ogóle się nie otwiera. Otwarta jest
   najwyżej jedna, w kolejności z `OKAZJE` (życie przed gośćmi: O5, O6, O4, O3, O8, O2, O1, O7): ważniejsza wypiera
   otwartą, a wyparta wraca ze świeżym stanem, gdy ważniejsza się skończy. Okazje ruszają dopiero po krokach samouczka.
   `krokOkazji` robi to w każdym kroku ścieżki, po rozdziałach; zaliczenia liczy przed zamknięciem, na tym samym
   odczycie, więc zdarzenie, które mija razem ze skutkiem celu (udana amputacja, dobite zwłoki), cel zalicza. Stan
   okazji w `StanSciezki.okazja` niesie klucz, tick otwarcia, licznik zabitych z chwili otwarcia (do celu stada) i id
   pionka albo rzeczy, której dotyczy (ugryziony, zwłoki, wędrowiec, handlarz). Tytuł okazji sam niesie
   „Teraz: …” / “Now: …”.

   Kontrakt: wszystkie funkcje są czyste. Stan (i odczyt gry) na wejściu, nowy stan na wyjściu; wejście zostaje
   nietknięte, a wynik nie dzieli z nim żadnego obiektu (kopia, więc wynik wolno zmieniać bez skutku dla wejścia).
   Klucz zaliczonego celu to „rozdział.cel” albo „okazja.cel”: 'r0.drewno', 'r1.przeszukaj', 'o2.wymiana'. Zły kształt
   pola w zapisie to brak pola: `jestStanSciezki` sprawdza kształt (woła ją `readSave`, który takie pole zdejmuje,
   i `stanZZapisu`, który wtedy zaczyna od stanu na start).

   Rozdziały i okazje. Co każdy cel mówi i kiedy się zalicza, opisują src/ui/sciezka-rozdzialy.ts (R0 to `goalsOf` z
   src/ui/cele.ts opakowany w rozdział, dalej R1 do R8) i src/ui/sciezka-okazje.ts. Silnik bierze stamtąd `ROZDZIALY`,
   `OKAZJE`, liczniki „od otwarcia” i wiersze dróg po ostatnim rozdziale.

   Okienko i okna. `celeHtml(widok, { otwarte, touch })` składa wnętrze okienka `#goals` z widoku ścieżki, bez DOM: blok
   okazji („Teraz: …”, jej cele, podpowiedź bieżącego) nad rozdziałem (nagłówek z licznikiem, lista, podpowiedź pod
   bieżącym, cel czekający przyciemniony z dopiskiem, przepadły skreślony), a po ostatnim rozdziale zamiast niego wiersze
   dróg do zwycięstwa. Zwinięte okienko (nagłówek zwija i rozwija je na telefonie i na komputerze, stan podaje main.ts)
   ma w HTML tylko bieżący cel okazji, a bez okazji bieżący cel rozdziału. `celWOknie(widok, okno)` daje tekst celu do
   linii „Cel: …” okna, które zasłania okienko (karta nocy, uchwała, tablica badań, spotkanie): bieżący cel, jeśli
   dotyczy okna, a inaczej pierwszy niezrobiony cel tego okna, który da się ruszyć (karta nocy z za małym zapasem
   drewna pokazuje dyżur przy kozie, choć bieżącym celem jest drewno; tablica badań w okazji zimy pokazuje cel kozy
   z beczki przed celem rozdziału). */

import { L } from '../core/jezyk.ts';
import type { Words, WordsEn } from '../gov/miejsce.ts';
import type { GovInput, GovState } from '../gov/typy.ts';
import type { SimState } from '../sim/sim.ts';
import type { SimSnapshot } from '../sim/snapshot.ts';
import { TUT_STEPS } from '../sim/tutorial.ts';
import type { World } from '../world/world.ts';
import { OKAZJE } from './sciezka-okazje.ts';
import {
  ludnoscPodZarzadem,
  lupZMiasta,
  pionkiLudzi,
  ROZDZIALY,
  uchwalyPodpisane,
  wierszeDrog,
} from './sciezka-rozdzialy.ts';
import { esc } from './tekst.ts';

/** rozdziały głównej ścieżki po kolei (R3 „Praca” tylko z panelem Pracy); „koniec”: po ostatnim rozdziale */
export const KLUCZE_ROZDZIALOW = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'koniec'] as const;
export type KluczRozdzialu = (typeof KLUCZE_ROZDZIALOW)[number];

/** okazje: krótkie rozdziały otwierane przez zdarzenie w grze (wędrowiec, handlarz, napad, stado, ugryzienie, zwłoki,
    obcy przy aucie, zima) */
export const KLUCZE_OKAZJI = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'] as const;
export type KluczOkazji = (typeof KLUCZE_OKAZJI)[number];

/** zdarzenia samego interfejsu, które nie zostawiają śladu w stanie gry: wybór z listy ludzi (klik albo Q i E), karta
    mieszkańca, karta cudzego budynku, ekran dróg do zwycięstwa */
export type ZdarzenieUi = 'lista' | 'mieszkaniec' | 'budynek' | 'drogi';

/** Liczniki z chwili otwarcia rozdziału (`StanSciezki.start`). Liczby to stan gry w tej chwili (cele „więcej niż przy
    otwarciu”). `osoby` i `zarzad` to numery pionków: wszyscy z zarządu i mieszkańców, i sami z zarządu, w chwili otwarcia.
    Z nich cel „Przyjmijcie kogoś nowego” (R4 `nowi`) widzi, kto doszedł albo awansował od otwarcia, choćby ktoś zginął
    w międzyczasie (ludność netto tego nie odróżnia). Zapis sprzed tych pól nie ma ich, a cel liczy wtedy ludność netto. */
export interface StartRozdzialu {
  uchwaly: number;
  raporty: number;
  ludnosc: number;
  lup: number;
  spotkania: number;
  kamienLudnosci: number;
  osoby?: number[];
  zarzad?: number[];
}

export interface StanSciezki {
  v: 1;
  /** bieżący rozdział głównej ścieżki i tick jego otwarcia */
  rozdzial: KluczRozdzialu;
  od: number;
  /** Sekunda przy ekranie otwarcia rozdziału (`OdczytCelow.ekran`, z ułamkiem): tempo kart idzie z czasu przy ekranie, a nie z doby
      gry, więc zapas celu „nowi” w zombie mierzy go od tej chwili. Pole od tej zmiany, w starym zapisie i w stanie ze świata
      bez licznika czasu go nie ma (zapas liczy wtedy doby gry od `od`). */
  odEkran?: number;
  /** liczniki z chwili otwarcia rozdziału do warunków „od otwarcia” */
  start: StartRozdzialu;
  /** zaliczone cele głównej ścieżki i okazji: klucz ('r1.przeszukaj', 'o2.wymiana') → tick zaliczenia */
  zrobione: Record<string, number>;
  /** cele, które przepadły (termin minął) */
  przepadle: string[];
  /** Cele rozdziałów zaliczone zapasem (`DefCelu.zapas`), nie czynnością gracza: klucze jak w `zrobione`. Pole powstaje przy
      pierwszym takim zaliczeniu; dopisek pod celem (`DefCelu.uwaga`) pyta o nie, żeby powiedzieć, czemu cel zaliczył się sam. */
  zapasem?: string[];
  /** zdarzenia interfejsu bez śladu w stanie gry: 'lista', 'mieszkaniec', 'budynek', 'drogi' → tick ostatniego */
  ui: Record<string, number>;
  /** otwarta okazja: klucz, tick otwarcia, licznik zabitych przy otwarciu, pionek albo rzecz, której dotyczy */
  okazja?: { k: KluczOkazji; od: number; zabici?: number; cel?: number };
}

/** liczniki z `StanSciezki.start`, które są liczbami (numery pionków `osoby` i `zarzad` sprawdza osobno
    `jestStanSciezki`); zapis typu `Record` pilnuje, żeby żaden nie wypadł z listy */
const LICZNIKI: Record<Exclude<keyof StartRozdzialu, 'osoby' | 'zarzad'>, true> = {
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
    mapy liczb, `przepadle` jako lista tekstów, okazja pusta albo z kluczem z listy i tickiem, a czas przy ekranie
    z otwarcia (`odEkran`) i cele zaliczone zapasem (`zapasem`), jeśli są, jako liczba i lista tekstów. Pola dopisane
    przez nowszą wersję nie przeszkadzają. Czyta tylko kształt, niczego nie poprawia. */
export function jestStanSciezki(x: unknown): x is StanSciezki {
  if (!jestObiektem(x) || x.v !== 1 || !naLiscie(KLUCZE_ROZDZIALOW, x.rozdzial) || !jestLiczba(x.od)) return false;
  const start = x.start;
  if (!jestObiektem(start) || !Object.keys(LICZNIKI).every((k) => jestLiczba(start[k]))) return false;
  // numery pionków z chwili otwarcia: pola z nowszej wersji stanu, więc zapis bez nich jest poprawny
  for (const k of ['osoby', 'zarzad'])
    if (start[k] !== undefined && !(Array.isArray(start[k]) && start[k].every(jestLiczba))) return false;
  if (!mapaLiczb(x.zrobione) || !mapaLiczb(x.ui)) return false;
  if (!Array.isArray(x.przepadle) || !x.przepadle.every((k) => typeof k === 'string')) return false;
  // czas przy ekranie z otwarcia i cele zaliczone zapasem: pola z nowszej wersji stanu, więc zapis bez nich jest poprawny
  if (x.odEkran !== undefined && !jestLiczba(x.odEkran)) return false;
  if (x.zapasem !== undefined && !(Array.isArray(x.zapasem) && x.zapasem.every((k) => typeof k === 'string')))
    return false;
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
    ...(s.odEkran !== undefined ? { odEkran: s.odEkran } : {}),
    start: {
      uchwaly: s.start.uchwaly,
      raporty: s.start.raporty,
      ludnosc: s.start.ludnosc,
      lup: s.start.lup,
      spotkania: s.start.spotkania,
      kamienLudnosci: s.start.kamienLudnosci,
      ...(s.start.osoby ? { osoby: [...s.start.osoby] } : {}),
      ...(s.start.zarzad ? { zarzad: [...s.start.zarzad] } : {}),
    },
    zrobione: { ...s.zrobione },
    przepadle: [...s.przepadle],
    ...(s.zapasem ? { zapasem: [...s.zapasem] } : {}),
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
    (gra bez mapy miasta, dróg albo sąsiadów): wtedy zero. Uchwały, ludność i łup liczą funkcje z
    src/ui/sciezka-rozdzialy.ts, te same, którymi warunki celów liczą stan z chwili sprawdzenia: porównanie „więcej niż
    przy otwarciu” ma po obu stronach to samo wyrażenie. Wyjątek to raporty: `raporty` to długość `gov.reports`, a ta lista ma
    sufit 10 wpisów (najstarszy wypada), więc od 11. nocy nie nadaje się do liczenia nowych raportów; cele rozpoznają raport
    po otwarciu po dniu nocy (`raportyPoOtwarciu` w src/ui/sciezka-rozdzialy.ts). */
export function licznikiStartu(st: SimState, gov: GovState | null): StanSciezki['start'] {
  return {
    uchwaly: uchwalyPodpisane(gov),
    raporty: gov?.reports.length ?? 0,
    ludnosc: ludnoscPodZarzadem(st),
    lup: lupZMiasta(gov),
    spotkania: st.sasiedzi?.nr ?? 0,
    kamienLudnosci: gov?.zwyciestwo?.kamienie.ludnosc ?? 0,
    ...pionkiLudzi(st),
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
  /** Sekundy przy ekranie od startu gry bez pauzy i z otwartymi oknami zarządu odliczonymi, z ułamkiem: ten sam czas, z którego
      zarząd odmierza tempo kart (`GovInput.screen` to jego część całkowita), ale bez liczenia wejścia zarządu. Bez pola
      (odczyt ręczny) cele, które mierzą czas przy ekranie, liczą doby gry. */
  ekran?: number;
  touch: boolean;
  /** słowa miejsca po polsku i po angielsku (w domu komitet, furtka, dom) */
  words: Words;
  wordsEn: WordsEn;
  /** gra ma okno mapy miasta (`mapaMiasta` w main.ts jest różne od null). Nie ma go z `?miasto=0` ani na osiedlu zapasowym
      bez położenia, choć stan miasta w zarządzie (`gov.miasto`) istnieje; cele, które potrzebują mapy, wtedy nie istnieją.
      Bez pola (testy) o mapie decyduje `gov.miasto`. */
  mapaMiasta?: boolean;
  /** ktoś z zarządu jest zaznaczony w interfejsie; zaznaczenie dociera do symulacji dopiero z następnym krokiem (na pauzie
      wcale), a krok samouczka „zaznacz” ma być widać od razu */
  zaznaczony?: boolean;
}

/** okno, które zasłania okienko celów i dostaje linię „Cel: …”, gdy bieżący cel dotyczy tego okna */
export type OknoCelu = 'karta' | 'uchwala' | 'tablica' | 'spotkanie';

/** Definicja celu. `jest`: cel istnieje w tej grze (tryb, mapa, stan gry); bez niego (fałsz) nie wchodzi do listy i nie
    blokuje rozdziału. Dostaje też stan ścieżki, żeby cel już zaliczony mógł zostać na liście, choć warunek istnienia przestał
    być prawdziwy (uchwała, gdy podpisano wszystkie, które da się podpisać). `zrobiony`: warunek zaliczenia (silnik zapisuje
    zaliczenie na stałe). `czeka`: dopisek, gdy celu teraz nie da się ruszyć („czeka do 20:00”), inaczej null. `przepadl`:
    termin minął (tylko cele jednej nocy). `tekst` i `jak` dostają też stan ścieżki, żeby cel, którego tekst zależy od gry
    (następny kamień drogi ludnościowej), mógł trzymać ten z chwili otwarcia rozdziału (`start`) i nie zmieniać go po
    zaliczeniu. Teksty w bieżącym języku (`L()`), nigdy z modułu na poziomie importu. */
export interface DefCelu {
  key: string;
  jest?(o: OdczytCelow, s: StanSciezki): boolean;
  tekst(o: OdczytCelow, s: StanSciezki): string;
  jak(o: OdczytCelow, s: StanSciezki): string;
  zrobiony(o: OdczytCelow, s: StanSciezki): boolean;
  czeka?(o: OdczytCelow, s: StanSciezki): string | null;
  /** Zapasowy warunek zaliczenia (tylko rozdziały): cel, którego gracz nie ma jak zrobić, bo nic od niego nie zależy (nikt nie
      poprosił o miejsce), zalicza się sam. Sprawdza się po `zrobiony`, który wygrywa, i przed `przepadl`; silnik zapisuje
      takie zaliczenie w `StanSciezki.zapasem`, żeby `uwaga` wiedziała, czemu cel zaliczył się sam. */
  zapas?(o: OdczytCelow, s: StanSciezki): boolean;
  /** dopisek celu już zaliczonego: czemu zaliczył się bez czynności gracza (zapas celu „nowi” w trybie zombie) albo czego uczy
      zaliczona obserwacja (lekcja po porannym raporcie w R4 „wkurzenie”), inaczej null */
  uwaga?(o: OdczytCelow, s: StanSciezki): string | null;
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

/** Definicja okazji (sekcja „Okazje” projektu). `k` to klucz ze stanu, a kolejność w `OKAZJE` to ważność: widać najwyżej
    jedną okazję, pierwszą z listy, której zdarzenie trwa (życie przed gośćmi), a niższe czekają; wyższa wypiera otwartą
    niższą, a niższa wraca ze świeżym stanem otwarcia, gdy wyższa się skończy. `tytul` niesie „Teraz: …” / “Now: …” sam,
    okienko niczego nie dopisuje. `trwa(o, s)`: zdarzenie trwa (stan `s` ma otwartą okazję z jej `cel`em i tickiem
    otwarcia); gdy zgaśnie, okazja się zamyka, ale cele zalicza się przed zamknięciem, na tym samym odczycie (ugryziony po
    udanej amputacji nie ma już ugryzienia, a jego cel jest zrobiony). `otwiera(o)`: wyzwalacz otwarcia, gdy ostrzejszy niż
    `trwa` (stado otwiera się od trzech napierających, ale trwa do ostatniego, żeby topniejące pod dzidami nie zgasło w
    połowie celu „zabijcie trzech”); bez niego okazja otwiera się, gdy `trwa` jest prawdziwe na stanie z kandydatem.
    `cel(o)`: id pionka albo rzeczy, której dotyczy okazja (ugryziony, zwłoki, wędrowiec, handlarz), brane przy otwarciu
    i trzymane w `StanSciezki.okazja.cel`; −1 znaczy: nie ma czego ratować, więc okazja się nie otwiera. `cele`: 1–3 cele;
    zrobiony cel nie wraca, niezrobiony czeka na następne takie zdarzenie, okazja bez niezrobionych celów w ogóle się nie
    otwiera, a żaden cel okazji nie przepada (nie mają terminu). */
export interface DefOkazji {
  k: KluczOkazji;
  tytul(o: OdczytCelow): string;
  otwiera?(o: OdczytCelow): boolean;
  trwa(o: OdczytCelow, s: StanSciezki): boolean;
  cel?(o: OdczytCelow): number;
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
  /** dopisek zaliczonego celu (czemu zaliczył się sam albo czego uczy); okienko rysuje go pod celem, bez przekreślenia */
  uwaga?: string;
  okno?: OknoCelu;
}

/** Widok okienka celów (rysuje go `celeHtml`). `okazja` to blok otwartej okazji (null, gdy żadna nie jest otwarta);
    `rozdzial` jest pusty po ostatnim rozdziale. `biezacy` to jeden z elementów `cele`. Tytuł okazji to pełny napis
    z „Teraz: …” / “Now: …” (nadaje go definicja okazji, okienko niczego nie dopisuje). `drogi` to wiersze dróg
    do zwycięstwa po ostatnim rozdziale (`wierszeDrog`): `nazwa` i `dalej` składają się w „{nazwa}: {dalej}”, `postep`
    to „{ile} z {cel}” albo null; pusta lista albo null znaczy: nic do pokazania, okienko się chowa. */
export interface WidokSciezki {
  okazja: { tytul: string; cele: Cel[]; biezacy: Cel | null } | null;
  rozdzial: { k: KluczRozdzialu; tytul: string; cele: Cel[]; biezacy: Cel | null } | null;
  drogi: { nazwa: string; dalej: string; postep: string | null }[] | null;
}

/** klucz zaliczonego celu: „rozdział.cel” ('r1.przeszukaj') albo „okazja.cel” ('o2.wymiana') */
const kluczCelu = (r: KluczRozdzialu | KluczOkazji, c: Pick<DefCelu, 'key'>): string => `${r}.${c.key}`;
const przepadly = (s: StanSciezki, klucz: string): boolean => s.przepadle.includes(klucz);

/** cele rozdziału, które istnieją w tej grze */
const celeGry = (d: DefRozdzialu, o: OdczytCelow, s: StanSciezki): readonly DefCelu[] =>
  d.cele.filter((c) => c.jest?.(o, s) !== false);

/** rozdział skończony: każdy jego cel jest zrobiony albo przepadł */
const skonczony = (d: DefRozdzialu, s: StanSciezki, o: OdczytCelow): boolean =>
  celeGry(d, o, s).every((c) => {
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

/** cele okazji, które istnieją w tej grze */
const celeOkazji = (d: DefOkazji, o: OdczytCelow, s: StanSciezki): readonly DefCelu[] =>
  d.cele.filter((c) => c.jest?.(o, s) !== false);

/** Okazje ruszają dopiero po krokach samouczka (`st.tut.step` równe liczbie kroków, albo −1 w świecie bez wnętrza), żeby nie
    przeszkadzały w pierwszych minutach gry. */
const poSamouczku = (o: OdczytCelow): boolean => o.st.tut.step === TUT_STEPS.length || o.st.tut.step === -1;

/** Wszystkie cele okazji są zrobione (okazja bez celów też): taka okazja się zamyka i nie wraca. */
const okazjaZrobiona = (d: DefOkazji, o: OdczytCelow, s: StanSciezki): boolean =>
  celeOkazji(d, o, s).every((c) => zaliczony(s, kluczCelu(d.k, c)));

/** Stan otwarcia okazji `d`, jeśli może się ona teraz otworzyć na stanie `s` (bez otwartej okazji), a inaczej null. Warunki:
    ma niezrobione cele, ma czego dotyczyć (`cel` ≥ 0), jej wyzwalacz jest prawdziwy i po otwarciu zdarzenie dalej by trwało
    (`trwa` na stanie z kandydatem), więc okazja nie otwiera się i zamyka na zmianę w kolejnych krokach. Stan zapisuje tick
    otwarcia, licznik zabitych (do celu „zabijcie trzech”) i, gdy okazja dotyczy pionka albo rzeczy, jej id. */
function otwarcieOkazji(d: DefOkazji, s: StanSciezki, o: OdczytCelow): NonNullable<StanSciezki['okazja']> | null {
  if (okazjaZrobiona(d, o, s)) return null;
  let cel: number | undefined;
  if (d.cel) {
    cel = d.cel(o);
    if (cel < 0) return null;
  }
  if (d.otwiera && !d.otwiera(o)) return null;
  const otwarcie = { k: d.k, od: o.st.tick, zabici: o.st.tally?.killed ?? 0, ...(cel !== undefined ? { cel } : {}) };
  return d.trwa(o, { ...s, okazja: otwarcie }) ? otwarcie : null;
}

/** Krok okazji (zmienia `t`): otwarta okazja zalicza swoje cele, których warunek jest prawdziwy, i zamyka się, gdy zdarzenie
    mija albo wszystkie cele są zrobione (cele liczą się przed zamknięciem, na tym samym odczycie: ugryziony po udanej
    amputacji nie ma już ugryzienia, a jego cel jest zrobiony). Potem do głosu dochodzi okazja ważniejsza od otwartej
    (wcześniejsza na liście), a gdy żadna nie jest otwarta, pierwsza z listy, którą zdarzenie otwiera: widać jedną, niższe
    czekają i wracają ze świeżym stanem, gdy wyższa się skończy. Okazja, która dopiero się otworzyła, zalicza od razu cele,
    które gra już spełnia (może się wtedy od razu zamknąć). Przed końcem kroków samouczka niczego nie ma. */
function krokOkazji(t: StanSciezki, o: OdczytCelow, okazje: readonly DefOkazji[]): void {
  if (!poSamouczku(o)) {
    delete t.okazja;
    return;
  }
  const tick = o.st.tick;
  // każdy obieg otwiera ważniejszą okazję niż poprzednia albo zamyka otwartą, więc kończy się po kilku obiegach
  for (let obieg = 0; obieg <= 2 * okazje.length; obieg++) {
    const otwarta = t.okazja ? okazje.findIndex((x) => x.k === t.okazja!.k) : okazje.length;
    if (t.okazja) {
      const d = okazje[otwarta];
      if (d) {
        for (const c of celeOkazji(d, o, t)) {
          const klucz = kluczCelu(d.k, c);
          if (!zaliczony(t, klucz) && c.zrobiony(o, t)) t.zrobione[klucz] = tick;
        }
      }
      if (!d?.trwa(o, t) || okazjaZrobiona(d, o, t)) delete t.okazja;
    }
    let nowa: StanSciezki['okazja'] | null = null;
    for (const d of okazje.slice(0, t.okazja ? otwarta : okazje.length)) {
      nowa = otwarcieOkazji(d, t, o);
      if (nowa) break;
    }
    if (!nowa) return;
    t.okazja = nowa;
  }
}

/** Otwarcie rozdziału `k` w tej chwili (zmienia `t`): tick, czas przy ekranie (bez licznika w odczycie pole znika) i liczniki
    „od otwarcia”. */
function otworzRozdzial(t: StanSciezki, k: KluczRozdzialu, o: OdczytCelow): void {
  t.rozdzial = k;
  t.od = o.st.tick;
  if (o.ekran !== undefined) t.odEkran = o.ekran;
  else delete t.odEkran;
  t.start = licznikiStartu(o.st, o.gov);
}

/** Krok ścieżki: nowy stan z odczytu gry (wejście i odczyt zostają nietknięte). Zalicza cele otwartego rozdziału, których
    warunek jest prawdziwy, i oznacza przepadłe (zaliczenie wygrywa z terminem, a rozstrzygnięty cel nie zmienia się już
    nigdy). Gdy rozdział jest skończony, otwiera następny: zapisuje tick otwarcia i liczniki `start` z tej chwili, a cele
    nowego rozdziału, które gra już spełnia, zalicza od razu, w tym samym kroku (może to zamknąć i ten rozdział). Rozdział
    z `otwiera` otwiera się po swoim warunku, choćby poprzedni nie był skończony. Po ostatnim rozdziale stan to „koniec”;
    „koniec” zapisany przez wersję, która nie znała późniejszych rozdziałów (zapis po R1, zanim doszło R2), otwiera w tym
    kroku pierwszy rozdział po ostatnim rozstrzygniętym, od chwili kroku, i ścieżka rusza dalej jak zwykle (zob.
    `ostatniRozstrzygniety`). Stan z rozdziałem, którego nie ma wśród definicji, zostaje bez zmian. Okazje idą osobno,
    obok rozdziałów (`krokOkazji`). `rozdzialy` i `okazje` pozwalają podstawić inne definicje (testy zasad); w grze
    zawsze `ROZDZIALY` i `OKAZJE`. */
export function krokSciezki(
  s: StanSciezki,
  o: OdczytCelow,
  rozdzialy: readonly DefRozdzialu[] = ROZDZIALY,
  okazje: readonly DefOkazji[] = OKAZJE,
): StanSciezki {
  const t = kopia(s);
  const tick = o.st.tick;
  // „koniec” zapisany, zanim dopisano późniejsze rozdziały (serwer testowy po R1 miał go bez R2): ścieżka rusza od
  // pierwszego rozdziału po ostatnim rozstrzygniętym, który istnieje w tej grze. Bez żadnego wpisu (stan ustawiony ręcznie
  // do zrzutu) i po ostatnim rozdziale „koniec” zostaje
  if (t.rozdzial === 'koniec') {
    const ostatni = ostatniRozstrzygniety(t, rozdzialy);
    const dalej = ostatni < 0 ? undefined : rozdzialy.slice(ostatni + 1).find((n) => n.jest?.(o) !== false);
    if (dalej && (dalej.otwiera ? dalej.otwiera(o) : true)) otworzRozdzial(t, dalej.k, o);
  }
  // każdy obieg zostawia otwarty późniejszy rozdział niż poprzedni, więc kończy się najwyżej po jednym na rozdział
  for (let obieg = 0; obieg <= rozdzialy.length; obieg++) {
    const k = rozdzialy.findIndex((d) => d.k === t.rozdzial);
    if (k < 0) break;
    const d = rozdzialy[k];
    for (const c of celeGry(d, o, t)) {
      const klucz = kluczCelu(d.k, c);
      if (zaliczony(t, klucz) || przepadly(t, klucz)) continue;
      if (c.zrobiony(o, t)) t.zrobione[klucz] = tick;
      else if (c.zapas?.(o, t)) {
        t.zrobione[klucz] = tick;
        (t.zapasem ??= []).push(klucz);
      } else if (c.przepadl?.(o, t)) t.przepadle.push(klucz);
    }
    const nastepny = rozdzialy.slice(k + 1).find((n) => n.jest?.(o) !== false);
    if (!nastepny) {
      if (skonczony(d, t, o)) t.rozdzial = 'koniec';
      break;
    }
    if (!(nastepny.otwiera ? nastepny.otwiera(o) : skonczony(d, t, o))) break;
    otworzRozdzial(t, nastepny.k, o);
  }
  krokOkazji(t, o, okazje);
  return t;
}

/** Cele do narysowania: tekst, podpowiedź, ptaszek albo skreślenie (cel przepadły to `done` i `missed`), dopisek „czeka” i
    okno, w kolejności definicji. `prefiks` to klucz rozdziału albo okazji, z którego powstaje klucz zaliczenia. */
function celeWidoku(
  prefiks: KluczRozdzialu | KluczOkazji,
  cele: readonly DefCelu[],
  o: OdczytCelow,
  s: StanSciezki,
): Cel[] {
  return cele.map((c) => {
    const klucz = kluczCelu(prefiks, c);
    const zrobiony = zaliczony(s, klucz);
    const missed = !zrobiony && przepadly(s, klucz);
    const done = zrobiony || missed;
    const czeka = done ? null : (c.czeka?.(o, s) ?? null);
    const uwaga = zrobiony ? (c.uwaga?.(o, s) ?? null) : null;
    return {
      key: c.key,
      text: c.tekst(o, s),
      how: c.jak(o, s),
      done,
      ...(missed ? { missed } : {}),
      ...(czeka ? { czeka } : {}),
      ...(uwaga ? { uwaga } : {}),
      ...(c.okno ? { okno: c.okno } : {}),
    };
  });
}

/** bieżący cel: pierwszy niezrobiony, który nie czeka */
const biezacyCel = (cele: readonly Cel[]): Cel | null => cele.find((c) => !c.done && !c.czeka) ?? null;

/** Widok okienka celów ze stanu ścieżki po kroku: blok otwartej okazji (tytuł z „Teraz: …” i jej cele) oraz tytuł rozdziału,
    jego cele (tekst, podpowiedź, ptaszek albo skreślenie, dopisek „czeka”, okno) i bieżący cel, czyli pierwszy niezrobiony,
    który nie czeka. Niczego nie zalicza ani nie zamyka: okazję, która już nie trwa, zamknął krok. */
export function widokSciezki(
  s: StanSciezki,
  o: OdczytCelow,
  rozdzialy: readonly DefRozdzialu[] = ROZDZIALY,
  okazje: readonly DefOkazji[] = OKAZJE,
): WidokSciezki {
  const otwarta = s.okazja ? okazje.find((x) => x.k === s.okazja!.k) : undefined;
  const cele = otwarta ? celeWidoku(otwarta.k, celeOkazji(otwarta, o, s), o, s) : [];
  const okazja = otwarta ? { tytul: otwarta.tytul(o), cele, biezacy: biezacyCel(cele) } : null;
  const d = rozdzialy.find((r) => r.k === s.rozdzial);
  // po ostatnim rozdziale okienko pokazuje drogi do zwycięstwa, na które gra ma następny krok (bez włączonych dróg nic)
  if (!d) return { okazja, rozdzial: null, drogi: s.rozdzial === 'koniec' ? wierszeDrog(o) : null };
  const celeRozdzialu = celeWidoku(d.k, celeGry(d, o, s), o, s);
  return {
    okazja,
    rozdzial: { k: d.k, tytul: d.tytul(o), cele: celeRozdzialu, biezacy: biezacyCel(celeRozdzialu) },
    drogi: null,
  };
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

/** Jeden cel listy. Klasa mówi, czym jest: zrobiony (ptaszek, przekreślony, a gdy cel ma co dopowiedzieć po zaliczeniu, z dopiskiem
    pod spodem: czemu zaliczył się sam, czego uczy), przepadły (krzyżyk, przekreślony), bieżący (z podpowiedzią) albo czekający
    (przyciemniony, z dopiskiem „czeka do …”); zwykły niezrobiony nie ma klasy. */
function celHtml(c: Cel, n: number, biezacy: Cel | null): string {
  const bie = !!biezacy && c.key === biezacy.key;
  const klasa = c.missed ? ' missed' : c.done ? ' done' : bie ? ' now' : c.czeka ? ' czeka' : '';
  const jak = bie ? `<small class="goal-how">${esc(c.how)}</small>` : '';
  const dopisek = c.czeka && !c.done ? `<small class="goal-czeka">${esc(c.czeka)}</small>` : '';
  const uwaga = c.uwaga && c.done && !c.missed ? `<small class="goal-uwaga">${esc(c.uwaga)}</small>` : '';
  return `<li class="goal${klasa}" data-key="${esc(c.key)}" data-n="${n}">${esc(c.text)}${jak}${dopisek}${uwaga}</li>`;
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
