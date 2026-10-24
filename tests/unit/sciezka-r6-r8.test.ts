/* Rozdziały R6 („Badania”), R7 („Sąsiedzi”) i R8 („Drogi do zwycięstwa”) ścieżki celów
   (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „R6”, „R7”, „R8”, „Po ostatnim rozdziale”) na prawdziwej
   symulacji z zarządem. Każdy cel ma test „fałsz przed czynnością, prawda po niej” (czynności to polecenia gracza:
   `research`, `study`, `knock`, `open`, `force`, `loot`, karty wydarzeń, wspólny płot), a cele z licznikami „od otwarcia”
   nie łapią stanu sprzed otwarcia rozdziału.

   R6: `pracownia` (stoi), `badanie` (wybór albo coś zbadane; linia celu na tablicy), `stol` (postęp jakiegokolwiek
   badania), `odkrycie` (wpis w `research.at`), `era2` (postęp w technologii z ery 2). Cele badań istnieją tylko tam, gdzie
   osada ma dość wiedzy (`jest`), żeby nie blokować ścieżki zarządowi bez fachu ery 1. R7: `pukanie` (praca przy drzwiach
   z pukaniem albo spotkanie), `spotkanie` (licznik spotkań rośnie; linia celu w oknie spotkania), `wejscie` (otwarty
   budynek), `szaber` (przeszukane pomieszczenie albo piętro u sąsiada); rozdziału nie ma, gdy w 120 m nie stoi blok ani
   dom. R8: `drogi` (zdarzenie interfejsu), `ludnosc` (tekst to „co dalej” drogi ludnościowej z `ocenDrogi`, zaliczony po
   kolejnym kamieniu, z tekstem sprzed zaliczenia), `teren` (tylko tam, gdzie wspólny płot dosięga sąsiada: ten sam
   predykat co ekran dróg). Po R8 okienko ma wiersze dróg z „co dalej”, a gdy ich nie ma, chowa się.

   Do tego dla każdej z pięciu map (Przymorze, Lanciego, Zielonki i osiedle zapasowe w dwóch ziarnach, oba tryby): przejście
   całych rozdziałów R6, R7 i R8 do „końca” samymi poleceniami gracza (albo dowód, że cel na tej mapie nie istnieje),
   zapis i wczytanie w środku rozdziałów oraz teksty z projektu w obu językach, na myszy i na dotyku, w bloku i w domu. */

import { afterEach, describe, expect, it } from 'vitest';
import { TECH_DOMS } from '../../src/content/data.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import {
  celLudnosci,
  DROGI,
  krokZwyciestwa,
  ocenDrogi,
  terenMozliwy,
  wlaczZwyciestwo,
} from '../../src/gov/zwyciestwo.ts';
import { kartka, nazwaTech, TECH_BY, TECHS } from '../../src/sim/badania.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { drzwiZewnNaStart } from '../../src/sim/sasiedzi.ts';
import { populacja, snapshot } from '../../src/sim/snapshot.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { tablicaHtml } from '../../src/ui/badania.ts';
import {
  celeHtml,
  celWOknie,
  type KluczRozdzialu,
  krokSciezki,
  licznikiStartu,
  nowyStanSciezki,
  widokSciezki,
  zdarzenieUi,
} from '../../src/ui/sciezka.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';
import { bud, FORBIDDEN_DOM, placeWorld } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { doorWhere, pusto, core as rdzen } from './sasiedzi-pomoc.ts';
import {
  badajDo,
  bezSzwendaczy,
  budynkiSasiadow,
  kartkiDoWziecia,
  MAPY,
  mapaDomowa,
  otoczPlotem,
  otworzBudynek,
  PLOT_NA_MAPIE,
  planujPracownie,
  posadzPrzyStole,
  postawPracownie,
  przeszukajPokoj,
  przyjmijLudzi,
  pukajAzDoSpotkania,
  swiezaGra,
  wybierzBadanie,
  zakonczSpotkanie,
  zapukaj,
} from './sciezka-mapy.ts';
import {
  bezAutomatu,
  cel,
  cele,
  DEMA,
  doba,
  type Gra,
  godzina,
  graj,
  klon,
  krok,
  odczyt,
  otworz,
  poPierwszymRaporcie,
  przezZapis,
  sekunda,
  TRYBY,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const KOMBINACJE = DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const));
const WSZYSTKIE = MAPY.flatMap((mapa) => TRYBY.map((mode) => [mapa, mode] as const));

/** gra po pierwszym raporcie (drugi dzień rano) z włączonymi drogami i otwartym rozdziałem `k` */
function wRozdziale(key: (typeof DEMA)[number], mode: (typeof TRYBY)[number], k: KluczRozdzialu): Gra {
  const g = poPierwszymRaporcie(key, mode);
  wlaczDrogi(g);
  otworz(g, k);
  return g;
}

/** Drogi do zwycięstwa jak w grze: włączone przy wejściu do gry i od razu jeden krok zarządu, który zapisuje kamienie,
    jakie stan już spełnia (w grze robi to pierwsza sekunda), więc liczniki „od otwarcia” zaczynają od prawdziwych liczb. */
function wlaczDrogi(g: Gra): void {
  wlaczZwyciestwo(g.gov);
  krokZwyciestwa(g.gov, wejscie(g), emptyEffects());
}

const klucze = (g: Gra): string[] => cele(g).map((c) => c.key);
const tytul = (g: Gra): string | undefined => widok(g).rozdzial?.tytul;
const zrobione = (g: Gra, k: KluczRozdzialu): string[] =>
  Object.keys(g.sciezka.zrobione)
    .filter((x) => x.startsWith(`${k}.`))
    .sort();

/** zdarzenie interfejsu w tej chwili gry */
function zdarz(g: Gra, k: 'lista' | 'mieszkaniec' | 'budynek' | 'drogi'): void {
  g.sciezka = zdarzenieUi(g.sciezka, k, g.sim.st.tick);
}

/** zapisane kamienie drogi w stanie zarządu */
const kamienie = (g: Gra) => g.gov.zwyciestwo!.kamienie;

/** Jakiekolwiek badanie z postępem, w którym liczy się tylko to, co zapisał stan (identyfikatory spoza drzewka pomijamy). */
const maPostep = (g: Gra): boolean => Object.values(g.sim.st.research?.prog ?? {}).some((v) => v > 0);

/* ---------------------------------------------------------------- skład i kolejność */

describe('rozdziały R6, R7 i R8: skład i kolejność', () => {
  it('ROZDZIALY kończy się rozdziałami R6, R7 i R8 z celami z projektu, w tej kolejności', () => {
    const cele6 = Object.fromEntries(ROZDZIALY.map((r) => [r.k, r.cele.map((c) => c.key)]));
    expect(ROZDZIALY.slice(-3).map((r) => r.k)).toEqual(['r6', 'r7', 'r8']);
    expect(cele6.r6).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    expect(cele6.r7).toEqual(['pukanie', 'spotkanie', 'wejscie', 'szaber']);
    expect(cele6.r8).toEqual(['drogi', 'ludnosc', 'teren']);
  });

  it('żaden cel R6–R8 nie ma terminu ani dopisku czekania: nic nie przepada i nic nie czeka na porę dnia', () => {
    for (const r of ROZDZIALY.filter((x) => ['r6', 'r7', 'r8'].includes(x.k)))
      for (const c of r.cele) {
        expect(c.przepadl, `${r.k}.${c.key}`).toBeUndefined();
        expect(c.czeka, `${r.k}.${c.key}`).toBeUndefined();
      }
  });

  it('okna, którym cel daje linię „Cel: …”: badanie to tablica, spotkanie to okno spotkania, reszta bez okna', () => {
    const okna = ROZDZIALY.filter((r) => ['r6', 'r7', 'r8'].includes(r.k)).flatMap((r) =>
      r.cele.filter((c) => c.okno).map((c) => [`${r.k}.${c.key}`, c.okno]),
    );
    expect(okna).toEqual([
      ['r6.badanie', 'tablica'],
      ['r7.spotkanie', 'spotkanie'],
    ]);
  });

  it.each(KOMBINACJE)(
    '%s %s: tytuły po polsku i po angielsku oraz lista celów każdego z trzech rozdziałów',
    (key, mode) => {
      const g6 = wRozdziale(key, mode, 'r6');
      expect(tytul(g6)).toBe('Badania');
      expect(klucze(g6)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
      ustawJezyk('en');
      expect(tytul(g6)).toBe('Research');
      ustawJezyk('pl');

      const g7 = wRozdziale(key, mode, 'r7');
      expect(tytul(g7)).toBe('Sąsiedzi');
      expect(klucze(g7)).toEqual(['pukanie', 'spotkanie', 'wejscie', 'szaber']);
      ustawJezyk('en');
      expect(tytul(g7)).toBe('Neighbours');
      ustawJezyk('pl');

      const g8 = wRozdziale(key, mode, 'r8');
      expect(tytul(g8)).toBe('Drogi do zwycięstwa');
      // teren jest tam, gdzie wspólny płot dosięga sąsiada: Lanciego i Zielonki tak, Przymorze nie
      expect(klucze(g8)).toEqual(PLOT_NA_MAPIE[key] ? ['drogi', 'ludnosc', 'teren'] : ['drogi', 'ludnosc']);
      ustawJezyk('en');
      expect(tytul(g8)).toBe('Roads to victory');
    },
  );

  it('rozdziały otwierają się po kolei: R5 → R6 → R7 → R8 → „koniec”, każdy z licznikami z chwili otwarcia', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczDrogi(g);
    // R5 bez mapy miasta w grze ma samego ogródka; postawiony od razu zamyka rozdział
    const st = g.sim.st;
    otworz(g, 'r5', { mapaMiasta: false });
    expect(g.sciezka.rozdzial).toBe('r5');
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
    expect(krok(g, { mapaMiasta: false }).rozdzial).toBe('r6');
    expect(g.sciezka.start).toEqual(licznikiStartu(st, g.gov));
    // R6 zamyka się, gdy wszystkie jego cele są zrobione (tu stan gry spełnia je wszystkie, bez gry w badania)
    st.things.push({
      id: st.nextThing++,
      kind: 'pracownia',
      x: 2,
      y: 2,
      w: 2,
      h: 1,
      rot: 0,
      n: 1,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    st.techDone = ['t_okna'];
    st.research = { cur: null, prog: { t_okna: 12, t_spawanie: 3 }, at: { t_okna: st.tick } };
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie', 'r6.era2', 'r6.odkrycie', 'r6.pracownia', 'r6.stol']);
    expect(g.sciezka.od).toBe(st.tick);
  });
});

/* ---------------------------------------------------------------- R6. Badania */

describe.each(KOMBINACJE)('R6 pracownia: %s %s', (key, mode) => {
  it('fałsz bez pracowni i przy samym planie budowy, prawda po postawieniu; trwale', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st } = g.sim;
    expect(cel(g, 'pracownia').done).toBe(false);
    expect(cel(g, 'pracownia').czeka).toBeUndefined();
    expect(widok(g).rozdzial!.biezacy?.key).toBe('pracownia');
    planujPracownie(g);
    expect(st.builds.some((b) => b.kind === 'pracownia')).toBe(true);
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(false);
    expect(cel(g, 'pracownia').done, 'sam plan').toBe(false);
    graj(g, (x) => x.sim.st.things.some((t) => t.kind === 'pracownia'), {}, 4000);
    expect(cel(g, 'pracownia').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r6.pracownia']);
    // po rozebraniu pracowni cel dalej jest zaliczony
    st.things = st.things.filter((t) => t.kind !== 'pracownia');
    expect(cel(g, 'pracownia').done).toBe(true);
  });

  it('pracownia postawiona przed otwarciem rozdziału zalicza cel od razu', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    postawPracownie(g);
    otworz(g, 'r6');
    expect(g.sciezka.rozdzial).toBe('r6');
    expect(zrobione(g, 'r6')).toEqual(['r6.pracownia']);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('badanie');
  });
});

describe.each(KOMBINACJE)('R6 badanie: %s %s', (key, mode) => {
  it('fałsz bez wyboru, prawda po poleceniu research; niedozwolony wybór nic nie zalicza; zdjęcie wyboru nie cofa', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st } = g.sim;
    postawPracownie(g);
    expect(cel(g, 'badanie')).toMatchObject({ done: false, okno: 'tablica' });
    expect(widok(g).rozdzial!.biezacy?.key).toBe('badanie');
    // kartka z ery 2 czeka na technologię z ery 1: symulacja jej nie przyjmuje
    wybierzBadanie(g, 't_spawanie');
    expect(st.research?.cur ?? null).toBeNull();
    expect(cel(g, 'badanie').done).toBe(false);
    wybierzBadanie(g, kartkiDoWziecia(g, 1)[0]);
    expect(st.research?.cur).toBeTruthy();
    expect(cel(g, 'badanie').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r6.badanie']);
    wybierzBadanie(g, null);
    expect(st.research?.cur).toBeNull();
    expect(cel(g, 'badanie').done).toBe(true);
  });

  it('badanie wybrane przed otwarciem rozdziału albo już zbadane zalicza cel od razu', () => {
    const a = poPierwszymRaporcie(key, mode);
    wlaczDrogi(a);
    postawPracownie(a);
    wybierzBadanie(a, kartkiDoWziecia(a, 1)[0]);
    otworz(a, 'r6');
    expect(zrobione(a, 'r6')).toEqual(['r6.badanie', 'r6.pracownia']);
    // zbadane (wybór zdjęty): to też zalicza
    const b = poPierwszymRaporcie(key, mode);
    wlaczDrogi(b);
    b.sim.st.techDone = ['t_okna'];
    postawPracownie(b);
    otworz(b, 'r6');
    expect(zrobione(b, 'r6')).toContain('r6.badanie');
  });

  it('linia celu na tablicy: „Wybierzcie pierwsze badanie.” do wyboru, potem jej nie ma; tablica ją rysuje', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st, w } = g.sim;
    // bez pracowni tablicy nie ma co otwierać, więc linia nie ma gdzie się pokazać
    expect(snapshot(st, w).tablica).toBeNull();
    postawPracownie(g);
    const linia = celWOknie(widok(g), 'tablica');
    expect(linia).toBe('Wybierzcie pierwsze badanie.');
    const tablica = snapshot(st, w).tablica;
    expect(tablica).toBeDefined();
    expect(tablicaHtml(tablica!, { wybrana: null, mode, cel: linia! })).toContain(
      '<small class="tb-linia-celu"><b>Cel:</b> Wybierzcie pierwsze badanie.</small>',
    );
    ustawJezyk('en');
    expect(celWOknie(widok(g), 'tablica')).toBe('Pick your first research.');
    ustawJezyk('pl');
    // inne okna nie mają celu
    for (const okno of ['karta', 'uchwala', 'spotkanie'] as const) expect(celWOknie(widok(g), okno), okno).toBeNull();
    wybierzBadanie(g, kartkiDoWziecia(g, 1)[0]);
    expect(celWOknie(widok(g), 'tablica')).toBeNull();
    const po = snapshot(st, w).tablica!;
    expect(tablicaHtml(po, { wybrana: null, mode })).not.toContain('tb-linia-celu');
  });
});

describe.each(KOMBINACJE)('R6 stol: %s %s', (key, mode) => {
  it('fałsz po wyborze badania bez nikogo przy stole, prawda po poleceniu „Badać” i godzinie przy stole', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r6'));
    const { st } = g.sim;
    const lab = postawPracownie(g);
    wybierzBadanie(g, kartkiDoWziecia(g, 1)[0]);
    expect(cel(g, 'stol').done).toBe(false);
    // automat wyłączony: nikt sam nie siada, choćby minęło kilka minut
    const t0 = st.tick;
    graj(g, (x) => x.sim.st.tick >= t0 + TICKS_PER_HOUR / 4, {}, 100);
    expect(Object.keys(st.research?.prog ?? {})).toEqual([]);
    expect(cel(g, 'stol').done).toBe(false);
    const siedzacy = posadzPrzyStole(g, lab);
    expect(siedzacy).toHaveLength(2);
    const od = st.tick;
    graj(g, (x) => x.sim.st.tick >= od + TICKS_PER_HOUR, {}, 200);
    expect(maPostep(g)).toBe(true);
    expect(cel(g, 'stol').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r6.stol']);
  });

  it('z automatem pracy osoba z umiejętnością w dziedzinie badania siada sama i cel zalicza się bez polecenia', () => {
    const g = wRozdziale(key, mode, 'r6');
    postawPracownie(g);
    expect(cel(g, 'stol').done).toBe(false);
    // Mechanik z zarządu zna budownictwo (poziom 2), więc badanie z tej dziedziny podejmuje sam
    wybierzBadanie(g, 't_okna');
    graj(g, (x) => maPostep(x), {}, 3600);
    expect(cel(g, 'stol').done).toBe(true);
  });

  it('postęp badania sprzed otwarcia rozdziału zalicza cel od razu (stan gry)', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    const lab = postawPracownie(g);
    wybierzBadanie(g, kartkiDoWziecia(g, 1)[0]);
    posadzPrzyStole(g, lab);
    graj(g, (x) => maPostep(x), {}, 3600);
    otworz(g, 'r6');
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie', 'r6.pracownia', 'r6.stol']);
  });
});

describe.each(KOMBINACJE)('R6 odkrycie i era2: %s %s', (key, mode) => {
  it('odkrycie: fałsz w trakcie badania, prawda po ukończeniu technologii; era2: dopiero postęp w technologii z ery 2', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r6'));
    const { st } = g.sim;
    const lab = postawPracownie(g);
    const pierwsza = kartkiDoWziecia(g, 1)[0];
    wybierzBadanie(g, pierwsza);
    posadzPrzyStole(g, lab);
    badajDo(g, lab, (x) => maPostep(x));
    expect(cel(g, 'odkrycie').done, 'w trakcie').toBe(false);
    expect(cel(g, 'era2').done, 'postęp w technologii z ery 1 to jeszcze nie era 2').toBe(false);
    badajDo(g, lab, (x) => Object.keys(x.sim.st.research?.at ?? {}).length > 0);
    expect(st.techDone).toEqual([pierwsza]);
    expect(cel(g, 'odkrycie').done).toBe(true);
    expect(cel(g, 'era2').done, 'technologia z ery 1 zbadana, ery 2 jeszcze nikt nie zaczął').toBe(false);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('era2');
    // kartka z ery 2, którą odblokowała zbadana technologia (po t_okna jest to t_spawanie)
    const dalsza = kartkiDoWziecia(g, 2);
    expect(dalsza.length).toBeGreaterThan(0);
    if (pierwsza === 't_okna') expect(dalsza).toContain('t_spawanie');
    wybierzBadanie(g, dalsza[0]);
    expect(cel(g, 'era2').done, 'sam wybór kartki nie wystarcza').toBe(false);
    posadzPrzyStole(g, lab);
    badajDo(g, lab, (x) => (x.sim.st.research?.prog[dalsza[0]] ?? 0) > 0);
    // ostatni cel R6 zamyka rozdział: otwiera się R7 z licznikami z tej chwili
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie', 'r6.era2', 'r6.odkrycie', 'r6.pracownia', 'r6.stol']);
    expect(g.sciezka.od).toBe(st.tick);
    expect(g.sciezka.start).toEqual(licznikiStartu(st, g.gov));
  });

  it('era2: ukończona technologia z ery 2 w techDone liczy się bez postępu, a identyfikatory spoza drzewka nie', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st } = g.sim;
    postawPracownie(g);
    // postęp i zbadane z ery 1 oraz wpisy spoza drzewka
    st.research = { cur: null, prog: { t_okna: 12, t_nie_ma_takiej: 5 }, at: { t_okna: st.tick } };
    st.techDone = ['t_okna'];
    expect(cel(g, 'era2').done).toBe(false);
    expect(Object.hasOwn(TECH_BY, 't_nie_ma_takiej')).toBe(false);
    st.techDone = ['t_okna', 't_spawanie'];
    expect(TECH_BY.t_spawanie.era).toBe(2);
    // ostatni cel rozdziału: po zaliczeniu rozdział się zamyka, więc o celu mówi już tylko stan ścieżki
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toContain('r6.era2');
  });

  it('zbadana technologia nie zalicza celów, których nie dotyczy: odkrycie wymaga wpisu research.at', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st } = g.sim;
    postawPracownie(g);
    st.techDone = ['t_okna'];
    expect(cel(g, 'badanie').done, 'coś zbadane').toBe(true);
    expect(cel(g, 'odkrycie').done, 'bez wpisu research.at').toBe(false);
    st.research = { cur: null, prog: {}, at: { t_okna: st.tick } };
    expect(cel(g, 'odkrycie').done).toBe(true);
  });
});

/* ---------------------------------------------------------------- R6: cele badań tylko tam, gdzie osada ma wiedzę */

describe('R6: cele badań nie blokują ścieżki, gdy nikt nie zna dziedziny ery 1 ani ery 2', () => {
  /** Przymorze po pierwszym raporcie, w którym nikt nie ma żadnej umiejętności (zarząd i mieszkańcy), bez książek. */
  function bezWiedzy(): Gra {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczDrogi(g);
    for (const o of g.sim.st.people) o.skills = {};
    delete g.sim.st.books;
    return g;
  }

  it('zarząd bez fachu ery 1: lista ma samą pracownię, a po jej postawieniu ścieżka idzie do R7', () => {
    const g = bezWiedzy();
    otworz(g, 'r6');
    expect(klucze(g)).toEqual(['pracownia']);
    expect(kartkiDoWziecia(g, 1)).toEqual([]);
    postawPracownie(g);
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toEqual(['r6.pracownia']);
  });

  it('książka daje wiedzę 1 (cele badań wracają, ery 2 jeszcze nie ma), druga z tej samej dziedziny wiedzę 2 (jest era 2)', () => {
    const g = bezWiedzy();
    otworz(g, 'r6');
    g.sim.st.books = { bud: 1 };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie']);
    g.sim.st.books = { bud: 2 };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    // trzecia książka z dziedziny nic nie dokłada (półka mieści dwie), więc era 2 jest tylko przy dwóch
    g.sim.st.books = { med: 1, uprawa: 1 };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie']);
  });

  it('wiedza 1 w jednej dziedzinie wystarcza na erę 1, ale nie na erę 2; wiedza 2 daje obie', () => {
    const g = bezWiedzy();
    const osoba = rdzen(g.sim)[0];
    const o = g.sim.st.people[osoba.person];
    otworz(g, 'r6');
    o.skills = { uprawa: 1 };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie']);
    o.skills = { uprawa: 2 };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    // dziedzina spoza ery 1 i 2 (elektryka, informatyka) nie daje niczego
    o.skills = { elek: 3, it: 4 };
    expect(klucze(g)).toEqual(['pracownia']);
  });

  it('jedyna osoba z wiedzą na wyprawie nie chowa celów badań: wyprawa mija, a rozdział nie może się przez nią zamknąć', () => {
    const g = bezWiedzy();
    const osoba = rdzen(g.sim)[0];
    g.sim.st.people[osoba.person].skills = { bud: 2 };
    otworz(g, 'r6');
    expect(klucze(g)).toContain('era2');
    osoba.away = true;
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    // postawiona w czasie wyprawy pracownia nie zamyka rozdziału
    postawPracownie(g);
    expect(krok(g).rozdzial).toBe('r6');
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
  });

  it('cel, którego warunek już jest prawdziwy, zostaje na liście mimo braku wiedzy', () => {
    const g = bezWiedzy();
    const { st } = g.sim;
    otworz(g, 'r6');
    expect(klucze(g)).toEqual(['pracownia']);
    st.techDone = ['t_okna'];
    st.research = { cur: null, prog: { t_okna: 12 }, at: { t_okna: st.tick } };
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie']);
    // zaliczone cele zostają, gdy wiedza potem spadnie jeszcze niżej
    krok(g);
    for (const o of st.people) o.skills = {};
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie']);
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie', 'r6.odkrycie', 'r6.stol']);
  });
});

/* ---------------------------------------------------------------- R7. Sąsiedzi */

describe.each(KOMBINACJE)('R7 pukanie: %s %s', (key, mode) => {
  it('fałsz przed poleceniem, prawda po „Zapukać” (praca przy drzwiach), także gdy nikt nie otworzy; trwale', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const { w } = g.sim;
    const kto = rdzen(g.sim).at(-1)!;
    // najbliższe zamknięte drzwi (od budynków najbliżej siedziby), jak w testach sąsiadów
    const { door } = doorWhere(w, mode, (s) => s.s === 'zamkniete');
    expect(cel(g, 'pukanie').done).toBe(false);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('pukanie');
    bezSzwendaczy(g);
    g.sim.push({ t: 'knock', ids: [kto.id], door });
    expect(cel(g, 'pukanie').done, 'polecenie jeszcze nie dotarło do symulacji').toBe(false);
    g.sim.step();
    expect(kto.job).toMatchObject({ t: 'door', what: 'knock' });
    expect(cel(g, 'pukanie').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r7.pukanie']);
    // praca przy drzwiach kończy się (nikt nie otwiera, spotkanie albo przerwanie), a zaliczenie zostaje
    for (let n = 0; n < 9000 && kto.job?.t === 'door'; n++) g.sim.step();
    expect(kto.job?.what).not.toBe('knock');
    expect(cel(g, 'pukanie').done).toBe(true);
  });

  it('„Otworzyć drzwi” i „Wyważyć drzwi” to nie pukanie', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const { door } = budynkiSasiadow(g.sim.w, true)[0];
    for (const t of ['open', 'force'] as const) {
      const h = klon(g);
      const kto = rdzen(h.sim).at(-1)!;
      bezSzwendaczy(h);
      h.sim.push({ t, ids: [kto.id], door });
      h.sim.step();
      expect(kto.job).toMatchObject({ t: 'door', what: t });
      expect(cel(h, 'pukanie').done, t).toBe(false);
    }
  });

  it('wynik pukania („Nikt nie otwiera”) po otwarciu rozdziału zalicza cel, gdy pracy przy drzwiach już nie widać; wynik sprzed otwarcia nie', () => {
    const g = bezAutomatu(poPierwszymRaporcie(key, mode));
    wlaczDrogi(g);
    const { w, st } = g.sim;
    // nikt nie mieszka w okolicy, więc żadne pukanie nie kończy się spotkaniem, tylko napisem
    g.sim.lokatorzy = pusto(w);
    const kto = rdzen(g.sim).at(-1)!;
    const { door } = budynkiSasiadow(w, true)[0];
    expect(zapukaj(g, kto, door)).toBe(false);
    expect(st.sasiedzi!.napis!.co).toBe('nikt');
    otworz(g, 'r7');
    expect(st.sasiedzi!.napis!.tick).toBeLessThan(g.sciezka.od);
    expect(cel(g, 'pukanie').done, 'wynik sprzed otwarcia').toBe(false);
    // drugie pukanie po otwarciu rozdziału; krok ścieżki dopiero po jego końcu, więc pracy przy drzwiach już nie ma
    expect(zapukaj(g, kto, door)).toBe(false);
    expect(st.sasiedzi!.napis).toMatchObject({ co: 'nikt' });
    expect(st.sasiedzi!.napis!.tick).toBeGreaterThanOrEqual(g.sciezka.od);
    expect(kto.job?.what).not.toBe('knock');
    expect(cel(g, 'pukanie').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r7.pukanie']);
  });

  it('inny napis sąsiadów (zamknięte na klucz) po otwarciu rozdziału nie jest pukaniem', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const { st } = g.sim;
    st.sasiedzi = { budynki: [], spotkanie: null, nr: 0, napis: { n: 1, co: 'na_klucz', tick: st.tick, b: 0 }, n: 1 };
    expect(cel(g, 'pukanie').done).toBe(false);
    st.sasiedzi.napis = { n: 2, co: 'ktos', tick: st.tick, b: 0 };
    expect(cel(g, 'pukanie').done).toBe(true);
  });

  it('praca z pukaniem, którą kończy spotkanie sprzed kroku ścieżki, i tak zalicza cel: liczy się też licznik spotkań', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const kto = rdzen(g.sim).at(-1)!;
    // krok ścieżki dopiero po spotkaniu: pukanie widać już tylko po tym, że spotkanie się zaczęło
    pukajAzDoSpotkania(g, kto);
    expect(kto.job?.what).not.toBe('knock');
    expect(g.sim.st.sasiedzi!.nr).toBe(1);
    expect(cel(g, 'pukanie').done).toBe(true);
  });
});

describe.each(KOMBINACJE)('R7 spotkanie: %s %s', (key, mode) => {
  const TEKST = (dom: boolean) => (dom ? 'Porozmawiajcie z sąsiadami.' : 'Porozmawiajcie z lokatorami.');

  it('spotkanie sprzed otwarcia rozdziału się nie liczy, to po otwarciu zalicza cel po swoim zakończeniu', () => {
    const g = bezAutomatu(poPierwszymRaporcie(key, mode));
    wlaczDrogi(g);
    const { st } = g.sim;
    const kto = rdzen(g.sim).at(-1)!;
    // pierwsze spotkanie jeszcze przed rozdziałem
    pukajAzDoSpotkania(g, kto);
    zakonczSpotkanie(g);
    expect(st.sasiedzi!.nr).toBe(1);
    expect(st.sasiedzi!.spotkanie).toBeNull();
    otworz(g, 'r7');
    expect(g.sciezka.start.spotkania).toBe(1);
    expect(cel(g, 'spotkanie').done, 'spotkanie sprzed otwarcia').toBe(false);
    expect(cel(g, 'pukanie').done, 'a spotkanie sprzed otwarcia nie zalicza i pukania').toBe(false);
    // drugie spotkanie, już po otwarciu rozdziału
    pukajAzDoSpotkania(g, kto);
    expect(st.sasiedzi!.nr).toBeGreaterThan(1);
    expect(st.sasiedzi!.spotkanie).not.toBeNull();
    // spotkanie trwa: pukanie zaliczone, rozmowa jeszcze nie, a okno spotkania ma linię celu
    expect(cel(g, 'pukanie').done).toBe(true);
    expect(cel(g, 'spotkanie')).toMatchObject({ done: false, okno: 'spotkanie', text: TEKST(wDomu(key)) });
    expect(widok(g).rozdzial!.biezacy?.key).toBe('spotkanie');
    expect(celWOknie(widok(g), 'spotkanie')).toBe(TEKST(wDomu(key)));
    for (const okno of ['karta', 'uchwala', 'tablica'] as const) expect(celWOknie(widok(g), okno), okno).toBeNull();
    zakonczSpotkanie(g);
    expect(cel(g, 'spotkanie').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r7.spotkanie']);
    expect(celWOknie(widok(g), 'spotkanie')).toBeNull();
  });

  it('spotkanie po angielsku: „Talk to the residents next door.” w bloku, „Talk to the neighbours.” w domu', () => {
    const g = wRozdziale(key, mode, 'r7');
    ustawJezyk('en');
    expect(cel(g, 'spotkanie').text).toBe(wDomu(key) ? 'Talk to the neighbours.' : 'Talk to the residents next door.');
  });
});

describe.each(KOMBINACJE)('R7 wejscie i szaber: %s %s', (key, mode) => {
  /** Budynek do otwarcia: pusty, jeśli taki jest (bez awantury z lokatorami), inaczej zamieszkany, ale zawsze z drzwiami
      zamkniętymi na start (budynek z wyważonymi drzwiami otwiera się już przy pierwszym dotknięciu). */
  const budynek = (g: Gra) => {
    const { w, st } = g.sim;
    return [...budynkiSasiadow(w, false), ...budynkiSasiadow(w, true)].find(
      ({ bid, door }) => drzwiZewnNaStart(w, modeOf(st), bid, door).s === 'zamkniete',
    )!;
  };

  it('wejscie: fałsz przed otwarciem i w trakcie pracy przy drzwiach, prawda, gdy wnętrze budynku jest dołączone do mapy', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const { st } = g.sim;
    const kto = rdzen(g.sim).at(-1)!;
    const { bid, door } = budynek(g);
    expect(cel(g, 'wejscie').done).toBe(false);
    expect(st.sasiedzi?.budynki.some((b) => b.otwarty) ?? false).toBe(false);
    bezSzwendaczy(g);
    g.sim.push({ t: 'open', ids: [kto.id], door });
    g.sim.step();
    expect(kto.job).toMatchObject({ t: 'door' });
    expect(cel(g, 'wejscie').done, 'praca przy drzwiach to jeszcze nie otwarty budynek').toBe(false);
    otworzBudynek(g, kto, bid, door);
    expect(st.sasiedzi!.budynki.find((b) => b.bid === bid)!.otwarty).toBe(true);
    expect(cel(g, 'wejscie').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r7.wejscie']);
  });

  it('wejscie: budynek otwarty przed rozdziałem zalicza cel od razu', () => {
    const g = bezAutomatu(poPierwszymRaporcie(key, mode));
    wlaczDrogi(g);
    const { bid, door } = budynek(g);
    otworzBudynek(g, rdzen(g.sim).at(-1)!, bid, door);
    otworz(g, 'r7');
    expect(zrobione(g, 'r7')).toContain('r7.wejscie');
    expect(zrobione(g, 'r7')).not.toContain('r7.szaber');
  });

  it('szaber: fałsz w otwartym budynku, w którym nic nie przeszukano, prawda po „Przeszukać …”', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const kto = rdzen(g.sim).at(-1)!;
    const { bid, door } = budynek(g);
    otworzBudynek(g, kto, bid, door);
    expect(cel(g, 'szaber').done).toBe(false);
    przeszukajPokoj(g, kto, bid);
    expect(cel(g, 'szaber').done || g.sciezka.zrobione['r7.szaber'] !== undefined).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r7.szaber']);
  });

  it('szaber: pomieszczenie bez mieszkania, pomieszczenie mieszkania i piętro to przeszukanie u sąsiada', () => {
    const g = bezAutomatu(wRozdziale(key, mode, 'r7'));
    const { bid, door } = budynek(g);
    otworzBudynek(g, rdzen(g.sim).at(-1)!, bid, door);
    const b = g.sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    expect(cel(g, 'szaber').done).toBe(false);
    for (const zmien of [
      (x: typeof b) => x.przeszukane.push(0),
      (x: typeof b) => x.mieszkania[0]?.przeszukane.push(1),
      (x: typeof b) => {
        x.pietra = 1;
      },
    ]) {
      const h = klon(g);
      zmien(h.sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!);
      expect(cel(h, 'szaber').done || h.sciezka.zrobione['r7.szaber'] !== undefined).toBe(true);
    }
  });

  it('szaber: przeszukanie u sąsiada przed rozdziałem zalicza cel od razu', () => {
    const g = bezAutomatu(poPierwszymRaporcie(key, mode));
    wlaczDrogi(g);
    const kto = rdzen(g.sim).at(-1)!;
    const { bid, door } = budynek(g);
    otworzBudynek(g, kto, bid, door);
    przeszukajPokoj(g, kto, bid);
    otworz(g, 'r7');
    expect(zrobione(g, 'r7')).toEqual(expect.arrayContaining(['r7.wejscie', 'r7.szaber']));
  });
});

describe('R7: rozdziału nie ma tam, gdzie w 120 m od siedziby nie stoi ani blok, ani dom', () => {
  it('bez sąsiadów (GovPlace.near „nikt”) ścieżka idzie z R6 prosto do R8; z sąsiadem R7 jest', () => {
    const r7 = ROZDZIALY.find((r) => r.k === 'r7')!;
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczDrogi(g);
    const o = odczyt(g);
    expect(r7.jest?.(o)).toBe(true);
    const sam = placeWorld([bud(0, 'blok', 0, 0, { levels: 5 }), bud(1, 'sklep', 60, 0)]);
    const bezSasiadow = { ...o, w: sam as unknown as typeof o.w };
    expect(r7.jest?.(bezSasiadow)).toBe(false);
    // dom 200 m dalej jest za daleko, blok w 100 m wystarcza
    const daleko = placeWorld([bud(0, 'blok', 0, 0), bud(1, 'dom', 200, 0)]);
    expect(r7.jest?.({ ...o, w: daleko as unknown as typeof o.w })).toBe(false);
    const blisko = placeWorld([bud(0, 'blok', 0, 0), bud(1, 'blok', 100, 0)]);
    expect(r7.jest?.({ ...o, w: blisko as unknown as typeof o.w })).toBe(true);
    // R6 skończony, a R7 nie ma: otwiera się R8
    const tick = g.sim.st.tick;
    const skonczoneR6 = {
      ...nowyStanSciezki(),
      rozdzial: 'r6' as const,
      od: tick,
      zrobione: Object.fromEntries(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2'].map((k) => [`r6.${k}`, tick])),
    };
    expect(krokSciezki(skonczoneR6, o).rozdzial).toBe('r7');
    expect(krokSciezki(skonczoneR6, bezSasiadow).rozdzial).toBe('r8');
  });
});

/* ---------------------------------------------------------------- R8. Drogi do zwycięstwa */

describe.each(KOMBINACJE)('R8 drogi: %s %s', (key, mode) => {
  it('fałsz do otwarcia ekranu dróg, prawda po zdarzeniu `drogi`; zdarzenie sprzed otwarcia rozdziału się nie liczy', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    // ekran dróg otwarty przed rozdziałem (na przykład z Menu w pierwszym dniu)
    zdarz(g, 'drogi');
    for (let k = 0; k < 100; k++) g.sim.step();
    otworz(g, 'r8');
    expect(g.sciezka.ui.drogi).toBeLessThan(g.sciezka.od);
    expect(cel(g, 'drogi').done, 'zdarzenie sprzed otwarcia').toBe(false);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('drogi');
    // inne zdarzenia interfejsu nie zaliczają tego celu
    for (const k of ['lista', 'mieszkaniec', 'budynek'] as const) zdarz(g, k);
    expect(cel(g, 'drogi').done).toBe(false);
    for (let k = 0; k < 10; k++) g.sim.step();
    zdarz(g, 'drogi');
    expect(cel(g, 'drogi').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r8.drogi']);
    // zaliczenie jest trwałe
    g.sciezka = { ...g.sciezka, ui: {} };
    expect(cel(g, 'drogi').done).toBe(true);
  });

  it('zdarzenie w tym samym ticku co otwarcie rozdziału się liczy (na pauzie tick stoi)', () => {
    const g = wRozdziale(key, mode, 'r8');
    zdarz(g, 'drogi');
    expect(g.sciezka.ui.drogi).toBe(g.sciezka.od);
    expect(cel(g, 'drogi').done).toBe(true);
  });
});

describe.each(KOMBINACJE)('R8 ludnosc: %s %s', (key, mode) => {
  const droga = (g: Gra) => ocenDrogi(g.gov, wejscie(g)).find((d) => d.droga === 'ludnosc')!;
  /** progi kamieni ludności: 10, 25, 50 i połowa celu */
  const progi = (g: Gra) => [10, 25, 50, Math.ceil(celLudnosci(wejscie(g), mode) / 2)];

  it('tekst i podpowiedź mówią to samo co ocenDrogi (`dalej`, `postep`), po polsku i po angielsku', () => {
    const g = wRozdziale(key, mode, 'r8');
    const d = droga(g);
    expect(d.dalej).not.toBeNull();
    const ile = populacja(g.sim.st).razem;
    const cal = celLudnosci(wejscie(g), mode);
    expect(d.postep).toEqual({ ile, cel: cal });
    expect(cel(g, 'ludnosc').text).toBe(d.dalej!.pl);
    expect(cel(g, 'ludnosc').how).toBe(
      `Nowe osiedle: ${ile} z ${cal}. Ludzie przychodzą z kart wydarzeń i od sąsiadów („Zaprosić do nas”).`,
    );
    ustawJezyk('en');
    expect(cel(g, 'ludnosc').text).toBe(d.dalej!.en);
    expect(cel(g, 'ludnosc').how).toBe(
      `A new estate: ${ile} of ${cal}. People come from event cards and from next door (“Invite them to join you”).`,
    );
    expect(polskieSlowa(cel(g, 'ludnosc').text + cel(g, 'ludnosc').how)).toEqual([]);
  });

  it('zalicza się po kolejnym kamieniu drogi ludnościowej, a tekst zostaje taki, jaki był przy otwarciu rozdziału', () => {
    const g = wRozdziale(key, mode, 'r8');
    const przed = kamienie(g).ludnosc ?? 0;
    expect(g.sciezka.start.kamienLudnosci).toBe(przed);
    const tekstPrzed = cel(g, 'ludnosc').text;
    expect(cel(g, 'ludnosc').done).toBe(false);
    const prog = progi(g)[przed];
    const braki = prog - populacja(g.sim.st).razem;
    expect(braki).toBeGreaterThan(0);
    // o jedną osobę za mało: kamień się nie zalicza
    if (braki > 1) {
      przyjmijLudzi(g, braki - 1);
      sekunda(g);
      expect(kamienie(g).ludnosc ?? 0).toBe(przed);
      expect(cel(g, 'ludnosc').done).toBe(false);
    }
    przyjmijLudzi(g, 1, 500);
    expect(populacja(g.sim.st).razem).toBe(prog);
    // zarząd liczy kamienie co sekundę przy ekranie
    sekunda(g);
    expect(kamienie(g).ludnosc).toBe(przed + 1);
    expect(cel(g, 'ludnosc').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r8.ludnosc']);
    // „co dalej” drogi mówi już o następnym progu, a zaliczony cel dalej niesie tekst sprzed zaliczenia
    expect(droga(g).dalej!.pl).not.toBe(tekstPrzed);
    expect(cel(g, 'ludnosc').text).toBe(tekstPrzed);
    ustawJezyk('en');
    expect(cel(g, 'ludnosc').text).toBe(
      ocenDrogi(
        { ...g.gov, zwyciestwo: { ...g.gov.zwyciestwo!, kamienie: { ...kamienie(g), ludnosc: przed } } },
        wejscie(g),
      ).find((x) => x.droga === 'ludnosc')!.dalej!.en,
    );
  });

  it('kamień zaliczony przed otwarciem rozdziału się nie liczy: cel czeka na następny, a tekst mówi o następnym progu', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    // ludność przekroczyła pierwszy próg jeszcze przed rozdziałem
    przyjmijLudzi(g, 10 - populacja(g.sim.st).razem + 1 > 0 ? 10 - populacja(g.sim.st).razem + 1 : 1);
    sekunda(g);
    expect(kamienie(g).ludnosc).toBeGreaterThanOrEqual(1);
    otworz(g, 'r8');
    const start = kamienie(g).ludnosc!;
    expect(g.sciezka.start.kamienLudnosci).toBe(start);
    expect(cel(g, 'ludnosc').done).toBe(false);
    expect(cel(g, 'ludnosc').text).toBe(droga(g).dalej!.pl);
    expect(cel(g, 'ludnosc').text).toContain(String(progi(g)[start]));
  });

  it('ostatni kamień (utrzymanie celu przez 7 poranków) ma w tekście licznik poranków z „co dalej”', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    g.gov.zwyciestwo!.kamienie.ludnosc = 4;
    g.gov.zwyciestwo!.dniCelu = 3;
    otworz(g, 'r8');
    expect(cel(g, 'ludnosc').text).toBe(
      'Utrzymajcie cel 7 poranków z rzędu: o 6:00 nikt z zarządu nie jest głodny, a zaufanie wynosi co najmniej 50 (3 z 7).',
    );
    expect(cel(g, 'ludnosc').text).toBe(droga(g).dalej!.pl);
  });

  it('nie istnieje bez włączonych dróg ani wtedy, gdy droga ludnościowa jest już przebyta do końca', () => {
    const bez = poPierwszymRaporcie(key, mode);
    expect(bez.gov.zwyciestwo).toBeUndefined();
    otworz(bez, 'r8');
    expect(klucze(bez)).toEqual(['drogi']);
    const gotowa = poPierwszymRaporcie(key, mode);
    wlaczDrogi(gotowa);
    gotowa.gov.zwyciestwo!.kamienie.ludnosc = DROGI.ludnosc.kamienie.length;
    otworz(gotowa, 'r8');
    expect(klucze(gotowa)).not.toContain('ludnosc');
    // droga przebyta w trakcie rozdziału: zaliczony cel zostaje na liście
    const g = wRozdziale(key, mode, 'r8');
    krok(g);
    g.gov.zwyciestwo!.kamienie.ludnosc = DROGI.ludnosc.kamienie.length;
    expect(cel(g, 'ludnosc').done).toBe(true);
    expect(klucze(g)).toContain('ludnosc');
  });
});

describe.each(KOMBINACJE)('R8 teren: %s %s', (key, mode) => {
  it('jest na liście tam, gdzie wspólny płot dosięga sąsiada (Lanciego, Zielonki), a na Przymorzu go nie ma', () => {
    const g = wRozdziale(key, mode, 'r8');
    const mozliwe = PLOT_NA_MAPIE[key];
    expect(klucze(g).includes('teren')).toBe(mozliwe);
    // ten sam predykat, co na ekranie dróg: „Wkrótce: wspólny płot przez jezdnię” albo „co dalej” o płocie
    const i = wejscie(g);
    expect(terenMozliwy(i)).toBe(mozliwe);
    const teren = ocenDrogi(g.gov, i).find((d) => d.droga === 'teren')!;
    expect(teren.dalej !== null).toBe(mozliwe);
    expect(teren.wkrotce !== null).toBe(!mozliwe);
    // brakujące pole `mozliwe` (atrapa wejścia) znaczy „da się”, więc cel jest, tak jak „co dalej” na ekranie dróg
    const bezPola = { ...odczyt(g), input: { ...i, teren: { przylaczone: 0 } } };
    expect(ROZDZIALY.find((r) => r.k === 'r8')!.cele.find((c) => c.key === 'teren')!.jest!(bezPola, g.sciezka)).toBe(
      true,
    );
  });

  it('kamień terenu sprzed otwarcia rozdziału zalicza cel od razu', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    g.gov.zwyciestwo!.kamienie.teren = 1;
    otworz(g, 'r8');
    expect(zrobione(g, 'r8')).toContain('r8.teren');
  });
});

describe.each(KOMBINACJE.filter(([key]) => PLOT_NA_MAPIE[key]))('R8 teren tam, gdzie można: %s %s', (key, mode) => {
  it('fałsz bez płotu, prawda, gdy droga terenu ma pierwszy kamień; trwale', () => {
    const g = wRozdziale(key, mode, 'r8');
    expect(cel(g, 'teren')).toMatchObject({ done: false });
    expect(cel(g, 'teren').text).toBe('Otoczcie wspólnym płotem pierwszy sąsiedni budynek.');
    g.gov.zwyciestwo!.kamienie.teren = 1;
    expect(cel(g, 'teren').done).toBe(true);
    expect(g.sciezka.zrobione).toHaveProperty(['r8.teren']);
    g.gov.zwyciestwo!.kamienie.teren = 0;
    expect(cel(g, 'teren').done).toBe(true);
  });

  it('bez wejścia zarządu cel nie wchodzi do listy, tak samo jak `ludnosc` (nie ma jak ocenić, czy płot dosięga); zaliczony zostaje', () => {
    const g = wRozdziale(key, mode, 'r8');
    const bezWejscia = () => widokSciezki(g.sciezka, { ...odczyt(g), input: null }).rozdzial!.cele.map((c) => c.key);
    expect(klucze(g)).toContain('teren');
    expect(klucze(g)).toContain('ludnosc');
    expect(bezWejscia()).not.toContain('teren');
    expect(bezWejscia()).not.toContain('ludnosc');
    g.gov.zwyciestwo!.kamienie.teren = 1;
    expect(cel(g, 'teren').done).toBe(true);
    expect(bezWejscia()).toContain('teren');
  });
});

/* ---------------------------------------------------------------- po ostatnim rozdziale: drogi do zwycięstwa */

describe.each(KOMBINACJE)('widok po R8: drogi, na które gra ma następny krok (%s %s)', (key, mode) => {
  const dom = wDomu(key);
  /** gra w stanie „koniec” po ostatnim rozdziale; widok liczony wprost (bez kroku, który nic by tu nie zmienił) */
  function poR8(): Gra {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    g.sciezka = { ...nowyStanSciezki(), rozdzial: 'koniec', od: g.sim.st.tick };
    return g;
  }
  const wiersze = (g: Gra) => widokSciezki(g.sciezka, odczyt(g)).drogi;
  const nazwy = (g: Gra) => wiersze(g)?.map((r) => r.nazwa);

  it('technologia (zero kamieni), teren tam, gdzie można, i ludność, w kolejności ekranu dróg; bez leku i cudów', () => {
    const g = poR8();
    const v = widokSciezki(g.sciezka, odczyt(g));
    expect(v.okazja).toBeNull();
    expect(v.rozdzial).toBeNull();
    const ludzie = populacja(g.sim.st).razem;
    const cal = celLudnosci(wejscie(g), mode);
    expect(v.drogi).toEqual([
      {
        nazwa: 'Prąd bez miedzi',
        dalej: `Postawcie pracownię w pokoju ${dom ? 'waszego domu' : 'waszego mieszkania'} (Budowa, zakładka Dom).`,
        postep: null,
      },
      ...(PLOT_NA_MAPIE[key]
        ? [{ nazwa: 'Za Murem', dalej: 'Otoczcie wspólnym płotem pierwszy sąsiedni budynek.', postep: null }]
        : []),
      { nazwa: 'Nowe osiedle', dalej: 'Zbierzcie 10 osób pod zarządem.', postep: `${ludzie} z ${cal}` },
    ]);
    // lek (w zombie „Lek”) i cuda mają „Wkrótce”, więc ich w okienku nie ma
    expect(nazwy(g)).not.toContain('Cuda');
    expect(nazwy(g)).not.toContain('Lek');
    expect(nazwy(g)).not.toContain('Wyłącznik z pakietu premium');
  });

  it('teren jest w wierszach dokładnie wtedy, gdy R8 ma cel `teren`: ten sam predykat', () => {
    const g = poR8();
    const jestWWierszach = (nazwy(g) ?? []).includes('Za Murem');
    const r8 = wRozdziale(key, mode, 'r8');
    expect(jestWWierszach).toBe(klucze(r8).includes('teren'));
    expect(jestWWierszach).toBe(terenMozliwy(wejscie(g)));
  });

  it('technologia znika po dwóch pierwszych kamieniach („Wkrótce” o prądzie zostaje na ekranie dróg), teren po pierwszym', () => {
    const g = poR8();
    g.gov.zwyciestwo!.kamienie.technologia = 1;
    expect(wiersze(g)![0].dalej).toBe('Posadźcie kogoś przy stole pracowni i wybierzcie kartkę na tablicy badań.');
    g.gov.zwyciestwo!.kamienie.technologia = 2;
    expect(nazwy(g)).not.toContain('Prąd bez miedzi');
    g.gov.zwyciestwo!.kamienie.teren = 1;
    expect(nazwy(g)).toEqual(['Nowe osiedle']);
    // ten sam stan na ekranie dróg: technologia ma „Wkrótce”, teren „Wkrótce” o kwadratach, żadna nie ma „co dalej”
    const ocena = ocenDrogi(g.gov, wejscie(g));
    expect(ocena.filter((d) => d.dalej).map((d) => d.droga)).toEqual(['ludnosc']);
    expect(ocena.find((d) => d.droga === 'technologia')!.wkrotce).not.toBeNull();
  });

  it('ostatni kamień ludności: wiersz z licznikiem poranków i postępem, potem żadna droga nie ma kroku i widok jest pusty', () => {
    const g = poR8();
    const z = g.gov.zwyciestwo!;
    z.kamienie.technologia = 2;
    z.kamienie.teren = 1;
    z.kamienie.ludnosc = 4;
    z.dniCelu = 5;
    const ludzie = populacja(g.sim.st).razem;
    const cal = celLudnosci(wejscie(g), mode);
    expect(wiersze(g)).toEqual([
      {
        nazwa: 'Nowe osiedle',
        dalej:
          'Utrzymajcie cel 7 poranków z rzędu: o 6:00 nikt z zarządu nie jest głodny, a zaufanie wynosi co najmniej 50 (5 z 7).',
        postep: `${ludzie} z ${cal}`,
      },
    ]);
    z.kamienie.ludnosc = 5;
    expect(wiersze(g)).toEqual([]);
    // okienko się chowa: pusty HTML i w pełnym, i w zwiniętym widoku
    for (const otwarte of [true, false])
      expect(celeHtml(widokSciezki(g.sciezka, odczyt(g)), { otwarte, touch: false })).toBe('');
  });

  it('HTML: nagłówek „Drogi do zwycięstwa”, wiersze „{nazwa}: {dalej}” z postępem, pierwszy bieżący; zwinięte: tylko pierwszy', () => {
    const g = poR8();
    const v = widokSciezki(g.sciezka, odczyt(g));
    const pelny = celeHtml(v, { otwarte: true, touch: false });
    expect(pelny).toContain('<span>Drogi do zwycięstwa</span>');
    expect(pelny).toContain('data-blok="drogi"');
    expect(pelny).toContain('Prąd bez miedzi: Postawcie pracownię w pokoju');
    expect(pelny).toContain('Nowe osiedle: Zbierzcie 10 osób pod zarządem.');
    expect(pelny).toContain(
      `<small class="goal-postep">${populacja(g.sim.st).razem} z ${celLudnosci(wejscie(g), mode)}</small>`,
    );
    expect(pelny.match(/class="goal now"/g)).toHaveLength(1);
    expect(pelny.indexOf('Prąd bez miedzi')).toBeLessThan(pelny.indexOf('Nowe osiedle'));
    const zwiniety = celeHtml(v, { otwarte: false, touch: false });
    expect(zwiniety).toContain('Prąd bez miedzi: ');
    expect(zwiniety).not.toContain('Nowe osiedle');
    // dom bez słów z bloku
    if (dom) expect(pelny.replace(/<[^>]*>/g, ' ')).not.toMatch(FORBIDDEN_DOM);
  });

  it('po angielsku: „Roads to victory”, wiersze bez polskich słów i bez myślników w tekście', () => {
    const g = poR8();
    ustawJezyk('en');
    const v = widokSciezki(g.sciezka, odczyt(g));
    expect(v.drogi!.map((r) => r.nazwa)).toEqual(
      PLOT_NA_MAPIE[key]
        ? ['Power without copper', 'Za Murem', 'A new estate']
        : ['Power without copper', 'A new estate'],
    );
    const html = celeHtml(v, { otwarte: true, touch: false });
    const tekst = html.replace(/<[^>]*>/g, ' ');
    expect(tekst).toContain('Roads to victory');
    expect(polskieSlowa(tekst, ['Za Murem'])).toEqual([]);
    expect(tekst).not.toMatch(/[—–]/);
    expect(v.drogi![v.drogi!.length - 1].postep).toBe(
      `${populacja(g.sim.st).razem} of ${celLudnosci(wejscie(g), mode)}`,
    );
  });

  it('widok niczego nie zmienia w grze i w stanie ścieżki; ten sam wynik przy kolejnych wywołaniach', () => {
    const g = poR8();
    const gov = JSON.stringify(g.gov);
    const sim = g.sim.hash();
    const sciezka = JSON.stringify(g.sciezka);
    const a = JSON.stringify(wiersze(g));
    expect(JSON.stringify(wiersze(g))).toBe(a);
    expect(JSON.stringify(g.gov)).toBe(gov);
    expect(g.sim.hash()).toBe(sim);
    expect(JSON.stringify(g.sciezka)).toBe(sciezka);
  });
});

/* ---------------------------------------------------------------- zapis i wczytanie w środku rozdziałów */

describe('zapis i wczytanie w środku rozdziałów R6, R7 i R8 dają ten sam widok', () => {
  it.each(KOMBINACJE)('%s %s: R6, R7 i R8', (key, mode) => {
    for (const k of ['r6', 'r7', 'r8'] as const) {
      const g = bezAutomatu(wRozdziale(key, mode, k));
      if (k === 'r6') postawPracownie(g);
      if (k === 'r8') zdarz(g, 'drogi');
      graj(g, (x) => godzina(x) >= 8, {}, 600);
      const przed = JSON.stringify(widok(g));
      const h = przezZapis(g);
      expect(JSON.stringify(widok(h)), k).toBe(przed);
      // i dalej tak samo przez kolejne sekundy (stan zapisanej gry i wczytanej idzie tak samo)
      graj(g, (x) => godzina(x) >= 10, {}, 600);
      graj(h, (x) => godzina(x) >= 10, {}, 600);
      expect(JSON.stringify(widok(h)), k).toBe(JSON.stringify(widok(g)));
      expect(h.sim.hash(), k).toBe(g.sim.hash());
    }
  });

  it('wczytana gra w „koniec” z zapisanymi wszystkimi celami zostaje „końcem” i pokazuje drogi', () => {
    const g = poPierwszymRaporcie('lanciego', 'zwykly');
    wlaczDrogi(g);
    const tick = g.sim.st.tick;
    const zrobioneWszystko = Object.fromEntries(
      ROZDZIALY.flatMap((r) => r.cele.map((c) => [`${r.k}.${c.key}`, tick - 100])),
    );
    g.sciezka = { ...nowyStanSciezki(), rozdzial: 'koniec', od: tick - 50, zrobione: zrobioneWszystko };
    const h = przezZapis(g);
    expect(krok(h).rozdzial).toBe('koniec');
    expect(widok(h).rozdzial).toBeNull();
    expect(widok(h).drogi!.map((r) => r.nazwa)).toEqual(['Prąd bez miedzi', 'Za Murem', 'Nowe osiedle']);
  });
});

/* ---------------------------------------------------------------- teksty z projektu */

/** tekst i podpowiedź celu w bieżącym języku, na myszy albo na dotyku */
const slowa = (g: Gra, touch: boolean, k: string) => {
  const c = cel(g, k, { touch });
  return { text: c.text, how: c.how };
};

describe('teksty R6 (blok i dom, mysz i dotyk, po polsku i po angielsku)', () => {
  it('pracownia: koszt z BUILDS, pokój „waszego mieszkania” w bloku i „waszego domu” w domu', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zwykly', 'r6');
      expect(slowa(g, false, 'pracownia')).toEqual({
        text: 'Postawcie pracownię.',
        how: `Budowa, zakładka Dom: Pracownia (deski 14, części 4) w pokoju ${dom ? 'waszego domu' : 'waszego mieszkania'}. Części dają przeszukiwanie i warsztat („Zrobić część ze złomu”).`,
      });
      expect(
        slowa(g, true, 'pracownia').how.startsWith(
          'Przycisk Budowa u góry, zakładka Dom: Pracownia (deski 14, części 4)',
        ),
      ).toBe(true);
      ustawJezyk('en');
      expect(slowa(g, false, 'pracownia')).toEqual({
        text: 'Build a research room.',
        how: `Build, Home tab: Research room (planks 14, parts 4) in a room of ${dom ? 'your house' : 'your flat'}. Parts come from searching and from the workshop (“Make a part from scrap”).`,
      });
      expect(slowa(g, true, 'pracownia').how.startsWith('The Build button at the top, Home tab: Research room')).toBe(
        true,
      );
      ustawJezyk('pl');
    }
  });

  it('badanie, odkrycie i era2: teksty z projektu, na dotyku bez klawisza T i „klik” zamiast „stuknięcia”', () => {
    const g = wRozdziale('przymorze', 'zwykly', 'r6');
    expect(slowa(g, false, 'badanie')).toEqual({
      text: 'Wybierzcie pierwsze badanie.',
      how: 'Tablica badań otwiera się sama, kiedy pracownia stanie, potem pod przyciskiem Badania albo T. Klik w kartkę, potem „Badać”.',
    });
    expect(slowa(g, true, 'badanie').how).toBe(
      'Tablica badań otwiera się sama, kiedy pracownia stanie, potem pod przyciskiem Badania. Stuknięcie w kartkę, potem „Badać”.',
    );
    expect(slowa(g, false, 'odkrycie')).toEqual({
      text: 'Zbadajcie pierwszą technologię.',
      how: 'Karta „Odkrycie” powie, co daje; nowe budowle mają w Budowie znaczek NOWE. Książki znalezione przy przeszukiwaniu dokładają wiedzy.',
    });
    expect(slowa(g, false, 'era2')).toEqual({
      text: 'Zacznijcie badanie z ery 2.',
      how: 'Kolumny tablicy to ery. Kartka z ery 2 da się wziąć, kiedy zbadacie technologię, której wymaga (nitka na tablicy). Ery 3–6 czekają na prąd.',
    });
    ustawJezyk('en');
    expect(slowa(g, false, 'badanie')).toEqual({
      text: 'Pick your first research.',
      how: 'The Research board opens by itself once the research room stands; later it’s under the Research button, or T. Click a card, then “Research”.',
    });
    expect(slowa(g, true, 'badanie').how).toBe(
      'The Research board opens by itself once the research room stands; later it’s under the Research button. Tap a card, then “Research”.',
    );
    expect(slowa(g, false, 'odkrycie')).toEqual({
      text: 'Finish your first research.',
      how: 'The Discovery card tells you what it gives you; new structures are marked NEW in Build. Books found while searching add to what you know.',
    });
    expect(slowa(g, false, 'era2')).toEqual({
      text: 'Start a research from era 2.',
      how: 'The board’s columns are eras. An era 2 card can be taken once you finish the technology it needs (the thread on the board). Eras 3–6 are waiting for power.',
    });
  });

  it('stol: nazwa bieżącego badania jak w menu pracowni, „mieszkańcy” w bloku i „sąsiedzi” w domu', () => {
    for (const key of ['przymorze', 'zielonki'] as const) {
      const dom = wDomu(key);
      const g = wRozdziale(key, 'zwykly', 'r6');
      postawPracownie(g);
      wybierzBadanie(g, 't_okna');
      const nazwa = nazwaTech('t_okna');
      expect(slowa(g, false, 'stol')).toEqual({
        text: 'Posadźcie kogoś przy stole pracowni.',
        how: `Zaznaczcie osobę i prawy przycisk na pracowni: „Badać: ${nazwa.pl}”. Najszybciej bada ktoś, kto zna dziedzinę kartki; przy stole są dwa miejsca, a ${dom ? 'sąsiedzi' : 'mieszkańcy'} z wiedzą siadają sami.`,
      });
      expect(
        slowa(g, true, 'stol').how.startsWith(
          `Stuknijcie osobę i przytrzymajcie palec na pracowni: „Badać: ${nazwa.pl}”.`,
        ),
      ).toBe(true);
      ustawJezyk('en');
      expect(slowa(g, false, 'stol')).toEqual({
        text: 'Sit someone at the research table.',
        how: `Select a person and right-click the research room: “Research: ${nazwa.en}”. Someone who knows the card’s field is fastest; the table has two seats, and ${dom ? 'neighbours' : 'residents'} who know the field sit down on their own.`,
      });
      expect(
        slowa(g, true, 'stol').how.startsWith(
          `Tap a person and press and hold on the research room: “Research: ${nazwa.en}”.`,
        ),
      ).toBe(true);
      ustawJezyk('pl');
    }
  });

  it('stol bez wybranego badania: wielokropek zamiast nazwy', () => {
    const g = wRozdziale('przymorze', 'zwykly', 'r6');
    expect(slowa(g, false, 'stol').how).toContain('„Badać: …”');
    postawPracownie(g);
    wybierzBadanie(g, 't_okna');
    expect(slowa(g, false, 'stol').how).toContain(`„Badać: ${nazwaTech('t_okna').pl}”`);
    wybierzBadanie(g, null);
    expect(slowa(g, false, 'stol').how).toContain('„Badać: …”');
  });
});

describe('teksty R7 (blok i dom, zwykły tryb i zombie, mysz i dotyk, po polsku i po angielsku)', () => {
  it('pukanie: sąsiedni blok albo dom, dopisek o szwendaczach tylko w trybie zombie', () => {
    for (const key of ['przymorze', 'zielonki'] as const)
      for (const mode of TRYBY) {
        const dom = wDomu(key);
        const zombie = mode === 'zombie';
        const g = wRozdziale(key, mode, 'r7');
        expect(slowa(g, false, 'pukanie')).toEqual({
          text: 'Zapukajcie do sąsiadów.',
          how: `Zaznaczcie kogoś i prawy przycisk na drzwiach sąsiedniego ${dom ? 'domu' : 'bloku'}: „Zapukać”. Za dnia ludzie bywają w domu, nocą otwierają niechętnie.${zombie ? ' Za siatką są szwendacze: idźcie za dnia, z dzidą.' : ''}`,
        });
        expect(
          slowa(g, true, 'pukanie').how.startsWith(
            `Stuknijcie kogoś i przytrzymajcie palec na drzwiach sąsiedniego ${dom ? 'domu' : 'bloku'}: „Zapukać”.`,
          ),
        ).toBe(true);
        ustawJezyk('en');
        expect(slowa(g, false, 'pukanie')).toEqual({
          text: 'Knock on the neighbours’ door.',
          how: `Select someone and right-click the door of the ${dom ? 'house' : 'block'} next door: “Knock”. By day people tend to be in; at night they’re slow to open.${zombie ? ' There are shamblers out there: go by day, with a spear.' : ''}`,
        });
        expect(
          slowa(g, true, 'pukanie').how.startsWith(
            `Tap someone and press and hold on the door of the ${dom ? 'house' : 'block'} next door: “Knock”.`,
          ),
        ).toBe(true);
        ustawJezyk('pl');
      }
  });

  it('spotkanie: okno spotkania z wyborami z gry („Porozmawiać”, „Dać jedzenie (2 porcje)”, „Zaprosić do nas”)', () => {
    const g = wRozdziale('przymorze', 'zwykly', 'r7');
    expect(slowa(g, false, 'spotkanie')).toEqual({
      text: 'Porozmawiajcie z lokatorami.',
      how: 'Kiedy ktoś otworzy, okno spotkania pokaże, kto stoi w drzwiach i co o was myśli: „Porozmawiać”, „Dać jedzenie (2 porcje)”, „Zaprosić do nas (… szans)”. Kto was zna, chętniej pomoże.',
    });
    ustawJezyk('en');
    expect(slowa(g, false, 'spotkanie')).toEqual({
      text: 'Talk to the residents next door.',
      how: 'When someone opens up, the meeting window shows who is at the door and what they think of you: “Talk”, “Give them 2 food”, “Invite them to join you (… chance)”. People who know you are more willing to help.',
    });
  });

  it('wejscie i szaber: blok z mieszkaniami i piętrami, dom bez słów z bloku; „głośno” z dopiskiem o szwendaczach w zombie', () => {
    const blok = wRozdziale('przymorze', 'zwykly', 'r7');
    expect(slowa(blok, false, 'wejscie')).toEqual({
      text: 'Wejdźcie do zamkniętego budynku.',
      how: 'Prawy przycisk na drzwiach: „Otworzyć drzwi”, a zamknięte na klucz „Wyważyć drzwi” (głośno). Pusty budynek albo mieszkanie bez lokatorów to łup bez awantury.',
    });
    expect(slowa(blok, false, 'szaber')).toEqual({
      text: 'Przeszukajcie pomieszczenie u sąsiadów.',
      how: 'W otwartym budynku prawy przycisk w pomieszczeniu: „Przeszukać …”, a na schodach „Przeszukać piętro”. Łup zanieście na podwórko („Zanieść na podwórko”), a drzwi od ulicy możecie potem zabić deskami.',
    });
    expect(
      slowa(blok, true, 'szaber').how.startsWith(
        'W otwartym budynku przytrzymajcie palec w pomieszczeniu: „Przeszukać …”',
      ),
    ).toBe(true);
    const zombie = wRozdziale('przymorze', 'zombie', 'r7');
    expect(slowa(zombie, false, 'wejscie').how).toContain('(głośno i ściąga szwendaczy)');
    const dom = wRozdziale('zielonki', 'zwykly', 'r7');
    expect(slowa(dom, false, 'wejscie').how).toBe(
      'Prawy przycisk na drzwiach: „Otworzyć drzwi”, a zamknięte na klucz „Wyważyć drzwi” (głośno). Pusty dom to łup bez awantury.',
    );
    expect(slowa(dom, false, 'szaber').how).toBe(
      'W otwartym domu prawy przycisk w pokoju: „Przeszukać …”. Łup zanieście na podwórko („Zanieść na podwórko”), a drzwi od ulicy możecie potem zabić deskami.',
    );
    ustawJezyk('en');
    expect(slowa(blok, false, 'wejscie')).toEqual({
      text: 'Get into a closed-up building.',
      how: 'Right-click a door: “Open the door”, and if it’s locked, “Force the door” (loud). An empty building, or a flat with nobody home, means loot without a row.',
    });
    expect(slowa(blok, false, 'szaber')).toEqual({
      text: 'Search a room next door.',
      how: 'Inside an open building, right-click a room: “Search the …”, or on the stairs “Search a floor upstairs”. Carry the loot home (“Carry into the yard”); you can nail planks over the street door afterwards.',
    });
    expect(slowa(zombie, false, 'wejscie').how).toContain('(loud, and it draws shamblers)');
    expect(slowa(dom, false, 'wejscie').how).toContain('An empty house means loot without a row.');
    expect(slowa(dom, false, 'szaber').how).toBe(
      'Inside an open house, right-click a room: “Search the …”. Carry the loot home (“Carry into the yard”); you can nail planks over the street door afterwards.',
    );
  });
});

describe('teksty R8 (mysz i dotyk, po polsku i po angielsku)', () => {
  it('drogi i teren: teksty z projektu', () => {
    const g = wRozdziale('lanciego', 'zwykly', 'r8');
    expect(slowa(g, false, 'drogi')).toEqual({
      text: 'Zajrzyjcie do dróg do zwycięstwa.',
      how: 'Menu, „Drogi do zwycięstwa”: pięć dróg z kamieniami milowymi; każda kończy się innym epilogiem.',
    });
    expect(slowa(g, false, 'teren')).toEqual({
      text: 'Otoczcie wspólnym płotem pierwszy sąsiedni budynek.',
      how: 'Prawy przycisk na drzwiach otwartego budynku obok: „Otoczyć wspólnym płotem (…)”, z kosztem i czasem w menu. Między wami nie może być jezdni.',
    });
    expect(slowa(g, true, 'teren').how).toBe(
      'Przytrzymajcie palec na drzwiach otwartego budynku obok: „Otoczyć wspólnym płotem (…)”, z kosztem i czasem w menu. Między wami nie może być jezdni.',
    );
    ustawJezyk('en');
    expect(slowa(g, false, 'drogi')).toEqual({
      text: 'Have a look at the roads to victory.',
      how: 'Menu, “Roads to victory”: five roads with milestones; each ends in a different epilogue.',
    });
    expect(slowa(g, false, 'teren')).toEqual({
      text: 'Put a shared fence round the first building next door.',
      how: 'Right-click the door of an open building next door: “Put up a shared fence (…)”, with the cost and time in the menu. There can’t be a road between you.',
    });
    expect(slowa(g, true, 'teren').how.startsWith('Press and hold on the door of an open building next door:')).toBe(
      true,
    );
  });

  it('teren mówi to samo zdanie, co „co dalej” drogi terenu na ekranie dróg', () => {
    const g = wRozdziale('lanciego', 'zwykly', 'r8');
    const dalej = ocenDrogi(g.gov, wejscie(g)).find((d) => d.droga === 'teren')!.dalej!;
    expect(cel(g, 'teren').text).toBe(dalej.pl);
    ustawJezyk('en');
    expect(cel(g, 'teren').text).toBe(dalej.en);
  });
});

describe.each(KOMBINACJE)('wszystkie teksty R6–R8: %s %s', (key, mode) => {
  /** teksty i podpowiedzi wszystkich celów trzech rozdziałów w obecnym języku, na myszy i na dotyku */
  function wszystkieTeksty(): string[] {
    const out: string[] = [];
    for (const k of ['r6', 'r7', 'r8'] as const)
      for (const touch of [false, true]) {
        const g = wRozdziale(key, mode, k);
        postawPracownie(g);
        wybierzBadanie(g, 't_okna');
        const v = widok(g, { touch }).rozdzial!;
        out.push(v.tytul, ...v.cele.flatMap((c) => [c.text, c.how]));
      }
    return out;
  }

  it('po polsku bez myślników (poza zakresem „3–6”), w domu bez słów z bloku', () => {
    const pl = wszystkieTeksty().join('\n');
    expect(pl.replaceAll('Ery 3–6', 'Ery 3 do 6')).not.toMatch(/[—–]/);
    if (wDomu(key)) expect(pl).not.toMatch(FORBIDDEN_DOM);
  });

  it('po angielsku bez polskich liter i słówek, w domu bez „flat”, „stairwell” i „block”', () => {
    ustawJezyk('en');
    const en = wszystkieTeksty().join('\n');
    expect(polskieSlowa(en), en).toEqual([]);
    expect(en.replaceAll('Eras 3–6', 'Eras 3 to 6')).not.toMatch(/[—–]/);
    if (wDomu(key)) expect(en).not.toMatch(/\b(flat|stairwell|block)\b/i);
  });
});

/* ---------------------------------------------------------------- każdy cel da się zrobić na każdej mapie */

describe.each(WSZYSTKIE)('przejście R6 → R7 → R8 → „koniec” samymi poleceniami gracza: %s %s', (mapa, mode) => {
  const dom = mapaDomowa(mapa);

  it('cele badań, sąsiadów i dróg zaliczają się po czynnościach z podpowiedzi, a ścieżka dochodzi do „końca”', () => {
    const g = bezAutomatu(swiezaGra(mapa, mode));
    const { st, w } = g.sim;

    /* ---- R6: pracownia, badanie, stół, odkrycie, era 2 */
    otworz(g, 'r6');
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    const lab = postawPracownie(g);
    expect(cel(g, 'pracownia').done).toBe(true);
    expect(widok(g).rozdzial!.biezacy?.key).toBe('badanie');
    const pierwsza = kartkiDoWziecia(g, 1)[0];
    expect(pierwsza, 'osada ma wiedzę na pierwszą kartkę').toBeDefined();
    wybierzBadanie(g, pierwsza);
    expect(cel(g, 'badanie').done).toBe(true);
    expect(cel(g, 'stol').done).toBe(false);
    posadzPrzyStole(g, lab);
    badajDo(g, lab, maPostep);
    expect(cel(g, 'stol').done).toBe(true);
    expect(cel(g, 'odkrycie').done).toBe(false);
    badajDo(g, lab, (x) => Object.keys(x.sim.st.research?.at ?? {}).length > 0);
    expect(cel(g, 'odkrycie').done).toBe(true);
    expect(cel(g, 'era2').done).toBe(false);
    const druga = kartkiDoWziecia(g, 2)[0];
    expect(druga, 'po pierwszej technologii jest kartka z ery 2').toBeDefined();
    wybierzBadanie(g, druga);
    posadzPrzyStole(g, lab);
    badajDo(g, lab, (x) => (x.sim.st.research?.prog[druga] ?? 0) > 0);
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie', 'r6.era2', 'r6.odkrycie', 'r6.pracownia', 'r6.stol']);

    /* ---- noc, a rano R7 u sąsiadów (za dnia, bo w trybie zombie po zmroku za siatką jest stado) */
    graj(g, (x) => doba(x) === 3 && godzina(x) >= 8, {}, 4 * 960);
    expect(g.sciezka.rozdzial).toBe('r7');
    expect(klucze(g)).toEqual(['pukanie', 'spotkanie', 'wejscie', 'szaber']);
    const kto = rdzen(g.sim).at(-1)!;

    // pukanie: polecenie „Zapukać” na drzwiach najbliższego zamieszkanego budynku
    const pierwszy = budynkiSasiadow(w, true)[0];
    expect(cel(g, 'pukanie').done).toBe(false);
    bezSzwendaczy(g);
    g.sim.push({ t: 'knock', ids: [kto.id], door: pierwszy.door });
    g.sim.step();
    expect(cel(g, 'pukanie').done).toBe(true);

    // spotkanie: ktoś otwiera, okno spotkania ma linię celu, a po spotkaniu cel jest zrobiony
    expect(cel(g, 'spotkanie').done).toBe(false);
    pukajAzDoSpotkania(g, kto);
    expect(celWOknie(widok(g), 'spotkanie')).toBe(dom ? 'Porozmawiajcie z sąsiadami.' : 'Porozmawiajcie z lokatorami.');
    zakonczSpotkanie(g);
    expect(cel(g, 'spotkanie').done).toBe(true);

    // wejście: otwarcie albo wyważenie drzwi zamkniętego budynku
    const zamkniety = [...budynkiSasiadow(w, false), ...budynkiSasiadow(w, true)].find(
      ({ bid, door }) =>
        drzwiZewnNaStart(w, mode, bid, door).s === 'zamkniete' && !st.sasiedzi?.budynki.some((b) => b.bid === bid),
    )!;
    expect(cel(g, 'wejscie').done).toBe(false);
    otworzBudynek(g, kto, zamkniety.bid, zamkniety.door);
    expect(cel(g, 'wejscie').done).toBe(true);

    // szaber: przeszukanie pomieszczenia w otwartym budynku zamyka rozdział
    expect(cel(g, 'szaber').done).toBe(false);
    przeszukajPokoj(g, kto, zamkniety.bid);
    expect(krok(g).rozdzial).toBe('r8');
    expect(zrobione(g, 'r7')).toEqual(['r7.pukanie', 'r7.spotkanie', 'r7.szaber', 'r7.wejscie']);

    /* ---- R8: ekran dróg, kolejny kamień ludności, a tam, gdzie można, wspólny płot */
    expect(klucze(g)).toEqual(PLOT_NA_MAPIE[mapa] ? ['drogi', 'ludnosc', 'teren'] : ['drogi', 'ludnosc']);
    zdarz(g, 'drogi');
    expect(cel(g, 'drogi').done).toBe(true);
    const kamienLudnosci = kamienie(g).ludnosc ?? 0;
    expect(g.sciezka.start.kamienLudnosci).toBe(kamienLudnosci);
    const prog = [10, 25, 50, Math.ceil(celLudnosci(wejscie(g), mode) / 2)][kamienLudnosci];
    przyjmijLudzi(g, prog - populacja(st).razem);
    sekunda(g);
    expect(kamienie(g).ludnosc).toBe(kamienLudnosci + 1);
    if (PLOT_NA_MAPIE[mapa]) {
      expect(cel(g, 'ludnosc').done).toBe(true);
      expect(cel(g, 'teren').done).toBe(false);
      otoczPlotem(g);
      sekunda(g);
      expect(kamienie(g).teren).toBe(1);
    }
    expect(krok(g).rozdzial).toBe('koniec');
    expect(zrobione(g, 'r8')).toEqual(
      PLOT_NA_MAPIE[mapa] ? ['r8.drogi', 'r8.ludnosc', 'r8.teren'] : ['r8.drogi', 'r8.ludnosc'],
    );

    /* ---- po R8: zostaje droga ludnościowa (technologia ma dwa kamienie, teren zrobiony albo niemożliwy) */
    expect(kamienie(g).technologia).toBe(2);
    const v = widok(g);
    expect(v.rozdzial).toBeNull();
    expect(v.drogi!.map((r) => r.nazwa)).toEqual(['Nowe osiedle']);
    expect(v.drogi![0].dalej).toBe(
      `Zbierzcie ${[10, 25, 50, 63][kamienLudnosci + 1] ?? ''} osób pod zarządem.`.replace(
        '63',
        String(Math.ceil(celLudnosci(wejscie(g), mode) / 2)),
      ),
    );
    expect(celeHtml(v, { otwarte: true, touch: false })).toContain('Nowe osiedle: Zbierzcie ');
  });
});

/* ---------------------------------------------------------------- warunki brzegowe celów badań i dróg */

describe.each(KOMBINACJE)('R6: wpis postępu równy zero niczego nie zalicza: %s %s', (key, mode) => {
  it('stol: badanie wybrane, ale nikt jeszcze nie siadł (postęp 0)', () => {
    const g = wRozdziale(key, mode, 'r6');
    postawPracownie(g);
    g.sim.st.research = { cur: kartkiDoWziecia(g, 1)[0], prog: { t_okna: 0 }, at: {} };
    expect(cel(g, 'badanie').done).toBe(true);
    expect(cel(g, 'stol').done).toBe(false);
  });

  it('era2: wpis postępu technologii z ery 2 równy zero to jeszcze nie początek badania', () => {
    const g = wRozdziale(key, mode, 'r6');
    const { st } = g.sim;
    postawPracownie(g);
    st.techDone = ['t_okna'];
    st.research = { cur: 't_spawanie', prog: { t_okna: 12, t_spawanie: 0 }, at: { t_okna: st.tick } };
    expect(cel(g, 'odkrycie').done).toBe(true);
    expect(cel(g, 'era2').done).toBe(false);
    st.research.prog.t_spawanie = 0.5;
    expect(krok(g).rozdzial).toBe('r7');
    expect(zrobione(g, 'r6')).toContain('r6.era2');
  });
});

describe('R6: istnienie celów badań', () => {
  it('kartka bez działania w nowej grze (odwrócona, „do tego trzeba prądu”) nie daje wiedzy do celu', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczDrogi(g);
    otworz(g, 'r6');
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    // wszystkie kartki ery 1 odwrócone: nie ma czego wziąć, więc nie ma celów badań; ery 2 zostają
    const era1 = TECHS.filter((t) => t.era === 1);
    try {
      for (const t of era1) (t as { dziala: boolean }).dziala = false;
      expect(klucze(g)).toEqual(['pracownia', 'era2']);
    } finally {
      for (const t of era1) (t as { dziala: boolean }).dziala = true;
    }
    expect(klucze(g)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
  });

  it('zaliczony cel zostaje na liście, choć jego warunek w stanie gry już nie jest prawdziwy, a wiedzy nie ma', () => {
    const g = poPierwszymRaporcie('przymorze', 'zwykly');
    wlaczDrogi(g);
    const { st } = g.sim;
    for (const o of st.people) o.skills = {};
    delete st.books;
    otworz(g, 'r6');
    // wybór badania zalicza `badanie` (stan sprzed zdjęcia wyboru), potem gracz zdejmuje wybór: nic nie jest zbadane
    st.research = { cur: 't_okna', prog: {}, at: {} };
    expect(klucze(g)).toEqual(['pracownia', 'badanie']);
    krok(g);
    expect(g.sciezka.zrobione).toHaveProperty(['r6.badanie']);
    st.research.cur = null;
    expect(zrobione(g, 'r6')).toEqual(['r6.badanie']);
    expect(klucze(g)).toEqual(['pracownia', 'badanie']);
    expect(cel(g, 'badanie').done).toBe(true);
  });

  it('losowe umiejętności i książki: `badanie`, `stol` i `odkrycie` są wtedy i tylko wtedy, gdy któraś kartka ery 1 ma dość wiedzy (wiedza z kart tablicy), `era2` gdy któraś z ery 2', () => {
    const rnd = mulberry(77);
    for (let k = 0; k < 40; k++) {
      const g = poPierwszymRaporcie('przymorze', k % 2 ? 'zombie' : 'zwykly');
      wlaczDrogi(g);
      const { st } = g.sim;
      for (const o of st.people)
        o.skills = Object.fromEntries(TECH_DOMS.filter(() => rnd() < 0.35).map((d) => [d, Math.floor(rnd() * 4)]));
      if (rnd() < 0.5) st.books = { [TECH_DOMS[Math.floor(rnd() * TECH_DOMS.length)]]: 1 + Math.floor(rnd() * 3) };
      otworz(g, 'r6');
      const tryb = modeOf(st);
      const moze = (era: number) => TECHS.some((t) => t.era === era && t.dziala && kartka(st, t.id, tryb).ma >= t.lvl);
      const lista = klucze(g);
      expect(lista.includes('badanie'), `przebieg ${k}: badanie`).toBe(moze(1));
      expect(lista.includes('stol'), `przebieg ${k}: stol`).toBe(moze(1));
      expect(lista.includes('odkrycie'), `przebieg ${k}: odkrycie`).toBe(moze(1));
      expect(lista.includes('era2'), `przebieg ${k}: era2`).toBe(moze(2));
    }
  });
});

describe('R8: zaliczony cel ludności nie znika, gdy zabraknie wejścia zarządu', () => {
  it('widok bez wejścia zarządu dalej ma zaliczony cel (z tekstem zastępczym), a niezaliczonego nie ma', () => {
    const g = wRozdziale('lanciego', 'zwykly', 'r8');
    const bezWejscia = () => widokSciezki(g.sciezka, { ...odczyt(g), input: null }).rozdzial!.cele.map((c) => c.key);
    expect(bezWejscia()).not.toContain('ludnosc');
    const prog = [10, 25, 50][kamienie(g).ludnosc ?? 0];
    przyjmijLudzi(g, prog - populacja(g.sim.st).razem);
    sekunda(g);
    expect(cel(g, 'ludnosc').done).toBe(true);
    expect(bezWejscia()).toContain('ludnosc');
    const c = widokSciezki(g.sciezka, { ...odczyt(g), input: null }).rozdzial!.cele.find((x) => x.key === 'ludnosc')!;
    expect(c).toMatchObject({ done: true, text: 'Zbierzcie więcej osób pod zarządem.' });
  });
});

describe.each(KOMBINACJE)('R7: słowa „blok” i „dom” idą za słownikiem sąsiadów: %s %s', (key, mode) => {
  it('„sąsiedniego domu” dokładnie wtedy, gdy `Words.sasiad` mówi „zza płotu”', () => {
    const g = wRozdziale(key, mode, 'r7');
    const domy = odczyt(g).words.sasiad === 'zza płotu';
    expect(cel(g, 'pukanie').how.includes('sąsiedniego domu')).toBe(domy);
    expect(cel(g, 'pukanie').how.includes('sąsiedniego bloku')).toBe(!domy);
    expect(cel(g, 'spotkanie').text).toBe(domy ? 'Porozmawiajcie z sąsiadami.' : 'Porozmawiajcie z lokatorami.');
    expect(cel(g, 'szaber').how.includes('schodach')).toBe(!domy);
  });
});

describe.each(KOMBINACJE)('stary zapis: „koniec” z wersji bez R6: %s %s', (key, mode) => {
  it('po wczytaniu pierwszy krok otwiera R6 od chwili wczytania i ścieżka rusza dalej', () => {
    const g = poPierwszymRaporcie(key, mode);
    wlaczDrogi(g);
    const tick = g.sim.st.tick;
    const zrobioneStare: Record<string, number> = {};
    const przepadle: string[] = [];
    for (const r of ROZDZIALY.slice(0, 5))
      for (const c of r.cele) {
        // drewno na wieczór, drewno na noc i dyżur przepadają, jeśli nie zrobiono ich w nocy; reszta jest zrobiona
        if (['r0.drewno', 'r1.drewno2', 'r1.dyzur'].includes(`${r.k}.${c.key}`)) przepadle.push(`${r.k}.${c.key}`);
        else zrobioneStare[`${r.k}.${c.key}`] = tick - 4000;
      }
    g.sciezka = { ...nowyStanSciezki(), rozdzial: 'koniec', od: tick - 3000, zrobione: zrobioneStare, przepadle };
    const h = przezZapis(g);
    expect(h.sciezka.rozdzial).toBe('koniec');
    expect(krok(h).rozdzial).toBe('r6');
    expect(h.sciezka.od).toBe(h.sim.st.tick);
    expect(h.sciezka.start).toEqual(licznikiStartu(h.sim.st, h.gov));
    expect(widok(h).rozdzial!.tytul).toBe('Badania');
    expect(klucze(h)).toEqual(['pracownia', 'badanie', 'stol', 'odkrycie', 'era2']);
    for (const k of Object.keys(zrobioneStare)) expect(h.sciezka.zrobione[k]).toBe(zrobioneStare[k]);
  });
});
