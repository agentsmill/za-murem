/* Jedno okno na raz nad grą (zamiast natywnego confirm): tabliczka z tytułem, treść i przyciski.
   Kliknięcia przycisków z data-act i zmiany list wyboru idą do obsługi podanej przy otwarciu; pod listą wyboru z linią
   `.pick-full` (karta nocy) okno pokazuje pełny tekst wybranej opcji, gdy lista go ucina (`odswiezPelnyTekst`). `sheetHtml(s)` składa
   wnętrze tabliczki z czterech części `Sheet` (nagłówek, tytuł, treść, przyciski) i, gdy okno ma `cel`, linię „Cel: …”
   ścieżki celów tuż pod nagłówkiem; to czysta funkcja, więc da się ją sprawdzić w Node bez DOM. */

import type { Sheet } from './okna.ts';
import { liniaCelu } from './tekst.ts';

export type SheetHandler = (act: string, arg: string, el: HTMLElement) => void;

/** Ile pikseli pola zamkniętej listy wyboru nie nadaje się na tekst: dopełnienie z obu stron i strzałka (z zapasem). */
const WYBOR_ZAPAS = 44;

/** jedno płótno do pomiaru szerokości tekstu (bez DOM tekst z `measureText` ma tę samą szerokość co w liście wyboru) */
let plotnoPomiaru: CanvasRenderingContext2D | null | undefined;
function szerokoscTekstu(tekst: string, el: HTMLElement): number {
  plotnoPomiaru ??= document.createElement('canvas').getContext('2d');
  if (!plotnoPomiaru) return 0;
  plotnoPomiaru.font = getComputedStyle(el).font;
  return plotnoPomiaru.measureText(tekst).width;
}

/** Zamknięta lista wyboru ucina opcję dłuższą niż jej pole: na telefonie „Warta przy dziurze od południowego wschodu, obr…”,
    a decydujące słowa (obrona, ryzyko, „propozycja”) stoją na końcu. Pod listą jest więc linia `.pick-full` z pełnym tekstem
    wybranej opcji; widać ją tylko wtedy, gdy tekst się nie mieści w polu listy, więc tam, gdzie lista pokazuje wszystko
    (komputer), linii nie ma. Liczy się po otwarciu okna, po zmianie wyboru i po zmianie szerokości okna. */
export function odswiezPelnyTekst(lista: HTMLSelectElement): void {
  const linia = lista.nextElementSibling;
  if (!(linia instanceof HTMLElement) || !linia.classList.contains('pick-full')) return;
  const tekst = lista.selectedOptions[0]?.text ?? '';
  if (linia.textContent !== tekst) linia.textContent = tekst;
  linia.hidden = !tekst || szerokoscTekstu(tekst, lista) <= lista.clientWidth - WYBOR_ZAPAS;
}

/** Wnętrze tabliczki okna: nagłówek (mały napis i tytuł), linia „Cel: …” pod nim (tylko gdy okno ma `cel`), treść
    i przyciski. Części `kicker`, `title`, `body` i `foot` to gotowy HTML; `cel` to zwykły tekst i jest uciekany. */
export function sheetHtml(s: Sheet): string {
  return `<header class="sheet-head"><small class="sheet-kicker">${s.kicker}</small><h2 class="sheet-title" id="sheetTitle">${s.title}</h2></header>${
    s.cel ? liniaCelu(s.cel, 'sheet-cel') : ''
  }<div class="sheet-body">${s.body}</div>${s.foot ? `<footer class="sheet-foot">${s.foot}</footer>` : ''}`;
}

export class Modal {
  private handler: SheetHandler | null = null;
  private dismiss: (() => void) | null = null;
  private back: HTMLElement | null = null;
  /** rodzaj otwartego okna albo null */
  tone: Sheet['tone'] | null = null;
  private closable = false;
  private root: HTMLElement;
  private sheet: HTMLElement;

  constructor(root: HTMLElement, sheet: HTMLElement) {
    this.root = root;
    this.sheet = sheet;
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (el && !(el as HTMLButtonElement).disabled) {
        this.handler?.(el.dataset.act!, el.dataset.arg ?? '', el);
        return;
      }
      if (e.target === root && this.closable) this.cancel();
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLElement;
      if (!(el instanceof HTMLSelectElement)) return;
      this.handler?.('select', el.value, el);
      // obsługa może cofnąć wybór albo zmienić teksty opcji innych list, więc pełne teksty liczą się po niej
      this.odswiezWybory();
    });
    window.addEventListener('resize', () => {
      if (this.open) this.odswiezWybory();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open && this.closable) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.cancel();
      }
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** otwiera okno (zastępuje poprzednie); onDismiss: zamknięcie bez decyzji (Esc, klik obok) */
  show(s: Sheet, handler: SheetHandler, onDismiss?: () => void): void {
    if (!this.open) this.back = document.activeElement as HTMLElement | null;
    this.handler = handler;
    this.dismiss = onDismiss ?? null;
    this.closable = !!s.closable;
    this.tone = s.tone;
    this.sheet.className = `sheet ${s.tone}`;
    this.sheet.innerHTML = sheetHtml(s);
    this.root.hidden = false;
    this.odswiezWybory();
    this.sheet.scrollTop = 0;
    // fokus na samym oknie, nie na pierwszym przycisku: żaden wybór nie jest podpowiadany (Tab przechodzi dalej)
    this.sheet.tabIndex = -1;
    this.sheet.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.sheet.innerHTML = '';
    this.handler = null;
    this.dismiss = null;
    this.tone = null;
    this.back?.focus?.({ preventScroll: true });
    this.back = null;
  }

  private cancel(): void {
    const d = this.dismiss;
    this.close();
    d?.();
  }

  /** pełne teksty wybranych opcji pod listami wyboru okna (`odswiezPelnyTekst`) */
  private odswiezWybory(): void {
    for (const l of this.sheet.querySelectorAll<HTMLSelectElement>('select.pick')) odswiezPelnyTekst(l);
  }

  /** element w otwartym oknie */
  find<T extends HTMLElement = HTMLElement>(sel: string): T | null {
    return this.sheet.querySelector<T>(sel);
  }
}
