/* Książki z przeszukania i jedna wiedza dla tablicy i zarządu (docs/superpowers/specs/2026-10-19-badania-design.md,
   sekcje „Książki” i „Dane”): losowanie książki z osobnego generatora, półka z limitem 2 i podpałka z trzeciej,
   przeszukanie w siedzibie i u sąsiadów, odczyt dla zarządu (`GovInput.badania`, `books`, `techDone`, `know`),
   wydarzenie „książki” kończące się w symulacji i przeniesienie książek ze starego stanu zarządu. Szansę na książkę
   (SZANSA_KSIAZKI) test zmienia na czas jednego przebiegu, żeby nie szukać ziarna, które trafi; po teście wraca. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BOOKS, TECH_DOMS, type TechDom } from '../../src/content/data.ts';
import { tr } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { eventView } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { dodajKsiazke, ksiazkaZ, SZANSA_KSIAZKI } from '../../src/sim/badania.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { gid, mieszkaniaZaDrzwiami, wnetrze } from '../../src/sim/sasiedzi.ts';
import { createSim, Sim, type SimState } from '../../src/sim/sim.ts';
import { wreckRng } from '../../src/sim/surowce.ts';
import { buildWorld } from '../../src/world/world.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { demoWorld, doorWhere, newGame, pusto, until, core as zarzadSim } from './sasiedzi-pomoc.ts';

const SZANSE = { ...SZANSA_KSIAZKI };
afterEach(() => {
  Object.assign(SZANSA_KSIAZKI, SZANSE);
});

const wood = (st: SimState) => st.things.filter((t) => t.kind === 'drewno').reduce((a, t) => a + t.n, 0);
const sumaKsiazek = (st: SimState) => Object.values(st.books ?? {}).reduce((a, n) => a + (n ?? 0), 0);
/** skrót stanu bez książek i ich dziennika znalezisk: reszta stanu po przeszukaniu z książką ma się nie różnić od
    przeszukania bez niej */
const bezKsiazek = (st: SimState) => hashString(JSON.stringify({ ...st, books: undefined, bookLog: undefined }));

describe('ksiazkaZ: losowanie z osobnego generatora', () => {
  const seed = 2051;
  const klucze = [...Array(3000).keys()];

  it('jest deterministyczna, a inne ziarno albo klucz daje inny rozkład', () => {
    for (const k of klucze.slice(0, 200)) expect(ksiazkaZ(seed, k, 0.5)).toEqual(ksiazkaZ(seed, k, 0.5));
    const wzor = (s: number) => klucze.slice(0, 300).map((k) => ksiazkaZ(s, k, 0.5)?.tytul ?? null);
    expect(wzor(seed)).toEqual(wzor(seed));
    expect(wzor(seed + 1)).not.toEqual(wzor(seed));
    // sąsiednie klucze nie dają tej samej książki: wynik zależy od klucza
    expect(new Set(wzor(seed)).size).toBeGreaterThan(10);
  });

  it('z szansą 1 zawsze książka z BOOKS wybranej dziedziny, ze wszystkich sześciu dziedzin', () => {
    const widziane = new Set<TechDom>();
    for (const k of klucze) {
      const b = ksiazkaZ(seed, k, 1);
      expect(b).not.toBeNull();
      expect(TECH_DOMS).toContain(b!.dom);
      expect(BOOKS[b!.dom]).toContain(b!.tytul);
      widziane.add(b!.dom);
    }
    expect([...widziane].sort()).toEqual([...TECH_DOMS].sort());
  });

  it('z szansą 0 nigdy, a domyślnie około 12% pomieszczeń', () => {
    for (const k of klucze) expect(ksiazkaZ(seed, k, 0)).toBeNull();
    const trafione = klucze.filter((k) => ksiazkaZ(seed, k) !== null).length;
    expect(trafione).toBeGreaterThan(0.09 * klucze.length);
    expect(trafione).toBeLessThan(0.15 * klucze.length);
    expect(ksiazkaZ(seed, 7)).toEqual(ksiazkaZ(seed, 7, SZANSA_KSIAZKI.mieszkanie));
  });

  it('nie powtarza losowania łupu wraku (inna stała niż wreckRng)', () => {
    const trafiaWrak = (k: number) => wreckRng(seed, k)() < 0.12;
    const trafiaKsiazka = (k: number) => ksiazkaZ(seed, k) !== null;
    expect(klucze.filter((k) => trafiaWrak(k) === trafiaKsiazka(k)).length).toBeLessThan(klucze.length);
  });
});

describe('dodajKsiazke: półka do 2, trzecia na podpałkę', () => {
  it('pole books powstaje przy pierwszej książce, trzecia z dziedziny go nie zwiększa', () => {
    const st = createSim(mockBlockM2(), 3, { core: 1 });
    expect('books' in st).toBe(false);
    expect(dodajKsiazke(st, 'elek')).toBe('polka');
    expect(st.books).toEqual({ elek: 1 });
    expect(dodajKsiazke(st, 'med')).toBe('polka');
    expect(dodajKsiazke(st, 'elek')).toBe('polka');
    expect(st.books).toEqual({ elek: 2, med: 1 });
    expect(dodajKsiazke(st, 'elek')).toBe('podpalka');
    expect(st.books).toEqual({ elek: 2, med: 1 });
  });
});

describe('przeszukanie pokoju w siedzibie', () => {
  const w = mockBlockM2();
  const h = w.interior;
  const room = h.rooms.find((r) => r.apt === 2 && r.kind === 'pokoj')!.id;

  /** przeszukanie pokoju pustego mieszkania; przed: zmiana świeżego stanu, szansa: SZANSA_KSIAZKI.mieszkanie */
  function przeszukaj(szansa: number, przed?: (st: SimState) => void) {
    SZANSA_KSIAZKI.mieszkanie = szansa;
    const st = createSim(w, 3, { core: 1 });
    przed?.(st);
    const sim = new Sim(w, st);
    const p = st.pawns.find((q) => q.kind === 'core')!;
    sim.push({ t: 'search', ids: [p.id], room });
    for (let k = 0; k < 6000 && !st.apts[2].searched.includes(room); k++) sim.step();
    expect(st.apts[2].searched).toEqual([room]);
    return st;
  }

  it('z szansą 1 książka z ziarna i pomieszczenia trafia do st.books, bez szansy pola nie ma', () => {
    const z = przeszukaj(1);
    const oczekiwana = ksiazkaZ(z.seed, room, 1)!;
    expect(z.books).toEqual({ [oczekiwana.dom]: 1 });
    expect(przeszukaj(0).books).toBeUndefined();
  });

  it('rzut jest z osobnego generatora: st.rng i reszta stanu jak po przeszukaniu bez książki', () => {
    const z = przeszukaj(1);
    const bez = przeszukaj(0);
    expect(sumaKsiazek(z)).toBe(1);
    expect(sumaKsiazek(bez)).toBe(0);
    expect(z.rng).toEqual(bez.rng);
    expect(bezKsiazek(z)).toBe(bezKsiazek(bez));
    // ten sam przebieg dwa razy daje tę samą książkę
    expect(przeszukaj(1).books).toEqual(z.books);
  });

  it('trzecia książka z tej samej dziedziny zostaje na dwóch i daje jedno drewno więcej', () => {
    const dom = ksiazkaZ(3, room, 1)!.dom;
    const bez = przeszukaj(0, (st) => {
      st.books = { [dom]: 2 };
    });
    const z = przeszukaj(1, (st) => {
      st.books = { [dom]: 2 };
    });
    expect(z.books).toEqual({ [dom]: 2 });
    expect(wood(z) - wood(bez)).toBe(1);
    // poniżej limitu drewna nie przybywa
    const polka = przeszukaj(1, (st) => {
      st.books = { [dom]: 1 };
    });
    expect(polka.books).toEqual({ [dom]: 2 });
    expect(wood(polka)).toBe(wood(bez));
  });

  it('podpałka leży przy pracowni, a bez niej przy składzie', () => {
    const dom = ksiazkaZ(3, room, 1)!.dom;
    const size = w.size;
    const odleglosc = (t: { x: number; y: number }, i: number) =>
      Math.max(Math.abs(t.x - (i % size)), Math.abs(t.y - Math.floor(i / size)));
    const nowaSterta = (z: SimState, bez: SimState) =>
      z.things.find((t) => t.kind === 'drewno' && !bez.things.some((q) => q.id === t.id && q.n === t.n))!;

    const kafelek = h.room.findIndex(
      (r, i) => r === h.rooms.find((q) => q.apt === 0 && q.kind === 'pokoj')!.id && !w.blocked[i],
    );
    const stawiajPracownie = (st: SimState) => {
      st.books = { [dom]: 2 };
      st.things.push({
        id: st.nextThing++,
        kind: 'pracownia',
        x: kafelek % size,
        y: Math.floor(kafelek / size),
        w: 2,
        h: 1,
        rot: 0,
        n: 0,
        fuel: 0,
        by: -1,
        owner: -1,
      });
    };
    const zPrac = przeszukaj(1, stawiajPracownie);
    const bezPrac = przeszukaj(0, stawiajPracownie);
    expect(wood(zPrac) - wood(bezPrac)).toBe(1);
    expect(odleglosc(nowaSterta(zPrac, bezPrac), kafelek)).toBeLessThanOrEqual(3);

    const zSkladem = przeszukaj(1, (st) => {
      st.books = { [dom]: 2 };
    });
    const bezSkladu = przeszukaj(0, (st) => {
      st.books = { [dom]: 2 };
    });
    expect(wood(zSkladem) - wood(bezSkladu)).toBe(1);
    expect(odleglosc(nowaSterta(zSkladem, bezSkladu), h.sklad[0])).toBeLessThanOrEqual(3);
  });
});

describe('przeszukanie u sąsiada', () => {
  /** gra z otwartym blokiem bez lokatorów i osobą w środku (jak w sasiedzi-sim.test.ts) */
  function otwarty(cls: readonly string[], drzwi: 'zamkniete' | 'wywazone' = 'zamkniete') {
    const w = demoWorld('lanciego');
    const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === drzwi && !s.k, cls);
    const sim = newGame('lanciego');
    sim.lokatorzy = pusto(w);
    const p = zarzadSim(sim)[0];
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door' && p.job?.t !== 'go');
    const k = sim.st.sasiedzi!.budynki.findIndex((x) => x.bid === bid);
    return { w, sim, p, bid, k, door };
  }

  it('puste mieszkanie: książka z klucza gid(k + 1, pokój), raz na pomieszczenie', () => {
    SZANSA_KSIAZKI.mieszkanie = 1;
    const { w, sim, p, bid, k, door } = otwarty(['blok']);
    const it0 = wnetrze(w, bid);
    const behind = mieszkaniaZaDrzwiami(w, bid, door);
    const room =
      it0.rooms.find((r) => behind.has(r.apt) && r.kind === 'kuchnia') ?? it0.rooms.find((r) => behind.has(r.apt))!;
    const przed = sumaKsiazek(sim.st);
    sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
    sim.step();
    until(sim, () => p.job?.t !== 'loot');
    const oczekiwana = ksiazkaZ(sim.st.seed, gid(k + 1, room.id), 1)!;
    expect(sim.st.books?.[oczekiwana.dom]).toBe(1);
    expect(sumaKsiazek(sim.st) - przed).toBe(1);
    // drugi raz to samo pomieszczenie: nic się nie dzieje
    sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
    sim.step();
    expect(sumaKsiazek(sim.st) - przed).toBe(1);
  });

  it('bez szansy pola books nie ma, a rzut nie rusza st.rng', () => {
    const wynik = (szansa: number) => {
      SZANSA_KSIAZKI.mieszkanie = szansa;
      const { w, sim, p, bid, door } = otwarty(['blok']);
      const it0 = wnetrze(w, bid);
      const behind = mieszkaniaZaDrzwiami(w, bid, door);
      const room = it0.rooms.find((r) => behind.has(r.apt))!;
      sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
      sim.step();
      until(sim, () => p.job?.t !== 'loot');
      return sim.st;
    };
    const z = wynik(1);
    const bez = wynik(0);
    expect(bez.books).toBeUndefined();
    expect(sumaKsiazek(z)).toBe(1);
    expect(z.rng).toEqual(bez.rng);
    expect(bezKsiazek(z)).toBe(bezKsiazek(bez));
  });

  it('sala w szkole ma własną szansę, a inna usługa u sąsiada książek nie daje', () => {
    SZANSA_KSIAZKI.mieszkanie = 0;
    SZANSA_KSIAZKI.szkola = 1;
    const sala = (cls: readonly string[], drzwi: 'zamkniete' | 'wywazone') => {
      const { w, sim, p, bid } = otwarty(cls, drzwi);
      const it0 = wnetrze(w, bid);
      const room = it0.rooms.find((r) => r.apt < 0 && r.kind === 'sala')!;
      sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
      sim.step();
      until(sim, () => p.job?.t !== 'loot');
      return sumaKsiazek(sim.st);
    };
    expect(sala(['szkola'], 'wywazone')).toBe(1);
    expect(sala(['sklep'], 'zamkniete')).toBe(0);
  });
});

describe('odczyt dla zarządu: badania, książki, technologie i wiedza', () => {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
  const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
  const w = buildWorld(d.geo, { seed, street: d.street });
  const stan = () => {
    const st = createSim(w, seed, { core: 4 });
    for (const o of st.people) o.skills = {};
    return st;
  };

  it('badania: era 0 bez badań, po t_okna era 1, końcowa fałsz', () => {
    const st = stan();
    expect(govInput(st, w, 0).badania).toEqual({
      pracownia: false,
      zbadane: 0,
      era: 0,
      koncowa: false,
      siecWlaczona: false,
    });
    st.techDone = ['t_okna'];
    expect(govInput(st, w, 0).badania).toEqual({
      pracownia: false,
      zbadane: 1,
      era: 1,
      koncowa: false,
      siecWlaczona: false,
    });
    expect(govInput(st, w, 0).techDone).toEqual(['t_okna']);
  });

  it('know liczy lokatora siedziby i książki z symulacji, books i techDone idą z symulacji', () => {
    const st = stan();
    expect(govInput(st, w, 0).know).toEqual({ bud: 0, cieplo: 0, elek: 0, med: 0, uprawa: 0, it: 0 });
    const lokator = st.pawns.find((q) => q.kind === 'resident' && q.person < 0)!;
    st.people.push({ ...structuredClone(st.people[0]), id: 'lok', skills: { cieplo: 2 } });
    lokator.person = st.people.length - 1;
    st.books = { cieplo: 1, med: 2 };
    const i = govInput(st, w, 0);
    expect(i.know).toEqual({ bud: 0, cieplo: 3, elek: 0, med: 2, uprawa: 0, it: 0 });
    expect(i.books).toEqual({ cieplo: 1, med: 2 });
    // zarząd widzi to samo, co tablica
    expect(i.people.every((p) => (p.skills.cieplo ?? 0) === 0)).toBe(true);
  });

  it('host wydarzeń bierze know, tech i bookCount z odczytu symulacji', async () => {
    const { makeHost } = await import('../../src/gov/wydarzenia.ts');
    const { emptyEffects } = await import('../../src/gov/wspolne.ts');
    const st = stan();
    st.techDone = ['t_kozy'];
    st.books = { elek: 1 };
    const lokator = st.pawns.find((q) => q.kind === 'resident' && q.person < 0)!;
    st.people.push({ ...structuredClone(st.people[0]), id: 'lok', skills: { elek: 2 } });
    lokator.person = st.people.length - 1;
    const gov = newGov(seed);
    const fx = emptyEffects();
    const host = makeHost(gov, govInput(st, w, 0), fx);
    expect(host.tech('t_kozy')).toBe(true);
    expect(host.tech('t_okna')).toBe(false);
    expect(host.know('elek')).toBe(3);
    expect(host.know('bud')).toBe(0);
    expect(host.bookCount('elek')).toBe(1);
    // nowa książka idzie do skutków, nie do stanu zarządu, i od razu liczy się do limitu (1 z symulacji + 1 czeka)
    host.addBook('elek', 'Podręcznik fizyki dla liceum');
    expect(fx.books).toEqual(['elek']);
    expect(gov.books).toEqual({});
    expect(host.bookCount('elek')).toBe(2);
    expect(host.bookCount('med')).toBe(0);
  });

  it('bez know w wejściu (ręczne wejście w testach) i dla obrony host liczy po staremu', async () => {
    const { makeHost } = await import('../../src/gov/wydarzenia.ts');
    const { emptyEffects } = await import('../../src/gov/wspolne.ts');
    const st = stan();
    const [p] = st.pawns.filter((q) => q.kind === 'core');
    st.people[p.person].skills = { elek: 2, obrona: 2 };
    const gov = newGov(seed);
    gov.books = { elek: 1 };
    const i = govInput(st, w, 0);
    expect(i.know?.elek).toBe(2);
    // z know w wejściu obrona (nie dziedzina badań) i tak liczy się z osób zarządu
    expect(makeHost(gov, i, emptyEffects()).know('obrona')).toBe(2);
    // bez know: osoby zarządu i książki ze starego stanu zarządu
    delete i.know;
    const host = makeHost(gov, i, emptyEffects());
    expect(host.know('elek')).toBe(3);
    expect(host.know('bud')).toBe(0);
    expect(host.tech('t_kozy')).toBe(false);
  });
});

describe('wydarzenie „książki” i stary stan zarządu', () => {
  const dane = (key: string) => {
    const dd = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
    const s = Number.parseInt(hashString(dd.addr), 16) || 2051;
    return { w: buildWorld(dd.geo, { seed: s, street: dd.street }), seed: s };
  };

  it.each([
    ['przymorze', 'Do świetlicy'],
    ['zielonki', 'Na półkę przy kozie'],
  ])('%s: wybór „%s” kończy się książką w symulacji, a nie w GovState.books', (key, etykieta) => {
    const { w, seed } = dane(key);
    const st = createSim(w, seed, { core: 4 });
    const gov = newGov(seed);
    gov.ev.active = { id: 'ksiazki', d: { d: 'uprawa', name: 'Ogród na balkonie' } };
    const i = { ...govInput(st, w, 1000), kozaLit: true };
    expect(tr(eventView(gov, i)!.choices[0].label)).toBe(etykieta);
    const fx = chooseEvent(gov, i, 0);
    expect(fx.books).toEqual(['uprawa']);
    expect(gov.books).toEqual({});
    applyGov(st, w, fx);
    expect(st.books).toEqual({ uprawa: 1 });
  });

  it('trzecia książka z wydarzenia: półka zostaje na dwóch, a drewna przybywa', () => {
    const { w, seed } = dane('przymorze');
    const st = createSim(w, seed, { core: 4 });
    st.books = { uprawa: 2 };
    const przed = wood(st);
    applyGov(st, w, { ...govUpdate(newGov(seed), govInput(st, w, 1000)), books: ['uprawa'] });
    expect(st.books).toEqual({ uprawa: 2 });
    expect(wood(st) - przed).toBe(1);
  });

  it('stary stan z books: { elek: 1 } przechodzi do symulacji przy pierwszym kroku, w zarządzie zostaje {}', () => {
    const { w, seed } = dane('przymorze');
    const st = createSim(w, seed, { core: 4 });
    const gov = newGov(seed);
    gov.books = { elek: 1 };
    const fx = govUpdate(gov, govInput(st, w, 1000));
    expect(fx.books).toEqual(['elek']);
    expect(gov.books).toEqual({});
    applyGov(st, w, fx);
    expect(st.books).toEqual({ elek: 1 });
    // drugi krok nie przenosi nic drugi raz
    const dalej = govUpdate(gov, govInput(st, w, 1001));
    expect(dalej.books ?? []).toEqual([]);
    applyGov(st, w, dalej);
    expect(st.books).toEqual({ elek: 1 });
  });

  it('zarząd bez starych książek nie tworzy pola books w skutkach ani w stanie symulacji', () => {
    const { w, seed } = dane('przymorze');
    const st = createSim(w, seed, { core: 4 });
    const gov = newGov(seed);
    const fx = govUpdate(gov, govInput(st, w, 1000));
    expect(fx.books).toBeUndefined();
    applyGov(st, w, fx);
    expect('books' in st).toBe(false);
  });
});
