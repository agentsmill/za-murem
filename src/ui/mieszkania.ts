/* Mieszkania siedziby w interfejsie (docs/M2-fala-1.md): stan (zarząd, mieszkańcy, puste z powodem i rokiem),
   uszkodzenia do naprawy, przeszukane pomieszczenia i karta mieszkania. Stan i uszkodzenia daje świat
   (World.apts, World.damage), co przeszukane i co nasze daje stan gry (st.apts); do czasu, aż je podadzą
   sesje świata i symulacji, atrapa: mieszkania z mieszkańcami z symulacji, reszta puste z powodem
   z ziarna. Czyste funkcje stanu i świata, bez DOM. */

import { h2 } from '../render/art/hash.ts';
import type { Mat } from '../sim/budowle.ts';
import type { SimState } from '../sim/sim.ts';
import type { AptState, AptWhy, Damage, DamageKind } from '../world/apts.ts';
import type { RoomKind } from '../world/interior.ts';
import type { World } from '../world/world.ts';
import { type AptGame, aptsGame, costText } from './budowa.ts';
import { esc } from './tekst.ts';

/** świat z polami fali 1 (dopóki świat ich nie daje, są puste) */
const worldApts = (w: World): AptState[] | undefined => (w as unknown as { apts?: AptState[] }).apts;
const worldDamage = (w: World): Damage[] | undefined => (w as unknown as { damage?: Damage[] }).damage;

const WHYS: readonly AptWhy[] = ['wyjazd', 'wymarcie', 'splądrowanie', 'zalanie', 'pozar'];

/** numery mieszkań siedziby (pokoje z apt ≥ 0) */
export function aptNumbers(w: World): number[] {
  const out: number[] = [];
  for (const r of w.interior.rooms) if (r.apt >= 0 && !out.includes(r.apt)) out.push(r.apt);
  return out.sort((a, b) => a - b);
}

/** Stan mieszkań siedziby: ze świata, a bez niego atrapa (zarząd, mieszkania z mieszkańcami z symulacji,
    reszta puste z powodem i rokiem z ziarna świata) */
export function aptsOf(st: SimState, w: World): AptState[] {
  const real = worldApts(w);
  if (real) return real;
  const i = w.interior;
  const lived = new Set(st.pawns.filter((p) => p.kind === 'resident' && p.apt >= 0).map((p) => p.apt));
  return aptNumbers(w).map((apt): AptState => {
    if (apt === i.home) return { bid: i.building, apt, state: 'zarzad' };
    if (lived.has(apt)) return { bid: i.building, apt, state: 'mieszkancy' };
    const r = h2(w.seed, apt, 7151);
    return {
      bid: i.building,
      apt,
      state: 'puste',
      why: WHYS[Math.floor(r * WHYS.length) % WHYS.length],
      year: 2026 + Math.floor(h2(w.seed, apt, 7152) * 26),
    };
  });
}

/** pomieszczenia mieszkania (bez klatki), od wejścia */
const roomsOf = (w: World, apt: number) => w.interior.rooms.filter((r) => r.apt === apt && r.kind !== 'klatka');

/** kafelki sąsiadujące z pomieszczeniami mieszkania (drzwi, okna w ścianie) */
function besideApt(w: World, apt: number, list: readonly number[]): number[] {
  const i = w.interior;
  const ids = new Set(roomsOf(w, apt).map((r) => r.id));
  return list.filter((t) =>
    [1, -1, w.size, -w.size].some((d) => {
      const n = t + d;
      return n >= 0 && n < i.room.length && ids.has(i.room[n]);
    }),
  );
}

/** pierwszy kafelek posadzki w pomieszczeniu danego rodzaju (albo w dowolnym pomieszczeniu mieszkania) */
function floorOf(w: World, apt: number, kind?: RoomKind): number {
  const i = w.interior;
  const rooms = roomsOf(w, apt);
  const want = rooms.find((r) => r.kind === kind) ?? rooms[0];
  if (!want) return -1;
  return i.room.indexOf(want.id);
}

/** uszkodzenia, jakie zostawia powód opuszczenia (atrapa do czasu World.damage) */
const DAMAGE_BY_WHY: Record<AptWhy, DamageKind[]> = {
  wyjazd: [],
  wymarcie: [],
  splądrowanie: ['drzwi', 'okno'],
  zalanie: ['rura', 'podloga'],
  pozar: ['okno', 'podloga'],
};

/** uszkodzenia mieszkania: ze świata, a bez niego atrapa z powodu opuszczenia */
export function damageOf(st: SimState, w: World, apt: number): Damage[] {
  const real = worldDamage(w);
  const bid = w.interior.building;
  if (real) return real.filter((d) => d.bid === bid && d.apt === apt);
  const a = aptsOf(st, w).find((x) => x.apt === apt);
  if (a?.state !== 'puste' || !a.why) return [];
  const out: Damage[] = [];
  for (const kind of DAMAGE_BY_WHY[a.why]) {
    const tile =
      kind === 'drzwi'
        ? (besideApt(w, apt, w.interior.doors)[0] ?? -1)
        : kind === 'okno'
          ? (besideApt(w, apt, w.interior.windows)[0] ?? -1)
          : floorOf(w, apt, kind === 'rura' ? 'lazienka' : 'pokoj');
    if (tile >= 0) out.push({ kind, tile, bid, apt });
  }
  return out;
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
  damages: (Damage & { name: string; cost: string; repaired: boolean })[];
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
  const game: AptGame | undefined = aptsGame(st).find((g) => g.bid === a.bid && g.apt === apt);
  const searched = new Set(game?.searched ?? []);
  const repaired = new Set(game?.repaired ?? []);
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
      repaired: repaired.has(d.tile),
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
  const fix = v.damages.filter((d) => !d.repaired);
  const done = v.damages.filter((d) => d.repaired);
  const damages = v.damages.length
    ? `<ul class="apt-list">${v.damages
        .map(
          (d) =>
            `<li class="apt-i${d.repaired ? ' done' : ''}"><span>${esc(d.name)}</span><b class="apt-c">${
              d.repaired ? 'naprawione' : esc(d.cost)
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
