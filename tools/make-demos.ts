/* Dema offline: z kafelków testowych (tests/fixtures/mvt) robi public/demo/<klucz>.json
   z gotową geometrią osiedla. Gra wczytuje je bez sieci (przycisk przykładu, ?demo=…, zrzuty).
   Uruchomienie: npm run demos */

import fs from 'node:fs';
import path from 'node:path';
import { toGeoT } from '../src/world/mvt.ts';
import { LOAD_RADIUS } from '../src/world/world.ts';
import { ADDRESSES, decodedTiles } from '../tests/unit/fixtures.ts';

const OUT = path.resolve(import.meta.dirname, '../public/demo');
fs.mkdirSync(OUT, { recursive: true });

const META: Record<string, { name: string; street: string; addr: string }> = {
  przymorze: { name: 'Przymorze Wielkie', street: 'Obrońców Wybrzeża', addr: 'Obrońców Wybrzeża 2, Gdańsk' },
  lanciego: { name: 'Ursynów Północny', street: 'Lanciego', addr: 'Lanciego 10G, Warszawa' },
  zielonki: { name: 'Batowice', street: 'Spacerowa', addr: 'Spacerowa 10, Zielonki' },
};

const index: { key: string; name: string; addr: string; label: string }[] = [];
for (const a of ADDRESSES) {
  const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
  const m = META[a.key];
  const data = { key: a.key, ...m, label: a.label, lat: a.lat, lon: a.lon, geo };
  const file = path.join(OUT, `${a.key}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
  index.push({ key: a.key, name: m.name, addr: m.addr, label: a.label });
  console.log(
    `${a.key}: ${geo.b.length} budynków, ${geo.r.length} dróg, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`,
  );
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
