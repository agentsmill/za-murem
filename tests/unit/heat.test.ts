import { describe, expect, it } from 'vitest';
import { clockOf, outdoorTemp, START_MINUTES, seasonOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { HEAT_EVERY, heatStep, KOZA_TARGET, type RoomKind } from '../../src/sim/house.ts';

/** tick o danej godzinie danego dnia (dzień 1 zaczyna się o START_MINUTES) */
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - START_MINUTES / 60) * TICKS_PER_HOUR);
/** kroków modelu ciepła na godzinę gry */
const PER_HOUR = TICKS_PER_HOUR / HEAT_EVERY;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

describe('temperatura na zewnątrz', () => {
  it('gra zaczyna się o 15:00 jesienią, czyli w październiku, przy 5–17°C', () => {
    expect(clockOf(0)).toBe('15:00');
    expect(seasonOf(0)).toBe(0);
    for (let seed = 1; seed <= 30; seed++) {
      const t = outdoorTemp(seed, 0);
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeLessThanOrEqual(17);
    }
  });

  it('pory roku zmieniają się co 10 dni: jesień, zima, wiosna, lato', () => {
    expect([10, 11, 20, 21, 30, 31, 40, 41].map((d) => seasonOf(atHour(d, 12)))).toEqual([0, 1, 1, 2, 2, 3, 3, 0]);
  });

  it('zima jest najzimniejsza, lato najcieplejsze', () => {
    const season = (s: number) => {
      const out: number[] = [];
      for (let d = s * 10 + 1; d <= s * 10 + 10; d++)
        for (let h = 0; h < 24; h += 3) if (atHour(d, h) >= 0) out.push(outdoorTemp(1, atHour(d, h)));
      return mean(out);
    };
    const [jesien, zima, wiosna, lato] = [0, 1, 2, 3].map(season);
    expect(zima).toBeLessThan(jesien);
    expect(zima).toBeLessThan(wiosna);
    expect(lato).toBeGreaterThan(wiosna);
    expect(lato).toBeGreaterThan(jesien);
  });

  it('najcieplej po południu, najzimniej w nocy', () => {
    const diff: number[] = [];
    for (let d = 2; d <= 40; d++) diff.push(outdoorTemp(3, atHour(d, 14)) - outdoorTemp(3, atHour(d, 2)));
    expect(mean(diff)).toBeGreaterThan(4);
  });

  it('pogoda nie skacze o północy w środku pory roku', () => {
    for (const d of [2, 3, 5, 8, 13, 17, 24, 36]) {
      const before = outdoorTemp(5, atHour(d, 23.95));
      const after = outdoorTemp(5, atHour(d + 1, 0));
      expect(Math.abs(after - before)).toBeLessThan(1);
    }
  });

  it('ta sama pogoda dla tego samego ziarna, inna dla innego', () => {
    const a = [1, 2, 3, 4, 5].map((d) => outdoorTemp(7, atHour(d, 9)));
    expect([1, 2, 3, 4, 5].map((d) => outdoorTemp(7, atHour(d, 9)))).toEqual(a);
    expect([1, 2, 3, 4, 5].map((d) => outdoorTemp(8, atHour(d, 9)))).not.toEqual(a);
  });
});

describe('ciepło w pomieszczeniach', () => {
  // kuchnia (0) z kozą, przedpokój (1) przez drzwi, pokój (2) za przedpokojem, klatka (3) za przedpokojem,
  // obcy pokój (4) bez drzwi do mieszkania
  const kinds: RoomKind[] = ['kuchnia', 'przedpokoj', 'pokoj', 'klatka', 'pokoj'];
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [1, 3],
  ];

  it('kuchnia z palącą się kozą dochodzi do około 20°C i nie przestrzela', () => {
    const temps = [9, 9, 9, 9, 9];
    let prev = temps[0];
    for (let k = 0; k < 12 * PER_HOUR; k++) {
      heatStep(temps, kinds, links, [0], 12);
      expect(temps[0]).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(temps[0]).toBeLessThanOrEqual(KOZA_TARGET + 1e-9);
      prev = temps[0];
    }
    expect(temps[0]).toBeGreaterThan(19.5);
    expect(KOZA_TARGET).toBeGreaterThanOrEqual(19);
    expect(KOZA_TARGET).toBeLessThanOrEqual(22);
  });

  it('drzwi przenoszą ciepło: za każdymi drzwiami mniej, bez drzwi tylko pogoda', () => {
    const temps = [9, 9, 9, 9, 9];
    for (let k = 0; k < 24 * PER_HOUR; k++) heatStep(temps, kinds, links, [0], 12);
    const [kuchnia, przedpokoj, pokoj, , obcy] = temps;
    expect(przedpokoj).toBeLessThan(kuchnia - 1);
    expect(pokoj).toBeLessThan(przedpokoj - 0.5);
    expect(pokoj).toBeGreaterThan(obcy + 0.5);
    // obcy pokój doszedł do temperatury z zewnątrz z izolacją i nic więcej
    expect(Math.abs(obcy - 14)).toBeLessThan(1);
    // przedpokój dostaje mniej więcej połowę ocieplenia kuchni
    const half = (przedpokoj - obcy) / (kuchnia - obcy);
    expect(half).toBeGreaterThan(0.35);
    expect(half).toBeLessThan(0.65);
  });

  it('zimna kuchnia (9°C) z rozpaloną kozą ma 18°C po godzinie albo dwóch gry', () => {
    const temps = [9, 9, 9, 9, 9];
    let steps = 0;
    while (temps[0] < 18 && steps < 10 * PER_HOUR) {
      heatStep(temps, kinds, links, [0], 12);
      steps++;
    }
    expect(steps / PER_HOUR).toBeGreaterThan(1);
    expect(steps / PER_HOUR).toBeLessThan(2);
  });

  it('bez ognia pomieszczenie tylko powoli dąży do temperatury z zewnątrz', () => {
    const temps = [9, 9, 9, 9, 9];
    for (let k = 0; k < 3 * PER_HOUR; k++) heatStep(temps, kinds, links, [], 14);
    for (const t of temps) {
      expect(t).toBeGreaterThan(9);
      expect(t).toBeLessThan(11.5);
    }
    for (let k = 0; k < 60 * PER_HOUR; k++) heatStep(temps, kinds, links, [], 14);
    expect(Math.abs(temps[0] - 16)).toBeLessThan(0.5);
    expect(Math.abs(temps[3] - 14)).toBeLessThan(0.5);
  });

  it('po zgaszeniu kozy kuchnia stygnie stopniowo, bez skoku', () => {
    const temps = [9, 9, 9, 9, 9];
    for (let k = 0; k < 8 * PER_HOUR; k++) heatStep(temps, kinds, links, [0], 12);
    const warm = temps[0];
    heatStep(temps, kinds, links, [], 12);
    expect(warm - temps[0]).toBeLessThan(0.2);
    for (let k = 0; k < 3 * PER_HOUR; k++) heatStep(temps, kinds, links, [], 12);
    expect(temps[0]).toBeLessThan(warm - 1);
    expect(temps[0]).toBeGreaterThan(14);
  });
});
