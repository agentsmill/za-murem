/* Mieszkania siedziby w interfejsie (docs/M2-fala-1.md): stan (zarząd, mieszkańcy, puste z powodem i rokiem),
   uszkodzenia do naprawy, przeszukane pomieszczenia i karta mieszkania. Stan i uszkodzenia na starcie daje
   świat (World.apts, World.damage); w grze stan, nasze i przeszukane daje st.apts, a naprawy st.damage
   (kształty od symulacji). Czyste funkcje stanu i świata, bez DOM. */

import type { Mat } from '../sim/budowle.ts';
import type { SimState } from '../sim/sim.ts';
import type { AptState, AptWhy, Damage, DamageKind } from '../world/apts.ts';
import type { RoomKind } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import { aptsGame, costText, damageGame } from './budowa.ts';
import { esc } from './tekst.ts';

/** Stan mieszkań siedziby: ze stanu gry (st.apts), a zanim symulacja go poda, ze świata */
export function aptsOf(st: SimState, w: World): AptState[] {
  const game = aptsGame(st);
  if (!game) return w.apts;
  const bid = w.interior.building;
  return game.map((a) => ({ bid, apt: a.apt, state: a.state, why: a.why, year: a.year }));
}

/** pomieszczenia mieszkania (bez klatki), od wejścia */
const roomsOf = (w: World, apt: number) => w.interior.rooms.filter((r) => r.apt === apt && r.kind !== 'klatka');

/** uszkodzenia mieszkania z tym, czy naprawione: ze stanu gry (st.damage), a bez niego ze świata */
export function damageOf(st: SimState, w: World, apt: number): (Damage & { fixed: boolean })[] {
  const bid = w.interior.building;
  const game = damageGame(st);
  if (game)
    return game.filter((d) => d.apt === apt).map((d) => ({ kind: d.kind, tile: d.tile, bid, apt, fixed: d.fixed }));
  return w.damage.filter((d) => d.bid === bid && d.apt === apt).map((d) => ({ ...d, fixed: false }));
}

/** naprawy z projektu fali: nazwa uszkodzenia i koszt (symulacja liczy je naprawdę) */
export const REPAIR: Record<DamageKind, { name: string; cost: Partial<Record<Mat, number>> }> = {
  okno: { name: 'Wybite okno', cost: { deski: 2 } },
  drzwi: { name: 'Wyważone drzwi', cost: { deski: 3 } },
  rura: { name: 'Cieknąca rura', cost: { zlom: 1, czesci: 1 } },
  podloga: { name: 'Zniszczona podłoga', cost: { deski: 2 } },
  piec: { name: 'Zepsuty piec', cost: { zlom: 2, czesci: 1 } },
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

const ROOM_NAME: Partial<Record<RoomKind, string>> = {
  przedpokoj: 'Przedpokój',
  pokoj: 'Pokój',
  kuchnia: 'Kuchnia',
  lazienka: 'Łazienka',
  sala: 'Sala',
  hala: 'Hala',
  zaplecze: 'Zaplecze',
};

export interface AptView {
  bid: number;
  apt: number;
  state: AptState['state'];
  why?: AptWhy;
  year?: number;
  /** zajęte przez zarząd w grze (st.apts) */
  ours: boolean;
  rooms: { id: number; name: string; area: number; searched: boolean }[];
  damages: (Damage & { name: string; cost: string; fixed: boolean })[];
  /** łóżka w mieszkaniu: tyle miejsc dla nowych mieszkańców po zajęciu i naprawie */
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

/** wszystko do karty mieszkania */
export function aptView(st: SimState, w: World, apt: number): AptView | null {
  const a = aptsOf(st, w).find((x) => x.apt === apt);
  if (!a) return null;
  const game = aptsGame(st)?.find((g) => g.apt === apt);
  const searched = new Set(game?.searched ?? []);
  const ids = new Set(roomsOf(w, apt).map((r) => r.id));
  // miejsca do spania jak w symulacji: łóżka i wersalki
  const beds = w.interior.furniture.filter(
    (f) => (f.kind === 'lozko' || f.kind === 'wersalka') && ids.has(w.interior.room[f.y * w.size + f.x]),
  ).length;
  return {
    bid: a.bid,
    apt,
    state: a.state,
    why: a.why,
    year: a.year,
    ours: a.state === 'zarzad' || !!game?.ours,
    rooms: roomsOf(w, apt).map((r) => ({
      id: r.id,
      name: ROOM_NAME[r.kind] ?? r.kind,
      area: r.area,
      searched: searched.has(r.id),
    })),
    damages: damageOf(st, w, apt).map((d) => ({
      ...d,
      name: REPAIR[d.kind].name,
      cost: costText(REPAIR[d.kind].cost),
    })),
    beds,
  };
}

/** nagłówek stanu („Puste od 2034, wyjazd”) */
export function aptState(v: AptView): string {
  if (v.state === 'zarzad') return 'Mieszkanie zarządu';
  if (v.state === 'mieszkancy') return 'Mieszkają tu ludzie';
  const head = v.ours ? 'Zajęte przez zarząd' : 'Puste';
  return v.why ? `${head} od ${v.year ?? '?'}, ${WHY_SHORT[v.why]}` : head;
}

/** karta mieszkania (w miejscu karty osoby): stan, powód opuszczenia, co do naprawy, co już przeszukane */
export function aptCard(v: AptView, touch: boolean): string {
  const empty = v.state === 'puste';
  // do naprawy: uszkodzenia tego mieszkania, których jeszcze nie naprawiono
  const fix = v.damages.filter((d) => !d.fixed);
  const done = v.damages.filter((d) => d.fixed);
  const damages = v.damages.length
    ? `<ul class="apt-list">${v.damages
        .map(
          (d) =>
            `<li class="apt-i${d.fixed ? ' done' : ''}"><span>${esc(d.name)}</span><b class="apt-c">${
              d.fixed ? 'naprawione' : esc(d.cost)
            }</b></li>`,
        )
        .join('')}</ul>`
    : '<p class="apt-none">Nic do naprawy.</p>';
  const rooms = `<ul class="apt-list">${v.rooms
    .map(
      (r) =>
        `<li class="apt-i${r.searched ? ' done' : ''}"><span>${esc(r.name)}, ${r.area} m²</span><b class="apt-c">${
          r.searched ? 'przeszukane' : 'do przeszukania'
        }</b></li>`,
    )
    .join('')}</ul>`;
  const searchedN = v.rooms.filter((r) => r.searched).length;
  const how = touch
    ? 'Przytrzymajcie palec w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.'
    : 'Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.';
  return [
    `<h2>Mieszkanie ${v.apt + 1}</h2>`,
    `<p class="sub">${esc(aptState(v))}</p>`,
    empty && v.why ? `<p class="apt-why">${esc(WHY_TEXT[v.why](v.year ?? 2026))}</p>` : '',
    empty
      ? `<h3 class="apt-h">Do naprawy${fix.length ? ` (${fix.length})` : ''}</h3>${damages}`
      : done.length
        ? `<h3 class="apt-h">Naprawione</h3>${damages}`
        : '',
    empty ? `<h3 class="apt-h">Przeszukane: ${searchedN} z ${v.rooms.length}</h3>${rooms}` : '',
    empty && v.beds
      ? `<p class="apt-beds">${v.ours ? 'Po naprawie' : 'Po zajęciu i naprawie'}: miejsca do spania dla ${v.beds} ${
          v.beds === 1 ? 'osoby' : 'osób'
        }.</p>`
      : '',
    empty ? `<p class="doing">${esc(how)}</p>` : '',
  ].join('');
}
