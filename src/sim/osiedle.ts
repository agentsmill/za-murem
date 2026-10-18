/* Świat gry z mieszkańcami siedziby z generatora (krok 5, spec §9): droga od danych osiedla i tabel mieszkańców do
   świata i osób, wspólna dla gry (src/main.ts) i botów. Kolejność jak w lokatorzy-sim.test.ts: tagi `zm:bud` na
   mapie (`mapaMieszkancow`) przed `buildWorld`, `lokatorzyGry` na gotowym świecie, stany mieszkań siedziby z
   generatora na świecie (`applyApts`), dopiero potem scena i `createSim` z opcją `mieszkancy` (`opcjaMieszkancow`).

   Stara ścieżka. Bez tabel (`dane === null`) albo po wyjątku w oznaczaniu, w generatorze albo w `createSim` z osobami
   z generatora (złapanym, z ostrzeżeniem w konsoli; po stanach z generatora świat wraca do M2 przez `stanyM2`) gra
   idzie jak przed krokiem 5: stany mieszkań z ziarna świata (M2), osoby z `makePerson`. Tagi nie
   zmieniają świata poza samymi tagami w `WorldBuilding.tags` (test w osiedle.test.ts), więc świat z oznaczonej mapy
   zostaje także po wyjątku w generatorze i pasuje do zapisów sprzed kroku 5 (ten sam `worldKey`).

   Wznowienie zapisu. Symulacja nie zmienia stanów mieszkań (`st.apts`: stan, powód i rok z chwili startu), a
   zawartość pustych mieszkań (zepsute meble, śmieci, uszkodzenia) wychodzi z ziarna mieszkania i powodu. Zapis z
   osobami z generatora (`zGeneratora`) dostaje więc na świat stany z zapisu (`stanyZapisu`): świat jest taki jak na
   starcie tej gry, bez liczenia stanów od nowa i bez tabel. Zapis sprzed kroku 5 zostaje przy stanach M2 ze świata,
   z którymi powstał. Generator przy wznowieniu daje tylko budynek siedziby do imion i historii (`mieszkancyZapisu`),
   bez nowego `createSim`.

   Deterministyczne: te same dane osiedla, ziarno i tabele dają ten sam świat i te same osoby; bez DOM i sieci. */

import { budynkiZCzlonkami } from '../mieszkancy/budynki.ts';
import { oznaczGeo } from '../mieszkancy/oznacz.ts';
import type { DaneMieszkancow } from '../mieszkancy/wczytaj.ts';
import { type AptState, applyApts, settleApts } from '../world/apts.ts';
import type { Geo } from '../world/geo.ts';
import type { World } from '../world/world.ts';
import { type LokatorzyGry, lokatorzyGry } from './lokatorzy.ts';
import type { SimOpts, SimState } from './sim.ts';

/** Mapa z tagiem `zm:bud` na segmentach budynków generatora. Bez tabel albo po wyjątku ta sama mapa (z ostrzeżeniem).
    Wejście zostaje nietknięte. */
export function mapaMieszkancow(geo: Geo, dane: DaneMieszkancow | null): Geo {
  if (!dane) return geo;
  try {
    return oznaczGeo(geo, budynkiZCzlonkami(geo, dane.gmina, dane.kraj));
  } catch (e) {
    console.warn('Mieszkańcy z adresu: nie da się oznaczyć budynków, gra bez mieszkańców z generatora', e);
    return geo;
  }
}

/** `lokatorzyGry` bez wyjątków: `null` z ostrzeżeniem */
function lokatorzy(world: World, geo: Geo, dane: DaneMieszkancow, core: number): LokatorzyGry | null {
  try {
    return lokatorzyGry(world, geo, dane, { core });
  } catch (e) {
    console.warn('Mieszkańcy z adresu: generator się nie udał, gra bez mieszkańców z generatora', e);
    return null;
  }
}

/** Nowa gra: zarząd (najwyżej `core` osób), lokatorzy i stany mieszkań siedziby z generatora. Stany od razu idą na
    świat (`applyApts`), więc scena i `createSim` widzą mieszkania z generatora. `null` (bez tabel, bez siedziby,
    po wyjątku): stara ścieżka, świat nietknięty. `geo` to mapa, z której powstał świat (`mapaMieszkancow`). */
export function mieszkancyNowejGry(
  world: World,
  geo: Geo,
  dane: DaneMieszkancow | null,
  core: number,
): LokatorzyGry | null {
  if (!dane) return null;
  const l = lokatorzy(world, geo, dane, core);
  if (!l) return null;
  try {
    applyApts(world, settleApts(world, l.stany));
  } catch (e) {
    console.warn('Mieszkańcy z adresu: stany mieszkań z generatora się nie udały, gra bez mieszkańców z generatora', e);
    return null;
  }
  return l;
}

/** Powrót do starej ścieżki po stanach z generatora (np. gdy `createSim` z opcją `mieszkancy` rzuci): stany mieszkań
    siedziby z ziarna świata (M2), czyli świat taki, jaki zostawia `buildWorld`. */
export function stanyM2(world: World): void {
  applyApts(world, settleApts(world));
}

/** Opcja `mieszkancy` dla `createSim` z wyniku generatora. */
export const opcjaMieszkancow = (l: LokatorzyGry): NonNullable<SimOpts['mieszkancy']> => ({
  zarzad: l.zarzad,
  lokatorzy: l.lokatorzy,
});

/** Czy stan gry ma osoby z generatora mieszkańców (gra zaczęta z krokiem 5, z tabelami). */
export const zGeneratora = (st: Pick<SimState, 'people'>): boolean => st.people.some((p) => p.ref !== undefined);

/** Stany mieszkań siedziby `bid` ze stanu gry (`st.apts`) w kształcie dla `settleApts`: stan, a pustego powód i rok. */
export function stanyZapisu(st: Pick<SimState, 'apts'>, bid: number): AptState[] {
  return (st.apts ?? []).map((g) => {
    const s: AptState = { bid, apt: g.apt, state: g.state };
    if (g.why) s.why = g.why;
    if (g.year !== undefined) s.year = g.year;
    return s;
  });
}

/** Wznowienie zapisu `st` na świecie odtworzonym z danych osiedla. Zapis z osobami z generatora: stany mieszkań
    z zapisu na świecie (`stanyZapisu`; także bez tabel) i budynek siedziby z generatora do imion i historii (bez
    tabel albo po wyjątku `null`, a gra i tak się wczytuje: osoby są w zapisie). Zapis bez nich: `null`, świat
    nietknięty (stany M2, z którymi zapis powstał). Zarząd z generatora nie jest tu potrzebny (osoby są w zapisie). */
export function mieszkancyZapisu(
  world: World,
  geo: Geo,
  dane: DaneMieszkancow | null,
  st: Pick<SimState, 'people' | 'apts'>,
): LokatorzyGry | null {
  if (!zGeneratora(st)) return null;
  applyApts(world, settleApts(world, stanyZapisu(st, world.hq)));
  return dane ? lokatorzy(world, geo, dane, 0) : null;
}
