/* Okienko celów ścieżki i linia celu w oknach (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, „Interfejs
   okienka celów”): czyste funkcje HTML sprawdzone w Node bez DOM, na widokach zrobionych ręcznie i na prawdziwym widoku
   R1 z gry na demie.

   `celeHtml(widok, { otwarte, touch })`: blok okazji stoi przed nagłówkiem rozdziału i ma „Teraz:”, cel czekający ma klasę
   i dopisek, przepadły jest skreślony i policzony, podpowiedź jest tylko pod bieżącym celem; zwinięte okienko pokazuje
   bieżący cel okazji, a bez okazji bieżący cel rozdziału; widok dróg po ostatnim rozdziale to wiersze „{nazwa}: {dalej}”
   z postępem; teksty i atrybuty idą przez ucieczkę HTML; po angielsku bez polskich liter, bez myślników.
   `celWOknie(widok, okno)`: tekst celu, który dotyczy okna (karta nocy, uchwała, tablica badań, spotkanie), także wtedy,
   gdy bieżący cel jest inny (karta nocy z za małym zapasem drewna pokazuje dyżur przy kozie); cel zrobiony, przepadły
   albo czekający go nie daje. Linia „Cel: …” w oknie (`Sheet.cel` w `sheetHtml`) i w nagłówku tablicy badań. Do tego
   pilnowanie, że każda klasa z tego HTML ma regułę w src/style.css (wygląd ocenia się w Chromium, `npm run shots`), a
   zwijanie okienka jest w HTML, nie w CSS. Na prawdziwej symulacji: widok R1 na trzech demach w obu trybach i karta
   nocy z za małym zapasem drewna, która pokazuje dyżur przy kozie. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import { createSim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { tablicaHtml } from '../../src/ui/badania.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { nightOdds, nightSheet } from '../../src/ui/okna.ts';
import { sheetHtml } from '../../src/ui/okno.ts';
import {
  type Cel,
  celeHtml,
  celWOknie,
  type KluczRozdzialu,
  type OknoCelu,
  potrzebaDrewna,
  type WidokSciezki,
} from '../../src/ui/sciezka.ts';
import { esc, liniaCelu } from '../../src/ui/tekst.ts';
import { FORBIDDEN_DOM, demoWorld as swiat } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';
import {
  bezAutomatu,
  DEMA,
  doKartyZDrewnem,
  odpowiedz,
  poPierwszymRaporcie,
  TRYBY,
  wDomu,
  wejscie,
  widok,
} from './sciezka-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

/* ---------- widoki zrobione ręcznie ---------- */

const c = (key: string, text: string, o: Partial<Cel> = {}): Cel => ({
  key,
  text,
  how: `Jak: ${text}`,
  done: false,
  ...o,
});
const zrobiony = (key: string, text: string): Cel => c(key, text, { done: true });
const przepadly = (key: string, text: string): Cel => c(key, text, { done: true, missed: true });
const czeka = (key: string, text: string, dopisek = 'czeka do 20:00'): Cel => c(key, text, { czeka: dopisek });

/** lista celów z bieżącym: pierwszym niezrobionym, który nie czeka (jak w widoku silnika) */
const lista = (cele: Cel[]) => ({ cele, biezacy: cele.find((x) => !x.done && !x.czeka) ?? null });
const rozdzial = (tytul: string, cele: Cel[], k: KluczRozdzialu = 'r1'): NonNullable<WidokSciezki['rozdzial']> => ({
  k,
  tytul,
  ...lista(cele),
});
const okazja = (tytul: string, cele: Cel[]): NonNullable<WidokSciezki['okazja']> => ({ tytul, ...lista(cele) });
const widokZ = (p: Partial<WidokSciezki>): WidokSciezki => ({ okazja: null, rozdzial: null, drogi: null, ...p });

const OTWARTE = { otwarte: true, touch: false };
const ZWINIETE = { otwarte: false, touch: false };

/** wszystkie pięć stanów celu w jednym rozdziale: zrobiony, przepadły, bieżący, zwykły, czekający */
const R1_RECZNIE = rozdzial('Drugi dzień', [
  zrobiony('przeszukaj', 'Przeszukajcie dom.'),
  przepadly('drewno', 'Zbierzcie drewno.'),
  c('budowla', 'Postawcie pierwszą budowlę.'),
  c('obwod', 'Wzmocnijcie obwód.'),
  czeka('dyzur', 'Dajcie komuś dyżur przy kozie.'),
]);
const HANDLARZ = okazja('Teraz: handlarz pod furtką', [
  c('wymiana', 'Wymieńcie coś z handlarzem.'),
  c('zagadaj', 'Zagadajcie handlarza.'),
]);

/** pozycje listy z HTML: klasy (bez „goal”), klucz, numer i zawartość */
interface Poz {
  klasy: string[];
  key: string | null;
  n: number;
  html: string;
}
const pozycje = (html: string): Poz[] =>
  [...html.matchAll(/<li class="goal([^"]*)"([^>]*)>(.*?)<\/li>/gs)].map((m) => ({
    klasy: m[1].split(/\s+/).filter(Boolean),
    key: m[2].match(/data-key="([^"]*)"/)?.[1] ?? null,
    n: Number(m[2].match(/data-n="(\d+)"/)?.[1]),
    html: m[3],
  }));
const poz = (html: string, key: string): Poz => {
  const p = pozycje(html).find((x) => x.key === key);
  if (!p) throw new Error(`nie ma pozycji ${key} w ${html}`);
  return p;
};
/** tekst bez znaczników i bez encji ucieczki (do porównań i do szukania polskich liter) */
const tekst = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const ile = (html: string, wzor: RegExp): number => (html.match(wzor) ?? []).length;
/** wartość atrybutu title przycisku nagłówka (pierwszego) */
const tytulNaglowka = (html: string): string => html.match(/<button[^>]*title="([^"]*)"/)?.[1] ?? '';

describe('celeHtml: rozdział', () => {
  it('nagłówek z tytułem i licznikiem, w którym zrobione i przepadłe liczą się razem', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE);
    expect(html).toContain('<span>Drugi dzień</span><b class="goals-n">2/5</b>');
    expect(html.startsWith('<button type="button" class="goals-head"')).toBe(true);
    expect(ile(html, /class="goals-head"/g)).toBe(1);
  });

  it('lista: zrobiony, przepadły, bieżący, zwykły i czekający mają swoje klasy, numery i klucze', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE);
    expect(pozycje(html).map((p) => [p.n, p.key, p.klasy])).toEqual([
      [1, 'przeszukaj', ['done']],
      [2, 'drewno', ['missed']],
      [3, 'budowla', ['now']],
      [4, 'obwod', []],
      [5, 'dyzur', ['czeka']],
    ]);
    expect(tekst(poz(html, 'przeszukaj').html)).toContain('Przeszukajcie dom.');
  });

  it('podpowiedź jest tylko pod bieżącym celem, a dopisek „czeka do 20:00” tylko pod czekającym', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE);
    expect(ile(html, /class="goal-how"/g)).toBe(1);
    expect(poz(html, 'budowla').html).toContain('<small class="goal-how">Jak: Postawcie pierwszą budowlę.</small>');
    expect(ile(html, /class="goal-czeka"/g)).toBe(1);
    expect(poz(html, 'dyzur').html).toContain('<small class="goal-czeka">czeka do 20:00</small>');
    // czekający cel nie ma podpowiedzi, zrobiony i przepadły ani podpowiedzi, ani dopisku
    expect(poz(html, 'dyzur').html).not.toContain('goal-how');
    expect(poz(html, 'przeszukaj').html).not.toContain('<small');
    expect(poz(html, 'drewno').html).not.toContain('<small');
  });

  it('dopisek czekania znika, gdy cel jest już zrobiony albo przepadł', () => {
    const r = rozdzial('Drugi dzień', [c('a', 'A'), c('b', 'B', { czeka: 'czeka do rana', done: true })]);
    expect(celeHtml(widokZ({ rozdzial: r }), OTWARTE)).not.toContain('goal-czeka');
  });

  it('bez okazji nie ma bloku okazji', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE);
    expect(html).not.toContain('goals-okazja');
  });

  it('nic do pokazania (po ostatnim rozdziale bez dróg): pusty napis, okienko się chowa', () => {
    expect(celeHtml(widokZ({}), OTWARTE)).toBe('');
    expect(celeHtml(widokZ({ drogi: [] }), ZWINIETE)).toBe('');
  });
});

describe('celeHtml: okazja', () => {
  const rozwiniete = () => celeHtml(widokZ({ okazja: HANDLARZ, rozdzial: R1_RECZNIE }), OTWARTE);

  it('blok okazji stoi przed nagłówkiem rozdziału i ma „Teraz:”', () => {
    const html = rozwiniete();
    const blok = html.indexOf('<div class="goals-okazja">');
    const naglowekRozdzialu = html.indexOf('<span>Drugi dzień</span>');
    expect(blok).toBe(0);
    expect(naglowekRozdzialu).toBeGreaterThan(blok);
    expect(html.indexOf('Teraz: handlarz pod furtką')).toBeGreaterThan(blok);
    expect(html.indexOf('Teraz: handlarz pod furtką')).toBeLessThan(naglowekRozdzialu);
    expect(tekst(html).startsWith(' Teraz: handlarz pod furtką')).toBe(true);
  });

  it('okazja ma swoje cele z podpowiedzią bieżącego, a rozdział pod spodem jak zawsze', () => {
    const html = rozwiniete();
    const blok = html.slice(0, html.indexOf('</div>'));
    expect(pozycje(blok).map((p) => [p.key, p.klasy])).toEqual([
      ['wymiana', ['now']],
      ['zagadaj', []],
    ]);
    expect(blok).toContain('<small class="goal-how">Jak: Wymieńcie coś z handlarzem.</small>');
    const reszta = html.slice(html.indexOf('</div>'));
    expect(pozycje(reszta).map((p) => p.key)).toEqual(['przeszukaj', 'drewno', 'budowla', 'obwod', 'dyzur']);
    // podpowiedzi są dwie: bieżącego celu okazji i bieżącego celu rozdziału
    expect(ile(html, /class="goal-how"/g)).toBe(2);
    expect(reszta).toContain('<span>Drugi dzień</span><b class="goals-n">2/5</b>');
  });

  it('okazja bez rozdziału (po ostatnim rozdziale) też się pokazuje', () => {
    const sama = celeHtml(widokZ({ okazja: HANDLARZ }), OTWARTE);
    expect(sama).toContain('Teraz: handlarz pod furtką');
    expect(sama).not.toContain('goals-n');
  });

  it('po angielsku: „Now:” z widoku i napisy okienka bez polskich liter', () => {
    ustawJezyk('en');
    const en = celeHtml(
      widokZ({
        okazja: okazja('Now: the trader at the gate', [
          c('wymiana', 'Trade with the trader.', { how: 'Right-click him.' }),
        ]),
        rozdzial: rozdzial('Day two', [c('a', 'Search the house.', { how: 'Select someone first.' })]),
      }),
      OTWARTE,
    );
    expect(en).toContain('Now: the trader at the gate');
    expect(polskieSlowa(tekst(en))).toEqual([]);
    expect(polskieSlowa(tytulNaglowka(en))).toEqual([]);
  });
});

describe('celeHtml: zwinięte okienko', () => {
  it('bez okazji: nagłówek z licznikiem i tylko bieżący cel rozdziału z podpowiedzią', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), ZWINIETE);
    expect(html).toContain('<span>Drugi dzień</span><b class="goals-n">2/5</b>');
    expect(pozycje(html).map((p) => [p.n, p.key, p.klasy])).toEqual([[3, 'budowla', ['now']]]);
    expect(html).toContain('<small class="goal-how">Jak: Postawcie pierwszą budowlę.</small>');
    for (const inne of ['Przeszukajcie dom.', 'Zbierzcie drewno.', 'Wzmocnijcie obwód.', 'Dajcie komuś dyżur'])
      expect(html).not.toContain(inne);
  });

  it('z okazją: bieżący cel okazji zamiast rozdziału', () => {
    const html = celeHtml(widokZ({ okazja: HANDLARZ, rozdzial: R1_RECZNIE }), { otwarte: false, touch: true });
    expect(html).toContain('Teraz: handlarz pod furtką');
    expect(pozycje(html).map((p) => [p.key, p.klasy])).toEqual([['wymiana', ['now']]]);
    expect(html).toContain('<small class="goal-how">Jak: Wymieńcie coś z handlarzem.</small>');
    // rozdział, jego licznik i jego bieżący cel są schowane
    expect(html).not.toContain('Drugi dzień');
    expect(html).not.toContain('goals-n');
    expect(html).not.toContain('Postawcie pierwszą budowlę.');
    expect(html).not.toContain('Zagadajcie handlarza.');
  });

  it('okazja bez bieżącego celu (wszystkie jej cele zrobione): pokazuje bieżący cel rozdziału', () => {
    const skonczona = okazja('Teraz: handlarz pod furtką', [zrobiony('wymiana', 'Wymieńcie coś z handlarzem.')]);
    const html = celeHtml(widokZ({ okazja: skonczona, rozdzial: R1_RECZNIE }), ZWINIETE);
    expect(pozycje(html).map((p) => p.key)).toEqual(['budowla']);
    expect(html).toContain('Drugi dzień');
  });

  it('bez bieżącego celu (reszta czeka): pierwszy czekający z dopiskiem, żeby było widać, na co się czeka', () => {
    const r = rozdzial('Drugi dzień', [zrobiony('a', 'A.'), czeka('dyzur', 'Dajcie komuś dyżur przy kozie.')]);
    const html = celeHtml(widokZ({ rozdzial: r }), ZWINIETE);
    expect(pozycje(html).map((p) => [p.key, p.klasy])).toEqual([['dyzur', ['czeka']]]);
    expect(html).toContain('<small class="goal-czeka">czeka do 20:00</small>');
    expect(html).not.toContain('goal-how');
  });

  it('zwinięte i rozwinięte różnią się tylko listą: nagłówek i licznik są takie same', () => {
    const naglowek = (h: string) => h.slice(0, h.indexOf('</button>'));
    const otwarte = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE);
    const zwiniete = celeHtml(widokZ({ rozdzial: R1_RECZNIE }), ZWINIETE);
    expect(naglowek(zwiniete).replace('aria-expanded="false"', '')).toContain('Drugi dzień');
    expect(pozycje(zwiniete).length).toBeLessThan(pozycje(otwarte).length);
  });
});

describe('celeHtml: nagłówek jako przycisk zwijania', () => {
  it('aria-expanded mówi, czy okienko jest rozwinięte', () => {
    expect(celeHtml(widokZ({ rozdzial: R1_RECZNIE }), OTWARTE)).toContain('aria-expanded="true"');
    expect(celeHtml(widokZ({ rozdzial: R1_RECZNIE }), ZWINIETE)).toContain('aria-expanded="false"');
    const z = celeHtml(widokZ({ okazja: HANDLARZ, rozdzial: R1_RECZNIE }), ZWINIETE);
    expect(ile(z, /aria-expanded="false"/g)).toBe(1);
    const o = celeHtml(widokZ({ okazja: HANDLARZ, rozdzial: R1_RECZNIE }), OTWARTE);
    expect(ile(o, /aria-expanded="true"/g)).toBe(2);
  });

  it('podpowiedź przycisku: myszą „Kliknij”, dotykiem „Stuknij”, zwiń albo rozwiń zależnie od stanu', () => {
    const v = widokZ({ rozdzial: R1_RECZNIE });
    expect(tytulNaglowka(celeHtml(v, { otwarte: true, touch: false }))).toBe('Kliknij, żeby zwinąć listę');
    expect(tytulNaglowka(celeHtml(v, { otwarte: false, touch: false }))).toBe('Kliknij, żeby rozwinąć listę');
    expect(tytulNaglowka(celeHtml(v, { otwarte: true, touch: true }))).toBe('Stuknij, żeby zwinąć listę');
    expect(tytulNaglowka(celeHtml(v, { otwarte: false, touch: true }))).toBe('Stuknij, żeby rozwinąć listę');
    ustawJezyk('en');
    expect(tytulNaglowka(celeHtml(v, { otwarte: true, touch: false }))).toBe('Click to collapse the list');
    expect(tytulNaglowka(celeHtml(v, { otwarte: false, touch: false }))).toBe('Click to expand the list');
    expect(tytulNaglowka(celeHtml(v, { otwarte: true, touch: true }))).toBe('Tap to collapse the list');
    expect(tytulNaglowka(celeHtml(v, { otwarte: false, touch: true }))).toBe('Tap to expand the list');
  });
});

describe('celeHtml: drogi do zwycięstwa po ostatnim rozdziale', () => {
  const DROGI = [
    { nazwa: 'Nowe osiedle', dalej: 'Zbierzcie 25 osób pod zarządem.', postep: '12 z 25' },
    { nazwa: 'Wspólny teren', dalej: 'Otoczcie wspólnym płotem pierwszy sąsiedni budynek.', postep: '0 z 1' },
    { nazwa: 'Technologia', dalej: 'Zbadajcie coś jeszcze.', postep: null },
  ];

  it('nagłówek „Drogi do zwycięstwa” i wiersze „{nazwa}: {dalej}” z postępem, pierwszy jest bieżący', () => {
    const html = celeHtml(widokZ({ drogi: DROGI }), OTWARTE);
    expect(html).toContain('<span>Drogi do zwycięstwa</span>');
    expect(html).not.toContain('goals-n');
    const p = pozycje(html);
    expect(p.map((x) => [x.n, x.klasy])).toEqual([
      [1, ['now']],
      [2, []],
      [3, []],
    ]);
    expect(tekst(p[0].html)).toContain('Nowe osiedle: Zbierzcie 25 osób pod zarządem.');
    expect(p[0].html).toContain('<small class="goal-postep">12 z 25</small>');
    expect(tekst(p[1].html)).toContain('Wspólny teren: Otoczcie wspólnym płotem pierwszy sąsiedni budynek.');
    expect(p[1].html).toContain('<small class="goal-postep">0 z 1</small>');
    // droga bez liczby postępu nie ma dopisku
    expect(tekst(p[2].html)).toContain('Technologia: Zbadajcie coś jeszcze.');
    expect(p[2].html).not.toContain('goal-postep');
  });

  it('zwinięte: nagłówek i pierwszy wiersz', () => {
    const html = celeHtml(widokZ({ drogi: DROGI }), ZWINIETE);
    expect(html).toContain('<span>Drogi do zwycięstwa</span>');
    expect(pozycje(html).map((p) => p.n)).toEqual([1]);
    expect(html).toContain('Nowe osiedle: Zbierzcie 25 osób pod zarządem.');
    expect(html).not.toContain('Wspólny teren');
  });

  it('po angielsku: „Roads to victory”', () => {
    ustawJezyk('en');
    const html = celeHtml(
      widokZ({ drogi: [{ nazwa: 'New estate', dalej: 'Get 25 people under the board.', postep: '12 of 25' }] }),
      OTWARTE,
    );
    expect(html).toContain('<span>Roads to victory</span>');
    expect(polskieSlowa(tekst(html))).toEqual([]);
  });

  it('rozdział ma pierwszeństwo: z rozdziałem widok dróg się nie pokazuje', () => {
    const html = celeHtml(widokZ({ rozdzial: R1_RECZNIE, drogi: DROGI }), OTWARTE);
    expect(html).not.toContain('Drogi do zwycięstwa');
    expect(html).toContain('Drugi dzień');
  });
});

describe('celeHtml: ucieczka HTML', () => {
  const GROZNY = '<img src=x onerror="alert(1)"> & „cudzysłów” "dwa"';

  it('teksty, podpowiedzi, dopiski, tytuły i klucze nie wpuszczają znaczników', () => {
    const r = rozdzial(`Tytuł ${GROZNY}`, [
      c('a"><script>', `Tekst ${GROZNY}`, { how: `Jak ${GROZNY}` }),
      czeka('b', 'B', `dopisek ${GROZNY}`),
    ]);
    const o = okazja(`Teraz: ${GROZNY}`, [c('o', `Okazja ${GROZNY}`, { how: `Okazja jak ${GROZNY}` })]);
    for (const otw of [true, false]) {
      const html = celeHtml(widokZ({ okazja: o, rozdzial: r }), { otwarte: otw, touch: false });
      expect(html).not.toMatch(/<img|<script|onerror="/);
      expect(html).toContain(esc(`Okazja ${GROZNY}`));
      if (otw) {
        expect(html).toContain(esc(`Tekst ${GROZNY}`));
        expect(html).toContain(esc(`Jak ${GROZNY}`));
        expect(html).toContain(esc(`dopisek ${GROZNY}`));
        expect(html).toContain(esc(`Tytuł ${GROZNY}`));
        expect(html).toContain('data-key="a&quot;&gt;&lt;script&gt;"');
      }
    }
  });

  it('wiersze dróg też są uciekane', () => {
    const html = celeHtml(widokZ({ drogi: [{ nazwa: '<b>x</b>', dalej: 'a & b', postep: '<i>1</i>' }] }), OTWARTE);
    expect(html).not.toMatch(/<b>x|<i>/);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;: a &amp; b');
    expect(html).toContain('&lt;i&gt;1&lt;/i&gt;');
  });
});

describe('celeHtml: napisy okienka bez myślników', () => {
  it('podpowiedź nagłówka i tytuł dróg w obu językach', () => {
    for (const jezyk of ['pl', 'en'] as const) {
      ustawJezyk(jezyk);
      const html = celeHtml(widokZ({ drogi: [{ nazwa: 'A', dalej: 'B', postep: null }] }), OTWARTE);
      expect(tytulNaglowka(html)).not.toMatch(/[—–]/);
      expect(tekst(html)).not.toMatch(/[—–]/);
    }
  });
});

/* ---------- celWOknie ---------- */

describe('celWOknie', () => {
  const OKNA: OknoCelu[] = ['karta', 'uchwala', 'tablica', 'spotkanie'];

  it('bieżący cel z pasującym oknem daje swój tekst', () => {
    for (const okno of OKNA) {
      const v = widokZ({
        rozdzial: rozdzial('R', [zrobiony('a', 'A.'), c('b', `Cel dla okna ${okno}.`, { okno }), c('c', 'C.')]),
      });
      expect(celWOknie(v, okno), okno).toBe(`Cel dla okna ${okno}.`);
      // inne okna go nie dostają
      for (const inne of OKNA.filter((o) => o !== okno)) expect(celWOknie(v, inne), `${okno} w ${inne}`).toBeNull();
    }
  });

  it('bieżący cel bez okna (drewno na noc): okno dostaje pierwszy niezrobiony cel tego okna', () => {
    const v = widokZ({
      rozdzial: rozdzial('Drugi dzień', [
        zrobiony('a', 'A.'),
        c('drewno2', 'Zbierzcie drewno na całą noc.'),
        c('dyzur', 'Dajcie komuś dyżur przy kozie.', { okno: 'karta' }),
      ]),
    });
    expect(v.rozdzial?.biezacy?.key).toBe('drewno2');
    expect(celWOknie(v, 'karta')).toBe('Dajcie komuś dyżur przy kozie.');
    expect(celWOknie(v, 'tablica')).toBeNull();
  });

  it('bieżący cel z innym oknem nie zasłania celu tego okna', () => {
    const v = widokZ({
      rozdzial: rozdzial('R', [
        c('badanie', 'Wybierzcie badanie.', { okno: 'tablica' }),
        c('dyzur', 'Dajcie komuś dyżur przy kozie.', { okno: 'karta' }),
      ]),
    });
    expect(celWOknie(v, 'tablica')).toBe('Wybierzcie badanie.');
    expect(celWOknie(v, 'karta')).toBe('Dajcie komuś dyżur przy kozie.');
  });

  it('cel zrobiony, przepadły albo czekający nie daje linii', () => {
    const v = widokZ({
      rozdzial: rozdzial('R', [
        c('a', 'Zrobiony.', { okno: 'karta', done: true }),
        c('b', 'Przepadły.', { okno: 'karta', done: true, missed: true }),
        c('c', 'Czekający.', { okno: 'karta', czeka: 'czeka do 20:00' }),
        c('d', 'Inny.'),
      ]),
    });
    expect(celWOknie(v, 'karta')).toBeNull();
  });

  it('okazja ma pierwszeństwo przed rozdziałem, a bez jej celu okna zostaje cel rozdziału', () => {
    const rozdz = rozdzial('R', [c('dyzur', 'Dyżur.', { okno: 'karta' })]);
    const z = widokZ({ okazja: okazja('Teraz: x', [c('o', 'Cel okazji.', { okno: 'karta' })]), rozdzial: rozdz });
    expect(celWOknie(z, 'karta')).toBe('Cel okazji.');
    const bez = widokZ({ okazja: okazja('Teraz: x', [c('o', 'Cel okazji.')]), rozdzial: rozdz });
    expect(celWOknie(bez, 'karta')).toBe('Dyżur.');
  });

  it('brak widoku, brak rozdziału i brak pasującego celu: null', () => {
    expect(celWOknie(widokZ({}), 'karta')).toBeNull();
    expect(celWOknie(widokZ({ drogi: [{ nazwa: 'A', dalej: 'B', postep: null }] }), 'tablica')).toBeNull();
    expect(celWOknie(widokZ({ rozdzial: R1_RECZNIE }), 'uchwala')).toBeNull();
  });
});

/* ---------- linia celu w oknie i w nagłówku tablicy ---------- */

describe('Sheet.cel: linia „Cel: …” pod nagłówkiem okna', () => {
  const sheet = {
    kicker: 'Noc',
    title: 'Karta nocy',
    body: '<p>treść</p>',
    foot: '<button>OK</button>',
    tone: 'noc',
  } as const;

  it('stoi pod tytułem i przed treścią, a bez celu okno wygląda jak dotąd', () => {
    const z = sheetHtml({ ...sheet, cel: 'Dajcie komuś dyżur przy kozie.' });
    const koniecNaglowka = z.indexOf('</header>');
    const linia = z.indexOf('<p class="sheet-cel"><b>Cel:</b> Dajcie komuś dyżur przy kozie.</p>');
    expect(koniecNaglowka).toBeGreaterThan(0);
    expect(linia).toBe(koniecNaglowka + '</header>'.length);
    expect(z.indexOf('<div class="sheet-body">')).toBeGreaterThan(linia);
    const bez = sheetHtml(sheet);
    expect(bez).not.toContain('sheet-cel');
    expect(bez).toBe(z.replace(/<p class="sheet-cel">.*?<\/p>/, ''));
    expect(bez).toContain('<h2 class="sheet-title" id="sheetTitle">Karta nocy</h2>');
    expect(bez).toContain('<footer class="sheet-foot"><button>OK</button></footer>');
  });

  it('po angielsku „Goal:”, tekst jest uciekany, pusty cel to brak linii', () => {
    ustawJezyk('en');
    const z = sheetHtml({ ...sheet, cel: 'Put <someone> on stove watch & "rest".' });
    expect(z).toContain(
      '<p class="sheet-cel"><b>Goal:</b> Put &lt;someone&gt; on stove watch &amp; &quot;rest&quot;.</p>',
    );
    expect(sheetHtml({ ...sheet, cel: '' })).not.toContain('sheet-cel');
  });
});

describe('tablica badań: linia celu w nagłówku', () => {
  const { w, seed } = swiat('przymorze');
  /** odczyt tablicy z postawioną pracownią */
  function odczytTablicy() {
    const st = createSim(w, seed, { core: 4 });
    const i = allowedAnchors(st, w, 'pracownia', 0)[0];
    st.things.push({
      id: st.nextThing++,
      kind: 'pracownia',
      x: i % w.size,
      y: Math.floor(i / w.size),
      w: 2,
      h: 1,
      rot: 0,
      n: 0,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    const b = snapshot(st, w).tablica;
    if (!b) throw new Error('brak odczytu badań');
    return b;
  }

  it('obok „Gra stoi”, w tytule nagłówka; bez celu nagłówek jak dotąd', () => {
    const b = odczytTablicy();
    const z = tablicaHtml(b, { wybrana: null, mode: 'zwykly', cel: 'Wybierzcie pierwsze badanie.' });
    const tytul = z.match(/<div class="tb-tytul">.*?<\/div>/s)?.[0] ?? '';
    expect(tytul).toContain('<small class="tb-pauza">Gra stoi</small>');
    expect(tytul).toContain('<small class="tb-linia-celu"><b>Cel:</b> Wybierzcie pierwsze badanie.</small>');
    expect(tytul.indexOf('tb-pauza')).toBeLessThan(tytul.indexOf('tb-linia-celu'));
    const bez = tablicaHtml(b, { wybrana: null, mode: 'zwykly' });
    expect(bez).not.toContain('tb-linia-celu');
    expect(bez).toBe(z.replace(/<small class="tb-linia-celu">.*?<\/small>/, ''));
  });

  it('po angielsku „Goal:” i tekst uciekany', () => {
    ustawJezyk('en');
    const z = tablicaHtml(odczytTablicy(), { wybrana: null, mode: 'zwykly', cel: 'Pick the <first> research.' });
    expect(z).toContain('<small class="tb-linia-celu"><b>Goal:</b> Pick the &lt;first&gt; research.</small>');
  });
});

/* ---------- style.css ---------- */

describe('style.css: reguły dla klas, które rysują celeHtml, sheetHtml i tablicaHtml', () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/style.css'), 'utf8');
  /** wszystkie klasy z kawałka HTML */
  const klasy = (html: string): string[] => [
    ...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean))),
  ];

  it('każda klasa z okienka (rozdział z okazją we wszystkich stanach celu i widok dróg) i z linii celu ma regułę', () => {
    const wszystkie = [
      celeHtml(widokZ({ okazja: HANDLARZ, rozdzial: R1_RECZNIE }), OTWARTE),
      celeHtml(widokZ({ drogi: [{ nazwa: 'A', dalej: 'B', postep: '1 z 2' }] }), OTWARTE),
      sheetHtml({ kicker: 'k', title: 't', body: 'b', foot: 'f', tone: 'noc', cel: 'Cel.' }),
      liniaCelu('Cel.', 'tb-linia-celu', 'small'),
    ].join('');
    const znalezione = klasy(wszystkie);
    // sprawdzenie sprawdza samo siebie: klasy, o które chodzi, naprawdę wystąpiły w HTML
    for (const k of [
      'goals-head',
      'goals-n',
      'goal-list',
      'goal',
      'now',
      'done',
      'missed',
      'czeka',
      'goal-how',
      'goal-czeka',
      'goal-postep',
      'goals-okazja',
      'sheet-cel',
      'tb-linia-celu',
    ])
      expect(znalezione, k).toContain(k);
    // klasa jest podmiotem jakiejś reguły (kończy selektor, ewentualnie z pseudoelementem), a nie tylko stoi w środku cudzego
    for (const k of znalezione)
      expect(css, `.${k}`).toMatch(new RegExp(`\\.${k}(?:::?[\\w-]+|\\[[^\\]]*\\])*\\s*[,{]`));
  });

  it('zwijanie jest w HTML: strzałka nagłówka idzie za aria-expanded, a CSS nie chowa celów po klasie .open', () => {
    expect(css).toContain('.goals-head[aria-expanded="false"]::after');
    expect(css).not.toMatch(/\.goals:not\(\.open\)/);
    expect(css).not.toMatch(/\.goals\.open/);
  });
});

/* ---------- widok R1 z prawdziwej gry ---------- */

describe.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'okienko celów na widoku R1 z gry: %s %s',
  (key, mode) => {
    it('rozwinięte: pięć celów, dyżur czeka do 20:00 z dopiskiem, podpowiedź tylko pod bieżącym', () => {
      const g = poPierwszymRaporcie(key, mode);
      for (const touch of [false, true]) {
        const html = celeHtml(widok(g, { touch }), { otwarte: true, touch });
        expect(pozycje(html).map((p) => p.key)).toEqual(
          mode === 'zombie'
            ? ['przeszukaj', 'budowla', 'dzida', 'drewno2', 'dyzur']
            : ['przeszukaj', 'budowla', 'obwod', 'drewno2', 'dyzur'],
        );
        expect(poz(html, 'przeszukaj').klasy).toEqual(['now']);
        expect(poz(html, 'dyzur').klasy).toEqual(['czeka']);
        expect(poz(html, 'dyzur').html).toContain('<small class="goal-czeka">czeka do 20:00</small>');
        expect(ile(html, /class="goal-how"/g)).toBe(1);
        expect(html).toContain('<b class="goals-n">0/5</b>');
        expect(html).toContain('<span>Drugi dzień</span>');
      }
    });

    it('zwinięte: jeden cel, bieżący, z podpowiedzią', () => {
      const g = poPierwszymRaporcie(key, mode);
      const v = widok(g);
      const html = celeHtml(v, ZWINIETE);
      expect(pozycje(html).map((p) => p.key)).toEqual(['przeszukaj']);
      expect(html).toContain(esc(v.rozdzial!.biezacy!.how));
    });

    it('po angielsku bez polskich liter i słówek, w domu bez słów z bloku, bez myślników', () => {
      const g = poPierwszymRaporcie(key, mode);
      for (const otwarte of [true, false]) {
        const pl = tekst(celeHtml(widok(g), { otwarte, touch: false }));
        expect(pl).not.toMatch(/[—–]/);
        if (wDomu(key)) expect(pl).not.toMatch(FORBIDDEN_DOM);
        ustawJezyk('en');
        const en = celeHtml(widok(g), { otwarte, touch: false });
        ustawJezyk('pl');
        expect(polskieSlowa(tekst(en)), tekst(en)).toEqual([]);
        expect(tekst(en)).not.toMatch(/[—–]/);
        expect(tytulNaglowka(en)).toBe(otwarte ? 'Click to collapse the list' : 'Click to expand the list');
        if (wDomu(key)) expect(tekst(en)).not.toMatch(/\b(flat|stairwell|block)\b/i);
      }
    });
  },
);

/* ---------- celWOknie na prawdziwej karcie nocy ---------- */

describe.each(DEMA.flatMap((key) => TRYBY.map((mode) => [key, mode] as const)))(
  'linia celu na karcie nocy: %s %s',
  (key, mode) => {
    const DYZUR_PL = 'Dajcie komuś dyżur przy kozie.';
    /** gra bez automatu pracy (zapas drewna zależy tylko od testu) z zaliczonymi pierwszymi celami R1, żeby bieżący
        był cel drewna na noc: przeszukanie, budowla i obwód albo dzida */
    function graZeStartem() {
      const g = bezAutomatu(poPierwszymRaporcie(key, mode));
      const tick = g.sim.st.tick;
      for (const k of ['przeszukaj', 'budowla', mode === 'zombie' ? 'dzida' : 'obwod'])
        g.sciezka.zrobione[`r1.${k}`] = tick;
      return g;
    }

    it('za mało drewna: bieżący cel to drewno na noc, a karta pokazuje dyżur przy kozie', () => {
      const g = graZeStartem();
      const trzeba = potrzebaDrewna(wejscie(g));
      // przed kartą żaden cel nie dotyczy okna karty: dyżur czeka do 20:00
      expect(celWOknie(widok(g), 'karta')).toBeNull();
      const card = doKartyZDrewnem(g, trzeba - 1);
      const v = widok(g);
      expect(v.rozdzial?.biezacy?.key).toBe('drewno2');
      expect(v.rozdzial?.biezacy?.okno).toBeUndefined();
      expect(celWOknie(v, 'karta')).toBe(DYZUR_PL);
      ustawJezyk('en');
      expect(celWOknie(widok(g), 'karta')).toBe('Put someone on stove watch.');
      ustawJezyk('pl');
      // inne okna nie mają celu
      for (const okno of ['uchwala', 'tablica', 'spotkanie'] as const) expect(celWOknie(v, okno), okno).toBeNull();
      // linia trafia do prawdziwej karty: pod nagłówkiem i przed listą ludzi
      const i = wejscie(g);
      const assign = g.gov.night!.assign;
      const sheet = nightSheet(
        card,
        assign,
        nightOdds(g.gov, i, card, assign),
        wordsOfWorld(g.sim.w),
        wordsEnOfWorld(g.sim.w),
      );
      const html = sheetHtml({ ...sheet, cel: celWOknie(v, 'karta')! });
      expect(html.indexOf('</header>')).toBeLessThan(html.indexOf(`<b>Cel:</b> ${DYZUR_PL}`));
      expect(html.indexOf(`<b>Cel:</b> ${DYZUR_PL}`)).toBeLessThan(html.indexOf('<div class="sheet-body">'));
    });

    it('dość drewna: drewno zaliczone na karcie, bieżącym celem jest dyżur i to on jest w linii', () => {
      const g = graZeStartem();
      doKartyZDrewnem(g, potrzebaDrewna(wejscie(g)));
      const v = widok(g);
      expect(v.rozdzial?.biezacy?.key).toBe('dyzur');
      expect(celWOknie(v, 'karta')).toBe(DYZUR_PL);
    });

    it('po zatwierdzeniu karty linii już nie ma: dyżur zrobiony albo przepadł', () => {
      const g = graZeStartem();
      const card = doKartyZDrewnem(g, potrzebaDrewna(wejscie(g)) - 1);
      expect(celWOknie(widok(g), 'karta')).toBe(DYZUR_PL);
      odpowiedz(g, { k: 'karta', card, assign: { ...g.gov.night!.assign } });
      expect(celWOknie(widok(g), 'karta')).toBeNull();
    });
  },
);
