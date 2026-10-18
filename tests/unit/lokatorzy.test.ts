/* Osoby i mieszkania siedziby z generatora mieszkańców (src/sim/lokatorzy.ts): zarząd i lokatorzy parteru siedziby
   z gospodarstw budynku, stany mieszkań z historii budynku. Na trzech demach z public/demo/ i tabelach z
   public/data/mieszkancy/ (atrapa `fetch` czyta pliki), plus małe przypadki dla `osobaGry`. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { POTRZEBNE } from '../../src/content/druzyna.ts';
import { hashString } from '../../src/core/rng.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { fachOsoby } from '../../src/mieszkancy/fachy.ts';
import { budynkiObszaru, generujBudynek, kronikaObszaru } from '../../src/mieszkancy/generuj.ts';
import { oznaczGeo, TAG_BUDYNKU } from '../../src/mieszkancy/oznacz.ts';
import type { Budynek, Osoba, WynikBudynku } from '../../src/mieszkancy/typy.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { type LokatorzyGry, lokatorzyGry, type OsobaGry, osobaGry } from '../../src/sim/lokatorzy.ts';
import { type AptWhy, reachable, settleApts } from '../../src/world/apts.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
const WHY: readonly AptWhy[] = ['wyjazd', 'wymarcie', 'splądrowanie', 'zalanie', 'pozar'];
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type NazwaDema = (typeof DEMA)[number];

/** Atrapa `fetch`: ścieżka względna to plik w public/, brak pliku to 404 (jak w mieszkancy-wczytaj-dane.test.ts). */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

interface Demo {
  geo: Geo;
  world: World;
  dane: DaneMieszkancow;
  wynik: LokatorzyGry;
}
const dema = new Map<NazwaDema, Demo>();
const demo = (nazwa: NazwaDema): Demo => {
  const d = dema.get(nazwa);
  if (!d) throw new Error(`demo ${nazwa} nie wczytane`);
  return d;
};

beforeAll(async () => {
  for (const nazwa of DEMA) {
    const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as {
      geo: Geo;
      addr: string;
      street?: string;
    };
    const dane = await wczytajDaneMieszkancow(d.geo.c[0], d.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
    const geo = oznaczGeo(d.geo, budynkiZCzlonkami(d.geo, dane.gmina, dane.kraj));
    // ziarno jak w grze (main.ts): z adresu
    const world = buildWorld(geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
    const wynik = lokatorzyGry(world, geo, dane, { core: 4 });
    if (!wynik) throw new Error(`lokatorzyGry dało null dla ${nazwa}`);
    dema.set(nazwa, { geo, world, dane, wynik });
  }
});

/** Wszystkie osoby wyniku: zarząd i lokatorzy. */
const wszystkie = (l: LokatorzyGry): OsobaGry[] => [...l.zarzad, ...l.lokatorzy.flatMap((m) => m.osoby)];
/** Mieszkania parteru siedziby (Room.apt od 0 do największego). */
const mieszkaniaParteru = (w: World): number[] => {
  const n = w.interior.rooms.reduce((m, r) => Math.max(m, r.apt + 1), 0);
  return [...Array(n).keys()];
};
/** Świat z siedzibą bez tagu zm:bud (płytka kopia; reszta świata wspólna). */
const bezTagu = (w: World): World => ({
  ...w,
  buildings: w.buildings.map((b) => {
    if (b.id !== w.hq) return b;
    const { [TAG_BUDYNKU]: _, ...tags } = b.tags;
    return { ...b, tags };
  }),
});

describe('lokatorzyGry na demach', () => {
  it('zarząd Przymorza pokrywa co najmniej 3 z 4 potrzebnych dziedzin i ma 4 osoby', () => {
    const { zarzad } = demo('przymorze').wynik;
    expect(zarzad.length).toBe(4);
    const pokryte = POTRZEBNE.filter((d) => zarzad.some((o) => (o.skills[d] ?? 0) >= 1));
    expect(pokryte.length).toBeGreaterThanOrEqual(3);
  });

  it('miejsce zarządu dla dziedziny dostaje najwyższy poziom tej dziedziny spośród jeszcze niewybranych', () => {
    for (const nazwa of ['przymorze', 'lanciego'] as const) {
      const { wynik } = demo(nazwa);
      const kandydaci = wynik.siedziba.osoby.filter(
        (o) => o.stan === 'tu' && 2051 - o.rocznik >= 18 && 2051 - o.rocznik <= 75 && fachOsoby(o),
      );
      POTRZEBNE.forEach((d, i) => {
        const wczesniej = new Set(wynik.zarzad.slice(0, i).map((o) => o.ref));
        const najwyzej = Math.max(
          ...kandydaci.filter((o) => !wczesniej.has(o.id)).map((o) => fachOsoby(o)?.umiejetnosci[d] ?? 0),
        );
        expect(najwyzej, `${nazwa} ${d}`).toBeGreaterThan(0);
        expect(wynik.zarzad[i].skills[d], `${nazwa} ${d}`).toBe(najwyzej);
      });
    }
  });

  it('zarząd to najwyżej `core` różnych dorosłych (18-75 lat) z fachem, obecnych w siedzibie', () => {
    for (const nazwa of DEMA) {
      const { world, geo, dane, wynik } = demo(nazwa);
      expect(wynik.zarzad.length, nazwa).toBeGreaterThan(0);
      expect(wynik.zarzad.length, nazwa).toBeLessThanOrEqual(4);
      const wg = new Map(wynik.siedziba.osoby.map((o) => [o.id, o]));
      for (const o of wynik.zarzad) {
        const osoba = wg.get(o.ref);
        expect(osoba, `${nazwa} ${o.ref}`).toBeDefined();
        expect(osoba?.stan).toBe('tu');
        expect(osoba?.fach).toBeDefined();
        expect(o.age).toBeGreaterThanOrEqual(18);
        expect(o.age).toBeLessThanOrEqual(75);
      }
      expect(new Set(wynik.zarzad.map((o) => o.ref)).size, nazwa).toBe(wynik.zarzad.length);
      const dwoje = lokatorzyGry(world, geo, dane, { core: 2 });
      expect(dwoje?.zarzad.length, nazwa).toBeLessThanOrEqual(2);
      // pierwsze miejsca zarządu wybiera się tak samo, niezależnie od liczby miejsc
      expect(dwoje?.zarzad, nazwa).toEqual(wynik.zarzad.slice(0, dwoje?.zarzad.length));
    }
  });

  it('każda osoba ma niepuste imię i imię z nazwiskiem, wiek 2051 - rocznik, ref do obecnej osoby siedziby', () => {
    for (const nazwa of DEMA) {
      const { wynik } = demo(nazwa);
      const wg = new Map(wynik.siedziba.osoby.map((o) => [o.id, o]));
      for (const o of wszystkie(wynik)) {
        expect(o.first.length, `${nazwa} ${o.ref}`).toBeGreaterThan(0);
        expect(o.name.startsWith(`${o.first} `), `${nazwa} ${o.name}`).toBe(true);
        expect(o.name.length).toBeGreaterThan(o.first.length + 1);
        const osoba = wg.get(o.ref);
        expect(osoba?.stan, `${nazwa} ${o.ref}`).toBe('tu');
        expect(o.age).toBe(2051 - (osoba?.rocznik ?? 0));
        expect(o.f).toBe(osoba?.plec === 'K');
        expect(o.prof.length).toBeGreaterThan(0);
        expect(o.traits.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('stany obejmują każde mieszkanie parteru raz, w siedzibie; mieszkanie z kozą ma zarząd, reszta nie', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      expect(
        wynik.stany.map((s) => s.apt).sort((a, b) => a - b),
        nazwa,
      ).toEqual(mieszkaniaParteru(world));
      for (const s of wynik.stany) {
        expect(s.bid, nazwa).toBe(world.hq);
        expect(s.state === 'zarzad', `${nazwa} ${s.apt}`).toBe(s.apt === world.interior.home);
      }
      // lokatorzy to dokładnie mieszkania ze stanem „mieszkancy”, rosnąco
      const zamieszkane = wynik.stany.filter((s) => s.state === 'mieszkancy').map((s) => s.apt);
      expect(
        wynik.lokatorzy.map((m) => m.apt),
        nazwa,
      ).toEqual(zamieszkane.sort((a, b) => a - b));
    }
  });

  it('co najmniej jedno mieszkanie osiągalne z podwórka jest zamieszkane, gdy jakieś jest', () => {
    let sprawdzone = 0;
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const blisko = reachable(world);
      if (!blisko.size) continue;
      sprawdzone++;
      expect(
        wynik.stany.some((s) => blisko.has(s.apt) && s.state === 'mieszkancy'),
        nazwa,
      ).toBe(true);
    }
    expect(sprawdzone).toBeGreaterThanOrEqual(2);
  });

  it('puste mieszkania: powód z listy, rok w [2029, 2051], szaber, zalanie i pożar od 2033', () => {
    let zPowodem = 0;
    for (const nazwa of DEMA) {
      for (const s of demo(nazwa).wynik.stany) {
        if (s.state !== 'puste') {
          expect(s.why, `${nazwa} ${s.apt}`).toBeUndefined();
          continue;
        }
        if (!s.why) continue;
        zPowodem++;
        expect(WHY).toContain(s.why);
        expect(s.year, `${nazwa} ${s.apt}`).toBeGreaterThanOrEqual(2029);
        expect(s.year, `${nazwa} ${s.apt}`).toBeLessThanOrEqual(2051);
        if (s.why !== 'wyjazd' && s.why !== 'wymarcie') expect(s.year).toBeGreaterThanOrEqual(2033);
      }
    }
    expect(zPowodem).toBeGreaterThan(0);
  });

  it('powód i rok pustych z wpisów „opuszczone”: ostatnie `puste` wpisów, równo rozłożone, rosnąco po numerze', () => {
    let sprawdzone = 0;
    for (const nazwa of DEMA) {
      const { wynik } = demo(nazwa);
      const s = wynik.siedziba;
      const op = s.dziennik.filter((d) => d.typ === 'opuszczone');
      const pula = op.slice(Math.max(0, op.length - s.puste)).sort((a, b) => a.rok - b.rok);
      const puste = wynik.stany.filter((x) => x.state === 'puste'); // stany idą rosnąco po numerze
      const k = puste.length;
      puste.forEach((x, i) => {
        const d = k >= pula.length ? pula[i] : pula[Math.floor(((2 * i + 1) * pula.length) / (2 * k))];
        if (!d) {
          expect(x.why, `${nazwa} ${x.apt}`).toBeUndefined();
          return;
        }
        sprawdzone++;
        expect(x.year, `${nazwa} ${x.apt}`).toBe(Math.max(2029, Math.min(2051, d.rok)));
        const zgon = s.dziennik.find((z) => z.typ === 'zgon' && z.kto === d.z);
        const zDziennika = zgon && zgon.rok <= d.rok ? 'wymarcie' : 'wyjazd';
        if (x.why === 'wyjazd' || x.why === 'wymarcie') expect(x.why, `${nazwa} ${x.apt}`).toBe(zDziennika);
        else expect(x.year).toBeGreaterThanOrEqual(2033);
      });
      const lata = puste.flatMap((x) => (x.year === undefined ? [] : [x.year]));
      expect(lata, nazwa).toEqual([...lata].sort((a, b) => a - b));
    }
    expect(sprawdzone).toBeGreaterThanOrEqual(5);
  });

  it('liczba pustych to round(n × puste / mieszkania) budynku, najwyżej tyle, żeby przy podwórku ktoś mieszkał', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const n = mieszkaniaParteru(world).filter((a) => a !== world.interior.home).length;
      const b = wynik.siedziba;
      const chciane = Math.round((n * b.puste) / (b.budynek.mieszkania ?? 1));
      const blisko = reachable(world);
      const puste = wynik.stany.filter((s) => s.state === 'puste');
      expect(puste.length, nazwa).toBe(Math.min(chciane, n - (blisko.size > 0 ? 1 : 0)));
      // puste najpierw spoza mieszkań osiągalnych z podwórka
      const daleko = n - blisko.size;
      expect(puste.filter((s) => blisko.has(s.apt)).length, nazwa).toBe(Math.max(0, puste.length - daleko));
    }
    // Przymorze: część mieszkań stoi pusta, a przy podwórku wszystkie zamieszkane
    expect(demo('przymorze').wynik.stany.filter((s) => s.state === 'puste').length).toBeGreaterThan(0);
  });

  it('jedyne mieszkanie przy podwórku zostaje zamieszkane, choć udział pustych w budynku każe je opróżnić', () => {
    const { world, geo, dane, wynik } = demo('lanciego');
    // warunek wstępny z danych: ponad połowa mieszkań budynku Lanciego stoi pusta
    const b = wynik.siedziba;
    expect(Math.round(b.puste / (b.budynek.mieszkania ?? 1))).toBe(1);
    // siedziba z dwoma mieszkaniami na siatce 4×4: zarząd (0) i jedno mieszkanie przy podwórku (1)
    const room = new Int16Array(16).map((_, t) => (t < 8 ? 0 : 1));
    const maly: World = {
      ...world,
      size: 4,
      blocked: new Uint8Array(16),
      interior: {
        ...world.interior,
        room,
        rooms: [
          { id: 0, kind: 'pokoj', apt: 0, area: 8 },
          { id: 1, kind: 'pokoj', apt: 1, area: 8 },
        ],
        home: 0,
      },
      fence: { ...world.fence, tiles: [], gate: { ...world.fence.gate, x: 0, y: 0, w: 0, h: 0 }, yard: [15] },
    };
    expect([...reachable(maly)]).toEqual([1]);
    const l = lokatorzyGry(maly, geo, dane, { core: 4 });
    expect(l?.stany).toEqual([
      { bid: world.hq, apt: 0, state: 'zarzad' },
      { bid: world.hq, apt: 1, state: 'mieszkancy' },
    ]);
    expect(l?.lokatorzy.map((m) => m.apt)).toEqual([1]);
    expect(l?.lokatorzy[0].osoby.length).toBeGreaterThan(0);
  });

  it('stany przechodzą przez settleApts bez zmiany stanu, powodu i roku', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const r = settleApts(world, wynik.stany);
      for (const s of wynik.stany) {
        const t = r.apts.find((x) => x.apt === s.apt);
        expect(t?.state, `${nazwa} ${s.apt}`).toBe(s.state);
        if (s.why) expect([t?.why, t?.year]).toEqual([s.why, s.year]);
      }
    }
  });

  it('lokatorzy: całe gospodarstwa z obecnymi, bez rodzin zarządu, każde w jednym mieszkaniu', () => {
    for (const nazwa of DEMA) {
      const { wynik } = demo(nazwa);
      const domOsoby = new Map<string, string>();
      for (const g of wynik.siedziba.gospodarstwa) for (const id of g.czlonkowie) domOsoby.set(id, g.id);
      const domyZarzadu = new Set(wynik.zarzad.map((o) => domOsoby.get(o.ref)));
      const uzyte = new Set<string>();
      for (const m of wynik.lokatorzy) {
        if (!m.osoby.length) continue;
        const domy = new Set(m.osoby.map((o) => domOsoby.get(o.ref)));
        expect(domy.size, `${nazwa} ${m.apt}`).toBe(1);
        const [dom] = domy;
        expect(dom).toBeDefined();
        expect(domyZarzadu.has(dom), `${nazwa} ${m.apt}`).toBe(false);
        expect(uzyte.has(dom ?? ''), `${nazwa} ${m.apt}`).toBe(false);
        uzyte.add(dom ?? '');
        const gosp = wynik.siedziba.gospodarstwa.find((g) => g.id === dom);
        expect(m.osoby.map((o) => o.ref)).toEqual(gosp?.czlonkowie);
      }
    }
    // Przymorze i Lanciego mają mieszkania dla lokatorów i ludzi do nich
    for (const nazwa of ['przymorze', 'lanciego'] as const) {
      expect(
        demo(nazwa).wynik.lokatorzy.some((m) => m.osoby.length > 0),
        nazwa,
      ).toBe(true);
    }
  });

  it('gospodarstwa idą po kolei z budynku, najpierw te z 1-4 obecnymi, najpierw do mieszkań przy podwórku', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const s = wynik.siedziba;
      const tu = new Set(s.osoby.filter((o) => o.stan === 'tu').map((o) => o.id));
      const zarzad = new Set(wynik.zarzad.map((o) => o.ref));
      const kolejka = s.gospodarstwa.filter(
        (g) => g.czlonkowie.some((id) => tu.has(id)) && !g.czlonkowie.some((id) => zarzad.has(id)),
      );
      const obecni = (g: (typeof kolejka)[number]) => g.czlonkowie.filter((id) => tu.has(id)).length;
      const poKolei = [...kolejka.filter((g) => obecni(g) <= 4), ...kolejka.filter((g) => obecni(g) > 4)];
      const blisko = reachable(world);
      const mieszkania = [
        ...wynik.lokatorzy.filter((m) => blisko.has(m.apt)),
        ...wynik.lokatorzy.filter((m) => !blisko.has(m.apt)),
      ];
      const domOsoby = new Map<string, string>();
      for (const g of s.gospodarstwa) for (const id of g.czlonkowie) domOsoby.set(id, g.id);
      mieszkania.forEach((m, i) => {
        const oczekiwane = poKolei[i];
        if (!oczekiwane) expect(m.osoby, `${nazwa} ${m.apt}`).toEqual([]);
        else expect(domOsoby.get(m.osoby[0]?.ref ?? ''), `${nazwa} ${m.apt}`).toBe(oczekiwane.id);
      });
    }
  });

  it('dwa wywołania dają ten sam wynik; świat i mapa zostają nietknięte', () => {
    for (const nazwa of DEMA) {
      const { world, geo, dane, wynik } = demo(nazwa);
      expect(lokatorzyGry(world, geo, dane, { core: 4 }), nazwa).toEqual(wynik);
    }
    const { world, geo, dane } = demo('zielonki');
    const swiat = structuredClone(world);
    const mapa = structuredClone(geo);
    lokatorzyGry(world, geo, dane, { core: 4 });
    expect(world).toEqual(swiat);
    expect(geo).toEqual(mapa);
  });

  it('żaden tekst dla gracza (story, rodzina, prof) nie trafia w regex RODO, a story ma najwyżej 700 znaków', () => {
    let zHistoria = 0;
    for (const nazwa of DEMA) {
      for (const o of wszystkie(demo(nazwa).wynik)) {
        for (const t of [o.story ?? '', o.rodzina, o.prof, o.name]) expect(t, `${nazwa} ${o.ref}`).not.toMatch(RODO);
        expect((o.story ?? '').length).toBeLessThanOrEqual(700);
        if (o.story) zHistoria++;
      }
    }
    expect(zHistoria).toBeGreaterThan(0);
  });

  it('siedziba z tagiem zm:bud bierze budynek generatora; bez tagu powstaje z zapasowego budynku ze świata', () => {
    const { world, geo, dane, wynik } = demo('zielonki');
    const klucz = world.buildings[world.hq].tags[TAG_BUDYNKU];
    expect(klucz).toBeDefined();
    expect(wynik.siedziba.budynek.klucz).toBe(klucz);

    const zapas = lokatorzyGry(bezTagu(world), geo, dane, { core: 4 });
    expect(zapas).not.toBeNull();
    const b = zapas?.siedziba.budynek as Budynek;
    const [lat, lon] = geo.c;
    expect(b.klucz).toBe(`hq:${lat.toFixed(5)},${lon.toFixed(5)}`);
    const hq = world.buildings[world.hq];
    expect(b.typ).toBe(hq.levels >= 3 || hq.area >= 300 ? 'blok' : 'dom');
    expect(b.kondygnacje).toBe(hq.levels);
    expect(b.klatki).toBe(Math.max(1, hq.entrances.length));
    expect(b.rejon).toBe(wynik.siedziba.budynek.rejon); // ten sam rejon: dom stoi przy adresie
    expect(zapas?.zarzad.length).toBeGreaterThan(0);
    expect(zapas?.stany.length).toBe(wynik.stany.length);
  });

  it('Przymorze i Lanciego: siedziba nie jest budynkiem mieszkalnym na mapie, więc idzie z zapasowego', () => {
    for (const nazwa of ['przymorze', 'lanciego'] as const) {
      const { world, geo, wynik } = demo(nazwa);
      expect(world.buildings[world.hq].tags[TAG_BUDYNKU], nazwa).toBeUndefined();
      expect(wynik.siedziba.budynek.klucz, nazwa).toBe(`hq:${geo.c[0].toFixed(5)},${geo.c[1].toFixed(5)}`);
      expect(wynik.siedziba.budynek.typ, nazwa).toBe('blok');
    }
  });

  it('dane bez gminy (szablon krajowy) też dają zarząd, lokatorów i stany', () => {
    for (const nazwa of DEMA) {
      const { world, geo, dane } = demo(nazwa);
      const krajowe = lokatorzyGry(world, geo, { ...dane, gmina: null }, { core: 4 });
      expect(krajowe, nazwa).not.toBeNull();
      expect(krajowe?.zarzad.length, nazwa).toBeGreaterThan(0);
      expect(krajowe?.siedziba.budynek.rejon, nazwa).toBe('');
      expect(krajowe?.stany.length, nazwa).toBe(mieszkaniaParteru(world).length);
      for (const o of krajowe ? wszystkie(krajowe) : []) expect(o.first.length).toBeGreaterThan(0);
    }
  });

  it('kronika i budynek siedziby są te same, które daje generator dla obszaru', () => {
    for (const nazwa of DEMA) {
      const { geo, dane, wynik } = demo(nazwa);
      const budynki = budynkiObszaru(geo, dane.gmina, dane.kraj);
      const kronika = kronikaObszaru(geo, budynki, dane.imiona);
      expect(kronika.length, nazwa).toBeGreaterThan(0);
      expect(wynik.kronika, nazwa).toEqual(kronika);
      const nazwy = { imiona: dane.imiona, nazwiska: dane.nazwiska, odmiana: dane.odmiana, kronika };
      expect(wynik.siedziba, nazwa).toEqual(generujBudynek(wynik.siedziba.budynek, dane.gmina, dane.kraj, nazwy));
      // historie gospodarstw są w wyniku, a osoby biorą je do story
      expect(
        wynik.siedziba.gospodarstwa.every((g) => (g.historia ?? []).length > 0),
        nazwa,
      ).toBe(true);
    }
  });

  it('świat bez siedziby daje null', () => {
    const { world, geo, dane } = demo('zielonki');
    expect(lokatorzyGry({ ...world, hq: -1 }, geo, dane, { core: 4 })).toBeNull();
  });

  // test czasu tylko z ZM_PERF=1: pod równoległym obciążeniem vitest mierzy zegar ściany, nie kod
  it.skipIf(!process.env.ZM_PERF)('lokatorzyGry dla każdego dema poniżej 60 ms w Node (mediana z 5)', () => {
    for (const nazwa of DEMA) {
      const { world, geo, dane } = demo(nazwa);
      const czasy: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        lokatorzyGry(world, geo, dane, { core: 4 });
        czasy.push(performance.now() - t0);
      }
      czasy.sort((a, b) => a - b);
      console.info(`lokatorzyGry ${nazwa}: ${czasy.map((c) => c.toFixed(1)).join(', ')} ms`);
      expect(czasy[2], nazwa).toBeLessThan(60);
    }
  });
});

// ---------------------------------------------------------------- osobaGry na małym budynku

const KLUCZ = 'test:1';
const osoba = (n: number, plec: 'M' | 'K', rocznik: number, imie: string, inne: Partial<Osoba> = {}): Osoba => ({
  id: `${KLUCZ}/o${n}`,
  plec,
  rocznik,
  imie,
  nazwisko: plec === 'K' ? 'Nowicka' : 'Nowicki',
  stan: 'tu',
  ...inne,
});
const marek = osoba(0, 'M', 1997, 'Marek', { partner: `${KLUCZ}/o1`, fach: 'zdun', dawnyZawod: 'kurier' });
const anna = osoba(1, 'K', 1999, 'Anna', {
  partner: `${KLUCZ}/o0`,
  fach: 'felczer',
  dawnyZawod: 'pielęgniarka',
  matka: `${KLUCZ}/o5`,
});
const agnieszka = osoba(2, 'K', 2028, 'Agnieszka', {
  matka: anna.id,
  ojciec: marek.id,
  fach: 'ogrodnik',
});
const jas = osoba(3, 'M', 2040, 'Jaś', { matka: anna.id, ojciec: marek.id });
const piotr = osoba(4, 'M', 2026, 'Piotr', { matka: anna.id, ojciec: marek.id, stan: 'wyjechal', dokad: 'Niemcy' });
const babcia = osoba(5, 'K', 1970, 'Halina', { stan: 'zmarl' });
const budynek: Budynek = {
  klucz: KLUCZ,
  lat: 52,
  lon: 21,
  rejon: '',
  typ: 'blok',
  kondygnacje: 4,
  pole: 500,
  szerokosc: 12,
  dlugosc: 40,
  klatki: 2,
  mieszkania: 20,
};
const maly: WynikBudynku = {
  budynek,
  osoby: [marek, anna, agnieszka, jas, piotr, babcia],
  gospodarstwa: [
    {
      id: `${KLUCZ}/g0`,
      budynek: KLUCZ,
      klatka: 1,
      czlonkowie: [marek.id, anna.id, agnieszka.id, jas.id],
      odOddania: false,
    },
  ],
  dziennik: [],
  puste: 0,
  rok: 2051,
};

describe('osobaGry', () => {
  it('imię, nazwisko, płeć, wiek, fach w formie płci, umiejętności fachu i ref', () => {
    const o = osobaGry(anna, maly, []);
    expect(o.first).toBe('Anna');
    expect(o.name).toBe('Anna Nowicka');
    expect(o.f).toBe(true);
    expect(o.age).toBe(52);
    expect(o.prof).toBe('felczerka');
    expect(o.skills).toEqual({ med: 3 });
    expect(o.ref).toBe(anna.id);
    expect(osobaGry(marek, maly, []).prof).toBe('zdun');
    expect(osobaGry(jas, maly, []).prof).toBe('dziecko');
    expect(osobaGry(jas, maly, []).skills).toEqual({});
  });

  it('rodzina: obecni krewni z wiekiem, najpierw małżonek, potem dzieci; bez wyjechanych i zmarłych', () => {
    expect(osobaGry(anna, maly, []).rodzina).toBe('mąż Marek (54), córka Agnieszka (23), syn Jaś (11)');
    expect(osobaGry(jas, maly, []).rodzina).toBe('matka Anna (52), ojciec Marek (54), siostra Agnieszka (23)');
    const sam = osoba(9, 'M', 1960, 'Zenon');
    expect(osobaGry(sam, { ...maly, osoby: [...maly.osoby, sam] }, []).rodzina).toBe('');
  });

  it('historia: linijka „Dawniej X, dziś Y.” i historia gospodarstwa; bez linijki, gdy brak dawnego zawodu', () => {
    const h = ['Anna wróciła z Gdańska w 2031.', 'Syn w Niemczech.'];
    expect(osobaGry(anna, maly, h).story).toBe(
      'Dawniej pielęgniarka, dziś felczerka. Anna wróciła z Gdańska w 2031. Syn w Niemczech.',
    );
    expect(osobaGry(agnieszka, maly, h).story).toBe('Anna wróciła z Gdańska w 2031. Syn w Niemczech.');
    expect(osobaGry(jas, maly, []).story).toBeUndefined();
  });

  it('historia nie powtarza linijki o fachu, gdy historia gospodarstwa już ją ma', () => {
    const h = ['Anna: kiedyś pielęgniarka, dziś felczerka.'];
    expect(osobaGry(anna, maly, h).story).toBe('Anna: kiedyś pielęgniarka, dziś felczerka.');
  });

  it('historia do 700 znaków, ucinana całymi zdaniami od końca; zdania z piętrem albo numerem mieszkania odpadają', () => {
    const zdanie = (i: number) => `Zdanie numer ${i} ${'bardzo długie '.repeat(8)}kończy się kropką.`;
    const h = Array.from({ length: 12 }, (_, i) => zdanie(i));
    const story = osobaGry(anna, maly, h).story ?? '';
    expect(story.length).toBeLessThanOrEqual(700);
    expect(story.startsWith('Dawniej pielęgniarka, dziś felczerka. Zdanie numer 0 ')).toBe(true);
    expect(story.endsWith('kończy się kropką.')).toBe(true);
    // całe zdania: każde zdanie po linijce osobistej to któreś z wejścia, w kolejności
    const reszta = story.slice('Dawniej pielęgniarka, dziś felczerka. '.length);
    const ile = h.findIndex((_, i) => reszta === h.slice(0, i + 1).join(' '));
    expect(ile).toBeGreaterThanOrEqual(0);
    expect(ile).toBeLessThan(h.length - 1);

    const rodo = osobaGry(anna, maly, ['Mieszkali na trzecim piętrze.', 'Potem m. 12 opustoszało.', 'Zostali.']);
    expect(rodo.story).toBe('Dawniej pielęgniarka, dziś felczerka. Zostali.');
  });

  it('cechy z ziarna osoby: te same dla tej samej osoby, 1-2 znane cechy', () => {
    const a = osobaGry(anna, maly, []).traits;
    expect(osobaGry(anna, maly, ['Inna historia.']).traits).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(2);
  });

  it('nie zmienia wejścia', () => {
    const przed = structuredClone(maly);
    osobaGry(anna, maly, ['Zdanie.']);
    expect(maly).toEqual(przed);
  });
});

describe('src/sim/lokatorzy.ts: moduł czysty', () => {
  const zrodlo = fs
    .readFileSync(path.resolve(import.meta.dirname, '../../src/sim/lokatorzy.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('nie importuje z ui, render, gov ani node:, bez DOM, sieci, Math.random i zegara', () => {
    expect(zrodlo).not.toMatch(/from '\.\.\/(ui|render|gov)\//);
    expect(zrodlo).not.toMatch(/from 'node:/);
    expect(zrodlo).not.toMatch(/\b(fetch|document|window|localStorage|performance)\b|Math\.random|Date\./);
  });
});
