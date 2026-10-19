/* Gracz-bot mapy miasta (tests/unit/miasto-play.ts): wybór kategorii według braku, najbliższe niewyczerpane miejsce poza
   mapą lokalną, dwie osoby o największym zdrowiu, a w całej grze z zarządem (playWithGov z opcją `miasto`) wyprawy
   dzienne na demie Przymorza, deterministyczny przebieg i brak jakiegokolwiek skutku bez opcji. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { canGo } from '../../src/gov/noc.ts';
import type { GovEffects, GovInput, GovState } from '../../src/gov/typy.ts';
import { celZMiejsca, wlaczMiasto, zostaloZMiejsca } from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { type Miejsce, naMapieLokalnej, PROMIEN_MAPY_LOKALNEJ } from '../../src/world/miasto.ts';
import { Atrapa } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';
import { kategoriaBraku, miastoPlayer, najblizszeMiejsce, okolicaZGeo } from './miasto-play.ts';
import { demoWorld } from './miejsce-pomoc.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const okolica = okolicaZGeo(demo.geo);
const { w } = demoWorld('przymorze');
const DNI = 10;
const SEED = 11;

/** miejsce na wschód od adresu; klucz „poi:N:7”: N = 7 to miejsce puste od lat (zapas 0), reszta z numerów 1–40 ma zapas */
const miejsce = (n: number, kat: string, odl: number): Miejsce => ({
  klucz: `poi:${n}:7`,
  kat,
  x: odl,
  y: 0,
  odl,
  nazwa: '',
});

/** wejście z atrapy (cztery osoby, dzień 2, godzina 10) z podanymi zapasami i okolicą */
function wejscie(
  stock: Partial<GovInput['stock']> = {},
  extra: Partial<GovInput> = {},
  okol: readonly Miejsce[] = [],
): GovInput {
  const i = new Atrapa(1).input();
  return { ...i, day: 2, hour: 10, minute: 0, okolica: okol, stock: { ...i.stock, ...stock }, ...extra };
}

function zarzadMiasta(): GovState {
  const gov = newGov(1);
  wlaczMiasto(gov);
  return gov;
}

describe('okolicaZGeo', () => {
  it('daje miejsca z kluczami, posortowane po odległości, bez zmiany demo', () => {
    const przed = JSON.stringify(demo.geo.poi);
    const m = okolicaZGeo(demo.geo);
    expect(JSON.stringify(demo.geo.poi)).toBe(przed);
    expect(m.length).toBe(demo.geo.poi.length);
    for (const x of m) expect(x.klucz).toMatch(/^poi:\d+:\d+$/);
    for (let k = 1; k < m.length; k++) expect(m[k].odl).toBeGreaterThanOrEqual(m[k - 1].odl);
    // bez tabel mieszkańców same kategorie (RODO): żadnych własnych nazw
    for (const x of m) expect(x.nazwa).toBe('');
  });
});

describe('kategoriaBraku', () => {
  it('brak jedzenia (poniżej dwóch porcji na osobę) to sklep spożywczy, przed opałem i szkołą', () => {
    expect(kategoriaBraku(wejscie({ supplies: 7, wood: 0 }, { day: 3 }))).toBe('spozywczy');
    expect(kategoriaBraku(wejscie({ supplies: 8, wood: 0 }, { day: 3 }))).toBe('stacja');
  });

  it('brak drewna (poniżej 4) to stacja, przed szkołą', () => {
    expect(kategoriaBraku(wejscie({ supplies: 20, wood: 3 }, { day: 3 }))).toBe('stacja');
    expect(kategoriaBraku(wejscie({ supplies: 20, wood: 4 }, { day: 3 }))).toBe('szkola');
  });

  it('bez braków szkoła co trzeci dzień, w inne dni nic', () => {
    const syt = { supplies: 20, wood: 10 };
    expect(kategoriaBraku(wejscie(syt, { day: 3 }))).toBe('szkola');
    expect(kategoriaBraku(wejscie(syt, { day: 6 }))).toBe('szkola');
    expect(kategoriaBraku(wejscie(syt, { day: 2 }))).toBeNull();
    expect(kategoriaBraku(wejscie(syt, { day: 4 }))).toBeNull();
  });

  it('próg jedzenia liczy się od liczby osób w zarządzie', () => {
    const i = wejscie({ supplies: 5, wood: 10 }, { day: 2 });
    expect(i.people.length).toBe(4);
    expect(kategoriaBraku(i)).toBe('spozywczy');
    expect(kategoriaBraku({ ...i, people: i.people.slice(0, 2) })).toBeNull();
  });
});

describe('najblizszeMiejsce', () => {
  const miejsca = [
    miejsce(1, 'spozywczy', 100),
    miejsce(2, 'spozywczy', 300),
    miejsce(3, 'spozywczy', 500),
    miejsce(4, 'apteka', 250),
    miejsce(5, 'spozywczy', 2500),
  ];

  it('miejsca z kluczy testu mają zapas, a puste nie', () => {
    for (const m of miejsca) expect(celZMiejsca(m).zapas).toBeGreaterThan(0);
    expect(celZMiejsca(miejsce(7, 'spozywczy', 400)).zapas).toBe(0);
  });

  it('bierze najbliższe z kategorii poza mapą lokalną (192 m), nie dalej niż 2000 m', () => {
    const gov = zarzadMiasta();
    const i = wejscie({}, {}, miejsca);
    expect(naMapieLokalnej(miejsca[0])).toBe(true);
    expect(PROMIEN_MAPY_LOKALNEJ).toBe(192);
    expect(najblizszeMiejsce(gov, i, 'spozywczy')?.klucz).toBe('poi:2:7');
    expect(najblizszeMiejsce(gov, i, 'apteka')?.klucz).toBe('poi:4:7');
    expect(najblizszeMiejsce(gov, i, 'stacja')).toBeNull();
    // jedyny sklep dalej niż 2000 m nie wchodzi w grę
    expect(najblizszeMiejsce(gov, wejscie({}, {}, [miejsce(5, 'spozywczy', 2500)]), 'spozywczy')).toBeNull();
  });

  it('pomija miejsca wyczerpane, bierze następne', () => {
    const gov = zarzadMiasta();
    const cel = celZMiejsca(miejsca[1]);
    gov.miasto!.zabrano[cel.klucz] = cel.zapas!;
    expect(zostaloZMiejsca(gov, cel)).toBe(0);
    expect(najblizszeMiejsce(gov, wejscie({}, {}, miejsca), 'spozywczy')?.klucz).toBe('poi:3:7');
  });

  it('miejsce puste od lat (zapas 0) nie jest celem', () => {
    const gov = zarzadMiasta();
    const i = wejscie({}, {}, [miejsce(7, 'spozywczy', 250), miejsce(3, 'spozywczy', 500)]);
    expect(najblizszeMiejsce(gov, i, 'spozywczy')?.klucz).toBe('poi:3:7');
  });

  it('cel to opis miejsca z kategorią, położeniem i zapasem', () => {
    const cel = najblizszeMiejsce(zarzadMiasta(), wejscie({}, {}, miejsca), 'spozywczy')!;
    expect(cel.kat).toBe('spozywczy');
    expect(cel.odl).toBe(300);
    expect(cel.zapas).not.toBeNull();
  });
});

describe('miastoPlayer na zarządzie bez mapy miasta', () => {
  it('bez stanu miasta gracz nic nie wysyła, nawet gdy brakuje jedzenia i okolica jest', () => {
    const gracz = miastoPlayer();
    const gov = newGov(1);
    expect(gov.miasto).toBeUndefined();
    const zastosuj = vi.fn();
    gracz.krok(gov, wejscie({ supplies: 0, wood: 0 }, {}, okolica), zastosuj);
    expect(zastosuj).not.toHaveBeenCalled();
    expect(gov.wyprawy).toBeUndefined();
    expect(gracz.log.wyprawy).toBe(0);
  });

  it('w dniu samouczka, po zmroku, przy wyprawie w drodze i przy czekającej karcie nocy nie wysyła', () => {
    const syt = { supplies: 0, wood: 0 };
    const zastosuj = vi.fn();
    for (const przeszkoda of ['dzien-1', 'noc', 'wczesnie', 'w-drodze', 'karta'] as const) {
      const gracz = miastoPlayer();
      const gov = zarzadMiasta();
      let i = wejscie(syt, {}, okolica);
      if (przeszkoda === 'dzien-1') i = { ...i, day: 1 };
      if (przeszkoda === 'noc') i = { ...i, hour: 17 };
      if (przeszkoda === 'wczesnie') i = { ...i, hour: 6 };
      if (przeszkoda === 'w-drodze')
        gov.wyprawy = [{ id: 1, cel: celZMiejsca(okolica[0]), ids: ['x'], wyjscie: 0, powrot: 1 }];
      if (przeszkoda === 'karta') gov.night = { confirmed: false } as GovState['night'];
      gracz.krok(gov, i, zastosuj);
      expect(gracz.log.wyprawy, przeszkoda).toBe(0);
    }
    expect(zastosuj).not.toHaveBeenCalled();
  });

  it('w dzień z brakiem jedzenia wysyła dwie osoby o największym zdrowiu do najbliższego sklepu poza mapą lokalną', () => {
    const gracz = miastoPlayer();
    const gov = zarzadMiasta();
    const i = wejscie({ supplies: 0, wood: 10 }, {}, okolica);
    // zdrowie: druga i czwarta osoba najzdrowsze
    const zdrowie = [60, 100, 70, 90];
    i.people = i.people.map((p, k) => ({ ...p, needs: { ...p.needs, health: zdrowie[k] } }));
    const fx: GovEffects[] = [];
    gracz.krok(gov, i, (e) => fx.push(e));
    expect(gracz.log.wyprawy).toBe(1);
    expect(fx.length).toBe(1);
    const wyp = gov.wyprawy![0];
    expect(wyp.ids).toEqual([i.people[1].id, i.people[3].id]);
    expect(wyp.cel.kat).toBe('spozywczy');
    const najblizszy = okolica.find((m) => m.kat === 'spozywczy' && !naMapieLokalnej(m) && celZMiejsca(m).zapas! > 0)!;
    expect(wyp.cel.klucz).toBe(najblizszy.klucz);
    expect(fx[0].away.map((a) => a.id)).toEqual(wyp.ids);
    expect(gracz.log.maxOdl[i.day - 1]).toBeCloseTo(najblizszy.odl, 5);
    expect(gracz.wysylki.length).toBe(1);
  });

  it('szkoła tylko raz w dzień szkoły, a osoby spoza zasięgu sił nie wychodzą', () => {
    const gracz = miastoPlayer();
    const gov = zarzadMiasta();
    const i = wejscie({ supplies: 20, wood: 10 }, { day: 3 }, okolica);
    const zastosuj = vi.fn();
    gracz.krok(gov, i, zastosuj);
    expect(gracz.log.wyprawy).toBe(1);
    expect(gov.wyprawy![0].cel.kat).toBe('szkola');
    // ta sama doba, wyprawa wróciła: druga szkoła nie wychodzi
    gov.wyprawy = [];
    gracz.krok(gov, i, zastosuj);
    expect(gracz.log.wyprawy).toBe(1);
    // chorzy (zdrowie poniżej 30) nie przejdą nawet blisko: za mało osób, nic nie wychodzi
    const chory = miastoPlayer();
    const g2 = zarzadMiasta();
    const i2 = wejscie({ supplies: 0, wood: 10 }, {}, okolica);
    i2.people = i2.people.map((p, k) => ({ ...p, needs: { ...p.needs, health: k < 3 ? 10 : 100 } }));
    chory.krok(g2, i2, zastosuj);
    expect(chory.log.wyprawy).toBe(0);
  });
});

/** Gra z zarządem na demie Przymorza przez DNI dni; krok gracza owinięty kontrolą każdego wyjścia na bieżąco: kategoria
    według braku, najbliższe niewyczerpane miejsce poza mapą lokalną do 2000 m, dwie osoby o największym zdrowiu. */
function graj(seed: number) {
  const gracz = miastoPlayer();
  const wyjscia: { dzien: number; godzina: number; zle: string[] }[] = [];
  const krok: typeof gracz.krok = (gov, i, zastosuj) => {
    const przed = gov.wyprawy?.length ?? 0;
    gracz.krok(gov, i, zastosuj);
    if ((gov.wyprawy?.length ?? 0) <= przed) return;
    const wyp = gov.wyprawy![gov.wyprawy!.length - 1];
    const zle: string[] = [];
    // kategoria według braku, zapisana wprost
    const kat =
      i.stock.supplies < i.people.length * 2
        ? 'spozywczy'
        : i.stock.wood < 4
          ? 'stacja'
          : i.day % 3 === 0
            ? 'szkola'
            : null;
    if (wyp.cel.kat !== kat) zle.push(`kategoria ${wyp.cel.kat} zamiast ${kat}`);
    // najbliższe niewyczerpane miejsce tej kategorii poza mapą lokalną, do 2000 m
    const najblizszy = i
      .okolica!.filter(
        (m) =>
          m.kat === kat &&
          !naMapieLokalnej(m) &&
          m.odl <= 2000 &&
          celZMiejsca(m).zapas! - (gov.miasto!.zabrano[m.klucz] ?? 0) > 0,
      )
      .sort((a, b) => a.odl - b.odl || (a.klucz < b.klucz ? -1 : 1))[0];
    if (wyp.cel.klucz !== najblizszy?.klucz) zle.push(`miejsce ${wyp.cel.klucz} zamiast ${najblizszy?.klucz}`);
    if (!(wyp.cel.odl > 192 && wyp.cel.odl <= 2000)) zle.push(`odległość ${wyp.cel.odl}`);
    // dwie osoby, najzdrowsze spośród tych, które przejdą
    if (wyp.ids.length !== 2) zle.push(`osób ${wyp.ids.length}`);
    const moga = i.people.filter((p) => !p.away && !p.bitten && canGo(p, wyp.cel));
    const wybrani = moga.filter((p) => wyp.ids.includes(p.id));
    const reszta = moga.filter((p) => !wyp.ids.includes(p.id));
    if (wybrani.length !== wyp.ids.length) zle.push('ktoś nie przejdzie canGo');
    if (
      reszta.length &&
      Math.min(...wybrani.map((p) => p.needs.health)) < Math.max(...reszta.map((p) => p.needs.health))
    )
      zle.push('wybrani nie są najzdrowsi');
    wyjscia.push({ dzien: i.day, godzina: i.hour, zle });
  };
  // tylko wyprawy dzienne gracza: karta nocy nie wysyła nikogo, żeby wizyty w stanie zgadzały się z logiem bota
  const r = playWithGov(w, seed, 'zawsze-warta', DNI, 4, {
    miasto: { okolica, krok, po: gracz.po },
    bezWyprawNocnych: true,
  });
  return { r, gracz, wyjscia };
}

describe('gra z zarządem i mapą miasta na demie Przymorza (10 dni)', () => {
  const a = graj(SEED);

  it('w 10 dniach wysyła co najmniej jedną wyprawę, a log zgadza się z wysłanymi', () => {
    const { gracz, wyjscia } = a;
    expect(gracz.log.wyprawy).toBeGreaterThanOrEqual(1);
    expect(gracz.log.wyprawy).toBe(wyjscia.length);
    expect(gracz.wysylki.length).toBe(gracz.log.wyprawy);
    // maksymalna odległość na dzień: dla każdego dnia największa z wysłanych tego dnia, 0 bez wypraw
    for (let d = 1; d <= gracz.log.maxOdl.length; d++) {
      const odl = gracz.wysylki.filter((x) => x.dzien === d).map((x) => x.odl);
      expect(gracz.log.maxOdl[d - 1]).toBe(odl.length ? Math.max(...odl) : 0);
    }
    // gra zaczyna się o 15:00 dnia 1 i trwa DNI pełnych dób, więc kończy się rankiem dnia DNI + 1
    expect(gracz.log.maxOdl.length).toBeLessThanOrEqual(DNI + 1);
  });

  it('każde wyjście: kategoria według braku, najbliższe niewyczerpane miejsce, dwie najzdrowsze osoby, za dnia', () => {
    for (const x of a.wyjscia) {
      expect(x.zle, `dzień ${x.dzien} ${x.godzina}:00`).toEqual([]);
      expect(x.dzien).toBeGreaterThanOrEqual(2);
      expect(x.godzina).toBeGreaterThanOrEqual(7);
      expect(x.godzina).toBeLessThan(17);
    }
  });

  it('jedna wyprawa naraz i każda wraca: łup i rany liczą się z powrotów', () => {
    const { r, gracz } = a;
    const lup = Object.values(gracz.log.lup).reduce((s, v) => s + v, 0);
    expect(lup).toBeGreaterThan(0);
    for (const v of Object.values(gracz.log.lup)) expect(v).toBeGreaterThanOrEqual(0);
    expect(gracz.log.ugryzieni).toBe(0);
    // gra stoi na zarządzie z włączoną mapą miasta, miejsca z wypraw są zapisane w stanie
    expect(r.gov.miasto).toBeDefined();
    const wizyty = Object.values(r.gov.miasto!.wizyty).reduce((s, v) => s + v, 0);
    expect(wizyty).toBeGreaterThanOrEqual(1);
    expect(wizyty).toBeLessThanOrEqual(gracz.log.wyprawy);
    // każda wyprawa wraca: poza ostatnią (jedna naraz, bot mógł ją wysłać tuż przed końcem przebiegu) wszystkie mają wizytę
    expect(gracz.log.wyprawy - wizyty).toBeLessThanOrEqual(1);
    expect(r.gov.wyprawy?.length ?? 0).toBe(gracz.log.wyprawy - wizyty);
    // łup z powrotów w logu bota to to samo, co miejsca zapisały jako zabrane
    const zabrano = Object.values(r.gov.miasto!.zabrano).reduce((s, v) => s + v, 0);
    expect(lup).toBe(zabrano);
  });

  it('przebieg jest deterministyczny: ten sam skrót symulacji, zarządu i log', () => {
    const b = graj(SEED);
    expect(b.r.hash).toBe(a.r.hash);
    expect(hashString(JSON.stringify(b.r.gov))).toBe(hashString(JSON.stringify(a.r.gov)));
    expect(JSON.stringify(b.gracz.log)).toBe(JSON.stringify(a.gracz.log));
    expect(JSON.stringify(b.gracz.wysylki)).toBe(JSON.stringify(a.gracz.wysylki));
  });
});

describe('bez opcji `miasto` gra jest jak przed mapą miasta', () => {
  it('stan zarządu nie ma miasta ani wypraw, a sama okolica bez gracza niczego nie wysyła', () => {
    const bez = playWithGov(w, SEED, 'zawsze-warta', 3, 4);
    expect(bez.gov.miasto).toBeUndefined();
    expect(bez.gov.wyprawy).toBeUndefined();
    const samaOkolica = playWithGov(w, SEED, 'zawsze-warta', 3, 4, { miasto: { okolica } });
    expect(samaOkolica.gov.miasto).toBeDefined();
    expect(samaOkolica.gov.wyprawy ?? []).toEqual([]);
  });
});
