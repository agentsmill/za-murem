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
/** podpis (`aria-label`) przycisku zwijania paska, gdy pasek jest zwinięty i rozwinięty (src/main.ts, `zastosujPasekStanu`) */
const PODPIS_ZWINIETY = { pl: 'Pokaż cały stan osiedla', en: 'Show the whole estate status' } as const;
const PODPIS_ROZWINIETY = {
  pl: 'Zwiń stan osiedla do tego, co pilne',
  en: 'Collapse the estate status to what is urgent',
} as const;

/* ---------------------------------------------------------------- pasek stanu */

interface KafelekStanu {
  id: string;
  widac: boolean;
  poziom: 'ok' | 'mid' | 'bad';
}

interface StanPaska {
  zwiniety: boolean;
  /** rola pojemnika stanu: brak (pasek zwija osobny przycisk `#statsToggle`, więc kafelki zostają dla czytników ekranu) */
  rola: string | null;
  /** `aria-expanded` przycisku zwijania */
  ariaExpanded: string | null;
  /** przycisk zwijania widać (na komputerze jest schowany) i jego podpis (`aria-label`) */
  przyciskWidac: boolean;
  podpis: string;
  /** strzałka na przycisku („▾” w zwiniętej linii, „▴” w rozwiniętym pasku), „none”, gdy przycisku nie widać */
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
    const przycisk = document.getElementById('statsToggle')!;
    const widac = getComputedStyle(przycisk).display !== 'none' && przycisk.getBoundingClientRect().width > 0;
    return {
      zwiniety: stats.hasAttribute('data-zwiniete'),
      rola: stats.getAttribute('role'),
      ariaExpanded: przycisk.getAttribute('aria-expanded'),
      przyciskWidac: widac,
      podpis: przycisk.getAttribute('aria-label') ?? '',
      strzalka: widac ? (przycisk.textContent ?? '').trim() : 'none',
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

/** środek elementu w pikselach ekranu */
const srodek = (page: Page, sel: string): Promise<[number, number]> =>
  page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2] as [number, number];
  });

/** stuknięcie palcem albo kliknięcie myszą w punkt ekranu, tak jak robi to gracz (a nie w element: kafelki zwiniętego paska nie
    biorą dotyku, więc `page.tap('#sWood')` czekałby na nie bez końca, a gracz po prostu trafia w pasek pod nimi) */
const wPunkt = (page: Page, dotyk: boolean, [x, y]: [number, number]): Promise<void> =>
  dotyk ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);

/** pas ▴ na dole rozwiniętego paska stanu (część paska, która go zwija, a nie kafelek, który otwiera wiki) */
const pasStrzalki = (page: Page): Promise<[number, number]> =>
  page.$eval('#stats', (e) => {
    const r = e.getBoundingClientRect();
    return [r.left + r.width / 2, r.bottom - 6] as [number, number];
  });

const oknoOtwarte = (page: Page): Promise<boolean> => page.evaluate(() => !document.getElementById('modal')!.hidden);

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
    if (!dom.przyciskWidac || dom.ariaExpanded !== 'false')
      zle.push(`przycisk zwijania widać ${dom.przyciskWidac}, aria-expanded ${dom.ariaExpanded}`);
    if (dom.rola !== null) zle.push(`pojemnik stanu ma rolę „${dom.rola}” (zwija go osobny przycisk)`);
    if (dom.podpis !== PODPIS_ZWINIETY[lang])
      zle.push(`podpis przycisku „${dom.podpis}” zamiast „${PODPIS_ZWINIETY[lang]}”`);
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
    // kafelki zwiniętej linii nie biorą dotyku (stuknięcie w nie rozwija pasek, a nie otwiera wiki): pod palcem jest pojemnik;
    // z klawiatury kafelek zwiniętej linii pod Enterem też tylko rozwija pasek (scenariusz telefon-wiki-pasek-*)
    const zwiniety = await page.evaluate(() => {
      const st = document.getElementById('stats')!;
      const k = [...st.querySelectorAll<HTMLElement>('.stat')].find((e) => getComputedStyle(e).display !== 'none')!;
      const r = k.getBoundingClientRect();
      return {
        kafelek: k.id,
        podPalcem: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === st,
      };
    });
    if (!zwiniety.podPalcem)
      throw new Error(`${opis}: kafelek ${zwiniety.kafelek} zwiniętej linii bierze dotyk (pod palcem nie pojemnik)`);
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
    if (roz.podpis !== PODPIS_ROZWINIETY[lang])
      zle2.push(`podpis przycisku „${roz.podpis}” zamiast „${PODPIS_ROZWINIETY[lang]}”`);
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
    // w rozwiniętym pasku dotyk w kafelek trafia w kafelek (otwiera wiki), a w pas ▴ w pasek (zwija go)
    const rozwiniety = await page.evaluate(() => {
      const st = document.getElementById('stats')!;
      const k = document.getElementById('sWood')!.getBoundingClientRect();
      const r = st.getBoundingClientRect();
      return {
        kafelek: document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2)?.closest('.stat')?.id ?? null,
        pas: document.elementFromPoint(r.left + r.width / 2, r.bottom - 6)?.closest('#statsToggle') !== null,
        wysokoscPasa: document.getElementById('statsToggle')!.getBoundingClientRect().height,
      };
    });
    console.log(
      `  ${opis}, rozwinięty: pod palcem w kafelku ${rozwiniety.kafelek}, w pasie ▴ ${rozwiniety.pas ? 'przycisk zwijania' : 'coś innego'}, pas ${rozwiniety.wysokoscPasa} px`,
    );
    if (rozwiniety.kafelek !== 'sWood' || !rozwiniety.pas)
      throw new Error(
        `${opis}: rozwinięty pasek: w kafelku trafia ${rozwiniety.kafelek} (ma być sWood), pas ▴ należy do przycisku zwijania ${rozwiniety.pas}`,
      );
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
    if (fokus.startsWith('stats')) throw new Error(`${opis}: po stuknięciu fokus został na pasku stanu (${fokus})`);
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
    // zwija pas ▴ (środek paska zajmują kafelki, które otwierają artykuły wiki)
    await wPunkt(page, true, await pasStrzalki(page));
    await poHudzie(page);
    if (await oknoOtwarte(page)) throw new Error(`${opis}: stuknięcie w pas ▴ otworzyło okno`);
    // przycisk zwijania oddaje fokus po stuknięciu jak reszta przycisków paska (src/ui/fokus.ts): spacja dalej steruje grą
    const fokusPrzycisku = await page.evaluate(() => document.activeElement?.id ?? '');
    if (fokusPrzycisku === 'statsToggle') throw new Error(`${opis}: po stuknięciu fokus został na przycisku zwijania`);
    const zw = await stanPaska(page);
    if (!zw.zwiniety || (await klucz(page, KLUCZ_PASEK)) !== 'zwiniete')
      throw new Error(`${opis}: po zwinięciu zwinięty ${zw.zwiniety}, pamięć „${await klucz(page, KLUCZ_PASEK)}”`);
    await przeladuj(page, q, base);
    const po2 = await stanPaska(page);
    if (!po2.zwiniety) throw new Error(`${opis}: po przeładowaniu zwinięty pasek wrócił do rozwiniętego`);
    // 4. klawiatura: przycisk zwijania dostaje fokus z Tab, Enter rozwija, Spacja zwija (a nie pauzuje gry)
    await page.focus('#statsToggle');
    await page.keyboard.press('Enter');
    await poHudzie(page);
    if ((await stanPaska(page)).zwiniety) throw new Error(`${opis}: Enter na przycisku nie rozwinął paska`);
    await page.keyboard.press('Space');
    await poHudzie(page);
    if (!(await stanPaska(page)).zwiniety) throw new Error(`${opis}: Spacja na przycisku nie zwinęła paska`);
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
    if (p.przyciskWidac || p.strzalka !== 'none')
      zle.push(`przycisk zwijania widać na szerokim ekranie („${p.strzalka}”)`);
    if (p.rola !== null) zle.push(`rola ${p.rola}`);
    // kafelek otwiera swój artykuł w wiki (src/ui/wiki-okno.ts), ale pasek zostaje cały i nic się nie zapisuje
    await page.click('#stats .stat:visible >> nth=0');
    await poHudzie(page);
    if (!(await oknoOtwarte(page))) zle.push('kafelek na szerokim ekranie nie otworzył artykułu w wiki');
    await page.keyboard.press('Escape');
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

/** Granice telefonu: okno węższe niż 768 px albo niższe niż 501 px zwija pasek do linii (767 i 500 tak, 768 i 501 nie), reszta jest
    cała jak na komputerze; zmiana wymiarów okna w locie (obrót telefonu: 390×844 i 844×390). */
const granica768 = (name: string): ShotTelefon => ({
  name,
  query: '',
  w: 390,
  h: 844,
  touch: true,
  run: async (page, base) => {
    await start(page, base, `demo=przymorze&${GRA}`);
    await poHudzie(page, 3);
    for (const [szer, wys, zwiniety] of [
      [767, 844, true],
      [768, 844, false],
      [700, 844, true],
      [1024, 844, false],
      [1024, 500, true],
      [1024, 501, false],
      [844, 390, true],
      [932, 430, true],
      [1440, 900, false],
      [390, 844, true],
    ] as const) {
      await rozmiar(page, szer, wys);
      const p = await stanPaska(page);
      const wid = p.kafelki.filter((k) => k.widac).length;
      console.log(
        `  ${szer}×${wys}: zwinięty ${p.zwiniety}, widać ${wid} z ${p.kafelki.length}, pasek ${Math.round(p.pasek)} px, przycisk zwijania ${p.przyciskWidac ? p.strzalka : 'schowany'}`,
      );
      if (p.zwiniety !== zwiniety || (zwiniety ? wid >= p.kafelki.length : wid !== p.kafelki.length))
        throw new Error(
          `${name}: przy ${szer}×${wys} zwinięty ${p.zwiniety} (ma być ${zwiniety}), widać ${wid} z ${p.kafelki.length}`,
        );
      if (p.przyciskWidac !== zwiniety)
        throw new Error(`${name}: przy ${szer}×${wys} przycisk zwijania widać ${p.przyciskWidac} (ma być ${zwiniety})`);
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

interface StanWiecej {
  /** przycisk „Więcej” w rogu karty: null, gdy karta go nie ma */
  przycisk: { widac: boolean; aria: string | null; tekst: string } | null;
  nazwa: boolean;
  /** bieżące zajęcie osoby („Stoi i czeka na polecenie.”) */
  doing: boolean;
  liniaPotrzeb: boolean;
  rodzina: boolean;
  historia: boolean;
  imie: boolean;
  /** napis, że mieszkańcy są wymyśleni (spec mieszkańców z adresu, §10: ma być widać na zrzucie) */
  fikcja: boolean;
  wysokosc: number;
  zwinieta: boolean;
}

const stanWiecej = (page: Page): Promise<StanWiecej> =>
  page.evaluate(() => {
    const karta = document.getElementById('card')!;
    const widac = (e: Element | null): boolean => {
      if (!(e instanceof HTMLElement)) return false;
      const r = e.getBoundingClientRect();
      return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
    };
    const przycisk = karta.querySelector<HTMLElement>('.wiecej');
    return {
      przycisk: przycisk
        ? {
            widac: widac(przycisk),
            aria: przycisk.getAttribute('aria-expanded'),
            tekst: (przycisk.textContent ?? '').trim(),
          }
        : null,
      nazwa: widac(karta.querySelector('h2')),
      doing: widac(karta.querySelector('.doing')),
      liniaPotrzeb: widac(karta.querySelector('.potrzeby-linia')),
      rodzina: widac(karta.querySelector('.rodzina')),
      historia: widac(karta.querySelector('.story')),
      imie: widac(karta.querySelector('[data-card="imie"]')),
      fikcja: widac(karta.querySelector('.fikcja')),
      wysokosc: karta.getBoundingClientRect().height,
      zwinieta: karta.classList.contains('wiecej-zwiniete'),
    };
  });

const KLUCZ_WIECEJ = 'za-murem-0.4-wiecej';
/** o tyle (w procentach wysokości ekranu) karta osoby w stanie domyślnym na telefonie pionowo może być wyższa od ćwiartki */
const KARTA_PROC_POLSKI_390 = 25;

/** Karta osoby na telefonie: rodzina, historia i przycisk zmiany imienia za „Więcej” (domyślnie zwiniętym), na widoku imię, linia
    potrzeb, bieżące zajęcie i napis o wymyślonych mieszkańcach; stuknięcie w „Więcej” pokazuje resztę, wybór pamięta przeglądarka. */
const kartaWiecej = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  zombie: boolean,
  maxProc: number,
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
    const tekst = lang === 'pl' ? 'Więcej' : 'More';
    await start(page, base, q);
    await osobaZPotrzebami(page, true);
    // 1. domyślnie: przycisk jest, rodzina, historia i zmiana imienia schowane, reszta na widoku, karta niska
    const dom = await stanWiecej(page);
    const zle: string[] = [];
    if (!dom.przycisk?.widac || dom.przycisk.aria !== 'false' || dom.przycisk.tekst !== tekst)
      zle.push(`przycisk „Więcej”: ${JSON.stringify(dom.przycisk)}`);
    if (!dom.zwinieta) zle.push('karta nie jest domyślnie ze zwiniętym „Więcej”');
    if (dom.rodzina || dom.historia || dom.imie)
      zle.push(`widać rodzinę (${dom.rodzina}), historię (${dom.historia}) albo zmianę imienia (${dom.imie})`);
    if (!dom.nazwa || !dom.liniaPotrzeb || !dom.doing)
      zle.push(
        `brak imienia (${dom.nazwa}), linii potrzeb (${dom.liniaPotrzeb}) albo bieżącego zajęcia (${dom.doing})`,
      );
    if (!dom.fikcja) zle.push('napis o wymyślonych mieszkańcach nie jest widać (spec §10: ma być na zrzucie)');
    const proc = Math.round((dom.wysokosc / h) * 1000) / 10;
    if (proc > maxProc)
      zle.push(`karta ${Math.round(dom.wysokosc)} px to ${proc}% wysokości ekranu (najwyżej ${maxProc}%)`);
    console.log(
      `  ${opis}, domyślnie: karta ${Math.round(dom.wysokosc)} px (${proc}% ekranu), „Więcej” ${dom.przycisk?.aria}, rodzina ${dom.rodzina}, historia ${dom.historia}, imię ${dom.imie}, napis ${dom.fikcja}${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (zle.length) throw new Error(`${opis}, domyślnie: ${zle.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-zwinieta.png`) });
    // 2. stuknięcie rozwija: rodzina, historia i zmiana imienia na widoku, karta wyższa, wybór w pamięci
    await kliknij(page, '#card .wiecej', true);
    await poHudzie(page);
    const roz = await stanWiecej(page);
    const zle2: string[] = [];
    if (roz.zwinieta || roz.przycisk?.aria !== 'true') zle2.push(`karta dalej zwinięta (aria ${roz.przycisk?.aria})`);
    if (!roz.rodzina || !roz.historia || !roz.imie || !roz.fikcja)
      zle2.push(
        `brak rodziny (${roz.rodzina}), historii (${roz.historia}), zmiany imienia (${roz.imie}) albo napisu (${roz.fikcja})`,
      );
    if (roz.wysokosc < dom.wysokosc + 40)
      zle2.push(
        `karta rozwinięta ${Math.round(roz.wysokosc)} px niewiele wyższa od zwiniętej ${Math.round(dom.wysokosc)} px`,
      );
    if ((await klucz(page, KLUCZ_WIECEJ)) !== 'rozwiniete')
      zle2.push(`pamięć „${await klucz(page, KLUCZ_WIECEJ)}” zamiast „rozwiniete”`);
    console.log(
      `  ${opis}, rozwinięte: karta ${Math.round(roz.wysokosc)} px${zle2.length ? `, NARUSZENIA: ${zle2.length}` : ''}`,
    );
    if (zle2.length) throw new Error(`${opis}, rozwinięte: ${zle2.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-wiecej.png`) });
    // 3. pamięć: po przeładowaniu zostaje rozwinięte, po zwinięciu i przeładowaniu zwinięte
    await przeladuj(page, q, base);
    await osobaZPotrzebami(page, true);
    const po1 = await stanWiecej(page);
    if (po1.zwinieta || !po1.rodzina)
      throw new Error(`${opis}: po przeładowaniu rozwinięte „Więcej” wróciło do zwiniętego`);
    await kliknij(page, '#card .wiecej', true);
    await poHudzie(page);
    if (!(await stanWiecej(page)).zwinieta || (await klucz(page, KLUCZ_WIECEJ)) !== 'zwiniete')
      throw new Error(`${opis}: stuknięcie nie zwinęło „Więcej” (pamięć „${await klucz(page, KLUCZ_WIECEJ)}”)`);
    await przeladuj(page, q, base);
    await osobaZPotrzebami(page, true);
    if (!(await stanWiecej(page)).zwinieta)
      throw new Error(`${opis}: po przeładowaniu zwinięte „Więcej” wróciło do rozwiniętego`);
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
    const wiecej = await stanWiecej(page);
    if (wiecej.przycisk?.widac) zle.push('przycisk „Więcej” widoczny na szerokim ekranie');
    if (!wiecej.rodzina || !wiecej.historia || !wiecej.fikcja || !wiecej.imie)
      zle.push(
        `na szerokim ekranie brak rodziny (${wiecej.rodzina}), historii (${wiecej.historia}), napisu (${wiecej.fikcja}) albo zmiany imienia (${wiecej.imie})`,
      );
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
    // ostrzeżenie o zgasłej kozie wisi na telefonie chwilę (9 s od początku problemu), nie stale: zostaje po nim czerwona linia stanu
    const dzien2 = await udzialMapy(page);
    await page.screenshot({ path: path.join(out, `${name}-dzien2-z-ostrzezeniem.png`) });
    await page
      .waitForFunction(() => document.getElementById('hint')!.textContent === '', null, { timeout: 15_000 })
      .catch(() => {
        throw new Error(`${opis}: ostrzeżenie o zgasłej kozie wisi dłużej niż 15 s („${dzien2.podpowiedz}”)`);
      });
    await poHudzie(page, 3);
    const pilne = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#stats .stat.pilne')]
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => e.id),
    );
    pomiary.push({ dzien: 2, u: await udzialMapy(page), z1: dzien2.mapaZPodpowiedzia });
    if (!pilne.includes('sFire') && !pilne.includes('sWood'))
      throw new Error(`${opis}: po ostrzeżeniu czerwona linia stanu nie niesie kozy ani drewna (${pilne.join(', ')})`);
    await page.screenshot({ path: path.join(out, `${name}-dzien2.png`) });
    const zle: string[] = [];
    for (const p of pomiary) {
      const udz = Object.entries(p.u.udzialy)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      console.log(
        `  ${opis}, dzień ${p.dzien}: mapa ${p.u.mapa}% (z podpowiedzią u dołu ${p.u.mapaZPodpowiedzia}%${p.z1 !== undefined ? `, ${p.dzien === 1 ? 'z podpowiedzią startową' : 'z ostrzeżeniem o kozie na początku dnia'} ${p.z1}%` : ''}) [${udz}]`,
      );
      if (p.u.mapa < MIN_MAPA) zle.push(`dzień ${p.dzien}: mapa ${p.u.mapa}% (najmniej ${MIN_MAPA}%)`);
      // po zniknięciu ostrzeżenia nic nie wisi u dołu, więc z podpowiedzią też co najmniej tyle
      if (p.u.mapaZPodpowiedzia < MIN_MAPA)
        zle.push(`dzień ${p.dzien}: mapa z podpowiedzią ${p.u.mapaZPodpowiedzia}% (najmniej ${MIN_MAPA}%)`);
    }
    if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
  },
});

/* ---------------------------------------------------------------- telefon poziomo */

/** najwyżej tyle pikseli ma pasek poziomo (dwa wiersze: przyciski i zwinięta linia stanu; pionowo 105) */
const MAX_PASEK_POZIOMO = 70;

/** Telefon poziomo (niskie okno: 844×390, 932×430): pasek zwinięty do linii jak pionowo, cele zwinięte, mapa co najmniej 60% ekranu
    w dniu 1 i 2; karta osoby w lewym dolnym rogu nie wchodzi pod pasek ani na cele, listę ludzi, przyciski przybliżenia
    i podpowiedź, także z rozwiniętymi potrzebami i „Więcej”. */
const pozioma = (name: string, w: number, h: number, lang: 'pl' | 'en', zombie: boolean, out: string): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: true,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h}`;
    await start(page, base, `demo=przymorze${zombie ? '&tryb=zombie' : ''}&${GRA}`);
    await page.waitForFunction(() => document.getElementById('hint')!.textContent === '', null, { timeout: 15_000 });
    await poHudzie(page, 2);
    // 1. pasek zwinięty do jednej linii ze strzałką, niski; cele zwinięte
    const p = await stanPaska(page);
    const cele = await page.$eval('#goals .goals-head', (e) => e.getAttribute('aria-expanded'));
    const zle: string[] = [];
    if (!p.zwiniety) zle.push('pasek stanu nie jest zwinięty domyślnie');
    if (!p.przyciskWidac || p.strzalka !== '▾' || p.ariaExpanded !== 'false')
      zle.push(`przycisk zwijania: widać ${p.przyciskWidac}, „${p.strzalka}”, aria-expanded ${p.ariaExpanded}`);
    if (p.statsWysokosc > MAX_LINIA)
      zle.push(`linia stanu ma ${Math.round(p.statsWysokosc)} px (najwyżej ${MAX_LINIA})`);
    if (p.pasek > MAX_PASEK_POZIOMO) zle.push(`pasek ma ${Math.round(p.pasek)} px (najwyżej ${MAX_PASEK_POZIOMO})`);
    if (cele !== 'false') zle.push(`cele rozwinięte domyślnie (aria-expanded ${cele})`);
    const u1 = await udzialMapy(page);
    console.log(
      `  ${opis}, dzień 1: pasek ${Math.round(p.pasek)} px, linia ${Math.round(p.statsWysokosc)} px, mapa ${u1.mapa}%${zle.length ? `, NARUSZENIA: ${zle.length}` : ''}`,
    );
    if (u1.mapa < MIN_MAPA) zle.push(`dzień 1: mapa ${u1.mapa}% (najmniej ${MIN_MAPA}%)`);
    if (zle.length) throw new Error(`${opis}: ${zle.join('; ')}`);
    await page.screenshot({ path: path.join(out, `${name}-domyslny.png`) });
    // 2. karta osoby: w oknie, pod paskiem, na niczym
    await osobaZPotrzebami(page, true);
    const sprawdz = async (stan: string): Promise<void> => {
      await poHudzie(page, 2);
      const s = await stos(page);
      const nach = nachodzenia(s, { szufladaNaCelach: true });
      const pasek = await page.evaluate(() => document.getElementById('top')!.getBoundingClientRect().bottom);
      if (s.karta && (s.karta.t < pasek - 0.5 || s.karta.b > h + 0.5 || s.karta.r > w + 0.5))
        nach.push(
          `karta osoby poza oknem albo pod paskiem (${Math.round(s.karta.t)}–${Math.round(s.karta.b)} px, pasek do ${Math.round(pasek)})`,
        );
      if (s.nazwaKarty === false) nach.push('imię na karcie osoby jest przykryte');
      const k = s.karta ? `${Math.round(s.karta.t)}–${Math.round(s.karta.b)}` : '-';
      console.log(
        `  ${opis}, ${stan}: pasek do ${Math.round(pasek)}, karta ${k}${nach.length ? `, NARUSZENIA: ${nach.length}` : ''}`,
      );
      if (nach.length) throw new Error(`${opis}, ${stan}: ${nach.join('; ')}`);
    };
    await sprawdz('karta osoby');
    await page.screenshot({ path: path.join(out, `${name}-karta.png`) });
    // 3. potrzeby i „Więcej” rozwinięte, pasek stanu też: wyższa karta przewija się w środku, nic na nic nie nachodzi
    await liniaPotrzeb(page, opis);
    await kliknij(page, '#card .potrzeby-linia', true);
    await kliknij(page, '#card .wiecej', true);
    await kliknij(page, '#statsToggle', true);
    await sprawdz('wszystko rozwinięte');
    await page.screenshot({ path: path.join(out, `${name}-rozwiniete.png`) });
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

/* ---------------------------------------------------------------- wiki a zwijanie */

/** Pasek stanu a wiki (kafelki otwierają artykuły, src/ui/wiki-okno.ts): w zwiniętej linii stuknięcie rozwija pasek i nie otwiera
    wiki; w rozwiniętym kafelek otwiera swój artykuł i pasku nie zwija; zwija pas ▴ i też niczego nie otwiera. Dotykiem na telefonie
    i myszą w wąskim oknie komputera (700 px, też węższym niż 768). Nigdy oba naraz. */
const wikiPasek = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  dotyk: boolean,
  out: string,
): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: dotyk,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h} ${dotyk ? 'dotyk' : 'mysz'}`;
    await start(page, base, `demo=przymorze&${GRA}`);
    await poHudzie(page, 3);
    const stan0 = await stanPaska(page);
    if (!stan0.zwiniety) throw new Error(`${opis}: pasek nie jest zwinięty domyślnie`);
    // 1. zwinięta linia: stuknięcie w widoczny kafelek (palec trafia w pasek pod nim) rozwija pasek, wiki nie
    const pierwszy = stan0.kafelki.find((k) => k.widac)!;
    await wPunkt(page, dotyk, await srodek(page, `#${pierwszy.id}`));
    await poHudzie(page);
    const po1 = await stanPaska(page);
    console.log(
      `  ${opis}: stuknięcie w „${pierwszy.id}” zwiniętej linii: zwinięty ${po1.zwiniety}, okno ${await oknoOtwarte(page)}`,
    );
    if (po1.zwiniety) throw new Error(`${opis}: stuknięcie w kafelek zwiniętej linii nie rozwinęło paska`);
    if (await oknoOtwarte(page)) throw new Error(`${opis}: stuknięcie w kafelek zwiniętej linii otworzyło okno (wiki)`);
    // 2. rozwinięty: stuknięcie w kafelek otwiera jego artykuł, pasek zostaje rozwinięty
    await wPunkt(page, dotyk, await srodek(page, '#sWood'));
    await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zasob:drewno"]', { timeout: 5000 }).catch(() => {
      throw new Error(`${opis}: stuknięcie w kafelek rozwiniętego paska nie otworzyło artykułu o drewnie`);
    });
    if ((await stanPaska(page)).zwiniety) throw new Error(`${opis}: kafelek zwinął pasek razem z otwarciem wiki`);
    await page.screenshot({ path: path.join(out, `${name}-wiki.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('modal')!.hidden);
    await poHudzie(page);
    if ((await stanPaska(page)).zwiniety) throw new Error(`${opis}: po zamknięciu wiki pasek jest zwinięty`);
    // 3. pas ▴ zwija pasek i nie otwiera wiki
    await wPunkt(page, dotyk, await pasStrzalki(page));
    await poHudzie(page);
    const po3 = await stanPaska(page);
    console.log(`  ${opis}: stuknięcie w pas ▴: zwinięty ${po3.zwiniety}, okno ${await oknoOtwarte(page)}`);
    if (!po3.zwiniety) throw new Error(`${opis}: pas ▴ nie zwinął paska`);
    if (await oknoOtwarte(page)) throw new Error(`${opis}: pas ▴ otworzył okno (wiki)`);
    // 4. z klawiatury: Enter na kafelku zwiniętej linii rozwija pasek i nie otwiera wiki (kafelek ma fokus, bo czytnik ekranu i Tab
    // go widzą), Enter na kafelku rozwiniętego paska otwiera artykuł
    const kafelekLinii = (await stanPaska(page)).kafelki.find((k) => k.widac)!.id;
    await page.focus(`#${kafelekLinii}`);
    await page.keyboard.press('Enter');
    await poHudzie(page);
    if ((await stanPaska(page)).zwiniety || (await oknoOtwarte(page)))
      throw new Error(`${opis}: Enter na kafelku „${kafelekLinii}” zwiniętej linii: pasek zwinięty albo otwarte okno`);
    await page.focus('#sWood');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#sheet.wiki .wiki-art[data-art="zasob:drewno"]', { timeout: 5000 }).catch(() => {
      throw new Error(`${opis}: Enter na kafelku rozwiniętego paska nie otworzył artykułu`);
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('modal')!.hidden);
  },
});

/** Potrzeby na karcie a wiki (paski potrzeb otwierają artykuły): linia zwiniętych potrzeb tylko rozwija, pasek rozwiniętych tylko
    otwiera artykuł, linia nad nimi zwija. Dotykiem na telefonie i myszą w wąskim oknie. Nigdy oba naraz. */
const wikiKarta = (
  name: string,
  w: number,
  h: number,
  lang: 'pl' | 'en',
  dotyk: boolean,
  out: string,
): ShotTelefon => ({
  name,
  query: '',
  w,
  h,
  touch: dotyk,
  lang,
  run: async (page, base) => {
    const opis = `${name} ${w}×${h} ${dotyk ? 'dotyk' : 'mysz'}`;
    await start(page, base, `demo=przymorze&${GRA}`);
    await osobaZPotrzebami(page, dotyk);
    await liniaPotrzeb(page, opis);
    const k0 = await stanKarty(page);
    if (!k0.zwinieta || k0.paskiWidac) throw new Error(`${opis}: potrzeby nie są zwinięte domyślnie`);
    // 1. zwinięte: stuknięcie w linię rozwija paski, wiki nie
    await wPunkt(page, dotyk, await srodek(page, '#card .potrzeby-linia'));
    await poHudzie(page);
    const k1 = await stanKarty(page);
    console.log(
      `  ${opis}: stuknięcie w linię: zwinięte ${k1.zwinieta}, paski ${k1.paskiWidac}, okno ${await oknoOtwarte(page)}`,
    );
    if (k1.zwinieta || !k1.paskiWidac) throw new Error(`${opis}: stuknięcie w linię nie rozwinęło potrzeb`);
    if (await oknoOtwarte(page)) throw new Error(`${opis}: stuknięcie w linię potrzeb otworzyło okno (wiki)`);
    // 2. rozwinięte: stuknięcie w pasek najedzenia otwiera artykuł, karta zostaje rozwinięta
    await wPunkt(page, dotyk, await srodek(page, '#card .need[data-wiki="potrzeba:food"]'));
    await page.waitForSelector('#sheet.wiki .wiki-art[data-art="potrzeba:food"]', { timeout: 5000 }).catch(() => {
      throw new Error(`${opis}: stuknięcie w pasek najedzenia nie otworzyło artykułu`);
    });
    if ((await stanKarty(page)).zwinieta)
      throw new Error(`${opis}: pasek potrzeby zwinął potrzeby razem z otwarciem wiki`);
    await page.screenshot({ path: path.join(out, `${name}-wiki.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('modal')!.hidden);
    await poHudzie(page, 2);
    if ((await stanKarty(page)).zwinieta) throw new Error(`${opis}: po zamknięciu wiki potrzeby są zwinięte`);
    // 3. linia nad paskami zwija, wiki nie
    await wPunkt(page, dotyk, await srodek(page, '#card .potrzeby-linia'));
    await poHudzie(page);
    const k3 = await stanKarty(page);
    console.log(
      `  ${opis}: stuknięcie w linię rozwiniętych: zwinięte ${k3.zwinieta}, paski ${k3.paskiWidac}, okno ${await oknoOtwarte(page)}`,
    );
    if (!k3.zwinieta || k3.paskiWidac) throw new Error(`${opis}: linia nie zwinęła potrzeb`);
    if (await oknoOtwarte(page)) throw new Error(`${opis}: linia rozwiniętych potrzeb otworzyła okno (wiki)`);
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
    kartaWiecej('telefon-karta-wiecej-pl', 390, 844, 'pl', false, KARTA_PROC_POLSKI_390, out),
    kartaWiecej('telefon-karta-wiecej-en-zombie-360', 360, 740, 'en', true, 34, out),
    mapaTelefon('telefon-mapa-pl-zwykly-375x667', 375, 667, 'pl', false, out),
    pozioma('telefon-poziomo-pl-zwykly-844', 844, 390, 'pl', false, out),
    pozioma('telefon-poziomo-en-zombie-932', 932, 430, 'en', true, out),
    mapaTelefon('telefon-mapa-poziomo-pl-zwykly-844', 844, 390, 'pl', false, out),
    mapaTelefon('telefon-mapa-poziomo-en-zombie-932', 932, 430, 'en', true, out),
    wikiPasek('telefon-wiki-pasek-poziomo-dotyk', 844, 390, 'pl', true, out),
    rozwiniete('telefon-rozwiniete-pl', 390, 844, 'pl', false, out),
    rozwiniete('telefon-rozwiniete-en-zombie-360', 360, 740, 'en', true, out),
    wikiPasek('telefon-wiki-pasek-dotyk', 390, 844, 'pl', true, out),
    wikiPasek('telefon-wiki-pasek-mysz', 700, 900, 'en', false, out),
    wikiKarta('telefon-wiki-karta-dotyk', 360, 740, 'en', true, out),
    wikiKarta('telefon-wiki-karta-mysz', 700, 900, 'pl', false, out),
  ];
}
