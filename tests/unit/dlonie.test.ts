import { describe, expect, it } from 'vitest';
import { korektaDloni } from '../../src/render/art/bronPixellab.ts';
import type { OpisGrafiki } from '../../src/render/art/pixellab.ts';
import { type Atlas, atlasy } from '../../tools/atlasy.ts';
import { mediana, plamySkory, pomiarDloni, tabelaKorekt, WARIANTY, zgodnaMediana } from '../../tools/dlonie.ts';

const piksel = (r: number, g: number, b: number): number => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const SKORA = piksel(220, 160, 130);
const KURTKA = piksel(40, 60, 120);

describe('mediana', () => {
  it('środkowa wartość, przy parzystej liczbie średnia dwóch środkowych, bez zmiany tablicy', () => {
    const a = [5, 1, 3];
    expect(mediana(a)).toBe(3);
    expect(a).toEqual([5, 1, 3]);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([7])).toBe(7);
  });
});

describe('zgodna mediana wariantów pomiaru', () => {
  it('bierze medianę, gdy prawie wszystkie warianty zgadzają się co do znaku i rzędu wielkości, zaokrągla od zera', () => {
    expect(zgodnaMediana([10, 11, 5, 14, 8, 14])).toBe(11);
    expect(zgodnaMediana([-12, -11, -12, -11, -13, -11])).toBe(-12);
    expect(zgodnaMediana([-9, -9, -11, -9, -11, -10])).toBe(-10);
  });

  it('zeruje wpis mały (poniżej 3 px) albo niezgodny: mediana zależna od wariantu to szum detektora', () => {
    expect(zgodnaMediana([2, 1, 2, 1, 1, 2])).toBe(0);
    expect(zgodnaMediana([-4, -1, 4, -1, 4, 0])).toBe(0);
    // pięć z sześciu wariantów musi zgadzać się co do znaku (i mieć co najmniej 2 px)
    expect(zgodnaMediana([-2, -9, -1, -6, -1, -5])).toBe(0);
    expect(zgodnaMediana([4, 5, -1, 8, 2, 8])).toBe(5);
  });
});

describe('plamy skóry w klatce', () => {
  it('twarz to najwyższa duża plama, dłonie to pozostałe, kurtka i tło nie są skórą', () => {
    const w = 20;
    const h = 30;
    const px = new Uint32Array(w * h);
    const plama = (x0: number, y0: number, dx: number, dy: number, kolor: number) => {
      for (let y = y0; y < y0 + dy; y++) for (let x = x0; x < x0 + dx; x++) px[y * w + x] = kolor;
    };
    plama(7, 1, 5, 5, SKORA); // twarz
    plama(4, 8, 12, 12, KURTKA); // tułów
    plama(1, 14, 2, 2, SKORA); // dłoń z lewej
    plama(16, 20, 2, 2, SKORA); // dłoń z prawej, niżej
    const { twarz, dlonie } = plamySkory(px, w, [0, 0, w, h], [220, 160, 130]);
    expect(twarz).toMatchObject({ n: 25, x: 9, y: 3 });
    expect(dlonie.map((d) => [d.x, d.y, d.n])).toEqual([
      [1.5, 14.5, 4],
      [16.5, 20.5, 4],
    ]);
  });

  it('plama odległa kolorem od skóry z twarzy nie jest dłonią (próg koloru), a pojedynczy piksel to szum', () => {
    const w = 10;
    const h = 10;
    const px = new Uint32Array(w * h);
    for (let y = 0; y < 4; y++) for (let x = 3; x < 7; x++) px[y * w + x] = SKORA;
    px[7 * w + 1] = SKORA;
    for (let y = 6; y < 8; y++) for (let x = 6; x < 8; x++) px[y * w + x] = piksel(120, 80, 20);
    const { twarz, dlonie } = plamySkory(px, w, [0, 0, w, h], [220, 160, 130]);
    expect(twarz?.n).toBe(16);
    expect(dlonie).toEqual([]);
  });
});

describe('pomiar dłoni w prawdziwych klatkach ciosu zarządu', () => {
  const wynik = atlasy();
  const opis = (wynik.get('grafika.json') as OpisGrafiki).ludzie;
  const atlas = wynik.get(opis.plik) as Atlas;
  const px = new Uint32Array(atlas.rgba.buffer.slice(0));
  const wiersze = pomiarDloni(opis, px, atlas.w);

  it('mierzy cztery postaci zarządu w trzech kierunkach i trzech klatkach ciosu', () => {
    expect(new Set(wiersze.map((r) => r.id)).size).toBe(4);
    expect(wiersze.length).toBe(4 * 3 * 3);
    for (const r of wiersze) expect(Number.isFinite(r.blad), `${r.id} ${r.dir} ${r.f}`).toBe(true);
  });

  const tab = tabelaKorekt(WARIANTY.map((w) => pomiarDloni(opis, px, atlas.w, w)));

  it('tabela korekt w bronPixellab.ts to wynik pomiaru z narzędzia (po zmianie postaci albo ciosu przelicz tabelę)', () => {
    for (const dir of [0, 1, 3]) {
      for (let f = 0; f < 3; f++) expect(korektaDloni('swing', dir, f), `cios ${dir} ${f}`).toEqual(tab.swing[dir][f]);
      for (let f = 0; f < 2; f++) expect(korektaDloni('aim', dir, f), `pchnięcie ${dir} ${f}`).toEqual(tab.aim[dir][f]);
    }
  });

  it('korekta zbija błąd tam, gdzie jest niezerowa: mediana odległości dłoni spada dla ciosu i pchnięcia', () => {
    let skorygowanych = 0;
    for (const dir of [0, 1, 3])
      for (let f = 0; f < 3; f++) {
        const w = wiersze.filter((r) => r.dir === dir && r.f === f);
        const cios = korektaDloni('swing', dir, f);
        if (cios[0] || cios[1]) {
          skorygowanych++;
          const przed = mediana(w.map((r) => Math.hypot(r.pl[0] - r.kod[0], r.pl[1] - r.kod[1])));
          const po = mediana(w.map((r) => Math.hypot(r.pl[0] - r.kod[0] - cios[0], r.pl[1] - r.kod[1] - cios[1])));
          expect(po, `cios ${dir} ${f}`).toBeLessThan(przed);
        }
        const pchniecie = f < 2 ? korektaDloni('aim', dir, f) : [0, 0];
        if (pchniecie[0] || pchniecie[1]) {
          skorygowanych++;
          const przed = mediana(w.map((r) => Math.hypot(r.pl[0] - r.aim[0], r.pl[1] - r.aim[1])));
          const po = mediana(
            w.map((r) => Math.hypot(r.pl[0] - r.aim[0] - pchniecie[0], r.pl[1] - r.aim[1] - pchniecie[1])),
          );
          expect(po, `pchnięcie ${dir} ${f}`).toBeLessThan(przed);
        }
      }
    // trzy wpisy ciosu i cztery pchnięcia: tabela nie jest pusta
    expect(skorygowanych).toBe(7);
  });
});
