/* Pomocniki testów etapu 1 pięter: świat demo z flagą `pietra` (osobny cache na klucz i flagę). Świat buduje jak
   `demoWorld` z sasiedzi-pomoc.ts: to samo ziarno z adresu i ulica z geokodera. Bez flagi wynik jest taki jak zawsze. */

import fs from 'node:fs';
import path from 'node:path';
import { hashString } from '../../src/core/rng.ts';
import { type BuildOpts, buildWorld, type World } from '../../src/world/world.ts';

const swiaty = new Map<string, World>();

/** świat demo z ziarnem z adresu; `pietra` włącza widok pięter (przy false opcji nie ma wcale) */
export function demoSwiat(key: 'przymorze' | 'lanciego' | 'zielonki', pietra: boolean): World {
  const klucz = `${key}:${pietra}`;
  let w = swiaty.get(klucz);
  if (!w) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const opts: BuildOpts = {
      seed: Number.parseInt(hashString(d.addr), 16) || 2051,
      street: d.street,
      ...(pietra ? { pietra: true } : {}),
    };
    w = buildWorld(d.geo, opts);
    swiaty.set(klucz, w);
  }
  return w;
}
