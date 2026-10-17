/* Kronika osiedla i filtr nazw miejsc (src/mieszkancy/kronika.ts). Chodzi zawsze, na tabelach z
   public/data/mieszkancy/ i demach z public/demo/, bez surowych plików. Część testów pracuje na zmyślonych mapach, żeby
   sprawdzić regułę (ulice, brak miejsc, brak budynków), a nie dane. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import { kronika, nazwaMiejsca, type WpisKroniki, zbiorImion } from '../../src/mieszkancy/kronika.ts';
import type { TabeleGminy, TabeleImion, TabeleKraju } from '../../src/mieszkancy/tabele.ts';
import type { Budynek } from '../../src/mieszkancy/typy.ts';
import type { Geo, GeoPoi } from '../../src/world/geo.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(KORZEN, 'public');
const wczytaj = <T>(plik: string): T => JSON.parse(fs.readFileSync(path.join(PUBLIC, plik), 'utf8')) as T;

const kraj = wczytaj<TabeleKraju>('data/mieszkancy/kraj.json');
const tabeleImion = wczytaj<TabeleImion>('data/mieszkancy/imiona.json');
const imiona = zbiorImion(tabeleImion);
const gdansk = wczytaj<TabeleGminy>('data/mieszkancy/gminy/2261011.json');
const ursynow = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1465138.json');
const zielonki = wczytaj<TabeleGminy>('data/mieszkancy/gminy/1206172.json');
const demo = (nazwa: string): Geo => wczytaj<{ geo: Geo }>(`demo/${nazwa}.json`).geo;

interface Osiedle {
  nazwa: string;
  geo: Geo;
  budynki: Budynek[];
  ziarno: string;
}
function osiedle(nazwa: string, gmina: TabeleGminy): Osiedle {
  const geo = demo(nazwa);
  const budynki = budynkiZGeo(geo, gmina, kraj);
  return { nazwa, geo, budynki, ziarno: budynki[0].rejon };
}
const PRZYMORZE = osiedle('przymorze', gdansk);
const LANCIEGO = osiedle('lanciego', ursynow);
const ZIELONKI = osiedle('zielonki', zielonki);
const DEMA = [PRZYMORZE, LANCIEGO, ZIELONKI];

const pusta = (poi: GeoPoi[] = [], b: Geo['b'] = []): Geo => ({ c: [52, 21], b, r: [], a: [], w: [], poi });
const poi = (c: string, n: string, x = 0, y = 0): GeoPoi => ({ x, y, c, n });
const wBudynku = (ulica: string, x: number, y: number): Geo['b'][number] => ({
  p: [
    [x, y],
    [x + 10, y],
    [x + 10, y + 10],
    [x, y + 10],
    [x, y],
  ],
  t: { building: 'yes', 'addr:street': ulica },
});

const WZORZEC_KABLI = /kabl|bakter|prąd|prądu|szczep|elektr|instalacj/i;
const wObszarze = (p: GeoPoi): boolean => Math.abs(p.x) <= 192 && Math.abs(p.y) <= 192;
const ziarna = Array.from({ length: 40 }, (_, i) => `ziarno-${i}`);

// ---------------------------------------------------------------- zbiór imion

describe('zbiorImion: imiona z tabel', () => {
  it('zawiera imiona z lat, koszyków, powracających i przyjezdnych', () => {
    expect(imiona.has('Jan')).toBe(true);
    expect(imiona.has('Anna')).toBe(true);
    expect(imiona.has('Zofia')).toBe(true);
    const przyjezdny = tabeleImion.przyjezdni.M[0][0];
    expect(imiona.has(przyjezdny)).toBe(true);
    const powracajace = tabeleImion.powracajace.K[0];
    expect(imiona.has(powracajace)).toBe(true);
    const zKoszyka = tabeleImion.koszyki['1920-1945'].M[0][0];
    expect(imiona.has(zKoszyka)).toBe(true);
    const zLat = tabeleImion.lata['2010'].K[0][0];
    expect(imiona.has(zLat)).toBe(true);
  });

  it('nie zawiera nazw marek ani słów pospolitych', () => {
    for (const nie of ['Żabka', 'Biedronka', 'Apteka', 'Szkoła', 'Rossmann']) expect(imiona.has(nie)).toBe(false);
  });

  it('jest zbiorem pojedynczych słów z wielkiej litery', () => {
    expect(imiona.size).toBeGreaterThan(500);
    for (const i of imiona) expect(i).toMatch(/^\p{Lu}/u);
  });
});

// ---------------------------------------------------------------- filtr nazw

describe('nazwaMiejsca: imię i nazwisko w nazwie zamienia się na opis kategorii', () => {
  it('„Usługi Remontowe Jan Nowak” traci i imię, i nazwisko', () => {
    const n = nazwaMiejsca(poi('budowlany', 'Usługi Remontowe Jan Nowak'), imiona);
    expect(n).not.toContain('Jan');
    expect(n).not.toContain('Nowak');
    expect(n).toBe('sklep z narzędziami i częściami');
  });

  it('cała nazwa to imię i nazwisko: zostaje sam opis', () => {
    expect(nazwaMiejsca(poi('spozywczy', 'Sławomir Mielnik'), imiona)).toBe('sklep spożywczy przy bloku');
    expect(nazwaMiejsca(poi('apteka', 'Maria Kowalska'), imiona)).toBe('apteka');
    expect(nazwaMiejsca(poi('sklep', 'Aldona Hair'), imiona)).toBe('zakład usługowy na rogu');
  });

  it('jeden opis na kategorię, z rozsądnym zastępczym dla nieznanej', () => {
    const osoba = 'Jan Kowalski';
    const opisy: Record<string, string> = {
      spozywczy: 'sklep spożywczy przy bloku',
      apteka: 'apteka',
      budowlany: 'sklep z narzędziami i częściami',
      elektronika: 'sklep z elektroniką',
      ubrania: 'sklep z ubraniami',
      ogrodnik: 'sklep ogrodniczy',
      sklep: 'zakład usługowy na rogu',
      przychodnia: 'gabinet lekarski',
      szkola: 'placówka oświatowa',
      biblioteka: 'biblioteka',
      bank: 'oddział banku',
      stacja: 'stacja paliw',
      kosciol: 'kościół',
      urzad: 'punkt osiedlowy',
    };
    for (const [c, opis] of Object.entries(opisy)) expect(nazwaMiejsca(poi(c, osoba), imiona), c).toBe(opis);
    expect(nazwaMiejsca(poi('nieznana', osoba), imiona)).toBe('lokal na rogu');
  });

  it('nazwy firm i instytucji zostają bez zmian', () => {
    expect(nazwaMiejsca(poi('szkola', 'Szkoła Podstawowa nr 12'), imiona)).toBe('Szkoła Podstawowa nr 12');
    expect(nazwaMiejsca(poi('spozywczy', 'Żabka'), imiona)).toBe('Żabka');
    expect(nazwaMiejsca(poi('apteka', 'Apteka Pod Lwem'), imiona)).toBe('Apteka Pod Lwem');
    expect(nazwaMiejsca(poi('spozywczy', 'Biedronka'), imiona)).toBe('Biedronka');
    expect(nazwaMiejsca(poi('apteka', 'Dr. Max'), imiona)).toBe('Dr. Max');
    expect(nazwaMiejsca(poi('szkola', 'Zespół Szkolno-Przedszkolny nr 1 w Gdańsku'), imiona)).toBe(
      'Zespół Szkolno-Przedszkolny nr 1 w Gdańsku',
    );
  });

  it('patron po „im.” odpada, sama instytucja zostaje', () => {
    const oczekiwane: [string, string][] = [
      ['Przedszkole nr 34 im. Marii Konopnickiej', 'Przedszkole nr 34'],
      ['Szkoła Podstawowa Nr 44 im. Adama Mickiewicza', 'Szkoła Podstawowa Nr 44'],
      ['Społeczna Szkoła Podstawowa nr 1 im. Jana Nowaka-Jeziorańskiego', 'Społeczna Szkoła Podstawowa nr 1'],
      ['Szkoła Podstawowa nr 3 im. Jan Brzechwa', 'Szkoła Podstawowa nr 3'],
      ['Liceum Ogólnokształcące imienia Jan Kochanowski', 'Liceum Ogólnokształcące'],
      ['Szkoła Podstawowa nr 340, im. Profesora Bogusława Molskiego', 'Szkoła Podstawowa nr 340'],
    ];
    for (const [przed, po] of oczekiwane) expect(nazwaMiejsca(poi('szkola', przed), imiona), przed).toBe(po);
  });

  it('osoba przed patronem nadal się liczy', () => {
    expect(nazwaMiejsca(poi('szkola', 'Niepubliczne Przedszkole Anna Kowalska im. Jana Brzechwy'), imiona)).toBe(
      'placówka oświatowa',
    );
  });

  it('nazwa zaczynająca się od „im.” zostaje cała (nie ma co zostawić)', () => {
    expect(nazwaMiejsca(poi('szkola', 'im. Zielonego Dębu'), new Set())).toBe('im. Zielonego Dębu');
  });

  it('wzór „u Jana”: słowo z wielkiej litery po samodzielnym „u” to właściciel', () => {
    expect(nazwaMiejsca(poi('ogrodnik', 'Kwiaciarnia u Moniki'), imiona)).toBe('sklep ogrodniczy');
    expect(nazwaMiejsca(poi('spozywczy', 'Delikatesy mięsne u Marioli'), imiona)).toBe('sklep spożywczy przy bloku');
    expect(nazwaMiejsca(poi('sklep', 'U Sylwii'), imiona)).toBe('zakład usługowy na rogu');
    expect(nazwaMiejsca(poi('spozywczy', 'U Grubego'), imiona)).toBe('sklep spożywczy przy bloku');
  });

  it('wzór „u” działa niezależnie od zbioru imion', () => {
    expect(nazwaMiejsca(poi('ogrodnik', 'Kwiaciarnia u Moniki'), new Set())).toBe('sklep ogrodniczy');
  });

  it('„u” w środku słowa i „u” przed małą literą nie są wzorcem', () => {
    expect(nazwaMiejsca(poi('sklep', 'Studio fryzur'), imiona)).toBe('Studio fryzur');
    expect(nazwaMiejsca(poi('sklep', 'Sklep u nas'), imiona)).toBe('Sklep u nas');
    expect(nazwaMiejsca(poi('sklep', 'Hulu Shop'), imiona)).toBe('Hulu Shop');
  });

  it('dopasowanie jest co do słowa i z uwzględnieniem wielkości liter', () => {
    const zbior = new Set(['Łukasz', 'Jan']);
    expect(nazwaMiejsca(poi('sklep', 'Łukasz Żółć'), zbior)).toBe('zakład usługowy na rogu');
    expect(nazwaMiejsca(poi('sklep', 'Łukaszewicz Żółć'), zbior)).toBe('Łukaszewicz Żółć');
    expect(nazwaMiejsca(poi('sklep', 'Jan-Pol Sklep'), zbior)).toBe('Jan-Pol Sklep');
    expect(nazwaMiejsca(poi('sklep', 'JAN NOWAK'), zbior)).toBe('JAN NOWAK');
    expect(nazwaMiejsca(poi('sklep', 'jan Nowak'), zbior)).toBe('jan Nowak');
  });

  it('po imieniu musi stać słowo z wielkiej litery, rozdzielone samą spacją', () => {
    const zbior = new Set(['Jan']);
    expect(nazwaMiejsca(poi('sklep', 'Jan sprzedaje'), zbior)).toBe('Jan sprzedaje');
    expect(nazwaMiejsca(poi('sklep', 'Jan, Nowak i spółka'), zbior)).toBe('Jan, Nowak i spółka');
    expect(nazwaMiejsca(poi('sklep', 'Jan & Nowak'), zbior)).toBe('Jan & Nowak');
    expect(nazwaMiejsca(poi('sklep', 'Jan  Nowak'), zbior)).toBe('zakład usługowy na rogu');
    expect(nazwaMiejsca(poi('sklep', 'Salon Jan K.'), zbior)).toBe('zakład usługowy na rogu');
  });

  it('granice filtra: samo imię, samo nazwisko i formy odmienione zostają', () => {
    // Opisane w nagłówku kronika.ts jako znane luki: bez słownika nazwisk i odmiany nie ma jak ich odróżnić od marek.
    expect(nazwaMiejsca(poi('sklep', 'Jubiler Monika'), imiona)).toBe('Jubiler Monika');
    expect(nazwaMiejsca(poi('sklep', 'Roland'), imiona)).toBe('Roland');
    expect(nazwaMiejsca(poi('spozywczy', 'Mielnik'), imiona)).toBe('Mielnik');
  });

  it('nazwa pusta zostaje pusta', () => {
    expect(nazwaMiejsca(poi('sklep', ''), imiona)).toBe('');
    expect(nazwaMiejsca(poi('sklep', '   '), imiona)).toBe('');
  });

  it('nie zmienia POI ani zbioru imion', () => {
    const p = poi('sklep', 'Jan Nowak');
    const zbior = new Set(['Jan']);
    nazwaMiejsca(p, zbior);
    expect(p).toEqual({ x: 0, y: 0, c: 'sklep', n: 'Jan Nowak' });
    expect([...zbior]).toEqual(['Jan']);
  });

  it('wynik nie ma pauz-myślników ani podwójnych spacji', () => {
    const n = nazwaMiejsca(
      poi('przychodnia', 'Nadmorskie Centrum Medyczne Sp. z o.o. - Przychodnia "Jagiellońska"'),
      imiona,
    );
    expect(n).toBe('Nadmorskie Centrum Medyczne Sp. z o.o., Przychodnia "Jagiellońska"');
    expect(nazwaMiejsca(poi('sklep', 'Sklep  z   przerwami'), imiona)).toBe('Sklep z przerwami');
    expect(nazwaMiejsca(poi('sklep', 'A — B – C'), imiona)).toBe('A, B, C');
  });

  it('na prawdziwych demach zamienia osoby z nazw i zostawia marki', () => {
    const zamienione = (o: Osiedle): string[] =>
      o.geo.poi
        .map((p) => [p.n, nazwaMiejsca(p, imiona)])
        .filter(([przed, po]) => przed !== po)
        .map(([przed]) => przed);
    const przymorze = zamienione(PRZYMORZE);
    const lanciego = zamienione(LANCIEGO);
    for (const osoba of [
      'Sławomir Mielnik',
      'Eugeniusz Lipiński',
      'Kwiaciarnia u Moniki',
      'Delikatesy mięsne u Marioli',
    ])
      expect(przymorze, osoba).toContain(osoba);
    for (const osoba of ['Monika Osowska', 'Marek Bazarek', 'U Sylwii']) expect(lanciego, osoba).toContain(osoba);
    for (const marka of ['Żabka', 'Biedronka', 'Rossmann', 'Szkoła Podstawowa nr 79', 'PKO BP', 'Orlen'])
      expect(przymorze, marka).not.toContain(marka);
    // przy szkołach z patronem zmieniona jest tylko nazwa (patron odpada), nigdy cała na opis
    const patroni = LANCIEGO.geo.poi.concat(PRZYMORZE.geo.poi).filter((p) => /\bim\./.test(p.n));
    expect(patroni.length).toBeGreaterThan(3);
    for (const p of patroni) expect(nazwaMiejsca(p, imiona), p.n).toBe(p.n.slice(0, p.n.indexOf(' im.')).trim());
  });
});

// ---------------------------------------------------------------- kronika

describe('kronika: kilkanaście wspólnych zdarzeń z lat 2026 do 2051', () => {
  const kron = (o: Osiedle, ziarno = o.ziarno): WpisKroniki[] => kronika(o.geo, o.budynki, imiona, ziarno);

  it('Przymorze: 12-16 wpisów, lata w [2026, 2051], rosnąco', () => {
    const k = kron(PRZYMORZE);
    expect(k.length).toBeGreaterThanOrEqual(12);
    expect(k.length).toBeLessThanOrEqual(16);
    for (const w of k) {
      expect(Number.isInteger(w.rok)).toBe(true);
      expect(w.rok).toBeGreaterThanOrEqual(2026);
      expect(w.rok).toBeLessThanOrEqual(2051);
    }
    for (let i = 1; i < k.length; i++) expect(k[i].rok).toBeGreaterThanOrEqual(k[i - 1].rok);
  });

  it('Przymorze: co najmniej trzy wpisy o kablach, bakterii i prądzie oraz pięć z miejscem z mapy', () => {
    const k = kron(PRZYMORZE);
    expect(k.filter((w) => WZORZEC_KABLI.test(w.tekst)).length).toBeGreaterThanOrEqual(3);
    expect(k.filter((w) => w.miejsce).length).toBeGreaterThanOrEqual(5);
  });

  it('dwa wywołania z tymi samymi danymi dają to samo', () => {
    for (const o of DEMA) expect(kron(o), o.nazwa).toEqual(kron(o));
  });

  it('inne ziarno daje inną kronikę (a ta sama mapa zachowuje strukturę)', () => {
    const a = kron(PRZYMORZE, 'a');
    const b = kron(PRZYMORZE, 'b');
    expect(a).not.toEqual(b);
    expect(a.map((w) => w.tekst).join('|')).not.toBe(b.map((w) => w.tekst).join('|'));
  });

  it('nie zmienia mapy, budynków ani zbioru imion', () => {
    const geo = JSON.stringify(PRZYMORZE.geo);
    const budynki = JSON.stringify(PRZYMORZE.budynki);
    const zbior = [...imiona];
    kron(PRZYMORZE);
    expect(JSON.stringify(PRZYMORZE.geo)).toBe(geo);
    expect(JSON.stringify(PRZYMORZE.budynki)).toBe(budynki);
    expect([...imiona]).toEqual(zbior);
  });

  it('wszystkie trzy dema, wiele ziaren: liczba wpisów, lata, kolejność, kable, miejsca, brak powtórzeń', () => {
    for (const o of DEMA) {
      for (const z of [o.ziarno, ...ziarna]) {
        const k = kron(o, z);
        const opis = `${o.nazwa} / ${z}`;
        expect(k.length, opis).toBeGreaterThanOrEqual(12);
        expect(k.length, opis).toBeLessThanOrEqual(16);
        for (let i = 0; i < k.length; i++) {
          expect(k[i].rok, opis).toBeGreaterThanOrEqual(2026);
          expect(k[i].rok, opis).toBeLessThanOrEqual(2051);
          if (i) expect(k[i].rok, opis).toBeGreaterThanOrEqual(k[i - 1].rok);
        }
        // zawsze pięć wpisów o kablach, bakterii i prądzie (zamierzone), a wymagane są trzy
        expect(k.filter((w) => WZORZEC_KABLI.test(w.tekst)).length, opis).toBeGreaterThanOrEqual(5);
        expect(k.filter((w) => w.miejsce).length, opis).toBeGreaterThanOrEqual(5);
        expect(new Set(k.map((w) => w.tekst)).size, opis).toBe(k.length);
      }
    }
  });

  it('odkrycie jest w 2029, rok zero w 2026-2027, a ostatni wpis w 2051', () => {
    for (const o of DEMA) {
      for (const z of ziarna) {
        const k = kron(o, z);
        expect(
          k.some((w) => w.rok === 2029 && /bakteri/i.test(w.tekst)),
          `${o.nazwa} / ${z}`,
        ).toBe(true);
        expect(
          k.some((w) => w.rok <= 2027 && /kabl/i.test(w.tekst)),
          `${o.nazwa} / ${z}`,
        ).toBe(true);
        expect(k[k.length - 1].rok).toBe(2051);
      }
    }
  });

  it('wpisy są pełnymi zdaniami po polsku: wielka litera, kropka na końcu, rozsądna długość', () => {
    for (const o of DEMA) {
      for (const z of ziarna) {
        for (const w of kron(o, z)) {
          expect(w.tekst, w.tekst).toMatch(/^\p{Lu}/u);
          expect(w.tekst, w.tekst).toMatch(/[.!?]$/);
          expect(w.tekst.length, w.tekst).toBeLessThanOrEqual(320);
          expect(w.tekst.length, w.tekst).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  it('bez pauz-myślników, numerów mieszkań i pięter', () => {
    for (const o of DEMA) {
      for (const z of ziarna) {
        for (const w of kron(o, z)) {
          const wszystko = `${w.tekst} ${w.miejsce ?? ''}`;
          expect(wszystko, wszystko).not.toMatch(/[\u2012-\u2015]/);
          expect(wszystko, wszystko).not.toMatch(/\s-\s/);
          expect(wszystko, wszystko).not.toMatch(/piętr|parter|kondygnacj/i);
          expect(wszystko, wszystko).not.toMatch(/mieszkani\w*\s+(nr\s*)?\d/i);
          expect(wszystko, wszystko).not.toMatch(/\bm\.?\s*\d/i);
          expect(wszystko, wszystko).not.toMatch(/mróz/i);
        }
      }
    }
  });

  it('miejsce to przefiltrowana nazwa prawdziwego POI i stoi w tekście, a jego kategoria się zgadza', () => {
    for (const o of DEMA) {
      const nazwy = new Map<string, GeoPoi[]>();
      for (const p of o.geo.poi) {
        const n = nazwaMiejsca(p, imiona);
        if (n) nazwy.set(n, [...(nazwy.get(n) ?? []), p]);
      }
      for (const z of ziarna) {
        for (const w of kron(o, z)) {
          if (!w.miejsce) continue;
          expect(nazwy.has(w.miejsce), `${o.nazwa}: ${w.miejsce}`).toBe(true);
          const jestZmieniona = (nazwy.get(w.miejsce) ?? []).some((p) => p.n !== w.miejsce);
          // nazwa zostawiona bez zmian stoi w tekście; wyjątek to nazwa-rzeczownik ("Sklep ogrodniczy"), bez nawiasu
          if (!jestZmieniona) expect(w.tekst.includes(w.miejsce) || !w.tekst.includes('('), w.tekst).toBe(true);
        }
      }
    }
  });

  it('miejsca z obszaru gry (|x|, |y| do 192 m) mają pierwszeństwo przed dalszymi', () => {
    for (const o of DEMA) {
      for (const z of ziarna) {
        for (const w of kron(o, z)) {
          if (!w.miejsce) continue;
          const pasujace = o.geo.poi.filter((p) => nazwaMiejsca(p, imiona) === w.miejsce);
          if (pasujace.some(wObszarze)) continue;
          // wybrane miejsce leży dalej: wtedy w jego kategorii nie mogło być nic bliżej, w obszarze
          for (const p of pasujace) {
            const wTejKategorii = o.geo.poi.filter((q) => q.c === p.c && q.n.trim() && wObszarze(q));
            expect(wTejKategorii.length, `${o.nazwa} / ${z}: ${w.miejsce}`).toBe(0);
          }
        }
      }
    }
  });

  it('nigdy nie wymienia osoby z nazwy miejsca (RODO)', () => {
    for (const o of DEMA) {
      // słowa osobowe z nazw, które filtr zamienia: imię z listy i słowo po nim, słowo po „u”
      const zakazane = new Set<string>();
      const calosci = new Set<string>();
      for (const p of o.geo.poi) {
        if (nazwaMiejsca(p, imiona) === p.n) continue;
        calosci.add(p.n);
        const slowa = p.n.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
        slowa.forEach((s, i) => {
          if (imiona.has(s) && /^\p{Lu}/u.test(slowa[i + 1] ?? '')) {
            zakazane.add(s);
            zakazane.add(slowa[i + 1]);
          }
          if (/^[uU]$/.test(s) && /^\p{Lu}/u.test(slowa[i + 1] ?? '')) zakazane.add(slowa[i + 1]);
        });
      }
      // słowo, które występuje też w nazwie zostawionej bez zmian ("Bazarek" w "Bazarek \"Na Dołku\""), nie jest osobą
      for (const p of o.geo.poi) {
        if (nazwaMiejsca(p, imiona) !== p.n) continue;
        for (const s of p.n.match(/[\p{L}][\p{L}'’-]*/gu) ?? []) zakazane.delete(s);
      }
      for (const z of ziarna) {
        for (const w of kron(o, z)) {
          const wszystko = `${w.tekst} ${w.miejsce ?? ''}`;
          for (const c of calosci) expect(wszystko).not.toContain(c);
          for (const s of zakazane) expect(wszystko).not.toMatch(new RegExp(`(?<![\\p{L}])${s}(?![\\p{L}])`, 'u'));
        }
      }
    }
  });

  it('osoba w nazwie POI zamienia się w opis także wewnątrz wpisu', () => {
    const geo = pusta([
      poi('spozywczy', 'Sławomir Mielnik', 10, 10),
      poi('przychodnia', 'Anna Nowak', 20, 20),
      poi('apteka', 'Maria Kowalska', 30, 30),
      poi('bank', 'Jan Zieliński', 40, 40),
      poi('szkola', 'Jolanta Wójcik', 50, 50),
      poi('stacja', 'Piotr Lewandowski', 60, 60),
    ]);
    for (const z of ziarna) {
      const k = kronika(geo, [], imiona, z);
      const miejsca = k.filter((w) => w.miejsce).map((w) => w.miejsce);
      expect(miejsca.length).toBeGreaterThanOrEqual(5);
      for (const w of k) {
        expect(`${w.tekst} ${w.miejsce ?? ''}`).not.toMatch(
          /Mielnik|Nowak|Kowalska|Zieliński|Wójcik|Lewandowski|Sławomir|Anna|Maria|Jolanta|Piotr/,
        );
      }
    }
  });

  it('bez żadnego POI i bez budynków kronika nadal ma 12-16 wpisów i kable, tylko bez miejsc', () => {
    for (const z of ziarna) {
      const k = kronika(pusta(), [], imiona, z);
      expect(k.length).toBeGreaterThanOrEqual(12);
      expect(k.length).toBeLessThanOrEqual(16);
      expect(k.filter((w) => WZORZEC_KABLI.test(w.tekst)).length).toBeGreaterThanOrEqual(3);
      expect(k.filter((w) => w.miejsce)).toEqual([]);
      for (let i = 1; i < k.length; i++) expect(k[i].rok).toBeGreaterThanOrEqual(k[i - 1].rok);
    }
  });

  it('POI bez nazwy nie trafia do kroniki', () => {
    const geo = pusta([poi('szkola', '', 10, 10), poi('apteka', '  ', 20, 20), poi('bank', 'PKO BP', 30, 30)]);
    for (const z of ziarna) {
      for (const w of kronika(geo, [], imiona, z)) if (w.miejsce) expect(w.miejsce).toBe('PKO BP');
    }
  });

  it('jedno miejsce wystarcza na kilka wpisów, a każde dostaje inne zdarzenie', () => {
    const geo = pusta([poi('przychodnia', 'Centrum Medyczne Batowice', -57, -100)]);
    for (const z of ziarna) {
      const k = kronika(geo, [], imiona, z).filter((w) => w.miejsce);
      expect(k.length).toBeGreaterThanOrEqual(3);
      expect(new Set(k.map((w) => w.tekst)).size).toBe(k.length);
      for (const w of k) expect(w.miejsce).toBe('Centrum Medyczne Batowice');
    }
  });

  it('nieznana kategoria POI dostaje zdarzenia ogólne, nie wyjątek', () => {
    const geo = pusta([poi('kosmiczna', 'Port Kosmiczny', 10, 10)]);
    const k = kronika(geo, [], imiona, 'x');
    expect(k.filter((w) => w.miejsce).length).toBeGreaterThanOrEqual(3);
    for (const w of k) if (w.miejsce) expect(w.miejsce).toBe('Port Kosmiczny');
  });

  it('te same nazwy sieci nie powtarzają się jako różne miejsca w jednej kronice', () => {
    const geo = pusta(
      Array.from({ length: 8 }, (_, i) => poi('spozywczy', 'Żabka', i * 10, 5)),
      [],
    );
    const k = kronika(geo, [], imiona, 'z');
    const zabki = k.filter((w) => w.miejsce === 'Żabka');
    // wszystkie Żabki to jedno miejsce w kronice, więc wpisy o niej mają różne zdarzenia i różne lata
    expect(new Set(zabki.map((w) => w.tekst)).size).toBe(zabki.length);
  });

  it('nazwa będąca samym rzeczownikiem nie powtarza się w nawiasie', () => {
    const geo = pusta([poi('ogrodnik', 'Sklep ogrodniczy', 10, 10), poi('apteka', 'Apteka', 20, 20)]);
    for (const z of ziarna) {
      for (const w of kronika(geo, [], imiona, z)) {
        expect(w.tekst).not.toContain('Sklep ogrodniczy (Sklep ogrodniczy)');
        expect(w.tekst).not.toMatch(/Apteka \(Apteka\)|aptece \(Apteka\)/);
        expect(w.tekst).not.toMatch(/\(\)/);
      }
    }
    const k = ziarna.flatMap((z) => kronika(geo, [], imiona, z));
    expect(k.some((w) => w.miejsce === 'Sklep ogrodniczy')).toBe(true);
    expect(k.some((w) => w.miejsce === 'Apteka')).toBe(true);
  });

  it('przedszkola i żłobki nie odwołują lekcji informatyki, szkoły tak', () => {
    const teksty = (c: string, n: string): string[] =>
      ziarna.flatMap((z) => kronika(pusta([poi(c, n, 10, 10)]), [], imiona, z).map((w) => w.tekst));
    const przedszkole = teksty('szkola', 'Przedszkole nr 59');
    expect(przedszkole.some((t) => t.includes('W przedszkolu (Przedszkole nr 59)'))).toBe(true);
    expect(przedszkole.some((t) => /W szkole|lekcje informatyki|dziennik/.test(t))).toBe(false);
    const punkt = teksty('szkola', 'Punkt Przedszkolny Słowiańska Wieża');
    expect(punkt.some((t) => t.includes('W przedszkolu (Punkt Przedszkolny Słowiańska Wieża)'))).toBe(true);
    const zlobek = teksty('szkola', 'Żłobek nr 68');
    expect(zlobek.some((t) => t.includes('W żłobku (Żłobek nr 68)'))).toBe(true);
    expect(zlobek.some((t) => /W szkole|W przedszkolu/.test(t))).toBe(false);
    const szkola = teksty('szkola', 'Szkoła Podstawowa nr 12');
    expect(szkola.some((t) => t.includes('W szkole (Szkoła Podstawowa nr 12) odwołano lekcje informatyki'))).toBe(true);
    const zespol = teksty('szkola', 'Zespół Szkolno-Przedszkolny nr 1 w Gdańsku');
    expect(zespol.some((t) => t.startsWith('W szkole (Zespół Szkolno-Przedszkolny'))).toBe(true);
    expect(zespol.some((t) => /W przedszkolu/.test(t))).toBe(false);
  });

  it('opis zastępczy dostaje rodzaj rzeczownika kategorii (przeszedł / przeszła)', () => {
    const k = (c: string, n: string): string[] =>
      ziarna.flatMap((z) => kronika(pusta([poi(c, n, 10, 10)]), [], imiona, z).map((w) => w.tekst));
    const zOsoba = k('przychodnia', 'Anna Nowak');
    expect(zOsoba.some((t) => t.startsWith('Gabinet lekarski przeszedł na dyżury przy świecach'))).toBe(true);
    expect(zOsoba.some((t) => /Gabinet lekarski przeszła/.test(t))).toBe(false);
    const zNazwa = k('przychodnia', 'Baltmed');
    expect(zNazwa.some((t) => t.startsWith('Przychodnia (Baltmed) przeszła na dyżury przy świecach'))).toBe(true);
  });

  it('ulice z addr:street pojawiają się w tekście w mianowniku, bez zmyślonej odmiany', () => {
    const geo = pusta(
      [],
      [wBudynku('Spacerowa', 10, 10), wBudynku('Spacerowa', 30, 10), wBudynku('Lanciego', -50, 20)],
    );
    for (const z of ziarna) {
      const k = kronika(geo, [], imiona, z);
      const ulice = k.filter((w) => /^Ulica (Spacerowa|Lanciego):/.test(w.tekst));
      expect(ulice.length, z).toBeGreaterThanOrEqual(1);
      for (const w of k) {
        expect(w.tekst).not.toMatch(/ul(icy|icę|icą)\s+(Spacerowa|Lanciego)/i);
        expect(w.tekst).not.toContain('Spacerowej');
      }
    }
  });

  it('ulica, w której filtr widzi osobę, odpada z kroniki', () => {
    const geo = pusta(
      [],
      [wBudynku('Jan Kowalski', 10, 10), wBudynku('Jan Kowalski', 30, 10), wBudynku('Pogodna', 50, 10)],
    );
    for (const z of ziarna) {
      const teksty = kronika(geo, [], imiona, z).map((w) => w.tekst);
      expect(teksty.join(' ')).not.toContain('Kowalski');
      expect(teksty.some((t) => t.startsWith('Ulica Pogodna:'))).toBe(true);
    }
    const tylkoOsoby = pusta([], [wBudynku('Anna Nowak', 10, 10)]);
    for (const z of ziarna) {
      const k = kronika(tylkoOsoby, [], imiona, z);
      expect(k.map((w) => w.tekst).join(' ')).not.toContain('Nowak');
      expect(k.some((w) => /^Główna ulica osiedla:/.test(w.tekst))).toBe(true);
    }
  });

  it('nazwa ulicy, która już zaczyna się od rzeczownika (aleja, plac), nie dostaje drugiego „Ulica”', () => {
    const geo = pusta([], [wBudynku('Aleja Zwycięstwa', 10, 10), wBudynku('Plac Wolności', 30, 10)]);
    for (const z of ziarna) {
      for (const w of kronika(geo, [], imiona, z)) {
        expect(w.tekst).not.toMatch(/Ulica (Aleja|Plac)/);
      }
    }
    const wszystkie = ziarna.flatMap((z) => kronika(geo, [], imiona, z).map((w) => w.tekst));
    expect(wszystkie.some((t) => /^(Aleja Zwycięstwa|Plac Wolności):/.test(t))).toBe(true);
  });

  it('ulice z obszaru gry mają pierwszeństwo przed dalszymi', () => {
    const geo = pusta([], [wBudynku('Bliska', 10, 10), wBudynku('Daleka', 500, 500), wBudynku('Daleka', 520, 500)]);
    for (const z of ziarna) {
      const tekst = kronika(geo, [], imiona, z)
        .map((w) => w.tekst)
        .join(' ');
      expect(tekst).toContain('Ulica Bliska:');
      expect(tekst).not.toContain('Daleka');
    }
  });

  it('bez nazw ulic (demo, kafelki) wpisy o ulicach mówią o głównej ulicy osiedla', () => {
    for (const z of ziarna) {
      const k = kronika(pusta(), [], imiona, z);
      expect(k.some((w) => /^Główna ulica osiedla:/.test(w.tekst))).toBe(true);
      expect(k.some((w) => /^Ulica /.test(w.tekst))).toBe(false);
    }
  });

  it('budynki wpływają na tło osiedla: bloki, domy, płyta', () => {
    const bazowy: Budynek = {
      klucz: 'k',
      lat: 0,
      lon: 0,
      rejon: '',
      typ: 'blok',
      kondygnacje: 5,
      pole: 600,
      szerokosc: 12,
      dlugosc: 50,
      klatki: 3,
    };
    const bloki: Budynek[] = Array.from({ length: 6 }, (_, i) => ({ ...bazowy, klucz: `b${i}`, epoka: 'plyta' }));
    const domy: Budynek[] = Array.from({ length: 6 }, (_, i) => ({
      ...bazowy,
      klucz: `d${i}`,
      typ: 'dom',
      kondygnacje: 2,
      epoka: 'powojenna',
    }));
    const tla = (b: Budynek[]): string[] => ziarna.flatMap((z) => kronika(pusta(), b, imiona, z).map((w) => w.tekst));
    expect(tla(bloki).some((t) => /Windy|Wielka płyta/.test(t))).toBe(true);
    expect(tla(domy).some((t) => /Domy jednorodzinne/.test(t))).toBe(true);
    expect(tla(domy).some((t) => /Windy|Wielka płyta/.test(t))).toBe(false);
    expect(tla(bloki).some((t) => /Domy jednorodzinne/.test(t))).toBe(false);
  });

  it('wydajność: kronika całego dema liczy się w ułamku sekundy', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) kron(PRZYMORZE, `p${i}`);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
