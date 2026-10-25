/* Silnik osady AI na kartach łańcuchów historii (src/gov/watki-tresc.ts, silnik w watki.ts), część B zadania 7 etapu 1
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md). Dwanaście łańcuchów weszło do gry razem z wydarzeniami etapów 4–5:
   ich kroki to wydarzenia jak inne (okno `wydarzenie` z własnym id), część z gościem pod bramą, część z hakami, które zwalniają
   następny krok. Pilnuje trzech rzeczy:
   - odpowiedzi: na atrapie symulacji z tests/unit/watki-tresc-play.ts (te same scenariusze co test treści łańcuchów: blok i
     dom, zwykły i zombie) silnik odpowiada na każdy krok każdego łańcucha: wybór jest dozwolony, okno się zamyka, najwyżej
     `MAX_KROKOW_OKNA` wyborów na okno, a pierwszy krok otwiera się zawsze;
   - uczciwości wobec generatora i ziaren: wybór nie zależy od stanu prawdziwego generatora zarządu (kopie oceny dostają ziarna
     pochodne), a ten sam łańcuch zagrany z różnymi ziarnami zarządu (inne imiona, twarze, płeć) daje silnikowi te same wybory;
   - uczciwości wobec ukrytych rzutów kart w prawdziwej grze z łańcuchami: w każdym oknie wydarzenia przerzucenie pola
     logicznego albo liczbowego w danych karty, które nie zmienia tego, co widać (tytuł, tekst, napisy i dostępność wyborów), i
     podstawienie każdego możliwego haczyka gościa nie zmieniają wyboru silnika. Test widzi znane ukryte rzuty (`halas.cat`,
     `krzyk.help`: bez przelosowania z src/ai/okna.ts ich przerzucenie zmieniałoby wybór), więc nie przechodzi na pustym
     warunku; karta z nowym ukrytym rzutem w puli albo w łańcuchu zapali go i przypomni o `UKRYTE_RZUTY`.
   Granica: kroki `dach` i `dobicie` (tylko tryb zombie) mają ugryzienie zapisane w danych karty z gościem
   (`GoscKarty.ugryziony`), którego karta nie pokazuje. To skrypt łańcucha, nie rzut, więc reguła uczciwości etapu 1 go nie
   przelosowuje; tryb zombie jest poza etapem 1, a test pilnuje tylko tego, że tryb zwykły takich kroków nie ma. */

import { describe, expect, it } from 'vitest';
import { grajDo, wejscie as wejscieGry } from '../../src/ai/gra.ts';
import { MAX_KROKOW_OKNA, odpowiedzNaWydarzenie, wyborWydarzenia } from '../../src/ai/okna.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { haczykiMozliwe } from '../../src/gov/goscie.ts';
import type { Prompt } from '../../src/gov/typy.ts';
import { krokPoId, LANCUCHY } from '../../src/gov/watki.ts';
import { eventView } from '../../src/gov/wydarzenia.ts';
import { chooseEvent } from '../../src/gov/zarzad.ts';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { przygotujGre } from '../../tools/bot-osada.ts';
import { dalej, nowySwiat, type OpcjeSwiata, SCEN, type Swiat, wejscie, zastosuj } from './watki-tresc-play.ts';

type Wydarzenie = Extract<Prompt, { k: 'wydarzenie' }>;

/** okno wydarzenia z widoku zarządu (jak `pending`) */
function okno(s: Swiat): Wydarzenie {
  const v = eventView(s.gov, wejscie(s));
  if (!v) throw new Error('otwarta karta bez widoku');
  return { k: 'wydarzenie', ...v };
}

/** Jeden krok łańcucha z odpowiedzią silnika: wybory (numery) i czy okno się zamknęło. */
interface OdpowiedzNaKrok {
  id: string;
  wybory: number[];
  /** pierwszy wybór był dozwolony w oknie, na które silnik odpowiadał */
  dozwolony: boolean;
  zamkniete: boolean;
}

/** Gra łańcuch `id` w scenariuszu `o` samym silnikiem (`odpowiedzNaWydarzenie` z oceną na kopiach zarządu): czas idzie do
    następnej karty łańcucha (`dalej`), silnik odpowiada, skutki idą do udawanego świata (`zastosuj`). */
function zagrajSilnikiem(id: string, o: OpcjeSwiata): { kroki: OdpowiedzNaKrok[]; swiat: Swiat } {
  const s = nowySwiat(id, o);
  const kroki: OdpowiedzNaKrok[] = [];
  for (let n = 0; n < 8 && dalej(s); n++) {
    const p = okno(s);
    const wybory: number[] = [];
    odpowiedzNaWydarzenie(
      s.gov,
      () => wejscie(s),
      p,
      (k) => {
        wybory.push(k);
        zastosuj(s, chooseEvent(s.gov, wejscie(s), k));
      },
    );
    kroki.push({
      id: p.id,
      wybory,
      dozwolony: wybory.length > 0 && p.choices[wybory[0]]?.ok === true,
      zamkniete: s.gov.ev.active === null || s.gov.ev.active.id !== p.id,
    });
  }
  return { kroki, swiat: s };
}

const SCENARIUSZE = LANCUCHY.flatMap((l) => (SCEN[l.id] ?? []).map((sc) => [l.id, sc.nazwa, sc.o] as const));

describe('silnik odpowiada na każdy krok każdego łańcucha', () => {
  it('każdy łańcuch ma co najmniej dwa scenariusze (blok i dom)', () => {
    expect(new Set(SCENARIUSZE.map(([id]) => id)).size).toBe(LANCUCHY.length);
    for (const l of LANCUCHY) expect((SCEN[l.id] ?? []).length, l.id).toBeGreaterThanOrEqual(2);
  });

  it.each(SCENARIUSZE)('%s (%s): każde okno dostaje dozwolony wybór i się zamyka', (id, _nazwa, o) => {
    const { kroki, swiat } = zagrajSilnikiem(id, o);
    // pierwszy krok otwiera się zawsze (nie przechodzi na pustym warunku), a łańcuch jest wątkiem tej gry
    expect(kroki.length, `${id}: żaden krok się nie otworzył`).toBeGreaterThanOrEqual(1);
    expect(swiat.gov.watki?.wybrane).toEqual([id]);
    expect(kroki[0].id).toBe(LANCUCHY.find((l) => l.id === id)!.kroki[0].id);
    for (const k of kroki) {
      expect(krokPoId(k.id)?.lancuch, `${k.id} jest krokiem łańcucha ${id}`).toBe(id);
      expect(k.wybory.length, `${k.id}: silnik nie wybrał niczego`).toBeGreaterThanOrEqual(1);
      expect(k.wybory.length, `${k.id}: więcej wyborów niż kroków okna`).toBeLessThanOrEqual(MAX_KROKOW_OKNA);
      expect(k.dozwolony, `${k.id}: wybór niedozwolony ${k.wybory}`).toBe(true);
      expect(k.zamkniete, `${k.id}: okno zostało otwarte po odpowiedzi silnika`).toBe(true);
    }
    // łańcuch idzie do przodu: żaden krok nie wraca w jednej grze
    expect(new Set(kroki.map((k) => k.id)).size).toBe(kroki.length);
  });

  it('razem silnik odpowiada na wiele kroków: z każdego łańcucha co najmniej pierwszy, a ze wszystkich co najmniej dwa na łańcuch', () => {
    const otwarte = new Set<string>();
    for (const [id, , o] of SCENARIUSZE) for (const k of zagrajSilnikiem(id, o).kroki) otwarte.add(k.id);
    for (const l of LANCUCHY) expect(otwarte.has(l.kroki[0].id), `pierwszy krok ${l.id}`).toBe(true);
    expect(otwarte.size).toBeGreaterThanOrEqual(LANCUCHY.length * 2);
  });
});

describe('wybór silnika na kartach łańcuchów nie zależy od tego, czego gracz nie widzi', () => {
  it.each(SCENARIUSZE)('%s (%s): wybór nie zależy od stanu prawdziwego generatora zarządu', (id, _nazwa, o) => {
    const s = nowySwiat(id, o);
    let okien = 0;
    for (let n = 0; n < 8 && dalej(s); n++) {
      const p = okno(s);
      const wybory = new Set<number>();
      for (const ziarno of [s.gov.rng.s, 1, 2, 0xdeadbeef | 0]) {
        const kopia = structuredClone(s.gov);
        kopia.rng.s = ziarno;
        wybory.add(wyborWydarzenia(kopia, wejscie(s), p));
      }
      expect([...wybory], `${p.id}: wybór zależy od generatora`).toHaveLength(1);
      zastosuj(s, chooseEvent(s.gov, wejscie(s), [...wybory][0]));
      okien++;
    }
    expect(okien).toBeGreaterThanOrEqual(1);
  });

  it.each(SCENARIUSZE)(
    '%s (%s): z różnymi ziarnami zarządu (imiona, twarze, płeć) silnik wybiera to samo',
    (id, _nazwa, o) => {
      const sekwencje = [3, 4, 5, 6, 7, 8].map((seed) => {
        const { kroki } = zagrajSilnikiem(id, { ...o, seed });
        return kroki.map((k) => `${k.id}:${k.wybory.join(',')}`);
      });
      expect(sekwencje[0].length).toBeGreaterThanOrEqual(1);
      for (const sek of sekwencje) expect(sek).toEqual(sekwencje[0]);
    },
  );

  it('w prawdziwej grze z łańcuchami (Przymorze 12, 12 dni, mieszkańcy z adresu) ukryte rzuty kart i haczyki gości nie zmieniają wyboru silnika', async () => {
    // gra z uprzęży `npm run bot:osada`: jak w przeglądarce, czyli z łańcuchami kart (część B zadania 7)
    const g = await przygotujGre('przymorze', 12, false);
    expect(g.gov.lancuchy).toBe(true);
    const okien: Record<string, number> = {};
    const przerzucone: Record<string, number> = {};
    const zmiany: string[] = [];
    let haczykow = 0;
    const audyt = (gr: typeof g, p: Wydarzenie): void => {
      okien[p.id] = (okien[p.id] ?? 0) + 1;
      const i = wejscieGry(gr);
      const baza = wyborWydarzenia(gr.gov, i, p);
      const widokBazy = JSON.stringify(eventView(gr.gov, i));
      const dane = gr.gov.ev.active?.d as Record<string, unknown> | undefined;
      for (const pole of Object.keys(dane ?? {}).filter((k) => ['boolean', 'number'].includes(typeof dane?.[k]))) {
        const kopia = structuredClone(gr.gov);
        const d = kopia.ev.active!.d as Record<string, unknown>;
        d[pole] = typeof dane![pole] === 'boolean' ? !dane![pole] : (dane![pole] as number) + 1;
        let widok: ReturnType<typeof eventView>;
        try {
          widok = eventView(kopia, i);
        } catch {
          continue;
        }
        // pole, które zmienia to, co widać, nie jest ukrytym rzutem
        if (!widok || JSON.stringify(widok) !== widokBazy) continue;
        przerzucone[`${p.id}.${pole}`] = (przerzucone[`${p.id}.${pole}`] ?? 0) + 1;
        if (wyborWydarzenia(kopia, i, { k: 'wydarzenie', ...widok }) !== baza) zmiany.push(`${p.id}.${pole}`);
      }
      const aktywny = gr.gov.goscie?.aktywny;
      if (p.id === 'gosc' && aktywny && !aktywny.koniec) {
        for (const h of haczykiMozliwe(aktywny.gosc.kto, gr.gov.mode ?? 'zwykly')) {
          const kopia = structuredClone(gr.gov);
          const gosc = kopia.goscie!.aktywny!.gosc;
          gosc.haczyk = h;
          if (h === 'ugryziony') gosc.ugryziony = 0;
          else delete gosc.ugryziony;
          const widok = eventView(kopia, i);
          if (!widok) continue;
          haczykow++;
          if (wyborWydarzenia(kopia, i, { k: 'wydarzenie', ...widok }) !== baza) zmiany.push(`gosc.haczyk=${h}`);
        }
      }
    };
    grajDo(
      g,
      {
        ...silnik,
        okno(gr, p, r) {
          if (p.k === 'wydarzenie') audyt(gr, p);
          silnik.okno(gr, p, r);
        },
      },
      12 * TICKS_PER_DAY,
    );
    // audyt nie przechodzi na pustym warunku: okna kart puli, gości i kroków łańcuchów, a wśród przerzuconych pól znane ukryte
    // rzuty (`halas.cat`, `krzyk.help`), których przerzucenie bez przelosowania zmieniałoby wybór
    const idy = Object.keys(okien);
    expect(idy.length).toBeGreaterThan(10);
    expect(idy.filter((id) => krokPoId(id)).length, 'kroki łańcuchów w oknach').toBeGreaterThanOrEqual(3);
    expect(okien.gosc ?? 0).toBeGreaterThan(5);
    expect(haczykow).toBeGreaterThan(20);
    expect(Object.keys(przerzucone)).toEqual(expect.arrayContaining(['halas.cat', 'krzyk.help']));
    expect(zmiany).toEqual([]);
    expect(g.zawieszone).toEqual([]);
    // `krokGry` łapie błędy decydenta (silnika albo audytu w tym teście): bez tego sprawdzenia rzut przeszedłby bez śladu
    expect(g.bledy).toEqual([]);
  }, 120_000);
});

describe('granica trybu zombie', () => {
  it('kroki z ukrytym ugryzieniem (dach, dobicie) są tylko w trybie zombie', () => {
    const zUgryzieniem = LANCUCHY.filter((l) => l.id === 'dach' || l.id === 'dobicie');
    expect(zUgryzieniem).toHaveLength(2);
    for (const l of zUgryzieniem) expect(l.tryby, l.id).toEqual(['zombie']);
  });
});
