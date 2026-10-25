/* Przebieg prawdziwej gry z warstwą rozwoju silnika osady AI (Przymorze, ziarno 11, jak w przeglądarce: obcy, mieszkańcy z adresu,
   okolica, łańcuchy kart), etap 1 osady AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadania 5–7); plik wydzielony
   z tests/unit/ai-rozwoj.test.ts w etapie 2 (zadanie 1), bo gra 20 dób w `beforeAll` to ponad połowa czasu tamtego pliku, a vitest
   puszcza pliki równolegle. Pilnuje: wyboru wydarzeń na kopii zarządu bez ruszania prawdziwego (`wyborWydarzenia` równy pełnemu
   przeglądowi ocen, poza kartami z ukrytym rzutem), pożaru od kozy (silnik gasi, nie ewakuuje klatki), pracowni bez przestojów
   (siedem badań do rana 13. dnia), werbunku wędrowców (zaproszenia i wzrost zarządu do 10. dnia) i pierwszego kamienia ludności
   (do 5. dnia). Decydent przebiegu to `silnik` z pomiarem; gra jest jedna, rozegrana w `beforeAll`. */

import { beforeAll, describe, expect, it } from 'vitest';
import { type Decydent, type GraAi, grajDo, wejscie } from '../../src/ai/gra.ts';
import { najlepszyIndeks, ocenSkutki, wyborWydarzenia } from '../../src/ai/okna.ts';
import { silnik } from '../../src/ai/silnik.ts';
import type { Prompt } from '../../src/gov/typy.ts';
import { chooseEvent } from '../../src/gov/zarzad.ts';
import { TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { populacja } from '../../src/sim/snapshot.ts';
import { poranekTick, przygotujGre } from '../../tools/bot-osada.ts';
import { budowleStojace } from '../../tools/osada-ocena.ts';

interface OknoWydarzenia {
  dzien: number;
  id: string;
  wybor: number;
  oczekiwany: number;
  oceny: (number | null)[];
  zarzadBezZmian: boolean;
  wejscieBezZmian: boolean;
}

/** okno „Pożar od kozy” w przebiegu: czy wybór silnika kończy się pożarem w skutkach (ewakuacja klatki) */
interface OknoPozaru {
  dzien: number;
  ewakuacja: boolean;
}

describe('przebieg: Przymorze, ziarno 11, jak w przeglądarce', () => {
  const okna: OknoWydarzenia[] = [];
  const pozary: OknoPozaru[] = [];
  /** poranki: dzień, ludność pod zarządem, osoby zarządu, stojące budowle i zbadane technologie */
  const poranki: { dzien: number; ludnosc: number; zarzad: number; budowle: number; badania: string[] }[] = [];
  /** dni gry, w których silnik zlecił zaproszenie wędrowca (polecenie `zapros`) */
  const zaproszenia: number[] = [];
  let g: GraAi;

  /** ocena wyboru z pełnego przeglądu na kopiach, niezależnie od `wyborWydarzenia`. Jedna kopia ze stanem prawdziwego generatora:
      skutki okien z pierwszych dni nie zależą od losowania (jedyny losowy skutek to odejście przegranego w kłótni, a mediacja
      tam wygrywa zawsze), więc to samo co średnia z kopii o ziarnach pochodnych w `wyborWydarzenia` (reguła 0, zadanie 6) */
  function przeglad(gr: GraAi, p: Extract<Prompt, { k: 'wydarzenie' }>): (number | null)[] {
    const i = wejscie(gr);
    return p.choices.map((c, k) => {
      if (!c.ok) return null;
      const kopia = structuredClone(gr.gov);
      return ocenSkutki(chooseEvent(kopia, i, k), kopia, i);
    });
  }

  beforeAll(async () => {
    g = await przygotujGre('przymorze', 11, false);
    // jak silnik, ale z pomiarem pierwszych okien wydarzeń: wybór sprawdzony przed odpowiedzią silnika
    const mierzacy: Decydent = {
      ...silnik,
      okno(gr, p, r) {
        if (p.k === 'wydarzenie' && okna.length < 8) {
          const i = wejscie(gr);
          const przedGov = JSON.stringify(gr.gov);
          const przedWejscie = JSON.stringify(i);
          const wybor = wyborWydarzenia(gr.gov, i, p);
          const oceny = przeglad(gr, p);
          okna.push({
            dzien: Math.floor(gr.sim.st.tick / TICKS_PER_DAY) + 1,
            id: p.id,
            wybor,
            oczekiwany: najlepszyIndeks(oceny),
            oceny,
            zarzadBezZmian: JSON.stringify(gr.gov) === przedGov,
            wejscieBezZmian: JSON.stringify(i) === przedWejscie,
          });
        }
        if (p.k === 'wydarzenie' && p.id === 'pozar') {
          const i = wejscie(gr);
          const kopia = structuredClone(gr.gov);
          const fx = chooseEvent(kopia, i, wyborWydarzenia(gr.gov, i, p));
          pozary.push({ dzien: Math.floor(gr.sim.st.tick / TICKS_PER_DAY) + 1, ewakuacja: fx.fire });
        }
        silnik.okno(gr, p, r);
      },
      tura(gr, r) {
        silnik.tura(gr, {
          ...r,
          polecenie: (c) => {
            if (c.t === 'zapros') zaproszenia.push(Math.floor(gr.sim.st.tick / TICKS_PER_DAY) + 1);
            r.polecenie(c);
          },
        });
      },
    };
    for (let d = 2; d <= 20 && !g.gov.over; d++) {
      grajDo(g, mierzacy, poranekTick(d));
      if (g.gov.over) break;
      poranki.push({
        dzien: d,
        ludnosc: populacja(g.sim.st).razem,
        zarzad: g.sim.st.pawns.filter((p) => p.kind === 'core').length,
        budowle: budowleStojace(g.sim.st.things),
        badania: [...(g.sim.st.techDone ?? [])],
      });
    }
    // `krokGry` łapie błędy decydenta (silnika albo pomiaru w tym teście): bez tego sprawdzenia rzut z całej gry przeszedłby bez śladu
    expect(g.bledy).toEqual([]);
  }, 300_000);

  it('wyborWydarzenia wybiera najlepszą ocenę i nie zmienia prawdziwego zarządu', () => {
    // w pierwszych dniach przychodzi kilka wydarzeń; każde sprawdzone na prawdziwym zarządzie i wejściu
    expect(okna.length).toBeGreaterThanOrEqual(3);
    // pełny przegląd zna ukryte rzuty karty (haczyk gościa, kot za płotem, pomoc z sąsiedztwa), a silnik ich nie zna (reguła
    // uczciwości, zadanie 7): przy takich kartach jego wybór może się różnić od wyboru z przeglądu, więc sprawdzamy tylko, że jest
    // dozwolony; przy reszcie wybór jest dokładnie ten z przeglądu
    const zUkrytymRzutem = new Set(['gosc', 'halas', 'krzyk', 'wedrowiec']);
    expect(okna.filter((o) => !zUkrytymRzutem.has(o.id)).length).toBeGreaterThanOrEqual(2);
    for (const o of okna) {
      if (zUkrytymRzutem.has(o.id))
        expect(o.oceny[o.wybor], `dzień ${o.dzien}, ${o.id}: wybór dozwolony`).not.toBeNull();
      else expect(o.wybor, `dzień ${o.dzien}, ${o.id}: ${JSON.stringify(o.oceny)}`).toBe(o.oczekiwany);
      expect(o.zarzadBezZmian, `dzień ${o.dzien}, ${o.id}: zarząd`).toBe(true);
      expect(o.wejscieBezZmian, `dzień ${o.dzien}, ${o.id}: wejście`).toBe(true);
    }
  });

  it('pożar od kozy: silnik gasi, nie ewakuuje klatki (spalony mebel, strach, gorszy nastrój wszystkich)', () => {
    // w grze karta wraca co dobę; bez wagi pożaru w ocenie skutków silnik ewakuował za każdym razem i kończył 5 dni wcześniej
    expect(pozary.length).toBeGreaterThanOrEqual(3);
    for (const o of pozary) expect(o.ewakuacja, `dzień ${o.dzien}`).toBe(false);
  });

  it('pracownia nie stoi bez zajęcia: sześć badań z kolejki i t_ambu są zbadane do rana 13. dnia', () => {
    // Bez t_ambu w kolejce stół pracowni stał pusty od 7. dnia (t_ambu było do wzięcia: Hanna ma medycynę 3), a zdrowie zarządu
    // spadało od 14. dnia poniżej 45, czyli poniżej progu wyprawy dalekiej. Ten przebieg (z łańcuchami kart, jak w przeglądarce):
    // wszystkie siedem badań gotowe rano 9. dnia, tak samo jak bez łańcuchów (na starszej bazie gry t_ambu kończyło się w 10.
    // dniu); granica 13. dnia zostawia cztery dni na przesunięcie trajektorii (było trzy), a brak badania w kolejce i tak ją
    // przekracza (nie zbadane do końca przebiegu).
    const rano13 = poranki.find((p) => p.dzien === 13);
    expect(rano13, 'przebieg dożył 13. dnia').toBeDefined();
    expect(rano13!.badania).toEqual(
      expect.arrayContaining(['t_kozy', 't_okna', 't_konserwy', 't_grzyby', 't_zielarstwo', 't_szklarnia', 't_ambu']),
    );
  });

  it('werbunek działa: do 10. dnia co najmniej dwa zaproszenia wędrowców, a zarząd rośnie z 4 do co najmniej 8 osób', () => {
    // Zmierzone w tym przebiegu (z łańcuchami kart): 6 zaproszeń do 10. dnia (w dniach 2, 4, 6, 6, 8, 10) i 9 osób w zarządzie rano
    // 10. dnia; bez łańcuchów 3 zaproszenia (2, 3, 5) i 8 osób; przed zmianą werbunku 0 zaproszeń w 20 dni przy 15–23 rozmowach
    // i 7 osobach w zarządzie. Zwerbowani wędrowcy trafiają do zarządu. Większy zarząd to dłuższe przeżycie (średni dzień końca,
    // żyje = 45; pomiary z uprzęży bez łańcuchów): +2,4 ± 0,8 na ziarnach 11–50 (wariant wybrano na 11–20, więc to liczba
    // zawyżona) i +1,7 ± 0,8 na ziarnach 31–65 spoza wyboru; Przymorze +3,9 ± 2,5, a Lanciego +0,1 ± 2,8 (około zera) na
    // zbiorze 51–65.
    const rano10 = poranki.find((p) => p.dzien === 10);
    expect(rano10, 'przebieg dożył 10. dnia').toBeDefined();
    expect(zaproszenia.filter((d) => d <= 10).length).toBeGreaterThanOrEqual(2);
    expect(rano10!.zarzad).toBeGreaterThanOrEqual(8);
  });

  it('pierwszy kamień ludności (10 osób) do 5. dnia', () => {
    // Ten przebieg jest deterministyczny: pierwszy kamień w 4. dniu z łańcuchami kart (bez nich w 3.; przed zadaniem 5, na 40ef252,
    // w 7.). Pasmo z planu to dzień 15, ale pilnuje go bramka etapu (zadanie 7, `npm run bot:osada`, kolumna „kamień”); tu
    // pilnujemy pomiaru z marginesem jednego dnia (granica 5 zostaje jak była, a margines skurczył się z dwóch dni, bo kamień
    // jest dzień później), żeby cofnięcie wzrostu do poziomu bazy nie przeszło niezauważone (z granicą 15 przechodziło).
    const pierwszy = poranki.find((p) => p.ludnosc >= 10);
    expect(pierwszy, 'w przebiegu był poranek z co najmniej 10 osobami').toBeDefined();
    expect(pierwszy!.dzien).toBeLessThanOrEqual(5);
  });
});
