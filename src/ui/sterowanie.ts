/* Mysz i gładzik (Mac i reszta): Ctrl+klik jako prawy przycisk i rozpoznanie, co znaczy zdarzenie wheel:
   szczypanie, przesuwanie dwoma palcami po gładziku albo kółko myszy. Czyste funkcje bez DOM. */

/** Przycisk po normalizacji: Ctrl+klik lewym przyciskiem myszy to prawy (macOS: gładzik i mysz z jednym
    przyciskiem). Na wszystkich systemach, bo Ctrl+klik nie ma w grze innego znaczenia (do dokładania jest Shift). */
export function pointerButton(e: { pointerType: string; button: number; ctrlKey: boolean }): number {
  return e.pointerType === 'mouse' && e.button === 0 && e.ctrlKey ? 2 : e.button;
}

/** co zrobić ze zdarzeniem wheel: przybliżyć (szczypanie albo kółko) albo przesunąć mapę (gładzik) */
export type WheelKind = 'pinch' | 'zoom' | 'pan';

/** gest gładzika trwa tyle po ostatnim zdarzeniu (bezwładność po oderwaniu palców daje potem duże delty) */
export const GESTURE_MS = 250;
/** od tylu pikseli krok w pionie wygląda na ząbek kółka myszy (Windows i Linux ±100 albo ±120, Chrome na Macu
    z myszą ±40 i wielokrotności) */
export const NOTCH = 40;

/** Rozpoznanie zdarzenia wheel:
    - ctrlKey: szczypanie na gładziku (Chrome i Firefox wysyłają je jako wheel z ctrlKey) albo Ctrl i kółko;
    - deltaMode 1 albo 2 (linie, strony; Firefox z kółkiem myszy): kółko;
    - w pikselach: ząbek kółka to krok tylko w pionie, w całych pikselach, co najmniej NOTCH, i nie w trakcie
      gestu gładzika (lastPan: chwila ostatniego zdarzenia uznanego za gładzik, now: teraz, w ms);
    - reszta (małe albo ułamkowe delty, ruch w poziomie, bezwładność gestu): gładzik, czyli przesuwanie. */
export function wheelKind(
  e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean },
  now: number,
  lastPan: number,
): WheelKind {
  if (e.ctrlKey) return 'pinch';
  if (e.deltaMode !== 0) return 'zoom';
  const notch = e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= NOTCH;
  return notch && now - lastPan > GESTURE_MS ? 'zoom' : 'pan';
}

/** mnożnik przybliżenia: kółko jak dotąd, szczypanie mocniej, bo jego delty są małe (kilka pikseli) */
export const zoomFactor = (kind: 'pinch' | 'zoom', e: { deltaY: number; deltaMode: number }): number => {
  // linie (Firefox): jedna linia jak 40 pikseli
  const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  return Math.exp(-dy * (kind === 'pinch' ? 0.01 : 0.0015));
};
