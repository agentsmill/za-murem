/* Kronika osiedla i filtr nazw miejsc (src/mieszkancy/kronika.ts). Chodzi zawsze, na tabelach z
   public/data/mieszkancy/ i demach z public/demo/, bez surowych plików. Część testów pracuje na zmyślonych mapach, żeby
   sprawdzić regułę (ulice, brak miejsc, brak budynków), a nie dane. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { budynkiZGeo } from '../../src/mieszkancy/budynki.ts';
import {
  kronika,
  nazwaDoOkolicy,
  nazwaDoOkolicyZDanych,
  nazwaMiejsca,
  nazwaWlasnaMiejsca,
  type WpisKroniki,
  wolnyRok,
  zbiorImion,
} from '../../src/mieszkancy/kronika.ts';
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

  it('tytuł i słowo z wielkiej litery to osoba: „Apteka Dr Nowak”, „Gabinet lek. Nowak”', () => {
    const opisy: [string, string, string][] = [
      ['apteka', 'Apteka Dr Nowak', 'apteka'],
      ['apteka', 'Apteka dr. Nowak', 'apteka'],
      ['przychodnia', 'Gabinet lek. Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet lek. med. Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet Stomatologiczny dr n. med. Kowalski', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet mgr Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Praktyka prof. Kowalski', 'gabinet lekarski'],
      ['budowlany', 'Usługi mgr inż. Nowak', 'sklep z narzędziami i częściami'],
      ['sklep', 'Salon DR NOWAK', 'zakład usługowy na rogu'],
      ['sklep', 'Salon Dr Anna Nowak', 'zakład usługowy na rogu'],
    ];
    for (const [c, przed, po] of opisy) expect(nazwaMiejsca(poi(c, przed), imiona), przed).toBe(po);
  });

  it('tytuł bez spacji po kropce też jest tytułem: „Apteka Dr.Nowak”, „Gabinet lek.Nowak”', () => {
    const opisy: [string, string, string][] = [
      ['apteka', 'Apteka Dr.Nowak', 'apteka'],
      ['apteka', 'Apteka dr.Nowak', 'apteka'],
      ['przychodnia', 'Gabinet lek.Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet lek. med.Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet mgr.Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Praktyka prof.Kowalski', 'gabinet lekarski'],
      ['apteka', 'Apteka mgr farm.Nowak', 'apteka'],
    ];
    for (const [c, przed, po] of opisy) expect(nazwaMiejsca(poi(c, przed), imiona), przed).toBe(po);
  });

  it('„farm.” jest tytułem, także w ciągu tytułów: „mgr farm. Nowak”, „dr n. farm. Nowak”', () => {
    const opisy: [string, string, string][] = [
      ['apteka', 'Apteka mgr farm. Nowak', 'apteka'],
      ['apteka', 'Apteka mgr. farm. Kowalska', 'apteka'],
      ['apteka', 'Apteka Dr n. farm. Nowak', 'apteka'],
      ['apteka', 'Apteka mgr inż. farm. Nowak', 'apteka'],
      ['przychodnia', 'Gabinet prof. dr hab. n. med. Kowalski', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet lek. med. dent. Nowak', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet lek. specj. Nowak', 'gabinet lekarski'],
    ];
    for (const [c, przed, po] of opisy) expect(nazwaMiejsca(poi(c, przed), imiona), przed).toBe(po);
    // „farm” bez kropki to zwykłe słowo
    expect(nazwaMiejsca(poi('apteka', 'Centrum Farm Plus'), imiona)).toBe('Centrum Farm Plus');
  });

  it('sieci z tytułem w nazwie zostają (lista wyjątków), reszta „Dr” nie', () => {
    for (const n of [
      'Dr. Max',
      'Dr Max',
      'Dr.Max',
      'Apteka Dr. Max',
      'DR. MAX',
      'Dr Irena Eris',
      'Dr. Martens',
      'Dr. Oetker',
      'Dr. Max, Gdańsk',
      'Dr. Max (Przymorze)',
    ])
      expect(nazwaMiejsca(poi('apteka', n), imiona), n).toBe(n);
    // wyjątek dotyczy tylko znanej sieci, nie każdego „Dr”
    expect(nazwaMiejsca(poi('apteka', 'Apteka Dr Maxymilian Nowak'), imiona)).toBe('apteka');
    expect(nazwaMiejsca(poi('apteka', 'Dr Maxwell'), imiona)).toBe('apteka');
  });

  it('sieć z tytułem i słowo z wielkiej litery po niej to nadal osoba: „Dr Max Kowalski”', () => {
    for (const n of [
      'Dr Max Kowalski',
      'Dr. Max Nowak',
      'Dr.Max Nowak',
      'Apteka Dr Max Nowak',
      'Dr Martens Nowak',
      'Dr. Martens Kowalska',
      'Dr Irena Eris Nowak',
      'Dr. Oetker Nowak',
      'Dr. Scholl Nowak',
    ])
      expect(nazwaMiejsca(poi('apteka', n), imiona), n).toBe('apteka');
  });

  it('tytuł bez wielkiej litery po nim albo „med” bez kropki nie jest osobą', () => {
    expect(nazwaMiejsca(poi('przychodnia', 'Centrum Med Plus'), imiona)).toBe('Centrum Med Plus');
    expect(nazwaMiejsca(poi('apteka', 'Apteka dr w centrum'), imiona)).toBe('Apteka dr w centrum');
    expect(nazwaMiejsca(poi('apteka', 'Drogerie Polskie'), imiona)).toBe('Drogerie Polskie');
    expect(nazwaMiejsca(poi('przychodnia', 'Przychodnia Lekarska'), imiona)).toBe('Przychodnia Lekarska');
  });

  it('granice filtra: te przypadki zostają i są opisane w nagłówku kronika.ts jako znane luki', () => {
    // bez słownika nazwisk i odmiany nie ma jak ich odróżnić od marek
    const zostaje: [string, string][] = [
      ['sklep', 'Jubiler Monika'], // samo imię
      ['sklep', 'Roland'],
      ['spozywczy', 'Mielnik'], // samo nazwisko
      ['sklep', 'PHU J. Nowak'], // inicjał i nazwisko ("E. Leclerc" to marka)
      ['spozywczy', 'E. Leclerc'],
      ['przychodnia', 'Gabinet Anna-Maria Nowak'], // imię złożone
      ['przychodnia', 'Nowak Jan'], // odwrócona kolejność
      ['przychodnia', 'Zakład Piotra Nowaka'], // dopełniacz
      ['przychodnia', 'Gabinet Anny Nowak'],
      ['sklep', 'JAN NOWAK'], // wielkie litery
      ['sklep', 'Hair Studio Kasia Nowak'], // zdrobnienie spoza listy PESEL
      ['spozywczy', 'Gzella'], // samo nazwisko
      ['kosciol', 'Parafia św. Józefa'], // patron bez „im.”
      ['szkola', 'Zespół Szkół Adama Mickiewicza'], // patron bez „im.”
      ['sklep', 'jan nowak'], // małe litery
    ];
    for (const [c, n] of zostaje) expect(nazwaMiejsca(poi(c, n), imiona), n).toBe(n);
    // odwrotnie, koszt filtra: marka zaczynająca się od imienia z listy i wielkiej litery też zamienia się na opis
    expect(nazwaMiejsca(poi('ubrania', 'Hugo Boss'), imiona)).toBe('sklep z ubraniami');
    expect(nazwaMiejsca(poi('ubrania', 'Max Mara'), imiona)).toBe('sklep z ubraniami');
    // patron bez „im.” wpada tylko wtedy, gdy jego imię samo jest na liście: „Jana” to też żeńskie imię w PESEL
    expect(nazwaMiejsca(poi('szkola', 'Szkoła Podstawowa Jana Pawła II'), imiona)).toBe('placówka oświatowa');
  });

  it('adres w nazwie zamienia nazwę na opis kategorii (R50): numer domu po słowie, „na”, „przy”, „ul.”, „al.”, „os.”', () => {
    const adresy: [string, string, string][] = [
      ['apteka', 'Apteka na Obrońców Wybrzeża 2', 'apteka'],
      ['apteka', 'Apteka przy Lecha Kaczyńskiego', 'apteka'],
      ['spozywczy', 'Sklep ul. Grunwaldzka 12', 'sklep spożywczy przy bloku'],
      ['spozywczy', 'Sklep Ul. Grunwaldzka', 'sklep spożywczy przy bloku'],
      ['spozywczy', 'Sklep ul.Grunwaldzka', 'sklep spożywczy przy bloku'],
      ['sklep', 'Kiosk al. Zwycięstwa', 'zakład usługowy na rogu'],
      ['przychodnia', 'Przychodnia os. Kolorowe', 'gabinet lekarski'],
      ['przychodnia', 'Gabinet przy ulicy Długiej', 'gabinet lekarski'],
      ['przychodnia', 'KEN 50', 'gabinet lekarski'],
      ['spozywczy', 'Grunwaldzka 12a', 'sklep spożywczy przy bloku'],
      ['spozywczy', 'Lokal Długa 5/7', 'sklep spożywczy przy bloku'],
      // koszt w bezpieczną stronę, opisany w nagłówku: marki z „na” i numer urzędu pocztowego
      ['ubrania', 'Stare na Nowo', 'sklep z ubraniami'],
      ['sklep', 'Okno na Świat', 'zakład usługowy na rogu'],
      ['urzad', 'FUP Gdańsk 53', 'punkt osiedlowy'],
    ];
    for (const [c, n, opis] of adresy) expect(nazwaMiejsca(poi(c, n), imiona), n).toBe(opis);
    // numer instytucji, godziny i liczby bez słowa przed nimi to nie adres; „na” z małej litery po nim też nie
    const zostaje: [string, string][] = [
      ['szkola', 'Szkoła Podstawowa nr 12'],
      ['szkola', 'Szkoła Podstawowa Nr 44'],
      ['szkola', 'Przedszkole Specjalne Nr 72 o Profilu Terapeutycznym'],
      ['szkola', 'Zespół Szkolno-Przedszkolny nr 1 w Gdańsku'],
      ['apteka', 'Apteka 24h'],
      ['biblioteka', 'Biblioteka na fali'],
      ['ubrania', '5 10 15'],
      ['ubrania', 'Z 2 Ręki'],
      ['przychodnia', '7 Góra Med'],
      ['apteka', 'Apteka Na Zdrowie'],
      ['apteka', 'Apteka Pod Lwem'],
    ];
    for (const [c, n] of zostaje) expect(nazwaMiejsca(poi(c, n), imiona), n).toBe(n);
  });

  it('kroniki dem nie niosą adresu w nazwie miejsca ani w tekście', () => {
    const adres = (t: string): boolean =>
      [...t.matchAll(/(\p{L}{2,})\.?\s+(\d{1,4}\p{L}?(?:\/\d+)?)(?![\p{L}\p{N}])/gu)].some(
        (m) => !/^(nr|no|numer)$/i.test(m[1]) && !/^(19|20)\d\d$/.test(m[2]) && !/^\d+h$/i.test(m[2]),
      ) || /(?:^|[^\p{L}])(?:na|przy|ul\.?|al\.?|os\.?)\s+\p{Lu}/u.test(t);
    for (const o of DEMA) {
      for (const z of ziarna) {
        for (const w of kronika(o.geo, o.budynki, imiona, z)) {
          if (w.miejsce) expect(adres(w.miejsce), w.miejsce).toBe(false);
        }
      }
    }
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
    // adresy w nazwach (R50)
    expect(przymorze).toContain('Apteka na Obrońców Wybrzeża 2');
    expect(lanciego).toContain('KEN 50');
    for (const marka of ['Żabka', 'Biedronka', 'Rossmann', 'Szkoła Podstawowa nr 79', 'PKO BP', 'Orlen'])
      expect(przymorze, marka).not.toContain(marka);
    // przy szkołach z patronem zmieniona jest tylko nazwa (patron odpada), nigdy cała na opis
    const patroni = LANCIEGO.geo.poi.concat(PRZYMORZE.geo.poi).filter((p) => /\bim\./.test(p.n));
    expect(patroni.length).toBeGreaterThan(3);
    for (const p of patroni) expect(nazwaMiejsca(p, imiona), p.n).toBe(p.n.slice(0, p.n.indexOf(' im.')).trim());
  });
});

describe('nazwaWlasnaMiejsca: nazwa celu wyprawy, pusta tam, gdzie filtr ją zmienił', () => {
  it('nazwa z osobą albo adresem daje pusty napis, nie polski opis kategorii', () => {
    expect(nazwaWlasnaMiejsca(poi('budowlany', 'Usługi Remontowe Jan Nowak'), imiona)).toBe('');
    expect(nazwaWlasnaMiejsca(poi('spozywczy', 'Sławomir Mielnik'), imiona)).toBe('');
    expect(nazwaWlasnaMiejsca(poi('sklep', 'Kwiaciarnia u Moniki'), imiona)).toBe('');
    expect(nazwaWlasnaMiejsca(poi('apteka', 'Apteka na Obrońców Wybrzeża 2'), imiona)).toBe('');
  });

  it('marki i instytucje zostają, patron odpada jak w nazwaMiejsca, brak nazwy to pusty napis', () => {
    for (const [c, n] of [
      ['spozywczy', 'Żabka'],
      ['apteka', 'Apteka Pod Lwem'],
      ['szkola', 'Szkoła Podstawowa nr 12'],
      ['szkola', 'Szkoła Podstawowa Nr 44 im. Adama Mickiewicza'],
    ])
      expect(nazwaWlasnaMiejsca(poi(c, n), imiona), n).toBe(nazwaMiejsca(poi(c, n), imiona));
    expect(nazwaWlasnaMiejsca(poi('szkola', 'Szkoła Podstawowa Nr 44 im. Adama Mickiewicza'), imiona)).toBe(
      'Szkoła Podstawowa Nr 44',
    );
    expect(nazwaWlasnaMiejsca(poi('sklep', ''), imiona)).toBe('');
  });
});

describe('nazwaDoOkolicy: nazwy miejsc dla okolicy zarządu', () => {
  it('bez zbioru imion (brak tabel mieszkańców) każda nazwa jest pusta, także zwykła i z osobą', () => {
    const nazwa = nazwaDoOkolicy(null);
    expect(nazwa(poi('spozywczy', 'Żabka'))).toBe('');
    expect(nazwa(poi('spozywczy', 'Sławomir Mielnik'))).toBe('');
    expect(nazwa(poi('budowlany', 'Usługi Remontowe Jan Nowak'))).toBe('');
    expect(nazwa(poi('szkola', 'Szkoła Podstawowa nr 12'))).toBe('');
    expect(nazwa(poi('sklep', ''))).toBe('');
  });

  it('ze zbiorem imion: nazwa z osobą jest pusta, zwykła zostaje (jak nazwaWlasnaMiejsca)', () => {
    const nazwa = nazwaDoOkolicy(imiona);
    expect(nazwa(poi('spozywczy', 'Sławomir Mielnik'))).toBe('');
    expect(nazwa(poi('budowlany', 'Usługi Remontowe Jan Nowak'))).toBe('');
    expect(nazwa(poi('sklep', 'Kwiaciarnia u Moniki'))).toBe('');
    expect(nazwa(poi('spozywczy', 'Żabka'))).toBe('Żabka');
    expect(nazwa(poi('szkola', 'Szkoła Podstawowa Nr 44 im. Adama Mickiewicza'))).toBe('Szkoła Podstawowa Nr 44');
  });

  it('na punktach dema przymorze: z tabelami nazwy z osobą puste, bez tabel wszystkie puste', () => {
    const punkty = demo('przymorze').poi.filter((p) => p.n);
    expect(punkty.some((p) => p.n === 'Sławomir Mielnik')).toBe(true);
    for (const p of punkty) {
      expect(nazwaDoOkolicy(null)(p), p.n).toBe('');
      const z = nazwaDoOkolicy(imiona)(p);
      if (p.n === 'Sławomir Mielnik' || p.n === 'Kwiaciarnia u Moniki') expect(z, p.n).toBe('');
      if (p.n === 'Żabka') expect(z, p.n).toBe('Żabka');
    }
  });
});

describe('nazwaDoOkolicyZDanych: filtr tylko tam, gdzie tabele imion znają ludzi (przegląd gałęzi, I-3)', () => {
  const obca = poi('instalator', 'James Wilson Plumbing');

  it('polska tabela imion nie zna „James”: sam zbiór imion przepuszcza taką nazwę (tego pilnuje niżej reszta)', () => {
    expect(nazwaDoOkolicy(imiona)(obca)).toBe('James Wilson Plumbing');
    expect(nazwaDoOkolicy(imiona)(poi('instalator', 'Hans Müller Sanitär'))).toBe('Hans Müller Sanitär');
  });

  it('szablon krajowy (gmina null: adres poza Polską albo gmina bez tabel): zawsze puste, same kategorie', () => {
    const nazwa = nazwaDoOkolicyZDanych({ gmina: null, imiona: tabeleImion });
    expect(nazwa(obca)).toBe('');
    expect(nazwa(poi('instalator', 'Hans Müller Sanitär'))).toBe('');
    expect(nazwa(poi('instalator', 'Pierre Dubois Plomberie'))).toBe('');
    expect(nazwa(poi('instalator', 'Mohammed Ali Repairs'))).toBe('');
    expect(nazwa(poi('spozywczy', 'Sławomir Mielnik'))).toBe('');
    expect(nazwa(poi('spozywczy', 'Żabka'))).toBe('');
  });

  it('bez danych mieszkańców: puste, jak nazwaDoOkolicy(null)', () => {
    const nazwa = nazwaDoOkolicyZDanych(null);
    for (const p of [obca, poi('spozywczy', 'Żabka'), poi('sklep', '')]) expect(nazwa(p), p.n).toBe('');
  });

  it('gmina z tabelami: filtr jak nazwaDoOkolicy ze zbiorem imion', () => {
    const nazwa = nazwaDoOkolicyZDanych({ gmina: gdansk, imiona: tabeleImion });
    const wzor = nazwaDoOkolicy(imiona);
    expect(nazwa(poi('spozywczy', 'Sławomir Mielnik'))).toBe('');
    expect(nazwa(poi('spozywczy', 'Żabka'))).toBe('Żabka');
    expect(nazwa(poi('szkola', 'Szkoła Podstawowa Nr 44 im. Adama Mickiewicza'))).toBe('Szkoła Podstawowa Nr 44');
    for (const p of demo('przymorze').poi) expect(nazwa(p), p.n).toBe(wzor(p));
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
        // to samo miejsce nie ma dwóch wpisów z tego samego roku
        for (const m of new Set(k.filter((w) => w.miejsce).map((w) => w.miejsce))) {
          const lata = k.filter((w) => w.miejsce === m).map((w) => w.rok);
          expect(new Set(lata).size, `${opis}: ${m}`).toBe(lata.length);
        }
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

  it('jedno miejsce wystarcza na co najmniej pięć wpisów, a każdy ma inne zdarzenie', () => {
    const geo = pusta([poi('przychodnia', 'Centrum Medyczne Batowice', -57, -100)]);
    for (const z of ziarna) {
      const k = kronika(geo, [], imiona, z).filter((w) => w.miejsce);
      expect(k.length, z).toBeGreaterThanOrEqual(5);
      expect(new Set(k.map((w) => w.tekst)).size).toBe(k.length);
      // to samo miejsce nigdy nie ma dwóch wpisów z tego samego roku
      expect(new Set(k.map((w) => w.rok)).size, z).toBe(k.length);
      for (const w of k) expect(w.miejsce).toBe('Centrum Medyczne Batowice');
    }
  });

  it('jedno nazwane POI w obszarze gry (kościół, sklep, szkoła, dowolna kategoria) daje co najmniej pięć wpisów z miejscem', () => {
    const przypadki: [string, string][] = [
      ['kosciol', 'Kościół Świętej Rodziny'],
      ['spozywczy', 'Żabka'],
      ['sklep', 'Rituals'],
      ['szkola', 'Szkoła Podstawowa nr 12'],
      ['szkola', 'Przedszkole nr 59'],
      ['szkola', 'Żłobek nr 68'],
      ['apteka', 'Apteka Pod Lwem'],
      ['przychodnia', 'Baltmed'],
      ['bank', 'PKO BP'],
      ['stacja', 'Orlen'],
      ['biblioteka', 'Biblioteka na fali'],
      ['urzad', 'FUP Gdańsk 53'],
      ['budowlany', 'Tolsen'],
      ['elektronika', 'Vedion'],
      ['ubrania', 'Pepco'],
      ['ogrodnik', 'Kaktus'],
      ['nieznana', 'Port Kosmiczny'],
      ['spozywczy', 'Sławomir Mielnik'],
    ];
    for (const [c, n] of przypadki) {
      const geo = pusta([poi(c, n, 40, -30)]);
      for (const z of ziarna) {
        const k = kronika(geo, [], imiona, z);
        const zMiejscem = k.filter((w) => w.miejsce);
        expect(zMiejscem.length, `${n} / ${z}`).toBeGreaterThanOrEqual(5);
        expect(new Set(zMiejscem.map((w) => w.miejsce)).size, n).toBe(1);
        expect(new Set(zMiejscem.map((w) => w.tekst)).size, n).toBe(zMiejscem.length);
        expect(new Set(zMiejscem.map((w) => w.rok)).size, `${n} / ${z}`).toBe(zMiejscem.length);
        // szablon sprzed odkrycia („nikt jeszcze nie wiedział dlaczego”) nie wypada po wpisie z 2029
        for (const w of zMiejscem)
          if (/nikt jeszcze nie wiedział/.test(w.tekst)) expect(w.rok, w.tekst).toBeLessThan(2029);
        expect(k.length).toBeGreaterThanOrEqual(12);
        expect(k.length).toBeLessThanOrEqual(16);
        expect(k.filter((w) => WZORZEC_KABLI.test(w.tekst)).length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('jedno nazwane POI poza obszarem gry też daje pięć wpisów, a bez żadnego POI miejsc nie ma', () => {
    const daleko = pusta([poi('szkola', 'Szkoła Podstawowa nr 79', -366, 300)]);
    for (const z of ziarna)
      expect(kronika(daleko, [], imiona, z).filter((w) => w.miejsce).length).toBeGreaterThanOrEqual(5);
    for (const z of ziarna) expect(kronika(pusta(), [], imiona, z).filter((w) => w.miejsce)).toEqual([]);
  });

  it('dwa różne miejsca w jednej kategorii dzielą wpisy po równo, nie ma jednego ulubieńca', () => {
    const geo = pusta([
      poi('szkola', 'Szkoła Podstawowa nr 12', 10, 10),
      poi('szkola', 'Szkoła Podstawowa nr 44', 20, 20),
    ]);
    for (const z of ziarna) {
      const k = kronika(geo, [], imiona, z).filter((w) => w.miejsce);
      const liczby = ['Szkoła Podstawowa nr 12', 'Szkoła Podstawowa nr 44'].map(
        (n) => k.filter((w) => w.miejsce === n).length,
      );
      expect(Math.abs(liczby[0] - liczby[1]), z).toBeLessThanOrEqual(1);
      for (const n of ['Szkoła Podstawowa nr 12', 'Szkoła Podstawowa nr 44']) {
        const lata = k.filter((w) => w.miejsce === n).map((w) => w.rok);
        expect(new Set(lata).size, `${z}: ${n}`).toBe(lata.length);
      }
    }
  });

  it('nieznana kategoria POI dostaje zdarzenia ogólne, nie wyjątek', () => {
    const geo = pusta([poi('kosmiczna', 'Port Kosmiczny', 10, 10)]);
    const k = kronika(geo, [], imiona, 'x');
    expect(k.filter((w) => w.miejsce).length).toBeGreaterThanOrEqual(5);
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

  it('prawdziwe nazwy ulic (także od osób) nigdy nie trafiają do tekstu', () => {
    const ulice = [
      'Lecha Kaczyńskiego',
      'Marii Konopnickiej',
      'Adama Mickiewicza',
      'Mickiewicza',
      'Spacerowa',
      'Aleja Zwycięstwa',
      'Jan Kowalski',
    ];
    const geo = pusta(
      [],
      ulice.map((u, i) => wBudynku(u, 10 + i * 20, 10)),
    );
    const zakazane = [
      'Kaczyńskiego',
      'Konopnickiej',
      'Mickiewicza',
      'Lech',
      'Marii',
      'Adama',
      'Spacerowa',
      'Zwycięstwa',
      'Kowalski',
    ];
    for (const z of ziarna) {
      const wszystko = kronika(geo, [], imiona, z)
        .map((w) => `${w.tekst} ${w.miejsce ?? ''}`)
        .join(' ');
      for (const s of zakazane) expect(wszystko, `${z}: ${s}`).not.toContain(s);
    }
  });

  it('mapa z ulicami i mapa bez ulic dają tę samą kronikę (ulice z addr:street nie wchodzą do wyniku)', () => {
    const bez = pusta([poi('szkola', 'Szkoła Podstawowa nr 12', 10, 10)]);
    const z = pusta([poi('szkola', 'Szkoła Podstawowa nr 12', 10, 10)], [wBudynku('Lecha Kaczyńskiego', 10, 10)]);
    for (const ziarno of ziarna)
      expect(kronika(z, [], imiona, ziarno), ziarno).toEqual(kronika(bez, [], imiona, ziarno));
  });

  it('wpisy o ulicach mają ogólny podmiot: główna ulica osiedla, ulica przy bloku i tym podobne', () => {
    const OGOLNE_ULICE = /^(Główna ulica osiedla|Ulica przy bloku|Droga dojazdowa do osiedla|Osiedlowa uliczka):/;
    for (const o of DEMA) {
      for (const z of ziarna) {
        const k = kron(o, z);
        expect(
          k.some((w) => OGOLNE_ULICE.test(w.tekst)),
          `${o.nazwa} / ${z}`,
        ).toBe(true);
        // podmiot przed dwukropkiem to zawsze jedna z czterech ogólnych fraz
        for (const w of k) {
          const przed = w.tekst.match(/^([^.:]*):/);
          if (przed && /ulic|drog/i.test(przed[1])) expect(w.tekst, w.tekst).toMatch(OGOLNE_ULICE);
        }
      }
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

  it('wolnyRok: losuje tylko z wolnych lat okna, a gdy okno jest wyczerpane, bierze najbliższy wolny rok', () => {
    const pierwszy = (): number => 0;
    const ostatni = (ile: number): number => ile - 1;
    // okno [2030, 2033], zajęte 2030 i 2032: do wyboru 2031 i 2033
    expect(wolnyRok(new Set([2030, 2032]), 2030, 2033, pierwszy)).toBe(2031);
    expect(wolnyRok(new Set([2030, 2032]), 2030, 2033, ostatni)).toBe(2033);
    // okno wyczerpane: najpierw rok po oknie, potem przed nim, w rosnącej odległości
    expect(wolnyRok(new Set([2030, 2031, 2032]), 2030, 2032, pierwszy)).toBe(2033);
    expect(wolnyRok(new Set([2030, 2031, 2032, 2033]), 2030, 2032, pierwszy)).toBe(2029);
    expect(wolnyRok(new Set([2029, 2030, 2031, 2032, 2033]), 2030, 2032, pierwszy)).toBe(2034);
    // na końcu zakresu zostaje strona przed oknem, na początku strona po oknie
    expect(wolnyRok(new Set([2049, 2050, 2051]), 2049, 2051, pierwszy)).toBe(2048);
    expect(wolnyRok(new Set([2026, 2027]), 2026, 2027, pierwszy)).toBe(2028);
    // wyczerpane okno nie losuje: wynik nie zależy od funkcji losującej
    expect(wolnyRok(new Set([2030, 2031]), 2030, 2031, pierwszy)).toBe(
      wolnyRok(new Set([2030, 2031]), 2030, 2031, ostatni),
    );
    // wszystkie lata zajęte (nieosiągalne w kronice): początek okna, bez wyjątku
    const wszystkie = new Set(Array.from({ length: 26 }, (_, i) => 2026 + i));
    expect(wolnyRok(wszystkie, 2040, 2042, pierwszy)).toBe(2040);
  });

  // test czasu tylko z ZM_PERF=1: pod równoległym obciążeniem vitest mierzy zegar ściany, nie kod
  // (npm run mieszkancy zawsze wypisuje czasy)
  it.skipIf(!process.env.ZM_PERF)('wydajność: kronika całego dema liczy się w ułamku sekundy', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) kron(PRZYMORZE, `p${i}`);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

// ---------------------------------------------------------------- przeglądarki

describe('src/: wyrażenia regularne działają w starszym Safari', () => {
  /** Wszystkie pliki .ts i .js w src/, rekurencyjnie. */
  function pliki(katalog: string): string[] {
    return fs.readdirSync(katalog, { withFileTypes: true }).flatMap((w) => {
      const p = path.join(katalog, w.name);
      if (w.isDirectory()) return pliki(p);
      return /\.(ts|js|mjs)$/.test(w.name) ? [p] : [];
    });
  }

  it('żaden plik w src/ nie ma lookbehind (`(?<=`, `(?<!`), którego Safari nie zna przed 16.4', () => {
    const wszystkie = pliki(path.join(KORZEN, 'src'));
    expect(wszystkie.length).toBeGreaterThan(20);
    const z = wszystkie
      .filter((p) => /\(\?<[=!]/.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(KORZEN, p));
    expect(z).toEqual([]);
  });
});
