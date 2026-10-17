import { describe, expect, it } from 'vitest';
import { playWithGov } from './gov-play.ts';
import { mockBlock } from './interior-mock.ts';

const w = mockBlock();

describe('gra z zarządem (bot)', () => {
  it('dwie noce z wartą: okna zarządu odpowiedziane, warta stoi, napady zgodne z raportem zarządu', () => {
    const r = playWithGov(w, 3, 'zawsze-warta', 3);
    const kinds = new Set(r.decisions.map((d) => d.kind));
    for (const k of ['polecenie', 'uchwala', 'karta', 'raport']) expect(kinds).toContain(k);
    expect(r.nights.length).toBeGreaterThanOrEqual(2);
    for (const n of r.nights) {
      expect(n.guards).toBeGreaterThan(0);
      // co zarząd napisał w raporcie, to szabrownicy odegrali i tyle zginęło
      if (n.report === 'wtargnięcie' || n.report === 'odparty') expect(n.raid?.outcome).toBe(n.report);
      if (n.report === 'wtargnięcie') expect(n.raid!.took).toEqual(n.stolen);
      if (n.report === 'brak') expect(n.raid).toBeNull();
    }
    // nikt nie został na zawsze za mapą ani na warcie w dzień
    expect(r.st.pawns.some((p) => p.kind === 'szabrownik')).toBe(false);
  });

  it('bez warty i ten sam przebieg dla tego samego ziarna', () => {
    const a = playWithGov(w, 5, 'nigdy-warty', 2);
    for (const n of a.nights) expect(n.guards).toBe(0);
    expect(playWithGov(w, 5, 'nigdy-warty', 2).hash).toBe(a.hash);
  });
});
