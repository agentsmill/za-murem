/* Rozdziały R2 („Ludzie i noc”), R4 („Zarząd”) i R5 („Jedzenie”) ścieżki celów
   (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R2”, „R4”, „R5”) na prawdziwej symulacji z zarządem:
   Przymorze, Lanciego i Zielonki w obu trybach. Każdy cel ma test „fałsz przed czynnością, prawda po niej”, a cele
   z licznikami „od otwarcia” nie łapią stanu sprzed otwarcia rozdziału.

   R2: `sily` (zdarzenie interfejsu `lista`), `ognisko` (zwykły: ognisko płonie po 18:00) albo `dzgnij` (zombie: polecenie
   ataku na szwendaczu przez siatkę), `uzbrojeni` (zwykły: broń u `min(2, osób)` osób) albo `dzidy` (zombie: karta nocy
   zatwierdzona po otwarciu rozdziału z `min(2, osób)` przydziałami `warta:siatka` u osób z dzidą). R4: `uchwala` (podpis
   po otwarciu, czeka do zebrania), `wkurzenie` (obserwacja: poranny raport po otwarciu, czeka do rana, a po raporcie niesie lekcję o tym, co obniża wkurzenie), `nowi` (przyjęcie
   od otwarcia, w zombie zapas po czasie przy ekranie równym trzem dobom gry przy 1×, czyli 1880 s; reguły A i B, goście pod bramą i okazje w sciezka-nowi.test.ts; tu teksty), `ludzie` (karta mieszkańca albo budynku; wariant bloku z mieszkańcami z generatora i wariant
   domu). R5: `wyprawa` (wyprawa dzienna w drodze), `lup` (łup z miejsc z mapy większy niż przy otwarciu), `ogrodek`
   (gotowy ogródek); wyprawa i łup tylko z mapą miasta w grze. Do tego kolejność rozdziałów (R3 „Praca” stoi między R2 a R4,
   jego cele sprawdza sciezka-praca.test.ts), przejścia R2 → R3 → R4 → R5 → R6 (dalej R6–R8 i „koniec” w
   sciezka-r6-r8.test.ts), stary zapis w „koniec” po R1, który otwiera R2 (silnik: src/ui/sciezka.ts), zapis i wczytanie
   w środku rozdziałów oraz teksty z projektu w obu językach, na myszy i na dotyku, w bloku i w domu. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAW_CD } from '../../src/content/data.ts';
import { makePerson } from '../../src/content/people.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { powodOdmowy, wyslijWyprawe } from '../../src/gov/dzienne.ts';
import { CARD_HOUR, KOZA_KEY, MORNING } from '../../src/gov/noc.ts';
import type { GovEffects, NightReport, Prompt } from '../../src/gov/typy.ts';
import { lawOptions } from '../../src/gov/uchwaly.ts';
import { atHour, emptyEffects, zeroStock } from '../../src/gov/wspolne.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { LAW_HOUR, LAW_MINUTE, setNight, signLaw } from '../../src/gov/zarzad.ts';
import { ludnoscOf } from '../../src/gov/zwyciestwo.ts';
import { START_KIT } from '../../src/sim/bron.ts';
import { minutesAt } from '../../src/sim/clock.ts';
import { applyGov, govInput } from '../../src/sim/gov.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim } from '../../src/sim/sim.ts';
import { populacja, snapshot } from '../../src/sim/snapshot.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { allowedAnchors, buildItems } from '../../src/ui/budowa.ts';
import {
  celeHtml,
  celWOknie,
  type KluczRozdzialu,
  krokSciezki,
  licznikiStartu,
  nowyStanSciezki,
  type StanSciezki,
  zdarzenieUi,
} from '../../src/ui/sciezka.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import { swiatMieszkancow } from '../../tools/bot-mieszkancy.ts';
import { okolicaZGeo } from './miasto-play.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { knockHouse, meet, core as rdzen } from './sasiedzi-pomoc.ts';
import { dajMaterial } from './sciezka-mapy.ts';
import {
  cel,
  cele,
  DEMA,
  type Demo,
  doba,
  doKarty,
  type Gra,
  godzina,
  graj,
  graZSymulacji,
  klon,
  krok,
  odczyt,
  odpowiedz,
  otworz,
  poPierwszymRaporcie,
  przezZapis,
  TRYBY,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const KOMBINACJE = DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));
const KOMBINACJE_ZWYKLE = DEMA.map((key) => [key, 'zwykly'] as const);
const KOMBINACJE_ZOMBIE = DEMA.map((key) => [key, 'zombie'] as const);

/** gra po pierwszym raporcie (drugi dzień rano) z otwartym rozdziałem `k` */
function wRozdziale(key: Demo, mode: GameMode, k: KluczRozdzialu): Gra {
  const g = poPierwszymRaporcie(key, mode);
  otworz(g, k);
  return g;
}

const klucze = (g: Gra): string[] => cele(g).map((c) => c.key);
const tytul = (g: Gra): string | undefined => widok(g).rozdzial?.tytul;
const zrobione = (g: Gra, k: KluczRozdzialu): string[] =>
  Object.keys(g.sciezka.zrobione)
    .filter((x) => x.startsWith(`${k}.`))
    .sort();

/** kafelek, na którym stoi pionek */
const kafelek = (g: Gra, p: Pawn): number => Math.floor(p.y) * g.sim.w.size + Math.floor(p.x);

/** id osoby zarządu (jak na karcie nocy i w `gov.night.assign`) dla pionka */
const idOsoby = (g: Gra, p: Pawn): string => odczyt(g).snap.people.find((q) => q.pawn === p.id)!.id;

/** wszystkie teksty widoku rozdziału (tytuł, tekst, podpowiedź, dopisek) */
const teksty = (g: Gra, touch: boolean): string[] => {
  const r = widok(g, { touch }).rozdzial!;
  return [r.tytul, ...r.cele.flatMap((c) => [c.text, c.how, c.czeka ?? ''])];
};

/** ognisko z menu „Rozpalić ognisko tutaj” na wolnym kafelku podwórka, czekamy, aż stanie */
function rozpalOgnisko(g: Gra): void {
  const { st, w } = g.sim;
  const ids = [rdzen(g.sim)[0].id];
  for (const t of w.fence.yard) {
    const m = commandsAt(st, w, ids, t).find((x) => x.cmd.t === 'campfire');
    if (m && g.sim.siteOk(t)) {
      g.sim.push(m.cmd);
      graj(g, (x) => x.sim.st.things.some((r) => r.kind === 'ognisko'), {}, 600);
      return;
    }
  }
  throw new Error('nie ma wolnego miejsca na ognisko');
}

/** zdarzenie interfejsu w tej chwili gry */
function zdarz(g: Gra, k: 'lista' | 'mieszkaniec' | 'budynek' | 'drogi'): void {
  g.sciezka = zdarzenieUi(g.sciezka, k, g.sim.st.tick);
}

/** raport z nocy tylko z tym, co czyta ścieżka (dzień nocy i `dAnger`); reszta jak po spokojnej nocy. Raport za noc `day`
    powstaje o 6:00 dnia `day + 1`. */
const raport = (dAnger: number, day = 2): NightReport => ({
  day,
  lines: [],
  raid: 'brak',
  stolen: zeroStock(),
  loot: zeroStock(),
  hurt: [],
  tired: [],
  trust: 50,
  anger: 20,
  dTrust: 0,
  dAnger,
});

/** Dopisek czekającego celu „wkurzenie” (R4.2): prawdziwy powód czekania, jak „czeka do 20:00” i „czeka do zebrania”. */
const CZEKA_RANO = 'czeka do rana';
const CZEKA_RANO_EN = 'waiting for morning';
/** Lekcja o wkurzeniu: dopisek zaliczonego celu (`uwaga`), bo podpowiedź celu, który czeka, się nie pokazuje. Ten sam w obu trybach
    (bez ogniska: w zombie R2 każe unikać światła nocą). */
const LEKCJA_WKURZENIE = 'Wkurzenie spada, gdy ludzie są najedzeni i w cieple.';
const LEKCJA_WKURZENIE_EN = 'Anger drops when people are fed and warm.';

/** skutki zarządu z jednym polem ustawionym przez test */
function skutki(f: (e: GovEffects) => void): GovEffects {
  const e = emptyEffects();
  f(e);
  return e;
}

/* ---------------------------------------------------------------- kolejność rozdziałów */

describe('kolejność rozdziałów: R0, R1, R2, R3, R4, R5, R6, R7, R8', () => {
  it('ROZDZIALY ma w tej kolejności pierwszy dzień, drugi dzień, ludzi i noc, pracę, zarząd, jedzenie, badania, sąsiadów i drogi', () => {
    // R3 (praca) sprawdza sciezka-praca.test.ts; R6–R8 (badania, sąsiedzi, drogi do zwycięstwa) sciezka-r6-r8.test.ts
    expect(ROZDZIALY.map((r) => r.k)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
  });

  it.each(KOMBINACJE)('%s %s: tytuły i cele rozdziałów R2, R4 i R5', (key, mode) => {
    const dom = wDomu(key);
    const g = wRozdziale(key, mode, 'r2');
    expect(tytul(g)).toBe('Ludzie i noc');
    expect(klucze(g)).toEqual(mode === 'zombie' ? ['sily', 'dzgnij', 'dzidy'] : ['sily', 'ognisko', 'uzbrojeni']);
    ustawJezyk('en');
    expect(tytul(g)).toBe('People and the night');
    ustawJezyk('pl');

    const r4 = wRozdziale(key, mode, 'r4');
    expect(tytul(r4)).toBe(dom ? 'Komitet' : 'Zarząd');
    expect(klucze(r4)).toEqual(['uchwala', 'wkurzenie', 'nowi', 'ludzie']);
    ustawJezyk('en');
    expect(tytul(r4)).toBe(dom ? 'The committee' : 'The board');
    ustawJezyk('pl');

    const r5 = poPierwszymRaporcie(key, mode);
    wlaczMiasto(r5.gov);
    otworz(r5, 'r5');
    expect(tytul(r5)).toBe('Jedzenie');
    expect(klucze(r5)).toEqual(['wyprawa', 'lup', 'ogrodek']);
    ustawJezyk('en');
    expect(tytul(r5)).toBe('Food');
  });

  it('R5 bez mapy miasta w grze (?miasto=0) ma tylko ogródek: wyprawa i łup z mapy nie wchodzą do listy', () => {
    const g = wRozdziale('przymorze', 'zwykly', 'r5');
    expect(g.gov.miasto).toBeUndefined();
    expect(klucze(g)).toEqual(['ogrodek']);
    wlaczMiasto(g.gov);
    expect(klucze(g)).toEqual(['wyprawa', 'lup', 'ogrodek']);
  });

  it('rozdziały R2 do R5 nie mają celów z terminem: nic nie przepada, nawet po nocy bez niczego', () => {
    // definicje: tylko R0 `drewno` oraz R1 `drewno2` i `dyzur` mają warunek przepadnięcia
    const zTerminem = ROZDZIALY.flatMap((r) => r.cele.filter((c) => c.przepadl).map((c) => `${r.k}.${c.key}`));
    expect(zTerminem).toEqual(['r0.drewno', 'r1.drewno2', 'r1.dyzur']);
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(g, 'r2');
    graj(g, (x) => x.gov.reports.length >= 3 && !x.gov.report, {}, 3000);
    expect(g.sciezka.przepadle.filter((k) => /^r[2345]\./.test(k))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- R2. Ludzie i noc */

describe.each(KOMBINACJE)('R2 sily: %s %s', (key, mode) => {
  it('fałsz przed zdarzeniem, prawda po wyborze z listy ludzi; zdarzenie sprzed otwarcia rozdziału się nie liczy', () => {
    const g = poPierwszymRaporcie(key, mode);
    // wybór z listy przed otwarciem rozdziału (na przykład w pierwszym dniu)
    zdarz(g, 'lista');
    for (let k = 0; k < 100; k++) g.sim.step();
    otworz(g, 'r2');
    expect(g.sciezka.ui.lista).toBeLessThan(g.sciezka.od);
    expect(cel(g, 'sily').done, 'zdarzenie sprzed otwarcia').toBe(false);
    expect(cel(g, 'sily').czeka).toBeUndefined();
    expect(widok(g).rozdzial!.biezacy?.key).toBe('sily');
    // inne zdarzenia interfejsu nie zaliczają tego celu
    for (const k of ['mieszkaniec', 'budynek', 'drogi'] as const) zdarz(g, k);
    expect(cel(g, 'sily').done).toBe(false);
    for (let k = 0; k < 10; k++) g.sim.step();
    zdarz(g, 'lista');
    expect(cel(g, 'sily').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.sily']);
    // zaliczenie jest trwałe
    g.sciezka = { ...g.sciezka, ui: {} };
    expect(cel(g, 'sily').done).toBe(true);
  });

  it('zdarzenie w tym samym ticku co otwarcie rozdziału się liczy (na pauzie tick stoi)', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    zdarz(g, 'lista');
    expect(g.sciezka.ui.lista).toBe(g.sciezka.od);
    expect(cel(g, 'sily').done).toBe(true);
  });
});

describe.each(KOMBINACJE_ZWYKLE)('R2 ognisko: %s %s', (key, mode) => {
  it('ognisko płonie po 18:00: rozpalone rano i wypalone niczego nie zalicza, wieczorne zalicza', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    expect(cel(g, 'ognisko').done).toBe(false);
    expect(cel(g, 'ognisko').czeka).toBeUndefined();
    // rano: ognisko płonie dwie godziny (2 drewna), po 18:00 go już nie ma
    graj(g, (x) => godzina(x) >= 8, {}, 300);
    rozpalOgnisko(g);
    expect(godzina(g)).toBeLessThan(18);
    expect(g.sim.st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0)).toBe(true);
    expect(cel(g, 'ognisko').done, 'płonie, ale przed 18:00').toBe(false);
    graj(g, (x) => godzina(x) >= 12, {}, 400);
    expect(g.sim.st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0)).toBe(false);
    graj(g, (x) => godzina(x) >= 19, {}, 600);
    expect(g.gov.evening.campfire).toBe(false);
    expect(cel(g, 'ognisko').done, 'wypalone, wieczorem nie płonie').toBe(false);
    expect(g.sciezka.zrobione).not.toHaveProperty(['r2.ognisko']);
  });

  it('ognisko rozpalone po południu płonie o 18:00: cel zaliczony razem z flagą zarządu, trwale', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    graj(g, (x) => godzina(x) >= 17, {}, 900);
    rozpalOgnisko(g);
    graj(g, (x) => godzina(x) >= 18, {}, 300);
    expect(g.gov.evening.campfire).toBe(true);
    expect(cel(g, 'ognisko').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.ognisko']);
    // po wypaleniu ogniska i rano zaliczenie zostaje
    graj(g, (x) => godzina(x) >= 8 && x.gov.reports.length >= 2 && !x.gov.report, {}, 1500);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.ognisko']);
  });
});

describe.each(KOMBINACJE_ZOMBIE)('R2 dzgnij: %s %s', (key, mode) => {
  /** zarząd z dzidą, syty i wypoczęty (pilna potrzeba przerywa polecenie), oraz szwendacze pod siatką; `z` to ten, który
      stoi najbliżej osoby z dzidą (do dalekiego nikt nie dojdzie od środka) */
  function stado(g: Gra) {
    const { st, w } = g.sim;
    const kto = rdzen(g.sim).find((p) => p.weapon === 'dzida')!;
    kto.needs!.food = 100;
    kto.needs!.rest = 100;
    g.sim.spawnAtFence(3, w.buildings[w.hq].entrances[0].out);
    const odl = (p: Pawn) => Math.hypot(p.x - kto.x, p.y - kto.y);
    const z = st.pawns.filter((p) => p.kind === 'zombie').sort((a, b) => odl(a) - odl(b))[0];
    return { st, w, kto, z };
  }

  /** wróg, z którym walczy osoba z zarządu */
  const wrog = (g: Gra, kto: Pawn): Pawn | undefined => g.sim.st.pawns.find((q) => q.id === kto.job?.target);

  it('fałsz bez polecenia, prawda po poleceniu „Atakuj szwendacza” osobą z dzidą', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const { st, w, kto, z } = stado(g);
    expect(cel(g, 'dzgnij').done).toBe(false);
    expect(cel(g, 'dzgnij').czeka).toBeUndefined();
    expect(st.pawns.filter((p) => p.kind === 'zombie').length).toBeGreaterThan(0);
    const atak = commandsAt(st, w, [kto.id], kafelek(g, z)).find((x) => x.cmd.t === 'attack');
    expect(atak?.label).toBe('Atakuj szwendacza');
    g.sim.push(atak!.cmd);
    g.sim.step();
    expect(kto.job).toMatchObject({ t: 'fight', order: true });
    expect(wrog(g, kto)?.kind).toBe('zombie');
    expect(cel(g, 'dzgnij').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.dzgnij']);
    // trwałe: walka się kończy, zaliczenie zostaje
    for (let k = 0; k < 800; k++) g.sim.step();
    expect(cel(g, 'dzgnij').done).toBe(true);
  });

  it('walka bez polecenia gracza albo z kimś, kto nie jest szwendaczem, niczego nie zalicza', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const { st, w, kto, z } = stado(g);
    const atak = commandsAt(st, w, [kto.id], kafelek(g, z)).find((x) => x.cmd.t === 'attack');
    g.sim.push(atak!.cmd);
    g.sim.step();
    expect(kto.job).toMatchObject({ t: 'fight', order: true });
    // ta sama walka, ale z automatu (np. warta): bez polecenia
    kto.job!.order = false;
    expect(cel(g, 'dzgnij').done).toBe(false);
    // walka z polecenia, ale pionek nie jest z zarządu (tu: inny szwendacz z taką samą pracą bije tego pierwszego)
    const obcy = st.pawns.find((p) => p.kind === 'zombie' && p.id !== kto.job!.target)!;
    const praca = obcy.job;
    obcy.job = { ...kto.job!, order: true };
    expect(cel(g, 'dzgnij').done).toBe(false);
    obcy.job = praca;
    // polecenie, ale wróg to nie szwendacz (tu: id innej osoby z zarządu)
    kto.job!.order = true;
    const szwendacz = kto.job!.target;
    kto.job!.target = rdzen(g.sim).find((p) => p.id !== kto.id)!.id;
    expect(cel(g, 'dzgnij').done).toBe(false);
    // i znów szwendacz z polecenia
    kto.job!.target = szwendacz;
    expect(cel(g, 'dzgnij').done).toBe(true);
  });
});

describe.each(KOMBINACJE_ZWYKLE)('R2 uzbrojeni: %s %s', (key, mode) => {
  it('fałsz przy jednej broni, prawda, gdy druga osoba bierze nóż z magazynu („Zmień”); trwale', () => {
    const g = poPierwszymRaporcie(key, mode);
    const ludzie = rdzen(g.sim);
    expect(ludzie).toHaveLength(4);
    expect(START_KIT.zwykly.store).toEqual(expect.arrayContaining(['noz', 'lom']));
    otworz(g, 'r2');
    expect(ludzie.filter((p) => p.weapon)).toHaveLength(START_KIT.zwykly.core.length);
    expect(cel(g, 'uzbrojeni').done).toBe(false);
    const bez = ludzie.find((p) => !p.weapon)!;
    g.sim.push({ t: 'arm', ids: [bez.id], weapon: 'noz' });
    expect(cel(g, 'uzbrojeni').done, 'polecenie jeszcze nie dotarło do symulacji').toBe(false);
    g.sim.step();
    expect(bez.weapon).toBe('noz');
    expect(cel(g, 'uzbrojeni').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.uzbrojeni']);
    // odłożona broń nie cofa zaliczenia
    g.sim.push({ t: 'arm', ids: [bez.id], weapon: null });
    g.sim.step();
    expect(bez.weapon ?? null).toBeNull();
    expect(cel(g, 'uzbrojeni').done).toBe(true);
  });

  it('próg to najwyżej dwie osoby: jedna osoba w zarządzie z bronią zalicza od razu, dwie osoby potrzebują dwóch broni', () => {
    const w = poPierwszymRaporcie(key, mode).sim.w;
    for (const osob of [1, 2]) {
      const sim = new Sim(w, createSim(w, 5, { core: osob, mode }));
      const g = graZSymulacji(key, mode, 5, sim);
      const ludzie = rdzen(sim);
      expect(ludzie.filter((p) => p.weapon)).toHaveLength(1);
      otworz(g, 'r2');
      expect(cel(g, 'uzbrojeni').done, `${osob} os.`).toBe(osob === 1);
      if (osob === 1) continue;
      const bez = ludzie.find((p) => !p.weapon)!;
      sim.push({ t: 'arm', ids: [bez.id], weapon: 'noz' });
      sim.step();
      expect(cel(g, 'uzbrojeni').done).toBe(true);
    }
  });

  it('jedna osoba bez broni jeszcze nie spełnia progu', () => {
    const w = poPierwszymRaporcie(key, mode).sim.w;
    const sim = new Sim(w, createSim(w, 5, { core: 1, mode }));
    const g = graZSymulacji(key, mode, 5, sim);
    const [jedyna] = rdzen(sim);
    sim.push({ t: 'arm', ids: [jedyna.id], weapon: null });
    sim.step();
    expect(jedyna.weapon ?? null).toBeNull();
    otworz(g, 'r2');
    expect(cel(g, 'uzbrojeni').done).toBe(false);
    sim.push({ t: 'arm', ids: [jedyna.id], weapon: 'noz' });
    sim.step();
    expect(cel(g, 'uzbrojeni').done).toBe(true);
  });
});

describe.each(KOMBINACJE_ZOMBIE)('R2 dzidy: %s %s', (key, mode) => {
  /** dwie osoby z dzidą: zarząd ma jedną na starcie, druga z magazynu przez „Zmień” */
  function drugaDzida(g: Gra): Pawn[] {
    const ludzie = rdzen(g.sim);
    const bez = ludzie.find((p) => p.weapon !== 'dzida' && p.weapon !== 'rewolwer')!;
    g.sim.push({ t: 'arm', ids: [bez.id], weapon: 'dzida' });
    g.sim.step();
    const dzidy = ludzie.filter((p) => p.weapon === 'dzida');
    expect(dzidy).toHaveLength(2);
    return dzidy;
  }

  /** karta nocy dnia: „Warta przy siatce” dla `straz`, reszta śpi; karta otwarta (jeszcze niezatwierdzona) */
  function przydziel(g: Gra, straz: readonly Pawn[]) {
    const card = doKarty(g);
    const kto = new Set(straz.map((p) => idOsoby(g, p)));
    for (const o of card.people) expect(setNight(g.gov, o.id, kto.has(o.id) ? 'warta:siatka' : 'sen')).toBe(true);
    return card;
  }

  /** i zatwierdzona */
  function zatwierdz(g: Gra, straz: readonly Pawn[]): void {
    const card = przydziel(g, straz);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
  }

  it('czeka do karty nocy, a przy karcie nie czeka; okno to karta nocy; brak terminu', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    expect(cel(g, 'dzidy')).toMatchObject({ done: false, czeka: 'czeka do 20:00', okno: 'karta' });
    ustawJezyk('en');
    expect(cel(g, 'dzidy').czeka).toBe('waiting for 20:00');
    ustawJezyk('pl');
    expect(widok(g).rozdzial!.biezacy?.key).not.toBe('dzidy');
    expect(celWOknie(widok(g), 'karta'), 'przed kartą okno nie ma celu').toBeNull();
    doKarty(g);
    expect(cel(g, 'dzidy')).toMatchObject({ done: false });
    expect(cel(g, 'dzidy').czeka).toBeUndefined();
    expect(celWOknie(widok(g), 'karta')).toBe('Postawcie na noc dwie dzidy przy siatce.');
    expect(g.sciezka.przepadle).not.toContain('r2.dzidy');
  });

  it('dwie dzidy na warcie przy siatce na zatwierdzonej karcie zaliczają cel, nie sam przydział', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const dzidy = drugaDzida(g);
    const card = przydziel(g, dzidy);
    expect(cel(g, 'dzidy').done, 'przydział na otwartej karcie').toBe(false);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    expect(g.gov.night!.confirmed).toBe(true);
    expect(cel(g, 'dzidy').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r2.dzidy']);
  });

  it('jedna dzida przy siatce nie wystarcza, cel nie przepada, a następnej nocy dwie dzidy go zaliczają', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const dzidy = drugaDzida(g);
    // druga dzida śpi
    zatwierdz(g, [dzidy[0]]);
    expect(g.gov.night!.confirmed).toBe(true);
    expect(g.gov.night!.day).toBe(2);
    expect(cel(g, 'dzidy')).toMatchObject({ done: false });
    expect(cel(g, 'dzidy').missed).toBeUndefined();
    expect(g.sciezka.przepadle).not.toContain('r2.dzidy');
    // kolejna noc: obie dzidy przy siatce
    zatwierdz(g, dzidy);
    expect(g.gov.night!.day).toBe(3);
    expect(cel(g, 'dzidy').done).toBe(true);
  });

  it('dzida na innej warcie niż przy siatce (brama, koza) się nie liczy', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const dzidy = drugaDzida(g);
    for (const inna of ['warta:brama', KOZA_KEY]) {
      const h = klon(g);
      const card = doKarty(h);
      for (const o of card.people) expect(setNight(h.gov, o.id, 'sen')).toBe(true);
      expect(setNight(h.gov, idOsoby(h, dzidy[0]), 'warta:siatka')).toBe(true);
      expect(setNight(h.gov, idOsoby(h, dzidy[1]), inna)).toBe(true);
      odpowiedz(h, { k: 'karta', card, assign: { ...h.gov.night!.assign } });
      expect(h.gov.night!.confirmed).toBe(true);
      expect(cel(h, 'dzidy').done, inna).toBe(false);
    }
  });

  it('dwie osoby przy siatce, ale tylko jedna z dzidą: jeszcze nie', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r2');
    const [jedyna] = rdzen(g.sim).filter((p) => p.weapon === 'dzida');
    const bezDzidy = rdzen(g.sim).find((p) => p.weapon !== 'dzida')!;
    zatwierdz(g, [jedyna, bezDzidy]);
    expect(g.gov.night!.confirmed).toBe(true);
    expect(cel(g, 'dzidy').done).toBe(false);
  });

  it('karta zatwierdzona przed otwarciem rozdziału nie zalicza celu: czeka na następną noc', () => {
    const g = poPierwszymRaporcie(key, mode);
    const dzidy = drugaDzida(g);
    zatwierdz(g, dzidy);
    graj(g, (x) => godzina(x) >= 21, {}, 200);
    otworz(g, 'r2');
    expect(cel(g, 'dzidy')).toMatchObject({ done: false, czeka: 'czeka do 20:00' });
  });

  it('próg to najwyżej dwie osoby: jedyna osoba z dzidą na warcie przy siatce zalicza cel', () => {
    const w = poPierwszymRaporcie(key, mode).sim.w;
    const sim = new Sim(w, createSim(w, 5, { core: 1, mode }));
    const g = graZSymulacji(key, mode, 5, sim);
    const [jedyna] = rdzen(sim);
    sim.push({ t: 'arm', ids: [jedyna.id], weapon: 'dzida' });
    sim.step();
    expect(jedyna.weapon).toBe('dzida');
    // pierwsza doba do 20:00 bez zatrzymań: karta nocy dnia 1 powstaje po otwarciu rozdziału
    otworz(g, 'r2');
    const card = doKarty(g);
    expect(setNight(g.gov, card.people[0].id, 'warta:siatka')).toBe(true);
    odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
    expect(cel(g, 'dzidy').done).toBe(true);
  });
});

describe('R2: linia celu w oknach (celWOknie)', () => {
  it('zwykły tryb: żaden cel R2 nie dotyczy okna karty nocy', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(g, 'r2');
    expect(celWOknie(widok(g), 'karta')).toBeNull();
    doKarty(g);
    expect(celWOknie(widok(g), 'karta')).toBeNull();
  });
});

/* ---------------------------------------------------------------- R4. Zarząd */

describe.each(KOMBINACJE)('R4 uchwala: %s %s', (key, mode) => {
  it('czeka do zebrania 19:30, w czasie zebrania nie czeka (okno uchwały), po podpisie zaliczona', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    expect(cel(g, 'uchwala')).toMatchObject({ done: false, czeka: 'czeka do zebrania', okno: 'uchwala' });
    ustawJezyk('en');
    expect(cel(g, 'uchwala').czeka).toBe('waiting for the meeting');
    ustawJezyk('pl');
    // bieżący cel to pierwszy niezrobiony, który nie czeka: uchwała i wkurzenie czekają, więc „nowi”
    expect(widok(g).rozdzial!.biezacy?.key).toBe('nowi');
    const p = graj(g, () => false, { stoj: ['uchwala'] }, 2000) as Extract<Prompt, { k: 'uchwala' }>;
    expect(p.k).toBe('uchwala');
    expect(g.gov.lawPending).toBe(true);
    expect(godzina(g)).toBe(LAW_HOUR);
    expect(cel(g, 'uchwala')).toMatchObject({ done: false });
    expect(cel(g, 'uchwala').czeka).toBeUndefined();
    expect(widok(g).rozdzial!.biezacy?.key).toBe('uchwala');
    const wybor = p.options.find((o) => o.s === 'ok')!;
    // sam wybór nie wystarcza: liczy się podpis
    expect(cel(g, 'uchwala').done).toBe(false);
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), wybor.id));
    expect(Object.keys(g.gov.laws.signed)).toEqual([wybor.id]);
    expect(cel(g, 'uchwala').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.uchwala']);
  });

  it('zebranie bez podpisu nie zalicza celu, a po zebraniu cel znów czeka', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    graj(g, (x) => godzina(x) >= 21, {}, 2000);
    expect(g.gov.lawPending).toBe(false);
    expect(Object.keys(g.gov.laws.signed)).toEqual([]);
    expect(cel(g, 'uchwala')).toMatchObject({ done: false, czeka: 'czeka do zebrania' });
  });
});

describe.each(KOMBINACJE_ZWYKLE)('R4 uchwala: podpis sprzed otwarcia rozdziału (%s %s)', (key, mode) => {
  it('podpis z wcześniejszego zebrania się nie liczy, dopiero następny po odnowieniu', () => {
    const g = poPierwszymRaporcie(key, mode);
    const p1 = graj(g, () => false, { stoj: ['uchwala'] }, 2000) as Extract<Prompt, { k: 'uchwala' }>;
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), p1.options.find((o) => o.s === 'ok')!.id));
    expect(Object.keys(g.gov.laws.signed)).toHaveLength(1);
    // rozdział otwiera się po tym podpisie
    otworz(g, 'r4');
    expect(g.sciezka.start.uchwaly).toBe(1);
    expect(cel(g, 'uchwala').done).toBe(false);
    expect(cel(g, 'uchwala').czeka).toBe('czeka do zebrania');
    // odnowienie trwa 36 godzin: następne zebranie jest dwie doby później
    expect(LAW_CD).toBe(36 * 60);
    const p2 = graj(g, () => false, { stoj: ['uchwala'] }, 4 * 960) as Extract<Prompt, { k: 'uchwala' }>;
    expect(p2.k).toBe('uchwala');
    expect(g.gov.lawPending).toBe(true);
    expect(cel(g, 'uchwala').done).toBe(false);
    expect(cel(g, 'uchwala').czeka).toBeUndefined();
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), p2.options.find((o) => o.s === 'ok')!.id));
    expect(Object.keys(g.gov.laws.signed)).toHaveLength(2);
    expect(cel(g, 'uchwala').done).toBe(true);
  });

  it('liczba podpisanych uchwał po obu stronach to to samo wyrażenie: cofnięta uchwała (false) nie liczy się nigdzie', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.gov.laws.signed = { u_a: true, u_cofnieta: false };
    otworz(g, 'r4');
    expect(g.sciezka.start.uchwaly).toBe(1);
    g.gov.lawPending = true;
    g.gov.laws.signed.u_b = false;
    expect(cel(g, 'uchwala').done, 'wpis z false nie jest podpisem').toBe(false);
    g.gov.laws.signed.u_b = true;
    expect(cel(g, 'uchwala').done).toBe(true);
  });
});

/** Podpisuje po kolei wszystkie uchwały, które da się podpisać (bez odnowienia między nimi): zostają same podpisane i zablokowane
    drogą. Zwraca ich numery. */
function podpiszWszystkie(g: Gra): string[] {
  const podpisane: string[] = [];
  for (let k = 0; k < 10; k++) {
    const i = wejscie(g);
    const ok = lawOptions(g.gov, i).find((o) => o.s === 'ok');
    if (!ok) break;
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, i, ok.id));
    g.gov.laws.last = -1_000_000_000;
    podpisane.push(ok.id);
  }
  return podpisane;
}

describe.each(KOMBINACJE)('R4 uchwala, gdy nie ma już czego podpisać: %s %s', (key, mode) => {
  it('podpisane wszystkie uchwały drogi (cztery z sześciu): cel nie istnieje i nie blokuje rozdziału', () => {
    const g = poPierwszymRaporcie(key, mode);
    const podpisane = podpiszWszystkie(g);
    expect(podpisane).toHaveLength(4);
    expect(lawOptions(g.gov, wejscie(g)).filter((o) => o.s === 'ok' || o.s === 'cd')).toEqual([]);
    otworz(g, 'r4');
    expect(klucze(g)).toEqual(['wkurzenie', 'nowi', 'ludzie']);
    expect(widok(g).rozdzial!.cele).toHaveLength(3);
    // pozostałe trzy cele zamykają rozdział, mimo że uchwały nie ma
    g.gov.reports.push(raport(1, 2));
    zdarz(g, 'budynek');
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(makePerson(mulberry(31), new Set(), () => 131))),
    );
    expect(krok(g).rozdzial).toBe('r5');
    expect(zrobione(g, 'r4')).toEqual(['r4.ludzie', 'r4.nowi', 'r4.wkurzenie']);
  });

  it('dopóki któraś uchwała jest do podpisania teraz albo po odnowieniu, cel istnieje i czeka na zebranie', () => {
    const g = poPierwszymRaporcie(key, mode);
    // jedna uchwała podpisana przed otwarciem rozdziału: reszta czeka na odnowienie (36 godzin), więc cel jest
    const i = wejscie(g);
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, i, lawOptions(g.gov, i).find((o) => o.s === 'ok')!.id));
    expect(lawOptions(g.gov, wejscie(g)).some((o) => o.s === 'cd')).toBe(true);
    otworz(g, 'r4');
    expect(klucze(g)).toEqual(['uchwala', 'wkurzenie', 'nowi', 'ludzie']);
    expect(cel(g, 'uchwala')).toMatchObject({ done: false, czeka: 'czeka do zebrania' });
  });

  it('ostatnia uchwała, którą da się podpisać, zalicza cel zamiast go ukryć', () => {
    const g = poPierwszymRaporcie(key, mode);
    // trzy uchwały podpisane przed otwarciem rozdziału, czwarta zostaje
    const wszystkie = klon(g);
    const cztery = podpiszWszystkie(wszystkie);
    for (const id of cztery.slice(0, 3)) g.gov.laws.signed[id] = true;
    g.gov.laws.path = wszystkie.gov.laws.path;
    expect(lawOptions(g.gov, wejscie(g)).some((o) => o.s === 'ok')).toBe(true);
    otworz(g, 'r4');
    expect(g.sciezka.start.uchwaly).toBe(3);
    expect(klucze(g)).toContain('uchwala');
    // czwarta podpisana: nie ma już co podpisać, ale cel jest zaliczony tym podpisem, a nie zniknął
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), cztery[3]));
    expect(lawOptions(g.gov, wejscie(g)).filter((o) => o.s === 'ok' || o.s === 'cd')).toEqual([]);
    expect(klucze(g)).toContain('uchwala');
    expect(cel(g, 'uchwala').done).toBe(true);
  });

  it('zaliczona uchwała zostaje na liście, choć potem podpisano wszystkie i nie ma już czego podpisać', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    expect(klucze(g)).toContain('uchwala');
    const podpisane = podpiszWszystkie(g);
    expect(podpisane).toHaveLength(4);
    expect(lawOptions(g.gov, wejscie(g)).filter((o) => o.s === 'ok' || o.s === 'cd')).toEqual([]);
    // podpisy po otwarciu zaliczyły cel i został na liście z ptaszkiem
    expect(klucze(g)).toEqual(['uchwala', 'wkurzenie', 'nowi', 'ludzie']);
    expect(cel(g, 'uchwala').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.uchwala']);
  });
});

describe.each(KOMBINACJE)('R4 wkurzenie: %s %s', (key, mode) => {
  it('to obserwacja: czeka do rana, a raport rano po otwarciu rozdziału zalicza cel, jakkolwiek zmieniło się wkurzenie', () => {
    for (const dAnger of [2.1, 0, -0.1]) {
      const g = poPierwszymRaporcie(key, mode);
      // pierwszy raport w grze był przed otwarciem rozdziału i się nie liczy
      expect(g.gov.reports).toHaveLength(1);
      otworz(g, 'r4');
      expect(g.sciezka.start.raporty).toBe(1);
      expect(cel(g, 'wkurzenie')).toMatchObject({ done: false, czeka: CZEKA_RANO });
      ustawJezyk('en');
      expect(cel(g, 'wkurzenie').czeka).toBe(CZEKA_RANO_EN);
      ustawJezyk('pl');
      g.gov.reports.push(raport(dAnger));
      expect(cel(g, 'wkurzenie').done, `dAnger ${dAnger}`).toBe(true);
      expect(cel(g, 'wkurzenie').czeka).toBeUndefined();
      // lekcja jest ogólna, nie zależy od tego, w którą stronę poszło wkurzenie
      expect(cel(g, 'wkurzenie').uwaga, `dAnger ${dAnger}`).toBe(LEKCJA_WKURZENIE);
      expect(g.sciezka.zrobione).toHaveProperty(['r4.wkurzenie']);
      // zaliczenie jest trwałe, także gdy raportów nie ma już na liście
      g.gov.reports = [];
      expect(cel(g, 'wkurzenie').done).toBe(true);
    }
  });

  it('czekający cel mówi tylko, na co czeka; lekcję o wkurzeniu niesie dopisek zaliczonego (ten sam w obu trybach), oba w HTML okienka', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    const html = (touch: boolean): string => celeHtml(widok(g, { touch }), { otwarte: true, touch });
    for (const touch of [false, true]) {
      expect(cel(g, 'wkurzenie', { touch }).czeka).toBe(CZEKA_RANO);
      expect(cel(g, 'wkurzenie', { touch }).uwaga, 'przed raportem nie ma lekcji').toBeUndefined();
      expect(html(touch)).toContain(`<small class="goal-czeka">${CZEKA_RANO}</small>`);
      expect(html(touch)).not.toContain(LEKCJA_WKURZENIE);
    }
    ustawJezyk('en');
    for (const touch of [false, true]) {
      expect(cel(g, 'wkurzenie', { touch }).czeka).toBe(CZEKA_RANO_EN);
      expect(html(touch)).toContain(`<small class="goal-czeka">${CZEKA_RANO_EN}</small>`);
      expect(html(touch)).not.toContain(LEKCJA_WKURZENIE_EN);
    }
    ustawJezyk('pl');
    // po porannym raporcie cel jest zaliczony, nie czeka i niesie lekcję (pod przekreślonym celem, w osobnym elemencie)
    g.gov.reports.push(raport(1));
    for (const touch of [false, true]) {
      expect(cel(g, 'wkurzenie', { touch })).toMatchObject({ done: true, uwaga: LEKCJA_WKURZENIE });
      expect(cel(g, 'wkurzenie', { touch }).czeka).toBeUndefined();
      expect(html(touch)).toContain(`<small class="goal-uwaga">${LEKCJA_WKURZENIE}</small>`);
      expect(html(touch)).not.toContain(CZEKA_RANO);
    }
    ustawJezyk('en');
    for (const touch of [false, true]) {
      expect(cel(g, 'wkurzenie', { touch }).uwaga).toBe(LEKCJA_WKURZENIE_EN);
      expect(html(touch)).toContain(`<small class="goal-uwaga">${LEKCJA_WKURZENIE_EN}</small>`);
      expect(polskieSlowa(LEKCJA_WKURZENIE_EN)).toEqual([]);
    }
    ustawJezyk('pl');
    // lekcja nie wchodzi do zwiniętego okienka, które pokazuje tylko bieżący cel
    expect(celeHtml(widok(g), { otwarte: false, touch: false })).not.toContain(LEKCJA_WKURZENIE);
  });

  it('raport sprzed otwarcia rozdziału niczego nie zalicza, nawet gdy wkurzenie wtedy spadło', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.gov.reports.push(raport(-3, 1));
    otworz(g, 'r4');
    expect(cel(g, 'wkurzenie')).toMatchObject({ done: false, czeka: CZEKA_RANO });
  });

  it('prawdziwy raport rano: przed nim cel czeka i nie jest zaliczony, po nim (okno raportu otwarte) jest zaliczony', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    graj(g, (x) => doba(x) === 3 && godzina(x) >= 5, {}, 3000);
    expect(g.gov.reports).toHaveLength(1);
    expect(cel(g, 'wkurzenie')).toMatchObject({ done: false, czeka: CZEKA_RANO });
    expect(cel(g, 'wkurzenie').uwaga).toBeUndefined();
    expect(g.sciezka.zrobione).not.toHaveProperty(['r4.wkurzenie']);
    const p = graj(g, () => false, { stoj: ['raport'] }, 600);
    expect(p?.k).toBe('raport');
    expect(g.gov.reports).toHaveLength(2);
    expect(g.gov.reports[1].day).toBe(2);
    // zaliczony przy samym raporcie, niezależnie od znaku zmiany wkurzenia, i od razu z lekcją pod spodem
    expect(cel(g, 'wkurzenie').done).toBe(true);
    expect(cel(g, 'wkurzenie').uwaga).toBe(LEKCJA_WKURZENIE);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.wkurzenie']);
  });
});

describe.each(KOMBINACJE_ZWYKLE)('R4 wkurzenie po dziesięciu raportach: %s %s', (key, mode) => {
  it('od 11. nocy lista raportów ma dziesięć wpisów, a cel i tak widzi nowy raport (liczy po dniu nocy, nie po numerze)', () => {
    const g = poPierwszymRaporcie(key, mode);
    graj(g, (x) => doba(x) >= 12 && godzina(x) >= 7 && !x.gov.report, {}, 20000);
    // raport za noc 1 już wypadł z listy, zostały noce 2–11
    expect(g.gov.reports.map((r) => r.day)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    otworz(g, 'r4');
    // liczba raportów przy otwarciu to już sufit listy, więc z niej nie da się policzyć nowych
    expect(g.sciezka.start.raporty).toBe(10);
    expect(cel(g, 'wkurzenie')).toMatchObject({ done: false, czeka: CZEKA_RANO });
    // następny raport rano: lista dalej ma dziesięć wpisów (najstarszy wypada), a cel widzi nowy
    const p = graj(g, () => false, { stoj: ['raport'] }, 2000);
    expect(p?.k).toBe('raport');
    expect(g.gov.reports).toHaveLength(10);
    expect(g.gov.reports.at(-1)!.day).toBe(12);
    expect(cel(g, 'wkurzenie').czeka).toBeUndefined();
    expect(g.sciezka.zrobione).toHaveProperty(['r4.wkurzenie']);
  });
});

describe('R4 wkurzenie: raport po otwarciu rozdziału jest rozpoznawany po dniu nocy', () => {
  it('raport z minuty otwarcia jest już obejrzany, raport z następnego rana się liczy, starsze z pełnej listy nie', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(g, 'r4');
    // otwarcie w tej samej minucie co poranny raport (poPierwszymRaporcie kończy się w minucie raportu): raport za noc 1
    // nie liczy się, choć ma tę samą minutę; raport za noc 2 powstaje dobę później
    expect(minutesAt(g.sciezka.od)).toBe(atHour(g.gov.reports[0].day + 1, MORNING));
    expect(cel(g, 'wkurzenie').czeka).toBe(CZEKA_RANO);
    g.gov.reports.push(raport(-1, 2));
    expect(cel(g, 'wkurzenie').czeka).toBeUndefined();
    // pełna lista (dziesięć wpisów, jak po 11. nocy): stare raporty nie udają nowych, a nowy z późniejszym dniem nocy
    // liczy się, choć lista się nie wydłuża (najstarszy wypada)
    const h = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(h, 'r4');
    h.gov.reports = Array.from({ length: 10 }, () => raport(1, 1));
    expect(cel(h, 'wkurzenie').czeka).toBe(CZEKA_RANO);
    h.gov.reports.shift();
    h.gov.reports.push(raport(1, 2));
    expect(h.gov.reports).toHaveLength(10);
    expect(cel(h, 'wkurzenie').czeka).toBeUndefined();
  });
});

describe.each(KOMBINACJE)('R4 nowi: %s %s', (key, mode) => {
  const nowaOsoba = (n: number) => makePerson(mulberry(n), new Set(), () => 100 + n);

  it('przyjęta osoba do zarządu (fx.join), w bloku też mieszkaniec (fx.residents), zalicza cel; liczba w liczniku to ludność z wejścia zarządu', () => {
    const g = poPierwszymRaporcie(key, mode);
    otworz(g, 'r4');
    const { st, w } = g.sim;
    expect(cel(g, 'nowi').done).toBe(false);
    const przed = populacja(st).razem;
    expect(g.sciezka.start.ludnosc).toBe(przed);
    // liczba w warunku to ta sama, którą liczy zarząd (`ludnoscOf` z wejścia)
    expect(ludnoscOf(wejscie(g))).toBe(przed);
    applyGov(
      st,
      w,
      skutki((e) => e.join.push(nowaOsoba(9))),
    );
    expect(populacja(st).razem).toBe(przed + 1);
    expect(ludnoscOf(wejscie(g))).toBe(przed + 1);
    expect(cel(g, 'nowi').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r4.nowi']);
    // odejście później nie cofa zaliczenia
    applyGov(
      st,
      w,
      skutki((e) => e.leave.push(idOsoby(g, rdzen(g.sim)[3]))),
    );
    expect(populacja(st).razem).toBeLessThan(przed + 1);
    expect(cel(g, 'nowi').done).toBe(true);

    // mieszkańcy przychodzą zza bramy tylko tam, gdzie jest dla nich miejsce w siedzibie (dom jednorodzinny ich nie przyjmie)
    if (wDomu(key)) return;
    const h = poPierwszymRaporcie(key, mode);
    otworz(h, 'r4');
    applyGov(
      h.sim.st,
      h.sim.w,
      skutki((e) => (e.residents = 1)),
    );
    expect(populacja(h.sim.st).razem).toBe(g.sciezka.start.ludnosc + 1);
    expect(cel(h, 'nowi').done).toBe(true);
  });

  it('przybysz sprzed otwarcia rozdziału się nie liczy', () => {
    const g = poPierwszymRaporcie(key, mode);
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => e.join.push(nowaOsoba(6))),
    );
    otworz(g, 'r4');
    expect(cel(g, 'nowi').done).toBe(false);
    expect(g.sciezka.start.ludnosc).toBe(populacja(g.sim.st).razem);
  });
});

describe('R4 nowi: zaproszeni sąsiedzi', () => {
  it('lokatorzy z sąsiedniego domu, którzy przyjmą zaproszenie, zwiększają ludność i zaliczają cel', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { sim } = knockHouse(seed);
      const g = graZSymulacji('zielonki', 'zwykly', seed, sim);
      otworz(g, 'r4');
      const sp = sim.st.sasiedzi!.spotkanie!;
      sim.st.sasiedzi!.budynki[sp.b].domy[sp.dom].rel = 100;
      expect(cel(g, 'nowi').done).toBe(false);
      meet(sim, 'zaproszenie');
      if (sim.st.sasiedzi!.napis?.co !== 'zaproszenie_tak') continue;
      expect(populacja(sim.st).razem).toBeGreaterThan(g.sciezka.start.ludnosc);
      expect(cel(g, 'nowi').done).toBe(true);
      return;
    }
    throw new Error('żadne ziarno nie dało zgody przy relacji 100');
  });
});

describe('R4 ludzie: karta mieszkańca w bloku z mieszkańcami, karta budynku w domu i w siedzibie bez mieszkańców', () => {
  it.each(DEMA)(
    '%s bez mieszkańców z generatora: wariant „sąsiedzi zza płotu”, cel po karcie budynku albo mieszkańca',
    (key) => {
      const g = poPierwszymRaporcie(key, 'zwykly');
      zdarz(g, 'budynek');
      for (let k = 0; k < 50; k++) g.sim.step();
      otworz(g, 'r4');
      expect(odczyt(g).snap.lokatorzy).toHaveLength(0);
      expect(cel(g, 'ludzie').text).toBe('Poznajcie sąsiadów zza płotu.');
      expect(cel(g, 'ludzie').done, 'karta budynku sprzed otwarcia').toBe(false);
      zdarz(g, 'lista');
      zdarz(g, 'drogi');
      expect(cel(g, 'ludzie').done, 'inne zdarzenia interfejsu').toBe(false);
      for (let k = 0; k < 10; k++) g.sim.step();
      zdarz(g, 'budynek');
      expect(cel(g, 'ludzie').done).toBe(true);
      expect(g.sciezka.zrobione).toHaveProperty(['r4.ludzie']);

      // karta mieszkańca też zalicza cel, także w wariancie bez mieszkańców (zdarzenie zależy od tego, co gracz kliknął)
      const h = poPierwszymRaporcie(key, 'zwykly');
      otworz(h, 'r4');
      zdarz(h, 'mieszkaniec');
      expect(cel(h, 'ludzie').done).toBe(true);
    },
  );

  it.each(['przymorze', 'lanciego'] as const)(
    '%s z mieszkańcami z generatora: wariant „mieszkańcy siedziby”, cel po karcie mieszkańca albo budynku',
    async (key) => {
      const demo = JSON.parse(
        fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'),
      );
      const { world, mieszkancy } = await swiatMieszkancow(demo, 5, 4);
      const sim = new Sim(world, createSim(world, 5, { core: 4, mieszkancy }));
      const g = graZSymulacji(key, 'zwykly', 5, sim);
      expect(odczyt(g).snap.lokatorzy.length).toBeGreaterThan(0);
      zdarz(g, 'mieszkaniec');
      for (let k = 0; k < 50; k++) sim.step();
      otworz(g, 'r4');
      expect(cel(g, 'ludzie').text).toBe('Poznajcie mieszkańców siedziby.');
      expect(cel(g, 'ludzie').done, 'karta mieszkańca sprzed otwarcia').toBe(false);
      for (let k = 0; k < 10; k++) sim.step();
      zdarz(g, 'mieszkaniec');
      expect(cel(g, 'ludzie').done).toBe(true);
      ustawJezyk('en');
      expect(cel(g, 'ludzie').text).toBe('Meet the residents of your block.');

      const h = graZSymulacji(key, 'zwykly', 5, new Sim(world, createSim(world, 5, { core: 4, mieszkancy })));
      otworz(h, 'r4');
      zdarz(h, 'budynek');
      expect(cel(h, 'ludzie').done).toBe(true);
    },
  );

  it('lokatorzy sąsiednich budynków (pionki sasiad podczas spotkania) nie zmieniają wariantu w domu bez mieszkańców', () => {
    const { sim } = knockHouse(1);
    const g = graZSymulacji('zielonki', 'zwykly', 1, sim);
    // spotkanie w drzwiach: pionki lokatorów sąsiada są na mapie i w `snap.lokatorzy`
    expect(odczyt(g).snap.lokatorzy.length).toBeGreaterThan(0);
    otworz(g, 'r4');
    expect(cel(g, 'ludzie').text).toBe('Poznajcie sąsiadów zza płotu.');
    expect(cel(g, 'ludzie').how).not.toMatch(FORBIDDEN_DOM);
  });
});

describe('R4: okno uchwały i bieżący cel', () => {
  it('w czasie zebrania bieżącym celem jest uchwała, a po podpisie zostaje wkurzenie i nowi', () => {
    const g = poPierwszymRaporcie('zielonki', 'zwykly');
    otworz(g, 'r4');
    expect(celWOknie(widok(g), 'uchwala'), 'przed zebraniem okno uchwały nie ma celu').toBeNull();
    const p = graj(g, () => false, { stoj: ['uchwala'] }, 2000) as Extract<Prompt, { k: 'uchwala' }>;
    expect(widok(g).rozdzial!.biezacy?.key).toBe('uchwala');
    expect(widok(g).rozdzial!.cele.find((c) => c.key === 'uchwala')?.okno).toBe('uchwala');
    expect(celWOknie(widok(g), 'uchwala')).toBe('Podpiszcie kolejną uchwałę.');
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), p.options.find((o) => o.s === 'ok')!.id));
    expect(widok(g).rozdzial!.biezacy?.key).toBe('nowi');
  });
});

/* ---------------------------------------------------------------- R5. Jedzenie */

const demoGeo = (key: Demo) =>
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8')).geo;

/** Gra z mapą miasta o 9:00 drugiego dnia i miejsce poza mapą osiedla (najbliższy sklep spożywczy), do którego idzie wyprawa. */
function zMapaMiasta(key: Demo, mode: GameMode) {
  const g = poPierwszymRaporcie(key, mode);
  wlaczMiasto(g.gov);
  graj(g, (x) => godzina(x) >= 9, {}, 700);
  const okolica = okolicaZGeo(demoGeo(key));
  const miejsce = okolica.filter((m) => m.kat === 'spozywczy' && m.odl > 192).sort((a, b) => a.odl - b.odl)[0];
  return { g, okolica, cel: celZMiejsca(miejsce) };
}

/** wyprawa dzienna dwóch osób z zarządu do tego miejsca, jak z okna planu wyprawy; osoby wychodzą z mapy */
function wyslij(g: Gra, okolica: ReturnType<typeof okolicaZGeo>, c: ReturnType<typeof celZMiejsca>): void {
  const i = { ...wejscie(g), okolica };
  const ids = i.people
    .filter((p) => !powodOdmowy(g.gov, i, c, [p.id]))
    .map((p) => p.id)
    .slice(0, 2);
  expect(ids).toHaveLength(2);
  const wynik = wyslijWyprawe(g.gov, i, c, ids);
  expect(wynik.ok).toBe(true);
  if (wynik.ok) applyGov(g.sim.st, g.sim.w, wynik.fx);
}

/** Gra z mapą miasta i okolicą w wejściu zarządu, w której jedna osoba idzie nocą na „Wyprawę blisko” do miejsca z mapy;
    gra stoi po nocy, po raporcie rano (R5 otwarty przed kartą nocy). */
function wyprawaNocna(key: Demo, mode: GameMode): Gra {
  const g = poPierwszymRaporcie(key, mode);
  wlaczMiasto(g.gov);
  // z okolicą w wejściu zarządu karta nocy proponuje wyprawy do miejsc z mapy (bez niej do celów z TARGETS)
  g.okolica = okolicaZGeo(demoGeo(key));
  otworz(g, 'r5');
  const card = doKarty(g);
  const kto = card.people.find((p) => p.options.some((o) => o.key === 'wyprawa:blisko' && o.ok))!;
  expect(setNight(g.gov, kto.id, 'wyprawa:blisko')).toBe(true);
  odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
  expect(g.gov.night!.exp).toHaveLength(1);
  expect(g.gov.night!.exp[0].cel?.zapas, 'miejsce z mapy, nie cel z TARGETS').not.toBeNull();
  expect(cel(g, 'wyprawa').done, 'wyprawa nocna to nie wyprawa dzienna').toBe(false);
  graj(g, (x) => x.gov.reports.length >= 3 && !x.gov.report, {}, 3000);
  return g;
}

describe.each(KOMBINACJE)('R5 wyprawa i łup: %s %s', (key, mode) => {
  it('wyprawa dzienna w drodze zalicza `wyprawa`, powrót z łupem zalicza `lup`; tylko to, co po otwarciu rozdziału', () => {
    const { g, okolica, cel: c } = zMapaMiasta(key, mode);
    expect(c.odl).toBeGreaterThan(192);
    expect(godzina(g)).toBe(9);
    otworz(g, 'r5');
    expect(g.sciezka.start.lup).toBe(0);
    expect(cel(g, 'wyprawa').done).toBe(false);
    expect(cel(g, 'lup').done).toBe(false);
    wyslij(g, okolica, c);
    expect(g.gov.wyprawy).toHaveLength(1);
    expect(cel(g, 'wyprawa').done).toBe(true);
    expect(cel(g, 'lup').done, 'w drodze').toBe(false);
    // wyprawa wraca sama (około 2 godzin po wyjściu) i przynosi łup z miejsca z mapy
    graj(g, (x) => !x.gov.wyprawy?.length, {}, 700);
    expect(Object.values(g.gov.miasto!.zabrano).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(cel(g, 'lup').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r5.wyprawa']);
    expect(g.sciezka.zrobione).toHaveProperty(['r5.lup']);
  });

  it('wyprawa, która wróciła przed otwarciem rozdziału, nie zalicza ani wyprawy, ani łupu', () => {
    const { g, okolica, cel: c } = zMapaMiasta(key, mode);
    wyslij(g, okolica, c);
    // bez kroków ścieżki: wyprawa wraca, zanim ktokolwiek obejrzy okienko
    graj(g, (x) => !x.gov.wyprawy?.length, { bezKroku: true }, 700);
    expect(Object.values(g.gov.miasto!.zabrano).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    otworz(g, 'r5');
    expect(cel(g, 'wyprawa').done).toBe(false);
    expect(cel(g, 'lup').done).toBe(false);
    expect(g.sciezka.start.lup).toBe(Object.values(g.gov.miasto!.zabrano).reduce((a, b) => a + b, 0));
  });

  it('wyprawa w drodze w chwili otwarcia rozdziału zalicza `wyprawa` od razu, a `lup` dopiero po powrocie', () => {
    const { g, okolica, cel: c } = zMapaMiasta(key, mode);
    wyslij(g, okolica, c);
    otworz(g, 'r5');
    expect(g.sciezka.zrobione).toHaveProperty(['r5.wyprawa']);
    expect(cel(g, 'lup').done).toBe(false);
    graj(g, (x) => !x.gov.wyprawy?.length, {}, 700);
    expect(cel(g, 'lup').done).toBe(true);
  });

  it('łup z wyprawy nocnej do miejsca z mapy też się liczy: liczy się suma `gov.miasto.zabrano` ze wszystkich miejsc', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczMiasto(g.gov);
    g.gov.miasto!.zabrano['poi:1:2'] = 4;
    otworz(g, 'r5');
    expect(g.sciezka.start.lup).toBe(4);
    expect(cel(g, 'lup').done).toBe(false);
    // łup z tego samego miejsca
    g.gov.miasto!.zabrano['poi:1:2'] = 5;
    expect(cel(g, 'lup').done).toBe(true);
    // łup z drugiego miejsca, choć żadne z miejsc nie przekroczyło osobno liczby z otwarcia (suma 4 + 3 > 4)
    const h = poPierwszymRaporcie(key, mode);
    wlaczMiasto(h.gov);
    h.gov.miasto!.zabrano['poi:1:2'] = 4;
    otworz(h, 'r5');
    h.gov.miasto!.zabrano['poi:9:9'] = 3;
    expect(cel(h, 'lup').done).toBe(true);
    // bez zmian w łupie nic się nie zalicza, a łup sprzed otwarcia z wielu miejsc nie liczy się wcale
    const k = poPierwszymRaporcie(key, mode);
    wlaczMiasto(k.gov);
    Object.assign(k.gov.miasto!.zabrano, { 'poi:1:2': 4, 'poi:9:9': 3 });
    otworz(k, 'r5');
    expect(k.sciezka.start.lup).toBe(7);
    expect(cel(k, 'lup').done).toBe(false);
  });

  it('wyprawa nocna z karty nocy nie zalicza `wyprawa`, a łup z niej liczy się do `lup`', () => {
    const g = wyprawaNocna(key, mode);
    expect(g.sciezka.zrobione).not.toHaveProperty(['r5.wyprawa']);
    const lup = Object.values(g.gov.miasto!.zabrano).reduce((a, b) => a + b, 0);
    // łup z nocnej wyprawy (jeśli coś przyniosła) to łup z miejsca z mapy
    expect(Object.hasOwn(g.sciezka.zrobione, 'r5.lup')).toBe(lup > g.sciezka.start.lup);
  });

  it('podpowiedź wyprawy w trybie zombie ma dopisek o szwendaczach, w zwykłym go nie ma', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczMiasto(g.gov);
    otworz(g, 'r5');
    const dopisek = 'Za siatką są szwendacze: ryzyko jest większe, a kłopoty bywają ugryzieniem.';
    expect(cel(g, 'wyprawa').how.endsWith(dopisek)).toBe(mode === 'zombie');
    expect(cel(g, 'wyprawa').how.includes('szwendacz')).toBe(mode === 'zombie');
    ustawJezyk('en');
    const en = 'There are shamblers out there: the risk is higher, and trouble can mean a bite.';
    expect(cel(g, 'wyprawa').how.endsWith(en)).toBe(mode === 'zombie');
  });
});

describe.each([
  ['lanciego', 'zwykly'],
  ['zielonki', 'zombie'],
] as const)('R5 łup z wyprawy nocnej: %s %s', (key, mode) => {
  it('wyprawa nocna do miejsca z mapy przynosi łup i zalicza `lup`, a `wyprawa` zostaje niezaliczona', () => {
    const g = wyprawaNocna(key, mode);
    const lup = Object.values(g.gov.miasto!.zabrano).reduce((a, b) => a + b, 0);
    expect(lup).toBeGreaterThan(g.sciezka.start.lup);
    expect(g.sciezka.zrobione).toHaveProperty(['r5.lup']);
    expect(g.sciezka.zrobione).not.toHaveProperty(['r5.wyprawa']);
  });
});

describe('R5 a okno mapy miasta w grze (flaga w odczycie)', () => {
  it('bez okna mapy (?miasto=0, osiedle zapasowe bez położenia) nie ma wyprawy ani łupu, choć `gov.miasto` istnieje', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczMiasto(g.gov);
    const bez = { mapaMiasta: false };
    otworz(g, 'r5', bez);
    expect(cele(g, bez).map((c) => c.key)).toEqual(['ogrodek']);
    // z oknem mapy trzy cele, a bez flagi (testy) decyduje `gov.miasto`
    expect(cele(g, { mapaMiasta: true }).map((c) => c.key)).toEqual(['wyprawa', 'lup', 'ogrodek']);
    expect(cele(g).map((c) => c.key)).toEqual(['wyprawa', 'lup', 'ogrodek']);
    // flaga wygrywa z `gov.miasto` także w drugą stronę: okno mapy bez stanu miasta w zarządzie to wciąż trzy cele
    const h = poPierwszymRaporcie('przymorze', 'zwykly');
    expect(h.gov.miasto).toBeUndefined();
    otworz(h, 'r5', { mapaMiasta: true });
    expect(cele(h, { mapaMiasta: true }).map((c) => c.key)).toEqual(['wyprawa', 'lup', 'ogrodek']);
  });

  it('R5 bez okna mapy kończy się samym ogródkiem: wyprawa i łup nie blokują rozdziału', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczMiasto(g.gov);
    const bez = { mapaMiasta: false };
    otworz(g, 'r5', bez);
    expect(g.sciezka.rozdzial).toBe('r5');
    const { st, w } = g.sim;
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    st.things.push({
      id: st.nextThing++,
      kind: 'ogrodek',
      x: a % w.size,
      y: Math.floor(a / w.size),
      w: 3,
      h: 2,
      rot: 0,
      n: 1,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    // R5 jest skończony samym ogródkiem i otwiera R6 (przed zadaniem 8 planu był tu „koniec”)
    expect(krok(g, bez).rozdzial).toBe('r6');
    expect(zrobione(g, 'r5')).toEqual(['r5.ogrodek']);
  });
});

describe.each(KOMBINACJE)('R5 ogrodek: %s %s', (key, mode) => {
  it('fałsz bez ogródka, plan nie wystarcza, gotowy ogródek zalicza', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczMiasto(g.gov);
    otworz(g, 'r5');
    const { st, w } = g.sim;
    expect(cel(g, 'ogrodek').done).toBe(false);
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    g.sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
    g.sim.step();
    expect(st.builds.some((b) => b.kind === 'ogrodek')).toBe(true);
    expect(cel(g, 'ogrodek').done, 'sam plan').toBe(false);
    // gotowy ogródek (deski dla całego kosztu leżą na podwórku, zarząd sam buduje)
    const sterta = st.things.find((t) => t.kind === 'deski');
    if (sterta) sterta.n += 30;
    graj(g, (x) => x.sim.st.things.some((t) => t.kind === 'ogrodek'), {}, 2500);
    expect(cel(g, 'ogrodek').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r5.ogrodek']);
  });

  it('ogródek postawiony przed otwarciem rozdziału zalicza cel od razu', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczMiasto(g.gov);
    const { st, w } = g.sim;
    const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
    st.things.push({
      id: st.nextThing++,
      kind: 'ogrodek',
      x: a % w.size,
      y: Math.floor(a / w.size),
      w: 3,
      h: 2,
      rot: 0,
      n: 1,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    otworz(g, 'r5');
    expect(g.sciezka.zrobione).toHaveProperty(['r5.ogrodek']);
  });
});

/* ---------------------------------------------------------------- przejścia między rozdziałami */

describe('przejścia: R2 → R3 → R4 → R5 → R6', () => {
  it('zwykły tryb: trzy cele R2 otwierają R3, trzy ustawienia pracy R4 z licznikami z tej chwili, R4 otwiera R5, R5 otwiera R6', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczMiasto(g.gov);
    otworz(g, 'r2');
    expect(g.sciezka.rozdzial).toBe('r2');
    // sily, uzbrojeni i wieczorne ognisko
    zdarz(g, 'lista');
    const bez = rdzen(g.sim).find((p) => !p.weapon)!;
    g.sim.push({ t: 'arm', ids: [bez.id], weapon: 'noz' });
    g.sim.step();
    graj(g, (x) => godzina(x) >= 17, {}, 900);
    expect(g.sciezka.rozdzial).toBe('r2');
    rozpalOgnisko(g);
    graj(g, (x) => x.sciezka.rozdzial !== 'r2', {}, 300);
    expect(g.sciezka.rozdzial).toBe('r3');
    expect(zrobione(g, 'r2')).toEqual(['r2.sily', 'r2.ognisko', 'r2.uzbrojeni'].sort());
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));
    expect(godzina(g)).toBe(18);

    // R3: priorytet z panelu Pracy, stałe zajęcie z karty osoby i próg zapasu; trzecie ustawienie otwiera R4
    const [a, b] = rdzen(g.sim);
    // Szaber ma domyślnie 3 u każdego, więc 4 to prawdziwa zmiana (ustawienie równe domyślnemu symulacja zdejmuje)
    g.sim.push({ t: 'prio', ids: [], osoba: a.person, rodzaj: 'szaber', prio: 4 });
    g.sim.push({ t: 'stale', ids: [], osoba: b.person, rodzaj: 'drwal' });
    g.sim.step();
    expect(krok(g).rozdzial).toBe('r3');
    g.sim.push({ t: 'prog', ids: [], co: 'drewno', n: 35 });
    g.sim.step();
    expect(krok(g).rozdzial).toBe('r4');
    expect(zrobione(g, 'r3')).toEqual(['r3.priorytet', 'r3.stale', 'r3.zapas']);
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));

    // R4: uchwała na zebraniu 19:30, karta budynku, nowy człowiek i wieczorem raport ze spadkiem wkurzenia
    const p = graj(g, () => false, { stoj: ['uchwala'] }, 600) as Extract<Prompt, { k: 'uchwala' }>;
    applyGov(g.sim.st, g.sim.w, signLaw(g.gov, wejscie(g), p.options.find((o) => o.s === 'ok')!.id));
    zdarz(g, 'budynek');
    applyGov(
      g.sim.st,
      g.sim.w,
      skutki((e) => (e.residents = 1)),
    );
    expect(krok(g).rozdzial).toBe('r4');
    g.gov.reports.push(raport(-1));
    expect(krok(g).rozdzial).toBe('r5');
    expect(zrobione(g, 'r4')).toEqual(['r4.ludzie', 'r4.nowi', 'r4.uchwala', 'r4.wkurzenie']);
    expect(g.sciezka.start.raporty).toBe(g.gov.reports.length);

    // R5: ogródek postawiony, wyprawa w drodze i jej łup
    const { st } = g.sim;
    st.things.push({
      id: st.nextThing++,
      kind: 'ogrodek',
      x: 1,
      y: 1,
      w: 3,
      h: 2,
      rot: 0,
      n: 1,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    g.gov.wyprawy = [{ id: 1, cel: celZMiejsca(okolicaZGeo(demoGeo('przymorze'))[0]), ids: [], wyjscie: 0, powrot: 1 }];
    expect(krok(g).rozdzial).toBe('r5');
    g.gov.wyprawy = [];
    g.gov.miasto!.zabrano['poi:3:4'] = 3;
    // po R5 otwiera się R6 (badania) z licznikami z tej chwili; dalsze przejścia R6 → R7 → R8 → „koniec” w sciezka-r6-r8.test.ts
    expect(krok(g).rozdzial).toBe('r6');
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));
    expect(zrobione(g, 'r5')).toEqual(['r5.lup', 'r5.ogrodek', 'r5.wyprawa']);
  });
});

/* ---------------------------------------------------------------- stary zapis w „koniec” po R1 */

describe('stary zapis: „koniec” z wersji bez R2', () => {
  /** stan z wersji, która znała tylko R0 i R1 (wszystkie ich cele rozstrzygnięte), tuż po R1 */
  function zapisPoR1(g: Gra): StanSciezki {
    const zrobioneStare: Record<string, number> = {};
    const przepadle: string[] = [];
    for (const r of ROZDZIALY.slice(0, 2))
      for (const c of r.cele) {
        // dyżur i drewno na noc przepadają, jeśli nie zrobiono ich w nocy; reszta jest zrobiona
        if (r.k === 'r1' && (c.key === 'drewno2' || c.key === 'dyzur')) przepadle.push(`${r.k}.${c.key}`);
        else zrobioneStare[`${r.k}.${c.key}`] = g.sim.st.tick - 4000;
      }
    return { ...nowyStanSciezki(), rozdzial: 'koniec', od: g.sim.st.tick - 3000, zrobione: zrobioneStare, przepadle };
  }

  it.each(KOMBINACJE)('%s %s: po wczytaniu otwiera R2 od chwili wczytania i rusza dalej', (key, mode) => {
    const g = poPierwszymRaporcie(key, mode);
    g.sciezka = zapisPoR1(g);
    const stare = JSON.parse(JSON.stringify(g.sciezka)) as StanSciezki;
    const h = przezZapis(g);
    // wczytanie niczego nie zmienia, ale pierwszy krok (okienko celów) otwiera R2
    expect(h.sciezka.rozdzial).toBe('koniec');
    expect(krok(h).rozdzial).toBe('r2');
    expect(h.sciezka.od).toBe(h.sim.st.tick);
    expect(h.sciezka.start).toEqual(licznikiStartu(h.sim.st, h.gov));
    expect(widok(h).rozdzial!.tytul).toBe('Ludzie i noc');
    expect(klucze(h)).toEqual(mode === 'zombie' ? ['sily', 'dzgnij', 'dzidy'] : ['sily', 'ognisko', 'uzbrojeni']);
    // wpisy z wersji sprzed R2 zostają, a R2 zaczyna od zera
    for (const k of Object.keys(stare.zrobione)) expect(h.sciezka.zrobione[k]).toBe(stare.zrobione[k]);
    expect(h.sciezka.przepadle).toEqual(stare.przepadle);
    expect(zrobione(h, 'r2')).toEqual([]);
    // dalej jak zwykle: cele R2 zaliczają się od otwarcia
    expect(cel(h, 'sily').done).toBe(false);
    zdarz(h, 'lista');
    expect(cel(h, 'sily').done).toBe(true);
    expect(zrobione(h, 'r2')).toEqual(['r2.sily']);
  });

  it('wczytana gra, w której gracz już ma broń i jedyne ognisko, zalicza od razu to, co stan gry spełnia', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    const bez = rdzen(g.sim).find((p) => !p.weapon)!;
    g.sim.push({ t: 'arm', ids: [bez.id], weapon: 'noz' });
    g.sim.step();
    g.sciezka = zapisPoR1(g);
    const h = przezZapis(g);
    expect(krok(h).rozdzial).toBe('r2');
    // „uzbrojeni” spełnia stan gry, więc zalicza się w kroku otwarcia
    expect(zrobione(h, 'r2')).toEqual(['r2.uzbrojeni']);
    expect(cel(h, 'uzbrojeni').done).toBe(true);
    expect(cel(h, 'sily').done).toBe(false);
  });

  it('zapis ukończonej ścieżki R0–R5 zostaje „końcem”', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczMiasto(g.gov);
    const pelny = zapisPoR1(g);
    for (const r of ROZDZIALY.slice(2)) for (const c of r.cele) pelny.zrobione[`${r.k}.${c.key}`] = g.sim.st.tick - 10;
    g.sciezka = pelny;
    const h = przezZapis(g);
    expect(krok(h)).toEqual(pelny);
    expect(widok(h)).toEqual({ okazja: null, rozdzial: null, drogi: null });
  });
});

/* ---------------------------------------------------------------- zapis i wczytanie w środku rozdziałów */

describe('zapis i wczytanie w środku rozdziałów dają ten sam widok', () => {
  it.each(KOMBINACJE)('%s %s: R2, R4 i R5', (key, mode) => {
    for (const k of ['r2', 'r4', 'r5'] as const) {
      const g = poPierwszymRaporcie(key, mode);
      wlaczMiasto(g.gov);
      otworz(g, k);
      zdarz(g, 'lista');
      graj(g, (x) => godzina(x) >= 8, {}, 300);
      const przed = JSON.stringify(widok(g));
      const h = przezZapis(g);
      expect(JSON.stringify(widok(h))).toBe(przed);
      // i dalej tak samo przez kolejne sekundy (stan zapisanej gry i wczytanej idzie tak samo)
      graj(g, (x) => godzina(x) >= 10, {}, 300);
      graj(h, (x) => godzina(x) >= 10, {}, 300);
      expect(JSON.stringify(widok(h))).toBe(JSON.stringify(widok(g)));
      expect(h.sim.hash()).toBe(g.sim.hash());
    }
  });

  it('ścieżka niczego w grze nie zmienia: ten sam skrót symulacji i ten sam stan zarządu z krokami ścieżki i bez nich', () => {
    for (const mode of TRYBY) {
      const a = poPierwszymRaporcie('lanciego', mode);
      otworz(a, 'r2');
      const b = klon(a);
      graj(a, (x) => godzina(x) >= 21, {}, 1200);
      graj(b, (x) => godzina(x) >= 21, { bezKroku: true }, 1200);
      expect(a.sim.hash()).toBe(b.sim.hash());
      expect(JSON.stringify(a.gov)).toBe(JSON.stringify(b.gov));
    }
  });
});

/* ---------------------------------------------------------------- teksty z projektu */

const slowa = (g: Gra, touch: boolean, k: string) => {
  const c = cel(g, k, { touch });
  return { text: c.text, how: c.how };
};

describe('teksty R2 (zwykły i zombie, blok i dom, mysz i dotyk, po polsku i po angielsku)', () => {
  it('sily i ognisko, uzbrojeni (zwykły): blok i dom', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zwykly', 'r2');
      expect(slowa(g, false, 'sily')).toEqual({
        text: 'Sprawdźcie, kto ma siły na noc.',
        how: 'Kliknijcie portret na liście pod paskiem: karta pokaże siły tej osoby. Klawisze Q i E przełączają ludzi po kolei.',
      });
      expect(slowa(g, true, 'sily').how).toBe('Stuknijcie portret na liście pod paskiem: karta pokaże siły tej osoby.');
      expect(slowa(g, false, 'ognisko')).toEqual({
        text: 'Rozpalcie ognisko na podwórku.',
        how: `Prawy przycisk na wolnym miejscu podwórka: „Rozpalić ognisko tutaj” (2 drewna). Światło przy siatce płoszy szabrowników i pomaga warcie ich zobaczyć, a wieczór przy ogniu łagodzi wkurzenie. Warta ${dom ? 'przy furtce' : 'przy bramie'} też ma lampę. Liczy się ognisko, które płonie wieczorem.`,
      });
      expect(
        slowa(g, true, 'ognisko').how.startsWith(
          'Przytrzymajcie palec na wolnym miejscu podwórka: „Rozpalić ognisko tutaj” (2 drewna). ',
        ),
      ).toBe(true);
      expect(slowa(g, false, 'uzbrojeni')).toEqual({
        text: 'Dajcie broń drugiej osobie.',
        how: 'Na karcie osoby bez broni kliknijcie „Zmień”: weźmie nóż albo łom z magazynu. Uzbrojona warta broni się lepiej i karta nocy to liczy.',
      });
      expect(slowa(g, true, 'uzbrojeni').how.startsWith('Na karcie osoby bez broni stuknijcie „Zmień”: ')).toBe(true);

      ustawJezyk('en');
      expect(slowa(g, false, 'sily')).toEqual({
        text: 'Check who has the energy for tonight.',
        how: 'Click a portrait in the row under the top bar: the card shows that person’s Energy. Keys Q and E step through your people.',
      });
      expect(slowa(g, true, 'sily').how).toBe(
        'Tap a portrait in the row under the top bar: the card shows that person’s Energy.',
      );
      expect(slowa(g, false, 'ognisko')).toEqual({
        text: 'Light a campfire in the yard.',
        how: `Right-click a free spot in the yard: “Light a campfire here” (2 wood). Light by the fence scares looters off and helps the watch see them, and an evening by the fire takes the edge off the anger. A guard at ${dom ? 'the garden gate' : 'the gate'} carries a lamp too. It counts when the fire is burning in the evening.`,
      });
      expect(
        slowa(g, true, 'ognisko').how.startsWith(
          'Press and hold on a free spot in the yard: “Light a campfire here” (2 wood). ',
        ),
      ).toBe(true);
      expect(slowa(g, false, 'uzbrojeni')).toEqual({
        text: 'Arm a second person.',
        how: 'On the card of someone without a weapon, click “Swap”: they take the knife or the crowbar from the storeroom. An armed watch holds out better, and the Night orders count it.',
      });
      expect(slowa(g, true, 'uzbrojeni').how.startsWith('On the card of someone without a weapon, tap “Swap”: ')).toBe(
        true,
      );
      ustawJezyk('pl');
    }
  });

  it('dzgnij i dzidy (zombie)', () => {
    const g = wRozdziale('przymorze', 'zombie', 'r2');
    expect(slowa(g, false, 'dzgnij')).toEqual({
      text: 'Dźgnijcie szwendacza przez siatkę.',
      how: 'Zaznaczcie osobę z dzidą i prawy przycisk na szwendaczu przy siatce: „Atakuj szwendacza”. Dzida sięga przez siatkę; strzał zabija od razu, ale ściąga następnych.',
    });
    expect(
      slowa(g, true, 'dzgnij').how.startsWith(
        'Stuknijcie osobę z dzidą i przytrzymajcie palec na szwendaczu przy siatce: „Atakuj szwendacza”. ',
      ),
    ).toBe(true);
    expect(slowa(g, false, 'dzidy')).toEqual({
      text: 'Postawcie na noc dwie dzidy przy siatce.',
      how: 'Na karcie nocy wybierzcie „Warta przy siatce” dwóm osobom z dzidą. Drugą dzidę da „Zmień” na karcie osoby (zapasowa z magazynu) albo „Zrobić dzidę”.',
    });
    ustawJezyk('en');
    expect(slowa(g, false, 'dzgnij')).toEqual({
      text: 'Spear a shambler through the fence.',
      how: 'Select someone with a spear and right-click a shambler at the fence: “Attack the shambler”. A spear reaches through the fence; a shot kills outright but draws more of them.',
    });
    expect(
      slowa(g, true, 'dzgnij').how.startsWith(
        'Tap someone with a spear and press and hold on a shambler at the fence: “Attack the shambler”. ',
      ),
    ).toBe(true);
    expect(slowa(g, false, 'dzidy')).toEqual({
      text: 'Put two spears on watch at the fence tonight.',
      how: 'On the Night orders, pick “Watch at the fence” for two people with spears. A second spear comes from “Swap” on a person’s card (the spare in the storeroom) or from “Make a spear”.',
    });
  });
});

describe('teksty R4', () => {
  it('uchwala, wkurzenie, nowi: blok i dom', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zwykly', 'r4');
      expect(slowa(g, false, 'uchwala')).toEqual({
        text: 'Podpiszcie kolejną uchwałę.',
        how: `Zebranie ${dom ? 'komitetu' : 'zarządu'} o ${LAW_HOUR}:${LAW_MINUTE}, kiedy minie półtorej doby od poprzedniej uchwały. Drogi porządku i wspólnoty się wykluczają: pierwsza uchwała z jednej zamyka drugą.`,
      });
      expect(slowa(g, false, 'wkurzenie')).toEqual({
        text: 'Sprawdźcie rano w raporcie, jak zmieniło się wkurzenie.',
        how: `Raport rano pokazuje, jak zmieniło się zaufanie i wkurzenie. Wkurzenie spada, gdy ludzie są najedzeni i w cieple, a wieczorem pali się ognisko; rośnie od zimna, głodu, palenia mebli, napadów i zgonów. Przy pełnym wkurzeniu ${dom ? 'zebranie ulicy odwoła komitet' : 'walne odwoła zarząd'}.`,
      });
      expect(slowa(g, false, 'nowi')).toEqual({
        text: 'Przyjmijcie kogoś nowego.',
        how: `Ludzi przyprowadzają karty wydarzeń: „Przyjąć wszystkich”, „Wciągnąć do roboty”. Gość ${dom ? 'pod furtką' : 'pod bramą'} ma kartę z „Pokaż”, a gdy prosi o miejsce, z wyborem „Przyjąć do ${dom ? 'domu' : 'spółdzielni'}”. Przyjęci idą od ${dom ? 'furtki' : 'bramy'}, a komunikat o ich drodze ma ten sam „Pokaż”. Każdy nowy to ręce do pracy i usta do wykarmienia.`,
      });
      ustawJezyk('en');
      expect(slowa(g, false, 'uchwala')).toEqual({
        text: 'Pass another resolution.',
        how: `${dom ? 'The street committee' : 'The board'} meets at 19:30 once a day and a half has passed since the last resolution. The Order and Community paths rule each other out: the first resolution on one closes the other.`,
      });
      expect(slowa(g, false, 'wkurzenie')).toEqual({
        text: 'Check in the Morning report how the anger moved.',
        how: `The Morning report shows how trust and anger moved. Anger drops when people are fed and warm and a campfire burns in the evening; it rises with cold, hunger, burnt furniture, raids and deaths. At full anger ${dom ? 'the street meeting votes the committee out' : 'the general meeting votes the board out'}.`,
      });
      expect(slowa(g, false, 'nowi')).toEqual({
        text: 'Take someone new in.',
        how: `Event cards bring people to you: “Take everyone in”, “Put him/her to work”. A guest at ${dom ? 'the garden gate' : 'the gate'} has a card with “Show” and, if they ask for a place, “Take him/her/them into ${dom ? 'the house' : 'the co-op'}”. Newcomers walk in from ${dom ? 'the garden gate' : 'the gate'}, and the notice about them coming in has the same “Show”. Every newcomer is a pair of hands and another mouth to feed.`,
      });
      ustawJezyk('pl');
    }
  });

  it('nowi w trybie zombie: ocaleni pod bramą i bez „Przyjąć wszystkich”, którego karty zombie nie mają', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zombie', 'r4');
      const pl = slowa(g, false, 'nowi');
      expect(pl).toEqual({
        text: 'Przyjmijcie kogoś nowego.',
        how: `Ludzi przyprowadzają karty wydarzeń. Ocaleni ${dom ? 'pod furtką' : 'pod bramą'} mają kartę z „Pokaż”, a gdy proszą o miejsce, z wyborem „Przyjąć do ${dom ? 'domu' : 'spółdzielni'}”; liczy się też „Wciągnąć do roboty”. Przyjęci idą od ${dom ? 'furtki' : 'bramy'}, a komunikat o ich drodze ma ten sam „Pokaż”. Każdy nowy to ręce do pracy i usta do wykarmienia.`,
      });
      expect(pl.how).not.toContain('Przyjąć wszystkich');
      // mysz i dotyk czytają to samo zdanie
      expect(slowa(g, true, 'nowi').how).toBe(pl.how);
      ustawJezyk('en');
      const en = slowa(g, false, 'nowi');
      expect(en).toEqual({
        text: 'Take someone new in.',
        how: `Event cards bring people to you. Survivors at ${dom ? 'the garden gate' : 'the gate'} have a card with “Show” and, if they ask for a place, “Take him/her/them into ${dom ? 'the house' : 'the co-op'}”; “Put him/her to work” counts too. Newcomers walk in from ${dom ? 'the garden gate' : 'the gate'}, and the notice about them coming in has the same “Show”. Every newcomer is a pair of hands and another mouth to feed.`,
      });
      expect(en.how).not.toContain('Take everyone in');
      expect(polskieSlowa(en.how)).toEqual([]);
      ustawJezyk('pl');
    }
  });

  it('wkurzenie w trybie zombie: ta sama podpowiedź bez ogniska wieczorem (R2 każe unikać światła nocą)', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zombie', 'r4');
      const tekst = 'Sprawdźcie rano w raporcie, jak zmieniło się wkurzenie.';
      expect(slowa(g, false, 'wkurzenie')).toEqual({
        text: tekst,
        how: `Raport rano pokazuje, jak zmieniło się zaufanie i wkurzenie. Wkurzenie spada, gdy ludzie są najedzeni i w cieple; rośnie od zimna, głodu, palenia mebli, napadów i zgonów. Przy pełnym wkurzeniu ${dom ? 'zebranie ulicy odwoła komitet' : 'walne odwoła zarząd'}.`,
      });
      expect(slowa(g, true, 'wkurzenie').how).toBe(slowa(g, false, 'wkurzenie').how);
      expect(slowa(g, false, 'wkurzenie').how).not.toMatch(/ognisk/);
      ustawJezyk('en');
      expect(slowa(g, false, 'wkurzenie')).toEqual({
        text: 'Check in the Morning report how the anger moved.',
        how: `The Morning report shows how trust and anger moved. Anger drops when people are fed and warm; it rises with cold, hunger, burnt furniture, raids and deaths. At full anger ${dom ? 'the street meeting votes the committee out' : 'the general meeting votes the board out'}.`,
      });
      expect(slowa(g, false, 'wkurzenie').how).not.toMatch(/campfire/);
      ustawJezyk('pl');
    }
  });

  it('ludzie: wariant bloku z mieszkańcami i wariant domu / siedziby bez mieszkańców, mysz i dotyk', async () => {
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    const { world, mieszkancy } = await swiatMieszkancow(demo, 5, 4);
    const blok = graZSymulacji('przymorze', 'zwykly', 5, new Sim(world, createSim(world, 5, { core: 4, mieszkancy })));
    otworz(blok, 'r4');
    expect(slowa(blok, false, 'ludzie')).toEqual({
      text: 'Poznajcie mieszkańców siedziby.',
      how: 'Kliknijcie mieszkańca na podwórku albo w mieszkaniu, kiedy nikt nie jest zaznaczony: karta powie, kim jest i z kim mieszka. Mieszkańcy są wymyśleni.',
    });
    expect(
      slowa(blok, true, 'ludzie').how.startsWith(
        'Stuknijcie mieszkańca na podwórku albo w mieszkaniu, kiedy nikt nie jest zaznaczony: ',
      ),
    ).toBe(true);
    ustawJezyk('en');
    expect(slowa(blok, false, 'ludzie')).toEqual({
      text: 'Meet the residents of your block.',
      how: 'Click a resident in the yard or in a flat while nobody is selected: the card tells you who they are and who they live with. The residents are made up.',
    });
    expect(
      slowa(blok, true, 'ludzie').how.startsWith('Tap a resident in the yard or in a flat while nobody is selected: '),
    ).toBe(true);
    ustawJezyk('pl');

    const dom = wRozdziale('zielonki', 'zwykly', 'r4');
    expect(slowa(dom, false, 'ludzie')).toEqual({
      text: 'Poznajcie sąsiadów zza płotu.',
      how: 'Kliknijcie sąsiedni dom, kiedy nikt nie jest zaznaczony: karta powie, kogo z nich znacie i jak się do nich dostać.',
    });
    expect(slowa(dom, true, 'ludzie').how.startsWith('Stuknijcie sąsiedni dom, kiedy nikt nie jest zaznaczony: ')).toBe(
      true,
    );
    ustawJezyk('en');
    expect(slowa(dom, false, 'ludzie')).toEqual({
      text: 'Get to know the neighbours over the fence.',
      how: 'Click a house next door while nobody is selected: the card tells you which neighbours you know and how to get in.',
    });
    expect(slowa(dom, true, 'ludzie').how.startsWith('Tap a house next door while nobody is selected: ')).toBe(true);
  });
});

describe('teksty R5', () => {
  it('wyprawa, lup, ogrodek: zwykły i zombie, mysz i dotyk', () => {
    for (const mode of TRYBY) {
      const g = poPierwszymRaporcie('przymorze', mode);
      wlaczMiasto(g.gov);
      otworz(g, 'r5');
      const zombie =
        mode === 'zombie' ? ' Za siatką są szwendacze: ryzyko jest większe, a kłopoty bywają ugryzieniem.' : '';
      const zombieEn =
        mode === 'zombie' ? ' There are shamblers out there: the risk is higher, and trouble can mean a bite.' : '';
      // dopisek o „Budować …” (deski w innych klatkach albo za ulicą) jest tylko w zombie; Przymorze to blok
      const ulica =
        mode === 'zombie'
          ? ' Po deski z innych klatek i zza ulicy: zaznaczcie osobę i prawy przycisk na planie, „Budować …” (uwaga na szwendacze).'
          : '';
      const ulicaEn =
        mode === 'zombie'
          ? ' For planks from other stairwells or across the street: select a person and right-click the plan, “Build …” (best if no shamblers near).'
          : '';
      expect(CARD_HOUR).toBe(20);
      expect(MORNING).toBe(6);
      expect(slowa(g, false, 'wyprawa')).toEqual({
        text: 'Wyślijcie wyprawę z mapy miasta.',
        how: `Mapa miasta (przycisk u góry albo M): klik w miejsce, na jego karcie „Wyślij wyprawę”, wybierzcie osoby i potwierdźcie. Tylko za dnia, od 6:00 do 20:00; ryzyko i łup widać przed wyjściem.${zombie}`,
      });
      expect(
        slowa(g, true, 'wyprawa').how.startsWith(
          'Mapa miasta (przycisk u góry): stuknięcie w miejsce, na jego karcie „Wyślij wyprawę”, wybierzcie osoby i potwierdźcie. ',
        ),
      ).toBe(true);
      expect(slowa(g, false, 'lup')).toEqual({
        text: 'Przynieście łup z wyprawy.',
        how: 'Wyprawa wraca sama o godzinie z karty miejsca. Ranni wracają z ranami, więc posyłajcie wypoczętych i uzbrojonych. Na karcie nocy wyprawa idzie po zmroku: „Wyprawa blisko” jest bezpieczniejsza, „daleko” przynosi więcej.',
      });
      expect(slowa(g, false, 'ogrodek')).toEqual({
        text: 'Postawcie ogródek.',
        how: `Budowa, zakładka Podwórko: Ogródek (deski 14) na wolnym kawałku podwórka. Po kilku dniach daje jedzenie, jesienią mało.${ulica}`,
      });
      expect(
        slowa(g, true, 'ogrodek').how.startsWith(
          'Przycisk Budowa u góry, zakładka Podwórko: Ogródek (deski 14) na wolnym kawałku podwórka. ',
        ),
      ).toBe(true);
      ustawJezyk('en');
      expect(slowa(g, false, 'wyprawa')).toEqual({
        text: 'Send a supply run from the city map.',
        how: `City map (button at the top, or M): click a place, then “Send a supply run” on its card, pick the people and confirm. By day only, from 6:00 to 20:00; you see the risk and the haul before they leave.${zombieEn}`,
      });
      expect(
        slowa(g, true, 'wyprawa').how.startsWith(
          'City map (button at the top): tap a place, then “Send a supply run” on its card, pick the people and confirm. ',
        ),
      ).toBe(true);
      expect(slowa(g, false, 'lup')).toEqual({
        text: 'Bring back loot from a run.',
        how: 'The run comes back on its own at the time shown on the place card. The hurt come back hurt, so send rested, armed people. On the Night orders a run goes out after dark: a short run is safer, a long one brings back more.',
      });
      expect(slowa(g, false, 'ogrodek')).toEqual({
        text: 'Put in a vegetable patch.',
        how: `Build, Yard tab: Vegetable patch (planks 14) on a free bit of the yard. It grows food after a few days; not much in autumn.${ulicaEn}`,
      });
      expect(
        slowa(g, true, 'ogrodek').how.startsWith(
          'The Build button at the top, Yard tab: Vegetable patch (planks 14) on a free bit of the yard. ',
        ),
      ).toBe(true);
      ustawJezyk('pl');
    }
  });
});

/* Zdanie o „Budować …” w podpowiedzi ogródka: w zombie automat bierze deski tylko z miejsc dostępnych bez ulicy, więc plan,
   któremu deski leżą w innych klatkach albo za ulicą, stoi bez wykonawcy, a wyjściem jest polecenie z menu planu. W zwykłym
   trybie automat nosi deski z całego naszego terenu i zdania nie ma. */
describe.each(KOMBINACJE)('R5 ogrodek: dopisek o „Budować …” tylko w zombie (%s %s)', (key, mode) => {
  it('jest w zombie (blok: także o innych klatkach, dom: tylko o ulicy), w zwykłym trybie go nie ma; mysz, dotyk, po polsku i po angielsku', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczMiasto(g.gov);
    otworz(g, 'r5');
    const zombie = mode === 'zombie';
    const dom = wDomu(key);
    for (const touch of [false, true]) {
      const pl = cel(g, 'ogrodek', { touch }).how;
      expect(pl.includes('„Budować …”'), `pl ${touch ? 'dotyk' : 'mysz'}`).toBe(zombie);
      if (zombie) {
        expect(pl).toContain(` Po deski ${dom ? '' : 'z innych klatek i '}zza ulicy: `);
        expect(pl.includes('z innych klatek i zza ulicy'), 'klatki tylko w bloku').toBe(!dom);
        // menu planu jest tylko dla zaznaczonej osoby, więc najpierw zaznaczenie kogoś, potem plan
        expect(pl).toContain(
          touch
            ? 'stuknijcie osobę i przytrzymajcie plan, „Budować …”'
            : 'zaznaczcie osobę i prawy przycisk na planie, „Budować …”',
        );
        // zdanie jest na samym końcu podpowiedzi i mówi, kiedy polecenie jest najlepsze
        expect(pl.endsWith('(uwaga na szwendacze).'), `pl ${touch ? 'dotyk' : 'mysz'}`).toBe(true);
        if (dom) expect(pl).not.toMatch(FORBIDDEN_DOM);
      }
      ustawJezyk('en');
      const en = cel(g, 'ogrodek', { touch }).how;
      ustawJezyk('pl');
      expect(en.includes('“Build …”'), `en ${touch ? 'touch' : 'mouse'}`).toBe(zombie);
      if (zombie) {
        expect(en).toContain(` For planks ${dom ? '' : 'from other stairwells or '}across the street: `);
        expect(en.includes('from other stairwells or across the street'), 'stairwells only in a block').toBe(!dom);
        expect(en).toContain(
          touch
            ? 'tap a person and press and hold on the plan, “Build …”'
            : 'select a person and right-click the plan, “Build …”',
        );
        expect(en.endsWith('(best if no shamblers near).'), `en ${touch ? 'touch' : 'mouse'}`).toBe(true);
        expect(polskieSlowa(en), en).toEqual([]);
        if (dom) expect(en).not.toMatch(/\b(flat|stairwell|block)\b/i);
      }
    }
  });
});

/* Polecenie „Budować …” z menu planu istnieje tylko dla zaznaczonej osoby (`buildItems` bez osoby z zarządu daje pustą listę),
   więc zdanie w podpowiedzi zaczyna od zaznaczenia kogoś. Test bierze prawdziwy plan ogródka i prawdziwe menu. */
describe.each(KOMBINACJE_ZOMBIE)(
  'R5 ogrodek: „Budować …” z menu planu tylko dla zaznaczonej osoby (%s %s)',
  (key, mode) => {
    it('bez zaznaczenia menu planu jest puste, z zaznaczoną osobą jest „Budować ogródek”, a podpowiedź mówi o zaznaczeniu najpierw', () => {
      const g = poPierwszymRaporcie(key, mode);
      wlaczMiasto(g.gov);
      otworz(g, 'r5');
      const { st, w } = g.sim;
      const a = allowedAnchors(st, w, 'ogrodek', 0)[0];
      g.sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
      g.sim.step();
      expect(st.builds.some((b) => b.kind === 'ogrodek')).toBe(true);
      // deski na podwórku na cały ogródek (14) i zapas: menu proponuje „Budować”, gdy starcza materiału na całość
      dajMaterial(g, { deski: 30 });
      const stock = snapshot(st, w).stock;
      const kto = rdzen(g.sim)[0];
      expect(buildItems(st, w, [], a, stock), 'bez zaznaczonej osoby').toEqual([]);
      expect(buildItems(st, w, [kto.id], a, stock).map((i) => i.label)).toContain('Budować ogródek');
      for (const touch of [false, true]) {
        const pl = cel(g, 'ogrodek', { touch }).how;
        const zaznacz = touch
          ? 'stuknijcie osobę i przytrzymajcie plan'
          : 'zaznaczcie osobę i prawy przycisk na planie';
        // zaznaczenie osoby stoi przed planem i przed poleceniem
        expect(pl, `pl ${touch ? 'dotyk' : 'mysz'}`).toContain(`${zaznacz}, „Budować …”`);
        expect(pl.indexOf('osob')).toBeLessThan(pl.indexOf('plan'));
        ustawJezyk('en');
        const en = cel(g, 'ogrodek', { touch }).how;
        ustawJezyk('pl');
        const select = touch ? 'tap a person and press and hold on' : 'select a person and right-click';
        expect(en, `en ${touch ? 'touch' : 'mouse'}`).toContain(`${select} the plan, “Build …”`);
        expect(en.indexOf('a person')).toBeLessThan(en.indexOf('the plan'));
      }
    });
  },
);

describe.each(KOMBINACJE)('wszystkie teksty R2, R4 i R5: %s %s', (key, mode) => {
  it('po angielsku bez polskich liter i słówek, bez myślników, w domu bez słów z bloku; mysz i dotyk', () => {
    for (const k of ['r2', 'r4', 'r5'] as const) {
      const g = poPierwszymRaporcie(key, mode);
      wlaczMiasto(g.gov);
      otworz(g, k);
      for (const touch of [false, true]) {
        const pl = teksty(g, touch);
        for (const t of pl) {
          expect(t, t).not.toMatch(/[—–]/);
          if (wDomu(key)) expect(t, t).not.toMatch(FORBIDDEN_DOM);
        }
        ustawJezyk('en');
        const en = teksty(g, touch);
        ustawJezyk('pl');
        expect(en).toHaveLength(pl.length);
        for (const t of en) {
          expect(polskieSlowa(t), t).toEqual([]);
          expect(t, t).not.toMatch(/[—–]/);
          if (wDomu(key)) expect(t, t).not.toMatch(/\b(flat|stairwell|block)\b/i);
        }
      }
    }
  });
});

describe('liczniki „od otwarcia” w warunkach i w stanie startu to te same liczby', () => {
  it('ludność z `licznikiStartu` równa się `ludnoscOf(govInput)` w kilku stanach gry', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    const policz = () => [licznikiStartu(g.sim.st, g.gov).ludnosc, ludnoscOf(govInput(g.sim.st, g.sim.w, 0))];
    for (const zmiana of [
      () => undefined,
      () =>
        applyGov(
          g.sim.st,
          g.sim.w,
          skutki((e) => (e.residents = 2)),
        ),
      () =>
        applyGov(
          g.sim.st,
          g.sim.w,
          skutki((e) => e.join.push(makePerson(mulberry(3), new Set(), () => 77))),
        ),
      () =>
        applyGov(
          g.sim.st,
          g.sim.w,
          skutki((e) => (e.residents = -4)),
        ),
    ]) {
      zmiana();
      g.sim.step();
      const [a, b] = policz();
      expect(a).toBe(b);
    }
  });

  it('krok ścieżki z wyprzedzeniem nie zmienia stanu, gdy rozdział nie ma czego zaliczyć', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    otworz(g, 'r4');
    const przed = JSON.stringify(g.sciezka);
    expect(JSON.stringify(krokSciezki(g.sciezka, odczyt(g)))).toBe(przed);
  });
});
