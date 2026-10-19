/* Sześć budowli z technologii ery 1 i 2 oraz pracownia na mapie (docs/superpowers/specs/2026-10-19-badania-design.md,
   „Nowe budowle”): dane z projektu, zgodność z TECH_BY[*].odblokowuje, miejsca (kocioł na klatce siedziby albo w
   przedpokoju domu, pieczarkarnia w łazience, koza z beczki blisko okna, wieża jedna), odmowa przed badaniem, plan po
   badaniu, własny rysunek każdej budowli (nie zasieki z gałęzi domyślnej). Działanie (ciepło, plon, wytrzymałość,
   posterunek) zrobią późniejsze zadania. Przymorze i Lanciego (bloki) oraz Zielonki (dom) z dem. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { BUILD_BASE, BUILD_KINDS, buildSprite } from '../../src/render/art/budowle.ts';
import { rzeczSprite } from '../../src/render/art/pixellab.ts';
import { GAME_KINDS } from '../../src/render/game.ts';
import { TECH_BY, TECHS } from '../../src/sim/badania.ts';
import { BUILDS_EN } from '../../src/sim/budowle.en.ts';
import { BUILDS, type BuildKind, canPlace, footprint } from '../../src/sim/budowle.ts';
import { houseOf } from '../../src/sim/house.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { allowedAnchors, buildMenu, buildName, placeText } from '../../src/ui/budowa.ts';
import { thumbPixels } from '../../src/ui/miniatura.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

function demo(name: string) {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${name}.json`), 'utf8'));
  const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
  return { w: buildWorld(d.geo, { seed, street: d.street }), seed };
}
const przymorze = demo('przymorze');
const zielonki = demo('zielonki');
const lanciego = demo('lanciego');
const DEMA = [
  ['Przymorze (blok)', przymorze],
  ['Lanciego (blok)', lanciego],
  ['Zielonki (dom)', zielonki],
] as const;

/** budowle z technologii: rodzaj → badanie, które go odblokowuje */
const NOWE: Readonly<Record<string, string>> = {
  koza_beczka: 't_kozy',
  kociol: 't_wezel',
  pieczarkarnia: 't_grzyby',
  szklarnia: 't_szklarnia',
  barykada: 't_barykady',
  wieza: 't_wieza',
};
const RODZAJE = Object.keys(NOWE) as BuildKind[];

afterEach(() => ustawJezyk('pl'));

/** gra z jednym odblokowanym badaniem (techDone powstaje dopiero przy pierwszym użyciu) */
function gra(world: World, seed: number, tech?: string): SimState {
  const st = createSim(world, seed, { core: 4 });
  if (tech) st.techDone = [tech];
  return st;
}
const xy = (world: World, i: number): [number, number] => [i % world.size, Math.floor(i / world.size)];

describe('dane: sześć budowli z projektu', () => {
  it('rodzaj, miejsce, zakładka, rozmiar, koszt i badanie słowo w słowo z opisu zadania', () => {
    // miejsce „okno” (pokój, kuchnia albo przedpokój naszego mieszkania blisko okna) zamiast „pokoj” z opisu zadania:
    // rozstrzygnięcie koordynatora, bo na Lanciego pokoje nie mają okna
    expect(BUILDS.koza_beczka).toMatchObject({
      place: 'okno',
      cat: 'dom',
      w: 1,
      h: 1,
      cost: { zlom: 8, czesci: 1 },
      tech: 't_kozy',
    });
    expect(BUILDS.kociol).toMatchObject({
      place: 'klatka',
      w: 2,
      h: 1,
      cost: { zlom: 20, czesci: 6 },
      tech: 't_wezel',
    });
    expect(BUILDS.pieczarkarnia).toMatchObject({ place: 'lazienka', w: 1, h: 1, cost: { deski: 8 }, tech: 't_grzyby' });
    expect(BUILDS.szklarnia).toMatchObject({
      place: 'podworko',
      cat: 'podworko',
      w: 3,
      h: 2,
      cost: { deski: 10, czesci: 4 },
      tech: 't_szklarnia',
    });
    expect(BUILDS.barykada).toMatchObject({
      place: 'obwod',
      cat: 'obwod',
      w: 1,
      h: 1,
      cost: { zlom: 16, deski: 2 },
      tech: 't_barykady',
    });
    expect(BUILDS.wieza).toMatchObject({
      place: 'podworko',
      w: 2,
      h: 2,
      cost: { deski: 24, zlom: 6 },
      tech: 't_wieza',
      max: 1,
    });
  });

  it('każdy rodzaj z odblokowuje ma BUILDS[k].tech równe tej technologii i na odwrót', () => {
    const zOdblokowuje = TECHS.flatMap((t) => (t.odblokowuje ?? []).map((k) => [k, t.id] as const));
    expect(zOdblokowuje.map(([, id]) => id).sort()).toEqual(Object.values(NOWE).sort());
    for (const [k, id] of zOdblokowuje) {
      expect(k in BUILDS, k).toBe(true);
      expect(BUILDS[k as BuildKind].tech, k).toBe(id);
      expect(TECH_BY[id].odblokowuje, id).toContain(k);
    }
    // budowla z polem tech jest na liście którejś technologii (poza testowym t_test, którego tu nie ma)
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      const t = BUILDS[k].tech;
      if (t) expect(TECH_BY[t].odblokowuje, k).toContain(k);
    }
  });

  it('nazwy po polsku i po angielsku, w tym „Wreck wall” dla barykady, a menu pokazuje nowe po badaniu', () => {
    expect(BUILDS_EN.barykada).toMatchObject({ name: 'Wreck wall', the: 'the wreck wall' });
    for (const k of RODZAJE) {
      expect(BUILDS[k].name, k).toBeTruthy();
      expect(BUILDS_EN[k].name, k).toBeTruthy();
      expect(BUILDS_EN[k].the, k).toMatch(/^the /);
    }
    ustawJezyk('en');
    expect(buildName('barykada')).toBe('Wreck wall');
    ustawJezyk('pl');
    const st = gra(przymorze.w, przymorze.seed);
    const wszystkie = (s: SimState) =>
      buildMenu({ zlom: 99, deski: 99, czesci: 99, drewno: 99 }, () => true, undefined, undefined, { st: s }).flatMap(
        (c) => c.items.map((b) => b.kind),
      );
    expect(wszystkie(st)).not.toContain('kociol');
    st.techDone = Object.values(NOWE);
    expect(wszystkie(st)).toEqual(expect.arrayContaining(RODZAJE));
    const wDomu = buildMenu({ zlom: 99, deski: 99, czesci: 99 }, () => true, undefined, undefined, { st })
      .find((c) => c.key === 'dom')!
      .items.map((b) => b.kind);
    expect(wDomu).toEqual(expect.arrayContaining(['koza_beczka', 'kociol', 'pieczarkarnia', 'pracownia']));
  });

  it('opis miejsca w menu: klatka siedziby z domem w przedpokoju, łazienka naszego mieszkania, koza blisko okna', () => {
    expect(placeText('klatka')).toBe('na klatce siedziby (w domu w przedpokoju)');
    expect(placeText('okno')).toBe('w pokoju, kuchni albo przedpokoju naszego mieszkania, blisko okna');
    expect(placeText('lazienka')).toBe('w łazience naszego mieszkania');
    expect(placeText('pokoj')).toBe('w pokoju naszego mieszkania');
    const st = gra(przymorze.w, przymorze.seed);
    st.techDone = Object.values(NOWE);
    const menu = buildMenu({ zlom: 99, deski: 99, czesci: 99 }, () => true, undefined, undefined, { st });
    const miejsce = (k: BuildKind) => menu.flatMap((c) => c.items).find((b) => b.kind === k)!.place;
    expect(miejsce('koza_beczka')).toBe('w pokoju, kuchni albo przedpokoju naszego mieszkania, blisko okna');
    expect(miejsce('warsztat')).toBe('w pokoju naszego mieszkania');
    expect(miejsce('kociol')).toBe('na klatce siedziby (w domu w przedpokoju)');
  });
});

describe.each(DEMA)('miejsca i odmowa przed badaniem: %s', (_nazwa, { w, seed }) => {
  for (const k of RODZAJE) {
    it(`${k}: przed badaniem canPlace odrzuca, po wpisaniu techDone przyjmuje i plan staje`, () => {
      const st = gra(w, seed, NOWE[k]);
      const kotwice = allowedAnchors(st, w, k, 0);
      expect(kotwice.length, `miejsce na ${k}`).toBeGreaterThan(0);
      const [x, y] = xy(w, kotwice[0]);
      expect(canPlace(st, w, k, x, y, 0)).toEqual({ ok: true });
      // przed badaniem
      delete st.techDone;
      expect(canPlace(st, w, k, x, y, 0)).toEqual({ ok: false, why: 'Wymaga badania.' });
      expect(allowedAnchors(st, w, k, 0)).toEqual([]);
      ustawJezyk('en');
      expect(canPlace(st, w, k, x, y, 0).why).toBe('Needs research.');
      ustawJezyk('pl');
      // polecenie budowy też nie zrobi planu przed badaniem, a po badaniu zrobi
      const sim = new Sim(w, st);
      sim.push({ t: 'build', ids: [], kind: k, x, y, rot: 0 });
      sim.step();
      expect(st.builds).toEqual([]);
      st.techDone = [NOWE[k]];
      sim.push({ t: 'build', ids: [], kind: k, x, y, rot: 0 });
      sim.step();
      expect(st.builds.map((b) => b.kind)).toEqual([k]);
    });
  }

  it('tylko właściwe badanie odblokowuje: cudze nie wystarcza', () => {
    const st = gra(w, seed, 't_okna');
    for (const k of RODZAJE) expect(allowedAnchors(st, w, k, 0), k).toEqual([]);
  });
});

describe('Przymorze (blok): kocioł na klatce siedziby, pieczarkarnia w łazience, koza przy oknie', () => {
  const { w, seed } = przymorze;
  const h = houseOf(w)!;
  const rodzaj = (i: number) => h.rooms[h.room[i]].kind;
  const apt = (i: number) => h.rooms[h.room[i]].apt;

  it('kocioł stoi całą podstawą na klatce, z której prowadzą drzwi do naszego mieszkania', () => {
    const st = gra(w, seed, 't_wezel');
    const kotwice = allowedAnchors(st, w, 'kociol', 0);
    expect(kotwice.length).toBeGreaterThan(0);
    const klatki = new Set<number>();
    for (const a of kotwice) {
      const [x, y] = xy(w, a);
      for (const dx of [0, 1]) expect(rodzaj(a + dx), `${x},${y}`).toBe('klatka');
      klatki.add(h.room[a]);
    }
    // drzwi sąsiadujące z klatką i z pomieszczeniem naszego mieszkania
    const sasiedzi = (d: number) => [d - 1, d + 1, d - w.size, d + w.size].map((n) => h.room[n]).filter((r) => r >= 0);
    for (const kl of klatki) {
      const laczy = h.doors.some((d) => {
        const rs = sasiedzi(d);
        return rs.includes(kl) && rs.some((r) => h.rooms[r].apt === h.home);
      });
      expect(laczy, `klatka ${kl} bez drzwi do naszego mieszkania`).toBe(true);
    }
  });

  it('kocioł nie stanie w pokoju ani w przedpokoju mieszkania, mimo że to mieszkanie nasze', () => {
    const st = gra(w, seed, 't_wezel');
    const przedpokoj = h.room.findIndex((r, i) => r >= 0 && rodzaj(i) === 'przedpokoj' && apt(i) === h.home);
    const [x, y] = xy(w, przedpokoj);
    const c = canPlace(st, w, 'kociol', x, y, 0);
    expect(c.ok).toBe(false);
    expect(c.why).toBe('Tylko na klatce schodowej siedziby.');
    ustawJezyk('en');
    expect(canPlace(st, w, 'kociol', x, y, 0).why).toBe('Only in the HQ stairwell.');
  });

  it('pieczarkarnia stoi tylko w łazience naszego mieszkania', () => {
    const st = gra(w, seed, 't_grzyby');
    const kotwice = allowedAnchors(st, w, 'pieczarkarnia', 0);
    expect(kotwice.length).toBeGreaterThan(0);
    for (const a of kotwice) {
      expect(rodzaj(a)).toBe('lazienka');
      expect(apt(a)).toBe(h.home);
    }
    // łazienka cudzego mieszkania i kuchnia naszego: nie
    const cudza = h.room.findIndex((r, i) => r >= 0 && rodzaj(i) === 'lazienka' && apt(i) !== h.home);
    expect(canPlace(st, w, 'pieczarkarnia', ...xy(w, cudza), 0).ok).toBe(false);
    const kuchnia = h.room.findIndex((r, i) => r >= 0 && rodzaj(i) === 'kuchnia' && apt(i) === h.home);
    const c = canPlace(st, w, 'pieczarkarnia', ...xy(w, kuchnia), 0);
    expect(c.ok).toBe(false);
    expect(c.why).toBe('Tylko w łazience w naszym mieszkaniu.');
    ustawJezyk('en');
    expect(canPlace(st, w, 'pieczarkarnia', ...xy(w, kuchnia), 0).why).toBe('Only in the bathroom of your flat.');
  });

  it('koza z beczki nie stanie na planie, a obrót nie zmienia, czy wolno (rura skręca ku ścianie rot)', () => {
    const st = gra(w, seed, 't_kozy');
    const a = allowedAnchors(st, w, 'koza_beczka', 0)[0];
    const [x, y] = xy(w, a);
    for (const rot of [0, 1, 2, 3]) expect(canPlace(st, w, 'koza_beczka', x, y, rot).ok, `rot ${rot}`).toBe(true);
    const sim = new Sim(w, st);
    sim.push({ t: 'build', ids: [], kind: 'koza_beczka', x, y, rot: 0 });
    sim.step();
    expect(canPlace(st, w, 'koza_beczka', x, y, 0)).toEqual({ ok: false, why: 'Tu już jest plan budowy.' });
  });
});

describe('Zielonki (dom): kocioł w przedpokoju, pieczarkarnia w łazience', () => {
  const { w, seed } = zielonki;
  const h = houseOf(w)!;
  const rodzaj = (i: number) => h.rooms[h.room[i]].kind;

  it('w domu nie ma klatki, więc kocioł staje w przedpokoju naszego mieszkania', () => {
    expect(h.rooms.some((r) => r.kind === 'klatka')).toBe(false);
    const st = gra(w, seed, 't_wezel');
    const kotwice = allowedAnchors(st, w, 'kociol', 0);
    expect(kotwice.length).toBeGreaterThan(0);
    for (const a of kotwice) for (const dx of [0, 1]) expect(rodzaj(a + dx)).toBe('przedpokoj');
    // w pokoju i w łazience nie, z powodem „w przedpokoju”
    const pokoj = h.room.findIndex((r, i) => r >= 0 && rodzaj(i) === 'pokoj');
    const c = canPlace(st, w, 'kociol', ...xy(w, pokoj), 0);
    expect(c.ok).toBe(false);
    expect(c.why).toBe('Tylko w przedpokoju w naszym domu.');
    ustawJezyk('en');
    expect(canPlace(st, w, 'kociol', ...xy(w, pokoj), 0).why).toBe('Only in the hallway of your house.');
  });

  it('pieczarkarnia staje w łazience domu', () => {
    const st = gra(w, seed, 't_grzyby');
    const kotwice = allowedAnchors(st, w, 'pieczarkarnia', 0);
    expect(kotwice.length).toBeGreaterThan(0);
    for (const a of kotwice) expect(rodzaj(a)).toBe('lazienka');
  });
});

describe.each(DEMA)(
  'koza z beczki blisko okna, w pokoju, kuchni albo przedpokoju, nie w łazience: %s',
  (_nazwa, { w, seed }) => {
    const h = houseOf(w)!;
    const rodzaj = (i: number) => h.rooms[h.room[i]].kind;
    const apt = (i: number) => h.rooms[h.room[i]].apt;
    /** niezależnie od canPlace: okno ściany zewnętrznej w odległości najwyżej r kafelków (po współrzędnych) */
    const oknoW = (i: number, r: number) =>
      h.windows.some(
        (s) =>
          Math.max(Math.abs((s % w.size) - (i % w.size)), Math.abs(Math.floor(s / w.size) - Math.floor(i / w.size))) <=
          r,
      );
    const naszeKafelki = (rodzaje: readonly string[]) =>
      Array.from(h.room, (_r, i) => i).filter(
        (i) => h.room[i] >= 0 && rodzaje.includes(rodzaj(i)) && apt(i) === h.home && !w.blocked[i],
      );

    it('po badaniu jest co najmniej jedno miejsce, każde w naszym pokoju, kuchni albo przedpokoju i blisko okna', () => {
      const st = gra(w, seed, 't_kozy');
      const kotwice = allowedAnchors(st, w, 'koza_beczka', 0);
      expect(kotwice.length).toBeGreaterThan(0);
      for (const a of kotwice) {
        expect(['pokoj', 'kuchnia', 'przedpokoj'], `${a}`).toContain(rodzaj(a));
        expect(apt(a)).toBe(h.home);
        expect(oknoW(a, 2), `${a} bez okna w zasięgu`).toBe(true);
        expect(h.sklad.includes(a)).toBe(false);
      }
      expect(allowedAnchors(gra(w, seed), w, 'koza_beczka', 0)).toEqual([]);
    });

    it('w łazience odmowa, choć to nasze mieszkanie, z powodem w obu językach', () => {
      const st = gra(w, seed, 't_kozy');
      const lazienka = naszeKafelki(['lazienka']);
      expect(lazienka.length).toBeGreaterThan(0);
      for (const i of lazienka) expect(canPlace(st, w, 'koza_beczka', ...xy(w, i), 0).ok, `${i}`).toBe(false);
      const c = canPlace(st, w, 'koza_beczka', ...xy(w, lazienka[0]), 0);
      expect(c.why).toMatch(
        /^Tylko w pokoju, kuchni albo przedpokoju naszego (mieszkania|domu), najwyżej 2 m od okna\.$/,
      );
      ustawJezyk('en');
      expect(canPlace(st, w, 'koza_beczka', ...xy(w, lazienka[0]), 0).why).toMatch(
        /^Only in a room, the kitchen or the hallway of your (flat|house), within 2 m of a window\.$/,
      );
    });

    it('z dala od okna odmowa, także w pokoju, kuchni i przedpokoju naszego mieszkania', () => {
      const st = gra(w, seed, 't_kozy');
      const daleko = naszeKafelki(['pokoj', 'kuchnia', 'przedpokoj']).filter((i) => !oknoW(i, 3));
      // każde mieszkanie z dem ma jakiś kafelek poza zasięgiem okna (3 m: z zapasem nad 2 m)
      expect(daleko.length).toBeGreaterThan(0);
      for (const i of daleko) expect(canPlace(st, w, 'koza_beczka', ...xy(w, i), 0).ok, `${i}`).toBe(false);
    });
  },
);

describe.each(DEMA)('kafelek przed kozą zarządu zostaje wolny: %s', (_nazwa, { w, seed }) => {
  const h = houseOf(w)!;
  const koza = h.furniture.find((f) => f.kind === 'koza')!;
  /** kafelek, z którego się obsługuje kozę: strona przeciwna do ściany rot (0 ściana u góry, więc front pod kozą) */
  const [fx, fy] = [
    [koza.x, koza.y + koza.h],
    [koza.x - 1, koza.y],
    [koza.x, koza.y - 1],
    [koza.x + koza.w, koza.y],
  ][koza.rot];

  it('koza z beczki, kocioł i pieczarkarnia nie stają na froncie kozy zarządu, a miejsce na kozę z beczki zostaje', () => {
    const st = gra(w, seed, 't_kozy');
    const front = fy * w.size + fx;
    expect(canPlace(st, w, 'koza_beczka', fx, fy, 0).ok, 'front kozy zarządu').toBe(false);
    for (const rot of [0, 1, 2, 3]) expect(canPlace(st, w, 'koza_beczka', fx, fy, rot).ok, `rot ${rot}`).toBe(false);
    expect(allowedAnchors(st, w, 'koza_beczka', 0)).not.toContain(front);
    expect(allowedAnchors(st, w, 'koza_beczka', 0).length).toBeGreaterThan(0);
    // inna budowla z miejscem w mieszkaniu też go nie zajmie, jeśli jej podstawa go obejmuje
    const st2 = gra(w, seed);
    st2.techDone = Object.values(NOWE);
    for (const k of Object.keys(BUILDS) as BuildKind[])
      for (const rot of [0, 1, 2, 3] as const)
        for (const a of allowedAnchors(st2, w, k, rot)) {
          const b = footprint(k, rot);
          const [ax, ay] = xy(w, a);
          const pokrywa = fx >= ax && fx < ax + b.w && fy >= ay && fy < ay + b.h;
          expect(pokrywa, `${k} rot ${rot} na froncie kozy`).toBe(false);
        }
  });
});

describe('kocioł nie stoi na składzie drewna', () => {
  it('kafelek składu w klatce odrzuca kocioł, a po zdjęciu składu go przyjmuje', () => {
    const { w, seed } = przymorze;
    const h = houseOf(w)!;
    const st = gra(w, seed, 't_wezel');
    const a = allowedAnchors(st, w, 'kociol', 0)[0];
    const [x, y] = xy(w, a);
    expect(canPlace(st, w, 'kociol', x, y, 0)).toEqual({ ok: true });
    // skład drewna kładziemy chwilowo na drugim kafelku podstawy (generator trzyma go przy kozie, nie na klatce)
    h.sklad.push(a + 1);
    try {
      expect(canPlace(st, w, 'kociol', x, y, 0).ok).toBe(false);
      expect(allowedAnchors(st, w, 'kociol', 0)).not.toContain(a);
    } finally {
      h.sklad.pop();
    }
    expect(canPlace(st, w, 'kociol', x, y, 0)).toEqual({ ok: true });
  });
});

describe('opis technologii t_kozy mówi to samo co miejsce „okno”', () => {
  it('pokój, kuchnia albo przedpokój naszego mieszkania, blisko okna, w obu językach', () => {
    const op = TECH_BY.t_kozy.dzialanie;
    expect(op.pl).toContain('w pokoju, kuchni albo przedpokoju naszego mieszkania, blisko okna (rura przez okno)');
    expect(op.en).toContain('in a room, the kitchen or the hallway of your flat, close to a window');
  });
});

describe('wieża jest jedna', () => {
  it('druga odmowa przy stojącej i przy planie, z powodem w obu językach', () => {
    const { w, seed } = przymorze;
    const st = gra(w, seed, 't_wieza');
    const kotwice = allowedAnchors(st, w, 'wieza', 0);
    const [x, y] = xy(w, kotwice[0]);
    const [x2, y2] = xy(w, kotwice[kotwice.length - 1]);
    expect(canPlace(st, w, 'wieza', x2, y2, 0).ok).toBe(true);
    const sim = new Sim(w, st);
    sim.push({ t: 'build', ids: [], kind: 'wieza', x, y, rot: 0 });
    sim.step();
    expect(st.builds.map((b) => b.kind)).toEqual(['wieza']);
    expect(canPlace(st, w, 'wieza', x2, y2, 0)).toEqual({ ok: false, why: 'Wieża już stoi.' });
    ustawJezyk('en');
    expect(canPlace(st, w, 'wieza', x2, y2, 0).why).toBe('The tower already stands.');
  });
});

describe('plan kończy się stojącą budowlą', () => {
  /** zapas materiałów na podwórku (stosy w wolnych kafelkach) */
  function zapas(st: SimState, world: World, mats: Record<string, number>) {
    st.things = st.things.filter((t) => !['deski', 'zlom', 'czesci'].includes(t.kind));
    const wolne = world.fence.yard.filter(
      (i) => !st.things.some((t) => t.x === i % world.size && t.y === Math.floor(i / world.size)),
    );
    for (const [k, [kind, n]] of Object.entries(mats).entries())
      st.things.push({
        id: st.nextThing++,
        kind,
        x: wolne[k * 3] % world.size,
        y: Math.floor(wolne[k * 3] / world.size),
        w: 1,
        h: 1,
        rot: 0,
        n,
        fuel: 0,
        by: -1,
        owner: -1,
      });
  }

  for (const [nazwa, { w, seed }, k] of [
    ['kocioł na klatce', przymorze, 'kociol'],
    ['pieczarkarnia w łazience', przymorze, 'pieczarkarnia'],
    ['koza z beczki blisko okna', przymorze, 'koza_beczka'],
    ['koza z beczki w kuchni głębokiego mieszkania', lanciego, 'koza_beczka'],
    ['kocioł na klatce w głębokim mieszkaniu', lanciego, 'kociol'],
    ['koza z beczki w domu', zielonki, 'koza_beczka'],
    ['kocioł w przedpokoju domu', zielonki, 'kociol'],
    ['pieczarkarnia w łazience domu', zielonki, 'pieczarkarnia'],
  ] as const) {
    it(`${nazwa}: zarząd przynosi materiały, buduje i budowla stoi w swoim miejscu`, () => {
      const st = gra(w, seed, NOWE[k]);
      zapas(st, w, BUILDS[k].cost);
      const sim = new Sim(w, st);
      const [p] = st.pawns;
      const a = allowedAnchors(st, w, k, 0)[0];
      sim.push({ t: 'build', ids: [p.id], kind: k, x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
      for (let i = 0; i < 40000 && !st.things.some((t) => t.kind === k); i++) sim.step();
      const f = footprint(k, 0);
      expect(st.things.find((t) => t.kind === k)).toMatchObject({ x: a % w.size, y: Math.floor(a / w.size), ...f });
      expect(st.builds).toEqual([]);
    });
  }
});

describe('rysunki budowli', () => {
  const KINDS = [...RODZAJE, 'pracownia'] as const;
  type Sp = ReturnType<typeof buildSprite>;
  /** same widoczne piksele: sprite przycięty do prostokąta, w którym coś narysowano (zasieki w szerszej podstawie
      mają ten sam rysunek co w wąskiej, więc samo porównanie rozmiarów ich nie odróżni) */
  function przytnij(sp: Sp): { w: number; h: number; px: number[] } {
    let [x0, y0, x1, y1] = [sp.w, sp.h, -1, -1];
    for (let y = 0; y < sp.h; y++)
      for (let x = 0; x < sp.w; x++)
        if (sp.px[y * sp.w + x] >>> 24)
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    const px: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px.push(sp.px[y * sp.w + x]);
    return { w: x1 - x0 + 1, h: y1 - y0 + 1, px };
  }
  const zasieki = przytnij(buildSprite('zasieki', 0, 1));
  const rozne = (a: ReturnType<typeof przytnij>, b: ReturnType<typeof przytnij>) =>
    a.w !== b.w || a.h !== b.h || a.px.some((v, i) => v !== b.px[i]);

  it('kopia listy rodzajów w rysowaniu zgadza się z BUILDS: rodzaje, podstawy, GAME_KINDS', () => {
    expect([...BUILD_KINDS].sort()).toEqual((Object.keys(BUILDS) as BuildKind[]).sort());
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      expect(BUILD_BASE[k], k).toEqual([BUILDS[k].w, BUILDS[k].h]);
      expect(GAME_KINDS.has(k), k).toBe(true);
    }
  });

  it('nowe budowle i pracownia mają własny rysunek, różny od zasieków i od siebie nawzajem', () => {
    const sprity = KINDS.map((k) => [k, przytnij(buildSprite(k, 0, 1))] as const);
    for (const [k, sp] of sprity) {
      expect(
        sp.px.some((v) => v >>> 24 === 255),
        k,
      ).toBe(true);
      expect(sp.px.length, k).toBeGreaterThan(30 * 30);
      expect(rozne(sp, zasieki), `${k} jak zasieki`).toBe(true);
      for (const [k2, sp2] of sprity) if (k !== k2) expect(rozne(sp, sp2), `${k} jak ${k2}`).toBe(true);
    }
  });

  it('rozmiar sprite’a pasuje do podstawy, każde ustawienie i ziarno daje te same piksele przy tych samych argumentach', () => {
    for (const k of KINDS) {
      for (const rot of [0, 1, 2, 3] as const) {
        const a = buildSprite(k, rot, 3);
        const b = buildSprite(k, rot, 3);
        expect(a.px, `${k} rot ${rot}`).toEqual(b.px);
        const [bw, bh] = BUILD_BASE[k];
        // kotwica na środku dolnej krawędzi podstawy: podstawa mieści się w sprite'cie
        expect(a.w, k).toBeGreaterThanOrEqual((rot & 1 ? bh : bw) * 32);
        expect(a.ay, k).toBeLessThanOrEqual(a.h);
      }
    }
  });

  it('miniatury w menu: każda nowa budowla ma piksele i dłuższy bok w pudełku', () => {
    for (const k of KINDS) {
      const r = thumbPixels(rzeczSprite({ kind: k, rot: 0, seed: 1 }, null), 56)!;
      expect(r, k).not.toBeNull();
      expect(Math.max(r.w, r.h), k).toBe(56);
    }
  });
});
