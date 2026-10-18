/* Przekrój otwartych sąsiednich budynków (M2 fala 2): wnętrze dokłada się do przekroju siedziby w głównym wątku
   i w kopii sceny workera tak samo, wnętrze świata (czyta je symulacja) zostaje bez zmian, numery pomieszczeń
   sąsiada nie zachodzą na siedzibę, a drzwi sąsiadów wyglądają według stanu. Na demie Lanciego (blok 10F obok
   siedziby). */

import { describe, expect, it } from 'vitest';
import { buildScene, CHUNK, chunkSceneOf } from '../../src/render/art/scene.ts';
import { applyScenePatch, chunksTouched, scenePatchOf } from '../../src/render/chunks.ts';
import { isLokator } from '../../src/render/game.ts';
import { PrzekrojSasiadow } from '../../src/render/przekrojSasiadow.ts';
import { describeTile, IN, sectionOf } from '../../src/render/section.ts';
import { wnetrze } from '../../src/sim/sasiedzi.ts';
import { core, demoWorld, doorWhere, newGame, until } from './sasiedzi-pomoc.ts';

/** gra na Lanciego z otwartym sąsiednim budynkiem (drzwi bez klucza) */
function opened() {
  const w = demoWorld('lanciego');
  const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k);
  const sim = newGame('lanciego');
  const p = core(sim)[0];
  sim.push({ t: 'open', ids: [p.id], door });
  sim.step();
  until(sim, () => p.job?.t !== 'door');
  expect(sim.st.sasiedzi!.budynki.find((b) => b.bid === bid)!.otwarty).toBe(true);
  return { w, sim, bid, door };
}

describe('przekrój sąsiednich budynków', () => {
  it('otwarty budynek dokłada wnętrze w oknie i w workerze tak samo, a wnętrze świata zostaje bez zmian', () => {
    const { w, sim, bid } = opened();
    const sc = buildScene(w);
    sc.section = sectionOf(w);
    const worker = structuredClone(chunkSceneOf(sc));
    const hqRooms = sc.section.kinds.length;
    const worldCells = w.interior.cell.reduce((n, c) => n + (c !== IN.NONE ? 1 : 0), 0);
    const ps = new PrzekrojSasiadow();
    const z = ps.zmiany(w, sc.section, sim.st.sasiedzi)!;
    expect(z.wnetrze.map((p) => p.building)).toEqual([bid]);
    expect(z.wnetrze[0].base).toBe(hqRooms);
    const patch = scenePatchOf(sc, z);
    applyScenePatch(sc, patch);
    applyScenePatch(worker, structuredClone(patch));
    // nic nowego: drugi raz pusto
    expect(ps.zmiany(w, sc.section, sim.st.sasiedzi)).toBeNull();
    const sec = sc.section;
    expect(sec.otwarte?.has(bid)).toBe(true);
    expect(worker.section!.cell).toEqual(sec.cell);
    expect(worker.section!.room).toEqual(sec.room);
    // wnętrze świata (siedziba, które widzi symulacja) bez komórek sąsiada
    expect(w.interior.cell.reduce((n, c) => n + (c !== IN.NONE ? 1 : 0), 0)).toBe(worldCells);
    const it = wnetrze(w, bid);
    const floor = [...it.cell.keys()].find((i) => w.bid[i] === bid && it.cell[i] === IN.FLOOR && it.room[i] >= 0)!;
    expect(w.interior.cell[floor]).toBe(IN.NONE);
    expect(sec.cell[floor]).toBe(IN.FLOOR);
    expect(sec.room[floor]).toBe(hqRooms + it.room[floor]);
    expect(describeTile(sec, floor, w.size, 0)).toMatchObject({ kind: 'floor', room: it.rooms[it.room[floor]].kind });
    // przerysowuje się cały prostokąt budynku
    const B = w.buildings[bid];
    const n = sc.chunks;
    const touched = chunksTouched(sc, z);
    for (let cy = Math.floor(B.y0 / CHUNK); cy <= Math.floor(B.y1 / CHUNK); cy++)
      for (let cx = Math.floor(B.x0 / CHUNK); cx <= Math.floor(B.x1 / CHUNK); cx++)
        expect(touched).toContain(cy * n + cx);
  });

  it('drzwi sąsiada: zabite deskami, wyważone jak uszkodzenie drzwi, po otwarciu znowu zwykłe', () => {
    const { w, sim, bid, door } = opened();
    const sc = buildScene(w);
    sc.section = sectionOf(w);
    const ps = new PrzekrojSasiadow();
    applyScenePatch(sc, scenePatchOf(sc, ps.zmiany(w, sc.section, sim.st.sasiedzi)!));
    const d = sim.st.sasiedzi!.budynki.find((b) => b.bid === bid)!.drzwi.find((x) => x.t === door)!;
    const look = (s: typeof d.s) => {
      d.s = s;
      const z = ps.zmiany(w, sc.section!, sim.st.sasiedzi);
      if (z) applyScenePatch(sc, scenePatchOf(sc, z));
      return { z, tile: describeTile(sc.section!, door, w.size, 0) };
    };
    const zab = look('zabite');
    expect(zab.z?.drzwi).toEqual([{ tile: door, look: 'zabite' }]);
    expect(zab.tile).toMatchObject({ kind: 'door', boarded: true });
    const wyw = look('wywazone');
    expect(wyw.tile).toMatchObject({ kind: 'door', broken: true });
    expect(wyw.tile).not.toHaveProperty('boarded', true);
    const otw = look('otwarte');
    expect(otw.tile).toMatchObject({ kind: 'door' });
    expect(otw.tile).not.toHaveProperty('broken', true);
    // ten sam stan drugi raz: nic do przerysowania
    expect(look('otwarte').z).toBeNull();
  });

  it('lokatora sąsiada z osobą da się wybrać jak mieszkańca, bez osoby nie', () => {
    expect(isLokator({ kind: 'sasiad', person: 3, away: false, x: 0, y: 0 })).toBe(true);
    expect(isLokator({ kind: 'sasiad', person: -1, away: false, x: 0, y: 0 })).toBe(false);
    expect(isLokator({ kind: 'resident', person: 0, away: false, x: 0, y: 0 })).toBe(true);
    expect(isLokator({ kind: 'stranger', person: 0, away: false, x: 0, y: 0 })).toBe(false);
  });
});
