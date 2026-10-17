/* Pomiar wydajności: 150 pionków z A* i animacją, klatki na sekundę przez 10 s.
   Laptop: Chromium bez dławienia. Telefon: ekran 390×844 i procesor zdławiony 4× (CDP).
   Każdy wariant dwa razy: kamera stoi i kamera jedzie przez mapę (dorysowywanie kawałków).
   Uruchomienie: npm run perf [-- liczba_pionków [tempo 1-3]] [--no-worker] [--noc] [--zoom=0.5]
   (--no-worker: kawałki rysuje główny wątek, jak w przeglądarkach bez OffscreenCanvas w workerze;
   --noc: 22:00 z trzema światłami przy siedzibie, czyli koszt mapy światła). Zawsze z dymem: koza
   zarządu rozpalona w stanie gry i ognisko na podwórku. */

import { openSession, waitIdle, webglRenderer } from './browser.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PAWNS = Number(args[0]) || 150;
/** tempo: 1 = 1×, 2 = 3×, 3 = 6× */
const SPEED = Number(args[1]) || 1;
const NO_WORKER = process.argv.includes('--no-worker');
const NIGHT = process.argv.includes('--noc');
/** --zoom=0.5: kamera przy progu bliskich kawałków, gdzie z bliska widać najwięcej drzew jako sprite'ów */
const ZOOM = Number(process.argv.find((a) => a.startsWith('--zoom='))?.slice(7)) || 1;
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
    await page.goto(
      `${s.base}?demo=przymorze&perf=${PAWNS}&cam=hq,${ZOOM}&speed=${SPEED}${NO_WORKER ? '&worker=0' : ''}${NIGHT ? '&godzina=22&swiatla=test' : ''}`,
    );
    await waitIdle(page);
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
    if (rows.length === 0) console.log(`WebGL: ${await webglRenderer(page)}`);
    const trees = await page.evaluate(() => (window.zm!.view as unknown as { trees: { count: number } }).trees.count);
    console.log(`${dev.name}: kłębów dymu ${puffs}, drzew jako sprite'y ${trees}`);
    console.log(`${dev.name}: kawałki rysuje ${await page.evaluate(() => window.zm!.view.painting)}`);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
    for (const pan of [false, true]) {
      const r: Result = await page.evaluate(
        ({ ms, pan }) =>
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
                cam.x = x0 + Math.sin(t * 0.5) * 2000;
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
        { ms: SECONDS * 1000, pan },
      );
      const line = `${dev.name.padEnd(17)} ${pan ? 'jazda kamerą' : 'kamera stoi '}  ${r.fps.toFixed(1)} kl/s, p95 ${r.p95.toFixed(1)} ms, najgorsza ${r.worst.toFixed(0)} ms, klatek >33 ms: ${r.slow}, kroków symulacji: ${r.ticks}, ścieżek A*: ${r.paths}, nowych kawałków: ${r.chunks}`;
      console.log(line);
      rows.push(line);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await ctx.close();
  }
} finally {
  await s.close();
}
