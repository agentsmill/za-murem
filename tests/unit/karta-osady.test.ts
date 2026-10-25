/* Karta osady AI (src/ui/kartaOsady.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 5): zwykła
   karta jak karta budynku, którą otwiera kliknięcie w siedzibę osady po odkryciu. Sprawdzane: tekst po polsku i angielsku (nazwa,
   kierunek od domu, „z ostatniego kontaktu (dzień N)”, ludność i budowle z kontaktu przez `num` z src/ui/tekst.ts), jeden przycisk
   (zamknięcie) i żadnych przycisków dyplomacji (to etap 3), zdania o upadku i o odwołaniu zarządu bez liczby z gry osady, ucieczka
   HTML, język bieżący (`ustawJezyk`) i to, że dane karty (`daneKartyOsady`) czytają z osady tylko to, co gracz mógł zobaczyć:
   kontakt, nazwę, kierunek, upadek i to, czy zarząd był odwoływany (nigdy jej gry ani liczb z niej). */

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
    for (const extra of [
      {},
      { upadla: { dzien: 32, powod: 'pustka' as const } },
      { upadla: { dzien: 40, powod: 'exodus' as const } },
      { odwolana: true as const },
    ])
      expect(polskieSlowa(kartaOsadyHtml(dane(extra)))).toEqual([]);
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

describe('kartaOsadyHtml: upadek i odwołanie zarządu', () => {
  it('osada upadła: dzień i powód, po polsku i angielsku, liczby z kontaktu zostają z dniem kontaktu', () => {
    const pustka = dane({ upadla: { dzien: 32, powod: 'pustka' } });
    expect(tekst(kartaOsadyHtml(pustka))).toContain('Osada upadła w dniu 32: nikt tam nie przeżył.');
    const exodus = dane({ upadla: { dzien: 40, powod: 'exodus' } });
    expect(tekst(kartaOsadyHtml(exodus))).toContain('Osada upadła w dniu 40: ludzie przestali wierzyć i rozeszli się.');
    ustawJezyk('en');
    expect(tekst(kartaOsadyHtml(pustka))).toContain('The settlement fell on day 32: nobody there survived.');
    expect(tekst(kartaOsadyHtml(exodus))).toContain(
      'The settlement fell on day 40: the people lost faith and scattered.',
    );
    // liczby dalej z kontaktu, z jego dniem
    expect(tekst(kartaOsadyHtml(exodus)).toLowerCase()).toContain('from the last contact (day 4)');
  });

  it('zarząd był odwoływany: jedno zdanie bez liczby, ze słowem miejsca', () => {
    expect(tekst(kartaOsadyHtml(dane({ odwolana: true })))).toContain('Ich zarząd był już odwoływany.');
    expect(tekst(kartaOsadyHtml(dane({ odwolana: true, zarzad: tx('komitet', 'the committee') })))).toContain(
      'Ich komitet był już odwoływany.',
    );
    ustawJezyk('en');
    expect(tekst(kartaOsadyHtml(dane({ odwolana: true })))).toContain('The board there has already been recalled.');
    expect(tekst(kartaOsadyHtml(dane({ odwolana: true, zarzad: tx('komitet', 'the committee') })))).toContain(
      'The committee there has already been recalled.',
    );
  });

  it('bez upadku i bez odwołania nie ma tych zdań', () => {
    const t = tekst(kartaOsadyHtml(dane()));
    expect(t).not.toContain('upadła');
    expect(t).not.toContain('odwoły');
    ustawJezyk('en');
    const en = tekst(kartaOsadyHtml(dane()));
    expect(en).not.toContain('fell');
    expect(en).not.toContain('recalled');
  });
});

/** osada w kształcie, który czyta `daneKartyOsady`: bez jej gry (dostęp do czegokolwiek poza tymi polami rzuca) */
function osadaBezGry(p: {
  odkryta: boolean;
  kontakt?: { dzien: number; ludnosc: number; budowle: number };
  swiat?: boolean;
  upadla?: { dzien: number; powod: 'pustka' | 'exodus' } | null;
  odwolania?: number;
}) {
  const dozwolone = new Set(['odkryta', 'kontakt', 'swiat', 'upadla', 'odwolania']);
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
  };
  return new Proxy(wartosci, {
    get(cel, klucz) {
      if (typeof klucz === 'string' && !dozwolone.has(klucz)) throw new Error(`karta czyta z osady pole „${klucz}”`);
      return cel[klucz as string];
    },
  }) as unknown as Parameters<typeof daneKartyOsady>[0];
}

describe('daneKartyOsady', () => {
  it('bez odkrycia, bez kontaktu albo bez świata nie ma karty', () => {
    expect(daneKartyOsady(osadaBezGry({ odkryta: false, kontakt: { dzien: 4, ludnosc: 4, budowle: 1 } }))).toBeNull();
    expect(daneKartyOsady(osadaBezGry({ odkryta: true }))).toBeNull();
    expect(
      daneKartyOsady(osadaBezGry({ odkryta: true, kontakt: { dzien: 4, ludnosc: 4, budowle: 1 }, swiat: false })),
    ).toBeNull();
  });

  it('bierze nazwę, kierunek i kontakt (kopię) i czyta z osady tylko to, co gracz mógł zobaczyć', () => {
    const kontakt = { dzien: 5, ludnosc: 8, budowle: 2 };
    const d = daneKartyOsady(osadaBezGry({ odkryta: true, kontakt }));
    expect(d).not.toBeNull();
    expect(d!.nazwa).toEqual(tx('Osada na północy', 'Settlement to the north'));
    expect(d!.kierunek).toEqual(tx('na północ', 'to the north'));
    expect(d!.kontakt).toEqual(kontakt);
    expect(d!.kontakt).not.toBe(kontakt);
    expect(d!.upadla).toBeUndefined();
    expect(d!.odwolana).toBeUndefined();
  });

  it('upadek z jej gry to znana wieść (dzień i powód), odwołanie to „było”, bez licznika', () => {
    const kontakt = { dzien: 4, ludnosc: 4, budowle: 1 };
    const d = daneKartyOsady(
      osadaBezGry({ odkryta: true, kontakt, upadla: { dzien: 31, powod: 'exodus' }, odwolania: 3 }),
    )!;
    expect(d.upadla).toEqual({ dzien: 31, powod: 'exodus' });
    expect(d.odwolana).toBe(true);
    // żadnego licznika odwołań w danych ani w tekście
    expect(JSON.stringify(d)).not.toContain('"odwolania"');
    expect(tekst(kartaOsadyHtml(d))).not.toMatch(/\b3\b/);
    expect(daneKartyOsady(osadaBezGry({ odkryta: true, kontakt, odwolania: 1 }))!.odwolana).toBe(true);
    expect(daneKartyOsady(osadaBezGry({ odkryta: true, kontakt, odwolania: 0 }))!.odwolana).toBeUndefined();
  });

  it('słowo zarządu bierze od wołającego', () => {
    const kontakt = { dzien: 4, ludnosc: 4, budowle: 1 };
    const d = daneKartyOsady(osadaBezGry({ odkryta: true, kontakt, odwolania: 1 }), tx('komitet', 'the committee'))!;
    expect(tekst(kartaOsadyHtml(d))).toContain('Ich komitet był już odwoływany.');
  });
});
