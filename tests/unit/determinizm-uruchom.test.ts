import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { odkodujWywolania, type WywolanieJson } from '../../tools/determinizm/nagrywanie.ts';
import { czesciSwiata, graj, przebieg, skrotSwiata } from '../../tools/determinizm/przebieg.ts';
import { uruchom } from '../../tools/determinizm/uruchom.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/zielonki.json'), 'utf8'));
const dane = { geo: demo.geo, street: demo.street as string };

describe('wspólne wejście nóg silników', () => {
  it('z łatką mat budowa świata używa deterministycznej matematyki (każde hypot to sqrt sumy kwadratów), a po przebiegu wraca Math', () => {
    const oryginaly = [Math.hypot, Math.atan2, Math.sin, Math.cos];
    const z = { demo: 'lanciego', godziny: 1, tryb: 'zwykly', seed: 9, powtorz: 1, nagraj: { od: -1, do: 0 } } as const;
    const demoL = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/lanciego.json'), 'utf8'),
    );
    const daneL = { geo: demoL.geo, street: demoL.street as string };
    const hypoty = (nagranie: WywolanieJson[] | undefined) =>
      odkodujWywolania(nagranie ?? []).filter(([nazwa]) => nazwa === 'hypot');
    const natywne = hypoty(uruchom(z, daneL, () => 0).biegi[0].nagranie);
    const lat = hypoty(uruchom({ ...z, latka: 'mat' }, daneL, () => 0).biegi[0].nagranie);
    expect([Math.hypot, Math.atan2, Math.sin, Math.cos]).toEqual(oryginaly);
    expect(natywne.length).toBeGreaterThan(1000);
    expect(lat.length).toBe(natywne.length);
    // natywny hypot w V8 różni się od sqrt sumy kwadratów w co trzecim wywołaniu na kratce, łatka nigdy
    expect(natywne.some(([, [a, b], wynik]) => wynik !== Math.sqrt(a * a + b * b))).toBe(true);
    expect(lat.every(([, [a, b], wynik]) => wynik === Math.sqrt(a * a + b * b))).toBe(true);
  });

  it('na życzenie oddaje tablice kafelków świata (teren, numery budynków, przejścia) pierwszego przebiegu', () => {
    const z = { demo: 'zielonki', godziny: 1, tryb: 'zwykly', seed: 9, powtorz: 2 } as const;
    const bez = uruchom(z, dane, () => 0);
    expect(bez.biegi[0].kafelki).toBeUndefined();
    const r = uruchom({ ...z, kafelki: true }, dane, () => 0);
    const swiat = graj({ ...dane, seed: 9, godziny: 0, tryb: 'zwykly' }).swiat;
    expect(r.biegi[0].kafelki).toEqual({
      size: swiat.size,
      terr: Array.from(swiat.terr),
      bid: Array.from(swiat.bid),
      blocked: Array.from(swiat.blocked),
    });
    // tylko pierwszy przebieg: drugi ma być lekki
    expect(r.biegi[1].kafelki).toBeUndefined();
  });

  it('powtarza przebieg w tym samym procesie i liczy czas podanym zegarem', () => {
    let t = 0;
    const r = uruchom({ demo: 'zielonki', godziny: 3, tryb: 'zwykly', seed: 9, powtorz: 3 }, dane, () => (t += 10));
    expect(r.biegi).toHaveLength(3);
    for (const b of r.biegi) {
      expect(b.skroty).toHaveLength(3);
      expect(b.skroty).toEqual(r.biegi[0].skroty);
      expect(b.ms).toBe(10);
    }
    expect(r.biegi[0].skroty).toEqual(przebieg({ ...dane, seed: 9, godziny: 3, tryb: 'zwykly' }));
    // skrót świata (kafelki, budynki, drzewa…) każdy przebieg ma ten sam i zgodny z budową świata wprost
    const swiat = skrotSwiata(graj({ ...dane, seed: 9, godziny: 0, tryb: 'zwykly' }).swiat);
    for (const b of r.biegi) expect(b.swiat).toBe(swiat);
    const czesci = czesciSwiata(graj({ ...dane, seed: 9, godziny: 0, tryb: 'zwykly' }).swiat);
    for (const b of r.biegi) expect(b.swiatCzesci).toEqual(czesci);
  });
});
