/* Odczyt dla dróg zwycięstwa (src/sim/gov.ts, src/sim/osiedle.ts): `govInput` podaje ludność pod zarządem (`ludnosc`:
   zarząd i mieszkańcy) i liczbę budynków, które wspólny płot dołączył do naszego obwodu (`teren.przylaczone`, ze stanu
   `SimState.plot`), a `ludnoscSpisu2021` liczy z generatora mieszkańców, ilu ludzi mieszkało w kwadracie domu w 2021
   roku (z tego zarząd bierze cel drogi ludnościowej). Ludność na atrapie bloku, płot na świeżym świecie Lanciego tym
   samym przebiegiem co w plot.test.ts (otoczenie zmienia świat w miejscu, więc świat jest własny), 2021 na trzech
   demach i tabelach z public/ (atrapa `fetch` czyta pliki). Odczyt niczego nie zmienia: skrót symulacji zostaje. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { celLudnosci, krokZwyciestwa, ludnoscOf, wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { budynkiObszaru } from '../../src/mieszkancy/generuj.ts';
import { marginesyDla } from '../../src/mieszkancy/rejon.ts';
import { obsadzBudynek } from '../../src/mieszkancy/spis.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { ludnoscSpisu2021, mapaMieszkancow } from '../../src/sim/osiedle.ts';
import { kosztPlotu, plotDla } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { core, until } from './sasiedzi-pomoc.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');

// ---------------------------------------------------------------- ludność pod zarządem

describe('ludność pod zarządem w odczycie', () => {
  const w = mockBlockM2();
  const admit = (st: SimState, residents: number) => {
    const fx = emptyEffects();
    fx.residents = residents;
    applyGov(st, w, fx);
  };

  it('to zarząd i mieszkańcy z tego samego odczytu, tyle samo co ludnoscOf bez pola', () => {
    const st = createSim(w, 3, { core: 3 });
    const i = govInput(st, w, 0);
    expect(i.people).toHaveLength(3);
    expect(typeof i.residents).toBe('number');
    expect(i.ludnosc).toBe(i.people.length + (i.residents ?? 0));
    expect(ludnoscOf(i)).toBe(ludnoscOf({ ...i, ludnosc: undefined }));
  });

  it('przyjęci zwiększają ludność, a odchodzący mieszkańcy i członek zarządu ją zmniejszają', () => {
    const st = createSim(w, 3, { core: 3 });
    const start = govInput(st, w, 0).ludnosc!;
    admit(st, 5);
    const po = govInput(st, w, 0);
    expect(po.ludnosc).toBe(start + 5);
    expect(po.ludnosc).toBe(po.people.length + (po.residents ?? 0));
    admit(st, -2);
    expect(govInput(st, w, 0).ludnosc).toBe(start + 3);
    const odejscie = emptyEffects();
    odejscie.leave = [po.people[0].id];
    applyGov(st, w, odejscie);
    const koniec = govInput(st, w, 0);
    expect(koniec.people).toHaveLength(2);
    expect(koniec.ludnosc).toBe(start + 2);
  });

  it('odczyt niczego nie zmienia w stanie symulacji', () => {
    const st = createSim(w, 3, { core: 3 });
    const sim = new Sim(w, st);
    for (let k = 0; k < 200; k++) sim.step();
    const skrot = sim.hash();
    govInput(st, w, 0);
    govInput(st, w, 12, 'Obrońców Wybrzeża 4');
    expect(sim.hash()).toBe(skrot);
  });
});

// ---------------------------------------------------------------- teren: budynki za wspólnym płotem

/** świeży świat dema (bez pamięci: wspólny płot zmienia w nim siatkę), jak w plot.test.ts */
function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** gra na świeżym świecie Lanciego z otwartym 10F i materiałem na płot na podwórku, jak `graZPlotem` w plot.test.ts */
function graZPlotem(seed = 5) {
  const w = swiezy('lanciego');
  const sim = new Sim(w, createSim(w, seed, { core: 4 }));
  const b = w.buildings.find((x) => x.name === 'Blok nr 10F')!;
  const p = core(sim)[0];
  p.weapon = 'lom';
  const door = b.entrances[0].tile;
  for (const t of ['open', 'force'] as const) {
    sim.push({ t, ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door', 8000);
    if (sim.st.sasiedzi?.budynki.find((x) => x.bid === b.id)?.otwarty) break;
  }
  const r = plotDla(sim.st, w, b.id);
  if (!r?.ok) throw new Error('10F bez płotu');
  // materiał na podwórku: sterty po 10 na wolnych kafelkach przy drzwiach siedziby
  const { need } = kosztPlotu(r);
  const proto = sim.st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
  const free = w.fence.yard.filter((i) => !w.blocked[i] && !sim.st.things.some((t) => t.y * w.size + t.x === i));
  let k = 0;
  for (const [m, n] of Object.entries(need) as [string, number][])
    for (let left = n + 4; left > 0; left -= 10) {
      const i = free[k++];
      sim.st.things.push({
        ...proto,
        id: sim.st.nextThing++,
        kind: m,
        x: i % w.size,
        y: Math.floor(i / w.size),
        n: Math.min(10, left),
        by: -1,
      });
    }
  return { w, sim, b, p };
}

/** buduje płot do końca (po przerwaniu przez potrzeby polecenie jeszcze raz), jak `buduj` w plot.test.ts */
function buduj(sim: Sim, bid: number, p: ReturnType<typeof core>[number]) {
  sim.push({ t: 'enclose', ids: [p.id], bid });
  sim.step();
  for (let n = 0; n < 60_000 && !sim.st.plot?.bids.includes(bid); n++) {
    sim.step();
    if (n % 400 === 0 && sim.st.plot?.plan && p.job?.t !== 'plot' && !sim.st.cmds.length)
      sim.push({ t: 'enclose', ids: [p.id], bid });
  }
}

describe('teren w odczycie: budynki, które wspólny płot dołączył do obwodu', () => {
  it('przed płotem 0, w trakcie budowy nadal 0, po zbudowaniu wokół 10F 1; to samo widzi droga terenu', () => {
    const { w, sim, b, p } = graZPlotem();
    expect(sim.st.plot).toBeUndefined();
    const przed = govInput(sim.st, w, 0);
    expect(przed.teren).toEqual({ przylaczone: 0 });

    // droga terenu: zarząd z włączonymi drogami nie zalicza kamienia, dopóki płotu nie ma
    const gov = newGov(1);
    wlaczZwyciestwo(gov);
    krokZwyciestwa(gov, przed, emptyEffects());
    expect(gov.zwyciestwo!.kamienie.teren).toBeUndefined();

    // plan płotu w toku to jeszcze nie płot: nikt nie został dołączony
    sim.push({ t: 'enclose', ids: [p.id], bid: b.id });
    sim.step();
    expect(sim.st.plot?.plan?.bid).toBe(b.id);
    expect(sim.st.plot?.bids).toEqual([]);
    expect(govInput(sim.st, w, 0).teren).toEqual({ przylaczone: 0 });

    buduj(sim, b.id, p);
    expect(sim.st.plot?.bids).toEqual([b.id]);
    const skrot = sim.hash();
    const po = govInput(sim.st, w, 0);
    expect(po.teren).toEqual({ przylaczone: 1 });
    expect(sim.hash()).toBe(skrot);
    // ludność w tym samym odczycie dalej zarząd i mieszkańcy
    expect(po.ludnosc).toBe(po.people.length + (po.residents ?? 0));

    // pierwszy kamień drogi „Za Murem” wpada raz, z tego odczytu
    const fx = emptyEffects();
    krokZwyciestwa(gov, po, fx);
    expect(gov.zwyciestwo!.kamienie.teren).toBe(1);
    expect(fx.log.map((l) => l.pl)).toContain('Droga „Za Murem”: Pierwszy sąsiad za płotem.');
    krokZwyciestwa(gov, govInput(sim.st, w, 0), emptyEffects());
    expect(gov.zwyciestwo!.kamienie.teren).toBe(1);

    // zapis i wczytanie na świeżym świecie: płot dalej dołącza ten sam budynek
    const w2 = swiezy('lanciego');
    const kopia = new Sim(w2, JSON.parse(JSON.stringify(sim.st)) as SimState);
    expect(govInput(kopia.st, w2, 0).teren).toEqual({ przylaczone: 1 });
  });

  it('stan bez pola plot (nowa gra, zapis sprzed płotu) i z pustą listą to 0, a każdy otoczony budynek to jeden', () => {
    const w = swiezy('lanciego');
    const st = createSim(w, 5, { core: 4 });
    expect(st.plot).toBeUndefined();
    expect(govInput(st, w, 0).teren).toEqual({ przylaczone: 0 });
    st.plot = { bids: [] };
    expect(govInput(st, w, 0).teren).toEqual({ przylaczone: 0 });
    st.plot.bids.push(3, 7);
    expect(govInput(st, w, 0).teren).toEqual({ przylaczone: 2 });
  });
});

// ---------------------------------------------------------------- ludność z 2021 roku

const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
type NazwaDema = (typeof DEMA)[number];

const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

const dema = new Map<NazwaDema, { geo: Geo; dane: DaneMieszkancow }>();
const demo = (n: NazwaDema) => dema.get(n)!;

beforeAll(async () => {
  for (const n of DEMA) {
    const s = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${n}.json`), 'utf8')) as { geo: Geo };
    const dane = await wczytajDaneMieszkancow(s.geo.c[0], s.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${n}`);
    dema.set(n, { geo: s.geo, dane });
  }
});

afterEach(() => vi.restoreAllMocks());

/** osoby spisu 2021 po budynkach obszaru, liczone osobno od funkcji gry */
function osobyZeSpisu({ geo, dane }: { geo: Geo; dane: DaneMieszkancow }): number {
  const { gmina, kraj } = dane;
  return budynkiObszaru(geo, gmina, kraj).reduce(
    (a, b) => a + obsadzBudynek(b, gmina ? marginesyDla(gmina, b.rejon) : kraj.polska, gmina, kraj).osoby.length,
    0,
  );
}

describe('ludność kwadratu domu w 2021 roku', () => {
  it('to osoby ze spisu wszystkich budynków mieszkalnych obszaru, na trzech demach', () => {
    for (const n of DEMA) {
      const ludzie = ludnoscSpisu2021(demo(n).geo, demo(n).dane);
      expect(ludzie, n).toBe(osobyZeSpisu(demo(n)));
      expect(Number.isInteger(ludzie) && ludzie! > 0, n).toBe(true);
      // gra liczy z mapy z tagami budynków generatora (main.ts: mapaMieszkancow): ta sama liczba
      expect(ludnoscSpisu2021(mapaMieszkancow(demo(n).geo, demo(n).dane), demo(n).dane), n).toBe(ludzie);
    }
  });

  it('bez gminy (szablon krajowy) też liczy, z marginesów Polski', () => {
    for (const n of DEMA) {
      const bezGminy = { geo: demo(n).geo, dane: { ...demo(n).dane, gmina: null } };
      const ludzie = ludnoscSpisu2021(bezGminy.geo, bezGminy.dane);
      expect(ludzie, n).toBe(osobyZeSpisu(bezGminy));
      expect(Number.isInteger(ludzie) && ludzie! > 0, n).toBe(true);
    }
  });

  it('cel drogi ludnościowej z tych liczb: bloki sięgają górnej granicy, wieś jest między granicami', () => {
    const cel = (n: NazwaDema, mode: 'zwykly' | 'zombie') =>
      celLudnosci({ ludnosc2021: ludnoscSpisu2021(demo(n).geo, demo(n).dane) }, mode);
    for (const n of ['przymorze', 'lanciego'] as const) {
      expect(cel(n, 'zwykly'), n).toBe(500);
      expect(cel(n, 'zombie'), n).toBe(250);
    }
    expect(cel('zielonki', 'zwykly')).toBeGreaterThanOrEqual(120);
    expect(cel('zielonki', 'zwykly')).toBeLessThanOrEqual(500);
    expect(cel('zielonki', 'zombie')).toBe(Math.round(cel('zielonki', 'zwykly') / 2));
  });

  it('deterministyczna i niczego nie zmienia w mapie', () => {
    const { geo, dane } = demo('lanciego');
    const przed = hashString(JSON.stringify(geo));
    const a = ludnoscSpisu2021(geo, dane);
    expect(ludnoscSpisu2021(geo, dane)).toBe(a);
    expect(hashString(JSON.stringify(geo))).toBe(przed);
  });

  it('bez tabel, bez budynków mieszkalnych i po wyjątku: nic, a gra bierze cel jak bez danych', () => {
    const { geo, dane } = demo('zielonki');
    expect(ludnoscSpisu2021(geo, null)).toBeUndefined();
    expect(ludnoscSpisu2021({ ...geo, b: [] }, dane)).toBeUndefined();
    const ostrzezenie = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(ludnoscSpisu2021(geo, { ...dane, kraj: null as never })).toBeUndefined();
    expect(ostrzezenie).toHaveBeenCalledTimes(1);
    expect(celLudnosci({ ludnosc2021: undefined }, 'zwykly')).toBe(250);
  });
});
