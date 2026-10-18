import { describe, expect, it } from 'vitest';
import {
  kierunekAnimacjiLezenia,
  kierunekZwlok,
  NoweZwloki,
  PrzejsciaPionkow,
  STRONA_PODLOGI,
} from '../../src/render/przejscia.ts';

describe('strona głowy leżącego na podłodze według kierunku pionka', () => {
  it('pasuje do ostatnich klatek upadku: południe głową w lewo, północ i zachód w prawo, wschód (odbicie zachodu) w lewo', () => {
    // kierunki pionka: 0 południe, 1 północ, 2 zachód, 3 wschód; strony głowy: 1 prawo, 3 lewo (leży zawsze poziomo)
    expect([...STRONA_PODLOGI]).toEqual([3, 1, 1, 3]);
    for (const s of STRONA_PODLOGI) expect([1, 3]).toContain(s);
  });

  it('kierunek animacji kładzenia i wstawania to zachód (głowa w prawo) albo jego odbicie, czyli wschód (głowa w lewo)', () => {
    expect(kierunekAnimacjiLezenia(1)).toBe(2);
    expect(kierunekAnimacjiLezenia(3)).toBe(3);
    // z kierunku pionka: ten, który upadłby głową w prawo, gra zachód; w lewo wschód
    for (let d = 0; d < 4; d++)
      expect(kierunekAnimacjiLezenia(STRONA_PODLOGI[d]), `kierunek ${d}`).toBe(STRONA_PODLOGI[d] === 1 ? 2 : 3);
  });

  it('zwłoki bez znanego kierunku zgonu biorą go z numeru rzeczy', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(kierunekZwlok)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(kierunekZwlok(993008)).toBe(0);
  });
});

describe('przejścia pionka: kładzenie się na podłodze i wstawanie z niej', () => {
  it('pierwsza obserwacja pionka niczego nie uruchamia, nawet gdy leży (wczytana gra, nowy pionek)', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, 'floor', 10, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
    p.obserwuj(2, null, 10, 3.5, 4.5, 0);
    expect(p.aktywne(2)).toBeNull();
    p.obserwuj(1, 'floor', 10.05, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
  });

  it('pionek, który zaczyna leżeć na podłodze, kładzie się od chwili zmiany stanu', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 3.5, 4.5, 0);
    p.obserwuj(1, null, 10.05, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
    p.obserwuj(1, 'floor', 10.1, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toEqual({ rodzaj: 'kladzenie', start: 10.1, x: 3.5, y: 4.5, dir: 0 });
    // leży dalej: przejście zostaje to samo, nie zaczyna się od nowa
    p.obserwuj(1, 'floor', 10.15, 3.5, 4.5, 0);
    expect(p.aktywne(1)?.start).toBe(10.1);
  });

  it('pionek, który przestaje leżeć na podłodze, wstaje: od miejsca, gdzie leżał, a nie gdzie jest teraz', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 1.5, 1.5, 0);
    p.obserwuj(1, 'floor', 11, 3.5, 4.5, 0);
    p.zakoncz(1);
    p.obserwuj(1, 'floor', 30, 3.5, 4.5, 0);
    // w chwili pobudki pionek już ruszył ścieżką
    p.obserwuj(1, null, 31, 3.8, 4.5, 0);
    expect(p.aktywne(1)).toEqual({ rodzaj: 'wstawanie', start: 31, x: 3.5, y: 4.5, dir: 0 });
  });

  it('kładzenie bierze kierunek pionka z chwili położenia się, a wstawanie ten, w którym leżał (po pobudce pionek idzie dalej)', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 3.5, 4.5, 3);
    p.obserwuj(1, 'floor', 11, 3.5, 4.5, 2);
    expect(p.aktywne(1)?.dir).toBe(2);
    p.zakoncz(1);
    p.obserwuj(1, 'floor', 30, 3.5, 4.5, 2);
    // pobudka: pionek ruszył na południe, ale leżał głową w stronę zachodniego upadku
    p.obserwuj(1, null, 31, 3.5, 4.8, 0);
    expect(p.aktywne(1)).toEqual({ rodzaj: 'wstawanie', start: 31, x: 3.5, y: 4.5, dir: 2 });
  });

  it('w łóżku nie ma przejść: ani przy kładzeniu się, ani przy wstawaniu', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 3.5, 4.5, 0);
    p.obserwuj(1, 'bed', 11, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
    p.obserwuj(1, null, 20, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
  });

  it('zakończone przejście znika, a kolejna zmiana stanu zaczyna nowe', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 3.5, 4.5, 0);
    p.obserwuj(1, 'floor', 11, 3.5, 4.5, 0);
    expect(p.aktywne(1)?.rodzaj).toBe('kladzenie');
    p.zakoncz(1);
    expect(p.aktywne(1)).toBeNull();
    p.obserwuj(1, 'floor', 12, 3.5, 4.5, 0);
    expect(p.aktywne(1)).toBeNull();
    p.obserwuj(1, null, 40, 3.5, 4.5, 0);
    expect(p.aktywne(1)?.rodzaj).toBe('wstawanie');
  });

  it('nowa zmiana stanu w trakcie przejścia zastępuje je (położył się i od razu został podniesiony)', () => {
    const p = new PrzejsciaPionkow();
    p.obserwuj(1, null, 10, 3.5, 4.5, 0);
    p.obserwuj(1, 'floor', 11, 3.5, 4.5, 0);
    p.obserwuj(1, null, 11.2, 3.6, 4.5, 0);
    expect(p.aktywne(1)).toEqual({ rodzaj: 'wstawanie', start: 11.2, x: 3.5, y: 4.5, dir: 0 });
  });

  it('pionki są niezależne, a zapomnij kasuje stan pionka, który zniknął z gry', () => {
    const p = new PrzejsciaPionkow();
    for (const id of [1, 2]) p.obserwuj(id, null, 10, 1.5, 1.5, 0);
    p.obserwuj(1, 'floor', 11, 1.5, 1.5, 0);
    expect(p.aktywne(1)?.rodzaj).toBe('kladzenie');
    expect(p.aktywne(2)).toBeNull();
    p.zapomnij(1);
    expect(p.aktywne(1)).toBeNull();
    // ten sam numer po zniknięciu to nowy pionek: pierwsza obserwacja nic nie uruchamia
    p.obserwuj(1, 'floor', 50, 1.5, 1.5, 0);
    expect(p.aktywne(1)).toBeNull();
  });
});

describe('zwłoki, które powstały podczas gry', () => {
  it('zwłoki obecne w pierwszej klatce widoku (wczytana gra) leżą od razu, późniejsze grają upadek raz', () => {
    const z = new NoweZwloki();
    expect(z.nowe(10)).toBe(false);
    expect(z.nowe(11)).toBe(false);
    // ta sama klatka: kolejne wywołanie dla tego samego id nic nie zmienia
    expect(z.nowe(10)).toBe(false);
    z.koniecKlatki();
    expect(z.nowe(10)).toBe(false);
    expect(z.nowe(12)).toBe(true);
    // każda rzecz jest nowa tylko raz
    expect(z.nowe(12)).toBe(false);
    z.koniecKlatki();
    expect(z.nowe(12)).toBe(false);
    expect(z.nowe(13)).toBe(true);
  });

  it('pamięta ostatni kierunek członka zarządu i podaje go dla jego zwłok, a bez niego bierze kierunek z numeru rzeczy', () => {
    const z = new NoweZwloki();
    z.zapamietaj(2, 1, false);
    z.zapamietaj(2, 3, false);
    z.zapamietaj(0, 2, false);
    expect(z.kierunekZgonu(2, 993008)).toBe(3);
    expect(z.kierunekZgonu(0, 993008)).toBe(2);
    // nieznana osoba albo brak osoby: z numeru rzeczy
    expect(z.kierunekZgonu(5, 993009)).toBe(1);
    expect(z.kierunekZgonu(-1, 993010)).toBe(2);
  });

  it('pamięta wersję kolorystyczną pionka zarządu: zwłoki mają to samo ubranie, w którym zginął (bez skoku koloru)', () => {
    const z = new NoweZwloki();
    z.zapamietaj(1, 0, false, 3);
    expect(z.wersjaZgonu(1)).toBe(3);
    z.zapamietaj(1, 2, false, 1);
    expect(z.wersjaZgonu(1)).toBe(1);
    // nieznana osoba: wersja z danych zwłok (undefined), a bez podanej wersji oryginał
    expect(z.wersjaZgonu(7)).toBeUndefined();
    z.zapamietaj(4, 0, false);
    expect(z.wersjaZgonu(4)).toBe(0);
  });

  it('wie, czy zmarły leżał (spał) w ostatniej klatce przed śmiercią: z leżącego nie ma upadku', () => {
    const z = new NoweZwloki();
    z.zapamietaj(1, 0, true);
    z.zapamietaj(2, 0, false);
    expect(z.lezal(1)).toBe(true);
    expect(z.lezal(2)).toBe(false);
    // obudził się i zginął na nogach
    z.zapamietaj(1, 0, false);
    expect(z.lezal(1)).toBe(false);
    // nieznana osoba: stała na nogach
    expect(z.lezal(9)).toBe(false);
  });
});
