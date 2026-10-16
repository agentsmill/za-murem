/* Za Murem: czytnik kafelków wektorowych (Mapbox Vector Tile, protobuf) i zamiana na geometrię gry.
   Źródło: OpenFreeMap (schemat OpenMapTiles, dane OpenStreetMap). Szybkie, z CDN, bez klucza. */
(function (G) {
  'use strict';
  const Z = 14;

  /* ---------- protobuf ---------- */
  function Reader(buf) { this.b = buf; this.p = 0; }
  Reader.prototype.varint = function () {
    const b = this.b; let v = 0, m = 1, c;
    do { c = b[this.p++]; v += (c & 127) * m; m *= 128; } while (c & 128);
    return v;
  };
  Reader.prototype.skip = function (wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.p += 8;
    else if (wt === 2) { const n = this.varint(); this.p += n; }
    else if (wt === 5) this.p += 4;
    else throw new Error('protobuf: typ ' + wt);
  };
  const td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  Reader.prototype.str = function () {
    const n = this.varint(), s = this.b.subarray(this.p, this.p + n); this.p += n;
    return td ? td.decode(s) : String.fromCharCode.apply(null, s);
  };
  Reader.prototype.packed = function () {
    const n = this.varint(), end = this.p + n, out = [];
    while (this.p < end) out.push(this.varint());
    return out;
  };
  const zz = n => (n % 2 ? -(n + 1) / 2 : n / 2);

  function readValue(r, end) {
    let v = null;
    while (r.p < end) {
      const k = r.varint(), f = k >> 3, wt = k & 7;
      if (f === 1) v = r.str();
      else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
      else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) v = zz(r.varint());
      else if (f === 7) v = !!r.varint();
      else r.skip(wt);
    }
    return v;
  }

  /* geometria: lista pierścieni/linii w jednostkach kafelka */
  function geom(cmds) {
    const out = []; let x = 0, y = 0, cur = null, i = 0;
    while (i < cmds.length) {
      const c = cmds[i++], id = c & 7, n = c >> 3;
      if (id === 1 || id === 2) {
        for (let k = 0; k < n; k++) {
          x += zz(cmds[i++]); y += zz(cmds[i++]);
          if (id === 1) { cur = [[x, y]]; out.push(cur); } else if (cur) cur.push([x, y]);
        }
      } else if (id === 7) { if (cur && cur.length) cur.push([cur[0][0], cur[0][1]]); }
      else break;
    }
    return out;
  }

  /* zwraca {warstwa: {extent, features:[{id, type, tags, g}]}} tylko dla potrzebnych warstw */
  function decode(buf, want) {
    const r = new Reader(buf), layers = {};
    while (r.p < buf.length) {
      const k = r.varint(), f = k >> 3, wt = k & 7;
      if (f !== 3 || wt !== 2) { r.skip(wt); continue; }
      const len = r.varint(), end = r.p + len;
      const L = { name: '', extent: 4096, keys: [], vals: [], raw: [] };
      while (r.p < end) {
        const k2 = r.varint(), f2 = k2 >> 3, wt2 = k2 & 7;
        if (f2 === 1) L.name = r.str();
        else if (f2 === 2) { const n = r.varint(); L.raw.push([r.p, r.p + n]); r.p += n; }
        else if (f2 === 3) L.keys.push(r.str());
        else if (f2 === 4) { const n = r.varint(); L.vals.push(readValue(r, r.p + n)); }
        else if (f2 === 5) L.extent = r.varint();
        else r.skip(wt2);
      }
      r.p = end;
      if (want && !want.has(L.name)) continue;
      const feats = [];
      for (const [s, e] of L.raw) {
        const fr = new Reader(buf); fr.p = s;
        const F = { id: 0, type: 0, tags: {}, g: null };
        while (fr.p < e) {
          const k3 = fr.varint(), f3 = k3 >> 3, wt3 = k3 & 7;
          if (f3 === 1) F.id = fr.varint();
          else if (f3 === 2) { const t = fr.packed(); for (let q = 0; q + 1 < t.length; q += 2) F.tags[L.keys[t[q]]] = L.vals[t[q + 1]]; }
          else if (f3 === 3) F.type = fr.varint();
          else if (f3 === 4) F.g = geom(fr.packed());
          else fr.skip(wt3);
        }
        if (F.g && F.g.length) feats.push(F);
      }
      layers[L.name] = { extent: L.extent, features: feats };
    }
    return layers;
  }

  /* pole ze znakiem: w układzie kafelka (y w dół) zewnętrzny pierścień ma pole dodatnie */
  function signedArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a / 2; }

  /* ---------- pobieranie ---------- */
  let tileUrl = null;
  async function getJson(url, ms) {
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(to); }
  }
  async function getTile(url, ms) {
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (r.status === 204 || r.status === 404) return new Uint8Array(0);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x1f && b[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
        const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
        b = new Uint8Array(await new Response(s).arrayBuffer());
      }
      return b;
    } finally { clearTimeout(to); }
  }

  const lon2x = (lon, n) => (lon + 180) / 360 * n;
  const lat2y = (lat, n) => { const s = Math.sin(lat * Math.PI / 180); return (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
  const x2lon = (x, n) => x / n * 360 - 180;
  const y2lat = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;

  /* kafelki pokrywające kwadrat o połowie boku rad metrów */
  function tilesFor(lat, lon, rad) {
    const n = 2 ** Z, dLat = rad / 110574, dLon = rad / (111320 * Math.cos(lat * Math.PI / 180));
    const x0 = Math.floor(lon2x(lon - dLon, n)), x1 = Math.floor(lon2x(lon + dLon, n));
    const y0 = Math.floor(lat2y(lat + dLat, n)), y1 = Math.floor(lat2y(lat - dLat, n));
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
  }

  /* ---------- OpenMapTiles -> geometria gry ---------- */
  const AMEN = new Set(['pharmacy', 'clinic', 'doctors', 'hospital', 'dentist', 'school', 'kindergarten', 'library', 'bank', 'fuel', 'place_of_worship', 'townhall', 'post_office', 'police', 'fire_station', 'community_centre', 'marketplace']);
  const SHOPCLS = new Set(['shop', 'grocery', 'alcohol_shop', 'bakery', 'butcher', 'clothing_store', 'hardware', 'furniture', 'florist', 'garden_centre', 'mobile_phone', 'electronics', 'books', 'gift', 'jewelry', 'optician', 'shoes', 'car', 'stationery', 'laundry', 'hairdresser']);
  function poiTags(t) {
    const s = t.subclass, c = t.class;
    if (!s) return null;
    if (AMEN.has(s)) return { amenity: s };
    if (SHOPCLS.has(c)) return { shop: s };
    return null;
  }

  /* przycięcie pierścienia do kwadratu [0,E] (Sutherland-Hodgman) */
  function clipRing(ring, E) {
    let pts = ring.slice(0, -1);
    const edges = [[p => p[0] >= 0, (a, b) => { const t = (0 - a[0]) / (b[0] - a[0]); return [0, a[1] + t * (b[1] - a[1])]; }],
      [p => p[0] <= E, (a, b) => { const t = (E - a[0]) / (b[0] - a[0]); return [E, a[1] + t * (b[1] - a[1])]; }],
      [p => p[1] >= 0, (a, b) => { const t = (0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), 0]; }],
      [p => p[1] <= E, (a, b) => { const t = (E - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), E]; }]];
    for (const [ins, cut] of edges) {
      if (!pts.length) break;
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
        if (ins(b)) { if (!ins(a)) out.push(cut(a, b)); out.push(b); }
        else if (ins(a)) out.push(cut(a, b));
      }
      pts = out;
    }
    if (pts.length < 3) return null;
    pts.push([pts[0][0], pts[0][1]]);
    return pts;
  }
  /* odcinki pierścienia leżące na krawędzi kafelka: [klucz linii, od, do] w globalnych współrzędnych kafelków */
  function borderSpans(ring, E, tx, ty) {
    const out = [];
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i], b = ring[i + 1];
      for (const [ax, val, key, base] of [[0, 0, 'V' + tx, ty], [0, E, 'V' + (tx + 1), ty], [1, 0, 'H' + ty, tx], [1, E, 'H' + (ty + 1), tx]]) {
        if (Math.abs(a[ax] - val) < .01 && Math.abs(b[ax] - val) < .01) {
          const o = 1 - ax, lo = Math.min(a[o], b[o]) / E + base, hi = Math.max(a[o], b[o]) / E + base;
          if (hi - lo > 1e-6) out.push([key, lo, hi]);
        }
      }
    }
    return out;
  }
  const ROADCLS = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', minor: 'residential', service: 'service', track: 'track', path: 'footway', busway: 'service' };
  function areaKindT(layer, t) {
    const c = t.class, s = t.subclass;
    if (layer === 'water') return 'water';
    if (layer === 'park') return 'park';
    if (layer === 'landcover') {
      if (c === 'wood') return 'wood';
      if (s === 'allotments') return 'allot';
      if (s === 'scrub') return 'wood';
      if (c === 'grass' || s === 'park' || s === 'garden' || s === 'meadow' || s === 'grassland' || s === 'village_green' || s === 'recreation_ground') return 'park';
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

  const WANT = new Set(['building', 'transportation', 'landuse', 'landcover', 'park', 'water', 'waterway', 'poi', 'housenumber']);
  async function load(lat0, lon0, onStatus) {
    if (!tileUrl) {
      const tj = await getJson('https://tiles.openfreemap.org/planet', 15000);
      tileUrl = tj && tj.tiles && tj.tiles[0];
      if (!tileUrl) throw new Error('Serwer kafelków nie podał adresu.');
    }
    const list = tilesFor(lat0, lon0, 720);
    if (onStatus) onStatus(`Pobieram ${list.length} ${list.length === 1 ? 'kafelek' : 'kafelki'} mapy…`);
    const bufs = await Promise.all(list.map(([x, y]) => getTile(tileUrl.replace('{z}', Z).replace('{x}', x).replace('{y}', y), 20000)));
    const tiles = list.map(([x, y], k) => ({ x, y, L: bufs[k].length ? decode(bufs[k], WANT) : {} }));
    return toGeoT(tiles, lat0, lon0);
  }

  function toGeoT(tiles, lat0, lon0) {
    const R = G.R, n = 2 ** Z;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    const rd = v => Math.round(v * 2) / 2;
    const geo = { c: [lat0, lon0], b: [], r: [], a: [], w: [], poi: [], src: 'mvt' };
    const M = R + 30;
    const near = pts => { for (const [x, y] of pts) if (x > -M && x < M && y > -M && y < M) return true; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, y] of pts) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; } return a < M && b > -M && c < M && d > -M; };
    const spans = [], hn = [];
    for (const T of tiles) {
      for (const lname in T.L) {
        const L = T.L[lname], E = L.extent;
        const P = ([px, py]) => {
          const lon = x2lon(T.x + px / E, n), lat = y2lat(T.y + py / E, n);
          return [rd((lon - lon0) * kx), rd((lat0 - lat) * ky)];
        };
        // przycinamy do własnego obszaru kafelka (bez bufora), żeby kawałki z sąsiednich kafelków się nie dublowały
        const inOwn = ([px, py]) => px >= 0 && px < E && py >= 0 && py < E;
        for (const F of L.features) {
          const t = F.tags;
          if (lname === 'poi' || lname === 'housenumber') {
            if (F.type !== 1) continue;
            for (const ring of F.g) for (const q of ring) {
              if (!inOwn(q)) continue;
              const [x, y] = P(q);
              if (lname === 'housenumber') { if (Math.abs(x) < M && Math.abs(y) < M) hn.push({ x, y, h: String(t.housenumber || '') }); continue; }
              const pt = poiTags(t); if (!pt) continue;
              const c = G.OSM.poiCat(pt); if (!c) continue;
              if (Math.hypot(x, y) > 720) continue;
              geo.poi.push({ x, y, c, n: t.name || '' });
            }
            continue;
          }
          if (lname === 'transportation' || lname === 'waterway') {
            if (F.type !== 2) continue;
            if (t.brunnel === 'tunnel') continue;
            for (const line of F.g) {
              const pts = line.map(P); if (pts.length < 2 || !near(pts)) continue;
              if (lname === 'waterway') { if (t.class === 'river' || t.class === 'stream' || t.class === 'canal') geo.w.push({ l: pts }); continue; }
              let h = ROADCLS[t.class]; if (!h) continue;
              if (t.class === 'path') h = t.subclass || 'footway';
              geo.r.push({ l: pts, h });
            }
            continue;
          }
          if (F.type !== 3) continue;
          // pierścienie zewnętrzne (dziury pomijamy)
          const rings = F.g.filter(rg => rg.length >= 4 && signedArea(rg) > 0);
          if (lname === 'building') {
            if (t.render_min_height > 0) continue;
            const h = +t.render_height || 0;
            for (const rg0 of rings) {
              const rg = clipRing(rg0, E); if (!rg) continue;
              const pts = rg.map(P); if (!near(pts) || G.polyArea(pts) < 4) continue;
              const b = { p: pts, pp: [], h, k: geo.b.length };
              if (tiles.length > 1) for (const s of borderSpans(rg, E, T.x, T.y)) spans.push([s[0], s[1], s[2], h, b, T]);
              geo.b.push(b);
            }
            continue;
          }
          const k = areaKindT(lname, t); if (!k) continue;
          for (const rg of rings) { const pts = rg.map(P); if (near(pts)) geo.a.push({ p: pts, k }); }
        }
      }
    }
    // sklejanie kawałków budynku przeciętego granicą kafelków: ta sama wysokość, wspólny odcinek granicy
    const par = geo.b.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const byKey = {};
    for (const s of spans) (byKey[s[0]] = byKey[s[0]] || []).push(s);
    for (const key in byKey) {
      const a = byKey[key];
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const s = a[i], q = a[j];
        if (s[5] === q[5] || s[3] !== q[3]) continue;
        if (Math.min(s[2], q[2]) - Math.max(s[1], q[1]) > 1e-6) { const x = find(s[4].k), y = find(q[4].k); if (x !== y) par[y] = x; }
      }
    }
    const groups = new Map();
    for (const b of geo.b) { const r = find(b.k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(b); }
    geo.b = [...groups.values()].map(g => { g.sort((p, q) => G.polyArea(q.p) - G.polyArea(p.p)); const m = g[0]; m.pp = g.slice(1).map(x => x.p); return m; });
    // budynki: tagi zgodne z formatem z Overpass, numery domów z warstwy housenumber
    const pip = (x, y, poly) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) ins = !ins; } return ins; };
    const out = [];
    for (const b of geo.b) {
      const tags = { building: 'yes', guess: '1' };
      if (b.h > 0) tags['building:levels'] = String(Math.max(1, Math.round(b.h / 3.5)));
      const num = hn.find(q => pip(q.x, q.y, b.p) || b.pp.some(p => pip(q.x, q.y, p)));
      if (num && num.h) tags['addr:housenumber'] = num.h;
      const o = { p: b.p, t: tags }; if (b.pp.length) o.pp = b.pp;
      out.push(o);
    }
    // duże najpierw: obrys budynku zajmuje kafelki przed ewentualnymi częściami
    out.sort((a, b) => G.polyArea(b.p) - G.polyArea(a.p));
    geo.b = out;
    return geo;
  }

  G.MVT = { decode, load, toGeoT, tilesFor };
})(window.G);
