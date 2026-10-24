/* Furtki, przez które treść łańcuchów (src/gov/watki-tresc.ts) dotyka prawdziwej gry, a które nie są samą treścią:
   metody hosta `pies`, `napadNocy`, `handlarz`, `handlarzEfekt` i `wskazowkaMiejsca`, pola `GoscKarty` (`chce`, `ugryziony`,
   `look`) i `GrupaKarty.looks`, wskazówka z bronią (`GovState.wskazowki[..].bron`: pewne znalezisko po wyprawie), krok
   „pilny” w silniku (wypada, gdy jest dojrzały i dostępny, bez losowania) oraz handlarz w symulacji (`GovInput.handlarz`
   i `GovEffects.handlarz`: lepsza oferta, zła sława). Zarząd na atrapie z gov-atrapa.ts, handlarz na prawdziwej symulacji
   z obcymi. */

import { afterEach, describe, expect, it } from 'vitest';
import { tx } from '../../src/core/jezyk.ts';
import { rngOf } from '../../src/core/rng.ts';
import { osobyGrupy } from '../../src/gov/goscie.ts';
import { rozliczWyprawe } from '../../src/gov/noc.ts';
import type { GEventDef } from '../../src/gov/tresc.ts';
import type { GovEffects, GovInput, GovState, NightReport } from '../../src/gov/typy.ts';
import { type Krok, type Lancuch, podmienLancuchy } from '../../src/gov/watki.ts';
import { planujKarte } from '../../src/gov/wizyta.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { eventTick, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { SLAWA_MAX } from '../../src/sim/handlarz.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { Atrapa, at, TPH } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';

afterEach(() => podmienLancuchy(null));

const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

interface Stan {
  gov: GovState;
  i: GovInput;
}

/** zarząd na atrapie, trzeci dzień o 10:00, gra z obcymi (lista gości pusta), zwykła pula zamrożona */
function stan(o: { mode?: 'zwykly' | 'zombie'; input?: Partial<GovInput>; seed?: number } = {}): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.scrap = 6;
  atr.tick = tickAt(3, 10);
  const i: GovInput = { ...atr.input(), screen: 5000, kozaLit: true, goscie: [], napady: [], ...o.input };
  for (const e of M1_EVENTS) gov.ev.last[e.id] = 1e12;
  gov.ev.next = 0;
  gov.ev.warm = 0;
  gov.ev.done.dym = true;
  return { gov, i };
}

// ---------------------------------------------------------------- host

describe('host: pies, napadNocy, handlarz', () => {
  it('pies(): flaga dog albo jakikolwiek wpis o psie w odczycie (żyje, zginął); kot się nie liczy', () => {
    const s = stan();
    const h = () => makeHost(s.gov, s.i, emptyEffects());
    expect(h().pies()).toBe(false);
    s.i = { ...s.i, zwierzeta: { kot: 'zyje' } };
    expect(h().pies()).toBe(false);
    s.i = { ...s.i, zwierzeta: { pies: 'zginal' } };
    expect(h().pies()).toBe(true);
    s.i = { ...s.i, zwierzeta: { pies: 'zyje' } };
    expect(h().pies()).toBe(true);
    s.i = { ...s.i, zwierzeta: undefined };
    s.gov.flags.dog = true;
    expect(h().pies()).toBe(true);
  });

  it('watek(id): łańcuch wybrany na wątek sezonu; karta „Pies przy siatce” ustępuje wtedy łańcuchowi „Szczekanie”', () => {
    const s = stan();
    const pies = M1_EVENTS.find((e) => e.id === 'pies')!;
    expect(makeHost(s.gov, s.i, emptyEffects()).watek('szczekanie')).toBe(false);
    expect(pies.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0.7);
    s.gov.watki = { wybrane: ['swiatlo', 'szczekanie'], haki: {}, krok: {} };
    expect(makeHost(s.gov, s.i, emptyEffects()).watek('szczekanie')).toBe(true);
    expect(makeHost(s.gov, s.i, emptyEffects()).watek('woda')).toBe(false);
    expect(pies.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0);
    // inny wątek niż psi: karta jak dotąd
    s.gov.watki = { wybrane: ['swiatlo'], haki: {}, krok: {} };
    expect(pies.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0.7);
    // pies już jest: karta też ustępuje
    s.gov.flags.dog = true;
    expect(pies.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0);
  });

  it('napadNocy(dzień): wynik z raportu tej nocy, a bez raportu null', () => {
    const s = stan();
    s.gov.reports = [
      { day: 2, raid: 'brak' },
      { day: 3, raid: 'wtargnięcie' },
    ] as NightReport[];
    const h = makeHost(s.gov, s.i, emptyEffects());
    expect(h.napadNocy(2)).toBe('brak');
    expect(h.napadNocy(3)).toBe('wtargnięcie');
    expect(h.napadNocy(4)).toBeNull();
    // stary zapis bez listy raportów
    (s.gov as { reports?: unknown }).reports = undefined;
    expect(makeHost(s.gov, s.i, emptyEffects()).napadNocy(3)).toBeNull();
  });

  it('handlarz(): kafelek i punkt z odczytu (kopia), a bez pola null; handlarzEfekt dopisuje skutki do fx', () => {
    const s = stan();
    expect(makeHost(s.gov, s.i, emptyEffects()).handlarz()).toBeNull();
    s.i = { ...s.i, handlarz: { tile: 77, gdzie: { x: 5, y: 6 } } };
    const fx = emptyEffects();
    const h = makeHost(s.gov, s.i, fx);
    const t = h.handlarz()!;
    expect(t).toEqual({ tile: 77, gdzie: { x: 5, y: 6 } });
    t.gdzie.x = 99;
    expect(s.i.handlarz!.gdzie.x).toBe(5);
    h.handlarzEfekt('oferta');
    expect(fx.handlarz).toEqual({ oferta: true });
    h.handlarzEfekt('slawa');
    expect(fx.handlarz).toEqual({ oferta: true, slawa: true });
  });
});

// ---------------------------------------------------------------- wskazówka na miejsce z karty

describe('wskazowkaMiejsca: wskazówka z karty łańcucha', () => {
  const apteka: Miejsce = { klucz: 'poi:400:0', kat: 'apteka', x: 400, y: 0, odl: 400, nazwa: 'Pod Różą' };
  const przychodnia: Miejsce = { klucz: 'poi:0:300', kat: 'przychodnia', x: 0, y: 300, odl: 300, nazwa: '' };
  const bliska: Miejsce = { klucz: 'poi:50:0', kat: 'apteka', x: 50, y: 0, odl: 50, nazwa: 'Na Rogu' };

  it('z mapą miasta: najbliższe dostępne miejsce z kategorii (nie z mapy lokalnej), zapis w stanie, nazwa do zdania', () => {
    const s = stan({ input: { okolica: [bliska, apteka, przychodnia] } });
    wlaczMiasto(s.gov);
    const n = makeHost(s.gov, s.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'apteka');
    // apteka na mapie lokalnej (50 m) odpada, wybiera tę z 400 m
    expect(s.gov.wskazowki).toEqual({ 'poi:400:0': { dzien: 3 } });
    expect(n.pl).toBe('apteka „Pod Różą”');
    expect(n.en).toBe('the pharmacy “Pod Różą”');
  });

  it('kilka kategorii: wygrywa najbliższe z nich', () => {
    const s = stan({ input: { okolica: [apteka, przychodnia] } });
    wlaczMiasto(s.gov);
    const n = makeHost(s.gov, s.i, emptyEffects()).wskazowkaMiejsca(['apteka', 'przychodnia'], 'apteka');
    expect(Object.keys(s.gov.wskazowki!)).toEqual(['poi:0:300']);
    expect(n.pl).toBe('przychodnia');
  });

  it('bez mapy miasta albo bez takiego miejsca: cel z TARGETS, wskazówka na jego id', () => {
    const bez = stan();
    const n = makeHost(bez.gov, bez.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'apteka');
    expect(bez.gov.wskazowki).toEqual({ apteka: { dzien: 3 } });
    expect(n.pl).toBe('apteka przy przystanku');
    const inne = stan({ input: { okolica: [przychodnia] } });
    wlaczMiasto(inne.gov);
    makeHost(inne.gov, inne.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'stacja');
    expect(Object.keys(inne.gov.wskazowki!)).toEqual(['stacja']);
  });

  it('miejsceWskazowki tylko czyta: to samo miejsce co wskazowkaMiejsca, a stanu nie rusza', () => {
    const s = stan({ input: { okolica: [apteka] } });
    wlaczMiasto(s.gov);
    const czyta = makeHost(s.gov, s.i, emptyEffects()).miejsceWskazowki(['apteka'], 'apteka');
    expect(s.gov.wskazowki).toBeUndefined();
    const zapisuje = makeHost(s.gov, s.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'apteka');
    expect(czyta).toEqual(zapisuje);
    expect(Object.keys(s.gov.wskazowki!)).toEqual(['poi:400:0']);
    // bez mapy miasta: ten sam cel z TARGETS
    const bez = stan();
    expect(makeHost(bez.gov, bez.i, emptyEffects()).miejsceWskazowki(['apteka'], 'apteka').pl).toBe(
      'apteka przy przystanku',
    );
    expect(bez.gov.wskazowki).toBeUndefined();
  });

  it('z bronią: znacznik zostaje, gdy to samo miejsce dostaje potem zwykłą wskazówkę', () => {
    const s = stan({ input: { okolica: [apteka] } });
    wlaczMiasto(s.gov);
    makeHost(s.gov, s.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'apteka', true);
    expect(s.gov.wskazowki).toEqual({ 'poi:400:0': { dzien: 3, bron: true } });
    makeHost(s.gov, s.i, emptyEffects()).wskazowkaMiejsca(['apteka'], 'apteka');
    expect(s.gov.wskazowki).toEqual({ 'poi:400:0': { dzien: 3, bron: true } });
  });

  it('wyprawa ze wskazówką z bronią przynosi pewną broń i amunicję, a bez znacznika nie dokłada niczego', () => {
    const s = stan({ input: { okolica: [apteka] } });
    const cel = { ...celZMiejsca(apteka), lup: { supplies: [4, 4] as [number, number] }, ryzyko: 0, zapas: 100 };
    const osoby = [s.i.people[0]];
    let z = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const wBron = newGov(seed);
      wBron.wskazowki = { [apteka.klucz]: { dzien: 3, bron: true } };
      const fxB = emptyEffects();
      const r = rozliczWyprawe(wBron, s.i, fxB, cel, osoby);
      // zawsze broń z posterunku (rewolwer albo strzelba) i amunicja do niej, wskazówka zużyta
      expect(
        fxB.arms?.some((a) => a === 'rewolwer' || a === 'strzelba'),
        `ziarno ${seed}`,
      ).toBe(true);
      const ammo = (fxB.ammo?.naboje ?? 0) + (fxB.ammo?.loftki ?? 0);
      expect(ammo, `ziarno ${seed}`).toBeGreaterThanOrEqual(5);
      expect(wBron.wskazowki).toEqual({});
      expect(r.lines.some((l) => /też: .*(rewolwer|strzelb)/.test(l.pl))).toBe(true);
      expect(r.lines.some((l) => /also found: .*(revolver|shotgun)/.test(l.en))).toBe(true);
      z++;
    }
    expect(z).toBe(40);
    // zwykła wskazówka: żadnej pewnej broni (znaleziska losowe jak zawsze: rewolwera ani strzelby w puli zwykłego trybu nie ma)
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGov(seed);
      g.wskazowki = { [apteka.klucz]: { dzien: 3 } };
      const fx = emptyEffects();
      rozliczWyprawe(g, s.i, fx, cel, osoby);
      expect(fx.arms?.some((a) => a === 'rewolwer' || a === 'strzelba') ?? false, `ziarno ${seed}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- GoscKarty

describe('karta z gościem: chce, ugryziony i look z GoscKarty', () => {
  const osobyZ = (s: Stan, kto: 'ocaleni' | 'z_ugryzionym', ilu: number) => {
    let n = 1;
    return osobyGrupy(rngOf(s.gov.rng), () => n++, kto, ilu, new Set());
  };
  const def = (gosc: GEventDef['gosc']): GEventDef => ({
    id: 'x',
    when: ['dzien'],
    w: () => 1,
    make: () => ({}),
    gosc,
    title: () => tx('x', 'x'),
    text: () => tx('x', 'x'),
    choices: () => [],
  });

  it('chce, ugryziony (haczyk) i wygląd każdej osoby przechodzą do gościa i do planu dla symulacji', () => {
    const s = stan({ mode: 'zombie' });
    const osoby = osobyZ(s, 'ocaleni', 3);
    const fx = emptyEffects();
    const h = makeHost(s.gov, s.i, fx);
    const d = def(() => ({ osoby, kto: 'ocaleni', chce: 'dolaczyc', ugryziony: 1, look: [5, 9, 12] }));
    expect(planujKarte(s.gov, s.i, fx, d, h, {})).toBe(true);
    const a = s.gov.goscie!.aktywny!;
    expect(a.gosc.chce).toBe('dolaczyc');
    expect(a.gosc.haczyk).toBe('ugryziony');
    expect(a.gosc.ugryziony).toBe(1);
    expect(a.looks).toEqual([5, 9, 12]);
    expect(fx.gosc!.ugryziony).toBe(1);
    expect(fx.gosc!.looks).toEqual([5, 9, 12]);
    // osoby plan dostają z nowymi identyfikatorami, ale z tymi samymi imionami
    expect(fx.gosc!.osoby.map((p) => p.name)).toEqual(osoby.map((p) => p.name));
  });

  it('bez pól dodatkowych gość jak dotąd: nocleg, prawda, wygląd z ziarna; wygląd o złej długości ignorowany', () => {
    const s = stan();
    const osoby = osobyZ(s, 'ocaleni', 3);
    const fx = emptyEffects();
    const h = makeHost(s.gov, s.i, fx);
    const d = def(() => ({ osoby, kto: 'wedrowiec', look: [7] }));
    expect(planujKarte(s.gov, s.i, fx, d, h, {})).toBe(true);
    const a = s.gov.goscie!.aktywny!;
    expect(a.gosc.chce).toBe('nocleg');
    expect(a.gosc.haczyk).toBe('prawda');
    expect(a.gosc.ugryziony).toBeUndefined();
    expect(a.looks).toHaveLength(3);
    expect(fx.gosc!.ugryziony).toBeUndefined();
  });

  it('ugryziony poza grupą jest pomijany', () => {
    const s = stan({ mode: 'zombie' });
    const osoby = osobyZ(s, 'z_ugryzionym', 2);
    const fx = emptyEffects();
    const h = makeHost(s.gov, s.i, fx);
    expect(
      planujKarte(
        s.gov,
        s.i,
        fx,
        def(() => ({ osoby, kto: 'z_ugryzionym', ugryziony: 5 })),
        h,
        {},
      ),
    ).toBe(true);
    expect(s.gov.goscie!.aktywny!.gosc.haczyk).toBe('prawda');
  });

  it('grupa(): looks w kolejności osób, tylko żywi', () => {
    const s = stan({ mode: 'zombie' });
    const osoby = osobyZ(s, 'ocaleni', 3);
    const fx = emptyEffects();
    const h = makeHost(s.gov, s.i, fx);
    planujKarte(
      s.gov,
      s.i,
      fx,
      def(() => ({ osoby, kto: 'ocaleni', look: [5, 9, 12] })),
      h,
      {},
    );
    const g = s.gov.goscie!.aktywny!.gosc;
    const wpis = (zywi: number[]) => ({
      id: g.id,
      faza: 'brama' as const,
      tile: 1,
      gdzie: { x: 1, y: 1 },
      pawns: zywi.map((k) => 100 + k),
      zywi,
      ukradl: 0,
    });
    const wszyscy = makeHost(s.gov, { ...s.i, goscie: [wpis([0, 1, 2])] }, emptyEffects()).grupa(g.id)!;
    expect(wszyscy.looks).toEqual([5, 9, 12]);
    expect(wszyscy.pod).toBe(true);
    const bezDrugiego = makeHost(s.gov, { ...s.i, goscie: [wpis([0, 2])] }, emptyEffects()).grupa(g.id)!;
    expect(bezDrugiego.osoby.map((p) => p.name)).toEqual([osoby[0].name, osoby[2].name]);
    expect(bezDrugiego.looks).toEqual([5, 12]);
  });
});

// ---------------------------------------------------------------- krok pilny

describe('krok pilny: wypada od razu, gdy jest dojrzały i dostępny', () => {
  let widoczny = false;
  const krok = (nr: number, o: Partial<Krok> = {}): Krok => ({
    id: `p_${nr}`,
    lancuch: 'p',
    nr,
    po: 0,
    when: ['dzien', 'wieczor', 'noc'],
    w: () => (widoczny ? 1 : 0),
    make: () => ({ nr }),
    title: () => tx(`Krok ${nr}`, `Step ${nr}`),
    text: () => tx('t', 't'),
    choices: (h) => [{ label: tx('Tak', 'Yes'), ok: true, run: () => h.hak('p.x') }],
    ...o,
  });
  const lancuch = (pilny: boolean): Lancuch => ({
    id: 'p',
    tryby: ['zwykly', 'zombie'],
    kroki: [krok(1, { pilny }), krok(2, { pilny, po: 0, hak: 'p.x' })],
  });

  function otwarta(s: Stan): string | null {
    const fx: GovEffects = emptyEffects();
    eventTick(s.gov, s.i, fx, false);
    return s.gov.ev.active?.id ?? null;
  }

  it('pilny pierwszy krok otwiera się w tej samej sekundzie, w której robi się dostępny, mimo odstępu między wydarzeniami', () => {
    podmienLancuchy([lancuch(true)]);
    const s = stan();
    s.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    // zwykłe losowanie jeszcze długo czeka (odstęp), a krok niedostępny
    s.gov.ev.next = s.i.screen + 500;
    widoczny = false;
    expect(otwarta(s)).toBeNull();
    widoczny = true;
    s.i = { ...s.i, screen: s.i.screen + 1 };
    expect(otwarta(s)).toBe('p_1');
  });

  it('bez znacznika pilny ten sam krok czeka na odstęp i losowanie', () => {
    podmienLancuchy([lancuch(false)]);
    const s = stan();
    s.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    s.gov.ev.next = s.i.screen + 500;
    widoczny = true;
    expect(otwarta(s)).toBeNull();
  });

  it('nie szybciej niż QUIET sekund po ostatniej decyzji i nie pierwszej nocy', () => {
    podmienLancuchy([lancuch(true)]);
    widoczny = true;
    const s = stan();
    s.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    s.gov.ev.next = s.i.screen + 500;
    s.gov.decisions.push({ s: s.i.screen - 5, k: 'wydarzenie' });
    expect(otwarta(s)).toBeNull();
    s.i = { ...s.i, screen: s.i.screen + 30 };
    expect(otwarta(s)).toBe('p_1');
    // pierwsza noc: nic
    const n = stan();
    n.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    n.gov.ev.next = n.i.screen + 500;
    n.i = { ...n.i, day: 1, hour: 21 };
    expect(otwarta(n)).toBeNull();
  });

  it('pilny drugi krok czeka na hak i odstęp, potem wypada od razu; wybór zamyka kartę i zwalnia go dopiero po haku', () => {
    podmienLancuchy([lancuch(true)]);
    widoczny = true;
    const s = stan();
    s.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    s.gov.ev.next = 0;
    expect(otwarta(s)).toBe('p_1');
    chooseEvent(s.gov, s.i, 0);
    expect(s.gov.watki!.haki['p.x']).toBeDefined();
    // odstęp po decyzji: kolejna karta nie przed QUIET
    s.i = { ...s.i, screen: s.i.screen + 40 };
    s.gov.ev.next = s.i.screen + 500;
    expect(otwarta(s)).toBe('p_2');
  });

  it('pilny krok nie losuje: ziarno zarządu stoi w miejscu, dopóki nie wypadnie zwykłe losowanie', () => {
    podmienLancuchy([lancuch(true)]);
    widoczny = true;
    const s = stan();
    s.gov.watki = { wybrane: ['p'], haki: {}, krok: {} };
    s.gov.ev.next = s.i.screen + 500;
    const rng0 = JSON.stringify(s.gov.rng);
    expect(otwarta(s)).toBe('p_1');
    expect(JSON.stringify(s.gov.rng)).toBe(rng0);
  });
});

// ---------------------------------------------------------------- handlarz w symulacji

describe('handlarz pod bramą w symulacji: odczyt i skutki zarządu', () => {
  /** gra z obcymi do chwili, w której handlarz stoi pod bramą z wózkiem (najpóźniej po czterech dobach) */
  function doHandlarza(seed: number) {
    const { w } = demoWorld('przymorze');
    const st = createSim(w, seed, { core: 4, obcy: true });
    const sim = new Sim(w, st);
    for (let t = 0; t < 4 * 24 * TPH; t++) {
      sim.step();
      if (t % 20) continue;
      const i = govInput(st, w, st.tick / 20);
      if (i.handlarz) return { w, st, sim, i };
    }
    throw new Error('handlarz nie stanął pod bramą');
  }

  it('GovInput.handlarz: kafelek i punkt mapy handlarza, który stoi z wózkiem; po jego odejściu pola nie ma', () => {
    const { w, st, sim, i } = doHandlarza(3);
    const p = st.pawns.find((q) => q.id === st.obcy!.trader && q.kind === 'handlarz')!;
    expect(i.handlarz!.tile).toBe(Math.floor(p.y) * w.size + Math.floor(p.x));
    expect(i.handlarz!.gdzie).toEqual({ x: i.handlarz!.tile % w.size, y: Math.floor(i.handlarz!.tile / w.size) });
    expect(st.obcy!.offers.length).toBeGreaterThan(0);
    for (let t = 0; t < 2 * 24 * TPH && govInput(st, w, 0).handlarz; t++) sim.step();
    expect(govInput(st, w, 0).handlarz).toBeUndefined();
  }, 120_000);

  it('GovInput.handlarz jest tylko w grze z obcymi', () => {
    const { w } = demoWorld('przymorze');
    const st = createSim(w, 3, { core: 4 });
    expect(govInput(st, w, 0).handlarz).toBeUndefined();
  });

  it('lepsza oferta: tańsza o jedną czwartą (najmniej 1) i o jedną wymianę dłuższa, tylko pod bramą', () => {
    const { w, st } = doHandlarza(3);
    const przed = structuredClone(st.obcy!.offers);
    const fx = emptyEffects();
    fx.handlarz = { oferta: true };
    applyGov(st, w, fx);
    st.obcy!.offers.forEach((o, k) => {
      expect(o.left).toBe(przed[k].left + 1);
      for (const [m, n] of Object.entries(przed[k].take) as [keyof typeof o.take, number][])
        expect(o.take[m], `${m}`).toBe(Math.max(1, Math.floor(n * 0.75)));
      expect(o.give).toEqual(przed[k].give);
    });
    expect(st.obcy!.slawa?.lvl ?? 0).toBe(0);
  }, 120_000);

  it('zła sława: poziom +1 (do SLAWA_MAX) z odliczaniem od nowa, bieżące oferty o połowę drożej', () => {
    const { w, st } = doHandlarza(3);
    const przed = structuredClone(st.obcy!.offers);
    const fx = emptyEffects();
    fx.handlarz = { slawa: true };
    applyGov(st, w, fx);
    expect(st.obcy!.slawa!.lvl).toBe(1);
    expect(st.obcy!.slawa!.until).toBeGreaterThan(st.tick);
    st.obcy!.offers.forEach((o, k) => {
      for (const [m, n] of Object.entries(przed[k].take) as [keyof typeof o.take, number][])
        expect(o.take[m], `${m}`).toBe(Math.ceil(n * 1.5));
    });
    for (let k = 0; k < 5; k++) applyGov(st, w, fx);
    expect(st.obcy!.slawa!.lvl).toBe(SLAWA_MAX);
  }, 120_000);

  it('skutek dla handlarza, którego nie ma pod bramą, niczego nie zmienia', () => {
    const { w } = demoWorld('przymorze');
    const st = createSim(w, 3, { core: 4, obcy: true });
    const przed = JSON.stringify(st.obcy);
    const fx = emptyEffects();
    fx.handlarz = { oferta: true, slawa: true };
    applyGov(st, w, fx);
    expect(JSON.stringify(st.obcy)).toBe(przed);
  });
});
