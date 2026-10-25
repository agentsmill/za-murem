/* Wiki, kategoria „Sąsiedzi i wspólny płot” (src/ui/wiki-sasiedzi.ts): pokrycie (artykuły, każdy wpis tabeli hałasu przy
   drzwiach, każdy stan drzwi), fakty równe tabelom gry (czasy pracy przy drzwiach, hałas, znani sąsiedzi, piętra, nocni goście,
   koszt wspólnego płotu), napisy z gry (polecenia menu, zdania, karta budynku), zachowania, na których stoją zdania (stan
   drzwi na start, kto otwiera po pukaniu, wybory w spotkaniu, hałas po wyważeniu, jeden plan płotu bez odwołania),
   uwaga o trybie zombie, język angielski, wariant domu i odnośniki. */

import { afterEach, describe, expect, it } from 'vitest';
import { BUDYNEK, KARTA, MENU, WYBOR, zdanie } from '../../src/content/napisy-sasiedzi.ts';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { placeOfWorld } from '../../src/gov/miejsce.ts';
import type { GovPlace } from '../../src/gov/typy.ts';
import { searchTicks } from '../../src/sim/mieszkania.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { PATCH_HP, REINFORCED_HP } from '../../src/sim/perimeter.ts';
import {
  atakOdRazu,
  drzwiBudynku,
  drzwiNaStart,
  type Gospodarstwo,
  HALAS,
  type KontekstSpotkania,
  kosztPlotu,
  LUP_MATS,
  NOC_BIORA,
  NOC_GOSC,
  NOC_GOSC_LUP,
  NOC_GOSC_ZOMBIE,
  NOC_POKOJE,
  NOC_ZOSTAJA,
  ODBIJANIE_TICKS,
  OTWIERANIE_TICKS,
  PIETRO_LUDZIE,
  PIETRO_SZWENDACZ,
  PIETRO_TICKS,
  PLOT_DESKI_DRZWI,
  PLOT_TICKS_M,
  PUKANIE_TICKS,
  poHalasie,
  szansaPrzegonienia,
  szansaWalki,
  UKRYTY_UGRYZIONY,
  WARIANTY_PLOTU,
  WYWAZ_KLATKA_TICKS,
  WYWAZ_MIESZKANIE_TICKS,
  wnetrze,
  wybory,
  ZABIJANIE_DESKI,
  ZABIJANIE_TICKS,
  ZNANI_BUDYNKI,
  ZNANI_M,
  ZOMBIE_PRZEZYLO,
  ZOMBIE_W_MIESZKANIU,
} from '../../src/sim/sasiedzi.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { NAPISY as SUROWCE } from '../../src/sim/surowce.ts';
import { artykul, maArtykul, rejestr, szukaj, tytulArtykulu, wikiCtx } from '../../src/ui/wiki.ts';
import { PRZYKLAD_PLOTU, STANY_DRZWI, sasiedziWDomach } from '../../src/ui/wiki-sasiedzi.ts';
import { czasTickow, proc } from '../../src/ui/wiki-slowa.ts';
import { matNazwa } from '../../src/ui/wiki-zasoby.ts';
import { IN } from '../../src/world/interior.ts';
import { PLOT_MAX } from '../../src/world/plot.ts';
import { core, demoWorld, newGame } from './sasiedzi-pomoc.ts';
import { kontrolaOdnosnikow, kontrolaTresci } from './wiki-kontrola.ts';
import { kontekst, miejsce, PRZYPADKI, tekstArtykulu } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const moje = rejestr().filter((d) => d.kat === 'sasiedzi');
const NB = ' ';
const m = (v: number) => `${String(v).replace('.', ',')}${NB}m`;

/** wartość faktu artykułu (blok, mysz, zwykła gra) w bieżącym języku */
const fakt = (id: string, f: string, zombie = false): string | undefined =>
  artykul(id, kontekst('blok', false, zombie))!.fakty.find((x) => x.id === f)?.v;

describe('pokrycie', () => {
  it('artykuły kategorii', () => {
    expect(moje.map((d) => d.id).sort()).toEqual(
      [
        'sasiedzi:budynki',
        'sasiedzi:drzwi',
        'sasiedzi:pukanie',
        'sasiedzi:wywazanie',
        'sasiedzi:przeszukiwanie',
        'sasiedzi:lokatorzy',
        'sasiedzi:plot',
        'sasiedzi:teren',
        'sasiedzi:noc',
      ].sort(),
    );
    for (const id of ['sasiedzi:plot', 'sasiedzi:budynki']) expect(maArtykul(id), id).toBe(true);
  });

  it('każdy wpis tabeli hałasu przy drzwiach (HALAS) jest w jakimś artykule', () => {
    const wszystkie = moje.flatMap((d) => artykul(d.id, kontekst('blok'))!.fakty.map((f) => f.v));
    for (const [klucz, v] of Object.entries(HALAS)) expect(wszystkie, klucz).toContain(m(v));
  });

  it('wymienione są wszystkie stany drzwi z karty budynku', () => {
    const karta = tr(BUDYNEK.drzwi({ zamkniete: 1, na_klucz: 1, otwarte: 1, wywazone: 1, zabite: 1 }));
    expect(STANY_DRZWI.map(([k]) => k)).toEqual(['zamkniete', 'na_klucz', 'otwarte', 'wywazone', 'zabite']);
    for (const [, pl] of STANY_DRZWI) expect(karta, pl).toContain(pl);
    expect(fakt('sasiedzi:budynki', 'stany')).toBe(STANY_DRZWI.map(([, pl]) => pl).join(', '));
    ustawJezyk('en');
    const kartaEn = tr(BUDYNEK.drzwi({ zamkniete: 1, na_klucz: 1, otwarte: 1, wywazone: 1, zabite: 1 }));
    for (const [, , en] of STANY_DRZWI) expect(kartaEn, en).toContain(en);
  });
});

describe('fakty zgodne z tabelami gry', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`czasy, hałas, znani, piętra, nocni goście, płot: ${lang}`, () => {
      ustawJezyk(lang);
      expect(fakt('sasiedzi:budynki', 'znani')).toContain(`${ZNANI_BUDYNKI}`);
      expect(fakt('sasiedzi:budynki', 'promien')).toBe(m(ZNANI_M));

      expect(fakt('sasiedzi:drzwi', 'otwieranie')).toBe(czasTickow(OTWIERANIE_TICKS));
      expect(fakt('sasiedzi:drzwi', 'otwieranie-halas')).toBe(m(HALAS.otwieranie));
      expect(fakt('sasiedzi:drzwi', 'zabijanie')).toBe(czasTickow(ZABIJANIE_TICKS));
      expect(fakt('sasiedzi:drzwi', 'zabijanie-deski')).toContain(`${ZABIJANIE_DESKI}`);
      expect(fakt('sasiedzi:drzwi', 'zabijanie-halas')).toBe(m(HALAS.deski));
      expect(fakt('sasiedzi:drzwi', 'odbijanie')).toBe(czasTickow(ODBIJANIE_TICKS));
      expect(fakt('sasiedzi:drzwi', 'odbijanie-halas')).toBe(m(HALAS.odbijanie));

      expect(fakt('sasiedzi:pukanie', 'czas')).toBe(czasTickow(PUKANIE_TICKS));
      expect(fakt('sasiedzi:pukanie', 'halas')).toBe(m(HALAS.pukanie));

      expect(fakt('sasiedzi:wywazanie', 'czas-budynek')).toBe(czasTickow(WYWAZ_KLATKA_TICKS));
      expect(fakt('sasiedzi:wywazanie', 'czas-mieszkanie')).toBe(czasTickow(WYWAZ_MIESZKANIE_TICKS));
      expect(fakt('sasiedzi:wywazanie', 'halas-budynek')).toBe(m(HALAS.wywazanie));
      expect(fakt('sasiedzi:wywazanie', 'halas-budynek-lom')).toBe(m(HALAS.wywazanieLom));
      expect(fakt('sasiedzi:wywazanie', 'halas-mieszkanie')).toBe(m(HALAS.mieszkanie));
      expect(fakt('sasiedzi:wywazanie', 'halas-mieszkanie-lom')).toBe(m(HALAS.mieszkanieLom));

      expect(fakt('sasiedzi:przeszukiwanie', 'czas-min')).toBe(czasTickow(searchTicks(0)));
      expect(fakt('sasiedzi:przeszukiwanie', 'czas-max')).toBe(czasTickow(searchTicks(1e6)));
      expect(fakt('sasiedzi:przeszukiwanie', 'pietro')).toBe(czasTickow(PIETRO_TICKS));
      expect(fakt('sasiedzi:przeszukiwanie', 'pietro-lokatorzy')).toBe(proc(PIETRO_LUDZIE));
      expect(fakt('sasiedzi:przeszukiwanie', 'pietro-szwendacz')).toBe(proc(PIETRO_SZWENDACZ));
      expect(fakt('sasiedzi:przeszukiwanie', 'lup')).toBe([...LUP_MATS].map((x) => matNazwa(x as never)).join(', '));

      expect(fakt('sasiedzi:lokatorzy', 'walka-0')).toBe(proc(szansaWalki(0)));
      expect(fakt('sasiedzi:lokatorzy', 'walka-1')).toBe(proc(szansaWalki(1)));
      expect(fakt('sasiedzi:lokatorzy', 'walka-2')).toBe(proc(szansaWalki(2)));
      expect(fakt('sasiedzi:lokatorzy', 'przegonienie-0')).toBe(proc(szansaPrzegonienia(0)));
      expect(fakt('sasiedzi:lokatorzy', 'przegonienie-1')).toBe(proc(szansaPrzegonienia(1)));
      expect(fakt('sasiedzi:lokatorzy', 'przegonienie-2')).toBe(proc(szansaPrzegonienia(2)));

      expect(fakt('sasiedzi:plot', 'max')).toBe(m(PLOT_MAX));
      expect(fakt('sasiedzi:plot', 'praca-metr')).toBe(czasTickow(PLOT_TICKS_M));
      expect(fakt('sasiedzi:plot', 'praca-drzwi')).toBe(czasTickow(ZABIJANIE_TICKS));
      expect(fakt('sasiedzi:plot', 'deski-drzwi')).toBe(`${PLOT_DESKI_DRZWI}`);
      for (const v of WARIANTY_PLOTU) {
        const k = kosztPlotu(PRZYKLAD_PLOTU, v);
        const tekst = fakt('sasiedzi:plot', `przyklad-${v}`)!;
        expect(tekst, v).toContain(czasTickow(k.total));
        for (const [mat, n] of Object.entries(k.need))
          expect(tekst, `${v} ${mat}`).toContain(`${matNazwa(mat as never)} ${n}`);
      }

      expect(fakt('sasiedzi:teren', 'lata')).toBe(`${PATCH_HP}`);
      expect(fakt('sasiedzi:teren', 'wzmocniony')).toBe(`${REINFORCED_HP}`);

      expect(fakt('sasiedzi:noc', 'szansa')).toBe(proc(NOC_GOSC));
      expect(fakt('sasiedzi:noc', 'szansa-lup')).toBe(proc(NOC_GOSC_LUP));
      expect(fakt('sasiedzi:noc', 'szansa-zombie')).toBe(proc(NOC_GOSC_ZOMBIE));
      expect(fakt('sasiedzi:noc', 'bio')).toBe(`${NOC_BIORA}`);
      expect(fakt('sasiedzi:noc', 'pokoje')).toBe(`${NOC_POKOJE}`);
      expect(fakt('sasiedzi:noc', 'zostaja')).toBe(proc(NOC_ZOSTAJA));
    });

  it('koszt płotu w przykładzie: deska i złom na metr, same deski albo sam złom po dwa, po dwie deski na drzwi', () => {
    const mieszany = kosztPlotu(PRZYKLAD_PLOTU, 'mieszany').need;
    const deski = kosztPlotu(PRZYKLAD_PLOTU, 'deski').need;
    const zlom = kosztPlotu(PRZYKLAD_PLOTU, 'zlom').need;
    const m10 = PRZYKLAD_PLOTU.dlugosc;
    const drzwi = PLOT_DESKI_DRZWI * PRZYKLAD_PLOTU.zabic.length;
    expect(mieszany).toEqual({ deski: m10 + drzwi, zlom: m10 });
    expect(deski).toEqual({ deski: 2 * m10 + drzwi });
    expect(zlom).toEqual({ zlom: 2 * m10, deski: drzwi });
    // 3 minuty pracy na metr i 20 minut na drzwi do zabicia
    expect(kosztPlotu(PRZYKLAD_PLOTU).total).toBe(m10 * PLOT_TICKS_M + PRZYKLAD_PLOTU.zabic.length * ZABIJANIE_TICKS);
  });
});

describe('napisy z gry', () => {
  it('polecenia i zdania cytowane w artykułach', () => {
    expect(MENU.pietro(2).pl).toMatch(/^Przeszukać piętro/);
    expect(MENU.pietro(2).en).toMatch(/^Search a floor upstairs/);
    expect(MENU.przeszukaj('kuchnia').pl).toMatch(/^Przeszukać /);
    expect(MENU.przeszukaj('kuchnia').en).toMatch(/^Search the /);
    expect(MENU.plot(10, 12, 10, 1, 'mieszany').pl).toMatch(/^Otoczyć wspólnym płotem/);
    expect(MENU.plot(10, 12, 10, 1, 'mieszany').en).toMatch(/^Put up a shared fence/);
    expect(SUROWCE.zaniesc.pl).toBe('Zanieść na podwórko');
    expect(SUROWCE.zaniesc.en).toBe('Carry into the yard');
    expect(zdanie('na_klucz', {}).pl).toBe('Zamknięte na klucz. Można zapukać albo wyważyć.');
    const pl = tekstArtykulu(artykul('sasiedzi:drzwi', kontekst('blok'))!);
    expect(pl).toContain('„Zamknięte na klucz. Można zapukać albo wyważyć.”');
    expect(tekstArtykulu(artykul('sasiedzi:teren', kontekst('blok'))!)).toContain(tr(BUDYNEK.otoczony));
    expect(tekstArtykulu(artykul('sasiedzi:noc', kontekst('blok'))!)).toContain(tr(KARTA.szabrownicy));
  });

  it('karta „Sąsiedzi” i wybory w spotkaniu', () => {
    expect(KARTA.naglowek.pl).toBe('Sąsiedzi');
    const pl = tekstArtykulu(artykul('sasiedzi:lokatorzy', kontekst('blok'))!);
    for (const w of [WYBOR.rozmowa(), WYBOR.odejscie()]) expect(pl).toContain(`„${w.pl}”`);
    for (const s of ['Zaprosić do nas', 'Zabrać im zapasy', 'Dać jedzenie (2 porcje)']) expect(pl).toContain(`„${s}”`);
    expect(WYBOR.zaproszenie('45%').pl).toMatch(/^Zaprosić do nas \(/);
    expect(WYBOR.zabranie('45%').pl).toMatch(/^Zabrać im zapasy \(/);
  });

  it('menu przy drzwiach i płocie jest w kodzie gry, a przycisk „Wejść” nie jest cytowany', () => {
    expect(MENU.otworz.pl).toBe('Otworzyć drzwi');
    expect(MENU.zapukaj.pl).toBe('Zapukać');
    expect(MENU.wywaz.pl).toBe('Wyważyć drzwi');
    expect(MENU.zabij.pl).toBe('Zabić drzwi deskami');
    expect(MENU.plotNie('jezdnia').pl).toBe('Wspólny płot: między wami jest jezdnia');
    expect(MENU.plotDalej.pl).toBe('Budować wspólny płot dalej');
    expect(BUDYNEK.jak(false).pl).toBe(
      'Prawy przycisk na drzwiach: Otworzyć, Zapukać albo Wyważyć. W środku na pomieszczeniu: Przeszukać.',
    );
  });
});

describe('zachowania, na których stoją artykuły', () => {
  const w = demoWorld('przymorze');
  const kafelki = Array.from({ length: 400 }, (_, i) => 1000 + 7 * i);
  const stany = (mode: 'zwykly' | 'zombie', ctx: { ludzie: boolean; odUlicy: boolean }) =>
    kafelki.map((t) => drzwiNaStart(w, mode, 12, t, ctx));
  const udzial = (lista: ReturnType<typeof stany>, f: (d: ReturnType<typeof stany>[number]) => boolean) =>
    lista.filter(f).length / lista.length;
  const naKlucz = (d: { s: string; k?: true }) => d.s === 'zamkniete' && d.k === true;

  it('stan drzwi na start: zamieszkane na klucz (zombie zawsze), puste częściowo wyważone, od ulicy zawsze na klucz', () => {
    const zwykleLudzie = stany('zwykly', { ludzie: true, odUlicy: false });
    expect(udzial(zwykleLudzie, naKlucz)).toBeGreaterThan(0.5);
    expect(udzial(zwykleLudzie, naKlucz)).toBeLessThan(0.9);
    expect(udzial(stany('zombie', { ludzie: true, odUlicy: false }), naKlucz)).toBe(1);
    const puste = stany('zwykly', { ludzie: false, odUlicy: false });
    const pusteZombie = stany('zombie', { ludzie: false, odUlicy: false });
    expect(udzial(puste, (d) => d.s === 'wywazone')).toBeGreaterThan(0.1);
    expect(udzial(pusteZombie, (d) => d.s === 'wywazone')).toBeGreaterThan(udzial(puste, (d) => d.s === 'wywazone'));
    expect(udzial(stany('zwykly', { ludzie: false, odUlicy: true }), naKlucz)).toBe(1);
    expect(udzial(stany('zombie', { ludzie: false, odUlicy: true }), naKlucz)).toBe(1);
  });

  const gospodarstwo = (over: Partial<Gospodarstwo> = {}): Gospodarstwo => ({
    osoby: [],
    apt: 0,
    klatka: 0,
    znani: false,
    zamiar: 'nieufni',
    nastroj: 'spokoj',
    rel: 0,
    zapasy: {},
    gdzie: 'u_siebie',
    ...over,
  });
  const ctx: KontekstSpotkania = { jedzenie: 5, uzbrojeni: 0, mode: 'zwykly', mowca: null };
  const klucze = (g: Gospodarstwo, c = ctx) => wybory({ atak: false }, g, c).map((x) => x.k);

  it('spotkanie: zaproszenie od dobrej relacji albo dla życzliwych i zdesperowanych, jedzenie od dwóch porcji', () => {
    expect(klucze(gospodarstwo())).toEqual(['rozmowa', 'jedzenie', 'zabranie', 'odejscie']);
    expect(klucze(gospodarstwo({ rel: 20 }))).toContain('zaproszenie');
    expect(klucze(gospodarstwo({ zamiar: 'zyczliwi' }))).toContain('zaproszenie');
    expect(klucze(gospodarstwo({ zamiar: 'zdesperowani' }))).toContain('zaproszenie');
    expect(klucze(gospodarstwo({ zamiar: 'wrodzy' }))).not.toContain('zaproszenie');
    const jedz = (j: number) =>
      wybory({ atak: false }, gospodarstwo(), { ...ctx, jedzenie: j }).find((x) => x.k === 'jedzenie')!;
    expect(jedz(2).ok).toBe(true);
    expect(jedz(1).ok).toBe(false);
  });

  it('spotkanie w trybie zombie: pytanie o rękę tylko przy ukrytym ugryzieniu, raz', () => {
    const z: KontekstSpotkania = { ...ctx, mode: 'zombie' };
    expect(klucze(gospodarstwo(), z)).not.toContain('reka');
    expect(klucze(gospodarstwo({ ugryziony: 0 }), z)).toContain('reka');
    expect(klucze(gospodarstwo({ ugryziony: 0, pytali: true }), z)).not.toContain('reka');
    expect(UKRYTY_UGRYZIONY).toBeGreaterThan(0);
  });

  it('spotkanie pod atakiem: obrona, uspokojenie, ucieczka; z szabrownikami: przegonić, rozmowa, odejście', () => {
    expect(wybory({ atak: true }, gospodarstwo(), ctx).map((x) => x.k)).toEqual(['obrona', 'uspokojenie', 'ucieczka']);
    expect(wybory({ atak: false }, gospodarstwo({ szabrownicy: true }), ctx).map((x) => x.k)).toEqual([
      'przegonic',
      'rozmowa',
      'odejscie',
    ]);
  });

  it('szarpanina: szansa rośnie z uzbrojonymi, ale najwyżej dla dwóch', () => {
    expect(szansaWalki(1)).toBeGreaterThan(szansaWalki(0));
    expect(szansaWalki(2)).toBeGreaterThan(szansaWalki(1));
    expect(szansaWalki(5)).toBe(szansaWalki(2));
    expect(szansaPrzegonienia(2)).toBeGreaterThan(szansaPrzegonienia(0));
  });

  it('po wyważeniu: stosunek spada, nocą strach albo gniew, wrodzy atakują od razu', () => {
    const g = gospodarstwo({ rel: 30 });
    expect(poHalasie(g, false).rel).toBe(10);
    expect(poHalasie(g, true).nastroj).toBe('strach');
    expect(poHalasie(gospodarstwo({ zamiar: 'wrodzy' }), false).nastroj).toBe('gniew');
    expect(atakOdRazu(gospodarstwo({ zamiar: 'wrodzy' }), true, false)).toBe(true);
    expect(atakOdRazu(gospodarstwo({ zamiar: 'nieufni' }), true, false)).toBe(false);
  });

  it('tryb zombie: przeżywa mniej gospodarstw niż pustych mieszkań, nocą wchodzą szwendacze', () => {
    expect(ZOMBIE_PRZEZYLO).toBeLessThan(1);
    expect(ZOMBIE_W_MIESZKANIU).toBeGreaterThan(0);
    expect(NOC_GOSC_ZOMBIE).toBeGreaterThan(NOC_GOSC);
    expect(NOC_GOSC_LUP).toBeGreaterThan(NOC_GOSC);
  });

  it('wspólny płot: jeden plan naraz, bez odwołania; na tym samym budynku „Budować wspólny płot dalej”', () => {
    const lanciego = demoWorld('lanciego');
    const sim = new Sim(lanciego, createSim(lanciego, 5, { core: 4 }));
    const p = sim.st.pawns.find((q) => q.kind === 'core')!;
    p.weapon = 'lom';
    const wybrane = lanciego.buildings.filter((b) => b.name === 'Blok nr 10F' || b.name === 'Blok nr 10H');
    expect(wybrane.length).toBe(2);
    const [pierwszy, drugi] = wybrane;
    const podkarm = () => Object.assign(p.needs!, { food: 100, warm: 100, rest: 100, health: 100 });
    const otwarty = (bid: number) => sim.st.sasiedzi?.budynki.find((b) => b.bid === bid)?.otwarty === true;
    const hour = () => Math.floor((sim.st.tick % 19200) / 800);
    // za dnia: otwiera klamką, potem łomem
    for (let n = 0; n < 60_000 && !otwarty(pierwszy.id); n++) {
      if (n % 20 === 0 && hour() >= 7 && hour() < 17 && p.job === null && !sim.st.cmds.length) {
        podkarm();
        sim.push({ t: n < 2000 ? 'open' : 'force', ids: [p.id], door: pierwszy.entrances[0].tile });
      }
      sim.step();
    }
    expect(otwarty(pierwszy.id)).toBe(true);
    sim.push({ t: 'enclose', ids: [p.id], bid: pierwszy.id });
    sim.step();
    const plan = sim.st.plot?.plan;
    expect(plan?.bid).toBe(pierwszy.id);

    // jedyne polecenie przy tym budynku to „Budować dalej”, przy innym budynku płotu nie ma
    const polecenia = (bid: number) =>
      commandsAt(sim.st, lanciego, [p.id], lanciego.buildings[bid].entrances[0].tile).filter(
        (x) => x.cmd.t === 'enclose',
      );
    expect(polecenia(pierwszy.id).map((x) => x.label)).toEqual([MENU.plotDalej.pl]);
    expect(polecenia(drugi.id)).toEqual([]);

    // żadne polecenie nie zdejmuje planu: odwołanie budowy ani kilka godzin gry
    sim.push({ t: 'unbuild', ids: [], id: pierwszy.id });
    sim.push({ t: 'unbuild', ids: [], id: plan!.bid });
    for (let n = 0; n < 200; n++) sim.step();
    expect(sim.st.plot?.plan?.bid).toBe(pierwszy.id);
  });

  it('gra bez własnych drzwi: nowa gra nie ma planu płotu ani otoczonych budynków', () => {
    const sim = newGame('lanciego');
    expect(sim.st.plot?.plan).toBeUndefined();
    expect(sim.st.plot?.bids ?? []).toEqual([]);
  });
});

describe('język i słownik miejsca', () => {
  for (const p of PRZYPADKI) it(`artykuły o sąsiadach: ${p.opis}`, () => kontrolaTresci(p, 'sasiedzi', ['Za Murem']));

  it('uwaga o trybie zombie jest przy artykułach, w których tryb coś zmienia', () => {
    for (const id of [
      'sasiedzi:budynki',
      'sasiedzi:pukanie',
      'sasiedzi:wywazanie',
      'sasiedzi:przeszukiwanie',
      'sasiedzi:lokatorzy',
      'sasiedzi:noc',
    ]) {
      const zw = artykul(id, kontekst('blok', false, false))!;
      const zo = artykul(id, kontekst('blok', false, true))!;
      expect(zw.uwaga, id).toMatch(/^W trybie zombie /);
      expect(zo.uwaga, id).toMatch(/^Grasz w trybie zombie: /);
    }
    for (const id of ['sasiedzi:drzwi', 'sasiedzi:plot', 'sasiedzi:teren'])
      expect(artykul(id, kontekst('blok'))!.uwaga, id).toBeUndefined();
    ustawJezyk('en');
    expect(artykul('sasiedzi:noc', kontekst('blok'))!.uwaga).toMatch(/^In Zombie mode /);
    expect(artykul('sasiedzi:noc', kontekst('blok', false, true))!.uwaga).toMatch(/^You are playing Zombie mode: /);
  });

  it('dom mówi „komitet”, blok „zarząd” (wolni ludzie przy planie płotu)', () => {
    expect(tekstArtykulu(artykul('sasiedzi:plot', kontekst('dom'))!)).toContain('z komitetu');
    expect(tekstArtykulu(artykul('sasiedzi:plot', kontekst('blok'))!)).toContain('z zarządu');
  });

  it('tytuły po polsku i angielsku', () => {
    const c = kontekst('blok');
    expect(tytulArtykulu('sasiedzi:plot', c)).toBe('Wspólny płot');
    expect(tytulArtykulu('sasiedzi:teren', c)).toBe('Przyłączony teren');
    ustawJezyk('en');
    expect(tytulArtykulu('sasiedzi:plot', c)).toBe('The shared fence');
    expect(tytulArtykulu('sasiedzi:teren', c)).toBe('Joined ground');
  });
});

describe('sąsiedzi w domach i w blokach', () => {
  /** miejsce siedziby z zadanym rodzajem i zadanymi sąsiadami (reszta z prawdziwego dema tego rodzaju) */
  const miejsceZ = (kind: 'dom' | 'blok', near: GovPlace['near']): GovPlace => ({ ...miejsce(kind), kind, near });
  const ctx = (kind: 'dom' | 'blok', near: GovPlace['near'], zombie = false) =>
    wikiCtx(miejsceZ(kind, near), false, zombie);
  const art = (id: string, kind: 'dom' | 'blok', near: GovPlace['near'], zombie = false) =>
    artykul(id, ctx(kind, near, zombie))!;
  const ids = (id: string, kind: 'dom' | 'blok', near: GovPlace['near']): string[] =>
    art(id, kind, near).fakty.map((f) => f.id);
  /** słowa o mieszkaniach, piętrach, klatkach i lokatorach (po polsku i po angielsku), których sąsiedzi w domach nie mają;
      polskie „lokatorzy” sprawdza osobny test (cytat z gry „To nie lokatorzy.” zostaje w obu wariantach) */
  const BLOKOWE_SASIEDZI =
    /mieszkani|mieszkań|piętr|klatk|\bflats?\b|\bresidents?\b|stairwell|storey|upstairs|\bstairs\b|\bfloors?\b/i;
  const SASIEDZI = moje.map((d) => d.id);

  it('sąsiedzi stoją w domach, gdy tak mówi okolica, a w samotnym miejscu gdy siedziba jest domem', () => {
    const tabela: [GovPlace['kind'], GovPlace['near'], boolean][] = [
      ['dom', 'domy', true],
      ['blok', 'domy', true],
      ['dom', 'bloki', false],
      ['blok', 'bloki', false],
      ['dom', 'nikt', true],
      ['blok', 'nikt', false],
    ];
    for (const [kind, near, domy] of tabela) expect(sasiedziWDomach(ctx(kind, near)), `${kind} / ${near}`).toBe(domy);
    // prawdziwe dema: Zielonki to dom wśród domów, Przymorze blok wśród bloków
    const zielonki = placeOfWorld(demoWorld('zielonki'));
    const przymorze = placeOfWorld(demoWorld('przymorze'));
    expect([zielonki.kind, zielonki.near]).toEqual(['dom', 'domy']);
    expect([przymorze.kind, przymorze.near]).toEqual(['blok', 'bloki']);
    expect(sasiedziWDomach(kontekst('dom'))).toBe(true);
    expect(sasiedziWDomach(kontekst('blok'))).toBe(false);
  });

  it('w świecie domów nie ma drzwi mieszkań, klatek, schodów ani pięter, a w bloku są', () => {
    const w = demoWorld('zielonki');
    const domy = w.buildings.filter((b) => b.cls === 'dom' && b.id !== w.hq && b.entrances.length);
    expect(domy.length).toBeGreaterThan(5);
    const pokoje = new Set<string>();
    for (const b of domy) {
      const it = wnetrze(w, b.id);
      expect(drzwiBudynku(w, b.id).mieszkan.size, `dom ${b.id}: drzwi mieszkań`).toBe(0);
      expect(
        it.cell.some((c) => c === IN.STAIRS),
        `dom ${b.id}: schody`,
      ).toBe(false);
      for (const r of it.rooms) pokoje.add(r.kind);
    }
    expect([...pokoje].sort()).toEqual(['kuchnia', 'lazienka', 'pokoj', 'przedpokoj']);
    const blokowy = demoWorld('przymorze');
    const bloki = blokowy.buildings.filter((b) => b.cls === 'blok' && b.id !== blokowy.hq && b.entrances.length);
    expect(bloki.some((b) => drzwiBudynku(blokowy, b.id).mieszkan.size > 0)).toBe(true);
    expect(bloki.some((b) => wnetrze(blokowy, b.id).cell.some((c) => c === IN.STAIRS))).toBe(true);
    expect(bloki.some((b) => wnetrze(blokowy, b.id).rooms.some((r) => r.kind === 'klatka'))).toBe(true);
  });

  it('menu przy drzwiach domu sąsiada nie ma poleceń o mieszkaniu', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const sim = newGame('zielonki');
      const w = demoWorld('zielonki');
      const dom = w.buildings.find((b) => b.cls === 'dom' && b.id !== w.hq && b.entrances.length)!;
      const menu = commandsAt(sim.st, w, [core(sim)[0].id], dom.entrances[0].tile).map((x) => x.label);
      const dwa = (t: { pl: string; en: string }) => t[lang];
      expect(
        menu.some((l) => l.startsWith(dwa(MENU.otworz))),
        lang,
      ).toBe(true);
      expect(
        menu.some((l) => l.startsWith(dwa(MENU.wywaz))),
        lang,
      ).toBe(true);
      for (const l of menu) {
        expect(l, lang).not.toContain(dwa(MENU.otworzMieszkanie));
        expect(l, lang).not.toContain(dwa(MENU.zapukajMieszkanie));
        expect(l, lang).not.toContain(dwa(MENU.wywazMieszkanie));
      }
    }
  });

  for (const lang of ['pl', 'en'] as const)
    for (const zombie of [false, true])
      it(`dom wśród domów: artykuły o sąsiadach i hałasie bez mieszkań, pięter i lokatorów: ${lang}, ${zombie ? 'zombie' : 'zwykła gra'}`, () => {
        ustawJezyk(lang);
        for (const id of [...SASIEDZI, 'zombie:halas']) {
          const a = art(id, 'dom', 'domy', zombie);
          expect(tekstArtykulu(a), `${id} ${lang}`).not.toMatch(BLOKOWE_SASIEDZI);
        }
      });

  it('dom wśród domów: brak faktów o drzwiach mieszkania i piętrach, krótsze kroki „Jak to zrobić”', () => {
    expect(ids('sasiedzi:wywazanie', 'dom', 'domy')).toEqual(['czas-budynek', 'halas-budynek', 'halas-budynek-lom']);
    expect(ids('sasiedzi:przeszukiwanie', 'dom', 'domy')).toEqual(['czas-min', 'czas-max', 'lup']);
    expect(ids('sasiedzi:przeszukiwanie', 'dom', 'domy')).not.toContain('pietro');
    expect(art('sasiedzi:przeszukiwanie', 'dom', 'domy').jak).toHaveLength(2);
    expect(art('sasiedzi:przeszukiwanie', 'blok', 'bloki').jak).toHaveLength(3);
    expect(art('sasiedzi:pukanie', 'dom', 'domy').jak).toHaveLength(1);
    expect(art('sasiedzi:pukanie', 'blok', 'bloki').jak).toHaveLength(2);
    // reszta faktów (czasy, hałas przy drzwiach budynku) zostaje taka sama jak w bloku
    for (const id of ['czas-budynek', 'halas-budynek', 'halas-budynek-lom'])
      expect(art('sasiedzi:wywazanie', 'dom', 'domy').fakty.find((f) => f.id === id)?.v).toBe(
        art('sasiedzi:wywazanie', 'blok', 'bloki').fakty.find((f) => f.id === id)?.v,
      );
    // liczby w zdaniach domu to te same liczby z tabel gry
    const t = tekstArtykulu(art('sasiedzi:wywazanie', 'dom', 'domy'));
    expect(t).toContain(czasTickow(WYWAZ_KLATKA_TICKS));
    expect(t).toContain(m(HALAS.wywazanie));
    expect(t).toContain(m(HALAS.wywazanieLom));
    expect(t).not.toContain(m(HALAS.mieszkanie));
    expect(tekstArtykulu(art('sasiedzi:przeszukiwanie', 'dom', 'domy'))).not.toContain(czasTickow(PIETRO_TICKS));
  });

  it('dom wśród domów: o szabrze w domu mówi polecenie „Okraść …”, a gra zaczyna je od tego samego słowa', () => {
    expect(MENU.okradnij.pl.startsWith('Okraść ')).toBe(true);
    expect(MENU.okradnij.en.startsWith('Rob ')).toBe(true);
    expect(tekstArtykulu(art('sasiedzi:przeszukiwanie', 'dom', 'domy'))).toContain('„Okraść …”');
    ustawJezyk('en');
    expect(tekstArtykulu(art('sasiedzi:przeszukiwanie', 'dom', 'domy'))).toContain('“Rob …”');
    // w bloku napis z gry w całości
    expect(tekstArtykulu(art('sasiedzi:przeszukiwanie', 'blok', 'bloki'))).toContain(`“${MENU.okradnij.en}”`);
  });

  it('dom wśród domów: ludzie za drzwiami to sąsiedzi (tytuł i zdania), w bloku lokatorzy', () => {
    expect(art('sasiedzi:lokatorzy', 'dom', 'domy').tytul).toBe('Sąsiedzi za drzwiami');
    expect(art('sasiedzi:lokatorzy', 'blok', 'bloki').tytul).toBe('Lokatorzy za drzwiami');
    expect(art('sasiedzi:lokatorzy', 'dom', 'domy').zdania[0]).toContain('Gdy sąsiedzi otworzą drzwi');
    expect(art('sasiedzi:lokatorzy', 'blok', 'bloki').zdania[0]).toContain('Gdy lokatorzy otworzą drzwi');
    // szukanie po „sąsiedzi” i po „lokatorzy” znajduje ten sam artykuł
    expect(szukaj('lokatorzy', kontekst('dom')).map((x) => x.id)).toContain('sasiedzi:lokatorzy');
    expect(szukaj('sąsiedzi za drzwiami', kontekst('dom'))[0].id).toBe('sasiedzi:lokatorzy');
    ustawJezyk('en');
    expect(art('sasiedzi:lokatorzy', 'dom', 'domy').zdania[0]).toContain('When the neighbours open the door');
    expect(art('sasiedzi:lokatorzy', 'blok', 'bloki').zdania[0]).toContain('When the residents open the door');
  });

  it('dom wśród domów: nocni goście, gra po angielsku mówi o „residents”, więc wiki opisuje to własnymi słowami', () => {
    ustawJezyk('en');
    const dom = tekstArtykulu(art('sasiedzi:noc', 'dom', 'domy'));
    expect(dom).toContain('looters who have been there since last night');
    expect(dom).not.toContain(KARTA.szabrownicy.en);
    expect(tekstArtykulu(art('sasiedzi:noc', 'blok', 'bloki'))).toContain(KARTA.szabrownicy.en);
    // po polsku zdanie gry nie ma słów z bloku, więc zostaje w cytacie w obu wariantach
    ustawJezyk('pl');
    expect(tekstArtykulu(art('sasiedzi:noc', 'dom', 'domy'))).toContain(KARTA.szabrownicy.pl);
    expect(KARTA.szabrownicy.pl).not.toMatch(BLOKOWE_SASIEDZI);
  });

  it('dom wśród domów w trybie zombie: gospodarstwa to domy, a szwendacz czeka za drzwiami domu', () => {
    ustawJezyk('pl');
    expect(art('sasiedzi:budynki', 'dom', 'domy', true).uwaga).toContain('reszta domów stoi pusta');
    expect(art('sasiedzi:budynki', 'blok', 'bloki', true).uwaga).toContain('reszta mieszkań stoi pusta');
    expect(art('sasiedzi:pukanie', 'dom', 'domy', true).uwaga).toContain('przy domu ze szwendaczem');
    expect(art('sasiedzi:pukanie', 'blok', 'bloki', true).uwaga).toContain('przy mieszkaniu ze szwendaczem');
    expect(art('sasiedzi:wywazanie', 'dom', 'domy', true).uwaga).toContain('za drzwiami domu');
    expect(art('sasiedzi:przeszukiwanie', 'dom', 'domy', true).uwaga).toBe(
      'Grasz w trybie zombie: w pustych domach po wymarciu jest dwa razy więcej jedzenia.',
    );
    expect(art('sasiedzi:budynki', 'dom', 'domy', true).uwaga).toContain(proc(ZOMBIE_W_MIESZKANIU));
  });

  it('dom wśród bloków ma słowa bloku, a blok wśród domów słowa domu tylko o sąsiadach (słownik siedziby zostaje)', () => {
    // dom wśród bloków: sąsiedzi są w blokach, więc mieszkania, piętra i drzwi mieszkań jak w bloku
    expect(ids('sasiedzi:wywazanie', 'dom', 'bloki')).toContain('czas-mieszkanie');
    expect(ids('sasiedzi:przeszukiwanie', 'dom', 'bloki')).toContain('pietro');
    expect(tekstArtykulu(art('sasiedzi:pukanie', 'dom', 'bloki'))).toContain('mieszkani');
    expect(art('sasiedzi:lokatorzy', 'dom', 'bloki').tytul).toBe('Lokatorzy za drzwiami');
    // ale siedziba nadal jest domem: komitet, nie zarząd
    expect(tekstArtykulu(art('sasiedzi:plot', 'dom', 'bloki'))).toContain('z komitetu');
    // blok wśród domów: sąsiednie domy bez mieszkań i pięter, a siedziba mówi „zarząd”
    expect(ids('sasiedzi:wywazanie', 'blok', 'domy')).not.toContain('czas-mieszkanie');
    expect(ids('sasiedzi:przeszukiwanie', 'blok', 'domy')).not.toContain('pietro');
    expect(tekstArtykulu(art('sasiedzi:plot', 'blok', 'domy'))).toContain('z zarządu');
    // bez sąsiadów rozstrzyga siedziba
    expect(ids('sasiedzi:wywazanie', 'dom', 'nikt')).not.toContain('czas-mieszkanie');
    expect(ids('sasiedzi:wywazanie', 'blok', 'nikt')).toContain('czas-mieszkanie');
  });

  it('hałas przy drzwiach (artykuł o szwendaczach): wiersze o mieszkaniu tylko tam, gdzie sąsiedzi mają drzwi mieszkań', () => {
    const wiersze = (kind: 'dom' | 'blok', near: GovPlace['near']) =>
      artykul('zombie:halas', ctx(kind, near, true))!.fakty.map((f) => f.id);
    expect(wiersze('dom', 'domy')).not.toContain('drzwi-mieszkanie');
    expect(wiersze('dom', 'domy')).not.toContain('drzwi-mieszkanie-lom');
    expect(wiersze('blok', 'bloki')).toContain('drzwi-mieszkanie');
    expect(wiersze('blok', 'bloki')).toContain('drzwi-mieszkanie-lom');
    expect(wiersze('dom', 'bloki')).toContain('drzwi-mieszkanie');
    // reszta tabeli hałasu zostaje: dom ma wszystkie wiersze poza dwoma o mieszkaniu
    expect(wiersze('blok', 'bloki').filter((i) => !wiersze('dom', 'domy').includes(i))).toEqual([
      'drzwi-mieszkanie',
      'drzwi-mieszkanie-lom',
    ]);
    for (const [klucz, v] of Object.entries(HALAS))
      if (!klucz.startsWith('mieszkanie'))
        expect(
          artykul('zombie:halas', ctx('dom', 'domy', true))!.fakty.some((f) => f.v === m(v)),
          klucz,
        ).toBe(true);
  });
});

describe('odnośniki i wyszukiwarka', () => {
  it('„Zobacz też” prowadzi do istniejących artykułów albo do kategorii 4–8 po stałych identyfikatorach', () => {
    expect(kontrolaOdnosnikow('sasiedzi')).toBeGreaterThan(30);
  });

  it('wyszukiwarka znajduje artykuły po nazwie, po treści i bez ogonków', () => {
    const c = kontekst('blok');
    expect(szukaj('wspolny plot', c)[0].id).toBe('sasiedzi:plot');
    expect(szukaj('pukanie', c)[0].id).toBe('sasiedzi:pukanie');
    expect(szukaj('wywazanie', c)[0].id).toBe('sasiedzi:wywazanie');
    expect(szukaj('szaber', c).map((x) => x.id)).toContain('sasiedzi:przeszukiwanie');
    ustawJezyk('en');
    expect(szukaj('shared fence', c)[0].id).toBe('sasiedzi:plot');
    expect(szukaj('knocking', c)[0].id).toBe('sasiedzi:pukanie');
  });
});
