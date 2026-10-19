import { describe, expect, it } from 'vitest';
import type { BuildingClass } from '../../src/content/data.ts';
import { mulberry } from '../../src/core/rng.ts';
import {
  kontekstyLookow,
  LOOKI,
  type LookBudynku,
  type LookKontekst,
  type LookWejscie,
  lookBudynku,
} from '../../src/render/art/lookBudynku.ts';
import { RODZAJE, type RodzajPunktu } from '../../src/world/rodzaje.ts';
import { T } from '../../src/world/terrain.ts';

/* Który z 11 wyglądów budynków z PixelLab dostaje budynek (albo null: dawny wygląd z kodu). Dane wejściowe to ręcznie
   zbudowane budynki, bez świata, więc oczekiwania są literałami; zgodność z prawdziwymi dane z kafelków sprawdza
   look-budynku-dema.test.ts. */

const dom = (o: Partial<LookWejscie> = {}): LookWejscie => ({
  cls: 'inne',
  levels: 2,
  name: 'Budynek 1',
  area: 400,
  cats: [],
  tags: {},
  ...o,
});

describe('rodzaj punktu w budynku wybiera wygląd', () => {
  const tabela: [RodzajPunktu, LookBudynku][] = [
    ['szpital', 'szpital'],
    ['ratusz', 'ratusz'],
    ['teatr', 'teatr'],
    ['muzeum', 'muzeum'],
    ['dworzec', 'dworzec'],
    ['remiza', 'remiza'],
    ['kosciol', 'kosciol'],
    ['hotel', 'hotel'],
    ['urzad', 'urzad'],
    ['willa', 'willa'],
  ];
  for (const [rodzaj, look] of tabela)
    it(`${rodzaj} w budynku to ${look}`, () => {
      const cls: BuildingClass = rodzaj === 'willa' ? 'dom' : 'inne';
      expect(lookBudynku(dom({ cls, area: 300, rodzaje: [rodzaj] }))).toBe(look);
    });

  it('każdy rodzaj ze słownika ma wygląd, a każdy wygląd poza kamienicą ma rodzaj', () => {
    expect(new Set(tabela.map(([r]) => r))).toEqual(new Set(RODZAJE));
    expect(new Set(tabela.map(([, l]) => l))).toEqual(new Set(LOOKI.filter((l) => l !== 'kamienica')));
  });

  it('przy kilku rodzajach wygrywa rzadszy i jednoznaczniejszy (szpital, ratusz, teatr, muzeum… urząd, willa)', () => {
    expect(lookBudynku(dom({ rodzaje: ['hotel', 'muzeum'] }))).toBe('muzeum');
    expect(lookBudynku(dom({ rodzaje: ['urzad', 'szpital'] }))).toBe('szpital');
    expect(lookBudynku(dom({ rodzaje: ['urzad', 'hotel'] }))).toBe('hotel');
    expect(lookBudynku(dom({ cls: 'dom', area: 200, rodzaje: ['willa', 'urzad'] }))).toBe('urzad');
  });
});

describe('nazwa budynku', () => {
  it('nazwa z OSM (tag name) ze słowem kluczowym wybiera wygląd', () => {
    const tabela: [string, LookBudynku][] = [
      ['Ratusz Staromiejski', 'ratusz'],
      ['Muzeum Okręgowe', 'muzeum'],
      ['Teatr Wielki', 'teatr'],
      ['Dworzec Główny', 'dworzec'],
      ['Hotel Europejski', 'hotel'],
      ['OSP Zielonki', 'remiza'],
      ['Szpital Powiatowy', 'szpital'],
    ];
    for (const [nazwa, look] of tabela)
      expect(lookBudynku(dom({ name: nazwa, tags: { name: nazwa } })), nazwa).toBe(look);
  });

  it('nazwy ulic podobne do rzeczowników nie robią z budynku szpitala ani teatru', () => {
    for (const nazwa of ['Szpitalna 12', 'Teatralna 5', 'Muzealna 3', 'Dworcowa 9', 'Hotelowa 1', 'Kościelna 4'])
      expect(lookBudynku(dom({ name: nazwa, tags: { name: nazwa } })), nazwa).toBeNull();
  });

  it('nazwa budynku z punktu w środku (bez tagu name) też działa, ale nie w budynku z wieloma sklepami i usługami', () => {
    expect(lookBudynku(dom({ name: 'Muzeum Piwa' }))).toBe('muzeum');
    const handlowy = dom({
      cls: 'blok',
      levels: 4,
      area: 900,
      name: 'Hotel Bar',
      cats: ['sklep', 'spozywczy', 'apteka'],
    });
    expect(lookBudynku(handlowy)).toBeNull();
  });

  it('nazwa z OSM jest pewna także w budynku z wieloma sklepami', () => {
    const hotel = dom({
      cls: 'blok',
      levels: 5,
      area: 900,
      name: 'Hotel Europejski',
      tags: { name: 'Hotel Europejski', 'building:levels': '5' },
      cats: ['sklep', 'spozywczy', 'apteka'],
    });
    expect(lookBudynku(hotel)).toBe('hotel');
  });

  it('nazwa wygenerowana przez grę („Blok nr 19”, „Pawilon 3”) niczego nie wybiera', () => {
    for (const nazwa of ['Blok nr 19', 'Pawilon 3', 'Budynek 12', 'Dom nr 9A', 'Garaże 2'])
      expect(lookBudynku(dom({ name: nazwa })), nazwa).toBeNull();
  });
});

describe('klasa budynku i kategorie punktów', () => {
  it('kościół z klasy (tag, miejsce kultu w środku) albo z kategorii to wygląd kościoła', () => {
    expect(lookBudynku(dom({ cls: 'kosciol', area: 300 }))).toBe('kosciol');
    expect(lookBudynku(dom({ cats: ['kosciol'], area: 300 }))).toBe('kosciol');
  });

  it('mała kaplica (poniżej 80 m²) zostaje z kodu', () => {
    expect(lookBudynku(dom({ cls: 'kosciol', area: 40 }))).toBeNull();
  });

  it('biblioteka jako jedyna kategoria to urząd, ale biblioteka w budynku z wieloma sklepami nie', () => {
    expect(lookBudynku(dom({ cats: ['biblioteka'] }))).toBe('urzad');
    expect(lookBudynku(dom({ cats: ['biblioteka', 'sklep', 'spozywczy'] }))).toBeNull();
  });

  it('przychodnia, szkoła, garaż i hala nie mają własnego wyglądu', () => {
    expect(lookBudynku(dom({ cls: 'przychodnia', cats: ['przychodnia'] }))).toBeNull();
    for (const cls of ['szkola', 'garaz', 'hala', 'sklep', 'blok', 'dom', 'inne'] as BuildingClass[])
      expect(lookBudynku(dom({ cls, cats: cls === 'sklep' ? ['sklep'] : [] })), cls).toBeNull();
  });
});

describe('rozmiar i piętra', () => {
  it('malutki budynek (garażowy) nie dostaje wyglądu mimo rodzaju punktu', () => {
    for (const r of RODZAJE) expect(lookBudynku(dom({ cls: 'dom', area: 25, rodzaje: [r] })), r).toBeNull();
  });

  it('znana liczba pięter poza zakresem wyglądu odrzuca go, nieznana (zgadnięta) nie', () => {
    // muzeum ma najwyżej 4 piętra, hotel co najmniej 2
    expect(
      lookBudynku(dom({ levels: 8, area: 600, tags: { 'building:levels': '8' }, rodzaje: ['muzeum'] })),
    ).toBeNull();
    expect(lookBudynku(dom({ levels: 10, area: 600, rodzaje: ['muzeum'] }))).toBe('muzeum');
    expect(lookBudynku(dom({ levels: 1, area: 600, tags: { 'building:levels': '1' }, rodzaje: ['hotel'] }))).toBeNull();
    expect(lookBudynku(dom({ levels: 1, area: 600, rodzaje: ['hotel'] }))).toBe('hotel');
    expect(lookBudynku(dom({ levels: 5, area: 600, tags: { 'building:levels': '5' }, rodzaje: ['hotel'] }))).toBe(
      'hotel',
    );
  });

  it('willa to tylko dom: blok z willą w nazwie zostaje blokiem', () => {
    expect(lookBudynku(dom({ cls: 'dom', area: 200, rodzaje: ['willa'] }))).toBe('willa');
    expect(lookBudynku(dom({ cls: 'blok', area: 200, rodzaje: ['willa'] }))).toBeNull();
  });
});

describe('kamienica: zabudowa pierzejowa', () => {
  const kam = (o: Partial<LookWejscie> = {}) =>
    dom({ cls: 'blok', levels: 4, tags: { 'building:levels': '4' }, area: 260, ...o });
  const rzad = (o: Partial<LookKontekst> = {}): LookKontekst => ({
    rzad: 4,
    nieregularnosc: 0.3,
    przyUlicy: 0.9,
    front: 12,
    blizniaki: 0.1,
    ...o,
  });

  it('wąski, kilkupiętrowy budynek w nieregularnym rzędzie przy ulicy to kamienica', () => {
    expect(lookBudynku(kam(), rzad())).toBe('kamienica');
  });

  it('bez kontekstu świata kamienicy się nie rozpoznaje', () => {
    expect(lookBudynku(kam())).toBeNull();
  });

  it('progi: rząd od 3 budynków, nieregularność od 0,12, ulica od połowy frontu', () => {
    expect(lookBudynku(kam(), rzad({ rzad: 2 }))).toBeNull();
    expect(lookBudynku(kam(), rzad({ rzad: 3 }))).toBe('kamienica');
    // sekcje bloku z wielkiej płyty mają niemal równe szerokości
    expect(lookBudynku(kam(), rzad({ nieregularnosc: 0.05 }))).toBeNull();
    expect(lookBudynku(kam(), rzad({ nieregularnosc: 0.12 }))).toBe('kamienica');
    expect(lookBudynku(kam(), rzad({ przyUlicy: 0.3 }))).toBeNull();
    expect(lookBudynku(kam(), rzad({ przyUlicy: 0.5 }))).toBe('kamienica');
    // sekcje bloku z wielkiej płyty mają niemal równe pola (nawet ta węższa na końcu): bliźniaków ponad połowa
    expect(lookBudynku(kam(), rzad({ blizniaki: 0.86 }))).toBeNull();
    expect(lookBudynku(kam(), rzad({ blizniaki: 0.5 }))).toBe('kamienica');
  });

  it('piętra: od 3 do 6, i tylko znane z danych', () => {
    for (const [p, ok] of [
      [2, false],
      [3, true],
      [6, true],
      [7, false],
    ] as const)
      expect(lookBudynku(kam({ levels: p, tags: { 'building:levels': String(p) } }), rzad()), `${p} pięter`).toBe(
        ok ? 'kamienica' : null,
      );
    expect(lookBudynku(kam({ tags: {} }), rzad())).toBeNull();
  });

  it('data budowy: sprzed 1950 albo nieznana tak, powojenna nie', () => {
    const tabela: [string, boolean][] = [
      ['1905', true],
      ['1949', true],
      ['~1930', true],
      ['C19', true],
      ['1950', false],
      ['1975', false],
      ['1970s', false],
      ['~1965', false],
    ];
    for (const [data, ok] of tabela)
      expect(lookBudynku(kam({ startDate: data }), rzad()), data).toBe(ok ? 'kamienica' : null);
  });

  it('front do 22 m wzdłuż rzędu, pole do 900 m², a szkoła i przychodnia to nie kamienica', () => {
    expect(lookBudynku(kam(), rzad({ front: 22 }))).toBe('kamienica');
    expect(lookBudynku(kam(), rzad({ front: 23 }))).toBeNull();
    expect(lookBudynku(kam({ area: 900 }), rzad())).toBe('kamienica');
    expect(lookBudynku(kam({ area: 901 }), rzad())).toBeNull();
    expect(lookBudynku(kam({ area: 119 }), rzad())).toBeNull();
    for (const cls of ['szkola', 'przychodnia', 'kosciol', 'garaz', 'hala'] as BuildingClass[])
      expect(lookBudynku(kam({ cls }), rzad()), cls).not.toBe('kamienica');
  });

  it('muzeum w kamienicy wygrywa z kamienicą', () => {
    expect(lookBudynku(kam({ rodzaje: ['muzeum'] }), rzad())).toBe('muzeum');
  });
});

describe('własności na losowych budynkach', () => {
  const rnd = mulberry(20511019);
  const los = <X>(t: readonly X[]): X => t[Math.floor(rnd() * t.length)];
  const KLASY: BuildingClass[] = ['blok', 'dom', 'sklep', 'szkola', 'przychodnia', 'garaz', 'hala', 'kosciol', 'inne'];
  const NAZWY = [
    'Blok nr 3',
    'Dom 12',
    'Pawilon 7',
    'Budynek 4',
    'Szkoła nr 5',
    'Garaże 2',
    'Ratusz Staromiejski',
    'Hotel X',
  ];
  const KATEGORIE = ['sklep', 'spozywczy', 'apteka', 'szkola', 'przychodnia', 'bank', 'biblioteka', 'kosciol', 'urzad'];

  function losowy(): { b: LookWejscie; ctx: LookKontekst } {
    const nazwa = los(NAZWY);
    const pietra = 1 + Math.floor(rnd() * 14);
    const b: LookWejscie = {
      cls: los(KLASY),
      levels: pietra,
      name: nazwa,
      area: Math.floor(rnd() * 1500),
      cats: KATEGORIE.filter(() => rnd() < 0.25),
      tags: { ...(rnd() < 0.5 ? { 'building:levels': String(pietra) } : {}), ...(rnd() < 0.3 ? { name: nazwa } : {}) },
      ...(rnd() < 0.4 ? { rodzaje: RODZAJE.filter(() => rnd() < 0.3) } : {}),
      ...(rnd() < 0.3 ? { startDate: los(['1905', '1975', '~1930', '1970s']) } : {}),
    };
    return {
      b,
      ctx: {
        rzad: 1 + Math.floor(rnd() * 6),
        nieregularnosc: rnd() * 0.5,
        przyUlicy: rnd(),
        front: 4 + Math.floor(rnd() * 40),
        blizniaki: rnd(),
      },
    };
  }

  const próby = Array.from({ length: 4000 }, losowy);

  it('wynik jest zawsze jednym z 11 wyglądów albo null, i ten sam przy tych samych danych', () => {
    const dozwolone = new Set<string | null>([null, ...LOOKI]);
    for (const { b, ctx } of próby) {
      const w = lookBudynku(b, ctx);
      expect(dozwolone.has(w)).toBe(true);
      expect(lookBudynku(b, ctx)).toBe(w);
    }
  });

  it('kolejność kategorii i rodzajów oraz obce tagi nie zmieniają wyniku', () => {
    for (const { b, ctx } of próby) {
      const inny: LookWejscie = {
        ...b,
        cats: [...b.cats].reverse(),
        ...(b.rodzaje ? { rodzaje: [...b.rodzaje].reverse() } : {}),
        tags: { ...b.tags, surface: 'concrete', 'roof:shape': 'flat', 'addr:city': 'Gdańsk' },
      };
      expect(lookBudynku(inny, ctx)).toBe(lookBudynku(b, ctx));
    }
  });

  it('budynek mniejszy niż 25 m² nigdy nie dostaje wyglądu', () => {
    for (const { b, ctx } of próby) expect(lookBudynku({ ...b, area: 24 }, ctx)).toBeNull();
  });

  it('bez żadnego sygnału (rodzaj, nazwa, kościół, biblioteka, rząd) wygląd jest null', () => {
    for (const { b } of próby) {
      const cichy: LookWejscie = {
        ...b,
        cls: b.cls === 'kosciol' ? 'inne' : b.cls,
        name: 'Budynek 1',
        cats: b.cats.filter((c) => c !== 'kosciol' && c !== 'biblioteka'),
        tags: {},
      };
      delete cichy.rodzaje;
      expect(lookBudynku(cichy), JSON.stringify(cichy)).toBeNull();
    }
  });

  it('wygląd pewny z punktu (rodzaj poza urzędem i willą) nie zależy od sklepów w środku', () => {
    const SKLEPY = ['sklep', 'spozywczy', 'apteka', 'bank'];
    for (const rodzaj of RODZAJE) {
      if (rodzaj === 'urzad' || rodzaj === 'willa') continue;
      const b = dom({ area: 1200, rodzaje: [rodzaj] });
      expect(lookBudynku({ ...b, cats: SKLEPY }), rodzaj).toBe(lookBudynku({ ...b, cats: [] }));
      expect(lookBudynku({ ...b, cats: SKLEPY }), rodzaj).not.toBeNull();
    }
  });

  it('urząd i willa z punktu w budynku z wieloma sklepami (lokatorzy) nic nie zmieniają', () => {
    const SKLEPY = ['sklep', 'spozywczy', 'apteka'];
    expect(lookBudynku(dom({ area: 800, rodzaje: ['urzad'], cats: SKLEPY }))).toBeNull();
    expect(lookBudynku(dom({ cls: 'dom', area: 200, rodzaje: ['willa'], cats: SKLEPY }))).toBeNull();
  });
});

/* Kontekst z siatki świata: ciąg budynków stykających się ścianami, nieregularność ich szerokości i to, jak daleko
   jest jezdnia. Mała ręczna siatka: oczekiwania policzone na kartce. */

type Pr = [x0: number, y0: number, x1: number, y1: number];

function siatka(size: number, budynki: Pr[], jezdnie: Pr[] = []) {
  const bid = new Int32Array(size * size).fill(-1);
  const terr = new Uint8Array(size * size).fill(T.GRASS);
  const prostokat = ([x0, y0, x1, y1]: Pr, f: (i: number) => void) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * size + x);
  };
  for (const j of jezdnie)
    prostokat(j, (i) => {
      terr[i] = T.ROAD;
    });
  for (const [id, b] of budynki.entries())
    prostokat(b, (i) => {
      bid[i] = id;
      terr[i] = T.BUILDING;
    });
  return {
    size,
    bid,
    terr,
    buildings: budynki.map(([x0, y0, x1, y1], id) => ({ id, x0, y0, x1, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) })),
  };
}

describe('kontekstyLookow: sąsiedztwo i ulica z siatki', () => {
  it('trzy budynki obok siebie przy jezdni tworzą rząd z nieregularnymi szerokościami', () => {
    // szerokości 10, 14 i 8: średnia 10,67, odchylenie 2,494, czyli 0,234
    const w = siatka(
      64,
      [
        [10, 20, 19, 40],
        [20, 20, 33, 40],
        [34, 20, 41, 40],
      ],
      [[0, 43, 63, 46]],
    );
    const k = kontekstyLookow(w);
    // front to szerokość budynku wzdłuż rzędu
    expect(k.map((c) => c.front)).toEqual([10, 14, 8]);
    for (const c of k) {
      expect(c.rzad).toBe(3);
      expect(c.nieregularnosc).toBeCloseTo(0.234, 2);
      expect(c.przyUlicy).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('równe szerokości (sekcje bloku) dają nieregularność 0', () => {
    const w = siatka(
      64,
      [
        [10, 20, 21, 40],
        [22, 20, 33, 40],
        [34, 20, 45, 40],
      ],
      [[0, 43, 63, 46]],
    );
    for (const c of kontekstyLookow(w)) expect(c.nieregularnosc).toBeCloseTo(0, 6);
  });

  it('jezdnia daleko od budynku (ponad 4 kafelki) to przyUlicy równe 0', () => {
    const w = siatka(64, [[10, 10, 19, 25]], [[0, 40, 63, 43]]);
    expect(kontekstyLookow(w)[0].przyUlicy).toBe(0);
  });

  it('jezdnia do 4 kafelków od ściany liczy się jako ulica, dalsza nie', () => {
    // ściana południowa na wierszu 25, wolne kafelki 26–29 (cztery), jezdnia od 29 albo od 30
    const blisko = siatka(64, [[10, 10, 19, 25]], [[0, 29, 63, 32]]);
    const daleko = siatka(64, [[10, 10, 19, 25]], [[0, 30, 63, 33]]);
    expect(kontekstyLookow(blisko)[0].przyUlicy).toBe(1);
    expect(kontekstyLookow(daleko)[0].przyUlicy).toBe(0);
  });

  it('jezdnia za innym budynkiem nie jest przy ulicy (ściana zasłania)', () => {
    // za wolnym wierszem 26 stoi jednowierszowy budynek (27), a dopiero za nim jezdnia (28–31), w zasięgu 4 kafelków
    const w = siatka(
      64,
      [
        [10, 10, 19, 25],
        [10, 27, 19, 27],
      ],
      [[0, 28, 63, 31]],
    );
    expect(kontekstyLookow(w)[0].przyUlicy).toBe(0);
  });

  it('rząd w pionie (ulica po wschodniej stronie) też jest rzędem', () => {
    const w = siatka(
      64,
      [
        [10, 10, 20, 19],
        [10, 20, 20, 33],
        [10, 34, 20, 41],
      ],
      [[23, 0, 26, 63]],
    );
    const k = kontekstyLookow(w);
    // w rzędzie pionowym frontem jest głębokość (rozmiar w pionie)
    expect(k.map((c) => c.front)).toEqual([10, 14, 8]);
    for (const c of k) {
      expect(c.rzad).toBe(3);
      expect(c.nieregularnosc).toBeCloseTo(0.234, 2);
      expect(c.przyUlicy).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('budynek stojący osobno albo z przerwą kafelka nie ma rzędu', () => {
    const osobno = siatka(64, [[10, 10, 19, 25]]);
    expect(kontekstyLookow(osobno)[0]).toMatchObject({ rzad: 1, nieregularnosc: 0 });
    const zPrzerwa = siatka(64, [
      [10, 10, 19, 25],
      [21, 10, 30, 25],
    ]);
    expect(kontekstyLookow(zPrzerwa).map((c) => c.rzad)).toEqual([1, 1]);
  });

  it('bliźniaki to udział pozostałych budynków rzędu o polu w granicach 10% własnego', () => {
    // pola 10×20 = 200, 8×27 = 216, 10×23 = 230 i 21×20 = 420 w jednym rzędzie. Dla 200 bliźniakiem jest 216 (8%), ale nie
    // 230 (15%) i nie 420: jeden z trzech. Dla 216 bliźniakami są 200 i 230: dwa z trzech. 420 nie ma bliźniaków.
    const w = siatka(100, [
      [10, 10, 19, 29],
      [20, 10, 27, 36],
      [28, 10, 37, 32],
      [38, 10, 58, 29],
    ]);
    expect(kontekstyLookow(w).map((c) => c.blizniaki.toFixed(2))).toEqual(['0.33', '0.67', '0.33', '0.00']);
  });

  it('rząd sekcji o równych polach (jedna węższa i głębsza) nie daje kamienic, rząd o różnych polach tak', () => {
    const zlicz = (budynki: Pr[], pietra = 5) => {
      const w = siatka(120, budynki, [[0, 60, 119, 64]]);
      const ctx = kontekstyLookow(w);
      return w.buildings.map((b, i) =>
        lookBudynku(
          {
            cls: 'blok',
            levels: pietra,
            name: `Blok ${b.id}`,
            area: b.area,
            cats: [],
            tags: { 'building:levels': String(pietra) },
          },
          ctx[i],
        ),
      );
    };
    // sekcje jak w Przymorzu: 18×12, 19×11, 17×13, 18×12 i węższa, głębsza 7×31, wszystkie około 215 m², fronty przy jezdni:
    // szerokości różne (rząd „nieregularny”), więc odpadają dopiero przez bliźniaki
    const sekcje = zlicz([
      [10, 47, 27, 58],
      [28, 48, 46, 58],
      [47, 46, 63, 58],
      [64, 47, 81, 58],
      [82, 28, 88, 58],
    ]);
    expect(sekcje).toEqual([null, null, null, null, null]);
    // te same szerokości i frontu przy jezdni, ale pola różne: 9×16, 14×20, 11×12, 18×25, 7×14
    const kamienice = zlicz([
      [10, 43, 18, 58],
      [19, 39, 32, 58],
      [33, 47, 43, 58],
      [44, 34, 61, 58],
      [62, 45, 68, 58],
    ]);
    expect(kamienice).toEqual(['kamienica', 'kamienica', 'kamienica', 'kamienica', null]);
  });

  it('dłuższy rząd bierze pod uwagę kierunek, w którym budynków jest więcej', () => {
    // trzy w poziomie, a jeden z nich ma jeszcze czwarty pod sobą: czwarty tworzy z nim tylko rząd pionowy o długości 2
    const w = siatka(64, [
      [10, 10, 19, 20],
      [20, 10, 29, 20],
      [30, 10, 39, 20],
      [20, 21, 29, 30],
    ]);
    expect(kontekstyLookow(w).map((c) => c.rzad)).toEqual([3, 3, 3, 2]);
  });
});
