/* Wiki, kategoria „Tryb zombie” (src/ui/wiki-zombie.ts): pokrycie (artykuły z identyfikatorami, na które wskazują czipy
   paska i inne artykuły, każda broń i każdy wpis tabeli hałasu przy drzwiach w faktach), fakty równe tabelom i stałym gry
   (szwendacze, stado, napór na siatkę, ugryzienie, wstawanie, broń), czas złamania kafelka zgodny z `pushOf`, napisy z gry
   (polecenia menu, przyciski, czipy), zachowania, na których stoją zdania (siatka i brama na starcie, próg dzid, broń na
   start), uwaga o trybie gry, język angielski, wariant domu i odnośniki. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { postsOf } from '../../src/gov/noc.ts';
import { START_KIT, WEAPONS, type WeaponId } from '../../src/sim/bron.ts';
import { initFence, PATCH_HP, REINFORCED_HP } from '../../src/sim/perimeter.ts';
import { DZIDY_ZOMBIE, PROGI_DOMYSLNE, progi } from '../../src/sim/praca.ts';
import { HALAS } from '../../src/sim/sasiedzi.ts';
import {
  AMPUTATE_TICKS,
  AMPUTATE_WINDOW,
  BARYKADA_HP,
  BITE_INFECT,
  BRACE_COST,
  BRACE_HP,
  CAMPFIRE_LIGHT,
  FEVER_TICKS,
  GUARD_UNTIL,
  LAMP_REACH,
  LIMB,
  PATCH_COST,
  RISE_TICKS,
  type SimState,
  SPEAR_BOARDS,
  SPEAR_SCRAP,
  WIEZA_ZASIEG,
  ZASIEKI_HP,
} from '../../src/sim/sim.ts';
import { WRECK_SEARCH_NOISE, WRECK_STRIP_NOISE } from '../../src/sim/surowce.ts';
import {
  ambientCount,
  BITE_DMG,
  BITE_HIT,
  BITE_HIT_FIGHTING,
  BITE_REACH,
  CHASE_SPEED,
  CROWD_RADIUS,
  DISPERSE,
  FAR,
  FENCE_BEARS,
  FENCE_FLOOR,
  HORDE_FROM,
  HORDE_HOURS,
  hordeSize,
  MAX_ZOMBIES,
  NEAR,
  pushOf,
  RING_FROM,
  RING_TO,
  SIGHT_DAY,
  SIGHT_NIGHT,
  ZOMBIE_HP,
  ZOMBIE_SPEED,
} from '../../src/sim/zombie.ts';
import { SZCZEK_HALAS } from '../../src/sim/zwierzeta.ts';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { artykul, CZIPY, maArtykul, rejestr, szukaj, tytulArtykulu } from '../../src/ui/wiki.ts';
import { czasDoZbicia, idKlucza, trafienia } from '../../src/ui/wiki-zombie.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld } from './miejsce-pomoc.ts';
import { kontrolaOdnosnikow, kontrolaTresci } from './wiki-kontrola.ts';
import { kontekst, PRZYPADKI, tekstArtykulu } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const moje = rejestr().filter((d) => d.kat === 'zombie');
const BRONIE = Object.keys(WEAPONS) as WeaponId[];
/** twarda spacja między liczbą a jednostką (godzina, minuta, metr), jak w wiki-slowa.ts */
const NB = '\u00A0';
const zrodlo = (plik: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '../..', plik), 'utf8');

/** wartość faktu artykułu w kontekście zombie (blok, mysz) w bieżącym języku */
const fakt = (id: string, f: string, zombie = true): string | undefined =>
  artykul(id, kontekst('blok', false, zombie))!.fakty.find((x) => x.id === f)?.v;

describe('pokrycie', () => {
  it('artykuły kategorii i identyfikatory, na które wskazują inne miejsca', () => {
    expect(moje.map((d) => d.id).sort()).toEqual(
      [
        'zombie:tryb',
        'zombie:szwendacze',
        'zombie:stado',
        'zombie:halas',
        'zombie:siatka',
        'zombie:ugryzienie',
        'zombie:wstawanie',
        'zombie:dzida',
        'zombie:warta',
      ].sort(),
    );
    for (const id of ['zombie:halas', 'zombie:siatka', 'zombie:szwendacze']) expect(maArtykul(id), id).toBe(true);
    // czipy paska „siatka” i „stado” otwierają artykuły z tej kategorii
    for (const [czip, id] of Object.entries(CZIPY))
      if (id.startsWith('zombie:')) expect(maArtykul(id), czip).toBe(true);
    expect(CZIPY.sFence).toBe('zombie:siatka');
    expect(CZIPY.sHorde).toBe('zombie:stado');
  });

  it('każda broń z WEAPONS ma wiersz w faktach (trafienia, przejście przez siatkę, hałas)', () => {
    for (const id of BRONIE) {
      expect(fakt('zombie:szwendacze', `trafienia-${id}`), id).toBeDefined();
      expect(fakt('zombie:warta', `siatka-${id}`), id).toBeDefined();
      if (WEAPONS[id].noise > 0) expect(fakt('zombie:halas', `halas-${id}`), id).toBeDefined();
      else expect(fakt('zombie:halas', `halas-${id}`), id).toBeUndefined();
    }
  });

  it('każdy wpis tabeli hałasu przy drzwiach (HALAS) ma wiersz w artykule o hałasie', () => {
    for (const klucz of Object.keys(HALAS))
      expect(fakt('zombie:halas', `drzwi-${idKlucza(klucz)}`), klucz).toBeDefined();
  });
});

describe('fakty zgodne z tabelami gry', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`szwendacze, stado, hałas, siatka, ugryzienie, wstawanie: ${lang}`, () => {
      ustawJezyk(lang);
      const m = (n: number) => (lang === 'pl' ? `${String(n).replace('.', ',')}${NB}m` : `${n}${NB}m`);
      const pc = (v: number) => `${Math.round(v * 100)}%`;
      expect(fakt('zombie:szwendacze', 'zdrowie')).toBe(`${ZOMBIE_HP}`);
      expect(fakt('zombie:szwendacze', 'predkosc')).toBe(pc(ZOMBIE_SPEED));
      expect(fakt('zombie:szwendacze', 'poscig')).toBe(pc(CHASE_SPEED));
      expect(fakt('zombie:szwendacze', 'wzrok-dzien')).toBe(m(SIGHT_DAY));
      expect(fakt('zombie:szwendacze', 'wzrok-noc')).toBe(m(SIGHT_NIGHT));
      expect(fakt('zombie:szwendacze', 'pas')).toBe(`${FAR}–${m(NEAR)}`);
      expect(fakt('zombie:szwendacze', 'maks')).toBe(`${MAX_ZOMBIES}`);
      for (const d of [1, 5, 10]) expect(fakt('zombie:szwendacze', `dzien-${d}`)).toBe(`${ambientCount(d)}`);
      for (const id of BRONIE)
        expect(fakt('zombie:szwendacze', `trafienia-${id}`), id).toBe(`${Math.ceil(ZOMBIE_HP / WEAPONS[id].dmg)}`);

      expect(fakt('zombie:stado', 'start')).toBe(`${HORDE_FROM}:00`);
      expect(fakt('zombie:stado', 'rozchodzi')).toBe(`${DISPERSE}:00`);
      expect(fakt('zombie:stado', 'pas')).toContain(`${RING_FROM}–${RING_TO}`);
      expect(fakt('zombie:stado', 'trwa')).toContain(`${HORDE_HOURS}`);
      for (const n of [1, 2, 3, 5, 10]) expect(fakt('zombie:stado', `noc-${n}`)).toBe(`${hordeSize(n)}`);
      expect(fakt('zombie:stado', 'maks')).toBe(`${MAX_ZOMBIES}`);

      for (const id of BRONIE.filter((x) => WEAPONS[x].noise > 0))
        expect(fakt('zombie:halas', `halas-${id}`), id).toBe(m(WEAPONS[id].noise));
      expect(fakt('zombie:halas', 'wrak-szukanie')).toBe(m(WRECK_SEARCH_NOISE));
      expect(fakt('zombie:halas', 'wrak-rozbiorka')).toBe(m(WRECK_STRIP_NOISE));
      expect(fakt('zombie:halas', 'pies')).toBe(m(SZCZEK_HALAS));
      for (const [klucz, v] of Object.entries(HALAS))
        expect(fakt('zombie:halas', `drzwi-${idKlucza(klucz)}`), klucz).toBe(m(v));
      expect(fakt('zombie:halas', 'lampa')).toBe(m(LAMP_REACH));
      expect(fakt('zombie:halas', 'lampa-wieza')).toBe(m(LAMP_REACH * WIEZA_ZASIEG));
      expect(fakt('zombie:halas', 'ognisko')).toBe(m(CAMPFIRE_LIGHT));

      expect(fakt('zombie:siatka', 'start')).toBe(`${REINFORCED_HP}`);
      expect(fakt('zombie:siatka', 'dol')).toBe(`${FENCE_FLOOR}`);
      expect(fakt('zombie:siatka', 'prog')).toContain(`${FENCE_BEARS}`);
      expect(fakt('zombie:siatka', 'promien')).toContain(`${CROWD_RADIUS}`);
      expect(fakt('zombie:siatka', 'zasieki')).toBe(`${ZASIEKI_HP}`);
      expect(fakt('zombie:siatka', 'barykada')).toBe(`${BARYKADA_HP}`);
      expect(fakt('zombie:siatka', 'wzmocnienie')).toContain(`${BRACE_COST}`);
      expect(fakt('zombie:siatka', 'wzmocnienie')).toContain(`${BRACE_HP}`);
      expect(fakt('zombie:siatka', 'lata')).toContain(`${PATCH_COST}`);

      expect(fakt('zombie:ugryzienie', 'zasieg')).toBe(m(BITE_REACH));
      expect(fakt('zombie:ugryzienie', 'trafienie')).toBe(pc(BITE_HIT));
      expect(fakt('zombie:ugryzienie', 'trafienie-walka')).toBe(pc(BITE_HIT_FIGHTING));
      expect(fakt('zombie:ugryzienie', 'obrazenia')).toBe(`${BITE_DMG}`);
      expect(fakt('zombie:ugryzienie', 'zakazenie')).toBe(pc(BITE_INFECT));
      expect(fakt('zombie:ugryzienie', 'konczyna')).toBe(pc(LIMB));
      expect(fakt('zombie:ugryzienie', 'goraczka')).toBe(`${FEVER_TICKS / 800}${NB}h`);
      expect(fakt('zombie:ugryzienie', 'okno')).toBe(`${AMPUTATE_WINDOW / 800}${NB}h`);
      expect(fakt('zombie:ugryzienie', 'zabieg')).toBe(`${(AMPUTATE_TICKS / 800) * 60}${NB}min`);
      expect(fakt('zombie:wstawanie', 'wstaje')).toBe(`${RISE_TICKS / 800}${NB}h`);
      expect(fakt('zombie:wstawanie', 'goraczka')).toBe(`${FEVER_TICKS / 800}${NB}h`);

      const d = WEAPONS.dzida;
      expect(fakt('zombie:dzida', 'zasieg')).toBe(m(d.reach));
      expect(fakt('zombie:dzida', 'obrazenia')).toBe(`${d.dmg}`);
      expect(fakt('zombie:dzida', 'trafienie')).toBe(pc(d.hit));
      expect(fakt('zombie:dzida', 'halas')).toBe(m(d.noise));
      expect(fakt('zombie:dzida', 'prog')).toBe(`${DZIDY_ZOMBIE}`);
      expect(fakt('zombie:dzida', 'prog-zwykly')).toBe(`${PROGI_DOMYSLNE.dzidy}`);
      expect(fakt('zombie:dzida', 'koszt')).toContain(`${SPEAR_BOARDS}`);
      expect(fakt('zombie:dzida', 'koszt')).toContain(`${SPEAR_SCRAP}`);

      expect(fakt('zombie:warta', 'do')).toBe(`${GUARD_UNTIL}:00`);
      for (const id of BRONIE)
        expect(fakt('zombie:warta', `siatka-${id}`), id).toBe(
          WEAPONS[id].fence ? (lang === 'pl' ? 'tak' : 'yes') : lang === 'pl' ? 'nie' : 'no',
        );
    });

  it('gołe ręce nie sięgają przez siatkę, dzida i broń strzelająca tak', () => {
    expect(WEAPONS.piesci.fence).toBe(false);
    for (const id of ['dzida', 'kusza', 'rewolwer', 'strzelba'] as const) expect(WEAPONS[id].fence, id).toBe(true);
    for (const id of ['noz', 'siekiera', 'lom', 'kij'] as const) expect(WEAPONS[id].fence, id).toBe(false);
  });

  it('zdania o broni, która sięga przez siatkę, wymieniają dokładnie broń z tabeli', () => {
    const a = artykul('zombie:warta', kontekst('blok'))!.zdania[2];
    for (const id of BRONIE.filter((x) => x !== 'piesci')) expect(a, id).toContain(WEAPONS[id].name);
    expect(a.indexOf('dzida')).toBeLessThan(a.indexOf(' a '));
    expect(a.indexOf('nóż')).toBeGreaterThan(a.indexOf(' a '));
  });

  it('trafienia potrzebne do zabicia szwendacza: nóż i dzida dwa, strzał jeden', () => {
    expect(trafienia('noz')).toBe(2);
    expect(trafienia('dzida')).toBe(2);
    for (const id of ['kusza', 'rewolwer', 'strzelba'] as const) expect(trafienia(id), id).toBe(1);
  });
});

describe('czas złamania świeżego kafelka siatki', () => {
  /** krok po kroku tak, jak liczy to symulacja: każdy z `n` napierających zdejmuje `pushOf(n, hp)` na krok */
  function kroki(n: number): number {
    let hp = REINFORCED_HP;
    let t = 0;
    while (hp > 0 && t < 100_000) {
      hp -= n * pushOf(n, hp);
      t++;
    }
    return t;
  }

  it('do progu nigdy, powyżej progu zgodnie z pushOf', () => {
    expect(czasDoZbicia(FENCE_BEARS)).toBeNull();
    expect(kroki(FENCE_BEARS)).toBe(100_000);
    for (const n of [FENCE_BEARS + 1, FENCE_BEARS + 2, 22, 30, 50])
      expect(Math.abs(czasDoZbicia(n)! - kroki(n)), `${n} napierających`).toBeLessThan(1.5);
  });

  it('kolejne tłumy łamią kafelek coraz szybciej', () => {
    const t = [17, 18, 22, 30].map((n) => czasDoZbicia(n)!);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeLessThan(t[i - 1]);
  });

  it('fakty w artykule: 16 napierających nigdy, reszta w godzinach albo minutach', () => {
    expect(fakt('zombie:siatka', `zbicie-${FENCE_BEARS}`)).toBe('nigdy');
    expect(fakt('zombie:siatka', `zbicie-${FENCE_BEARS + 2}`)).toMatch(/h|min/);
    ustawJezyk('en');
    expect(fakt('zombie:siatka', `zbicie-${FENCE_BEARS}`)).toBe('never');
  });
});

describe('napisy z gry', () => {
  /** etykieta polecenia, przycisku albo czipa, którą artykuły przytaczają, jest w kodzie gry po polsku i po angielsku */
  const wGrze = (plik: string, pl: string, en: string) => {
    const kod = zrodlo(plik);
    expect(kod, `${pl} w ${plik}`).toContain(`'${pl}'`);
    expect(kod, `${en} w ${plik}`).toContain(`'${en}'`);
  };

  it('polecenia z menu przy rzeczach i szwendaczach', () => {
    wGrze('src/sim/orders.ts', 'Atakuj szwendacza', 'Attack the shambler');
    wGrze('src/sim/orders.ts', 'Wzmocnić siatkę', 'Shore up the fence');
    wGrze('src/sim/orders.ts', 'Załatać dziurę', 'Patch the hole');
    wGrze('src/sim/orders.ts', 'Pilnować przy siatce', 'Keep watch at the fence');
    wGrze('src/sim/orders.ts', 'Zrobić dzidę', 'Make a spear');
    wGrze('src/sim/orders.ts', 'Dobić', 'Finish off the body');
    wGrze('src/ui/karta.ts', 'Amputować', 'Amputate');
  });

  it('przycisk „Do broni!” i czipy „siatka” i „stado” w górnym pasku', () => {
    const wpis = (sel: string) => STATYCZNE.find((x) => x.sel === sel);
    expect(wpis('#btnAlarm')?.tekst?.pl).toBe('Do broni!');
    expect(wpis('#btnAlarm')?.tekst?.en).toBe('To arms!');
    expect(JSON.stringify(STATYCZNE.filter((x) => x.sel.includes('sFence')))).toContain('siatka');
    expect(JSON.stringify(STATYCZNE.filter((x) => x.sel.includes('sHorde')))).toContain('stado');
    const pl = artykul('zombie:stado', kontekst('blok'))!.zdania.join(' ');
    expect(pl).toContain('„stado”');
    ustawJezyk('en');
    expect(artykul('zombie:stado', kontekst('blok'))!.zdania.join(' ')).toContain('“herd”');
  });

  it('karta nocy w trybie zombie ma posterunek „przy siatce” jako pierwszy, w zwykłej grze go nie ma', () => {
    const wejscie = new Atrapa(1).input();
    const posty = postsOf(wejscie, true);
    expect(posty[0].key).toBe('siatka');
    expect(tr(posty[0].name)).toBe('przy siatce');
    expect(postsOf(wejscie, false).some((p) => p.key === 'siatka')).toBe(false);
    expect(tekstArtykulu(artykul('zombie:warta', kontekst('blok'))!)).toContain('„przy siatce”');
  });

  it('opis w „Jak grać” i artykuł mówią o tych samych liczbach progu naporu', () => {
    const okna = zrodlo('src/ui/okna.ts');
    // w kodzie okna to napis z podstawieniem stałej, więc szukamy jego tekstu literalnie
    expect(okna).toContain(['$', '{FENCE_BEARS} napierających w jednym miejscu'].join(''));
    expect(artykul('zombie:siatka', kontekst('blok'))!.zdania[0]).toContain(`${FENCE_BEARS}`);
  });
});

describe('zachowania, na których stoją artykuły', () => {
  it('siatka na start: w trybie zombie cała, wzmocniona, brama zamknięta; w zwykłej grze stara, brama otwarta', () => {
    const { w } = demoWorld('przymorze');
    const z = initFence(w, 'zombie')!;
    expect(z.hp.every((v) => v === REINFORCED_HP)).toBe(true);
    expect(z.holes.every((h) => h.patch === REINFORCED_HP)).toBe(true);
    expect(z.gateOpen).toBe(false);
    const n = initFence(w, 'zwykly')!;
    expect(n.gateOpen).toBe(true);
    expect(n.holes.some((h) => h.patch === 0)).toBe(true);
    expect(PATCH_HP).toBeLessThan(REINFORCED_HP);
  });

  it('broń na start w trybie zombie: kolejno rewolwer, dzida, łom, nóż; w magazynie dzida i kij; 12 naboi', () => {
    expect(START_KIT.zombie.core).toEqual(['rewolwer', 'dzida', 'lom', 'noz']);
    expect(START_KIT.zombie.store).toEqual(['dzida', 'kij']);
    expect(START_KIT.zombie.ammo.naboje).toBe(12);
    const a = artykul('zombie:tryb', kontekst('blok'))!;
    expect(a.zdania.join(' ')).toContain('rewolwer, dzidę, łom i nóż');
    expect(a.fakty.find((f) => f.id === 'amunicja-naboje')?.v).toBe('12 naboi');
    ustawJezyk('en');
    const en = artykul('zombie:tryb', kontekst('blok'))!;
    expect(en.zdania.join(' ')).toContain('a revolver, a spear, a crowbar and a knife');
    expect(en.fakty.find((f) => f.id === 'amunicja-naboje')?.v).toBe('12 rounds');
  });

  it('próg dzid: w trybie zombie DZIDY_ZOMBIE, w zwykłej grze zero (warsztat ich sam nie robi)', () => {
    expect(progi({ mode: 'zombie' } as SimState).dzidy).toBe(DZIDY_ZOMBIE);
    expect(progi({ mode: 'zwykly' } as SimState).dzidy).toBe(PROGI_DOMYSLNE.dzidy);
    expect(PROGI_DOMYSLNE.dzidy).toBe(0);
  });

  it('tryb zombie nie ma napadów szabrowników: w karcie nocy stado zawsze przychodzi', () => {
    const noc = zrodlo('src/gov/noc.ts');
    expect(noc).toContain('const chance = zombie ? 0.9 : raidChance(st, i)');
    expect(noc).toContain('W zombie napadów nie ma');
  });

  it('wzmocnienie siatki sięga 100, a zasieki i barykada mają więcej wytrzymałości niż świeża łata', () => {
    expect(BRACE_HP).toBe(50);
    expect(ZASIEKI_HP).toBeGreaterThanOrEqual(REINFORCED_HP);
    expect(BARYKADA_HP).toBeGreaterThan(ZASIEKI_HP);
  });
});

describe('język i słownik miejsca', () => {
  for (const p of PRZYPADKI) it(`artykuły trybu zombie: ${p.opis}`, () => kontrolaTresci(p, 'zombie', ['Za Murem']));

  it('uwaga o trybie jest w każdym artykule, w trybie zombie mówi, że to dzieje się w grze', () => {
    for (const d of moje) {
      const zw = artykul(d.id, kontekst('blok', false, false))!;
      const zo = artykul(d.id, kontekst('blok', false, true))!;
      expect(zw.uwaga, d.id).toBeTruthy();
      expect(zo.uwaga, d.id).toContain('Grasz w trybie zombie');
      expect(zw.uwaga, d.id).not.toContain('Grasz w trybie zombie');
    }
    // dzida i warta istnieją w zwykłej grze, więc nie mówią, że nic się nie dzieje
    for (const id of ['zombie:dzida', 'zombie:warta'])
      expect(artykul(id, kontekst('blok'))!.uwaga, id).toContain('zwykłej grze');
    for (const id of ['zombie:szwendacze', 'zombie:stado', 'zombie:halas', 'zombie:siatka'])
      expect(artykul(id, kontekst('blok'))!.uwaga, id).toContain('trybie zwykłym');
    ustawJezyk('en');
    expect(artykul('zombie:stado', kontekst('blok'))!.uwaga).toContain('normal mode');
    expect(artykul('zombie:stado', kontekst('blok', false, true))!.uwaga).toContain('You are playing Zombie mode');
  });

  it('dom mówi „furtka” i „komitet”, blok „brama” i „zarząd”', () => {
    const dom = tekstArtykulu(artykul('zombie:tryb', kontekst('dom'))!);
    const blok = tekstArtykulu(artykul('zombie:tryb', kontekst('blok'))!);
    expect(dom).toContain('furtka');
    expect(blok).toContain('brama');
    const warta = tekstArtykulu(artykul('zombie:warta', kontekst('dom'))!);
    expect(warta).toContain('furtce');
    expect(warta).toContain('komitet');
    expect(tekstArtykulu(artykul('zombie:warta', kontekst('blok'))!)).toContain('bramie');
  });

  it('tytuły po polsku i angielsku', () => {
    const c = kontekst('blok');
    expect(tytulArtykulu('zombie:szwendacze', c)).toBe('Szwendacze');
    expect(tytulArtykulu('zombie:halas', c)).toBe('Hałas i światło');
    ustawJezyk('en');
    expect(tytulArtykulu('zombie:szwendacze', c)).toBe('Shamblers');
    expect(tytulArtykulu('zombie:halas', c)).toBe('Noise and light');
  });
});

describe('odnośniki i wyszukiwarka', () => {
  it('„Zobacz też” prowadzi do istniejących artykułów albo do kategorii 4–8 po stałych identyfikatorach', () => {
    expect(kontrolaOdnosnikow('zombie')).toBeGreaterThan(30);
  });

  it('wyszukiwarka znajduje artykuły po nazwie, po treści i bez ogonków', () => {
    const c = kontekst('blok');
    expect(szukaj('szwendacze', c)[0].id).toBe('zombie:szwendacze');
    expect(szukaj('halas', c)[0].id).toBe('zombie:halas');
    expect(szukaj('amputacja', c).map((x) => x.id)).toContain('zombie:ugryzienie');
    expect(szukaj('dobić zwłoki', c).map((x) => x.id)).toContain('zombie:wstawanie');
    ustawJezyk('en');
    expect(szukaj('shamblers', c)[0].id).toBe('zombie:szwendacze');
    expect(szukaj('spear', c).map((x) => x.id)).toContain('zombie:dzida');
    expect(szukaj('herd', c)[0].id).toBe('zombie:stado');
  });
});
