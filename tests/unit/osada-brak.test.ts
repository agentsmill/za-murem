/* Osada bez kodu osady (src/ui/osada-brak.ts), etap 2 osady AI, runda poprawek 1 zadania 3 (rozstrzygnięcie 3 kontrolera). Kod osady
   (silnik AI) main.ts ładuje przez `import()` dopiero przy `?osada=1`; gdy ładowanie się nie uda (sieć, wdrożenie w trakcie), nowa
   gra ma ruszyć bez osady: `brak` z powodem `blad` i jedno ostrzeżenie w konsoli, a gra z zapisu, w którym osada jest, dalej kończy
   się dotychczasowym komunikatem błędu wczytania (to sprawdza scenariusz przeglądarkowy osada-modul-blad w tools/shots-osada.ts, bo
   to main.ts decyduje, kiedy osady nie da się zastąpić zaślepką). Tu: sama zaślepka. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { osadaBezKodu } from '../../src/ui/osada-brak.ts';
import { jestStanOsady } from '../../src/ui/zapis.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const wyciszone = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('osadaBezKodu: zaślepka, gdy nie załadował się kod osady', () => {
  it('jedno ostrzeżenie w konsoli z błędem, stan brak z powodem blad, zapis jak każdy brak/blad', () => {
    const ostrzezenia = wyciszone();
    const blad = new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/osada-abc.js');
    const osada = osadaBezKodu(blad);
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
    expect(String(ostrzezenia.mock.calls[0][0])).toContain('Osada AI');
    expect(ostrzezenia.mock.calls[0][1]).toBe(blad);
    expect(osada.stan).toBe('brak');
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
    expect(jestStanOsady(osada.zapisz())).toBe(true);
    expect(osada.podglad()).toEqual({
      stan: 'brak',
      powod: 'blad',
      blad: 'TypeError: Failed to fetch dynamically imported module: https://example.test/assets/osada-abc.js',
    });
    expect(osada.gra).toBeNull();
    expect(osada.swiat).toBeNull();
    expect(osada.odkryta).toBe(false);
    expect(osada.kontakt).toBeUndefined();
    expect(osada.odwolania).toBe(0);
    expect(osada.upadla).toBeNull();
  });

  it('wszystko inne jest bez skutku i bez wyjątku: dane, przygotowanie, kroki, odkrycie, a ostrzeżenie nie powtarza się', () => {
    const ostrzezenia = wyciszone();
    const osada = osadaBezKodu(new Error('x'));
    const przed = JSON.stringify([osada.zapisz(), osada.podglad()]);
    expect(() => {
      osada.dane({});
      osada.przygotuj();
      osada.przygotujCiezkie();
      for (const t of [1, 12000, 12001, 400_000]) osada.krok(t);
      osada.odkryj({ dzien: 4, ludnosc: 10, budowle: 3 });
    }).not.toThrow();
    expect(JSON.stringify([osada.zapisz(), osada.podglad()])).toBe(przed);
    expect(osada.odkryta).toBe(false);
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
  });

  it('tekst błędu jest w jednym wierszu i ucięty; wyjątek bez napisu (obiekt bez prototypu) nie psuje zaślepki', () => {
    wyciszone();
    const dlugi = osadaBezKodu(new Error(`pierwszy wiersz\n${'x'.repeat(2000)}\r\nostatni`)).podglad().blad;
    expect(dlugi).toBeDefined();
    expect(dlugi).not.toMatch(/[\r\n]/);
    expect(dlugi!.length).toBeLessThanOrEqual(310);
    expect(dlugi).toContain('pierwszy wiersz');
    expect(osadaBezKodu(Object.create(null)).podglad().blad).toBe('błąd bez opisu');
    expect(osadaBezKodu('zwykły napis').podglad().blad).toBe('zwykły napis');
    expect(osadaBezKodu(undefined).podglad().blad).toBe('undefined');
  });
});
