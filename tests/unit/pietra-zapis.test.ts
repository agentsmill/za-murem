/* Flaga pięter (?pietra=1) w zapisie gry: pole `pietra` jest opcjonalne, zły kształt odrzuca zapis, a o fladze
   wczytanej gry decyduje zapis, nie adres (src/ui/zapis.ts). */

import { describe, expect, it } from 'vitest';
import { pietraWlaczone, readSave, SAVE_KEY, type Save, writeSave } from '../../src/ui/zapis.ts';

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
