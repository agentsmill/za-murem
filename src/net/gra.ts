/* Gra sieciowa w przeglądarce, etap 2 (docs/superpowers/specs/2026-10-18-multiplayer-design.md): blok „Gra z sąsiadami”
   na karcie startowej (logowanie, zakładanie konta, wylogowanie, zapis z chmury), start drużyny przez serwer (klatka pod
   adresem albo start bez domu), znaczniki zajętych klatek na mapie, „Zajmij klatkę” w menu i zapis w chmurze. Spina
   src/net/api.ts, czyste funkcje z src/net/siec.ts i HTML z src/ui/siec.ts z DOM; main.ts woła tylko kilka metod.

   Wszystko działa tylko z ?siec=1 w adresie strony i przy odpowiadającym serwerze (informację o danych osobowych
   i administratora danych musi jeszcze dać Mateusz). Bez tego każda metoda zachowuje się jak gra bez sieci: zwykły świat,
   bez znaczników, bez dodatkowych poleceń. Symulacji nic tu nie zmienia w trakcie kroku: zajęte klatki wchodzą do gry
   tylko jako wejście startu (lista budynków dla buildWorld i miejsce startu zarządu przed new Sim).

   Gra sieciowa należy do konta, które ją zaczęło (StanSieci.konto): wczytana na innym koncie albo bez zalogowania toczy
   się dalej bez sieci (bez zajmowania i bez chmury). Zapis w chmurze idzie od wersji, którą ta gra ostatnio wysłała
   (StanSieci.wersja), a zapis wczytany z chmury od wersji z serwera, więc stary zapis z innego urządzenia nie nadpisze
   nowszej gry bez ostrzeżenia. Odpowiedzi z sieci sprawdzają numer gry (gen): spóźniona odpowiedź z poprzedniej gry
   nic nie zmienia w nowej. */

import type { MenuItem } from '../sim/orders.ts';
import type { Sim, SimState } from '../sim/sim.ts';
import { htmlSieci, NAPIS_ZNACZNIKA, type WidokSieci } from '../ui/siec.ts';
import { readSave, type Save, saveLabel } from '../ui/zapis.ts';
import { type Klatka, type LatLon, prostokatMapy } from '../world/klucze.ts';
import type { Loaded } from '../world/load.ts';
import type { World } from '../world/world.ts';
import { type ApiGry, utworzApi } from './api.ts';
import type { ZajetaKlatka } from './protokol.ts';
import {
  budynkiObcych,
  celeBezDomu,
  doZajecia,
  drzwiKlatek,
  kafelekUlicy,
  klatkaPod,
  klatkaSiedziby,
  naProgu,
  postawNaUlicy,
  type StanSieci,
  startSieci,
  type Znacznik,
  znaczniki,
} from './siec.ts';

/** ponowny start po przegranym wyścigu o klatkę nowej siedziby: dane osiedla i stan sieci przez przeładowanie */
export const PONOWNY_START = 'za-murem-0.4-siec-start';
/** co ile odświeżać zajęte klatki z serwera i co ile najwyżej wysyłać zapis do chmury */
const ODSWIEZ_MS = 120_000;
const CHMURA_MS = 60_000;

/** świat do gry: bez (lista budynków, które nie mogą być siedzibą) dla gry sieciowej, null dla gry bez sieci */
export type BudowaSwiata = (bez: string[] | null) => World;

export interface OpcjeGry {
  /** blok #siec na karcie startowej (bez niego blok się nie pokazuje, ale logowanie da się sprawdzić, np. w testach) */
  el: HTMLElement | null;
  /** warstwa znaczników klatek nad mapą (#klatki) */
  warstwa: HTMLElement | null;
  /** ?siec=1 w adresie strony */
  wlaczona: boolean;
  touch: boolean;
  /** podpowiedź na dole ekranu gry */
  say: (t: string, ms?: number) => void;
  /** punkt na ekranie dla miejsca w kafelkach */
  screenOf: (x: number, y: number) => [number, number];
  /** „Kontynuuj z chmury” na karcie startowej */
  onChmura: (s: Save) => void;
  /** napis pod formularzem adresu w trakcie startu */
  status?: (t: string) => void;
  /** tryb gry wybrany na karcie startowej (do ponownego startu po przeładowaniu) */
  tryb?: () => string;
  api?: ApiGry;
  /** pamięć sesji przeglądarki (testy podają własną) */
  sesja?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** przeładowanie strony po przegranym wyścigu o klatkę */
  przeladuj?: () => void;
}

/** ponowny start z pamięci sesji */
interface Ponownie {
  data: Loaded;
  stan: StanSieci;
  tryb?: string;
}

/** zapis z chmury sprawdzony tak jak zapis z przeglądarki (readSave) */
function zapisZChmury(dane: unknown): Save | null {
  const tekst = JSON.stringify(dane);
  return readSave({ getItem: () => tekst, setItem: () => {}, removeItem: () => {} });
}

export class GraSieciowa {
  private readonly o: OpcjeGry;
  private readonly api: ApiGry;
  private widok: WidokSieci = { stan: 'wylogowani' };
  private zalogowani = false;
  private nick: string | null = null;
  private chmura: Save | null = null;
  /** wersja zapisu z chmury (GET /api/zapis) */
  private wersjaZChmury: number | undefined;
  /** wersja, od której ta gra zapisuje do chmury (undefined: nadpisuje, nowa gra) */
  private wersjaChmury: number | undefined;
  private chmuraStop = false;
  private wysyla = false;
  private ostatniZapis = -1e12;
  /** stan sieci gry w toku (do zapisu); null: gra bez sieci */
  stan: StanSieci | null = null;
  private swiat: World | null = null;
  private srodek: LatLon | null = null;
  /** numer gry: rośnie przy każdym starcie, spóźnione odpowiedzi z poprzedniej gry są pomijane */
  private gen = 0;
  /** numer odświeżenia listy klatek: zajęcie unieważnia odświeżenie, które poszło przed nim */
  private odsw = 0;
  private nowa = false;
  /** gra sieciowa innego konta albo bez zalogowania: dalej bez sieci */
  private bezSieci = false;
  /** zajmowanie nowej siedziby przerwane (błąd serwera, który się nie zmieni): cele jak zwykle */
  private porzucone = false;
  private restartuje = false;
  private komunikat: string | null = null;
  private klatki: ZajetaKlatka[] = [];
  private cel: Klatka | null = null;
  private zn: Znacznik[] = [];
  private znEl: HTMLElement[] = [];
  private odswiezono = 0;
  private sprawdzono = 0;
  private zajmuje = false;
  private readonly specjalne = new Map<MenuItem, Klatka>();
  private ponownie: Ponownie | null = null;
  /** dane osiedla gry w toku (do ponownego startu) */
  private dane: Loaded | null = null;
  /** drzwi świata według klucza klatki (liczone raz na świat) */
  private drzwi: Map<string, [number, number]> | null = null;

  constructor(o: OpcjeGry) {
    this.o = o;
    this.api = o.api ?? utworzApi();
    if (!o.wlaczona) return;
    try {
      const raw = this.sesja()?.getItem(PONOWNY_START);
      if (raw) {
        this.sesja()?.removeItem(PONOWNY_START);
        const p = JSON.parse(raw) as Ponownie;
        if (p?.data?.geo && Array.isArray(p.stan?.zajete)) this.ponownie = p;
      }
    } catch {
      this.ponownie = null;
    }
  }

  private sesja() {
    return this.o.sesja === undefined ? globalThis.sessionStorage : this.o.sesja;
  }

  /** Sprawdza serwer i sesję, pokazuje blok na karcie startowej (bez bloku, np. w testach, tylko sprawdza). Bez
      ?siec=1 albo bez serwera nic nie robi. */
  async init(): Promise<void> {
    const el = this.o.el;
    if (!this.o.wlaczona) return;
    if (!(await this.api.serwerDostepny())) return;
    const ja = await this.api.ja();
    this.zalogowani = ja.ok;
    this.nick = ja.ok ? ja.dane.nick : null;
    this.widok = ja.ok ? { stan: 'zalogowani', nick: ja.dane.nick } : { stan: 'wylogowani' };
    if (ja.ok) await this.wczytajChmure();
    if (!el) return;
    el.hidden = false;
    this.rysuj();
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-siec]');
      if (b) void this.akcja(b.dataset.siec ?? '');
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
        e.preventDefault();
        void this.akcja('zaloguj');
      }
    });
  }

  /** ponowny start po przeładowaniu (dane osiedla i tryb gry), żeby main.ts od razu wszedł do gry */
  ponownyStart(): { data: Loaded; tryb?: string } | null {
    return this.ponownie ? { data: this.ponownie.data, tryb: this.ponownie.tryb } : null;
  }

  private rysuj(nick?: string) {
    const el = this.o.el;
    if (!el) return;
    el.innerHTML = htmlSieci(this.widok);
    const pole = el.querySelector<HTMLInputElement>('#scNick');
    if (pole && nick) pole.value = nick;
  }

  private async wczytajChmure() {
    const z = await this.api.pobierzZapis();
    this.chmura = z.ok ? zapisZChmury(z.dane.dane) : null;
    this.wersjaZChmury = z.ok ? z.dane.wersja : undefined;
    this.widok.chmura = this.chmura ? saveLabel(this.chmura) : null;
  }

  private async akcja(a: string) {
    const el = this.o.el;
    if (!el || this.widok.czeka) return;
    if (a === 'chmura') {
      if (this.chmura) this.o.onChmura(this.chmura);
      return;
    }
    const nick = el.querySelector<HTMLInputElement>('#scNick')?.value.trim() ?? '';
    const haslo = el.querySelector<HTMLInputElement>('#scHaslo')?.value ?? '';
    this.widok = { ...this.widok, czeka: true, komunikat: undefined };
    this.rysuj(nick);
    if (a === 'wyloguj') {
      await this.api.wyloguj();
      this.zalogowani = false;
      this.nick = null;
      this.chmura = null;
      this.widok = { stan: 'wylogowani', komunikat: 'Wylogowani. Gra działa dalej bez sieci.' };
    } else if (a === 'zaloguj' || a === 'zaloz') {
      const r = a === 'zaloz' ? await this.api.zaloz(nick, haslo) : await this.api.zaloguj(nick, haslo);
      if (r.ok) {
        this.zalogowani = true;
        this.nick = r.dane.nick;
        this.widok = {
          stan: 'zalogowani',
          nick: r.dane.nick,
          komunikat:
            a === 'zaloz' ? 'Konto założone. Zapiszcie sobie hasło: bez e-maila nie da się go odzyskać.' : undefined,
        };
        await this.wczytajChmure();
      } else {
        const czekaj = r.ponowZa ? ` Spróbujcie za ${Math.ceil(r.ponowZa / 60)} min.` : '';
        this.widok = { stan: 'wylogowani', komunikat: `${r.komunikat}${czekaj}` };
      }
    }
    this.widok.czeka = false;
    this.rysuj(nick);
  }

  /**
   * Świat do gry. Zapis gry sieciowej: świat z tymi samymi wykluczeniami co przy starcie (także bez sieci). Nowa gra
   * zalogowanej drużyny na prawdziwym adresie: start przez serwer (startSieci). Inaczej, także przy błędzie serwera,
   * zwykły świat (zbuduj(null)).
   */
  async przygotuj(data: Loaded, zbuduj: BudowaSwiata, saved?: Save): Promise<World> {
    this.gen++;
    this.stan = null;
    this.swiat = null;
    this.klatki = [];
    this.cel = null;
    this.zn = [];
    this.nowa = !saved;
    this.komunikat = null;
    this.chmuraStop = false;
    this.bezSieci = false;
    this.porzucone = false;
    this.restartuje = false;
    if (saved?.siec) {
      const swiat = zbuduj(saved.siec.zajete);
      this.ustaw(data, swiat, { ...saved.siec });
      const obce = !!saved.siec.konto && saved.siec.konto !== this.nick;
      this.bezSieci = !this.zalogowani || obce;
      if (this.zalogowani && obce) this.komunikat = 'Ten zapis jest z gry innego konta, więc gra toczy się bez sieci.';
      // zapis z chmury albo ten sam zapis co w chmurze (ta sama chwila zapisu, np. wysłany przy zamykaniu strony, kiedy
      // odpowiedź z nową wersją już nie doszła): od wersji z serwera; inny zapis z przeglądarki: od wersji, którą ta gra
      // ostatnio wysłała (nowszy zapis z innego urządzenia skończy się konfliktem wersji)
      this.wersjaChmury = this.chmura && this.chmura.at === saved.at ? this.wersjaZChmury : saved.siec.wersja;
      if (!this.bezSieci) void this.poWczytaniu(this.gen);
      return swiat;
    }
    if (saved) return zbuduj(null);
    const p = this.ponownie;
    if (p && p.data.geo === data.geo) {
      this.ponownie = null;
      const swiat = zbuduj(p.stan.zajete);
      this.ustaw(data, swiat, { ...p.stan, konto: this.nick ?? p.stan.konto });
      this.bezSieci = !this.zalogowani;
      this.komunikat =
        'Inna drużyna była szybsza. Siedzibą zostaje następna wolna klatka: dojdźcie do niej przed nocą.';
      this.wersjaChmury = undefined;
      if (!this.bezSieci) void this.odswiez(this.gen);
      return swiat;
    }
    if (!this.zalogowani || data.src === 'demo') return zbuduj(null);
    this.o.status?.('Sprawdzam na serwerze gry, czy wasza klatka jest wolna…');
    const r = await startSieci(this.api, (bez) => zbuduj(bez), data.geo.c);
    if (!r.ok) {
      this.komunikat = `${r.komunikat} Gramy bez sieci.`;
      return zbuduj(null);
    }
    this.klatki = r.klatki;
    this.ustaw(data, r.swiat, { ...r.stan, ...(this.nick ? { konto: this.nick } : {}) });
    this.komunikat = r.komunikat;
    // nowa gra nadpisuje stary zapis w chmurze (jeden na konto)
    this.wersjaChmury = undefined;
    this.odswiezono = performance.now();
    return r.swiat;
  }

  private ustaw(data: Loaded, swiat: World, stan: StanSieci) {
    this.drzwi = null;
    this.zn = [];
    this.swiat = swiat;
    this.srodek = data.geo.c;
    this.stan = stan;
    this.dane = data;
    this.cel = stan.dom ? null : klatkaSiedziby(swiat, data.geo.c);
  }

  /** wczytana gra sieciowa: nasza klatka jeszcze raz na serwerze (bez zmian, jeśli jest nasza) i znaczniki */
  private async poWczytaniu(gen: number) {
    const swiat = this.swiat;
    const srodek = this.srodek;
    if (!swiat || !srodek || !this.stan) return;
    if (this.stan.dom) {
      const k = klatkaSiedziby(swiat, srodek);
      const r = k ? await this.api.zajmij(doZajecia(k)) : null;
      if (gen !== this.gen) return;
      if (r && !r.ok && r.blad === 'zajeta')
        this.o.say('Kiedy was nie było, waszą klatkę zajęła inna drużyna. Gra toczy się dalej u was.', 9000);
    }
    await this.odswiez(gen);
  }

  /** komunikat startu gry sieciowej (zamiast zwykłego powitania) albo null */
  komunikatStartu(): string | null {
    return this.komunikat;
  }

  /** stan przed new Sim: nowa gra bez domu stawia zarząd na ulicy przed drzwiami utraconej klatki */
  poStarcie(st: SimState, w: World): void {
    if (!this.stan || this.stan.dom || !this.nowa) return;
    postawNaUlicy(st, w, kafelekUlicy(w, this.stan.utracony));
  }

  /** drużyna bez domu, która może zająć klatkę (cele „Bez domu” zamiast celów pierwszego dnia) */
  bezDomu(): boolean {
    return !!this.stan && !this.stan.dom && !this.bezSieci && !this.porzucone;
  }

  cele(zaznaczeni: boolean) {
    return celeBezDomu(zaznaczeni, this.o.touch);
  }

  /** co klatkę: znaczniki na mapie, dojście do nowej siedziby (co pół sekundy), odświeżanie zajętych */
  klatka(sim: Sim, now: number, ukryj: boolean): void {
    const warstwa = this.o.warstwa;
    if (!this.stan || !this.swiat || sim.w !== this.swiat) {
      if (warstwa) warstwa.hidden = true;
      return;
    }
    if (warstwa) {
      warstwa.hidden = ukryj;
      if (!ukryj) this.ustawZnaczniki();
    }
    if (this.bezSieci || this.restartuje) return;
    if (this.bezDomu() && !this.zajmuje && now - this.sprawdzono > 500) {
      this.sprawdzono = now;
      if (naProgu(sim.st, sim.w)) void this.zajmijSiedzibe();
    }
    if (now - this.odswiezono > ODSWIEZ_MS) {
      this.odswiezono = now;
      void this.odswiez(this.gen);
    }
  }

  private async odswiez(gen: number) {
    const swiat = this.swiat;
    const srodek = this.srodek;
    if (!swiat || !srodek) return;
    const nr = ++this.odsw;
    const r = await this.api.zajete(prostokatMapy(swiat, srodek));
    if (r.ok && gen === this.gen && nr === this.odsw) {
      this.klatki = r.dane.klatki;
      this.zn = [];
    }
  }

  private ustawZnaczniki() {
    const warstwa = this.o.warstwa;
    const swiat = this.swiat;
    const srodek = this.srodek;
    if (!warstwa || !swiat || !srodek) return;
    if (!this.zn.length && (this.klatki.length || this.cel)) {
      this.drzwi ??= drzwiKlatek(swiat, srodek);
      this.zn = znaczniki(swiat, srodek, this.klatki, this.cel, this.drzwi);
    }
    while (this.znEl.length < this.zn.length) {
      const d = document.createElement('div');
      d.className = 'kl-zn';
      d.appendChild(document.createElement('span'));
      warstwa.appendChild(d);
      this.znEl.push(d);
    }
    this.znEl.forEach((d, k) => {
      const z = this.zn[k];
      d.hidden = !z;
      if (!z) return;
      if (d.dataset.k !== z.klucz || d.dataset.r !== z.rodzaj) {
        d.dataset.k = z.klucz;
        d.dataset.r = z.rodzaj;
        d.className = `kl-zn ${z.rodzaj}`;
        (d.firstElementChild as HTMLElement).textContent = NAPIS_ZNACZNIKA[z.rodzaj];
      }
      const [sx, sy] = this.o.screenOf(z.x, z.y);
      d.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    });
  }

  /** Klatka nowej siedziby na serwerze: udało się (dom), zajęta (ponowny start bez tego budynku i bez budynków
      z cudzymi klatkami), błąd serwera, który się nie zmieni (zajmowanie przerwane), albo sieć (próba za pół minuty). */
  private async zajmijSiedzibe() {
    const swiat = this.swiat;
    const srodek = this.srodek;
    const stan = this.stan;
    const gen = this.gen;
    if (!swiat || !srodek || !stan || stan.dom || this.zajmuje || this.restartuje) return;
    const k = klatkaSiedziby(swiat, srodek);
    if (!k) return;
    this.zajmuje = true;
    const r = await this.api.zajmij(doZajecia(k));
    this.zajmuje = false;
    if (gen !== this.gen || this.stan !== stan) return;
    if (r.ok) {
      stan.dom = true;
      this.cel = null;
      this.odsw++;
      this.klatki = [...this.klatki.filter((x) => x.klucz !== k.klucz), r.dane.klatka];
      this.zn = [];
      this.o.say('Klatka jest wasza. Inne drużyny widzą ją teraz jako zajętą.', 9000);
      return;
    }
    if (r.blad === 'zajeta') {
      const zajete = [...new Set([...stan.zajete, k.budynek, ...budynkiObcych(this.klatki)])].sort();
      if (zajete.length === stan.zajete.length) {
        // lista się nie wydłuża (np. nie ma już wolnego budynku mieszkalnego): bez ponownego startu w kółko
        this.porzucone = true;
        this.o.say('Wolnej klatki w okolicy już nie ma. Gra toczy się dalej bez zajmowania.', 9000);
        return;
      }
      this.restartuje = true;
      try {
        const p: Ponownie = { data: this.dane as Loaded, stan: { ...stan, zajete, dom: false }, tryb: this.o.tryb?.() };
        this.sesja()?.setItem(PONOWNY_START, JSON.stringify(p));
      } catch {
        // bez pamięci sesji gracz zacznie od nowa sam
      }
      this.o.say('Inna drużyna zajęła tę klatkę przed wami. Szukamy następnej wolnej…', 6000);
      setTimeout(() => (this.o.przeladuj ?? (() => location.reload()))(), 2500);
      return;
    }
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      // za daleko, limit, zła pozycja albo brak sesji: ponowienie nic nie zmieni
      this.porzucone = true;
      this.o.say(`${r.komunikat} Gra toczy się dalej bez zajmowania klatki.`, 9000);
      return;
    }
    // sieć, przeciążony serwer: spróbujemy za pół minuty
    this.sprawdzono = performance.now() + 30_000;
    this.o.say(`${r.komunikat} Klatkę zajmiemy, kiedy serwer odpowie.`, 6000);
  }

  /** „Zajmij klatkę” w menu na budynku (gra sieciowa, z potwierdzeniem); puste poza grą sieciową i na naszych klatkach */
  menu(sim: Sim, tile: number): MenuItem[] {
    if (!this.stan || !this.srodek || this.bezSieci || sim.w !== this.swiat) return [];
    const k = klatkaPod(sim.w, this.srodek, tile);
    if (!k || this.klatki.some((x) => x.klucz === k.klucz && x.moja)) return [];
    const obca = this.klatki.some((x) => x.klucz === k.klucz);
    const dom = !!this.cel && k.klucz === this.cel.klucz;
    const item: MenuItem = {
      cmd: { t: 'select', ids: [] },
      label: obca ? 'Klatka zajęta przez inną drużynę' : dom ? 'Zajmij klatkę (wasz nowy dom)' : 'Zajmij klatkę',
      quick: false,
      confirm: !obca,
    };
    this.specjalne.clear();
    this.specjalne.set(item, k);
    return [item];
  }

  /** polecenie z menu gry sieciowej: true, gdy to było nasze (main.ts nie wysyła go do symulacji) */
  obsluz(m: MenuItem): boolean {
    const k = this.specjalne.get(m);
    if (!k) return false;
    this.specjalne.clear();
    if (this.klatki.some((x) => x.klucz === k.klucz && !x.moja)) {
      this.o.say('Tę klatkę zajęła już inna drużyna.', 3000);
      return true;
    }
    if (this.cel && k.klucz === this.cel.klucz) void this.zajmijSiedzibe();
    else void this.zajmijInna(k);
    return true;
  }

  private async zajmijInna(k: Klatka) {
    const gen = this.gen;
    const r = await this.api.zajmij(doZajecia(k));
    if (gen !== this.gen) return;
    if (r.ok) {
      this.odsw++;
      this.klatki = [...this.klatki.filter((x) => x.klucz !== k.klucz), r.dane.klatka];
      this.zn = [];
      this.o.say(
        'Klatka zajęta: inne drużyny widzą ją jako waszą. Przeprowadzka do niej przyjdzie w grze później.',
        7000,
      );
    } else if (r.blad === 'zajeta') {
      this.o.say('Tę klatkę zajęła już inna drużyna.', 4000);
      void this.odswiez(gen);
    } else this.o.say(r.komunikat, 5000);
  }

  /** Zapis do chmury po zapisie w przeglądarce: tylko gra sieciowa tego konta, najwyżej raz na minutę i jeden naraz
      (limity serwera); po konflikcie wersji (nowszy zapis z innego urządzenia) już nie wysyła. */
  zapisz(s: Save): void {
    if (!this.zalogowani || !this.stan || this.bezSieci || this.chmuraStop || this.wysyla) return;
    const now = Date.now();
    if (now - this.ostatniZapis < CHMURA_MS) return;
    this.ostatniZapis = now;
    this.wysyla = true;
    const gen = this.gen;
    const stan = this.stan;
    void this.api.wyslijZapis(s as unknown as Record<string, unknown>, this.wersjaChmury).then((r) => {
      this.wysyla = false;
      if (gen !== this.gen) return;
      if (r.ok) {
        this.wersjaChmury = r.dane.wersja;
        // wersja w stanie trafia do następnego zapisu w przeglądarce (wczytana gra wyśle od niej)
        stan.wersja = r.dane.wersja;
      } else if (r.blad === 'konflikt_wersji') {
        this.chmuraStop = true;
        this.o.say('Na innym urządzeniu jest nowszy zapis tej gry. Ten zostaje tylko w tej przeglądarce.', 9000);
      }
    });
  }

  /** koniec gry (porażka): zapis w chmurze i klatki drużyny znikają z serwera, tak jak zapis w przeglądarce */
  koniec(): void {
    if (!this.zalogowani || !this.stan || this.bezSieci) return;
    this.gen++;
    this.stan = null;
    void this.api.usunZapis();
    void this.api.zwolnijWszystkie();
  }

  /** do testów i zrzutów (window.zm.siec) */
  podglad() {
    return {
      zalogowani: this.zalogowani,
      stan: this.stan ? { ...this.stan } : null,
      bezSieci: this.bezSieci,
      klatki: this.klatki.length,
      znaczniki: this.zn.map((z) => z.rodzaj),
      cel: this.cel?.klucz ?? null,
    };
  }
}
