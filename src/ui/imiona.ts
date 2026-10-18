/* Zmiana imienia osoby z generatora mieszkańców (spec §7, §9, §10): edytor w karcie osoby, pamięć w przeglądarce
   i zastosowanie zmian do stanu gry. Zmienia się tylko imię; nazwisko, wiek, rodzina i historia zostają wylosowane.

   Edytor (`edytorImienia`): siedem pól z formami imienia (mianownik to samo imię), podpowiedzianymi przez odmianę
   z src/mieszkancy/odmiana.ts (`podpowiedz`); gdy zgadywacz nie jest pewny (`pewne: false`), sześć pól form ma klasę
   „niepewne” i pod nimi stoi podpowiedź, żeby je sprawdzić. Z zapisaną zmianą pola mają jej formy i jest przycisk
   przywrócenia imienia z generatora. Obsługę zdarzeń (pisanie, Zapisz, Anuluj, Przywróć, Escape) robi main.ts.
   Wpisane formy sprawdza `zmianaZPol`: po obcięciu spacji 1–24 znaki imienia (formy do 30), litery alfabetu
   łacińskiego (także polskie), spacja, łącznik i apostrof, każdy człon od litery. Wszystko, co trafia do HTML, idzie
   przez `esc`, a imię gracza i tak nie ma znaków HTML, więc bezpiecznie wchodzi też do tekstów gry (kronika, karty).

   Pamięć (`wczytajZmiany`, `zapiszZmiane`): tylko localStorage gracza, klucz IMIONA_KEY, w nim zmiany po skrócie
   adresu (`hashString` z tego samego napisu adresu co zapis gry, `Loaded.addr`), a w adresie po `Osoba.id` (`ref`
   osoby gry). Wpis niesie też płeć i imię z generatora (`f`, `gen`), żeby po aktualizacji tabel nie trafił na inną
   osobę pod tym samym `ref` (`dotyczy`). Nic nie idzie do sieci, do repo ani do zapisu gry poza samym imieniem osoby
   w stanie. Uszkodzony JSON albo zły wpis to brak zmian; przeglądarka bez dostępu do pamięci (tryb prywatny) to brak
   zmian bez wyjątku.

   Gra z sąsiadami (`imionaWGrze`): bez zmiany imion i bez stosowania zapisanych zmian, bo zapis gry (osoby, kronika)
   idzie tam na serwer gry, a imiona gracza mają zostać tylko w przeglądarce (K5-R20).

   Stan gry (`zastosujZmiany`): imię i pierwszy człon `name` osób z `ref`, a z danymi mieszkańców także historie osób
   siedziby i linijki rodziny ich krewnych (`osobyZeZmianami` z src/sim/lokatorzy.ts; bez wpisu osoba wraca do imienia
   z generatora). Wpis, który nie dotyczy osoby pod swoim `ref` (inna płeć albo inne imię z generatora po aktualizacji
   tabel), jest pomijany, ale zostaje w pamięci. Sierota to tylko wpis z budynku siedziby (`ref` zaczyna się od
   klucza jej budynku), którego osoby nie ma ani w grze, ani w budynku: main.ts pokazuje raz `wyprowadzka` w kronice
   i usuwa wpis z pamięci. Wpisy innych budynków pod tym samym adresem (inna siedziba w grze z sąsiadami, zapasowy
   budynek z innym kluczem) zostają. Czyste i deterministyczne. */

import { g, type Person } from '../content/people.ts';
import { hashString } from '../core/rng.ts';
import { ROK_GRY } from '../mieszkancy/generuj.ts';
import type { Odmiana } from '../mieszkancy/historie.ts';
import { type Formy, normalizuj, odmien, PRZYPADKI, type Przypadek } from '../mieszkancy/odmiana.ts';
import type { Osoba } from '../mieszkancy/typy.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { type LokatorzyGry, type OsobaGry, osobyZeZmianami, type ZmianaImienia } from '../sim/lokatorzy.ts';
import { FIKCJA, many } from './karta.ts';
import { esc } from './tekst.ts';

export type { ZmianaImienia };

export const IMIONA_KEY = 'za-murem-0.4-imiona';
/** najdłuższe imię i najdłuższa forma w znakach */
export const IMIE_MAX = 24;
export const FORMA_MAX = 30;

/** to, czego potrzeba z localStorage (atrapa w testach) */
export type Magazyn = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// ---------------------------------------------------------------- sprawdzanie

/** litera alfabetu łacińskiego (z polskimi i innymi akcentami w postaci złożonej) */
const L = String.raw`(?:(?=\p{L})\p{Script=Latin})`;
/** człony od litery, z apostrofem w środku albo na końcu, rozdzielone jedną spacją albo łącznikiem */
const IMIE = new RegExp(`^${L}(?:${L}|['’])*(?:[- ]${L}(?:${L}|['’])*)*$`, 'u');

const oczysc = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Słowa przed polem formy (jak w spec §7: „o Halinie”, „pani Halino”) i nazwa przypadku do podpowiedzi. */
const POLA: Record<Przypadek, { przed: (f: boolean) => string; nazwa: string }> = {
  mian: { przed: () => 'imię', nazwa: 'mianownik: kto?' },
  dop: { przed: () => 'nie ma', nazwa: 'dopełniacz: kogo? czego?' },
  cel: { przed: () => 'dać', nazwa: 'celownik: komu?' },
  bier: { przed: () => 'widzę', nazwa: 'biernik: kogo?' },
  narz: { przed: () => 'z', nazwa: 'narzędnik: z kim?' },
  msc: { przed: () => 'o', nazwa: 'miejscownik: o kim?' },
  wol: { przed: (f) => g({ f }, 'panie', 'pani'), nazwa: 'wołacz' },
};

type Bledne = { blad: string; pole: Przypadek };

/** Siedem form z pól: oczyszczone (spacje, wielka litera jak w `normalizuj`) albo pierwszy błąd z nazwą pola. */
function formyZPol(pola: Partial<Record<Przypadek, string>>, f: boolean): { formy: Formy } | Bledne {
  const formy = {} as Formy;
  for (const c of PRZYPADKI) {
    const v = oczysc(String(pola[c] ?? ''));
    const max = c === 'mian' ? IMIE_MAX : FORMA_MAX;
    const kto = c === 'mian' ? 'Imię' : `Forma „${POLA[c].przed(f)} …”`;
    if (!v) return { blad: c === 'mian' ? 'Wpiszcie imię.' : `Uzupełnijcie formę „${POLA[c].przed(f)} …”.`, pole: c };
    if (v.length > max) return { blad: `${kto} może mieć najwyżej ${many(max, 'znak', 'znaki', 'znaków')}.`, pole: c };
    if (!IMIE.test(v)) return { blad: `${kto} może mieć tylko litery, spację, łącznik i apostrof.`, pole: c };
    // NFC także po zmianie wielkości liter („İLKA” małymi to i z kropką osobno), żeby drugie sprawdzenie (wpis
    // z pamięci) dało to samo
    formy[c] = normalizuj(v).normalize('NFC');
  }
  return { formy };
}

/** najdłuższe imię z generatora we wpisie (tylko porównywane, nigdy nie trafia na stronę) */
const GEN_MAX = 64;

/** Zmiana imienia z wpisanych pól (klucze jak `Przypadek`, `mian` to imię) dla osoby płci `f` z imieniem z generatora
    `gen` (gdy znane, `imieZGeneratora`), albo pierwszy błąd z komunikatem dla gracza i nazwą pola, które go ma. */
export function zmianaZPol(
  pola: Partial<Record<Przypadek, string>>,
  f: boolean,
  gen?: string,
): { zmiana: ZmianaImienia } | Bledne {
  const w = formyZPol(pola, f);
  if ('blad' in w) return w;
  const zmiana: ZmianaImienia = { imie: w.formy.mian, formy: w.formy, f };
  if (gen && gen.length <= GEN_MAX) zmiana.gen = gen;
  return { zmiana };
}

/** Wpis z pamięci, jeśli ma dobry kształt i dobre formy (pamięć jest w rękach gracza, więc sprawdzamy jak pola). */
function poprawna(z: unknown): ZmianaImienia | null {
  if (!z || typeof z !== 'object') return null;
  const { imie, formy, f, gen } = z as { imie?: unknown; formy?: unknown; f?: unknown; gen?: unknown };
  if (typeof imie !== 'string' || !formy || typeof formy !== 'object') return null;
  if (gen !== undefined && (typeof gen !== 'string' || !gen || gen.length > GEN_MAX)) return null;
  const w = formyZPol({ ...(formy as Partial<Record<Przypadek, string>>), mian: imie }, f === true);
  if ('blad' in w || w.formy.mian !== imie) return null;
  const ok: ZmianaImienia = { imie, formy: w.formy };
  if (typeof f === 'boolean') ok.f = f;
  if (typeof gen === 'string') ok.gen = gen;
  return ok;
}

/** Czy wpis dotyczy osoby z generatora o imieniu `gen` i płci `f` (wpis bez tych pól, sprzed ich zapisywania, pasuje
    do każdej). */
const dlaOsoby = (z: ZmianaImienia, gen: string, f: boolean): boolean =>
  (z.f === undefined || z.f === f) && (z.gen === undefined || z.gen === gen);

/** Czy wpis dotyczy osoby gry `p` (płeć z wpisu, a imię z generatora z wpisu albo już nadane imię z wpisu: osoba
    w zapisie gry może nieść zmienione imię). */
export const dotyczy = (z: ZmianaImienia, p: Pick<Person, 'first' | 'f'>): boolean =>
  (z.f === undefined || z.f === p.f) && (z.gen === undefined || p.first === z.gen || p.first === z.imie);

/** płeć i wiek osoby z generatora takie same jak osoby gry */
const takaSama = (o: Osoba, p: Pick<Person, 'f' | 'age'>): boolean =>
  (o.plec === 'K') === p.f && ROK_GRY - o.rocznik === p.age;

/** Imię z generatora osoby gry `p` do nowego wpisu (`ZmianaImienia.gen`): z zapisanej zmiany, która jej dotyczy (bez
    `gen` w starym wpisie: nieznane), z budynku siedziby `l` (ta sama płeć i wiek, inaczej nieznane), a bez danych
    mieszkańców `bezDanych` (imię sprzed pierwszej zmiany w tej grze) albo obecne imię. */
export function imieZGeneratora(
  p: Pick<Person, 'ref' | 'first' | 'f' | 'age'>,
  l: LokatorzyGry | null,
  zapisana: ZmianaImienia | undefined,
  bezDanych?: string,
): string | undefined {
  if (zapisana && dotyczy(zapisana, p)) return zapisana.gen;
  if (l) {
    const o = l.siedziba.osoby.find((x) => x.id === p.ref);
    return o && takaSama(o, p) ? o.imie : undefined;
  }
  return bezDanych ?? p.first;
}

/** Czy w tej grze wolno zmieniać imiona i stosować zapisane zmiany: tylko w grze bez stanu sieci. Gra z sąsiadami
    wysyła zapis (osoby, ich historie, kronikę) na serwer gry, a imiona gracza nie mogą wyjść z przeglądarki; gra ze
    stanem sieci toczona chwilowo bez sieci (inne konto, bez zalogowania) też nie, bo jej zapis może jeszcze trafić
    do chmury. */
export const imionaWGrze = (stanSieci: object | null | undefined): boolean => !stanSieci;

// ---------------------------------------------------------------- pamięć

function magazyn(mag?: Magazyn): Magazyn | null {
  if (mag) return mag;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const obiekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** cała pamięć imion: adresy (skróty) z wpisami; uszkodzona albo niedostępna to pusto */
function wszystkie(m: Magazyn): Record<string, unknown> {
  try {
    const raw = m.getItem(IMIONA_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return obiekt(v) ? v : {};
  } catch {
    return {};
  }
}

/** Zmiany imion dla adresu po `ref` osoby; złe wpisy pomija. Bez pamięci albo z uszkodzoną: `{}`. */
export function wczytajZmiany(adres: string, mag?: Magazyn): Record<string, ZmianaImienia> {
  const m = magazyn(mag);
  const wynik: Record<string, ZmianaImienia> = {};
  if (!m) return wynik;
  const wpisy = wszystkie(m)[hashString(adres)];
  if (!obiekt(wpisy)) return wynik;
  for (const [ref, z] of Object.entries(wpisy)) {
    const ok = ref === '__proto__' ? null : poprawna(z);
    if (ok) wynik[ref] = ok;
  }
  return wynik;
}

/** Zapisuje zmianę imienia osoby `ref` dla adresu, a `null` usuwa wpis (pusty adres znika, pusta pamięć też).
    Zły wpis nie trafia do pamięci; przeglądarka bez dostępu do pamięci: nic, bez wyjątku. */
export function zapiszZmiane(adres: string, ref: string, z: ZmianaImienia | null, mag?: Magazyn): void {
  const m = magazyn(mag);
  if (!m || ref === '__proto__') return;
  const ok = z ? poprawna(z) : null;
  if (z && !ok) {
    console.warn('Zmiana imienia: zły wpis, nie zapisuję', z);
    return;
  }
  try {
    const adresy = wszystkie(m);
    const k = hashString(adres);
    const wpisy = obiekt(adresy[k]) ? { ...adresy[k] } : {};
    if (ok) wpisy[ref] = ok;
    else delete wpisy[ref];
    if (Object.keys(wpisy).length) adresy[k] = wpisy;
    else delete adresy[k];
    if (Object.keys(adresy).length) m.setItem(IMIONA_KEY, JSON.stringify(adresy));
    else m.removeItem(IMIONA_KEY);
  } catch (e) {
    console.warn('Zmiana imienia: przeglądarka nie pozwala zapisać', e);
  }
}

/** Wpisy, których `ref` nie ma w zbiorze osób (kolejność wpisów). */
export function sieroty(zmiany: Readonly<Record<string, ZmianaImienia>>, refs: ReadonlySet<string>): string[] {
  return Object.keys(zmiany).filter((ref) => !refs.has(ref));
}

/** Komunikat do kroniki o osobie, której już nie ma: „Halina wyprowadziła się.” (bez zapisanej płci: po końcówce). */
export function wyprowadzka(z: ZmianaImienia): string {
  return `${z.imie} ${g({ f: z.f ?? z.imie.endsWith('a') }, 'wyprowadził się', 'wyprowadziła się')}.`;
}

// ---------------------------------------------------------------- edytor

/** Czy wpisane imię przejdzie sprawdzenie (`zmianaZPol`): przy pisaniu edytor podpowiada formy tylko dla takiego. */
export function poprawneImie(imie: string): boolean {
  const v = oczysc(imie);
  return v.length > 0 && v.length <= IMIE_MAX && IMIE.test(v);
}

/** Formy imienia z odmiany (słownik, a bez niego zgadywacz) dla osoby płci `f`. */
export function podpowiedz(imie: string, f: boolean, odm: Odmiana): { formy: Formy; pewne: boolean } {
  return odmien(oczysc(imie), f ? 'K' : 'M', odm.tabela, odm.koncowki);
}

/** Słowa przed polem przypadku `c` dla osoby płci `f` (main.ts nie musi ich znać, ale testy i zrzuty tak). */
export const przedPolem = (c: Przypadek, f: boolean): string => POLA[c].przed(f);

/** HTML edytora imienia w miejsce treści karty osoby: siedem pól (`name` to przypadek, `mian` pierwsze), z formami
    zapisanej zmiany albo z `podpowiedz` (pola form z klasą „niepewne”, gdy odmiana nie jest pewna), podpowiedź o
    sprawdzeniu form, miejsce na błąd, przyciski Zapisz, Anuluj i Przywróć (tylko z zapisaną zmianą) i napis o fikcji. */
export function edytorImienia(
  o: { ref: string; first: string; f: boolean },
  odm: Odmiana,
  zapisana?: ZmianaImienia,
): string {
  const { formy, pewne } = zapisana ? { formy: zapisana.formy, pewne: true } : podpowiedz(o.first, o.f, odm);
  const wartosc = (c: Przypadek): string => (c === 'mian' ? (zapisana?.imie ?? o.first) : formy[c]);
  const pola = PRZYPADKI.map((c) => {
    const klasa = c !== 'mian' && !pewne ? ' class="niepewne"' : '';
    const max = c === 'mian' ? IMIE_MAX : FORMA_MAX;
    return (
      `<label class="imie-pole${c === 'mian' ? ' imie-mian' : ''}" title="${POLA[c].nazwa}">` +
      `<span class="imie-k">${esc(POLA[c].przed(o.f))}</span>` +
      `<input${klasa} name="${c}" value="${esc(wartosc(c))}" maxlength="${max}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"></label>`
    );
  }).join('');
  const przywroc = zapisana
    ? '<button type="button" class="btn mini ghost" data-card="imie-przywroc" title="Wraca imię z generatora mieszkańców">Przywróć</button>'
    : '';
  return [
    `<form class="imie-ed" data-ref="${esc(o.ref)}" novalidate autocomplete="off">`,
    '<h2>Zmiana imienia</h2>',
    '<p class="imie-sub">Nazwisko, wiek, rodzina i historia zostają. Formy podpowiada gra, możecie je poprawić.</p>',
    `<div class="imie-pola">${pola}</div>`,
    `<p class="imie-uwaga"${pewne ? ' hidden' : ''}>Gra zgaduje formy na żółto. Sprawdźcie je.</p>`,
    '<p class="imie-blad" role="alert" hidden></p>',
    `<div class="imie-przyciski"><button type="submit" class="btn mini go" data-card="imie-zapisz">Zapisz</button><button type="button" class="btn mini" data-card="imie-anuluj">Anuluj</button>${przywroc}</div>`,
    `<div class="osoba-fikcja"><p class="fikcja">${FIKCJA} Własne imię zostaje tylko w tej przeglądarce.</p></div>`,
    '</form>',
  ].join('');
}

// ---------------------------------------------------------------- stan gry

/** Pierwszy człon `name` (dawne imię `stare`, a gdy nie pasuje, pierwsze słowo) zamieniony na `nowe`. */
function zmienImie(name: string, stare: string, nowe: string): string {
  if (name === stare) return nowe;
  if (name.startsWith(`${stare} `)) return nowe + name.slice(stare.length);
  const spacja = name.indexOf(' ');
  return spacja < 0 ? nowe : nowe + name.slice(spacja);
}

/** Ustawia pole tylko wtedy, gdy się zmienia (puste usuwa), żeby klucze stanu zostały w tej samej kolejności. */
function ustaw(p: Person, k: 'story' | 'rodzina', v: string | undefined): void {
  if (p[k] === (v || undefined)) return;
  if (v) p[k] = v;
  else delete p[k];
}

/** Ta sama osoba co w generatorze (płeć i wiek), a nie inna pod tym samym `ref` po aktualizacji tabel: zapis gry
    trzyma swoich ludzi i nowy generator nie przepisuje im historii. */
const taSama = (p: Person, o: OsobaGry): boolean => p.f === o.f && p.age === o.age;

/** Zmiany imion na stanie gry (w miejscu; `st` to `SimState` albo cokolwiek z `people`). Wpis działa tylko na osobę,
    której dotyczy (`dotyczy`: płeć i imię z generatora). Osoba z `ref`:
    - z danymi mieszkańców (`l` i `dane`) i tą samą osobą w budynku siedziby: imię, `name`, historia i linijka rodziny
      z `osobyZeZmianami` (z wpisami, które dotyczą osób budynku), więc nowe imię widać też w historiach i rodzinie
      innych, a bez wpisu wraca imię z generatora;
    - w pozostałych przypadkach tylko imię i pierwszy człon `name` z wpisu (bez wpisu nic).
    Wpis, który nie dotyczy osoby pod swoim `ref`, nic nie zmienia. `sieroty`: wpisy z budynku siedziby (`ref`
    z prefiksem `<klucz budynku>/`) bez osoby o tym `ref` ani w grze, ani w budynku (bez danych mieszkańców zawsze
    pusto). Drugie wywołanie z tymi samymi zmianami nic już nie zmienia. */
export function zastosujZmiany(
  st: { people: Person[] },
  l: LokatorzyGry | null,
  dane: DaneMieszkancow | null,
  zmiany: Readonly<Record<string, ZmianaImienia>>,
): { sieroty: string[] } {
  const refs = st.people.flatMap((p) => (p.ref ? [p.ref] : []));
  const budynek = new Map<string, Osoba>(l && dane ? l.siedziba.osoby.map((o) => [o.id, o]) : []);
  /** wpis dotyczy osoby budynku siedziby pod tym samym id */
  const wBudynku = (ref: string, z: ZmianaImienia): boolean => {
    const o = budynek.get(ref);
    return !!o && dlaOsoby(z, o.imie, o.plec === 'K');
  };
  const zgodne = Object.fromEntries(Object.entries(zmiany).filter(([ref, z]) => wBudynku(ref, z)));
  const zDanych = l && dane ? osobyZeZmianami(l, dane, zgodne, refs) : new Map<string, OsobaGry>();
  for (const p of st.people) {
    if (!p.ref) continue;
    const z0 = Object.hasOwn(zmiany, p.ref) ? zmiany[p.ref] : undefined;
    const z = z0 && dotyczy(z0, p) ? z0 : undefined;
    const o = zDanych.get(p.ref);
    // ta sama osoba co w generatorze: płeć i wiek, a gdy wpis tej osoby zna jej imię z generatora, to też ono
    if (o && taSama(p, o) && !(z && !wBudynku(p.ref, z))) {
      if (p.name !== o.name) p.name = o.name;
      if (p.first !== o.first) p.first = o.first;
      ustaw(p, 'story', o.story);
      ustaw(p, 'rodzina', o.rodzina);
    } else if (z && p.first !== z.imie) {
      p.name = zmienImie(p.name, p.first, z.imie);
      p.first = z.imie;
    }
  }
  if (!l || !dane) return { sieroty: [] };
  const prefiks = `${l.siedziba.budynek.klucz}/`;
  const znane = new Set([...refs, ...budynek.keys()]);
  return { sieroty: Object.keys(zmiany).filter((ref) => ref.startsWith(prefiks) && !znane.has(ref)) };
}
