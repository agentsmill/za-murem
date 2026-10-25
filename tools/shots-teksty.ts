/* Zrzuty i sprawdzenia poprawek tekstów po przeglądzie spójności (scenariusze teksty-*, `npm run shots -- teksty`):
   podpis pory roku na pasku w zimie (zegar gry, obie wersje językowe, tryb zombie, gdzie to jedyny sygnał pory roku), ekran
   dróg, epilogi zwycięstwa, okno planu wyprawy, podpowiedź „Do broni!” i panel Pracy w domu jednorodzinnym (Zielonki: komitet
   ulicy, furtka, płoty zamiast zarządu, bramy i klatek), karta miejsca wybranego do cna, linia końca gry po ludzku i pasek
   atrybucji w /v03/, a do tego cztery karty, które łatają dziurę za 3 złomu jak menu („Ślady przy siatce” w obu trybach,
   „Kury sąsiadów” w domu i krok 2 „Szczekania”; po polsku i po angielsku): podpis „(Złom 3)”, wybór wyłączony przy dwóch
   sztukach, po kliknięciu 3 sztuki mniej, jedna dziura załatana i wpis w kronice.
   Każdy scenariusz sam sprawdza tekst na ekranie; zrzut jest ostatnim stanem scenariusza. */

import type { Page } from '@playwright/test';
import { waitIdle } from './browser.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts (jego `Shot` nie jest wyeksportowany) */
export interface ShotTeksty {
  name: string;
  query: string;
  w?: number;
  h?: number;
  touch?: boolean;
  lang?: 'en' | 'pl';
  run: (page: Page, base: string) => Promise<void>;
}

/** słowa z bloku, których w tych ekranach domu nie ma (po polsku i po angielsku; „garden gate” jest dozwolone) */
const BLOKOWE_PL = /bram|zarząd|spółdziel|klatk|trzepak|piwnic/i;
const BLOKOWE_EN = /co-op|(?<!research )\bboard\b|(?<!garden )\bgate\b|stairwell|carpet rack|cellar|basement/i;

const dwieKlatki = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** tekst widoczny w elemencie (bez znaczników) */
const tekst = (page: Page, sel: string): Promise<string> =>
  page.evaluate((s) => (document.querySelector<HTMLElement>(s)?.innerText ?? '').replace(/\s+/g, ' ').trim(), sel);

/** zmiana języka jak z przełącznika, bez zapisu w pamięci (słuchacz w main.ts rysuje otwarte okno od nowa) */
const zmienJezyk = (page: Page, l: 'en' | 'pl') =>
  page.evaluate(async (l) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    ((await load('/src/core/jezyk.ts')) as typeof import('../src/core/jezyk.ts')).ustawJezyk(l);
  }, l);

/** Ustawia zegar gry na dzień `dzien` o `godz` (tick liczy się od 15:00 dnia 1, 800 ticków na godzinę): jak `przewin` w
    tools/shots.ts, ale od razu na wskazany moment; gra stoi (speed=0), więc nic się nie dzieje poza zegarem. */
async function ustawZegar(page: Page, dzien: number, godz: number): Promise<void> {
  await page.evaluate(
    ([d, h]) => {
      window.zm!.sim!.st.tick = (d - 1) * 24 * 800 + (h - 15) * 800;
    },
    [dzien, godz] as const,
  );
}

/** czeka, aż napis w elemencie będzie taki, jaki ma być (hud odświeża się co 200 ms) */
async function czekajNaNapis(page: Page, sel: string, oczekiwany: string): Promise<void> {
  try {
    await page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [sel, oczekiwany] as const, {
      timeout: 4000,
    });
  } catch {
    throw new Error(`${sel}: „${await tekst(page, sel)}” zamiast „${oczekiwany}”`);
  }
}

export function tekstyShots(): ShotTeksty[] {
  // ------------------------------------------------------------ pora roku na pasku (I4)
  const pora = (lang: 'pl' | 'en', query: string, nazwa: string, tryb: string): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${query}`);
      await waitIdle(page);
      const t =
        lang === 'pl' ? ['jesień 2051', 'zima 2051', 'wiosna 2052'] : ['autumn 2051', 'winter 2051', 'spring 2052'];
      await czekajNaNapis(page, '#hSeason', t[0]);
      await ustawZegar(page, 22, 12);
      await czekajNaNapis(page, '#hSeason', t[2]);
      // zima na końcu, żeby zrzut pokazał ją na pasku (dzień 12: −6°C na dworze, w zombie kafelki „siatka” i „stado”)
      await ustawZegar(page, 12, 12);
      await czekajNaNapis(page, '#hSeason', t[1]);
      console.log(`  ${tryb}: ${lang} ${t[0]} → ${t[2]} → ${t[1]}, dzień „${await tekst(page, '#hDay')}”`);
      // napis mieści się w zegarze
      const mieści = await page.evaluate(() => {
        const e = document.getElementById('hSeason')!;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right <= innerWidth && e.scrollWidth <= e.clientWidth + 1;
      });
      if (!mieści) throw new Error('podpis pory roku nie mieści się na pasku');
      await dwieKlatki(page);
    },
  });

  // ------------------------------------------------------------ dom jednorodzinny (I3)
  const dom = 'demo=zielonki&speed=0&cam=hq,1.3';
  const bezBlokowych = (lang: 'pl' | 'en', co: string, t: string) => {
    const re = lang === 'pl' ? BLOKOWE_PL : BLOKOWE_EN;
    const m = re.exec(t);
    if (m) throw new Error(`${co}: słowo z bloku „${m[0]}” w: ${t}`);
  };

  /** Menu → „Drogi do zwycięstwa” */
  const otworzDrogi = async (page: Page) => {
    await page.click('#btnMenu');
    await page.waitForSelector('#sheet [data-act="menu-zwyciestwo"]');
    await page.click('#sheet [data-act="menu-zwyciestwo"]');
    await page.waitForSelector('#sheet .zw-drogi .zw-droga');
    await dwieKlatki(page);
  };

  const drogi = (lang: 'pl' | 'en', nazwa: string): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${dom}`);
      await waitIdle(page);
      await otworzDrogi(page);
      const t = await tekst(page, '#sheet .zw-drogi');
      const ludnosc =
        lang === 'pl' ? 'Zbierzcie 10 osób pod komitetem ulicy.' : 'Get 10 people under the street committee.';
      if (!t.includes(ludnosc)) throw new Error(`ekran dróg bez „${ludnosc}”: ${t}`);
      // nazwa drogi „Nowe osiedle” zostaje (to nazwa, nie słownik miejsca); reszta ekranu bez słów z bloku
      bezBlokowych(lang, 'ekran dróg', t.replace(/A new estate/g, ''));
      console.log(`  ekran dróg (${lang}): ${ludnosc}`);
    },
  });

  /** epilog zwycięstwa drogi w domu: ścieżka uchwał i tryb ustawione przed `wygraj`; teksty obowiązkowe i zabronione */
  const epilog = (
    lang: 'pl' | 'en',
    nazwa: string,
    o: { droga: 'ludnosc' | 'technologia'; sciezka: 'porzadek' | 'wspolnota' | null; zombie?: boolean; ma: string[] },
  ): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${dom}${o.zombie ? '&tryb=zombie' : ''}`);
      await waitIdle(page);
      await page.evaluate((s) => {
        window.zm!.gov!.laws.path = s;
      }, o.sciezka);
      const rodzaj = await page.evaluate((d) => window.zm!.wygraj(d), o.droga);
      if (rodzaj !== 'zwyciestwo') throw new Error(`wygraj(${o.droga}) otworzyło „${rodzaj}”`);
      await page.waitForSelector('#sheet.zwyciestwo');
      await dwieKlatki(page);
      const t = await tekst(page, '#sheet .sheet-body');
      for (const fraza of o.ma) if (!t.includes(fraza)) throw new Error(`epilog bez „${fraza}”: ${t}`);
      bezBlokowych(lang, 'epilog', t);
      console.log(`  epilog (${lang}, ${o.droga}): ${t}`);
    },
  });

  /** mapa miasta → miejsce z aktywnym „Wyślij wyprawę” → okno planu bez zaznaczonej osoby */
  const wyprawa = (lang: 'pl' | 'en', nazwa: string): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${dom}`);
      await waitIdle(page);
      await page.click('#btnMiasto');
      await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
      await page.waitForTimeout(1500);
      const kandydaci = await page.evaluate(() =>
        [...window.zm!.okolica].sort((a, b) => a.odl - b.odl).map((m) => ({ klucz: m.klucz, odl: Math.round(m.odl) })),
      );
      for (const m of kandydaci) {
        await page.evaluate((k) => window.zm!.mapa()!.wybierz(k), m.klucz);
        await page.waitForTimeout(300);
        const aktywny = await page.evaluate(() => {
          const b = document.querySelector<HTMLButtonElement>('#sheet [data-miasto-karta] [data-act="wyslij"]');
          return !!b && !b.disabled;
        });
        if (!aktywny) continue;
        await page.click('#sheet [data-miasto-karta] [data-act="wyslij"]');
        await page.waitForSelector('#sheet .wp');
        await dwieKlatki(page);
        const t = await tekst(page, '#sheet .wp');
        const oczekiwany = lang === 'pl' ? 'Wybierz kogoś z komitetu.' : 'Select someone from the committee.';
        // nikt nie jest zaznaczony w grze, więc okno pokazuje powód „wybierz kogoś”
        if (!t.includes(oczekiwany)) throw new Error(`plan wyprawy bez „${oczekiwany}”: ${t}`);
        bezBlokowych(lang, 'plan wyprawy', t);
        console.log(`  plan wyprawy (${lang}, ${m.klucz} ${m.odl} m): ${oczekiwany}`);
        return;
      }
      throw new Error(`żadne z ${kandydaci.length} miejsc nie pozwala wysłać wyprawy`);
    },
  });

  /** panel Pracy w domu: opis „Naprawy” w domu i ostrzeżenie, gdy nikt nie ma Ognia */
  const praca = (lang: 'pl' | 'en', nazwa: string): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${dom}`);
      await waitIdle(page);
      // wszyscy z zarządu bez Ognia: ostrzeżenie nad tabelą (polecenia czekają w kolejności, a panel je nakłada od razu)
      await page.evaluate(() => {
        const sim = window.zm!.sim!;
        for (const p of sim.st.pawns.filter((q) => q.kind === 'core'))
          sim.push({ t: 'prio', ids: [], osoba: p.person, rodzaj: 'ogien', prio: 0 });
      });
      await page.click('#btnPraca');
      await page.waitForSelector('#pracaPanel [data-kol="naprawy"]');
      await page.click('#pracaPanel [data-kol="naprawy"]');
      await page.waitForSelector('#pracaPanel [data-uwaga="ogien"]');
      // panel wjeżdża z przejściem: zrzut po jego końcu, a nie w półprzezroczystości
      await page.waitForTimeout(600);
      await dwieKlatki(page);
      const t = await tekst(page, '#pracaPanel');
      const naprawy =
        lang === 'pl'
          ? 'Łatanie dziur w siatce i naprawy w naszym domu.'
          : 'Patching holes in the fence and repairs in our house.';
      const ogien =
        lang === 'pl' ? 'Nikt w komitecie nie ma włączonego Ognia' : 'Nobody on the committee has Fire switched on';
      for (const fraza of [naprawy, ogien]) if (!t.includes(fraza)) throw new Error(`panel Pracy bez „${fraza}”: ${t}`);
      bezBlokowych(lang, 'panel Pracy', t);
      console.log(`  panel Pracy (${lang}): ${naprawy} / ${ogien}`);
    },
  });

  // ------------------------------------------------------------ „Ślady przy siatce” łatają za 3 złomu jak menu (zadanie 14 ścieżki celów)
  /** złom w zapasie tak, jak liczy go odczyt gry (stosy złomu poza budynkami sąsiadów) */
  const zlomWGrze = (page: Page): Promise<number> =>
    page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const m = (await load('/src/sim/snapshot.ts')) as typeof import('../src/sim/snapshot.ts');
      const sim = window.zm!.sim!;
      return m.snapshot(sim.st, sim.w).stock.scrap;
    });

  /** zostawia w zapasie dokładnie `n` sztuk złomu (zmniejsza stosy w stanie symulacji; gra stoi, więc nic ich nie dotyka) */
  const ustawZlom = async (page: Page, n: number): Promise<void> => {
    await page.evaluate(async (n) => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const m = (await load('/src/sim/snapshot.ts')) as typeof import('../src/sim/snapshot.ts');
      const sim = window.zm!.sim!;
      const zlom = () => m.snapshot(sim.st, sim.w).stock.scrap;
      for (const t of sim.st.things) {
        if (t.kind !== 'zlom') continue;
        const nadmiar = zlom() - n;
        if (nadmiar <= 0) break;
        t.n -= Math.min(t.n, nadmiar);
      }
      if (zlom() !== n) throw new Error(`w grze jest ${zlom()} złomu zamiast ${n}`);
    }, n);
    await czekajNaNapis(page, '#sScrap .stat-v', String(n));
  };

  /** otwarte dziury w siatce (bez łaty) */
  const otwarteDziury = (page: Page): Promise<number> =>
    page.evaluate(() => (window.zm!.sim!.st.fence?.holes ?? []).filter((h) => !h.patch).length);

  /** Karta, która łata dziurę za złom: adres gry, id i dane karty otwartej wprost, podpisy wszystkich wyborów (łata pod
      numerem `lata`) i wpis w kronice po łacie */
  interface KartaLaty {
    query: string;
    id: string;
    d: unknown;
    wybory: { pl: string[]; en: string[] };
    lata: number;
    wpis: { pl: string; en: string };
    /** dodatkowa kontrola stanu gry po kliknięciu łaty */
    poKliku?: (page: Page) => Promise<void>;
  }

  const SLADY_D = { where: { pl: 'przy garażach', en: 'by the garages' } };
  const SLADY: KartaLaty = {
    query: 'demo=przymorze&speed=0&cam=hq,1.3',
    id: 'slady',
    d: SLADY_D,
    wybory: {
      pl: ['Załatać przed nocą (Złom 3)', 'Powiesić puszki z kamykami', 'Udawać, że nic nie widać'],
      en: ['Patch it up before dark (Scrap 3)', 'Hang up tins full of pebbles', 'Pretend you saw nothing'],
    },
    lata: 0,
    wpis: { pl: 'Dziura załatana złomem i drutem.', en: 'The hole is patched up with scrap and wire.' },
  };
  const SLADY_Z: KartaLaty = {
    query: 'demo=przymorze&speed=0&cam=hq,1.3&tryb=zombie',
    id: 'slady_z',
    d: SLADY_D,
    wybory: {
      pl: ['Załatać przed nocą (Złom 3)', 'Postawić tam kogoś z dzidą na noc'],
      en: ['Patch it up before dark (Scrap 3)', 'Post someone there with a spear for the night'],
    },
    lata: 0,
    wpis: SLADY.wpis,
  };
  const KURY: KartaLaty = {
    query: 'demo=zielonki&speed=0&cam=hq,1.3',
    id: 'kury',
    d: {},
    wybory: {
      pl: ['Odnieść kury i jajko', 'Zatrzymać jajko', 'Załatać dziurę (Złom 3)'],
      en: ['Return the hens and the egg', 'Keep the egg', 'Patch the hole (Scrap 3)'],
    },
    lata: 2,
    wpis: {
      pl: 'Dziura załatana. Kury muszą szukać innej drogi.',
      en: 'Hole patched. The hens will have to find another way.',
    },
  };
  const SZCZEKANIE: KartaLaty = {
    query: 'demo=przymorze&speed=0&cam=hq,1.3',
    id: 'szczekanie_2',
    d: { jak: 'nic' },
    wybory: {
      pl: ['Podłożyć resztki pod siatką (Jedzenie 1)', 'Załatać dziurę (Złom 3)', 'Nie ruszać'],
      en: ['Leave scraps under the fence (Food 1)', 'Patch the hole (Scrap 3)', 'Leave it'],
    },
    lata: 1,
    wpis: {
      pl: 'Dziura załatana złomem i drutem. Cokolwiek tu chodzi, musi wejść inną drogą.',
      en: 'The hole is patched with scrap and wire. Whatever has been coming through will need another way in.',
    },
    // krok łańcucha zostawia hak, który zwalnia krok 3 („Pies przychodzi sam”, tekst „Dziury już nie ma”)
    poKliku: async (page) => {
      const hak = await page.evaluate(() => window.zm!.gov!.watki?.haki['szczekanie.slady']?.d);
      if (JSON.stringify(hak) !== '{"jak":"lata"}') throw new Error(`hak szczekanie.slady: ${JSON.stringify(hak)}`);
    },
  };

  /** Karta otwarta wprost (jak `doKarty` w tools/shots.ts, ale bez czekania na losowanie), z wyborami z DOM: wszystkie
      podpisy, podpis łaty z 3 sztukami złomu, łata wyłączona przy dwóch sztukach i włączona od trzech, reszta wyborów zawsze
      włączona; z `klik` wybór łaty idzie w ruch i zapas ma o 3 sztuki mniej, a przy siatce z dziurami o jedną dziurę mniej,
      z wpisem w kronice. */
  const lataKarty = (
    lang: 'pl' | 'en',
    nazwa: string,
    k: KartaLaty,
    o: { zlom: number | null; klik?: boolean },
  ): ShotTeksty => ({
    name: nazwa,
    query: '',
    lang,
    run: async (page, base) => {
      await page.goto(`${base}?${k.query}`);
      await waitIdle(page);
      if (o.zlom !== null) await ustawZlom(page, o.zlom);
      const zlomPrzed = await zlomWGrze(page);
      const dziurPrzed = await otwarteDziury(page);
      await page.evaluate(
        ([id, d]) => {
          window.zm!.gov!.ev.active = { id, d };
          window.zm!.govTick();
        },
        [k.id, k.d] as const,
      );
      await page.waitForSelector('#sheet .choices [data-act="event"]');
      await dwieKlatki(page);
      const wybory = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLButtonElement>('#sheet .choices [data-act="event"]')].map((b) => ({
          t: (b.textContent ?? '').trim(),
          wylaczony: b.disabled,
        })),
      );
      console.log(
        `  ${k.id} ${lang}, złom ${zlomPrzed}, dziur ${dziurPrzed}: ${wybory.map((w) => `${w.t}${w.wylaczony ? ' [wyłączony]' : ''}`).join(' | ')}`,
      );
      if (JSON.stringify(wybory.map((w) => w.t)) !== JSON.stringify(k.wybory[lang]))
        throw new Error(`wybory: ${JSON.stringify(wybory.map((w) => w.t))} zamiast ${JSON.stringify(k.wybory[lang])}`);
      if (wybory.some((w) => /Złom 2|Scrap 2/.test(w.t))) throw new Error('stary koszt łaty na karcie');
      const ma = zlomPrzed >= 3;
      if (wybory[k.lata].wylaczony === ma)
        throw new Error(`łata ${ma ? 'wyłączona' : 'włączona'} przy złomie ${zlomPrzed}`);
      for (const [n, w] of wybory.entries()) if (n !== k.lata && w.wylaczony) throw new Error(`wybór ${n} wyłączony`);
      if (!o.klik) return;
      if (!ma) throw new Error('klik bez złomu na łatę');
      await page.click(`#sheet .choices [data-act="event"][data-arg="${k.lata}"]`);
      await page.waitForFunction(() => !document.querySelector('#sheet .choices'));
      // łata idzie w poleceniu `mend` do kolejki symulacji: kilka kroków, żeby się wykonała
      await page.evaluate(() => window.zm!.ff(0.25));
      await czekajNaNapis(page, '#sScrap .stat-v', String(zlomPrzed - 3));
      const po = { zlom: await zlomWGrze(page), dziur: await otwarteDziury(page) };
      const wpisy = await page.evaluate(() => window.zm!.gov!.log.slice(-4).map((e) => e.txt));
      console.log(`  po kliknięciu: złom ${zlomPrzed} → ${po.zlom}, otwartych dziur ${dziurPrzed} → ${po.dziur}`);
      if (po.zlom !== zlomPrzed - 3) throw new Error(`złom ${zlomPrzed} → ${po.zlom}, a łata ma kosztować 3`);
      if (dziurPrzed > 0 && po.dziur !== dziurPrzed - 1) throw new Error(`dziur ${dziurPrzed} → ${po.dziur}`);
      const wpis = wpisy.find((t) => t.pl === k.wpis.pl);
      if (wpis?.en !== k.wpis.en)
        throw new Error(`wpis w kronice: ${JSON.stringify(wpisy)} bez ${JSON.stringify(k.wpis)}`);
      await k.poKliku?.(page);
    },
  });

  return [
    pora('pl', 'demo=zielonki&tryb=zombie&speed=0&cam=hq,1.3', 'teksty-pasek-zima-zombie', 'zombie'),
    pora('en', 'demo=przymorze&speed=0&cam=hq,1.3', 'en-teksty-pasek-zima', 'zwykły'),
    pora('pl', 'demo=przymorze&speed=0&cam=hq,1.3', 'teksty-pasek-zima', 'zwykły'),
    drogi('pl', 'teksty-dom-drogi'),
    drogi('en', 'en-teksty-dom-drogi'),
    epilog('pl', 'teksty-dom-epilog-ludnosc', {
      droga: 'ludnosc',
      sciezka: 'porzadek',
      ma: ['Na płotach wiszą grafiki dyżurów', 'regulamin koszenia trawników', 'Furtka zamyka się o dwudziestej'],
    }),
    epilog('en', 'en-teksty-dom-epilog-ludnosc', {
      droga: 'ludnosc',
      sciezka: 'wspolnota',
      ma: ['Rotas hang on the fences', 'rules for mowing the lawns', 'Every house has its own meeting'],
    }),
    epilog('pl', 'teksty-dom-epilog-fabryka-zombie', {
      droga: 'technologia',
      sciezka: null,
      zombie: true,
      ma: ['wychodzą z furtki', 'Komitet ulicy dalej się spiera, czy to już osada, czy jeszcze ulica.'],
    }),
    wyprawa('pl', 'teksty-dom-wyprawa'),
    wyprawa('en', 'en-teksty-dom-wyprawa'),
    praca('pl', 'teksty-dom-praca'),
    praca('en', 'en-teksty-dom-praca'),
    {
      // „Do broni!” w domu: podpowiedź z komitetem, po zmianie języka przy otwartej grze też
      name: 'teksty-dom-alarm',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?${dom}`);
        await waitIdle(page);
        const title = () => page.evaluate(() => document.getElementById('btnAlarm')!.title);
        const pl = await title();
        if (pl !== 'Wszyscy zdolni z komitetu na wartę') throw new Error(`podpowiedź alarmu: „${pl}”`);
        await zmienJezyk(page, 'en');
        await page.waitForFunction(() => document.getElementById('btnAlarm')!.title.startsWith('Everyone fit on'));
        const en = await title();
        if (en !== 'Everyone fit on the committee goes on watch')
          throw new Error(`podpowiedź alarmu po angielsku: „${en}”`);
        await zmienJezyk(page, 'pl');
        await page.waitForFunction(() => document.getElementById('btnAlarm')!.title.startsWith('Wszyscy zdolni'));
        if ((await title()) !== pl) throw new Error('podpowiedź alarmu po powrocie do polskiego inna niż na starcie');
        console.log(`  alarm: „${pl}” / „${en}”`);
        // w bloku po staremu
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
        await waitIdle(page);
        const blok = await title();
        if (blok !== 'Wszyscy zdolni z zarządu na wartę') throw new Error(`podpowiedź alarmu w bloku: „${blok}”`);
      },
    },
    {
      // M13: karta miejsca, które było puste od początku (52 z 190 miejsc w Przymorzu): jedna linia stanu „zanim tu
      // dotarliście”, obok „Jeszcze tu nie byliście.”, bez powtórki w powodzie pod listą
      name: 'teksty-mapa-karta-wybrane',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&speed=0&godzina=8&cam=hq,1.6`);
        await waitIdle(page);
        await page.click('#btnMiasto');
        await page.waitForFunction(() => window.zm!.mapa()?.stan().otwarta);
        await page.waitForTimeout(1500);
        const klucze = await page.evaluate(() =>
          [...window.zm!.okolica].sort((a, b) => a.odl - b.odl).map((m) => m.klucz),
        );
        for (const k of klucze) {
          await page.evaluate((x) => window.zm!.mapa()!.wybierz(x), k);
          await page.waitForTimeout(250);
          const karta = await tekst(page, '#sheet [data-miasto-karta]');
          if (!karta.includes('zanim tu dotarliście')) continue;
          const ile = (karta.match(/do cna/g) ?? []).length;
          if (ile !== 1) throw new Error(`„do cna” ${ile} razy na karcie: ${karta}`);
          if (!karta.includes('Jeszcze tu nie byliście.'))
            throw new Error(`karta bez „Jeszcze tu nie byliście.”: ${karta}`);
          const przycisk = await page.evaluate(
            () => document.querySelector<HTMLButtonElement>('#sheet [data-miasto-karta] [data-act="wyslij"]')!.disabled,
          );
          if (!przycisk) throw new Error('przycisk wysyłki aktywny przy miejscu wybranym do cna');
          console.log(`  karta ${k}: ${karta}`);
          return;
        }
        throw new Error(`żadne z ${klucze.length} miejsc nie jest puste od początku`);
      },
    },
    {
      // M1: koniec gry w kronice mówi tytułem zakończenia (podpowiedź pod oknem końca): w bloku i po angielsku
      name: 'teksty-koniec-gry',
      query: '',
      run: async (page, base) => {
        await page.goto(`${base}?demo=przymorze&speed=0&cam=hq,1.3`);
        await waitIdle(page);
        await page.evaluate(() => {
          window.zm!.gov!.anger = 100;
          window.zm!.govTick();
        });
        await page.waitForSelector('#sheet .sheet-title');
        await dwieKlatki(page);
        const podpowiedz = await tekst(page, '#hint');
        const ostatni = await page.evaluate(() => window.zm!.gov!.log.at(-1)!.txt);
        console.log(`  podpowiedź: „${podpowiedz}”, kronika: ${JSON.stringify(ostatni)}`);
        if (ostatni.pl !== 'Koniec gry: walne odwołało zarząd.') throw new Error(`kronika po polsku: ${ostatni.pl}`);
        if (ostatni.en !== 'Game over: the general meeting recalled the board.')
          throw new Error(`kronika po angielsku: ${ostatni.en}`);
        if (/odwolanie/.test(podpowiedz)) throw new Error(`podpowiedź z identyfikatorem: ${podpowiedz}`);
      },
    },
    ...[
      { name: 'teksty-v03-atrybucja', w: 1440, h: 900 },
      { name: 'teksty-v03-atrybucja-telefon', w: 390, h: 844 },
    ].map(
      (s): ShotTeksty => ({
        name: s.name,
        query: '',
        w: s.w,
        h: s.h,
        run: async (page, base) => {
          await page.goto(`${base}v03/index.html`);
          await page.click('#btnSample');
          await page.click('button[data-sh=close]');
          await page.waitForTimeout(1500);
          const pasek = await page.evaluate(() => {
            const e = document.querySelector<HTMLElement>('.attrib')!;
            const r = e.getBoundingClientRect();
            return {
              tekst: e.textContent ?? '',
              widac: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 0.5,
              linki: [...e.querySelectorAll('a')].map((a) => a.href),
            };
          });
          console.log(`  /v03/ ${s.w}px: ${pasek.tekst} (${pasek.linki.join(', ')})`);
          if (pasek.tekst !== '© współtwórcy OpenStreetMap · OpenFreeMap · OpenMapTiles')
            throw new Error(`pasek atrybucji w /v03/: „${pasek.tekst}”`);
          if (!pasek.widac) throw new Error('pasek atrybucji poza ekranem');
          if (pasek.linki.length !== 3) throw new Error(`linków w pasku: ${pasek.linki.length}`);
        },
      }),
    ),
    lataKarty('pl', 'teksty-slady-lata', SLADY, { zlom: null }),
    lataKarty('pl', 'teksty-slady-lata-klik', SLADY, { zlom: null, klik: true }),
    lataKarty('en', 'en-teksty-slady-lata-brak', SLADY, { zlom: 2 }),
    lataKarty('pl', 'teksty-slady-lata-zombie-brak', SLADY_Z, { zlom: 2 }),
    lataKarty('en', 'en-teksty-slady-lata-zombie', SLADY_Z, { zlom: null, klik: true }),
    lataKarty('pl', 'teksty-kury-lata-klik', KURY, { zlom: null, klik: true }),
    lataKarty('en', 'en-teksty-kury-lata-brak', KURY, { zlom: 2 }),
    lataKarty('pl', 'teksty-szczekanie-lata-klik', SZCZEKANIE, { zlom: null, klik: true }),
    lataKarty('en', 'en-teksty-szczekanie-lata-brak', SZCZEKANIE, { zlom: 2 }),
  ];
}
