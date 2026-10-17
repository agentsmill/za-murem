/* Jedno okno na raz nad grą (zamiast natywnego confirm): tabliczka z tytułem, treść i przyciski.
   Kliknięcia przycisków z data-act i zmiany list wyboru idą do obsługi podanej przy otwarciu. */

import type { Sheet } from './okna.ts';

export type SheetHandler = (act: string, arg: string, el: HTMLElement) => void;

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
      if (el instanceof HTMLSelectElement) this.handler?.('select', el.value, el);
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
    this.sheet.innerHTML = `<header class="sheet-head"><small class="sheet-kicker">${s.kicker}</small><h2 class="sheet-title" id="sheetTitle">${s.title}</h2></header><div class="sheet-body">${s.body}</div>${
      s.foot ? `<footer class="sheet-foot">${s.foot}</footer>` : ''
    }`;
    this.root.hidden = false;
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

  /** element w otwartym oknie */
  find<T extends HTMLElement = HTMLElement>(sel: string): T | null {
    return this.sheet.querySelector<T>(sel);
  }
}
