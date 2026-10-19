/* Kotwica stylu z PixelLab w grze, do npm run shots (scenariusze kotwica-*): ten sam kadr z grafiką rysowaną kodem
   (?grafika=kod) i z grafiką z PixelLab (atlasy z public/assets składa tools/atlasy.ts), obok siebie. Teren, bloki,
   trzepak i postacie rysuje sama gra. Arkusz pokazuje zatwierdzone assety z kosztami. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { mapaPrzemalowania, type OpisGrafiki, przemalujKlatki } from '../src/render/art/pixellab.ts';
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
  /** animacje z PixelLab po pobraniu paczki postaci (tools/animacje.ts) i odrzucone próby, każda z kosztem */
  animacje?: { koszt: number }[];
  odrzucone?: { koszt: number }[];
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

/** postać id w kierunku PixelLab (south, east, north, west) ze statycznej paczki po palecie, jako data URL */
function statyczna(id: string, kierunek: string, rampa?: string): string {
  const d = decodePng(file(`assets/raw/${id}/paleta/${kierunek}.png`));
  if (rampa) {
    const post = opisGrafiki().ludzie.postacie.find((q) => q.id === id)!;
    const px = new Uint32Array(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length / 4);
    const mapa = mapaPrzemalowania(post.przemalowanie.kolory, opisGrafiki().ludzie.rampy[rampa]);
    przemalujKlatki(px, d.width, [[0, 0, d.width, d.height]], mapa);
  }
  return `data:image/png;base64,${Buffer.from(encodePng(d.width, d.height, d.rgba)).toString('base64')}`;
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
    const pelna = !!g && g.teren && g.blok && g.dach && g.strop && g.trzepak && g.ludzie;
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
    'Po: trawnik z chodnikiem, trzepak, blok i zarząd z PixelLab',
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
      // kopie mieszkańca bez osoby: o postaci z PixelLab decyduje wtedy wygląd z gry, a nie jedna wspólna osoba
      for (const p of st.pawns) if (p.kind === 'resident') p.person = -1;
      // meble siedziby (przy przekroj=0 leżałyby na dachu) schowane jak na podwórku
      const v = zm.view as unknown as { things: Map<string, { thing: { x: number; y: number }; inside: boolean }> };
      for (const e of v.things.values())
        if (w.bid[Math.floor(e.thing.y) * size + Math.floor(e.thing.x)] >= 0) e.inside = true;
      zm.setCam(tz.x + 1.5, tz.y + 2, zoom);
    },
    [ile, 1.5] as const,
  );
}

/** tyle osób w kadrze z tłumem: więcej niż wyglądów w kodzie (16), mniej niż postaci mieszkańców i zarządu razem */
const TLUM = 36;

/** tłum na podwórku: pionki z kodu (16 wyglądów) i ta sama liczba osób z obsady PixelLab */
export const kotwicaTlum = (page: Page, base: string) =>
  przedPo(page, base, 'demo=lanciego&speed=0&cam=hq,1&przekroj=0', (p) => ustawTlum(p, TLUM), [
    KOD,
    `Po: ${TLUM} osób z ${opisGrafiki().ludzie.postacie.length} postaci PixelLab`,
  ]);

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
  const suma = (l?: { koszt: number }[]) => (l ?? []).reduce((s, p) => s + p.koszt, 0);
  const koszt = (a: Asset) => a.koszt + suma(a.pochodne) + suma(a.animacje) + suma(a.odrzucone);
  const gen = (n: number) => `${n.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} gen.`;
  const opis = (id: string, co: string) => {
    const a = asset(m, id);
    return `<h2>${co}<small>${a.narzedzie} · ${gen(koszt(a))}</small></h2>`;
  };
  const img = (src: string, zoom: number) => `<img src="${src}" style="zoom:${zoom}">`;
  const pal = paleta();
  const rampy = Object.keys(l.rampy);
  const zarzad = m.zarzad.map((id) => {
    const a = asset(m, id);
    const kier = ['south', 'east', 'north', 'west'].map((d) => img(statyczna(id, d), 2));
    const warianty = rampy.map(
      (n) => `<figure>${img(statyczna(id, 'south', n), 2)}<figcaption>${n}</figcaption></figure>`,
    );
    return `<div class="row"><div>${opis(id, a.co)}${kier.join('')}</div>
      <div><h2>Przemalowania w kodzie<small>0 gen.</small></h2>${warianty.join('')}</div></div>`;
  });
  const mieszkancy = m.mieszkancy.map(
    (id) => `<figure>${img(statyczna(id, 'south'), 2)}<figcaption>${asset(m, id).co}</figcaption></figure>`,
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
  <p>Wybrane assety z animacjami postaci: ${gen(naKotwice)} Razem z odrzuconymi próbami i poprawkami ${gen(razem)} z 2000 w abonamencie, 0 USD. Każda następna postać to 2 gen., jej chód i stanie 8 gen., warianty kolorów ubrań robi gra za darmo. Szczegóły w assets/manifest.json, animacje w atlasie public/assets/ludzie.png (npm run atlasy).</p>
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
