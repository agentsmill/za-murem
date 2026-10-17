/* Interfejs M2, fala 1 bez przeglądarki: menu budowy z BUILDS, sprawdzanie miejsca (atrapa canPlace na
   prawdziwych demach), mieszkania siedziby i ich karta, cele drugiego dnia i materiały na pasku. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import type { GovState } from '../../src/gov/typy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import * as budowle from '../../src/sim/budowle.ts';
import { BUILDS, type BuildKind } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { createSim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import {
  allowedAnchors,
  buildMenu,
  buildSheet,
  canPlaceAtrapa,
  footprint,
  matsOf,
  ourApts,
  placeCheck,
  workText,
} from '../../src/ui/budowa.ts';
import { DAY2_WOOD, goalsDay2, isDay2 } from '../../src/ui/cele.ts';
import { aptAt, aptCard, aptsOf, aptView, damageOf, REPAIR, WHY_TEXT } from '../../src/ui/mieszkania.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import type { AptState } from '../../src/world/apts.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const DEMOS = ['przymorze', 'lanciego', 'zielonki'] as const;
const worlds = new Map<string, { w: World; seed: number }>();
/** demo gry z ziarnem z adresu, jak w przeglądarce */
function demo(key: string) {
  let c = worlds.get(key);
  if (!c) {
    const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
    c = { w: buildWorld(d.geo, { seed, street: d.street }), seed };
    worlds.set(key, c);
  }
  return c;
}
const fresh = (key = 'przymorze') => {
  const { w, seed } = demo(key);
  return { w, st: createSim(w, seed, { core: 4 }) };
};
/** stan gry z polami fali 1 (st.apts, st.builds), których symulacja jeszcze nie ma */
const withApts = (st: SimState, apts: unknown[]) => Object.assign(st, { apts }) as SimState;

describe('menu budowy', () => {
  it('trzy kategorie, każda budowla z kosztem, czasem pracy, działaniem i miejscem z BUILDS', () => {
    const menu = buildMenu({ deski: 99, zlom: 99, czesci: 99 }, () => true);
    expect(menu.map((c) => c.title)).toEqual(['Pomieszczenie', 'Podwórko', 'Obwód']);
    const all = menu.flatMap((c) => c.items);
    expect(all.map((b) => b.kind).sort()).toEqual((Object.keys(BUILDS) as BuildKind[]).sort());
    for (const b of all) {
      const d = BUILDS[b.kind];
      expect(b.name).toBe(d.name);
      expect(b.effect).toBe(d.effect);
      expect(b.size).toBe(`${d.w}×${d.h}`);
      expect(b.ok).toBe(true);
    }
    const warsztat = all.find((b) => b.kind === 'warsztat')!;
    expect(warsztat.cost).toBe('deski 4, złom 2');
    expect(warsztat.time).toBe('1 h pracy');
    expect(warsztat.place).toBe('w pokoju naszego mieszkania');
    expect(menu.find((c) => c.key === 'obwod')!.items.map((b) => b.kind)).toEqual(['zasieki']);
  });

  it('niedostępne wyszarzone z powodem: brak materiałów (z podpowiedzią skąd) albo miejsca', () => {
    const poor = buildMenu({ deski: 1 }, () => true).flatMap((c) => c.items);
    const w = poor.find((b) => b.kind === 'warsztat')!;
    expect(w.ok).toBe(false);
    expect(w.why).toBe('Brakuje: deski 3, złom 2. Deski daje przeszukiwanie pustych mieszkań i rozbiórka mebli.');
    const k = buildMenu({ zlom: 9, czesci: 9 }, (kind) => kind !== 'kuchnia_spoleczna')
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'kuchnia_spoleczna')!;
    expect(k.why).toBe('Nie ma gdzie postawić: brak wolnego miejsca w kuchni naszego mieszkania.');
    // okno: przycisk tylko przy dostępnych, przy reszcie powód
    const html = buildSheet(
      buildMenu({ deski: 4, zlom: 2 }, () => true),
      false,
    ).body;
    expect(html).toContain('data-act="build" data-arg="warsztat"');
    expect(html).not.toContain('data-arg="magazyn"');
    expect(html).toContain('Brakuje: deski 2.');
    expect(html).toContain('Lewy klik stawia plan, R obraca, prawy klik albo Esc anuluje.');
    expect(
      buildSheet(
        buildMenu({}, () => true),
        true,
      ).body,
    ).toContain('Stuknięcie stawia plan');
  });

  it('czas pracy w godzinach gry i rozmiar po obrocie', () => {
    expect(workText(TICKS_PER_HOUR)).toBe('1 h pracy');
    expect(workText(TICKS_PER_HOUR / 2)).toBe('30 min pracy');
    expect(workText(TICKS_PER_HOUR / 4)).toBe('15 min pracy');
    expect(footprint('magazyn', 0)).toEqual({ w: 2, h: 2 });
    expect(footprint('ogrodek', 0)).toEqual({ w: 3, h: 2 });
    expect(footprint('ogrodek', 1)).toEqual({ w: 2, h: 3 });
    expect(footprint('lozka_pietrowe', 3)).toEqual({ w: 2, h: 1 });
  });
});

describe('sprawdzanie miejsca (atrapa canPlace)', () => {
  it('canPlace z symulacji, kiedy już jest, a do tego czasu atrapa', () => {
    const real = (budowle as unknown as Record<string, unknown>).canPlace;
    expect(placeCheck).toBe(real ?? canPlaceAtrapa);
  });

  it.each(DEMOS)('%s: każda budowla ma gdzie stanąć, a dozwolone miejsca trzymają reguły', (key) => {
    const { w, st } = fresh(key);
    const i = w.interior;
    const ours = ourApts(st, w);
    expect(ours).toEqual([i.home]);
    const fence = new Set(w.fence.tiles);
    const yard = new Set(w.fence.yard);
    const g = w.fence.gate;
    for (const kind of Object.keys(BUILDS) as BuildKind[]) {
      const d = BUILDS[kind];
      for (const rot of [0, 1] as const) {
        const list = allowedAnchors(st, w, kind, rot, canPlaceAtrapa);
        if (kind === 'kuchnia_spoleczna' && key === 'przymorze') continue;
        expect(list.length, `${kind} ${rot}`).toBeGreaterThan(0);
        for (const a of list) {
          const { w: fw, h: fh } = footprint(kind, rot);
          for (let dy = 0; dy < fh; dy++)
            for (let dx = 0; dx < fw; dx++) {
              const t = a + dy * w.size + dx;
              if (d.place === 'podworko') expect(yard.has(t)).toBe(true);
              else if (d.place === 'obwod') {
                expect(fence.has(t)).toBe(true);
                const x = t % w.size;
                const y = Math.floor(t / w.size);
                expect(x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h).toBe(false);
              } else {
                const room = i.rooms[i.room[t]];
                expect(room.kind).toBe(d.place);
                expect(ours).toContain(room.apt);
                expect(w.blocked[t]).toBe(0);
                expect(
                  st.things.some(
                    (o) =>
                      t % w.size >= o.x &&
                      t % w.size < o.x + o.w &&
                      Math.floor(t / w.size) >= o.y &&
                      Math.floor(t / w.size) < o.y + o.h,
                  ),
                ).toBe(false);
              }
            }
        }
      }
    }
  });

  it('powody odmowy: poza naszym pokojem, na bramie, zajęte, poza mapą', () => {
    const { w, st } = fresh();
    const yard = w.fence.yard[0];
    expect(canPlaceAtrapa(st, w, 'warsztat', yard % w.size, Math.floor(yard / w.size), 0)).toEqual({
      ok: false,
      why: 'Tylko w pokoju naszego mieszkania.',
    });
    const g = w.fence.gate;
    expect(canPlaceAtrapa(st, w, 'zasieki', g.x, g.y, 0)).toEqual({
      ok: false,
      why: 'Na bramie nie, brama musi się otwierać.',
    });
    const koza = st.things.find((t) => t.kind === 'koza')!;
    expect(canPlaceAtrapa(st, w, 'warsztat', koza.x, koza.y, 0).ok).toBe(false);
    expect(canPlaceAtrapa(st, w, 'ogrodek', -1, 5, 0)).toEqual({ ok: false, why: 'Poza mapą.' });
    // plan budowy zajmuje miejsce (st.builds z kontraktu)
    const a = allowedAnchors(st, w, 'ogrodek', 0, canPlaceAtrapa)[0];
    const planned = Object.assign(st, {
      builds: [{ kind: 'ogrodek', x: a % w.size, y: Math.floor(a / w.size), rot: 0 }],
    });
    expect(canPlaceAtrapa(planned, w, 'ogrodek', a % w.size, Math.floor(a / w.size), 0)).toEqual({
      ok: false,
      why: 'Tu już jest plan budowy.',
    });
  });
});

describe('mieszkania siedziby', () => {
  it.each(DEMOS)('%s: zarząd, mieszkańcy z symulacji, reszta puste z powodem i rokiem (atrapa świata)', (key) => {
    const { w, st } = fresh(key);
    const apts = aptsOf(st, w);
    expect(apts.find((a) => a.apt === w.interior.home)?.state).toBe('zarzad');
    const lived = new Set(st.pawns.filter((p) => p.kind === 'resident').map((p) => p.apt));
    for (const a of apts) {
      if (a.apt === w.interior.home) continue;
      expect(a.state).toBe(lived.has(a.apt) ? 'mieszkancy' : 'puste');
      if (a.state === 'puste') {
        expect(Object.keys(WHY_TEXT)).toContain(a.why);
        expect(a.year).toBeGreaterThanOrEqual(2026);
        expect(a.year).toBeLessThanOrEqual(2051);
      }
    }
    // ten sam świat, te same stany
    expect(aptsOf(st, w)).toEqual(apts);
  });

  it('świat z World.apts i World.damage wygrywa z atrapą', () => {
    const { w, st } = fresh();
    const apt = aptsOf(st, w).find((a) => a.apt !== w.interior.home)!.apt;
    const real: AptState[] = [{ bid: w.interior.building, apt, state: 'puste', why: 'pozar', year: 2040 }];
    const tile = w.interior.room.findIndex((r) => r >= 0 && w.interior.rooms[r].apt === apt);
    const w2 = Object.assign(Object.create(Object.getPrototypeOf(w)), w, {
      apts: real,
      damage: [{ kind: 'piec', tile, bid: w.interior.building, apt }],
    }) as World;
    expect(aptsOf(st, w2)).toEqual(real);
    expect(damageOf(st, w2, apt).map((d) => d.kind)).toEqual(['piec']);
  });

  it('karta pustego mieszkania: stan, powód, co do naprawy z kosztem, co już przeszukane', () => {
    const { w, st } = fresh();
    const empty = aptsOf(st, w).find((a) => a.state === 'puste' && damageOf(st, w, a.apt).length)!;
    const v = aptView(st, w, empty.apt)!;
    // klik w pokój tego mieszkania trafia w nie, w klatkę nie
    const tile = w.interior.room.indexOf(v.rooms[0].id);
    expect(aptAt(w, tile)).toBe(empty.apt);
    const stair = w.interior.room.findIndex((r) => r >= 0 && w.interior.rooms[r].kind === 'klatka');
    if (stair >= 0) expect(aptAt(w, stair)).toBe(-1);
    let html = aptCard(v, false);
    expect(html).toContain(`<h2>Mieszkanie ${empty.apt + 1}</h2>`);
    expect(html).toContain(`Puste od ${empty.year}`);
    expect(html).toContain(WHY_TEXT[empty.why!](empty.year!));
    for (const d of v.damages) expect(html).toContain(REPAIR[d.kind].name);
    expect(html).toContain(`Przeszukane: 0 z ${v.rooms.length}`);
    expect(html).toContain('Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.');
    // stan gry (st.apts z kontraktu): pokój przeszukany, uszkodzenie naprawione, mieszkanie nasze
    const st2 = withApts(st, [
      {
        bid: w.interior.building,
        apt: empty.apt,
        ours: true,
        searched: [v.rooms[0].id],
        repaired: [v.damages[0].tile],
      },
    ]);
    const v2 = aptView(st2, w, empty.apt)!;
    html = aptCard(v2, true);
    expect(html).toContain(`Zajęte przez zarząd od ${empty.year}`);
    expect(html).toContain(`Przeszukane: 1 z ${v.rooms.length}`);
    expect(html).toContain('naprawione');
    expect(html).toContain('Przytrzymajcie palec w mieszkaniu');
    expect(ourApts(st2, w)).toContain(empty.apt);
  });
});

describe('cele drugiego dnia', () => {
  const day2 = (seed = 3): GovState => {
    const gov = newGov(seed);
    gov.reports.push({} as GovState['reports'][number]);
    return gov;
  };
  it('po pierwszym raporcie: przeszukać, warsztat, obwód, drewno na noc', () => {
    const { st } = fresh();
    expect(isDay2(newGov(1))).toBe(false);
    const gov = day2();
    expect(isDay2(gov)).toBe(true);
    const o = { touch: false, wood: 3, woodReady: false, holes: 2 };
    let g = goalsDay2(st, gov, o);
    expect(g.map((x) => x.key)).toEqual(['przeszukaj', 'warsztat', 'obwod', 'drewno2']);
    expect(g.every((x) => !x.done)).toBe(true);
    expect(g[1].how).toContain('Warsztat w pokoju naszego mieszkania (deski 4, złom 2)');
    expect(g[2].how).toContain('Otwartych dziur: 2.');
    expect(g[3].how).toBe(
      `Drewna na zapas: 3 z ${DAY2_WOOD}. Noc zjada około 2 sztuk na godzinę, a przy kozie może ktoś czuwać.`,
    );
    // przeszukane pomieszczenie, gotowy warsztat i zasieki, zapas drewna
    const st2 = withApts(st, [{ bid: 0, apt: 2, searched: [5] }]);
    st2.things.push({ ...st2.things[0], id: 9001, kind: 'warsztat' }, { ...st2.things[0], id: 9002, kind: 'zasieki' });
    g = goalsDay2(st2, gov, { ...o, woodReady: true });
    expect(g.every((x) => x.done)).toBe(true);
    // obwód bez zasieków liczy się, gdy wszystkie dziury załatane; drewno przepada z kartą nocy
    st2.things = st2.things.filter((t) => t.kind !== 'zasieki');
    expect(goalsDay2(st2, gov, { ...o, holes: 0 }).find((x) => x.key === 'obwod')?.done).toBe(true);
    gov.night = { confirmed: true } as GovState['night'];
    const late = goalsDay2(st2, gov, o).find((x) => x.key === 'drewno2')!;
    expect(late).toMatchObject({ done: true, missed: true });
  });
});

describe('materiały na pasku', () => {
  it('deski, złom i części osobno i jednym polem na telefon', () => {
    const { w, st } = fresh();
    const snap = snapshot(st, w);
    const by = Object.fromEntries(statsOf(snap, null).map((x) => [x.id, x]));
    expect(by.sBoards.value).toBe(String(snap.stock.boards));
    expect(by.sScrap.value).toBe(String(snap.stock.scrap));
    expect(by.sParts.value).toBe(String(snap.stock.parts));
    expect(by.sMats.value).toBe(`${snap.stock.boards}·${snap.stock.scrap}·${snap.stock.parts}`);
    expect(by.sParts.level).toBe(snap.stock.parts ? 'ok' : 'mid');
    expect(matsOf(snap.stock)).toMatchObject({
      deski: snap.stock.boards,
      zlom: snap.stock.scrap,
      czesci: snap.stock.parts,
    });
  });
});
