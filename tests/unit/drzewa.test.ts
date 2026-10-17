import { describe, expect, it } from 'vitest';
import { treeKey, treeReady, treeSprite } from '../../src/render/art/trees.ts';
import { behindCrown } from '../../src/render/treeLayer.ts';
import type { Tree } from '../../src/world/world.ts';
import { fakeDocument } from '../../tools/arkusz-plotno.ts';

const tree = (o: Partial<Tree> = {}): Tree => ({ x: 20.5, y: 30.2, kind: 0, r: 2.2, seed: 17, ...o });

describe('drzewa jako sprite’y w warstwie pionków', () => {
  it('za koroną: na północ od pnia i w jej obrysie; przed pniem i z boku nie', () => {
    const t = tree();
    expect(behindCrown(t, 20.5, 29.2)).toBe(true);
    expect(behindCrown(t, 21.8, 27.5)).toBe(true);
    expect(behindCrown(t, 20.5, 30.8)).toBe(false);
    expect(behindCrown(t, 24, 29.2)).toBe(false);
    // wysoko nad koroną (daleko na północ) już nie
    expect(behindCrown(t, 20.5, 30.2 - 2.2 * 2 - 1.5)).toBe(false);
    // krzak: korona tuż przy ziemi, więc zasłania tylko blisko
    expect(behindCrown(tree({ kind: 2, r: 0.8 }), 20.5, 28.5)).toBe(false);
  });

  it('klucz wyglądu jak w pamięci sprite’ów: po narysowaniu drzewo jest gotowe', () => {
    fakeDocument();
    const t = tree({ seed: 1234567, r: 1.9 });
    expect(treeKey(t)).toBe(treeKey({ ...t, x: 99, y: 3 }));
    expect(treeKey(t)).not.toBe(treeKey({ ...t, r: 2.6 }));
    expect(treeReady(t)).toBe(false);
    const sp = treeSprite(t);
    expect(treeReady(t)).toBe(true);
    expect(treeSprite({ ...t, x: 5 })).toBe(sp);
  });
});
