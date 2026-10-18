/* Własna drużyna zarządu: zasady osoby (budżet, lista zawodu, wiek, cechy), losowanie osoby i drużyny na wielu
   próbach, sprawdzanie i poprawianie złych danych, historie z kawałków (src/content/druzyna.ts, historia.ts). */

import { describe, expect, it } from 'vitest';
import { type Dom, PROFS, TRAIT_PAIRS, TRAITS } from '../../src/content/data.ts';
import {
  BUDZET,
  bledyOsoby,
  CECHY_DOBRE,
  CECHY_OBOJETNE,
  CECHY_ZLE,
  cechaPasuje,
  dobreImie,
  dodajPunkt,
  losujCechy,
  losujDruzyne,
  losujOsobe,
  maksimum,
  naprawOsobe,
  nazwaCechy,
  type OsobaDruzyny,
  odejmijPunkt,
  osobaDoGry,
  POTRZEBNE,
  pierwszeImie,
  punkty,
  rozdajPunkty,
  UMIEJETNOSCI_ZAWODU,
  ZAWODY_ZARTY,
  zawod,
  zmienZawod,
  zostalo,
} from '../../src/content/druzyna.ts';
import {
  FACH,
  HISTORIA_MAX,
  losujHistorie,
  type Pokolenie,
  pokolenie,
  SATYRA,
  wypelnijPlec,
  Z_CECHY,
} from '../../src/content/historia.ts';
import { mulberry } from '../../src/core/rng.ts';
import { slotySzablonu } from '../../src/mieszkancy/szablony.ts';

const dobra = (): OsobaDruzyny => ({
  name: 'Halina Wróbel',
  f: true,
  age: 67,
  prof: 'Emerytowany inżynier',
  skills: { bud: 3, cieplo: 2, elek: 1 },
  traits: ['twardy', 'klotliwy'],
  story: 'Liczy na kartce.',
});

describe('zamknięta lista umiejętności zawodu', () => {
  it('każdy z 22 zawodów ma 2 albo 3 dziedziny, poziomy z PROFS mieszczą się w maksimach, 4 tylko w głównej', () => {
    expect(Object.keys(UMIEJETNOSCI_ZAWODU).sort()).toEqual(PROFS.map((p) => p[0]).sort());
    for (const p of PROFS) {
      const lista = UMIEJETNOSCI_ZAWODU[p[0]];
      const ds = Object.keys(lista) as Dom[];
      expect(ds.length, p[0]).toBeGreaterThanOrEqual(2);
      expect(ds.length, p[0]).toBeLessThanOrEqual(3);
      for (const [d, v] of Object.entries(p[2]) as [Dom, number][])
        expect(lista[d] ?? 0, `${p[0]}: ${d}`).toBeGreaterThanOrEqual(v);
      // pierwsza dziedzina to główna: ma najwyższe maksimum, a tylko ona może mieć 4
      const maxima = ds.map((d) => lista[d]!);
      expect(Math.max(...maxima), p[0]).toBe(maxima[0]);
      for (const v of maxima.slice(1)) expect(v, p[0]).toBeLessThan(4);
      for (const v of maxima) expect(v).toBeGreaterThanOrEqual(1);
      // co najmniej jedna dziedzina pokrewna spoza PROFS
      expect(
        ds.some((d) => !(d in p[2])),
        p[0],
      ).toBe(true);
    }
  });

  it('zawody-żarty nie wydadzą 6 punktów, każdy inny wyda całe 6', () => {
    for (const p of PROFS) {
      const sum = Object.values(UMIEJETNOSCI_ZAWODU[p[0]]).reduce((a, v) => a + (v ?? 0), 0);
      if (ZAWODY_ZARTY.includes(p[0])) expect(sum, p[0]).toBeLessThan(BUDZET);
      else expect(sum, p[0]).toBeGreaterThanOrEqual(BUDZET);
    }
    expect([...ZAWODY_ZARTY].sort()).toEqual(['Doradca ds. ESG', 'Kucharz', 'Kurier', 'Prompt engineer']);
  });
});

describe('budżet punktów', () => {
  it('dodawanie pilnuje maksimum dziedziny i budżetu, odejmowanie zera, licznik mówi, ile zostało', () => {
    const o = dobra();
    expect(zostalo(o.skills)).toBe(0);
    expect(dodajPunkt(o, 'bud')).toBe(false);
    expect(odejmijPunkt(o, 'elek')).toBe(true);
    expect(o.skills.elek).toBeUndefined();
    expect(zostalo(o.skills)).toBe(1);
    // elektryka ma u inżyniera najwyżej 1, medycyny nie ma na liście
    expect(dodajPunkt(o, 'med')).toBe(false);
    expect(dodajPunkt(o, 'bud')).toBe(true);
    expect(o.skills.bud).toBe(4);
    expect(dodajPunkt(o, 'elek')).toBe(false);
    expect(punkty(o.skills)).toBe(BUDZET);
    for (let k = 0; k < 6; k++) odejmijPunkt(o, 'cieplo');
    expect(o.skills.cieplo).toBeUndefined();
    expect(odejmijPunkt(o, 'cieplo')).toBe(false);
    // ciepło do 3, potem nie
    for (let k = 0; k < 5; k++) dodajPunkt(o, 'cieplo');
    expect(o.skills.cieplo).toBe(2);
    expect(zostalo(o.skills)).toBe(0);
  });

  it('zmiana zawodu wstawia poziomy z PROFS i przycina wiek do nowych widełek', () => {
    const o = dobra();
    zmienZawod(o, 'Student biotechnologii');
    expect(o.skills).toEqual({ uprawa: 2, med: 1 });
    expect(o.age).toBe(26);
    zmienZawod(o, 'Działkowiec');
    expect(o.skills).toEqual({ uprawa: 2, bud: 1 });
    expect(o.age).toBe(50);
    zmienZawod(o, 'Doradca ds. ESG');
    expect(o.skills).toEqual({});
    expect(o.age).toBe(45);
    zmienZawod(o, 'Nie ma takiego');
    expect(o.prof).toBe('Doradca ds. ESG');
  });
});

describe('cechy z losowania', () => {
  it('pule dobrych, złych i obojętnych to dokładnie cechy z TRAITS', () => {
    expect([...CECHY_DOBRE, ...CECHY_ZLE, ...CECHY_OBOJETNE].sort()).toEqual(Object.keys(TRAITS).sort());
    // pary z TRAIT_PAIRS to zawsze dobra ze złą
    for (const [a, b] of TRAIT_PAIRS) expect(CECHY_DOBRE.includes(a) !== CECHY_DOBRE.includes(b)).toBe(true);
  });

  it('10 000 losowań: jedna albo dwie, nigdy dwie dobre, nigdy para z TRAIT_PAIRS, dwie w około 45%', () => {
    const rnd = mulberry(2051);
    let two = 0;
    const seen = new Set<string>();
    for (let k = 0; k < 10_000; k++) {
      const t = losujCechy(rnd);
      expect(t.length === 1 || t.length === 2).toBe(true);
      if (t.length === 2) {
        two++;
        expect(t[0]).not.toBe(t[1]);
        expect(CECHY_DOBRE.includes(t[0]) && CECHY_DOBRE.includes(t[1])).toBe(false);
        expect(TRAIT_PAIRS.some(([a, b]) => t.includes(a) && t.includes(b))).toBe(false);
      }
      for (const x of t) seen.add(x);
    }
    expect(two / 10_000).toBeGreaterThan(0.42);
    expect(two / 10_000).toBeLessThan(0.48);
    expect(seen.size).toBe(Object.keys(TRAITS).length);
  });

  it('cecha pasuje do wylosowanych według tych samych zasad', () => {
    expect(cechaPasuje([], 'twardy')).toBe(true);
    expect(cechaPasuje(['twardy'], 'odwazny')).toBe(false);
    expect(cechaPasuje(['twardy'], 'gadula')).toBe(true);
    expect(cechaPasuje(['leniwy'], 'tchorz')).toBe(true);
    expect(cechaPasuje(['leniwy'], 'pracowity')).toBe(false);
    expect(cechaPasuje(['gadula'], 'gadula')).toBe(false);
    expect(cechaPasuje([], 'nieznana')).toBe(false);
  });

  it('nazwy cech w formie zgodnej z płcią', () => {
    expect(nazwaCechy('twardy', true)).toBe('Twarda');
    expect(nazwaCechy('twardy', false)).toBe('Twardy');
    expect(nazwaCechy('excel', true)).toBe('Mistrzyni Excela');
    expect(nazwaCechy('gadula', false)).toBe('Gaduła');
    for (const t of Object.keys(TRAITS)) expect(nazwaCechy(t, true)).not.toBe('');
  });
});

describe('losowanie osoby i drużyny', () => {
  it('2000 drużyn po 1–5 osób: każda osoba zgodna z zasadami, imiona i zawody bez powtórzeń', () => {
    const rnd = mulberry(7);
    for (let k = 0; k < 2000; k++) {
      const n = 1 + (k % 5);
      const team = losujDruzyne(rnd, n);
      expect(team).toHaveLength(n);
      for (const o of team) expect(bledyOsoby(o), JSON.stringify(o)).toEqual([]);
      expect(new Set(team.map((o) => pierwszeImie(o.name))).size).toBe(n);
      expect(new Set(team.map((o) => o.prof)).size).toBe(n);
    }
  });

  it('od 4 osób drużyna ma kogoś z ciepłem, budową, medycyną i uprawą (jak zarząd z adresu)', () => {
    const rnd = mulberry(11);
    for (let k = 0; k < 2000; k++) {
      const team = losujDruzyne(rnd, 4 + (k % 2));
      for (const d of POTRZEBNE) expect(team.some((o) => (o.skills[d] ?? 0) >= 1)).toBe(true);
      // po kolei, jak createSim: k-ta osoba ma k-tą dziedzinę w zawodzie
      team.slice(0, 4).forEach((o, i) => {
        expect(zawod(o.prof)![2][POTRZEBNE[i]] ?? 0).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('umiejętności: poziomy z PROFS zostają, resztę budżetu dostają dziedziny z listy', () => {
    const rnd = mulberry(3);
    for (let k = 0; k < 500; k++)
      for (const p of PROFS) {
        const s = rozdajPunkty(rnd, p[0]);
        for (const [d, v] of Object.entries(p[2]) as [Dom, number][]) expect(s[d]).toBeGreaterThanOrEqual(v);
        for (const [d, v] of Object.entries(s) as [Dom, number][]) expect(v).toBeLessThanOrEqual(maksimum(p[0], d));
        const cap = Object.values(UMIEJETNOSCI_ZAWODU[p[0]]).reduce((a, v) => a + (v ?? 0), 0);
        expect(punkty(s)).toBe(Math.min(BUDZET, cap));
      }
  });

  it('ten sam generator daje tę samą drużynę, inne ziarno inną', () => {
    expect(losujDruzyne(mulberry(5), 5)).toEqual(losujDruzyne(mulberry(5), 5));
    expect(losujDruzyne(mulberry(5), 5)).not.toEqual(losujDruzyne(mulberry(6), 5));
  });

  it('osoba z zajętymi imionami i zawodami dostaje inne', () => {
    const rnd = mulberry(9);
    const team = losujDruzyne(rnd, 4);
    const used = new Set(team.map((o) => pierwszeImie(o.name)));
    const profs = new Set(team.map((o) => o.prof));
    for (let k = 0; k < 300; k++) {
      const o = losujOsobe(rnd, { used, zawody: profs });
      expect(used.has(pierwszeImie(o.name))).toBe(false);
      expect(profs.has(o.prof)).toBe(false);
    }
  });
});

describe('sprawdzanie osoby', () => {
  it('dobra osoba nie ma błędów, historia jest opcjonalna', () => {
    expect(bledyOsoby(dobra())).toEqual([]);
    const { story: _, ...bez } = dobra();
    expect(bledyOsoby(bez)).toEqual([]);
  });

  const zle: [string, (o: Record<string, unknown>) => void][] = [
    ['puste imię', (o) => (o.name = '   ')],
    ['imię dłuższe niż 40 znaków', (o) => (o.name = `Halina ${'W'.repeat(40)}`)],
    ['imię ze znakami HTML', (o) => (o.name = 'Halina <b>Wróbel</b>')],
    ['imię z cyframi', (o) => (o.name = 'Halina 2')],
    ['płeć nie logiczna', (o) => (o.f = 'K')],
    ['zawód spoza listy', (o) => (o.prof = 'Astronauta')],
    ['wiek poza widełkami', (o) => (o.age = 59)],
    ['wiek z ułamkiem', (o) => (o.age = 66.5)],
    ['umiejętność spoza listy zawodu', (o) => (o.skills = { bud: 3, med: 1 })],
    ['umiejętność ponad maksimum zawodu', (o) => (o.skills = { elek: 2 })],
    ['umiejętności ponad 6 punktów', (o) => (o.skills = { bud: 4, cieplo: 3 })],
    ['ujemna umiejętność', (o) => (o.skills = { bud: -1 })],
    ['brak umiejętności', (o) => (o.skills = null)],
    ['dwie dobre cechy', (o) => (o.traits = ['twardy', 'pracowity'])],
    ['para z TRAIT_PAIRS', (o) => (o.traits = ['optymista', 'klotliwy'])],
    ['trzy cechy', (o) => (o.traits = ['leniwy', 'tchorz', 'gadula'])],
    ['bez cech', (o) => (o.traits = [])],
    ['nieznana cecha', (o) => (o.traits = ['nudny'])],
    ['powtórzona cecha', (o) => (o.traits = ['gadula', 'gadula'])],
    ['historia dłuższa niż 400 znaków', (o) => (o.story = 'a'.repeat(HISTORIA_MAX + 1))],
  ];
  it.each(zle)('zła osoba: %s', (_, zepsuj) => {
    const o = dobra() as unknown as Record<string, unknown>;
    zepsuj(o);
    expect(bledyOsoby(o).length).toBeGreaterThan(0);
  });

  it('nie-osoba to błąd', () => {
    for (const x of [null, undefined, 3, 'Halina', []]) expect(bledyOsoby(x).length).toBeGreaterThan(0);
  });

  it('imię: oczyszczone ze spacji, pierwsze słowo to imię, polskie litery i łącznik', () => {
    expect(dobreImie('  Anna-Maria   Wróbel  ')).toBe(true);
    expect(pierwszeImie('  Anna-Maria   Wróbel ')).toBe('Anna-Maria');
    expect(dobreImie("Zoë O'Neil")).toBe(true);
    expect(dobreImie('Halina')).toBe(true);
    expect(dobreImie('')).toBe(false);
    expect(dobreImie('-Halina')).toBe(false);
  });

  it('naprawa osoby z pamięci przeglądarki daje osobę zgodną z zasadami i zostawia to, co dobre', () => {
    const rnd = mulberry(4);
    const zla = { ...dobra(), age: 99, skills: { bud: 4, cieplo: 3, med: 2 }, traits: ['twardy', 'odwazny'] };
    const o = naprawOsobe(zla, rnd);
    expect(bledyOsoby(o)).toEqual([]);
    expect(o.name).toBe('Halina Wróbel');
    expect(o.f).toBe(true);
    expect(o.prof).toBe('Emerytowany inżynier');
    expect(o.age).toBe(80);
    expect(o.skills.med).toBeUndefined();
    expect(punkty(o.skills)).toBeLessThanOrEqual(BUDZET);
    expect(o.story).toBe('Liczy na kartce.');
    for (const x of [null, 7, { name: 5 }, { prof: 'Astronauta', traits: 'x' }])
      expect(bledyOsoby(naprawOsobe(x, rnd))).toEqual([]);
    // dobra osoba wychodzi bez zmian
    expect(naprawOsobe(dobra(), rnd)).toEqual(dobra());
  });

  it('pola osoby w grze: imię z pierwszego słowa, zawód w formie płci, umiejętności bez zer, historia bez pustej', () => {
    const g = osobaDoGry({ ...dobra(), name: ' Halina  Wróbel ', skills: { bud: 3, cieplo: 0, elek: 1 } });
    expect(g).toEqual({
      first: 'Halina',
      name: 'Halina Wróbel',
      f: true,
      prof: 'Emerytowana inżynierka',
      skills: { bud: 3, elek: 1 },
      age: 67,
      traits: ['twardy', 'klotliwy'],
      story: 'Liczy na kartce.',
    });
    expect('story' in osobaDoGry({ ...dobra(), story: '  ' })).toBe(false);
  });
});

/** wszystkie kawałki historii */
const kawalki = (): string[] => [
  ...Object.values(FACH).flatMap((t) => Object.values(t).flatMap((x) => [...(x ?? [])])),
  ...Object.values(Z_CECHY).flatMap((x) => [...x]),
  ...SATYRA,
];

/** słowa w czasie przeszłym, które w kawałkach mówią o kimś innym niż osoba (stały podmiot) albo są rzeczownikami;
    każde inne męskie „-ł” w historii kobiety (i żeńskie „-ła” w historii mężczyzny) to zapomniany slot {g:…|…} */
const MESKIE_STALE = new Set([
  'powtarzał',
  'zostawił',
  'stawiał',
  'był',
  'pozwolił',
  'pół',
  'słuchał',
  'wyniósł',
  'kwartał',
  'kanał',
  'wrócił',
  'został',
  'dołożył',
  'przetrwał',
  'podłączył',
  'złapał',
  'zdążył',
  'zobaczył',
]);
const ZENSKIE_STALE = new Set([
  'chciała',
  'rozpoznawała',
  'cała',
  'działa',
  'padła',
  'była',
  'liczyła',
  'ciepła',
  'zjadła',
]);

describe('historie z kawałków', () => {
  it('zapis jak w szablonach mieszkańców z adresu (tylko sloty {g:…|…}), bez pauz', () => {
    for (const s of kawalki()) {
      expect(() => slotySzablonu(s), s).not.toThrow();
      expect(slotySzablonu(s).every((k) => k === 'g')).toBe(true);
      expect(s).not.toMatch(/—|–/);
      expect(s).toMatch(/^[A-ZĄĆĘŁŃÓŚŹŻ{]/);
      expect(s).toMatch(/[.!?]$/);
    }
  });

  it('każdy zawód ma zdania o fachu dla każdego wieku z widełek PROFS, a żadne zdanie nie leży poza widełkami', () => {
    expect(Object.keys(FACH).sort()).toEqual(PROFS.map((p) => p[0]).sort());
    for (const p of PROFS) {
      const ages = Array.from({ length: p[3][1] - p[3][0] + 1 }, (_, i) => p[3][0] + i);
      for (const a of ages) expect(FACH[p[0]][pokolenie(a)]?.length ?? 0, `${p[0]} ${a}`).toBeGreaterThan(0);
      for (const g of Object.keys(FACH[p[0]]) as Pokolenie[])
        expect(
          ages.some((a) => pokolenie(a) === g),
          `${p[0]}: ${g}`,
        ).toBe(true);
    }
  });

  it('Wielkie Wylogowanie (2034, GDD): pamięta je środek i starsi, młodzi najwyżej z dzieciństwa, cechy go nie znają', () => {
    const wyl = /Wylogowani/;
    const zFachu = (g: Pokolenie) => Object.values(FACH).flatMap((t) => [...(t[g] ?? [])]);
    expect(zFachu('srodek').filter((s) => wyl.test(s)).length).toBeGreaterThanOrEqual(4);
    expect(zFachu('starsi').some((s) => wyl.test(s))).toBe(true);
    for (const s of zFachu('mlodzi').filter((x) => wyl.test(x))) expect(s, s).toMatch(/dzieck/);
    for (const s of Object.values(Z_CECHY).flat()) expect(s).not.toMatch(wyl);
    // nikt nie mówi już o upadku chmury bez roku: chmura padła w 2034, przy Wylogowaniu
    for (const s of kawalki()) expect(s).not.toMatch(/chmura padła|padła chmura/);
  });

  it('każda cecha ma zdania', () => {
    expect(Object.keys(Z_CECHY).sort()).toEqual(Object.keys(TRAITS).sort());
    for (const t of Object.keys(TRAITS)) expect(Z_CECHY[t].length).toBeGreaterThan(0);
  });

  it('pokolenia według wieku w 2051 roku', () => {
    expect([20, 35, 36, 55, 56, 80].map(pokolenie)).toEqual([
      'mlodzi',
      'mlodzi',
      'srodek',
      'srodek',
      'starsi',
      'starsi',
    ]);
  });

  it('forma płci: w historii kobiety nie ma męskiego czasu przeszłego o niej i odwrotnie', () => {
    for (const s of kawalki()) {
      const k = wypelnijPlec(s, true);
      const m = wypelnijPlec(s, false);
      for (const w of k.match(/\p{L}+ł(?!\p{L})/gu) ?? []) expect(MESKIE_STALE.has(w), `${w}: ${k}`).toBe(true);
      for (const w of m.match(/\p{L}+ła(?!\p{L})/gu) ?? []) expect(ZENSKIE_STALE.has(w), `${w}: ${m}`).toBe(true);
      expect(k).not.toMatch(/[{}|]/);
      expect(m).not.toMatch(/[{}|]/);
    }
  });

  it('5000 historii: dwa albo trzy zdania, niepuste, najwyżej 400 znaków, zdanie o fachu pierwsze', () => {
    const rnd = mulberry(2026);
    for (let k = 0; k < 5000; k++) {
      const o = losujOsobe(rnd);
      const h = o.story;
      expect(h.length).toBeGreaterThan(0);
      expect(h.length).toBeLessThanOrEqual(HISTORIA_MAX);
      const zdania = h.split(/(?<=[.!?”])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„])/u);
      expect(zdania.length, h).toBeGreaterThanOrEqual(2);
      expect(zdania.length, h).toBeLessThanOrEqual(3);
      const fach = (FACH[o.prof][pokolenie(o.age)] ?? []).map((s) => wypelnijPlec(s, o.f));
      expect(fach).toContain(zdania[0]);
    }
  });

  it('ta sama osoba i ziarno dają tę samą historię; płeć zmienia formy, a nie treść', () => {
    const o = { f: false, age: 44, prof: 'Elektryk', traits: ['twardy'] };
    expect(losujHistorie(mulberry(1), o)).toBe(losujHistorie(mulberry(1), o));
    const m = losujHistorie(mulberry(1), o);
    const k = losujHistorie(mulberry(1), { ...o, f: true });
    expect(k).not.toBe(m);
    expect(k.split(' ').length).toBe(m.split(' ').length);
    expect(m).toContain('montował');
    expect(k).toContain('montowała');
  });
});
