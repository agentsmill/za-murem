/* Błędy w wyborze kwadratu osady AI (src/ai/kwadrat.ts), etap 2 osady AI, runda poprawek 1: wyjątek budowy świata nie może
   zniknąć jako zwykłe odrzucenie „siedziba”. Wcześniej `swiatOsady` łapało wyjątek `buildWorld` (i generatora) pustym `catch`
   i szło do następnego kandydata, więc błąd kodu albo uszkodzone geo wyglądały jak kwadrat bez dobrej siedziby. Teraz idą do
   wołającego (zadanie 3 zapisuje „brak: blad”). `buildWorld` podmienia tu atrapa wołająca prawdziwą funkcję, a w wybranym
   wywołaniu rzucająca; osobny plik, bo `vi.mock` działa na cały plik testów. */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PROBY_SIEDZIBY, swiatOsady, wybierzOsade } from '../../src/ai/kwadrat.ts';
import type { DaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { type Uklad, ukladZGeo, zKlucza } from '../../src/world/kwadraty.ts';
import { buildWorld } from '../../src/world/world.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';

vi.mock('../../src/world/world.ts', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../../src/world/world.ts')>();
  return { ...oryginal, buildWorld: vi.fn(oryginal.buildWorld) };
});

const ZIARNO = 11;
const BLAD = 'świat się nie zbudował';
const zbuduj = vi.mocked(buildWorld);
const prawdziwy = zbuduj.getMockImplementation()!;

let dane: DaneMieszkancow | null;
let daneZielonek: DaneMieszkancow | null;
const uklad: Uklad = ukladZGeo(wczytajDemo('przymorze').geo);
const kwadraty = wczytajDemo('przymorze').kwadraty;

beforeAll(async () => {
  dane = await daneDema('przymorze');
  daneZielonek = await daneDema('zielonki');
}, 60_000);

/** atrapa `buildWorld`: wywołania o numerach z `rzuca` (od 1) rzucają, reszta buduje prawdziwy świat */
function rzucaWywolaniami(...rzuca: number[]): void {
  let n = 0;
  zbuduj.mockReset();
  zbuduj.mockImplementation((...args) => {
    n++;
    if (rzuca.includes(n)) throw new Error(BLAD);
    return prawdziwy(...args);
  });
}

describe('wyjątek budowy świata idzie do wołającego', () => {
  it('bez atrapy działa jak zawsze: kwadrat Przymorza (0,−1) daje świat', () => {
    zbuduj.mockReset();
    zbuduj.mockImplementation(prawdziwy);
    expect('odrzucony' in swiatOsady(kwadraty['0,-1'], 0, -1, dane, ZIARNO, uklad)).toBe(false);
    expect(zbuduj).toHaveBeenCalledTimes(1);
  });

  it('pierwszy świat rzuca: swiatOsady rzuca tym samym błędem, a nie zwraca „siedziba”', () => {
    rzucaWywolaniami(1);
    expect(() => swiatOsady(kwadraty['0,-1'], 0, -1, dane, ZIARNO, uklad)).toThrow(BLAD);
    // nie próbuje następnego kandydata po błędzie
    expect(zbuduj).toHaveBeenCalledTimes(1);
  });

  it('drugi świat rzuca (pierwszy kandydat nie ma suchego drzewa, Przymorze (1,0)): błąd nie jest połykany ani omijany', () => {
    // bez atrapy ten kwadrat potrzebuje dwóch prób (pierwsza bez podwórka i suchego drzewa, druga wygrywa)
    zbuduj.mockReset();
    zbuduj.mockImplementation(prawdziwy);
    const bez = swiatOsady(kwadraty['1,0'], 1, 0, dane, ZIARNO, uklad);
    expect('odrzucony' in bez).toBe(false);
    expect(zbuduj).toHaveBeenCalledTimes(2);
    // z błędem w drugim wywołaniu: wyjątek, a nie następny kandydat (trzeci świat) ani odrzucenie
    rzucaWywolaniami(2);
    expect(() => swiatOsady(kwadraty['1,0'], 1, 0, dane, ZIARNO, uklad)).toThrow(BLAD);
    expect(zbuduj).toHaveBeenCalledTimes(2);
  });

  it('wybierzOsade nie przechodzi po błędzie do następnego kwadratu', () => {
    rzucaWywolaniami(1);
    expect(() => wybierzOsade(ZIARNO, kwadraty, dane, uklad)).toThrow(BLAD);
    // ziarno 11: pierwszy w kolejności jest (0,−1) i na nim kończy się zbudowanie światów
    expect(zbuduj).toHaveBeenCalledTimes(1);
  });

  it('w kwadracie bez dobrej siedziby światów jest najwyżej PROBY_SIEDZIBY i wszystkie się budują bez błędu', () => {
    // Zielonki (1,0): siedem domów po dwa pokoje, cztery próby, powód „siedziba” (zwykłe odrzucenie, bez wyjątku)
    zbuduj.mockReset();
    zbuduj.mockImplementation(prawdziwy);
    const z = wczytajDemo('zielonki');
    const [sx, sy] = zKlucza('1,0');
    const r = swiatOsady(z.kwadraty['1,0'], sx, sy, daneZielonek, ZIARNO, ukladZGeo(z.geo));
    expect('odrzucony' in r && r.odrzucony).toBe('siedziba');
    expect(zbuduj).toHaveBeenCalledTimes(PROBY_SIEDZIBY);
  });
});
