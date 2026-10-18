/* Opcja `mieszkancy` w createSim (krok 5): zarząd i mieszkańcy siedziby z osobami z generatora mieszkańców
   (src/sim/lokatorzy.ts). Na trzech demach z public/demo/ i tabelach z public/data/mieszkancy/ (atrapa `fetch` czyta
   pliki), jak w lokatorzy.test.ts: imiona zarządu z generatora, mieszkańcy z osobą i `ref`, odczyt `lokatorzy`, zgon
   z imieniem, drużyna wygrywa z generatorem, osoby mieszkańców bez losowań z ziarna symulacji, pierwsza doba w obu
   trybach bez błędu, zapis sprzed kroku 5 (mieszkańcy bez osób) wczytuje się na świecie z kroku 5. Że bez opcji stan
   jest jak przed zmianą, pilnują przypięte skróty w druzyna-sim.test.ts i sim.test.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { losujDruzyne, type OsobaDruzyny, osobaDoGry } from '../../src/content/druzyna.ts';
import type { Person } from '../../src/content/people.ts';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { ackReport, chooseEvent, confirmNight, govUpdate, newGov, pending, signLaw } from '../../src/gov/zarzad.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import { wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { type LokatorzyGry, lokatorzyGry, type OsobaGry } from '../../src/sim/lokatorzy.ts';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { readSave, worldKey, writeSave } from '../../src/ui/zapis.ts';
import { applyApts, settleApts } from '../../src/world/apts.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type NazwaDema = (typeof DEMA)[number];
const MODES: GameMode[] = ['zwykly', 'zombie'];

/** Atrapa `fetch`: ścieżka względna to plik w public/, brak pliku to 404 (jak w lokatorzy.test.ts). */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

interface Demo {
  /** dane demo bez tagów generatora (świat sprzed kroku 5) */
  surowe: { geo: Geo; addr: string; name: string; street: string };
  seed: number;
  /** świat z kroku 5: geo z `zm:bud`, stany mieszkań siedziby z generatora (`applyApts`) */
  world: World;
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
    const surowe = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as Demo['surowe'];
    const dane = await wczytajDaneMieszkancow(surowe.geo.c[0], surowe.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
    const geo = oznaczGeo(surowe.geo, budynkiZCzlonkami(surowe.geo, dane.gmina, dane.kraj));
    // ziarno jak w grze (main.ts): z adresu, to samo dla świata i symulacji
    const seed = Number.parseInt(hashString(surowe.addr), 16) || 2051;
    const world = buildWorld(geo, { seed, street: surowe.street });
    const wynik = lokatorzyGry(world, geo, dane, { core: 4 });
    if (!wynik) throw new Error(`lokatorzyGry dało null dla ${nazwa}`);
    applyApts(world, settleApts(world, wynik.stany));
    dema.set(nazwa, { surowe, seed, world, wynik });
  }
});

afterEach(() => vi.restoreAllMocks());

/** opcja dla createSim z wyniku generatora */
const opcja = (l: LokatorzyGry) => ({ zarzad: l.zarzad, lokatorzy: l.lokatorzy });
const z = (nazwa: NazwaDema, extra: Parameters<typeof createSim>[2] = {}): SimState => {
  const { world, seed, wynik } = demo(nazwa);
  return createSim(world, seed, { core: 4, mieszkancy: opcja(wynik), ...extra });
};
const mieszkancy = (st: SimState): Pawn[] => st.pawns.filter((p) => p.kind === 'resident');
const zOsoba = (st: SimState): Pawn[] => mieszkancy(st).filter((p) => p.person >= 0);
const sumaOsob = (l: Pick<LokatorzyGry, 'lokatorzy'>): number => l.lokatorzy.reduce((a, m) => a + m.osoby.length, 0);
/** pola osoby gry, które przychodzą z generatora (`rodzina` i `story` tylko niepuste) */
const POLA = ['first', 'name', 'f', 'prof', 'skills', 'age', 'traits', 'story', 'ref', 'rodzina'] as const;
const polaOsoby = (p: Person | OsobaGry): Record<string, unknown> => {
  const r = p as unknown as Record<string, unknown>;
  return Object.fromEntries(POLA.filter((k) => r[k] !== undefined && r[k] !== '').map((k) => [k, r[k]]));
};

describe('zarząd z generatora', () => {
  it('pierwsze osoby zarządu mają dane i ref z generatora, w kolejności miejsc; id, dom i pionki zostają', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const st = z(nazwa);
      expect(
        st.pawns.filter((p) => p.kind === 'core'),
        nazwa,
      ).toHaveLength(4);
      const n = Math.min(4, wynik.zarzad.length);
      expect(n, nazwa).toBeGreaterThan(0);
      for (let k = 0; k < n; k++) {
        expect(polaOsoby(st.people[k]), `${nazwa} ${k}`).toEqual(polaOsoby(wynik.zarzad[k]));
        expect(st.people[k].id).toBe(`s${k + 1}`);
        expect(st.people[k].home).toBe(world.hq);
      }
      // zarządu z generatora mniej niż miejsc (Zielonki: 2 z 4): reszta z losowania z adresu, bez ref
      for (let k = n; k < 4; k++) expect(st.people[k].ref, `${nazwa} ${k}`).toBeUndefined();
    }
    expect(demo('zielonki').wynik.zarzad.length).toBeLessThan(4);
  });

  it('osoby w stanie to kopie: zmiana stanu nie rusza wyniku generatora', () => {
    const { wynik } = demo('przymorze');
    const przed = structuredClone(wynik);
    const st = z('przymorze');
    for (const p of st.people) {
      p.skills.med = 9;
      p.traits.push('x');
    }
    expect(wynik).toEqual(przed);
  });

  it('drużyna wygrywa z generatorem: jej osoby bez ref, rodziny i historii z generatora', () => {
    for (const nazwa of DEMA) {
      const team = losujDruzyne(mulberry(nazwa.length * 7), 3);
      // osoba bez historii: historia z generatora nie może zostać pod cudzym imieniem
      team[2] = { ...team[2], story: '' };
      const st = z(nazwa, { team });
      expect(
        st.pawns.filter((p) => p.kind === 'core'),
        nazwa,
      ).toHaveLength(3);
      team.forEach((o, k) => {
        const p = st.people[k] as unknown as Record<string, unknown>;
        const pola = Object.fromEntries(
          ['first', 'name', 'f', 'prof', 'skills', 'age', 'traits', 'story']
            .filter((f) => f in p)
            .map((f) => [f, p[f]]),
        );
        expect(pola, `${nazwa} ${k}`).toEqual(osobaDoGry(o));
        expect('ref' in p, `${nazwa} ${k}`).toBe(false);
        expect('rodzina' in p, `${nazwa} ${k}`).toBe(false);
      });
      expect('story' in st.people[2]).toBe(false);
    }
  });

  it('osoba drużyny ze złymi danymi zostaje osobą z generatora', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { wynik } = demo('przymorze');
    const team: OsobaDruzyny[] = losujDruzyne(mulberry(3), 4);
    team[1] = { ...team[1], skills: { bud: 9 } };
    const st = z('przymorze', { team });
    expect(console.warn).toHaveBeenCalledOnce();
    expect(polaOsoby(st.people[1])).toEqual(polaOsoby(wynik.zarzad[1]));
    expect(st.people[0].ref).toBeUndefined();
  });
});

describe('mieszkańcy siedziby z osobami', () => {
  it('pionek mieszkańca dostaje kolejną osobę z listy swojego mieszkania; kogo zabrakło, zostaje bez osoby', () => {
    for (const nazwa of DEMA) {
      const { world, wynik } = demo(nazwa);
      const st = z(nazwa);
      const wziete = new Map<number, number>();
      for (const p of mieszkancy(st)) {
        const lista = wynik.lokatorzy.find((m) => m.apt === p.apt)?.osoby ?? [];
        const k = wziete.get(p.apt) ?? 0;
        wziete.set(p.apt, k + 1);
        if (k >= lista.length) {
          expect(p.person, `${nazwa} pionek ${p.id}`).toBe(-1);
          continue;
        }
        const o = st.people[p.person];
        expect(polaOsoby(o), `${nazwa} pionek ${p.id}`).toEqual(polaOsoby(lista[k]));
        expect(o.home).toBe(world.hq);
        expect(o).toMatchObject({ assign: null, sick: false, dead: false, gone: false });
      }
      // osoby są po zarządzie, id kolejne i różne
      const ids = st.people.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(st.people.map((_, k) => `s${k + 1}`));
      expect(st.people).toHaveLength(4 + zOsoba(st).length);
      expect(st.nextId).toBe(st.people.length + 1);
    }
    expect(zOsoba(z('przymorze')).length).toBeGreaterThan(0);
    expect(zOsoba(z('lanciego')).length).toBeGreaterThan(0);
  });

  it('każdy mieszkaniec z osobą ma ref', () => {
    for (const nazwa of DEMA) {
      const st = z(nazwa);
      for (const p of zOsoba(st)) expect(st.people[p.person].ref, `${nazwa} ${p.id}`).toMatch(/\S/);
    }
  });

  it('domyślnie mieszkańców najwyżej tylu, ilu osób w lokatorzy, i nie więcej niż bez opcji; residents wygrywa', () => {
    for (const nazwa of DEMA) {
      const { world, seed, wynik } = demo(nazwa);
      const bez = mieszkancy(createSim(world, seed, { core: 4 })).length;
      expect(mieszkancy(z(nazwa)).length, nazwa).toBe(Math.min(bez, sumaOsob(wynik)));
    }
    const { wynik } = demo('przymorze');
    // tylko dwie osoby w lokatorzy: dwóch mieszkańców, obaj z osobami
    const dwie = wynik.lokatorzy.map((m) => ({ ...m, osoby: [] as OsobaGry[] }));
    const pierwsze = wynik.lokatorzy.find((m) => m.osoby.length >= 2)!;
    dwie[wynik.lokatorzy.indexOf(pierwsze)].osoby = pierwsze.osoby.slice(0, 2);
    const st = z('przymorze', { mieszkancy: { zarzad: wynik.zarzad, lokatorzy: dwie } });
    expect(mieszkancy(st)).toHaveLength(2);
    // jawna liczba mieszkańców wygrywa z domyślną
    expect(mieszkancy(z('przymorze', { residents: 8 }))).toHaveLength(8);
  });

  it('mieszkanie z pustą listą osób: jego mieszkańcy zostają bez osób', () => {
    const { wynik } = demo('przymorze');
    const st0 = z('przymorze');
    const apt = mieszkancy(st0)[0].apt;
    const lokatorzy = wynik.lokatorzy.map((m) => (m.apt === apt ? { ...m, osoby: [] } : m));
    const st = z('przymorze', { mieszkancy: { zarzad: wynik.zarzad, lokatorzy }, residents: 7 });
    const tam = mieszkancy(st).filter((p) => p.apt === apt);
    expect(tam.length).toBeGreaterThan(0);
    for (const p of tam) expect(p.person).toBe(-1);
    expect(zOsoba(st).length).toBeGreaterThan(0);
  });

  it('osoby mieszkańców nie zużywają losowań: przy tej samej liczbie mieszkańców reszta stanu jak bez opcji', () => {
    for (const nazwa of DEMA)
      for (const mode of MODES) {
        const { world, seed } = demo(nazwa);
        const n = mieszkancy(z(nazwa, { mode })).length;
        const st = z(nazwa, { mode, residents: n });
        const ref = createSim(world, seed, { core: 4, mode, residents: n });
        const bezOsob = (s: SimState) => ({
          ...s,
          people: [],
          nextId: 0,
          pawns: s.pawns.map((p) => ({ ...p, person: p.kind === 'resident' ? -1 : p.person })),
        });
        expect(bezOsob(st), `${nazwa} ${mode}`).toEqual(bezOsob(ref));
        expect(ref.people).toHaveLength(4);
      }
  });
});

describe('odczyt i zarząd', () => {
  it('snapshot: people tylko zarząd, lokatorzy to mieszkańcy z osobą z ref i rodziną', () => {
    for (const nazwa of DEMA) {
      const { world } = demo(nazwa);
      const st = z(nazwa);
      const s = snapshot(st, world);
      const core = st.pawns.filter((p) => p.kind === 'core');
      expect(
        s.people.map((p) => p.pawn),
        nazwa,
      ).toEqual(core.map((p) => p.id));
      expect(
        s.lokatorzy.map((p) => p.pawn),
        nazwa,
      ).toEqual(zOsoba(st).map((p) => p.id));
      for (const p of s.lokatorzy) {
        const pawn = st.pawns.find((q) => q.id === p.pawn)!;
        const o = st.people[pawn.person];
        expect(p).toMatchObject({ id: o.id, name: o.name, first: o.first, f: o.f, age: o.age, ref: o.ref });
        expect(p.rodzina).toBe(o.rodzina);
        expect(p.story).toBe(o.story);
        expect(p.weapon).toBeNull();
        expect(p.post).toBeNull();
      }
      // osoby zarządu z generatora też niosą ref
      expect(s.people[0].ref, nazwa).toBe(st.people[0].ref);
      // zwykły JSON: bez pól undefined
      expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s);
      // zarząd widzi tylko zarząd
      expect(govInput(st, world, 0).people.map((p) => p.id)).toEqual(core.map((p) => st.people[p.person].id));
    }
    expect(snapshot(z('przymorze'), demo('przymorze').world).lokatorzy.length).toBeGreaterThan(0);
  });

  it('bez opcji snapshot().lokatorzy jest pusty, a osoby nie mają ref', () => {
    const { world, seed } = demo('przymorze');
    const st = createSim(world, seed, { core: 4 });
    expect(snapshot(st, world).lokatorzy).toEqual([]);
    expect(st.people.some((p) => 'ref' in p || 'rodzina' in p)).toBe(false);
    expect(mieszkancy(st).every((p) => p.person === -1)).toBe(true);
  });

  it('zabity mieszkaniec z osobą ma imię we wpisie zgonu, a zarząd liczy go jako mieszkańca', () => {
    for (const nazwa of ['przymorze', 'lanciego'] as const) {
      const { world } = demo(nazwa);
      const st = z(nazwa);
      const sim = new Sim(world, st);
      const p = zOsoba(st)[0];
      const o = st.people[p.person];
      sim.wound(p, 1000);
      expect(st.dead!.at(-1), nazwa).toMatchObject({ id: '', name: o.name, kind: 'resident', cause: 'rany' });
      // śmierć sąsiada z imieniem boli zarząd
      const core = st.pawns.find((q) => q.kind === 'core')!;
      expect(
        core.moods.some((m) => m.why === `Śmierć: ${o.first}`),
        nazwa,
      ).toBe(true);
      // dla zarządu to zgon mieszkańca (bez id), nie kogoś z zarządu
      expect(govInput(st, world, 0).dead!.at(-1)).toMatchObject({ id: '', name: o.name });
      sim.step();
      expect(st.pawns.includes(p)).toBe(false);
    }
  });

  it('zabity mieszkaniec bez osoby zostaje „Mieszkańcem”', () => {
    const { world } = demo('przymorze');
    const st = z('przymorze');
    const sim = new Sim(world, st);
    const p = mieszkancy(st).find((q) => q.person < 0)!;
    sim.wound(p, 1000);
    expect(st.dead!.at(-1)).toMatchObject({ id: '', name: 'Mieszkaniec', kind: 'resident' });
  });
});

/** pierwsza doba z zarządem: decyzje domyślne (karta nocy z propozycją, uchwała bez podpisu, wydarzenie pierwszą
    możliwą odpowiedzią), jak w druzyna-sim.test.ts */
function doba(w: World, st: SimState, seed: number, mode: GameMode) {
  const sim = new Sim(w, st);
  const gov = newGov(seed, mode);
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    if (st.tick % TICKS_PER_SECOND) continue;
    const s = st.tick / TICKS_PER_SECOND;
    applyGov(st, w, govUpdate(gov, govInput(st, w, s)));
    if (gov.over) break;
    for (let k = 0; k < 5; k++) {
      const i = govInput(st, w, s);
      const p = pending(gov, i);
      if (!p) break;
      if (p.k === 'raport') ackReport(gov, i);
      else if (p.k === 'uchwala') applyGov(st, w, signLaw(gov, i, null));
      else if (p.k === 'wydarzenie')
        applyGov(
          st,
          w,
          chooseEvent(
            gov,
            i,
            Math.max(
              0,
              p.choices.findIndex((c) => c.ok),
            ),
          ),
        );
      else applyGov(st, w, confirmNight(gov, i));
    }
  }
  return { sim, gov };
}

describe('pierwsza doba z mieszkańcami z generatora', () => {
  for (const nazwa of DEMA)
    for (const mode of MODES)
      it(`${nazwa}, tryb ${mode}: doba z zarządem bez błędu, osoby zostają`, () => {
        const { world, seed } = demo(nazwa);
        const st = z(nazwa, { mode });
        const imiona = zOsoba(st).map((p) => st.people[p.person].name);
        const { sim, gov } = doba(world, st, seed, mode);
        expect(st.tick).toBe(TICKS_PER_DAY);
        expect(gov.over ?? null).toBeNull();
        const s = snapshot(st, world);
        // mieszkańcy z osobą dalej w odczycie (w trybie zombie ktoś mógł zginąć, nowych osób nie ma)
        expect(s.lokatorzy.length).toBe(zOsoba(st).length);
        for (const p of s.lokatorzy) expect(imiona).toContain(p.name);
        expect(s.people.length).toBeGreaterThan(0);
        expect(sim.hash()).toMatch(/^[0-9a-f]{8}$/);
      });

  it('ten sam przebieg dwa razy i po zapisie w połowie', () => {
    const { world, seed } = demo('lanciego');
    const a = new Sim(world, z('lanciego'));
    for (let k = 0; k < 4 * TICKS_PER_HOUR; k++) a.step();
    const b = new Sim(world, z('lanciego'));
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) b.step();
    const c = new Sim(world, JSON.parse(JSON.stringify(b.st)) as SimState);
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) c.step();
    expect(c.hash()).toBe(a.hash());
    expect(createSim(world, seed, { core: 4, mieszkancy: opcja(demo('lanciego').wynik) })).toEqual(z('lanciego'));
  });
});

describe('zapis sprzed kroku 5', () => {
  /** pamięć przeglądarki na mapie (Storage w kształcie, którego używa zapis gry) */
  const pamiec = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  for (const mode of MODES)
    it(`tryb ${mode}: stan bez osób mieszkańców z zapisu gry działa na świecie z kroku 5`, () => {
      for (const nazwa of DEMA) {
        const { surowe, seed, world } = demo(nazwa);
        // gra sprzed kroku 5: świat bez tagów i stanów z generatora, symulacja bez opcji, kilka godzin gry
        const stary = buildWorld(surowe.geo, { seed, street: surowe.street });
        const sim0 = new Sim(stary, createSim(stary, seed, { core: 4, mode }));
        for (let k = 0; k < 3 * TICKS_PER_HOUR; k++) sim0.step();
        const mag = pamiec();
        const data = {
          geo: surowe.geo,
          name: surowe.name,
          addr: surowe.addr,
          street: surowe.street,
          src: 'demo' as const,
        };
        const ok = writeSave(
          { v: 1, at: 0, data, seed, sim: sim0.st, gov: newGov(seed, mode), screen: 0, world: worldKey(stary) },
          mag,
        );
        expect(ok).toBe(true);
        const zapis = readSave(mag);
        expect(zapis, nazwa).not.toBeNull();
        // odcisk świata ten sam, więc gra wznawia zapis zamiast zaczynać od nowa
        expect(zapis!.world, nazwa).toBe(worldKey(world));
        const st = zapis!.sim;
        expect(
          mieszkancy(st).every((p) => p.person === -1),
          nazwa,
        ).toBe(true);
        const sim = new Sim(world, st);
        for (let k = 0; k < TICKS_PER_DAY; k++) sim.step();
        const s = snapshot(st, world);
        expect(s.lokatorzy, nazwa).toEqual([]);
        expect(
          s.people.every((p) => p.ref === undefined),
          nazwa,
        ).toBe(true);
        expect(
          mieszkancy(st).every((p) => p.person === -1),
          nazwa,
        ).toBe(true);
      }
    });
});
