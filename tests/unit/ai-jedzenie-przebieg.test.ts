/* Przebieg prawdziwej gry z warstwą jedzenia silnika osady AI (Przymorze, ziarno 11, jak w przeglądarce: obcy, mieszkańcy z adresu,
   okolica, łańcuchy kart), etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 4 i dalsze); plik wydzielony
   z tests/unit/ai-jedzenie.test.ts w etapie 2 (zadanie 1), bo 25 dób gry w `beforeAll` to więcej niż reszta tamtego pliku razem,
   a vitest puszcza pliki równolegle. Pilnuje: wyprawy w każdym dniu głodu, dolnych granic zmierzonych na tym przebiegu (zapas co
   najmniej 5 porcji o 6:00 w dniach 2–15, średnie zdrowie zarządu w 12. dniu co najmniej 70, średnie najedzenie o 6:00 w dniach 15–18
   co najmniej 30), okna godzin i jednej wyprawy naraz, ogródka od pierwszych dni. Granice mają łapać brak warstwy:
   `ZM_JAK_BAZA=1 npx vitest run tests/unit/ai-jedzenie-przebieg.test.ts` gra ten sam przebieg silnikiem bez wypraw po jedzenie i bez
   ogródka (jak silnik z zadania 3) i testy przebiegu mają wtedy padać. Uprząż (`przygotujGre`) gra od części B zadania 7 z
   łańcuchami kart, jak gra w przeglądarce; liczby w komentarzach tych testów to pomiar z łańcuchami, a w nawiasie „bez
   łańcuchów” ten sam przebieg ze starą uprzężą (`lancuchy` wyłączone). Cel z planu „średnie najedzenie zarządu o 6:00 w dniach 15–25
   co najmniej 25” jest tu sprawdzony na tym przebiegu (zmierzone 58,5); na wszystkich demach i ziarnach mierzy go bramka etapu
   (`npm run bot:osada`). */

import { beforeAll, describe, expect, it } from 'vitest';
import { type Decydent, type GraAi, grajDo, type Rece, wejscie } from '../../src/ai/gra.ts';
import { jedzenieNaGlowe } from '../../src/ai/jedzenie.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { dayOf, hourOf, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { poranekTick, przygotujGre } from '../../tools/bot-osada.ts';
import { tickDnia } from './ai-pomoc.ts';

/** Ręce bez tego, co robi warstwa jedzenia: wyprawy nie wychodzą (`wyslij` odmawia), plan ogródka nie powstaje; reszta
    rąk (budowy zimy, drewno, okna zarządu) bez zmian. */
function receBezJedzenia(r: Rece): Rece {
  return {
    ...r,
    wyslij: () => false,
    polecenie: (c) => {
      if (!(c.t === 'build' && c.kind === 'ogrodek')) r.polecenie(c);
    },
  };
}

/** Silnik „jak baza”: silnik z samą zimą, czyli sprzed warstwy jedzenia (wyprawy po jedzenie i ogródek zablokowane w rękach). */
const silnikJakBaza: Decydent = { ...silnik, tura: (g, r) => silnik.tura(g, receBezJedzenia(r)) };

/** Decydent testów przebiegu: silnik, a z `ZM_JAK_BAZA=1` silnik jak baza (pokazuje, że dolne granice łapią brak warstwy). */
const decydentPrzebiegu: Decydent = process.env.ZM_JAK_BAZA === '1' ? silnikJakBaza : silnik;

/** Fakty z jednego przebiegu prawdziwej gry (Przymorze, ziarno 11, jak w przeglądarce) do testów niżej. */
interface DzienGry {
  dzien: number;
  /** tuż przed warstwą z 9:00 */
  przed9: { na_glowe: number; zdrowi60: number; dyzurni: number };
  /** wpisy „wyprawa” w dzienniku między 8:00 a 15:00 tego dnia */
  wyprawy: number;
  /** o 6:00: porcje w zapasie (surowe i ugotowane), średnie najedzenie i średnie zdrowie zarządu */
  rano: { porcje: number; najedzenie: number; zdrowie: number };
}

describe('przebieg: Przymorze, ziarno 11, jak w przeglądarce', () => {
  const dni: DzienGry[] = [];
  let g: GraAi;
  let najwiecejWDrodze = 0;

  beforeAll(async () => {
    g = await przygotujGre('przymorze', 11, false);
    g.dziennik = [];
    // jak silnik, ale z pomiarem: ile wypraw w drodze naraz
    const mierzacy: Decydent = {
      ...decydentPrzebiegu,
      tura(gr, r) {
        decydentPrzebiegu.tura(gr, r);
        najwiecejWDrodze = Math.max(najwiecejWDrodze, gr.gov.wyprawy?.length ?? 0);
      },
    };
    for (let d = 2; d <= 25 && !g.gov.over; d++) {
      grajDo(g, mierzacy, poranekTick(d));
      if (g.gov.over) break;
      const iRano = wejscie(g);
      const srednia = (pole: 'food' | 'health'): number =>
        iRano.people.reduce((a, p) => a + p.needs[pole], 0) / iRano.people.length;
      const rano = {
        porcje: iRano.stock.supplies + (iRano.stock.meals ?? 0),
        najedzenie: srednia('food'),
        zdrowie: srednia('health'),
      };
      grajDo(g, mierzacy, tickDnia(d, 9) - 1);
      if (g.gov.over) break;
      const i = wejscie(g);
      const zdrowi = i.people.filter((p) => !p.away && p.needs.health >= 40);
      const przed9 = {
        na_glowe: jedzenieNaGlowe(i),
        zdrowi60: i.people.filter((p) => !p.away && p.needs.health >= 60).length,
        dyzurni: zdrowi.length,
      };
      const od = tickDnia(d, 8) / TICKS_PER_SECOND;
      const doSek = tickDnia(d, 15) / TICKS_PER_SECOND;
      grajDo(g, mierzacy, tickDnia(d, 15));
      const wpisy = g.dziennik!.filter((m) => m.t === 'wyprawa' && m.s >= od && m.s < doSek);
      dni.push({ dzien: d, przed9, wyprawy: wpisy.length, rano });
    }
    // `krokGry` łapie błędy decydenta (silnika albo pomiaru w tym teście): bez tego sprawdzenia rzut z całej gry przeszedłby bez śladu
    expect(g.bledy).toEqual([]);
  }, 300_000);

  it('przy jedzeniu poniżej 2 porcji na głowę za dnia wychodzi wyprawa po jedzenie', () => {
    // dni 3–20, w których o 9:00 jest głód zapasu, dwie osoby mają zdrowie co najmniej 60 i jest ktoś jeszcze (albo któraś z nich
    // zostaje) na dyżur przy kozie: wyprawa wychodzi także wtedy, gdy zdrowych jest tylko dwoje (jedna zostaje w domu, druga idzie
    // z kimś słabszym albo sama). W tym przebiegu takich dni jest jedenaście (9–15 i 17–20; bez łańcuchów dziewięć: 8, 10–12, 14–16,
    // 18, 19), w żadnym zdrowych (zdrowie co najmniej 60) nie jest mniej niż sześcioro (bez łańcuchów pięcioro), więc gałąź „tylko
    // dwoje zdrowych” pinują testy jednostkowe o dyżurze przy kozie tej nocy, nie ten przebieg.
    const wymagajace = dni.filter(
      (d) => d.dzien >= 3 && d.dzien <= 20 && d.przed9.na_glowe < 2 && d.przed9.zdrowi60 >= 2 && d.przed9.dyzurni >= 2,
    );
    // test nie może przejść na pustym warunku
    expect(wymagajace.length).toBeGreaterThanOrEqual(5);
    for (const d of wymagajace)
      expect(d.wyprawy, `dzień ${d.dzien}: ${JSON.stringify(d.przed9)}`).toBeGreaterThanOrEqual(1);
  });

  it('zapas jedzenia o 6:00 wynosi co najmniej 5 porcji w dniach 2–15', () => {
    // z warstwą najmniej 11 porcji (dzień 11; zarząd rośnie tu do 11 osób), bez łańcuchów najmniej 8 (dzień 8), bez warstwy
    // (ten sam przebieg, `ZM_JAK_BAZA=1`) 0 od 9.–10. dnia i odwołanie w 22. dniu (bez łańcuchów w 19.). Granica 5 leży mniej więcej
    // w środku między zapasem z warstwą a pustą spiżarnią.
    const dni2do15 = dni.filter((d) => d.dzien >= 2 && d.dzien <= 15);
    expect(dni2do15.map((d) => d.dzien)).toEqual(Array.from({ length: 14 }, (_, k) => k + 2));
    for (const d of dni2do15) expect(d.rano.porcje, `dzień ${d.dzien}`).toBeGreaterThanOrEqual(5);
  });

  it('średnie zdrowie zarządu o 6:00 w 12. dniu wynosi co najmniej 70', () => {
    // z warstwą 92,9 (bez łańcuchów 84,8), bez warstwy (`ZM_JAK_BAZA=1`) 35,7 (bez łańcuchów 6,6); granica 70 leży między nimi
    const dwunasty = dni.find((d) => d.dzien === 12);
    expect(dwunasty, 'gra musi dożyć 12. dnia').toBeDefined();
    expect(dwunasty!.rano.zdrowie).toBeGreaterThanOrEqual(70);
  });

  it('średnie najedzenie zarządu o 6:00 w dniach 15–18 wynosi co najmniej 30, a gra dożywa 18. dnia', () => {
    // z warstwą 64,4, 62,5, 50,3 i 60,0 (średnio 59,3; bez łańcuchów 42,6, 51,9, 56,6, 50,6, średnio 50,4), bez warstwy
    // (`ZM_JAK_BAZA=1`) 0 w każdym z tych dni (zapas zero od 9.–10. dnia, odwołanie w 22. dniu; bez łańcuchów w 19.). Dolna granica
    // zmierzona na tym przebiegu: 30 leży w środku między warstwą a bazą. Dawna granica 8 stała przy 14,1 sprzed nocnego posiłku
    // przy wielkim głodzie, po którym zarząd nie nocuje już głodny, i przy 59 nie łapałaby połowicznego cofnięcia warstwy; cel
    // etapu (25 w dniach 15–25) niżej. Gra krótsza niż 18 dni nie ma wszystkich czterech dni.
    const dni15do18 = dni.filter((d) => d.dzien >= 15 && d.dzien <= 18);
    expect(dni15do18.map((d) => d.dzien)).toEqual([15, 16, 17, 18]);
    const srednia = dni15do18.reduce((a, d) => a + d.rano.najedzenie, 0) / dni15do18.length;
    expect(srednia).toBeGreaterThanOrEqual(30);
  });

  it('cel etapu: w dniach 15–25 średnie najedzenie zarządu o 6:00 wynosi co najmniej 25, a gra dożywa 25. dnia', () => {
    // Cel z planu („średnie najedzenie zarządu o 6:00 w dniach 15–25 co najmniej 25”) w tym przebiegu: średnia 58,5 (najgorszy dzień
    // 36,7; bez łańcuchów 57,7 i 42,6; po nocnym posiłku przy wielkim głodzie zarząd nie nocuje już głodny). W zadaniu 4, gdy silnik podpisywał `u_warty`
    // pierwszego wieczoru (blokuje kocioł), ten sam przebieg kończył się odwołaniem w 20. dniu, a najedzenie o 6:00 w dniach 3–11
    // wynosiło 16–29 (zarząd je dopiero poniżej 35, a dwie osoby czuwają całą noc bez posiłku). Cel na wszystkich demach i ziarnach
    // mierzy bramka etapu (`npm run bot:osada`, kolumny „głodni” i dzień końca); tu jest on sprawdzony na jednym przebiegu.
    const dni15do25 = dni.filter((d) => d.dzien >= 15 && d.dzien <= 25);
    expect(dni15do25.map((d) => d.dzien)).toEqual(Array.from({ length: 11 }, (_, k) => k + 15));
    const srednia = dni15do25.reduce((a, d) => a + d.rano.najedzenie, 0) / dni15do25.length;
    expect(srednia).toBeGreaterThanOrEqual(25);
  });

  it('wyprawy wychodzą tylko między 8:00 a 15:00 i nigdy dwie naraz', () => {
    const wyjscia = g.dziennik!.filter((m) => m.t === 'wyprawa');
    expect(wyjscia.length).toBeGreaterThan(0);
    for (const m of wyjscia) {
      const godzina = hourOf(m.s * TICKS_PER_SECOND);
      expect(godzina, `dzień ${dayOf(m.s * TICKS_PER_SECOND)}, ${godzina}:00`).toBeGreaterThanOrEqual(8);
      expect(godzina).toBeLessThan(15);
    }
    // co sekundę przy ekranie (po turze silnika) w drodze jest najwyżej jedna wyprawa
    expect(najwiecejWDrodze).toBe(1);
  });

  it('ogródek stoi od pierwszych dni, jeden', () => {
    const ogrodki = g.sim.st.things.filter((t) => t.kind === 'ogrodek');
    expect(ogrodki).toHaveLength(1);
    const plany = g.dziennik!.filter((m) => m.t === 'polecenie' && m.c.t === 'build' && m.c.kind === 'ogrodek');
    expect(plany).toHaveLength(1);
    // od 2. dnia, ale dopiero gdy plan pracowni przestał czekać na deski: w tym przebiegu pracownia staje w 3. dniu
    const dzien = dayOf(plany[0].s * TICKS_PER_SECOND);
    expect(dzien).toBeGreaterThanOrEqual(2);
    expect(dzien).toBeLessThanOrEqual(3);
  });
});
