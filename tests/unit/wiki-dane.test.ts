/* Wiki w grze: pokrycie tabel gry artykułami i zgodność faktów z tabelami. Każdy rodzaj budowli, technologia, uchwała, rodzaj
   pracy, zasób zarządu, potrzeba, broń i umiejętność ma artykuł (albo wiersz w artykule), a liczby w blokach faktów są takie,
   jak w tabelach, z których gra je czyta (BUILDS, TECHS, RECIPES, BURNABLE, WEAPONS, M1_LAWS…), liczone tu osobno od wiki.
   Tabele pisane ręcznie w wiki (UMIEJETNOSCI, POLECENIA, ZAKLADKA) są sprawdzone na funkcjach i tekstach gry. */

import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DOM, TECH_DOMS, TRAITS } from '../../src/content/data.ts';
import { OSOB_DOMYSLNIE, OSOB_MAX, OSOB_MIN } from '../../src/content/druzyna.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { BLOK, wordsEn, wordsOf } from '../../src/gov/miejsce.ts';
import { M1_LAWS } from '../../src/gov/tresc.ts';
import { STOCK_KEYS } from '../../src/gov/wspolne.ts';
import { kosztDoPokazania, kosztTech, nazwaTech, TECHS } from '../../src/sim/badania.ts';
import { WEAPONS } from '../../src/sim/bron.ts';
import { BUILDS, type BuildKind, type Mat } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { MAT_EN } from '../../src/sim/mieszkania.en.ts';
import type { Needs } from '../../src/sim/needs.ts';
import { RODZAJE, type RodzajPracy, WPISY } from '../../src/sim/praca.ts';
import { BURNABLE, FOOD_START, MEAL_HOURS, WORK_START } from '../../src/sim/sim.ts';
import { RECIPES } from '../../src/sim/surowce.ts';
import { WARM_ENOUGH } from '../../src/sim/tutorial.ts';
import { buildMenu, buildName, MAT_NAME } from '../../src/ui/budowa.ts';
import { NIGHT_WOOD } from '../../src/ui/cele.ts';
import { ARTYKUL_POTRZEBY, ARTYKUL_ZAPASU, type Artykul, artykul, maArtykul } from '../../src/ui/wiki.ts';
import { ZAKLADKA } from '../../src/ui/wiki-budowle.ts';
import { POLECENIA, UMIEJETNOSCI } from '../../src/ui/wiki-praca.ts';
import { kontekst } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const ART = (id: string, wariant: 'blok' | 'dom' = 'blok', touch = false): Artykul => {
  const a = artykul(id, kontekst(wariant, touch));
  if (!a) throw new Error(`brak artykułu ${id}`);
  return a;
};
const FAKT = (a: Artykul, id: string): string => {
  const f = a.fakty.find((x) => x.id === id);
  if (!f) throw new Error(`${a.id}: brak faktu ${id} (${a.fakty.map((x) => x.id).join(', ')})`);
  return f.v;
};

describe('pokrycie tabel gry', () => {
  it('każdy rodzaj budowli ma artykuł, a artykuły budowli to dokładnie BUILDS', () => {
    for (const k of Object.keys(BUILDS)) expect(maArtykul(`budowla:${k}`), k).toBe(true);
  });

  it('każda technologia ma artykuł', () => {
    for (const t of TECHS) expect(maArtykul(`badanie:${t.id}`), t.id).toBe(true);
  });

  it('każda uchwała ma artykuł', () => {
    for (const id of Object.keys(M1_LAWS)) expect(maArtykul(`uchwala:${id}`), id).toBe(true);
  });

  it('każdy rodzaj pracy ma artykuł', () => {
    for (const r of RODZAJE) expect(maArtykul(`praca:${r}`), r).toBe(true);
  });

  it('każdy zapas zarządu i każda potrzeba ma artykuł', () => {
    for (const k of STOCK_KEYS) expect(maArtykul(ARTYKUL_ZAPASU[k]), k).toBe(true);
    for (const k of Object.keys(ARTYKUL_POTRZEBY) as (keyof Needs)[])
      expect(maArtykul(ARTYKUL_POTRZEBY[k]), k).toBe(true);
    for (const k of ['food', 'warm', 'rest', 'health', 'safe', 'mood'])
      expect(maArtykul(`potrzeba:${k}`), k).toBe(true);
  });

  it('każda broń ma artykuł', () => {
    for (const id of Object.keys(WEAPONS)) expect(maArtykul(`bron:${id}`), id).toBe(true);
  });

  it('każda dziedzina ma wiersz o umiejętności, a każda cecha wiersz o skutku', () => {
    const umiejetnosci = ART('ludzie:umiejetnosci');
    for (const d of Object.keys(DOM)) expect(FAKT(umiejetnosci, `umiejetnosc-${d}`), d).not.toBe('');
    const cechy = ART('ludzie:cechy');
    for (const t of Object.keys(TRAITS)) expect(FAKT(cechy, `cecha-${t}`), t).not.toBe('');
  });
});

describe('budowle: fakty z BUILDS', () => {
  const rodzaje = Object.keys(BUILDS) as BuildKind[];

  it('rozmiar, koszt, praca, limit i badanie są takie jak w tabeli (polski)', () => {
    for (const k of rodzaje) {
      const a = ART(`budowla:${k}`);
      const d = BUILDS[k];
      expect(FAKT(a, 'rozmiar'), k).toBe(`${d.w}×${d.h}`);
      const koszt = FAKT(a, 'koszt');
      for (const [m, n] of Object.entries(d.cost) as [Mat, number][])
        expect(koszt, `${k} ${m}`).toContain(`${MAT_NAME[m]} ${n}`);
      expect((koszt.match(/\d+/g) ?? []).length, k).toBe(Object.keys(d.cost).length);
      const min = Math.round((d.work / TICKS_PER_HOUR) * 60);
      const oczekiwany =
        min < 60
          ? `${min} min pracy`
          : min % 60 === 0
            ? `${min / 60} h pracy`
            : min % 60 === 30
              ? `${Math.floor(min / 60)},5 h pracy`
              : `${Math.floor(min / 60)} h ${min % 60} min pracy`;
      expect(FAKT(a, 'praca'), k).toBe(oczekiwany);
      if (d.max !== undefined) expect(FAKT(a, 'limit'), k).toContain(String(d.max));
      else
        expect(
          a.fakty.map((f) => f.id),
          k,
        ).not.toContain('limit');
      if (d.tech) expect(FAKT(a, 'odblokowanie'), k).toBe(nazwaTech(d.tech).pl);
      else expect(FAKT(a, 'odblokowanie'), k).toBe('od początku gry');
    }
  });

  it('koszt po angielsku ma angielskie materiały', () => {
    ustawJezyk('en');
    for (const k of rodzaje) {
      const koszt = FAKT(ART(`budowla:${k}`), 'koszt');
      for (const [m, n] of Object.entries(BUILDS[k].cost) as [Mat, number][])
        expect(koszt, `${k} ${m}`).toContain(`${MAT_EN[m]} ${n}`);
    }
  });

  it('nazwy zakładek są takie jak w panelu budowy, a lista zakładek artykułu o budowie zgadza się z BUILDS', () => {
    const menu = buildMenu({}, () => true, wordsOf(BLOK), wordsEn(BLOK), { showLocked: true });
    const tytuly = menu.map((m) => m.title);
    for (const cat of ['dom', 'podworko', 'obwod'] as const) expect(tytuly, cat).toContain(ZAKLADKA[cat][0]);
    ustawJezyk('en');
    const menuEn = buildMenu({}, () => true, wordsOf(BLOK), wordsEn(BLOK), { showLocked: true });
    for (const cat of ['dom', 'podworko', 'obwod'] as const)
      expect(
        menuEn.map((m) => m.title),
        cat,
      ).toContain(ZAKLADKA[cat][1]);
    ustawJezyk('pl');
    const jak = ART('budowle:jak');
    for (const cat of ['dom', 'podworko', 'obwod'] as const) {
      const nazwy = rodzaje.filter((k) => BUILDS[k].cat === cat).map((k) => buildName(k));
      expect(FAKT(jak, `zakladka-${cat}`), cat).toBe(nazwy.join(', '));
    }
  });
});

describe('badania: fakty z TECHS', () => {
  it('era, dziedzina, poziom, koszt, wymagania i odblokowania są takie jak w tabeli', () => {
    for (const t of TECHS) {
      const a = ART(`badanie:${t.id}`);
      expect(FAKT(a, 'era'), t.id).toMatch(new RegExp(`^${t.era}:`));
      expect(FAKT(a, 'dziedzina'), t.id).toBe(DOM[t.dom]);
      expect(FAKT(a, 'poziom'), t.id).toBe(String(t.lvl));
      expect(FAKT(a, 'koszt'), t.id).toBe(`${kosztDoPokazania(kosztTech(t.id))} pkt`);
      const wymaga = FAKT(a, 'wymaga');
      if (t.req.length) for (const r of t.req) expect(wymaga, t.id).toContain(nazwaTech(r).pl);
      else expect(wymaga, t.id).toBe('nic');
      for (const k of t.odblokowuje) expect(FAKT(a, 'odblokowuje'), t.id).toContain(buildName(k as BuildKind));
      expect(FAKT(a, 'stan'), t.id).toBe(t.dziala ? 'działa' : 'jeszcze nie działa: karta leży odwrócona');
    }
  });

  it('odnośniki prowadzą do budowli, które technologia odblokowuje, i do wymaganych technologii', () => {
    for (const t of TECHS) {
      const a = ART(`badanie:${t.id}`);
      for (const k of t.odblokowuje) expect(a.zobacz, t.id).toContain(`budowla:${k}`);
      for (const r of t.req) expect(a.zobacz, t.id).toContain(`badanie:${r}`);
    }
  });

  it('dziedziny z tabeli to dziedziny badań', () => {
    for (const t of TECHS) expect(TECH_DOMS, t.id).toContain(t.dom);
  });
});

describe('zasoby: fakty z tabel', () => {
  it('materiały w kosztach budowli są wypisane tak, jak w BUILDS', () => {
    const wedlug = (m: Mat): string =>
      (Object.keys(BUILDS) as BuildKind[])
        .filter((k) => (BUILDS[k].cost[m] ?? 0) > 0)
        .map((k) => `${buildName(k)} ${BUILDS[k].cost[m]}`)
        .join(', ');
    expect(FAKT(ART('zasob:deski'), 'budowle')).toBe(wedlug('deski'));
    expect(FAKT(ART('zasob:zlom'), 'budowle')).toBe(wedlug('zlom'));
    expect(FAKT(ART('zasob:czesci'), 'budowle')).toBe(wedlug('czesci'));
  });

  it('przepisy warsztatu: ile surowca na sztukę produktu', () => {
    expect(FAKT(ART('zasob:deski'), 'przepis')).toContain(`${RECIPES.deski.n} drewna → 1 deska`);
    expect(FAKT(ART('zasob:czesci'), 'przepis')).toContain(`${RECIPES.czesci.n} złomu → 1 część`);
    expect(FAKT(ART('zasob:drewno'), 'deski')).toContain(`${RECIPES.deski.n} drewna`);
  });

  it('drewno ze spalonych mebli jest z BURNABLE', () => {
    const v = FAKT(ART('zasob:drewno'), 'meble');
    for (const [k, n] of Object.entries(BURNABLE)) expect(v, k).toMatch(new RegExp(`[a-zęółąśżźćń]+ ${n}(,|$)`));
    expect((v.match(/\d+/g) ?? []).length).toBe(Object.keys(BURNABLE).length);
  });
});

describe('start: liczby z tabel', () => {
  it('start gry: jedzenie, ciepło kuchni, drewno na wieczór i drużyna', () => {
    const a = ART('start:zacznij');
    expect(FAKT(a, 'jedzenie')).toContain(String(FOOD_START));
    expect(FAKT(a, 'ciepla')).toContain(String(WARM_ENOUGH));
    expect(FAKT(a, 'drewno')).toContain(String(NIGHT_WOOD));
    const osoby = FAKT(a, 'osoby');
    for (const n of [OSOB_DOMYSLNIE, OSOB_MIN, OSOB_MAX]) expect(osoby).toContain(String(n));
  });

  it('pory dnia: początek pracy i wspólne posiłki', () => {
    const a = ART('start:czas');
    expect(FAKT(a, 'praca')).toBe(`${WORK_START}:00`);
    expect(FAKT(a, 'posilki')).toBe(MEAL_HOURS.map((h) => `${h}:00`).join(', '));
  });
});

describe('praca: tabele wpisane ręcznie', () => {
  /** osoba bez umiejętności poza jedną dziedziną */
  const osoba = (dom: string, poziom: number) =>
    ({ id: 'x', first: 'X', name: 'X', f: false, prof: '', skills: { [dom]: poziom }, age: 30, traits: [] }) as never;

  it('UMIEJETNOSCI zgadza się z tym, co czytają wpisy rodzajów pracy', () => {
    for (const r of RODZAJE.filter((x): x is Exclude<RodzajPracy, 'badania'> => x !== 'badania')) {
      for (const d of Object.keys(DOM)) {
        const czyta = WPISY[r].umiejetnosc({} as never, osoba(d, 4)) > 0;
        const wedlugTabeli = (UMIEJETNOSCI[r] as readonly string[]).includes(d);
        expect(czyta, `${r} / ${d}`).toBe(wedlugTabeli);
      }
    }
    expect(UMIEJETNOSCI.badania).toBe('badanie');
  });

  it('polecenia z menu: każdy napis jest w kodzie menu poleceń', () => {
    const katalogi = ['../../src/sim', '../../src/ui'];
    const zrodla = katalogi
      .flatMap((k) => readdirSync(new URL(`${k}/`, import.meta.url)).map((f) => new URL(`${k}/${f}`, import.meta.url)))
      // pomijamy moduły wiki po nazwie pliku, a nie po całej ścieżce: w katalogu o nazwie „wiki-…” (np. drzewo robocze wiki-2) odpadałyby wszystkie pliki
      .filter((u) => u.pathname.endsWith('.ts') && !(u.pathname.split('/').pop() ?? '').startsWith('wiki-'))
      .map((u) => readFileSync(u, 'utf8'))
      .join('\n');
    for (const wariant of ['blok', 'dom'] as const) {
      for (const p of POLECENIA(kontekst(wariant))) {
        // napis z kropkami „Badać: …” i „Spalić …” sprawdzamy po pierwszym słowie, szablony z bramą też
        const podstawaPl = p.pl
          .replace(/[:…].*$/, '')
          .trim()
          .split(' ')[0];
        const podstawaEn = p.en
          .replace(/[:…].*$/, '')
          .trim()
          .split(' ')[0];
        expect(zrodla, p.pl).toContain(podstawaPl);
        expect(zrodla, p.en).toContain(podstawaEn);
      }
    }
  });
});
