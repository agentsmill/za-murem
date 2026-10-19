/* Gość z klocków w symulacji (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Wizyta”): stałe,
   stan wizyty i czyste funkcje dla Sim (src/sim/sim.ts) i mostu zarządu (src/sim/gov.ts). Zarząd (src/gov/goscie.ts)
   składa gościa i wysyła plan `PlanGoscia`; tu jest to, co symulacja robi z grupą pionków rodzaju `gosc`.

   Przebieg wizyty (faza grupy to `GoscSim.faza`, jej nazwy to `FazaGoscia` z src/gov/typy.ts):
     idzie     grupa startuje na ulicy, na najdalszym kafelku wskazanej strony mapy (do GOSC_FROM kroków od bramy),
               i idzie pod bramę; każdy na swój kafelek obok pozostałych (spirala wokół kafelka za bramą)
     brama     stoją i czekają na decyzję zarządu (najdłużej GOSC_CZEKA, potem odchodzą sami)
     w_srodku  `noc`: bramą (warstwa zarządu) do ogniska albo przed drzwi siedziby, nocą śpią na ziemi, rano między
               6:00 a 8:00 wychodzą; kłamca o 2:00 idzie po jedzenie (do GOSC_LUP porcji), złapany przez czuwającą
               osobę zarządu w promieniu GOSC_ZASIEG staje (`zlapany`); `zostan` i `zarzad` zamieniają pionki w
               mieszkańców (mówiący przy `zarzad` w zarząd) i na tym wizyta w symulacji się kończy (`przyjety`)
     odchodzi  idą do krawędzi mapy (praca `odejscie`, jak wyrzucony mieszkaniec; z ulicy do kafelka, z którego
               przyszli), a gdy ostatni zniknie, faza to `poszedl`; w trybie zombie szwendacz do SPOOK_R m
               płoszy grupę pod bramą (ucieka szybciej)
   `nie_doszedl`: grupa nie dotarła pod bramę w GOSC_DOJSCIE (droga zablokowana); `zginal`: nie żyje nikt.

   Kontrakt.
   - Żadnego losowania: start to kafelek najdalej w kierunku strony (remis najmniejszy indeks), kafelki grupy ze spirali,
     poranne wyjście ze skrótu id gościa. Wizyta nie rusza `st.rng`.
   - Strona wejścia (n, e, s, w) to ta sama strona siatki mapy, bez trygonometrii: świat jest obrócony najwyżej o 45°,
     więc błąd to co najwyżej pół ćwiartki. Stronę mierzy się od kafelka za bramą, pod którym goście czekają (e: większe
     x, w: mniejsze x, n: mniejsze y, s: większe y), a nie od środka mapy: brama rzadko leży pośrodku, a z limitem
     GOSC_FROM kroków połowa mapy bywa poza zasięgiem. Z kafelków ulicy po tej stronie w zasięgu wygrywa ten, który
     leży najdalej wzdłuż osi strony, potem najdalszy krokami, potem o najmniejszym indeksie; gdy po tej stronie nie ma
     żadnego, najdalszy krokami w ogóle.
   - `SimState.goscie` jest listą, która tylko rośnie: zarząd czyta wpisy po kolei i liczy, ile już przeczytał.
     Pola nie ma, dopóki zarząd nie wyśle pierwszego planu, więc gra bez gości ma ten sam skrót stanu. */

import { hashString } from '../core/rng.ts';
import type { FazaGoscia } from '../gov/typy.ts';
import { dayOf, hourOf, TICKS_PER_HOUR } from './clock.ts';
import { tickAt } from './handlarz.ts';
import { WANDERER_HP } from './wedrowcy.ts';

/** wizyta w stanie symulacji (`SimState.goscie`) */
export interface GoscSim {
  /** id gościa z zarządu ('g1', 'g2'…) */
  id: string;
  /** numery pionków, po jednym na osobę z planu, w kolejności osób (indeks = indeks w `PlanGoscia.osoby`); mówi pierwszy
      żywy z nich. Zostają na liście także, gdy pionek zniknął albo zmienił rodzaj (przyjęty, zginął). */
  pawns: number[];
  faza: FazaGoscia;
  /** tick wejścia w bieżącą fazę (dla `idzie`: start wizyty) */
  at: number;
  /** zarząd uznał, że gość kłamie: nocą o 2:00 idzie po jedzenie */
  klamie?: boolean;
  /** porcje jedzenia, których z zapasów brakuje przez tę grupę (wzięte i nieoddane) */
  ukradl: number;
  /** indeks ugryzionej osoby w `pawns` (tryb zombie); ugryzienie wchodzi poleceniem `ugryziony` */
  ugryziony?: number;
  /** ostatni znany kafelek mówiącego (dla zarządu, gdy grupy już nie widać) */
  kafelek: number;
  /** ilu członków zginęło (wszyscy: faza `zginal`) */
  zgin?: number;
  /** tick, od którego mówiący stoi na swoim miejscu pod bramą (reszta ma GOSC_ZBIERZ na dojście) */
  przy?: number;
  /** po rozkazie `noc`: tick porannego wyjścia i tick 2:00, o którym kłamca rusza po jedzenie */
  rano?: number;
  na2?: number;
  /** kradzież: 'idzie' (do sterty), 'wraca' (z łupem do bramy), 'koniec' (po wszystkim albo przerwana); zl: numer
      pionka kradnącego, cel: numer sterty jedzenia */
  krad?: 'idzie' | 'wraca' | 'koniec';
  zl?: number;
  cel?: number;
  /** ugryzienie już weszło */
  ugryzl?: boolean;
  /** grupa została w osiedlu: mieszkańcami albo (mówiący) zarządem; symulacja już o niej nie decyduje */
  przyjety?: 'mieszkancy' | 'zarzad';
}

/** życie pionka gościa (jak wędrowca) */
export const GOSC_HP = WANDERER_HP;
/** najdalej tyle kroków ulicą od bramy leży miejsce, z którego goście startują (spośród takich kafelków wygrywa ten,
    który leży najdalej w kierunku wskazanej strony); marsz trwa wtedy niecałą godzinę gry, więc 2 godziny GOSC_DOJSCIE
    wystarczają z zapasem na zablokowaną drogę i objazd */
export const GOSC_FROM = 110;
/** nie dotarli pod bramę w 2 godziny gry: `nie_doszedl` */
export const GOSC_DOJSCIE = 2 * TICKS_PER_HOUR;
/** po dojściu mówiącego reszta ma tyle czasu (10 minut gry), żeby stanąć obok niego; potem grupa liczy się jako zebrana */
export const GOSC_ZBIERZ = TICKS_PER_HOUR / 6;
/** pod bramą czekają na decyzję najdłużej 3 godziny gry, potem odchodzą sami */
export const GOSC_CZEKA = 3 * TICKS_PER_HOUR;
/** kradnący bierze z najbliższej sterty najwyżej tyle porcji */
export const GOSC_LUP = 3;
/** czuwająca osoba zarządu w tym promieniu (m) od kradnącego go łapie */
export const GOSC_ZASIEG = 8;
/** złapany bez decyzji zarządu stoi do 8:00 rano, potem go puszczają bez łupu */
export const GOSC_ZLAPANY_DO = 8;

/** wizyta skończona: końcowa faza albo grupa przyjęta do osiedla */
export const goscKoniec = (g: GoscSim): boolean =>
  g.przyjety !== undefined || g.faza === 'poszedl' || g.faza === 'nie_doszedl' || g.faza === 'zginal';

/** O ile kafelków `i` leży dalej od `od` (kafelka za bramą) w kierunku strony: e = na wschód (większe x), w = na zachód,
    n = na północ (mniejsze y), s = na południe; ujemne albo zero: nie leży po tej stronie. Mapa ma bok `size`. */
export function przesuniecieWStrone(i: number, od: number, size: number, strona: string): number {
  const dx = (i % size) - (od % size);
  const dy = Math.floor(i / size) - Math.floor(od / size);
  // `0 - d` zamiast `-d`, żeby przy zerze nie wyszło −0
  if (strona === 'n') return 0 - dy;
  if (strona === 's') return dy;
  if (strona === 'e') return dx;
  return 0 - dx;
}

/** czy kafelek leży po stronie kafelka `od`: n = niższe y, s = wyższe y, e = wyższe x, w = niższe x */
export const poStronie = (i: number, od: number, size: number, strona: string): boolean =>
  przesuniecieWStrone(i, od, size, strona) > 0;

/** Miejsce startu gości: kafelek ulicy (`blocked` = warstwa ulicy) nie dalej niż `cap` kroków (po czterech sąsiadach)
    od `od` (kafelka za bramą), leżący po wskazanej stronie `od` i najdalej w jej kierunku (`przesuniecieWStrone`); przy
    remisie dalszy krokami, a potem o najmniejszym indeksie. Gdy po tej stronie nie ma żadnego kafelka w zasięgu,
    najdalszy krokami w ogóle. −1: ulica nie ma żadnego kafelka poza `od`. */
export function startGoscia(blocked: Uint8Array, size: number, od: number, strona: string, cap: number): number {
  const dist = new Int16Array(size * size).fill(-1);
  const q = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  dist[od] = 0;
  q[tail++] = od;
  while (head < tail) {
    const c = q[head++];
    const d = dist[c];
    if (d >= cap) continue;
    const x = c % size;
    for (const n of [c - size, c + size, x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1]) {
      if (n < 0 || n >= size * size || dist[n] >= 0 || blocked[n]) continue;
      dist[n] = d + 1;
      q[tail++] = n;
    }
  }
  let side = -1;
  let sideAx = 0;
  let any = -1;
  for (let i = 0; i < size * size; i++) {
    const d = dist[i];
    if (d <= 0) continue;
    if (any < 0 || d > dist[any]) any = i;
    const ax = przesuniecieWStrone(i, od, size, strona);
    if (ax <= 0) continue;
    if (side < 0 || ax > sideAx || (ax === sideAx && d > dist[side])) {
      side = i;
      sideAx = ax;
    }
  }
  return side >= 0 ? side : any;
}

/** tick porannego wyjścia gości wpuszczonych na noc: najbliższe 6:00 po `tick` plus 0–2 godziny ze skrótu id gościa
    (bez losowania, ten sam gość wychodzi o tej samej porze po zapisie i wczytaniu) */
export function ranoGoscia(tick: number, id: string): number {
  const minuty = Number.parseInt(hashString(id), 16) % 120;
  return tickAt(hourOf(tick) >= 6 ? dayOf(tick) + 1 : dayOf(tick), 6 + minuty / 60);
}

/** tick najbliższej godziny `h` po `tick` (kłamca rusza o 2:00, złapany rano o 8:00) */
export const najblizszaGodzina = (tick: number, h: number): number =>
  tickAt(hourOf(tick) >= h ? dayOf(tick) + 1 : dayOf(tick), h);
