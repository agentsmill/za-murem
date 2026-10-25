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

  it('wersja 0.3 pod /v03/: pasek na mapie ma te same trzy źródła co 0.4 (współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles)', () => {
    const v03 = fs.readFileSync(path.join(ROOT, 'public', 'v03', 'index.html'), 'utf8');
    const pasek = v03.match(/<div class="attrib">(.*?)<\/div>/)?.[1] ?? '';
    for (const m of MAPY) expect(pasek).toContain(m);
    expect(pasek).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(pasek).toContain('href="https://openfreemap.org"');
    expect(pasek).toContain('href="https://www.openmaptiles.org/"');
    // napis jak w 0.4: znak ©, potem trzy źródła przedzielone kropką środkową
    expect(pasek.replace(/<[^>]+>/g, '')).toBe('© współtwórcy OpenStreetMap · OpenFreeMap · OpenMapTiles');
    // karta startowa 0.3 miała pełną atrybucję od początku
    expect(v03.match(/<p class="fine">(.*?)<\/p>/)?.[1]).toContain('OpenMapTiles');
  });

  it('minimapa: pod przyciskiem atrybucja trzech źródeł map w obu językach, schowana do włączenia przez grę', () => {
    const podpis = html.match(/<p class="minimapa-attrib">(.*?)<\/p>/)?.[1] ?? '';
    for (const m of MAPY_EN) expect(podpis).toContain(m);
    const pl = statyczny('.minimapa-attrib').pl;
    for (const m of MAPY) expect(pl).toContain(m);
    expect(statyczny('.minimapa-attrib').en).toBe(podpis);
    const blok = html.match(/<div class="minimapa" id="minimapa" hidden>[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(blok).toContain('class="minimapa-attrib"');
    // linki atrybucji nie siedzą w przycisku (przycisk w przycisku albo link w przycisku to zły HTML i zły dotyk)
    const przycisk = blok.match(/<button[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(przycisk).toContain('aria-label=');
    expect(przycisk).not.toContain('<a ');
    // zaraz za sceną: wszystkie inne nakładki gry (pasek, karta, podpowiedź, znacznik drzewa) leżą nad minimapą
    const kolejnosc = ['id="stage"', 'id="minimapa"', 'id="top"', 'id="card"', 'id="hint"'].map((x) => html.indexOf(x));
    expect(kolejnosc.every((k) => k > 0)).toBe(true);
    expect([...kolejnosc].sort((a, b) => a - b)).toEqual(kolejnosc);
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
