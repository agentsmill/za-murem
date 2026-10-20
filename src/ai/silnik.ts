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

   `silnik` to decydent, którego używa uprząż (`npm run bot:osada`); w zadaniu 1 jest równy silnikowi podstawowemu, kolejne
   zadania składają go z warstw (zima, jedzenie, rozwój, okna zarządu) edycją tego pliku.

   Cała pamięć silnika siedzi w `GraAi.pamiec`, zwykłym JSON z zapisem gry: decydenci nie mają stanu w zamknięciach ani na
   poziomie modułu, więc wczytana gra decyduje tak samo jak bez przerwy, a dwie gry w jednym procesie się nie mieszają.
   Silnik czyta tylko stan swojej gry i działa tylko rękami; bez `Math.random`, czasu, DOM i modułów Node. */

import type { Prompt } from '../gov/typy.ts';
import { hourOf, TICKS_PER_SECOND } from '../sim/clock.ts';
import { dryTreeOf } from '../sim/house.ts';
import { commandFor } from '../sim/orders.ts';
import { type Pawn, trunkOf } from '../sim/sim.ts';
import { snapshot } from '../sim/snapshot.ts';
import { type Decydent, type GraAi, odpowiedzDomyslna, type Rece } from './gra.ts';

/** Pamięć silnika: zwykły JSON, wchodzi do zapisu i do skrótu gry. Warstwy dopisują swoje pola (opcjonalne, z wartością
    domyślną przy pierwszym użyciu), żeby zapis sprzed warstwy dalej się wczytywał. */
export interface PamiecSilnika {
  v: 1;
  /** drzewa (indeksy w `w.trees`), do których nikt nie doszedł, więc ścinanie ich pomija */
  pominieteDrzewa: number[];
  /** drzewo z ostatniego polecenia ścinania (−1: brak) */
  zlecone: number;
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
/** poniżej tylu sztuk drewna zarząd ścina drzewo na opał */
const DREWNA_MIN = 6;

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

/** drewno na opał: gdy zostaje mało, następne drzewo */
function turaDrewna(g: GraAi, r: Rece): void {
  const st = g.sim.st;
  if (st.tick % (TICKS_PER_SECOND * CO_SEKUND_DREWNO)) return;
  const godzina = hourOf(st.tick);
  if (godzina < DREWNO_OD_GODZINY || godzina >= DREWNO_DO_GODZINY) return;
  const pam = g.pamiec;
  const drewno = snapshot(st, g.w).stock.wood;
  const sciana = st.pawns.some((p) => p.job?.t === 'chop');
  // drzewo z poprzedniego polecenia, którego nikt nie zaczął ścinać, jest nieosiągalne: następnym razem inne
  if (pam.zlecone >= 0 && !sciana && !st.felled.includes(pam.zlecone) && !pam.pominieteDrzewa.includes(pam.zlecone))
    pam.pominieteDrzewa.push(pam.zlecone);
  pam.zlecone = -1;
  if (drewno >= DREWNA_MIN || sciana) return;
  const k = najblizszeDrzewo(g, pam.pominieteDrzewa);
  const zarzad = rdzen(g);
  const kto = zarzad.find((p) => p.job?.t !== 'sleep' && p.job?.t !== 'guard') ?? zarzad[0];
  if (k < 0 || !kto) return;
  r.polecenie({ t: 'chop', ids: [kto.id], tree: k });
  pam.zlecone = k;
}

/** karta nocy z wartą: chorych z warty zdjąć, a gdy nikt nie stoi, najbardziej wypoczętego zdrowego dać na pierwszy
    posterunek; potem zatwierdzić */
function kartaZWarta(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece): void {
  const karta = p.card;
  // przydział na żywo z zarządu (p.assign to kopia sprzed zmian), zmiany z tej samej karty widać od razu
  const przydzial = g.gov.night?.assign ?? {};
  for (const osoba of karta.people)
    if ((przydzial[osoba.id] ?? '').startsWith('warta:') && osoba.needs.health < ZDROWIE_WARTY)
      r.przydziel(osoba.id, 'sen');
  if (!Object.values(przydzial).some((klucz) => klucz.startsWith('warta:'))) {
    const najlepsza = [...karta.people]
      .filter((o) => o.needs.health >= ZDROWIE_WARTY)
      .sort((a, b) => b.needs.rest - a.needs.rest)[0];
    const posterunek = karta.posts[0]?.key;
    if (najlepsza && posterunek) r.przydziel(najlepsza.id, `warta:${posterunek}`);
  }
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

/** Decydent, którego używa uprząż: w zadaniu 1 równy silnikowi podstawowemu, kolejne zadania składają go z warstw. */
export const silnik: Decydent = silnikPodstawowy;
