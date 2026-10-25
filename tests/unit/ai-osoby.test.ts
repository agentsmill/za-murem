/* Osoby zarządu silnika osady AI (src/ai/osoby.ts), etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md):
   jedno znaczenie „wolnej osoby” dla zimy (rozbiórka sterty na materiał), rozwoju (rozmowa z wędrowcem) i ścinania drewna
   w silniku (src/ai/silnik.ts). Pilnuje trzech rzeczy:
   - `zarzad` i `zarzadNaMiejscu`: pionki rodzaju `core`, z osobami na wyprawie albo bez nich, nigdy tłum, mieszkańcy i wędrowcy;
   - `wolnaOsoba`: na miejscu, nie śpi i nie stoi na warcie; zajęta zwykłą pracą jest wolna (polecenie ją przekieruje);
   - `najblizszaWolna`: najbliższa punktu (kwadrat odległości), przy remisie mniejszy id pionka, bez zajętych, a gdy nikt nie
     jest wolny, undefined.
   Stan gry z prawdziwej gry (Przymorze, ziarno 11, cztery osoby zarządu), pionki ustawione ręcznie na linii: bez kroków symulacji. */

import { describe, expect, it } from 'vitest';
import { nowaGraAi } from '../../src/ai/gra.ts';
import { najblizszaWolna, wolnaOsoba, zarzad, zarzadNaMiejscu } from '../../src/ai/osoby.ts';
import type { Job, JobKind, Pawn, SimState } from '../../src/sim/sim.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

/** praca pionka rodzaju `t`, z wartościami neutralnymi (liczy się tylko rodzaj) */
const praca = (t: JobKind): Job => ({
  t,
  target: -1,
  tile: -1,
  phase: 0,
  from: -1,
  t0: 0,
  until: 0,
  order: false,
  n: 0,
  what: '',
});

/** stan gry z czterema osobami zarządu na linii poziomej: osoba k stoi na (10·k, 0), bez pracy i na miejscu */
function stanNaLinii(): { st: SimState; rdzen: Pawn[] } {
  const st = nowaGraAi(demoWorld('przymorze'), 11).sim.st;
  const rdzen = st.pawns.filter((p) => p.kind === 'core');
  expect(rdzen).toHaveLength(4);
  rdzen.forEach((p, k) => {
    p.x = 10 * k;
    p.y = 0;
    p.job = null;
    p.away = false;
  });
  return { st, rdzen };
}

describe('zarzad i zarzadNaMiejscu', () => {
  it('zarząd to pionki rodzaju core (także na wyprawie), na miejscu bez wyprawy; inne rodzaje nigdy', () => {
    const { st, rdzen } = stanNaLinii();
    expect(zarzad(st)).toEqual(rdzen);
    expect(zarzadNaMiejscu(st)).toEqual(rdzen);
    rdzen[1].away = true;
    expect(zarzad(st)).toHaveLength(4);
    expect(zarzadNaMiejscu(st).map((p) => p.id)).toEqual([rdzen[0].id, rdzen[2].id, rdzen[3].id]);
    const inne = st.pawns.filter((p) => p.kind !== 'core');
    for (const p of inne) expect(zarzad(st)).not.toContain(p);
  });
});

describe('wolnaOsoba', () => {
  it('osoba z zarządu na miejscu jest wolna, także gdy robi zwykłą pracę', () => {
    const { rdzen } = stanNaLinii();
    expect(wolnaOsoba(rdzen[0])).toBe(true);
    rdzen[0].job = praca('chop');
    expect(wolnaOsoba(rdzen[0])).toBe(true);
  });

  it('śpiąca, stojąca na warcie i będąca na wyprawie nie jest wolna', () => {
    const { rdzen } = stanNaLinii();
    const p = rdzen[0];
    p.job = praca('sleep');
    expect(wolnaOsoba(p)).toBe(false);
    p.job = praca('guard');
    expect(wolnaOsoba(p)).toBe(false);
    p.job = null;
    p.away = true;
    expect(wolnaOsoba(p)).toBe(false);
  });

  it('pionek innego rodzaju niż zarząd nie jest wolną osobą', () => {
    const { rdzen } = stanNaLinii();
    expect(wolnaOsoba({ ...rdzen[0], kind: 'wedrowiec' })).toBe(false);
    expect(wolnaOsoba({ ...rdzen[0], kind: 'resident' })).toBe(false);
  });
});

describe('najblizszaWolna', () => {
  it('bierze osobę najbliższą punktu, bez zajętych', () => {
    const { st, rdzen } = stanNaLinii();
    expect(najblizszaWolna(st, { x: 12, y: 0 })?.id).toBe(rdzen[1].id);
    // najbliższa śpi: następna co do odległości (osoba 2 w odległości 8, osoba 0 w odległości 12)
    rdzen[1].job = praca('sleep');
    expect(najblizszaWolna(st, { x: 12, y: 0 })?.id).toBe(rdzen[2].id);
    // odległość liczy się w obu osiach: dwie osoby w jednej kolumnie, punkt bliżej drugiej (przy samej osi x byłby remis)
    rdzen[1].job = null;
    [rdzen[2].x, rdzen[2].y, rdzen[3].x, rdzen[3].y] = [30, 0, 30, 10];
    expect(najblizszaWolna(st, { x: 30, y: 8 })?.id).toBe(rdzen[3].id);
  });

  it('przy tej samej odległości wybiera osobę o mniejszym id, bez względu na kolejność pionków', () => {
    const { st, rdzen } = stanNaLinii();
    const mniejszy = Math.min(rdzen[2].id, rdzen[3].id);
    // punkt równo między osobą 2 (x = 20) i osobą 3 (x = 30), pionki w odwróconej kolejności: pierwszy w tablicy ma większe id
    st.pawns.reverse();
    const kto = najblizszaWolna(st, { x: 25, y: 0 });
    expect(kto?.id).toBe(mniejszy);
  });

  it('pomija osoby na wyprawie i na warcie, a gdy nikt nie jest wolny, oddaje undefined', () => {
    const { st, rdzen } = stanNaLinii();
    rdzen[2].away = true;
    rdzen[3].job = praca('guard');
    expect(najblizszaWolna(st, { x: 25, y: 0 })?.id).toBe(rdzen[1].id);
    rdzen[1].job = praca('sleep');
    expect(najblizszaWolna(st, { x: 25, y: 0 })?.id).toBe(rdzen[0].id);
    rdzen[0].job = praca('sleep');
    expect(najblizszaWolna(st, { x: 25, y: 0 })).toBeUndefined();
  });
});
