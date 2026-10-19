/* Przebieg gry do porównań silników JS (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md). Jeden ustalony
   scenariusz, który tym samym kodem chodzi w Node, na stronie testowej w Chromium, Firefoksie i WebKicie (tools/
   determinizm/strona.ts) i w systemowym jsc z macOS (paczka z wejscie-jsc.ts), a tools/determinizm.ts porównuje
   skróty. Moduł jest czysty: bez node:*, DOM, sieci i zegara, a losowanie idzie tylko z ziarna w stanie gry.

   Scenariusz: świat z geo osiedla (`buildWorld`), symulacja z zarządem 4 osób i handlarzem pod bramą jak w grze
   (`createSim`), zarząd (`newGov`) z polityką „zawsze warta” jak w tests/unit/gov-play.ts: zarząd co sekundę przy
   ekranie (1×), okna odpowiadane od razu (raport przeczytany, uchwała o wartach albo pierwsza możliwa, karta nocy
   z jedną osobą na warcie, wydarzenie: pierwszy wybór, który się opłaca). Do tego stałe polecenia: w kroku 0 zaznaczenie
   i ścięcie suchego drzewa (samouczek), a w drugiej dobie, od 8:00, przeszukanie pierwszego pomieszczenia, które wolno
   przeszukać. Bez tłumu, bez mieszkańców z generatora i bez mapy miasta: to, co zmienia skróty, a nie rozmiar przebiegu.

   `graj` liczy `godziny` godzin gry (800 kroków na godzinę, gra startuje o 15:00 dnia 1) i po każdej pełnej godzinie
   zapisuje `sim.hash()`; `przebieg` oddaje same skróty. Hak `krok(tick)` jest wołany przed każdym krokiem symulacji
   (tick to numer kroku od 0): tędy podpina się nagrywanie wywołań Math (nagrywanie.ts); hak niczego nie zmienia. */

import { hashString } from '../../src/core/rng.ts';
import type { GovState, Prompt } from '../../src/gov/zarzad.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../../src/gov/zarzad.ts';
import { dayOf, hourOf, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput, lawsFrom } from '../../src/sim/gov.ts';
import { dryTreeOf, houseOf } from '../../src/sim/house.ts';
import { searchable } from '../../src/sim/mieszkania.ts';
import { commandFor } from '../../src/sim/orders.ts';
import { createSim, Sim, trunkOf } from '../../src/sim/sim.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

export interface DanePrzebiegu {
  geo: Geo;
  seed: number;
  /** ile godzin gry (jeden skrót na każdą pełną godzinę) */
  godziny: number;
  tryb: 'zwykly' | 'zombie';
  /** ulica z geokodera (nazwa siedziby), jak w demach: public/demo/<klucz>.json */
  street?: string;
}

export interface HakiPrzebiegu {
  /** przed budową świata z tickiem −1 (żeby nagranie mogło objąć też budowę świata), potem przed każdym krokiem
      symulacji; tick to numer kroku (st.tick przed krokiem), od 0 */
  krok?(tick: number): void;
}

export interface WynikGry {
  /** sim.hash() po każdej pełnej godzinie gry */
  skroty: string[];
  swiat: World;
  sim: Sim;
  gov: GovState;
}

/** zdrowia, od którego gracz wystawia kogoś na wartę (jak GUARD_HEALTH w tests/unit/gov-play.ts) */
const ZDROWIE_NA_WARTE = 40;
/** od której godziny drugiej doby szuka się pomieszczenia do przeszukania */
const GODZINA_PRZESZUKANIA = 8;

/** odpowiedź na okno zarządu według polityki „zawsze warta”; skutki idą do symulacji */
function odpowiedz(gov: GovState, sim: Sim, swiat: World, p: Prompt, sekunda: number): void {
  const st = sim.st;
  const wejscie = govInput(st, swiat, sekunda);
  if (p.k === 'raport') {
    ackReport(gov, wejscie);
    return;
  }
  if (p.k === 'uchwala') {
    const mozliwe = p.options.filter((o) => o.s === 'ok');
    const id = (mozliwe.find((o) => o.id === 'u_warty') ?? mozliwe[0])?.id ?? null;
    applyGov(st, swiat, signLaw(gov, wejscie, id));
    sim.setLaws(lawsFrom(lawEffects(gov)));
    return;
  }
  if (p.k === 'karta') {
    const przydzial = gov.night!.assign;
    // chorego na wartę się nie wystawia: w symulacji zszedłby z posterunku
    for (const o of p.card.people)
      if ((przydzial[o.id] ?? '').startsWith('warta:') && o.needs.health < ZDROWIE_NA_WARTE) setNight(gov, o.id, 'sen');
    if (!Object.values(przydzial).some((k) => k.startsWith('warta:'))) {
      const najlepszy = [...p.card.people]
        .filter((o) => o.needs.health >= ZDROWIE_NA_WARTE)
        .sort((a, b) => b.needs.rest - a.needs.rest)[0];
      if (najlepszy) setNight(gov, najlepszy.id, `warta:${p.card.posts[0].key}`);
    }
    applyGov(st, swiat, confirmNight(gov, wejscie));
    return;
  }
  const k = p.choices.findIndex((c) => c.ok);
  applyGov(st, swiat, chooseEvent(gov, wejscie, Math.max(0, k)));
}

/** polecenie przeszukania pierwszego pomieszczenia, które wolno przeszukać, wolną osobą z zarządu; true, gdy poszło
    (albo nie ma czego szukać), false, gdy nikt nie jest wolny i trzeba spróbować za sekundę */
function przeszukaj(sim: Sim, swiat: World): boolean {
  const dom = houseOf(swiat);
  if (!dom) return true;
  const st = sim.st;
  const stan = (apt: number) => st.apts.find((a) => a.apt === apt);
  const pokoj = dom.rooms.find((r) => {
    const g = stan(r.apt);
    return !!g && searchable(swiat, g) && !g.searched.includes(r.id);
  });
  if (!pokoj) return true;
  const wolny = st.pawns.find((p) => p.kind === 'core' && !p.away && (!p.job || (!p.job.order && p.job.t === 'warm')));
  if (!wolny) return false;
  sim.push({ t: 'search', ids: [wolny.id], room: pokoj.id });
  return true;
}

export function graj(d: DanePrzebiegu, haki: HakiPrzebiegu = {}): WynikGry {
  haki.krok?.(-1);
  const swiat = buildWorld(d.geo, { seed: d.seed, street: d.street });
  const st = createSim(swiat, d.seed, { core: 4, mode: d.tryb, obcy: true });
  const sim = new Sim(swiat, st);
  const gov = newGov(d.seed, d.tryb);
  const skroty: string[] = [];

  // samouczek: zaznaczyć kogoś z zarządu i kliknąć suche drzewo
  const suche = dryTreeOf(swiat);
  if (suche >= 0) {
    const kto = st.pawns.find((p) => p.kind === 'core' && !p.away)!;
    sim.push({ t: 'select', ids: [kto.id] });
    const c = commandFor(st, swiat, [kto.id], trunkOf(swiat, swiat.trees[suche]));
    if (c) sim.push(c);
  }

  let przeszukane = false;
  const koniec = d.godziny * TICKS_PER_HOUR;
  while (st.tick < koniec) {
    haki.krok?.(st.tick);
    sim.step();
    if (st.tick % TICKS_PER_SECOND === 0) {
      const sekunda = st.tick / TICKS_PER_SECOND;
      applyGov(st, swiat, govUpdate(gov, govInput(st, swiat, sekunda)));
      for (let k = 0; k < 5 && !gov.over; k++) {
        const p = pending(gov, govInput(st, swiat, sekunda));
        if (!p) break;
        odpowiedz(gov, sim, swiat, p, sekunda);
      }
      if (!przeszukane && dayOf(st.tick) >= 2 && hourOf(st.tick) >= GODZINA_PRZESZUKANIA)
        przeszukane = przeszukaj(sim, swiat);
    }
    if (st.tick % TICKS_PER_HOUR === 0) skroty.push(sim.hash());
  }
  return { skroty, swiat, sim, gov };
}

/** skróty stanu gry po każdej pełnej godzinie gry */
export function przebieg(d: DanePrzebiegu, haki: HakiPrzebiegu = {}): string[] {
  return graj(d, haki).skroty;
}

/** zapis świata do skrótu: tablice typowane jako liczby po przecinku, Map i Set jako listy */
const kanoniczny = (_klucz: string, v: unknown): unknown => {
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>).join(',');
  if (v instanceof Map || v instanceof Set) return [...v];
  return v;
};

/** skrót świata zaraz po zbudowaniu: kafelki, budynki, drzewa, wnętrze siedziby, siatka i reszta. Skrót stanu gry
    (sim.hash) świata nie obejmuje, a klient i serwer muszą budować ten sam świat z tych samych danych, więc tools/
    determinizm.ts porównuje też ten skrót: rozbieżność w nim to rozbieżność w buildWorld, nie w kroku symulacji. */
export function skrotSwiata(swiat: World): string {
  return hashString(JSON.stringify(swiat, kanoniczny));
}

/** Skróty części świata, żeby rozbieżność skrotSwiata dała się nazwać: `kafelki` (teren, numery budynków, przejścia),
    `budynki`, `drzewa` (pozycje z ułamkiem), `kat` (obrót mapy, liczba zmiennoprzecinkowa) i `reszta` (siedziba, wnętrze,
    rzeczy na podwórku, siatka, stany mieszkań). Różny tylko `kat` albo `drzewa` to różnica ostatnich bitów liczb, a nie
    innej mapy; różne `kafelki` to prawdziwie inny świat. */
export function czesciSwiata(swiat: World): Record<'kafelki' | 'budynki' | 'drzewa' | 'kat' | 'reszta', string> {
  const { terr, bid, blocked, buildings, trees, angle, ...reszta } = swiat;
  const h = (v: unknown) => hashString(JSON.stringify(v, kanoniczny));
  return {
    kafelki: h([terr, bid, blocked]),
    budynki: h(buildings),
    drzewa: h(trees),
    kat: h(angle),
    reszta: h(reszta),
  };
}
