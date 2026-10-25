/* Zrzuty i sprawdzenia wiki w grze (src/ui/wiki.ts, wiki-okno.ts) do `npm run shots` (scenariusze wiki-*): lista i artykuł
   o budowli na komputerze 1440×900 po polsku i na telefonie 390×844 po angielsku, wąski telefon 360 px, otwarcie z czipa
   paska (drewno) z pauzą gry i wznowieniem po Esc, czip „d·z·cz” na telefonie, wyszukiwanie, artykuły o zarządzie w domu (Zielonki: komitet i furtka zamiast zarządu i bramy) oraz w bloku.

   Każdy scenariusz sam sprawdza układ okna (`sprawdzUklad`): okno mieści się w widoku, strona i panele nie przewijają się w
   bok, żaden wiersz faktów ani tytuł nie wystaje, okno nie nachodzi na atrybucję map, a ta jest widoczna (leży nad zasłoną
   okna i ma napis). Teksty w domu sprawdza po słowach z bloku (jak BLOKOWE_UI w tools/shots.ts), a po angielsku po polskich
   literach; nazwy własne badań z tabel (np. „Kozy w mieszkaniach”) są dozwolone. */

import path from 'node:path';
import type { Page } from '@playwright/test';
import { DROGI } from '../src/gov/zwyciestwo.ts';
import { waitIdle } from './browser.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts (jego `Shot` nie jest wyeksportowany) */
export interface ShotWiki {
  name: string;
  query: string;
  w?: number;
  h?: number;
  touch?: boolean;
  lang?: 'en' | 'pl';
  run: (page: Page, base: string) => Promise<void>;
}

const GRA = 'demo=przymorze&speed=0&cam=hq,1.3';
const GRA_DOM = 'demo=zielonki&speed=0&cam=hq,1.3';

/** słowa z bloku, których w domu nie ma w artykułach wiki (po polsku): początek wyrazu, bez „piętrowych” łóżek i „blokuje” */
const BLOKOWE_PL =
  /(?<!\p{L})(klatk|piętr(?!ow)|spółdziel|pawilon|szlaban|świetlic|czynsz|blok(?!uj|ad)|mieszka[nń]|trzepak|bram|zarząd|walne|osiedl)/iu;
/** to samo po angielsku (jak BLOKOWE w tests/unit/teksty-miejsca-en.test.ts) */
const BLOKOWE_EN =
  /co-op|(?<!research )\bboard\b|general meeting|\bestate\b|carpet rack|stairwell|\bblocks?\b|\bflats?\b|pavilion|common room|service charge|\bresidents?\b|(?<!garden )\bgate\b/i;
/** nazwy własne z tabel gry, które mają block-owe słowa także w domu (nazwy badań); wycinane przed sprawdzeniem */
const NAZWY_WLASNE = [
  'Kozy w mieszkaniach',
  'LED-y na klatkach',
  'Pieczarki w piwnicach',
  'Stoves in the flats',
  'LEDs in the stairwells',
  'Estate mesh network',
  'Mushrooms in the basements',
];

/** nazwy dróg do zwycięstwa („Nowe osiedle”, „A new estate”) to nazwy własne jak nazwy badań: wypadają przed szukaniem słów z bloku (jak w tests/unit/wiki-tresc.test.ts) */
const NAZWY_DROG: readonly string[] = Object.values(DROGI).flatMap((d) => [d.nazwa.pl, d.nazwa.en]);

const polskieLitery = (tekst: string): string[] => [
  ...new Set(tekst.split(/[^\p{L}]+/u).filter((s) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s))),
];

/** Przejście na adres z jedną ponowną próbą po przekroczeniu czasu (sieć bywa niestabilna: czcionki Google). */
async function idz(page: Page, adres: string): Promise<void> {
  try {
    await page.goto(adres);
  } catch (e) {
    if ((e as Error).name !== 'TimeoutError') throw e;
    console.log('  (sieć: przejście na stronę przekroczyło czas, druga próba)');
    await page.goto(adres);
  }
}

/** start gry: strona, czekanie na świat i pierwsze chipy listy ludzi */
async function start(page: Page, base: string, query: string): Promise<void> {
  await idz(page, `${base}?${query}`);
  await waitIdle(page);
  await page.waitForSelector('#lista:not([hidden]) .lp');
}

const kliknij = (page: Page, sel: string, dotyk: boolean) => (dotyk ? page.tap(sel) : page.click(sel));

/** Menu → Wiki */
async function otworzZMenu(page: Page, dotyk: boolean): Promise<void> {
  await kliknij(page, '#btnMenu', dotyk);
  await page.waitForSelector('#sheet [data-act="menu-wiki"]');
  await kliknij(page, '#sheet [data-act="menu-wiki"]', dotyk);
  await page.waitForSelector('#sheet.wiki .wiki-uklad');
}

/** Rozwija kategorię na liście i otwiera artykuł. Na telefonie lista jest widoczna, dopóki nie wybierzemy artykułu. */
async function otworzArtykul(page: Page, id: string, dotyk: boolean): Promise<void> {
  const kat = id.split(':')[0];
  const mapaKat: Record<string, string> = {
    start: 'start',
    zasob: 'zasoby',
    budowla: 'budowle',
    budowle: 'budowle',
    badanie: 'badania',
    badania: 'badania',
    potrzeba: 'ludzie',
    ludzie: 'ludzie',
    bron: 'ludzie',
    praca: 'praca',
    noc: 'noc',
    zarzad: 'zarzad',
    uchwala: 'zarzad',
    wydarzenia: 'wydarzenia',
    miasto: 'miasto',
    miejsce: 'miasto',
    sasiedzi: 'sasiedzi',
    drogi: 'drogi',
    zombie: 'zombie',
  };
  const grupa = `#sheet .wiki-kat[data-kat="${mapaKat[kat]}"]`;
  const otwarta = await page.$eval(grupa, (d) => (d as HTMLDetailsElement).open);
  if (!otwarta) await kliknij(page, `${grupa} > summary`, dotyk);
  await kliknij(page, `#sheet .wiki-poz[data-arg="${id}"]`, dotyk);
  await page.waitForSelector(`#sheet .wiki-art[data-art="${id}"]`);
}

/** Układ okna wiki: mieści się w widoku, nic nie przewija się w bok, nic nie wystaje, atrybucja jest widoczna. */
async function sprawdzUklad(page: Page, opis: string): Promise<void> {
  const problemy = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = (e: Element) => e.getBoundingClientRect();
    const sheet = document.getElementById('sheet')!;
    const sr = rect(sheet);
    if (sr.left < -0.5 || sr.top < -0.5 || sr.right > vw + 0.5 || sr.bottom > vh + 0.5)
      out.push(`okno poza widokiem: ${JSON.stringify(sr)}`);
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`strona przewija się w bok: ${document.documentElement.scrollWidth} > ${vw}`);
    if (document.body.scrollWidth > vw + 1) out.push(`body przewija się w bok: ${document.body.scrollWidth} > ${vw}`);
    const panele = ['.sheet-body', '.wiki-uklad', '.wiki-nav', '.wiki-lista', '.wiki-tresc'];
    for (const sel of panele)
      for (const el of sheet.querySelectorAll<HTMLElement>(sel)) {
        if (getComputedStyle(el).display === 'none') continue;
        if (el.scrollWidth > el.clientWidth + 1)
          out.push(`${sel} przewija się w bok: ${el.scrollWidth} > ${el.clientWidth}`);
      }
    // wiersze faktów, tytuł, przyciski: nic nie wystaje poza swój panel
    const tresc = sheet.querySelector<HTMLElement>('.wiki-tresc');
    if (tresc && getComputedStyle(tresc).display !== 'none') {
      const tr = rect(tresc);
      for (const el of tresc.querySelectorAll<HTMLElement>(
        '.wiki-tytul, .wiki-fakt dt, .wiki-fakt dd, .wiki-link, .wiki-zdania, .wiki-jak li, .wiki-akcje .btn',
      )) {
        const r = rect(el);
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > tr.right + 1 || r.left < tr.left - 1)
          out.push(
            `${el.className || el.tagName} wystaje w poziomie: ${Math.round(r.left)}–${Math.round(r.right)} poza ${Math.round(tr.left)}–${Math.round(tr.right)}`,
          );
        if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className || el.tagName} ma ucięty tekst`);
      }
    }
    // przyciski stopki są w oknie
    for (const b of sheet.querySelectorAll<HTMLElement>('.sheet-foot .btn')) {
      const r = rect(b);
      if (r.right > sr.right + 0.5 || r.left < sr.left - 0.5 || r.bottom > sr.bottom + 0.5)
        out.push('przycisk stopki poza oknem');
    }
    // atrybucja: widoczna, z napisem, nad zasłoną i bez nachodzenia na okno
    const at = document.querySelector<HTMLElement>('#app .attrib');
    if (!at) out.push('brak atrybucji map');
    else {
      const cs = getComputedStyle(at);
      const r = rect(at);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) out.push('atrybucja map niewidoczna');
      if (
        !/OpenStreetMap/.test(at.textContent ?? '') ||
        !/OpenFreeMap/.test(at.textContent ?? '') ||
        !/OpenMapTiles/.test(at.textContent ?? '')
      )
        out.push(`atrybucja bez trzech źródeł: ${at.textContent}`);
      if (r.right > vw + 0.5 || r.bottom > vh + 0.5 || r.left < -0.5)
        out.push(`atrybucja poza widokiem: ${JSON.stringify(r)}`);
      const zachodzi = !(r.right <= sr.left || r.left >= sr.right || r.bottom <= sr.top || r.top >= sr.bottom);
      if (zachodzi) out.push(`atrybucja nachodzi na okno: ${JSON.stringify(r)} / ${JSON.stringify(sr)}`);
      const z = Number.parseInt(cs.zIndex, 10);
      const zm = Number.parseInt(getComputedStyle(document.getElementById('modal')!).zIndex, 10);
      if (!(z > zm)) out.push(`atrybucja pod zasłoną okna (z-index ${cs.zIndex} ≤ ${zm})`);
      // w punkcie środka atrybucji leży ona sama (nic jej nie zasłania)
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !at.contains(top)) out.push(`atrybucję coś zasłania: ${top?.tagName}.${top?.className}`);
    }
    return out;
  });
  if (problemy.length) throw new Error(`${opis}: ${problemy.join(' | ')}`);
}

/** tekst widocznej części okna wiki (lista i artykuł) */
const tekstOkna = (page: Page): Promise<string> =>
  page.evaluate(() => (document.querySelector('#sheet .wiki-uklad') as HTMLElement).innerText);

/** wiki w domu nie mówi o bloku, a po angielsku nie ma polskich liter */
function sprawdzJezyk(opis: string, tekst: string, o: { dom?: boolean; en?: boolean }): void {
  let t = tekst;
  for (const n of [...NAZWY_WLASNE, ...NAZWY_DROG]) t = t.replaceAll(n, ' ');
  if (o.dom) {
    const re = o.en ? BLOKOWE_EN : BLOKOWE_PL;
    const trafienia = t.match(new RegExp(re.source, `${re.flags.replace('g', '')}g`));
    if (trafienia) throw new Error(`${opis}: w domu stoją słowa z bloku: ${[...new Set(trafienia)].join(', ')}`);
  }
  if (o.en) {
    const pl = polskieLitery(t);
    if (pl.length) throw new Error(`${opis}: polskie litery po angielsku: ${pl.join(', ')}`);
  }
}

export function wikiShots(out: string): ShotWiki[] {
  const zapisz = (page: Page, nazwa: string) => page.screenshot({ path: path.join(out, `${nazwa}.png`) });
  return [
    // lista i domyślny artykuł na komputerze, po polsku, w bloku
    {
      name: 'wiki-lista-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        // domyślnie po prawej „Zacznij tutaj”, a lista ma otwartą pierwszą kategorię
        await page.waitForSelector('#sheet .wiki-art[data-art="start:zacznij"]');
        const widok = await page.$eval('#sheet .wiki-uklad', (e) => (e as HTMLElement).dataset.widok);
        if (widok !== 'lista') throw new Error(`widok na starcie: ${widok}`);
        await sprawdzUklad(page, 'lista na komputerze');
        sprawdzJezyk('lista na komputerze', await tekstOkna(page), {});
      },
    },
    // artykuł o budowli: fakty z tabeli, kroki myszą, odnośniki „Zobacz też”
    {
      name: 'wiki-budowla-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        await otworzArtykul(page, 'budowla:warsztat', false);
        const fakty = await page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        for (const f of ['koszt', 'praca', 'miejsce', 'odblokowanie'])
          if (!fakty.includes(f)) throw new Error(`brak faktu ${f} w artykule o warsztacie`);
        const koszt = await page.$eval('#sheet .wiki-fakt[data-fakt="koszt"] dd', (e) => (e as HTMLElement).innerText);
        if (!/deski 20/.test(koszt) || !/złom 10/.test(koszt)) throw new Error(`koszt warsztatu: ${koszt}`);
        await sprawdzUklad(page, 'artykuł o warsztacie na komputerze');
        // odnośnik „Zobacz też” otwiera inny artykuł, a lista zostaje na miejscu
        await page.click('#sheet .wiki-zobacz .wiki-link[data-arg="zasob:deski"]');
        await page.waitForSelector('#sheet .wiki-art[data-art="zasob:deski"]');
        await page.click('#sheet .wiki-zobacz .wiki-link[data-arg="budowla:warsztat"]');
        await page.waitForSelector('#sheet .wiki-art[data-art="budowla:warsztat"]');
        await sprawdzUklad(page, 'artykuł po odnośniku');
      },
    },
    // telefon po angielsku: najpierw sama lista, potem artykuł z przyciskiem powrotu
    {
      name: 'wiki-lista-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, true);
        const widok = await page.$eval('#sheet .wiki-uklad', (e) => (e as HTMLElement).dataset.widok);
        if (widok !== 'lista') throw new Error(`widok na starcie: ${widok}`);
        const tresc = await page.$eval('#sheet .wiki-tresc', (e) => getComputedStyle(e).display);
        if (tresc !== 'none') throw new Error('na telefonie lista i artykuł naraz');
        await sprawdzUklad(page, 'lista na telefonie');
        sprawdzJezyk('lista na telefonie', await tekstOkna(page), { en: true });
      },
    },
    {
      name: 'wiki-budowla-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, true);
        await otworzArtykul(page, 'budowla:warsztat', true);
        const lista = await page.$eval('#sheet .wiki-nav', (e) => getComputedStyle(e).display);
        if (lista !== 'none') throw new Error('na telefonie artykuł i lista naraz');
        await sprawdzUklad(page, 'artykuł na telefonie');
        sprawdzJezyk('artykuł na telefonie', await tekstOkna(page), { en: true });
        // „List” wraca do listy, a wybrany artykuł zostaje zaznaczony
        await page.tap('#sheet .wiki-wstecz');
        const widok = await page.$eval('#sheet .wiki-uklad', (e) => (e as HTMLElement).dataset.widok);
        if (widok !== 'lista') throw new Error('przycisk Lista nie wrócił do listy');
        const zazn = await page.$eval('#sheet .wiki-poz[aria-current]', (e) => (e as HTMLElement).dataset.arg);
        if (zazn !== 'budowla:warsztat') throw new Error(`zaznaczony po powrocie: ${zazn}`);
        await page.tap('#sheet .wiki-poz[aria-current]');
        await page.waitForSelector('#sheet .wiki-art[data-art="budowla:warsztat"]');
        await zapisz(page, 'wiki-budowla-telefon-en-art');
      },
    },
    // wąski telefon 360 px: bez przewijania w bok
    {
      name: 'wiki-telefon-360',
      query: '',
      w: 360,
      h: 740,
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, true);
        await sprawdzUklad(page, 'lista przy 360 px');
        await otworzArtykul(page, 'budowla:kociol', true);
        await sprawdzUklad(page, 'artykuł o kotle przy 360 px');
        await page.tap('#sheet .wiki-wstecz');
        await otworzArtykul(page, 'zasob:jedzenie', true);
        await sprawdzUklad(page, 'artykuł o jedzeniu przy 360 px');
      },
    },
    // czip „drewno”: klik otwiera artykuł o drewnie, gra staje, Esc zamyka i gra rusza dalej
    {
      name: 'wiki-czip-drewno',
      query: '',
      run: async (page, base) => {
        await start(page, base, 'demo=przymorze&speed=1&cam=hq,1.3');
        const przed = await page.evaluate(() => window.zm!.speed());
        if (przed !== 1) throw new Error(`tempo przed: ${przed}`);
        await page.click('#sWood');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zasob:drewno"]');
        const tytul = await page.$eval('#sheet .wiki-tytul', (e) => (e as HTMLElement).innerText);
        if (tytul !== 'Drewno') throw new Error(`tytuł: ${tytul}`);
        const w = await page.evaluate(() => ({ tempo: window.zm!.speed(), fokus: document.activeElement?.id ?? '' }));
        if (w.tempo !== 0) throw new Error(`gra nie stanęła: tempo ${w.tempo}`);
        const widok = await page.$eval('#sheet .wiki-uklad', (e) => (e as HTMLElement).dataset.widok);
        if (widok !== 'art') throw new Error(`widok po czipie: ${widok}`);
        // grupa „Zasoby” jest otwarta i zaznaczona
        const zazn = await page.$eval('#sheet .wiki-poz[aria-current]', (e) => (e as HTMLElement).dataset.arg);
        if (zazn !== 'zasob:drewno') throw new Error(`zaznaczony: ${zazn}`);
        await sprawdzUklad(page, 'artykuł o drewnie z czipa');
        await zapisz(page, 'wiki-czip-drewno-otwarte');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        await page.waitForFunction(() => window.zm!.speed() === 1);
        // po zamknięciu spacja zatrzymuje grę (czip nie trzyma fokusu po kliknięciu myszą)
        const fokus = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);
        if (fokus === 'sWood') throw new Error('czip zachował fokus po kliknięciu myszą');
        await page.keyboard.press('Space');
        const tempo = await page.evaluate(() => window.zm!.speed());
        if (tempo !== 0) throw new Error(`spacja po wiki nie zatrzymała gry: ${tempo}`);
      },
    },
    // telefon: czip „pl·sc·pa” (jedno pole zamiast trzech) otwiera artykuł o materiałach z odzysku
    {
      name: 'wiki-czip-telefon',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA);
        // zwinięta linia stanu: stuknięcie rozwija pasek i nie otwiera wiki (src/ui/telefon.ts); artykuł otwiera dopiero kafelek
        // rozwiniętego paska
        await page.tap('#stats');
        await page.waitForFunction(() => !document.getElementById('stats')!.hasAttribute('data-zwiniete'));
        if (await page.evaluate(() => !document.getElementById('modal')!.hidden))
          throw new Error('stuknięcie w zwiniętą linię stanu otworzyło wiki');
        await page.tap('#sMats');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zasob:odzysk"]');
        await sprawdzUklad(page, 'artykuł z czipa na telefonie');
        sprawdzJezyk('artykuł z czipa na telefonie', await tekstOkna(page), { en: true });
      },
    },
    // wyszukiwanie: wynik „koza”, Enter otwiera pierwszy, czyszczenie wraca do grup
    {
      name: 'wiki-szukaj-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        await page.fill('#sheet .wiki-q', 'koza');
        await page.waitForSelector('#sheet .wiki-wyniki .wiki-poz');
        const wyniki = await page.$$eval('#sheet .wiki-wyniki .wiki-poz', (l) =>
          l.map((e) => (e as HTMLElement).dataset.arg),
        );
        if (!wyniki.includes('zasob:koza')) throw new Error(`wyniki dla „koza”: ${wyniki.join(', ')}`);
        await page.fill('#sheet .wiki-q', 'xyzzy');
        await page.waitForSelector('#sheet .wiki-brak');
        await page.fill('#sheet .wiki-q', 'ługi złom');
        const zlom = await page.$$eval('#sheet .wiki-wyniki .wiki-poz', (l) =>
          l.map((e) => (e as HTMLElement).dataset.arg),
        );
        console.log(`  „ługi złom”: ${zlom.length} wyników`);
        await page.fill('#sheet .wiki-q', 'kocioł');
        await page.waitForSelector('#sheet .wiki-wyniki .wiki-poz');
        await page.press('#sheet .wiki-q', 'Enter');
        await page.waitForSelector('#sheet .wiki-art');
        await sprawdzUklad(page, 'wyniki wyszukiwania');
      },
    },
    // ludzie i broń na komputerze, po polsku: potrzeby z faktami z funkcji gry, walka, strzelba i długa lista nastrojów
    {
      name: 'wiki-ludzie-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        for (const id of [
          'ludzie:zarzad',
          'potrzeba:warm',
          'ludzie:cechy',
          'ludzie:walka',
          'bron:strzelba',
          'ludzie:nastroje',
        ]) {
          await otworzArtykul(page, id, false);
          await sprawdzUklad(page, `artykuł ${id} na komputerze`);
        }
        const nastroje = await page.$$eval('#sheet .wiki-fakt', (l) => l.length);
        if (nastroje < 14) throw new Error(`lista nastrojów ma ${nastroje} wierszy`);
      },
    },
    // noc na telefonie po angielsku: napad (najwięcej faktów), wyprawa i karta nocy
    {
      name: 'wiki-noc-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, true);
        for (const id of ['noc:karta', 'noc:wyprawa', 'noc:napad']) {
          await otworzArtykul(page, id, true);
          await sprawdzUklad(page, `artykuł ${id} na telefonie`);
          sprawdzJezyk(`artykuł ${id} na telefonie`, await tekstOkna(page), { en: true });
          await page.tap('#sheet .wiki-wstecz');
        }
        await otworzArtykul(page, 'noc:napad', true);
        await zapisz(page, 'wiki-noc-telefon-en-napad');
      },
    },
    // zarząd na komputerze: wkurzenie z wierszami dryfu, uchwała z faktami, spis uchwał
    {
      name: 'wiki-zarzad-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        for (const id of [
          'zarzad:zaufanie',
          'zarzad:wkurzenie',
          'uchwala:u_kociol',
          'zarzad:uchwaly',
          'zarzad:raport',
        ]) {
          await otworzArtykul(page, id, false);
          await sprawdzUklad(page, `artykuł ${id} na komputerze`);
        }
        await otworzArtykul(page, 'zarzad:wkurzenie', false);
        const wiersze = await page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        if (!wiersze.some((w) => w?.startsWith('warm-'))) throw new Error(`brak wierszy dryfu: ${wiersze.join(', ')}`);
      },
    },
    // z karty osoby: klik w pasek potrzeby otwiera artykuł o niej (komputer i telefon), z panelu budowy: znaczek „i”
    {
      name: 'wiki-karta-potrzeba',
      query: '',
      run: async (page, base) => {
        await start(page, base, 'demo=przymorze&speed=1&cam=hq,1.3');
        await page.click('#lista .lp');
        await page.waitForSelector('#card .need[data-wiki="potrzeba:warm"]');
        await page.click('#card .need[data-wiki="potrzeba:warm"]');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="potrzeba:warm"]');
        const tempo = await page.evaluate(() => window.zm!.speed());
        if (tempo !== 0) throw new Error(`gra nie stanęła po kliknięciu paska: tempo ${tempo}`);
        await sprawdzUklad(page, 'artykuł o cieple z karty osoby');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        await page.waitForFunction(() => window.zm!.speed() === 1);
        // panel budowy: znaczek „i” przy szczegółach otwiera artykuł o zaznaczonej budowli
        await page.click('#btnBuild');
        await page.waitForSelector('#buildPanel .bd:not([hidden]) .build-i');
        const rodzaj = await page.$eval('#buildPanel .bd:not([hidden])', (e) => (e as HTMLElement).dataset.kind);
        await page.click('#buildPanel .bd:not([hidden]) .build-i');
        await page.waitForSelector(`#sheet.wiki .wiki-art[data-art="budowla:${rodzaj}"]`);
        await sprawdzUklad(page, 'artykuł o budowli z panelu budowy');
      },
    },
    {
      name: 'wiki-karta-potrzeba-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA);
        await page.tap('#lista .lp');
        // zwinięte potrzeby (telefon): stuknięcie w linię rozwija paski i nie otwiera wiki; artykuł otwiera dopiero pasek rozwiniętych
        await page.waitForSelector('#card .potrzeby-linia');
        await page.tap('#card .potrzeby-linia');
        await page.waitForSelector('#card .need[data-wiki="potrzeba:food"]', { state: 'visible' });
        if (await page.evaluate(() => !document.getElementById('modal')!.hidden))
          throw new Error('stuknięcie w linię potrzeb otworzyło wiki');
        await page.tap('#card .need[data-wiki="potrzeba:food"]');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="potrzeba:food"]');
        await sprawdzUklad(page, 'artykuł o najedzeniu z karty osoby na telefonie');
        sprawdzJezyk('artykuł o najedzeniu na telefonie', await tekstOkna(page), { en: true });
      },
    },
    // dom (Zielonki): komitet i furtka zamiast zarządu i bramy, bez słów z bloku
    {
      name: 'wiki-dom-zielonki',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA_DOM);
        await otworzZMenu(page, false);
        await otworzArtykul(page, 'budowla:kociol', false);
        const t = await tekstOkna(page);
        sprawdzJezyk('kocioł w domu', t, { dom: true });
        if (!/przedpokoj/.test(t.normalize('NFD').replace(/\p{M}/gu, '')))
          throw new Error('kocioł w domu nie stoi w przedpokoju');
        await sprawdzUklad(page, 'artykuł o kotle w domu');
        for (const id of ['zarzad:zaufanie', 'start:zacznij', 'noc:karta', 'uchwala:u_brama']) {
          await otworzArtykul(page, id, false);
          sprawdzJezyk(`artykuł ${id} w domu`, await tekstOkna(page), { dom: true });
        }
        await otworzArtykul(page, 'uchwala:u_brama', false);
        await sprawdzUklad(page, 'artykuł o uchwale w domu');
      },
    },
    // blok (Przymorze): zarząd i brama
    {
      name: 'wiki-blok-przymorze',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        await otworzArtykul(page, 'uchwala:u_brama', false);
        const t = await tekstOkna(page);
        if (!/zarząd/i.test(t) || !/Brama na kłódkę/.test(t))
          throw new Error('artykuł o uchwale w bloku bez zarządu i bramy');
        await sprawdzUklad(page, 'artykuł o uchwale w bloku');
      },
    },
    // tryb zombie: artykuły o szwendaczach są też w zwykłej grze, ale w zombie czipy siatka i stado otwierają swoje
    {
      name: 'wiki-zombie',
      query: '',
      run: async (page, base) => {
        await start(page, base, 'demo=przymorze&tryb=zombie&speed=0&cam=hq,1.3');
        await page.click('#sFence');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zombie:siatka"]');
        await sprawdzUklad(page, 'artykuł o siatce w trybie zombie');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('modal')!.hidden);
        await page.click('#sHorde');
        await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zombie:stado"]');
        await sprawdzUklad(page, 'artykuł o stadzie w trybie zombie');
      },
    },
    // telefon po angielsku w trybie zombie: artykuł o szwendaczach z uwagą o trybie, potem handlarz z długimi wartościami faktów
    {
      name: 'wiki-zombie-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, 'demo=przymorze&tryb=zombie&speed=0&cam=hq,1.3');
        await otworzZMenu(page, true);
        await otworzArtykul(page, 'zombie:szwendacze', true);
        await sprawdzUklad(page, 'artykuł o szwendaczach na telefonie');
        sprawdzJezyk('artykuł o szwendaczach na telefonie', await tekstOkna(page), { en: true });
        const uwaga = await page.$eval('#sheet .wiki-uwaga', (e) => (e as HTMLElement).innerText);
        if (!/^You are playing Zombie mode/.test(uwaga)) throw new Error(`uwaga o trybie w zombie: ${uwaga}`);
        const fakty = await page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        for (const f of ['zdrowie', 'wzrok-dzien', 'trafienia-dzida'])
          if (!fakty.includes(f)) throw new Error(`brak faktu ${f} w artykule o szwendaczach`);
        await zapisz(page, 'wiki-zombie-telefon-en-szwendacze');
        // artykuł o sile naporu na siatkę i o handlarzu: wąskie okno, długie wartości faktów
        await page.tap('#sheet .wiki-wstecz');
        await otworzArtykul(page, 'zombie:siatka', true);
        await sprawdzUklad(page, 'artykuł o siatce na telefonie');
        await page.tap('#sheet .wiki-wstecz');
        await otworzArtykul(page, 'wydarzenia:handlarz', true);
        await sprawdzUklad(page, 'artykuł o handlarzu na telefonie w trybie zombie');
        sprawdzJezyk('artykuł o handlarzu na telefonie', await tekstOkna(page), { en: true });
        const oferty = await page.$eval(
          '#sheet .wiki-fakt[data-fakt="kupuje-zlom"] dd',
          (e) => (e as HTMLElement).innerText,
        );
        if (!/Give 6 scrap for 3 planks/.test(oferty)) throw new Error(`oferty handlarza: ${oferty}`);
        await zapisz(page, 'wiki-zombie-telefon-en-handlarz');
        // tabela ofert w faktach jest długim wierszem: po przewinięciu do niej też nic nie wystaje
        await page.$eval('#sheet .wiki-fakt[data-fakt="reszta"]', (e) => e.scrollIntoView({ block: 'center' }));
        await sprawdzUklad(page, 'oferty handlarza na telefonie');
        await zapisz(page, 'wiki-zombie-telefon-en-oferty');
      },
    },
    // komputer po polsku: artykuł o rodzaju miejsca z mapy miasta (apteka), potem odnośnik do wypraw i artykuł o odpowiedziach gościa
    {
      name: 'wiki-miejsce-pc',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA);
        await otworzZMenu(page, false);
        await otworzArtykul(page, 'miejsce:apteka', false);
        const fakty = await page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        for (const f of ['ryzyko-bazowe', 'ryzyko-300', 'lup-meds', 'powrot'])
          if (!fakty.includes(f)) throw new Error(`brak faktu ${f} w artykule o aptece`);
        const tytul = await page.$eval('#sheet .wiki-tytul', (e) => (e as HTMLElement).innerText);
        if (tytul !== 'Apteka') throw new Error(`tytuł artykułu o aptece: ${tytul}`);
        await sprawdzUklad(page, 'artykuł o aptece na komputerze');
        sprawdzJezyk('artykuł o aptece na komputerze', await tekstOkna(page), {});
        await zapisz(page, 'wiki-miejsce-pc-apteka');
        await page.click('#sheet .wiki-zobacz .wiki-link[data-arg="miasto:wyprawa"]');
        await page.waitForSelector('#sheet .wiki-art[data-art="miasto:wyprawa"]');
        await sprawdzUklad(page, 'artykuł o wyprawach po odnośniku');
        await otworzArtykul(page, 'wydarzenia:wybory', false);
        const wybory = await page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        if (!wybory.includes('wybor-noc') || !wybory.includes('wybor-dobic'))
          throw new Error(`fakty o odpowiedziach: ${wybory.join(', ')}`);
        await sprawdzUklad(page, 'artykuł o odpowiedziach gościa na komputerze');
        sprawdzJezyk('artykuł o odpowiedziach gościa', await tekstOkna(page), {});
        await zapisz(page, 'wiki-miejsce-pc-wybory');
      },
    },
    // dom (Zielonki): artykuły o gościach, handlarzu, sąsiadach, wyprawach, drogach i trybie zombie bez słów z bloku
    {
      name: 'wiki-dom-wydarzenia',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA_DOM);
        await otworzZMenu(page, false);
        for (const id of [
          'wydarzenia:goscie',
          'wydarzenia:handlarz',
          'wydarzenia:wybory',
          'wydarzenia:werbunek',
          'wydarzenia:znajomi',
          'sasiedzi:noc',
          'miasto:nocna',
          'drogi:ludnosc',
          'zombie:siatka',
        ]) {
          await otworzArtykul(page, id, false);
          sprawdzJezyk(`artykuł ${id} w domu`, await tekstOkna(page), { dom: true });
          await sprawdzUklad(page, `artykuł ${id} w domu`);
        }
        const t = await tekstOkna(page);
        if (!/furtk/i.test(t)) throw new Error('artykuł o siatce w domu nie mówi o furtce');
        await otworzArtykul(page, 'wydarzenia:goscie', false);
        const tytul = await page.$eval('#sheet .wiki-tytul', (e) => (e as HTMLElement).innerText);
        if (tytul !== 'Gość pod furtką') throw new Error(`tytuł artykułu o gościu w domu: ${tytul}`);
        await zapisz(page, 'wiki-dom-wydarzenia-goscie');
      },
    },
    // dom (Zielonki), sąsiedzi stoją w domach: artykuły o drzwiach, pukaniu, wyważaniu, przeszukiwaniu, ludziach za drzwiami i
    // nocnych gościach oraz hałas w trybie zombie mówią o domu: bez drzwi mieszkań, pięter, klatek i lokatorów
    {
      name: 'wiki-dom-sasiedzi',
      query: '',
      run: async (page, base) => {
        await start(page, base, GRA_DOM);
        await otworzZMenu(page, false);
        const fakty = async () =>
          page.$$eval('#sheet .wiki-fakt', (l) => l.map((e) => (e as HTMLElement).dataset.fakt));
        for (const id of [
          'sasiedzi:budynki',
          'sasiedzi:drzwi',
          'sasiedzi:pukanie',
          'sasiedzi:wywazanie',
          'sasiedzi:przeszukiwanie',
          'sasiedzi:lokatorzy',
          'sasiedzi:noc',
          'zombie:halas',
        ]) {
          await otworzArtykul(page, id, false);
          sprawdzJezyk(`artykuł ${id} w domu`, await tekstOkna(page), { dom: true });
          await sprawdzUklad(page, `artykuł ${id} w domu`);
          const f = await fakty();
          for (const zakazany of [
            'czas-mieszkanie',
            'halas-mieszkanie',
            'pietro',
            'pietro-lokatorzy',
            'drzwi-mieszkanie',
          ])
            if (f.includes(zakazany)) throw new Error(`${id} w domu ma fakt ${zakazany}`);
        }
        await otworzArtykul(page, 'sasiedzi:wywazanie', false);
        const wywazanie = await fakty();
        for (const f of ['czas-budynek', 'halas-budynek', 'halas-budynek-lom'])
          if (!wywazanie.includes(f)) throw new Error(`brak faktu ${f} w artykule o wyważaniu w domu`);
        await otworzArtykul(page, 'sasiedzi:lokatorzy', false);
        const tytul = await page.$eval('#sheet .wiki-tytul', (e) => (e as HTMLElement).innerText);
        if (tytul !== 'Sąsiedzi za drzwiami') throw new Error(`tytuł artykułu o ludziach za drzwiami w domu: ${tytul}`);
        await otworzArtykul(page, 'sasiedzi:przeszukiwanie', false);
        const t = await tekstOkna(page);
        if (!/Okraść …/.test(t)) throw new Error('artykuł o przeszukiwaniu w domu nie mówi o poleceniu „Okraść …”');
        await zapisz(page, 'wiki-dom-sasiedzi-przeszukiwanie');
      },
    },
    // to samo po angielsku na telefonie: „houses”, „neighbours”, bez „flat”, „floor”, „stairs” i „residents”
    {
      name: 'wiki-dom-sasiedzi-telefon-en',
      query: '',
      w: 390,
      h: 844,
      lang: 'en',
      run: async (page, base) => {
        await start(page, base, GRA_DOM);
        await otworzZMenu(page, true);
        for (const id of ['sasiedzi:przeszukiwanie', 'sasiedzi:wywazanie', 'sasiedzi:noc']) {
          await otworzArtykul(page, id, true);
          sprawdzJezyk(`artykuł ${id} w domu po angielsku`, await tekstOkna(page), { dom: true, en: true });
          await sprawdzUklad(page, `artykuł ${id} w domu na telefonie`);
          await zapisz(page, `wiki-dom-sasiedzi-telefon-en-${id.split(':')[1]}`);
          await page.tap('#sheet .wiki-wstecz');
        }
      },
    },
  ];
}
