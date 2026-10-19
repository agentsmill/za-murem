/* Bramka determinizmu silników JS: porównanie wyników nóg (silników) i kod wyjścia (MMO, etap 0: docs/superpowers/specs/
   2026-10-19-mmo-design.md, „Bramka etapu 0”). Moduł nie dotyka przeglądarek, procesów ani plików: dostaje gotowe nogi
   (tools/determinizm/nogi.ts albo udawane w testach), liczy z nimi scenariusze i oddaje raport przez `Wyjscie` oraz kod
   wyjścia, więc cały łańcuch decyzji (0, 1, 2) da się sprawdzić w teście jednostkowym na udawanych silnikach.

   Każda noga liczy każdy scenariusz (demo × tryb gry × ziarno) dwa razy w tym samym procesie: powtarzalność w obrębie
   silnika jest warunkiem, żeby rozbieżność między silnikami coś znaczyła. Porównywany jest skrót świata zaraz po
   zbudowaniu (kafelki, budynki, drzewa, kąt obrotu; sim.hash() świata nie obejmuje) i skrót stanu po każdej pełnej
   godzinie gry. Gdy się rozjadą, scenariusz idzie jeszcze raz z nagrywaniem wywołań Math w każdej nodze
   (tools/determinizm/nagrywanie.ts): raport wskazuje pierwsze wywołanie z innym wynikiem, jego miejsce w kodzie (stos z
   Node) i spis różnic funkcja po funkcji.

   Kontrakt kodu wyjścia (raport.ts, kodWyjscia): 1 przy rozbieżności albo niepowtarzalnej / padniętej nodze (ważniejsze
   niż brak), 2 przy braku silnika docelowego albo gdy żaden z wybranych silników nie jest dostępny, inaczej 0. Noga, która
   padła na scenariuszu, nie dostaje kolejnych (zepsuta przeglądarka czekałaby na limit czasu przy każdym z nich): reszta jej
   scenariuszy jest w raporcie jako pominięta. */

import {
  odkodujWywolania,
  pierwszaRoznica,
  type SpisRoznic,
  type Wywolanie,
  type WywolanieJson,
  zakodujWywolania,
} from './nagrywanie.ts';
import { porownaj, roznicaTablic } from './porownanie.ts';
import { kodWyjscia, miejscaZeStosu, pierwszaLinia, tabelaLinie } from './raport.ts';
import type { Bieg, WynikNogi } from './uruchom.ts';
import type { Tryb, Zlecenie } from './zlecenie.ts';

const KROKOW_NA_GODZINE = 800;

export type WynikZAgentem = WynikNogi & { agent?: string };

export interface Noga {
  id: string;
  etykieta: string;
  /** silnik docelowy bramki: jego brak to kod wyjścia 2 */
  docelowa: boolean;
  /** wersja silnika albo null, gdy nogi nie da się uruchomić */
  wersja: string | null;
  /** przyczyna braku i polecenie, które to uzupełni */
  brak?: string;
  licz(z: Zlecenie): Promise<WynikZAgentem>;
  /** nagrane gdzie indziej wywołania Math policzone od nowa w tej nodze: spis różnic */
  kontroluj(nagranie: WywolanieJson[]): Promise<SpisRoznic>;
  zamknij(): Promise<void>;
}

export interface Opcje {
  godziny: number;
  dema: string[];
  tryby: Tryb[];
  ziarna: number[];
  /** godzina (od 0) nagrywana w każdym scenariuszu, także przy zgodnych skrótach; null: nagrywanie tylko przy rozbieżności */
  wymuszonaGodzina: number | null;
  /** bez porównania świata zaraz po zbudowaniu (kafelki, budynki, drzewa): same skróty stanu gry */
  bezSwiata: boolean;
  /** wybrane silniki (--silniki): zgodność dotyczy wtedy tylko ich, nie wszystkich docelowych */
  filtr?: string[];
  /** samotest bramki: noga `silnik` zwiększa każdy wynik funkcji Math `funkcja` o jeden bit */
  psuj?: { silnik: string; funkcja: string };
  /** próba poprawki: Math.hypot, atan2, sin i cos z deterministycznej matematyki (mat-proba.ts) w każdej nodze */
  latka?: 'mat';
}

export interface Wyjscie {
  /** raport (stdout) */
  wypisz(linia: string): void;
  /** postęp liczenia (stderr) */
  postep(linia: string): void;
  /** pełne wyniki do pliku (--json); brak: nic się nie zapisuje */
  zapiszJson?(dane: unknown): void;
}

interface Scenariusz {
  demo: string;
  tryb: Tryb;
  seed: number;
}

interface Okno {
  od: number;
  do: number;
}

/** 1234 z 80000 jako „1234 (1,54%)”; przecinek dziesiętny jak w całej grze */
const ileZ = (n: number, z: number) =>
  n === 0 ? '0' : `${n} (${((100 * n) / z).toFixed(n * 10000 < z ? 4 : 2).replace('.', ',')}%)`;

const liczbaNaTekst = (x: number) => (Object.is(x, -0) ? '-0' : String(x));
const wywolanieNaTekst = (w: Wywolanie | undefined) =>
  w ? `${w[0]}(${w[1].map(liczbaNaTekst).join(', ')}) = ${liczbaNaTekst(w[2])}` : '(brak wywołania)';

/** przedział kroków godziny gry o indeksie g; pierwsza godzina obejmuje też budowę świata (krok −1) */
const oknoGodziny = (g: number): Okno => ({
  od: g === 0 ? -1 : g * KROKOW_NA_GODZINE,
  do: (g + 1) * KROKOW_NA_GODZINE,
});
const opisOkna = (o: Okno) =>
  o.od < 0 && o.do === 0
    ? 'budowa świata'
    : `kroki ${Math.max(0, o.od)}–${o.do - 1}${o.od < 0 ? ' i budowa świata' : ''}`;

/** Przebieg bramki: liczy scenariusze w podanych nogach, pisze raport do `wyj` i zwraca kod wyjścia. Zamyka wszystkie
    nogi (także po wyjątku). `korzen` to korzeń repozytorium, względem którego raport skraca ścieżki ze stosu. */
export async function uruchomBramke(opcje: Opcje, noge: Noga[], wyj: Wyjscie, korzen: string): Promise<0 | 1 | 2> {
  const { godziny, dema, tryby, ziarna, wymuszonaGodzina, bezSwiata, filtr, psuj, latka } = opcje;
  const scenariusze: Scenariusz[] = dema.flatMap((demo) =>
    tryby.flatMap((tryb) => ziarna.map((seed) => ({ demo, tryb, seed }))),
  );
  const opisScenariusza = (s: Scenariusz) =>
    `${s.demo} ${s.tryb === 'zombie' ? 'zombie' : 'zwykły'} ${godziny} h${ziarna.length > 1 ? ` ziarno ${s.seed}` : ''}`;
  const dostepne = noge.filter((n) => n.wersja !== null);
  const wyniki = new Map<string, WynikZAgentem>();
  const bledy = new Map<string, string>();
  /** scenariusze, których noga nie dostała, bo padła na wcześniejszym */
  const pominiete = new Set<string>();
  const czasy = new Map<string, number>();
  const klucz = (n: Noga, s: Scenariusz) => `${n.id}|${s.demo}|${s.tryb}|${s.seed}`;

  /** zlecenie dla nogi: dwa przebiegi w jednym procesie, z samotestem (--psuj) tylko we wskazanej nodze */
  const zlecenieNogi = (n: Noga, s: Scenariusz, dodatki: Partial<Zlecenie> = {}): Zlecenie => ({
    demo: s.demo,
    godziny,
    tryb: s.tryb,
    seed: s.seed,
    powtorz: 2,
    ...(psuj?.silnik === n.id ? { psuj: psuj.funkcja } : {}),
    ...(latka ? { latka } : {}),
    ...dodatki,
  });

  const naglowekTabeli = (wzorzec: Noga | undefined): string[][] => [
    ['silnik', 'wersja', 'powtarzalny', `zgodny z ${wzorzec?.id ?? '-'}`, 'czas'],
  ];
  const wypiszTabele = (wiersze: string[][]) => {
    for (const l of tabelaLinie(wiersze)) wyj.wypisz(l);
  };
  const brakujace = noge.filter((n) => n.wersja === null && n.docelowa).map((n) => n.id);
  const wypiszBrakujace = () => {
    if (brakujace.length)
      wyj.wypisz(
        `\nBrakuje silników docelowych: ${brakujace.join(', ')}. ${noge
          .filter((n) => brakujace.includes(n.id))
          .map((n) => `${n.id}: ${n.brak}`)
          .join('; ')}`,
      );
  };

  try {
    wyj.postep(
      `Determinizm: ${scenariusze.length} scenariuszy po ${godziny} h gry, silniki: ${dostepne.map((n) => n.id).join(', ') || 'żaden'}`,
    );
    if (psuj) wyj.postep(`  samotest: noga ${psuj.silnik} zwiększa każdy wynik ${psuj.funkcja} o jeden bit`);
    if (latka)
      wyj.postep(
        '  łatka mat: hypot, atan2, sin i cos z deterministycznej matematyki (tools/determinizm/mat-proba.ts)',
      );

    if (dostepne.length === 0) {
      // nic do porównania: nie „zgodne”, tylko brak silników (kod 2 z poleceniami, które je uzupełnią)
      wyj.wypisz('Determinizm silników JS: żaden z wybranych silników nie jest dostępny');
      wyj.wypisz('');
      const wiersze = naglowekTabeli(undefined);
      for (const n of noge) wiersze.push([n.id, n.brak ?? 'brak', '', '', '']);
      wypiszTabele(wiersze);
      wypiszBrakujace();
      wyj.wypisz('\nKod wyjścia 2: żaden z wybranych silników nie jest dostępny, nic nie porównano');
      return 2;
    }

    /** Miejsce w kodzie wywołania o numerze `i` w nagraniu przedziału: stos z czystego przebiegu w Node (numery linii
        zgadzają się ze źródłem), bo wywołania przed pierwszą różnicą są u wszystkich silników te same. */
    const miejsceWywolania = async (s: Scenariusz, okno: Okno, wzorzec: Noga, i: number): Promise<string> => {
      const nodeowa =
        dostepne.find((n) => n === wzorzec && n.id.startsWith('node')) ?? dostepne.find((n) => n.id.startsWith('node'));
      if (!nodeowa) return 'brak nogi Node (--silniki=node albo node24), stos z przeglądarki nie wskazuje linii';
      try {
        const w = await nodeowa.licz(zlecenieNogi(nodeowa, s, { powtorz: 1, nagraj: { ...okno, stosPrzy: i } }));
        const miejsca = miejscaZeStosu(w.biegi[0].stos ?? '', korzen);
        return miejsca.length ? `${miejsca.join(' <- ')} (${nodeowa.id})` : 'stos bez ramek z plików';
      } catch (e) {
        return `BŁĄD ${pierwszaLinia(e)}`;
      }
    };

    const daneNagran: {
      scenariusz: string;
      okno: Okno;
      wzorzec: string;
      wywolan: number;
      spisy: Record<string, SpisRoznic>;
    }[] = [];

    /** Nagrywa przedział w każdej nodze, która policzyła scenariusz, i porównuje z nagraniem wzorca: pierwsze wywołanie
        z innym wynikiem (albo argumentami), a do niego stos z Node: miejsce w kodzie. Zwraca linie raportu. */
    const nagrajScenariusz = async (s: Scenariusz, okno: Okno, wzorzec: Noga): Promise<string[]> => {
      const linie: string[] = [`  nagranie wywołań Math (${opisOkna(okno)}), wzorzec ${wzorzec.id}:`];
      const nagrania = new Map<string, Wywolanie[]>();
      await Promise.all(
        dostepne
          .filter((n) => wyniki.has(klucz(n, s)))
          .map(async (n) => {
            try {
              const w = await n.licz(zlecenieNogi(n, s, { powtorz: 1, nagraj: okno }));
              nagrania.set(n.id, odkodujWywolania(w.biegi[0].nagranie ?? []));
            } catch (e) {
              linie.push(`    ${n.id}: BŁĄD nagrywania: ${pierwszaLinia(e)}`);
            }
          }),
      );
      const wzorcowe = nagrania.get(wzorzec.id);
      if (!wzorcowe) return [...linie, '    brak nagrania wzorca'];
      for (const n of dostepne) {
        const inne = nagrania.get(n.id);
        if (!inne || n === wzorzec) continue;
        const r = pierwszaRoznica(wzorcowe, inne);
        if (!r) {
          linie.push(`    ${n.id}: wywołania identyczne (${inne.length})`);
          continue;
        }
        const tylkoWynik =
          r.a &&
          r.b &&
          r.a[0] === r.b[0] &&
          r.a[1].length === r.b[1].length &&
          r.a[1].every((v, k) => Object.is(v, r.b?.[1][k]));
        linie.push(
          `    ${n.id}: RÓŻNICA w wywołaniu nr ${r.i} z ${wzorcowe.length}`,
          `      ${wzorzec.id.padEnd(9)} ${wywolanieNaTekst(r.a)}`,
          `      ${n.id.padEnd(9)} ${wywolanieNaTekst(r.b)}`,
          tylkoWynik
            ? `      to funkcja ${r.a?.[0]}: te same argumenty, inny wynik`
            : '      argumenty różne: rozbieżność powstała wcześniej, poza nagrywanymi funkcjami (operator **, inna różnica silnika) albo przed nagranym przedziałem',
          `      miejsce w kodzie: ${await miejsceWywolania(s, okno, wzorzec, r.i)}`,
        );
      }
      // spis różnic: te same wywołania policzone od nowa w każdej nodze, funkcja po funkcji (z łatką pomijamy: liczyłby
      // natywne funkcje Math, a nie łatkę)
      const spisy = new Map<string, SpisRoznic>();
      await Promise.all(
        (latka ? [] : dostepne).map(async (n) => {
          try {
            spisy.set(n.id, await n.kontroluj(zakodujWywolania(wzorcowe)));
          } catch (e) {
            linie.push(`    ${n.id}: BŁĄD spisu różnic: ${pierwszaLinia(e)}`);
          }
        }),
      );
      daneNagran.push({
        scenariusz: opisScenariusza(s),
        okno,
        wzorzec: wzorzec.id,
        wywolan: wzorcowe.length,
        spisy: Object.fromEntries(spisy),
      });
      const funkcje = [...new Set([...spisy.values()].flatMap((sp) => Object.keys(sp)))].sort();
      const liczyly = dostepne.filter((n) => n !== wzorzec && spisy.has(n.id));
      if (funkcje.length && liczyly.length) {
        linie.push(
          `  spis różnic na ${wzorcowe.length} wywołaniach z gry (wzorzec ${wzorzec.id}), każde policzone od nowa w silniku z tymi samymi argumentami:`,
          ...tabelaLinie([
            ['funkcja', 'wywołań', ...liczyly.map((n) => n.id)],
            ...funkcje.map((f) => [
              f,
              String(spisy.get(wzorzec.id)?.[f]?.wywolan ?? ''),
              ...liczyly.map((n) => ileZ(spisy.get(n.id)?.[f]?.roznych ?? 0, spisy.get(n.id)?.[f]?.wywolan ?? 1)),
            ]),
          ]).map((l) => `    ${l}`),
        );
        for (const n of liczyly)
          for (const f of funkcje) {
            const p = spisy.get(n.id)?.[f]?.przyklady[0];
            if (p)
              linie.push(
                `    np. ${n.id}: ${f}(${p.argumenty.map(liczbaNaTekst).join(', ')}) = ${liczbaNaTekst(p.wynik)}, wzorzec ${liczbaNaTekst(p.wzorzec)}`,
              );
          }
      }
      return linie;
    };

    /** Ile kafelków świata się rozjechało: tablice kafelków z każdej nogi (świat budowany od nowa, godzina gry) porównane
        z tablicami wzorca. Zwraca linie raportu. */
    const opiszKafelki = async (s: Scenariusz, wzorzec: Noga, nogi: Noga[]): Promise<string[]> => {
      const tablice = new Map<string, NonNullable<Bieg['kafelki']>>();
      await Promise.all(
        nogi.map(async (n) => {
          try {
            const w = await n.licz(zlecenieNogi(n, s, { godziny: 1, powtorz: 1, kafelki: true }));
            const k = w.biegi[0].kafelki;
            if (k) tablice.set(n.id, k);
          } catch {}
        }),
      );
      const wz = tablice.get(wzorzec.id);
      if (!wz) return [];
      const linie: string[] = [];
      for (const n of nogi) {
        const k = tablice.get(n.id);
        if (!k || n === wzorzec) continue;
        for (const nazwa of ['terr', 'bid', 'blocked'] as const) {
          const r = roznicaTablic(wz[nazwa], k[nazwa]);
          if (!r.roznych) continue;
          const gdzie = r.przyklady
            .map((p) => `(${p.i % wz.size},${Math.floor(p.i / wz.size)}) ${p.a}→${p.b}`)
            .join(', ');
          linie.push(`      ${n.id}: ${nazwa} różni się na ${r.roznych} z ${wz[nazwa].length} kafelków, np. ${gdzie}`);
        }
        if (!linie.length) linie.push(`      ${n.id}: tablice kafelków takie same`);
      }
      return linie;
    };

    // -------------------------------------------------------------------------------------------------------------
    // liczenie: nogi równolegle, scenariusze w nodze po kolei; po pierwszym błędzie reszta scenariuszy nogi odpada

    await Promise.all(
      dostepne.map(async (n) => {
        let padla = false;
        for (const s of scenariusze) {
          if (padla) {
            pominiete.add(klucz(n, s));
            wyj.postep(`  [${n.id}] ${opisScenariusza(s)}: pominięty (noga padła na wcześniejszym scenariuszu)`);
            continue;
          }
          const t0 = Date.now();
          try {
            wyniki.set(klucz(n, s), await n.licz(zlecenieNogi(n, s)));
          } catch (e) {
            bledy.set(klucz(n, s), pierwszaLinia(e));
            padla = true;
          }
          const ms = Date.now() - t0;
          czasy.set(n.id, (czasy.get(n.id) ?? 0) + ms);
          wyj.postep(
            `  [${n.id}] ${opisScenariusza(s)}: ${bledy.has(klucz(n, s)) ? `BŁĄD ${bledy.get(klucz(n, s))}` : `${(ms / 1000).toFixed(1)} s`}`,
          );
        }
      }),
    );

    // wzorzec do kolumny „zgodny z”: Node 24, a bez niego pierwszy dostępny
    const wzorzec = dostepne.find((n) => n.id === 'node24') ?? dostepne[0];
    const skroty = (n: Noga, s: Scenariusz, bieg = 0) => wyniki.get(klucz(n, s))?.biegi[bieg]?.skroty;
    const swiat = (n: Noga, s: Scenariusz, bieg = 0) => wyniki.get(klucz(n, s))?.biegi[bieg]?.swiat;
    let rozbiezne = false;
    const opisy: string[] = [];
    /** nogi, które w tym scenariuszu różnią się od wzorca, do kolumny „zgodny z” */
    const niezgodne = new Set<string>();

    for (const s of scenariusze) {
      const liczyly = dostepne.filter((n) => skroty(n, s));
      // wzorzec tego scenariusza: ten ogólny, a gdy w nim padł, pierwsza noga z wynikiem
      const wz = liczyly.includes(wzorzec) ? wzorzec : liczyly[0];
      const opis: string[] = [];
      let okno: Okno | null = null;
      // świat zaraz po zbudowaniu: stan gry go nie obejmuje, a klient i serwer muszą budować ten sam
      const rozneSwiaty = new Set(liczyly.map((n) => swiat(n, s)));
      if (!bezSwiata && rozneSwiaty.size > 1) {
        rozbiezne = true;
        okno = { od: -1, do: 0 };
        const czesci = (n: Noga) => wyniki.get(klucz(n, s))?.biegi[0]?.swiatCzesci ?? {};
        // co dokładnie się rozjechało względem wzorca: kafelki to inna mapa, kąt albo drzewa to różnica ostatnich bitów
        const rozne = (n: Noga) =>
          Object.keys(czesci(wz))
            .filter((c) => czesci(n)[c] !== czesci(wz)[c])
            .join(', ');
        opis.push(
          `ROZBIEŻNOŚĆ ŚWIATA ${opisScenariusza(s)}: buildWorld buduje inny świat`,
          ...liczyly.map(
            (n) => `    ${n.id.padEnd(9)} ${swiat(n, s)}${n === wz || !rozne(n) ? '' : `  (inne części: ${rozne(n)})`}`,
          ),
        );
        for (const n of liczyly) if (swiat(n, s) !== swiat(wz, s)) niezgodne.add(n.id);
        if (liczyly.some((n) => rozne(n).split(', ').includes('kafelki')))
          opis.push(...(await opiszKafelki(s, wz, liczyly)));
      }
      const cross = porownaj(Object.fromEntries(liczyly.map((n) => [n.id, skroty(n, s) as string[]])));
      if (!cross.zgodne && cross.pierwsza) {
        rozbiezne = true;
        const g = cross.pierwsza.godzina;
        okno ??= oknoGodziny(g);
        opis.push(
          `ROZBIEŻNOŚĆ ${opisScenariusza(s)}: pierwsza po ${g + 1}. godzinie gry (kroki ${g * KROKOW_NA_GODZINE}–${(g + 1) * KROKOW_NA_GODZINE - 1}, skrót nr ${g})`,
          ...Object.entries(cross.pierwsza.silniki).map(([id, h]) => `    ${id.padEnd(9)} ${h}`),
        );
        for (const n of liczyly) if (skroty(n, s)?.join() !== skroty(wz, s)?.join()) niezgodne.add(n.id);
      }
      for (const n of liczyly) {
        const biegi = wyniki.get(klucz(n, s))?.biegi ?? [];
        const self = porownaj(Object.fromEntries(biegi.map((b, i) => [`przebieg ${i + 1}`, b.skroty])));
        if (!self.zgodne && self.pierwsza) {
          rozbiezne = true;
          opis.push(
            `NIEPOWTARZALNY ${n.id} w ${opisScenariusza(s)}: przebiegi różnią się po ${self.pierwsza.godzina + 1}. godzinie gry`,
            ...Object.entries(self.pierwsza.silniki).map(([id, h]) => `    ${id.padEnd(11)} ${h}`),
          );
        } else if (!bezSwiata && new Set(biegi.map((b) => b.swiat)).size > 1) {
          rozbiezne = true;
          opis.push(`NIEPOWTARZALNY ${n.id} w ${opisScenariusza(s)}: przebiegi budują inny świat`);
        }
      }
      // nagrywanie: przy rozbieżności albo na życzenie (--nagraj=godzina)
      if (!okno && wymuszonaGodzina !== null) okno = oknoGodziny(wymuszonaGodzina);
      if (okno && liczyly.length > 1 && wz) {
        if (!opis.length)
          opis.push(`zgodne: ${opisScenariusza(s)} (nagranie na życzenie, --nagraj=${wymuszonaGodzina})`);
        opis.push(...(await nagrajScenariusz(s, okno, wz)));
      }
      opisy.push(...opis);
    }
    // błędy w kolejności nóg i scenariuszy (nie w kolejności ukończenia: raport ma być taki sam przy każdym uruchomieniu)
    for (const n of dostepne) {
      for (const s of scenariusze)
        if (bledy.has(klucz(n, s))) {
          rozbiezne = true;
          opisy.push(`BŁĄD ${n.id} w ${s.demo} ${s.tryb} ${s.seed}: ${bledy.get(klucz(n, s))}`);
        }
      const pominieteNogi = scenariusze.filter((s) => pominiete.has(klucz(n, s)));
      if (pominieteNogi.length)
        opisy.push(`${n.id}: pominięty po błędzie tej nogi: ${pominieteNogi.map(opisScenariusza).join('; ')}`);
    }

    wyj.wypisz(
      `Determinizm silników JS: ${scenariusze.length} scenariuszy po ${godziny} h gry (${dema.join(', ')}; ${tryby.join(' i ')}), każdy liczony 2 razy w jednym procesie`,
    );
    wyj.wypisz('');
    const wiersze = naglowekTabeli(wzorzec);
    for (const n of noge) {
      if (n.wersja === null) {
        wiersze.push([n.id, n.brak ?? 'brak', '', '', '']);
        continue;
      }
      const mojeBledy = scenariusze.filter((s) => bledy.has(klucz(n, s))).length;
      const mojePominiete = scenariusze.filter((s) => pominiete.has(klucz(n, s))).length;
      const powt = scenariusze.every((s) => {
        const biegi = wyniki.get(klucz(n, s))?.biegi ?? [];
        return biegi.every((b) => b.skroty.join() === biegi[0].skroty.join() && b.swiat === biegi[0].swiat);
      });
      const zgodny = n === wzorzec ? 'wzorzec' : niezgodne.has(n.id) ? 'NIE' : 'tak';
      wiersze.push([
        n.id,
        n.wersja,
        mojeBledy ? `BŁĄD (${mojeBledy}${mojePominiete ? `, pominięto ${mojePominiete}` : ''})` : powt ? 'tak' : 'NIE',
        mojeBledy ? '' : zgodny,
        `${((czasy.get(n.id) ?? 0) / 1000).toFixed(1)} s`,
      ]);
    }
    wypiszTabele(wiersze);
    wyj.wypisz('');
    if (opisy.length) for (const o of opisy) wyj.wypisz(o);
    if (!rozbiezne)
      for (const s of scenariusze) {
        const koniec = skroty(dostepne[0], s)?.at(-1);
        if (koniec)
          wyj.wypisz(
            `zgodne: ${opisScenariusza(s).padEnd(28)} ${bezSwiata ? '' : `świat ${swiat(dostepne[0], s)}, `}skrót po ${godziny} h: ${koniec}`,
          );
      }

    wypiszBrakujace();

    wyj.zapiszJson?.({
      godziny,
      noge: noge.map((n) => ({ id: n.id, wersja: n.wersja, brak: n.brak ?? null })),
      wyniki: Object.fromEntries(wyniki),
      bledy: Object.fromEntries(bledy),
      pominiete: [...pominiete],
      nagrania: daneNagran,
    });

    const kod = kodWyjscia({ rozbiezne, brakujaceDocelowe: brakujace });
    const zgodnosc = filtr
      ? 'zgodność wybranych silników (pełna bramka: bez --silniki)'
      : 'zgodność wszystkich silników docelowych';
    wyj.wypisz(
      `\nKod wyjścia ${kod}: ${kod === 0 ? zgodnosc : kod === 1 ? 'rozbieżność albo niepowtarzalny silnik' : 'zgodność dostępnych silników, ale brakuje silników docelowych'}`,
    );
    return kod;
  } finally {
    await Promise.all(noge.map((n) => n.zamknij().catch(() => {})));
  }
}
