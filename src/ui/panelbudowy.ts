/* Panel budowy po prawej (docs/superpowers/specs/2026-10-18-menu-budowy-design.md): nie-modalny, mapa pod nim
   zostaje klikalna. Treść robi buildPanelHtml z budowa.ts (zakładki, kafelki z miniaturami, szczegóły); ta klasa
   trzyma wybór zakładki i budowli do końca sesji, przebudowuje DOM tylko wtedy, gdy zmieni się klucz stanu
   (zapas, plany, rzeczy, mieszkania), deleguje kliknięcia i strzałki i daje #app klasę build-open, po której CSS
   odsuwa przyciski zoomu i pasek stawiania od panelu. Bez PixiJS. */

import type { Words, WordsEn } from '../gov/miejsce.ts';
import type { BuildCat, BuildKind } from '../sim/budowle.ts';
import { type BuildCategory, buildPanelHtml, type PanelView } from './budowa.ts';

export interface BuildPanelHooks {
  /** menu z aktualnego stanu gry (liczone z pamięcią podręczną pod stateKey) */
  menu(): BuildCategory[];
  /** skrót stanu, od którego zależy treść: gdy się nie zmienił, refresh niczego nie dotyka */
  stateKey(): string;
  thumb(kind: BuildKind): string;
  words(): Words;
  en(): WordsEn;
  touch: boolean;
  /** „Postaw” przy wybranej budowli */
  onPlace(kind: BuildKind): void;
  /** panel zamknięty przyciskiem ✕ */
  onClose(): void;
}

/** kafelków w rzędzie siatki (CSS: repeat(3, 1fr)), do strzałek w górę i w dół */
const COLS = 3;

export class BuildPanel {
  private view: PanelView = { tab: null, kind: null };
  private key = '';
  private readonly el: HTMLElement;
  private readonly app: HTMLElement;
  private readonly hooks: BuildPanelHooks;
  private readonly kicker: HTMLElement;
  private readonly body: HTMLElement;

  constructor(el: HTMLElement, app: HTMLElement, hooks: BuildPanelHooks) {
    this.el = el;
    this.app = app;
    this.hooks = hooks;
    el.innerHTML =
      '<header class="bp-head"><b class="bp-kicker"></b><button type="button" class="bp-x" data-act="build-close">✕</button></header><div class="bp-body"></div>';
    this.kicker = el.querySelector<HTMLElement>('.bp-kicker')!;
    this.body = el.querySelector<HTMLElement>('.bp-body')!;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLElement>('[data-tab]');
      const kind = t.closest<HTMLElement>('.tile[data-kind]');
      const act = t.closest<HTMLElement>('[data-act]');
      if (act?.dataset.act === 'build-close') {
        this.hide();
        hooks.onClose();
      } else if (act?.dataset.act === 'build') hooks.onPlace(act.dataset.arg as BuildKind);
      else if (tab) this.pick({ tab: tab.dataset.tab as BuildCat, kind: null });
      else if (kind) this.pick({ tab: this.view.tab, kind: kind.dataset.kind as BuildKind });
    });
    el.addEventListener('keydown', (e) => this.arrows(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** wybrana zakładka i budowla (do testów) */
  get current(): PanelView {
    return this.view;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(): void {
    this.el.hidden = false;
    this.app.classList.add('build-open');
    this.refresh(true);
  }

  hide(): void {
    this.el.hidden = true;
    this.app.classList.remove('build-open');
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  /** wybór wraca do pierwszej zakładki (nowa gra, wczytany zapis) */
  reset(): void {
    this.view = { tab: null, kind: null };
    this.key = '';
  }

  /** przebudowuje treść, gdy zmienił się stan gry (albo force: język, grafika, wybór); zamknięty panel nic nie robi */
  refresh(force = false): void {
    if (!this.open) return;
    const key = this.hooks.stateKey();
    if (!force && key === this.key) return;
    this.key = key;
    this.render();
  }

  /** wybór zakładki (kind null) albo budowli; fokus zostaje na klikniętym elemencie */
  private pick(v: PanelView): void {
    this.view = v;
    this.render(v.kind ? `.tile[data-kind="${v.kind}"]` : `[data-tab="${v.tab}"]`);
  }

  /** przebudowuje DOM; fokus wraca na wskazany element, a bez wskazania na ten sam, który miał (odświeżenie stanu) */
  private render(focusSel?: string): void {
    let sel = focusSel;
    if (!sel) {
      const f = document.activeElement;
      if (f instanceof HTMLElement && this.el.contains(f))
        sel = f.dataset.tab
          ? `[data-tab="${f.dataset.tab}"]`
          : f.classList.contains('tile')
            ? `.tile[data-kind="${f.dataset.kind}"]`
            : undefined;
    }
    const r = buildPanelHtml(
      this.hooks.menu(),
      this.view,
      this.hooks.touch,
      this.hooks.words(),
      this.hooks.en(),
      this.hooks.thumb,
    );
    this.view = r.view;
    this.el.setAttribute('aria-label', r.title);
    this.kicker.textContent = r.kicker;
    this.body.innerHTML = r.body;
    if (sel) this.body.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }

  /** strzałki: w zakładkach lewo i prawo, w siatce lewo i prawo o jeden, góra i dół o rząd; obsłużone nie idą do gry */
  private arrows(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const dir = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key];
    if (!dir) return;
    const tab = t.closest<HTMLElement>('[data-tab]');
    const tile = t.closest<HTMLElement>('.tile[data-kind]');
    if (tab && Math.abs(dir) === 1) {
      const tabs = [...this.body.querySelectorAll<HTMLElement>('[data-tab]')];
      const next = tabs[tabs.indexOf(tab) + dir];
      if (next) this.pick({ tab: next.dataset.tab as BuildCat, kind: null });
    } else if (tile) {
      const tiles = [...this.body.querySelectorAll<HTMLElement>('.tile[data-kind]')];
      const next = tiles[tiles.indexOf(tile) + dir];
      if (next) this.pick({ tab: this.view.tab, kind: next.dataset.kind as BuildKind });
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
}
