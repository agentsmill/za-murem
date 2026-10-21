/* Ocena przebiegów osady AI (tools/osada-ocena.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 2). Funkcje oceny są czyste, więc testy składają
   syntetyczne przebiegi (`przebiegi`) i sprawdzają werdykt: przeżycie 45 dni w co najmniej 4 z 5 ziaren, pierwszy kamień
   ludności (10 osób) w paśmie dni, co najmniej jedna budowla na trzy dni, każde w co najmniej 4 z 5 przebiegów na demie.
   Uprząż (tools/bot-osada.ts) ma testy argumentów, tabeli i jednej gry (`zagraj`, kilka dób na prawdziwej symulacji);
   procesy równoległe i pełny pomiar to ręczne `npm run bot:osada`. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Decydent, grajDo, nowaGraAi, skrotGry } from '../../src/ai/gra.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { buildWorld } from '../../src/world/world.ts';
import {
  dniLudnosci,
  naglowekTabeli,
  opisZawieszonych,
  ostatniePoranki,
  parsujArgumenty,
  parsujZiarna,
  poranekTick,
  przygotujGre,
  streszczenieBledu,
  wierszPrzebiegu,
  zagraj,
} from '../../tools/bot-osada.ts';
import {
  budowleNaKoniec,
  type DzienPrzebiegu,
  dzienKamienia,
  ludnoscWDniu,
  PROGI,
  type Przebieg,
  przezyl,
  werdykt,
} from '../../tools/osada-ocena.ts';

/** poranek z samymi liczbami, które liczy ocena (reszta spokojnie) */
function poranek(dzien: number, ludnosc: number, budowle: number): DzienPrzebiegu {
  return {
    dzien,
    ludnosc,
    zarzad: 4,
    budowle,
    badania: 0,
    jedzenie: 20,
    drewno: 10,
    zimni: 0,
    glodni: 0,
    zaufanie: 60,
    wkurzenie: 20,
  };
}

interface OpcjePrzebiegu {
  ziarno: number;
  demo: string;
  /** żyje do końca; inaczej odwołanie w dniu `koniecDzien` */
  zyje: boolean;
  koniecDzien: number;
  /** pierwszy poranek z 10 osobami (null: ludność zostaje poniżej 10) */
  kamien: number | null;
  /** liczba budowli na ostatnim poranku */
  budowle: number;
  dni: number;
}

/** jeden syntetyczny przebieg: poranki od dnia 2 do dnia `dni + 1` (gra od 15:00 dnia 1 trwa `dni` dób) albo do końca */
function przebieg(o: OpcjePrzebiegu): Przebieg {
  const ostatni = o.zyje ? o.dni + 1 : o.koniecDzien;
  const poranki: DzienPrzebiegu[] = [];
  for (let d = 2; d <= ostatni; d++)
    poranki.push(
      poranek(
        d,
        o.kamien !== null && d >= o.kamien ? 12 : 8,
        d === ostatni ? o.budowle : Math.floor((o.budowle * d) / ostatni),
      ),
    );
  return {
    demo: o.demo,
    ziarno: o.ziarno,
    dni: o.dni,
    koniec: o.zyje ? null : { dzien: o.koniecDzien, przyczyna: 'odwolanie' },
    poranki,
  };
}

/** Pięć przebiegów dema (domyślnie `przymorze`, ziarna 11–15). `dozyly` pierwszych żyje do końca, reszta kończy się
    odwołaniem w dniu 20. `kamien` i `budowle` to jedna liczba dla wszystkich albo po jednej na przebieg. */
function przebiegi(
  o: {
    dozyly?: number;
    kamien?: number | null | readonly (number | null)[];
    budowle?: number | readonly number[];
    dni?: number;
    demo?: string;
    ile?: number;
  } = {},
): Przebieg[] {
  const ile = o.ile ?? 5;
  const dni = o.dni ?? 45;
  const dozyly = o.dozyly ?? ile;
  const wartosc = <T>(w: T | readonly T[] | undefined, k: number, domyslna: T): T => {
    if (w === undefined) return domyslna;
    return Array.isArray(w) ? (w as readonly T[])[k] : (w as T);
  };
  return Array.from({ length: ile }, (_, k) =>
    przebieg({
      ziarno: 11 + k,
      demo: o.demo ?? 'przymorze',
      zyje: k < dozyly,
      koniecDzien: 20,
      kamien: wartosc(o.kamien, k, 12),
      budowle: wartosc(o.budowle, k, 16),
      dni,
    }),
  );
}

describe('progi', () => {
  it('cel kontrolny etapu: 4 z 5 ziaren, kamień między 8. a 15. dniem, jedna budowla na trzy dni', () => {
    expect(PROGI).toEqual({ przezyc: 4, zZiaren: 5, kamien: [8, 15], budowlaNaDni: 3 });
  });
});

describe('werdykt', () => {
  it('pięć przebiegów, cztery dożyły, kamień w 12. dniu, budowle wystarczą: ok', () => {
    const w = werdykt(przebiegi({ dozyly: 4, kamien: 12, budowle: 16, dni: 45 }));
    expect(w.ok).toBe(true);
    expect(w.bledy).toEqual([]);
  });

  it('tylko trzy z pięciu dożyły: błąd z nazwą dema', () => {
    const w = werdykt(przebiegi({ dozyly: 3, kamien: 12, budowle: 16, dni: 45 }));
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('przymorze');
    // błąd mówi, ile przeżyło i ilu trzeba, i które ziarna skończyły się w jakim dniu
    expect(w.bledy.join(' ')).toContain('3 z 5');
    expect(w.bledy.join(' ')).toContain('wymagane 4');
    expect(w.bledy.join(' ')).toContain('ziarno 14');
  });

  it('kamień ludności w 16. dniu w dwóch przebiegach: błąd', () => {
    const w = werdykt(przebiegi({ dozyly: 5, kamien: [12, 12, 12, 16, 16], budowle: 16, dni: 45 }));
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('przymorze');
    expect(w.bledy.join(' ')).toContain('kamień');
    // jeden spóźniony przebieg jeszcze się mieści (4 z 5)
    expect(werdykt(przebiegi({ kamien: [12, 12, 12, 12, 16], budowle: 16 })).ok).toBe(true);
  });

  it('za mało budowli (14 przy 45 dniach): błąd', () => {
    const w = werdykt(przebiegi({ dozyly: 5, kamien: 12, budowle: 14, dni: 45 }));
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('przymorze');
    expect(w.bledy.join(' ')).toContain('budowl');
    // 15 przy 45 dniach to dokładnie jedna na trzy dni
    expect(werdykt(przebiegi({ budowle: 15, dni: 45 })).ok).toBe(true);
    // próg liczy się od liczby dni przebiegu: 8 budowli wystarcza na 25 dni (floor(25 / 3)), 7 nie
    expect(werdykt(przebiegi({ budowle: 8, dni: 25 })).ok).toBe(true);
    expect(werdykt(przebiegi({ budowle: 7, dni: 25 })).ok).toBe(false);
  });

  it('granice pasma kamienia: dzień 15 jeszcze ok, dzień 16 i brak kamienia to błąd', () => {
    expect(werdykt(przebiegi({ kamien: 15 })).ok).toBe(true);
    expect(werdykt(przebiegi({ kamien: 16 })).ok).toBe(false);
    expect(werdykt(przebiegi({ kamien: null })).ok).toBe(false);
    // jeden przebieg bez kamienia i jeden spóźniony to już dwa błędy z pięciu
    expect(werdykt(przebiegi({ kamien: [12, 12, 12, null, 20] })).ok).toBe(false);
  });

  it('kamień przed dolną granicą pasma (osiedle startuje blisko 10 osób) nie jest błędem, ale jest uwagą', () => {
    const w = werdykt(przebiegi({ kamien: [3, 12, 12, 12, 12] }));
    expect(w.ok).toBe(true);
    expect(w.bledy).toEqual([]);
    expect(w.uwagi.join(' ')).toContain('przymorze');
    expect(w.uwagi.join(' ')).toContain('ziarno 11');
    // w paśmie żadnych uwag
    expect(werdykt(przebiegi({ kamien: 8 })).uwagi).toEqual([]);
  });

  it('jedno słabe ziarno z pięciu mieści się w progu przy każdym z trzech kryteriów', () => {
    // jedno ziarno pada (dzień 20), ma też spóźniony kamień i mało budowli: reszta wystarcza
    const w = werdykt(przebiegi({ dozyly: 4, kamien: [12, 12, 12, 12, 30], budowle: [16, 16, 16, 16, 3] }));
    expect(w.ok).toBe(true);
  });

  it('kilka dem: błąd nazywa tylko to demo, które nie przechodzi', () => {
    const w = werdykt([
      ...przebiegi({ demo: 'przymorze' }),
      ...przebiegi({ demo: 'lanciego', dozyly: 2 }),
      ...przebiegi({ demo: 'zielonki' }),
    ]);
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('lanciego');
    expect(w.bledy.join(' ')).not.toContain('przymorze');
    expect(w.bledy.join(' ')).not.toContain('zielonki');
  });

  it('błędy wszystkich kryteriów dema są osobnymi wpisami', () => {
    const w = werdykt(przebiegi({ dozyly: 2, kamien: 18, budowle: 5 }));
    expect(w.ok).toBe(false);
    expect(w.bledy).toHaveLength(3);
  });

  it('mniej ziaren niż pięć: wymagane proporcjonalnie (trzy przebiegi muszą dożyć wszystkie)', () => {
    expect(werdykt(przebiegi({ ile: 3 })).ok).toBe(true);
    const w = werdykt(przebiegi({ ile: 3, dozyly: 2 }));
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('2 z 3');
    expect(w.bledy.join(' ')).toContain('wymagane 3');
    // dziesięć ziaren: osiem z dziesięciu
    expect(werdykt(przebiegi({ ile: 10, dozyly: 8 })).ok).toBe(true);
    expect(werdykt(przebiegi({ ile: 10, dozyly: 7 })).ok).toBe(false);
  });

  it('własne progi zastępują domyślne', () => {
    const luzne = { przezyc: 3, zZiaren: 5, kamien: [8, 20] as [number, number], budowlaNaDni: 5 };
    const p = przebiegi({ dozyly: 3, kamien: 18, budowle: 10 });
    expect(werdykt(p).ok).toBe(false);
    expect(werdykt(p, luzne).ok).toBe(true);
  });

  it('brak przebiegów to nie jest zwycięstwo', () => {
    const w = werdykt([]);
    expect(w.ok).toBe(false);
    expect(w.bledy.length).toBeGreaterThan(0);
  });
});

describe('odczyty przebiegu', () => {
  it('przezyl: koniec null to przeżycie', () => {
    const [zyje, pada] = przebiegi({ dozyly: 1, ile: 2 });
    expect(przezyl(zyje)).toBe(true);
    expect(przezyl(pada)).toBe(false);
  });

  it('dzienKamienia: pierwszy poranek z co najmniej 10 osobami albo null', () => {
    const [p] = przebiegi({ kamien: 12, ile: 1 });
    expect(dzienKamienia(p)).toBe(12);
    expect(dzienKamienia(przebiegi({ kamien: null, ile: 1 })[0])).toBeNull();
    // ludność może spaść z powrotem: liczy się pierwszy raz
    p.poranki.find((d) => d.dzien === 14)!.ludnosc = 7;
    expect(dzienKamienia(p)).toBe(12);
  });

  it('ludnoscWDniu: ludność o 6:00 danego dnia, null gdy przebieg skończył się wcześniej', () => {
    const [p, pada] = przebiegi({ dozyly: 1, ile: 2, kamien: 12 });
    expect(ludnoscWDniu(p, 10)).toBe(8);
    expect(ludnoscWDniu(p, 30)).toBe(12);
    expect(ludnoscWDniu(p, 45)).toBe(12);
    expect(ludnoscWDniu(pada, 10)).toBe(8);
    expect(ludnoscWDniu(pada, 30)).toBeNull();
  });

  it('budowleNaKoniec: budowle z ostatniego poranka, 0 bez poranków', () => {
    const [p] = przebiegi({ budowle: 16, ile: 1 });
    expect(budowleNaKoniec(p)).toBe(16);
    expect(budowleNaKoniec({ ...p, poranki: [] })).toBe(0);
  });
});

describe('uprząż bot:osada: argumenty', () => {
  it('bez argumentów: ziarna 11–15, 45 dni, trzy dema, gra jak w przeglądarce, z progiem', () => {
    const o = parsujArgumenty([]);
    expect(o.ziarna).toEqual([11, 12, 13, 14, 15]);
    expect(o.dni).toBe(45);
    expect(o.dema).toEqual(['przymorze', 'lanciego', 'zielonki']);
    expect(o.prosto).toBe(false);
    expect(o.bezProgu).toBe(false);
    expect(o.jedna).toBeNull();
    // procesów tyle, ile rdzeni bez jednego, ale co najmniej jeden
    expect(o.procesy).toBeGreaterThanOrEqual(1);
  });

  it('parsujZiarna: zakres, jedno ziarno i lista z zakresami, bez powtórzeń', () => {
    expect(parsujZiarna('11-15')).toEqual([11, 12, 13, 14, 15]);
    expect(parsujZiarna('7')).toEqual([7]);
    expect(parsujZiarna('11,13,15-16')).toEqual([11, 13, 15, 16]);
    expect(parsujZiarna('3,3-4')).toEqual([3, 4]);
  });

  it('zła lista ziaren i odwrócony zakres rzucają', () => {
    for (const zle of ['', 'abc', '15-11', '11-', '-5', '1.5', '11;12']) expect(() => parsujZiarna(zle), zle).toThrow();
    expect(() => parsujArgumenty(['--ziarna=15-11'])).toThrow(/ziaren/);
  });

  it('flagi i liczby: --dni, --demo, --prosto, --bez-progu, --procesy, --limit', () => {
    const o = parsujArgumenty([
      '--ziarna=1-3',
      '--dni=25',
      '--demo=zielonki,przymorze',
      '--prosto',
      '--bez-progu',
      '--procesy=2',
      '--limit=5',
    ]);
    expect(o).toMatchObject({
      ziarna: [1, 2, 3],
      dni: 25,
      dema: ['zielonki', 'przymorze'],
      prosto: true,
      bezProgu: true,
      procesy: 2,
      limitMin: 5,
    });
  });

  it('nieznane demo, zła liczba, nieznany i pozycyjny argument rzucają z nazwą', () => {
    expect(() => parsujArgumenty(['--demo=sopot'])).toThrow(/sopot/);
    expect(() => parsujArgumenty(['--dni=0'])).toThrow(/--dni/);
    expect(() => parsujArgumenty(['--dni=abc'])).toThrow(/--dni/);
    expect(() => parsujArgumenty(['--procesy=-1'])).toThrow(/--procesy/);
    expect(() => parsujArgumenty(['--ziarna'])).toThrow(/--ziarna/);
    expect(() => parsujArgumenty(['--prostoo'])).toThrow(/--prostoo/);
    expect(() => parsujArgumenty(['--bez-progu=1'])).toThrow(/--bez-progu/);
    expect(() => parsujArgumenty(['45'])).toThrow(/45/);
  });

  it('ukryty --jedna=demo:ziarno wybiera jedną grę', () => {
    expect(parsujArgumenty(['--jedna=lanciego:12']).jedna).toEqual({ demo: 'lanciego', ziarno: 12 });
    expect(() => parsujArgumenty(['--jedna=sopot:12'])).toThrow(/--jedna/);
    expect(() => parsujArgumenty(['--jedna=lanciego'])).toThrow(/--jedna/);
  });
});

describe('uprząż bot:osada: tabela', () => {
  it('dniLudnosci: dni 10, 20, 30 i 45 przed końcem przebiegu i zawsze ostatni dzień', () => {
    expect(dniLudnosci(45)).toEqual([10, 20, 30, 45]);
    expect(dniLudnosci(25)).toEqual([10, 20, 25]);
    expect(dniLudnosci(60)).toEqual([10, 20, 30, 45, 60]);
    expect(dniLudnosci(5)).toEqual([5]);
  });

  it('wiersz przebiegu, który dożył: żyje, bez przyczyny, ludność we wszystkich dniach, kamień, budowle, czas', () => {
    const [p] = przebiegi({ kamien: 12, budowle: 16, ile: 1 });
    const wiersz = wierszPrzebiegu(p, 12_340);
    expect(wiersz.split(/\s+/)).toEqual(['11', 'żyje', '-', '8', '12', '12', '12', '12', '16', '12.3', 's']);
    expect(naglowekTabeli(45).split(/\s+/)).toEqual([
      'ziarno',
      'koniec',
      'przyczyna',
      'lud10',
      'lud20',
      'lud30',
      'lud45',
      'kamień',
      'budowle',
      'czas',
    ]);
  });

  it('wiersz przebiegu, który padł: dzień końca i przyczyna, ludność tylko do dnia końca, reszta kreski', () => {
    const [, pada] = przebiegi({ dozyly: 0, kamien: 12, budowle: 5, ile: 2 });
    const wiersz = wierszPrzebiegu(pada, 4_000);
    // koniec w dniu 20: ludność w dniu 10 jest (8), w dniach 30 i 45 już nie
    expect(wiersz.split(/\s+/)).toEqual(['12', 'dzień', '20', 'odwolanie', '8', '12', '-', '-', '12', '5', '4.0', 's']);
  });

  it('wiersz bez kamienia ma kreskę w kolumnie kamienia', () => {
    const [p] = przebiegi({ kamien: null, ile: 1 });
    expect(wierszPrzebiegu(p, 1000).split(/\s+/).slice(-4, -2)).toEqual(['-', '16']);
  });

  it('ostatnie poranki: nagłówek z nazwami kolumn i pięć ostatnich dni', () => {
    const [pada] = przebiegi({ dozyly: 0, ile: 1 });
    const linie = ostatniePoranki(pada);
    expect(linie).toHaveLength(6);
    expect(linie[0].trim().split(/\s+/)).toEqual([
      'dzień',
      'ludn.',
      'zarząd',
      'budowle',
      'badania',
      'jedzenie',
      'drewno',
      'zimni',
      'głodni',
      'zaufanie',
      'wkurzenie',
    ]);
    // przebieg padł w dniu 20, więc ostatnie pięć poranków to dni 16–20
    expect(linie.slice(1).map((l) => l.trim().split(/\s+/)[0])).toEqual(['16', '17', '18', '19', '20']);
    expect(ostatniePoranki(pada, 2)).toHaveLength(3);
  });

  it('opis zawieszonych: rodzaj okna, ile razy i kiedy pierwszy raz (dzień i godzina gry)', () => {
    expect(opisZawieszonych([])).toEqual([]);
    // sekunda 3 to tick 60, czyli 4,5 minuty po starcie: dzień 1, 15:04
    const opis = opisZawieszonych([
      { k: 'nowe_okno', s: 3 },
      { k: 'nowe_okno', s: 4 },
      { k: 'inne', s: 9 },
    ]);
    expect(opis).toHaveLength(2);
    expect(opis[0]).toContain('nowe_okno');
    expect(opis[0]).toContain('2 razy');
    expect(opis[0]).toContain('dniu 1');
    expect(opis[0]).toContain('15:04');
    // błąd mówi, co znaczy: silnik nie umie odpowiedzieć na ten rodzaj okna
    expect(opis[0]).toContain('silnik nie umie zamknąć tego okna');
    expect(opis[1]).toContain('inne');
    expect(opis[1]).toContain('1 raz ');
  });
});

describe('uprząż bot:osada: błąd procesu potomnego', () => {
  it('streszczenieBledu: linia błędu z dwiema następnymi, bez źródła i reszty stosu', () => {
    const stderr = [
      'file:///x/tools/bot-osada.ts:12',
      'throw new Error("sztuczny");',
      '^',
      '',
      'Error: sztuczny błąd',
      '    at zagraj (file:///x/tools/bot-osada.ts:12:9)',
      '    at async main (file:///x/tools/bot-osada.ts:40:3)',
      '    at inne',
      '',
      'Node.js v25.2.1',
    ].join('\n');
    expect(streszczenieBledu(stderr)).toBe(
      'Error: sztuczny błąd | at zagraj (file:///x/tools/bot-osada.ts:12:9) | at async main (file:///x/tools/bot-osada.ts:40:3)',
    );
    // błąd innego rodzaju (TypeError, RangeError…) też
    expect(streszczenieBledu('coś\nTypeError: x is not a function\n  at a')).toBe(
      'TypeError: x is not a function | at a',
    );
  });

  it('streszczenieBledu: bez linii błędu ostatnie trzy linie, pusty tekst to pusty napis', () => {
    expect(streszczenieBledu('a\nb\nc\nd\n')).toBe('b | c | d');
    expect(streszczenieBledu('')).toBe('');
  });
});

describe('uprząż bot:osada: jedna gra', () => {
  it('poranekTick: dzień 2 o 6:00 to tick 12000, kolejne co dobę', () => {
    expect(poranekTick(2)).toBe(12000);
    expect(poranekTick(3)).toBe(12000 + TICKS_PER_DAY);
    for (const d of [2, 3, 10, 46]) {
      expect(hourOf(poranekTick(d))).toBe(6);
      expect(dayOf(poranekTick(d))).toBe(d);
      expect(hourOf(poranekTick(d) - 1)).toBe(5);
    }
  });

  it('przygotujGre: domyślnie gra jak w przeglądarce (obcy, mieszkańcy z adresu, okolica, ludność 2021, tempo)', async () => {
    for (const demo of ['przymorze', 'lanciego', 'zielonki']) {
      const g = await przygotujGre(demo, 11, false);
      expect(g.seed, demo).toBe(11);
      expect(g.opts, demo).toMatchObject({ core: 4, obcy: true, tempoPrzegladarki: true });
      expect(g.opts.mieszkancy, demo).toBeDefined();
      expect(g.opts.okolica!.length, demo).toBeGreaterThan(0);
      expect(g.opts.ludnosc2021, demo).toBeGreaterThan(0);
      // opcje dochodzą do gry: obcy w symulacji, mapa miasta i drogi do zwycięstwa w zarządzie, zarząd z 4 osób
      expect(g.sim.st.obcy, demo).toBeDefined();
      expect(g.gov.miasto, demo).toBeDefined();
      expect(g.gov.zwyciestwo, demo).toBeDefined();
      expect(
        g.sim.st.pawns.filter((p) => p.kind === 'core'),
        demo,
      ).toHaveLength(4);
    }
  }, 120_000);

  it('przygotujGre prosto: bez obcych, mieszkańców z adresu, okolicy i ludności 2021, ale z tempem przeglądarki', async () => {
    const g = await przygotujGre('lanciego', 12, true);
    expect(g.opts).toEqual({ core: 4, tempoPrzegladarki: true });
    expect(g.sim.st.obcy).toBeUndefined();
    expect(g.gov.miasto).toBeUndefined();
    expect(g.gov.zwyciestwo).toBeUndefined();
  }, 120_000);

  it('zagraj prosto: trzy doby dają poranki dni 2–4 o 6:00, a przebieg gry jest ten sam co bez przerw na poranki', async () => {
    const wynik = await zagraj('przymorze', 11, 3, true);
    const p = wynik.przebieg;
    expect([p.demo, p.ziarno, p.dni, p.koniec]).toEqual(['przymorze', 11, 3, null]);
    expect(p.poranki.map((d) => d.dzien)).toEqual([2, 3, 4]);
    for (const d of p.poranki) {
      expect(d.zarzad).toBeGreaterThanOrEqual(1);
      expect(d.ludnosc).toBeGreaterThanOrEqual(d.zarzad);
      expect(d.budowle).toBeGreaterThanOrEqual(0);
      expect(d.zaufanie).toBeGreaterThan(0);
      expect(d.wkurzenie).toBeGreaterThanOrEqual(0);
    }
    expect(wynik.zawieszone).toEqual([]);
    expect(wynik.czasMs).toBeGreaterThan(0);
    // ta sama gra bez zatrzymań na poranki kończy w tym samym stanie
    const demo = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'),
    );
    const g = nowaGraAi(buildWorld(demo.geo, { seed: 11, street: demo.street }), 11, { tempoPrzegladarki: true });
    grajDo(g, silnik, 3 * TICKS_PER_DAY);
    expect(wynik.skrot).toBe(skrotGry(g));
    // i jest deterministyczna
    expect((await zagraj('przymorze', 11, 3, true)).skrot).toBe(wynik.skrot);
  }, 120_000);

  it('zagraj jak w przeglądarce: mieszkańcy z adresu i obcy, dwie doby na Przymorzu', async () => {
    const wynik = await zagraj('przymorze', 12, 2, false);
    expect(wynik.przebieg.poranki.map((d) => d.dzien)).toEqual([2, 3]);
    // mieszkańcy siedziby z generatora: ludzi pod zarządem jest więcej niż samego zarządu
    const rano = wynik.przebieg.poranki[0];
    expect(rano.zarzad).toBeGreaterThanOrEqual(1);
    expect(rano.ludnosc).toBeGreaterThan(rano.zarzad);
    expect(wynik.zawieszone).toEqual([]);
  }, 120_000);

  it('zagraj gra podanym decydentem: koniec w pierwszym dniu to brak poranków i koniec z dniem 1', async () => {
    const koniecOdRazu: Decydent = {
      okno: () => {},
      tura: (g) => {
        g.gov.over = 'pustka';
      },
    };
    const wynik = await zagraj('zielonki', 11, 5, true, koniecOdRazu);
    expect(wynik.przebieg.koniec).toEqual({ dzien: 1, przyczyna: 'pustka' });
    expect(wynik.przebieg.poranki).toEqual([]);
  }, 120_000);

  it.each([
    ['w ciągu dnia 3 (11:00)', poranekTick(3) + 5 * TICKS_PER_HOUR, 3],
    ['dokładnie o 6:00 dnia 3', poranekTick(3), 3],
    ['w nocy przed dniem 4 (3:00)', poranekTick(4) - 3 * TICKS_PER_HOUR, 4],
  ])(
    'koniec gry %s: dzień końca z przyczyną i poranki tylko sprzed końca',
    async (_opis, tick, dzienKonca) => {
      const konczy: Decydent = {
        okno: () => {},
        tura: (g) => {
          if (g.sim.st.tick >= tick) g.gov.over = 'exodus';
        },
      };
      const wynik = await zagraj('zielonki', 11, 10, true, konczy);
      expect(wynik.przebieg.koniec).toEqual({ dzien: dzienKonca, przyczyna: 'exodus' });
      // poranki dni 2 i 3 w każdym z trzech przypadków (przy końcu dokładnie o 6:00 dnia 3 poranek jest z chwili końca), dnia 4 nie ma
      expect(wynik.przebieg.poranki.map((d) => d.dzien)).toEqual([2, 3]);
    },
    120_000,
  );
});
