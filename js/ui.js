/* Za Murem: interfejs, mapa, panele, arkusze */
(function (G) {
  'use strict';
  const N = G.N, PX = G.PX, WORLD = N * PX, Sim = G.Sim, A = G.Art;
  const UI = G.UI = { tab: 'wybrane', sel: null, place: null, eform: { tg: '', n: 4, leader: '' }, armed: null, modal: null };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.esc = esc;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null;

  /* ---------- ikony surowców ---------- */
  const ICON = {};
  (function () {
    const r = A.r;
    const d = {
      opal: c => { r(c, 1, 3, 7, 4, '#8a5a32'); r(c, 1, 3, 7, 1, '#a8733f'); r(c, 7, 3, 2, 4, '#d9b27c'); r(c, 0, 4, 1, 2, '#6b4423'); r(c, 2, 6, 5, 1, '#6b4423'); r(c, 3, 1, 2, 2, '#e3842a'); },
      jedzenie: c => { r(c, 2, 1, 6, 8, '#a3a7ab'); r(c, 2, 3, 6, 4, '#b5432f'); r(c, 2, 1, 6, 1, '#c9cdd1'); r(c, 3, 4, 4, 2, '#e8d8b0'); },
      zlom: c => { r(c, 1, 2, 8, 6, '#8d9196'); r(c, 1, 2, 8, 1, '#b4b8bc'); r(c, 2, 6, 3, 2, '#6b6f73'); r(c, 6, 4, 2, 2, '#4d5155'); r(c, 7, 7, 2, 1, '#a3622f'); },
      czesci: c => { r(c, 1, 1, 8, 8, '#2f6b3c'); r(c, 3, 3, 4, 4, '#1b1d1f'); r(c, 2, 2, 1, 1, '#d8b24a'); r(c, 7, 7, 1, 1, '#d8b24a'); r(c, 7, 2, 1, 1, '#d8b24a'); r(c, 2, 7, 1, 1, '#d8b24a'); },
      leki: c => { r(c, 1, 2, 8, 6, '#e9e7e1'); r(c, 1, 7, 8, 1, '#b9b6ae'); r(c, 4, 3, 2, 4, '#3f9a55'); r(c, 3, 4, 4, 2, '#3f9a55'); },
      prad: c => { r(c, 5, 0, 3, 1, '#f2c94c'); r(c, 4, 1, 3, 2, '#f2c94c'); r(c, 3, 3, 5, 1, '#f2c94c'); r(c, 5, 4, 2, 2, '#f2c94c'); r(c, 4, 6, 2, 2, '#f2c94c'); r(c, 3, 8, 2, 2, '#e0a92a'); }
    };
    for (const k of G.RES) { const c = A.mk(10, 10); d[k](c.getContext('2d')); ICON[k] = c.toDataURL(); }
  })();
  const chips = cost => Object.entries(cost || {}).filter(([, v]) => v > 0).map(([k, v]) => `<span class="c${S.res[k] < v ? ' miss' : ''}"><img src="${ICON[k]}" alt="">${G.RL[k]} ${v}</span>`).join('');

  /* ---------- kamera i mapa ---------- */
  const cv = $('map'), ctx = cv.getContext('2d');
  const cam = UI.cam = { x: WORLD / 2, y: WORLD / 2, z: 1 };
  let cw = 800, ch = 600, dpr = 1, fitZ = 1;
  function resize() {
    const wrap = $('mapwrap');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = wrap.clientWidth;
    ch = Math.round(G.clamp(window.innerWidth < 1000 ? window.innerHeight * .58 : window.innerHeight - 170, 340, 900));
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px';
    fitZ = Math.min(cw, ch) / (WORLD + 60);
    cam.z = G.clamp(cam.z, fitZ * .8, 5);
  }
  UI.resize = resize;
  function clampCam() {
    const m = 80;
    cam.x = G.clamp(cam.x, -m, WORLD + m); cam.y = G.clamp(cam.y, -m, WORLD + m);
    cam.z = G.clamp(cam.z, fitZ * .8, 5);
  }
  UI.center = function (x, y, z) { cam.x = x; cam.y = y; if (z) cam.z = z; clampCam(); };
  const toWorld = (sx, sy) => [(sx - cw / 2) / cam.z + cam.x, (sy - ch / 2) / cam.z + cam.y];
  const toScreen = (wx, wy) => [(wx - cam.x) * cam.z + cw / 2, (wy - cam.y) * cam.z + ch / 2];
  function poiPos(p) {
    const ang = Math.atan2(p.y, p.x), c = Math.cos(ang), s = Math.sin(ang);
    const t = (WORLD / 2 + 18 + Math.min(30, Math.max(0, (p.d - 230) / 12))) / Math.max(Math.abs(c), Math.abs(s));
    return [WORLD / 2 + c * t, WORLD / 2 + s * t];
  }
  UI.poiPos = poiPos;

  let hover = null; // {wx, wy}
  const pointers = new Map(); let drag = null, pinch = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.z = pinch.z * d / Math.max(1, pinch.d); clampCam(); return;
    }
    if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clampCam(); cv.style.cursor = 'grabbing'; }
    }
    if (e.pointerType === 'mouse' || UI.place) { const [wx, wy] = toWorld(e.offsetX, e.offsetY); hover = { wx, wy, sx: e.offsetX, sy: e.offsetY }; }
  });
  const endPtr = e => {
    const wasDrag = drag && drag.moved, single = pointers.size === 1 && !pinch;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    cv.style.cursor = '';
    if (single && !wasDrag && e.type === 'pointerup') { const [wx, wy] = toWorld(e.offsetX, e.offsetY); mapClick(wx, wy); }
    if (!pointers.size) drag = null;
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', () => { if (!UI.place) hover = null; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    cam.z *= e.deltaY < 0 ? 1.15 : 1 / 1.15; clampCam();
    const [nx, ny] = toWorld(e.offsetX, e.offsetY); cam.x += wx - nx; cam.y += wy - ny; clampCam();
  }, { passive: false });
  $('zIn').onclick = () => { cam.z *= 1.3; clampCam(); };
  $('zOut').onclick = () => { cam.z /= 1.3; clampCam(); };
  $('zHome').onclick = () => { const hq = S.bldgs[S.hq]; UI.center(hq.c[0] * PX + 4, hq.c[1] * PX + 4, Math.max(fitZ * 1.6, 1.2)); };

  function tileAt(wx, wy) { const tx = Math.floor(wx / PX), ty = Math.floor(wy / PX); return (tx < 0 || ty < 0 || tx >= N || ty >= N) ? null : [tx, ty]; }
  function placeOrigin(wx, wy) { const F = G.FAC[UI.place]; return [Math.round(wx / PX - F.w / 2), Math.round(wy / PX - F.h / 2)]; }
  function mapClick(wx, wy) {
    if (UI.modal) return;
    if (UI.place) {
      const [x, y] = placeOrigin(wx, wy), why = Sim.canPlace(S, UI.place, x, y);
      if (why) { toast(why); return; }
      const o = Sim.place(S, UI.place, x, y);
      if (o) { UI.sel = { k: 'y', id: o.id }; UI.place = null; $('placebar').hidden = true; cv.classList.remove('placing'); setTab('wybrane'); }
      return;
    }
    for (const p of S.pois) { const [px, py] = poiPos(p); if (Math.hypot(px - wx, py - wy) < 12) { UI.sel = { k: 'p', i: p.id }; setTab('wybrane'); return; } }
    const t = tileAt(wx, wy);
    if (!t) { UI.sel = null; renderPanel(true); return; }
    const i = t[1] * N + t[0];
    const yid = G.grid.occ[i];
    if (yid !== -1 && yid !== undefined) { const y = S.yard.find(o => o.id === yid); if (y) { UI.sel = { k: 'y', id: y.id }; setTab('wybrane'); return; } }
    const b = G.grid.bid[i];
    if (b >= 0 && S.bldgs[b]) { UI.sel = { k: 'b', i: b }; setTab('wybrane'); return; }
    UI.sel = null; renderPanel(true);
  }

  UI.draw = function (t, dt) {
    if (!S) return;
    if (G.dirtyBase || S.dirtyBase || !A.base) { A.renderBase(S, G.grid); G.dirtyBase = false; S.dirtyBase = false; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#161a1c'; ctx.fillRect(0, 0, cv.width, cv.height);
    const z = cam.z * dpr;
    ctx.setTransform(z, 0, 0, z, dpr * cw / 2 - cam.x * z, dpr * ch / 2 - cam.y * z);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#20252a'; ctx.fillRect(-120, -120, WORLD + 240, WORLD + 240);
    ctx.fillStyle = '#2a3034'; for (let k = -120; k < WORLD + 120; k += 24) { ctx.fillRect(k, -120, 1, WORLD + 240); ctx.fillRect(-120, k, WORLD + 240, 1); }
    ctx.drawImage(A.base, 0, 0);
    A.drawDyn(ctx, S, G.grid, t, dt, { reduce });
    // zaznaczenie
    const blink = Math.floor(t * 3) % 2 ? '#e6a540' : '#f2c94c';
    if (UI.sel && UI.sel.k === 'b') { const b = S.bldgs[UI.sel.i]; if (b) A.outline(ctx, b.tiles, G.grid.bid, b.idx, blink); }
    if (UI.sel && UI.sel.k === 'y') { const y = S.yard.find(o => o.id === UI.sel.id); if (y) { ctx.strokeStyle = blink; ctx.lineWidth = 1; ctx.strokeRect(y.x * PX - .5, y.y * PX - .5, y.w * PX + 1, y.h * PX + 1); } }
    if (hover && !UI.place) { const tt = tileAt(hover.wx, hover.wy); if (tt) { const b = G.grid.bid[tt[1] * N + tt[0]]; if (b >= 0 && (!UI.sel || UI.sel.i !== b)) A.outline(ctx, S.bldgs[b].tiles, G.grid.bid, b, 'rgba(230,228,220,.55)'); } }
    // miejsca poza mapą
    for (const p of S.pois) {
      const [x, y] = poiPos(p), sel = UI.sel && UI.sel.k === 'p' && UI.sel.i === p.id;
      A.icon(ctx, 'search', Math.round(x - 3), Math.round(y - 3));
      if (sel) { ctx.strokeStyle = blink; ctx.strokeRect(Math.round(x - 5) - .5, Math.round(y - 5) - .5, 11, 11); }
      if (S.ekipy.some(e => e.tg.k === 'p' && e.tg.i === p.id && e.state === 'poza')) { A.r(ctx, Math.round(x + 6), Math.round(y - 4), 2, 4, '#c9573a'); A.r(ctx, Math.round(x + 6), Math.round(y - 4), 2, 1, '#d9a987'); }
    }
    // duch budowy
    if (UI.place && hover) {
      const F = G.FAC[UI.place], [x, y] = placeOrigin(hover.wx, hover.wy), ok = !Sim.canPlace(S, UI.place, x, y);
      ctx.fillStyle = ok ? 'rgba(134,178,94,.45)' : 'rgba(222,90,67,.45)'; ctx.fillRect(x * PX, y * PX, F.w * PX, F.h * PX);
      ctx.strokeStyle = ok ? '#86b25e' : '#de5a43'; ctx.strokeRect(x * PX + .5, y * PX + .5, F.w * PX - 1, F.h * PX - 1);
    }
    // ekran: etykiety, śnieg
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if (cam.z > fitZ * 1.05) for (const p of S.pois) {
      const [x, y] = poiPos(p), [sx, sy] = toScreen(x, y + 9);
      if (sx < -60 || sy < -20 || sx > cw + 60 || sy > ch + 20) continue;
      const txt = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name, w = ctx.measureText(txt).width + 8;
      ctx.fillStyle = 'rgba(18,20,22,.8)'; ctx.fillRect(sx - w / 2, sy + 3, w, 15); ctx.fillStyle = '#d8d4c7'; ctx.fillText(txt, sx, sy + 11);
    }
    if (A.seasonOf(S) === 1 && !reduce) {
      ctx.fillStyle = 'rgba(238,243,246,.85)';
      for (const f of A.flakes) { f.y += f.v * dt; f.x += Math.sin(t + f.v * 90) * .0006; if (f.y > 1) { f.y = 0; f.x = Math.random(); } ctx.fillRect(f.x * cw, f.y * ch, 2, 2); }
    }
    if (hover && !UI.place && (!drag || !drag.moved)) {
      const tt = tileAt(hover.wx, hover.wy); let txt = '';
      if (tt) { const i = tt[1] * N + tt[0], b = G.grid.bid[i], yid = G.grid.occ[i]; if (yid !== -1) { const y = S.yard.find(o => o.id === yid); if (y) txt = G.FAC[y.fac].name; } else if (b >= 0) { const B = S.bldgs[b]; txt = `${B.name} · ${statusLabel(B)}${B.status === 'nasz' && G.RESIDENTIAL.has(B.cls) ? ` · ${B.temp}°C` : ''}`; } }
      else for (const p of S.pois) { const [px, py] = poiPos(p); if (Math.hypot(px - hover.wx, py - hover.wy) < 12) txt = `${p.name} · ${G.POICAT[p.c].name} · ${p.d} m`; }
      if (txt) { ctx.font = '600 14px "Barlow", sans-serif'; ctx.textAlign = 'left'; const w = ctx.measureText(txt).width + 16; const x = G.clamp(hover.sx + 14, 4, cw - w - 4), y = G.clamp(hover.sy - 28, 4, ch - 30); ctx.fillStyle = 'rgba(18,20,22,.92)'; ctx.fillRect(x, y, w, 24); ctx.fillStyle = '#ece8de'; ctx.fillText(txt, x + 8, y + 12); }
    }
    if (S.speed === 0 && !UI.modal) {
      ctx.font = '600 16px "Barlow", sans-serif'; ctx.textAlign = 'center';
      const txt = 'Pauza · spacja albo 1× wznawia', w = ctx.measureText(txt).width + 24;
      ctx.fillStyle = 'rgba(18,20,22,.9)'; ctx.fillRect(cw / 2 - w / 2, 10, w, 30); ctx.fillStyle = '#e6a540'; ctx.fillRect(cw / 2 - w / 2, 37, w, 3);
      ctx.fillStyle = '#ece8de'; ctx.fillText(txt, cw / 2, 25);
    }
  };

  /* ---------- etykiety ---------- */
  function statusLabel(b) {
    return { nasz: 'wasz', sasiedzi: 'sąsiedzi spoza spółdzielni', pusty: 'pusty', obcy: 'niczyj', ruina: 'ruina' }[b.status] || b.status;
  }
  const specOpts = (cur, dom, allowE) => {
    const al = Sim.alive(S).filter(p => !p.assign || p.id === cur || (allowE && false));
    return `<option value="">bez kierownika</option>` + al.map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.name)}${dom && p.skills[dom] ? ` · ${G.DOM[dom]} ${p.skills[dom]}` : ''}${p.sick ? ' · chory' : ''}</option>`).join('');
  };
  function facBlock(k, i, f) {
    const F = G.FAC[k === 'b' ? f.id : f.fac];
    const dom = F.dom === null ? (S.techs.cur ? G.TECH[S.techs.cur].dom : null) : F.dom;
    let h = `<div class="card cur"><div class="card-top"><b>${F.name}</b><span class="st">${f.build > 0 ? `w budowie, jeszcze ${f.build} h` : 'działa'}</span></div><p>${F.desc}</p>`;
    if (F.slots) {
      h += `<div class="row"><span class="dim small">Obsada</span><span class="stepper"><button class="btn" data-act="staff" data-k="${k}" data-i="${i}" data-d="-1" aria-label="Mniej ludzi">−</button><b>${f.staff || 0}/${F.slots}</b><button class="btn" data-act="staff" data-k="${k}" data-i="${i}" data-d="1" aria-label="Więcej ludzi">+</button></span><button class="btn sm" data-act="staffmax" data-k="${k}" data-i="${i}">Pełna</button><span class="dim small">wolnych rąk: ${Sim.freeWorkers(S)}</span></div>`;
      if (F.dom !== undefined) h += `<div class="row"><span class="dim small">Kierownik</span><select data-act="leader" data-k="${k}" data-i="${i}" aria-label="Kierownik">${specOpts(f.leader, dom)}</select></div>`;
    }
    if (F.id === undefined) { }
    h += `<div class="row"><button class="btn sm" data-act="rmfac" data-k="${k}" data-i="${i}">${UI.armed === 'rm' + k + i ? 'Na pewno? Kliknij znowu' : (F.demol ? 'Przerwać rozbiórkę' : 'Zlikwidować')}</button></div></div>`;
    return h;
  }
  function overview() {
    const hq = S.bldgs[S.hq], f = Sim.forecast(S);
    const has = id => Sim.facs(S).some(x => (x.f.id || x.f.fac) === id);
    const steps = [
      ['Kuchnia społeczna w jednym z waszych bloków', has('kuchnia')],
      ['Ognisko na podwórku', has('ognisko')],
      ['Ogródki albo ekipa do sklepu spożywczego', has('ogrodki') || S.stats.expeditions > 0],
      ['Punkt wyrębu przy drzewach', has('wyrab')],
      ['Świetlica-pracownia i pierwsze badanie', has('swietlica') && (S.techs.cur || Object.keys(S.techs.done).length)],
      ['Pierwsza uchwała zarządu', Object.keys(S.laws.signed).length > 0]
    ];
    let h = `<h3>Siedziba zarządu: ${esc(hq.name)}</h3><p class="dim small">Stuknij budynek na mapie, żeby nim zarządzać. Przeciągnij, żeby przesunąć mapę. Kółko myszy albo dwa palce przybliżają.</p>`;
    if (S.serverOn) h += `<p class="advice">Serwer: ${esc(Sim.advice(S))}</p>`;
    h += `<h4>Prognoza</h4><dl class="kv"><dt>Jedzenia starczy na</dt><dd>${f.food > 30 ? 'długo' : f.food.toFixed(1) + ' dnia'}</dd><dt>Opału starczy na</dt><dd>${f.opal > 30 ? 'długo' : f.opal.toFixed(1) + ' dnia'}</dd><dt>Obrona w nocy</dt><dd>${Sim.defense(S)}</dd>`;
    if (S.serverOn || S.yard.some(y => y.fac === 'wieza' && !y.build)) h += `<dt>Ryzyko napadu</dt><dd>${Math.round(f.raid * 100)}%</dd>`;
    h += `<dt>Chorych</dt><dd>${S.sick}</dd><dt>Temperatura</dt><dd>${Sim.temp(S)}°C na zewnątrz</dd></dl>`;
    if (!steps.every(s => s[1])) h += `<h4>Pierwsze kroki</h4><ul class="checklist">${steps.map(([t, d]) => `<li class="${d ? 'done' : ''}"><span class="tick"></span>${t}</li>`).join('')}</ul>`;
    return h;
  }
  function buildingView(b) {
    let h = `<div class="row"><button class="btn sm ghost" data-act="unsel">‹ Przegląd</button></div><h3>${esc(b.name)}</h3><div class="row"><span class="tag ${b.status === 'nasz' ? 'nasz' : b.status === 'ruina' ? 'bad' : ''}">${statusLabel(b)}</span><span class="tag">${G.CLS[b.cls]}</span>${b.hq ? '<span class="tag nasz">siedziba zarządu</span>' : ''}</div><dl class="kv">`;
    if (G.RESIDENTIAL.has(b.cls)) h += `<dt>Mieszkańcy</dt><dd>${b.pop} z ${b.cap} miejsc</dd>`;
    if (b.status === 'nasz' && G.RESIDENTIAL.has(b.cls)) h += `<dt>W mieszkaniach</dt><dd>${b.temp}°C${b.heated ? ', ogrzewane' : ''}</dd>`;
    h += `<dt>Piętra</dt><dd>${b.levels}</dd><dt>Odległość</dt><dd>${Math.round(b.d * G.TM)} m od środka</dd>`;
    if (b.status !== 'nasz' || !G.RESIDENTIAL.has(b.cls)) h += `<dt>Do przeszukania</dt><dd>${b.lootCats.map(c => G.POICAT[c].name).join(', ')}${b.visits ? `, przeszukane ${b.visits}×` : ''}</dd>`;
    h += `</dl>`;
    if (b.fac) h += facBlock('b', b.idx, b.fac);
    if (b.roof) h += `<p class="small">Panele na dachu${b.roofBuild > 0 ? `: montaż, jeszcze ${b.roofBuild} h` : ' ładują prąd za dnia.'}</p>`;
    if (b.status === 'nasz' && !b.fac) {
      const opts = Object.entries(G.FAC).filter(([, F]) => F.kind === 'adapt' && !F.demol && F.on.includes(b.cls));
      if (opts.length) {
        h += `<h4>Urządź tu</h4>`;
        for (const [id, F] of opts) {
          const why = Sim.canAdapt(S, b, id);
          const locked = F.tech && !Sim.tech(S, F.tech);
          h += `<div class="card${locked ? ' lock' : why ? '' : ' ok'}"><div class="card-top"><b>${F.name}</b><span class="st">${locked ? 'zablokowane' : `${F.build} h budowy`}</span></div><p>${F.desc}</p><div class="row">${chips(F.cost)}${why ? `<span class="dim small">${esc(why)}</span>` : `<button class="btn go sm" data-act="adapt" data-i="${b.idx}" data-id="${id}">Urządź</button>`}</div></div>`;
        }
      }
    }
    if (G.FAC.pv.on.includes(b.cls) && b.status === 'nasz' && !b.roof && Sim.tech(S, 't_panele')) {
      const why = Sim.canAdapt(S, b, 'pv');
      h += `<div class="card${why ? '' : ' ok'}"><div class="card-top"><b>${G.FAC.pv.name}</b></div><p>${G.FAC.pv.desc}</p><div class="row">${chips(G.FAC.pv.cost)}${why ? `<span class="dim small">${esc(why)}</span>` : `<button class="btn go sm" data-act="adapt" data-i="${b.idx}" data-id="pv">Zamontuj</button>`}</div></div>`;
    }
    if (['sasiedzi', 'pusty', 'obcy'].includes(b.status)) {
      const c = Sim.claimCost(S, b), why = Sim.canClaim(S, b);
      const label = b.status === 'sasiedzi' ? 'Przyłączyć do spółdzielni' : 'Zająć budynek';
      const desc = b.status === 'sasiedzi' ? `Mieszkańcy (${b.pop} osób) dołączą do spółdzielni. Trzeba ich nakarmić na powitanie i dać opał.` : b.status === 'pusty' ? 'Pusty blok: miejsca dla nowych ludzi i na nowe funkcje.' : 'Budynek przejdzie pod zarząd spółdzielni i będzie można go urządzić.';
      h += `<div class="card${why ? '' : ' ok'}"><div class="card-top"><b>${label}</b></div><p>${desc}</p><div class="row">${chips(c)}${why ? `<span class="dim small">${esc(why)}</span>` : `<button class="btn go sm" data-act="claim" data-i="${b.idx}">${label}</button>`}</div></div>`;
    }
    if (b.status !== 'nasz' && b.status !== 'ruina') h += `<div class="row"><button class="btn" data-act="toEkipa" data-k="b" data-i="${b.idx}">Wyślij tu ekipę</button></div>`;
    if (!b.fac && b.status !== 'sasiedzi' && b.status !== 'ruina' && !b.hq && !(b.status === 'nasz' && b.pop > 0)) {
      h += `<div class="row"><button class="btn sm" data-act="adapt" data-i="${b.idx}" data-id="rozbiorka">${UI.armed === 'demol' + b.idx ? 'Na pewno? Kliknij znowu' : 'Rozebrać na opał i złom'}</button></div>`;
    }
    return h;
  }
  function yardView(y) {
    if (!y) { UI.sel = null; return overview(); }
    return `<div class="row"><button class="btn sm ghost" data-act="unsel">‹ Przegląd</button></div><h3>${G.FAC[y.fac].name}</h3>` + facBlock('y', y.id, y);
  }
  function poiView(p) {
    const C = G.POICAT[p.c], out = S.ekipy.find(e => e.tg.k === 'p' && e.tg.i === p.id);
    return `<div class="row"><button class="btn sm ghost" data-act="unsel">‹ Przegląd</button></div><h3>${esc(p.name)}</h3><div class="row"><span class="tag">${C.name}</span><span class="tag">poza mapą</span></div>
      <dl class="kv"><dt>Odległość</dt><dd>${p.d} m</dd><dt>Można znaleźć</dt><dd>${Object.keys(C.loot).map(k => G.RL[k]).join(', ')}${C.book ? ', czasem książki' : ''}${C.item && !S.items[C.item] ? ', może coś więcej' : ''}</dd><dt>Ryzyko</dt><dd>${C.risk < .15 ? 'niskie' : C.risk < .28 ? 'średnie' : 'wysokie'}</dd><dt>Przeszukane</dt><dd>${p.visits}×</dd></dl>
      ${out ? `<p class="dim">Ekipa jest w drodze.</p>` : `<div class="row"><button class="btn go" data-act="toEkipa" data-k="p" data-i="${p.id}">Wyślij tu ekipę</button></div>`}`;
  }
  function tabWybrane() {
    const s = UI.sel;
    if (!s) return overview();
    if (s.k === 'b') return S.bldgs[s.i] ? buildingView(S.bldgs[s.i]) : overview();
    if (s.k === 'y') return yardView(S.yard.find(y => y.id === s.id));
    if (s.k === 'p') return poiView(S.pois[s.i]);
    return overview();
  }
  function tabBudowa() {
    let h = `<h4>Na podwórku</h4>`;
    for (const [id, F] of Object.entries(G.FAC).filter(([, F]) => F.kind === 'yard')) {
      const locked = F.tech && !Sim.tech(S, F.tech), cnt = S.yard.filter(y => y.fac === id).length;
      h += `<div class="card${locked ? ' lock' : Sim.have(S, F.cost) ? ' ok' : ''}"><div class="card-top"><b>${F.name}</b><span class="st">${locked ? 'wymaga: ' + G.TECH[F.tech].name : `${F.w}×${F.h}${cnt ? ` · macie ${cnt}` : ''}`}</span></div><p>${F.desc}</p><div class="row">${chips(F.cost)}${locked ? '' : `<button class="btn go sm" data-act="place" data-id="${id}"${Sim.have(S, F.cost) && !(F.max && cnt >= F.max) ? '' : ' disabled'}>Postaw</button>`}</div></div>`;
    }
    h += `<h4>W budynkach</h4><p class="dim small">Kuchnię, ambulatorium, świetlicę, warsztat i resztę urządzacie w swoich budynkach. Stuknij wasz budynek na mapie.</p><div class="row">${Object.values(G.FAC).filter(F => F.kind === 'adapt' && !F.demol).map(F => `<span class="tag${F.tech && !Sim.tech(S, F.tech) ? '' : ' good'}">${F.name}</span>`).join('')}</div>`;
    if (Sim.tech(S, 't_kozy')) h += `<label class="row small"><input type="checkbox" data-act="kozy"${S.rules.kozy ? ' checked' : ''}> Palić w kozach, kiedy w mieszkaniach jest zimno</label>`;
    if (Sim.tech(S, 't_barykady')) {
      const c = Sim.barykadyCost(S);
      h += `<div class="card${S.barykady < 5 && Sim.have(S, c) ? ' ok' : ''}"><div class="card-top"><b>Barykady wokół osiedla</b><span class="st">poziom ${S.barykady} z 5</span></div><p>Każdy poziom to obrona +2.</p><div class="row">${S.barykady < 5 ? chips(c) + `<button class="btn go sm" data-act="bary"${Sim.have(S, c) ? '' : ' disabled'}>Podnieść</button>` : '<span class="dim small">Gotowe.</span>'}</div></div>`;
    }
    const fs = Sim.facs(S).filter(x => x.F.slots);
    if (fs.length) {
      h += `<h4>Obsada wszystkich miejsc pracy</h4><p class="dim small">Zdolnych do pracy: ${Sim.available(S)}, przydzielonych: ${Sim.assigned(S)}, wolnych: ${Sim.freeWorkers(S)}.</p>`;
      for (const x of fs) {
        const where = x.k === 'b' ? esc(S.bldgs[x.i].name) : 'podwórko';
        h += `<div class="row"><span style="flex:1 1 140px;min-width:0"><b>${x.F.name}</b> <span class="dim small">${where}${x.f.build > 0 ? ', w budowie' : ''}</span></span><span class="stepper"><button class="btn" data-act="staff" data-k="${x.k}" data-i="${x.i}" data-d="-1" aria-label="Mniej">−</button><b>${x.f.staff || 0}/${x.F.slots}</b><button class="btn" data-act="staff" data-k="${x.k}" data-i="${x.i}" data-d="1" aria-label="Więcej">+</button></span></div>`;
      }
    }
    return h;
  }
  function tabBadania() {
    let h = `<h4>Wiedza osiedla</h4><div class="know">${G.TECH_DOMS.map(d => `<span>${G.DOM[d]} <b>${Sim.know(S, d)}</b> <span class="dim">${esc(Sim.knowSrc(S, d))}</span></span>`).join('')}</div><p class="dim small">Wiedza to najlepszy fachowiec w danej dziedzinie plus do dwóch książek. Bez wiedzy nie zbadacie technologii, choćby świetlica pracowała całą dobę.</p>`;
    const sw = Sim.facs(S).some(x => x.f.id === 'swietlica' && !x.f.build && x.f.staff > 0);
    if (S.techs.cur) {
      const T = G.TECH[S.techs.cur], p = Math.min(100, S.techs.prog / T.cost * 100);
      h += `<div class="card cur"><div class="card-top"><b>${T.name}</b><span class="st">badanie ${Math.floor(S.techs.prog)}/${T.cost}</span></div><div class="row"><span class="prog"><b style="width:${p}%"></b></span></div>${sw ? '' : '<p>Nikt nie bada: potrzebna świetlica-pracownia z obsadą.</p>'}</div>`;
    } else h += `<p class="advice">Świetlica nic nie bada. Wybierzcie technologię poniżej.${sw ? '' : ' Potrzebna też świetlica-pracownia w jednym z waszych budynków.'}</p>`;
    for (let e = 1; e <= 5; e++) {
      h += `<h4>Era ${e}: ${G.ERAS[e]}</h4><div class="era">`;
      for (const [id, T] of Object.entries(G.TECH).filter(([, T]) => T.era === e)) {
        const st = Sim.techState(S, id), cls = { done: 'done', cur: 'cur', ok: 'ok' }[st.s] || 'lock';
        const lab = { done: 'odkryte', cur: 'w badaniu', ok: 'można badać', lock: 'zablokowane', know: 'brak wiedzy', item: 'brak przedmiotu' }[st.s];
        h += `<div class="card ${cls}"><div class="card-top"><b>${T.name}</b><span class="st">${lab}</span></div><p>${T.desc}</p><div class="row"><span class="tag">${G.DOM[T.dom]} ${T.lvl}</span><span class="tag">${T.cost} pkt</span>${st.why ? `<span class="dim small">${esc(st.why)}</span>` : ''}${st.s === 'ok' ? `<button class="btn go sm" data-act="research" data-id="${id}">Badaj</button>` : ''}</div></div>`;
      }
      h += `</div>`;
    }
    return h;
  }
  function tabUchwaly() {
    const cdLeft = (Sim.law(S, 'u_sekretarz') ? G.LAW_CD / 2 : G.LAW_CD) - (S.t - S.laws.last);
    let h = `<p class="dim small">Uchwałę można podpisać co ${Sim.law(S, 'u_sekretarz') ? 18 : 36} godzin. ${cdLeft > 0 ? `Następna za ${Math.ceil(cdLeft / 60)} h.` : 'Możecie podpisać teraz.'} Porządek i Wspólnota się wykluczają, technokracja wymaga serwera.</p>`;
    for (const path of ['base', 'porzadek', 'wspolnota', 'tech']) {
      h += `<h4>${G.PATHS[path]}</h4>`;
      for (const [id, L] of Object.entries(G.LAW).filter(([, L]) => L.path === path)) {
        const st = Sim.lawState(S, id), cls = st.s === 'done' ? 'done' : st.s === 'ok' ? 'ok' : 'lock';
        h += `<div class="card ${cls}"><div class="card-top"><b>${L.name}</b><span class="st">${st.s === 'done' ? 'obowiązuje' : st.s === 'ok' ? 'można podpisać' : st.s === 'cd' ? 'poczekajcie' : 'zablokowane'}</span></div><p>${L.desc}</p><div class="row">${st.why && st.s !== 'cd' ? `<span class="dim small">${esc(st.why)}</span>` : ''}${st.s === 'ok' ? `<button class="btn go sm" data-act="law" data-id="${id}">${UI.armed === 'law' + id ? 'Na pewno? Kliknij znowu' : 'Podpisz'}</button>` : ''}</div></div>`;
      }
    }
    return h;
  }
  function tabLudzie() {
    const pop = Sim.pop(S);
    let h = `<dl class="kv"><dt>Mieszkańców</dt><dd>${pop}</dd><dt>Miejsc w blokach</dt><dd>${Sim.cap(S)}</dd><dt>Dorosłych</dt><dd>${Sim.adults(S)}</dd><dt>Chorych</dt><dd>${S.sick}</dd><dt>Zdolnych do pracy</dt><dd>${Sim.available(S)}</dd><dt>Przydzielonych</dt><dd>${Sim.assigned(S)}</dd><dt>Na wyprawach</dt><dd>${Sim.onExp(S)}</dd><dt>Zmarłych od początku</dt><dd>${S.deaths}</dd></dl><h4>Fachowcy</h4>`;
    for (const p of Sim.alive(S)) {
      let where = 'bez przydziału';
      if (p.assign) {
        if (p.assign.k === 'e') where = 'na wyprawie';
        else { const x = Sim.facs(S).find(f => f.k === p.assign.k && f.i === p.assign.i); if (x) where = 'kieruje: ' + x.F.name; }
      }
      h += `<div class="card"><div class="card-top"><b>${esc(p.name)}</b><span class="st">${p.age} lat${p.sick ? ' · chor' + (p.f ? 'a' : 'y') : ''}</span></div><p>${p.prof}. Mieszka: ${esc((S.bldgs[p.home] || {}).name || '?')}. ${where}.</p><div class="row">${Object.entries(p.skills).map(([d, v]) => `<span class="tag good">${G.DOM[d]} ${v}</span>`).join('')}${p.traits.map(t => `<span class="tag" title="${esc(G.TRAITS[t].desc)}">${G.TRAITS[t].name}</span>`).join('')}</div></div>`;
    }
    const gone = S.specs.filter(p => p.dead || p.gone);
    if (gone.length) h += `<p class="dim small">Odeszli: ${gone.map(p => esc(p.name) + (p.dead ? ' (nie żyje)' : ' (wyprowadzka)')).join(', ')}.</p>`;
    h += `<h4>Biblioteka świetlicy</h4><p class="small">${S.bookList.length ? S.bookList.map(esc).join(', ') : 'Pusto. Książki przynoszą ekipy ze szkół, bibliotek i sklepów.'}</p>`;
    return h;
  }
  function targets() {
    const list = [];
    for (const b of S.bldgs) if (b.status !== 'nasz' && b.status !== 'ruina' && !(b.status === 'sasiedzi')) list.push({ v: 'b' + b.idx, name: b.name, d: Math.round(b.d * G.TM), cats: b.lootCats, visits: b.visits });
    for (const b of S.bldgs) if (b.status === 'sasiedzi' && b.cls !== 'blok') list.push({ v: 'b' + b.idx, name: b.name, d: Math.round(b.d * G.TM), cats: b.lootCats, visits: b.visits });
    for (const p of S.pois) list.push({ v: 'p' + p.id, name: p.name, d: p.d, cats: [p.c], visits: p.visits });
    return list.sort((a, b) => a.d - b.d);
  }
  function tabEkipy() {
    let h = `<p class="dim small">Ekipy wychodzą z siedziby zarządu, szukają kilka godzin i wracają z łupem. Większa ekipa przynosi więcej, kierownik z cechami zmienia ryzyko. Nocą jest groźniej.</p>`;
    if (S.ekipy.length) {
      h += `<h4>W terenie (${S.ekipy.length}/${Sim.maxEkipy(S)})</h4>`;
      for (const e of S.ekipy) {
        const info = Sim.targetInfo(S, e.tg), L = e.leader ? Sim.spec(S, e.leader) : null;
        const st = { idzie: 'w drodze', szuka: 'przeszukuje', poza: 'poza mapą', wraca: 'wraca' }[e.state];
        h += `<div class="card cur"><div class="card-top"><b>${esc(info.name)}</b><span class="st">${st}</span></div><p>${e.n} osób${L ? `, prowadzi ${esc(L.name)}` : ''}.${(e.state === 'szuka' || e.state === 'poza') ? ` Do powrotu na drogę: ok. ${Math.max(0, Math.ceil((e.until - S.t) / 60))} h.` : ''}</p></div>`;
      }
    }
    const list = targets();
    if (!UI.eform.tg && list.length) UI.eform.tg = list[0].v;
    const free = Sim.alive(S).filter(p => !p.assign);
    const n = G.clamp(UI.eform.n, 1, 8);
    h += `<h4>Nowa ekipa</h4><div class="card"><label class="small dim" for="etg">Cel</label><select id="etg" data-act="etg">${list.slice(0, 60).map(o => `<option value="${o.v}"${o.v === UI.eform.tg ? ' selected' : ''}>${esc(o.name)} · ${o.d} m · ${o.cats.map(c => G.POICAT[c].name).join(', ')}${o.visits ? ` · byli ${o.visits}×` : ''}</option>`).join('')}</select>
      <div class="row"><span class="dim small">Ludzi</span><span class="stepper"><button class="btn" data-act="en" data-d="-1" aria-label="Mniej">−</button><b>${n}</b><button class="btn" data-act="en" data-d="1" aria-label="Więcej">+</button></span><span class="dim small">zdolnych do wyjścia: ${Sim.available(S)}</span></div>
      <label class="small dim" for="eld">Kierownik</label><select id="eld" data-act="eld"><option value="">bez kierownika</option>${free.map(p => `<option value="${p.id}"${p.id === UI.eform.leader ? ' selected' : ''}>${esc(p.name)}${p.traits.length ? ' · ' + p.traits.map(t => G.TRAITS[t].name.toLowerCase()).join(', ') : ''}${p.skills.obrona ? ' · obrona ' + p.skills.obrona : ''}</option>`).join('')}</select>
      <div class="row"><button class="btn go" data-act="send"${S.ekipy.length >= Sim.maxEkipy(S) ? ' disabled' : ''}>Wyślij ekipę</button>${S.ekipy.length >= Sim.maxEkipy(S) ? '<span class="dim small">Wszystkie ekipy w terenie.</span>' : ''}</div></div>`;
    return h;
  }
  function tabKronika() {
    let h = `<div class="row"><button class="btn" data-act="gaz">${S.gaz.ready ? 'Nowy numer gazetki' : 'Gazetka osiedlowa'}</button></div><ol class="log">`;
    for (const l of S.log.slice(-90).reverse()) h += `<li class="${l.big ? 'big' : ''}"><time>D${Math.floor(l.t / 1440) + 1} ${String(Math.floor(l.t % 1440 / 60)).padStart(2, '0')}:00</time>${esc(l.txt)}</li>`;
    return h + '</ol>';
  }
  const TABS = { wybrane: ['Wybrane', tabWybrane], budowa: ['Budowa', tabBudowa], badania: ['Badania', tabBadania], uchwaly: ['Uchwały', tabUchwaly], ludzie: ['Ludzie', tabLudzie], ekipy: ['Ekipy', tabEkipy], kronika: ['Kronika', tabKronika] };
  const pbody = $('pbody'), ptabs = $('ptabs');
  let lastHtml = '', panelHold = false;
  pbody.addEventListener('pointerdown', () => { panelHold = true; });
  window.addEventListener('pointerup', () => { setTimeout(() => { panelHold = false; }, 60); });
  function renderPanel(force) {
    if (!S) return;
    const ae = document.activeElement;
    if (!force && (panelHold || (ae && pbody.contains(ae) && ae.tagName === 'SELECT'))) return;
    const html = TABS[UI.tab][1]();
    if (html !== lastHtml || force) { const st = pbody.scrollTop; pbody.innerHTML = html; lastHtml = html; if (!force) pbody.scrollTop = st; }
  }
  UI.renderPanel = renderPanel;
  function setTab(t) {
    UI.tab = t;
    for (const b of ptabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    pbody.scrollTop = 0; renderPanel(true);
  }
  UI.setTab = setTab;
  ptabs.innerHTML = Object.entries(TABS).map(([k, [n]]) => `<button role="tab" data-tab="${k}" aria-selected="${k === UI.tab}">${n}</button>`).join('');
  ptabs.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });

  function arm(key) { UI.armed = key; setTimeout(() => { if (UI.armed === key) { UI.armed = null; renderPanel(true); } }, 3000); }
  pbody.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b || b.disabled || !S) return;
    const a = b.dataset.act, k = b.dataset.k, i = k === 'y' ? b.dataset.i : +b.dataset.i;
    switch (a) {
      case 'unsel': UI.sel = null; break;
      case 'adapt': {
        const id = b.dataset.id;
        if (id === 'rozbiorka' && UI.armed !== 'demol' + i) { arm('demol' + i); break; }
        UI.armed = null;
        const why = Sim.canAdapt(S, S.bldgs[i], id); if (why) { toast(why); break; }
        Sim.adapt(S, i, id); G.dirtyBase = true; break;
      }
      case 'claim': if (Sim.claim(S, i)) G.dirtyBase = true; else toast(Sim.canClaim(S, S.bldgs[i])); break;
      case 'toEkipa': UI.eform.tg = k + (k === 'b' ? i : +b.dataset.i); setTab('ekipy'); return;
      case 'staff': { const f = Sim.ref(S, k, i); Sim.setStaff(S, k, i, (f.staff || 0) + (+b.dataset.d)); break; }
      case 'staffmax': { const f = Sim.ref(S, k, i); Sim.setStaff(S, k, i, 99); if ((f.staff || 0) === 0) toast('Nie ma wolnych rąk.'); break; }
      case 'rmfac': if (UI.armed !== 'rm' + k + i) { arm('rm' + k + i); break; } UI.armed = null; Sim.removeFac(S, k, i); UI.sel = k === 'b' ? UI.sel : null; G.dirtyBase = true; break;
      case 'place': UI.place = b.dataset.id; $('placebar').hidden = false; $('placebar').innerHTML = `<span>Stawiasz: <b>${G.FAC[UI.place].name}</b>. Stuknij miejsce na trawie albo parkingu blisko waszych bloków.</span><button class="btn sm" id="placeCancel">Anuluj</button>`; cv.classList.add('placing'); $('placeCancel').onclick = cancelPlace; break;
      case 'bary': Sim.raiseBarykady(S); break;
      case 'research': Sim.startResearch(S, b.dataset.id); break;
      case 'law': if (UI.armed !== 'law' + b.dataset.id) { arm('law' + b.dataset.id); break; } UI.armed = null; Sim.signLaw(S, b.dataset.id); break;
      case 'en': UI.eform.n = G.clamp(UI.eform.n + (+b.dataset.d), 1, 8); break;
      case 'send': {
        const v = UI.eform.tg; if (!v) break;
        const tg = { k: v[0], i: +v.slice(1) };
        const err = Sim.sendEkipa(S, tg, UI.eform.n, UI.eform.leader || null);
        if (err) toast(err); else UI.eform.leader = '';
        break;
      }
      case 'gaz': UI.showGazetka(); return;
    }
    renderPanel(true);
  });
  pbody.addEventListener('change', e => {
    const t = e.target; if (!S) return;
    const a = t.dataset.act;
    if (a === 'leader') Sim.setLeader(S, t.dataset.k, t.dataset.k === 'y' ? t.dataset.i : +t.dataset.i, t.value || null);
    else if (a === 'kozy') S.rules.kozy = t.checked;
    else if (a === 'etg') UI.eform.tg = t.value;
    else if (a === 'eld') UI.eform.leader = t.value;
    t.blur(); renderPanel(true);
  });
  function cancelPlace() { UI.place = null; $('placebar').hidden = true; cv.classList.remove('placing'); }
  UI.cancelPlace = cancelPlace;

  /* ---------- nagłówek i surowce ---------- */
  $('res').innerHTML = G.RES.map(k => `<span class="chip" id="ch-${k}" title="${G.RL[k]}"><img src="${ICON[k]}" alt=""><span>${G.RL[k]}</span><b id="rv-${k}">0</b></span>`).join('');
  $('speed').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b && S) S.speed = +b.dataset.s; });
  UI.update = function () {
    if (!S) return;
    $('hDay').textContent = `Dzień ${Sim.day(S)}`;
    $('hTime').textContent = Sim.clock(S);
    const T = Sim.temp(S); const ht = $('hTemp'); ht.textContent = `${T > 0 ? '+' : ''}${Math.round(T)}°C`; ht.className = T < 0 ? 'cold' : '';
    $('hSeason').textContent = `${G.SEASONS[Sim.season(S)]} ${Sim.year(S)}`;
    $('mTrust').style.width = S.trust + '%'; $('vTrust').textContent = Math.round(S.trust);
    $('mAnger').style.width = S.anger + '%'; $('vAnger').textContent = Math.round(S.anger);
    for (const b of $('speed').children) b.setAttribute('aria-pressed', String(+b.dataset.s === S.speed));
    const f = Sim.forecast(S);
    for (const k of G.RES) {
      $('rv-' + k).textContent = k === 'prad' ? `${Math.floor(S.res.prad)}/${Sim.pradCap(S)}` : Math.floor(S.res[k]);
      $('ch-' + k).classList.toggle('low', (k === 'jedzenie' && f.food < 1.5) || (k === 'opal' && f.opal < 1.5 && Sim.tech(S, 't_kozy')));
    }
    $('people').innerHTML = `Mieszkańców <b>${Sim.pop(S)}</b> · chorych <b>${S.sick}</b> · do pracy <b>${Sim.available(S)}</b> · wolnych <b>${Sim.freeWorkers(S)}</b> · na wyprawach <b>${Sim.onExp(S)}</b> · miejsc <b>${Sim.cap(S)}</b>`;
    $('btnGaz').classList.toggle('go', !!S.gaz.ready);
    renderPanel(false);
  };
  UI.setState = function (s) { S = s; lastHtml = ''; UI.sel = null; UI.place = null; $('osName').textContent = s.name; document.title = `Za Murem · ${s.name}`; resize(); const hq = S.bldgs[S.hq]; UI.center(hq.c[0] * PX + 4, hq.c[1] * PX + 4, Math.max(fitZ * 1.5, Math.min(2, fitZ * 2.2))); setTab('wybrane'); };

  /* ---------- powiadomienia ---------- */
  function toast(txt) {
    if (!txt) return;
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = txt;
    const box = $('toasts'); box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }
  UI.toast = toast;

  /* ---------- arkusze ---------- */
  const overlay = $('overlay'), sheet = $('sheet');
  function openSheet(html, kind, wide) {
    UI.modal = kind; sheet.className = 'sheet' + (wide ? ' wide' : ''); sheet.innerHTML = html; overlay.hidden = false; overlay.scrollTop = 0;
    const f = sheet.querySelector('button:not(:disabled)'); if (f) f.focus({ preventScroll: true });
  }
  function closeSheet() { overlay.hidden = true; sheet.innerHTML = ''; UI.modal = null; }
  UI.closeSheet = closeSheet;
  UI.openSheet = openSheet;
  UI.showEvent = function () {
    const v = Sim.eventView(S); if (!v) return;
    const ai = Sim.law(S, 'u_doradca') && S.serverOn;
    openSheet(`<p class="kicker">Dzień ${Sim.day(S)} · ${Sim.clock(S)}</p><h2 id="sheetTitle">${esc(v.title)}</h2><p>${esc(v.text)}</p><div class="choices">${v.choices.map((c, k) => `<button class="btn${k === 0 ? ' go' : ''}${ai && c.ai ? ' ai' : ''}" data-ev="${k}"${c.ok ? '' : ' disabled'}>${esc(c.label)}</button>`).join('')}</div>`, 'event');
  };
  UI.showGazetka = function () {
    const issue = G.Gaz.issue(S);
    const c = G.Gaz.render(S, issue);
    S.gaz.ready = false;
    const url = c.toDataURL('image/png');
    UI.gazCanvas = c;
    const canShare = navigator.canShare && typeof File !== 'undefined';
    openSheet(`<p class="kicker">Gazetka osiedlowa · numer ${issue.nr}</p><h2 id="sheetTitle">Głos Klatki</h2><img class="gazimg" src="${url}" alt="Gazetka osiedlowa: ${esc(issue.headline)}"><div class="foot">${canShare ? '<button class="btn" data-sh="share">Udostępnij</button>' : ''}<button class="btn" data-sh="save">Zapisz jako obraz</button><button class="btn go" data-sh="close">Zamknij</button></div>`, 'gaz', true);
  };
  UI.showEnding = function (key, over) {
    const E = G.ENDINGS[key];
    const pop = Sim.pop(S);
    openSheet(`<p class="kicker">${over ? 'Koniec gry' : 'Zakończenie'} · dzień ${Sim.day(S)}</p><span class="stamp">${E.title}</span><p>${E.text}</p>
      <dl class="kv"><dt>Mieszkańców</dt><dd>${pop} (na początku ${S.stats.startPop})</dd><dt>Odkryć</dt><dd>${Object.keys(S.techs.done).length}</dd><dt>Uchwał</dt><dd>${Object.keys(S.laws.signed).length}</dd><dt>Wypraw</dt><dd>${S.stats.expeditions}</dd><dt>Zmarłych</dt><dd>${S.deaths}</dd></dl>
      <div class="foot"><button class="btn" data-sh="gaz">Gazetka na pożegnanie</button>${over ? '<button class="btn go" data-sh="new">Nowa gra</button>' : '<button class="btn" data-sh="new">Nowa gra</button><button class="btn go" data-sh="close">Grać dalej</button>'}</div>`, over ? 'over' : 'ending');
  };
  UI.showMenu = function () {
    openSheet(`<p class="kicker">Menu</p><h2 id="sheetTitle">${esc(S.name)}</h2>
      <p><b>Jak grać.</b> Urządzajcie wasze budynki (kuchnia, świetlica, ambulatorium, warsztat), stawiajcie rzeczy na podwórku, przydzielajcie ludzi i kierowników. Ekipy przynoszą jedzenie, złom, leki i książki. Technologie wymagają wiedzy: fachowca albo książki. Uchwały zmieniają zasady i prowadzą do zakończenia. Pilnujcie zaufania i wkurzenia, bo walne może was odwołać.</p>
      <p class="small">Gra zapisuje się sama co dobę i przy zamknięciu. Mapa: © współtwórcy <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, licencja ODbL. Wersja ${G.VERSION}.</p>
      <div class="foot"><button class="btn" data-sh="save">Zapisz teraz</button><button class="btn" data-sh="new">${UI.armed === 'new' ? 'Na pewno? Kliknij znowu' : 'Nowa gra'}</button><button class="btn go" data-sh="close">Wróć do gry</button></div>`, 'menu');
  };
  sheet.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.ev !== undefined) { Sim.choose(S, +b.dataset.ev); closeSheet(); G.dirtyBase = true; renderPanel(true); return; }
    const a = b.dataset.sh;
    if (a === 'close') { closeSheet(); return; }
    if (a === 'save') { if (UI.modal === 'gaz') G.Gaz.download(UI.gazCanvas, S); else { G.save(); toast('Zapisano.'); closeSheet(); } return; }
    if (a === 'share') { G.Gaz.share(UI.gazCanvas, S); return; }
    if (a === 'gaz') { UI.showGazetka(); return; }
    if (a === 'new') {
      if (UI.modal === 'menu' && UI.armed !== 'new') { UI.armed = 'new'; b.textContent = 'Na pewno? Kliknij znowu'; setTimeout(() => { UI.armed = null; }, 3000); return; }
      UI.armed = null; closeSheet(); G.newGameScreen(); return;
    }
  });
  $('btnGaz').onclick = () => S && UI.showGazetka();
  $('btnMenu').onclick = () => S && UI.showMenu();

  document.addEventListener('keydown', e => {
    if (!S || $('app').hidden) return;
    if (e.key === 'Escape') { if (UI.modal === 'menu' || UI.modal === 'gaz') closeSheet(); else if (UI.place) cancelPlace(); else { UI.sel = null; renderPanel(true); } return; }
    if (UI.modal || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA')) return;
    if (e.key === ' ' && (tg === document.body || tg === cv)) { e.preventDefault(); S.speed = S.speed ? 0 : (UI.lastSpeed || 1); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') S.speed = +e.key;
    if (S.speed) UI.lastSpeed = S.speed;
  });
  window.addEventListener('resize', () => { if (S) resize(); });
})(window.G);
