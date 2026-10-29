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
import { ok, udawaneApiGry, zle } from './siec-api-atrapa.ts';
import { atrapaBloku } from './siec-blok-atrapa.ts';

const adr = ADDRESSES.find((a) => a.key === 'lanciego') as (typeof ADDRESSES)[number];
const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
const C = geo.c;
const zbuduj = (bez: string[] | null) => buildWorld(geo, { seed: 1, ...(bez?.length ? { bezSiedziby: bez } : {}) });
const w0 = zbuduj([]);
const k0 = klatkaSiedziby(w0, C) as NonNullable<ReturnType<typeof klatkaSiedziby>>;

/** udawany serwer dla przepływu startu: lista zajętych i odpowiedź na zajęcie */
function udawane(
  o: {
    zajete?: ZajetaKlatka[];
    zajmij?: (k: ZajmijKlatke) => Wynik<ZajetaOdpowiedz>;
    siec?: boolean;
    /** odpowiedź na punkt startu (bez niej: przyjęty) */
    start?: () => Wynik<undefined>;
    /** zajete odpowiada 409 brak_startu, dopóki punkt startu nie został podany (restart serwera) */
    wymagaStartu?: boolean;
  } = {},
) {
  const log: string[] = [];
  const punkty: [number, number][] = [];
  let startPodany = false;
  const api: ApiSieci = {
    async zwolnijWszystkie() {
      log.push('zwolnij');
      return o.siec === false ? zle(0, 'siec') : ok(undefined, 204);
    },
    async punktStartu(lat, lon) {
      log.push('start');
      punkty.push([lat, lon]);
      const r = o.start ? o.start() : ok(undefined, 204);
      if (r.ok) startPodany = true;
      return r;
    },
    async zajete() {
      log.push('zajete');
      if (o.wymagaStartu && !startPodany) return zle(409, 'brak_startu', 'Serwer nie zna punktu startu.');
      return ok({ klatki: o.zajete ?? [] });
    },
    async zajmij(k) {
      log.push(`zajmij ${k.klucz}`);
      return o.zajmij ? o.zajmij(k) : ok({ klatka: { ...k, moja: true, siedziba: true } }, 201);
    },
  };
  return { api, log, punkty };
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
    const { api, log, punkty } = udawane({ wymagaStartu: true });
    const r = await startSieci(api, zbuduj, C);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // punkt startu (środek mapy w stopniach) przed pytaniem o zajęte klatki: bez niego serwer odpowie brak_startu
    expect(log).toEqual(['zwolnij', 'start', 'zajete', `zajmij ${k0.klucz}`]);
    expect(punkty).toEqual([[C[0], C[1]]]);
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
    expect(log).toEqual(['zwolnij', 'start', 'zajete']);
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

  it('punkt startu odrzucony: limit zmian okolicy (429) nie zatrzymuje startu, inny błąd tak; start nie wraca do pytania', async () => {
    const limit = () =>
      zle<undefined>(429, 'za_duzo_prob', 'Za często zmieniacie okolicę drużyny. Spróbujcie później.');
    // 429: drużyna ma już punkt startu z poprzedniej gry w tej okolicy, więc pytanie o klatki może przejść
    const tuNiemoze = udawane({ start: limit });
    const przeszlo = await startSieci(tuNiemoze.api, zbuduj, C);
    expect(przeszlo.ok && przeszlo.stan.dom).toBe(true);
    expect(tuNiemoze.log).toEqual(['zwolnij', 'start', 'zajete', `zajmij ${k0.klucz}`]);
    // 429, a serwer nie zna okolicy (restart): komunikat o limicie, nie ogólny brak punktu startu
    const bez = udawane({ start: limit, wymagaStartu: true });
    const r = await startSieci(bez.api, zbuduj, C);
    expect(r).toEqual({ ok: false, komunikat: 'Za często zmieniacie okolicę drużyny. Spróbujcie później.' });
    expect(bez.log).toEqual(['zwolnij', 'start', 'zajete']);
    // błąd sieci przy punkcie startu: gra bez sieci od razu, bez pytania o klatki
    const siec = udawane({ start: () => zle(0, 'siec', 'Brak połączenia z serwerem gry.') });
    expect(await startSieci(siec.api, zbuduj, C)).toEqual({ ok: false, komunikat: 'Brak połączenia z serwerem gry.' });
    expect(siec.log).toEqual(['zwolnij', 'start']);
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

  it('blok na karcie startowej: bez formularza, z kodem powrotu i prywatnością; nick i hasło za odnośnikiem „logowanie”', () => {
    const dr = htmlSieci({ stan: 'druzyna' });
    expect(dr).toContain('Gra z sąsiadami');
    expect(dr).not.toContain('próba');
    expect(dr).toContain('Drużyna powstaje przy pierwszej grze');
    expect(dr).toContain('konto nie ma e-maila ani hasła');
    expect(dr).not.toContain('id="scNick"');
    expect(dr).not.toContain('id="scHaslo"');
    expect(dr).toContain('id="scKod"');
    expect(dr).toContain('data-siec="powrot"');
    expect(dr).toContain('data-siec="logowanie"');
    expect(dr).toContain('href="prywatnosc.html#pl"');
    expect(dr).not.toContain('Kontynuuj z chmury');
    // drużyna anonimowa, która już jest: znak i zapis z chmury, bez wylogowania (bez kodu byłoby nie do odzyskania)
    const jest = htmlSieci({ stan: 'druzyna', znak: '#7', chmura: 'Lanciego, dzień 2, 06:40' });
    expect(jest).toContain('Gracie jako <b>drużyna #7</b>');
    expect(jest).toContain('Kontynuuj z chmury: Lanciego, dzień 2, 06:40');
    expect(jest).toContain('id="scKod"');
    expect(jest).not.toContain('data-siec="wyloguj"');
    // dawny formularz po odnośniku
    const wyl = htmlSieci({ stan: 'logowanie' });
    expect(wyl).toContain('id="scNick"');
    expect(wyl).toContain('data-siec="zaloguj"');
    expect(wyl).toContain('data-siec="zaloz"');
    expect(wyl).toContain('data-siec="wroc"');
    expect(wyl).toContain('Zapomniane hasło to stracone konto');
    expect(wyl).not.toContain('id="scKod"');
    const zal = htmlSieci({ stan: 'zalogowani', nick: '<b>x</b>', chmura: 'Lanciego, dzień 2, 06:40' });
    expect(zal).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(zal).toContain('Kontynuuj z chmury: Lanciego, dzień 2, 06:40');
    expect(zal).toContain('data-siec="wyloguj"');
    expect(zal).not.toContain('próba');
    expect(htmlSieci({ stan: 'zalogowani', nick: 'a' })).not.toContain('chmury');
    // znak i komunikat bez wstrzyknięć
    expect(htmlSieci({ stan: 'druzyna', znak: '<i>#1</i>', komunikat: '<u>x</u>' })).not.toContain('<i>');
  });
});

const dane: Loaded = { geo, name: 'Ursynów', addr: 'Lanciego 10G, Warszawa', street: 'Lanciego', src: 'mvt' };
const chwila = () => new Promise((r) => setTimeout(r, 0));
const obca = (k: ZajmijKlatke): ZajetaKlatka => ({ ...k, moja: false });

/** ktoś z zarządu w drzwiach siedziby świata w */
function naDrzwiach(sim: Sim, w: World) {
  const door = w.buildings[w.hq].entrances[0].out;
  const p = sim.st.pawns.find((q) => q.kind === 'core') as (typeof sim.st.pawns)[number];
  p.x = (door % w.size) + 0.5;
  p.y = Math.floor(door / w.size) + 0.5;
}

describe('gra z sąsiadami w grze (src/net/gra.ts, bez DOM)', () => {
  const opcje = (
    api: ApiGry,
    o: {
      wlaczona?: boolean;
      sesja?: Map<string, string>;
      przeladuj?: () => void;
      say?: string[];
      status?: string[];
      tryb?: string;
      onChmura?: (s: Save) => void;
    } = {},
  ) => ({
    el: null,
    warstwa: null,
    wlaczona: o.wlaczona ?? true,
    touch: false,
    say: (t: string) => void o.say?.push(t),
    status: (t: string) => void o.status?.push(t),
    screenOf: (x: number, y: number): [number, number] => [x, y],
    onChmura: o.onChmura ?? (() => {}),
    api,
    sesja: {
      getItem: (k: string) => o.sesja?.get(k) ?? null,
      setItem: (k: string, v: string) => void o.sesja?.set(k, v),
      removeItem: (k: string) => void o.sesja?.delete(k),
    },
    przeladuj: o.przeladuj ?? (() => {}),
    ...(o.tryb ? { tryb: () => o.tryb as string } : {}),
  });

  /** nowa gra zalogowanej drużyny na adresie z klatką zajętą przez inną drużynę: start bez domu */
  async function bezDomu(api: ApiGry, o: Parameters<typeof opcje>[1] = {}) {
    const g = new GraSieciowa(opcje(api, o));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    return { g, w, sim: new Sim(w, st) };
  }

  it('bez ?siec=1 gra jak bez sieci: zwykły świat, bez znaczników, bez poleceń, bez chmury', async () => {
    const { api, log } = udawaneApiGry();
    const g = new GraSieciowa(opcje(api, { wlaczona: false }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    expect(worldKey(w)).toBe(worldKey(w0));
    expect(g.stan).toBeNull();
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
    g.zapisz({} as Save);
    g.koniec();
    expect(log).toEqual([]);
  });

  it('start bez domu, „Zajmij klatkę” na drzwiach nowej siedziby i zapis z listą wykluczeń odtwarza ten sam świat', async () => {
    const { api, log } = udawaneApiGry({ zajeteNaStarcie: [obca(doZajecia(k0))] });
    const { g, w, sim } = await bezDomu(api);
    expect(g.podglad()).toMatchObject({
      zalogowani: true,
      stan: { dom: false, zajete: [k0.budynek], konto: 'Sasiad' },
    });
    expect(g.bezDomu()).toBe(true);
    expect(g.komunikatStartu()).toMatch(/zajął waszą klatkę/);
    expect(naProgu(sim.st, w)).toBe(false);
    const cel = klatkaSiedziby(w, C) as NonNullable<ReturnType<typeof klatkaSiedziby>>;
    const [item] = g.menu(sim, w.buildings[w.hq].entrances[0].tile);
    expect(item).toMatchObject({ label: 'Zajmij klatkę (wasz nowy dom)', confirm: true, quick: false });
    expect(g.obsluz(item)).toBe(true);
    await chwila();
    expect(log).toContain(`zajmij ${cel.klucz}`);
    expect(g.bezDomu()).toBe(false);
    expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
    // zapis do chmury: od razu, następny dopiero po minucie (także po zakończonym wysyłaniu)
    const save = { siec: g.stan } as unknown as Save;
    g.zapisz(save);
    await chwila();
    g.zapisz(save);
    await chwila();
    expect(log.filter((x) => x.startsWith('chmura'))).toEqual(['chmura -']);
    expect(g.stan?.wersja).toBe(1);
    // wczytanie zapisu na tym samym koncie: ten sam świat, następny zapis do chmury od wersji z zapisu
    const z2 = udawaneApiGry();
    const g2 = new GraSieciowa(opcje(z2.api));
    await g2.init();
    const w2 = await g2.przygotuj(dane, zbuduj, save);
    expect(worldKey(w2)).toBe(worldKey(w));
    expect(w2.hq).toBe(w.hq);
    g2.zapisz(save);
    await chwila();
    expect(z2.log.filter((x) => x.startsWith('chmura'))).toEqual(['chmura 1']);
  });

  it('zapis z przeglądarki ten sam co w chmurze (odpowiedź z nową wersją nie doszła): dalej od wersji z serwera', async () => {
    const siec = { zajete: [], dom: true, konto: 'Sasiad', wersja: 6 };
    const zapis = { v: 1, at: 5, seed: 1, sim: { v: 3, tick: 0 }, gov: { v: 1 }, data: dane, siec };
    for (const [at, wyslany] of [
      [5, 'chmura 7'],
      [4, 'chmura 6'],
    ] as const) {
      const { api, log } = udawaneApiGry({ chmura: { dane: zapis, wersja: 7 } });
      const g = new GraSieciowa(opcje(api));
      await g.init();
      const lokalny = { ...zapis, at } as unknown as Save;
      await g.przygotuj(dane, zbuduj, lokalny);
      g.zapisz(lokalny);
      await chwila();
      expect(log.filter((x) => x.startsWith('chmura'))).toEqual([wyslany]);
    }
  });

  it('zapis gry sieciowej bez zalogowania albo z innego konta: ten sam świat, ale bez zajmowania i bez chmury', async () => {
    const save = { siec: { zajete: [k0.budynek], dom: false, konto: 'Sasiad' } } as unknown as Save;
    for (const nick of [null, 'Inny']) {
      const { api, log } = udawaneApiGry({ nick });
      const g = new GraSieciowa(opcje(api));
      await g.init();
      const w = await g.przygotuj(dane, zbuduj, save);
      expect(w.hq).toBe(zbuduj([k0.budynek]).hq);
      expect(g.podglad().bezSieci).toBe(true);
      // cele zwykłe, nie „Bez domu”, bo i tak nie da się zająć klatki
      expect(g.bezDomu()).toBe(false);
      expect(g.komunikatStartu() ?? '').toMatch(nick ? /innego konta/ : /^$/);
      const sim = new Sim(w, createSim(w, 1));
      naDrzwiach(sim, w);
      g.klatka(sim, 10_000, false);
      expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
      g.zapisz(save);
      g.koniec();
      await chwila();
      expect(log).toEqual([]);
    }
  });

  it('wczytana gra po wygaśnięciu: wolna siedziba zajmuje się po cichu, zajęta daje jeden komunikat i gra idzie dalej', async () => {
    // zapis drużyny z domem, która nie grała ponad 14 dni: serwer zwolnił jej klatki (server/baza.ts, wygasanie)
    const zapis = {
      v: 1,
      at: 5,
      seed: 1,
      sim: { v: 3, tick: 0 },
      gov: { v: 1 },
      data: dane,
      siec: { zajete: [], dom: true, konto: 'Sasiad', wersja: 4 },
    } as unknown as Save;

    // klatka siedziby wolna: zajęta od nowa bez słowa, jedno zapytanie o nią i jedno o listę zajętych
    const wolna = udawaneApiGry();
    const cicho: string[] = [];
    const g1 = new GraSieciowa(opcje(wolna.api, { say: cicho }));
    await g1.init();
    const w1 = await g1.przygotuj(dane, zbuduj, zapis);
    await chwila();
    expect(worldKey(w1)).toBe(worldKey(w0));
    expect(wolna.log).toEqual([`zajmij ${k0.klucz}`, 'zajete']);
    expect(cicho).toEqual([]);
    expect(g1.komunikatStartu()).toBeNull();
    expect(g1.podglad()).toMatchObject({ bezSieci: false, stan: { dom: true } });
    expect(g1.bezDomu()).toBe(false);

    // klatkę w międzyczasie zajęła inna drużyna: jeden komunikat, dom zostaje, bez ponowień i bez zmiany trybu
    const zajeta = udawaneApiGry({
      zajeteNaStarcie: [obca(doZajecia(k0))],
      zajmij: () => zle(409, 'zajeta', 'Ta klatka jest zajęta przez inną drużynę.'),
    });
    const powiedziane: string[] = [];
    const g2 = new GraSieciowa(opcje(zajeta.api, { say: powiedziane }));
    await g2.init();
    const w2 = await g2.przygotuj(dane, zbuduj, zapis);
    await chwila();
    expect(w2.hq).toBe(w1.hq);
    expect(zajeta.log).toEqual([`zajmij ${k0.klucz}`, 'zajete']);
    expect(powiedziane).toHaveLength(1);
    expect(powiedziane[0]).toMatch(/waszą klatkę zajęła inna drużyna.*dalej u was/);
    expect(g2.podglad()).toMatchObject({ bezSieci: false, stan: { dom: true } });
    expect(g2.bezDomu()).toBe(false);
    // dalej w grze: klatka w trakcie rozgrywki nie ponawia zajęcia ani komunikatu, symulacja idzie
    const sim = new Sim(w2, createSim(w2, 1));
    for (let i = 0; i < 3; i++) {
      g2.klatka(sim, 10_000 * (i + 1), false);
      for (let k = 0; k < 20; k++) sim.step();
      await chwila();
    }
    expect(zajeta.log.filter((x) => x.startsWith('zajmij'))).toHaveLength(1);
    expect(powiedziane).toHaveLength(1);
    // menu przy drzwiach tylko informuje, że klatka jest cudza; „Zajmij klatkę” zostaje dla drużyny bez domu
    const menu = g2.menu(sim, w2.buildings[w2.hq].entrances[0].tile);
    expect(menu.map((m) => m.label)).toEqual(['Klatka zajęta przez inną drużynę']);
  });

  it('błąd zajęcia, który się nie zmieni (za daleko, limit): bez ponowień i bez ponownego startu', async () => {
    const sesja = new Map<string, string>();
    const powiedziane: string[] = [];
    let przeladowano = false;
    const { api, log } = udawaneApiGry({
      zajeteNaStarcie: [obca(doZajecia(k0))],
      zajmij: () => zle(403, 'za_daleko', 'Ta klatka jest za daleko od waszej siedziby.'),
    });
    const { g, w, sim } = await bezDomu(api, {
      sesja,
      say: powiedziane,
      przeladuj: () => {
        przeladowano = true;
      },
    });
    naDrzwiach(sim, w);
    g.klatka(sim, 10_000, false);
    await chwila();
    g.klatka(sim, 20_000, false);
    await chwila();
    expect(log.filter((x) => x.startsWith('zajmij'))).toHaveLength(1);
    expect(g.bezDomu()).toBe(false);
    expect(powiedziane.at(-1)).toMatch(/za daleko.*bez zajmowania/);
    expect(sesja.size).toBe(0);
    expect(przeladowano).toBe(false);
  });

  it('klatka nowej siedziby zajęta po drodze: jeden ponowny start bez niej i bez budynków z nowymi cudzymi klatkami', async () => {
    const sesja = new Map<string, string>();
    let przeladowano = false;
    const inna = { ...obca(doZajecia(k0)), klucz: 'zm:inna:1', budynek: 'px:1:2:3:4:1' };
    const { api, log } = udawaneApiGry({
      zajeteNaStarcie: [obca(doZajecia(k0))],
      zajetePozniej: [obca(doZajecia(k0)), inna],
      zajmij: () => zle(409, 'zajeta'),
    });
    const { g, w, sim } = await bezDomu(api, {
      sesja,
      tryb: 'zombie',
      przeladuj: () => {
        przeladowano = true;
      },
    });
    // odświeżenie listy w trakcie gry (nikt jeszcze nie stoi w drzwiach), potem ktoś z zarządu w drzwiach
    g.klatka(sim, 1e9, false);
    await chwila();
    naDrzwiach(sim, w);
    expect(naProgu(sim.st, w)).toBe(true);
    g.klatka(sim, 1e9 + 1000, false);
    await chwila();
    g.klatka(sim, 1e9 + 2000, false);
    await new Promise((r) => setTimeout(r, 2600));
    expect(log.filter((x) => x.startsWith('zajmij'))).toHaveLength(1);
    const zapis = JSON.parse(sesja.get(PONOWNY_START) ?? '{}');
    const hq = kluczBudynku(w.buildings[w.hq]);
    expect(zapis.stan.zajete).toEqual([k0.budynek, hq, inna.budynek].sort());
    expect(zapis.tryb).toBe('zombie');
    expect(przeladowano).toBe(true);
    // po przeładowaniu: dane osiedla i tryb z pamięci sesji, świat bez tych budynków, dalej bez domu
    const g3 = new GraSieciowa(opcje(udawaneApiGry().api, { sesja }));
    await g3.init();
    const p3 = g3.ponownyStart();
    expect(p3?.tryb).toBe('zombie');
    const data3 = p3?.data as Loaded;
    const w3 = await g3.przygotuj(data3, (bez) =>
      buildWorld(data3.geo, { seed: 1, ...(bez?.length ? { bezSiedziby: bez } : {}) }),
    );
    expect(zapis.stan.zajete).not.toContain(kluczBudynku(w3.buildings[w3.hq]));
    expect(g3.bezDomu()).toBe(true);
    expect(g3.komunikatStartu()).toMatch(/szybsza/);
    expect(sesja.has(PONOWNY_START)).toBe(false);
  });

  it('koniec gry: zapis w chmurze i klatki drużyny znikają z serwera, potem już nic nie idzie', async () => {
    const { api, log } = udawaneApiGry();
    const g = new GraSieciowa(opcje(api));
    await g.init();
    await g.przygotuj(dane, zbuduj);
    expect(g.stan).toMatchObject({ dom: true, zajete: [] });
    g.koniec();
    await chwila();
    expect(log.slice(-2)).toEqual(['usun', 'zwolnij']);
    expect(g.stan).toBeNull();
    g.zapisz({} as Save);
    await chwila();
    expect(log.some((x) => x.startsWith('chmura'))).toBe(false);
  });

  /** zapis z chmury albo z przeglądarki w kształcie, który przyjmuje readSave */
  const zapisGry = (siec: Save['siec'], at = 5) =>
    ({ v: 1, at, seed: 1, sim: { v: 3, tick: 0 }, gov: { v: 1 }, data: dane, siec }) as unknown as Save;

  it('nowa gra na prawdziwym adresie bez konta zakłada drużynę raz i startuje w sieci', async () => {
    const status: string[] = [];
    const say: string[] = [];
    const { api, log } = udawaneApiGry({ nick: null, wymagaStartu: true });
    const g = new GraSieciowa(opcje(api, { status, say }));
    await g.init();
    // samo wejście na stronę nie zakłada drużyny
    expect(log).toEqual([]);
    expect(g.podglad().zalogowani).toBe(false);
    expect(g.anonimowa()).toBe(false);
    const w = await g.przygotuj(dane, zbuduj);
    // drużyna raz, potem jak zalogowana: zwolnienie starych klatek, punkt startu przed pytaniem o klatki, zajęcie
    expect(log).toEqual(['druzyna', 'zwolnij', 'start', 'zajete', `zajmij ${k0.klucz}`]);
    expect(status[0]).toBe('Zakładam drużynę na serwerze gry…');
    expect(worldKey(w)).toBe(worldKey(w0));
    expect(g.podglad()).toMatchObject({
      zalogowani: true,
      bezSieci: false,
      stan: { dom: true, zajete: [], konto: '#7' },
    });
    expect(g.anonimowa()).toBe(true);
    expect(g.komunikatStartu()).toMatch(/klatka była wolna/);
    expect(say).toEqual([]);
    // druga gra tej samej drużyny w tej samej przeglądarce: konto już jest, nowej drużyny nie ma
    log.length = 0;
    await g.przygotuj(dane, zbuduj);
    expect(log).toEqual(['zwolnij', 'start', 'zajete', `zajmij ${k0.klucz}`]);
  });

  it('druzyna() kończy się 503: gra bez sieci z jednym komunikatem, bez drugiej próby', async () => {
    const say: string[] = [];
    const { api, log } = udawaneApiGry({
      nick: null,
      druzyna: () => zle(503, 'serwer_zajety', 'Serwer jest przeciążony. Spróbujcie za chwilę.'),
    });
    const g = new GraSieciowa(opcje(api, { say }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    expect(worldKey(w)).toBe(worldKey(w0));
    expect(g.stan).toBeNull();
    expect(g.podglad().zalogowani).toBe(false);
    expect(g.komunikatStartu()).toBe('Serwer jest przeciążony. Spróbujcie za chwilę. Gramy bez sieci.');
    // w grze nic już nie pyta serwera: ani druzyna() drugi raz, ani klatki, ani zapis
    const st = createSim(w, 1);
    g.poStarcie(st, w);
    const sim = new Sim(w, st);
    for (let i = 1; i <= 3; i++) {
      g.klatka(sim, i * 1e9, false);
      g.zapisz({} as Save);
      await chwila();
    }
    g.koniec();
    expect(g.menu(sim, w.buildings[w.hq].entrances[0].tile)).toEqual([]);
    expect(log).toEqual(['druzyna']);
    expect(say).toEqual([]);
    // brak sieci w ogóle: ten sam przebieg, jedna próba
    const bez = udawaneApiGry({ nick: null, druzyna: () => zle(0, 'siec', 'Brak połączenia z serwerem gry.') });
    const g2 = new GraSieciowa(opcje(bez.api));
    await g2.init();
    await g2.przygotuj(dane, zbuduj);
    expect(g2.komunikatStartu()).toBe('Brak połączenia z serwerem gry. Gramy bez sieci.');
    expect(bez.log).toEqual(['druzyna']);
  });

  it('demo i gra bez serwera albo bez flagi nie zakładają drużyny', async () => {
    const demo = udawaneApiGry({ nick: null });
    const g = new GraSieciowa(opcje(demo.api));
    await g.init();
    const w = await g.przygotuj({ ...dane, src: 'demo' }, zbuduj);
    expect(worldKey(w)).toBe(worldKey(w0));
    expect(g.stan).toBeNull();
    expect(g.komunikatStartu()).toBeNull();
    expect(demo.log).toEqual([]);
    // serwer nie odpowiada (GitHub Pages): zwykła gra, bez pytań i bez komunikatu
    const pages = udawaneApiGry({ nick: null, bezSerwera: true });
    const g2 = new GraSieciowa(opcje(pages.api));
    await g2.init();
    await g2.przygotuj(dane, zbuduj);
    expect(g2.stan).toBeNull();
    expect(g2.komunikatStartu()).toBeNull();
    expect(pages.log).toEqual([]);
    // flaga wyłączona (?siec=0): serwer jest, ale gra o nim nie wie
    const wylaczona = udawaneApiGry({ nick: null });
    const g3 = new GraSieciowa(opcje(wylaczona.api, { wlaczona: false }));
    await g3.init();
    await g3.przygotuj(dane, zbuduj);
    expect(g3.stan).toBeNull();
    expect(wylaczona.log).toEqual([]);
  });

  it('adres wyszukuje serwer gry tylko przy włączonej sieci i odpowiadającym serwerze', async () => {
    const przypadki = [
      { nazwa: 'sieć i serwer', wlaczona: true, bezSerwera: false, serwer: true },
      { nazwa: 'flaga wyłączona', wlaczona: false, bezSerwera: false, serwer: false },
      { nazwa: 'serwer leży', wlaczona: true, bezSerwera: true, serwer: false },
    ];
    for (const p of przypadki) {
      const { api } = udawaneApiGry({ nick: null, bezSerwera: p.bezSerwera });
      const g = new GraSieciowa(opcje(api, { wlaczona: p.wlaczona }));
      // przed init nie wiadomo, czy serwer odpowiada
      expect(g.apiAdresu(), p.nazwa).toBeUndefined();
      await g.init();
      expect(g.apiAdresu() === api, p.nazwa).toBe(p.serwer);
      expect(g.apiAdresu() === undefined, p.nazwa).toBe(!p.serwer);
    }
  });

  it('liczniki dostają klienta API tylko przy włączonej sieci i odpowiadającym serwerze', async () => {
    const przypadki = [
      { nazwa: 'sieć i serwer', wlaczona: true, bezSerwera: false, serwer: true },
      { nazwa: 'flaga wyłączona (produkcja bez VITE_SIEC)', wlaczona: false, bezSerwera: false, serwer: false },
      { nazwa: 'serwer leży', wlaczona: true, bezSerwera: true, serwer: false },
    ];
    for (const p of przypadki) {
      const { api } = udawaneApiGry({ nick: null, bezSerwera: p.bezSerwera });
      const g = new GraSieciowa(opcje(api, { wlaczona: p.wlaczona }));
      expect(g.apiLicznikow(), p.nazwa).toBeUndefined();
      await g.init();
      expect(g.apiLicznikow() === api, p.nazwa).toBe(p.serwer);
      expect(g.apiLicznikow() === undefined, p.nazwa).toBe(!p.serwer);
    }
  });

  it('kod powrotu na karcie startowej loguje do drużyny i pokazuje „Kontynuuj z chmury”', async () => {
    const chmura = { dane: zapisGry({ zajete: [], dom: true, konto: '#7', wersja: 3 }), wersja: 3 };
    const { api, log } = udawaneApiGry({ nick: null, kody: { ABCDEFGHJKLM: '#7' }, chmura });
    const blok = atrapaBloku();
    let wczytany: Save | null = null;
    const g = new GraSieciowa({
      ...opcje(api, { onChmura: (s) => (wczytany = s) }),
      el: blok.el as unknown as HTMLElement,
    });
    await g.init();
    expect(blok.el.hidden).toBe(false);
    expect(blok.el.innerHTML).toContain('id="scKod"');
    expect(blok.el.innerHTML).not.toContain('id="scNick"');
    expect(blok.el.innerHTML).not.toContain('Kontynuuj z chmury');
    // zły kod: komunikat z serwera, pole z wpisanym kodem zostaje, nic się nie loguje
    blok.pole('#scKod').value = 'ZZZZ-ZZZZ-ZZZZ';
    blok.klik('powrot');
    await chwila();
    await chwila();
    expect(blok.el.innerHTML).toContain('Ten kod nie pasuje do żadnej drużyny.');
    expect(blok.pole('#scKod').value).toBe('ZZZZ-ZZZZ-ZZZZ');
    expect(g.podglad().zalogowani).toBe(false);
    // coś, co nie jest kodem: bez pytania serwera
    const pytan = log.length;
    blok.pole('#scKod').value = 'abc';
    blok.klik('powrot');
    await chwila();
    expect(log.length).toBe(pytan);
    expect(blok.el.innerHTML).toContain('Kod powrotu ma 12 znaków');
    // dobry kod, w dowolnej wielkości liter: drużyna i zapis z chmury
    blok.pole('#scKod').value = 'abcd-efgh-jklm';
    blok.klik('powrot');
    await chwila();
    await chwila();
    expect(log).toContain('powrot abcd-efgh-jklm');
    expect(g.podglad().zalogowani).toBe(true);
    expect(g.anonimowa()).toBe(true);
    expect(blok.el.innerHTML).toContain('Gracie jako <b>drużyna #7</b>');
    expect(blok.el.innerHTML).toMatch(/Kontynuuj z chmury: Ursynów, dzień 1/);
    expect(blok.el.innerHTML).not.toContain('Ten kod nie pasuje');
    blok.klik('chmura');
    expect((wczytany as Save | null)?.siec?.konto).toBe('#7');
  });

  it('odnośnik „logowanie” pokazuje dawny formularz z nickiem, „wróć” wraca do bloku drużyny', async () => {
    const { api } = udawaneApiGry({ nick: null });
    const blok = atrapaBloku();
    const g = new GraSieciowa({ ...opcje(api), el: blok.el as unknown as HTMLElement });
    await g.init();
    expect(blok.el.innerHTML).not.toContain('id="scNick"');
    blok.klik('logowanie');
    expect(blok.el.innerHTML).toContain('id="scNick"');
    expect(blok.el.innerHTML).toContain('data-siec="wroc"');
    expect(blok.el.innerHTML).not.toContain('id="scKod"');
    blok.klik('wroc');
    expect(blok.el.innerHTML).toContain('id="scKod"');
    expect(blok.el.innerHTML).not.toContain('id="scNick"');
    expect(g.podglad().zalogowani).toBe(false);
  });

  it('zapis drużyny anonimowej ma konto „#<id>”; wczytany po zalogowaniu kodem tej samej drużyny gra w sieci', async () => {
    // pierwsza przeglądarka: drużyna założona przy pierwszej grze, jej stan trafia do zapisu
    const pierwsza = udawaneApiGry({ nick: null });
    const g1 = new GraSieciowa(opcje(pierwsza.api));
    await g1.init();
    const w1 = await g1.przygotuj(dane, zbuduj);
    expect(g1.stan?.konto).toBe('#7');
    const zapis = zapisGry(g1.stan as NonNullable<typeof g1.stan>);
    expect(JSON.stringify(zapis.siec)).toContain('"konto":"#7"');
    // druga przeglądarka bez sesji: zapis toczy się bez sieci, dopóki nikt nie poda kodu
    const druga = udawaneApiGry({ nick: null, kody: { ABCDEFGHJKLM: '#7', MNPQRSTUVWXY: '#8' } });
    const bez = new GraSieciowa(opcje(druga.api));
    await bez.init();
    await bez.przygotuj(dane, zbuduj, zapis);
    expect(bez.podglad().bezSieci).toBe(true);
    expect(druga.log).toEqual([]);
    // kod innej drużyny: zapis dalej jest obcy, z komunikatem
    const obcy = udawaneApiGry({ nick: null, kody: { MNPQRSTUVWXY: '#8' } });
    const blokObcy = atrapaBloku();
    const gObcy = new GraSieciowa({ ...opcje(obcy.api), el: blokObcy.el as unknown as HTMLElement });
    await gObcy.init();
    blokObcy.pole('#scKod').value = 'MNPQ-RSTU-VWXY';
    blokObcy.klik('powrot');
    await chwila();
    await chwila();
    await gObcy.przygotuj(dane, zbuduj, zapis);
    expect(gObcy.podglad().bezSieci).toBe(true);
    expect(gObcy.komunikatStartu()).toMatch(/innego konta/);
    // kod tej samej drużyny: ten sam świat, gra w sieci (klatka siedziby jeszcze raz na serwerze, lista zajętych)
    const blok = atrapaBloku();
    const g2 = new GraSieciowa({ ...opcje(druga.api), el: blok.el as unknown as HTMLElement });
    await g2.init();
    blok.pole('#scKod').value = 'ABCD-EFGH-JKLM';
    blok.klik('powrot');
    await chwila();
    await chwila();
    const w2 = await g2.przygotuj(dane, zbuduj, zapis);
    await chwila();
    expect(worldKey(w2)).toBe(worldKey(w1));
    expect(g2.podglad()).toMatchObject({ zalogowani: true, bezSieci: false, stan: { konto: '#7', dom: true } });
    expect(g2.komunikatStartu()).toBeNull();
    expect(druga.log.slice(-2)).toEqual([`zajmij ${k0.klucz}`, 'zajete']);
    // jej zapis do chmury idzie dalej z sesji tej drużyny
    g2.zapisz(zapis);
    await chwila();
    expect(druga.log.some((x) => x.startsWith('chmura'))).toBe(true);
  });

  it('stary zapis z nickiem konta działa bez zmian: znak konta z nickiem to nick', async () => {
    const zapis = zapisGry({ zajete: [], dom: true, konto: 'Sasiad' });
    const { api, log } = udawaneApiGry({ nick: 'Sasiad' });
    const g = new GraSieciowa(opcje(api));
    await g.init();
    await g.przygotuj(dane, zbuduj, zapis);
    await chwila();
    expect(g.podglad().bezSieci).toBe(false);
    expect(g.anonimowa()).toBe(false);
    expect(log).toContain(`zajmij ${k0.klucz}`);
    // nowa gra tego konta zapisuje w stanie nick
    const nowa = new GraSieciowa(opcje(udawaneApiGry({ nick: 'Sasiad' }).api));
    await nowa.init();
    await nowa.przygotuj(dane, zbuduj);
    expect(nowa.stan?.konto).toBe('Sasiad');
  });

  it('odświeżenie klatek po restarcie serwera (brak_startu) podaje punkt startu i pyta jeszcze raz, raz', async () => {
    const say: string[] = [];
    const inna = obca({ ...doZajecia(k0), klucz: 'zm:inna:1', budynek: 'px:1:2:3:4:1' });
    const { api, log, restart } = udawaneApiGry({
      nick: null,
      wymagaStartu: true,
      zajetePozniej: [inna, { ...inna, klucz: 'zm:inna:2' }],
    });
    const g = new GraSieciowa(opcje(api, { say }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const sim = new Sim(w, createSim(w, 1));
    log.length = 0;
    expect(g.podglad().klatki).toBe(1);
    // serwer wstał od nowa i nie pamięta punktu startu: odświeżenie dostaje 409, podaje punkt i pyta jeszcze raz
    restart();
    g.klatka(sim, 1e9, false);
    await chwila();
    await chwila();
    expect(log).toEqual(['zajete', 'start', 'zajete']);
    // lista z ponownego pytania weszła do gry
    expect(g.podglad().klatki).toBe(2);
    expect(say).toEqual([]);
    // następne odświeżenie (serwer zna już punkt): jedno pytanie
    log.length = 0;
    g.klatka(sim, 2e9, false);
    await chwila();
    expect(log).toEqual(['zajete']);
  });

  it('brak_startu mimo punktu startu albo limit zmian okolicy: stara lista zostaje, cicho, bez trzeciego pytania', async () => {
    const say: string[] = [];
    // serwer dalej mówi brak_startu po przyjętym punkcie: dokładnie jedno ponowne pytanie
    const upiera = udawaneApiGry({ nick: null, wymagaStartu: true });
    const g = new GraSieciowa(opcje(upiera.api, { say }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const sim = new Sim(w, createSim(w, 1));
    upiera.log.length = 0;
    upiera.restart(true);
    g.klatka(sim, 1e9, false);
    await chwila();
    await chwila();
    expect(upiera.log).toEqual(['zajete', 'start', 'zajete']);
    expect(say).toEqual([]);

    // limit zmian okolicy (429): punkt startu odrzucony, lista zostaje; w następnych odświeżeniach nie próbujemy go znowu
    const limit = udawaneApiGry({
      nick: null,
      wymagaStartu: true,
      start: (n) => (n === 1 ? ok(undefined, 204) : zle(429, 'za_duzo_prob', 'Za często zmieniacie okolicę drużyny.')),
    });
    const g2 = new GraSieciowa(opcje(limit.api, { say }));
    await g2.init();
    const w2 = await g2.przygotuj(dane, zbuduj);
    const sim2 = new Sim(w2, createSim(w2, 1));
    limit.log.length = 0;
    limit.restart();
    g2.klatka(sim2, 1e9, false);
    await chwila();
    await chwila();
    expect(limit.log).toEqual(['zajete', 'start']);
    g2.klatka(sim2, 2e9, false);
    await chwila();
    await chwila();
    expect(limit.log).toEqual(['zajete', 'start', 'zajete']);
    expect(say).toEqual([]);
    expect(g2.podglad()).toMatchObject({ bezSieci: false, klatki: 1 });
  });
});
