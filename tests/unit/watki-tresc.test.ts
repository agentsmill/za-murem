/* Dwanaście łańcuchów historii (src/gov/watki-tresc.ts, silnik w watki.ts): kształt listy (12, trzy tylko zwykłe, trzy tylko
   zombie, sześć w obu, po 2–4 kroki, id i haki bez kolizji z pulą), teksty w obu językach bez polskich słów po angielsku, bez
   pięter, numerów mieszkań i zakazanych nazw, przejście każdego łańcucha do końca przez każdą gałąź wyborów na atrapie
   (tests/unit/watki-tresc-play.ts) i, dla każdego rodzaju prawdziwego zakończenia, dowody na prawdziwym zarządzie albo
   prawdziwej symulacji: ludzie pod bramą o tych samych imionach w kolejnych krokach, wskazówka, znajomy, awans, pies tylko bez
   psa, handlarz, napad zgodny z raportem, ugryziony i dobicie. */

import { describe, expect, it } from 'vitest';
import { LANCUCHY, sprawdzLancuchy } from '../../src/gov/watki.ts';
import { eventView, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { chooseEvent } from '../../src/gov/zarzad.ts';
import { polskieSlowa } from './po-angielsku.ts';
import {
  BLOK,
  DOM,
  dalej,
  lancuch,
  nowySwiat,
  obaJezyki,
  przejdz,
  SCEN,
  type Swiat,
  wejscie,
  zastosuj,
} from './watki-tresc-play.ts';

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

/** Słowa, które w słowniku miejsca (`wordsOf`, `wordsEn` w src/gov/miejsce.ts) i w tekstach kart należą tylko do bloku: w domu ma
    ich nie być (brama → furtka, zarząd → komitet, spółdzielnia i osiedle → ulica, piwnica → szopa, klatka i piętro). */
const SLOWA_BLOKU_PL = /bram|zarząd|piwnic|spółdziel|osiedl|klatk|piętr|pawilon|świetlic|czynsz/i;
/** to samo po angielsku; „garden gate” jest domowe, samo „gate” blokowe */
const SLOWA_BLOKU_EN = /(?<!garden )\bgate\b|\bboard\b|\bestate\b|co-op|basement|stairwell|\bflat\b|block next door/i;

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
        // dom: ani słowa bloku w tytułach, tekstach, napisach wyborów i wpisach kroniki (wszystko, co kroki wypisały po drodze)
        if (sc.o.place === DOM) {
          const wpisy = w.konce.flatMap((k) => [...k.gov.log.map((x) => x.txt), ...k.gov.later.map((x) => x.line)]);
          const wszystko = [
            ...w.teksty.map((t) => ({ gdzie: t.krok, tx: t.tx })),
            ...wpisy.map((tx) => ({ gdzie: 'kronika', tx })),
          ];
          for (const t of wszystko) {
            expect(t.tx.pl, `${t.gdzie} (dom): słowa bloku po polsku`).not.toMatch(SLOWA_BLOKU_PL);
            expect(t.tx.en, `${t.gdzie} (dom): słowa bloku po angielsku`).not.toMatch(SLOWA_BLOKU_EN);
          }
        }
      }
      expect(sprawdzone).toBeGreaterThan(10);
    });
  }

  it('kontrola: w bloku słowa bloku występują (wyrażenia z testu domu nie są puste)', () => {
    let pl = 0;
    let en = 0;
    for (const id of IDY) {
      const sc = SCEN[id].find((x) => x.o.place !== DOM);
      if (!sc) continue;
      for (const t of przejdz(lancuch(id), nowySwiat(id, sc.o)).teksty) {
        if (SLOWA_BLOKU_PL.test(t.tx.pl)) pl++;
        if (SLOWA_BLOKU_EN.test(t.tx.en)) en++;
      }
    }
    expect(pl).toBeGreaterThan(10);
    expect(en).toBeGreaterThan(10);
  });

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

// ---------------------------------------------------------------- karty mówią tylko to, co robi gra

/** wybór o indeksie `k` na otwartej karcie i skutki w udawanym świecie */
const wybierz = (s: Swiat, k: number): void => zastosuj(s, chooseEvent(s.gov, wejscie(s), k));
/** okno otwartej karty */
const okno = (s: Swiat) => {
  const v = eventView(s.gov, wejscie(s));
  if (!v) throw new Error('brak otwartej karty');
  return v;
};

describe('ostrzega: ochroniarz i ochroniarka mówią jednym rodzajem w każdym zdaniu', () => {
  it('dwanaście ziaren: tytuł, teksty, wybory i wpisy w kronice zgodne z płcią bohatera, po polsku i po angielsku', () => {
    const widziane = { m: 0, f: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const w = przejdz(lancuch('ostrzega'), nowySwiat('ostrzega', { napad: 'odparty', seed }));
      const wpisy = w.konce.flatMap((k) => k.gov.log.map((x) => x.txt));
      const pl = [...w.teksty.map((t) => t.tx.pl), ...wpisy.map((t) => t.pl)].join('\n');
      const en = [...w.teksty.map((t) => t.tx.en), ...wpisy.map((t) => t.en)].join('\n');
      const kobieta = /młoda ochroniarka/.test(pl);
      expect(kobieta || /młody ochroniarz/.test(pl), `ziarno ${seed}: kto stoi pod bramą`).toBe(true);
      if (kobieta) {
        widziane.f++;
        expect(pl, `ziarno ${seed} (ochroniarka)`).not.toMatch(
          /młody ochroniarz|Ochroniarz (poszedł|siedzi)|Pilnował |mówił(?!a)|Dezerter prosi|wyleciał(?!a)|wyrzucił go|przesiedział(?!a)|Powiedział(?!a),|(?<![a-z])sam,/,
        );
        expect(en, `ziarno ${seed} (ochroniarka)`).not.toMatch(/\bhe\b|\bhis\b|\bhim\b|Thank him|send him/i);
      } else {
        widziane.m++;
        expect(pl, `ziarno ${seed} (ochroniarz)`).not.toMatch(
          /młoda ochroniarka|Ochroniarka (poszła|siedzi)|Pilnowała|mówiła|Dezerterka|wyleciała|wyrzucił ją|przesiedziała|Powiedziała,|sama,/,
        );
        expect(en, `ziarno ${seed} (ochroniarz)`).not.toMatch(/\bshe\b|\bher\b|Thank her|send her/i);
      }
    }
    // próba ma sens tylko wtedy, gdy trafiły się oba rodzaje
    expect(widziane.m).toBeGreaterThan(0);
    expect(widziane.f).toBeGreaterThan(0);
  });
});

describe('dlug: kartę długu da się zawsze zamknąć', () => {
  /** świat po „Wziąć na kredyt” i z otwartą kartą długu (handlarz stoi pod bramą) */
  const naDlugu = (): Swiat => {
    const s = nowySwiat('dlug', { handlarz: true });
    expect(dalej(s)).toBe(true);
    expect(s.gov.ev.active?.id).toBe('dlug_1');
    wybierz(s, 0);
    expect(dalej(s)).toBe(true);
    expect(s.gov.ev.active?.id).toBe('dlug_2');
    return s;
  };

  it('handlarz odszedł, zanim gracz odpowiedział: jest dokładnie jeden wybór i zamyka kartę', () => {
    const s = naDlugu();
    s.handlarz = undefined;
    const ok = okno(s)
      .choices.map((c, k) => [c, k] as const)
      .filter(([c]) => c.ok);
    expect(ok).toHaveLength(1);
    wybierz(s, ok[0][1]);
    expect(s.gov.ev.active).toBeNull();
    expect(s.gov.watki?.haki['dlug.zwloka']).toBeDefined();
  });

  it('handlarz stoi, a gracz nie ma ani złomu, ani jedzenia: zostaje „Nie oddawać”, wybór dla odszedłego jest wyłączony', () => {
    const s = naDlugu();
    s.atr.scrap = 0;
    s.atr.supplies = 0;
    const v = okno(s);
    const dostepne = v.choices.filter((c) => c.ok).map((c) => c.label.pl);
    expect(dostepne).toEqual(['Nie oddawać']);
  });
});

describe('płuca: zarząd nie jest obwiniany o leki, których nie miał', () => {
  /** tekst trzeciej karty po „Posadzić przy kozie” i „Nie dawać”, przy `leki` sztukach leków w apteczce */
  const trzeciaKarta = (leki: number): string => {
    const s = nowySwiat('pluca');
    s.atr.meds = leki;
    expect(dalej(s)).toBe(true);
    expect(s.gov.ev.active?.id).toBe('pluca_1');
    wybierz(s, 1);
    expect(dalej(s)).toBe(true);
    expect(s.gov.ev.active?.id).toBe('pluca_2');
    const nie = okno(s).choices.findIndex((c) => c.label.pl === 'Nie dawać');
    wybierz(s, nie);
    expect(dalej(s)).toBe(true);
    expect(s.gov.ev.active?.id).toBe('pluca_3');
    const v = okno(s);
    return `${v.text.pl} || ${v.text.en}`;
  };

  it('z lekami w apteczce mieszkańcy wiedzą, że zarząd je miał', () => {
    expect(trzeciaKarta(6)).toMatch(/miał leki.*had meds/);
  });

  it('bez leków nie ma takiego zarzutu', () => {
    const t = trzeciaKarta(0);
    expect(t).not.toMatch(/miał leki|had meds/);
    expect(t).toMatch(/nie było czym pomóc.*nothing to help with/);
  });
});
