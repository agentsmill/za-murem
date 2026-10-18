/* Etap 2 fali 2 (docs/M2-fala-2.md): piętra otwartego bloku (osoba znika na godzinę, wraca z łupem, zapis w trakcie nie
   zmienia przebiegu), nocni goście o 2:00 (szabrownicy biorą ze stert i przeszukują pomieszczenia, zabite drzwi
   chronią, w trybie zombie wchodzą szwendacze, rano napis), szabrownicy, którzy zostali (spotkanie w środku
   i „Przegonić”), i ukryty ugryziony w trybie zombie („Zapytać o rękę”, gorączka przyjętego). */

import { describe, expect, it } from 'vitest';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import {
  drzwiBudynku,
  type Gospodarstwo,
  NOC_GOSC,
  NOC_GOSC_LUP,
  NOC_GOSC_ZOMBIE,
  NOC_ZOSTAJA,
  nocnyGosc,
  pietraBudynku,
  pietro,
  skutek,
  stanDrzwi,
  szabrownicy,
  UKRYTY_UGRYZIONY,
  ukrytyUgryziony,
  wnetrze,
  wybory,
  zostaja,
} from '../../src/sim/sasiedzi.ts';
import { FEVER_TICKS, Sim, type SimState } from '../../src/sim/sim.ts';
import { IN } from '../../src/world/interior.ts';
import { core, demoWorld, doorWhere, knockHouse, meet, newGame, until } from './sasiedzi-pomoc.ts';

const share = (n: number, f: (k: number) => boolean) => [...Array(n).keys()].filter(f).length / n;
const ctx = (uzbrojeni = 0) => ({ jedzenie: 9, uzbrojeni, mode: 'zwykly' as const, mowca: null });

/** gra na Lanciego z otwartym blokiem: drzwi bez klucza albo wyważone na start, a w trybie zombie (tam blok z ludźmi
    jest zawsze na klucz) wyważone łomem */
function openBlock(mode: 'zwykly' | 'zombie' = 'zwykly', seed = 5) {
  const w = demoWorld('lanciego');
  const { bid, door } =
    mode === 'zombie'
      ? doorWhere(w, mode, () => true, ['blok'])
      : doorWhere(w, mode, (s) => s.s === 'wywazone' || (s.s === 'zamkniete' && !s.k), ['blok']);
  const sim = newGame('lanciego', mode, seed);
  const p = core(sim)[0];
  p.weapon = 'lom';
  for (const t of ['open', 'force'] as const) {
    sim.push({ t, ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    if (sim.st.sasiedzi!.budynki.find((b) => b.bid === bid)?.otwarty) break;
  }
  const k = sim.st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
  expect(sim.st.sasiedzi!.budynki[k].otwarty).toBe(true);
  return { w, sim, p, bid, door, k, b: sim.st.sasiedzi!.budynki[k] };
}

/** pierwszy tick o 2:00, w który według ziarna przychodzi gość (lup: w budynku są sterty) */
function nightOf(sim: Sim, bid: number, lup: boolean, want: (k: ReturnType<typeof nocnyGosc>, d: number) => boolean) {
  const mode = sim.st.mode ?? 'zwykly';
  for (let t = sim.st.tick; t < sim.st.tick + 60 * TICKS_PER_DAY; t++) {
    if (t % TICKS_PER_HOUR !== 0 || hourOf(t) !== 2) continue;
    if (want(nocnyGosc(sim.w.seed, bid, dayOf(t), mode, lup), dayOf(t))) return t;
  }
  throw new Error('nie ma takiej nocy');
}

/** sterta materiału we wnętrzu budynku (jak łup po przeszukaniu) */
function pile(sim: Sim, bid: number, kind: string, n: number) {
  const w = sim.w;
  const it = wnetrze(w, bid);
  const i = [...it.cell.keys()].find(
    (t) => w.bid[t] === bid && it.cell[t] === IN.FLOOR && !sim.st.things.some((x) => x.y * w.size + x.x === t),
  )!;
  const proto = sim.st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom')!;
  sim.st.things.push({ ...proto, id: sim.st.nextId++, kind, x: i % w.size, y: Math.floor(i / w.size), n, by: -1 });
}

describe('etap 2: czyste funkcje', () => {
  it('piętra: tyle, ile pięter nad parterem razy klatki; ten sam łup z ziarna; ludzie tylko w zwykłym, szwendacz w zombie', () => {
    const w = demoWorld('lanciego');
    const blok = w.buildings.find((b) => b.cls === 'blok' && b.levels > 1 && b.entrances.length > 1)!;
    expect(pietraBudynku(w, blok.id)).toBe((blok.levels - 1) * blok.entrances.length);
    const parter = w.buildings.find((b) => b.levels <= 1);
    if (parter) expect(pietraBudynku(w, parter.id)).toBe(0);
    expect(pietro(w, blok.id, 3, 12, 'zwykly')).toEqual(pietro(w, blok.id, 3, 12, 'zwykly'));
    const zw = [...Array(300).keys()].map((k) => pietro(w, blok.id, k, 12, 'zwykly'));
    const zo = [...Array(300).keys()].map((k) => pietro(w, blok.id, k, 12, 'zombie'));
    expect(zw.some((r) => r.szwendacz)).toBe(false);
    expect(zo.some((r) => r.ludzie)).toBe(false);
    const ludzie = zw.filter((r) => r.ludzie).length / 300;
    const szw = zo.filter((r) => r.szwendacz).length / 300;
    expect(ludzie).toBeGreaterThan(0.12);
    expect(ludzie).toBeLessThan(0.3);
    expect(szw).toBeGreaterThan(0.2);
    expect(szw).toBeLessThan(0.4);
    // z wymarcia w trybie zombie jedzenia więcej niż po wyjazdach
    const food = (l: typeof zw) => l.reduce((a, r) => a + (r.lup.jedzenie ?? 0), 0);
    expect(food(zo)).toBeGreaterThan(food(zw));
  });

  it('nocni goście z ziarna: 30% (40% przy łupie), w trybie zombie 45% i tylko szwendacze; co trzeci szabrownik zostaje', () => {
    const n = 3000;
    const g = (mode: 'zwykly' | 'zombie', lup: boolean) => (k: number) =>
      nocnyGosc(7, k % 50, Math.floor(k / 50), mode, lup);
    expect(share(n, (k) => g('zwykly', false)(k) === 'szabrownicy')).toBeCloseTo(NOC_GOSC, 1);
    expect(share(n, (k) => g('zwykly', true)(k) === 'szabrownicy')).toBeCloseTo(NOC_GOSC_LUP, 1);
    expect(share(n, (k) => g('zombie', true)(k) === 'szwendacze')).toBeCloseTo(NOC_GOSC_ZOMBIE, 1);
    expect(share(n, (k) => g('zombie', true)(k) === 'szabrownicy')).toBe(0);
    expect(share(n, (k) => zostaja(7, k % 50, Math.floor(k / 50)))).toBeCloseTo(NOC_ZOSTAJA, 1);
    const sz = szabrownicy({ seed: 7 }, 3, 2, new Set(), { deski: 4 });
    expect(sz.osoby.length).toBeGreaterThanOrEqual(2);
    expect(sz.osoby.length).toBeLessThanOrEqual(3);
    expect(sz).toMatchObject({ szabrownicy: true, zamiar: 'wrodzy', nastroj: 'gniew', zapasy: { deski: 4 }, apt: -1 });
    expect(share(n, (k) => ukrytyUgryziony(7, k % 50, Math.floor(k / 50), 3) >= 0)).toBeCloseTo(UKRYTY_UGRYZIONY, 1);
  });

  it('wybory: szabrownicy (przegonić, rozmowa, odejście; w ataku bez uspokajania), ukryty ugryziony (zapytać o rękę)', () => {
    const base: Gospodarstwo = szabrownicy({ seed: 7 }, 3, 2, new Set(), {});
    expect(wybory({ atak: false }, base, ctx()).map((x) => x.k)).toEqual(['przegonic', 'rozmowa', 'odejscie']);
    expect(wybory({ atak: true }, base, ctx()).map((x) => x.k)).toEqual(['obrona', 'ucieczka']);
    // z bronią łatwiej przegonić
    const p0 = wybory({ atak: false }, base, ctx(0))[0].szansa!;
    const p2 = wybory({ atak: false }, base, ctx(2))[0].szansa!;
    expect(p2).toBeGreaterThan(p0);
    const g: Gospodarstwo = { ...base, szabrownicy: undefined, zamiar: 'zyczliwi', nastroj: 'strach', ugryziony: 1 };
    delete g.szabrownicy;
    expect(
      wybory({ atak: false }, g, ctx())
        .map((x) => x.k)
        .slice(0, 2),
    ).toEqual(['rozmowa', 'reka']);
    expect(wybory({ atak: false }, { ...g, pytali: true }, ctx()).map((x) => x.k)).not.toContain('reka');
    const sp = { atak: false, wywazone: false };
    const reka = skutek('reka', { ...g, rel: 10 }, sp, ctx(), 'nic', () => 0.5);
    expect(reka).toMatchObject({ co: 'reka', koniec: false, pytali: true, rel: 5 });
    expect(skutek('przegonic', base, sp, ctx(), 'nic', () => 0)).toMatchObject({ co: 'przegonic_tak', uciekaja: true });
    expect(skutek('przegonic', base, sp, ctx(), 'nic', () => 0.99)).toMatchObject({
      co: 'przegonic_nie',
      odwrot: true,
    });
    expect(skutek('rozmowa', base, sp, ctx(), 'nic', () => 0.5).co).toBe('szabr_rozmowa');
  });
});

describe('etap 2: piętra w symulacji', () => {
  it('„Przeszukać piętro” ze schodów: godzina na górze, łup przy schodach, licznik pięter, zapis w trakcie bez zmian', () => {
    const { w, sim, p, bid, b } = openBlock();
    const it = wnetrze(w, bid);
    expect(pietraBudynku(w, bid)).toBeGreaterThan(0);
    // schody klatki, którą otwarto (do schodów innych klatek nie da się dojść)
    const stairs = [...it.cell.keys()].filter((t) => w.bid[t] === bid && it.cell[t] === IN.STAIRS);
    for (const tile of stairs) {
      sim.push({ t: 'upstairs', ids: [p.id], bid, tile });
      sim.step();
      if (p.job?.t === 'upstairs') break;
    }
    expect(p.job?.t).toBe('upstairs');
    until(sim, () => p.job?.phase === 1);
    const t0 = sim.st.tick;
    // zapis w połowie godziny na górze: ten sam przebieg
    for (let k = 0; k < TICKS_PER_HOUR / 2; k++) sim.step();
    const copy = new Sim(sim.w, JSON.parse(JSON.stringify(sim.st)) as SimState);
    until(sim, () => p.job?.t !== 'upstairs');
    expect(sim.st.tick - t0).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
    expect(b.pietra).toBe(1);
    expect(['pietro', 'pietro_szwendacz', 'pietro_ugryzienie']).toContain(sim.st.sasiedzi!.napis?.co);
    const q = copy.st.pawns.find((x) => x.id === p.id)!;
    until(copy, () => q.job?.t !== 'upstairs');
    for (let k = 0; k < 50; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});

describe('etap 2: nocni goście', () => {
  it('szabrownicy o 2:00 biorą do 10 sztuk ze stert w otwartym budynku, rano napis; zabite drzwi chronią', () => {
    const { sim, bid, k, b } = openBlock();
    // drzwi od ulicy: budynek z wejściem z ulicy
    const street = drzwiBudynku(sim.w, bid).zewn.filter((d) =>
      ['otwarte', 'wywazone'].includes(stanDrzwi(b, d.tile)!.s),
    );
    expect(street.length).toBeGreaterThan(0);
    pile(sim, bid, 'deski', 7);
    pile(sim, bid, 'jedzenie', 6);
    const t = nightOf(sim, bid, true, (kto, d) => kto === 'szabrownicy' && !zostaja(sim.w.seed, bid, d));
    sim.st.tick = t;
    sim.step();
    expect(b.noc).toMatchObject({ kto: 'szabrownicy' });
    const taken = Object.values(b.noc!.zabrali).reduce((a, n) => a + (n ?? 0), 0);
    expect(taken).toBe(10);
    const left = sim.st.things.filter(
      (x) => (x.kind === 'deski' || x.kind === 'jedzenie') && sim.w.bid[x.y * sim.w.size + x.x] === bid,
    );
    expect(left.reduce((a, x) => a + x.n, 0)).toBe(3);
    // rano o 7:00 napis z tym, co zniknęło
    const morning = t + 5 * TICKS_PER_HOUR;
    sim.st.tick = morning;
    sim.step();
    expect(sim.st.sasiedzi!.napis).toMatchObject({ co: 'noc', b: k, ilu: 1, ile: b.noc!.zabrali });
    // zabite drzwi od ulicy: nikt nie wchodzi
    for (const d of street) stanDrzwi(b, d.tile)!.s = 'zabite';
    delete b.noc;
    sim.st.tick = nightOf(sim, bid, true, (kto) => kto === 'szabrownicy');
    sim.step();
    expect(b.noc).toBeUndefined();
  });

  it('w trybie zombie o 2:00 do otwartego budynku wchodzą szwendacze', () => {
    const { sim, bid, b } = openBlock('zombie');
    const t = nightOf(sim, bid, false, (kto) => kto === 'szwendacze');
    const inside = () =>
      sim.st.pawns.filter(
        (q) => q.kind === 'zombie' && sim.w.bid[Math.floor(q.y) * sim.w.size + Math.floor(q.x)] === bid,
      ).length;
    const n0 = inside();
    sim.st.tick = t;
    sim.step();
    expect(b.noc?.kto).toBe('szwendacze');
    expect(inside()).toBeGreaterThan(n0);
  });

  it('szabrownicy, którzy zostali: spotkanie przy wejściu, „Przegonić” z bronią oddaje ich łup', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { sim, bid, b, p } = openBlock('zwykly', seed);
      pile(sim, bid, 'czesci', 5);
      const t = nightOf(sim, bid, true, (kto, d) => kto === 'szabrownicy' && zostaja(sim.w.seed, bid, d));
      sim.st.tick = t;
      sim.step();
      const g = b.domy.find((x) => x.szabrownicy)!;
      expect(g).toBeDefined();
      expect(g.zapasy.czesci).toBe(5);
      // nasza osoba z bronią wchodzi za dnia (dalej stoi w środku): spotkanie z szabrownikami
      sim.st.tick = t + 10 * TICKS_PER_HOUR;
      p.weapon = 'siekiera';
      until(sim, () => !!sim.st.sasiedzi!.spotkanie, 200);
      const sp = sim.st.sasiedzi!.spotkanie!;
      expect(b.domy[sp.dom].szabrownicy).toBe(true);
      expect(sp.atak).toBe(false);
      meet(sim, 'przegonic');
      const co = sim.st.sasiedzi!.napis?.co;
      if (co !== 'przegonic_tak') continue;
      expect(g.gdzie).toBe('odeszli');
      const back = sim.st.things.filter((x) => x.kind === 'czesci').reduce((a, x) => a + x.n, 0);
      expect(back).toBe(5);
      return;
    }
    throw new Error('żadne ziarno nie przegoniło szabrowników');
  });
});

describe('etap 2: ukryty ugryziony', () => {
  it('zapytani o rękę przyznają się, a przyjęci przychodzą bez ugryzionego', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { sim } = knockHouse(seed);
      const sp = sim.st.sasiedzi!.spotkanie!;
      const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
      g.ugryziony = 1;
      g.rel = 100;
      const residents = () => sim.st.pawns.filter((q) => q.kind === 'resident');
      const n0 = residents().length;
      meet(sim, 'reka');
      expect(sim.st.sasiedzi!.napis?.co).toBe('reka');
      expect(g.pytali).toBe(true);
      expect(sim.st.sasiedzi!.spotkanie?.runda).toBe(1);
      meet(sim, 'zaproszenie');
      if (sim.st.sasiedzi!.napis?.co !== 'zaproszenie_tak') continue;
      expect(residents().length).toBe(n0 + 1);
      expect(residents().some((q) => q.bite !== undefined)).toBe(false);
      return;
    }
    throw new Error('żadne ziarno nie dało zgody');
  });

  it('bez pytania ugryziony przychodzi z gorączką od kilku godzin i umrze jeszcze tej doby', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { sim } = knockHouse(seed);
      const sp = sim.st.sasiedzi!.spotkanie!;
      const g = sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom];
      g.ugryziony = 0;
      g.rel = 100;
      meet(sim, 'zaproszenie');
      if (sim.st.sasiedzi!.napis?.co !== 'zaproszenie_tak') continue;
      const bitten = sim.st.pawns.filter((q) => q.kind === 'resident' && q.bite !== undefined);
      expect(bitten).toHaveLength(1);
      const ago = sim.st.tick - bitten[0].bite!;
      expect(ago).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
      expect(ago).toBeLessThanOrEqual(6 * TICKS_PER_HOUR + 2);
      expect(bitten[0].bite! + FEVER_TICKS - sim.st.tick).toBeLessThan(TICKS_PER_DAY);
      return;
    }
    throw new Error('żadne ziarno nie dało zgody');
  });
});
