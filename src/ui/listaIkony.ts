/* Ikony znaczników stanu na liście ludzi (src/ui/lista.ts): małe kształty SVG w siatce 16 × 16, kolorowane przez
   `currentColor` (kolor wynika z poziomu znacznika w lista.css). Dla każdego rodzaju znacznika jeden prosty, czytelny
   kształt: czaszka (ugryzienie, czyli gorączka, po której osoba umrze), krzyż (rana), widelec (głód), płatek śniegu
   (zimno), „Zz” (sen), tarcza (warta), drzwi ze strzałką (wyprawa), kolba (badania); do tego celownik kamery. Czyste
   napisy bez DOM, żeby dało się je sprawdzić w Node. */

import type { RodzajZnacznika } from './lista.ts';

/** ciemny kolor oczu czaszki: ten sam co tło portretu */
const OCZY = '#1d2023';
const KRESKA = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

const KSZTALTY: Record<RodzajZnacznika | 'sledzi', string> = {
  ugryzienie: `<circle cx="8" cy="7" r="5.5"/><rect x="5.3" y="10" width="5.4" height="4.8" rx=".6"/><circle cx="5.9" cy="7.2" r="1.5" fill="${OCZY}"/><circle cx="10.1" cy="7.2" r="1.5" fill="${OCZY}"/><path d="M7.1 11.7v3M8.9 11.7v3" stroke="${OCZY}" stroke-width=".8"/>`,
  rana: '<path d="M6 1.5h4V6h4.5v4H10v4.5H6V10H1.5V6H6z"/>',
  glod: '<path d="M5 1.5h1.4V6h.9V1.5h1.4V6h.9V1.5H11v5.6c0 1.2-.9 2.1-2.3 2.3v5.1H7.3V9.4C5.9 9.2 5 8.3 5 7.1z"/>',
  zimno: `<path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5" ${KRESKA} stroke-width="1.7"/>`,
  sen: `<path d="M3 3h5.5L3 9.5h5.5M9.5 9h4l-4 5h4" ${KRESKA} stroke-width="1.6"/>`,
  warta: '<path d="M8 1.2l5.6 2v4.5c0 3.4-2.4 5.6-5.6 7.1-3.2-1.5-5.6-3.7-5.6-7.1V3.2z"/>',
  wyprawa: `<path d="M6.5 2.5H3v11h3.5M6 8h8M10.8 4.8L14 8l-3.2 3.2" ${KRESKA} stroke-width="1.6"/>`,
  badania: '<path d="M5.5 1h5v1.4H9.6v3.6l4.3 7.2c.6 1-.1 2.3-1.3 2.3H3.4c-1.2 0-1.9-1.3-1.3-2.3L6.4 6V2.4H5.5z"/>',
  sledzi: `<circle cx="8" cy="8" r="3.6" ${KRESKA} stroke-width="1.5"/><path d="M8 1v3.2M8 11.8V15M1 8h3.2M11.8 8H15" ${KRESKA} stroke-width="1.5"/>`,
};

/** ikona znacznika (albo celownika kamery, `sledzi`) jako element `<svg>` wypełniający swoje pudełko */
export const ikona = (rodzaj: RodzajZnacznika | 'sledzi'): string =>
  `<svg viewBox="0 0 16 16" width="100%" height="100%" fill="currentColor" aria-hidden="true" focusable="false">${KSZTALTY[rodzaj]}</svg>`;
