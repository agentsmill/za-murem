/* Wiki, kategoria „Noc” (src/ui/wiki-noc.ts): fakty o karcie nocy, warcie, kozie, wyprawie i napadzie liczone osobno z funkcji
   zarządu (`raidChance`, `deterrence`, `guardValue`, `defenseAt`, `raidersOf`, `lossIfEntered`, `expRisk`, `nightWood`) i
   „przypięcia” liczb, które zarząd ma na stałe w kodzie nocy (tabela `NOC`), oraz napisów karty i okien. */

import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import {
  CARD_DEADLINE,
  CARD_HOUR,
  defenseAt,
  deterrence,
  expRisk,
  guardValue,
  lossIfEntered,
  MORNING,
  nightWood,
  raidChance,
  raidersOf,
  weaponFactor,
} from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import { REST_AWAKE } from '../../src/sim/needs.ts';
import { signed } from '../../src/ui/tekst.ts';
import { type Artykul, artykul } from '../../src/ui/wiki.ts';
import { GODZIN_NOCY, NOC } from '../../src/ui/wiki-noc.ts';
import { sondaOsoba, sondaStan, sondaStanZUchwalami, sondaWejscie } from '../../src/ui/wiki-sondy.ts';
import { kontekst, zrodlo } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const ART = (id: string): Artykul => {
  const a = artykul(id, kontekst('blok'));
  if (!a) throw new Error(`brak artykułu ${id}`);
  return a;
};
const FAKT = (a: Artykul, id: string): string => {
  const f = a.fakty.find((x) => x.id === id);
  if (!f) throw new Error(`${a.id}: brak faktu ${id} (${a.fakty.map((x) => x.id).join(', ')})`);
  return f.v;
};
const proc = (v: number): string => `${Math.round(v * 100)}%`;
const num = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');

/** wejście o 20:00 nocy `noc` z dziurami o danej liczbie, wytrzymałością siatki i światłem */
const wej = (o: { noc?: number; dziury?: number; trwalosc?: number; lampa?: boolean; ognisko?: boolean } = {}) =>
  sondaWejscie({
    day: o.noc ?? 1,
    hour: 20,
    fence: {
      holes: Array.from({ length: o.dziury ?? 0 }, (_, k) => ({ id: k + 1, size: 0.6 })),
      durability: o.trwalosc ?? 0.5,
    },
    light: { campfire: !!o.ognisko, gateLamp: !!o.lampa },
  });

describe('karta nocy: godziny i progi', () => {
  it('godziny karty, terminu i raportu są z zarządu', () => {
    const a = ART('noc:karta');
    expect(FAKT(a, 'godzina')).toBe(`${CARD_HOUR}:00`);
    expect(FAKT(a, 'termin')).toBe(`${CARD_DEADLINE}:00`);
    expect(FAKT(a, 'raport')).toBe(`${MORNING}:00`);
    expect(GODZIN_NOCY).toBe(10);
  });

  it('progi zdrowia i sił na wartę, dyżur przy kozie i wyprawy', () => {
    const a = ART('noc:karta');
    expect(FAKT(a, 'warta-prog')).toBe('20');
    expect(FAKT(a, 'koza-prog')).toBe('30');
    expect(FAKT(a, 'blisko-prog')).toBe('30 / 25');
    expect(FAKT(a, 'daleko-prog')).toBe('45 / 40');
  });

  it('napisy karty stoją w kodzie karty i okna', () => {
    const noc = zrodlo('src/gov/noc.ts');
    for (const f of [
      "tx('Śpi', 'Sleeps')",
      "tx('Czuwa przy kozie', 'Watches the stove')",
      "tx('Warta na wieży', 'Watch on the tower')",
      `tx(\`Warta \${post.name.pl}\`, \`Watch \${post.name.en}\`)`,
      `tx(\`Wyprawa \${t.range}: \${where.pl}\`, \`\${t.range === 'daleko' ? 'Long run' : 'Short run'}: \${where.en}\`)`,
    ])
      expect(noc, f).toContain(f);
    const okna = zrodlo('src/ui/okna.ts');
    expect(okna).toContain("L('Zacznijcie noc', 'Start the night')");
    expect(okna).toContain(`L(\`Jak radzi \${words.zarzad.krotko}\`, \`As \${e.krotko} suggests\`)`);
    expect(zrodlo('src/main.ts')).toContain(
      "L('Do rana czas płynie szybciej (6×).', 'Time runs faster until morning (6×).')",
    );
  });
});

describe('napad: fakty z funkcji zarządu', () => {
  it('szansa napadu: pierwsza i szósta noc, każda noc, dziura, siatka, światło, pies, uchwały, granice', () => {
    const a = ART('noc:napad');
    const s = (o: Parameters<typeof wej>[0], st = sondaStan()) => raidChance(st, wej(o));
    const baza = s({});
    expect(FAKT(a, 'szansa-baza')).toBe(`${proc(baza)} / ${proc(s({ noc: 6 }))}`);
    expect(FAKT(a, 'noc')).toBe(`+${Math.round((s({ noc: 2 }) - baza) * 100)} pkt`);
    expect(FAKT(a, 'dziura')).toBe(`+${Math.round((s({ dziury: 1 }) - baza) * 100)} pkt`);
    expect(FAKT(a, 'siatka')).toBe(
      `${signed(Math.round((s({ trwalosc: 0 }) - baza) * 100), 0)} i ${signed(Math.round((s({ trwalosc: 1 }) - baza) * 100), 0)} pkt`,
    );
    const pies = sondaStan();
    pies.flags.dog = true;
    expect(FAKT(a, 'pies')).toBe(`${signed(Math.round((s({}, pies) - baza) * 100), 0)} pkt`);
    expect(FAKT(a, 'uchwaly')).toContain(
      `${signed(Math.round((s({}, sondaStanZUchwalami('u_warty')) - baza) * 100), 0)} i`,
    );
    expect(FAKT(a, 'uchwaly')).toContain(
      `${signed(Math.round((s({}, sondaStanZUchwalami('u_brama')) - baza) * 100), 0)} pkt`,
    );
    const wszystko = sondaStanZUchwalami('u_warty', 'u_brama');
    wszystko.flags.dog = true;
    expect(FAKT(a, 'zakres')).toBe(
      `${proc(s({ trwalosc: 1, lampa: true, ognisko: true }, wszystko))} / ${proc(s({ noc: 12, dziury: 8, trwalosc: 0 }))}`,
    );
  });

  it('odstraszanie wartą: jedna osoba, dwie, ze światłem', () => {
    const a = ART('noc:napad');
    const st = sondaStan();
    expect(FAKT(a, 'odstraszanie')).toBe(`${proc(deterrence(st, wej(), 1))} / ${proc(deterrence(st, wej(), 2))}`);
    expect(FAKT(a, 'swiatlo-warta')).toBe(
      `${proc(deterrence(st, wej({ lampa: true }), 1))} / ${proc(deterrence(st, wej({ lampa: true }), 2))}`,
    );
  });

  it('liczba szabrowników zmienia się przy sile 3 i 4,2', () => {
    expect(raidersOf(2.99)).toBe(1);
    expect(raidersOf(3)).toBe(2);
    expect(raidersOf(4.19)).toBe(2);
    expect(raidersOf(4.2)).toBe(3);
    expect(FAKT(ART('noc:napad'), 'ilu')).toBe('3 / 4,2');
  });

  it('obrona bramy i psa', () => {
    const a = ART('noc:napad');
    const st = sondaStan();
    expect(FAKT(a, 'brama')).toBe(
      `${num(defenseAt(st, wej({ trwalosc: 0 }), 'brama', []))} / ${num(defenseAt(st, wej({ trwalosc: 1 }), 'brama', []))}`,
    );
    const pies = sondaStan();
    pies.flags.dog = true;
    expect(FAKT(a, 'pies-obrona')).toBe(
      `${num(defenseAt(pies, wej(), 'brama', []) - defenseAt(st, wej(), 'brama', []))} / ${num(defenseAt(pies, wej(), 'd1', []))}`,
    );
  });

  it('straty przy wtargnięciu: drewno luzem, drewno w składzie, zapasy', () => {
    const a = ART('noc:napad');
    const stan = (s: object) => lossIfEntered(sondaWejscie({ stock: { wood: 100, supplies: 100, ...s } as never }));
    expect(FAKT(a, 'straty')).toContain(`${stan({ woodLoose: 100, woodSklad: 0 }).wood}% drewna luzem`);
    expect(FAKT(a, 'straty')).toContain(`${stan({ woodLoose: 0, woodSklad: 100 }).wood}% ze składu`);
    expect(FAKT(a, 'straty')).toContain(`${stan({ woodLoose: 0, woodSklad: 0 }).supplies}% zapasów`);
  });

  it('tabela NOC stoi w kodzie nocy: okno napadu, siła, skutki odparcia i wtargnięcia, sen na warcie', () => {
    const noc = zrodlo('src/gov/noc.ts');
    expect(noc).toContain(`const RAID_FROM = ${NOC.napadOd};`);
    expect(noc).toContain(`const RAID_SPAN = ${NOC.napadGodzin} * 60;`);
    expect(noc).toContain(`round1(${NOC.silaBaza} + rnd(st) * (${NOC.silaLos} + ${NOC.silaNaNoc} * n.day))`);
    const o = NOC.odparcie;
    expect(noc).toContain(`mood(st, ${o.zaufanie}, ${o.wkurzenie});`);
    expect(noc).toContain(`addNeeds(fx, p.id, { safe: ${o.bezpieczenstwo} });`);
    expect(noc).toContain(`d: ${o.nastroj}, hours: 12`);
    const w = NOC.wtargniecie;
    expect(noc).toContain(`mood(st, ${w.zaufanie}, ${w.wkurzenie});`);
    expect(noc).toContain(`addNeeds(fx, p.id, { safe: ${w.bezpieczenstwo} });`);
    expect(noc).toContain(`d: ${w.nastroj}, hours: 12`);
    expect(noc).toContain(`addNeeds(fx, v.id, { health: ${w.rana} });`);
    expect(noc).toContain(`for (const p of i.people) addNeeds(fx, p.id, { safe: ${NOC.spokoj} });`);
    expect(noc).toContain(`Math.floor(${NOC.zlom} * (i.stock.scrap ?? 0))`);
    const [zm, wy] = [NOC.sen.zmeczony, NOC.sen.wyczerpany];
    expect(noc).toContain(`p.needs.rest < ${wy[0]} ? ${wy[1]} : p.needs.rest < ${zm[0]} ? ${zm[1]} : 0`);
  });
});

describe('warta: fakty z funkcji zarządu', () => {
  it('siła warty bez dodatków i progi, na których się zmienia', () => {
    const a = ART('noc:warta');
    const st = sondaStan();
    const i = sondaWejscie();
    const v = (needs: object) => guardValue(st, i, sondaOsoba({ needs: needs as never }), 'brama');
    expect(FAKT(a, 'sila')).toBe(`${num(v({}))} / ${num(v({ rest: 20 }))} / ${num(v({ health: 10 }))}`);
    expect(v({ rest: 30 })).toBe(v({ rest: 0 }));
    expect(v({ rest: 31 })).toBeGreaterThan(v({ rest: 30 }));
    expect(v({ health: 19 })).toBeLessThan(v({ health: 20 }));
    expect(FAKT(a, 'progi')).toBe('30 / 20');
  });

  it('mnożniki broni, cech, lampy i uchwały o wartach', () => {
    const a = ART('noc:warta');
    expect(FAKT(a, 'bron')).toBe(
      `×${num(weaponFactor({ arm: 'wrecz' }))} / ×${num(weaponFactor({ arm: 'dzida' }))} / ×${num(weaponFactor({ arm: 'palna' }))}`,
    );
    expect(FAKT(a, 'cechy')).toBe('×1,2 / ×0,7');
    expect(FAKT(a, 'lampa')).toBe('×1,5');
    expect(FAKT(a, 'uchwala')).toBe('×1,25');
    expect(FAKT(a, 'obrona')).toBe('+25% na poziom');
    // ręcznie sprawdzone na funkcji: odważny razy 1,2, tchórzliwy razy 0,7 (przy dużej bazie, żeby zaokrąglenie do 0,1 nie mąciło)
    const st = sondaStanZUchwalami('u_warty');
    const lampa = sondaWejscie({ light: { campfire: false, gateLamp: true } });
    const g = (traits: string[]) =>
      guardValue(st, lampa, sondaOsoba({ arm: 'palna', skills: { obrona: 4 }, traits }), 'brama');
    expect(g(['odwazny']) / g([])).toBeCloseTo(1.2, 1);
    expect(g(['tchorz']) / g([])).toBeCloseTo(0.7, 1);
  });

  it('wartość warty: noc na nogach kosztuje 10 godzin po REST_AWAKE sił', () => {
    expect(FAKT(ART('noc:warta'), 'sen')).toBe(`${NOC.sen.zmeczony[1] * 100}% / ${NOC.sen.wyczerpany[1] * 100}%`);
    expect(ART('noc:warta').zdania.join(' ')).toContain(`${REST_AWAKE * GODZIN_NOCY} sił`);
    expect(zrodlo('src/gov/noc.ts')).toContain(
      `fx.moods.push({ id: p.id, why: 'Całą noc na warcie', d: ${NOC.nastrojWarta}, hours: 8 })`,
    );
  });
});

describe('dyżur przy kozie i wyprawa', () => {
  it('drewno na noc od karty do rana to godziny razy jedno palenisko', () => {
    const a = ART('noc:koza');
    expect(FAKT(a, 'drewno-noc')).toBe(String(nightWood(sondaWejscie({ stock: { wood: 0, supplies: 0 } })).need));
    expect(zrodlo('src/gov/noc.ts')).toContain(
      `fx.moods.push({ id: p.id, why: 'Całą noc przy kozie', d: ${NOC.nastrojKoza}, hours: 8 })`,
    );
    const k = NOC.kuchnia;
    expect(zrodlo('src/gov/noc.ts')).toContain(
      `const warm = t >= ${k.cieplo} ? 'ciepło' : t >= ${k.chlodno} ? 'chłodno' : 'zimno';`,
    );
    expect(zrodlo('src/ui/okna.ts')).toContain(`kit >= ${k.cieplo} ? ' good' : kit < ${k.chlodno} ? ' bad' : ''`);
  });

  it('godziny powrotu wypraw to godziny z tabeli celów', () => {
    const a = ART('noc:wyprawa');
    expect(FAKT(a, 'blisko')).toBe(`${TARGETS.find((t) => t.range === 'blisko')?.back}:00`);
    expect(FAKT(a, 'daleko')).toBe(`${TARGETS.find((t) => t.range === 'daleko')?.back}:00`);
  });

  it('ryzyko wyprawy: zmęczony, ranny, cechy, Obrona, grupa, broń, tryb zombie', () => {
    const a = ART('noc:wyprawa');
    const st = sondaStan();
    const zombie = sondaStan();
    zombie.mode = 'zombie';
    const cel = { ryzyko: 0.4 };
    const r = (o: object, s = st, razem = 1) =>
      expRisk(s, sondaOsoba(o as never), cel, razem) / expRisk(st, sondaOsoba(), cel);
    expect(FAKT(a, 'ryzyko-sily')).toBe(`×${num(r({ needs: { rest: 0 } }))}`);
    expect(FAKT(a, 'ryzyko-zdrowie')).toBe(`×${num(r({ needs: { health: 0 } }))}`);
    expect(FAKT(a, 'ryzyko-odwazny')).toBe(`×${num(r({ traits: ['odwazny'] }))}`);
    expect(FAKT(a, 'ryzyko-tchorz')).toBe(`×${num(r({ traits: ['tchorz'] }))}`);
    expect(FAKT(a, 'ryzyko-razem')).toBe(`×${num(r({}, st, 2))}`);
    expect(FAKT(a, 'ryzyko-zombie')).toBe(`×${num(r({}, zombie))}`);
    expect(FAKT(a, 'ryzyko-bron')).toBe(`×${num(r({ arm: 'palna' }))} / ×${num(r({ arm: 'wrecz' }))}`);
    // progi sił i zdrowia, od których rośnie ryzyko
    expect(r({ needs: { rest: 35 } })).toBe(1);
    expect(r({ needs: { rest: 34 } })).toBeGreaterThan(1);
    expect(r({ needs: { health: 50 } })).toBe(1);
    expect(r({ needs: { health: 49 } })).toBeGreaterThan(1);
    expect(a.fakty.find((f) => f.id === 'ryzyko-sily')?.k).toContain('35');
    expect(a.fakty.find((f) => f.id === 'ryzyko-zdrowie')?.k).toContain('50');
  });

  it('koszty i łup wyprawy stoją w kodzie rozliczenia', () => {
    const noc = zrodlo('src/gov/noc.ts');
    expect(noc).toContain(`rest: cel.range === 'daleko' ? ${NOC.kosztSil.daleko} : ${NOC.kosztSil.blisko}`);
    expect(noc).toContain(`(ppl.length > 1 ? ${NOC.lupGrupy} : 1)`);
    expect(noc).toContain(`const d = -rint(st, ${NOC.ranaKlopot[0]}, ${NOC.ranaKlopot[1]});`);
    expect(noc).toContain(`const bitten = zombie && rnd(st) < ${NOC.ugryzienie};`);
    expect(noc).toContain(
      `if (rnd(st) < (zombie ? ${NOC.znaleziskoAmunicja.zombie} : ${NOC.znaleziskoAmunicja.zwykly})) {`,
    );
    expect(noc).toContain(
      `const n = rint(st, ${NOC.znaleziskoAmunicja.sztuk[0]}, ${NOC.znaleziskoAmunicja.sztuk[1]});`,
    );
    expect(noc).toContain(`if (rnd(st) < (zombie ? ${NOC.znaleziskoBron.zombie} : ${NOC.znaleziskoBron.zwykly})) {`);
    expect(noc).toContain('mood(st, 1, 0);');
  });
});
