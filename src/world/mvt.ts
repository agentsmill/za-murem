/* Czytnik kafelków wektorowych (Mapbox Vector Tile, protobuf) i zamiana na geometrię gry.
   Źródło: OpenFreeMap (schemat OpenMapTiles, dane OpenStreetMap). Szybkie, z CDN, bez klucza.
   Przeniesione z js/mvt.js (0.3); promień obszaru jest teraz parametrem.

   Dla mapy miasta (miastoKafelki.ts) moduł daje też `pobierzKafelek` (bajty kafelka dowolnego poziomu, błąd to null)
   oraz wspólne z toGeoT wzory na punkty sklepów i usług: `rzutKafelka` (położenie w metrach) i `poiPunktu`
   (kategoria, nazwa, klucz), żeby miejsca spoza obszaru startowego miały to samo `k`, `x` i `y` co w świecie gry. */

import { L } from '../core/jezyk.ts';
import { type Geo, type GeoBuilding, type Pt, pip, polyArea } from './geo.ts';
import { KAFEL_PX, tagiKlucza } from './klucze.ts';
import { kluczPunktu } from './miasto.ts';
import { poiCat } from './osm.ts';
import { rodzajZMvt } from './rodzaje.ts';

export const Z = 14;

/* ---------- protobuf ---------- */
class Reader {
  b: Uint8Array;
  p = 0;
  constructor(buf: Uint8Array) {
    this.b = buf;
  }
  varint(): number {
    const b = this.b;
    let v = 0;
    let m = 1;
    let c: number;
    do {
      c = b[this.p++];
      v += (c & 127) * m;
      m *= 128;
    } while (c & 128);
    return v;
  }
  skip(wt: number): void {
    if (wt === 0) this.varint();
    else if (wt === 1) this.p += 8;
    else if (wt === 2) {
      const n = this.varint();
      this.p += n;
    } else if (wt === 5) this.p += 4;
    else throw new Error(`protobuf: typ ${wt}`);
  }
  str(): string {
    const n = this.varint();
    const s = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return td.decode(s);
  }
  packed(): number[] {
    const n = this.varint();
    const end = this.p + n;
    const out: number[] = [];
    while (this.p < end) out.push(this.varint());
    return out;
  }
}
const td = new TextDecoder();
const zz = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);

type TagValue = string | number | boolean | null;

function readValue(r: Reader, end: number): TagValue {
  let v: TagValue = null;
  while (r.p < end) {
    const k = r.varint();
    const f = k >> 3;
    const wt = k & 7;
    if (f === 1) v = r.str();
    else if (f === 2) {
      v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true);
      r.p += 4;
    } else if (f === 3) {
      v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true);
      r.p += 8;
    } else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) v = zz(r.varint());
    else if (f === 7) v = !!r.varint();
    else r.skip(wt);
  }
  return v;
}

/** geometria: lista pierścieni/linii w jednostkach kafelka */
function geom(cmds: number[]): Pt[][] {
  const out: Pt[][] = [];
  let x = 0;
  let y = 0;
  let cur: Pt[] | null = null;
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i++];
    const id = c & 7;
    const n = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < n; k++) {
        x += zz(cmds[i++]);
        y += zz(cmds[i++]);
        if (id === 1) {
          cur = [[x, y]];
          out.push(cur);
        } else if (cur) cur.push([x, y]);
      }
    } else if (id === 7) {
      if (cur?.length) cur.push([cur[0][0], cur[0][1]]);
    } else break;
  }
  return out;
}

export interface TileFeature {
  id: number;
  type: number;
  tags: Record<string, TagValue>;
  g: Pt[][] | null;
}
export interface TileLayer {
  extent: number;
  features: TileFeature[];
}
export type TileLayers = Record<string, TileLayer>;

/** zwraca {warstwa: {extent, features:[{id, type, tags, g}]}} tylko dla potrzebnych warstw */
export function decode(buf: Uint8Array, want?: ReadonlySet<string>): TileLayers {
  const r = new Reader(buf);
  const layers: TileLayers = {};
  while (r.p < buf.length) {
    const k = r.varint();
    const f = k >> 3;
    const wt = k & 7;
    if (f !== 3 || wt !== 2) {
      r.skip(wt);
      continue;
    }
    const len = r.varint();
    const end = r.p + len;
    const L = { name: '', extent: 4096, keys: [] as string[], vals: [] as TagValue[], raw: [] as [number, number][] };
    while (r.p < end) {
      const k2 = r.varint();
      const f2 = k2 >> 3;
      const wt2 = k2 & 7;
      if (f2 === 1) L.name = r.str();
      else if (f2 === 2) {
        const n = r.varint();
        L.raw.push([r.p, r.p + n]);
        r.p += n;
      } else if (f2 === 3) L.keys.push(r.str());
      else if (f2 === 4) {
        const n = r.varint();
        L.vals.push(readValue(r, r.p + n));
      } else if (f2 === 5) L.extent = r.varint();
      else r.skip(wt2);
    }
    r.p = end;
    if (want && !want.has(L.name)) continue;
    const feats: TileFeature[] = [];
    for (const [s, e] of L.raw) {
      const fr = new Reader(buf);
      fr.p = s;
      const F: TileFeature = { id: 0, type: 0, tags: {}, g: null };
      while (fr.p < e) {
        const k3 = fr.varint();
        const f3 = k3 >> 3;
        const wt3 = k3 & 7;
        if (f3 === 1) F.id = fr.varint();
        else if (f3 === 2) {
          const t = fr.packed();
          for (let q = 0; q + 1 < t.length; q += 2) F.tags[L.keys[t[q]]] = L.vals[t[q + 1]];
        } else if (f3 === 3) F.type = fr.varint();
        else if (f3 === 4) F.g = geom(fr.packed());
        else fr.skip(wt3);
      }
      if (F.g?.length) feats.push(F);
    }
    layers[L.name] = { extent: L.extent, features: feats };
  }
  return layers;
}

/** pole ze znakiem: w układzie kafelka (y w dół) zewnętrzny pierścień ma pole dodatnie */
function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return a / 2;
}

/* ---------- pobieranie ---------- */
let tileUrl: string | null = null;
async function getJson(url: string, ms: number) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}
async function getTile(url: string, ms: number): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 204 || r.status === 404) return new Uint8Array(0);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let b = new Uint8Array(await r.arrayBuffer());
    if (b[0] === 0x1f && b[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
      b = new Uint8Array(await new Response(s).arrayBuffer());
    }
    return b;
  } finally {
    clearTimeout(to);
  }
}

/** Szablon adresu kafelków OpenFreeMap ({z}/{x}/{y}): pobierany raz na sesję, równoległe pierwsze wywołania czekają na
    to samo pobranie. Błąd (brak sieci, odpowiedź bez adresu) odrzuca obietnicę i nie zostaje zapamiętany. */
let tileUrlWTrakcie: Promise<string> | null = null;
async function szablonKafelkow(): Promise<string> {
  if (tileUrl) return tileUrl;
  tileUrlWTrakcie ||= (async () => {
    const tj = await getJson('https://tiles.openfreemap.org/planet', 15000);
    const url: string | null = tj?.tiles?.[0] ?? null;
    if (!url) throw new Error('Serwer kafelków nie podał adresu.');
    tileUrl = url;
    return url;
  })().finally(() => {
    tileUrlWTrakcie = null;
  });
  return tileUrlWTrakcie;
}

/** Surowe bajty kafelka (z, x, y) z OpenFreeMap dla mapy miasta (src/world/miastoKafelki.ts). Pusty kafelek (204, 404)
    to pusta tablica, a każdy błąd (brak sieci, czas, kod serwera) to `null`, nigdy wyjątek i nic na konsoli. Poziomy
    niższe niż 14 mają ten sam schemat warstw. */
export async function pobierzKafelek(z: number, x: number, y: number): Promise<Uint8Array | null> {
  try {
    const url = await szablonKafelkow();
    return await getTile(url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), 20000);
  } catch {
    return null;
  }
}

/** Merkator kafelków: długość i szerokość geograficzna na kafelki (ułamkowe) przy n = 2^z kafelków na bok i z powrotem.
    Wspólne z mapą miasta (src/world/miastoKafelki.ts), żeby tło i świat gry liczyły położenie tym samym wzorem. */
export const lon2x = (lon: number, n: number) => ((lon + 180) / 360) * n;
export const lat2y = (lat: number, n: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
};
export const x2lon = (x: number, n: number) => (x / n) * 360 - 180;
export const y2lat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** kafelki poziomu z (domyślnie Z = 14) pokrywające kwadrat o połowie boku rad metrów, wiersz po wierszu od północy */
export function tilesFor(lat: number, lon: number, rad: number, z: number = Z): [number, number][] {
  const n = 2 ** z;
  const dLat = rad / 110574;
  const dLon = rad / (111320 * Math.cos((lat * Math.PI) / 180));
  const x0 = Math.floor(lon2x(lon - dLon, n));
  const x1 = Math.floor(lon2x(lon + dLon, n));
  const y0 = Math.floor(lat2y(lat + dLat, n));
  const y1 = Math.floor(lat2y(lat - dLat, n));
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

/** Rzut punktu kafelka na metry od środka mapy (lat0, lon0): wschód i południe, zaokrąglone do 0,5 m. T to kafelek
    poziomu Z, q punkt w jednostkach extent E. Jedyny wzór dla geometrii gry (toGeoT) i dla miejsc spoza obszaru
    startowego (miastoKafelki.ts), więc ten sam punkt ma w obu to samo położenie. */
export function rzutKafelka(lat0: number, lon0: number): (T: Pick<DecodedTile, 'x' | 'y'>, E: number, q: Pt) => Pt {
  const n = 2 ** Z;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const rd = (v: number) => Math.round(v * 2) / 2;
  return (T, E, [px, py]) => {
    const lon = x2lon(T.x + px / E, n);
    const lat = y2lat(T.y + py / E, n);
    return [rd((lon - lon0) * kx), rd((lat0 - lat) * ky)];
  };
}

/* ---------- OpenMapTiles -> geometria gry ---------- */
const AMEN = new Set([
  'pharmacy',
  'clinic',
  'doctors',
  'hospital',
  'dentist',
  'school',
  'kindergarten',
  'library',
  'bank',
  'fuel',
  'place_of_worship',
  'townhall',
  'post_office',
  'police',
  'fire_station',
  'community_centre',
  'marketplace',
]);
const SHOPCLS = new Set([
  'shop',
  'grocery',
  'alcohol_shop',
  'bakery',
  'butcher',
  'clothing_store',
  'hardware',
  'furniture',
  'florist',
  'garden_centre',
  'mobile_phone',
  'electronics',
  'books',
  'gift',
  'jewelry',
  'optician',
  'shoes',
  'car',
  'stationery',
  'laundry',
  'hairdresser',
]);
function poiTags(t: Record<string, TagValue>): Record<string, string> | null {
  const s = t.subclass as string;
  const c = t.class as string;
  if (!s) return null;
  if (AMEN.has(s)) return { amenity: s };
  if (SHOPCLS.has(c)) return { shop: s };
  return null;
}

/** Kategoria, nazwa z OSM i klucz „poi:X:Y” punktu q (w jednostkach extent E) z warstwy poi kafelka T poziomu Z; null,
    gdy to nie sklep ani usługa. Klucz liczy się z surowego punktu kafelka, przed zaokrągleniem do 0,5 m (całe globalne
    piksele, jak klucze budynków). Jedyne miejsce, które go liczy: wspólne dla toGeoT i dla miejsc spoza obszaru
    startowego (miastoKafelki.ts), więc ten sam punkt ma zawsze ten sam klucz. */
export function poiPunktu(
  t: Record<string, TagValue>,
  T: Pick<DecodedTile, 'x' | 'y'>,
  q: Pt,
  E: number,
): { c: string; n: string; k: string } | null {
  const pt = poiTags(t);
  if (!pt) return null;
  const c = poiCat(pt);
  if (!c) return null;
  const k = kluczPunktu(T.x * KAFEL_PX + (q[0] * KAFEL_PX) / E, T.y * KAFEL_PX + (q[1] * KAFEL_PX) / E);
  return { c, n: (t.name as string) || '', k };
}

/** przycięcie pierścienia do kwadratu [0,E] (Sutherland-Hodgman) */
function clipRing(ring: Pt[], E: number): Pt[] | null {
  let pts = ring.slice(0, -1);
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [
      (p) => p[0] >= 0,
      (a, b) => {
        const t = (0 - a[0]) / (b[0] - a[0]);
        return [0, a[1] + t * (b[1] - a[1])];
      },
    ],
    [
      (p) => p[0] <= E,
      (a, b) => {
        const t = (E - a[0]) / (b[0] - a[0]);
        return [E, a[1] + t * (b[1] - a[1])];
      },
    ],
    [
      (p) => p[1] >= 0,
      (a, b) => {
        const t = (0 - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), 0];
      },
    ],
    [
      (p) => p[1] <= E,
      (a, b) => {
        const t = (E - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), E];
      },
    ],
  ];
  for (const [ins, cut] of edges) {
    if (!pts.length) break;
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      if (ins(b)) {
        if (!ins(a)) out.push(cut(a, b));
        out.push(b);
      } else if (ins(a)) out.push(cut(a, b));
    }
    pts = out;
  }
  if (pts.length < 3) return null;
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

type Span = [string, number, number];
/** odcinki pierścienia leżące na krawędzi kafelka: [klucz linii, od, do] w globalnych współrzędnych kafelków */
function borderSpans(ring: Pt[], E: number, tx: number, ty: number): Span[] {
  const out: Span[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const lines: [number, number, string, number][] = [
      [0, 0, `V${tx}`, ty],
      [0, E, `V${tx + 1}`, ty],
      [1, 0, `H${ty}`, tx],
      [1, E, `H${ty + 1}`, tx],
    ];
    for (const [ax, val, key, base] of lines) {
      if (Math.abs(a[ax] - val) < 0.01 && Math.abs(b[ax] - val) < 0.01) {
        const o = 1 - ax;
        const lo = Math.min(a[o], b[o]) / E + base;
        const hi = Math.max(a[o], b[o]) / E + base;
        if (hi - lo > 1e-6) out.push([key, lo, hi]);
      }
    }
  }
  return out;
}

const ROADCLS: Record<string, string> = {
  motorway: 'motorway',
  trunk: 'trunk',
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  minor: 'residential',
  service: 'service',
  track: 'track',
  path: 'footway',
  busway: 'service',
};
/** klasy tuneli, które bywają przejściami przez budynki (nie tunele pod drogami szybkiego ruchu) */
const PASSCLS = new Set(['path', 'service', 'minor', 'track']);
function areaKindT(layer: string, t: Record<string, TagValue>) {
  const c = t.class;
  const s = t.subclass;
  if (layer === 'water') return 'water';
  if (layer === 'park') return 'park';
  if (layer === 'landcover') {
    if (c === 'wood') return 'wood';
    if (s === 'allotments') return 'allot';
    if (s === 'scrub') return 'wood';
    if (
      c === 'grass' ||
      s === 'park' ||
      s === 'garden' ||
      s === 'meadow' ||
      s === 'grassland' ||
      s === 'village_green' ||
      s === 'recreation_ground'
    )
      return 'park';
    return null;
  }
  if (layer === 'landuse') {
    if (c === 'pitch' || c === 'stadium' || c === 'track') return 'pitch';
    if (c === 'playground') return 'play';
    if (c === 'garages') return 'parking';
    return null;
  }
  return null;
}

/** Identyfikator OSM z id obiektu w kafelku OpenFreeMap: numer OSM razy 10 plus 1 (punkt), 2 (droga) albo 3
    (relacja); zwraca tylko drogi i relacje. Obiekty z końcówką 0 to wiele elementów o tych samych atrybutach
    sklejonych w jeden (z numerem jednego z nich), więc numeru nie dają. */
export function osmIdOf(id: number): string | undefined {
  const kind = id % 10;
  if (kind === 2) return `w${(id - 2) / 10}`;
  if (kind === 3) return `r${(id - 3) / 10}`;
  return undefined;
}

export const WANT = new Set([
  'building',
  'transportation',
  'landuse',
  'landcover',
  'park',
  'water',
  'waterway',
  'poi',
  'housenumber',
]);

export interface DecodedTile {
  x: number;
  y: number;
  /** poziom kafelka; brak oznacza Z (14), jak kafelki z `load` i z tests/fixtures. Klucze miejsc liczą się tylko z Z. */
  z?: number;
  L: TileLayers;
}

/** R: promień obszaru gry w metrach (w 0.3 było 230) */
export async function load(lat0: number, lon0: number, R: number, onStatus?: (s: string) => void): Promise<Geo> {
  const url = await szablonKafelkow();
  const list = tilesFor(lat0, lon0, 720);
  onStatus?.(
    L(
      `Pobieram ${list.length} ${list.length === 1 ? 'kafelek' : 'kafelki'} mapy…`,
      `Downloading ${list.length} map ${list.length === 1 ? 'tile' : 'tiles'}…`,
    ),
  );
  const bufs = await Promise.all(
    list.map(([x, y]) =>
      getTile(url.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)), 20000),
    ),
  );
  const tiles = list.map(([x, y], k) => ({ x, y, L: bufs[k].length ? decode(bufs[k], WANT) : {} }));
  return toGeoT(tiles, lat0, lon0, R);
}

interface BTmp {
  p: Pt[];
  pp: Pt[][];
  h: number;
  k: number;
  /** identyfikator OSM obiektu, gdy to jeden budynek */
  id?: string;
  /** numer tego kawałka wśród wszystkich kawałków (Kawalek), z których liczy się klucz budynku */
  cal: number;
}
/** Kawałek budynku do klucza (src/world/klucze.ts): każdy przycięty pierścień z pobranych kafelków, także daleki od
    środka mapy i maleńki. Klucz nie może zależeć od tego, które kawałki gracz zobaczy u siebie na mapie. */
interface Kawalek {
  /** obrys w globalnych pikselach kafelków (dokładny, przed zaokrągleniem do metrów) */
  g: Pt[];
  k: number;
}
type SpanRec<B> = [string, number, number, number, B, DecodedTile];

/** Sklejanie kawałków budynku przeciętego granicą kafelków: ta sama wysokość, wspólny odcinek granicy.
    Zwraca find z union-find po numerach k kawałków. */
function sklej<B extends { k: number }>(n: number, spans: SpanRec<B>[]): (i: number) => number {
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (i: number) => {
    while (par[i] !== i) i = par[i] = par[par[i]];
    return i;
  };
  const byKey: Record<string, SpanRec<B>[]> = {};
  for (const s of spans) (byKey[s[0]] ||= []).push(s);
  for (const key in byKey) {
    const a = byKey[key];
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) {
        const s = a[i];
        const q = a[j];
        if (s[5] === q[5] || s[3] !== q[3]) continue;
        if (Math.min(s[2], q[2]) - Math.max(s[1], q[1]) > 1e-6) {
          const x = find(s[4].k);
          const y = find(q[4].k);
          if (x !== y) par[y] = x;
        }
      }
  }
  return find;
}

export function toGeoT(tiles: DecodedTile[], lat0: number, lon0: number, R: number): Geo {
  const rzut = rzutKafelka(lat0, lon0);
  const geo: Geo = { c: [lat0, lon0], b: [], r: [], a: [], w: [], poi: [], src: 'mvt' };
  const tmpB: BTmp[] = [];
  const M = R + 30;
  const near = (pts: Pt[]) => {
    for (const [x, y] of pts) if (x > -M && x < M && y > -M && y < M) return true;
    let a = 1e9;
    let b = -1e9;
    let c = 1e9;
    let d = -1e9;
    for (const [x, y] of pts) {
      if (x < a) a = x;
      if (x > b) b = x;
      if (y < c) c = y;
      if (y > d) d = y;
    }
    return a < M && b > -M && c < M && d > -M;
  };
  const spans: SpanRec<BTmp>[] = [];
  /** wszystkie kawałki budynków z pobranych kafelków (do kluczy) i ich odcinki na granicach kafelków */
  const calosc: Kawalek[] = [];
  const spansCal: SpanRec<Kawalek>[] = [];
  /** numery domów; id: identyfikator OSM elementu z adresem (droga albo relacja), zwykle samego budynku */
  const hn: { x: number; y: number; h: string; id?: string }[] = [];
  for (const T of tiles) {
    for (const lname in T.L) {
      const L = T.L[lname];
      const E = L.extent;
      const P = (q: Pt): Pt => rzut(T, E, q);
      // przycinamy do własnego obszaru kafelka (bez bufora), żeby kawałki z sąsiednich kafelków się nie dublowały
      const inOwn = ([px, py]: Pt) => px >= 0 && px < E && py >= 0 && py < E;
      for (const F of L.features) {
        const t = F.tags;
        const fg = F.g!;
        if (lname === 'poi' || lname === 'housenumber') {
          if (F.type !== 1) continue;
          for (const ring of fg)
            for (const q of ring) {
              if (!inOwn(q)) continue;
              const [x, y] = P(q);
              if (lname === 'housenumber') {
                if (Math.abs(x) < M && Math.abs(y) < M)
                  hn.push({ x, y, h: String(t.housenumber || ''), id: osmIdOf(F.id) });
                continue;
              }
              // rodzaj budynku (muzeum, teatr, hotel…) osobno od kategorii, bo kategoria zmienia classify()
              const nazwa = (t.name as string) || '';
              const rodzaj = rodzajZMvt(t.class as string, t.subclass as string, nazwa);
              if (rodzaj && Math.hypot(x, y) <= 720) (geo.rodzaje ||= []).push({ x, y, k: rodzaj, n: nazwa });
              const m = poiPunktu(t, T, q, E);
              if (!m) continue;
              if (Math.hypot(x, y) > 720) continue;
              geo.poi.push({ x, y, c: m.c, n: m.n, k: m.k });
            }
          continue;
        }
        if (lname === 'transportation' || lname === 'waterway') {
          if (F.type !== 2) continue;
          if (t.brunnel === 'tunnel') {
            // 0.3 pomijało tunele; prześwity i bramy przez budynki zachowujemy jako przejścia
            if (lname === 'transportation' && PASSCLS.has(t.class as string))
              for (const line of fg) {
                const pts = line.map(P);
                if (pts.length >= 2 && near(pts)) (geo.pass ||= []).push({ l: pts, h: ROADCLS[t.class as string] });
              }
            continue;
          }
          for (const line of fg) {
            const pts = line.map(P);
            if (pts.length < 2 || !near(pts)) continue;
            if (lname === 'waterway') {
              if (t.class === 'river' || t.class === 'stream' || t.class === 'canal') geo.w.push({ l: pts });
              continue;
            }
            let h = ROADCLS[t.class as string];
            if (!h) continue;
            if (t.class === 'path') h = (t.subclass as string) || 'footway';
            geo.r.push({ l: pts, h });
          }
          continue;
        }
        if (F.type !== 3) continue;
        // pierścienie zewnętrzne (dziury pomijamy)
        const rings = fg.filter((rg) => rg.length >= 4 && signedArea(rg) > 0);
        if (lname === 'building') {
          if ((t.render_min_height as number) > 0) continue;
          const h = +(t.render_height as number) || 0;
          const id = osmIdOf(F.id);
          // globalne piksele: KAFEL_PX na kafelek niezależnie od extent (przy 4096 to po prostu liczby całkowite)
          const gs = KAFEL_PX / E;
          const G = ([px, py]: Pt): Pt => [T.x * KAFEL_PX + px * gs, T.y * KAFEL_PX + py * gs];
          for (const rg0 of rings) {
            const rg = clipRing(rg0, E);
            if (!rg) continue;
            // do klucza idzie każdy kawałek, do geometrii gry tylko bliskie i nie za małe (jak w 0.3)
            const cal: Kawalek = { g: rg.map(G), k: calosc.length };
            calosc.push(cal);
            const brzegi = tiles.length > 1 ? borderSpans(rg, E, T.x, T.y) : [];
            for (const s of brzegi) spansCal.push([s[0], s[1], s[2], h, cal, T]);
            const pts = rg.map(P);
            if (!near(pts) || polyArea(pts) < 4) continue;
            const b: BTmp = { p: pts, pp: [], h, k: tmpB.length, id, cal: cal.k };
            for (const s of brzegi) spans.push([s[0], s[1], s[2], h, b, T]);
            tmpB.push(b);
          }
          continue;
        }
        const k = areaKindT(lname, t);
        if (!k) continue;
        for (const rg of rings) {
          const pts = rg.map(P);
          if (near(pts)) geo.a.push({ p: pts, k });
        }
      }
    }
  }
  // sklejanie kawałków budynku przeciętego granicą kafelków: kawałki geometrii gry jak w 0.3, a osobno wszystkie
  // kawałki z pobranych kafelków, z których liczy się klucz budynku (ta sama budowla u każdego gracza)
  const find = sklej(tmpB.length, spans);
  const findCal = sklej(calosc.length, spansCal);
  const pierscienie = new Map<number, Pt[][]>();
  for (const c of calosc) {
    const r = findCal(c.k);
    const lista = pierscienie.get(r);
    if (lista) lista.push(c.g);
    else pierscienie.set(r, [c.g]);
  }
  const kluczCal = new Map<number, ReturnType<typeof tagiKlucza>>();
  const tagiCalosci = (cal: number) => {
    const r = findCal(cal);
    if (!kluczCal.has(r)) kluczCal.set(r, tagiKlucza(pierscienie.get(r) ?? []));
    return kluczCal.get(r) ?? null;
  };
  const groups = new Map<number, BTmp[]>();
  for (const b of tmpB) {
    const r = find(b.k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  }
  const merged = [...groups.values()].map((g) => {
    g.sort((p, q) => polyArea(q.p) - polyArea(p.p));
    const m = g[0];
    m.pp = g.slice(1).map((x) => x.p);
    // kawałki z różnych obiektów (albo bez numeru) to nie jeden budynek OSM
    if (g.some((x) => x.id !== m.id)) m.id = undefined;
    return m;
  });
  // numery OSM z punktów adresu w budynkach; punkt w kilku nachodzących na siebie obrysach nie mówi, czyj jest
  const within = (b: BTmp, q: { x: number; y: number }) => pip(q.x, q.y, b.p) || b.pp.some((p) => pip(q.x, q.y, p));
  const pointIds = merged.map((b) => new Set(hn.filter((q) => q.id && within(b, q)).map((q) => q.id as string)));
  const holders = new Map<string, number>();
  for (const ids of pointIds) for (const id of ids) holders.set(id, (holders.get(id) ?? 0) + 1);
  // budynki: tagi zgodne z formatem z Overpass, numery domów z warstwy housenumber
  const out: GeoBuilding[] = [];
  merged.forEach((b, k) => {
    const tags: Record<string, string> = { building: 'yes', guess: '1' };
    if (b.h > 0) tags['building:levels'] = String(Math.max(1, Math.round(b.h / 3.5)));
    const num = hn.find((q) => within(b, q));
    if (num?.h) tags['addr:housenumber'] = num.h;
    // identyfikator: z obiektu budynku, gdy nie jest sklejony z innymi, albo z jedynego punktu adresu z drogi lub
    // relacji OSM w środku budynku (adres na samym budynku), jeśli ten punkt nie leży też w innym budynku
    let id = b.id;
    const ids = pointIds[k];
    if (!id && ids.size === 1) {
      const [only] = ids;
      if (holders.get(only) === 1) id = only;
    }
    if (id) tags.id = id;
    // klucz budynku i oś klatek z dokładnego obrysu całej budowli w pikselach kafelków (src/world/klucze.ts)
    const kl = tagiCalosci(b.cal);
    if (kl) Object.assign(tags, kl);
    const o: GeoBuilding = { p: b.p, t: tags };
    if (b.pp.length) o.pp = b.pp;
    out.push(o);
  });
  // duże najpierw: obrys budynku zajmuje kafelki przed ewentualnymi częściami
  out.sort((a, b) => polyArea(b.p) - polyArea(a.p));
  // budynek rozcięty przy przycinaniu do kafelka na osobne kawałki: numer zostaje przy największym
  const seen = new Set<string>();
  for (const o of out) {
    const id = o.t.id;
    if (id === undefined) continue;
    if (seen.has(id)) delete o.t.id;
    seen.add(id);
  }
  geo.b = out;
  return geo;
}
