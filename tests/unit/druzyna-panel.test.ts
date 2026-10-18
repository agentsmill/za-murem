/* Panel „Wasz zarząd” bez przeglądarki: stan z pamięci, tryby i liczba osób, opcje dla createSim, HTML sekcji
   i edytora (src/ui/druzyna.ts), historia na karcie osoby w grze (src/ui/karta.ts). Wygląd sprawdzają zrzuty
   druzyna-* w tools/shots.ts. */

import { describe, expect, it } from 'vitest';
import { PROFS } from '../../src/content/data.ts';
import { bledyOsoby, dziedziny, historiaZ, losujDruzyne, type OsobaDruzyny } from '../../src/content/druzyna.ts';
import { mulberry } from '../../src/core/rng.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import {
  htmlPanelu,
  losujCalaOsobe,
  losujWszystkich,
  odswiezHistorie,
  opcjeGry,
  podsumowanie,
  type StanDruzyny,
  stanDomyslny,
  ustawLiczbe,
  wczytajStan,
  wlaczWlasny,
  wlaczZAdresu,
  zapisStanu,
} from '../../src/ui/druzyna.ts';
import { personCard, storyHtml } from '../../src/ui/karta.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';

const wlasny = (n = 4, seed = 1): StanDruzyny => ({ n, wlasny: true, team: losujDruzyne(mulberry(seed), n) });

describe('stan panelu', () => {
  it('bez ruszania panelu: 4 osoby z adresu, czyli createSim(…, { core: 4 }) jak dotąd', () => {
    expect(opcjeGry(stanDomyslny())).toEqual({ core: 4 });
    expect(podsumowanie(stanDomyslny())).toBe('4 osoby, losowo z adresu');
  });

  it('zła pamięć to stan domyślny, dobra wraca bez zmian', () => {
    const rnd = mulberry(1);
    for (const raw of [null, '', 'nie json', '{"v":2,"n":2}', '[]', 'null', '{"v":1,"team":5,"n":"x"}'])
      expect(wczytajStan(raw, rnd)).toEqual(raw?.includes('"v":1') ? { ...stanDomyslny(), n: 4 } : stanDomyslny());
    const s = wlasny(3);
    expect(wczytajStan(zapisStanu(s), rnd)).toEqual(s);
    expect(wczytajStan(zapisStanu({ ...s, wlasny: false, n: 2 }), rnd)).toEqual({ ...s, wlasny: false, n: 2 });
  });

  it('pamięć ręcznie zmieniona: liczba przycięta do 1–5, nadmiar osób odpada, złe osoby poprawione', () => {
    const team: unknown[] = [...losujDruzyne(mulberry(2), 5), losujDruzyne(mulberry(3), 1)[0]];
    team[1] = { ...(team[1] as OsobaDruzyny), age: 300, traits: ['twardy', 'pracowity'] };
    const s = wczytajStan(JSON.stringify({ v: 1, n: 9, wlasny: true, team }), mulberry(4));
    expect(s.n).toBe(5);
    expect(s.team).toHaveLength(5);
    for (const o of s.team) expect(bledyOsoby(o)).toEqual([]);
    expect(s.team[1].name).toBe((team[1] as OsobaDruzyny).name);
    expect(s.team[0]).toEqual(team[0]);
  });

  it('własny tryb: drużyna dopełniana do liczby osób, mniejsza liczba zostawia osoby w pamięci', () => {
    const rnd = mulberry(5);
    const s = stanDomyslny();
    wlaczWlasny(s, rnd);
    expect(s.team).toHaveLength(4);
    ustawLiczbe(s, 2, rnd);
    expect(s.team).toHaveLength(4);
    expect(opcjeGry(s).team).toEqual(s.team.slice(0, 2).map(({ ziarno: _, ...o }) => o));
    expect(opcjeGry(s).core).toBe(2);
    ustawLiczbe(s, 5, rnd);
    expect(s.team).toHaveLength(5);
    expect(new Set(s.team.map((o) => o.name.split(' ')[0])).size).toBe(5);
    ustawLiczbe(s, 0, rnd);
    expect(s.n).toBe(1);
  });

  it('powrót do losowania z adresu nie kasuje własnej drużyny, a ponowne włączenie ją przywraca', () => {
    const rnd = mulberry(6);
    const s = wlasny(4, 6);
    const team = structuredClone(s.team);
    wlaczZAdresu(s);
    expect(opcjeGry(s)).toEqual({ core: 4 });
    expect(podsumowanie(s)).toBe('4 osoby, losowo z adresu');
    wlaczWlasny(s, rnd);
    expect(s.team).toEqual(team);
    expect(podsumowanie(s)).toBe(`własny: ${team.map((o) => o.name.split(' ')[0]).join(', ')}`);
  });

  it('opcje gry to kopia bez ziarna historii: zmiana w grze nie rusza panelu', () => {
    const s = wlasny(3);
    const o = opcjeGry(s);
    expect(o.team!.every((x) => !('ziarno' in x))).toBe(true);
    o.team![0].skills.bud = 9;
    o.team![0].traits.push('x');
    expect(s.team[0].skills.bud).not.toBe(9);
    expect(s.team[0].traits).not.toContain('x');
  });

  it('losowanie wszystkich i jednej osoby: imiona bez powtórzeń, osoby zgodne z zasadami', () => {
    const rnd = mulberry(7);
    const s = wlasny(5, 7);
    for (let k = 0; k < 200; k++) {
      if (k % 10 === 0) losujWszystkich(s, rnd);
      else losujCalaOsobe(s, k % 5, rnd);
      expect(new Set(s.team.map((o) => o.name.split(' ')[0])).size).toBe(5);
      expect(new Set(s.team.map((o) => o.prof)).size).toBe(5);
      for (const o of s.team) expect(bledyOsoby(o)).toEqual([]);
    }
  });

  it('historia z losowania idzie za zmianą płci, a napisana przez gracza zostaje', () => {
    const s = wlasny(1, 8);
    const o = s.team[0];
    expect(o.story).toBe(historiaZ(o.ziarno!, o));
    o.f = !o.f;
    odswiezHistorie(o);
    expect(o.story).toBe(historiaZ(o.ziarno!, o));
    o.story = 'Moja historia.';
    delete o.ziarno;
    o.f = !o.f;
    odswiezHistorie(o);
    expect(o.story).toBe('Moja historia.');
  });
});

describe('HTML sekcji', () => {
  it('zwinięta: nagłówek z podsumowaniem i przyciskiem, bez kafelków', () => {
    const h = htmlPanelu(stanDomyslny(), { open: false, sel: -1 });
    expect(h).toContain('Wasz zarząd');
    expect(h).toContain('4 osoby, losowo z adresu');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('hidden');
    expect(h).not.toContain('dz-chip');
  });

  it('rozwinięta z adresu: liczba osób, n kafelków „losowo z adresu”, przycisk własnego zarządu', () => {
    const s = { ...stanDomyslny(), n: 3 };
    const h = htmlPanelu(s, { open: true, sel: -1 });
    expect(h.match(/losowo z adresu<\/small>/g)).toHaveLength(3);
    expect(h).toContain('Stwórz własny zarząd');
    expect(h.match(/name="dzN"/g)).toHaveLength(5);
    expect(h).toContain('value="3" checked');
    expect(h).not.toContain('dz-ed');
  });

  it('własny z otwartą osobą: edytor ze wszystkimi polami w granicach zawodu', () => {
    const s = wlasny(4, 9);
    const o = s.team[2];
    const h = htmlPanelu(s, { open: true, sel: 2 });
    expect(h).toContain('Losuj wszystkich');
    expect(h).toContain('Wróć do losowania z adresu');
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain(`id="dzName" data-dz="name" maxlength="40"`);
    const p = PROFS.find((x) => x[0] === o.prof)!;
    expect(h).toContain(`min="${p[3][0]}" max="${p[3][1]}"`);
    expect(h.match(/<option /g)).toHaveLength(22);
    expect(h.match(/class="dz-sk"/g)).toHaveLength(dziedziny(o.prof).length);
    expect(h).toContain('zostało ');
    expect(h).toContain('Losuj cechy');
    expect(h).toContain('Wylosuj historię');
    expect(h).toContain('Losuj całą osobę');
    expect(h).toContain(`maxlength="400"`);
  });

  it('zawód-żart mówi w edytorze, ile punktów wyda, reszta przypomina o budżecie', () => {
    const s = wlasny(1, 12);
    s.team[0] = { ...s.team[0], prof: 'Kucharz', skills: { uprawa: 1 }, age: 30 };
    expect(htmlPanelu(s, { open: true, sel: 0 })).toContain('Ten zawód wyda najwyżej 3 z 6 punktów.');
    s.team[0] = { ...s.team[0], prof: 'Murarz', skills: { bud: 3 } };
    expect(htmlPanelu(s, { open: true, sel: 0 })).toContain('Tylko dziedziny z zawodu, razem najwyżej 6 punktów.');
  });

  it('tekst gracza w historii i imieniu jest uciekany', () => {
    const s = wlasny(1, 10);
    s.team[0].story = 'Lubi <script> i "cudzysłowy" & kozy.';
    const h = htmlPanelu(s, { open: true, sel: 0 });
    expect(h).toContain('Lubi &lt;script&gt; i &quot;cudzysłowy&quot; &amp; kozy.');
    expect(h).not.toContain('<script>');
  });
});

describe('historia na karcie osoby w grze', () => {
  it('jedna linijka albo cała, z odczytu symulacji; bez historii nie ma przycisku', () => {
    const a = ADDRESSES[0];
    const w = buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: 3 });
    const team = losujDruzyne(mulberry(11), 2);
    team[1].story = 'Zna <b>wszystkich</b>.';
    const sim = new Sim(w, createSim(w, 7, { team }));
    const [p0, p1] = snapshot(sim.st, w).people;
    const closed = personCard(p0, sim.st.tick);
    expect(closed).toContain('class="story" data-card="story" aria-expanded="false"');
    expect(closed).toContain(team[0].story.slice(0, 40));
    expect(personCard(p0, sim.st.tick, undefined, true)).toContain('aria-expanded="true"');
    expect(personCard(p1, sim.st.tick)).toContain('Zna &lt;b&gt;wszystkich&lt;/b&gt;.');
    expect(storyHtml(undefined, false)).toBe('');
    // osoba z adresu: karta jak dotąd, bez historii
    const plain = snapshot(new Sim(w, createSim(w, 7)).st, w).people[0];
    expect(plain.story).toBeUndefined();
    expect(personCard(plain, 0)).not.toContain('data-card="story"');
  });
});
