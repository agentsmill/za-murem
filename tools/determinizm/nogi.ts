/* Nogi bramki determinizmu (bramka.ts): konstruktory silników, które liczą ten sam przebieg gry. Node bieżący i Node 24
   to osobne procesy (tools/determinizm/noga-node.ts; 24 z ZM_NODE24, nvm albo Homebrew, jeśli bieżący to nie 24),
   Chromium, Firefox i WebKit to przeglądarki z Playwright ładujące stronę testową (strona.html) z serwera Vite w
   procesie (protokół i szybkie wykrywanie awarii: przegladarka.ts), a jsc to systemowy JavaScriptCore z macOS
   (przebieg zbudowany w jeden plik ES przez Vite, geo dema wstawione do pliku danych każdego zlecenia). Czego nie ma na
   tej maszynie, tego nie pobieramy: noga z `wersja: null` i poleceniem, które to uzupełni, w polu `brak`.

   Ciężkie zależności (Playwright, Vite) są ładowane dopiero przy pierwszej nodze, która ich potrzebuje, więc przebieg
   z samymi nogami Node startuje szybko, a ten moduł da się importować w testach. `zbierzNoge` oddaje też funkcję
   zamykającą serwer Vite (nogi przeglądarkowe dzielą jeden); nogi zamyka bramka. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserType } from '@playwright/test';
import type { Noga } from './bramka.ts';
import { uruchomProces } from './proces.ts';
import { kontrolaStrony, wynikStrony } from './przegladarka.ts';
import { pierwszaLinia } from './raport.ts';
import { doParametrow } from './zlecenie.ts';

const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
/** najdłużej czekamy na jedno zlecenie jednej nogi (przebieg 72 h gry trwa w każdym silniku kilka sekund) */
const LIMIT_MS = 15 * 60_000;
/** pytanie o wersję Node (ZM_NODE24 albo kandydat z nvm) nie powinno wisieć */
const LIMIT_WERSJI_MS = 30_000;

export const brakNogi = (id: string, etykieta: string, docelowa: boolean, brak: string): Noga => ({
  id,
  etykieta,
  docelowa,
  wersja: null,
  brak,
  licz: async () => {
    throw new Error(`silnik ${id}: ${brak}`);
  },
  kontroluj: async () => {
    throw new Error(`silnik ${id}: ${brak}`);
  },
  zamknij: async () => {},
});

/** Node jako osobny proces (tools/determinizm/noga-node.ts); wersję i V8 odczytuje z tej binarki */
export async function nogaNode(
  id: string,
  etykieta: string,
  docelowa: boolean,
  binarka: string,
  korzen: string,
  limitMs = LIMIT_MS,
): Promise<Noga> {
  const skrypt = path.join(korzen, 'tools/determinizm/noga-node.ts');
  const [wersjaNode, wersjaV8] = (
    await uruchomProces(binarka, ['-p', "process.versions.node + ' ' + process.versions.v8"], LIMIT_WERSJI_MS)
  )
    .trim()
    .split(' ');
  return {
    id,
    etykieta,
    docelowa,
    wersja: `Node ${wersjaNode} (V8 ${wersjaV8})`,
    async licz(z) {
      const args = Object.entries(doParametrow(z)).map(([k, v]) => `--${k}=${v}`);
      return JSON.parse(await uruchomProces(binarka, [skrypt, ...args], limitMs));
    },
    async kontroluj(nagranie) {
      const plik = path.join(os.tmpdir(), `zm-kontrola-${process.pid}-${id}.json`);
      fs.writeFileSync(plik, JSON.stringify(nagranie));
      try {
        return JSON.parse(await uruchomProces(binarka, [skrypt, `--kontrola=${plik}`], limitMs));
      } finally {
        fs.rmSync(plik, { force: true });
      }
    },
    zamknij: async () => {},
  };
}

/** Node 24 (wzorzec CI i obrazu serwera): ZM_NODE24, potem nvm, potem Homebrew; null, gdy go nie ma */
export async function znajdzNode24(): Promise<string | null> {
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
      if ((await uruchomProces(k, ['--version'], LIMIT_WERSJI_MS)).startsWith('v24.')) return k;
    } catch {}
  }
  return null;
}

interface SerwerVite {
  /** adres serwera ze znakiem / na końcu; stawia serwer przy pierwszym wywołaniu */
  adres(): Promise<string>;
  zamknij(): Promise<void>;
}

/** serwer Vite w procesie, jeden na całe uruchomienie, stawiany przy pierwszej przeglądarce */
function serwerVite(korzen: string): SerwerVite {
  let start: Promise<{ adres: string; zamknij: () => Promise<void> }> | null = null;
  const uruchom = async () => {
    const { createServer } = await import('vite');
    const dev = await createServer({
      root: korzen,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      // strona nie ma zależności z npm, więc skanowanie index.html w poszukiwaniu pixi.js nie jest potrzebne
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'error',
    });
    await dev.listen();
    const a = dev.httpServer?.address();
    return { adres: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 5173}/`, zamknij: () => dev.close() };
  };
  return {
    adres: async () => (await (start ??= uruchom())).adres,
    zamknij: async () => {
      if (!start) return;
      try {
        await (await start).zamknij();
      } catch {}
    },
  };
}

/** przeglądarka z Playwright: strona testowa w świeżym kontekście na każde zlecenie */
async function nogaPrzegladarka(typ: BrowserType, id: string, etykieta: string, serwer: SerwerVite): Promise<Noga> {
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
      const adres = await serwer.adres();
      const kontekst = await przegladarka.newContext();
      try {
        const strona = await kontekst.newPage();
        return await wynikStrony(
          strona,
          `${adres}tools/determinizm/strona.html?${new URLSearchParams(doParametrow(z))}`,
          LIMIT_MS,
        );
      } finally {
        await kontekst.close();
      }
    },
    async kontroluj(nagranie) {
      const adres = await serwer.adres();
      const kontekst = await przegladarka.newContext();
      try {
        const strona = await kontekst.newPage();
        return await kontrolaStrony(strona, `${adres}tools/determinizm/strona.html?akcja=kontrola`, nagranie, LIMIT_MS);
      } finally {
        await kontekst.close();
      }
    },
    zamknij: () => przegladarka.close(),
  };
}

/** przebieg zbudowany w jeden plik ES: Vite w trybie biblioteki, w pamięci (wejscie-jsc.ts) */
async function zbudujPaczke(korzen: string): Promise<string> {
  const { build } = await import('vite');
  const wynik = await build({
    configFile: false,
    root: korzen,
    logLevel: 'error',
    publicDir: false,
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      lib: { entry: path.join(korzen, 'tools/determinizm/wejscie-jsc.ts'), formats: ['es'], fileName: 'paczka' },
    },
  });
  const wyjscie = Array.isArray(wynik) ? wynik[0] : wynik;
  if (!('output' in wyjscie)) throw new Error('Vite nie zwrócił paczki');
  const kawalek = wyjscie.output.find((o) => o.type === 'chunk');
  if (kawalek?.type !== 'chunk') throw new Error('Vite nie zwrócił paczki');
  return kawalek.code;
}

/** systemowy jsc z macOS: paczka w katalogu tymczasowym, a geo dema wstawione do pliku danych każdego zlecenia */
async function nogaJsc(korzen: string): Promise<Noga> {
  if (process.platform !== 'darwin' || !fs.existsSync(JSC))
    return brakNogi('jsc', 'jsc', false, 'brak (systemowy jsc jest tylko w macOS)');
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-jsc-'));
  const paczka = path.join(katalog, 'paczka.mjs');
  fs.writeFileSync(paczka, await zbudujPaczke(korzen));
  const macos = (await uruchomProces('sw_vers', ['-productVersion'], LIMIT_WERSJI_MS)).trim();
  let n = 0;
  /** ostatnia linia stdout to JSON wyniku (jsc nie ma console.log do stderr, inne linie to ewentualne śmieci) */
  const wynikZeStdout = (stdout: string) => JSON.parse(stdout.trim().split('\n').pop() ?? '');
  return {
    id: 'jsc',
    etykieta: 'jsc',
    docelowa: false,
    wersja: `JavaScriptCore z macOS ${macos}`,
    async licz(z) {
      const demo = JSON.parse(fs.readFileSync(path.join(korzen, `public/demo/${z.demo}.json`), 'utf8'));
      const dane = path.join(katalog, `dane-${n++}.mjs`);
      fs.writeFileSync(
        dane,
        `globalThis.ZLECENIE = ${JSON.stringify(z)};\nglobalThis.DANE = ${JSON.stringify({ geo: demo.geo, street: demo.street })};\n`,
      );
      return wynikZeStdout(await uruchomProces(JSC, [dane, paczka], LIMIT_MS));
    },
    async kontroluj(nagranie) {
      const dane = path.join(katalog, `dane-${n++}.mjs`);
      fs.writeFileSync(dane, `globalThis.KONTROLA = ${JSON.stringify(nagranie)};\n`);
      return wynikZeStdout(await uruchomProces(JSC, [dane, paczka], LIMIT_MS));
    },
    zamknij: async () => {
      fs.rmSync(katalog, { recursive: true, force: true });
    },
  };
}

export interface ZebraneNogi {
  noge: Noga[];
  /** zamyka serwer Vite, jeśli któraś noga go postawiła (nogi zamyka bramka) */
  zamknijSerwer(): Promise<void>;
}

/** Wszystkie nogi, jakie da się przygotować na tej maszynie (brakujące jako noga z `wersja: null`), z filtrem silników. */
export async function zbierzNoge(filtr: string[] | undefined, korzen: string): Promise<ZebraneNogi> {
  const serwer = serwerVite(korzen);
  const wszystkie: Noga[] = [];
  const dodaj = async (id: string, f: () => Promise<Noga>) => {
    if (filtr && !filtr.includes(id)) return;
    try {
      wszystkie.push(await f());
    } catch (e) {
      wszystkie.push(brakNogi(id, id, id !== 'jsc' && id !== 'node', `nie da się przygotować: ${pierwszaLinia(e)}`));
    }
  };
  const przegladarka = (id: 'chromium' | 'firefox' | 'webkit', etykieta: string) => async () => {
    const playwright = await import('@playwright/test');
    return nogaPrzegladarka(playwright[id], id, etykieta, serwer);
  };
  const biezacy24 = process.versions.node.startsWith('24.');
  // bieżący Node jest wzorcem, gdy to 24; inaczej jest silnikiem dodatkowym obok osobnej nogi Node 24
  await dodaj(biezacy24 ? 'node24' : 'node', () =>
    nogaNode(biezacy24 ? 'node24' : 'node', biezacy24 ? 'Node 24' : 'Node', biezacy24, process.execPath, korzen),
  );
  if (!biezacy24)
    await dodaj('node24', async () => {
      const binarka = await znajdzNode24();
      return binarka
        ? nogaNode('node24', 'Node 24', true, binarka, korzen)
        : brakNogi(
            'node24',
            'Node 24',
            true,
            'brak (nvm install 24 albo ZM_NODE24=/ścieżka/do/node24, albo obraz node:24-alpine)',
          );
    });
  await dodaj('chromium', przegladarka('chromium', 'Chromium'));
  await dodaj('firefox', przegladarka('firefox', 'Firefox'));
  await dodaj('webkit', przegladarka('webkit', 'WebKit'));
  await dodaj('jsc', () => nogaJsc(korzen));
  return { noge: wszystkie, zamknijSerwer: serwer.zamknij };
}
