/* Pomiar pojemności serwera świata (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md, „Serwer świata”):
   ile pamięci kosztuje wczytany świat drużyny, ile trwa krok symulacji, zapis stanu do JSON z gzip i wczytanie go z
   powrotem oraz jak szybko da się doliczyć kroki drużynie, której gracza nie było (leniwe liczenie). Liczby bez progu
   zaliczenia; cel do porównania z etapu 1: 50 drużyn zapisanych i 10 graczy naraz, przy leniwym liczeniu nieobecnych.
   Dla każdego z trzech dem (albo jednego z --demo) osobno z tłumem 150 pionków za siatką (jak ?perf=150 w grze, najgorszy
   przypadek) i bez niego.

   Przebieg to ten sam scenariusz co w bramce determinizmu (tools/determinizm/przebieg.ts: zarząd z polityką „zawsze
   warta”, stałe polecenia), więc w kroku jest też zarząd co sekundę przy ekranie. Krok mierzony jest zegarem między
   hakami przebiegu: zwykły krok, krok z zarządem (co 20.) i krok ze skrótem stanu (co 800.) liczą się osobno, bo mają
   różny koszt. Powtórzenia (--powtorz, domyślnie 3) odrzucają zakłócenia: bierze się przebieg o najkrótszym łącznym
   czasie. Pamięć to różnica `heapUsed + external` po wymuszonym GC dla kilku wczytanych światów naraz (świat, stan
   i Sim), podzielona przez ich liczbę; RSS jest orientacyjny. Wyniki zależą od maszyny, systemu i wersji Node (nagłówek
   raportu), a serwer świata stanie na innej maszynie i architekturze (Node 24 w Dockerze), więc to rząd wielkości, nie
   gwarancja.

   Uruchomienie: node tools/pojemnosc.ts [--demo=przymorze|lanciego|zielonki] [--godziny=24] [--tlum=150] [--powtorz=3]
                                         [--seed=12345] [--json=plik.json] */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Sim } from '../src/sim/sim.ts';
import { graj } from './determinizm/przebieg.ts';
import { tabelaLinie } from './determinizm/raport.ts';

const DEMA = ['przymorze', 'lanciego', 'zielonki'];
const KROKOW_NA_GODZINE = 800;
const KROKOW_NA_SEKUNDE_ZARZADU = 20;

const argumenty = process.argv.slice(2);
const wartosc = (nazwa: string) => argumenty.find((a) => a.startsWith(`--${nazwa}=`))?.slice(nazwa.length + 3);
const liczbaArg = (nazwa: string, domyslna: number) => {
  const v = wartosc(nazwa);
  if (v === undefined) return domyslna;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--${nazwa} to liczba całkowita od 0, jest „${v}”`);
    process.exit(64);
  }
  return n;
};
for (const a of argumenty)
  if (
    !a.startsWith('--') ||
    !['demo', 'godziny', 'tlum', 'powtorz', 'seed', 'json'].includes(a.slice(2).split('=')[0])
  ) {
    console.error(
      `Nieznany argument: ${a}\nUżycie: node tools/pojemnosc.ts [--demo=...] [--godziny=24] [--tlum=150] [--powtorz=3] [--seed=12345] [--json=plik]`,
    );
    process.exit(64);
  }
const godziny = Math.max(1, liczbaArg('godziny', 24));
const tlum = liczbaArg('tlum', 150);
const powtorz = Math.max(1, liczbaArg('powtorz', 3));
const seed = liczbaArg('seed', 12345);
const dema = wartosc('demo') ? [wartosc('demo') as string] : DEMA;
for (const d of dema)
  if (!DEMA.includes(d)) {
    console.error(`Nieznane demo: „${d}” (są: ${DEMA.join(', ')})`);
    process.exit(64);
  }

// GC na żądanie bez flagi --expose-gc w poleceniu: pomiar pamięci ma wiarygodnie sprzątać
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const demo = (klucz: string) =>
  JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../public/demo/${klucz}.json`), 'utf8'));

// ---------------------------------------------------------------------------------------------------------------------
// pomiary

const MB = 1024 * 1024;
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / MB).toFixed(1)} MB`;
const ms = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3));
const percentyl = (posortowane: Float64Array | number[], p: number) =>
  posortowane.length ? posortowane[Math.min(posortowane.length - 1, Math.floor(p * posortowane.length))] : Number.NaN;
const posortuj = (a: number[]) => Float64Array.from(a).sort();
const najmniejszy = (f: () => number, razy: number) => Math.min(...Array.from({ length: razy }, f));

interface Rozklad {
  p50: number;
  p99: number;
  max: number;
  n: number;
}
const rozklad = (a: number[]): Rozklad => {
  const s = posortuj(a);
  return { p50: percentyl(s, 0.5), p99: percentyl(s, 0.99), max: s.length ? s[s.length - 1] : Number.NaN, n: a.length };
};

/** pamięć wczytanego świata drużyny (świat, stan i Sim): różnica po GC dla kilku naraz, na jeden świat */
function pamiecSwiata(klucz: string, tlumPionkow: number, ile = 4) {
  const d = demo(klucz);
  const zbuduj = (s: number) =>
    graj({ geo: d.geo, street: d.street, seed: s, godziny: 0, tryb: 'zwykly', tlum: tlumPionkow });
  zbuduj(seed + 100); // rozgrzewka: moduły, tablice stałe, JIT
  gc();
  const przed = process.memoryUsage();
  const trzymane = Array.from({ length: ile }, (_, k) => zbuduj(seed + k));
  gc();
  const po = process.memoryUsage();
  const naSwiat = (a: number, b: number) => (b - a) / ile;
  const wynik = {
    sterta: naSwiat(przed.heapUsed + przed.external, po.heapUsed + po.external),
    rss: naSwiat(przed.rss, po.rss),
    pionkow: trzymane[0].sim.st.pawns.length,
  };
  trzymane.length = 0;
  return wynik;
}

interface PomiarKrokow {
  budowaMs: number;
  zwykly: Rozklad;
  zarzad: Rozklad;
  skrotMs: number;
  /** średni koszt kroku (zwykłego i z zarządem, bez skrótów) w ms */
  sredniMs: number;
  /** kroki na sekundę bez skrótów (doliczanie nieobecnej drużyny) */
  krokiNaSekunde: number;
  lacznieMs: number;
}

/** jeden przebieg `godziny` godzin gry z zegarem między hakami: koszt budowy, zwykłego kroku, kroku z zarządem i skrótu */
function przebiegZPomiarem(klucz: string, tlumPionkow: number): PomiarKrokow {
  const d = demo(klucz);
  const koniec = godziny * KROKOW_NA_GODZINE;
  const odstepy = new Float64Array(koniec);
  let ostatni = performance.now();
  let budowa = 0;
  graj(
    { geo: d.geo, street: d.street, seed, godziny, tryb: 'zwykly', tlum: tlumPionkow },
    {
      krok(tick) {
        const teraz = performance.now();
        // odstęp od haka tick−1 do tego haka: krok tick−1, zarząd (co 20.) i skrót stanu (co 800.), jeśli tick je kończy
        if (tick === 0) budowa = teraz - ostatni;
        else if (tick > 0) odstepy[tick - 1] = teraz - ostatni;
        ostatni = teraz;
      },
    },
  );
  const zwykle: number[] = [];
  const zarzad: number[] = [];
  const skroty: number[] = [];
  let bezSkrotow = 0;
  // odstępy [0, koniec−1) są pełne; ostatni krok kończy się już po ostatnim haku
  for (let k = 0; k < koniec - 1; k++) {
    const tick = k + 1;
    if (tick % KROKOW_NA_GODZINE === 0) skroty.push(odstepy[k]);
    else {
      bezSkrotow += odstepy[k];
      (tick % KROKOW_NA_SEKUNDE_ZARZADU === 0 ? zarzad : zwykle).push(odstepy[k]);
    }
  }
  const skrot = rozklad(skroty).p50;
  return {
    budowaMs: budowa,
    zwykly: rozklad(zwykle),
    zarzad: rozklad(zarzad),
    // skrót stanu to JSON.stringify całego stanu; odstęp w kroku godzinowym zawiera też zwykły krok, który odejmujemy
    skrotMs: Number.isNaN(skrot) ? 0 : Math.max(0, skrot - rozklad(zwykle).p50),
    sredniMs: bezSkrotow / (zwykle.length + zarzad.length),
    krokiNaSekunde: (zwykle.length + zarzad.length) / (bezSkrotow / 1000),
    lacznieMs: odstepy.reduce((a, b) => a + b, 0),
  };
}

interface PomiarStanu {
  godziny: number;
  jsonBajtow: number;
  gzBajtow: number;
  jsonMs: number;
  gzipMs: number;
  gunzipMs: number;
  parseMs: number;
  simMs: number;
  skrotMs: number;
  zgodny: boolean;
}

/** zapis stanu po `h` godzinach gry do JSON z gzip i wczytanie z powrotem (jak zapis w chmurze i doliczanie po powrocie) */
function pomiarStanu(klucz: string, tlumPionkow: number, h: number): PomiarStanu {
  const d = demo(klucz);
  const gra = graj({ geo: d.geo, street: d.street, seed, godziny: h, tryb: 'zwykly', tlum: tlumPionkow });
  const st = gra.sim.st;
  const json = JSON.stringify(st);
  const gz = gzipSync(json);
  const parsed = JSON.parse(gunzipSync(gz).toString('utf8'));
  return {
    godziny: h,
    jsonBajtow: Buffer.byteLength(json),
    gzBajtow: gz.length,
    jsonMs: najmniejszy(() => timing(() => JSON.stringify(st)), 5),
    gzipMs: najmniejszy(() => timing(() => gzipSync(json)), 5),
    gunzipMs: najmniejszy(() => timing(() => gunzipSync(gz)), 5),
    parseMs: najmniejszy(() => timing(() => JSON.parse(json)), 5),
    simMs: najmniejszy(() => timing(() => new Sim(gra.swiat, JSON.parse(json))), 3),
    skrotMs: najmniejszy(() => timing(() => gra.sim.hash()), 5),
    zgodny: new Sim(gra.swiat, parsed).hash() === gra.sim.hash(),
  };
}
const timing = (f: () => unknown) => {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
};

// ---------------------------------------------------------------------------------------------------------------------
// raport

const cpu = os.cpus();
const obciazenie = () =>
  os
    .loadavg()
    .map((x) => x.toFixed(1))
    .join(' ');
const naglowek = [
  `Pojemność serwera świata, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  `maszyna: ${cpu[0]?.model ?? '?'}, ${cpu.length} rdzeni, ${(os.totalmem() / 1024 ** 3).toFixed(0)} GB RAM, ${os.platform()} ${os.release()}, ${os.arch()}`,
  `Node ${process.versions.node} (V8 ${process.versions.v8}), obciążenie maszyny na starcie (1, 5 i 15 min): ${obciazenie()}`,
  `scenariusz: ${godziny} h gry od 15:00 dnia 1, ziarno ${seed}, zarząd 4 osoby z polityką „zawsze warta”, tryb zwykły; każdy pomiar czasu ${powtorz}× (najkrótszy przebieg), tłum ${tlum} pionków za siatką`,
];
for (const l of naglowek) console.log(l);
console.log('');

const json: Record<string, unknown> = { naglowek, wyniki: {} };
const wyniki: Record<string, unknown> = json.wyniki as Record<string, unknown>;
const swiatDlaSumy: Record<string, { sterta: number; krok: number; krokiNaSekunde: number; gz24: number }> = {};

for (const klucz of dema) {
  for (const t of tlum ? [0, tlum] : [0]) {
    const etykieta = `${klucz}${t ? ` + tłum ${t}` : ''}`;
    process.stderr.write(`  ${etykieta}…\n`);
    const pamiec = pamiecSwiata(klucz, t);
    let najlepszy: PomiarKrokow | null = null;
    for (let r = 0; r < powtorz; r++) {
      const p = przebiegZPomiarem(klucz, t);
      if (!najlepszy || p.lacznieMs < najlepszy.lacznieMs) najlepszy = p;
    }
    const k = najlepszy as PomiarKrokow;
    const stany = [1, godziny, 3 * godziny].map((h) => pomiarStanu(klucz, t, h));
    wyniki[etykieta] = { pamiec, kroki: k, stany };

    console.log(`== ${etykieta} (${pamiec.pionkow} pionków po starcie)`);
    console.log(
      `pamięć na wczytany świat (świat, stan, Sim): sterta ${mb(pamiec.sterta)}, RSS ${mb(pamiec.rss)} (orientacyjnie)`,
    );
    console.log(
      `budowa świata i stanu (buildWorld, createSim, Sim; najlepszy przebieg, już po rozgrzewce): ${ms(k.budowaMs)} ms`,
    );
    for (const l of tabelaLinie([
      ['krok', 'liczba', 'p50 ms', 'p99 ms', 'najgorszy ms'],
      ['zwykły', String(k.zwykly.n), ms(k.zwykly.p50), ms(k.zwykly.p99), ms(k.zwykly.max)],
      ['z zarządem (co 20.)', String(k.zarzad.n), ms(k.zarzad.p50), ms(k.zarzad.p99), ms(k.zarzad.max)],
    ]))
      console.log(l);
    console.log(
      `średni krok ${ms(k.sredniMs)} ms; doliczanie bez skrótów ${k.krokiNaSekunde.toFixed(0)} kroków na sekundę; skrót stanu godzinowy ${ms(k.skrotMs)} ms ponad zwykły krok`,
    );
    for (const l of tabelaLinie([
      ['stan po', 'JSON', 'gzip', 'JSON ms', 'gzip ms', 'gunzip ms', 'parse ms', 'nowy Sim ms', 'skrót ms', 'zgodny'],
      ...stany.map((s) => [
        `${s.godziny} h gry`,
        kb(s.jsonBajtow),
        kb(s.gzBajtow),
        ms(s.jsonMs),
        ms(s.gzipMs),
        ms(s.gunzipMs),
        ms(s.parseMs),
        ms(s.simMs),
        ms(s.skrotMs),
        s.zgodny ? 'tak' : 'NIE',
      ]),
    ]))
      console.log(l);
    console.log('');
    swiatDlaSumy[etykieta] = {
      sterta: pamiec.sterta,
      krok: k.sredniMs,
      krokiNaSekunde: k.krokiNaSekunde,
      gz24: stany[1].gzBajtow,
    };
  }
}

// z liczb wyżej do celu etapu 1: 50 drużyn zapisanych, 10 graczy naraz, 5 kroków na sekundę (rekomendacja ze specyfikacji)
const GRACZY = 10;
const DRUZYN = 50;
const KROKOW_NA_SEKUNDE = 5;
console.log(
  `== do celu etapu 1: ${DRUZYN} drużyn zapisanych, ${GRACZY} graczy naraz, ${KROKOW_NA_SEKUNDE} kroków na sekundę świata`,
);
const wiersze: string[][] = [
  [
    'świat',
    `pamięć ${GRACZY} światów`,
    `CPU ${GRACZY} światów`,
    `${DRUZYN} zapisów gzip`,
    'doliczenie 8 h',
    'doliczenie 7 dni',
  ],
];
for (const [klucz, w] of Object.entries(swiatDlaSumy)) {
  const procentRdzenia = (100 * GRACZY * KROKOW_NA_SEKUNDE * w.krok) / 1000;
  wiersze.push([
    klucz,
    mb(GRACZY * w.sterta),
    `${procentRdzenia.toFixed(procentRdzenia < 1 ? 2 : 1)}% rdzenia`,
    mb(DRUZYN * w.gz24),
    `${((8 * 3600 * KROKOW_NA_SEKUNDE) / w.krokiNaSekunde).toFixed(1)} s`,
    `${((7 * 24 * 3600 * KROKOW_NA_SEKUNDE) / w.krokiNaSekunde / 60).toFixed(1)} min`,
  ]);
}
for (const l of tabelaLinie(wiersze)) console.log(l);
console.log(
  `(CPU: ${GRACZY} światów × ${KROKOW_NA_SEKUNDE} kroków na sekundę × średni koszt kroku z zarządem; doliczanie: kroki nieobecności ÷ szybkość doliczania; zapis: stan po ${godziny} h gry)`,
);
console.log(`obciążenie maszyny na końcu (1, 5 i 15 min): ${obciazenie()}`);

const plik = wartosc('json');
if (plik) fs.writeFileSync(plik, JSON.stringify(json));
