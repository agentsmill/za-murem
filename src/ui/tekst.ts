/* Drobiazgi do tekstów interfejsu: ucieczka HTML, liczby po polsku (przecinek, prawdziwy minus). */

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 1.5 → „1,5”, −2 → „−2” */
export const num = (v: number, digits = 1): string => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return String(Math.abs(r))
    .replace('.', ',')
    .replace(/^/, r < 0 ? '−' : '');
};

/** ze znakiem: „+1,5”, „−2”, „0” */
export const signed = (v: number, digits = 1): string => {
  const s = num(v, digits);
  return s === '0' || s.startsWith('−') ? s : `+${s}`;
};

/** „12°C”, „−3°C” */
export const deg = (t: number): string => `${num(t, 0)}°C`;

/** 0.33 → „33%” */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;
