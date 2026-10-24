/* Wspólne kontrole treści wiki dla kategorii 9–13 (wydarzenia, miasto, sąsiedzi, drogi, zombie): długość i forma zdań,
   cudzysłowy, język angielski bez polskich słów, wariant domu bez słów z bloku (i odwrotnie), fakty bez pustych pól oraz
   odnośniki „Zobacz też”. Kategorie 4–8 pisze ktoś inny, więc odnośniki do nich wolno robić tylko po stałych
   identyfikatorach (`badanie:<id>`, `uchwala:<id>`, `praca:<rodzaj>`, `potrzeba:<klucz>`, `noc:napad`), a test sprawdza,
   że ich klucze istnieją w tabelach gry. Pomocnik nad `tests/unit/wiki-pomoc.ts`, który zostaje nietknięty. */

import { expect } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { M1_LAWS } from '../../src/gov/tresc.ts';
import { TECH_BY } from '../../src/sim/badania.ts';
import { RODZAJE } from '../../src/sim/praca.ts';
import { artykul, type KatId, maArtykul, rejestr } from '../../src/ui/wiki.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { kontekst, type Przypadek, tekstArtykulu } from './wiki-pomoc.ts';

/** słowa z bloku, których nie ma w domu jednorodzinnym (słownik miejsca: furtka, komitet, sąsiedzi) */
export const BLOKOWE = /klatk|trzepak|spółdziel|zarząd|walne|\bbram/i;
/** słowa ze słownika domu, których nie ma w bloku */
export const DOMOWE = /furtk|komitet/i;

/** Ile zdań ma tekst: zdanie kończy kropka, wykrzyknik albo pytajnik (z cudzysłowem po nim), po których idzie spacja
    i początek następnego zdania (wielka litera albo cudzysłów otwierający). Zdania w cudzysłowie (cytaty z gry, które same
    bywają dwuzdaniowe) liczą się jako jedno słowo. */
export const ileZdan = (t: string): number =>
  1 +
  (
    t
      .replace(/„[^”]*”/g, 'Q')
      .replace(/“[^”]*”/g, 'Q')
      .match(/[.!?][”"]?\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„“"])/g) ?? []
  ).length;

/** Kontrole treści wszystkich artykułów kategorii `kat` w jednym przypadku (miejsce, język, urządzenie), w obu trybach gry:
    od dwóch do pięciu zdań po jednym w elemencie, bez pauz-myślników i pogrubień, cudzysłowy właściwe dla języka, angielski
    bez polskich słów (poza `wlasne`), dom bez słów z bloku, blok bez słów z domu, fakty z niepustymi polami. */
export function kontrolaTresci(p: Przypadek, kat: KatId, wlasne: readonly string[] = []): void {
  ustawJezyk(p.lang);
  const lista = rejestr().filter((d) => d.kat === kat);
  expect(lista.length, `artykuły kategorii ${kat}`).toBeGreaterThan(0);
  for (const zombie of [false, true]) {
    const c = kontekst(p.wariant, p.touch, zombie);
    for (const d of lista) {
      const a = artykul(d.id, c)!;
      const t = tekstArtykulu(a);
      const gdzie = `${a.id} (${p.opis}, ${zombie ? 'zombie' : 'zwykła gra'})`;
      expect(a.kat, gdzie).toBe(kat);
      expect(a.tytul.trim(), gdzie).not.toBe('');
      expect(a.zdania.length, `${gdzie}: liczba zdań`).toBeGreaterThanOrEqual(2);
      expect(a.zdania.length, `${gdzie}: liczba zdań`).toBeLessThanOrEqual(5);
      for (const z of a.zdania) expect(ileZdan(z), `${gdzie}: „${z}” to więcej niż jedno zdanie`).toBe(1);
      expect(t, gdzie).not.toMatch(/—|\*\*|undefined|NaN|\[object| {2,}|"/);
      expect(t, gdzie).not.toMatch(p.lang === 'pl' ? /[“]/ : /[„]/);
      if (p.lang === 'en') expect(polskieSlowa(t, wlasne), gdzie).toEqual([]);
      if (p.wariant === 'dom') expect(t, `${gdzie}: słowa z bloku`).not.toMatch(BLOKOWE);
      else expect(t, `${gdzie}: słowa z domu`).not.toMatch(DOMOWE);
      const idy = a.fakty.map((f) => f.id);
      expect(new Set(idy).size, `${gdzie}: powtórzone identyfikatory faktów`).toBe(idy.length);
      for (const f of a.fakty) {
        expect(f.k.trim(), `${gdzie}: fakt ${f.id}`).not.toBe('');
        expect(f.v.trim(), `${gdzie}: fakt ${f.id}`).not.toBe('');
      }
      for (const j of a.jak) expect(j.trim(), gdzie).not.toBe('');
    }
  }
}

/** kategorie, do których artykuły dostępne w tej gałęzi mogą prowadzić zwykłym identyfikatorem (1–3 i własne 9–13) */
const ZNANE = /^(start|zasob|budowla|budowle|wydarzenia|miasto|miejsce|sasiedzi|drogi|zombie):/;

/** potrzeby z `Needs` (src/sim/needs.ts): klucze artykułów `potrzeba:<klucz>` */
const POTRZEBY = ['food', 'warm', 'rest', 'health', 'safe', 'mood'];

/** Odnośniki „Zobacz też” artykułów kategorii `kat`: do artykułów kategorii 1–3 i 9–13 muszą prowadzić istniejące
    identyfikatory, do kategorii 4–8 tylko stałe (`badanie:`, `uchwala:`, `praca:`, `potrzeba:`, `noc:napad`) z kluczami
    z tabel gry. Zwraca liczbę sprawdzonych odnośników. */
export function kontrolaOdnosnikow(kat: KatId): number {
  ustawJezyk('pl');
  let n = 0;
  for (const zombie of [false, true])
    for (const wariant of ['blok', 'dom'] as const) {
      const c = kontekst(wariant, false, zombie);
      for (const d of rejestr().filter((x) => x.kat === kat)) {
        for (const z of artykul(d.id, c)!.zobacz) {
          n++;
          const [rodzaj, klucz] = z.split(':');
          if (ZNANE.test(z)) expect(maArtykul(z), `${d.id} -> ${z}`).toBe(true);
          else if (rodzaj === 'badanie') expect(Object.hasOwn(TECH_BY, klucz), `${d.id} -> ${z}`).toBe(true);
          else if (rodzaj === 'uchwala') expect(Object.hasOwn(M1_LAWS, klucz), `${d.id} -> ${z}`).toBe(true);
          else if (rodzaj === 'praca') expect(RODZAJE as readonly string[], `${d.id} -> ${z}`).toContain(klucz);
          else if (rodzaj === 'potrzeba') expect(POTRZEBY, `${d.id} -> ${z}`).toContain(klucz);
          else expect(z, `${d.id} prowadzi do kategorii 4–8 poza stałymi identyfikatorami`).toBe('noc:napad');
        }
      }
    }
  return n;
}
