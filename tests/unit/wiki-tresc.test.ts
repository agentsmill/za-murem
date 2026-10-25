/* Treść wiki (src/ui/wiki-*.ts) jako całość: każdy artykuł w każdym przypadku (blok i dom, polski i angielski, mysz i dotyk)
   buduje się, ma od dwóch do pięciu zdań, czysty tekst (bez „undefined”, pauz-myślników, kropek dziesiętnych po polsku i
   minusów z łącznika), angielski bez polskich słów, dom bez słów z bloku, a „Zobacz też” prowadzi do istniejących artykułów.
   Kategorie 9–13 pisze druga sesja (gałąź wiki-2): do ich artykułów odsyłać wolno tylko dziewięcioma uzgodnionymi
   identyfikatorami (`UZGODNIONE`); globalny test „każdy odnośnik istnieje” dopisze integrator, gdy obie gałęzie się zejdą. */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { DROGI } from '../../src/gov/zwyciestwo.ts';
import { nazwaTech, TECHS } from '../../src/sim/badania.ts';
import { ARTYKUL_STARTOWY, CZIPY, KATEGORIE, maArtykul, rejestr } from '../../src/ui/wiki.ts';
import { POLSKIE, polskieSlowa } from './po-angielsku.ts';
import { PRZYPADKI, tekstArtykulu, UZGODNIONE, zbuduj } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

/** kategorie, które pisze druga sesja: ich artykuły są poza tą gałęzią */
const KATEGORIE_DRUGIEJ_SESJI = ['wydarzenia', 'miasto', 'sasiedzi', 'drogi', 'zombie'];

/** odnośnik, który wolno zostawić bez artykułu w tej gałęzi */
const obcy = (id: string): boolean => UZGODNIONE.has(id);

/** nazwy własne technologii i dróg do zwycięstwa (np. „Nowe osiedle”) zostają takie same w bloku i w domu, więc przed
    szukaniem słów z bloku wypadają z tekstu */
function bezNazwTechnologii(tekst: string): string {
  let t = tekst;
  const nazwy = [
    ...TECHS.flatMap((x) => {
      const n = nazwaTech(x.id);
      return [n.pl, n.en];
    }),
    ...Object.values(DROGI).flatMap((d) => [d.nazwa.pl, d.nazwa.en]),
  ];
  for (const n of nazwy.sort((a, b) => b.length - a.length)) t = t.replaceAll(n, ' ');
  return t.replace(/research board/gi, ' ').replaceAll('tablica badań', ' ');
}

/** Słowa z bloku, których w domu jednorodzinnym nie ma: klatka, piętro, blok, spółdzielnia, brama, trzepak, zarząd, walne…
    Początek wyrazu (żeby „odblokowuje” nie było „blokiem”), z wyjątkami „piętrowe” (łóżka) i „blokuje”, „blokada”. */
const BLOK_PL =
  /(?<!\p{L})(klatk|piętr(?!ow)|spółdziel|pawilon|szlaban|świetlic|czynsz|blok(?!uj|ad)|mieszka[nń]|trzepak|bram|zarząd|walne|osiedl)/iu;
const BLOK_EN =
  /stairwell|third floor|storey|co-op|pavilion|barrier|common room|service charge|\bblocks?\b(?! (the|it|them|a|off|up))|\bflats?\b|\bboard\b|\bresidents?\b|\bestate\b|carpet|general meeting/i;

/** polskie nazwy własne, które zostają w angielskim tekście (OpenStreetMap, dane urzędowe, nazwa gry) */
const DOZWOLONE_EN: readonly string[] = ['Za Murem', 'GUS', 'PESEL', 'OpenStreetMap', 'OpenFreeMap', 'OpenMapTiles'];

describe('wszystkie artykuły, wszystkie przypadki', () => {
  for (const p of PRZYPADKI) {
    describe(p.opis, () => {
      it('budują się i mają od dwóch do pięciu zdań z kropką', () => {
        const { artykuly } = zbuduj(p);
        expect(artykuly.length).toBe(rejestr().length);
        for (const a of artykuly) {
          expect(a.tytul, a.id).not.toBe('');
          expect(a.zdania.length, a.id).toBeGreaterThanOrEqual(2);
          expect(a.zdania.length, a.id).toBeLessThanOrEqual(5);
          for (const z of a.zdania) {
            // zdanie może kończyć cytat pełnego zdania z gry z kropką w środku („… gra mówi: „Zamknięte na klucz.”)
            expect(z, a.id).toMatch(/[.!?]”?$/);
            expect(z.length, `${a.id}: ${z}`).toBeLessThan(380);
          }
        }
      });

      it('fakty mają stałe, różne identyfikatory, etykiety i wartości', () => {
        const { artykuly } = zbuduj(p);
        for (const a of artykuly) {
          const idy = a.fakty.map((f) => f.id);
          expect(new Set(idy).size, `${a.id}: ${idy.join(',')}`).toBe(idy.length);
          for (const f of a.fakty) {
            expect(f.id, a.id).toMatch(/^[a-z0-9_-]+$/);
            expect(f.k.trim(), `${a.id}/${f.id}`).not.toBe('');
            expect(f.v.trim(), `${a.id}/${f.id}`).not.toBe('');
          }
          for (const j of a.jak) expect(j.trim(), a.id).not.toBe('');
        }
      });

      it('czysty tekst: bez undefined, NaN, pauz-myślników, podwójnych spacji i minusa z łącznika', () => {
        const { artykuly } = zbuduj(p);
        for (const a of artykuly) {
          const t = tekstArtykulu(a);
          expect(t, a.id).not.toMatch(/undefined|NaN|\[object|\$\{|—|null\b/);
          expect(t, a.id).not.toMatch(/ {2}/);
          expect(t, a.id).not.toMatch(/(^|[\s(/])-\d/m);
          for (const x of [a.tytul, ...a.zdania, ...a.jak, ...a.fakty.flatMap((f) => [f.k, f.v])])
            expect(x, a.id).toBe(x.trim());
        }
      });

      if (p.lang === 'pl') {
        it('po polsku liczby mają przecinek dziesiętny', () => {
          const { artykuly } = zbuduj(p);
          for (const a of artykuly) expect(tekstArtykulu(a), a.id).not.toMatch(/\d\.\d/);
        });
      } else {
        it('po angielsku nie ma polskich liter ani polskich słówek', () => {
          const { artykuly } = zbuduj(p);
          for (const a of artykuly) {
            const t = bezNazwTechnologii(tekstArtykulu(a));
            expect(polskieSlowa(t, DOZWOLONE_EN), a.id).toEqual([]);
            expect(t, a.id).not.toMatch(POLSKIE);
          }
        });
      }

      if (p.wariant === 'dom') {
        it('w domu nie ma słów z bloku', () => {
          const { artykuly } = zbuduj(p);
          const wzor = p.lang === 'pl' ? BLOK_PL : BLOK_EN;
          for (const a of artykuly) {
            const t = bezNazwTechnologii(tekstArtykulu(a));
            expect(t, `${a.id}: ${t.match(wzor)?.[0]}`).not.toMatch(wzor);
          }
        });
      }

      it('„Zobacz też” prowadzi do istniejących artykułów (albo do uzgodnionych z drugą sesją)', () => {
        const { artykuly } = zbuduj(p);
        for (const a of artykuly) {
          expect(new Set(a.zobacz).size, a.id).toBe(a.zobacz.length);
          expect(a.zobacz, a.id).not.toContain(a.id);
          for (const id of a.zobacz) expect(maArtykul(id) || obcy(id), `${a.id} → ${id}`).toBe(true);
        }
      });
    });
  }
});

describe('odnośniki poza tą gałęzią', () => {
  it('kategorie drugiej sesji są wskazywane tylko uzgodnionymi identyfikatorami', () => {
    const { artykuly } = zbuduj(PRZYPADKI[0]);
    for (const a of artykuly) {
      if (KATEGORIE_DRUGIEJ_SESJI.includes(a.kat)) continue;
      for (const id of a.zobacz) {
        const prefiks = id.split(':')[0];
        if (maArtykul(id)) continue;
        expect(UZGODNIONE.has(id), `${a.id} → ${id} (${prefiks})`).toBe(true);
      }
    }
  });

  it('czipy paska wskazują istniejące albo uzgodnione artykuły, a ich identyfikatory są w index.html', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    for (const [chip, id] of Object.entries(CZIPY)) {
      expect(maArtykul(id) || obcy(id), `${chip} → ${id}`).toBe(true);
      expect(html, chip).toContain(`id="${chip}"`);
    }
  });

  it('artykuł startowy istnieje', () => {
    expect(maArtykul(ARTYKUL_STARTOWY)).toBe(true);
  });
});

describe('kategorie 1–8', () => {
  it('każda ma artykuły, w kolejności z listy kategorii', () => {
    const wedlug = new Map<string, number>();
    for (const d of rejestr()) wedlug.set(d.kat, (wedlug.get(d.kat) ?? 0) + 1);
    for (const k of KATEGORIE.slice(0, 8)) expect(wedlug.get(k) ?? 0, k).toBeGreaterThan(4);
  });
});
