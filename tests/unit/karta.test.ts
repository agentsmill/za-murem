/* Karta osoby (krok 5 mieszkańców): wiersz rodziny pod zawodem, napis o fikcji i przycisk zmiany imienia dla osób
   z generatora (z `ref`), karta mieszkańca tylko do odczytu (bez rozkazów zarządu), regex RODO na całym HTML karty
   i wybór mieszkańca kliknięciem (`pawnAt` z src/render/game.ts, czysta część `view.pickResident`). Część testów
   idzie na ręcznie złożonej osobie, część na prawdziwym wyniku generatora na demie Przymorza (jak
   lokatorzy-sim.test.ts), żeby sprawdzić tekst, który naprawdę trafia na kartę. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { budynkiZCzlonkami } from '../../src/mieszkancy/budynki.ts';
import { oznaczGeo } from '../../src/mieszkancy/oznacz.ts';
import { wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { type HitPawn, isBoard, isLokator, pawnAt } from '../../src/render/game.ts';
import { lokatorzyGry } from '../../src/sim/lokatorzy.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { type SimPerson, snapshot } from '../../src/sim/snapshot.ts';
import { groupCard, personCard } from '../../src/ui/karta.ts';
import { applyApts, settleApts } from '../../src/world/apts.ts';
import type { Geo } from '../../src/world/geo.ts';
import { buildWorld } from '../../src/world/world.ts';

/** żaden tekst dla gracza nie ma numeru mieszkania ani piętra (CLAUDE.md, spec §10) */
const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
const FIKCJA = '<p class="fikcja">Mieszkańcy są wymyśleni na podstawie danych GUS i PESEL.</p>';

const osoba = (extra: Partial<SimPerson> = {}): SimPerson => ({
  pawn: 3,
  osoba: 4,
  id: 's5',
  name: 'Anna Kowalska',
  first: 'Anna',
  f: true,
  age: 52,
  prof: 'emerytka',
  skills: { med: 2 },
  traits: ['lubiany'],
  needs: { food: 70, warm: 60, rest: 70, health: 100, safe: 60, mood: 65 },
  moods: [],
  job: null,
  sam: false,
  praca: { prio: [1, 3, 3, 3, 3, 3, 3, 3, 0], stale: null, zaSiatke: false },
  doing: 'Stoi.',
  asleep: false,
  inside: false,
  tile: 0,
  carry: 0,
  away: false,
  post: null,
  weapon: null,
  ammo: null,
  bite: null,
  maimed: false,
  ...extra,
});
const generowana = (extra: Partial<SimPerson> = {}): SimPerson =>
  osoba({
    ref: 'o17',
    rodzina: 'mąż Marek (54), córka Agnieszka (23), syn Jaś (11)',
    story: 'Przyjechała na osiedle z mężem w latach dziewięćdziesiątych. Zna wszystkich z klatki.',
    ...extra,
  });
const lokator = { lokator: true } as const;

describe('personCard: rodzina', () => {
  it('wiersz rodziny jest pod zawodem i wiekiem, a przed historią i cechami', () => {
    const html = personCard(generowana(), 0);
    expect(html).toContain('<p class="rodzina">');
    expect(html).toContain('mąż Marek (54), córka Agnieszka (23), syn Jaś (11)');
    const sub = html.indexOf('class="sub');
    const rod = html.indexOf('class="rodzina"');
    expect(sub).toBeGreaterThan(-1);
    expect(rod).toBeGreaterThan(sub);
    expect(html.indexOf('class="story"')).toBeGreaterThan(rod);
    expect(html.indexOf('class="tags"')).toBeGreaterThan(rod);
  });
  it('bez rodziny (brak pola albo pusta) nie ma wiersza', () => {
    expect(personCard(osoba(), 0)).not.toContain('rodzina');
    expect(personCard(generowana({ rodzina: '' }), 0)).not.toContain('class="rodzina"');
    expect(personCard(generowana({ rodzina: undefined }), 0)).not.toContain('class="rodzina"');
  });
  it('tekst rodziny jest uciekany', () => {
    const html = personCard(generowana({ rodzina: 'brat <b>Józek</b> (60)' }), 0);
    expect(html).toContain('brat &lt;b&gt;Józek&lt;/b&gt; (60)');
    expect(html).not.toContain('<b>Józek</b>');
  });
});

describe('personCard: napis o fikcji i zmiana imienia', () => {
  it('osoba z ref ma napis o fikcji i przycisk zmiany imienia', () => {
    const html = personCard(generowana(), 0);
    expect(html).toContain(FIKCJA);
    expect(html).toMatch(/<button type="button" class="btn mini" data-card="imie"[^>]*>Zmień imię<\/button>/);
  });
  it('osoba bez ref nie ma ani napisu, ani przycisku', () => {
    for (const p of [osoba(), osoba({ story: 'Własna historia z drużyny.', rodzina: undefined })]) {
      const html = personCard(p, 0);
      expect(html).not.toContain('class="fikcja"');
      expect(html).not.toContain('wymyśleni');
      expect(html).not.toContain('data-card="imie"');
    }
  });
  it('napis i przycisk są też na karcie mieszkańca i na karcie członka zarządu z generatora', () => {
    for (const html of [
      personCard(generowana(), 0, undefined, false, lokator),
      personCard(generowana(), 0, 'Tej nocy: sen.'),
    ]) {
      expect(html).toContain(FIKCJA);
      expect(html).toContain('data-card="imie"');
    }
  });
  it('napis jest jeden i stoi za tym, co osoba robi (na dole karty, razem z przyciskiem)', () => {
    const html = personCard(generowana(), 0);
    expect(html.split('class="fikcja"')).toHaveLength(2);
    expect(html.indexOf('class="fikcja"')).toBeGreaterThan(html.indexOf('class="doing"'));
    expect(html.indexOf('data-card="imie"')).toBeGreaterThan(html.indexOf('class="doing"'));
  });
});

describe('personCard: gra z sąsiadami', () => {
  it('z opcją imie: false karta osoby z generatora ma napis o fikcji, ale bez przycisku zmiany imienia', () => {
    for (const o of [{ imie: false }, { imie: false, lokator: true }]) {
      const html = personCard(generowana(), 0, undefined, false, o);
      expect(html).toContain(FIKCJA);
      expect(html).not.toContain('data-card="imie"');
    }
    expect(personCard(generowana(), 0, undefined, false, { imie: true })).toContain('data-card="imie"');
  });
});

describe('personCard: zawód i wiek na telefonie', () => {
  it('osoba z ref ma zawód i wiek z klasą `gen` (zwarta karta telefonu ich nie chowa), osoba bez ref bez klasy', () => {
    expect(personCard(generowana(), 0)).toContain('<p class="sub gen">emerytka, 52 lata</p>');
    expect(personCard(generowana(), 0, undefined, false, lokator)).toContain('<p class="sub gen">');
    expect(personCard(osoba(), 0)).toContain('<p class="sub">emerytka, 52 lata</p>');
  });
});

describe('personCard: mieszkaniec tylko do odczytu', () => {
  it('bez przycisków broni i amputacji, bez stanu broni', () => {
    const bity = generowana({ bite: { at: 0, limb: true, left: 800, amputate: true } });
    const zarzad = personCard(bity, 100);
    expect(zarzad).toContain('data-card="arm"');
    expect(zarzad).toContain('data-card="amputate"');
    const html = personCard(bity, 100, undefined, false, lokator);
    expect(html).not.toContain('data-card="arm"');
    expect(html).not.toContain('data-card="amputate"');
    expect(html).not.toContain('Broń:');
    // że jest ugryziony, gracz widzi dalej (bez przycisku)
    expect(html).toContain('Ugryziona w rękę albo nogę');
    expect(html).toContain('Gorączka zabije');
  });
  it('potrzeby, nastroje i to, co robi, zostają; historia zwija się i rozwija jak na karcie zarządu', () => {
    const p = generowana({ moods: [{ why: 'Ciepły posiłek', d: 4, until: 50 }], doing: 'Je przy stole.' });
    const zwinieta = personCard(p, 0, undefined, false, lokator);
    for (const n of ['Najedzenie', 'Ciepło', 'Siły', 'Zdrowie', 'Bezpieczeństwo', 'Nastrój'])
      expect(zwinieta).toContain(n);
    expect(zwinieta).toContain('Ciepły posiłek');
    expect(zwinieta).toContain('Je przy stole.');
    expect(zwinieta).toContain('class="story" data-card="story" aria-expanded="false"');
    expect(personCard(p, 0, undefined, true, lokator)).toContain('aria-expanded="true"');
    expect(zwinieta).not.toContain('Tej nocy');
  });
  it('jedynymi przyciskami są historia, zmiana imienia i rozwijanie potrzeb na telefonie (żaden nie wydaje polecenia)', () => {
    const html = personCard(generowana(), 0, undefined, false, lokator);
    const karty = [...html.matchAll(/data-card="([a-z]+)"/g)].map((m) => m[1]).sort();
    expect(karty).toEqual(['imie', 'potrzeby', 'story']);
  });
});

describe('personCard: RODO', () => {
  it('HTML karty z rodziną, historią i napisem nie trafia w regex RODO (zarząd i mieszkaniec)', () => {
    for (const html of [
      personCard(generowana(), 0),
      personCard(generowana(), 0, undefined, true, lokator),
      personCard(generowana(), 0, 'Tej nocy: warta przy bramie.'),
    ])
      expect(html).not.toMatch(RODO);
  });
  it('regex łapie to, co ma łapać (kontrola samego testu)', () => {
    expect(personCard(generowana({ rodzina: 'sąsiad z m. 12' }), 0)).toMatch(RODO);
    expect(personCard(generowana({ story: 'Mieszkała na trzecim piętrze.' }), 0)).toMatch(RODO);
  });
  it('grupa zaznaczonych nie zmienia się', () => {
    expect(groupCard(['Anna', 'Jan'], false)).toBe(
      '<h2>Zaznaczeni: 2</h2><p class="sub">Anna, Jan</p><p class="doing">Prawy przycisk: polecenie dla wszystkich.</p>',
    );
  });
});

describe('karta na prawdziwych osobach z generatora (Przymorze)', () => {
  const PUBLIC = path.resolve(import.meta.dirname, '../../public');
  const plikowy = (async (adr: string) => {
    const plik = path.join(PUBLIC, adr);
    if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
    return new Response(fs.readFileSync(plik));
  }) as unknown as typeof fetch;
  const karty: { kto: SimPerson; mieszkaniec: boolean; html: string }[] = [];

  beforeAll(async () => {
    for (const nazwa of ['przymorze', 'lanciego']) {
      const surowe = JSON.parse(fs.readFileSync(path.join(PUBLIC, `demo/${nazwa}.json`), 'utf8')) as {
        geo: Geo;
        addr: string;
        street: string;
      };
      const dane = await wczytajDaneMieszkancow(surowe.geo.c[0], surowe.geo.c[1], plikowy);
      if (!dane) throw new Error(`brak danych mieszkańców dla ${nazwa}`);
      const geo = oznaczGeo(surowe.geo, budynkiZCzlonkami(surowe.geo, dane.gmina, dane.kraj));
      const seed = Number.parseInt(hashString(surowe.addr), 16) || 2051;
      const world = buildWorld(geo, { seed, street: surowe.street });
      const wynik = lokatorzyGry(world, geo, dane, { core: 4 });
      if (!wynik) throw new Error(`lokatorzyGry dało null dla ${nazwa}`);
      applyApts(world, settleApts(world, wynik.stany));
      const sim = new Sim(world, createSim(world, seed, { core: 4, mieszkancy: wynik }));
      const snap = snapshot(sim.st, world);
      for (const kto of snap.people)
        karty.push({ kto, mieszkaniec: false, html: personCard(kto, sim.st.tick, undefined, true) });
      for (const kto of snap.lokatorzy)
        karty.push({ kto, mieszkaniec: true, html: personCard(kto, sim.st.tick, undefined, true, lokator) });
    }
  });

  it('są karty zarządu i mieszkańców, każda osoba z generatora ma napis o fikcji i przycisk imienia', () => {
    expect(karty.some((k) => k.mieszkaniec)).toBe(true);
    expect(karty.some((k) => !k.mieszkaniec)).toBe(true);
    for (const k of karty) {
      expect(k.kto.ref, k.kto.name).toBeTruthy();
      expect(k.html, k.kto.name).toContain(FIKCJA);
      expect(k.html, k.kto.name).toContain('data-card="imie"');
    }
  });
  it('rodzina z generatora trafia na kartę, a cały HTML (z rozwiniętą historią) omija regex RODO', () => {
    const zRodzina = karty.filter((k) => k.kto.rodzina);
    expect(zRodzina.length).toBeGreaterThan(0);
    for (const k of zRodzina) expect(k.html, k.kto.name).toContain(`<p class="rodzina">`);
    for (const k of karty) expect(k.html, k.kto.name).not.toMatch(RODO);
    expect(karty.some((k) => k.kto.story && k.html.includes('aria-expanded="true"'))).toBe(true);
  });
  it('karta mieszkańca nie ma rozkazów zarządu', () => {
    for (const k of karty.filter((x) => x.mieszkaniec)) {
      expect(k.html, k.kto.name).not.toContain('data-card="arm"');
      expect(k.html, k.kto.name).not.toContain('data-card="amputate"');
      // polecenia dostaje tylko zarząd, więc mieszkaniec bez pracy po prostu stoi
      expect(k.html, k.kto.name).not.toContain('czeka na polecenie');
    }
    expect(karty.some((k) => k.mieszkaniec && k.html.includes('<p class="doing">Stoi.</p>'))).toBe(true);
    expect(karty.some((k) => !k.mieszkaniec && k.html.includes('Stoi i czeka na polecenie.'))).toBe(true);
  });
});

describe('wybór pionka kliknięciem (pawnAt)', () => {
  const pionek = (kind: string, person: number, x: number, y: number, away = false): HitPawn => ({
    kind,
    person,
    x,
    y,
    away,
  });
  // punkt tuż nad stopami pionka (jak głowa: pole trafienia ma 1,5 kafelka w górę i 0,4 w dół)
  const nad = (p: HitPawn): [number, number] => [p.x, p.y - 0.6];

  it('mieszkaniec z osobą jest do wzięcia, bez osoby nie, zarząd tylko przez isBoard', () => {
    const z = pionek('resident', 14, 10.5, 10.5);
    const anonim = pionek('resident', -1, 20.5, 10.5);
    const rdzen = pionek('core', 0, 30.5, 10.5);
    const wszyscy = [z, anonim, rdzen];
    expect(pawnAt(wszyscy, ...nad(z), isLokator)).toBe(z);
    expect(pawnAt(wszyscy, ...nad(anonim), isLokator)).toBeNull();
    expect(pawnAt(wszyscy, ...nad(rdzen), isLokator)).toBeNull();
    expect(pawnAt(wszyscy, ...nad(rdzen), isBoard)).toBe(rdzen);
    expect(pawnAt(wszyscy, ...nad(z), isBoard)).toBeNull();
  });
  it('inne rodzaje pionków (szwendacz, obcy, tłum) nie są mieszkańcami', () => {
    const inni = ['zombie', 'szabrownik', 'crowd'].map((k, i) => pionek(k, i, 5.5 + i, 5.5));
    for (const p of inni) expect(pawnAt(inni, ...nad(p), isLokator), p.kind).toBeNull();
  });
  it('pionek na wyprawie poza mapą nie jest do wzięcia', () => {
    const p = pionek('resident', 2, 8.5, 8.5, true);
    expect(pawnAt([p], ...nad(p), isLokator)).toBeNull();
  });
  it('pole trafienia: 0,6 kafelka w bok, 1,5 w górę, 0,4 w dół; najbliższy wygrywa', () => {
    const a = pionek('resident', 1, 10.5, 10.5);
    const b = pionek('resident', 2, 11.2, 10.5);
    expect(pawnAt([a], 10.5 + 0.59, 10.5 - 0.6, isLokator)).toBe(a);
    expect(pawnAt([a], 10.5 + 0.61, 10.5 - 0.6, isLokator)).toBeNull();
    expect(pawnAt([a], 10.5, 10.5 - 1.49, isLokator)).toBe(a);
    expect(pawnAt([a], 10.5, 10.5 - 1.51, isLokator)).toBeNull();
    expect(pawnAt([a], 10.5, 10.5 + 0.39, isLokator)).toBe(a);
    expect(pawnAt([a], 10.5, 10.5 + 0.41, isLokator)).toBeNull();
    expect(pawnAt([a, b], 10.6, 9.9, isLokator)).toBe(a);
    expect(pawnAt([a, b], 11.1, 9.9, isLokator)).toBe(b);
    // kolejność w tablicy nie rozstrzyga
    expect(pawnAt([b, a], 10.6, 9.9, isLokator)).toBe(a);
  });
});
