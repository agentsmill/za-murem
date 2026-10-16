/* Za Murem: gazetka osiedlowa jako obrazek do zapisania i udostępnienia */
(function (G) {
  'use strict';
  const Gaz = G.Gaz = {};
  const Sim = G.Sim;
  Gaz.issue = function (S) {
    const day = Sim.day(S), nr = Math.floor((day - 1) / 7) + 1;
    const since = S.t - 7 * 1440;
    const logs = S.log.filter(l => l.t >= since);
    const bigs = logs.filter(l => l.big).reverse();
    const rest = logs.filter(l => !l.big).reverse();
    const headline = (S.over || S.ending) ? G.ENDINGS[S.over || S.ending].title + '. ' + (bigs[0] ? bigs[0].txt : '') : (bigs[0] ? bigs[0].txt : 'Spokojny tydzień na osiedlu');
    const items = bigs.slice(1, 5).map(l => l.txt);
    for (const l of rest) { if (items.length >= 5) break; items.push(l.txt); }
    const rnd = G.mulberry(S.seed + nr * 17);
    const ads = G.ADS.slice().sort(() => rnd() - .5).slice(0, 3);
    return { nr, day, headline, items, ads };
  };
  function wrap(c, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(' '); let line = '', n = 0;
    for (let k = 0; k < words.length; k++) {
      const test = line ? line + ' ' + words[k] : words[k];
      if (c.measureText(test).width > maxW && line) {
        n++;
        if (maxLines && n >= maxLines) { let l = line; while (c.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); c.fillText(l + '…', x, y); return y + lh; }
        c.fillText(line, x, y); y += lh; line = words[k];
      } else line = test;
    }
    if (line) { c.fillText(line, x, y); y += lh; }
    return y;
  }
  Gaz.render = function (S, iss) {
    const W = 720, H = 1060, cv = G.Art.mk(W, H), c = cv.getContext('2d');
    const ink = '#1f2328', dim = '#4f545a', paper = '#e8e3d4';
    const rnd = G.mulberry(S.seed + iss.nr);
    c.fillStyle = paper; c.fillRect(0, 0, W, H);
    for (let k = 0; k < 2600; k++) { c.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.25)'; c.fillRect(rnd() * W | 0, rnd() * H | 0, 1, 1); }
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(14, 14, W - 28, H - 28); c.lineWidth = 1; c.strokeRect(20, 20, W - 40, H - 40);
    c.textBaseline = 'alphabetic'; c.fillStyle = ink; c.textAlign = 'center';
    c.font = '700 80px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.fillText('GŁOS KLATKI', W / 2, 98);
    c.font = '600 19px "Barlow", sans-serif';
    c.fillText(`Gazetka Spółdzielni Mieszkaniowej „${S.name}”`, W / 2, 128);
    c.fillRect(34, 142, W - 68, 3); c.fillRect(34, 172, W - 68, 1);
    c.font = '600 15px "Barlow Condensed", sans-serif'; c.fillStyle = dim;
    c.fillText(`NR ${iss.nr}  ·  DZIEŃ ${iss.day}  ·  ${G.SEASONS[Sim.season(S)].toUpperCase()} ${Sim.year(S)}  ·  CENA: JEDEN SŁOIK`, W / 2, 163);
    c.textAlign = 'left'; c.fillStyle = ink;
    c.font = '700 38px "Barlow Condensed", "Arial Narrow", sans-serif';
    let y = wrap(c, iss.headline, 36, 220, W - 72, 40, 3) + 6;
    // mapa
    const th = G.Art.thumb(320);
    c.drawImage(th, 36, y); c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(36, y, 320, 320); c.lineWidth = 1;
    c.font = 'italic 400 14px "Barlow", sans-serif'; c.fillStyle = dim;
    c.fillText(`Nasze osiedle, stan na dzień ${iss.day}.`, 36, y + 340);
    // liczby
    const x2 = 384; let y2 = y + 8;
    c.fillStyle = ink; c.font = '700 20px "Barlow Condensed", sans-serif'; c.fillText('LICZBY TYGODNIA', x2, y2 + 14); c.fillRect(x2, y2 + 22, 300, 2);
    y2 += 52;
    const rows = [['Mieszkańców', Sim.pop(S)], ['Chorych', S.sick], ['Zmarło od początku', S.deaths], ['Zaufanie do zarządu', Math.round(S.trust) + '%'], ['Wkurzenie na klatkach', Math.round(S.anger) + '%'], ['Odkrycia', Object.keys(S.techs.done).length], ['Uchwały zarządu', Object.keys(S.laws.signed).length], ['Wyprawy', S.stats.expeditions]];
    c.font = '500 18px "Barlow", sans-serif';
    for (const [k, v] of rows) { c.fillStyle = dim; c.fillText(k, x2, y2); c.fillStyle = ink; c.textAlign = 'right'; c.fillText(String(v), x2 + 300, y2); c.textAlign = 'left'; c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x2, y2 + 8, 300, 1); y2 += 34; }
    y = Math.max(y + 360, y2) + 14;
    c.fillStyle = ink; c.font = '700 20px "Barlow Condensed", sans-serif'; c.fillText('Z ŻYCIA OSIEDLA', 36, y); c.fillRect(36, y + 8, W - 72, 2); y += 36;
    c.font = '400 17px "Barlow", sans-serif';
    for (const it of iss.items.slice(0, 5)) { if (y > H - 220) break; c.fillStyle = ink; c.fillText('■', 36, y); y = wrap(c, it, 58, y, W - 96, 22, 2) + 6; }
    if (!iss.items.length) { c.fillText('Nic się nie działo. Podejrzane.', 36, y); y += 28; }
    y = Math.max(y + 8, H - 196);
    c.font = '700 20px "Barlow Condensed", sans-serif'; c.fillText('OGŁOSZENIA DROBNE', 36, y); c.fillRect(36, y + 8, W - 72, 2); y += 22;
    const bw = (W - 72 - 24) / 3;
    iss.ads.forEach((ad, k) => {
      const bx = 36 + k * (bw + 12);
      c.strokeStyle = ink; c.setLineDash([4, 3]); c.strokeRect(bx, y, bw, 108); c.setLineDash([]);
      c.fillStyle = ink; c.font = '500 15px "Barlow", sans-serif'; wrap(c, ad, bx + 10, y + 24, bw - 20, 19, 5);
    });
    c.fillStyle = dim; c.font = '500 13px "Barlow", sans-serif'; c.textAlign = 'center';
    c.fillText('Za Murem · gra o spółdzielni po upadku · mapa © współtwórcy OpenStreetMap', W / 2, H - 30);
    return cv;
  };
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'osiedle';
  Gaz.download = function (cv, S) {
    if (!cv) return;
    cv.toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `glos-klatki-${slug(S.name)}-dzien-${Sim.day(S)}.png`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }, 'image/png');
  };
  Gaz.share = function (cv, S) {
    if (!cv) return;
    cv.toBlob(async b => {
      try {
        const f = new File([b], `glos-klatki-${slug(S.name)}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Głos Klatki', text: `Moje osiedle w grze Za Murem, dzień ${Sim.day(S)}.` });
        else Gaz.download(cv, S);
      } catch (e) { /* anulowane */ }
    }, 'image/png');
  };
})(window.G);
