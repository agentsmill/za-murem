import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { modeOf } from '../../src/sim/tryb.ts';
import { czesciSwiata, graj, przebieg, skrotSwiata } from '../../tools/determinizm/przebieg.ts';

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

  it('hak krok widzi najpierw budowę świata (krok −1), potem każdy krok symulacji raz i po kolei, a wynik się nie zmienia', () => {
    const bez = przebieg({ geo, seed: 5, godziny: 2, tryb: 'zwykly' });
    const kroki: number[] = [];
    const z = przebieg({ geo, seed: 5, godziny: 2, tryb: 'zwykly' }, { krok: (tick) => kroki.push(tick) });
    expect(z).toEqual(bez);
    expect(kroki).toHaveLength(1 + 2 * 800);
    expect(kroki[0]).toBe(-1);
    expect(kroki.every((t, i) => t === i - 1)).toBe(true);
  });

  it('części świata mówią, co się rozjechało: kafelki, budynki, drzewa, kąt obrotu albo reszta', () => {
    const swiat = graj({ geo, seed: 5, godziny: 0, tryb: 'zwykly' }).swiat;
    const bazowe = czesciSwiata(swiat);
    expect(Object.keys(bazowe).sort()).toEqual(['budynki', 'drzewa', 'kafelki', 'kat', 'reszta']);
    expect(czesciSwiata(graj({ geo, seed: 5, godziny: 0, tryb: 'zwykly' }).swiat)).toEqual(bazowe);
    const wzorzec: Record<string, string> = bazowe;
    const rozne = (a: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== wzorzec[k]);

    swiat.blocked[1000] ^= 1;
    expect(rozne(czesciSwiata(swiat))).toEqual(['kafelki']);
    swiat.blocked[1000] ^= 1;

    // jeden bit w kącie obrotu: tak różnią się silniki w atan2, a kafelki zostają te same
    const kat = swiat.angle;
    swiat.angle = new Float64Array(
      new BigUint64Array([new BigUint64Array(new Float64Array([kat]).buffer)[0] + 1n]).buffer,
    )[0];
    expect(swiat.angle).not.toBe(kat);
    expect(rozne(czesciSwiata(swiat))).toEqual(['kat']);
    swiat.angle = kat;

    swiat.trees[0].x += 1e-12;
    expect(rozne(czesciSwiata(swiat))).toEqual(['drzewa']);
    swiat.trees[0].x -= 1e-12;

    swiat.buildings[0].levels += 1;
    expect(rozne(czesciSwiata(swiat))).toEqual(['budynki']);
    swiat.buildings[0].levels -= 1;

    swiat.hq += 1;
    expect(rozne(czesciSwiata(swiat))).toEqual(['reszta']);
  });

  it('skrót świata jest powtarzalny, zależy od ziarna i zauważa jeden zmieniony kafelek', () => {
    const a = graj({ geo, seed: 5, godziny: 0, tryb: 'zwykly' }).swiat;
    expect(skrotSwiata(graj({ geo, seed: 5, godziny: 0, tryb: 'zwykly' }).swiat)).toBe(skrotSwiata(a));
    expect(skrotSwiata(graj({ geo, seed: 6, godziny: 0, tryb: 'zwykly' }).swiat)).not.toBe(skrotSwiata(a));
    const przed = skrotSwiata(a);
    a.blocked[1000] ^= 1;
    expect(skrotSwiata(a)).not.toBe(przed);
    a.blocked[1000] ^= 1;
    a.trees[0].x += 1e-12;
    expect(skrotSwiata(a)).not.toBe(przed);
  });
});
