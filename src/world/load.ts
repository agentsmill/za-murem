/* Wczytanie osiedla: demo offline z public/demo albo adres (Nominatim → kafelki OpenFreeMap,
   a gdy nie odpowiadają, Overpass). */

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
}

export interface DemoInfo {
  key: string;
  name: string;
  addr: string;
  label: string;
}

export async function loadDemo(key: string): Promise<Loaded> {
  const r = await fetch(`demo/${encodeURIComponent(key)}.json`);
  if (!r.ok) throw new Error(`Nie ma takiego przykładu: ${key}`);
  const d = await r.json();
  return { geo: d.geo, name: d.name, addr: d.addr, street: d.street, src: 'demo' };
}

export async function demoList(): Promise<DemoInfo[]> {
  const r = await fetch('demo/index.json');
  return r.ok ? r.json() : [];
}

export async function loadAddress(q: string, status: (s: string) => void): Promise<Loaded> {
  status('Szukam adresu…');
  const g = await geocode(q);
  const where = g.label.split(',').slice(0, 3).join(',');
  status(`Jest: ${where}. Pobieram mapę…`);
  let geo: Geo;
  let src: Loaded['src'] = 'mvt';
  try {
    geo = await loadTiles(g.lat, g.lon, LOAD_RADIUS, (m) => status(`Jest: ${where}. ${m}`));
  } catch (e) {
    console.warn('kafelki', e);
    status(`Jest: ${where}. Serwer kafelków nie odpowiada, pytam serwer Overpass. To bywa wolne, czasem pół minuty.`);
    const json = (await overpass(g.lat, g.lon, LOAD_RADIUS, status)) as Parameters<typeof toGeo>[0];
    geo = toGeo(json, g.lat, g.lon);
    src = 'overpass';
  }
  if (geo.b.length < 4)
    throw new Error('W tym miejscu OpenStreetMap prawie nie ma budynków. Spróbujcie adresu w środku osiedla.');
  return { geo, name: g.area || g.street || q, addr: g.label, street: g.street, src };
}
