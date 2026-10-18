/* Atrybucja danych (CLAUDE.md, spec mieszkańców §11): na ekranie gry atrybucja map i obok link do źródeł danych
   mieszkańców, na karcie startowej to samo, a w Menu linia z LICENCJE.md (sekcja „Linia do ekranu »O grze«”), ta sama
   co w pliku. Wygląd i to, że wszystko mieści się na pierwszym ekranie, sprawdzają zrzuty start i mieszkancy-*. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { DANE_MIESZKANCOW, LICENCJE_MIESZKANCOW, menuSheet } from '../../src/ui/okna.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const licencje = fs.readFileSync(path.join(ROOT, 'public', LICENCJE_MIESZKANCOW), 'utf8');
const LINK = `<a href="${LICENCJE_MIESZKANCOW}" target="_blank" rel="noopener">mieszkańcy: GUS, PESEL, SGJP</a>`;
const LINK_EN = `<a href="${LICENCJE_MIESZKANCOW}" target="_blank" rel="noopener">residents: GUS, PESEL, SGJP</a>`;
const MAPY = ['współtwórcy OpenStreetMap', 'OpenFreeMap', 'OpenMapTiles'];
const MAPY_EN = ['OpenStreetMap contributors', 'OpenFreeMap', 'OpenMapTiles'];
/** napis statyczny z src/ui/jezyk.ts (index.html ma wersję angielską, polską wpisuje skrypt) */
const statyczny = (sel: string) => STATYCZNE.find((s) => s.sel === sel)!.html!;

describe('atrybucja danych', () => {
  it('ekran gry: atrybucja map i link do źródeł danych mieszkańców w jednym pasku, w obu językach', () => {
    const pasek = html.match(/<div class="attrib">(.*?)<\/div>/)?.[1] ?? '';
    for (const m of MAPY_EN) expect(pasek).toContain(m);
    expect(pasek).toContain(` · ${LINK_EN}`);
    const pl = statyczny('.attrib').pl;
    for (const m of MAPY) expect(pl).toContain(m);
    expect(pl).toContain(` · ${LINK}`);
    expect(statyczny('.attrib').en).toBe(pasek);
  });

  it('karta startowa: obok danych mapy link do źródeł danych mieszkańców', () => {
    const fine = html.match(/<p class="fine">(.*?)<\/p>/)?.[1] ?? '';
    for (const t of [fine, statyczny('.start-card > p.fine').pl]) {
      expect(t).toContain('OpenStreetMap');
      expect(t).toContain('OpenMapTiles');
      expect(t).toContain(`href="${LICENCJE_MIESZKANCOW}"`);
    }
    expect(statyczny('.start-card > p.fine').en).toBe(fine);
  });

  it('Menu: linia z LICENCJE.md słowo w słowo i link do pliku', () => {
    const linia = licencje.split('## Linia do ekranu „O grze”')[1]?.trim().split('\n')[0];
    expect(linia).toBe(DANE_MIESZKANCOW);
    const m = menuSheet('Zapis co godzinę gry.');
    expect(m.body).toContain(DANE_MIESZKANCOW);
    expect(m.body).toContain(`href="${LICENCJE_MIESZKANCOW}"`);
  });

  it('plik z licencjami leży tam, gdzie prowadzą linki (względnie, jak demo/ przy base: ./)', () => {
    expect(fs.existsSync(path.join(ROOT, 'public', LICENCJE_MIESZKANCOW))).toBe(true);
    expect(LICENCJE_MIESZKANCOW.startsWith('/')).toBe(false);
  });
});
