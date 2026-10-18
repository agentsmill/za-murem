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
/** Napór na siatkę, łatę i zasieki (docs/POSTEP.md, „Płot odporny na napór”). Kilku szwendaczy siatki nie przewróci:
    konstrukcję niszczy dopiero tłok, czyli więcej niż FENCE_BEARS napierających w promieniu CROWD_RADIUS kafelków od
    naciskanego miejsca (liczy się razem z nim). Poniżej progu napierający tylko zużywają kafelek (PUSH_WEAR na krok,
    nie poniżej FENCE_FLOOR), powyżej każdy zdejmuje jeszcze PUSH_SURGE razy tylu, ilu jest ponad próg. Tak tłum
    18 szwendaczy zbija świeży kafelek w niecałe dwie godziny gry, 22 w trzy kwadranse, 30 w kwadrans, a 16 nie zbije
    go nigdy (wszyscy na jednym kafelku; rozsiani po siatce zużywają ją tylko). */
export const CROWD_RADIUS = 2;
export const FENCE_BEARS = 16;
export const FENCE_FLOOR = 25;
export const PUSH_WEAR = 0.002;
export const PUSH_SURGE = 0.001;

/** Wytrzymałość kafelka (0–100), którą w jednym kroku zdejmuje jeden napierający, gdy w tłoku napiera `crowd`
    szwendaczy (z nim), a kafelek ma `hp`. */
export function pushOf(crowd: number, hp: number): number {
  if (crowd > FENCE_BEARS) return PUSH_WEAR + PUSH_SURGE * (crowd - FENCE_BEARS);
  return Math.max(0, Math.min(PUSH_WEAR, hp - FENCE_FLOOR));
}

/** Tłok przy kafelku: ilu napierających jest w promieniu CROWD_RADIUS od niego. `pressing` to liczba napierających
    według naciskanego kafelka (kafelek siatki → ilu na niego napiera). */
export function crowdNear(pressing: ReadonlyMap<number, number>, size: number, tile: number): number {
  const x = tile % size;
  const y = Math.floor(tile / size);
  let n = 0;
  for (let dy = -CROWD_RADIUS; dy <= CROWD_RADIUS; dy++)
    for (let dx = -CROWD_RADIUS; dx <= CROWD_RADIUS; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) n += pressing.get(ny * size + nx) ?? 0;
    }
  return n;
}

/** ugryzienie: zasięg w metrach, kroki między ugryzieniami, obrażenia, szansa trafienia */
export const BITE_REACH = 1.1;
export const BITE_CD = 30;
export const BITE_DMG = 15;
export const BITE_HIT = 0.7;
/** kto walczy albo trzyma wartę (patrzy na szwendacza), tego trudniej ugryźć */
export const BITE_HIT_FIGHTING = 0.35;
/** stado wychodzi z okolicy (RING_FROM–RING_TO) od 21:00 do 1:00, o 6:00 się rozchodzi */
export const HORDE_FROM = 21;
export const HORDE_HOURS = 4;
export const DISPERSE = 6;
/** pas za dnia: szwendacze rodzą się od FAR do NEAR metrów drogi od siatki i snują się nie dalej niż NEAR,
    więc widać ich z podwórka (Walking Dead: ciągnie ich tam, gdzie są ludzie) */
export const FAR = 15;
export const NEAR = 40;
/** stado wychodzi z okolicy: od RING_FROM do RING_TO metrów drogi od siatki, poza kadrem podwórka, a pod siatką
    jest po godzinie, półtorej */
export const RING_FROM = 50;
export const RING_TO = 80;
/** szansa, że krok snucia idzie ku siatce: z pasa pod siatkę w około 4 godziny */
export const DAY_PULL = 0.25;

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
