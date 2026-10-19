/* Poza pionka z gry (poses.ts) → animacja postaci z PixelLab (klucz pracy w atlasie ludzi, tools/atlasy.ts) i numer
   klatki. Gra ma pozy o 1 do 4 klatkach, PixelLab animacje o własnej liczbie klatek, więc klatkę wybiera się z kroku
   pionka (chód i noszenie), z czasu (praca w pętli) albo z fazy ciosu (klatka z gry rozciągnięta na całą animację).
   Przejścia między staniem a leżeniem (kładzenie się, wstawanie, upadek przy śmierci) nie są pozami z gry: widok
   uruchamia je przy zmianie stanu i gra raz, od początku do końca (PRZEJSCIA, numerKlatkiPrzejscia). Czyste funkcje
   bez PixiJS. */

import type { Pose } from './people.ts';

/** o ile pikseli nad punktem pionka (stopami stojącego) leży środek jego leżącego ciała: tak jak środek komórki
    leżenia z kodu na podłodze (poses.ts: lie.y = y · 32 + głowa − 26, a komórka LIE = 48 ma środek w 24). W tym
    miejscu kotwiczy się ostatnią klatkę upadku i pierwszą klatkę wstawania (tools/ludzie.ts), więc przejście kończy
    się dokładnie tam, gdzie zaczyna się leżenie. */
export const SRODEK_LEZACEGO = 2;

/**
 * Przejścia postaci z PixelLab: animacja w atlasie ludzi (klucz), czy gra od końca i tempo w klatkach na sekundę gry.
 * Kładzenie się to wstawanie od tyłu (stoi → przysiad → półsiad), więc obie mają jedną animację z PixelLab (szablon
 * `getting-up`), a upadek przy śmierci to szablon `falling-back-death`.
 */
export const PRZEJSCIA = {
  kladzenie: { klucz: 'wstawanie', wstecz: true, tempo: 8 },
  wstawanie: { klucz: 'wstawanie', wstecz: false, tempo: 8 },
  smierc: { klucz: 'smierc', wstecz: false, tempo: 10 },
} as const satisfies Record<string, { klucz: string; wstecz: boolean; tempo: number }>;

export type RodzajPrzejscia = keyof typeof PRZEJSCIA;

/** ile sekund gry trwa przejście o n klatkach */
export function czasPrzejscia(rodzaj: RodzajPrzejscia, n: number): number {
  return n / PRZEJSCIA[rodzaj].tempo;
}

/**
 * Numer klatki animacji o n klatkach po `czas` sekundach od początku przejścia, albo null, gdy już się skończyło.
 * Czas sprzed początku (zegar widoku o ułamek przed startem) stoi na pierwszej klatce.
 */
export function numerKlatkiPrzejscia(rodzaj: RodzajPrzejscia, czas: number, n: number): number | null {
  const { tempo, wstecz } = PRZEJSCIA[rodzaj];
  const i = Math.max(0, Math.floor(czas * tempo));
  if (i >= n) return null;
  return wstecz ? n - 1 - i : i;
}

/** klucz pracy w atlasie ludzi dla pozy; stojący (nie idzie) pionek w pozie chodu to oddech */
export function kluczAnimacji(pose: Pose, idzie: boolean): string {
  switch (pose) {
    case 'walk':
      return idzie ? 'chod' : 'stanie';
    case 'carry':
      return 'niesienie';
    case 'chop':
      return 'rabanie';
    case 'crouch':
      return 'klekanie';
    case 'cook':
      return 'gotowanie';
    case 'sit':
    case 'doze':
      return 'siedzenie';
    case 'guard':
      return 'warta';
    case 'swing':
      return 'cios';
    case 'aim':
      return 'celowanie';
    case 'search':
      return 'przeszukiwanie';
    case 'hammer':
      return 'mlotek';
    case 'planks':
      return 'deski';
    case 'scrap':
      return 'zlom';
  }
}

/** tempo pętli w klatkach na sekundę gry (pracę każdy pionek zaczyna w innej chwili: tt ma jego przesunięcie) */
const TEMPO = { stanie: 1.5, rabanie: 5, gotowanie: 2.5, warta: 1.5, przeszukiwanie: 3.2, mlotek: 6 } as const;

const w = (tt: number, tempo: number, n: number) => Math.floor(tt * tempo) % n;

/**
 * Numer klatki animacji o n klatkach. frame to klatka z gry (krok chodu 0 do 3, faza ciosu, klęczenia), tt czas
 * pionka w sekundach gry. Siedzenie i drzemka stoją na ostatniej klatce (siedzi), klęczenie po klęknięciu trzyma
 * ostatnie klatki (dokładanie do kozy rusza przedostatnią), cios i strzał rozciągają klatki z gry na animację.
 */
export function numerKlatki(pose: Pose, frame: number, idzie: boolean, tt: number, n: number): number {
  const ostatnia = n - 1;
  switch (pose) {
    case 'walk':
      return idzie ? frame % n : w(tt, TEMPO.stanie, n);
    case 'carry':
    case 'planks':
    case 'scrap':
      return frame % n;
    case 'chop':
      return w(tt, TEMPO.rabanie, n);
    case 'cook':
      return w(tt, TEMPO.gotowanie, n);
    case 'guard':
      return w(tt, TEMPO.warta, n);
    case 'search':
      return w(tt, TEMPO.przeszukiwanie, n);
    case 'hammer':
      return w(tt, TEMPO.mlotek, n);
    case 'sit':
    case 'doze':
      return ostatnia;
    case 'crouch':
      // 0 klęczy w bezruchu, 1 i 2 dokładają do kozy (na zmianę)
      return frame === 1 ? Math.max(0, ostatnia - 1) : ostatnia;
    case 'swing': {
      // 0 gotowy, 1 zamach, 2 uderzenie
      const sr = Math.floor(n / 2);
      return frame === 0 ? 0 : frame === 1 ? Math.min(sr, ostatnia) : ostatnia;
    }
    case 'aim':
      return frame === 0 ? 0 : Math.min(1, ostatnia);
  }
}
