/* Za Murem: pikselowa grafika mapy osiedla */
(function (G) {
  'use strict';
  const N = G.N, PX = G.PX;
  const A = G.Art = {};
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  A.mk = mk; A.r = r;

  const ICONS = {
    pot: ['.......', '..w.w..', '.xxxxx.', 'xxxxxxx', '.xxxxx.', '.xxxxx.', '.......'],
    cross: ['..ggg..', '..ggg..', 'ggggggg', 'ggggggg', 'ggggggg', '..ggg..', '..ggg..'],
    book: ['.......', 'bbb.bbb', 'bwb.bwb', 'bwb.bwb', 'bbb.bbb', '..bbb..', '.......'],
    wrench: ['.x...x.', '.xx.xx.', '..xxx..', '...x...', '...x...', '...x...', '...x...'],
    flame: ['...o...', '..oo...', '..ooo..', '.oyoo..', '.oyyoo.', '.oyyyo.', '..ooo..'],
    shroom: ['..www..', '.wwwww.', 'wwwwwww', '...b...', '...b...', '..bbb..', '.......'],
    bolt: ['...yy..', '..yy...', '.yyyy..', '...yy..', '..yy...', '.yy....', '.......'],
    antenna: ['x.....x', '.x...x.', '..x.x..', '...x...', '...x...', '..xxx..', '.......'],
    rack: ['.xxxxx.', '.xgxxx.', '.xxxxx.', '.xgxxx.', '.xxxxx.', '.xgxxx.', '.xxxxx.'],
    hammer: ['xxxx...', 'xxxxx..', '..x....', '..x....', '..x....', '..x....', '.......'],
    flag: ['xbbbb..', 'xbbbb..', 'xbbbb..', 'x......', 'x......', 'x......', 'x......'],
    panel: ['bbbbbbb', 'bwbwbwb', 'bbbbbbb', 'bwbwbwb', 'bbbbbbb', '.x...x.', '.......'],
    search: ['.xxx...', 'x...x..', 'x...x..', 'x...x..', '.xxx...', '....xx.', '.....xx']
  };
  const ICOL = { x: '#e7e4dc', w: '#f4f3ee', g: '#5fbf6a', b: '#5b8fe0', o: '#e3842a', y: '#f2c94c' };
  A.icon = function (c, name, x, y, bg) {
    const ic = ICONS[name]; if (!ic) return;
    if (bg !== false) { r(c, x - 1, y - 1, 9, 9, 'rgba(18,20,22,.88)'); }
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) { const ch = ic[j][i]; if (ch !== '.') r(c, x + i, y + j, 1, 1, ICOL[ch]); }
  };

  const ROOF = {
    blok: ['#8f8d86', '#6e6c66', '#a29f96'],
    dom: ['#8a4a3a', '#6e3a2d', '#9a6a55'],
    sklep: ['#b5b2a8', '#8f8c83', '#c3bfb4'],
    szkola: ['#a8714f', '#85573c', '#b88a6a'],
    przychodnia: ['#c9c6bd', '#a19e95', '#d8d4c9'],
    garaz: ['#6d7378', '#555a5e', '#7d8388'],
    hala: ['#7d8186', '#5f6367', '#8c9095'],
    kosciol: ['#5b5f63', '#45484b', '#6d7176'],
    inne: ['#9a958c', '#78736b', '#aaa59b'],
    ruina: ['#5a5650', '#45423d', '#6a655e']
  };

  function seasonOf(S) { return Math.floor((G.Sim.day(S) - 1) / G.SEASON_DAYS) % 4; }
  A.seasonOf = seasonOf;

  /* Rysuje statyczną warstwę: teren, budynki, obiekty na podwórku */
  A.renderBase = function (S, grid) {
    const W = N * PX, cv = A.base && A.base.width === W ? A.base : mk(W, W);
    const c = cv.getContext('2d');
    const season = seasonOf(S), winter = season === 1;
    const rnd = G.mulberry(S.seed || 1);
    const terr = grid.terr, bid = grid.bid, T = G.T;
    c.clearRect(0, 0, W, W);
    // 1. teren
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const i = ty * N + tx, t = terr[i], X = tx * PX, Y = ty * PX, q = rnd();
      switch (t) {
        case T.ROAD:
          r(c, X, Y, 8, 8, winter ? '#5a5d60' : '#3b3e41');
          for (let k = 0; k < 3; k++) r(c, X + (rnd() * 8 | 0), Y + (rnd() * 8 | 0), 1, 1, winter ? '#d6dcdf' : (rnd() < .5 ? '#45484b' : '#323538'));
          if (q < .04) r(c, X + 1, Y + (rnd() * 6 | 0), 5, 1, '#2a2c2e');
          break;
        case T.FOOT: {
          r(c, X, Y, 8, 8, winter ? '#dfe5e8' : (season === 0 ? '#5a5f3b' : season === 2 ? '#56693b' : '#4f6a35'));
          const pv = winter ? '#b9bfc3' : '#8a8a83', isP = j => { const t2 = terr[j]; return t2 === T.FOOT || t2 === T.ROAD || t2 === T.PARK || t2 === T.BLD; };
          r(c, X + 2, Y + 2, 4, 4, pv);
          if (tx > 0 && isP(i - 1)) r(c, X, Y + 2, 2, 4, pv);
          if (tx < N - 1 && isP(i + 1)) r(c, X + 6, Y + 2, 2, 4, pv);
          if (ty > 0 && isP(i - N)) r(c, X + 2, Y, 4, 2, pv);
          if (ty < N - 1 && isP(i + N)) r(c, X + 2, Y + 6, 4, 2, pv);
          if (q < .3) r(c, X + 3, Y + 3, 1, 1, winter ? '#a7adb1' : '#76766f');
          break;
        }
        case T.PARK:
          r(c, X, Y, 8, 8, winter ? '#8d9194' : '#45484b');
          if (tx % 2 === 0) r(c, X, Y, 1, 8, winter ? '#a9adb0' : '#5f6264');
          break;
        case T.WATER:
          r(c, X, Y, 8, 8, winter ? '#9fb4bf' : '#35505f'); if (q < .5) r(c, X + (rnd() * 6 | 0), Y + (rnd() * 7 | 0), 2, 1, winter ? '#c4d3da' : '#4a6a7c');
          break;
        case T.PLAY: r(c, X, Y, 8, 8, winter ? '#dfe3e2' : '#b8a679'); r(c, X + (rnd() * 7 | 0), Y + (rnd() * 7 | 0), 1, 1, '#9c8c62'); break;
        case T.PITCH: r(c, X, Y, 8, 8, winter ? '#d8dfe2' : '#4c7038'); if (ty % 5 === 0) r(c, X, Y + 3, 8, 1, '#b9c4ae'); break;
        case T.ALLOT:
          r(c, X, Y, 8, 8, winter ? '#d4d9db' : '#5d4a33');
          if (!winter) { r(c, X + 1, Y + 1, 6, 1, season === 3 ? '#5f8f3c' : '#6d7a3a'); r(c, X + 1, Y + 5, 6, 1, season === 0 ? '#8a6a2a' : '#5f8f3c'); }
          break;
        case T.BLD: r(c, X, Y, 8, 8, '#4d4b45'); break;
        default: {
          r(c, X, Y, 8, 8, winter ? '#dfe5e8' : (season === 0 ? '#5a5f3b' : season === 2 ? '#56693b' : '#4f6a35'));
          const sp = winter ? ['#c9d3d8', '#eef3f5'] : ['#495031', '#666e45', '#6b5b44', '#5f6741'];
          for (let k = 0; k < 4; k++) r(c, X + (rnd() * 8 | 0), Y + (rnd() * 8 | 0), 1, 1, sp[rnd() * sp.length | 0]);
        }
      }
      if ((t === T.ROAD || t === T.PARK) && q > .975) { // wraki aut
        const col = G.pick(['#7a3b30', '#3a4a5c', '#8a8a82', '#2f3133', '#5b6b3a'], rnd);
        if (rnd() < .5) { r(c, X + 1, Y + 2, 7, 4, col); r(c, X + 3, Y + 2, 2, 4, '#26303a'); if (winter) r(c, X + 1, Y + 2, 7, 1, '#eef3f5'); }
        else { r(c, X + 2, Y + 1, 4, 7, col); r(c, X + 2, Y + 3, 4, 2, '#26303a'); if (winter) r(c, X + 2, Y + 1, 4, 1, '#eef3f5'); }
      }
    }
    // 2. cienie i elewacje
    A.winPx = [];
    for (const b of S.bldgs) {
      const lv = b.levels, fh = G.clamp(Math.round(lv * 0.7), 2, 7), sh = G.clamp(Math.ceil(lv / 2), 2, 8);
      const wins = [];
      const fac = b.status === 'ruina' ? '#6a655e' : (b.cls === 'dom' ? '#b9ad9a' : b.cls === 'blok' ? '#a19e95' : '#9b978e');
      for (const i of b.tiles) {
        const tx = i % N, ty = (i - tx) / N, X = tx * PX, Y = ty * PX;
        const rightOut = tx + 1 >= N || bid[i + 1] !== b.idx, downOut = ty + 1 >= N || bid[i + N] !== b.idx;
        if (rightOut) c.fillStyle = 'rgba(0,0,0,.28)', c.fillRect(X + 8, Y + 3, sh, 8);
        if (downOut) {
          r(c, X, Y + 8, 8, fh, fac);
          r(c, X, Y + 8 + fh, 8, 1, 'rgba(0,0,0,.3)');
          if (b.status !== 'ruina') for (let wy = 1; wy < fh; wy += 2) for (let wx = 1; wx < 8; wx += 2) {
            r(c, X + wx, Y + 8 + wy, 1, 1, '#2d3940'); wins.push([X + wx, Y + 8 + wy]);
          }
        }
      }
      A.winPx[b.idx] = wins;
    }
    // 3. drzewa i pnie
    const tcol = [['#7b5a26', '#a3672b', '#8a6a2a'], null, ['#4f7a35', '#6f9a4a', '#5d8a3e'], ['#3f6a2c', '#5a8a3a', '#4a7a32']][season];
    for (let i = 0; i < N * N; i++) {
      const t = terr[i]; if (t !== T.TREE && t !== T.STUMP) continue;
      const tx = i % N, ty = (i - tx) / N, X = tx * PX, Y = ty * PX;
      if (t === T.STUMP) { r(c, X + 3, Y + 3, 3, 3, '#6b4a2e'); r(c, X + 4, Y + 4, 1, 1, '#a07b4f'); continue; }
      const ox = (rnd() * 3 | 0) - 1, oy = (rnd() * 3 | 0) - 1;
      r(c, X + 3 + ox, Y + 4 + oy, 7, 6, 'rgba(0,0,0,.25)');
      if (winter) {
        r(c, X + 3 + ox, Y + 1 + oy, 1, 7, '#4a3526'); r(c, X + 1 + ox, Y + 3 + oy, 6, 1, '#4a3526'); r(c, X + 2 + ox, Y + 1 + oy, 1, 2, '#4a3526'); r(c, X + 5 + ox, Y + 1 + oy, 1, 2, '#4a3526');
        r(c, X + 1 + ox, Y + 2 + oy, 2, 1, '#eef3f5'); r(c, X + 5 + ox, Y + 2 + oy, 2, 1, '#eef3f5');
      } else {
        r(c, X + ox, Y + 1 + oy, 8, 6, tcol[0]); r(c, X + 1 + ox, Y + oy, 6, 8, tcol[0]);
        r(c, X + 1 + ox, Y + 1 + oy, 3, 3, tcol[1]); r(c, X + 4 + ox, Y + 4 + oy, 2, 2, tcol[2]);
      }
    }
    // 4. dachy
    for (const b of S.bldgs) {
      const st = b.status, cls = st === 'ruina' ? 'ruina' : b.cls;
      const pal = ROOF[cls] || ROOF.inne;
      const ours = st === 'nasz', empty = st === 'pusty';
      const edge = ours ? '#3d6cc0' : pal[1];
      for (const i of b.tiles) {
        const tx = i % N, ty = (i - tx) / N, X = tx * PX, Y = ty * PX, q = rnd();
        r(c, X, Y, 8, 8, empty ? pal[1] : pal[0]);
        if (cls === 'dom') { r(c, X, Y + 2, 8, 1, pal[1]); r(c, X, Y + 5, 8, 1, pal[1]); }
        else if (cls === 'garaz' || cls === 'hala') { for (let k = 1; k < 8; k += 2) r(c, X + k, Y, 1, 8, pal[1]); }
        else if (cls === 'ruina') { for (let k = 0; k < 5; k++) r(c, X + (rnd() * 7 | 0), Y + (rnd() * 7 | 0), 2, 1, G.pick(['#7d7870', '#3a3833', '#8a5a3a'], rnd)); }
        else if (q < .07) { r(c, X + 3, Y + 3, 2, 2, '#5c5b56'); r(c, X + 3, Y + 3, 2, 1, '#77756e'); }
        else if (q < .1 && cls === 'blok') { r(c, X + 2, Y + 1, 1, 4, '#4a4a46'); r(c, X + 1, Y + 2, 3, 1, '#4a4a46'); }
        else if (q < .12 && cls === 'sklep') { r(c, X + 2, Y + 2, 4, 3, '#d4d0c6'); r(c, X + 3, Y + 3, 2, 1, '#8f8c83'); }
        if (empty && q > .85) r(c, X + 2, Y + 2, 2, 2, '#26282a');
        if (winter && cls !== 'ruina') { if (q < .6) r(c, X + (rnd() * 6 | 0), Y + (rnd() * 6 | 0), 3, 2, '#eef3f5'); }
        // krawędzie
        if (ty === 0 || bid[i - N] !== b.idx) r(c, X, Y, 8, 1, edge);
        if (ty + 1 >= N || bid[i + N] !== b.idx) r(c, X, Y + 7, 8, 1, edge);
        if (tx === 0 || bid[i - 1] !== b.idx) r(c, X, Y, 1, 8, edge);
        if (tx + 1 >= N || bid[i + 1] !== b.idx) r(c, X + 7, Y, 1, 8, edge);
      }
      if (b.roof === 'pv' && b.tiles.length) {
        const n = Math.min(b.tiles.length, 12);
        for (let k = 0; k < n; k++) { const i = b.tiles[(k * 7) % b.tiles.length], tx = i % N, ty = (i - tx) / N; r(c, tx * PX + 1, ty * PX + 1, 6, 6, '#1e3557'); r(c, tx * PX + 1, ty * PX + 3, 6, 1, '#5a7aa0'); r(c, tx * PX + 3, ty * PX + 1, 1, 6, '#5a7aa0'); }
      }
    }
    // 5. obiekty na podwórku
    for (const y of S.yard) A.drawYard(c, y, season);
    // 6. ikony funkcji
    for (const b of S.bldgs) {
      const [cx, cy] = b.c;
      const X = cx * PX + 4 - 3, Y = cy * PX + 4 - 3;
      if (b.fac) A.icon(c, G.FAC[b.fac.id].icon, X, Y);
      else if (b.hq) A.icon(c, 'flag', X, Y);
      else if (b.status === 'sasiedzi' && b.cls === 'blok') { r(c, X + 2, Y + 2, 3, 3, 'rgba(18,20,22,.75)'); r(c, X + 3, Y + 3, 1, 1, '#c9b26a'); }
    }
    A.base = cv;
    return cv;
  };

  A.drawYard = function (c, y, season) {
    const X = y.x * PX, Y = y.y * PX, w = y.w * PX, h = y.h * PX, winter = season === 1;
    switch (y.fac) {
      case 'ognisko':
        r(c, X + 3, Y + 3, 10, 10, '#6c6f70'); r(c, X + 5, Y + 5, 6, 6, '#2b2723'); r(c, X + 4, Y + 7, 8, 2, '#6b4a2e'); r(c, X + 7, Y + 4, 2, 8, '#5b3f26');
        break;
      case 'ogrodki':
        r(c, X, Y, w, h, '#4a3a28');
        for (let k = 2; k < h - 1; k += 4) { r(c, X + 1, Y + k, w - 2, 2, winter ? '#e6ecef' : '#3b2e22'); if (!winter && season !== 1) for (let x = 2; x < w - 2; x += 3) r(c, X + x, Y + k, 2, 1, season === 0 ? '#8a7a3a' : '#6f9a4a'); }
        r(c, X, Y, w, 1, '#7a5a38'); r(c, X, Y + h - 1, w, 1, '#7a5a38'); r(c, X, Y, 1, h, '#7a5a38'); r(c, X + w - 1, Y, 1, h, '#7a5a38');
        break;
      case 'szklarnia':
        r(c, X, Y, w, h, '#4a3a28');
        for (let k = 3; k < h - 2; k += 4) for (let x = 2; x < w - 2; x += 3) r(c, X + x, Y + k, 2, 2, '#6f9a4a');
        c.fillStyle = 'rgba(215,228,235,.42)'; c.fillRect(X, Y, w, h);
        for (let x = 0; x < w; x += 6) r(c, X + x, Y, 1, h, 'rgba(240,244,246,.75)');
        r(c, X, Y, w, 1, '#d8e0e4'); r(c, X, Y + h - 1, w, 1, '#d8e0e4');
        break;
      case 'wyrab':
        r(c, X + 1, Y + 5, 13, 4, '#6b4a2e'); r(c, X + 1, Y + 5, 13, 1, '#8a6440'); r(c, X + 2, Y + 9, 11, 4, '#7a5636'); r(c, X + 2, Y + 9, 1, 4, '#a07b4f'); r(c, X + 12, Y + 1, 1, 6, '#5b4129'); r(c, X + 11, Y + 1, 3, 2, '#9aa0a5');
        break;
      case 'wieza':
        r(c, X + 2, Y + 3, 14, 14, 'rgba(0,0,0,.3)'); r(c, X, Y, 16, 15, '#8c6a44');
        for (let k = 0; k < 15; k += 3) r(c, X, Y + k, 16, 1, '#6b4f31');
        r(c, X, Y, 2, 15, '#5b4129'); r(c, X + 14, Y, 2, 15, '#5b4129'); r(c, X + 2, Y - 2, 12, 3, '#5e4128');
        break;
      case 'wiatrak':
        r(c, X + 3, Y + 3, 3, 3, '#55595d'); r(c, X + 2, Y + 6, 5, 2, '#3c3f42');
        break;
    }
    if (y.build > 0) {
      for (let k = 0; k < w; k += 3) { r(c, X + k, Y, 2, 1, '#e6a540'); r(c, X + k, Y + h - 1, 2, 1, '#e6a540'); }
      for (let k = 0; k < h; k += 3) { r(c, X, Y + k, 1, 2, '#e6a540'); r(c, X + w - 1, Y + k, 1, 2, '#e6a540'); }
    }
  };

  /* ---------- warstwa dynamiczna (rysowana co klatkę, we współrzędnych świata) ---------- */
  const smoke = [];
  const flakes = [];
  for (let i = 0; i < 160; i++) flakes.push({ x: Math.random(), y: Math.random(), v: .03 + Math.random() * .05 });
  A.flakes = flakes;

  A.drawDyn = function (c, S, grid, t, dt, view) {
    const season = seasonOf(S), hour = G.Sim.hour(S);
    // ogień i wiatraki
    for (const y of S.yard) {
      const X = y.x * PX, Y = y.y * PX;
      if (y.fac === 'ognisko' && !y.build && hour >= 6 && hour < 22) {
        const f = Math.floor(t * 8) % 3;
        r(c, X + 6, Y + 5 - f, 4, 4 + f, '#e3842a'); r(c, X + 7, Y + 6 - f, 2, 3 + f, '#f2c94c');
      }
      if (y.fac === 'wiatrak' && !y.build) {
        const cx = X + 4, cy = Y + 4, a = view.reduce ? 0 : t * 3;
        for (let k = 0; k < 3; k++) { const an = a + k * 2.094; for (let s = 1; s < 9; s++) r(c, Math.round(cx + Math.cos(an) * s), Math.round(cy + Math.sin(an) * s), 1, 1, '#d8d4c7'); }
      }
    }
    // dym z kominów ogrzewanych bloków
    if (!view.reduce && (season === 1 || season === 0) && Math.random() < dt * 6) {
      const warm = S.bldgs.filter(b => b.status === 'nasz' && b.heated && b.tiles.length);
      if (warm.length) { const b = G.pick(warm), i = G.pick(b.tiles), tx = i % N; smoke.push({ x: tx * PX + 4, y: (i - tx) / N * PX + 2, life: 2.5 }); }
    }
    for (let k = smoke.length - 1; k >= 0; k--) {
      const s = smoke[k]; s.life -= dt; s.y -= dt * 6; s.x += dt * 2.5;
      if (s.life <= 0) { smoke.splice(k, 1); continue; }
      c.fillStyle = `rgba(200,200,196,${(s.life / 2.5 * .55).toFixed(2)})`; c.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    // ekipy
    for (const e of S.ekipy) {
      if (e.state === 'poza') continue;
      const X = e.x * PX, Y = e.y * PX, step = Math.floor(t * 6) % 2;
      for (let k = 0; k < Math.min(4, e.n); k++) {
        const ox = (k % 2) * 3 - 2, oy = Math.floor(k / 2) * 3 - 3 + (step && k % 2 ? 1 : 0);
        r(c, X + ox, Y + oy, 2, 4, '#1b1d1f'); r(c, X + ox, Y + oy, 2, 1, '#d9a987'); r(c, X + ox, Y + oy + 1, 2, 2, e.leader ? '#e6a540' : '#c9573a');
      }
    }
    // noc
    const night = A.nightAlpha(S);
    if (night > 0) {
      c.fillStyle = `rgba(8,10,28,${night.toFixed(3)})`; c.fillRect(0, 0, N * PX, N * PX);
      for (const b of S.bldgs) {
        if (b.status !== 'nasz' || !b.pop || !A.winPx[b.idx]) continue;
        const lit = b.heated ? '#f2c94c' : '#c9893a';
        const w = A.winPx[b.idx];
        for (let k = 0; k < w.length; k += 3) { if (((k * 7 + b.idx) % 5) < 2) r(c, w[k][0], w[k][1], 1, 1, lit); }
      }
      for (const y of S.yard) if (y.fac === 'ognisko' && !y.build && hour >= 6 && hour < 22) {
        const g = c.createRadialGradient(y.x * PX + 8, y.y * PX + 8, 0, y.x * PX + 8, y.y * PX + 8, 26);
        g.addColorStop(0, `rgba(255,170,70,${(night * .8).toFixed(2)})`); g.addColorStop(1, 'rgba(255,170,70,0)');
        c.fillStyle = g; c.fillRect(y.x * PX - 18, y.y * PX - 18, 52, 52);
      }
    }
  };
  A.nightAlpha = function (S) {
    const h = (S.t % 1440) / 60;
    if (h >= 21 || h < 5) return .55;
    if (h >= 18) return .55 * (h - 18) / 3;
    if (h < 7) return .55 * (7 - h) / 2;
    return 0;
  };
  /* obrys zaznaczonego budynku */
  A.outline = function (c, tiles, bidArr, idx, col) {
    for (const i of tiles) {
      const tx = i % N, ty = (i - tx) / N, X = tx * PX, Y = ty * PX;
      if (ty === 0 || bidArr[i - N] !== idx) r(c, X, Y - 1, 8, 1, col);
      if (ty + 1 >= N || bidArr[i + N] !== idx) r(c, X, Y + 8, 8, 1, col);
      if (tx === 0 || bidArr[i - 1] !== idx) r(c, X - 1, Y, 1, 8, col);
      if (tx + 1 >= N || bidArr[i + 1] !== idx) r(c, X + 8, Y, 1, 8, col);
    }
  };
  /* miniatura mapy do gazetki */
  A.thumb = function (size) {
    const c = mk(size, size), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (A.base) ctx.drawImage(A.base, 0, 0, size, size);
    return c;
  };
})(window.G);
