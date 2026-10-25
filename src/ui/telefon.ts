/* Telefon (okno węższe niż 768 px): dwa bloki, które gracz zwija, żeby interfejs nie przytłaczał ekranu: pasek stanu u góry
   (domyślnie jedna linia z tym, co pilne: kafelki w stanie „uwaga” albo „źle”, a gdy takich nie ma, jedzenie, drewno
   i wkurzenie) i potrzeby na karcie osoby (domyślnie jedna linia z ostrzeżeniami, paski i nastroje po stuknięciu). Stuknięcie
   w linię rozwija blok, kolejne zwija. Na komputerze i od 768 px nic się nie zmienia (reguły w src/style.css leżą w zapytaniu
   `TELEFON_MQ`).

   Pamięć wyboru: localStorage przeglądarki pod kluczami `PASEK_KEY` i `POTRZEBY_KEY` („zwiniete” albo „rozwiniete”), tak jak
   język i imiona (src/ui/jezyk.ts, src/ui/imiona.ts): to stan interfejsu, nie symulacji, więc nie trafia do zapisu gry.
   Kontrakt: każda funkcja działa bez wyjątku także wtedy, gdy przeglądarka nie daje dostępu do pamięci (tryb prywatny, zablokowane
   dane witryny, podgląd miniatur): wtedy nic się nie zapisuje, a odczyt to domyślne „zwiniete”; uszkodzony wpis to też domyślne.
   Czyste poza samym magazynem, który można podstawić w testach.

   Wiki (src/ui/wiki-okno.ts): kafelki paska i paski potrzeb na karcie otwierają swoje artykuły, ale tylko w rozwiniętym bloku.
   Zwinięta linia stanu i linia potrzeb przyjmują stuknięcie same i rozwijają blok, więc kafelki zwiniętego paska nie biorą
   dotyku ani klawiatury (`inert` z main.ts i `pointer-events: none` w src/style.css), a w rozwiniętym kafelek otwiera artykuł,
   nie zwija paska (zwija strzałka ▴ i przerwy między kafelkami). */

/** okno węższe niż 768 px (telefon i mały tablet w pionie); musi się zgadzać z `@media (max-width: 767px)` w src/style.css */
export const TELEFON_MQ = '(max-width: 767px)';
/** do 640 px deski, złom i części są jednym kafelkiem (`#sMats`), od 641 px trzema osobnymi (zgodne z src/style.css) */
export const MALY_TELEFON_MQ = '(max-width: 640px)';
export const PASEK_KEY = 'za-murem-0.4-pasek';
export const POTRZEBY_KEY = 'za-murem-0.4-potrzeby';

export type Wybor = 'zwiniete' | 'rozwiniete';

/** to, czego potrzeba z localStorage (atrapa w testach); null: brak pamięci */
export type Magazyn = Pick<Storage, 'getItem' | 'setItem'>;

function magazyn(mag?: Magazyn | null): Magazyn | null {
  if (mag !== undefined) return mag;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Zapamiętany wybór bloku; bez pamięci, bez wpisu albo z uszkodzonym wpisem: „zwiniete”. */
export function wczytajWybor(klucz: string, mag?: Magazyn | null): Wybor {
  try {
    return magazyn(mag)?.getItem(klucz) === 'rozwiniete' ? 'rozwiniete' : 'zwiniete';
  } catch {
    return 'zwiniete';
  }
}

/** Zapisuje wybór bloku; przeglądarka bez dostępu do pamięci: nic, bez wyjątku. */
export function zapiszWybor(klucz: string, wybor: Wybor, mag?: Magazyn | null): void {
  try {
    magazyn(mag)?.setItem(klucz, wybor);
  } catch {
    // pamięć niedostępna albo pełna: wybór obowiązuje do przeładowania strony, nic poza tym
  }
}

/** Kafelki stanu, które zwinięty pasek pokazuje, gdy nic nie jest w stanie „uwaga” ani „źle”. */
export const KAFELKI_DOMYSLNE: readonly string[] = ['sFood', 'sWood', 'sAnger'];

export interface KafelekPoziom {
  id: string;
  level: 'ok' | 'mid' | 'bad';
}

/** Kafelki pilne: wszystkie w stanie „uwaga” albo „źle”, a gdy takich nie ma, jedzenie, drewno i wkurzenie (te z nich, które
    układ w ogóle pokazuje: lista wejściowa to kafelki tego układu, bez tych, które CSS chowa zawsze). */
export function pilneKafelki(kafelki: readonly KafelekPoziom[]): Set<string> {
  const uwaga = kafelki.filter((k) => k.level !== 'ok').map((k) => k.id);
  if (uwaga.length) return new Set(uwaga);
  return new Set(kafelki.filter((k) => KAFELKI_DOMYSLNE.includes(k.id)).map((k) => k.id));
}
