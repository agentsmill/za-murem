/* Za Murem: symulacja spółdzielni */
(function (G) {
  'use strict';
  const N = G.N, TM = G.TM;
  const Sim = G.Sim = {};
  G.POICAT.mieszkania = { name: 'Opuszczone mieszkania', risk: .1, loot: { jedzenie: [1, 3], opal: [1, 3], leki: [0, 1], zlom: [0, 2] }, book: .12, bdom: ['bud', 'cieplo', 'elek', 'med', 'uprawa', 'it'] };

  /* ---------- czas ---------- */
  Sim.day = S => Math.floor(S.t / 1440) + 1;
  Sim.hour = S => Math.floor(S.t / 60) % 24;
  Sim.season = S => Math.floor((Sim.day(S) - 1) / G.SEASON_DAYS) % 4;
  Sim.year = S => 2051 + Math.floor((Sim.day(S) + 15) / 40);
  Sim.clock = S => { const m = Math.floor(S.t % 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  Sim.temp = S => {
    const d = Sim.day(S), s = Sim.season(S), p = ((d - 1) % G.SEASON_DAYS) / G.SEASON_DAYS, h = (S.t % 1440) / 60;
    let base;
    if (s === 0) base = 11 - 11 * p;
    else if (s === 1) base = -3 - 7 * Math.sin(p * Math.PI);
    else if (s === 2) base = 2 + 12 * p;
    else base = 19 + 5 * Math.sin(p * Math.PI);
    const noise = (G.mulberry(S.seed + d * 31)() - .5) * 5;
    const snap = S.snap && S.snap.until > S.t ? S.snap.dT : 0;
    return Math.round((base + noise + snap - 3 * Math.cos((h - 14) / 24 * Math.PI * 2)) * 10) / 10;
  };

  /* ---------- pomocnicze ---------- */
  const law = (S, id) => !!S.laws.signed[id];
  const tech = (S, id) => !!S.techs.done[id];
  Sim.law = law; Sim.tech = tech;
  Sim.alive = S => S.specs.filter(p => !p.dead && !p.gone);
  Sim.spec = (S, id) => S.specs.find(p => p.id === id);
  Sim.ours = S => S.bldgs.filter(b => b.status === 'nasz');
  Sim.pop = S => S.bldgs.reduce((a, b) => a + (b.status === 'nasz' ? b.pop : 0), 0);
  Sim.cap = S => S.bldgs.reduce((a, b) => a + (b.status === 'nasz' && G.RESIDENTIAL.has(b.cls) ? b.cap : 0), 0);
  Sim.onExp = S => S.ekipy.reduce((a, e) => a + e.n, 0);
  Sim.adults = S => Math.round(Sim.pop(S) * .62);
  Sim.available = S => {
    const pop = Sim.pop(S), ad = Math.round(pop * .62);
    let v = ad - Math.round(S.sick * .62) - Sim.onExp(S);
    if (law(S, 'u_warty')) v -= Math.round(ad * .04);
    if (law(S, 'u_seniorzy')) v += Math.round(pop * .18 * .5);
    return Math.max(0, v);
  };
  Sim.facs = S => {
    const out = [];
    for (const b of S.bldgs) if (b.fac) out.push({ k: 'b', i: b.idx, f: b.fac, F: G.FAC[b.fac.id], name: b.name });
    for (const y of S.yard) out.push({ k: 'y', i: y.id, f: y, F: G.FAC[y.fac], name: G.FAC[y.fac].name });
    return out;
  };
  Sim.ref = (S, k, i) => k === 'b' ? S.bldgs[i].fac : S.yard.find(y => y.id === i);
  Sim.assigned = S => Sim.facs(S).reduce((a, x) => a + (x.f.staff || 0), 0);
  Sim.ratio = S => { const as = Sim.assigned(S); return as > 0 ? Math.min(1, Sim.available(S) / as) : 1; };
  Sim.freeWorkers = S => Math.max(0, Sim.available(S) - Sim.assigned(S));
  Sim.workHours = S => [law(S, 'u_zebrania') ? 9 : 8, law(S, 'u_zmiana') ? 20 : 18];
  Sim.isWork = (S, h) => { const [a, b] = Sim.workHours(S); return h >= a && h < b; };
  Sim.pradCap = S => tech(S, 't_akumulatory') ? 150 : 20;
  Sim.know = (S, d) => { let m = 0; for (const p of Sim.alive(S)) m = Math.max(m, p.skills[d] || 0); return m + Math.min(2, S.books[d] || 0); };
  Sim.knowSrc = (S, d) => {
    let best = null; for (const p of Sim.alive(S)) if ((p.skills[d] || 0) > (best ? best.skills[d] : 0)) best = p;
    const parts = []; if (best) parts.push(`${best.name} (${best.skills[d]})`);
    const bk = Math.min(2, S.books[d] || 0); if (bk) parts.push(bk === 1 ? '1 książka' : '2 książki');
    return parts.join(' i ') || 'nikt';
  };
  Sim.defense = S => {
    let d = 2 + S.barykady * 2;
    for (const y of S.yard) if (y.fac === 'wieza' && !y.build) d += (y.staff || 0) * Sim.ratio(S) * (Sim.leaderOk(S, y.leader) && Sim.spec(S, y.leader).skills.obrona ? 1.3 : 1);
    if (law(S, 'u_warty')) d += 3; if (law(S, 'u_godzina')) d += 1; if (law(S, 'u_straz')) d += 4;
    if (S.alertNight === Sim.day(S)) d += 3;
    return Math.round(d * 10) / 10;
  };
  Sim.leaderOk = (S, id) => { if (!id) return false; const p = Sim.spec(S, id); return p && !p.dead && !p.gone && !p.sick; };
  Sim.gm = S => (S.anger > 70 ? .85 : 1) * (S.trust > 70 ? 1.1 : 1) * (law(S, 'u_kartki') ? 1.1 : 1) * (law(S, 'u_samorzad') ? 1.1 : 1) * (tech(S, 't_model') && S.serverOn ? 1.1 : 1);
  function lmult(S, f, dom) {
    if (!Sim.leaderOk(S, f.leader)) return 1;
    const L = Sim.spec(S, f.leader);
    let m = 1 + .15 * (dom ? (L.skills[dom] || 0) : 0);
    if (L.traits.includes('pracowity')) m += .1;
    if (L.traits.includes('leniwy')) m -= .1;
    return m;
  }
  Sim.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  Sim.log = function (S, txt, big) { S.log.push({ t: S.t, txt, big: !!big }); if (S.log.length > 400) S.log.splice(0, S.log.length - 400); G.emit && G.emit('log', txt, big); };
  const addRes = (S, k, v) => { S.res[k] = Math.max(0, S.res[k] + v); if (k === 'prad') S.res.prad = Math.min(Sim.pradCap(S), S.res.prad); };
  Sim.gain = (S, o) => { for (const [k, v] of Object.entries(o)) addRes(S, k, v); };
  Sim.have = (S, o) => Object.entries(o || {}).every(([k, v]) => S.res[k] >= v);
  Sim.pay = (S, o) => { for (const [k, v] of Object.entries(o || {})) S.res[k] -= v; };
  const mood = (S, tr, an) => {
    if (tr) S.trust = G.clamp(S.trust + tr, 0, 100);
    if (an) S.anger = G.clamp(S.anger + (an > 0 && law(S, 'u_komisarz') ? an * .7 : an), 0, 100);
  };
  Sim.mood = mood;

  /* ---------- ludzie ---------- */
  function makeSpec(S, rnd, opts) {
    rnd = rnd || Math.random; opts = opts || {};
    const f = opts.f !== undefined ? opts.f : rnd() < .5;
    const prof = opts.prof || G.pick(G.PROFS, rnd);
    const used = new Set(S.specs.map(p => p.first));
    let first = G.pick(G.NAMES[f ? 'f' : 'm'], rnd), tries = 0;
    while (used.has(first) && tries++ < 20) first = G.pick(G.NAMES[f ? 'f' : 'm'], rnd);
    const sur = G.pick(G.SURN, rnd)[f ? 1 : 0];
    const traits = [];
    const tk = Object.keys(G.TRAITS);
    const nt = rnd() < .45 ? 2 : 1;
    while (traits.length < nt) {
      const t = G.pick(tk, rnd);
      if (traits.includes(t)) continue;
      if (G.TRAIT_PAIRS.some(([a, b]) => (a === t && traits.includes(b)) || (b === t && traits.includes(a)))) continue;
      traits.push(t);
    }
    return { id: 's' + (S.nextId++), first, name: `${first} ${sur}`, f, prof: prof[f ? 1 : 0], skills: Object.assign({}, prof[2]), age: G.ri(prof[3][0], prof[3][1], rnd), traits, home: opts.home !== undefined ? opts.home : -1, assign: null, sick: false, dead: false, gone: false };
  }
  Sim.makeSpec = makeSpec;
  Sim.g = (p, m, f) => p.f ? f : m;

  function killPeople(S, n, why) {
    let dead = 0;
    for (let k = 0; k < n; k++) {
      const ours = Sim.ours(S).filter(b => b.pop > 0);
      const pop = Sim.pop(S); if (!pop) break;
      let r = Math.random() * pop, b = ours[0];
      for (const x of ours) { r -= x.pop; if (r <= 0) { b = x; break; } }
      b.pop--; dead++; S.deaths++;
      if (S.sick > 0) S.sick--;
      const al = Sim.alive(S);
      if (al.length && Math.random() < al.length / Math.max(1, pop) * 1.5) {
        const p = G.pick(al);
        if (!(p.traits.includes('twardy') && Math.random() < .5)) {
          p.dead = true; unassign(S, p);
          Sim.log(S, `Nie żyje ${p.name}, ${p.prof.toLowerCase()}.${why ? ' ' + why : ''}`, true);
        }
      }
      mood(S, -2, law(S, 'u_pochowek') ? 1.5 : 3);
    }
    if (dead) Sim.log(S, dead === 1 ? `Zmarła jedna osoba.${why ? ' ' + why : ''}` : `Zmarło ${dead} osób.${why ? ' ' + why : ''}`, dead >= 3);
    return dead;
  }
  Sim.killPeople = killPeople;
  function unassign(S, p) {
    if (!p.assign) return;
    if (p.assign.k === 'b' || p.assign.k === 'y') { const f = Sim.ref(S, p.assign.k, p.assign.i); if (f && f.leader === p.id) f.leader = null; }
    if (p.assign.k === 'e') { const e = S.ekipy.find(x => x.id === p.assign.i); if (e && e.leader === p.id) e.leader = null; }
    p.assign = null;
  }
  Sim.unassign = unassign;
  function addPeople(S, n) {
    let left = n;
    for (const b of Sim.ours(S).filter(b => G.RESIDENTIAL.has(b.cls)).sort((a, c) => (a.pop / a.cap) - (c.pop / c.cap))) {
      const free = Math.max(0, b.cap - b.pop), put = Math.min(free, left);
      b.pop += put; left -= put; if (!left) break;
    }
    if (left > 0) { const hq = S.bldgs[S.hq]; hq.pop += left; }
    S.stats.maxPop = Math.max(S.stats.maxPop, Sim.pop(S));
  }
  Sim.addPeople = addPeople;
  function joinSpec(S, p) {
    if (p.home < 0) { const ours = Sim.ours(S).filter(b => G.RESIDENTIAL.has(b.cls)); p.home = (G.pick(ours) || S.bldgs[S.hq]).idx; }
    S.specs.push(p);
    Sim.log(S, `${p.name} (${p.prof.toLowerCase()}) ${Sim.g(p, 'dołączył', 'dołączyła')} do spółdzielni.`, true);
  }
  Sim.joinSpec = joinSpec;

  /* ---------- nowa gra ---------- */
  function classify(b, area, cats) {
    const t = b.t.building, am = b.t.amenity;
    if (['garage', 'garages', 'carport', 'shed'].includes(t)) return 'garaz';
    if (t === 'school' || t === 'kindergarten' || t === 'university' || am === 'school' || am === 'kindergarten') return 'szkola';
    if (t === 'church' || t === 'chapel' || am === 'place_of_worship') return 'kosciol';
    if (t === 'hospital' || ['clinic', 'doctors', 'hospital'].includes(am)) return 'przychodnia';
    if (['apartments', 'residential', 'dormitory'].includes(t)) return 'blok';
    if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow'].includes(t)) return 'dom';
    if (['retail', 'commercial', 'supermarket', 'kiosk', 'office'].includes(t) || b.t.shop || cats.length) return area > 150 || cats.length ? 'sklep' : 'inne';
    if (['industrial', 'warehouse', 'service', 'transformer_tower', 'roof', 'hangar'].includes(t)) return 'hala';
    if (area > 350) return 'blok';
    if (area < 45) return 'garaz';
    return 'inne';
  }
  Sim.newGame = function (geo, meta) {
    const seed = meta.seed || ((Math.random() * 1e9) | 0);
    const rnd = G.mulberry(seed);
    let grid = G.OSM.rasterize(geo, seed);
    if (grid.btiles.some(t => !t.length)) { geo = Object.assign({}, geo, { b: geo.b.filter((_, k) => grid.btiles[k].length) }); grid = G.OSM.rasterize(geo, seed); }
    const S = {
      v: 1, seed, name: meta.name || 'Osiedle', addr: meta.addr || '', src: meta.src || 'osm', geo, t: 7 * 60, speed: 1,
      res: { opal: 16, jedzenie: 45, zlom: 12, czesci: 2, leki: 6, prad: 0 },
      trust: 50, anger: 20, sick: 0, hungry: 0, deaths: 0, deathAcc: 0, sickAcc: 0, cureAcc: 0,
      bldgs: [], yard: [], pois: [], specs: [], books: {}, bookList: [], items: {},
      techs: { done: {}, cur: null, prog: 0 }, laws: { signed: {}, last: -1e9, path: null },
      ekipy: [], barykady: 0, felled: [], log: [], event: null, nextEv: 7 * 60 + (8 + rnd() * 5) * 60,
      stats: { startPop: 0, maxPop: 0, expeditions: 0, raids: 0, repelled: 0 },
      gaz: { last: 1, n: 0, ready: false }, ending: null, over: null, rules: { kozy: true }, nextId: 1, serverOn: false,
      today: { opal: 0, jedzenie: 0 }, yesterday: { opal: 0, jedzenie: 0 }, hq: 0
    };
    const C = [N / 2, N / 2];
    // budynki
    const toTile = (x, y) => [(x + G.R) / TM, (y + G.R) / TM];
    const poiIn = geo.b.map(() => []);
    const offmap = [];
    geo.poi.forEach(p => {
      const [tx, ty] = toTile(p.x, p.y);
      if (tx >= 0 && ty >= 0 && tx < N && ty < N) {
        const i = Math.floor(ty) * N + Math.floor(tx), b = grid.bid[i];
        if (b >= 0) { poiIn[b].push(p); return; }
        // najbliższy budynek w promieniu 3 kafelków
        let best = -1, bd = 3.5;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const x = Math.floor(tx) + dx, y = Math.floor(ty) + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const bb = grid.bid[y * N + x]; if (bb >= 0 && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = bb; }
        }
        if (best >= 0) poiIn[best].push(p);
      } else offmap.push(p);
    });
    const counters = {};
    geo.b.forEach((gb, k) => {
      const tiles = grid.btiles[k];
      let sx = 0, sy = 0; for (const i of tiles) { sx += i % N; sy += Math.floor(i / N); }
      const c = [Math.round(sx / tiles.length), Math.round(sy / tiles.length)];
      const area = Math.max(G.polyArea(gb.p), tiles.length * TM * TM * .7);
      const cats = [...new Set(poiIn[k].map(p => p.c))];
      const cls = classify(gb, area, cats);
      let levels = parseInt(gb.t['building:levels'], 10);
      if (!levels || levels > 30) levels = cls === 'blok' ? (area > 700 ? 10 : 5) : cls === 'dom' ? 2 : 1;
      counters[cls] = (counters[cls] || 0) + 1;
      const named = poiIn[k].find(p => p.n);
      const name = gb.t.name || (gb.t['addr:street'] && gb.t['addr:housenumber'] ? `${gb.t['addr:street']} ${gb.t['addr:housenumber']}` : gb.t['addr:housenumber'] ? `${G.CLS[cls]} nr ${gb.t['addr:housenumber']}` : named ? named.n : `${G.CLS[cls]} ${counters[cls]}`);
      let cap = 0;
      if (cls === 'blok') cap = G.clamp(Math.round(area * levels / 55 * 2.2 * .3), 10, 140);
      else if (cls === 'dom') cap = G.ri(3, 6, rnd);
      const lootCats = cats.length ? cats.slice(0, 3) : ({ sklep: ['sklep'], szkola: ['szkola'], przychodnia: ['przychodnia'], garaz: ['garaz'], hala: ['hala'], kosciol: ['kosciol'], inne: ['sklep'] })[cls] || ['mieszkania'];
      S.bldgs.push({ idx: k, name, cls, levels, area: Math.round(area), tiles, c, status: G.RESIDENTIAL.has(cls) ? 'sasiedzi' : 'obcy', pop: 0, cap, temp: 12, heated: false, fac: null, roof: null, visits: 0, stock: 0, lootCats, hq: false, d: Sim.dist(c, C) });
    });
    // start: najbliższe bloki
    const res = S.bldgs.filter(b => b.cls === 'blok').length >= 2 ? S.bldgs.filter(b => b.cls === 'blok') : S.bldgs.filter(b => G.RESIDENTIAL.has(b.cls));
    res.sort((a, b) => a.d - b.d);
    let pop = 0, n = 0;
    for (const b of res) {
      if (n >= 2 && (pop >= 60 || n >= 6)) break;
      b.status = 'nasz'; b.pop = Math.max(3, Math.round(b.cap * (.55 + rnd() * .25))); pop += b.pop; n++;
    }
    if (!n) { // awaryjnie: pierwszy lepszy budynek
      const b = S.bldgs.slice().sort((a, c) => a.d - c.d)[0]; b.cls = 'blok'; b.cap = 40; b.status = 'nasz'; b.pop = 30; pop = 30;
    }
    for (const b of S.bldgs) if (b.status === 'sasiedzi') { if (rnd() < .28) { b.status = 'pusty'; b.pop = 0; } else b.pop = Math.max(2, Math.round(b.cap * (.35 + rnd() * .4))); }
    const hq = Sim.ours(S).sort((a, b) => a.d - b.d)[0]; hq.hq = true; S.hq = hq.idx;
    S.stats.startPop = S.stats.maxPop = Sim.pop(S);
    // miejsca poza mapą
    offmap.forEach(p => { p.d = Math.hypot(p.x, p.y); });
    offmap.sort((a, b) => a.d - b.d);
    const perCat = {};
    for (const p of offmap) {
      if (S.pois.length >= 16) break;
      perCat[p.c] = (perCat[p.c] || 0) + 1; if (perCat[p.c] > 2) continue;
      S.pois.push({ id: S.pois.length, name: p.n || G.POICAT[p.c].name, c: p.c, x: p.x, y: p.y, d: Math.round(p.d), visits: 0 });
    }
    // fachowcy: pokrycie podstawowych dziedzin
    const need = ['cieplo', 'bud', 'med', 'uprawa'];
    const homes = Sim.ours(S).filter(b => G.RESIDENTIAL.has(b.cls));
    for (const d of need) {
      const opts = G.PROFS.filter(p => (p[2][d] || 0) >= 1 && (p[2][d] || 0) <= 3);
      S.specs.push(makeSpec(S, rnd, { prof: G.pick(opts, rnd), home: G.pick(homes, rnd).idx }));
    }
    const extra = 3 + (rnd() < .5 ? 1 : 0);
    for (let k = 0; k < extra; k++) S.specs.push(makeSpec(S, rnd, { home: G.pick(homes, rnd).idx }));
    G.grid = grid;
    Sim.applyFelled(S);
    Sim.log(S, `Spółdzielnia ${S.name}: ${Sim.pop(S)} mieszkańców w ${Sim.ours(S).length} budynkach. Prądu nie ma od trzech lat.`, true);
    return S;
  };
  Sim.rebuildGrid = function (S) {
    G.grid = G.OSM.rasterize(S.geo, S.seed);
    Sim.applyFelled(S);
  };
  Sim.applyFelled = function (S) {
    const g = G.grid; g.occ = new Int16Array(N * N).fill(-1);
    for (const i of S.felled) g.terr[i] = G.T.STUMP;
    for (const y of S.yard) for (let dy = 0; dy < y.h; dy++) for (let dx = 0; dx < y.w; dx++) g.occ[(y.y + dy) * N + y.x + dx] = y.id;
  };

  /* ---------- akcje gracza ---------- */
  Sim.canAdapt = function (S, b, id) {
    const F = G.FAC[id];
    if (F.tech && !tech(S, F.tech)) return 'Wymaga technologii: ' + G.TECH[F.tech].name;
    if (!F.on.includes(b.cls)) return 'Ten typ budynku się nie nadaje.';
    if (b.status === 'ruina') return 'Z ruiny nic nie będzie.';
    if (F.kind === 'roof') { if (b.status !== 'nasz') return 'Najpierw musicie zająć budynek.'; if (b.roof) return 'Dach już zajęty.'; }
    else if (F.demol) { if (b.status === 'sasiedzi') return 'Tu mieszkają ludzie.'; if (b.status === 'nasz' && b.pop > 0) return 'Najpierw wyprowadźcie ludzi.'; if (b.hq) return 'To siedziba zarządu.'; if (b.fac) return 'Budynek ma już funkcję.'; }
    else { if (b.status !== 'nasz') return 'Najpierw musicie zająć budynek.'; if (b.fac) return 'Budynek ma już funkcję.'; }
    if (!Sim.have(S, F.cost)) return 'Brakuje: ' + G.costText(Object.fromEntries(Object.entries(F.cost).filter(([k, v]) => S.res[k] < v).map(([k, v]) => [k, Math.ceil(v - S.res[k])])));
    return '';
  };
  Sim.adapt = function (S, bi, id) {
    const b = S.bldgs[bi], F = G.FAC[id];
    if (Sim.canAdapt(S, b, id)) return false;
    Sim.pay(S, F.cost);
    if (F.kind === 'roof') { b.roof = 'pv'; b.roofBuild = F.build; }
    else {
      b.fac = { id, staff: 0, leader: null, build: F.build };
      if (F.demol) b.stock = G.clamp(Math.round(b.area * b.levels * .03), 15, 300);
    }
    Sim.log(S, `${F.name}: ${F.build ? 'zaczynacie urządzać' : 'zaczynacie'} w miejscu ${b.name}.`);
    G.emit && G.emit('world');
    return true;
  };
  Sim.claimCost = function (S, b) {
    if (b.status === 'sasiedzi') return { jedzenie: Math.max(3, Math.ceil(b.pop * .3)), opal: Math.max(1, Math.ceil(b.pop * .08)) };
    if (b.status === 'pusty') return { opal: 2 };
    if (b.status === 'obcy') return { opal: 1 };
    return null;
  };
  Sim.canClaim = function (S, b) {
    const c = Sim.claimCost(S, b); if (!c) return 'Nie da się.';
    const near = Sim.ours(S).some(o => Sim.dist(o.c, b.c) < 40);
    if (!near) return 'Za daleko od waszych budynków.';
    if (b.status === 'sasiedzi' && S.trust < 45) return 'Sąsiedzi wam nie ufają (potrzeba zaufania 45).';
    if (!Sim.have(S, c)) return 'Brakuje: ' + G.costText(c);
    return '';
  };
  Sim.claim = function (S, bi) {
    const b = S.bldgs[bi]; if (Sim.canClaim(S, b)) return false;
    const c = Sim.claimCost(S, b); Sim.pay(S, c);
    const was = b.status; b.status = 'nasz';
    if (was === 'sasiedzi') {
      mood(S, 2, 0);
      Sim.log(S, `${b.name} dołącza do spółdzielni: ${b.pop} osób więcej.`, true);
      if (Math.random() < .25) joinSpec(S, makeSpec(S, null, { home: b.idx }));
    } else Sim.log(S, `Zajęliście ${b.name}.`);
    S.stats.maxPop = Math.max(S.stats.maxPop, Sim.pop(S));
    G.emit && G.emit('world');
    return true;
  };
  Sim.canPlace = function (S, id, x, y) {
    const F = G.FAC[id], g = G.grid, T = G.T;
    if (F.tech && !tech(S, F.tech)) return 'Wymaga technologii: ' + G.TECH[F.tech].name;
    if (F.max && S.yard.filter(o => o.fac === id).length >= F.max) return `Najwyżej ${F.max} takie obiekty.`;
    for (let dy = 0; dy < F.h; dy++) for (let dx = 0; dx < F.w; dx++) {
      const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= N || ty >= N) return 'Poza mapą.';
      const i = ty * N + tx, t = g.terr[i];
      if (g.occ[i] >= 0) return 'Tu już coś stoi.';
      if (![T.GRASS, T.PLAY, T.PITCH, T.ALLOT, T.PARK, T.STUMP, T.FOOT].includes(t)) return 'Tu nie da się postawić (droga, budynek albo drzewa).';
    }
    const cx = x + F.w / 2, cy = y + F.h / 2;
    if (!Sim.ours(S).some(o => Sim.dist(o.c, [cx, cy]) < 32)) return 'Za daleko od waszych bloków.';
    if (F.needTrees) {
      let n = 0; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy; if (tx >= 0 && ty >= 0 && tx < N && ty < N && g.terr[ty * N + tx] === T.TREE) n++; }
      if (n < 6) return 'Za mało drzew w okolicy.';
    }
    if (!Sim.have(S, F.cost)) return 'Brakuje: ' + G.costText(F.cost);
    return '';
  };
  Sim.place = function (S, id, x, y) {
    if (Sim.canPlace(S, id, x, y)) return false;
    const F = G.FAC[id]; Sim.pay(S, F.cost);
    const o = { id: 'y' + (S.nextId++), fac: id, x, y, w: F.w, h: F.h, staff: 0, leader: null, build: F.build };
    S.yard.push(o); Sim.applyFelled(S);
    Sim.log(S, `${F.name}: budowa na podwórku.`);
    G.emit && G.emit('world');
    return o;
  };
  Sim.setStaff = function (S, k, i, n) {
    const f = Sim.ref(S, k, i); if (!f) return;
    const F = G.FAC[k === 'b' ? f.id : f.fac];
    const max = Math.min(F.slots, (f.staff || 0) + Sim.freeWorkers(S));
    f.staff = G.clamp(n, 0, max);
  };
  Sim.setLeader = function (S, k, i, sid) {
    const f = Sim.ref(S, k, i); if (!f) return;
    if (f.leader) { const old = Sim.spec(S, f.leader); if (old) old.assign = null; }
    f.leader = null;
    if (sid) { const p = Sim.spec(S, sid); if (!p || p.dead || p.gone) return; unassign(S, p); f.leader = sid; p.assign = { k, i }; }
  };
  Sim.removeFac = function (S, k, i) {
    const f = Sim.ref(S, k, i); if (!f) return;
    Sim.setLeader(S, k, i, null);
    if (k === 'b') S.bldgs[i].fac = null; else { S.yard = S.yard.filter(y => y.id !== i); Sim.applyFelled(S); }
    G.emit && G.emit('world');
  };
  Sim.barykadyCost = S => ({ zlom: 6 + S.barykady * 3, opal: 2 });
  Sim.raiseBarykady = function (S) {
    if (!tech(S, 't_barykady') || S.barykady >= 5) return false;
    const c = Sim.barykadyCost(S); if (!Sim.have(S, c)) return false;
    Sim.pay(S, c); S.barykady++; Sim.log(S, `Barykady wokół osiedla: poziom ${S.barykady}.`); return true;
  };

  /* ---------- badania ---------- */
  Sim.techState = function (S, id) {
    const t = G.TECH[id];
    if (tech(S, id)) return { s: 'done' };
    if (S.techs.cur === id) return { s: 'cur' };
    const miss = t.req.filter(r => !tech(S, r));
    if (miss.length) return { s: 'lock', why: 'Najpierw: ' + miss.map(r => G.TECH[r].name).join(', ') };
    if (t.item && !S.items[t.item]) return { s: 'item', why: 'Potrzebne: ' + G.ITEMS[t.item] };
    const k = Sim.know(S, t.dom);
    if (k < t.lvl) return { s: 'know', why: `Nikt się na tym nie zna. Potrzeba: ${G.DOM[t.dom]} ${t.lvl}, macie ${k}.` };
    return { s: 'ok' };
  };
  Sim.startResearch = function (S, id) {
    const st = Sim.techState(S, id).s; if (st !== 'ok' && st !== 'cur') return false;
    if (S.techs.cur !== id) { S.techs.cur = id; S.techs.prog = S.techs.saved && S.techs.saved[id] || 0; }
    return true;
  };
  function finishTech(S) {
    const id = S.techs.cur, t = G.TECH[id];
    S.techs.done[id] = true; S.techs.cur = null; S.techs.prog = 0;
    mood(S, 1, 0);
    Sim.log(S, `Odkrycie: ${t.name}. ${t.desc}`, true);
    G.emit && G.emit('tech', id);
  }

  /* ---------- uchwały ---------- */
  Sim.lawState = function (S, id) {
    const L = G.LAW[id];
    if (law(S, id)) return { s: 'done' };
    if (L.path === 'porzadek' && S.laws.path === 'wspolnota') return { s: 'lock', why: 'Wybraliście drogę wspólnoty.' };
    if (L.path === 'wspolnota' && S.laws.path === 'porzadek') return { s: 'lock', why: 'Wybraliście drogę porządku.' };
    if (L.tech && !tech(S, L.tech)) return { s: 'lock', why: 'Wymaga technologii: ' + G.TECH[L.tech].name };
    const miss = (L.req || []).filter(r => !law(S, r));
    if (miss.length) return { s: 'lock', why: 'Najpierw: ' + miss.map(r => G.LAW[r].name).join(', ') };
    const cd = (law(S, 'u_sekretarz') ? G.LAW_CD / 2 : G.LAW_CD) - (S.t - S.laws.last);
    if (cd > 0) return { s: 'cd', why: `Kolejną uchwałę za ${Math.ceil(cd / 60)} h.` };
    return { s: 'ok' };
  };
  Sim.signLaw = function (S, id) {
    if (Sim.lawState(S, id).s !== 'ok') return false;
    const L = G.LAW[id];
    S.laws.signed[id] = true; S.laws.last = S.t;
    if (L.path === 'porzadek' || L.path === 'wspolnota') S.laws.path = L.path;
    const imm = { u_seniorzy: [0, 3], u_dokwaterowanie: [3, 0], u_pochowek: [2, 0], u_polityka: [-2, 0] }[id];
    if (imm) mood(S, imm[0], imm[1]);
    Sim.log(S, `Uchwała zarządu: ${L.name}.`, true);
    if (L.final) { S.ending = L.final; G.emit && G.emit('ending', L.final); }
    return true;
  };

  /* ---------- ekipy ---------- */
  function walk(i) { const t = G.grid.terr[i]; return t !== G.T.BLD && t !== G.T.WATER; }
  function bfs(start, goals) {
    if (goals.has(start)) return [start];
    const prev = new Int32Array(N * N).fill(-1); prev[start] = start; const q = [start]; let qi = 0;
    while (qi < q.length) {
      const c = q[qi++], cx = c % N, cy = (c - cx) / N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = ny * N + nx; if (prev[n] !== -1 || !walk(n)) continue;
        prev[n] = c;
        if (goals.has(n)) { const p = [n]; let k = n; while (k !== start) { k = prev[k]; p.push(k); } return p.reverse(); }
        q.push(n);
      }
    }
    return null;
  }
  function doorOf(S, b) {
    const goals = new Set();
    for (const i of b.tiles) { const x = i % N, y = (i - x) / N; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && walk(ny * N + nx)) goals.add(ny * N + nx); } }
    return goals;
  }
  Sim.hqStart = function (S) {
    const hq = S.bldgs[S.hq], goals = doorOf(S, hq);
    let best = null, bd = 1e9; for (const g of goals) { const x = g % N, y = (g - x) / N, d = Math.hypot(x - hq.c[0], y - hq.c[1]); if (d < bd) { bd = d; best = g; } }
    return best;
  };
  Sim.maxEkipy = S => 2 + (tech(S, 't_mesh') ? 1 : 0);
  Sim.targetInfo = function (S, tg) {
    if (tg.k === 'b') { const b = S.bldgs[tg.i]; return { name: b.name, cats: b.lootCats, d: Math.round(b.d * TM), visits: b.visits, off: false }; }
    const p = S.pois[tg.i]; return { name: p.name, cats: [p.c], d: p.d, visits: p.visits, off: true, p };
  };
  Sim.sendEkipa = function (S, tg, n, leader) {
    if (S.ekipy.length >= Sim.maxEkipy(S)) return 'Wszystkie ekipy są w terenie.';
    if (n < 1 || n > Sim.available(S)) return 'Za mało ludzi zdolnych do wyjścia.';
    const start = Sim.hqStart(S); if (start === null) return 'Z siedziby zarządu nie da się wyjść.';
    let goals;
    if (tg.k === 'b') goals = doorOf(S, S.bldgs[tg.i]);
    else {
      const p = S.pois[tg.i], ang = Math.atan2(p.y, p.x);
      const ex = G.clamp(Math.round(N / 2 + Math.cos(ang) * N), 0, N - 1), ey = G.clamp(Math.round(N / 2 + Math.sin(ang) * N), 0, N - 1);
      goals = new Set(); let bd = 1e9, cand = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (x > 2 && y > 2 && x < N - 3 && y < N - 3) continue; const i = y * N + x; if (!walk(i)) continue; const d = Math.hypot(x - ex, y - ey); cand.push([d, i]); }
      cand.sort((a, b) => a[0] - b[0]); for (const [, i] of cand.slice(0, 6)) goals.add(i);
    }
    const path = bfs(start, goals); if (!path) return 'Nie da się tam dojść.';
    const e = { id: 'e' + (S.nextId++), n, leader: leader || null, tg, state: 'idzie', path, pos: 0, x: (path[0] % N) + .5, y: Math.floor(path[0] / N) + .5, until: 0, res: null };
    if (leader) { const p = Sim.spec(S, leader); unassign(S, p); p.assign = { k: 'e', i: e.id }; }
    S.ekipy.push(e); S.stats.expeditions++;
    Sim.log(S, `Ekipa (${n} os.) wyrusza: ${Sim.targetInfo(S, tg).name}.`);
    return '';
  };
  function rollExpedition(S, e) {
    const info = Sim.targetInfo(S, e.tg), L = e.leader ? Sim.spec(S, e.leader) : null;
    const tgt = e.tg.k === 'b' ? S.bldgs[e.tg.i] : S.pois[e.tg.i];
    const mult = Math.max(.2, 1 - .25 * (tgt.visits || 0)); tgt.visits = (tgt.visits || 0) + 1;
    const sizeF = Math.pow(e.n / 4, .7) * (tech(S, 't_drony') ? 1.2 : 1) * (L && L.prof.startsWith('Kurier') ? 1.2 : 1);
    const cats = info.cats.slice(0, 3), share = cats.length > 1 ? .6 : 1;
    const loot = {}; let book = null, item = null;
    for (const c of cats) {
      const P = G.POICAT[c] || G.POICAT.sklep;
      for (const [k, [a, b]] of Object.entries(P.loot)) { const v = Math.round(G.ri(a, b) * mult * sizeF * share); if (v > 0) loot[k] = (loot[k] || 0) + v; }
      if (!book && P.book && Math.random() < P.book * mult) { const d = G.pick(P.bdom); book = { d, name: G.pick(G.BOOKS[d]) }; }
      if (P.item && !S.items[P.item] && (Math.random() < .5 || tgt.visits >= 2)) item = P.item;
    }
    const h = Sim.hour(S), night = h < 6 || h >= 20;
    let risk = Math.max(...cats.map(c => (G.POICAT[c] || G.POICAT.sklep).risk)) * (1 + info.d / 900);
    if (L) { if (L.traits.includes('odwazny')) risk *= .7; if (L.traits.includes('tchorz')) risk *= 1.3; risk *= 1 - .1 * (L.skills.obrona || 0); }
    if (tech(S, 't_drony')) risk *= .7; if (tech(S, 't_mesh')) risk *= .85; if (night) risk *= 1.5; if (e.n < 3) risk *= 1.3;
    const r = { loot, book, item, hurt: 0, died: 0, leaderDied: false };
    if (Math.random() < risk) {
      r.hurt = G.ri(1, e.n);
      for (const k of Object.keys(loot)) loot[k] = Math.floor(loot[k] / 2);
      if (Math.random() < .3 * (L && L.traits.includes('twardy') ? .5 : 1)) { r.died = 1; if (L && Math.random() < .35) r.leaderDied = true; }
    }
    e.res = r;
  }
  function deliver(S, e) {
    const r = e.res, info = Sim.targetInfo(S, e.tg), L = e.leader ? Sim.spec(S, e.leader) : null;
    const parts = [];
    Sim.gain(S, r.loot);
    const lt = G.costText(r.loot); parts.push(lt ? `przynieśli ${lt}` : 'wrócili z pustymi rękami');
    if (r.book) {
      if ((S.books[r.book.d] || 0) >= 2) { addRes(S, 'opal', 1); parts.push(`książkę „${r.book.name}” spalono na podpałkę, bo takie już macie`); }
      else { S.books[r.book.d] = (S.books[r.book.d] || 0) + 1; S.bookList.push(r.book.name); parts.push(`znaleźli książkę „${r.book.name}” (${G.DOM[r.book.d]} +1)`); }
    }
    if (r.item) { S.items[r.item] = true; parts.push(`znaleźli: ${G.ITEMS[r.item]}`); }
    if (r.hurt) { S.sick = Math.min(Sim.pop(S), S.sick + r.hurt); parts.push(`${r.hurt} ${r.hurt === 1 ? 'osoba ranna' : 'osoby ranne'}`); }
    const big = !!(r.book || r.item || r.died);
    Sim.log(S, `Ekipa wróciła (${info.name}): ${parts.join(', ')}.`, big);
    if (r.died) {
      if (r.leaderDied && L && !L.dead) { L.dead = true; unassign(S, L); Sim.log(S, `Na wyprawie zginął ${L.name}, ${L.prof.toLowerCase()}.`, true); }
      killPeople(S, 1, 'Zginęła na wyprawie.');
    } else if (!r.hurt) mood(S, 1, 0);
    if (L) unassign(S, L);
  }

  /* ---------- wydarzenia ---------- */
  const EV = [];
  G.EVENTS = EV;
  const pickB = (S, f) => G.pick(Sim.ours(S).filter(f || (b => G.RESIDENTIAL.has(b.cls) && b.pop > 0)));
  EV.push({
    id: 'uchodzcy', w: S => law(S, 'u_dokwaterowanie') ? 6 : 3,
    make: S => ({ n: G.ri(4, 12), from: G.pick(['z Wilanowa', 'z zamkniętego osiedla z ochroną', 'z bloku, w którym pękł pion', 'ze wsi, gdzie skończyła się woda', 'z kampusu dawnej korporacji', 'z osiedla za obwodnicą']), spec: Math.random() < .3 ? makeSpec(S) : null }),
    title: () => 'Ludzie pod szlabanem',
    text: (S, d) => `${d.n} osób ${d.from} stoi pod szlabanem i prosi o miejsce. Wolnych miejsc w waszych blokach: ${Math.max(0, Sim.cap(S) - Sim.pop(S))}.${d.spec ? ` Wśród nich ${Sim.g(d.spec, 'jest', 'jest')} ${d.spec.prof.toLowerCase()}, ${d.spec.name}.` : ''}`,
    choices: (S, d) => [
      { label: 'Przyjąć wszystkich', ok: true, ai: true, run: () => { addPeople(S, d.n); mood(S, 1, Sim.pop(S) > Sim.cap(S) ? 2 : 0); if (d.spec) joinSpec(S, d.spec); Sim.log(S, `Przyjęliście ${d.n} osób ${d.from}.`, true); } },
      { label: 'Dać Jedzenie 3 na drogę', ok: S.res.jedzenie >= 3, run: () => { addRes(S, 'jedzenie', -3); mood(S, 1, 0); } },
      { label: 'Odprawić', ok: true, run: () => { mood(S, -2, -1); } }
    ]
  });
  EV.push({
    id: 'lodowka', w: () => 1.2, once: true, make: () => ({}),
    title: () => 'Lodówka na abonament',
    text: () => 'W mieszkaniu na trzecim piętrze stoi pełna lodówka. Zamknięta na amen, bo abonament wygasł w 2048 roku, a serwer producenta razem z nim.',
    choices: S => [
      { label: 'Złamać zabezpieczenie (Elektryka 2)', ok: Sim.know(S, 'elek') >= 2, ai: true, run: () => { addRes(S, 'jedzenie', 8); Sim.log(S, 'Lodówka otwarta. W środku słoiki i coś, co kiedyś było serem.'); } },
      { label: 'Rozbić łomem', ok: true, run: () => { addRes(S, 'jedzenie', 4); addRes(S, 'zlom', 2); } }
    ]
  });
  EV.push({
    id: 'dron', w: () => 1, once: true, make: () => ({}),
    title: () => 'Dron dostawczy',
    text: () => 'Nad osiedlem od trzech lat krąży dron z zamówieniem, którego nikt nie odebrał. Ładuje się ze słońca i nie odpuszcza.',
    choices: S => [
      { label: 'Zestrzelić z procy', ok: true, ai: true, run: () => { addRes(S, 'czesci', 3); Sim.log(S, 'Dron spadł za garażami. W paczce zestaw sushi z 2048 roku, nikt nie spróbował.'); } },
      { label: 'Zostawić, niech lata', ok: true, run: () => { mood(S, 1, -1); Sim.log(S, 'Dron zostaje maskotką osiedla.'); } }
    ]
  });
  EV.push({
    id: 'influencer', w: () => .8, once: true, make: S => ({ p: makeSpec(S, null, { f: true, prof: G.PROFS.find(p => p[0].startsWith('Influencer')) }) }),
    title: () => 'Influencerka survivalu',
    text: (S, d) => `Pod bramą nagrywa vloga ${d.p.name} z ring lightem na baterie. Mówi, że ma dwa miliony obserwujących. Internetu nie ma od trzech lat.`,
    choices: (S, d) => [
      { label: 'Przyjąć do spółdzielni', ok: true, run: () => { joinSpec(S, d.p); addPeople(S, 1); } },
      { label: 'Niech nagrywa gdzie indziej', ok: true, ai: true, run: () => { } }
    ]
  });
  EV.push({
    id: 'kradziez', w: S => S.res.jedzenie > 10 ? (law(S, 'u_godzina') ? .6 : 1.5) : 0,
    make: S => { const loss = Math.max(2, Math.round(S.res.jedzenie * .15)); addRes(S, 'jedzenie', -loss); return { loss, b: S.bldgs[S.hq].name }; },
    title: () => 'Kradzież z piwnicy',
    text: (S, d) => `Ktoś wyniósł nocą z piwnicy w budynku ${d.b} Jedzenie ${d.loss}. Ślady prowadzą do mieszkania na parterze.`,
    choices: S => {
      const c = [];
      if (law(S, 'u_sad')) c.push({ label: 'Sąd koleżeński', ok: true, ai: true, run: () => { mood(S, 1, -2); Sim.log(S, 'Sąd koleżeński: sprawca odpracuje szkodę przy kuchni.'); } });
      c.push({ label: 'Wyrzucić sprawcę z osiedla', ok: true, ai: !law(S, 'u_sad'), run: () => { const b = pickB(S); if (b) b.pop--; mood(S, -2, -2); } });
      c.push({ label: 'Przymknąć oko', ok: true, run: () => { mood(S, 0, 3); } });
      return c;
    }
  });
  EV.push({
    id: 'klotnia', w: S => Sim.alive(S).length >= 3 ? 1 : 0,
    make: S => { const a = Sim.alive(S).sort(() => Math.random() - .5); return { a: a[0].id, b: a[1].id }; },
    title: () => 'Kłótnia o grafik',
    text: (S, d) => { const A = Sim.spec(S, d.a), B = Sim.spec(S, d.b); return `${A.name} i ${B.name} pokłócili się o grafik dyżurów przy kozie. Pół klatki stoi po jednej stronie, pół po drugiej.`; },
    choices: (S, d) => {
      const A = Sim.spec(S, d.a), B = Sim.spec(S, d.b);
      const side = (W, L) => () => { mood(S, 0, 1); if (Math.random() < .3) { L.gone = true; unassign(S, L); Sim.log(S, `${L.name} ${Sim.g(L, 'obraził się i wyprowadził', 'obraziła się i wyprowadziła')} do innego osiedla.`, true); } };
      return [
        { label: 'Mediacja w świetlicy', ok: true, ai: true, run: () => { mood(S, 1, -1); } },
        { label: `Rację ma ${A.first}`, ok: true, run: side(A, B) },
        { label: `Rację ma ${B.first}`, ok: true, run: side(B, A) }
      ];
    }
  });
  EV.push({
    id: 'grypa', w: S => Sim.season(S) <= 1 && Sim.pop(S) > 15 ? 1.4 : .3,
    make: S => { const b = pickB(S); return b ? { b: b.idx } : null; },
    title: (S, d) => `Grypa w budynku ${S.bldgs[d.b].name}`,
    text: () => 'Kaszle pół bloku. Jeśli nic nie zrobicie, za dwa dni będzie kaszleć pół osiedla.',
    choices: S => [
      { label: 'Kwarantanna bloku', ok: true, ai: true, run: () => { S.sick = Math.min(Sim.pop(S), S.sick + 2); mood(S, 0, 2); } },
      { label: 'Nic nie robić', ok: true, run: () => { S.sick = Math.min(Sim.pop(S), S.sick + 8); } }
    ]
  });
  EV.push({
    id: 'pozar', w: S => S.bldgs.some(b => b.status === 'nasz' && b.heated) ? 1 : 0,
    make: S => { const b = pickB(S, b => b.status === 'nasz' && b.heated && b.pop > 0); return b ? { b: b.idx } : null; },
    title: () => 'Pożar od kozy',
    text: (S, d) => `W budynku ${S.bldgs[d.b].name} zapaliło się mieszkanie od źle postawionej kozy. Dym idzie na klatkę.`,
    choices: (S, d) => [
      { label: 'Gasić wszyscy razem', ok: true, ai: true, run: () => { addRes(S, 'opal', -3); S.sick = Math.min(Sim.pop(S), S.sick + 1); mood(S, 1, 0); Sim.log(S, 'Pożar ugaszony. Spłonął zapas opału z piwnicy.'); } },
      { label: 'Ewakuować klatkę', ok: true, run: () => { const b = S.bldgs[d.b]; b.cap = Math.max(4, Math.round(b.cap * .85)); mood(S, 0, 2); Sim.log(S, `Klatka w budynku ${b.name} spłonęła. Mniej miejsc do mieszkania.`); } }
    ]
  });
  EV.push({
    id: 'automat', w: () => .9, once: true, make: () => ({}),
    title: () => 'Automat paczkowy otworzył się sam',
    text: () => 'Po trzech latach automat z paczkami przy pawilonie otworzył wszystkie skrytki naraz. Pod spodem robi się tłum.',
    choices: S => [
      { label: 'Podzielić po równo', ok: true, ai: true, run: () => { mood(S, 2, -1); addRes(S, 'czesci', 2); addRes(S, 'leki', 1); } },
      { label: 'Zabrać do magazynu spółdzielni', ok: true, run: () => { addRes(S, 'czesci', 4); addRes(S, 'leki', 2); addRes(S, 'opal', 2); mood(S, -1, 3); } }
    ]
  });
  EV.push({
    id: 'auto', w: () => .9, once: true, make: () => ({}),
    title: () => 'Samochód czeka na aktualizację',
    text: () => 'Na parkingu stoi autonomiczne auto, które od 2048 roku czeka na aktualizację. Mruga światłami, kiedy ktoś przechodzi.',
    choices: S => [
      { label: 'Rozebrać na akumulatory i części', ok: true, ai: true, run: () => { addRes(S, 'czesci', 4); addRes(S, 'zlom', 3); } },
      { label: 'Zrobić z niego kurnik', ok: true, run: () => { addRes(S, 'jedzenie', 5); mood(S, 1, 0); } }
    ]
  });
  EV.push({
    id: 'radio_sos', w: S => S.bldgs.some(b => b.fac && b.fac.id === 'radio' && !b.fac.build && b.fac.staff) ? 1.4 : 0, make: () => ({}),
    title: () => 'Wołanie przez radio',
    text: () => 'Osiedle z drugiej strony rzeki prosi o leki. Mają chore dzieci i części na wymianę.',
    choices: S => [
      { label: 'Wysłać Leki 3', ok: S.res.leki >= 3, ai: true, run: () => { addRes(S, 'leki', -3); addRes(S, 'czesci', 5); mood(S, 3, 0); } },
      { label: 'Udawać, że nikt nie słyszał', ok: true, run: () => { mood(S, -1, 0); } }
    ]
  });
  const OFFERS = [{ give: { czesci: 3 }, take: { jedzenie: 5 } }, { give: { zlom: 8 }, take: { opal: 4 } }, { give: { leki: 2 }, take: { zlom: 5 } }, { give: { jedzenie: 8 }, take: { czesci: 2, zlom: 2 } }, { give: { opal: 8 }, take: { jedzenie: 4 } }, { give: { zlom: 10 }, take: { jedzenie: 4, opal: 2 } }];
  const tradeEv = (id, title, text, w) => ({
    id, w, make: () => { const o = OFFERS.slice().sort(() => Math.random() - .5); return { o: [o[0], o[1]] }; },
    title: () => title, text: () => text,
    choices: (S, d) => d.o.map(o => ({ label: `Dostać ${G.costText(o.give)} za ${G.costText(o.take)}`, ok: Sim.have(S, o.take), run: () => { Sim.pay(S, o.take); Sim.gain(S, o.give); Sim.log(S, `Wymiana: ${G.costText(o.give)} za ${G.costText(o.take)}.`); } })).concat([{ label: 'Nic nie bierzemy', ok: true, run: () => { } }])
  });
  EV.push(tradeEv('handlarz', 'Handlarz z wózkiem', 'Pod szlabanem stoi facet z wózkiem z marketu. Wymieni jedną rzecz i idzie dalej.', () => 1.6));
  EV.push(tradeEv('handel_radio', 'Handel przez radio', 'Osada spod lasu nadaje ofertę. Kurier przyjdzie jutro rano.', S => S.bldgs.some(b => b.fac && b.fac.id === 'radio' && !b.fac.build && b.fac.staff) ? 2 : 0));
  EV.push({
    id: 'dzieci', w: () => 1.4, make: () => ({}),
    title: () => 'Dzieciaki ze złomem',
    text: () => 'Dzieciaki z sąsiednich bloków przyciągnęły wózek blach i rur z rozbiórki pawilonu. Chcą coś do jedzenia.',
    choices: S => [
      { label: 'Złom 6 za Jedzenie 1', ok: S.res.jedzenie >= 1, ai: true, run: () => { addRes(S, 'jedzenie', -1); addRes(S, 'zlom', 6); } },
      { label: 'Złom 10 za Jedzenie 2', ok: S.res.jedzenie >= 2, run: () => { addRes(S, 'jedzenie', -2); addRes(S, 'zlom', 10); } },
      { label: 'Nie teraz', ok: true, run: () => { } }
    ]
  });
  EV.push({
    id: 'fachowiec', w: S => Sim.alive(S).length < 14 ? 1.5 : 0,
    make: S => {
      const known = new Set(G.TECH_DOMS.filter(d => Sim.know(S, d) >= 3));
      const opts = G.PROFS.filter(p => Object.keys(p[2]).some(d => G.TECH_DOMS.includes(d) && !known.has(d)));
      const b = pickB(S); if (!b) return null;
      return { p: makeSpec(S, null, { prof: G.pick(opts.length ? opts : G.PROFS), home: b.idx }), b: b.name };
    },
    title: () => 'Ktoś się na czymś zna',
    text: (S, d) => `${d.p.name} z budynku ${d.b} ${Sim.g(d.p, 'przyznał', 'przyznała')} przy ognisku, że ${Sim.g(d.p, 'był', 'była')} kiedyś: ${d.p.prof.toLowerCase()}. Do tej pory ${Sim.g(d.p, 'siedział', 'siedziała')} cicho, bo bał${Sim.g(d.p, '', 'a')} się, że każą ${Sim.g(d.p, 'mu', 'jej')} pracować.`,
    choices: (S, d) => [
      { label: 'Wciągnąć do roboty', ok: true, ai: true, run: () => { joinSpec(S, d.p); mood(S, 1, 0); } },
      { label: 'Niech odpoczywa', ok: true, run: () => { } }
    ]
  });
  EV.push({
    id: 'ksiazki', w: () => 1, make: () => { const d = G.pick(G.TECH_DOMS); return { d, name: G.pick(G.BOOKS[d]) }; },
    title: () => 'Karton w piwnicy',
    text: (S, d) => `W piwnicy znalazł się karton z książkami. Na wierzchu leży „${d.name}”.`,
    choices: (S, d) => [
      { label: 'Do świetlicy', ok: true, ai: true, run: () => { if ((S.books[d.d] || 0) < 2) { S.books[d.d] = (S.books[d.d] || 0) + 1; S.bookList.push(d.name); Sim.log(S, `Nowa książka w świetlicy: „${d.name}” (${G.DOM[d.d]} +1).`, true); } else addRes(S, 'opal', 1); } },
      { label: 'Na podpałkę', ok: true, run: () => { addRes(S, 'opal', 3); } }
    ]
  });
  EV.push({
    id: 'krypto', w: () => .7, once: true, make: () => ({}),
    title: () => 'Zapłata w tokenach',
    text: () => 'Sąsiad z bloku obok chce kupić od was Opał 5. Płaci tokenami, które według niego zaraz odbiją.',
    choices: S => [
      { label: 'Przyjąć tokeny', ok: S.res.opal >= 5, run: () => { addRes(S, 'opal', -5); Sim.log(S, 'Tokeny dalej czekają na odbicie.'); } },
      { label: 'Wyśmiać', ok: true, ai: true, run: () => { mood(S, 0, -1); } }
    ]
  });
  EV.push({
    id: 'czynsz', w: () => .8, once: true, make: () => ({}),
    title: () => 'Zaległy czynsz za 2047',
    text: () => 'Ktoś przyniósł list z dawnej spółdzielni: zaległość za 2047 rok plus odsetki. Ludzie pytają, czy nowy zarząd też będzie ściągał.',
    choices: S => [
      { label: 'Umorzyć wszystkim', ok: true, ai: true, run: () => { mood(S, 3, 0); } },
      { label: 'Spalić list w ognisku', ok: true, run: () => { mood(S, 0, -2); } }
    ]
  });
  EV.push({
    id: 'aktywisci', w: S => Sim.season(S) <= 1 ? .8 : .2, once: true, make: () => ({}),
    title: () => 'Protest przeciw kozom',
    text: () => 'Grupka aktywistów z sąsiedniego osiedla protestuje przeciw dymowi z waszych kóz. Sami są zmarznięci na kość.',
    choices: S => [
      { label: 'Zaprosić do ciepła', ok: true, ai: true, run: () => { addPeople(S, 4); mood(S, 1, 0); } },
      { label: 'Umówić się na wspólne sadzenie drzew wiosną', ok: true, run: () => { mood(S, 1, -1); } }
    ]
  });
  EV.push({
    id: 'smog', w: S => Sim.season(S) === 1 && tech(S, 't_kozy') && S.rules.kozy ? 1 : 0, make: () => ({}),
    title: () => 'Smog nad osiedlem',
    text: () => 'Kozy w każdym mieszkaniu robią swoje. Nad blokami wisi szara zupa, dzieci kaszlą.',
    choices: S => [
      { label: 'Palić tylko w nocy', ok: true, run: () => { S.sick = Math.max(0, S.sick - 2); mood(S, 0, 1); S.smogUntil = S.t + 24 * 60; } },
      { label: 'Trudno, ciepło ważniejsze', ok: true, ai: true, run: () => { S.sick = Math.min(Sim.pop(S), S.sick + 4); } }
    ]
  });
  EV.push({
    id: 'obserwacja', w: S => Sim.day(S) > 4 ? 1 : 0, make: () => ({}),
    title: () => 'Ktoś was obserwuje',
    text: () => 'Z dachu galerii handlowej ktoś patrzy przez lornetkę na wasze bloki. Od rana.',
    choices: S => [
      { label: 'Podwójna warta tej nocy', ok: true, ai: true, run: () => { S.alertNight = Sim.day(S); mood(S, 0, 1); } },
      { label: 'Udawać, że nic się nie dzieje', ok: true, run: () => { S.raidBoost = Sim.day(S); } }
    ]
  });
  EV.push({
    id: 'wesele', w: S => S.trust > 40 && Sim.alive(S).length >= 2 ? .8 : 0,
    make: S => { const a = Sim.alive(S).sort(() => Math.random() - .5); return { a: a[0].id, b: a[1].id }; },
    title: () => 'Wesele na klatce',
    text: (S, d) => `${Sim.spec(S, d.a).name} i ${Sim.spec(S, d.b).name} chcą wziąć ślub w świetlicy. Pierwszy od upadku.`,
    choices: S => [
      { label: 'Wyprawić wesele (Jedzenie 6)', ok: S.res.jedzenie >= 6, ai: true, run: () => { addRes(S, 'jedzenie', -6); mood(S, 4, -4); Sim.log(S, 'Wesele do rana. Ktoś grał na akordeonie.', true); } },
      { label: 'Skromnie, bez imprezy', ok: true, run: () => { mood(S, 1, 0); } }
    ]
  });
  EV.push({
    id: 'odejscie', w: S => S.trust < 35 && Sim.alive(S).length ? 2 : 0,
    make: S => { const p = G.pick(Sim.alive(S)); return { p: p.id }; },
    title: () => 'Ktoś chce odejść',
    text: (S, d) => { const p = Sim.spec(S, d.p); return `${p.name} mówi, że w osiedlu za torami jest lepiej i ${Sim.g(p, 'chce', 'chce')} się wyprowadzić.`; },
    choices: (S, d) => [
      { label: 'Przekonać (Jedzenie 4)', ok: S.res.jedzenie >= 4, ai: true, run: () => { addRes(S, 'jedzenie', -4); mood(S, 1, 0); } },
      { label: 'Niech idzie', ok: true, run: () => { const p = Sim.spec(S, d.p); p.gone = true; unassign(S, p); const b = S.bldgs[p.home]; if (b && b.pop) b.pop--; Sim.log(S, `${p.name} ${Sim.g(p, 'odszedł', 'odeszła')} z osiedla.`, true); } }
    ]
  });
  EV.push({
    id: 'smartfon', w: () => .7, once: true, make: () => ({}),
    title: () => 'Ostatni działający smartfon',
    text: () => 'W czyjejś szufladzie znalazł się telefon z trzema procentami baterii. Pół osiedla ustawia się w kolejce, żeby zobaczyć zdjęcia sprzed upadku.',
    choices: S => [
      { label: 'Pokaz zdjęć w świetlicy', ok: true, ai: true, run: () => { mood(S, 2, -2); } },
      { label: 'Rozebrać na części', ok: true, run: () => { addRes(S, 'czesci', 1); mood(S, 0, 1); } }
    ]
  });
  Sim.eventView = function (S) {
    const e = S.event; if (!e) return null;
    const def = EV.find(x => x.id === e.id);
    return { title: def.title(S, e.d), text: def.text(S, e.d), choices: def.choices(S, e.d) };
  };
  Sim.choose = function (S, k) {
    const v = Sim.eventView(S); if (!v) return;
    const c = v.choices[k]; if (!c || !c.ok) return;
    S.event = null; c.run();
  };
  function pickEvent(S) {
    S.evDone = S.evDone || {};
    const pool = EV.filter(e => !(e.once && S.evDone[e.id])).map(e => [e, e.w(S)]).filter(x => x[1] > 0);
    const tot = pool.reduce((a, x) => a + x[1], 0); if (!tot) return;
    let r = Math.random() * tot;
    for (const [e, w] of pool) {
      if ((r -= w) <= 0) {
        const d = e.make(S); if (!d) return;
        S.event = { id: e.id, d }; S.evDone[e.id] = true; G.emit && G.emit('event');
        return;
      }
    }
  }
  Sim.pickEvent = pickEvent;

  /* ---------- przebieg godziny ---------- */
  function onHour(S, h) {
    const season = Sim.season(S), Tout = Sim.temp(S), work = Sim.isWork(S, h), ratio = Sim.ratio(S), gm = Sim.gm(S);
    const winter = season === 1, pop = Sim.pop(S);
    let rp = 0, kitchenStaff = 0, amb = 0;
    S.serverOn = false;
    let wezel = null;
    const food = x => x * (tech(S, 't_konserwy') ? 1.2 : 1);
    const used = { opal: 0, jedzenie: 0 };
    const spend = (k, v) => { if (S.res[k] < v) return false; S.res[k] -= v; if (used[k] !== undefined) used[k] += v; return true; };
    for (const b of S.bldgs) {
      if (b.roof === 'pv') {
        if (b.roofBuild > 0) b.roofBuild--;
        else if (h >= 8 && h < 17) addRes(S, 'prad', .6 * [.7, .4, 1, 1.2][season]);
      }
      const f = b.fac; if (!f) continue;
      if (f.build > 0) { f.build--; if (f.build === 0) Sim.log(S, `Gotowe: ${G.FAC[f.id].name} (${b.name}).`); continue; }
      const F = G.FAC[f.id], e = (f.staff || 0) * ratio, m = lmult(S, f, F.dom) * gm;
      if (!e) continue;
      switch (f.id) {
        case 'kuchnia': kitchenStaff += e * m; break;
        case 'ambulatorium': amb += e * .12 * m; if (tech(S, 't_zielarstwo') && work) addRes(S, 'leki', e * .01); break;
        case 'swietlica': if (work && S.techs.cur) { const t = G.TECH[S.techs.cur]; let mm = gm; if (Sim.leaderOk(S, f.leader)) { const L = Sim.spec(S, f.leader); mm *= 1 + .2 * (L.skills[t.dom] || 0) + (L.traits.includes('excel') ? .05 : 0) + (L.traits.includes('pracowity') ? .1 : 0) - (L.traits.includes('leniwy') ? .1 : 0); } rp += e * .3 * mm; } break;
        case 'warsztat': if (work) { const v = e * .08 * m * (tech(S, 't_spawanie') ? 1.5 : 1) * (tech(S, 't_druk') ? 1.5 : 1); if (spend('zlom', v * 2)) addRes(S, 'czesci', v); } break;
        case 'wezel': wezel = { b, eff: Math.min(1, e / F.slots) * m }; break;
        case 'grzybiarnia': if (work) addRes(S, 'jedzenie', food(e * .1 * m)); break;
        case 'generator': { const k = Math.min(1, e / F.slots); if (spend('opal', k)) addRes(S, 'prad', 2 * k); break; }
        case 'serwer': if (spend('prad', 1)) S.serverOn = true; break;
        case 'rozbiorka': if (work && b.stock > 0) {
          const v = e * .2 * m; addRes(S, 'opal', v); addRes(S, 'zlom', v * .6); b.stock -= v * 1.6;
          if (b.stock <= 0) { b.status = 'ruina'; b.fac = null; Sim.log(S, `${b.name} rozebrany do gołych ścian.`); G.emit && G.emit('world'); }
        } break;
      }
    }
    for (const y of S.yard) {
      if (y.build > 0) { y.build--; if (y.build === 0) { Sim.log(S, `Gotowe: ${G.FAC[y.fac].name}.`); G.emit && G.emit('world'); } continue; }
      const F = G.FAC[y.fac], e = (y.staff || 0) * ratio, m = lmult(S, y, F.dom) * gm;
      switch (y.fac) {
        case 'ognisko': if (h >= 6 && h < 22) spend('opal', .1); break;
        case 'ogrodki': if (work && e) addRes(S, 'jedzenie', food(e * .15 * [.7, 0, .9, 1.3][season] * m)); break;
        case 'szklarnia': if (work && e) addRes(S, 'jedzenie', food(e * .12 * (winter ? .7 : 1) * (tech(S, 't_hydro') ? 1.4 : 1) * m)); break;
        case 'wiatrak': addRes(S, 'prad', .25); break;
        case 'wyrab': if (work && e) {
          const v = e * .3 * m; y.acc = (y.acc || 0) + v;
          let trees = 0; const cx = y.x + 1, cy = y.y + 1;
          for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const tx = cx + dx, ty = cy + dy; if (tx >= 0 && ty >= 0 && tx < N && ty < N && G.grid.terr[ty * N + tx] === G.T.TREE) trees++; }
          if (!trees) { if (!y.warned) { y.warned = true; Sim.log(S, 'Punkt wyrębu: w okolicy nie ma już drzew.'); } break; }
          addRes(S, 'opal', v);
          while (y.acc >= 6) {
            y.acc -= 6; let best = -1, bd = 1e9;
            for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const tx = cx + dx, ty = cy + dy; if (tx >= 0 && ty >= 0 && tx < N && ty < N && G.grid.terr[ty * N + tx] === G.T.TREE && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = ty * N + tx; } }
            if (best >= 0) { S.felled.push(best); G.grid.terr[best] = G.T.STUMP; S.dirtyBase = true; }
          }
        } break;
      }
    }
    if (tech(S, 't_swiatlo') && S.res.prad >= .3) S.res.prad -= .3;
    if (tech(S, 't_mesh') && S.res.prad >= .2) S.res.prad -= .2;
    // badania
    if (S.techs.cur && rp > 0) {
      rp *= (tech(S, 't_swiatlo') && S.res.prad > 0 ? 1.2 : 1) * (tech(S, 't_mesh') ? 1.25 : 1) * (tech(S, 't_model') ? 1.3 : 1) * (law(S, 'u_doradca') ? 1.1 : 1);
      S.techs.prog += rp;
      if (S.techs.prog >= G.TECH[S.techs.cur].cost) finishTech(S);
    }
    // ogrzewanie
    let pump = 1; if (wezel && tech(S, 't_pompy') && S.res.prad >= 1) { S.res.prad -= 1; pump = .5; }
    const wezelOn = wezel && wezel.eff > 0 && spend('opal', 1.5 * pump * Math.min(1, wezel.eff + .2));
    let coldPop = 0;
    for (const b of S.bldgs) {
      b.heated = false;
      if (b.status !== 'nasz' || !G.RESIDENTIAL.has(b.cls)) continue;
      let T = Tout + 6 + (tech(S, 't_okna') ? 3 : 0) + (b.pop > b.cap * .8 ? 1 : 0);
      if (wezelOn && Sim.dist(b.c, wezel.b.c) <= 25) { T += 12 * Math.min(1, wezel.eff); b.heated = true; }
      const smog = S.smogUntil && S.smogUntil > S.t && h >= 7 && h < 21;
      if (tech(S, 't_kozy') && S.rules.kozy && !smog && T < 16 && b.pop > 0) {
        const need = .05 * (1 + b.pop / 20);
        if (spend('opal', need)) { T += 7; b.heated = true; }
        else if (!S.noOpalWarned) { S.noOpalWarned = true; Sim.log(S, 'Skończył się opał. Kozy zgasły.', true); }
      }
      if (S.res.opal > 2) S.noOpalWarned = false;
      b.temp = Math.round(T * 10) / 10;
      if (b.pop > 0 && T < 14) {
        S.sickAcc += b.pop * (14 - T) * .0003 * (law(S, 'u_racje') ? 1.15 : 1) * (law(S, 'u_seniorzy') ? 1.1 : 1);
        if (T < 10) coldPop += b.pop;
        if (T < 0) S.deathAcc += b.pop * .00025 * (-T) / 10;
      }
    }
    S.coldShare = pop ? coldPop / pop : 0;
    if (S.hungry > 0) S.sickAcc += S.hungry * .004;
    // zdrowie
    if (S.sick > 0) {
      const ambMult = (tech(S, 't_zielarstwo') ? 1.3 : 1) * (tech(S, 't_ambu') ? 1.6 : 1) * (S.res.leki > 0 ? 1 : .5);
      let cure = amb * ambMult + (S.coldShare < .3 ? S.sick * .008 : 0);
      cure = Math.min(cure, S.sick);
      if (amb > 0 && S.res.leki > 0) spend('leki', cure * .03);
      S.cureAcc += cure;
      const cured = Math.floor(S.cureAcc); S.cureAcc -= cured; S.sick = Math.max(0, S.sick - cured);
      S.deathAcc += S.sick * .001 * (S.coldShare > .5 ? 2 : 1) * (tech(S, 't_ambu') ? .6 : 1) * (amb > 0 ? .6 : 1);
    }
    const ns = Math.floor(S.sickAcc); if (ns > 0) { S.sickAcc -= ns; S.sick = Math.min(pop, S.sick + ns); }
    const nd = Math.floor(S.deathAcc); if (nd > 0) { S.deathAcc -= nd; killPeople(S, nd, S.coldShare > .4 ? 'Z zimna i chorób.' : 'Choroba.'); }
    for (const p of Sim.alive(S)) {
      if (!p.sick && Math.random() < (S.sick / Math.max(1, pop)) * .02 * (p.traits.includes('twardy') ? .4 : 1)) { p.sick = true; }
      else if (p.sick && Math.random() < .03 * (amb > 0 ? 2 : 1)) p.sick = false;
    }
    // posiłki
    S.kitchenEff = Math.min(1, kitchenStaff / Math.max(1, pop / 15));
    if (h === 13 || h === 19) {
      const mult = (law(S, 'u_racje') ? .75 : 1) * (law(S, 'u_kartki') ? .85 : 1) * (law(S, 'u_algorytm') ? .85 : 1) * (1 - .25 * S.kitchenEff);
      const need = pop * .1 * mult / 2;
      if (S.res.jedzenie >= need) { S.res.jedzenie -= need; used.jedzenie += need; S.hungry = 0; }
      else {
        const frac = 1 - S.res.jedzenie / Math.max(.01, need); used.jedzenie += S.res.jedzenie; S.res.jedzenie = 0;
        S.hungry = Math.round(pop * frac);
        mood(S, -2 * frac, law(S, 'u_algorytm') ? 2 * frac : 4 * frac);
        if (!S.hungryLogged || S.t - S.hungryLogged > 600) { S.hungryLogged = S.t; Sim.log(S, `Zabrakło jedzenia: ${S.hungry} osób bez posiłku.`, true); }
      }
    }
    S.today.opal += used.opal; S.today.jedzenie += used.jedzenie;
    // napad nocą
    if (h === 2) raid(S);
    // wydarzenia
    if (h >= 9 && h <= 18 && !S.event && S.t >= S.nextEv) {
      pickEvent(S); S.nextEv = S.t + (14 + Math.random() * 16) * 60;
    }
    // doba
    if (h === 0) newDay(S);
    if (S.res.prad > Sim.pradCap(S)) S.res.prad = Sim.pradCap(S);
    checkOver(S);
  }
  function raid(S) {
    const day = Sim.day(S); if (day <= 3) return;
    const def = Sim.defense(S);
    let ch = G.clamp(.06 + .01 * day - .015 * def, .02, .4);
    if (S.raidBoost === day - 1 || S.raidBoost === day) ch *= 2;
    if (Math.random() >= ch) return;
    S.stats.raids++;
    const atk = 2 + Math.random() * (3 + day * .3);
    if (def >= atk) { S.stats.repelled++; mood(S, 2, -1); Sim.log(S, 'W nocy szabrownicy próbowali wejść od strony garaży. Warta ich przegoniła.', true); return; }
    const loss = { jedzenie: Math.floor(S.res.jedzenie * .25), czesci: Math.floor(S.res.czesci * .15), leki: Math.floor(S.res.leki * .2) };
    Sim.pay(S, loss); mood(S, -2, 4);
    const hurt = G.ri(0, 3); S.sick = Math.min(Sim.pop(S), S.sick + hurt);
    Sim.log(S, `Napad w nocy. Szabrownicy zabrali: ${G.costText(loss) || 'niewiele'}.${hurt ? ` Rannych: ${hurt}.` : ''}`, true);
    if (Math.random() < .2) killPeople(S, 1, 'Zginęła przy napadzie.');
  }
  function newDay(S) {
    const day = Sim.day(S), pop = Sim.pop(S);
    let a = -.5, tr = -.5;
    const cs = S.coldShare || 0;
    let warm = 0; for (const b of Sim.ours(S)) if (G.RESIDENTIAL.has(b.cls) && b.temp >= 16) warm += b.pop;
    const ws = pop ? warm / pop : 0;
    a += 6 * cs; tr -= 3 * cs; tr += .4 * ws;
    a -= .4 * Math.min(3, S.yard.filter(y => y.fac === 'ognisko' && !y.build).length);
    a -= 1 * (S.kitchenEff || 0); tr += .5 * (S.kitchenEff || 0);
    if (law(S, 'u_racje')) a += .4; if (law(S, 'u_zmiana')) a += .5; if (law(S, 'u_godzina')) a += .2; if (law(S, 'u_kartki')) a += .2;
    if (law(S, 'u_straz')) { a -= .2; tr -= .2; } if (law(S, 'u_zebrania')) tr += .4; if (law(S, 'u_dzieci')) a -= .3; if (law(S, 'u_sad')) tr += .2;
    if (law(S, 'u_walne')) { tr += .5; a -= .2; } if (law(S, 'u_algorytm')) tr -= .2; if (law(S, 'u_polityka')) a -= .3; if (law(S, 'u_dokwaterowanie')) a += .1;
    if (tech(S, 't_swiatlo') && S.res.prad > 0) a -= .3;
    for (const p of Sim.alive(S)) { if (p.traits.includes('lubiany')) tr += .3; if (p.traits.includes('klotliwy')) a += .3; if (p.traits.includes('optymista')) a -= .2; if (p.traits.includes('hipochondryk')) addRes(S, 'leki', -.1); }
    const cap = Sim.cap(S); if (pop > cap && cap > 0) a += 4 * (pop - cap) / cap;
    if (law(S, 'u_komisarz')) tr = Math.min(tr, 0);
    mood(S, tr, a);
    S.yesterday = S.today; S.today = { opal: 0, jedzenie: 0 };
    if ((day - 1) % G.SEASON_DAYS === 0 && day > 1) Sim.log(S, `Zaczyna się ${G.SEASONS[Sim.season(S)]}.`, true);
    if (Sim.season(S) === 1 && Math.random() < .15 && !(S.snap && S.snap.until > S.t)) { S.snap = { until: S.t + 48 * 60, dT: -7 }; Sim.log(S, 'Nadchodzi fala mrozu. Dwa dni siarczystego zimna.', true); }
    if (day > 1 && (day - 1) % 7 === 0) { S.gaz.ready = true; G.emit && G.emit('gazetka'); }
  }
  function checkOver(S) {
    if (S.over) return;
    if (Sim.pop(S) <= 0) S.over = 'pustka';
    else if (S.anger >= 100) S.over = 'odwolanie';
    else if (S.trust <= 0) S.over = 'exodus';
    if (S.over) G.emit && G.emit('over', S.over);
  }

  /* ---------- główny krok ---------- */
  Sim.advance = function (S, dm) {
    if (S.event || S.over) return;
    while (dm > 1e-9) {
      const next = (Math.floor(S.t / 60 + 1e-9) + 1) * 60;
      const stepM = Math.min(dm, next - S.t, 5);
      S.t += stepM; dm -= stepM;
      moveEkipy(S, stepM);
      if (S.t >= next - 1e-6) { S.t = next; onHour(S, Sim.hour(S)); if (S.event || S.over) return; }
    }
  };
  function moveEkipy(S, dm) {
    const sp = .6 * dm;
    for (const e of S.ekipy.slice()) {
      if (e.state === 'idzie' || e.state === 'wraca') {
        e.pos = Math.min(e.path.length - 1, e.pos + sp);
        const i0 = e.path[Math.floor(e.pos)], i1 = e.path[Math.min(e.path.length - 1, Math.floor(e.pos) + 1)], f = e.pos - Math.floor(e.pos);
        e.x = (i0 % N) * (1 - f) + (i1 % N) * f + .5; e.y = Math.floor(i0 / N) * (1 - f) + Math.floor(i1 / N) * f + .5;
        if (e.pos >= e.path.length - 1) {
          if (e.state === 'idzie') {
            if (e.tg.k === 'b') { e.state = 'szuka'; e.until = S.t + 180; }
            else { e.state = 'poza'; e.until = S.t + 120 + S.pois[e.tg.i].d * .45 + 180; }
          } else { deliver(S, e); S.ekipy = S.ekipy.filter(x => x !== e); }
        }
      } else if ((e.state === 'szuka' || e.state === 'poza') && S.t >= e.until) {
        rollExpedition(S, e); e.state = 'wraca'; e.path = e.path.slice().reverse(); e.pos = 0;
      }
    }
  }
  Sim.forecast = function (S) {
    const pop = Sim.pop(S), mult = (law(S, 'u_racje') ? .75 : 1) * (law(S, 'u_kartki') ? .85 : 1) * (law(S, 'u_algorytm') ? .85 : 1) * (1 - .25 * (S.kitchenEff || 0));
    const foodDay = pop * .1 * mult;
    const opalDay = Math.max(S.yesterday.opal, S.today.opal);
    return { food: foodDay ? S.res.jedzenie / foodDay : 99, opal: opalDay > .5 ? S.res.opal / opalDay : 99, raid: Sim.day(S) <= 3 ? 0 : G.clamp(.06 + .01 * Sim.day(S) - .015 * Sim.defense(S), .02, .4) };
  };
  Sim.advice = function (S) {
    const f = Sim.forecast(S);
    if (f.food < 1.5) return `Jedzenia starczy na ${Math.max(0, f.food).toFixed(1)} dnia. Wyślijcie ekipę do sklepu albo ludzi do ogródków.`;
    if (f.opal < 1.5) return `Opału starczy na ${Math.max(0, f.opal).toFixed(1)} dnia. Punkt wyrębu albo rozbiórka.`;
    if (S.sick > Sim.pop(S) * .15) return `Choruje ${S.sick} osób. Ambulatorium i cieplejsze mieszkania.`;
    if (f.raid > .2) return `Szansa napadu tej nocy: ${Math.round(f.raid * 100)}%. Warta albo wieża.`;
    if (!S.techs.cur) return 'Świetlica nic nie bada. Wybierzcie technologię.';
    return 'Na razie stabilnie. Rozglądajcie się za fachowcami i książkami.';
  };
})(window.G);
