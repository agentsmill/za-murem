/* Interfejs M2, fala 1 bez przeglądarki: menu budowy z BUILDS, dozwolone miejsca z canPlace symulacji na
   prawdziwych demach, polecenia przy planach i budowlach, mieszkania siedziby i ich karta, cele drugiego dnia,
   przybysze zza bramy i materiały na pasku. Koszty i czasy stroi bot, więc testy czytają je z BUILDS. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tr, tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { BLOK, wordsOf } from '../../src/gov/miejsce.ts';
import type { GovState } from '../../src/gov/typy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { nazwaTech, PIECZARKI_PLON, TECH_BY } from '../../src/sim/badania.ts';
import { BUILDS_EN } from '../../src/sim/budowle.en.ts';
import { BUILDS, type BuildKind, canPlace, effectOf, footprint, type Mat } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { REPAIR } from '../../src/sim/mieszkania.ts';
import { addResidents, createSim, GARDEN_YIELD, Sim, type SimState } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import {
  allowedAnchors,
  availableOf,
  BUILD_MENU,
  buildItems,
  buildMenu,
  buildPanelHtml,
  costText,
  MAT_NAME,
  matsOf,
  noweBudowle,
  okTilesOf,
  ourApts,
  placeKey,
  reservedOf,
  stockKey,
  TECH_NAMES,
  workText,
} from '../../src/ui/budowa.ts';
import { DAY2_WOOD, goalsDay2, isDay2 } from '../../src/ui/cele.ts';
import { aptAt, aptCard, aptView, DAMAGE_NAME, WHY_TEXT } from '../../src/ui/mieszkania.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { arriving, comingText } from '../../src/ui/przybycie.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

const DEMOS = ['przymorze', 'lanciego', 'zielonki'] as const;
/** badania budowli z technologii (BUILDS[k].tech) z danych, zanim któryś test ustawi własne: afterEach je przywraca,
    a wszystkie razem odblokowują każdą budowlę */
const TECH0: Readonly<Partial<Record<BuildKind, string>>> = Object.fromEntries(
  (Object.keys(BUILDS) as BuildKind[]).filter((k) => BUILDS[k].tech).map((k) => [k, BUILDS[k].tech]),
);
const ALL_TECH = Object.values(TECH0) as string[];
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
/** ile sztuk materiału bierze budowla */
const total = (k: BuildKind) => Object.values(BUILDS[k].cost).reduce((a: number, n) => a + (n ?? 0), 0);
/** „Brakuje: deski 19, złom 10.” przy takim zapasie */
const missing = (k: BuildKind, have: Partial<Record<Mat, number>>) =>
  (Object.entries(BUILDS[k].cost) as [Mat, number][])
    .map(([m, n]): [Mat, number] => [m, n - (have[m] ?? 0)])
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${MAT_NAME[m]} ${n}`)
    .join(', ');

describe('menu budowy', () => {
  afterEach(() => {
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      const t = TECH0[k];
      if (t) BUILDS[k].tech = t;
      else delete BUILDS[k].tech;
    }
    delete TECH_NAMES.t_test;
    BUILD_MENU.showLocked = false;
  });

  it('zablokowane badaniem: ukryte, z flagą kłódek wyszarzone z „Wymaga badania”, zakładka bez pozycji znika', () => {
    const rich = { deski: 999, zlom: 999, czesci: 999 };
    const kinds = (m: ReturnType<typeof buildMenu>) => m.flatMap((c) => c.items.map((b) => b.kind));
    BUILDS.warsztat.tech = 't_test';
    expect(kinds(buildMenu(rich, () => true, undefined, undefined, { st: {} }))).not.toContain('warsztat');
    expect(kinds(buildMenu(rich, () => true, undefined, undefined, { st: { techDone: ['t_test'] } }))).toContain(
      'warsztat',
    );
    TECH_NAMES.t_test = tx('Badanie testowe', 'Test research');
    const shown = buildMenu(rich, () => true, undefined, undefined, { st: {}, showLocked: true })
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'warsztat')!;
    expect(shown).toMatchObject({ ok: false, locked: 'Wymaga badania: Badanie testowe' });
    expect(shown.why).toBe(shown.locked);
    // flaga z danych działa tak samo jak opcja
    BUILD_MENU.showLocked = true;
    expect(kinds(buildMenu(rich, () => true, undefined, undefined, { st: {} }))).toContain('warsztat');
    BUILD_MENU.showLocked = false;
    // jedyna budowla zakładki zablokowana: zakładki nie ma
    BUILDS.zasieki.tech = 't_test';
    expect(buildMenu(rich, () => true, undefined, undefined, { st: {} }).map((c) => c.key)).toEqual([
      'dom',
      'podworko',
    ]);
  });

  /** pracownia stoi (rzecz w st.things), położenie bez znaczenia dla menu */
  const pracownia = (st: SimState) =>
    st.things.push({
      id: st.nextThing++,
      kind: 'pracownia',
      x: 1,
      y: 1,
      w: 2,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
  const bogaty = { deski: 999, zlom: 999, czesci: 999 };
  const pozycja = (m: ReturnType<typeof buildMenu>, k: BuildKind) =>
    m.flatMap((c) => c.items).find((b) => b.kind === k);

  it('kłódki od chwili, gdy stoi pracownia: szklarnia z „Wymaga badania: Szklarnie z folii”, po badaniu bez kłódki', () => {
    const { st } = fresh();
    const menu = () => buildMenu(bogaty, () => true, undefined, undefined, { st });
    // bez pracowni budowle z technologii są ukryte
    expect(pozycja(menu(), 'szklarnia')).toBeUndefined();
    expect(pozycja(menu(), 'kociol')).toBeUndefined();
    pracownia(st);
    const szkl = pozycja(menu(), 'szklarnia')!;
    expect(szkl).toMatchObject({ ok: false, locked: 'Wymaga badania: Szklarnie z folii' });
    expect(szkl.why).toBe(szkl.locked);
    expect(pozycja(menu(), 'kociol')!.locked).toBe('Wymaga badania: Rozruch węzła cieplnego');
    expect(buildPanelHtml(menu(), { tab: 'podworko', kind: 'szklarnia' }, false).body).toMatch(
      /class="tile sel lock"[^>]*data-kind="szklarnia"/,
    );
    ustawJezyk('en');
    expect(pozycja(menu(), 'szklarnia')!.locked).toBe(`Needs research: ${tr(nazwaTech('t_szklarnia'))}`);
    ustawJezyk('pl');
    // po badaniu: bez kłódki i do postawienia
    st.techDone = ['t_konserwy', 't_szklarnia'];
    const po = pozycja(menu(), 'szklarnia')!;
    expect(po.locked).toBeUndefined();
    expect(po.ok).toBe(true);
    // rozbiórka pracowni chowa kłódki przed następnymi badaniami, zbadana budowla zostaje
    st.things = st.things.filter((t) => t.kind !== 'pracownia');
    expect(pozycja(menu(), 'szklarnia')?.ok).toBe(true);
    expect(pozycja(menu(), 'kociol')).toBeUndefined();
    // opcja showLocked nadal wymusza kłódki bez pracowni (zrzuty, ?budowa=klodki)
    expect(
      pozycja(
        buildMenu(bogaty, () => true, undefined, undefined, { st, showLocked: true }),
        'kociol',
      )!.locked,
    ).toBe('Wymaga badania: Rozruch węzła cieplnego');
  });

  it('nazwy badań w kłódkach biorą się z tablicy badań dla każdej technologii z budowlą', () => {
    for (const t of Object.values(TECH_BY)) expect(TECH_NAMES[t.id], t.id).toEqual(nazwaTech(t.id));
    for (const k of Object.keys(BUILDS) as BuildKind[]) {
      const id = BUILDS[k].tech;
      if (id) expect(tr(TECH_NAMES[id]), k).not.toBe(id);
    }
  });

  it('stojąca pracownia (albo plan) mówi „Pracownia już stoi.”, a nie „Nie ma gdzie postawić”', () => {
    const { st } = fresh();
    const menu = (room = false) => buildMenu(bogaty, () => room, undefined, undefined, { st });
    // jeszcze nie stoi: zwykły powód braku miejsca
    expect(pozycja(menu(), 'pracownia')!.why).toMatch(/^Nie ma gdzie postawić/);
    expect(pozycja(menu(true), 'pracownia')).toMatchObject({ ok: true });
    pracownia(st);
    for (const room of [false, true]) {
      const p = pozycja(menu(room), 'pracownia')!;
      expect(p).toMatchObject({ ok: false, why: 'Pracownia już stoi.' });
    }
    ustawJezyk('en');
    expect(pozycja(menu(), 'pracownia')!.why).toBe('The research room already stands.');
    ustawJezyk('pl');
    // szczegóły w panelu niosą ten sam powód i nie mają przycisku „Postaw”
    const html = buildPanelHtml(menu(), { tab: 'dom', kind: 'pracownia' }, false).body;
    expect(html).toContain('<p class="build-why">Pracownia już stoi.</p>');
    expect(html).not.toContain('data-act="build" data-arg="pracownia"');
    // sam plan też wypełnia limit
    st.things = st.things.filter((t) => t.kind !== 'pracownia');
    st.builds.push({ id: 900, kind: 'pracownia', x: 1, y: 1, rot: 0, need: {}, have: {}, work: 1, by: -1 });
    expect(pozycja(menu(), 'pracownia')!.why).toBe('Pracownia już stoi.');
    // canPlace mówi to samo
    expect(canPlace(st, fresh().w, 'pracownia', 1, 1, 0).why).toBe('Pracownia już stoi.');
  });

  it('wieża: „Wieża już stoi.”, a budowla innego rodzaju może mieć własny napis (BuildDef.juzStoi)', () => {
    const { w, st } = fresh();
    st.techDone = ['t_wieza', 't_kozy'];
    const menu = () => buildMenu(bogaty, () => false, undefined, undefined, { st });
    expect(pozycja(menu(), 'wieza')!.why).toMatch(/^Nie ma gdzie postawić/);
    st.things.push({
      id: st.nextThing++,
      kind: 'wieza',
      x: 1,
      y: 1,
      w: 2,
      h: 2,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    expect(pozycja(menu(), 'wieza')!.why).toBe('Wieża już stoi.');
    ustawJezyk('en');
    expect(pozycja(menu(), 'wieza')!.why).toBe('The tower already stands.');
    ustawJezyk('pl');
    // własny napis dla budowli, której domyślne zdanie by nie pasowało
    BUILDS.wieza.juzStoi = tx('Wieża jest już postawiona.', 'The tower is up already.');
    try {
      expect(pozycja(menu(), 'wieza')!.why).toBe('Wieża jest już postawiona.');
      expect(canPlace(st, w, 'wieza', 1, 1, 0).why).toBe('Wieża jest już postawiona.');
      ustawJezyk('en');
      expect(pozycja(menu(), 'wieza')!.why).toBe('The tower is up already.');
    } finally {
      delete BUILDS.wieza.juzStoi;
      ustawJezyk('pl');
    }
    // budowla bez limitu nigdy nie dostaje tego powodu
    expect(pozycja(menu(), 'warsztat')!.why).toMatch(/^Nie ma gdzie postawić/);
  });

  it('NOWE: budowle z odkrytych technologii, dopóki gracz ich nie postawi ani nie otworzy ich szczegółów', () => {
    const { st } = fresh();
    expect([...noweBudowle(st, new Set())]).toEqual([]);
    st.techDone = ['t_okna', 't_kozy', 't_wezel'];
    // technologia bez budowli (t_okna) nic nie daje, reszta tak
    expect([...noweBudowle(st, new Set())].sort()).toEqual(['kociol', 'koza_beczka']);
    expect([...noweBudowle(st, new Set(['kociol']))]).toEqual(['koza_beczka']);
    // postawiona albo zaplanowana przestaje być nowa
    st.builds.push({ id: 901, kind: 'kociol', x: 1, y: 1, rot: 0, need: {}, have: {}, work: 1, by: -1 });
    expect([...noweBudowle(st, new Set())]).toEqual(['koza_beczka']);
    st.builds = [];
    st.things.push({
      id: st.nextThing++,
      kind: 'koza_beczka',
      x: 1,
      y: 1,
      w: 1,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    expect([...noweBudowle(st, new Set())]).toEqual(['kociol']);
    // budowle bez technologii nigdy nie są nowe
    expect([...noweBudowle(st, new Set())].some((k) => !BUILDS[k as BuildKind].tech)).toBe(false);
  });

  it('NOWE w menu i na kafelku: tylko z podaną pamięcią widzianych, po polsku „NOWE”, po angielsku „NEW”', () => {
    const { st } = fresh();
    st.techDone = ['t_kozy', 't_wezel', 't_konserwy', 't_szklarnia'];
    const bez = buildMenu(bogaty, () => true, undefined, undefined, { st });
    expect(bez.flatMap((c) => c.items).some((b) => b.nowe)).toBe(false);
    const widziane = new Set<string>(['kociol']);
    const menu = buildMenu(bogaty, () => true, undefined, undefined, { st, widziane });
    expect(
      menu
        .flatMap((c) => c.items)
        .filter((b) => b.nowe)
        .map((b) => b.kind)
        .sort(),
    ).toEqual(['koza_beczka', 'szklarnia']);
    const dom = buildPanelHtml(menu, { tab: 'dom', kind: 'warsztat' }, false).body;
    expect(dom).toMatch(/data-kind="koza_beczka"[^>]*>(?:(?!<\/button>).)*<span class="tnew">NOWE<\/span>/);
    expect(dom).not.toMatch(/data-kind="kociol"[^>]*>(?:(?!<\/button>).)*tnew/);
    expect(dom).not.toMatch(/data-kind="warsztat"[^>]*>(?:(?!<\/button>).)*tnew/);
    ustawJezyk('en');
    expect(
      buildPanelHtml(
        buildMenu(bogaty, () => true, undefined, undefined, { st, widziane }),
        { tab: 'dom', kind: 'warsztat' },
        false,
      ).body,
    ).toContain('<span class="tnew">NEW</span>');
    ustawJezyk('pl');
    // zablokowana kłódką nigdy nie jest nowa (nie jest odkryta)
    pracownia(st);
    st.techDone = ['t_kozy'];
    const zKlodka = buildMenu(bogaty, () => true, undefined, undefined, { st, widziane: new Set() });
    expect(pozycja(zKlodka, 'szklarnia')).toMatchObject({ locked: expect.any(String) });
    expect(pozycja(zKlodka, 'szklarnia')!.nowe).toBeUndefined();
  });

  it('teksty działania nowych budowli zgadzają się z tym, co robią (wieża, pieczarkarnia, szklarnia)', () => {
    const slowa = wordsOf(BLOK);
    // wieża: posterunek na karcie nocy, połowa warty do każdego innego posterunku
    expect(effectOf('wieza', slowa)).toBe(
      'Posterunek „Warta na wieży” na karcie nocy: stojący tam dokłada połowę swojej warty do obrony każdego innego posterunku. Można mieć jedną.',
    );
    expect(BUILDS_EN.wieza.effect).toBe(
      'A “Watch on the tower” post on the Night orders: whoever stands there adds half their watch to the defence of every other post. You can have one.',
    );
    expect(TECH_BY.t_wieza.dzialanie.pl).toContain('„Warta na wieży”');
    expect(TECH_BY.t_wieza.dzialanie.en).toContain('“Watch on the tower”');
    // pieczarkarnia: 2 porcje co trzy doby przez cały rok, także zimą, kiedy ogródek nie rodzi; latem ogródek daje więcej
    expect(PIECZARKI_PLON).toBe(2);
    expect(GARDEN_YIELD[1]).toBe(0);
    expect(GARDEN_YIELD[3]).toBeGreaterThan(PIECZARKI_PLON);
    expect(effectOf('pieczarkarnia', slowa)).toBe(
      'Plon mniejszy niż w ogródku wiosną i latem, ale taki sam przez cały rok, także zimą.',
    );
    expect(BUILDS_EN.pieczarkarnia.effect).toBe(
      'A smaller yield than a vegetable patch in spring and summer, but the same all year round, winter included.',
    );
    expect(TECH_BY.t_grzyby.dzialanie.pl).toContain(effectOf('pieczarkarnia', slowa));
    expect(TECH_BY.t_grzyby.dzialanie.en).toContain(BUILDS_EN.pieczarkarnia.effect);
    // szklarnia: zimą jak jesienią (to zdanie zgadza się z plonem)
    expect(effectOf('szklarnia', slowa)).toBe('Jak ogródek, ale zimą rodzi jak jesienią.');
    expect(GARDEN_YIELD[0]).toBeGreaterThan(GARDEN_YIELD[1]);
  });

  it('trzy zakładki, każda budowla z kosztem, czasem pracy, działaniem i miejscem z BUILDS', () => {
    // po wszystkich badaniach: budowle z technologii są w menu, bez nich ich nie ma
    const bez = buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true).flatMap((c) =>
      c.items.map((b) => b.kind),
    );
    expect(bez.sort()).toEqual((Object.keys(BUILDS) as BuildKind[]).filter((k) => !BUILDS[k].tech).sort());
    const menu = buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true, undefined, undefined, {
      st: { techDone: ALL_TECH },
    });
    expect(menu.map((c) => c.title)).toEqual(['Dom', 'Podwórko', 'Obwód']);
    const all = menu.flatMap((c) => c.items);
    expect(all.map((b) => b.kind).sort()).toEqual((Object.keys(BUILDS) as BuildKind[]).sort());
    for (const b of all) {
      const d = BUILDS[b.kind];
      expect(b).toMatchObject({
        name: d.name,
        effect: effectOf(b.kind, wordsOf(BLOK)),
        size: `${d.w}×${d.h}`,
        cost: costText(d.cost),
        time: workText(d.work),
        ok: true,
      });
      for (const [m, n] of Object.entries(d.cost) as [Mat, number][])
        if (n > 0) expect(b.cost).toContain(`${MAT_NAME[m]} ${n}`);
    }
    expect(all.find((b) => b.kind === 'warsztat')!.place).toBe('w pokoju naszego mieszkania');
    expect(menu.find((c) => c.key === 'obwod')!.items.map((b) => b.kind)).toEqual(['zasieki', 'barykada']);
  });

  it('niedostępne wyszarzone z powodem: brak materiałów (z podpowiedzią skąd) albo miejsca', () => {
    const poor = buildMenu({ deski: 1 }, () => true)
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'warsztat')!;
    expect(poor.ok).toBe(false);
    expect(poor.why).toMatch(new RegExp(`^Brakuje: ${missing('warsztat', { deski: 1 })}\\. `));
    const k = buildMenu({ zlom: 999, czesci: 999 }, (kind) => kind !== 'kuchnia_spoleczna')
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'kuchnia_spoleczna')!;
    expect(k.why).toBe('Nie ma gdzie postawić: brak wolnego miejsca w kuchni naszego mieszkania.');
    // panel: przy zapasie dokładnie na warsztat szczegóły mają przycisk dla warsztatu, a magazyn (więcej desek) powód
    const have = BUILDS.warsztat.cost;
    expect(total('magazyn')).toBeGreaterThan(have.deski ?? 0);
    const html = buildPanelHtml(
      buildMenu(have, () => true),
      { tab: null, kind: null },
      false,
    ).body;
    expect(html).toContain('data-act="build" data-arg="warsztat"');
    expect(html).not.toContain('data-arg="magazyn"');
    expect(html).toContain(`Brakuje: ${missing('magazyn', have)}.`);
    expect(html).toContain('Lewy klik stawia plan, R obraca, prawy klik albo Esc anuluje.');
    expect(
      buildPanelHtml(
        buildMenu({}, () => true),
        { tab: null, kind: null },
        true,
      ).body,
    ).toContain('Stuknięcie stawia plan');
  });

  it('panel: zakładki, kafelki aktywnej zakładki z miniaturą i szczegóły z wybraną budowlą', () => {
    const menu = buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true);
    const r = buildPanelHtml(menu, { tab: null, kind: null }, false, undefined, undefined, (k) => `data:thumb/${k}`);
    expect(r.view).toEqual({ tab: 'dom', kind: 'warsztat' });
    for (const tab of ['dom', 'podworko', 'obwod']) expect(r.body).toContain(`data-tab="${tab}"`);
    const dom = menu.find((c) => c.key === 'dom')!;
    for (const b of dom.items) {
      expect(r.body).toContain(`class="tile`);
      expect(r.body).toContain(`data-kind="${b.kind}"`);
      expect(r.body).toContain(`src="data:thumb/${b.kind}"`);
    }
    expect(r.body).not.toContain('data-kind="ogrodek"');
    expect(r.body).toContain('aria-selected="true"');
    // szczegóły: widoczny tylko wybrany
    expect(r.body).toMatch(/<section class="bd" data-kind="warsztat">/);
    expect(r.body).toMatch(/<section class="bd" data-kind="magazyn" hidden>/);
    const yard = buildPanelHtml(menu, { tab: 'podworko', kind: null }, false);
    expect(yard.view).toEqual({ tab: 'podworko', kind: 'ogrodek' });
    expect(yard.body).toContain('data-kind="ogrodek"');
    expect(yard.body).not.toContain('data-kind="warsztat"');
  });

  it('panel: wybór spoza aktywnej zakładki wraca do pierwszej pozycji, a puste menu daje komunikat', () => {
    const menu = buildMenu({ deski: 999, zlom: 999, czesci: 999 }, () => true);
    expect(buildPanelHtml(menu, { tab: 'dom', kind: 'ogrodek' }, false).view).toEqual({ tab: 'dom', kind: 'warsztat' });
    expect(buildPanelHtml(menu, { tab: 'dom', kind: 'magazyn' }, false).view).toEqual({ tab: 'dom', kind: 'magazyn' });
    const none = buildPanelHtml([], { tab: 'dom', kind: 'warsztat' }, false);
    expect(none.view).toEqual({ tab: null, kind: null });
    expect(none.body).toContain('Na razie nic nie można zbudować.');
    expect(none.body).not.toContain('data-act="build"');
  });

  it('klucz zapasu panelu bierze tylko materiały z kosztów budowli: drewno z palenia i jedzenie go nie ruszają', () => {
    const have = { drewno: 5, deski: 20, zlom: 10, czesci: 4, jedzenie: 3, leki: 2 } as Record<Mat, number>;
    const k = stockKey(have);
    expect(stockKey({ ...have, drewno: 99, jedzenie: 0, leki: 7 })).toBe(k);
    for (const m of ['deski', 'zlom', 'czesci'] as Mat[]) expect(stockKey({ ...have, [m]: have[m] + 1 })).not.toBe(k);
  });

  it('klucz miejsc panelu: ruch rzeczy i wymiana na inną o tej samej liczbie go zmieniają, brak zmian nie', () => {
    const { st } = fresh();
    const k = placeKey(st);
    expect(placeKey(st)).toBe(k);
    const t = st.things[0];
    t.x += 1;
    expect(placeKey(st)).not.toBe(k);
    t.x -= 1;
    expect(placeKey(st)).toBe(k);
    const id = t.id;
    t.id = id + 100000;
    expect(placeKey(st)).not.toBe(k);
    t.id = id;
    st.techDone = ['t_test'];
    expect(placeKey(st)).not.toBe(k);
  });

  it('czas pracy w godzinach gry, także półtorej godziny', () => {
    expect(workText(TICKS_PER_HOUR)).toBe('1 h pracy');
    expect(workText(TICKS_PER_HOUR / 2)).toBe('30 min pracy');
    expect(workText((3 * TICKS_PER_HOUR) / 4)).toBe('45 min pracy');
    expect(workText((3 * TICKS_PER_HOUR) / 2)).toBe('1,5 h pracy');
    expect(workText((5 * TICKS_PER_HOUR) / 4)).toBe('1 h 15 min pracy');
    expect(workText(2 * TICKS_PER_HOUR)).toBe('2 h pracy');
  });
});

describe('dozwolone miejsca (canPlace symulacji)', () => {
  it.each(DEMOS)('%s: tryb stawiania podświetla dokładnie to, na co pozwala canPlace', (key) => {
    const { w, st } = fresh(key);
    // wszystkie badania zrobione, żeby canPlace oceniał też budowle z technologii, a nie tylko odmawiał
    st.techDone = ALL_TECH;
    const ours = ourApts(st);
    expect(ours).toContain(w.interior.home);
    // cokolwiek może stanąć tylko na siatce, podwórku, w pomieszczeniach naszych mieszkań albo na klatce (kocioł):
    // sprawdzam canPlace na każdym kafelku tego obszaru z zapasem, żeby kandydaci w allowedAnchors niczego nie gubili
    const region = [...w.fence.tiles, ...w.fence.yard];
    w.interior.room.forEach((r, i) => {
      if (r >= 0 && (ours.includes(w.interior.rooms[r].apt) || w.interior.rooms[r].kind === 'klatka')) region.push(i);
    });
    const xs = region.map((i) => i % w.size);
    const ys = region.map((i) => Math.floor(i / w.size));
    const x0 = Math.max(0, Math.min(...xs) - 4);
    const x1 = Math.min(w.size - 1, Math.max(...xs) + 4);
    const y0 = Math.max(0, Math.min(...ys) - 4);
    const y1 = Math.min(w.size - 1, Math.max(...ys) + 4);
    for (const kind of Object.keys(BUILDS) as BuildKind[])
      for (const rot of [0, 1] as const) {
        const all: number[] = [];
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (canPlace(st, w, kind, x, y, rot).ok) all.push(y * w.size + x);
        expect(
          allowedAnchors(st, w, kind, rot).sort((a, b) => a - b),
          `${kind} ${rot}`,
        ).toEqual(all);
      }
    // na każdym demie jest gdzie postawić zasieki, ogródek i warsztat
    for (const kind of ['zasieki', 'ogrodek', 'warsztat'] as const)
      expect(allowedAnchors(st, w, kind, 0).length + allowedAnchors(st, w, kind, 1).length, kind).toBeGreaterThan(0);
  });

  it('kafelki dla view.setPlacement: suma podstaw z dozwolonych zakotwiczeń, bez powtórzeń', () => {
    const { w, st } = fresh();
    for (const kind of ['warsztat', 'ogrodek', 'zasieki'] as const) {
      const anchors = allowedAnchors(st, w, kind, 1);
      const tiles = okTilesOf(anchors, kind, 1, w.size);
      expect(new Set(tiles).size).toBe(tiles.length);
      const { w: fw, h: fh } = footprint(kind, 1);
      for (const a of anchors)
        for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) expect(tiles).toContain(a + dy * w.size + dx);
    }
    expect(okTilesOf([0], 'ogrodek', 0, 100)).toEqual([0, 1, 2, 100, 101, 102]);
  });
});

describe('polecenia przy planach i budowlach', () => {
  it('plan: zaznaczeni biorą się do budowy albo go odwołują; gotową budowlę rozbiera się z potwierdzeniem', () => {
    const { w, st } = fresh();
    const sim = new Sim(w, st);
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    const x = a % w.size;
    const y = Math.floor(a / w.size);
    // plan bez zaznaczenia (zarząd wybierze sam), jak z trybu stawiania
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', x, y, rot: 0 });
    sim.step();
    const plan = st.builds.find((b) => b.kind === 'ogrodek')!;
    expect(plan).toMatchObject({ x, y, rot: 0 });
    const core = st.pawns.find((p) => p.kind === 'core')!;
    const stock = () => snapshot(st, w).stock;
    expect(buildItems(st, w, [], a, stock())).toEqual([]);
    // na starcie desek nie starczy na cały ogródek: symulacja nikogo by nie posłała, więc jest tylko odwołanie
    expect(stock().boards).toBeLessThan(BUILDS.ogrodek.cost.deski ?? 0);
    expect(buildItems(st, w, [core.id], a, stock()).map((i) => i.label)).toEqual(['Odwołać plan']);
    // sterty desek na podwórku (po 10, jak w składzie): teraz starczy
    const yard = w.fence.yard.filter(
      (i) => !st.things.some((t) => t.x === i % w.size && t.y === Math.floor(i / w.size)),
    );
    for (let n = BUILDS.ogrodek.cost.deski ?? 0, k = yard.length - 1; n > 0; n -= 10, k--)
      st.things.push({
        id: st.nextThing++,
        kind: 'deski',
        x: yard[k] % w.size,
        y: Math.floor(yard[k] / w.size),
        w: 1,
        h: 1,
        rot: 0,
        n: Math.min(10, n),
        fuel: 0,
        by: -1,
        owner: -1,
      });
    // kafelek w środku planu (ogródek 3×2), nie tylko lewy górny
    const items = buildItems(st, w, [core.id], a + w.size + 1, stock());
    expect(items.map((i) => i.label)).toEqual(['Budować ogródek', 'Odwołać plan']);
    expect(items[0]).toMatchObject({ quick: true, cmd: { t: 'build', ids: [core.id], kind: 'ogrodek', x, y, rot: 0 } });
    // symulacja przyjmuje oba polecenia: praca przy planie, a potem odwołanie
    sim.push(items[0].cmd);
    sim.step();
    expect(core.job?.t).toBe('build');
    sim.push(items[1].cmd);
    sim.step();
    expect(st.builds.some((b) => b.id === plan.id)).toBe(false);
    // gotowe zasieki na siatce: rozebrać, z potwierdzeniem
    const f = allowedAnchors(st, w, 'zasieki', 0)[0];
    st.things.push({
      ...st.things[0],
      id: 9001,
      kind: 'zasieki',
      x: f % w.size,
      y: Math.floor(f / w.size),
      w: 1,
      h: 1,
    });
    expect(buildItems(st, w, [core.id], f, stock())).toEqual([
      { cmd: { t: 'unbuild', ids: [core.id], id: 9001 }, label: 'Rozebrać zasieki', quick: false, confirm: true },
    ]);
  });
});

describe('mieszkania siedziby', () => {
  it.each(DEMOS)('%s: karta ze stanu gry (st.apts, st.damage) i liczb z odczytu (snapshot().apts)', (key) => {
    const { w, st } = fresh(key);
    const snap = snapshot(st, w);
    expect(st.apts.find((a) => a.apt === w.interior.home)).toMatchObject({ state: 'zarzad', ours: true });
    for (const a of st.apts) {
      const s = snap.apts.find((x) => x.apt === a.apt)!;
      const v = aptView(st, w, a.apt, snap.apts)!;
      expect(v).toMatchObject({
        state: a.state,
        ours: a.ours || a.state === 'zarzad',
        damaged: s.damaged,
        roomCount: s.rooms,
        searchedCount: s.searched,
      });
      // lista na karcie to te same pomieszczenia i uszkodzenia, które liczy symulacja
      expect(v.rooms.length).toBe(s.rooms);
      expect(v.damages.filter((d) => !d.fixed).length).toBe(s.damaged);
      if (a.state === 'puste') {
        expect(Object.keys(WHY_TEXT)).toContain(a.why);
        expect(a.year).toBeGreaterThanOrEqual(2026);
        expect(a.year).toBeLessThanOrEqual(2051);
      }
    }
  });

  it('karta pustego mieszkania: stan, powód, naprawy z kosztem z symulacji, przeszukane; potem w grze', () => {
    const { w, st } = fresh();
    const empty = st.apts.find((a) => a.state === 'puste' && st.damage.some((d) => d.apt === a.apt))!;
    expect(empty).toBeTruthy();
    let v = aptView(st, w, empty.apt, snapshot(st, w).apts)!;
    // klik w pokój tego mieszkania trafia w nie, w klatkę nie
    expect(aptAt(w, w.interior.room.indexOf(v.rooms[0].id))).toBe(empty.apt);
    const stair = w.interior.room.findIndex((r) => r >= 0 && w.interior.rooms[r].kind === 'klatka');
    if (stair >= 0) expect(aptAt(w, stair)).toBe(-1);
    let html = aptCard(v, false);
    expect(html).toContain(`<h2>Mieszkanie ${empty.apt + 1}</h2>`);
    expect(html).toContain(`Puste od ${empty.year}`);
    expect(html).toContain(WHY_TEXT[empty.why!](empty.year!));
    expect(html).toContain(`Do naprawy (${v.damaged})`);
    for (const d of v.damages) {
      expect(html).toContain(DAMAGE_NAME[d.kind]);
      expect(d.cost).toBe(costText(REPAIR[d.kind].cost));
      // id to indeks w st.damage, jak w poleceniu 'repair'
      expect(st.damage[d.id]).toMatchObject({ kind: d.kind, tile: d.tile, apt: empty.apt });
    }
    expect(html).toContain(`Przeszukane: 0 z ${v.roomCount}`);
    expect(html).toContain('Prawy przycisk w mieszkaniu: Przeszukać, Rozebrać, Naprawić, Zająć mieszkanie.');
    // w grze: mieszkanie zajęte, pierwszy pokój przeszukany, pierwsze uszkodzenie naprawione
    empty.ours = true;
    empty.searched.push(v.rooms[0].id);
    st.damage[v.damages[0].id].fixed = true;
    v = aptView(st, w, empty.apt, snapshot(st, w).apts)!;
    html = aptCard(v, true);
    expect(html).toContain(`Zajęte przez zarząd od ${empty.year}`);
    expect(html).toContain(`Przeszukane: 1 z ${v.roomCount}`);
    expect(v.damaged).toBe(v.damages.length - 1);
    expect(html).toContain(v.damaged ? `Do naprawy (${v.damaged})` : 'Do naprawy');
    expect(html).toContain('naprawione');
    expect(html).toContain('Przytrzymajcie palec w mieszkaniu');
  });
});

describe('plany budowy w menu', () => {
  it('menu odejmuje materiały zarezerwowane przez plany (potrzebne minus przyniesione)', () => {
    const { w, st } = fresh();
    const stock = snapshot(st, w).stock;
    expect(availableOf(st, stock)).toEqual(matsOf(stock));
    st.builds.push(
      {
        id: 1,
        kind: 'warsztat',
        x: 0,
        y: 0,
        rot: 0,
        need: { deski: 20, zlom: 10 },
        have: { deski: 5 },
        work: 0,
        by: -1,
      },
      { id: 2, kind: 'zasieki', x: 1, y: 0, rot: 0, need: { zlom: 10 }, have: { zlom: 10 }, work: 10, by: -1 },
    );
    expect(reservedOf(st)).toEqual({ deski: 15, zlom: 10 });
    const left = availableOf(st, stock);
    expect(left.deski).toBe(Math.max(0, stock.boards - 15));
    expect(left.zlom).toBe(Math.max(0, stock.scrap - 10));
    // desek tyle, ile na łóżka piętrowe, ale 15 z nich zabierze jeszcze plan warsztatu: łóżka wyszarzone
    const need = BUILDS.lozka_pietrowe.cost.deski ?? 0;
    expect(need).toBeGreaterThanOrEqual(15);
    const lozka = buildMenu(availableOf(st, { ...stock, boards: need }), () => true)
      .flatMap((c) => c.items)
      .find((b) => b.kind === 'lozka_pietrowe')!;
    expect(lozka.why).toMatch(/^Brakuje: deski 15\./);
  });
});

describe('cele drugiego dnia', () => {
  const day2 = (seed = 3): GovState => {
    const gov = newGov(seed);
    gov.reports.push({} as GovState['reports'][number]);
    return gov;
  };
  it('po pierwszym raporcie: przeszukać, pierwsza budowla (dowolna), obwód, drewno na noc', () => {
    const { st } = fresh();
    expect(isDay2(newGov(1))).toBe(false);
    const gov = day2();
    expect(isDay2(gov)).toBe(true);
    const o = { touch: false, wood: 3, woodReady: false, holes: 2 };
    let g = goalsDay2(st, gov, o);
    expect(g.map((x) => x.key)).toEqual(['przeszukaj', 'budowla', 'obwod', 'drewno2']);
    expect(g.every((x) => !x.done)).toBe(true);
    // podpowiedź wskazuje dwie budowle, które biorą najmniej materiału
    const cheap = (Object.keys(BUILDS) as BuildKind[]).sort((a, b) => total(a) - total(b)).slice(0, 2);
    for (const k of cheap) expect(g[1].how).toContain(`${BUILDS[k].name.toLowerCase()} (${costText(BUILDS[k].cost)})`);
    expect(g[2].how).toContain(`Zasieki w miejscu odcinka siatki (${costText(BUILDS.zasieki.cost)})`);
    expect(g[2].how).toContain('Otwartych dziur: 2.');
    expect(g[3].how).toBe(
      `Drewna na zapas: 3 z ${DAY2_WOOD}. Noc zjada około sztuki na godzinę, a przy kozie może ktoś czuwać.`,
    );
    // dowolna gotowa budowla zalicza „pierwszą budowlę”, ale nie obwód
    const empty = st.apts.find((a) => a.state === 'puste')!;
    empty.searched.push(5);
    st.things.push({ ...st.things[0], id: 9001, kind: 'magazyn' });
    g = goalsDay2(st, gov, o);
    expect(g.map((x) => x.done)).toEqual([true, true, false, false]);
    // zasieki i zapas drewna: wszystko
    st.things.push({ ...st.things[0], id: 9002, kind: 'zasieki' });
    g = goalsDay2(st, gov, { ...o, woodReady: true });
    expect(g.every((x) => x.done)).toBe(true);
    // obwód bez zasieków liczy się, gdy wszystkie dziury załatane; drewno przepada z kartą nocy
    st.things = st.things.filter((t) => t.kind !== 'zasieki');
    expect(goalsDay2(st, gov, { ...o, holes: 0 }).find((x) => x.key === 'obwod')?.done).toBe(true);
    gov.night = { confirmed: true } as GovState['night'];
    const late = goalsDay2(st, gov, o).find((x) => x.key === 'drewno2')!;
    expect(late).toMatchObject({ done: true, missed: true });
  });
});

describe('przybysze zza bramy', () => {
  it('komunikat z odmianą, dopóki ktoś jeszcze idzie od bramy', () => {
    expect(comingText(1)).toBe('1 osoba idzie od bramy');
    for (const n of [2, 3, 4, 22, 23, 24, 102]) expect(comingText(n)).toBe(`${n} osoby idą od bramy`);
    for (const n of [5, 11, 12, 13, 14, 15, 20, 21, 25, 112]) expect(comingText(n)).toBe(`${n} osób idzie od bramy`);
    const { w, st } = fresh();
    const before = st.pawns.length;
    expect(arriving(st)).toEqual([]);
    expect(addResidents(st, w, 3, true)).toBe(3);
    expect(arriving(st).map((p) => p.id)).toEqual(st.pawns.slice(before).map((p) => p.id));
    // po dojściu do mieszkań komunikat znika
    const sim = new Sim(w, st);
    for (let k = 0; k < 8 * TICKS_PER_HOUR && arriving(st).length; k++) sim.step();
    expect(arriving(st)).toEqual([]);
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
