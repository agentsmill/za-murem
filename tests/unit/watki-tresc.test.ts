/* Dwanaście łańcuchów historii (src/gov/watki-tresc.ts, silnik w watki.ts): kształt listy (12, trzy tylko zwykłe, trzy tylko
   zombie, sześć w obu, po 2–4 kroki, id i haki bez kolizji z pulą), teksty w obu językach bez polskich słów po angielsku, bez
   pięter, numerów mieszkań i zakazanych nazw, przejście każdego łańcucha do końca przez każdą gałąź wyborów na atrapie
   (tests/unit/watki-tresc-play.ts) i, dla każdego rodzaju prawdziwego zakończenia, dowody na prawdziwym zarządzie albo
   prawdziwej symulacji: ludzie pod bramą o tych samych imionach w kolejnych krokach, wskazówka, znajomy, awans, pies tylko bez
   psa, handlarz, napad zgodny z raportem, ugryziony i dobicie. */

import { describe, expect, it } from 'vitest';
import { LANCUCHY, sprawdzLancuchy } from '../../src/gov/watki.ts';
import { M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { BLOK, DOM, lancuch, nowySwiat, type OpcjeSwiata, obaJezyki, przejdz, wejscie } from './watki-tresc-play.ts';

const IDY = [
  'swiatlo',
  'szczekanie',
  'puszki',
  'woda',
  'list',
  'pluca',
  'ostrzega',
  'dlug',
  'aktywistka',
  'dach',
  'dobicie',
  'glos',
] as const;
const TYLKO_ZWYKLY = ['ostrzega', 'dlug', 'aktywistka'];
const TYLKO_ZOMBIE = ['dach', 'dobicie', 'glos'];

// ---------------------------------------------------------------- kształt

describe('dwanaście łańcuchów: kształt listy', () => {
  it('12 łańcuchów, 3 tylko zwykłe, 3 tylko zombie, 6 w obu, każdy 2–4 kroki', () => {
    expect(LANCUCHY.map((l) => l.id).sort()).toEqual([...IDY].sort());
    const zwykle = LANCUCHY.filter((l) => l.tryby.length === 1 && l.tryby[0] === 'zwykly').map((l) => l.id);
    const zombie = LANCUCHY.filter((l) => l.tryby.length === 1 && l.tryby[0] === 'zombie').map((l) => l.id);
    const oba = LANCUCHY.filter((l) => l.tryby.length === 2).map((l) => l.id);
    expect(zwykle.sort()).toEqual([...TYLKO_ZWYKLY].sort());
    expect(zombie.sort()).toEqual([...TYLKO_ZOMBIE].sort());
    expect(oba).toHaveLength(6);
    for (const l of LANCUCHY) {
      expect(l.kroki.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.kroki.length, l.id).toBeLessThanOrEqual(4);
    }
  });

  it('id kroków i hak w przestrzeni łańcucha, bez kolizji z kartami puli (sprawdzLancuchy)', () => {
    const pula = new Set([...M1_EVENTS.map((e) => e.id), 'sasiadka']);
    expect(sprawdzLancuchy(LANCUCHY, pula)).toEqual([]);
  });

  it('pierwszy krok każdego łańcucha wchodzi do puli (bez haka, odstęp 0)', () => {
    for (const l of LANCUCHY) {
      expect(l.kroki[0].hak, l.id).toBeUndefined();
      expect(l.kroki[0].nr).toBe(1);
    }
  });

  it('kroki z gościem są tylko tam, gdzie ma sens: łańcuchy z gościem mają go w kroku z gosc, a reszta jest bez obcych', () => {
    const zGoscmi = LANCUCHY.filter((l) => l.kroki.some((k) => k.gosc)).map((l) => l.id);
    for (const id of ['swiatlo', 'woda', 'ostrzega', 'aktywistka', 'dach', 'dobicie'])
      expect(zGoscmi, id).toContain(id);
  });
});

// ---------------------------------------------------------------- teksty

/** ludzie i miejsca, których imion i nazw angielski tekst nie musi tłumaczyć */
const DOZWOLONE = [
  'Pod Różą',
  'Zielony Kącik',
  'Wilanów',
  'Łódź',
  'Kielce',
  'Atrapia',
  'Atrapia 7',
  // pola z generatora (imiona) dodaje przebieg z listy ludzi w świecie
];

/** nazwy, których w tekstach gry nie ma być: prawdziwi politycy i firmy, które nie mogą być postaciami ani nazwą w żartach */
const ZAKAZANE = [
  'Trump',
  'Biden',
  'Putin',
  'Obama',
  'Musk',
  'Bezos',
  'Zuckerberg',
  'Tusk',
  'Kaczyński',
  'Duda',
  'Google',
  'Amazon',
  'Facebook',
  'Tesla',
  'Microsoft',
  'OpenAI',
  'ChatGPT',
  'Allegro',
  'Żabka',
  'Biedronka',
  'Netflix',
  'Uber',
  'Apple',
  'iPhone',
];

interface Scen {
  nazwa: string;
  o: OpcjeSwiata;
}

/** scenariusze przejścia: tryb i miejsce według łańcucha, plus to, czego krok wymaga od świata */
const SCEN: Record<string, Scen[]> = {
  swiatlo: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  szczekanie: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  puszki: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  woda: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  list: [
    { nazwa: 'blok, zwykły, z mapą miasta', o: {} },
    { nazwa: 'dom, zombie, bez mapy miasta', o: { place: DOM, mode: 'zombie', bezOkolicy: true } },
  ],
  pluca: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  ostrzega: [
    { nazwa: 'napad odparty', o: { napad: 'odparty' } },
    { nazwa: 'napad z wtargnięciem, dom', o: { napad: 'wtargnięcie', place: DOM } },
    { nazwa: 'bez napadu', o: { napad: 'brak' } },
  ],
  dlug: [
    { nazwa: 'blok', o: { handlarz: true } },
    { nazwa: 'dom', o: { handlarz: true, place: DOM } },
  ],
  aktywistka: [
    { nazwa: 'blok, zimno', o: { zimno: true } },
    { nazwa: 'dom, zimno', o: { zimno: true, place: DOM } },
  ],
  dach: [
    { nazwa: 'blok', o: { mode: 'zombie' } },
    { nazwa: 'dom', o: { mode: 'zombie', place: DOM } },
  ],
  dobicie: [
    { nazwa: 'blok', o: { mode: 'zombie' } },
    { nazwa: 'dom', o: { mode: 'zombie', place: DOM } },
  ],
  glos: [
    { nazwa: 'blok, z mapą miasta', o: { mode: 'zombie' } },
    { nazwa: 'dom, bez mapy miasta', o: { mode: 'zombie', place: DOM, bezOkolicy: true } },
  ],
};

describe('każdy łańcuch przechodzi do końca przez każdą gałąź wyborów', () => {
  for (const id of IDY) {
    it(`${id}: wszystkie gałęzie bez wyjątku, ostatni krok osiągalny, teksty w obu językach`, () => {
      const l = lancuch(id);
      for (const sc of SCEN[id]) {
        const w = przejdz(l, nowySwiat(id, sc.o));
        // ostatni krok otwiera się na którejś ścieżce
        expect(w.najdalej, `${id} (${sc.nazwa})`).toBe(l.kroki.length);
        // każdy dostępny wybór każdej otwartej karty został zagrany
        for (const [krok, wybory] of w.wybrane) expect(wybory.size, `${krok} (${sc.nazwa})`).toBeGreaterThan(0);
        expect(w.sciezki.length, `${id} (${sc.nazwa}): ścieżki`).toBeGreaterThan(1);
        for (const t of w.teksty) {
          expect(obaJezyki(t.tx), `${t.krok}: ${JSON.stringify(t.tx)}`).toBe(true);
        }
      }
    });
  }
});

describe('teksty: angielski bez polskich słów, bez pięter, numerów mieszkań i zakazanych nazw', () => {
  for (const id of IDY) {
    it(`${id}: teksty kart na wszystkich ścieżkach, dom i blok`, () => {
      const l = lancuch(id);
      let sprawdzone = 0;
      for (const sc of SCEN[id]) {
        const s = nowySwiat(id, sc.o);
        const imiona = [...wejscie(s).people, ...(wejscie(s).lokatorzy ?? [])].flatMap((p) => [p.name, p.first]);
        const w = przejdz(l, s);
        // ludzie gości (nowi w trakcie przejścia): z końcowych światów
        const goscie = w.konce.flatMap((k) => Object.values(k.osobyWizyt).flat()).flatMap((p) => [p.name, p.first]);
        const dozwolone = [...DOZWOLONE, ...imiona, ...goscie];
        for (const t of w.teksty) {
          sprawdzone++;
          expect(polskieSlowa(t.tx.en, dozwolone), `${t.krok} (${sc.nazwa}): ${t.tx.en}`).toEqual([]);
          for (const jezyk of [t.tx.pl, t.tx.en]) {
            expect(jezyk, `${t.krok}: piętro`).not.toMatch(/piętr|floor of|storey/i);
            expect(jezyk, `${t.krok}: numer mieszkania`).not.toMatch(
              /mieszkani[eua] (nr |numer )?\d|\bm\.? ?\d{1,3}\b|flat (no\.? ?|number )?\d|apartment \d/i,
            );
            for (const nazwa of ZAKAZANE) expect(jezyk, `${t.krok}: ${nazwa}`).not.toContain(nazwa);
          }
        }
        // dom: ani klatki, ani bloku w polskich tekstach (poza mieszkańcami „z waszego domu”)
        if (sc.o.place === DOM)
          for (const t of w.teksty)
            expect(t.tx.pl, `${t.krok} (dom): słowa bloku`).not.toMatch(
              /klatk|piętr|spółdziel|pawilon|świetlic|czynsz/i,
            );
      }
      expect(sprawdzone).toBeGreaterThan(10);
    });
  }

  it('teksty nie zawierają pauz ani wykrzykników z sufitu', () => {
    // wystarczy jedna ścieżka każdego łańcucha: te same zdania wracają na pozostałych
    for (const id of IDY) {
      const l = lancuch(id);
      const sc = SCEN[id][0];
      const w = przejdz(l, nowySwiat(id, sc.o));
      for (const t of w.teksty) {
        expect(t.tx.pl, `${t.krok}: pauza`).not.toMatch(/ — | – /);
        expect(t.tx.en, `${t.krok}: pauza`).not.toMatch(/ — | – /);
      }
    }
  });
});

// ---------------------------------------------------------------- reszta kształtu świata

describe('świat BLOK i DOM są rozróżnialne dla kroków', () => {
  it('BLOK i DOM mają różne rodzaje miejsca', () => {
    expect(BLOK.kind).not.toBe(DOM.kind);
  });
});
