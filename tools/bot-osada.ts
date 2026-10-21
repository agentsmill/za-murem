/* Uprząż osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 2): mierzy, czy silnik decyzji
   z src/ai/ przeżywa i rośnie. Gra prowadzona przez `silnik` (src/ai/silnik.ts) idzie `--dni` dób na każdym z dem i ziaren;
   z każdej gry zostają poranki (stan o 6:00 każdego dnia, od dnia 2), koniec gry (`gov.over`: pustka, odwołanie, exodus)
   i okna zawieszone, a tools/osada-ocena.ts liczy z nich werdykt (cel kontrolny etapu).

   Domyślnie gra jak w przeglądarce: obcy (`obcy: true`), mieszkańcy siedziby z generatora (`swiatMieszkancow`), okolica
   miasta z geo dema (`okolicaZGeo`) z mapą miasta i wyprawami dziennymi, ludność kwadratu domu z 2021 roku (drogi do
   zwycięstwa) i tempo przeglądarki (`tempoPrzegladarki`: raport rano liczy się jako decyzja i po nim wydarzenie czeka okno
   ciszy), cztery osoby zarządu. `--prosto` zostawia tylko tempo przeglądarki: bez obcych, mieszkańców z adresu, okolicy
   i ludności 2021, na świecie z ziarnem bota, jak `npm run bot` bez flag. Ziarno świata to ziarno gry (jak w botach, nie z
   adresu jak w przeglądarce), żeby przebiegi z `--prosto` i bez niego były porównywalne.

   Jedna gra na proces (procesy równolegle, jak tools/bot-zombie-siatka.ts): ten sam skrypt z ukrytym argumentem
   `--jedna=demo:ziarno` gra jedną grę i drukuje jej wynik jako jedną linię JSON, a proces główny zbiera wyniki, rysuje
   tabelę i liczy werdykt. Procesów tyle, ile rdzeni bez jednego (`--procesy=N` zmienia). Gra jest deterministyczna, więc
   te same argumenty dają te same liczby niezależnie od kolejności procesów; skrót końcowy gry idzie w linii postępu.

   Wyjście: nagłówek, dla każdego dema tabela przebiegów (ziarno, koniec albo „żyje”, przyczyna, ludność o 6:00 w dniach 10,
   20, 30 i ostatnim, dzień pierwszego kamienia ludności, budowle na koniec, czas), dla przebiegu bez przeżycia ostatnie
   pięć poranków (ludność, zarząd, budowle, badania, jedzenie, drewno, zimni, głodni, zaufanie, wkurzenie) i linia „przeżyło
   x z n”, na końcu błędy przebiegów, uwagi i werdykt. Postęp idzie na stderr.
   Kod wyjścia: 0 gdy werdykt przechodzi (albo jest `--bez-progu`, czyli sam pomiar bez progów) i żaden przebieg nie padł;
   1 gdy werdykt nie przechodzi (bez `--bez-progu`) albo któryś przebieg jest błędny (proces padł, przekroczył limit czasu
   albo zostawił okno zarządu zawieszone: silnik nie umie odpowiedzieć na taki rodzaj okna); 2 przy złych argumentach.

   Moduł da się zaimportować (testy): `przygotujGre` składa grę z konfiguracji uprzęży, `zagraj` gra ją do końca przebiegu,
   a reszta eksportów to czyste funkcje argumentów i tabeli. Uprząż rusza tylko wtedy, gdy skrypt uruchomiono wprost.

   Uruchomienie: npm run bot:osada [-- --ziarna=11-15] [--dni=45] [--demo=przymorze,lanciego,zielonki] [--prosto]
                 [--bez-progu] [--procesy=N] [--limit=MIN] */

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type GraAi,
  grajDo,
  nowaGraAi,
  type OknoZawieszone,
  type OpcjeGryAi,
  skrotGry,
  wejscie,
} from '../src/ai/gra.ts';
import { silnik } from '../src/ai/silnik.ts';
import { liczbaZbadanych } from '../src/sim/badania.ts';
import { BUILDS } from '../src/sim/budowle.ts';
import { clockOf, dayOf, START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { populacja } from '../src/sim/snapshot.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import { okolicaZGeo } from '../tests/unit/miasto-play.ts';
import {
  budowleNaKoniec,
  type DzienPrzebiegu,
  dzienKamienia,
  ludnoscWDniu,
  type Przebieg,
  przezyl,
  werdykt,
} from './osada-ocena.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
/** dema z public/demo/ (trzy osiedla gry), w kolejności tabel */
export const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
/** osoby zarządu: tyle co domyślnie w grze */
const CORE = 4;
/** dni, w których tabela pokazuje ludność (ostatnią kolumną jest zawsze ostatni dzień przebiegu) */
const DNI_LUDNOSCI = [10, 20, 30, 45];
/** ile ostatnich poranków pokazuje przebieg bez przeżycia */
const OSTATNIE_PORANKI = 5;
/** progi dziennego dryfu wkurzenia (`dailyDrift` w src/gov/uchwaly.ts): zimny to ciepło poniżej 40, głodny najedzenie
    poniżej 25 */
const ZIMNO_PONIZEJ = 40;
const GLOD_PONIZEJ = 25;

export interface Opcje {
  ziarna: number[];
  dni: number;
  dema: string[];
  prosto: boolean;
  bezProgu: boolean;
  /** ile procesów gra naraz */
  procesy: number;
  /** po ilu minutach jeden przebieg uważa się za zawieszony */
  limitMin: number;
  /** ukryty tryb procesu potomnego: zagraj tylko tę grę i wydrukuj wynik */
  jedna: { demo: string; ziarno: number } | null;
  pomoc: boolean;
}

const UZYCIE =
  'Użycie: node tools/bot-osada.ts [--ziarna=11-15] [--dni=45] [--demo=przymorze,lanciego,zielonki] [--prosto] [--bez-progu] [--procesy=N] [--limit=MIN]';

/** Ziarna z `11-15`, `11` albo listy `11,13,15-16`. Rzuca na pustą listę, złą liczbę i odwrócony zakres. */
export function parsujZiarna(tekst: string): number[] {
  const out: number[] = [];
  for (const czesc of tekst.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(czesc.trim());
    if (!m) throw new Error(`zła lista ziaren „${tekst}” (np. 11-15, 7 albo 11,13,15-16)`);
    const od = Number(m[1]);
    const doZiarna = m[2] === undefined ? od : Number(m[2]);
    if (doZiarna < od) throw new Error(`odwrócony zakres ziaren „${czesc}”`);
    if (doZiarna - od > 999) throw new Error(`za dużo ziaren w zakresie „${czesc}”`);
    for (let z = od; z <= doZiarna; z++) if (!out.includes(z)) out.push(z);
  }
  return out;
}

function liczbaDodatnia(nazwa: string, tekst: string): number {
  if (!/^\d+$/.test(tekst) || Number(tekst) < 1)
    throw new Error(`${nazwa} wymaga liczby całkowitej od 1, a jest „${tekst}”`);
  return Number(tekst);
}

/** Opcje z argumentów wiersza poleceń (bez `node` i ścieżki skryptu). Rzuca z komunikatem po polsku na każdy nieznany
    argument i złą wartość, zamiast cicho zagrać coś innego. */
export function parsujArgumenty(argv: readonly string[]): Opcje {
  const o: Opcje = {
    ziarna: parsujZiarna('11-15'),
    dni: 45,
    dema: [...DEMA],
    prosto: false,
    bezProgu: false,
    procesy: Math.max(1, os.availableParallelism() - 1),
    limitMin: 30,
    jedna: null,
    pomoc: false,
  };
  for (const a of argv) {
    const [flaga, wartosc] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    if (!flaga.startsWith('--')) throw new Error(`nieznany argument „${a}” (uprząż nie ma argumentów pozycyjnych)`);
    if (wartosc === null) {
      if (flaga === '--prosto') o.prosto = true;
      else if (flaga === '--bez-progu') o.bezProgu = true;
      else if (flaga === '--pomoc') o.pomoc = true;
      else throw new Error(`nieznany argument „${a}”`);
      continue;
    }
    switch (flaga) {
      case '--ziarna':
        o.ziarna = parsujZiarna(wartosc);
        break;
      case '--dni':
        o.dni = liczbaDodatnia('--dni', wartosc);
        break;
      case '--procesy':
        o.procesy = liczbaDodatnia('--procesy', wartosc);
        break;
      case '--limit':
        o.limitMin = liczbaDodatnia('--limit', wartosc);
        break;
      case '--demo': {
        const dema = wartosc.split(',').map((d) => d.trim());
        const zle = dema.filter((d) => !(DEMA as readonly string[]).includes(d));
        if (!dema.length || zle.length) throw new Error(`nieznane demo „${zle.join(', ')}” (są: ${DEMA.join(', ')})`);
        o.dema = [...new Set(dema)];
        break;
      }
      case '--jedna': {
        const m = /^([a-z]+):(\d+)$/.exec(wartosc);
        if (!m || !(DEMA as readonly string[]).includes(m[1])) throw new Error(`zła wartość --jedna=${wartosc}`);
        o.jedna = { demo: m[1], ziarno: Number(m[2]) };
        break;
      }
      default:
        throw new Error(`nieznany argument „${a}”`);
    }
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// Jedna gra (proces potomny)
// ---------------------------------------------------------------------------------------------------------------------

/** Wynik jednej gry: przebieg do oceny, czas, skrót końcowy stanu gry (do porównań determinizmu) i okna zawieszone. */
export interface WynikGry {
  przebieg: Przebieg;
  czasMs: number;
  skrot: string;
  zawieszone: OknoZawieszone[];
}

/** tick pierwszego kroku o 6:00 danego dnia (dzień 2 to tick 12000: gra zaczyna się o 15:00 dnia 1) */
export function poranekTick(dzien: number): number {
  return (dzien - 1) * TICKS_PER_DAY + 6 * TICKS_PER_HOUR - (START_MINUTES / 60) * TICKS_PER_HOUR;
}

/** Stan osady o 6:00, po kroku zarządu z tej chwili (dryf wkurzenia i zaufania liczy się właśnie wtedy). Wejście zarządu
    (`wejscie`) daje to samo, co widzi zarząd: zapasy i potrzeby zarządu, na których liczy się dzienny dryf. */
function poranek(g: GraAi): DzienPrzebiegu {
  const st = g.sim.st;
  const i = wejscie(g);
  const ludnosc = populacja(st);
  return {
    dzien: dayOf(st.tick),
    ludnosc: ludnosc.razem,
    zarzad: ludnosc.zarzad,
    budowle: st.things.filter((t) => Object.hasOwn(BUILDS, t.kind)).length,
    badania: liczbaZbadanych(st),
    jedzenie: i.stock.supplies + (i.stock.meals ?? 0),
    drewno: i.stock.wood,
    zimni: i.people.filter((p) => p.needs.warm < ZIMNO_PONIZEJ).length,
    glodni: i.people.filter((p) => p.needs.food < GLOD_PONIZEJ).length,
    zaufanie: g.gov.trust,
    wkurzenie: g.gov.anger,
  };
}

/** Moduł z mieszkańcami z adresu czyta process.argv przy ładowaniu i kończy proces na każdej fladze, której nie zna (a tu są
    własne: --dni, --jedna…), więc na czas importu argumenty znikają. */
async function wczytajBotMieszkancy(): Promise<typeof import('./bot-mieszkancy.ts')> {
  const argumenty = process.argv.splice(2);
  try {
    return await import('./bot-mieszkancy.ts');
  } finally {
    process.argv.push(...argumenty);
  }
}

/** Gra tak, jak ją zakłada uprząż, na demie `demoKlucz` z ziarnem `ziarno`: jak w przeglądarce (obcy, mieszkańcy siedziby
    z generatora, okolica miasta z geo dema, ludność kwadratu domu z 2021 roku, tempo przeglądarki) albo `prosto` (tylko tempo
    przeglądarki, na świecie bez generatora mieszkańców). Eksportowana, żeby testy warstw silnika grały na tej samej
    konfiguracji co pomiar. */
export async function przygotujGre(demoKlucz: string, ziarno: number, prosto: boolean): Promise<GraAi> {
  const demo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo', `${demoKlucz}.json`), 'utf8'));
  const opts: OpcjeGryAi = { core: CORE, tempoPrzegladarki: true };
  let world: World;
  if (prosto) world = buildWorld(demo.geo, { seed: ziarno, street: demo.street });
  else {
    const bot = await wczytajBotMieszkancy();
    const osiedle = await bot.swiatMieszkancow(demo, ziarno, CORE);
    const ludnosc = await bot.ludnoscDema(demo);
    world = osiedle.world;
    opts.obcy = true;
    opts.mieszkancy = osiedle.mieszkancy;
    opts.okolica = okolicaZGeo(demo.geo);
    if (ludnosc.ludnosc2021 !== undefined) opts.ludnosc2021 = ludnosc.ludnosc2021;
  }
  return nowaGraAi(world, ziarno, opts);
}

/** Jedna gra silnika: `dni` dób od 15:00 dnia 1 albo do końca gry. Poranki o 6:00 od dnia 2 (przebieg, który kończy się
    w ciągu dnia, ma ostatni poranek poprzedniego dnia; koniec o 6:00 ma poranek z chwili końca). */
export async function zagraj(demoKlucz: string, ziarno: number, dni: number, prosto: boolean): Promise<WynikGry> {
  const t0 = performance.now();
  const g = await przygotujGre(demoKlucz, ziarno, prosto);
  const koniecTick = dni * TICKS_PER_DAY;
  const poranki: DzienPrzebiegu[] = [];
  for (let dzien = 2; poranekTick(dzien) <= koniecTick && !g.gov.over; dzien++) {
    grajDo(g, silnik, poranekTick(dzien));
    if (g.sim.st.tick === poranekTick(dzien)) poranki.push(poranek(g));
  }
  if (!g.gov.over) grajDo(g, silnik, koniecTick);
  return {
    przebieg: {
      demo: demoKlucz,
      ziarno,
      dni,
      koniec: g.gov.over ? { dzien: dayOf(g.sim.st.tick), przyczyna: g.gov.over } : null,
      poranki,
    },
    czasMs: performance.now() - t0,
    skrot: skrotGry(g),
    zawieszone: g.zawieszone,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------------------------------------------------

/** dni, w których tabela pokazuje ludność: 10, 20, 30 i 45 przed końcem przebiegu, a na końcu zawsze ostatni dzień */
export function dniLudnosci(dni: number): number[] {
  return [...DNI_LUDNOSCI.filter((d) => d < dni), dni];
}

const lewo = (t: string | number, szer: number): string => String(t).padEnd(szer);
const prawo = (t: string | number | null, szer: number): string => String(t ?? '-').padStart(szer);

export function naglowekTabeli(dni: number): string {
  const lud = dniLudnosci(dni)
    .map((d) => prawo(`lud${d}`, 6))
    .join('');
  return `${lewo('ziarno', 7)}${lewo('koniec', 10)}${lewo('przyczyna', 11)}${lud}${prawo('kamień', 8)}${prawo('budowle', 9)}${prawo('czas', 8)}`;
}

/** Wiersz tabeli jednego przebiegu: ziarno, koniec („żyje” albo „dzień N”), przyczyna, ludność w dniach z `dniLudnosci`
    („-”, gdy przebieg do nich nie dotrwał), dzień pierwszego kamienia, budowle na koniec i czas w sekundach. */
export function wierszPrzebiegu(p: Przebieg, czasMs: number): string {
  const lud = dniLudnosci(p.dni)
    .map((d) => prawo(ludnoscWDniu(p, d), 6))
    .join('');
  const koniec = p.koniec ? `dzień ${p.koniec.dzien}` : 'żyje';
  return `${lewo(p.ziarno, 7)}${lewo(koniec, 10)}${lewo(p.koniec?.przyczyna ?? '-', 11)}${lud}${prawo(dzienKamienia(p), 8)}${prawo(budowleNaKoniec(p), 9)}${prawo(`${(czasMs / 1000).toFixed(1)} s`, 8)}`;
}

const POLA_PORANKA: [keyof DzienPrzebiegu, string, number][] = [
  ['dzien', 'dzień', 6],
  ['ludnosc', 'ludn.', 6],
  ['zarzad', 'zarząd', 7],
  ['budowle', 'budowle', 9],
  ['badania', 'badania', 9],
  ['jedzenie', 'jedzenie', 10],
  ['drewno', 'drewno', 8],
  ['zimni', 'zimni', 7],
  ['glodni', 'głodni', 8],
  ['zaufanie', 'zaufanie', 10],
  ['wkurzenie', 'wkurzenie', 11],
];

/** Ostatnie poranki przebiegu jako tabela (zimni i głodni to osoby zarządu, zaufanie i wkurzenie w punktach 0–100). */
export function ostatniePoranki(p: Przebieg, ile = OSTATNIE_PORANKI): string[] {
  const wiersze = p.poranki.slice(-ile).map((d) =>
    POLA_PORANKA.map(([pole, , szer]) => {
      const v = d[pole];
      return prawo(Number.isInteger(v) ? v : v.toFixed(1), szer);
    }).join(''),
  );
  return [POLA_PORANKA.map(([, nazwa, szer]) => prawo(nazwa, szer)).join(''), ...wiersze];
}

/** Opis okien zawieszonych jednego przebiegu: rodzaj okna, ile sekund przy ekranie czekało i kiedy pierwszy raz. */
export function opisZawieszonych(z: readonly OknoZawieszone[]): string[] {
  const rodzaje = [...new Set(z.map((x) => x.k))];
  return rodzaje.map((k) => {
    const s = z.filter((x) => x.k === k);
    const tick = s[0].s * TICKS_PER_SECOND;
    return `okno „${k}” zawieszone ${s.length} ${s.length === 1 ? 'raz' : 'razy'} (pierwszy raz w dniu ${dayOf(tick)} o ${clockOf(tick)})`;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Proces główny
// ---------------------------------------------------------------------------------------------------------------------

const dzieci = new Set<ChildProcess>();

/** Procesy potomne nie przeżywają głównego (kod wyjścia, Ctrl-C, zabicie z zewnątrz). Tylko w trybie głównym uprzęży:
    import z testu niczego nie rejestruje. */
function sprzataj(): void {
  process.on('exit', () => {
    for (const d of dzieci) d.kill('SIGKILL');
  });
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
}

/** Z wyjścia błędów procesu, który padł, linia błędu (pierwsza zaczynająca się od „…Error”) z dwiema następnymi; bez takiej
    linii ostatnie trzy. Reszta (źródło w kontekście, stos Node) to szum. */
export function streszczenieBledu(stderr: string): string {
  const linie = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const k = linie.findIndex((l) => /^\w*Error\b/.test(l));
  return (k >= 0 ? linie.slice(k, k + 3) : linie.slice(-3)).join(' | ');
}

/** Jedna gra w osobnym procesie; rzuca, gdy proces padł, przekroczył limit albo oddał nieczytelny wynik. */
function uruchom(o: Opcje, demo: string, ziarno: number): Promise<WynikGry> {
  const args = [
    ...process.execArgv,
    import.meta.filename,
    `--jedna=${demo}:${ziarno}`,
    `--dni=${o.dni}`,
    ...(o.prosto ? ['--prosto'] : []),
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    dzieci.add(p);
    let wyjscie = '';
    let bledy = '';
    let przekroczono = false;
    p.stdout.on('data', (d) => {
      wyjscie += d;
    });
    p.stderr.on('data', (d) => {
      bledy += d;
    });
    const zegar = setTimeout(() => {
      przekroczono = true;
      p.kill('SIGKILL');
    }, o.limitMin * 60_000);
    p.on('error', (e) => {
      clearTimeout(zegar);
      dzieci.delete(p);
      reject(e);
    });
    p.on('close', (kod, sygnal) => {
      clearTimeout(zegar);
      dzieci.delete(p);
      if (przekroczono) return reject(new Error(`przekroczono limit czasu (${o.limitMin} min)`));
      if (kod !== 0)
        return reject(
          new Error(
            `proces zakończył się ${kod === null ? `sygnałem ${sygnal}` : `kodem ${kod}`}: ${streszczenieBledu(bledy)}`,
          ),
        );
      try {
        resolve(JSON.parse(wyjscie.trim().split('\n').at(-1) ?? '') as WynikGry);
      } catch {
        reject(new Error(`nieczytelny wynik procesu: ${wyjscie.trim().slice(-200)}`));
      }
    });
  });
}

type Rezultat = { wynik: WynikGry } | { blad: string };

async function glowny(o: Opcje): Promise<number> {
  sprzataj();
  const t0 = performance.now();
  const zadania = o.dema.flatMap((demo) => o.ziarna.map((ziarno) => ({ demo, ziarno })));
  const rezultaty = new Map<string, Rezultat>();
  const klucz = (demo: string, ziarno: number): string => `${demo}:${ziarno}`;
  const procesy = Math.min(o.procesy, zadania.length);
  console.log(
    `Osada AI, etap 1: ${o.dema.join(', ')}; ziarna ${o.ziarna.join(',')}; ${o.dni} dni; gra ${
      o.prosto
        ? 'prosto (bez obcych, mieszkańców z adresu, okolicy miasta i ludności 2021, tempo przeglądarki)'
        : 'jak w przeglądarce (obcy, mieszkańcy z adresu, okolica miasta, ludność 2021, tempo przeglądarki)'
    }; procesów ${procesy}${o.bezProgu ? '; bez progu (sam pomiar)' : ''}`,
  );
  let nastepny = 0;
  let gotowe = 0;
  async function robotnik(): Promise<void> {
    while (nastepny < zadania.length) {
      const z = zadania[nastepny++];
      let rezultat: Rezultat;
      try {
        rezultat = { wynik: await uruchom(o, z.demo, z.ziarno) };
      } catch (e) {
        rezultat = { blad: e instanceof Error ? e.message : String(e) };
      }
      rezultaty.set(klucz(z.demo, z.ziarno), rezultat);
      const opis =
        'blad' in rezultat
          ? `BŁĄD ${rezultat.blad.slice(0, 120)}`
          : `${rezultat.wynik.przebieg.koniec ? `dzień ${rezultat.wynik.przebieg.koniec.dzien} ${rezultat.wynik.przebieg.koniec.przyczyna}` : 'żyje'}, ${(rezultat.wynik.czasMs / 1000).toFixed(1)} s, skrót ${rezultat.wynik.skrot}`;
      console.error(
        `[${String(++gotowe).padStart(String(zadania.length).length)}/${zadania.length}] ${z.demo} ${z.ziarno}: ${opis}`,
      );
    }
  }
  await Promise.all(Array.from({ length: procesy }, robotnik));

  const przebiegi: Przebieg[] = [];
  const bledyPrzebiegow: string[] = [];
  for (const demo of o.dema) {
    console.log(`\n${demo}`);
    console.log(naglowekTabeli(o.dni));
    const wDemie: Przebieg[] = [];
    for (const ziarno of o.ziarna) {
      const r = rezultaty.get(klucz(demo, ziarno))!;
      if ('blad' in r) {
        console.log(`${lewo(ziarno, 7)}BŁĄD przebiegu`);
        bledyPrzebiegow.push(`${demo} ${ziarno}: ${r.blad}`);
        continue;
      }
      const p = r.wynik.przebieg;
      wDemie.push(p);
      przebiegi.push(p);
      console.log(wierszPrzebiegu(p, r.wynik.czasMs));
      for (const opis of opisZawieszonych(r.wynik.zawieszone)) {
        console.log(`       BŁĄD: ${opis}`);
        bledyPrzebiegow.push(`${demo} ${ziarno}: ${opis}`);
      }
    }
    for (const p of wDemie.filter((x) => !przezyl(x))) {
      console.log(
        `\n  ${demo}, ziarno ${p.ziarno}: ${p.koniec!.przyczyna} w dniu ${p.koniec!.dzien}; ostatnie poranki`,
      );
      for (const linia of ostatniePoranki(p)) console.log(`  ${linia}`);
    }
    console.log(`\nprzeżyło ${wDemie.filter(przezyl).length} z ${o.ziarna.length}`);
  }
  console.log(
    '\nlud10…: ludność o 6:00 w danym dniu, kamień: dzień pierwszego poranka z 10 osobami, budowle: stojące na koniec, "-": brak',
  );

  if (bledyPrzebiegow.length) {
    console.log('\nBłędy przebiegów:');
    for (const b of bledyPrzebiegow) console.log(`  - ${b}`);
  }
  const w = werdykt(przebiegi);
  console.log(
    `\nWerdykt: ${w.ok ? 'przechodzi' : 'NIE PRZECHODZI'}${o.bezProgu ? ' (bez progu: nie wpływa na kod wyjścia)' : ''}`,
  );
  for (const b of w.bledy) console.log(`  - ${b}`);
  if (w.uwagi.length) {
    console.log('Uwagi:');
    for (const u of w.uwagi) console.log(`  - ${u}`);
  }
  console.log(`\nRazem ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  return bledyPrzebiegow.length || (!w.ok && !o.bezProgu) ? 1 : 0;
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
  else if (o.jedna) {
    const wynik = await zagraj(o.jedna.demo, o.jedna.ziarno, o.dni, o.prosto);
    process.stdout.write(`${JSON.stringify(wynik)}\n`);
  } else process.exitCode = await glowny(o);
}
