import { describe, expect, it } from 'vitest';
import {
  czasPrzejscia,
  kluczAnimacji,
  numerKlatki,
  numerKlatkiPrzejscia,
  PRZEJSCIA,
  SRODEK_LEZACEGO,
} from '../../src/render/art/animacjePozy.ts';
import { LIE, lieHead, POSE_FRAMES, POSES } from '../../src/render/art/people.ts';
import { type PawnLike, poseOf } from '../../src/render/poses.ts';
import { PRACE } from '../../tools/atlasy.ts';

describe('poza pionka z gry → animacja PixelLab', () => {
  it('każda poza ma animację, a wszystkie animacje są prawdziwymi pracami z atlasu ludzi', () => {
    const klucze = new Set<string>();
    for (const pose of POSES)
      for (const idzie of [true, false]) {
        const k = kluczAnimacji(pose, idzie);
        expect(Object.keys(PRACE), `${pose} idzie=${idzie} → ${k}`).toContain(k);
        klucze.add(k);
      }
    // przejścia (upadek, wstawanie) nie są pozami z gry, ale też mają swoje prace w atlasie
    for (const { klucz } of Object.values(PRZEJSCIA)) klucze.add(klucz);
    // atlas nie ma pracy, której gra nigdy nie pokaże
    expect([...klucze].sort()).toEqual(Object.keys(PRACE).sort());
  });

  it('chód idzie z kroku pionka, stanie z czasu; z tej samej pozy chodu różne animacje', () => {
    expect(kluczAnimacji('walk', true)).toBe('chod');
    expect(kluczAnimacji('walk', false)).toBe('stanie');
    expect([0, 1, 2, 3].map((f) => numerKlatki('walk', f, true, 12.3, 4))).toEqual([0, 1, 2, 3]);
    const stanie = new Set(Array.from({ length: 80 }, (_, i) => numerKlatki('walk', 0, false, i / 10, 4)));
    expect([...stanie].sort()).toEqual([0, 1, 2, 3]);
  });

  it('numer klatki zawsze mieści się w animacji, dla każdej pozy, klatki z gry, czasu i długości animacji', () => {
    for (const pose of POSES)
      for (let frame = 0; frame < POSE_FRAMES[pose]; frame++)
        for (const idzie of [true, false])
          for (let n = 1; n <= 9; n++)
            for (let t = 0; t < 30; t += 0.37) {
              const k = numerKlatki(pose, frame, idzie, t, n);
              expect(Number.isInteger(k) && k >= 0 && k < n, `${pose} f${frame} n${n} t${t} → ${k}`).toBe(true);
            }
  });

  it('pozy siedzące stoją na ostatniej klatce (siedzi, drzemie), a klęczenie ma trzy różne stany', () => {
    expect(numerKlatki('sit', 0, false, 4.4, 4)).toBe(3);
    expect(numerKlatki('doze', 0, false, 4.4, 4)).toBe(3);
    const kl = [0, 1, 2].map((f) => numerKlatki('crouch', f, false, 0, 6));
    expect(kl[0]).toBe(5);
    expect(new Set(kl).size).toBeGreaterThanOrEqual(2);
  });

  it('cios i strzał z gry (klatki 0, 1, 2) pokazują początek, środek i koniec animacji', () => {
    const cios = [0, 1, 2].map((f) => numerKlatki('swing', f, false, 0, 6));
    expect(cios[0]).toBe(0);
    expect(cios[0]).toBeLessThan(cios[1]);
    expect(cios[1]).toBeLessThan(cios[2]);
    expect(numerKlatki('aim', 0, false, 0, 4)).toBe(0);
    expect(numerKlatki('aim', 1, false, 0, 4)).toBeGreaterThan(0);
  });
});

describe('przejścia między staniem a leżeniem (kładzenie się, wstawanie, upadek)', () => {
  it('kładzenie się i wstawanie dzielą jedną animację, a upadek ma własną', () => {
    expect(PRZEJSCIA.wstawanie.klucz).toBe('wstawanie');
    expect(PRZEJSCIA.kladzenie.klucz).toBe('wstawanie');
    expect(PRZEJSCIA.smierc.klucz).toBe('smierc');
    expect([PRZEJSCIA.wstawanie.wstecz, PRZEJSCIA.kladzenie.wstecz, PRZEJSCIA.smierc.wstecz]).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('wstawanie i upadek grają klatki po kolei w swoim tempie, a po ostatniej się kończą (null)', () => {
    for (const rodzaj of ['wstawanie', 'smierc'] as const) {
      const { tempo } = PRZEJSCIA[rodzaj];
      for (const n of [5, 7]) {
        for (let i = 0; i < n; i++)
          expect(numerKlatkiPrzejscia(rodzaj, (i + 0.5) / tempo, n), `${rodzaj} n${n} klatka ${i}`).toBe(i);
        expect(numerKlatkiPrzejscia(rodzaj, n / tempo, n), `${rodzaj} n${n} po końcu`).toBeNull();
        expect(numerKlatkiPrzejscia(rodzaj, 100, n)).toBeNull();
      }
    }
  });

  it('kładzenie się to wstawanie od końca: zaczyna się na ostatniej klatce i kończy na pierwszej', () => {
    const { tempo } = PRZEJSCIA.kladzenie;
    for (let i = 0; i < 5; i++)
      expect(numerKlatkiPrzejscia('kladzenie', (i + 0.5) / tempo, 5), `klatka ${i}`).toBe(4 - i);
    expect(numerKlatkiPrzejscia('kladzenie', 5 / tempo, 5)).toBeNull();
  });

  it('czas przed początkiem (zegar widoku o ułamek przed startem) stoi na pierwszej klatce przejścia', () => {
    expect(numerKlatkiPrzejscia('smierc', -0.2, 7)).toBe(0);
    expect(numerKlatkiPrzejscia('wstawanie', -0.01, 5)).toBe(0);
    expect(numerKlatkiPrzejscia('kladzenie', -0.01, 5)).toBe(4);
  });

  it('czas przejścia to liczba klatek przez tempo, w sekundach gry', () => {
    expect(czasPrzejscia('smierc', 7)).toBeCloseTo(7 / PRZEJSCIA.smierc.tempo, 10);
    expect(czasPrzejscia('wstawanie', 5)).toBeCloseTo(5 / PRZEJSCIA.wstawanie.tempo, 10);
    // upadek i wstawanie trwają ułamek sekundy do półtorej, nie dłużej (gra idzie do 8× szybciej, ale przy 1× ma być żwawo)
    for (const rodzaj of ['kladzenie', 'wstawanie', 'smierc'] as const) {
      const t = czasPrzejscia(rodzaj, 7);
      expect(t, rodzaj).toBeGreaterThan(0.3);
      expect(t, rodzaj).toBeLessThan(1.5);
    }
  });

  it('środek leżącego na podłodze leży SRODEK_LEZACEGO nad punktem pionka, jak komórka leżenia z kodu w poseOf', () => {
    // klatki przejść kotwiczy się tak, żeby ostatnia klatka upadku i pierwsza wstawania stały tam, gdzie leży komórka
    for (const dir of [0, 1, 2, 3]) {
      const p: PawnLike = {
        id: 1,
        kind: 'core',
        x: 10.5,
        y: 7.5,
        dir,
        walk: 0,
        pi: 0,
        path: { length: 0 },
        carry: 0,
        job: { t: 'sleep', phase: 1, target: -1 },
      };
      const { lie } = poseOf(p, 0, []);
      expect(lie?.kind, `dir ${dir}`).toBe('floor');
      const [hx, hy] = lieHead(lie!.o);
      // środek komórki z kodu (LIE × LIE) w pikselach świata
      const cx = lie!.x - (hx - LIE / 2);
      const cy = lie!.y - (hy - LIE / 2);
      expect([cx, cy], `dir ${dir}`).toEqual([p.x * 32, p.y * 32 - SRODEK_LEZACEGO]);
    }
  });
});
