/* Dema offline z kafelków testowych (tests/fixtures/mvt) do public/demo (katalog zmienia ZM_DEMA_WYJSCIE, dla testów):
   - <klucz>.json z gotową geometrią osiedla i index.json: gra wczytuje je bez sieci (przycisk przykładu, ?demo=…,
     zrzuty). Do 19.10.2026 zatwierdzone dema były świadomie starsze od toGeoT (bez zm:klucz, zm:os, kluczy miejsc i
     rodzajów punktów; geometria ta sama); po przegenerowaniu (`--przegeneruj`, gałąź dema-przegenerowane) mają je,
     a dwa budynki dem mają wygląd urzędu (komisariat na Przymorzu, Zarząd Dróg w Batowicach). Skrypt przepisuje je
     nadal tylko, gdy ich nie ma albo gdy podano --przegeneruj, żeby zmiana importera nie zmieniała ich po cichu
     (zmienia skróty botów z --mieszkancy i wyglądy budynków, więc po niej przypnij nowe skróty w
     tests/unit/kwadraty-dema.test.ts i mieszkancy-generuj.test.ts).
   - <klucz>-kwadraty.json z geo ośmiu sąsiednich kwadratów domu (N, NE, E, SE, S, SW, W, NW; miasto z kwadratów, etap 1)
     z kafelków testowych: gra pobiera je tylko przy ?kwadraty=… (loadDemoKwadraty w src/world/load.ts). Plik większy niż
     1,5 MB zostawia cztery boczne kwadraty (N, E, S, W). Pliki sąsiadów powstają zawsze od nowa i są deterministyczne.
   Uruchomienie: npm run demos [-- --przegeneruj] */

import fs from 'node:fs';
import path from 'node:path';
import { kluczKwadratu, sasiedzi8 } from '../src/world/kwadraty.ts';
import { toGeoT } from '../src/world/mvt.ts';
import { LOAD_RADIUS } from '../src/world/world.ts';
import { ADDRESSES, decodedTiles, geoKwadratuTestowego } from '../tests/unit/fixtures.ts';

const OUT = process.env.ZM_DEMA_WYJSCIE
  ? path.resolve(process.env.ZM_DEMA_WYJSCIE)
  : path.resolve(import.meta.dirname, '../public/demo');
const PRZEGENERUJ = process.argv.includes('--przegeneruj');
/** największy plik sąsiadów (bajty): powyżej zostają cztery boczne kwadraty */
const LIMIT_PLIKU = 1_500_000;
fs.mkdirSync(OUT, { recursive: true });

const META: Record<string, { name: string; street: string; addr: string }> = {
  przymorze: { name: 'Przymorze Wielkie', street: 'Obrońców Wybrzeża', addr: 'Obrońców Wybrzeża 2, Gdańsk' },
  lanciego: { name: 'Ursynów Północny', street: 'Lanciego', addr: 'Lanciego 10G, Warszawa' },
  zielonki: { name: 'Batowice', street: 'Spacerowa', addr: 'Spacerowa 10, Zielonki' },
};

const kb = (bajty: number) => (bajty / 1024).toFixed(0);
/** sąsiedzi o parzystych miejscach listy N, NE, E, SE, S, SW, W, NW, czyli N, E, S, W */
const boczni = () => sasiedzi8(0, 0).filter((_, i) => i % 2 === 0);

const index: { key: string; name: string; addr: string; label: string }[] = [];
for (const a of ADDRESSES) {
  const m = META[a.key];
  const file = path.join(OUT, `${a.key}.json`);
  if (PRZEGENERUJ || !fs.existsSync(file)) {
    const geo = toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS);
    const data = { key: a.key, ...m, label: a.label, lat: a.lat, lon: a.lon, geo };
    fs.writeFileSync(file, JSON.stringify(data));
    console.log(
      `${a.key}: ${geo.b.length} budynków, ${geo.r.length} dróg, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`,
    );
  } else console.log(`${a.key}: bez zmian (${kb(fs.statSync(file).size)} KB; --przegeneruj przepisuje)`);
  index.push({ key: a.key, name: m.name, addr: m.addr, label: a.label });

  // sąsiedzi: osiem kwadratów, a gdy plik przekroczy limit, cztery boczne
  const kwadraty = (lista: [number, number][]) =>
    JSON.stringify(Object.fromEntries(lista.map(([x, y]) => [kluczKwadratu(x, y), geoKwadratuTestowego(a, x, y)])));
  let tekst = kwadraty(sasiedzi8(0, 0));
  let ile = 8;
  if (Buffer.byteLength(tekst) > LIMIT_PLIKU) {
    tekst = kwadraty(boczni());
    ile = 4;
  }
  const plik = `${a.key}-kwadraty.json`;
  fs.writeFileSync(path.join(OUT, plik), tekst);
  console.log(`${plik}: ${ile} kwadratów, ${kb(Buffer.byteLength(tekst))} KB`);
}
const indexPlik = path.join(OUT, 'index.json');
if (PRZEGENERUJ || !fs.existsSync(indexPlik)) fs.writeFileSync(indexPlik, JSON.stringify(index, null, 1));
