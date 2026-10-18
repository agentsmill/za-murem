/* Menu pod prawym przyciskiem (i pod przytrzymanym palcem): polecenia z commandsAt w miejscu kliknięcia.
   Domyślne polecenie (pierwsze szybkie) jest wyróżnione i ma fokus, palenie mebli kończy się wielokropkiem,
   bo najpierw pyta w oknie. Pozycja z powodem (off) jest wyszarzona, z powodem pod spodem, i nie da się jej wybrać. */

import type { MenuItem } from '../sim/orders.ts';
import { esc } from './tekst.ts';

export class ContextMenu {
  private items: MenuItem[] = [];
  private pick: ((m: MenuItem) => void) | null = null;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!b) return;
      const m = this.items[Number(b.dataset.k)];
      if (m?.off) return;
      const pick = this.pick;
      this.close();
      if (m) pick?.(m);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // klik albo stuknięcie poza menu zamyka je (mapa dostaje ten sam klik normalnie)
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !el.contains(e.target as Node)) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') {
        // Esc zamyka tylko menu (gra nie odznacza przy tym ludzi)
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const list = [...el.querySelectorAll<HTMLElement>('[data-k]')];
        const k = list.indexOf(document.activeElement as HTMLElement);
        const n = list.length;
        list[(k + (e.code === 'ArrowDown' ? 1 : n - 1) + n) % n]?.focus();
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** menu przy punkcie (x, y) ekranu; head: dla kogo polecenie */
  show(items: MenuItem[], x: number, y: number, head: string, pick: (m: MenuItem) => void): void {
    this.items = items;
    this.pick = pick;
    const quick = items.findIndex((m) => m.quick && !m.off);
    this.el.innerHTML = `<p class="ctx-head">${esc(head)}</p>${items
      .map((m, k) =>
        m.off
          ? `<button type="button" role="menuitem" class="ctx-item off" aria-disabled="true" data-k="${k}">${esc(m.label)}<span class="ctx-off">${esc(m.off)}</span></button>`
          : `<button type="button" role="menuitem" class="ctx-item${k === quick ? ' quick' : ''}${m.confirm ? ' risky' : ''}" data-k="${k}">${esc(m.label)}${m.confirm ? '…' : ''}</button>`,
      )
      .join('')}`;
    this.el.hidden = false;
    // w oknie przeglądarki, z odstępem od krawędzi
    const r = this.el.getBoundingClientRect();
    const left = Math.max(6, Math.min(x + 6, window.innerWidth - r.width - 6));
    const top = Math.max(6, Math.min(y + 6, window.innerHeight - r.height - 6));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.querySelector<HTMLElement>(quick >= 0 ? `[data-k="${quick}"]` : '[data-k]')?.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.open) return;
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.items = [];
    this.pick = null;
  }
}
