/* Kotwica stylu z PixelLab w grze, do npm run shots (scenariusze kotwica-*): ten sam kadr z grafiką rysowaną kodem
   (?grafika=kod) i z grafiką z PixelLab (atlasy z public/assets składa tools/atlasy.ts), obok siebie. Teren, bloki
   i trzepak rysuje już gra. Postacie z PixelLab czekają na animacje, więc w kadrze z tłumem obsada z atlasu
   ludzie.png stoi w miejscu pionków tylko na czas zrzutu. Arkusz pokazuje zatwierdzone assety z kosztami. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { OpisGrafiki } from '../src/render/art/pixellab.ts';
import { waitIdle } from './browser.ts';
import { decodePng, encodePng } from './png.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = (rel: string) => fs.readFileSync(path.join(ROOT, rel));
const png = (rel: string) => `data:image/png;base64,${file(rel).toString('base64')}`;
const json = <T>(rel: string) => JSON.parse(file(rel).toString('utf8')) as T;

interface Asset {
  id: string;
  co: string;
  narzedzie: string;
  koszt: number;
  wybrany?: string;
  pochodne?: { koszt: number }[];
}

/** paleta gry z kotwicy (assets/palette.json): kolory i rampy do przemalowań, od najciemniejszego */
interface Paleta {
  nazwa: string;
  kolory: string[];
  rampy: Record<string, string[]>;
}

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: Asset[];
}

const manifest = () => json<Manifest>('assets/manifest.json');
const paleta = () => json<Paleta>('assets/palette.json');
const opisGrafiki = () => json<OpisGrafiki>('public/assets/grafika.json');
const asset = (m: Manifest, id: string) => m.assety.find((a) => a.id === id)!;

/** klatka postaci c w wersji v (0 oryginał, dalej przemalowania) i kierunku d z atlasu ludzie.png, jako data URL */
function klatka(c: number, v: number, d: number): string {
  const l = opisGrafiki().ludzie;
  const a = decodePng(file(`public/assets/${l.plik}`));
  const K = l.klatka;
  const out = new Uint8Array(K * K * 4);
  const x0 = (v * l.kierunki.length + d) * K;
  for (let y = 0; y < K; y++) {
    const i = ((c * K + y) * a.width + x0) * 4;
    out.set(a.rgba.subarray(i, i + K * 4), y * K * 4);
  }
  return `data:image/png;base64,${Buffer.from(encodePng(K, K, out)).toString('base64')}`;
}

/** wycinek przy siedzibie w Lanciego: fasada z dachem (przekroj=0), podwórko z trzepakiem, zarząd, chodnik */
const KADR = { w: 960, h: 720, zoom: 2 };
const UI = '#top, #goals, #hint, #treeMark, #card, #box, #klatki, #arrive, .mapctl { display: none !important; }';

/** zarząd stoi przy trzepaku, reszta ludzi daleko, meble siedziby (przy przekroj=0 leżałyby na dachu) schowane */
async function ustaw(page: Page) {
  await page.evaluate(
    ([w, h, zoom]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const size = sim.w.size;
      const tz = sim.w.props.find((p) => p.kind === 'trzepak')!;
      // kierunki pionków: 0 południe, 1 północ, 2 zachód, 3 wschód
      const spots: [number, number, number][] = [
        [tz.x - 1.5, tz.y + 0.9, 3],
        [tz.x + 1.5, tz.y + 1.6, 0],
        [tz.x + 4.5, tz.y + 0.9, 2],
        [tz.x + 6, tz.y + 1.4, 0],
      ];
      let k = 0;
      for (const p of st.pawns) {
        const [x, y, dir] = p.kind === 'core' && k < spots.length ? spots[k++] : [1.5, 1.5, 0];
        Object.assign(p, { x, y, path: [], pi: 0, dir, job: null, carry: 0, wait: st.tick + 99999 });
      }
      const v = zm.view as unknown as {
        things: Map<string, { thing: { x: number; y: number }; inside: boolean }>;
        width: number;
        height: number;
      };
      for (const e of v.things.values())
        if (sim.w.bid[Math.floor(e.thing.y) * size + Math.floor(e.thing.x)] >= 0) e.inside = true;
      // kadr: nad trzepakiem kilka kafelków dachu, pod nim siatka i chodnik
      zm.setCam(tz.x + tz.w / 2 + 0.5, tz.y + 0.2, zoom);
      if (v.width !== w || v.height !== h) throw new Error(`płótno ${v.width}×${v.height} zamiast ${w}×${h}`);
    },
    [KADR.w, KADR.h, KADR.zoom] as const,
  );
}

/**
 * Obsada z PixelLab w miejscu pionków na czas zrzutu (postacie czekają na animacje): zarząd dostaje pierwsze
 * postacie z obsady, mieszkańcy następne, a gdy postaci zabraknie, ich przemalowania; kierunek jak pionek z kodu
 * (0 południe, 1 północ, 2 zachód, 3 wschód), pionek z kodu wychodzi poza kadr.
 */
async function nalozLudzi(page: Page) {
  await page.evaluate(async (l) => {
    const zm = window.zm!;
    const sim = zm.sim!;
    type Tex = { source: { scaleMode: string } };
    type Spr = {
      position: { set: (x: number, y: number) => void };
      anchor: { set: (x: number, y: number) => void };
      zIndex: number;
    };
    type Dziecko = { texture?: Tex; constructor: unknown };
    const v = zm.view as unknown as {
      actors: { addChild: (s: Spr) => void; children: Dziecko[] };
      terrain: { children: Dziecko[] };
    };
    const im = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = `assets/${l.plik}`;
    });
    const K = l.klatka;
    const D = l.kierunki.length;
    const frame = (c: number, w: number, d: number) => {
      const cv = document.createElement('canvas');
      cv.width = K;
      cv.height = K;
      const g = cv.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(im, (w * D + d) * K, c * K, K, K, 0, 0, K, K);
      return cv;
    };
    // klasy Pixi z sprite'a, który już jest w scenie (strona nie wystawia modułu pixi.js); tylko taki, którego
    // tekstura ma Texture.from, bo warstwy w actors (np. plotLayer) trzymają pod `texture` co innego
    const any = [...v.actors.children, ...v.terrain.children].find(
      (c) => typeof (c.texture as { constructor?: { from?: unknown } } | undefined)?.constructor?.from === 'function',
    )!;
    const SpriteC = any.constructor as new (t: Tex) => Spr;
    const TextureC = any.texture!.constructor as unknown as { from: (s: CanvasImageSource) => Tex };
    const zarzad = l.postacie.filter((p) => p.zarzad).length;
    const wersje: [number, number][] = [];
    for (let w = 0; w < l.wersje.length; w++) for (let c = 0; c < l.postacie.length; c++) wersje.push([c, w]);
    const face = [0, 4, 6, 2];
    const kolej = [
      ...sim.st.pawns.filter((p) => p.kind === 'core'),
      ...sim.st.pawns.filter((p) => p.kind === 'resident'),
    ];
    let zw = 0;
    let mw = zarzad;
    for (const p of kolej) {
      const [c, w] = wersje[p.kind === 'core' ? zw++ % zarzad : mw++ % wersje.length];
      const t = TextureC.from(frame(c, w, face[p.dir]));
      t.source.scaleMode = 'nearest';
      const s = new SpriteC(t);
      s.anchor.set(0.5, l.postacie[c].stopy / K);
      s.position.set(Math.round(p.x * 32), Math.round(p.y * 32));
      s.zIndex = p.y;
      v.actors.addChild(s);
      Object.assign(p, { x: 1.5, y: 1.5 });
    }
  }, opisGrafiki().ludzie);
}

/**
 * Ten sam kadr gry z grafiką rysowaną kodem (?grafika=kod) i z grafiką z PixelLab, obok siebie; ustawKadr
 * przygotowuje kadr przed oboma zrzutami, po (opcjonalnie) zmienia coś tylko w kadrze z PixelLab.
 */
async function przedPo(
  page: Page,
  base: string,
  query: string,
  ustawKadr: (page: Page) => Promise<void>,
  podpis: [string, string],
  po?: (page: Page) => Promise<void>,
) {
  const zrzut = async (q: string, pixellab: boolean) => {
    await page.goto(`${base}?${q}`);
    await waitIdle(page);
    const g = await page.evaluate(() => window.zm!.grafika());
    const pelna = !!g && g.teren && g.blok && g.dach && g.trzepak;
    if (pixellab ? !pelna : g)
      throw new Error(`grafika ${JSON.stringify(g)} w kadrze ${pixellab ? 'z PixelLab' : 'z kodu'}`);
    await page.addStyleTag({ content: UI });
    await ustawKadr(page);
    await waitIdle(page);
    if (pixellab && po) {
      await po(page);
      await waitIdle(page);
    }
    return (await page.screenshot()).toString('base64');
  };
  await page.setViewportSize({ width: KADR.w, height: KADR.h });
  const a = await zrzut(`${query}&grafika=kod`, false);
  const b = await zrzut(query, true);
  // gra przestaje chodzić w tle, zanim strona dostanie zestawienie
  await page.goto('about:blank');
  await page.setViewportSize({ width: KADR.w * 2 + 12, height: KADR.h + 40 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #1a1c22; color: #e3e0d6; font: 600 15px/1 system-ui, sans-serif; display: flex; gap: 12px; }
    figure { margin: 0; } figcaption { height: 40px; display: flex; align-items: center; padding-left: 12px; }
    img { display: block; }
  </style>
  <figure><figcaption>${podpis[0]}</figcaption><img src="data:image/png;base64,${a}"></figure>
  <figure><figcaption>${podpis[1]}</figcaption><img src="data:image/png;base64,${b}"></figure>`);
}

const KOD = 'Przed: grafika rysowana kodem (?grafika=kod)';

/** podwórko siedziby w Lanciego: fasada z dachem, trawnik, trzepak, zarząd i chodnik */
export const kotwicaStylu = (page: Page, base: string) =>
  przedPo(page, base, 'demo=lanciego&speed=0&cam=hq,1&przekroj=0', ustaw, [
    KOD,
    'Po: trawnik z chodnikiem, trzepak i blok z PixelLab (postacie jeszcze z kodu)',
  ]);

/** tłum przy siedzibie: zarząd i dosztukowani mieszkańcy (kopie pionka mieszkańca, każdy w innym wyglądzie z kodu)
    na wolnych kafelkach trawy i chodnika wokół trzepaka, od najbliższych */
async function ustawTlum(page: Page, ile: number) {
  await page.evaluate(
    ([ile, zoom]) => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const st = sim.st;
      const w = sim.w;
      const size = w.size;
      const tz = w.props.find((p) => p.kind === 'trzepak')!;
      const wolne: [number, number][] = [];
      for (let y = tz.y - 1; y <= tz.y + 6; y++)
        for (let x = tz.x - 7; x <= tz.x + 10; x++) {
          const i = y * size + x;
          const t = w.terr[i];
          if ((x + y) % 2 || sim.blocked[i] || !(t === 0 || t === 4 || t === 5)) continue;
          if (y === tz.y && x >= tz.x && x < tz.x + tz.w) continue;
          wolne.push([x, y]);
        }
      const d = (q: [number, number]) => Math.hypot(q[0] - tz.x - 1, q[1] - tz.y - 2);
      wolne.sort((a, b) => d(a) - d(b));
      const ludzie = () => st.pawns.filter((p) => p.kind === 'core' || p.kind === 'resident');
      const wzor = st.pawns.find((p) => p.kind === 'resident')!;
      let id = Math.max(...st.pawns.map((p) => p.id)) + 1;
      while (ludzie().length < ile) st.pawns.push({ ...wzor, id: id++ });
      ludzie().forEach((p, k) => {
        const [x, y] = wolne[k % wolne.length];
        Object.assign(p, {
          x: x + 0.3 + ((k * 7) % 5) / 10,
          y: y + 0.6,
          path: [],
          pi: 0,
          dir: [0, 3, 0, 2, 0, 1][k % 6],
          job: null,
          carry: 0,
          wait: st.tick + 99999,
          look: k % 16,
          away: false,
        });
      });
      // meble siedziby (przy przekroj=0 leżałyby na dachu) schowane jak na podwórku
      const v = zm.view as unknown as { things: Map<string, { thing: { x: number; y: number }; inside: boolean }> };
      for (const e of v.things.values())
        if (w.bid[Math.floor(e.thing.y) * size + Math.floor(e.thing.x)] >= 0) e.inside = true;
      zm.setCam(tz.x + 1.5, tz.y + 2, zoom);
    },
    [ile, 1.5] as const,
  );
}

/** tyle osób w kadrze z tłumem: więcej niż postaci w obsadzie, żeby było widać przemalowania */
const TLUM = 36;

/** tłum na podwórku: pionki z kodu (16 wyglądów) i ta sama liczba osób z obsady PixelLab i jej przemalowań */
export const kotwicaTlum = (page: Page, base: string) =>
  przedPo(
    page,
    base,
    'demo=lanciego&speed=0&cam=hq,1&przekroj=0',
    (p) => ustawTlum(p, TLUM),
    [
      KOD,
      `Po: ${TLUM} osób z ${opisGrafiki().ludzie.postacie.length} postaci i ich przemalowań (postacie z atlasu na czas zrzutu)`,
    ],
    nalozLudzi,
  );

/** najwyższy blok w Lanciego od strony wejścia: moduły piętra składają się do każdej wysokości */
export const kotwicaWysokiBlok = (page: Page, base: string) =>
  przedPo(
    page,
    base,
    'demo=lanciego&speed=0',
    async (p) => {
      const pietra = await p.evaluate(() => {
        const zm = window.zm!;
        const w = zm.sim!.w;
        const bloki = w.buildings.filter(
          (b) => b.cls === 'blok' && b.id !== w.hq && b.entrances.some((e) => e.dir === 'S'),
        );
        const b = bloki.sort((a, c) => c.levels - a.levels)[0];
        const e = b.entrances.find((q) => q.dir === 'S')!;
        zm.setCam((e.tile % w.size) + 0.5, Math.floor(e.tile / w.size) - 4, 1.25);
        return b.levels;
      });
      if (pietra < 9) throw new Error(`najwyższy blok ma tylko ${pietra} pięter`);
    },
    [KOD, 'Po: najwyższy blok osiedla z modułów kawałka bloku, 13 px na piętro'],
  );

/** kafelki dachu w kolejności wariantów (PixelLab nazywa pliki od pierwszego opisu, numer wariantu na końcu) */
function dachowki(): string[] {
  const dir = 'assets/raw/kotwica-blok-dach';
  const nr = (f: string) => Number(/(\d+)\.png$/.exec(f)![1]);
  return fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.png'))
    .sort((a, b) => nr(a) - nr(b))
    .map((f) => `${dir}/${f}`);
}

/** arkusz kotwicy: zatwierdzone assety w powiększeniu, z narzędziem i kosztem, zarząd z przemalowaniami, paleta */
export async function kotwicaArkusz(page: Page) {
  const m = manifest();
  const l = opisGrafiki().ludzie;
  const koszt = (a: Asset) => a.koszt + (a.pochodne ?? []).reduce((s, p) => s + p.koszt, 0);
  const gen = (n: number) => `${n.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} gen.`;
  const opis = (id: string, co: string) => {
    const a = asset(m, id);
    return `<h2>${co}<small>${a.narzedzie} · ${gen(koszt(a))}</small></h2>`;
  };
  const img = (src: string, zoom: number) => `<img src="${src}" style="zoom:${zoom}">`;
  const pal = paleta();
  const zarzad = m.zarzad.map((id, c) => {
    const a = asset(m, id);
    const kier = l.kierunki.map((_, d) => img(klatka(c, 0, d), 2));
    const warianty = l.wersje
      .slice(1)
      .map((n, w) => `<figure>${img(klatka(c, w + 1, 0), 2)}<figcaption>${n}</figcaption></figure>`);
    return `<div class="row"><div>${opis(id, a.co)}${kier.join('')}</div>
      <div><h2>Przemalowania w kodzie<small>0 gen.</small></h2>${warianty.join('')}</div></div>`;
  });
  const mieszkancy = m.mieszkancy.map(
    (id, i) =>
      `<figure>${img(klatka(m.zarzad.length + i, 0, 0), 2)}<figcaption>${asset(m, id).co}</figcaption></figure>`,
  );
  const wybrane = [
    'kotwica-chodnik-trawa',
    'kotwica-trzepak',
    ...m.zarzad,
    ...m.mieszkancy,
    'kotwica-blok',
    'kotwica-blok-dach',
  ];
  const naKotwice = wybrane.reduce((s, id) => s + koszt(asset(m, id)), 0);
  const razem = m.assety.reduce((s, a) => s + koszt(a), 0);
  const kafle = dachowki().map((f) => img(png(f), 2));
  await page.setViewportSize({ width: 1440, height: 1630 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px 32px; background: #26292e; color: #e3e0d6; font: 14px/1.4 system-ui, sans-serif; }
    h1 { font-size: 22px; margin: 0 0 4px; } p { margin: 0 0 18px; color: #b7b2a6; }
    h2 { font-size: 15px; margin: 0 0 8px; } h2 small { display: block; font-weight: 400; color: #9a958a; }
    img { image-rendering: pixelated; vertical-align: bottom; }
    figure { display: inline-block; margin: 0 6px 0 0; text-align: center; }
    figcaption { font-size: 11px; color: #9a958a; }
    .row { display: flex; gap: 40px; margin-bottom: 18px; align-items: flex-start; }
    .ludzie { display: grid; grid-template-columns: repeat(10, 128px); gap: 4px 0; margin-bottom: 18px; }
    .ludzie figcaption { width: 120px; }
    .tiles { display: grid; grid-template-columns: repeat(4, 64px); gap: 6px; }
    .pal { display: grid; grid-template-columns: repeat(16, 76px); gap: 4px; }
    .pal div { height: 40px; font: 11px/1 ui-monospace, monospace; display: flex; align-items: flex-end; padding: 3px; }
  </style>
  <h1>Kotwica stylu z PixelLab, zatwierdzona 18.10.2026</h1>
  <p>Wybrane assety: ${gen(naKotwice)} Razem z odrzuconymi próbami ${gen(razem)} z 2000 w abonamencie, 0 USD. Każda następna postać to 2 gen., warianty kolorów ubrań robi kod za darmo. Szczegóły w assets/manifest.json, postacie z atlasu public/assets/ludzie.png (npm run atlasy).</p>
  ${zarzad.join('')}
  ${mieszkancy.length ? `<h2>Mieszkańcy: ${mieszkancy.length} postaci<small>create_character v3 · po 2 gen.</small></h2><div class="ludzie">${mieszkancy.join('')}</div>` : ''}
  <div class="row">
    <div>${opis('kotwica-trzepak', 'Trzepak 96×64')}${img(png('assets/raw/kotwica-trzepak/trzepak.png'), 2)}</div>
    <div>${opis('kotwica-chodnik-trawa', 'Chodnik i trawnik, 16 kafelków 32 px')}${img(png('assets/raw/kotwica-chodnik-trawa/tileset.png'), 2)}</div>
    <div>${opis('kotwica-blok', 'Kawałek bloku, 13 px na piętro (tyle ma teraz gra)')}${img(png(asset(m, 'kotwica-blok').wybrany!), 2)}</div>
    <div>${opis('kotwica-blok-dach', 'Dach: 16 wariantów papy')}<div class="tiles">${kafle.join('')}</div></div>
  </div>
  <h2>Paleta ${pal.nazwa} (assets/palette.json), 32 kolory z palette.ts</h2>
  <div class="pal">${pal.kolory
    .map(
      (c) =>
        `<div style="background:${c};color:${Number.parseInt(c.slice(1, 3), 16) > 150 ? '#1a1c22' : '#e3e0d6'}">${c}</div>`,
    )
    .join('')}</div>`);
}
