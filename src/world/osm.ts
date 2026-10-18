/* Dane z OpenStreetMap: geokodowanie (Nominatim), Overpass jako zapas, kategorie miejsc
   i osiedle zapasowe. Przeniesione z js/osm.js (0.3); rasteryzacja jest nowa (raster.ts). Komunikaty dla gracza
   w bieżącym języku; nazwy miejsc i osiedle zapasowe zostają polskie, bo to dane świata. */

import { FOODSHOP } from '../content/data.ts';
import { L } from '../core/jezyk.ts';
import { mulberry } from '../core/rng.ts';
import type { AreaKind, Geo, Pt } from './geo.ts';
import { pikselZ, tagiKlucza } from './klucze.ts';
import { kluczPunktu } from './miasto.ts';

const ENDPOINTS: [string, number][] = [
  ['https://overpass-api.de/api/interpreter', 35000],
  ['https://overpass.private.coffee/api/interpreter', 35000],
  ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 35000],
];
const AM =
  'school|kindergarten|clinic|doctors|pharmacy|hospital|library|bank|fire_station|police|townhall|marketplace|post_office|fuel|place_of_worship|community_centre';

/** zapytanie Overpass: budynki i teren w promieniu R, sklepy i usługi do 700 m */
export function query(lat: number, lon: number, R: number): string {
  const a = `(around:${R},${lat},${lon})`;
  const b = `(around:700,${lat},${lon})`;
  return `[out:json][timeout:30];(way["building"]${a};way["highway"]${a};way["landuse"]${a};way["leisure"]${a};way["natural"]${a};way["amenity"="parking"]${a};way["waterway"]${a};node["shop"]${b};node["amenity"~"${AM}"]${b};way["shop"]${b};way["amenity"~"${AM}"]${b};);out geom qt;`;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
  area: string;
  street: string;
  city: string;
}

export async function geocode(q: string): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=pl&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok)
    throw new Error(
      L(`Wyszukiwarka adresów odpowiedziała błędem ${r.status}`, `The address search answered with error ${r.status}.`),
    );
  const j = await r.json();
  if (!j.length)
    throw new Error(
      L(
        'Nie znalazłem takiego adresu. Spróbuj z miastem, np. „Wołoska 12, Warszawa”.',
        'Couldn’t find that address. Try adding the town, e.g. “Wołoska 12, Warszawa”.',
      ),
    );
  const a = j[0].address || {};
  const area = a.neighbourhood || a.quarter || a.suburb || a.city_district || a.village || a.town || a.city || '';
  return {
    lat: +j[0].lat,
    lon: +j[0].lon,
    label: j[0].display_name,
    area,
    street: a.road || '',
    city: a.city || a.town || a.village || '',
  };
}

export async function overpass(lat: number, lon: number, R: number, onStatus?: (s: string) => void): Promise<unknown> {
  let last: unknown;
  for (const [ep, ms] of ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), ms);
      const r = await fetch(ep, {
        method: 'POST',
        body: `data=${encodeURIComponent(query(lat, lon, R))}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      onStatus?.(
        L('Serwer map nie odpowiada, próbuję zapasowego…', 'The map server isn’t answering, trying a backup…'),
      );
    }
  }
  throw last || new Error(L('Brak połączenia z serwerami map.', 'No connection to the map servers.'));
}

export function poiCat(t: Record<string, unknown>): string | null {
  const s = t.shop as string | undefined;
  const a = t.amenity as string | undefined;
  if (s) {
    if (s === 'vacant') return null;
    if (FOODSHOP.has(s)) return 'spozywczy';
    if (s === 'chemist' || s === 'medical_supply') return 'apteka';
    if (
      [
        'doityourself',
        'hardware',
        'car_repair',
        'car_parts',
        'trade',
        'paint',
        'tools',
        'bathroom_furnishing',
        'building_materials',
        'car',
      ].includes(s)
    )
      return 'budowlany';
    if (['electronics', 'mobile_phone', 'computer', 'appliance', 'hifi', 'electrical'].includes(s))
      return 'elektronika';
    if (['clothes', 'shoes', 'second_hand', 'fabric', 'bag', 'boutique'].includes(s)) return 'ubrania';
    if (['garden_centre', 'florist', 'agrarian'].includes(s)) return 'ogrodnik';
    return 'sklep';
  }
  if (a) {
    if (a === 'pharmacy') return 'apteka';
    if (['clinic', 'doctors', 'hospital', 'dentist'].includes(a)) return 'przychodnia';
    if (a === 'school' || a === 'kindergarten') return 'szkola';
    if (a === 'library') return 'biblioteka';
    if (a === 'bank') return 'bank';
    if (a === 'fuel') return 'stacja';
    if (a === 'place_of_worship') return 'kosciol';
    if (['townhall', 'post_office', 'police', 'fire_station', 'community_centre', 'marketplace'].includes(a))
      return 'urzad';
  }
  return null;
}

export function areaKind(t: Record<string, string>): AreaKind | null {
  if (t.amenity === 'parking') return 'parking';
  const l = t.landuse;
  const le = t.leisure;
  const n = t.natural;
  if (n === 'water' || l === 'reservoir' || l === 'basin') return 'water';
  if (n === 'wood' || n === 'scrub' || l === 'forest') return 'wood';
  if (l === 'allotments') return 'allot';
  if (le === 'playground') return 'play';
  if (le === 'pitch' || le === 'sports_centre' || le === 'track') return 'pitch';
  if (
    le === 'park' ||
    le === 'garden' ||
    l === 'grass' ||
    l === 'meadow' ||
    l === 'village_green' ||
    l === 'recreation_ground' ||
    n === 'grassland'
  )
    return 'park';
  if (l === 'garages') return 'parking';
  return null;
}

/** tagi budynku zostawiane przy imporcie; start_date (data budowy) czyta generator mieszkańców */
const KEEP = [
  'building',
  'building:levels',
  'name',
  'addr:street',
  'addr:housenumber',
  'shop',
  'amenity',
  'start_date',
];

interface OverpassElement {
  type: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Overpass JSON -> lekka geometria w metrach względem środka */
export function toGeo(json: { elements?: OverpassElement[] }, lat0: number, lon0: number): Geo {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const rd = (v: number) => Math.round(v * 2) / 2;
  const P = (la: number, lo: number): Pt => [rd((lo - lon0) * kx), rd((lat0 - la) * ky)];
  const geo: Geo = { c: [lat0, lon0], b: [], r: [], a: [], w: [], poi: [] };
  for (const el of json.elements || []) {
    const t = el.tags || {};
    if (el.type === 'node') {
      const c = poiCat(t);
      if (c) {
        const [x, y] = P(el.lat!, el.lon!);
        geo.poi.push({ x, y, c, n: t.name || '', k: kluczPunktu(...pikselZ(el.lat!, el.lon!)) });
      }
      continue;
    }
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map((g) => P(g.lat, g.lon));
    if (pts.length < 2) continue;
    if (t.building) {
      const tags: Record<string, string> = {};
      for (const k of KEEP) if (t[k]) tags[k] = t[k];
      // identyfikator OSM budynku: droga (w) i jej numer
      if (el.id !== undefined) tags.id = `w${el.id}`;
      // klucz budynku i oś klatek jak z kafelków: wierzchołki zaokrąglone do siatki pikseli kafelków (klucze.ts)
      const kl = tagiKlucza([el.geometry.map((g) => pikselZ(g.lat, g.lon).map(Math.round) as Pt)]);
      if (kl) Object.assign(tags, kl);
      geo.b.push({ p: pts, t: tags });
      continue;
    }
    if (t.highway) {
      geo.r.push({ l: pts, h: t.highway });
      // przejście przez budynek (nowe w 0.4): wytniemy je w budynku po rasteryzacji
      if (t.tunnel === 'building_passage' || t.covered === 'yes') (geo.pass ||= []).push({ l: pts, h: t.highway });
      continue;
    }
    if (t.waterway) {
      geo.w.push({ l: pts });
      continue;
    }
    const k = areaKind(t);
    if (k && pts.length >= 3) geo.a.push({ p: pts, k });
    const c = poiCat(t);
    if (c) {
      let sx = 0;
      let sy = 0;
      for (const [x, y] of pts) {
        sx += x;
        sy += y;
      }
      // klucz ze środka wierzchołków w stopniach (przed zaokrągleniem do 0,5 m), jak dla węzła
      let la = 0;
      let lo = 0;
      for (const g of el.geometry) {
        la += g.lat;
        lo += g.lon;
      }
      const k = kluczPunktu(...pikselZ(la / el.geometry.length, lo / el.geometry.length));
      geo.poi.push({ x: rd(sx / pts.length), y: rd(sy / pts.length), c, n: t.name || '', k });
    }
  }
  return geo;
}

/** Osiedle zapasowe, kiedy nie ma sieci albo OSM nie odpowiada (R: promień mapy w metrach) */
export function genProc(seed: number, R: number): Geo {
  const rnd = mulberry(seed || 2051);
  const geo: Geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [], proc: true };
  const rect = (x: number, y: number, w: number, h: number): Pt[] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  geo.r.push({
    l: [
      [-R, -150],
      [R, -150],
    ],
    h: 'secondary',
  });
  geo.r.push({
    l: [
      [-120, -R],
      [-120, R],
    ],
    h: 'tertiary',
  });
  geo.r.push({
    l: [
      [140, -150],
      [140, R],
    ],
    h: 'residential',
  });
  geo.r.push({
    l: [
      [-120, 10],
      [140, 10],
    ],
    h: 'living_street',
  });
  geo.r.push({
    l: [
      [-120, 115],
      [140, 115],
    ],
    h: 'service',
  });
  geo.r.push({
    l: [
      [140, 60],
      [R, 60],
    ],
    h: 'residential',
  });
  geo.r.push({
    l: [
      [-R, 60],
      [-120, 60],
    ],
    h: 'residential',
  });
  for (let x = -100; x <= 120; x += 55)
    geo.r.push({
      l: [
        [x, -140],
        [x, 220],
      ],
      h: 'footway',
    });
  const blocks: [number, number, number, number][] = [];
  const tryAdd = (x: number, y: number, w: number, h: number, lv: number) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (
      Math.abs(cy + 150) < h / 2 + 12 ||
      Math.abs(cx + 120) < w / 2 + 10 ||
      Math.abs(cx - 140) < w / 2 + 10 ||
      Math.abs(cy - 10) < h / 2 + 8 ||
      Math.abs(cy - 115) < h / 2 + 6
    )
      return;
    for (const b of blocks)
      if (x < b[0] + b[2] + 8 && x + w + 8 > b[0] && y < b[1] + b[3] + 8 && y + h + 8 > b[1]) return;
    blocks.push([x, y, w, h]);
    geo.b.push({
      p: rect(x, y, w, h),
      t: {
        building: 'apartments',
        'building:levels': String(lv),
        'addr:street': 'Osiedlowa',
        'addr:housenumber': String(blocks.length),
      },
    });
  };
  for (let i = 0; i < 40; i++) {
    const tower = rnd() < 0.3;
    const horiz = rnd() < 0.55;
    const w = tower ? 22 : horiz ? 50 + rnd() * 30 : 13;
    const h = tower ? 22 : horiz ? 13 : 50 + rnd() * 30;
    tryAdd(
      Math.round(-210 + rnd() * 400),
      Math.round(-130 + rnd() * 330),
      Math.round(w),
      Math.round(h),
      tower ? 11 : rnd() < 0.5 ? 4 : 10,
    );
  }
  geo.b.push({ p: rect(-40, -132, 44, 18), t: { building: 'retail', name: 'Pawilon Handlowy' } });
  geo.poi.push(
    { x: -30, y: -123, c: 'spozywczy', n: 'Sklep Społem' },
    { x: -10, y: -123, c: 'apteka', n: '' },
    { x: 0, y: -123, c: 'sklep', n: '' },
  );
  geo.b.push({ p: rect(160, 130, 60, 32), t: { building: 'school', name: 'Szkoła Podstawowa' } });
  geo.poi.push({ x: 190, y: 146, c: 'szkola', n: 'Szkoła Podstawowa' });
  for (let i = 0; i < 7; i++) geo.b.push({ p: rect(-215 + i * 7, 175, 6, 12), t: { building: 'garage' } });
  geo.b.push({ p: rect(-200, -60, 26, 18), t: { building: 'service' } });
  geo.a.push({ p: rect(-60, 130, 120, 80), k: 'park' });
  geo.a.push({ p: rect(-225, 70, 80, 90), k: 'wood' });
  geo.a.push({ p: rect(60, -120, 50, 25), k: 'parking' });
  geo.a.push({ p: rect(-110, 30, 30, 20), k: 'play' });
  const cats = [
    'spozywczy',
    'spozywczy',
    'apteka',
    'budowlany',
    'elektronika',
    'biblioteka',
    'bank',
    'stacja',
    'przychodnia',
    'ubrania',
    'urzad',
    'sklep',
  ];
  for (const c of cats) {
    const ang = rnd() * Math.PI * 2;
    const d = 290 + rnd() * 380;
    geo.poi.push({ x: Math.round(Math.cos(ang) * d), y: Math.round(Math.sin(ang) * d), c, n: '' });
  }
  return geo;
}
