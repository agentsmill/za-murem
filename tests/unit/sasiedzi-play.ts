/* Gracz-bot fali 2 M2 (docs/M2-fala-2.md): od rana dnia 2 jedna osoba z zarządu (ostatnia) chodzi do sąsiadów. Otwiera
   najbliższy budynek (zamknięty na klucz wyważa), przeszukuje pomieszczenia po kolei, potem piętra, a łup nosi sama
   (noszenie z surowców). W spotkaniach rozmawia, napad odpiera z bronią albo ucieka, szabrowników z bronią przegania.
   W trybie zombie idzie tylko za jasnego dnia, z bronią, zdrowa i gdy w promieniu 15 m jest najwyżej jeden szwendacz.
   Wpina się w playWithGov (PlayOpts.player) i w pętlę bota zombie. Używa go tools/bot.ts i tools/bot-zombie.ts
   z flagą --sasiedzi; liczniki idą ze stanu gry (zrobione, nie wydane polecenia). */

import { dayOf, hourOf } from '../../src/sim/clock.ts';
import {
  drzwiBudynku,
  mieszkalny,
  moznaPrzeszukac,
  pietraBudynku,
  stanDrzwi,
  type WyborSpotkania,
  wnetrze,
} from '../../src/sim/sasiedzi.ts';
import type { Command, Pawn } from '../../src/sim/sim.ts';
import { IN } from '../../src/world/interior.ts';
import type { World } from '../../src/world/world.ts';
import type { Player } from './m2-play.ts';

export interface SasiedziLog {
  /** przeszukane pomieszczenia i piętra u sąsiadów, otwarte budynki */
  rooms: number;
  floors: number;
  opened: number;
  /** spotkania, rany naszych (napisy z raną) i ugryzienia na piętrach */
  meetings: number;
  wounds: number;
  bites: number;
}

/** co ile sekund przy ekranie gracz rozgląda się za następną decyzją */
const EVERY = 5;
/** napisy, przy których ktoś z naszych oberwał */
const RANY = new Set([
  'zabranie_przegrana',
  'obrona_przegrana',
  'uspokojenie_nie',
  'przegonic_nie',
  'pietro_szwendacz',
  'pietro_ugryzienie',
]);

export function sasiedziPlayer(): { player: Player; log: SasiedziLog } {
  const log: SasiedziLog = { rooms: 0, floors: 0, opened: 0, meetings: 0, wounds: 0, bites: 0 };
  /** budynki, które nic już nie dadzą albo do których nie da się wejść */
  const done = new Set<number>();
  /** polecenia, które nie ruszyły (cel nieosiągalny): klucz rodzaj:cel */
  const bad = new Set<string>();
  let last: { pawn: number; key: string; job: string } | null = null;
  let seenNapis = 0;
  /** środki posadzek pomieszczeń i kafelki schodów budynku (liczone raz, w prostokącie budynku) */
  const plan = new Map<number, { rooms: Map<number, number>; stairs: number[] }>();
  const planOf = (w: World, bid: number) => {
    let x = plan.get(bid);
    if (!x) {
      x = budynekPlan(w, bid);
      plan.set(bid, x);
    }
    return x;
  };

  const player: Player = (sim, w, s, order) => {
    const st = sim.st;
    const sas = st.sasiedzi;
    // liczniki ze stanu gry
    if (sas) {
      log.rooms = sas.budynki.reduce(
        (a, b) => a + b.przeszukane.length + b.mieszkania.reduce((x, m) => x + m.przeszukane.length, 0),
        0,
      );
      log.floors = sas.budynki.reduce((a, b) => a + b.pietra, 0);
      log.opened = sas.budynki.filter((b) => b.otwarty).length;
      log.meetings = sas.nr;
      if (sas.napis && sas.n > seenNapis) {
        seenNapis = sas.n;
        if (RANY.has(sas.napis.co)) log.wounds++;
        if (sas.napis.co === 'pietro_ugryzienie') log.bites++;
      }
      // spotkanie czeka na wybór: od razu, bez czekania na następną decyzję
      const sp = sas.spotkanie;
      if (sp) {
        const g = sas.budynki[sp.b].domy[sp.dom];
        const armed = sp.my.some((id) => {
          const q = st.pawns.find((x) => x.id === id);
          return !!q?.weapon;
        });
        const choice: WyborSpotkania = g.szabrownicy
          ? sp.atak
            ? armed
              ? 'obrona'
              : 'ucieczka'
            : armed
              ? 'przegonic'
              : 'odejscie'
          : sp.atak
            ? armed
              ? 'obrona'
              : 'ucieczka'
            : 'rozmowa';
        order({ t: 'meet', ids: [], nr: sp.nr, choice }, `spotkanie: ${choice}`);
        return;
      }
    }
    const h = hourOf(st.tick);
    const zombie = st.mode === 'zombie';
    // w trybie zombie tylko za jasnego dnia (8–17), bo po zmroku za siatką jest stado
    if (dayOf(st.tick) < 2 || h < (zombie ? 8 : 7) || h >= (zombie ? 17 : 21) || s % EVERY) return;
    const cores = st.pawns.filter((p) => p.kind === 'core' && !p.away);
    // w trybie zombie ostatnia uzbrojona osoba (broń dostają też wartownicy), w zwykłym ostatnia z zarządu
    const armed = cores.filter((q) => q.weapon && q.bite === undefined && q.job?.t !== 'guard');
    const p = zombie ? armed[armed.length - 1] : cores[cores.length - 1];
    if (!p || cores.length < 2) return;
    // tryb zombie: z bronią, zdrowy (od 60) i najwyżej jeden szwendacz w promieniu 15 m (jednego da się ubić)
    if (
      zombie &&
      (!p.weapon ||
        (p.needs?.health ?? 0) < 60 ||
        p.bite !== undefined ||
        st.pawns.filter((z) => z.kind === 'zombie' && Math.hypot(z.x - p.x, z.y - p.y) < 15).length > 1)
    )
      return;
    if (last) {
      if (p.job?.t !== last.job && !(last.job === 'door' && p.job?.t === 'go')) bad.add(last.key);
      last = null;
    }
    // zajęta własną pracą z polecenia (drzwi, przeszukanie, noszenie, piętro) albo pilną potrzebą
    if (p.job?.order || ['eat', 'sleep', 'warm', 'fight', 'meet'].includes(p.job?.t ?? '')) return;
    const send = (c: Command, key: string, job: string, text: string) => {
      last = { pawn: p.id, key, job };
      order(c, text);
    };
    const target = nearestBuilding(w, p, done);
    if (target < 0) return;
    const k = sas?.budynki.findIndex((b) => b.bid === target) ?? -1;
    const rec = k >= 0 ? sas!.budynki[k] : undefined;
    if (!rec?.otwarty) {
      // drzwi na zewnątrz od najbliższych: zamknięte otworzyć, na klucz wyważyć, zabite i nieosiągalne pominąć
      const doors = drzwiBudynku(w, target)
        .zewn.filter((d) => !bad.has(`door:${d.tile}`))
        .sort((a, b) => dist(w, p, a.out) - dist(w, p, b.out));
      for (const d of doors) {
        const stan = rec ? stanDrzwi(rec, d.tile)?.s : 'zamkniete';
        if (stan === 'zabite') continue;
        const t = stan === 'na_klucz' ? 'force' : 'open';
        return send({ t, ids: [p.id], door: d.tile }, `door:${d.tile}`, 'door', `drzwi: ${t}`);
      }
      done.add(target);
      return;
    }
    // otwarty: najbliższe pomieszczenie do przeszukania, potem piętra
    const pl = planOf(w, target);
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const [room, tile] of pl.rooms) {
      if (bad.has(`loot:${target}:${room}`) || moznaPrzeszukac(st, w, k, room) !== 'tak') continue;
      const d = dist(w, p, tile);
      if (d < bd) {
        bd = d;
        best = room;
      }
    }
    if (best >= 0)
      return send(
        { t: 'loot', ids: [p.id], bid: target, room: best },
        `loot:${target}:${best}`,
        'loot',
        `przeszukanie u sąsiadów`,
      );
    if (rec.pietra < pietraBudynku(w, target)) {
      const stairs = pl.stairs.find((t) => !bad.has(`up:${target}:${t}`));
      if (stairs !== undefined)
        return send(
          { t: 'upstairs', ids: [p.id], bid: target, tile: stairs },
          `up:${target}:${stairs}`,
          'upstairs',
          'piętro u sąsiadów',
        );
    }
    done.add(target);
  };
  return { player, log };
}

const dist = (w: World, p: Pawn, tile: number) => ((tile % w.size) - p.x) ** 2 + (Math.floor(tile / w.size) - p.y) ** 2;

/** najbliższy siedzibie budynek z drzwiami, mieszkalny albo usługowy, którego gracz jeszcze nie skończył */
function nearestBuilding(w: World, p: Pawn, done: Set<number>): number {
  const door = w.buildings[w.hq].entrances[0]?.out ?? 0;
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (const b of w.buildings) {
    if (b.id === w.hq || !b.entrances.length || done.has(b.id)) continue;
    if (!mieszkalny(w, b.id) && b.cls !== 'sklep' && b.cls !== 'przychodnia') continue;
    const d = Math.min(
      ...b.entrances.map((e) => dist(w, { ...p, x: door % w.size, y: Math.floor(door / w.size) }, e.out)),
    );
    if (d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}

/** Plan budynku dla gracza: środek posadzki każdego pomieszczenia i po jednym kafelku z każdego ciągu schodów (klatki),
    w prostokącie budynku. */
function budynekPlan(w: World, bid: number): { rooms: Map<number, number>; stairs: number[] } {
  const it = wnetrze(w, bid);
  const b = w.buildings[bid];
  const size = w.size;
  const floors = new Map<number, number[]>();
  const stairs: number[] = [];
  const seen = new Set<number>();
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const i = y * size + x;
      if (w.bid[i] !== bid) continue;
      if (it.cell[i] === IN.FLOOR && it.room[i] >= 0) {
        const list = floors.get(it.room[i]);
        if (list) list.push(i);
        else floors.set(it.room[i], [i]);
      }
      if (it.cell[i] === IN.STAIRS && !seen.has(i)) {
        // cały ciąg schodów naraz: jeden kafelek na klatkę
        stairs.push(i);
        const q = [i];
        seen.add(i);
        while (q.length) {
          const c = q.pop()!;
          for (const n of [c - size, c + 1, c - 1, c + size])
            if (n >= 0 && n < size * size && !seen.has(n) && it.cell[n] === IN.STAIRS) {
              seen.add(n);
              q.push(n);
            }
        }
      }
    }
  const rooms = new Map<number, number>();
  for (const [r, list] of floors) rooms.set(r, list[Math.floor(list.length / 2)]);
  return { rooms, stairs };
}
