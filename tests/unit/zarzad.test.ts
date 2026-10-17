/* Zarząd (src/gov): karta nocy, uchwały, zaufanie i wkurzenie, harmonogram wydarzeń, determinizm,
   zapis i wczytanie. Na atrapie symulacji z tests/unit/gov-atrapa.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAW_CD } from '../../src/content/data.ts';
import { FIRST_LAWS, NEW_EVENTS, OLD_EVENTS, poraOf } from '../../src/gov/tresc.ts';
import type { GovInput, GovState } from '../../src/gov/typy.ts';
import { dailyDrift, lawState } from '../../src/gov/uchwaly.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { confirmNight, govUpdate, loadGov, newGov, pending, saveGov, setNight, signLaw } from '../../src/gov/zarzad.ts';
import { Atrapa, at, run, TPH, TPS } from './gov-atrapa.ts';

/** przebieg bez odpowiadania na nic, aż pojawi się decyzja danego rodzaju */
function until(gov: GovState, atr: Atrapa, kind: string, limit = at(3, 0)) {
  while ((atr.day - 1) * 1440 + atr.hour * 60 + atr.minute < limit) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(1);
    if (atr.tick % TPS !== 0) continue;
    atr.apply(govUpdate(gov, atr.input()));
    const p = pending(gov, atr.input());
    if (p?.k === kind) return p;
    if (p?.k === 'wydarzenie') {
      // odpowiedź na wydarzenie, żeby nie blokowało
      const k = p.choices.findIndex((c) => c.ok);
      atr.apply(govChoose(gov, atr.input(), k));
    }
    if (p?.k === 'raport') gov.report = null;
  }
  return null;
}

import { chooseEvent as govChoose } from '../../src/gov/zarzad.ts';

const input = (over: Partial<GovInput> = {}): GovInput => ({ ...new Atrapa(1).input(), ...over });

describe('karta nocy', () => {
  it('o 20:00 pierwszego dnia: propozycja, warta przy bramie i przy dziurach, wyprawy z ryzykiem i łupem', () => {
    const gov = newGov(1);
    const atr = new Atrapa(1);
    const law = until(gov, atr, 'uchwala');
    expect(law).toBeTruthy();
    expect(atr.hour * 60 + atr.minute).toBe(19 * 60 + 30);
    signLaw(gov, atr.input(), null);
    const p = until(gov, atr, 'karta');
    expect(p?.k).toBe('karta');
    if (p?.k !== 'karta') return;
    expect(atr.day).toBe(1);
    expect(atr.hour).toBe(20);
    const card = p.card;
    // czwórka zarządu, czasem ktoś dołączył z wydarzenia
    expect(card.people.length).toBeGreaterThanOrEqual(4);
    expect(card.forecast).toContain('Pierwsza noc');
    expect(card.chance).toBeGreaterThanOrEqual(0.05);
    expect(card.chance).toBeLessThanOrEqual(0.85);
    expect(card.posts.map((x) => x.key)).toEqual(expect.arrayContaining(['brama', 'd1', 'd2', 'd3']));
    for (const cp of card.people) {
      const keys = cp.options.map((o) => o.key);
      expect(keys).toEqual(
        expect.arrayContaining(['sen', 'warta:brama', 'warta:d1', 'wyprawa:blisko', 'wyprawa:daleko']),
      );
      for (const o of cp.options.filter((x) => x.key.startsWith('wyprawa:'))) {
        expect(o.risk).toBeGreaterThan(0);
        expect(o.risk).toBeLessThan(1);
        expect(Object.keys(o.gain ?? {}).length).toBeGreaterThan(0);
      }
      for (const o of cp.options.filter((x) => x.key.startsWith('warta:'))) expect(o.guard).toBeGreaterThan(0);
    }
    // przy szansie od 25% zarząd proponuje wartę przy najsłabszym miejscu
    if (card.chance >= 0.25) expect(Object.values(p.assign)).toContain(`warta:${card.posts[0].key}`);
    // spodziewane straty widać przed decyzją
    expect(card.loss.wood + card.loss.supplies).toBeGreaterThanOrEqual(0);
    expect(card.advice.length).toBeGreaterThan(10);
  });

  it('niedozwolona opcja się nie ustawia, zatwierdzenie wysyła wyprawę i wartę', () => {
    const gov = newGov(2);
    const atr = new Atrapa(2);
    until(gov, atr, 'uchwala');
    signLaw(gov, atr.input(), null);
    const p = until(gov, atr, 'karta');
    if (p?.k !== 'karta') throw new Error('brak karty');
    const [a, b] = p.card.people;
    for (const cp of p.card.people) expect(setNight(gov, cp.id, 'sen')).toBe(true);
    expect(setNight(gov, a.id, 'warta:nie-ma-takiej')).toBe(false);
    expect(setNight(gov, a.id, 'warta:d1')).toBe(true);
    expect(setNight(gov, b.id, 'wyprawa:blisko')).toBe(true);
    const fx = confirmNight(gov, atr.input());
    expect(fx.guards).toEqual([{ id: a.id, post: 'd1' }]);
    expect(fx.away.map((x) => x.id)).toEqual([b.id]);
    expect(pending(gov, atr.input())?.k).not.toBe('karta');
  });

  it('rano raport: wyprawa wraca, napad rozstrzygnięty, kto nie spał, zmiany zaufania i wkurzenia', () => {
    let reports = 0;
    let back = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { gov, steps } = run(seed, 'zawsze-warta', at(2, 6, 30));
      const r = gov.reports[0];
      expect(r, `ziarno ${seed}`).toBeTruthy();
      expect(['brak', 'odparty', 'wtargnięcie']).toContain(r.raid);
      expect(r.lines.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.dTrust) && Number.isFinite(r.dAnger)).toBe(true);
      if (r.raid !== 'wtargnięcie') expect(r.stolen.wood + r.stolen.supplies).toBe(0);
      expect(r.tired.length).toBeGreaterThan(0); // polityka zawsze ma kogoś na warcie
      reports++;
      if (steps.some((s) => s.kind === 'karta' && s.text.includes('wyprawa'))) {
        back++;
        expect(r.lines.some((l) => l.includes('wrócił') || l.includes('wróciła') || l.includes('trafił'))).toBe(true);
      }
    }
    expect(reports).toBe(20);
    expect(back).toBeGreaterThan(0);
  });

  it('noc bez warty kosztuje: więcej wtargnięć i strat niż z wartą', () => {
    const stats = (policy: 'zawsze-warta' | 'nigdy-warty') => {
      let entered = 0;
      let lost = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const { gov } = run(seed, policy, at(4, 6, 30));
        for (const r of gov.reports) {
          if (r.raid === 'wtargnięcie') entered++;
          lost += r.stolen.wood + r.stolen.supplies;
        }
      }
      return { entered, lost };
    };
    const yes = stats('zawsze-warta');
    const no = stats('nigdy-warty');
    expect(yes.entered).toBeLessThan(no.entered * 0.6);
    expect(yes.lost).toBeLessThan(no.lost);
  });
});

describe('uchwały, zaufanie i wkurzenie', () => {
  it('pierwsza uchwała wieczorem pierwszego dnia: warta, wspólny kocioł, meble na opał', () => {
    const gov = newGov(3);
    const atr = new Atrapa(3);
    const p = until(gov, atr, 'uchwala');
    if (p?.k !== 'uchwala') throw new Error('brak uchwały');
    expect(p.first).toBe(true);
    expect(p.options.map((o) => o.id)).toEqual([...FIRST_LAWS]);
    expect(p.options.every((o) => o.s === 'ok')).toBe(true);
  });

  it('drogi się wykluczają, warunki i odnowienie jak w 0.3', () => {
    const gov = newGov(4);
    const i = input({ day: 1, hour: 19, minute: 30 });
    expect(lawState(gov, i, 'u_brama').s).toBe('lock'); // najpierw warty
    const t0 = gov.trust;
    signLaw(gov, i, 'u_warty');
    expect(gov.laws.path).toBe('porzadek');
    expect(lawState(gov, i, 'u_kociol').s).toBe('lock');
    expect(lawState(gov, i, 'u_zebrania').s).toBe('lock');
    expect(lawState(gov, i, 'u_meble').s).toBe('cd');
    expect(gov.trust).toBe(t0);
    // odnowienie: 36 godzin gry (LAW_CD z 0.3)
    const later = (min: number) => {
      const t = 19 * 60 + 30 + min;
      return input({ day: 1 + Math.floor(t / 1440), hour: Math.floor(t / 60) % 24, minute: t % 60 });
    };
    expect(lawState(gov, later(LAW_CD - 1), 'u_brama').s).toBe('cd');
    expect(lawState(gov, later(LAW_CD), 'u_brama').s).toBe('ok');
    // skutki od razu
    const g2 = newGov(5);
    signLaw(g2, i, 'u_kociol');
    expect(g2.trust).toBe(52);
    const g3 = newGov(6);
    signLaw(g3, i, 'u_meble');
    expect(g3.anger).toBe(22);
    // odłożenie pierwszej uchwały kosztuje trochę zaufania
    const g4 = newGov(7);
    g4.lawPending = true;
    g4.lawDay = 1;
    signLaw(g4, i, null);
    expect(g4.trust).toBe(49);
    expect(g4.lawPending).toBe(false);
  });

  it('dzienna zmiana: zimno i głód wkurzają, ciepło, jedzenie i ognisko uspokajają, uchwały co dzień', () => {
    const base = new Atrapa(8).input();
    const withNeeds = (food: number, warm: number, safe: number) => ({
      ...base,
      people: base.people.map((p) => ({ ...p, traits: [], needs: { ...p.needs, food, warm, safe } })),
    });
    const cold = newGov(9);
    const [dT1, dA1] = dailyDrift(cold, withNeeds(20, 20, 30));
    expect(dA1).toBeGreaterThan(5);
    expect(dT1).toBeLessThan(-2);
    const cozy = newGov(9);
    cozy.evening.campfire = true;
    const [dT2, dA2] = dailyDrift(cozy, withNeeds(80, 80, 80));
    expect(dA2).toBeLessThan(-1.5);
    expect(dT2).toBeGreaterThan(0.5);
    const rations = newGov(9);
    rations.laws.signed.u_racje = true;
    const [, dA3] = dailyDrift(rations, withNeeds(80, 80, 80));
    expect(dA3).toBeCloseTo(dA2 + 0.4 + 0.4, 5); // bez ogniska (+0,4) i racje (+0,4)
  });

  it('spalone meble wkurzają, z uchwałą o meblach o połowę mniej; lista jak w snapshot() też działa', () => {
    const base = new Atrapa(14).input();
    const plain = newGov(14);
    const [, a1] = dailyDrift(plain, { ...base, burned: 0 });
    const burnt = newGov(14);
    const [, a2] = dailyDrift(burnt, { ...base, burned: [{}, {}] });
    expect(a2 - a1).toBeCloseTo(0.6, 5);
    const allowed = newGov(14);
    allowed.laws.signed.u_meble = true;
    const [, a3] = dailyDrift(allowed, { ...base, burned: 2 });
    expect(a3 - a1).toBeCloseTo(0.3 + 0.1, 5); // połowa kary i codzienne +0,1 z uchwały
  });

  it('koniec gry: wkurzenie 100 odwołuje zarząd, zaufanie 0 to exodus', () => {
    const a = newGov(10);
    a.anger = 100;
    govUpdate(a, input());
    expect(a.over).toBe('odwolanie');
    const b = newGov(10);
    b.trust = 0;
    govUpdate(b, input());
    expect(b.over).toBe('exodus');
  });
});

describe('wydarzenia', () => {
  it('pierwsze po około 70 s przy ekranie, potem gęsto przez 10 minut, zawsze w swojej porze dnia', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const gov = newGov(seed);
      const atr = new Atrapa(seed);
      const seen: { s: number; id: string; hour: number }[] = [];
      while (atr.tick / TPS < 600) {
        atr.tick++;
        if (atr.tick % TPH === 0) atr.hourly(1);
        if (atr.tick % TPS !== 0) continue;
        const busyBefore = !!gov.report || gov.lawPending || (!!gov.night && !gov.night.confirmed);
        const had = gov.ev.active;
        atr.apply(govUpdate(gov, atr.input()));
        if (gov.ev.active && !had) {
          // nowe wydarzenie nie przychodzi, kiedy czeka karta, uchwała albo raport
          expect(busyBefore).toBe(false);
          seen.push({ s: atr.tick / TPS, id: gov.ev.active.id, hour: atr.hour });
        }
        const p = pending(gov, atr.input());
        if (p?.k === 'wydarzenie')
          atr.apply(
            govChoose(
              gov,
              atr.input(),
              p.choices.findIndex((c) => c.ok),
            ),
          );
        else if (p?.k === 'uchwala') signLaw(gov, atr.input(), null);
        else if (p?.k === 'karta') atr.apply(confirmNight(gov, atr.input()));
        else if (p?.k === 'raport') gov.report = null;
      }
      expect(seen[0].s).toBeGreaterThanOrEqual(70);
      expect(seen[0].s).toBeLessThanOrEqual(81);
      for (const e of seen) {
        const def = M1_EVENTS.find((d) => d.id === e.id)!;
        expect(def.when, `${e.id} o ${e.hour}`).toContain(poraOf(e.hour));
      }
      // po decyzji następne najwcześniej po 38 s
      for (let k = 1; k < seen.length; k++) expect(seen[k].s - seen[k - 1].s).toBeGreaterThanOrEqual(38);
    }
  });

  it('decyzja zarządu w każdej minucie od drugiej do dziesiątej (w pierwszej jest samouczek)', () => {
    let full = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { gov } = run(seed, 'propozycja', at(2, 6, 1));
      const d = gov.decisions.map((x) => x.s).filter((x) => x <= 600);
      const covered = Array.from({ length: 9 }, (_, m) => d.some((x) => x >= (m + 1) * 60 && x < (m + 2) * 60));
      expect(covered.filter(Boolean).length, `ziarno ${seed}`).toBeGreaterThanOrEqual(8);
      if (covered.every(Boolean)) full++;
    }
    expect(full).toBeGreaterThanOrEqual(27);
  });

  it('wydarzenia z 0.3 i nowe działają na hoście zarządu, skutki trafiają do zapasów', () => {
    expect(M1_EVENTS.length).toBe(OLD_EVENTS.length + NEW_EVENTS.length);
    for (const def of M1_EVENTS) {
      for (let k = 0; k < 4; k++) {
        const gov = newGov(20 + k);
        const atr = new Atrapa(20 + k);
        atr.supplies = 30;
        atr.scrap = 5;
        atr.woodSklad = 6;
        const i = { ...atr.input(), hour: 21, kozaLit: true };
        const fx = emptyEffects();
        const h = makeHost(gov, i, fx);
        const d = def.make(h);
        if (d === null) continue;
        const choices = def.choices(h, d);
        expect(typeof def.title(h, d)).toBe('string');
        expect(def.text(h, d).length).toBeGreaterThan(10);
        const c = choices.findIndex((x) => x.ok);
        if (c >= 0) choices[c].run();
        expect(Object.values(fx.stock).every(Number.isFinite)).toBe(true);
      }
    }
    // lodówka na abonament: rozbita łomem daje jedzenie i złom
    const gov = newGov(30);
    const fx = emptyEffects();
    const h = makeHost(gov, input(), fx);
    const fridge = M1_EVENTS.find((e) => e.id === 'lodowka')!;
    fridge.choices(h, fridge.make(h))[1].run();
    expect(fx.stock.supplies).toBe(4);
    expect(fx.stock.scrap).toBe(2);
  });
});

describe('stan', () => {
  it('ten sam przebieg daje ten sam stan, inne ziarno inny', () => {
    let raids = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const policy of ['losowo', 'nigdy-warty'] as const) {
        const a = run(seed, policy, at(4, 7));
        const b = run(seed, policy, at(4, 7));
        expect(saveGov(b.gov), `${policy} ${seed}`).toBe(saveGov(a.gov));
        raids += a.gov.reports.filter((r) => r.raid !== 'brak').length;
      }
    // porównanie ma sens tylko, jeśli napady naprawdę się zdarzyły
    expect(raids).toBeGreaterThan(3);
    const c = run(12, 'losowo', at(3, 7));
    expect(saveGov(c.gov)).not.toBe(saveGov(run(11, 'losowo', at(3, 7)).gov));
  });

  it('nowe wydarzenie nie przychodzi, kiedy czeka uchwała albo raport', () => {
    const gov = newGov(1);
    const i = input({ day: 1, hour: 16, minute: 0, screen: 500 });
    gov.lawPending = true;
    gov.lawDay = 1;
    govUpdate(gov, i);
    expect(gov.ev.active).toBeNull();
    gov.lawPending = false;
    gov.report = {
      day: 1,
      lines: ['x'],
      raid: 'brak',
      stolen: emptyEffects().stock,
      loot: emptyEffects().stock,
      hurt: [],
      tired: [],
      trust: 50,
      anger: 20,
      dTrust: 0,
      dAnger: 0,
    };
    govUpdate(gov, i);
    expect(gov.ev.active).toBeNull();
    gov.report = null;
    govUpdate(gov, i);
    expect(gov.ev.active).not.toBeNull();
  });

  it('zapis i wczytanie w środku nocy: dalszy przebieg identyczny', () => {
    const mid = run(13, 'zawsze-warta', at(1, 23, 30));
    expect(mid.gov.night?.confirmed).toBe(true);
    const json = saveGov(mid.gov);
    const copy = { gov: loadGov(json), atr: mid.atr.clone() };
    const a = run(13, 'zawsze-warta', at(3, 7), mid);
    const b = run(13, 'zawsze-warta', at(3, 7), copy);
    expect(saveGov(b.gov)).toBe(saveGov(a.gov));
    expect(JSON.parse(json)).toEqual(JSON.parse(saveGov(loadGov(json))));
    expect(() => loadGov(JSON.stringify({ ...JSON.parse(json), v: 99 }))).toThrow();
  });

  it('moduł nie importuje symulacji i nie zna DOM', () => {
    const dir = path.resolve(import.meta.dirname, '../../src/gov');
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from '\.\.\/sim\//);
      expect(src, f).not.toMatch(/\bdocument\b|\bwindow\b/);
    }
  });
});
