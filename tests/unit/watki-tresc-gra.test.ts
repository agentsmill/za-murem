/* Prawdziwe zakończenia łańcuchów na prawdziwej symulacji i prawdziwym zarządzie (zasada Mateusza: „nie chcę, żeby ktoś
   przychodził, mogę go przyjąć, a tak naprawdę nic nikogo nie ma”). Każdy rodzaj końca ma tu dowód: ci sami ludzie pod
   bramą w kolejnych krokach (imię i twarz), wskazówka na miejsce z apteką, znajomy z nastawieniem −2, awans mieszkańca
   (pionek zmienia rodzaj na `core`), pies tylko bez psa i naprawdę jako pionek, handlarz pod bramą z ofertą, która się zmienia,
   napad zgodny z raportem rano, ugryziony, który naprawdę dostaje ugryzienie, i dobicie, które naprawdę zabija pionek.
   Gra: Przymorze z obcymi (jak w przeglądarce), jeden łańcuch ustawiony ręcznie jako wątek sezonu, zwykła pula zamrożona,
   okna zarządu odpowiadane od ręki (karta nocy zatwierdzona, raport przeczytany), a karty łańcucha tym, co wybierze test. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { expRisk } from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { GameMode, GovEffects, GovState, Prompt } from '../../src/gov/typy.ts';
import { lancuchy } from '../../src/gov/watki.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { celZTarget, maWskazowke } from '../../src/gov/wyprawy.ts';
import { chooseEvent, confirmNight, govUpdate, newGov, pending } from '../../src/gov/zarzad.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, type SimOpts, type SimState } from '../../src/sim/sim.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';

const TPS = 20;
const DZIEN = 24 * 800;
const DEMO = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));

interface Gra {
  w: World;
  st: SimState;
  sim: Sim;
  gov: GovState;
}

type Okno = Extract<Prompt, { k: 'wydarzenie' }>;

/** Przymorze z obcymi, jeden łańcuch jako wątek sezonu, pula zamrożona, dym „już był” */
function nowaGra(
  w: World,
  seed: number,
  lancuch: string,
  o: { mode?: GameMode; mieszkancy?: SimOpts['mieszkancy'] } = {},
): Gra {
  const st = createSim(w, seed, {
    core: 4,
    obcy: true,
    ...(o.mode ? { mode: o.mode } : {}),
    ...(o.mieszkancy ? { mieszkancy: o.mieszkancy } : {}),
  });
  const gov = newGov(seed, o.mode);
  for (const e of M1_EVENTS) gov.ev.last[e.id] = 1e12;
  gov.ev.done.dym = true;
  gov.watki = { wybrane: [lancuch], haki: {}, krok: {} };
  return { w, st, sim: new Sim(w, st), gov };
}

/** Gra do chwili, w której otwiera się okno wydarzenia spełniające `czy` (inne okna odpowiadane od ręki: karta nocy
    zatwierdzona, raport przeczytany, uchwała odłożona, inne wydarzenia pierwszym dostępnym wyborem); null po `dni` dobach. */
function graj(g: Gra, czy: (p: Okno) => boolean, dni = 8): { p: Okno; sek: number } | null {
  const koniec = g.st.tick + dni * DZIEN;
  while (g.st.tick < koniec) {
    g.sim.step();
    if (g.st.tick % TPS) continue;
    const sek = g.st.tick / TPS;
    applyGov(g.st, g.w, govUpdate(g.gov, govInput(g.st, g.w, sek)));
    for (let k = 0; k < 6; k++) {
      const i = govInput(g.st, g.w, sek);
      const p = pending(g.gov, i);
      if (!p) break;
      if (p.k === 'wydarzenie') {
        if (czy(p)) return { p, sek };
        applyGov(
          g.st,
          g.w,
          chooseEvent(
            g.gov,
            i,
            Math.max(
              0,
              p.choices.findIndex((c) => c.ok),
            ),
          ),
        );
      } else if (p.k === 'karta') applyGov(g.st, g.w, confirmNight(g.gov, i));
      else if (p.k === 'raport') g.gov.report = null;
      else if (p.k === 'uchwala') g.gov.lawPending = false;
      else break;
    }
  }
  return null;
}

/** wybór o danym początku napisu (rzuca, gdy go nie ma albo jest niedostępny); skutki idą do symulacji */
function wybierz(g: Gra, o: { p: Okno; sek: number }, prefix: string): GovEffects {
  const k = o.p.choices.findIndex((c) => c.label.pl.startsWith(prefix));
  if (k < 0) throw new Error(`brak wyboru „${prefix}”: ${o.p.choices.map((c) => c.label.pl).join(' | ')}`);
  if (!o.p.choices[k].ok) throw new Error(`wybór „${prefix}” niedostępny`);
  const fx = chooseEvent(g.gov, govInput(g.st, g.w, o.sek), k);
  applyGov(g.st, g.w, fx);
  return fx;
}

/** zapasy leków, jedzenia i złomu do skutków (jak łup z wyprawy), żeby wybory z kosztem były dostępne */
function zapasy(g: Gra, sek: number, d: Partial<Record<'meds' | 'supplies' | 'scrap' | 'parts', number>>): void {
  const fx = emptyEffects();
  Object.assign(fx.stock, d);
  applyGov(g.st, g.w, fx);
  void sek;
}

const imie = (g: Gra, id: number): string => {
  const p = g.st.pawns.find((q) => q.id === id);
  return p && p.person >= 0 ? g.st.people[p.person].name : '?';
};
const wizyta = (g: Gra) => {
  const a = g.gov.goscie!.aktywny!;
  const wpis = govInput(g.st, g.w, 0).goscie!.find((x) => x.id === a.gosc.id)!;
  return { a, wpis, pionki: wpis.pawns.map((id) => g.st.pawns.find((q) => q.id === id)!) };
};
const ID = (id: string) => (p: Okno) => p.id === id;

/** świeży świat dema (symulacja zmienia świat, więc każda gra dostaje własny; ziarno z adresu jak w przeglądarce) */
function swiat(key: 'przymorze' | 'zielonki'): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}
const lan = (id: string) => lancuchy().find((l) => l.id === id)!;

// ---------------------------------------------------------------- świetlne okno, woda, ostrzeżenie: ludzie pod bramą

describe('ci sami ludzie pod bramą w kolejnych krokach', () => {
  it('swiatlo: chłopak z babcią, potem ten sam chłopak z tą samą twarzą; leki dają wskazówkę na aptekę, której ryzyko jest o połowę mniejsze', () => {
    const g = nowaGra(swiat('przymorze'), 5, 'swiatlo');
    let o = graj(g, ID('swiatlo_1'))!;
    expect(o, 'krok 1').toBeTruthy();
    wybierz(g, o, 'Odpowiedzieć latarką');
    o = graj(g, ID('swiatlo_2'))!;
    expect(o, 'krok 2').toBeTruthy();
    const dwa = wizyta(g);
    expect(dwa.wpis.faza).toBe('brama');
    expect(dwa.pionki).toHaveLength(2);
    expect(dwa.pionki.map((q) => imie(g, q.id))).toEqual(dwa.a.gosc.osoby.map((x) => x.name));
    const chlopak = dwa.a.gosc.osoby[0];
    expect(o.p.text.pl).toContain(chlopak.name);
    expect(o.p.gdzie).toEqual(dwa.wpis.gdzie);
    const look = dwa.pionki[0].look;
    wybierz(g, o, 'Podać jedzenie przez siatkę');
    zapasy(g, o.sek, { meds: 3 });
    o = graj(g, ID('swiatlo_3'))!;
    expect(o, 'krok 3').toBeTruthy();
    const trzy = wizyta(g);
    expect(trzy.wpis.faza).toBe('brama');
    expect(trzy.pionki).toHaveLength(1);
    expect(imie(g, trzy.pionki[0].id)).toBe(chlopak.name);
    expect(trzy.pionki[0].look, 'ta sama twarz').toBe(look);
    expect(o.p.text.pl).toContain(chlopak.first);
    // leki: wskazówka na aptekę (bez mapy miasta to cel z TARGETS), ryzyko wyprawy tam o połowę mniejsze
    expect(g.gov.wskazowki).toBeUndefined();
    zapasy(g, o.sek, { meds: 3 });
    const fx = wybierz(g, o, 'Dać leki');
    expect(fx.stock.meds).toBe(-1);
    expect(fx.goscRozkaz?.map((r) => r.co)).toEqual(['odejdz']);
    expect(g.gov.wskazowki).toEqual({ apteka: { dzien: expect.any(Number) } });
    expect(maWskazowke(g.gov, 'apteka')).toBe(true);
    const i = govInput(g.st, g.w, o.sek);
    const cel = celZTarget(TARGETS.find((t) => t.id === 'apteka')!, i.place!);
    const zWsk = expRisk(g.gov, i.people[0], cel);
    const bez = expRisk({ ...g.gov, wskazowki: undefined }, i.people[0], cel);
    expect(zWsk).toBeLessThan(bez);
    // znajomy chłopak: pomoc leży w pamięci zarządu
    const z = g.gov.znajomi!.find((x) => x.osoba.name === chlopak.name)!;
    expect(z.nastawienie).toBeGreaterThan(0);
  }, 180_000);

  it('swiatlo: odmowa leków zostawia znajomego z nastawieniem −2, który może iść z szabrownikami', () => {
    const g = nowaGra(swiat('przymorze'), 5, 'swiatlo');
    let o = graj(g, ID('swiatlo_1'))!;
    wybierz(g, o, 'Zasłonić okno');
    o = graj(g, ID('swiatlo_2'))!;
    const chlopak = wizyta(g).a.gosc.osoby[0];
    wybierz(g, o, 'Podać jedzenie przez siatkę');
    o = graj(g, ID('swiatlo_3'))!;
    wybierz(g, o, 'Odprawić');
    const z = g.gov.znajomi!.find((x) => x.osoba.name === chlopak.name)!;
    expect(z.nastawienie).toBe(-2);
    expect(z.jak).toBe('wyrzucony');
    expect(g.gov.wskazowki).toBeUndefined();
  }, 180_000);

  it('woda: dziewczynka, potem ona z braćmi, potem rodzice z dziećmi; przyjęta rodzina to prawdziwi mieszkańcy z tymi samymi imionami', () => {
    const g = nowaGra(swiat('przymorze'), 7, 'woda');
    let o = graj(g, ID('woda_1'))!;
    expect(o).toBeTruthy();
    const dz = wizyta(g).a.gosc.osoby[0];
    const look1 = wizyta(g).pionki[0].look;
    wybierz(g, o, 'Nalać baniak');
    o = graj(g, ID('woda_2'))!;
    expect(o).toBeTruthy();
    const dwa = wizyta(g);
    expect(dwa.pionki.map((q) => imie(g, q.id))).toEqual(dwa.a.gosc.osoby.map((x) => x.name));
    expect(imie(g, dwa.pionki[0].id)).toBe(dz.name);
    expect(dwa.pionki[0].look).toBe(look1);
    expect(dwa.pionki).toHaveLength(3);
    const dzieci = dwa.a.gosc.osoby.map((x) => x.name);
    wybierz(g, o, 'Nalać wszystkie');
    o = graj(g, ID('woda_3'))!;
    expect(o).toBeTruthy();
    const trzy = wizyta(g);
    const imionaPod = trzy.pionki.map((q) => imie(g, q.id));
    expect(imionaPod).toEqual(trzy.a.gosc.osoby.map((x) => x.name));
    for (const n of dzieci) expect(imionaPod).toContain(n);
    expect(imionaPod).toHaveLength(5);
    wybierz(g, o, 'Przyjąć całą rodzinę');
    for (let t = 0; t < 4000; t++) g.sim.step();
    const po = trzy.pionki.map((q) => g.st.pawns.find((x) => x.id === q.id)!);
    expect(po.every((q) => q.kind === 'resident')).toBe(true);
  }, 240_000);

  it('ostrzega: ostrzeżenie podwaja wartę i podnosi szansę napadu, a krok po nocy mówi to samo co raport', () => {
    const g = nowaGra(swiat('przymorze'), 9, 'ostrzega');
    let o = graj(g, ID('ostrzega_1'))!;
    expect(o, 'krok 1').toBeTruthy();
    const w1 = wizyta(g);
    expect(w1.wpis.faza).toBe('brama');
    expect(w1.pionki).toHaveLength(1);
    const ochroniarz = w1.a.gosc.osoby[0];
    zapasy(g, o.sek, { supplies: 3 });
    const fx = wybierz(g, o, 'Podziękować, dać jedzenie');
    expect(fx.goscRozkaz?.map((r) => r.co)).toEqual(['jedzenie']);
    expect(g.gov.tonight.alert).toBeGreaterThan(0);
    // poscig(): szansa napadu tej nocy ×1,5 (znacznik nocy w stanie zarządu)
    expect(g.gov.tonight.poscig).toBe(g.gov.tonight.alert);
    o = graj(g, ID('ostrzega_2'))!;
    expect(o, 'krok 2').toBeTruthy();
    const w2 = wizyta(g);
    expect(imie(g, w2.pionki[0].id)).toBe(ochroniarz.name);
    expect(w2.pionki[0].look).toBe(w1.pionki[0].look);
    // tekst zgadza się z raportem tej nocy
    const raport = g.gov.reports.find((r) => r.day === g.gov.tonight.alert)!;
    expect(raport, 'raport nocy ostrzeżenia').toBeTruthy();
    const slowo = { odparty: 'odparliście', wtargnięcie: 'weszli na podwórko', brak: 'nikt nie przyszedł' }[
      raport.raid
    ];
    expect(o.p.text.pl.toLowerCase()).toContain(slowo);
    // przyjęty do zarządu naprawdę wchodzi do zarządu
    const core0 = g.st.pawns.filter((q) => q.kind === 'core').length;
    wybierz(g, o, 'Przyjąć do zarządu');
    for (let t = 0; t < 4000; t++) g.sim.step();
    expect(g.st.pawns.filter((q) => q.kind === 'core')).toHaveLength(core0 + 1);
    expect(g.st.pawns.find((q) => q.id === w2.pionki[0].id)!.kind).toBe('core');
  }, 240_000);
});

// ---------------------------------------------------------------- pies

describe('szczekanie: pies tylko bez psa i naprawdę jako pionek', () => {
  /** gra tuż przed trzecim krokiem (hak i numer kroku ustawione ręcznie) */
  const doTrzeciego = (flaga: boolean) => {
    const g = nowaGra(swiat('przymorze'), 4, 'szczekanie');
    g.gov.watki!.krok.szczekanie = 2;
    g.gov.watki!.haki.szczekanie_2 = { t: 0 };
    g.gov.watki!.haki['szczekanie.slady'] = { t: 0, d: { jak: 'resztki' } };
    if (flaga) g.gov.flags.dog = true;
    return g;
  };

  it('bez psa: wybór „Przygarnąć” ustawia flagę, a symulacja wystawia pionek psa', () => {
    const g = doTrzeciego(false);
    const o = graj(g, ID('szczekanie_3'), 3)!;
    expect(o).toBeTruthy();
    zapasy(g, o.sek, { supplies: 3 });
    expect(g.st.zwierzeta?.pies).toBeUndefined();
    wybierz(g, o, 'Przygarnąć');
    expect(g.gov.flags.dog).toBe(true);
    for (let t = 0; t < 2000; t++) {
      g.sim.step();
      if (t % TPS === 0) applyGov(g.st, g.w, govUpdate(g.gov, govInput(g.st, g.w, g.st.tick / TPS)));
    }
    expect(g.st.zwierzeta?.pies).toBe('zyje');
    expect(g.st.pawns.some((q) => q.kind === 'pies')).toBe(true);
  }, 120_000);

  it('z psem (flaga) krok nie wypada wcale i nie da się go otworzyć', () => {
    const g = doTrzeciego(true);
    expect(graj(g, ID('szczekanie_3'), 3)).toBeNull();
    const h = makeHost(g.gov, govInput(g.st, g.w, 0), emptyEffects());
    expect(h.pies()).toBe(true);
    for (const k of lan('szczekanie').kroki) expect(k.w(h), k.id).toBe(0);
  }, 120_000);

  it('z wpisem o psie w odczycie (nawet martwym) nie wypada żaden krok łańcucha', () => {
    const g = nowaGra(swiat('przymorze'), 4, 'szczekanie');
    g.st.zwierzeta = { pies: 'zginal' };
    const h = makeHost(g.gov, govInput(g.st, g.w, 0), emptyEffects());
    expect(h.pies()).toBe(true);
    for (const k of lan('szczekanie').kroki) expect(k.w(h), k.id).toBe(0);
  });
});

// ---------------------------------------------------------------- handlarz

describe('dlug: handlarz pod bramą, oferta albo zła sława naprawdę się zmieniają', () => {
  /** gra do pierwszego kroku (handlarz stoi pod bramą z wózkiem) */
  function doDlugu() {
    const g = nowaGra(swiat('przymorze'), 3, 'dlug');
    const o = graj(g, ID('dlug_1'), 5)!;
    expect(o, 'krok 1').toBeTruthy();
    return { g, o };
  }

  it('krok 1 otwiera się, kiedy handlarz naprawdę stoi pod bramą, z jego miejscem na mapie', () => {
    const { g, o } = doDlugu();
    const i = govInput(g.st, g.w, o.sek);
    expect(i.handlarz).toBeTruthy();
    expect(o.p.gdzie).toEqual(i.handlarz!.gdzie);
    const trader = g.st.pawns.find((q) => q.id === g.st.obcy!.trader)!;
    expect(trader.kind).toBe('handlarz');
  }, 120_000);

  it('kredyt trafia do zapasów, a spłata długu przy następnej wizycie daje handlarzowi tańszą ofertę', () => {
    const { g, o } = doDlugu();
    const jedz0 = govInput(g.st, g.w, o.sek).stock.supplies;
    wybierz(g, o, 'Wziąć na kredyt');
    expect(govInput(g.st, g.w, o.sek).stock.supplies).toBeGreaterThan(jedz0);
    expect(g.gov.watki!.haki['dlug.wziete']).toBeTruthy();
    // handlarz odchodzi, wraca w kolejnej wizycie, a karta długu wypada od razu (krok pilny)
    const o2 = graj(g, ID('dlug_2'), 10)!;
    expect(o2, 'krok 2 przy kolejnej wizycie').toBeTruthy();
    expect(govInput(g.st, g.w, o2.sek).handlarz).toBeTruthy();
    zapasy(g, o2.sek, { scrap: 10 });
    const przed = structuredClone(g.st.obcy!.offers);
    wybierz(g, o2, 'Oddać złomem');
    g.st.obcy!.offers.forEach((of, k) => {
      expect(of.left).toBe(przed[k].left + 1);
      for (const [m, n] of Object.entries(przed[k].take) as [keyof typeof of.take, number][])
        expect(of.take[m]).toBeLessThanOrEqual(n);
    });
    expect(g.st.obcy!.slawa?.lvl ?? 0).toBe(0);
  }, 240_000);

  it('niespłacony dług to zła sława u handlarzy: poziom +1, bieżące oferty o połowę droższe', () => {
    const { g, o } = doDlugu();
    wybierz(g, o, 'Wziąć na kredyt');
    const o2 = graj(g, ID('dlug_2'), 10)!;
    expect(o2).toBeTruthy();
    const przed = structuredClone(g.st.obcy!.offers);
    wybierz(g, o2, 'Nie oddawać');
    expect(g.st.obcy!.slawa!.lvl).toBe(1);
    g.st.obcy!.offers.forEach((of, k) => {
      for (const [m, n] of Object.entries(przed[k].take) as [keyof typeof of.take, number][])
        expect(of.take[m]).toBe(Math.ceil(n * 1.5));
    });
  }, 240_000);
});

// ---------------------------------------------------------------- mieszkańcy z generatora: awans, zdrowie

describe('mieszkańcy z generatora: awans do zarządu i zdrowie bohaterki', () => {
  async function gra(seed: number, lancuch: string): Promise<Gra> {
    const { world, mieszkancy } = await swiatMieszkancow(DEMO, seed, 4);
    return nowaGra(world, seed, lancuch, { mieszkancy });
  }

  /** karta kroku otwarta ręcznie na świeżym zarządzie z mieszkańcami z generatora: dane z `make`, hak kroku poprzedniego */
  function otworz(g: Gra, krokId: string, haki: Record<string, unknown>) {
    const l = lancuchy().find((x) => x.kroki.some((k) => k.id === krokId))!;
    const k = l.kroki.find((x) => x.id === krokId)!;
    g.gov.watki!.krok[l.id] = k.nr - 1;
    g.gov.watki!.haki[l.kroki[k.nr - 2].id] = { t: 0 };
    for (const [id, d] of Object.entries(haki)) g.gov.watki!.haki[id] = { t: 0, d };
    const i = govInput(g.st, g.w, 100);
    const h = makeHost(g.gov, i, emptyEffects());
    const d = k.make(h);
    expect(d, `dane kroku ${krokId}`).toBeTruthy();
    g.gov.ev.active = { id: k.id, d };
    return { p: { id: k.id } as unknown as Okno, sek: 100 };
  }

  it('puszki: „Wciągnąć do zarządu” robi z mieszkańca z puszkami osobę zarządu (ten sam pionek, rodzaj core)', async () => {
    const g = await gra(2051, 'puszki');
    const i = govInput(g.st, g.w, 0);
    const h = makeHost(g.gov, i, emptyEffects());
    expect(lan('puszki').kroki[0].w(h)).toBeGreaterThan(0);
    const d1 = lan('puszki').kroki[0].make(h)!;
    const lok = i.lokatorzy!.find((l) => l.id === d1.lok)!;
    otworz(g, 'puszki_3', { 'puszki.radio': { lok: d1.lok, p: d1.p, antena: true } });
    const p3 = lan('puszki').kroki[2];
    const w = p3.choices(makeHost(g.gov, i, emptyEffects()), g.gov.ev.active!.d);
    const k = w.findIndex((c) => c.label.pl.startsWith('Wciągnąć'));
    expect(k).toBeGreaterThanOrEqual(0);
    const fx = chooseEvent(g.gov, i, k);
    expect(fx.awans).toEqual([lok.id]);
    applyGov(g.st, g.w, fx);
    const pion = g.st.pawns.find((q) => q.person >= 0 && g.st.people[q.person].id === lok.id)!;
    expect(pion.kind).toBe('core');
    expect(g.st.pawns.find((q) => q.id === lok.pawn)!.kind).toBe('core');
  }, 120_000);

  it('aktywistka: przyjęta pod bramą zostaje mieszkanką, a „Wciągnąć do zarządu” robi z niej osobę zarządu', async () => {
    const g = await gra(2051, 'aktywistka');
    // prawdziwa mieszkanka z generatora gra rolę przyjętej aktywistki: karta szuka jej po imieniu
    const i0 = govInput(g.st, g.w, 0);
    const kto = i0.lokatorzy!.find((l) => l.age >= 18)!;
    const o = otworz(g, 'aktywistka_3', { 'aktywistka.przyjeta': { name: kto.name } });
    const i = govInput(g.st, g.w, o.sek);
    const d = g.gov.ev.active!.d as { lok: string; p: { name: string } };
    expect(d.p.name).toBe(kto.name);
    const p3 = lan('aktywistka').kroki[2];
    const ch = p3.choices(makeHost(g.gov, i, emptyEffects()), d);
    const k = ch.findIndex((c) => c.label.pl.startsWith('Wciągnąć'));
    const fx = chooseEvent(g.gov, i, k);
    expect(fx.awans).toEqual([kto.id]);
    applyGov(g.st, g.w, fx);
    expect(g.st.pawns.find((q) => q.id === kto.pawn)!.kind).toBe('core');
  }, 120_000);

  it('pluca: leki podnoszą zdrowie mieszkanki, odmowa je załamuje, a zła opieka kosztuje zaufanie osiedla', async () => {
    const g = await gra(2051, 'pluca');
    const i = govInput(g.st, g.w, 0);
    const h = makeHost(g.gov, i, emptyEffects());
    const k1 = lan('pluca').kroki[0];
    expect(k1.w(h)).toBeGreaterThan(0);
    const d = k1.make(h)!;
    const pion = g.st.pawns.find((q) => q.person >= 0 && g.st.people[q.person].id === d.lok)!;
    expect(pion.kind).toBe('resident');
    pion.needs!.health = 40;
    zapasy(g, 0, { meds: 4 });
    const wybor = (krok: (typeof k1)[], dane: unknown, prefix: string): GovEffects => {
      g.gov.ev.active = { id: krok[0].id, d: dane };
      const ch = krok[0].choices(makeHost(g.gov, govInput(g.st, g.w, 0), emptyEffects()), dane);
      const k = ch.findIndex((c) => c.label.pl.startsWith(prefix));
      expect(k, prefix).toBeGreaterThanOrEqual(0);
      const fx = chooseEvent(g.gov, govInput(g.st, g.w, 0), k);
      applyGov(g.st, g.w, fx);
      return fx;
    };
    // krok 1: leki kosztują i podnoszą zdrowie mieszkanki o 15
    const fx1 = wybor([k1], d, 'Dać leki');
    expect(fx1.stock.meds).toBe(-1);
    expect(pion.needs!.health).toBe(55);
    // krok 2 bez leków: zdrowie spada o 20, opieka zostaje na jednym podaniu
    const d2 = g.gov.watki!.haki['pluca.pierwsze'].d as { opieka: number };
    expect(d2.opieka).toBe(1);
    wybor([lan('pluca').kroki[1]], d2, 'Nie dawać');
    expect(pion.needs!.health).toBe(35);
    const d3 = g.gov.watki!.haki['pluca.drugie'].d as { opieka: number };
    expect(d3.opieka).toBe(1);
    // krok 3 przy opiece 1 to „ani lepiej, ani gorzej”; przy 0 zostawienie jej samej kosztuje zdrowie i zaufanie osiedla
    const z0 = g.gov.trust;
    const a0 = g.gov.anger;
    wybor([lan('pluca').kroki[2]], { ...d3, opieka: 0 }, 'Zostawić, jak jest');
    expect(pion.needs!.health).toBe(20);
    expect(g.gov.trust).toBeLessThan(z0);
    expect(g.gov.anger).toBeGreaterThan(a0);
    // wdzięczność: dwa podania dają dar do zapasów rano i lepszy nastrój osiedla
    const fx3 = wybor([lan('pluca').kroki[2]], { ...d3, opieka: 3 }, 'Przyjąć ogórki');
    expect(g.gov.later.some((l) => (l.stock.supplies ?? 0) === 2)).toBe(true);
    expect(fx3.moods.length).toBeGreaterThan(0);
  }, 120_000);
});

// ---------------------------------------------------------------- tryb zombie: ugryziony i dobicie

describe('zombie: ugryziony naprawdę dostaje ugryzienie, a dobicie naprawdę zabija pionek', () => {
  // w trybie zombie goście dochodzą do bramy tylko wtedy, gdy zarząd zaplanuje wizytę przy spokoju przy siatce (`ulicaWolna`;
  // szwendacze płoszą grupę po drodze), więc testy biorą ziarna, w których spokój trafia się w ciągu 4 dób (zadanie 16: były 10 i 20)

  it('dach: ocaleni z ukrytym ugryzieniem; wpuszczeni na noc dostają ugryzienie (gorączka u ugryzionego pionka)', () => {
    const g = nowaGra(swiat('zielonki'), 1, 'dach', { mode: 'zombie' });
    // kroki 1–2 pominięte: trzeci krok od razu
    g.gov.watki!.krok.dach = 2;
    g.gov.watki!.haki.dach_2 = { t: 0 };
    const o = graj(g, ID('dach_3'), 4)!;
    expect(o, 'ocaleni pod bramą').toBeTruthy();
    const w = wizyta(g);
    expect(w.wpis.faza).toBe('brama');
    expect(w.a.gosc.haczyk).toBe('ugryziony');
    expect(w.a.gosc.ugryziony).toBe(1);
    expect(w.pionki.length).toBeGreaterThan(1);
    // ugryziony pionek jeszcze zdrowy, a karta o nim milczy, dopóki ręce nie zostaną obejrzane
    const bity = w.pionki[w.wpis.zywi.indexOf(1)];
    expect(bity.bite).toBeUndefined();
    const fx = wybierz(g, o, 'Wpuścić na noc');
    expect(fx.goscRozkaz?.map((r) => r.co)).toEqual(['noc', 'ugryziony']);
    for (let t = 0; t < 400; t++) g.sim.step();
    expect(g.st.pawns.find((q) => q.id === bity.id)!.bite, 'ugryzienie w pionku').not.toBeUndefined();
  }, 300_000);

  it('dach: „Obejrzeć ręce” odsłania ugryzionego, a karta zostaje otwarta', () => {
    const g = nowaGra(swiat('zielonki'), 1, 'dach', { mode: 'zombie' });
    g.gov.watki!.krok.dach = 2;
    g.gov.watki!.haki.dach_2 = { t: 0 };
    const o = graj(g, ID('dach_3'), 4)!;
    expect(o).toBeTruthy();
    const w = wizyta(g);
    const bity = w.a.gosc.osoby[1];
    wybierz(g, o, 'Obejrzeć ręce');
    expect(g.gov.ev.active?.id).toBe('dach_3');
    expect(g.gov.goscie!.aktywny!.obejrzano).toBe('ugryziony');
    const widok = pending(g.gov, govInput(g.st, g.w, o.sek));
    expect(widok?.k).toBe('wydarzenie');
    if (widok?.k === 'wydarzenie') expect(widok.text.pl).toContain(`${bity.first} ma pod rękawem świeże ugryzienie`);
  }, 300_000);

  it('dobicie: osoba z dzidą bije ugryzionego chłopca przez siatkę, matka odchodzi; chłopiec nie stoi już pod bramą', () => {
    const g = nowaGra(swiat('przymorze'), 1, 'dobicie', { mode: 'zombie' });
    const o = graj(g, ID('dobicie_1'), 4)!;
    expect(o, 'matka z synem pod bramą').toBeTruthy();
    // bez dzidy w zarządzie dobicie jest niedostępne; z dzidą (wzięta po przyjściu matki) okno ma je w wyborach
    const dobic = (p: Okno) => p.choices.find((c) => c.label.pl.startsWith('Dobić przez siatkę'))!;
    // karta otwiera się dopiero przy spokoju przy siatce, więc ktoś mógł już wziąć dzidę z zestawu startowego: zdejmujemy ją, żeby
    // sprawdzić oba stany (zadanie 16)
    for (const q of g.st.pawns) if (q.kind === 'core') q.weapon = null;
    o.p = pending(g.gov, govInput(g.st, g.w, o.sek)) as Okno;
    expect(dobic(o.p).ok).toBe(false);
    for (const q of g.st.pawns) if (q.kind === 'core') q.weapon = 'dzida';
    const p2 = pending(g.gov, govInput(g.st, g.w, o.sek)) as Okno;
    expect(dobic(p2).ok).toBe(true);
    o.p = p2;
    const w = wizyta(g);
    expect(w.pionki).toHaveLength(2);
    const chlopiec = w.pionki[1];
    const imieChlopca = imie(g, chlopiec.id);
    expect(imieChlopca).toBe(w.a.gosc.osoby[1].name);
    expect(o.p.text.pl).toContain(w.a.gosc.osoby[1].first);
    const fx = wybierz(g, o, 'Dobić przez siatkę dzidą');
    expect(fx.goscRozkaz?.map((r) => r.co)).toEqual(['dobij', 'odejdz']);
    for (let t = 0; t < 400; t++) g.sim.step();
    expect(g.st.pawns.some((q) => q.id === chlopiec.id && q.kind === 'gosc')).toBe(false);
    // umarł ten chłopiec, nie ktokolwiek: wpis o zgonie z jego imieniem i jego zwłoki na mapie
    const zgon = (g.st.dead ?? []).findIndex((d) => d.name === imieChlopca);
    expect(zgon, `wpis o zgonie ${imieChlopca}`).toBeGreaterThanOrEqual(0);
    expect(g.st.dead![zgon].kind).toBe('gosc');
    expect(
      g.st.things.some((t) => t.kind === 'zwloki' && t.dead === zgon),
      'zwłoki chłopca',
    ).toBe(true);
  }, 300_000);
});

// ---------------------------------------------------------------- radio i list: wskazówki

describe('wskazówki z listu i z radia', () => {
  it('list: adres skrytki to wskazówka, a bez mapy miasta wskazówka na cel z TARGETS', () => {
    const g = nowaGra(swiat('przymorze'), 6, 'list');
    let o = graj(g, ID('list_1'))!;
    wybierz(g, o, 'Przeczytać na głos');
    o = graj(g, ID('list_2'))!;
    expect(o).toBeTruthy();
    expect(g.gov.wskazowki).toBeUndefined();
    wybierz(g, o, 'Zapisać adres');
    expect(Object.keys(g.gov.wskazowki!)).toEqual(['pawilon']);
  }, 120_000);

  it('glos: posterunek to wskazówka z bronią, a ludzie, którzy czekali, mają gorszy nastrój niż ci, co spali', () => {
    const wynik: Record<string, number> = {};
    for (const jak of ['Przygotować ludzi', 'Nie wierzyć']) {
      const g = nowaGra(swiat('przymorze'), 8, 'glos', { mode: 'zombie' });
      let o = graj(g, ID('glos_1'))!;
      wybierz(g, o, 'Zapisać częstotliwość');
      o = graj(g, ID('glos_2'))!;
      wybierz(g, o, jak);
      o = graj(g, ID('glos_3'))!;
      expect(o, 'krok 3').toBeTruthy();
      const nastroj0 = g.st.pawns.filter((q) => q.kind === 'core').map((q) => q.moods.reduce((a, m) => a + m.d, 0));
      const fx = wybierz(g, o, 'Zapisać, gdzie stał posterunek');
      expect(Object.values(g.gov.wskazowki!)[0]).toEqual({ dzien: expect.any(Number), bron: true });
      expect(fx.moods.length).toBeGreaterThan(0);
      wynik[jak] = fx.moods[0].d;
      void nastroj0;
    }
    expect(wynik['Przygotować ludzi']).toBeLessThan(wynik['Nie wierzyć']);
  }, 240_000);
});
