/* Kategorie i blokady technologią budowli (docs/superpowers/specs/2026-10-18-menu-budowy-design.md): każda
   budowla ma zakładkę, `tech` odblokowuje ją badaniem z `st.techDone`, a symulacja odrzuca zablokowaną w
   canPlace. Pole techDone jest nieobecne w stanie, dopóki ktoś go nie ustawi, żeby skróty stanu się nie ruszyły. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { BUILD_CATS, BUILDS, type BuildCat, type BuildKind, canPlace, isUnlocked } from '../../src/sim/budowle.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { allowedAnchors, buildMenu } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => {
  for (const k of Object.keys(BUILDS) as BuildKind[]) delete BUILDS[k].tech;
});

describe('kategorie i blokady budowli', () => {
  it('każda budowla ma zakładkę z BUILD_CATS: dom, podwórko albo obwód, a cuda są ostatnie i bez budowli', () => {
    const cat = (k: BuildKind): BuildCat => BUILDS[k].cat;
    expect(BUILD_CATS).toEqual(['dom', 'podworko', 'obwod', 'cuda']);
    expect(
      ['warsztat', 'kuchnia_spoleczna', 'magazyn', 'lozka_pietrowe', 'pracownia'].map((k) => cat(k as BuildKind)),
    ).toEqual(['dom', 'dom', 'dom', 'dom', 'dom']);
    expect(cat('ogrodek')).toBe('podworko');
    expect(cat('zasieki')).toBe('obwod');
    expect((Object.keys(BUILDS) as BuildKind[]).filter((k) => cat(k) === 'cuda')).toEqual([]);
  });

  it('pusta zakładka cuda jest ukryta w menu budowy', () => {
    const menu = buildMenu({}, () => true);
    expect(menu.map((c) => c.key)).toEqual(['dom', 'podworko', 'obwod']);
  });

  it('bez pola tech budowla jest odblokowana, z polem czeka na badanie z techDone', () => {
    for (const k of Object.keys(BUILDS) as BuildKind[]) expect(isUnlocked({}, k)).toBe(true);
    BUILDS.warsztat.tech = 't_test';
    expect(isUnlocked({}, 'warsztat')).toBe(false);
    expect(isUnlocked({ techDone: [] }, 'warsztat')).toBe(false);
    expect(isUnlocked({ techDone: ['t_test'] }, 'warsztat')).toBe(true);
    expect(isUnlocked({}, 'magazyn')).toBe(true);
  });

  it('canPlace odrzuca zablokowaną budowlę z powodem, a po badaniu przyjmuje', () => {
    const st = createSim(w, seed, { core: 4 });
    const a = allowedAnchors(st, w, 'warsztat', 0)[0];
    const [x, y] = [a % w.size, Math.floor(a / w.size)];
    expect(canPlace(st, w, 'warsztat', x, y, 0).ok).toBe(true);
    BUILDS.warsztat.tech = 't_test';
    const locked = canPlace(st, w, 'warsztat', x, y, 0);
    expect(locked.ok).toBe(false);
    expect(locked.why).toBeTruthy();
    st.techDone = ['t_test'];
    expect(canPlace(st, w, 'warsztat', x, y, 0).ok).toBe(true);
  });

  it('techDone nie ma w świeżym stanie ani po new Sim, więc skróty stanu się nie zmieniają', () => {
    const st = createSim(w, seed, { core: 4 });
    expect('techDone' in st).toBe(false);
    expect(JSON.stringify(st)).not.toContain('techDone');
    const sim = new Sim(w, st);
    expect('techDone' in sim.st).toBe(false);
    expect(sim.hash()).toBe(hashString(JSON.stringify(sim.st)));
  });
});
