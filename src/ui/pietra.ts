/* Kafelek „Piętro” w pasku gry (etap 1 widoku pięter, flaga ?pietra=1, docs/superpowers/specs/2026-10-18-pietra-design.md,
   „Przełącznik” i „Co widać na piętrze”): mały kafelek z wybranym piętrem, pod nim lista pięter jak menu kontekstowe
   (od najwyższego w dół do parteru, wybrane na pomarańczowo) i notka z podpowiedzią.

   Kontrakt.
   - Czyste funkcje (testy w Node): `pozycjeListy` (pozycje listy od najwyższego piętra), `podpowiedz` (co napisać pod
     kafelkiem: z daleka „Przybliż…”, z bliska, gdy zarząd stoi pod stropem albo dachem, „Zarząd jest na parterze”)
     i `nastepnePietro` (krok klawiszy PageUp i PageDown, zaciśnięty do listy).
   - Klasa `SelektorPieter` (tylko przeglądarka) trzyma elementy z index.html (`#btnFloor`, `#floorList`, `#floorNote`)
     i niczego nie wie o grze: `odswiez` dostaje listę pięter, wybrane piętro i podpowiedź, a wybór z listy oddaje
     funkcji `wybor`. Rysuje od nowa tylko przy zmianie (gra woła `odswiez` co 200 ms).
   Teksty nie podają numeru piętra przy osobach (RODO), a numer piętra nigdzie nie trafia do stanu gry ani zapisu. */

import { jezyk, type Tx, tr, tx } from '../core/jezyk.ts';

/** podpis parteru i pozostałych pięter na liście */
const PARTER = tx('parter', 'ground floor');
const PIETRO = tx('piętro', 'floor');

/** podpowiedź przy wybranym piętrze, gdy zbliżenie jest za małe na przekrój (kawałki z przekrojem są tylko z bliska) */
export const PODPOWIEDZ_DALEKO = tx('Przybliż, żeby zajrzeć na piętro', 'Zoom in to look at the floor');
/** podpowiedź, gdy zarząd stoi w budynku zakrytym stropem albo dachem (też napis po kliknięciu w taki obrys) */
export const PODPOWIEDZ_ZARZAD = tx('Zarząd jest na parterze', 'The board is on the ground floor');

/** pozycja listy pięter */
export interface PozycjaListy {
  pietro: number;
  podpis: Tx;
  wybrane: boolean;
}

// ---------------------------------------------------------------- czyste funkcje

/** Pozycje listy od najwyższego piętra w dół do parteru; wybrana jest dokładnie ta z numerem `wybrane`. Listy nie zmienia. */
export function pozycjeListy(lista: readonly number[], wybrane: number): PozycjaListy[] {
  return [...lista]
    .sort((a, b) => b - a)
    .map((pietro) => ({ pietro, podpis: pietro === 0 ? PARTER : PIETRO, wybrane: pietro === wybrane }));
}

/** Podpowiedź pod kafelkiem. Na parterze jej nie ma. Na piętrze z daleka (bez przekroju) prosi o przybliżenie, z bliska
    mówi, że zarząd jest na parterze, ale tylko wtedy, gdy któryś pionek zarządu stoi pod stropem albo dachem. */
export function podpowiedz(o: { pietro: number; cutOn: boolean; zarzadUkryty: boolean }): Tx | null {
  if (o.pietro < 1) return null;
  if (!o.cutOn) return PODPOWIEDZ_DALEKO;
  return o.zarzadUkryty ? PODPOWIEDZ_ZARZAD : null;
}

/** Piętro o jedno wyżej (krok 1) albo niżej (krok −1) w liście; na jej końcu zostaje, a piętro spoza listy wraca
    do najbliższego jej końca. */
export function nastepnePietro(lista: readonly number[], obecne: number, krok: 1 | -1): number {
  if (!lista.length) return obecne;
  const rosnaco = [...lista].sort((a, b) => a - b);
  const sasiad = krok > 0 ? rosnaco.find((p) => p > obecne) : rosnaco.findLast((p) => p < obecne);
  return sasiad ?? Math.min(rosnaco[rosnaco.length - 1], Math.max(rosnaco[0], obecne));
}

// ---------------------------------------------------------------- DOM (tylko przeglądarka)

/** elementy kafelka z index.html: przycisk (z `.stat-k` i `.stat-v`), lista pięter i notka z podpowiedzią */
export interface ElementyPieter {
  btn: HTMLButtonElement;
  list: HTMLElement;
  note: HTMLElement;
}

export class SelektorPieter {
  private readonly el: ElementyPieter;
  private readonly wybor: (L: number) => void;
  private readonly root: HTMLElement;
  private otwarta = false;
  private klucz = '';
  private tekstNotki = '';

  /** `wybor`: co robi wybór pozycji z listy (gra przełącza widok). Lista zamyka się po wyborze, kliknięciu obok i Esc. */
  constructor(el: ElementyPieter, wybor: (L: number) => void) {
    this.el = el;
    this.wybor = wybor;
    this.root = el.btn.parentElement ?? el.btn;
    el.btn.setAttribute('aria-haspopup', 'menu');
    el.btn.setAttribute('aria-controls', el.list.id);
    this.ustawOtwarta(false);
    // klawiszem Enter fokus zostaje (i idzie na wybrane piętro), myszą i dotykiem przycisk go oddaje, żeby spacja
    // dalej zatrzymywała grę (na przycisku z fokusem spacja przełącza przycisk, nie czas)
    el.btn.addEventListener('click', (e) => {
      if (e.detail > 0) el.btn.blur();
      this.ustawOtwarta(!this.otwarta);
      if (this.otwarta && e.detail === 0) el.list.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    });
    el.list.addEventListener('click', (e) => {
      const pozycja = (e.target as HTMLElement).closest<HTMLElement>('[data-pietro]');
      if (!pozycja) return;
      this.ustawOtwarta(false);
      if (e.detail === 0) el.btn.focus();
      this.wybor(Number(pozycja.dataset.pietro));
    });
    // kliknięcie poza kafelkiem zamyka listę (na etapie przechwytywania, bo mapa przechwytuje wskaźnik)
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.otwarta && !this.root.contains(e.target as Node)) this.ustawOtwarta(false);
      },
      true,
    );
    // Esc zamyka samą listę, nie zaznaczenie w grze
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.otwarta) return;
        e.preventDefault();
        e.stopPropagation();
        this.ustawOtwarta(false);
        el.btn.focus();
      },
      true,
    );
  }

  /** Pokazuje wybrane piętro na kafelku, listę pięter i podpowiedź (null chowa notkę). Rysuje od nowa tylko przy
      zmianie numeru, listy, języka albo tekstu podpowiedzi. */
  odswiez(lista: readonly number[], wybrane: number, podp: Tx | null): void {
    const klucz = `${jezyk()}|${lista.join(',')}|${wybrane}`;
    if (klucz !== this.klucz) {
      this.klucz = klucz;
      const wartosc = this.el.btn.querySelector('.stat-v');
      if (wartosc) wartosc.textContent = String(wybrane);
      this.el.list.innerHTML = pozycjeListy(lista, wybrane)
        .map(
          (p) =>
            `<button type="button" class="ctx-item floor-item${p.wybrane ? ' on' : ''}" role="menuitemradio" aria-checked="${p.wybrane}" data-pietro="${p.pietro}"><b class="floor-n">${p.pietro}</b> <span class="floor-t">${tr(p.podpis)}</span></button>`,
        )
        .join('');
    }
    const tekst = podp ? tr(podp) : '';
    if (tekst !== this.tekstNotki) {
      this.tekstNotki = tekst;
      this.el.note.textContent = tekst;
      this.el.note.hidden = !tekst;
    }
  }

  /** Zamyka listę (nowa gra, zmiana języka). */
  zamknij(): void {
    this.ustawOtwarta(false);
  }

  private ustawOtwarta(otwarta: boolean): void {
    this.otwarta = otwarta;
    this.el.list.hidden = !otwarta;
    this.el.btn.setAttribute('aria-expanded', String(otwarta));
  }
}
