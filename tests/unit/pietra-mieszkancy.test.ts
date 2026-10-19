/* Mieszkańcy z flagą pięter i bez niej (docs/superpowers/specs/2026-10-18-pietra-design.md, „Wysokości budynków”):
   awans domów do dwóch kondygnacji zmienia `WorldBuilding.levels`, ale generator mieszkańców czyta surowe tagi
   (`levelsOf` w src/mieszkancy/budynki.ts), więc gospodarstwa i kroniki budynków z danych zostają te same. Testem
   sprawdzamy to na trzech demach, tą drogą co gra (tabele z public/, tagi `zm:bud`, `zrodloLokatorow` dla sąsiadów
   i `lokatorzyGry` dla siedziby). */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { TAG_BUDYNKU } from '../../src/mieszkancy/oznacz.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { lokatorzyGry, zrodloLokatorow } from '../../src/sim/lokatorzy.ts';
import { mapaMieszkancow } from '../../src/sim/osiedle.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;

/** `fetch` dla wczytajDaneMieszkancow: ścieżka względna to plik w public/, brak pliku to 404 */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

interface Osiedle {
  geo: Geo;
  dane: DaneMieszkancow;
  bez: World;
  z: World;
}
const osiedla = new Map<string, Osiedle>();

beforeAll(async () => {
  for (const n of DEMA) {
    const d = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${n}.json`), 'utf8')) as {
      geo: Geo;
      addr: string;
      street: string;
    };
    const dane = await wczytajDaneMieszkancow(d.geo.c[0], d.geo.c[1], plikowy);
    if (!dane) throw new Error(`brak danych mieszkańców dla ${n}`);
    // mapa z tagami generatora, ziarno z adresu jak w grze (main.ts); ten sam geo dla obu światów
    const geo = mapaMieszkancow(d.geo, dane);
    const opts = { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street };
    osiedla.set(n, { geo, dane, bez: buildWorld(geo, opts), z: buildWorld(geo, { ...opts, pietra: true }) });
  }
});

describe.each(DEMA)('mieszkańcy z flagą pięter i bez: %s', (n) => {
  it('gospodarstwa sąsiednich budynków z danych są identyczne', () => {
    const { geo, dane, bez, z } = osiedla.get(n)!;
    const bezLok = zrodloLokatorow(bez, geo, dane);
    const zLok = zrodloLokatorow(z, geo, dane);
    let zDanych = 0;
    let zLokatorami = 0;
    let awansowane = 0;
    for (const b of bez.buildings) {
      // budynek z danych generatora (tag zm:bud); zapasowe (bez tagu) czytają `levels` ze świata, więc tu ich nie ma
      if (b.id === bez.hq || b.tags[TAG_BUDYNKU] === undefined) continue;
      zDanych++;
      if (z.buildings[b.id].levels !== b.levels) awansowane++;
      const oczekiwany = bezLok(b.id);
      if (oczekiwany) zLokatorami++;
      expect(zLok(b.id), `budynek ${b.id} (${b.cls}, ${b.levels} kondygnacji bez flagi)`).toEqual(oczekiwany);
    }
    expect(zDanych).toBeGreaterThan(0);
    // bez gospodarstw do porównania test niczego by nie sprawdzał (budynki bez mieszkań dają null po obu stronach)
    expect(zLokatorami).toBeGreaterThan(0);
    // Zielonki: awans zmienia połowę domów, więc test sprawdza także budynki, których `levels` się różni
    if (n === 'zielonki') expect(awansowane).toBeGreaterThan(0);
  });

  it('siedziba: zarząd, lokatorzy i stany mieszkań są identyczne', () => {
    const { geo, dane, bez, z } = osiedla.get(n)!;
    const wynik = lokatorzyGry(bez, geo, dane, { core: 4 });
    expect(wynik).not.toBeNull();
    expect(wynik?.zarzad.length).toBeGreaterThan(0);
    expect(lokatorzyGry(z, geo, dane, { core: 4 })).toEqual(wynik);
  });
});
