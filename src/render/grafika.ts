/* Wczytanie grafiki z PixelLab z public/assets (atlasy z tools/atlasy.ts) przy starcie gry: teren, moduły bloku,
   naklejki dachu, trzepak, wyglądy budynków publicznych i zabytkowych oraz animacje ludzi. Bez opisu, w innej wersji
   albo bez sieci wszystko rysuje kod; bez jednego obrazka tylko ta część. */

import { ctx2d, newCanvas } from './art/canvas.ts';
import { type Grafika, grafikaZ, type Obraz, type OpisGrafiki, WERSJA_GRAFIKI } from './art/pixellab.ts';

/** katalog atlasów względem strony gry (ten sam build działa lokalnie i pod adresem Pages) */
const KATALOG = 'assets/';

/** PNG z atlasu do pikseli: obrazy mają alfę tylko 0 albo 255, więc płótno odda je bez zmian */
async function dekodujPng(b: Blob): Promise<Obraz> {
  const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = newCanvas(bmp.width, bmp.height);
  const ctx = ctx2d(c);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, px: new Uint32Array(d.data.buffer) };
}

/** pobierz i dekoduj do podmiany w testach (Node nie ma createImageBitmap) */
export async function wczytajGrafike(
  opts: { pobierz?: typeof fetch; dekoduj?: (b: Blob) => Promise<Obraz> } = {},
): Promise<Grafika | null> {
  const pobierz = opts.pobierz ?? ((u: string | URL | Request) => fetch(u));
  const dekoduj = opts.dekoduj ?? dekodujPng;
  try {
    const r = await pobierz(`${KATALOG}grafika.json`);
    if (!r.ok) throw new Error(`grafika.json: ${r.status}`);
    const opis = (await r.json()) as OpisGrafiki;
    if (opis.wersja !== WERSJA_GRAFIKI)
      throw new Error(`grafika.json w wersji ${opis.wersja}, gra czyta ${WERSJA_GRAFIKI}`);
    const pliki = [
      opis.teren.plik,
      opis.blok.plik,
      opis.dach.plik,
      opis.trzepak.plik,
      opis.budynki.plik,
      opis.ludzie.plik,
    ];
    const obrazy = await Promise.all(
      pliki.map(async (plik) => {
        try {
          const o = await pobierz(KATALOG + plik);
          if (!o.ok) throw new Error(`${o.status}`);
          return await dekoduj(await o.blob());
        } catch (e) {
          console.info(`grafika z PixelLab: ${plik} niedostępny (${String(e)}), ta część z kodu`);
          return null;
        }
      }),
    );
    return grafikaZ(opis, (plik) => obrazy[pliki.indexOf(plik)] ?? null);
  } catch (e) {
    console.info(`grafika z PixelLab niedostępna (${String(e)}): wszystko rysuje kod`);
    return null;
  }
}
