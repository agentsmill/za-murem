/* Angielskie nazwy zawodów mieszkańców z adresu do rysowania (docs/superpowers/specs/2026-10-18-angielski-design.md).
   W stanie gry zawód osoby z generatora to polski napis w formie płci (fach na 2051, dawny zawód albo „dziecko”,
   „mieszkanka”, „mieszkaniec”); ta tablica tłumaczy go po napisie, bez względu na formę. `zawodEn` z
   src/content/data.en.ts zagląda tu po zawodach spoza tablicy z 0.3. Polskie nazwy zostają w fachy.ts bez zmian. */

/** polska nazwa (męska albo żeńska, jak w stanie gry) → angielska */
export const ZAWODY_MIESZKANCOW_EN: Readonly<Record<string, string>> = {
  dziecko: 'child',
  mieszkanka: 'resident',
  mieszkaniec: 'resident',
};

/** zawód osoby z generatora po angielsku albo undefined, gdy tablica go nie zna */
export const mieszkancyEn = (prof: string): string | undefined => ZAWODY_MIESZKANCOW_EN[prof];
