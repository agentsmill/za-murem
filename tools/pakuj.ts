/* Pakowanie prostokątów (klatek animacji) w atlas o danej szerokości: półki od najwyższych klatek, odstęp między
   klatkami, żeby skalowanie w grze nie łapało sąsiedniej klatki. Deterministyczne (ta sama lista daje te same miejsca). */

export interface Rozmiar {
  w: number;
  h: number;
}

/** miejsca klatek w kolejności wejścia (lewy górny róg) i wysokość atlasu */
export function pakuj(
  klatki: readonly Rozmiar[],
  szerokosc: number,
  odstep: number,
): { miejsca: { x: number; y: number }[]; wysokosc: number } {
  const miejsca = new Array<{ x: number; y: number }>(klatki.length);
  // od najwyższych, przy równej wysokości od najszerszych, przy równych rozmiarach po kolei
  const kolej = klatki.map((_, i) => i).sort((a, b) => klatki[b].h - klatki[a].h || klatki[b].w - klatki[a].w || a - b);
  let x = 0;
  let y = 0;
  let polka = 0;
  for (const i of kolej) {
    const { w, h } = klatki[i];
    if (w > szerokosc) throw new Error(`klatka ${i} (${w}×${h}) jest szersza od atlasu (${szerokosc})`);
    if (x + w > szerokosc) {
      x = 0;
      y += polka + odstep;
      polka = 0;
    }
    miejsca[i] = { x, y };
    x += w + odstep;
    polka = Math.max(polka, h);
  }
  return { miejsca, wysokosc: klatki.length ? y + polka : 0 };
}
