/* Tablica korkowa badań (docs/superpowers/specs/2026-10-19-badania-design.md, sekcja „Tablica badań”): odczyt stanu
   dla tablicy (`snapshot().tablica`), układ kartek w kolumnach er, treść z `tablicaHtml` (kartki ze stanami, sznurki,
   technologia końcowa, szczegóły z przyciskiem „Badać”, pasek obsady i półka z książkami, oba języki) i warunek samego
   otwarcia tablicy (`czyOtworzycSama`). Stan z createSim na Przymorzu, osoby i umiejętności ustawione ręcznie, żeby
   wynik nie zależał od losowania fachów. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Dom, TECH_DOMS, type TechDom } from '../../src/content/data.ts';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { ERY, kosztTech, nazwaEry, nazwaTech, TECH_BY, TECHS, tempoOsoby } from '../../src/sim/badania.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { createSim, type Pawn, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { EN } from '../../src/ui/badania.en.ts';
import {
  CZCIONKA_CZYTELNA,
  CZCIONKA_KARTKI_MIN,
  czyOtworzycSama,
  KARTA_H,
  KARTA_W,
  SKALA_MIN,
  skalaPlanszy,
  tablicaHtml,
  uklad,
} from '../../src/ui/badania.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => ustawJezyk('pl'));

/** gotowa pracownia postawiona od razu (jak po finishBuild) */
function postawPracownie(st: SimState): Thing {
  const i = allowedAnchors(st, w, 'pracownia', 0)[0];
  const t: Thing = {
    id: st.nextThing++,
    kind: 'pracownia',
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: 2,
    h: 1,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');
const umiejetnosci = (st: SimState, k: number, s: Partial<Record<Dom, number>>) => {
  st.people[rdzen(st)[k].person].skills = s;
};

/** Stan z pracownią i wszystkimi stanami kartek (oprócz „stoi”): cztery technologie zbadane (t_kozy, t_okna,
    t_wieza, t_konserwy), w toku t_spawanie (14 punktów z kosztu ery 2, Budowa 2 ma s1), brak wiedzy w t_wezel (Ciepło 2, macie 1),
    do wzięcia t_zielarstwo, t_barykady, najpierw t_ambu, a ery 3–6 odwrócone. Dwie książki (Uprawa i Medycyna). */
function stan() {
  const st = createSim(w, seed, { core: 4 });
  for (const o of st.people) {
    o.skills = {};
    // bez cech, żeby tempo siedzącego wynikało tylko z umiejętności
    o.traits = [];
  }
  umiejetnosci(st, 0, { bud: 2 });
  umiejetnosci(st, 1, { cieplo: 1 });
  umiejetnosci(st, 2, { med: 1 });
  postawPracownie(st);
  st.techDone = ['t_kozy', 't_okna', 't_wieza', 't_konserwy'];
  st.research = {
    cur: 't_spawanie',
    prog: { t_spawanie: 14 },
    at: { t_okna: 40 * TICKS_PER_HOUR, t_kozy: 10 * TICKS_PER_HOUR, t_konserwy: 70 * TICKS_PER_HOUR, t_wieza: 30 },
  };
  st.books = { uprawa: 1, med: 1 };
  return st;
}

const tablica = (st: SimState, wybrana: string | null = null, mode: 'zwykly' | 'zombie' = 'zwykly') => {
  const b = snapshot(st, w).tablica;
  if (!b) throw new Error('brak odczytu badań');
  return tablicaHtml(b, { wybrana, mode });
};

/** html jednej kartki z tablicy (od jej przycisku do końca) */
function kartkaHtml(html: string, id: string): string {
  const m = html.match(new RegExp(`<button[^>]*class="tb-kartka[^"]*"[^>]*data-tech="${id}"[\\s\\S]*?</button>`));
  if (!m) throw new Error(`brak kartki ${id}`);
  return m[0];
}
const ile = (html: string, wzor: RegExp) => (html.match(wzor) ?? []).length;

/** „14 / 33”: zapisany postęp t_spawanie i jej koszt zaokrąglony w górę, jak na kartce (mnożnik ery 2 daje ułamek) */
const SPAWANIE = `14 / ${Math.ceil(kosztTech('t_spawanie'))}`;
/** godziny do końca t_spawanie przy s1 (Budowa 2, bez cech) siedzącej samotnie: reszta kosztu przez tempo, w górę */
const SPAWANIE_H = Math.ceil((kosztTech('t_spawanie') - 14) / tempoOsoby({ skills: { bud: 2 }, traits: [] }, 'bud'));

describe('tablica badań: odczyt stanu (snapshot().tablica)', () => {
  it('bez pracowni i bez stanu badań jest null', () => {
    const st = createSim(w, seed, { core: 4 });
    expect(snapshot(st, w).tablica).toBeNull();
  });

  it('z pracownią: kartki w kolejności technologii, bieżące badanie, książki, odkrycia i półka', () => {
    const st = stan();
    const b = snapshot(st, w).tablica!;
    expect(b.pracownia).toBe(true);
    expect(b.cur).toBe('t_spawanie');
    expect(b.kartki.map((k) => k.id)).toEqual(TECHS.map((t) => t.id));
    expect(Object.fromEntries(b.kartki.map((k) => [k.id, k.stan]))).toMatchObject({
      t_kozy: 'zbadana',
      t_spawanie: 'w_toku',
      t_wezel: 'brak_wiedzy',
      t_zielarstwo: 'do_wziecia',
      t_ambu: 'najpierw',
      t_panele: 'odwrocona',
      t_siec: 'odwrocona',
    });
    expect(b.ksiazki).toEqual({ uprawa: 1, med: 1 });
    // odkrycia od najstarszego
    expect(b.odkrycia.map((o) => o.id)).toEqual(['t_wieza', 't_kozy', 't_okna', 't_konserwy']);
    expect(b.siedza).toEqual([]);
    expect(b.tempo).toBe(0);
  });

  it('badania bez pracowni, ale ze stanem (po rozbiórce), też są w odczycie', () => {
    const st = stan();
    st.things = st.things.filter((t) => t.kind !== 'pracownia');
    const b = snapshot(st, w).tablica!;
    expect(b.pracownia).toBe(false);
    expect(b.cur).toBe('t_spawanie');
  });

  it('znaja: kto zna dziedzinę (umiejętność co najmniej 1), od najlepszych, z zawodem', () => {
    const st = stan();
    umiejetnosci(st, 3, { bud: 3, cieplo: 1 });
    const b = snapshot(st, w).tablica!;
    expect(b.znaja.bud?.map((o) => o.skill)).toEqual([3, 2]);
    expect(b.znaja.cieplo?.map((o) => o.skill)).toEqual([1, 1]);
    expect(b.znaja.med).toHaveLength(1);
    expect(b.znaja.it ?? []).toEqual([]);
    const o = b.znaja.bud![0];
    expect(o.name).toBe(st.people[rdzen(st)[3].person].name);
    expect(o.prof).toBe(st.people[rdzen(st)[3].person].prof);
  });

  it('siedzą tylko osoby przy stole (faza 1), z umiejętnością w dziedzinie badania, a tempo to suma ich tempa', () => {
    const st = stan();
    umiejetnosci(st, 1, { bud: 1, cieplo: 1 });
    const sim = new Sim(w, st);
    const [a, b2] = rdzen(st);
    expect(sim.startResearch(a, true)).toBe(true);
    expect(sim.startResearch(b2, true)).toBe(true);
    const siedzi = (p: Pawn) => p.job?.t === 'research' && p.job.phase === 1;
    // w drodze do stołu jeszcze nie siedzą
    expect(snapshot(st, w).tablica!.siedza).toEqual([]);
    for (let k = 0; k < 2000 && !(siedzi(a) && siedzi(b2)); k++) sim.step();
    expect(siedzi(a) && siedzi(b2)).toBe(true);
    const sn = snapshot(st, w).tablica!;
    expect(sn.siedza.map((s) => s.id)).toEqual([a.id, b2.id]);
    expect(sn.siedza.map((s) => s.skill)).toEqual([2, 1]);
    expect(sn.siedza[0].name).toBe(st.people[a.person].name);
    const oczekiwane = tempoOsoby(st.people[a.person], 'bud') + tempoOsoby(st.people[b2.person], 'bud');
    expect(sn.tempo).toBeCloseTo(oczekiwane, 10);
  });
});

describe('tablica badań: układ kartek', () => {
  const poz = uklad(TECHS);

  it('każda technologia ma miejsce, kolumna to jej era, a wiersze w kolumnie się nie powtarzają', () => {
    expect([...poz.keys()].sort()).toEqual(TECHS.map((t) => t.id).sort());
    for (const t of TECHS) expect(poz.get(t.id)!.kol).toBe(ERY.findIndex((e) => e.nr === t.era));
    for (const e of ERY) {
      const wiersze = TECHS.filter((t) => t.era === e.nr).map((t) => poz.get(t.id)!.wiersz);
      expect(new Set(wiersze).size).toBe(wiersze.length);
    }
  });

  it('kartki się nie nakładają i leżą w jednej kolumnie pod swoim nagłówkiem ery', () => {
    const lista = [...poz.values()];
    for (const a of lista)
      for (const b of lista) {
        if (a === b) continue;
        const poziomo = a.x < b.x + KARTA_W && b.x < a.x + KARTA_W;
        const pionowo = a.y < b.y + KARTA_H && b.y < a.y + KARTA_H;
        expect(poziomo && pionowo).toBe(false);
      }
  });

  it('technologia z tej samej ery co jej wymaganie leży pod nim', () => {
    for (const t of TECHS)
      for (const r of t.req) {
        if (TECH_BY[r].era !== t.era) continue;
        expect(poz.get(t.id)!.wiersz).toBeGreaterThan(poz.get(r)!.wiersz);
      }
  });
});

describe('tablica badań: kartki', () => {
  it('jedna kartka na technologię, klasa i znacznik stanu, kolumna na erę z nagłówkiem', () => {
    const html = tablica(stan());
    expect(ile(html, /class="tb-kartka/g)).toBe(TECHS.length);
    for (const t of TECHS) expect(ile(html, new RegExp(`data-tech="${t.id}"`, 'g'))).toBe(1);
    const st = stan();
    const stany = Object.fromEntries(snapshot(st, w).tablica!.kartki.map((k) => [k.id, k.stan]));
    for (const t of TECHS) {
      const k = kartkaHtml(html, t.id);
      expect(k).toContain(`data-stan="${stany[t.id]}"`);
      expect(k).toMatch(new RegExp(`class="tb-kartka [^"]*\\b${stany[t.id]}\\b`));
    }
    for (const e of ERY) expect(html).toContain(`${e.nr}. ${tr(nazwaEry(e.nr))}`);
  });

  it('nazwa technologii jest na jej kartce', () => {
    const html = tablica(stan());
    for (const t of TECHS) expect(kartkaHtml(html, t.id)).toContain(tr(nazwaTech(t.id)));
  });

  it('zbadane mają pieczątkę „ZROBIONE”, inne jej nie mają', () => {
    const html = tablica(stan());
    for (const id of ['t_kozy', 't_okna', 't_wieza', 't_konserwy']) expect(kartkaHtml(html, id)).toContain('ZROBIONE');
    for (const id of ['t_spawanie', 't_wezel', 't_zielarstwo', 't_ambu', 't_panele'])
      expect(kartkaHtml(html, id)).not.toContain('ZROBIONE');
    expect(ile(kartkaHtml(html, 't_kozy'), /class="tb-stempel"/g)).toBe(1);
  });

  it('w toku: postęp i koszt (14 z kosztu spawania), pasek postępu ołówkiem i żółta kartka', () => {
    const k = kartkaHtml(tablica(stan()), 't_spawanie');
    expect(k).toContain(SPAWANIE);
    expect(k).toContain('class="tb-pasek"');
    expect(k).toContain(`width:${Math.round((100 * 14) / kosztTech('t_spawanie'))}%`);
  });

  it('brak wiedzy: „Ciepło 2, macie 1”, wyblakła kartka', () => {
    const k = kartkaHtml(tablica(stan()), 't_wezel');
    expect(k).toContain('Ciepło 2, macie 1');
    expect(k).toContain('brak_wiedzy');
  });

  it('najpierw: nazwy brakujących technologii', () => {
    const k = kartkaHtml(tablica(stan()), 't_ambu');
    expect(k).toContain('najpierw: Zielarstwo z działek');
  });

  it('do wzięcia: dziedzina, poziom i koszt, bez paska i bez pieczątki', () => {
    const k = kartkaHtml(tablica(stan()), 't_zielarstwo');
    expect(k).toContain('Medycyna 1 · 12');
    expect(k).not.toContain('tb-pasek');
    expect(k).not.toContain('tb-stempel');
  });

  it('odwrócone: tylko tytuł i „Do tego trzeba prądu”', () => {
    const html = tablica(stan());
    const odwrocone = TECHS.filter((t) => !t.dziala);
    expect(odwrocone.length).toBeGreaterThan(10);
    for (const t of odwrocone) {
      const k = kartkaHtml(html, t.id);
      expect(k).toContain('Do tego trzeba prądu');
      expect(k).toContain('odwrocona');
      expect(k).not.toContain('tb-pasek');
    }
  });

  it('kartka technologii z odblokowaną budowlą ma dopisek „budowla”, premia nie', () => {
    const html = tablica(stan());
    expect(kartkaHtml(html, 't_kozy')).toContain('budowla');
    expect(kartkaHtml(html, 't_wieza')).toContain('budowla');
    expect(kartkaHtml(html, 't_okna')).not.toContain('class="tb-bud"');
  });

  it('stoi: wybrane badanie bez wiedzy ma pasek i mówi, czego brakuje', () => {
    const st = stan();
    st.research!.cur = 't_wezel';
    st.research!.prog.t_wezel = 7;
    const k = kartkaHtml(tablica(st), 't_wezel');
    expect(k).toContain('data-stan="stoi"');
    expect(k).toContain('Stoi: Ciepło 2, macie 1');
    expect(k).toContain('class="tb-pasek"');
  });

  it('stoi: szczegóły mówią, że badanie stoi i czego brakuje, bez przycisku i bez czasu do końca', () => {
    const st = stan();
    st.research!.cur = 't_wezel';
    const html = tablica(st, 't_wezel');
    const sz = html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));
    expect(sz).toContain('Badanie stoi');
    expect(sz).toContain('Ciepło 2, macie 1');
    expect(sz).not.toContain('data-akcja="badaj"');
    expect(sz).not.toContain('Do końca');
    // w pasku obsady też
    expect(html.slice(html.indexOf('<footer'))).toContain(', stoi');
  });

  it('technologia końcowa jest wyróżniona: złota pinezka i dopisek „Cel”', () => {
    const html = tablica(stan());
    const k = kartkaHtml(html, 't_siec');
    expect(k).toMatch(/class="tb-kartka [^"]*\bkoncowa\b/);
    expect(k).toContain('class="tb-cel">Cel<');
    expect(ile(html, /class="tb-cel"/g)).toBe(1);
  });

  it('wybrana kartka ma zaznaczenie, reszta nie', () => {
    const html = tablica(stan(), 't_zielarstwo');
    expect(ile(html, /class="tb-kartka [^"]*\bsel\b/g)).toBe(1);
    expect(kartkaHtml(html, 't_zielarstwo')).toMatch(/\bsel\b/);
    expect(kartkaHtml(html, 't_zielarstwo')).toContain('aria-pressed="true"');
    expect(kartkaHtml(html, 't_okna')).toContain('aria-pressed="false"');
  });
});

describe('tablica badań: sznurki', () => {
  it('jeden sznurek na każdą parę wymaganie–technologia, od wymagania do kartki', () => {
    const html = tablica(stan());
    const pary = TECHS.flatMap((t) => t.req.map((r) => [r, t.id] as const));
    expect(pary.length).toBeGreaterThan(15);
    expect(ile(html, /<path class="tb-nic/g)).toBe(pary.length);
    for (const [od, do_] of pary) expect(html).toContain(`data-od="${od}" data-do="${do_}"`);
  });

  it('sznurki wybranej kartki są wyróżnione (do niej i od niej)', () => {
    const html = tablica(stan(), 't_spawanie');
    const wyroznione = [...html.matchAll(/<path class="tb-nic[^"]*\bsel\b[^"]*" data-od="(\w+)" data-do="(\w+)"/g)].map(
      (m) => `${m[1]}>${m[2]}`,
    );
    const oczekiwane = TECHS.flatMap((t) => t.req.map((r) => [r, t.id] as const))
      .filter(([r, t]) => r === 't_spawanie' || t === 't_spawanie')
      .map(([r, t]) => `${r}>${t}`);
    expect(oczekiwane.length).toBeGreaterThan(2);
    expect(wyroznione.sort()).toEqual(oczekiwane.sort());
  });

  it('sznurek idzie od prawego brzegu wymagania do lewego brzegu kartki (w kolumnie niżej: z dołu do góry)', () => {
    const poz = uklad(TECHS);
    const html = tablica(stan());
    const dla = (od: string, do_: string) => {
      const m = html.match(
        new RegExp(`<path class="tb-nic[^"]*" data-od="${od}" data-do="${do_}" d="M([\\d.]+),([\\d.]+)`),
      );
      if (!m) throw new Error(`brak sznurka ${od}>${do_}`);
      return [Number(m[1]), Number(m[2])];
    };
    // między kolumnami: z prawej krawędzi wymagania
    const [x, y] = dla('t_okna', 't_spawanie');
    const a = poz.get('t_okna')!;
    expect(x).toBe(a.x + KARTA_W);
    expect(y).toBe(a.y + KARTA_H / 2);
    // w tej samej kolumnie: ze środka dolnej krawędzi
    const [x2, y2] = dla('t_akumulatory', 't_swiatlo');
    const b = poz.get('t_akumulatory')!;
    expect(x2).toBe(b.x + KARTA_W / 2);
    expect(y2).toBe(b.y + KARTA_H);
  });
});

describe('tablica badań: szczegóły wybranej kartki', () => {
  it('bez wybranej kartki jest podpowiedź i nie ma przycisku „Badać”', () => {
    const html = tablica(stan(), null);
    expect(html).toContain('Wybierzcie kartkę');
    expect(html).not.toContain('data-akcja="badaj"');
  });

  it('kartka do wzięcia: nazwa, opis działania, wymagania, koszt i przycisk „Zmień na to badanie” przy badaniu w toku', () => {
    const html = tablica(stan(), 't_barykady');
    const szczegoly = html.slice(html.indexOf('class="tb-szczegoly'));
    expect(szczegoly).toContain('Barykady z wraków');
    expect(szczegoly).toContain(TECH_BY.t_barykady.dzialanie.pl);
    expect(szczegoly).toContain('Wieże z rusztowań');
    expect(szczegoly).toContain('Budowa 2');
    expect(szczegoly).toContain(String(Math.ceil(kosztTech('t_barykady'))));
    expect(szczegoly).toContain('data-akcja="badaj" data-arg="t_barykady"');
    expect(szczegoly).toContain('Zmień na to badanie');
    expect(szczegoly).toContain('Postęp obecnego badania zostaje');
  });

  it('bez bieżącego badania przycisk mówi „Badać”', () => {
    const st = stan();
    st.research!.cur = null;
    const html = tablica(st, 't_zielarstwo');
    expect(html).toContain('data-akcja="badaj" data-arg="t_zielarstwo"');
    expect(html).toContain('>Badać<');
    expect(html).not.toContain('Zmień na to badanie');
  });

  it('badanie w toku: bez przycisku, z napisem „Badamy to teraz”, postępem i czasem do końca', () => {
    const st = stan();
    const sim = new Sim(w, st);
    const [a] = rdzen(st);
    sim.startResearch(a, true);
    for (let k = 0; k < 2000 && !(a.job?.t === 'research' && a.job.phase === 1); k++) sim.step();
    const html = tablica(st, 't_spawanie');
    const sz = html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));
    expect(sz).not.toContain('data-akcja="badaj"');
    expect(sz).toContain('Badamy to teraz');
    expect(sz).toContain('14');
    // (koszt − 14) / (TEMPO_BAZOWE · 1,2 punktu na godzinę), w górę
    expect(sz).toContain(`ok. ${SPAWANIE_H} h gry`);
  });

  it('bez nikogo przy stole: nie liczy czasu', () => {
    const html = tablica(stan(), 't_barykady');
    expect(html).toContain('Nikt nie siedzi przy stole, więc czasu nie da się policzyć.');
  });

  it('zbadana kartka: „Zbadane”, dzień ukończenia z odkryć, bez przycisku', () => {
    const html = tablica(stan(), 't_okna');
    const sz = html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));
    expect(sz).toContain('Zbadane, dzień');
    expect(sz).not.toContain('data-akcja="badaj"');
  });

  it('brak wiedzy: „Ciepło 2, macie 1”, kto zna dziedzinę i brak przycisku', () => {
    const html = tablica(stan(), 't_wezel');
    const sz = html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));
    expect(sz).toContain('Ciepło 2, macie 1');
    expect(sz).toContain('Nikt się nie zna');
    expect(sz).not.toContain('data-akcja="badaj"');
    const st = stan();
    const kto = st.people[rdzen(st)[1].person];
    expect(sz).toContain(kto.name);
  });

  it('najpierw: wymienia wymagania, które trzeba zbadać; zbadane mają ptaszek', () => {
    const html = tablica(stan(), 't_wezel');
    const sz = html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'));
    expect(sz).toMatch(/class="tb-wym ok"[^>]*>[^<]*Kozy w mieszkaniach/);
    const html2 = tablica(stan(), 't_ambu');
    const sz2 = html2.slice(html2.indexOf('class="tb-szczegoly'), html2.indexOf('<footer'));
    expect(sz2).toContain('Najpierw zbadajcie');
    expect(sz2).toMatch(/class="tb-wym brak"[^>]*>[^<]*Zielarstwo z działek/);
    expect(sz2).not.toContain('data-akcja="badaj"');
  });

  it('odwrócona: „Do tego trzeba prądu” bez przycisku; technologia końcowa opisuje sieć i dopisuje prąd', () => {
    const html = tablica(stan(), 't_panele');
    expect(html.slice(html.indexOf('class="tb-szczegoly'), html.indexOf('<footer'))).toContain('Do tego trzeba prądu');
    const sz = tablica(stan(), 't_siec');
    const s = sz.slice(sz.indexOf('class="tb-szczegoly'), sz.indexOf('<footer'));
    expect(s).toContain('Sieć z aluminium zamiast miedzi');
    expect(s).toContain('Do tego trzeba prądu');
    expect(s).toContain('Cel');
    expect(s).not.toContain('data-akcja="badaj"');
  });

  it('w trybie zombie szczegóły sieci biorą opis dzialanieZombie', () => {
    const zwykly = tablica(stan(), 't_siec', 'zwykly');
    const zombie = tablica(stan(), 't_siec', 'zombie');
    expect(zwykly).not.toContain('jest też cicha');
    expect(zombie).toContain('jest też cicha');
  });

  it('tekst z danych jest zabezpieczony przed HTML', () => {
    const st = stan();
    st.people[rdzen(st)[1].person].name = '<b>Zły</b> & "Co"';
    const html = tablica(st, 't_wezel');
    expect(html).toContain('&lt;b&gt;Zły&lt;/b&gt; &amp; &quot;Co&quot;');
    expect(html).not.toContain('<b>Zły</b>');
  });
});

describe('tablica badań: pasek obsady i półka', () => {
  it('bez nikogo przy stole: mówi o tym i podpowiada menu pracowni', () => {
    const html = tablica(stan());
    const f = html.slice(html.indexOf('<footer'));
    expect(f).toContain('Nikt nie siedzi.');
    expect(f).toContain('Zarząd sadza się z menu pracowni.');
  });

  it('bez wybranego badania: „Żadne badanie nie jest wybrane”', () => {
    const st = stan();
    st.research!.cur = null;
    expect(tablica(st).slice(tablica(st).indexOf('<footer'))).toContain('Żadne badanie nie jest wybrane.');
  });

  it('bieżące badanie z postępem w pasku; siedzący z imieniem, zawodem i umiejętnością w dziedzinie', () => {
    const st = stan();
    const sim = new Sim(w, st);
    const [a] = rdzen(st);
    sim.startResearch(a, true);
    for (let k = 0; k < 2000 && !(a.job?.t === 'research' && a.job.phase === 1); k++) sim.step();
    const o = st.people[a.person];
    const f = tablica(st).slice(tablica(st).indexOf('<footer'));
    expect(f).toContain('Spawanie z akumulatorów');
    expect(f).toContain(SPAWANIE);
    expect(f).toContain(`koniec za ok. ${SPAWANIE_H} h gry`);
    expect(f).toContain(o.name);
    expect(f).toContain(o.prof);
    expect(f).toContain('Budowa 2');
  });

  it('półka: liczba książek w każdej z sześciu dziedzin', () => {
    const html = tablica(stan());
    const f = html.slice(html.indexOf('<footer'));
    expect(ile(f, /class="tb-ksiazki"/g)).toBe(6);
    expect(f).toMatch(/data-dom="uprawa" data-n="1"/);
    expect(f).toMatch(/data-dom="med" data-n="1"/);
    expect(f).toMatch(/data-dom="bud" data-n="0"/);
    expect(f).toContain('Półka');
    expect(f).toContain('Uprawa');
  });

  it('półka bierze dziedziny z TECH_DOMS, w jej kolejności (nowa dziedzina dostaje własną półkę bez zmian w tablicy)', () => {
    const dziedziny = (html: string) =>
      [...html.slice(html.indexOf('<footer')).matchAll(/data-dom="(\w+)"/g)].map((m) => m[1]);
    expect(dziedziny(tablica(stan()))).toEqual([...TECH_DOMS]);
    const domy = TECH_DOMS as TechDom[];
    domy.push('obrona' as TechDom);
    try {
      expect(dziedziny(tablica(stan()))).toEqual([...TECH_DOMS]);
      expect(dziedziny(tablica(stan()))).toHaveLength(7);
    } finally {
      domy.pop();
    }
  });

  it('przycisk „Wróć do gry” zamyka tablicę, nagłówek mówi, że gra stoi', () => {
    const html = tablica(stan());
    expect(html).toContain('data-akcja="zamknij"');
    expect(html).toContain('Wróć do gry');
    expect(html).toContain('Gra stoi');
    expect(html).toContain('Tablica badań');
  });
});

describe('tablica badań: angielski', () => {
  it('napisy z badania.en.ts, nazwy z src/sim/badania.en.ts i dziedziny z DOM_EN', () => {
    ustawJezyk('en');
    const st = stan();
    const html = tablica(st, 't_wezel');
    expect(html).toContain(EN.zrobione);
    expect(html).not.toContain('ZROBIONE');
    expect(html).toContain('Heating 2, you have 1');
    expect(html).toContain(EN.prad);
    expect(html).not.toContain('Do tego trzeba prądu');
    expect(html).toContain(EN.tytul);
    expect(html).toContain(EN.wroc);
    expect(html).toContain(EN.stoi);
    expect(html).toContain(EN.cel);
    expect(html).toContain(EN.polka);
    expect(html).toContain('Stoves in the flats');
    expect(html).toContain('1. First weeks');
    expect(html).toContain(`${EN.najpierw}Herbalism from the allotments`);
    expect(html).toContain(SPAWANIE);
    expect(ile(html, /class="tb-bud"/g)).toBeGreaterThan(0);
    expect(html).toContain(`class="tb-bud">${EN.budowla}<`);
    // nic po polsku z kartek i obsady
    for (const polskie of ['najpierw:', 'Wróć do gry', 'Półka', 'Gra stoi', 'Wybierzcie', 'Nikt nie siedzi'])
      expect(html).not.toContain(polskie);
  });

  it('przycisk i opisy szczegółów po angielsku', () => {
    ustawJezyk('en');
    const st = stan();
    st.research!.cur = null;
    const html = tablica(st, 't_zielarstwo');
    expect(html).toContain(`>${EN.badaj}<`);
    expect(html).toContain(TECH_BY.t_zielarstwo.dzialanie.en);
    st.research!.cur = 't_spawanie';
    expect(tablica(st, 't_zielarstwo')).toContain(EN.zmien);
  });

  it('zawód siedzącego po angielsku przez zawodEn', () => {
    ustawJezyk('en');
    const st = stan();
    const sim = new Sim(w, st);
    const [a] = rdzen(st);
    st.people[a.person].prof = 'kurier';
    sim.startResearch(a, true);
    for (let k = 0; k < 2000 && !(a.job?.t === 'research' && a.job.phase === 1); k++) sim.step();
    const f = tablica(st).slice(tablica(st).indexOf('<footer'));
    expect(f).toContain('courier');
    expect(f).not.toContain('kurier');
  });
});

describe('tablica badań: tryb gry', () => {
  it('technologia z polem `tryb` innym niż bieżący nie ma kartki ani sznurków', () => {
    const t = TECH_BY.t_okna;
    const mialo = Object.hasOwn(t, 'tryb');
    t.tryb = 'zombie';
    try {
      const st = stan();
      const b = snapshot(st, w).tablica!;
      const html = tablicaHtml(b, { wybrana: null, mode: 'zwykly' });
      expect(html).not.toContain('data-tech="t_okna"');
      expect(html).not.toContain('data-od="t_okna"');
      expect(html).not.toContain('data-do="t_okna"');
      expect(ile(html, /class="tb-kartka/g)).toBe(TECHS.length - 1);
      const zombie = tablicaHtml(b, { wybrana: null, mode: 'zombie' });
      expect(zombie).toContain('data-tech="t_okna"');
    } finally {
      if (mialo) t.tryb = undefined;
      else delete t.tryb;
    }
  });
});

describe('tablica badań: skala planszy do okna', () => {
  // plansza szerokości 1106 px (sześć er): wnętrze okna planszy na ekranach 1280, 1366 i 1440 px to 946, 1032 i 1106 px
  it('plansza, która mieści się w oknie, zostaje w skali 1 (także przy równej szerokości i na szerokim ekranie)', () => {
    expect(skalaPlanszy(1106, 1106)).toBe(1);
    expect(skalaPlanszy(1600, 1106)).toBe(1);
  });

  it('za szeroka plansza kurczy się do szerokości okna, z zaokrągleniem w dół, żeby mieściła się co do piksela', () => {
    for (const okno of [946, 1032, 1000, 1105]) {
      const k = skalaPlanszy(okno, 1106);
      expect(k).toBeLessThan(1);
      expect(k).toBeGreaterThan(0.8);
      expect(1106 * k).toBeLessThanOrEqual(okno);
      // ale nie mniejsza, niż trzeba: mniej niż promil ponad zaokrąglenie
      expect(1106 * (k + 0.001)).toBeGreaterThan(okno);
    }
    expect(skalaPlanszy(946, 1106)).toBe(0.855);
    expect(skalaPlanszy(1032, 1106)).toBe(0.933);
  });

  it('próg skali to najmniejsza czytelna czcionka: kartka o najmniejszej czcionce nie schodzi w skali poniżej 9 px', () => {
    expect(CZCIONKA_CZYTELNA).toBe(9);
    expect(CZCIONKA_KARTKI_MIN * SKALA_MIN).toBeGreaterThanOrEqual(CZCIONKA_CZYTELNA);
    // próg jest najmniejszą tysięczną, która to spełnia (nie ostrzejszy, niż trzeba)
    expect(CZCIONKA_KARTKI_MIN * (SKALA_MIN - 0.001)).toBeLessThan(CZCIONKA_CZYTELNA);
    // każda skala, jaką zwraca funkcja, daje czytelną czcionkę albo jest 1
    for (let okno = 100; okno <= 1600; okno += 7) {
      const k = skalaPlanszy(okno, 1106);
      expect(k === 1 || CZCIONKA_KARTKI_MIN * k >= CZCIONKA_CZYTELNA).toBe(true);
    }
  });

  it('plansza, która nie mieści się nawet w najmniejszej czytelnej skali, wraca do skali 1 i się przewija (tablet, telefon poziomo)', () => {
    // okna planszy przy 1024, 1180 i 844 px szerokości ekranu: 690, 846 i 510 px (szczegóły zabierają 334 px)
    for (const okno of [690, 846, 510, 300, 1]) expect(skalaPlanszy(okno, 1106), `okno ${okno} px`).toBe(1);
    // tuż nad progiem jeszcze skalowana, tuż pod nim już nie
    const prog = Math.ceil(1106 * SKALA_MIN);
    expect(skalaPlanszy(prog, 1106)).toBe(SKALA_MIN);
    expect(skalaPlanszy(prog - 1, 1106)).toBe(1);
  });

  it('CSS kartki nie ma czcionki mniejszej, niż zakłada próg (CZCIONKA_KARTKI_MIN): nazwa, dopisek, pieczątka, odznaki', () => {
    const css = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/style.css'), 'utf8');
    const rozmiar = (selektor: string): number => {
      const wiersze = css.split('\n');
      const reguła = wiersze.indexOf(selektor);
      expect(reguła, `reguła ${selektor}`).toBeGreaterThanOrEqual(0);
      const blok = wiersze.slice(reguła).join('\n');
      const m = /^[^{]*\{[^}]*?font:\s*\d+\s+([\d.]+)px/.exec(blok);
      expect(m, `font w regule ${selektor}`).not.toBeNull();
      return Number(m![1]);
    };
    const rozmiary = {
      nazwa: rozmiar('.tb-kartka {'),
      meta: rozmiar('.tb-meta {'),
      stempel: rozmiar('.tb-stempel {'),
      odznaki: rozmiar('.tb-bud,'),
    };
    for (const [co, px] of Object.entries(rozmiary)) expect(px, co).toBeGreaterThanOrEqual(CZCIONKA_KARTKI_MIN);
    // najmniejsza z nich to dokładnie przyjęta w kodzie (próg skali liczy się od niej)
    expect(Math.min(...Object.values(rozmiary))).toBe(CZCIONKA_KARTKI_MIN);
  });
});

describe('tablica badań: samo otwarcie', () => {
  const bazowo = {
    pracownia: true,
    cur: null as string | null,
    otwarta: false,
    oknoCzeka: false,
    napad: false,
    alarm: false,
    byla: false,
  };

  it('prawda tylko przy pracowni, bez wybranego badania, bez otwartej tablicy, okna, napadu i alarmu', () => {
    expect(czyOtworzycSama(bazowo)).toBe(true);
  });

  it('fałsz przy każdym z warunków', () => {
    expect(czyOtworzycSama({ ...bazowo, pracownia: false })).toBe(false);
    // wybrane badanie
    expect(czyOtworzycSama({ ...bazowo, cur: 't_spawanie' })).toBe(false);
    // już otwarta
    expect(czyOtworzycSama({ ...bazowo, otwarta: true })).toBe(false);
    // karta nocy, uchwała, wydarzenie, raport, spotkanie
    expect(czyOtworzycSama({ ...bazowo, oknoCzeka: true })).toBe(false);
    // napad i „Do broni!”
    expect(czyOtworzycSama({ ...bazowo, napad: true })).toBe(false);
    expect(czyOtworzycSama({ ...bazowo, alarm: true })).toBe(false);
    // otwierała się sama od ostatniego wyboru
    expect(czyOtworzycSama({ ...bazowo, byla: true })).toBe(false);
  });
});
