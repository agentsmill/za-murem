import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kontrolaStrony, wynikStrony } from '../../tools/determinizm/przegladarka.ts';

/** udawana strona Playwright: zdarzenia z EventEmitter, a funkcje „ze strony” wykonuje u siebie na globalnym `window` */
class FalszywaStrona extends EventEmitter {
  celu: string[] = [];
  /** ile razy strona czekała na funkcję i z jakim limitem */
  czekania: { timeout: number }[] = [];
  /** czy waitForFunction ma nigdy nie wrócić (strona wisi) */
  wisi = false;
  async goto(adres: string) {
    this.celu.push(adres);
  }
  async waitForFunction(f: () => unknown, _arg: unknown, opcje: { timeout: number; polling: number }) {
    this.czekania.push({ timeout: opcje.timeout });
    const koniec = Date.now() + opcje.timeout;
    return new Promise<void>((resolve, reject) => {
      const tik = setInterval(() => {
        if (!this.wisi && f()) {
          clearInterval(tik);
          resolve();
        } else if (Date.now() >= koniec) {
          clearInterval(tik);
          reject(new Error(`page.waitForFunction: Timeout ${opcje.timeout}ms exceeded.`));
        }
      }, 2);
    });
  }
  async evaluate(f: (arg?: unknown) => unknown, arg?: unknown) {
    return f(arg);
  }
  asPage() {
    return this as unknown as Page;
  }
  dlugoscNasluchu() {
    return ['pageerror', 'crash', 'close', 'response', 'requestfailed'].reduce((s, z) => s + this.listenerCount(z), 0);
  }
}

const odpowiedz = (url: string, status: number) => ({ url: () => url, status: () => status });
const nieudane = (url: string, errorText: string | null) => ({
  url: () => url,
  failure: () => (errorText === null ? null : { errorText }),
});

const okno = globalThis as unknown as { window?: Record<string, unknown> };
beforeEach(() => {
  okno.window = {};
});
afterEach(() => {
  delete okno.window;
});

const ADRES = 'http://127.0.0.1:5173/tools/determinizm/strona.html?demo=zielonki';
const WYNIK = { biegi: [{ skroty: ['a'], swiat: 's', swiatCzesci: {}, ms: 1 }], agent: 'test' };

describe('strona testowa w przeglądarce: wynik i szybkie wykrywanie awarii', () => {
  it('oddaje wynik, gdy strona go wystawi', async () => {
    const strona = new FalszywaStrona();
    setTimeout(() => {
      okno.window = { wynik: WYNIK };
    }, 10);
    const wynik = await wynikStrony(strona.asPage(), ADRES, 5000);
    expect(wynik).toEqual(WYNIK);
    expect(strona.celu).toEqual([ADRES]);
    expect(strona.dlugoscNasluchu(), 'nasłuch zdjęty po wyniku').toBe(0);
  });

  it('błąd zgłoszony przez stronę (window.wynik.blad) to wyjątek z jego treścią', async () => {
    const strona = new FalszywaStrona();
    okno.window = { wynik: { blad: 'Error: demo/zielonki.json: 404\n    at start' } };
    await expect(wynikStrony(strona.asPage(), ADRES, 5000)).rejects.toThrow('Error: demo/zielonki.json: 404');
  });

  it('niezłapany błąd strony (pageerror) kończy czekanie od razu, nie po limicie', async () => {
    const strona = new FalszywaStrona();
    strona.wisi = true;
    setTimeout(() => strona.emit('pageerror', new Error('SyntaxError: nieoczekiwany token')), 10);
    const t0 = Date.now();
    await expect(wynikStrony(strona.asPage(), ADRES, 60_000)).rejects.toThrow(
      'błąd na stronie: SyntaxError: nieoczekiwany token',
    );
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(strona.dlugoscNasluchu()).toBe(0);
  });

  it('awaria przeglądarki (crash) i zamknięcie strony przed wynikiem też kończą czekanie', async () => {
    const a = new FalszywaStrona();
    a.wisi = true;
    setTimeout(() => a.emit('crash'), 10);
    await expect(wynikStrony(a.asPage(), ADRES, 60_000)).rejects.toThrow(/zawiesiła/);
    const b = new FalszywaStrona();
    b.wisi = true;
    setTimeout(() => b.emit('close'), 10);
    await expect(wynikStrony(b.asPage(), ADRES, 60_000)).rejects.toThrow(/zamknięta/);
  });

  it('skrypt, który serwer odrzucił (HTTP 500 na module), kończy czekanie z adresem i statusem', async () => {
    const strona = new FalszywaStrona();
    strona.wisi = true;
    setTimeout(() => strona.emit('response', odpowiedz('http://127.0.0.1:5173/tools/determinizm/strona.ts', 500)), 10);
    await expect(wynikStrony(strona.asPage(), ADRES, 60_000)).rejects.toThrow(
      'http://127.0.0.1:5173/tools/determinizm/strona.ts: HTTP 500',
    );
  });

  it('żądanie, które się nie powiodło (serwer padł), kończy czekanie z przyczyną', async () => {
    const strona = new FalszywaStrona();
    strona.wisi = true;
    setTimeout(
      () =>
        strona.emit(
          'requestfailed',
          nieudane('http://127.0.0.1:5173/tools/determinizm/strona.ts', 'net::ERR_CONNECTION_REFUSED'),
        ),
      10,
    );
    await expect(wynikStrony(strona.asPage(), ADRES, 60_000)).rejects.toThrow(/ERR_CONNECTION_REFUSED/);
  });

  it('nie reaguje na to, co nie przeszkadza: favicon, przerwane żądania, odpowiedzi 2xx i 3xx', async () => {
    const strona = new FalszywaStrona();
    setTimeout(() => {
      strona.emit('response', odpowiedz('http://127.0.0.1:5173/favicon.ico', 404));
      strona.emit('response', odpowiedz('http://127.0.0.1:5173/tools/determinizm/strona.ts', 200));
      strona.emit('response', odpowiedz('http://127.0.0.1:5173/x', 304));
      strona.emit('requestfailed', nieudane('http://127.0.0.1:5173/y', 'net::ERR_ABORTED'));
      strona.emit('requestfailed', nieudane('http://127.0.0.1:5173/z', 'NS_BINDING_ABORTED'));
      strona.emit('requestfailed', nieudane('http://127.0.0.1:5173/favicon.ico', 'net::ERR_FAILED'));
      okno.window = { wynik: WYNIK };
    }, 10);
    await expect(wynikStrony(strona.asPage(), ADRES, 5000)).resolves.toEqual(WYNIK);
  });

  it('awaria po wyniku nie robi nieobsłużonego odrzucenia (nasłuch zdjęty)', async () => {
    const strona = new FalszywaStrona();
    okno.window = { wynik: WYNIK };
    await wynikStrony(strona.asPage(), ADRES, 5000);
    strona.emit('pageerror', new Error('za późno'));
    strona.emit('close');
    await new Promise((r) => setTimeout(r, 20));
  });

  it('strona, która nic nie wystawi, kończy się błędem po limicie czasu', async () => {
    const strona = new FalszywaStrona();
    await expect(wynikStrony(strona.asPage(), ADRES, 60)).rejects.toThrow(/Timeout 60ms/);
    expect(strona.dlugoscNasluchu()).toBe(0);
  });

  it('kontrola nagrania: czeka na window.kontroluj, woła go z nagraniem i oddaje spis', async () => {
    const strona = new FalszywaStrona();
    const spis = { hypot: { wywolan: 1, roznych: 0, przyklady: [] } };
    let dostalo: unknown;
    setTimeout(() => {
      okno.window = {
        kontroluj: (n: unknown) => {
          dostalo = n;
          return spis;
        },
      };
    }, 10);
    await expect(
      kontrolaStrony(strona.asPage(), 'http://127.0.0.1:5173/s.html?akcja=kontrola', [['hypot', [3, 4], 5]], 5000),
    ).resolves.toEqual(spis);
    expect(dostalo).toEqual([['hypot', [3, 4], 5]]);
  });

  it('kontrola nagrania też nie czeka limitu, gdy strona zgłosi błąd', async () => {
    const strona = new FalszywaStrona();
    strona.wisi = true;
    setTimeout(() => strona.emit('pageerror', new Error('Error: nie ma modułu')), 10);
    const t0 = Date.now();
    await expect(kontrolaStrony(strona.asPage(), 'http://x/s.html?akcja=kontrola', [], 60_000)).rejects.toThrow(
      /nie ma modułu/,
    );
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
