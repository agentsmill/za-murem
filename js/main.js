/* Za Murem: start, pętla gry, zapis */
(function (G) {
  'use strict';
  const Sim = G.Sim, UI = G.UI, A = G.Art;
  const SAVE = 'zamurem-spoldzielnia-v1';
  const SPEED = [0, 1, 2, 4];
  const $ = id => document.getElementById(id);
  G.handlers = {};
  G.on = (t, f) => { (G.handlers[t] = G.handlers[t] || []).push(f); };
  G.emit = (t, ...a) => { for (const f of G.handlers[t] || []) try { f(...a); } catch (e) { console.error(e); } };
  let quiet = false;
  G.on('log', (txt, big) => { if (big && G.S && !quiet) UI.toast(txt); });
  G.on('world', () => { G.dirtyBase = true; });
  G.on('ending', k => { setTimeout(() => UI.showEnding(k, false), 60); });
  G.on('over', k => { try { localStorage.removeItem(SAVE); } catch (e) { } setTimeout(() => UI.showEnding(k, true), 60); });
  G.on('gazetka', () => UI.toast('Nowy numer gazetki osiedlowej. Przycisk „Gazetka” na górze.'));

  G.save = function () {
    if (!G.S || G.S.over) return;
    try { localStorage.setItem(SAVE, JSON.stringify(G.S)); } catch (e) { }
  };
  function load() {
    try {
      const t = localStorage.getItem(SAVE); if (!t) return null;
      const s = JSON.parse(t); if (!s || s.v !== 1 || !s.geo || !s.bldgs) return null;
      return s;
    } catch (e) { return null; }
  }

  /* ---------- ekran startowy ---------- */
  $('lore').textContent = G.LORE;
  const status = t => { $('startStatus').textContent = t; };
  function refreshContinue() {
    const s = load(), b = $('btnContinue');
    if (s) { b.hidden = false; b.textContent = `Kontynuuj: ${s.name}, dzień ${Math.floor(s.t / 1440) + 1}`; }
    else b.hidden = true;
  }
  refreshContinue();
  let busy = false;
  $('startForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('addr').value.trim(); if (!q || busy) return;
    busy = true;
    try {
      status('Szukam adresu…');
      const g = await G.OSM.geocode(q);
      status(`Jest: ${g.label.split(',').slice(0, 3).join(',')}. Pobieram budynki z OpenStreetMap, to trwa kilka sekund…`);
      const json = await G.OSM.overpass(g.lat, g.lon, status);
      const geo = G.OSM.toGeo(json, g.lat, g.lon);
      if (geo.b.length < 4) throw new Error('W promieniu 230 m OpenStreetMap prawie nie ma budynków. Spróbujcie adresu w środku osiedla.');
      status('Rysuję osiedle…');
      start(geo, { name: g.area || g.street || q, addr: g.label, src: 'osm' });
      status('');
    } catch (err) {
      const msg = err && err.name === 'TypeError' ? 'Nie mogę połączyć się z OpenStreetMap: brak sieci albo strona blokuje połączenia.' : (err && err.message) || 'Coś poszło nie tak.';
      status(msg + ' Możecie zagrać na przykładowym albo losowym osiedlu.');
    }
    busy = false;
  });
  $('btnSample').onclick = () => start(JSON.parse(JSON.stringify(G.SAMPLE)), { name: 'Przymorze', addr: 'Obrońców Wybrzeża, Gdańsk', src: 'sample' });
  $('btnProc').onclick = () => start(G.OSM.genProc((Math.random() * 1e9) | 0), { name: G.pick(['Osiedle Słoneczne', 'Osiedle Przyjaźń', 'Osiedle Tysiąclecia', 'Osiedle Kolorowe', 'Osiedle Zielone Wzgórze']), src: 'proc' });
  $('btnContinue').onclick = () => { const s = load(); if (s) resume(s); };

  function showApp() { $('start').hidden = true; $('app').hidden = false; }
  function start(geo, meta) {
    quiet = true;
    const S = Sim.newGame(geo, meta);
    quiet = false;
    G.S = S; showApp(); UI.setState(S); G.dirtyBase = true; G.save();
    const ours = Sim.ours(S);
    UI.openSheet(`<p class="kicker">Spółdzielnia ${UI.esc(S.name)}</p><h2 id="sheetTitle">Zarząd to teraz wy</h2><p>${G.LORE}</p><p>Macie ${Sim.pop(S)} mieszkańców w ${ours.length} ${ours.length === 1 ? 'budynku' : 'budynkach'}, trochę opału i jedzenie na kilka dni. Jesień się kończy, za dziesięć dni zima.</p><p class="small">Zacznijcie od kuchni społecznej i świetlicy w waszych blokach, ogniska i ogródków na podwórku. Potem wyślijcie ekipę do najbliższego sklepu i wybierzcie pierwsze badanie.${meta.src === 'proc' ? ' To osiedle jest wylosowane, nie z mapy.' : ''}</p><div class="foot"><button class="btn go" data-sh="close">Do roboty</button></div>`, 'intro');
  }
  function resume(s) {
    G.S = s; Sim.rebuildGrid(s); showApp(); UI.setState(s); s.speed = 0; G.dirtyBase = true;
    UI.toast(`Wczytano: dzień ${Sim.day(s)}. Gra stoi na pauzie.`);
  }
  G.newGameScreen = function () {
    G.save(); G.S = null; $('app').hidden = true; $('start').hidden = false; status(''); refreshContinue();
  };

  /* ---------- pętla ---------- */
  let last = performance.now(), uiAcc = 1, saveAcc = 0, lastSeason = -1, lastDay = 0;
  function frame(now) {
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    const S = G.S;
    if (S && !$('app').hidden) {
      if (!UI.modal && !S.over) {
        if (S.event) UI.showEvent();
        else if (S.speed > 0) { Sim.advance(S, dt * 24 * SPEED[S.speed]); if (S.event && !UI.modal) UI.showEvent(); }
      }
      const se = A.seasonOf(S); if (se !== lastSeason) { lastSeason = se; G.dirtyBase = true; }
      const d = Sim.day(S); if (d !== lastDay) { if (lastDay) G.save(); lastDay = d; }
      try { UI.draw(now / 1000, dt); } catch (e) { console.error(e); }
      uiAcc += dt; if (uiAcc > .3) { uiAcc = 0; UI.update(); }
      saveAcc += dt; if (saveAcc > 30) { saveAcc = 0; G.save(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); });
  window.addEventListener('beforeunload', () => G.save());
})(window.G);
