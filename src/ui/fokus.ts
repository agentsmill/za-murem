/* Fokus przycisków paska po kliknięciu myszą albo stuknięciu. Chromium daje fokus każdemu klikniętemu przyciskowi, a
   globalna obsługa klawiszy w main.ts celowo przepuszcza Enter i spację na przycisk w fokusie (klawiatura ma działać
   na przyciskach). Bez zdjęcia fokusu spacja po kliknięciu tempa, Budowy, alarmu albo przybliżania klikałaby ten
   przycisk drugi raz zamiast zatrzymać grę. Jedna obsługa na cały dokument: przyciski górnego paska (tempo, alarm,
   kafelek piętra, Mapa miasta, Budowa, Menu) i przyciski przybliżania. Minimapa (src/ui/minimapa.ts) i kafelek
   „Piętro” (src/ui/pietra.ts) mają jeszcze własne, takie same zdjęcie fokusu. */

/** przyciski, które po kliknięciu myszą oddają fokus: górny pasek i przyciski przybliżania przy mapie */
export const PRZYCISKI_PASKA = '#top button, .mapctl button';

/** Podpina zdejmowanie fokusu z klikniętego przycisku pasującego do `selektor`. Kliknięcie myszą albo stuknięcie ma
    `detail` większe od zera (liczba kliknięć z rzędu); Enter i spacja z klawiatury oraz `click()` z kodu mają 0, więc
    przycisk, na którym fokus stoi po Tabie, go zachowuje. Faza przechwytywania, żeby fokus zniknął
    przed własnym onclick przycisku: okno (Menu, Mapa miasta) zapamiętuje fokus z chwili otwarcia i oddaje go po
    zamknięciu, więc przy późniejszym zdjęciu wracałby do przycisku, który właśnie otworzył okno. */
export function oddajFokusPoKliknieciu(root: Document | HTMLElement, selektor: string = PRZYCISKI_PASKA): void {
  root.addEventListener(
    'click',
    (e: Event) => {
      if (!(e instanceof MouseEvent) || e.detail <= 0 || !(e.target instanceof Element)) return;
      const przycisk = e.target.closest('button');
      if (przycisk?.matches(selektor)) przycisk.blur();
    },
    true,
  );
}
