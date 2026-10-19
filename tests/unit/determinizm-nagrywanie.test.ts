import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nagrywaj,
  odkodujWywolania,
  pierwszaRoznica,
  type Wywolanie,
  zakodujWywolania,
} from '../../tools/determinizm/nagrywanie.ts';
import { porownaj } from '../../tools/determinizm/porownanie.ts';
import { uruchom } from '../../tools/determinizm/uruchom.ts';
import { psuj } from '../../tools/determinizm/uszkodzenie.ts';
import type { Zlecenie } from '../../tools/determinizm/zlecenie.ts';

describe('porównanie nagrań wywołań Math', () => {
  it('pierwszaRoznica wskazuje pierwsze wywołanie z innym wynikiem', () => {
    const a: Wywolanie[] = [
      ['sin', [1], 0.8414709848078965],
      ['hypot', [3, 4], 5],
    ];
    const b: Wywolanie[] = [
      ['sin', [1], 0.8414709848078965],
      ['hypot', [3, 4], 5.000000000000001],
    ];
    expect(pierwszaRoznica(a, b)?.i).toBe(1);
  });

  it('zgodne nagrania to null; krótsze nagranie różni się od pierwszego brakującego wywołania', () => {
    const a: Wywolanie[] = [
      ['cos', [0], 1],
      ['exp', [1], Math.E],
    ];
    expect(pierwszaRoznica(a, [...a])).toBeNull();
    expect(pierwszaRoznica([], [])).toBeNull();
    expect(pierwszaRoznica(a, a.slice(0, 1))).toEqual({ i: 1, a: a[1], b: undefined });
  });

  it('wywołania są równe bit w bit: NaN to NaN, a minus zero to nie zero', () => {
    expect(pierwszaRoznica([['log', [-1], Number.NaN]], [['log', [-1], Number.NaN]])).toBeNull();
    expect(pierwszaRoznica([['atan2', [0, -1], 0]], [['atan2', [-0, -1], 0]])?.i).toBe(0);
    expect(pierwszaRoznica([['sin', [-0], -0]], [['sin', [-0], 0]])?.i).toBe(0);
  });

  it('inne argumenty to też różnica (rozjazd powstał wcześniej poza nagrywanymi funkcjami)', () => {
    const r = pierwszaRoznica([['hypot', [3, 4], 5]], [['hypot', [3, 4.000000000000001], 5]]);
    expect(r?.i).toBe(0);
    expect(r?.a).toEqual(['hypot', [3, 4], 5]);
  });

  it('kodowanie na transport zachowuje NaN, nieskończoności i minus zero po przejściu przez JSON', () => {
    const w: Wywolanie[] = [
      ['log', [0], Number.NEGATIVE_INFINITY],
      ['log', [-1], Number.NaN],
      ['atan2', [-0, 1], -0],
      ['pow', [2, 1024], Number.POSITIVE_INFINITY],
      ['hypot', [0.1, 0.2], 0.223606797749979],
    ];
    const poDrodze = odkodujWywolania(JSON.parse(JSON.stringify(zakodujWywolania(w))));
    expect(pierwszaRoznica(w, poDrodze)).toBeNull();
    expect(Object.is(poDrodze[2][2], -0)).toBe(true);
  });
});

describe('nagrywanie wywołań Math w przedziale kroków', () => {
  it('zapisuje [nazwa, argumenty, wynik] tylko w krokach od do, z takim wynikiem jak bez nagrywania', () => {
    const n = nagrywaj(2, 4);
    Math.hypot(1, 1);
    n.krok(0);
    Math.hypot(1, 1);
    n.krok(2);
    const w = Math.hypot(3, 4);
    Math.sin(1);
    Math.sqrt(4);
    n.krok(3);
    Math.atan2(1, 2);
    n.krok(4);
    Math.hypot(6, 8);
    const zapis = n.zatrzymaj();
    expect(w).toBe(5);
    expect(zapis).toEqual([
      ['hypot', [3, 4], 5],
      ['sin', [1], Math.sin(1)],
      ['atan2', [1, 2], Math.atan2(1, 2)],
    ]);
  });

  it('po zatrzymaj Math jest przywrócony, także gdy krok końcowy nie nadszedł, i zatrzymaj można wołać drugi raz', () => {
    const oryginal = Math.hypot;
    const n = nagrywaj(0, 100);
    expect(Math.hypot).toBe(oryginal);
    n.krok(0);
    expect(Math.hypot).not.toBe(oryginal);
    Math.hypot(3, 4);
    expect(n.zatrzymaj()).toHaveLength(1);
    expect(Math.hypot).toBe(oryginal);
    expect(n.zatrzymaj()).toHaveLength(1);
  });

  it('stos wskazanego wywołania prowadzi do kodu, który je zawołał', () => {
    const n = nagrywaj(0, 10, { stosPrzy: 1 });
    n.krok(0);
    Math.hypot(1, 2);
    Math.hypot(3, 4);
    Math.hypot(5, 12);
    n.zatrzymaj();
    expect(n.stos()).toContain('determinizm-nagrywanie.test.ts');
    expect(nagrywaj(0, 10, { stosPrzy: 5 }).stos()).toBeNull();
  });
});

describe('samotest bramki: umyślnie uszkodzona funkcja Math', () => {
  it('psuj zmienia co któryś wynik o jeden bit, a przywroc oddaje oryginał', () => {
    const oryginal = Math.hypot;
    const u = psuj('hypot', 2);
    const wyniki = [Math.hypot(3, 4), Math.hypot(3, 4), Math.hypot(3, 4), Math.hypot(3, 4)];
    expect(wyniki.map((w) => w === 5)).toEqual([true, false, true, false]);
    expect(Math.abs(wyniki[1] - 5)).toBeLessThan(1e-14);
    u.zeruj();
    expect(Math.hypot(3, 4)).toBe(5);
    u.przywroc();
    expect(Math.hypot).toBe(oryginal);
  });

  const demo = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/zielonki.json'), 'utf8'),
  );
  const dane = { geo: demo.geo, street: demo.street as string };
  const zegar = () => 0;
  // zombie na zielonkach: uszkodzony hypot rozjeżdża skróty już w pierwszej godzinie gry (zwykły tryb dopiero na większych osiedlach)
  const z: Zlecenie = { demo: 'zielonki', godziny: 3, tryb: 'zombie', seed: 4, powtorz: 1 };

  it('uszkodzone hypot rozjeżdża skróty, a nagranie wskazuje pierwsze wywołanie z innym wynikiem i jego miejsce w kodzie', () => {
    const oryginal = Math.hypot;
    const czysty = uruchom(z, dane, zegar).biegi[0].skroty;
    const zepsuty = uruchom({ ...z, psuj: 'hypot' }, dane, zegar).biegi[0].skroty;
    expect(Math.hypot).toBe(oryginal);
    const rozbiezne = porownaj({ czysty, zepsuty });
    expect(rozbiezne.zgodne).toBe(false);
    const godzina = rozbiezne.pierwsza!.godzina;

    // nagranie godziny gry, w której skróty się rozeszły, w obu przebiegach
    const okno = { od: godzina * 800, do: (godzina + 1) * 800 };
    const a = uruchom({ ...z, nagraj: okno }, dane, zegar).biegi[0];
    const b = uruchom({ ...z, psuj: 'hypot', nagraj: okno }, dane, zegar).biegi[0];
    expect(a.nagranie?.length).toBeGreaterThan(0);
    const roznica = pierwszaRoznica(odkodujWywolania(a.nagranie!), odkodujWywolania(b.nagranie!));
    expect(roznica).not.toBeNull();
    expect(roznica!.a?.[0]).toBe('hypot');
    expect(roznica!.b?.[0]).toBe('hypot');
    expect(roznica!.a?.[2]).not.toBe(roznica!.b?.[2]);

    // stos tego wywołania w czystym przebiegu prowadzi do kodu symulacji
    const ze = uruchom({ ...z, nagraj: { ...okno, stosPrzy: roznica!.i } }, dane, zegar).biegi[0];
    expect(ze.stos).toMatch(/src\/(sim|world|gov)\/\w+\.ts:\d+:\d+/);
  });

  it('nagrywanie nie zmienia skrótów, a nagranie tej samej godziny jest powtarzalne', () => {
    const okno = { od: 800, do: 1600 };
    const bez = uruchom(z, dane, zegar).biegi[0].skroty;
    const a = uruchom({ ...z, nagraj: okno }, dane, zegar).biegi[0];
    const b = uruchom({ ...z, nagraj: okno }, dane, zegar).biegi[0];
    expect(a.skroty).toEqual(bez);
    expect(pierwszaRoznica(odkodujWywolania(a.nagranie!), odkodujWywolania(b.nagranie!))).toBeNull();
  });
});
