import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Obraz } from '../../src/render/art/pixellab.ts';
import { wczytajGrafike } from '../../src/render/grafika.ts';
import { decodePng } from '../../tools/png.ts';

const DIR = path.resolve(import.meta.dirname, '../../public/assets');

/** pobieranie z public/assets jak z serwera gry; brak: zamienia nazwę pliku na odpowiedź (404, zły opis) */
function serwer(brak: Record<string, Response> = {}) {
  const adresy: string[] = [];
  const pobierz = async (url: string | URL | Request) => {
    const u = String(url);
    adresy.push(u);
    const nazwa = u.split('/').pop()!;
    if (brak[nazwa]) return brak[nazwa].clone();
    const f = path.join(DIR, nazwa);
    return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('brak', { status: 404 });
  };
  return { adresy, pobierz: pobierz as typeof fetch };
}

const dekoduj = async (b: Blob): Promise<Obraz> => {
  const d = decodePng(new Uint8Array(await b.arrayBuffer()));
  return { w: d.width, h: d.height, px: new Uint32Array(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length / 4) };
};

describe('wczytanie grafiki z PixelLab (src/render/grafika.ts)', () => {
  it('teren, blok, dach i trzepak z public/assets, bez obsady postaci (czeka na animacje)', async () => {
    const s = serwer();
    const g = await wczytajGrafike({ pobierz: s.pobierz, dekoduj });
    expect(g?.teren?.img.w).toBe(128);
    expect(g?.blok?.srodek[1]).toBe(13);
    expect(g?.dach?.n).toBeGreaterThan(0);
    expect(g?.trzepak?.stopy).toBeGreaterThan(0);
    expect(s.adresy.map((u) => u.split('/').pop()).sort()).toEqual([
      'blok.png',
      'dach.png',
      'grafika.json',
      'teren.png',
      'trzepak.png',
    ]);
    expect(s.adresy.every((u) => u.startsWith('assets/'))).toBe(true);
  });

  it('bez opisu (404), z opisem w innej wersji albo bez sieci: null, czyli wszystko z kodu', async () => {
    expect(
      await wczytajGrafike({ pobierz: serwer({ 'grafika.json': new Response('', { status: 404 }) }).pobierz, dekoduj }),
    ).toBeNull();
    const opis = JSON.parse(fs.readFileSync(path.join(DIR, 'grafika.json'), 'utf8'));
    const inny = new Response(JSON.stringify({ ...opis, wersja: opis.wersja + 1 }));
    expect(await wczytajGrafike({ pobierz: serwer({ 'grafika.json': inny }).pobierz, dekoduj })).toBeNull();
    const bezSieci = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await wczytajGrafike({ pobierz: bezSieci, dekoduj })).toBeNull();
  });

  it('bez jednego obrazka ta część jest z kodu, reszta z PixelLab', async () => {
    const s = serwer({ 'dach.png': new Response('', { status: 404 }), 'trzepak.png': new Response('nie png') });
    const g = await wczytajGrafike({ pobierz: s.pobierz, dekoduj });
    expect(g?.dach).toBeNull();
    expect(g?.trzepak).toBeNull();
    expect(g?.teren).not.toBeNull();
    expect(g?.blok).not.toBeNull();
  });
});
