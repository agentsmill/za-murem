/* Siatka i światło dla zarządu: dziury z World.fence z nazwą miejsca do tekstów karty nocy i raportu (w obu
   językach, Tx). Czyste funkcje świata i stanu, bez DOM. Łatanie dziur i zamykanie bramy przyjdą z symulacją
   (skutek patch), wtedy stan siatki trzeba brać z niej, a nie ze startu świata. */

import { type Tx, tx } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { GovFence, GovLight } from '../gov/typy.ts';
import type { SimState } from '../sim/sim.ts';
import type { World } from '../world/world.ts';

const DIRS = [
  'od wschodu',
  'od południowego wschodu',
  'od południa',
  'od południowego zachodu',
  'od zachodu',
  'od północnego zachodu',
  'od północy',
  'od północnego wschodu',
];
const DIRS_EN = [
  'on the east side',
  'on the south-east side',
  'on the south side',
  'on the south-west side',
  'on the west side',
  'on the north-west side',
  'on the north side',
  'on the north-east side',
];
const ORD = ['', 'druga', 'trzecia', 'czwarta'];
const ORD_EN = ['', 'second', 'third', 'fourth'];

/** wielkość dziury 0,4–0,85 z kafelka i ziarna, zawsze ta sama dla tego samego osiedla */
function holeSize(tile: number, seed: number): number {
  let h = Math.imul(tile ^ seed, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return Math.round((0.4 + ((h >>> 8) % 46) / 100) * 100) / 100;
}

type FenceSrc = Pick<World, 'size' | 'seed'> & {
  fence?: { tiles: number[]; hole: number[]; yard: number[] };
  trees?: World['trees'];
  dryTree?: number;
  props?: { kind: string; x: number; y: number }[];
};

/** Dziury w siatce dla GovInput.fence: id od 1 w kolejności kafelków, nazwa z kierunku od środka
    podwórka („przy dziurze od północy”), a tuż przy trzepaku albo suchym drzewie od nich. Nazwa przy
    trzepaku ze słownika miejsca (w domu jej nie ma: trzepak zastąpią rzeczy z ogrodu). Bez siatki
    w świecie: undefined (zarząd sam zakłada jedną dziurę i bramę). */
export function govFence(w: FenceSrc, words: Words = wordsOf(BLOK), e: WordsEn = wordsEn(BLOK)): GovFence | undefined {
  const f = w.fence;
  if (!f) return undefined;
  const size = w.size;
  const yard = f.yard.length ? f.yard : f.tiles;
  const cx = yard.reduce((a, t) => a + (t % size), 0) / Math.max(1, yard.length);
  const cy = yard.reduce((a, t) => a + Math.floor(t / size), 0) / Math.max(1, yard.length);
  // trzepak, jeśli świat go postawił (bez miejsca na niego pierwsze w props są sterty)
  const zaTrzepakiem = words.zaTrzepakiem;
  const trzepak = zaTrzepakiem ? w.props?.find((p) => p.kind === 'trzepak') : undefined;
  const dry = w.dryTree !== undefined && w.dryTree >= 0 ? w.trees?.[w.dryTree] : undefined;
  const used = new Map<string, number>();
  const holes = f.hole.map((t, k) => {
    const x = (t % size) + 0.5;
    const y = Math.floor(t / size) + 0.5;
    let name: Tx;
    if (trzepak && zaTrzepakiem && Math.hypot(trzepak.x - x, trzepak.y - y) < 4)
      name = tx(zaTrzepakiem, e.zaTrzepakiem ?? 'behind the carpet rack');
    else if (dry && Math.hypot(dry.x - x, dry.y - y) < 4) name = tx('przy suchym drzewie', 'by the dead tree');
    else {
      const a = Math.atan2(y - cy, x - cx);
      const d = (Math.round(a / (Math.PI / 4)) + 8) % 8;
      name = tx(DIRS[d], DIRS_EN[d]);
    }
    const n = used.get(name.pl) ?? 0;
    used.set(name.pl, n + 1);
    // druga dziura z tej samej strony: „przy dziurze od północy, druga”, „at the hole on the north side (second)”
    const o = Math.min(n, 3);
    return {
      id: k + 1,
      size: holeSize(t, w.seed),
      name: n ? tx(`${name.pl}, ${ORD[o]}`, `${name.en} (${ORD_EN[o]})`) : name,
    };
  });
  return { holes, durability: 0.5 };
}

/** światło przy siatce: ognisko z rzeczy symulacji (gdy przyjdzie), lampy przy bramie jeszcze nie ma */
export function govLight(st: SimState): GovLight {
  return { campfire: st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0), gateLamp: false };
}
