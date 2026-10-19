/* Lista „moich ludzi” (src/ui/lista.ts): znaczniki stanu (głód, zimno, rana, ugryzienie, sen, warta, wyprawa, badania),
   kolejność i przełączanie klawiszem, tytuły w obu językach, krok kamery za osobą (src/ui/kameraListy.ts) i portret
   wycięty z klatki sprite'a (src/ui/portret.ts). Czyste funkcje bez DOM: wygląd listy ocenia `npm run shots`. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { COLD, HUNGRY } from '../../src/sim/needs.ts';
import type { SimPerson } from '../../src/sim/snapshot.ts';
import { kameraRuszona, krokKamery } from '../../src/ui/kameraListy.ts';
import {
  KOLEJNOSC_ZNACZNIKOW,
  kolejnosc,
  nastepnaOsoba,
  poziomOsoby,
  tekstZnacznika,
  wiersze,
  znaczniki,
} from '../../src/ui/lista.ts';
import { portretPikseli } from '../../src/ui/portret.ts';

afterEach(() => ustawJezyk('pl'));

const osoba = (extra: Partial<SimPerson> = {}): SimPerson => ({
  pawn: 3,
  id: 's5',
  name: 'Anna Kowalska',
  first: 'Anna',
  f: true,
  age: 52,
  prof: 'emerytka',
  skills: {},
  traits: [],
  needs: { food: 70, warm: 60, rest: 70, health: 100, safe: 60, mood: 65 },
  moods: [],
  job: null,
  doing: 'Stoi.',
  asleep: false,
  inside: false,
  tile: 0,
  carry: 0,
  away: false,
  post: null,
  weapon: null,
  ammo: null,
  bite: null,
  maimed: false,
  ...extra,
});
const potrzeby = (n: Partial<SimPerson['needs']>): SimPerson['needs'] => ({ ...osoba().needs, ...n });
const ugryzienie = (left: number): SimPerson['bite'] => ({ at: 0, limb: false, left, amputate: false });

describe('znaczniki: potrzeby', () => {
  it('zdrowa, najedzona osoba bez zajęcia nie ma znaczników', () => {
    expect(znaczniki(osoba())).toEqual([]);
  });

  it('głód od progu, przy którym zarząd sam idzie jeść: na progu nic, poniżej znacznik', () => {
    expect(znaczniki(osoba({ needs: potrzeby({ food: HUNGRY }) }))).toEqual([]);
    expect(znaczniki(osoba({ needs: potrzeby({ food: HUNGRY - 1 }) }))).toEqual([
      { rodzaj: 'glod', poziom: 'mid', wartosc: HUNGRY - 1 },
    ]);
  });

  it('zimno od progu, przy którym zarząd sam idzie się grzać', () => {
    expect(znaczniki(osoba({ needs: potrzeby({ warm: COLD }) }))).toEqual([]);
    expect(znaczniki(osoba({ needs: potrzeby({ warm: COLD - 1 }) }))).toEqual([
      { rodzaj: 'zimno', poziom: 'mid', wartosc: COLD - 1 },
    ]);
  });

  it('rana (słabe zdrowie) poniżej 50', () => {
    expect(znaczniki(osoba({ needs: potrzeby({ health: 50 }) }))).toEqual([]);
    expect(znaczniki(osoba({ needs: potrzeby({ health: 49 }) }))).toEqual([
      { rodzaj: 'rana', poziom: 'mid', wartosc: 49 },
    ]);
  });

  it('poniżej 25 znacznik jest czerwony, tak jak pasek na karcie osoby', () => {
    const z = znaczniki(osoba({ needs: potrzeby({ food: 24, warm: 24, health: 24 }) }));
    expect(z.map((x) => x.poziom)).toEqual(['bad', 'bad', 'bad']);
    expect(znaczniki(osoba({ needs: potrzeby({ food: 25 }) }))[0].poziom).toBe('mid');
  });

  it('wartości liczy zaokrąglone, tak jak karta osoby (34,6 to 35, więc jeszcze nie głód)', () => {
    expect(znaczniki(osoba({ needs: potrzeby({ food: HUNGRY - 0.4 }) }))).toEqual([]);
    expect(znaczniki(osoba({ needs: potrzeby({ food: HUNGRY - 0.6 }) }))[0].wartosc).toBe(HUNGRY - 1);
  });
});

describe('znaczniki: ugryzienie i zajęcie', () => {
  it('ugryzienie jest zawsze czerwone i niesie godziny do śmierci zaokrąglone w górę', () => {
    expect(znaczniki(osoba({ bite: ugryzienie(4.2 * TICKS_PER_HOUR) }))).toEqual([
      { rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 5 },
    ]);
  });

  it('po upływie czasu godzin jest zero, nigdy ujemnie', () => {
    expect(znaczniki(osoba({ bite: ugryzienie(-50) }))[0].wartosc).toBe(0);
  });

  it('wyprawa, warta, badania i sen to znaczniki informacyjne', () => {
    expect(znaczniki(osoba({ away: true }))).toEqual([{ rodzaj: 'wyprawa', poziom: 'info' }]);
    expect(znaczniki(osoba({ job: 'guard' }))).toEqual([{ rodzaj: 'warta', poziom: 'info' }]);
    expect(znaczniki(osoba({ job: 'research' }))).toEqual([{ rodzaj: 'badania', poziom: 'info' }]);
    expect(znaczniki(osoba({ asleep: true }))).toEqual([{ rodzaj: 'sen', poziom: 'info' }]);
  });

  it('inne prace nie dają znacznika', () => {
    for (const job of ['chop', 'cook', 'haul', 'sleep', 'search'] as const)
      expect(znaczniki(osoba({ job: job as SimPerson['job'] }))).toEqual([]);
  });

  it('kolejność jest stała: najpierw to, co grozi śmiercią, potem potrzeby, na końcu zajęcie', () => {
    const wszystko = osoba({
      bite: ugryzienie(TICKS_PER_HOUR),
      needs: potrzeby({ food: 10, warm: 10, health: 10 }),
      away: true,
      job: 'guard',
      asleep: true,
    });
    expect(znaczniki(wszystko).map((z) => z.rodzaj)).toEqual([
      'ugryzienie',
      'rana',
      'glod',
      'zimno',
      'wyprawa',
      'warta',
      'sen',
    ]);
    expect(KOLEJNOSC_ZNACZNIKOW).toEqual(['ugryzienie', 'rana', 'glod', 'zimno', 'wyprawa', 'warta', 'badania', 'sen']);
  });
});

describe('poziomOsoby: ramka portretu', () => {
  it('bez znaczników albo z samymi informacyjnymi jest „ok”', () => {
    expect(poziomOsoby([])).toBe('ok');
    expect(poziomOsoby([{ rodzaj: 'sen', poziom: 'info' }])).toBe('ok');
  });

  it('najgorszy znacznik potrzeb wygrywa', () => {
    expect(poziomOsoby([{ rodzaj: 'glod', poziom: 'mid', wartosc: 30 }])).toBe('mid');
    expect(
      poziomOsoby([
        { rodzaj: 'glod', poziom: 'mid', wartosc: 30 },
        { rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 3 },
        { rodzaj: 'sen', poziom: 'info' },
      ]),
    ).toBe('bad');
  });
});

describe('kolejność na liście', () => {
  it('stała: po numerze pionka, czyli w kolejności, w jakiej osoby weszły do zarządu; wejście nie jest zmieniane', () => {
    const wejscie = [osoba({ pawn: 9 }), osoba({ pawn: 2 }), osoba({ pawn: 5 })];
    expect(kolejnosc(wejscie).map((p) => p.pawn)).toEqual([2, 5, 9]);
    expect(wejscie.map((p) => p.pawn)).toEqual([9, 2, 5]);
  });

  it('nie zależy od stanu osób: głodny nie skacze na początek', () => {
    const lista = [osoba({ pawn: 1 }), osoba({ pawn: 2, needs: potrzeby({ food: 5 }) }), osoba({ pawn: 3 })];
    expect(kolejnosc(lista).map((p) => p.pawn)).toEqual([1, 2, 3]);
  });
});

describe('nastepnaOsoba: przełączanie klawiszem', () => {
  const ludzie = [
    { pawn: 1, away: false },
    { pawn: 2, away: false },
    { pawn: 3, away: false },
    { pawn: 4, away: false },
  ];
  const wybor = (...ids: number[]) => new Set(ids);

  it('bez zaznaczenia: dalej zaczyna od pierwszej osoby, wstecz od ostatniej', () => {
    expect(nastepnaOsoba(ludzie, wybor(), 1)).toBe(1);
    expect(nastepnaOsoba(ludzie, wybor(), -1)).toBe(4);
  });

  it('z jedną zaznaczoną idzie do sąsiedniej i zawija na końcach', () => {
    expect(nastepnaOsoba(ludzie, wybor(2), 1)).toBe(3);
    expect(nastepnaOsoba(ludzie, wybor(2), -1)).toBe(1);
    expect(nastepnaOsoba(ludzie, wybor(4), 1)).toBe(1);
    expect(nastepnaOsoba(ludzie, wybor(1), -1)).toBe(4);
  });

  it('z kilkoma zaznaczonymi dalej liczy od ostatniej z nich, wstecz od pierwszej', () => {
    expect(nastepnaOsoba(ludzie, wybor(1, 3), 1)).toBe(4);
    expect(nastepnaOsoba(ludzie, wybor(2, 4), -1)).toBe(1);
  });

  it('pomija ludzi na wyprawie, bo kamera nie ma do nich dojechać', () => {
    const naWyprawie = [ludzie[0], { pawn: 2, away: true }, ludzie[2], ludzie[3]];
    expect(nastepnaOsoba(naWyprawie, wybor(1), 1)).toBe(3);
    expect(nastepnaOsoba(naWyprawie, wybor(3), -1)).toBe(1);
  });

  it('gdy wszyscy są poza mapą, przełącza po wszystkich (karta osoby dalej ma sens)', () => {
    const poza = [
      { pawn: 1, away: true },
      { pawn: 2, away: true },
    ];
    expect(nastepnaOsoba(poza, wybor(), 1)).toBe(1);
    expect(nastepnaOsoba(poza, wybor(1), 1)).toBe(2);
  });

  it('zaznaczenie spoza listy (mieszkaniec) liczy się jak brak zaznaczenia', () => {
    expect(nastepnaOsoba(ludzie, wybor(99), 1)).toBe(1);
  });

  it('jedna osoba: zawsze ona, pusta lista: nikt', () => {
    expect(nastepnaOsoba([{ pawn: 7, away: false }], wybor(7), 1)).toBe(7);
    expect(nastepnaOsoba([], wybor(), 1)).toBeNull();
  });
});

describe('teksty znaczników', () => {
  it('po polsku, z płcią tam, gdzie język jej wymaga', () => {
    expect(tekstZnacznika({ rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 5 }, true)).toBe(
      'Ugryziona: gorączka zabije za 5 h',
    );
    expect(tekstZnacznika({ rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 5 }, false)).toBe(
      'Ugryziony: gorączka zabije za 5 h',
    );
    expect(tekstZnacznika({ rodzaj: 'glod', poziom: 'mid', wartosc: 31 }, false)).toBe('Głodny (najedzenie 31)');
    expect(tekstZnacznika({ rodzaj: 'zimno', poziom: 'mid', wartosc: 28 }, true)).toBe('Zmarznięta (ciepło 28)');
    expect(tekstZnacznika({ rodzaj: 'rana', poziom: 'mid', wartosc: 42 }, true)).toBe('Słabe zdrowie: 42');
    expect(tekstZnacznika({ rodzaj: 'wyprawa', poziom: 'info' }, true)).toBe('Na wyprawie');
    expect(tekstZnacznika({ rodzaj: 'warta', poziom: 'info' }, true)).toBe('Na warcie');
    expect(tekstZnacznika({ rodzaj: 'badania', poziom: 'info' }, true)).toBe('Bada przy stole');
    expect(tekstZnacznika({ rodzaj: 'sen', poziom: 'info' }, true)).toBe('Śpi');
  });

  it('po angielsku według słowniczka (the watch, supply run, bite, fever) i z zaimkiem osoby', () => {
    ustawJezyk('en');
    expect(tekstZnacznika({ rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 5 }, true)).toBe(
      'Bitten: the fever will kill her in 5 h',
    );
    expect(tekstZnacznika({ rodzaj: 'ugryzienie', poziom: 'bad', wartosc: 5 }, false)).toBe(
      'Bitten: the fever will kill him in 5 h',
    );
    expect(tekstZnacznika({ rodzaj: 'glod', poziom: 'mid', wartosc: 31 }, false)).toBe('Hungry (Fed 31)');
    expect(tekstZnacznika({ rodzaj: 'zimno', poziom: 'mid', wartosc: 28 }, true)).toBe('Cold (Warmth 28)');
    expect(tekstZnacznika({ rodzaj: 'rana', poziom: 'mid', wartosc: 42 }, true)).toBe('Poor health: 42');
    expect(tekstZnacznika({ rodzaj: 'wyprawa', poziom: 'info' }, true)).toBe('Out on a supply run');
    expect(tekstZnacznika({ rodzaj: 'warta', poziom: 'info' }, true)).toBe('On watch');
    expect(tekstZnacznika({ rodzaj: 'badania', poziom: 'info' }, true)).toBe('Researching at the table');
    expect(tekstZnacznika({ rodzaj: 'sen', poziom: 'info' }, true)).toBe('Asleep');
  });
});

describe('wiersze: to, co rysuje lista', () => {
  const ludzie = [
    osoba({ pawn: 8, name: 'Zofia Nowak', first: 'Zofia' }),
    osoba({ pawn: 2, name: 'Maksym Jakubowski', first: 'Maksym', f: false, needs: potrzeby({ food: 10 }) }),
  ];

  it('w stałej kolejności, z imieniem, ramką ze znaczników i flagami zaznaczenia i śledzenia', () => {
    const w = wiersze(ludzie, new Set([2]), 2);
    expect(w.map((x) => x.pawn)).toEqual([2, 8]);
    expect(w.map((x) => x.imie)).toEqual(['Maksym', 'Zofia']);
    expect(w.map((x) => x.poziom)).toEqual(['bad', 'ok']);
    expect(w.map((x) => x.wybrany)).toEqual([true, false]);
    expect(w.map((x) => x.sledzi)).toEqual([true, false]);
  });

  it('śledzi tylko ta osoba, którą gracz ma zaznaczoną; nikt, gdy śledzenie jest wyłączone', () => {
    expect(wiersze(ludzie, new Set([2]), null).some((x) => x.sledzi)).toBe(false);
    expect(wiersze(ludzie, new Set([8]), 2).some((x) => x.sledzi)).toBe(false);
  });

  it('na wyprawie osoba jest oznaczona jako poza mapą', () => {
    const w = wiersze([osoba({ pawn: 1, away: true })], new Set(), null);
    expect(w[0].poza).toBe(true);
    expect(w[0].znaczniki.map((z) => z.rodzaj)).toEqual(['wyprawa']);
  });

  it('tytuł ma pełne imię i nazwisko oraz opisy znaczników w bieżącym języku', () => {
    const [m] = wiersze([ludzie[1]], new Set(), null);
    expect(m.tytul).toContain('Maksym Jakubowski');
    expect(m.tytul).toContain('Głodny (najedzenie 10)');
    ustawJezyk('en');
    const [e] = wiersze([ludzie[1]], new Set(), null);
    expect(e.tytul).toContain('Maksym Jakubowski');
    expect(e.tytul).toContain('Hungry (Fed 10)');
    expect(e.tytul).not.toContain('Głodny');
  });

  it('czynność to opis pracy z symulacji, a u osoby na wyprawie pusty (jej tam nie ma, więc „stoi” byłoby kłamstwem)', () => {
    expect(wiersze([osoba({ doing: 'Rąbie suche drzewo.' })], new Set(), null)[0].czynnosc).toBe('Rąbie suche drzewo.');
    expect(wiersze([osoba({ doing: 'Stoi i czeka na polecenie.', away: true })], new Set(), null)[0].czynnosc).toBe('');
  });

  it('imię z pustego pola `first` bierze z pierwszego słowa nazwy', () => {
    expect(wiersze([osoba({ first: '', name: 'Jan Kowalczyk' })], new Set(), null)[0].imie).toBe('Jan');
  });
});

describe('krokKamery: kamera jedzie do osoby i trzyma się jej', () => {
  const cel = { x: 100, y: 0 };

  it('bez upływu czasu stoi w miejscu', () => {
    expect(krokKamery({ x: 0, y: 0 }, cel, 0)).toEqual({ x: 0, y: 0, doszla: false });
  });

  it('w jednej klatce zbliża się, ale nie dochodzi i nie wyprzedza celu', () => {
    const k = krokKamery({ x: 0, y: 0 }, cel, 16);
    expect(k.x).toBeGreaterThan(0);
    expect(k.x).toBeLessThan(100);
    expect(k.y).toBe(0);
    expect(k.doszla).toBe(false);
  });

  it('po długiej przerwie (karta w tle) staje dokładnie na celu', () => {
    expect(krokKamery({ x: -3000, y: 900 }, cel, 5000)).toEqual({ x: 100, y: 0, doszla: true });
  });

  it('droga nie zależy od tego, ile klatek ją pokazuje (jedna klatka 32 ms to dwie po 16)', () => {
    const jedna = krokKamery({ x: 0, y: 0 }, { x: 400, y: -200 }, 32);
    const pol = krokKamery({ x: 0, y: 0 }, { x: 400, y: -200 }, 16);
    const dwie = krokKamery(pol, { x: 400, y: -200 }, 16);
    expect(dwie.x).toBeCloseTo(jedna.x, 6);
    expect(dwie.y).toBeCloseTo(jedna.y, 6);
  });

  it('bliżej niż pół piksela przyciąga do celu i melduje, że doszła', () => {
    expect(krokKamery({ x: 99.8, y: 0 }, cel, 16)).toEqual({ x: 100, y: 0, doszla: true });
    expect(krokKamery(cel, cel, 16)).toEqual({ x: 100, y: 0, doszla: true });
  });
});

describe('kameraRuszona: gracz sam ruszył kamerą, więc śledzenie się kończy', () => {
  it('bez zapamiętanej pozycji nic nie wiadomo', () => {
    expect(kameraRuszona(null, { x: 5, y: 5 })).toBe(false);
  });

  it('ta sama pozycja i drobne różnice poniżej piksela to nie ruch gracza', () => {
    expect(kameraRuszona({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(false);
    expect(kameraRuszona({ x: 10, y: 20 }, { x: 10.4, y: 19.6 })).toBe(false);
  });

  it('przesunięcie o piksel i więcej na którejkolwiek osi to ruch gracza', () => {
    expect(kameraRuszona({ x: 10, y: 20 }, { x: 11.5, y: 20 })).toBe(true);
    expect(kameraRuszona({ x: 10, y: 20 }, { x: 10, y: 18 })).toBe(true);
  });
});

describe("portretPikseli: głowa i ramiona z klatki sprite'a", () => {
  const BOK = 20;
  const KOLOR = 0xff3366ff;
  /** obraz w x h z zamalowanymi prostokątami [x, y, w, h] */
  const obraz = (w: number, h: number, ...prost: [number, number, number, number][]): Uint32Array => {
    const px = new Uint32Array(w * h);
    for (const [x0, y0, rw, rh] of prost)
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) px[y * w + x] = KOLOR;
    return px;
  };
  const kol = (out: Uint32Array, x: number) => Array.from({ length: BOK }, (_, y) => out[y * BOK + x] >>> 24);
  const wiersz = (out: Uint32Array, y: number) => Array.from({ length: BOK }, (_, x) => out[y * BOK + x] >>> 24);

  it('pusta klatka nie ma portretu', () => {
    expect(portretPikseli(new Uint32Array(40 * 48), 40, [0, 0, 40, 48], false, BOK)).toBeNull();
  });

  it('wynik ma bok × bok, sylwetka zaczyna się w drugim wierszu, a dół jest ucięty', () => {
    // postać 6 px szeroka i 30 px wysoka w środku klatki 40 × 48
    const out = portretPikseli(obraz(40, 48, [17, 5, 6, 30]), 40, [0, 0, 40, 48], false, BOK)!;
    expect(out).toHaveLength(BOK * BOK);
    expect(wiersz(out, 0).every((a) => a === 0)).toBe(true);
    expect(wiersz(out, 1).some((a) => a !== 0)).toBe(true);
    expect(wiersz(out, BOK - 1).some((a) => a !== 0)).toBe(true);
  });

  it('środkuje głowę (górne wiersze), a nie całą sylwetkę z rozłożonymi ramionami', () => {
    // głowa x 3..8 (6 px, środek 6), poniżej ramiona x 0..13
    const px = obraz(14, 30, [3, 0, 6, 10], [0, 10, 14, 15]);
    const out = portretPikseli(px, 14, [0, 0, 14, 30], false, BOK)!;
    // środek głowy (6) ma trafić na środek portretu (10): głowa w kolumnach 7..12
    const naglowek = wiersz(out, 1);
    const pierwsza = naglowek.findIndex((a) => a !== 0);
    const ostatnia = naglowek.length - 1 - [...naglowek].reverse().findIndex((a) => a !== 0);
    expect([pierwsza, ostatnia]).toEqual([7, 12]);
  });

  it('nie zagląda poza prostokąt klatki (sąsiednia klatka atlasu nie wchodzi do portretu)', () => {
    // klatka [10, 0, 10, 20]; sąsiad po lewej (x 0..9) i po prawej (x 20..29) ma kolorowe piksele
    const px = obraz(30, 20, [0, 0, 10, 20], [20, 0, 10, 20], [13, 2, 4, 10]);
    const out = portretPikseli(px, 30, [10, 0, 10, 20], false, BOK)!;
    const zajete = Array.from({ length: BOK }, (_, x) => kol(out, x).some((a) => a !== 0));
    expect(zajete.filter(Boolean)).toHaveLength(4);
  });

  it('lustro odbija portret poziomo', () => {
    // postać przesunięta od środka głowy: szerokie ramię po prawej stronie głowy
    const px = obraz(20, 24, [4, 0, 6, 8], [4, 8, 14, 10]);
    const zwykly = portretPikseli(px, 20, [0, 0, 20, 24], false, BOK)!;
    const lustro = portretPikseli(px, 20, [0, 0, 20, 24], true, BOK)!;
    for (let y = 0; y < BOK; y++)
      for (let x = 0; x < BOK; x++) expect(lustro[y * BOK + x]).toBe(zwykly[y * BOK + (BOK - 1 - x)]);
  });

  it('postać szersza niż portret jest przycięta po bokach, bez błędu', () => {
    const out = portretPikseli(obraz(40, 30, [0, 0, 40, 30]), 40, [0, 0, 40, 30], false, BOK)!;
    expect(wiersz(out, 5).every((a) => a !== 0)).toBe(true);
  });

  it('nie zmienia obrazu wejściowego', () => {
    const px = obraz(14, 30, [3, 0, 6, 10]);
    const kopia = px.slice();
    portretPikseli(px, 14, [0, 0, 14, 30], false, BOK);
    expect(px).toEqual(kopia);
  });
});
