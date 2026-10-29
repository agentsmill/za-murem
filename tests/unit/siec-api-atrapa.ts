/* Udawane API gry sieciowej dla testów GraSieciowa (src/net/gra.ts): serwer działa, gracz ma sesję albo nie (konto z
   nickiem, drużyna anonimowa), zajęte klatki, zapis w chmurze, kody powrotu, nowy kod powrotu na żądanie i usunięcie
   drużyny są w pamięci, a dziennik `log` mówi, które wywołania poszły. Wspólne dla siec.test.ts i siec-kod.test.ts. */

import type { ApiGry, Wynik } from '../../src/net/api.ts';
import {
  type Ja,
  type KodBledu,
  type KodPowrotu,
  normalizujKod,
  type ZajetaKlatka,
  type ZajetaOdpowiedz,
  type ZajmijKlatke,
} from '../../src/net/protokol.ts';

export const ok = <T>(dane: T, status = 200): Wynik<T> => ({ ok: true, status, dane });
export const zle = <T>(status: number, blad: KodBledu, komunikat = 'błąd'): Wynik<T> => ({
  ok: false,
  status,
  blad,
  komunikat,
});

/** Kod powrotu, który udawany serwer wydaje za n-tym razem (od 1): w kształcie XXXX-XXXX-XXXX z alfabetu kodu, a cyfra
    od 2, bo alfabet nie ma 0 ani 1 (KOD_ALFABET w src/net/protokol.ts) */
export const kodTestowy = (n: number): string => `ABCD-EFGH-JK${n + 1}M`;

/** Ja z serwera: nick konta albo „#<id>” drużyny anonimowej; `kod`: drużyna ma już kod powrotu (Ja.kod) */
export const jaSerwera = (znak: string, kod = false): Ja => ({
  nick: znak.startsWith('#') ? null : znak,
  utworzone: 1,
  klatki: 0,
  zapis: false,
  anonimowe: znak.startsWith('#'),
  znak,
  kod,
});

/** udawane API dla GraSieciowa: serwer działa, gracz zalogowany (nick null: bez sesji), zapis i klatki w pamięci */
export function udawaneApiGry(
  o: {
    /** konto z nickiem z ważną sesją (domyślnie „Sasiad”; null: bez sesji) */
    nick?: string | null;
    /** drużyna anonimowa z ważną sesją (jej znak, np. „#7”), zamiast konta z nickiem */
    anonimowa?: string;
    /** serwer gry nie odpowiada (GitHub Pages, serwer leży) */
    bezSerwera?: boolean;
    zajeteNaStarcie?: ZajetaKlatka[];
    /** lista z serwera przy następnych pytaniach (odświeżanie w trakcie gry) */
    zajetePozniej?: ZajetaKlatka[];
    /** odpowiedź na zajęcie klatki w trakcie gry (bez niej: zajęta dla nas) */
    zajmij?: (k: ZajmijKlatke) => Wynik<ZajetaOdpowiedz>;
    /** zapis w chmurze */
    chmura?: { dane: unknown; wersja: number };
    /** odpowiedź na założenie drużyny (bez niej: nowa drużyna „#7”, od razu z sesją) */
    druzyna?: () => Wynik<Ja>;
    /** kody powrotu (w postaci znormalizowanej) → znak drużyny */
    kody?: Record<string, string>;
    /** odpowiedź na punkt startu, n-te wywołanie od 1 (bez niej: przyjęty) */
    start?: (n: number) => Wynik<undefined>;
    /** zajete odpowiada 409 brak_startu, dopóki punkt startu nie został podany (jak serwer po restarcie) */
    wymagaStartu?: boolean;
    /** odpowiedź na nowy kod powrotu, n-te wywołanie od 1 (bez niej: kodTestowy(n)); udany kod ustawia Ja.kod sesji */
    nowyKod?: (n: number) => Wynik<KodPowrotu>;
    /** drużyna albo konto z sesją z początku ma już kod powrotu (Ja.kod prawda), jak drużyna po poprzedniej grze */
    maKod?: boolean;
    /** odpowiedź na usunięcie drużyny (bez niej: 204) */
    usunDruzyne?: () => Wynik<undefined>;
    /** GET /api/konto bez sesji jak serwer sprzed premiery: 401 brak_sesji zamiast 200 z null */
    stare401?: boolean;
  } = {},
) {
  const log: string[] = [];
  let pytan = 0;
  let startPodany = false;
  const nick = o.nick === undefined ? 'Sasiad' : o.nick;
  let sesja: Ja | null = o.anonimowa ? jaSerwera(o.anonimowa, o.maKod) : nick ? jaSerwera(nick, o.maKod) : null;
  let zawsze409 = false;
  let startow = 0;
  let kodow = 0;
  const api = {
    serwerDostepny: async () => !o.bezSerwera,
    ja: async (): Promise<Wynik<Ja | null>> =>
      sesja ? ok(sesja) : o.stare401 ? zle(401, 'brak_sesji', 'Nie jesteście zalogowani.') : ok(null),
    druzyna: async () => {
      log.push('druzyna');
      const r = o.druzyna ? o.druzyna() : ok(jaSerwera('#7'), 201);
      if (r.ok) sesja = r.dane;
      return r;
    },
    powrot: async (kod: string) => {
      log.push(`powrot ${kod}`);
      const znak = o.kody?.[normalizujKod(kod) ?? ''];
      if (!znak) return zle<Ja>(401, 'zly_kod', 'Ten kod nie pasuje do żadnej drużyny.');
      // kto wraca kodem, ten kod ma
      sesja = jaSerwera(znak, true);
      return ok(sesja);
    },
    nowyKod: async () => {
      log.push('kod');
      kodow++;
      const r = o.nowyKod ? o.nowyKod(kodow) : ok<KodPowrotu>({ kod: kodTestowy(kodow) });
      if (r.ok && sesja) sesja = { ...sesja, kod: true };
      return r;
    },
    usunDruzyne: async () => {
      log.push('usun-druzyne');
      const r = o.usunDruzyne ? o.usunDruzyne() : ok(undefined, 204);
      if (r.ok) sesja = null;
      return r;
    },
    punktStartu: async () => {
      log.push('start');
      const r = o.start ? o.start(++startow) : ok(undefined, 204);
      if (r.ok) startPodany = true;
      return r;
    },
    pobierzZapis: async () => (o.chmura ? ok(o.chmura) : zle(404, 'brak_zapisu')),
    zwolnijWszystkie: async () => {
      log.push('zwolnij');
      return ok(undefined, 204);
    },
    zajete: async () => {
      log.push('zajete');
      if (o.wymagaStartu && (zawsze409 || !startPodany))
        return zle(409, 'brak_startu', 'Serwer nie zna punktu startu.');
      pytan++;
      return ok({ klatki: (pytan > 1 ? o.zajetePozniej : undefined) ?? o.zajeteNaStarcie ?? [] });
    },
    zajmij: async (k: ZajmijKlatke) => {
      log.push(`zajmij ${k.klucz}`);
      return o.zajmij ? o.zajmij(k) : ok({ klatka: { ...k, moja: true, siedziba: false } }, 201);
    },
    wyslijZapis: async (_dane: unknown, wersja?: number) => {
      log.push(`chmura ${wersja ?? '-'}`);
      return ok({ wersja: (wersja ?? 0) + 1, zmieniony: 1, rozmiar: 1 });
    },
    usunZapis: async () => {
      log.push('usun');
      return ok(undefined, 204);
    },
    adres: async () => zle(404, 'nie_ma'),
  } as unknown as ApiGry;
  /** serwer wstał od nowa: punkty startu zniknęły z pamięci, sesje zostały w bazie; upiera: i po punkcie startu
      zajete dalej odpowiada brak_startu */
  const restart = (upiera = false) => {
    startPodany = false;
    zawsze409 = upiera;
  };
  return { api, log, restart };
}
