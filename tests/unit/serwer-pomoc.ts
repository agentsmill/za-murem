/* Serwer gry w procesie testu: baza ':memory:', tani scrypt, własny zegar i klient fetch z jednym ciasteczkiem
   (fetch w Node nie pamięta ciasteczek jak przeglądarka). Używają tego testy serwera i klienta API. */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CIASTECZKO, type OpcjeSerwera, type SerwerGry, stworzSerwer } from '../../server/app.ts';

export interface SerwerTestowy {
  gra: SerwerGry;
  /** adres bazowy, np. http://127.0.0.1:41234 */
  adres: string;
  /** przesuwa zegar serwera o ms */
  czekaj(ms: number): void;
  teraz(): number;
  zamknij(): Promise<void>;
}

export const START = Date.UTC(2026, 9, 18, 2, 0, 0);

export async function serwerTestowy(opcje: Partial<OpcjeSerwera> = {}): Promise<SerwerTestowy> {
  let zegar = START;
  const gra = stworzSerwer({
    baza: ':memory:',
    hasla: { logN: 10, r: 8, p: 1 },
    teraz: () => zegar,
    dziennik: () => {},
    ...opcje,
  });
  const srv = http.createServer((req, res) => gra.obsluz(req, res));
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const { port } = srv.address() as AddressInfo;
  return {
    gra,
    adres: `http://127.0.0.1:${port}`,
    czekaj(ms) {
      zegar += ms;
    },
    teraz: () => zegar,
    zamknij: () =>
      new Promise((ok) => {
        srv.closeAllConnections();
        srv.close(() => {
          gra.zamknij();
          ok();
        });
      }),
  };
}

export interface Odpowiedz {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: odpowiedzi testowe sprawdzamy po polach
  body: any;
  headers: Headers;
  tekst: string;
}

/** fetch z ciasteczkiem sesji jak w przeglądarce: zapamiętuje Set-Cookie i wysyła Cookie */
export function przegladarka(adres: string, stale: Record<string, string> = {}) {
  let ciasteczko = '';
  const pamietaj = (h: Headers) => {
    for (const c of h.getSetCookie()) {
      const [para, ...atrybuty] = c.split(';').map((s) => s.trim());
      const i = para.indexOf('=');
      if (para.slice(0, i) !== CIASTECZKO) continue;
      const kasuj = atrybuty.some((a) => a.toLowerCase() === 'max-age=0') || i === para.length - 1;
      ciasteczko = kasuj ? '' : para;
    }
  };
  /** fetch dla klienta API (src/net/api.ts): adres względny /api/... */
  const fetchJak: typeof fetch = async (wejscie, init = {}) => {
    const url = typeof wejscie === 'string' ? wejscie : wejscie instanceof URL ? wejscie.href : wejscie.url;
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(stale)) headers.set(k, v);
    if (ciasteczko) headers.set('Cookie', ciasteczko);
    const r = await fetch(url.startsWith('http') ? url : adres + url, { ...init, headers });
    pamietaj(r.headers);
    return r;
  };
  return {
    get ciasteczko() {
      return ciasteczko;
    },
    set ciasteczko(c: string) {
      ciasteczko = c;
    },
    fetch: fetchJak,
    async zadanie(
      metoda: string,
      sciezka: string,
      cialo?: unknown,
      naglowki: Record<string, string> = {},
    ): Promise<Odpowiedz> {
      const headers: Record<string, string> = { ...naglowki };
      if (cialo !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type'))
        headers['Content-Type'] = 'application/json';
      const r = await fetchJak(sciezka, {
        method: metoda,
        headers,
        body: cialo === undefined ? undefined : typeof cialo === 'string' ? cialo : JSON.stringify(cialo),
      });
      const tekst = await r.text();
      let body: unknown;
      try {
        body = tekst ? JSON.parse(tekst) : undefined;
      } catch {
        body = undefined;
      }
      return { status: r.status, body, headers: r.headers, tekst };
    },
  };
}
