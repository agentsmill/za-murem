/* Reguła miejsca osady AI na kwadratach dem, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 2,
   krok 4): dla 20 sąsiednich kwadratów trzech dem (public/demo/*-kwadraty.json: Przymorze 8, Lanciego 4 boczne, Zielonki 8)
   tabela z tym, co mierzy `swiatOsady` (src/ai/kwadrat.ts): ile budynków mieszkalnych leży w promieniu wyboru siedziby, ile
   prób (światów) zbudowano, pole i pokoje siedziby (w nawiasie pokoje mieszkania zarządu), osoby z generatora mieszkańców
   (razem i lokatorzy poza zarządem), porcje jedzenia w zasięgu 720 m i wynik reguły z powodem odrzucenia. Wiersz „dom” to geo
   domu potraktowane jak kandydat (0, 0): z niego uprząż `npm run bot:osada` wie, czy demo jest „poza regułą miejsca”. Na końcu
   demo: ile kwadratów spełnia regułę i który kwadrat wybiera `wybierzOsade` dla każdego ziarna. Tabela liczy się
   z pełnym pomiarem (`pelny`: wszystkie kolumny także po pierwszym powodzie odrzucenia), dla pierwszego ziarna; ostatnia
   kolumna mówi, w ilu ziarnach z listy kwadrat spełnia regułę (ziarno wpływa na wnętrze siedziby, więc na liczbę pokoi, nie
   na jedzenie ani mieszkańców). To narzędzie pomiarowe: kod wyjścia 0 niezależnie od wyniku, 2 przy złych argumentach.

   Moduł da się zaimportować (testy): `wczytajDemo` i `daneDema` czytają dema i tabele mieszkańców z public/ (bez sieci), reszta
   to czyste funkcje tabeli. Uprząż rusza tylko wtedy, gdy skrypt uruchomiono wprost.

   Uruchomienie: node tools/osada-kwadraty.ts [--ziarna=11-15] [--demo=przymorze,lanciego,zielonki] */

import fs from 'node:fs';
import path from 'node:path';
import {
  kandydaciOsady,
  MIN_LOKATORZY_SIEDZIBY,
  MIN_POKOI_SIEDZIBY,
  type OdrzucenieOsady,
  PROBY_SIEDZIBY,
  PROG_JEDZENIA_OSADY,
  PROMIEN_SIEDZIBY_M,
  type SwiatOsady,
  swiatOsady,
  wybierzOsade,
} from '../src/ai/kwadrat.ts';
import { MAX_OKOLICA_M } from '../src/gov/wyprawy.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow } from '../src/mieszkancy/wczytaj.ts';
import type { Geo } from '../src/world/geo.ts';
import { kluczKwadratu, sasiedzi8, ukladZGeo, zKlucza } from '../src/world/kwadraty.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
/** dema z public/demo/ (trzy osiedla gry), w kolejności tabel */
export const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;

/** Demo z plików: geo domu, adres i geo sąsiednich kwadratów po kluczu „sx,sy” (Lanciego ma cztery boczne, reszta osiem). */
export interface DemoDanych {
  klucz: string;
  geo: Geo;
  street: string;
  addr: string;
  kwadraty: Record<string, Geo>;
}

const demaCache = new Map<string, DemoDanych>();
const daneCache = new Map<string, Promise<DaneMieszkancow | null>>();

/** Dema są wczytywane raz na proces; wołający nie zmienia ich geo (`swiatOsady` nie zmienia wejścia). */
export function wczytajDemo(klucz: string): DemoDanych {
  let d = demaCache.get(klucz);
  if (!d) {
    const demo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo', `${klucz}.json`), 'utf8'));
    const kwadraty = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo', `${klucz}-kwadraty.json`), 'utf8'));
    d = { klucz, geo: demo.geo, street: demo.street, addr: demo.addr, kwadraty };
    demaCache.set(klucz, d);
  }
  return d;
}

/** `fetch` dla wczytaj.ts: ścieżka względna to plik w public/, brak pliku to 404 (jak w tools/bot-mieszkancy.ts). */
const zPliku = (async (adres: string) => {
  const plik = path.join(PUBLIC, String(adres));
  return fs.existsSync(plik) ? new Response(fs.readFileSync(plik)) : new Response(null, { status: 404 });
}) as unknown as typeof fetch;

/** Tabele mieszkańców dla adresu dema (z public/data/mieszkancy/, tak jak w grze); null, gdy ich brak. Raz na proces. */
export function daneDema(klucz: string): Promise<DaneMieszkancow | null> {
  let p = daneCache.get(klucz);
  if (!p) {
    const geo = wczytajDemo(klucz).geo;
    p = wczytajDaneMieszkancow(geo.c[0], geo.c[1], zPliku);
    daneCache.set(klucz, p);
  }
  return p;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------------------------------------------------

export interface Opcje {
  ziarna: number[];
  dema: string[];
  pomoc: boolean;
}

const UZYCIE = 'Użycie: node tools/osada-kwadraty.ts [--ziarna=11-15] [--demo=przymorze,lanciego,zielonki]';

/** Ziarna z `11-15`, `11` albo listy `11,13,15-16` (jak w tools/bot-osada.ts); rzuca na pustą listę i odwrócony zakres. */
export function parsujZiarna(tekst: string): number[] {
  const out: number[] = [];
  for (const czesc of tekst.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(czesc.trim());
    if (!m) throw new Error(`zła lista ziaren „${tekst}” (np. 11-15, 7 albo 11,13,15-16)`);
    const od = Number(m[1]);
    const doZiarna = m[2] === undefined ? od : Number(m[2]);
    if (doZiarna < od) throw new Error(`odwrócony zakres ziaren „${czesc}”`);
    if (doZiarna - od > 99) throw new Error(`za dużo ziaren w zakresie „${czesc}”`);
    for (let z = od; z <= doZiarna; z++) if (!out.includes(z)) out.push(z);
  }
  return out;
}

/** Opcje z argumentów wiersza poleceń (bez `node` i ścieżki skryptu); rzuca z komunikatem po polsku na zły argument. */
export function parsujArgumenty(argv: readonly string[]): Opcje {
  const o: Opcje = { ziarna: parsujZiarna('11-15'), dema: [...DEMA], pomoc: false };
  for (const a of argv) {
    if (a === '--pomoc') {
      o.pomoc = true;
      continue;
    }
    const m = /^--(ziarna|demo)=(.+)$/.exec(a);
    if (!m) throw new Error(`nieznany argument „${a}”`);
    if (m[1] === 'ziarna') o.ziarna = parsujZiarna(m[2]);
    else {
      const dema = m[2].split(',').map((d) => d.trim());
      const zle = dema.filter((d) => !(DEMA as readonly string[]).includes(d));
      if (!dema.length || zle.length) throw new Error(`nieznane demo „${zle.join(', ')}” (są: ${DEMA.join(', ')})`);
      o.dema = [...new Set(dema)];
    }
  }
  return o;
}

const lewo = (t: string | number, szer: number): string => String(t).padEnd(szer);
const prawo = (t: string | number | null, szer: number): string => String(t ?? '-').padStart(szer);

export function naglowekTabeli(): string {
  return `${lewo('klucz', 7)}${prawo('kand.', 6)}${prawo('próby', 6)}${prawo('siedziba m²', 12)}${prawo('pokoje (zarz.)', 15)}${prawo('osoby', 7)}${prawo('lokat.', 7)}${prawo('jedzenie', 10)}  ${lewo('wynik', 18)}${prawo('ziarna', 8)}`;
}

/** Wynik reguły słowem: „tak” albo „nie: powód”. */
export const wynikSlowem = (w: SwiatOsady | OdrzucenieOsady): string =>
  'odrzucony' in w ? `nie: ${w.odrzucony}` : 'tak';

/** Wiersz tabeli jednego kwadratu: klucz, kandydaci i próby, siedziba (pole, pokoje i pokoje zarządu), osoby i lokatorzy z
    generatora („-”, gdy nie liczono), jedzenie w zasięgu (zaokrąglone do porcji), wynik i liczba ziaren, w których kwadrat
    spełnia regułę (`spelnia` z `ziaren`). */
export function wierszTabeli(klucz: string, w: SwiatOsady | OdrzucenieOsady, spelnia: number, ziaren: number): string {
  const p = w.pomiar;
  const siedziba = p.proby ? p.pole : null;
  const pokoje = p.proby ? `${p.pokoje} (${p.pokojeZarzadu})` : null;
  const jedzenie = p.jedzenie === null ? null : Math.round(p.jedzenie);
  return `${lewo(klucz, 7)}${prawo(p.kandydatow, 6)}${prawo(p.proby, 6)}${prawo(siedziba, 12)}${prawo(pokoje, 15)}${prawo(p.osoby, 7)}${prawo(p.lokatorzy, 7)}${prawo(jedzenie, 10)}  ${lewo(wynikSlowem(w), 18)}${prawo(`${spelnia}/${ziaren}`, 8)}`;
}

/** Opis reguły do nagłówka wyjścia (stałe z src/ai/kwadrat.ts). */
export function opisReguly(): string {
  return `siedziba: do ${PROBY_SIEDZIBY} największych budynków mieszkalnych w ${PROMIEN_SIEDZIBY_M} m od środka kwadratu, co najmniej ${MIN_POKOI_SIEDZIBY} pokoje w całym wnętrzu i pokój w mieszkaniu zarządu; mieszkańcy z generatora, co najmniej ${MIN_LOKATORZY_SIEDZIBY} lokator poza zarządem; jedzenie: co najmniej ${PROG_JEDZENIA_OSADY} porcji w zasięgu ${MAX_OKOLICA_M} m`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Proces główny
// ---------------------------------------------------------------------------------------------------------------------

type Wynik = SwiatOsady | OdrzucenieOsady;

/** Jedno demo: tabela kwadratów (pełny pomiar dla pierwszego ziarna), spełnianie reguły w ziarnach i wybory `wybierzOsade`. */
async function demo(klucz: string, ziarna: readonly number[]): Promise<void> {
  const d = wczytajDemo(klucz);
  const dane = await daneDema(klucz);
  const uklad = ukladZGeo(d.geo);
  const kwadraty = Object.keys(d.kwadraty).sort((a, b) => {
    // kolejność jak sasiedzi8: N, NE, E, SE, S, SW, W, NW
    const k = sasiedzi8(0, 0).map(([x, y]) => kluczKwadratu(x, y));
    return k.indexOf(a) - k.indexOf(b);
  });
  console.log(`\n${klucz} (${d.addr}; kąt domu ${uklad.kat.toFixed(3)} rad; sąsiednich kwadratów ${kwadraty.length})`);
  console.log(naglowekTabeli());
  const wiersze: { klucz: string; wynik: Wynik; spelnia: number }[] = [];
  const geoDla = (k: string): Geo => (k === 'dom' ? d.geo : d.kwadraty[k]);
  for (const k of ['dom', ...kwadraty]) {
    const [sx, sy] = k === 'dom' ? [0, 0] : zKlucza(k);
    let pierwszy: Wynik | null = null;
    let spelnia = 0;
    for (const z of ziarna) {
      const w = swiatOsady(geoDla(k), sx, sy, dane, z, uklad, { pelny: true });
      pierwszy ??= w;
      if (!('odrzucony' in w)) spelnia++;
    }
    wiersze.push({ klucz: k, wynik: pierwszy!, spelnia });
    console.log(wierszTabeli(k, pierwszy!, spelnia, ziarna.length));
  }
  const sasiedzi = wiersze.filter((w) => w.klucz !== 'dom');
  const dom = wiersze.find((w) => w.klucz === 'dom')!;
  const tak = sasiedzi.filter((w) => !('odrzucony' in w.wynik));
  console.log(
    `\n${klucz}: regułę (ziarno ${ziarna[0]}) spełnia ${tak.length} z ${sasiedzi.length} sąsiednich kwadratów${
      tak.length ? ` (${tak.map((w) => w.klucz).join(', ')})` : ''
    }; dom: ${'odrzucony' in dom.wynik ? `poza regułą (${dom.wynik.odrzucony})` : 'spełnia'}`,
  );
  const zmienne = sasiedzi.filter((w) => w.spelnia > 0 && w.spelnia < ziarna.length).map((w) => w.klucz);
  if (zmienne.length) console.log(`  wynik zależy od ziarna w kwadratach: ${zmienne.join(', ')}`);
  const wybory = ziarna.map((z) => {
    const w = wybierzOsade(z, d.kwadraty, dane, uklad);
    return `${z} → ${w ? `${w.klucz} (${w.nazwa.pl})` : 'brak osady'}`;
  });
  console.log(`  wybierzOsade: ${wybory.join('; ')}`);
  console.log(
    `  kolejność kandydatów z ziarna ${ziarna[0]}: ${kandydaciOsady(ziarna[0])
      .map(([x, y]) => kluczKwadratu(x, y))
      .join(' ')}`,
  );
}

async function glowny(o: Opcje): Promise<number> {
  const t0 = performance.now();
  console.log('Osada AI, etap 2: reguła miejsca na kwadratach dem');
  console.log(opisReguly());
  console.log(
    `ziarna gry: ${o.ziarna.join(',')} (tabela dla ${o.ziarna[0]}, ostatnia kolumna: w ilu ziarnach kwadrat spełnia regułę)`,
  );
  for (const d of o.dema) await demo(d, o.ziarna);
  console.log(`\nRazem ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return 0;
}

/** czy skrypt jest uruchomiony wprost (a nie zaimportowany przez test) */
function jestGlowny(): boolean {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename);
  } catch {
    return false;
  }
}

if (jestGlowny()) {
  let o: Opcje;
  try {
    o = parsujArgumenty(process.argv.slice(2));
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : e}\n${UZYCIE}`);
    process.exit(2);
  }
  if (o.pomoc) console.log(UZYCIE);
  else process.exitCode = await glowny(o);
}
