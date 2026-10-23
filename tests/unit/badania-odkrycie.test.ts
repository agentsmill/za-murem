/* Karta „Odkrycie”, kronika odkryć i znalezionych książek, menu pracowni i pamięć znaczka NOWE
   (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Odkrycie” i „Książki”): `odkrycieSheet` (przyciski
   „Postaw <budowla>”, „Następne badanie”, „Dalej”, oba języki), dziennik znalezisk książek w symulacji (`bookLog`),
   odczyt `GovInput.odkrycia` i `znaleziska`, wpisy w kronice zarządu i zaufanie +1 raz na odkrycie (`govUpdate`),
   polecenia na pracowni w `commandsAt` (Badać, Tablica badań, miejsca przy stole) i pamięć NOWE w przeglądarce
   (`wczytajWidziane`, `zapiszWidziane`) z atrapą magazynu. Stan z createSim na Przymorzu, umiejętności ręcznie. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DOM_EN } from '../../src/content/data.en.ts';
import { BOOKS, DOM } from '../../src/content/data.ts';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { tekstKsiazki, tekstOdkrycia } from '../../src/gov/znaleziska.ts';
import { nazwaTech, SZANSA_KSIAZKI, TECH_BY } from '../../src/sim/badania.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { czyOtworzycSama, czyPokazacOdkrycie, napadTrwa, odkrycieSheet } from '../../src/ui/badania.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { NOWE_KEY, wczytajWidziane, zapiszWidziane, zapomnijWidziane } from '../../src/ui/nowe.ts';
import { buildWorld } from '../../src/world/world.ts';
import { mockBlockM2 } from './interior-mock.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

const SZANSE = { ...SZANSA_KSIAZKI };
afterEach(() => {
  ustawJezyk('pl');
  Object.assign(SZANSA_KSIAZKI, SZANSE);
});

const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

/** gotowa pracownia postawiona od razu (jak po finishBuild) */
function postawPracownie(st: SimState): Thing {
  const i = allowedAnchors(st, w, 'pracownia', 0)[0];
  const t: Thing = {
    id: st.nextThing++,
    kind: 'pracownia',
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: 2,
    h: 1,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

/** stan z zarządem bez umiejętności, żeby wiedza wynikała tylko z tego, co test ustawi */
function stan() {
  const st = createSim(w, seed, { core: 4 });
  for (const o of st.people) {
    o.skills = {};
    o.traits = [];
  }
  return st;
}

describe('odkrycieSheet: karta Odkrycie', () => {
  it('technologia z budowlą: „Postaw szklarnię”, „Następne badanie” i „Dalej”, w stylu kartki', () => {
    const s = odkrycieSheet('t_szklarnia');
    expect(s.tone).toBe('odkrycie');
    expect(s.closable).toBe(true);
    expect(s.title).toBe('Odkrycie: Szklarnie z folii');
    expect(s.body).toContain(TECH_BY.t_szklarnia.dzialanie.pl);
    // co odblokowuje
    expect(s.body).toContain('Odblokowuje: Szklarnia.');
    expect(s.foot).toMatch(/data-act="odkrycie-postaw" data-arg="szklarnia"[^>]*>Postaw szklarnię</);
    expect(s.foot).toMatch(/data-act="odkrycie-nastepne"[^>]*>Następne badanie</);
    expect(s.foot).toMatch(/data-act="odkrycie-dalej"[^>]*>Dalej</);
  });

  it('technologia bez budowli (premia) nie ma przycisku „Postaw”, a nazwa i opis są w karcie', () => {
    const s = odkrycieSheet('t_okna');
    expect(s.title).toBe('Odkrycie: Folia i koce w oknach');
    expect(s.body).toContain('+3°C w pomieszczeniach naszych mieszkań, za darmo.');
    expect(s.body).not.toContain('Odblokowuje');
    expect(s.foot).not.toContain('odkrycie-postaw');
    expect(s.foot).not.toContain('Postaw');
    expect(s.foot).toContain('Następne badanie');
    expect(s.foot).toContain('Dalej');
  });

  it('każda technologia z budowlą ma przycisk z jej biernikiem, a bez budowli nie ma żadnego', () => {
    const biernik: Record<string, string> = {
      koza_beczka: 'Postaw kozę z beczki',
      wieza: 'Postaw wieżę',
      barykada: 'Postaw barykadę',
      kociol: 'Postaw kocioł',
      szklarnia: 'Postaw szklarnię',
      pieczarkarnia: 'Postaw pieczarkarnię',
    };
    for (const t of Object.values(TECH_BY)) {
      const s = odkrycieSheet(t.id);
      const przyciski = [...s.foot.matchAll(/data-act="odkrycie-postaw" data-arg="([^"]+)"[^>]*>([^<]+)</g)];
      expect(
        przyciski.map((m) => [m[1], m[2]]),
        t.id,
      ).toEqual(t.odblokowuje.map((k) => [k, biernik[k]]));
    }
  });

  it('po angielsku: „Build the greenhouse”, „Next research”, „Continue”, nazwa i opis z tablicy', () => {
    ustawJezyk('en');
    const s = odkrycieSheet('t_szklarnia');
    expect(s.title).toBe(`Discovery: ${tr(nazwaTech('t_szklarnia'))}`);
    expect(s.body).toContain(tr(TECH_BY.t_szklarnia.dzialanie));
    expect(s.body).toContain('Unlocks: Greenhouse.');
    expect(s.foot).toMatch(/data-arg="szklarnia"[^>]*>Build the greenhouse</);
    expect(s.foot).toMatch(/data-act="odkrycie-nastepne"[^>]*>Next research</);
    expect(s.foot).toMatch(/data-act="odkrycie-dalej"[^>]*>Continue</);
    // żadnego polskiego napisu
    expect(`${s.kicker}${s.title}${s.body}${s.foot}`).not.toMatch(/Odkrycie|Postaw|Dalej|Następne/);
  });

  it('sieć bez miedzi w trybie zombie opisuje cichą sieć', () => {
    expect(odkrycieSheet('t_siec', 'zombie').body).toContain('cicha');
    expect(odkrycieSheet('t_siec').body).not.toContain('cicha');
  });

  it('nieznana technologia daje kartę bez przycisku „Postaw”, bez wyjątku', () => {
    const s = odkrycieSheet('t_nie_ma');
    expect(s.foot).not.toContain('odkrycie-postaw');
    expect(s.foot).toContain('Dalej');
  });
});

describe('kiedy karta Odkrycie się pokazuje (czyPokazacOdkrycie, napadTrwa)', () => {
  const spokoj = { oknoOtwarte: false, napad: false, alarm: false };

  it('pokazuje się tylko przy spokoju: bez innego okna lub tablicy, bez napadu i bez „Do broni!”', () => {
    expect(czyPokazacOdkrycie(spokoj)).toBe(true);
    // czeka na zamknięcie okna albo tablicy (jak dotąd)
    expect(czyPokazacOdkrycie({ ...spokoj, oknoOtwarte: true })).toBe(false);
    // czeka też na koniec napadu i „Do broni!”, tak jak samo otwarcie tablicy
    expect(czyPokazacOdkrycie({ ...spokoj, napad: true })).toBe(false);
    expect(czyPokazacOdkrycie({ ...spokoj, alarm: true })).toBe(false);
  });

  it('te same warunki napadu i alarmu co samo otwarcie tablicy', () => {
    const baza = { pracownia: true, cur: null, otwarta: false, oknoCzeka: false, byla: false };
    for (const [napad, alarm] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      expect(czyPokazacOdkrycie({ oknoOtwarte: false, napad, alarm }), `${napad}/${alarm}`).toBe(
        czyOtworzycSama({ ...baza, napad, alarm }),
      );
    }
  });

  it('napad trwa od zapowiedzi do rozstrzygnięcia (faza poniżej 3) i gdy szwendacze napierają na siatkę', () => {
    const st = createSim(w, seed, { core: 2 });
    expect(napadTrwa(st)).toBe(false);
    st.raid = {
      at: 0,
      post: 'brama',
      n: 3,
      attack: 5,
      phase: 0,
      outcome: '',
      gov: false,
      loot: { wood: 0, supplies: 0, scrap: 0 },
      took: { wood: 0, supplies: 0, scrap: 0 },
      from: -1,
      spot: -1,
    };
    for (const faza of [0, 1, 2]) {
      st.raid.phase = faza;
      expect(napadTrwa(st), `faza ${faza}`).toBe(true);
    }
    st.raid.phase = 3;
    expect(napadTrwa(st)).toBe(false);
    st.raid = null;
    expect(napadTrwa(st)).toBe(false);
    // szwendacz pod siatką (praca w fazie 2) to napór, w innej fazie nie
    const szwendacz = { kind: 'zombie', job: { phase: 1 } } as unknown as SimState['pawns'][number];
    st.pawns.push(szwendacz);
    expect(napadTrwa(st)).toBe(false);
    szwendacz.job!.phase = 2;
    expect(napadTrwa(st)).toBe(true);
  });
});

describe('dziennik znalezisk książek w symulacji (bookLog)', () => {
  const m = mockBlockM2();
  const room = m.interior.rooms.find((r) => r.apt === 2 && r.kind === 'pokoj')!.id;

  function przeszukaj(szansa: number, przed?: (st: SimState) => void) {
    SZANSA_KSIAZKI.mieszkanie = szansa;
    const st = createSim(m, 3, { core: 1 });
    przed?.(st);
    const sim = new Sim(m, st);
    const p = st.pawns.find((q) => q.kind === 'core')!;
    sim.push({ t: 'search', ids: [p.id], room });
    for (let k = 0; k < 6000 && !st.apts[2].searched.includes(room); k++) sim.step();
    expect(st.apts[2].searched).toEqual([room]);
    return st;
  }

  it('pole powstaje przy pierwszej książce z przeszukania: tick, dziedzina i tytuł; bez książki pola nie ma', () => {
    expect('bookLog' in przeszukaj(0)).toBe(false);
    const st = przeszukaj(1);
    const dom = Object.keys(st.books ?? {})[0] as keyof typeof DOM;
    expect(st.bookLog).toHaveLength(1);
    const wpis = st.bookLog![0];
    expect(wpis.dom).toBe(dom);
    expect(BOOKS[wpis.dom]).toContain(wpis.tytul);
    expect(wpis.tick).toBeGreaterThan(0);
    expect(wpis.tick).toBeLessThanOrEqual(st.tick);
    expect('podpalka' in wpis).toBe(false);
  });

  it('trzecia książka z tej samej dziedziny idzie do dziennika z adnotacją o podpałce', () => {
    const pierwsza = przeszukaj(1);
    const dom = pierwsza.bookLog![0].dom;
    const st = przeszukaj(1, (s) => {
      s.books = { [dom]: 2 };
    });
    expect(st.books).toEqual({ [dom]: 2 });
    expect(st.bookLog).toHaveLength(1);
    expect(st.bookLog![0]).toMatchObject({ dom, podpalka: true });
  });

  it('książka z wydarzenia zarządu (applyGov) nie trafia do dziennika: wydarzenie ma własny wpis', () => {
    const st = createSim(m, 3, { core: 1 });
    applyGov(st, m, { ...emptyEffects(), books: ['uprawa', 'med'] });
    expect(st.books).toEqual({ uprawa: 1, med: 1 });
    expect('bookLog' in st).toBe(false);
  });
});

describe('odczyt dla zarządu: odkrycia i znaleziska', () => {
  it('bez badań i bez książek wejście nie ma tych pól', () => {
    const i = govInput(stan(), w, 0);
    expect('odkrycia' in i).toBe(false);
    expect('znaleziska' in i).toBe(false);
  });

  it('odkrycia od najstarszego, z nazwą i działaniem w obu językach; w trybie zombie działanie zombie', () => {
    const st = stan();
    st.techDone = ['t_okna', 't_kozy'];
    st.research = { cur: null, prog: {}, at: { t_okna: 900, t_kozy: 400 } };
    const i = govInput(st, w, 0);
    expect(i.odkrycia).toEqual([
      { id: 't_kozy', tick: 400, nazwa: nazwaTech('t_kozy'), dzialanie: TECH_BY.t_kozy.dzialanie },
      { id: 't_okna', tick: 900, nazwa: nazwaTech('t_okna'), dzialanie: TECH_BY.t_okna.dzialanie },
    ]);
    const z = createSim(w, seed, { core: 4, mode: 'zombie' });
    z.research = { cur: null, prog: {}, at: { t_siec: 5 } };
    expect(govInput(z, w, 0).odkrycia![0].dzialanie).toEqual(
      TECH_BY.t_siec.dzialanieZombie ?? TECH_BY.t_siec.dzialanie,
    );
  });

  it('znaleziska z dziennika książek, kopią (zarząd niczego nie zmieni w stanie)', () => {
    const st = stan();
    st.bookLog = [{ tick: 70, dom: 'uprawa', tytul: BOOKS.uprawa[0], podpalka: true }];
    const i = govInput(st, w, 0);
    expect(i.znaleziska).toEqual([{ tick: 70, dom: 'uprawa', tytul: BOOKS.uprawa[0], podpalka: true }]);
    i.znaleziska![0].tick = 1;
    expect(st.bookLog[0].tick).toBe(70);
  });
});

describe('kronika zarządu: odkrycia i książki', () => {
  const ksiazka = { tick: 50, dom: 'uprawa' as const, tytul: BOOKS.uprawa[0] };

  it('teksty: odkrycie z działaniem, książka na półkę i książka na podpałkę, w obu językach', () => {
    const o = tekstOdkrycia({ nazwa: nazwaTech('t_okna'), dzialanie: TECH_BY.t_okna.dzialanie });
    expect(o.pl).toBe('Odkrycie: Folia i koce w oknach. +3°C w pomieszczeniach naszych mieszkań, za darmo.');
    expect(o.en).toBe(`Discovery: ${nazwaTech('t_okna').en}. +3°C in the rooms of your flats, free of charge.`);
    expect(tekstKsiazki(ksiazka)).toEqual({
      pl: 'Znaleźli książkę „Ogród na balkonie” (Uprawa +1).',
      en: 'Found a book: “The Balcony Garden” (Farming +1).',
    });
    expect(tekstKsiazki({ ...ksiazka, tytul: BOOKS.uprawa[2], podpalka: true })).toEqual({
      pl: 'Znaleźli książkę „Uprawa warzyw pod osłonami”, ale Uprawa ma już dwie książki. Poszła na podpałkę.',
      en: 'Found a book: “Growing Vegetables Under Cover”, but Farming already has two. It went for kindling.',
    });
    expect(DOM.uprawa).toBe('Uprawa');
    expect(DOM_EN.uprawa).toBe('Farming');
  });

  /** dwa zarządy z tego samego ziarna: jeden dostaje wejście z odkryciem i książką, drugi bez nich */
  function para() {
    const st = stan();
    const bez = govInput(st, w, 0);
    st.techDone = ['t_okna'];
    st.research = { cur: null, prog: {}, at: { t_okna: 600 } };
    st.bookLog = [ksiazka];
    const z = govInput(st, w, 0);
    return { a: newGov(seed), b: newGov(seed), bez, z, st };
  }

  it('odkrycie: wpis w kronice i zaufanie +1 raz na odkrycie, książka tylko wpis', () => {
    const { a, b, bez, z } = para();
    govUpdate(a, bez);
    const fx = govUpdate(b, z);
    expect(b.trust - a.trust).toBe(1);
    const linie = b.log.slice(a.log.length).map((l) => tr(l.txt));
    expect(linie).toEqual([
      'Znaleźli książkę „Ogród na balkonie” (Uprawa +1).',
      'Odkrycie: Folia i koce w oknach. +3°C w pomieszczeniach naszych mieszkań, za darmo.',
    ]);
    // odkrycie jest ważnym wpisem, książka zwykłym
    expect(b.log.slice(a.log.length).map((l) => l.big)).toEqual([false, true]);
    // tylko kronika: podpowiedź i kartę pokazuje interfejs, zarząd nie dokłada drugiej podpowiedzi
    expect(fx.log.map((t) => tr(t))).toEqual([]);
    // drugi krok z tym samym wejściem: nic nowego
    const zaufanie = b.trust;
    const dlugosc = b.log.length;
    govUpdate(b, z);
    expect(b.trust).toBe(zaufanie);
    expect(b.log).toHaveLength(dlugosc);
  });

  it('pamięć „ostatnio przeczytanego” powstaje przy pierwszym wpisie, bez wpisów pola nie ma', () => {
    const { a, b, bez, z } = para();
    govUpdate(a, bez);
    expect('czytane' in a).toBe(false);
    govUpdate(b, z);
    expect(b.czytane).toBe(600);
  });

  it('nowe odkrycie po przeczytanych dopisuje się osobno, a stary zapis zarządu bez pola działa', () => {
    const { b, z, st } = para();
    govUpdate(b, z);
    const zaufanie = b.trust;
    st.techDone!.push('t_kozy');
    st.research!.at.t_kozy = 900;
    govUpdate(b, govInput(st, w, 0));
    expect(b.trust - zaufanie).toBe(1);
    expect(tr(b.log[b.log.length - 1].txt)).toMatch(/^Odkrycie: Kozy w mieszkaniach\. /);
    expect(b.czytane).toBe(900);
  });

  it('wpisy po angielsku w kronice', () => {
    const { b, z } = para();
    govUpdate(b, z);
    ustawJezyk('en');
    const linie = b.log.slice(-2).map((l) => tr(l.txt));
    expect(linie[0]).toBe('Found a book: “The Balcony Garden” (Farming +1).');
    expect(linie[1]).toMatch(/^Discovery: Plastic sheeting and blankets on the windows\. /);
  });

  it('gra bez badań i książek: stan zarządu bez nowych pól po wielu krokach', () => {
    const g = newGov(seed);
    const st = stan();
    for (let k = 0; k < 5; k++) govUpdate(g, govInput(st, w, k));
    expect('czytane' in g).toBe(false);
  });
});

describe('menu pracowni (commandsAt)', () => {
  /** pracownia z wyborem badania t_spawanie (Budowa 2 ma pierwsza osoba, t_okna zbadane) */
  function zLab() {
    const st = stan();
    st.people[rdzen(st)[0].person].skills = { bud: 2 };
    const lab = postawPracownie(st);
    st.techDone = ['t_okna'];
    st.research = { cur: 't_spawanie', prog: {}, at: { t_okna: 1 } };
    const tile = lab.y * w.size + lab.x;
    return { st, lab, tile, ids: rdzen(st).map((p) => p.id) };
  }
  const etykiety = (st: SimState, ids: number[], tile: number) => commandsAt(st, w, ids, tile).map((m) => m.label);

  it('z wyborem badania: „Badać: <nazwa>” (polecenie study) i „Tablica badań”', () => {
    const { st, lab, tile, ids } = zLab();
    const items = commandsAt(st, w, ids, tile);
    const badac = items.find((m) => m.label === 'Badać: Spawanie z akumulatorów')!;
    expect(badac.cmd).toEqual({ t: 'study', ids, thing: lab.id });
    expect(badac.quick).toBe(false);
    expect(badac.off).toBeUndefined();
    const tablica = items.find((m) => m.label === 'Tablica badań')!;
    expect(tablica.cmd.t).toBe('tablica');
    expect(items.some((m) => m.label === 'Wybrać badanie')).toBe(false);
    ustawJezyk('en');
    expect(etykiety(st, ids, tile)).toEqual(
      expect.arrayContaining([`Research: ${tr(nazwaTech('t_spawanie'))}`, 'Research board']),
    );
  });

  it('bez wybranego badania: „Wybrać badanie” otwiera tablicę, bez „Badać”', () => {
    const { st, tile, ids } = zLab();
    st.research!.cur = null;
    const items = commandsAt(st, w, ids, tile);
    expect(items.find((m) => m.label === 'Wybrać badanie')?.cmd.t).toBe('tablica');
    expect(items.some((m) => m.cmd.t === 'study')).toBe(false);
    ustawJezyk('en');
    expect(etykiety(st, ids, tile)).toContain('Choose research');
  });

  it('bez pracowni na kafelku, bez zaznaczonego zarządu i na innym kafelku nie ma tych pozycji', () => {
    const { st, tile, ids } = zLab();
    const inne = commandsAt(st, w, ids, tile + 10 * w.size);
    expect(inne.some((m) => m.cmd.t === 'study' || m.cmd.t === 'tablica')).toBe(false);
    expect(commandsAt(st, w, [], tile)).toEqual([]);
    st.things = st.things.filter((t) => t.kind !== 'pracownia');
    expect(commandsAt(st, w, ids, tile).some((m) => m.cmd.t === 'study' || m.cmd.t === 'tablica')).toBe(false);
  });

  it('oba miejsca zajęte przez innych: „Badać” zostaje, wyszarzone z „Przy stole nie ma miejsca.”', () => {
    const { st, lab, tile } = zLab();
    st.people[rdzen(st)[1].person].skills = { bud: 1 };
    const sim = new Sim(w, st);
    const [a, b, c, e] = rdzen(st);
    expect(sim.startResearch(b, true)).toBe(true);
    expect(sim.startResearch(c, true)).toBe(true);
    const badac = (ids: number[]) => commandsAt(st, w, ids, tile).find((m) => m.cmd.t === 'study')!;
    expect(badac([a.id])).toMatchObject({ label: 'Badać: Spawanie z akumulatorów', off: 'Przy stole nie ma miejsca.' });
    expect(badac([a.id]).cmd).toEqual({ t: 'study', ids: [a.id], thing: lab.id });
    expect(badac([e.id]).off).toBe('Przy stole nie ma miejsca.');
    ustawJezyk('en');
    expect(badac([a.id]).off).toBe('No free seat at the table.');
    ustawJezyk('pl');
    // siedzący przy stole mogą dalej dostać polecenie: ich własne miejsce się nie liczy
    expect(badac([b.id]).off).toBeUndefined();
    expect(badac([b.id, c.id]).off).toBeUndefined();
    // jedno wolne miejsce wystarcza
    b.job = null;
    expect(badac([a.id]).off).toBeUndefined();
  });

  it('badanie stanęło bez wiedzy: „Badać” wyszarzone z powodem, nie znika', () => {
    const { st, tile, ids } = zLab();
    st.people[rdzen(st)[0].person].skills = {};
    const badac = commandsAt(st, w, ids, tile).find((m) => m.cmd.t === 'study')!;
    expect(badac.off).toBe('Brakuje wiedzy w osadzie.');
    ustawJezyk('en');
    expect(commandsAt(st, w, ids, tile).find((m) => m.cmd.t === 'study')!.off).toBe('The estate lacks the know-how.');
  });

  it('polecenie „tablica” nie zmienia stanu symulacji (otwiera tylko tablicę w interfejsie)', () => {
    const z = zLab();
    const sim = new Sim(w, z.st);
    sim.push({ t: 'tablica', ids: z.ids });
    sim.step();
    const bez = zLab();
    new Sim(w, bez.st).step();
    expect(JSON.stringify(z.st)).toBe(JSON.stringify(bez.st));
  });
});

describe('pamięć znaczka NOWE w przeglądarce', () => {
  /** atrapa magazynu: mapa napisów jak localStorage */
  function magazyn(start: Record<string, string> = {}) {
    const dane = new Map(Object.entries(start));
    return {
      dane,
      getItem: (k: string) => dane.get(k) ?? null,
      setItem: (k: string, v: string) => void dane.set(k, v),
      removeItem: (k: string) => void dane.delete(k),
    };
  }

  it('zapis i odczyt po kluczu gry, osobno dla każdej gry', () => {
    const m = magazyn();
    expect(wczytajWidziane('gra1', m).size).toBe(0);
    zapiszWidziane('gra1', new Set(['kociol', 'wieza']), m);
    zapiszWidziane('gra2', new Set(['szklarnia']), m);
    expect([...wczytajWidziane('gra1', m)].sort()).toEqual(['kociol', 'wieza']);
    expect([...wczytajWidziane('gra2', m)]).toEqual(['szklarnia']);
    zapomnijWidziane('gra1', m);
    expect(wczytajWidziane('gra1', m).size).toBe(0);
    expect([...wczytajWidziane('gra2', m)]).toEqual(['szklarnia']);
  });

  it('puste zbiory nie zostawiają śladu, a obce wpisy w magazynie zostają', () => {
    const m = magazyn({ inny: 'x' });
    zapiszWidziane('gra1', new Set(), m);
    expect(m.dane.has(NOWE_KEY)).toBe(false);
    expect(m.dane.get('inny')).toBe('x');
    zapiszWidziane('gra1', new Set(['kociol']), m);
    zapomnijWidziane('gra1', m);
    expect(m.dane.has(NOWE_KEY)).toBe(false);
  });

  it('uszkodzony JSON, zły kształt i nieznane rodzaje budowli to brak wpisu, bez wyjątku', () => {
    expect(wczytajWidziane('g', magazyn({ [NOWE_KEY]: '{nie json' })).size).toBe(0);
    expect(wczytajWidziane('g', magazyn({ [NOWE_KEY]: '[1,2]' })).size).toBe(0);
    expect(wczytajWidziane('g', magazyn({ [NOWE_KEY]: JSON.stringify({ g: 'kociol' }) })).size).toBe(0);
    const m = magazyn({ [NOWE_KEY]: JSON.stringify({ g: ['kociol', 'nie_ma_takiej', 7] }) });
    expect([...wczytajWidziane('g', m)]).toEqual(['kociol']);
  });

  it('przeglądarka bez dostępu do pamięci (null albo wyjątki) nie przerywa gry', () => {
    const rzuca = {
      getItem: () => {
        throw new Error('zablokowane');
      },
      setItem: () => {
        throw new Error('zablokowane');
      },
      removeItem: () => {
        throw new Error('zablokowane');
      },
    };
    expect(wczytajWidziane('g', rzuca).size).toBe(0);
    expect(() => zapiszWidziane('g', new Set(['kociol']), rzuca)).not.toThrow();
    expect(() => zapomnijWidziane('g', rzuca)).not.toThrow();
    expect(wczytajWidziane('g', null).size).toBe(0);
    expect(() => zapiszWidziane('g', new Set(['kociol']), null)).not.toThrow();
    expect(() => zapomnijWidziane('g', null)).not.toThrow();
  });
});
