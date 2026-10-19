/* Flaga pięter (?pietra=1) w zapisie gry: pole `pietra` jest opcjonalne, zły kształt odrzuca zapis, a o fladze
   wczytanej gry decyduje zapis, nie adres (src/ui/zapis.ts). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { pietraWlaczone, readSave, SAVE_KEY, type Save, worldKey, writeSave } from '../../src/ui/zapis.ts';
import type { Loaded } from '../../src/world/load.ts';
import { listaPieter } from '../../src/world/pietra.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

/** najmniejszy zapis, który przechodzi walidację `readSave` (sprawdza tylko wersje i `data.geo`) */
const zapis = (extra: Record<string, unknown> = {}): Save =>
  ({
    v: 1,
    at: 1,
    data: { geo: {} },
    seed: 2051,
    sim: { v: 3 },
    gov: { v: 1 },
    screen: 0,
    ...extra,
  }) as unknown as Save;

describe('flaga pięter w zapisie', () => {
  it('zapis bez pola pietra wczytuje się', () => {
    const store = memory();
    expect(writeSave(zapis(), store)).toBe(true);
    const back = readSave(store);
    expect(back).not.toBeNull();
    expect(back?.pietra).toBeUndefined();
  });

  it('zapis z pietra: true wczytuje się i zachowuje flagę', () => {
    const store = memory();
    expect(writeSave(zapis({ pietra: true }), store)).toBe(true);
    expect(readSave(store)?.pietra).toBe(true);
  });

  it('pietra różne od true odrzuca zapis', () => {
    for (const zle of [false, 1, '1']) {
      const store = memory();
      store.m.set(SAVE_KEY, JSON.stringify(zapis({ pietra: zle })));
      expect(readSave(store), `pietra: ${JSON.stringify(zle)}`).toBeNull();
    }
  });
});

describe('pietraWlaczone', () => {
  const adres = (q: string) => new URLSearchParams(q);

  it('brak zapisu i ?pietra=1 daje true', () => {
    expect(pietraWlaczone(null, adres('?pietra=1'))).toBe(true);
  });
  it('brak zapisu bez parametru daje false', () => {
    expect(pietraWlaczone(null, adres(''))).toBe(false);
  });
  it('zapis z pietra: true bez parametru daje true', () => {
    expect(pietraWlaczone(zapis({ pietra: true }), adres(''))).toBe(true);
  });
  it('zapis bez pola z ?pietra=1 daje false (zapis wygrywa)', () => {
    expect(pietraWlaczone(zapis(), adres('?pietra=1'))).toBe(false);
  });
});

/* Zapis i wczytanie na prawdziwym demie (Zielonki: awans domów coś zmienia), drogą, którą idzie `save()` i `enter()`
   z src/main.ts: zapis z polem `pietra` albo bez, odczyt z pamięci, flaga z `pietraWlaczone`, świat od nowa z danych
   zapisu i jego odcisk, stan symulacji bez zmian. */
describe('zapis i wczytanie gry z widokiem pięter albo bez', () => {
  const adres = (q: string) => new URLSearchParams(q);
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/zielonki.json'), 'utf8'));
  const data: Loaded = { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo' };
  const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
  /** świat jak w `enter`: z danych i ziarna (zapisu), z flagą albo bez */
  const swiat = (dane: Loaded, ziarno: number, pietra: boolean): World =>
    buildWorld(dane.geo, { seed: ziarno, street: dane.street, ...(pietra ? { pietra: true } : {}) });
  const poziomy = (w: World) => w.buildings.map((b) => b.levels);

  /** zapis jak `save()` w main.ts po kilku krokach gry */
  function zapisz(pietra: boolean) {
    const w = swiat(data, seed, pietra);
    const sim = new Sim(w, createSim(w, seed, { core: 4 }));
    for (let i = 0; i < 40; i++) sim.step();
    const s: Save = {
      v: 1,
      at: 1,
      data,
      seed,
      sim: sim.st,
      gov: newGov(seed),
      screen: 12,
      world: worldKey(w),
      ...(pietra ? { pietra: true } : {}),
    };
    const store = memory();
    expect(writeSave(s, store)).toBe(true);
    return { w, sim, s, store };
  }

  it('z flagą: pole pietra przeżywa zapis, flaga wraca bez ?pietra=1, świat ma te same piętra i ten sam odcisk', () => {
    const { w, sim, s, store } = zapisz(true);
    expect(w.buildings.some((b) => b.levels >= 2)).toBe(true);
    expect(JSON.parse(store.m.get(SAVE_KEY)!).pietra).toBe(true);
    const back = readSave(store)!;
    expect(back.pietra).toBe(true);
    // wczytana gra zachowuje to, z czym ją zaczęto, niezależnie od adresu
    expect(pietraWlaczone(back, adres(''))).toBe(true);
    expect(pietraWlaczone(back, adres('?pietra=1'))).toBe(true);
    // enter: świat od nowa z danych i ziarna zapisu, z flagą z zapisu
    const w2 = swiat(back.data, back.seed, pietraWlaczone(back, adres('')));
    expect(poziomy(w2)).toEqual(poziomy(w));
    expect(listaPieter(w2)).toEqual(listaPieter(w));
    expect(listaPieter(w2)).toEqual([0, 1]);
    // zapis nie jest „przestarzały” (stale w enter: odcisk świata się zgadza)
    expect(back.world).toBe(worldKey(w2));
    // stan symulacji wraca bez zmian
    expect(new Sim(w2, back.sim).hash()).toBe(sim.hash());
    expect(s.world).toBe(worldKey(w2));
  });

  it('bez flagi: w zapisie nie ma pola pietra, a ?pietra=1 w adresie wczytanej gry go nie włącza', () => {
    const { w, sim, store } = zapisz(false);
    // pola nie ma wcale na najwyższym poziomie zapisu (zapis bez flagi jest taki sam jak sprzed widoku pięter)
    expect('pietra' in JSON.parse(store.m.get(SAVE_KEY)!)).toBe(false);
    const back = readSave(store)!;
    expect(back.pietra).toBeUndefined();
    expect('pietra' in back).toBe(false);
    // zapis wygrywa z adresem: gra zaczęta bez flagi zostaje bez niej
    expect(pietraWlaczone(back, adres('?pietra=1'))).toBe(false);
    const w2 = swiat(back.data, back.seed, pietraWlaczone(back, adres('?pietra=1')));
    expect(poziomy(w2)).toEqual(poziomy(w));
    expect(w2.buildings.some((b) => b.levels >= 2)).toBe(false);
    expect(listaPieter(w2)).toEqual([0]);
    expect(back.world).toBe(worldKey(w2));
    expect(new Sim(w2, back.sim).hash()).toBe(sim.hash());
  });

  it('zapis sprzed widoku pięter (bez pola) wczytuje się jak zapis bez flagi, nowa gra czyta adres', () => {
    const { store } = zapisz(false);
    // stary zapis: ten sam JSON bez pola pietra (którego i tak nie ma)
    const stary = JSON.parse(store.m.get(SAVE_KEY)!);
    delete stary.pietra;
    store.m.set(SAVE_KEY, JSON.stringify(stary));
    const back = readSave(store);
    expect(back).not.toBeNull();
    expect(pietraWlaczone(back, adres(''))).toBe(false);
    expect(pietraWlaczone(back, adres('?pietra=1'))).toBe(false);
    // bez zapisu (nowa gra) decyduje adres
    expect(pietraWlaczone(null, adres('?pietra=1'))).toBe(true);
    expect(pietraWlaczone(null, adres(''))).toBe(false);
  });

  it('odcisk świata z flagą i bez jest ten sam, więc zapis z jedną flagą nie jest przestarzały przy drugiej', () => {
    expect(worldKey(swiat(data, seed, true))).toBe(worldKey(swiat(data, seed, false)));
  });
});
