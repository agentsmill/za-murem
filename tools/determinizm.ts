/* Bramka determinizmu silników JS (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md, „Bramka etapu 0”):
   czy Chromium, Firefox, WebKit (Safari) i Node 24 liczą tę samą grę bit w bit. Ten sam ustalony przebieg gry
   (tools/determinizm/przebieg.ts: świat z dema, zarząd z polityką „zawsze warta”, stałe polecenia) idzie w każdym
   silniku, a skrót świata zaraz po zbudowaniu i skrót stanu po każdej pełnej godzinie gry są porównywane. Każdy
   silnik liczy każdy scenariusz dwa razy w tym samym procesie (powtarzalność w obrębie silnika: inaczej rozbieżność
   między silnikami nic nie znaczy).

   Nogi: Node bieżący i Node 24 (osobne procesy; 24 z ZM_NODE24, nvm albo Homebrew, jeśli bieżący to nie 24),
   Chromium, Firefox i WebKit z Playwright (strona tools/determinizm/strona.html z serwera Vite w procesie, jak w
   tools/shots.ts) oraz systemowy jsc z macOS (JavaScriptCore bez przeglądarki: przebieg zbudowany w jeden plik ES
   przez Vite, geo dema wstawione do pliku). Czego nie ma na tej maszynie, tego nie pobieramy: wiersz „brak (…)” z
   poleceniem, które to uzupełni, i kod wyjścia 2.

   Gdy skróty się rozjadą, narzędzie liczy tę godzinę gry jeszcze raz z nagrywaniem wywołań Math w każdym silniku
   (tools/determinizm/nagrywanie.ts), znajduje pierwsze wywołanie z innym wynikiem (funkcja, argumenty, wyniki) i jego
   miejsce w kodzie (plik:linia ze stosu Node). Rozbieżność już w skrócie świata znaczy buildWorld, więc nagrywa się
   wtedy budowę świata.

   Uruchomienie: npm run determinizm [-- --demo=przymorze|lanciego|zielonki] [--godziny=24] [--zombie|--zwykly]
                                       [--seed=12345[,2,3]] [--silniki=node,chromium,jsc] [--json=plik.json]
                                       [--nagraj[=godzina]] [--psuj=silnik:funkcja]
   Bez --demo: trzy dema; bez --zombie i --zwykly: oba tryby gry. --nagraj: nagrywanie przy rozbieżności jest
   domyślne; z numerem godziny (od 0) nagrywa tę godzinę gry w każdym scenariuszu, także gdy skróty są zgodne.
   --psuj=jsc:hypot to samotest bramki: noga jsc zwiększa każdy wynik hypot o jeden bit, a bramka ma to zauważyć.
   Kod wyjścia: 0 przy zgodzie wszystkich silników docelowych (Chromium, Firefox, WebKit, Node 24), 1 przy
   rozbieżności albo niepowtarzalnym silniku (z godziną gry i skrótami każdego silnika), 2 przy braku silnika
   docelowego, 64 przy złych argumentach. Silniki dodatkowe (Node bieżący, jsc) liczą się do zgodności, ale ich brak
   nie daje kodu 2. */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { type BrowserType, chromium, firefox, webkit } from '@playwright/test';
import { build, createServer } from 'vite';
import { NAGRYWANE, odkodujWywolania, pierwszaRoznica, type Wywolanie } from './determinizm/nagrywanie.ts';
import { porownaj } from './determinizm/porownanie.ts';
import { kodWyjscia, miejscaZeStosu } from './determinizm/raport.ts';
import type { WynikNogi } from './determinizm/uruchom.ts';
import { doParametrow, GODZINY_DOMYSLNE, SEED_DOMYSLNE, type Tryb, type Zlecenie } from './determinizm/zlecenie.ts';

const KORZEN = path.resolve(import.meta.dirname, '..');
const NOGA_NODE = path.join(KORZEN, 'tools/determinizm/noga-node.ts');
const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
const DEMA = ['przymorze', 'lanciego', 'zielonki'];
/** najdłużej czekamy na jedno zlecenie jednej nogi (przebieg 72 h gry trwa w każdym silniku kilka sekund) */
const LIMIT_MS = 15 * 60_000;
const MAX_BUFOR = 512 * 1024 * 1024;
const KROKOW_NA_GODZINE = 800;

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------------------------------------------------
// argumenty

const SILNIKI = ['node', 'node24', 'chromium', 'firefox', 'webkit', 'jsc'];
const ZNANE = ['demo', 'godziny', 'zombie', 'zwykly', 'seed', 'silniki', 'json', 'nagraj', 'psuj'];
const argumenty = process.argv.slice(2);
function blad(tekst: string): never {
  console.error(
    `${tekst}\nUżycie: npm run determinizm [-- --demo=przymorze|lanciego|zielonki] [--godziny=24] [--zombie|--zwykly] [--seed=12345,2] [--silniki=${SILNIKI.join(',')}] [--json=plik.json] [--nagraj[=godzina]] [--psuj=silnik:funkcja]`,
  );
  process.exit(64);
}
for (const a of argumenty)
  if (!ZNANE.includes(a.replace(/^--/, '').split('=')[0]) || !a.startsWith('--')) blad(`Nieznany argument: ${a}`);
const wartosc = (nazwa: string) => argumenty.find((a) => a.startsWith(`--${nazwa}=`))?.slice(nazwa.length + 3);
const jest = (nazwa: string) => argumenty.includes(`--${nazwa}`);

const godziny = Number(wartosc('godziny') ?? GODZINY_DOMYSLNE);
if (!Number.isInteger(godziny) || godziny < 1) blad(`--godziny to liczba całkowita od 1, jest „${wartosc('godziny')}”`);
const dema = wartosc('demo') ? [wartosc('demo') as string] : DEMA;
for (const d of dema)
  if (!fs.existsSync(path.join(KORZEN, `public/demo/${d}.json`)))
    blad(`Nieznane demo: „${d}” (są: ${DEMA.join(', ')})`);
const ziarna = (wartosc('seed') ?? String(SEED_DOMYSLNE)).split(',').map(Number);
if (ziarna.some((s) => !Number.isInteger(s) || s < 0))
  blad(`--seed to liczby całkowite od 0 po przecinku, jest „${wartosc('seed')}”`);
const tryby: Tryb[] = jest('zombie') !== jest('zwykly') ? [jest('zombie') ? 'zombie' : 'zwykly'] : ['zwykly', 'zombie'];
const filtr = wartosc('silniki')?.split(',');
for (const id of filtr ?? []) if (!SILNIKI.includes(id)) blad(`Nieznany silnik: „${id}” (są: ${SILNIKI.join(', ')})`);
/** godzina (od 0) nagrywana w każdym scenariuszu, także przy zgodnych skrótach */
const wymuszonaGodzina = wartosc('nagraj') === undefined ? null : Number(wartosc('nagraj'));
if (
  wymuszonaGodzina !== null &&
  (!Number.isInteger(wymuszonaGodzina) || wymuszonaGodzina < 0 || wymuszonaGodzina >= godziny)
)
  blad(`--nagraj=godzina to liczba całkowita od 0 do ${godziny - 1}, jest „${wartosc('nagraj')}”`);
const [psujSilnik, psujFunkcja] = (wartosc('psuj') ?? '').split(':');
if (
  wartosc('psuj') !== undefined &&
  (!SILNIKI.includes(psujSilnik) || !(NAGRYWANE as readonly string[]).includes(psujFunkcja))
)
  blad(`--psuj=silnik:funkcja, jest „${wartosc('psuj')}” (funkcje: ${NAGRYWANE.join(', ')})`);

interface Scenariusz {
  demo: string;
  tryb: Tryb;
  seed: number;
}
const scenariusze: Scenariusz[] = dema.flatMap((demo) =>
  tryby.flatMap((tryb) => ziarna.map((seed) => ({ demo, tryb, seed }))),
);
const opisScenariusza = (s: Scenariusz) =>
  `${s.demo} ${s.tryb === 'zombie' ? 'zombie' : 'zwykły'} ${godziny} h${ziarna.length > 1 ? ` ziarno ${s.seed}` : ''}`;

// ---------------------------------------------------------------------------------------------------------------------
// nogi

type WynikZAgentem = WynikNogi & { agent?: string };

interface Noga {
  id: string;
  etykieta: string;
  /** silnik docelowy bramki: jego brak to kod wyjścia 2 */
  docelowa: boolean;
  /** wersja silnika albo null, gdy nogi nie da się uruchomić */
  wersja: string | null;
  /** przyczyna braku i polecenie, które to uzupełni */
  brak?: string;
  licz(z: Zlecenie): Promise<WynikZAgentem>;
  zamknij(): Promise<void>;
}

const brakNogi = (id: string, etykieta: string, docelowa: boolean, brak: string): Noga => ({
  id,
  etykieta,
  docelowa,
  wersja: null,
  brak,
  licz: async () => {
    throw new Error(`silnik ${id}: ${brak}`);
  },
  zamknij: async () => {},
});

const pierwszaLinia = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0];

/** Node jako osobny proces (tools/determinizm/noga-node.ts); wersję i V8 odczytuje z tej binarki */
async function nogaNode(id: string, etykieta: string, docelowa: boolean, binarka: string): Promise<Noga> {
  const { stdout } = await execFileP(binarka, ['-p', "process.versions.node + ' ' + process.versions.v8"]);
  const [wersjaNode, wersjaV8] = stdout.trim().split(' ');
  return {
    id,
    etykieta,
    docelowa,
    wersja: `Node ${wersjaNode} (V8 ${wersjaV8})`,
    async licz(z) {
      const args = Object.entries(doParametrow(z)).map(([k, v]) => `--${k}=${v}`);
      const { stdout: wyjscie } = await execFileP(binarka, [NOGA_NODE, ...args], {
        maxBuffer: MAX_BUFOR,
        timeout: LIMIT_MS,
      });
      return JSON.parse(wyjscie);
    },
    zamknij: async () => {},
  };
}

/** Node 24 (wzorzec CI i obrazu serwera): ZM_NODE24, potem nvm, potem Homebrew; null, gdy go nie ma */
async function znajdzNode24(): Promise<string | null> {
  const kandydaci: string[] = [];
  if (process.env.ZM_NODE24) kandydaci.push(process.env.ZM_NODE24);
  const nvm = path.join(process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm'), 'versions/node');
  if (fs.existsSync(nvm))
    kandydaci.push(
      ...fs
        .readdirSync(nvm)
        .filter((v) => /^v24\./.test(v))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((v) => path.join(nvm, v, 'bin/node')),
    );
  kandydaci.push('/opt/homebrew/opt/node@24/bin/node', '/usr/local/opt/node@24/bin/node');
  for (const k of kandydaci) {
    if (!fs.existsSync(k)) continue;
    try {
      if ((await execFileP(k, ['--version'])).stdout.startsWith('v24.')) return k;
    } catch {}
  }
  return null;
}

/** serwer Vite w procesie, jeden na całe uruchomienie, stawiany przy pierwszej przeglądarce */
const serwer: { vite: Promise<{ adres: string; zamknij: () => Promise<void> }> | null } = { vite: null };
function serwerVite() {
  serwer.vite ??= (async () => {
    const dev = await createServer({
      root: KORZEN,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      // strona nie ma zależności z npm, więc skanowanie index.html w poszukiwaniu pixi.js nie jest potrzebne
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'error',
    });
    await dev.listen();
    const a = dev.httpServer!.address();
    return { adres: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 5173}/`, zamknij: () => dev.close() };
  })();
  return serwer.vite;
}

/** przeglądarka z Playwright: strona testowa w świeżym kontekście na każde zlecenie */
async function nogaPrzegladarka(typ: BrowserType, id: string, etykieta: string): Promise<Noga> {
  let sciezka = '';
  try {
    sciezka = typ.executablePath();
  } catch {}
  const uzupelnij = `npx playwright install ${id}`;
  if (!sciezka || !fs.existsSync(sciezka)) return brakNogi(id, etykieta, true, `brak (${uzupelnij})`);
  let przegladarka: Awaited<ReturnType<BrowserType['launch']>>;
  try {
    przegladarka = await typ.launch({ headless: true });
  } catch (e) {
    return brakNogi(id, etykieta, true, `nie uruchamia się: ${pierwszaLinia(e)} (${uzupelnij})`);
  }
  return {
    id,
    etykieta,
    docelowa: true,
    wersja: `${etykieta} ${przegladarka.version()}`,
    async licz(z) {
      const { adres } = await serwerVite();
      const kontekst = await przegladarka.newContext();
      try {
        const strona = await kontekst.newPage();
        await strona.goto(`${adres}tools/determinizm/strona.html?${new URLSearchParams(doParametrow(z))}`);
        await strona.waitForFunction(() => window.wynik, null, { timeout: LIMIT_MS, polling: 250 });
        const wynik = await strona.evaluate(() => window.wynik);
        if (!wynik || 'blad' in wynik) throw new Error(wynik ? wynik.blad : 'strona nie oddała wyniku');
        return wynik;
      } finally {
        await kontekst.close();
      }
    },
    zamknij: () => przegladarka.close(),
  };
}

/** przebieg zbudowany w jeden plik ES: Vite w trybie biblioteki, w pamięci (wejscie-jsc.ts) */
async function zbudujPaczke(): Promise<string> {
  const wynik = await build({
    configFile: false,
    root: KORZEN,
    logLevel: 'error',
    publicDir: false,
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      lib: { entry: path.join(KORZEN, 'tools/determinizm/wejscie-jsc.ts'), formats: ['es'], fileName: 'paczka' },
    },
  });
  const wyjscie = Array.isArray(wynik) ? wynik[0] : wynik;
  if (!('output' in wyjscie)) throw new Error('Vite nie zwrócił paczki');
  const kawalek = wyjscie.output.find((o) => o.type === 'chunk');
  if (kawalek?.type !== 'chunk') throw new Error('Vite nie zwrócił paczki');
  return kawalek.code;
}

/** systemowy jsc z macOS: paczka w katalogu tymczasowym, a geo dema wstawione do pliku danych każdego zlecenia */
async function nogaJsc(): Promise<Noga> {
  if (process.platform !== 'darwin' || !fs.existsSync(JSC))
    return brakNogi('jsc', 'jsc', false, 'brak (systemowy jsc jest tylko w macOS)');
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-jsc-'));
  const paczka = path.join(katalog, 'paczka.mjs');
  fs.writeFileSync(paczka, await zbudujPaczke());
  const macos = (await execFileP('sw_vers', ['-productVersion'])).stdout.trim();
  let n = 0;
  return {
    id: 'jsc',
    etykieta: 'jsc',
    docelowa: false,
    wersja: `JavaScriptCore z macOS ${macos}`,
    async licz(z) {
      const demo = JSON.parse(fs.readFileSync(path.join(KORZEN, `public/demo/${z.demo}.json`), 'utf8'));
      const dane = path.join(katalog, `dane-${n++}.mjs`);
      fs.writeFileSync(
        dane,
        `globalThis.ZLECENIE = ${JSON.stringify(z)};\nglobalThis.DANE = ${JSON.stringify({ geo: demo.geo, street: demo.street })};\n`,
      );
      const { stdout } = await execFileP(JSC, [dane, paczka], { maxBuffer: MAX_BUFOR, timeout: LIMIT_MS });
      return JSON.parse(stdout.trim().split('\n').pop() ?? '');
    },
    zamknij: async () => {
      fs.rmSync(katalog, { recursive: true, force: true });
    },
  };
}

async function zbierzNoge(): Promise<Noga[]> {
  const wszystkie: Noga[] = [];
  const dodaj = async (id: string, f: () => Promise<Noga>) => {
    if (filtr && !filtr.includes(id)) return;
    try {
      wszystkie.push(await f());
    } catch (e) {
      wszystkie.push(brakNogi(id, id, id !== 'jsc' && id !== 'node', `nie da się przygotować: ${pierwszaLinia(e)}`));
    }
  };
  const biezacy24 = process.versions.node.startsWith('24.');
  // bieżący Node jest wzorcem, gdy to 24; inaczej jest silnikiem dodatkowym obok osobnej nogi Node 24
  await dodaj(biezacy24 ? 'node24' : 'node', () =>
    nogaNode(biezacy24 ? 'node24' : 'node', biezacy24 ? 'Node 24' : 'Node', biezacy24, process.execPath),
  );
  if (!biezacy24)
    await dodaj('node24', async () => {
      const binarka = await znajdzNode24();
      return binarka
        ? nogaNode('node24', 'Node 24', true, binarka)
        : brakNogi(
            'node24',
            'Node 24',
            true,
            'brak (nvm install 24 albo ZM_NODE24=/ścieżka/do/node24, albo obraz node:24-alpine)',
          );
    });
  await dodaj('chromium', () => nogaPrzegladarka(chromium, 'chromium', 'Chromium'));
  await dodaj('firefox', () => nogaPrzegladarka(firefox, 'firefox', 'Firefox'));
  await dodaj('webkit', () => nogaPrzegladarka(webkit, 'webkit', 'WebKit'));
  await dodaj('jsc', nogaJsc);
  return wszystkie;
}

// ---------------------------------------------------------------------------------------------------------------------
// liczenie

const noge = await zbierzNoge();
const dostepne = noge.filter((n) => n.wersja !== null);
const wyniki = new Map<string, WynikZAgentem>();
const bledy = new Map<string, string>();
const czasy = new Map<string, number>();
const klucz = (n: Noga, s: Scenariusz) => `${n.id}|${s.demo}|${s.tryb}|${s.seed}`;

/** zlecenie dla nogi: dwa przebiegi w jednym procesie, z samotestem (--psuj) tylko w wskazanej nodze */
const zlecenieNogi = (n: Noga, s: Scenariusz, dodatki: Partial<Zlecenie> = {}): Zlecenie => ({
  demo: s.demo,
  godziny,
  tryb: s.tryb,
  seed: s.seed,
  powtorz: 2,
  ...(psujSilnik === n.id ? { psuj: psujFunkcja } : {}),
  ...dodatki,
});

console.error(
  `Determinizm: ${scenariusze.length} scenariuszy po ${godziny} h gry, silniki: ${dostepne.map((n) => n.id).join(', ') || 'żaden'}`,
);
if (psujSilnik) console.error(`  samotest: noga ${psujSilnik} zwiększa każdy wynik ${psujFunkcja} o jeden bit`);

// ---------------------------------------------------------------------------------------------------------------------
// raport

function tabela(wiersze: string[][]): void {
  const szer = wiersze[0].map((_, i) => Math.max(...wiersze.map((w) => [...(w[i] ?? '')].length)));
  for (const w of wiersze)
    console.log(
      w
        .map((c, i) => c.padEnd(szer[i]))
        .join('  ')
        .trimEnd(),
    );
}

const liczbaNaTekst = (x: number) => (Object.is(x, -0) ? '-0' : String(x));
const wywolanieNaTekst = (w: Wywolanie | undefined) =>
  w ? `${w[0]}(${w[1].map(liczbaNaTekst).join(', ')}) = ${liczbaNaTekst(w[2])}` : '(brak wywołania)';

interface Okno {
  od: number;
  do: number;
}

/** przedział kroków godziny gry o indeksie g; pierwsza godzina obejmuje też budowę świata (krok −1) */
const oknoGodziny = (g: number): Okno => ({
  od: g === 0 ? -1 : g * KROKOW_NA_GODZINE,
  do: (g + 1) * KROKOW_NA_GODZINE,
});
const opisOkna = (o: Okno) =>
  o.od < 0 && o.do === 0
    ? 'budowa świata'
    : `kroki ${Math.max(0, o.od)}–${o.do - 1}${o.od < 0 ? ' i budowa świata' : ''}`;

/** Nagrywa przedział w każdej nodze, która policzyła scenariusz, i porównuje z nagraniem wzorca: pierwsze wywołanie
    z innym wynikiem (albo argumentami), a do niego stos z Node: miejsce w kodzie. Zwraca linie raportu. */
async function nagrajScenariusz(s: Scenariusz, okno: Okno, wzorzec: Noga): Promise<string[]> {
  const linie: string[] = [`  nagranie wywołań Math (${opisOkna(okno)}), wzorzec ${wzorzec.id}:`];
  const nagrania = new Map<string, Wywolanie[]>();
  await Promise.all(
    dostepne
      .filter((n) => wyniki.has(klucz(n, s)))
      .map(async (n) => {
        try {
          const w = await n.licz(zlecenieNogi(n, s, { powtorz: 1, nagraj: okno }));
          nagrania.set(n.id, odkodujWywolania(w.biegi[0].nagranie ?? []));
        } catch (e) {
          linie.push(`    ${n.id}: BŁĄD nagrywania: ${pierwszaLinia(e)}`);
        }
      }),
  );
  const wzorcowe = nagrania.get(wzorzec.id);
  if (!wzorcowe) return [...linie, '    brak nagrania wzorca'];
  let pierwszy: number | null = null;
  for (const n of dostepne) {
    const inne = nagrania.get(n.id);
    if (!inne || n === wzorzec) continue;
    const r = pierwszaRoznica(wzorcowe, inne);
    if (!r) {
      linie.push(`    ${n.id}: wywołania identyczne (${inne.length})`);
      continue;
    }
    pierwszy = pierwszy === null ? r.i : Math.min(pierwszy, r.i);
    const tylkoWynik =
      r.a &&
      r.b &&
      r.a[0] === r.b[0] &&
      r.a[1].length === r.b[1].length &&
      r.a[1].every((v, k) => Object.is(v, r.b?.[1][k]));
    linie.push(
      `    ${n.id}: RÓŻNICA w wywołaniu nr ${r.i} z ${wzorcowe.length}`,
      `      ${wzorzec.id.padEnd(9)} ${wywolanieNaTekst(r.a)}`,
      `      ${n.id.padEnd(9)} ${wywolanieNaTekst(r.b)}`,
      tylkoWynik
        ? `      to funkcja ${r.a?.[0]}: te same argumenty, inny wynik`
        : '      argumenty różne: rozbieżność powstała wcześniej, poza nagrywanymi funkcjami (operator **, inna różnica silnika) albo przed nagranym przedziałem',
    );
  }
  if (pierwszy !== null) {
    // stos wywołania z czystego przebiegu w Node: numery linii zgadzają się ze źródłem
    const nodeowa =
      dostepne.find((n) => n === wzorzec && n.id.startsWith('node')) ?? dostepne.find((n) => n.id.startsWith('node'));
    if (nodeowa) {
      try {
        const w = await nodeowa.licz(zlecenieNogi(nodeowa, s, { powtorz: 1, nagraj: { ...okno, stosPrzy: pierwszy } }));
        const miejsca = miejscaZeStosu(w.biegi[0].stos ?? '', KORZEN);
        linie.push(
          miejsca.length
            ? `    miejsce w kodzie (${nodeowa.id}): ${miejsca.join(' <- ')}`
            : '    miejsce w kodzie: stos bez ramek z plików',
        );
      } catch (e) {
        linie.push(`    miejsce w kodzie: BŁĄD ${pierwszaLinia(e)}`);
      }
    } else
      linie.push(
        '    miejsce w kodzie: brak nogi Node (--silniki=node albo node24), stos z przeglądarki nie wskazuje linii',
      );
  }
  return linie;
}

try {
  await Promise.all(
    dostepne.map(async (n) => {
      for (const s of scenariusze) {
        const t0 = Date.now();
        try {
          wyniki.set(klucz(n, s), await n.licz(zlecenieNogi(n, s)));
        } catch (e) {
          bledy.set(klucz(n, s), pierwszaLinia(e));
        }
        const ms = Date.now() - t0;
        czasy.set(n.id, (czasy.get(n.id) ?? 0) + ms);
        console.error(
          `  [${n.id}] ${opisScenariusza(s)}: ${bledy.has(klucz(n, s)) ? `BŁĄD ${bledy.get(klucz(n, s))}` : `${(ms / 1000).toFixed(1)} s`}`,
        );
      }
    }),
  );

  // wzorzec do kolumny „zgodny z”: Node 24, a bez niego pierwszy dostępny
  const wzorzec = dostepne.find((n) => n.id === 'node24') ?? dostepne[0];
  const skroty = (n: Noga, s: Scenariusz, bieg = 0) => wyniki.get(klucz(n, s))?.biegi[bieg]?.skroty;
  const swiat = (n: Noga, s: Scenariusz, bieg = 0) => wyniki.get(klucz(n, s))?.biegi[bieg]?.swiat;
  let rozbiezne = false;
  const opisy: string[] = [];
  /** nogi, które w tym scenariuszu różnią się od wzorca, do kolumny „zgodny z” */
  const niezgodne = new Set<string>();

  for (const s of scenariusze) {
    const liczyly = dostepne.filter((n) => skroty(n, s));
    const opis: string[] = [];
    let okno: Okno | null = null;
    // świat zaraz po zbudowaniu: stan gry go nie obejmuje, a klient i serwer muszą budować ten sam
    const rozneSwiaty = new Set(liczyly.map((n) => swiat(n, s)));
    if (rozneSwiaty.size > 1) {
      rozbiezne = true;
      okno = { od: -1, do: 0 };
      opis.push(
        `ROZBIEŻNOŚĆ ŚWIATA ${opisScenariusza(s)}: buildWorld buduje inny świat`,
        ...liczyly.map((n) => `    ${n.id.padEnd(9)} ${swiat(n, s)}`),
      );
      for (const n of liczyly) if (swiat(n, s) !== swiat(wzorzec, s)) niezgodne.add(n.id);
    }
    const cross = porownaj(Object.fromEntries(liczyly.map((n) => [n.id, skroty(n, s) as string[]])));
    if (!cross.zgodne && cross.pierwsza) {
      rozbiezne = true;
      const g = cross.pierwsza.godzina;
      okno ??= oknoGodziny(g);
      opis.push(
        `ROZBIEŻNOŚĆ ${opisScenariusza(s)}: pierwsza po ${g + 1}. godzinie gry (kroki ${g * KROKOW_NA_GODZINE}–${(g + 1) * KROKOW_NA_GODZINE - 1}, skrót nr ${g})`,
        ...Object.entries(cross.pierwsza.silniki).map(([id, h]) => `    ${id.padEnd(9)} ${h}`),
      );
      for (const n of liczyly) if (skroty(n, s)?.join() !== skroty(wzorzec, s)?.join()) niezgodne.add(n.id);
    }
    for (const n of liczyly) {
      const biegi = wyniki.get(klucz(n, s))?.biegi ?? [];
      const self = porownaj(Object.fromEntries(biegi.map((b, i) => [`przebieg ${i + 1}`, b.skroty])));
      if (!self.zgodne && self.pierwsza) {
        rozbiezne = true;
        opis.push(
          `NIEPOWTARZALNY ${n.id} w ${opisScenariusza(s)}: przebiegi różnią się po ${self.pierwsza.godzina + 1}. godzinie gry`,
          ...Object.entries(self.pierwsza.silniki).map(([id, h]) => `    ${id.padEnd(11)} ${h}`),
        );
      } else if (new Set(biegi.map((b) => b.swiat)).size > 1) {
        rozbiezne = true;
        opis.push(`NIEPOWTARZALNY ${n.id} w ${opisScenariusza(s)}: przebiegi budują inny świat`);
      }
    }
    // nagrywanie: przy rozbieżności albo na życzenie (--nagraj=godzina)
    if (!okno && wymuszonaGodzina !== null) okno = oknoGodziny(wymuszonaGodzina);
    if (okno && liczyly.length > 1 && wzorzec && wyniki.has(klucz(wzorzec, s))) {
      if (!opis.length) opis.push(`zgodne: ${opisScenariusza(s)} (nagranie na życzenie, --nagraj=${wymuszonaGodzina})`);
      opis.push(...(await nagrajScenariusz(s, okno, wzorzec)));
    }
    opisy.push(...opis);
  }
  for (const [k, e] of bledy) {
    rozbiezne = true;
    opisy.push(`BŁĄD ${k.split('|')[0]} w ${k.split('|').slice(1).join(' ')}: ${e}`);
  }

  console.log(
    `Determinizm silników JS: ${scenariusze.length} scenariuszy po ${godziny} h gry (${dema.join(', ')}; ${tryby.join(' i ')}), każdy liczony 2 razy w jednym procesie`,
  );
  console.log('');
  const wiersze: string[][] = [['silnik', 'wersja', 'powtarzalny', `zgodny z ${wzorzec?.id ?? '-'}`, 'czas']];
  for (const n of noge) {
    if (n.wersja === null) {
      wiersze.push([n.id, n.brak ?? 'brak', '', '', '']);
      continue;
    }
    const mojeBledy = scenariusze.filter((s) => bledy.has(klucz(n, s))).length;
    const powt = scenariusze.every((s) => {
      const biegi = wyniki.get(klucz(n, s))?.biegi ?? [];
      return biegi.every((b) => b.skroty.join() === biegi[0].skroty.join() && b.swiat === biegi[0].swiat);
    });
    const zgodny = n === wzorzec ? 'wzorzec' : niezgodne.has(n.id) ? 'NIE' : 'tak';
    wiersze.push([
      n.id,
      n.wersja,
      mojeBledy ? `BŁĄD (${mojeBledy})` : powt ? 'tak' : 'NIE',
      mojeBledy ? '' : zgodny,
      `${((czasy.get(n.id) ?? 0) / 1000).toFixed(1)} s`,
    ]);
  }
  tabela(wiersze);
  console.log('');
  if (opisy.length) for (const o of opisy) console.log(o);
  if (!rozbiezne)
    for (const s of scenariusze) {
      const koniec = skroty(dostepne[0], s)?.at(-1);
      if (koniec)
        console.log(
          `zgodne: ${opisScenariusza(s).padEnd(28)} świat ${swiat(dostepne[0], s)}, skrót po ${godziny} h: ${koniec}`,
        );
    }

  const brakujace = noge.filter((n) => n.wersja === null && n.docelowa).map((n) => n.id);
  if (brakujace.length)
    console.log(
      `\nBrakuje silników docelowych: ${brakujace.join(', ')}. ${noge
        .filter((n) => brakujace.includes(n.id))
        .map((n) => `${n.id}: ${n.brak}`)
        .join('; ')}`,
    );

  const json = wartosc('json');
  if (json)
    fs.writeFileSync(
      json,
      JSON.stringify({
        godziny,
        noge: noge.map((n) => ({ id: n.id, wersja: n.wersja, brak: n.brak ?? null })),
        wyniki: Object.fromEntries(wyniki),
        bledy: Object.fromEntries(bledy),
      }),
    );

  const kod = kodWyjscia({ rozbiezne, brakujaceDocelowe: brakujace });
  const zgodnosc = filtr
    ? 'zgodność wybranych silników (pełna bramka: bez --silniki)'
    : 'zgodność wszystkich silników docelowych';
  console.log(
    `\nKod wyjścia ${kod}: ${kod === 0 ? zgodnosc : kod === 1 ? 'rozbieżność albo niepowtarzalny silnik' : 'zgodność dostępnych silników, ale brakuje silników docelowych'}`,
  );
  process.exitCode = kod;
} finally {
  await Promise.all(noge.map((n) => n.zamknij().catch(() => {})));
  if (serwer.vite) await (await serwer.vite).zamknij().catch(() => {});
}
