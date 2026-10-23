/* Warstwa zimy silnika osady AI (src/ai/zima.ts, src/ai/miejsca.ts, `silnik` w src/ai/silnik.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 3). Powód warstwy: gry botów kończą się zimą w dniach
   15–18, bo zarząd śpi w pokoju, który koza z kuchni grzeje tylko przez drzwi (docs/ocena/2026-10-20-zima-w-grach-botow.md,
   sekcje 3 i 7); ogrzany pokój zarządu daje 5–12 dni więcej. Pilnuje sześciu rzeczy:
   - miejsc (`pokojZarzadu`, `miejsceNa`): pokój, w którym śpi zarząd, i pierwsze miejsce dla budowli: także tam, gdzie
     koza z beczki nie ma gdzie stanąć (sypialnie Lanciego bez okna), z wolnym kafelkiem do stania przy obrysie (plan
     zastawiony ze wszystkich stron stałby w grze do końca: Zielonki, ziarno 14) i z pomijaniem miejsc, które ktoś jeszcze
     zajmie (pracownia nie zabiera kozie okna);
   - drogi do kozy: pracownia, badanie `t_kozy`, koza z beczki w pokoju zarządu do 9. dnia, także w domu jednorodzinnym
     (Zielonki: zarząd w dwóch pokojach, bez klatki; w grze jak w przeglądarce, bo świat z adresu nie ma desek na pracownię);
   - materiału: plan, któremu brakuje desek, dostaje rozbiórkę gruzu i śmieci, a sterta, do której nikt nie dojdzie, nie
     jest zlecana w kółko;
   - drewna: `drewnoNaNoc` liczy jak karta nocy, a ścinanie na opał rusza już poniżej dwóch nocy (nie dopiero poniżej 6);
   - dyżuru przy kozie na karcie nocy: najbardziej wypoczęta osoba ze zdrowiem co najmniej 40, tylko gdy drewna starcza
     na noc i jest zimno, bez podwójnego przydziału i z poleceniem, gdy karta nie ma tej opcji;
   - determinizmu i kosztu: pamięć warstwy w JSON (zapis i wczytanie w połowie nie zmieniają przebiegu), warstwa najwyżej
     raz na 30 sekund przy ekranie. */

import { describe, expect, it } from 'vitest';
import {
  type Decydent,
  type GraAi,
  grajDo,
  krokGry,
  nowaGraAi,
  type Rece,
  skrotGry,
  wczytajGre,
  wejscie,
  type ZapisGryAi,
  zapiszGre,
  zrobRece,
} from '../../src/ai/gra.ts';
import { miejscaNa, miejsceNa, pokojZarzadu } from '../../src/ai/miejsca.ts';
import { silnik, silnikPodstawowy } from '../../src/ai/silnik.ts';
import { drewnoNaNoc, dyzurNaKarcie, progDrewna, turaZimy } from '../../src/ai/zima.ts';
import { KOZA_KEY, WOOD_PER_HOUR } from '../../src/gov/noc.ts';
import type { Prompt } from '../../src/gov/typy.ts';
import { canPlace } from '../../src/sim/budowle.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import type { Thing } from '../../src/sim/sim.ts';
import { przygotujGre } from '../../tools/bot-osada.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

type Karta = Extract<Prompt, { k: 'karta' }>;

/** łóżka z kontraktu wnętrza (te same rodzaje co w symulacji) */
const LOZKA = new Set(['lozko', 'wersalka', 'lozka_pietrowe']);

/** tick danego dnia gry o pełnej godzinie (gra zaczyna się o 15:00 dnia 1; godzina przed 15:00 to ten sam dzień) */
const tickDnia = (dzien: number, godzina: number): number =>
  (dzien - 1) * TICKS_PER_DAY + (godzina - 15) * TICKS_PER_HOUR;

/** czy koza z beczki stoi w pokoju, w którym śpi zarząd */
function kozaWPokoju(g: GraAi): boolean {
  const pokoj = pokojZarzadu(g.sim.st, g.w);
  const h = houseOf(g.w)!;
  return pokoj >= 0 && g.sim.st.things.some((t) => t.kind === 'koza_beczka' && h.room[t.y * g.w.size + t.x] === pokoj);
}

/** rzecz z gry (do dokładania drewna w testach) */
function rzecz(g: GraAi, kind: string, x: number, y: number, n = 0): Thing {
  return { id: g.sim.st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 };
}

/** dużo drewna w składzie: zapas na noc bez względu na to, co gra zdążyła zebrać */
function dorzucDrewno(g: GraAi, ile = 80): void {
  const h = houseOf(g.w)!;
  const kafelek = h.sklad[0];
  g.sim.st.things.push(rzecz(g, 'drewno', kafelek % g.w.size, Math.floor(kafelek / g.w.size), ile));
}

/** ręce, które tylko zapisują ruchy (przydział odmawia, gdy klucz jest na liście `odmow`; reszta się udaje) */
function szpieg(odmow: readonly string[] = []): { r: Rece; ruchy: string[] } {
  const ruchy: string[] = [];
  const r: Rece = {
    polecenie: (c) => ruchy.push(`polecenie:${JSON.stringify(c)}`),
    potwierdzRaport: () => ruchy.push('raport'),
    podpisz: (id) => ruchy.push(`uchwala:${id}`),
    przydziel: (osoba, klucz) => {
      if (odmow.includes(klucz)) return false;
      ruchy.push(`noc:${osoba}=${klucz}`);
      return true;
    },
    zatwierdzNoc: () => ruchy.push('zatwierdz'),
    wybierz: (k) => ruchy.push(`wydarzenie:${k}`),
    grajDalej: () => ruchy.push('dalej'),
    wyslij: () => {
      ruchy.push('wyprawa');
      return true;
    },
  };
  return { r, ruchy };
}

/** zdrowie osób na karcie: 100 dla osób o podanych numerach na karcie, 39 (za mało na dyżur i wartę) dla reszty */
const zdroweTylko = (p: Karta, ...numery: number[]): number[] =>
  p.card.people.map((_, k) => (numery.includes(k) ? 100 : 39));

/** wszyscy na karcie śpią, z wypoczęciem z listy (kolejność osób na karcie; reszta 50) i ze zdrowiem z listy albo
    jedną liczbą dla wszystkich (domyślnie 100) */
function ustawKarte(g: GraAi, p: Karta, rest: readonly number[], health: number | readonly number[] = 100): void {
  p.card.people.forEach((o, k) => {
    o.needs.rest = rest[k] ?? 50;
    o.needs.health = typeof health === 'number' ? health : (health[k] ?? 100);
    g.gov.night!.assign[o.id] = 'sen';
  });
}

/** Gra silnikiem do pierwszej karty nocy po ticku `od` i na niej, tuż przed odpowiedzią silnika, uruchamia `dyzurNaKarcie`
    na ręce-szpiegu. `przed` może przestawić grę i kartę przed dyżurem (drewno, zdrowie osób, opcje karty). Zwraca ruchy
    szpiega i kartę. */
function dyzurNaPierwszejKarcie(
  g: GraAi,
  od: number,
  przed: (g: GraAi, p: Karta) => void = () => {},
  odmow: readonly string[] = [],
): { ruchy: string[]; karta: Karta } {
  let wynik: { ruchy: string[]; karta: Karta } | null = null;
  const d: Decydent = {
    ...silnik,
    okno(gr, p, r) {
      if (p.k === 'karta' && !wynik && gr.sim.st.tick >= od) {
        przed(gr, p);
        const s = szpieg(odmow);
        dyzurNaKarcie(gr, p, s.r);
        wynik = { ruchy: s.ruchy, karta: p };
      }
      silnik.okno(gr, p, r);
    },
  };
  while (!wynik && !g.gov.over && g.sim.st.tick < od + 3 * TICKS_PER_DAY) krokGry(g, d);
  if (!wynik) throw new Error('nie doszło do karty nocy');
  return wynik;
}

/** Gra silnikiem do pierwszej karty nocy po ticku `od`, przestawia ją (`przed`), oddaje całe okno silnikowi i zwraca
    przydział zatwierdzonej karty (id osoby → klucz). */
function przydzialPoOknie(g: GraAi, od: number, przed: (g: GraAi, p: Karta) => void): Record<string, string> {
  let wynik: Record<string, string> | null = null;
  const d: Decydent = {
    ...silnik,
    okno(gr, p, r) {
      if (p.k === 'karta' && !wynik && gr.sim.st.tick >= od) {
        przed(gr, p);
        silnik.okno(gr, p, r);
        expect(gr.gov.night?.confirmed).toBe(true);
        wynik = { ...gr.gov.night!.assign };
        return;
      }
      silnik.okno(gr, p, r);
    },
  };
  while (!wynik && !g.gov.over && g.sim.st.tick < od + 3 * TICKS_PER_DAY) krokGry(g, d);
  if (!wynik) throw new Error('nie doszło do karty nocy');
  return wynik;
}

describe('pokojZarzadu', () => {
  it('Przymorze: jedyny pokój mieszkania zarządu, w którym stoją łóżka całego zarządu', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const h = houseOf(g.w)!;
    const pokoj = pokojZarzadu(g.sim.st, g.w);
    expect(pokoj).toBeGreaterThanOrEqual(0);
    expect(h.rooms[pokoj]).toMatchObject({ kind: 'pokoj', apt: h.home });
    const rdzen = g.sim.st.pawns.filter((p) => p.kind === 'core').map((p) => p.id);
    const lozka = g.sim.st.things.filter((t) => LOZKA.has(t.kind) && rdzen.includes(t.owner));
    expect(lozka).toHaveLength(4);
    for (const l of lozka) expect(h.room[l.y * g.w.size + l.x]).toBe(pokoj);
  });

  it('Zielonki (dwa pokoje po dwa łóżka): remis rozstrzyga niższy numer pokoju, a przewaga łóżek wygrywa', () => {
    const g = nowaGraAi(demoWorld('zielonki'), 12);
    const st = g.sim.st;
    const h = houseOf(g.w)!;
    const wPokoju = (t: Thing): number => h.room[t.y * g.w.size + t.x];
    const lozka = st.things.filter((t) => LOZKA.has(t.kind) && h.rooms[wPokoju(t)]?.apt === h.home);
    const pokoje = [...new Set(lozka.map(wPokoju))].sort((a, b) => a - b);
    expect(pokoje.length).toBe(2);
    expect(lozka.filter((t) => wPokoju(t) === pokoje[0])).toHaveLength(2);
    expect(lozka.filter((t) => wPokoju(t) === pokoje[1])).toHaveLength(2);
    expect(pokojZarzadu(st, g.w)).toBe(pokoje[0]);
    // zwolnione łóżko w pierwszym pokoju: przewagę ma drugi
    const wolne = lozka.find((t) => wPokoju(t) === pokoje[0])!;
    const wlasciciel = wolne.owner;
    wolne.owner = -1;
    expect(pokojZarzadu(st, g.w)).toBe(pokoje[1]);
    // i z powrotem; łóżko cudzego (spoza zarządu) nie liczy się
    wolne.owner = wlasciciel;
    expect(pokojZarzadu(st, g.w)).toBe(pokoje[0]);
    wolne.owner = 99999;
    expect(pokojZarzadu(st, g.w)).toBe(pokoje[1]);
  });

  it('bez łóżek z właścicielem z zarządu: pierwszy pokój mieszkania zarządu, a bez wnętrza −1', () => {
    const g = nowaGraAi(demoWorld('zielonki'), 12);
    const h = houseOf(g.w)!;
    for (const t of g.sim.st.things) if (LOZKA.has(t.kind)) t.owner = -1;
    const pierwszy = h.rooms.find((r) => r.kind === 'pokoj' && r.apt === h.home)!;
    expect(pokojZarzadu(g.sim.st, g.w)).toBe(pierwszy.id);
    const bezWnetrza = { ...g.w, interior: null } as unknown as typeof g.w;
    expect(pokojZarzadu(g.sim.st, bezWnetrza)).toBe(-1);
  });
});

describe('miejsceNa', () => {
  it('koza z beczki: bez badania nigdzie, po t_kozy pierwsze miejsce w podanym pokoju, które canPlace przepuszcza', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    const h = houseOf(w)!;
    const pokoj = pokojZarzadu(st, w);
    expect(miejsceNa(st, w, 'koza_beczka', pokoj)).toBeNull();
    st.techDone = ['t_kozy'];
    const miejsce = miejsceNa(st, w, 'koza_beczka', pokoj)!;
    expect(miejsce).not.toBeNull();
    expect(canPlace(st, w, 'koza_beczka', miejsce.x, miejsce.y, miejsce.rot).ok).toBe(true);
    expect(h.room[miejsce.y * w.size + miejsce.x]).toBe(pokoj);
    // pierwsze w kolejności kafelków (obrót 0 przed 1), jak placeFor z tests/unit/m2-play.ts
    let pierwsze: { x: number; y: number; rot: number } | null = null;
    for (const rot of [0, 1])
      for (let i = 0; i < w.size * w.size && !pierwsze; i++)
        if (h.room[i] === pokoj && canPlace(st, w, 'koza_beczka', i % w.size, Math.floor(i / w.size), rot).ok)
          pierwsze = { x: i % w.size, y: Math.floor(i / w.size), rot };
    expect(miejsce).toEqual(pierwsze);
  });

  it('pokój bez okna (sypialnie Lanciego): koza z beczki nie ma tam miejsca, bez pokoju stanie w kuchni', () => {
    const g = nowaGraAi(demoWorld('lanciego'), 11);
    const { w } = g;
    const st = g.sim.st;
    st.techDone = ['t_kozy'];
    const pokoj = pokojZarzadu(st, w);
    expect(pokoj).toBeGreaterThanOrEqual(0);
    expect(houseOf(w)!.rooms[pokoj].kind).toBe('pokoj');
    expect(miejsceNa(st, w, 'koza_beczka', pokoj)).toBeNull();
    const gdziekolwiek = miejsceNa(st, w, 'koza_beczka')!;
    expect(gdziekolwiek).not.toBeNull();
    expect(canPlace(st, w, 'koza_beczka', gdziekolwiek.x, gdziekolwiek.y, gdziekolwiek.rot).ok).toBe(true);
  });

  it('pozostałe rodzaje miejsc: pracownia w pokoju, ogródek na podwórku, zasieki na siatce; zamknięte badaniem i limitem nie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    const h = houseOf(w)!;
    for (const kind of ['pracownia', 'ogrodek', 'zasieki', 'warsztat', 'magazyn', 'lozka_pietrowe'] as const) {
      const m = miejsceNa(st, w, kind);
      expect(m, kind).not.toBeNull();
      expect(canPlace(st, w, kind, m!.x, m!.y, m!.rot).ok, kind).toBe(true);
    }
    const lab = miejsceNa(st, w, 'pracownia')!;
    expect(h.rooms[h.room[lab.y * w.size + lab.x]].kind).toBe('pokoj');
    // kocioł i szklarnia czekają na badania
    expect(miejsceNa(st, w, 'kociol')).toBeNull();
    expect(miejsceNa(st, w, 'szklarnia')).toBeNull();
    // pracownia jest jedna: z planem w toku drugiej nie ma gdzie postawić
    st.builds.push({
      id: st.nextThing++,
      kind: 'pracownia',
      x: lab.x,
      y: lab.y,
      rot: lab.rot,
      need: {},
      have: {},
      work: 0,
      by: -1,
    });
    expect(miejsceNa(st, w, 'pracownia')).toBeNull();
  });

  it('pokój podany w drugim argumencie zawęża pokojowe miejsca do niego', () => {
    const g = nowaGraAi(demoWorld('zielonki'), 12);
    const { w } = g;
    const st = g.sim.st;
    const h = houseOf(w)!;
    const pokoje = h.rooms.filter((r) => r.kind === 'pokoj' && r.apt === h.home).map((r) => r.id);
    expect(pokoje.length).toBe(2);
    for (const pokoj of pokoje) {
      const m = miejsceNa(st, w, 'warsztat', pokoj);
      expect(m, `pokój ${pokoj}`).not.toBeNull();
      expect(h.room[m!.y * w.size + m!.x]).toBe(pokoj);
    }
  });
});

describe('miejsceNa: dostęp do budowli', () => {
  /** meble na wszystkich kafelkach wokół obrysu miejsca (poza ścianami): nikt przy nim nie stanie */
  function zastaw(g: GraAi, m: { x: number; y: number; rot: number }): void {
    const size = g.w.size;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = m.x + dx;
        const y = m.y + dy;
        if (!(dx || dy) || g.w.blocked[y * size + x]) continue;
        if (g.sim.st.things.some((t) => t.x === x && t.y === y && t.kind === 'stol')) continue;
        g.sim.st.things.push(rzecz(g, 'stol', x, y));
      }
  }

  it('miejsce zastawione ze wszystkich stron meblami jest pomijane, bo nie ma skąd go zbudować ani obsłużyć', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    st.techDone = ['t_kozy'];
    const pokoj = pokojZarzadu(st, w);
    const pierwsze = miejsceNa(st, w, 'koza_beczka', pokoj)!;
    expect(canPlace(st, w, 'koza_beczka', pierwsze.x, pierwsze.y, pierwsze.rot).ok).toBe(true);
    zastaw(g, pierwsze);
    // canPlace dalej przepuszcza ten kafelek (stoły stoją obok), ale miejsce bez dostępu odpada
    expect(canPlace(st, w, 'koza_beczka', pierwsze.x, pierwsze.y, pierwsze.rot).ok).toBe(true);
    const drugie = miejsceNa(st, w, 'koza_beczka', pokoj)!;
    expect(drugie).not.toBeNull();
    expect(drugie).not.toEqual(pierwsze);
    // gdy wszystkie miejsca są zastawione, nie ma żadnego
    for (const m of miejscaNa(st, w, 'koza_beczka', pokoj)) zastaw(g, m);
    expect(miejsceNa(st, w, 'koza_beczka', pokoj)).toBeNull();
    expect(miejscaNa(st, w, 'koza_beczka', pokoj)).toEqual([]);
  });

  it('miejscaNa to wszystkie miejsca po kolei, a miejsceNa zwraca pierwsze z nich', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    const wszystkie = miejscaNa(st, w, 'pracownia');
    expect(wszystkie.length).toBeGreaterThan(3);
    expect(miejsceNa(st, w, 'pracownia')).toEqual(wszystkie[0]);
    for (const m of wszystkie) expect(canPlace(st, w, 'pracownia', m.x, m.y, m.rot).ok).toBe(true);
  });

  it('unikaj: pierwsze miejsce, którego obrys omija podane kafelki, a gdy takiego nie ma, pierwsze w ogóle', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    const pierwsze = miejsceNa(st, w, 'pracownia')!;
    const kafelki = new Set([pierwsze.y * w.size + pierwsze.x]);
    const inne = miejsceNa(st, w, 'pracownia', undefined, kafelki)!;
    expect(inne).not.toEqual(pierwsze);
    // obrys pracowni (2 × 1 albo 1 × 2) nie zawiera unikanego kafelka
    const obrys =
      inne.rot % 2
        ? [inne.y * w.size + inne.x, (inne.y + 1) * w.size + inne.x]
        : [inne.y * w.size + inne.x, inne.y * w.size + inne.x + 1];
    for (const i of obrys) expect(kafelki.has(i)).toBe(false);
    // wszystkie kafelki mapy do uniknięcia: nie ma miejsca omijającego, więc pierwsze w ogóle
    const wszystkie = new Set(Array.from({ length: w.size * w.size }, (_, i) => i));
    expect(miejsceNa(st, w, 'pracownia', undefined, wszystkie)).toEqual(pierwsze);
    // pusty zbiór nic nie zmienia
    expect(miejsceNa(st, w, 'pracownia', undefined, new Set())).toEqual(pierwsze);
  });
});

describe('rozbiórka śmieci na materiał do planu', () => {
  /** gra tuż po pierwszej turze warstwy (plan pracowni stoi), dzień 2, 9:00; bez sterty rozbieralnej poza podaną */
  function graZPlanem(): GraAi {
    const g = nowaGraAi(demoWorld('zielonki'), 12);
    grajDo(g, silnik, tickDnia(2, 9));
    const st = g.sim.st;
    expect(st.builds.some((b) => b.kind === 'pracownia')).toBe(true);
    // materiałów brakuje (planu nie da się zacząć), a rozbieralnych stert nie ma, dopóki test jakiejś nie doda
    for (const t of st.things) if (t.kind === 'deski') t.n = 0;
    st.things = st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'gruz' && t.kind !== 'smieci');
    for (const p of st.pawns) if (p.job?.t === 'dismantle') p.job = null;
    st.cmds.length = 0;
    return g;
  }

  it('brakujące deski: najbliższa wolna osoba dostaje rozbiórkę gruzu, który je da, raz na sekundę warstwy', () => {
    const g = graZPlanem();
    const st = g.sim.st;
    const gruz = rzecz(g, 'gruz', 195, 199, 8);
    st.things.push(gruz);
    const s = szpieg();
    turaZimy(g, s.r);
    expect(s.ruchy).toHaveLength(1);
    expect(s.ruchy[0]).toContain('"t":"dismantle"');
    expect(s.ruchy[0]).toContain(`"thing":${gruz.id}`);
    // wskazany pionek to ktoś z zarządu, kto nie śpi ani nie stoi na warcie
    const wskazany = JSON.parse(s.ruchy[0].replace('polecenie:', '')).ids[0];
    const pionek = st.pawns.find((p) => p.id === wskazany)!;
    expect(pionek.kind).toBe('core');
    expect(['sleep', 'guard']).not.toContain(pionek.job?.t);
  });

  it('nikt już nie rozbiera, gdy deski starczają albo gdy ktoś rozbiera', () => {
    const g = graZPlanem();
    const st = g.sim.st;
    st.things.push(rzecz(g, 'gruz', 195, 199, 8));
    // starczy desek na pracownię (14) i części (4)
    st.things.push(rzecz(g, 'deski', 195, 198, 20), rzecz(g, 'czesci', 195, 197, 10));
    const s = szpieg();
    turaZimy(g, s.r);
    expect(s.ruchy).toEqual([]);
  });

  it('sterta, do której nikt nie doszedł, nie dostaje rozbiórki w kółko: najwyżej dwa razy', () => {
    const g = graZPlanem();
    const st = g.sim.st;
    // gruz w ścianie domu: polecenie nie ma drogi (kafelek jest zablokowany), więc sterta zostaje na miejscu
    const h = houseOf(g.w)!;
    const size = g.w.size;
    let sciana = -1;
    for (let i = 0; i < size * size && sciana < 0; i++) {
      if (h.room[i] < 0) continue;
      sciana = [i - 1, i + 1, i - size, i + size].find((n) => g.w.blocked[n] && h.room[n] < 0) ?? -1;
    }
    expect(sciana).toBeGreaterThan(0);
    st.things.push(rzecz(g, 'gruz', sciana % size, Math.floor(sciana / size), 8));
    const s = szpieg();
    for (let k = 0; k < 6; k++) turaZimy(g, s.r);
    expect(s.ruchy.filter((x) => x.includes('dismantle')).length).toBe(2);
  });
});

describe('drewno na noc', () => {
  it('drewnoNaNoc liczy jak karta nocy: WOOD_PER_HOUR razy 10 godzin razy liczba palenisk (bez pola jedno)', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const i = wejscie(g);
    expect(i.paleniska).toBeUndefined();
    expect(drewnoNaNoc(i)).toBe(WOOD_PER_HOUR * 10);
    expect(drewnoNaNoc({ ...i, paleniska: 2 })).toBe(WOOD_PER_HOUR * 10 * 2);
    expect(drewnoNaNoc({ ...i, paleniska: 4 })).toBe(WOOD_PER_HOUR * 10 * 4);
  });

  it('progDrewna to zapas na dwie noce: dwa razy drewnoNaNoc', () => {
    const i = wejscie(nowaGraAi(demoWorld('przymorze'), 11));
    expect(progDrewna(i)).toBe(2 * drewnoNaNoc(i));
    expect(progDrewna({ ...i, paleniska: 2 })).toBe(40);
  });

  it('ścinanie na opał rusza poniżej dwóch nocy (nie dopiero poniżej 6), a silnik podstawowy zostaje przy 6', () => {
    const polecenia = (decydent: Decydent, drewno: number): string[] => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      // dzień 2, 10:00: pora na ścinanie; nikt nie ścina, w składzie dokładnie `drewno` sztuk
      grajDo(g, decydent, tickDnia(2, 10));
      expect(hourOf(g.sim.st.tick)).toBe(10);
      for (const p of g.sim.st.pawns) if (p.job?.t === 'chop') p.job = null;
      g.sim.st.things = g.sim.st.things.filter((t) => t.kind !== 'drewno');
      for (const p of g.sim.st.pawns) p.carry = 0;
      for (const t of g.sim.st.things) if (t.kind === 'koza') t.fuel = 0;
      if (drewno > 0) dorzucDrewno(g, drewno);
      g.sim.st.cmds.length = 0;
      g.pamiec.zlecone = -1;
      expect(wejscie(g).stock.wood).toBe(drewno);
      decydent.tura(g, zrobRece(g));
      return g.sim.st.cmds.filter((c) => c.t === 'chop').map((c) => c.t);
    };
    // 15 sztuk: poniżej 20 (dwie noce przy jednym palenisku), powyżej 6
    expect(polecenia(silnik, 15)).toEqual(['chop']);
    expect(polecenia(silnikPodstawowy, 15)).toEqual([]);
    // 25 sztuk to już zapas na dwie noce
    expect(polecenia(silnik, 25)).toEqual([]);
    // poniżej 6 oba ścinają
    expect(polecenia(silnik, 3)).toEqual(['chop']);
    expect(polecenia(silnikPodstawowy, 3)).toEqual(['chop']);
  });
});

describe('droga do kozy z beczki w pokoju zarządu', () => {
  it('Przymorze, ziarno 11: do 9. dnia koza z beczki stoi w pokoju, w którym śpi zarząd', () => {
    const w = demoWorld('przymorze');
    const g = nowaGraAi(w, 11);
    grajDo(g, silnik, 1 * TICKS_PER_DAY);
    expect(kozaWPokoju(g)).toBe(false);
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    expect(g.sim.st.techDone).toContain('t_kozy');
    expect(kozaWPokoju(g)).toBe(true);
    // pracownia stoi (bez niej nie ma badań)
    expect(g.sim.st.things.some((t) => t.kind === 'pracownia')).toBe(true);
  });

  it('Zielonki (dom jednorodzinny, bez klatki), ziarno 12, gra jak w przeglądarce: tak samo do 9. dnia', async () => {
    // w grze świat Zielonek ma na podwórku gruz, z którego rozbiórki wychodzą brakujące deski na pracownię (14 desek)
    const g = await przygotujGre('zielonki', 12, false);
    grajDo(g, silnik, 1 * TICKS_PER_DAY);
    expect(kozaWPokoju(g)).toBe(false);
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    expect(g.sim.st.techDone).toContain('t_kozy');
    expect(kozaWPokoju(g)).toBe(true);
    // dom jednorodzinny: pokój zarządu to zwykły pokój jego mieszkania, bez klatki i bloku
    const h = houseOf(g.w)!;
    expect(h.rooms[pokojZarzadu(g.sim.st, g.w)]).toMatchObject({ kind: 'pokoj', apt: h.home });
    expect(g.gov.over).toBeNull();
  }, 120_000);

  it('Zielonki bez gruzu (świat z adresu): pracownia czeka na brakujące deski, a warstwa nie sypie poleceniami', () => {
    // świat z adresu ma tylko 10–12 desek i garstkę śmieci do rozbiórki: do pracowni (14) brakuje, więc nie ma badań
    // i kozy, ale gra toczy się dalej, a plan pracowni jest jeden i nikt nie rozbiera cudzych mebli
    const g = nowaGraAi(demoWorld('zielonki'), 12, { dziennik: true });
    grajDo(g, silnik, 6 * TICKS_PER_DAY);
    const st = g.sim.st;
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(false);
    expect(st.builds.filter((b) => b.kind === 'pracownia')).toHaveLength(1);
    const polecenia = g.dziennik!.filter((m) => m.t === 'polecenie').map((m) => (m.t === 'polecenie' ? m.c.t : ''));
    expect(polecenia.filter((c) => c === 'build')).toHaveLength(1);
    // rozbiórka tylko tej garstki śmieci, która jest, nie co 30 sekund w kółko
    expect(polecenia.filter((c) => c === 'dismantle').length).toBeLessThanOrEqual(3);
    expect(polecenia).not.toContain('research');
    expect(g.gov.over).toBeNull();
  });

  it('pracownia nie zajmuje miejsc pod kozę z beczki w pokoju zarządu, jeśli jest inne miejsce', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { w } = g;
    const st = g.sim.st;
    grajDo(g, silnik, 700);
    const plan = st.builds.find((b) => b.kind === 'pracownia')!;
    expect(plan).toBeDefined();
    // kafelki, na których koza z beczki mogłaby stanąć po badaniu
    const bezPracowni = { ...st, builds: [], techDone: ['t_kozy'] };
    const kozy = miejscaNa(bezPracowni, w, 'koza_beczka', pokojZarzadu(st, w)).map((m) => m.y * w.size + m.x);
    expect(kozy.length).toBeGreaterThan(2);
    const obrys =
      plan.rot % 2
        ? [plan.y * w.size + plan.x, (plan.y + 1) * w.size + plan.x]
        : [plan.y * w.size + plan.x, plan.y * w.size + plan.x + 1];
    for (const i of obrys) expect(kozy, `pracownia na kafelku ${i}`).not.toContain(i);
  });

  it('Zielonki, ziarno 14, gra jak w przeglądarce: koza z beczki ma skąd być zbudowana i stoi do 9. dnia', async () => {
    // tu pierwsze miejsce na kozę zasłaniały pracownia i łóżka ze wszystkich stron: plan stał do końca gry
    const g = await przygotujGre('zielonki', 14, false);
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    expect(g.sim.st.techDone).toContain('t_kozy');
    expect(kozaWPokoju(g)).toBe(true);
    expect(g.sim.st.builds.filter((b) => b.kind === 'koza_beczka')).toHaveLength(0);
  }, 120_000);

  it('jedna koza z beczki w pokoju: warstwa nie stawia drugiej, gdy pierwsza już stoi', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    grajDo(g, silnik, 11 * TICKS_PER_DAY);
    expect(kozaWPokoju(g)).toBe(true);
    expect(g.sim.st.things.filter((t) => t.kind === 'koza_beczka')).toHaveLength(1);
    expect(g.sim.st.builds.filter((b) => b.kind === 'koza_beczka')).toHaveLength(0);
  });
});

describe('dyżur przy kozie na karcie nocy', () => {
  it('od 6. nocy przy drewnie na noc ktoś ma dyżur przy kozie (o 21:00 stoi na posterunku „koza”)', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const kontrola: { noc: number; drewno: number; potrzeba: number; dyzur: boolean }[] = [];
    // noce 6–8: o 21:00 karta z 20:00 jest już zatwierdzona
    for (const dzien of [6, 7, 8]) {
      grajDo(g, silnik, tickDnia(dzien, 21));
      expect(hourOf(g.sim.st.tick)).toBe(21);
      expect(dayOf(g.sim.st.tick)).toBe(dzien);
      const i = wejscie(g);
      kontrola.push({
        noc: dzien,
        drewno: i.stock.wood,
        potrzeba: drewnoNaNoc(i),
        dyzur: i.people.some((p) => p.post === 'koza'),
      });
    }
    // przy drewnie na noc dyżur jest; test nie może przejść bez żadnej nocy z drewnem
    const zDrewnem = kontrola.filter((k) => k.drewno >= k.potrzeba);
    expect(zDrewnem.length).toBeGreaterThanOrEqual(2);
    for (const k of zDrewnem) expect(k.dyzur, `noc ${k.noc}: ${JSON.stringify(k)}`).toBe(true);
  });

  it('wybiera najbardziej wypoczętą osobę ze zdrowiem co najmniej 40', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { ruchy, karta } = dyzurNaPierwszejKarcie(g, tickDnia(6, 0), (gr, p) => {
      dorzucDrewno(gr);
      // wypoczęcie: pierwsza osoba najwyższe, ale chora (30), druga drugie, reszta mniej
      ustawKarte(gr, p, [90, 80, 70, 60], [30]);
    });
    expect(ruchy).toEqual([`noc:${karta.card.people[1].id}=${KOZA_KEY}`]);
  });

  it('osoba już na warcie przy siatce nie dostaje drugiego przydziału, na wyprawie też nie', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { ruchy, karta } = dyzurNaPierwszejKarcie(g, tickDnia(6, 0), (gr, p) => {
      dorzucDrewno(gr);
      ustawKarte(gr, p, [95, 90, 80, 70]);
      gr.gov.night!.assign[p.card.people[0].id] = 'warta:brama';
      gr.gov.night!.assign[p.card.people[1].id] = 'wyprawa:blisko';
    });
    expect(ruchy).toEqual([`noc:${karta.card.people[2].id}=${KOZA_KEY}`]);
  });

  it('bez drewna na noc nie ma dyżuru, z drewnem jest', () => {
    const bezDrewna = nowaGraAi(demoWorld('przymorze'), 11);
    const brak = dyzurNaPierwszejKarcie(bezDrewna, tickDnia(6, 0), (gr, p) => {
      gr.sim.st.things = gr.sim.st.things.filter((t) => t.kind !== 'drewno');
      for (const q of gr.sim.st.pawns) q.carry = 0;
      for (const t of gr.sim.st.things) if (t.kind === 'koza' || t.kind === 'koza_beczka') t.fuel = 0;
      ustawKarte(gr, p, [90, 80, 70, 60]);
      expect(wejscie(gr).stock.wood).toBe(0);
    });
    expect(brak.ruchy).toEqual([]);

    const zDrewnem = nowaGraAi(demoWorld('przymorze'), 11);
    const jest = dyzurNaPierwszejKarcie(zDrewnem, tickDnia(6, 0), (gr, p) => {
      dorzucDrewno(gr);
      ustawKarte(gr, p, [90, 80, 70, 60]);
    });
    expect(jest.ruchy).toHaveLength(1);
    expect(jest.ruchy[0]).toContain(KOZA_KEY);
  });

  it('w pierwszą, ciepłą noc dyżur nie jest potrzebny, nawet gdy drewna jest dużo', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    let zewnatrz = 0;
    const wynik = dyzurNaPierwszejKarcie(g, 0, (gr, p) => {
      dorzucDrewno(gr);
      ustawKarte(gr, p, [90, 80, 70, 60]);
      zewnatrz = wejscie(gr).outdoor;
    });
    expect(zewnatrz).toBeGreaterThan(8);
    expect(wynik.ruchy).toEqual([]);
  });

  it('nikt ze zdrowiem co najmniej 40: nie ma dyżuru', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const nikt = dyzurNaPierwszejKarcie(g, tickDnia(6, 0), (gr, p) => {
      dorzucDrewno(gr);
      ustawKarte(gr, p, [90, 80, 70, 60], 39);
    });
    expect(nikt.ruchy).toEqual([]);
  });

  it('gdy tylko strażnik przy siatce jest zdrowy, dyżur przy kozie ma pierwszeństwo przed strażą', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { ruchy, karta } = dyzurNaPierwszejKarcie(g, tickDnia(6, 0), (gr, p) => {
      dorzucDrewno(gr);
      ustawKarte(gr, p, [95, 80, 70, 60], zdroweTylko(p, 0));
      gr.gov.night!.assign[p.card.people[0].id] = 'warta:brama';
    });
    expect(ruchy).toEqual([`noc:${karta.card.people[0].id}=${KOZA_KEY}`]);
  });

  describe('cała karta: kolejność dyżuru i warty przy siatce', () => {
    const wartyPrzySiatce = (a: Record<string, string>): string[] =>
      Object.entries(a)
        .filter(([, k]) => k.startsWith('warta:') && k !== KOZA_KEY)
        .map(([id]) => id);
    const dyzurni = (a: Record<string, string>): string[] =>
      Object.entries(a)
        .filter(([, k]) => k === KOZA_KEY)
        .map(([id]) => id);

    it('jedna zdrowa osoba: staje przy kozie, a siatka zostaje bez warty', () => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      let ludzie: string[] = [];
      const a = przydzialPoOknie(g, tickDnia(6, 0), (gr, p) => {
        dorzucDrewno(gr);
        ludzie = p.card.people.map((o) => o.id);
        // zdrowa jest osoba najmniej wypoczęta: wybór nie zależy od wypoczęcia, tylko od zdrowia
        ustawKarte(gr, p, [90, 80, 70, 50], zdroweTylko(p, 3));
      });
      expect(dyzurni(a)).toEqual([ludzie[3]]);
      expect(wartyPrzySiatce(a)).toEqual([]);
    });

    it('dwie zdrowe osoby: jedna przy kozie, druga na warcie przy siatce', () => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      let ludzie: string[] = [];
      const a = przydzialPoOknie(g, tickDnia(6, 0), (gr, p) => {
        dorzucDrewno(gr);
        ludzie = p.card.people.map((o) => o.id);
        ustawKarte(gr, p, [90, 80, 70, 60], zdroweTylko(p, 1, 3));
      });
      expect(dyzurni(a)).toHaveLength(1);
      expect(wartyPrzySiatce(a)).toHaveLength(1);
      expect([...dyzurni(a), ...wartyPrzySiatce(a)].sort()).toEqual([ludzie[1], ludzie[3]].sort());
      // przy kozie najbardziej wypoczęta z nich
      expect(dyzurni(a)).toEqual([ludzie[1]]);
    });

    it('osoba na wyprawie nie zostaje strażnikiem przy siatce, nawet gdy jest najbardziej wypoczęta', () => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      let ludzie: string[] = [];
      const a = przydzialPoOknie(g, tickDnia(6, 0), (gr, p) => {
        dorzucDrewno(gr);
        ludzie = p.card.people.map((o) => o.id);
        ustawKarte(gr, p, [99, 90, 80, 70]);
        gr.gov.night!.assign[ludzie[0]] = 'wyprawa:blisko';
      });
      expect(a[ludzie[0]]).toBe('wyprawa:blisko');
      expect(dyzurni(a)).toEqual([ludzie[1]]);
      expect(wartyPrzySiatce(a)).toEqual([ludzie[2]]);
    });

    it('wszyscy zdrowi: dyżur i warta przy siatce, reszta śpi', () => {
      const g = nowaGraAi(demoWorld('przymorze'), 11);
      const a = przydzialPoOknie(g, tickDnia(6, 0), (gr, p) => {
        dorzucDrewno(gr);
        ustawKarte(gr, p, [90, 80, 70, 60]);
      });
      expect(dyzurni(a)).toHaveLength(1);
      expect(wartyPrzySiatce(a)).toHaveLength(1);
    });
  });

  it('karta bez opcji dyżuru przy kozie: polecenie guard na posterunku „koza” dla pionka tej osoby', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    const { ruchy, karta } = dyzurNaPierwszejKarcie(
      g,
      tickDnia(6, 0),
      (gr, p) => {
        dorzucDrewno(gr);
        ustawKarte(gr, p, [90, 80, 70, 60]);
        for (const o of p.card.people) o.options = o.options.filter((x) => x.key !== KOZA_KEY);
      },
      [KOZA_KEY],
    );
    const osoba = karta.card.people[0];
    const pionek = g.sim.st.pawns.find((p) => g.sim.st.people[p.person].id === osoba.id)!;
    expect(ruchy).toEqual([`polecenie:${JSON.stringify({ t: 'guard', ids: [pionek.id], post: 'koza' })}`]);
  });

  it('w prawdziwej grze dyżur trzyma ogień: koza z beczki pali się przez całą noc 10., a wartownik przy bramie dalej stoi', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    grajDo(g, silnik, tickDnia(10, 19));
    expect(kozaWPokoju(g)).toBe(true);
    const beczka = g.sim.st.things.find((t) => t.kind === 'koza_beczka')!;
    let zapalona = 0;
    let probek = 0;
    // noc 10: od 23:00 do 5:00 co 10 s przy ekranie
    grajDo(g, silnik, tickDnia(10, 23));
    while (g.sim.st.tick < tickDnia(11, 5)) {
      grajDo(g, silnik, g.sim.st.tick + 10 * TICKS_PER_SECOND);
      probek++;
      if (beczka.fuel > 0) zapalona++;
    }
    expect(probek).toBeGreaterThan(20);
    expect(zapalona / probek).toBeGreaterThan(0.9);
    expect(wejscie(g).people.some((p) => p.post === 'koza' || p.post === 'brama')).toBe(true);
  });
});

describe('determinizm i koszt warstwy', () => {
  it('zapis i wczytanie w połowie (po planie pracowni i w środku budowy kozy) nie zmieniają przebiegu', () => {
    const w = demoWorld('przymorze');
    const ciagla = nowaGraAi(w, 11);
    grajDo(ciagla, silnik, 7 * TICKS_PER_DAY);
    for (const przerwa of [2 * TICKS_PER_DAY + 4000, 4 * TICKS_PER_DAY + 9100]) {
      const a = nowaGraAi(w, 11);
      grajDo(a, silnik, przerwa);
      const b = wczytajGre(w, JSON.parse(JSON.stringify(zapiszGre(a))) as ZapisGryAi);
      expect(b.pamiec).toEqual(a.pamiec);
      grajDo(b, silnik, 7 * TICKS_PER_DAY);
      expect(skrotGry(b)).toBe(skrotGry(ciagla));
    }
  });

  it('warstwa zimy rusza tylko co 30 sekund przy ekranie (600 ticków): polecenia budowy i badań tylko na tych sekundach', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { dziennik: true });
    grajDo(g, silnik, 9 * TICKS_PER_DAY);
    const warstwy = g.dziennik!.filter((m) => m.t === 'polecenie' && (m.c.t === 'build' || m.c.t === 'research'));
    // pracownia, wybór badania, koza z beczki
    expect(warstwy.length).toBeGreaterThanOrEqual(3);
    for (const m of warstwy) expect(m.s % 30, JSON.stringify(m)).toBe(0);
    // licznik w pamięci: jedno wywołanie na 30 s przy ekranie, ani jednego więcej
    const licznik = g.pamiec.wywolania?.zima ?? 0;
    expect(licznik).toBeGreaterThan(0);
    expect(licznik).toBeLessThanOrEqual(Math.floor((9 * TICKS_PER_DAY) / (30 * TICKS_PER_SECOND)));
  });

  it('turaZimy bez zadań (koza stoi, nic do badania) nie wydaje żadnego polecenia', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    grajDo(g, silnik, 11 * TICKS_PER_DAY);
    expect(kozaWPokoju(g)).toBe(true);
    const s = szpieg();
    turaZimy(g, s.r);
    expect(s.ruchy).toEqual([]);
  });
});
