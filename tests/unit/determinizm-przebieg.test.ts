import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { modeOf } from '../../src/sim/tryb.ts';
import { graj, przebieg } from '../../tools/determinizm/przebieg.ts';

/** dane dema z public/demo (to samo, co strona testowa pobiera przez fetch) */
const demo = (klucz: string) =>
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${klucz}.json`), 'utf8'));
const geo = demo('przymorze').geo;

describe('przebieg gry do porównań silników', () => {
  it('przebieg w Node jest powtarzalny i ma skrót na każdą godzinę', () => {
    const a = przebieg({ geo, seed: 12345, godziny: 24, tryb: 'zwykly' });
    const b = przebieg({ geo, seed: 12345, godziny: 24, tryb: 'zwykly' });
    expect(a).toHaveLength(24);
    expect(a).toEqual(b);
  });

  it('scenariusz naprawdę gra: drzewo ścięte, mieszkanie przeszukane, zarząd odpowiedział na kartę nocy', () => {
    const r = graj({ geo, seed: 12345, godziny: 24, tryb: 'zwykly' });
    // ścięcie suchego drzewa w pierwszej godzinie
    expect(r.sim.st.felled.length).toBeGreaterThan(0);
    // przeszukanie mieszkania w drugiej dobie (gra startuje o 15:00 dnia 1, doba 2 trwa do końca 24. godziny)
    expect(r.sim.st.apts.reduce((n, a) => n + a.searched.length, 0)).toBeGreaterThan(0);
    // karta nocy o 20:00 zatwierdzona z wartą, a rano raport
    expect(r.gov.cardDay).toBeGreaterThanOrEqual(1);
    expect(r.gov.reports.length).toBeGreaterThanOrEqual(1);
    expect(r.gov.decisions.length).toBeGreaterThan(0);
  });

  it('inne ziarno i inny tryb dają inne skróty, a tryb zombie jest powtarzalny', () => {
    const zwykly = przebieg({ geo, seed: 12345, godziny: 12, tryb: 'zwykly' });
    expect(przebieg({ geo, seed: 777, godziny: 12, tryb: 'zwykly' })).not.toEqual(zwykly);
    const zombie = przebieg({ geo, seed: 12345, godziny: 12, tryb: 'zombie' });
    expect(zombie).not.toEqual(zwykly);
    expect(przebieg({ geo, seed: 12345, godziny: 12, tryb: 'zombie' })).toEqual(zombie);
    expect(modeOf(graj({ geo, seed: 12345, godziny: 1, tryb: 'zombie' }).sim.st)).toBe('zombie');
  });

  it('hak krok widzi każdy krok symulacji raz i po kolei, a wynik się nie zmienia', () => {
    const bez = przebieg({ geo, seed: 5, godziny: 2, tryb: 'zwykly' });
    const kroki: number[] = [];
    const z = przebieg({ geo, seed: 5, godziny: 2, tryb: 'zwykly' }, { krok: (tick) => kroki.push(tick) });
    expect(z).toEqual(bez);
    expect(kroki).toHaveLength(2 * 800);
    expect(kroki[0]).toBe(0);
    expect(kroki.every((t, i) => t === i)).toBe(true);
  });
});
