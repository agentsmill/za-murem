/* Wspólne dla botów (bot.ts, bot-zombie.ts): flaga `--mieszkancy`, czyli gra z zarządem i mieszkańcami siedziby
   z generatora mieszkańców (krok 5), tą samą drogą co w grze (src/sim/osiedle.ts): tabele z public/data/mieszkancy/
   przez `fs`, tagi `zm:bud` na mapie, `buildWorld`, `lokatorzyGry` i stany mieszkań siedziby na świecie, a wynik idzie
   do `createSim` jako opcja `mieszkancy`. Bez flagi boty nie dotykają niczego stąd poza odczytem argumentów, więc ich
   wyjście i skróty są takie jak przed krokiem 5.
   Flaga może stać gdziekolwiek wśród argumentów; `ARGUMENTY` to argumenty pozycyjne bez flag (ziarno, dni, tłum…).
   Druga flaga, `--sasiedzi` (M2 fala 2), włącza w botach gracza, który od dnia 2 chodzi do sąsiednich budynków
   (tests/unit/sasiedzi-play.ts). Trzecia, `--miasto` (mapa miasta), włącza w zwykłym bocie (tools/bot.ts) gracza
   wypraw dziennych do miejsc z okolicy (tests/unit/miasto-play.ts); bot trybu zombie jej nie zna i kończy z błędem
   (`bezMiasta`). Dwie ostatnie znają tylko bot trybu zombie, a pozostałe boty kończą z błędem, kiedy je dostaną
   (`tylkoZombie`): `--demo=NAZWA` (przymorze, lanciego, zielonki) wybiera osiedle, `--opal` dokłada do kozy
   z niczego, jakby opału nie brakowało. Inny argument od `--` (literówka, np. `--mieszkanc`) kończy bota z błędem,
   zamiast cicho zagrać bez tego, o co chodziło.
   Ziarno świata to ziarno bota (nie z adresu jak w grze), żeby przebiegi z flagą i bez niej były porównywalne. */

import fs from 'node:fs';
import path from 'node:path';
import { wczytajDaneMieszkancow } from '../src/mieszkancy/wczytaj.ts';
import { mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../src/sim/osiedle.ts';
import type { SimOpts, SimState } from '../src/sim/sim.ts';
import type { Geo } from '../src/world/geo.ts';
import { buildWorld, type World } from '../src/world/world.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const FLAGA = '--mieszkancy';
const FLAGA_SASIEDZI = '--sasiedzi';
const FLAGA_MIASTO = '--miasto';
const FLAGA_OPAL = '--opal';
const FLAGI = [FLAGA, FLAGA_SASIEDZI, FLAGA_MIASTO, FLAGA_OPAL];

const FLAGA_DEMO = '--demo=';
const jestDemo = (a: string) => a.startsWith(FLAGA_DEMO);

const nieznane = process.argv.slice(2).filter((a) => a.startsWith('--') && !FLAGI.includes(a) && !jestDemo(a));
if (nieznane.length) {
  console.error(
    `Nieznany argument: ${nieznane.join(', ')}. Bot zna tylko flagi ${FLAGI.join(' i ')} oraz ${FLAGA_DEMO}NAZWA (reszta to liczby).`,
  );
  process.exit(2);
}

/** Osiedle z `--demo=NAZWA` albo null (bot gra na Przymorzu). Nazwa musi mieć plik w public/demo/. */
export const DEMO: string | null = process.argv.find(jestDemo)?.slice(FLAGA_DEMO.length) ?? null;
if (DEMO !== null && !/^[a-z]+$/.test(DEMO)) {
  console.error(`Nieznane demo: „${DEMO}”. Dema to pliki public/demo/*.json (przymorze, lanciego, zielonki).`);
  process.exit(2);
}

/** Czy bot ma dokładać do kozy z niczego (tylko bot trybu zombie: mierzy siatkę i wartę bez wpływu zimna). */
export const OPAL = process.argv.includes(FLAGA_OPAL);

/** Boty bez `--demo=` i `--opal` kończą z błędem, kiedy je dostaną, zamiast cicho zagrać bez nich. */
export function tylkoZombie(bot: string): void {
  if (DEMO === null && !OPAL) return;
  console.error(`${bot} nie zna ${DEMO === null ? FLAGA_OPAL : `${FLAGA_DEMO}NAZWA`} (tylko bot trybu zombie).`);
  process.exit(2);
}

/** Czy bot ma grać z mieszkańcami z adresu. */
export const MIESZKANCY = process.argv.includes(FLAGA);
/** Czy bot ma chodzić do sąsiednich budynków (M2 fala 2). */
export const SASIEDZI = process.argv.includes(FLAGA_SASIEDZI);
/** Czy bot ma wysyłać wyprawy dzienne do miejsc z mapy miasta (tylko zwykły bot, tools/bot.ts). */
export const MIASTO = process.argv.includes(FLAGA_MIASTO);

/** Bot trybu zombie nie zna `--miasto`: kończy z błędem, zamiast cicho zagrać bez wypraw z mapy miasta. */
export function bezMiasta(bot: string): void {
  if (!MIASTO) return;
  console.error(`${bot} nie zna ${FLAGA_MIASTO} (wyprawy z mapy miasta gra tylko zwykły bot: npm run bot).`);
  process.exit(2);
}

/** Argumenty pozycyjne bez flag: `ARGUMENTY[0]` to pierwszy argument po nazwie skryptu. */
export const ARGUMENTY: string[] = process.argv.slice(2).filter((a) => !FLAGI.includes(a) && !jestDemo(a));

/** `fetch` dla wczytaj.ts: ścieżka względna to plik w public/, brak pliku to 404. */
const zPliku: typeof fetch = async (adres) => {
  const plik = path.join(PUBLIC, String(adres));
  return fs.existsSync(plik) ? new Response(fs.readFileSync(plik)) : new Response(null, { status: 404 });
};

export interface SwiatMieszkancow {
  /** świat z mapy z tagami generatora i stanami mieszkań siedziby z generatora */
  world: World;
  /** opcja `mieszkancy` dla `createSim` na tym świecie */
  mieszkancy: NonNullable<SimOpts['mieszkancy']>;
}

/** Świat dema z mieszkańcami z generatora (zarząd do `core` osób). Rzuca, gdy brakuje tabel albo generator nie da
    wyniku: bot z flagą ma grać z mieszkańcami z generatora, a nie po cichu bez nich. */
export async function swiatMieszkancow(
  demo: { geo: Geo; street: string },
  seed: number,
  core: number,
): Promise<SwiatMieszkancow> {
  const dane = await wczytajDaneMieszkancow(demo.geo.c[0], demo.geo.c[1], zPliku);
  if (!dane) throw new Error('--mieszkancy: brak tabel mieszkańców w public/data/mieszkancy/');
  const geo = mapaMieszkancow(demo.geo, dane);
  const world = buildWorld(geo, { seed, street: demo.street });
  const l = mieszkancyNowejGry(world, geo, dane, core);
  if (!l) throw new Error('--mieszkancy: generator mieszkańców nie dał wyniku dla siedziby');
  return { world, mieszkancy: opcjaMieszkancow(l) };
}

/** Jedna linijka o stanie startowym: kto jest w zarządzie i ilu mieszkańców-pionków ma osobę z generatora. */
export function opisMieszkancow(st: Pick<SimState, 'pawns' | 'people'>): string {
  const zarzad = st.pawns.filter((p) => p.kind === 'core').map((p) => st.people[p.person].name);
  const lokatorzy = st.pawns.filter((p) => p.kind === 'resident');
  return `Mieszkańcy z adresu: zarząd ${zarzad.join(', ')}; lokatorzy z osobą ${lokatorzy.filter((p) => p.person >= 0).length}/${lokatorzy.length}`;
}
