/* Stany mieszkań i uszkodzenia (docs/M2-fala-1.md). Kontrakt: świat wypełnia, symulacja, rysowanie i
   interfejs czytają. Do czasu generatora mieszkańców z adresu stany losuje świat z ziarna budynku;
   generator poda je potem w tym samym kształcie. */

/** dlaczego mieszkanie jest puste */
export type AptWhy = 'wyjazd' | 'wymarcie' | 'splądrowanie' | 'zalanie' | 'pozar';

export interface AptState {
  /** budynek i numer mieszkania z wnętrza (Room.apt) */
  bid: number;
  apt: number;
  state: 'zarzad' | 'mieszkancy' | 'puste';
  why?: AptWhy;
  /** rok opuszczenia (2026–2051) */
  year?: number;
}

export type DamageKind = 'okno' | 'drzwi' | 'rura' | 'podloga' | 'piec';

export interface Damage {
  kind: DamageKind;
  /** kafelek uszkodzenia (okno i drzwi: kafelek ściany albo drzwi, reszta: posadzka) */
  tile: number;
  bid: number;
  apt: number;
}
