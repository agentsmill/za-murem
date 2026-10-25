/* Pomiar wydajności: 150 pionków z A* i animacją, klatki na sekundę przez 10 s.
   Laptop: Chromium bez dławienia. Telefon: ekran 390×844 i procesor zdławiony 4× (CDP).
   Każdy wariant dwa razy: kamera stoi i kamera jedzie przez mapę (dorysowywanie kawałków).
   Uruchomienie: npm run perf [-- liczba_pionków [tempo 1-4]] [--no-worker] [--noc] [--zombie] [--zoom=0.5] [--m2]
   [--demo=lanciego] [--kod] [--pietro=2] [--kwadraty=3x3] [--zarzad=12] [--goscie=4] [--osada | --dzien2]
   (--no-worker: kawałki rysuje główny wątek, jak w przeglądarkach bez OffscreenCanvas w workerze;
   --noc: 22:00 z trzema światłami przy siedzibie, czyli koszt mapy światła; --m2: budowa z fali 1,
   czyli atrapa pustych mieszkań w przekroju, cztery plany z paskami postępu i podgląd stawiania; --demo: inne demo
   niż Przymorze (--demo=atrapa-budynki: mapa z każdym z 11 wyglądów budynków z PixelLab, tests/unit/atrapa-budynki.ts);
   --kod: wszystko rysowane kodem, bez grafiki z PixelLab, do porównań przed i po;
   --goscie=N: N grup po 6 gości z klocków (rodzaj `gosc`) z czterech stron stoi pod bramą przed pomiarem; z --noc widać
   je jako ciemne zarysy (koszt rysowania gości w ciemności);
   --pietro=N: widok pięter (?pietra=1) z wybranym piętrem N po wczytaniu, przed pomiarem; z --zoom=0.6 przekrój
   jest włączony, a przy 0 to piętro 0 z flagą, do porównania z przebiegiem bez tej opcji;
   --zarzad=N: tyle osób zarządu (?zarzad=N, najwyżej 12) zamiast czterech, żeby zmierzyć koszt pracy ludzi bez polecenia;
   --kwadraty=3x3|5x5: ?kwadraty= z kwadratami miasta obok domu (src/world/kwadraty.ts), kamera zaczyna na rogu domu i
   trzech sąsiadów (cam=384,384,zoom), a jazda kamerą przejeżdża przez szwy; brakujące kwadraty (poza danymi dem) powielają
   geo najbliższego sąsiada z przesunięciem, tylko tu, w narzędziu pomiaru (tools/kwadraty-pomiar.ts); wypisuje czasy
   budowy świata i sceny każdego kwadratu (window.zm.kwadraty) i pamięć kawałków);
   --osada: osada AI w tle (?osada=1, etap 2: druga gra na sąsiednim kwadracie, src/ai i src/ui/osada.ts). Gra jest przewijana
   do 7:00 drugiego dnia (osada powstaje o 6:00; tempo z linii poleceń wraca dopiero po przewinięciu, bo przewijanie idzie przy
   pauzie), potem window.zm.odkryjOsade() odsłania ją i czeka, aż jej kwadrat stanie w widoku (bez tego budowa kwadratu wpadłaby
   w okno pomiaru: na telefonie z CPU 4× klatki 67, 67 i 33 ms), i dopiero wtedy idą pomiary. Do dwóch ujęć z kamerą na domu
   dochodzą dwa z osadą w widoku: siedziba osady z bliska (zoom 0,45) i wszystkie kwadraty naraz przy najmniejszym zoomie, a jazda
   kamerą ma amplitudę pół kwadratu (192 m), żeby przejechać szew. Bez osady w trybie zombie (osady tam nie ma) i bez --noc
   (przewijanie kończy się za dnia);
   --dzien2: to samo przewijanie i te same cztery ujęcia, ale bez osady (kontrola dla --osada na tym samym HEAD; ujęcia z osadą
   to wtedy dom z bliska i dom przy najmniejszym zoomie). Sama linia poleceń bez żadnej z tych flag gra jak dotąd, od 15:00 pierwszego
   dnia, i ma te same dwa ujęcia.
   Obok odstępów między klatkami rAF (przy 60 kl/s nasycają się na 16,7 ms i nie pokazują zapasu) każdy pomiar zapisuje pracę klatki:
   czas od początku tyknięcia PixiJS (priorytet 50) do końca rysowania (−100), jako średnią, p99 i maksimum. Zapas klatki jest tam,
   gdzie praca jest dużo mniejsza od 16,7 ms; to wskaźnik, czy tempo 8× na telefonie z CPU 4× dalej mieści się w klatce.
   Na końcu jedna linia z najniższym kl/s, liczbą klatek ponad 33 ms i największą pracą klatki ze wszystkich pomiarów
   (kryterium bramki etapu 2 osady: nie mniej niż 55 kl/s i zero klatek ponad 33 ms; narzędzie niczego nie ocenia kodem wyjścia).
   Zawsze z dymem: koza zarządu rozpalona w stanie gry i ognisko na podwórku. */

import type { Page } from '@playwright/test';
import { SPEEDS, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { czytajKwadraty } from '../src/world/kwadraty.ts';
import { DEMO_ATRAPA, podstawAtrape } from './atrapa-trasa.ts';
import { openSession, waitIdle, webglRenderer } from './browser.ts';
import { podstawKwadraty } from './kwadraty-pomiar.ts';
import { chopDryTree, minutaGry, przewin } from './shots-cele.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PAWNS = Number(args[0]) || 150;
/** tempo: 1 = 1×, 2 = 3×, 3 = 6×, 4 = 8× */
const SPEED = Number(args[1]) || 1;
const NO_WORKER = process.argv.includes('--no-worker');
const NIGHT = process.argv.includes('--noc');
/** --zombie: tryb zombie z 60 szwendaczami pod siatką o 23:00 */
const ZOMBIE = process.argv.includes('--zombie');
/** --zoom=0.5: kamera przy progu bliskich kawałków, gdzie z bliska widać najwięcej drzew jako sprite'ów */
const ZOOM = Number(process.argv.find((a) => a.startsWith('--zoom='))?.slice(7)) || 1;
const M2 = process.argv.includes('--m2');
const DEMO = process.argv.find((a) => a.startsWith('--demo='))?.slice(7) || 'przymorze';
const KOD = process.argv.includes('--kod');
/** --goscie=N: N grup po 6 gości z klocków pod bramą (pionki rodzaju `gosc`), do pomiaru kosztu ich rysowania */
const GOSCIE = Number(process.argv.find((a) => a.startsWith('--goscie='))?.slice(9)) || 0;
/** --pietro=N: flaga ?pietra=1 i wybór piętra N (także 0) przez window.zm.pietro; bez opcji gra jak dotąd, bez flagi */
const PIETRO_ARG = process.argv.find((a) => a.startsWith('--pietro='))?.slice(9);
const PIETRO = PIETRO_ARG === undefined ? null : Number(PIETRO_ARG);
if (PIETRO !== null && !Number.isInteger(PIETRO)) throw new Error(`--pietro=${PIETRO_ARG}: oczekuję liczby całkowitej`);
/** --zarzad=N: liczba osób zarządu (?zarzad=N w adresie gry); bez opcji gra jak dotąd, z czterema */
const ZARZAD_ARG = process.argv.find((a) => a.startsWith('--zarzad='))?.slice(9);
const ZARZAD = ZARZAD_ARG === undefined ? null : Number(ZARZAD_ARG);
if (ZARZAD !== null && !(Number.isInteger(ZARZAD) && ZARZAD >= 1 && ZARZAD <= 12))
  throw new Error(`--zarzad=${ZARZAD_ARG}: oczekuję liczby całkowitej 1–12`);
/** --kwadraty=3x3: ?kwadraty= (3x3, 5x5, 7x7 albo lista par), kamera od rogu domu i sąsiadów, jazda kamerą przez szwy */
const KWADRATY_ARG = process.argv.find((a) => a.startsWith('--kwadraty='))?.slice(11) ?? null;
const KWADRATY = czytajKwadraty(KWADRATY_ARG);
if (KWADRATY_ARG !== null && !KWADRATY.length)
  throw new Error(`--kwadraty=${KWADRATY_ARG}: oczekuję 3x3, 5x5, 7x7 albo listy „1,0;0,-1”`);
/** --osada: osada AI w tle (?osada=1), gra przewinięta do 7:00 drugiego dnia i osada odsłonięta przed oknem pomiaru */
const OSADA = process.argv.includes('--osada');
/** --dzien2: to samo przewijanie i ujęcia co --osada, ale bez osady (kontrola na tym samym HEAD) */
const DZIEN2 = OSADA || process.argv.includes('--dzien2');
if (DZIEN2 && ZOMBIE) throw new Error('--osada i --dzien2 nie działają w trybie zombie (osady tam nie ma)');
if (DZIEN2 && NIGHT)
  throw new Error('--osada i --dzien2 przewijają do 7:00 drugiego dnia, więc nie da się ich łączyć z --noc');
/** godzina gry, do której --osada i --dzien2 przewijają przed pomiarem (osada powstaje o 6:00 tego dnia) */
const DZIEN2_DZIEN = 2;
const DZIEN2_GODZINA = 7;
/** amplituda jazdy kamerą w pikselach grafiki: 62 m w samym domu, pół kwadratu (192 m) z kwadratami albo z osadą, żeby przejechać szwy */
const PAN_AMP = KWADRATY.length || DZIEN2 ? 6144 : 2000;
const SECONDS = 10;
/** ujęcia z osadą w widoku mają zoom z przeglądu zadania 5: siedziba osady z bliska */
const ZOOM_OSADY = 0.45;
/** kryterium bramki etapu 2 osady AI */
const MIN_FPS = 55;

/** Ujęcie kamery jednego pomiaru: gdzie stoi kamera i czy jedzie. Bez `ustaw` kamera zostaje tam, gdzie była. */
interface Ujecie {
  nazwa: string;
  pan: boolean;
  ustaw?: 'siedziba' | 'wszystko';
}
const UJECIA: Ujecie[] = [
  { nazwa: 'kamera stoi ', pan: false },
  { nazwa: 'jazda kamerą', pan: true },
  ...(DZIEN2
    ? [
        { nazwa: OSADA ? 'siedziba osady' : 'dom z bliska ', pan: false, ustaw: 'siedziba' as const },
        { nazwa: OSADA ? 'wszystkie kwadr.' : 'dom, min. zoom', pan: false, ustaw: 'wszystko' as const },
      ]
    : []),
];

interface Result {
  fps: number;
  p95: number;
  worst: number;
  slow: number;
  ticks: number;
  paths: number;
  chunks: number;
  /** praca klatki w ms: średnia, p99 i maksimum (od początku tyknięcia PixiJS do końca rysowania) */
  workMean: number;
  workP99: number;
  workMax: number;
  /** odstępy między początkami kolejnych tyknięć PixiJS wg `performance.now()` (rzeczywisty rytm klatek, w ms): p99, maksimum i
      liczba odstępów ponad 33 ms */
  tickP99: number;
  tickMax: number;
  tickSlow: number;
}

/** Jeden pomiar klatek w stronie: 10 s odstępów rAF, odstępów tickera i pracy klatki (rejestr `__praca` z haków tickera), a przy
    jeździe kamerą ruch kamery po poziomie. Zeruje licznik kroków symulacji, ścieżek A* i kawałków na początku okna. */
function pomiarKlatek(page: Page, pan: boolean): Promise<Result> {
  return page.evaluate(
    ({ ms, pan, amp }) =>
      new Promise<Result>((res) => {
        const zm = window.zm!;
        const st = zm.sim!.st;
        const tick0 = st.tick;
        const paths0 = zm.sim!.stats.paths;
        const chunks0 = zm.view.chunksMade;
        const praca = (window as unknown as { __praca: { on: boolean; od: number; p: number[]; d: number[] } }).__praca;
        praca.p = [];
        praca.d = [];
        praca.od = 0;
        praca.on = true;
        const times: number[] = [];
        const t0 = performance.now();
        let last = t0;
        const cam = zm.view.cam;
        const x0 = cam.x;
        const f = (now: number) => {
          times.push(now - last);
          if (pan) {
            // jazda kamerą: 250 px/s w prawo i z powrotem
            const t = (now - t0) / 1000;
            cam.x = x0 + Math.sin(t * 0.5) * amp;
            cam.y += Math.cos(t * 0.5) * 2;
          }
          last = now;
          if (now - t0 < ms) requestAnimationFrame(f);
          else {
            praca.on = false;
            const sorted = times.slice(1).sort((a, b) => a - b);
            const work = praca.p.slice(1).sort((a, b) => a - b);
            const odstepy = praca.d.slice(1).sort((a, b) => a - b);
            res({
              fps: (times.length - 1) / ((now - t0) / 1000),
              p95: sorted[Math.floor(sorted.length * 0.95)],
              worst: sorted[sorted.length - 1],
              slow: sorted.filter((x) => x > 33.4).length,
              ticks: st.tick - tick0,
              paths: zm.sim!.stats.paths - paths0,
              chunks: zm.view.chunksMade - chunks0,
              workMean: work.reduce((a, b) => a + b, 0) / Math.max(1, work.length),
              workP99: work[Math.floor(work.length * 0.99)] ?? 0,
              workMax: work[work.length - 1] ?? 0,
              tickP99: odstepy[Math.floor(odstepy.length * 0.99)] ?? 0,
              tickMax: odstepy[odstepy.length - 1] ?? 0,
              tickSlow: odstepy.filter((x) => x > 33.4).length,
            });
          }
        };
        requestAnimationFrame(f);
      }),
    { ms: SECONDS * 1000, pan, amp: PAN_AMP },
  );
}

/** Okno zarządu, które jest otwarte (tytuł; null: żadne), i bieżące tempo gry. Karta zarządu zatrzymuje grę (tempo 0). */
function stanOkna(page: Page): Promise<{ okno: string | null; tempo: number }> {
  return page.evaluate(() => {
    const m = document.getElementById('modal');
    const otwarte = !!m && !m.hidden;
    return {
      okno: otwarte ? (m!.querySelector('h1, h2, h3, .kicker, .title')?.textContent?.trim() ?? 'okno') : null,
      tempo: window.zm!.speed(),
    };
  });
}

const s = await openSession();
try {
  const rows: string[] = [];
  const wyniki: (Result & { opis: string })[] = [];
  for (const dev of [
    { name: 'laptop', w: 1440, h: 900, dpr: 2, cpu: 1 },
    { name: 'telefon (CPU 4×)', w: 390, h: 844, dpr: 2, cpu: 4 },
  ]) {
    const ctx = await s.browser.newContext({
      viewport: { width: dev.w, height: dev.h },
      deviceScaleFactor: dev.dpr,
      isMobile: dev.cpu > 1,
      hasTouch: dev.cpu > 1,
    });
    const page = await ctx.newPage();
    if (DEMO === DEMO_ATRAPA) await podstawAtrape(page);
    else if (KWADRATY.length) await podstawKwadraty(page, DEMO, KWADRATY);
    // przewijanie do drugiego dnia idzie przy pauzie, a tempo z linii poleceń ustawia się tuż przed pomiarem
    await page.goto(
      `${s.base}?demo=${DEMO}&perf=${PAWNS}&cam=${KWADRATY.length ? '384,384' : 'hq'},${ZOOM}&speed=${DZIEN2 ? 0 : SPEED}${KWADRATY_ARG ? `&kwadraty=${KWADRATY_ARG}` : ''}${NO_WORKER ? '&worker=0' : ''}${NIGHT ? '&godzina=22&swiatla=test' : ''}${ZOMBIE ? '&tryb=zombie&stado=60&godzina=23' : ''}${M2 ? '&mieszkania=atrapa' : ''}${KOD ? '&grafika=kod' : ''}${PIETRO === null ? '' : '&pietra=1'}${ZARZAD === null ? '' : `&zarzad=${ZARZAD}`}${OSADA ? '&osada=1' : ''}`,
    );
    await waitIdle(page);
    if (DZIEN2) {
      // do 7:00 drugiego dnia samą grą (odpowiedzi na okna zarządu po drodze); osada, jeśli jest, powstaje o 6:00
      const t0 = Date.now();
      await chopDryTree(page);
      await przewin(page, (t) => t >= minutaGry(DZIEN2_DZIEN, DZIEN2_GODZINA), { dotyk: dev.cpu > 1 });
      console.log(
        `${dev.name}: gra przewinięta do ${DZIEN2_GODZINA}:00 dnia ${DZIEN2_DZIEN} w ${((Date.now() - t0) / 1000).toFixed(1)} s`,
      );
      if (OSADA) {
        const stan = await page.evaluate(() => window.zm!.osada()?.stan ?? null);
        if (stan !== 'jest') throw new Error(`osada po 6:00 drugiego dnia ma stan „${stan}” zamiast „jest”`);
        // odsłonięcie ma własne zacięcie (budowa kwadratu), więc idzie przed oknem pomiaru
        const t1 = Date.now();
        if (!(await page.evaluate(() => window.zm!.odkryjOsade())))
          throw new Error('zm.odkryjOsade() nie odsłoniło osady');
        await waitIdle(page);
        const o = await page.evaluate(() => {
          const x = window.zm!.osada()!;
          return { klucz: x.klucz, kwadrat: x.kwadrat, tick: x.tick, bledow: x.bledowRazem };
        });
        console.log(
          `${dev.name}: osada odsłonięta w ${((Date.now() - t1) / 1000).toFixed(1)} s, kwadrat ${o.klucz} (w widoku ${o.kwadrat}), tick ${o.tick}, błędów ${o.bledow}`,
        );
        if (o.kwadrat < 0) throw new Error('kwadrat osady nie stanął w widoku');
      }
    }
    if (PIETRO !== null) {
      // wybór piętra jak kliknięcie na liście kafelka (pierwsze sectionPietra liczy się tu, przed pomiarem klatek)
      const t = await page.evaluate((n) => {
        const zm = window.zm!;
        const t0 = performance.now();
        zm.pietro(n);
        return performance.now() - t0;
      }, PIETRO);
      await waitIdle(page);
      const st = await page.evaluate(() => ({ ...window.zm!.pietra(), przekroj: window.zm!.view.section }));
      console.log(`${dev.name}: piętro ${PIETRO}: wybór ${t.toFixed(0)} ms, stan ${JSON.stringify(st)}`);
      if (st.pietro !== PIETRO) throw new Error(`piętro ${PIETRO} nie zostało wybrane (lista ${st.lista})`);
    }
    // dym: koza zarządu rozpalona w stanie gry i ognisko na podwórku
    const puffs = await page.evaluate(async () => {
      const zm = window.zm!;
      const sim = zm.sim!;
      const size = sim.w.size;
      sim.st.things.find((t) => t.kind === 'koza')!.fuel = 20000;
      const free = sim.w.fence.yard.filter(
        (i) => !sim.blocked[i] && !sim.st.things.some((t) => t.y * size + t.x === i),
      );
      const i = free[Math.floor(free.length * 0.6)];
      sim.st.things.push({
        id: 993000,
        kind: 'ognisko',
        x: i % size,
        y: Math.floor(i / size),
        w: 1,
        h: 1,
        rot: 0,
        n: 0,
        fuel: 20000,
        by: -1,
        owner: -1,
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return (zm.view as unknown as { smoke: { count: number } }).smoke.count;
    });
    if (GOSCIE > 0) {
      // grupy gości z czterech stron: plan zarządu przez kolejkę poleceń, potem marsz pod bramę (około 700 kroków)
      const g = await page.evaluate((k) => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const st = sim.st;
        if (!st.obcy) throw new Error('gra bez obcych: goście nie powstaną');
        const strony = ['n', 'e', 's', 'w'];
        for (let n = 0; n < k; n++)
          st.cmds.push({
            t: 'gosc',
            ids: [],
            plan: {
              id: `p${n + 1}`,
              strona: strony[n % 4],
              looks: [4, 5, 6, 7, 8, 9],
              osoby: Array.from({ length: 6 }, (_, i) => ({
                id: `p${n + 1}p${i}`,
                first: 'Gość',
                name: `Gość ${n + 1}.${i}`,
                f: i % 2 === 0,
                prof: 'mieszkaniec',
                skills: {},
                age: 30 + i,
                traits: [],
                home: -1,
                assign: null,
                sick: false,
                dead: false,
                gone: false,
              })),
            },
          } as never);
        for (let t = 0; t < 1500; t++) sim.step();
        return {
          gosci: st.pawns.filter((p) => p.kind === 'gosc').length,
          podBrama: (st.goscie ?? []).filter((x) => x.faza === 'brama').length,
        };
      }, GOSCIE);
      console.log(`${dev.name}: gości ${g.gosci}, grup pod bramą ${g.podBrama} z ${GOSCIE}`);
    }
    if (M2) {
      // plany budowy na podwórku (st.builds) i podgląd stawiania z podświetlonymi kafelkami
      const m2 = await page.evaluate(async () => {
        const zm = window.zm!;
        const sim = zm.sim!;
        const size = sim.w.size;
        const yard = sim.w.fence.yard.filter((i) => !sim.blocked[i]);
        const at = (f: number) => yard[Math.floor(yard.length * f)];
        const kinds = ['warsztat', 'magazyn', 'ogrodek', 'lozka_pietrowe'];
        (sim.st as unknown as { builds: unknown[] }).builds = kinds.map((kind, k) => {
          const i = at(0.15 + k * 0.2);
          return {
            id: 994000 + k,
            kind,
            x: i % size,
            y: Math.floor(i / size),
            rot: k & 1,
            need: { deski: 4, zlom: 2 },
            have: { deski: k + 1 },
            work: k * 40,
            by: -1,
          };
        });
        const p = at(0.5);
        zm.view.setPlacement({
          kind: 'warsztat',
          x: p % size,
          y: Math.floor(p / size),
          rot: 0,
          ok: true,
          tiles: { ok: yard.slice(0, 40), bad: yard.slice(40, 60) },
        });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const v = zm.view as unknown as { builds: { count: number }; things: Map<string, unknown> };
        const keys = [...v.things.keys()];
        return {
          plans: v.builds.count,
          broken: keys.filter((k) => k.includes('"broken":true') || k.includes('"burnt":true')).length,
          trash: keys.filter((k) => k.includes('"smieci"')).length,
        };
      });
      console.log(`M2: planów ${m2.plans}, zepsutych i okopconych rzeczy ${m2.broken}, stert śmieci ${m2.trash}`);
    }
    if (KWADRATY.length) {
      const kw = await page.evaluate(() => ({
        lista: window.zm!.kwadraty,
        mem: window.zm!.view.pamiecKawalkow(),
        sterta:
          ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 2 ** 20,
      }));
      const zDanymi = kw.lista.filter((k) => !k.brakDanych);
      const suma = (f: (k: (typeof kw.lista)[number]) => number) => zDanymi.reduce((a, k) => a + f(k), 0);
      const najw = (f: (k: (typeof kw.lista)[number]) => number) => Math.max(0, ...zDanymi.map(f));
      console.log(
        `${dev.name}: kwadraty ${zDanymi.length} z danymi i ${kw.lista.length - zDanymi.length} bez; świat ${suma((k) => k.msSwiat).toFixed(0)} ms razem (średnio ${(suma((k) => k.msSwiat) / Math.max(1, zDanymi.length)).toFixed(0)}, najdłużej ${najw((k) => k.msSwiat).toFixed(0)}), scena ${suma((k) => k.msScena).toFixed(0)} ms razem (średnio ${(suma((k) => k.msScena) / Math.max(1, zDanymi.length)).toFixed(0)}, najdłużej ${najw((k) => k.msScena).toFixed(0)}); pamięć kawałków ${JSON.stringify(kw.mem)}, sterta JS ${kw.sterta.toFixed(0)} MiB`,
      );
    }
    if (rows.length === 0) console.log(`WebGL: ${await webglRenderer(page)}`);
    const trees = await page.evaluate(() => (window.zm!.view as unknown as { trees: { count: number } }).trees.count);
    console.log(`${dev.name}: kłębów dymu ${puffs}, drzew jako sprite'y ${trees}`);
    console.log(`${dev.name}: kawałki rysuje ${await page.evaluate(() => window.zm!.view.painting)}`);
    const ludzie = await page.evaluate(() => {
      const pawns = window.zm!.sim!.st.pawns;
      return { zarzad: pawns.filter((p) => p.kind === 'core').length, razem: pawns.length };
    });
    console.log(`${dev.name}: zarząd ${ludzie.zarzad} osób, pionków razem ${ludzie.razem}`);
    console.log(`${dev.name}: ${DEMO}, z PixelLab ${JSON.stringify(await page.evaluate(() => window.zm!.grafika()))}`);
    // rejestr pracy klatki: znacznik przed grą (priorytet 50, przed `frame()` z main.ts) i po rysowaniu (−100, po renderze PixiJS);
    // odstępy między kolejnymi znacznikami początku to rzeczywisty rytm klatek, bo znaczniki rAF w headless są wyrównane do odświeżania
    // ekranu i nie widzą spóźnień rzędu kilkunastu ms (stąd osobno praca klatki i odstęp tickera obok odstępu rAF)
    await page.evaluate(() => {
      const w = window as unknown as { __praca: { on: boolean; od: number; p: number[]; d: number[] } };
      w.__praca = { on: false, od: 0, p: [], d: [] };
      const ticker = window.zm!.view.app.ticker;
      ticker.add(
        () => {
          if (!w.__praca.on) return;
          const teraz = performance.now();
          if (w.__praca.od) w.__praca.d.push(teraz - w.__praca.od);
          w.__praca.od = teraz;
        },
        null,
        50,
      );
      ticker.add(
        () => {
          if (w.__praca.on) w.__praca.p.push(performance.now() - w.__praca.od);
        },
        null,
        -100,
      );
    });
    // tempo z linii poleceń (przewijanie do drugiego dnia szło przy pauzie); okno zarządu, które w międzyczasie się otworzyło,
    // zatrzymałoby grę w oknie pomiaru, więc odpowiada się na nie przed pomiarem
    if (DZIEN2) {
      await przewin(page, () => true, { dotyk: dev.cpu > 1 });
      await page.evaluate((t) => document.querySelector<HTMLElement>(`#speed [data-s="${t}"]`)?.click(), SPEED);
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
    for (const ujecie of UJECIA) {
      if (ujecie.ustaw) {
        // kamera na siedzibie osady (w kontroli: na domu) albo na wszystkich kwadratach naraz, i pół sekundy na dorysowanie
        await page.evaluate(
          ([gdzie, zoomOsady]) => {
            const zm = window.zm!;
            const v = zm.view;
            if (gdzie === 'wszystko') return zm.setCam(v.srodek.x / 32, v.srodek.y / 32, v.minZoom);
            const e = zm.osada()?.siedziba?.etykieta;
            if (e) return zm.setCam(e.x, e.y + 8, zoomOsady as number);
            const w = zm.sim!.w;
            const b = w.buildings[w.hq];
            zm.setCam((b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2, zoomOsady as number);
          },
          [ujecie.ustaw, ZOOM_OSADY] as const,
        );
        await waitIdle(page);
        await page.waitForTimeout(500);
      }
      const oczekiwane = TICKS_PER_SECOND * (SPEEDS[SPEED] ?? 0) * SECONDS;
      let r: Result;
      let proby = 0;
      for (;;) {
        const cam0 = await page.evaluate(() => ({ x: window.zm!.view.cam.x, y: window.zm!.view.cam.y }));
        r = await pomiarKlatek(page, ujecie.pan);
        proby++;
        if (!DZIEN2) break;
        // karta zarządu, która otworzyła się w trakcie, zatrzymuje grę (tempo 0) i unieważnia pomiar kosztu symulacji: odpowiedź
        // na nią i to samo ujęcie jeszcze raz, od tej samej pozycji kamery
        const st = await stanOkna(page);
        if (!st.okno && st.tempo === SPEED) break;
        console.log(
          `  (w oknie pomiaru stanęła gra: okno zarządu „${st.okno}”, tempo ${st.tempo}, kroków ${r.ticks} z ${oczekiwane}; odpowiadam i powtarzam ujęcie)`,
        );
        if (proby >= 3) throw new Error('okna zarządu stają w trakcie pomiaru trzeci raz z rzędu');
        await przewin(page, () => true, { dotyk: dev.cpu > 1 });
        await page.evaluate((t) => document.querySelector<HTMLElement>(`#speed [data-s="${t}"]`)?.click(), SPEED);
        await page.evaluate((c) => {
          window.zm!.view.cam.x = c.x;
          window.zm!.view.cam.y = c.y;
        }, cam0);
        await waitIdle(page);
      }
      const line = `${dev.name.padEnd(17)} ${ujecie.nazwa}  ${r.fps.toFixed(1)} kl/s, p95 ${r.p95.toFixed(1)} ms, najgorsza ${r.worst.toFixed(0)} ms, klatek >33 ms: ${r.slow}, odstęp tickera p99 ${r.tickP99.toFixed(1)}, max ${r.tickMax.toFixed(1)} ms (>33 ms: ${r.tickSlow}), praca klatki: średnio ${r.workMean.toFixed(1)}, p99 ${r.workP99.toFixed(1)}, max ${r.workMax.toFixed(1)} ms, kroków symulacji: ${r.ticks} z ${oczekiwane}, ścieżek A*: ${r.paths}, nowych kawałków: ${r.chunks}${proby > 1 ? ' (po oknie zarządu, drugi raz)' : ''}`;
      console.log(line);
      rows.push(line);
      wyniki.push({ ...r, opis: `${dev.name} ${ujecie.nazwa.trim()}` });
    }
    if (KWADRATY.length)
      console.log(
        `${dev.name}: po pomiarze pamięć kawałków ${JSON.stringify(await page.evaluate(() => window.zm!.view.pamiecKawalkow()))}, sterta JS ${(((await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)) as number) / 2 ** 20).toFixed(0)} MiB`,
      );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await ctx.close();
  }
  if (wyniki.length) {
    // podsumowanie wszystkich pomiarów tego przebiegu (kryterium bramki etapu 2 osady AI)
    const najwolniejszy = wyniki.reduce((a, b) => (b.fps < a.fps ? b : a));
    const najdluzszyRaf = wyniki.reduce((a, b) => (b.worst > a.worst ? b : a));
    const najdluzszyTick = wyniki.reduce((a, b) => (b.tickMax > a.tickMax ? b : a));
    const najciezsza = wyniki.reduce((a, b) => (b.workMax > a.workMax ? b : a));
    const dluzszychRaf = wyniki.reduce((a, b) => a + b.slow, 0);
    const dluzszychTick = wyniki.reduce((a, b) => a + b.tickSlow, 0);
    const ok = najwolniejszy.fps >= MIN_FPS && dluzszychRaf === 0 && dluzszychTick === 0;
    console.log(
      `Podsumowanie ${wyniki.length} pomiarów: najniższe ${najwolniejszy.fps.toFixed(1)} kl/s (${najwolniejszy.opis}); odstępy ponad 33 ms: rAF ${dluzszychRaf}, tickera ${dluzszychTick}; najdłuższy odstęp rAF ${najdluzszyRaf.worst.toFixed(0)} ms (${najdluzszyRaf.opis}), tickera ${najdluzszyTick.tickMax.toFixed(1)} ms (${najdluzszyTick.opis}); największa praca klatki ${najciezsza.workMax.toFixed(1)} ms (${najciezsza.opis}); kryterium (nie mniej niż ${MIN_FPS} kl/s i zero klatek ponad 33 ms): ${ok ? 'spełnione' : 'NIESPEŁNIONE'}`,
    );
  }
} finally {
  await s.close();
}
