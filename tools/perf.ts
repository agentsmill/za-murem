/* Pomiar wydajności: 150 pionków z A* i animacją, klatki na sekundę przez 10 s.
   Laptop: Chromium bez dławienia. Telefon: ekran 390×844 i procesor zdławiony 4× (CDP).
   Każdy wariant dwa razy: kamera stoi i kamera jedzie przez mapę (dorysowywanie kawałków).
   Uruchomienie: npm run perf [-- liczba_pionków [tempo 1-4]] [--no-worker] [--noc] [--zombie] [--zoom=0.5] [--m2]
   [--demo=lanciego] [--kod] [--pietro=2] [--kwadraty=3x3] [--zarzad=12] [--goscie=4]
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
   budowy świata i sceny każdego kwadratu (window.zm.kwadraty) i pamięć kawałków).
   Zawsze z dymem: koza zarządu rozpalona w stanie gry i ognisko na podwórku. */

import { czytajKwadraty } from '../src/world/kwadraty.ts';
import { DEMO_ATRAPA, podstawAtrape } from './atrapa-trasa.ts';
import { openSession, waitIdle, webglRenderer } from './browser.ts';
import { podstawKwadraty } from './kwadraty-pomiar.ts';

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
/** amplituda jazdy kamerą w pikselach grafiki: 62 m w samym domu, pół kwadratu (192 m) z kwadratami, żeby przejechać szwy */
const PAN_AMP = KWADRATY.length ? 6144 : 2000;
const SECONDS = 10;

interface Result {
  fps: number;
  p95: number;
  worst: number;
  slow: number;
  ticks: number;
  paths: number;
  chunks: number;
}

const s = await openSession();
try {
  const rows: string[] = [];
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
    await page.goto(
      `${s.base}?demo=${DEMO}&perf=${PAWNS}&cam=${KWADRATY.length ? '384,384' : 'hq'},${ZOOM}&speed=${SPEED}${KWADRATY_ARG ? `&kwadraty=${KWADRATY_ARG}` : ''}${NO_WORKER ? '&worker=0' : ''}${NIGHT ? '&godzina=22&swiatla=test' : ''}${ZOMBIE ? '&tryb=zombie&stado=60&godzina=23' : ''}${M2 ? '&mieszkania=atrapa' : ''}${KOD ? '&grafika=kod' : ''}${PIETRO === null ? '' : '&pietra=1'}${ZARZAD === null ? '' : `&zarzad=${ZARZAD}`}`,
    );
    await waitIdle(page);
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
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
    for (const pan of [false, true]) {
      const r: Result = await page.evaluate(
        ({ ms, pan, amp }) =>
          new Promise<Result>((res) => {
            const zm = window.zm!;
            const st = zm.sim!.st;
            const tick0 = st.tick;
            const paths0 = zm.sim!.stats.paths;
            const chunks0 = zm.view.chunksMade;
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
                const sorted = times.slice(1).sort((a, b) => a - b);
                res({
                  fps: (times.length - 1) / ((now - t0) / 1000),
                  p95: sorted[Math.floor(sorted.length * 0.95)],
                  worst: sorted[sorted.length - 1],
                  slow: sorted.filter((x) => x > 33.4).length,
                  ticks: st.tick - tick0,
                  paths: zm.sim!.stats.paths - paths0,
                  chunks: zm.view.chunksMade - chunks0,
                });
              }
            };
            requestAnimationFrame(f);
          }),
        { ms: SECONDS * 1000, pan, amp: PAN_AMP },
      );
      const line = `${dev.name.padEnd(17)} ${pan ? 'jazda kamerą' : 'kamera stoi '}  ${r.fps.toFixed(1)} kl/s, p95 ${r.p95.toFixed(1)} ms, najgorsza ${r.worst.toFixed(0)} ms, klatek >33 ms: ${r.slow}, kroków symulacji: ${r.ticks}, ścieżek A*: ${r.paths}, nowych kawałków: ${r.chunks}`;
      console.log(line);
      rows.push(line);
    }
    if (KWADRATY.length)
      console.log(
        `${dev.name}: po pomiarze pamięć kawałków ${JSON.stringify(await page.evaluate(() => window.zm!.view.pamiecKawalkow()))}, sterta JS ${(((await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)) as number) / 2 ** 20).toFixed(0)} MiB`,
      );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await ctx.close();
  }
} finally {
  await s.close();
}
