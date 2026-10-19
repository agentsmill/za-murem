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
  /** tryb pamięci podręcznej każdego pobrania (`init.cache`), w kolejności adresów */
  const tryby: (RequestCache | undefined)[] = [];
  const pobierz = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    adresy.push(u);
    tryby.push(init?.cache);
    const nazwa = u.split('/').pop()!;
    if (brak[nazwa]) return brak[nazwa].clone();
    const f = path.join(DIR, nazwa);
    return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('brak', { status: 404 });
  };
  return { adresy, tryby, pobierz: pobierz as typeof fetch };
}

const dekoduj = async (b: Blob): Promise<Obraz> => {
  const d = decodePng(new Uint8Array(await b.arrayBuffer()));
  return { w: d.width, h: d.height, px: new Uint32Array(d.rgba.buffer, d.rgba.byteOffset, d.rgba.length / 4) };
};

describe('wczytanie grafiki z PixelLab (src/render/grafika.ts)', () => {
  it('teren, blok, dach, strop, trzepak i animacje ludzi z public/assets', async () => {
    const s = serwer();
    const g = await wczytajGrafike({ pobierz: s.pobierz, dekoduj });
    expect(g?.teren?.img.w).toBe(128);
    expect(g?.blok?.srodek[1]).toBe(13);
    expect(g?.dach?.n).toBeGreaterThan(0);
    expect([g?.strop?.img?.w, g?.strop?.img?.h]).toEqual([4 * 32, 32]);
    expect(g?.trzepak?.stopy).toBeGreaterThan(0);
    expect(g?.ludzie?.img.w).toBe(2048);
    expect(g?.ludzie?.opis.postacie.length).toBeGreaterThan(0);
    // 11 wyglądów budynków przycięte z atlasu: fasada z modułami, a dach z próbki albo papa
    expect(Object.keys(g?.budynki ?? {})).toHaveLength(11);
    expect(g?.budynki?.ratusz?.dach).not.toBeNull();
    expect(g?.budynki?.kamienica?.dach).toBeNull();
    expect(g?.budynki?.muzeum?.ozdoba?.kotwica).toBe('ziemia');
    expect(s.adresy.map((u) => u.split('/').pop()).sort()).toEqual([
      'blok.png',
      'budynki.png',
      'dach.png',
      'grafika.json',
      'ludzie.png',
      'strop.png',
      'teren.png',
      'trzepak.png',
    ]);
    expect(s.adresy.every((u) => u.startsWith('assets/'))).toBe(true);
  });

  it('opis i atlasy pobiera ze sprawdzeniem w serwerze (stałe nazwy plików, stara wersja nie zostaje po wdrożeniu)', async () => {
    const s = serwer();
    await wczytajGrafike({ pobierz: s.pobierz, dekoduj });
    // opis i siedem atlasów, każde z cache: 'no-cache': przeglądarka pyta serwer, czy plik się zmienił
    expect(s.tryby).toHaveLength(8);
    expect(s.tryby.every((t) => t === 'no-cache')).toBe(true);
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
    const s = serwer({
      'dach.png': new Response('', { status: 404 }),
      'strop.png': new Response('', { status: 404 }),
      'trzepak.png': new Response('nie png'),
      'budynki.png': new Response('', { status: 404 }),
      'ludzie.png': new Response('', { status: 500 }),
    });
    const g = await wczytajGrafike({ pobierz: s.pobierz, dekoduj });
    expect(g?.dach).toBeNull();
    // strop bez naklejek zostaje: jego kolor rysuje kod
    expect(g?.strop?.img).toBeNull();
    expect(g?.strop?.gestosc).toBeGreaterThan(0);
    expect(g?.trzepak).toBeNull();
    expect(g?.budynki).toBeNull();
    expect(g?.ludzie).toBeNull();
    expect(g?.teren).not.toBeNull();
    expect(g?.blok).not.toBeNull();
  });
});
