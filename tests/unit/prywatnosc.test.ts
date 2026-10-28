/* Informacja o danych osobowych i regulamin (zadanie 12 planu 2026-10-28-premiera-etap-1-fundament): dwie strony
   public/prywatnosc.html i public/regulamin.html, po jednej na stronę, z sekcjami #pl i #en. To szkice do zatwierdzenia
   przez Mateusza (administratora danych), więc test pilnuje tego, co da się sprawdzić bez prawnika: że liczby dni na
   stronach są te same co na serwerze (KLATKI_DNI, KONTA_DNI, kopie bazy, punkt startu), że są miejsca na dane firmy
   i na decyzje, które do niego należą, że strona nie nazywa liczników anonimowymi, że ciasteczko ma prawdziwą nazwę,
   że odnośniki do stron są na karcie startowej i w Menu gry sieciowej, a zdanie o adresie w stopce karty startowej
   zmienia się, gdy adres idzie przez serwer gry. Strony czyta z dysku jak przeglądarka, bez DOM. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CIASTECZKO } from '../../server/app.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { KLATKI_DNI, KONTA_DNI } from '../../src/net/protokol.ts';
import { nalozStatyczne, STATYCZNE, ustawAdresPrzezSerwer } from '../../src/ui/jezyk.ts';
import { menuSheet } from '../../src/ui/okna.ts';
import { htmlSieci } from '../../src/ui/siec.ts';

const KORZEN = path.resolve(import.meta.dirname, '../..');
const czytaj = (rel: string) => fs.readFileSync(path.join(KORZEN, rel), 'utf8');
const strona = (nazwa: 'prywatnosc' | 'regulamin') => czytaj(`public/${nazwa}.html`);

/** treść sekcji #pl albo #en (sekcje nie są zagnieżdżone) */
function sekcja(html: string, j: 'pl' | 'en'): string {
  const m = new RegExp(`<section[^>]*\\bid="${j}"[^>]*>([\\s\\S]*?)</section>`).exec(html);
  if (!m) throw new Error(`brak sekcji #${j}`);
  return m[1];
}
/** tekst widoczny: bez komentarzy i znaczników, z jedną spacją między słowami */
const tekst = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

const FIRMA = ['[NAZWA FIRMY]', '[ADRES]', '[NIP]', '[E-MAIL DO SPRAW DANYCH]'];
const STRONY = ['prywatnosc', 'regulamin'] as const;

afterEach(() => {
  ustawJezyk('pl');
  ustawAdresPrzezSerwer(false);
});

describe('informacja o danych osobowych: te same okresy co serwer', () => {
  const kopieDni = Number(/'ZM_KOPIE_DNI',\s*(\d+),/.exec(czytaj('server/kopie.ts'))?.[1]);
  const startDni = Number(/sesjaDni \?\? (\d+)\)/.exec(czytaj('server/app.ts'))?.[1]);

  it('serwer ma te okresy, które strona ma w tekście (kopie bazy 7 dni, punkt startu 30 dni)', () => {
    expect(kopieDni).toBe(7);
    expect(startDni).toBe(30);
  });

  it('klatki, konta, kopie bazy i punkt startu: liczby w obu językach, na obu stronach tam, gdzie o nich mowa', () => {
    const p = strona('prywatnosc');
    for (const [j, dni] of [
      ['pl', 'dni'],
      ['en', 'days'],
    ] as const) {
      const t = tekst(sekcja(p, j));
      for (const n of [KLATKI_DNI, KONTA_DNI, kopieDni, startDni])
        expect(t, `${j}: ${n} ${dni}`).toContain(`${n} ${dni}`);
    }
    const r = strona('regulamin');
    for (const [j, dni] of [
      ['pl', 'dni'],
      ['en', 'days'],
    ] as const) {
      const t = tekst(sekcja(r, j));
      for (const n of [KLATKI_DNI, KONTA_DNI]) expect(t, `regulamin ${j}: ${n} ${dni}`).toContain(`${n} ${dni}`);
    }
  });
});

describe('informacja o danych osobowych: długość sesji', () => {
  it('sesja konta z nickiem 30 dni, drużyny anonimowej tyle co konto bez gry (KONTA_DNI), jak w serwerze', () => {
    const p = strona('prywatnosc');
    // serwer: anonimowa dostaje co najmniej kontaDni (domyślnie KONTA_DNI), konto z nickiem sesjaDni
    expect(czytaj('server/app.ts')).toMatch(/konto\.anonimowe \? Math\.max\(sesjaMs, kontaMs\) : sesjaMs/);
    const pl = tekst(sekcja(p, 'pl'));
    const en = tekst(sekcja(p, 'en'));
    expect(pl).toContain(`w drużynie bez nicku i hasła ${KONTA_DNI} dni od ostatniego użycia`);
    expect(pl).toContain('w koncie z nickiem 30 dni od ostatniego użycia');
    expect(en).toContain(`for a team without a nickname and password ${KONTA_DNI} days from its last use`);
    expect(en).toContain('for an account with a nickname 30 days from its last use');
  });
});

describe('dwie strony: sekcje #pl i #en, szkic, miejsca na dane firmy', () => {
  for (const nazwa of STRONY) {
    it(`${nazwa}.html: obie sekcje z językiem, przełącznik na górze, szkic w komentarzu na początku`, () => {
      const h = strona(nazwa);
      expect(h.slice(0, 400)).toMatch(/<!--[^>]*SZKIC[^>]*-->/);
      for (const [j, drugi] of [
        ['pl', 'en'],
        ['en', 'pl'],
      ] as const) {
        expect(h).toMatch(
          new RegExp(`<section[^>]*\\bid="${j}"[^>]*\\blang="${j}"|<section[^>]*\\blang="${j}"[^>]*\\bid="${j}"`),
        );
        // przełącznik języka w pierwszych znakach sekcji, przed treścią
        expect(sekcja(h, j).slice(0, 700)).toContain(`href="#${drugi}"`);
      }
      expect(h).toContain('<title>');
      expect(h).toContain('name="viewport"');
    });

    it(`${nazwa}.html: miejsca na dane firmy w obu językach, nic wymyślonego w ich miejsce`, () => {
      const h = strona(nazwa);
      for (const j of ['pl', 'en'] as const) {
        const t = tekst(sekcja(h, j));
        for (const m of FIRMA) expect(t, `${j}: ${m}`).toContain(m);
      }
    });
  }

  it('prywatnosc.html: miejsce na kraj serwera i na podstawę prawną w obu językach', () => {
    const h = strona('prywatnosc');
    for (const j of ['pl', 'en'] as const) {
      const t = tekst(sekcja(h, j));
      expect(t, j).toContain('[KRAJ SERWERA]');
      expect(t, j).toContain('[PODSTAWA PRAWNA — do potwierdzenia]');
    }
  });

  it('strony nie wołają niczego spoza własnych plików poza czcionkami karty startowej (bez skryptów z sieci)', () => {
    for (const nazwa of STRONY) {
      const h = strona(nazwa);
      const skrypty = [...h.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      for (const s of skrypty) expect(s, `${nazwa}: ${s}`).not.toMatch(/\bsrc=/);
      for (const m of h.matchAll(/<link\b[^>]*\bhref="(https?:[^"]+)"/g))
        expect(m[1], nazwa).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/);
    }
  });
});

describe('informacja o danych osobowych: co mówi o danych', () => {
  const menu = (anonimowa: boolean) => menuSheet('x', { anonimowa }).body;

  it('po polsku: dane na serwerze, ciasteczko z prawdziwą nazwą, usunięcie z Menu, prawa i skarga do PUODO', () => {
    ustawJezyk('pl');
    const t = tekst(sekcja(strona('prywatnosc'), 'pl'));
    expect(t).toContain(CIASTECZKO);
    for (const s of ['numer drużyny', 'skrót kodu powrotu', 'położenie zajętych klatek', 'zapis gry', 'dzienne sumy'])
      expect(t, s).toContain(s);
    expect(t).toContain('Usuń drużynę z serwera');
    expect(menu(true)).toContain('Usuń drużynę z serwera');
    for (const s of ['dostęp', 'sprzeciw', 'PUODO', 'Prezes Urzędu Ochrony Danych Osobowych'])
      expect(t, s).toContain(s);
    for (const s of ['Vercel', 'Hetzner', 'Nominatim', 'Photon', 'OpenFreeMap']) expect(t, s).toContain(s);
    expect(sekcja(strona('prywatnosc'), 'pl')).toContain('href="https://vercel.com/legal/privacy-policy"');
  });

  it('po angielsku: to samo, z angielską nazwą polecenia z Menu', () => {
    ustawJezyk('en');
    const t = tekst(sekcja(strona('prywatnosc'), 'en'));
    expect(t).toContain(CIASTECZKO);
    for (const s of [
      'team number',
      'hash of the return code',
      'positions of the occupied stairwells',
      'cloud save',
      'daily totals',
    ])
      expect(t, s).toContain(s);
    expect(t).toContain('Delete the team from the server');
    expect(menu(true)).toContain('Delete the team from the server');
    for (const s of ['access', 'object', 'PUODO']) expect(t, s).toContain(s);
    for (const s of ['Vercel', 'Hetzner', 'Nominatim', 'Photon', 'OpenFreeMap']) expect(t, s).toContain(s);
    expect(sekcja(strona('prywatnosc'), 'en')).toContain('href="https://vercel.com/legal/privacy-policy"');
    // polskich słów gry w angielskim tekście nie ma (nazwa urzędu jest polska z natury)
    expect(t.replace('Prezes Urzędu Ochrony Danych Osobowych', '')).not.toMatch(/drużyn|klatk|zapis gry/i);
  });

  it('liczniki to dzienne sumy, nigdzie „anonimowe”', () => {
    for (const nazwa of STRONY) {
      const h = strona(nazwa);
      for (const j of ['pl', 'en'] as const) expect(tekst(sekcja(h, j)), `${nazwa} ${j}`).not.toMatch(/anonim/i);
    }
  });

  it('mówi, że adres IP i tekst adresu serwer gry nie zapisuje, a Nominatim przy wyszukiwaniu przez serwer nie zna IP gracza', () => {
    const pl = tekst(sekcja(strona('prywatnosc'), 'pl'));
    expect(pl).toMatch(/nie zapisuje[^.]*adres[^.]*IP/i);
    expect(pl).toMatch(/Nominatim[^.]*nie[^.]*adresu IP/i);
    const en = tekst(sekcja(strona('prywatnosc'), 'en'));
    expect(en).toMatch(/does not store[^.]*IP address/i);
    expect(en).toMatch(/Nominatim[^.]*not[^.]*IP address/i);
  });
});

describe('regulamin: co zawiera', () => {
  it('po polsku i po angielsku: gra darmowa, bez gwarancji, usunięcie w każdej chwili, zakaz psucia gry, atrybucja i dane mieszkańców', () => {
    const r = strona('regulamin');
    const pl = tekst(sekcja(r, 'pl'));
    for (const s of [
      'darmowa',
      'bez gwarancji',
      'w każdej chwili',
      'masowe zakładanie drużyn',
      'limit',
      'OpenStreetMap',
      'wymyśleni',
    ])
      expect(pl, s).toContain(s);
    expect(pl).toContain('Usuń drużynę z serwera');
    const en = tekst(sekcja(r, 'en'));
    for (const s of [
      'free',
      'no warranty',
      'at any time',
      'mass creation of teams',
      'limits',
      'OpenStreetMap',
      'made up',
    ])
      expect(en, s).toContain(s);
    expect(en).toContain('Delete the team from the server');
    // strony odsyłają do siebie w tym samym języku (kotwica #pl albo #en)
    for (const j of ['pl', 'en'] as const) {
      expect(sekcja(r, j)).toContain(`href="prywatnosc.html#${j}"`);
      expect(sekcja(strona('prywatnosc'), j)).toContain(`href="regulamin.html#${j}"`);
    }
  });
});

describe('odnośniki do obu stron: karta startowa i Menu gry sieciowej', () => {
  const STANY = ['druzyna', 'logowanie', 'zalogowani'] as const;

  it('blok sieci na karcie startowej we wszystkich trzech stanach: prywatność i regulamin obok siebie, z kotwicą języka gry', () => {
    for (const [j, priv, reg] of [
      ['pl', 'Prywatność', 'Regulamin'],
      ['en', 'Privacy', 'Terms'],
    ] as const) {
      ustawJezyk(j);
      for (const stan of STANY) {
        const h = htmlSieci({ stan, nick: 'Gracz', znak: '#12' });
        expect(h, `${j} ${stan}`).toMatch(
          new RegExp(`<a href="prywatnosc\\.html#${j}"[^>]*target="_blank"[^>]*>${priv}</a>`),
        );
        expect(h, `${j} ${stan}`).toMatch(
          new RegExp(`<a href="regulamin\\.html#${j}"[^>]*target="_blank"[^>]*>${reg}</a>`),
        );
        const linki = /<p class="sc-links">([\s\S]*?)<\/p>/.exec(h)?.[1] ?? '';
        expect(linki.indexOf('prywatnosc.html'), `${j} ${stan}`).toBeGreaterThan(-1);
        expect(linki.indexOf('regulamin.html'), `${j} ${stan}`).toBeGreaterThan(linki.indexOf('prywatnosc.html'));
      }
    }
  });

  it('kotwica odnośników bloku zmienia się z językiem gry (pl → #pl, en → #en)', () => {
    ustawJezyk('en');
    const en = htmlSieci({ stan: 'zalogowani', nick: 'Gracz' });
    expect(en).toContain('href="prywatnosc.html#en"');
    expect(en).not.toContain('prywatnosc.html#pl');
    ustawJezyk('pl');
    const pl = htmlSieci({ stan: 'zalogowani', nick: 'Gracz' });
    expect(pl).toContain('href="regulamin.html#pl"');
    expect(pl).not.toContain('regulamin.html#en');
  });

  it('Menu gry sieciowej (drużyna anonimowa i konto z nickiem) ma oba odnośniki z kotwicą języka, Menu gry bez sieci żadnego', () => {
    for (const j of ['pl', 'en'] as const) {
      ustawJezyk(j);
      for (const anonimowa of [true, false]) {
        const b = menuSheet('x', { anonimowa }).body;
        expect(b, `${j} ${anonimowa}`).toMatch(new RegExp(`<a [^>]*href="prywatnosc\\.html#${j}"[^>]*target="_blank"`));
        expect(b, `${j} ${anonimowa}`).toMatch(new RegExp(`<a [^>]*href="regulamin\\.html#${j}"[^>]*target="_blank"`));
      }
      const bez = menuSheet('x').body;
      expect(bez).not.toContain('prywatnosc.html');
      expect(bez).not.toContain('regulamin.html');
    }
  });

  it('strony mają sekcje #pl i #en, do których kotwice prowadzą', () => {
    for (const nazwa of STRONY)
      for (const j of ['pl', 'en'] as const)
        expect(strona(nazwa), `${nazwa} #${j}`).toMatch(new RegExp(`<section[^>]*\\bid="${j}"`));
  });
});

describe('stopka karty startowej: dokąd idzie adres', () => {
  const wpis = STATYCZNE.find((s) => s.sel === '.start-card > p.fine')!;
  /** udawany korzeń z jednym elementem stopki, jak document dla nalozStatyczne */
  const stopka = () => {
    const el = { innerHTML: '' };
    const root = { querySelectorAll: (sel: string) => (sel === wpis.sel ? [el] : []) } as unknown as ParentNode;
    return { el, naloz: () => nalozStatyczne(root) };
  };

  it('bez sieci albo bez odpowiedzi serwera: adres idzie do Nominatim', () => {
    for (const [j, ma] of [
      ['pl', 'Adres trafia do wyszukiwarki OpenStreetMap (Nominatim)'],
      ['en', 'Your address goes to the OpenStreetMap search (Nominatim)'],
    ] as const) {
      ustawJezyk(j);
      ustawAdresPrzezSerwer(false);
      const s = stopka();
      s.naloz();
      expect(s.el.innerHTML).toContain(ma);
      expect(s.el.innerHTML).not.toContain('Photon');
    }
  });

  it('z siecią i odpowiadającym serwerem: adres idzie przez serwer gry do Nominatim i Photona, atrybucja map zostaje', () => {
    for (const [j, ma] of [
      ['pl', 'Adres trafia do serwera gry, który pyta wyszukiwarki OpenStreetMap (Nominatim), a zapasowo Photona'],
      [
        'en',
        'Your address goes to the game server, which asks the OpenStreetMap search (Nominatim) and, as a fallback, Photon',
      ],
    ] as const) {
      ustawJezyk(j);
      ustawAdresPrzezSerwer(true);
      const s = stopka();
      s.naloz();
      expect(s.el.innerHTML).toContain(ma);
      expect(s.el.innerHTML).not.toContain('trafia do wyszukiwarki OpenStreetMap (Nominatim), mapę');
      for (const a of ['openstreetmap.org/copyright', 'openfreemap.org', 'openmaptiles.org', 'LICENCJE.md'])
        expect(s.el.innerHTML, a).toContain(a);
      expect(s.el.innerHTML).toContain('href="prywatnosc.html"');
    }
  });

  it('zmiana języka po przełączeniu zostaje przy tym samym stanie sieci', () => {
    ustawAdresPrzezSerwer(true);
    ustawJezyk('pl');
    const pl = stopka();
    pl.naloz();
    ustawJezyk('en');
    const en = stopka();
    en.naloz();
    expect(pl.el.innerHTML).toContain('serwera gry');
    expect(en.el.innerHTML).toContain('game server');
  });

  it('angielski wariant z serwerem nie ma polskich słów', () => {
    expect(wpis.htmlSerwer).toBeDefined();
    expect(wpis.htmlSerwer!.en).not.toMatch(/[ąćęłńóśźż]|\b(adres trafia|serwer gry)\b/i);
  });
});

describe('informacja o danych osobowych: poprawki z przeglądu (twierdzenia zgodne z kodem)', () => {
  const pl = () => tekst(sekcja(strona('prywatnosc'), 'pl'));
  const en = () => tekst(sekcja(strona('prywatnosc'), 'en'));
  const adres = czytaj('server/adres.ts');

  it('gra bez serwera nie ma przykładu z osiedlami demo: sprawdzenie serwera i liczniki idą w każdej grze, gdy sieć działa', () => {
    expect(pl()).not.toMatch(/Gra bez serwera \(na przykład/);
    expect(en()).not.toMatch(/The game without the server \(the example estates/);
    expect(pl()).toContain('Gra bez serwera (serwer wyłączony albo nie odpowiada)');
    expect(pl()).toContain('także na przykładowych osiedlach');
    expect(pl()).toContain('otwarcie karty startowej sprawdza, czy serwer działa i czy przeglądarka ma sesję');
    expect(en()).toContain('The game without the server (the server is switched off or does not answer)');
    expect(en()).toContain('the example estates included');
    expect(en()).toContain(
      'just opening the start screen checks that the server works and whether your browser has a session',
    );
  });

  it('usunięcie z Menu dotyczy drużyny bez nicku, konto z nickiem usuwa się przez e-mail (obie strony, oba języki)', () => {
    const wzor = {
      pl: /nie ma w grze przycisku usunięcia[^.]*\[E-MAIL DO SPRAW DANYCH\]/,
      en: /has no delete button in the game[^.]*\[E-MAIL DO SPRAW DANYCH\]/,
    };
    const druzyna = { pl: /powstała sama \(bez nicku\)/, en: /created on its own \(with no username\)/ };
    for (const nazwa of STRONY)
      for (const j of ['pl', 'en'] as const) {
        const t = tekst(sekcja(strona(nazwa), j));
        expect(t, `${nazwa} ${j}`).toMatch(wzor[j]);
        expect(t, `${nazwa} ${j}`).toMatch(druzyna[j]);
      }
  });

  it('menuSheet pokazuje usunięcie tylko drużynie bez nicku, więc strony nie obiecują go wszystkim', () => {
    expect(menuSheet('x', { anonimowa: true }).body).toContain('menu-usun');
    expect(menuSheet('x', { anonimowa: false }).body).not.toContain('menu-usun');
  });

  it('zapis, punkt startu, Overpass: współrzędne punktu przypisanego adresowi, z których da się odczytać adres', () => {
    expect(pl()).toContain('współrzędne punktu, który wyszukiwarka przypisała twojemu adresowi');
    expect(pl()).toContain('z tych współrzędnych da się adres odczytać');
    expect(pl()).toContain(
      'współrzędne punktu startu, czyli w praktyce punktu, który wyszukiwarka przypisała twojemu adresowi (da się z nich odczytać adres)',
    );
    expect(pl()).toContain('wysyła współrzędne punktu, który wyszukiwarka przypisała twojemu adresowi, oraz promień');
    expect(en()).toContain('the coordinates of the point the search assigned to your address');
    expect(en()).toContain('the address can be read from those coordinates');
    expect(en()).toContain(
      'the coordinates of the start point, in practice the point the search assigned to your address (the address can be read from them)',
    );
    expect(en()).toContain('sends the coordinates of the point the search assigned to your address, and a radius');
    // dawne sformułowania o „okolicy” zniknęły
    expect(pl()).not.toContain('współrzędnymi okolicy');
    expect(en()).not.toContain('the coordinates of the area');
  });

  it('pamięć wyników adresów: pełna etykieta ze współrzędnymi, najwyżej 5000 wpisów, 30 dni, 1 dzień dla Photona i braku wyniku', () => {
    expect(Number(/o\.wpisow \?\? (\d+)/.exec(adres)?.[1])).toBe(5000);
    expect(Number(/o\.dniPamieci \?\? (\d+)/.exec(adres)?.[1])).toBe(30);
    expect(adres).toMatch(/Math\.min\(pamietajMs, DOBA\)/);
    // etykieta to display_name z Nominatim w całości, nie tylko ulica i miasto
    expect(adres).toMatch(/label: tekst\(wpis\.display_name\)/);
    expect(pl()).toContain(
      'ulica, numer domu, dzielnica, miasto, powiat, województwo, kod pocztowy i kraj, razem ze współrzędnymi',
    );
    expect(pl()).toContain(
      'najwyżej 5000 wyników: wynik z Nominatim trzymamy 30 dni, a wynik z Photona i wpis o braku wyniku 1 dzień',
    );
    expect(en()).toContain(
      'street, house number, district, city, county, voivodeship, postcode and country, together with the coordinates',
    );
    expect(en()).toContain(
      'at most 5000 results: a result from Nominatim is kept for 30 days, and a result from Photon or a no-result entry for 1 day',
    );
  });

  it('kopie bazy: 7 dni tylko o ile kopie powstają, przy awarii ostatnie dobre zostają dłużej (jak w server/kopie.ts)', () => {
    expect(czytaj('server/kopie.ts')).toContain('stare kasuje się dopiero po udanej nowej');
    expect(pl()).toContain('trzymamy 7 dni, o ile kopie powstają');
    expect(pl()).toContain('Starą kopię kasujemy dopiero po udanej nowej');
    expect(pl()).toContain('ostatnie dobre zostają dłużej niż 7 dni');
    expect(en()).toContain('kept for 7 days, as long as backups are being made');
    expect(en()).toContain('removed only after a new one succeeds');
    expect(en()).toContain('the last good ones stay longer than 7 days');
  });
});

describe('informacja o danych osobowych: ścisłość względem kodu (przegląd całej gałęzi)', () => {
  const pl = () => tekst(sekcja(strona('prywatnosc'), 'pl'));
  const en = () => tekst(sekcja(strona('prywatnosc'), 'en'));

  it('Photon pyta serwer także przy pełnej kolejce i po blokadzie Nominatim, nie tylko gdy Nominatim milczy', () => {
    const adres = czytaj('server/adres.ts');
    // w kodzie: kolejka dłuższa niż 3 s idzie do Photona, po 429 i 403 Nominatim stoi minutę
    expect(adres).toMatch(/o\.czekajMaxMs \?\? 3000/);
    expect(adres).toMatch(/PAUZA_PO_BLOKADZIE_MS = 60_000/);
    expect(adres).toMatch(/e\.status === 429 \|\| e\.status === 403/);
    expect(pl()).toContain('gdy Nominatim nie odpowie albo zwróci błąd');
    expect(pl()).toContain('gdy do Nominatim stoi kolejka dłuższa niż kilka sekund');
    expect(pl()).toContain('przez minutę po tym, jak Nominatim nas zablokował');
    expect(en()).toContain('when Nominatim does not answer or returns an error');
    expect(en()).toContain('when the queue for Nominatim is longer than a few seconds');
    expect(en()).toContain('for a minute after Nominatim has blocked us');
  });

  it('przeglądarka pyta Nominatim sama po każdej porażce serwera poza „nie ma takiego adresu”, także po 429 i 503', () => {
    // w kodzie: tylko nie_ma ze zdaniem KOMUNIKAT_BRAK_ADRESU kończy wyszukiwanie, reszta idzie do Nominatim
    expect(czytaj('src/world/osm.ts')).toMatch(
      /r\.blad === 'nie_ma' && r\.komunikat === KOMUNIKAT_BRAK_ADRESU\) throw nieMaAdresu\(\);\s+\}\s+return geocodeNominatim\(q\)/,
    );
    expect(pl()).toContain('czyli kody 503 i 429');
    expect(pl()).toContain('Jedyny wyjątek to odpowiedź serwera, że wyszukiwarka sprawdziła i takiego adresu nie ma');
    expect(en()).toContain('that is, the codes 503 and 429');
    expect(en()).toContain(
      'The only exception is the server’s answer that the search checked and there is no such address',
    );
  });

  it('przy leżącym serwerze gra dalej pyta /api/zdrowie przy otwarciu karty startowej i nic więcej', () => {
    // w kodzie: init() sprawdza serwer, gdy sieć jest włączona, a bez odpowiedzi kończy; niczego więcej nie wysyła
    const gra = czytaj('src/net/gra.ts');
    expect(gra).toMatch(/if \(!this\.o\.wlaczona\) return;\s+if \(!\(await this\.api\.serwerDostepny\(\)\)\) return;/);
    expect(czytaj('src/net/api.ts')).toMatch(/zadanie<Zdrowie>\('GET', '\/zdrowie'/);
    // tekst() zamienia znaczniki na spacje, więc <code>/api/zdrowie</code> ma wokół siebie spacje
    expect(pl()).toMatch(
      /wysyła do niego tylko pytanie, czy serwer żyje \( \/api\/zdrowie , przy każdym otwarciu karty startowej/,
    );
    expect(pl()).toContain('Gdy gra z sąsiadami jest wyłączona, gra nie wysyła do serwera nic');
    expect(en()).toMatch(
      /sends it only a question whether the server is alive \( \/api\/zdrowie , each time the start screen opens/,
    );
    expect(en()).toContain('When playing with the neighbours is off, the game sends nothing to the server');
    // dawne twierdzenie, że gra bez serwera „nic do niego nie wysyła”, było nieprawdą
    expect(pl()).not.toContain('nic do niego nie wysyła');
    expect(en()).not.toContain('sends nothing to it');
  });

  it('zapis w chmurze: nazwa dzielnicy (data.name) i nazwy budynków, sklepów i usług z OSM są w tekście; znaczniki adresowe i nazwa z cyframi nie', () => {
    // w kodzie: zapisBezAdresu zostawia data.name (poza nazwą z cyframi → „Osiedle”) i tagi budynków poza addr:*
    const protokol = czytaj('src/net/protokol.ts');
    expect(protokol).toMatch(/if \(nazwaJakAdres\(data\)\) out\.name = 'Osiedle'/);
    expect(protokol).toMatch(/filter\(\(\[k\]\) => !k\.startsWith\('addr:'\)\)/);
    expect(pl()).toContain('nazwa dzielnicy albo osiedla, którą podała wyszukiwarka (na przykład „Przymorze Małe”)');
    expect(pl()).toContain('nazwy budynków, sklepów i usług z OpenStreetMap');
    expect(pl()).toContain('znaczniki adresowe addr:* usuwamy');
    expect(en()).toContain('the name of the district or estate that the search gave (for example “Przymorze Małe”)');
    expect(en()).toContain('names of buildings, shops and services from OpenStreetMap');
    expect(en()).toContain('we remove address tags addr:*');
  });
});
