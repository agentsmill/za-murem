/* Karty z 0.3, w których ktoś przychodzi pod bramę (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3,
   „Karty z gościem”): `uchodzcy`, `influencer`, `aktywisci`, `dzieci`, `krypto` i w domu `fachowiec`. Wypadnięcie takiej
   karty nie otwiera okna, tylko planuje wizytę (`GovEffects.gosc`, jak dla gościa z klocków), karta czeka na grupę
   w fazie `brama` w tym samym `goscTick`, jej tekst liczy żywych z pionków, a wybory sterują pionkami (`goscRozkaz`) zamiast
   dokładać mieszkańców (`fx.residents`) i osoby (`fx.join`). Bez `GovInput.goscie` (gra bez obcych) karty mają wagę 0, a karta
   bez `gid` w danych (z zapisu sprzed wizyt) gra jak w 0.3. Na końcu dwie gry z prawdziwą symulacją i obcymi. */

import { describe, expect, it } from 'vitest';
import type { Person } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import { placeOf } from '../../src/gov/miejsce.ts';
import type { FazaGoscia, GovEffects, GovGosc, GovInput, GovState, Prompt } from '../../src/gov/typy.ts';
import { osob } from '../../src/gov/warianty.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, confirmNight, govUpdate, loadGov, newGov, pending, saveGov } from '../../src/gov/zarzad.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { Atrapa, at, TPH, TPS } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';

const SZESC = ['uchodzcy', 'influencer', 'aktywisci', 'dzieci', 'krypto', 'fachowiec'] as const;
const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;
const zielonki = placeOf(demoWorld('zielonki').w);
const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

// ---------------------------------------------------------------- pomocnicy

interface Stan {
  gov: GovState;
  i: GovInput;
  atr: Atrapa;
}

/** Zarząd, w którego puli jest tylko karta `id` (reszta „niedawno była”), trzeci dzień, gra z obcymi (lista gości pusta). */
function tylko(
  id: string,
  o: { input?: Partial<GovInput>; seed?: number; mode?: 'zwykly' | 'zombie'; nastroj?: number } = {},
): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.scrap = 6;
  atr.tick = tickAt(3, 10);
  const i: GovInput = {
    ...atr.input(),
    day: 3,
    hour: 10,
    minute: 0,
    screen: 5000,
    kozaLit: true,
    goscie: [],
    napady: [],
    ...o.input,
  };
  for (const e of M1_EVENTS) if (e.id !== id) gov.ev.last[e.id] = gameMin(i);
  gov.ev.next = 0;
  gov.ev.warm = 0;
  return { gov, i, atr };
}

/** wpis wizyty w odczycie symulacji: n żywych pionków (numery 100…), kafelek 1234 */
function wpis(id: string, faza: FazaGoscia, n: number, zywi?: number[]): GovGosc {
  const z = zywi ?? Array.from({ length: n }, (_, k) => k);
  return {
    id,
    faza,
    tile: 1234,
    gdzie: { x: 34, y: 12 },
    pawns: z.map((k) => 100 + k),
    zywi: z,
    ukradl: 0,
  };
}

/** wypadnięcie karty: zarząd wystawia grupę (plan dla symulacji) i nie otwiera okna */
function wystaw(s: Stan): GovEffects {
  const fx = emptyEffects();
  eventTick(s.gov, s.i, fx, false);
  return fx;
}

const wizyta = (s: Stan) => s.gov.goscie!.aktywny!;

/** grupa o danej fazie w odczycie, kolejny tick zarządu (okno otwiera się, jeśli ma) */
function tick(
  s: Stan,
  faza: FazaGoscia,
  o: { zywi?: number[]; zajety?: boolean; input?: Partial<GovInput> } = {},
): void {
  const g = wizyta(s).gosc;
  s.i = {
    ...s.i,
    screen: s.i.screen + 1,
    goscie: [wpis(g.id, faza, g.osoby.length, o.zywi)],
    ...o.input,
  };
  eventTick(s.gov, s.i, emptyEffects(), o.zajety ?? false);
}

/** Pierwsze ziarno (od 1), przy którym wystawiona karta `id` ma dane spełniające `czy`; zarząd po wystawieniu grupy
    (jeszcze bez bramy). Dane karty zależą od losowania, więc testy wybierają ziarno z fachowcem w grupie albo bez niego. */
function zZiarnem(id: string, czy: (d: Record<string, unknown>) => boolean, input: Partial<GovInput> = {}): Stan {
  for (let seed = 1; seed <= 80; seed++) {
    const s = tylko(id, { seed, input });
    if (wystaw(s).gosc && czy(wizyta(s).dane as Record<string, unknown>)) return s;
  }
  throw new Error(`brak ziarna dla karty ${id}`);
}

/** zarząd po wystawieniu grupy, z grupą pod bramą i otwartą kartą */
function podBrama(id: string, o: Parameters<typeof tylko>[1] = {}, zywi?: number[]): Stan {
  const s = tylko(id, o);
  const fx = wystaw(s);
  expect(fx.gosc, `${id}: plan`).toBeTruthy();
  tick(s, 'brama', { zywi });
  expect(s.gov.ev.active?.id, `${id}: karta pod bramą`).toBe(id);
  return s;
}

const widok = (s: Stan) => eventView(s.gov, s.i)!;
const etykiety = (s: Stan): string[] => widok(s).choices.map((c) => c.label.pl);
const rozkazy = (fx: GovEffects): string[] => (fx.goscRozkaz ?? []).map((r) => r.co);

/** wybiera wybór o danym początku napisu; zwraca skutki */
function wybierz(s: Stan, prefix: string): GovEffects {
  const k = etykiety(s).findIndex((l) => l.startsWith(prefix));
  expect(k, `brak wyboru „${prefix}”: ${etykiety(s).join(' | ')}`).toBeGreaterThanOrEqual(0);
  return chooseEvent(s.gov, s.i, k);
}

/** dane karty z `gid` */
const dane = (s: Stan) => s.gov.ev.active!.d as Record<string, unknown> & { gid: string };

// ---------------------------------------------------------------- uchodźcy

describe('uchodzcy: grupa naprawdę pod bramą', () => {
  it('plan n osób, karta dopiero przy fazie brama, tekst z liczbą n równą liczbie pionków', () => {
    const s = tylko('uchodzcy', { input: { cap: 40, residents: 2 } });
    const fx = wystaw(s);
    const plan = fx.gosc!;
    // plan dla symulacji: 4–12 osób w bloku, id g1p<k>, wygląd każdej, strona
    expect(plan.id).toBe('g1');
    expect(plan.osoby.length).toBeGreaterThanOrEqual(4);
    expect(plan.osoby.length).toBeLessThanOrEqual(12);
    for (const [k, p] of plan.osoby.entries()) expect(p.id).toBe(`g1p${k}`);
    expect(new Set(plan.looks).size).toBe(plan.looks.length);
    expect(['n', 'e', 's', 'w']).toContain(plan.strona);
    // wizyta zajęła miejsce karty: żadnego okna, wpis w stanie zarządu, ewidencja powtórek
    const n = plan.osoby.length;
    expect(s.gov.ev.active).toBeNull();
    expect(pending(s.gov, s.i)).toBeNull();
    expect(wizyta(s)).toMatchObject({ kartaId: 'uchodzcy', karta: false });
    expect((wizyta(s).dane as { n: number }).n).toBe(n);
    expect(s.gov.ev.done.uchodzcy).toBe(true);
    expect(s.gov.ev.last.uchodzcy).toBe(gameMin(s.i));
    // grupa idzie: okna nie ma, mimo kolejnych sekund
    for (let k = 0; k < 5; k++) {
      tick(s, 'idzie');
      expect(s.gov.ev.active).toBeNull();
    }
    // stoi pod bramą, ale zarząd zajęty: karta czeka (flaga karty dopiero przy pokazaniu)
    tick(s, 'brama', { zajety: true });
    expect(s.gov.ev.active).toBeNull();
    expect(wizyta(s).karta).toBe(false);
    // wolny zarząd: karta, z danymi i id wizyty
    tick(s, 'brama');
    expect(s.gov.ev.active?.id).toBe('uchodzcy');
    expect(dane(s).gid).toBe('g1');
    expect(dane(s).n).toBe(n);
    expect(wizyta(s).karta).toBe(true);
    // tekst liczy pionki; „Pokaż” jedzie do grupy
    const v = widok(s);
    expect(v.text.pl).toContain(`${n} ${osob(n)}`);
    expect(v.gdzie).toEqual({ x: 34, y: 12 });
    expect(v.choices.every((c) => c.ok)).toBe(true);
    // wpis w kronice o karcie niesie to samo miejsce
    expect(s.gov.log.at(-1)?.gdzie).toEqual({ x: 34, y: 12 });
  });

  it('karta liczy żywych: zginął jeden pionek, w tekście n−1 osób i miejsca na podłodze według n−1', () => {
    const s = tylko('uchodzcy', { input: { cap: 6, residents: 2 } });
    const n = wystaw(s).gosc!.osoby.length;
    const zywi = Array.from({ length: n }, (_, k) => k).slice(1);
    tick(s, 'brama', { zywi });
    expect(s.gov.ev.active?.id).toBe('uchodzcy');
    const text = widok(s).text.pl;
    expect(text).toContain(`${n - 1} ${osob(n - 1)}`);
    // wolne miejsca to 4: przy n−1 większym niż 4 na podłodze kładzie się resztę
    const etyk = etykiety(s);
    if (n - 1 > 4)
      expect(etyk).toContain(
        `Przyjąć wszystkich (${n - 1 - 4} ${osob(n - 1 - 4) === 'osoby' ? 'osoby będą' : osob(n - 1 - 4) === 'osoba' ? 'osoba będzie' : 'osób będzie'} spać na podłodze)`,
      );
    else expect(etyk[0]).toBe('Przyjąć wszystkich');
  });

  it('Przyjąć wszystkich to goscRozkaz zostan dla tej grupy, bez fx.residents i bez fx.join', () => {
    const s = zZiarnem('uchodzcy', (d) => !d.spec, { cap: 40, residents: 2 });
    tick(s, 'brama');
    const trust = s.gov.trust;
    const fx = wybierz(s, 'Przyjąć wszystkich');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'zostan' }]);
    expect(fx.residents).toBe(0);
    expect(fx.join).toEqual([]);
    expect(s.gov.trust).toBe(trust + 1);
    expect(s.gov.ev.active).toBeNull();
    expect(wizyta(s).koniec).toBe(true);
    const n = (wizyta(s).dane as { n: number }).n;
    expect(s.gov.log.some((l) => l.txt.pl.startsWith(`Przyjęliście ${n} `))).toBe(true);
  });

  it('z fachowcem w grupie: mówiący idzie do zarządu (zarzad), reszta zostaje, nikt nie dochodzi z powietrza', () => {
    const st = zZiarnem('uchodzcy', (d) => !!d.spec, { cap: 40, residents: 2 });
    const spec = (wizyta(st).dane as { spec: Person }).spec;
    // mówiący w grupie to ten fachowiec: to samo imię, ten sam zawód
    expect(wizyta(st).gosc.osoby[0]).toMatchObject({ name: spec.name, prof: spec.prof });
    tick(st, 'brama');
    expect(widok(st).text.pl).toContain(`Wśród nich jest ${spec.prof.toLowerCase()}, ${spec.name}.`);
    const fx = wybierz(st, 'Przyjąć wszystkich');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'zarzad' }]);
    expect(fx.residents).toBe(0);
    expect(fx.join).toEqual([]);
  });

  it('bez miejsca: „Przyjąć wszystkich” kładzie ludzi na podłodze (wkurzenie +2), nie ma „tylu, ilu się zmieści”', () => {
    const s = zZiarnem('uchodzcy', (d) => !d.spec, { cap: 4, residents: 4 });
    tick(s, 'brama');
    const n = (dane(s) as unknown as { n: number }).n;
    expect(etykiety(s)).toEqual([
      'Dać Jedzenie 3 na drogę',
      `Przyjąć wszystkich (${n} ${osob(n) === 'osoby' ? 'osoby będą' : 'osób będzie'} spać na podłodze)`,
      'Odprawić',
    ]);
    const anger = s.gov.anger;
    const fx = wybierz(s, 'Przyjąć wszystkich');
    expect(rozkazy(fx)).toEqual(['zostan']);
    expect(s.gov.anger).toBe(anger + 2);
    expect(s.gov.log.some((l) => /spać na podłodze/.test(l.txt.pl))).toBe(true);
  });

  it('Dać Jedzenie 3 na drogę to rozkaz jedzenie i Jedzenie −3; Odprawić to odejdz', () => {
    const a = podBrama('uchodzcy', { input: { cap: 40, residents: 2 } });
    const fa = wybierz(a, 'Dać Jedzenie 3');
    expect(rozkazy(fa)).toEqual(['jedzenie']);
    expect(fa.stock.supplies).toBe(-3);
    expect(fa.residents).toBe(0);
    const b = podBrama('uchodzcy', { input: { cap: 40, residents: 2 } });
    const trust = b.gov.trust;
    const fb = wybierz(b, 'Odprawić');
    expect(rozkazy(fb)).toEqual(['odejdz']);
    expect(b.gov.trust).toBe(trust - 2);
    expect(fb.stock.supplies).toBe(0);
  });

  it('w domu rodzina 2–4 osób z jednym nazwiskiem, pod furtką', () => {
    const w = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = tylko('uchodzcy', { seed, input: { place: zielonki, cap: 0, residents: 0 } });
      const plan = wystaw(s).gosc!;
      w.add(plan.osoby.length);
      expect(plan.osoby.length).toBeGreaterThanOrEqual(2);
      expect(plan.osoby.length).toBeLessThanOrEqual(4);
      tick(s, 'brama');
      expect(widok(s).text.pl).toContain(`Pod furtką stoi rodzina, ${plan.osoby.length} ${osob(plan.osoby.length)}`);
      const spec = (wizyta(s).dane as { spec: Person | null }).spec;
      // rodzina (mówiący 28+) ma wspólne nazwisko; z młodym fachowcem to zwykli dorośli
      if (!spec || spec.age >= 28) {
        const nazwisko = (p: Person) =>
          p.name
            .slice(p.first.length + 1)
            .replace(/a$/, '')
            .replace(/ska$/, 'ski');
        expect(new Set(plan.osoby.map((p) => nazwisko(p).slice(0, 3))).size, plan.osoby.map((p) => p.name).join()).toBe(
          1,
        );
      }
    }
    expect(w.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------- influencerka

describe('influencer: ta sama osoba na karcie i pod bramą', () => {
  it('Przyjąć to zarzad dla tej osoby, imię w karcie równe imieniu pionka', () => {
    const s = tylko('influencer');
    const plan = wystaw(s).gosc!;
    expect(plan.osoby).toHaveLength(1);
    const d = wizyta(s).dane as { p: Person };
    // osoba z danych karty to osoba pod bramą (id inne, reszta ta sama)
    expect(plan.osoby[0]).toMatchObject({ name: d.p.name, first: d.p.first, prof: d.p.prof, f: true });
    expect(plan.osoby[0].id).toBe('g1p0');
    tick(s, 'brama');
    expect(s.gov.ev.active?.id).toBe('influencer');
    expect(widok(s).text.pl).toContain(plan.osoby[0].name);
    expect(widok(s).text.pl).toContain(d.p.name);
    const fx = wybierz(s, 'Przyjąć do spółdzielni');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'zarzad' }]);
    expect(fx.join).toEqual([]);
    expect(fx.residents).toBe(0);
  });

  it('Niech nagrywa gdzie indziej to odejdz; influencerka przychodzi tylko raz, a zginęła po drodze: wraca do puli', () => {
    const s = podBrama('influencer');
    expect(rozkazy(wybierz(s, 'Niech nagrywa'))).toEqual(['odejdz']);
    // zginęła, zanim ktokolwiek ją zobaczył: karta once nie przepadła
    const t = tylko('influencer');
    wystaw(t);
    expect(t.gov.ev.done.influencer).toBe(true);
    tick(t, 'zginal');
    expect(t.gov.goscie!.aktywny).toBeUndefined();
    expect(t.gov.ev.done.influencer).toBeUndefined();
    expect(t.gov.log.at(-1)?.txt.pl).toContain('nie dotarł');
  });

  it('w domu przyjmuje się ją do domu', () => {
    const s = podBrama('influencer', { input: { place: zielonki } });
    expect(etykiety(s)).toEqual(['Przyjąć do domu', 'Niech nagrywa gdzie indziej']);
    expect(rozkazy(wybierz(s, 'Przyjąć do domu'))).toEqual(['zarzad']);
  });
});

// ---------------------------------------------------------------- aktywiści

describe('aktywisci: czterech pod bramą, grzeją się do rana', () => {
  it('Zaprosić do ciepła: noc, rano odchodzą', () => {
    const s = tylko('aktywisci');
    const plan = wystaw(s).gosc!;
    expect(plan.osoby).toHaveLength(4);
    tick(s, 'brama');
    expect(s.gov.ev.active?.id).toBe('aktywisci');
    const trust = s.gov.trust;
    const fx = wybierz(s, 'Zaprosić do ciepła');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'noc' }]);
    expect(fx.residents).toBe(0);
    expect(fx.join).toEqual([]);
    expect(s.gov.trust).toBe(trust + 1);
    // wizyta trwa do rana: zarząd ją śledzi
    expect(wizyta(s)).toMatchObject({ noc: true });
    expect(wizyta(s).koniec).toBeUndefined();
    // o 5:00 w raporcie noc spędzona z gośćmi, rano wychodzą, wizyta się kończy
    s.i = { ...s.i, day: 4, hour: 5, minute: 10, screen: s.i.screen + 100, goscie: [wpis('g1', 'w_srodku', 4)] };
    eventTick(s.gov, s.i, emptyEffects(), false);
    expect(s.gov.later.some((l) => l.line.pl.startsWith('Noc u was spędzili goście:'))).toBe(true);
    s.i = { ...s.i, hour: 7, goscie: [wpis('g1', 'odchodzi', 4)] };
    eventTick(s.gov, s.i, emptyEffects(), false);
    s.i = { ...s.i, hour: 8, goscie: [wpis('g1', 'poszedl', 0)] };
    eventTick(s.gov, s.i, emptyEffects(), false);
    expect(s.gov.goscie!.aktywny).toBeUndefined();
    expect(s.gov.log.some((l) => l.txt.pl.startsWith('Aktywiści weszli do ciepła'))).toBe(true);
  });

  it('brama na kłódkę po 20:00 odbiera „Zaprosić do ciepła”; Umówić się na sadzenie to odejdz', () => {
    const s = podBrama('aktywisci');
    s.gov.laws.signed.u_brama = true;
    s.i = { ...s.i, hour: 21 };
    const k = etykiety(s).indexOf('Zaprosić do ciepła');
    expect(widok(s).choices[k].ok).toBe(false);
    expect(chooseEvent(s.gov, s.i, k).goscRozkaz).toBeUndefined();
    expect(s.gov.ev.active?.id).toBe('aktywisci');
    s.i = { ...s.i, hour: 12 };
    const fx = wybierz(s, 'Umówić się na wspólne sadzenie');
    expect(rozkazy(fx)).toEqual(['odejdz']);
  });
});

// ---------------------------------------------------------------- dzieciaki i sąsiad od tokenów

describe('dzieci i krypto: po decyzji odchodzą', () => {
  it('dzieci: 2–3 dzieciaki w wieku 9–15, najstarsze mówi; wymiana i odmowa to odejdz', () => {
    const wiele = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = tylko('dzieci', { seed });
      const plan = wystaw(s).gosc!;
      wiele.add(plan.osoby.length);
      expect(plan.osoby.length).toBeGreaterThanOrEqual(2);
      expect(plan.osoby.length).toBeLessThanOrEqual(3);
      for (const p of plan.osoby) {
        expect(p.age).toBeGreaterThanOrEqual(9);
        expect(p.age).toBeLessThanOrEqual(15);
        expect(p.prof).toBe('dziecko');
        expect(p.traits).toEqual([]);
      }
      expect(plan.osoby[0].age).toBe(Math.max(...plan.osoby.map((p) => p.age)));
    }
    expect([...wiele].sort()).toEqual([2, 3]);
    const a = podBrama('dzieci');
    const fa = wybierz(a, 'Złom 6 za Jedzenie 1');
    expect(rozkazy(fa)).toEqual(['odejdz']);
    expect(fa.stock.supplies).toBe(-1);
    expect(fa.stock.scrap).toBe(6);
    expect(fa.residents).toBe(0);
    expect(a.gov.goscie!.aktywny!.koniec).toBe(true);
    const b = podBrama('dzieci');
    expect(rozkazy(wybierz(b, 'Nie teraz'))).toEqual(['odejdz']);
  });

  it('krypto: sąsiad sam pod bramą; tokeny za Drewno 5 albo śmiech, potem odchodzi', () => {
    const a = tylko('krypto');
    const plan = wystaw(a).gosc!;
    expect(plan.osoby).toHaveLength(1);
    expect(plan.osoby[0].age).toBeGreaterThanOrEqual(22);
    tick(a, 'brama');
    expect(a.gov.ev.active?.id).toBe('krypto');
    const fa = wybierz(a, 'Przyjąć tokeny');
    expect(rozkazy(fa)).toEqual(['odejdz']);
    expect(fa.stock.wood).toBe(-5);
    const b = podBrama('krypto');
    const fb = wybierz(b, 'Wyśmiać');
    expect(rozkazy(fb)).toEqual(['odejdz']);
    expect(b.gov.anger).toBeLessThanOrEqual(newGov(3).anger);
  });

  it('bez drewna „Przyjąć tokeny” jest niedostępne; wybór poza bramą też', () => {
    const s = podBrama('krypto', {
      input: { stock: { wood: 2, woodSklad: 2, woodLoose: 0, supplies: 30, scrap: 6, parts: 0, meds: 3 } },
    });
    expect(widok(s).choices[0].ok).toBe(false);
    // grupa odeszła sprzed bramy w tej samej sekundzie (karta jeszcze nie zdążyła się zamknąć): nic nie wolno
    const t = podBrama('krypto');
    t.i = { ...t.i, goscie: [wpis('g1', 'odchodzi', 1)] };
    expect(widok(t).choices.every((c) => !c.ok)).toBe(true);
    expect(chooseEvent(t.gov, t.i, 1).goscRozkaz).toBeUndefined();
  });
});

// ---------------------------------------------------------------- fachowiec w domu

describe('fachowiec w domu: sąsiad podchodzi do furtki', () => {
  const dom = { place: zielonki, residents: 0, hour: 20 } as const;

  it('plan jednej osoby, imię z karty, karta pod furtką; Wciągnąć do roboty to zarzad', () => {
    const s = tylko('fachowiec', { input: dom });
    const plan = wystaw(s).gosc!;
    expect(plan.osoby).toHaveLength(1);
    const d = wizyta(s).dane as { p: Person };
    expect(plan.osoby[0]).toMatchObject({ name: d.p.name, prof: d.p.prof, skills: d.p.skills });
    expect(plan.osoby[0].home).toBe(-1);
    expect(s.gov.ev.active).toBeNull();
    tick(s, 'brama', { input: dom });
    expect(s.gov.ev.active?.id).toBe('fachowiec');
    expect(widok(s).text.pl).toContain(d.p.name);
    const fx = wybierz(s, 'Wciągnąć do roboty');
    expect(fx.goscRozkaz).toEqual([{ id: 'g1', co: 'zarzad' }]);
    expect(fx.join).toEqual([]);
    expect(fx.residents).toBe(0);
  });

  it('Niech odpoczywa: sąsiad wraca do siebie (odejdz)', () => {
    const s = podBrama('fachowiec', { input: dom });
    expect(rozkazy(wybierz(s, 'Niech odpoczywa'))).toEqual(['odejdz']);
  });

  it('w bloku bez zmian: bez planu, karta od razu, mieszkańcy po staremu', () => {
    const s = tylko('fachowiec', { input: { residents: 4, hour: 20 } });
    const fx = wystaw(s);
    expect(fx.gosc).toBeUndefined();
    expect(s.gov.goscie).toBeUndefined();
    expect(s.gov.ev.active?.id).toBe('fachowiec');
    expect('gid' in (s.gov.ev.active!.d as object)).toBe(false);
    const fb = wybierz(s, 'Wciągnąć do roboty');
    expect(fb.join).toHaveLength(1);
    expect(fb.goscRozkaz).toBeUndefined();
  });
});

// ---------------------------------------------------------------- waga

describe('waga kart z gościem', () => {
  const miejsce = (id: string) => (id === 'fachowiec' ? { place: zielonki, residents: 0, hour: 20 } : {});

  it('bez GovInput.goscie waga 0 dla wszystkich sześciu; z obcymi dodatnia; przy wizycie w toku znów 0', () => {
    for (const id of SZESC) {
      const s = tylko(id, { input: miejsce(id) });
      const bez: GovInput = { ...s.i };
      delete (bez as { goscie?: unknown }).goscie;
      expect(def(id).w(makeHost(s.gov, bez, emptyEffects())), `${id} bez obcych`).toBe(0);
      expect(def(id).w(makeHost(s.gov, s.i, emptyEffects())), `${id} z obcymi`).toBeGreaterThan(0);
      // wizyta w toku (jeden gość naraz)
      wystaw(s);
      expect(def(id).w(makeHost(s.gov, s.i, emptyEffects())), `${id} przy wizycie`).toBe(0);
    }
  });

  it('wszystkie sześć ma GEventDef.gosc (fachowiec tylko w domu), pozostałe karty z 0.3 go nie mają', () => {
    const z = M1_EVENTS.filter((e) => e.gosc).map((e) => e.id);
    expect(z.sort()).toEqual([...SZESC].sort());
    const blok = tylko('fachowiec', { input: { residents: 4 } });
    expect(def('fachowiec').gosc!(makeHost(blok.gov, blok.i, emptyEffects()), { p: {}, b: 'x' })).toBeNull();
  });

  it('karta z gościem nie wypada w trybie zombie tam, gdzie jest tylko zwykła (tryby bez zmian)', () => {
    for (const id of ['uchodzcy', 'influencer', 'aktywisci', 'krypto']) expect(def(id).tryby, id).toEqual(['zwykly']);
  });
});

// ---------------------------------------------------------------- wspólna droga z kartą gościa

describe('karta z gościem czeka i zamyka się jak karta gosc', () => {
  it('grupa odeszła sprzed bramy przy otwartej karcie: karta się zamyka, wpis w kronice, wizyta kończy się', () => {
    const s = podBrama('dzieci');
    tick(s, 'odchodzi');
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.log.at(-1)?.txt.pl).toContain('zanim ktokolwiek zdecydował');
    tick(s, 'poszedl', { zywi: [] });
    expect(s.gov.goscie!.aktywny).toBeUndefined();
    // zginęli: tak samo
    const t = podBrama('uchodzcy', { input: { cap: 40, residents: 2 } });
    tick(t, 'zginal', { zywi: [] });
    expect(t.gov.ev.active).toBeNull();
    expect(t.gov.log.at(-1)?.txt.pl).toContain('nie żyją');
  });

  it('plan przepadł bez karty (nie doszli): wpis o tym, że ktoś szedł, bez imion', () => {
    const s = tylko('aktywisci');
    wystaw(s);
    tick(s, 'nie_doszedl', { zywi: [] });
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.goscie!.aktywny).toBeUndefined();
    expect(s.gov.log.at(-1)?.txt.pl).toMatch(/Ktoś szedł do (bramy|furtki)/);
  });

  it('jedna wizyta naraz: pod bramą stoją uchodźcy, więc dzieciaki nie wypadają, póki ich nie ma', () => {
    const s = tylko('uchodzcy');
    wystaw(s);
    const dzieci = def('dzieci');
    expect(dzieci.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(0);
    // po decyzji (rozkaz kończący) zarząd znów może wystawić kogoś
    tick(s, 'brama');
    wybierz(s, 'Odprawić');
    tick(s, 'odchodzi');
    expect(s.gov.goscie!.aktywny).toBeUndefined();
    expect(dzieci.w(makeHost(s.gov, s.i, emptyEffects()))).toBeGreaterThan(0);
  });

  it('wizyta wystawiona przez kartę nie zjada odstępu drugiej karty: plan zajmuje miejsce karty, kolejnej nie losuje', () => {
    const s = tylko('uchodzcy');
    // w puli jest też dzieci: po planie uchodźców nie wypada od razu druga karta
    delete s.gov.ev.last.dzieci;
    const fx = wystaw(s);
    expect(fx.gosc).toBeTruthy();
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.ev.next).toBeGreaterThan(s.i.screen);
  });

  it('karta pod bramą dostaje się do kroniki z tytułem; zapis i wczytanie z otwartą kartą niczego nie gubi', () => {
    const s = podBrama('uchodzcy', { input: { cap: 40, residents: 2 } });
    const przed = widok(s);
    const w = loadGov(saveGov(s.gov));
    expect(JSON.stringify(eventView(w, s.i))).toBe(JSON.stringify(przed));
    const a = chooseEvent(s.gov, s.i, 0);
    const b = chooseEvent(w, s.i, 0);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(saveGov(w)).toBe(saveGov(s.gov));
  });
});

// ---------------------------------------------------------------- zgodność z 0.3

describe('karta bez wizyty gra jak w 0.3', () => {
  it('uchodzcy z zapisu sprzed wizyt: dane bez gid, przyjęcie dokłada mieszkańców jak dotąd', () => {
    const s = tylko('uchodzcy', { input: { cap: 8, residents: 5 } });
    s.gov.ev.active = { id: 'uchodzcy', d: { n: 7, from: 'z Wilanowa', spec: null } };
    expect(etykiety(s)).toEqual([
      'Przyjąć tylu, ilu się zmieści (3)',
      'Dać Jedzenie 3 na drogę',
      'Przyjąć wszystkich (4 osoby będą spać na podłodze)',
      'Odprawić',
    ]);
    expect(widok(s).text.pl).toContain('7 osób');
    const fx = chooseEvent(s.gov, s.i, 0);
    expect(fx.residents).toBe(3);
    expect(fx.goscRozkaz).toBeUndefined();
    // karta bez gid nie jest kartą wizyty: tick wizyt jej nie rusza
    s.gov.ev.active = { id: 'influencer', d: { p: { name: 'Ola Nowak', f: true } } };
    eventTick(s.gov, { ...s.i, screen: s.i.screen + 1 }, emptyEffects(), false);
    expect(s.gov.ev.active?.id).toBe('influencer');
  });

  it('pozostałe pięć kart bez gid: skutki z nakładki 0.3 (joinPerson, residents, bez rozkazów)', () => {
    const inf = tylko('influencer');
    const d = def('influencer').make(makeHost(inf.gov, inf.i, emptyEffects()));
    inf.gov.ev.active = { id: 'influencer', d };
    const fi = chooseEvent(inf.gov, inf.i, 0);
    expect(fi.join).toHaveLength(1);
    expect(fi.goscRozkaz).toBeUndefined();
    const akt = tylko('aktywisci');
    akt.gov.ev.active = { id: 'aktywisci', d: {} };
    const fa = chooseEvent(akt.gov, akt.i, 0);
    expect(fa.residents).toBe(0);
    expect(fa.goscRozkaz).toBeUndefined();
    for (const id of ['dzieci', 'krypto']) {
      const s = tylko(id);
      s.gov.ev.active = { id, d: {} };
      expect(chooseEvent(s.gov, s.i, 1).goscRozkaz, id).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------- angielski

describe('angielski: karty z gościem bez polskich słów', () => {
  const miejsca = [
    ['blok', {}],
    ['dom', { place: zielonki, residents: 0 }],
  ] as const;

  it('tytuł, tekst, napisy wyborów i wpisy do kroniki po angielsku, tyle napisów, ile wyborów', () => {
    let kart = 0;
    for (const [nazwa, miejsce] of miejsca)
      for (const id of SZESC) {
        for (let seed = 1; seed <= 14; seed++) {
          // fachowiec: wieczorem; reszta: za dnia
          const input = {
            ...miejsce,
            hour: id === 'fachowiec' ? 20 : 10,
            cap: seed % 2 ? 40 : 4,
            residents: seed % 2 ? 2 : 4,
          };
          const s = tylko(id, { seed, input });
          if (!wystaw(s).gosc) continue;
          tick(s, 'brama', { input });
          if (s.gov.ev.active?.id !== id) continue;
          kart++;
          const ludzie = wizyta(s).gosc.osoby;
          const ok = [...ludzie.flatMap((p) => [p.name, p.first]), 'Atrapia 7', 'Wilanów'];
          const v = widok(s);
          const where = `${id}, ${nazwa}, ziarno ${seed}`;
          for (const t of [v.title.en, v.text.en, ...v.choices.map((c) => c.label.en)]) {
            expect(t, where).toBeTruthy();
            expect(polskieSlowa(t, ok), `${where}: ${t}`).toEqual([]);
          }
          // napisy po angielsku to nie polski zapas (rozjazd liczby napisów wraca do polskich)
          v.choices.forEach((c, k) => {
            expect(c.label.en, `${where}: wybór ${k}`).not.toBe(c.label.pl);
          });
          // każdy dostępny wybór: wpisy do kroniki po angielsku
          v.choices.forEach((c, k) => {
            if (!c.ok) return;
            const kopia = structuredClone(s.gov);
            const n0 = kopia.log.length;
            chooseEvent(kopia, s.i, k);
            for (const wpis of kopia.log.slice(n0)) {
              expect(polskieSlowa(wpis.txt.en, ok), `${where}, wybór ${k}: ${wpis.txt.pl}`).toEqual([]);
              expect(wpis.txt.en, `${where}, wybór ${k}`).toBeTruthy();
            }
          });
        }
      }
    // karty naprawdę się pojawiły (nie wszystkie ziarna/miejsca pasują)
    expect(kart).toBeGreaterThan(60);
  });

  it('uchodzcy po angielsku: liczba ludzi z grupy pod bramą, etykiety bez „as many as fit”', () => {
    const s = tylko('uchodzcy', { input: { cap: 6, residents: 2 } });
    const n = wystaw(s).gosc!.osoby.length;
    tick(s, 'brama', { zywi: Array.from({ length: n }, (_, k) => k).slice(1) });
    const v = widok(s);
    expect(v.text.en).toContain(`${n - 1} ${n - 1 === 1 ? 'person' : 'people'}`);
    expect(v.choices.map((c) => c.label.en).some((l) => /as many as fit/.test(l))).toBe(false);
    expect(v.choices.at(-1)?.label.en).toBe('Send them away');
  });
});

// ---------------------------------------------------------------- prawdziwa symulacja

/** Gra z prawdziwą symulacją i obcymi, w której z puli zarządu zostaje tylko karta `id`; inne okna odpowiadane pierwszym
    dostępnym wyborem. Staje na oknie karty `id` (po `maxDni` dobach: porażka) i oddaje stan gry z oknem otwartym. */
function doKarty(demo: 'przymorze' | 'zielonki', id: string, seed: number, maxDni = 6) {
  const { w } = demoWorld(demo);
  const st = createSim(w, seed, { core: 4, obcy: true });
  const sim = new Sim(w, st);
  const gov = newGov(seed);
  for (const e of M1_EVENTS) if (e.id !== id) gov.ev.last[e.id] = 1e9;
  while (st.tick < maxDni * 24 * TPH) {
    sim.step();
    if (st.tick % TPS) continue;
    const sek = st.tick / TPS;
    applyGov(st, w, govUpdate(gov, govInput(st, w, sek)));
    for (let k = 0; k < 6; k++) {
      const i = govInput(st, w, sek);
      const p: Prompt | null = pending(gov, i);
      if (!p) break;
      if (p.k === 'wydarzenie') {
        if (p.id === id) return { w, st, sim, gov, p, sek };
        const ok = p.choices.findIndex((c) => c.ok);
        applyGov(st, w, chooseEvent(gov, i, ok));
      } else if (p.k === 'karta') applyGov(st, w, confirmNight(gov, i));
      else if (p.k === 'raport') gov.report = null;
      else if (p.k === 'uchwala') gov.lawPending = false;
      else break;
    }
  }
  throw new Error(`przez ${maxDni} dób nie wypadła karta „${id}”`);
}

describe('prawdziwa symulacja', () => {
  it('uchodźcy: pionki gości stoją pod bramą w chwili karty, tylu, ilu w tekście; po „Przyjąć wszystkich” zostają mieszkańcami', () => {
    const g = doKarty('przymorze', 'uchodzcy', 7);
    const { st, sim, gov, w } = g;
    const a = gov.goscie!.aktywny!;
    const wpisSim = st.goscie!.find((x) => x.id === a.gosc.id)!;
    expect(wpisSim.faza).toBe('brama');
    const pionki = st.pawns.filter((p) => p.kind === 'gosc' && wpisSim.pawns.includes(p.id));
    expect(pionki.length).toBe(wpisSim.pawns.length);
    expect(pionki.length).toBeGreaterThanOrEqual(4);
    const n = pionki.length;
    expect(g.p.text.pl).toContain(`${n} ${osob(n)}`);
    expect(g.p.gdzie).toEqual(govInput(st, w, g.sek).goscie!.find((x) => x.id === a.gosc.id)!.gdzie);
    // imiona w pionkach to imiona z planu
    expect(pionki.map((p) => st.people[p.person].name)).toEqual(a.gosc.osoby.map((p) => p.name));
    // „Przyjąć wszystkich” (albo „… na podłodze”): rozkaz zostan lub zarzad, żadnych nowych mieszkańców z powietrza
    const i = govInput(st, w, g.sek);
    const k = g.p.choices.findIndex((c) => c.label.pl.startsWith('Przyjąć wszystkich'));
    const fx = chooseEvent(gov, i, k);
    expect(fx.residents).toBe(0);
    expect(fx.join).toEqual([]);
    expect(['zostan', 'zarzad']).toContain(rozkazy(fx)[0]);
    applyGov(st, w, fx);
    for (let t = 0; t < 4000; t++) sim.step();
    const po = pionki.map((p) => st.pawns.find((q) => q.id === p.id)!);
    expect(po.every((p) => p.kind === 'resident' || p.kind === 'core')).toBe(true);
    expect(po.filter((p) => p.kind === 'core').length).toBe(rozkazy(fx)[0] === 'zarzad' ? 1 : 0);
  }, 120_000);

  it('fachowiec w domu: sąsiad dochodzi do furtki, po „Wciągnąć do roboty” jest osobą zarządu', () => {
    const g = doKarty('zielonki', 'fachowiec', 4);
    const { st, sim, gov, w } = g;
    const a = gov.goscie!.aktywny!;
    const wpisSim = st.goscie!.find((x) => x.id === a.gosc.id)!;
    expect(wpisSim.faza).toBe('brama');
    expect(wpisSim.pawns).toHaveLength(1);
    const pion = st.pawns.find((p) => p.id === wpisSim.pawns[0])!;
    expect(pion.kind).toBe('gosc');
    expect(st.people[pion.person].name).toBe((g.p.text.pl.match(new RegExp(a.gosc.osoby[0].name)) ?? [''])[0]);
    const core0 = st.pawns.filter((p) => p.kind === 'core').length;
    const i = govInput(st, w, g.sek);
    const fx = chooseEvent(
      gov,
      i,
      g.p.choices.findIndex((c) => c.label.pl.startsWith('Wciągnąć')),
    );
    expect(rozkazy(fx)).toEqual(['zarzad']);
    applyGov(st, w, fx);
    for (let t = 0; t < 4000; t++) sim.step();
    expect(st.pawns.find((p) => p.id === pion.id)!.kind).toBe('core');
    expect(st.pawns.filter((p) => p.kind === 'core').length).toBe(core0 + 1);
  }, 120_000);
});

describe('spis gier z obcymi: karty z gościem w pełnej puli', () => {
  it('w grach po 6 dób każda karta z gościem ma pionki pod bramą w chwili pokazania, a jej wybory nie dokładają ludzi z powietrza', () => {
    const razem = { karty: 0, bezPionkow: 0, residents: 0, join: 0, rozkazy: 0 };
    const widziane: Record<string, number> = {};
    const gry = [
      ['przymorze', 31],
      ['przymorze', 32],
      ['zielonki', 33],
      ['zielonki', 34],
    ] as const;
    for (const [demo, seed] of gry) {
      const { w } = demoWorld(demo);
      const st = createSim(w, seed, { core: 4, obcy: true });
      const sim = new Sim(w, st);
      const gov = newGov(seed);
      const r = mulberry(seed ^ 0x77);
      while (st.tick < 6 * 24 * TPH) {
        sim.step();
        if (st.tick % TPS) continue;
        const sek = st.tick / TPS;
        applyGov(st, w, govUpdate(gov, govInput(st, w, sek)));
        for (let k = 0; k < 6; k++) {
          const i = govInput(st, w, sek);
          const p: Prompt | null = pending(gov, i);
          if (!p) break;
          if (p.k === 'wydarzenie') {
            const ok = p.choices.map((c, j) => [c, j] as const).filter(([c]) => c.ok);
            const j = ok[Math.floor(r() * ok.length)][1];
            const ev = gov.ev.active!;
            const zGidem =
              (SZESC as readonly string[]).includes(p.id) && typeof (ev.d as { gid?: string })?.gid === 'string';
            if (zGidem) {
              razem.karty++;
              widziane[p.id] = (widziane[p.id] ?? 0) + 1;
              const wpisSim = st.goscie!.find((x) => x.id === (ev.d as { gid: string }).gid)!;
              const pionki = st.pawns.filter((q) => q.kind === 'gosc' && wpisSim.pawns.includes(q.id));
              expect(wpisSim.faza, `${demo} ${seed}: ${p.id}`).toBe('brama');
              if (pionki.length === 0) razem.bezPionkow++;
              expect(pionki.length).toBe(wpisSim.pawns.length);
              if (p.id === 'uchodzcy') expect(p.text.pl).toContain(`${pionki.length} ${osob(pionki.length)}`);
              const fx = chooseEvent(gov, i, j);
              razem.residents += fx.residents;
              razem.join += fx.join.length;
              razem.rozkazy += fx.goscRozkaz?.length ?? 0;
              applyGov(st, w, fx);
              continue;
            }
            applyGov(st, w, chooseEvent(gov, i, j));
          } else if (p.k === 'karta') applyGov(st, w, confirmNight(gov, i));
          else if (p.k === 'raport') gov.report = null;
          else if (p.k === 'uchwala') gov.lawPending = false;
          else break;
        }
      }
    }
    console.info(`spis kart z gościem: ${JSON.stringify(widziane)}, razem ${razem.karty}`);
    expect(razem.karty).toBeGreaterThanOrEqual(6);
    expect(razem.bezPionkow).toBe(0);
    expect(razem.residents).toBe(0);
    expect(razem.join).toBe(0);
    expect(razem.rozkazy).toBeGreaterThanOrEqual(razem.karty);
  }, 300_000);
});
