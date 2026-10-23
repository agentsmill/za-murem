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
   dokładają edycją tego pliku. Dziś jest to warstwa zimy (src/ai/zima.ts, zadanie 3):
   - tura: ścinanie drzewa na opał jak w silniku podstawowym, ale już poniżej zapasu na dwie noce (`progDrewna`), nie
     dopiero poniżej 6 sztuk; do tego `turaZimy` (pracownia, badanie kozy, koza z beczki w pokoju zarządu) co 30 sekund
     przy ekranie (`CO_TIKOW_WARSTWY`), a licznik jej wywołań siedzi w pamięci (`PamiecSilnika.wywolania`);
   - okno karty nocy: chorzy zdjęci z warty jak w silniku podstawowym, potem dyżur przy kozie (`dyzurNaKarcie`), dopiero
     potem wartownik przy siatce, wybierany spośród śpiących (kolejność odwrócona względem silnika podstawowego: przy mało
     zdrowych dyżur ma pierwszeństwo, a wyprawy nie tracą ludzi na wartę), na końcu zatwierdzenie; reszta okien jak
     w silniku podstawowym.
   Warstwy idą w kolejności dopisywania i najwyżej raz na 30 sekund przy ekranie, poza oknami zarządu, które dostają
   odpowiedź od razu. Silnik podstawowy niczego z warstw nie używa i dalej odtwarza `playWithGov` co do skrótu.

   Cała pamięć silnika siedzi w `GraAi.pamiec`, zwykłym JSON z zapisem gry: decydenci nie mają stanu w zamknięciach ani na
   poziomie modułu, więc wczytana gra decyduje tak samo jak bez przerwy, a dwie gry w jednym procesie się nie mieszają.
   Silnik czyta tylko stan swojej gry i działa tylko rękami; bez losowania, zegara, DOM i modułów Node.

   Moduły gra.ts i silnik.ts importują się nawzajem (gra.ts bierze stąd `nowaPamiec`, silnik.ts z gra.ts `odpowiedzDomyslna`
   i `wejscie`), a warstwy (zima.ts) importują gra.ts i są importowane przez silnik.ts. Cykl jest bezpieczny, bo wszystkie
   strony używają importów tylko w ciele funkcji; warstwy dopisywane do `silnik` mają więc być deklaracjami funkcji, a nie
   stałymi liczonymi przy ładowaniu modułu z cudzych importów. */

import { isFenceGuard, KOZA_KEY } from '../gov/noc.ts';
import type { Prompt } from '../gov/typy.ts';
import { hourOf, TICKS_PER_SECOND } from '../sim/clock.ts';
import { dryTreeOf } from '../sim/house.ts';
import { commandFor } from '../sim/orders.ts';
import { type Pawn, trunkOf } from '../sim/sim.ts';
import { snapshot } from '../sim/snapshot.ts';
import { type Decydent, type GraAi, odpowiedzDomyslna, type Rece, wejscie } from './gra.ts';
import { dyzurNaKarcie, type PamiecZimy, progDrewna, turaZimy } from './zima.ts';

/** Pamięć silnika: zwykły JSON, wchodzi do zapisu i do skrótu gry. Warstwy dopisują swoje pola (opcjonalne, z wartością
    domyślną przy pierwszym użyciu), żeby zapis sprzed warstwy dalej się wczytywał. */
export interface PamiecSilnika {
  v: 1;
  /** drzewa (indeksy w `w.trees`), do których nikt nie doszedł, więc ścinanie ich pomija */
  pominieteDrzewa: number[];
  /** drzewo z ostatniego polecenia ścinania (−1: brak) */
  zlecone: number;
  /** ile razy ruszyła każda warstwa (klucz to jej nazwa: 'zima'); pole powstaje przy pierwszym użyciu */
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
    po przejściu bramek czasu, więc koszt jego wyliczenia płaci się tylko co CO_SEKUND_DREWNO sekund za dnia */
function turaDrewna(g: GraAi, r: Rece, prog: (g: GraAi) => number = () => DREWNA_MIN): void {
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
  const kto = zarzad.find((p) => p.job?.t !== 'sleep' && p.job?.t !== 'guard') ?? zarzad[0];
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

/** okno zarządu silnika z warstwą zimy: karta nocy z dyżurem przy kozie, reszta jak w silniku podstawowym. Dyżur ma
    pierwszeństwo przed wartą przy siatce: gdy zdrowych jest mało (głód rozkłada zdrowie od około 9. dnia), ogień w pokoju
    zarządu trzyma ciepło do rana, a bez niego rano marznie cały zarząd i wkurzenie rośnie o 6 punktów na dobę, podczas gdy
    brak warty kosztuje najwyżej napad na zapasy, których wtedy już nie ma. */
function oknoSilnika(g: GraAi, p: Prompt, r: Rece): void {
  if (p.k !== 'karta') {
    oknoPodstawowe(g, p, r);
    return;
  }
  zdejmijChorychZWarty(g, p, r);
  dyzurNaKarcie(g, p, r);
  wartaPrzySiatce(g, p, r, true);
  r.zatwierdzNoc();
}

/** tura silnika: drewno co 10 sekund za dnia (z progiem na dwie noce), warstwy co 30 sekund */
function turaSilnika(g: GraAi, r: Rece): void {
  turaDrewna(g, r, progDrewnaZimy);
  uruchomWarstwe(g, r, 'zima', turaZimy);
}

/** Decydent, którego używa uprząż: silnik podstawowy plus warstwa zimy (kolejne zadania dokładają jedzenie, rozwój i okna). */
export const silnik: Decydent = {
  start: samouczek,
  okno: oknoSilnika,
  tura: turaSilnika,
};
