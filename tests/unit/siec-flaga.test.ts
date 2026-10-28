/* Flaga gry sieciowej (src/net/flaga.ts): ?siec=1 włącza, ?siec=0 wyłącza, bez parametru decyduje VITE_SIEC z budowy
   strony (podgląd gałęzi na Vercelu ma VITE_SIEC=1, produkcja nie ma). Do tego miejsca, które z niej korzystają:
   osada AI (nie działa razem z siecią) i adres ekranu startowego po „od nowa” (src/ui/zapis.ts). */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { siecWlaczona } from '../../src/net/flaga.ts';
import { adresStartowy, osadaOdrzuconaPrzezSiec, osadaWlaczona } from '../../src/ui/zapis.ts';

const adres = (q: string) => new URLSearchParams(q);

afterEach(() => vi.unstubAllEnvs());

describe('siecWlaczona (src/net/flaga.ts)', () => {
  it('?siec=1 włącza, ?siec=0 wyłącza nawet z VITE_SIEC=1, bez parametru decyduje VITE_SIEC', () => {
    expect(siecWlaczona(adres('?siec=1'), {})).toBe(true);
    expect(siecWlaczona(adres('?siec=1'), { VITE_SIEC: '0' })).toBe(true);
    expect(siecWlaczona(adres('?siec=0'), { VITE_SIEC: '1' })).toBe(false);
    expect(siecWlaczona(adres('?siec=0'), {})).toBe(false);
    expect(siecWlaczona(adres(''), { VITE_SIEC: '1' })).toBe(true);
    expect(siecWlaczona(adres('?demo=przymorze&speed=0'), { VITE_SIEC: '1' })).toBe(true);
    expect(siecWlaczona(adres(''), {})).toBe(false);
    expect(siecWlaczona(adres(''), { VITE_SIEC: '0' })).toBe(false);
    expect(siecWlaczona(adres(''), { VITE_SIEC: 'true' })).toBe(false);
  });

  it('inna wartość parametru niż 0 i 1 to brak parametru: decyduje VITE_SIEC', () => {
    expect(siecWlaczona(adres('?siec=2'), { VITE_SIEC: '1' })).toBe(true);
    expect(siecWlaczona(adres('?siec=2'), {})).toBe(false);
    expect(siecWlaczona(adres('?siec='), { VITE_SIEC: '1' })).toBe(true);
    expect(siecWlaczona(adres('?siec'), {})).toBe(false);
  });

  it('bez podanego env czyta import.meta.env.VITE_SIEC (w Node bez Vite pusty, więc wyłączona)', () => {
    expect(siecWlaczona(adres(''))).toBe(false);
    vi.stubEnv('VITE_SIEC', '1');
    expect(siecWlaczona(adres(''))).toBe(true);
    expect(siecWlaczona(adres('?siec=0'))).toBe(false);
    vi.stubEnv('VITE_SIEC', '');
    expect(siecWlaczona(adres(''))).toBe(false);
    expect(siecWlaczona(adres('?siec=1'))).toBe(true);
  });
});

describe('miejsca, które czytają flagę (src/ui/zapis.ts)', () => {
  it('osada AI: nowa gra z włączoną siecią jej nie dostaje, także przez VITE_SIEC; ?siec=0 ją przywraca', () => {
    expect(osadaWlaczona(null, adres('?osada=1'))).toBe(true);
    vi.stubEnv('VITE_SIEC', '1');
    expect(osadaWlaczona(null, adres('?osada=1'))).toBe(false);
    expect(osadaOdrzuconaPrzezSiec(null, adres('?osada=1'))).toBe(true);
    expect(osadaWlaczona(null, adres('?osada=1&siec=0'))).toBe(true);
    expect(osadaOdrzuconaPrzezSiec(null, adres('?osada=1&siec=0'))).toBe(false);
    // wczytana gra niczego nie odrzuca
    expect(osadaOdrzuconaPrzezSiec({ osada: undefined }, adres('?osada=1'))).toBe(false);
  });

  it('„od nowa” przenosi tylko to, co zmienia flagę względem domyślnej: siec=1 bez VITE_SIEC, siec=0 z VITE_SIEC', () => {
    expect(adresStartowy('/', '?siec=1')).toBe('/?siec=1');
    expect(adresStartowy('/', '?siec=0')).toBe('/');
    vi.stubEnv('VITE_SIEC', '1');
    expect(adresStartowy('/', '')).toBe('/');
    expect(adresStartowy('/', '?siec=1')).toBe('/');
    expect(adresStartowy('/', '?siec=0&pietra=1')).toBe('/?siec=0&pietra=1');
    expect(adresStartowy('/za-murem/', '?demo=przymorze&siec=0&lang=en')).toBe('/za-murem/?siec=0&lang=en');
  });
});
