/* Mieszkańcy siedziby w wejściu zarządu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja „Mieszkańcy
   widoczni dla zarządu”, „Wejście”): `GovInput.lokatorzy` to pionki `resident` z osobą z generatora mieszkańców,
   w kolejności pionków, z polami `GovLokator` i bez nich nic więcej (nie ma ani historii, ani odnośnika, ani nastrojów);
   sąsiedzi (`sasiad`) i mieszkańcy bez osoby się nie liczą. Bez generatora pole w wejściu nie istnieje, a host oddaje
   pustą listę, więc przebiegi bez mieszkańców z adresu zostają takie jak przed zmianą. `GovHost.lokator(id)` szuka
   po id osoby i oddaje tę samą osobę co lista. Przymorze z dema i tabele z public/data/mieszkancy/ (atrapa `fetch`
   czyta pliki, jak w lokatorzy-sim.test.ts), a zarząd i host na prawdziwym odczycie symulacji. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { makeHost } from '../../src/gov/wydarzenia.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../../src/sim/osiedle.ts';
import { createSim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

const POLA = [
  'age',
  'asleep',
  'f',
  'first',
  'id',
  'inside',
  'name',
  'needs',
  'pawn',
  'prof',
  'skills',
  'tile',
  'traits',
] as const;

const demo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo/przymorze.json'), 'utf8')) as {
  geo: Parameters<typeof mapaMieszkancow>[0];
  addr: string;
  street: string;
};
const seed = Number.parseInt(hashString(demo.addr), 16) || 2051;

/** gra z mieszkańcami z generatora (jak w grze: świat z tagami, stany mieszkań siedziby, opcja `mieszkancy`) */
let zGeneratorem: { w: World; st: SimState };
/** ta sama siedziba bez generatora: mieszkańcy bez osób */
let bezGeneratora: { w: World; st: SimState };

beforeAll(async () => {
  const dane = await wczytajDaneMieszkancow(demo.geo.c[0], demo.geo.c[1], plikowy);
  if (!dane) throw new Error('brak tabel mieszkańców dla przymorza');
  const geo = mapaMieszkancow(demo.geo, dane);
  const w = buildWorld(geo, { seed, street: demo.street });
  const l = mieszkancyNowejGry(w, geo, dane, 4);
  if (!l) throw new Error('generator mieszkańców nie dał wyniku dla przymorza');
  zGeneratorem = { w, st: createSim(w, seed, { core: 4, mieszkancy: opcjaMieszkancow(l) }) };
  const w0 = buildWorld(demo.geo, { seed, street: demo.street });
  bezGeneratora = { w: w0, st: createSim(w0, seed, { core: 4 }) };
}, 60_000);

/** imiona mieszkańców siedziby z osobą, prosto ze stanu, w kolejności pionków */
const imionaZeStanu = (st: SimState): string[] =>
  st.pawns.filter((p) => p.kind === 'resident' && p.person >= 0).map((p) => st.people[p.person].name);

describe('GovInput.lokatorzy', () => {
  it('govInput z mieszkańcami z generatora podaje ich imiona', () => {
    const { w, st } = zGeneratorem;
    const lok = govInput(st, w, 0).lokatorzy;
    const imiona = imionaZeStanu(st);
    expect(imiona.length).toBeGreaterThan(0);
    expect(lok?.map((l) => l.name)).toEqual(imiona);
    // w kolejności pionków, z numerem pionka i id osoby z generatora (inne niż id zarządu)
    const pionki = st.pawns.filter((p) => p.kind === 'resident' && p.person >= 0);
    expect(lok?.map((l) => l.pawn)).toEqual(pionki.map((p) => p.id));
    expect(lok?.map((l) => l.id)).toEqual(pionki.map((p) => st.people[p.person].id));
    const zarzad = new Set(st.pawns.filter((p) => p.kind === 'core').map((p) => st.people[p.person].id));
    for (const l of lok ?? []) expect(zarzad.has(l.id)).toBe(false);
  });

  it('osoba ma dokładnie pola GovLokator, bez historii, odnośnika i nastrojów, i jest kopią', () => {
    const { w, st } = zGeneratorem;
    const lok = govInput(st, w, 0).lokatorzy ?? [];
    expect(lok.length).toBeGreaterThan(0);
    const snap = snapshot(st, w).lokatorzy;
    for (const l of lok) {
      expect(Object.keys(l).sort()).toEqual([...POLA]);
      const s = snap.find((x) => x.pawn === l.pawn)!;
      expect(l).toEqual({
        pawn: s.pawn,
        id: s.id,
        name: s.name,
        first: s.first,
        f: s.f,
        age: s.age,
        prof: s.prof,
        skills: s.skills,
        traits: s.traits,
        needs: s.needs,
        asleep: s.asleep,
        inside: s.inside,
        tile: s.tile,
      });
    }
    // zmiana w wejściu nie rusza stanu symulacji
    const przed = hashString(JSON.stringify(st));
    lok[0].skills.med = 9;
    lok[0].traits.push('x');
    lok[0].needs.food = -1;
    expect(hashString(JSON.stringify(st))).toBe(przed);
  });

  it('sąsiad z osobą i mieszkaniec bez osoby nie wchodzą do wejścia zarządu', () => {
    const { w } = zGeneratorem;
    const st = structuredClone(zGeneratorem.st);
    const pionki = st.pawns.filter((p) => p.kind === 'resident' && p.person >= 0);
    expect(pionki.length).toBeGreaterThan(2);
    const sasiad = pionki[0];
    const bezOsoby = pionki[1];
    sasiad.kind = 'sasiad';
    bezOsoby.person = -1;
    const lok = govInput(st, w, 0).lokatorzy ?? [];
    expect(lok.map((l) => l.pawn)).toEqual(pionki.slice(2).map((p) => p.id));
    // odczyt dla interfejsu dalej ma sąsiada (karta do odczytu), zarząd go nie widzi
    expect(snapshot(st, w).lokatorzy.some((l) => l.pawn === sasiad.id)).toBe(true);
  });

  it('bez generatora lokatorzy to brak pola, a host oddaje pustą listę', () => {
    const { w, st } = bezGeneratora;
    expect(imionaZeStanu(st)).toEqual([]);
    const i = govInput(st, w, 0);
    expect(i.lokatorzy).toBeUndefined();
    expect('lokatorzy' in i).toBe(false);
    const host = makeHost(newGov(seed), i, emptyEffects());
    expect(host.lokatorzy()).toEqual([]);
    expect(host.lokator('s5')).toBeNull();
  });

  it('wejście zarządu nie zmienia stanu symulacji ani wyniku applyGov', () => {
    const { w, st } = zGeneratorem;
    const przed = hashString(JSON.stringify(st));
    govInput(st, w, 0);
    expect(hashString(JSON.stringify(st))).toBe(przed);
    applyGov(st, w, emptyEffects());
    expect(imionaZeStanu(st).length).toBeGreaterThan(0);
  });
});

describe('GovHost.lokatorzy i lokator', () => {
  it('host.lokator(id) zwraca tę samą osobę co lista, a nieznane id i zarząd to null', () => {
    const { w, st } = zGeneratorem;
    const i = govInput(st, w, 0);
    const host = makeHost(newGov(seed), i, emptyEffects());
    const lista = host.lokatorzy();
    expect(lista).toEqual(i.lokatorzy);
    expect(lista.length).toBeGreaterThan(0);
    for (const l of lista) expect(host.lokator(l.id)).toEqual(l);
    expect(host.lokator('nie ma takiego')).toBeNull();
    // zarząd to nie lokatorzy: jego osoby host.spec zna, host.lokator nie
    expect(host.lokator(i.people[0].id)).toBeNull();
  });

  it('host oddaje kopie: zmiana listy albo osoby nie rusza wejścia ani kolejnego odczytu', () => {
    const { w, st } = zGeneratorem;
    const i = govInput(st, w, 0);
    const host = makeHost(newGov(seed), i, emptyEffects());
    const przed = structuredClone(i.lokatorzy);
    const lista = host.lokatorzy();
    lista[0].name = 'Ktoś Inny';
    lista[0].skills.med = 9;
    lista.pop();
    host.lokator(i.lokatorzy![1].id)!.needs.food = -5;
    expect(i.lokatorzy).toEqual(przed);
    expect(host.lokatorzy()).toEqual(przed);
  });
});
