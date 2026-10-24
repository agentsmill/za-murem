/* Rozdział R3 „Praca” ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R3”) na prawdziwej
   symulacji z zarządem: Przymorze, Lanciego i Zielonki w obu trybach. Rozdział uczy panelu Pracy: priorytetów rodzajów
   pracy (`priorytet`), stałego zajęcia z karty osoby (`stale`) i progów zapasów (`zapas`). Warunki czytają `st.praca`, czyli
   to, co zostawiają polecenia ustawień (`prio`, `stale`, `prog`) z panelu Pracy i z karty osoby; każdy cel ma test „fałsz
   przed ustawieniem, prawda po nim”, a ustawienie równe domyślnemu (które symulacja zdejmuje) niczego nie zalicza.

   Cel „Pozwólcie drwalowi wychodzić za siatkę” (R3.4 `zasiatke` z pierwszego projektu) nie istnieje w żadnym trybie:
   Mateusz 19.10.2026 o 18:50 ustawił przełącznik „może wychodzić za siatkę” jako domyślnie włączony w trybie zwykłym i
   wyłączony w zombie, więc w zwykłym trybie cel zaliczałby się sam, a w zombie projekt go nie chce. Zamiast niego
   podpowiedź stałego zajęcia mówi jednym zdaniem o przełączniku obok (w zwykłym trybie za dnia ludzie sami wychodzą za
   siatkę, w zombie to ryzyko ugryzienia).

   Do tego: R3 stoi między R2 a R4 i jest tylko tam, gdzie gra ma rodzaje pracy w panelu; stare zapisy ścieżki bez R3 dalej
   działają (otwarty R4 i późniejsze zostają, a „koniec” po R2 otwiera R3); automat pracy (Szaber) sam przeszukuje pomieszczenie
   i zalicza R1 „przeszukaj” bez polecenia gracza, nie psując rozdziału ani nie zaliczając nic z R3; teksty w obu językach, na
   myszy i na dotyku, w bloku i w domu; i jedna angielska para dla „Zapytać o rękę” (wędrowiec przy siatce i spotkanie z
   sąsiadami), ta sama w słowniczku. Werbunek w okazji wędrowca (O1.2, O1.3) sprawdza sciezka-okazje.test.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WYBOR } from '../../src/content/napisy-sasiedzi.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { PROGI_DOMYSLNE, type Priorytet, type Progi, RODZAJE, type RodzajPracy } from '../../src/sim/praca.ts';
import type { Pawn } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { NAPISY } from '../../src/sim/wedrowcy.ts';
import { pracaKartaHtml } from '../../src/ui/karta.ts';
import { KROK_PROGU, nastepnyPriorytet, nazwaRodzaju, pracaPanelHtml, widokPracy } from '../../src/ui/praca.ts';
import {
  type KluczRozdzialu,
  krokSciezki,
  licznikiStartu,
  nowyStanSciezki,
  type StanSciezki,
} from '../../src/ui/sciezka.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import { FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { core as rdzen } from './sasiedzi-pomoc.ts';
import {
  cel,
  cele,
  DEMA,
  type Demo,
  type Gra,
  graj,
  krok,
  odczyt,
  otworz,
  poPierwszymRaporcie,
  przezZapis,
  TRYBY,
  wDomu,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const KOMBINACJE = DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));

/** gra po pierwszym raporcie (drugi dzień rano) z otwartym rozdziałem `k` */
function wRozdziale(key: Demo, mode: GameMode, k: KluczRozdzialu): Gra {
  const g = poPierwszymRaporcie(key, mode);
  otworz(g, k);
  return g;
}

const klucze = (g: Gra): string[] => cele(g).map((c) => c.key);
/** Czy cel R3 jest zaliczony po kroku ścieżki: ze stanu ścieżki, nie z widoku (po ostatnim celu rozdział się zamyka, a widok
    pokazuje już R4). */
const zaliczony3 = (g: Gra, k: 'priorytet' | 'stale' | 'zapas'): boolean => Object.hasOwn(krok(g).zrobione, `r3.${k}`);
const zrobione = (g: Gra, k: KluczRozdzialu): string[] =>
  Object.keys(g.sciezka.zrobione)
    .filter((x) => x.startsWith(`${k}.`))
    .sort();

/* ---------------------------------------------------------------- to, co robi gracz w panelu Pracy i na karcie osoby */

/** Klik w komórkę panelu Pracy: następny priorytet po tym, który panel pokazuje (`nastepnyPriorytet`), polecenie `prio` jak
    w main.ts (`onPrio`); polecenie wchodzi do symulacji z następnym krokiem. Zwraca ustawiony priorytet. */
function kliknijKomorke(g: Gra, kto: Pawn, rodzaj: RodzajPracy): Priorytet {
  const osoba = odczyt(g).snap.people.find((p) => p.pawn === kto.id)!;
  const prio = nastepnyPriorytet(osoba.praca.prio[RODZAJE.indexOf(rodzaj)]);
  g.sim.push({ t: 'prio', ids: [], osoba: kto.person, rodzaj, prio });
  g.sim.step();
  return prio;
}

/** Wybór stałego zajęcia na karcie osoby (lista rozwijana; pusty wybór zdejmuje), polecenie `stale` jak w main.ts. */
function wybierzStale(g: Gra, kto: Pawn, rodzaj: RodzajPracy | null): void {
  g.sim.push({ t: 'stale', ids: [], osoba: kto.person, rodzaj });
  g.sim.step();
}

/** Plus przy progu zapasu w panelu Pracy (o `KROK_PROGU` od progu, który panel pokazuje), polecenie `prog` jak w main.ts. */
function plusProg(g: Gra, co: keyof Progi): number {
  const n = odczyt(g).snap.praca.progi[co] + KROK_PROGU;
  g.sim.push({ t: 'prog', ids: [], co, n });
  g.sim.step();
  return n;
}

/** Przełącznik „może wychodzić za siatkę” na karcie osoby albo w panelu: odwrotność tego, co pokazuje, polecenie `zasiatke`. */
function przelaczZaSiatke(g: Gra, kto: Pawn): void {
  const teraz = odczyt(g).snap.people.find((p) => p.pawn === kto.id)!.praca.zaSiatke;
  g.sim.push({ t: 'zasiatke', ids: [], osoba: kto.person, on: !teraz });
  g.sim.step();
}

/* ---------------------------------------------------------------- miejsce na ścieżce */

describe('R3 „Praca”: miejsce na ścieżce', () => {
  it('ROZDZIALY ma R3 między R2 a R4, z tytułem „Praca” / “Work” i trzema celami', () => {
    expect(ROZDZIALY.map((r) => r.k)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
    const r3 = ROZDZIALY.find((r) => r.k === 'r3')!;
    expect(r3.cele.map((c) => c.key)).toEqual(['priorytet', 'stale', 'zapas']);
    // otwiera się po R2 jak zwykły rozdział, bez własnego warunku
    expect(r3.otwiera).toBeUndefined();
    const g = wRozdziale('przymorze', 'zwykly', 'r3');
    expect(widok(g).rozdzial!.tytul).toBe('Praca');
    ustawJezyk('en');
    expect(widok(g).rozdzial!.tytul).toBe('Work');
  });

  it('rozdział jest tylko tam, gdzie gra ma rodzaje pracy w panelu (RODZAJE): z kolumnami panelu jest, bez nich go nie ma', () => {
    expect(RODZAJE.length).toBeGreaterThan(0);
    const r3 = ROZDZIALY.find((r) => r.k === 'r3')!;
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    const o = odczyt(g);
    expect(o.snap.praca.widoczne.length).toBeGreaterThan(0);
    expect(r3.jest?.(o)).toBe(true);
    const bezPanelu = { ...o, snap: { ...o.snap, praca: { ...o.snap.praca, widoczne: [] } } };
    expect(r3.jest?.(bezPanelu)).toBe(false);
  });

  it('z modułem pracy ścieżka idzie z R2 przez R3 do R4, bez niego z R2 prosto do R4', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    const r2 = ROZDZIALY.find((r) => r.k === 'r2')!;
    const stan = (): StanSciezki => ({
      ...nowyStanSciezki(),
      rozdzial: 'r2',
      od: g.sim.st.tick,
      zrobione: Object.fromEntries(r2.cele.map((c) => [`r2.${c.key}`, g.sim.st.tick - 10])),
    });
    const o = odczyt(g);
    const bezPanelu = { ...o, snap: { ...o.snap, praca: { ...o.snap.praca, widoczne: [] } } };
    expect(krokSciezki(stan(), bezPanelu).rozdzial).toBe('r4');
    const z = krokSciezki(stan(), o);
    expect(z.rozdzial).toBe('r3');
    expect(z.od).toBe(g.sim.st.tick);
    expect(z.start).toEqual(licznikiStartu(g.sim.st, g.gov));
  });

  it('R3 nie ma terminów, czekania ani okien: nic w nim nie przepada i każdy cel da się ruszyć od razu', () => {
    const r3 = ROZDZIALY.find((r) => r.k === 'r3')!;
    for (const c of r3.cele) {
      expect(c.przepadl, c.key).toBeUndefined();
      expect(c.czeka, c.key).toBeUndefined();
      expect(c.okno, c.key).toBeUndefined();
      expect(c.jest, c.key).toBeUndefined();
    }
  });
});

/* ---------------------------------------------------------------- cele */

describe.each(KOMBINACJE)('R3 „Praca”: %s %s', (key, mode) => {
  const zombie = mode === 'zombie';

  it('trzy cele w kolejności, bez „za siatkę”, żaden niezrobiony, bieżący to pierwszy', () => {
    const g = wRozdziale(key, mode, 'r3');
    const w = widok(g).rozdzial!;
    expect(w.k).toBe('r3');
    expect(klucze(g)).toEqual(['priorytet', 'stale', 'zapas']);
    expect(w.cele.every((c) => !c.done && !c.czeka && !c.missed)).toBe(true);
    expect(w.biezacy?.key).toBe('priorytet');
    // przełącznik „za siatkę” nie jest celem w żadnym trybie (domyślnie włączony w zwykłym, wyłączony w zombie)
    expect(klucze(g)).not.toContain('zasiatke');
    expect(g.sim.st.praca).toBeUndefined();
  });

  it('priorytet: fałsz przed kliknięciem komórki panelu, prawda po nim; stałe zajęcie, próg i „za siatkę” go nie zaliczają', () => {
    const g = wRozdziale(key, mode, 'r3');
    const [a, b] = rdzen(g.sim);
    expect(zaliczony3(g, 'priorytet')).toBe(false);
    // inne ustawienia pracy tego celu nie ruszają
    wybierzStale(g, a, 'drwal');
    plusProg(g, 'drewno');
    przelaczZaSiatke(g, b);
    expect(g.sim.st.praca?.osoby).toBeDefined();
    expect(zaliczony3(g, 'priorytet'), 'stałe zajęcie, próg i przełącznik').toBe(false);
    // klik w komórkę (Kuchnia, druga osoba): priorytet inny niż domyślny zostaje w ustawieniach
    const prio = kliknijKomorke(g, b, 'kuchnia');
    const ja = odczyt(g).snap.people.find((p) => p.pawn === b.id)!;
    expect(ja.praca.prio[RODZAJE.indexOf('kuchnia')]).toBe(prio);
    expect(g.sim.st.praca!.osoby![b.person].prio).toEqual({ kuchnia: prio });
    expect(zaliczony3(g, 'priorytet')).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r3.priorytet']);
  });

  it('priorytet: ustawienie równe domyślnemu symulacja zdejmuje, więc niczego nie zalicza; polecenie spoza panelu też nie', () => {
    const g = wRozdziale(key, mode, 'r3');
    const kto = rdzen(g.sim)[0];
    const ja = odczyt(g).snap.people.find((p) => p.pawn === kto.id)!;
    // „Noszenie” i „Szaber” mają domyślnie 3
    expect(ja.praca.prio[RODZAJE.indexOf('szaber')]).toBe(3);
    g.sim.push({ t: 'prio', ids: [], osoba: kto.person, rodzaj: 'szaber', prio: 3 });
    g.sim.push({ t: 'prio', ids: [], osoba: kto.person, rodzaj: 'szaber', prio: 9 as Priorytet });
    g.sim.push({ t: 'prio', ids: [], osoba: 999, rodzaj: 'szaber', prio: 4 });
    g.sim.step();
    expect(g.sim.st.praca).toBeUndefined();
    expect(zaliczony3(g, 'priorytet')).toBe(false);
    // dopiero prawdziwa zmiana (Szaber 3 → 4: kolejność pracy ta sama, ale zmiana zapisana) zalicza
    g.sim.push({ t: 'prio', ids: [], osoba: kto.person, rodzaj: 'szaber', prio: 4 });
    g.sim.step();
    expect(g.sim.st.praca!.osoby![kto.person].prio).toEqual({ szaber: 4 });
    expect(zaliczony3(g, 'priorytet')).toBe(true);
  });

  it('stale: fałsz przed wyborem na karcie osoby, prawda po nim; priorytet, próg i „za siatkę” go nie zaliczają', () => {
    const g = wRozdziale(key, mode, 'r3');
    const [a, b] = rdzen(g.sim);
    expect(zaliczony3(g, 'stale')).toBe(false);
    kliknijKomorke(g, a, 'kuchnia');
    plusProg(g, 'czesci');
    przelaczZaSiatke(g, b);
    expect(zaliczony3(g, 'stale'), 'priorytet, próg i przełącznik').toBe(false);
    // lista rozwijana ma „brak”: pusty wybór nic nie zmienia
    wybierzStale(g, b, null);
    expect(zaliczony3(g, 'stale')).toBe(false);
    wybierzStale(g, b, 'szaber');
    expect(odczyt(g).snap.people.find((p) => p.pawn === b.id)!.praca.stale).toBe('szaber');
    expect(zaliczony3(g, 'stale')).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r3.stale']);
  });

  it('zapas: fałsz przed zmianą progu w panelu, prawda po plusie; próg równy domyślnemu symulacja zdejmuje i nie zalicza', () => {
    const g = wRozdziale(key, mode, 'r3');
    const [a] = rdzen(g.sim);
    expect(zaliczony3(g, 'zapas')).toBe(false);
    kliknijKomorke(g, a, 'kuchnia');
    wybierzStale(g, a, 'drwal');
    przelaczZaSiatke(g, a);
    expect(zaliczony3(g, 'zapas'), 'priorytet, stałe zajęcie i przełącznik').toBe(false);
    // próg równy domyślnemu: symulacja zdejmuje wpis
    g.sim.push({ t: 'prog', ids: [], co: 'drewno', n: PROGI_DOMYSLNE.drewno });
    g.sim.step();
    expect(g.sim.st.praca?.progi).toBeUndefined();
    expect(zaliczony3(g, 'zapas')).toBe(false);
    const n = plusProg(g, 'deski');
    expect(n).toBe(PROGI_DOMYSLNE.deski + KROK_PROGU);
    expect(g.sim.st.praca!.progi).toEqual({ deski: n });
    expect(zaliczony3(g, 'zapas')).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r3.zapas']);
  });

  it('zaliczenie jest trwałe: cofnięcie ustawień do domyślnych go nie cofa, także po zapisie i wczytaniu', () => {
    const g = wRozdziale(key, mode, 'r3');
    const [a] = rdzen(g.sim);
    wybierzStale(g, a, 'drwal');
    plusProg(g, 'drewno');
    kliknijKomorke(g, a, 'kuchnia');
    krok(g);
    // wszystkie trzy zaliczone zamknęły rozdział; stan ścieżki trzyma zaliczenia
    expect(zrobione(g, 'r3')).toEqual(['r3.priorytet', 'r3.stale', 'r3.zapas']);
    expect(g.sciezka.rozdzial).toBe('r4');
    // ustawienia z powrotem na domyślne (pięć kliknięć w tę samą komórkę wraca do tego samego priorytetu)
    wybierzStale(g, a, null);
    g.sim.push({ t: 'prog', ids: [], co: 'drewno', n: PROGI_DOMYSLNE.drewno });
    for (let k = 0; k < 4; k++) kliknijKomorke(g, a, 'kuchnia');
    expect(g.sim.st.praca).toBeUndefined();
    krok(g);
    expect(zrobione(g, 'r3')).toEqual(['r3.priorytet', 'r3.stale', 'r3.zapas']);
    const h = przezZapis(g);
    expect(Object.keys(krok(h).zrobione).filter((x) => x.startsWith('r3.'))).toHaveLength(3);
  });

  it('przełącznik „za siatkę” nie zalicza żadnego celu rozdziału ani w jedną, ani w drugą stronę', () => {
    const g = wRozdziale(key, mode, 'r3');
    for (const kto of rdzen(g.sim)) {
      przelaczZaSiatke(g, kto);
      przelaczZaSiatke(g, kto);
      przelaczZaSiatke(g, kto);
    }
    expect(Object.keys(g.sim.st.praca?.osoby ?? {}).length).toBeGreaterThan(0);
    expect(cele(g).every((c) => !c.done)).toBe(true);
    expect(g.sciezka.rozdzial).toBe('r3');
  });

  it('ustawienia zrobione przed otwarciem rozdziału zaliczają jego cele od razu i zamykają go', () => {
    const g = poPierwszymRaporcie(key, mode);
    const [a, b] = rdzen(g.sim);
    kliknijKomorke(g, a, 'kuchnia');
    wybierzStale(g, b, 'ogien');
    plusProg(g, 'czesci');
    otworz(g, 'r3');
    expect(zrobione(g, 'r3')).toEqual(['r3.priorytet', 'r3.stale', 'r3.zapas']);
    expect(g.sciezka.rozdzial).toBe('r4');
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));
  });

  it('trzy ustawienia po kolei zamykają R3 i otwierają R4 z licznikami z tej chwili', () => {
    const g = wRozdziale(key, mode, 'r3');
    const [a, b] = rdzen(g.sim);
    kliknijKomorke(g, a, 'drwal');
    expect(
      cele(g)
        .filter((c) => c.done)
        .map((c) => c.key),
    ).toEqual(['priorytet']);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('stale');
    wybierzStale(g, b, 'drwal');
    expect(
      cele(g)
        .filter((c) => c.done)
        .map((c) => c.key),
    ).toEqual(['priorytet', 'stale']);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('zapas');
    expect(g.sciezka.rozdzial).toBe('r3');
    plusProg(g, 'drewno');
    krok(g);
    expect(g.sciezka.rozdzial).toBe('r4');
    expect(g.sciezka.od).toBe(g.sim.st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(g.sim.st, g.gov));
    expect(widok(g).rozdzial!.k).toBe('r4');
    expect(zrobione(g, 'r3')).toEqual(['r3.priorytet', 'r3.stale', 'r3.zapas']);
  });

  it('podpowiedź stałego zajęcia mówi jednym zdaniem o przełączniku „za siatkę”: zwykły tryb za dnia wychodzą sami, zombie to ryzyko', () => {
    const g = wRozdziale(key, mode, 'r3');
    const jak = () => cel(g, 'stale').how;
    if (zombie) {
      expect(jak()).toContain('„Może wychodzić za siatkę”: wyłączone.');
      expect(jak()).toContain('Za siatką są szwendacze: kto tam wyjdzie sam, ryzykuje ugryzienie.');
      expect(jak()).not.toContain('za dnia ludzie sami');
      ustawJezyk('en');
      expect(jak()).toContain('“Can go outside the fence”: off.');
      expect(jak()).toContain('There are shamblers outside the fence: anyone who goes out on their own risks a bite.');
    } else {
      expect(jak()).toContain(
        '„Może wychodzić za siatkę”: włączone, więc za dnia ludzie sami wychodzą za siatkę po drewno i łup.',
      );
      expect(jak()).not.toContain('szwendacze');
      ustawJezyk('en');
      expect(jak()).toContain(
        '“Can go outside the fence”: on, so by day people go outside the fence on their own for wood and loot.',
      );
      expect(jak()).not.toContain('shamblers');
    }
  });

  it('teksty: po angielsku bez polskich liter i słówek, w domu bez słów z bloku, bez myślników; mysz i dotyk', () => {
    const g = wRozdziale(key, mode, 'r3');
    const teksty = (touch: boolean): string[] => {
      const r = widok(g, { touch }).rozdzial!;
      return [r.tytul, ...r.cele.flatMap((c) => [c.text, c.how])];
    };
    for (const touch of [false, true]) {
      const pl = teksty(touch);
      for (const t of pl) {
        expect(t, t).not.toMatch(/[—–]/);
        if (wDomu(key)) expect(t, t).not.toMatch(FORBIDDEN_DOM);
        // na dotyku nie ma kliknięcia ani prawego przycisku, na myszy palca
        if (touch) expect(t, t).not.toMatch(/klik|prawy przycisk|prawego przycisku/i);
        else expect(t, t).not.toMatch(/stuk|palec/i);
      }
      ustawJezyk('en');
      const en = teksty(touch);
      ustawJezyk('pl');
      expect(en.length).toBe(pl.length);
      for (const t of en) {
        expect(polskieSlowa(t), t).toEqual([]);
        expect(t, t).not.toMatch(/[—–]/);
        if (touch) expect(t, t).not.toMatch(/click|right-click/i);
        else expect(t, t).not.toMatch(/\btap\b|press and hold/i);
        if (wDomu(key)) expect(t, t).not.toMatch(/\b(flat|stairwell|block)\b/i);
      }
    }
  });

  it('teksty z projektu: tytuły i cele, podpowiedzi na myszy i na dotyku po polsku i po angielsku', () => {
    const g = wRozdziale(key, mode, 'r3');
    // zapas: w zombie przy progach są też dzidy (panel pokazuje je tylko tam)
    const rzeczyPl = zombie ? 'drewnie, deskach, częściach i dzidach' : 'drewnie, deskach i częściach';
    const rzeczyEn = zombie ? 'wood, planks, parts and spears' : 'wood, planks and parts';
    const jak = (k: string, touch: boolean) => cel(g, k, { touch }).how;
    const tekst = (k: string) => cel(g, k).text;
    expect(tekst('priorytet')).toBe('Ustawcie, kto czym zajmuje się sam.');
    expect(tekst('stale')).toBe('Dajcie komuś stałe zajęcie.');
    expect(tekst('zapas')).toBe('Ustawcie, ile czego trzymać w zapasie.');
    expect(jak('priorytet', false)).toBe(
      'Praca (przycisk u góry albo P): klik w komórkę zmienia priorytet, 1 to najpierw, puste: nie robi. Bez rozkazów ludzie biorą prace z tej tabeli po kolei, a polecenie zawsze wygrywa.',
    );
    expect(jak('priorytet', true)).toBe(
      'Przycisk Praca u góry: stuknięcie w komórkę zmienia priorytet, 1 to najpierw, puste: nie robi. Bez rozkazów ludzie biorą prace z tej tabeli po kolei, a polecenie zawsze wygrywa.',
    );
    expect(jak('stale', false)).toMatch(
      /^Na karcie osoby wybierzcie „Stałe zajęcie”, na przykład Drwal albo Szaber: te zlecenia weźmie przed wszystkimi innymi\. Obok jest „Może wychodzić za siatkę”: /,
    );
    expect(jak('stale', true)).toBe(jak('stale', false));
    expect(jak('zapas', false)).toBe(
      `Praca, „Trzymać w zapasie”: plus i minus przy ${rzeczyPl}. Drwal i warsztat pracują do tego progu.`,
    );
    expect(jak('zapas', true)).toBe(
      `Praca, „Trzymać w zapasie”: stuknijcie plus albo minus przy ${rzeczyPl}. Drwal i warsztat pracują do tego progu.`,
    );
    ustawJezyk('en');
    expect(tekst('priorytet')).toBe('Set who does what on their own.');
    expect(tekst('stale')).toBe('Give someone a fixed job.');
    expect(tekst('zapas')).toBe('Set how much to keep in stock.');
    expect(jak('priorytet', false)).toBe(
      'Work (button at the top, or P): click a cell to change the priority; 1 goes first, blank means they won’t do it. With no orders, people take jobs from this table in turn, and an order always comes first.',
    );
    expect(jak('priorytet', true)).toBe(
      'The Work button at the top: tap a cell to change the priority; 1 goes first, blank means they won’t do it. With no orders, people take jobs from this table in turn, and an order always comes first.',
    );
    expect(jak('stale', false)).toMatch(
      /^On a person’s card pick a “Fixed job”, for example Woodcutting or Scavenging: they take those jobs before anything else\. Beside it is “Can go outside the fence”: /,
    );
    expect(jak('stale', true)).toBe(jak('stale', false));
    expect(jak('zapas', false)).toBe(
      `Work, “Keep in stock”: plus and minus beside ${rzeczyEn}. Woodcutters and the workshop work up to that level.`,
    );
    expect(jak('zapas', true)).toBe(
      `Work, “Keep in stock”: tap plus or minus beside ${rzeczyEn}. Woodcutters and the workshop work up to that level.`,
    );
  });

  it('podpowiedzi cytują napisy, które gracz zobaczy w panelu Pracy i na karcie osoby (po polsku i po angielsku)', () => {
    const g = wRozdziale(key, mode, 'r3');
    const o = odczyt(g);
    const kto = o.snap.people[0];
    for (const en of [false, true]) {
      if (en) ustawJezyk('en');
      const t = (pl: string, eng: string) => (en ? eng : pl);
      const panel = pracaPanelHtml(widokPracy(o.snap, { kol: null, zlecen: 0, touch: false }), en);
      const karta = pracaKartaHtml(kto, { widoczne: o.snap.praca.widoczne, zombie });
      // zapas: nagłówek sekcji panelu, o którym mówi cel `zapas`
      expect(panel).toContain(t('Trzymać w zapasie', 'Keep in stock'));
      expect(cel(g, 'zapas').how).toContain(t('„Trzymać w zapasie”', '“Keep in stock”'));
      // stałe zajęcie i przełącznik z karty oraz dwa rodzaje z przykładu (te same nazwy co w liście rozwijanej)
      expect(karta).toContain(t('Stałe zajęcie', 'Fixed job'));
      expect(karta).toContain(t('Może wychodzić za siatkę', 'Can go outside the fence'));
      const stale = cel(g, 'stale').how;
      expect(stale).toContain(t('„Stałe zajęcie”', '“Fixed job”'));
      expect(stale).toContain(t('„Może wychodzić za siatkę”', '“Can go outside the fence”'));
      for (const r of ['drwal', 'szaber'] as const) {
        expect(stale).toContain(nazwaRodzaju(r, en));
        expect(karta).toContain(`>${nazwaRodzaju(r, en)}</option>`);
      }
    }
    ustawJezyk('pl');
    // przycisk i klawisz z podpowiedzi pierwszego celu: „Praca” w górnym pasku i klawisz P
    const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');
    expect(html).toMatch(/id="btnPraca"[^>]*aria-keyshortcuts="P"/);
    expect(cel(g, 'priorytet').how).toContain('Praca (przycisk u góry albo P)');
  });
});

/* ---------------------------------------------------------------- stare zapisy ścieżki, bez R3 */

describe.each(KOMBINACJE)('stare zapisy ścieżki bez R3: %s %s', (key, mode) => {
  /** wpisy zrobionych celów rozdziałów `ks` tak, jak zostawiłaby je wersja bez R3 */
  function wpisy(g: Gra, ks: readonly string[]): Record<string, number> {
    const wynik: Record<string, number> = {};
    for (const r of ROZDZIALY)
      if (ks.includes(r.k))
        for (const c of r.cele) {
          // drewno na wieczór, drewno na noc i dyżur przepadają, jeśli nie zrobiono ich w nocy; reszta jest zrobiona
          if (['r0.drewno', 'r1.drewno2', 'r1.dyzur'].includes(`${r.k}.${c.key}`)) continue;
          wynik[`${r.k}.${c.key}`] = g.sim.st.tick - 4000;
        }
    return wynik;
  }
  const przepadle = ['r0.drewno', 'r1.drewno2', 'r1.dyzur'];

  it('zapis z otwartym R4 (po R2, bez R3) dalej jest w R4: rozdziału Praca nie wstawia przed niego ani za niego', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.sciezka = {
      ...nowyStanSciezki(),
      rozdzial: 'r4',
      od: g.sim.st.tick - 3000,
      start: licznikiStartu(g.sim.st, g.gov),
      zrobione: wpisy(g, ['r0', 'r1', 'r2']),
      przepadle,
    };
    const h = przezZapis(g);
    expect(h.sciezka.rozdzial).toBe('r4');
    expect(krok(h).rozdzial).toBe('r4');
    expect(widok(h).rozdzial!.k).toBe('r4');
    expect(klucze(h)).toEqual(['uchwala', 'wkurzenie', 'nowi', 'ludzie']);
    expect(zrobione(h, 'r3')).toEqual([]);
    // ustawienia pracy po wczytaniu niczego w R3 nie zaliczają: rozdziału nie ma już na drodze
    kliknijKomorke(h, rdzen(h.sim)[0], 'kuchnia');
    krok(h);
    expect(zrobione(h, 'r3')).toEqual([]);
    expect(h.sciezka.rozdzial).toBe('r4');
  });

  it('zapis w „koniec” po R2 (wersja bez późniejszych rozdziałów) otwiera R3 od chwili wczytania, nie R4', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.sciezka = {
      ...nowyStanSciezki(),
      rozdzial: 'koniec',
      od: g.sim.st.tick - 3000,
      zrobione: wpisy(g, ['r0', 'r1', 'r2']),
      przepadle,
    };
    const stare = JSON.parse(JSON.stringify(g.sciezka)) as StanSciezki;
    const h = przezZapis(g);
    expect(h.sciezka.rozdzial).toBe('koniec');
    expect(krok(h).rozdzial).toBe('r3');
    expect(h.sciezka.od).toBe(h.sim.st.tick);
    expect(h.sciezka.start).toEqual(licznikiStartu(h.sim.st, h.gov));
    expect(klucze(h)).toEqual(['priorytet', 'stale', 'zapas']);
    for (const k of Object.keys(stare.zrobione)) expect(h.sciezka.zrobione[k]).toBe(stare.zrobione[k]);
  });

  it('zapis w R2 ze wszystkimi celami zrobionymi (tuż przed zamknięciem) przechodzi przez R3 do R4', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.sciezka = {
      ...nowyStanSciezki(),
      rozdzial: 'r2',
      od: g.sim.st.tick - 3000,
      zrobione: wpisy(g, ['r0', 'r1', 'r2']),
      przepadle,
    };
    const h = przezZapis(g);
    expect(krok(h).rozdzial).toBe('r3');
    kliknijKomorke(h, rdzen(h.sim)[0], 'kuchnia');
    wybierzStale(h, rdzen(h.sim)[1], 'drwal');
    plusProg(h, 'drewno');
    expect(krok(h).rozdzial).toBe('r4');
  });

  it('zapis ukończonej ścieżki bez wpisów R3 zostaje „końcem”: rozdział Praca nie otwiera się wstecz', () => {
    const g = poPierwszymRaporcie(key, mode);
    g.sciezka = {
      ...nowyStanSciezki(),
      rozdzial: 'koniec',
      od: g.sim.st.tick - 50,
      zrobione: wpisy(g, ['r0', 'r1', 'r2', 'r4', 'r5', 'r6', 'r7', 'r8']),
      przepadle,
    };
    const h = przezZapis(g);
    expect(krok(h).rozdzial).toBe('koniec');
    expect(zrobione(h, 'r3')).toEqual([]);
  });
});

/* ---------------------------------------------------------------- automat pracy */

describe.each(KOMBINACJE)('automat pracy a rozdziały: %s %s', (key, mode) => {
  it('Szaber sam przeszukuje: R1 „przeszukaj” zalicza się bez polecenia gracza, rozdział trwa, a R3 niczego nie dostaje od automatu', () => {
    const g = poPierwszymRaporcie(key, mode);
    const { st } = g.sim;
    // gracz nie wydał żadnego polecenia pracy; nikt nie ustawił priorytetów, stałych zajęć ani progów
    expect(st.praca).toBeUndefined();
    expect(cel(g, 'przeszukaj').done).toBe(false);
    graj(
      g,
      (x) =>
        x.sim.st.apts.some((a) => a.searched.length > 0) ||
        (x.sim.st.sasiedzi?.budynki ?? []).some(
          (b) => b.przeszukane.length > 0 || b.mieszkania.some((m) => m.przeszukane.length > 0),
        ),
      {},
      1500,
    );
    // zaliczone przez stan gry, nie przez polecenie gracza (żadnego nie było)
    expect(cel(g, 'przeszukaj').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r1.przeszukaj']);
    expect(g.sciezka.rozdzial).toBe('r1');
    expect(widok(g).rozdzial!.k).toBe('r1');
    expect(widok(g).rozdzial!.biezacy?.key).not.toBe('przeszukaj');
    // automat niczego nie zapisał w ustawieniach pracy
    expect(st.praca).toBeUndefined();
    // otwarty R3 w tej samej grze: żaden cel nie jest zrobiony przez samą pracę automatu, choćby minęło pół dnia
    otworz(g, 'r3');
    const t0 = g.sim.st.tick;
    graj(g, (x) => x.sim.st.tick >= t0 + 6 * 800, {}, 1200);
    expect(g.sim.st.praca).toBeUndefined();
    expect(cele(g).every((c) => !c.done)).toBe(true);
    expect(g.sciezka.rozdzial).toBe('r3');
  });
});

/* ---------------------------------------------------------------- jedna angielska para „Zapytać o rękę” */

describe('„Zapytać o rękę”: jedna angielska para dla wędrowca i dla spotkania z sąsiadami', () => {
  it('menu wędrowca i wybór na karcie spotkania mają ten sam angielski napis', () => {
    const para = { pl: 'Zapytać o rękę', en: 'Ask to see their arm' };
    expect(NAPISY.zapytacORege).toEqual(para);
    expect(WYBOR.reka()).toEqual(para);
  });

  it('słowniczek angielskiej wersji ma tę parę wśród poleceń i przycisków, a kod nie ma drugiej wersji ani „dłoni”', () => {
    const slownik = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/SLOWNICZEK-EN.md'), 'utf8');
    expect(slownik).toContain('Zapytać o rękę');
    expect(slownik).toContain('Ask to see their arm');
    expect(slownik).not.toContain('Ask about the hand');
    const sasiedzi = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/content/napisy-sasiedzi.ts'), 'utf8');
    expect(sasiedzi).not.toContain('Ask about the hand');
    // ręka to po angielsku zawsze „arm” (karta spotkania mówi o obandażowanej ręce tym samym słowem co przycisk)
    expect(sasiedzi).not.toMatch(/bandaged hand/);
  });
});
