import { describe, expect, it } from 'vitest';
import { kluczAnimacji, numerKlatki } from '../../src/render/art/animacjePozy.ts';
import { POSE_FRAMES, POSES } from '../../src/render/art/people.ts';
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
