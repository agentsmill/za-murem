/* Flaga gry sieciowej: czy gra w ogóle próbuje rozmawiać z serwerem gry (blok „Gra z sąsiadami” na karcie startowej,
   drużyna zakładana przy pierwszej grze, zajęte klatki, zapis w chmurze, wyszukiwanie adresu przez serwer).

   Rozstrzyga adres strony, a bez parametru budowa strony: `?siec=1` włącza, `?siec=0` wyłącza (także w budowie z
   VITE_SIEC=1), każda inna wartość albo brak parametru to `VITE_SIEC=1` z środowiska budowy. Produkcja buduje się bez
   VITE_SIEC, dopóki informacja o danych osobowych nie jest zatwierdzona (docs/superpowers/plans/2026-10-28-premiera-
   etap-1-fundament.md, zadanie 12), a podglądy gałęzi na Vercelu z VITE_SIEC=1. Samo włączenie niczego nie zakłada: bez
   odpowiadającego serwera (GitHub Pages, dema offline, serwer leży) gra działa jak bez sieci.

   Moduł nie dotyka DOM: `env` domyślnie bierze `import.meta.env` (zapisane dosłownie, bo Vite podmienia właśnie ten
   zapis), a w Node bez Vite (narzędzia z tools/) tego obiektu nie ma, więc flaga jest wtedy wyłączona, dopóki
   wywołanie nie poda własnego `env`. */

/** środowisko budowy strony: w Vite `import.meta.env`, w Node bez Vite puste */
type Srodowisko = Record<string, string | undefined>;

/** czy gra sieciowa jest włączona dla tego adresu strony (`?siec=1`/`?siec=0`, inaczej `VITE_SIEC=1`) */
export function siecWlaczona(
  params: URLSearchParams,
  env: Srodowisko = (import.meta.env ?? {}) as Srodowisko,
): boolean {
  const z = params.get('siec');
  if (z === '1') return true;
  if (z === '0') return false;
  return env.VITE_SIEC === '1';
}
