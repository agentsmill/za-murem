import { describe, expect, it } from 'vitest';
import { SRODEK_LEZACEGO } from '../../src/render/art/animacjePozy.ts';
import {
  kierunkiAnimacji,
  klatkiAnimacji,
  koloryUbrania,
  kotwicaKlatki,
  kotwicaPrzejscia,
  przytnij,
  stopyWzgledne,
} from '../../tools/ludzie.ts';

/** obraz w×h z prostokątem widocznych pikseli (x0, y0, x1, y1 włącznie) o danym kolorze */
function obraz(w: number, h: number, r: [number, number, number, number], kolor = [200, 10, 10]) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = r[1]; y <= r[3]; y++)
    for (let x = r[0]; x <= r[2]; x++) rgba.set([kolor[0], kolor[1], kolor[2], 255], (y * w + x) * 4);
  return { w, h, rgba };
}

describe('przycięcie klatki do sylwetki (tools/ludzie.ts)', () => {
  it('daje najmniejszy prostokąt widocznych pikseli i ich kolory', () => {
    const k = przytnij(obraz(10, 10, [3, 2, 6, 7], [1, 2, 3]));
    expect([k.x, k.y, k.w, k.h]).toEqual([3, 2, 4, 6]);
    expect(k.rgba).toHaveLength(4 * 6 * 4);
    expect([...k.rgba.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
  });

  it('pusta klatka daje prostokąt 0×0', () => {
    const k = przytnij({ w: 5, h: 5, rgba: new Uint8Array(100) });
    expect([k.w, k.h]).toEqual([0, 0]);
  });
});

describe('kotwica stóp animacji', () => {
  it('stopy statycznej postaci to wiersz pod jej najniższym pikselem liczony od środka płótna', () => {
    // płótno 48, stopy w wierszu 45 (wiersz pod nimi 46): 46 − 24 = 22 pod środkiem
    expect(stopyWzgledne(obraz(48, 48, [10, 3, 30, 45]))).toBe(22);
    expect(stopyWzgledne(obraz(40, 40, [10, 3, 30, 35]))).toBe(16);
  });

  it('klatka na większym płótnie ma stopy w tym samym miejscu względem środka, niezależnie od rekwizytu pod nimi', () => {
    const rel = 22;
    // płótno 68: postać na środku, stopy w wierszu 55 (wiersz pod nimi 56 = 34 + 22), głowa od wiersza 10
    const stoi = przytnij(obraz(68, 68, [28, 10, 40, 55]));
    expect(kotwicaKlatki(rel, 68, stoi.y)).toBe(56 - stoi.y);
    // ta sama postać z siekierą wbitą w ziemię do wiersza 67: klatka jest wyższa, ale kotwica leży w tym samym wierszu płótna
    const zSiekiera = przytnij(obraz(68, 68, [28, 10, 40, 67]));
    expect(zSiekiera.y).toBe(stoi.y);
    expect(kotwicaKlatki(rel, 68, zSiekiera.y)).toBe(56 - zSiekiera.y);
    // to samo płótno 64: środek niżej o 2, kotwica też
    const mniejsze = przytnij(obraz(64, 64, [26, 8, 38, 53]));
    expect(kotwicaKlatki(rel, 64, mniejsze.y)).toBe(54 - mniejsze.y);
  });

  it('klatka bez własnej kotwicy (klęczenie) stoi dolną krawędzią sylwetki w kotwicy', () => {
    const k = przytnij(obraz(48, 48, [10, 3, 30, 40]));
    expect(kotwicaKlatki(22, 48, k.y, 'dol', k.h)).toBe(k.h);
  });
});

describe('kotwica klatki przejścia między staniem a leżeniem (upadek, wstawanie)', () => {
  // przycięta klatka o szerokości 28 i wysokości 20, jej lewa krawędź w kolumnie 10 płótna 48: kolumna środka płótna
  // (24) wypada w kolumnie 14 klatki, czyli dokładnie w jej środku
  const k = { x: 10, w: 28, h: 20 };

  it('stojąca (u = 0): dolna krawędź sylwetki w kotwicy, kolumna środka płótna', () => {
    expect(kotwicaPrzejscia(k, 48, 0)).toEqual([14, 20]);
  });

  it('leżąca (u = 1): środek sylwetki SRODEK_LEZACEGO nad kotwicą, środek jej szerokości', () => {
    expect(kotwicaPrzejscia(k, 48, 1)).toEqual([14, 10 + SRODEK_LEZACEGO]);
  });

  it('klatki pośrednie leżą na prostej między tymi dwiema kotwicami, w liczbach całkowitych', () => {
    const [x, y] = kotwicaPrzejscia(k, 48, 0.5);
    expect([x, y]).toEqual([14, (20 + 10 + SRODEK_LEZACEGO) / 2]);
    // sylwetka przesunięta w płótnie: środek płótna wypada w kolumnie 18 klatki, a jej własny środek w 14
    const przesunieta = { x: 6, w: 28, h: 20 };
    expect(kotwicaPrzejscia(przesunieta, 48, 0)[0]).toBe(18);
    expect(kotwicaPrzejscia(przesunieta, 48, 1)[0]).toBe(14);
    expect(kotwicaPrzejscia(przesunieta, 48, 0.5)[0]).toBe(16);
    for (let i = 0; i <= 10; i++)
      for (const a of kotwicaPrzejscia(przesunieta, 48, i / 10)) expect(Number.isInteger(a), `u ${i / 10}`).toBe(true);
  });

  it('bez skoku na styku: ostatnia klatka wstawania stoi tak jak stanie, pierwsza klatka wstawania leży jak komórka', () => {
    // klatka leżąca o nieparzystej szerokości i wysokości: środek zaokrąglony do liczby całkowitej
    const lezaca = { x: 3, w: 45, h: 17 };
    const [ax, ay] = kotwicaPrzejscia(lezaca, 48, 1);
    expect(Math.abs(ax - lezaca.w / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(ay - (lezaca.h / 2 + SRODEK_LEZACEGO))).toBeLessThanOrEqual(0.5);
    expect(kotwicaPrzejscia({ x: 8, w: 22, h: 41 }, 48, 0)).toEqual([16, 41]);
  });
});

describe('wybór klatek animacji z paczki PixelLab', () => {
  const pliki = (n: number) => Array.from({ length: n }, (_, i) => `frame_${String(i).padStart(3, '0')}.png`);

  it('animacja z opisu (pixminimax) z klatką referencyjną na początku traci ją, szablon zostaje cały', () => {
    expect(klatkiAnimacji(pliki(5), { bezReferencji: true })).toEqual(pliki(5).slice(1));
    expect(klatkiAnimacji(pliki(4), { bezReferencji: true })).toEqual(pliki(4));
    expect(klatkiAnimacji(pliki(5), {})).toEqual(pliki(5));
  });
});

describe('kierunki animacji pionka (0 południe, 1 północ, 2 zachód, 3 wschód)', () => {
  const k = (n: number) => Array.from({ length: n }, (_, i) => `${i}`);

  it('wszystkie cztery własne: każdy kierunek ma swoje klatki', () => {
    const w = kierunkiAnimacji({ south: k(4), north: k(4), west: k(4), east: k(4) });
    expect(w).toEqual([k(4), k(4), k(4), k(4)]);
  });

  it('bez wschodu: wschód to odbicie zachodu (numer kierunku 2)', () => {
    const w = kierunkiAnimacji({ south: k(4), north: k(4), west: k(4) });
    expect(w).toEqual([k(4), k(4), k(4), 2]);
  });

  it('animacja tylko z zachodem (wstawanie): reszta kierunków to odbicie zachodu (numer 2), inne paczki są pomijane', () => {
    expect(kierunkiAnimacji({ west: k(5) }, { tylkoZachod: true })).toEqual([2, 2, k(5), 2]);
    expect(kierunkiAnimacji({ south: k(5), north: k(5), west: k(5) }, { tylkoZachod: true })).toEqual([2, 2, k(5), 2]);
    expect(kierunkiAnimacji({ south: k(5), north: k(5) }, { tylkoZachod: true })).toBeNull();
  });

  it('bez zachodu albo północy animacji nie da się złożyć (null)', () => {
    expect(kierunkiAnimacji({ south: k(4), north: k(4) })).toBeNull();
    expect(kierunkiAnimacji({ south: k(4), west: k(4), east: k(4) })).toBeNull();
    expect(kierunkiAnimacji({ south: k(4) })).toBeNull();
  });

  it('kierunki o różnej liczbie klatek są błędem', () => {
    expect(() => kierunkiAnimacji({ south: k(4), north: k(3), west: k(4), east: k(4) })).toThrow('klatek');
  });
});

describe('kolory ubrania do przemalowania (tools/ludzie.ts)', () => {
  /** postać 10×10: wiersze 0–1 głowa w kolorze włosów (włosy i kurtka dzielą kolor #aa0000), 2–6 tułów, 7–9 buty */
  function postac() {
    const rgba = new Uint8Array(10 * 10 * 4);
    const put = (x: number, y: number, c: [number, number, number]) => rgba.set([...c, 255], (y * 10 + x) * 4);
    for (let x = 0; x < 10; x++) {
      put(x, 0, [0xaa, 0, 0]); // włosy (kolor wspólny z kurtką)
      for (let y = 2; y <= 6; y++) put(x, y, x < 8 ? [0, 0xbb, 0] : [0xaa, 0, 0]); // tułów: zielona kurtka, 2 kolumny czerwonych szwów
      put(x, 8, [0, 0, 0xcc]); // buty
    }
    return { w: 10, h: 10, rgba };
  }

  it('zostawia kolory, których większość pikseli leży na tułowiu, a wspólne z włosami lub butami odrzuca', () => {
    // #00bb00: 40 px na tułowiu, 0 poza; #aa0000: 10 na głowie + 10 na tułowiu (połowa); #0000cc: same buty
    const k = koloryUbrania([postac()], ['#00bb00', '#aa0000', '#0000cc'], [2, 7], 0.6);
    expect(k).toEqual(['#00bb00']);
    // niższy próg przyjmuje też kolor dzielony po połowie
    expect(koloryUbrania([postac()], ['#00bb00', '#aa0000', '#0000cc'], [2, 7], 0.5)).toEqual(['#00bb00', '#aa0000']);
  });

  it('liczy piksele ze wszystkich statycznych kierunków razem i pomija kolory, których w postaci nie ma', () => {
    const k = koloryUbrania([postac(), postac()], ['#00bb00', '#123456'], [2, 7]);
    expect(k).toEqual(['#00bb00']);
  });
});
