/* Gość z klocków w symulacji (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Wizyta”): plan
   zarządu (`GovEffects.gosc`) wystawia grupę pionków rodzaju `gosc` na ulicy po wskazanej stronie bramy, grupa idzie pod
   bramę i czeka; rozkazy (`GovEffects.goscRozkaz`) odsyłają ją, wpuszczają na noc (ognisko, sen, rano wyjście bramą),
   przyjmują jako mieszkańców albo (mówiący) do zarządu; kłamca nocą o 2:00 bierze jedzenie, a czuwająca osoba zarządu go
   łapie; w trybie zombie szwendacz płoszy grupę pod bramą; ugryziony zaraża się jak na wyprawie.
   Świat to blok M2 z siatką i bramą (128 m); rdzeń ma dwie osoby, w razie potrzeby wysyłam je na wyprawę (`away`),
   żeby nikt nie czuwał, albo stawiam jednego na warcie przy bramie. Obcych (handlarz, wędrowcy, ekipy) odsuwam na koniec
   świata, żeby nic poza gośćmi nie przychodziło. */

import { describe, expect, it } from 'vitest';
import { makePerson, type Person } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import type { Strona } from '../../src/gov/goscie.ts';
import type { GoscRozkaz, GovEffects, PlanGoscia } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { STRANGERS } from '../../src/render/game.ts';
import { poseOf } from '../../src/render/poses.ts';
import { hourOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import {
  GOSC_CZEKA,
  GOSC_DOJSCIE,
  GOSC_FROM,
  GOSC_HP,
  type GoscSim,
  goscKoniec,
  najblizszaGodzina,
  poStronie,
  przesuniecieWStrone,
  ranoGoscia,
  startGoscia,
} from '../../src/sim/gosc.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { jobText } from '../../src/sim/orders.ts';
import { gateTiles as gateTilesOf } from '../../src/sim/perimeter.ts';
import { awansuj, createSim, type Pawn, Sim, type SimState, spawnZombie } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlockM2 } from './interior-mock.ts';
import { demoWorld } from './miejsce-pomoc.ts';

const w = mockBlockM2();
const size = w.size;
const FAR = tickAt(30, 10);
const yard = new Set(w.fence.yard);
const gateTiles = (() => {
  const g = w.fence.gate;
  const out: number[] = [];
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) out.push(y * size + x);
  return out;
})();
/** kafelek ulicy tuż za bramą, pod którym czekają goście */
const SPOT = (w.fence.gate.y + w.fence.gate.h) * size + w.fence.gate.x;
/** ognisko w zachodniej części podwórka, z dala od bramy i od wejścia do siedziby */
const OGNISKO = 68 * size + 35;

const tileOf = (p: { x: number; y: number }) => Math.floor(p.y) * size + Math.floor(p.x);
const kind = (st: SimState, k: string): Pawn[] => st.pawns.filter((p) => p.kind === k);
const food = (st: SimState) => st.things.filter((t) => t.kind === 'jedzenie').reduce((a, t) => a + t.n, 0);
const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
const grupa = (st: SimState, id = 'g1'): GoscSim => st.goscie!.find((g) => g.id === id)!;
const czlonkowie = (st: SimState, id = 'g1') =>
  grupa(st, id)
    .pawns.map((n) => st.pawns.find((p) => p.id === n))
    .filter((p): p is Pawn => !!p);

/** osoby gościa z id `g<k>p<i>`, jak składa je zarząd */
function osoby(n: number, k: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    ...makePerson(mulberry(100 * k + i), new Set(), () => 900 + i),
    id: `g${k}p${i}`,
  }));
}

function plan(n = 1, strona: Strona = 'n', k = 1, ugryziony?: number): PlanGoscia {
  return {
    id: `g${k}`,
    osoby: osoby(n, k),
    looks: Array.from({ length: n }, (_, i) => 4 + i),
    strona,
    ...(ugryziony !== undefined ? { ugryziony } : {}),
  };
}

const rozkazy = (id: string, ...co: GoscRozkaz[]): GovEffects['goscRozkaz'] => co.map((c) => ({ id, co: c }));

/** gra z obcymi o danej porze; goście to jedyni, którzy przychodzą. Opcje: ognisko na podwórku (albo lista ognisk z
    paliwem), tryb zombie */
function gra(
  day: number,
  hour: number,
  opt: { ognisko?: boolean; ogniska?: readonly { tile: number; fuel: number }[]; zombie?: boolean; seed?: number } = {},
): Sim {
  const st = createSim(w, opt.seed ?? 3, { core: 2, obcy: true, ...(opt.zombie ? { mode: 'zombie' as const } : {}) });
  const ogniska = opt.ogniska ?? (opt.ognisko ? [{ tile: OGNISKO, fuel: 100 * TICKS_PER_HOUR }] : []);
  for (const o of ogniska)
    st.things.push({
      id: st.nextThing++,
      kind: 'ognisko',
      x: o.tile % size,
      y: Math.floor(o.tile / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 0,
      fuel: o.fuel,
      by: -1,
      owner: -1,
    });
  const sim = new Sim(w, st);
  st.tick = tickAt(day, hour);
  const o = st.obcy!;
  o.next = FAR;
  o.wnext = FAR;
  o.enext = FAR;
  for (const t of st.things) if (t.kind === 'koza') t.fuel = 30 * TICKS_PER_HOUR;
  if (opt.zombie) st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
  return sim;
}

/** zarząd syci się, grzeje i wysypia, żeby nie szukał jedzenia ani łóżka w trakcie testu; szwendacze z zegara trybu zombie
    znikają (poza wskazanymi) */
function przygotuj(st: SimState, zostaw: readonly Pawn[] = []): void {
  for (const p of st.pawns) {
    if (p.kind === 'core' && !p.away && p.needs) {
      p.needs.food = 100;
      p.needs.warm = 100;
      p.needs.rest = 100;
    }
  }
  if (st.mode === 'zombie') st.pawns = st.pawns.filter((p) => p.kind !== 'zombie' || zostaw.includes(p));
}

function run(sim: Sim, ok: () => boolean, max = 30000, zostaw: readonly Pawn[] = []): number {
  let k = 0;
  for (; k < max && !ok(); k++) {
    przygotuj(sim.st, zostaw);
    sim.step();
  }
  return k;
}

const wyslij = (sim: Sim, f: Partial<GovEffects>) => applyGov(sim.st, w, { ...emptyEffects(), ...f });

/** plan i marsz pod bramę: wraca, gdy grupa stoi pod bramą (faza brama) */
function podBrame(sim: Sim, p: PlanGoscia, zostaw: readonly Pawn[] = []): void {
  wyslij(sim, { gosc: p });
  run(sim, () => !!sim.st.goscie && grupa(sim.st, p.id).faza === 'brama', 6000, zostaw);
  expect(grupa(sim.st, p.id).faza).toBe('brama');
}

/** rdzeń na wyprawie: nikt z zarządu nie czuwa, nikogo nie ma na mapie */
function rdzenPoza(st: SimState): void {
  for (const p of st.pawns) if (p.kind === 'core') p.away = true;
}

describe('funkcje czyste: strona mapy, miejsce startu, pora wyjścia', () => {
  it('poStronie i przesuniecieWStrone: strona liczona od kafelka za bramą, nie od środka mapy', () => {
    const i = (x: number, y: number) => y * 10 + x;
    const od = i(2, 8);
    expect(poStronie(i(5, 1), od, 10, 'n')).toBe(true);
    expect(przesuniecieWStrone(i(5, 1), od, 10, 'n')).toBe(7);
    expect(poStronie(i(5, 9), od, 10, 'n')).toBe(false);
    expect(poStronie(i(5, 9), od, 10, 's')).toBe(true);
    // „wschód” od bramy przy zachodniej krawędzi to większe x, choć połowa mapy jest dalej
    expect(poStronie(i(3, 5), od, 10, 'e')).toBe(true);
    expect(przesuniecieWStrone(i(7, 8), od, 10, 'e')).toBe(5);
    expect(poStronie(i(2, 5), od, 10, 'e')).toBe(false);
    expect(poStronie(i(1, 5), od, 10, 'w')).toBe(true);
    expect(przesuniecieWStrone(i(2, 3), od, 10, 'w')).toBe(0);
  });

  it('startGoscia: najdalej w kierunku strony od bramy, potem najdalej krokami, potem najmniejszy indeks', () => {
    // ulica na planszy 9×9: poziomo wzdłuż y=4 i pionowo wzdłuż x=7, cała reszta zablokowana
    const n = 9;
    const blocked = new Uint8Array(n * n).fill(1);
    for (let k = 0; k < n; k++) {
      blocked[4 * n + k] = 0;
      blocked[k * n + 7] = 0;
    }
    const od = 4 * n + 4;
    // zachód: skrajny lewy kafelek poziomej ulicy
    expect(startGoscia(blocked, n, od, 'w', 10)).toBe(4 * n + 0);
    // północ i południe: końce pionowej ulicy (4 kroki wzdłuż osi, 7 kroków drogi)
    expect(startGoscia(blocked, n, od, 'n', 10)).toBe(0 * n + 7);
    expect(startGoscia(blocked, n, od, 's', 10)).toBe(8 * n + 7);
    // wschód: skrajny prawy kafelek poziomej ulicy (4 kroki wzdłuż osi), mimo że końce pionowej są dalej krokami
    expect(startGoscia(blocked, n, od, 'e', 10)).toBe(4 * n + 8);
    // zasięg 3 kroki: najdalszy po stronie to kafelek o 3 kroki od `od`
    expect(startGoscia(blocked, n, od, 'w', 3)).toBe(4 * n + 1);
    // po stronie, na której ulicy nie ma (poziomo y=4 nie sięga na południe), bierze najdalszy krokami w ogóle,
    // a przy remisie (oba końce 4 kroki) mniejszy indeks
    const poziomo = new Uint8Array(n * n).fill(1);
    for (let k = 0; k < n; k++) poziomo[4 * n + k] = 0;
    expect(startGoscia(poziomo, n, od, 's', 10)).toBe(4 * n + 0);
    // ulica bez kafelków poza `od`
    const zamknieta = new Uint8Array(n * n).fill(1);
    zamknieta[od] = 0;
    expect(startGoscia(zamknieta, n, od, 'n', 10)).toBe(-1);
  });

  it('startGoscia: oś strony ważniejsza od długości drogi, przy remisie na osi wygrywa dalszy krokami', () => {
    // ulica: z `od` dwa kroki na wschód i pięć na północ (daleko krokami, blisko na osi e), a osobno trzy kroki na wschód
    const n = 9;
    const blocked = new Uint8Array(n * n).fill(1);
    const wolny = (x: number, y: number) => {
      blocked[y * n + x] = 0;
    };
    for (let x = 1; x <= 4; x++) wolny(x, 4);
    for (let y = 0; y <= 4; y++) wolny(1, y);
    // `od` = (1,4): wschód to (2,4) (1 krok), (3,4) (2), (4,4) (3 kroki, 3 na osi); zachód: nic; północ: (1,0)
    const od = 4 * n + 1;
    expect(startGoscia(blocked, n, od, 'e', 20)).toBe(4 * n + 4);
    expect(startGoscia(blocked, n, od, 'n', 20)).toBe(0 * n + 1);
    // dwa kafelki tak samo daleko na osi e: (5,2) przez północną odnogę jest dalej krokami niż (5,4)
    for (let x = 2; x <= 5; x++) wolny(x, 2);
    for (let y = 2; y <= 4; y++) wolny(1, y);
    wolny(5, 4);
    expect(startGoscia(blocked, n, od, 'e', 20)).toBe(2 * n + 5);
  });

  it('ranoGoscia: najbliższe 6:00 plus 0–2 h ze skrótu id, ten sam wynik dla tego samego gościa', () => {
    const wieczor = tickAt(2, 22);
    const r = ranoGoscia(wieczor, 'g1');
    expect(r).toBe(ranoGoscia(wieczor, 'g1'));
    expect(r).toBeGreaterThanOrEqual(tickAt(3, 6));
    expect(r).toBeLessThan(tickAt(3, 8));
    // przed 6:00 chodzi o dzień bieżący
    const noc = tickAt(3, 3);
    expect(ranoGoscia(noc, 'g1')).toBeGreaterThanOrEqual(tickAt(3, 6));
    expect(ranoGoscia(noc, 'g1')).toBeLessThan(tickAt(3, 8));
    const roznia = new Set(Array.from({ length: 12 }, (_, k) => ranoGoscia(wieczor, `g${k}`)));
    expect(roznia.size).toBeGreaterThan(3);
    expect(najblizszaGodzina(tickAt(2, 22), 2)).toBe(tickAt(3, 2));
    expect(najblizszaGodzina(tickAt(3, 1), 2)).toBe(tickAt(3, 2));
  });
});

describe('plan gościa: pionki na ulicy i marsz pod bramę', () => {
  it('plan gościa wystawia pionek z osobą po stronie ulicy i prowadzi go pod bramę bez losowania ze st.rng', () => {
    const a = gra(2, 10);
    const b = gra(2, 10);
    const p0 = plan(1, 'n');
    const ludzi = a.st.people.length;
    wyslij(a, { gosc: p0 });
    // plan idzie przez kolejkę poleceń w stanie, pionek jest od następnego kroku
    expect(a.st.cmds).toHaveLength(1);
    expect(kind(a.st, 'gosc')).toHaveLength(0);
    przygotuj(a.st);
    przygotuj(b.st);
    a.step();
    b.step();
    expect(a.st.cmds).toHaveLength(0);
    const p = kind(a.st, 'gosc')[0];
    expect(p).toBeDefined();
    // osoba w st.people z numerem sim, nie z id zarządu
    expect(p.person).toBe(ludzi);
    const osoba = a.st.people[p.person];
    expect(osoba.id).toMatch(/^s\d+$/);
    expect(osoba.first).toBe(p0.osoby[0].first);
    expect(a.st.people.some((q) => q.id.startsWith('g'))).toBe(false);
    expect(p.look).toBe(4);
    // start: na ulicy, na północ od bramy, nie dalej niż GOSC_FROM kroków, nie na podwórku
    expect(poStronie(tileOf(p), SPOT, size, 'n')).toBe(true);
    expect(yard.has(tileOf(p))).toBe(false);
    expect(p.hp).toBeGreaterThan(0);
    expect(jobText(a.st, w, p)).toBe('Idzie do bramy.');
    expect(govInput(a.st, w, 0).goscie).toEqual([
      { id: 'g1', faza: 'idzie', tile: tileOf(p), pawns: [p.id], ukradl: 0 },
    ]);
    // marsz pod bramę
    const n = run(a, () => grupa(a.st).faza === 'brama', 6000);
    expect(grupa(a.st).faza).toBe('brama');
    expect(tileOf(p)).toBe(SPOT);
    expect(yard.has(tileOf(p))).toBe(false);
    // st.rng ten sam co w grze bez gościa po tylu samo krokach
    for (let k = 0; k < n; k++) {
      przygotuj(b.st);
      b.step();
    }
    expect(JSON.stringify(a.st.rng)).toBe(JSON.stringify(b.st.rng));
    expect(jobText(a.st, w, p)).toBe('Czeka pod bramą.');
    expect(govInput(a.st, w, 0).goscie![0]).toMatchObject({ faza: 'brama', tile: SPOT, pawns: [p.id] });
  });

  it('ten sam plan drugi raz jest pomijany, a gra bez gościa nie zmienia skrótu przez sam applyGov', () => {
    const sim = gra(2, 10);
    const przed = sim.hash();
    wyslij(sim, {});
    expect(sim.hash()).toBe(przed);
    wyslij(sim, { gosc: plan(2, 'n') });
    wyslij(sim, { gosc: plan(2, 'n') });
    sim.step();
    expect(sim.st.goscie).toHaveLength(1);
    expect(kind(sim.st, 'gosc')).toHaveLength(2);
  });

  it('strony świata: goście z każdej strony zaczynają po swojej stronie bramy', () => {
    for (const strona of ['n', 's', 'e', 'w'] as const) {
      const sim = gra(2, 10);
      wyslij(sim, { gosc: plan(1, strona) });
      sim.step();
      const p = kind(sim.st, 'gosc')[0];
      expect(p, strona).toBeDefined();
      expect(poStronie(tileOf(p), SPOT, size, strona), strona).toBe(true);
    }
  });

  it('grupa trzech osób dochodzi razem i staje obok siebie pod bramą', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(3, 'n'));
    const m = czlonkowie(sim.st);
    expect(m).toHaveLength(3);
    const kafelki = m.map(tileOf);
    expect(new Set(kafelki).size).toBe(3);
    expect(kafelki[0]).toBe(SPOT);
    for (const t of kafelki) {
      expect(cheb(t, SPOT)).toBeLessThanOrEqual(3);
      expect(yard.has(t)).toBe(false);
    }
    // trzy różne osoby z trzema różnymi wyglądami
    expect(new Set(m.map((p) => p.person)).size).toBe(3);
    expect(m.map((p) => p.look)).toEqual([4, 5, 6]);
    // zarząd widzi grupę: mówiący pierwszy
    expect(govInput(sim.st, w, 0).goscie![0]).toMatchObject({ faza: 'brama', tile: SPOT, pawns: m.map((p) => p.id) });
  });

  it('największa grupa (12 osób) staje pod bramą na różnych kafelkach i wchodzi na noc na różne kafelki podwórka', () => {
    const sim = gra(2, 21, { ognisko: true });
    podBrame(sim, plan(12, 'n'));
    const m = czlonkowie(sim.st);
    expect(m).toHaveLength(12);
    expect(new Set(m.map(tileOf)).size).toBe(12);
    expect(m.every((p) => cheb(tileOf(p), SPOT) <= 4 && !yard.has(tileOf(p)))).toBe(true);
    expect(new Set(m.map((p) => p.person)).size).toBe(12);
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc') });
    sim.step();
    run(sim, () => m.every((p) => tileOf(p) === p.job?.tile && p.pi >= p.path.length), 8000);
    expect(m.every((p) => yard.has(tileOf(p)))).toBe(true);
    expect(new Set(m.map(tileOf)).size).toBe(12);
  });

  it('plan z więcej niż 12 osobami: symulacja ucina grupę do 12 pionków', () => {
    const sim = gra(2, 10);
    wyslij(sim, { gosc: plan(14, 'n') });
    sim.step();
    expect(kind(sim.st, 'gosc')).toHaveLength(12);
    expect(grupa(sim.st).pawns).toHaveLength(12);
  });

  it('gość, który nie dojdzie do bramy w 2 godziny gry: nie_doszedl i odchodzi', () => {
    const sim = gra(2, 10);
    wyslij(sim, { gosc: plan(2, 'n') });
    sim.step();
    // droga zablokowana: marsz trwa dłużej niż 2 godziny
    grupa(sim.st).at -= GOSC_DOJSCIE;
    run(sim, () => grupa(sim.st).faza !== 'idzie', 100);
    expect(grupa(sim.st).faza).toBe('nie_doszedl');
    expect(goscKoniec(grupa(sim.st))).toBe(true);
    run(sim, () => kind(sim.st, 'gosc').length === 0, 6000);
    expect(kind(sim.st, 'gosc')).toHaveLength(0);
    expect(grupa(sim.st).faza).toBe('nie_doszedl');
  });

  it('bez decyzji zarządu goście po 3 godzinach gry odchodzą sami', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(2, 'n'));
    grupa(sim.st).at -= GOSC_CZEKA;
    run(sim, () => grupa(sim.st).faza === 'poszedl', 8000);
    expect(grupa(sim.st).faza).toBe('poszedl');
    expect(kind(sim.st, 'gosc')).toHaveLength(0);
  });
});

describe('rozkazy: odejdź, jedzenie', () => {
  it('rozkaz odejdz: gość znika za mapą, tam gdzie zaczął', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(2, 'n'));
    const m = czlonkowie(sim.st);
    const domy = m.map((p) => p.home);
    const osobyId = m.map((p) => sim.st.people[p.person].id);
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'odejdz') });
    const ostatni = new Map<number, number>();
    run(sim, () => {
      for (const p of m) if (sim.st.pawns.includes(p)) ostatni.set(p.id, tileOf(p));
      return grupa(sim.st).faza === 'poszedl';
    });
    expect(kind(sim.st, 'gosc')).toHaveLength(0);
    expect(grupa(sim.st).faza).toBe('poszedl');
    // zniknęli na swoich kafelkach startu
    expect(m.map((p) => ostatni.get(p.id))).toEqual(domy);
    for (const id of osobyId) expect(sim.st.people.find((q) => q.id === id)!.gone).toBe(true);
    // zapasy nietknięte
    expect(food(sim.st)).toBe(40);
  });

  it('rozkaz jedzenie: odchodzi jak przy odprawieniu, a koszt płaci karta (symulacja nie rusza zapasów)', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(1, 'n'));
    const przed = food(sim.st);
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'jedzenie') });
    sim.step();
    expect(grupa(sim.st).faza).toBe('odchodzi');
    run(sim, () => grupa(sim.st).faza === 'poszedl', 8000);
    expect(grupa(sim.st).faza).toBe('poszedl');
    expect(food(sim.st)).toBe(przed);
  });

  it('rozkaz bez grupy albo po zakończeniu wizyty nic nie robi (ten sam skrót co w grze bez rozkazu)', () => {
    const a = gra(2, 10);
    const b = gra(2, 10);
    // grupy g9 nie ma: rozkazy znikają bez śladu, pole goscie nie powstaje
    wyslij(a, { goscRozkaz: rozkazy('g9', 'noc', 'odejdz', 'zostan', 'zarzad', 'ugryziony') });
    run(a, () => false, 5);
    run(b, () => false, 5);
    expect(a.st.goscie).toBeUndefined();
    expect(a.hash()).toBe(b.hash());
    // ta sama wizyta w obu grach, zakończona odprawieniem
    for (const sim of [a, b]) {
      podBrame(sim, plan(1, 'n'));
      wyslij(sim, { goscRozkaz: rozkazy('g1', 'odejdz') });
      run(sim, () => grupa(sim.st).faza === 'poszedl', 8000);
    }
    expect(a.hash()).toBe(b.hash());
    // po końcu wizyty dodatkowe rozkazy w jednej grze nic nie zmieniają
    wyslij(a, { goscRozkaz: rozkazy('g1', 'noc', 'zostan', 'zarzad', 'klamie', 'jedzenie', 'puscic', 'odejdz') });
    run(a, () => false, 5);
    run(b, () => false, 5);
    expect(grupa(a.st).faza).toBe('poszedl');
    expect(kind(a.st, 'gosc')).toHaveLength(0);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('noc: ognisko, sen, wyjście rano', () => {
  it('noc: gość wchodzi bramą i śpi przy ognisku, rano wychodzi', () => {
    const sim = gra(2, 21, { ognisko: true });
    podBrame(sim, plan(3, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc') });
    sim.step();
    expect(grupa(sim.st).faza).toBe('w_srodku');
    const m = czlonkowie(sim.st);
    // wchodzą bramą: któryś z nich przechodzi przez kafelek bramy, potem są na podwórku przy ognisku
    let przezBrame = false;
    run(
      sim,
      () => {
        if (m.some((p) => gateTiles.includes(tileOf(p)))) przezBrame = true;
        return m.every((p) => p.job?.t === 'gosc' && tileOf(p) === p.job.tile && yard.has(tileOf(p)));
      },
      8000,
    );
    expect(przezBrame).toBe(true);
    for (const p of m) {
      expect(yard.has(tileOf(p))).toBe(true);
      expect(cheb(tileOf(p), OGNISKO)).toBeLessThanOrEqual(4);
      expect(tileOf(p)).not.toBe(OGNISKO);
    }
    expect(new Set(m.map(tileOf)).size).toBe(3);
    // po zmroku śpią na ziemi
    run(sim, () => hourOf(sim.st.tick) === 23, 3000);
    expect(m.every((p) => p.job?.what === 'spi')).toBe(true);
    expect(jobText(sim.st, w, m[0])).toBe('Śpi przy ogniu.');
    // rysowanie: leży na ziemi
    expect(poseOf(m[0], 0, sim.st.things).lie?.kind).toBe('floor');
    expect(grupa(sim.st).faza).toBe('w_srodku');
    // rano między 6:00 a 8:00 wychodzą bramą
    run(sim, () => grupa(sim.st).faza === 'odchodzi', 12000);
    expect(grupa(sim.st).faza).toBe('odchodzi');
    expect(hourOf(sim.st.tick)).toBeGreaterThanOrEqual(6);
    expect(hourOf(sim.st.tick)).toBeLessThan(8);
    let wychodza = false;
    run(
      sim,
      () => {
        if (m.some((p) => gateTiles.includes(tileOf(p)))) wychodza = true;
        return grupa(sim.st).faza === 'poszedl';
      },
      12000,
    );
    expect(wychodza).toBe(true);
    expect(grupa(sim.st).faza).toBe('poszedl');
    expect(kind(sim.st, 'gosc')).toHaveLength(0);
    expect(food(sim.st)).toBe(40);
  });

  it('bez ogniska śpią przed drzwiami siedziby, na podwórku', () => {
    const sim = gra(2, 21);
    podBrame(sim, plan(2, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc') });
    const m = czlonkowie(sim.st);
    run(sim, () => hourOf(sim.st.tick) === 23, 8000);
    const drzwi = (w.buildings[w.hq].entrances[0].out as number) ?? -1;
    for (const p of m) {
      expect(yard.has(tileOf(p))).toBe(true);
      expect(cheb(tileOf(p), drzwi)).toBeLessThanOrEqual(5);
      expect(p.job?.what).toBe('spi');
    }
  });
});

describe('wybór ogniska', () => {
  const F1 = 66 * size + 32;
  const F2 = 69 * size + 37;
  const GORACE = 100 * TICKS_PER_HOUR;

  /** wpuszczeni na noc idą do ogniska; zwraca kafelki, na których się zatrzymali */
  function usiedli(ogniska: readonly { tile: number; fuel: number }[]): number[] {
    const sim = gra(2, 21, { ogniska });
    podBrame(sim, plan(3, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc') });
    sim.step();
    const m = czlonkowie(sim.st);
    run(sim, () => m.every((p) => tileOf(p) === p.job?.tile && p.pi >= p.path.length), 8000);
    return m.map(tileOf);
  }

  it('palące się ognisko wygrywa z bliższym bramie zimnym', () => {
    const t = usiedli([
      { tile: F1, fuel: GORACE },
      { tile: F2, fuel: 0 },
    ]);
    for (const k of t) {
      expect(cheb(k, F1)).toBeLessThanOrEqual(2);
      expect(cheb(k, F2)).toBeGreaterThan(2);
    }
  });

  it('z dwóch palących się wygrywa to, które jest bliżej bramy', () => {
    const t = usiedli([
      { tile: F1, fuel: GORACE },
      { tile: F2, fuel: GORACE },
    ]);
    for (const k of t) {
      expect(cheb(k, F2)).toBeLessThanOrEqual(2);
      expect(cheb(k, F1)).toBeGreaterThan(2);
    }
  });

  it('bez palących się: najbliższe bramy z zimnych, niezależnie od kolejności na liście rzeczy', () => {
    for (const lista of [
      [F1, F2],
      [F2, F1],
    ]) {
      const t = usiedli(lista.map((tile) => ({ tile, fuel: 0 })));
      for (const k of t) expect(cheb(k, F2)).toBeLessThanOrEqual(2);
    }
  });
});

describe('haczyk: kłamca w nocy', () => {
  /** kłamca wpuszczony na noc o 22:00; zwraca symulację tuż po rozkazach */
  function kłamca(opt: { straz?: boolean } = {}): Sim {
    const sim = gra(2, 22);
    if (opt.straz) {
      // jedna osoba czuwa przy bramie, druga poza mapą
      const [a, b] = kind(sim.st, 'core');
      b.away = true;
      sim.push({ t: 'guard', ids: [a.id], post: 'brama' });
    } else rdzenPoza(sim.st);
    podBrame(sim, plan(1, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc', 'klamie') });
    sim.step();
    return sim;
  }

  it('klamie bez warty: o 2:00 bierze jedzenie i wychodzi, sterta mniejsza o ukradl', () => {
    const sim = kłamca();
    const st = sim.st;
    const przed = food(st);
    expect(przed).toBe(40);
    expect(grupa(st).klamie).toBe(true);
    const p = czlonkowie(st)[0];
    // do 2:00 nic nie ginie
    run(sim, () => hourOf(st.tick) === 1, 12000);
    expect(food(st)).toBe(przed);
    expect(grupa(st).faza).toBe('w_srodku');
    // o 2:00 rusza po jedzenie
    run(sim, () => grupa(st).krad === 'idzie', 2000);
    expect(hourOf(st.tick)).toBe(2);
    const heap = st.things.find((t) => t.kind === 'jedzenie')!;
    let blisko = 99;
    run(
      sim,
      () => {
        if (st.pawns.includes(p)) blisko = Math.min(blisko, cheb(tileOf(p), heap.y * size + heap.x));
        return grupa(st).faza === 'odchodzi';
      },
      6000,
    );
    expect(grupa(st).faza).toBe('odchodzi');
    expect(blisko).toBeLessThanOrEqual(1);
    expect(grupa(st).ukradl).toBe(3);
    expect(food(st)).toBe(przed - 3);
    // wychodzi bramą i znika
    run(sim, () => grupa(st).faza === 'poszedl', 8000);
    expect(grupa(st).faza).toBe('poszedl');
    expect(food(st)).toBe(przed - 3);
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ faza: 'poszedl', ukradl: 3, pawns: [] });
    expect(hourOf(st.tick)).toBeLessThan(8);
  });

  it('kłamca bierze tyle, ile jest, gdy sterta jest mała, a bez jedzenia nic nie bierze', () => {
    const sim = kłamca();
    const st = sim.st;
    const sterta = st.things.find((t) => t.kind === 'jedzenie')!;
    sterta.n = 2;
    run(sim, () => grupa(st).faza === 'poszedl', 30000);
    expect(grupa(st).ukradl).toBe(2);
    expect(food(st)).toBe(0);
    // bez jedzenia: kradzież kończy się niczym, rano wychodzi jak każdy
    const pusty = kłamca();
    pusty.st.things = pusty.st.things.filter((t) => t.kind !== 'jedzenie');
    run(pusty, () => grupa(pusty.st).faza === 'poszedl', 30000);
    expect(grupa(pusty.st).ukradl).toBe(0);
    expect(grupa(pusty.st).krad).toBe('koniec');
  });

  it('kto nie kłamie, śpi do rana i niczego nie bierze', () => {
    const sim = gra(2, 22);
    rdzenPoza(sim.st);
    podBrame(sim, plan(1, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc') });
    run(sim, () => grupa(sim.st).faza === 'poszedl', 30000);
    expect(grupa(sim.st).ukradl).toBe(0);
    expect(grupa(sim.st).krad).toBeUndefined();
    expect(food(sim.st)).toBe(40);
  });

  it('klamie z wartownikiem w pobliżu: faza zlapany, stoją, a łup zgadza się ze stertą', () => {
    const sim = kłamca({ straz: true });
    const st = sim.st;
    const przed = food(st);
    run(sim, () => grupa(st).faza === 'zlapany', 20000);
    expect(grupa(st).faza).toBe('zlapany');
    expect(hourOf(st.tick)).toBe(2);
    const m = czlonkowie(st);
    const tu = m.map(tileOf);
    run(sim, () => false, 200);
    expect(m.map(tileOf)).toEqual(tu);
    expect(m.every((p) => p.pi >= p.path.length)).toBe(true);
    expect(food(st)).toBe(przed - grupa(st).ukradl);
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ faza: 'zlapany', ukradl: grupa(st).ukradl });
    // bez decyzji zarządu stoją do rana, potem odchodzą bez łupu
    run(sim, () => grupa(st).faza === 'poszedl', 30000);
    expect(grupa(st).faza).toBe('poszedl');
    expect(food(st)).toBe(przed);
  });

  describe('złapany z łupem', () => {
    /** kłamca bez warty, który wziął jedzenie i niesie je do bramy; w tej chwili staje obok niego czuwający z zarządu */
    function zLupem(): Sim {
      const sim = kłamca();
      const st = sim.st;
      run(sim, () => grupa(st).krad === 'wraca', 30000);
      expect(grupa(st).krad).toBe('wraca');
      expect(grupa(st).ukradl).toBe(3);
      const zl = czlonkowie(st)[0];
      const straznik = kind(st, 'core')[0];
      straznik.away = false;
      straznik.x = zl.x;
      straznik.y = zl.y;
      straznik.path = [];
      straznik.pi = 0;
      straznik.job = null;
      run(sim, () => grupa(st).faza === 'zlapany', 400);
      expect(grupa(st).faza).toBe('zlapany');
      return sim;
    }

    it('puscic: wychodzi bez łupu, łup wraca na ziemię, ukradl 0', () => {
      const sim = zLupem();
      const st = sim.st;
      expect(food(st)).toBe(37);
      // łup niesie w worku jak szabrownik
      const zl = czlonkowie(st)[0];
      expect(zl.sack?.supplies).toBe(3);
      wyslij(sim, { goscRozkaz: rozkazy('g1', 'puscic') });
      sim.step();
      expect(zl.sack).toBeUndefined();
      expect(grupa(st).ukradl).toBe(0);
      expect(food(st)).toBe(40);
      expect(grupa(st).faza).toBe('odchodzi');
      run(sim, () => grupa(st).faza === 'poszedl', 12000);
      expect(grupa(st).faza).toBe('poszedl');
      expect(food(st)).toBe(40);
    });

    it('puscic: łup nie ląduje na stosie drewna, który leży pod złapanym (ani w stercie, z której wziął)', () => {
      const sim = zLupem();
      const st = sim.st;
      const zl = czlonkowie(st)[0];
      const x = Math.floor(zl.x);
      const y = Math.floor(zl.y);
      // złapany stoi na kafelku sterty jedzenia, z której wziął; kładziemy tam jeszcze stos drewna
      const sterta = st.things.find((t) => t.kind === 'jedzenie' && t.x === x && t.y === y)!;
      expect(sterta.n).toBe(37);
      st.things.push({
        id: st.nextThing++,
        kind: 'drewno',
        x,
        y,
        w: 1,
        h: 1,
        rot: 0,
        n: 4,
        fuel: 0,
        by: -1,
        owner: -1,
      });
      wyslij(sim, { goscRozkaz: rozkazy('g1', 'puscic') });
      sim.step();
      expect(food(st)).toBe(40);
      expect(sterta.n).toBe(37);
      const zwrocone = st.things.filter((t) => t.kind === 'jedzenie' && t !== sterta);
      expect(zwrocone.map((t) => t.n)).toEqual([3]);
      expect(st.things.some((t) => t.kind === 'drewno' && t.x === zwrocone[0].x && t.y === zwrocone[0].y)).toBe(false);
    });

    it('odejdz: odchodzi z łupem, braki w zapasach zostają', () => {
      const sim = zLupem();
      const st = sim.st;
      wyslij(sim, { goscRozkaz: rozkazy('g1', 'odejdz') });
      run(sim, () => grupa(st).faza === 'poszedl', 12000);
      expect(grupa(st).faza).toBe('poszedl');
      expect(grupa(st).ukradl).toBe(3);
      expect(food(st)).toBe(37);
    });

    it('zabity kradnący zostawia łup na ziemi (przez worek), nie rusza rachunku napadu i licznika zabitych', () => {
      const sim = zLupem();
      const st = sim.st;
      // napad z poprzedniej nocy: jego rachunek łupu nie dotyczy jedzenia gościa
      st.raid = {
        at: 0,
        post: 'brama',
        n: 1,
        attack: 0,
        phase: 3,
        outcome: 'odparty',
        gov: false,
        loot: { wood: 0, supplies: 5, scrap: 0 },
        took: { wood: 0, supplies: 5, scrap: 0 },
        from: -1,
        spot: -1,
      };
      const zl = czlonkowie(st)[0];
      sim.wound(zl, 1000);
      sim.step();
      expect(grupa(st).faza).toBe('zginal');
      expect(grupa(st).ukradl).toBe(0);
      expect(food(st)).toBe(40);
      expect(st.raid!.took.supplies).toBe(5);
      expect(st.raid!.loot.supplies).toBe(5);
      expect(st.tally!.killed).toBe(0);
    });
  });
});

describe('przyjęcie: mieszkańcy i zarząd', () => {
  it('zostan: cała grupa jako resident z mieszkaniami', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(3, 'n'));
    const st = sim.st;
    const m = czlonkowie(st);
    const ids = m.map((p) => st.people[p.person].id);
    const przed = govInput(st, w, 0).residents!;
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'zostan') });
    sim.step();
    expect(m.map((p) => p.kind)).toEqual(['resident', 'resident', 'resident']);
    expect(m.every((p) => p.apt >= 0 && p.needs !== null && p.job?.t === 'arrive')).toBe(true);
    expect(grupa(st).przyjety).toBe('mieszkancy');
    expect(goscKoniec(grupa(st))).toBe(true);
    const odczyt = govInput(st, w, 0);
    expect(odczyt.residents).toBe(przed + 3);
    expect(odczyt.lokatorzy!.map((l) => l.id)).toEqual(expect.arrayContaining(ids));
    expect(odczyt.goscie![0]).toMatchObject({ przyjety: true, pawns: m.map((p) => p.id) });
    // idą bramą do swoich mieszkań
    const h = sim.house!;
    run(sim, () => m.every((p) => h.room[tileOf(p)] >= 0), 12000);
    expect(m.every((p) => h.room[tileOf(p)] >= 0)).toBe(true);
    expect(snapshot(st, w).lokatorzy.map((l) => l.id)).toEqual(expect.arrayContaining(ids));
    expect(kind(st, 'gosc')).toHaveLength(0);
  });

  it('zarzad: mówiący core, reszta resident', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(3, 'n'));
    const st = sim.st;
    const m = czlonkowie(st);
    const lider = st.people[m[0].person].id;
    const rdzenPrzed = govInput(st, w, 0).people.length;
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'zarzad') });
    sim.step();
    expect(m.map((p) => p.kind)).toEqual(['core', 'resident', 'resident']);
    expect(grupa(st).przyjety).toBe('zarzad');
    const odczyt = govInput(st, w, 0);
    expect(odczyt.people).toHaveLength(rdzenPrzed + 1);
    expect(odczyt.people.map((p) => p.id)).toContain(lider);
    expect(odczyt.lokatorzy!.map((l) => l.id)).not.toContain(lider);
    // mówiący idzie bramą do siedziby jak przyjęty do zarządu
    expect(m[0].job?.t).toBe('arrive');
    const h = sim.house!;
    run(sim, () => h.room[tileOf(m[0])] >= 0 || m[0].job?.t !== 'arrive', 8000);
    expect(m[0].kind).toBe('core');
  });

  it('awansuj przyjmuje też gościa pod bramą (ten sam helper co dla mieszkańca)', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(1, 'n'));
    const st = sim.st;
    const p = czlonkowie(st)[0];
    expect(awansuj(st, w, st.people[p.person].id)).toBe(true);
    expect(p.kind).toBe('core');
    expect(p.needs).not.toBeNull();
    expect(p.job?.t).toBe('arrive');
  });
});

describe('śmierć i szwendacze', () => {
  it('śmierć mówiącego: prowadzi następny żywy, faza zginal dopiero, gdy nie żyje nikt', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(3, 'n'));
    const st = sim.st;
    const [a, b, c] = czlonkowie(st);
    sim.wound(a, 1000);
    sim.step();
    expect(grupa(st).faza).toBe('brama');
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ faza: 'brama', tile: tileOf(b), pawns: [b.id, c.id] });
    // rozkaz dotyczy żywych
    sim.wound(b, 1000);
    sim.step();
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ faza: 'brama', tile: tileOf(c), pawns: [c.id] });
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'odejdz') });
    sim.step();
    expect(grupa(st).faza).toBe('odchodzi');
    sim.wound(c, 1000);
    sim.step();
    sim.step();
    expect(grupa(st).faza).toBe('zginal');
    expect(goscKoniec(grupa(st))).toBe(true);
    expect(kind(st, 'gosc')).toHaveLength(0);
    expect(st.things.filter((t) => t.kind === 'zwloki')).toHaveLength(3);
    // nie ma wpisu żałoby u zarządu, a licznik zabitych wrogów (raport „Zabitych szwendaczy”) ich nie liczy
    expect(govInput(st, w, 0).dead).toEqual([]);
    expect(st.tally!.killed).toBe(0);
    expect(govInput(st, w, 0).goscie![0]).toMatchObject({ faza: 'zginal', pawns: [] });
  });

  it('część zginęła, reszta odeszła: faza poszedl, nie zginal', () => {
    const sim = gra(2, 10);
    podBrame(sim, plan(2, 'n'));
    const st = sim.st;
    const [a] = czlonkowie(st);
    sim.wound(a, 1000);
    sim.step();
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'odejdz') });
    run(sim, () => grupa(st).faza === 'poszedl' || grupa(st).faza === 'zginal', 8000);
    expect(grupa(st).faza).toBe('poszedl');
  });

  it('w trybie zombie szwendacz przy bramie płoszy gościa: poszedl', () => {
    const sim = gra(2, 10, { zombie: true });
    podBrame(sim, plan(2, 'n'));
    const st = sim.st;
    const m = czlonkowie(st);
    const lider = tileOf(m[0]);
    expect(lider).toBe(SPOT);
    const z = spawnZombie(st, w, SPOT + 5, 16);
    run(sim, () => grupa(st).faza !== 'brama', 200, [z]);
    expect(grupa(st).faza).toBe('odchodzi');
    run(sim, () => grupa(st).faza === 'poszedl' || grupa(st).faza === 'zginal', 8000, [z]);
    expect(grupa(st).faza).toBe('poszedl');
    expect(kind(st, 'gosc')).toHaveLength(0);
    expect(st.things.filter((t) => t.kind === 'zwloki')).toHaveLength(0);
  });

  it('w trybie zombie goście są ofiarami: szwendacz bije gościa, który stoi mu na drodze', () => {
    const sim = gra(2, 10, { zombie: true });
    podBrame(sim, plan(1, 'n'));
    const st = sim.st;
    const p = czlonkowie(st)[0];
    // gość stoi i nie ucieka (złapany czeka na decyzję; spłoszenie dotyczy tylko idących i czekających pod bramą)
    grupa(st).faza = 'zlapany';
    grupa(st).rano = tickAt(5, 8);
    const z = spawnZombie(st, w, SPOT + 1, 16);
    z.job!.phase = 3;
    z.job!.target = p.id;
    run(sim, () => p.hp! < GOSC_HP || !st.pawns.includes(p), 2000, [z]);
    // pogryziony albo zabity, a nie po prostu zniknął za mapą
    const zyje = st.pawns.includes(p);
    expect(zyje || grupa(st).zgin === 1).toBe(true);
    expect(!zyje || p.hp! < GOSC_HP).toBe(true);
    // zabity gość nie jest zabitym wrogiem
    expect(st.tally!.killed).toBe(0);
  });
});

describe('ugryzienie', () => {
  it('noc i ugryziony: osoba o tym indeksie dostaje gorączkę, reszta nie', () => {
    const sim = gra(2, 21, { ognisko: true });
    podBrame(sim, plan(2, 'n', 1, 1));
    const st = sim.st;
    const [a, b] = czlonkowie(st);
    expect(grupa(st).ugryziony).toBe(1);
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc', 'ugryziony') });
    sim.step();
    expect(b.bite).toBeDefined();
    expect(b.limb).toBe(true);
    expect(b.needs).not.toBeNull();
    expect(b.moods.some((m) => m.why.startsWith('Gorączka') || m.d === -15)).toBe(true);
    expect(a.bite).toBeUndefined();
    // drugie polecenie niczego nie dokłada
    const bite = b.bite;
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'ugryziony') });
    sim.step();
    expect(b.bite).toBe(bite);
  });

  it('zostan i ugryziony w dowolnej kolejności: mieszkaniec z gorączką widoczny w odczycie', () => {
    for (const kolejnosc of [
      ['zostan', 'ugryziony'],
      ['ugryziony', 'zostan'],
    ] as const) {
      const sim = gra(2, 10, { zombie: true });
      podBrame(sim, plan(2, 'n', 1, 0));
      const st = sim.st;
      const [a, b] = czlonkowie(st);
      const id = st.people[a.person].id;
      wyslij(sim, { goscRozkaz: rozkazy('g1', ...kolejnosc) });
      sim.step();
      expect(a.kind).toBe('resident');
      expect(a.bite).toBeDefined();
      expect(b.bite).toBeUndefined();
      const l = snapshot(st, w).lokatorzy.find((x) => x.id === id)!;
      expect(l.bite).not.toBeNull();
    }
  });

  it('ugryziony bez wskazanej osoby w planie nie zaraża nikogo', () => {
    const sim = gra(2, 21);
    podBrame(sim, plan(2, 'n'));
    wyslij(sim, { goscRozkaz: rozkazy('g1', 'noc', 'ugryziony') });
    sim.step();
    expect(czlonkowie(sim.st).every((p) => p.bite === undefined)).toBe(true);
  });
});

describe('zapis, wczytanie i stare zapisy', () => {
  it('zapis i wczytanie gościa w środku nocy: ten sam skrót po 6 h', () => {
    const a = gra(2, 21, { ognisko: true });
    rdzenPoza(a.st);
    podBrame(a, plan(2, 'n', 1, 0));
    wyslij(a, { goscRozkaz: rozkazy('g1', 'noc', 'klamie') });
    run(a, () => hourOf(a.st.tick) === 0 && a.st.tick % TICKS_PER_HOUR === 400, 20000);
    expect(grupa(a.st).faza).toBe('w_srodku');
    expect(czlonkowie(a.st).every((p) => p.job?.what === 'spi')).toBe(true);
    const kopia = JSON.parse(JSON.stringify(a.st)) as SimState;
    const b = new Sim(w, kopia);
    expect(b.hash()).toBe(a.hash());
    run(a, () => false, 6 * TICKS_PER_HOUR);
    run(b, () => false, 6 * TICKS_PER_HOUR);
    expect(b.hash()).toBe(a.hash());
    // w tym czasie kłamca zdążył ukraść i grupa odeszła
    expect(grupa(a.st).ukradl).toBe(3);
    expect(JSON.stringify(b.st.goscie)).toBe(JSON.stringify(a.st.goscie));
  });

  it('stary zapis bez goscie się wczytuje, a zarząd widzi pustą listę', () => {
    const st = createSim(w, 3, { core: 2, obcy: true });
    const stary = JSON.parse(JSON.stringify(st)) as SimState;
    expect('goscie' in stary).toBe(false);
    const sim = new Sim(w, stary);
    for (let k = 0; k < 200; k++) sim.step();
    expect('goscie' in stary).toBe(false);
    expect(govInput(stary, w, 0).goscie).toEqual([]);
  });

  it('bez obcy GovInput.goscie nie ma', () => {
    const st = createSim(w, 3, { core: 2 });
    expect('goscie' in govInput(st, w, 0)).toBe(false);
    const z = createSim(w, 3, { core: 2, mode: 'zombie' });
    expect('goscie' in govInput(z, w, 0)).toBe(false);
  });

  it('zarząd, który nie planuje gości, nie zmienia gry: applyGov bez efektów daje ten sam skrót i nie zakłada pola goscie', () => {
    const a = gra(2, 10);
    const b = gra(2, 10);
    for (let k = 0; k < 500; k++) {
      przygotuj(a.st);
      przygotuj(b.st);
      if (k % 100 === 0) wyslij(a, {});
      a.step();
      b.step();
    }
    expect('goscie' in a.st).toBe(false);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('prawdziwy świat demo', () => {
  /** kroki po ulicy od kafelka `od` po czterech sąsiadach, do `cap`; −1: poza zasięgiem (liczone tu osobno od startGoscia) */
  function kroki(blocked: Uint8Array, n: number, od: number, cap: number): Int16Array {
    const dist = new Int16Array(n * n).fill(-1);
    const kolejka = [od];
    dist[od] = 0;
    for (let q = 0; q < kolejka.length; q++) {
      const c = kolejka[q];
      if (dist[c] >= cap) continue;
      const x = c % n;
      for (const o of [c - n, c + n, x > 0 ? c - 1 : -1, x < n - 1 ? c + 1 : -1]) {
        if (o < 0 || o >= n * n || dist[o] >= 0 || blocked[o]) continue;
        dist[o] = dist[c] + 1;
        kolejka.push(o);
      }
    }
    return dist;
  }

  for (const key of ['przymorze', 'lanciego', 'zielonki'])
    it(`${key}: każda strona daje inny start po właściwej stronie bramy, najdalej w jej kierunku`, () => {
      const { w: dw, seed } = demoWorld(key);
      const n = dw.size;
      const st = createSim(dw, seed, { core: 4, obcy: true });
      const sim = new Sim(dw, st);
      const wnetrze = sim as unknown as {
        lay: { outside: { blocked: Uint8Array } };
        outsideOf(t: readonly number[]): number[];
      };
      const spot = wnetrze.outsideOf(gateTilesOf(dw))[0];
      const dist = kroki(wnetrze.lay.outside.blocked, n, spot, GOSC_FROM);
      // przesunięcie wzdłuż osi strony, policzone tu od nowa
      const wzdluz = (i: number, strona: Strona) => {
        const dx = (i % n) - (spot % n);
        const dy = Math.floor(i / n) - Math.floor(spot / n);
        return { n: -dy, s: dy, e: dx, w: -dx }[strona];
      };
      const strony = ['n', 'e', 's', 'w'] as const;
      strony.forEach((strona, k) => {
        applyGov(st, dw, { ...emptyEffects(), gosc: plan(1, strona, k + 1) });
      });
      sim.step();
      const starty: number[] = [];
      strony.forEach((strona, k) => {
        const p = st.pawns.find((q) => q.id === grupa(st, `g${k + 1}`).pawns[0])!;
        const start = p.home;
        starty.push(start);
        expect(start, strona).toBe(startGoscia(wnetrze.lay.outside.blocked, n, spot, strona, GOSC_FROM));
        // oczekiwany: najdalej wzdłuż osi, potem najdalej krokami, potem najmniejszy indeks
        const kandydaci: number[] = [];
        for (let i = 0; i < n * n; i++) if (dist[i] > 0 && wzdluz(i, strona) > 0) kandydaci.push(i);
        expect(kandydaci.length, `${strona}: są kafelki po tej stronie w zasięgu`).toBeGreaterThan(0);
        kandydaci.sort((a, b) => wzdluz(b, strona) - wzdluz(a, strona) || dist[b] - dist[a] || a - b);
        expect(start, strona).toBe(kandydaci[0]);
        expect(wzdluz(start, strona), strona).toBeGreaterThan(0);
        expect(dist[start], strona).toBeGreaterThan(0);
        expect(poStronie(start, spot, n, strona), strona).toBe(true);
        expect(yard.has(start) || dw.fence.yard.includes(start), strona).toBe(false);
      });
      // cztery strony to cztery różne starty, a nie jeden najdalszy kafelek w mapie
      expect(new Set(starty).size).toBe(4);
    });

  it('Przymorze: grupa z każdej strony dochodzi pod bramę, kłamca kradnie nocą, rano nikogo nie ma, a przebieg jest ten sam', () => {
    const { w: dw, seed } = demoWorld('przymorze');
    const przebieg = (strona: Strona) => {
      const st = createSim(dw, seed, { core: 4, obcy: true });
      const sim = new Sim(dw, st);
      st.tick = tickAt(2, 20);
      st.obcy!.next = FAR;
      st.obcy!.wnext = FAR;
      st.obcy!.enext = FAR;
      applyGov(st, dw, { ...emptyEffects(), gosc: plan(5, strona) });
      run(sim, () => !!st.goscie && grupa(st).faza === 'brama', 4000);
      expect(grupa(st).faza).toBe('brama');
      // marsz pod bramę trwa mniej niż godzinę gry
      expect(st.tick - tickAt(2, 20)).toBeLessThan(TICKS_PER_HOUR);
      applyGov(st, dw, { ...emptyEffects(), goscRozkaz: rozkazy('g1', 'noc', 'klamie') });
      run(sim, () => ['poszedl', 'zlapany', 'zginal'].includes(grupa(st).faza), 20000);
      return { faza: grupa(st).faza, ukradl: grupa(st).ukradl, hash: sim.hash() };
    };
    for (const strona of ['n', 'e', 's', 'w'] as const) {
      const a = przebieg(strona);
      expect(['poszedl', 'zlapany']).toContain(a.faza);
      if (a.faza === 'poszedl') expect(a.ukradl).toBe(3);
      expect(przebieg(strona)).toEqual(a);
    }
  });
});

describe('rysowanie i opisy', () => {
  it('gosc jest obcym w świetle (STRANGERS)', () => {
    expect(STRANGERS.has('gosc')).toBe(true);
  });

  it('opisy prac gościa po polsku i po angielsku', async () => {
    const { ustawJezyk } = await import('../../src/core/jezyk.ts');
    const sim = gra(2, 21, { ognisko: true });
    podBrame(sim, plan(1, 'n'));
    const p = czlonkowie(sim.st)[0];
    expect(jobText(sim.st, w, p)).toBe('Czeka pod bramą.');
    ustawJezyk('en');
    try {
      expect(jobText(sim.st, w, p)).toBe('Waiting at the gate.');
    } finally {
      ustawJezyk('pl');
    }
  });
});
