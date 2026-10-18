import { describe, expect, it } from 'vitest';
import type { ApiGry, Wynik } from '../../src/net/api.ts';
import { GraSieciowa, PONOWNY_START } from '../../src/net/gra.ts';
import type { ZajetaKlatka, ZajetaOdpowiedz, ZajmijKlatke } from '../../src/net/protokol.ts';
import {
  type ApiSieci,
  doZajecia,
  kafelekUlicy,
  klatkaPod,
  klatkaSiedziby,
  naProgu,
  postawNaUlicy,
  startSieci,
  znaczniki,
} from '../../src/net/siec.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { htmlSieci } from '../../src/ui/siec.ts';
import { type Save, worldKey } from '../../src/ui/zapis.ts';
import { klatkiBudynku, kluczBudynku } from '../../src/world/klucze.ts';
import type { Loaded } from '../../src/world/load.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS, type World } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const adr = ADDRESSES.find((a) => a.key === 'lanciego') as (typeof ADDRESSES)[number];
const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
const C = geo.c;
const zbuduj = (bez: string[]) => buildWorld(geo, { seed: 1, ...(bez.length ? { bezSiedziby: bez } : {}) });
const w0 = zbuduj([]);
const k0 = klatkaSiedziby(w0, C) as NonNullable<ReturnType<typeof klatkaSiedziby>>;

const ok = <T>(dane: T, status = 200): Wynik<T> => ({ ok: true, status, dane });
const zle = <T>(status: number, blad: 'zajeta' | 'siec' | 'za_daleko', komunikat = 'błąd'): Wynik<T> => ({
  ok: false,
  status,
  blad,
  komunikat,
});

/** udawany serwer dla przepływu startu: lista zajętych i odpowiedź na zajęcie */
function udawane(
  o: { zajete?: ZajetaKlatka[]; zajmij?: (k: ZajmijKlatke) => Wynik<ZajetaOdpowiedz>; siec?: boolean } = {},
) {
  const log: string[] = [];
  const api: ApiSieci = {
    async zwolnijWszystkie() {
      log.push('zwolnij');
      return o.siec === false ? zle(0, 'siec') : ok(undefined, 204);
    },
    async zajete() {
      log.push('zajete');
      return ok({ klatki: o.zajete ?? [] });
    },
    async zajmij(k) {
      log.push(`zajmij ${k.klucz}`);
      return o.zajmij ? o.zajmij(k) : ok({ klatka: { ...k, moja: true, siedziba: true } }, 201);
    },
  };
  return { api, log };
}

/** cudza klatka innego budynku mieszkalnego najbliżej siedziby */
function obcaObok(w: World): ZajetaKlatka {
  const hq = w.buildings[w.hq];
  const inny = w.buildings
    .filter((b) => b.id !== w.hq && (b.cls === 'blok' || b.cls === 'dom') && kluczBudynku(b))
    .sort((a, b) => Math.hypot(a.x0 - hq.x0, a.y0 - hq.y0) - Math.hypot(b.x0 - hq.x0, b.y0 - hq.y0) || a.id - b.id)[0];
  return { ...doZajecia(klatkiBudynku(inny)[0]), moja: false };
}

describe('gra z sąsiadami: siedziba i start (src/net/siec.ts)', () => {
  it('bez listy zajętych świat bez zmian; z zajętą siedzibą siedzibą zostaje najbliższy wolny budynek mieszkalny', () => {
    expect(worldKey(zbuduj([]))).toBe(worldKey(buildWorld(geo, { seed: 1 })));
    const bud0 = kluczBudynku(w0.buildings[w0.hq]) as string;
    const w1 = zbuduj([bud0]);
    const hq1 = w1.buildings[w1.hq];
    expect(kluczBudynku(hq1)).not.toBe(bud0);
    expect(['blok', 'dom']).toContain(hq1.cls);
    expect(worldKey(zbuduj([bud0]))).toBe(worldKey(w1));
    // najbliższy: żaden inny mieszkalny spoza listy nie stoi bliżej środka mapy
    const c = Math.floor(w1.size / 2);
    const od = (b: World['buildings'][number]) =>
      Math.hypot(Math.max(b.x0 - c, 0, c - b.x1), Math.max(b.y0 - c, 0, c - b.y1));
    for (const b of w1.buildings)
      if ((b.cls === 'blok' || b.cls === 'dom') && kluczBudynku(b) !== bud0)
        expect(od(b)).toBeGreaterThanOrEqual(od(hq1));
  });

  it('wolna klatka pod adresem: stare klatki zwolnione, klatka siedziby zajęta, zwykły start', async () => {
    const { api, log } = udawane();
    const r = await startSieci(api, zbuduj, C);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(log).toEqual(['zwolnij', 'zajete', `zajmij ${k0.klucz}`]);
    expect(r.stan).toEqual({ zajete: [], dom: true });
    expect(r.swiat.hq).toBe(w0.hq);
    expect(r.klatki.map((k) => [k.klucz, k.moja])).toEqual([[k0.klucz, true]]);
  });

  it('zajęta klatka pod adresem: start bez domu, bez budynków z cudzymi klatkami, bez zajmowania na starcie', async () => {
    const obca = obcaObok(w0);
    const { api, log } = udawane({ zajete: [{ ...doZajecia(k0), moja: false }, obca] });
    const r = await startSieci(api, zbuduj, C);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(log).toEqual(['zwolnij', 'zajete']);
    expect(r.stan.dom).toBe(false);
    expect(r.stan.utracony).toBe(k0.budynek);
    expect(r.stan.zajete).toEqual([k0.budynek, obca.budynek].sort());
    const hq = r.swiat.buildings[r.swiat.hq];
    expect(r.stan.zajete).not.toContain(kluczBudynku(hq));
    expect(r.komunikat).toMatch(/zajął waszą klatkę/);
  });

  it('ktoś był szybszy (409 przy zajmowaniu): też start bez domu; błąd sieci albo serwera: gra bez sieci', async () => {
    const wyscig = await startSieci(udawane({ zajmij: () => zle(409, 'zajeta') }).api, zbuduj, C);
    expect(wyscig.ok && wyscig.stan.dom).toBe(false);
    expect(wyscig.ok && wyscig.stan.zajete).toEqual([k0.budynek]);
    const offline = await startSieci(udawane({ siec: false }).api, zbuduj, C);
    expect(offline).toMatchObject({ ok: false, komunikat: 'błąd' });
    const daleko = await startSieci(udawane({ zajmij: () => zle(422, 'za_daleko', 'Za daleko.') }).api, zbuduj, C);
    expect(daleko).toEqual({ ok: false, komunikat: 'Za daleko.' });
    // świat bez kluczy (demo, zapis sprzed kluczy): bez sieci, bez pytania serwera
    const bezTagow = { ...geo, b: geo.b.map((b) => ({ ...b, t: { building: b.t.building } })) };
    const demo = udawane();
    const r = await startSieci(demo.api, () => buildWorld(bezTagow, { seed: 1 }), C);
    expect(r.ok).toBe(false);
    expect(demo.log).toEqual([]);
  });

  it('drużyna bez domu stoi na ulicy przed drzwiami utraconej klatki i dochodzi do nowej siedziby; przebieg powtarzalny', async () => {
    const r = await startSieci(udawane({ zajete: [{ ...doZajecia(k0), moja: false }] }).api, zbuduj, C);
    if (!r.ok) throw new Error('start');
    const w = r.swiat;
    const przebieg = () => {
      const st = createSim(w, 1, { core: 4 });
      postawNaUlicy(st, w, kafelekUlicy(w, r.stan.utracony));
      return st;
    };
    const st = przebieg();
    const core = st.pawns.filter((p) => p.kind === 'core');
    const tiles = core.map((p) => Math.floor(p.y) * w.size + Math.floor(p.x));
    expect(new Set(tiles).size).toBe(core.length);
    for (const t of tiles) {
      expect(w.blocked[t]).toBe(0);
      expect(w.bid[t]).not.toBe(w.hq);
    }
    // przed drzwiami utraconej klatki (budynek pod adresem)
    const stary = w.buildings.find((b) => kluczBudynku(b) === k0.budynek);
    const out = stary?.entrances[0]?.out ?? -1;
    for (const p of core) expect(Math.hypot(p.x - (out % w.size), p.y - Math.floor(out / w.size))).toBeLessThan(6);
    expect(naProgu(st, w)).toBe(false);
    // polecenie „Idź” do drzwi nowej siedziby: dochodzą (świat jest spójny, brama ich przepuszcza)
    const door = w.buildings[w.hq].entrances[0].out;
    const idz = (s: Sim) => s.push({ t: 'move', ids: core.map((p) => p.id), to: door });
    const sim = new Sim(w, st);
    idz(sim);
    let kroki = 0;
    while (!naProgu(sim.st, w) && kroki < 12_000) {
      sim.step();
      kroki++;
    }
    expect(naProgu(sim.st, w)).toBe(true);
    const drugi = new Sim(w, przebieg());
    idz(drugi);
    for (let k = 0; k < kroki; k++) drugi.step();
    expect(drugi.hash()).toBe(sim.hash());
  });

  it('klatka pod kafelkiem i znaczniki: drzwi, budynek, cudze, nasze i cel na mapie', () => {
    const hq = w0.buildings[w0.hq];
    expect(klatkaPod(w0, C, hq.entrances[0].tile)).toEqual(k0);
    expect(klatkaPod(w0, C, hq.entrances[0].out)).toEqual(k0);
    const wBudynku = w0.bid.indexOf(w0.hq);
    expect(klatkaPod(w0, C, wBudynku)?.budynek).toBe(k0.budynek);
    const droga = w0.bid.findIndex((b, i) => b < 0 && !w0.blocked[i] && !hq.entrances.some((e) => e.out === i));
    expect(klatkaPod(w0, C, droga)).toBeNull();
    const obca = obcaObok(w0);
    const z = znaczniki(w0, C, [obca, { ...doZajecia(k0), moja: true }], null);
    expect(z.map((x) => x.rodzaj).sort()).toEqual(['nasza', 'obca']);
    // znacznik naszej klatki leży na siedzibie (w jej prostokącie, z zapasem 3 m)
    const nasza = z.find((x) => x.rodzaj === 'nasza') as (typeof z)[number];
    expect(nasza.x).toBeGreaterThan(hq.x0 - 3);
    expect(nasza.x).toBeLessThan(hq.x1 + 4);
    expect(nasza.y).toBeGreaterThan(hq.y0 - 3);
    expect(nasza.y).toBeLessThan(hq.y1 + 4);
    expect(znaczniki(w0, C, [], k0).map((x) => x.rodzaj)).toEqual(['cel']);
  });

  it('blok na karcie startowej: formularz z notką o koncie, po zalogowaniu nick i zapis z chmury, HTML bez wstrzyknięć', () => {
    const wyl = htmlSieci({ stan: 'wylogowani' });
    expect(wyl).toContain('id="scNick"');
    expect(wyl).toContain('Zapomniane hasło to stracone konto');
    const zal = htmlSieci({ stan: 'zalogowani', nick: '<b>x</b>', chmura: 'Lanciego, dzień 2, 06:40' });
    expect(zal).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(zal).toContain('Kontynuuj z chmury: Lanciego, dzień 2, 06:40');
    expect(htmlSieci({ stan: 'zalogowani', nick: 'a' })).not.toContain('chmury');
  });
});

/** udawane API dla GraSieciowa: serwer działa, gracz zalogowany, zapis i klatki w pamięci */
function udawaneApiGry(o: { zajeteNaStarcie?: ZajetaKlatka[]; drugie?: Wynik<ZajetaOdpowiedz> } = {}) {
  const log: string[] = [];
  let zajmij = 0;
  const api = {
    serwerDostepny: async () => true,
    ja: async () => ok({ nick: 'Sasiad', utworzone: 1, klatki: 0, zapis: false }),
    pobierzZapis: async () => zle(404, 'siec'),
    zwolnijWszystkie: async () => {
      log.push('zwolnij');
      return ok(undefined, 204);
    },
    zajete: async () => {
      log.push('zajete');
      return ok({ klatki: o.zajeteNaStarcie ?? [] });
    },
    zajmij: async (k: ZajmijKlatke) => {
      log.push(`zajmij ${k.klucz}`);
      zajmij++;
      if (zajmij > 1 && o.drugie) return o.drugie;
      return ok({ klatka: { ...k, moja: true, siedziba: zajmij === 1 } }, 201);
    },
    wyslijZapis: async () => {
      log.push('chmura');
      return ok({ wersja: 1, zmieniony: 1, rozmiar: 1 });
    },
  } as unknown as ApiGry;
  return { api, log };
}

const dane: Loaded = { geo, name: 'Ursynów', addr: 'Lanciego 10G, Warszawa', street: 'Lanciego', src: 'mvt' };

describe('gra z sąsiadami w grze (src/net/gra.ts, bez DOM)', () => {
  const opcje = (api: ApiGry, wlaczona = true, sesja = new Map<string, string>(), przeladuj = () => {}) => ({
    el: null,
    warstwa: null,
    wlaczona,
    touch: false,
    say: () => {},
    screenOf: (x: number, y: number): [number, number] => [x, y],
    onChmura: () => {},
    api,
    sesja: {
      getItem: (k: string) => sesja.get(k) ?? null,
      setItem: (k: string, v: string) => void sesja.set(k, v),
      removeItem: (k: string) => void sesja.delete(k),
    },
    przeladuj,
  });

  it('bez ?siec=1 gra jak bez sieci: zwykły świat, bez znaczników, bez poleceń, bez chmury', async () => {
    const { api, log } = udawaneApiGry();
    const g = new GraSieciowa(opcje(api, false));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    expect(worldKey(w)).toBe(worldKey(w0));
    expect(g.stan).toBeNull();
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
    expect(log).toEqual([]);
  });

  it('start bez domu, „Zajmij klatkę” na drzwiach nowej siedziby i zapis z listą wykluczeń odtwarza ten sam świat', async () => {
    const { api, log } = udawaneApiGry({ zajeteNaStarcie: [{ ...doZajecia(k0), moja: false }] });
    const g = new GraSieciowa(opcje(api));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    expect(g.podglad()).toMatchObject({ zalogowani: true, stan: { dom: false, zajete: [k0.budynek] } });
    expect(g.bezDomu()).toBe(true);
    expect(g.komunikatStartu()).toMatch(/zajął waszą klatkę/);
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    expect(naProgu(sim.st, w)).toBe(false);
    const cel = klatkaSiedziby(w, C) as NonNullable<ReturnType<typeof klatkaSiedziby>>;
    const [item] = g.menu(sim, w.buildings[w.hq].entrances[0].tile);
    expect(item.label).toBe('Zajmij klatkę (wasz nowy dom)');
    expect(g.obsluz(item)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toContain(`zajmij ${cel.klucz}`);
    expect(g.bezDomu()).toBe(false);
    expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
    // zapis gry: stan sieci w zapisie, po wczytaniu ten sam świat
    const save = { siec: g.stan } as unknown as Save;
    const g2 = new GraSieciowa(opcje(udawaneApiGry().api));
    const w2 = await g2.przygotuj(dane, zbuduj, save);
    expect(worldKey(w2)).toBe(worldKey(w));
    expect(w2.hq).toBe(w.hq);
    // zapis do chmury: raz, potem najwyżej raz na minutę
    g.zapisz(save);
    g.zapisz(save);
    await new Promise((r) => setTimeout(r, 0));
    expect(log.filter((x) => x === 'chmura')).toHaveLength(1);
  });

  it('klatka nowej siedziby zajęta po drodze: ponowny start z kolejnym budynkiem na liście', async () => {
    const sesja = new Map<string, string>();
    let przeladowano = false;
    const { api } = udawaneApiGry({
      zajeteNaStarcie: [{ ...doZajecia(k0), moja: false }],
      drugie: zle(409, 'zajeta'),
    });
    const g = new GraSieciowa(
      opcje(api, true, sesja, () => {
        przeladowano = true;
      }),
    );
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    // ktoś z zarządu staje w drzwiach nowej siedziby: gra próbuje ją zająć, serwer mówi, że zajęta (to drugie zajęcie)
    await api.zajmij(doZajecia(k0));
    const door = w.buildings[w.hq].entrances[0].out;
    const p = sim.st.pawns.find((q) => q.kind === 'core') as (typeof sim.st.pawns)[number];
    p.x = (door % w.size) + 0.5;
    p.y = Math.floor(door / w.size) + 0.5;
    expect(naProgu(sim.st, w)).toBe(true);
    g.klatka(sim, 10_000, false);
    await new Promise((r) => setTimeout(r, 2600));
    const zapis = JSON.parse(sesja.get(PONOWNY_START) ?? '{}');
    const hq = kluczBudynku(w.buildings[w.hq]);
    expect(zapis.stan.zajete).toEqual([k0.budynek, hq].sort());
    expect(przeladowano).toBe(true);
    // po przeładowaniu: dane osiedla z pamięci sesji, świat bez obu budynków
    const g3 = new GraSieciowa(opcje(udawaneApiGry().api, true, sesja));
    const data3 = g3.ponownyStart() as Loaded;
    expect(data3).not.toBeNull();
    const w3 = await g3.przygotuj(data3, (bez) => buildWorld(data3.geo, { seed: 1, bezSiedziby: bez }));
    expect(zapis.stan.zajete).not.toContain(kluczBudynku(w3.buildings[w3.hq]));
    expect(g3.bezDomu()).toBe(true);
  });
});
