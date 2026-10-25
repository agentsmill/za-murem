/* Gracz bota ścieżki celów (tools/bot-cele.ts): co robi człowiek, który czyta bieżący cel i jego podpowiedź. Cele okazji
   idą przed celami rozdziału, tak jak w okienku celów. Każde polecenie przechodzi tą drogą, którą przejdzie w grze: z menu
   (`commandsAt`, ten sam napis, który podpowiedź ujmuje w cudzysłów), z przycisku (broń, amputacja, „Do broni!”), jako
   zdarzenie interfejsu (lista ludzi, karta mieszkańca, ekran dróg) albo jako odpowiedź w oknie zarządu (karta nocy,
   uchwała, wydarzenie). Gracz niczego nie dodaje do stanu gry: nie ma tu darów, `fx.join` ani materiału z powietrza.

   Poza celami robi tylko to, co każdy gracz: dba o drewno (bez niego koza gaśnie) i zbiera materiały (przeszukiwanie,
   rozbiórka, naprawy), a budowle stawia tylko te, o które prosi bieżący cel. W trybie zombie drewno bierze z mebli,
   z drzew w obrębie siatki i z wypraw, nigdy zza siatki. Decyzje zapadają raz na sekundę przy ekranie, a to samo
   polecenie wraca najwcześniej po kilkunastu sekundach, żeby nie dublować pracy, która jeszcze trwa. */

import { powodOdmowy, wyslijWyprawe } from '../src/gov/dzienne.ts';
import type { Words, WordsEn } from '../src/gov/miejsce.ts';
import { KOZA_KEY } from '../src/gov/noc.ts';
import type { GovInput, GovState, NightCard, Prompt } from '../src/gov/typy.ts';
import { setNight } from '../src/gov/zarzad.ts';
import { kartka, TECH_BY, TECHS, tempoOsoby, wolneMiejsca } from '../src/sim/badania.ts';
import type { WeaponId } from '../src/sim/bron.ts';
import { BUILDS, type BuildKind, type Mat } from '../src/sim/budowle.ts';
import { hourOf, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { applyGov, govInput } from '../src/sim/gov.ts';
import { houseOf } from '../src/sim/house.ts';
import { DISMANTLE } from '../src/sim/mieszkania.ts';
import { commandFor, commandsAt, type MenuItem } from '../src/sim/orders.ts';
import { RODZAJE } from '../src/sim/praca.ts';
import {
  drzwiBudynku,
  ludzieNaStart,
  mieszkalny,
  moznaPrzeszukac,
  stanDrzwi,
  type WyborSpotkania,
  wnetrze,
  wybory,
} from '../src/sim/sasiedzi.ts';
import {
  AMPUTATE_WINDOW,
  alarmOn,
  BURNABLE,
  CAMPFIRE_WOOD,
  type Command,
  campfireSpotOk,
  dismantlable,
  FEVER_TICKS,
  type Pawn,
  type Sim,
  type SimState,
  trunkOf,
} from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { CARRY_MATS, wrecksOf } from '../src/sim/surowce.ts';
import { modeOf } from '../src/sim/tryb.ts';
import { TUT_STEPS } from '../src/sim/tutorial.ts';
import { NIGHT_WOOD, najtanszeBudowle } from '../src/ui/cele.ts';
import { KROK_PROGU, nastepnyPriorytet } from '../src/ui/praca.ts';
import type { Cel, OdczytCelow, StanSciezki, WidokSciezki } from '../src/ui/sciezka.ts';
import { zdarzenieUi } from '../src/ui/sciezka.ts';
import { potrzebaDrewna } from '../src/ui/sciezka-rozdzialy.ts';
import type { Miejsce } from '../src/world/miasto.ts';
import { wspolnyPlot } from '../src/world/plot.ts';
import type { World } from '../src/world/world.ts';
import { m2Player } from '../tests/unit/m2-play.ts';
import { kategoriaBraku, najblizszeMiejsce } from '../tests/unit/miasto-play.ts';
import { budynkiDoOtoczenia } from '../tests/unit/sciezka-mapy.ts';

/** Jedna gra: symulacja, zarząd i stan ścieżki obok siebie (jak w main.ts) plus to, co gra dokłada do odczytu. */
export interface Gra {
  demo: string;
  nazwa: string;
  tryb: 'zwykly' | 'zombie';
  seed: number;
  w: World;
  sim: Sim;
  gov: GovState;
  sciezka: StanSciezki;
  okolica: Miejsce[];
  ludnosc2021: number | undefined;
  hqName: string;
  words: Words;
  wordsEn: WordsEn;
  /** ktoś z zarządu jest zaznaczony w interfejsie (bot zaznacza pierwszego w samouczku i nie odznacza) */
  zaznaczony: boolean;
}

/** wejście zarządu z tej chwili, jak `input()` w src/main.ts (okolica i ludność z 2021 roku); sekundy przy ekranie to
    tick / 20, bo bot gra w tempie 1× */
export function wejscie(g: Gra): GovInput {
  const i = govInput(g.sim.st, g.w, Math.floor(g.sim.st.tick / TICKS_PER_SECOND), g.hqName);
  i.okolica = g.okolica;
  if (g.ludnosc2021 !== undefined) i.ludnosc2021 = g.ludnosc2021;
  return i;
}

/** odczyt gry dla ścieżki z tej chwili, jak `odczytCelow` w src/main.ts; wejście zarządu liczy się dopiero na żądanie */
export function odczyt(g: Gra): OdczytCelow {
  const { st } = g.sim;
  let we: GovInput | undefined;
  return {
    st,
    w: g.w,
    snap: snapshot(st, g.w),
    gov: g.gov,
    get input() {
      we ??= wejscie(g);
      return we;
    },
    // czas przy ekranie: bot gra w tempie 1×, więc sekunda przy ekranie to 20 ticków
    ekran: st.tick / TICKS_PER_SECOND,
    touch: false,
    words: g.words,
    wordsEn: g.wordsEn,
    zaznaczony: g.zaznaczony,
    mapaMiasta: true,
  };
}

/* ---------------------------------------------------------------- pomocniki */

/** prace, od których nie odrywa się nikogo: sen, jedzenie, grzanie się, warta, walka, amputacja, spotkanie i drzwi sąsiada,
    marsz na wyprawę, dobijanie i siedzenie przy stole */
const TWARDE: ReadonlySet<string> = new Set([
  'sleep',
  'eat',
  'warm',
  'guard',
  'fight',
  'amputate',
  'meet',
  'door',
  'leave',
  'arrive',
  'raid',
  'finish',
  'research',
  'cook',
]);

/** zarząd na miejscu */
const rdzen = (st: SimState): Pawn[] => st.pawns.filter((p) => p.kind === 'core' && !p.away);

/** Kto może dostać polecenie: bezczynni, potem ci, którzy robią coś z automatu pracy; kto ma polecenie albo twardą pracę, nie.
    Ugryziony w gorączce się nie rusza. */
function wolniZarzadu(st: SimState): Pawn[] {
  return rdzen(st)
    .filter((p) => p.bite === undefined && (!p.job || (!p.job.order && !TWARDE.has(p.job.t))))
    .sort((a, b) => Number(!!a.job) - Number(!!b.job) || a.id - b.id);
}

/** kafelek pnia drzewa k */
const pien = (w: World, k: number): number => trunkOf(w, w.trees[k]);

/** ile drewna (sztuk) leży w składzie, luzem i w rękach, bez tego w ogniu: tak liczy zapas okienko celów */
const zapasDrewna = (o: OdczytCelow): number =>
  o.snap.stock.woodSklad + o.snap.stock.woodLoose + o.snap.stock.woodCarried;

/** Kontekst jednej sekundy: odczyt, widok ścieżki, godzina i lista wolnych z zarządu (handler zabiera osoby z listy). */
interface Ctx {
  g: Gra;
  o: OdczytCelow;
  v: WidokSciezki;
  /** sekunda przy ekranie */
  s: number;
  h: number;
  wolni: Pawn[];
}

export interface Gracz {
  /** samouczek: zaznaczyć kogoś i ściąć suche drzewo */
  start(): void;
  /** decyzje na tę sekundę po kroku ścieżki i odpowiedziach na okna */
  krok(v: WidokSciezki): void;
  /** niezgodności napisu menu z podpowiedzią, które gracz napotkał (każda raz); puste, gdy podpowiedzi zgadzają się z menu */
  niezgodnosci(): string[];
  /** ile razy gracz rozmawiał z wędrowcem przy siatce, pytał go o rękę (zombie) i zapraszał (polecenia z menu, od początku gry) */
  werbunek(): { rozmowy: number; rece: number; zaproszenia: number };
  /** odpowiedź na okno zarządu (skutki zastosuje wołający) */
  karta(card: NightCard, v: WidokSciezki): void;
  uchwala(p: Extract<Prompt, { k: 'uchwala' }>): string | null;
  wydarzenie(p: Extract<Prompt, { k: 'wydarzenie' }>, v: WidokSciezki): number;
}

/** Wybór karty zdarzenia, który wpuszcza ludzi albo zwierzę („Przyjąć do spółdzielni”, „Wciągnąć do roboty”, „Przygarnąć”);
    gracz bierze go, gdy cel każe zebrać ludzi, a analiza R4 (`karty` w bot-cele.ts) liczy po nim karty, które o to proszą. */
export const WPUSZCZA = /^(Przyj|Wciągn|Przygarn)/;

/** pełny klucz celu: „rozdział.cel” albo „okazja.cel” */
const pelny = (prefiks: string, c: Pick<Cel, 'key'>): string => `${prefiks}.${c.key}`;

/** Cele, którymi gracz się zajmuje w tej sekundzie. Domyślnie to, co widzi człowiek: bieżący cel okazji i bieżący cel
    rozdziału (jego podpowiedź jest na ekranie) oraz cele czekające, które da się przygotować przed czasem (karta nocy
    z dwiema dzidami). Z `rownolegle` wszystkie niezrobione cele okazji i rozdziału, jakby gracz robił kilka rzeczy naraz
    (cel dalej na liście nie ma jeszcze podpowiedzi, ale jego tekst mówi, o co chodzi). Pełne klucze, okazja pierwsza. */
function celeGracza(g: Gra, v: WidokSciezki, przygotuj: ReadonlySet<string>, rownolegle: boolean): string[] {
  const out: string[] = [];
  const blok = (k: string, b: { cele: Cel[]; biezacy: Cel | null } | null) => {
    if (!b) return;
    if (rownolegle) {
      for (const c of b.cele) if (!c.done && (!c.czeka || przygotuj.has(pelny(k, c)))) out.push(pelny(k, c));
      return;
    }
    if (b.biezacy) out.push(pelny(k, b.biezacy));
    for (const c of b.cele) if (!c.done && c.czeka && przygotuj.has(pelny(k, c))) out.push(pelny(k, c));
  };
  if (g.sciezka.okazja) blok(g.sciezka.okazja.k, v.okazja);
  if (v.rozdzial) blok(v.rozdzial.k, v.rozdzial);
  return out;
}

/** prace w siedzibie, które w trybie zombie nie mogą wyprowadzać na ulicę */
const W_SIEDZIBIE: ReadonlySet<string> = new Set(['burn', 'search', 'dismantle', 'repair', 'claim', 'build', 'craft']);

export function nowyGracz(
  g: Gra,
  gadaj: (tekst: string) => void,
  rownolegle = false,
  /** gracz robi też cele werbunku w okazji wędrowca (O1.2 „Zapytać o rękę”, O1.3 „Zaprosić do nas”), czyli zaprasza pierwszego
      wędrowca już drugiego dnia; domyślnie nie, bo to zmienia przebieg gry przed R4 (jedna osoba więcej, inne losowanie
      dalszych wizyt i kart) i czasy celu „Przyjmijcie kogoś nowego” w trybie zwykłym */
  werbunekOkazji = false,
): Gracz {
  const { sim, w } = g;
  const st = sim.st;
  const size = w.size;
  const hs = houseOf(w);
  /** budowle, o które prosi bieżący cel: tę listę czyta gospodarz (m2) przy każdej decyzji */
  let kolejka: BuildKind[] = [];
  const gospodarz = m2Player({ search: true, furniture: true, kolejka: () => kolejka });
  /** sekunda ostatniej próby danego polecenia (klucz → sekunda) */
  const proby = new Map<string, number>();
  /** drzewa i meble, do których nikt nie doszedł */
  const zle = new Set<string>();
  /** ostatnie polecenie ścięcia: drzewo i sekunda */
  let rabane: { k: number; s: number } | null = null;

  const polecenie = (c: Command, opis: string): void => {
    sim.push(c);
    gadaj(opis);
  };
  /** czy minęło co najmniej `n` sekund od ostatniej próby `klucz`; zapisuje próbę */
  const mozna = (klucz: string, s: number, n: number): boolean => {
    const bylo = proby.get(klucz);
    if (bylo !== undefined && s - bylo < n) return false;
    proby.set(klucz, s);
    return true;
  };
  /** napisy menu, które nie zgadzają się z podpowiedzią (podpowiedź ujmuje napis w cudzysłów, gracz szuka go w menu); każda
      niezgodność raz, niezależnie od `gadaj`: runner liczy je w każdym przebiegu i kończy kodem 1, gdy jakaś jest */
  const niezgodnosci = new Set<string>();
  const niezgodnosc = (pref: string, label: string): void => {
    const tekst = `podpowiedź mówi „${pref}”, a menu „${label}”`;
    if (!niezgodnosci.has(tekst)) {
      niezgodnosci.add(tekst);
      gadaj(`UWAGA menu: ${tekst}`);
    }
  };
  /** pozycja menu danego rodzaju na kafelku dla osoby (to, co zobaczy gracz po prawym przycisku) */
  const zMenu = (id: number, tile: number, t: Command['t'], pref?: string): MenuItem | undefined => {
    const m = commandsAt(st, w, [id], tile).find((x) => x.cmd.t === t && !x.off);
    if (m && pref && !m.label.startsWith(pref)) niezgodnosc(pref, m.label);
    return m;
  };

  /* ------------------------------------------------------------ drewno */

  /** drzewa w obrębie siatki (pień na podwórku albo tuż przy nim), nieścięte i nie krzaki; suche drzewo z samouczka tylko
      po jego kroku „ściąć” */
  const drzewaWObwodzie = (): number[] => {
    const yard = new Set(w.fence.yard);
    const samouczek = st.tut.step >= 0 && st.tut.step < TUT_STEPS.length;
    return w.trees.flatMap((tree, k) => {
      if (tree.kind === 2 || st.felled.includes(k) || (samouczek && k === w.dryTree)) return [];
      const t = pien(w, k);
      const x = t % size;
      const przy =
        yard.has(t) ||
        yard.has(t - size) ||
        yard.has(t + size) ||
        (x > 0 && yard.has(t - 1)) ||
        (x < size - 1 && yard.has(t + 1));
      return przy ? [k] : [];
    });
  };
  const drzwiHq = w.buildings[w.hq]?.entrances[0]?.out ?? 0;
  const odDrzwi = (k: number): number => {
    const t = pien(w, k);
    return Math.hypot((t % size) - (drzwiHq % size), Math.floor(t / size) - Math.floor(drzwiHq / size));
  };

  /** Najbliższe drzwiom siedziby drzewo do ścięcia: w zwykłym trybie dowolne, w zombie tylko w obrębie siatki. */
  const drzewoDoScicia = (): number => {
    const lista =
      g.tryb === 'zombie'
        ? drzewaWObwodzie()
        : w.trees.flatMap((t, k) => (t.kind === 2 || st.felled.includes(k) ? [] : [k]));
    const dobre = lista.filter((k) => !zle.has(`drzewo:${k}`));
    dobre.sort((a, b) => odDrzwi(a) - odDrzwi(b));
    return dobre[0] ?? -1;
  };

  /** Mebel do spalenia: z pustych mieszkań albo z własnych (mieszkania lokatorów odpadają), najbliżej kozy, nie dalej niż 25 m
      od niej (siedziba bywa długim blokiem, a po meble z drugiego końca idzie się ulicą przez szwendaczy); dalej wybiera
      mniej cenny kawałek: łóżka na końcu. */
  const meblaDoSpalenia = (): { id: number; tile: number }[] => {
    if (!hs) return [];
    const koza = st.things.find((t) => t.kind === 'koza');
    const kx = koza ? koza.x : drzwiHq % size;
    const ky = koza ? koza.y : Math.floor(drzwiHq / size);
    const stan = (apt: number) => st.apts.find((a) => a.apt === apt);
    return st.things
      .filter((t) => BURNABLE[t.kind] && t.by < 0 && !zle.has(`mebel:${t.id}`))
      .flatMap((t) => {
        const tile = t.y * size + t.x;
        const r = hs.room[tile];
        const a = r >= 0 ? stan(hs.rooms[r].apt) : undefined;
        const daleko = Math.hypot(t.x - kx, t.y - ky);
        if (!a || a.state === 'mieszkancy' || daleko > 25) return [];
        const ranga =
          (a.ours ? 10 : 0) +
          (t.kind === 'lozko' || t.kind === 'wersalka' ? 5 : 0) +
          daleko / 10 -
          BURNABLE[t.kind] / 10;
        return [{ id: t.id, tile, ranga }];
      })
      .sort((x, y) => x.ranga - y.ranga)
      .map(({ id, tile }) => ({ id, tile }));
  };

  /** Kafelek wewnątrz: podwórko siatki albo wnętrze siedziby (pomieszczenia i drzwi). Poza nim jest ulica. */
  const podworkoSiatki = new Set(w.fence.yard);
  const kafleSiatki = new Set(w.fence.tiles);
  const wewnatrz = (tile: number): boolean =>
    podworkoSiatki.has(tile) || kafleSiatki.has(tile) || (!!hs && (hs.room[tile] >= 0 || hs.doors.includes(tile)));

  /** cel pracy w siedzibie dalej niż `promien` m od kozy (30): siedziba bywa długim blokiem, a jego dalsze klatki są otwarte
      na ulicę */
  const zaDaleko = (tile: number, promien = 30): boolean => {
    const koza = st.things.find((t) => t.kind === 'koza');
    const kx = koza ? koza.x : drzwiHq % size;
    const ky = koza ? koza.y : Math.floor(drzwiHq / size);
    return Math.hypot((tile % size) - kx, Math.floor(tile / size) - ky) > promien;
  };

  /** Czy droga osoby do celu wychodzi na ulicę (w trybie zombie człowiek przerywa taką pracę, zanim ktoś zginie). Czyta
      drogę, którą wyznaczyła symulacja po poleceniu. */
  const drogaNaZewnatrz = (p: Pawn): boolean => p.path.slice(p.pi).some((t) => !wewnatrz(t));

  /** Co zatrzymuje odcinek ulicą (albo do dalszej klatki), a gdy nic: `null`. Odcinek jest wolny: za dnia, osoba zdrowa
      i nieugryziona, cel nie dalej niż 60 m od kozy, a żaden szwendacz nie jest bliżej niż 10 kafelków (tyle, co reguła
      `szwendaczBlisko` w symulacji) od osoby ani od żadnego kafelka reszty jej drogi na ulicy. Tak ocenia człowiek, który po
      „Budować …” z menu planu albo „Spalić …” z menu mebla patrzy, czy po drodze ktoś stoi; bot sprawdza to co sekundę, więc
      szwendacz, który się pojawi, przerywa odcinek. */
  const przeszkodaNaUlicy = (p: Pawn): string | null => {
    const h = hourOf(st.tick);
    if (h < 7 || h >= 18) return 'poza dniem (7 do 18)';
    if ((p.needs?.health ?? 0) < 50) return 'słabe zdrowie';
    if (p.bite !== undefined) return 'ugryziony';
    if (p.job && zaDaleko(p.job.tile, 60)) return 'cel dalej niż 60 m od kozy';
    const szwendacze = st.pawns.filter((q) => q.kind === 'zombie' && !q.away);
    if (!szwendacze.length) return null;
    const punkty = [Math.floor(p.y) * size + Math.floor(p.x), ...p.path.slice(p.pi).filter((t) => !wewnatrz(t))];
    const blisko = (t: number): boolean => {
      const tx = t % size;
      const ty = Math.floor(t / size);
      return szwendacze.some((q) => Math.max(Math.abs(Math.floor(q.x) - tx), Math.abs(Math.floor(q.y) - ty)) < 10);
    };
    return punkty.some(blisko) ? 'szwendacz bliżej niż 10 kafelków' : null;
  };
  const ulicaWolna = (p: Pawn): boolean => przeszkodaNaUlicy(p) === null;

  /** Drewno do zapasu `cel` sztuk (skład, luzem, w rękach): jedno polecenie ścięcia albo spalenia naraz. W zombie najpierw
      drzewo w obrębie siatki, potem mebel. */
  const zdobadzDrewno = (c: Ctx, cel: number, opis: string, zOgniem = false): void => {
    // zapas na noc liczy się razem z drewnem w kozie (tak liczy karta nocy), zapas na wieczór bez niego
    const brak = cel - (zOgniem ? Math.floor(c.o.snap.stock.wood) : zapasDrewna(c.o));
    if (brak <= 0) return;
    const kto = c.wolni[0];
    if (!kto) return;
    // kto już rąbie albo pali na polecenie, ten robi swoje
    const robi = st.pawns.filter((p) => p.kind === 'core' && (p.job?.t === 'chop' || p.job?.t === 'burn'));
    if (robi.length >= (brak > 6 ? 2 : 1)) {
      // drzewo, do którego nikt nie doszedł, odpada
      if (rabane && c.s - rabane.s > 60 && !st.felled.includes(rabane.k) && !robi.some((p) => p.job?.t === 'chop')) {
        zle.add(`drzewo:${rabane.k}`);
        rabane = null;
      }
      return;
    }
    if (!mozna('drewno', c.s, 15)) return;
    const k = drzewoDoScicia();
    if (k >= 0) {
      const m = zMenu(kto.id, pien(w, k), 'chop', 'Ściąć drzewo');
      if (m) {
        c.wolni.shift();
        rabane = { k, s: c.s };
        polecenie(m.cmd, `${opis}: ściąć drzewo ${k}`);
        return;
      }
      zle.add(`drzewo:${k}`);
    }
    if (g.tryb === 'zombie' || k < 0) {
      const mebel = meblaDoSpalenia()[0];
      if (!mebel) return;
      const m = zMenu(kto.id, mebel.tile, 'burn', 'Spalić');
      if (!m) {
        zle.add(`mebel:${mebel.id}`);
        return;
      }
      c.wolni.shift();
      polecenie(m.cmd, `${opis}: ${m.label}`);
    }
  };

  /* ------------------------------------------------------------ broń i walka */

  /** kolejność broni na przycisku „Zmień” karty osoby (jak w src/main.ts) */
  const KOLEJNOSC_BRONI: readonly WeaponId[] = [
    'dzida',
    'rewolwer',
    'strzelba',
    'kusza',
    'siekiera',
    'lom',
    'kij',
    'noz',
  ];

  /** Broń, którą da kolejne kliknięcie „Zmień” osobie `p` (jak w main.ts): następna z magazynu w ustalonej kolejności albo
      pierwsza z listy. null: w magazynie nie ma nic innego. */
  const nastepnaBron = (p: Pawn): WeaponId | null => {
    const mam = new Set(st.store.arms ?? []);
    const lista = KOLEJNOSC_BRONI.filter((b) => mam.has(b) && b !== p.weapon);
    const od = p.weapon ? KOLEJNOSC_BRONI.indexOf(p.weapon) : -1;
    return lista.find((b) => KOLEJNOSC_BRONI.indexOf(b) > od) ?? lista[0] ?? null;
  };

  /** „Zrobić dzidę” na stercie desek albo złomu: tylko gdy starcza materiału (inaczej menu nie ma tej pozycji) */
  const zrobDzide = (c: Ctx): void => {
    const kto = c.wolni[0];
    const sterta = st.things.find((t) => t.kind === 'deski' || t.kind === 'zlom');
    if (!kto || !sterta || !mozna('dzida', c.s, 30)) return;
    const m = zMenu(kto.id, sterta.y * size + sterta.x, 'craft', 'Zrobić dzidę');
    if (!m) return;
    c.wolni.shift();
    polecenie(m.cmd, 'Zrobić dzidę');
  };

  /** zombie z zewnętrznej strony siatki, nie dalej niż 3 m od niej: cel dla dzidy */
  const zombieZaSiatka = (): Pawn[] => {
    const yard = new Set(w.fence.yard);
    const tiles = w.fence.tiles;
    return st.pawns.filter((q) => {
      if (q.kind !== 'zombie' || yard.has(Math.floor(q.y) * size + Math.floor(q.x))) return false;
      return tiles.some((t) => Math.hypot((t % size) + 0.5 - q.x, Math.floor(t / size) + 0.5 - q.y) <= 3);
    });
  };

  /* ------------------------------------------------------------ wyprawa */

  /** Wysyła dwie najzdrowsze osoby do najbliższego miejsca z okolicy (kategoria według braku, a bez braków sklep spożywczy),
      jak z okna mapy miasta: za dnia, jedna wyprawa naraz. true, gdy wyszły. */
  const wyslijWypraweZMapy = (c: Ctx, opis: string, tylkoBraki = false): boolean => {
    const i = wejscie(c.g);
    if (c.g.gov.wyprawy?.length || i.hour < 7 || i.hour >= 17 || (c.g.gov.night && !c.g.gov.night.confirmed))
      return false;
    const braki = kategoriaBraku(i);
    const kategorie = tylkoBraki
      ? braki === 'spozywczy' || braki === 'stacja'
        ? [braki]
        : []
      : [...new Set([...(braki ? [braki] : []), 'spozywczy', 'stacja', ...(i.okolica ?? []).map((m) => m.kat)])];
    if (!kategorie.length || !mozna(tylkoBraki ? 'wyprawa-zapas' : 'wyprawa', c.s, 20)) return false;
    for (const kat of kategorie) {
      const cel = najblizszeMiejsce(c.g.gov, i, kat);
      if (!cel) continue;
      const ids = i.people
        .filter((p) => !powodOdmowy(c.g.gov, i, cel, [p.id]))
        .sort((a, b) => b.needs.health - a.needs.health || (a.id < b.id ? -1 : 1))
        .slice(0, 2)
        .map((p) => p.id);
      if (ids.length < 2) continue;
      const wynik = wyslijWyprawe(c.g.gov, i, cel, ids);
      if (!wynik.ok) continue;
      applyGov(st, w, wynik.fx);
      gadaj(`${opis}: wyprawa do ${cel.nazwa.pl} (${Math.round(cel.odl)} m, ${kat}), ${ids.length} osoby`);
      return true;
    }
    return false;
  };

  /* ------------------------------------------------------------ badania */

  /** pracownia (stół badań), jeśli stoi */
  const pracownia = () => st.things.find((t) => t.kind === 'pracownia');

  /** zbadana jest już pierwsza technologia */
  const pierwszaTechnologia = (): boolean => Object.keys(st.research?.at ?? {}).length > 0;

  /** Wybór badania na tablicy: najtańsza kartka „do wzięcia” z danej ery (przy remisie pierwsza w drzewku), jak ją wybiera
      człowiek, który patrzy na koszty. Polecenie `research` przyjmuje się bez nikogo z zarządu. */
  const wybierzBadanie = (c: Ctx, era?: number): boolean => {
    const mode = modeOf(st);
    const karty = TECHS.filter((t) => era === undefined || t.era === era)
      .map((t) => kartka(st, t.id, mode))
      .filter((k) => k.stan === 'do_wziecia');
    const najtansza = karty.reduce<(typeof karty)[number] | undefined>(
      (b, k) => (b === undefined || k.koszt < b.koszt ? k : b),
      undefined,
    );
    if (!najtansza || !mozna('badanie', c.s, 20)) return false;
    polecenie({ t: 'research', ids: [], tech: najtansza.id }, `tablica badań: ${najtansza.id}`);
    return true;
  };

  /** Ktoś z zarządu przy stole pracowni, gdy badanie jest wybrane (za dnia, od 7:00 do 20:00): „Badać: …” z menu pracowni.
      Siada ten wolny, kto najszybciej bada w dziedzinie badania. */
  const posadzPrzyStole = (c: Ctx): void => {
    const lab = pracownia();
    const cur = st.research?.cur;
    if (!lab || !cur || !Object.hasOwn(TECH_BY, cur) || c.h < 7 || c.h >= 20) return;
    if (kartka(st, cur, modeOf(st)).stan !== 'w_toku') return;
    if (st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'research')) return;
    const dom = TECH_BY[cur].dom;
    const kto = c.wolni
      .filter((p) => wolneMiejsca(st.pawns, lab.id, [p.id]) > 0)
      .sort((a, b) => tempoOsoby(st.people[b.person], dom) - tempoOsoby(st.people[a.person], dom) || a.id - b.id)[0];
    if (!kto || !mozna('stol', c.s, 30)) return;
    const m = zMenu(kto.id, lab.y * size + lab.x, 'study', 'Badać');
    if (!m) return;
    c.wolni.splice(c.wolni.indexOf(kto), 1);
    polecenie(m.cmd, m.label);
  };

  /* ------------------------------------------------------------ sąsiedzi */

  /** czy wyjście za siatkę jest rozsądne: w zwykłym trybie zawsze, w zombie tylko za jasnego dnia i z kimś uzbrojonym i zdrowym */
  const zaSiatkaMozna = (c: Ctx): Pawn | undefined => {
    if (g.tryb !== 'zombie') return c.wolni[0];
    if (c.h < 8 || c.h >= 17) return undefined;
    return c.wolni.find(
      (p) =>
        p.weapon &&
        (p.needs?.health ?? 0) >= 60 &&
        st.pawns.filter((q) => q.kind === 'zombie' && Math.hypot(q.x - p.x, q.y - p.y) < 15).length <= 1,
    );
  };

  /** Budynki mieszkalne z drzwiami na zewnątrz od najbliższego siedzibie (zamieszkane na start albo puste). */
  const sasiednieBudynki = (zamieszkane: boolean): { bid: number; drzwi: number[] }[] =>
    w.buildings
      .filter(
        (b) => b.id !== w.hq && b.entrances.length > 0 && mieszkalny(w, b.id) && ludzieNaStart(w, b.id) === zamieszkane,
      )
      .map((b) => ({
        bid: b.id,
        d: Math.hypot(
          (b.entrances[0].out % size) - (drzwiHq % size),
          Math.floor(b.entrances[0].out / size) - Math.floor(drzwiHq / size),
        ),
        drzwi: drzwiBudynku(w, b.id).zewn.map((x) => x.tile),
      }))
      .filter((b) => b.drzwi.length > 0)
      .sort((a, b) => a.d - b.d);

  /** liczba prób pukania do drzwi (klucz: kafelek) */
  const zapukane = new Map<number, number>();

  /** „Zapukać” do najbliższych zamieszkanych drzwi, po kolei, najwyżej trzy razy do tych samych */
  const zapukaj = (c: Ctx, najwyzej = 3): void => {
    if (st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'door')) return;
    const kto = zaSiatkaMozna(c);
    if (!kto || !mozna('pukanie', c.s, 20)) return;
    for (const b of sasiednieBudynki(true))
      for (const door of b.drzwi) {
        if ((zapukane.get(door) ?? 0) >= najwyzej) continue;
        const m = zMenu(kto.id, door, 'knock', 'Zapukać');
        if (!m) continue;
        zapukane.set(door, (zapukane.get(door) ?? 0) + 1);
        c.wolni.splice(c.wolni.indexOf(kto), 1);
        polecenie(m.cmd, `${m.label} (budynek ${b.bid})`);
        return;
      }
  };

  /** Odpowiedź w oknie spotkania z lokatorami (okno czeka na wybór; bot odpowiada w tej samej sekundzie): przy ataku obrona
      z bronią, a bez niej ucieczka; szabrownicy w budynku: przegonić z bronią, inaczej odejść; zwykłych lokatorów
      zagadnąć, a gdy cel każe zebrać ludzi i zaproszenie jest możliwe, zaprosić. */
  const spotkanie = (c: Ctx): boolean => {
    const sas = st.sasiedzi;
    const sp = sas?.spotkanie;
    const k = sim.kontekstKarty();
    if (!sas || !sp || !k) return false;
    const gos = sas.budynki[sp.b].domy[sp.dom];
    const wyb = wybory(sp, gos, k);
    const ok = (x: WyborSpotkania) => wyb.some((q) => q.k === x && q.ok);
    const zbieraLudzi = nieZrobiony(c.v, 'r4.nowi') || nieZrobiony(c.v, 'r8.ludnosc');
    let choice: WyborSpotkania;
    if (sp.atak) choice = k.uzbrojeni > 0 && ok('obrona') ? 'obrona' : 'ucieczka';
    else if (gos.szabrownicy) choice = k.uzbrojeni > 0 && ok('przegonic') ? 'przegonic' : 'odejscie';
    else if (zbieraLudzi && ok('zaproszenie')) choice = 'zaproszenie';
    // kto ma dość jedzenia, dokarmia chętnych (relacja rośnie o 25, od 20 w górę można zapraszać)
    else if (zbieraLudzi && ok('jedzenie') && gos.rel < 20 && k.jedzenie >= 6) choice = 'jedzenie';
    else choice = 'rozmowa';
    sim.push({ t: 'meet', ids: [], nr: sp.nr, choice });
    gadaj(`spotkanie: ${choice}`);
    return true;
  };

  /** otwarcie drzwi budynku (zamknięte: „Otworzyć drzwi”, na klucz: „Wyważyć drzwi”) przez wolnego z zarządu */
  const otworzDrzwi = (c: Ctx, bid: number): boolean => {
    const rec = st.sasiedzi?.budynki.find((b) => b.bid === bid);
    if (rec?.otwarty) return true;
    if (st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'door')) return false;
    const kto = zaSiatkaMozna(c);
    if (!kto || !mozna(`otworz:${bid}`, c.s, 30)) return false;
    for (const d of drzwiBudynku(w, bid).zewn) {
      const stan = rec ? stanDrzwi(rec, d.tile)?.s : 'zamkniete';
      if (stan === 'zabite') continue;
      const m = zMenu(kto.id, d.tile, stan === 'na_klucz' ? 'force' : 'open');
      if (!m) continue;
      c.wolni.splice(c.wolni.indexOf(kto), 1);
      polecenie(m.cmd, `${m.label} (budynek ${bid})`);
      return false;
    }
    return false;
  };

  /** budynki, z których nic już nie wyniesie (wszystko przeszukane, rozebrane i zaniesione) albo do których nie wszedł nikt */
  const skonczone = new Set<number>();

  /** Budynki do plądrowania od najbliższego: puste na start, a gdy ich brak, reszta; zamieszkane na końcu (tam mieszkańcy
      nie pozwalają niczego brać). */
  const doPlundrowania = (): number[] =>
    w.buildings
      .filter(
        (b) =>
          b.id !== w.hq &&
          b.entrances.length > 0 &&
          !skonczone.has(b.id) &&
          (mieszkalny(w, b.id) || b.cls === 'sklep' || b.cls === 'przychodnia'),
      )
      .map((b) => ({
        bid: b.id,
        zamieszkany: ludzieNaStart(w, b.id),
        d: Math.hypot(
          (b.entrances[0].out % size) - (drzwiHq % size),
          Math.floor(b.entrances[0].out / size) - Math.floor(drzwiHq / size),
        ),
      }))
      .sort((a, b) => Number(a.zamieszkany) - Number(b.zamieszkany) || a.d - b.d)
      .map((b) => b.bid);

  /** ostatnie polecenie przeszukania pomieszczenia u sąsiada */
  let ostatniePrzeszukanie: { bid: number; room: number } | null = null;

  /** próby otwarcia drzwi budynku (klucz: numer budynku) */
  const probyDrzwi = new Map<number, number>();

  /** Wyniesienie materiału z sąsiednich budynków, po jednej czynności naraz: otworzyć najbliższy pusty budynek, przeszukać
      jego pomieszczenia („Przeszukać …”), rozebrać meble w przeszukanych („Rozebrać …”: deski i złom), zanieść stertę na
      podwórko („Zanieść na podwórko”). W trybie zombie tylko za jasnego dnia z uzbrojonym i zdrowym. */
  const plundruj = (c: Ctx): void => {
    if (
      st.pawns.some(
        (p) =>
          p.kind === 'core' &&
          ['door', 'loot', 'dismantle', 'carry', 'upstairs'].includes(p.job?.t ?? '') &&
          p.job?.order,
      )
    )
      return;
    const kto = zaSiatkaMozna(c);
    if (!kto || !mozna('plunduj', c.s, 5)) return;
    for (const bid of doPlundrowania()) {
      const k = st.sasiedzi?.budynki.findIndex((b) => b.bid === bid) ?? -1;
      const rec = k >= 0 ? st.sasiedzi!.budynki[k] : undefined;
      if (!rec?.otwarty) {
        if ((probyDrzwi.get(bid) ?? 0) >= 6) {
          skonczone.add(bid);
          continue;
        }
        probyDrzwi.set(bid, (probyDrzwi.get(bid) ?? 0) + 1);
        if (otworzDrzwi(c, bid)) continue;
        return;
      }
      // pomieszczenie do przeszukania; to, do którego nikt nie poszedł od poprzedniego polecenia, jest nieosiągalne
      if (ostatniePrzeszukanie && st.pawns.every((p) => p.job?.t !== 'loot')) {
        const { bid: b0, room: r0 } = ostatniePrzeszukanie;
        const k0 = st.sasiedzi?.budynki.findIndex((b) => b.bid === b0) ?? -1;
        if (k0 >= 0 && moznaPrzeszukac(st, w, k0, r0) === 'tak') zle.add(`pokoj:${b0}:${r0}`);
      }
      ostatniePrzeszukanie = null;
      const pokoje = wnetrze(w, bid).rooms;
      const room = pokoje.findIndex((_r, i) => !zle.has(`pokoj:${bid}:${i}`) && moznaPrzeszukac(st, w, k, i) === 'tak');
      if (room >= 0) {
        c.wolni.splice(c.wolni.indexOf(kto), 1);
        ostatniePrzeszukanie = { bid, room };
        polecenie({ t: 'loot', ids: [kto.id], bid, room }, `Przeszukać pomieszczenie u sąsiadów (budynek ${bid})`);
        return;
      }
      // meble i śmieci w przeszukanych pomieszczeniach: rozbiórka na deski i złom, najpierw to, co daje najwięcej desek
      const wBudynku = st.things
        .filter(
          (t) => w.bid[t.y * size + t.x] === bid && t.by < 0 && !zle.has(`rozbiorka:${t.id}`) && dismantlable(st, w, t),
        )
        .sort((a, b) => (DISMANTLE[b.kind]?.deski ?? 0) - (DISMANTLE[a.kind]?.deski ?? 0));
      for (const t of wBudynku) {
        const m = zMenu(kto.id, t.y * size + t.x, 'dismantle', 'Rozebrać');
        if (!m) {
          zle.add(`rozbiorka:${t.id}`);
          continue;
        }
        c.wolni.splice(c.wolni.indexOf(kto), 1);
        polecenie(m.cmd, `${m.label} (budynek ${bid})`);
        return;
      }
      // sterty materiału do zaniesienia na podwórko
      const sterta = st.things.find(
        (t) => w.bid[t.y * size + t.x] === bid && CARRY_MATS.has(t.kind) && t.n > 0 && t.by < 0,
      );
      if (sterta) {
        const m = zMenu(kto.id, sterta.y * size + sterta.x, 'carry', 'Zanieść');
        if (m) {
          c.wolni.splice(c.wolni.indexOf(kto), 1);
          polecenie(m.cmd, `${m.label} (budynek ${bid})`);
          return;
        }
      }
      skonczone.add(bid);
    }
  };

  /** Budynki, które da się otoczyć wspólnym płotem, od najkrótszego płotu (przy remisie od najbliższego): menu pokazuje
      długość i koszt, więc człowiek bierze najtańszy. Liczone raz (kształt płotu zależy od świata, nie od stanu gry). */
  const celePlotu = budynkiDoOtoczenia(w)
    .map((bid) => {
      const drzwi = drzwiBudynku(w, bid).zewn.map((d) => ({ tile: d.tile, out: d.out }));
      const r = wspolnyPlot(w, w.fence, drzwi, new Set<number>());
      return { bid, dlugosc: r.ok ? r.dlugosc : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.dlugosc - b.dlugosc);

  /** Wspólny płot wokół sąsiedniego budynku: najkrótszy do otoczenia. Otworzyć jego drzwi, potem z menu drzwi „Otoczyć wspólnym
      płotem (…)” (pierwszy wariant, z kosztem i czasem w napisie); płot w budowie ciągnie się dalej poleceniem „Budować
      wspólny płot dalej”. Plan nie wymaga materiału na podwórku: ludzie znoszą go, gdy zarząd go zbierze. */
  const otoczPlotem = (c: Ctx): void => {
    const bid = celePlotu[0]?.bid;
    if (bid === undefined) return;
    if (!otworzDrzwi(c, bid)) return;
    if (st.pawns.some((p) => p.kind === 'core' && (p.job?.t === 'plot' || p.job?.t === 'door'))) return;
    const kto = zaSiatkaMozna(c);
    if (!kto || !mozna('plot', c.s, 30)) return;
    for (const d of drzwiBudynku(w, bid).zewn) {
      const m = commandsAt(st, w, [kto.id], d.tile).find((x) => x.cmd.t === 'enclose' && !x.off);
      if (!m) continue;
      // podpowiedź mówi „Otoczyć wspólnym płotem (…)”; „Budować wspólny płot dalej” to ten sam wpis przy planie w toku
      if (!(m.label.startsWith('Otoczyć wspólnym płotem') || m.label.startsWith('Budować wspólny płot'))) {
        niezgodnosc('Otoczyć wspólnym płotem', m.label);
        continue;
      }
      c.wolni.splice(c.wolni.indexOf(kto), 1);
      polecenie(m.cmd, m.label);
      return;
    }
  };

  /* ------------------------------------------------------------ okazje */

  /** pionek, którego dotyczy otwarta okazja (id w stanie okazji) */
  const pionekOkazji = (): Pawn | undefined => st.pawns.find((p) => p.id === g.sciezka.okazja?.cel);

  /** kafelek pionka */
  const kafelek = (p: { x: number; y: number }): number => Math.floor(p.y) * size + Math.floor(p.x);

  /** Dźgnięcie szwendacza przy siatce przez kogoś z dzidą (cel „dźgnijcie szwendacza” i „zabijcie trzech napierających”). */
  const dzgnijSzwendacza = (c: Ctx): void => {
    const dzida = c.wolni.find((p) => p.weapon === 'dzida' && (p.needs?.health ?? 0) > 40);
    if (!dzida || !mozna('dzgnij', c.s, 10)) return;
    const cel = zombieZaSiatka().sort(
      (a, b) => Math.hypot(a.x - dzida.x, a.y - dzida.y) - Math.hypot(b.x - dzida.x, b.y - dzida.y),
    )[0];
    if (!cel) return;
    const m = zMenu(dzida.id, kafelek(cel), 'attack', 'Atakuj szwendacza');
    if (!m) return;
    c.wolni.splice(c.wolni.indexOf(dzida), 1);
    polecenie(m.cmd, m.label);
  };

  /** Najbliższy z wolnych osób zarządu do miejsca `cel`: wędrowiec stoi przy siatce kilkanaście minut gry, a droga przez
      podwórko trwa niewiele krócej, więc rozmowę zaczyna ten, kto ma najbliżej (człowiek zaznacza najbliższego). */
  const najblizszyWolny = (c: Ctx, cel: { x: number; y: number }): Pawn | undefined =>
    [...c.wolni].sort((a, b) => Math.hypot(a.x - cel.x, a.y - cel.y) - Math.hypot(b.x - cel.x, b.y - cel.y))[0];

  /** Wędrowiec (w trybie zombie ocalały) przy siatce, gdy cel każe zebrać ludzi: rozmowa („Zagadać”), w zombie pytanie o rękę
      („Zapytać o rękę”, bo co piąty ukrywa ugryzienie), potem „Zaprosić do nas” z szansą w procentach. Menu pokazuje te pozycje
      kolejno, jedna po drugiej, gdy rozmowa się odbyła. */
  const werbunek = { rozmowy: 0, rece: 0, zaproszenia: 0 };
  /** Werbunek wędrowca przy siatce. Gracz robi go, gdy cel każe zebrać ludzi (R4 `nowi`, R8 `ludnosc`) albo, z `werbunekOkazji`,
      gdy tego chce cel okazji wędrowca (`zOkazji`: O1.2 „Zapytać o rękę”, O1.3 „Zaprosić do nas”). */
  const werbuj = (c: Ctx, zOkazji = false): void => {
    if (!zOkazji && !nieZrobiony(c.v, 'r4.nowi') && !nieZrobiony(c.v, 'r8.ludnosc')) return;
    const wedrowiec = st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1);
    const kto = wedrowiec && najblizszyWolny(c, wedrowiec);
    if (!wedrowiec || !kto || !mozna('werbuj', c.s, 10)) return;
    const menu = commandsAt(st, w, [kto.id], kafelek(wedrowiec)).filter((m) => !m.off);
    const m =
      menu.find((x) => x.cmd.t === 'talk') ??
      menu.find((x) => x.cmd.t === 'reka') ??
      menu.find((x) => x.cmd.t === 'zapros');
    if (!m) return;
    // podpowiedzi okazji cytują te napisy z menu (O1.2, O1.3): gdy menu mówi co innego, gracz by ich nie znalazł
    if (m.cmd.t === 'reka' && !m.label.startsWith('Zapytać o rękę')) niezgodnosc('Zapytać o rękę', m.label);
    if (m.cmd.t === 'zapros' && !m.label.startsWith('Zaprosić do nas')) niezgodnosc('Zaprosić do nas', m.label);
    c.wolni.splice(c.wolni.indexOf(kto), 1);
    if (m.cmd.t === 'talk') werbunek.rozmowy++;
    else if (m.cmd.t === 'reka') werbunek.rece++;
    else werbunek.zaproszenia++;
    polecenie(m.cmd, m.label);
  };

  /* ------------------------------------------------------------ R3: panel Pracy */

  /** Ustawienie pracy, które nie rusza przebiegu gry, bo bot ścieżki mierzy czasy rozdziałów, a nie gospodarkę: nic z poniższych
      nie zmienia, kto co robi. Szaber 3 → 4 u pierwszej osoby (klik w komórkę; Szaber jest ostatni w grupie priorytetu 3, więc
      kolejność pracy ta sama, a symulacja zapisuje zmianę), stałe zajęcie „Ogień” (każdy ma Ogień z priorytetem 1 i na pierwszym
      miejscu, więc kolejność ta sama) i próg części +5 (warsztat robi części tylko z nadwyżki złomu). Każde ustawienie raz. */
  const pracaOsoba = (c: Ctx) => c.o.snap.people[0];
  const kliknijKomorkeSzaber = (c: Ctx): void => {
    const kto = pracaOsoba(c);
    if (!kto || !mozna('praca-prio', c.s, 30)) return;
    const prio = nastepnyPriorytet(kto.praca.prio[RODZAJE.indexOf('szaber')]);
    polecenie(
      { t: 'prio', ids: [], osoba: kto.osoba, rodzaj: 'szaber', prio },
      `panel Pracy: ${kto.first}, Szaber ${prio}`,
    );
  };
  const wybierzStaleOgien = (c: Ctx): void => {
    const kto = pracaOsoba(c);
    if (!kto || !mozna('praca-stale', c.s, 30)) return;
    polecenie(
      { t: 'stale', ids: [], osoba: kto.osoba, rodzaj: 'ogien' },
      `karta osoby: ${kto.first}, stałe zajęcie Ogień`,
    );
  };
  const plusProgCzesci = (c: Ctx): void => {
    if (!mozna('praca-prog', c.s, 30)) return;
    const n = c.o.snap.praca.progi.czesci + KROK_PROGU;
    polecenie({ t: 'prog', ids: [], co: 'czesci', n }, `panel Pracy: próg części ${n}`);
  };

  /** „Do broni!”: wszyscy zdolni na wartę (przycisk u góry), raz */
  const alarm = (c: Ctx): void => {
    if (alarmOn(st) || !mozna('alarm', c.s, 60)) return;
    polecenie({ t: 'alarm', ids: rdzen(st).map((p) => p.id) }, '„Do broni!”');
  };

  /* ------------------------------------------------------------ obrona w trybie zombie */

  const podworko = new Set(w.fence.yard);

  /** Codzienna obrona w trybie zombie, to samo co robi gracz w `npm run bot:zombie`: uzbrojeni biją szwendaczy, którzy weszli
      na podwórko, kto ma dzidę, dźga przez siatkę tych, którzy pod nią stoją, ugryzionego w kończynę amputuje najlepszy
      medyk, przy umierającym w gorączce czeka ktoś z bronią, a za dnia bez wroga na podwórku: łata na dziurę, wzmocnienie
      siatki, dobicie zwłok i dzida do magazynu, gdy jej tam brak. Bez tego czwórka z kijem i nożem ginie w drugą noc. */
  const obronaZombie = (c: Ctx): void => {
    if (g.tryb !== 'zombie' || !mozna('obrona', c.s, 10)) return;
    const ludzie = rdzen(st);
    const wPodworku = st.pawns.filter((q) => q.kind === 'zombie' && podworko.has(kafelek(q)));
    const najblizszy = (lista: Pawn[], od: Pawn): Pawn | undefined =>
      [...lista].sort((a, b) => Math.hypot(a.x - od.x, a.y - od.y) - Math.hypot(b.x - od.x, b.y - od.y))[0];
    for (const q of ludzie) {
      if (!q.weapon || q.job?.t === 'guard' || q.job?.t === 'fight' || (q.needs?.health ?? 0) <= 40) continue;
      const z = najblizszy(wPodworku, q);
      if (z) sim.push({ t: 'attack', ids: [q.id], target: z.id });
    }
    if (c.h >= 6 && c.h < 20) {
      const przySiatce = zombieZaSiatka().filter((q) => !podworko.has(kafelek(q)));
      for (const q of ludzie) {
        if (q.weapon !== 'dzida' || !przySiatce.length || (q.needs?.health ?? 0) <= 50) continue;
        if (['fight', 'guard', 'amputate', 'sleep'].includes(q.job?.t ?? '')) continue;
        const z = najblizszy(przySiatce, q);
        const m = z && commandsAt(st, w, [q.id], kafelek(z)).find((x) => x.cmd.t === 'attack');
        if (m) sim.push(m.cmd);
      }
    }
    // ugryziony w kończynę: amputacja w oknie, najlepszy medyk
    for (const q of ludzie)
      if (
        q.bite !== undefined &&
        q.limb &&
        st.tick <= q.bite + AMPUTATE_WINDOW &&
        !ludzie.some((x) => x.job?.t === 'amputate')
      ) {
        const lekarz = ludzie
          .filter((x) => x !== q)
          .sort((a, b) => (st.people[b.person].skills.med ?? 0) - (st.people[a.person].skills.med ?? 0))[0];
        if (lekarz) {
          polecenie({ t: 'amputate', ids: [lekarz.id], patient: q.id }, `„Amputować”: ${st.people[q.person].first}`);
          break;
        }
      }
    // umierający w gorączce: ktoś z bronią czeka obok, żeby dobić, zanim zmarły wstanie
    for (const q of ludzie)
      if (q.bite !== undefined && q.bite + FEVER_TICKS - st.tick < 2 * 800) {
        const czeka = ludzie.some(
          (x) => x !== q && x.job?.t === 'go' && x.job.order && Math.hypot(x.x - q.x, x.y - q.y) < 3,
        );
        const pomocnik = ludzie
          .filter((x) => x !== q && x.weapon && x.bite === undefined && x.job?.t !== 'guard' && x.job?.t !== 'fight')
          .sort((a, b) => (b.needs?.health ?? 0) - (a.needs?.health ?? 0) || a.id - b.id)[0];
        if (!czeka && pomocnik) sim.push({ t: 'move', ids: [pomocnik.id], to: kafelek(q) });
      }
    // za dnia, gdy na podwórku nikogo wrogiego nie ma: łaty, wzmocnienie siatki, dobicie zwłok, dzida do magazynu
    if (c.h < 7 || c.h >= 19 || wPodworku.length) return;
    const wolne = ludzie.filter((p) => !p.job || p.job.t === 'go' || p.job.t === 'stay');
    const zajety = (t: string) => ludzie.some((p) => p.job?.t === t);
    const zMenu1 = (tile: number, t: Command['t']) =>
      wolne[0] && commandsAt(st, w, [wolne[0].id], tile).find((x) => x.cmd.t === t);
    const dziura = st.fence?.holes.find((x) => !x.patch);
    if (wolne.length && dziura && !zajety('patch')) {
      const m = zMenu1(dziura.tiles[0], 'patch');
      if (m) polecenie(m.cmd, m.label);
    } else if (wolne.length && st.fence && !zajety('brace')) {
      const hp = st.fence.hp;
      const k = hp.reduce((b, v, j) => (v > 0 && v < hp[b] ? j : b), 0);
      const m = hp[k] < 70 ? zMenu1(w.fence.tiles[k], 'brace') : undefined;
      if (m) polecenie(m.cmd, m.label);
    }
    const cialo = st.things.find((t) => t.kind === 'zwloki' && t.fuel > 0);
    if (wolne.length > 1 && cialo) sim.push({ t: 'finish', ids: [wolne[1].id], thing: cialo.id });
    const sterta = st.things.find((t) => t.kind === 'deski');
    if (
      wolne.length > 2 &&
      sterta &&
      !zajety('craft') &&
      (st.store.arms ?? []).filter((x) => x === 'dzida').length < 1
    ) {
      const m = commandsAt(st, w, [wolne[2].id], sterta.y * size + sterta.x).find((x) => x.cmd.t === 'craft');
      if (m) polecenie(m.cmd, m.label);
    }
  };

  /** Warta zombie na kartę nocy, jak `warta-dzidy` w `npm run bot:zombie`: propozycja zarządu zostaje, tylko warta przy
      siatce idzie do dwóch najzdrowszych, i to z dzidą (własną albo z magazynu w zamian za swoją broń); ugryzieni nie stoją. */
  const strazZombie = (card: NightCard): void => {
    for (const p of card.people) {
      const key = g.gov.night?.assign[p.id];
      if (key?.startsWith('warta:') && key !== KOZA_KEY) setNight(g.gov, p.id, 'sen');
    }
    let zapas = (st.store.arms ?? []).filter((x) => x === 'dzida').length;
    let straznicy = 0;
    const kolej = rdzen(st)
      .filter((q) => q.bite === undefined)
      .sort(
        (a, b) =>
          (b.needs?.health ?? 0) + (b.needs?.rest ?? 0) - ((a.needs?.health ?? 0) + (a.needs?.rest ?? 0)) ||
          Number(b.weapon === 'dzida') - Number(a.weapon === 'dzida') ||
          a.id - b.id,
      );
    for (const min of [45, 30])
      for (const q of kolej) {
        if (straznicy >= 2) break;
        if ((q.needs?.health ?? 0) < min) continue;
        const dzida = q.weapon === 'dzida';
        if (!dzida && zapas <= 0) continue;
        const id = st.people[q.person].id;
        if (g.gov.night?.assign[id] === 'warta:siatka' || !setNight(g.gov, id, 'warta:siatka')) continue;
        if (!dzida) {
          sim.push({ t: 'arm', ids: [q.id], weapon: 'dzida' });
          zapas--;
        }
        straznicy++;
      }
  };

  /* ------------------------------------------------------------ cele */

  /** Czy zapas na mapie starcza na którąś z budowli (albo na dokończenie jej planu): inaczej trzeba skądś wziąć materiał. */
  const starczaMaterialu = (c: Ctx, rodzaje: readonly BuildKind[]): boolean => {
    const mats = c.o.snap.stock.mats;
    return rodzaje.some((k) => {
      const plan = c.o.snap.builds.find((b) => b.kind === k);
      const trzeba = plan ? plan.missing : BUILDS[k].cost;
      return (Object.entries(trzeba) as [Mat, number][]).every(([m, n]) => mats[m] >= n);
    });
  };

  /** Budowla z bieżącego celu: gospodarz (przeszukanie i rozbiórka własnych pomieszczeń) stawia plan, gdy materiału starcza;
      gdy własne pomieszczenia nie dają dość, materiał niesie się od sąsiadów (podpowiedź pierwszej budowli w domu, pracowni
      w domu z domami obok i płotu mówi o tym wprost). */
  const budujZMaterialem = (c: Ctx, rodzaje: BuildKind[]): void => {
    kolejka = rodzaje;
    dokonczPlan(c);
    if (rodzaje.length && !starczaMaterialu(c, rodzaje)) plundruj(c);
  };

  /** Plan, przy którym nikt nie pracuje, choć materiał jest: w trybie zombie automat nie buduje przy siatce (cel do 3 kafelków
      od niej, szwendacz bliżej niż 10 m), a podwórko bywa wąskie, więc plan stoi pusty. Człowiek przydziela wtedy kogoś tym
      samym poleceniem „Budowa” w miejscu planu (praca z polecenia jest poza tą regułą). */
  const dokonczPlan = (c: Ctx): void => {
    if (g.tryb !== 'zombie' || c.h < 7 || c.h >= 19) return;
    const plan = st.builds.find((b) => b.by < 0 && starczaMaterialu(c, [b.kind]));
    if (!plan || st.pawns.some((p) => p.kind === 'core' && p.job?.t === 'build' && p.job.order)) return;
    const kto = c.wolni[0];
    if (!kto || !mozna(`plan:${plan.id}`, c.s, 20)) return;
    c.wolni.shift();
    polecenie(
      { t: 'build', ids: [kto.id], kind: plan.kind, x: plan.x, y: plan.y, rot: plan.rot },
      `Budowa: ${BUILDS[plan.kind].name} (przydział do planu)`,
    );
  };

  const AKCJE: Record<string, (c: Ctx) => void> = {
    'r0.drewno': (c) => zdobadzDrewno(c, NIGHT_WOOD, 'drewno na wieczór'),
    // jedna budowla: dwie najtańsze w kolejce, dopóki żadna nie jest zaplanowana (plan w toku albo gotowa)
    'r1.budowla': (c) => budujZMaterialem(c, st.builds.length ? [] : najtanszeBudowle(st, 2)),
    'r1.obwod': (c) => budujZMaterialem(c, st.builds.some((b) => b.kind === 'zasieki') ? [] : ['zasieki']),
    'r1.dzida': (c) => zrobDzide(c),
    'r1.drewno2': (c) => {
      if (c.h >= 6 && c.h < 20) zdobadzDrewno(c, potrzebaDrewna(c.o.input) + 1, 'drewno na noc', true);
    },
    'r2.sily': (c) => {
      c.g.sciezka = zdarzenieUi(c.g.sciezka, 'lista', st.tick);
      gadaj('zdarzenie interfejsu: lista ludzi');
    },
    'r2.ognisko': (c) => {
      if (
        c.o.gov?.evening.campfire ||
        c.h < 16 ||
        c.h >= 20 ||
        st.things.some((t) => t.kind === 'ognisko' && t.fuel > 0)
      )
        return;
      // 2 sztuki drewna na ognisko: skład, luzem albo w rękach
      if (zapasDrewna(c.o) < CAMPFIRE_WOOD) return zdobadzDrewno(c, CAMPFIRE_WOOD + 1, 'drewno na ognisko');
      const kto = c.wolni[0];
      if (!kto || !mozna('ognisko', c.s, 30)) return;
      const miejsce = [...w.fence.yard]
        .sort((a, b) => odDrzwiKafelka(a) - odDrzwiKafelka(b))
        .find((t) => campfireSpotOk(st, w, t));
      if (miejsce === undefined) return;
      const m = zMenu(kto.id, miejsce, 'campfire', 'Rozpalić ognisko tutaj');
      if (!m) return;
      c.wolni.shift();
      polecenie(m.cmd, m.label);
    },
    'r2.dzgnij': dzgnijSzwendacza,
    'r2.uzbrojeni': (c) => {
      const kto = c.wolni.find((p) => !p.weapon);
      const bron = kto ? nastepnaBron(kto) : null;
      if (!kto || !bron || !mozna('uzbrojeni', c.s, 20)) return;
      c.wolni.splice(c.wolni.indexOf(kto), 1);
      polecenie({ t: 'arm', ids: [kto.id], weapon: bron }, `„Zmień”: ${bron}`);
    },
    // przed kartą nocy: dwie osoby z dzidą (druga z magazynu przez „Zmień” albo „Zrobić dzidę”)
    'r2.dzidy': (c) => {
      const potrzeba = Math.min(2, rdzen(st).length);
      if (rdzen(st).filter((p) => p.weapon === 'dzida').length >= potrzeba) return;
      const kto = c.wolni.find((p) => p.weapon !== 'dzida');
      if (!kto) return;
      if ((st.store.arms ?? []).includes('dzida')) {
        if (!mozna('dzidy-zmien', c.s, 20)) return;
        c.wolni.splice(c.wolni.indexOf(kto), 1);
        polecenie({ t: 'arm', ids: [kto.id], weapon: 'dzida' }, '„Zmień”: dzida z magazynu');
      } else zrobDzide(c);
    },
    'r3.priorytet': kliknijKomorkeSzaber,
    'r3.stale': wybierzStaleOgien,
    'r3.zapas': plusProgCzesci,
    'r4.ludzie': (c) => {
      const mieszkancy = st.pawns.some((p) => p.kind === 'resident' && p.person >= 0);
      c.g.sciezka = zdarzenieUi(c.g.sciezka, mieszkancy ? 'mieszkaniec' : 'budynek', st.tick);
      gadaj(`zdarzenie interfejsu: ${mieszkancy ? 'karta mieszkańca' : 'karta budynku'}`);
    },
    'r5.wyprawa': (c) => {
      wyslijWypraweZMapy(c, 'wyprawa z mapy miasta');
    },
    'r5.ogrodek': (c) => budujZMaterialem(c, ['ogrodek']),
    // pracownia: deski i części z przeszukiwania i rozbiórki; w domu z domami obok (Zielonki) podpowiedź odsyła też do
    // sąsiednich domów, a w trybie zombie to wyjście za siatkę za dnia, z dzidą
    'r6.pracownia': (c) => budujZMaterialem(c, ['pracownia']),
    'r6.badanie': (c) => {
      if (!st.research?.cur) wybierzBadanie(c, 1);
    },
    'r6.stol': (c) => posadzPrzyStole(c),
    'r6.odkrycie': (c) => {
      if (!st.research?.cur && !pierwszaTechnologia()) wybierzBadanie(c, 1);
      posadzPrzyStole(c);
    },
    // kartka z ery 2 dopiero po pierwszej technologii (wymaga jej), gdy nic nie jest w toku
    'r6.era2': (c) => {
      if (!pierwszaTechnologia()) return;
      if (!st.research?.cur || kartka(st, st.research.cur, modeOf(st)).stan === 'zbadana') wybierzBadanie(c, 2);
      posadzPrzyStole(c);
    },
    'r7.pukanie': (c) => zapukaj(c),
    'r7.spotkanie': (c) => zapukaj(c),
    'r7.wejscie': (c) => plundruj(c),
    'r7.szaber': (c) => plundruj(c),
    'r8.drogi': (c) => {
      c.g.sciezka = zdarzenieUi(c.g.sciezka, 'drogi', st.tick);
      gadaj('zdarzenie interfejsu: ekran dróg do zwycięstwa');
    },
    // ludzie od sąsiadów: pukać do zamieszkanych drzwi, rozmawiać, dokarmiać i zapraszać (obok kart wydarzeń)
    'r8.ludnosc': (c) => zapukaj(c, 8),
    // płot bierze dużo desek i złomu: do czasu planu zbieranie z mebli (własnych pustych mieszkań i sąsiednich budynków)
    'r8.teren': (c) => otoczPlotem(c),
    'o1.zagadaj': (c) => {
      const wedrowiec = pionekOkazji();
      const kto = wedrowiec && najblizszyWolny(c, wedrowiec);
      if (!wedrowiec || !kto || !mozna('zagadaj', c.s, 15)) return;
      const m = zMenu(kto.id, kafelek(wedrowiec), 'talk', 'Zagadać');
      if (!m) return;
      c.wolni.splice(c.wolni.indexOf(kto), 1);
      polecenie(m.cmd, m.label);
    },
    // werbunek po rozmowie: pytanie o rękę (zombie) i zaproszenie, przez ten sam wybór z menu co przy celach ludzi (tylko z
    // `werbunekOkazji`: bez niego wędrowców zaprasza gracz wyłącznie wtedy, gdy tego chcą cele R4 i R8)
    'o1.reka': (c) => {
      if (werbunekOkazji) werbuj(c, true);
    },
    'o1.zapros': (c) => {
      if (werbunekOkazji) werbuj(c, true);
    },
    'o2.wymiana': (c) => {
      const handlarz = pionekOkazji();
      const kto = c.wolni[0];
      if (!handlarz || !kto || !mozna('wymiana', c.s, 15)) return;
      const m = zMenu(kto.id, kafelek(handlarz), 'trade', 'Dać');
      if (!m) return;
      c.wolni.shift();
      polecenie(m.cmd, m.label);
    },
    'o3.alarm': alarm,
    'o4.alarm': alarm,
    'o4.zabici': dzgnijSzwendacza,
    'o5.amputacja': (c) => {
      const chory = pionekOkazji();
      if (!chory || !mozna('amputacja', c.s, 20)) return;
      // amputuje ten z zarządu, kto najlepiej zna się na medycynie (jak przycisk na karcie)
      const lekarz = rdzen(st)
        .filter((q) => q !== chory && (q.needs?.health ?? 0) > 20)
        .sort(
          (a, b) => (st.people[b.person].skills.med ?? 0) - (st.people[a.person].skills.med ?? 0) || a.id - b.id,
        )[0];
      if (lekarz) polecenie({ t: 'amputate', ids: [lekarz.id], patient: chory.id }, '„Amputować”');
    },
    'o6.dobic': (c) => {
      const cialo = st.things.find((t) => t.id === g.sciezka.okazja?.cel);
      const kto = c.wolni[0];
      if (!cialo || !kto || !mozna('dobic', c.s, 10)) return;
      const m = zMenu(kto.id, cialo.y * size + cialo.x, 'finish', 'Dobić');
      if (!m) return;
      c.wolni.shift();
      polecenie(m.cmd, m.label);
    },
    'o7.wrak': (c) => {
      const kto = c.wolni[0];
      if (!kto || !mozna('wrak', c.s, 20)) return;
      for (const wr of wrecksOf(w)) {
        const m = zMenu(kto.id, wr.y * size + wr.x, 'wreck');
        if (!m) continue;
        c.wolni.shift();
        polecenie(m.cmd, m.label);
        return;
      }
    },
    'o8.kozy': (c) => {
      if (!pracownia()) kolejka = ['pracownia'];
      else {
        if (st.research?.cur !== 't_kozy' && kartka(st, 't_kozy', modeOf(st)).stan === 'do_wziecia')
          polecenie({ t: 'research', ids: [], tech: 't_kozy' }, 'tablica badań: t_kozy');
        posadzPrzyStole(c);
      }
    },
    'o8.beczka': (c) => budujZMaterialem(c, ['koza_beczka']),
  };
  /** cele czekające, które gracz przygotowuje przed czasem (karta nocy z dwiema dzidami) */
  const PRZYGOTUJ: ReadonlySet<string> = new Set(['r2.dzidy']);

  /** odległość kafelka od pierwszych drzwi siedziby */
  function odDrzwiKafelka(t: number): number {
    return Math.hypot((t % size) - (drzwiHq % size), Math.floor(t / size) - Math.floor(drzwiHq / size));
  }

  /** czy cel o pełnym kluczu jest w widoku i nie jest zrobiony */
  const nieZrobiony = (v: WidokSciezki, klucz: string): boolean => {
    const [blok, cel] = klucz.split('.');
    const bloki = [
      v.rozdzial && { k: v.rozdzial.k as string, cele: v.rozdzial.cele },
      v.okazja && { k: g.sciezka.okazja?.k as string, cele: v.okazja.cele },
    ];
    return bloki.some((b) => b && b.k === blok && b.cele.some((c) => c.key === cel && !c.done));
  };
  /** klucze celów z danym oknem, które nie są zrobione (linia „Cel: …” okna) */
  const celeOkna = (v: WidokSciezki, okno: 'karta' | 'uchwala' | 'tablica' | 'spotkanie'): string[] => {
    const out: string[] = [];
    if (v.okazja && g.sciezka.okazja)
      for (const c of v.okazja.cele) if (c.okno === okno && !c.done) out.push(pelny(g.sciezka.okazja.k, c));
    if (v.rozdzial) for (const c of v.rozdzial.cele) if (c.okno === okno && !c.done) out.push(pelny(v.rozdzial.k, c));
    return out;
  };

  return {
    start() {
      const kto = rdzen(st)[0];
      sim.push({ t: 'select', ids: [kto.id] });
      g.zaznaczony = true;
      // świat bez suchego drzewa (`dryTree` < 0) nie ma kroku ścięcia: sam samouczek zaznaczenia
      const c = w.dryTree >= 0 ? commandFor(st, w, [kto.id], pien(w, w.dryTree)) : null;
      if (c) sim.push(c);
      gadaj(
        c ? 'samouczek: zaznaczenie i ścięcie suchego drzewa' : 'samouczek: zaznaczenie (świat bez suchego drzewa)',
      );
    },
    werbunek() {
      return { ...werbunek };
    },
    niezgodnosci() {
      return [...niezgodnosci];
    },
    krok(v) {
      const o = odczyt(g);
      const s = Math.floor(st.tick / TICKS_PER_SECOND);
      const c: Ctx = { g, o, v, s, h: hourOf(st.tick), wolni: wolniZarzadu(st) };
      kolejka = [];
      // zombie: praca z polecenia w siedzibie, której droga wychodzi na ulicę (meble, pomieszczenia i drzwi z drugiego końca
      // bloku), idzie do kosza, zanim ktoś zginie; gospodarka, która tę pracę zleciła, uzna cel za nieosiągalny. Wyjątek:
      // budowa („Budować …” z menu planu idzie po deski ulicą i do innych klatek) i palenie mebli z klatki za ulicą („Spalić …”,
      // drewno na wieczór), dopóki odcinek jest wolny od szwendaczy
      if (g.tryb === 'zombie')
        for (const p of rdzen(st))
          if (p.job?.order && W_SIEDZIBIE.has(p.job.t) && (drogaNaZewnatrz(p) || zaDaleko(p.job.tile))) {
            if ((p.job.t === 'build' || p.job.t === 'burn') && ulicaWolna(p)) {
              if (mozna(`ulica:${p.id}`, c.s, 60)) gadaj(`${p.job.t}: odcinek ulicą wolny od szwendaczy, idziemy`);
              continue;
            }
            if (p.job.t === 'burn') zle.add(`mebel:${p.job.target}`);
            const koza = st.things.find((t) => t.kind === 'koza');
            const powod =
              p.job.t === 'build' || p.job.t === 'burn'
                ? (przeszkodaNaUlicy(p) ?? 'odcinek wolny')
                : 'praca poza wyjątkami (budowa, palenie)';
            polecenie(
              { t: 'move', ids: [p.id], to: koza ? koza.y * size + koza.x : drzwiHq },
              `${p.job.t}: droga na ulicę, wracamy (${powod})`,
            );
          }
      obronaZombie(c);
      // od drugiego dnia zapasy z mapy miasta, gdy brakuje jedzenia albo drewna (jak gracz wypraw z `npm run bot -- --miasto`)
      if (c.o.snap.day >= 2) wyslijWypraweZMapy(c, 'zaopatrzenie', true);
      werbuj(c);
      // okno spotkania czeka na wybór, więc najpierw ono
      if (spotkanie(c)) return;
      for (const klucz of celeGracza(g, v, PRZYGOTUJ, rownolegle)) AKCJE[klucz]?.(c);
      // drewno na noc od drugiego dnia, także bez celu: bez niego koza gaśnie (zwykły tryb ma Drwala z automatu)
      if (st.tut.step === TUT_STEPS.length && c.h >= 7 && c.h < 19)
        zdobadzDrewno(c, potrzebaDrewna(o.input) + 1, 'drewno na noc', true);
      gospodarz.player(sim, w, s, (cmd, opis) => polecenie(cmd, `gospodarka: ${opis}`));
    },
    karta(card, v) {
      if (g.tryb === 'zombie') strazZombie(card);
      const cele = celeOkna(v, 'karta');
      const wolne = (key: string) => card.people.filter((p) => p.options.some((x) => x.key === key && x.ok));
      if (cele.includes('r1.dyzur')) {
        // dyżur przy kozie dostaje najbardziej wypoczęty, który ma spać
        const kto = wolne(KOZA_KEY)
          .filter((p) => (g.gov.night?.assign[p.id] ?? 'sen') === 'sen')
          .sort((a, b) => b.needs.rest - a.needs.rest)[0];
        if (kto) setNight(g.gov, kto.id, KOZA_KEY);
      }
      if (cele.includes('r2.dzidy')) {
        const zDzida = new Set(
          snapshot(st, w)
            .people.filter((p) => p.weapon === 'dzida')
            .map((p) => p.id),
        );
        for (const p of wolne('warta:siatka')
          .filter((q) => zDzida.has(q.id))
          .slice(0, 2))
          setNight(g.gov, p.id, 'warta:siatka');
      }
      gadaj(
        `karta nocy: ${card.people.map((p) => `${p.name.split(' ')[0]} ${g.gov.night?.assign[p.id] ?? '?'} (zdrowie ${Math.round(p.needs.health)})`).join(', ')}`,
      );
    },
    uchwala(p) {
      return p.options.find((x) => x.s === 'ok')?.id ?? null;
    },
    wydarzenie(p, v) {
      // gdy cel każe przyjąć kogoś nowego, wybór, który wpuszcza ludzi („Przyjąć …”, „Wciągnąć do roboty”), a przy takim
      // celu nikogo się nie wyrzuca ani nie odprawia (kradzież z piwnicy: pierwszy wybór to wyrzucenie sprawcy)
      const chceLudzi = nieZrobiony(v, 'r4.nowi') || nieZrobiony(v, 'r8.ludnosc');
      if (chceLudzi) {
        const k = p.choices.findIndex((x) => x.ok && WPUSZCZA.test(x.label.pl));
        if (k >= 0) return k;
      }
      const bezOdprawy = p.choices.findIndex(
        (x) => x.ok && !(chceLudzi && /^(Wyrzuc|Odpraw|Wygon|Przegon)/.test(x.label.pl)),
      );
      if (bezOdprawy >= 0) return bezOdprawy;
      // jedyny dozwolony wybór to odprawa (karta gościa po „Obejrzeć ręce”: wpuszczenie i jedzenie są wyszarzone): bez niej
      // karta wraca bez końca, a bot klikałby wyszarzoną pozycję zamiast zamknąć okno
      return Math.max(
        0,
        p.choices.findIndex((x) => x.ok),
      );
    },
  };
}
