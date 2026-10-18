/* Klient API gry sieciowej (etap 1, docs/superpowers/specs/2026-10-18-multiplayer-design.md): fetch do /api tej
   samej domeny z ciasteczkiem sesji (credentials: 'same-origin'; ciasteczko jest HttpOnly, więc kod gry go nie
   widzi), typy i kody błędów z src/net/protokol.ts.

   Każda metoda zwraca Wynik: { ok: true, dane } albo { ok: false, blad, komunikat }, bez wyjątków; brak sieci to
   blad 'siec', przekroczony czas 'czas', odpowiedź, która nie jest JSON-em z serwera gry (np. strona 404 z GitHub
   Pages), 'brak_serwera'. serwerDostepny() mówi, czy pod /api odpowiada serwer gry: na Pages i w demach offline
   go nie ma i gra działa jak dotąd.

   Nic tu nie rusza gry. Etap 2 podepnie klienta pod ekran startowy i symulację: odpowiedzi serwera wchodzą do gry
   tylko jako jawne wejście startu albo polecenie w kolejce stanu, nigdy w środku kroku symulacji. */

import {
  type Blad,
  type DaneLogowania,
  type Ja,
  type KodBledu,
  type ListaKlatek,
  type Prostokat,
  type WyslijZapis,
  type ZajetaOdpowiedz,
  type ZajmijKlatke,
  type ZapisanoOdpowiedz,
  type ZapisChmura,
  type Zdrowie,
  zapisBezAdresu,
} from './protokol.ts';

export type Wynik<T> =
  | { ok: true; status: number; dane: T }
  | {
      ok: false;
      /** kod HTTP; 0, gdy odpowiedzi nie było */
      status: number;
      blad: KodBledu;
      komunikat: string;
      /** przy 429: za ile sekund spróbować */
      ponowZa?: number;
      /** przy konflikt_wersji: wersja zapisu na serwerze */
      wersja?: number;
    };

export interface OpcjeApi {
  /** adres API, domyślnie '/api' (ta sama domena co gra) */
  baza?: string;
  /** fetch do podmiany w testach */
  fetch?: typeof fetch;
  /** czas na odpowiedź w ms (domyślnie 10 s; zdrowie 3 s) */
  czas?: number;
}

const KOMUNIKATY: Partial<Record<KodBledu, string>> = {
  siec: 'Brak połączenia z serwerem gry.',
  czas: 'Serwer gry nie odpowiedział na czas.',
  brak_serwera: 'Pod tym adresem nie ma serwera gry.',
};

/** Klient API; jeden na grę. */
export function utworzApi(opcje: OpcjeApi = {}) {
  const baza = (opcje.baza ?? '/api').replace(/\/$/, '');
  const f = opcje.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const czasDomyslny = opcje.czas ?? 10_000;

  const porazka = (status: number, blad: KodBledu, komunikat?: string): Wynik<never> => ({
    ok: false,
    status,
    blad,
    komunikat: komunikat ?? KOMUNIKATY[blad] ?? 'Coś poszło nie tak.',
  });

  async function zadanie<T>(metoda: string, sciezka: string, cialo?: unknown, czas = czasDomyslny): Promise<Wynik<T>> {
    const stop = new AbortController();
    const zegar = setTimeout(() => stop.abort(), czas);
    let r: Response;
    try {
      r = await f(baza + sciezka, {
        method: metoda,
        credentials: 'same-origin',
        headers:
          cialo === undefined
            ? { Accept: 'application/json' }
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: cialo === undefined ? undefined : JSON.stringify(cialo),
        signal: stop.signal,
      });
    } catch {
      clearTimeout(zegar);
      return porazka(0, stop.signal.aborted ? 'czas' : 'siec');
    }
    try {
      if (r.status === 204) return { ok: true, status: 204, dane: undefined as T };
      const typ = r.headers.get('content-type') ?? '';
      if (!typ.includes('application/json')) return porazka(r.status, 'brak_serwera');
      const json = (await r.json()) as unknown;
      if (r.ok) return { ok: true, status: r.status, dane: json as T };
      const b = json as Partial<Blad>;
      if (typeof b?.blad !== 'string') return porazka(r.status, 'brak_serwera');
      const ponow = Number(r.headers.get('retry-after'));
      return {
        ok: false,
        status: r.status,
        blad: b.blad,
        komunikat: typeof b.komunikat === 'string' ? b.komunikat : (KOMUNIKATY[b.blad] ?? 'Coś poszło nie tak.'),
        ...(ponow > 0 ? { ponowZa: ponow } : {}),
        ...(typeof b.wersja === 'number' ? { wersja: b.wersja } : {}),
      };
    } catch {
      return porazka(r.status, stop.signal.aborted ? 'czas' : 'brak_serwera');
    } finally {
      clearTimeout(zegar);
    }
  }

  const klucz = (k: string) => encodeURIComponent(k);
  /** odpowiedź /api/zdrowie (krótki czas, bo pytamy przy starcie gry) */
  const zdrowie = () => zadanie<Zdrowie>('GET', '/zdrowie', undefined, Math.min(czasDomyslny, 3000));

  return {
    zdrowie,
    /** czy pod /api jest serwer gry Za Murem; false na GitHub Pages, offline i przy innym serwerze */
    async serwerDostepny(): Promise<boolean> {
      const r = await zdrowie();
      return r.ok && r.dane?.ok === true && r.dane.gra === 'za-murem';
    },
    /** nowe konto, od razu zalogowane */
    zaloz: (nick: string, haslo: string) => zadanie<Ja>('POST', '/konto', { nick, haslo } satisfies DaneLogowania),
    zaloguj: (nick: string, haslo: string) => zadanie<Ja>('POST', '/sesja', { nick, haslo } satisfies DaneLogowania),
    wyloguj: () => zadanie<undefined>('DELETE', '/sesja'),
    /** zalogowane konto albo blad 'brak_sesji' */
    ja: () => zadanie<Ja>('GET', '/konto'),
    /** usuwa konto razem z klatkami i zapisem w chmurze (hasło jeszcze raz) */
    usunKonto: (haslo: string) => zadanie<undefined>('DELETE', '/konto', { haslo }),
    /** zajęte klatki w prostokącie (stopnie); cudze mają moja: false i nic więcej o drużynie */
    zajete: (p: Prostokat) => {
      const q = new URLSearchParams({ s: String(p.s), w: String(p.w), n: String(p.n), e: String(p.e) });
      return zadanie<ListaKlatek>('GET', `/klatki?${q}`);
    },
    /** zajmuje klatkę; blad 'zajeta' (409), gdy ma ją inna drużyna */
    zajmij: (k: ZajmijKlatke) => zadanie<ZajetaOdpowiedz>('POST', '/klatki', k),
    zwolnij: (kluczKlatki: string) => zadanie<undefined>('DELETE', `/klatki/${klucz(kluczKlatki)}`),
    zwolnijWszystkie: () => zadanie<undefined>('DELETE', '/klatki/moje'),
    moje: () => zadanie<ListaKlatek>('GET', '/klatki/moje'),
    pobierzZapis: () => zadanie<ZapisChmura>('GET', '/zapis'),
    /** zapis gry w chmurze bez tekstu adresu (data.addr i data.street znikają tutaj, zanim cokolwiek wyjdzie);
        wersja to ostatnio widziana wersja zapisu (0: nowy), bez niej serwer nadpisuje */
    wyslijZapis: (dane: Record<string, unknown>, wersja?: number) =>
      zadanie<ZapisanoOdpowiedz>('PUT', '/zapis', {
        dane: zapisBezAdresu(dane),
        ...(wersja === undefined ? {} : { wersja }),
      } satisfies WyslijZapis),
    usunZapis: () => zadanie<undefined>('DELETE', '/zapis'),
  };
}

export type ApiGry = ReturnType<typeof utworzApi>;
