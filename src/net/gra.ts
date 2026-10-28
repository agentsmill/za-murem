/* Gra sieciowa w przeglądarce, etap 2 (docs/superpowers/specs/2026-10-18-multiplayer-design.md): blok „Gra z sąsiadami”
   na karcie startowej (kod powrotu do drużyny, dawne logowanie nickiem, zapis z chmury), start drużyny przez serwer
   (klatka pod adresem albo start bez domu), znaczniki zajętych klatek na mapie, „Zajmij klatkę” w menu i zapis w chmurze.
   Spina src/net/api.ts, czyste funkcje z src/net/siec.ts i HTML z src/ui/siec.ts z DOM; main.ts woła tylko kilka metod.

   Wszystko działa tylko przy włączonej sieci (src/net/flaga.ts: ?siec=1 albo VITE_SIEC=1 z budowy strony) i przy
   odpowiadającym serwerze (informację o danych osobowych i administratora danych musi jeszcze dać Mateusz). Bez tego
   każda metoda zachowuje się jak gra bez sieci: zwykły świat, bez znaczników, bez dodatkowych poleceń. Symulacji nic tu
   nie zmienia w trakcie kroku: zajęte klatki wchodzą do gry jako wejście startu (lista budynków dla buildWorld i miejsce
   startu zarządu przed new Sim) i poleceniem zajete w kolejce (M2 fala 2: drzwi klatek innych drużyn zamknięte na stałe,
   po każdej zmianie listy).

   Bez formularza: drużynę (konto bez nicku i hasła, POST /api/druzyna) zakłada `przygotuj` przy nowej grze na prawdziwym
   adresie, jeśli gracz nie ma jeszcze sesji, a nie wejście na stronę, żeby ci, którzy tylko zajrzeli, nie dostawali
   kont. Dzieje się to raz na start gry; błąd (503, brak sieci, cokolwiek) to gra bez sieci z jednym komunikatem i bez
   drugiej próby w tym starcie. Demo, zapisy i ponowny start drużyny nie zakładają niczego. Wracać do drużyny z innej
   przeglądarki można kodem powrotu z karty startowej (akcja `powrot`), a konto z nickiem i hasłem działa dalej za
   odnośnikiem „logowanie” (stan `logowanie` bloku). Serwer trzyma punkt startu drużyny tylko w pamięci, więc po jego
   restarcie odświeżanie klatek, które dostanie 409 brak_startu, podaje punkt startu i pyta jeszcze raz (raz); każda
   inna porażka odświeżenia (429 też) zostawia ostatnią listę, bez komunikatu.

   Kod powrotu i usunięcie drużyny w grze (Menu, main.ts): `menuSieci` mówi Menu, które przyciski sieci pokazać; `kod` bierze
   z serwera nowy kod (każdy unieważnia poprzedni, porażka daje null i powód w `blad`); `pokazacKod` i `kodPokazany` dają
   okno z kodem raz po pierwszym porannym raporcie drużyny anonimowej (StanSieci.kodPokazany, w zapisie); `usun` kasuje
   drużynę anonimową z serwera bez hasła i kończy sieć w tej grze (StanSieci.usunieta: bez zapisów do chmury, bez
   odświeżania klatek, bez przycisków sieci, a zapis wczytuje się bez sieci na czyimkolwiek koncie). Zapis drużyny
   anonimowej wczytany bez jej sesji (zgubione ciasteczko, inna przeglądarka) toczy się bez sieci i dostaje jeden komunikat
   o kodzie powrotu z karty startowej, o ile serwer odpowiada (inaczej karta nie ma pola kodu, a gra bez serwera milczy
   jak dotąd).

   Gra sieciowa należy do konta, które ją zaczęło (StanSieci.konto = Ja.znak: nick konta z nickiem, „#<id>” drużyny
   anonimowej): wczytana na innym koncie albo bez zalogowania toczy się dalej bez sieci (bez zajmowania i bez chmury).
   Zapis w chmurze idzie od wersji, którą ta gra ostatnio wysłała (StanSieci.wersja), a zapis wczytany z chmury od
   wersji z serwera, więc stary zapis z innego urządzenia nie nadpisze nowszej gry bez ostrzeżenia. Odpowiedzi z sieci
   sprawdzają numer gry (gen): spóźniona odpowiedź z poprzedniej gry nic nie zmienia w nowej.

   Język (src/core/jezyk.ts): komunikat w bloku #siec trzymamy jako Tx, a opis zapisu z chmury liczymy przy każdym
   rysowaniu, więc po zmianie języka blok rysuje się od nowa w nowym (przerysuj, woła ją main.ts). Znaczniki klatek
   zmieniają napis same w następnej klatce, a podpowiedzi (say), napisy menu i komunikat startu są w języku z chwili,
   w której powstają. Serwer mówi po polsku; jego komunikat po angielsku daje txBledu/komunikatBledu z src/net/api.ts. */

import { jezyk, L, type Tx, tr, tx, txCat } from '../core/jezyk.ts';
import type { MenuItem } from '../sim/orders.ts';
import type { Sim, SimState } from '../sim/sim.ts';
import { htmlSieci, NAPIS_ZNACZNIKA, type WidokSieci } from '../ui/siec.ts';
import { readSave, type Save, saveLabel } from '../ui/zapis.ts';
import { type Klatka, type LatLon, prostokatMapy } from '../world/klucze.ts';
import type { Loaded } from '../world/load.ts';
import type { World } from '../world/world.ts';
import { type ApiGry, komunikatBledu, txBledu, utworzApi } from './api.ts';
import { type Ja, normalizujKod, type ZajetaKlatka } from './protokol.ts';
import {
  budynkiObcych,
  celeBezDomu,
  doZajecia,
  drzwiKlatek,
  drzwiObcych,
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
  /** sieć włączona dla tej strony (siecWlaczona z src/net/flaga.ts: ?siec=1 albo VITE_SIEC=1) */
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
  private widok: WidokSieci = { stan: 'druzyna' };
  /** serwer gry odpowiedział przy init (sieć włączona i serwer działa) */
  private dostepny = false;
  /** jest sesja: konto z nickiem albo drużyna anonimowa */
  private zalogowani = false;
  /** Ja.znak zalogowanego konta (nick albo „#<id>”); null bez sesji */
  private znak: string | null = null;
  /** zalogowana drużyna jest anonimowa (bez nicku i hasła) */
  private anonimowe = false;
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
  /** limit zmian okolicy (429) przy podawaniu punktu startu: w tej grze już nie próbujemy */
  private startZablokowany = false;
  private restartuje = false;
  /** komunikat startu: Tx albo napis w języku z chwili startu (z startSieci) */
  private komunikat: Tx | string | null = null;
  /** powód ostatniej porażki kod() albo usun() */
  private bladSerwera: Tx | null = null;
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

  /** Sprawdza serwer i sesję, pokazuje blok na karcie startowej (bez bloku, np. w testach, tylko sprawdza). Przy
      wyłączonej sieci albo bez serwera nic nie robi. Drużyny nie zakłada: to dopiero pierwsza gra (przygotuj). */
  async init(): Promise<void> {
    const el = this.o.el;
    if (!this.o.wlaczona) return;
    if (!(await this.api.serwerDostepny())) return;
    this.dostepny = true;
    const ja = await this.api.ja();
    if (ja.ok) {
      this.zaloguj(ja.dane);
      await this.wczytajChmure();
    }
    this.widok = this.widokBazowy();
    if (!el) return;
    el.hidden = false;
    this.rysuj();
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-siec]');
      if (b) void this.akcja(b.dataset.siec ?? '');
    });
    el.addEventListener('keydown', (e) => {
      const pole = e.target as HTMLElement;
      if (e.key === 'Enter' && pole.tagName === 'INPUT') {
        e.preventDefault();
        void this.akcja(pole.id === 'scKod' ? 'powrot' : 'zaloguj');
      }
    });
  }

  /** klient API do wyszukiwania adresu (loadAddress): tylko przy włączonej sieci i odpowiadającym serwerze (po init),
      inaczej undefined i adres szuka się w przeglądarce jak bez sieci */
  apiAdresu(): Pick<ApiGry, 'adres'> | undefined {
    return this.dostepny ? this.api : undefined;
  }

  /** czy gracz gra jako drużyna anonimowa (sesja bez nicku i hasła) */
  anonimowa(): boolean {
    return this.zalogowani && this.anonimowe;
  }

  /** Co Menu ma dać z sieci (menuSheet): przycisk kodu powrotu w grze sieciowej, a drużynie anonimowej też usunięcie z
      serwera. Undefined, gdy ta gra nie ma sieci (bez serwera, inne konto, zgubiona sesja, usunięta drużyna). */
  menuSieci(): { anonimowa: boolean } | undefined {
    return this.zalogowani && this.stan && !this.bezSieci ? { anonimowa: this.anonimowe } : undefined;
  }

  /** powód ostatniej porażki kod() albo usun() w bieżącym języku (Tx z komunikatu serwera); null po udanej próbie */
  blad(): Tx | null {
    return this.bladSerwera;
  }

  /** Nowy kod powrotu drużyny z serwera (POST /api/druzyna/kod; stary przestaje działać), do pokazania w kodSheet.
      Null bez sieci w tej grze albo przy błędzie serwera (powód w blad()); nie ponawia sam. */
  async kod(): Promise<string | null> {
    this.bladSerwera = null;
    if (!this.menuSieci()) return null;
    const r = await this.api.nowyKod();
    if (r.ok) return r.dane.kod;
    this.bladSerwera = txBledu(r);
    return null;
  }

  /** Czy po pierwszym porannym raporcie trzeba pokazać kod powrotu: gra sieciowa drużyny anonimowej, kod jeszcze nie
      pokazany (StanSieci.kodPokazany, w zapisie, więc raz na grę także po wczytaniu). */
  pokazacKod(): boolean {
    return this.anonimowa() && !!this.stan && !this.bezSieci && !this.stan.kodPokazany;
  }

  /** kod pokazany (także gdy serwer go nie dał: bez ponawiania, dalej jest w Menu); trafia do następnego zapisu */
  kodPokazany(): void {
    if (this.stan) this.stan.kodPokazany = true;
  }

  /** Usuwa drużynę anonimową z serwera (DELETE /api/konto, bez hasła: klatki, zapis w chmurze, kod powrotu i sesja).
      Po 204 sieć w tej grze się kończy: gra toczy się dalej bez zapisów do chmury, odświeżania klatek i przycisków sieci
      w Menu, a stan sieci zostaje w zapisie z `usunieta` (ten sam świat, gra bez sieci także po wczytaniu). Porażka
      (powód w blad()) niczego nie zmienia. Konto z nickiem usuwa się hasłem poza grą, więc tu daje false bez pytania. */
  async usun(): Promise<boolean> {
    this.bladSerwera = null;
    if (!this.anonimowa() || !this.stan || this.bezSieci) return false;
    const stan = this.stan;
    const r = await this.api.usunDruzyne();
    if (!r.ok) {
      this.bladSerwera = txBledu(r);
      return false;
    }
    // spóźnione odpowiedzi z sieci tej gry (odświeżenie klatek, zapis do chmury) nic już nie zmieniają
    this.gen++;
    stan.usunieta = true;
    this.zalogowani = false;
    this.znak = null;
    this.anonimowe = false;
    this.bezSieci = true;
    this.chmura = null;
    this.wersjaZChmury = undefined;
    this.wersjaChmury = undefined;
    this.klatki = [];
    this.cel = null;
    this.zn = [];
    this.widok = this.widokBazowy();
    this.rysuj();
    return true;
  }

  /** sesja z odpowiedzi serwera (konto z nickiem, drużyna anonimowa, powrót kodem) */
  private zaloguj(ja: Ja) {
    this.zalogowani = true;
    this.znak = ja.znak;
    this.anonimowe = ja.anonimowe;
  }

  /** blok, jaki gracz widzi na karcie startowej bez niczego w toku: drużyna (bez sesji albo anonimowa) lub konto z nickiem */
  private widokBazowy(): WidokSieci {
    if (!this.zalogowani) return { stan: 'druzyna' };
    return this.anonimowe ? { stan: 'druzyna', znak: this.znak ?? '' } : { stan: 'zalogowani', nick: this.znak ?? '' };
  }

  /** ponowny start po przeładowaniu (dane osiedla i tryb gry), żeby main.ts od razu wszedł do gry */
  ponownyStart(): { data: Loaded; tryb?: string } | null {
    return this.ponownie ? { data: this.ponownie.data, tryb: this.ponownie.tryb } : null;
  }

  /** blok w bieżącym języku; opis zapisu z chmury liczony przy każdym rysowaniu (zależy od języka). `wpis` to to, co
      gracz miał w polach (nowy HTML ma pola puste). */
  private rysuj(wpis: { nick?: string; haslo?: string; kod?: string } = {}) {
    const el = this.o.el;
    if (!el) return;
    el.innerHTML = htmlSieci({ ...this.widok, chmura: this.chmura ? saveLabel(this.chmura) : null });
    for (const [id, wartosc] of [
      ['#scNick', wpis.nick],
      ['#scHaslo', wpis.haslo],
      ['#scKod', wpis.kod],
    ] as const) {
      const pole = el.querySelector<HTMLInputElement>(id);
      if (pole && wartosc) pole.value = wartosc;
    }
  }

  /** Po zmianie języka (woła main.ts): blok „Gra z sąsiadami” od nowa w bieżącym języku, z tym samym komunikatem
      i z wpisanym nickiem, hasłem i kodem. Bez bloku na ekranie (sieć wyłączona, bez serwera) nic nie robi. */
  przerysuj(): void {
    const el = this.o.el;
    if (!el || el.hidden) return;
    const wartosc = (id: string) => el.querySelector<HTMLInputElement>(id)?.value;
    this.rysuj({ nick: wartosc('#scNick'), haslo: wartosc('#scHaslo'), kod: wartosc('#scKod') });
  }

  private async wczytajChmure() {
    const z = await this.api.pobierzZapis();
    this.chmura = z.ok ? zapisZChmury(z.dane.dane) : null;
    this.wersjaZChmury = z.ok ? z.dane.wersja : undefined;
  }

  private async akcja(a: string) {
    const el = this.o.el;
    if (!el || this.widok.czeka) return;
    if (a === 'chmura') {
      if (this.chmura) this.o.onChmura(this.chmura);
      return;
    }
    // przełączniki bloku bez sieci: dawne logowanie nickiem i powrót do bloku drużyny
    if (a === 'logowanie' || a === 'wroc') {
      this.widok = a === 'logowanie' ? { stan: 'logowanie' } : this.widokBazowy();
      this.rysuj();
      return;
    }
    const nick = el.querySelector<HTMLInputElement>('#scNick')?.value.trim() ?? '';
    const haslo = el.querySelector<HTMLInputElement>('#scHaslo')?.value ?? '';
    const kod = el.querySelector<HTMLInputElement>('#scKod')?.value.trim() ?? '';
    // kod zostaje w polu po błędzie (żeby poprawić literówkę), a po udanym powrocie znika
    let zostawKod = true;
    this.widok = { ...this.widok, czeka: true, komunikat: undefined };
    this.rysuj({ nick, kod });
    if (a === 'wyloguj') {
      await this.api.wyloguj();
      this.zalogowani = false;
      this.znak = null;
      this.anonimowe = false;
      this.chmura = null;
      this.widok = {
        stan: 'druzyna',
        komunikat: tx('Wylogowani. Gra działa dalej bez sieci.', 'Logged out. The game carries on offline.'),
      };
    } else if (a === 'powrot') {
      if (!normalizujKod(kod)) {
        // nie kod: bez pytania serwera
        this.widok = {
          ...this.widokBazowy(),
          komunikat: tx(
            'Kod powrotu ma 12 znaków: litery i cyfry w trzech czwórkach.',
            'A return code has 12 characters: letters and digits in three groups of four.',
          ),
        };
      } else {
        const r = await this.api.powrot(kod);
        if (r.ok) {
          this.zaloguj(r.dane);
          await this.wczytajChmure();
          zostawKod = false;
          this.widok = {
            ...this.widokBazowy(),
            komunikat: tx(`Wróciliście do drużyny ${r.dane.znak}.`, `You are back with team ${r.dane.znak}.`),
          };
        } else {
          const czekaj = r.ponowZa ? tx(` Spróbujcie za ${Math.ceil(r.ponowZa / 60)} min.`, '') : '';
          this.widok = { ...this.widokBazowy(), komunikat: txCat(txBledu(r), czekaj) };
        }
      }
    } else if (a === 'zaloguj' || a === 'zaloz') {
      const r = a === 'zaloz' ? await this.api.zaloz(nick, haslo) : await this.api.zaloguj(nick, haslo);
      if (r.ok) {
        this.zaloguj(r.dane);
        await this.wczytajChmure();
        this.widok = {
          ...this.widokBazowy(),
          komunikat:
            a === 'zaloz'
              ? tx(
                  'Konto założone. Zapiszcie sobie hasło: bez e-maila nie da się go odzyskać.',
                  'Account created. Write your password down: without an email there is no way to recover it.',
                )
              : undefined,
        };
      } else {
        // angielski komunikat o limicie prób sam mówi, za ile spróbować (txBledu bierze czas z Retry-After)
        const czekaj = r.ponowZa ? tx(` Spróbujcie za ${Math.ceil(r.ponowZa / 60)} min.`, '') : '';
        this.widok = { stan: 'logowanie', komunikat: txCat(txBledu(r), czekaj) };
      }
    }
    this.widok.czeka = false;
    this.rysuj({ nick, kod: zostawKod ? kod : undefined });
  }

  /**
   * Świat do gry. Zapis gry sieciowej: świat z tymi samymi wykluczeniami co przy starcie (także bez sieci). Nowa gra
   * na prawdziwym adresie przy odpowiadającym serwerze: drużyna z sesją od razu startuje przez serwer (startSieci), a
   * gracz bez sesji dostaje najpierw drużynę anonimową (jedno wywołanie druzyna(), bez ponawiania). Inaczej, także przy
   * błędzie serwera (z jednym komunikatem startu), zwykły świat (zbuduj(null)). Demo nigdy nie zakłada drużyny.
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
    this.startZablokowany = false;
    this.restartuje = false;
    if (saved?.siec) {
      const swiat = zbuduj(saved.siec.zajete);
      this.ustaw(data, swiat, { ...saved.siec });
      // drużyna usunięta z serwera w Menu: ta gra jest już bez sieci na stałe, na czyimkolwiek koncie
      const usunieta = !!saved.siec.usunieta;
      const obce = !usunieta && !!saved.siec.konto && saved.siec.konto !== this.znak;
      this.bezSieci = usunieta || !this.zalogowani || obce;
      if (this.zalogowani && obce)
        this.komunikat = tx(
          'Ten zapis jest z gry innego konta, więc gra toczy się bez sieci.',
          'This save is from another account’s game, so it carries on offline.',
        );
      else if (!usunieta && !this.zalogowani && this.dostepny && saved.siec.konto?.startsWith('#'))
        // zgubione ciasteczko (inna przeglądarka, karta prywatna): gra nie ma po co milczeć, kod powrotu jest na karcie startowej
        this.komunikat = tx(
          'Nie ma tu sesji waszej drużyny, więc gra toczy się bez sieci. Kod powrotu wpisany na karcie startowej przywróci grę w sieci.',
          'There is no session for your team in this browser, so the game carries on offline. Entering your return code on the start card brings it back online.',
        );
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
      this.ustaw(data, swiat, { ...p.stan, konto: this.znak ?? p.stan.konto });
      this.bezSieci = !this.zalogowani;
      this.komunikat = tx(
        'Inna drużyna była szybsza. Siedzibą zostaje następna wolna klatka: dojdźcie do niej przed nocą.',
        'Another team got there first. Your HQ is now the next free stairwell: get there before dark.',
      );
      this.wersjaChmury = undefined;
      if (!this.bezSieci) void this.odswiez(this.gen);
      return swiat;
    }
    if (!this.dostepny || data.src === 'demo') return zbuduj(null);
    if (!this.zalogowani && !(await this.zalozDruzyne())) return zbuduj(null);
    this.o.status?.(
      L(
        'Sprawdzam na serwerze gry, czy wasza klatka jest wolna…',
        'Checking with the game server whether your stairwell is free…',
      ),
    );
    const r = await startSieci(this.api, (bez) => zbuduj(bez), data.geo.c);
    if (!r.ok) {
      // komunikat ze startSieci jest już w bieżącym języku
      this.komunikat = L(`${r.komunikat} Gramy bez sieci.`, `${r.komunikat} Playing offline.`);
      return zbuduj(null);
    }
    this.klatki = r.klatki;
    this.ustaw(data, r.swiat, { ...r.stan, ...(this.znak ? { konto: this.znak } : {}) });
    this.komunikat = r.komunikat;
    // nowa gra nadpisuje stary zapis w chmurze (jeden na konto)
    this.wersjaChmury = undefined;
    this.odswiezono = performance.now();
    return r.swiat;
  }

  /** Drużyna anonimowa przy pierwszej grze na prawdziwym adresie (POST /api/druzyna, od razu z sesją). Jedna próba na
      start gry: błąd (przeciążony serwer, brak sieci, limit nowych drużyn z jednego miejsca) daje jeden komunikat startu
      i grę bez sieci, a następna próba dopiero przy następnym starcie. */
  private async zalozDruzyne(): Promise<boolean> {
    this.o.status?.(L('Zakładam drużynę na serwerze gry…', 'Creating your team on the game server…'));
    const r = await this.api.druzyna();
    if (!r.ok) {
      this.komunikat = txCat(txBledu(r), tx(' Gramy bez sieci.', ' Playing offline.'));
      return false;
    }
    this.zaloguj(r.dane);
    this.widok = this.widokBazowy();
    this.rysuj();
    return true;
  }

  private ustaw(data: Loaded, swiat: World, stan: StanSieci) {
    this.drzwi = null;
    this.zn = [];
    this.swiat = swiat;
    this.srodek = data.geo.c;
    this.stan = stan;
    this.dane = data;
    this.cel = stan.dom || stan.usunieta ? null : klatkaSiedziby(swiat, data.geo.c);
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
        this.o.say(
          L(
            'Kiedy was nie było, waszą klatkę zajęła inna drużyna. Gra toczy się dalej u was.',
            'While you were away, another team took your stairwell. Your own game carries on regardless.',
          ),
          9000,
        );
    }
    await this.odswiez(gen);
  }

  /** komunikat startu gry sieciowej (zamiast zwykłego powitania) w bieżącym języku albo null */
  komunikatStartu(): string | null {
    return this.komunikat === null ? null : tr(this.komunikat);
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
    this.zamknijObce(sim);
    if (this.bezDomu() && !this.zajmuje && now - this.sprawdzono > 500) {
      this.sprawdzono = now;
      if (naProgu(sim.st, sim.w)) void this.zajmijSiedzibe();
    }
    if (now - this.odswiezono > ODSWIEZ_MS) {
      this.odswiezono = now;
      void this.odswiez(this.gen);
    }
  }

  /** M2 fala 2: drzwi klatek innych drużyn do symulacji poleceniem zajete, gdy lista się zmieni (zamknięte na stałe) */
  private zamknijObce(sim: Sim) {
    if (!this.srodek) return;
    const drzwi = drzwiObcych(sim.w, this.srodek, this.klatki);
    const teraz = sim.st.zajete ?? [];
    const czeka = sim.st.cmds.some((c) => c.t === 'zajete');
    if (!czeka && drzwi.join() !== teraz.join()) sim.push({ t: 'zajete', ids: [], drzwi });
  }

  private async odswiez(gen: number) {
    const swiat = this.swiat;
    const srodek = this.srodek;
    if (!swiat || !srodek) return;
    const nr = ++this.odsw;
    const prostokat = prostokatMapy(swiat, srodek);
    let r = await this.api.zajete(prostokat);
    // serwer po restarcie nie pamięta punktu startu drużyny bez siedziby (409 brak_startu): podajemy go i pytamy jeszcze
    // raz, raz. Inna porażka, także limit zmian okolicy (429), zostawia ostatnią listę bez komunikatu; po 429 w tej grze
    // punktu już nie podajemy
    if (!r.ok && r.blad === 'brak_startu' && gen === this.gen && nr === this.odsw && !this.startZablokowany) {
      const start = await this.api.punktStartu(srodek[0], srodek[1]);
      if (start.ok) r = await this.api.zajete(prostokat);
      else if (start.status === 429) this.startZablokowany = true;
    }
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
      // napis od nowa także po zmianie języka
      if (d.dataset.k !== z.klucz || d.dataset.r !== z.rodzaj || d.dataset.l !== jezyk()) {
        d.dataset.k = z.klucz;
        d.dataset.r = z.rodzaj;
        d.dataset.l = jezyk();
        d.className = `kl-zn ${z.rodzaj}`;
        (d.firstElementChild as HTMLElement).textContent = tr(NAPIS_ZNACZNIKA[z.rodzaj]);
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
      this.o.say(
        L(
          'Klatka jest wasza. Inne drużyny widzą ją teraz jako zajętą.',
          'The stairwell is yours. Other teams now see it as taken.',
        ),
        9000,
      );
      return;
    }
    if (r.blad === 'zajeta') {
      const zajete = [...new Set([...stan.zajete, k.budynek, ...budynkiObcych(this.klatki)])].sort();
      if (zajete.length === stan.zajete.length) {
        // lista się nie wydłuża (np. nie ma już wolnego budynku mieszkalnego): bez ponownego startu w kółko
        this.porzucone = true;
        this.o.say(
          L(
            'Wolnej klatki w okolicy już nie ma. Gra toczy się dalej bez zajmowania.',
            'There are no free stairwells left nearby. The game carries on without claiming one.',
          ),
          9000,
        );
        return;
      }
      this.restartuje = true;
      try {
        const p: Ponownie = { data: this.dane as Loaded, stan: { ...stan, zajete, dom: false }, tryb: this.o.tryb?.() };
        this.sesja()?.setItem(PONOWNY_START, JSON.stringify(p));
      } catch {
        // bez pamięci sesji gracz zacznie od nowa sam
      }
      this.o.say(
        L(
          'Inna drużyna zajęła tę klatkę przed wami. Szukamy następnej wolnej…',
          'Another team took this stairwell before you did. Looking for the next free one…',
        ),
        6000,
      );
      setTimeout(() => (this.o.przeladuj ?? (() => location.reload()))(), 2500);
      return;
    }
    const kom = komunikatBledu(r);
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      // za daleko, limit, zła pozycja albo brak sesji: ponowienie nic nie zmieni
      this.porzucone = true;
      this.o.say(
        L(
          `${kom} Gra toczy się dalej bez zajmowania klatki.`,
          `${kom} The game carries on without claiming the stairwell.`,
        ),
        9000,
      );
      return;
    }
    // sieć, przeciążony serwer: spróbujemy za pół minuty
    this.sprawdzono = performance.now() + 30_000;
    this.o.say(
      L(`${kom} Klatkę zajmiemy, kiedy serwer odpowie.`, `${kom} We’ll claim the stairwell once the server answers.`),
      6000,
    );
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
      label: obca
        ? L('Klatka zajęta przez inną drużynę', 'Stairwell taken by another team')
        : dom
          ? L('Zajmij klatkę (wasz nowy dom)', 'Claim stairwell (your new home)')
          : L('Zajmij klatkę', 'Claim stairwell'),
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
      this.o.say(L('Tę klatkę zajęła już inna drużyna.', 'Another team has already taken this stairwell.'), 3000);
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
        L(
          'Klatka zajęta: inne drużyny widzą ją jako waszą. Przeprowadzka do niej przyjdzie w grze później.',
          'Stairwell claimed: other teams see it as yours. Moving in will come in a later version.',
        ),
        7000,
      );
    } else if (r.blad === 'zajeta') {
      this.o.say(L('Tę klatkę zajęła już inna drużyna.', 'Another team has already taken this stairwell.'), 4000);
      void this.odswiez(gen);
    } else this.o.say(komunikatBledu(r), 5000);
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
        this.o.say(
          L(
            'Na innym urządzeniu jest nowszy zapis tej gry. Ten zostaje tylko w tej przeglądarce.',
            'Another device has a newer save of this game. This one stays in this browser only.',
          ),
          9000,
        );
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
