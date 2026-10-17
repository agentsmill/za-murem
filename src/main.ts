/* Za Murem 0.4: start, wczytanie osiedla, pętla gry i sterowanie. */

import './style.css';
import { DOM, LORE, TRAITS } from './content/data.ts';
import { wiek } from './content/people.ts';
import { hashString } from './core/rng.ts';
import { buildScene, TILE } from './render/art/scene.ts';
import type { Light } from './render/light.ts';
import { GameView } from './render/view.ts';
import { clockOf, dayOf, SPEEDS, START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from './sim/clock.ts';
import { createSim, Sim } from './sim/sim.ts';
import { demoList, type Loaded, loadAddress, loadDemo } from './world/load.ts';
import { buildWorld } from './world/world.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

declare global {
  interface Window {
    /** do testów i pomiarów (Playwright) */
    zm?: {
      ready: boolean;
      sim: Sim | null;
      view: GameView;
      fps: () => number;
      setCam: (x: number, y: number, zoom: number) => void;
      chunksPending: () => number;
      idle: () => boolean;
    };
  }
}

const view = new GameView();
let sim: Sim | null = null;
let speed = 1;
let acc = 0;
const selected = new Set<number>();
let hint = '';
let hintUntil = 0;

/* ---------- ekran startowy ---------- */
$('lore').textContent = LORE;
const status = (t: string) => {
  $('startStatus').textContent = t;
};
demoList().then((list) => {
  const box = $('demos');
  for (const d of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = `Przykład: ${d.name}`;
    b.title = d.label;
    b.onclick = () => start(() => loadDemo(d.key));
    box.appendChild(b);
  }
});
$('startForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>('addr').value.trim();
  if (q) start(() => loadAddress(q, status));
});

let busy = false;
async function start(get: () => Promise<Loaded>) {
  if (busy) return;
  busy = true;
  try {
    const data = await get();
    status('Rysuję osiedle…');
    await new Promise((r) => setTimeout(r, 0));
    await enter(data);
    status('');
  } catch (err) {
    const m = (err as Error)?.message || '';
    const net = err instanceof TypeError || (err as Error)?.name === 'AbortError';
    status(
      `${net ? 'Nie mogę połączyć się z serwerami map: brak sieci albo serwery są przeciążone.' : m || 'Coś poszło nie tak.'} Możecie zagrać na przykładowym osiedlu.`,
    );
    console.error(err);
  }
  busy = false;
}

async function enter(data: Loaded) {
  // ziarno z adresu: to samo osiedle zawsze ma tych samych ludzi, inne osiedle innych
  const seed = Number(params.get('seed')) || Number.parseInt(hashString(data.addr), 16) || 2051;
  const t0 = performance.now();
  const world = buildWorld(data.geo, { seed, street: data.street });
  const scene = buildScene(world);
  console.info(`świat ${Math.round(performance.now() - t0)} ms, budynków ${world.buildings.length}`);
  const crowd = params.has('perf') ? Number(params.get('perf')) : 24;
  // wszystko, co może się nie udać, przed przełączeniem ekranu: błąd zostaje na ekranie startowym
  const st = createSim(world, seed, { core: 4, crowd });
  $('start').hidden = true;
  $('app').hidden = false;
  // płótno mierzy element; był ukryty, więc trzeba przeliczyć rozmiar po odsłonięciu
  view.app.resize();
  view.setScene(scene);
  // ?godzina=22 (albo ?hour=22, także z ułamkiem: 18.5 to 18:30): pora dnia na start
  const hour = params.get('godzina') ?? params.get('hour');
  if (hour !== null)
    st.tick = Math.round(
      (((((Number(hour) * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY,
    );
  sim = new Sim(world, st);
  $('osName').textContent = data.name;
  document.title = `Za Murem · ${data.name}`;
  const hq = world.buildings[world.hq];
  // kamera na drzwi siedziby, przy których stoi zarząd (środek rdzenia)
  const core = st.pawns.filter((p) => p.kind === 'core');
  const hx = core.length ? (core.reduce((a, p) => a + p.x, 0) / core.length) * TILE : ((hq.x0 + hq.x1 + 1) / 2) * TILE;
  const hy = core.length ? (core.reduce((a, p) => a + p.y, 0) / core.length) * TILE : ((hq.y0 + hq.y1 + 1) / 2) * TILE;
  const cam = params.get('cam');
  if (cam) {
    // cam=x,y,zoom w kafelkach albo cam=hq,zoom (siedziba) albo cam=all (całe osiedle)
    const parts = cam.split(',');
    if (parts[0] === 'all')
      Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    else if (parts[0] === 'hq') Object.assign(view.cam, { x: hx, y: hy, zoom: Number(parts[1]) || 1 });
    else {
      const [x, y, z] = parts.map(Number);
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom: z || 1 });
    }
  } else {
    // najpierw całe osiedle, potem zjazd do siedziby
    Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    flyTo(hx, hy, 1, 2400);
  }
  // ?swiatla=test: trzy światła przy siedzibie do podglądu nocy
  if (params.get('swiatla') === 'test') view.lights = testLights(hx / TILE, hy / TILE);
  if (params.has('speed')) speed = Number(params.get('speed'));
  const first = st.pawns[0];
  if (first) selected.add(first.id);
  const touch = matchMedia('(pointer: coarse)').matches;
  say(
    touch
      ? 'To wasz zarząd. Stuknij człowieka, potem miejsce, gdzie ma iść. Jednym palcem przesuwasz mapę, dwoma przybliżasz.'
      : 'To wasz zarząd. Kliknij człowieka, a potem prawym przyciskiem miejsce, gdzie ma iść. Ramką zaznaczysz kilku.',
    9000,
  );
  renderSpeed();
  if (window.zm) window.zm.sim = sim;
}

/** światła do podglądu wokół punktu (x, y) w metrach: ognisko, okno z kozą, latarka warty */
function testLights(x: number, y: number): Light[] {
  return [
    { x: x + 4, y: y - 3, r: 7, color: 0xff9a3c, strength: 1.15, flicker: 0.35 },
    { x: x + 1, y: y + 0.8, r: 3, color: 0xffc46b, strength: 0.8, flicker: 0.12 },
    { x: x - 6, y: y - 1.5, r: 4.5, color: 0xcfdcff, strength: 0.9, flicker: 0 },
  ];
}

/* ---------- kamera ---------- */
let fly: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t0: number; ms: number } | null =
  null;
function flyTo(x: number, y: number, zoom: number, ms: number) {
  fly = { x0: view.cam.x, y0: view.cam.y, z0: view.cam.zoom, x1: x, y1: y, z1: zoom, t0: performance.now() + 500, ms };
}
function stepFly(now: number) {
  if (!fly) return;
  const t = Math.min(1, Math.max(0, (now - fly.t0) / fly.ms));
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  view.cam.x = fly.x0 + (fly.x1 - fly.x0) * e;
  view.cam.y = fly.y0 + (fly.y1 - fly.y0) * e;
  view.cam.zoom = fly.z0 * (fly.z1 / fly.z0) ** e;
  if (t >= 1) fly = null;
}

/* ---------- pętla ---------- */
let fpsFrames = 0;
let fpsT = performance.now();
let fps = 0;
let hudT = 0;
const keys = new Set<string>();

function frame(now: number, dtMs: number) {
  if (!sim) return;
  stepFly(now);
  // klawiatura: przesuwanie mapy
  const pan = (900 * dtMs) / 1000 / view.cam.zoom;
  if (keys.has('KeyW') || keys.has('ArrowUp')) view.cam.y -= pan;
  if (keys.has('KeyS') || keys.has('ArrowDown')) view.cam.y += pan;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) view.cam.x -= pan;
  if (keys.has('KeyD') || keys.has('ArrowRight')) view.cam.x += pan;
  view.clampCam();
  // stały krok symulacji
  const mult = SPEEDS[speed];
  acc += (Math.min(dtMs, 100) / 1000) * TICKS_PER_SECOND * mult;
  let n = 0;
  while (acc >= 1 && n < 40) {
    view.beforeStep(sim.st);
    sim.step();
    acc -= 1;
    n++;
  }
  if (n === 40) acc = 0;
  view.render(sim.st, mult ? acc : 1, selected);
  fpsFrames++;
  if (now - fpsT >= 1000) {
    fps = (fpsFrames * 1000) / (now - fpsT);
    fpsFrames = 0;
    fpsT = now;
  }
  if (now - hudT > 200) {
    hudT = now;
    hud(now);
  }
}

let cardHtml = '';
/** karta przerysowana tylko po zmianie treści, inaczej dymki z opisem cech nigdy się nie pokażą */
function setCard(html: string) {
  if (html === cardHtml) return;
  cardHtml = html;
  $('card').innerHTML = html;
}

function hud(now: number) {
  if (!sim) return;
  const st = sim.st;
  $('hDay').textContent = `Dzień ${dayOf(st.tick)}`;
  $('hTime').textContent = clockOf(st.tick);
  $('fps').textContent = `${Math.round(fps)} kl/s`;
  $('hint').textContent = now < hintUntil ? hint : '';
  const card = $('card');
  const sel = st.pawns.filter((p) => selected.has(p.id));
  if (!sel.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  if (sel.length > 1) {
    setCard(
      `<h2>Zaznaczeni: ${sel.length}</h2><p class="sub">${sel
        .map((p) => esc(st.people[p.person]?.name ?? 'lokator'))
        .join(', ')}</p><p class="doing">Prawy przycisk: idźcie tam.</p>`,
    );
    return;
  }
  const p = sel[0];
  const who = st.people[p.person];
  if (!who) return;
  const skills = Object.entries(who.skills)
    .map(([d, v]) => `<span class="tag skill">${DOM[d as keyof typeof DOM]} ${v}</span>`)
    .join('');
  const traits = who.traits
    .map((t) => `<span class="tag" title="${esc(TRAITS[t].desc)}">${esc(TRAITS[t].name)}</span>`)
    .join('');
  const doing = p.pi < p.path.length ? 'Idzie.' : 'Stoi i czeka na polecenie.';
  setCard(
    `<h2>${esc(who.name)}</h2><p class="sub">${esc(who.prof)}, ${wiek(who.age)}</p><div class="tags">${skills}${traits}</div><p class="doing">${doing}</p>`,
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function say(t: string, ms = 4000) {
  hint = t;
  hintUntil = performance.now() + ms;
}

function renderSpeed() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.s) === speed));
}
$('speed').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  speed = Number(b.dataset.s);
  renderSpeed();
});
$('zIn').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1.5);
$('zOut').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1 / 1.5);
$('zHome').onclick = () => {
  if (!sim) return;
  const hq = sim.w.buildings[sim.w.hq];
  flyTo(((hq.x0 + hq.x1 + 1) / 2) * TILE, ((hq.y0 + hq.y1 + 1) / 2) * TILE + 120, Math.max(1, view.cam.zoom), 700);
};
$('btnMenu').onclick = () => {
  if (confirm('Wrócić do ekranu startowego? Ta wersja jeszcze nie zapisuje gry.')) location.href = location.pathname;
};

/* ---------- mysz i dotyk ---------- */
const stage = $('stage');
const pointers = new Map<number, { x: number; y: number }>();
let drag: {
  id: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  button: number;
  type: string;
  moved: boolean;
} | null = null;
let pinch: { d: number; z: number; mx: number; my: number } | null = null;
const box = $('box');

stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  fly = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.cam.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    drag = null;
    return;
  }
  drag = {
    id: e.pointerId,
    x: e.offsetX,
    y: e.offsetY,
    cx: view.cam.x,
    cy: view.cam.y,
    button: e.button,
    type: e.pointerType,
    moved: false,
  };
});
stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const target = (pinch.z * d) / pinch.d;
    view.zoomAt(mx, my, target / view.cam.zoom);
    // dwa palce przesuwają też mapę
    view.cam.x -= (mx - pinch.mx) / view.cam.zoom;
    view.cam.y -= (my - pinch.my) / view.cam.zoom;
    view.clampCam();
    pinch.mx = mx;
    pinch.my = my;
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.offsetX - drag.x;
  const dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
  if (!drag.moved) return;
  const boxSelect = drag.type === 'mouse' && drag.button === 0;
  if (boxSelect) {
    box.hidden = false;
    Object.assign(box.style, {
      left: `${Math.min(drag.x, e.offsetX)}px`,
      top: `${Math.min(drag.y, e.offsetY)}px`,
      width: `${Math.abs(dx)}px`,
      height: `${Math.abs(dy)}px`,
    });
  } else {
    view.cam.x = drag.cx - dx / view.cam.zoom;
    view.cam.y = drag.cy - dy / view.cam.zoom;
    view.clampCam();
  }
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!drag || drag.id !== e.pointerId || !sim) {
    drag = null;
    return;
  }
  const d = drag;
  drag = null;
  box.hidden = true;
  if (d.moved) {
    if (d.type === 'mouse' && d.button === 0) {
      // ramka: zaznacza ludzi z rdzenia
      const [x0, y0] = view.toWorld(Math.min(d.x, e.offsetX), Math.min(d.y, e.offsetY));
      const [x1, y1] = view.toWorld(Math.max(d.x, e.offsetX), Math.max(d.y, e.offsetY));
      if (!e.shiftKey) selected.clear();
      for (const p of sim.st.pawns)
        if (p.kind === 'core' && p.x * TILE >= x0 && p.x * TILE <= x1 && p.y * TILE >= y0 && p.y * TILE <= y1)
          selected.add(p.id);
    }
    return;
  }
  const hit = view.pick(sim.st, e.offsetX, e.offsetY);
  const order = d.button === 2 || (d.type !== 'mouse' && !hit);
  if (hit && d.button !== 2) {
    if (!e.shiftKey) selected.clear();
    selected.add(hit.id);
    return;
  }
  if (order && selected.size) {
    const to = view.tileAt(e.offsetX, e.offsetY);
    sim.push({ t: 'move', ids: [...selected], to });
    say(selected.size === 1 ? 'Idzie.' : 'Idą.', 1500);
    return;
  }
  if (d.button === 0 && d.type === 'mouse') selected.clear();
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    fly = null;
    view.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  // klawisze gry tylko w grze i nie na polach ani przyciskach (spacja ma działać na przyciskach)
  const tag = (e.target as HTMLElement).tagName;
  if (!sim || $('app').hidden || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    renderSpeed();
  }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    speed = Number(e.code.slice(-1));
    renderSpeed();
  }
  if (e.code === 'Escape') selected.clear();
  if (e.code === 'Equal' || e.code === 'NumpadAdd') view.zoomAt(view.width / 2, view.height / 2, 1.25);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.zoomAt(view.width / 2, view.height / 2, 0.8);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* ---------- start ---------- */
(async () => {
  window.zm = {
    ready: false,
    sim: null,
    view,
    fps: () => fps,
    setCam: (x, y, zoom) => {
      fly = null;
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom });
    },
    chunksPending: () => view.pendingFar,
    idle: () => view.complete && view.pendingFar === 0,
  };
  // ?worker=0: kawałki mapy rysuje główny wątek (zapas dla przeglądarek bez OffscreenCanvas w workerze)
  await view.init($('stage'), { workers: params.get('worker') !== '0' });
  view.app.ticker.add((t) => frame(performance.now(), t.deltaMS));
  const demo = params.get('demo');
  if (demo) await start(() => loadDemo(demo));
  window.zm.ready = true;
})();
