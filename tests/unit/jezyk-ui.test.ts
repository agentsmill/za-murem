/* Wybór języka w przeglądarce (src/ui/jezyk.ts): parametr adresu, pamięć, domyślny angielski, zapis wyboru,
   przełącznik i napisy statyczne z index.html w obu językach. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jezyk, ustawJezyk } from '../../src/core/jezyk.ts';
import {
  JEZYK_KEY,
  przelacznikHtml,
  STATYCZNE,
  startJezyka,
  wybierzJezyk,
  zapisanyJezyk,
  zmienJezyk,
} from '../../src/ui/jezyk.ts';
import { polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');

/** pamięć przeglądarki na niby */
function pamiec(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    m,
  };
}

describe('wybór języka', () => {
  it('parametr adresu, potem pamięć, potem angielski', () => {
    expect(wybierzJezyk(null, null)).toBe('en');
    expect(wybierzJezyk('pl', 'en')).toBe('pl');
    expect(wybierzJezyk('en', 'pl')).toBe('en');
    expect(wybierzJezyk('de', 'pl')).toBe('pl');
    expect(wybierzJezyk(null, 'xx')).toBe('en');
    expect(wybierzJezyk(null, 'pl')).toBe('pl');
  });

  it('start ustawia język i nie zapisuje parametru w pamięci', () => {
    const s = pamiec();
    expect(startJezyka({ params: new URLSearchParams('lang=pl'), store: s })).toBe('pl');
    expect(jezyk()).toBe('pl');
    expect(s.m.size).toBe(0);
    expect(startJezyka({ params: new URLSearchParams(''), store: pamiec({ [JEZYK_KEY]: 'pl' }) })).toBe('pl');
    expect(startJezyka({ params: new URLSearchParams(''), store: null })).toBe('en');
    expect(jezyk()).toBe('en');
  });

  it('zmiana przez gracza zapisuje wybór pod osobnym kluczem', () => {
    const s = pamiec();
    zmienJezyk('pl', s);
    expect(jezyk()).toBe('pl');
    expect(s.m.get(JEZYK_KEY)).toBe('pl');
    expect(zapisanyJezyk(s)).toBe('pl');
    zmienJezyk('en', s);
    expect(s.m.get(JEZYK_KEY)).toBe('en');
    expect(JEZYK_KEY).toBe('za-murem-0.4-jezyk');
    // pamięć, która rzuca (tryb prywatny), nie psuje zmiany
    const zla = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    zmienJezyk('pl', zla);
    expect(jezyk()).toBe('pl');
    expect(zapisanyJezyk(zla)).toBeNull();
  });

  it('przełącznik: dwa przyciski, wciśnięty bieżący język', () => {
    const h = przelacznikHtml('en');
    expect(h.match(/data-lang="(en|pl)"/g)).toEqual(['data-lang="en"', 'data-lang="pl"']);
    expect(h).toContain('data-lang="en" aria-pressed="true"');
    expect(h).toContain('data-lang="pl" aria-pressed="false"');
    expect(przelacznikHtml('pl')).toContain('data-lang="pl" aria-pressed="true"');
  });
});

describe('napisy statyczne z index.html', () => {
  it('każdy wpis ma oba języki, angielski bez polskich słów', () => {
    for (const s of STATYCZNE)
      for (const t of [s.tekst, s.title, s.aria, s.placeholder, s.html].filter(Boolean)) {
        expect(t!.pl, s.sel).toBeTruthy();
        expect(t!.en, s.sel).toBeTruthy();
        expect(polskieSlowa(t!.en, ['Wołoska', 'Warszawa']), `${s.sel}: ${t!.en}`).toEqual([]);
      }
  });

  it('index.html ma wersję angielską każdego wpisu (przed uruchomieniem skryptu)', () => {
    const attr = (v: string) => v.replace(/"/g, '&quot;');
    for (const s of STATYCZNE) {
      if (s.tekst) expect(html, s.sel).toContain(`>${s.tekst.en}<`);
      if (s.title) expect(html, s.sel).toContain(`title="${attr(s.title.en)}"`);
      if (s.aria) expect(html, s.sel).toContain(`aria-label="${attr(s.aria.en)}"`);
      if (s.placeholder) expect(html, s.sel).toContain(`placeholder="${attr(s.placeholder.en)}"`);
      if (s.html) expect(html, s.sel).toContain(s.html.en);
    }
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('id="langStart"');
  });

  it('w index.html nie ma polskich napisów poza komentarzami i przykładowym adresem', () => {
    const bez = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(polskieSlowa(bez, ['Wołoska', 'Warszawa'])).toEqual([]);
  });
});
