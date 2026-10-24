/* Silnik wiki (src/ui/wiki.ts): rejestr, leniwe budowanie i pamięć, wyszukiwarka bez ogonków, HTML listy i artykułu (z
   ucieczką), okno w kształcie `Sheet` i widok telefonu (`data-widok`). Treść artykułów sprawdzają wiki-tresc.test.ts
   i testy kategorii. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import {
  ARTYKUL_STARTOWY,
  artykul,
  artykulHtml,
  KATEGORIE,
  listaHtml,
  maArtykul,
  normalizuj,
  rejestr,
  szukaj,
  tytulArtykulu,
  wikiSheet,
} from '../../src/ui/wiki.ts';
import { kontekst } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

describe('rejestr', () => {
  it('identyfikatory są różne, a kategorie z listy', () => {
    const idy = rejestr().map((d) => d.id);
    expect(new Set(idy).size).toBe(idy.length);
    for (const d of rejestr()) expect(KATEGORIE).toContain(d.kat);
  });

  it('jest posortowany po kategoriach, w kategorii w kolejności autorów', () => {
    const nr = rejestr().map((d) => KATEGORIE.indexOf(d.kat));
    expect([...nr].sort((a, b) => a - b)).toEqual(nr);
  });

  it('artykuł startowy istnieje', () => {
    expect(maArtykul(ARTYKUL_STARTOWY)).toBe(true);
    expect(maArtykul('nie:ma')).toBe(false);
    expect(artykul('nie:ma', kontekst('blok'))).toBeNull();
    expect(tytulArtykulu('nie:ma', kontekst('blok'))).toBeNull();
  });
});

describe('artykul', () => {
  it('buduje się leniwie i trafia do pamięci po kontekście i języku', () => {
    const c = kontekst('blok');
    const a = artykul('zasob:drewno', c)!;
    expect(a.tytul).toBe('Drewno');
    expect(artykul('zasob:drewno', c)).toBe(a);
    ustawJezyk('en');
    const en = artykul('zasob:drewno', c)!;
    expect(en).not.toBe(a);
    expect(en.tytul).toBe('Wood');
    expect(artykul('zasob:drewno', c)).toBe(en);
    // inny kontekst to inny artykuł
    expect(artykul('zasob:drewno', kontekst('blok'))).not.toBe(en);
  });

  it('odnośnik do samego siebie wypada z „Zobacz też”', () => {
    for (const d of rejestr()) {
      const a = artykul(d.id, kontekst('blok'))!;
      expect(a.zobacz).not.toContain(d.id);
      expect(new Set(a.zobacz).size).toBe(a.zobacz.length);
    }
  });

  it('mysz i dotyk mówią o tym samym innymi słowami w krokach', () => {
    const mysz = artykul('zasob:drewno', kontekst('blok', false))!;
    const dotyk = artykul('zasob:drewno', kontekst('blok', true))!;
    expect(mysz.jak.join(' ')).toContain('prawy przycisk');
    expect(dotyk.jak.join(' ')).toContain('przytrzymanie palca');
    expect(dotyk.jak.join(' ')).not.toContain('prawy przycisk');
  });
});

describe('wyszukiwarka', () => {
  it('normalizuje ogonki i wielkość liter', () => {
    expect(normalizuj('Złom, ŁÓDŹ!')).toBe('zlom lodz');
  });

  it('znajduje po tytule i bez ogonków, tytuł wygrywa z treścią', () => {
    const c = kontekst('blok');
    const w = szukaj('zlom', c);
    expect(w[0].id).toBe('zasob:zlom');
    expect(szukaj('Złom', c)[0].id).toBe('zasob:zlom');
    expect(szukaj('drewno', c)[0].id).toBe('zasob:drewno');
  });

  it('wszystkie słowa muszą pasować, puste zapytanie nic nie daje', () => {
    const c = kontekst('blok');
    expect(szukaj('', c)).toEqual([]);
    expect(szukaj('   ', c)).toEqual([]);
    expect(szukaj('xyzzy plugh', c)).toEqual([]);
    const oba = szukaj('deski złom', c).map((x) => x.id);
    expect(oba).toContain('zasob:odzysk');
  });

  it('działa po angielsku', () => {
    ustawJezyk('en');
    const c = kontekst('blok');
    expect(szukaj('planks', c)[0].id).toBe('zasob:deski');
    expect(szukaj('scrap', c).map((x) => x.id)).toContain('zasob:zlom');
  });

  it('limit wyników', () => {
    expect(szukaj('a', kontekst('blok'), 5).length).toBeLessThanOrEqual(5);
  });
});

describe('HTML', () => {
  it('lista: grupy kategorii, otwarta ta z wybranym artykułem, bez wyboru pierwsza', () => {
    const c = kontekst('blok');
    const bez = listaHtml({ art: null, q: '' }, c);
    expect(bez).toContain('data-kat="start" open');
    expect(bez).not.toContain('data-kat="zasoby" open');
    const z = listaHtml({ art: 'zasob:drewno', q: '' }, c);
    expect(z).toContain('data-kat="zasoby" open');
    expect(z).not.toContain('data-kat="start" open');
    expect(z).toContain('aria-current="true"');
    expect(z).toContain('data-arg="zasob:drewno"');
  });

  it('lista: przy wyszukiwaniu płaskie wyniki z kategorią, a brak wyników mówi o tym', () => {
    const c = kontekst('blok');
    const w = listaHtml({ art: null, q: 'koza' }, c);
    expect(w).toContain('class="wiki-wyniki"');
    expect(w).not.toContain('<details');
    expect(w).toContain('wiki-poz-kat');
    expect(listaHtml({ art: null, q: 'xyzzy' }, c)).toContain('wiki-brak');
  });

  it('artykuł: tytuł, zdania, fakty, kroki i odnośniki z data-act', () => {
    const c = kontekst('blok');
    const h = artykulHtml('budowla:warsztat', c);
    expect(h).toContain('data-art="budowla:warsztat"');
    expect(h).toContain('<h3 class="wiki-tytul">Warsztat</h3>');
    expect(h).toContain('data-fakt="koszt"');
    expect(h).toContain('Jak to zrobić');
    expect(h).toContain('data-act="wiki-art"');
    expect(h).toContain('data-act="wiki-lista"');
  });

  it('artykuł nieznany daje startowy', () => {
    expect(artykulHtml('nie:ma', kontekst('blok'))).toContain(`data-art="${ARTYKUL_STARTOWY}"`);
    expect(artykulHtml(null, kontekst('blok'))).toContain(`data-art="${ARTYKUL_STARTOWY}"`);
  });

  it('tekst z ukośnikami i znakami HTML jest uciekany w polu wyszukiwania', () => {
    const c = kontekst('blok');
    const s = wikiSheet({ art: null, q: '"><script>x</script>', zMenu: true }, c);
    expect(s.body).not.toContain('<script>');
    expect(s.body).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('okno', () => {
  it('ton wiki, zamykane, tytuł Wiki; z Menu stopka mówi Wróć, z czipa Zamknij', () => {
    const c = kontekst('blok');
    const z = wikiSheet({ art: null, q: '', zMenu: true }, c);
    expect(z.tone).toBe('wiki');
    expect(z.closable).toBe(true);
    expect(z.title).toBe('Wiki');
    expect(z.foot).toContain('data-act="wiki-wroc"');
    expect(z.foot).toContain('>Wróć<');
    const o = wikiSheet({ art: 'zasob:drewno', q: '', zMenu: false }, c);
    expect(o.foot).toContain('>Zamknij<');
    ustawJezyk('en');
    expect(wikiSheet({ art: null, q: '', zMenu: true }, c).foot).toContain('>Back<');
    expect(wikiSheet({ art: null, q: '', zMenu: false }, c).foot).toContain('>Close<');
  });

  it('data-widok: lista bez wybranego artykułu, art z wybranym (telefon pokazuje jedno z dwóch)', () => {
    const c = kontekst('blok');
    expect(wikiSheet({ art: null, q: '', zMenu: true }, c).body).toContain('data-widok="lista"');
    expect(wikiSheet({ art: 'zasob:drewno', q: '', zMenu: true }, c).body).toContain('data-widok="art"');
  });

  it('po prawej zawsze jest artykuł, bez wyboru startowy', () => {
    const c = kontekst('blok');
    const b = wikiSheet({ art: null, q: '', zMenu: true }, c).body;
    expect(b).toContain(`data-art="${ARTYKUL_STARTOWY}"`);
    expect(b).toContain('id="wikiLista"');
    expect(b).toContain('id="wikiTresc"');
    expect(b).toContain('type="search"');
  });
});
