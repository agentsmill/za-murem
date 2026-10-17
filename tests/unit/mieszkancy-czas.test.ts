/* Dwadzieścia pięć lat (src/mieszkancy/czas.ts) i dźwignie upadku (src/mieszkancy/dzwignie.ts): postarzanie budynków
   obsadzonych na spis 2021 do 2026 bez upadku i do 2051 z upadkiem. Chodzi zawsze, na tabelach z public/data/mieszkancy/
   i demach z public/demo/, bez surowych plików. Wiek w roku `rok` to `rok - rocznik` (wiek osiągnięty w tym roku). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { type Obszar, obszarGminy, postarz } from '../../src/mieszkancy/czas.ts';
import { DZWIGNIE, PRZEJSCIA } from '../../src/mieszkancy/dzwignie.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { obsadzBudynek, obsadzRejon } from '../../src/mieszkancy/spis.ts';
import type { TabeleGminy, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import type { Osoba, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import type { Geo } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

const DEMA: [string, TabeleGminy][] = [
  ['przymorze', gdansk],
  ['lanciego', ursynow],
  ['zielonki', zielonki],
];

const spisDema = (nazwa: string, g: TabeleGminy): WynikBudynku[] =>
  budynkiZGeo(demo(nazwa), g, kraj).map((b) => obsadzBudynek(b, marginesyDla(g, b.rejon), g, kraj));
const postarzWszystkie = (spis: WynikBudynku[], doRoku: 2026 | 2051, o: Obszar, upadek: boolean): WynikBudynku[] =>
  spis.map((w) => postarz(w, doRoku, kraj, o, upadek));

const spisy = new Map(DEMA.map(([nazwa, g]) => [nazwa, spisDema(nazwa, g)]));
const z2051 = new Map(
  DEMA.map(([nazwa, g]) => [nazwa, postarzWszystkie(spisy.get(nazwa)!, 2051, obszarGminy(g), true)]),
);
const bez2051 = new Map(
  DEMA.map(([nazwa, g]) => [nazwa, postarzWszystkie(spisy.get(nazwa)!, 2051, obszarGminy(g), false)]),
);

/** Udział pustych mieszkań w blokach: suma `puste` przez sumę mieszkań. `NaN`, gdy bloków nie ma. */
const pusteWBlokach = (wyniki: WynikBudynku[]): number => {
  let puste = 0;
  let mieszkania = 0;
  for (const w of wyniki) {
    if (w.budynek.typ !== 'blok') continue;
    puste += w.puste;
    mieszkania += w.budynek.mieszkania!;
  }
  return puste / mieszkania;
};

/** Niezmienniki wyniku: identyfikatory, gospodarstwa, mieszkania, dziennik. Błędy zbiera w liście (jedno `expect`
    na budynek, bo osób są dziesiątki tysięcy). Zwraca liczbę sprawdzonych osób. */
function sprawdzWynik(w: WynikBudynku, doRoku: number): number {
  const bledy: string[] = [];
  const sprawdz = (warunek: boolean, opis: string): void => {
    if (!warunek) bledy.push(opis);
  };
  const wg = new Map<string, Osoba>();
  for (const o of w.osoby) {
    sprawdz(!wg.has(o.id), `podwójne id ${o.id}`);
    sprawdz(o.id.startsWith(`${w.budynek.klucz}/o`), `obce id ${o.id}`);
    wg.set(o.id, o);
  }
  // każdy mieszkaniec w dokładnie jednym gospodarstwie, w gospodarstwach tylko mieszkańcy
  const gdzie = new Map<string, string>();
  const idGosp = new Set<string>();
  for (const g of w.gospodarstwa) {
    sprawdz(!idGosp.has(g.id), `podwójne gospodarstwo ${g.id}`);
    idGosp.add(g.id);
    sprawdz(g.czlonkowie.length > 0, `puste gospodarstwo ${g.id}`);
    sprawdz(g.klatka >= 1 && g.klatka <= Math.max(1, w.budynek.klatki), `klatka ${g.klatka} w ${g.id}`);
    for (const id of g.czlonkowie) {
      sprawdz(wg.get(id)?.stan === 'tu', `${id} w ${g.id} nie mieszka tu`);
      sprawdz(!gdzie.has(id), `${id} w dwóch gospodarstwach`);
      gdzie.set(id, g.id);
    }
  }
  for (const o of w.osoby) {
    if (o.stan === 'tu') sprawdz(gdzie.has(o.id), `${o.id} bez gospodarstwa`);
    if (o.stan === 'wyjechal') sprawdz(!!o.dokad, `${o.id} wyjechał bez dokad`);
    else sprawdz(o.dokad === undefined, `${o.id} ma dokad, choć nie wyjechał`);
  }
  // mieszkania: gospodarstw nie więcej niż mieszkań, puste to reszta
  const m = w.budynek.mieszkania!;
  sprawdz(w.gospodarstwa.length <= m, `${w.gospodarstwa.length} gospodarstw na ${m} mieszkań`);
  sprawdz(w.puste === m - w.gospodarstwa.length, `puste ${w.puste}`);
  // dziennik po kolei, wpisy wskazują osoby (albo gospodarstwo przy `opuszczone`), z miejscem przy wyjazdach
  for (let i = 1; i < w.dziennik.length; i++) sprawdz(w.dziennik[i].rok >= w.dziennik[i - 1].rok, `wpis ${i} wstecz`);
  for (const d of w.dziennik) {
    sprawdz(d.rok <= doRoku - 1, `wpis z ${d.rok}`);
    if (d.typ === 'opuszczone') sprawdz(d.kto.startsWith(`${w.budynek.klucz}/g`), `opuszczone ${d.kto}`);
    else sprawdz(wg.has(d.kto), `${d.typ} ${d.kto} bez osoby`);
    if (d.z !== undefined) sprawdz(wg.has(d.z), `${d.typ} z ${d.z} bez osoby`);
    if (d.typ === 'wyprowadzka' || d.typ === 'emigracja') sprawdz(!!d.dokad, `${d.typ} ${d.kto} bez dokad`);
  }
  // każdy zmarły ma wpis zgonu, a urodzony w symulacji wpis urodzenia z rocznikiem 2021+
  const zgony = new Set(w.dziennik.filter((d) => d.typ === 'zgon').map((d) => d.kto));
  const urodzenia = new Set(w.dziennik.filter((d) => d.typ === 'urodzenie').map((d) => d.kto));
  for (const o of w.osoby) {
    sprawdz((o.stan === 'zmarl') === zgony.has(o.id), `${o.id}: stan ${o.stan} a wpis zgonu`);
    if (urodzenia.has(o.id)) sprawdz(o.rocznik >= 2021, `${o.id} urodzony w ${o.rocznik}`);
  }
  expect(bledy.slice(0, 10), w.budynek.klucz).toEqual([]);
  return w.osoby.length;
}

/** Wiek matki przy urodzeniu: każde dziecko z wpisem `urodzenie` (musi mieć matkę z tego budynku, tę z wpisu) i każda
    osoba z rocznika 2021+, która ma matkę (dzieci przyjezdnych). Dorośli z zewnątrz z rocznika 2021+ (przyjezdni
    i partnerzy w latach 40.) urodzili się poza budynkiem i matki tu nie mają. */
function wiekMatek(wyniki: WynikBudynku[]): number[] {
  const wiek: number[] = [];
  for (const w of wyniki) {
    const wg = new Map(w.osoby.map((o) => [o.id, o]));
    const urodzeni = new Map(w.dziennik.filter((d) => d.typ === 'urodzenie').map((d) => [d.kto, d.z]));
    for (const o of w.osoby) {
      if (urodzeni.has(o.id)) {
        expect(o.matka, `${o.id} bez matki`).toBeDefined();
        expect(urodzeni.get(o.id), o.id).toBe(o.matka);
        expect(o.rocznik).toBeGreaterThanOrEqual(2021);
      }
      if (o.rocznik < 2021 || o.matka === undefined) continue;
      wiek.push(o.rocznik - wg.get(o.matka)!.rocznik);
    }
  }
  return wiek;
}

// ---------------------------------------------------------------- obszar i dźwignie

describe('obszarGminy i DZWIGNIE', () => {
  it('Gdańsk i Ursynów to miasta 100 tys.+, Zielonki wieś, bez gminy miasto', () => {
    expect(obszarGminy(gdansk)).toBe('miasto100k');
    expect(obszarGminy(ursynow)).toBe('miasto100k');
    expect(obszarGminy(zielonki)).toBe('wies');
    expect(obszarGminy(null)).toBe('miasto');
    expect(obszarGminy({ ...gdansk, teryt: '2205011', gmina: zielonki.gmina })).toBe('miasto');
  });

  it('wartości startowe dźwigni z planu', () => {
    expect(DZWIGNIE.falaPowrotow).toMatchObject({ od: 2029, do: 2036, mnoznik: 30000 });
    expect(DZWIGNIE.emigracjaPo2035).toMatchObject({ od: 2035, mnoznik: 0 });
    expect(DZWIGNIE.urodzeniaSpadek).toMatchObject({ od: 2030, do: 2035, mnoznik: 6000 });
    expect(DZWIGNIE.umieralnosc75).toMatchObject({ od: 2035, do: 2045, odWieku: 75, mnoznik: 13000 });
    expect(DZWIGNIE.powrotOpieka).toMatchObject({ bezUpadku: 3000, upadek: 6000 });
    // wyludnienie po 2031: wyjazdy całych gospodarstw z bloków i niskie zasiedlenie bloków
    expect(DZWIGNIE.wyludnienie.od).toBe(2031);
    expect(DZWIGNIE.zasiedlenie.od).toBe(2031);
    expect(DZWIGNIE.wyludnienie.blok).toBeGreaterThan(0);
    expect(DZWIGNIE.zasiedlenie.blok).toBeLessThan(DZWIGNIE.zasiedlenie.bezUpadku);
    expect(PRZEJSCIA.maxWiek).toBe(110);
  });

  it('dźwignie i przejścia to same liczby całkowite', () => {
    const liczby: number[] = [];
    const zbierz = (v: unknown): void => {
      if (typeof v === 'number') liczby.push(v);
      else if (Array.isArray(v)) v.forEach(zbierz);
      else if (typeof v === 'object' && v !== null) Object.values(v).forEach(zbierz);
    };
    zbierz(DZWIGNIE);
    zbierz(PRZEJSCIA);
    expect(liczby.length).toBeGreaterThan(20);
    for (const v of liczby) expect(Number.isInteger(v), String(v)).toBe(true);
  });
});

// ---------------------------------------------------------------- rejon bez upadku

describe('postarz bez upadku: rejon 182350 z Przymorza, 20 000 osób', () => {
  const spis = obsadzRejon(gdansk.rejony['182350'], 9600, kraj, 'czas-182350', gdansk);
  const w2026 = postarz(spis, 2026, kraj, 'miasto100k', false);
  const w2051 = postarz(spis, 2051, kraj, 'miasto100k', false);

  it('w spisie jest co najmniej 20 000 osób', () => {
    expect(spis.osoby.length).toBeGreaterThanOrEqual(20000);
  });

  it('przeżycie mężczyzn po sześćdziesiątce (60-69 lat) przez 5 lat zgadza się z 5qx z tabeli ±1,5 pp', () => {
    // Jeden rejon ma tylko około 850 takich mężczyzn (odchylenie około 1,1 pp), więc bierzemy cztery niezależne
    // obsadzenia po 20 000 osób (około 3 400 mężczyzn, odchylenie około 0,55 pp). Wiek `2020 - rocznik` to wiek
    // ukończony na koniec 2020 roku, więc w latach 2021-2025 osoba przechodzi przez przedziały [w, w+1], …,
    // [w+4, w+5]; w każdym średnia qx z obu końców (osoba jest średnio w połowie). Poprawa umieralności o 1% rocznie
    // od 2025 roku to w tych latach najwyżej +4% qx, około 0,2 pp, w granicy tolerancji.
    const qx = kraj.qx.miastaM;
    const piecQ = (w: number): number => {
      let przezyje = 1;
      for (let a = w; a <= w + 4; a++) przezyje *= 1 - (qx[a] + qx[a + 1]) / 200000;
      return 1 - przezyje;
    };
    let ile = 0;
    let zmarli = 0;
    let oczekiwane = 0;
    for (const ziarno of ['czas-182350', 'czas-a', 'czas-b', 'czas-c']) {
      const s = ziarno === 'czas-182350' ? spis : obsadzRejon(gdansk.rejony['182350'], 9600, kraj, ziarno, gdansk);
      expect(s.osoby.length).toBeGreaterThanOrEqual(19500);
      const po = ziarno === 'czas-182350' ? w2026 : postarz(s, 2026, kraj, 'miasto100k', false);
      const wg = new Map(po.osoby.map((o) => [o.id, o]));
      for (const o of s.osoby) {
        const w = 2020 - o.rocznik;
        if (o.plec !== 'M' || w < 60 || w > 69) continue;
        ile++;
        if (wg.get(o.id)!.stan === 'zmarl') zmarli++;
        oczekiwane += piecQ(w);
      }
    }
    expect(ile).toBeGreaterThan(3000);
    expect(Math.abs(zmarli / ile - oczekiwane / ile)).toBeLessThanOrEqual(0.015);
  });

  it('urodzeń w latach 2021-2025 tyle, ile daje płodność × mnożnik miast 100 tys.+ (±10%)', () => {
    let oczekiwane = 0;
    for (const o of spis.osoby) {
      if (o.plec !== 'K') continue;
      for (let rok = 2021; rok <= 2025; rok++) {
        const a = rok - o.rocznik;
        if (a >= 15 && a <= 49) oczekiwane += (kraj.plodnosc[a - 15] * kraj.mnoznikPlodnosci.miasto100k) / 1e8;
      }
    }
    const urodzenia = w2026.dziennik.filter((d) => d.typ === 'urodzenie').length;
    // kobiety, które umarły albo wyjechały, rodzą krócej, więc urodzeń jest trochę mniej niż w tym oszacowaniu
    expect(urodzenia).toBeGreaterThan(oczekiwane * 0.85);
    expect(urodzenia).toBeLessThan(oczekiwane * 1.1);
  });

  it('niezmienniki wyniku w 2026 i 2051', () => {
    expect(sprawdzWynik(w2026, 2026)).toBeGreaterThan(20000);
    sprawdzWynik(w2051, 2051);
    expect(w2026.rok).toBe(2026);
    expect(w2051.rok).toBe(2051);
  });

  it('każde dziecko z rocznika 2021+ ma matkę w wieku 15-49 przy urodzeniu', () => {
    const wiek = wiekMatek([w2051]);
    expect(wiek.length).toBeGreaterThan(500);
    for (const a of wiek) {
      expect(a).toBeGreaterThanOrEqual(15);
      expect(a).toBeLessThanOrEqual(49);
    }
  });

  it('z rodzicami mieszka około połowy osób w wieku 25-34 (Eurostat 51%; tu w 2051 bez upadku 40-62%)', () => {
    // W spisie z rodzicami mieszka tu tylko 35% osób w wieku 25-34 (i 55% w wieku 18-24), więc liczy się stan
    // ustalony po 30 latach, a nie 2026. Około połowy osób 25-34 to wtedy przyjezdni i partnerzy z zewnątrz.
    const dom = new Map<string, string>();
    for (const g of w2051.gospodarstwa) for (const id of g.czlonkowie) dom.set(id, g.id);
    const udzial = (od: number, doW: number): number => {
      let ile = 0;
      let zRodzicami = 0;
      for (const o of w2051.osoby) {
        const w = 2050 - o.rocznik;
        if (o.stan !== 'tu' || w < od || w > doW) continue;
        ile++;
        if ([o.matka, o.ojciec].some((id) => id !== undefined && dom.get(id) === dom.get(o.id))) zRodzicami++;
      }
      return zRodzicami / ile;
    };
    expect(udzial(25, 34)).toBeGreaterThan(0.4);
    expect(udzial(25, 34)).toBeLessThan(0.62);
    expect(udzial(25, 29)).toBeGreaterThan(udzial(30, 34));
    expect(udzial(18, 24)).toBeGreaterThan(0.85);
  });

  it('bez upadku ludność nie zapada się: w 2051 mieszka 70-115% stanu ze spisu', () => {
    const tu = w2051.osoby.filter((o) => o.stan === 'tu').length;
    expect(tu / spis.osoby.length).toBeGreaterThan(0.7);
    expect(tu / spis.osoby.length).toBeLessThan(1.15);
  });
});

// ---------------------------------------------------------------- trzy dema z upadkiem

describe('postarz z upadkiem: trzy dema do 2051', () => {
  it('w 2051 pustych jest 40-60% mieszkań w blokach, w każdym demie z blokami i razem', () => {
    const wszystkie: WynikBudynku[] = [];
    for (const [nazwa] of DEMA) {
      const wyniki = z2051.get(nazwa)!;
      wszystkie.push(...wyniki);
      if (!wyniki.some((w) => w.budynek.typ === 'blok')) continue;
      const udzial = pusteWBlokach(wyniki);
      expect(udzial, nazwa).toBeGreaterThanOrEqual(0.4);
      expect(udzial, nazwa).toBeLessThanOrEqual(0.6);
    }
    expect(pusteWBlokach(wszystkie)).toBeGreaterThanOrEqual(0.4);
    expect(pusteWBlokach(wszystkie)).toBeLessThanOrEqual(0.6);
    // Batowice to same domy: dema bez bloków nie wchodzą do udziału
    expect(z2051.get('zielonki')!.some((w) => w.budynek.typ === 'blok')).toBe(false);
  });

  it('bez upadku w 2051 pustych mieszkań w blokach jest mniej niż 15%', () => {
    for (const nazwa of ['przymorze', 'lanciego']) expect(pusteWBlokach(bez2051.get(nazwa)!), nazwa).toBeLessThan(0.15);
  });

  it('nikt z mieszkańców nie ma w 2051 więcej niż 110 lat', () => {
    for (const mapa of [z2051, bez2051]) {
      for (const wyniki of mapa.values()) {
        for (const w of wyniki)
          for (const o of w.osoby) if (o.stan === 'tu') expect(2051 - o.rocznik).toBeLessThanOrEqual(110);
      }
    }
  });

  it('każde dziecko z rocznika 2021+ ma matkę w wieku 15-49 przy urodzeniu', () => {
    const wiek = [...z2051.values(), ...bez2051.values()].flatMap((w) => wiekMatek(w));
    expect(wiek.length).toBeGreaterThan(200);
    for (const a of wiek) {
      expect(a).toBeGreaterThanOrEqual(15);
      expect(a).toBeLessThanOrEqual(49);
    }
  });

  it('nikt urodzony po 2021 nie ma wpisu przydział, a przydziały zostają ze spisu', () => {
    for (const wyniki of z2051.values()) {
      for (const w of wyniki) {
        const wg = new Map(w.osoby.map((o) => [o.id, o]));
        for (const d of w.dziennik) {
          if (d.typ === 'przydzial') expect(wg.get(d.kto)!.rocznik).toBeLessThanOrEqual(2020);
        }
      }
    }
    const spisPrzymorza = spisy.get('przymorze')!;
    const przydzialy = (wyniki: WynikBudynku[]): number =>
      wyniki.reduce((s, w) => s + w.dziennik.filter((d) => d.typ === 'przydzial').length, 0);
    expect(przydzialy(spisPrzymorza)).toBeGreaterThan(0);
    expect(przydzialy(z2051.get('przymorze')!)).toBe(przydzialy(spisPrzymorza));
  });

  it('niezmienniki wyniku w każdym budynku', () => {
    let osob = 0;
    for (const mapa of [z2051, bez2051])
      for (const wyniki of mapa.values()) for (const w of wyniki) osob += sprawdzWynik(w, 2051);
    expect(osob).toBeGreaterThan(20000);
  });

  it('dziennik ma wszystkie rodzaje zdarzeń, a opuszczone mieszkania mają wpis', () => {
    const typy = new Set([...z2051.values()].flatMap((w) => w.flatMap((x) => x.dziennik.map((d) => d.typ))));
    for (const t of [
      'zgon',
      'urodzenie',
      'wyprowadzka',
      'zwiazek',
      'emigracja',
      'powrot',
      'powrotOpieka',
      'wprowadzka',
      'owdowienie',
      'opuszczone',
    ] as const) {
      expect(typy.has(t), t).toBe(true);
    }
    // gospodarstwo ze spisu, którego nie ma w 2051, dostało wpis `opuszczone`
    for (const [nazwa] of DEMA) {
      const przed = spisy.get(nazwa)!;
      const po = z2051.get(nazwa)!;
      przed.forEach((w, i) => {
        const zostaly = new Set(po[i].gospodarstwa.map((g) => g.id));
        const opuszczone = new Set(po[i].dziennik.filter((d) => d.typ === 'opuszczone').map((d) => d.kto));
        for (const g of w.gospodarstwa) if (!zostaly.has(g.id)) expect(opuszczone.has(g.id), g.id).toBe(true);
      });
    }
  });

  it('postarz dwa razy daje ten sam JSON i nie zmienia wejścia', () => {
    const spis = spisy.get('przymorze')!;
    const przed = JSON.stringify(spis);
    const raz = JSON.stringify(postarzWszystkie(spis, 2051, 'miasto100k', true));
    const dwa = JSON.stringify(postarzWszystkie(spis, 2051, 'miasto100k', true));
    expect(dwa).toBe(raz);
    expect(raz).toBe(JSON.stringify(z2051.get('przymorze')));
    expect(JSON.stringify(spis)).toBe(przed);
  });

  it('krok 2021→2026 jest bez upadku, a kroki składają się: 2021→2026→2051 to to samo co 2021→2051', () => {
    for (const [nazwa, g] of DEMA) {
      const o = obszarGminy(g);
      const spis = spisy.get(nazwa)!;
      const zUpadkiem = postarzWszystkie(spis, 2026, o, true);
      expect(JSON.stringify(zUpadkiem), nazwa).toBe(JSON.stringify(postarzWszystkie(spis, 2026, o, false)));
      const dalej = zUpadkiem.map((w) => postarz(w, 2051, kraj, o, true));
      expect(JSON.stringify(dalej), nazwa).toBe(JSON.stringify(z2051.get(nazwa)));
      expect(JSON.stringify(dalej.map((w) => postarz(w, 2051, kraj, o, true))), nazwa).toBe(JSON.stringify(dalej));
    }
    expect(() => postarz(z2051.get('zielonki')![0], 2026, kraj, 'wies', true)).toThrow(RangeError);
  });

  it('upadek: mniej ludzi niż bez upadku, a więcej gospodarstw wielopokoleniowych', () => {
    for (const nazwa of ['przymorze', 'lanciego']) {
      const tu = (wyniki: WynikBudynku[]): number =>
        wyniki.reduce((s, w) => s + w.osoby.filter((o) => o.stan === 'tu').length, 0);
      expect(tu(z2051.get(nazwa)!), nazwa).toBeLessThan(tu(bez2051.get(nazwa)!));
      const wielopokoleniowe = (wyniki: WynikBudynku[]): number => {
        let ile = 0;
        let razem = 0;
        for (const w of wyniki) {
          const wg = new Map(w.osoby.map((o) => [o.id, o]));
          for (const g of w.gospodarstwa) {
            razem++;
            const ma = g.czlonkowie.some((id) => {
              const o = wg.get(id)!;
              return (
                2050 - o.rocznik >= 25 && [o.matka, o.ojciec].some((p) => p !== undefined && g.czlonkowie.includes(p))
              );
            });
            if (ma) ile++;
          }
        }
        return ile / razem;
      };
      expect(wielopokoleniowe(z2051.get(nazwa)!), nazwa).toBeGreaterThan(wielopokoleniowe(bez2051.get(nazwa)!));
    }
  });

  it('kierunki wyjazdów: z dużego miasta nie do niego samego, z Batowic do Krakowa częściej niż do innych miast', () => {
    /** Wyjazdy liczone raz na jednostkę (wpis bez `z`), bo rodzina jedzie w jedno miejsce. */
    const cele = (nazwa: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const w of z2051.get(nazwa)!) {
        for (const d of w.dziennik) {
          if ((d.typ === 'wyprowadzka' || d.typ === 'emigracja') && d.z === undefined) {
            m.set(d.dokad!, (m.get(d.dokad!) ?? 0) + 1);
          }
        }
      }
      return m;
    };
    expect(cele('przymorze').has('do Gdańska')).toBe(false);
    expect(cele('przymorze').has('do Warszawy')).toBe(true);
    expect(cele('lanciego').has('do Warszawy')).toBe(false);
    const batowice = cele('zielonki');
    for (const miasto of ['do Warszawy', 'do Wrocławia', 'do Łodzi', 'do Poznania', 'do Gdańska']) {
      expect(batowice.get('do Krakowa')!, miasto).toBeGreaterThan(2 * (batowice.get(miasto) ?? 0));
    }
  });

  it('budynek bez gminy (marginesy Polski) i pusty rejon dają wynik bez wyjątku', () => {
    const b = budynkiZGeo(demo('przymorze'), null, kraj)[0];
    const bezGminy = postarz(obsadzBudynek(b, kraj.polska, null, kraj), 2051, kraj, obszarGminy(null), true);
    sprawdzWynik(bezGminy, 2051);
    const pusty = postarz(obsadzRejon(kraj.polska, 0, kraj, 'czas-pusty'), 2051, kraj, 'miasto', true);
    expect(pusty.osoby).toEqual([]);
    expect(pusty.puste).toBe(0);
  });

  it('całe demo (spis i postarz do 2051) w Node poniżej 600 ms (cel 200 ms, mediana z 3)', () => {
    for (const [nazwa, g] of DEMA) {
      const czasy: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        postarzWszystkie(spisDema(nazwa, g), 2051, obszarGminy(g), true);
        czasy.push(performance.now() - t0);
      }
      czasy.sort((a, b) => a - b);
      expect(czasy[1], nazwa).toBeLessThan(600);
    }
  });
});
