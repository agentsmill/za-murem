/* Język gry (docs/superpowers/specs/2026-10-18-angielski-design.md): angielski albo polski. Bieżący język trzyma ten
   moduł; w nim domyślnie polski, bo to język źródłowy kodu, więc testy, boty i narzędzia w Node widzą polskie teksty
   jak dotąd. Przeglądarka ustawia język gracza (src/ui/jezyk.ts), zanim cokolwiek narysuje.

   Kontrakt. Stan gry nie zależy od języka: symulacja trzyma polskie napisy jako identyfikatory (interfejs tłumaczy
   je przy rysowaniu), a zarząd zapisuje zdania jako Tx, czyli od razu w obu językach, i nigdy nie czyta bieżącego
   języka. Kod, który rysuje, bierze napis w bieżącym języku przez L() albo tr(). Na poziomie modułu nie wołamy L()
   ani jezyk(), bo moduły ładują się przed ustawieniem języka: stałe tablice napisów to Tx. */

export type Lang = 'en' | 'pl';
export const LANGS: readonly Lang[] = ['en', 'pl'];

/** tekst w obu językach; tak zarząd zapisuje zdania w stanie */
export interface Tx {
  readonly pl: string;
  readonly en: string;
}

export const tx = (pl: string, en: string): Tx => ({ pl, en });
/** ten sam napis w obu językach (imiona, liczby, nazwy miejsc) */
export const txSame = (s: string): Tx => ({ pl: s, en: s });

/** pierwsza litera wielka, reszta bez zmian (początek zdania; pusty napis zostaje pusty) */
export const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const isTx = (v: unknown): v is Tx =>
  typeof v === 'object' && v !== null && typeof (v as Tx).pl === 'string' && typeof (v as Tx).en === 'string';

/** tekst ze stanu jako Tx: stary zapis ma w tym miejscu polski napis, który zostaje w obu językach */
export const txOf = (t: Tx | string): Tx => (typeof t === 'string' ? txSame(t) : t);

/** sklejenie kawałków po kolei; zwykły napis jest taki sam w obu językach */
export function txCat(...parts: (Tx | string)[]): Tx {
  let pl = '';
  let en = '';
  for (const p of parts) {
    pl += typeof p === 'string' ? p : p.pl;
    en += typeof p === 'string' ? p : p.en;
  }
  return { pl, en };
}

/** lista z separatorem w obu językach, np. txJoin(imiona, tx(' i ', ' and ')) */
export function txJoin(parts: readonly Tx[], sep: string | Tx = ' '): Tx {
  const s = txOf(sep);
  return { pl: parts.map((p) => p.pl).join(s.pl), en: parts.map((p) => p.en).join(s.en) };
}

let current: Lang = 'pl';
const listeners = new Set<(l: Lang) => void>();

export const jezyk = (): Lang => current;

/** zmiana bieżącego języka; słuchacze tylko przy prawdziwej zmianie */
export function ustawJezyk(l: Lang): void {
  if (l === current) return;
  current = l;
  for (const f of [...listeners]) f(l);
}

/** słuchacz zmiany języka; zwraca odpięcie */
export function poZmianieJezyka(f: (l: Lang) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** napis w bieżącym języku: L('Pauza', 'Pause') */
export const L = (pl: string, en: string): string => (current === 'en' ? en : pl);

/** tekst ze stanu (Tx albo stary polski napis) w bieżącym języku; brak to pusty napis */
export function tr(t: Tx | string | null | undefined): string {
  if (t === null || t === undefined) return '';
  return typeof t === 'string' ? t : current === 'en' ? t.en : t.pl;
}

/** liczba do tekstu w danym języku: po polsku przecinek, po angielsku kropka, w obu prawdziwy minus;
    1.5 → „1,5” albo „1.5”, −2 → „−2” */
export function liczba(v: number, cyfry: number, lang: Lang): string {
  const f = 10 ** cyfry;
  const r = Math.round(v * f) / f;
  const s = String(Math.abs(r));
  return (r < 0 ? '−' : '') + (lang === 'pl' ? s.replace('.', ',') : s);
}

/** Stopnie Celsjusza do zdania zapisanego w obu językach (Tx), np. w stanie zarządu: całkowite, z prawdziwym minusem
    („−1°C”, nie „-1°C”). Liczba całkowita brzmi tak samo po polsku i po angielsku, więc jeden napis na oba języki; w
    interfejsie, który czyta bieżący język, jest `deg` z src/ui/tekst.ts. */
export const stopnie = (t: number): string => `${liczba(Math.round(t), 0, 'pl')}°C`;

/** polska liczba mnoga z liczbą: forma dla 1 („1 osoba”), dla 2–4 poza 12–14 („3 osoby”, „22 osoby”) i dla reszty
    („5 osób”, „12 osób”, „0 osób”); wołający podaje trzy formy, liczba jest zaokrąglona do całkowitej */
export function mnogaPl(n: number, jedna: string, kilka: string, wiele: string): string {
  const k = Math.round(n);
  const a = Math.abs(k);
  let forma = wiele;
  if (a === 1) forma = jedna;
  else if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) forma = kilka;
  return `${liczba(k, 0, 'pl')} ${forma}`;
}
