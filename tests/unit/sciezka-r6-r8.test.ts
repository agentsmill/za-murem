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
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import {
  celLudnosci,
  DROGI,
  krokZwyciestwa,
  ocenDrogi,
  terenMozliwy,
  wlaczZwyciestwo,
} from '../../src/gov/zwyciestwo.ts';
import { nazwaTech, TECH_BY } from '../../src/sim/badania.ts';
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
import { core as rdzen } from './sasiedzi-pomoc.ts';
import {
  badajDo,
  bezSzwendaczy,
  budynkiSasiadow,
  kartkiDoWziecia,
  MAPY,
  type Mapa,
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
    const { door } = budynkiSasiadow(w, true)[0];
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
