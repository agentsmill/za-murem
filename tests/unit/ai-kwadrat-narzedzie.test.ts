/* Narzędzie tools/osada-kwadraty.ts (tabela reguły miejsca osady AI na kwadratach dem), etap 2 osady AI
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 2, runda poprawek 1). Tabela z kroku 4 trafia do raportu,
   więc jej pomocniki mają własne testy: argumenty i lista ziaren, nagłówek i wiersze (kolumny, kreski tam, gdzie nie liczono,
   zaokrąglenie jedzenia), opis reguły z jej stałych oraz pełny pomiar kwadratu (`pomiarPelny`): wynik reguły jest wynikiem
   produkcyjnego `swiatOsady`, a pola, które `swiatOsady` zostawia puste po pierwszym powodzie odrzucenia, tabela liczy z
   etapów (`szukajSiedziby`, `okolicaOsady`, `policzMieszkancow`), żeby pokazać jedzenie i lokatorów w każdym wierszu. */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  MIN_LOKATORZY_SIEDZIBY,
  MIN_POKOI_SIEDZIBY,
  type PomiarKwadratu,
  PROBY_SIEDZIBY,
  PROG_JEDZENIA_OSADY,
  PROMIEN_SIEDZIBY_M,
  type SwiatOsady,
  swiatOsady,
} from '../../src/ai/kwadrat.ts';
import { MAX_OKOLICA_M } from '../../src/gov/wyprawy.ts';
import type { DaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { type Uklad, ukladZGeo, zKlucza } from '../../src/world/kwadraty.ts';
import {
  DEMA,
  daneDema,
  naglowekTabeli,
  opisReguly,
  parsujArgumenty,
  parsujZiarna,
  pomiarPelny,
  type WierszKwadratu,
  wczytajDemo,
  wierszTabeli,
  wynikSlowem,
} from '../../tools/osada-kwadraty.ts';

const ZIARNO = 11;

/** pomiar z samymi liczbami, które drukuje tabela (reszta zerowa) */
const pomiar = (p: Partial<PomiarKwadratu> = {}): PomiarKwadratu => ({
  kandydatow: 0,
  proby: 0,
  pole: 0,
  pokoje: 0,
  pokojeZarzadu: 0,
  osoby: null,
  lokatorzy: null,
  jedzenie: null,
  ...p,
});
const tokeny = (wiersz: string): string[] => wiersz.trim().split(/\s+/);

describe('narzędzie osada-kwadraty: lista ziaren i argumenty', () => {
  it('DEMA to trzy dema w kolejności tabel', () => {
    expect([...DEMA]).toEqual(['przymorze', 'lanciego', 'zielonki']);
  });

  it('parsujZiarna: jeden limit zakresu (999 różnic, czyli tysiąc ziaren), tak jak w uprzęży bot:osada', () => {
    expect(parsujZiarna('1-1000')).toHaveLength(1000);
    expect(() => parsujZiarna('1-1001')).toThrow(/za dużo ziaren/);
    expect(() => parsujZiarna('50-60,1-1001')).toThrow(/za dużo ziaren/);
    expect(parsujZiarna('11-15')).toEqual([11, 12, 13, 14, 15]);
    expect(parsujZiarna('3,3-4')).toEqual([3, 4]);
  });

  it('parsujArgumenty: domyślnie ziarna 11–15 i trzy dema; --ziarna, --demo i --pomoc', () => {
    expect(parsujArgumenty([])).toEqual({
      ziarna: [11, 12, 13, 14, 15],
      dema: ['przymorze', 'lanciego', 'zielonki'],
      pomoc: false,
    });
    expect(parsujArgumenty(['--ziarna=7,9-10', '--demo=zielonki,przymorze,zielonki'])).toEqual({
      ziarna: [7, 9, 10],
      dema: ['zielonki', 'przymorze'],
      pomoc: false,
    });
    expect(parsujArgumenty(['--pomoc']).pomoc).toBe(true);
  });

  it('parsujArgumenty: nieznany argument, nieznane demo i zła lista ziaren rzucają z nazwą', () => {
    expect(() => parsujArgumenty(['--bez-progu'])).toThrow(/nieznany argument „--bez-progu”/);
    expect(() => parsujArgumenty(['45'])).toThrow(/nieznany argument „45”/);
    expect(() => parsujArgumenty(['--ziarna'])).toThrow(/nieznany argument/);
    expect(() => parsujArgumenty(['--demo=sopot'])).toThrow(/nieznane demo „sopot”/);
    expect(() => parsujArgumenty(['--demo=przymorze,sopot'])).toThrow(/sopot/);
    expect(() => parsujArgumenty(['--ziarna=15-11'])).toThrow(/odwrócony zakres/);
    expect(() => parsujArgumenty(['--ziarna=abc'])).toThrow(/zła lista ziaren/);
  });
});

describe('narzędzie osada-kwadraty: nagłówek, wiersze i opis reguły', () => {
  const przyjety = {
    wynik: {} as SwiatOsady,
    pomiar: pomiar({
      kandydatow: 36,
      proby: 1,
      pole: 661,
      pokoje: 5,
      pokojeZarzadu: 1,
      osoby: 9,
      lokatorzy: 5,
      jedzenie: 698.7,
    }),
  };
  const odrzuconyJedzenie: WierszKwadratu = {
    wynik: { odrzucony: 'jedzenie', pomiar: pomiar() },
    pomiar: pomiar({
      kandydatow: 37,
      proby: 1,
      pole: 329,
      pokoje: 4,
      pokojeZarzadu: 4,
      osoby: 4,
      lokatorzy: 0,
      jedzenie: 0,
    }),
  };
  const bezSiedziby: WierszKwadratu = {
    wynik: { odrzucony: 'siedziba', pomiar: pomiar() },
    pomiar: pomiar({ jedzenie: 451.4 }),
  };

  it('nagłówek ma dziesięć kolumn w kolejności wiersza', () => {
    const n = naglowekTabeli();
    const kolumny = [
      'klucz',
      'kand.',
      'próby',
      'siedziba m²',
      'pokoje (zarz.)',
      'osoby',
      'lokat.',
      'jedzenie',
      'wynik',
      'ziarna',
    ];
    let od = 0;
    for (const k of kolumny) {
      const gdzie = n.indexOf(k, od);
      expect(gdzie, k).toBeGreaterThanOrEqual(od);
      od = gdzie + k.length;
    }
  });

  it('wynikSlowem: „tak” dla świata, „nie: powód” dla odrzucenia', () => {
    expect(wynikSlowem(przyjety.wynik)).toBe('tak');
    expect(wynikSlowem(odrzuconyJedzenie.wynik)).toBe('nie: jedzenie');
    expect(wynikSlowem(bezSiedziby.wynik)).toBe('nie: siedziba');
    expect(wynikSlowem({ odrzucony: 'mieszkancy', pomiar: pomiar() })).toBe('nie: mieszkancy');
  });

  it('wiersz spełniającego kwadratu: liczby z pomiaru, jedzenie zaokrąglone do porcji, „tak” i ziarna', () => {
    expect(tokeny(wierszTabeli('0,-1', przyjety, 5, 5))).toEqual([
      '0,-1',
      '36',
      '1',
      '661',
      '5',
      '(1)',
      '9',
      '5',
      '699',
      'tak',
      '5/5',
    ]);
  });

  it('wiersz odrzuconego z siedzibą: osoby i lokatorzy z pełnego pomiaru, powód, ziarna w których spełnia', () => {
    expect(tokeny(wierszTabeli('-1,0', odrzuconyJedzenie, 0, 5))).toEqual([
      '-1,0',
      '37',
      '1',
      '329',
      '4',
      '(4)',
      '4',
      '0',
      '0',
      'nie:',
      'jedzenie',
      '0/5',
    ]);
  });

  it('wiersz kwadratu bez żadnej próby: kreski w siedzibie i pokojach, osobach i lokatorach, a jedzenie z pomiaru', () => {
    expect(tokeny(wierszTabeli('1,-1', bezSiedziby, 0, 5))).toEqual([
      '1,-1',
      '0',
      '0',
      '-',
      '-',
      '-',
      '-',
      '451',
      'nie:',
      'siedziba',
      '0/5',
    ]);
    // brak jedzenia w pomiarze (nie liczono): kreska zamiast zera
    expect(tokeny(wierszTabeli('0,1', { ...bezSiedziby, pomiar: pomiar() }, 0, 3))).toEqual([
      '0,1',
      '0',
      '0',
      '-',
      '-',
      '-',
      '-',
      '-',
      'nie:',
      'siedziba',
      '0/3',
    ]);
  });

  it('wiersze mają stałą szerokość kolumn (tabela się nie rozjeżdża)', () => {
    const dl = (w: string) => w.length;
    expect(dl(wierszTabeli('0,-1', przyjety, 5, 5))).toBe(dl(wierszTabeli('1,-1', bezSiedziby, 0, 5)));
    expect(dl(wierszTabeli('-1,-1', przyjety, 5, 5))).toBe(dl(naglowekTabeli()));
  });

  it('opisReguly wylicza stałe reguły z src/ai/kwadrat.ts', () => {
    const opis = opisReguly();
    expect(opis).toContain(`do ${PROBY_SIEDZIBY} największych`);
    expect(opis).toContain(`w ${PROMIEN_SIEDZIBY_M} m od środka kwadratu`);
    expect(opis).toContain(`${MIN_POKOI_SIEDZIBY} pokoje`);
    expect(opis).toContain(`${MIN_LOKATORZY_SIEDZIBY} lokator`);
    expect(opis).toContain(`${PROG_JEDZENIA_OSADY} porcji w zasięgu ${MAX_OKOLICA_M} m`);
  });
});

describe('narzędzie osada-kwadraty: pomiarPelny na danych dem', () => {
  interface Demo {
    geo: ReturnType<typeof wczytajDemo>['geo'];
    kwadraty: ReturnType<typeof wczytajDemo>['kwadraty'];
    dane: DaneMieszkancow | null;
    uklad: Uklad;
  }
  const demo = new Map<string, Demo>();
  beforeAll(async () => {
    for (const d of DEMA) {
      const w = wczytajDemo(d);
      demo.set(d, { geo: w.geo, kwadraty: w.kwadraty, dane: await daneDema(d), uklad: ukladZGeo(w.geo) });
    }
  }, 120_000);
  const pomiarKw = (d: string, klucz: string, seed = ZIARNO, dane?: DaneMieszkancow | null): WierszKwadratu => {
    const x = demo.get(d)!;
    const [sx, sy] = zKlucza(klucz);
    return pomiarPelny(x.kwadraty[klucz], sx, sy, dane === undefined ? x.dane : dane, seed, x.uklad);
  };

  it('Zielonki (−1,0): wynik „jedzenie” jak w produkcji, ale pełny pomiar ma też osoby i lokatorów (produkcja ich nie liczy)', () => {
    const w = pomiarKw('zielonki', '-1,0');
    expect('odrzucony' in w.wynik && w.wynik.odrzucony).toBe('jedzenie');
    // produkcyjny pomiar zatrzymał się przed generatorem, pełny dolicza go
    expect(w.wynik.pomiar.osoby).toBeNull();
    expect(w.pomiar.osoby).toBeGreaterThan(0);
    expect(w.pomiar.lokatorzy).toBe(0);
    expect(w.pomiar.jedzenie).toBe(w.wynik.pomiar.jedzenie);
    expect(w.pomiar.pokoje).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
  });

  it('Zielonki (0,−1) bez siedziby: wynik „siedziba”, ale jedzenie zmierzone ze środka kwadratu (produkcja go nie liczy)', () => {
    const w = pomiarKw('zielonki', '0,-1');
    expect('odrzucony' in w.wynik && w.wynik.odrzucony).toBe('siedziba');
    expect(w.wynik.pomiar.jedzenie).toBeNull();
    expect(w.pomiar.jedzenie).toBeGreaterThanOrEqual(0);
    expect(w.pomiar.jedzenie).not.toBeNull();
    expect(w.pomiar).toMatchObject({ kandydatow: 0, proby: 0, osoby: null, lokatorzy: null });
  });

  it('Zielonki (1,0), cztery próby bez siedziby: jedzenie liczone od pierwszego kandydata (17 porcji)', () => {
    const w = pomiarKw('zielonki', '1,0');
    expect('odrzucony' in w.wynik && w.wynik.odrzucony).toBe('siedziba');
    expect(w.pomiar.proby).toBe(PROBY_SIEDZIBY);
    expect(Math.round(w.pomiar.jedzenie ?? -1)).toBe(17);
  });

  it('spełniający kwadrat: pełny pomiar jest tym samym pomiarem, który niesie świat', () => {
    const w = pomiarKw('przymorze', '0,-1');
    expect('odrzucony' in w.wynik).toBe(false);
    expect(w.pomiar).toEqual(w.wynik.pomiar);
    expect(w.pomiar.jedzenie).toBeGreaterThanOrEqual(PROG_JEDZENIA_OSADY);
    expect(w.pomiar.lokatorzy).toBeGreaterThanOrEqual(MIN_LOKATORZY_SIEDZIBY);
  });

  it('wynik reguły w tabeli to zawsze wynik produkcyjnego swiatOsady (20 kwadratów i trzy domy)', () => {
    for (const d of DEMA) {
      const x = demo.get(d)!;
      const kwadraty: [string, ReturnType<typeof wczytajDemo>['geo'], number, number][] = [
        ['dom', x.geo, 0, 0],
        ...Object.entries(x.kwadraty).map(([k, g]): [string, typeof x.geo, number, number] => {
          const [sx, sy] = zKlucza(k);
          return [k, g, sx, sy];
        }),
      ];
      for (const [k, geo, sx, sy] of kwadraty) {
        const pelny = pomiarPelny(geo, sx, sy, x.dane, ZIARNO, x.uklad);
        const produkcja = swiatOsady(geo, sx, sy, x.dane, ZIARNO, x.uklad);
        expect(wynikSlowem(pelny.wynik), `${d} ${k}`).toBe(wynikSlowem(produkcja));
        // pola, które produkcja policzyła, pełny pomiar ma takie same
        for (const pole of ['kandydatow', 'proby', 'pole', 'pokoje', 'pokojeZarzadu'] as const)
          expect(pelny.pomiar[pole], `${d} ${k} ${pole}`).toBe(produkcja.pomiar[pole]);
        for (const pole of ['osoby', 'lokatorzy', 'jedzenie'] as const)
          if (produkcja.pomiar[pole] !== null)
            expect(pelny.pomiar[pole], `${d} ${k} ${pole}`).toBe(produkcja.pomiar[pole]);
      }
    }
  }, 120_000);

  it('bez tabel mieszkańców pełny pomiar nic nie liczy i nie rzuca: wynik „mieszkancy”', () => {
    const w = pomiarKw('przymorze', '0,-1', ZIARNO, null);
    expect('odrzucony' in w.wynik && w.wynik.odrzucony).toBe('mieszkancy');
    expect(w.pomiar).toEqual(pomiar());
  });
});
