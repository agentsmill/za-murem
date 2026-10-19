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
               spłaszcza grupę pod bramą (ucieka szybciej)
   `nie_doszedl`: grupa nie dotarła pod bramę w GOSC_DOJSCIE (droga zablokowana); `zginal`: nie żyje nikt.

   Kontrakt.
   - Żadnego losowania: start to najdalszy kafelek strony (remis najmniejszy indeks), kafelki grupy ze spirali,
     poranne wyjście z skrótu id gościa. Wizyta nie rusza `st.rng`.
   - Strona wejścia (n, e, s, w) to ta sama strona siatki mapy, bez trygonometrii: świat jest obrócony najwyżej o 45°,
     więc błąd to co najwyżej pół ćwiartki.
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
/** najdalej tyle kroków ulicą od bramy leży miejsce, z którego goście startują (marsz trwa wtedy niecałą godzinę gry,
    więc 2 godziny GOSC_DOJSCIE wystarczają z zapasem na zablokowaną drogę i objazd) */
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

/** czy kafelek leży po stronie mapy (środek mapy dzieli ją na połowy, n = niskie y, s = wysokie y, e = wysokie x,
    w = niskie x); mapa ma bok `size` kafelków */
export function poStronie(i: number, size: number, strona: string): boolean {
  const x = i % size;
  const y = (i - x) / size;
  const pol = size / 2;
  if (strona === 'n') return y < pol;
  if (strona === 's') return y >= pol;
  if (strona === 'e') return x >= pol;
  return x < pol;
}

/** Miejsce startu gości: kafelek ulicy (`blocked` = warstwa ulicy), najdalszy od `od` (kafelka za bramą) w kolejności
    kroków po czterech sąsiadach, nie dalej niż `cap` kroków, leżący po wskazanej stronie mapy; remis rozstrzyga
    najmniejszy indeks. Gdy po tej stronie nie ma żadnego, najdalszy w ogóle. −1: ulica nie ma żadnego kafelka poza `od`. */
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
  let any = -1;
  for (let i = 0; i < size * size; i++) {
    const d = dist[i];
    if (d <= 0) continue;
    if (any < 0 || d > dist[any]) any = i;
    if (poStronie(i, size, strona) && (side < 0 || d > dist[side])) side = i;
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
