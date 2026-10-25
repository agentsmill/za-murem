/* Zrzuty i sprawdzenia „telefon: mniej przytłaczający interfejs” do `npm run shots` (scenariusze telefon-*); każdy mierzy jedną
   część i pada, gdy jej nie ma:

   - pasek stanu na telefonie (okno węższe niż 768 px) jest domyślnie zwinięty do jednej linii z tym, co pilne (kafelki w stanie
     „uwaga” i „źle”, a gdy nic takiego nie ma: jedzenie, drewno i wkurzenie); stuknięcie w linię rozwija wszystkie kafelki (odstępy
     etykiet jak w `uklad-pasek-telefon-*`), kolejne zwija; wybór pamięta przeglądarka (`za-murem-0.4-pasek`) i przeżywa
     przeładowanie; na komputerze i od 768 px nic się nie zmienia (`telefon-pasek-*`, `telefon-granica-768`);
   - karta osoby na telefonie ma zwinięty blok potrzeb: domyślnie jedna linia z potrzebami w stanie „uwaga” i „źle”, paski i nastroje
     po stuknięciu, wybór pamiętany (`za-murem-0.4-potrzeby`), na komputerze paski jak dawniej (`telefon-karta-*`);
   - mapa zajmuje co najmniej 60% ekranu telefonu w stanie domyślnym świeżej gry (cele zwinięte, pasek zwinięty, karta zamknięta) na
     początku dnia 1 i dnia 2, 390×844 i 360×740, po polsku i po angielsku, w trybie zwykłym i zombie (`telefon-mapa-*`); część ekranu bez
     nakładek liczy się siatką 2×2 px z sumy prostokątów pasek, cele, komunikat o przybyszach, chipy listy ludzi, przyciski
     przybliżenia, atrybucja, karta, panele i pasek stawiania; podpowiedź u dołu (dzień 2: ostrzeżenie o zgasłej kozie) wchodzi do drugiej
     liczby, bo trwa, dopóki gracz nie naprawi kozy;
   - wszystko rozwinięte naraz (pasek, cele, potrzeby na karcie, podpowiedź): nic na nic nie nachodzi, imię na karcie jest widać
     (`telefon-rozwiniete-*`). */

import path from 'node:path';
import type { Page } from '@playwright/test';
import { GRA, kliknij, poHudzie, przewin, start } from './shots-cele.ts';
import {
  klatki,
  nachodzenia,
  pasekTelefonu,
  rozmiar,
  type ShotUklad,
  type Stos,
  sprawdzPasek,
  stos,
} from './shots-uklad.ts';

/** scenariusz w kształcie, który przyjmuje tools/shots.ts */
export type ShotTelefon = ShotUklad;

const KLUCZ_PASEK = 'za-murem-0.4-pasek';
const KLUCZ_POTRZEBY = 'za-murem-0.4-potrzeby';
/** ile procent ekranu ma być mapą w stanie domyślnym */
const MIN_MAPA = 60;
/** najwyżej tyle pikseli ma wysokość zwiniętej linii stanu */
const MAX_LINIA = 26;
const TRIO = ['sFood', 'sWood', 'sAnger'];

/* ---------------------------------------------------------------- pasek stanu */

interface KafelekStanu {
  id: string;
  widac: boolean;
  poziom: 'ok' | 'mid' | 'bad';
}

interface StanPaska {
  zwiniety: boolean;
  rola: string | null;
  ariaExpanded: string | null;
  /** zawartość pseudoelementu ::after pojemnika stanu (strzałka) bez cudzysłowów, „none” gdy go nie ma */
  strzalka: string;
  /** wysokość pojemnika stanu i całego paska */
  statsWysokosc: number;
  pasek: number;
  kafelki: KafelekStanu[];
}

const stanPaska = (page: Page): Promise<StanPaska> =>
  page.evaluate(() => {
    const stats = document.getElementById('stats')!;
    // deski, złom i części są do 640 px jednym kafelkiem (`#sMats`), od 641 px trzema osobnymi: kafelków, których układ nie pokazuje
    // nigdy (nie dlatego, że pasek jest zwinięty), nie liczy się do pilnych
    const ukryte = matchMedia('(max-width: 640px)').matches ? ['sBoards', 'sScrap', 'sParts'] : ['sMats'];
    const kafelki = [...stats.querySelectorAll<HTMLElement>('.stat')]
      .filter((e) => !e.hidden && !ukryte.includes(e.id))
      .map((e) => ({
        id: e.id,
        widac: getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0,
        poziom: (e.classList.contains('bad') ? 'bad' : e.classList.contains('mid') ? 'mid' : 'ok') as
          | 'ok'
          | 'mid'
          | 'bad',
      }));
    return {
      zwiniety: stats.hasAttribute('data-zwiniete'),
      rola: stats.getAttribute('role'),
      ariaExpanded: stats.getAttribute('aria-expanded'),
      strzalka: getComputedStyle(stats, '::after').content.replaceAll('"', ''),
      statsWysokosc: stats.getBoundingClientRect().height,
      pasek: document.getElementById('top')!.getBoundingClientRect().height,
      kafelki,
    };
  });

/** Co ma być widać w zwiniętej linii: kafelki w stanie „uwaga” i „źle”, a bez nich jedzenie, drewno i wkurzenie. */
function oczekiwanePilne(k: KafelekStanu[]): string[] {
  const uwaga = k.filter((x) => x.poziom !== 'ok').map((x) => x.id);
  return uwaga.length ? uwaga : TRIO.filter((id) => k.some((x) => x.id === id));
}

const tyleSamo = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** klucz z pamięci przeglądarki albo null */
const klucz = (page: Page, k: string): Promise<string | null> =>
  page.evaluate((nazwa) => localStorage.getItem(nazwa), k);

async function przeladuj(page: Page, query: string, base: string): Promise<void> {
  await start(page, base, query);
  await poHudzie(page, 3);
}

/** Pasek stanu zwinięty domyślnie, rozwijany i zwijany stuknięciem, z pamięcią wyboru po przeładowaniu. */
const pasekZwiniety = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  zombie: boolean,
  out: string,
): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h}`;
    const q = `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}`;
    await start(page, base, q);
    await poHudzie(page, 3);
    // 1. domyślnie zwinięty: tylko to, co pilne, w jednej niskiej linii ze strzałką
    const dom = await stanPaska(page);
    const widoczne = dom.kafelki.filter((k) => k.widac).map((k) => k.id);
    const oczek = oczekiwanePilne(dom.kafelki);
    const zle: string[] = [];
    if (!dom.zwiniety) zle.push('pasek stanu nie jest zwinięty domyślnie');
    if (widoczne.length >= dom.kafelki.length) zle.push(`widać wszystkie kafelki (${widoczne.length})`);
    if (!tyleSamo(widoczne, oczek)) zle.push(`widać ${widoczne.join(', ')} zamiast pilnych ${oczek.join(', ')}`);
    if (dom.statsWysokosc > MAX_LINIA)
      zle.push(`linia stanu ma ${Math.round(dom.statsWysokosc)} px (najwyżej ${MAX_LINIA})`);
    if (dom.strzalka !== '▾') zle.push(`strzałka „${dom.strzalka}” zamiast „▾”`);
    if (dom.rola !== 'button' || dom.ariaExpanded !== 'false')
      zle.push(`rola ${dom.rola}, aria-expanded ${dom.ariaExpanded}`);
    console.log(
      `  ${opis}, domyślnie: widać ${widoczne.length} z ${dom.kafelki.length} (${widoczne.join(' ')}), linia ${Math.round(dom.statsWysokosc)} px, pasek ${Math.round(dom.pasek)} px${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, domyślnie: ${zle.join('; ')}`);
    // strefa dotyku jest wyższa od widocznej linii (4 px z góry, w przerwie między wierszami paska, i z dołu, w jego dopełnieniu):
    // linia ma kilkanaście pikseli, a palec potrzebuje około trzydziestu; ale nie sięga dalej, więc nie zabiera dotyku przyciskom
    // z wiersza wyżej
    const strefa = await page.evaluate(() => {
      const r = document.getElementById('stats')!.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const trafia = (y: number) => !!document.elementFromPoint(x, y)?.closest('#stats');
      return { nad: trafia(r.top - 3), pod: trafia(r.bottom + 3), dalekoNad: trafia(r.top - 6), wysokosc: r.height };
    });
    console.log(
      `  ${opis}, strefa dotyku: linia ${Math.round(strefa.wysokosc)} px, tuż nad ${strefa.nad}, tuż pod ${strefa.pod}, 6 px nad ${strefa.dalekoNad}`,
    );
    if (!strefa.nad || !strefa.pod || strefa.dalekoNad)
      throw new Error(
        `${opis}: strefa dotyku linii: tuż nad ${strefa.nad} (ma być true), tuż pod ${strefa.pod} (true), 6 px nad ${strefa.dalekoNad} (false)`,
      );
    await page.screenshot({ path: path.join(out, `${name}-zwiniety.png`) });
    // 2. stuknięcie w linię rozwija: wszystkie kafelki, odstępy etykiet jak w uklad-pasek-telefon-*, strzałka w górę
    await kliknij(page, '#stats', true);
    await poHudzie(page);
    const roz = await stanPaska(page);
    const wid2 = roz.kafelki.filter((k) => k.widac).length;
    const zle2: string[] = [];
    if (roz.zwiniety) zle2.push('pasek dalej zwinięty po stuknięciu');
    if (wid2 !== roz.kafelki.length) zle2.push(`widać ${wid2} z ${roz.kafelki.length} kafelków`);
    if (roz.strzalka !== '▴') zle2.push(`strzałka „${roz.strzalka}” zamiast „▴”`);
    if (roz.ariaExpanded !== 'true') zle2.push(`aria-expanded ${roz.ariaExpanded}`);
    if (roz.pasek < dom.pasek + 8)
      zle2.push(
        `pasek rozwinięty ${Math.round(roz.pasek)} px niewiele wyższy od zwiniętego ${Math.round(dom.pasek)} px`,
      );
    if ((await klucz(page, KLUCZ_PASEK)) !== 'rozwiniete')
      zle2.push(`pamięć „${await klucz(page, KLUCZ_PASEK)}” zamiast „rozwiniete”`);
    console.log(
      `  ${opis}, rozwinięty: widać ${wid2}, pasek ${Math.round(roz.pasek)} px${zle2.length ? `, NARUSZENIA: ${zle2.length}` : ''}`,
    );
    if (zle2.length) throw new Error(`${opis}, rozwinięty: ${zle2.join('; ')}`);
    sprawdzPasek(`${opis}, rozwinięty`, await pasekTelefonu(page), { jedenWiersz: true, nazwa: true });
    await page.screenshot({ path: path.join(out, `${name}-rozwiniety.png`) });
    // po stuknięciu fokus nie zostaje na pasku (tak jak na przyciskach paska, src/ui/fokus.ts): spacja zatrzymuje albo rusza grę,
    // a nie zwija pasek
    const fokus = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
    const tempo0 = await page.evaluate(() => window.zm!.speed());
    await page.keyboard.press('Space');
    const tempo1 = await page.evaluate(() => window.zm!.speed());
    const spacja = await stanPaska(page);
    console.log(
      `  ${opis}, po stuknięciu: fokus na ${fokus}, tempo ${tempo0} → ${tempo1} po spacji, pasek zwinięty ${spacja.zwiniety}`,
    );
    if (fokus === 'stats') throw new Error(`${opis}: po stuknięciu fokus został na pasku stanu`);
    if (spacja.zwiniety || tempo1 === tempo0)
      throw new Error(
        `${opis}: spacja po stuknięciu w pasek: zwinięty ${spacja.zwiniety}, tempo ${tempo0} → ${tempo1} (gra ma ruszyć, pasek zostać)`,
      );
    await page.keyboard.press('Space');
    // 3. pamięć: po przeładowaniu zostaje rozwinięty, po zwinięciu i przeładowaniu zwinięty
    await przeladuj(page, q, base);
    const po1 = await stanPaska(page);
    if (po1.zwiniety || po1.kafelki.some((k) => !k.widac))
      throw new Error(`${opis}: po przeładowaniu rozwinięty pasek wrócił do zwiniętego (zwinięty ${po1.zwiniety})`);
    await kliknij(page, '#stats', true);
    await poHudzie(page);
    const zw = await stanPaska(page);
    if (!zw.zwiniety || (await klucz(page, KLUCZ_PASEK)) !== 'zwiniete')
      throw new Error(`${opis}: po zwinięciu zwinięty ${zw.zwiniety}, pamięć „${await klucz(page, KLUCZ_PASEK)}”`);
    await przeladuj(page, q, base);
    const po2 = await stanPaska(page);
    if (!po2.zwiniety) throw new Error(`${opis}: po przeładowaniu zwinięty pasek wrócił do rozwiniętego`);
    // 4. klawiatura: Enter rozwija, Spacja zwija (fokus na pojemniku stanu)
    await page.focus('#stats');
    await page.keyboard.press('Enter');
    await poHudzie(page);
    if ((await stanPaska(page)).zwiniety) throw new Error(`${opis}: Enter nie rozwinął paska`);
    await page.keyboard.press('Space');
    await poHudzie(page);
    if (!(await stanPaska(page)).zwiniety) throw new Error(`${opis}: Spacja nie zwinęła paska`);
  },
});

/** Pasek stanu na komputerze i od 768 px nie zmienia się: wszystkie kafelki, bez strzałki, bez roli przycisku, stuknięcie nic nie zwija. */
const pasekKomputerBezZmian = (name: string, w: number, h: number): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze&${GRA}`);
    await poHudzie(page, 3);
    const opis = `${name} ${w}×${h}`;
    const p = await stanPaska(page);
    const zle: string[] = [];
    if (p.zwiniety) zle.push('pasek zwinięty na szerokim ekranie');
    if (p.kafelki.some((k) => !k.widac))
      zle.push(
        `ukryte kafelki: ${p.kafelki
          .filter((k) => !k.widac)
          .map((k) => k.id)
          .join(', ')}`,
      );
    if (p.strzalka !== 'none' && p.strzalka !== 'normal') zle.push(`strzałka „${p.strzalka}” na szerokim ekranie`);
    if (p.rola !== null || p.ariaExpanded !== null) zle.push(`rola ${p.rola}, aria-expanded ${p.ariaExpanded}`);
    await page.click('#stats .stat:visible >> nth=0');
    await poHudzie(page);
    const po = await stanPaska(page);
    if (po.zwiniety || po.kafelki.some((k) => !k.widac))
      zle.push('kliknięcie w kafelek zwinęło pasek na szerokim ekranie');
    if ((await klucz(page, KLUCZ_PASEK)) !== null) zle.push('kliknięcie zapisało wybór paska na szerokim ekranie');
    console.log(
      `  ${opis}: kafelków ${p.kafelki.length} widać ${p.kafelki.filter((k) => k.widac).length}, pasek ${Math.round(p.pasek)} px${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
  },
});

/** Granica 768 px: przy 767 pasek zwija się do linii, przy 768 jest cały jak na komputerze (zmiana szerokości okna w locie). */
const granica768 = (name: string): ShotTelefon => ({
  name,
  query: '',
  w: 390,
  h: 844,
  touch: true,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze&${GRA}`);
    await poHudzie(page, 3);
    for (const [szer, zwiniety] of [
      [767, true],
      [768, false],
      [700, true],
      [1024, false],
    ] as const) {
      await rozmiar(page, szer, 844);
      const p = await stanPaska(page);
      const wid = p.kafelki.filter((k) => k.widac).length;
      console.log(
        `  ${szer} px: zwinięty ${p.zwiniety}, widać ${wid} z ${p.kafelki.length}, pasek ${Math.round(p.pasek)} px`,
      );
      if (p.zwiniety !== zwiniety || (zwiniety ? wid >= p.kafelki.length : wid !== p.kafelki.length))
        throw new Error(
          `${name}: przy ${szer} px zwinięty ${p.zwiniety} (ma być ${zwiniety}), widać ${wid} z ${p.kafelki.length}`,
        );
    }
  },
});

/* ---------------------------------------------------------------- karta osoby: potrzeby */

interface StanKarty {
  linia: { widac: boolean; tekst: string; poziom: string; aria: string | null } | null;
  paski: number;
  paskiWidac: boolean;
  nastroje: boolean;
  wysokosc: number;
  zwinieta: boolean;
}

const stanKarty = (page: Page): Promise<StanKarty> =>
  page.evaluate(() => {
    const karta = document.getElementById('card')!;
    const widac = (e: Element | null): boolean => {
      if (!(e instanceof HTMLElement)) return false;
      const r = e.getBoundingClientRect();
      return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
    };
    const linia = karta.querySelector<HTMLElement>('.potrzeby-linia');
    const paski = karta.querySelectorAll('.needs .need');
    return {
      linia: linia
        ? {
            widac: widac(linia),
            tekst: (linia.textContent ?? '').trim(),
            poziom: linia.classList.contains('bad') ? 'bad' : linia.classList.contains('mid') ? 'mid' : 'ok',
            aria: linia.getAttribute('aria-expanded'),
          }
        : null,
      paski: paski.length,
      paskiWidac: widac(karta.querySelector('.needs')),
      nastroje: widac(karta.querySelector('.moods')),
      wysokosc: karta.getBoundingClientRect().height,
      zwinieta: karta.classList.contains('potrzeby-zwiniete'),
    };
  });

/** Linia zwijania potrzeb na karcie jest (na telefonie), a jeśli jej nie ma, scenariusz pada od razu zamiast czekać na stuknięcie. */
async function liniaPotrzeb(page: Page, opis: string): Promise<void> {
  if (!(await page.locator('#card .potrzeby-linia').count()))
    throw new Error(`${opis}: karta nie ma linii zwijania potrzeb`);
}

/** Zaznacza pierwszą osobę z zarządu i zaniża jej ciepło (22, źle) i najedzenie (45, uwaga), bez czekania na grę. */
async function osobaZPotrzebami(page: Page, dotyk: boolean): Promise<void> {
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    const p = sim.st.pawns.find((q) => q.kind === 'core')!;
    if (!p.needs) throw new Error('zarząd bez potrzeb');
    p.needs.warm = 22;
    p.needs.food = 45;
  });
  await kliknij(page, '#lista .lp >> nth=0', dotyk);
  await page.waitForSelector('#card:not([hidden])');
  await poHudzie(page, 2);
}

/** Karta osoby na telefonie: potrzeby zwinięte do jednej linii z ostrzeżeniami, paski i nastroje po stuknięciu, pamięć wyboru. */
const kartaPotrzeby = (name: string, w: number, h: number, lang: 'pl' | 'en', out: string): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h}`;
    const q = `demo=przymorze&${GRA}`;
    await start(page, base, q);
    await osobaZPotrzebami(page, true);
    const ciepło = lang === 'pl' ? 'Ciepło' : 'Warmth';
    // 1. domyślnie zwinięte: linia z ostrzeżeniami, bez pasków i nastrojów
    const dom = await stanKarty(page);
    const zle: string[] = [];
    if (!dom.zwinieta) zle.push('karta nie ma zwiniętych potrzeb domyślnie');
    if (dom.paskiWidac) zle.push('paski potrzeb widać domyślnie');
    if (dom.nastroje) zle.push('nastroje widać domyślnie');
    if (!dom.linia?.widac) zle.push('brak linii z potrzebami');
    else {
      if (!dom.linia.tekst.includes(ciepło) || !dom.linia.tekst.includes('22'))
        zle.push(`linia „${dom.linia.tekst}” bez „${ciepło} 22”`);
      if (dom.linia.poziom !== 'bad') zle.push(`linia ma poziom ${dom.linia.poziom} zamiast bad`);
      if (dom.linia.aria !== 'false') zle.push(`aria-expanded ${dom.linia.aria}`);
    }
    console.log(
      `  ${opis}, domyślnie: karta ${Math.round(dom.wysokosc)} px, linia „${dom.linia?.tekst ?? '-'}”, paski ${dom.paskiWidac ? 'widać' : 'schowane'}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, domyślnie: ${zle.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-zwinieta.png`) });
    // 2. stuknięcie w linię: sześć pasków, karta wyższa o co najmniej 40 px, pamięć „rozwiniete”
    await liniaPotrzeb(page, opis);
    await kliknij(page, '#card .potrzeby-linia', true);
    await poHudzie(page);
    const roz = await stanKarty(page);
    const zle2: string[] = [];
    if (roz.zwinieta || !roz.paskiWidac || roz.paski !== 6)
      zle2.push(`paski: zwinięta ${roz.zwinieta}, widać ${roz.paskiWidac}, jest ${roz.paski}`);
    if (roz.wysokosc < dom.wysokosc + 40)
      zle2.push(`karta rozwinięta ${Math.round(roz.wysokosc)} px, zwinięta ${Math.round(dom.wysokosc)} px`);
    if (roz.linia?.aria !== 'true') zle2.push(`aria-expanded ${roz.linia?.aria}`);
    if ((await klucz(page, KLUCZ_POTRZEBY)) !== 'rozwiniete')
      zle2.push(`pamięć „${await klucz(page, KLUCZ_POTRZEBY)}”`);
    console.log(
      `  ${opis}, rozwinięta: karta ${Math.round(roz.wysokosc)} px, pasków ${roz.paski}${zle2.length ? `, NARUSZENIA: ${zle2.length}` : ''}`,
    );
    if (zle2.length) throw new Error(`${opis}, rozwinięta: ${zle2.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-rozwinieta.png`) });
    // 3. pamięć po przeładowaniu: rozwinięta zostaje rozwinięta, zwinięta zwinięta
    await przeladuj(page, q, base);
    await osobaZPotrzebami(page, true);
    const po1 = await stanKarty(page);
    if (po1.zwinieta || !po1.paskiWidac)
      throw new Error(`${opis}: po przeładowaniu rozwinięta karta wróciła do zwiniętej`);
    await liniaPotrzeb(page, opis);
    await kliknij(page, '#card .potrzeby-linia', true);
    await poHudzie(page);
    if (!(await stanKarty(page)).zwinieta || (await klucz(page, KLUCZ_POTRZEBY)) !== 'zwiniete')
      throw new Error(
        `${opis}: po zwinięciu karta nie jest zwinięta albo pamięć „${await klucz(page, KLUCZ_POTRZEBY)}”`,
      );
    await przeladuj(page, q, base);
    await osobaZPotrzebami(page, true);
    if (!(await stanKarty(page)).zwinieta)
      throw new Error(`${opis}: po przeładowaniu zwinięta karta wróciła do rozwiniętej`);
  },
});

/** Karta osoby na komputerze zostaje jak była: paski potrzeb widać, linii zwijania nie ma. */
const kartaKomputerBezZmian = (name: string, w: number, h: number): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze&${GRA}`);
    await osobaZPotrzebami(page, false);
    const k = await stanKarty(page);
    const zle: string[] = [];
    if (!k.paskiWidac || k.paski !== 6) zle.push(`paski widać ${k.paskiWidac}, jest ${k.paski}`);
    if (k.linia?.widac) zle.push('linia zwijania potrzeb widoczna na szerokim ekranie');
    console.log(
      `  ${name} ${w}×${h}: paski ${k.paski}, karta ${Math.round(k.wysokosc)} px${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${name}: ${zle.join('; ')}`);
  },
});

/* ---------------------------------------------------------------- ile ekranu zajmuje mapa */

interface UdzialMapy {
  /** procent ekranu bez nakładek, bez i z podpowiedzią u dołu */
  mapa: number;
  mapaZPodpowiedzia: number;
  /** udział każdej nakładki w procentach ekranu (suma prostokątów) */
  udzialy: Record<string, number>;
  podpowiedz: string;
}

const udzialMapy = (page: Page): Promise<UdzialMapy> =>
  page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const widoczny = (e: Element | null): e is HTMLElement => {
      if (!(e instanceof HTMLElement) || e.hidden) return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const nakladki: [string, Element[]][] = [
      ['pasek', [document.getElementById('top')!]],
      ['cele', [document.getElementById('goals')!]],
      ['komunikat', [document.getElementById('arrive')!]],
      ['lista', [...document.querySelectorAll('#lista .lp')]],
      ['przyciski', [...document.querySelectorAll('.mapctl button')]],
      ['atrybucja', [document.querySelector('.attrib')!]],
      ['minimapa', [document.getElementById('minimapa')!]],
      ['karta', [document.getElementById('card')!]],
      ['panele', [document.getElementById('buildPanel')!, document.getElementById('pracaPanel')!]],
      ['pasek stawiania', [document.getElementById('placeBar')!]],
    ];
    const hint = document.getElementById('hint')!;
    const KROK = 2;
    const cw = Math.ceil(W / KROK);
    const ch = Math.ceil(H / KROK);
    const bez = new Uint8Array(cw * ch);
    const z = new Uint8Array(cw * ch);
    const wypelnij = (siatka: Uint8Array, r: DOMRect) => {
      const x0 = Math.max(0, r.left);
      const y0 = Math.max(0, r.top);
      const x1 = Math.min(W, r.right);
      const y1 = Math.min(H, r.bottom);
      if (x1 <= x0 || y1 <= y0) return 0;
      for (let y = Math.floor(y0 / KROK); y < Math.ceil(y1 / KROK); y++)
        for (let x = Math.floor(x0 / KROK); x < Math.ceil(x1 / KROK); x++) siatka[y * cw + x] = 1;
      return (x1 - x0) * (y1 - y0);
    };
    const udzialy: Record<string, number> = {};
    for (const [nazwa, lista] of nakladki) {
      let suma = 0;
      for (const e of lista) {
        if (!widoczny(e)) continue;
        const r = e.getBoundingClientRect();
        suma += wypelnij(bez, r);
        wypelnij(z, r);
      }
      udzialy[nazwa] = Math.round((suma / (W * H)) * 1000) / 10;
    }
    for (let i = 0; i < z.length; i++) z[i] = z[i] || bez[i];
    let podp = 0;
    if (widoczny(hint)) {
      podp = wypelnij(z, hint.getBoundingClientRect());
      udzialy.podpowiedź = Math.round((podp / (W * H)) * 1000) / 10;
    }
    const proc = (s: Uint8Array) => {
      let n = 0;
      for (const c of s) n += c;
      return Math.round((1 - n / s.length) * 1000) / 10;
    };
    return { mapa: proc(bez), mapaZPodpowiedzia: proc(z), udzialy, podpowiedz: hint.textContent ?? '' };
  });

/** odpowiada na okna zarządu (pierwszym wyborem), aż żadne nie zostanie; raport poranny też zamyka */
async function zamknijOknaZarzadu(page: Page): Promise<void> {
  for (let k = 0; k < 10; k++) {
    const okno = await page.evaluate(() => {
      const m = document.getElementById('modal');
      return !m || m.hidden
        ? null
        : [...m.querySelectorAll('[data-act]')].map((e) => (e as HTMLElement).dataset.act ?? '').join(',');
    });
    if (!okno) return;
    if (okno.includes('report-ok')) await page.tap('#sheet [data-act="report-ok"]');
    else if (okno.includes('law-skip')) await page.tap('#sheet [data-act="law-skip"]');
    else if (okno.includes('night-go')) await page.tap('#sheet [data-act="night-go"]');
    else await page.tap('#sheet .choices [data-act="event"]:not([disabled]) >> nth=0');
  }
  throw new Error('okna zarządu nie kończą się po 10 odpowiedziach');
}

/** Pierwszy dzień i pierwsza noc samą grą (ścięcie suchego drzewa, odpowiedzi na okna), aż okienko pokaże „Drugi dzień”. */
async function doDrugiegoDnia(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sim = window.zm!.sim!;
    const kto = sim.st.pawns.find((p) => p.kind === 'core')!;
    sim.push({ t: 'select', ids: [kto.id] });
    sim.push({ t: 'chop', ids: [kto.id], tree: sim.w.dryTree });
  });
  const o = await przewin(page, () => false, { dotyk: true, stop: ['raport'] });
  if (o !== 'raport') throw new Error(`pierwszej nocy bez raportu (${o})`);
  await page.tap('#sheet [data-act="report-ok"]');
  await zamknijOknaZarzadu(page);
  await page.waitForFunction(
    () => /Drugi dzień|Day two/.test(document.querySelector('#goals .goals-head span')?.textContent ?? ''),
    null,
    { timeout: 8000 },
  );
  // nic nie jest zaznaczone: po nocy zostaje zaznaczony ten, kogo wysłano do drzewa
  await page.keyboard.press('Escape');
  await poHudzie(page, 2);
}

/** Mapa zajmuje co najmniej `MIN_MAPA` procent ekranu telefonu w stanie domyślnym świeżej gry, dzień 1 i dzień 2. */
const mapaTelefon = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  zombie: boolean,
  out: string,
): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h}`;
    await start(page, base, `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}`);
    // podpowiedź startowa wisi 9 s: mapa dnia 1 liczy się po niej (z nią w drugiej liczbie), jak u gracza, który ją przeczytał
    const zPodp1 = await udzialMapy(page);
    await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, { timeout: 15_000 });
    await poHudzie(page, 2);
    const pomiary: { dzien: number; u: UdzialMapy; z1?: number }[] = [
      { dzien: 1, u: await udzialMapy(page), z1: zPodp1.mapaZPodpowiedzia },
    ];
    await page.screenshot({ path: path.join(out, `${name}-dzien1.png`) });
    await doDrugiegoDnia(page);
    pomiary.push({ dzien: 2, u: await udzialMapy(page) });
    await page.screenshot({ path: path.join(out, `${name}-dzien2.png`) });
    const zle: string[] = [];
    for (const p of pomiary) {
      const udz = Object.entries(p.u.udzialy)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      console.log(
        `  ${opis}, dzień ${p.dzien}: mapa ${p.u.mapa}% (z podpowiedzią u dołu ${p.u.mapaZPodpowiedzia}%${p.z1 !== undefined ? `, z podpowiedzią startową ${p.z1}%` : ''}) [${udz}]`,
      );
      if (p.u.mapa < MIN_MAPA) zle.push(`dzień ${p.dzien}: mapa ${p.u.mapa}% (najmniej ${MIN_MAPA}%)`);
    }
    if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
  },
});

/* ---------------------------------------------------------------- wszystko rozwinięte naraz */

/** Pasek, cele, potrzeby na karcie i podpowiedź rozwinięte naraz: nic na nic nie nachodzi, imię i rodzina na karcie są na wierzchu. */
const rozwiniete = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  zombie: boolean,
  out: string,
): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h}`;
    await start(page, base, `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}`);
    await page.evaluate(() => window.zm!.rozdzial('r1'));
    await poHudzie(page, 2);
    await kliknij(page, '#goals .goals-head >> nth=0', true);
    await poHudzie(page);
    await osobaZPotrzebami(page, true);
    const sprawdz = async (stan: string): Promise<Stos> => {
      await poHudzie(page, 2);
      const s = await stos(page);
      const zle = nachodzenia(s, { szufladaNaCelach: true });
      // żadna nakładka pod paskiem nie wchodzi na niego, także gdy pasek jest rozwinięty (wtedy wyższy o dwa piętra kafelków)
      const pasek = await page.evaluate(() => document.getElementById('top')!.getBoundingClientRect().bottom);
      for (const [nazwa, r] of [
        ['okienko celów', s.cele],
        ['lista ludzi', s.lista],
        ['karta osoby', s.karta],
      ] as const)
        if (r && r.t < pasek - 0.5) zle.push(`${nazwa} nachodzi na pasek (${Math.round(pasek - r.t)} px)`);
      if (s.nazwaKarty === false) zle.push('imię na karcie osoby jest przykryte');
      if (s.rodzinaKarty === false) zle.push('linia rodziny na karcie osoby jest przykryta');
      const cele = s.cele ? `${Math.round(s.cele.t)}–${Math.round(s.cele.b)}` : '-';
      const karta = s.karta ? `${Math.round(s.karta.t)}–${Math.round(s.karta.b)}` : '-';
      console.log(
        `  ${opis}, ${stan}: pasek do ${Math.round(pasek)}, cele ${cele}, karta ${karta}, podpowiedź ${s.tekstPodpowiedzi ? 'jest' : 'brak'}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
      );
      if (zle.length) throw new Error(`${opis}, ${stan}: ${zle.join('; ')}`);
      return s;
    };
    await sprawdz('cele rozwinięte, potrzeby zwinięte');
    // pasek rozwinięty
    await kliknij(page, '#stats', true);
    await sprawdz('pasek rozwinięty');
    // potrzeby rozwinięte
    await liniaPotrzeb(page, opis);
    await kliknij(page, '#card .potrzeby-linia', true);
    await sprawdz('pasek i potrzeby rozwinięte');
    await page.screenshot({ path: path.join(out, `${name}-wszystko.png`) });
    // do tego podpowiedź (alarm)
    await kliknij(page, '#btnAlarm', true);
    await page.waitForFunction(() => document.getElementById('hint')!.textContent !== '', null, { timeout: 3000 });
    await sprawdz('wszystko rozwinięte i podpowiedź');
    await klatki(page, 2);
  },
});

/* ---------------------------------------------------------------- lista scenariuszy */

export function telefonShots(out: string): ShotTelefon[] {
  return [
    pasekZwiniety('telefon-pasek-zwiniety-pl-zwykly', 390, 844, 'pl', false, out),
    pasekZwiniety('telefon-pasek-zwiniety-en-zombie', 390, 844, 'en', true, out),
    pasekZwiniety('telefon-pasek-zwiniety-pl-zombie-360', 360, 740, 'pl', true, out),
    pasekZwiniety('telefon-pasek-zwiniety-en-zwykly-360', 360, 740, 'en', false, out),
    pasekKomputerBezZmian('telefon-pasek-komputer', 1440, 900),
    pasekKomputerBezZmian('telefon-pasek-tablet', 1024, 768),
    granica768('telefon-granica-768'),
    kartaPotrzeby('telefon-karta-potrzeby-pl', 390, 844, 'pl', out),
    kartaPotrzeby('telefon-karta-potrzeby-en-360', 360, 740, 'en', out),
    kartaKomputerBezZmian('telefon-karta-komputer', 1440, 900),
    mapaTelefon('telefon-mapa-pl-zwykly', 390, 844, 'pl', false, out),
    mapaTelefon('telefon-mapa-en-zombie', 390, 844, 'en', true, out),
    mapaTelefon('telefon-mapa-pl-zwykly-360', 360, 740, 'pl', false, out),
    mapaTelefon('telefon-mapa-en-zombie-360', 360, 740, 'en', true, out),
    rozwiniete('telefon-rozwiniete-pl', 390, 844, 'pl', false, out),
    rozwiniete('telefon-rozwiniete-en-zombie-360', 360, 740, 'en', true, out),
  ];
}
