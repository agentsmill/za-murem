/* Lista „moich ludzi”: pasek chipów pod górnym paskiem gry, w duchu paska kolonistów z RimWorlda. Jeden chip to osoba
   z zarządu albo drużyny (pionki `core`, także te na wyprawie): portret z tej samej klatki sprite'a, którą rysuje mapa
   (src/ui/portrety.ts), imię i znaczniki stanu na pierwszy rzut oka: ugryzienie, rana, głód, zimno, wyprawa, warta, praca
   przy stole badań i sen. Ramka portretu mówi, czy ktoś jest w kłopocie (żółta: potrzeba poniżej progu, czerwona: poniżej 25
   albo ugryzienie).

   Kontrakt. Lista nie ma własnego stanu gry: czyta zaznaczenie i osoby, które daje main.ts, a zmienia tylko zaznaczenie
   (`wybierz`, tym samym zbiorem co kliknięcie pionka na mapie, więc karta osoby i pierwszy krok samouczka działają bez
   zmian) i kamerę widoku. Polecenia dla ludzi idą dalej przez `sim.push`, tak jak dotąd; stan symulacji i skróty botów
   zostają.

   Obsługa:
   - klik w chip zaznacza osobę (jak klik w pionka na mapie) i wiezie do niej kamerę, bez zmiany przybliżenia;
   - drugie kliknięcie w tę samą, jedyną zaznaczoną osobę (czyli także dwuklik) włącza śledzenie: kamera idzie za nią, dopóki
     gracz nie kliknie jeszcze raz, nie ruszy kamery (przeciąganie, WASD, kółko) ani nie zaznaczy kogoś na mapie;
   - Shift+klik dokłada osobę do zaznaczenia albo ją zdejmuje, bez ruchu kamery;
   - klawisze E i Q (main.ts) przełączają na następną i poprzednią osobę, z zawijaniem, z pominięciem ludzi na wyprawie;
   - osoby na wyprawie (nie ma ich na mapie) dają się zaznaczyć, żeby zobaczyć kartę, ale kamera do nich nie jedzie.
   Kamera jedzie krokiem z kameraListy.ts, wołanym przez `krok` z pętli gry co klatkę.

   Tekst: nazwa grupy, podpowiedzi i opisy znaczników w bieżącym języku (`L`), przerysowane po zmianie języka. Obrazy
   znaczników są w listaIkony.ts, wygląd w lista.css. Czyste funkcje (znaczniki, kolejność, przełączanie, teksty) są w
   pierwszej części pliku i mają testy w Node; część z DOM sprawdzają scenariusze lista-* w `npm run shots`. */

import { L, poZmianieJezyka } from '../core/jezyk.ts';
import { TICKS_PER_HOUR } from '../sim/clock.ts';
import { COLD, HUNGRY } from '../sim/needs.ts';
import type { SimPerson } from '../sim/snapshot.ts';
import './lista.css';
import { KameraZaOsoba, type WejscieKamery } from './kameraListy.ts';
import { needLevel } from './karta.ts';
import { ikona } from './listaIkony.ts';

/** znaczniki stanu w stałej kolejności: najpierw to, co grozi śmiercią, potem potrzeby, na końcu zajęcie */
export const KOLEJNOSC_ZNACZNIKOW = [
  'ugryzienie',
  'rana',
  'glod',
  'zimno',
  'wyprawa',
  'warta',
  'badania',
  'sen',
] as const;
export type RodzajZnacznika = (typeof KOLEJNOSC_ZNACZNIKOW)[number];

export interface Znacznik {
  rodzaj: RodzajZnacznika;
  /** bad i mid to alarmy (czerwony i żółty, jak paski potrzeb na karcie), info to zwykłe zajęcie */
  poziom: 'bad' | 'mid' | 'info';
  /** ugryzienie: godziny do śmierci; głód, zimno i rana: wartość potrzeby (zaokrąglona jak na karcie) */
  wartosc?: number;
}

/** to, czego lista potrzebuje z osoby (SimPerson pasuje bez zmian) */
export type OsobaListy = Pick<
  SimPerson,
  'pawn' | 'name' | 'first' | 'f' | 'needs' | 'bite' | 'asleep' | 'away' | 'job' | 'doing'
>;

/** zdrowie poniżej tego to „rana”: na karcie pasek zdrowia robi się wtedy żółty */
const ZDROWIE_NISKIE = 50;

/**
 * Znaczniki stanu osoby. Progi głodu i zimna to te, przy których zarząd sam idzie jeść i grzać się (`HUNGRY`, `COLD` z
 * src/sim/needs.ts), więc znacznik znaczy „ta osoba zaraz wyjdzie z pracy”; kolor jak na karcie (poniżej 25 czerwony).
 * Wartości liczą się zaokrąglone, tak jak je pokazuje karta.
 */
export function znaczniki(p: OsobaListy): Znacznik[] {
  const out: Znacznik[] = [];
  if (p.bite)
    out.push({
      rodzaj: 'ugryzienie',
      poziom: 'bad',
      wartosc: Math.max(0, Math.ceil(p.bite.left / TICKS_PER_HOUR)),
    });
  const potrzeba = (rodzaj: 'rana' | 'glod' | 'zimno', wartosc: number, prog: number) => {
    const v = Math.round(wartosc);
    if (v < prog) out.push({ rodzaj, poziom: needLevel(v) === 'bad' ? 'bad' : 'mid', wartosc: v });
  };
  potrzeba('rana', p.needs.health, ZDROWIE_NISKIE);
  potrzeba('glod', p.needs.food, HUNGRY);
  potrzeba('zimno', p.needs.warm, COLD);
  if (p.away) out.push({ rodzaj: 'wyprawa', poziom: 'info' });
  if (p.job === 'guard') out.push({ rodzaj: 'warta', poziom: 'info' });
  if (p.job === 'research') out.push({ rodzaj: 'badania', poziom: 'info' });
  if (p.asleep) out.push({ rodzaj: 'sen', poziom: 'info' });
  return out;
}

/** ramka portretu: najgorszy alarm ze znaczników (samo zajęcie jej nie zmienia) */
export function poziomOsoby(z: readonly Znacznik[]): 'ok' | 'mid' | 'bad' {
  if (z.some((x) => x.poziom === 'bad')) return 'bad';
  return z.some((x) => x.poziom === 'mid') ? 'mid' : 'ok';
}

/** stała kolejność na liście: po numerze pionka, czyli w tej, w jakiej osoby weszły do zarządu; nie zależy od stanu osób,
    żeby chipy nie skakały pod kursorem */
export function kolejnosc<T extends { pawn: number }>(ludzie: readonly T[]): T[] {
  return [...ludzie].sort((a, b) => a.pawn - b.pawn);
}

/**
 * Kogo zaznaczyć klawiszem „następna” (krok 1) albo „poprzednia” (−1) osoba. Liczy od ostatniej zaznaczonej (dalej) albo
 * pierwszej (wstecz), zawija na końcach i pomija ludzi na wyprawie, bo kamera nie ma do nich dojechać; gdy wszyscy są poza
 * mapą, przełącza po wszystkich. Zaznaczenie spoza listy (mieszkaniec) to brak zaznaczenia. null przy pustej liście.
 */
export function nastepnaOsoba(
  ludzie: readonly { pawn: number; away: boolean }[],
  zaznaczeni: ReadonlySet<number>,
  krok: 1 | -1,
): number | null {
  const n = ludzie.length;
  if (!n) return null;
  const naMapie = ludzie.some((p) => !p.away);
  const mozna = (p: { away: boolean }) => !naMapie || !p.away;
  const wybrane = ludzie.flatMap((p, i) => (zaznaczeni.has(p.pawn) ? [i] : []));
  if (!wybrane.length) {
    const ciag = krok > 0 ? ludzie : [...ludzie].reverse();
    return (ciag.find(mozna) ?? ciag[0]).pawn;
  }
  const kotwica = krok > 0 ? wybrane[wybrane.length - 1] : wybrane[0];
  for (let d = 1; d <= n; d++) {
    const p = ludzie[(((kotwica + krok * d) % n) + n) % n];
    if (mozna(p)) return p.pawn;
  }
  return ludzie[kotwica].pawn;
}

/** opis znacznika do podpowiedzi i czytników ekranu, w bieżącym języku; `f`: kobieta (polskie końcówki, angielskie zaimki) */
export function tekstZnacznika(z: Znacznik, f: boolean): string {
  const v = z.wartosc ?? 0;
  switch (z.rodzaj) {
    case 'ugryzienie':
      return L(
        `${f ? 'Ugryziona' : 'Ugryziony'}: gorączka zabije za ${v} h`,
        `Bitten: the fever will kill ${f ? 'her' : 'him'} in ${v} h`,
      );
    case 'rana':
      return L(`Słabe zdrowie: ${v}`, `Poor health: ${v}`);
    case 'glod':
      return L(`${f ? 'Głodna' : 'Głodny'} (najedzenie ${v})`, `Hungry (Fed ${v})`);
    case 'zimno':
      return L(`${f ? 'Zmarznięta' : 'Zmarznięty'} (ciepło ${v})`, `Cold (Warmth ${v})`);
    case 'wyprawa':
      return L('Na wyprawie', 'Out on a supply run');
    case 'warta':
      return L('Na warcie', 'On watch');
    case 'badania':
      return L('Bada przy stole', 'Researching at the table');
    case 'sen':
      return L('Śpi', 'Asleep');
  }
}

/** imię do chipa: pole `first`, a gdy puste, pierwsze słowo nazwy */
export const krotkaNazwa = (p: Pick<SimPerson, 'first' | 'name'>): string =>
  p.first.trim() || p.name.trim().split(/\s+/)[0] || p.name;

/** jeden chip listy: to, co rysuje DOM */
export interface WierszListy {
  pawn: number;
  imie: string;
  znaczniki: Znacznik[];
  /** ramka portretu */
  poziom: 'ok' | 'mid' | 'bad';
  wybrany: boolean;
  /** kamera idzie za tą osobą (tylko zaznaczona może być śledzona) */
  sledzi: boolean;
  /** na wyprawie: nie ma jej na mapie, więc kamera do niej nie jedzie */
  poza: boolean;
  /** pełna nazwa i opisy znaczników: podpowiedź i opis dla czytników ekranu */
  tytul: string;
  /** co osoba robi (jak na karcie); pusty u osoby na wyprawie, bo jej nie ma na mapie */
  czynnosc: string;
}

/** wiersze listy w stałej kolejności; `sledzony`: pionek, za którym idzie kamera (null: nikt) */
export function wiersze(
  ludzie: readonly (OsobaListy & Pick<SimPerson, 'name'>)[],
  wybrani: ReadonlySet<number>,
  sledzony: number | null,
): WierszListy[] {
  return kolejnosc(ludzie).map((p) => {
    const z = znaczniki(p);
    const wybrany = wybrani.has(p.pawn);
    return {
      pawn: p.pawn,
      imie: krotkaNazwa(p),
      znaczniki: z,
      poziom: poziomOsoby(z),
      wybrany,
      sledzi: wybrany && sledzony === p.pawn,
      poza: p.away,
      tytul: [p.name, ...z.map((x) => tekstZnacznika(x, p.f))].join(', '),
      czynnosc: p.away ? '' : p.doing,
    };
  });
}

// ---------------------------------------------------------------- DOM (tylko przeglądarka)

export interface OpcjeListy extends WejscieKamery {
  /** pojemnik z index.html (`#lista`) */
  el: HTMLElement;
  /** zaznaczenie gry: ten sam zbiór, który zmienia kliknięcie pionka na mapie; lista go tylko czyta */
  wybrani: ReadonlySet<number>;
  /** zaznacza jak kliknięcie pionka na mapie: bez `dodaj` tylko tę osobę, z `dodaj` dokłada ją albo zdejmuje */
  wybierz: (pawn: number, dodaj: boolean) => void;
  /** adres obrazu portretu osoby (`data:`) albo pusty napis */
  portret: (pawn: number) => string;
  /** element, pod który lista schodzi, gdy jest widoczny (komunikat o przybyszach stoi w tym samym miejscu) */
  ponizej?: () => HTMLElement | null;
}

/** elementy jednego chipa i podpis jego ostatniego rysunku (bez zmiany podpisu DOM się nie rusza, więc klik nigdy nie
    trafia w element wymieniony między wciśnięciem a puszczeniem przycisku) */
interface Chip {
  /** pozycja listy (`<li>`) z przyciskiem w środku */
  li: HTMLLIElement;
  el: HTMLButtonElement;
  img: HTMLImageElement;
  mk: HTMLElement;
  nm: HTMLElement;
  podpis: string;
  znaczniki: string;
}

export class ListaLudzi {
  private readonly o: OpcjeListy;
  private readonly chipy = new Map<number, Chip>();
  private ludzie: readonly SimPerson[] = [];
  /** lot kamery do osoby i śledzenie jej (czysta logika w kameraListy.ts) */
  private readonly kam: KameraZaOsoba;
  private odsuniecie = '';
  /** prostokąt zajęty przez chipy (współrzędne okna) albo null, gdy listy nie widać: znacznik suchego drzewa idzie pod nią */
  obrys: { left: number; right: number; bottom: number } | null = null;

  constructor(opcje: OpcjeListy) {
    this.o = opcje;
    this.kam = new KameraZaOsoba(opcje);
    opcje.el.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.lp');
      if (!chip) return;
      // myszą i dotykiem przycisk oddaje fokus, żeby spacja dalej zatrzymywała grę (jak przy kafelku „Piętro”)
      if (e.detail > 0) chip.blur();
      this.kliknieto(Number(chip.dataset.pawn), e.shiftKey);
    });
    // jak w menu i panelu budowy: prawy przycisk nad listą nie otwiera menu przeglądarki
    opcje.el.addEventListener('contextmenu', (e) => e.preventDefault());
    poZmianieJezyka(() => this.przerysuj());
  }

  /** nowa gra: pusta lista, bez śledzenia */
  reset(): void {
    for (const c of this.chipy.values()) c.li.remove();
    this.chipy.clear();
    this.ludzie = [];
    this.kam.zatrzymaj();
    this.o.el.hidden = true;
  }

  /** Odświeża chipy z osób zarządu (co 200 ms z `hud`). Chip tworzy się raz na osobę i dalej zmienia się w miejscu, tylko
      gdy coś się zmieniło. */
  odswiez(ludzie: readonly SimPerson[]): void {
    this.ludzie = ludzie;
    const el = this.o.el;
    el.hidden = ludzie.length === 0;
    const grupa = L('Wasi ludzie', 'Your people');
    if (el.getAttribute('aria-label') !== grupa) el.setAttribute('aria-label', grupa);
    // pod komunikatem o przybyszach, gdy stoi w tym samym miejscu
    const nad = this.o.ponizej?.();
    const odsuniecie = nad ? `${Math.round(nad.getBoundingClientRect().height) + 8}px` : '0px';
    if (odsuniecie !== this.odsuniecie) {
      this.odsuniecie = odsuniecie;
      el.style.setProperty('--lista-dy', odsuniecie);
    }
    // śledzenie ma sens tylko przy jednej zaznaczonej osobie: zaznaczenie kogoś na mapie albo Esc je kończy
    const { cel, sledzi } = this.kam;
    if (sledzi && !(this.o.wybrani.size === 1 && cel !== null && this.o.wybrani.has(cel))) this.kam.zatrzymaj();
    const w = wiersze(ludzie, this.o.wybrani, this.kam.sledzi ? this.kam.cel : null);
    const sa = new Set(w.map((x) => x.pawn));
    for (const [id, c] of this.chipy)
      if (!sa.has(id)) {
        c.li.remove();
        this.chipy.delete(id);
      }
    w.forEach((x, i) => {
      const c = this.chipy.get(x.pawn) ?? this.nowyChip(x.pawn);
      if (el.children[i] !== c.li) el.insertBefore(c.li, el.children[i] ?? null);
      this.rysuj(c, x);
    });
    this.obrys = this.zmierzObrys();
  }

  /** obrys wszystkich chipów w oknie (jedno odczytanie układu na odświeżenie, nie na klatkę) */
  private zmierzObrys(): { left: number; right: number; bottom: number } | null {
    if (this.o.el.hidden || !this.chipy.size) return null;
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const c of this.chipy.values()) {
      const r = c.el.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return { left, right, bottom };
  }

  /** Krok kamery, co klatkę z pętli gry (po ruchu kamery klawiaturą i przycięciu jej do mapy): jedzie do osoby, do której
      kliknięto, a przy śledzeniu trzyma się jej; szczegóły w `KameraZaOsoba`. */
  krok(dtMs: number): void {
    this.kam.krok(dtMs);
  }

  /** klawisz „następna” (1) albo „poprzednia” (−1) osoba: zaznacza ją i wiezie do niej kamerę */
  przelacz(krok: 1 | -1): void {
    const id = nastepnaOsoba(kolejnosc(this.ludzie), this.o.wybrani, krok);
    if (id !== null) this.wybierzIJedz(id);
  }

  /** kliknięcie w chip: zaznaczenie i lot, drugie w tę samą osobę przełącza śledzenie, Shift dokłada do zaznaczenia */
  private kliknieto(pawn: number, shift: boolean): void {
    if (shift) this.o.wybierz(pawn, true);
    else if (this.o.wybrani.size === 1 && this.o.wybrani.has(pawn)) {
      // druga strona tego samego kliknięcia: osoba jest już zaznaczona, więc kamera ma przy niej zostać albo ją puścić
      if (!this.o.pozycja(pawn)) return;
      if (this.kam.sledzi) this.kam.zatrzymaj();
      else this.kam.jedz(pawn, true);
    } else this.wybierzIJedz(pawn);
    // chip od razu pokazuje nowe zaznaczenie, bez czekania na następne odświeżenie z `hud`
    this.odswiez(this.ludzie);
  }

  private wybierzIJedz(pawn: number): void {
    this.o.wybierz(pawn, false);
    // tryb śledzenia przechodzi na nową osobę (kto ogląda ludzi po kolei, dalej ogląda ich z bliska)
    this.kam.jedz(pawn, this.kam.sledzi);
    this.odswiez(this.ludzie);
  }

  /** wszystko od nowa po zmianie języka (podpisy chipów i nazwa grupy) */
  private przerysuj(): void {
    for (const c of this.chipy.values()) c.podpis = '';
    this.odswiez(this.ludzie);
  }

  private nowyChip(pawn: number): Chip {
    const li = document.createElement('li');
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lp';
    el.dataset.pawn = String(pawn);
    el.innerHTML =
      '<span class="lp-ik"><img class="lp-img" alt="" draggable="false" width="20" height="20"></span>' +
      '<span class="lp-mk"></span><span class="lp-nm"></span>' +
      `<i class="lp-sl" aria-hidden="true">${ikona('sledzi')}</i>`;
    li.appendChild(el);
    const c: Chip = {
      li,
      el,
      img: el.querySelector<HTMLImageElement>('.lp-img')!,
      mk: el.querySelector<HTMLElement>('.lp-mk')!,
      nm: el.querySelector<HTMLElement>('.lp-nm')!,
      podpis: '',
      znaczniki: '',
    };
    this.chipy.set(pawn, c);
    this.o.el.appendChild(li);
    return c;
  }

  private rysuj(c: Chip, x: WierszListy): void {
    const portret = this.o.portret(x.pawn);
    const podpis = [x.imie, x.poziom, x.wybrany, x.sledzi, x.poza, x.tytul, x.czynnosc, portret].join('|');
    if (podpis === c.podpis) return;
    c.podpis = podpis;
    const el = c.el;
    el.dataset.ton = x.poziom;
    el.setAttribute('aria-pressed', String(x.wybrany));
    el.toggleAttribute('data-sledzi', x.sledzi);
    el.toggleAttribute('data-poza', x.poza);
    el.toggleAttribute(
      'data-spi',
      x.znaczniki.some((z) => z.rodzaj === 'sen'),
    );
    el.setAttribute('aria-label', x.tytul);
    el.title = [x.tytul, x.czynnosc, this.podpowiedz(x)].filter(Boolean).join('\n');
    c.nm.textContent = x.imie;
    if (c.img.getAttribute('src') !== portret) {
      if (portret) c.img.src = portret;
      else c.img.removeAttribute('src');
    }
    const mk = x.znaczniki.map((z) => this.znacznik(z)).join('');
    if (mk !== c.znaczniki) {
      c.znaczniki = mk;
      c.mk.innerHTML = mk;
    }
  }

  /** jeden znacznik: ikona, a przy ugryzieniu jeszcze godziny do śmierci */
  private znacznik(z: Znacznik): string {
    const godz = z.rodzaj === 'ugryzienie' ? `<b>${z.wartosc ?? 0}h</b>` : '';
    return `<i class="mk mk-${z.rodzaj} mk-${z.poziom}" aria-hidden="true">${ikona(z.rodzaj)}${godz}</i>`;
  }

  /** druga linijka podpowiedzi chipa: co da kliknięcie */
  private podpowiedz(x: WierszListy): string {
    if (x.poza) return L('Zaznacz, żeby zobaczyć kartę osoby.', 'Select to see their card.');
    if (x.sledzi)
      return L(
        'Kamera idzie za tą osobą. Kliknij, żeby przestać.',
        'The camera is following this person. Click to stop.',
      );
    if (x.wybrany && this.o.wybrani.size === 1)
      return L(
        'Kliknij jeszcze raz, żeby kamera szła za tą osobą.',
        'Click again to make the camera follow this person.',
      );
    return L(
      'Zaznacz i pokaż na mapie. Klawisze Q i E: poprzednia i następna osoba.',
      'Select and show on the map. Keys Q and E: previous and next person.',
    );
  }
}
