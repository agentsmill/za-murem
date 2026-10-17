/* Szwendacze w trybie zombie (docs/superpowers/specs/2026-10-17-tryb-zombie-design.md): liczebność za dnia
   i stada nocą, prędkość, zmysły, napór na siatkę i pole odległości do siatki. Czyste liczby i funkcje bez stanu;
   ruch, napór i gonitwę prowadzi Sim (src/sim/sim.ts, sekcja „szwendacze”). */

/** życie szwendacza: dwa ciosy nożem albo dzidą, jeden strzał */
export const ZOMBIE_HP = 60;
/** najwięcej szwendaczy naraz na mapie (wydajność i czytelność) */
export const MAX_ZOMBIES = 80;
/** prędkość względem człowieka: snuje się, a za widzianą ofiarą trochę szybciej */
export const ZOMBIE_SPEED = 0.35;
export const CHASE_SPEED = 0.5;
/** wzrok w metrach: za dnia, nocą, nocą na człowieka w świetle */
export const SIGHT_DAY = 10;
export const SIGHT_NIGHT = 5;
/** napór: tyle wytrzymałości kafelka siatki zdejmuje jeden szwendacz na krok (3,2 na godzinę gry) */
export const PUSH = 0.004;
/** ugryzienie: zasięg w metrach, kroki między ugryzieniami, obrażenia, szansa trafienia */
export const BITE_REACH = 1.1;
export const BITE_CD = 30;
export const BITE_DMG = 15;
export const BITE_HIT = 0.7;
/** stado wychodzi z krawędzi mapy od 21:00 do 1:00, o 6:00 się rozchodzi */
export const HORDE_FROM = 21;
export const HORDE_HOURS = 4;
export const DISPERSE = 6;
/** daleko od siatki: tu snują się szwendacze za dnia (metry po stronie ulicy) */
export const FAR = 15;

/** ilu szwendaczy snuje się za dnia */
export const ambientCount = (day: number): number => Math.min(30, 6 + 2 * day);
/** ilu przychodzi nocą w stadzie */
export const hordeSize = (day: number): number => Math.min(60, 8 + 6 * (day - 1));

/** Odległość w krokach (4 sąsiadów) od najbliższego kafelka startowego po przechodnich kafelkach; −1: nie dojść. */
export function distField(blocked: Uint8Array, size: number, seeds: readonly number[]): Int32Array {
  const dist = new Int32Array(size * size).fill(-1);
  const q = new Int32Array(size * size);
  let qn = 0;
  for (const s of seeds)
    if (!blocked[s] && dist[s] < 0) {
      dist[s] = 0;
      q[qn++] = s;
    }
  for (let qi = 0; qi < qn; qi++) {
    const c = q[qi];
    const x = c % size;
    const d = dist[c] + 1;
    if (x > 0 && !blocked[c - 1] && dist[c - 1] < 0) {
      dist[c - 1] = d;
      q[qn++] = c - 1;
    }
    if (x < size - 1 && !blocked[c + 1] && dist[c + 1] < 0) {
      dist[c + 1] = d;
      q[qn++] = c + 1;
    }
    if (c >= size && !blocked[c - size] && dist[c - size] < 0) {
      dist[c - size] = d;
      q[qn++] = c - size;
    }
    if (c < size * (size - 1) && !blocked[c + size] && dist[c + size] < 0) {
      dist[c + size] = d;
      q[qn++] = c + size;
    }
  }
  return dist;
}
