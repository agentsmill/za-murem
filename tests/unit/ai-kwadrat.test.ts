/* Wybór kwadratu osady AI (src/ai/kwadrat.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 2).
   Reguła miejsca (Mateusz, 24.10.2026): osada staje na jednym z ośmiu kwadratów wokół domu, w kolejności z ziarna gry; siedziba
   to największy budynek mieszkalny blisko środka kwadratu z co najmniej trzema pokojami, blok z mieszkańcami z generatora, a w
   zasięgu 720 m ma być co najmniej 300 porcji jedzenia; pierwszy kandydat, który spełnia, wygrywa, żaden: gra bez rywala.
   Testy: jedzenie w zasięgu (liczby z raportu etapu 1, rozdział 6, na okolicy domów trzech dem), kolejność kandydatów i ziarno
   osady, przesunięcie geo do siedziby (czyste, na małej mapie), kierunek i nazwa, a na prawdziwych danych dem (20 sąsiednich
   kwadratów z public/demo/*-kwadraty.json i tabele mieszkańców z public/data): które kwadraty spełniają regułę, świat osady
   (siedziba, mieszkańcy, opcje gry), odtwarzalność świata z zapisanego geo i wybór `wybierzOsade`. Dane dem czyta
   `tools/osada-kwadraty.ts` (to samo narzędzie drukuje tabelę kroku 4 zadania). */

import { beforeAll, describe, expect, it } from 'vitest';
import { grajDo, nowaGraAi } from '../../src/ai/gra.ts';
import {
  jedzenieWZasiegu,
  kandydaciOsady,
  kandydaciSiedziby,
  kierunekOsady,
  MIN_POKOI_SIEDZIBY,
  nazwaOsady,
  opiszSiedzibe,
  PROBY_SIEDZIBY,
  PROG_JEDZENIA_OSADY,
  PROMIEN_SIEDZIBY_M,
  przesunGeo,
  type SwiatOsady,
  siedzibaWystarcza,
  swiatOsady,
  swiatZGeo,
  wybierzOsade,
  ziarnoOsady,
} from '../../src/ai/kwadrat.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { POICAT } from '../../src/content/data.ts';
import { hashString } from '../../src/core/rng.ts';
import { celZMiejsca, MAX_OKOLICA_M } from '../../src/gov/wyprawy.ts';
import { pierscienieBudynku, wObrysie } from '../../src/mieszkancy/obrys.ts';
import type { DaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { zGeneratora } from '../../src/sim/osiedle.ts';
import { worldKey } from '../../src/ui/zapis.ts';
import type { Geo, Pt } from '../../src/world/geo.ts';
import {
  kluczKwadratu,
  sasiedzi8,
  seedKwadratu,
  srodekKwadratu,
  type Uklad,
  ukladZGeo,
} from '../../src/world/kwadraty.ts';
import { kluczZMetrow, type Miejsce } from '../../src/world/miasto.ts';
import { type DemoDanych, daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';
import { okolicaZGeo } from './miasto-play.ts';

const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type Demo = (typeof DEMA)[number];
/** ziarno gry w testach (to samo co ziarno 11 w uprzęży bot:osada) */
const ZIARNO = 11;

/** odpowiedź `swiatOsady`: świat albo odrzucenie z powodem */
type Wynik = ReturnType<typeof swiatOsady>;
const jestSwiat = (w: Wynik): w is SwiatOsady => !('odrzucony' in w);

describe('stałe reguły', () => {
  it('próg jedzenia 300 porcji, siedziba w promieniu 120 m, najwyżej 4 próby, co najmniej 3 pokoje', () => {
    expect(PROG_JEDZENIA_OSADY).toBe(300);
    expect(PROMIEN_SIEDZIBY_M).toBe(120);
    expect(PROBY_SIEDZIBY).toBe(4);
    expect(MIN_POKOI_SIEDZIBY).toBe(3);
  });
});

describe('jedzenieWZasiegu', () => {
  const okolica = (d: Demo): Miejsce[] => okolicaZGeo(wczytajDemo(d).geo);

  it('okolica domów trzech dem: Przymorze 855, Lanciego 1167, Zielonki 17 (raport etapu 1, rozdział 6)', () => {
    const przymorze = jedzenieWZasiegu(okolica('przymorze'));
    const lanciego = jedzenieWZasiegu(okolica('lanciego'));
    const zielonki = jedzenieWZasiegu(okolica('zielonki'));
    expect(przymorze).toBeGreaterThan(855 * 0.97);
    expect(przymorze).toBeLessThan(855 * 1.03);
    expect(lanciego).toBeGreaterThan(1167 * 0.97);
    expect(lanciego).toBeLessThan(1167 * 1.03);
    expect(Math.abs(zielonki - 17)).toBeLessThanOrEqual(3);
  });

  it('bez miejsc nie ma jedzenia; mniejszy promień daje nie więcej, a domyślny promień to MAX_OKOLICA_M', () => {
    const m = okolica('przymorze');
    expect(jedzenieWZasiegu([])).toBe(0);
    expect(jedzenieWZasiegu(m, 0)).toBe(0);
    expect(jedzenieWZasiegu(m)).toBe(jedzenieWZasiegu(m, MAX_OKOLICA_M));
    let poprzednie = 0;
    for (const promien of [200, 300, 400, 500, 600, 720, 1000]) {
      const j = jedzenieWZasiegu(m, promien);
      expect(j, `promień ${promien}`).toBeGreaterThanOrEqual(poprzednie);
      poprzednie = j;
    }
    expect(jedzenieWZasiegu(m, 400)).toBeLessThan(jedzenieWZasiegu(m, 720));
  });

  it('liczy zapas miejsca razy udział jedzenia w łupie; miejsca na mapie lokalnej (do 192 m) nie liczą się, bo wyprawa tam nie idzie', () => {
    // sklep spożywczy ma w łupie samo jedzenie: udział 1, więc porcje to zapas z celu wyprawy
    const sklep = (klucz: string, odl: number): Miejsce => ({ klucz, kat: 'spozywczy', x: odl, y: 0, odl, nazwa: '' });
    const z = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309].map((k) => sklep(`poi:${k}:1`, 300));
    const zapasy = z.map((m) => celZMiejsca(m).zapas ?? 0);
    expect(zapasy.some((s) => s > 0)).toBe(true);
    expect(jedzenieWZasiegu(z)).toBeCloseTo(
      zapasy.reduce((a, b) => a + b, 0),
      9,
    );
    // to samo miejsce 100 m od siedziby leży na mapie lokalnej (192 m): nie liczy się
    expect(jedzenieWZasiegu(z.map((m) => ({ ...m, x: 100, odl: 100 })))).toBe(0);
    // brzeg mapy lokalnej (192 m) jeszcze do niej należy, kawałek dalej już nie
    expect(jedzenieWZasiegu(z.map((m) => ({ ...m, x: 192, odl: 192 })))).toBe(0);
    expect(jedzenieWZasiegu(z.map((m) => ({ ...m, x: 193, odl: 193 })))).toBeGreaterThan(0);
    // dalej niż promień: poza zasięgiem (720 m włącznie)
    expect(jedzenieWZasiegu(z.map((m) => ({ ...m, x: 720, odl: 720 })))).toBeGreaterThan(0);
    expect(jedzenieWZasiegu(z.map((m) => ({ ...m, x: 721, odl: 721 })))).toBe(0);
  });

  it('udział jedzenia: stacja paliw (opał 3–6, jedzenie 0–3) daje ćwierć zapasu, szkoła (bez jedzenia) nic', () => {
    const stacje = Array.from(
      { length: 12 },
      (_, k): Miejsce => ({
        klucz: `poi:${500 + k}:7`,
        kat: 'stacja',
        x: 400,
        y: 0,
        odl: 400,
        nazwa: '',
      }),
    );
    const zapas = stacje.reduce((a, m) => a + (celZMiejsca(m).zapas ?? 0), 0);
    expect(zapas).toBeGreaterThan(0);
    // łup stacji: opał [3, 6] → po skali 0,5 [2, 3] (środek 2,5), jedzenie [0, 3] → [0, 2] (środek 1): udział 1 / 3,5
    const udzial = 1 / (2.5 + 1);
    expect(jedzenieWZasiegu(stacje)).toBeCloseTo(zapas * udzial, 9);
    const szkoly = stacje.map((m) => ({ ...m, kat: 'szkola' }));
    expect(jedzenieWZasiegu(szkoly)).toBe(0);
  });
});

describe('kandydaciOsady', () => {
  const osiem = sasiedzi8(0, 0).map(([x, y]) => kluczKwadratu(x, y));
  const klucze = (k: [number, number][]): string[] => k.map(([x, y]) => kluczKwadratu(x, y));

  it('osiem kwadratów wokół domu, dwa wywołania dają to samo, bez domu', () => {
    const a = kandydaciOsady(11);
    expect(a).toHaveLength(8);
    expect(klucze(a).sort()).toEqual([...osiem].sort());
    expect(kandydaciOsady(11)).toEqual(a);
    expect(klucze(a)).not.toContain('0,0');
  });

  it('inne ziarno daje inną kolejność (11 i 12), a każde ziarno to permutacja ośmiu kwadratów', () => {
    expect(kandydaciOsady(11)).not.toEqual(kandydaciOsady(12));
    const kolejnosci = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const k = klucze(kandydaciOsady(seed));
      expect([...k].sort(), `ziarno ${seed}`).toEqual([...osiem].sort());
      kolejnosci.add(k.join(';'));
    }
    // kolejność naprawdę zależy od ziarna (nie ma jednej stałej): wśród 60 ziaren wiele różnych
    expect(kolejnosci.size).toBeGreaterThan(30);
    // pierwszy kandydat nie jest zawsze ten sam
    expect(new Set(Array.from({ length: 60 }, (_, s) => klucze(kandydaciOsady(s + 1))[0])).size).toBeGreaterThan(4);
  });

  it('ziarna z wielkich i ujemnych liczb dają to samo przy powtórzeniu (bez Math.random)', () => {
    for (const seed of [0, -5, 2 ** 31 - 1, 2 ** 32 - 1, 123456789]) {
      expect(kandydaciOsady(seed)).toEqual(kandydaciOsady(seed));
      expect(kandydaciOsady(seed)).toHaveLength(8);
    }
  });

  it('złote kolejności ziaren 11 i 12: Fisher–Yates z rngOf, a nie sort z losowym porównaniem ani przesunięcie cykliczne', () => {
    // Kolejność jest częścią gry (od niej zależy, gdzie staje osada), więc przypięta literalnie. Sort z losowym porównaniem
    // (kolejność porównań zależy od silnika JS: raz dał inną noc na Node 24 niż na 25) i wariant Sattolo (`rng() * k` zamiast
    // `rng() * (k + 1)`) dają tu inne kolejności i ten test pada.
    expect(klucze(kandydaciOsady(11))).toEqual(['0,-1', '-1,-1', '-1,1', '1,-1', '0,1', '-1,0', '1,0', '1,1']);
    expect(klucze(kandydaciOsady(12))).toEqual(['1,0', '0,1', '1,1', '-1,0', '1,-1', '-1,-1', '-1,1', '0,-1']);
  });

  it('tasowanie dopuszcza kwadrat na swoim miejscu z `sasiedzi8` (Sattolo, czyli jeden cykl, tego nie daje)', () => {
    // wśród 60 ziaren jest kolejność, w której co najmniej jeden kwadrat stoi tam, gdzie w `sasiedzi8(0, 0)`; dla losowej
    // permutacji ośmiu elementów ma tak około 63%, więc wszystkie 60 bez takiej to prawdopodobieństwo rzędu 1e-26
    const bazowa = klucze(sasiedzi8(0, 0));
    const zPunktemStalym = Array.from({ length: 60 }, (_, s) => klucze(kandydaciOsady(s + 1))).filter((k) =>
      k.some((x, i) => x === bazowa[i]),
    );
    expect(zPunktemStalym.length).toBeGreaterThan(20);
  });
});

describe('ziarnoOsady', () => {
  it('liczba całkowita bez znaku, deterministyczna, różna od ziarna kwadratu, ziarna gry i innych kwadratów', () => {
    for (const [sx, sy] of sasiedzi8(0, 0)) {
      const z = ziarnoOsady(ZIARNO, sx, sy);
      expect(Number.isInteger(z)).toBe(true);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(0xffffffff);
      expect(ziarnoOsady(ZIARNO, sx, sy)).toBe(z);
      expect(z).not.toBe(seedKwadratu(ZIARNO, sx, sy));
      expect(z).not.toBe(ZIARNO);
    }
    const zwykle = new Set(sasiedzi8(0, 0).map(([sx, sy]) => ziarnoOsady(ZIARNO, sx, sy)));
    expect(zwykle.size).toBe(8);
    expect(ziarnoOsady(ZIARNO, 1, 0)).not.toBe(ziarnoOsady(ZIARNO + 1, 1, 0));
  });

  it('to skrót z prefiksem „osada”', () => {
    expect(ziarnoOsady(ZIARNO, 1, -1)).toBe(Number.parseInt(hashString(`osada:${ZIARNO}:1:-1`), 16));
  });
});

describe('przesunGeo', () => {
  const mini = (): Geo => ({
    c: [54.4, 18.6],
    b: [
      {
        p: [
          [0, 0],
          [10, 0],
          [10, 10.5],
          [0, 0],
        ],
        pp: [
          [
            [20, 0],
            [30, 0.5],
            [20, 0],
          ],
        ],
        t: { building: 'apartments', 'zm:klucz': 'px:1:2:3:4:5' },
      },
    ],
    r: [
      {
        l: [
          [-5, 2],
          [5, 2.5],
        ],
        h: 'residential',
      },
    ],
    a: [
      {
        p: [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
        k: 'park',
      },
    ],
    w: [
      {
        l: [
          [3, 3],
          [4, 4.5],
        ],
      },
    ],
    poi: [{ x: 1.5, y: -2.5, c: 'spozywczy', n: '', k: 'poi:1000:2000' }],
    rodzaje: [{ x: 2, y: 3, k: 'muzeum', n: '' }],
    pass: [
      {
        l: [
          [0, 0],
          [1, 1],
        ],
        h: 'service',
      },
    ],
    src: 'test',
  });

  it('każdy punkt (budynki z częściami, drogi, tereny, wody, miejsca, rodzaje, przejścia) przesuwa się o tyle samo', () => {
    const g = mini();
    const s = przesunGeo(g, 10, 2.5);
    expect(s.b[0].p).toEqual([
      [-10, -2.5],
      [0, -2.5],
      [0, 8],
      [-10, -2.5],
    ]);
    expect(s.b[0].pp).toEqual([
      [
        [10, -2.5],
        [20, -2],
        [10, -2.5],
      ],
    ]);
    expect(s.r[0].l).toEqual([
      [-15, -0.5],
      [-5, 0],
    ]);
    expect(s.a[0].p[0]).toEqual([-9, -1.5]);
    expect(s.w[0].l[1]).toEqual([-6, 2]);
    expect(s.poi[0]).toMatchObject({ x: -8.5, y: -5 });
    expect(s.rodzaje?.[0]).toMatchObject({ x: -8, y: 0.5 });
    expect(s.pass?.[0].l[1]).toEqual([-9, -1.5]);
  });

  it('wejście zostaje nietknięte, a reszta pól (tagi, rodzaje dróg i terenów, klucze miejsc, źródło) bez zmian', () => {
    const g = mini();
    const kopia = structuredClone(g);
    const s = przesunGeo(g, 7.5, -3);
    expect(g).toEqual(kopia);
    expect(s.b[0].t).toEqual(g.b[0].t);
    expect(s.r[0].h).toBe('residential');
    expect(s.a[0].k).toBe('park');
    expect(s.poi[0].k).toBe('poi:1000:2000');
    expect(s.poi[0].c).toBe('spozywczy');
    expect(s.rodzaje?.[0].k).toBe('muzeum');
    expect(s.src).toBe('test');
    // geo bez rodzajów i przejść zostaje bez nich
    const bez = mini();
    delete bez.rodzaje;
    delete bez.pass;
    const sb = przesunGeo(bez, 1, 1);
    expect('rodzaje' in sb).toBe(false);
    expect('pass' in sb).toBe(false);
  });

  it('środek geo przesuwa się geograficznie razem z punktami: klucz miejsca z nowego środka to ten sam piksel', () => {
    const g = mini();
    const [dx, dy] = [123.5, -87];
    const s = przesunGeo(g, dx, dy);
    expect(s.c[0]).not.toBe(g.c[0]);
    expect(s.c[1]).not.toBe(g.c[1]);
    // dy to metry na południe: szerokość maleje, dx na wschód: długość rośnie
    expect(s.c[0]).toBeGreaterThan(g.c[0]);
    expect(s.c[1]).toBeGreaterThan(g.c[1]);
    const p = g.poi[0];
    const q = s.poi[0];
    const zStarego = kluczZMetrow(g.c, p.x, p.y);
    const zNowego = kluczZMetrow(s.c, q.x, q.y);
    const [a, b] = zStarego.split(':').slice(1).map(Number);
    const [c, d] = zNowego.split(':').slice(1).map(Number);
    expect(Math.abs(a - c)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - d)).toBeLessThanOrEqual(1);
  });

  it('przesunięcie o wielokrotność 0,5 m zostawia współrzędne na siatce 0,5 m (zapis geo zostaje zwarty)', () => {
    const s = przesunGeo(mini(), 123.5, -87);
    const liczby = [...s.b[0].p.flat(), ...s.r[0].l.flat(), s.poi[0].x, s.poi[0].y];
    for (const v of liczby) expect(Number.isInteger(v * 2), String(v)).toBe(true);
  });

  it('przesunięcie o (0, 0) nie zmienia punktów, a dwa przesunięcia składają się w jedno', () => {
    const g = mini();
    expect(przesunGeo(g, 0, 0).b).toEqual(g.b);
    const dwa = przesunGeo(przesunGeo(g, 3, 4), 2, -1);
    const jedno = przesunGeo(g, 5, 3);
    expect(dwa.b).toEqual(jedno.b);
    expect(dwa.poi).toEqual(jedno.poi);
  });
});

describe('kierunek i nazwa osady', () => {
  it('osiem kwadratów wokół domu: osiem różnych kierunków po polsku i po angielsku', () => {
    const k = sasiedzi8(0, 0).map(([x, y]) => kierunekOsady(x, y));
    expect(k.map((x) => x.kierunek.pl)).toEqual([
      'na północ',
      'na północny wschód',
      'na wschód',
      'na południowy wschód',
      'na południe',
      'na południowy zachód',
      'na zachód',
      'na północny zachód',
    ]);
    expect(k.map((x) => x.kierunek.en)).toEqual([
      'to the north',
      'to the north-east',
      'to the east',
      'to the south-east',
      'to the south',
      'to the south-west',
      'to the west',
      'to the north-west',
    ]);
    expect(k.map((x) => x.miejscownik.pl)).toEqual([
      'na północy',
      'na północnym wschodzie',
      'na wschodzie',
      'na południowym wschodzie',
      'na południu',
      'na południowym zachodzie',
      'na zachodzie',
      'na północnym zachodzie',
    ]);
    // angielski bez polskich liter, polski w obu formach niepusty
    for (const x of k) {
      expect(x.kierunek.en).not.toMatch(/[ąćęłńóśźż]/i);
      expect(x.miejscownik.en).not.toMatch(/[ąćęłńóśźż]/i);
      expect(x.miejscownik.pl.length).toBeGreaterThan(0);
    }
  });

  it('dalsze kwadraty: kierunek z przewagi osi (dwa razy dalej w jednej osi niż w drugiej to strona świata)', () => {
    expect(kierunekOsady(0, -4).kierunek.pl).toBe('na północ');
    expect(kierunekOsady(3, 1).kierunek.pl).toBe('na wschód');
    expect(kierunekOsady(2, 2).kierunek.pl).toBe('na południowy wschód');
    expect(kierunekOsady(-5, 2).kierunek.pl).toBe('na zachód');
    expect(kierunekOsady(-2, -3).kierunek.pl).toBe('na północny zachód');
  });

  it('dom (0, 0) nie ma strony świata, ale ma tekst w obu językach', () => {
    const k = kierunekOsady(0, 0);
    expect(k.kierunek.pl.length).toBeGreaterThan(0);
    expect(k.kierunek.en.length).toBeGreaterThan(0);
  });

  it('nazwa osady idzie tylko z kierunku od domu: „Osada na północy” / “Settlement to the north”, z formą „z osady …”', () => {
    const polnoc = nazwaOsady(0, -1);
    expect(polnoc.nazwa).toEqual({ pl: 'Osada na północy', en: 'Settlement to the north' });
    expect(polnoc.nazwaZ).toEqual({ pl: 'z osady na północy', en: 'from the settlement to the north' });
    expect(nazwaOsady(1, 1).nazwa.pl).toBe('Osada na południowym wschodzie');
    expect(nazwaOsady(-1, 0).nazwa.pl).toBe('Osada na zachodzie');
    expect(nazwaOsady(-1, 1).nazwaZ.en).toBe('from the settlement to the south-west');
  });

  it('osiem sąsiadów ma osiem różnych nazw, a angielskie wersje nie mają polskich liter', () => {
    const nazwy = sasiedzi8(0, 0).map(([x, y]) => nazwaOsady(x, y));
    for (const kolumna of ['nazwa', 'nazwaZ'] as const) {
      expect(new Set(nazwy.map((n) => n[kolumna].pl)).size, `${kolumna} po polsku`).toBe(8);
      expect(new Set(nazwy.map((n) => n[kolumna].en)).size, `${kolumna} po angielsku`).toBe(8);
      for (const n of nazwy) {
        expect(n[kolumna].en).not.toMatch(/[ąćęłńóśźż]/i);
        expect(n[kolumna].pl).toMatch(/^(?:Osada|z osady) na /);
      }
    }
    // nazwa wynika z kierunku: ta sama strona świata, ten sam miejscownik
    for (const [x, y] of sasiedzi8(0, 0)) {
      const { miejscownik } = kierunekOsady(x, y);
      expect(nazwaOsady(x, y).nazwa).toEqual({
        pl: `Osada ${miejscownik.pl}`,
        en: `Settlement ${miejscownik.en}`,
      });
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Prawdziwe dane dem
// ------------------------------------------------------------------------------------------------------------------

interface DaneTestu {
  demo: DemoDanych;
  dane: DaneMieszkancow | null;
  uklad: Uklad;
  /** wynik dla każdego sąsiedniego kwadratu dema (klucz „sx,sy”) */
  wyniki: Map<string, Wynik>;
  /** wynik dla geo domu potraktowanego jak kandydat (0, 0) */
  dom: Wynik;
}
const dane = new Map<Demo, DaneTestu>();

beforeAll(async () => {
  for (const d of DEMA) {
    const demo = wczytajDemo(d);
    const tabele = await daneDema(d);
    const uklad = ukladZGeo(demo.geo);
    const wyniki = new Map<string, Wynik>();
    for (const [klucz, geo] of Object.entries(demo.kwadraty)) {
      const [sx, sy] = klucz.split(',').map(Number);
      wyniki.set(klucz, swiatOsady(geo, sx, sy, tabele, ZIARNO, uklad));
    }
    dane.set(d, { demo, dane: tabele, uklad, wyniki, dom: swiatOsady(demo.geo, 0, 0, tabele, ZIARNO, uklad) });
  }
}, 300_000);

const dla = (d: Demo): DaneTestu => dane.get(d)!;
const zakwaterowane = (d: Demo): SwiatOsady[] => [...dla(d).wyniki.values()].filter(jestSwiat);

describe('swiatOsady: reguła miejsca na dem', () => {
  it('Zielonki: dom potraktowany jak kandydat jest odrzucony z powodu jedzenia (17 porcji) albo mieszkańców', () => {
    const r = dla('zielonki').dom;
    expect(jestSwiat(r)).toBe(false);
    if (jestSwiat(r)) return;
    expect(['jedzenie', 'mieszkancy']).toContain(r.odrzucony);
  });

  it('Zielonki: żaden z ośmiu sąsiadów nie spełnia reguły, a każde odrzucenie ma w pomiarze to, co je tłumaczy', () => {
    expect(zakwaterowane('zielonki')).toEqual([]);
    const powody: string[] = [];
    for (const [klucz, w] of dla('zielonki').wyniki) {
      if (jestSwiat(w)) continue;
      powody.push(w.odrzucony);
      const p = w.pomiar;
      if (w.odrzucony === 'siedziba') {
        // brak budynku mieszkalnego w 120 m albo żaden ze sprawdzonych (najwyżej cztery) nie ma trzech pokoi; jedzenia nie liczono
        expect(p.proby, klucz).toBe(Math.min(p.kandydatow, PROBY_SIEDZIBY));
        expect(p.kandydatow === 0 || p.pokoje < MIN_POKOI_SIEDZIBY, klucz).toBe(true);
        expect(p.jedzenie, klucz).toBeNull();
      } else if (w.odrzucony === 'jedzenie') {
        // siedziba jest, jedzenia za mało, generator jeszcze nie liczony
        expect(p.pokoje, klucz).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
        expect(p.jedzenie ?? Number.POSITIVE_INFINITY, klucz).toBeLessThan(PROG_JEDZENIA_OSADY);
        expect(p.osoby, klucz).toBeNull();
      }
    }
    // siedem kwadratów bez siedziby (sześć bez 3 pokoi albo bez budynków, plus (1,0) z czterema próbami) i (−1,0) bez jedzenia
    expect(powody.sort()).toEqual(['jedzenie', ...Array(7).fill('siedziba')]);
  });

  it('Przymorze i Lanciego: dom spełnia regułę miejsca (855 i 1167 porcji, blok z mieszkańcami)', () => {
    for (const d of ['przymorze', 'lanciego'] as const) {
      const r = dla(d).dom;
      expect(jestSwiat(r), d).toBe(true);
      if (!jestSwiat(r)) continue;
      expect(r.jedzenie, d).toBeGreaterThanOrEqual(PROG_JEDZENIA_OSADY);
    }
  });

  it('Przymorze: co najmniej jeden sąsiedni kwadrat spełnia regułę', () => {
    expect(zakwaterowane('przymorze').length).toBeGreaterThan(0);
  });

  it('bez danych mieszkańców reguła nie jest spełniona w żadnym miejscu (powód: mieszkańcy)', () => {
    const p = dla('przymorze');
    const [klucz, geo] = Object.entries(p.demo.kwadraty)[0];
    const [sx, sy] = klucz.split(',').map(Number);
    const r = swiatOsady(geo, sx, sy, null, ZIARNO, p.uklad);
    expect(jestSwiat(r)).toBe(false);
    if (!jestSwiat(r)) expect(r.odrzucony).toBe('mieszkancy');
  });

  it('kwadrat bez budynku mieszkalnego w promieniu 120 m jest odrzucony z powodu siedziby', () => {
    const p = dla('przymorze');
    // pusty kwadrat: geo bez budynków, dróg i miejsc
    const pusty: Geo = { ...structuredClone(p.demo.geo), b: [], r: [], a: [], w: [], poi: [], rodzaje: [], pass: [] };
    const r = swiatOsady(pusty, 1, 0, p.dane, ZIARNO, p.uklad);
    expect(jestSwiat(r)).toBe(false);
    if (!jestSwiat(r)) expect(r.odrzucony).toBe('siedziba');
  });

  it('wynik zależy tylko od danych: ta sama odpowiedź przy powtórzeniu, geo wejściowe zostaje nietknięte', () => {
    const p = dla('przymorze');
    const wygrany = zakwaterowane('przymorze')[0];
    const geo = p.demo.kwadraty[wygrany.klucz];
    const kopia = structuredClone(geo);
    const drugi = swiatOsady(geo, wygrany.sx, wygrany.sy, p.dane, ZIARNO, p.uklad);
    expect(geo).toEqual(kopia);
    expect(jestSwiat(drugi)).toBe(true);
    if (!jestSwiat(drugi)) return;
    expect(drugi.geo).toEqual(wygrany.geo);
    expect(drugi.jedzenie).toBe(wygrany.jedzenie);
    expect(drugi.nazwa).toEqual(wygrany.nazwa);
    expect(drugi.pomiar).toEqual(wygrany.pomiar);
    expect(worldKey(drugi.world)).toBe(worldKey(wygrany.world));
  });
});

describe('swiatOsady: świat osady', () => {
  it('siedziba ma co najmniej 3 pokoje (i pokój w mieszkaniu zarządu), mieszkańców z generatora i jedzenie ponad próg', () => {
    for (const d of ['przymorze', 'lanciego'] as const) {
      for (const w of zakwaterowane(d)) {
        const h = houseOf(w.world)!;
        const pokoje = h.rooms.filter((r) => r.kind === 'pokoj');
        expect(pokoje.length, `${d} ${w.klucz}`).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
        expect(
          pokoje.some((r) => r.apt === h.home),
          `${d} ${w.klucz} pokój zarządu`,
        ).toBe(true);
        expect(w.pomiar.pokoje).toBe(pokoje.length);
        expect(w.world.hq).toBeGreaterThanOrEqual(0);
        expect(w.jedzenie).toBeGreaterThanOrEqual(PROG_JEDZENIA_OSADY);
        expect(w.pomiar.jedzenie).toBe(w.jedzenie);
        expect(w.opcje.mieszkancy, `${d} ${w.klucz}`).toBeDefined();
        expect(w.pomiar.osoby).toBeGreaterThan(0);
        expect(w.klucz).toBe(kluczKwadratu(w.sx, w.sy));
      }
    }
  });

  it('opcje gry osady: czterech w zarządzie, obcy, okolica, ludność 2021, tempo przeglądarki, bez łańcuchów, odpowiedź na nieznane okna', () => {
    const w = zakwaterowane('przymorze')[0];
    expect(w.opcje.core).toBe(4);
    expect(w.opcje.obcy).toBe(true);
    expect(w.opcje.tempoPrzegladarki).toBe(true);
    // przegląd zadania 1: przeglądarka ma odpowiadać na każde okno (nie zawieszać) i grać bez łańcuchów kart
    expect(w.opcje.odpowiedzNaNieznane).toBe(true);
    expect(w.opcje.lancuchy).toBe(false);
    expect(w.opcje.okolica!.length).toBeGreaterThan(0);
    expect(w.opcje.ludnosc2021).toBeGreaterThan(0);
    expect(w.opcje.dziennik).toBeUndefined();
    // okolica to miejsca z geo osady, liczone od jej środka (siedziby)
    expect(w.opcje.okolica!.some((m) => m.odl > 0 && m.odl < 720)).toBe(true);
    expect(jedzenieWZasiegu(w.opcje.okolica!)).toBe(w.jedzenie);
  });

  it('nazwa, forma „z osady” i kierunek mają obie wersje językowe; kierunek zgadza się z kwadratem', () => {
    for (const d of ['przymorze', 'lanciego'] as const) {
      for (const w of zakwaterowane(d)) {
        for (const t of [w.nazwa, w.nazwaZ, w.kierunek]) {
          expect(typeof t.pl).toBe('string');
          expect(typeof t.en).toBe('string');
          expect(t.pl.length).toBeGreaterThan(0);
          expect(t.en.length).toBeGreaterThan(0);
        }
        expect(w.nazwa.pl).not.toBe(w.nazwa.en);
        expect(w.kierunek).toEqual(kierunekOsady(w.sx, w.sy).kierunek);
        // nazwa idzie z kierunku od domu do kwadratu
        expect(w.nazwa).toEqual(nazwaOsady(w.sx, w.sy).nazwa);
        expect(w.nazwaZ).toEqual(nazwaOsady(w.sx, w.sy).nazwaZ);
      }
    }
  });

  it('na świecie osady działa createSim: gra idzie dwie godziny z silnikiem bez błędów i z osobami z generatora', () => {
    const w = zakwaterowane('przymorze')[0];
    const g = nowaGraAi(w.world, ziarnoOsady(ZIARNO, w.sx, w.sy), w.opcje);
    grajDo(g, silnik, 2 * TICKS_PER_HOUR);
    expect(g.bledy).toEqual([]);
    expect(g.sim.st.tick).toBe(2 * TICKS_PER_HOUR);
    expect(zGeneratora(g.sim.st)).toBe(true);
    expect(g.sim.st.pawns.filter((p) => p.kind === 'core')).toHaveLength(4);
    expect(g.gov.lancuchy).toBeUndefined();
  });

  it('zapisane geo odtwarza ten sam świat (zapis gry osady trzyma geo, nie świat)', () => {
    for (const d of ['przymorze', 'lanciego'] as const) {
      for (const w of zakwaterowane(d)) {
        const seed = ziarnoOsady(ZIARNO, w.sx, w.sy);
        const znowu = swiatZGeo(w.geo, seed, dla(d).dane);
        expect(znowu.world.hq, w.klucz).toBe(w.world.hq);
        expect(worldKey(znowu.world), w.klucz).toBe(worldKey(w.world));
        expect(hashString(Array.from(znowu.world.blocked).join('')), w.klucz).toBe(
          hashString(Array.from(w.world.blocked).join('')),
        );
        expect(znowu.world.buildings.map((b) => b.tags['zm:bud'])).toEqual(
          w.world.buildings.map((b) => b.tags['zm:bud']),
        );
        // zapisane geo to geo bez tagów generatora (tagi dokłada świat przy budowie)
        expect(w.geo.b.some((b) => 'zm:bud' in b.t)).toBe(false);
        expect(znowu.geo.b.some((b) => 'zm:bud' in b.t)).toBe(true);
        // siedziba w środku świata
        const hq = w.world.buildings[w.world.hq];
        const c = w.world.size / 2;
        expect(hq.x0 - 5).toBeLessThanOrEqual(c);
        expect(hq.x1 + 5).toBeGreaterThanOrEqual(c);
        expect(hq.y0 - 5).toBeLessThanOrEqual(c);
        expect(hq.y1 + 5).toBeGreaterThanOrEqual(c);
      }
    }
  });

  it('geo osady to geo kwadratu przesunięte o punkt siedziby (najwyżej 120 m od środka kwadratu), z tymi samymi kluczami miejsc', () => {
    const w = zakwaterowane('przymorze')[0];
    const p = dla('przymorze');
    const geoKw = p.demo.kwadraty[w.klucz];
    // miejsca mają klucze bezwzględne („poi:X:Y”), więc po przesunięciu zostają te same
    const klucze = (g: Geo): string[] => g.poi.map((x) => x.k ?? '').sort();
    expect(klucze(w.geo)).toEqual(klucze(geoKw));
    // przesunięcie wychodzi z różnicy położeń tego samego miejsca przed i po
    const przed = geoKw.poi[0];
    const po = w.geo.poi.find((x) => x.k === przed.k)!;
    const [dx, dy] = [przed.x - po.x, przed.y - po.y];
    expect(Number.isInteger(dx * 2) && Number.isInteger(dy * 2)).toBe(true);
    const [cx, cy] = srodekKwadratu(p.uklad, w.sx, w.sy);
    expect(Math.sqrt((dx - cx) * (dx - cx) + (dy - cy) * (dy - cy))).toBeLessThanOrEqual(PROMIEN_SIEDZIBY_M);
    // i to samo przesunięcie przechodzi na budynki: pierwszy obrys przesunięty o (dx, dy)
    expect(w.geo.b[0].p[0][0]).toBeCloseTo(geoKw.b[0].p[0][0] - dx, 9);
    expect(w.geo.b[0].p[0][1]).toBeCloseTo(geoKw.b[0].p[0][1] - dy, 9);
  });

  it('zwycięska siedziba kończy próby: pierwsza próba na wszystkich kwadratach dem poza Przymorzem (1,0), gdzie wygrywa druga', () => {
    for (const d of ['przymorze', 'lanciego'] as const) {
      for (const w of zakwaterowane(d)) {
        const oczekiwane = d === 'przymorze' && w.klucz === '1,0' ? 2 : 1;
        expect(w.pomiar.proby, `${d} ${w.klucz}`).toBe(oczekiwane);
      }
    }
  });

  it('świat osady ma suche drzewo: Przymorze (1,0) przy pierwszej próbie jest bez podwórka (8 kafelków) i bez drzewa, więc wygrywa druga', () => {
    const w = zakwaterowane('przymorze').find((x) => x.klucz === '1,0')!;
    expect(w.pomiar.proby).toBe(2);
    expect(w.world.dryTree).toBeGreaterThanOrEqual(0);
    for (const d of ['przymorze', 'lanciego'] as const)
      for (const x of zakwaterowane(d)) expect(x.world.dryTree, `${d} ${x.klucz}`).toBeGreaterThanOrEqual(0);
    // pierwszy kandydat tego kwadratu sam, bez następnych: świat bez suchego drzewa nie wystarcza
    const p = dla('przymorze');
    const geo = p.demo.kwadraty['1,0'];
    const srodek = srodekKwadratu(p.uklad, 1, 0);
    const [pierwszy] = kandydaciSiedziby(geo, srodek, p.dane!);
    const swiat = swiatZGeo(przesunGeo(geo, pierwszy.punkt[0], pierwszy.punkt[1]), ziarnoOsady(ZIARNO, 1, 0), p.dane);
    expect(swiat.world.dryTree).toBe(-1);
    expect(siedzibaWystarcza(opiszSiedzibe(swiat.world))).toBe(false);
  });

  it('tag addr:street (dane z Overpass) nie wchodzi do nazwy osady: nazwy ulic z OSM nie trafiają do tekstów z generatora', () => {
    const p = dla('przymorze');
    const wygrany = zakwaterowane('przymorze')[0];
    const geo = structuredClone(p.demo.kwadraty[wygrany.klucz]);
    for (const b of geo.b) b.t['addr:street'] = 'Spacerowa';
    const r = swiatOsady(geo, wygrany.sx, wygrany.sy, p.dane, ZIARNO, p.uklad);
    expect(jestSwiat(r)).toBe(true);
    if (!jestSwiat(r)) return;
    // hq ma tag ulicy w świecie, a nazwa osady i tak jest tylko z kierunku
    expect(r.world.buildings[r.world.hq].tags['addr:street']).toBe('Spacerowa');
    expect(r.nazwa).toEqual(wygrany.nazwa);
    expect(r.nazwaZ).toEqual(wygrany.nazwaZ);
    expect(r.kierunek).toEqual(wygrany.kierunek);
    expect(JSON.stringify([r.nazwa, r.nazwaZ, r.kierunek])).not.toContain('Spacerowa');
    // ten sam świat co bez tagu ulicy (nazwa nie wpływa na budowę)
    expect(r.jedzenie).toBe(wygrany.jedzenie);
    expect(r.world.hq).toBe(wygrany.world.hq);
  });
});

describe('swiatOsady: powody odrzucenia', () => {
  /** geo kwadratu z `n` dołożonymi sklepami spożywczymi 450 m na wschód od środka kwadratu (unikalne klucze, zapas z klucza) */
  function zeSklepami(geo: Geo, srodek: Pt, n: number): Geo {
    const g = structuredClone(geo);
    for (let k = 0; k < n; k++)
      g.poi.push({ x: srodek[0] + 450, y: srodek[1], c: 'spozywczy', n: '', k: `poi:${9_000_000 + k}:5` });
    return g;
  }
  /** kategorie miejsc, z których da się wynieść jedzenie */
  const zJedzeniem = new Set(
    Object.entries(POICAT)
      .filter(([, d]) => d.loot.jedzenie)
      .map(([k]) => k),
  );

  it('Przymorze bez jedzenia w okolicy: jedzenie, a generator mieszkańców nie jest jeszcze liczony', () => {
    const p = dla('przymorze');
    const geo = structuredClone(p.demo.kwadraty['0,-1']);
    // te same miejsca (klasy budynków zostają), tylko bez jedzenia w łupie
    for (const x of geo.poi) if (zJedzeniem.has(x.c)) x.c = 'ubrania';
    const r = swiatOsady(geo, 0, -1, p.dane, ZIARNO, p.uklad);
    expect(jestSwiat(r)).toBe(false);
    if (jestSwiat(r)) return;
    expect(r.odrzucony).toBe('jedzenie');
    expect(r.pomiar.jedzenie).toBe(0);
    expect(r.pomiar.pokoje).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
    // jedzenie sprawdza się przed generatorem (tańsze), więc mieszkańców jeszcze nie liczono
    expect(r.pomiar.osoby).toBeNull();
    expect(r.pomiar.lokatorzy).toBeNull();
  });

  it('dom z jednym mieszkaniem (Zielonki) ma jedzenie, ale nie ma lokatorów: odrzucony z powodu mieszkańców', () => {
    const p = dla('zielonki');
    const geo = zeSklepami(p.demo.kwadraty['-1,0'], srodekKwadratu(p.uklad, -1, 0), 120);
    const r = swiatOsady(geo, -1, 0, p.dane, ZIARNO, p.uklad);
    expect(jestSwiat(r)).toBe(false);
    if (jestSwiat(r)) return;
    expect(r.odrzucony).toBe('mieszkancy');
    expect(r.pomiar.jedzenie).toBeGreaterThanOrEqual(PROG_JEDZENIA_OSADY);
    expect(r.pomiar.pokoje).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
    // zarząd z generatora jest (rodzina z domu), lokatorów poza zarządem nie ma
    expect(r.pomiar.osoby).toBeGreaterThan(0);
    expect(r.pomiar.lokatorzy).toBe(0);
  });

  it('bez siedziby (kwadrat bez budynków mieszkalnych blisko środka): siedziba, bez żadnej próby i bez liczenia jedzenia', () => {
    const p = dla('zielonki');
    const r = swiatOsady(p.demo.kwadraty['0,-1'], 0, -1, p.dane, ZIARNO, p.uklad);
    expect('odrzucony' in r && r.odrzucony).toBe('siedziba');
    expect(r.pomiar).toMatchObject({ kandydatow: 0, proby: 0, pole: 0, pokoje: 0, jedzenie: null });
  });

  it('najwyżej cztery próby: siedem domów o dwóch pokojach to cztery światy i powód „siedziba”', () => {
    const p = dla('zielonki');
    const r = swiatOsady(p.demo.kwadraty['1,0'], 1, 0, p.dane, ZIARNO, p.uklad);
    expect('odrzucony' in r && r.odrzucony).toBe('siedziba');
    expect(r.pomiar.kandydatow).toBeGreaterThan(PROBY_SIEDZIBY);
    expect(r.pomiar.proby).toBe(PROBY_SIEDZIBY);
    expect(r.pomiar.pokoje).toBeLessThan(MIN_POKOI_SIEDZIBY);
    expect(r.pomiar.jedzenie).toBeNull();
  });

  it('błąd generatora albo budowy świata nie jest połykany: uszkodzone geo rzuca ze swiatOsady i z wybierzOsade', () => {
    // zadanie 3 łapie wyjątek i zapisuje „brak: blad”; cicha odpowiedź „siedziba” ukryłaby błąd generatora
    const p = dla('przymorze');
    const uszkodzone = structuredClone(p.demo.kwadraty['0,-1']);
    uszkodzone.b[0].p = undefined as unknown as Geo['b'][number]['p'];
    expect(() => swiatOsady(uszkodzone, 0, -1, p.dane, ZIARNO, p.uklad)).toThrow();
    expect(() => wybierzOsade(ZIARNO, { '0,-1': uszkodzone }, p.dane, p.uklad)).toThrow();
    // tak samo bez tabel mieszkańców nie ma czego liczyć i nie rzuca (reguła ich wymaga)
    expect(jestSwiat(swiatOsady(uszkodzone, 0, -1, null, ZIARNO, p.uklad))).toBe(false);
    // dobre geo tego samego kwadratu przechodzi (to uszkodzenie, a nie kwadrat, rzuca)
    expect(jestSwiat(swiatOsady(p.demo.kwadraty['0,-1'], 0, -1, p.dane, ZIARNO, p.uklad))).toBe(true);
  });

  it('siedziba wystarcza: budynek mieszkalny, co najmniej 3 pokoje, pokój zarządu i suche drzewo (każdy warunek osobno)', () => {
    const w = zakwaterowane('przymorze')[0].world;
    const s = opiszSiedzibe(w);
    expect(s.mieszkalna).toBe(true);
    expect(s.pokoje).toBeGreaterThanOrEqual(MIN_POKOI_SIEDZIBY);
    expect(s.pokojeZarzadu).toBeGreaterThanOrEqual(1);
    expect(s.pole).toBe(w.buildings[w.hq].area);
    expect(siedzibaWystarcza(s)).toBe(true);
    expect(siedzibaWystarcza({ ...s, mieszkalna: false })).toBe(false);
    expect(siedzibaWystarcza({ ...s, pokoje: MIN_POKOI_SIEDZIBY - 1 })).toBe(false);
    expect(siedzibaWystarcza({ ...s, pokoje: MIN_POKOI_SIEDZIBY })).toBe(true);
    expect(siedzibaWystarcza({ ...s, pokojeZarzadu: 0 })).toBe(false);
    expect(siedzibaWystarcza({ ...s, sucheDrzewo: false })).toBe(false);
    expect(s.sucheDrzewo).toBe(true);
    // suche drzewo liczy się tak jak w silniku (`dryTreeOf`): numer w granicach drzew świata, a nie samo „nieujemny”
    expect(opiszSiedzibe({ ...w, dryTree: -1 }).sucheDrzewo).toBe(false);
    expect(opiszSiedzibe({ ...w, dryTree: w.trees.length }).sucheDrzewo).toBe(false);
    expect(opiszSiedzibe({ ...w, dryTree: w.trees.length - 1 }).sucheDrzewo).toBe(true);
    // świat bez wnętrza: same zera
    expect(opiszSiedzibe({ ...w, interior: undefined } as unknown as typeof w)).toEqual({
      pole: 0,
      pokoje: 0,
      pokojeZarzadu: 0,
      mieszkalna: false,
      sucheDrzewo: false,
    });
  });

  it('tabela reguły na dwudziestu kwadratach dem (ziarno 11): kto spełnia, kto nie i dlaczego', () => {
    const oczekiwane: Record<Demo, Record<string, string>> = {
      przymorze: {
        '0,-1': 'tak',
        '1,-1': 'nie: siedziba',
        '1,0': 'tak',
        '1,1': 'tak',
        '0,1': 'tak',
        '-1,1': 'tak',
        '-1,0': 'tak',
        '-1,-1': 'tak',
      },
      lanciego: { '0,-1': 'tak', '1,0': 'tak', '0,1': 'tak', '-1,0': 'tak' },
      zielonki: {
        '0,-1': 'nie: siedziba',
        '1,-1': 'nie: siedziba',
        '1,0': 'nie: siedziba',
        '1,1': 'nie: siedziba',
        '0,1': 'nie: siedziba',
        '-1,1': 'nie: siedziba',
        '-1,0': 'nie: jedzenie',
        '-1,-1': 'nie: siedziba',
      },
    };
    const slowem = (w: Wynik): string => ('odrzucony' in w ? `nie: ${w.odrzucony}` : 'tak');
    let razem = 0;
    for (const d of DEMA) {
      const wynik = Object.fromEntries([...dla(d).wyniki].map(([k, w]) => [k, slowem(w)]));
      expect(wynik, d).toEqual(oczekiwane[d]);
      razem += Object.keys(wynik).length;
    }
    expect(razem).toBe(20);
    // dom: Przymorze i Lanciego spełniają, Zielonki są poza regułą (17 porcji w zasięgu)
    expect(slowem(dla('przymorze').dom)).toBe('tak');
    expect(slowem(dla('lanciego').dom)).toBe('tak');
    expect(slowem(dla('zielonki').dom)).toBe('nie: jedzenie');
  });

  it('próg 300 porcji leży w pustej przerwie między kwadratami: bez siedzib z lokatorami najwyżej 97, ze spełniającymi co najmniej 419', () => {
    const jedzenie: number[] = [];
    const wZielonkach: number[] = [];
    for (const d of DEMA) {
      for (const w of dla(d).wyniki.values()) {
        if (jestSwiat(w)) jedzenie.push(w.jedzenie);
        else if (d === 'zielonki' && w.pomiar.jedzenie !== null) wZielonkach.push(w.pomiar.jedzenie);
      }
    }
    expect(jedzenie.length).toBeGreaterThan(0);
    expect(Math.min(...jedzenie)).toBeGreaterThanOrEqual(400);
    expect(Math.max(...wZielonkach)).toBeLessThanOrEqual(100);
    expect(PROG_JEDZENIA_OSADY - Math.max(...wZielonkach)).toBeGreaterThan(150);
    expect(Math.min(...jedzenie) - PROG_JEDZENIA_OSADY).toBeGreaterThan(100);
  });
});

describe('kandydaciSiedziby', () => {
  it('budynki mieszkalne w promieniu 120 m od środka kwadratu, malejąco po polu, z punktem wewnątrz obrysu', () => {
    const p = dla('przymorze');
    for (const [klucz, geo] of Object.entries(p.demo.kwadraty)) {
      const [sx, sy] = klucz.split(',').map(Number);
      const srodek = srodekKwadratu(p.uklad, sx, sy);
      const k = kandydaciSiedziby(geo, srodek, p.dane!);
      for (let i = 1; i < k.length; i++) expect(k[i].pole, klucz).toBeLessThanOrEqual(k[i - 1].pole);
      for (const x of k) {
        expect(x.odl, klucz).toBeLessThanOrEqual(PROMIEN_SIEDZIBY_M);
        expect(x.pole, klucz).toBeGreaterThan(0);
        expect(geo.b[x.indeks], klucz).toBeDefined();
        // punkt na siatce 0,5 m i wewnątrz obrysu (któregoś z pierścieni budynku)
        expect(Number.isInteger(x.punkt[0] * 2) && Number.isInteger(x.punkt[1] * 2), klucz).toBe(true);
        expect(wObrysie(x.punkt[0], x.punkt[1], pierscienieBudynku(geo.b[x.indeks])), klucz).toBe(true);
      }
    }
    // kwadrat (1, −1) Przymorza leży na morzu: bez budynków mieszkalnych blisko środka
    const morze = p.demo.kwadraty['1,-1'];
    expect(kandydaciSiedziby(morze, srodekKwadratu(p.uklad, 1, -1), p.dane!)).toEqual([]);
  });
});

describe('wybierzOsade', () => {
  it('bez danych mieszkańców zwraca null (reguła wymaga mieszkańców), nawet gdy kwadraty są', () => {
    const p = dla('przymorze');
    expect(wybierzOsade(ZIARNO, p.demo.kwadraty, null, p.uklad)).toBeNull();
  });

  it('bez żadnego kwadratu zwraca null', () => {
    const p = dla('przymorze');
    expect(wybierzOsade(ZIARNO, {}, p.dane, p.uklad)).toBeNull();
  });

  it('Zielonki: żaden kandydat nie spełnia reguły, więc gra idzie bez osady', () => {
    const p = dla('zielonki');
    for (const seed of [11, 12, 13]) expect(wybierzOsade(seed, p.demo.kwadraty, p.dane, p.uklad)).toBeNull();
  });

  it('Przymorze, ziarna 11–15: pierwszy kandydat w kolejności z ziarna, który spełnia regułę', () => {
    const p = dla('przymorze');
    for (const seed of [11, 12, 13, 14, 15]) {
      const wybrany = wybierzOsade(seed, p.demo.kwadraty, p.dane, p.uklad);
      // to samo szuka się ręcznie po kolei
      let oczekiwany: string | null = null;
      for (const [sx, sy] of kandydaciOsady(seed)) {
        const geo = p.demo.kwadraty[kluczKwadratu(sx, sy)];
        if (!geo) continue;
        if (jestSwiat(swiatOsady(geo, sx, sy, p.dane, seed, p.uklad))) {
          oczekiwany = kluczKwadratu(sx, sy);
          break;
        }
      }
      expect(wybrany?.klucz ?? null, `ziarno ${seed}`).toBe(oczekiwany);
      expect(oczekiwany, `ziarno ${seed}`).not.toBeNull();
    }
  }, 120_000);

  it('złote wybory na dem: literalne klucze dla ziaren, także gdy pierwszy kandydat to morze albo kwadrat bez geo', () => {
    // kolejność z ziarna daje pierwszego kandydata, a wybór bierze pierwszego, który ma geo i spełnia regułę; wartości
    // przypięte literalnie (nie przeliczane tą samą pętlą), więc zmiana tasowania albo reguły musi tu być widoczna
    const wybory = (d: Demo, ziarna: number[]): (string | null)[] =>
      ziarna.map((z) => wybierzOsade(z, dla(d).demo.kwadraty, dla(d).dane, dla(d).uklad)?.klucz ?? null);
    // Przymorze: pierwszy kandydat zawsze spełnia (ziarna 11–15)
    expect(wybory('przymorze', [11, 12, 13, 14, 15])).toEqual(['0,-1', '1,0', '0,1', '-1,0', '1,0']);
    // Przymorze: pierwszy kandydat to morze (1,−1), więc wygrywa drugi w kolejności
    expect(kandydaciOsady(10)[0]).toEqual([1, -1]);
    expect(wybory('przymorze', [10, 16, 17, 21])).toEqual(['0,-1', '-1,1', '-1,-1', '0,-1']);
    // Lanciego: te same ziarna 11–15 dają te same kwadraty (wszystkie cztery boczne spełniają regułę)
    expect(wybory('lanciego', [11, 12, 13, 14, 15])).toEqual(['0,-1', '1,0', '0,1', '-1,0', '1,0']);
    // Lanciego ma tylko cztery boczne: pierwszy kandydat bez geo (przekątna) jest pomijany
    expect(kandydaciOsady(1)[0]).toEqual([1, 1]);
    expect(wybory('lanciego', [1, 2, 8])).toEqual(['0,-1', '1,0', '0,1']);
    // Zielonki: żaden kwadrat nie spełnia reguły
    expect(wybory('zielonki', [11, 12, 13, 14, 15])).toEqual([null, null, null, null, null]);
  }, 120_000);

  it('brak geo jednego kandydata (jak na Lanciego, gdzie są tylko cztery boczne) pomija go, a nie przerywa wyboru', () => {
    const p = dla('przymorze');
    const wygrany = wybierzOsade(ZIARNO, p.demo.kwadraty, p.dane, p.uklad)!;
    expect(wygrany).not.toBeNull();
    const bez = { ...p.demo.kwadraty };
    delete bez[wygrany.klucz];
    const drugi = wybierzOsade(ZIARNO, bez, p.dane, p.uklad);
    // na Przymorzu spełnia siedem z ośmiu kwadratów, więc po zabraniu pierwszego jest następny w kolejności z ziarna
    expect(drugi).not.toBeNull();
    expect(drugi!.klucz).not.toBe(wygrany.klucz);
    const kolejnosc = kandydaciOsady(ZIARNO).map(([x, y]) => kluczKwadratu(x, y));
    expect(kolejnosc.indexOf(wygrany.klucz)).toBe(0);
    expect(drugi!.klucz).toBe(kolejnosc[1]);
  }, 120_000);

  it('wynik jest deterministyczny: ten sam kwadrat, to samo geo, ta sama nazwa i jedzenie', () => {
    const p = dla('lanciego');
    const a = wybierzOsade(ZIARNO, p.demo.kwadraty, p.dane, p.uklad);
    const b = wybierzOsade(ZIARNO, p.demo.kwadraty, p.dane, p.uklad);
    expect(b?.klucz).toBe(a?.klucz);
    expect(b?.geo).toEqual(a?.geo);
    expect(b?.jedzenie).toBe(a?.jedzenie);
  }, 120_000);
});
