/* Ocena przebiegów osady AI (tools/osada-ocena.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 2), z miarą bramki z decyzji Mateusza z 24.10.2026
   (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 2). Funkcje oceny są czyste, więc testy składają
   syntetyczne przebiegi (`przebiegi`) i sprawdzają werdykt: pierwsze odwołanie zarządu nie wcześniej niż w 30. dniu (albo
   w ogóle) i pierwszy kamień ludności (10 osób) w paśmie dni, każde w co najmniej 4 z 5 przebiegów na demie. Budowle zostają
   w tabeli (bez kawałków siatki: zasieki, barykada), ale nie wchodzą do werdyktu. Demo, którego dom nie spełnia reguły
   miejsca osady (src/ai/kwadrat.ts), nie jest oceniane; demo z błędnym przebiegiem też nie, a przy przebiegu krótszym niż
   dzień 15 kryterium kamienia jest pomijane.
   Uprząż (tools/bot-osada.ts) ma testy argumentów, tabeli i jednej gry (`zagraj`, kilka dób na prawdziwej symulacji);
   procesy równoległe i pełny pomiar to ręczne `npm run bot:osada`. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Decydent, grajDo, MAX_BLEDOW, nowaGraAi, skrotGry } from '../../src/ai/gra.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { buildWorld } from '../../src/world/world.ts';
import {
  argumentyPrzebiegu,
  dniLudnosci,
  naglowekTabeli,
  opisBledowDecydenta,
  opisGry,
  opisPowoduOdrzucenia,
  opisPozaRegula,
  opisZawieszonych,
  ostatniePoranki,
  parsujArgumenty,
  parsujZiarna,
  poranek as poranekGry,
  poranekTick,
  pozaRegula,
  przygotujGre,
  streszczenieBledu,
  wierszPrzebiegu,
  zagraj,
} from '../../tools/bot-osada.ts';
import {
  type BlednyPrzebieg,
  bezOdwolaniaPrzed,
  budowleNaKoniec,
  budowleStojace,
  type DzienPrzebiegu,
  dzienKamienia,
  ludnoscWDniu,
  type PozaRegula,
  PROGI,
  type Przebieg,
  przezyl,
  werdykt,
} from '../../tools/osada-ocena.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

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
    odwołaniem w dniu `koniecDzien` (domyślnie 20, jedna liczba dla wszystkich albo po jednej na przebieg). `kamien` i `budowle`
    to jedna liczba dla wszystkich albo po jednej na przebieg. */
function przebiegi(
  o: {
    dozyly?: number;
    koniecDzien?: number | readonly number[];
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
      koniecDzien: wartosc(o.koniecDzien, k, 20),
      kamien: wartosc(o.kamien, k, 12),
      budowle: wartosc(o.budowle, k, 16),
      dni,
    }),
  );
}

describe('progi', () => {
  it('bramka etapu (decyzja 2, 24.10.2026): 4 z 5 ziaren, bez odwołania przed dniem 30, kamień między 8. a 15. dniem', () => {
    expect(PROGI).toEqual({ przezyc: 4, zZiaren: 5, kamien: [8, 15], odwolanieOdDnia: 30 });
  });
});

describe('werdykt', () => {
  it('pięć przebiegów, cztery bez odwołania do końca, kamień w 12. dniu: ok', () => {
    const w = werdykt(przebiegi({ dozyly: 4, kamien: 12, dni: 45 }));
    expect(w.ok).toBe(true);
    expect(w.bledy).toEqual([]);
    expect(w.pominiete).toEqual([]);
  });

  it('tylko trzy z pięciu bez odwołania przed dniem 30: błąd z nazwą dema, liczbami i ziarnami', () => {
    const w = werdykt(przebiegi({ dozyly: 3, kamien: 12, dni: 45 }));
    expect(w.ok).toBe(false);
    expect(w.bledy).toHaveLength(1);
    expect(w.bledy[0]).toContain('przymorze');
    // błąd mówi, w ilu przebiegach zarząd dotrwał do dnia 30 i ilu trzeba, i które ziarna skończyły się w jakim dniu
    expect(w.bledy[0]).toContain('przed dniem 30');
    expect(w.bledy[0]).toContain('3 z 5');
    expect(w.bledy[0]).toContain('wymagane 4');
    expect(w.bledy[0]).toContain('ziarno 14 dzień 20 odwolanie');
  });

  it('granica dnia odwołania: dzień 29 nie zalicza, dzień 30 zalicza (decyzja 2: nie wcześniej niż w 30. dniu)', () => {
    // dwa z pięciu przebiegów kończą się odwołaniem: w dniu 29 to dwa błędy, w dniu 30 żaden
    expect(werdykt(przebiegi({ dozyly: 3, koniecDzien: 29 })).ok).toBe(false);
    expect(werdykt(przebiegi({ dozyly: 3, koniecDzien: 30 })).ok).toBe(true);
    expect(werdykt(przebiegi({ dozyly: 3, koniecDzien: 45 })).ok).toBe(true);
    // jedno odwołanie w dniu 29 jeszcze się mieści (4 z 5), dwa nie
    expect(werdykt(przebiegi({ dozyly: 4, koniecDzien: 29 })).ok).toBe(true);
    expect(werdykt(przebiegi({ dozyly: 3, koniecDzien: [0, 0, 0, 29, 29] })).ok).toBe(false);
    expect(werdykt(przebiegi({ dozyly: 3, koniecDzien: [0, 0, 0, 29, 30] })).ok).toBe(true);
    // koniec w dniu 46 (odwołanie tuż przed końcem 45 dób) to dużo po dniu 30
    expect(werdykt(przebiegi({ dozyly: 0, koniecDzien: 46 })).ok).toBe(true);
    // przyczyna końca nie ma znaczenia: pustka i exodus przed dniem 30 też nie zaliczają
    const pustka = przebiegi({ dozyly: 3, koniecDzien: 29 }).map((p) =>
      p.koniec ? { ...p, koniec: { ...p.koniec, przyczyna: 'pustka' } } : p,
    );
    expect(werdykt(pustka).ok).toBe(false);
  });

  it('kamień ludności w 16. dniu w dwóch przebiegach: błąd', () => {
    const w = werdykt(przebiegi({ dozyly: 5, kamien: [12, 12, 12, 16, 16], dni: 45 }));
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('przymorze');
    expect(w.bledy.join(' ')).toContain('kamień');
    // jeden spóźniony przebieg jeszcze się mieści (4 z 5)
    expect(werdykt(przebiegi({ kamien: [12, 12, 12, 12, 16] })).ok).toBe(true);
  });

  it('budowle zostają w tabeli, ale nie wchodzą do werdyktu: zero budowli niczego nie psuje', () => {
    for (const budowle of [0, 1, 3, 14, 16, 40]) {
      const w = werdykt(przebiegi({ dozyly: 5, kamien: 12, budowle, dni: 45 }));
      expect(w.ok, `budowle ${budowle}`).toBe(true);
      expect(w.bledy, `budowle ${budowle}`).toEqual([]);
      expect(w.uwagi, `budowle ${budowle}`).toEqual([]);
    }
    // próg budowli zniknął z progów
    expect('budowlaNaDni' in PROGI).toBe(false);
    // przebiegi bez budowli w kilku demach: dalej oceniane tylko odwołaniem i kamieniem
    const w = werdykt([
      ...przebiegi({ demo: 'przymorze', budowle: 0 }),
      ...przebiegi({ demo: 'lanciego', budowle: 0, dozyly: 2 }),
    ]);
    expect(w.bledy).toHaveLength(1);
    expect(w.bledy[0]).toContain('lanciego');
    expect(w.bledy[0]).not.toContain('budowl');
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

  it('jedno słabe ziarno z pięciu mieści się w progu przy każdym z dwóch kryteriów', () => {
    // jedno ziarno pada (dzień 20) i ma spóźniony kamień: reszta wystarcza
    const w = werdykt(przebiegi({ dozyly: 4, kamien: [12, 12, 12, 12, 30] }));
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

  it('błędy obu kryteriów dema są osobnymi wpisami', () => {
    const w = werdykt(przebiegi({ dozyly: 2, kamien: 18 }));
    expect(w.ok).toBe(false);
    expect(w.bledy).toHaveLength(2);
  });

  it('mniej ziaren niż pięć: wymagane proporcjonalnie (trzy przebiegi muszą zaliczyć wszystkie)', () => {
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
    const luzne = { przezyc: 3, zZiaren: 5, kamien: [8, 20] as [number, number], odwolanieOdDnia: 15 };
    const p = przebiegi({ dozyly: 3, kamien: 18 });
    expect(werdykt(p).ok).toBe(false);
    expect(werdykt(p, luzne).ok).toBe(true);
    // próg dnia odwołania: odwołania w dniu 20 przechodzą przy progu 20, nie przy 21
    expect(werdykt(przebiegi({ dozyly: 0 }), { ...PROGI, odwolanieOdDnia: 20 }).ok).toBe(true);
    expect(werdykt(przebiegi({ dozyly: 0 }), { ...PROGI, odwolanieOdDnia: 21 }).ok).toBe(false);
  });

  it('brak przebiegów to nie jest zwycięstwo', () => {
    const w = werdykt([]);
    expect(w.ok).toBe(false);
    expect(w.bledy.length).toBeGreaterThan(0);
  });
});

describe('werdykt: demo poza regułą miejsca', () => {
  const poza = (demo: string, powod = 'jedzenie: 17 porcji w zasięgu 720 m, potrzeba 300'): PozaRegula => ({
    demo,
    powod,
  });

  it('demo poza regułą nie liczy się do werdyktu: jego złe przebiegi go nie psują, a wpis mówi dlaczego', () => {
    // Zielonki giną w dniu 20 w pięciu z pięciu przebiegów, a werdykt przechodzi na dwóch pozostałych demach
    const w = werdykt(
      [
        ...przebiegi({ demo: 'przymorze' }),
        ...przebiegi({ demo: 'lanciego' }),
        ...przebiegi({ demo: 'zielonki', dozyly: 0, kamien: null }),
      ],
      PROGI,
      [],
      [poza('zielonki')],
    );
    expect(w.ok).toBe(true);
    expect(w.bledy).toEqual([]);
    expect(w.nieocenione).toEqual([]);
    expect(w.pominiete).toHaveLength(1);
    expect(w.pominiete[0]).toContain('zielonki');
    expect(w.pominiete[0]).toContain('poza regułą miejsca');
    expect(w.pominiete[0]).toContain('17 porcji');
    // ta sama lista przebiegów bez wyłączenia: porażka
    const bez = werdykt([...przebiegi({ demo: 'przymorze' }), ...przebiegi({ demo: 'zielonki', dozyly: 0 })]);
    expect(bez.ok).toBe(false);
    expect(bez.pominiete).toEqual([]);
  });

  it('demo poza regułą nie wpływa też na uwagi, a pozostałe dema oceniane są normalnie', () => {
    const w = werdykt(
      [
        ...przebiegi({ demo: 'przymorze', kamien: [3, 12, 12, 12, 12] }),
        ...przebiegi({ demo: 'lanciego', dozyly: 2 }),
        ...przebiegi({ demo: 'zielonki', dozyly: 0, kamien: 3 }),
      ],
      PROGI,
      [],
      [poza('zielonki')],
    );
    expect(w.ok).toBe(false);
    expect(w.bledy).toHaveLength(1);
    expect(w.bledy[0]).toContain('lanciego');
    expect(w.uwagi.join(' ')).toContain('przymorze');
    expect(w.uwagi.join(' ')).not.toContain('zielonki');
  });

  it('demo poza regułą bez przebiegów (nie grane) tylko się wpisuje do pominiętych', () => {
    const w = werdykt(przebiegi({ demo: 'przymorze' }), PROGI, [], [poza('zielonki')]);
    expect(w.ok).toBe(true);
    expect(w.pominiete.map((x) => x.split(':')[0])).toEqual(['zielonki']);
  });

  it('wszystkie dema poza regułą: nie ma czego oceniać, więc werdykt nie przechodzi', () => {
    const w = werdykt(przebiegi({ demo: 'zielonki', dozyly: 0 }), PROGI, [], [poza('zielonki')]);
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('żadne demo');
    expect(w.pominiete).toHaveLength(1);
  });

  it('błędny przebieg dema poza regułą nie robi z niego „nie oceniono” (to demo i tak nie jest oceniane)', () => {
    const w = werdykt(
      [...przebiegi({ demo: 'przymorze' }), ...przebiegi({ demo: 'zielonki', ile: 4 })],
      PROGI,
      [{ demo: 'zielonki', ziarno: 15, powod: 'limit czasu' }],
      [poza('zielonki')],
    );
    expect(w.ok).toBe(true);
    expect(w.nieocenione).toEqual([]);
  });
});

describe('budowle w ocenie: bez kawałków siatki', () => {
  /** rzeczy gry danego rodzaju (tylko `kind` czyta ocena) */
  const rzeczy = (kind: string, n: number) => Array.from({ length: n }, (_, k) => ({ id: k, kind }));

  it('zasieki i barykada (obwód) nie liczą się, budowle domu i podwórka tak, meble i drewno nie', () => {
    expect(budowleStojace(rzeczy('zasieki', 15))).toBe(0);
    expect(budowleStojace(rzeczy('barykada', 15))).toBe(0);
    expect(budowleStojace(rzeczy('warsztat', 3))).toBe(3);
    expect(budowleStojace([...rzeczy('ogrodek', 2), ...rzeczy('koza_beczka', 1), ...rzeczy('wieza', 1)])).toBe(4);
    // mieszanka: z siatką liczy się tylko to, co poza obwodem
    expect(budowleStojace([...rzeczy('zasieki', 9), ...rzeczy('magazyn', 2), ...rzeczy('barykada', 4)])).toBe(2);
    // meble, drewno, sterty i rzeczy spoza gry to nie budowle
    expect(
      budowleStojace([...rzeczy('lozko', 3), ...rzeczy('drewno', 2), ...rzeczy('koza', 1), ...rzeczy('???', 1)]),
    ).toBe(0);
    expect(budowleStojace([])).toBe(0);
  });

  it('tabela pokazuje budowle poza obwodem: piętnaście zasieków to 0, piętnaście magazynów 15, a werdykt ich nie liczy', () => {
    const zRzeczy = (kind: string) => przebiegi({ dni: 45, ile: 1, budowle: budowleStojace(rzeczy(kind, 15)) });
    const kolumnaBudowli = (p: Przebieg[]): string => wierszPrzebiegu(p[0], 1000).split(/\s+/).at(-3)!;
    expect(kolumnaBudowli(zRzeczy('zasieki'))).toBe('0');
    expect(kolumnaBudowli(zRzeczy('barykada'))).toBe('0');
    expect(kolumnaBudowli(zRzeczy('magazyn'))).toBe('15');
    expect(kolumnaBudowli(zRzeczy('lozka_pietrowe'))).toBe('15');
    // do werdyktu budowle nie wchodzą w żadnej postaci
    expect(werdykt(przebiegi({ budowle: budowleStojace(rzeczy('zasieki', 15)) })).ok).toBe(true);
    expect(werdykt(przebiegi({ budowle: budowleStojace(rzeczy('magazyn', 15)) })).ok).toBe(true);
  });

  it('poranek liczy budowle ze stanu gry bez kawałków siatki', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11);
    expect(poranekGry(g).budowle).toBe(0);
    const rzecz = (id: number, kind: string) => ({
      id,
      kind,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    g.sim.st.things.push(...Array.from({ length: 15 }, (_, k) => rzecz(9000 + k, 'zasieki')));
    expect(poranekGry(g).budowle).toBe(0);
    g.sim.st.things.push(...Array.from({ length: 15 }, (_, k) => rzecz(9100 + k, k % 2 ? 'magazyn' : 'ogrodek')));
    expect(poranekGry(g).budowle).toBe(15);
  });
});

describe('werdykt: demo z błędnym przebiegiem', () => {
  const zle = (demo: string, ziarno: number, powod = 'proces padł'): BlednyPrzebieg => ({ demo, ziarno, powod });

  it('demo z błędnym przebiegiem nie jest oceniane: „nie oceniono” zamiast werdyktu z pozostałych przebiegów', () => {
    // cztery pozostałe przebiegi dema przymorze padają w dniu 20: ocena z nich byłaby porażką, a ona nie jest ocena dema
    const w = werdykt(przebiegi({ demo: 'przymorze', ile: 4, dozyly: 0 }), PROGI, [
      zle('przymorze', 15, 'limit czasu'),
    ]);
    expect(w.nieocenione).toHaveLength(1);
    expect(w.nieocenione[0]).toContain('przymorze');
    expect(w.nieocenione[0]).toContain('nie oceniono');
    expect(w.nieocenione[0]).toContain('przebiegi z błędem');
    expect(w.nieocenione[0]).toContain('ziarno 15');
    expect(w.nieocenione[0]).toContain('limit czasu');
    // żadnego błędu z liczenia pozostałych przebiegów tego dema
    expect(w.bledy).toEqual([]);
    // werdykt jako całość nie przechodzi, skoro czegoś nie zmierzono
    expect(w.ok).toBe(false);
  });

  it('pozostałe dema oceniane są normalnie, nawet gdy jedno jest nieocenione', () => {
    const w = werdykt(
      [
        ...przebiegi({ demo: 'przymorze', ile: 4 }),
        ...przebiegi({ demo: 'lanciego', dozyly: 2 }),
        ...przebiegi({ demo: 'zielonki' }),
      ],
      PROGI,
      [zle('przymorze', 15)],
    );
    expect(w.nieocenione.map((x) => x.split(':')[0])).toEqual(['przymorze']);
    // lanciego (2 z 5) pada na przeżyciu, zielonki są w porządku
    expect(w.bledy).toHaveLength(1);
    expect(w.bledy[0]).toContain('lanciego');
    expect(w.bledy.join(' ')).not.toContain('zielonki');
    expect(w.ok).toBe(false);
  });

  it('demo, w którym nie udał się żaden przebieg, też jest nieocenione, a jego kolejność idzie po ocenionych', () => {
    const w = werdykt(przebiegi({ demo: 'zielonki' }), PROGI, [zle('lanciego', 11), zle('lanciego', 12, 'okno')]);
    expect(w.nieocenione).toHaveLength(1);
    expect(w.nieocenione[0]).toContain('lanciego');
    expect(w.nieocenione[0]).toContain('przebiegi z błędem');
    expect(w.nieocenione[0]).toContain('ziarno 11: proces padł');
    expect(w.nieocenione[0]).toContain('ziarno 12: okno');
    expect(w.bledy).toEqual([]);
  });

  it('bez błędnych przebiegów nic się nie zmienia: pusta lista nieocenionych i ten sam werdykt', () => {
    const p = przebiegi({ dozyly: 4 });
    expect(werdykt(p).nieocenione).toEqual([]);
    expect(werdykt(p).ok).toBe(true);
    expect(werdykt(p, PROGI, []).ok).toBe(true);
  });

  it('same błędne przebiegi bez żadnego udanego to nie „brak przebiegów”, tylko nieocenione dema', () => {
    const w = werdykt([], PROGI, [zle('przymorze', 11)]);
    expect(w.ok).toBe(false);
    expect(w.bledy).toEqual([]);
    expect(w.nieocenione).toHaveLength(1);
    // pusto i bez błędnych dalej jest porażką
    expect(werdykt([]).bledy.length).toBeGreaterThan(0);
  });
});

describe('werdykt: przebieg krótszy niż dzień 15', () => {
  it('przy --dni poniżej dnia 15 kryterium kamienia jest pomijane z uwagą', () => {
    // 10 dni: brak kamienia nie jest błędem, bo przebieg nie dociera do dnia 15
    const w = werdykt(przebiegi({ dni: 10, kamien: null }));
    expect(w.ok).toBe(true);
    expect(w.bledy).toEqual([]);
    expect(w.uwagi.join(' ')).toContain('przymorze');
    expect(w.uwagi.join(' ')).toContain('kamienia');
    expect(w.uwagi.join(' ')).toContain('pominięte');
    // tyle samo przy spóźnionym kamieniu, którego krótki przebieg też nie umie ocenić
    expect(werdykt(przebiegi({ dni: 10, kamien: 20 })).ok).toBe(true);
  });

  it('pozostałe kryteria dalej obowiązują w krótkim przebiegu', () => {
    // 10 dni, ale trzy z pięciu zakończyły się odwołaniem (dzień 8 < 30): porażka na odwołaniu
    const odwolanie = werdykt(przebiegi({ dni: 10, dozyly: 3, koniecDzien: 8, kamien: null }));
    expect(odwolanie.ok).toBe(false);
    expect(odwolanie.bledy.join(' ')).toContain('przed dniem 30 tylko w 3 z 5');
    expect(odwolanie.bledy.join(' ')).not.toContain('kamień');
  });

  it('przebieg krótszy niż dzień 30 dostaje uwagę: odwołanie sprawdzone tylko w jego dniach', () => {
    const w = werdykt(przebiegi({ dni: 25 }));
    expect(w.ok).toBe(true);
    const uwaga = w.uwagi.filter((u) => u.includes('krócej niż do dnia 30'));
    expect(uwaga).toHaveLength(1);
    expect(uwaga[0]).toContain('przymorze');
    expect(uwaga[0]).toContain('25 dni');
    expect(uwaga[0]).not.toContain('pominięte');
    // pełne 45 dni i dokładnie 30 dni bez tej uwagi
    expect(werdykt(przebiegi({ dni: 45 })).uwagi).toEqual([]);
    expect(werdykt(przebiegi({ dni: 30 })).uwagi).toEqual([]);
  });

  it('dolna granica dnia kamienia: 14 dni jest jeszcze pomijane, 15 dni już ocenia kamień', () => {
    expect(werdykt(przebiegi({ dni: 14, kamien: null })).ok).toBe(true);
    const pelny = werdykt(przebiegi({ dni: 15, kamien: null }));
    expect(pelny.ok).toBe(false);
    expect(pelny.bledy.join(' ')).toContain('kamień');
    expect(pelny.uwagi.join(' ')).not.toContain('pominięte');
    // pełne 45 dni jak dotąd
    expect(werdykt(przebiegi({ dni: 45, kamien: null })).ok).toBe(false);
  });

  it('pomijanie dotyczy tylko dema z krótkimi przebiegami', () => {
    const w = werdykt([
      ...przebiegi({ demo: 'przymorze', dni: 10, kamien: null }),
      ...przebiegi({ demo: 'lanciego', dni: 45, kamien: null }),
    ]);
    expect(w.ok).toBe(false);
    expect(w.bledy.join(' ')).toContain('lanciego');
    expect(w.bledy.join(' ')).not.toContain('przymorze');
    expect(w.uwagi.join(' ')).toContain('przymorze');
  });
});

describe('odczyty przebiegu', () => {
  it('przezyl: koniec null to przeżycie', () => {
    const [zyje, pada] = przebiegi({ dozyly: 1, ile: 2 });
    expect(przezyl(zyje)).toBe(true);
    expect(przezyl(pada)).toBe(false);
  });

  it('bezOdwolaniaPrzed: gra bez końca albo z końcem nie wcześniej niż w podanym dniu', () => {
    const [zyje, dzien29, dzien30, dzien46] = [
      przebiegi({ dozyly: 1, ile: 1 })[0],
      przebiegi({ dozyly: 0, koniecDzien: 29, ile: 1 })[0],
      przebiegi({ dozyly: 0, koniecDzien: 30, ile: 1 })[0],
      przebiegi({ dozyly: 0, koniecDzien: 46, ile: 1 })[0],
    ];
    expect(bezOdwolaniaPrzed(zyje, 30)).toBe(true);
    expect(bezOdwolaniaPrzed(dzien29, 30)).toBe(false);
    expect(bezOdwolaniaPrzed(dzien30, 30)).toBe(true);
    expect(bezOdwolaniaPrzed(dzien46, 30)).toBe(true);
    // inny próg: ten sam przebieg
    expect(bezOdwolaniaPrzed(dzien29, 29)).toBe(true);
    expect(bezOdwolaniaPrzed(dzien29, 20)).toBe(true);
    // koniec w pierwszym dniu zawsze przed progiem
    expect(bezOdwolaniaPrzed({ ...dzien29, koniec: { dzien: 1, przyczyna: 'pustka' } }, 30)).toBe(false);
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

describe('uprząż bot:osada: reguła miejsca osady', () => {
  it('pozaRegula: dom Przymorza i Lanciego spełnia regułę, dom Zielonek nie (17 porcji jedzenia w zasięgu 720 m)', async () => {
    expect(await pozaRegula('przymorze', 11)).toBeNull();
    expect(await pozaRegula('lanciego', 11)).toBeNull();
    const powod = await pozaRegula('zielonki', 11);
    expect(powod).not.toBeNull();
    expect(powod).toContain('jedzenie');
    expect(powod).toContain('17 porcji');
    expect(powod).toContain('720 m');
    expect(powod).toContain('300');
  }, 60_000);

  it('pozaRegula nie zależy od ziarna w żadnym z trzech dem (11–13)', async () => {
    for (const ziarno of [11, 12, 13]) {
      expect(await pozaRegula('przymorze', ziarno), `przymorze ${ziarno}`).toBeNull();
      expect(await pozaRegula('lanciego', ziarno), `lanciego ${ziarno}`).toBeNull();
      expect(await pozaRegula('zielonki', ziarno), `zielonki ${ziarno}`).toContain('jedzenie');
    }
  }, 60_000);

  it('opisPowoduOdrzucenia: jedzenie, siedziba i mieszkańcy własnymi słowami, z liczbami z pomiaru', () => {
    const pomiar = {
      kandydatow: 7,
      proby: 4,
      pole: 154,
      pokoje: 2,
      pokojeZarzadu: 2,
      osoby: null,
      lokatorzy: null,
      jedzenie: 16.6,
    };
    expect(opisPowoduOdrzucenia({ odrzucony: 'jedzenie', pomiar })).toBe(
      'jedzenie: 17 porcji w zasięgu 720 m, potrzeba 300',
    );
    expect(opisPowoduOdrzucenia({ odrzucony: 'jedzenie', pomiar: { ...pomiar, jedzenie: 1 } })).toContain('1 porcja');
    const siedziba = opisPowoduOdrzucenia({ odrzucony: 'siedziba', pomiar });
    expect(siedziba).toContain('siedziba');
    expect(siedziba).toContain('4 największych');
    expect(siedziba).toContain('2 pokoje');
    expect(
      opisPowoduOdrzucenia({
        odrzucony: 'siedziba',
        pomiar: { ...pomiar, kandydatow: 0, proby: 0, pole: 0, pokoje: 0 },
      }),
    ).toBe('siedziba: brak budynku mieszkalnego w 120 m od środka kwadratu');
    expect(opisPowoduOdrzucenia({ odrzucony: 'mieszkancy', pomiar })).toContain('tabel');
    const bezLokatorow = opisPowoduOdrzucenia({
      odrzucony: 'mieszkancy',
      pomiar: { ...pomiar, osoby: 4, lokatorzy: 0 },
    });
    expect(bezLokatorow).toContain('mieszkańcy');
    expect(bezLokatorow).toContain('0 lokatorów');
    // polska liczba mnoga: 1 lokator, 2 lokatorzy, 5 lokatorów
    for (const [n, forma] of [
      [1, '1 lokator,'],
      [2, '2 lokatorzy,'],
      [5, '5 lokatorów,'],
    ] as const)
      expect(
        opisPowoduOdrzucenia({ odrzucony: 'mieszkancy', pomiar: { ...pomiar, osoby: 4, lokatorzy: n } }),
      ).toContain(forma);
  });

  it('opisPozaRegula: dopisek dema w tabeli', () => {
    const opis = opisPozaRegula('jedzenie: 17 porcji w zasięgu 720 m, potrzeba 300');
    expect(opis).toContain('poza regułą miejsca');
    expect(opis).toContain('17 porcji');
    expect(opis).toContain('werdykt');
  });
});

describe('uprząż bot:osada: argumenty', () => {
  it('bez argumentów: ziarna 11–15, 45 dni, trzy dema, gra jak w przeglądarce, z progiem', () => {
    const o = parsujArgumenty([]);
    expect(o.ziarna).toEqual([11, 12, 13, 14, 15]);
    expect(o.dni).toBe(45);
    expect(o.dema).toEqual(['przymorze', 'lanciego', 'zielonki']);
    expect(o.prosto).toBe(false);
    expect(o.bezLancuchow).toBe(false);
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

  it('flagi i liczby: --dni, --demo, --prosto, --bez-lancuchow, --bez-progu, --procesy, --limit', () => {
    const o = parsujArgumenty([
      '--ziarna=1-3',
      '--dni=25',
      '--demo=zielonki,przymorze',
      '--prosto',
      '--bez-lancuchow',
      '--bez-progu',
      '--procesy=2',
      '--limit=5',
    ]);
    expect(o).toMatchObject({
      ziarna: [1, 2, 3],
      dni: 25,
      dema: ['zielonki', 'przymorze'],
      prosto: true,
      bezLancuchow: true,
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
    expect(() => parsujArgumenty(['--bez-lancuchow=1'])).toThrow(/--bez-lancuchow/);
    expect(() => parsujArgumenty(['--bez-lancuchowx'])).toThrow(/--bez-lancuchowx/);
    expect(() => parsujArgumenty(['45'])).toThrow(/45/);
  });

  it('ukryty --jedna=demo:ziarno wybiera jedną grę', () => {
    expect(parsujArgumenty(['--jedna=lanciego:12']).jedna).toEqual({ demo: 'lanciego', ziarno: 12 });
    expect(() => parsujArgumenty(['--jedna=sopot:12'])).toThrow(/--jedna/);
    expect(() => parsujArgumenty(['--jedna=lanciego'])).toThrow(/--jedna/);
  });
});

describe('uprząż bot:osada: jak grano', () => {
  it('opisGry: nagłówek mówi, czy gra ma łańcuchy kart (domyślny tekst bez zmian), a --prosto zawsze jest bez nich', () => {
    const jak = parsujArgumenty([]);
    expect(opisGry(jak)).toBe(
      'jak w przeglądarce (obcy, mieszkańcy z adresu, okolica miasta, ludność 2021, łańcuchy kart, tempo przeglądarki)',
    );
    expect(opisGry(parsujArgumenty(['--bez-lancuchow']))).toBe(
      'jak w przeglądarce, ale bez łańcuchów kart (obcy, mieszkańcy z adresu, okolica miasta, ludność 2021, tempo przeglądarki)',
    );
    const prosto =
      'prosto (bez obcych, mieszkańców z adresu, okolicy miasta, ludności 2021 i łańcuchów kart, tempo przeglądarki)';
    expect(opisGry(parsujArgumenty(['--prosto']))).toBe(prosto);
    expect(opisGry(parsujArgumenty(['--prosto', '--bez-lancuchow']))).toBe(prosto);
  });

  it('argumentyPrzebiegu: proces potomny dostaje grę, długość i te flagi, które zmieniają grę (nie próg ani liczbę procesów)', () => {
    expect(argumentyPrzebiegu(parsujArgumenty([]), 'lanciego', 12)).toEqual(['--jedna=lanciego:12', '--dni=45']);
    expect(
      argumentyPrzebiegu(
        parsujArgumenty(['--dni=30', '--prosto', '--bez-lancuchow', '--bez-progu', '--procesy=3', '--limit=9']),
        'zielonki',
        15,
      ),
    ).toEqual(['--jedna=zielonki:15', '--dni=30', '--prosto', '--bez-lancuchow']);
    // to, co dostaje potomek, parsuje się z powrotem na tę samą grę
    const potomek = parsujArgumenty(argumentyPrzebiegu(parsujArgumenty(['--bez-lancuchow']), 'przymorze', 13));
    expect(potomek).toMatchObject({ jedna: { demo: 'przymorze', ziarno: 13 }, bezLancuchow: true, prosto: false });
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

describe('uprząż bot:osada: usterki przebiegu', () => {
  it('opis zawieszonych z obciętą listą mówi, ile było razem i że liczy tylko zachowane wpisy', () => {
    // bez obcięcia (razem równe długości listy albo bez drugiego argumentu) tekst jak dawniej
    const wpisy = [
      { k: 'nowe_okno', s: 3 },
      { k: 'nowe_okno', s: 4 },
    ];
    expect(opisZawieszonych(wpisy, 2)).toEqual(opisZawieszonych(wpisy));
    const obciete = opisZawieszonych(wpisy, 1000);
    expect(obciete).toHaveLength(1);
    expect(obciete[0]).toContain('nowe_okno');
    expect(obciete[0]).toContain('co najmniej 2 razy');
    expect(obciete[0]).toContain('razem 1000');
    expect(obciete[0]).toContain('15:04');
    expect(obciete[0]).toContain('silnik nie umie zamknąć tego okna');
  });

  it('opis błędów decydenta: jedna linia na miejsce i tekst, ile razy i kiedy pierwszy raz, bez błędów pusty', () => {
    expect(opisBledowDecydenta([])).toEqual([]);
    // sekunda 3 to tick 60: dzień 1, 15:04 (jak w opisie zawieszonych)
    const opis = opisBledowDecydenta([
      { s: 3, gdzie: 'tura', tekst: 'TypeError: x is not a function' },
      { s: 4, gdzie: 'tura', tekst: 'TypeError: x is not a function' },
      { s: 4, gdzie: 'okno', tekst: 'TypeError: x is not a function' },
      { s: 9, gdzie: 'start', tekst: 'Error: inny' },
    ]);
    expect(opis).toHaveLength(3);
    expect(opis[0]).toContain('w turze');
    expect(opis[0]).toContain('TypeError: x is not a function');
    expect(opis[0]).toContain('2 razy');
    expect(opis[0]).toContain('dniu 1');
    expect(opis[0]).toContain('15:04');
    expect(opis[1]).toContain('w oknie zarządu');
    expect(opis[1]).toContain('1 raz ');
    expect(opis[2]).toContain('w starcie');
    expect(opis[2]).toContain('Error: inny');
    for (const linia of opis) expect(linia).toContain('decydent rzucił');
  });

  it('opis błędów decydenta z obciętą listą mówi, ile było razem', () => {
    const wpisy = Array.from({ length: 50 }, (_, n) => ({ s: 100 + n, gdzie: 'tura' as const, tekst: 'Error: x' }));
    expect(opisBledowDecydenta(wpisy, 50)).toEqual(opisBledowDecydenta(wpisy));
    const obciete = opisBledowDecydenta(wpisy, 4000);
    expect(obciete).toHaveLength(1);
    expect(obciete[0]).toContain('co najmniej 50 razy');
    expect(obciete[0]).toContain('razem 4000');
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

  it('przygotujGre: domyślnie gra jak w przeglądarce (obcy, mieszkańcy z adresu, okolica, ludność 2021, łańcuchy kart, tempo)', async () => {
    for (const demo of ['przymorze', 'lanciego', 'zielonki']) {
      const g = await przygotujGre(demo, 11, false);
      expect(g.seed, demo).toBe(11);
      // odpowiedzNaNieznane jawnie false: nowy rodzaj okna z innej gałęzi ma być w pomiarze błędem przebiegu, nie cichą odpowiedzią
      expect(g.opts, demo).toMatchObject({
        core: 4,
        obcy: true,
        lancuchy: true,
        tempoPrzegladarki: true,
        odpowiedzNaNieznane: false,
      });
      expect(g.opts.odpowiedzNaNieznane, demo).toBe(false);
      expect(g.opts.mieszkancy, demo).toBeDefined();
      expect(g.opts.okolica!.length, demo).toBeGreaterThan(0);
      expect(g.opts.ludnosc2021, demo).toBeGreaterThan(0);
      // opcje dochodzą do gry: obcy w symulacji, łańcuchy kart, mapa miasta i drogi do zwycięstwa w zarządzie, zarząd z 4 osób
      expect(g.sim.st.obcy, demo).toBeDefined();
      expect(g.gov.lancuchy, demo).toBe(true);
      expect(g.gov.miasto, demo).toBeDefined();
      expect(g.gov.zwyciestwo, demo).toBeDefined();
      expect(
        g.sim.st.pawns.filter((p) => p.kind === 'core'),
        demo,
      ).toHaveLength(4);
    }
  }, 120_000);

  it('przygotujGre z czwartym argumentem false: gra jak w przeglądarce, ale bez łańcuchów kart (zarząd bez wątków sezonu)', async () => {
    const g = await przygotujGre('przymorze', 11, false, false);
    expect(g.opts).toMatchObject({
      core: 4,
      obcy: true,
      lancuchy: false,
      tempoPrzegladarki: true,
      odpowiedzNaNieznane: false,
    });
    expect(g.opts.mieszkancy).toBeDefined();
    expect(g.opts.okolica!.length).toBeGreaterThan(0);
    expect(g.opts.ludnosc2021).toBeGreaterThan(0);
    // reszta jak w przeglądarce: obcy, mapa miasta i drogi do zwycięstwa, ale zarząd bez łańcuchów
    expect(g.sim.st.obcy).toBeDefined();
    expect(g.gov.miasto).toBeDefined();
    expect(g.gov.zwyciestwo).toBeDefined();
    expect(g.gov.lancuchy).toBeUndefined();
  }, 120_000);

  it('przygotujGre prosto: bez obcych, mieszkańców z adresu, okolicy, ludności 2021 i łańcuchów kart, ale z tempem przeglądarki', async () => {
    const g = await przygotujGre('lanciego', 12, true);
    expect(g.opts).toEqual({ core: 4, tempoPrzegladarki: true, odpowiedzNaNieznane: false });
    expect(g.sim.st.obcy).toBeUndefined();
    expect(g.gov.lancuchy).toBeUndefined();
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
    expect(wynik.zawieszonychRazem).toBe(0);
    expect(wynik.bledy).toEqual([]);
    expect(wynik.bledowRazem).toBe(0);
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
    expect(wynik.bledy).toEqual([]);
  }, 120_000);

  it('zagraj bez łańcuchów (szósty argument false) to ta sama gra co przygotujGre bez łańcuchów', async () => {
    // skrót gry obejmuje stan zarządu, a w nim flagę `lancuchy`, więc gra z łańcuchami nigdy nie ma skrótu gry bez nich
    const bez = await zagraj('przymorze', 12, 1, false, silnik, false);
    const g = await przygotujGre('przymorze', 12, false, false);
    expect(g.gov.lancuchy).toBeUndefined();
    grajDo(g, silnik, TICKS_PER_DAY);
    expect(bez.skrot).toBe(skrotGry(g));
    expect(bez.bledy).toEqual([]);
    expect(g.bledy).toEqual([]);
  }, 120_000);

  it('zagraj: błąd decydenta nie przerywa przebiegu, ale wychodzi w wyniku z licznikiem (uprząż liczy to jako błędny przebieg)', async () => {
    const rzuca: Decydent = {
      okno: () => {},
      tura: (g) => {
        if (g.sim.st.tick % (10 * TICKS_PER_SECOND) === 0) throw new Error('rzut w turze');
      },
    };
    const wynik = await zagraj('zielonki', 11, 2, true, rzuca);
    expect(wynik.przebieg.poranki.map((d) => d.dzien)).toEqual([2, 3]);
    expect(wynik.przebieg.koniec).toBeNull();
    // co dziesiąta sekunda dwóch dób (960 s na dobę): 192 błędy, na liście ostatnie MAX_BLEDOW
    expect(wynik.bledowRazem).toBe(192);
    expect(wynik.bledy).toHaveLength(MAX_BLEDOW);
    expect(wynik.bledy.at(-1)).toEqual({ s: 1920, gdzie: 'tura', tekst: 'Error: rzut w turze' });
    expect(wynik.zawieszone).toEqual([]);
    expect(opisBledowDecydenta(wynik.bledy, wynik.bledowRazem)).toHaveLength(1);
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
