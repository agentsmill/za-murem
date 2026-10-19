/* Panel Pracy po prawej (docs/superpowers/specs/2026-10-19-praca-ludzi-design.md, „Interfejs”): nie-modalny jak panel
   budowy (panelbudowy.ts), mapa pod nim zostaje klikalna, a do 640 px to arkusz od dołu na całą szerokość. Treść robi
   pracaPanelHtml z praca.ts (czysty HTML z widoku pracy); ta klasa trzyma wybraną kolumnę, przebudowuje DOM tylko
   wtedy, gdy zmieni się widok (JSON widoku i język), deleguje kliknięcia i klawisze i daje #app klasę praca-open,
   po której CSS odsuwa przyciski zoomu i chowa minimapę.
   Obsługa: klik w komórkę przestawia priorytet 1 → 2 → 3 → 4 → pusto → 1, prawy przycisk (na telefonie długie
   przytrzymanie) w drugą stronę; plus i minus przy progach zmieniają o 5; przycisk ze strzałką przez linię przełącza
   „za siatkę”; kliknięty nagłówek kolumny pokazuje, ile zleceń czeka (drugi klik chowa). Polecenia wychodzą przez haki
   do main.ts (`sim.push`), a widok z haka `widok` ma na sobie jeszcze czekające polecenia, więc zmiana jest widać od
   razu także na pauzie.

   Fokus i klawisze gry. Mysz i dotyk nie zostawiają fokusu w panelu ani przy przycisku, którym go otwarto: `mousedown`
   w panelu nie daje fokusu przyciskowi (klik i tak dojdzie), a każdy element panelu, który go miał (komórka), go traci,
   więc po kliknięciu spacja nadal pauzuje, a 1–4 ustawiają tempo (komórka cyfry w fokusie przejęłaby cyfrę jako
   priorytet; main.ts zostawia spację przyciskom). Przycisk „Praca” w górnym pasku oddaje fokus po kliknięciu myszą jak
   każdy przycisk paska: robi to wspólna obsługa w src/ui/fokus.ts, panel nie ma na to własnego kodu.
   Fokus jest tylko przy obsłudze z klawiatury (Tab, strzałki): wtedy cyfry 0–4 na komórce ustawiają priorytet wprost,
   strzałki chodzą po tabeli, spacja i Enter zmieniają o jeden, a przebudowa DOM oddaje fokus temu samemu elementowi.
   O tym, czy ostatnia obsługa była z klawiatury, decyduje ostatnie zdarzenie na całej stronie (klawisz albo wskaźnik,
   nasłuch w fazie przechwytywania), więc Tab spoza panelu też liczy się jako klawiatura. Tę regułę opisuje lead
   w praca.ts. Bez PixiJS. */

import { L } from '../core/jezyk.ts';
import { PROG_MAX, type Priorytet, type Progi, RODZAJE, type RodzajPracy } from '../sim/praca.ts';
import { KROK_PROGU, nastepnyPriorytet, pracaPanelHtml, type WidokPracy } from './praca.ts';
import './praca.css';

export interface PracaPanelHooks {
  /** widok z aktualnego stanu gry z nałożonymi czekającymi poleceniami; kol: wybrana kolumna (liczba zleceń liczy się
      tylko dla niej); null: gry jeszcze nie ma */
  widok(kol: RodzajPracy | null): WidokPracy | null;
  /** czy panel ma być po angielsku */
  en(): boolean;
  touch: boolean;
  /** nowy priorytet komórki */
  onPrio(osoba: number, rodzaj: RodzajPracy, prio: Priorytet): void;
  /** nowy próg zapasu */
  onProg(co: keyof Progi, n: number): void;
  /** przełącznik „za siatkę” osoby */
  onZaSiatke(osoba: number, on: boolean): void;
  /** panel zamknięty przyciskiem ✕ */
  onClose(): void;
}

/** klawisz cyfry (rząd i klawiatura numeryczna) → 0–4, inaczej null */
function cyfra(code: string): Priorytet | null {
  const m = /^(?:Digit|Numpad)([0-4])$/.exec(code);
  return m ? (Number(m[1]) as Priorytet) : null;
}

export class PracaPanel {
  private kol: RodzajPracy | null = null;
  private view: WidokPracy | null = null;
  private key = '';
  /** ostatnie zdarzenie wejścia na stronie było klawiszem (też Tab spoza panelu): tylko wtedy fokus w panelu przeżywa
      przebudowę; wskaźnik (mysz, dotyk, pióro) zdejmuje fokus i zeruje flagę */
  private klawiatura = false;
  private readonly el: HTMLElement;
  private readonly app: HTMLElement;
  private readonly hooks: PracaPanelHooks;
  private readonly kicker: HTMLElement;
  private readonly body: HTMLElement;

  constructor(el: HTMLElement, app: HTMLElement, hooks: PracaPanelHooks) {
    this.el = el;
    this.app = app;
    this.hooks = hooks;
    el.innerHTML =
      '<header class="bp-head"><b class="bp-kicker"></b><button type="button" class="bp-x" data-act="praca-close">✕</button></header><div class="bp-body"></div>';
    this.kicker = el.querySelector<HTMLElement>('.bp-kicker')!;
    this.body = el.querySelector<HTMLElement>('.bp-body')!;
    // rodzaj ostatniego wejścia: nasłuch na oknie w fazie przechwytywania, przed obsługą w panelu i w main.ts
    window.addEventListener(
      'keydown',
      () => {
        this.klawiatura = true;
      },
      true,
    );
    window.addEventListener(
      'pointerdown',
      () => {
        this.klawiatura = false;
      },
      true,
    );
    el.addEventListener('mousedown', (e) => {
      // przycisk nie bierze fokusu od myszy (klik i tak dojdzie), a poprzedni fokus znika, także poza panelem
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
      this.zdejmijFokus();
    });
    el.addEventListener('click', (e) => this.click(e.target as HTMLElement, false));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.zdejmijFokus();
      this.click(e.target as HTMLElement, true);
    });
    el.addEventListener('keydown', (e) => this.keys(e));
  }

  /** wybrana kolumna (do testów) */
  get column(): RodzajPracy | null {
    return this.kol;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(): void {
    this.el.hidden = false;
    this.app.classList.add('praca-open');
    this.refresh(true);
  }

  hide(): void {
    this.el.hidden = true;
    this.app.classList.remove('praca-open');
    this.klawiatura = false;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  /** wybór kolumny znika (nowa gra, wczytany zapis) */
  reset(): void {
    this.kol = null;
    this.view = null;
    this.key = '';
  }

  /** przebudowuje treść, gdy zmienił się widok (stan gry, wybór kolumny albo język; z force zawsze); zamknięty panel
      nic nie robi */
  refresh(force = false): void {
    if (!this.open) return;
    const v = this.hooks.widok(this.kol);
    if (!v) return;
    const en = this.hooks.en();
    const key = `${en ? 'en' : 'pl'}|${JSON.stringify(v)}`;
    if (!force && key === this.key) return;
    this.key = key;
    this.view = v;
    this.render(v, en);
  }

  /** po obsłudze myszą albo dotykiem w panelu nie zostaje fokus nigdzie (patrz nagłówek pliku) */
  private zdejmijFokus(): void {
    this.klawiatura = false;
    const f = document.activeElement;
    if (f instanceof HTMLElement && f !== document.body) f.blur();
  }

  /** przebudowuje DOM; po obsłudze z klawiatury fokus wraca na ten sam element (po atrybucie), po myszy nie wraca
      nigdzie; przewinięcie zostaje */
  private render(v: WidokPracy, en: boolean): void {
    let sel: string | undefined;
    const f = document.activeElement;
    if (this.klawiatura && f instanceof HTMLElement && this.el.contains(f)) {
      for (const a of ['prio', 'prog', 'zasiatke', 'kol'] as const) {
        const val = f.dataset[a];
        if (val !== undefined) {
          sel = `[data-${a}="${val}"]`;
          break;
        }
      }
    }
    this.kicker.textContent = this.hooks.touch ? L('Praca', 'Work') : L('Praca (P)', 'Work (P)');
    this.el.setAttribute('aria-label', L('Praca', 'Work'));
    this.el.querySelector('.bp-x')?.setAttribute('aria-label', L('Zamknij', 'Close'));
    this.body.innerHTML = pracaPanelHtml(v, en);
    if (sel) this.body.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }

  /** kliknięcie (lewy przycisk albo stuknięcie) lub prawy przycisk (`wstecz`) */
  private click(t: HTMLElement, wstecz: boolean): void {
    const v = this.view;
    if (t.closest('[data-act="praca-close"]')) {
      if (wstecz) return;
      this.hide();
      this.hooks.onClose();
      return;
    }
    if (!v) return;
    const cell = t.closest<HTMLElement>('[data-prio]');
    if (cell) {
      const [osoba, rodzaj] = (cell.dataset.prio ?? '').split(':');
      this.ustawKomorke(Number(osoba), rodzaj as RodzajPracy, (p) => nastepnyPriorytet(p, wstecz));
      return;
    }
    if (wstecz) return;
    const prog = t.closest<HTMLElement>('[data-prog]');
    if (prog) {
      const [co, krok] = (prog.dataset.prog ?? '').split(':');
      const stary = v.progi[co as keyof Progi];
      if (stary === undefined || !krok) return;
      const delta = Number(krok.replace('+', '')) || 0;
      const n = Math.min(PROG_MAX, Math.max(0, stary + (delta > 0 ? KROK_PROGU : -KROK_PROGU)));
      if (n !== stary) {
        this.hooks.onProg(co as keyof Progi, n);
        this.refresh(true);
      }
      return;
    }
    const out = t.closest<HTMLElement>('[data-zasiatke]');
    if (out) {
      const osoba = Number(out.dataset.zasiatke);
      const w = v.wiersze.find((x) => x.osoba === osoba);
      if (!w) return;
      this.hooks.onZaSiatke(osoba, !w.zaSiatke);
      this.refresh(true);
      return;
    }
    const kol = t.closest<HTMLElement>('[data-kol]');
    if (kol) {
      const r = kol.dataset.kol as RodzajPracy;
      this.kol = this.kol === r ? null : r;
      this.refresh(true);
    }
  }

  /** zmiana priorytetu komórki: nowa wartość z poprzedniej (klik) albo wprost (cyfra) */
  private ustawKomorke(osoba: number, rodzaj: RodzajPracy, nowy: (p: Priorytet) => Priorytet): void {
    const w = this.view?.wiersze.find((x) => x.osoba === osoba);
    const k = RODZAJE.indexOf(rodzaj);
    if (!w || k < 0) return;
    this.hooks.onPrio(osoba, rodzaj, nowy(w.prio[k] ?? 0));
    this.refresh(true);
  }

  /** klawisze w panelu (fokus jest tu tylko po obsłudze z klawiatury): cyfry 0–4 na komórce ustawiają priorytet,
      strzałki chodzą po komórkach; obsłużone nie idą do gry (cyfry zmieniałyby tempo, strzałki przesuwały mapę).
      Spacja i Enter na komórce to zwykły klik przycisku (main.ts zostawia je przyciskom), czyli o jeden dalej. */
  private keys(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>('[data-prio]');
    if (!cell) return;
    const c = cyfra(e.code);
    if (c !== null) {
      const [osoba, rodzaj] = (cell.dataset.prio ?? '').split(':');
      this.ustawKomorke(Number(osoba), rodzaj as RodzajPracy, () => c);
    } else {
      const kolumn = this.view?.widoczne.length ?? 1;
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -kolumn, ArrowDown: kolumn }[e.key];
      if (!d) return;
      const cells = [...this.body.querySelectorAll<HTMLElement>('[data-prio]')];
      cells[cells.indexOf(cell) + d]?.focus();
    }
    e.preventDefault();
    e.stopPropagation();
  }
}
