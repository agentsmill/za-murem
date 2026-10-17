import { describe, expect, it } from 'vitest';
import {
  czyMiejska,
  dodajTabele,
  ETYKIETY_WIELKOSCI,
  epokiZBdl,
  ludnoscRejonow,
  type pustyMarginesy,
  rozbijWiek,
  skrocNazwe,
  terytZBdl,
  wartosciBdl,
  wiek2021ZBdl,
  wiek2025ZBdl,
  wojewodztwo,
  wWielokacie,
  zlozWiek10,
} from '../../tools/dane/gminy.ts';
import type { Komorka } from '../../tools/dane/xlsx.ts';

describe('TERYT, województwo, nazwa', () => {
  it('identyfikator BDL (12 cyfr) przechodzi na 7-cyfrowy kod z plików NSP', () => {
    expect(terytZBdl('042214361011')).toBe('2261011');
    expect(terytZBdl('071412865138')).toBe('1465138');
    expect(terytZBdl('011212006172')).toBe('1206172');
    expect(() => terytZBdl('12345')).toThrow(/12 cyfr/);
  });

  it('szesnaście województw małymi literami, jak w plikach PESEL', () => {
    const oczekiwane: Record<string, string> = {
      '02': 'dolnośląskie',
      '04': 'kujawsko-pomorskie',
      '06': 'lubelskie',
      '08': 'lubuskie',
      '10': 'łódzkie',
      '12': 'małopolskie',
      '14': 'mazowieckie',
      '16': 'opolskie',
      '18': 'podkarpackie',
      '20': 'podlaskie',
      '22': 'pomorskie',
      '24': 'śląskie',
      '26': 'świętokrzyskie',
      '28': 'warmińsko-mazurskie',
      '30': 'wielkopolskie',
      '32': 'zachodniopomorskie',
    };
    for (const [kod, nazwa] of Object.entries(oczekiwane)) expect(wojewodztwo(`${kod}61011`)).toBe(nazwa);
    expect(() => wojewodztwo('9961011')).toThrow(/województw/);
  });

  it('miejska: rodzaj gminy z ostatniej cyfry TERYT', () => {
    expect(czyMiejska('2261011')).toBe(true); // gmina miejska
    expect(czyMiejska('1465138')).toBe(true); // dzielnica Warszawy
    expect(czyMiejska('1206172')).toBe(false); // gmina wiejska
    expect(czyMiejska('0201034')).toBe(true); // miasto w gminie miejsko-wiejskiej
    expect(czyMiejska('0201035')).toBe(false); // obszar wiejski w gminie miejsko-wiejskiej
    expect(czyMiejska('1261029')).toBe(true); // dzielnica Krakowa
    expect(czyMiejska('0201033')).toBeNull(); // cała gmina miejsko-wiejska: nie rozstrzyga się z samego kodu
  });

  it('nazwa bez przedrostka GUS', () => {
    expect(skrocNazwe('gm. m. Gdańsk')).toBe('Gdańsk');
    expect(skrocNazwe('gm. w. Zielonki')).toBe('Zielonki');
    expect(skrocNazwe('dz. Warszawa-Ursynów')).toBe('Warszawa-Ursynów');
    expect(skrocNazwe('m. Brzeg')).toBe('Brzeg');
    expect(skrocNazwe('Gdynia')).toBe('Gdynia');
  });
});

describe('punkt w wielokącie', () => {
  const kwadrat = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const dziura = [
    [4, 4],
    [4, 6],
    [6, 6],
    [6, 4],
    [4, 4],
  ];
  it('reguła parzystości: dziura nie należy do wielokąta', () => {
    expect(wWielokacie(2, 2, [kwadrat, dziura])).toBe(true);
    expect(wWielokacie(5, 5, [kwadrat, dziura])).toBe(false);
    expect(wWielokacie(5, 5, [kwadrat])).toBe(true);
    expect(wWielokacie(11, 5, [kwadrat, dziura])).toBe(false);
    expect(wWielokacie(5, -1, [kwadrat, dziura])).toBe(false);
  });
});

describe('rozbijWiek: płeć w grupach wieku rejonu z szablonu gminy', () => {
  const grupy = [150, 188, 402, 383, 411, 462, 284, 599, 303]; // rejon 182350
  const seedM = [22000, 24000, 29000, 38000, 36000, 31000, 26000, 20000, 8000];
  const seedK = [21000, 23000, 30000, 40000, 38000, 36000, 34000, 32000, 15500];

  function sprawdz(g: number[], m: number, k: number, w: { M: number[]; K: number[] }) {
    expect(w.M).toHaveLength(g.length);
    expect(w.K).toHaveLength(g.length);
    for (let i = 0; i < g.length; i++) {
      expect(Number.isInteger(w.M[i]) && Number.isInteger(w.K[i])).toBe(true);
      expect(w.M[i]).toBeGreaterThanOrEqual(0);
      expect(w.K[i]).toBeGreaterThanOrEqual(0);
      expect(w.M[i] + w.K[i]).toBe(g[i]);
    }
    expect(w.M.reduce((a, b) => a + b, 0)).toBe(m);
    expect(w.K.reduce((a, b) => a + b, 0)).toBe(k);
  }

  it('zachowuje obie sumy brzegowe co do osoby', () => {
    const w = rozbijWiek(grupy, 1442, 1740, seedM, seedK);
    sprawdz(grupy, 1442, 1740, w);
    // kobiet wśród najstarszych jest więcej niż mężczyzn, tak jak w szablonie gminy
    expect(w.K[8]).toBeGreaterThan(w.M[8]);
  });

  it('przy równych szablonach i parzystych sumach dzieli po połowie', () => {
    const g = [10, 20, 30];
    const w = rozbijWiek(g, 30, 30, [5, 5, 5], [5, 5, 5]);
    sprawdz(g, 30, 30, w);
    expect(w.M).toEqual([5, 10, 15]);
  });

  it('losowe sumy brzegowe: zawsze dokładne', () => {
    let s = 12345;
    const los = (n: number) => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s % n;
    };
    for (let proba = 0; proba < 300; proba++) {
      const g = Array.from({ length: 9 }, () => los(400));
      const razem = g.reduce((a, b) => a + b, 0);
      const m = los(razem + 1);
      const sm = Array.from({ length: 9 }, () => los(1000));
      const sk = Array.from({ length: 9 }, () => los(1000));
      sprawdz(g, m, razem - m, rozbijWiek(g, m, razem - m, sm, sk));
    }
  });

  it('szablon z zerami nie psuje podziału', () => {
    const g = [5, 0, 7];
    sprawdz(g, 6, 6, rozbijWiek(g, 6, 6, [0, 0, 0], [3, 0, 4]));
  });

  it('pusty rejon daje same zera', () => {
    expect(rozbijWiek([0, 0], 0, 0, [1, 1], [1, 1])).toEqual({ M: [0, 0], K: [0, 0] });
  });

  it('niezgodne sumy to błąd', () => {
    expect(() => rozbijWiek([10, 10], 5, 5, [1, 1], [1, 1])).toThrow(/suma/);
  });
});

describe('zlozWiek10', () => {
  it('18 grup 5-letnich daje 9 dziesięcioletnich, 80+ to 80-84 i 85+', () => {
    const w5 = Array.from({ length: 18 }, (_, i) => i + 1);
    expect(zlozWiek10(w5)).toEqual([3, 7, 11, 15, 19, 23, 27, 31, 35]);
    expect(() => zlozWiek10([1, 2, 3])).toThrow(/18/);
  });
});

describe('tablice gospodarstw i rodzin', () => {
  const naglowek: Komorka[] = [
    'Kod TERYT gminy',
    'Nazwa gminy',
    'Numer rejonu statystycznego',
    'Liczba osób w gospodarstwie',
    'Liczba gospodarstw',
  ];

  it('brak wiersza kategorii to zero, etykiety tekstowe i liczbowe', () => {
    const wiersze: Komorka[][] = [
      naglowek,
      ['2261011', 'gm. m. Gdańsk', '182350', 1, 598],
      ['2261011', 'gm. m. Gdańsk', '182350', 2, 489],
      ['2261011', 'gm. m. Gdańsk', '182350', '5 i więcej', 72],
      ['2261011', 'gm. m. Gdańsk', '182351', 3, 5],
      ['0201011', 'gm. m. Bolesławiec', '230850', 1, 85],
    ];
    const rejony = new Map<string, ReturnType<typeof pustyMarginesy>>();
    const nazwa = dodajTabele(wiersze, 'gospodarstwa', '2261011', rejony, true);
    expect(nazwa).toBe('gm. m. Gdańsk');
    expect([...rejony.keys()]).toEqual(['182350', '182351']);
    expect(rejony.get('182350')?.gospodarstwa).toEqual({ '1': 598, '2': 489, '3': 0, '4': 0, '5+': 72 });
    expect(rejony.get('182351')?.gospodarstwa).toEqual({ '1': 0, '2': 0, '3': 5, '4': 0, '5+': 0 });
  });

  it('inne tablice tylko uzupełniają rejony pierwszej, a nieznany rejon, kategoria i duplikat to błąd', () => {
    const rejony = new Map<string, ReturnType<typeof pustyMarginesy>>();
    dodajTabele([naglowek, ['2261011', 'gm. m. Gdańsk', '182350', 1, 10]], 'gospodarstwa', '2261011', rejony, true);
    const skladNag: Komorka[] = [
      'Kod TERYT gminy',
      'Nazwa gminy',
      'Numer rejonu statystycznego',
      'Skład rodzinny gospodarstwa',
      'Liczba gospodarstw',
    ];
    dodajTabele(
      [skladNag, ['2261011', 'gm. m. Gdańsk', '182350', 'nierodzinne - wieloosobowe', 4]],
      'sklad',
      '2261011',
      rejony,
      false,
    );
    expect(rejony.get('182350')?.sklad['nier+']).toBe(4);
    expect(() =>
      dodajTabele([skladNag, ['2261011', 'x', '999999', 'jednorodzinne', 1]], 'sklad', '2261011', rejony, false),
    ).toThrow(/999999/);
    expect(() =>
      dodajTabele([skladNag, ['2261011', 'x', '182350', 'dziwne', 1]], 'sklad', '2261011', rejony, false),
    ).toThrow(/dziwne/);
    expect(() =>
      dodajTabele(
        [skladNag, ['2261011', 'x', '182350', 'jednorodzinne', 1], ['2261011', 'x', '182350', 'jednorodzinne', 2]],
        'sklad',
        '2261011',
        rejony,
        false,
      ),
    ).toThrow(/dwa razy/);
    expect(() =>
      dodajTabele(
        [
          ['Inny', 'nagłówek'],
          ['2261011', 'x', '182350', 1, 1],
        ],
        'gospodarstwa',
        '2261011',
        rejony,
        true,
      ),
    ).toThrow(/nagłówek/);
  });

  it('wszystkie etykiety wielkości mają klucz Marginesy', () => {
    expect(Object.values(ETYKIETY_WIELKOSCI).sort()).toEqual(['1', '2', '3', '4', '5+']);
  });
});

describe('ludność rejonów z arkusza województwa', () => {
  const grupyNag = ['0-9 lat', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80 lat i więcej'];
  const arkusz = (rejony: Komorka[][]): Komorka[][] => [
    ['Ludność w rejonach statystycznych'],
    ['Województwo', 'Powiat', 'Gmina', 'Struktura', 'Symbol', 'Ogółem', 'Płeć', null, 'Ekonomiczne grupy wieku'],
    [null, null, null, null, null, null, 'mężczyźni', 'kobiety', 'przed', 'prod', null, null, 'po', ...grupyNag],
    [null],
    [null],
    ['Polska', null, null, 'Polska - ogółem', null, 100, 50, 50],
    ['Pomorskie', null, null, 'województwo', 22, 100, 50, 50],
    ['Pomorskie', 'Gdańsk', null, 'miasto na prawach powiatu', 2261, 100, 50, 50],
    ['Pomorskie', 'Gdańsk', 'gm. m. Gdańsk', 'gmina miejska', 2261011, 100, 50, 50],
    ...rejony,
    ['Pomorskie', 'bytowski', 'gm. m-w. Brusy', 'gmina miejsko-wiejska', 2201033, 8, 3, 5],
    ['Pomorskie', 'bytowski', 'gm. m-w. Brusy', 'miasto', 2201034, 8, 3, 5],
    [
      'Pomorskie',
      'bytowski',
      'gm. m-w. Brusy',
      'rejon statystyczny',
      '095330',
      8,
      3,
      5,
      4,
      4,
      4,
      '-',
      '-',
      8,
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ],
  ];
  const przymorze: Komorka[] = [
    'Pomorskie',
    'Gdańsk',
    'gm. m. Gdańsk',
    'rejon statystyczny',
    '182350',
    3182,
    1442,
    1740,
    300,
    1743,
    1021,
    722,
    1139,
    150,
    188,
    402,
    383,
    411,
    462,
    284,
    599,
    303,
  ];
  // prawdziwy rejon 180350: „-” w komórce znaczy zero
  const maly: Komorka[] = [
    'Pomorskie',
    'Gdańsk',
    'gm. m. Gdańsk',
    'rejon statystyczny',
    '180350',
    12,
    6,
    6,
    '-',
    10,
    6,
    4,
    2,
    '-',
    '-',
    4,
    2,
    '-',
    4,
    2,
    '-',
    '-',
  ];

  it('bierze rejony wskazanych jednostek, „-” czyta jako zero, obwody pomija', () => {
    const obwod: Komorka[] = [
      'Pomorskie',
      'Gdańsk',
      'gm. m. Gdańsk',
      'obwód spisowy',
      1,
      5,
      2,
      3,
      0,
      5,
      5,
      0,
      0,
      5,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const w = ludnoscRejonow(arkusz([przymorze, obwod, maly]), new Set(['2261011']));
    expect([...w.keys()]).toEqual(['182350', '180350']);
    expect(w.get('182350')).toEqual({
      jednostka: '2261011',
      mezczyzni: 1442,
      kobiety: 1740,
      grupy: [150, 188, 402, 383, 411, 462, 284, 599, 303],
    });
    expect(w.get('180350')?.grupy).toEqual([0, 0, 4, 2, 0, 4, 2, 0, 0]);
    // rejon miasta w gminie miejsko-wiejskiej należy do jednostki „miasto” (rodzaj 4)
    expect([...ludnoscRejonow(arkusz([]), new Set(['2201034'])).keys()]).toEqual(['095330']);
  });

  it('niezgodne sumy, zły znak w komórce i zmieniony nagłówek to błędy', () => {
    const zlaSuma: Komorka[] = [...przymorze];
    zlaSuma[5] = 3183;
    expect(() => ludnoscRejonow(arkusz([zlaSuma]), new Set(['2261011']))).toThrow(/182350/);
    const zlyZnak: Komorka[] = [...maly];
    zlyZnak[13] = 'x';
    expect(() => ludnoscRejonow(arkusz([zlyZnak]), new Set(['2261011']))).toThrow(/niepełny/);
    const w = arkusz([przymorze]);
    w[2][13] = '1-9 lat';
    expect(() => ludnoscRejonow(w, new Set(['2261011']))).toThrow(/nagłówek/);
  });
});

describe('P4386, P4253, P2137 z odpowiedzi BDL', () => {
  const okresy = [
    ['przed 1918', 10, 1000, 20],
    ['1918-1944', 20, 2000, 50],
    ['1945-1970', 30, 3000, 60],
    ['1971-1978', 40, 4000, 100],
    ['1979-1988', 50, 5000, 120],
    ['1989-2002', 60, 6000, 130],
    ['2003-2011', 70, 7000, 150],
    ['2012-2016', 80, 8000, 160],
    ['2017-2021 (łącznie z budynkami będącymi w budowie)', 90, 9000, 170],
  ] as const;

  function bdl(wiersze: { id: number; n1: string; n2: string; val: number | null }[]) {
    return {
      meta: { results: wiersze.map((w) => ({ id: w.id, n1: w.n1, n2: w.n2 })) },
      odp: {
        results: wiersze.map((w) => ({ id: w.id, values: w.val === null ? [] : [{ year: '2021', val: w.val }] })),
      },
    };
  }

  it('epoki złożone z okresów GUS bez dzielenia, metraż to powierzchnia przez mieszkania', () => {
    const w: { id: number; n1: string; n2: string; val: number | null }[] = [];
    let id = 1;
    for (const [n1, mieszkania, pow, osoby] of okresy) {
      w.push({ id: id++, n1, n2: 'mieszkania ogółem', val: mieszkania });
      w.push({ id: id++, n1, n2: 'powierzchnia użytkowa mieszkania ogółem', val: pow });
      w.push({ id: id++, n1, n2: 'ludność w mieszkaniach zamieszkanych', val: osoby });
    }
    w.push({ id: id++, n1: 'ogółem', n2: 'mieszkania ogółem', val: 400 });
    w.push({ id: id++, n1: 'ogółem', n2: 'powierzchnia użytkowa mieszkania ogółem', val: 36000 });
    w.push({ id: id++, n1: 'ogółem', n2: 'ludność w mieszkaniach zamieszkanych', val: 960 });
    const { meta, odp } = bdl(w);
    const { epoki, metraz } = epokiZBdl(wartosciBdl(odp, meta, '2021'));
    expect(epoki).toEqual({
      przedwojenna: { mieszkania: 30, osoby: 70 },
      powojenna: { mieszkania: 30, osoby: 60 },
      plyta: { mieszkania: 90, osoby: 220 },
      transformacja: { mieszkania: 130, osoby: 280 },
      nowa: { mieszkania: 170, osoby: 330 },
    });
    expect(metraz).toEqual({ przedwojenna: 100, powojenna: 100, plyta: 100, transformacja: 100, nowa: 100 });
  });

  it('epoka bez mieszkań dostaje średni metraż gminy', () => {
    const w: { id: number; n1: string; n2: string; val: number | null }[] = [];
    let id = 1;
    for (const [n1, mieszkania, pow, osoby] of okresy) {
      const pusty = n1 === 'przed 1918' || n1 === '1918-1944';
      w.push({ id: id++, n1, n2: 'mieszkania ogółem', val: pusty ? 0 : mieszkania });
      w.push({ id: id++, n1, n2: 'powierzchnia użytkowa mieszkania ogółem', val: pusty ? 0 : pow });
      w.push({ id: id++, n1, n2: 'ludność w mieszkaniach zamieszkanych', val: pusty ? 0 : osoby });
    }
    w.push({ id: id++, n1: 'ogółem', n2: 'mieszkania ogółem', val: 400 });
    w.push({ id: id++, n1: 'ogółem', n2: 'powierzchnia użytkowa mieszkania ogółem', val: 36000 });
    w.push({ id: id++, n1: 'ogółem', n2: 'ludność w mieszkaniach zamieszkanych', val: 960 });
    const { meta, odp } = bdl(w);
    const { epoki, metraz } = epokiZBdl(wartosciBdl(odp, meta, '2021'));
    expect(epoki.przedwojenna).toEqual({ mieszkania: 0, osoby: 0 });
    expect(metraz.przedwojenna).toBe(90);
    expect(metraz.nowa).toBe(100);
  });

  it('nieznany okres albo brak wartości to błąd', () => {
    const zlyOkres = bdl([{ id: 1, n1: '1850-1900', n2: 'mieszkania ogółem', val: 1 }]);
    expect(() => epokiZBdl(wartosciBdl(zlyOkres.odp, zlyOkres.meta, '2021'))).toThrow(/1850-1900/);
    const brak = bdl([{ id: 1, n1: 'przed 1918', n2: 'mieszkania ogółem', val: null }]);
    expect(wartosciBdl(brak.odp, brak.meta, '2021').size).toBe(0); // utajniona wartość jest po prostu pominięta
    expect(() => epokiZBdl(wartosciBdl(brak.odp, brak.meta, '2021'))).toThrow(/brak wartości/);
  });

  it('P4253: 85-89 i 90+ łączą się w 85+, razem 18 grup', () => {
    const grupy = [
      '0-4',
      '5-9',
      '10-14',
      '15-19',
      '20-24',
      '25-29',
      '30-34',
      '35-39',
      '40-44',
      '45-49',
      '50-54',
      '55-59',
      '60-64',
      '65-69',
      '70-74',
      '75-79',
      '80-84',
      '85-89',
      '90 i więcej',
    ];
    const w: { id: number; n1: string; n2: string; val: number | null }[] = [];
    let id = 1;
    for (const [n1, baza] of [
      ['mężczyźni', 100],
      ['kobiety', 200],
    ] as const) {
      let suma = 0;
      for (let i = 0; i < grupy.length; i++) {
        w.push({ id: id++, n1, n2: grupy[i], val: baza + i });
        suma += baza + i;
      }
      w.push({ id: id++, n1, n2: 'ogółem', val: suma });
    }
    const { meta, odp } = bdl(w);
    const wiek = wiek2021ZBdl(wartosciBdl(odp, meta, '2021'));
    expect(wiek.M).toHaveLength(18);
    expect(wiek.K).toHaveLength(18);
    expect(wiek.M[0]).toBe(100);
    expect(wiek.M[16]).toBe(116);
    expect(wiek.M[17]).toBe(117 + 118);
    expect(wiek.K[17]).toBe(217 + 218);
    // niezgodna suma ogółem to błąd
    const zle = w.map((x) => (x.n1 === 'kobiety' && x.n2 === 'ogółem' ? { ...x, val: 1 } : x));
    const b = bdl(zle);
    expect(() => wiek2021ZBdl(wartosciBdl(b.odp, b.meta, '2021'))).toThrow(/suma/);
  });

  it('P2137: rok 2025, 85 i więcej, bez grup zbiorczych', () => {
    const grupy = [
      '0-4',
      '5-9',
      '10-14',
      '15-19',
      '20-24',
      '25-29',
      '30-34',
      '35-39',
      '40-44',
      '45-49',
      '50-54',
      '55-59',
      '60-64',
      '65-69',
      '70-74',
      '75-79',
      '80-84',
      '85 i więcej',
    ];
    const w: { id: number; n1: string; n2: string; val: number | null }[] = [];
    let id = 1;
    let m = 0;
    let k = 0;
    for (let i = 0; i < grupy.length; i++) {
      w.push({ id: id++, n1: grupy[i], n2: 'mężczyźni', val: 10 + i });
      w.push({ id: id++, n1: grupy[i], n2: 'kobiety', val: 20 + i });
      w.push({ id: id++, n1: grupy[i], n2: 'ogółem', val: 30 + 2 * i });
      m += 10 + i;
      k += 20 + i;
    }
    w.push({ id: id++, n1: '70 i więcej', n2: 'mężczyźni', val: 99999 });
    w.push({ id: id++, n1: '0-14', n2: 'kobiety', val: 99999 });
    w.push({ id: id++, n1: 'ogółem', n2: 'mężczyźni', val: m });
    w.push({ id: id++, n1: 'ogółem', n2: 'kobiety', val: k });
    const { meta } = bdl(w);
    const odp = {
      results: w.map((x) => ({
        id: x.id,
        values: [
          { year: '2024', val: 1 },
          { year: '2025', val: x.val as number },
        ],
      })),
    };
    const wiek = wiek2025ZBdl(wartosciBdl(odp, meta, '2025'));
    expect(wiek.M).toEqual(Array.from({ length: 18 }, (_, i) => 10 + i));
    expect(wiek.K).toEqual(Array.from({ length: 18 }, (_, i) => 20 + i));
  });
});
