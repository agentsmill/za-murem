/* Za Murem: dane z OpenStreetMap, osiedle zapasowe i rasteryzacja do siatki kafelków */
(function (G) {
  'use strict';
  const R = G.R, TM = G.TM, N = G.N;
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];
  const AM = 'school|kindergarten|clinic|doctors|pharmacy|hospital|library|bank|fire_station|police|townhall|marketplace|post_office|fuel|place_of_worship|community_centre';

  function query(lat, lon) {
    const a = `(around:${R},${lat},${lon})`, b = `(around:700,${lat},${lon})`;
    return `[out:json][timeout:40];(way["building"]${a};way["highway"]${a};way["landuse"]${a};way["leisure"]${a};way["natural"]${a};way["amenity"="parking"]${a};way["waterway"]${a};node["shop"]${b};node["amenity"~"${AM}"]${b};way["shop"]${b};way["amenity"~"${AM}"]${b};);out geom qt;`;
  }

  async function geocode(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=pl&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Wyszukiwarka adresów odpowiedziała błędem ' + r.status);
    const j = await r.json();
    if (!j.length) throw new Error('Nie znalazłem takiego adresu. Spróbuj z miastem, np. „Wołoska 12, Warszawa”.');
    const a = j[0].address || {};
    const area = a.neighbourhood || a.quarter || a.suburb || a.city_district || a.village || a.town || a.city || '';
    return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name, area, street: a.road || '', city: a.city || a.town || a.village || '' };
  }

  async function overpass(lat, lon, onStatus) {
    let last;
    for (const ep of ENDPOINTS) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000);
        const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query(lat, lon)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) {
        last = e;
        if (onStatus) onStatus('Serwer map nie odpowiada, próbuję innego…');
      }
    }
    throw last || new Error('Brak połączenia z serwerami map.');
  }

  function poiCat(t) {
    const s = t.shop, a = t.amenity;
    if (s) {
      if (s === 'vacant') return null;
      if (G.FOODSHOP.has(s)) return 'spozywczy';
      if (s === 'chemist' || s === 'medical_supply') return 'apteka';
      if (['doityourself', 'hardware', 'car_repair', 'car_parts', 'trade', 'paint', 'tools', 'bathroom_furnishing', 'building_materials', 'car'].includes(s)) return 'budowlany';
      if (['electronics', 'mobile_phone', 'computer', 'appliance', 'hifi', 'electrical'].includes(s)) return 'elektronika';
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
      if (['townhall', 'post_office', 'police', 'fire_station', 'community_centre', 'marketplace'].includes(a)) return 'urzad';
    }
    return null;
  }

  function areaKind(t) {
    if (t.amenity === 'parking') return 'parking';
    const l = t.landuse, le = t.leisure, n = t.natural;
    if (n === 'water' || l === 'reservoir' || l === 'basin') return 'water';
    if (n === 'wood' || n === 'scrub' || l === 'forest') return 'wood';
    if (l === 'allotments') return 'allot';
    if (le === 'playground') return 'play';
    if (le === 'pitch' || le === 'sports_centre' || le === 'track') return 'pitch';
    if (le === 'park' || le === 'garden' || l === 'grass' || l === 'meadow' || l === 'village_green' || l === 'recreation_ground' || n === 'grassland') return 'park';
    if (l === 'garages') return 'parking';
    return null;
  }

  const KEEP = ['building', 'building:levels', 'name', 'addr:street', 'addr:housenumber', 'shop', 'amenity'];
  /* Overpass JSON -> lekka geometria w metrach względem środka */
  function toGeo(json, lat0, lon0) {
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    const rd = v => Math.round(v * 2) / 2;
    const P = (la, lo) => [rd((lo - lon0) * kx), rd((lat0 - la) * ky)];
    const geo = { c: [lat0, lon0], b: [], r: [], a: [], w: [], poi: [] };
    for (const el of json.elements || []) {
      const t = el.tags || {};
      if (el.type === 'node') {
        const c = poiCat(t);
        if (c) { const [x, y] = P(el.lat, el.lon); geo.poi.push({ x, y, c, n: t.name || '' }); }
        continue;
      }
      if (el.type !== 'way' || !el.geometry) continue;
      const pts = el.geometry.map(g => P(g.lat, g.lon));
      if (pts.length < 2) continue;
      if (t.building) {
        const tags = {};
        for (const k of KEEP) if (t[k]) tags[k] = t[k];
        geo.b.push({ p: pts, t: tags });
        continue;
      }
      if (t.highway) { geo.r.push({ l: pts, h: t.highway }); continue; }
      if (t.waterway) { geo.w.push({ l: pts }); continue; }
      const k = areaKind(t);
      if (k && pts.length >= 3) geo.a.push({ p: pts, k });
      const c = poiCat(t);
      if (c) {
        let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; }
        geo.poi.push({ x: rd(sx / pts.length), y: rd(sy / pts.length), c, n: t.name || '' });
      }
    }
    return geo;
  }

  /* Osiedle zapasowe, kiedy nie ma sieci albo OSM nie odpowiada */
  function genProc(seed) {
    const rnd = G.mulberry(seed || 2051);
    const geo = { c: [0, 0], b: [], r: [], a: [], w: [], poi: [], proc: true };
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    geo.r.push({ l: [[-R, -150], [R, -150]], h: 'secondary' });
    geo.r.push({ l: [[-120, -R], [-120, R]], h: 'tertiary' });
    geo.r.push({ l: [[140, -150], [140, R]], h: 'residential' });
    geo.r.push({ l: [[-120, 10], [140, 10]], h: 'living_street' });
    geo.r.push({ l: [[-120, 115], [140, 115]], h: 'service' });
    geo.r.push({ l: [[140, 60], [R, 60]], h: 'residential' });
    geo.r.push({ l: [[-R, 60], [-120, 60]], h: 'residential' });
    for (let x = -100; x <= 120; x += 55) geo.r.push({ l: [[x, -140], [x, 220]], h: 'footway' });
    const blocks = [];
    const tryAdd = (x, y, w, h, lv) => {
      const cx = x + w / 2, cy = y + h / 2;
      if (Math.abs(cy + 150) < h / 2 + 12 || Math.abs(cx + 120) < w / 2 + 10 || Math.abs(cx - 140) < w / 2 + 10 || Math.abs(cy - 10) < h / 2 + 8 || Math.abs(cy - 115) < h / 2 + 6) return;
      for (const b of blocks) if (x < b[0] + b[2] + 8 && x + w + 8 > b[0] && y < b[1] + b[3] + 8 && y + h + 8 > b[1]) return;
      blocks.push([x, y, w, h]);
      geo.b.push({ p: rect(x, y, w, h), t: { building: 'apartments', 'building:levels': String(lv), 'addr:street': 'Osiedlowa', 'addr:housenumber': String(blocks.length) } });
    };
    for (let i = 0; i < 40; i++) {
      const tower = rnd() < .3, horiz = rnd() < .55;
      const w = tower ? 22 : (horiz ? 50 + rnd() * 30 : 13), h = tower ? 22 : (horiz ? 13 : 50 + rnd() * 30);
      tryAdd(Math.round(-210 + rnd() * 400), Math.round(-130 + rnd() * 330), Math.round(w), Math.round(h), tower ? 11 : (rnd() < .5 ? 4 : 10));
    }
    geo.b.push({ p: rect(-40, -132, 44, 18), t: { building: 'retail', name: 'Pawilon Handlowy' } });
    geo.poi.push({ x: -30, y: -123, c: 'spozywczy', n: 'Sklep Społem' }, { x: -10, y: -123, c: 'apteka', n: '' }, { x: 0, y: -123, c: 'sklep', n: '' });
    geo.b.push({ p: rect(160, 130, 60, 32), t: { building: 'school', name: 'Szkoła Podstawowa' } });
    geo.poi.push({ x: 190, y: 146, c: 'szkola', n: 'Szkoła Podstawowa' });
    for (let i = 0; i < 7; i++) geo.b.push({ p: rect(-215 + i * 7, 175, 6, 12), t: { building: 'garage' } });
    geo.b.push({ p: rect(-200, -60, 26, 18), t: { building: 'service' } });
    geo.a.push({ p: rect(-60, 130, 120, 80), k: 'park' });
    geo.a.push({ p: rect(-225, 70, 80, 90), k: 'wood' });
    geo.a.push({ p: rect(60, -120, 50, 25), k: 'parking' });
    geo.a.push({ p: rect(-110, 30, 30, 20), k: 'play' });
    const cats = ['spozywczy', 'spozywczy', 'apteka', 'budowlany', 'elektronika', 'biblioteka', 'bank', 'stacja', 'przychodnia', 'ubrania', 'urzad', 'sklep'];
    for (const c of cats) {
      const ang = rnd() * Math.PI * 2, d = 290 + rnd() * 380;
      geo.poi.push({ x: Math.round(Math.cos(ang) * d), y: Math.round(Math.sin(ang) * d), c, n: '' });
    }
    return geo;
  }

  /* ---------- rasteryzacja ---------- */
  // kody terenu
  const T = { GRASS: 0, ROAD: 1, FOOT: 2, PARK: 3, WATER: 4, TREE: 5, PLAY: 6, BLD: 7, PITCH: 8, ALLOT: 9, STUMP: 10 };
  G.T = T;
  const toT = v => (v + R) / TM;
  function pip(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }
  function fillPoly(poly, cb) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [x, y] of poly) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    const tx0 = Math.max(0, Math.floor(toT(minx))), tx1 = Math.min(N - 1, Math.floor(toT(maxx)));
    const ty0 = Math.max(0, Math.floor(toT(miny))), ty1 = Math.min(N - 1, Math.floor(toT(maxy)));
    let n = 0;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (pip((tx + .5) * TM - R, (ty + .5) * TM - R, poly)) { cb(ty * N + tx); n++; }
    }
    return n;
  }
  function stampLine(line, w, cb) {
    const r = (w - 1) / 2;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = toT(line[i][0]), ay = toT(line[i][1]), bx = toT(line[i + 1][0]), by = toT(line[i + 1][1]);
      const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len * 2));
      for (let s = 0; s <= steps; s++) {
        const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps;
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy > r * r + .25) continue;
          const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
          if (tx >= 0 && ty >= 0 && tx < N && ty < N) cb(ty * N + tx);
        }
      }
    }
  }
  const ROADW = { motorway: 5, trunk: 5, primary: 5, secondary: 4, tertiary: 3, residential: 2, unclassified: 2, living_street: 2, service: 1, road: 2 };
  const FOOT = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'track', 'bridleway', 'corridor']);
  function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2); }
  G.polyArea = polyArea;

  /* zwraca {terr, bid, btiles:[[idx...]]} */
  function rasterize(geo, seed) {
    const terr = new Uint8Array(N * N), bid = new Int16Array(N * N).fill(-1);
    const rnd = G.mulberry(seed || 7);
    const order = { park: 0, allot: 1, pitch: 2, play: 3, parking: 4, wood: 5, water: 6 };
    const areas = geo.a.slice().sort((p, q) => order[p.k] - order[q.k]);
    for (const a of areas) {
      fillPoly(a.p, i => {
        if (a.k === 'park') { if (terr[i] === T.GRASS && rnd() < .14) terr[i] = T.TREE; }
        else if (a.k === 'wood') { if (rnd() < .6) terr[i] = T.TREE; }
        else if (a.k === 'allot') terr[i] = T.ALLOT;
        else if (a.k === 'pitch') terr[i] = T.PITCH;
        else if (a.k === 'play') terr[i] = T.PLAY;
        else if (a.k === 'parking') terr[i] = T.PARK;
        else if (a.k === 'water') terr[i] = T.WATER;
      });
    }
    for (const w of geo.w) stampLine(w.l, 2, i => { terr[i] = T.WATER; });
    for (const r of geo.r) if (FOOT.has(r.h)) stampLine(r.l, 1, i => { if (terr[i] !== T.WATER) terr[i] = T.FOOT; });
    for (const r of geo.r) { const w = ROADW[r.h]; if (w) stampLine(r.l, w, i => { terr[i] = T.ROAD; }); }
    const btiles = [];
    geo.b.forEach((b, k) => {
      const tiles = [];
      fillPoly(b.p, i => { if (bid[i] === -1) { terr[i] = T.BLD; bid[i] = k; tiles.push(i); } });
      if (!tiles.length) {
        let sx = 0, sy = 0; for (const [x, y] of b.p) { sx += x; sy += y; }
        const tx = Math.floor(toT(sx / b.p.length)), ty = Math.floor(toT(sy / b.p.length));
        if (tx >= 0 && ty >= 0 && tx < N && ty < N && bid[ty * N + tx] === -1) { const i = ty * N + tx; terr[i] = T.BLD; bid[i] = k; tiles.push(i); }
      }
      btiles.push(tiles);
    });
    // zieleń między blokami
    for (let i = 0; i < N * N; i++) {
      if (terr[i] !== T.GRASS) continue;
      const x = i % N, y = (i - x) / N;
      let nearRoad = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N) { const t = terr[ny * N + nx]; if (t === T.ROAD || t === T.BLD) nearRoad = true; }
      }
      if (!nearRoad && rnd() < .05) terr[i] = T.TREE;
    }
    return { terr, bid, btiles };
  }

  G.OSM = { geocode, overpass, toGeo, genProc, rasterize, poiCat, query };
})(window.G);
