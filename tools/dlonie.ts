/* Pomiar dłoni w klatkach ciosu z PixelLab (cztery postacie zarządu, jedyne z animacją ciosu): gdzie leży dłoń widoczna w
   klatce, a gdzie kładzie ją kod nakładki broni (bron.ts: handOf). Dłoń to plama skóry poza twarzą, w kolorze skóry z
   twarzy klatki stania przodem; z kilku plam wybiera najbliższą dłoni z kodu, więc błąd jest oszacowaniem od dołu.
   Detektor jest szumny (wynik zależy od próbki koloru skóry), więc tabela korekt liczy się dla sześciu wariantów próbki i
   zawiera tylko wpisy, na które zgadza się większość wariantów (zgodnaMediana); reszta to zero. Tabela idzie do
   src/render/art/bronPixellab.ts. Po zmianie postaci albo animacji ciosu przelicz ją i wklej: node tools/dlonie.ts */

import { fileURLToPath } from 'node:url';
import { numerKlatki } from '../src/render/art/animacjePozy.ts';
import { handOf } from '../src/render/art/bron.ts';
import type { KlatkaLudzi, OpisGrafiki, PostacLudzi } from '../src/render/art/pixellab.ts';
import { type Atlas, atlasy } from './atlasy.ts';

type Opis = OpisGrafiki['ludzie'];

/** plama skóry: środek ciężkości w pikselach klatki i liczba pikseli */
export interface Plama {
  x: number;
  y: number;
  n: number;
}

/** jeden pomiar: postać, kierunek, klatka z gry, dłoń z PixelLab i dłonie z kodu (cios, pchnięcie) względem stóp */
export interface Wiersz {
  id: string;
  dir: number;
  f: number;
  pl: [number, number];
  kod: [number, number];
  aim: [number, number];
  /** odległość dłoni z PixelLab od dłoni z kodu (cios) */
  blad: number;
}

export interface TabelaKorekt {
  swing: Record<number, [number, number][]>;
  aim: Record<number, [number, number][]>;
}

export function mediana(a: readonly number[]): number {
  const b = [...a].sort((x, y) => x - y);
  if (!b.length) return Number.NaN;
  return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
}

/**
 * Mediana wartości z wariantów pomiaru, ale tylko gdy jest wiarygodna: co najmniej 3 px i co najmniej pięć z sześciu
 * wariantów (przy mniejszej liczbie wszystkie bez jednego) zgadza się z nią co do znaku, każdy z co najmniej 2 px.
 * Inaczej 0: wynik zależny od próbki koloru skóry to szum detektora, nie przesunięcie postaci. Zaokrągla od zera.
 */
export function zgodnaMediana(wartosci: readonly number[]): number {
  const v = wartosci.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mediana(v);
  if (Math.abs(m) < 3) return 0;
  const zgodne = v.filter((x) => Math.sign(x) === Math.sign(m) && Math.abs(x) >= 2).length;
  return zgodne < v.length - 1 ? 0 : Math.sign(m) * Math.round(Math.abs(m));
}

/** wariant próbki koloru skóry z twarzy: górna część klatki stania przodem i sposób wyboru koloru */
export interface Wariant {
  frakcja: number;
  tryb: 'czeste' | 'srednia';
}

export const WARIANTY: readonly Wariant[] = [0.25, 0.33, 0.4].flatMap((frakcja) =>
  (['czeste', 'srednia'] as const).map((tryb) => ({ frakcja, tryb })),
);

const rgb = (p: number): [number, number, number] => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255];
/** luźny test skóry: ciepły, jasny odcień (czerwień nad zielenią nad niebieskim) */
const skornyOdcien = (c: readonly number[]): boolean => c[0] > c[1] && c[1] > c[2] && c[0] - c[2] > 30 && c[0] > 110;
const odleglosc = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Plamy skóry w klatce [x, y, w, h] atlasu (kolor skóry `skora` z twarzy, odległość RGB do 60): twarz to najwyższa
 * plama z co najmniej 8 pikselami, dłonie to pozostałe plamy z co najmniej 2 pikselami (8 sąsiadów), od najwyższej.
 */
export function plamySkory(
  px: Uint32Array,
  szer: number,
  [x0, y0, w, h]: readonly number[],
  skora: readonly number[],
): { twarz: Plama | null; dlonie: Plama[] } {
  const maska = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const p = px[(y0 + r) * szer + x0 + c];
      if (p >>> 24 && skornyOdcien(rgb(p)) && odleglosc(rgb(p), skora) < 60) maska[r * w + c] = 1;
    }
  const odwiedzone = new Uint8Array(w * h);
  const plamy: (Plama & { ymin: number })[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!maska[i] || odwiedzone[i]) continue;
    const p = { x: 0, y: 0, n: 0, ymin: h };
    odwiedzone[i] = 1;
    for (let stos = [i], j = stos.pop(); j !== undefined; j = stos.pop()) {
      const jx = j % w;
      const jy = (j - jx) / w;
      p.n++;
      p.x += jx;
      p.y += jy;
      p.ymin = Math.min(p.ymin, jy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = jx + dx;
          const ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (maska[q] && !odwiedzone[q]) {
            odwiedzone[q] = 1;
            stos.push(q);
          }
        }
    }
    plamy.push({ ...p, x: p.x / p.n, y: p.y / p.n });
  }
  plamy.sort((a, b) => a.ymin - b.ymin);
  const twarz = plamy.find((p) => p.n >= 8) ?? null;
  const dlonie = plamy.filter((p) => p !== twarz && p.n >= 2).map(({ x, y, n }) => ({ x, y, n }));
  return { twarz: twarz ? { x: twarz.x, y: twarz.y, n: twarz.n } : null, dlonie };
}

/** kolor skóry z twarzy: w górnej części klatki stania przodem najczęstszy skórny kolor albo średnia skórnych */
function kolorSkory(p: PostacLudzi, px: Uint32Array, szer: number, wariant: Wariant): number[] | null {
  const przod = p.animacje.stanie.kierunki[0];
  if (!Array.isArray(przod)) return null;
  const [x0, y0, w, h] = przod[0];
  const licz = new Map<number, number>();
  const suma = [0, 0, 0];
  let n = 0;
  for (let r = 0; r < Math.floor(h * wariant.frakcja); r++)
    for (let c = 0; c < w; c++) {
      const s = px[(y0 + r) * szer + x0 + c];
      if (!(s >>> 24) || !skornyOdcien(rgb(s))) continue;
      licz.set(s, (licz.get(s) ?? 0) + 1);
      const [cr, cg, cb] = rgb(s);
      suma[0] += cr;
      suma[1] += cg;
      suma[2] += cb;
      n++;
    }
  if (!n) return null;
  if (wariant.tryb === 'srednia') return suma.map((v) => v / n);
  const najczestszy = [...licz.entries()].sort((a, b) => b[1] - a[1])[0];
  return rgb(najczestszy[0]);
}

/** klatka animacji postaci dla kierunku pionka: numer kierunku zamiast klatek to odbicie tamtego kierunku */
function klatkiKierunku(p: PostacLudzi, klucz: string, dir: number): { klatki: KlatkaLudzi[]; flip: boolean } {
  let k = p.animacje[klucz].kierunki[dir];
  let flip = false;
  if (typeof k === 'number') {
    flip = true;
    k = p.animacje[klucz].kierunki[k];
  }
  return { klatki: k as KlatkaLudzi[], flip };
}

/** pomiar dłoni dla każdej postaci zarządu z ciosem, kierunków 0 (przód), 1 (tył), 3 (wschód) i klatek ciosu z gry 0 do 2 */
export function pomiarDloni(opis: Opis, px: Uint32Array, szer: number, wariant: Wariant = WARIANTY[2]): Wiersz[] {
  const wiersze: Wiersz[] = [];
  for (const p of opis.postacie) {
    if (!p.zarzad || !p.animacje.cios || !p.animacje.stanie) continue;
    const skora = kolorSkory(p, px, szer, wariant);
    if (!skora) continue;
    for (const dir of [0, 1, 3])
      for (let f = 0; f < 3; f++) {
        const { klatki, flip } = klatkiKierunku(p, 'cios', dir);
        const [x, y, w, h, ax, ay] = klatki[numerKlatki('swing', f, false, 0, klatki.length)];
        const { dlonie } = plamySkory(px, szer, [x, y, w, h], skora);
        // względem stóp pionka (ax, ay), po odbiciu x liczony od prawej krawędzi klatki
        const wzgledem = (d: Plama): [number, number] => [flip ? w - ax - d.x - 1 : d.x - ax, d.y - ay];
        const reka = handOf('swing', dir, f);
        const kod: [number, number] = [reka.x - 16, reka.y - 45];
        const aimReka = handOf('aim', dir, Math.min(f, 1));
        let pl: [number, number] = [0, 0];
        let blad = Number.POSITIVE_INFINITY;
        for (const d of dlonie) {
          const r = wzgledem(d);
          const e = Math.hypot(r[0] - kod[0], r[1] - kod[1]);
          if (e < blad) {
            blad = e;
            pl = r;
          }
        }
        wiersze.push({ id: p.id, dir, f, pl, kod, aim: [aimReka.x - 16, aimReka.y - 45], blad });
      }
  }
  return wiersze;
}

/**
 * Tabela korekt z pomiarów w kilku wariantach: dla każdego kierunku i klatki mediana po postaciach (osobno dla
 * wariantu) różnic dłoń z PixelLab minus dłoń z kodu, a z wariantów zgodnaMediana. Cios ma klatki 0 do 2, pchnięcie
 * (dłoń z kodu z pozy celowania) klatki 0 i 1.
 */
export function tabelaKorekt(pomiary: readonly (readonly Wiersz[])[]): TabelaKorekt {
  const tab: TabelaKorekt = { swing: {}, aim: {} };
  for (const dir of [0, 1, 3]) {
    tab.swing[dir] = [];
    tab.aim[dir] = [];
    for (let f = 0; f < 3; f++) {
      const wg = pomiary.map((wiersze) => wiersze.filter((r) => r.dir === dir && r.f === f && Number.isFinite(r.blad)));
      const korekta = (reka: (r: Wiersz) => [number, number]): [number, number] => [
        zgodnaMediana(wg.map((w) => mediana(w.map((r) => r.pl[0] - reka(r)[0])))),
        zgodnaMediana(wg.map((w) => mediana(w.map((r) => r.pl[1] - reka(r)[1])))),
      ];
      tab.swing[dir].push(korekta((r) => r.kod));
      if (f < 2) tab.aim[dir].push(korekta((r) => r.aim));
    }
  }
  return tab;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wynik = atlasy();
  const opis = (wynik.get('grafika.json') as OpisGrafiki).ludzie;
  const atlas = wynik.get(opis.plik) as Atlas;
  const px = new Uint32Array(atlas.rgba.buffer.slice(0));
  const pomiary = WARIANTY.map((w) => pomiarDloni(opis, px, atlas.w, w));
  for (const r of pomiary[2])
    console.log(
      `${r.id.replace('kotwica-', '')} d${r.dir} f${r.f}: kod (${r.kod}) dłoń z PixelLab (${r.pl.map((v) => v.toFixed(0))}) błąd ${r.blad.toFixed(1)} px`,
    );
  const bledy = pomiary[2].map((r) => r.blad).filter(Number.isFinite);
  console.log(
    `\nklatek ${bledy.length}, mediana błędu ${mediana(bledy).toFixed(1)} px, w 4 px: ${bledy.filter((b) => b <= 4).length}`,
  );
  const tab = tabelaKorekt(pomiary);
  const fmt = (t: [number, number][]) => t.map(([x, y]) => `[${x}, ${y}]`).join(', ');
  for (const dir of [0, 1, 3])
    console.log(`cios ${dir}: ${fmt(tab.swing[dir])}   pchnięcie ${dir}: ${fmt(tab.aim[dir])}`);
}
