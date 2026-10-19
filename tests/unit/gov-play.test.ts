import { describe, expect, it } from 'vitest';
import { ocenDrogi } from '../../src/gov/zwyciestwo.ts';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
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

describe('drogi do zwycięstwa w grze bota (opcja `zwyciestwo`, flaga --zwyciestwo botów)', () => {
  it('bez opcji zarząd nie ma stanu zwycięstwa, z opcją ma, a symulacja idzie tak samo (ten sam skrót)', () => {
    const bez = playWithGov(w, 3, 'zawsze-warta', 2);
    expect(bez.gov.zwyciestwo).toBeUndefined();
    const z = playWithGov(w, 3, 'zawsze-warta', 2, 4, { zwyciestwo: {} });
    expect(z.gov.zwyciestwo).toBeDefined();
    expect(z.hash).toBe(bez.hash);
  });

  it('`po` woła się co sekundę przy ekranie, a ludnosc2021 idzie do każdego wejścia i daje cel z połowy spisu', () => {
    const spis = new Set<number | undefined>();
    const cele = new Set<number>();
    let kroki = 0;
    playWithGov(w, 3, 'zawsze-warta', 2, 4, {
      zwyciestwo: {
        ludnosc2021: 1000,
        po: (gov, i) => {
          kroki++;
          spis.add(i.ludnosc2021);
          cele.add(ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!.postep!.cel);
        },
      },
    });
    expect(kroki).toBe((2 * TICKS_PER_DAY) / TICKS_PER_SECOND);
    expect([...spis]).toEqual([1000]);
    expect([...cele]).toEqual([500]);
  });

  it('bez ludnosc2021 (bez tabel mieszkańców) cel drogi ludnościowej to 250', () => {
    const cele = new Set<number>();
    playWithGov(w, 3, 'zawsze-warta', 1, 4, {
      zwyciestwo: { po: (gov, i) => cele.add(ocenDrogi(gov, i).find((d) => d.droga === 'ludnosc')!.postep!.cel) },
    });
    expect([...cele]).toEqual([250]);
  });
});
