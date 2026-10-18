/* Tryb gry wybierany na ekranie startowym: zwykły (szabrownicy, zima, uchwały) albo zombie (siatka wzmocniona,
   za nią szwendacze, nocą stado). Zapis sprzed trybów nie ma pola mode i gra się jako zwykły. */

export type GameMode = 'zwykly' | 'zombie';

export const GAME_MODES: readonly GameMode[] = ['zwykly', 'zombie'];

/** tryb ze stanu symulacji albo zarządu; bez pola (stary zapis) zwykły */
export const modeOf = (st: { mode?: GameMode }): GameMode => (st.mode === 'zombie' ? 'zombie' : 'zwykly');

/** tryb z napisu (adres strony, przełącznik): wszystko poza 'zombie' to zwykły */
export const parseMode = (s: string | null | undefined): GameMode => (s === 'zombie' ? 'zombie' : 'zwykly');
