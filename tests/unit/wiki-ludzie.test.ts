/* Wiki, kategoria „Ludzie” (src/ui/wiki-ludzie.ts i src/ui/wiki-bron.ts): fakty o potrzebach liczone osobno z `stepNeeds`,
   `safeTarget` i `moodOf`, skutki cech i umiejętności z funkcji zarządu, tabele broni z `WEAPONS` oraz „przypięcia”: każda
   liczba, którą wiki ma wpisaną ręcznie, bo gra trzyma ją na stałe w kodzie, musi stać w tym kodzie w tej postaci. Zmiana
   liczby w grze wywala test i przypomina o poprawce w wiki. */

import { afterEach, describe, expect, it } from 'vitest';
import { DOM } from '../../src/content/data.ts';
import { liczba, ustawJezyk } from '../../src/core/jezyk.ts';
import { dailyDrift } from '../../src/gov/uchwaly.ts';
import { tempoOsoby } from '../../src/sim/badania.ts';
import { hitChance, WEAPONS, type WeaponId } from '../../src/sim/bron.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { moodOf, type NeedCtx, type Needs, safeTarget, stepNeeds } from '../../src/sim/needs.ts';
import { RODZAJE } from '../../src/sim/praca.ts';
import { FEVER_TICKS, FLOOR_MOOD, STRANGER_HP } from '../../src/sim/sim.ts';
import { ZOMBIE_HP } from '../../src/sim/zombie.ts';
import { needLevel } from '../../src/ui/karta.ts';
import { znaczniki } from '../../src/ui/lista.ts';
import { signed } from '../../src/ui/tekst.ts';
import { type Artykul, artykul } from '../../src/ui/wiki.ts';
import { KOLEJNOSC_BRONI, WALKA, ZNALEZISKA_BRONI } from '../../src/ui/wiki-bron.ts';
import {
  AMPUTACJA,
  KIKUT_CELNOSC,
  NASTROJE,
  RANA_AMPUTACJA,
  RANA_NAPAD,
  RANA_WYPRAWA,
  SMIERC_MIESZKANIEC,
  SMIERC_NASTROJ,
  SMIERC_ZARZAD,
  ZNACZNIK_RANY,
} from '../../src/ui/wiki-ludzie.ts';
import { rodzajNazwa, UMIEJETNOSCI } from '../../src/ui/wiki-praca.ts';
import { sondaOsoba, sondaStan, sondaWejscie } from '../../src/ui/wiki-sondy.ts';
import { kontekst, zrodlo } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const ART = (id: string, wariant: 'blok' | 'dom' = 'blok'): Artykul => {
  const a = artykul(id, kontekst(wariant));
  if (!a) throw new Error(`brak artykułu ${id}`);
  return a;
};
const FAKT = (a: Artykul, id: string): string => {
  const f = a.fakty.find((x) => x.id === id);
  if (!f) throw new Error(`${a.id}: brak faktu ${id} (${a.fakty.map((x) => x.id).join(', ')})`);
  return f.v;
};

/** potrzeby po godzinie gry w danym otoczeniu, wprost z `stepNeeds` (reszta od 60) */
function godzina(ctx: Partial<NeedCtx>, start: Partial<Needs> = {}): Needs {
  const n: Needs = { food: 60, warm: 60, rest: 60, health: 60, safe: 60, mood: 60, ...start };
  stepNeeds(n, { temp: 20, fire: false, asleep: false, busy: false, dark: false, inside: true, company: 2, ...ctx }, 1);
  return n;
}
const naGodz = (v: number): string => `${signed(Math.round(v * 10) / 10)} na godzinę`;

describe('potrzeby: fakty z funkcji gry', () => {
  it('najedzenie: spadek na jawie i we śnie', () => {
    const a = ART('potrzeba:food');
    expect(FAKT(a, 'jawa')).toBe(naGodz(godzina({}).food - 60));
    expect(FAKT(a, 'sen')).toBe(naGodz(godzina({ asleep: true }).food - 60));
  });

  it('ciepło: w cieple, w chłodzie i przy ogniu', () => {
    const a = ART('potrzeba:warm');
    expect(FAKT(a, 'cieplo')).toBe(naGodz(godzina({ temp: 20 }).warm - 60));
    expect(FAKT(a, 'zimno')).toBe(naGodz(godzina({ temp: 8 }).warm - 60));
    expect(FAKT(a, 'ogien')).toBe(naGodz(godzina({ fire: true }).warm - 60));
  });

  it('siły: na nogach, przy ciężkiej pracy i we śnie w łóżku i na podłodze', () => {
    const a = ART('potrzeba:rest');
    expect(FAKT(a, 'jawa')).toBe(naGodz(godzina({}).rest - 60));
    expect(FAKT(a, 'praca')).toBe(naGodz(godzina({ busy: true }).rest - 60));
    expect(FAKT(a, 'lozko')).toBe(naGodz(godzina({ asleep: true }).rest - 60));
    expect(FAKT(a, 'podloga')).toBe(naGodz(godzina({ asleep: true, floor: true }).rest - 60));
  });

  it('zdrowie: powrót, gdy niczego nie brakuje, i spadek przy każdym niedoborze', () => {
    const a = ART('potrzeba:health');
    expect(FAKT(a, 'powrot')).toBe(naGodz(godzina({}, { warm: 100, food: 100, rest: 100, health: 50 }).health - 50));
    expect(FAKT(a, 'glod')).toBe(naGodz(godzina({}, { food: 5, warm: 100, rest: 100, health: 80 }).health - 80));
    expect(FAKT(a, 'wyczerpanie')).toBe(naGodz(godzina({}, { rest: 5, warm: 100, food: 100, health: 80 }).health - 80));
    expect(FAKT(a, 'zimno')).toBe(
      naGodz(godzina({ temp: -10 }, { warm: 0, food: 100, rest: 100, health: 80 }).health - 80),
    );
  });

  it('nastrój: wagi potrzeb sumują się do 100%, a każda to różnica w `moodOf`', () => {
    const a = ART('potrzeba:mood');
    const wagi = a.fakty.filter((f) => f.id.startsWith('waga-')).map((f) => Number.parseInt(f.v, 10));
    expect(wagi.reduce((s, w) => s + w, 0)).toBe(100);
    const baza: Needs = { food: 50, warm: 50, rest: 50, health: 50, safe: 50, mood: 0 };
    for (const k of ['food', 'warm', 'rest', 'health', 'safe'] as const) {
      const w = Math.round(((moodOf({ ...baza, [k]: 100 }) - moodOf(baza)) / 50) * 100);
      expect(FAKT(a, `waga-${k}`), k).toBe(`${w}%`);
    }
  });

  it('bezpieczeństwo: cele w trzech typowych miejscach, dziura, obcy i napad', () => {
    const a = ART('potrzeba:safe');
    const baza: NeedCtx = { temp: 20, fire: false, asleep: false, busy: false, dark: false, inside: true, company: 2 };
    expect(FAKT(a, 'dach')).toBe(String(safeTarget(baza)));
    expect(FAKT(a, 'dwor')).toBe(String(safeTarget({ ...baza, dark: true, inside: false, company: 0 })));
    expect(FAKT(a, 'warta')).toBe(String(safeTarget({ ...baza, dark: true, fire: true, guard: true })));
    const dzien = { ...baza, inside: false };
    expect(FAKT(a, 'napad')).toContain(signed(safeTarget({ ...dzien, raided: true }) - safeTarget(dzien), 0));
    expect(FAKT(a, 'obcy')).toContain(signed(safeTarget({ ...dzien, strangers: 1 }) - safeTarget(dzien), 0));
  });

  it('kolor paska na każdej potrzebie to progi z `needLevel`', () => {
    const od = (ok: (v: number) => boolean): number => [...Array(101).keys()].find(ok) ?? 100;
    const zle = od((v) => needLevel(v) !== 'bad');
    const uwaga = od((v) => needLevel(v) === 'ok');
    for (const k of ['food', 'warm', 'rest', 'health', 'safe', 'mood']) {
      expect(FAKT(ART(`potrzeba:${k}`), 'pasek'), k).toBe(`czerwony poniżej ${zle}, żółty poniżej ${uwaga}`);
    }
  });
});

describe('cechy i umiejętności: skutki z funkcji zarządu', () => {
  const ratio = (cecha: string): number =>
    tempoOsoby({ skills: {}, traits: [cecha] }, 'bud') / tempoOsoby({ skills: {}, traits: [] }, 'bud');
  const procent = (r: number): string => `${r >= 1 ? '+' : '−'}${Math.round(Math.abs(r - 1) * 100)}%`;

  it('tempo badań: Pracowity, Leniwy, Mistrz Excela', () => {
    const cechy = ART('ludzie:cechy');
    for (const t of ['pracowity', 'leniwy', 'excel']) expect(FAKT(cechy, `cecha-${t}`), t).toContain(procent(ratio(t)));
  });

  it('dzienny dryf: Lubiany, Kłótliwy, Optymista', () => {
    const cechy = ART('ludzie:cechy');
    const dryf = (traits: string[]) =>
      dailyDrift(sondaStan(), sondaWejscie({ people: [sondaOsoba({ traits })], burned: [] }));
    const baza = dryf([]);
    const d = (t: string, i: 0 | 1) => Math.round((dryf([t])[i] - baza[i]) * 100) / 100;
    expect(FAKT(cechy, 'cecha-lubiany')).toContain(`zaufanie ${signed(d('lubiany', 0))} dziennie`);
    expect(FAKT(cechy, 'cecha-klotliwy')).toBe(`wkurzenie ${signed(d('klotliwy', 1))} dziennie`);
    expect(FAKT(cechy, 'cecha-optymista')).toBe(`wkurzenie ${signed(d('optymista', 1))} dziennie`);
  });

  it('Twardy i Hipochondryk nie mają skutku w kodzie gry, więc wiki mówi, że niczego nie zmieniają', () => {
    const cechy = ART('ludzie:cechy');
    expect(FAKT(cechy, 'cecha-twardy')).toBe('na razie bez wpływu na liczby');
    expect(FAKT(cechy, 'cecha-hipochondryk')).toBe('na razie bez wpływu na liczby');
    // gdyby ktoś dopisał skutek, ten test każe poprawić artykuł
    const kod = [
      'src/sim/sim.ts',
      'src/gov/noc.ts',
      'src/gov/uchwaly.ts',
      'src/sim/badania.ts',
      'src/sim/needs.ts',
      'src/gov/zarzad.ts',
    ]
      .map(zrodlo)
      .join(' ');
    expect(kod).not.toMatch(/'twardy'|'hipochondryk'/);
  });

  it('każda dziedzina wymienia rodzaje pracy, które ją czytają, a Medycyna amputację i Obrona wartę', () => {
    const u = ART('ludzie:umiejetnosci');
    for (const d of Object.keys(DOM)) {
      for (const r of RODZAJE) {
        const czyta = UMIEJETNOSCI[r] !== 'badanie' && (UMIEJETNOSCI[r] as readonly string[]).includes(d);
        // rodzaje bez przyspieszenia (Ogień) są w „domyślny priorytet”, ale też wymienione
        if (czyta) expect(FAKT(u, `umiejetnosc-${d}`), `${d} / ${r}`).toContain(rodzajNazwa(r));
      }
    }
    expect(FAKT(u, 'umiejetnosc-med')).toContain('amputacja');
    expect(FAKT(u, 'umiejetnosc-obrona')).toContain('warta');
    expect(FAKT(u, 'umiejetnosc-obrona')).toContain(
      `+${Math.round((hitChance(WEAPONS.noz, 1, 100, false) - hitChance(WEAPONS.noz, 0, 100, false)) * 100)} pkt`,
    );
  });
});

describe('chwilowe nastroje: tabela wpisana ręcznie jest w kodzie gry', () => {
  /** Fragment kodu, w którym gra dodaje dany nastrój: powód, wartość i czas stoją w nim w tej samej postaci co w tabeli wiki.
      Nastroje z eksportowanymi stałymi (wieści, nowa osoba) sprawdza test niżej. */
  const KOD: Record<string, [string, string]> = {
    'Ciepły posiłek': ['src/sim/sim.ts', "this.addMood(p, 'Ciepły posiłek', 4, 4 * TICKS_PER_HOUR)"],
    'Wspólny posiłek': ['src/sim/sim.ts', "this.addMood(p, 'Wspólny posiłek', 5, 12 * TICKS_PER_HOUR)"],
    'Przegoniliśmy szabrowników': [
      'src/sim/sim.ts',
      "this.addMood(p, 'Przegoniliśmy szabrowników', 6, 12 * TICKS_PER_HOUR)",
    ],
    'Uratowaliśmy go': ['src/sim/sim.ts', "this.addMood(p, 'Uratowaliśmy go', 6, TICKS_PER_DAY)"],
    'Wróciłem z łupem': ['src/gov/noc.ts', "g(p, 'Wróciłem z łupem', 'Wróciłam z łupem'), d: 4, hours: 12"],
    'Zimne z puszki': ['src/sim/sim.ts', "this.addMood(p, 'Zimne z puszki', -3, 4 * TICKS_PER_HOUR)"],
    'Głodowe racje': ['src/sim/sim.ts', "this.addMood(p, 'Głodowe racje', -3, 8 * TICKS_PER_HOUR)"],
    'Palimy meble': ['src/sim/sim.ts', 'Math.round((mine ? -6 : -10) * k), (mine ? 12 : 24) * TICKS_PER_HOUR'],
    'Ledwo uciekłem': ['src/gov/noc.ts', "g(p, 'Ledwo uciekłem', 'Ledwo uciekłam'), d: -6, hours: 12"],
    'Szabrownicy weszli na podwórko': [
      'src/sim/sim.ts',
      "this.addMood(p, 'Szabrownicy weszli na podwórko', -8, 12 * TICKS_PER_HOUR)",
    ],
    'Śmierć: …': ['src/sim/sim.ts', `this.addMood(q, \`Śmierć: \${first}\`, -10, TICKS_PER_DAY)`],
    Amputacja: ['src/sim/sim.ts', "this.addMood(q, 'Amputacja', -12, TICKS_PER_DAY)"],
    'Gorączka po ugryzieniu': [
      'src/sim/sim.ts',
      'p.moods.push({ why: FEVER_MOOD, d: -15, until: st.tick + FEVER_TICKS })',
    ],
  };

  it('każdy wpis tabeli z liczbą wpisaną ręcznie ma w kodzie ten sam powód, wartość i czas', () => {
    for (const n of NASTROJE) {
      const wpis = KOD[n.why];
      if (!wpis) continue;
      const [plik, fragment] = wpis;
      expect(zrodlo(plik), n.why).toContain(fragment);
      expect(fragment, n.why).toContain(String(n.d));
      const godziny = n.ticks / TICKS_PER_HOUR;
      const czas =
        n.ticks === TICKS_PER_DAY
          ? 'TICKS_PER_DAY'
          : n.ticks === FEVER_TICKS
            ? 'FEVER_TICKS'
            : [`${godziny} * TICKS_PER_HOUR`, `hours: ${godziny}`, `? ${godziny} :`];
      expect(
        [czas].flat().some((c) => fragment.includes(c)),
        `${n.why}: czas ${godziny} h`,
      ).toBe(true);
    }
  });

  it('wartości z eksportowanych stałych i spanie na podłodze są w tabeli', () => {
    expect(NASTROJE.find((n) => n.why === 'Spanie na podłodze')?.d).toBe(FLOOR_MOOD);
    expect(zrodlo('src/sim/sim.ts')).toContain(
      "this.addMood(p, 'Spanie na podłodze', FLOOR_MOOD, 16 * TICKS_PER_HOUR)",
    );
    expect(NASTROJE.find((n) => n.why === 'Spanie na podłodze')?.ticks).toBe(16 * TICKS_PER_HOUR);
    for (const n of NASTROJE) expect(Number.isFinite(n.d) && n.ticks > 0, n.why).toBe(true);
  });
});

describe('liczby ze stałych w kodzie zarządu i symulacji: przypięcia', () => {
  it('kary za śmierć: zaufanie i wkurzenie', () => {
    const z = zrodlo('src/gov/zarzad.ts');
    expect(z).toContain(`if (d.id) mood(st, ${SMIERC_ZARZAD[0]}, ${SMIERC_ZARZAD[1]});`);
    expect(z).toContain(`else mood(st, ${SMIERC_MIESZKANIEC[0]}, ${SMIERC_MIESZKANIEC[1]});`);
    expect(zrodlo('src/sim/sim.ts')).toContain(`\`Śmierć: \${first}\`, ${SMIERC_NASTROJ}, TICKS_PER_DAY`);
  });

  it('ludzie giną tylko od ran, gorączki i amputacji, a zdrowie spadające do zera od zimna i głodu nikogo nie zabija', () => {
    const sim = zrodlo('src/sim/sim.ts');
    const przyczyny = new Set([...sim.matchAll(/this\.die\(\w+, '([^']+)'/g)].map((m) => m[1]));
    expect([...przyczyny].sort()).toEqual(['amputacja', 'gorączka', 'rany']);
    expect(sim).toContain("cause: 'rany' | 'gorączka' | 'amputacja'");
    expect(sim.match(/health <= 0/g)?.length).toBe(1);
  });

  it('próg rany na liście ludzi', () => {
    const osoba = (health: number) =>
      ({
        needs: { food: 100, warm: 100, rest: 100, health, safe: 100, mood: 100 },
        bite: null,
        asleep: false,
        away: false,
        job: null,
      }) as never;
    expect(znaczniki(osoba(ZNACZNIK_RANY - 1)).some((z) => z.rodzaj === 'rana')).toBe(true);
    expect(znaczniki(osoba(ZNACZNIK_RANY)).some((z) => z.rodzaj === 'rana')).toBe(false);
  });

  it('amputacja: szansa, lek, sufit; rana po niej i kikut', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain(`let chance = ${AMPUTACJA.baza} + ${AMPUTACJA.poziom} * (who?.skills.med ?? 0);`);
    expect(sim).toContain(`if (this.takeMed()) chance += ${AMPUTACJA.lek};`);
    expect(sim).toContain(`Math.min(${AMPUTACJA.max}, chance)`);
    expect(sim).toContain(`q.needs.health = Math.max(10, q.needs.health - ${RANA_AMPUTACJA});`);
    expect(zrodlo('src/sim/bron.ts')).toContain(`if (maimed) h -= ${KIKUT_CELNOSC / 100};`);
  });

  it('rany na wyprawie i przy wtargnięciu szabrowników', () => {
    const noc = zrodlo('src/gov/noc.ts');
    expect(noc).toContain(`const d = -rint(st, ${RANA_WYPRAWA[0]}, ${RANA_WYPRAWA[1]});`);
    expect(noc).toContain(`addNeeds(fx, v.id, { health: -${RANA_NAPAD} });`);
  });

  it('plan dnia mieszkańców: podwórko za dnia, ognisko wieczorem, dom w nocy', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain('if (this.residentDay()) kind = STAY_YARD;');
    expect(sim).toContain('else if (h >= 18 && h < 20 && this.campfire()) kind = STAY_FIRE;');
  });

  it('sen i łóżka: miejsca do spania i zmęczenie przy pracy', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain("const BEDS = new Set(['lozko', 'wersalka', 'lozka_pietrowe']);");
    expect(sim).toContain("t.kind === 'lozka_pietrowe' ? 2 : 1");
    expect(sim).toContain(
      "busy: (!!j && ((j.t === 'chop' && j.phase === 1) || (j.t === 'patch' && j.phase === 2))) || p.carry > 0,",
    );
  });

  it('strach po wtargnięciu szabrowników trwa do rana (12 godzin)', () => {
    expect(zrodlo('src/sim/sim.ts')).toContain("r.outcome === 'wtargnięcie' && st.tick < r.at + 12 * TICKS_PER_HOUR");
  });
});

describe('broń: fakty z WEAPONS', () => {
  const m = (v: number): string => `${liczba(v, 1, 'pl')} m`;
  const obrazenia = (n: number): string => {
    const d = n % 10;
    const t = n % 100;
    return n === 1 ? 'obrażenie' : d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'obrażenia' : 'obrażeń';
  };

  it('każda broń ma fakty zgodne z tabelą', () => {
    for (const id of KOLEJNOSC_BRONI) {
      const w = WEAPONS[id];
      const a = ART(`bron:${id}`);
      expect(FAKT(a, 'zasieg'), id).toBe(m(w.reach));
      expect(FAKT(a, 'obrazenia'), id).toBe(String(w.dmg));
      expect(FAKT(a, 'odstep'), id).toBe(`${liczba(w.cd / TICKS_PER_SECOND, 1, 'pl')} s`);
      expect(FAKT(a, 'halas'), id).toBe(w.noise ? `${w.noise} m` : 'cicho');
      expect(FAKT(a, 'celnosc'), id).toContain(`${Math.round(w.hit * 100)}%`);
      expect(FAKT(a, 'celnosc'), id).toContain(`${Math.round(hitChance(w, 4, 100, false) * 100)}%`);
      expect(FAKT(a, 'siatka'), id).toBe(w.fence ? 'sięga' : 'nie sięga');
      expect(FAKT(a, 'amunicja'), id).toBe(
        w.ammo ? { naboje: 'naboje', loftki: 'loftki', belty: 'bełty' }[w.ammo] : 'bez amunicji',
      );
      expect(FAKT(a, 'szwendacz'), id).toBe(`${Math.ceil(ZOMBIE_HP / w.dmg)} (${ZOMBIE_HP} życia)`);
      expect(FAKT(a, 'szabrownik'), id).toBe(`${Math.ceil(STRANGER_HP / w.dmg)} (${STRANGER_HP} życia)`);
      expect(a.zdania[0], id).toContain(`${w.dmg} ${obrazenia(w.dmg)}`);
    }
  });

  it('przegląd broni wymienia każdą broń z jej danymi', () => {
    const a = ART('ludzie:bron');
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const w = WEAPONS[id];
      expect(FAKT(a, `bron-${id}`), id).toContain(`${w.dmg} ${obrazenia(w.dmg)}`);
      expect(KOLEJNOSC_BRONI, id).toContain(id);
    }
    expect(KOLEJNOSC_BRONI.length).toBe(Object.keys(WEAPONS).length);
  });

  it('walka i alarm: progi zdrowia, tłum i pula znalezisk stoją w kodzie', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain(`this.armed(p).id !== 'piesci' && (p.needs?.health ?? 0) > ${WALKA.staje}`);
    expect(sim).toContain(
      `(p.needs?.health ?? 100) >= (j.t === 'guard' ? ${WALKA.wycofanieWarta} : ${WALKA.wycofanieWalka}) && crowd < ${WALKA.tlum}`,
    );
    expect(sim).toContain(`(p.needs?.health ?? 0) > ${WALKA.alarm} && p.job?.t !== 'guard'`);
    const pula = (l: readonly string[]) => `[${l.map((x) => `'${x}'`).join(', ')}]`;
    expect(zrodlo('src/gov/noc.ts')).toContain(
      `const pool = zombie ? ${pula(ZNALEZISKA_BRONI.zombie)} : ${pula(ZNALEZISKA_BRONI.zwykly)};`,
    );
  });

  it('łom, kusza i broń palna bez amunicji: wpisy w kodzie', () => {
    const sim = zrodlo('src/sim/sim.ts');
    expect(sim).toContain("mark.w = (mark.w ?? 0) + (p.weapon === 'lom' ? 2 : 1);");
    expect(sim).toContain("(zewn ? WYWAZ_KLATKA_TICKS : WYWAZ_MIESZKANIE_TICKS) * (p.weapon === 'lom' ? 0.5 : 1)");
    expect(sim).toContain("if (w.ammo === 'belty' && nextRandom(st.rng) < 0.5) st.store.ammo!.belty++;");
    expect(sim).toContain('if (w.ammo && (this.st.store.ammo?.[w.ammo] ?? 0) <= 0) return WEAPONS.piesci;');
  });

  it('napisy przycisków walki: „Atakuj …”, „Do broni!”, „Odwołaj”, „Zmień” i ich angielskie odpowiedniki', () => {
    const rozkazy = zrodlo('src/sim/orders.ts');
    expect(rozkazy).toContain("L('Atakuj szwendacza', 'Attack the shambler')");
    expect(rozkazy).toContain("L('Atakuj szabrownika', 'Attack the looter')");
    expect(zrodlo('src/ui/jezyk.ts')).toContain("tx('Do broni!', 'To arms!')");
    expect(zrodlo('src/content/napisy-zombie.ts')).toContain("ALARM_OFF = 'Odwołaj'");
    expect(zrodlo('src/content/napisy-zombie.en.ts')).toContain("ALARM_OFF_EN = 'Stand down'");
    expect(zrodlo('src/ui/karta.ts')).toContain("L('Zmień', 'Swap')");
    expect(zrodlo('src/ui/karta.ts')).toContain("L('Amputować', 'Amputate')");
  });
});

describe('start i zgon: pozostałe liczby wiki', () => {
  it('łączny czas gorączki, okno i szansa ugryzienia są z eksportów, a wiki je podaje', () => {
    const a = ART('ludzie:rany');
    expect(FAKT(a, 'goraczka')).toBe(`${FEVER_TICKS / TICKS_PER_HOUR}\u00a0h`);
    expect(FAKT(a, 'wyprawa')).toBe(`od −${RANA_WYPRAWA[0]} do −${RANA_WYPRAWA[1]}`);
    expect(FAKT(a, 'smierc')).toBe(signed(SMIERC_NASTROJ, 0));
  });
});
