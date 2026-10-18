/* Atlasy grafiki z PixelLab do public/assets/ (npm run atlasy). Z assets/raw bierze tylko assety ze statusem
   „zatwierdzony” w assets/manifest.json i składa je tak, jak ich potrzebuje gra: kafelki Wanga terenu w kolejności
   narożników, moduły bloku z wybranego kawałka bloku (pas fasady, przęsła, wejście, profil attyki), naklejki dachu
   bez tła papy, trzepak i obsadę postaci po palecie z przemalowaniami ubrań z ramp palety. Opis w grafika.json.
   npm run atlasy -- --sprawdz: tylko sprawdza, czy public/assets jest aktualne (kod wyjścia 1, jeśli nie). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type OpisGrafiki, WERSJA_GRAFIKI } from '../src/render/art/pixellab.ts';
import { decodePng, encodePng } from './png.ts';

export type { OpisGrafiki } from '../src/render/art/pixellab.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
export const WYJSCIE = 'public/assets';

/** kolejność kierunków postaci z PixelLab, od południa zgodnie z zegarem */
export const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];

/** obraz RGBA: w*h*4 bajtów */
export interface Atlas {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** jak z kawałka bloku składać fasady (manifest, kotwica-blok.moduly), prostokąty w pikselach pliku */
interface Moduly {
  attyka: [number, number, number, number];
  fasada: { y: number; gora: number; pietro: [number, number]; dol: [number, number] };
  przesla: [number, number];
  wejscie: [number, number];
  drzwi: number;
}

/** dach z kafelków papy (kotwica-blok-dach.uzycie) */
interface Dach {
  tlo: string;
  szwy: [number, number];
  naklejki: number[];
  wnetrze: [number, number, number, number];
  gestosc: number;
}

/** kolory ubrania postaci do przemalowania i wiersze, w których leżą */
interface Przemalowanie {
  kolory: string[];
  wiersze: [number, number];
}

interface Asset {
  id: string;
  co: string;
  status: string;
  wybrany?: string;
  moduly?: Moduly;
  uzycie?: Dach;
  przemalowanie?: Przemalowanie;
}

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: Asset[];
}

interface Paleta {
  kolory: string[];
  rampy: Record<string, string[]>;
}

interface WangTile {
  corners: Record<'NW' | 'NE' | 'SW' | 'SE', 'upper' | 'lower'>;
  bounding_box: { x: number; y: number };
}

const file = (rel: string) => fs.readFileSync(path.join(ROOT, rel));
const json = <T>(rel: string) => JSON.parse(file(rel).toString('utf8')) as T;

function wczytaj(rel: string): Atlas {
  const { width, height, rgba } = decodePng(file(rel));
  return { w: width, h: height, rgba };
}

const pusty = (w: number, h: number): Atlas => ({ w, h, rgba: new Uint8Array(w * h * 4) });

/** przenosi prostokąt w×h z (sx, sy) obrazu src do (dx, dy) obrazu dst */
function kopiuj(src: Atlas, sx: number, sy: number, w: number, h: number, dst: Atlas, dx: number, dy: number) {
  for (let y = 0; y < h; y++) {
    const i = ((sy + y) * src.w + sx) * 4;
    dst.rgba.set(src.rgba.subarray(i, i + w * 4), ((dy + y) * dst.w + dx) * 4);
  }
}

/** wiersz pod najniższym nieprzezroczystym pikselem */
function stopy(a: Atlas): number {
  for (let y = a.h - 1; y >= 0; y--) for (let x = 0; x < a.w; x++) if (a.rgba[(y * a.w + x) * 4 + 3]) return y + 1;
  return a.h;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

/** jasność koloru #rrggbb */
function jasnosc(c: string): number {
  const n = hex(c);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/**
 * Przemalowanie ubrania na inną rampę palety: najciemniejszy kolor ubrania przechodzi na pierwszy kolor rampy,
 * następny na drugi i tak dalej, tylko w wierszach ubrania. Z kilku postaci z PixelLab robi tłum bez kolejnych
 * generacji.
 */
export function przemaluj(a: Atlas, p: Przemalowanie, rampa: string[]): Atlas {
  const z = [...p.kolory].sort((x, y) => jasnosc(x) - jasnosc(y));
  const mapa = new Map(z.map((c, i) => [hex(c), hex(rampa[Math.min(i, rampa.length - 1)])]));
  const out = Uint8Array.from(a.rgba);
  for (let y = p.wiersze[0]; y < Math.min(a.h, p.wiersze[1]); y++)
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * 4;
      const c = out[i + 3] ? mapa.get((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]) : undefined;
      if (c === undefined) continue;
      out[i] = c >> 16;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
    }
  return { w: a.w, h: a.h, rgba: out };
}

/** kolory skóry, których przemalowanie nie rusza */
const SKORA = new Set(['#1a1c22', '#e0b48c', '#e3b79a']);

/**
 * Ubranie postaci bez opisu w manifeście: najczęstsze kolory tułowia (od 30 do 66% wysokości sylwetki w widoku
 * od południa) bez obrysu, skóry i kolorów głowy (włosy, czapka, cień twarzy), najwyżej cztery.
 */
function ubranie(a: Atlas): Przemalowanie {
  let top = a.h;
  let bottom = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++)
      if (a.rgba[(y * a.w + x) * 4 + 3]) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
  const h = bottom - top;
  const liczby = (y0: number, y1: number) => {
    const n = new Map<string, number>();
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4;
        if (!a.rgba[i + 3]) continue;
        const c = `#${[a.rgba[i], a.rgba[i + 1], a.rgba[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        n.set(c, (n.get(c) ?? 0) + 1);
      }
    return n;
  };
  const glowa = liczby(top, top + Math.round(h * 0.22));
  const kolory = [...liczby(top + Math.round(h * 0.3), top + Math.round(h * 0.66))]
    .filter(([c, n]) => n >= 8 && !SKORA.has(c) && (glowa.get(c) ?? 0) <= 3)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([c]) => c);
  return { kolory, wiersze: [top + Math.round(h * 0.27), top + Math.round(h * 0.75)] };
}

/** wszystkie pliki atlasów: nazwa w public/assets → obraz albo opis (grafika.json) */
export function atlasy(): Map<string, Atlas | OpisGrafiki> {
  const m = json<Manifest>('assets/manifest.json');
  const pal = json<Paleta>('assets/palette.json');
  const asset = (id: string) => {
    const a = m.assety.find((q) => q.id === id);
    if (!a) throw new Error(`atlasy: brak ${id} w manifeście`);
    if (a.status !== 'zatwierdzony') throw new Error(`atlasy: ${id} ma status „${a.status}”, a nie „zatwierdzony”`);
    return a;
  };
  const out = new Map<string, Atlas | OpisGrafiki>();

  // teren: 16 kafelków Wanga 4×4 w kolejności narożników NW NE SW SE (1 = trawnik)
  const teren = asset('kotwica-chodnik-trawa');
  const arkusz = wczytaj('assets/raw/kotwica-chodnik-trawa/tileset.png');
  const meta = json<{ tileset_data: { tiles: WangTile[] } }>('assets/raw/kotwica-chodnik-trawa/metadata.json');
  const kafle = pusty(128, 128);
  const numery = new Set<number>();
  for (const t of meta.tileset_data.tiles) {
    const n = (['NW', 'NE', 'SW', 'SE'] as const).reduce((s, q) => s * 2 + (t.corners[q] === 'upper' ? 1 : 0), 0);
    numery.add(n);
    kopiuj(arkusz, t.bounding_box.x, t.bounding_box.y, 32, 32, kafle, (n % 4) * 32, (n >> 2) * 32);
  }
  if (numery.size !== 16) throw new Error(`atlasy: ${numery.size} różnych kafelków Wanga zamiast 16`);
  out.set('teren.png', kafle);

  // blok: wejście i przęsła obok siebie, pod sobą wiersze gzymsu z górnym piętrem, środkowego piętra i parteru,
  // w ostatniej kolumnie profil attyki
  const blok = asset('kotwica-blok');
  const M = blok.moduly!;
  const kawalek = wczytaj(blok.wybrany!);
  const [wx, ww] = M.wejscie;
  const [px, pw] = M.przesla;
  const f = M.fasada;
  const pasy: [number, number][] = [[f.y, f.gora], f.pietro, f.dol];
  const wys = pasy.reduce((s, [, h]) => s + h, 0);
  const moduly = pusty(ww + pw + 1, Math.max(wys, M.attyka[3]));
  let y = 0;
  for (const [sy, h] of pasy) {
    kopiuj(kawalek, wx, sy, ww, h, moduly, 0, y);
    kopiuj(kawalek, px, sy, pw, h, moduly, ww, y);
    y += h;
  }
  kopiuj(kawalek, M.attyka[0], M.attyka[1], 1, M.attyka[3], moduly, ww + pw, 0);
  out.set('blok.png', moduly);

  // dach: środki wybranych kafelków papy jako naklejki w jednym rzędzie, piksele w kolorze tła przezroczyste
  const dach = asset('kotwica-blok-dach');
  const D = dach.uzycie!;
  const dir = 'assets/raw/kotwica-blok-dach';
  const nr = (s: string) => Number(/(\d+)\.png$/.exec(s)![1]);
  const dachowki = fs
    .readdirSync(path.join(ROOT, dir))
    .filter((s) => s.endsWith('.png'))
    .sort((a, b) => nr(a) - nr(b));
  const [nx, ny, nw, nh] = D.wnetrze;
  if (nw !== nh) throw new Error('atlasy: naklejka dachu powinna być kwadratowa');
  const naklejki = pusty(nw * D.naklejki.length, nh);
  D.naklejki.forEach((k, i) => {
    kopiuj(wczytaj(`${dir}/${dachowki[k]}`), nx, ny, nw, nh, naklejki, i * nw, 0);
  });
  const tlo = hex(D.tlo);
  for (let i = 0; i < naklejki.rgba.length; i += 4) {
    const r = naklejki.rgba;
    if (((r[i] << 16) | (r[i + 1] << 8) | r[i + 2]) === tlo) r.fill(0, i, i + 4);
  }
  out.set('dach.png', naklejki);

  // trzepak tak, jak przyszedł
  const trzepak = asset('kotwica-trzepak');
  const tz = wczytaj('assets/raw/kotwica-trzepak/trzepak.png');
  out.set('trzepak.png', tz);

  // ludzie: wiersz na postać, w nim wersje (oryginał i rampy palety) po 8 kierunków, klatki 48 px; mniejsze płótna
  // dzieci wyrównane do środka i do dołu klatki
  const K = 48;
  const ids = [...m.zarzad, ...m.mieszkancy];
  const rampy = Object.values(pal.rampy);
  const ludzie = pusty(K * DIRS.length * (rampy.length + 1), K * ids.length);
  const postacie = ids.map((id, c) => {
    const a = asset(id);
    const kier = DIRS.map((d) => wczytaj(`assets/raw/${id}/paleta/${d}.png`));
    const p = a.przemalowanie ?? ubranie(kier[0]);
    const wersje = [kier, ...rampy.map((r) => kier.map((k) => przemaluj(k, p, r)))];
    const dx = (K - kier[0].w) >> 1;
    const dy = K - kier[0].h;
    wersje.forEach((v, n) => {
      v.forEach((k, d) => {
        kopiuj(k, 0, 0, k.w, k.h, ludzie, (n * DIRS.length + d) * K + dx, c * K + dy);
      });
    });
    // stopy: najniższy piksel ze wszystkich kierunków (z tyłu stopy wypadają o 1–3 px wyżej), żeby postać przy
    // obrocie nie skakała i w żadnym kierunku nie wchodziła w ziemię
    return { id, co: a.co, zarzad: c < m.zarzad.length, stopy: Math.max(...kier.map(stopy)) + dy };
  });
  out.set('ludzie.png', ludzie);

  const opis: OpisGrafiki = {
    wersja: WERSJA_GRAFIKI,
    zrodlo:
      'PixelLab, kotwica stylu zatwierdzona 18.10.2026: assety ze statusem zatwierdzony z assets/manifest.json, złożone przez tools/atlasy.ts (npm run atlasy)',
    teren: { id: teren.id, plik: 'teren.png', kafel: 32 },
    blok: {
      id: blok.id,
      plik: 'blok.png',
      gora: [0, f.gora],
      srodek: [f.gora, f.pietro[1]],
      dol: [f.gora + f.pietro[1], f.dol[1]],
      wejscie: [0, ww],
      drzwi: M.drzwi,
      przesla: [ww, pw],
      attyka: [ww + pw, M.attyka[3]],
    },
    dach: {
      id: dach.id,
      plik: 'dach.png',
      tlo: D.tlo,
      ciemny: pal.kolory[0],
      jasny: pal.kolory[2],
      szwy: D.szwy,
      naklejka: nw,
      naklejek: D.naklejki.length,
      gestosc: D.gestosc,
    },
    trzepak: { id: trzepak.id, plik: 'trzepak.png', stopy: stopy(tz), podstawa: 20 },
    ludzie: {
      plik: 'ludzie.png',
      klatka: K,
      kierunki: DIRS,
      wersje: ['oryginał', ...Object.keys(pal.rampy)],
      postacie,
    },
  };
  out.set('grafika.json', opis);
  return out;
}

const tekst = (o: OpisGrafiki) => `${JSON.stringify(o, null, 2)}\n`;

/** pliki, których w public/assets brakuje albo które różnią się od świeżo złożonych */
function nieaktualne(wynik: Map<string, Atlas | OpisGrafiki>): string[] {
  const zle: string[] = [];
  for (const [nazwa, dane] of wynik) {
    const p = path.join(ROOT, WYJSCIE, nazwa);
    if (!fs.existsSync(p)) zle.push(nazwa);
    else if (nazwa.endsWith('.json')) {
      if (fs.readFileSync(p, 'utf8') !== tekst(dane as OpisGrafiki)) zle.push(nazwa);
    } else {
      const a = dane as Atlas;
      const b = decodePng(fs.readFileSync(p));
      if (b.width !== a.w || b.height !== a.h || !Buffer.from(b.rgba).equals(Buffer.from(a.rgba))) zle.push(nazwa);
    }
  }
  return zle;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wynik = atlasy();
  if (process.argv.includes('--sprawdz')) {
    const zle = nieaktualne(wynik);
    if (zle.length) {
      console.error(`public/assets nieaktualne (${zle.join(', ')}): npm run atlasy`);
      process.exitCode = 1;
    } else console.log('public/assets aktualne');
  } else {
    fs.mkdirSync(path.join(ROOT, WYJSCIE), { recursive: true });
    for (const [nazwa, dane] of wynik) {
      const p = path.join(ROOT, WYJSCIE, nazwa);
      if (nazwa.endsWith('.json')) fs.writeFileSync(p, tekst(dane as OpisGrafiki));
      else {
        const a = dane as Atlas;
        fs.writeFileSync(p, encodePng(a.w, a.h, a.rgba));
      }
      console.log(`${WYJSCIE}/${nazwa}: ${fs.statSync(p).size} B`);
    }
  }
}
