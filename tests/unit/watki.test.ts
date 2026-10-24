/* Silnik łańcuchów i wątki sezonu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 5; src/gov/watki.ts).
   Testy stoją na prawdziwym zarządzie (`newGov`, `eventTick`, `chooseEvent`, `loadGov`/`saveGov`) i atrapie symulacji z
   gov-atrapa.ts, a łańcuchy testowe podstawia `podmienLancuchy` (produkcyjna lista `LANCUCHY` jest na tym etapie pusta).
   Karty testowe mają stałą wagę i wszystkie pory dnia, a zwykła pula jest „zamrożona” (`ev.last` daleko w przyszłości), więc
   z puli wypadają tylko kroki łańcuchów; wyjątkiem są testy, które sprawdzają pierwszeństwo kroku przed zwykłą pulą. */

import { afterEach, describe, expect, it } from 'vitest';
import { isTx, tx } from '../../src/core/jezyk.ts';
import type { GovHost } from '../../src/gov/tresc.ts';
import type { FazaGoscia, GameMode, GovEffects, GovGosc, GovInput, GovState } from '../../src/gov/typy.ts';
import {
  hak,
  hakDane,
  type Krok,
  krokiGotowe,
  LANCUCHY,
  type Lancuch,
  lancuchy,
  podmienLancuchy,
  porzadkuj,
  sprawdzLancuch,
  sprawdzLancuchy,
  WATKOW,
  wybierzWatki,
} from '../../src/gov/watki.ts';
import { planujGoscia } from '../../src/gov/wizyta.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { Atrapa, at, run, TPH } from './gov-atrapa.ts';

afterEach(() => podmienLancuchy(null));

// ---------------------------------------------------------------- łańcuchy testowe

const OBA: readonly GameMode[] = ['zwykly', 'zombie'];
const WSZYSTKIE = ['dzien', 'wieczor', 'noc'] as const;

interface OpcjeKroku {
  po?: number;
  hak?: string;
  /** hak ustawiany wyborem „Tak” (dane `dane`); wybór „Nie” ustawia `<lancuch>.nie` */
  daj?: string[];
  dane?: unknown;
  when?: Krok['when'];
  gosc?: Krok['gosc'];
  /** dodatkowy skutek wyboru „Tak” */
  przy?: (h: GovHost) => void;
}

/** krok testowy: karta „Krok n” z wyborami „Tak” (ustawia hak) i „Nie” (hak `<lancuch>.nie`) */
function krok(lancuch: string, nr: number, o: OpcjeKroku = {}): Krok {
  return {
    id: `${lancuch}_${nr}`,
    lancuch,
    nr,
    po: o.po ?? 0,
    ...(o.hak ? { hak: o.hak } : {}),
    when: o.when ?? WSZYSTKIE,
    w: () => 1,
    make: () => ({ nr }),
    ...(o.gosc ? { gosc: o.gosc } : {}),
    title: () => tx(`Krok ${nr}`, `Step ${nr}`),
    text: () => tx(`Tekst ${nr}`, `Text ${nr}`),
    choices: (h) => [
      {
        label: tx('Tak', 'Yes'),
        ok: true,
        run: () => {
          for (const id of o.daj ?? []) h.hak(id, o.dane);
          o.przy?.(h);
        },
      },
      { label: tx('Nie', 'No'), ok: true, run: () => h.hak(`${lancuch}.nie`) },
    ],
  };
}

/** trzy kroki po hakach: 1 ustawia `a.dali` (z danymi z Tx), 2 po 2 h ustawia `a.leki`, 3 po 3 h od `a.leki` */
const A: Lancuch = {
  id: 'a',
  tryby: OBA,
  kroki: [
    krok('a', 1, { daj: ['a.dali'], dane: { kto: tx('Ala', 'Alice'), n: 2 } }),
    krok('a', 2, { po: 2, hak: 'a.dali', daj: ['a.leki'] }),
    krok('a', 3, { po: 3, hak: 'a.leki' }),
  ],
};
/** dwa kroki bez haków: drugi po godzinie od rozstrzygnięcia pierwszego */
const B: Lancuch = { id: 'b', tryby: OBA, kroki: [krok('b', 1), krok('b', 2, { po: 1 })] };

/** łańcuch z gościem w kroku 2: pierwszy krok ustawia `g.start`, drugi planuje wizytę dziecka i po przyjęciu ustawia `g.dobrze` */
const G: Lancuch = {
  id: 'g',
  tryby: OBA,
  kroki: [
    krok('g', 1, { daj: ['g.start'] }),
    krok('g', 2, {
      po: 0,
      hak: 'g.start',
      daj: ['g.dobrze'],
      przy: (h) => h.przyjmijGosci(),
      gosc: (h) => ({ osoby: [h.makePerson({})], kto: 'dziecko' }),
    }),
    krok('g', 3, { po: 1, hak: 'g.dobrze' }),
  ],
};

const lancuchZ = (id: string, tryby: readonly GameMode[]): Lancuch => ({
  id,
  tryby,
  kroki: [krok(id, 1, { daj: [`${id}.x`] }), krok(id, 2, { po: 1, hak: `${id}.x` })],
});

// ---------------------------------------------------------------- stan i czas

/** poza zasięgiem: karta z takim `ev.last` nigdy nie jest „świeża”, więc nie wypada ze zwykłej puli */
const ZAMKNIETE = 1e12;

interface Stan {
  gov: GovState;
  atr: Atrapa;
  /** wpisy gości w odczycie symulacji; brak: gra bez obcych */
  goscie?: GovGosc[];
  fx: GovEffects;
}

const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);

/** zarząd z atrapą na dzień `dzien` o `godz`; domyślnie zwykła pula zamrożona, dym z komina „już był” */
function stan(o: { seed?: number; mode?: GameMode; dzien?: number; godz?: number; pula?: boolean } = {}): Stan {
  const seed = o.seed ?? 3;
  const gov = newGov(seed, o.mode ?? 'zwykly', true);
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 3;
  atr.woodSklad = 10;
  atr.scrap = 6;
  atr.tick = tickAt(o.dzien ?? 3, o.godz ?? 9);
  gov.ev.next = 0;
  gov.ev.warm = 0;
  gov.ev.done.dym = true;
  if (!o.pula) for (const e of M1_EVENTS) gov.ev.last[e.id] = ZAMKNIETE;
  return { gov, atr, fx: emptyEffects() };
}

const we = (s: Stan): GovInput => ({ ...s.atr.input(), ...(s.goscie ? { goscie: s.goscie } : {}) });
const minuta = (s: Stan): number => gameMin(we(s));
/** czas do przodu o `godz` godzin gry (ułamek wolno) */
const naprzod = (s: Stan, godz: number): void => {
  s.atr.tick += Math.round(godz * TPH);
};
/** jedno losowanie bez czekania na odstęp: id otwartej karty albo null */
function losuj(s: Stan): string | null {
  s.gov.ev.next = 0;
  s.fx = emptyEffects();
  eventTick(s.gov, we(s), s.fx, false);
  return s.gov.ev.active?.id ?? null;
}
const wybierz = (s: Stan, k: number): GovEffects => chooseEvent(s.gov, we(s), k);

/** losuje co 10 minut gry, najwyżej `n` razy, i oddaje (minutę gry, id) pierwszej wylosowanej karty albo null */
function czekajNaKarte(s: Stan, n = 60): { t: number; id: string } | null {
  for (let k = 0; k < n; k++) {
    naprzod(s, 1 / 6);
    const id = losuj(s);
    if (id) return { t: minuta(s), id };
  }
  return null;
}

/** wpis wizyty w odczycie symulacji */
function wpis(id: string, faza: FazaGoscia, n = 1): GovGosc {
  const zywi = Array.from({ length: n }, (_, k) => k);
  return { id, faza, tile: 1234, gdzie: { x: 34, y: 12 }, pawns: zywi.map((k) => 100 + k), zywi, ukradl: 0 };
}

/** kopia stanu przez zapis zarządu i klon atrapy */
function przezZapis(s: Stan): Stan {
  return { gov: loadGov(saveGov(s.gov)), atr: s.atr.clone(), goscie: s.goscie, fx: emptyEffects() };
}

// ---------------------------------------------------------------- wybór wątków

describe('wybór wątków sezonu', () => {
  const sześć: Lancuch[] = [
    lancuchZ('z1', ['zwykly']),
    lancuchZ('z2', ['zwykly']),
    lancuchZ('m1', ['zombie']),
    lancuchZ('m2', ['zombie']),
    lancuchZ('o1', OBA),
    lancuchZ('o2', OBA),
  ];

  it('wybór wątków zależy tylko od ziarna i trybu', () => {
    podmienLancuchy(sześć);
    const widziane = new Set<string>();
    for (const [mode, dozwolone] of [
      ['zwykly', ['z1', 'z2', 'o1', 'o2']],
      ['zombie', ['m1', 'm2', 'o1', 'o2']],
    ] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const a = newGov(seed, mode, true);
        const wybrane = wybierzWatki(a, mode);
        expect(wybrane, `${mode} ${seed}`).toHaveLength(WATKOW);
        expect(new Set(wybrane).size).toBe(WATKOW);
        for (const id of wybrane) expect(dozwolone).toContain(id);
        expect(a.watki?.wybrane).toEqual(wybrane);
        // to samo ziarno i tryb: ten sam wybór, bez względu na to, kiedy zarząd pierwszy raz losuje
        expect(wybierzWatki(newGov(seed, mode, true), mode)).toEqual(wybrane);
        widziane.add(wybrane.join(','));
      }
    }
    // różne ziarna dają różne wybory (3 z 4 pasujących: cztery możliwe trójki, i tyle samo kolejności)
    expect(widziane.size).toBeGreaterThanOrEqual(6);
  });

  it('wybór jest raz na grę: drugie wołanie nie losuje i oddaje to samo', () => {
    podmienLancuchy(sześć);
    const gov = newGov(9, 'zwykly', true);
    const pierwszy = wybierzWatki(gov, 'zwykly');
    const rng = gov.rng.s;
    expect(wybierzWatki(gov, 'zwykly')).toEqual(pierwszy);
    expect(gov.rng.s).toBe(rng);
  });

  it('pierwszy eventTick wybiera wątki o tej samej treści bez względu na dzień i godzinę gry', () => {
    podmienLancuchy(sześć);
    const oczekiwane = wybierzWatki(newGov(7, 'zwykly', true), 'zwykly');
    for (const [dzien, godz] of [
      [1, 15],
      [3, 10],
      [6, 21],
    ] as const) {
      const s = stan({ seed: 7, dzien, godz });
      eventTick(s.gov, we(s), emptyEffects(), true);
      expect(s.gov.watki?.wybrane, `dzień ${dzien} ${godz}:00`).toEqual(oczekiwane);
    }
  });

  it('pasuje mniej niż trzy łańcuchy: wybiera tyle, ile pasuje, a niepasujący tryb nie zapisuje nic', () => {
    podmienLancuchy([lancuchZ('z1', ['zwykly']), lancuchZ('m1', ['zombie']), lancuchZ('m2', ['zombie'])]);
    expect(wybierzWatki(newGov(4, 'zwykly', true), 'zwykly')).toEqual(['z1']);
    const zombie = newGov(4, 'zombie', true);
    expect([...wybierzWatki(zombie, 'zombie')].sort()).toEqual(['m1', 'm2']);
    podmienLancuchy([lancuchZ('z1', ['zwykly'])]);
    const gov = newGov(4, 'zombie', true);
    const rng = gov.rng.s;
    expect(wybierzWatki(gov, 'zombie')).toEqual([]);
    expect(gov.watki).toBeUndefined();
    expect(gov.rng.s).toBe(rng);
  });

  it('w grze bez obcych wątki wybiera się spośród łańcuchów bez kroku z gościem, więc żaden nie zajmie miejsca na zawsze', () => {
    podmienLancuchy([G, B, lancuchZ('z1', ['zwykly'])]);
    for (let seed = 1; seed <= 20; seed++) {
      expect(
        [...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly', true)].sort(),
        `bez obcych, ziarno ${seed}`,
      ).toEqual(['b', 'z1']);
      expect([...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly')].sort(), `z obcymi, ziarno ${seed}`).toEqual([
        'b',
        'g',
        'z1',
      ]);
    }
    // pierwszy eventTick gry bez obcych (bez `goscie` w wejściu) wybiera tak samo i łańcuch z gościem się nie zaczyna
    const s = stan({ seed: 4 });
    expect(s.goscie).toBeUndefined();
    podmienLancuchy([G]);
    expect(losuj(s)).toBeNull();
    expect(s.gov.watki).toBeUndefined();
    podmienLancuchy([G, B]);
    expect(losuj(s)).toBe('b_1');
    expect(s.gov.watki?.wybrane).toEqual(['b']);
  });

  it('łańcuch z `obcy: true` (handlarz zamiast gościa) odpada bez obcych, a z `lokatorzy: true` bez mieszkańców z generatora', () => {
    const handlarz: Lancuch = { ...lancuchZ('h', OBA), obcy: true };
    const mieszkaniec: Lancuch = { ...lancuchZ('m', OBA), lokatorzy: true };
    const zwykly = lancuchZ('z', OBA);
    podmienLancuchy([handlarz, mieszkaniec, zwykly]);
    for (let seed = 1; seed <= 10; seed++) {
      expect(
        [...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly', true, false)].sort(),
        `bez obcych, ziarno ${seed}`,
      ).toEqual(['m', 'z']);
      expect(
        [...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly', false, true)].sort(),
        `bez mieszkańców, ziarno ${seed}`,
      ).toEqual(['h', 'z']);
      expect([...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly', true, true)], `bez obu, ziarno ${seed}`).toEqual([
        'z',
      ]);
      expect(
        [...wybierzWatki(newGov(seed, 'zwykly', true), 'zwykly')].sort(),
        `z obcymi i mieszkańcami, ziarno ${seed}`,
      ).toEqual(['h', 'm', 'z']);
    }
    // `obcy: false` jawnie wyłącza wymóg, nawet gdy któryś krok ma gościa
    podmienLancuchy([{ ...G, obcy: false }]);
    expect(wybierzWatki(newGov(1, 'zwykly', true), 'zwykly', true)).toEqual(['g']);
    // pierwszy tick gry bez mieszkańców nie wybiera łańcucha z `lokatorzy: true`
    podmienLancuchy([mieszkaniec]);
    const bez = stan({ seed: 4 });
    expect(losuj(bez)).toBeNull();
    expect(bez.gov.watki).toBeUndefined();
  });

  it('łańcuchy filtrowane według trybu: kroki innego trybu nie wypadają, nawet gdy ktoś dopisał je do wybranych', () => {
    podmienLancuchy([lancuchZ('z1', ['zwykly']), lancuchZ('m1', ['zombie'])]);
    const s = stan({ mode: 'zombie' });
    // zarząd zombie wybiera tylko łańcuch zombie
    expect(losuj(s)).toBe('m1_1');
    expect(s.gov.watki?.wybrane).toEqual(['m1']);
    // ręcznie dopisany łańcuch zwykły nie jest gotowy w zombie
    s.gov.watki!.wybrane.push('z1');
    expect(krokiGotowe(s.gov, 0, 'zombie').map((k) => k.id)).toEqual([]);
    expect(krokiGotowe(s.gov, 0, 'zwykly').map((k) => k.id)).toEqual(['z1_1']);
  });
});

// ---------------------------------------------------------------- przebieg łańcucha

describe('przebieg łańcucha', () => {
  it('łańcuch testowy z trzema krokami przechodzi kroki w kolejności po hakach i odstępach', () => {
    podmienLancuchy([A]);
    const s = stan();
    // z zamrożonej puli wypada tylko pierwszy krok wybranego łańcucha
    expect(losuj(s)).toBe('a_1');
    expect(eventView(s.gov, we(s))?.title.pl).toBe('Krok 1');
    const t1 = minuta(s);
    wybierz(s, 0);
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.watki).toMatchObject({
      wybrane: ['a'],
      krok: { a: 1 },
      haki: { 'a.dali': { t: t1, d: { kto: { pl: 'Ala', en: 'Alice' }, n: 2 } }, a_1: { t: t1 } },
    });

    // krok 2 czeka 2 godziny od haka: przez 119 minut nic
    while (minuta(s) + 10 < t1 + 120) {
      naprzod(s, 1 / 6);
      expect(losuj(s), `za wcześnie, ${minuta(s) - t1} min po haku`).toBeNull();
    }
    const druga = czekajNaKarte(s, 40)!;
    expect(druga.id).toBe('a_2');
    expect(druga.t).toBeGreaterThanOrEqual(t1 + 120);
    wybierz(s, 0);
    expect(s.gov.watki?.krok.a).toBe(2);

    // krok 3 czeka 3 godziny od haka `a.leki` ustawionego w kroku 2
    const t2 = druga.t;
    while (minuta(s) + 10 < t2 + 180) {
      naprzod(s, 1 / 6);
      expect(losuj(s), `za wcześnie, ${minuta(s) - t2} min po haku`).toBeNull();
    }
    const trzecia = czekajNaKarte(s, 40)!;
    expect(trzecia.id).toBe('a_3');
    expect(trzecia.t).toBeGreaterThanOrEqual(t2 + 180);
    wybierz(s, 1);

    // łańcuch skończony: żaden krok już nie wypada, także po dniach
    expect(s.gov.watki?.krok.a).toBe(3);
    expect(czekajNaKarte(s, 60)).toBeNull();
    naprzod(s, 24);
    expect(czekajNaKarte(s, 60)).toBeNull();
  });

  it('całość na prawdziwym przebiegu zarządu z atrapą: kroki po kolei, z odstępami z haków', () => {
    podmienLancuchy([A]);
    const gov = newGov(11, 'zwykly', true);
    const atr = new Atrapa(11);
    for (const e of M1_EVENTS) gov.ev.last[e.id] = ZAMKNIETE;
    gov.ev.done.dym = true;
    const { steps, gov: po } = run(11, 'propozycja', at(8, 0), { gov, atr });
    const kroki = steps.filter((x) => x.kind === 'wydarzenie' && x.text.startsWith('Krok '));
    expect(kroki.map((x) => x.text.slice(0, 6))).toEqual(['Krok 1', 'Krok 2', 'Krok 3']);
    const min = (x: { day: number; clock: string }) =>
      at(x.day, Number(x.clock.slice(0, 2)), Number(x.clock.slice(3, 5)));
    expect(min(kroki[1]) - min(kroki[0])).toBeGreaterThanOrEqual(120);
    expect(min(kroki[2]) - min(kroki[1])).toBeGreaterThanOrEqual(180);
    expect(po.watki?.krok.a).toBe(3);
  });

  it('krok bez dojrzałego haka nie wypada', () => {
    podmienLancuchy([A]);
    const s = stan();
    expect(losuj(s)).toBe('a_1');
    const t1 = minuta(s);
    // „Nie”: ustawia `a.nie`, a krok 2 wymaga `a.dali`
    wybierz(s, 1);
    expect(s.gov.watki?.haki['a.nie']).toBeDefined();
    expect(s.gov.watki?.haki['a.dali']).toBeUndefined();
    expect(krokiGotowe(s.gov, t1 + 100_000, 'zwykly')).toEqual([]);
    expect(czekajNaKarte(s, 60)).toBeNull();
    naprzod(s, 72);
    expect(czekajNaKarte(s, 60)).toBeNull();
    expect(s.gov.watki?.krok.a).toBe(1);
  });

  it('gotowość kroku co do minuty: hak plus `po` godzin, w górę od dokładnie tego momentu', () => {
    podmienLancuchy([A]);
    const gov = newGov(2, 'zwykly', true);
    wybierzWatki(gov, 'zwykly');
    // pierwszy krok jest gotowy od razu, drugi jeszcze nie ma kroku 1 za sobą
    expect(krokiGotowe(gov, 0, 'zwykly').map((k) => k.id)).toEqual(['a_1']);
    gov.watki!.krok.a = 1;
    gov.watki!.haki.a_1 = { t: 1000 };
    hak(gov, 'a.dali', 1000, { x: 1 });
    expect(krokiGotowe(gov, 1000 + 119, 'zwykly')).toEqual([]);
    expect(krokiGotowe(gov, 1000 + 120, 'zwykly').map((k) => k.id)).toEqual(['a_2']);
    expect(hakDane(gov, 'a.dali')).toEqual({ t: 1000, d: { x: 1 } });
    expect(hakDane(gov, 'a.nie')).toBeNull();
  });

  it('dojrzałe kroki idą w kolejności dojrzewania (hak plus `po`), a remis rozstrzyga kolejność wybranych', () => {
    const X: Lancuch = {
      id: 'x',
      tryby: OBA,
      kroki: [krok('x', 1, { daj: ['x.a'] }), krok('x', 2, { po: 5, hak: 'x.a' })],
    };
    const Y: Lancuch = {
      id: 'y',
      tryby: OBA,
      kroki: [krok('y', 1, { daj: ['y.a'] }), krok('y', 2, { po: 0, hak: 'y.a' })],
    };
    podmienLancuchy([X, Y]);
    const stanZ = (wybrane: string[], tx0: number, ty0: number): GovState => {
      const gov = newGov(1, 'zwykly', true);
      gov.watki = {
        wybrane,
        krok: { x: 1, y: 1 },
        haki: { x_1: { t: tx0 }, 'x.a': { t: tx0 }, y_1: { t: ty0 }, 'y.a': { t: ty0 } },
      };
      return gov;
    };
    const ids = (gov: GovState, t: number) => krokiGotowe(gov, t, 'zwykly').map((k) => k.id);
    // x: hak 0, dojrzewa po 300 minutach; y: hak 100, dojrzewa od razu, czyli w 100. minucie: y wcześniej mimo późniejszego haka
    expect(ids(stanZ(['x', 'y'], 0, 100), 99)).toEqual([]);
    expect(ids(stanZ(['x', 'y'], 0, 100), 150)).toEqual(['y_2']);
    expect(ids(stanZ(['x', 'y'], 0, 100), 400)).toEqual(['y_2', 'x_2']);
    // remis dojrzewania (x w 300, y w 300): kolejność z `wybrane`
    expect(ids(stanZ(['x', 'y'], 0, 300), 400)).toEqual(['x_2', 'y_2']);
    expect(ids(stanZ(['y', 'x'], 0, 300), 400)).toEqual(['y_2', 'x_2']);
  });

  it('krok bez haka liczy odstęp od rozstrzygnięcia poprzedniego i łańcuch nie prowadzi dwóch kroków naraz', () => {
    podmienLancuchy([B]);
    const s = stan();
    expect(losuj(s)).toBe('b_1');
    // krok 1 otwarty, ale nie rozstrzygnięty: drugi nie jest gotowy, choćby minęły wieki
    expect(krokiGotowe(s.gov, minuta(s) + 1_000_000, 'zwykly')).toEqual([]);
    const t1 = minuta(s);
    wybierz(s, 0);
    expect(krokiGotowe(s.gov, t1 + 59, 'zwykly')).toEqual([]);
    expect(krokiGotowe(s.gov, t1 + 60, 'zwykly').map((k) => k.id)).toEqual(['b_2']);
    const druga = czekajNaKarte(s, 40)!;
    expect(druga.id).toBe('b_2');
    expect(druga.t).toBeGreaterThanOrEqual(t1 + 60);
  });

  it('kroki liczą się jak karty: odstęp po decyzji, jak przy zwykłych wydarzeniach', () => {
    podmienLancuchy([A]);
    const s = stan();
    expect(losuj(s)).toBe('a_1');
    wybierz(s, 0);
    const ekran = we(s).screen;
    expect(s.gov.ev.next).toBeGreaterThanOrEqual(ekran + 38);
    // dwie godziny gry później hak jest dojrzały, ale odstęp od decyzji (sekundy przy ekranie) jeszcze trwa
    naprzod(s, 3);
    s.gov.ev.next = we(s).screen + 50;
    for (let k = 0; k < 10; k++) {
      eventTick(s.gov, we(s), emptyEffects(), false);
      expect(s.gov.ev.active).toBeNull();
    }
  });

  it('pierwszy krok czeka na porę dnia, a pierwszej nocy kroków bez flagi `first` nie ma', () => {
    const noc: Lancuch = { id: 'n', tryby: OBA, kroki: [krok('n', 1, { when: ['noc'] }), krok('n', 2, { po: 1 })] };
    podmienLancuchy([noc]);
    const s = stan({ godz: 10 });
    for (let k = 0; k < 8; k++) {
      expect(losuj(s)).toBeNull();
      naprzod(s, 1);
    }
    // wybierano już wątki, ale krok jeszcze się nie zaczął
    expect(s.gov.watki).toMatchObject({ wybrane: ['n'], krok: {} });
    s.atr.tick = tickAt(3, 23);
    expect(losuj(s)).toBe('n_1');
    // pierwsza noc (dzień 1): bez flagi `first` nic
    podmienLancuchy([A]);
    const pierwsza = stan({ dzien: 1, godz: 21 });
    for (let k = 0; k < 5; k++) expect(losuj(pierwsza)).toBeNull();
  });
});

// ---------------------------------------------------------------- pierwszeństwo przed zwykłą pulą

describe('pierwszeństwo kroków', () => {
  /** zarząd z krokiem 2 łańcucha A już dojrzałym i pełną zwykłą pulą (dzień 3, 10:00) */
  function zDojrzalym(seed: number): Stan {
    const s = stan({ seed, godz: 10, pula: true });
    s.gov.watki = {
      wybrane: ['a'],
      krok: { a: 1 },
      haki: { a_1: { t: 0 }, 'a.dali': { t: 0 } },
    };
    return s;
  }

  it('dojrzały krok wypada przed pulą z szansą 0,6 przy każdym losowaniu, reszta to zwykła pula', () => {
    podmienLancuchy([A]);
    let kroki = 0;
    let inne = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const s = zDojrzalym(seed);
      const id = losuj(s);
      if (id === 'a_2') kroki++;
      else if (id) inne++;
    }
    // 0,6 · 400 = 240 ± 10 (sigma), cztery sigma szerokości
    expect(kroki).toBeGreaterThan(200);
    expect(kroki).toBeLessThan(280);
    // gdy krok nie wypadł, losuje się zwykła pula, a w niej nie ma kroków łańcucha
    expect(inne).toBeGreaterThan(0);
  });

  it('pierwszy krok wybranego łańcucha dołącza do zwykłej puli (waga 1)', () => {
    podmienLancuchy([A]);
    let kroki = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const s = stan({ seed, godz: 10, pula: true });
      if (losuj(s) === 'a_1') kroki++;
    }
    // waga 1 wśród kilkunastu wydarzeń dnia: zdarza się, ale nie zdarza się zawsze
    expect(kroki).toBeGreaterThan(0);
    expect(kroki).toBeLessThan(N / 3);
  });

  it('bez dojrzałego kroku losowanie nie bierze dodatkowej liczby z ziarna', () => {
    podmienLancuchy([A]);
    // dwa zarządy w tym samym stanie; w jednym łańcuch jest już skończony, w drugim łańcucha nie ma: to samo losowanie
    const a = stan({ seed: 8, godz: 10, pula: true });
    a.gov.watki = { wybrane: ['a'], krok: { a: 3 }, haki: {} };
    const ida = losuj(a);
    podmienLancuchy([]);
    const b = stan({ seed: 8, godz: 10, pula: true });
    const idb = losuj(b);
    expect(ida).toBe(idb);
    expect(a.gov.rng.s).toBe(b.gov.rng.s);
  });
});

// ---------------------------------------------------------------- zapis i wczytanie

describe('zapis i wczytanie', () => {
  /** gra do końca łańcucha A z odpowiedziami „Tak”; oddaje przebieg (minuta, id) */
  function dograj(s: Stan): { t: number; id: string }[] {
    const seria: { t: number; id: string }[] = [];
    for (let k = 0; k < 6; k++) {
      const c = czekajNaKarte(s, 60);
      if (!c) break;
      seria.push(c);
      wybierz(s, 0);
    }
    return seria;
  }

  it('zapis i wczytanie w środku łańcucha (po haku) nie zmieniają dalszego przebiegu', () => {
    podmienLancuchy([A]);
    const s = stan({ seed: 5 });
    expect(losuj(s)).toBe('a_1');
    wybierz(s, 0);
    naprzod(s, 1);
    const kopia = przezZapis(s);
    expect(kopia.gov.watki).toEqual(s.gov.watki);
    // dane haka z Tx przeżyły zapis jako Tx
    const d = kopia.gov.watki!.haki['a.dali'].d as { kto: unknown; n: number };
    expect(isTx(d.kto)).toBe(true);
    expect(d).toEqual({ kto: tx('Ala', 'Alice'), n: 2 });
    const a = dograj(s);
    const b = dograj(kopia);
    expect(a.map((x) => x.id)).toEqual(['a_2', 'a_3']);
    expect(b).toEqual(a);
    expect(saveGov(kopia.gov)).toBe(saveGov(s.gov));
  });

  it('zapis z otwartą kartą kroku: po wczytaniu karta czeka i łańcuch idzie dalej tak samo', () => {
    podmienLancuchy([A]);
    const s = stan({ seed: 6 });
    expect(losuj(s)).toBe('a_1');
    wybierz(s, 0);
    expect(czekajNaKarte(s, 60)?.id).toBe('a_2');
    const kopia = przezZapis(s);
    expect(kopia.gov.ev.active?.id).toBe('a_2');
    expect(eventView(kopia.gov, we(kopia))?.title.pl).toBe('Krok 2');
    // krok jest rozpoczęty, ale nie rozstrzygnięty: sprzątanie go nie rusza, bo jego karta jest otwarta
    eventTick(kopia.gov, we(kopia), emptyEffects(), true);
    expect(kopia.gov.watki?.krok.a).toBe(2);
    wybierz(s, 0);
    wybierz(kopia, 0);
    const a = dograj(s);
    const b = dograj(kopia);
    expect(a.map((x) => x.id)).toEqual(['a_3']);
    expect(b).toEqual(a);
    expect(saveGov(kopia.gov)).toBe(saveGov(s.gov));
  });

  it('stary zapis bez watki: wczytuje się, a wątki wybiera się przy pierwszym ticku po wczytaniu', () => {
    podmienLancuchy([A]);
    const s = stan({ seed: 12 });
    const stary = JSON.parse(saveGov(s.gov)) as Record<string, unknown>;
    expect('watki' in stary).toBe(false);
    const gov = loadGov(JSON.stringify(stary));
    expect(gov.watki).toBeUndefined();
    const po: Stan = { ...s, gov };
    expect(losuj(po)).toBe('a_1');
    expect(gov.watki?.wybrane).toEqual(['a']);
    // dokładnie tak samo jak w grze, która łańcuchy ma od początku
    const swieza = stan({ seed: 12 });
    expect(losuj(swieza)).toBe('a_1');
    expect(saveGov(gov)).toBe(saveGov(swieza.gov));
  });

  it('zapis z łańcuchem, którego gra już nie zna, i z kartą nieznanego kroku nie psuje gry', () => {
    podmienLancuchy([A]);
    const s = stan({ seed: 13 });
    s.gov.watki = { wybrane: ['zniknal', 'a'], krok: { zniknal: 1 }, haki: {} };
    s.gov.ev.active = { id: 'zniknal_1', d: {} };
    expect(losuj(s)).toBe('a_1');
    expect(s.gov.watki?.krok.zniknal).toBe(1);
  });
});

// ---------------------------------------------------------------- pusta lista

describe('pusta lista łańcuchów', () => {
  it('bez łańcuchów silnik nie losuje i niczego nie zapisuje', () => {
    podmienLancuchy([]);
    const gov = newGov(5, 'zwykly', true);
    const rng = gov.rng.s;
    const przed = saveGov(gov);
    expect(wybierzWatki(gov, 'zwykly')).toEqual([]);
    expect(krokiGotowe(gov, 1e6, 'zwykly')).toEqual([]);
    porzadkuj(gov, {});
    expect(gov.rng.s).toBe(rng);
    expect(gov.watki).toBeUndefined();
    expect(saveGov(gov)).toBe(przed);
  });

  it('wielodniowy przebieg zarządu bez łańcuchów nie zakłada stanu wątków', () => {
    podmienLancuchy([]);
    const r = run(5, 'propozycja', at(6, 12));
    expect(r.gov.watki).toBeUndefined();
    expect(r.steps.some((x) => x.kind === 'wydarzenie')).toBe(true);
  });

  it('łańcuchy, które nie pasują do trybu, nic nie zmieniają: ten sam skrót stanu zarządu', () => {
    podmienLancuchy([]);
    const bez = saveGov(run(5, 'propozycja', at(6, 12)).gov);
    podmienLancuchy([lancuchZ('m1', ['zombie']), lancuchZ('m2', ['zombie'])]);
    const zNiepasujacymi = saveGov(run(5, 'propozycja', at(6, 12)).gov);
    expect(zNiepasujacymi).toBe(bez);
  });

  it('bez podmiany silnik używa produkcyjnej listy LANCUCHY', () => {
    podmienLancuchy([A]);
    expect(lancuchy()).toEqual([A]);
    podmienLancuchy(null);
    expect(lancuchy()).toBe(LANCUCHY);
  });
});

// ---------------------------------------------------------------- krok z gościem

describe('krok z gościem', () => {
  /** stan z gośćmi (pusta lista), po kroku 1 i z krokiem 2 zaplanowanym jako wizyta: grupa idzie do bramy */
  function zPlanem(): Stan {
    podmienLancuchy([G]);
    const s = stan({ seed: 4 });
    s.goscie = [];
    expect(losuj(s)).toBe('g_1');
    wybierz(s, 0);
    // krok 2 nie otwiera karty, tylko planuje wizytę (gość z klocków kroku), i zajmuje miejsce karty
    for (let k = 0; k < 40 && !s.gov.goscie?.aktywny; k++) {
      naprzod(s, 1 / 6);
      expect(losuj(s)).toBeNull();
    }
    expect(s.gov.goscie?.aktywny).toMatchObject({ kartaId: 'g_2', karta: false });
    expect(s.gov.watki?.krok.g).toBe(2);
    return s;
  }
  const gid = (s: Stan): string => s.gov.goscie!.aktywny!.gosc.id;

  it('gość dochodzi do bramy: karta kroku otwiera się pod bramą, wybór ustawia hak i łańcuch idzie dalej', () => {
    const s = zPlanem();
    expect(s.fx.gosc || s.gov.goscie?.aktywny).toBeTruthy();
    s.goscie = [wpis(gid(s), 'idzie')];
    expect(losuj(s)).toBeNull();
    s.goscie = [wpis(gid(s), 'brama')];
    expect(losuj(s)).toBe('g_2');
    expect((s.gov.ev.active!.d as { gid: string }).gid).toBe(gid(s));
    const t2 = minuta(s);
    const fx = wybierz(s, 0);
    expect(fx.goscRozkaz?.map((r) => r.co)).toEqual(['zostan']);
    expect(s.gov.watki?.haki['g.dobrze']).toBeDefined();
    // wizyta skończona, krok 3 po godzinie
    s.goscie = [wpis(gid(s), 'poszedl')];
    expect(losuj(s)).toBeNull();
    const trzecia = czekajNaKarte(s, 60)!;
    expect(trzecia.id).toBe('g_3');
    expect(trzecia.t).toBeGreaterThanOrEqual(t2 + 60);
  });

  it('gość nie doszedł do bramy: łańcuch kończy się po cichu, bez osieroconego kroku', () => {
    const s = zPlanem();
    const dlugosc = s.gov.log.length;
    s.goscie = [wpis(gid(s), 'nie_doszedl')];
    losuj(s);
    losuj(s);
    expect(s.gov.goscie?.aktywny).toBeUndefined();
    expect(s.gov.watki?.krok.g).toBe(G.kroki.length);
    // jedyny ślad to wpis kroniki o przepadłym planie; żadnej karty
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.log.length).toBeGreaterThan(dlugosc);
    expect(krokiGotowe(s.gov, minuta(s) + 100_000, 'zwykly')).toEqual([]);
    s.goscie = [];
    expect(czekajNaKarte(s, 80)).toBeNull();
    naprzod(s, 48);
    expect(czekajNaKarte(s, 80)).toBeNull();
  });

  it('gość zginął, zanim zarząd zdecydował (karta otwarta): karta znika, łańcuch się kończy', () => {
    const s = zPlanem();
    s.goscie = [wpis(gid(s), 'brama')];
    expect(losuj(s)).toBe('g_2');
    s.goscie = [wpis(gid(s), 'zginal')];
    losuj(s);
    expect(s.gov.ev.active).toBeNull();
    losuj(s);
    expect(s.gov.watki?.krok.g).toBe(G.kroki.length);
    expect(czekajNaKarte(s, 80)).toBeNull();
  });

  it('wizyta zajęta inną grupą: krok z gościem czeka, nie otwiera karty bez gościa i nie kończy łańcucha', () => {
    podmienLancuchy([G]);
    const s = stan({ seed: 4 });
    s.goscie = [];
    expect(losuj(s)).toBe('g_1');
    wybierz(s, 0);
    // inny gość zajmuje jedyne miejsce wizyty (i dalej idzie do bramy: symulacja go pokazuje)
    planujGoscia(s.gov, we(s), emptyEffects(), 'dzien');
    const inny = s.gov.goscie!.aktywny!.gosc.id;
    s.goscie = [wpis(inny, 'idzie')];
    for (let k = 0; k < 30; k++) {
      naprzod(s, 1 / 6);
      expect(losuj(s)).toBeNull();
    }
    expect(s.gov.goscie?.aktywny?.gosc.id).toBe(inny);
    expect(s.gov.watki?.krok.g).toBe(1);
    // wizyta się skończyła: krok 2 planuje swoją
    delete s.gov.goscie!.aktywny;
    s.goscie = [];
    const wizyta = () => s.gov.goscie?.aktywny;
    for (let k = 0; k < 40 && !wizyta(); k++) {
      naprzod(s, 1 / 6);
      losuj(s);
    }
    expect(wizyta()?.kartaId).toBe('g_2');
  });

  it('zapis i wczytanie, gdy krok z gościem czeka na grupę: po wczytaniu grupa dochodzi i wszystko idzie tak samo', () => {
    const s = zPlanem();
    s.goscie = [wpis(gid(s), 'idzie')];
    expect(losuj(s)).toBeNull();
    const kopia = przezZapis(s);
    expect(kopia.gov.goscie?.aktywny).toMatchObject({ kartaId: 'g_2', karta: false });
    expect(kopia.gov.watki).toEqual(s.gov.watki);
    const przebieg = (x: Stan): { t: number; id: string }[] => {
      const seria: { t: number; id: string }[] = [];
      // łańcuch żyje mimo wczytania (sprzątanie widzi wizytę w zapisie), grupa dochodzi, karta otwiera się z danymi i `gid`
      expect(losuj(x)).toBeNull();
      expect(x.gov.watki?.krok.g).toBe(2);
      x.goscie = [wpis(gid(x), 'brama')];
      expect(losuj(x)).toBe('g_2');
      expect((x.gov.ev.active!.d as { gid: string }).gid).toBe(gid(x));
      seria.push({ t: minuta(x), id: 'g_2' });
      wybierz(x, 0);
      x.goscie = [wpis(gid(x), 'poszedl')];
      expect(losuj(x)).toBeNull();
      const trzecia = czekajNaKarte(x, 60);
      if (trzecia) seria.push(trzecia);
      return seria;
    };
    const a = przebieg(s);
    const b = przebieg(kopia);
    expect(a.map((x) => x.id)).toEqual(['g_2', 'g_3']);
    expect(b).toEqual(a);
    expect(saveGov(kopia.gov)).toBe(saveGov(s.gov));
  });

  it('krok z gościem, któremu `gosc` nikogo nie wystawiło, nie otwiera się bez gościa, a łańcuch kończy się po cichu', () => {
    const wystawienia: NonNullable<Krok['gosc']>[] = [() => null, () => ({ osoby: [], kto: 'dziecko' })];
    for (const [n, gosc] of wystawienia.entries()) {
      const Z: Lancuch = {
        id: 'z',
        tryby: OBA,
        kroki: [krok('z', 1, { daj: ['z.a'] }), krok('z', 2, { hak: 'z.a', gosc }), krok('z', 3, { po: 1 })],
      };
      podmienLancuchy([Z]);
      const s = stan({ seed: 4 });
      s.goscie = [];
      expect(losuj(s), `wariant ${n}`).toBe('z_1');
      wybierz(s, 0);
      // krok 2 zostaje wylosowany (jest rozpoczęty), ale żadna karta ani wizyta z niego nie powstaje
      expect(czekajNaKarte(s, 80), `wariant ${n}`).toBeNull();
      expect(s.gov.ev.done.z_2, `wariant ${n}`).toBe(true);
      expect(s.gov.goscie?.aktywny).toBeUndefined();
      expect(s.gov.ev.active).toBeNull();
      expect(s.gov.log.some((w) => w.txt.pl === 'Krok 2')).toBe(false);
      // łańcuch skończony po cichu: krok 3 nie wypadnie nigdy
      expect(s.gov.watki?.krok.z).toBe(Z.kroki.length);
      naprzod(s, 48);
      expect(czekajNaKarte(s, 80)).toBeNull();
    }
  });

  it('gra bez obcych, a łańcuch wybrany w grze z obcymi: następny krok z gościem kończy łańcuch po cichu', () => {
    podmienLancuchy([G]);
    const s = stan({ seed: 4 });
    s.goscie = [];
    expect(losuj(s)).toBe('g_1');
    wybierz(s, 0);
    // zapis z obcymi wczytany do gry bez obcych (wejście bez `goscie`)
    s.goscie = undefined;
    expect(czekajNaKarte(s, 80)).toBeNull();
    expect(s.gov.watki?.krok.g).toBe(G.kroki.length);
    expect(s.gov.goscie?.aktywny).toBeUndefined();
  });

  it('gra bez obcych, a łańcuch z gościem niezaczęty (wybrany w grze z obcymi): kończy się po cichu zamiast zajmować miejsce', () => {
    const pierwszyZGosciem: Lancuch = {
      id: 'h',
      tryby: OBA,
      kroki: [krok('h', 1, { gosc: () => ({ osoby: [], kto: 'dziecko' }) }), krok('h', 2, { po: 1 })],
    };
    podmienLancuchy([pierwszyZGosciem, B]);
    const s = stan({ seed: 4 });
    s.gov.watki = { wybrane: ['h', 'b'], haki: {}, krok: {} };
    expect(s.goscie).toBeUndefined();
    // łańcuch b wypada, łańcuch h kończy się, nie zaczynając
    expect(losuj(s)).toBe('b_1');
    expect(s.gov.watki?.krok.h).toBe(pierwszyZGosciem.kroki.length);
    expect(s.gov.ev.done.h_1).toBeUndefined();
  });
});

// ---------------------------------------------------------------- hak na hoście i sprawdzanie łańcuchów

describe('hak i sprawdzanie łańcuchów', () => {
  it('hak trzyma kopię danych w czystym JSON, a odczyt oddaje kopię', () => {
    const gov = newGov(1, 'zwykly', true);
    const dane = { kto: tx('Ala', 'Alice'), n: 2, zagniezdzone: { a: [1, 2, 3] }, brak: undefined };
    hak(gov, 'x.y', 55, dane);
    dane.zagniezdzone.a.push(4);
    expect(gov.watki?.haki['x.y']).toEqual({
      t: 55,
      d: { kto: tx('Ala', 'Alice'), n: 2, zagniezdzone: { a: [1, 2, 3] } },
    });
    expect('brak' in (gov.watki!.haki['x.y'].d as object)).toBe(false);
    const odczyt = hakDane(gov, 'x.y')!;
    (odczyt.d as { n: number }).n = 99;
    expect((gov.watki!.haki['x.y'].d as { n: number }).n).toBe(2);
    // hak bez danych nie ma pola `d`
    hak(gov, 'x.z', 56);
    expect(gov.watki?.haki['x.z']).toEqual({ t: 56 });
    expect(loadGov(saveGov(gov)).watki).toEqual(gov.watki);
  });

  it('hak założony przed wyborem wątków (puste `wybrane`) nie blokuje wyboru', () => {
    podmienLancuchy([A]);
    const gov = newGov(1, 'zwykly', true);
    hak(gov, 'a.cos', 10);
    expect(gov.watki?.wybrane).toEqual([]);
    expect(wybierzWatki(gov, 'zwykly')).toEqual(['a']);
    expect(gov.watki?.haki['a.cos']).toEqual({ t: 10 });
  });

  it('host karty ustawia hak w minutach gry i czyta go z danymi', () => {
    const odczyt: unknown[] = [];
    const K: Lancuch = {
      id: 'k',
      tryby: OBA,
      kroki: [
        krok('k', 1, { daj: ['k.a'], dane: { n: 1 }, przy: (h) => odczyt.push(h.hakDane('k.a'), h.hakDane('k.nic')) }),
        krok('k', 2, { po: 1, hak: 'k.a' }),
      ],
    };
    podmienLancuchy([K]);
    const s = stan();
    expect(losuj(s)).toBe('k_1');
    const t = minuta(s);
    wybierz(s, 0);
    expect(s.gov.watki?.haki['k.a']).toEqual({ t, d: { n: 1 } });
    expect(odczyt).toEqual([{ t, d: { n: 1 } }, null]);
  });

  it('sprawdzLancuch: dobre łańcuchy bez usterek, złe z opisem', () => {
    expect(sprawdzLancuch(A, new Set(M1_EVENTS.map((e) => e.id)))).toEqual([]);
    expect(sprawdzLancuch(B)).toEqual([]);
    const zly: Lancuch = {
      id: 'q',
      tryby: [],
      kroki: [
        { ...krok('q', 1), id: 'dym' },
        { ...krok('q', 3, { po: 1, hak: 'inny.hak' }), lancuch: 'r' },
      ],
    };
    const bledy = sprawdzLancuch(zly, new Set(['dym']));
    expect(bledy.join('\n')).toContain('brak trybów');
    expect(bledy.join('\n')).toContain('dym: id zajęte');
    expect(bledy.join('\n')).toContain('nr 3 zamiast 2');
    expect(bledy.join('\n')).toContain('lancuch r zamiast q');
    expect(bledy.join('\n')).toContain('hak inny.hak poza przestrzenią q.');
    expect(sprawdzLancuch({ id: 'k', tryby: OBA, kroki: [krok('k', 1)] }).join()).toContain('1 kroków zamiast 2–4');
  });

  it('sprawdzLancuch: krok pilny z gościem to usterka (pilna karta wypadałaby przed gościem pod bramą)', () => {
    const gosc: Krok['gosc'] = () => ({ osoby: [], kto: 'dziecko' });
    const zly: Lancuch = {
      id: 'p',
      tryby: OBA,
      kroki: [{ ...krok('p', 1, { gosc }), pilny: true }, krok('p', 2, { po: 1 })],
    };
    expect(sprawdzLancuch(zly)).toEqual(['p_1: krok pilny z gościem (karta wypadłaby przed gościem pod bramą)']);
    // pilny bez gościa i gość bez pilnego są w porządku
    const dobry: Lancuch = {
      id: 'p',
      tryby: OBA,
      kroki: [{ ...krok('p', 1), pilny: true }, krok('p', 2, { po: 1, gosc })],
    };
    expect(sprawdzLancuch(dobry)).toEqual([]);
  });

  it('sprawdzLancuchy: to samo id kroku w dwóch łańcuchach, powtórzony łańcuch i id powtórzone w łańcuchu to usterki', () => {
    expect(sprawdzLancuchy([A, B, G], new Set(M1_EVENTS.map((e) => e.id)))).toEqual([]);
    // krok `b_2` w dwóch różnych łańcuchach (id kroku to id karty, więc musi być unikalne w całej grze)
    const C: Lancuch = { id: 'c', tryby: OBA, kroki: [krok('c', 1), { ...krok('c', 2), id: 'b_2' }] };
    const bledy = sprawdzLancuchy([A, B, C]);
    expect(bledy).toEqual(['b_2: id zajęte przez kartę puli albo krok innego łańcucha']);
    // pojedyncze sprawdzenie łańcucha C tego nie widzi: potrzebna jest cała lista
    expect(sprawdzLancuch(C)).toEqual([]);
    expect(sprawdzLancuchy([A, A]).join('\n')).toContain('a: łańcuch powtórzony na liście');
    const D: Lancuch = { id: 'd', tryby: OBA, kroki: [krok('d', 1), { ...krok('d', 2), id: 'd_1' }] };
    expect(sprawdzLancuch(D)).toEqual(['d_1: id powtórzone w łańcuchu d']);
    expect(sprawdzLancuchy([B], new Set(['b_1'])).join()).toContain('b_1: id zajęte');
  });
});
