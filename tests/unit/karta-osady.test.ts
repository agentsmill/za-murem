/* Karta osady AI (src/ui/kartaOsady.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5): zwykła
   karta jak karta budynku, którą otwiera kliknięcie w siedzibę osady po odkryciu. Sprawdzane: tekst po polsku i angielsku (nazwa,
   kierunek od domu, „z ostatniego kontaktu (dzień N)”, ludność i budowle z kontaktu przez `num` z src/ui/tekst.ts), jeden przycisk
   (zamknięcie) i żadnych przycisków dyplomacji (to etap 3), ucieczka HTML, język bieżący (`ustawJezyk`) i to, że dane karty
   (`daneKartyOsady`) czytają z osady tylko to, co gracz wie z kontaktu: odkrycie, kontakt, nazwę i kierunek. Upadek osady i odwołanie
   jej zarządu to wiedza z żywej gry, więc karty nie zmieniają (rozstrzygnięcie kontrolera, runda poprawek 1): osada, która od
   kontaktu upadła albo odwołała zarząd, ma kartę taką samą jak przedtem. Ten sam przypadek na prawdziwej osadzie z gry sprawdza
   osada-gra.test.ts (`koniec gry osady`). */

import { afterEach, describe, expect, it } from 'vitest';
import { tx, ustawJezyk } from '../../src/core/jezyk.ts';
import { type DaneKartyOsady, daneKartyOsady, kartaOsadyHtml } from '../../src/ui/kartaOsady.ts';
import { num } from '../../src/ui/tekst.ts';
import { polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

/** dane karty jak po pierwszym kontakcie w dniu 4: osada na zachodzie, 4 osoby i jedna budowla */
function dane(extra: Partial<DaneKartyOsady> = {}): DaneKartyOsady {
  return {
    nazwa: tx('Osada na zachodzie', 'Settlement to the west'),
    kierunek: tx('na zachód', 'to the west'),
    kontakt: { dzien: 4, ludnosc: 4, budowle: 1 },
    ...extra,
  };
}

/** sam tekst karty: bez znaczników, encje HTML zamienione z powrotem (do porównań ze zdaniami) */
const tekst = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

describe('kartaOsadyHtml po polsku', () => {
  it('ma nazwę osady w nagłówku i kierunek od domu w pierwszym zdaniu', () => {
    const html = kartaOsadyHtml(dane());
    expect(html).toContain('<h2>Osada na zachodzie</h2>');
    expect(tekst(html)).toContain('Leży na zachód od was.');
  });

  it('mówi, że liczby są „z ostatniego kontaktu (dzień N)”, z dniem kontaktu', () => {
    const t = tekst(kartaOsadyHtml(dane({ kontakt: { dzien: 6, ludnosc: 4, budowle: 1 } })));
    expect(t.toLowerCase()).toContain('z ostatniego kontaktu (dzień 6)');
    expect(t.toLowerCase()).not.toContain('z ostatniego kontaktu (dzień 4)');
  });

  it('podaje ludność i budowle z kontaktu, liczbami z src/ui/tekst.ts', () => {
    for (const [ludnosc, budowle] of [
      [4, 1],
      [1, 0],
      [23, 6],
      [120, 12],
    ] as const) {
      const html = kartaOsadyHtml(dane({ kontakt: { dzien: 5, ludnosc, budowle } }));
      expect(html).toContain(`<b class="apt-c">${num(ludnosc, 0)}</b>`);
      expect(html).toContain(`<b class="apt-c">${num(budowle, 0)}</b>`);
      const t = tekst(html);
      expect(t).toContain(`Mieszkańcy ${num(ludnosc, 0)}`);
      expect(t).toContain(`Budowle ${num(budowle, 0)}`);
    }
  });

  it('ma jeden przycisk, zamknięcie karty, i żadnych przycisków dyplomacji (to etap 3)', () => {
    const html = kartaOsadyHtml(dane());
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('data-card="osada-zamknij"');
    expect(html).toContain('aria-label="Zamknij kartę"');
    // żadnych akcji okien ani przycisków dyplomacji
    expect(html).not.toContain('data-act');
    for (const slowo of ['Wysłać posła', 'Zaproponować', 'Zażądać', 'Handl', 'Zaatakować'])
      expect(html).not.toContain(slowo);
  });

  it('mówi, że to wszystko, co o nich wiecie (nie podgląd na żywo)', () => {
    expect(tekst(kartaOsadyHtml(dane()))).toContain('To wszystko, co o nich wiecie.');
  });

  it('ucieka znaki HTML w nazwie i w kierunku', () => {
    const html = kartaOsadyHtml(dane({ nazwa: tx('<b>Osada</b> & "x"', 'a'), kierunek: tx('na <i>zachód</i>', 'b') }));
    expect(html).not.toContain('<b>Osada</b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;b&gt;Osada&lt;/b&gt; &amp; &quot;x&quot;');
  });
});

describe('kartaOsadyHtml po angielsku', () => {
  it('ma te same części co polska, w bieżącym języku', () => {
    ustawJezyk('en');
    const html = kartaOsadyHtml(dane({ kontakt: { dzien: 5, ludnosc: 23, budowle: 6 } }));
    const t = tekst(html);
    expect(html).toContain('<h2>Settlement to the west</h2>');
    expect(t).toContain('It lies to the west of you.');
    expect(t.toLowerCase()).toContain('from the last contact (day 5)');
    expect(t).toContain('Population 23');
    expect(t).toContain('Buildings 6');
    expect(t).toContain('That is all you know about them.');
    expect(html).toContain('aria-label="Close the card"');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toContain('data-act');
  });

  it('nie ma polskich liter ani polskich słówek (nazwa własna po angielsku)', () => {
    ustawJezyk('en');
    expect(polskieSlowa(kartaOsadyHtml(dane()))).toEqual([]);
  });

  it('język czyta w chwili wywołania: ta sama dana, dwa języki', () => {
    const d = dane();
    const pl = kartaOsadyHtml(d);
    ustawJezyk('en');
    const en = kartaOsadyHtml(d);
    expect(pl).not.toBe(en);
    ustawJezyk('pl');
    expect(kartaOsadyHtml(d)).toBe(pl);
  });
});

describe('karta osady: tylko to, co gracz wie z kontaktu', () => {
  it('nie ma zdań o upadku ani o odwołaniu zarządu, po polsku i angielsku', () => {
    const t = tekst(kartaOsadyHtml(dane()));
    expect(t).not.toContain('upadła');
    expect(t).not.toContain('odwoły');
    ustawJezyk('en');
    const en = tekst(kartaOsadyHtml(dane()));
    expect(en).not.toContain('fell');
    expect(en).not.toContain('recalled');
  });

  it('dane karty to nazwa, kierunek i kontakt, nic więcej', () => {
    const d = daneKartyOsady(osadaZywa({ odkryta: true, kontakt: { dzien: 5, ludnosc: 8, budowle: 2 } }).osada)!;
    expect(Object.keys(d).sort()).toEqual(['kierunek', 'kontakt', 'nazwa']);
  });
});

/** Osada w kształcie, który czyta `daneKartyOsady`, razem z tym, co z niej odczytano. Pola żywej gry (upadek, licznik odwołań, stan,
    sama gra) są w obiekcie, ale każde sięgnięcie po pole poza odkryciem, kontaktem i światem (nazwa, kierunek) idzie do `odczytane`. */
function osadaZywa(p: {
  odkryta: boolean;
  kontakt?: { dzien: number; ludnosc: number; budowle: number };
  swiat?: boolean;
  upadla?: { dzien: number; powod: 'pustka' | 'exodus' } | null;
  odwolania?: number;
}) {
  const swiat =
    p.swiat === false
      ? null
      : { nazwa: tx('Osada na północy', 'Settlement to the north'), kierunek: tx('na północ', 'to the north') };
  const wartosci: Record<string, unknown> = {
    odkryta: p.odkryta,
    kontakt: p.kontakt,
    swiat,
    upadla: p.upadla ?? null,
    odwolania: p.odwolania ?? 0,
    stan: 'jest',
    gra: { sim: { st: { tick: 123456 } } },
  };
  const odczytane = new Set<string>();
  const osada = new Proxy(wartosci, {
    get(cel, klucz) {
      if (typeof klucz === 'string') odczytane.add(klucz);
      return cel[klucz as string];
    },
  }) as unknown as Parameters<typeof daneKartyOsady>[0];
  return { osada, odczytane };
}

describe('daneKartyOsady', () => {
  const kontakt = { dzien: 4, ludnosc: 4, budowle: 1 };

  it('bez odkrycia, bez kontaktu albo bez świata nie ma karty', () => {
    expect(daneKartyOsady(osadaZywa({ odkryta: false, kontakt }).osada)).toBeNull();
    expect(daneKartyOsady(osadaZywa({ odkryta: true }).osada)).toBeNull();
    expect(daneKartyOsady(osadaZywa({ odkryta: true, kontakt, swiat: false }).osada)).toBeNull();
  });

  it('bierze nazwę, kierunek i kontakt (kopię)', () => {
    const k = { dzien: 5, ludnosc: 8, budowle: 2 };
    const d = daneKartyOsady(osadaZywa({ odkryta: true, kontakt: k }).osada);
    expect(d).not.toBeNull();
    expect(d!.nazwa).toEqual(tx('Osada na północy', 'Settlement to the north'));
    expect(d!.kierunek).toEqual(tx('na północ', 'to the north'));
    expect(d!.kontakt).toEqual(k);
    expect(d!.kontakt).not.toBe(k);
  });

  it('czyta z osady tylko odkrycie, kontakt i świat (nazwę, kierunek): ani upadku, ani odwołań, ani jej gry', () => {
    for (const p of [
      { odkryta: true, kontakt },
      { odkryta: true, kontakt, upadla: { dzien: 31, powod: 'exodus' as const }, odwolania: 3 },
      { odkryta: false, kontakt },
      { odkryta: true },
      { odkryta: true, kontakt, swiat: false },
    ]) {
      const { osada, odczytane } = osadaZywa(p);
      daneKartyOsady(osada);
      for (const pole of odczytane) expect(['odkryta', 'kontakt', 'swiat']).toContain(pole);
    }
  });

  it('osada, która od kontaktu upadła albo odwołała zarząd, ma kartę taką samą jak przedtem (dane i HTML, po polsku i angielsku)', () => {
    const zdrowa = daneKartyOsady(osadaZywa({ odkryta: true, kontakt }).osada)!;
    for (const zywa of [
      { upadla: { dzien: 31, powod: 'exodus' as const } },
      { upadla: { dzien: 32, powod: 'pustka' as const } },
      { odwolania: 1 },
      { odwolania: 3, upadla: { dzien: 40, powod: 'exodus' as const } },
    ]) {
      const d = daneKartyOsady(osadaZywa({ odkryta: true, kontakt, ...zywa }).osada)!;
      expect(d).toEqual(zdrowa);
      for (const jezyk of ['pl', 'en'] as const) {
        ustawJezyk(jezyk);
        expect(kartaOsadyHtml(d)).toBe(kartaOsadyHtml(zdrowa));
        const t = tekst(kartaOsadyHtml(d));
        expect(t).not.toMatch(/upadła|odwoły|fell|recalled/);
        // liczby i dzień zostają z kontaktu
        expect(t.toLowerCase()).toContain(
          jezyk === 'pl' ? 'z ostatniego kontaktu (dzień 4)' : 'from the last contact (day 4)',
        );
      }
    }
  });
});
