/* Gracz-bot z badaniami (tests/unit/m2-play.ts, opcja `badania`, npm run bot -- --badania; docs/superpowers/specs/
   2026-10-19-badania-design.md, „Testy i bramka”) oraz wartości tempa badań z jego pomiaru. Gra z zarządem na Przymorzu
   przez kilka dni: pracownia staje na początku kolejki, bot wybiera najtańszą kartkę i sadza przy stole osobę zarządu,
   zbadana technologia odblokowuje budowlę, którą bot stawia; bez opcji bot nie dotyka badań (stan bez pól badań).
   Wartości TEMPO_BAZOWE i KOSZT_ERY przypięte niżej pochodzą z pomiaru tools/bot-badania.ts (raport zadania 11). */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { KOSZT_ERY, kosztTech, TECH_BY, TEMPO_BAZOWE, tempoOsoby } from '../../src/sim/badania.ts';
import { BUILDS } from '../../src/sim/budowle.ts';
import { dayOf, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { buildWorld } from '../../src/world/world.ts';
import { playWithGov } from './gov-play.ts';
import { m2Player } from './m2-play.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

const DNI = 9;
const gra = (badania: boolean) => {
  const m2 = m2Player({ search: true, furniture: true, badania });
  const r = playWithGov(w, 3, 'zawsze-warta', DNI, 4, { player: m2.player });
  return { m2, r };
};

describe('bot z badaniami: polityka gracza', () => {
  const z = gra(true);
  const bez = gra(false);

  it('stawia pracownię na początku kolejki, w pierwszych dniach gry', () => {
    const lab = z.m2.log.built.find((b) => b.kind === 'pracownia');
    expect(lab).toBeDefined();
    expect(dayOf(lab!.tick)).toBeLessThanOrEqual(4);
    // pierwsze polecenie budowy; kolejność ukończenia nie rozstrzyga, bo bezczynny zarząd sam zaczyna inne plany
    // (automat pracy ludzi, Budowa) i tańsze zasieki mogą stanąć przed pracownią
    expect(z.m2.log.plans[0]).toBe('pracownia');
  });

  it('wybiera najtańszą kartkę do wzięcia: pierwsza zbadana technologia ma najmniejszy koszt w drzewku', () => {
    const [pierwsza] = z.r.st.techDone ?? [];
    expect(pierwsza).toBeDefined();
    const najtansza = Math.min(...Object.keys(TECH_BY).map((id) => kosztTech(id)));
    expect(kosztTech(pierwsza)).toBe(najtansza);
  });

  it('zarząd bada przy stole, a nowe badanie wybiera od razu po poprzednim (kilka technologii w kilka dni)', () => {
    expect(z.r.st.techDone?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(Object.keys(z.r.st.research?.at ?? {})).toEqual(z.r.st.techDone);
  });

  it('bez opcji bot nie dotyka badań: stan bez pól badań, brak pracowni', () => {
    expect(bez.r.st.research).toBeUndefined();
    expect(bez.r.st.techDone).toBeUndefined();
    expect(bez.r.st.things.some((t) => t.kind === 'pracownia')).toBe(false);
    expect(bez.m2.log.built.some((b) => b.kind === 'pracownia')).toBe(false);
  });

  it('opcja zmienia przebieg (skrót stanu), a ta sama gra z opcją powtarza się bit w bit', () => {
    expect(z.r.hash).not.toBe(bez.r.hash);
    expect(gra(true).r.hash).toBe(z.r.hash);
  });
});

/** polecenia budowy bota w dniu 3 przy dużym zapasie materiałów (każde od razu do symulacji i krok, żeby plany stały) */
function budowy(opts: { badania: boolean }, techDone?: string[]): string[] {
  const st = createSim(w, seed, { core: 4 });
  st.tick = ((2 * 1440 + 10 * 60 - 900) * TICKS_PER_HOUR) / 60;
  if (techDone) st.techDone = techDone;
  const yard = w.fence.yard.filter((i) => !st.things.some((t) => t.x === i % w.size && t.y === Math.floor(i / w.size)));
  for (const [k, kind] of ['deski', 'zlom', 'czesci'].entries())
    st.things.push({
      id: st.nextThing++,
      kind,
      x: yard[k] % w.size,
      y: Math.floor(yard[k] / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 300,
      fuel: 0,
      by: -1,
      owner: -1,
    });
  const sim = new Sim(w, st);
  const { player } = m2Player({ search: false, furniture: false, ...opts });
  const kinds: string[] = [];
  // co 5 s przy ekranie (100 ticków) jedno rozejrzenie gracza
  for (let k = 0; k < 80; k++) {
    player(sim, w, st.tick / TICKS_PER_SECOND, (c) => {
      sim.push(c);
      if (c.t === 'build') kinds.push(c.kind);
    });
    for (let t = 0; t < 5 * TICKS_PER_SECOND; t++) sim.step();
  }
  return kinds;
}

describe('bot z badaniami: kolejka budowli', () => {
  it('pracownia idzie pierwsza, a budowle z technologii dopiero po jej zbadaniu', () => {
    const bez = budowy({ badania: true });
    expect(bez[0]).toBe('pracownia');
    expect(bez.length).toBeGreaterThan(1);
    expect(bez.filter((k) => BUILDS[k as keyof typeof BUILDS].tech)).toEqual([]);
    const z = budowy({ badania: true }, ['t_kozy']);
    expect(z[0]).toBe('pracownia');
    expect(z).toContain('koza_beczka');
    expect(z.indexOf('koza_beczka')).toBeGreaterThan(z.indexOf('warsztat'));
  });

  it('bez opcji kolejka to dawne sześć budowli, bez pracowni, także przy zbadanej technologii', () => {
    const kolejka = budowy({ badania: false }, ['t_kozy']);
    expect(kolejka).not.toContain('pracownia');
    expect(kolejka).not.toContain('koza_beczka');
    expect(kolejka.length).toBeGreaterThan(1);
  });
});

describe('tempo badań: wartości z pomiaru bota z badaniami', () => {
  // Wartości dobrał pomiar tools/bot-badania.ts z 19.10.2026 (npm run bot -- --badania [--mieszkancy] [--jedzenie]
  // --demo=NAZWA, ziarna 1–5, Przymorze, Lanciego i Zielonki; tabele w docs/POSTEP.md, wpis o badaniach). Po poprawce
  // nocy (zarząd z polecenia wstaje od stołu o 22:00) pomiar powtórzony na ziarnach 1–10 i z 1,15 oraz 1,2: zostaje 1,1.
  // Zmiana któregokolwiek pociąga za sobą nowy pomiar: ten test ma ją zatrzymać na przeglądzie.
  it('TEMPO_BAZOWE 1,1 i mnożniki ery 1–2 równe 1 i 1,3', () => {
    expect(TEMPO_BAZOWE).toBe(1.1);
    expect(KOSZT_ERY[1]).toBe(1);
    expect(KOSZT_ERY[2]).toBe(1.3);
  });

  it('najtańsza technologia robi się w mniej niż 13 godzin jednej osoby bez umiejętności (okno polecenia bota 7:00–20:00)', () => {
    const godziny = kosztTech('t_okna') / tempoOsoby({ skills: {}, traits: [] }, 'bud');
    expect(godziny).toBeCloseTo(12 / 1.1, 10);
    expect(godziny).toBeLessThan(13);
  });
});
