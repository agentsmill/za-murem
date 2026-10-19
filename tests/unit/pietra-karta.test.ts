/* Karta sąsiedniego budynku w grze z widokiem pięter (flaga ?pietra=1, docs/superpowers/specs/2026-10-18-pietra-design.md,
   „Wysokości budynków”): wiersz „piętra n z z” (src/ui/budynek.ts) znika z karty otwartego budynku bez schodów we
   wnętrzu, bo polecenie „na piętro” potrzebuje schodów (src/sim/orders.ts), a wnętrza domów schodów nie mają. Bez flagi
   karta jest jak dawniej, także dla domów z danymi o trzech kondygnacjach. */

import { describe, expect, it } from 'vitest';
import { BUDYNEK } from '../../src/content/napisy-sasiedzi.ts';
import { nowyBudynek, pietraBudynku } from '../../src/sim/sasiedzi.ts';
import { kartaBudynku, maSchody, widokBudynku } from '../../src/ui/budynek.ts';
import { demoSwiat } from './pietra-pomoc.ts';

/** otwarty wpis budynku bez zmieniania stanu gry (karta czyta tylko wpis i świat) */
const otwarty = (w: ReturnType<typeof demoSwiat>, bid: number) => ({
  ...nowyBudynek(w, 'zwykly', bid, null),
  otwarty: true,
});

describe('wiersz „piętra n z z” na karcie budynku (widokBudynku)', () => {
  const zielonki = demoSwiat('zielonki', true);
  const lanciego = demoSwiat('lanciego', true);
  /** dom z awansu (druga kondygnacja z flagi) i jego wnętrze bez schodów */
  const dom = zielonki.buildings.find((b) => b.cls === 'dom' && b.levels === 2 && b.id !== zielonki.hq)!;
  /** blok z kondygnacjami i schodami w klatce */
  const blok = lanciego.buildings.find((b) => b.cls === 'blok' && b.levels > 1 && maSchody(lanciego, b.id))!;

  it('wnętrze domu nie ma schodów, wnętrze bloku z klatką ma', () => {
    expect(dom).toBeDefined();
    expect(blok).toBeDefined();
    expect(maSchody(zielonki, dom.id)).toBe(false);
    expect(maSchody(lanciego, blok.id)).toBe(true);
  });

  it('z flagą otwarty dom bez schodów nie ma wiersza o piętrach (nie ma jak ich przeszukać)', () => {
    expect(pietraBudynku(zielonki, dom.id)).toBeGreaterThan(0);
    const v = widokBudynku(zielonki, otwarty(zielonki, dom.id), true, undefined, true);
    expect(v.otwarty).toBe(true);
    expect(v.pietra).toBeNull();
    expect(kartaBudynku(v, false)).not.toMatch(/piętr/);
  });

  it('bez flagi ten sam dom ma wiersz jak dawniej', () => {
    const v = widokBudynku(zielonki, otwarty(zielonki, dom.id), true);
    expect(v.pietra).toEqual({ n: 0, z: pietraBudynku(zielonki, dom.id) });
    const wiersz = BUDYNEK.pietraPrzeszukane(0, v.pietra!.z).pl;
    expect(kartaBudynku(v, false)).toContain(wiersz);
    // flaga wyłączona wprost (false) to samo, co brak parametru
    expect(widokBudynku(zielonki, otwarty(zielonki, dom.id), true, undefined, false)).toEqual(v);
  });

  it('bez flagi dom z danymi o trzech kondygnacjach (Lanciego) też ma wiersz jak dawniej, choć schodów nie ma', () => {
    const bez = demoSwiat('lanciego', false);
    const trzy = bez.buildings.find((b) => b.cls === 'dom' && b.levels === 3)!;
    expect(trzy).toBeDefined();
    expect(maSchody(bez, trzy.id)).toBe(false);
    const v = widokBudynku(bez, otwarty(bez, trzy.id), true);
    expect(v.pietra).toEqual({ n: 0, z: pietraBudynku(bez, trzy.id) });
    expect(kartaBudynku(v, false)).toContain(BUDYNEK.pietraPrzeszukane(0, v.pietra!.z).pl);
  });

  it('z flagą otwarty blok ze schodami zachowuje wiersz o piętrach', () => {
    const wpis = otwarty(lanciego, blok.id);
    const z = widokBudynku(lanciego, wpis, true, undefined, true);
    expect(z.pietra).toEqual({ n: 0, z: pietraBudynku(lanciego, blok.id) });
    expect(z).toEqual(widokBudynku(lanciego, wpis, true));
  });

  it('nieotwarty budynek nie ma wiersza o piętrach z flagą ani bez niej', () => {
    const wpis = nowyBudynek(zielonki, 'zwykly', dom.id, null);
    expect(wpis.otwarty).toBe(false);
    expect(widokBudynku(zielonki, wpis, true, undefined, true).pietra).toBeNull();
    expect(widokBudynku(zielonki, wpis, true).pietra).toBeNull();
  });
});
