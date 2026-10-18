/* Drobne narzędzia HTTP serwera gry: czytanie ciała z limitem rozmiaru, odpowiedzi JSON z nagłówkami
   bezpieczeństwa, błędy z kodem z protokołu (src/net/protokol.ts), ciasteczka. Tylko node:http. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Blad, KodBledu } from '../src/net/protokol.ts';

/** błąd, który serwer zamienia na odpowiedź z kodem HTTP i kodem błędu z protokołu */
export class BladHttp extends Error {
  readonly status: number;
  readonly kod: KodBledu;
  readonly naglowki: Record<string, string>;
  readonly dodatki: Partial<Blad>;
  constructor(status: number, kod: KodBledu, komunikat: string, naglowki: Record<string, string> = {}, dodatki = {}) {
    super(komunikat);
    this.status = status;
    this.kod = kod;
    this.naglowki = naglowki;
    this.dodatki = dodatki;
  }
}

/** nagłówki każdej odpowiedzi API: bez pamięci podręcznej, bez zgadywania typu, bez osadzania w ramkach */
const NAGLOWKI: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

/** odpowiedź: obiekt jako JSON, gotowy tekst JSON albo nic (204) */
export function wyslij(
  res: ServerResponse,
  status: number,
  cialo?: unknown,
  naglowki: Record<string, string | string[]> = {},
): void {
  for (const [k, v] of Object.entries(NAGLOWKI)) res.setHeader(k, v);
  for (const [k, v] of Object.entries(naglowki)) res.setHeader(k, v);
  if (cialo === undefined || status === 204) {
    res.statusCode = status;
    res.end();
    return;
  }
  const tekst = typeof cialo === 'string' ? cialo : JSON.stringify(cialo);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(tekst));
  res.end(tekst);
}

export function wyslijBlad(res: ServerResponse, b: BladHttp, naglowki: Record<string, string | string[]> = {}): void {
  const cialo: Blad = { blad: b.kod, komunikat: b.message, ...b.dodatki };
  wyslij(res, b.status, cialo, { ...naglowki, ...b.naglowki });
}

/** Ciało żądania jako tekst, najwyżej `limit` bajtów: za duże daje 413, zanim serwer przeczyta resztę. */
export function czytajCialo(req: IncomingMessage, limit: number): Promise<string> {
  const dl = Number(req.headers['content-length']);
  if (Number.isFinite(dl) && dl > limit)
    return Promise.reject(new BladHttp(413, 'za_duze', 'Za duże dane.', { Connection: 'close' }));
  return new Promise((ok, zle) => {
    const kawalki: Buffer[] = [];
    let razem = 0;
    let koniec = false;
    req.on('data', (k: Buffer) => {
      if (koniec) return;
      razem += k.length;
      if (razem > limit) {
        koniec = true;
        zle(new BladHttp(413, 'za_duze', 'Za duże dane.', { Connection: 'close' }));
        req.resume();
        return;
      }
      kawalki.push(k);
    });
    req.on('end', () => {
      if (!koniec) ok(Buffer.concat(kawalki).toString('utf8'));
    });
    req.on('error', (e) => {
      if (!koniec) zle(e);
      koniec = true;
    });
  });
}

/** ciało JSON będące obiektem; zły JSON albo nie-obiekt to 400 */
export async function czytajJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const tekst = await czytajCialo(req, limit);
  let v: unknown;
  try {
    v = JSON.parse(tekst);
  } catch {
    throw new BladHttp(400, 'zle_dane', 'Dane nie są poprawnym JSON.');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BladHttp(400, 'zle_dane', 'Oczekiwany obiekt JSON.');
  return v as Record<string, unknown>;
}

/** ciasteczka z nagłówka Cookie (pierwsze wystąpienie nazwy wygrywa) */
export function ciasteczka(req: IncomingMessage): Map<string, string> {
  const out = new Map<string, string>();
  for (const kawalek of (req.headers.cookie ?? '').split(';')) {
    const i = kawalek.indexOf('=');
    if (i <= 0) continue;
    const nazwa = kawalek.slice(0, i).trim();
    if (!out.has(nazwa)) out.set(nazwa, kawalek.slice(i + 1).trim());
  }
  return out;
}

export interface OpcjeCiasteczka {
  nazwa: string;
  maxAge: number;
  secure: boolean;
}

/** nagłówek Set-Cookie ciasteczka sesji: HttpOnly, SameSite=Lax, tylko dla /api; maxAge 0 kasuje */
export function ciasteczkoSesji(wartosc: string, o: OpcjeCiasteczka): string {
  const czesci = [`${o.nazwa}=${wartosc}`, 'Path=/api', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, o.maxAge)}`];
  if (o.secure) czesci.push('Secure');
  return czesci.join('; ');
}
