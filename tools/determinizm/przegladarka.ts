/* Protokół strony testowej w przeglądarce (tools/determinizm/strona.html) dla nóg Chromium, Firefox i WebKit: wczytaj
   stronę, poczekaj na jej wynik, odczytaj go. Samo `waitForFunction(window.wynik)` z limitem czasu czekałoby pełne 15
   minut na stronę, która nigdy nie wystawi wyniku: skrypt, który serwer odrzucił (HTTP 500 na module po błędzie
   transformacji), błąd modułu przed uruchomieniem przebiegu, awaria albo zamknięcie strony. `pilnujStrony` słucha
   zdarzeń strony (pageerror, crash, close, odpowiedzi z błędem HTTP, żądania, które się nie powiodły) i każde z nich
   kończy czekanie od razu błędem z przyczyną. Przerwane żądania (ERR_ABORTED, NS_BINDING_ABORTED) i favicon pomijamy:
   to nie przeszkadza stronie. Nasłuch jest zdejmowany po wyniku, więc awaria po fakcie niczego nie psuje. Moduł nie
   ładuje Playwright (tylko typy), więc testuje się go na udawanej stronie. */

import type { Page, Request, Response } from '@playwright/test';
import type { SpisRoznic, WywolanieJson } from './nagrywanie.ts';
import { pierwszaLinia } from './raport.ts';
import type { WynikOk } from './strona.ts';

const ODPYTYWANIE_MS = 250;

export interface Straz {
  /** odrzucona przy pierwszym zdarzeniu, które znaczy, że wyniku nie będzie; nigdy się nie spełnia */
  awaria: Promise<never>;
  /** zdejmuje nasłuch ze strony */
  zdejmij(): void;
}

const favicon = (adres: string) => /\/favicon\.ico(?:\?|$)/.test(adres);

export function pilnujStrony(strona: Page): Straz {
  let odrzuc: (e: Error) => void = () => {};
  const awaria = new Promise<never>((_, r) => {
    odrzuc = r;
  });
  // awaria może wypaść, zanim ktoś zacznie na nią czekać (podczas goto): brak obsługi to nie błąd procesu
  awaria.catch(() => {});

  const naBladStrony = (e: Error) => odrzuc(new Error(`błąd na stronie: ${pierwszaLinia(e)}`));
  const naAwarie = () => odrzuc(new Error('strona się zawiesiła (awaria przeglądarki)'));
  const naZamkniecie = () => odrzuc(new Error('strona zamknięta, zanim oddała wynik'));
  const naOdpowiedz = (r: Response) => {
    if (r.status() >= 400 && !favicon(r.url())) odrzuc(new Error(`${r.url()}: HTTP ${r.status()}`));
  };
  const naNiepowodzenie = (r: Request) => {
    const powod = r.failure()?.errorText ?? 'nieznana przyczyna';
    if (!/abort|cancel/i.test(powod) && !favicon(r.url()))
      odrzuc(new Error(`żądanie ${r.url()} nie powiodło się: ${powod}`));
  };

  strona.on('pageerror', naBladStrony);
  strona.on('crash', naAwarie);
  strona.on('close', naZamkniecie);
  strona.on('response', naOdpowiedz);
  strona.on('requestfailed', naNiepowodzenie);
  return {
    awaria,
    zdejmij() {
      strona.off('pageerror', naBladStrony);
      strona.off('crash', naAwarie);
      strona.off('close', naZamkniecie);
      strona.off('response', naOdpowiedz);
      strona.off('requestfailed', naNiepowodzenie);
    },
  };
}

/** Wczytuje stronę z zleceniem w adresie i czeka na `window.wynik`; błąd zgłoszony przez stronę (`blad`) to wyjątek. */
export async function wynikStrony(strona: Page, adres: string, limitMs: number): Promise<WynikOk> {
  const straz = pilnujStrony(strona);
  try {
    await Promise.race([strona.goto(adres), straz.awaria]);
    await Promise.race([
      strona.waitForFunction(() => window.wynik, null, { timeout: limitMs, polling: ODPYTYWANIE_MS }),
      straz.awaria,
    ]);
    const wynik = await strona.evaluate(() => window.wynik);
    if (!wynik || 'blad' in wynik) throw new Error(wynik ? wynik.blad : 'strona nie oddała wyniku');
    return wynik;
  } finally {
    straz.zdejmij();
  }
}

/** Strona w trybie kontroli (?akcja=kontrola): nagrane gdzie indziej wywołania Math liczone od nowa w tym silniku. */
export async function kontrolaStrony(
  strona: Page,
  adres: string,
  nagranie: WywolanieJson[],
  limitMs: number,
): Promise<SpisRoznic> {
  const straz = pilnujStrony(strona);
  try {
    await Promise.race([strona.goto(adres), straz.awaria]);
    await Promise.race([
      strona.waitForFunction(() => window.kontroluj, null, { timeout: limitMs, polling: ODPYTYWANIE_MS }),
      straz.awaria,
    ]);
    return await Promise.race([strona.evaluate((n) => window.kontroluj?.(n) ?? {}, nagranie), straz.awaria]);
  } finally {
    straz.zdejmij();
  }
}
