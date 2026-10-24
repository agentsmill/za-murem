/* Okazje ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, sekcja „Okazje”): krótkie rozdziały
   nad rozdziałem ścieżki, otwierane przez zdarzenie w grze (wędrowiec przy siatce, handlarz, napad, stado pod siatką,
   ugryzienie, zwłoki, obca ekipa przy aucie, a od 19.10.2026 „Zima idzie”). Wszystko na prawdziwej symulacji z dem
   (Przymorze to blok, Zielonki to dom jednorodzinny), w obu trybach tam, gdzie okazja w nich istnieje.

   Zasady, które pilnuje pierwsza część: okazje ruszają dopiero po krokach samouczka, widać najwyżej jedną naraz w kolejności
   O5, O6, O4, O3, O8, O2, O1, O7 (życie przed gośćmi; wyższa wypiera niższą, niższa wraca, gdy wyższa się skończy), tytuł
   niesie „Teraz:” / “Now:” sam, cel niezrobiony czeka na następną taką okazję, a zrobiony nie wraca, i każda okazja
   zamyka się sama, kiedy zdarzenie mija (nic nie wisi w nieskończoność). Dalej po jednej części na okazję: wyzwalacz,
   cele (fałsz przed czynnością, prawda po niej, czynność tym samym poleceniem co w grze) i zamknięcie. Ostatnia część to
   teksty: tytuły i cele we wszystkich wariantach (mysz i dotyk, polski i angielski, blok i dom, zwykły i zombie). */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { nearWindow } from '../../src/sim/budowle.ts';
import { dayOf, hourOf, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import {
  AMPUTATE_TICKS,
  AMPUTATE_WINDOW,
  createSim,
  crewAt,
  infect,
  type Pawn,
  RISE_TICKS,
  Sim,
  type SimState,
} from '../../src/sim/sim.ts';
import { wreckStage, wrecksOf, wreckTile } from '../../src/sim/surowce.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { TUT_STEPS } from '../../src/sim/tutorial.ts';
import { FENCE_BEARS } from '../../src/sim/zombie.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import {
  celeHtml,
  celWOknie,
  type DefOkazji,
  jestStanSciezki,
  KLUCZE_OKAZJI,
  type KluczOkazji,
  krokSciezki,
  nowyStanSciezki,
  type StanSciezki,
  stanZZapisu,
  type WidokSciezki,
  widokSciezki,
  zaliczony,
} from '../../src/ui/sciezka.ts';
import { OKAZJE } from '../../src/ui/sciezka-okazje.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import type { World } from '../../src/world/world.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { demoWorld, core as rdzen } from './sasiedzi-pomoc.ts';
import {
  badajDo,
  bezSzwendaczy,
  dajMaterial,
  MAPY,
  type Mapa,
  postawPracownie,
  swiezySwiat,
  wybierzBadanie,
} from './sciezka-mapy.ts';
import {
  bezAutomatu,
  type Demo,
  doPierwszegoRaportu,
  type Gra,
  graj,
  graZSymulacji,
  klon,
  krok,
  krokiSymulacji,
  odczyt,
  odczytZ,
  przezZapis,
  TRYBY,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

/** dwa dema z projektu zadania: blok (Przymorze) i dom jednorodzinny (Zielonki) */
const DEMA2: readonly Demo[] = ['przymorze', 'zielonki'];
const KOMBINACJE = DEMA2.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));
const KOMBINACJE_ZWYKLE = DEMA2.map((key) => [key, 'zwykly'] as const);
const KOMBINACJE_ZOMBIE = DEMA2.map((key) => [key, 'zombie'] as const);

/* ---------------------------------------------------------------- gry i kroki */

/** Gry z wędrowcami, handlarzem i ekipami (`obcy`) po pierwszym raporcie (drugi dzień około 6:00), liczone raz na demo i
    tryb; test dostaje klon. Ścieżka w tych grach jest świeża: bez okazji i bez wpisów okazji w `zrobione`, żeby to, co
    działo się w pierwszą noc (napad, stado), nie wpływało na testy. */
const bazy = new Map<string, Gra>();

function poRaporcieZObcymi(key: Demo, mode: GameMode): Gra {
  const klucz = `${key}:${mode}`;
  let b = bazy.get(klucz);
  if (!b) {
    const w = demoWorld(key);
    b = graZSymulacji(key, mode, 5, new Sim(w, createSim(w, 5, { core: 4, mode, obcy: true })));
    doPierwszegoRaportu(b);
    b.sciezka = stanZZapisu(undefined, b.sim.st, b.gov);
    bazy.set(klucz, b);
  }
  return klon(b);
}

/** Gra bez losowych wizyt: nikt nie przyjdzie, dopóki test tego nie zażąda (zegary obcych ustawione na teraz). */
function bezObcych(g: Gra): Gra {
  const o = g.sim.st.obcy!;
  o.next = -1;
  o.wnext = -1;
  o.enext = -1;
  return g;
}

/** Krok ścieżki na odczycie bez zarządu (okazje czytają tylko symulację, a wejście zarządu kosztuje milisekundy). */
function krokTani(g: Gra): void {
  g.sciezka = krokSciezkiBezZarzadu(g);
}

function krokSciezkiBezZarzadu(g: Gra): StanSciezki {
  return krokSciezki(g.sciezka, odczytZ(g.sim.st, g.sim.w, null));
}

/** sekunda przy ekranie bez zarządu: 20 kroków symulacji i tani krok ścieżki */
function s1(g: Gra): void {
  krokiSymulacji(g);
  krokTani(g);
}

/** Sekunda po sekundzie, aż warunek będzie spełniony; przekroczenie limitu to błąd testu. */
function dopoki(g: Gra, warunek: () => boolean, limit = 2400): void {
  for (let n = 0; n < limit; n++) {
    if (warunek()) return;
    s1(g);
  }
  const obcy = g.sim.st.pawns
    .filter((p) => ['wedrowiec', 'handlarz', 'obcy', 'szabrownik'].includes(p.kind))
    .map((p) => `${p.kind}#${p.id} faza ${p.job?.phase} ${p.job?.t} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
  throw new Error(
    `warunek nie został spełniony w ${limit} s przy ekranie (tick ${g.sim.st.tick}, dzień ${dobaG(g)}, godz. ${godzinaG(g)}); obcy: ${obcy.join('; ') || 'brak'}`,
  );
}

const godzinaG = (g: Gra): number => hourOf(g.sim.st.tick);
const dobaG = (g: Gra): number => dayOf(g.sim.st.tick);

/** do najbliższej pełnej godziny o numerze `godzina` (dziś, a jeśli już minęła, jutro) */
function doGodziny(g: Gra, godzina: number): void {
  const dzis = tickAt(dobaG(g), godzina);
  const cel = g.sim.st.tick < dzis ? dzis : tickAt(dobaG(g) + 1, godzina);
  dopoki(g, () => g.sim.st.tick >= cel, 4 * 960);
}

const okazja = (g: Gra) => g.sciezka.okazja;
const klucz = (g: Gra): string | undefined => g.sciezka.okazja?.k;

/** zarząd syty, wypoczęty i w cieple: pilna potrzeba nie przerwie polecenia */
function dbaj(g: Gra): void {
  for (const p of rdzen(g.sim)) Object.assign(p.needs!, { food: 100, rest: 100, warm: 100, health: 100 });
}

/** Stan okazji wraca do czystego: bez otwartej okazji i bez zaliczonych celów okazji. Zdarzenia z wcześniejszej gry (naturalny
    napad stada, zgon, dobicie ciała przez zarząd) nie mogą wpływać na scenariusz testu. */
function czystaOkazja(g: Gra): Gra {
  const s = structuredClone(g.sciezka);
  delete s.okazja;
  for (const k of Object.keys(s.zrobione)) if (/^o\d\./.test(k)) delete s.zrobione[k];
  g.sciezka = s;
  return g;
}

/** osoba z zarządu najbliżej pionka: gracz zaznacza kogoś, kto zdąży (wędrowiec przy siatce stoi najwyżej 40 minut) */
function najblizszy(g: Gra, cel: { x: number; y: number }): Pawn {
  return rdzen(g.sim)
    .filter((p) => !p.away)
    .sort((a, b) => Math.hypot(a.x - cel.x, a.y - cel.y) - Math.hypot(b.x - cel.x, b.y - cel.y))[0];
}

/** Osoba stoi już przy siatce, tuż przy wędrowcu: kto z zarządu został zaznaczony, ten tam jest (wędrowiec przystaje przy
    siatce najwyżej na 40 minut gry, ocalały w trybie zombie na 20, a rozmowa trwa 5). Tu ją tam stawiamy, żeby test nie
    zależał od tego, gdzie akurat była. */
function przysun(g: Gra, kto: Pawn, cel: { x: number; y: number }): void {
  const { w } = g.sim;
  const i = w.fence.yard
    .filter((k) => !w.blocked[k])
    .sort(
      (a, b) =>
        Math.hypot((a % w.size) + 0.5 - cel.x, Math.floor(a / w.size) + 0.5 - cel.y) -
          Math.hypot((b % w.size) + 0.5 - cel.x, Math.floor(b / w.size) + 0.5 - cel.y) || a - b,
    )[0];
  Object.assign(kto, { x: (i % w.size) + 0.5, y: Math.floor(i / w.size) + 0.5, path: [], pi: 0, job: null, wait: 0 });
}

/** kafelek pod pionkiem (do menu poleceń) */
const kafelek = (g: Gra, p: { x: number; y: number }): number => Math.floor(p.y) * g.sim.w.size + Math.floor(p.x);

/* ---------------------------------------------------------------- zasady okazji */

describe('okazje: lista i zasady', () => {
  it('lista okazji ma w ustalonej kolejności O5, O6, O4, O3, O8, O2, O1, O7 i każda ma cele', () => {
    expect(OKAZJE.map((d) => d.k)).toEqual(['o5', 'o6', 'o4', 'o3', 'o8', 'o2', 'o1', 'o7']);
    expect([...KLUCZE_OKAZJI].sort()).toEqual(['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8']);
    for (const d of OKAZJE) expect(d.cele.length, d.k).toBeGreaterThan(0);
  });

  it('stan z okazją O8 jest poprawny, a stary zapis (bez O8) dalej też', () => {
    expect(jestStanSciezki({ ...nowyStanSciezki(), okazja: { k: 'o8', od: 5 } })).toBe(true);
    expect(jestStanSciezki({ ...nowyStanSciezki(), okazja: { k: 'o7', od: 5, zabici: 3, cel: 2 } })).toBe(true);
    expect(jestStanSciezki({ ...nowyStanSciezki(), okazja: { k: 'o9', od: 5 } })).toBe(false);
  });

  it('okazje nie otwierają się przed końcem kroków samouczka, a po nim (albo bez samouczka) ruszają', () => {
    // ugryzienie w kończynę od pierwszej chwili gry w trybie zombie
    const w = demoWorld('przymorze');
    const sim = new Sim(w, createSim(w, 5, { core: 4, mode: 'zombie' }));
    const g = graZSymulacji('przymorze', 'zombie', 5, sim);
    infect(sim.st, rdzen(sim)[0], true);
    expect(sim.st.tut.step).toBe(0);
    krok(g);
    expect(okazja(g)).toBeUndefined();
    // w trakcie kroków (jeszcze nie skończone) też nie
    sim.st.tut.step = TUT_STEPS.length - 1;
    krok(g);
    expect(okazja(g)).toBeUndefined();
    sim.st.tut.step = TUT_STEPS.length;
    krok(g);
    expect(klucz(g)).toBe('o5');
    // świat bez wnętrza ma samouczek wyłączony (−1): okazje ruszają
    const g2 = graZSymulacji('przymorze', 'zombie', 5, new Sim(w, createSim(w, 5, { core: 4, mode: 'zombie' })));
    infect(g2.sim.st, rdzen(g2.sim)[0], true);
    g2.sim.st.tut.step = -1;
    krok(g2);
    expect(klucz(g2)).toBe('o5');
  });

  it('samouczek wraca do trwania (stan ustawiony ręcznie): otwarta okazja się zamyka', () => {
    const w = demoWorld('przymorze');
    const sim = new Sim(w, createSim(w, 5, { core: 4, mode: 'zombie' }));
    const g = graZSymulacji('przymorze', 'zombie', 5, sim);
    sim.st.tut.step = TUT_STEPS.length;
    infect(sim.st, rdzen(sim)[0], true);
    krok(g);
    expect(klucz(g)).toBe('o5');
    sim.st.tut.step = 1;
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });
});

describe('okazje: silnik na własnych definicjach', () => {
  /** flagi, które test przestawia; definicje atrapy czytają tylko je */
  interface Flagi {
    otwiera: boolean;
    trwa: boolean;
    cel: number;
    zrobiony: boolean;
  }
  const flagi = (): Flagi => ({ otwiera: true, trwa: true, cel: 7, zrobiony: false });
  const atrapa = (k: KluczOkazji, f: Flagi, opcje: Partial<DefOkazji> = {}): DefOkazji => ({
    k,
    tytul: () => `Teraz: ${k}`,
    otwiera: () => f.otwiera,
    trwa: () => f.trwa,
    cel: () => f.cel,
    cele: [{ key: 'a', tekst: () => 'cel a', jak: () => 'jak a', zrobiony: () => f.zrobiony }],
    ...opcje,
  });

  /** gra z samouczkiem skończonym i krok ścieżki na atrapie okazji (rozdziały prawdziwe) */
  function silnik(...okazje: DefOkazji[]) {
    const w = demoWorld('przymorze');
    const sim = new Sim(w, createSim(w, 5, { core: 4 }));
    sim.st.tut.step = TUT_STEPS.length;
    const g = graZSymulacji('przymorze', 'zwykly', 5, sim);
    const krokA = () => {
      g.sciezka = krokSciezki(g.sciezka, odczytZ(sim.st, w, null), ROZDZIALY, okazje);
      return g.sciezka;
    };
    const widokA = () => widokSciezki(g.sciezka, odczytZ(sim.st, w, null), ROZDZIALY, okazje);
    return { g, sim, krokA, widokA };
  }

  it('okazja bez czego ratować (cel −1) się nie otwiera, a z celem trzyma jego id', () => {
    const f = flagi();
    const { krokA } = silnik(atrapa('o1', f));
    f.cel = -1;
    expect(krokA().okazja).toBeUndefined();
    f.cel = 7;
    expect(krokA().okazja).toMatchObject({ k: 'o1', cel: 7 });
    // okazja bez `cel` w definicji nie ma pola w stanie
    const h = flagi();
    const { krokA: krokB } = silnik(atrapa('o2', h, { cel: undefined }));
    expect(krokB().okazja?.cel).toBeUndefined();
    expect(Object.keys(krokB().okazja ?? {}).sort()).toEqual(['k', 'od', 'zabici']);
  });

  it('wyzwalacz otwarcia bywa ostrzejszy niż trwanie: otwarta trwa, dopóki trwa, choćby wyzwalacz już nie był prawdziwy', () => {
    const f = flagi();
    const { krokA } = silnik(atrapa('o4', f));
    f.otwiera = false;
    expect(krokA().okazja, 'wyzwalacz fałszywy: nie otwiera').toBeUndefined();
    f.otwiera = true;
    expect(krokA().okazja?.k).toBe('o4');
    f.otwiera = false;
    expect(krokA().okazja?.k, 'wyzwalacz zgasł, zdarzenie trwa').toBe('o4');
    f.trwa = false;
    expect(krokA().okazja, 'zdarzenie minęło').toBeUndefined();
    // otwiera się tylko, gdy po otwarciu zdarzenie by trwało (inaczej otwierałaby się i zamykała na zmianę)
    f.otwiera = true;
    expect(krokA().okazja).toBeUndefined();
  });

  it('cel zaliczony razem z końcem zdarzenia liczy się przed zamknięciem; zrobiony nie wraca, a okazja bez niezrobionych celów się nie otwiera', () => {
    const f = flagi();
    const { krokA, widokA } = silnik(atrapa('o5', f));
    expect(krokA().okazja?.k).toBe('o5');
    expect(widokA().okazja?.biezacy?.key).toBe('a');
    // cel staje się prawdziwy dokładnie wtedy, gdy zdarzenie mija
    f.zrobiony = true;
    f.trwa = false;
    const s = krokA();
    expect(s.okazja).toBeUndefined();
    expect(s.zrobione).toHaveProperty(['o5.a']);
    // zdarzenie wraca, ale cel jest zrobiony: okazji nie ma
    f.trwa = true;
    f.zrobiony = false;
    expect(krokA().okazja).toBeUndefined();
    expect(widokA().okazja).toBeNull();
  });

  it('cel prawdziwy już przy otwarciu zalicza się w tym samym kroku i zamyka okazję', () => {
    const f = flagi();
    f.zrobiony = true;
    const { krokA } = silnik(atrapa('o6', f));
    const s = krokA();
    expect(s.okazja).toBeUndefined();
    expect(s.zrobione).toHaveProperty(['o6.a']);
  });

  it('okazja zamyka się, gdy wszystkie cele są zrobione, choć zdarzenie trwa; niezrobiony cel zostaje i okazja trwa', () => {
    const f = flagi();
    const g2 = flagi();
    const dwa = atrapa('o3', f, {
      cele: [
        { key: 'a', tekst: () => 'cel a', jak: () => 'jak a', zrobiony: () => f.zrobiony },
        { key: 'b', tekst: () => 'cel b', jak: () => 'jak b', zrobiony: () => g2.zrobiony },
      ],
    });
    const { krokA, widokA } = silnik(dwa);
    expect(krokA().okazja?.k).toBe('o3');
    f.zrobiony = true;
    expect(krokA().okazja?.k, 'drugi cel niezrobiony').toBe('o3');
    expect(widokA().okazja?.cele.map((c) => c.done)).toEqual([true, false]);
    expect(widokA().okazja?.biezacy?.key).toBe('b');
    g2.zrobiony = true;
    expect(krokA().okazja, 'oba zrobione').toBeUndefined();
  });

  it('ważniejsza okazja wypiera niższą i nie pozwala jej wrócić, dopóki trwa; po jej końcu niższa wraca ze świeżym tickiem', () => {
    const wysoka = flagi();
    const niska = flagi();
    niska.cel = 3;
    const { g, sim, krokA } = silnik(atrapa('o8', wysoka), atrapa('o2', niska));
    wysoka.trwa = false;
    wysoka.otwiera = false;
    expect(krokA().okazja?.k, 'tylko niska trwa').toBe('o2');
    const od = g.sciezka.okazja!.od;
    sim.st.tick += 50;
    wysoka.trwa = true;
    wysoka.otwiera = true;
    expect(krokA().okazja?.k, 'wysoka wypiera niską').toBe('o8');
    sim.st.tick += 50;
    wysoka.trwa = false;
    wysoka.otwiera = false;
    const s = krokA();
    expect(s.okazja?.k, 'po wysokiej wraca niska').toBe('o2');
    expect(s.okazja?.cel).toBe(3);
    expect(s.okazja?.od).toBeGreaterThan(od);
    // niższa nie wypiera wyższej
    wysoka.trwa = true;
    wysoka.otwiera = true;
    expect(krokA().okazja?.k).toBe('o8');
    niska.otwiera = true;
    expect(krokA().okazja?.k).toBe('o8');
  });

  it('krok niczego nie zmienia na wejściu (zamrożony stan nie rzuca), a wynik nie dzieli z nim obiektów', () => {
    const f = flagi();
    const { g, sim, krokA } = silnik(atrapa('o1', f));
    krokA();
    const przed = structuredClone(g.sciezka);
    zamroz(g.sciezka);
    const w = sim.w;
    const nowy = krokSciezki(g.sciezka, odczytZ(sim.st, w, null), ROZDZIALY, [atrapa('o1', f)]);
    expect(g.sciezka).toEqual(przed);
    expect(nowy.okazja).not.toBe(g.sciezka.okazja);
    expect(nowy.okazja).toEqual(g.sciezka.okazja);
  });
});

/** zamraża obiekt i wszystko, co w nim siedzi: zmiana wejścia w czystej funkcji rzuci wyjątek (moduły ES są ścisłe) */
function zamroz<T>(x: T): T {
  if (x && typeof x === 'object') {
    Object.freeze(x);
    for (const v of Object.values(x)) zamroz(v);
  }
  return x;
}

describe('okazje: kolejność, wypieranie i powrót', () => {
  /** zombie na Przymorzu o 21:30 drugiego dnia z trzema wyzwalaczami naraz: ugryzienie w kończynę (O5), zwłoki, które wstaną
      (O6), i stado pod siatką (O4) */
  function troje() {
    const g = bezObcych(poRaporcieZObcymi('przymorze', 'zombie'));
    const { st, w } = g.sim;
    dopoki(g, () => st.tick >= tickAt(2, 21.5), 4 * 960);
    czystaOkazja(g);
    g.sim.spawnAtFence(6, w.buildings[w.hq].entrances[0].out);
    const [a, b] = rdzen(g.sim);
    // zwłoki, które wstaną za godzinę (zmarły gdzieś na podwórku)
    st.things.push({
      id: st.nextThing++,
      kind: 'zwloki',
      x: Math.floor(b.x),
      y: Math.floor(b.y),
      w: 1,
      h: 1,
      rot: 0,
      n: 3,
      fuel: st.tick + RISE_TICKS,
      by: -1,
      owner: -1,
    });
    return { g, st, a, b, cialo: st.things.at(-1)! };
  }

  it('przy trzech wyzwalaczach widać jedną okazję, w kolejności życie przed stadem; kolejna wchodzi, gdy poprzednia się skończy', () => {
    const { g, st, a, cialo } = troje();
    krok(g);
    expect(
      st.pawns.filter((p) => p.kind === 'zombie' && p.job?.phase === 2).length,
      'stado napiera',
    ).toBeGreaterThanOrEqual(3);
    expect(klucz(g), 'stado i zwłoki: zwłoki pierwsze').toBe('o6');
    infect(st, a, true);
    krok(g);
    expect(klucz(g), 'ugryzienie wypiera zwłoki').toBe('o5');
    expect(widok(g).okazja!.tytul).toBe('Teraz: ugryzienie');
    // ugryzienie mija (amputacja się udała): wraca niższa okazja, zwłoki
    delete a.bite;
    delete a.limb;
    a.maimed = true;
    krok(g);
    expect(klucz(g), 'po ugryzieniu wracają zwłoki').toBe('o6');
    expect(okazja(g)!.cel).toBe(cialo.id);
    // zwłoki dobite: zostaje stado
    cialo.fuel = 0;
    krok(g);
    expect(klucz(g), 'po zwłokach stado').toBe('o4');
    // stado rozeszło się: nic nie wisi
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });

  it('wyższa okazja wypiera niższą w trakcie, a niższa wraca ze świeżym tickiem otwarcia, gdy wyższa się skończy', () => {
    const g = bezObcych(poRaporcieZObcymi('przymorze', 'zwykly'));
    const { st } = g.sim;
    dopoki(g, () => st.tick >= tickAt(2, 9), 4 * 960);
    // wędrowiec (O1)
    st.obcy!.wnext = st.tick;
    dopoki(g, () => !!st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1), 1500);
    expect(klucz(g)).toBe('o1');
    const od = okazja(g)!.od;
    // handlarz (O2) staje pod bramą: wyższa
    st.obcy!.next = st.tick;
    dopoki(g, () => !!st.pawns.find((p) => p.kind === 'handlarz' && p.job?.phase === 1), 1500);
    // wędrowiec mógł już odejść; wtedy O2 sam, inaczej O2 wyparł O1
    expect(klucz(g)).toBe('o2');
    const wed = st.pawns.find((p) => p.kind === 'wedrowiec' && (p.job?.phase ?? 4) < 2);
    if (wed) {
      // O1 czeka za O2, jego trigger trwa
      expect(okazja(g)!.od).toBeGreaterThan(od);
      // handlarz odchodzi: wraca O1 (jeśli wędrowiec jeszcze stoi)
      const h = st.pawns.find((p) => p.kind === 'handlarz')!;
      h.job!.phase = 2;
      krok(g);
      expect(klucz(g)).toBe('o1');
    }
  });

  it('okazja zapisana w stanie i wczytana daje ten sam widok, a po wczytaniu mija razem ze zdarzeniem', () => {
    const g = bezObcych(poRaporcieZObcymi('przymorze', 'zombie'));
    const { st } = g.sim;
    doGodziny(g, 12);
    const [a] = rdzen(g.sim);
    infect(st, a, true);
    krok(g);
    expect(klucz(g)).toBe('o5');
    const h = przezZapis(g);
    expect(h.sciezka.okazja).toEqual(g.sciezka.okazja);
    expect(widok(h)).toEqual(widok(g));
    // po wczytaniu okno ugryzienia się kończy: okazja znika
    h.sim.st.tick += AMPUTATE_WINDOW + 10;
    krok(h);
    expect(okazja(h)).toBeUndefined();
  });
});

describe('okazje: zima i reszta (kolejność O5, O6, O4, O3, O8, O2, O1, O7)', () => {
  it('zima wypiera gości (handlarza, wędrowca), ustępuje napadowi i wraca po nim ze świeżym tickiem', () => {
    const g = zimaGra('przymorze', 'zwykly', 8, 9, true);
    const { st } = g.sim;
    st.obcy!.next = -1;
    st.obcy!.wnext = -1;
    st.obcy!.enext = -1;
    krok(g);
    expect(klucz(g)).toBe('o8');
    const od1 = okazja(g)!.od;
    // handlarz pod bramą (O2) jest ważny, ale zima jest ważniejsza
    st.obcy!.next = st.tick;
    dopoki(g, () => !!st.pawns.find((p) => p.kind === 'handlarz' && p.job?.phase === 1), 1500);
    expect(klucz(g), 'handlarz czeka pod bramą, a zima dalej na wierzchu').toBe('o8');
    expect(okazja(g)!.od, 'zima nie została otwarta od nowa').toBe(od1);
    // napad (O3) jest ważniejszy od zimy: wypiera ją
    g.sim.push({ t: 'raid', ids: [], at: st.tick + 100, post: 'brama' });
    dopoki(g, () => klucz(g) === 'o3', 400);
    // napad się kończy (szabrownicy odchodzą z niczym, bo napad zakończono ręcznie): zima wraca
    st.raid!.phase = 3;
    st.pawns = st.pawns.filter((p) => p.kind !== 'szabrownik');
    krok(g);
    expect(klucz(g), 'po napadzie wraca zima').toBe('o8');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
  });

  it('stado w trybie zombie wypiera zimę nocą, a rano zima wraca', () => {
    const g = zimaGra('przymorze', 'zombie', 8, 20);
    const { st, w } = g.sim;
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    krok(g);
    expect(klucz(g)).toBe('o8');
    st.tick = tickAt(8, 21.2);
    g.sim.spawnAtFence(6, w.buildings[w.hq].entrances[0].out);
    g.sim.step();
    krok(g);
    expect(klucz(g), 'noc, stado pod siatką').toBe('o4');
    // rano stado się rozeszło
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    st.tick = tickAt(9, 7);
    krok(g);
    expect(klucz(g), 'rano zima znowu').toBe('o8');
  });

  it('okienko celów rysuje blok okazji nad rozdziałem; zwinięte (telefon) pokazuje bieżący cel okazji', () => {
    const g = poRaporcieZObcymi('przymorze', 'zombie');
    const { st } = g.sim;
    doGodziny(g, 12);
    czystaOkazja(g);
    infect(st, rdzen(g.sim)[0], true);
    krok(g);
    const v = widok(g);
    expect(v.okazja?.tytul).toBe('Teraz: ugryzienie');
    const rozwiniete = celeHtml(v, { otwarte: true, touch: false });
    expect(rozwiniete.indexOf('goals-okazja')).toBeGreaterThanOrEqual(0);
    expect(rozwiniete.indexOf('Teraz: ugryzienie')).toBeLessThan(rozwiniete.indexOf(v.rozdzial!.tytul));
    expect(rozwiniete).toContain('Na karcie ugryzionej osoby');
    const zwiniete = celeHtml(v, { otwarte: false, touch: true });
    expect(zwiniete).toContain(v.okazja!.cele[0].text);
    expect(zwiniete).not.toContain(v.rozdzial!.tytul);
  });

  it('ścieżka tylko czyta: skrót stanu gry jest ten sam z krokiem ścieżki co bez niego, także z otwartą okazją', () => {
    const a = poRaporcieZObcymi('przymorze', 'zombie');
    const b = klon(a);
    const kto = rdzen(a.sim)[0];
    infect(a.sim.st, kto, true);
    infect(b.sim.st, rdzen(b.sim)[0], true);
    for (let k = 0; k < 600; k++) {
      krokiSymulacji(a);
      krokiSymulacji(b);
      krok(a);
    }
    expect(klucz(a)).toBeDefined();
    expect(a.sim.hash()).toBe(b.sim.hash());
  });
});

/* ---------------------------------------------------------------- O1: wędrowiec */

describe.each(KOMBINACJE)('O1 wędrowiec przy siatce: %s %s', (key, mode) => {
  const zombie = mode === 'zombie';
  const wedrowiec = (g: Gra): Pawn | undefined =>
    g.sim.st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1);
  const jestWedrowiec = (g: Gra): boolean => g.sim.st.pawns.some((p) => p.kind === 'wedrowiec');

  /** Wędrowiec na żądanie: zegar wędrowca na teraz tuż po pełnej godzinie (w zombie bez szwendaczy, które uzupełniają się
      dopiero z początkiem następnej godziny), czekanie, aż przystanie przy siatce; w zombie ocalały bywa spłoszony, więc
      próby się powtarzają. */
  function przyjscie(g: Gra): Pawn {
    const { st } = g.sim;
    for (let proba = 0; proba < 10; proba++) {
      if (godzinaG(g) < 9 || godzinaG(g) >= 14) doGodziny(g, 9);
      // pierwsza sekunda godziny już minęła, więc szwendacze z uzupełnienia są zdalne
      if (zombie) bezSzwendaczy(g);
      st.obcy!.wnext = st.tick;
      dopoki(g, () => jestWedrowiec(g), 100);
      dopoki(g, () => !!wedrowiec(g) || !jestWedrowiec(g), 1500);
      if (wedrowiec(g)) return wedrowiec(g)!;
    }
    throw new Error('żaden wędrowiec nie stanął przy siatce');
  }

  it('wędrowiec w fazie 1 (przystanął przy siatce) otwiera okazję, zagadanie zalicza cel i zamyka okazję', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st, w } = g.sim;
    expect(okazja(g)).toBeUndefined();
    // wędrowiec w drodze (jeszcze nie przystanął przy siatce) okazji nie otwiera
    if (godzinaG(g) < 9 || godzinaG(g) >= 14) doGodziny(g, 9);
    if (zombie) bezSzwendaczy(g);
    st.obcy!.wnext = st.tick;
    dopoki(g, () => jestWedrowiec(g), 100);
    expect(st.pawns.find((p) => p.kind === 'wedrowiec')!.job?.phase).toBe(0);
    expect(okazja(g), 'w drodze').toBeUndefined();
    const wd = przyjscie(g);
    expect(klucz(g)).toBe('o1');
    expect(okazja(g)!.od).toBeLessThanOrEqual(st.tick);
    const v = widok(g).okazja!;
    expect(v.tytul).toBe(zombie ? 'Teraz: ocalały przy siatce' : 'Teraz: wędrowiec przy siatce');
    expect(v.cele.map((c) => c.key)).toEqual(['zagadaj']);
    expect(v.biezacy?.key).toBe('zagadaj');
    expect(v.cele[0].done).toBe(false);
    expect(v.cele[0].text).toBe(zombie ? 'Zagadajcie ocalałego.' : 'Zagadajcie wędrowca.');
    // „Zagadać” z menu na wędrowcu, tak jak w grze
    dbaj(g);
    const kto = najblizszy(g, wd);
    przysun(g, kto, wd);
    const zagadaj = commandsAt(st, w, [kto.id], kafelek(g, wd)).find((m) => m.cmd.t === 'talk');
    expect(zagadaj?.label).toBe('Zagadać');
    g.sim.push(zagadaj!.cmd);
    dopoki(g, () => wd.job?.what === 'zagadany' || !wedrowiec(g), 1500);
    expect(wd.job?.what).toBe('zagadany');
    // jedyny cel zrobiony: okazja się zamyka, zaliczenie zostaje
    expect(okazja(g)).toBeUndefined();
    expect(zaliczony(g.sciezka, 'o1.zagadaj')).toBe(true);
    expect(widok(g).okazja).toBeNull();
  });

  it('okazja zamyka się, gdy wędrowiec odchodzi; niezrobiony cel wraca z następnym wędrowcem, zrobiony nie', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st, w } = g.sim;
    // pierwszy wędrowiec: nikt z nim nie rozmawia, odchodzi
    const pierwszy = przyjscie(g);
    expect(klucz(g)).toBe('o1');
    const od1 = okazja(g)!.od;
    dopoki(g, () => (pierwszy.job?.phase ?? 4) >= 2, 2400);
    expect(okazja(g), 'wędrowiec odchodzi: okazja zamknięta').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o1.zagadaj')).toBe(false);
    // następny wędrowiec: ta sama okazja, nowy tick otwarcia, cel dalej niezrobiony
    dopoki(g, () => !jestWedrowiec(g), 2400);
    const drugi = przyjscie(g);
    expect(drugi.id).not.toBe(pierwszy.id);
    expect(klucz(g)).toBe('o1');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    expect(widok(g).okazja!.cele[0].done).toBe(false);
    // rozmowa zalicza cel
    dbaj(g);
    const kto2 = najblizszy(g, drugi);
    przysun(g, kto2, drugi);
    const zagadaj = commandsAt(st, w, [kto2.id], kafelek(g, drugi)).find((m) => m.cmd.t === 'talk')!;
    g.sim.push(zagadaj.cmd);
    dopoki(g, () => zaliczony(g.sciezka, 'o1.zagadaj'), 1500);
    expect(okazja(g)).toBeUndefined();
    // trzeci wędrowiec: cel zrobiony nie wraca, więc okazji nie ma
    dopoki(g, () => !jestWedrowiec(g), 2400);
    const trzeci = przyjscie(g);
    expect(trzeci.id).not.toBe(drugi.id);
    krok(g);
    expect(okazja(g)).toBeUndefined();
    expect(widok(g).okazja).toBeNull();
  });
});

describe('O1 wędrowiec pierwszego przyjścia po poleceniu „obcy”', () => {
  it.each(KOMBINACJE_ZWYKLE)('%s %s: drugiego dnia między 8:00 a 12:00 przy siatce otwiera okazję', (key, mode) => {
    // gra bez opcji obcy, włączona poleceniem jak stary zapis (main.ts)
    const w = demoWorld(key);
    const g = graZSymulacji(key, mode, 5, new Sim(w, createSim(w, 5, { core: 4, mode })));
    g.sim.push({ t: 'obcy', ids: [] });
    g.sim.step();
    const o = g.sim.st.obcy!;
    expect(dayOf(o.wnext!)).toBe(2);
    expect(hourOf(o.wnext!)).toBeGreaterThanOrEqual(8);
    expect(hourOf(o.wnext!)).toBeLessThan(12);
    // pierwszy dzień w całości (zarząd i samouczek), potem czekanie na wędrowca
    doPierwszegoRaportu(g);
    g.sciezka = stanZZapisu(undefined, g.sim.st, g.gov);
    o.next = -1;
    o.enext = -1;
    dopoki(g, () => g.sim.st.pawns.some((p) => p.kind === 'wedrowiec' && p.job?.phase === 1), 5 * 960);
    expect(dobaG(g)).toBe(2);
    expect(godzinaG(g)).toBeGreaterThanOrEqual(8);
    expect(klucz(g)).toBe('o1');
  });
});

/* ---------------------------------------------------------------- O2: handlarz */

describe.each(KOMBINACJE)('O2 handlarz pod bramą: %s %s', (key, mode) => {
  const zombie = mode === 'zombie';
  const przyBramie = (g: Gra): Pawn | undefined =>
    g.sim.st.pawns.find((p) => p.kind === 'handlarz' && p.job?.phase === 1);

  /** Wizyta na żądanie: zegar handlarza na teraz (okno 9:00–15:00); w zombie wizyta bywa odłożona albo spłoszona, więc
      próby się powtarzają. Zwraca handlarza czekającego pod bramą. */
  function wizyta(g: Gra): Pawn {
    const { st } = g.sim;
    for (let proba = 0; proba < 12; proba++) {
      if (godzinaG(g) < 9 || godzinaG(g) >= 13) doGodziny(g, 9);
      if (zombie) bezSzwendaczy(g);
      st.obcy!.next = st.tick;
      dopoki(g, () => !!przyBramie(g) || (st.obcy!.trader < 0 && st.obcy!.next > st.tick), 1500);
      if (przyBramie(g)) return przyBramie(g)!;
    }
    throw new Error('handlarz nie stanął pod bramą');
  }

  it('handlarz pod bramą otwiera okazję, wymiana zalicza cel i zamyka okazję', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st, w } = g.sim;
    expect(okazja(g)).toBeUndefined();
    // handlarz w drodze do bramy (jeszcze nie stoi z wózkiem) okazji nie otwiera
    if (godzinaG(g) < 9 || godzinaG(g) >= 13) doGodziny(g, 9);
    if (zombie) bezSzwendaczy(g);
    st.obcy!.next = st.tick;
    dopoki(g, () => st.obcy!.trader >= 0 || st.obcy!.next > st.tick, 100);
    if (st.obcy!.trader >= 0) {
      expect(st.pawns.find((p) => p.id === st.obcy!.trader)!.job?.phase).toBe(0);
      expect(okazja(g), 'w drodze').toBeUndefined();
    }
    const h = wizyta(g);
    expect(klucz(g)).toBe('o2');
    const v = widok(g).okazja!;
    expect(v.tytul).toBe(key === 'zielonki' ? 'Teraz: handlarz pod furtką' : 'Teraz: handlarz pod bramą');
    expect(v.cele.map((c) => c.key)).toEqual(['wymiana']);
    expect(v.cele[0].done).toBe(false);
    // wymiana z menu na handlarzu, z materiałem na zapłatę (złom, części, leki, jedzenie na podwórku)
    dajMaterial(g, { zlom: 20, czesci: 10, leki: 5, jedzenie: 10, deski: 10, drewno: 10 });
    dbaj(g);
    const kto = rdzen(g.sim)[0];
    const handel = commandsAt(st, w, [kto.id], kafelek(g, h)).find((m) => m.cmd.t === 'trade' && !m.off);
    expect(handel?.label).toMatch(/^Dać /);
    expect(widok(g).okazja!.cele[0].done, 'sama oferta w menu niczego nie zalicza').toBe(false);
    g.sim.push(handel!.cmd);
    dopoki(g, () => st.obcy!.offers.some((o) => o.left < 2) || !przyBramie(g), 1500);
    expect(st.obcy!.offers.some((o) => o.left < 2)).toBe(true);
    expect(zaliczony(g.sciezka, 'o2.wymiana')).toBe(true);
    expect(okazja(g), 'jedyny cel zrobiony: okazja zamknięta').toBeUndefined();
  });

  it('handlarz odchodzi bez wymiany: okazja się zamyka, cel czeka na następną wizytę, a po wymianie nie wraca', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st, w } = g.sim;
    const pierwszy = wizyta(g);
    expect(klucz(g)).toBe('o2');
    const od1 = okazja(g)!.od;
    dopoki(g, () => (pierwszy.job?.phase ?? 4) >= 2 || !st.pawns.includes(pierwszy), 2600);
    expect(okazja(g), 'handlarz odszedł: okazja zamknięta').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o2.wymiana')).toBe(false);
    // następna wizyta: ta sama okazja ze świeżym tickiem, cel dalej niezrobiony
    dopoki(g, () => st.obcy!.trader < 0, 2600);
    const drugi = wizyta(g);
    expect(klucz(g)).toBe('o2');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    // wymiana
    dajMaterial(g, { zlom: 20, czesci: 10, leki: 5, jedzenie: 10, deski: 10, drewno: 10 });
    dbaj(g);
    const handel = commandsAt(st, w, [rdzen(g.sim)[0].id], kafelek(g, drugi)).find(
      (m) => m.cmd.t === 'trade' && !m.off,
    )!;
    g.sim.push(handel.cmd);
    dopoki(g, () => zaliczony(g.sciezka, 'o2.wymiana'), 1500);
    expect(okazja(g)).toBeUndefined();
    // trzecia wizyta: zrobiony cel nie wraca
    dopoki(g, () => st.obcy!.trader < 0, 2600);
    const trzeci = wizyta(g);
    expect(trzeci.id).not.toBe(drugi.id);
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });

  it('napaść na handlarza niczego nie zalicza, a okazja się zamyka, gdy handlarz przestaje czekać pod bramą', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st, w } = g.sim;
    const h = wizyta(g);
    expect(klucz(g)).toBe('o2');
    dbaj(g);
    const kto = rdzen(g.sim)[0];
    const napasc = commandsAt(st, w, [kto.id], kafelek(g, h)).find((m) => m.cmd.t === 'rob')!;
    expect(napasc.label).toBe('Napaść na handlarza');
    g.sim.push(napasc.cmd);
    dopoki(g, () => !przyBramie(g), 1500);
    expect(zaliczony(g.sciezka, 'o2.wymiana')).toBe(false);
    expect(okazja(g)).toBeUndefined();
  });
});

describe.each(KOMBINACJE_ZOMBIE)('O2 handlarz w trybie zombie: %s %s', (key, mode) => {
  it('przed czwartym dniem handlarza nie ma i okazji też, od czwartego dnia przychodzi rzadko i otwiera okazję', () => {
    const g = poRaporcieZObcymi(key, mode);
    const { st } = g.sim;
    expect(dayOf(st.obcy!.next)).toBe(4);
    st.obcy!.wnext = -1;
    st.obcy!.enext = -1;
    // dni 2 i 3 w całości: ani handlarza, ani okazji
    while (st.tick < tickAt(4, 6)) {
      s1(g);
      if (klucz(g) === 'o2') throw new Error(`okazja handlarza przed czwartym dniem (tick ${st.tick})`);
      expect(st.obcy!.trader, `tick ${st.tick}`).toBe(-1);
    }
    // czwarty dzień: wizyta na żądanie otwiera okazję
    const przyBramie = () => st.pawns.find((p) => p.kind === 'handlarz' && p.job?.phase === 1);
    let h: Pawn | undefined;
    for (let proba = 0; proba < 12 && !h; proba++) {
      if (hourOf(st.tick) < 9 || hourOf(st.tick) >= 13) doGodziny(g, 9);
      bezSzwendaczy(g);
      st.obcy!.next = st.tick;
      dopoki(g, () => !!przyBramie() || (st.obcy!.trader < 0 && st.obcy!.next > st.tick), 1500);
      h = przyBramie();
    }
    expect(h, 'handlarz pod bramą').toBeDefined();
    expect(dobaG(g)).toBeGreaterThanOrEqual(4);
    expect(klucz(g)).toBe('o2');
  });
});

/* ---------------------------------------------------------------- O3: napad */

describe.each(KOMBINACJE_ZWYKLE)('O3 napad szabrowników: %s %s', (key, mode) => {
  const faza = (g: Gra): number | undefined => odczyt(g).snap.raid?.phase;
  const wynik = (g: Gra): string | undefined => odczyt(g).snap.raid?.outcome;

  /** napad o 23:00 danego dnia (szabrownicy pojawiają się o 22:30), z warta z lampą przy bramie albo bez niej */
  function napad(g: Gra, dzien: number, warta: boolean): void {
    const { st } = g.sim;
    dopoki(g, () => st.tick >= tickAt(dzien, 21), 4 * 960);
    dbaj(g);
    if (warta) g.sim.push({ t: 'guard', ids: [rdzen(g.sim)[0].id], post: 'brama' });
    g.sim.push({ t: 'raid', ids: [], at: tickAt(dzien, 23), post: 'brama' });
  }

  it('napad w fazie 1 otwiera okazję; alarm zalicza „alarm”, odparty napad zalicza „odparty” i zamyka okazję', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st } = g.sim;
    napad(g, 2, true);
    dopoki(g, () => faza(g) === 1, 4 * 960);
    expect(klucz(g)).toBe('o3');
    const v = widok(g).okazja!;
    expect(v.tytul).toBe('Teraz: szabrownicy za siatką');
    expect(v.cele.map((c) => c.key)).toEqual(['alarm', 'odparty']);
    expect(v.cele.map((c) => c.done)).toEqual([false, false]);
    expect(v.biezacy?.key).toBe('alarm');
    // alarm: polecenie „Do broni!” (kolejka poleceń liczy się od razu)
    g.sim.push({ t: 'alarm', ids: rdzen(g.sim).map((p) => p.id) });
    krok(g);
    expect(zaliczony(g.sciezka, 'o3.alarm')).toBe(true);
    expect(zaliczony(g.sciezka, 'o3.odparty')).toBe(false);
    expect(widok(g).okazja!.biezacy?.key).toBe('odparty');
    // napad odparty (lampa przy bramie): drugi cel zrobiony, okazja zamknięta
    dopoki(g, () => wynik(g) === 'odparty', 600);
    expect(zaliczony(g.sciezka, 'o3.odparty')).toBe(true);
    expect(okazja(g)).toBeUndefined();
    expect(st.pawns.some((p) => p.kind === 'szabrownik') || faza(g) === 3).toBe(true);
  });

  it('wtargnięcie nie zalicza „odparty”, okazja zamyka się z końcem napadu, a niezrobione cele wracają z następnym', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    napad(g, 2, false);
    dopoki(g, () => faza(g) === 1, 4 * 960);
    expect(klucz(g)).toBe('o3');
    const od1 = okazja(g)!.od;
    dopoki(g, () => wynik(g) === 'wtargnięcie', 600);
    // wtargnięcie bywa tak krótkie (nic do wyniesienia), że od razu jest po wszystkim; trwa-li napad, okazja trwa z nim
    if (faza(g) === 2) expect(klucz(g), 'napad trwa (faza 2): okazja dalej otwarta').toBe('o3');
    expect(zaliczony(g.sciezka, 'o3.odparty')).toBe(false);
    dopoki(g, () => faza(g) === 3, 2400);
    expect(okazja(g), 'napad skończony: okazja zamknięta').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o3.odparty')).toBe(false);
    expect(zaliczony(g.sciezka, 'o3.alarm')).toBe(false);
    // następny napad (kolejna noc): okazja wraca z oboma celami niezrobionymi
    napad(g, 3, true);
    dopoki(g, () => faza(g) === 1 && g.sim.st.tick >= tickAt(3, 22), 4 * 960);
    expect(klucz(g)).toBe('o3');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    expect(widok(g).okazja!.cele.map((c) => c.done)).toEqual([false, false]);
    dopoki(g, () => wynik(g) === 'odparty', 600);
    // odparty zaliczone, alarm nie: okazja zostaje otwarta do końca napadu, cel alarmu dalej czeka
    expect(zaliczony(g.sciezka, 'o3.odparty')).toBe(true);
    expect(zaliczony(g.sciezka, 'o3.alarm')).toBe(false);
    dopoki(g, () => faza(g) === 3, 2400);
    expect(okazja(g)).toBeUndefined();
  });

  it('cel zrobiony nie wraca: po alarmie i odparciu kolejny napad nie otwiera okazji', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    napad(g, 2, true);
    dopoki(g, () => faza(g) === 1, 4 * 960);
    g.sim.push({ t: 'alarm', ids: rdzen(g.sim).map((p) => p.id) });
    dopoki(g, () => zaliczony(g.sciezka, 'o3.odparty'), 600);
    expect(zaliczony(g.sciezka, 'o3.alarm')).toBe(true);
    dopoki(g, () => faza(g) === 3, 2400);
    // odwołanie alarmu, następna noc, następny napad
    g.sim.push({ t: 'alarm', ids: rdzen(g.sim).map((p) => p.id), off: true });
    napad(g, 3, false);
    dopoki(g, () => faza(g) === 1 && g.sim.st.tick >= tickAt(3, 22), 4 * 960);
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });
});

describe.each(KOMBINACJE_ZOMBIE)('O3 napad w trybie zombie: %s %s', (key, mode) => {
  it('szabrowników w trybie zombie nie ma, więc napad z polecenia nie otwiera okazji szabrowników (także bez stada)', () => {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    const { st } = g.sim;
    dopoki(g, () => st.tick >= tickAt(2, 21), 4 * 960);
    czystaOkazja(g);
    g.sim.push({ t: 'raid', ids: [], at: tickAt(2, 23), post: 'brama' });
    dopoki(g, () => odczyt(g).snap.raid?.phase === 1, 4 * 960);
    // stado wypierałoby okazję szabrowników (O4 jest ważniejsze), więc go nie ma: wtedy napad sam niczego nie otwiera
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    krok(g);
    expect(odczyt(g).snap.raid?.phase).toBe(1);
    expect(okazja(g)).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- O4: stado pod siatką */

describe.each(KOMBINACJE_ZOMBIE)('O4 stado pod siatką: %s %s', (key, mode) => {
  const napierajacych = (g: Gra): number => odczyt(g).snap.zombies.pressing;
  const bramaOut = (g: Gra): number => g.sim.w.buildings[g.sim.w.hq].entrances[0].out;

  /** zombie bez stada, zarząd gotowy (syty i wypoczęty) i tuż przed wybranym kwadransem; wywołujący dokłada szwendaczy */
  function przed(godzina: number): Gra {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    g.sim.st.pawns = g.sim.st.pawns.filter((p) => p.kind !== 'zombie');
    doGodziny(g, godzina);
    dbaj(g);
    // naturalne stado tej nocy mogło już otworzyć okazję i coś zaliczyć: scenariusz zaczyna od zera, bez szwendaczy
    g.sim.st.pawns = g.sim.st.pawns.filter((p) => p.kind !== 'zombie');
    return czystaOkazja(g);
  }

  it('za dnia trzech napierających nie otwiera okazji, od 21:00 otwiera, a bez stada się zamyka', () => {
    const g = przed(12);
    const { st } = g.sim;
    g.sim.spawnAtFence(6, bramaOut(g));
    dopoki(g, () => napierajacych(g) >= 3, 120);
    krok(g);
    expect(okazja(g), 'za dnia stado nie otwiera okazji').toBeUndefined();
    // wieczór: tuż przed 21:00 jeszcze nie, od 21:00 tak
    dopoki(g, () => st.tick >= tickAt(2, 20.9), 4 * 960);
    g.sim.spawnAtFence(6, bramaOut(g));
    dopoki(g, () => napierajacych(g) >= 3, 120);
    krok(g);
    expect(okazja(g), '20:54').toBeUndefined();
    dopoki(g, () => hourOf(st.tick) >= 21, 400);
    expect(napierajacych(g)).toBeGreaterThanOrEqual(3);
    expect(klucz(g)).toBe('o4');
    expect(okazja(g)!.zabici).toBe(st.tally!.killed);
    const v = widok(g).okazja!;
    expect(v.tytul).toBe('Teraz: stado pod siatką');
    expect(v.cele.map((c) => c.key)).toEqual(['alarm', 'zabici']);
    expect(v.cele.map((c) => c.done)).toEqual([false, false]);
    // stado rozeszło się: okazja się zamyka
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });

  it('mniej niż trzech napierających nie otwiera okazji nawet nocą', () => {
    const g = przed(21.1);
    const { st } = g.sim;
    st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
    g.sim.spawnAtFence(2, bramaOut(g));
    g.sim.step();
    expect(napierajacych(g)).toBeLessThan(3);
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });

  it('alarm zalicza „alarm”, a „zabici” liczy tylko tych zabitych po otwarciu okazji (wcześniejsze się nie liczą)', () => {
    const g = przed(21.1);
    const { st } = g.sim;
    // dużo zabitych jeszcze przed okazją
    st.tally!.killed += 20;
    g.sim.spawnAtFence(8, bramaOut(g));
    dopoki(g, () => napierajacych(g) >= 3, 120);
    krok(g);
    expect(klucz(g)).toBe('o4');
    const zabici0 = okazja(g)!.zabici!;
    expect(zabici0).toBe(st.tally!.killed);
    expect(zaliczony(g.sciezka, 'o4.zabici'), 'zabici sprzed okazji się nie liczą').toBe(false);
    expect(zaliczony(g.sciezka, 'o4.alarm')).toBe(false);
    g.sim.push({ t: 'alarm', ids: rdzen(g.sim).map((p) => p.id) });
    krok(g);
    expect(zaliczony(g.sciezka, 'o4.alarm')).toBe(true);
    // kolejne zabicia: „zabici” zalicza się dokładnie przy trzecim
    for (let s = 0; s < 1500 && !zaliczony(g.sciezka, 'o4.zabici'); s++) {
      s1(g);
      const zabite = st.tally!.killed - zabici0;
      expect(zaliczony(g.sciezka, 'o4.zabici'), `zabitych od otwarcia: ${zabite}`).toBe(zabite >= 3);
    }
    expect(zaliczony(g.sciezka, 'o4.zabici')).toBe(true);
    expect(st.tally!.killed - zabici0).toBeGreaterThanOrEqual(3);
  });

  it('okazja trwa, gdy stado topnieje pod dzidami, i mija o 6:00, choćby szwendacze jeszcze stali', () => {
    const g = przed(21.1);
    const { st } = g.sim;
    g.sim.spawnAtFence(6, bramaOut(g));
    dopoki(g, () => napierajacych(g) >= 3, 120);
    krok(g);
    expect(klucz(g)).toBe('o4');
    // zostaje jeden napierający: okazja jeszcze trwa (stado topnieje, ale nie zniknęło)
    let zostal = 0;
    for (const p of st.pawns) if (p.kind === 'zombie' && p.job?.phase === 2 && zostal++ >= 1) p.job.phase = 0;
    krok(g);
    expect(napierajacych(g)).toBe(1);
    expect(klucz(g), 'jeden napierający: stado jeszcze jest').toBe('o4');
    // rano (6:00) okazja mija, choć szwendacze dalej napierają
    for (const p of st.pawns) if (p.kind === 'zombie') p.job!.phase = 2;
    st.tick = tickAt(3, 5.9);
    krok(g);
    expect(klucz(g), '5:54, noc').toBe('o4');
    st.tick = tickAt(3, 6.05);
    krok(g);
    expect(okazja(g), '6:03, dzień').toBeUndefined();
  });
});

/* ---------------------------------------------------------------- O5: ugryzienie */

describe.each(KOMBINACJE_ZOMBIE)('O5 ugryzienie: %s %s', (key, mode) => {
  /** gra w trybie zombie z danym ziarnem, drugi dzień 10:00, samouczek skończony; zarząd syty i wypoczęty */
  function gra(ziarno: number): Gra {
    const w = demoWorld(key);
    const sim = new Sim(w, createSim(w, ziarno, { core: 4, mode }));
    sim.st.tut.step = TUT_STEPS.length;
    sim.st.tick = tickAt(2, 10);
    const g = graZSymulacji(key, mode, ziarno, sim);
    g.sciezka = stanZZapisu(undefined, sim.st, g.gov);
    dbaj(g);
    return g;
  }
  const imie = (g: Gra, p: Pawn): string => g.sim.st.people[p.person].first;

  it('ugryzienie w kończynę z możliwą amputacją otwiera okazję z imieniem; w tułów albo po oknie nie', () => {
    const g = gra(5);
    const { st } = g.sim;
    const [a, b, c] = rdzen(g.sim);
    infect(st, a, false);
    krok(g);
    expect(okazja(g), 'ugryzienie w tułów (bez amputacji)').toBeUndefined();
    infect(st, b, true);
    krok(g);
    expect(klucz(g)).toBe('o5');
    expect(okazja(g)!.cel).toBe(b.id);
    const v = widok(g).okazja!;
    expect(v.tytul).toBe('Teraz: ugryzienie');
    expect(v.cele.map((x) => x.key)).toEqual(['amputacja']);
    expect(v.cele[0].text).toBe(`Ratujcie: ${imie(g, b)} potrzebuje amputacji.`);
    expect(v.cele[0].done).toBe(false);
    // po upływie okna (dwie godziny od ugryzienia) okazja się zamyka bez zaliczenia, choć chory jeszcze żyje
    st.tick = b.bite! + AMPUTATE_WINDOW + 1;
    krok(g);
    expect(st.pawns.includes(b)).toBe(true);
    expect(okazja(g), 'okno amputacji minęło').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o5.amputacja')).toBe(false);
    // następne ugryzienie w kończynę: ta sama okazja, cel dalej niezrobiony, z imieniem nowego chorego
    infect(st, c, true);
    krok(g);
    expect(klucz(g)).toBe('o5');
    expect(widok(g).okazja!.cele[0].text).toBe(`Ratujcie: ${imie(g, c)} potrzebuje amputacji.`);
  });

  it('udana amputacja zalicza cel i zamyka okazję, nieudana (chory umiera) zamyka bez zaliczenia', () => {
    const wyniki = new Set<string>();
    for (let ziarno = 1; ziarno <= 24 && wyniki.size < 2; ziarno++) {
      const g = gra(ziarno);
      const { st } = g.sim;
      const [chory, chirurg] = rdzen(g.sim);
      // bez medyka i bez leku: szansa 1/2, więc oba wyniki trafiają się na kolejnych ziarnach
      st.people[chirurg.person].skills.med = 0;
      st.store.meds = 0;
      infect(st, chory, true);
      krok(g);
      expect(klucz(g)).toBe('o5');
      expect(zaliczony(g.sciezka, 'o5.amputacja')).toBe(false);
      g.sim.push({ t: 'amputate', ids: [chirurg.id], patient: chory.id });
      dopoki(g, () => chory.maimed === true || !st.pawns.includes(chory), 2 * 960);
      if (chory.maimed) {
        wyniki.add('sukces');
        expect(chory.bite).toBeUndefined();
        expect(zaliczony(g.sciezka, 'o5.amputacja')).toBe(true);
      } else {
        wyniki.add('porażka');
        expect(zaliczony(g.sciezka, 'o5.amputacja'), 'chory zmarł').toBe(false);
      }
      // zmarły chory zostawia zwłoki, które wstaną (O6), więc zamknięta jest okazja ugryzienia, a nie każda okazja
      expect(klucz(g), `ziarno ${ziarno}: ${[...wyniki].join(',')}`).not.toBe('o5');
    }
    expect([...wyniki].sort()).toEqual(['porażka', 'sukces']);
  });

  it('bez nikogo, kto może amputować (jedyna osoba w zarządzie, reszta na wyprawie), okazji ugryzienia nie ma', () => {
    const w = demoWorld(key);
    const sim = new Sim(w, createSim(w, 5, { core: 1, mode }));
    sim.st.tut.step = TUT_STEPS.length;
    sim.st.tick = tickAt(2, 10);
    const g = graZSymulacji(key, mode, 5, sim);
    infect(sim.st, rdzen(sim)[0], true);
    krok(g);
    expect(okazja(g), 'jedyna osoba w zarządzie').toBeUndefined();
    // z drugą osobą okazja jest; gdy reszta jest na wyprawie albo ledwo żyje, nie otwiera się (otwarta trwa do końca okna)
    const h = gra(5);
    const [chory, lekarz, ...reszta] = rdzen(h.sim);
    for (const p of [lekarz, ...reszta]) p.away = true;
    infect(h.sim.st, chory, true);
    krok(h);
    expect(okazja(h), 'wszyscy poza chorym na wyprawie').toBeUndefined();
    lekarz.away = false;
    lekarz.needs!.health = 15;
    krok(h);
    expect(okazja(h), 'jedyny zdolny ma zdrowie 15 (poniżej progu 20)').toBeUndefined();
    lekarz.needs!.health = 90;
    krok(h);
    expect(klucz(h)).toBe('o5');
    // otwarta okazja trwa, choćby lekarz wyszedł: okno amputacji jest takie samo
    lekarz.away = true;
    krok(h);
    expect(klucz(h)).toBe('o5');
  });

  it('kto już raz stracił kończynę, a został ugryziony znowu, nie ma celu zaliczonego od razu', () => {
    const g = gra(5);
    const { st } = g.sim;
    const [chory] = rdzen(g.sim);
    chory.maimed = true;
    infect(st, chory, true);
    krok(g);
    expect(klucz(g)).toBe('o5');
    expect(zaliczony(g.sciezka, 'o5.amputacja')).toBe(false);
  });
});

/* ---------------------------------------------------------------- O6: zmarły wstanie */

describe.each(KOMBINACJE_ZOMBIE)('O6 zmarły wstanie: %s %s', (key, mode) => {
  function gra(ziarno = 5): Gra {
    const w = demoWorld(key);
    const sim = new Sim(w, createSim(w, ziarno, { core: 4, mode }));
    sim.st.tut.step = TUT_STEPS.length;
    sim.st.tick = tickAt(2, 10);
    const g = graZSymulacji(key, mode, ziarno, sim);
    g.sciezka = stanZZapisu(undefined, sim.st, g.gov);
    dbaj(g);
    return g;
  }
  const ciala = (g: Gra) => g.sim.st.things.filter((t) => t.kind === 'zwloki');

  /** Prawdziwy zgon: ugryziony w tułów tak dawno, że gorączka dobija go za chwilę; zostają zwłoki, które wstaną za godzinę. */
  function zgon(g: Gra): void {
    const { st } = g.sim;
    const chory = rdzen(g.sim)[1];
    infect(st, chory, false);
    chory.bite = st.tick - 18 * TICKS_PER_HOUR + 60;
    dopoki(g, () => !st.pawns.includes(chory), 30);
  }

  it('zwłoki, które wstaną, otwierają okazję; „Dobić” zalicza cel, zamyka okazję i zwłoki już nie wstaną', () => {
    const g = gra();
    const { st, w } = g.sim;
    expect(ciala(g)).toHaveLength(0);
    zgon(g);
    const c = ciala(g)[0];
    expect(c.fuel).toBeGreaterThan(st.tick);
    expect(klucz(g)).toBe('o6');
    expect(okazja(g)!.cel).toBe(c.id);
    const v = widok(g).okazja!;
    expect(v.tytul).toBe('Teraz: zmarły wstanie');
    expect(v.cele.map((x) => x.key)).toEqual(['dobic']);
    expect(v.cele[0].done).toBe(false);
    // „Dobić” z menu na ciele, tak jak w grze
    const kto = rdzen(g.sim)[0];
    const dobij = commandsAt(st, w, [kto.id], c.y * w.size + c.x).find((m) => m.cmd.t === 'finish');
    expect(dobij?.label).toBe('Dobić');
    g.sim.push(dobij!.cmd);
    dopoki(g, () => c.fuel === 0, 2 * 960);
    expect(zaliczony(g.sciezka, 'o6.dobic')).toBe(true);
    expect(okazja(g)).toBeUndefined();
    dopoki(g, () => st.tick >= c.until! - 5 || st.tick > tickAt(2, 14), 4 * 960);
    expect(st.things.includes(c), 'dobite ciało nie wstało').toBe(true);
  });

  it('zwłoki, które wstały, zamykają okazję bez zaliczenia, a następne zwłoki otwierają ją znowu', () => {
    const g = gra();
    const { st, w } = g.sim;
    // ciało daleko od zarządu (dalej niż 12 m, do których wolny z zarządu dobija sam), więc nikt go nie dobije
    const daleko = Array.from({ length: w.size * w.size }, (_, i) => i).find(
      (i) =>
        !w.blocked[i] &&
        rdzen(g.sim).every((p) => Math.hypot((i % w.size) - p.x, Math.floor(i / w.size) - p.y) > 20) &&
        Math.hypot((i % w.size) - w.size / 2, Math.floor(i / w.size) - w.size / 2) < 60,
    )!;
    st.things.push({
      id: st.nextThing++,
      kind: 'zwloki',
      x: daleko % w.size,
      y: Math.floor(daleko / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 3,
      fuel: st.tick + RISE_TICKS,
      by: -1,
      owner: -1,
    });
    const c = ciala(g)[0];
    krok(g);
    expect(klucz(g)).toBe('o6');
    const od1 = okazja(g)!.od;
    // nikt nie dobija: po godzinie ciało wstaje (ginie jako rzecz, powstaje szwendacz)
    dopoki(g, () => !st.things.includes(c), 2 * 960);
    expect(okazja(g), 'ciało wstało: okazja zamknięta').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o6.dobic')).toBe(false);
    // następny zgon: okazja wraca z celem niezrobionym i nowym tickiem
    const chory = rdzen(g.sim)[2];
    infect(st, chory, false);
    chory.bite = st.tick - 18 * TICKS_PER_HOUR + 60;
    dopoki(g, () => !st.pawns.includes(chory), 30);
    expect(klucz(g)).toBe('o6');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    expect(okazja(g)!.cel).toBe(ciala(g)[0].id);
  });

  it('zwłoki już dobite (fuel 0) albo zwłoki, które nie wstaną, okazji nie otwierają', () => {
    const g = gra();
    const { st } = g.sim;
    const [a] = rdzen(g.sim);
    st.things.push({
      id: st.nextThing++,
      kind: 'zwloki',
      x: Math.floor(a.x),
      y: Math.floor(a.y),
      w: 1,
      h: 1,
      rot: 0,
      n: 3,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- O7: obcy przy aucie */

describe.each(KOMBINACJE)('O7 obca ekipa przy aucie: %s %s', (key, mode) => {
  const zombie = mode === 'zombie';
  const ekipa = (g: Gra): Pawn[] =>
    g.sim.st.pawns.filter((p) => p.kind === 'obcy' && p.job?.t === 'scavenge' && (p.job.phase ?? 4) < 2);

  /** gra bez losowych wizyt i bez automatu pracy (sam automat przeszukuje wraki, więc ekipa nie miałaby czego szukać) */
  function gra(): Gra {
    const g = bezObcych(poRaporcieZObcymi(key, mode));
    return zombie ? g : bezAutomatu(g);
  }

  /** Ekipa na żądanie (9:00–14:00): zegar ekipy na teraz; w zombie ocaleni bywają spłoszeni, więc próby się powtarzają. */
  function przyjscie(g: Gra): Pawn[] {
    const { st } = g.sim;
    for (let proba = 0; proba < 10; proba++) {
      if (godzinaG(g) < 9 || godzinaG(g) >= 12) doGodziny(g, 9);
      if (zombie) bezSzwendaczy(g);
      st.obcy!.enext = st.tick;
      dopoki(
        g,
        () => ekipa(g).length > 0 || ((st.obcy!.enext ?? 0) > st.tick && !st.pawns.some((p) => p.kind === 'obcy')),
        600,
      );
      if (ekipa(g).length) return ekipa(g);
    }
    throw new Error('ekipa nie dotarła do auta');
  }

  /** wrak, którego nikt nie przeszukał i przy którym nie stoi ekipa, od najbliższego zarządowi */
  function wolneWraki(g: Gra): number[] {
    const { st, w } = g.sim;
    const kto = rdzen(g.sim)[0];
    return wrecksOf(w)
      .map((r) => ({ r, t: wreckTile(r, w.size) }))
      .filter(({ t }) => wreckStage(st.wraki, t) === 0 && !crewAt(st, t))
      .sort((a, b) => Math.hypot(a.r.x - kto.x, a.r.y - kto.y) - Math.hypot(b.r.x - kto.x, b.r.y - kto.y))
      .map(({ r }) => r.y * w.size + r.x);
  }

  it('ekipa obcych przy aucie otwiera okazję, a polecenie przeszukania wraku przez zarząd zalicza cel i ją zamyka', () => {
    const g = gra();
    const { st, w } = g.sim;
    expect(okazja(g)).toBeUndefined();
    przyjscie(g);
    expect(klucz(g)).toBe('o7');
    const v = widok(g).okazja!;
    expect(v.tytul).toBe('Teraz: obcy przy aucie');
    expect(v.cele.map((c) => c.key)).toEqual(['wrak']);
    expect(v.cele[0].done).toBe(false);
    expect(zaliczony(g.sciezka, 'o7.wrak')).toBe(false);
    // polecenie „Przeszukać …” na innym wraku (przy tym stoją obcy): pierwszy, do którego da się dojść
    const kto = rdzen(g.sim)[0];
    dbaj(g);
    let zlecone = false;
    for (const tile of wolneWraki(g)) {
      const cmd = commandsAt(st, w, [kto.id], tile).find(
        (m) => m.cmd.t === 'wreck' && m.cmd.how === 'szukaj' && !m.off,
      );
      if (!cmd) continue;
      g.sim.push(cmd.cmd);
      g.sim.step();
      if (kto.job?.t === 'wreck') {
        zlecone = true;
        break;
      }
    }
    expect(zlecone, 'zarząd ma pracę przy wraku').toBe(true);
    krok(g);
    expect(zaliczony(g.sciezka, 'o7.wrak')).toBe(true);
    expect(okazja(g)).toBeUndefined();
  });

  it('okazja zamyka się, gdy ekipa odchodzi (albo ucieka przed szwendaczami), bez zaliczenia; następna ekipa otwiera ją znowu', () => {
    const g = gra();
    const { st } = g.sim;
    const pierwsza = przyjscie(g);
    expect(klucz(g)).toBe('o7');
    const od1 = okazja(g)!.od;
    const wrak = pierwsza[0].job!.target;
    // ekipa odchodzi: przeszukuje wrak do końca (zwykły tryb) albo ucieka przed szwendaczami (zombie)
    dopoki(g, () => ekipa(g).length === 0, 4 * 960);
    expect(okazja(g), 'ekipa już odchodzi: okazja zamknięta').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o7.wrak'), 'ekipa nie jest zarządem').toBe(false);
    // znacznik „przeszukany” stawia ekipa, kiedy skończy: nie jest to praca zarządu, więc cel dalej niezrobiony
    if (!zombie) expect((st.wraki ?? []).some((m) => m.t === wrak && m.s >= 1)).toBe(true);
    // następna ekipa: ta sama okazja ze świeżym tickiem, cel dalej niezrobiony
    dopoki(g, () => !st.pawns.some((p) => p.kind === 'obcy'), 4 * 960);
    przyjscie(g);
    expect(klucz(g)).toBe('o7');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    expect(widok(g).okazja!.cele[0].done).toBe(false);
  });
});

/* ---------------------------------------------------------------- O8: Zima idzie */

/** pięć map (trzy dema i dwa osiedla zapasowe) w obu trybach */
const MAPY_ZIMA = MAPY.flatMap((m) => TRYBY.map((t) => [m, t] as const));

/** Gra na świeżym świecie mapy: czterech z zarządu, samouczek skończony, godzina `godz` dnia `dzien`, a jedna osoba zna
    się na cieple (dziedzina kozy z beczki; domyślny zarząd ma ją albo nie, zależnie od ziarna). Świat jest własny dla gry,
    więc test może zmieniać jego okna i meble. */
function zimaGra(mapa: Mapa, mode: GameMode, dzien = 8, godz = 8, obcy = false): Gra {
  const w = swiezySwiat(mapa);
  const sim = new Sim(w, createSim(w, 5, { core: 4, mode, ...(obcy ? { obcy } : {}) }));
  sim.st.tut.step = TUT_STEPS.length;
  sim.st.tick = tickAt(dzien, godz);
  const g = graZSymulacji(mapa === 'zielonki' ? 'zielonki' : 'przymorze', mode, 5, sim);
  sim.st.people[rdzen(sim)[0].person].skills.cieplo = 2;
  g.sciezka = stanZZapisu(undefined, sim.st, g.gov);
  dbaj(g);
  return g;
}

/** pokoje do spania naszych mieszkań (rodzaj „pokoj”) */
function pokoje(st: SimState, w: World) {
  const h = w.interior;
  const nasze = new Set(st.apts.filter((a) => a.ours).map((a) => a.apt));
  return h.rooms.filter((r) => r.kind === 'pokoj' && nasze.has(r.apt));
}

/** kafelki pokoju */
const kafelkiPokoju = (w: World, id: number): number[] =>
  Array.from({ length: w.size * w.size }, (_, i) => i).filter((i) => w.interior.room[i] === id);

/** Kotwica kozy z beczki w pokoju do spania z wolnym sąsiadem, do którego da się podejść (zarząd budujący stoi obok planu);
    −1, gdy takiej nie ma. Wymaga zbadanej kozy z beczki (menu budowy pokazuje dozwolone miejsca dopiero wtedy). */
function kotwicaKozy(g: Gra): number {
  const { st, w } = g.sim;
  const h = w.interior;
  const zajety = (i: number) =>
    st.things.some(
      (t) =>
        i % w.size >= t.x &&
        i % w.size < t.x + t.w &&
        Math.floor(i / w.size) >= t.y &&
        Math.floor(i / w.size) < t.y + t.h,
    );
  return (
    allowedAnchors(st, w, 'koza_beczka', 0).find(
      (a) =>
        h.rooms[h.room[a]].kind === 'pokoj' &&
        [a - 1, a + 1, a - w.size, a + w.size].some((n) => h.room[n] >= 0 && !w.blocked[n] && !zajety(n)),
    ) ?? -1
  );
}

describe.each(MAPY_ZIMA)('O8 Zima idzie: %s %s', (mapa, mode) => {
  const maOkno = mapa !== 'lanciego';

  it('przed ósmym dniem okazji nie ma; od ósmego otwiera się tam, gdzie pokój do spania ma okno, a na Lanciego nie', () => {
    const g = zimaGra(mapa, mode, 7, 22);
    krok(g);
    expect(okazja(g)).toBeUndefined();
    g.sim.st.tick = tickAt(8, 8);
    krok(g);
    if (maOkno) {
      expect(klucz(g)).toBe('o8');
      const v = widok(g).okazja!;
      expect(v.tytul).toBe('Teraz: zima idzie');
      expect(v.cele.map((c) => c.key)).toEqual(['kozy', 'beczka']);
      expect(v.cele.map((c) => c.done)).toEqual([false, false]);
      expect(v.biezacy?.key).toBe('kozy');
      expect(v.cele[1].czeka, 'koza z beczki czeka na badanie').toBe('czeka na badanie');
    } else {
      expect(okazja(g), 'sypialnie bez okna: koza z beczki nie ma gdzie stanąć').toBeUndefined();
    }
  });

  if (maOkno)
    it('da się ją zrobić samymi poleceniami gracza: badanie kozy z beczki, potem koza w pokoju do spania; okazja się zamyka', () => {
      const g = zimaGra(mapa, mode);
      const { st, w } = g.sim;
      krok(g);
      expect(klucz(g)).toBe('o8');
      // linia „Cel:” na tablicy badań prowadzi do właściwej kartki
      expect(celWOknie(widok(g), 'tablica')).toBe('Zbadajcie kozę z beczki.');
      // pracownia, badanie, stół: jak w rozdziale „Badania”
      const lab = postawPracownie(g);
      expect(klucz(g), 'pracownia stoi, kozy jeszcze nie ma: okazja trwa').toBe('o8');
      wybierzBadanie(g, 't_kozy');
      // w zombie nocą stado wypiera zimę (O4 jest ważniejsze), więc w tym teście szwendaczy nie ma: chodzi o cele zimy
      const bez = (warunek: (x: Gra) => boolean) => (x: Gra) => {
        if (mode === 'zombie') bezSzwendaczy(x);
        return warunek(x);
      };
      badajDo(
        g,
        lab,
        bez((x) => !!x.sim.st.techDone?.includes('t_kozy')),
        12000,
      );
      krok(g);
      expect(zaliczony(g.sciezka, 'o8.kozy')).toBe(true);
      expect(klucz(g), 'koza w pokoju jeszcze nie stoi').toBe('o8');
      const v = widok(g).okazja!;
      expect(v.biezacy?.key).toBe('beczka');
      expect(v.cele[1].czeka).toBeUndefined();
      expect(celWOknie(widok(g), 'tablica'), 'badanie zrobione: linii na tablicy już nie ma').not.toBe(
        'Zbadajcie kozę z beczki.',
      );
      // koza z beczki w pokoju do spania (nie w kuchni): plan, materiał, praca
      const a = kotwicaKozy(g);
      expect(a, 'w pokoju do spania jest miejsce przy oknie z dojściem').toBeGreaterThanOrEqual(0);
      dajMaterial(g, { zlom: 8, czesci: 1 });
      g.sim.push({ t: 'build', ids: [], kind: 'koza_beczka', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
      g.sim.step();
      krok(g);
      expect(zaliczony(g.sciezka, 'o8.beczka'), 'sam plan niczego nie zalicza').toBe(false);
      graj(
        g,
        bez((x) => x.sim.st.things.some((t) => t.kind === 'koza_beczka')),
        {},
        4000,
      );
      const stoi = st.things.find((t) => t.kind === 'koza_beczka')!;
      expect(w.interior.rooms[w.interior.room[stoi.y * w.size + stoi.x]].kind).toBe('pokoj');
      krok(g);
      expect(zaliczony(g.sciezka, 'o8.beczka')).toBe(true);
      expect(okazja(g), 'ogrzewanie stoi i wszystkie cele zrobione: okazja zamknięta').toBeUndefined();
    });
});

describe('O8 Zima idzie: wyzwalacz, zamknięcie i podpowiedzi', () => {
  /** rzecz do stanu (jak postawiona budowla): koza z beczki w danym kafelku */
  function postaw(st: SimState, kind: string, x: number, y: number, w = 1, h = 1): void {
    st.things.push({ id: st.nextThing++, kind, x, y, w, h, rot: 0, n: 0, fuel: 0, by: -1, owner: -1 });
  }
  const wPokoju = (g: Gra): { x: number; y: number } => {
    const { w } = g.sim;
    const i = kafelkiPokoju(w, pokoje(g.sim.st, w)[0].id)[0];
    return { x: i % w.size, y: Math.floor(i / w.size) };
  };
  const wKuchni = (g: Gra): { x: number; y: number } => {
    const { w } = g.sim;
    const k = w.interior.rooms.find((r) => r.kind === 'kuchnia' && r.apt === w.interior.home)!;
    const i = kafelkiPokoju(w, k.id)[0];
    return { x: i % w.size, y: Math.floor(i / w.size) };
  };

  it('ogrzewanie w pokoju do spania wyłącza okazję: koza z beczki tam albo kocioł; koza w kuchni nie wystarcza', () => {
    const g = zimaGra('przymorze', 'zwykly');
    const { st } = g.sim;
    krok(g);
    expect(klucz(g)).toBe('o8');
    // koza (zarządu) stoi w kuchni od początku, a okazja i tak jest: sypialnia jej nie czuje
    expect(st.things.some((t) => t.kind === 'koza')).toBe(true);
    // koza z beczki w kuchni: nadal brak ogrzewania w sypialni
    const k = wKuchni(g);
    postaw(st, 'koza_beczka', k.x, k.y);
    krok(g);
    expect(klucz(g), 'koza z beczki w kuchni').toBe('o8');
    expect(zaliczony(g.sciezka, 'o8.beczka')).toBe(false);
    // koza z beczki w pokoju do spania: ogrzewanie jest, cel zaliczony, okazja zamknięta
    st.things.pop();
    const p = wPokoju(g);
    postaw(st, 'koza_beczka', p.x, p.y);
    krok(g);
    expect(zaliczony(g.sciezka, 'o8.beczka')).toBe(true);
    expect(okazja(g)).toBeUndefined();
    // bez okazji wcześniej: ta sama koza przy otwarciu nie otwiera niczego
    const h = zimaGra('przymorze', 'zwykly');
    const q = wPokoju(h);
    postaw(h.sim.st, 'koza_beczka', q.x, q.y);
    krok(h);
    expect(okazja(h)).toBeUndefined();
    // kocioł grzeje wszystkie nasze mieszkania, gdziekolwiek stoi
    const c = zimaGra('przymorze', 'zwykly');
    const kk = wKuchni(c);
    postaw(c.sim.st, 'kociol', kk.x, kk.y, 2, 1);
    krok(c);
    expect(okazja(c)).toBeUndefined();
  });

  it('bez nikogo, kto zna się na cieple (i bez książki), kozy z beczki nie da się zbadać, więc okazji nie ma; książka ją przywraca', () => {
    const g = zimaGra('przymorze', 'zwykly');
    const { st } = g.sim;
    for (const o of st.people) o.skills.cieplo = 0;
    krok(g);
    expect(okazja(g)).toBeUndefined();
    st.books = { cieplo: 1 };
    krok(g);
    expect(klucz(g)).toBe('o8');
    // ekspert na wyprawie dalej się liczy (wyprawa mija)
    delete st.books;
    const [ekspert] = rdzen(g.sim);
    st.people[ekspert.person].skills.cieplo = 2;
    ekspert.away = true;
    krok(g);
    expect(klucz(g), 'ekspert na wyprawie').toBe('o8');
    // koza z beczki już zbadana: nie trzeba wiedzy, cel „kozy” zrobiony od razu przy otwarciu
    const h = zimaGra('przymorze', 'zwykly');
    for (const o of h.sim.st.people) o.skills.cieplo = 0;
    h.sim.st.techDone = ['t_kozy'];
    krok(h);
    expect(klucz(h)).toBe('o8');
    expect(zaliczony(h.sciezka, 'o8.kozy')).toBe(true);
    expect(widok(h).okazja!.biezacy?.key).toBe('beczka');
    expect(celWOknie(widok(h), 'tablica')).not.toBe('Zbadajcie kozę z beczki.');
  });

  it('okazja trwa do końca zimy (dzień 20), potem się zamyka, a w następnym roku wraca od ósmego dnia jesieni', () => {
    const g = zimaGra('przymorze', 'zwykly', 18, 12);
    krok(g);
    expect(klucz(g), 'zima, dzień 18').toBe('o8');
    const od1 = okazja(g)!.od;
    g.sim.st.tick = tickAt(20, 22);
    krok(g);
    expect(klucz(g), 'ostatni dzień zimy').toBe('o8');
    g.sim.st.tick = tickAt(21, 6);
    krok(g);
    expect(okazja(g), 'wiosna').toBeUndefined();
    expect(zaliczony(g.sciezka, 'o8.kozy')).toBe(false);
    g.sim.st.tick = tickAt(47, 12);
    krok(g);
    expect(okazja(g), 'dzień 47 to siódmy dzień jesieni').toBeUndefined();
    g.sim.st.tick = tickAt(48, 8);
    krok(g);
    expect(klucz(g), 'dzień 48 to ósmy dzień jesieni następnego roku').toBe('o8');
    expect(okazja(g)!.od).toBeGreaterThan(od1);
    // dni 1–7 jesieni: jeszcze nie
    const h = zimaGra('przymorze', 'zwykly', 7, 12);
    krok(h);
    expect(okazja(h)).toBeUndefined();
  });

  it('zrobione cele nie wracają: po koza zbadana i postawiona okazja nie otwiera się, choćby kozę potem rozebrano', () => {
    const g = zimaGra('przymorze', 'zwykly');
    const { st } = g.sim;
    krok(g);
    st.techDone = ['t_kozy'];
    const p = wPokoju(g);
    postaw(st, 'koza_beczka', p.x, p.y);
    krok(g);
    expect(okazja(g)).toBeUndefined();
    expect(zaliczony(g.sciezka, 'o8.kozy')).toBe(true);
    expect(zaliczony(g.sciezka, 'o8.beczka')).toBe(true);
    st.things.pop();
    krok(g);
    expect(okazja(g), 'koza zniknęła, ale cele były zrobione').toBeUndefined();
  });

  it('podpowiedzi: koza w kuchni nie dogrzeje sypialni, rura idzie przez okno; pracownia najpierw, gdy jej nie ma', () => {
    const g = zimaGra('przymorze', 'zwykly');
    krok(g);
    const [kozy, beczka] = widok(g).okazja!.cele;
    expect(kozy.text).toBe('Zbadajcie kozę z beczki.');
    expect(kozy.how).toContain(
      'Zima idzie, a koza w kuchni nie dogrzeje sypialni: w mrozie ludzie wstają zmarznięci i rośnie wkurzenie. Koza z beczki grzeje pokój, w którym stoi.',
    );
    expect(kozy.how).toContain(
      'Najpierw pracownia: Budowa, zakładka Dom: Pracownia (deski 14, części 4) w pokoju waszego mieszkania.',
    );
    expect(kozy.how).not.toContain('Kozy w mieszkaniach');
    expect(beczka.text).toBe('Postawcie kozę z beczki w pokoju, w którym śpicie.');
    expect(beczka.how).toMatch(/^Koza w kuchni sypialni zimą nie dogrzeje\. Budowa, zakładka Dom: Koza z beczki/);
    expect(beczka.how).toContain('Koza z beczki (złom 8, części 1)');
    expect(beczka.how).toContain('najwyżej 2 m od okna, bo rura idzie przez okno');
    expect(beczka.how, 'miejsce przy oknie jest wolne: o paleniu mebli ani słowa').not.toContain('brak miejsca');
    expect(beczka.how, 'każdy pokój do spania ma okno: o łóżkach piętrowych ani słowa').not.toContain('piętrowe');
    // pracownia stoi: podpowiedź mówi o tablicy badań
    g.sim.st.things.push({
      id: g.sim.st.nextThing++,
      kind: 'pracownia',
      x: 0,
      y: 0,
      w: 2,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    krok(g);
    const z = widok(g).okazja!.cele[0].how;
    expect(z).toContain('Tablica badań (przycisk Badania u góry albo T): klik w kartkę z kozami, potem „Badać”.');
    expect(z).not.toContain('Najpierw pracownia');
    // dotyk
    const t = widok(g, { touch: true }).okazja!.cele[0].how;
    expect(t).toContain('(przycisk Badania u góry)');
    expect(t).toContain('stuknięcie w kartkę');
  });

  it('łóżka piętrowe w pokoju z oknem, gdy któryś pokój do spania okna nie ma; bez tej wskazówki, gdy każdy ma', () => {
    // Zielonki mają dwa pokoje do spania, oba z oknem: bez zdania o łóżkach piętrowych
    const g = zimaGra('zielonki', 'zwykly');
    krok(g);
    expect(klucz(g)).toBe('o8');
    expect(widok(g).okazja!.cele[1].how).not.toMatch(/piętrowe/);
    // ten sam dom, ale pierwszy pokój bez okna (okna przy nim zasłonięte): drugi ma okno, więc okazja jest i radzi łóżka
    const h = zimaGra('zielonki', 'zwykly');
    const { w } = h.sim;
    const ih = w.interior;
    const [bez, z] = pokoje(h.sim.st, w);
    ih.windows = ih.windows.filter((s) => ![s - 1, s + 1, s - w.size, s + w.size].some((n) => ih.room[n] === bez.id));
    krok(h);
    expect(klucz(h)).toBe('o8');
    const how = widok(h).okazja!.cele[1].how;
    expect(how).toContain('Pokój bez okna odpada: postawcie Łóżka piętrowe (deski 20) w pokoju z oknem i kozę tam.');
    expect(z.id).not.toBe(bez.id);
    ustawJezyk('en');
    expect(widok(h).okazja!.cele[1].how).toContain(
      'A room with no window won’t do: put up Bunk beds (planks 20) in a room with a window and the stove there.',
    );
  });

  it('gdy przy oknach stoją meble, podpowiedź radzi je spalić; okazja i tak jest', () => {
    const g = zimaGra('zielonki', 'zwykly');
    const { st, w } = g.sim;
    for (const r of pokoje(st, w))
      for (const i of kafelkiPokoju(w, r.id))
        if (nearWindow(w.interior, i, w.size)) postaw(st, 'krzeslo', i % w.size, Math.floor(i / w.size));
    st.techDone = ['t_kozy'];
    krok(g);
    expect(klucz(g)).toBe('o8');
    const how = widok(g).okazja!.cele[1].how;
    expect(how).toContain('Przy oknie brak miejsca? Prawy przycisk na meblu: „Spalić …”.');
    ustawJezyk('en');
    expect(widok(g).okazja!.cele[1].how).toContain(
      'No space by the window? Right-click a piece of furniture: “Burn the …”.',
    );
  });

  it('Lanciego: żaden z czterech pokoi do spania nie ma okna w zasięgu, więc koza z beczki stanie tylko w kuchni, a łóżek z kozą w pokoju z oknem nie ma gdzie postawić', () => {
    const g = zimaGra('lanciego', 'zwykly');
    const { st, w } = g.sim;
    st.techDone = ['t_kozy'];
    const spalnie = pokoje(st, w);
    expect(spalnie.length).toBe(4);
    for (const r of spalnie)
      for (const i of kafelkiPokoju(w, r.id))
        expect(nearWindow(w.interior, i, w.size), `pokój ${r.id}, kafelek ${i}`).toBe(false);
    // koza z beczki: dozwolone miejsca tylko poza pokojami do spania (kuchnia)
    const koza = allowedAnchors(st, w, 'koza_beczka', 0);
    expect(koza.length).toBeGreaterThan(0);
    for (const a of koza) expect(w.interior.rooms[w.interior.room[a]].kind).not.toBe('pokoj');
    // łóżka piętrowe stoją tylko w pokojach, a w żadnym pokoju okna nie ma
    for (const rot of [0, 1] as const)
      for (const a of allowedAnchors(st, w, 'lozka_pietrowe', rot))
        expect(nearWindow(w.interior, a, w.size)).toBe(false);
    krok(g);
    expect(okazja(g)).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- teksty */

type Okazja = NonNullable<WidokSciezki['okazja']>;

/** Widok okazji `k` bez grania: stan z otwartą okazją (widok czyta tylko stan i odczyt gry), ugryzienie wskazuje pierwszą
    osobę z zarządu. */
function widokOkazji(g: Gra, k: KluczOkazji, opcje: { touch?: boolean } = {}): Okazja {
  const cel = k === 'o5' ? rdzen(g.sim)[0].id : undefined;
  const s: StanSciezki = {
    ...nowyStanSciezki(),
    rozdzial: 'r1',
    okazja: { k, od: 0, ...(cel !== undefined ? { cel } : {}) },
  };
  return widokSciezki(s, odczytZ(g.sim.st, g.sim.w, g.gov, opcje)).okazja!;
}

/** teksty i podpowiedzi okazji: [klucz celu, tekst, podpowiedź] */
const slowaOkazji = (v: Okazja): [string, string, string][] => v.cele.map((c) => [c.key, c.text, c.how]);

describe('teksty okazji z projektu (Przymorze, zwykły tryb, mysz)', () => {
  const g = poRaporcieZObcymi('przymorze', 'zwykly');
  const pl = (k: KluczOkazji, i = 0) => {
    const c = widokOkazji(g, k).cele[i];
    return { text: c.text, how: c.how };
  };

  it('O1, O2, O3: tytuły, cele i podpowiedzi po polsku', () => {
    expect(widokOkazji(g, 'o1').tytul).toBe('Teraz: wędrowiec przy siatce');
    expect(pl('o1')).toEqual({
      text: 'Zagadajcie wędrowca.',
      how: 'Zaznaczcie kogoś i prawy przycisk na wędrowcu: „Zagadać”. Rozmowa przez siatkę przynosi wieść: o handlarzu, o autach do przeszukania.',
    });
    expect(widokOkazji(g, 'o2').tytul).toBe('Teraz: handlarz pod bramą');
    expect(pl('o2')).toEqual({
      text: 'Wymieńcie coś z handlarzem.',
      how: 'Zaznaczcie kogoś i prawy przycisk na handlarzu albo wózku: „Dać … za …”. Złom jest tu walutą. Napaść też jest w menu, ale wieść pójdzie do innych handlarzy.',
    });
    expect(widokOkazji(g, 'o3').tytul).toBe('Teraz: szabrownicy za siatką');
    expect(pl('o3', 0)).toEqual({
      text: 'Ogłoście alarm.',
      how: 'Przycisk „Do broni!” u góry: wszyscy zdolni idą na wartę przy bramie. Po wszystkim „Odwołaj”. Prawy przycisk na szabrowniku: „Atakuj szabrownika”.',
    });
    expect(pl('o3', 1)).toEqual({
      text: 'Odeprzyjcie napad.',
      how: 'Liczy się warta, która nie śpi, światło przy siatce i broń. Na noc można też zamknąć bramę: prawy przycisk na niej, „Zamknąć bramę”.',
    });
  });

  it('O4, O5, O6, O7: tytuły, cele i podpowiedzi po polsku', () => {
    expect(widokOkazji(g, 'o4').tytul).toBe('Teraz: stado pod siatką');
    expect(pl('o4', 0)).toEqual({
      text: 'Ogłoście alarm.',
      how: '„Do broni!” u góry: wszyscy zdolni idą na wartę przy siatce. Dźgajcie napierających, zanim w jednym miejscu zbierze się ich 16.',
    });
    expect(pl('o4', 1)).toEqual({
      text: 'Zabijcie trzech napierających.',
      how: 'Warta z dzidą bije sama; prawy przycisk na szwendaczu: „Atakuj szwendacza”. Rano wzmocnijcie zużytą siatkę: prawy przycisk na niej, „Wzmocnić siatkę”.',
    });
    const imie = g.sim.st.people[rdzen(g.sim)[0].person].first;
    expect(widokOkazji(g, 'o5').tytul).toBe('Teraz: ugryzienie');
    expect(pl('o5')).toEqual({
      text: `Ratujcie: ${imie} potrzebuje amputacji.`,
      how: 'Na karcie ugryzionej osoby „Amputować”: zrobi to ktoś z medycyną, pół godziny, nie zawsze się udaje. Po dwóch godzinach jest za późno.',
    });
    expect(widokOkazji(g, 'o6').tytul).toBe('Teraz: zmarły wstanie');
    expect(pl('o6')).toEqual({
      text: 'Dobijcie ciało, zanim wstanie.',
      how: 'Prawy przycisk na ciele: „Dobić”. Każdy zmarły wstaje po godzinie; wolny z zarządu dobije też sam.',
    });
    expect(widokOkazji(g, 'o7').tytul).toBe('Teraz: obcy przy aucie');
    expect(pl('o7')).toEqual({
      text: 'Przeszukajcie wrak przy ulicy.',
      how: 'Prawy przycisk na aucie: „Przeszukać …”, a po przeszukaniu „Rozebrać …” na złom i części. Obcych od auta odgoni „Przegonić”.',
    });
  });

  it('O8: tytuł i cele po polsku', () => {
    expect(widokOkazji(g, 'o8').tytul).toBe('Teraz: zima idzie');
    expect(pl('o8', 0).text).toBe('Zbadajcie kozę z beczki.');
    expect(pl('o8', 1).text).toBe('Postawcie kozę z beczki w pokoju, w którym śpicie.');
  });

  it('te same okazje po angielsku', () => {
    ustawJezyk('en');
    const en = (k: KluczOkazji, i = 0) => {
      const c = widokOkazji(g, k).cele[i];
      return { text: c.text, how: c.how };
    };
    expect(widokOkazji(g, 'o1').tytul).toBe('Now: a wanderer at the fence');
    expect(en('o1')).toEqual({
      text: 'Talk to the wanderer.',
      how: 'Select someone and right-click the wanderer: “Talk to the wanderer”. A chat through the fence brings news: about the trader, about cars worth searching.',
    });
    expect(widokOkazji(g, 'o2').tytul).toBe('Now: the trader at the gate');
    expect(en('o2')).toEqual({
      text: 'Trade with the trader.',
      how: 'Select someone and right-click the trader or his cart: “Give … for …”. Scrap is the currency here. Robbing him is on the menu too, but word will reach the other traders.',
    });
    expect(widokOkazji(g, 'o3').tytul).toBe('Now: looters at the fence');
    expect(en('o3', 0)).toEqual({
      text: 'Sound the alarm.',
      how: 'The “To arms!” button at the top: everyone who can stand goes on watch at the gate. Afterwards, “Stand down”. Right-click a looter: “Attack the looter”.',
    });
    expect(en('o3', 1)).toEqual({
      text: 'Fight off the raid.',
      how: 'What counts is a watch that’s awake, light by the fence and weapons. You can also shut the gate for the night: right-click it, “Close the gate”.',
    });
    expect(widokOkazji(g, 'o4').tytul).toBe('Now: the herd at the fence');
    expect(en('o4', 0).how).toBe(
      'The “To arms!” button: everyone who can stand goes on watch at the fence. Spear the ones pressing in before 16 of them bunch up in one spot.',
    );
    expect(en('o4', 1)).toEqual({
      text: 'Kill three of the ones pressing in.',
      how: 'A guard with a spear fights on their own; right-click a shambler: “Attack the shambler”. In the morning shore up the worn fence: right-click it, “Shore up the fence”.',
    });
    const imie = g.sim.st.people[rdzen(g.sim)[0].person].first;
    expect(widokOkazji(g, 'o5').tytul).toBe('Now: a bite');
    expect(en('o5')).toEqual({
      text: `Save ${imie}: amputate.`,
      how: 'On the bitten person’s card, “Amputate”: someone with Medicine does it, half an hour, and it doesn’t always work. After two hours it’s too late.',
    });
    expect(widokOkazji(g, 'o6').tytul).toBe('Now: the dead will rise');
    expect(en('o6')).toEqual({
      text: 'Finish off the body before it gets up.',
      how: 'Right-click the body: “Finish off the body”. Everyone who dies gets back up an hour later; a free board member will also do it on their own.',
    });
    expect(widokOkazji(g, 'o7').tytul).toBe('Now: strangers at a car');
    expect(en('o7')).toEqual({
      text: 'Search a wreck by the road.',
      how: 'Right-click a car: “Search …”, and once it’s searched, “Strip …” for scrap and parts. “Chase them off” sends the strangers away from the car.',
    });
    expect(widokOkazji(g, 'o8').tytul).toBe('Now: winter is coming');
    expect(en('o8', 0).text).toBe('Research the barrel stove.');
    expect(en('o8', 1).text).toBe('Put a barrel stove in the room where you sleep.');
  });

  it('liczby w tekstach są ze stałych gry: amputacja pół godziny i dwie godziny, wstawanie po godzinie', () => {
    expect(AMPUTATE_TICKS).toBe(TICKS_PER_HOUR / 2);
    expect(AMPUTATE_WINDOW).toBe(2 * TICKS_PER_HOUR);
    expect(RISE_TICKS).toBe(TICKS_PER_HOUR);
    expect(pl('o4', 0).how).toContain(` ${FENCE_BEARS}.`);
  });
});

describe.each(KOMBINACJE)('wszystkie teksty okazji: %s %s', (key, mode) => {
  const dom = key === 'zielonki';
  const zombie = mode === 'zombie';
  const g = poRaporcieZObcymi(key, mode);

  /** teksty wszystkich okazji (tytuły, cele, podpowiedzi) w bieżącym języku, na myszy i na dotyku */
  function wszystkie(): string[] {
    const out: string[] = [];
    for (const touch of [false, true])
      for (const k of KLUCZE_OKAZJI) {
        const v = widokOkazji(g, k, { touch });
        out.push(v.tytul, ...slowaOkazji(v).flatMap(([, t, h]) => [t, h]));
      }
    return out;
  }

  it('po polsku: tytuł z „Teraz:”, bez myślników, w domu bez słów z bloku', () => {
    for (const k of KLUCZE_OKAZJI) expect(widokOkazji(g, k).tytul, k).toMatch(/^Teraz: /);
    const pl = wszystkie().join('\n');
    expect(pl).not.toMatch(/[—–]/);
    if (dom) expect(pl).not.toMatch(FORBIDDEN_DOM);
  });

  it('po angielsku: tytuł z „Now:”, bez polskich liter i słówek, bez myślników, w domu bez „flat”, „stairwell” i „block”', () => {
    ustawJezyk('en');
    for (const k of KLUCZE_OKAZJI) expect(widokOkazji(g, k).tytul, k).toMatch(/^Now: /);
    const en = wszystkie().join('\n');
    expect(polskieSlowa(en, [g.sim.st.people[rdzen(g.sim)[0].person].first]), en).toEqual([]);
    expect(en).not.toMatch(/[—–]/);
    if (dom) expect(en).not.toMatch(/\b(flat|stairwell|block)\b/i);
  });

  it('mysz i dotyk: na dotyku nie ma prawego przycisku ani kliknięcia, na myszy jest', () => {
    for (const k of KLUCZE_OKAZJI) {
      const mysz = slowaOkazji(widokOkazji(g, k, { touch: false }))
        .map(([, , h]) => h)
        .join(' ');
      const dotyk = slowaOkazji(widokOkazji(g, k, { touch: true }))
        .map(([, , h]) => h)
        .join(' ');
      expect(dotyk, `${k} dotyk`).not.toMatch(/prawy przycisk|klik|right-click|click/i);
      if (/prawy przycisk|klik/i.test(mysz)) expect(dotyk, `${k} dotyk ma palec`).toMatch(/palec|stuk/i);
      expect(mysz, `${k} mysz`).not.toMatch(/palec|stuknij/i);
    }
  });

  it('słowa miejsca: brama albo furtka, zarząd albo komitet; tryb zombie: ocalały zamiast wędrowca', () => {
    const o2 = widokOkazji(g, 'o2').tytul;
    expect(o2).toBe(dom ? 'Teraz: handlarz pod furtką' : 'Teraz: handlarz pod bramą');
    const o3 = widokOkazji(g, 'o3').cele[1].how;
    expect(o3).toContain(dom ? 'zamknąć furtkę' : 'zamknąć bramę');
    expect(o3).toContain(dom ? '„Zamknąć furtkę”' : '„Zamknąć bramę”');
    expect(widokOkazji(g, 'o3').cele[0].how).toContain(dom ? 'przy furtce' : 'przy bramie');
    expect(widokOkazji(g, 'o6').cele[0].how).toContain(dom ? 'wolny z komitetu' : 'wolny z zarządu');
    expect(widokOkazji(g, 'o1').tytul).toBe(zombie ? 'Teraz: ocalały przy siatce' : 'Teraz: wędrowiec przy siatce');
    ustawJezyk('en');
    expect(widokOkazji(g, 'o2').tytul).toBe(dom ? 'Now: the trader at the garden gate' : 'Now: the trader at the gate');
    expect(widokOkazji(g, 'o3').cele[1].how).toContain(dom ? 'Close the garden gate' : 'Close the gate');
    expect(widokOkazji(g, 'o6').cele[0].how).toContain(dom ? 'a free committee member' : 'a free board member');
    expect(widokOkazji(g, 'o1').tytul).toBe(zombie ? 'Now: a survivor at the fence' : 'Now: a wanderer at the fence');
  });
});
