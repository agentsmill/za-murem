/* Przejścia postaci z PixelLab między staniem a leżeniem w widoku: kładzenie się na podłodze, wstawanie z niej i upadek
   przy śmierci. Symulacja ich nie zna (pionek od razu śpi albo wstaje, zmarły zostawia zwłoki), więc widok sam wykrywa
   zmianę stanu (PoseView.lie, pojawienie się zwłok), uruchamia animację z atlasu i gra ją raz, od początku do końca.
   Stan jest tylko w widoku, nigdy w SimState; czas to czas gry w sekundach (zegar widoku), więc przejście staje razem
   z grą i przyspiesza z jej tempem. Pierwsza obserwacja pionka albo zwłok niczego nie uruchamia: wczytana gra ma
   leżących i zmarłych od razu. Czyste klasy bez PixiJS; klatki animacji wybiera ludziePixellab.ts. */

import type { Lie } from './art/people.ts';

/**
 * Strona głowy leżącego na podłodze (1 prawo, 3 lewo: leży zawsze poziomo) według kierunku pionka (0 południe, 1 północ,
 * 2 zachód, 3 wschód). Tak kończy się upadek w tym kierunku (południe głową w lewo, północ i zachód w prawo, wschód to
 * odbicie zachodu), więc leżenie po upadku, komórka leżenia i wstawanie stoją po tej samej stronie.
 */
export const STRONA_PODLOGI = [3, 1, 1, 3] as const;

/** kierunek animacji kładzenia się i wstawania (kierunki pionka: 2 zachód, 3 wschód = jego odbicie) dla strony głowy:
    wstawanie jest tylko na zachód, głową w prawo, a na lewą stronę gra się jego lustro */
export function kierunekAnimacjiLezenia(strona: number): number {
  return strona === 1 ? 2 : 3;
}

/** kierunek upadku zwłok bez znanego kierunku zgonu: z numeru rzeczy (ten sam przy każdym wczytaniu) */
export function kierunekZwlok(id: number): number {
  return id & 3;
}

/**
 * Przejście pionka w toku: rodzaj, czas gry (s), od którego gra, punkt pionka (kafelki) i jego kierunek: kładzenie
 * zaczyna się tam, gdzie pionek stoi, w jego kierunku; wstawanie tam, gdzie leżał, w kierunku z chwili leżenia (od
 * pobudki pionek zdążył już ruszyć i się obrócić), a kończy tam, gdzie pionek jest teraz.
 */
export interface PrzejsciePionka {
  rodzaj: 'kladzenie' | 'wstawanie';
  start: number;
  x: number;
  y: number;
  dir: number;
}

interface Stan {
  lezy: Lie | null;
  x: number;
  y: number;
  dir: number;
}

/**
 * Wykrywa kładzenie się i wstawanie pionków po zmianie leżenia w pozie (raz na klatkę, `obserwuj`). Tylko leżenie na
 * podłodze: łóżko ma własną komórkę (głowa i koc) i pionek poziomo na nim nie leży, więc w łóżku nie ma przejść.
 * Widok pyta o aktywne przejście i kończy je (`zakoncz`), gdy animacja się skończy albo postać jej nie ma.
 */
export class PrzejsciaPionkow {
  private readonly stan = new Map<number, Stan>();
  private readonly biezace = new Map<number, PrzejsciePionka>();

  /** pionek o numerze id leży (`lezy`: rodzaj leżenia z pozy albo null) w chwili t, na punkcie (x, y) kafelków, patrzy w
      kierunku dir */
  obserwuj(id: number, lezy: Lie | null, t: number, x: number, y: number, dir: number): void {
    const s = this.stan.get(id);
    if (!s) {
      this.stan.set(id, { lezy, x, y, dir });
      return;
    }
    if (s.lezy === null && lezy === 'floor') this.biezace.set(id, { rodzaj: 'kladzenie', start: t, x, y, dir });
    else if (s.lezy === 'floor' && lezy === null)
      this.biezace.set(id, { rodzaj: 'wstawanie', start: t, x: s.x, y: s.y, dir: s.dir });
    s.lezy = lezy;
    // leżący nie rusza się z miejsca, więc punkt i kierunek z ostatniej klatki leżenia to to, z czego wstaje
    if (lezy !== null) {
      s.x = x;
      s.y = y;
      s.dir = dir;
    }
  }

  aktywne(id: number): PrzejsciePionka | null {
    return this.biezace.get(id) ?? null;
  }

  /** animacja się skończyła (albo postać jej nie ma): przejście znika */
  zakoncz(id: number): void {
    this.biezace.delete(id);
  }

  /** pionek zniknął z gry: ten sam numer później to już ktoś nowy */
  zapomnij(id: number): void {
    this.stan.delete(id);
    this.biezace.delete(id);
  }
}

/**
 * Zwłoki, które powstały podczas gry (tylko te grają upadek): zwłoki obecne w pierwszej klatce widoku, czyli z wczytanej
 * gry, leżą od razu. Pamięta też ostatni kierunek członka zarządu, to, czy leżał, i jego wersję kolorystyczną (po
 * indeksie osoby), bo pionek znika w tym samym ticku, w którym powstają jego zwłoki: upadek ma zacząć się w jego
 * kierunku i w jego ubraniu (kolor nie skacze do oryginału), a ktoś, kto zginął we śnie, nie wstaje po to, żeby upaść
 * (zwłoki leżą od razu).
 */
export class NoweZwloki {
  private readonly znane = new Set<number>();
  private readonly kierunki = new Map<number, { dir: number; lezy: boolean; wersja: number }>();
  private pierwsza = true;

  /** czy rzecz o tym id właśnie powstała podczas gry (tylko przy pierwszym pytaniu o nią) */
  nowe(id: number): boolean {
    if (this.znane.has(id)) return false;
    this.znane.add(id);
    return !this.pierwsza;
  }

  /** koniec klatki: od następnej każde nieznane id to zgon, który zdarzył się podczas gry */
  koniecKlatki(): void {
    this.pierwsza = false;
  }

  /** członek zarządu o indeksie osoby patrzył w kierunku dir, (nie) leżał i miał ubranie w wersji kolorystycznej
      `wersja` w ostatniej widzianej klatce */
  zapamietaj(osoba: number, dir: number, lezy: boolean, wersja = 0): void {
    this.kierunki.set(osoba, { dir: dir & 3, lezy, wersja });
  }

  /** wersja kolorystyczna osoby z ostatniej widzianej klatki albo undefined (nikogo takiego nie widziano) */
  wersjaZgonu(osoba: number): number | undefined {
    return this.kierunki.get(osoba)?.wersja;
  }

  /** kierunek upadku zwłok o numerze rzeczy `idZwlok` po osobie zmarłego (−1: nie wiadomo): ostatni znany albo z numeru rzeczy */
  kierunekZgonu(osoba: number, idZwlok: number): number {
    return this.kierunki.get(osoba)?.dir ?? kierunekZwlok(idZwlok);
  }

  /** czy osoba leżała (spała) w ostatniej widzianej klatce przed śmiercią */
  lezal(osoba: number): boolean {
    return this.kierunki.get(osoba)?.lezy ?? false;
  }
}
