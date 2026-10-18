/* Atrybucja danych (CLAUDE.md, spec mieszkańców §11): na ekranie gry atrybucja map i obok link do źródeł danych
   mieszkańców, na karcie startowej to samo, a w Menu linia z LICENCJE.md (sekcja „Linia do ekranu »O grze«”), ta sama
   co w pliku. Wygląd i to, że wszystko mieści się na pierwszym ekranie, sprawdzają zrzuty start i mieszkancy-*. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DANE_MIESZKANCOW, LICENCJE_MIESZKANCOW, menuSheet } from '../../src/ui/okna.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const licencje = fs.readFileSync(path.join(ROOT, 'public', LICENCJE_MIESZKANCOW), 'utf8');
const LINK = `<a href="${LICENCJE_MIESZKANCOW}" target="_blank" rel="noopener">mieszkańcy: GUS, PESEL, SGJP</a>`;
const MAPY = ['współtwórcy OpenStreetMap', 'OpenFreeMap', 'OpenMapTiles'];

describe('atrybucja danych', () => {
  it('ekran gry: atrybucja map i link do źródeł danych mieszkańców w jednym pasku', () => {
    const pasek = html.match(/<div class="attrib">(.*?)<\/div>/)?.[1] ?? '';
    for (const m of MAPY) expect(pasek).toContain(m);
    expect(pasek).toContain(` · ${LINK}`);
  });

  it('karta startowa: obok danych mapy link do źródeł danych mieszkańców', () => {
    const fine = html.match(/<p class="fine">(.*?)<\/p>/)?.[1] ?? '';
    expect(fine).toContain('OpenStreetMap');
    expect(fine).toContain('OpenMapTiles');
    expect(fine).toContain(`href="${LICENCJE_MIESZKANCOW}"`);
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
