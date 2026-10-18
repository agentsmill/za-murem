/* Mieszkania siedziby w interfejsie (docs/M2-fala-1.md): stan (zarząd, mieszkańcy, puste z powodem i rokiem),
   uszkodzenia do naprawy, przeszukane pomieszczenia i karta mieszkania. Stan, nasze i przeszukane daje st.apts,
   naprawy st.damage (fixed), koszty napraw REPAIR symulacji, a liczby do karty odczyt symulacji
   (snapshot().apts: damaged, rooms, searched). Czyste funkcje stanu i świata, bez DOM. Napisy w bieżącym języku:
   polskie tablice zostają tutaj, angielskie leżą w mieszkania.en.ts. */

import { jezyk, L, type Tx, tr, tx } from '../core/jezyk.ts';
import { REPAIR } from '../sim/mieszkania.ts';
import type { SimState } from '../sim/sim.ts';
import type { SimApt } from '../sim/snapshot.ts';
import type { AptWhy, DamageKind } from '../world/apts.ts';
import type { RoomKind } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import { costText } from './budowa.ts';
import { DAMAGE_EN, WHY_SHORT_EN, WHY_TEXT_EN } from './mieszkania.en.ts';
import { esc } from './tekst.ts';

/** pomieszczenia mieszkania (bez klatki), od wejścia */
const roomsOf = (w: World, apt: number) => w.interior.rooms.filter((r) => r.apt === apt && r.kind !== 'klatka');

/** nazwy uszkodzeń do karty (koszt i czas naprawy daje symulacja: REPAIR) */
export const DAMAGE_NAME: Record<DamageKind, string> = {
  okno: 'Wybite okno',
  drzwi: 'Wyważone drzwi',
  rura: 'Cieknąca rura',
  podloga: 'Zniszczona podłoga',
  piec: 'Zepsuty piec',
};

/** powód opuszczenia: krótko do nagłówka i zdaniem do karty */
export const WHY_SHORT: Record<AptWhy, string> = {
  wyjazd: 'wyjazd',
  wymarcie: 'mieszkańcy zmarli',
  splądrowanie: 'splądrowane',
  zalanie: 'zalane',
  pozar: 'po pożarze',
};
export const WHY_TEXT: Record<AptWhy, (year: number) => string> = {
  wyjazd: (y) => `Mieszkańcy wyjechali w ${y}. Meble zostały.`,
  wymarcie: (y) => `Mieszkańcy zmarli w ${y}. Zostały meble i rzeczy osobiste, czuć stęchliznę.`,
  splądrowanie: (y) => `Splądrowane w ${y}: przewrócone meble, śmieci, wyważone drzwi.`,
  zalanie: (y) => `Zalane w ${y}: mokra podłoga, zniszczone meble, cieknąca rura.`,
  pozar: (y) => `Pożar w ${y}: spalenizna, wybite okno, część mebli spalona.`,
};

const ROOM_NAME: Partial<Record<RoomKind, Tx>> = {
  przedpokoj: tx('Przedpokój', 'Hallway'),
  pokoj: tx('Pokój', 'Room'),
  kuchnia: tx('Kuchnia', 'Kitchen'),
  lazienka: tx('Łazienka', 'Bathroom'),
  sala: tx('Sala', 'Main room'),
  hala: tx('Hala', 'Hall'),
  zaplecze: tx('Zaplecze', 'Back room'),
};

/** łóżka jak w symulacji: całe łóżko i wersalka to jedno miejsce, łóżka piętrowe dwa */
const BED_PLACES: Record<string, number> = { lozko: 1, wersalka: 1, lozka_pietrowe: 2 };

export interface AptView {
  apt: number;
  state: SimApt['state'];
  why?: AptWhy;
  year?: number;
  /** mieszkanie zarządu albo zajęte poleceniem 'claim' */
  ours: boolean;
  rooms: { id: number; name: string; area: number; searched: boolean }[];
  /** uszkodzenia mieszkania (id: indeks w st.damage, jak w poleceniu 'repair') z kosztem naprawy */
  damages: { id: number; kind: DamageKind; tile: number; name: string; cost: string; fixed: boolean }[];
  /** z odczytu symulacji: uszkodzeń do naprawy, pomieszczeń i ile z nich przeszukanych */
  damaged: number;
  roomCount: number;
  searchedCount: number;
  /** miejsca do spania w całych łóżkach mieszkania: tyle osób zmieści się po zajęciu i naprawie */
  beds: number;
}

/** mieszkanie siedziby pod kafelkiem (pokój, przedpokój, kuchnia…; nie klatka) albo −1 */
export function aptAt(w: World, tile: number): number {
  const i = w.interior;
  const r = tile >= 0 && tile < i.room.length ? i.room[tile] : -1;
  if (r < 0) return -1;
  const room = i.rooms[r];
  return room.kind === 'klatka' ? -1 : room.apt;
}

/** wszystko do karty mieszkania: stan gry (st.apts, st.damage) i liczby z odczytu (snapshot().apts) */
export function aptView(st: SimState, w: World, apt: number, snap: readonly SimApt[]): AptView | null {
  const g = st.apts.find((a) => a.apt === apt);
  const s = snap.find((a) => a.apt === apt);
  if (!g || !s) return null;
  const searched = new Set(g.searched);
  const rooms = roomsOf(w, apt);
  const ids = new Set(rooms.map((r) => r.id));
  let beds = 0;
  for (const t of st.things)
    if (!t.broken && ids.has(w.interior.room[t.y * w.size + t.x])) beds += BED_PLACES[t.kind] ?? 0;
  return {
    apt,
    state: g.state,
    why: g.why,
    year: g.year,
    ours: g.state === 'zarzad' || g.ours,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: tr(ROOM_NAME[r.kind] ?? r.kind),
      area: r.area,
      searched: searched.has(r.id),
    })),
    damages: st.damage.flatMap((d, id) =>
      d.apt === apt
        ? [
            {
              id,
              kind: d.kind,
              tile: d.tile,
              name: L(DAMAGE_NAME[d.kind], DAMAGE_EN[d.kind]),
              cost: costText(REPAIR[d.kind].cost),
              fixed: d.fixed,
            },
          ]
        : [],
    ),
    damaged: s.damaged,
    roomCount: s.rooms,
    searchedCount: s.searched,
    beds,
  };
}

/** nagłówek stanu („Puste od 2034, wyjazd”; po angielsku „Empty since 2034, moved away”) */
export function aptState(v: AptView): string {
  if (v.state === 'zarzad') return L('Mieszkanie zarządu', 'The board’s flat');
  if (v.state === 'mieszkancy') return L('Mieszkają tu ludzie', 'People live here');
  const head = v.ours ? L('Zajęte przez zarząd', 'Claimed by the board') : L('Puste', 'Empty');
  if (!v.why) return head;
  // po angielsku rok mówi, od kiedy mieszkanie stoi puste, także zajęte przez zarząd
  return jezyk() === 'en'
    ? `${v.ours ? 'Claimed by the board, empty' : 'Empty'} since ${v.year ?? '?'}, ${WHY_SHORT_EN[v.why]}`
    : `${head} od ${v.year ?? '?'}, ${WHY_SHORT[v.why]}`;
}

/** karta mieszkania (w miejscu karty osoby): stan, powód opuszczenia, co do naprawy, co już przeszukane */
export function aptCard(v: AptView, touch: boolean): string {
  const empty = v.state === 'puste';
  const done = v.damages.filter((d) => d.fixed);
  const damages = v.damages.length
    ? `<ul class="apt-list">${v.damages
        .map(
          (d) =>
            `<li class="apt-i${d.fixed ? ' done' : ''}"><span>${esc(d.name)}</span><b class="apt-c">${
              d.fixed ? L('naprawione', 'repaired') : esc(d.cost)
            }</b></li>`,
        )
        .join('')}</ul>`
    : `<p class="apt-none">${L('Nic do naprawy.', 'Nothing to repair.')}</p>`;
  const rooms = `<ul class="apt-list">${v.rooms
    .map(
      (r) =>
        `<li class="apt-i${r.searched ? ' done' : ''}"><span>${esc(r.name)}, ${r.area} m²</span><b class="apt-c">${
          r.searched ? L('przeszukane', 'searched') : L('do przeszukania', 'not searched')
        }</b></li>`,
    )
    .join('')}</ul>`;
  const how = touch
    ? L(
        'Przytrzymajcie palec w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
        'Press and hold inside the flat: Search, Tear down, Repair, Claim the flat.',
      )
    : L(
        'Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.',
        'Right-click inside the flat: Search, Tear down, Repair, Claim the flat.',
      );
  const year = v.year ?? 2026;
  return [
    `<h2>${L('Mieszkanie', 'Flat')} ${v.apt + 1}</h2>`,
    `<p class="sub">${esc(aptState(v))}</p>`,
    empty && v.why ? `<p class="apt-why">${esc(L(WHY_TEXT[v.why](year), WHY_TEXT_EN[v.why](year)))}</p>` : '',
    empty
      ? `<h3 class="apt-h">${L('Do naprawy', 'Repairs')}${v.damaged ? ` (${v.damaged})` : ''}</h3>${damages}`
      : done.length
        ? `<h3 class="apt-h">${L('Naprawione', 'Repaired')}</h3>${damages}`
        : '',
    empty
      ? `<h3 class="apt-h">${L(
          `Przeszukane: ${v.searchedCount} z ${v.roomCount}`,
          `Searched: ${v.searchedCount} of ${v.roomCount}`,
        )}</h3>${rooms}`
      : '',
    empty && v.beds
      ? `<p class="apt-beds">${L(
          `${v.ours ? 'Po naprawie' : 'Po zajęciu i naprawie'}: miejsca do spania dla ${v.beds} ${
            v.beds === 1 ? 'osoby' : 'osób'
          }.`,
          `${v.ours ? 'Once repaired' : 'Once claimed and repaired'}: sleeps ${v.beds}.`,
        )}</p>`
      : '',
    empty ? `<p class="doing">${esc(how)}</p>` : '',
  ].join('');
}
