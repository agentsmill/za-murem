/* Mysz i gładzik: Ctrl+klik jako prawy przycisk i rozpoznanie zdarzeń wheel (src/ui/sterowanie.ts). */

import { describe, expect, it } from 'vitest';
import { GESTURE_MS, NOTCH, pointerButton, wheelKind, zoomFactor } from '../../src/ui/sterowanie.ts';

const wheel = (o: { dx?: number; dy?: number; mode?: number; ctrl?: boolean }) => ({
  deltaX: o.dx ?? 0,
  deltaY: o.dy ?? 0,
  deltaMode: o.mode ?? 0,
  ctrlKey: !!o.ctrl,
});

describe('Ctrl+klik', () => {
  it('lewy przycisk myszy z Ctrl to prawy, reszta bez zmian', () => {
    expect(pointerButton({ pointerType: 'mouse', button: 0, ctrlKey: true })).toBe(2);
    expect(pointerButton({ pointerType: 'mouse', button: 0, ctrlKey: false })).toBe(0);
    expect(pointerButton({ pointerType: 'mouse', button: 2, ctrlKey: false })).toBe(2);
    expect(pointerButton({ pointerType: 'mouse', button: 1, ctrlKey: true })).toBe(1);
    // dotyk i rysik bez zmian (Ctrl przy stuknięciu nic nie znaczy)
    expect(pointerButton({ pointerType: 'touch', button: 0, ctrlKey: true })).toBe(0);
  });
});

describe('wheel: szczypanie, gładzik, kółko', () => {
  const now = 10_000;
  const long = now - GESTURE_MS - 1;
  it('ctrlKey to szczypanie, linie i strony to kółko', () => {
    expect(wheelKind(wheel({ dy: -3.5, ctrl: true }), now, long)).toBe('pinch');
    expect(wheelKind(wheel({ dy: 3, mode: 1 }), now, long)).toBe('zoom');
    expect(wheelKind(wheel({ dy: 1, mode: 2 }), now, long)).toBe('zoom');
  });
  it('kółko myszy: duże równe kroki w pionie (Windows ±100 i ±120, Chrome na Macu ±40 i więcej)', () => {
    for (const dy of [100, -100, 120, -120, NOTCH, -80])
      expect(wheelKind(wheel({ dy }), now, long), `${dy}`).toBe('zoom');
  });
  it('gładzik: małe albo ułamkowe delty i ruch w poziomie przesuwają mapę', () => {
    for (const o of [{ dy: 6 }, { dy: -2 }, { dy: 52.5 }, { dx: 30, dy: 2 }, { dx: -100 }, { dx: 4, dy: 100 }])
      expect(wheelKind(wheel(o), now, long), JSON.stringify(o)).toBe('pan');
  });
  it('w trakcie gestu gładzika duże delty (bezwładność) dalej przesuwają, po przerwie kółko przybliża', () => {
    expect(wheelKind(wheel({ dy: 100 }), now, now - 50)).toBe('pan');
    expect(wheelKind(wheel({ dy: 100 }), now, now - GESTURE_MS - 1)).toBe('zoom');
  });
  it('szczypanie przybliża mocniej niż kółko, linie Firefoksa jak 40 pikseli', () => {
    expect(zoomFactor('pinch', { deltaY: -10, deltaMode: 0 })).toBeCloseTo(Math.exp(0.1), 6);
    expect(zoomFactor('zoom', { deltaY: -100, deltaMode: 0 })).toBeCloseTo(Math.exp(0.15), 6);
    expect(zoomFactor('zoom', { deltaY: 3, deltaMode: 1 })).toBeCloseTo(Math.exp(-120 * 0.0015), 6);
    expect(zoomFactor('pinch', { deltaY: -10, deltaMode: 0 })).toBeGreaterThan(
      zoomFactor('zoom', { deltaY: -10, deltaMode: 0 }),
    );
  });
});
