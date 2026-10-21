/* Ocena przebiegów osady AI (tools/osada-ocena.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 2). Funkcje oceny są czyste, więc testy składają
   syntetyczne przebiegi (`przebiegi`) i sprawdzają werdykt: przeżycie 45 dni w co najmniej 4 z 5 ziaren, pierwszy kamień
   ludności (10 osób) w paśmie dni, co najmniej jedna budowla na trzy dni, każde w co najmniej 4 z 5 przebiegów na demie.
   Samą uprząż (tools/bot-osada.ts, procesy z prawdziwą grą) sprawdza się ręcznie: `npm run bot:osada`. */

import { describe, expect, it } from 'vitest';
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
