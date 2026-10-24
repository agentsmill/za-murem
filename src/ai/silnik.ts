/* Silnik decyzji osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md): pamięć silnika i decydenci,
   którzy prowadzą grę z src/ai/gra.ts przez jej ręce (`Rece`).

   `silnikPodstawowy` robi dokładnie to, co `playWithGov(w, seed, 'zawsze-warta', dni, 4)` z tests/unit/gov-play.ts bez
   opcji, więc obie pętle dają ten sam skrót (pilnuje tego tests/unit/ai-gra.test.ts):
   - start: samouczek, czyli zaznaczenie kogoś z zarządu i ścięcie suchego drzewa;
   - okna zarządu: uchwała `u_warty`, a gdy jej nie ma, pierwsza dozwolona; karta nocy z wartą (na wartę tylko zdrowie
     co najmniej 40, a gdy nikt nie stoi, najbardziej wypoczęty zdrowy na pierwszy posterunek); reszta jak
     `odpowiedzDomyslna` (raport, epilog zwycięstwa, wydarzenie pierwszym dozwolonym wyborem);
   - tura: co 10 sekund przy ekranie od 7:00 do 21:00, gdy drewna jest poniżej 6 i nikt nie ścina, polecenie ścięcia
     drzewa najbliższego drzwiom siedziby (drzewa, do których nikt nie doszedł, idą do `pamiec.pominieteDrzewa`).

   `silnik` to decydent, którego używa uprząż (`npm run bot:osada`): silnik podstawowy plus warstwy, które kolejne zadania
   dokładają edycją tego pliku. Dziś są to warstwy zimy (src/ai/zima.ts, zadanie 3), jedzenia (src/ai/jedzenie.ts, zadanie 4)
   i rozwoju (src/ai/rozwoj.ts, zadanie 5) oraz odpowiedzi na okna z src/ai/okna.ts (zadanie 5):
   - tura: ścinanie drzewa na opał jak w silniku podstawowym, ale już poniżej zapasu na dwie noce (`progDrewna`), nie
     dopiero poniżej 6 sztuk, i nigdy osoby, której potwierdzona karta nocy dała wartę, dyżur przy kozie albo wyprawę
     (`bezPoleceniaZKarty`: polecenie z karty rusza dopiero w następnym kroku, więc ścinanie z tej samej sekundy je
     nadpisywało); do tego `turaZimy` (pracownia, badanie kozy, koza z beczki w pokoju zarządu), `turaJedzenia`
     (wyprawa dzienna po jedzenie, ogródek) i `turaRozwoju` (budowy z kolejki, badania, tabela Pracy, werbunek wędrowców) co 30
     sekund przy ekranie (`CO_TIKOW_WARSTWY`), a liczniki ich wywołań siedzą w pamięci (`PamiecSilnika.wywolania`);
   - okno karty nocy: chorzy zdjęci z warty jak w silniku podstawowym, potem dyżur przy kozie (`dyzurNaKarcie`), dopiero
     potem wartownik przy siatce, wybierany spośród śpiących (kolejność odwrócona względem silnika podstawowego: przy mało
     zdrowych dyżur ma pierwszeństwo, a wyprawy nie tracą ludzi na wartę), na końcu zatwierdzenie;
   - okno wydarzenia: wybór na kopii zarządu (`odpowiedzNaWydarzenie`, src/ai/okna.ts): każdy dozwolony wybór oceniony po
     skutkach (zapasy, zaufanie, wkurzenie, rany, zgony, przyjęcia według zapasu jedzenia), najlepszy wygrywa; okno wieloetapowe
     (wybór z „zostaje”) dostaje odpowiedź na każdy krok;
   - okno uchwały: `wyborUchwaly` (src/ai/okna.ts): w pierwszym oknie wspólny kocioł (droga wspólnoty; `u_warty` z drogi porządku
     blokuje go do końca gry), potem tylko według potrzeb (głód: kocioł, słaba siatka: warta i brama na kłódkę), a bez potrzeby
     nic: ani racje głodowe, ani zebrania i meble na opał (każda uchwała kosztuje wkurzenie albo pracę);
   - raport i epilog zwycięstwa: odpowiedź domyślna (`odpowiedzDomyslna`).
   Warstwy idą w kolejności dopisywania (zima, jedzenie, rozwój) i najwyżej raz na 30 sekund przy ekranie, poza oknami zarządu,
   które dostają odpowiedź od razu. Silnik podstawowy niczego z warstw i okien nie używa i dalej odtwarza `playWithGov` co do
   skrótu.

   Cała pamięć silnika siedzi w `GraAi.pamiec`, zwykłym JSON z zapisem gry: decydenci nie mają stanu w zamknięciach ani na
   poziomie modułu, więc wczytana gra decyduje tak samo jak bez przerwy, a dwie gry w jednym procesie się nie mieszają.
   Silnik czyta tylko stan swojej gry i działa tylko rękami; bez losowania, zegara, DOM i modułów Node.

   Moduły gra.ts i silnik.ts importują się nawzajem (gra.ts bierze stąd `nowaPamiec`, silnik.ts z gra.ts `odpowiedzDomyslna`
   i `wejscie`), a warstwy (zima.ts, jedzenie.ts, rozwoj.ts) i okna (okna.ts) importują gra.ts i są importowane przez silnik.ts. Cykl jest bezpieczny, bo wszystkie
   strony używają importów tylko w ciele funkcji; warstwy dopisywane do `silnik` mają więc być deklaracjami funkcji, a nie
   stałymi liczonymi przy ładowaniu modułu z cudzych importów. */

import { CARD_HOUR, isFenceGuard, KOZA_KEY } from '../gov/noc.ts';
import type { Prompt } from '../gov/typy.ts';
import { dayOf, hourOf, TICKS_PER_SECOND } from '../sim/clock.ts';
import { dryTreeOf } from '../sim/house.ts';
import { commandFor } from '../sim/orders.ts';
import { type Pawn, trunkOf } from '../sim/sim.ts';
import { snapshot } from '../sim/snapshot.ts';
import { type Decydent, type GraAi, odpowiedzDomyslna, type Rece, wejscie } from './gra.ts';
import { turaJedzenia } from './jedzenie.ts';
import { odpowiedzNaWydarzenie, wyborUchwaly } from './okna.ts';
import { turaRozwoju } from './rozwoj.ts';
import { dyzurNaKarcie, type PamiecZimy, progDrewna, turaZimy } from './zima.ts';

/** Pamięć silnika: zwykły JSON, wchodzi do zapisu i do skrótu gry. Warstwy dopisują swoje pola (opcjonalne, z wartością
    domyślną przy pierwszym użyciu), żeby zapis sprzed warstwy dalej się wczytywał. */
export interface PamiecSilnika {
  v: 1;
  /** drzewa (indeksy w `w.trees`), do których nikt nie doszedł, więc ścinanie ich pomija */
  pominieteDrzewa: number[];
  /** drzewo z ostatniego polecenia ścinania (−1: brak) */
  zlecone: number;
  /** ile razy ruszyła każda warstwa (klucz to jej nazwa: 'zima', 'jedzenie', 'rozwoj'); pole powstaje przy pierwszym użyciu */
  wywolania?: Record<string, number>;
  /** warstwa zimy (src/ai/zima.ts); pole powstaje przy pierwszym użyciu */
  zima?: PamiecZimy;
}

export function nowaPamiec(): PamiecSilnika {
  return { v: 1, pominieteDrzewa: [], zlecone: -1 };
}

/** gracz wystawia na wartę tylko zdrowych (z mniejszym zdrowiem wartownik schodzi w nocy z posterunku) */
const ZDROWIE_WARTY = 40;
/** drewno sprawdza się co tyle sekund przy ekranie, w godzinach [OD, DO) */
const CO_SEKUND_DREWNO = 10;
const DREWNO_OD_GODZINY = 7;
const DREWNO_DO_GODZINY = 21;
/** poniżej tylu sztuk drewna zarząd ścina drzewo na opał (silnik podstawowy) */
const DREWNA_MIN = 6;
/** warstwy (zima, jedzenie, rozwój) idą najwyżej raz na tyle ticków: 30 sekund przy ekranie */
const CO_TIKOW_WARSTWY = 30 * TICKS_PER_SECOND;

/** zarząd na miejscu (bez wyprawy) */
const rdzen = (g: GraAi): Pawn[] => g.sim.st.pawns.filter((p) => p.kind === 'core' && !p.away);

/** samouczek: zaznaczyć kogoś z zarządu i kliknąć suche drzewo */
function samouczek(g: GraAi, r: Rece): void {
  const { w } = g;
  const st = g.sim.st;
  const suche = dryTreeOf(w);
  const kto = rdzen(g)[0];
  if (suche < 0 || !kto) return;
  r.polecenie({ t: 'select', ids: [kto.id] });
  const polecenie = commandFor(st, w, [kto.id], trunkOf(w, w.trees[suche]));
  if (polecenie) r.polecenie(polecenie);
}

/** najbliższe drzwiom siedziby drzewo do ścięcia (nie krzak, nieścięte, nie z listy tych, do których się nie dało dojść);
    −1, gdy żadnego nie ma */
function najblizszeDrzewo(g: GraAi, pominiete: readonly number[]): number {
  const { w } = g;
  const st = g.sim.st;
  const drzwi = w.buildings[w.hq].entrances[0]?.out ?? 0;
  const dx = drzwi % w.size;
  const dy = Math.floor(drzwi / w.size);
  let najlepsze = -1;
  let odl = Number.POSITIVE_INFINITY;
  for (let k = 0; k < w.trees.length; k++) {
    const t = w.trees[k];
    if (t.kind === 2 || st.felled.includes(k) || pominiete.includes(k)) continue;
    const d = Math.hypot(t.x - dx, t.y - dy);
    if (d < odl) {
      odl = d;
      najlepsze = k;
    }
  }
  return najlepsze;
}

/** drewno na opał: gdy zostaje mało (poniżej progu `prog`, domyślnie DREWNA_MIN), następne drzewo; próg liczy się dopiero
    po przejściu bramek czasu, więc koszt jego wyliczenia płaci się tylko co CO_SEKUND_DREWNO sekund za dnia. Bez `wolny` ścina
    pierwsza osoba, która nie śpi i nie stoi na warcie (a gdy takiej nie ma, pierwsza z zarządu), jak w `playWithGov`; z `wolny`
    tylko osoba, którą ta funkcja przepuszcza, a gdy nikt nie przechodzi, nikt. */
function turaDrewna(
  g: GraAi,
  r: Rece,
  prog: (g: GraAi) => number = () => DREWNA_MIN,
  wolny?: (g: GraAi, p: Pawn) => boolean,
): void {
  const st = g.sim.st;
  if (st.tick % (TICKS_PER_SECOND * CO_SEKUND_DREWNO)) return;
  const godzina = hourOf(st.tick);
  if (godzina < DREWNO_OD_GODZINY || godzina >= DREWNO_DO_GODZINY) return;
  const pam = g.pamiec;
  const drewno = snapshot(st, g.w).stock.wood;
  const ktosScina = st.pawns.some((p) => p.job?.t === 'chop');
  // drzewo z poprzedniego polecenia, którego nikt nie zaczął ścinać, jest nieosiągalne: następnym razem inne
  if (pam.zlecone >= 0 && !ktosScina && !st.felled.includes(pam.zlecone) && !pam.pominieteDrzewa.includes(pam.zlecone))
    pam.pominieteDrzewa.push(pam.zlecone);
  pam.zlecone = -1;
  if (ktosScina || drewno >= prog(g)) return;
  const k = najblizszeDrzewo(g, pam.pominieteDrzewa);
  const zarzad = rdzen(g);
  const nieSpiNieStoi = (p: Pawn): boolean => p.job?.t !== 'sleep' && p.job?.t !== 'guard';
  const kto = wolny ? zarzad.find((p) => nieSpiNieStoi(p) && wolny(g, p)) : (zarzad.find(nieSpiNieStoi) ?? zarzad[0]);
  if (k < 0 || !kto) return;
  r.polecenie({ t: 'chop', ids: [kto.id], tree: k });
  pam.zlecone = k;
}

/** karta nocy, część pierwsza: chorych z warty zdjąć (poniżej ZDROWIE_WARTY zdrowia wartownik schodzi w nocy z posterunku) */
function zdejmijChorychZWarty(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece): void {
  // przydział na żywo z zarządu (p.assign to kopia sprzed zmian), zmiany z tej samej karty widać od razu
  const przydzial = g.gov.night?.assign ?? {};
  for (const osoba of p.card.people)
    if ((przydzial[osoba.id] ?? '').startsWith('warta:') && osoba.needs.health < ZDROWIE_WARTY)
      r.przydziel(osoba.id, 'sen');
}

/** karta nocy, część druga: gdy nikt nie stoi na warcie przy siatce, najbardziej wypoczętego zdrowego dać na pierwszy
    posterunek; dyżurny przy kozie (`warta:koza`) nie jest strażnikiem przy siatce i nie wolno go z dyżuru zdejmować.
    Silnik podstawowy wybiera spośród wszystkich zdrowych, także tych, których karta wysyła na wyprawę (jak bot
    `zawsze-warta`); silnik z warstwami (`tylkoSpiacy`) tylko spośród śpiących, bo wyprawa po jedzenie albo drewno waży
    więcej niż jedna warta, a warstwy mogą ją przydzielić przed wartą. */
function wartaPrzySiatce(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece, tylkoSpiacy = false): void {
  const karta = p.card;
  const przydzial = g.gov.night?.assign ?? {};
  if (Object.values(przydzial).some(isFenceGuard)) return;
  const najlepsza = [...karta.people]
    .filter(
      (o) =>
        o.needs.health >= ZDROWIE_WARTY &&
        przydzial[o.id] !== KOZA_KEY &&
        (!tylkoSpiacy || (przydzial[o.id] ?? 'sen') === 'sen'),
    )
    .sort((a, b) => b.needs.rest - a.needs.rest)[0];
  const posterunek = karta.posts[0]?.key;
  if (najlepsza && posterunek) r.przydziel(najlepsza.id, `warta:${posterunek}`);
}

/** karta nocy z wartą (silnik podstawowy): chorzy z warty, warta przy siatce, zatwierdzenie */
function kartaZWarta(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece): void {
  zdejmijChorychZWarty(g, p, r);
  wartaPrzySiatce(g, p, r);
  r.zatwierdzNoc();
}

/** odpowiedzi na okna zarządu jak bot `zawsze-warta` */
function oknoPodstawowe(g: GraAi, p: Prompt, r: Rece): void {
  if (p.k === 'uchwala') {
    const mozna = p.options.filter((o) => o.s === 'ok');
    r.podpisz(mozna.find((o) => o.id === 'u_warty')?.id ?? mozna[0]?.id ?? null);
  } else if (p.k === 'karta') kartaZWarta(g, p, r);
  else odpowiedzDomyslna(p, r);
}

/** Silnik podstawowy: gra jak bot `zawsze-warta` z tests/unit/gov-play.ts, bez żadnych własnych celów. */
export const silnikPodstawowy: Decydent = {
  start: samouczek,
  okno: oknoPodstawowe,
  tura: turaDrewna,
};

/** Warstwa idzie najwyżej raz na 30 sekund przy ekranie (co CO_TIKOW_WARSTWY ticków; `tura` woła się raz na sekundę), a licznik
    jej wywołań ląduje w pamięci silnika (do sprawdzania kosztu: doba to najwyżej 32 wywołania). */
function uruchomWarstwe(g: GraAi, r: Rece, nazwa: string, warstwa: (g: GraAi, r: Rece) => void): void {
  if (g.sim.st.tick % CO_TIKOW_WARSTWY) return;
  const wywolania = (g.pamiec.wywolania ??= {});
  wywolania[nazwa] = (wywolania[nazwa] ?? 0) + 1;
  warstwa(g, r);
}

/** próg ścinania drzewa w silniku z warstwą zimy: zapas na dwie noce przy obecnej liczbie palenisk */
function progDrewnaZimy(g: GraAi): number {
  return progDrewna(wejscie(g));
}

/** okno zarządu silnika z warstwami: uchwała według potrzeb (`wyborUchwaly`), wydarzenie wybrane na kopii zarządu
    (`odpowiedzNaWydarzenie`, z kolejnymi krokami okna wieloetapowego), karta nocy z dyżurem przy kozie, reszta jak w silniku
    podstawowym (raport, epilog zwycięstwa, okna nowych rodzajów: odpowiedź domyślna). Dyżur ma pierwszeństwo przed wartą
    przy siatce: gdy zdrowych jest mało (głód rozkłada zdrowie od około 9. dnia), ogień w pokoju zarządu trzyma ciepło do rana,
    a bez niego rano marznie cały zarząd i wkurzenie rośnie o 6 punktów na dobę, podczas gdy brak warty kosztuje najwyżej
    napad na zapasy, których wtedy już nie ma. */
function oknoSilnika(g: GraAi, p: Prompt, r: Rece): void {
  if (p.k === 'uchwala') {
    r.podpisz(wyborUchwaly(wejscie(g), p));
    return;
  }
  if (p.k === 'wydarzenie') {
    odpowiedzNaWydarzenie(
      g.gov,
      () => wejscie(g),
      p,
      (k) => r.wybierz(k),
    );
    return;
  }
  if (p.k !== 'karta') {
    oknoPodstawowe(g, p, r);
    return;
  }
  zdejmijChorychZWarty(g, p, r);
  dyzurNaKarcie(g, p, r);
  wartaPrzySiatce(g, p, r, true);
  r.zatwierdzNoc();
}

/** Czy osoba nie ma od karty nocy tej doby wartej, dyżuru przy kozie ani wyprawy: polecenie z potwierdzonej karty rusza dopiero
    w następnym kroku, więc ścinanie zlecone w tej samej sekundzie nadpisałoby je (pomiar: noc 8 w Przymorzu 11, dyżur przy kozie
    zamieniony na ścinanie drzewa, bo drewna było 38 z progu 40). Od 20:00 do północy; rano karta jest już nieaktualna. */
function bezPoleceniaZKarty(g: GraAi, p: Pawn): boolean {
  const st = g.sim.st;
  const noc = g.gov.night;
  if (!noc?.confirmed || noc.day !== dayOf(st.tick) || hourOf(st.tick) < CARD_HOUR) return true;
  const osoba = st.people[p.person]?.id;
  return osoba === undefined || (noc.assign[osoba] ?? 'sen') === 'sen';
}

/** tura silnika: drewno co 10 sekund za dnia (z progiem na dwie noce), warstwy zimy, jedzenia i rozwoju co 30 sekund (zima
    pierwsza: plan kozy z beczki ma pierwszeństwo przed ogródkiem, gdy deski są na jedno z nich, a rozwój nie zaczyna budowy,
    dopóki zima ma swoje do zrobienia) */
function turaSilnika(g: GraAi, r: Rece): void {
  turaDrewna(g, r, progDrewnaZimy, bezPoleceniaZKarty);
  uruchomWarstwe(g, r, 'zima', turaZimy);
  uruchomWarstwe(g, r, 'jedzenie', turaJedzenia);
  uruchomWarstwe(g, r, 'rozwoj', turaRozwoju);
}

/** Decydent, którego używa uprząż: silnik podstawowy plus warstwy zimy, jedzenia i rozwoju oraz okna zarządu z src/ai/okna.ts. */
export const silnik: Decydent = {
  start: samouczek,
  okno: oknoSilnika,
  tura: turaSilnika,
};
