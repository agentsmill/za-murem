/* Zgłoszenie Mateusza z 19.10.2026 (tryb zombie, serwer testowy): po walce z szwendaczem człowiek od razu wracał do domu
   i przerywał polecenie, zapasy z rąk zostawały na ulicy, zamknięte drzwi sąsiada odsyłały go do domu, a zmęczenie
   rzucało się na zarząd tak szybko, że nie wytrzymywał jednej nocy. Testy na prawdziwej symulacji:
   A. polecenie gracza przeżywa walkę odruchową (react): uzbrojony po wygranej walce, bez broni po ucieczce i minucie
      spokoju; polecenie ma WZNOW_PROBY prób (pierwsze wykonanie i wznowienia), a trzecie przerwanie kończy je wpisem
      w kronice zarządu;
   B. ładunek (deski z noszenia łupu, drewno) zostaje przy pionku na czas walki i wraca z nim do pracy, a gdy pionek
      zginie albo polecenie przepadnie, leży tam, gdzie stał;
   C. „Zamknięte na klucz” i „Nikt nie otwiera” trzymają pionka przy drzwiach jak „Idź tu” (godzina gry);
   D. zmęczenie: start 80, na nogach −3,5 na godzinę, ciężka praca −6, a warta od 20:00 do 6:00 po dniu na nogach od
      6:00 kończy się z siłami ponad 0.
   Szwendaczy stawia test (spawnZombie), a cudze, które rodzą się co godzinę, są wymiatane po każdym kroku, żeby przebieg
   nie zależał od losowych narodzin. Świat: atrapa bloku (mockBlock) i demo Lanciego (drzwi sąsiada). */

import { describe, expect, it } from 'vitest';
import { govUpdate, newGov } from '../../src/gov/zarzad.ts';
import { tekstPrzerwania } from '../../src/gov/znaleziska.ts';
import type { WeaponId } from '../../src/sim/bron.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { type NeedCtx, startNeeds, stepNeeds } from '../../src/sim/needs.ts';
import { drzwiBudynku } from '../../src/sim/sasiedzi.ts';
import {
  type Command,
  createSim,
  type Pawn,
  POLECENIA_WZNAWIANE,
  rodzajNapastnika,
  Sim,
  type SimState,
  spawnZombie,
  WZNOW_OKNO,
  WZNOW_PROBY,
  WZNOW_SPOKOJ,
} from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { mockBlock, trunkTile } from './interior-mock.ts';
import { demoWorld, doorWhere, newGame, pusto } from './sasiedzi-pomoc.ts';

const w = mockBlock();
const size = w.size;
const yard = new Set(w.fence.yard);
const atHour = (day: number, h: number) => Math.round(((day - 1) * 24 + h - 15) * 800);
const tileOf = (p: Pick<Pawn, 'x' | 'y'>) => Math.floor(p.y) * size + Math.floor(p.x);
/** pod dachem siedziby albo na podwórku: po właściwej stronie siatki */
const inside = (t: number) => yard.has(t) || w.interior.room[t] >= 0 || w.interior.doors.includes(t);
const gate = w.fence.gate;
const gx = gate.x + gate.w / 2;
const gy = gate.y + gate.h / 2;

/** drzewo za siatką najbliżej bramy, ale co najmniej 10 m od niej (nie krzak, korona od 2 m) */
const DRZEWO = (() => {
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    if (t.kind === 2 || t.r < 2 || inside(trunkTile(w, k))) return;
    const d = Math.hypot(t.x - gx, t.y - gy);
    if (d >= 10 && d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
})();

interface Scena {
  st: SimState;
  sim: Sim;
  a: Pawn;
  /** drugi z zarządu (bez broni), gdy scena ma ich dwóch */
  b?: Pawn;
  /** n kroków symulacji, po każdym wymiecione cudze szwendacze */
  krok(n?: number): void;
  /** kroki, aż warunek będzie prawdziwy (najwyżej limit); zwraca, ile zrobiono */
  az(warunek: () => boolean, limit: number): number;
  /** szwendacz d metrów od pionka (po wschodniej stronie, a gdy tam nie da się stanąć, po innej), idzie na ofiarę */
  szwendacz(p: Pawn, d?: number): Pawn;
  /** szwendacz na podwórku 2–5 m od pionka (wróg w środku: nikt bez polecenia nie wychodzi na dwór) */
  szwendaczNaPodworku(p: Pawn): Pawn;
  /** zwykłe polecenie rąbania drzewa za siatką, a potem czekanie, aż pionek stanie przy pniu i zacznie rąbać */
  doDrzewa(): void;
}

/** Jeden pionek zarządu (opcja core: dwóch, drugi bez broni) w trybie zombie o 10:06 drugiego dnia albo o podanej
    godzinie, syty, ogrzany i wyspany (żadna potrzeba nie przerwie próby), z podaną bronią. Cudze szwendacze znikają po
    każdym kroku. */
function scena(bron: WeaponId | null = 'lom', opcje: { core?: number; godzina?: number } = {}): Scena {
  const st = createSim(w, 3, { core: opcje.core ?? 1, mode: 'zombie' });
  st.tick = atHour(2, opcje.godzina ?? 10.1);
  const sim = new Sim(w, st);
  const swoje = new Set<number>();
  const zamiec = () => {
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie' || swoje.has(p.id));
  };
  zamiec();
  const ludzie = st.pawns.filter((p) => p.kind === 'core');
  const [a, b] = ludzie;
  a.weapon = bron;
  if (b) b.weapon = null;
  for (const q of ludzie) Object.assign(q.needs!, { food: 95, warm: 95, rest: 95 });
  const krok = (n = 1) => {
    for (let k = 0; k < n; k++) {
      sim.step();
      zamiec();
    }
  };
  const az = (warunek: () => boolean, limit: number) => {
    let n = 0;
    while (!warunek() && n < limit) {
      krok();
      n++;
    }
    return n;
  };
  const szwendacz = (p: Pawn, d = 5) => {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ]) {
      const tile = tileOf({ x: p.x + dx, y: p.y + dy });
      if (!sim.canWalk('zombie', tile) || inside(tile)) continue;
      const z = spawnZombie(st, w, tile, 3);
      z.job!.phase = 1;
      swoje.add(z.id);
      return z;
    }
    throw new Error('nie ma gdzie postawić szwendacza');
  };
  const szwendaczNaPodworku = (p: Pawn) => {
    for (const t of yard) {
      const d = Math.hypot((t % size) + 0.5 - p.x, Math.floor(t / size) + 0.5 - p.y);
      if (d < 2 || d > 5 || !sim.canWalk('zombie', t) || w.interior.room[t] >= 0) continue;
      const z = spawnZombie(st, w, t, 3);
      z.job!.phase = 1;
      swoje.add(z.id);
      return z;
    }
    throw new Error('nie ma gdzie postawić szwendacza na podwórku');
  };
  const doDrzewa = () => {
    sim.push({ t: 'chop', ids: [a.id], tree: DRZEWO });
    az(() => a.job?.t === 'chop' && a.job.phase === 1, 600);
    expect(a.job?.t).toBe('chop');
  };
  return { st, sim, a, b, krok, az, szwendacz, szwendaczNaPodworku, doDrzewa };
}

/** wolny kafelek za siatką 12–16 m od bramy, do którego zarząd dojdzie (miejsce na stertę łupu) */
function kafelekNaUlicy(sim: Sim): number {
  for (let dy = 12; dy <= 16; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const i = (gate.y + dy) * size + gate.x + dx;
      if (sim.canWalk('core', i) && !inside(i)) return i;
    }
  throw new Error('nie ma kafelka na ulicy');
}

const sztuki = (st: SimState, kind: string, gdzie: (t: { x: number; y: number }) => boolean = () => true): number =>
  st.things.filter((t) => t.kind === kind && gdzie(t)).reduce((acc, t) => acc + t.n, 0);
const naUlicy = (t: { x: number; y: number }) => !inside(t.y * size + t.x);

describe('A. polecenie gracza przeżywa walkę odruchową', () => {
  it('uzbrojony wygrywa walkę i wraca do tego samego rąbania, a nie do siedziby', () => {
    const s = scena('lom');
    s.doDrzewa();
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    s.sim.wound(z, 999);
    s.krok(3);
    // po wygranej walce pionek idzie z powrotem do tej samej pracy, a nie do siedziby
    expect(s.a.job?.t).toBe('chop');
    expect(s.a.job?.target).toBe(DRZEWO);
    // polecenie jest zapamiętane z tą samą komendą, którą dał gracz, i jest już drugą próbą
    expect(s.a.polecenie?.c).toEqual({ t: 'chop', ids: [s.a.id], tree: DRZEWO });
    expect(s.a.polecenie?.n).toBe(2);
    expect(s.a.polecenie?.od).toBeUndefined();
    // robota idzie do końca: drzewo ścięte, a pionek ani razu nie schował się w siedzibie
    let weszla = false;
    s.az(() => {
      if (inside(tileOf(s.a))) weszla = true;
      return s.st.felled.includes(DRZEWO);
    }, 2500);
    expect(s.st.felled.includes(DRZEWO)).toBe(true);
    expect(weszla).toBe(false);
    // skończona praca kończy polecenie (zwykłe done), nic się już nie wznowi
    s.az(() => !s.a.job, 200);
    expect(s.a.polecenie).toBeUndefined();
  });

  it('„Idź tu” poza podwórkiem też przeżywa walkę: ten sam kafelek, ta sama godzina czekania', () => {
    const s = scena('lom');
    const cel = kafelekNaUlicy(s.sim);
    s.sim.push({ t: 'move', ids: [s.a.id], to: cel });
    s.krok(2);
    expect(s.a.job?.t).toBe('go');
    const tile = s.a.job!.tile;
    s.az(() => Math.hypot(s.a.x - gx, s.a.y - gy) > 6 && !inside(tileOf(s.a)), 300);
    const z = s.szwendacz(s.a, 4);
    s.az(() => s.a.job?.t === 'fight', 300);
    s.sim.wound(z, 999);
    s.krok(3);
    expect(s.a.job).toMatchObject({ t: 'go', tile, order: true });
    expect(s.a.polecenie?.c).toEqual({ t: 'move', ids: [s.a.id], to: tile });
    s.az(() => tileOf(s.a) === tile && s.a.job?.phase === 1, 600);
    expect(tileOf(s.a)).toBe(tile);
    // po dojściu czeka godzinę jak po zwykłym „Idź tu”
    expect(s.a.job?.until).toBeGreaterThanOrEqual(s.st.tick + TICKS_PER_HOUR - 5);
  });

  it('bez broni ucieka do siedziby, a po minucie bez wroga przy sobie i przy celu wraca do polecenia', () => {
    const s = scena(null);
    s.doDrzewa();
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
    expect(s.a.job?.t).toBe('go');
    // szwendacz stoi 3 m od drzewa, w czystej linii: pionek siedzi w siedzibie i czeka
    const pien = trunkTile(w, DRZEWO);
    const stoi = () => {
      z.x = (pien % size) + 0.5 + 3;
      z.y = Math.floor(pien / size) + 0.5;
      z.path = [];
      z.pi = 0;
    };
    for (let k = 0; k < 400; k++) {
      s.krok();
      stoi();
    }
    expect(inside(tileOf(s.a))).toBe(true);
    expect(s.a.job?.t).not.toBe('chop');
    // polecenie czeka, zapamiętane z przerwaniem
    expect(s.a.polecenie?.c).toEqual({ t: 'chop', ids: [s.a.id], tree: DRZEWO });
    expect(s.a.polecenie?.od).toBeDefined();
    // szwendacz znika: pionek wraca dopiero po minucie gry od ostatniego razu, kiedy widział zagrożenie (myśli co sekundę
    // realną, więc nie dokładnie w tym ticku), ale bez zwłoki ponad ten obrót
    const zag = s.a.polecenie!.zag!;
    expect(zag).toBeGreaterThan(s.st.tick - 40);
    s.sim.wound(z, 999);
    const zabity = s.st.tick;
    s.az(() => s.a.job?.t === 'chop', 200);
    expect(s.a.job?.t).toBe('chop');
    expect(s.a.job?.target).toBe(DRZEWO);
    const wznowione = s.st.tick - 1;
    expect(wznowione - zag).toBeGreaterThanOrEqual(WZNOW_SPOKOJ);
    expect(wznowione - zabity).toBeLessThanOrEqual(2 * 20);
    expect(s.a.polecenie?.n).toBe(2);
  });

  it('trzecie przerwanie (WZNOW_PROBY) kończy polecenie: wpis w kronice, pionek idzie do domu', () => {
    const s = scena('lom');
    s.doDrzewa();
    expect(s.a.polecenie?.n).toBe(1);
    // pierwsze i drugie przerwanie: pionek wraca, polecenie jest w kolejnej próbie
    for (let k = 1; k < WZNOW_PROBY; k++) {
      const z = s.szwendacz(s.a);
      s.az(() => s.a.job?.t === 'fight', 300);
      expect(s.a.job?.t, `przerwanie ${k}`).toBe('fight');
      s.sim.wound(z, 999);
      s.az(() => s.a.job?.t === 'chop', 100);
      expect(s.a.job?.t, `wznowienie ${k}`).toBe('chop');
      expect(s.a.polecenie?.n).toBe(k + 1);
    }
    expect(s.st.przerwane).toBeUndefined();
    // trzecie przerwanie: polecenie przepada
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    expect(s.a.polecenie).toBeUndefined();
    expect(s.st.przerwane).toHaveLength(1);
    expect(s.st.przerwane![0]).toMatchObject({ imie: s.st.people[s.a.person].first, co: 'chop', kto: 'zombie' });
    s.sim.wound(z, 999);
    s.az(() => inside(tileOf(s.a)), 1200);
    expect(inside(tileOf(s.a))).toBe(true);
    expect(s.st.felled.includes(DRZEWO)).toBe(false);
    expect(s.a.job?.t).not.toBe('chop');
    // kronika zarządu: „<imię> przerywa: <co> (szwendacze).”, po polsku i po angielsku
    const gov = newGov(1, 'zombie');
    govUpdate(gov, govInput(s.st, w, 0));
    const wpis = gov.log.find((l) => /przerywa/.test(l.txt.pl));
    expect(wpis).toBeDefined();
    expect(wpis!.txt.pl).toBe(`${s.st.people[s.a.person].first} przerywa: ścinanie drzewa (szwendacze).`);
    expect(wpis!.txt.en).toMatch(/breaks off: felling a tree \(shamblers\)\.$/);
    // wpis jest raz: drugi krok zarządu na tym samym wejściu go nie dubluje
    govUpdate(gov, govInput(s.st, w, 1));
    expect(gov.log.filter((l) => /przerywa/.test(l.txt.pl))).toHaveLength(1);
  });

  it('nowe polecenie zastępuje stare, a polecenie bez przerwania niczego nie wznawia', () => {
    const s = scena('lom');
    s.doDrzewa();
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    s.sim.wound(z, 999);
    s.krok(3);
    expect(s.a.polecenie?.n).toBe(2);
    // gracz daje nowe polecenie: stare znika, nowe zapamiętane od pierwszej próby
    const cel = kafelekNaUlicy(s.sim);
    s.sim.push({ t: 'move', ids: [s.a.id], to: cel });
    s.krok(2);
    expect(s.a.polecenie?.c.t).toBe('move');
    expect(s.a.polecenie?.n).toBe(1);
    // bez polecenia, w trybie zombie, bezczynny za siatką dalej wraca do domu (reguła z projektu trybu zombie)
    const b = scena('lom');
    b.a.polecenie = undefined;
    Object.assign(b.a, { x: (cel % size) + 0.5, y: Math.floor(cel / size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
    b.az(() => inside(tileOf(b.a)), 1200);
    expect(inside(tileOf(b.a))).toBe(true);
  });

  it('przerwane polecenie, którego nie da się wznowić, wygasa po WZNOW_OKNO bez wpisu w kronice', () => {
    const s = scena(null);
    s.doDrzewa();
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
    s.sim.wound(z, 999);
    // ranny (zdrowie 30) nie wraca do roboty, tylko siedzi w siedzibie
    s.a.needs!.health = 30;
    s.krok(WZNOW_OKNO - 200);
    expect(s.a.polecenie?.od).toBeDefined();
    expect(s.a.job?.t).not.toBe('chop');
    s.krok(400);
    expect(s.a.polecenie).toBeUndefined();
    expect(s.st.przerwane).toBeUndefined();
    expect(s.a.job?.t).not.toBe('chop');
  });
});

describe('B. zapasy nie zostają na ulicy', () => {
  /** pionek niesie deski z ulicy na podwórko (polecenie „Zanieść na podwórko”), szwendacz zaczepia go po drodze */
  function zDeskami(bron: WeaponId | null = 'lom') {
    const s = scena(bron);
    const miejsce = kafelekNaUlicy(s.sim);
    const sterta = {
      id: s.st.nextThing++,
      kind: 'deski',
      x: miejsce % size,
      y: Math.floor(miejsce / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 6,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    s.st.things.push(sterta);
    const naPodworku = sztuki(s.st, 'deski', (t) => inside(t.y * size + t.x));
    s.sim.push({ t: 'carry', ids: [s.a.id], thing: sterta.id });
    s.az(() => s.a.job?.t === 'carry' && s.a.job.phase === 1, 600);
    expect(s.a.job?.n).toBe(6);
    expect(s.a.job?.what).toBe('deski');
    const z = s.szwendacz(s.a, 4);
    return { ...s, z, naPodworku };
  }

  it('niesione deski wracają z pionkiem po walce, na ulicy nie ma nowej sterty, a na końcu są na podwórku', () => {
    const s = zDeskami();
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    // w trakcie walki deski są przy pionku (w jego stanie), nie pod nogami
    expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
    expect(s.a.polecenie?.od).toBeDefined();
    s.sim.wound(s.z, 999);
    s.krok(3);
    expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
    expect(s.a.job).toMatchObject({ t: 'carry', n: 6, what: 'deski', order: true });
    s.az(() => s.a.job?.t !== 'carry', 800);
    expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
    expect(sztuki(s.st, 'deski', (t) => inside(t.y * size + t.x))).toBe(s.naPodworku + 6);
  });

  it('pionek, który zginie w walce, zostawia deski tam, gdzie stał', () => {
    const s = zDeskami();
    s.az(() => s.a.job?.t === 'fight', 300);
    const gdzie = { x: s.a.x, y: s.a.y };
    expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
    s.sim.wound(s.a, 999);
    s.krok(2);
    expect(s.st.pawns.includes(s.a)).toBe(false);
    const sterty = s.st.things.filter((t) => t.kind === 'deski' && naUlicy(t));
    expect(sterty.reduce((acc, t) => acc + t.n, 0)).toBe(6);
    for (const t of sterty) expect(Math.hypot(t.x + 0.5 - gdzie.x, t.y + 0.5 - gdzie.y)).toBeLessThan(3);
  });

  it('gdy polecenie przepada (trzecie przerwanie, WZNOW_PROBY), deski leżą tam, gdzie pionek stał', () => {
    const s = zDeskami();
    // skrót: pionek ma już wszystkie próby za sobą (pełny cykl pokazuje test o WZNOW_PROBY)
    s.a.polecenie!.n = WZNOW_PROBY;
    s.az(() => s.a.job?.t === 'fight', 300);
    const gdzie = { x: s.a.x, y: s.a.y };
    expect(s.a.polecenie).toBeUndefined();
    expect(s.st.przerwane).toHaveLength(1);
    expect(s.st.przerwane![0].co).toBe('carry');
    const sterty = s.st.things.filter((t) => t.kind === 'deski' && naUlicy(t));
    expect(sterty.reduce((acc, t) => acc + t.n, 0)).toBe(6);
    for (const t of sterty) expect(Math.hypot(t.x + 0.5 - gdzie.x, t.y + 0.5 - gdzie.y)).toBeLessThan(3);
  });

  it('bez broni ucieka z deskami do siedziby; gdy polecenie wygasa albo gracz da nowe, deski lądują na podwórku', () => {
    const wPokojach = (st: SimState) => sztuki(st, 'deski', (t) => w.interior.room[t.y * size + t.x] >= 0);
    const naPodworku = (st: SimState) => sztuki(st, 'deski', (t) => yard.has(t.y * size + t.x));
    for (const nowePolecenie of [false, true]) {
      const s = zDeskami(null);
      const podworko0 = naPodworku(s.st);
      s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
      expect(s.a.job?.t).toBe('go');
      // deski są przy pionku, nie pod nogami; ranny nie wznawia, siedzi w siedzibie
      expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
      s.sim.wound(s.z, 999);
      s.a.needs!.health = 30;
      s.az(() => inside(tileOf(s.a)) && !s.a.job, 600);
      s.krok(200);
      expect(s.a.polecenie?.od).toBeDefined();
      expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
      expect(wPokojach(s.st)).toBe(0);
      if (nowePolecenie) {
        // stare polecenie przepada razem z zapamiętanym ładunkiem: deski na podwórko, nowe polecenie zapamiętane
        s.sim.push({ t: 'move', ids: [s.a.id], to: tileOf(s.a) });
        s.krok(2);
        expect(s.a.polecenie?.c.t).toBe('move');
      } else {
        s.krok(WZNOW_OKNO + 100);
        expect(s.a.polecenie).toBeUndefined();
      }
      expect(sztuki(s.st, 'deski', naUlicy)).toBe(0);
      expect(wPokojach(s.st)).toBe(0);
      expect(naPodworku(s.st)).toBe(podworko0 + 6);
    }
  });

  it('niesione drewno też wraca z pionkiem: po walce dalej do składu, nic nie leży na ulicy', () => {
    const s = scena('lom');
    const miejsce = kafelekNaUlicy(s.sim);
    const stos = {
      id: s.st.nextThing++,
      kind: 'drewno',
      x: miejsce % size,
      y: Math.floor(miejsce / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 6,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    s.st.things.push(stos);
    const wSkladzie = () => sztuki(s.st, 'drewno', (t) => w.interior.sklad.includes(t.y * size + t.x));
    const przed = wSkladzie();
    s.sim.push({ t: 'haul', ids: [s.a.id], thing: stos.id });
    s.az(() => s.a.job?.t === 'haul' && s.a.job.phase === 1, 600);
    expect(s.a.carry).toBe(6);
    const z = s.szwendacz(s.a, 4);
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    expect(sztuki(s.st, 'drewno', naUlicy)).toBe(0);
    s.sim.wound(z, 999);
    s.krok(3);
    expect(sztuki(s.st, 'drewno', naUlicy)).toBe(0);
    expect(s.a.carry).toBe(6);
    expect(s.a.job?.t).toBe('haul');
    s.az(() => wSkladzie() >= przed + 6, 800);
    expect(wSkladzie()).toBe(przed + 6);
    expect(sztuki(s.st, 'drewno', naUlicy)).toBe(0);
  });
});

describe('C. zamknięte drzwi nie odsyłają do domu', () => {
  const lanciego = demoWorld('lanciego');
  /** kafelek pod pionkiem na mapie Lanciego (bok 384 m, a atrapy 128 m) */
  const tileL = (p: Pick<Pawn, 'x' | 'y'>) => Math.floor(p.y) * lanciego.size + Math.floor(p.x);

  /** gra w trybie zombie na Lanciego; zarząd syty i ogrzany, cudzy szwendacze wymiatani po każdym kroku */
  function przyDrzwiach() {
    const sim = newGame('lanciego', 'zombie');
    const st = sim.st;
    const p = st.pawns.find((q) => q.kind === 'core')!;
    for (const q of st.pawns) if (q.needs) Object.assign(q.needs, { food: 95, warm: 95, rest: 95 });
    const krok = (n = 1) => {
      for (let k = 0; k < n; k++) {
        sim.step();
        st.pawns = st.pawns.filter((q) => q.kind !== 'zombie');
      }
    };
    const az = (warunek: () => boolean, limit: number) => {
      let n = 0;
      while (!warunek() && n < limit) {
        krok();
        n++;
      }
      return n;
    };
    const wDomu = (q: Pawn) => sim.house!.room[tileL(q)] >= 0;
    return { sim, st, p, krok, az, wDomu };
  }

  it('„Otworzyć” drzwi na klucz: pionek stoi przy drzwiach godzinę gry, potem wraca do domu', () => {
    const { door, out } = doorWhere(lanciego, 'zombie', (d) => d.s === 'zamkniete' && !!d.k);
    const g = przyDrzwiach();
    g.sim.push({ t: 'open', ids: [g.p.id], door });
    g.az(() => g.st.sasiedzi?.napis?.co === 'na_klucz', 2000);
    expect(g.st.sasiedzi?.napis?.co).toBe('na_klucz');
    const t0 = g.st.tick;
    g.krok(2);
    // czeka na miejscu przed drzwiami, nie idzie do siedziby
    expect(g.p.job).toMatchObject({ t: 'go', phase: 1 });
    expect(tileL(g.p)).toBe(out);
    g.az(() => g.st.tick >= t0 + TICKS_PER_HOUR - 60, TICKS_PER_HOUR);
    expect(g.p.job?.t).toBe('go');
    expect(tileL(g.p)).toBe(out);
    // po godzinie, bez polecenia, zwykła reguła trybu zombie: do siedziby
    g.az(() => g.wDomu(g.p), 1500);
    expect(g.wDomu(g.p)).toBe(true);
    expect(g.st.tick - t0).toBeGreaterThanOrEqual(TICKS_PER_HOUR);
  });

  it('„Zapukać”, gdy nikt nie otwiera: tak samo czeka przy drzwiach godzinę gry', () => {
    const { door, out } = doorWhere(lanciego, 'zombie', (d) => d.s === 'zamkniete');
    const g = przyDrzwiach();
    g.sim.lokatorzy = pusto(lanciego);
    g.sim.push({ t: 'knock', ids: [g.p.id], door });
    g.az(() => ['nikt', 'szuranie'].includes(g.st.sasiedzi?.napis?.co ?? ''), 2000);
    expect(['nikt', 'szuranie']).toContain(g.st.sasiedzi?.napis?.co);
    const t0 = g.st.tick;
    g.az(() => g.st.tick >= t0 + TICKS_PER_HOUR - 60, TICKS_PER_HOUR);
    expect(g.p.job?.t).toBe('go');
    expect(tileL(g.p)).toBe(out);
    g.az(() => g.wDomu(g.p), 1500);
    expect(g.wDomu(g.p)).toBe(true);
  });
});

describe('D. zmęczenie przychodzi wolniej', () => {
  const ctx = (o: Partial<NeedCtx> = {}): NeedCtx => ({
    temp: 20,
    fire: false,
    asleep: false,
    busy: false,
    dark: false,
    inside: true,
    company: 2,
    ...o,
  });
  const poGodzinie = (c: NeedCtx) => {
    const n = { ...startNeeds(), rest: 50 };
    stepNeeds(n, c, 1);
    return n.rest;
  };

  it('start z siłami 80, na nogach −3,5 na godzinę, ciężka praca −6, sen jak dotąd (łóżko +12, podłoga +8)', () => {
    expect(startNeeds().rest).toBe(80);
    expect(poGodzinie(ctx())).toBeCloseTo(46.5, 6);
    expect(poGodzinie(ctx({ busy: true }))).toBeCloseTo(44, 6);
    expect(poGodzinie(ctx({ asleep: true }))).toBeCloseTo(62, 6);
    expect(poGodzinie(ctx({ asleep: true, floor: true }))).toBeCloseTo(58, 6);
  });

  it('warta od 20:00 do 6:00 po dniu na nogach od 6:00 kończy się z siłami ponad 0', () => {
    const st = createSim(w, 3, { core: 1 });
    st.tick = atHour(2, 6);
    const sim = new Sim(w, st);
    const a = st.pawns.find((p) => p.kind === 'core')!;
    Object.assign(a.needs!, { food: 95, warm: 95, rest: 100 });
    while (st.tick < atHour(2, 20)) {
      sim.step();
      // jedzenie i ciepło nie są tu tematem: zarząd ma być na nogach, a nie głodny albo zmarznięty
      Object.assign(a.needs!, { food: Math.max(a.needs!.food, 60), warm: Math.max(a.needs!.warm, 60) });
    }
    // cały dzień na nogach: 14 godzin po 3,5 (bez ciężkiej pracy), czyli około 50 (dawniej 30)
    expect(a.needs!.rest).toBeGreaterThan(40);
    sim.push({ t: 'guard', ids: [a.id], post: 'brama' });
    let najmniej = 100;
    while (st.tick < atHour(3, 6)) {
      sim.step();
      Object.assign(a.needs!, { food: Math.max(a.needs!.food, 60), warm: Math.max(a.needs!.warm, 60) });
      najmniej = Math.min(najmniej, a.needs!.rest);
    }
    expect(najmniej).toBeGreaterThan(0);
    expect(a.needs!.rest).toBeGreaterThan(5);
    expect(a.job?.t).toBe('guard');
  });
});

describe('zapis i wczytanie w trakcie przerwanego polecenia', () => {
  it('stan po JSON daje ten sam przebieg i to samo wznowienie (sim.hash)', () => {
    const s = scena(null);
    s.doDrzewa();
    const z = s.szwendacz(s.a);
    s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
    s.sim.wound(z, 999);
    s.a.needs!.health = 30;
    // pionek siedzi w siedzibie z przerwanym poleceniem, którego jeszcze nie wznowił (za słaby)
    s.az(() => inside(tileOf(s.a)) && !s.a.job, 600);
    s.krok(120);
    expect(s.a.polecenie?.od).toBeDefined();
    expect(s.a.job?.t).not.toBe('chop');
    const zapis = JSON.stringify(s.st);
    const kopia = new Sim(w, JSON.parse(zapis) as SimState);
    // zdrowie wraca w kroku 50; pionek wraca do rąbania (widać je w trakcie) i ścina drzewo do końca przebiegu
    const dalej = (sim: Sim) => {
      const p = sim.st.pawns.find((q) => q.kind === 'core')!;
      let rabal = false;
      for (let k = 0; k < 1100; k++) {
        if (k === 50) p.needs!.health = 80;
        sim.step();
        sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
        if (p.job?.t === 'chop') rabal = true;
      }
      return rabal;
    };
    const rabal1 = dalej(s.sim);
    const rabal2 = dalej(kopia);
    expect(rabal1).toBe(true);
    expect(rabal2).toBe(true);
    expect(s.st.felled).toContain(DRZEWO);
    expect(kopia.st.felled).toContain(DRZEWO);
    expect(kopia.hash()).toBe(s.sim.hash());
  });
});

describe('lista zapamiętywanych poleceń i opisy do kroniki', () => {
  it('lista poleceń do wznawiania nie zawiera warty, ataku, wyprawy i amputacji', () => {
    for (const t of ['guard', 'alarm', 'attack', 'away', 'back', 'amputate', 'meet'])
      expect(POLECENIA_WZNAWIANE as readonly string[]).not.toContain(t);
    for (const t of ['move', 'chop', 'haul', 'wreck', 'carry', 'patch', 'open', 'knock'])
      expect(POLECENIA_WZNAWIANE as readonly string[]).toContain(t);
  });

  it('każde zapamiętywane polecenie (wrak z obiema odmianami) ma w kronice opis po polsku i po angielsku', () => {
    const klucze = [...POLECENIA_WZNAWIANE.filter((t) => t !== 'wreck'), 'wreck', 'wreck:szukaj', 'wreck:rozbierz'];
    const widziane = new Set<string>();
    for (const co of klucze) {
      const t = tekstPrzerwania({ imie: 'Ola', co });
      expect(t.pl, co).toMatch(/^Ola przerywa: .+ \(szwendacze\)\.$/);
      expect(t.en, co).toMatch(/^Ola breaks off: .+ \(shamblers\)\.$/);
      // opis z tabeli, a nie ogólne „polecenie” z zapasowego wpisu
      expect(t.pl, co).not.toMatch(/: polecenie \(/);
      expect(t.en, co).not.toMatch(/: the order \(/);
      widziane.add(t.pl);
    }
    // wrak bez odmiany i klucz spoza tabeli
    expect(tekstPrzerwania({ imie: 'Ola', co: 'nie-ma-takiego' }).pl).toBe('Ola przerywa: polecenie (szwendacze).');
    expect(widziane.size).toBeGreaterThan(30);
  });
});

/* Poprawki po przeglądzie (Opus): drewno w rękach przy wznowieniu, wznowienie budowy, rezerwacje celu, kto przerwał,
   drewno zdjęte z rąk w zapasach i cel „szabru” przy drzwiach budynku. */

/** plan ogródka w głębi podwórka (najdalej od siedziby, jak pozwala canPlace) i sterty desek po `ile` sztuk co najmniej
    `daleko` m od niego, żeby dojście po materiał trwało; zwraca miejsce planu */
function planISterty(s: Scena, sterty: number, ile: number, daleko: number): { x: number; y: number } {
  let plan: { x: number; y: number } | undefined;
  for (const t of [...yard].sort((p, q) => q - p)) {
    const x = t % size;
    const y = Math.floor(t / size);
    if (canPlace(s.st, w, 'ogrodek', x, y, 0).ok) {
      plan = { x, y };
      break;
    }
  }
  if (!plan) throw new Error('nie ma miejsca na plan');
  let ile0 = 0;
  for (const t of [...yard].sort((p, q) => p - q)) {
    if (ile0 === sterty) break;
    const x = t % size;
    const y = Math.floor(t / size);
    const zajete = s.st.things.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    if (Math.hypot(x - plan.x, y - plan.y) < daleko || zajete || !s.sim.canWalk('core', t)) continue;
    s.st.things.push({
      id: s.st.nextThing++,
      kind: 'deski',
      x,
      y,
      w: 1,
      h: 1,
      rot: 0,
      n: ile,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    ile0++;
  }
  if (ile0 < sterty) throw new Error('nie ma miejsca na sterty desek');
  return plan;
}

/** wszystkie deski w grze: sterty, w rękach (praca i zapamiętany ładunek) i doniesione na plany */
const deskiRazem = (st: SimState): number => {
  let n = sztuki(st, 'deski');
  for (const p of st.pawns) {
    if (p.job?.what === 'deski') n += p.job.n;
    if (p.polecenie?.niesie?.job.what === 'deski') n += p.polecenie.niesie.job.n;
  }
  for (const b of st.builds) n += b.have.deski ?? 0;
  return n;
};

describe('poprawki po przeglądzie: drewno w rękach przy wznowieniu', () => {
  /** pionek bez broni niesie z ulicy 6 sztuk drewna do składu, szwendacz go spłasza, a on siedzi w siedzibie ranny
      (nie wznawia), z drewnem zapamiętanym w stanie */
  function uciekinierZDrewnem() {
    const s = scena(null);
    const miejsce = kafelekNaUlicy(s.sim);
    const stos = {
      id: s.st.nextThing++,
      kind: 'drewno',
      x: miejsce % size,
      y: Math.floor(miejsce / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 6,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    s.st.things.push(stos);
    s.sim.push({ t: 'haul', ids: [s.a.id], thing: stos.id });
    s.az(() => s.a.job?.t === 'haul' && s.a.job.phase === 1, 600);
    expect(s.a.carry).toBe(6);
    const z = s.szwendacz(s.a, 4);
    s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
    expect(s.a.polecenie?.niesie?.drewno).toBe(6);
    s.sim.wound(z, 999);
    s.a.needs!.health = 30;
    s.az(() => inside(tileOf(s.a)) && !s.a.job, 800);
    s.krok(5);
    expect(s.a.polecenie?.od).toBeDefined();
    return s;
  }

  it('drewno, które pionek już trzyma, nie ginie pod odzyskanym: razem tyle samo przed i po wznowieniu', () => {
    const s = uciekinierZDrewnem();
    // pionek stoi w siedzibie z drewnem w rękach (np. po noszeniu do pełnego składu) i właśnie może wrócić do pracy
    s.a.carry = 3;
    const razem = () => sztuki(s.st, 'drewno') + s.a.carry + (s.a.polecenie?.niesie?.drewno ?? 0);
    const przed = razem();
    s.a.needs!.health = 80;
    s.a.polecenie!.zag = s.st.tick - 100;
    s.a.wait = s.st.tick;
    s.az(() => s.a.job?.t === 'haul', 60);
    expect(s.a.job?.t).toBe('haul');
    expect(s.a.job?.phase).toBe(1);
    // z powrotem w rękach to, co niósł z ulicy, a to, co trzymał, leży na składzie albo obok
    expect(s.a.carry).toBe(6);
    expect(razem()).toBe(przed);
    // po zniesieniu na skład drewno jest na stosie (potem pionek może zająć się kozą i spalić je jako opał: to nie strata)
    s.az(() => s.a.job?.t !== 'haul', 800);
    expect(s.a.carry).toBe(0);
    expect(razem()).toBe(przed);
  });

  it('drewno zdjęte z rąk na czas przerwania dalej liczy się w zapasach (stock.wood i woodCarried)', () => {
    const s = scena(null);
    const miejsce = kafelekNaUlicy(s.sim);
    const stos = {
      id: s.st.nextThing++,
      kind: 'drewno',
      x: miejsce % size,
      y: Math.floor(miejsce / size),
      w: 1,
      h: 1,
      rot: 0,
      n: 6,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    s.st.things.push(stos);
    s.sim.push({ t: 'haul', ids: [s.a.id], thing: stos.id });
    s.az(() => s.a.job?.t === 'haul' && s.a.job.phase === 1, 600);
    const przed = snapshot(s.st, w).stock;
    expect(przed.woodCarried).toBe(6);
    s.szwendacz(s.a, 4);
    s.az(() => s.a.job?.t === 'go' && !s.a.job.order, 300);
    expect(s.a.carry).toBe(0);
    expect(s.a.polecenie?.niesie?.drewno).toBe(6);
    const po = snapshot(s.st, w).stock;
    expect(po.woodCarried).toBe(6);
    expect(po.wood).toBe(przed.wood);
    expect(po.mats.drewno).toBe(przed.mats.drewno);
  });
});

describe('poprawki po przeglądzie: budowa', () => {
  it('budowa przerwana nocą wygraną walką wraca do tego samego planu (order: true)', () => {
    const s = scena('lom', { godzina: 22.5 });
    const miejsce = planISterty(s, 1, 20, 12);
    s.sim.push({ t: 'build', ids: [s.a.id], kind: 'ogrodek', x: miejsce.x, y: miejsce.y, rot: 0 });
    // w drodze po deski (faza 0), daleko od celu
    s.az(() => s.a.job?.t === 'build' && s.a.job.phase === 0 && s.a.path.length - s.a.pi > 4, 60);
    expect(s.a.job?.t).toBe('build');
    const plan = s.st.builds[0];
    expect(plan).toBeDefined();
    expect(s.a.polecenie?.c).toMatchObject({ t: 'build', kind: 'ogrodek', x: miejsce.x, y: miejsce.y, rot: 0 });
    const z = s.szwendaczNaPodworku(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    expect(s.a.job?.t).toBe('fight');
    s.sim.wound(z, 999);
    s.krok(5);
    // nocą nikt sam nie bierze się za plan (startAnyBuild tylko za dnia), więc to wznowienie polecenia
    expect(s.a.job).toMatchObject({ t: 'build', order: true, target: plan.id });
    expect(s.a.polecenie?.n).toBe(2);
    expect(s.st.builds).toHaveLength(1);
    expect(plan.by).toBe(s.a.id);
  });

  it('plan, który gracz odwołał w czasie przerwania, nie powstaje od nowa przy wznowieniu', () => {
    const s = scena('lom', { godzina: 22.5 });
    const miejsce = planISterty(s, 1, 20, 12);
    s.sim.push({ t: 'build', ids: [s.a.id], kind: 'ogrodek', x: miejsce.x, y: miejsce.y, rot: 0 });
    s.az(() => s.a.job?.t === 'build' && s.a.job.phase === 0 && s.a.path.length - s.a.pi > 4, 60);
    const plan = s.st.builds[0];
    const z = s.szwendaczNaPodworku(s.a);
    s.az(() => s.a.job?.t === 'fight', 300);
    s.sim.push({ t: 'unbuild', ids: [], id: plan.id });
    s.krok(1);
    expect(s.st.builds).toHaveLength(0);
    s.sim.wound(z, 999);
    s.krok(30);
    expect(s.st.builds).toHaveLength(0);
    expect(s.a.job?.t).not.toBe('build');
    expect(s.a.polecenie).toBeUndefined();
  });

  it('plan przejęty przez drugiego w czasie przerwania: pierwszy go nie dubluje, a jego ładunek wraca na podwórko', () => {
    const s = scena(null, { core: 2 });
    const a = s.a;
    const b = s.b!;
    const miejsce = planISterty(s, 2, 14, 8);
    s.sim.push({ t: 'build', ids: [a.id], kind: 'ogrodek', x: miejsce.x, y: miejsce.y, rot: 0 });
    s.az(() => a.job?.t === 'build' && a.job.phase === 1 && a.job.n > 0, 1500);
    expect(a.job?.t).toBe('build');
    const plan = s.st.builds[0];
    const niesie = a.job!.n;
    const z = s.szwendaczNaPodworku(a);
    s.az(() => a.job?.t === 'go' && !a.job.order, 300);
    expect(a.polecenie?.niesie?.job).toMatchObject({ t: 'build', what: 'deski', n: niesie });
    // zwolniona rezerwacja planu: wolny drugi człowiek bierze go za dnia
    s.sim.wound(z, 999);
    a.needs!.health = 30;
    s.az(() => plan.by === b.id, 600);
    expect(plan.by).toBe(b.id);
    const przed = deskiRazem(s.st);
    // pierwszy znowu może iść, ale plan ma już kogoś innego
    a.needs!.health = 80;
    a.polecenie!.zag = s.st.tick - 100;
    a.wait = s.st.tick;
    let razem = 0;
    for (let k = 0; k < 300; k++) {
      s.krok();
      if (a.job?.t === 'build' && a.job.target === plan.id) razem++;
    }
    expect(razem).toBe(0);
    expect(b.job?.t).toBe('build');
    expect(plan.by).toBe(b.id);
    // polecenie przepadło po cichu, a deski pierwszego wróciły: nic nie zginęło
    expect(a.polecenie).toBeUndefined();
    expect(s.st.przerwane).toBeUndefined();
    expect(deskiRazem(s.st)).toBe(przed);
  });
});

describe('poprawki po przeglądzie: kto przerwał i cel „szabru”', () => {
  it('kronika podaje, kto przerwał polecenie: szwendacze, szabrownicy albo napastnicy', () => {
    expect(rodzajNapastnika({ kind: 'zombie' })).toBe('zombie');
    expect(rodzajNapastnika({ kind: 'szabrownik' })).toBe('szabrownik');
    expect(rodzajNapastnika({ kind: 'zbir', wrogi: true })).toBe('wrogi');
    const tekst = (kto?: 'zombie' | 'szabrownik' | 'wrogi') =>
      tekstPrzerwania({ imie: 'Ola', co: 'chop', ...(kto ? { kto } : {}) });
    // bez pola (i dla szwendaczy) jak dotąd
    expect(tekst()).toEqual({
      pl: 'Ola przerywa: ścinanie drzewa (szwendacze).',
      en: 'Ola breaks off: felling a tree (shamblers).',
    });
    expect(tekst('zombie')).toEqual(tekst());
    expect(tekst('szabrownik')).toEqual({
      pl: 'Ola przerywa: ścinanie drzewa (szabrownicy).',
      en: 'Ola breaks off: felling a tree (looters).',
    });
    expect(tekst('wrogi')).toEqual({
      pl: 'Ola przerywa: ścinanie drzewa (napastnicy).',
      en: 'Ola breaks off: felling a tree (attackers).',
    });
  });

  it('przeszukanie cudzego pomieszczenia ma cel przy drzwiach budynku, więc wróg pod drzwiami wstrzymuje wznowienie', () => {
    const lanciego = demoWorld('lanciego');
    const { bid } = doorWhere(lanciego, 'zombie', (d) => d.s === 'zamkniete' && !d.k);
    const sim = newGame('lanciego', 'zombie');
    const cel = (sim as unknown as { celPolecenia(c: Command): number }).celPolecenia({
      t: 'loot',
      ids: [1],
      bid,
      room: 0,
    });
    expect(cel).toBe(drzwiBudynku(lanciego, bid).zewn[0].out);
    expect(cel).toBeGreaterThanOrEqual(0);
  });
});
