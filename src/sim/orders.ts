/* Polecenia z kliknięcia i opisy prac do karty osoby. Czyste funkcje stanu i świata: interfejs pyta,
   co znaczy kliknięcie prawym przyciskiem na kafelku, i dostaje gotowe polecenie dla symulacji. */

import type { World } from '../world/world.ts';
import { dryTreeOf, houseOf } from './house.ts';
import { BURNABLE, type Command, FURNITURE_ACC, type Pawn, type SimState, type Thing, trunkOf } from './sim.ts';

export interface MenuItem {
  cmd: Command;
  label: string;
  /** można wykonać od razu jednym kliknięciem albo stuknięciem (domyślne polecenie); false: tylko z menu */
  quick: boolean;
  /** niszczy coś na zawsze (palenie mebli): interfejs pyta o potwierdzenie */
  confirm?: boolean;
}

/** drzewo pod kursorem: najbliższy pień w zasięgu korony (najwyżej 2,5 m), także sam kafelek pnia; −1: brak */
export function treeAt(st: SimState, w: World, tile: number): number {
  const cx = (tile % w.size) + 0.5;
  const cy = Math.floor(tile / w.size) + 0.5;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d > Math.max(0.75, Math.min(t.r, 2.5)) || d >= bd || st.felled.includes(k)) return;
    bd = d;
    best = k;
  });
  return best;
}

const thingAt = (st: SimState, w: World, tile: number, kind: string): Thing | undefined => {
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  return st.things.find((t) => t.kind === kind && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
};

/** Polecenia, które mają sens na klikniętym kafelku (menu kontekstowe z GDD), „Idź tu” zawsze na końcu.
    Drewno poza składem: zanieść do składu. Koza, gdy jest skąd wziąć drewno: dołożyć. Drzewo: ściąć, od razu
    tylko po kliknięciu w pień albo tuż obok, bo drzewa nie odrastają, a stuknięcie w las ma znaczyć „idź”.
    Polecenia przyjmuje tylko zarząd: bez nikogo z rdzenia lista jest pusta. */
export function commandsAt(st: SimState, w: World, ids: readonly number[], tile: number): MenuItem[] {
  const core = ids.filter((id) => st.pawns.some((p) => p.id === id && p.kind === 'core'));
  if (!core.length) return [];
  const out: MenuItem[] = [];
  const sklad = houseOf(w)?.sklad ?? [];
  const pile = thingAt(st, w, tile, 'drewno');
  if (pile && sklad.length && !sklad.includes(tile))
    out.push({ cmd: { t: 'haul', ids: core, thing: pile.id }, label: 'Zanieść do składu', quick: true });
  const koza = thingAt(st, w, tile, 'koza');
  const wood = st.things.some((t) => t.kind === 'drewno' && t.n > 0) || st.pawns.some((p) => p.carry > 0);
  if (koza && wood)
    out.push({ cmd: { t: 'refuel', ids: core, thing: koza.id }, label: 'Dołożyć do kozy', quick: true });
  const tree = treeAt(st, w, tile);
  if (tree >= 0) {
    const trunk = trunkOf(w, w.trees[tree]);
    const near =
      Math.abs((trunk % w.size) - (tile % w.size)) <= 1 &&
      Math.abs(Math.floor(trunk / w.size) - Math.floor(tile / w.size)) <= 1;
    out.push({ cmd: { t: 'chop', ids: core, tree }, label: 'Ściąć drzewo', quick: near });
  }
  const x = tile % w.size;
  const y = Math.floor(tile / w.size);
  const furniture = st.things.find((t) => BURNABLE[t.kind] && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  if (furniture)
    out.push({
      cmd: { t: 'burn', ids: core, thing: furniture.id },
      label: `Spalić ${FURNITURE_ACC[furniture.kind]}`,
      quick: false,
      confirm: true,
    });
  out.push({ cmd: { t: 'move', ids: core, to: tile }, label: 'Idź tu', quick: true });
  return out;
}

/** domyślne polecenie dla klikniętego kafelka (pierwsze, które można wykonać od razu) albo null bez nikogo
    z zarządu */
export function commandFor(st: SimState, w: World, ids: readonly number[], tile: number): Command | null {
  return commandsAt(st, w, ids, tile).find((m) => m.quick)?.cmd ?? null;
}

/** co robi osoba: krótki opis do karty */
export function jobText(st: SimState, w: World, p: Pawn): string {
  const j = p.job;
  if (!j) return p.pi < p.path.length ? 'Idzie.' : 'Stoi i czeka na polecenie.';
  const walking = j.phase === 0;
  switch (j.t) {
    case 'go':
      return walking ? 'Idzie.' : 'Czeka na miejscu.';
    case 'chop': {
      const dry = j.target === dryTreeOf(w);
      if (walking) return dry ? 'Idzie do suchego drzewa.' : 'Idzie ściąć drzewo.';
      return dry ? 'Rąbie suche drzewo.' : 'Ścina drzewo.';
    }
    case 'haul':
      return walking ? 'Idzie po drewno.' : 'Niesie drewno do składu.';
    case 'refuel':
      return walking ? 'Idzie po drewno do kozy.' : 'Dokłada do kozy.';
    case 'warm':
      return walking ? 'Idzie ogrzać się przy kozie.' : 'Grzeje się przy kozie.';
    case 'eat':
      if (walking) return 'Idzie coś zjeść.';
      return j.target >= 0 ? 'Je przy stole.' : 'Je.';
    case 'sleep':
      if (walking) return 'Idzie spać.';
      return j.target >= 0 ? 'Śpi.' : 'Śpi na podłodze.';
    case 'burn': {
      const f = st.things.find((t) => t.id === j.target);
      const what = f ? (FURNITURE_ACC[f.kind] ?? 'mebel') : 'mebel';
      return walking ? `Idzie rozbić ${what} na opał.` : `Rozbiera ${what} na opał.`;
    }
  }
}
