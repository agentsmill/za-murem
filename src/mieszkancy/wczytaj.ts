/* Wczytywanie tabel mieszkańców w grze. Pliki leżą w public/data/mieszkancy/, więc Vite serwuje je od korzenia
   strony; ścieżki są względne (`base: './'`), tak jak `demo/…` w src/world/load.ts. W Node (testy, boty) wywołujący
   podaje własny `fetchFn`, który czyta pliki z public/. */

import { type TabeleGminy, type TabeleKraju, WERSJA_TABEL } from './tabele.ts';

const KATALOG = 'data/mieszkancy/';

const obiekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Tabele gminy o kodzie TERYT (7 cyfr). `null`, gdy gminy nie ma wśród tabel (404), gdy nie da się pobrać albo
    odczytać pliku (błąd sieci, inny status, odpowiedź niebędąca JSON-em) i gdy wersja tabel jest inna niż
    `WERSJA_TABEL`. Nigdy nie rzuca: wtedy generator bierze szablon krajowy (`wczytajKraj`). Poza zwykłym 404
    każda porażka zostawia ostrzeżenie w konsoli. */
export async function wczytajGmine(teryt: string, fetchFn: typeof fetch = fetch): Promise<TabeleGminy | null> {
  if (!/^\d{7}$/.test(teryt)) return null;
  const adres = `${KATALOG}gminy/${teryt}.json`;
  try {
    const odp = await fetchFn(adres);
    if (odp.status === 404) return null;
    if (!odp.ok) {
      console.warn(`Tabele gminy ${teryt}: ${adres} odpowiada ${odp.status}`);
      return null;
    }
    const dane: unknown = await odp.json();
    if (!obiekt(dane) || dane.wersja !== WERSJA_TABEL) {
      console.warn(
        `Tabele gminy ${teryt}: wersja ${obiekt(dane) ? String(dane.wersja) : 'nieznana'}, gra czyta wersję ${WERSJA_TABEL}`,
      );
      return null;
    }
    return dane as unknown as TabeleGminy;
  } catch (e) {
    console.warn(`Tabele gminy ${teryt}: nie udało się wczytać ${adres}`, e);
    return null;
  }
}

/** Tabele krajowe (trwanie życia, płodność, szablon gospodarstw, marginesy całej Polski). Rzuca wyjątek, gdy nie da
    się ich pobrać albo mają inną wersję: bez nich generator nie ma na czym pracować, nawet dla gminy bez tabeli. */
export async function wczytajKraj(fetchFn: typeof fetch = fetch): Promise<TabeleKraju> {
  const adres = `${KATALOG}kraj.json`;
  const odp = await fetchFn(adres);
  if (!odp.ok) throw new Error(`Tabele krajowe: ${adres} odpowiada ${odp.status}`);
  const dane: unknown = await odp.json();
  if (!obiekt(dane) || dane.wersja !== WERSJA_TABEL) {
    throw new Error(
      `Tabele krajowe: wersja ${obiekt(dane) ? String(dane.wersja) : 'nieznana'}, gra czyta wersję ${WERSJA_TABEL}`,
    );
  }
  return dane as unknown as TabeleKraju;
}
