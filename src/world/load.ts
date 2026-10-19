/* Wczytanie osiedla: demo offline z public/demo albo adres (Nominatim → kafelki OpenFreeMap,
   a gdy nie odpowiadają, Overpass). Komunikaty dla gracza (status i błędy) są w bieżącym języku; dane osiedla nie
   zależą od języka (Nominatim zawsze po polsku, bo z adresu liczy się ziarno i klucz imion). Dema mają też
   sąsiednie kwadraty miasta (loadDemoKwadraty, tylko przy ?kwadraty=). */

import { L } from '../core/jezyk.ts';
import type { Geo } from './geo.ts';
import { load as loadTiles } from './mvt.ts';
import { geocode, overpass, toGeo } from './osm.ts';
import { LOAD_RADIUS } from './world.ts';

export interface Loaded {
  geo: Geo;
  name: string;
  addr: string;
  street: string;
  src: 'demo' | 'mvt' | 'overpass';
  /** klucz dema (public/demo/<klucz>.json) dla src „demo”: z niego idzie plik sąsiednich kwadratów */
  key?: string;
}

export interface DemoInfo {
  key: string;
  name: string;
  addr: string;
  label: string;
}

export async function loadDemo(key: string): Promise<Loaded> {
  const r = await fetch(`demo/${encodeURIComponent(key)}.json`);
  if (!r.ok) throw new Error(L(`Nie ma takiego przykładu: ${key}`, `No such example: ${key}.`));
  const d = await r.json();
  return { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo', key };
}

/** Geo sąsiednich kwadratów dema (klucz kwadratu „sx,sy” → geo, zob. kwadraty.ts): osiem albo, gdy plik przekroczyłby
    1,5 MB, cztery boczne (Lanciego), z public/demo/<klucz>-kwadraty.json (tools/make-demos.ts). Plik pobiera się tylko
    przy ?kwadraty=…; dema w grze nie mają innych sąsiadów niż te z kafelków testowych. Brak pliku to błąd. */
export async function loadDemoKwadraty(key: string): Promise<Record<string, Geo>> {
  const r = await fetch(`demo/${encodeURIComponent(key)}-kwadraty.json`);
  if (!r.ok)
    throw new Error(L(`Nie ma sąsiednich kwadratów przykładu: ${key}`, `No neighbouring squares for example: ${key}.`));
  return r.json();
}

export async function demoList(): Promise<DemoInfo[]> {
  const r = await fetch('demo/index.json');
  return r.ok ? r.json() : [];
}

export async function loadAddress(q: string, status: (s: string) => void): Promise<Loaded> {
  status(L('Szukam adresu…', 'Looking up the address…'));
  const g = await geocode(q);
  const where = g.label.split(',').slice(0, 3).join(',');
  status(L(`Jest: ${where}. Pobieram mapę…`, `Found: ${where}. Downloading the map…`));
  let geo: Geo;
  let src: Loaded['src'] = 'mvt';
  try {
    geo = await loadTiles(g.lat, g.lon, LOAD_RADIUS, (m) => status(L(`Jest: ${where}. ${m}`, `Found: ${where}. ${m}`)));
  } catch (e) {
    console.warn('kafelki', e);
    status(
      L(
        `Jest: ${where}. Serwer kafelków nie odpowiada, pytam serwer Overpass. To bywa wolne, czasem pół minuty.`,
        `Found: ${where}. The tile server isn’t answering, asking Overpass instead. That can be slow, sometimes half a minute.`,
      ),
    );
    const json = (await overpass(g.lat, g.lon, LOAD_RADIUS, status)) as Parameters<typeof toGeo>[0];
    geo = toGeo(json, g.lat, g.lon);
    src = 'overpass';
  }
  if (geo.b.length < 4)
    throw new Error(
      L(
        'W tym miejscu OpenStreetMap prawie nie ma budynków. Spróbujcie adresu w środku osiedla.',
        'OpenStreetMap has hardly any buildings here. Try an address in the middle of an estate.',
      ),
    );
  return { geo, name: g.area || g.street || q, addr: g.label, street: g.street, src };
}
