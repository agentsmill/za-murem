/* Czytnik SHP i DBF oraz rzutowanie PUWG 1992 z tools/dane/: ręcznie złożone pliki (rekord z dziurą, rekord
   pusty, kodowanie z .cpg, uszkodzenia), liczby odniesienia policzone innym wzorem niż kod i, o ile są surowe
   dane, prawdziwy plik granic rejonów statystycznych BREC 2021. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { doWgs84, zWgs84 } from '../../tools/dane/puwg.ts';
import { SUROWE } from '../../tools/dane/sciezki.ts';
import { kodowanieZCpg, rekordyDbf, uprosc, wielokaty } from '../../tools/dane/shp.ts';
import { wpisZip } from '../../tools/dane/zip.ts';

type Punkt = [number, number];

/** Składa plik SHP typu Polygon bajt po bajcie; rekord null to kształt pusty (typ 0). */
function shpZ(rekordy: (number[][][] | null)[], typPliku = 5): Buffer {
  const tresci = rekordy.map((pierscienie) => {
    if (!pierscienie) return Buffer.alloc(4); // typ 0, kształt pusty
    const punkty = pierscienie.flat();
    const t = Buffer.alloc(44 + 4 * pierscienie.length + 16 * punkty.length);
    t.writeInt32LE(5, 0);
    t.writeDoubleLE(Math.min(...punkty.map((p) => p[0])), 4);
    t.writeDoubleLE(Math.min(...punkty.map((p) => p[1])), 12);
    t.writeDoubleLE(Math.max(...punkty.map((p) => p[0])), 20);
    t.writeDoubleLE(Math.max(...punkty.map((p) => p[1])), 28);
    t.writeInt32LE(pierscienie.length, 36);
    t.writeInt32LE(punkty.length, 40);
    let start = 0;
    pierscienie.forEach((p, i) => {
      t.writeInt32LE(start, 44 + 4 * i);
      start += p.length;
    });
    punkty.forEach((p, i) => {
      t.writeDoubleLE(p[0], 44 + 4 * pierscienie.length + 16 * i);
      t.writeDoubleLE(p[1], 52 + 4 * pierscienie.length + 16 * i);
    });
    return t;
  });
  const calosc = 100 + tresci.reduce((s, t) => s + 8 + t.length, 0);
  const buf = Buffer.alloc(calosc);
  buf.writeInt32BE(9994, 0);
  buf.writeInt32BE(calosc / 2, 24);
  buf.writeInt32LE(1000, 28);
  buf.writeInt32LE(typPliku, 32);
  let poz = 100;
  tresci.forEach((t, i) => {
    buf.writeInt32BE(i + 1, poz);
    buf.writeInt32BE(t.length / 2, poz + 4);
    t.copy(buf, poz + 8);
    poz += 8 + t.length;
  });
  return buf;
}

interface PoleDbf {
  nazwa: string;
  typ: string;
  dl: number;
}

/** Składa plik DBF (wersja 3). Wartości to gotowe bajty pól, żeby test mógł podać kodowanie inne niż UTF-8. */
function dbfZ(pola: PoleDbf[], rekordy: Buffer[][], usuniety: number[] = []): Buffer {
  const dlNaglowka = 32 + 32 * pola.length + 1;
  const dlRekordu = 1 + pola.reduce((s, p) => s + p.dl, 0);
  const buf = Buffer.alloc(dlNaglowka + dlRekordu * rekordy.length + 1, 0x20);
  buf[0] = 3;
  buf.writeUInt32LE(rekordy.length, 4);
  buf.writeUInt16LE(dlNaglowka, 8);
  buf.writeUInt16LE(dlRekordu, 10);
  buf.fill(0, 12, 32);
  pola.forEach((p, i) => {
    const o = 32 + 32 * i;
    buf.fill(0, o, o + 32);
    buf.write(p.nazwa, o, 'latin1');
    buf.write(p.typ, o + 11, 'latin1');
    buf[o + 16] = p.dl;
  });
  buf[dlNaglowka - 1] = 0x0d;
  rekordy.forEach((r, i) => {
    let o = dlNaglowka + dlRekordu * i;
    buf[o++] = usuniety.includes(i) ? 0x2a : 0x20;
    r.forEach((wartosc, k) => {
      wartosc.copy(buf, o, 0, pola[k].dl);
      o += pola[k].dl;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

const tekst = (s: string) => Buffer.from(s, 'utf8');

describe('wielokaty (SHP typu Polygon)', () => {
  const zewn: number[][] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ];
  const dziura: number[][] = [
    [2, 2],
    [4, 2],
    [4, 4],
    [2, 4],
    [2, 2],
  ];
  const trojkat: number[][] = [
    [100.5, 200.25],
    [110.5, 200.25],
    [100.5, 210.75],
    [100.5, 200.25],
  ];

  it('oddaje rekordy w kolejności, pierścienie i punkty [x, y] co do bitu, a kształt pusty jako []', () => {
    const w = wielokaty(shpZ([[zewn, dziura], null, [trojkat]]));
    expect(w).toEqual([[zewn, dziura], [], [trojkat]]);
  });

  it('plik bez rekordów daje pustą listę', () => {
    expect(wielokaty(shpZ([]))).toEqual([]);
  });

  it('odrzuca dane, które nie są SHP typu Polygon albo są uszkodzone', () => {
    const dobry = shpZ([[zewn]]);
    expect(() => wielokaty(Buffer.alloc(50))).toThrow(/SHP/);
    const zlyKod = Buffer.from(dobry);
    zlyKod.writeInt32BE(1234, 0);
    expect(() => wielokaty(zlyKod)).toThrow(/SHP/);
    expect(() => wielokaty(shpZ([[zewn]], 3))).toThrow(/typ/);
    expect(() => wielokaty(dobry.subarray(0, dobry.length - 8))).toThrow(/SHP/);
    const zaDuzoPunktow = Buffer.from(dobry);
    zaDuzoPunktow.writeInt32LE(1_000_000, 100 + 8 + 40);
    expect(() => wielokaty(zaDuzoPunktow)).toThrow(/SHP/);
    const zlyPoczatekPierscienia = Buffer.from(dobry);
    zlyPoczatekPierscienia.writeInt32LE(99, 100 + 8 + 44);
    expect(() => wielokaty(zlyPoczatekPierscienia)).toThrow(/SHP/);
  });
});

describe('rekordyDbf', () => {
  const pola: PoleDbf[] = [
    { nazwa: 'GMINA', typ: 'C', dl: 7 },
    { nazwa: 'REJ', typ: 'C', dl: 6 },
    { nazwa: 'POW', typ: 'N', dl: 10 },
  ];

  it('czyta pola i rekordy, wartości przycięte, kody z zerami z przodu zostają tekstem', () => {
    const dbf = dbfZ(pola, [
      [tekst('2261011'), tekst('182350'), tekst('     12.5')],
      [tekst('12061  '), tekst('002193'), tekst('          ')],
    ]);
    expect(rekordyDbf(dbf)).toEqual([
      { GMINA: '2261011', REJ: '182350', POW: '12.5' },
      { GMINA: '12061', REJ: '002193', POW: '' },
    ]);
  });

  it('dekoduje UTF-8 domyślnie i inne kodowanie na życzenie', () => {
    const pole: PoleDbf[] = [{ nazwa: 'MIASTO', typ: 'C', dl: 8 }];
    const utf8 = dbfZ(pole, [[tekst('Łódź')]]);
    expect(rekordyDbf(utf8)).toEqual([{ MIASTO: 'Łódź' }]);
    const cp1250 = dbfZ(pole, [[Buffer.from([0xa3, 0xf3, 0x64, 0x9f])]]);
    expect(rekordyDbf(cp1250, 'windows-1250')).toEqual([{ MIASTO: 'Łódź' }]);
  });

  it('plik bez rekordów daje pustą listę', () => {
    expect(rekordyDbf(dbfZ(pola, []))).toEqual([]);
  });

  it('odrzuca rekord oznaczony jako usunięty (numeracja SHP i DBF przestałaby się zgadzać) i plik obcięty', () => {
    const dbf = dbfZ(pola, [
      [tekst('2261011'), tekst('182350'), tekst('1')],
      [tekst('2261011'), tekst('182351'), tekst('2')],
    ]);
    expect(() => rekordyDbf(dbfZ(pola, [[tekst('2261011'), tekst('182350'), tekst('1')]], [0]))).toThrow(/usunięty/);
    expect(() => rekordyDbf(dbf.subarray(0, dbf.length - 30))).toThrow(/DBF/);
    expect(() => rekordyDbf(Buffer.alloc(10))).toThrow(/DBF/);
  });

  it('rozpoznaje kodowanie z pliku .cpg', () => {
    expect(kodowanieZCpg(undefined)).toBe('utf-8');
    expect(kodowanieZCpg(Buffer.from(''))).toBe('utf-8');
    expect(kodowanieZCpg(Buffer.from('UTF-8'))).toBe('utf-8');
    expect(kodowanieZCpg(Buffer.from('UTF-8\r\n'))).toBe('utf-8');
    expect(kodowanieZCpg(Buffer.from('1250'))).toBe('windows-1250');
    expect(kodowanieZCpg(Buffer.from('CP1250'))).toBe('windows-1250');
    expect(kodowanieZCpg(Buffer.from('ISO-8859-2'))).toBe('iso-8859-2');
  });
});

describe('PUWG 1992 (EPSG:2180)', () => {
  // Liczby odniesienia: szereg Snydera (inny wzór niż szereg Krügera w kodzie) i całka z łuku południka
  // policzona kwadraturą Simpsona (python3, GRS80), dla punktów dema i dwóch krańców kraju.
  const PUNKTY: { nazwa: string; lat: number; lon: number; x: number; y: number }[] = [
    { nazwa: 'Przymorze', lat: 54.4093, lon: 18.5991, x: 473987.5239, y: 727326.698 },
    { nazwa: 'Lanciego', lat: 52.144625, lon: 21.0579432, x: 640773.4739, y: 477386.6888 },
    { nazwa: 'Zielonki', lat: 50.1125175, lon: 20.02278, x: 573105.8048, y: 249975.7186 },
    { nazwa: 'Szczecin', lat: 53.4285, lon: 14.5528, x: 204684.7036, y: 627375.0241 },
    { nazwa: 'Przemyśl', lat: 49.7838, lon: 22.7678, x: 771122.4021, y: 219749.82 },
  ];

  it('x to wschód (SHP), więc na południku środkowym wynosi 500 000', () => {
    expect(zWgs84(52, 19)[0]).toBeCloseTo(500000, 3);
    expect(zWgs84(54.4093, 19)[0]).toBeCloseTo(500000, 3);
  });

  it('y to północ przesunięta o −5 300 000: równik i łuk południka do 52°N', () => {
    expect(zWgs84(0, 19)[1]).toBeCloseTo(-5300000, 3);
    expect(zWgs84(52, 19)[1]).toBeCloseTo(459309.2094, 2);
    expect(zWgs84(54.4093, 19)[1]).toBeCloseTo(727252.6922, 2);
  });

  it.each(PUNKTY)('$nazwa: współrzędne zgadzają się z liczbą odniesienia co do 2 mm', (p) => {
    const [x, y] = zWgs84(p.lat, p.lon);
    expect(Math.abs(x - p.x)).toBeLessThan(0.002);
    expect(Math.abs(y - p.y)).toBeLessThan(0.002);
    const [lat, lon] = doWgs84(p.x, p.y);
    expect(Math.abs(lat - p.lat)).toBeLessThan(1e-8);
    expect(Math.abs(lon - p.lon)).toBeLessThan(1e-8);
  });

  it.each(PUNKTY)('$nazwa: rzutowanie tam i z powrotem wraca do punktu z dokładnością 1e-7°', (p) => {
    const [lat, lon] = doWgs84(...zWgs84(p.lat, p.lon));
    expect(Math.abs(lat - p.lat)).toBeLessThan(1e-7);
    expect(Math.abs(lon - p.lon)).toBeLessThan(1e-7);
  });
});

/** Odległość punktu od odcinka. */
function odlOdOdcinka(p: Punkt, a: Punkt, b: Punkt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl2 = dx * dx + dy * dy;
  const t = dl2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dl2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

describe('uprosc (Douglas–Peucker)', () => {
  it('kwadrat z dodatkowymi punktami współliniowymi zostaje z 5 punktami', () => {
    const kwadrat: Punkt[] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [5, 10],
      [0, 10],
      [0, 5],
      [0, 0],
    ];
    expect(uprosc(kwadrat, 0.5)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it('gubi wypukłość mniejszą od tolerancji, zachowuje większą, a pierścień zostaje zamknięty', () => {
    const pierscien: Punkt[] = [
      [0, 0],
      [50, 0.8], // 0,8 m od boku
      [100, 0],
      [100, 100],
      [50, 106], // 6 m od boku
      [0, 100],
      [0, 0],
    ];
    expect(uprosc(pierscien, 2)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
      [50, 106],
      [0, 100],
      [0, 0],
    ]);
    // przy tolerancji 0 nie ma czego wyrzucać: żaden punkt nie jest dokładnie współliniowy
    expect(uprosc(pierscien, 0)).toEqual(pierscien);
  });

  it('każdy punkt wejścia leży najwyżej tolerancję od wyniku, a wynik składa się z punktów wejścia', () => {
    // okrąg z szumem, startujący w dowolnym miejscu
    const wejscie: Punkt[] = [];
    for (let i = 0; i < 500; i++) {
      const kat = (i / 500) * 2 * Math.PI;
      const r = 1000 + 3 * Math.sin(40 * kat);
      wejscie.push([r * Math.cos(kat), r * Math.sin(kat)]);
    }
    wejscie.push(wejscie[0]);
    const tol = 5;
    const wynik = uprosc(wejscie, tol);
    expect(wynik.length).toBeLessThan(wejscie.length);
    expect(wynik.length).toBeGreaterThanOrEqual(4);
    expect(wynik[0]).toEqual(wynik[wynik.length - 1]);
    for (const p of wynik) expect(wejscie).toContainEqual(p);
    for (const p of wejscie) {
      let najblizej = Number.POSITIVE_INFINITY;
      for (let i = 0; i + 1 < wynik.length; i++)
        najblizej = Math.min(najblizej, odlOdOdcinka(p, wynik[i], wynik[i + 1]));
      expect(najblizej).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it('pierścień mniejszy od tolerancji albo krótszy niż 4 punkty zostaje bez zmian', () => {
    const maly: Punkt[] = [
      [0, 0],
      [0.4, 0],
      [0.4, 0.4],
      [0, 0.4],
      [0, 0],
    ];
    expect(uprosc(maly, 5)).toEqual(maly);
    const trzy: Punkt[] = [
      [0, 0],
      [1, 1],
      [0, 0],
    ];
    expect(uprosc(trzy, 5)).toEqual(trzy);
    expect(uprosc([], 5)).toEqual([]);
  });

  it('nie zmienia tablicy wejściowej', () => {
    const wejscie: Punkt[] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ];
    const kopia = structuredClone(wejscie);
    uprosc(wejscie, 1);
    expect(wejscie).toEqual(kopia);
  });
});

/* Prawdziwe granice rejonów statystycznych BREC 2021 (124 MB w ZIP, 256 MB samego SHP). */
const REJ_ZIP = path.join(SUROWE, 'gus/brec2021-granice-rejonow-obwodow/SU_BREC_2021_REJ.zip');

/** Punkt w wielokącie, reguła parzystości po wszystkich pierścieniach (dziury działają same). */
function wewnatrz(x: number, y: number, pierscienie: number[][][]): boolean {
  let w = false;
  for (const p of pierscienie) {
    for (let i = 0; i + 1 < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[i + 1];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) w = !w;
    }
  }
  return w;
}

describe.skipIf(!fs.existsSync(REJ_ZIP))('BREC 2021, rejony (prawdziwe dane)', () => {
  const zip = () => fs.readFileSync(REJ_ZIP);

  it('DBF ma 35 039 rekordów z polami GMINA i REJ, a kodowanie w .cpg to UTF-8', () => {
    const buf = zip();
    expect(kodowanieZCpg(wpisZip(buf, 'SU_BREC_2021_REJ.cpg'))).toBe('utf-8');
    const rekordy = rekordyDbf(wpisZip(buf, 'SU_BREC_2021_REJ.dbf')!);
    expect(rekordy).toHaveLength(35039);
    expect(Object.keys(rekordy[0])).toEqual(
      expect.arrayContaining(['GMINA', 'REJ', 'WW', 'PP', 'GG', 'R', 'OBJECTID']),
    );
    expect(new Set(rekordy.map((r) => r.REJ)).size).toBe(35039);
  });

  it('SHP ma 35 039 wielokątów, a punkty dema po przeliczeniu z WGS84 trafiają w rejony 182350, 002193 i 398600', () => {
    const buf = zip();
    const rekordy = rekordyDbf(wpisZip(buf, 'SU_BREC_2021_REJ.dbf')!);
    const w = wielokaty(wpisZip(buf, 'SU_BREC_2021_REJ.shp')!);
    expect(w).toHaveLength(35039);
    const szukaj = (lat: number, lon: number) => {
      const [x, y] = zWgs84(lat, lon);
      return rekordy.filter((_, i) => wewnatrz(x, y, w[i]));
    };
    expect(szukaj(54.4093, 18.5991).map((r) => [r.GMINA, r.REJ])).toEqual([['2261011', '182350']]);
    expect(szukaj(52.144625, 21.0579432).map((r) => [r.GMINA, r.REJ])).toEqual([['1465138', '002193']]);
    expect(szukaj(50.1125175, 20.02278).map((r) => [r.GMINA, r.REJ])).toEqual([['1206172', '398600']]);
  });

  it('uproszczony obrys rejonu Przymorza ma mniej punktów i nadal obejmuje punkt dema', () => {
    const buf = zip();
    const rekordy = rekordyDbf(wpisZip(buf, 'SU_BREC_2021_REJ.dbf')!);
    const w = wielokaty(wpisZip(buf, 'SU_BREC_2021_REJ.shp')!);
    const i = rekordy.findIndex((r) => r.REJ === '182350');
    const prosty = w[i].map((p) => uprosc(p as Punkt[], 3));
    const przed = w[i].reduce((s, p) => s + p.length, 0);
    const po = prosty.reduce((s, p) => s + p.length, 0);
    expect(po).toBeLessThan(przed);
    const [x, y] = zWgs84(54.4093, 18.5991);
    expect(wewnatrz(x, y, prosty)).toBe(true);
  });
});
