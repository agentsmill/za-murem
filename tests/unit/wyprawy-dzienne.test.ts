/* Wyprawa dzienna z mapy miasta (src/gov/dzienne.ts): wysłanie z odmowami i powodem w obu językach, podgląd, powrót
   w `wyprawyTick` (raz, z łupem, bez ruszania nocy), wywołanie z `govUpdate`, zapis w połowie wyprawy i wyprawa
   wysłana wieczorem, która nie psuje karty nocy. Bez symulacji: wejście składa Atrapa (tests/unit/gov-atrapa.ts),
   a pełne przebiegi idą przez `run`. */

import { describe, expect, it } from 'vitest';
import { podgladWyprawy, wyprawyTick, wyslijWyprawe } from '../../src/gov/dzienne.ts';
import { canGo } from '../../src/gov/noc.ts';
import type { GovEffects, GovInput, GovState } from '../../src/gov/typy.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import {
  type Cel,
  celZMiejsca,
  czasWyprawyMin,
  MAX_DROGA_M,
  powrotMin,
  UDZWIG_NA_OSOBE,
  wlaczMiasto,
  zostaloZMiejsca,
} from '../../src/gov/wyprawy.ts';
import { govUpdate, loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';

const SEED = 7;

/** Wejście zarządu z Atrapy z ustawionym zegarem (dzień, godzina, minuta). */
function wej(day: number, hour: number, minute = 0, atr = new Atrapa(SEED)): GovInput {
  return { ...atr.input(), day, hour, minute, night: hour >= 22 || hour < 6 };
}

/** Wejście na minutę gry `m` (od północy pierwszego dnia). */
const wejMin = (m: number, atr = new Atrapa(SEED)): GovInput =>
  wej(Math.floor(m / 1440) + 1, Math.floor((m % 1440) / 60), m % 60, atr);

/** Zarząd z włączoną mapą miasta. */
function nowy(seed = SEED): GovState {
  const st = newGov(seed);
  wlaczMiasto(st);
  return st;
}

/** Cel z miejsca z zapasem co najmniej 6 sztuk (pierwszy klucz, który go ma). */
function cel(kat = 'apteka', odl = 400, od = 0): Cel {
  for (let k = od; k < od + 500; k++) {
    const c = celZMiejsca({ klucz: `poi:${k}:2`, kat, x: odl, y: 0, odl, nazwa: '' });
    if (c.zapas !== null && c.zapas >= 6) return c;
  }
  throw new Error('żaden klucz nie daje zapasu');
}

const idy = (n: number, atr = new Atrapa(SEED)): string[] => atr.people.slice(0, n).map((p) => p.id);
const suma = (d: Record<string, number>): number => Object.values(d).reduce((a, b) => a + b, 0);

/** Odmowa: wynik `ok: false` z niepustym powodem po polsku i po angielsku, bez żadnej zmiany w stanie i losowań. */
function odmowa(st: GovState, i: GovInput, c: Cel, ids: string[]) {
  const przed = JSON.stringify(st);
  const w = wyslijWyprawe(st, i, c, ids);
  expect(w.ok).toBe(false);
  if (w.ok) throw new Error('powinna być odmowa');
  expect(w.why.pl.length).toBeGreaterThan(3);
  expect(w.why.en.length).toBeGreaterThan(3);
  expect(w.why.en).not.toBe(w.why.pl);
  expect(JSON.stringify(st)).toBe(przed);
  return w.why;
}

describe('wyslijWyprawe: odmowy', () => {
  it('bez stanu miasta', () => {
    const st = newGov(SEED);
    odmowa(st, wej(2, 10), cel(), idy(1));
    expect(st.miasto).toBeUndefined();
  });

  it('w nocy: od 20:00 do 6:00 nikt nie wychodzi, od 6:00 do 19:59 wolno', () => {
    for (const h of [20, 21, 23, 0, 3, 5]) odmowa(nowy(), wej(2, h), cel(), idy(1));
    for (const h of [6, 10, 19]) {
      const w = wyslijWyprawe(nowy(), wej(2, h), cel('apteka', 100), idy(1));
      expect(w.ok, `godzina ${h}`).toBe(true);
    }
  });

  it('powód nocy mówi o godzinach', () => {
    const why = odmowa(nowy(), wej(2, 21), cel(), idy(1));
    expect(why.pl).toMatch(/6:00/);
    expect(why.pl).toMatch(/20:00/);
    expect(why.en).toMatch(/6:00/);
    expect(why.en).toMatch(/20:00/);
  });

  it('za daleko: powyżej MAX_DROGA_M, równe jeszcze wolno', () => {
    odmowa(nowy(), wej(2, 7), cel('apteka', MAX_DROGA_M + 1), idy(1));
    expect(wyslijWyprawe(nowy(), wej(2, 7), cel('apteka', MAX_DROGA_M), idy(1)).ok).toBe(true);
  });

  it('miejsce wybrane do cna', () => {
    const c = cel();
    const st = nowy();
    st.miasto!.zabrano[c.klucz] = c.zapas!;
    expect(zostaloZMiejsca(st, c)).toBe(0);
    odmowa(st, wej(2, 10), c, idy(1));
    // zapas 0 od początku też
    odmowa(nowy(), wej(2, 10), { ...c, zapas: 0 }, idy(1));
  });

  it('pusta lista osób', () => {
    odmowa(nowy(), wej(2, 10), cel(), []);
  });

  it('osoba, której nie ma w zarządzie, i ta sama osoba dwa razy', () => {
    odmowa(nowy(), wej(2, 10), cel(), ['s999']);
    odmowa(nowy(), wej(2, 10), cel(), [...idy(1), 's999']);
  });

  it('osoba już poza mapą (away z wejścia)', () => {
    const atr = new Atrapa(SEED);
    const [a, b] = idy(2, atr);
    atr.away[a] = at(2, 12);
    const st = nowy();
    odmowa(st, wej(2, 10, 0, atr), cel(), [a]);
    // jedna z dwóch wystarczy: odmowa dla całej wyprawy
    odmowa(st, wej(2, 10, 0, atr), cel(), [b, a]);
    expect(wyslijWyprawe(st, wej(2, 10, 0, atr), cel(), [b]).ok).toBe(true);
  });

  it('osoba ugryziona', () => {
    const atr = new Atrapa(SEED);
    atr.people[0].bitten = true;
    odmowa(nowy(), wej(2, 10, 0, atr), cel(), [atr.people[0].id]);
  });

  it('osoba niezdolna (!canGo): zmęczona albo słaba, a zasięg celu zmienia próg', () => {
    const atr = new Atrapa(SEED);
    const p = atr.people[0];
    p.needs.rest = 10;
    odmowa(nowy(), wej(2, 10, 0, atr), cel('apteka', 100), [p.id]);
    p.needs.rest = 65;
    p.needs.health = 20;
    odmowa(nowy(), wej(2, 10, 0, atr), cel('apteka', 100), [p.id]);
    // rest 30 i zdrowie 50: na blisko wystarczy, na daleko nie
    p.needs.rest = 30;
    p.needs.health = 50;
    const blisko = cel('apteka', 100);
    const daleko = cel('apteka', 900);
    expect(canGo(p, blisko)).toBe(true);
    expect(canGo(p, daleko)).toBe(false);
    expect(wyslijWyprawe(nowy(), wej(2, 10, 0, atr), blisko, [p.id]).ok).toBe(true);
    odmowa(nowy(), wej(2, 10, 0, atr), daleko, [p.id]);
  });

  it('osoba już w st.wyprawy, nawet gdy wejście nie ma jej jeszcze jako away', () => {
    const st = nowy();
    const [a, b] = idy(2);
    expect(wyslijWyprawe(st, wej(2, 10), cel('apteka', 100, 0), [a]).ok).toBe(true);
    odmowa(st, wej(2, 10, 1), cel('sklep', 100, 1000), [a]);
    odmowa(st, wej(2, 10, 1), cel('sklep', 100, 1000), [b, a]);
  });

  it('drugie wyjście do klucza, do którego ktoś już idzie; inny klucz wolno', () => {
    const st = nowy();
    const [a, b] = idy(2);
    const c = cel('apteka', 100);
    expect(wyslijWyprawe(st, wej(2, 10), c, [a]).ok).toBe(true);
    odmowa(st, wej(2, 10, 1), c, [b]);
    expect(st.wyprawy).toHaveLength(1);
    expect(wyslijWyprawe(st, wej(2, 10, 2), cel('apteka', 100, 2000), [b]).ok).toBe(true);
    expect(st.wyprawy).toHaveLength(2);
  });

  it('odmowa nie rusza ziarna losowań', () => {
    const st = nowy();
    const s = st.rng.s;
    odmowa(st, wej(2, 21), cel(), idy(1));
    odmowa(st, wej(2, 10), cel(), []);
    expect(st.rng.s).toBe(s);
  });
});

describe('wyslijWyprawe: udane wyjście', () => {
  it('o 10:00: osoby poza mapą, wpis w st.wyprawy z powrotem z powrotMin, wpis w kronice w obu językach', () => {
    const st = nowy();
    const c = cel('apteka', 450);
    const [a, b] = idy(2);
    const i = wej(2, 10);
    const w = wyslijWyprawe(st, i, c, [a, b]);
    if (!w.ok) throw new Error('powinno wyjść');
    const powrot = powrotMin(at(2, 10), c.odl, 2);
    expect(w.powrot).toBe(powrot);
    expect(powrot).toBe(at(2, 10) + czasWyprawyMin(c.odl, 2));
    expect(w.fx.away.map((x) => x.id)).toEqual([a, b]);
    expect(w.fx.away.every((x) => x.day === 2 && x.hour === Math.floor((powrot - at(2, 0)) / 60))).toBe(true);
    expect(w.fx.back).toEqual([]);
    expect(st.wyprawy).toHaveLength(1);
    expect(st.wyprawy![0]).toMatchObject({ ids: [a, b], wyjscie: at(2, 10), powrot });
    expect(st.wyprawy![0].cel).toEqual(c);
    // kronika: wpis ze stanu i ten sam w skutkach, z nazwą celu i godziną powrotu
    const wpis = st.log[st.log.length - 1];
    expect(wpis.day).toBe(2);
    expect(wpis.clock).toBe('10:00');
    expect(w.fx.log).toEqual([wpis.txt]);
    expect(wpis.txt.pl).toContain(c.nazwa.pl);
    expect(wpis.txt.en).toContain(c.nazwa.en);
    expect(wpis.txt.pl).not.toBe(wpis.txt.en);
  });

  it('powrót następnego dnia dostaje w kronice słowo „jutro” / „tomorrow”', () => {
    const st = nowy();
    const w = wyslijWyprawe(st, wej(2, 19), cel('apteka', 100), idy(1));
    if (!w.ok) throw new Error('powinno wyjść');
    expect(w.powrot).toBe(at(3, 6));
    const wpis = st.log[st.log.length - 1].txt;
    expect(wpis.pl).toMatch(/jutro/);
    expect(wpis.en).toMatch(/tomorrow/);
    expect(w.fx.away.every((x) => x.day === 3 && x.hour === 6)).toBe(true);
  });

  it('opis celu w stanie jest kopią: zmiana celu u wołającego go nie rusza', () => {
    const st = nowy();
    const c = cel();
    const przed = JSON.stringify(c);
    expect(wyslijWyprawe(st, wej(2, 10), c, idy(1)).ok).toBe(true);
    c.lup.supplies = [99, 99];
    (c.nazwa as { pl: string }).pl = 'zmienione';
    expect(JSON.stringify(st.wyprawy![0].cel)).toBe(przed);
  });

  it('kilka osób to krótsze przeszukanie, a to samo id dwa razy liczy się raz', () => {
    const c = cel('apteka', 450);
    const [a, b] = idy(2);
    const jedna = wyslijWyprawe(nowy(), wej(2, 10), c, [a]);
    const dwie = wyslijWyprawe(nowy(), wej(2, 10), c, [a, b]);
    const dubel = wyslijWyprawe(nowy(), wej(2, 10), c, [a, a]);
    if (!jedna.ok || !dwie.ok || !dubel.ok) throw new Error('powinno wyjść');
    expect(dwie.powrot).toBeLessThan(jedna.powrot);
    expect(dubel.powrot).toBe(jedna.powrot);
    expect(dubel.fx.away).toHaveLength(1);
  });

  it('wyprawy dostają różne numery, także po powrocie poprzedniej', () => {
    const st = nowy();
    const [a, b] = idy(2);
    wyslijWyprawe(st, wej(2, 10), cel('apteka', 100, 0), [a]);
    wyslijWyprawe(st, wej(2, 10), cel('apteka', 100, 3000), [b]);
    const [x, y] = st.wyprawy!;
    expect(x.id).not.toBe(y.id);
  });

  it('nie dotyka nocy ani kolejki wydarzeń i nie losuje', () => {
    const st = nowy();
    const s = st.rng.s;
    const ev = JSON.stringify(st.ev);
    wyslijWyprawe(st, wej(2, 10), cel(), idy(1));
    expect(st.night).toBeNull();
    expect(st.rng.s).toBe(s);
    expect(JSON.stringify(st.ev)).toBe(ev);
  });
});

describe('podgladWyprawy', () => {
  it('czas, powrót, ryzyko, udźwig i zapas', () => {
    const st = nowy();
    const c = cel('apteka', 450);
    const ids = idy(2);
    const p = podgladWyprawy(st, wej(2, 10), c, ids);
    expect(p.czasMin).toBe(czasWyprawyMin(c.odl, 2));
    expect(p.powrot).toBe(powrotMin(at(2, 10), c.odl, 2));
    expect(p.unosza).toBe(2 * UDZWIG_NA_OSOBE);
    expect(p.zostalo).toBe(c.zapas);
    expect(p.ryzyko).toBeGreaterThan(0);
    expect(p.ryzyko).toBeLessThanOrEqual(0.9);
  });

  it('zapas to to, co zostało; cel bez końca zapasu daje null', () => {
    const st = nowy();
    const c = cel();
    st.miasto!.zabrano[c.klucz] = 2;
    expect(podgladWyprawy(st, wej(2, 10), c, idy(1)).zostalo).toBe(c.zapas! - 2);
    expect(podgladWyprawy(st, wej(2, 10), { ...c, zapas: null }, idy(1)).zostalo).toBeNull();
  });

  it('ryzyko rośnie z odległością, a z liczbą osób maleje (razem raźniej)', () => {
    const st = nowy();
    // ludzie bez cech i umiejętności, żeby różnicę robiła tylko odległość i liczba osób
    const atr = new Atrapa(SEED);
    for (const p of atr.people) {
      p.traits = [];
      p.skills = {};
    }
    const ids = idy(3, atr);
    const blisko = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 100), ids.slice(0, 1)).ryzyko;
    const daleko = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 1200), ids.slice(0, 1)).ryzyko;
    expect(daleko).toBeGreaterThan(blisko);
    const sam = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 400), ids.slice(0, 1)).ryzyko;
    const we3 = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 400), ids).ryzyko;
    expect(we3).toBeLessThan(sam);
  });

  it('ryzyko to najgorsze z osób: słabsza osoba w grupie podnosi je', () => {
    const st = nowy();
    const atr = new Atrapa(SEED);
    for (const p of atr.people) {
      p.traits = [];
      p.skills = {};
    }
    const [a, b] = idy(2, atr);
    const razem = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 400), [a, b]).ryzyko;
    atr.people[1].traits = ['tchorz'];
    const zTchorzem = podgladWyprawy(st, wej(2, 10, 0, atr), cel('apteka', 400), [a, b]).ryzyko;
    expect(zTchorzem).toBeGreaterThan(razem);
  });

  it('nic nie zmienia i niczego nie losuje; bez osób udźwig i ryzyko 0', () => {
    const st = nowy();
    const przed = JSON.stringify(st);
    podgladWyprawy(st, wej(2, 10), cel(), idy(2));
    const pusty = podgladWyprawy(st, wej(2, 10), cel(), []);
    expect(JSON.stringify(st)).toBe(przed);
    expect(pusty.unosza).toBe(0);
    expect(pusty.ryzyko).toBe(0);
  });
});

describe('wyprawyTick', () => {
  /** Zarząd z wysłaną o 10:00 dnia 2 wyprawą `n` osób do celu `c`; zwraca stan, minutę powrotu i osoby. */
  function wyslana(n: number, c: Cel = cel('apteka', 450), seed = SEED) {
    const st = nowy(seed);
    const ids = idy(n);
    const w = wyslijWyprawe(st, wej(2, 10), c, ids);
    if (!w.ok) throw new Error('powinno wyjść');
    return { st, ids, powrot: w.powrot, c };
  }

  it('bez st.wyprawy nic nie robi: stan, skutki i ziarno bez zmian, pole się nie pojawia', () => {
    const st = nowy();
    const przed = JSON.stringify(st);
    const fx = emptyEffects();
    wyprawyTick(st, wej(2, 10), fx);
    expect(JSON.stringify(st)).toBe(przed);
    expect('wyprawy' in st).toBe(false);
    expect(JSON.stringify(fx)).toBe(JSON.stringify(emptyEffects()));
  });

  it('przed minutą powrotu nic się nie dzieje', () => {
    const { st, powrot } = wyslana(1);
    const przed = JSON.stringify(st);
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot - 1), fx);
    expect(JSON.stringify(st)).toBe(przed);
    expect(fx.back).toEqual([]);
  });

  it('o minucie powrotu osoby wracają dokładnie raz', () => {
    const { st, ids, powrot } = wyslana(2);
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot), fx);
    expect(fx.back).toEqual(ids);
    expect(st.wyprawy).toEqual([]);
    const dalej = emptyEffects();
    wyprawyTick(st, wejMin(powrot), dalej);
    wyprawyTick(st, wejMin(powrot + 1), dalej);
    expect(dalej.back).toEqual([]);
    expect(suma(dalej.stock)).toBe(0);
  });

  it('spóźnione wejście (po minucie powrotu) też rozlicza', () => {
    const { st, ids, powrot } = wyslana(1);
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot + 90), fx);
    expect(fx.back).toEqual(ids);
  });

  it('łup trafia do fx.stock i do st.miasto, wizyta ma dzień powrotu', () => {
    let kiedyKolwiek = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { st, c, powrot } = wyslana(2, cel('apteka', 450), seed);
      const fx = emptyEffects();
      wyprawyTick(st, wejMin(powrot), fx);
      const wyniesiono = suma(fx.stock);
      expect(wyniesiono, `ziarno ${seed}`).toBeGreaterThanOrEqual(0);
      expect(st.miasto!.zabrano[c.klucz] ?? 0, `ziarno ${seed}`).toBe(wyniesiono);
      expect(st.miasto!.wizyty[c.klucz]).toBe(1);
      expect(st.miasto!.ostatnia[c.klucz]).toBe(2);
      expect(wyniesiono).toBeLessThanOrEqual(Math.min(c.zapas!, 2 * UDZWIG_NA_OSOBE));
      expect(fx.stock.meds).toBe(wyniesiono);
      if (wyniesiono > 0) kiedyKolwiek++;
    }
    expect(kiedyKolwiek).toBeGreaterThan(0);
  });

  it('linie rozliczenia idą do st.log i do skutków, w obu językach', () => {
    const { st, powrot } = wyslana(1);
    const przedLog = st.log.length;
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot), fx);
    const nowe = st.log.slice(przedLog);
    expect(nowe.length).toBeGreaterThan(0);
    expect(fx.log).toEqual(nowe.map((l) => l.txt));
    for (const l of nowe) {
      expect(l.txt.pl.length).toBeGreaterThan(0);
      expect(l.txt.en.length).toBeGreaterThan(0);
      expect(l.day).toBe(2);
    }
    expect(nowe[0].txt.pl).toContain('Apteka');
    expect(nowe[0].txt.en).toContain('Pharmacy');
  });

  it('potrzeby i nastrój idą jak po nocnej wyprawie: zmęczenie po drodze', () => {
    const { st, ids, powrot } = wyslana(1, cel('apteka', 450));
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot), fx);
    const zm = fx.needs.find((n) => n.id === ids[0])!;
    expect(zm.d.rest).toBe(-30);
  });

  it('nie dotyka st.night, nawet gdy noc jest rozpisana', () => {
    const { st, powrot } = wyslana(1);
    const atr = new Atrapa(SEED);
    const night = {
      day: 1,
      card: {},
      assign: { x: 'sen' },
      confirmed: true,
      raid: null,
      exp: [],
      lines: [],
      hurt: [],
      t0: st.trust,
      a0: st.anger,
      returned: [],
      loot: { wood: 0, supplies: 0, scrap: 0, parts: 0, meds: 0 },
      slept: [],
    } as unknown as NonNullable<GovState['night']>;
    st.night = night;
    const przed = JSON.stringify(st.night);
    wyprawyTick(st, wejMin(powrot, atr), emptyEffects());
    expect(JSON.stringify(st.night)).toBe(przed);
    expect(st.night).toBe(night);
  });

  it('dwie wyprawy w tej samej minucie wracają po kolei i każda raz', () => {
    const st = nowy();
    const [a, b] = idy(2);
    const c1 = cel('apteka', 100, 0);
    const c2 = cel('sklep', 100, 3000);
    const w1 = wyslijWyprawe(st, wej(2, 10), c1, [a]);
    const w2 = wyslijWyprawe(st, wej(2, 10), c2, [b]);
    if (!w1.ok || !w2.ok) throw new Error('powinno wyjść');
    const t = Math.max(w1.powrot, w2.powrot);
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(t), fx);
    expect(fx.back).toEqual([a, b]);
    expect(st.wyprawy).toEqual([]);
    expect(st.miasto!.wizyty[c1.klucz]).toBe(1);
    expect(st.miasto!.wizyty[c2.klucz]).toBe(1);
  });

  it('wraca tylko ta, której pora; druga zostaje w drodze', () => {
    const st = nowy();
    const [a, b] = idy(2);
    const w1 = wyslijWyprawe(st, wej(2, 10), cel('apteka', 100, 0), [a]);
    const w2 = wyslijWyprawe(st, wej(2, 10), cel('apteka', 1500, 3000), [b]);
    if (!w1.ok || !w2.ok) throw new Error('powinno wyjść');
    expect(w1.powrot).toBeLessThan(w2.powrot);
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(w1.powrot), fx);
    expect(fx.back).toEqual([a]);
    expect(st.wyprawy!.map((w) => w.ids)).toEqual([[b]]);
  });

  it('osoba, której już nie ma (zginęła albo odeszła), nie wraca, a reszta tak', () => {
    const { st, ids, powrot } = wyslana(2);
    const i = wejMin(powrot);
    i.people = i.people.filter((p) => p.id !== ids[0]);
    const fx = emptyEffects();
    wyprawyTick(st, i, fx);
    expect(fx.back).toEqual([ids[1]]);
    expect(st.wyprawy).toEqual([]);
  });

  it('wyprawa całkiem bez ludzi znika bez losowania i bez wpisów', () => {
    const { st, ids, powrot } = wyslana(1);
    const i = wejMin(powrot);
    i.people = i.people.filter((p) => p.id !== ids[0]);
    const s = st.rng.s;
    const log = st.log.length;
    const fx = emptyEffects();
    wyprawyTick(st, i, fx);
    expect(st.wyprawy).toEqual([]);
    expect(st.rng.s).toBe(s);
    expect(st.log.length).toBe(log);
    expect(fx.back).toEqual([]);
  });

  it('wyczerpane przez kogoś innego miejsce daje tyle, ile zostało', () => {
    const { st, c, powrot } = wyslana(2, cel('apteka', 450));
    st.miasto!.zabrano[c.klucz] = c.zapas! - 1;
    const fx = emptyEffects();
    wyprawyTick(st, wejMin(powrot), fx);
    expect(suma(fx.stock)).toBeLessThanOrEqual(1);
    expect(zostaloZMiejsca(st, c)).toBe(Math.max(0, 1 - suma(fx.stock)));
  });

  it('govUpdate woła wyprawyTick: o minucie powrotu osoby wracają ze skutkami zarządu', () => {
    const { st, ids, powrot, c } = wyslana(1);
    const fx: GovEffects = govUpdate(st, wejMin(powrot));
    expect(fx.back).toEqual(ids);
    expect(st.wyprawy).toEqual([]);
    expect(st.miasto!.wizyty[c.klucz]).toBe(1);
  });
});

describe('wyprawa dzienna w pełnym przebiegu na atrapie', () => {
  it('zapis w połowie wyprawy: stan sklonowany przez JSON dochodzi do tego samego co oryginał, powrót raz', () => {
    const seed = 5;
    const atr = new Atrapa(seed);
    const gov = newGov(seed);
    wlaczMiasto(gov);
    run(seed, 'propozycja', at(2, 10), { gov, atr });
    const c = cel('apteka', 600);
    const zdolni = atr.people.filter((p) => !(p.id in atr.away) && canGo(p, c)).map((p) => p.id);
    expect(zdolni.length).toBeGreaterThanOrEqual(2);
    const w = wyslijWyprawe(gov, atr.input(), c, zdolni.slice(0, 2));
    if (!w.ok) throw new Error(`powinno wyjść: ${w.why.pl}`);
    atr.apply(w.fx);
    run(seed, 'propozycja', at(2, 11), { gov, atr });
    expect(gov.wyprawy).toHaveLength(1);
    const gov2 = JSON.parse(JSON.stringify(gov)) as GovState;
    const gov3 = loadGov(saveGov(gov));
    const atr2 = atr.clone();
    const atr3 = atr.clone();
    run(seed, 'propozycja', at(3, 8), { gov, atr });
    run(seed, 'propozycja', at(3, 8), { gov: gov2, atr: atr2 });
    run(seed, 'propozycja', at(3, 8), { gov: gov3, atr: atr3 });
    expect(JSON.stringify(gov2)).toBe(JSON.stringify(gov));
    expect(JSON.stringify(gov3)).toBe(JSON.stringify(gov));
    expect(gov.wyprawy).toEqual([]);
    expect(gov.miasto!.wizyty[c.klucz]).toBe(1);
    expect(gov2.miasto!.wizyty[c.klucz]).toBe(1);
    expect(Object.keys(atr.away)).toEqual([]);
    expect(Object.keys(atr2.away)).toEqual([]);
  });

  it('wysłana o 19:00 wraca o 6:00 następnego dnia i nie psuje karty nocy o 20:00', () => {
    const seed = 3;
    const atr = new Atrapa(seed);
    const gov = newGov(seed);
    wlaczMiasto(gov);
    run(seed, 'propozycja', at(2, 19), { gov, atr });
    const c = cel('apteka', 250);
    const kto = atr.people.find((p) => canGo(p, c))!;
    expect(kto).toBeDefined();
    const w = wyslijWyprawe(gov, atr.input(), c, [kto.id]);
    if (!w.ok) throw new Error('powinno wyjść');
    expect(w.powrot).toBe(at(3, 6));
    atr.apply(w.fx);
    // karta nocy o 20:00 jest, a ta osoba ma tylko sen: bez warty i bez nocnej wyprawy
    const noc = run(seed, 'propozycja', at(2, 21), { gov, atr });
    expect(noc.steps.some((s) => s.kind === 'karta' && s.day === 2)).toBe(true);
    const n = gov.night!;
    expect(n.confirmed).toBe(true);
    expect(n.card.people.find((p) => p.id === kto.id)!.options.map((o) => o.key)).toEqual(['sen']);
    expect(n.assign[kto.id] ?? 'sen').toBe('sen');
    expect(n.exp.every((g) => !g.ids.includes(kto.id))).toBe(true);
    expect(atr.guards).not.toContain(kto.id);
    // w nocy jest jeszcze w drodze, o 6:00 wraca raz
    run(seed, 'propozycja', at(3, 5, 59), { gov, atr });
    expect(gov.wyprawy).toHaveLength(1);
    expect(kto.id in atr.away).toBe(true);
    run(seed, 'propozycja', at(3, 6, 2), { gov, atr });
    expect(gov.wyprawy).toEqual([]);
    expect(kto.id in atr.away).toBe(false);
    expect(gov.miasto!.wizyty[c.klucz]).toBe(1);
    expect(gov.reports.some((r) => r.day === 2)).toBe(true);
  });

  it('kronika ma wpis o wyjściu i o powrocie', () => {
    const seed = 9;
    const atr = new Atrapa(seed);
    const gov = newGov(seed);
    wlaczMiasto(gov);
    run(seed, 'propozycja', at(2, 10), { gov, atr });
    const c = cel('apteka', 300);
    const w = wyslijWyprawe(gov, atr.input(), c, idy(1, atr));
    if (!w.ok) throw new Error('powinno wyjść');
    atr.apply(w.fx);
    run(seed, 'propozycja', w.powrot + 1, { gov, atr });
    const razem = gov.log.map((l) => l.txt.pl).join('\n');
    expect(razem).toMatch(/Wyprawa/);
    expect(razem).toContain('Apteka');
    expect(gov.wyprawy).toEqual([]);
    expect(gameMin(atr.input())).toBeGreaterThan(w.powrot);
  });
});
