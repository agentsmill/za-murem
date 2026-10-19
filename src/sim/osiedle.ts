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
   zawartość pustych mieszkań (zepsute meble, śmieci, uszkodzenia) wychodzi z ziarna mieszkania i powodu. Każdy zapis
   ze stanami mieszkań dostaje więc na świat stany z zapisu (`stanyZapisu`): świat jest taki jak na starcie tej gry,
   bez liczenia stanów od nowa i bez tabel, także gdy gra z generatorem nie ma już osób z generatora (własna drużyna,
   mieszkańcy bez osób). Zapis sprzed kroku 5 ma stany M2, takie same jak świat, więc nic się nie zmienia. Generator
   przy wznowieniu daje tylko budynek siedziby do imion i historii (`mieszkancyZapisu`, tylko dla zapisu z osobami
   z generatora), bez nowego `createSim`.

   Ludność z 2021 roku (`ludnoscSpisu2021`). Z tych samych tabel, bez nowego pobierania: ilu ludzi mieszkało w kwadracie
   domu według spisu. Liczy z niej cel drogi ludnościowej zarząd (warunki zwycięstwa, src/gov/zwyciestwo.ts); gra podaje ją
   w odczycie (`GovInput.ludnosc2021`), a bez tabel cel zarządu to 250.

   Deterministyczne: te same dane osiedla, ziarno i tabele dają ten sam świat i te same osoby; bez DOM i sieci. */

import { budynkiZCzlonkami } from '../mieszkancy/budynki.ts';
import { budynkiObszaru } from '../mieszkancy/generuj.ts';
import { oznaczGeo } from '../mieszkancy/oznacz.ts';
import { marginesyDla } from '../mieszkancy/rejon.ts';
import { obsadzBudynek } from '../mieszkancy/spis.ts';
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

/** Ilu ludzi mieszkało w kwadracie domu w 2021 roku według spisu (NSP), z czego zarząd liczy cel drogi ludnościowej
    (`GovInput.ludnosc2021`, src/gov/zwyciestwo.ts). Osoby wszystkich budynków mieszkalnych obszaru gry (`budynkiObszaru`,
    reguła R22 generatora), każdy obsadzony na spis (`obsadzBudynek`: marginesy rejonu budynku, bez gminy marginesy
    Polski), bez postarzania do 2051, imion i historii, więc to dziesiątki milisekund i żadnego pobierania (tabele są
    już w `dane`). Siedziba spoza budynków generatora (na demach tylko Przymorze) do sumy nie wchodzi.
    `undefined` bez tabel (`dane === null`), po wyjątku (z ostrzeżeniem w konsoli) i gdy w obszarze nie ma nikogo:
    zarząd bierze wtedy cel jak bez danych. Czysta i deterministyczna (ziarna spisu z `losDla`), niczego nie zmienia. */
export function ludnoscSpisu2021(geo: Geo, dane: DaneMieszkancow | null): number | undefined {
  if (!dane) return undefined;
  try {
    const { gmina, kraj } = dane;
    let ludzie = 0;
    for (const b of budynkiObszaru(geo, gmina, kraj))
      ludzie += obsadzBudynek(b, gmina ? marginesyDla(gmina, b.rejon) : kraj.polska, gmina, kraj).osoby.length;
    return ludzie > 0 ? ludzie : undefined;
  } catch (e) {
    console.warn('Mieszkańcy z adresu: nie da się policzyć ludności z 2021 roku, cel drogi ludnościowej bez danych', e);
    return undefined;
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

/** Wznowienie zapisu `st` na świecie odtworzonym z danych osiedla. Zapis ze stanami mieszkań: stany z zapisu na
    świecie (`stanyZapisu`; także bez tabel i bez osób z generatora; zapis sprzed kroku 5 ma te same stany M2 co
    świat). Zapis z osobami z generatora: budynek siedziby z generatora do imion i historii (bez tabel albo po wyjątku
    `null`, a gra i tak się wczytuje: osoby są w zapisie); bez nich `null`. Zarząd z generatora nie jest tu potrzebny
    (osoby są w zapisie). */
export function mieszkancyZapisu(
  world: World,
  geo: Geo,
  dane: DaneMieszkancow | null,
  st: Pick<SimState, 'people' | 'apts'>,
): LokatorzyGry | null {
  if (st.apts?.length) applyApts(world, settleApts(world, stanyZapisu(st, world.hq)));
  if (!zGeneratora(st)) return null;
  return dane ? lokatorzy(world, geo, dane, 0) : null;
}
