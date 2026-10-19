/* Karta „Szwendacz w siatce” (tryb zombie, docs/superpowers/specs/2026-10-19-wydarzenia-design.md, „Szwendacz w siatce”
   i „Pokaż i ślad na mapie”): symulacja podaje w GovInput.horde.przy prawdziwego szwendacza przy siatce, karta wypada
   tylko za dnia i tylko z kimś przy siatce, niesie jego miejsce (`gdzie` w oknie wydarzenia), a „Dobić dzidą” wysyła
   atak osoby z dzidą na tego szwendacza (GovEffects.atak, w symulacji polecenie 'attack'). */

import { describe, expect, it } from 'vitest';
import type { GovInput } from '../../src/gov/typy.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, fitsMode, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov, pending } from '../../src/gov/zarzad.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { createSim, Sim, spawnZombie } from '../../src/sim/sim.ts';
import { Atrapa } from './gov-atrapa.ts';
import { mockBlock } from './interior-mock.ts';
import { polskieSlowa } from './po-angielsku.ts';

const w = mockBlock();
const size = w.size;
const def = M1_EVENTS.find((e) => e.id === 'szwendacz')!;

/** całkowity kwadrat odległości kafelka od najbliższego kafelka siatki */
const d2Fence = (tile: number): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const t of w.fence.tiles) {
    const dx = (t % size) - (tile % size);
    const dy = Math.floor(t / size) - Math.floor(tile / size);
    best = Math.min(best, dx * dx + dy * dy);
  }
  return best;
};
/** wolne kafelki przy siatce o danym kwadracie odległości od niej (po kolei, bez powtórek) */
const tilesAt = (d2: number): number[] => {
  const seen = new Set<number>();
  for (const t of w.fence.tiles)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = (t % size) + dx;
        const y = Math.floor(t / size) + dy;
        const i = y * size + x;
        if (x < 0 || y < 0 || x >= size || y >= size || w.blocked[i] || seen.has(i)) continue;
        if (d2Fence(i) === d2) seen.add(i);
      }
  return [...seen];
};
/** wolny kafelek daleko od siatki (ponad 5 m) */
const farTile = (): number => {
  for (let i = 0; i < size * size; i++) if (!w.blocked[i] && d2Fence(i) > 25) return i;
  throw new Error('brak kafelka daleko od siatki');
};

const zombieSim = () => createSim(w, 3, { core: 3, mode: 'zombie' });
const xy = (p: { x: number; y: number }) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

describe('GovInput.horde.przy: szwendacz przy siatce z symulacji', () => {
  it('govInput w trybie zombie podaje szwendacza przy siatce: pionek i kafelek', () => {
    const st = zombieSim();
    expect(govInput(st, w, 0).horde?.przy).toBeUndefined();
    spawnZombie(st, w, farTile(), 1);
    expect(govInput(st, w, 0).horde?.przy).toBeUndefined();
    const z = spawnZombie(st, w, tilesAt(1)[0], 2);
    expect(govInput(st, w, 0).horde?.przy).toEqual({ pawn: z.id, ...xy(z) });
  });

  it('granica to 3 m od kafelka siatki, wygrywa najbliższy, przy remisie niższy numer pionka', () => {
    const st = zombieSim();
    const [a, b] = tilesAt(1);
    expect(tilesAt(9).length).toBeGreaterThan(0);
    expect(tilesAt(16).length).toBeGreaterThan(0);
    // 4 m od siatki to jeszcze nie „przy siatce”
    spawnZombie(st, w, tilesAt(16)[0], 1);
    expect(govInput(st, w, 0).horde?.przy).toBeUndefined();
    const z3 = spawnZombie(st, w, tilesAt(9)[0], 2);
    expect(govInput(st, w, 0).horde?.przy?.pawn).toBe(z3.id);
    // bliższy zabiera miejsce, choć wstał później
    const z1 = spawnZombie(st, w, a, 3);
    expect(govInput(st, w, 0).horde?.przy?.pawn).toBe(z1.id);
    // remis: niższy numer pionka
    spawnZombie(st, w, b, 4);
    expect(govInput(st, w, 0).horde?.przy?.pawn).toBe(z1.id);
  });

  it('w zwykłym trybie nie ma horde, a pole przy nie zmienia reszty horde', () => {
    const zwykly = createSim(w, 3, { core: 3 });
    spawnZombie(zwykly, w, tilesAt(1)[0], 2);
    expect(govInput(zwykly, w, 0).horde).toBeUndefined();
    const st = zombieSim();
    const bez = govInput(st, w, 0).horde!;
    expect(Object.keys(bez).sort()).toEqual(['bites', 'breaches', 'killed', 'near', 'pressing', 'tonight']);
  });
});

/** wejście zarządu na atrapie: dzień 3, południe, szwendacz przy siatce (przy), nikt nie ma dzidy */
const PRZY = { pawn: 41, x: 120, y: 87 };
const HORDE = { near: 1, pressing: 0, killed: 0, breaches: 0, bites: 0, tonight: 8 };
function setup(over: Partial<GovInput> = {}, arms: (string | undefined)[] = [], seed = 1) {
  const gov = newGov(seed, 'zombie');
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.woodSklad = 6;
  atr.scrap = 5;
  atr.people.forEach((p, k) => {
    if (arms[k]) p.arm = arms[k] as 'brak' | 'wrecz' | 'dzida' | 'palna';
  });
  const i: GovInput = {
    ...atr.input(),
    day: 3,
    hour: 12,
    minute: 0,
    screen: 1000,
    kozaLit: true,
    horde: { ...HORDE, przy: PRZY },
    ...over,
  };
  return { gov, i, atr };
}
/** zarząd z otwartą kartą szwendacza (dane z make jak przy losowaniu) */
function withCard(over: Partial<GovInput> = {}, arms: (string | undefined)[] = []) {
  const s = setup(over, arms);
  s.gov.ev.active = { id: 'szwendacz', d: def.make(makeHost(s.gov, s.i, emptyEffects())) };
  return s;
}

describe('karta szwendacz', () => {
  it('jest kartą trybu zombie, za dnia, z odstępem 6 godzin i wagą 1,2 tylko z kimś przy siatce', () => {
    expect(def.tryby).toEqual(['zombie']);
    expect(def.when).toEqual(['dzien']);
    expect(def.gap).toBe(6);
    expect(fitsMode({ mode: 'zombie' }, def)).toBe(true);
    expect(fitsMode({ mode: 'zwykly' }, def)).toBe(false);
    const s = setup();
    expect(def.w(makeHost(s.gov, s.i, emptyEffects()))).toBe(1.2);
    // horde bez przy (nikt przy siatce) i wejście bez horde (tryb zwykły): nie przychodzi
    const bez = setup({ horde: HORDE });
    expect(def.w(makeHost(bez.gov, bez.i, emptyEffects()))).toBe(0);
    expect(def.make(makeHost(bez.gov, bez.i, emptyEffects()))).toBeNull();
    const zwykly = setup({ horde: undefined });
    expect(def.w(makeHost(zwykly.gov, zwykly.i, emptyEffects()))).toBe(0);
  });

  it('wypada tylko za dnia z kimś przy siatce i niesie jego miejsce w oknie (gdzie)', () => {
    const wylosowana = (hour: number, over: Partial<GovInput> = {}) => {
      const { gov, i } = setup({ hour, ...over });
      // wszystkie inne karty „przed chwilą”, żeby losowanie nie miało z czego wybierać
      for (const e of M1_EVENTS) if (e.id !== 'szwendacz') gov.ev.last[e.id] = gameMin(i);
      gov.ev.next = 0;
      gov.ev.warm = 0;
      eventTick(gov, i, emptyEffects(), false);
      return { gov, i };
    };
    for (const hour of [8, 12, 18]) {
      const { gov, i } = wylosowana(hour);
      expect(gov.ev.active?.id, `godz. ${hour}`).toBe('szwendacz');
      const view = eventView(gov, i)!;
      expect(view.id).toBe('szwendacz');
      expect(view.gdzie).toEqual({ x: PRZY.x, y: PRZY.y });
      expect(pending(gov, i)).toMatchObject({ k: 'wydarzenie', id: 'szwendacz', gdzie: { x: PRZY.x, y: PRZY.y } });
    }
    for (const hour of [19, 21, 23, 3]) expect(wylosowana(hour).gov.ev.active, `godz. ${hour}`).toBeNull();
    expect(wylosowana(12, { horde: HORDE }).gov.ev.active).toBeNull();
    // po zapisie i wczytaniu okno pamięta miejsce, nawet gdy szwendacz już odszedł od siatki
    const { gov } = wylosowana(12);
    const odszedl = setup({ horde: HORDE }).i;
    expect(eventView(gov, odszedl)?.gdzie).toEqual({ x: PRZY.x, y: PRZY.y });
    // a gdy stoi gdzie indziej, okno pokazuje, gdzie stoi teraz
    const przesunal = setup({ horde: { ...HORDE, przy: { pawn: 41, x: 130, y: 90 } } }).i;
    expect(eventView(gov, przesunal)?.gdzie).toEqual({ x: 130, y: 90 });
  });

  it('inne karty nie mają miejsca w oknie', () => {
    const { gov, i } = setup();
    gov.ev.active = { id: 'pies', d: {} };
    expect(eventView(gov, i)).not.toHaveProperty('gdzie');
  });

  it('teksty w obu językach, bez polskich słów po angielsku', () => {
    const { gov, i } = withCard({}, ['dzida']);
    const h = makeHost(gov, i, emptyEffects());
    const d = gov.ev.active!.d;
    const texts = [def.title(h, d), def.text(h, d), ...def.choices(h, d).map((c) => c.label)];
    expect(def.choices(h, d).map((c) => c.label.pl)).toEqual([
      'Dobić dzidą',
      'Zostawić, niech wisi',
      'Zasłonić kocem, żeby dzieci nie patrzyły',
    ]);
    for (const t of texts) {
      expect(t.pl.length).toBeGreaterThan(0);
      expect(polskieSlowa(t.en), t.en).toEqual([]);
    }
    expect(def.text(h, d).en).toMatch(/shambler/);
    expect(def.choices(h, d)[0].label.en).toMatch(/spear/);
  });
});

describe('wybory karty', () => {
  it('Dobić dzidą wysyła atak osoby z dzidą na tego szwendacza', () => {
    const { gov, i, atr } = withCard({}, [undefined, 'dzida']);
    const fx = chooseEvent(gov, i, 0);
    expect(fx.atak).toEqual([{ id: atr.people[1].id, pawn: PRZY.pawn }]);
    expect(gov.ev.active).toBeNull();
  });

  it('po applyGov atak trafia do kolejki poleceń symulacji i osoba z dzidą rusza do walki z tym szwendaczem', () => {
    const st = zombieSim();
    const cores = st.pawns.filter((p) => p.kind === 'core');
    cores[1].weapon = 'dzida';
    const z = spawnZombie(st, w, tilesAt(1)[0], 2);
    const gov = newGov(1, 'zombie');
    const i: GovInput = { ...govInput(st, w, 1000), day: 3, hour: 12 };
    expect(i.horde?.przy?.pawn).toBe(z.id);
    gov.ev.active = { id: 'szwendacz', d: def.make(makeHost(gov, i, emptyEffects())) };
    const fx = chooseEvent(gov, i, 0);
    const kto = st.people[cores[1].person].id;
    expect(fx.atak).toEqual([{ id: kto, pawn: z.id }]);
    const sim = new Sim(w, st);
    applyGov(st, w, fx);
    expect(st.cmds).toContainEqual({ t: 'attack', ids: [cores[1].id], target: z.id });
    sim.step();
    expect(cores[1].job?.t).toBe('fight');
    expect(cores[1].job?.target).toBe(z.id);
    // dzida u innej osoby niż pierwsza na liście: tylko ona atakuje
    expect(cores[0].job?.t).not.toBe('fight');
  });

  it('atak na szwendacza, którego już nie ma, nic nie psuje', () => {
    const st = zombieSim();
    const cores = st.pawns.filter((p) => p.kind === 'core');
    cores[0].weapon = 'dzida';
    const fx = emptyEffects();
    fx.atak = [{ id: st.people[cores[0].person].id, pawn: 99999 }];
    const sim = new Sim(w, st);
    applyGov(st, w, fx);
    expect(() => sim.step()).not.toThrow();
    expect(cores[0].job?.t).not.toBe('fight');
    // i osoba, której nie ma
    const fx2 = emptyEffects();
    fx2.atak = [{ id: 's999', pawn: 1 }];
    const n = st.cmds.length;
    applyGov(st, w, fx2);
    expect(st.cmds.length).toBe(n);
  });

  it('bez dzidy wybór Dobić jest niedostępny: gołe ręce, broń do walki wręcz, śpiący i ten na wyprawie nie liczą się', () => {
    const bez = withCard({}, ['brak', 'wrecz', 'palna']);
    const h = makeHost(bez.gov, bez.i, emptyEffects());
    expect(h.zDzida()).toBeNull();
    expect(def.choices(h, bez.gov.ev.active!.d)[0].ok).toBe(false);
    expect(eventView(bez.gov, bez.i)!.choices.map((c) => c.ok)).toEqual([false, true, true]);
    const fx = chooseEvent(bez.gov, bez.i, 0);
    expect(fx.atak ?? []).toEqual([]);
    expect(bez.gov.ev.active?.id).toBe('szwendacz');
    // dzida u śpiącego albo u tego, kto jest poza mapą
    const spi = withCard({}, ['dzida']);
    spi.i.people[0].asleep = true;
    expect(makeHost(spi.gov, spi.i, emptyEffects()).zDzida()).toBeNull();
    const wyprawa = withCard({}, ['dzida']);
    wyprawa.i.people[0].away = true;
    expect(makeHost(wyprawa.gov, wyprawa.i, emptyEffects()).zDzida()).toBeNull();
    // ale ten, kto nie śpi i ma dzidę, wystarcza, choć pierwszy z dzidą śpi
    const dwoje = withCard({}, ['dzida', 'dzida']);
    dwoje.i.people[0].asleep = true;
    expect(makeHost(dwoje.gov, dwoje.i, emptyEffects()).zDzida()?.id).toBe(dwoje.atr.people[1].id);
  });

  it('z kilkoma dzidami atakuje najzdrowszy, przy remisie pierwszy po numerze', () => {
    const s = withCard({}, ['dzida', 'dzida', 'dzida']);
    s.i.people[0].needs.health = 40;
    s.i.people[1].needs.health = 90;
    s.i.people[2].needs.health = 90;
    const pierwszy = [s.atr.people[1].id, s.atr.people[2].id].sort()[0];
    expect(makeHost(s.gov, s.i, emptyEffects()).zDzida()?.id).toBe(pierwszy);
  });

  it('Zostawić, niech wisi: bezpieczeństwo −3 wszystkim; Zasłonić kocem: zaufanie +1, bez walki', () => {
    const wisi = withCard({}, ['dzida']);
    const fx = chooseEvent(wisi.gov, wisi.i, 1);
    expect(fx.needs.map((n) => [n.id, n.d.safe])).toEqual(wisi.atr.people.map((p) => [p.id, -3]));
    expect(fx.atak ?? []).toEqual([]);
    const koc = withCard({}, ['dzida']);
    const trust = koc.gov.trust;
    const fx2 = chooseEvent(koc.gov, koc.i, 2);
    expect(koc.gov.trust).toBe(trust + 1);
    expect(fx2.atak ?? []).toEqual([]);
    expect(fx2.needs).toEqual([]);
  });
});
