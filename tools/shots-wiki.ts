/* Zrzuty i sprawdzenia wiki w grze (src/ui/wiki.ts, wiki-okno.ts) do `npm run shots` (scenariusze wiki-*): lista i artykuł
   o budowli na komputerze 1440×900 po polsku i na telefonie 390×844 po angielsku, wąski telefon 360 px, otwarcie z czipa
   paska (drewno) z pauzą gry i wznowieniem po Esc, czip „d·z·cz” na telefonie, wyszukiwanie, artykuły o zarządzie w domu (Zielonki: komitet i furtka zamiast zarządu i bramy) oraz w bloku.

   Każdy scenariusz sam sprawdza układ okna (`sprawdzUklad`): okno mieści się w widoku, strona i panele nie przewijają się w
   bok, żaden wiersz faktów ani tytuł nie wystaje, okno nie nachodzi na atrybucję map, a ta jest widoczna (leży nad zasłoną
   okna i ma napis). Teksty w domu sprawdza po słowach z bloku (jak BLOKOWE_UI w tools/shots.ts), a po angielsku po polskich
   literach; nazwy własne badań z tabel (np. „Kozy w mieszkaniach”) są dozwolone. */

import path from 'node:path';
import type { Page } from '@playwright/test';
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

/** słowa z bloku, których w domu nie ma w artykułach wiki (po polsku) */
const BLOKOWE_PL = /klatk|piętr|spółdziel|pawilon|szlaban|świetlic|czynsz|blok|mieszkani|trzepak|bram/i;
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
  for (const n of NAZWY_WLASNE) t = t.replaceAll(n, ' ');
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
  ];
}
