/* Wybór piętra w widoku (etap 1 widoku pięter, docs/superpowers/specs/2026-10-18-pietra-design.md, „Rysowanie
   i pamięć” i „Przełącznik”): czyste funkcje, które decydują, które kawałki mapy dostają przekrój i co przy tym
   widać. GameView (view.ts) tylko je woła. Bez PixiJS i DOM, więc da się je sprawdzić w Node. */

import { CHUNK, type ChunkScene } from './art/scene.ts';

/** dokłada do out kawałki, które dotyka obrys (prostokąt) budynku */
function dolozObrys(out: Set<number>, b: ChunkScene['w']['buildings'][number], n: number): void {
  for (let cy = Math.floor(b.y0 / CHUNK); cy <= Math.floor(b.y1 / CHUNK); cy++)
    for (let cx = Math.floor(b.x0 / CHUNK); cx <= Math.floor(b.x1 / CHUNK); cx++) out.add(cy * n + cx);
}

/**
 * Kawałki mapy z przekrojem piętra L (od 1): każdy kawałek, który dotyka obrysu jakiegokolwiek budynku o więcej niż
 * L kondygnacjach, bo tylko w takim budynku piętro L w ogóle istnieje. Liczy się `levels` budynku, a nie z jego stylu:
 * styl tnie je do 16 (wysokość fasady), a lista pięter sięga do `levels` minus 1 (17 kondygnacji na Przymorzu to piętro
 * 16). Numer kawałka to cy * sc.chunks + cx, jak w slotach widoku. Dla L poniżej 1 zbiór jest pusty: parter ma
 * przekrój tylko w siedzibie i jej otwartych sąsiadach (chunkiParteru).
 */
export function chunkiPietra(sc: Pick<ChunkScene, 'w' | 'chunks'>, L: number): Set<number> {
  const out = new Set<number>();
  if (L < 1) return out;
  for (const b of sc.w.buildings) if (b.levels > L) dolozObrys(out, b, sc.chunks);
  return out;
}

/**
 * Kawałki mapy z przekrojem parteru (piętro 0), czyli tak jak zawsze: siedziba i otwarci sąsiedzi
 * (section.otwarte, M2 fala 2). Bez przekroju sceny zbiór jest pusty.
 */
export function chunkiParteru(sc: Pick<ChunkScene, 'w' | 'chunks' | 'section'>): Set<number> {
  const out = new Set<number>();
  const sec = sc.section;
  if (!sec) return out;
  for (const id of [sec.building, ...(sec.otwarte ?? [])]) dolozObrys(out, sc.w.buildings[id], sc.chunks);
  return out;
}

/**
 * Co pokazuje widok przy przekroju (cutOn: zbliżenie nad sceną z wnętrzem) i wybranym piętrze L:
 * wnetrza — widać osoby, meble, światła i plany we wnętrzach parteru (przekrój na parterze);
 * aktywne — przekrój piętra: na mapie rysuje się piętro, a wnętrza parteru zostają schowane jak pod dachem.
 */
export function widokPietra(cutOn: boolean, L: number): { wnetrza: boolean; aktywne: boolean } {
  return { wnetrza: cutOn && L === 0, aktywne: cutOn && L >= 1 };
}
