/* Kod powrotu i usunięcie drużyny w grze (zadanie 10 planu 2026-10-28-premiera-etap-1-fundament): Menu gry sieciowej
   (menuSheet), okna kodu i usunięcia (src/ui/siec.ts), kod pokazywany raz po pierwszym porannym raporcie, ale tylko drużynie,
   która jeszcze nigdy nie miała kodu (pokazacKod, kodPokazany; kod z Menu, Ja.kod po powrocie kodem i kolejne gry tej
   samej drużyny go nie powtarzają, bo każdy nowy kod unieważnia stary), usunięcie drużyny, które kończy sieć w tej
   grze (usun), kopiowanie kodu bez błędu przy odmowie schowka oraz komunikat o zgubionej sesji drużyny anonimowej przy
   wczytaniu jej zapisu. GraSieciowa chodzi na udawanym API z siec-api-atrapa.ts, bez DOM. */

import { afterEach, describe, expect, it } from 'vitest';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import type { ApiGry } from '../../src/net/api.ts';
import { GraSieciowa } from '../../src/net/gra.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { menuSheet, type Sheet } from '../../src/ui/okna.ts';
import { kodSheet, kopiujKod, usunSheet } from '../../src/ui/siec.ts';
import { type Save, worldKey } from '../../src/ui/zapis.ts';
import type { Loaded } from '../../src/world/load.ts';
import { toGeoT } from '../../src/world/mvt.ts';
import { buildWorld, LOAD_RADIUS } from '../../src/world/world.ts';
import { ADDRESSES, decodedTiles } from './fixtures.ts';
import { jaSerwera, kodTestowy, ok, udawaneApiGry, zle } from './siec-api-atrapa.ts';
import { atrapaBloku } from './siec-blok-atrapa.ts';

const adr = ADDRESSES.find((a) => a.key === 'lanciego') as (typeof ADDRESSES)[number];
const geo = toGeoT(decodedTiles(adr), adr.lat, adr.lon, LOAD_RADIUS);
const zbuduj = (bez: string[] | null) => buildWorld(geo, { seed: 1, ...(bez?.length ? { bezSiedziby: bez } : {}) });
const dane: Loaded = { geo, name: 'Ursynów', addr: 'Lanciego 10G, Warszawa', street: 'Lanciego', src: 'mvt' };
const chwila = () => new Promise((r) => setTimeout(r, 0));

const opcje = (api: ApiGry, o: { wlaczona?: boolean; say?: string[] } = {}) => ({
  el: null,
  warstwa: null,
  wlaczona: o.wlaczona ?? true,
  touch: false,
  say: (t: string) => void o.say?.push(t),
  screenOf: (x: number, y: number): [number, number] => [x, y],
  onChmura: () => {},
  api,
  sesja: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  przeladuj: () => {},
});

/** akcje (data-act) przycisków okna */
const akcje = (s: Sheet) => [...(s.body + s.foot).matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]);
/** zapis w kształcie, który przyjmuje readSave, ze stanem sieci z gry */
const zapisGry = (siec: Save['siec'], at = 5) =>
  ({ v: 1, at, seed: 1, sim: { v: 3, tick: 0 }, gov: { v: 1 }, data: dane, siec }) as unknown as Save;

/** nowa gra drużyny anonimowej (bez sesji drużyna powstaje przy starcie) */
async function graAnonimowa(o: Parameters<typeof udawaneApiGry>[0] = {}) {
  const udawane = udawaneApiGry({ nick: null, ...o });
  const g = new GraSieciowa(opcje(udawane.api));
  await g.init();
  const w = await g.przygotuj(dane, zbuduj);
  return { ...udawane, g, w };
}

afterEach(() => ustawJezyk('pl'));

describe('kod powrotu i usunięcie drużyny w Menu (src/ui/okna.ts, src/ui/siec.ts)', () => {
  it('Menu gry sieciowej ma kod powrotu, a drużyna anonimowa też usunięcie; gra bez sieci nie ma żadnego', async () => {
    expect(akcje(menuSheet('x'))).not.toContain('menu-kod');
    expect(akcje(menuSheet('x'))).not.toContain('menu-usun');
    const konto = menuSheet('x', { anonimowa: false });
    expect(akcje(konto)).toContain('menu-kod');
    expect(akcje(konto)).not.toContain('menu-usun');
    const druzyna = menuSheet('x', { anonimowa: true });
    expect(akcje(druzyna)).toContain('menu-kod');
    expect(akcje(druzyna)).toContain('menu-usun');
    // pozostałe przyciski Menu zostają na swoim miejscu, a zapis i powrót do ekranu startowego jest ostatni
    expect(akcje(druzyna)[0]).toBe('menu-back');
    expect(akcje(druzyna).at(-1)).toBe('menu-start');
    expect(druzyna.body).toContain('Nowy kod powrotu drużyny');
    expect(druzyna.body).toContain('Usuń drużynę z serwera');
    ustawJezyk('en');
    const en = menuSheet('x', { anonimowa: true });
    expect(en.body).toContain('New team return code');
    expect(en.body).toContain('Delete the team from the server');

    // GraSieciowa podaje Menu to, co gra naprawdę ma: sieć drużyny anonimowej, sieć konta z nickiem, nic poza siecią
    ustawJezyk('pl');
    const { g } = await graAnonimowa();
    expect(g.menuSieci()).toEqual({ anonimowa: true });
    const nick = new GraSieciowa(opcje(udawaneApiGry({ nick: 'Sasiad' }).api));
    await nick.init();
    await nick.przygotuj(dane, zbuduj);
    expect(nick.menuSieci()).toEqual({ anonimowa: false });
    const bez = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api, { wlaczona: false }));
    await bez.init();
    await bez.przygotuj(dane, zbuduj);
    expect(bez.menuSieci()).toBeUndefined();
    // serwer odpowiada 503 przy zakładaniu drużyny: gra bez sieci, Menu bez przycisków sieci
    const lezy = new GraSieciowa(
      opcje(udawaneApiGry({ nick: null, druzyna: () => zle(503, 'serwer_zajety', 'Zajęty.') }).api),
    );
    await lezy.init();
    await lezy.przygotuj(dane, zbuduj);
    expect(lezy.menuSieci()).toBeUndefined();
  });

  it('bez sesji serwer daje 200 z null (starszy 401): w obu razach gra startuje bez konta i zakłada drużynę', async () => {
    for (const stare401 of [false, true]) {
      const { g, log, w } = await graAnonimowa({ stare401 });
      expect(w).not.toBeNull();
      expect(log.filter((l) => l === 'druzyna')).toHaveLength(1);
      expect(g.podglad()).toMatchObject({ zalogowani: true, bezSieci: false, stan: { konto: '#7' } });
      // sam init, bez gry: nikt nie jest zalogowany i nic nie powstaje
      const sam = udawaneApiGry({ nick: null, stare401 });
      const tylkoInit = new GraSieciowa(opcje(sam.api));
      await tylkoInit.init();
      expect(tylkoInit.podglad()).toMatchObject({ zalogowani: false, stan: null });
      expect(sam.log).not.toContain('druzyna');
    }
  });

  it('kodSheet po polsku i po angielsku pokazuje kod i ostrzeżenie o unieważnieniu', () => {
    const pl = kodSheet('ABCD-EFGH-JKLM');
    expect(pl.title).toBe('Kod powrotu drużyny');
    expect(pl.body).toContain('ABCD-EFGH-JKLM');
    expect(pl.body).toContain(
      'Zapiszcie go. Z tym kodem wrócicie do drużyny w innej przeglądarce. Nowy kod unieważnia poprzedni.',
    );
    expect(akcje(pl)).toEqual(['kod-kopiuj', 'kod-ok']);
    // kod widać raz: zamyka go tylko przycisk, nie Esc ani klik obok
    expect(pl.closable).toBeFalsy();
    ustawJezyk('en');
    const en = kodSheet('ABCD-EFGH-JKLM');
    expect(en.title).toBe('Team return code');
    expect(en.body).toContain('ABCD-EFGH-JKLM');
    expect(en.body).toContain('Write it down.');
    expect(en.body).toContain('another browser');
    expect(en.body).toContain('A new code invalidates the previous one.');
    expect(en.body).not.toMatch(/Zapiszcie|kod /);
    // bez kodu (serwer nie odpowiedział): powód zamiast kodu, bez kopiowania, kod nadal dostępny w Menu
    const blad = kodSheet(null, '<b>Serwer jest przeciążony.</b>');
    expect(blad.body).toContain('&lt;b&gt;Serwer jest przeciążony.&lt;/b&gt;');
    expect(blad.body).not.toContain('<b>');
    expect(blad.body).toContain('Menu');
    expect(akcje(blad)).toEqual(['kod-ok']);
    expect(blad.closable).toBe(true);
    ustawJezyk('pl');
    expect(kodSheet(null).body).toContain('Nie udało się');
    // usuwanie: pytanie z dwiema odpowiedziami, powód porażki w oknie
    expect(akcje(usunSheet())).toEqual(['usun-nie', 'usun-tak']);
    expect(usunSheet().body).toContain('Tego nie da się cofnąć.');
    expect(usunSheet('Serwer jest przeciążony.').body).toContain('Serwer jest przeciążony.');
    ustawJezyk('en');
    expect(usunSheet().title).toBe('Delete the team from the server?');
    expect(usunSheet().body).toContain('This cannot be undone.');
  });

  it('kopiujKod: schowek, a bez niego albo przy odmowie zaznaczenie tekstu, bez błędu', async () => {
    const zapisane: string[] = [];
    let zaznaczono = 0;
    const zaznacz = () => void zaznaczono++;
    // schowek działa: kod w schowku, nic nie jest zaznaczane
    expect(await kopiujKod('ABCD-EFGH-JKLM', { writeText: async (t) => void zapisane.push(t) }, zaznacz)).toBe(true);
    expect(zapisane).toEqual(['ABCD-EFGH-JKLM']);
    expect(zaznaczono).toBe(0);
    // schowek odmawia (brak zgody, strona nie jest bezpieczna): kod zaznaczony, żaden błąd nie wychodzi
    const odmowa = { writeText: async () => Promise.reject(new Error('NotAllowedError')) };
    expect(await kopiujKod('ABCD-EFGH-JKLM', odmowa, zaznacz)).toBe(false);
    expect(zaznaczono).toBe(1);
    // schowka nie ma w ogóle
    expect(await kopiujKod('ABCD-EFGH-JKLM', undefined, zaznacz)).toBe(false);
    expect(zaznaczono).toBe(2);
  });
});

describe('kod powrotu i usunięcie drużyny w grze (src/net/gra.ts)', () => {
  it('kod() bierze nowy kod z serwera za każdym razem, a porażka daje null z powodem w blad()', async () => {
    const { g, log } = await graAnonimowa({
      nowyKod: (n) =>
        n === 3
          ? zle(503, 'serwer_zajety', 'Serwer jest przeciążony. Spróbujcie za chwilę.')
          : ok({ kod: kodTestowy(n) }),
    });
    expect(await g.kod()).toBe(kodTestowy(1));
    expect(await g.kod()).toBe(kodTestowy(2));
    expect(log.filter((x) => x === 'kod')).toHaveLength(2);
    expect(g.blad()).toBeNull();
    expect(await g.kod()).toBeNull();
    expect(tr(g.blad())).toBe('Serwer jest przeciążony. Spróbujcie za chwilę.');
    // następna próba zaczyna od czystego błędu
    expect(await g.kod()).toBe(kodTestowy(4));
    expect(g.blad()).toBeNull();
    // gra bez sieci nie pyta serwera o kod
    const bez = udawaneApiGry({ nick: null });
    const gb = new GraSieciowa(opcje(bez.api, { wlaczona: false }));
    await gb.init();
    await gb.przygotuj(dane, zbuduj);
    expect(await gb.kod()).toBeNull();
    expect(bez.log).toEqual([]);
  });

  it('pokazacKod jest prawdą raz: po kodPokazany i po zapisie z wczytaniem już nie', async () => {
    const { g } = await graAnonimowa();
    expect(g.anonimowa()).toBe(true);
    expect(g.pokazacKod()).toBe(true);
    // wczytanie zapisu, w którym kod jeszcze nie był pokazany, nadal proponuje go raz
    const przed = zapisGry({ ...(g.stan as NonNullable<typeof g.stan>) });
    const przedGra = new GraSieciowa(opcje(udawaneApiGry({ anonimowa: '#7' }).api));
    await przedGra.init();
    await przedGra.przygotuj(dane, zbuduj, przed);
    expect(przedGra.pokazacKod()).toBe(true);
    // pokazany: koniec, także w zapisie
    g.kodPokazany();
    expect(g.pokazacKod()).toBe(false);
    expect(g.stan?.kodPokazany).toBe(true);
    const zapis = zapisGry(JSON.parse(JSON.stringify(g.stan)));
    expect(zapis.siec?.kodPokazany).toBe(true);
    const wczytana = new GraSieciowa(opcje(udawaneApiGry({ anonimowa: '#7' }).api));
    await wczytana.init();
    await wczytana.przygotuj(dane, zbuduj, zapis);
    expect(wczytana.podglad().bezSieci).toBe(false);
    expect(wczytana.pokazacKod()).toBe(false);
    // konto z nickiem i gra bez sieci nie mają się czym chwalić
    const nick = new GraSieciowa(opcje(udawaneApiGry({ nick: 'Sasiad' }).api));
    await nick.init();
    await nick.przygotuj(dane, zbuduj);
    expect(nick.pokazacKod()).toBe(false);
    const bez = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api, { wlaczona: false }));
    await bez.init();
    await bez.przygotuj(dane, zbuduj);
    expect(bez.pokazacKod()).toBe(false);
    // zapis anonimowej drużyny wczytany bez jej sesji (gra bez sieci): kodu nie pokazujemy, sieci i tak nie ma
    const bezSesji = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api));
    await bezSesji.init();
    await bezSesji.przygotuj(dane, zbuduj, przed);
    expect(bezSesji.pokazacKod()).toBe(false);
  });

  it('kod z Menu, potem brak automatycznego okna po raporcie (kod w ręku nie jest wymieniany)', async () => {
    const { g, log } = await graAnonimowa();
    expect(g.pokazacKod()).toBe(true);
    // kod wzięty z Menu przed pierwszym porannym raportem: okno po raporcie unieważniłoby go
    expect(await g.kod()).toBe(kodTestowy(1));
    expect(g.pokazacKod()).toBe(false);
    expect(g.stan?.kodPokazany).toBe(true);
    // także zapis tej gry wczytany później (kodPokazany w zapisie, a serwer podaje już Ja.kod prawdę)
    const zapis = zapisGry(JSON.parse(JSON.stringify(g.stan)));
    expect(zapis.siec?.kodPokazany).toBe(true);
    // nieudany kod z Menu niczego nie zmienia: drużyna wciąż nie ma kodu, więc okno po raporcie się należy
    const lezy = await graAnonimowa({ nowyKod: () => zle(503, 'serwer_zajety', 'Serwer jest przeciążony.') });
    expect(await lezy.g.kod()).toBeNull();
    expect(lezy.g.pokazacKod()).toBe(true);
    expect(lezy.g.stan?.kodPokazany).toBeUndefined();
    // jedno żądanie kodu i żadnych dodatkowych w tle
    expect(log.filter((x) => x === 'kod')).toHaveLength(1);
  });

  it('Ja.kod prawda (powrót kodem, druzyna() z istniejącą sesją, sesja z kodem): brak automatycznego okna', async () => {
    // sesja drużyny, która ma już kod, już przy wejściu na stronę (init)
    const zKodem = udawaneApiGry({ anonimowa: '#7', maKod: true });
    const g1 = new GraSieciowa(opcje(zKodem.api));
    await g1.init();
    await g1.przygotuj(dane, zbuduj);
    expect(g1.anonimowa()).toBe(true);
    expect(g1.pokazacKod()).toBe(false);
    // powrót kodem na karcie startowej (druga przeglądarka): kto wraca kodem, ten go ma, także w zapisie sprzed kodu
    const przed = zapisGry({ zajete: [], dom: true, konto: '#7' });
    const powrot = udawaneApiGry({ nick: null, kody: { ABCDEFGHJKLM: '#7' } });
    const blok = atrapaBloku();
    const g2 = new GraSieciowa({ ...opcje(powrot.api), el: blok.el as unknown as HTMLElement });
    await g2.init();
    blok.pole('#scKod').value = 'ABCD-EFGH-JKLM';
    blok.klik('powrot');
    await chwila();
    await chwila();
    expect(g2.anonimowa()).toBe(true);
    await g2.przygotuj(dane, zbuduj, przed);
    expect(g2.podglad().bezSieci).toBe(false);
    expect(g2.pokazacKod()).toBe(false);
    await g2.przygotuj(dane, zbuduj);
    expect(g2.pokazacKod()).toBe(false);
    // druzyna() odpowiada kontem, które już jest (200, Ja.kod prawda): też bez okna
    const istniejaca = udawaneApiGry({ nick: null, druzyna: () => ok(jaSerwera('#7', true)) });
    const g3 = new GraSieciowa(opcje(istniejaca.api));
    await g3.init();
    await g3.przygotuj(dane, zbuduj);
    expect(g3.anonimowa()).toBe(true);
    expect(g3.pokazacKod()).toBe(false);
    // kontrola: nowa drużyna bez kodu dostaje okno (Ja.kod fałsz)
    const nowa = udawaneApiGry({ nick: null });
    const g4 = new GraSieciowa(opcje(nowa.api));
    await g4.init();
    await g4.przygotuj(dane, zbuduj);
    expect(g4.pokazacKod()).toBe(true);
  });

  it('druga gra drużyny z kodem: brak automatycznego okna po jej pierwszej nocy', async () => {
    // pierwsza gra: pierwszy poranek pokazuje okno, czyli bierze kod z serwera (jak main.ts) i oznacza go jako pokazany
    const pierwsza = await graAnonimowa();
    expect(pierwsza.g.pokazacKod()).toBe(true);
    pierwsza.g.kodPokazany();
    expect(await pierwsza.g.kod()).toBe(kodTestowy(1));
    // druga gra tej samej drużyny w tej samej przeglądarce (ta sama sesja, nowy stan sieci bez kodPokazany)
    await pierwsza.g.przygotuj(dane, zbuduj);
    expect(pierwsza.g.stan?.kodPokazany).toBeUndefined();
    expect(pierwsza.g.pokazacKod()).toBe(false);
    // nowa karta tej przeglądarki (init z sesją, Ja.kod prawda z serwera): nowa gra, wczytany zapis bez kodPokazany
    const karta = new GraSieciowa(opcje(pierwsza.api));
    await karta.init();
    await karta.przygotuj(dane, zbuduj);
    expect(karta.pokazacKod()).toBe(false);
    const stary = zapisGry({ zajete: [], dom: true, konto: '#7' });
    await karta.przygotuj(dane, zbuduj, stary);
    expect(karta.pokazacKod()).toBe(false);
    // jeśli w pierwszej grze serwer nie dał kodu (503), drużyna kodu nie ma i następna gra pokaże okno jeszcze raz
    const bezKodu = await graAnonimowa({ nowyKod: () => zle(503, 'serwer_zajety', 'Serwer jest przeciążony.') });
    bezKodu.g.kodPokazany();
    expect(await bezKodu.g.kod()).toBeNull();
    const nastepna = new GraSieciowa(opcje(bezKodu.api));
    await nastepna.init();
    await nastepna.przygotuj(dane, zbuduj);
    expect(nastepna.pokazacKod()).toBe(true);
  });

  it('usun: po 204 gra bez sieci, bez dalszych zapisów do chmury', async () => {
    const say: string[] = [];
    const udawane = udawaneApiGry({ nick: null });
    const g = new GraSieciowa(opcje(udawane.api, { say }));
    await g.init();
    const w = await g.przygotuj(dane, zbuduj);
    const sim = new Sim(w, createSim(w, 1));
    // zapis do chmury i odświeżanie klatek przed usunięciem idą
    g.zapisz({ siec: g.stan } as unknown as Save);
    await chwila();
    expect(udawane.log.filter((x) => x.startsWith('chmura'))).toHaveLength(1);
    expect(await g.usun()).toBe(true);
    expect(udawane.log.filter((x) => x === 'usun-druzyne')).toHaveLength(1);
    // od tej chwili nic nie idzie do serwera: ani zapis, ani klatki, ani kod, ani drugie usunięcie, ani koniec gry
    const ile = udawane.log.length;
    g.zapisz({ siec: g.stan } as unknown as Save);
    g.klatka(sim, 1e12, false);
    await chwila();
    expect(await g.kod()).toBeNull();
    expect(await g.usun()).toBe(false);
    g.koniec();
    await chwila();
    expect(udawane.log).toHaveLength(ile);
    // gra toczy się dalej: stan zostaje (świat ten sam), ale oznaczony jako bez sieci, a Menu nie ma przycisków sieci
    expect(g.menuSieci()).toBeUndefined();
    expect(g.anonimowa()).toBe(false);
    expect(g.podglad()).toMatchObject({ zalogowani: false, bezSieci: true, klatki: 0, cel: null });
    expect(g.stan).toMatchObject({ dom: true, zajete: [], usunieta: true });
    expect(g.pokazacKod()).toBe(false);
    expect(g.bezDomu()).toBe(false);
    expect(say).toEqual([]);
  });

  it('usun nieudane (serwer zajęty, brak sieci): gra zostaje w sieci, powód w blad(), można spróbować jeszcze raz', async () => {
    let proba = 0;
    const udawane = udawaneApiGry({
      nick: null,
      usunDruzyne: () =>
        ++proba === 1 ? zle(503, 'serwer_zajety', 'Serwer jest przeciążony. Spróbujcie za chwilę.') : zle(0, 'siec'),
    });
    const g = new GraSieciowa(opcje(udawane.api));
    await g.init();
    await g.przygotuj(dane, zbuduj);
    expect(await g.usun()).toBe(false);
    expect(tr(g.blad())).toBe('Serwer jest przeciążony. Spróbujcie za chwilę.');
    expect(g.menuSieci()).toEqual({ anonimowa: true });
    expect(g.stan?.usunieta).toBeUndefined();
    g.zapisz({ siec: g.stan } as unknown as Save);
    await chwila();
    expect(udawane.log.some((x) => x.startsWith('chmura'))).toBe(true);
    expect(await g.usun()).toBe(false);
    expect(g.blad()).not.toBeNull();
    // konto z nickiem usuwa się hasłem poza grą: w grze usun() go nie rusza
    const nick = udawaneApiGry({ nick: 'Sasiad' });
    const gn = new GraSieciowa(opcje(nick.api));
    await gn.init();
    await gn.przygotuj(dane, zbuduj);
    expect(await gn.usun()).toBe(false);
    expect(nick.log).not.toContain('usun-druzyne');
    expect(gn.menuSieci()).toEqual({ anonimowa: false });
  });

  it('zapis po usunięciu drużyny wczytuje się bez sieci i bez komunikatów, także gdy jest już nowa drużyna', async () => {
    const { g, w } = await graAnonimowa();
    expect(await g.usun()).toBe(true);
    const zapis = zapisGry(JSON.parse(JSON.stringify(g.stan)));
    expect(zapis.siec).toMatchObject({ usunieta: true, dom: true });
    // przeglądarka bez sesji: żadnego „zgubiliście sesję”, bo kodu powrotu już nie ma do czego użyć
    const bezSesji = udawaneApiGry({ nick: null });
    const g1 = new GraSieciowa(opcje(bezSesji.api));
    await g1.init();
    const w1 = await g1.przygotuj(dane, zbuduj, zapis);
    expect(worldKey(w1)).toBe(worldKey(w));
    expect(g1.podglad().bezSieci).toBe(true);
    expect(g1.komunikatStartu()).toBeNull();
    expect(g1.menuSieci()).toBeUndefined();
    // gracz założył już nową drużynę: stary zapis nie przechodzi na jej konto (ani w sieć, ani z komunikatem o obcym koncie)
    const nowa = udawaneApiGry({ anonimowa: '#9' });
    const g2 = new GraSieciowa(opcje(nowa.api));
    await g2.init();
    await g2.przygotuj(dane, zbuduj, zapis);
    expect(g2.podglad().bezSieci).toBe(true);
    expect(g2.komunikatStartu()).toBeNull();
    expect(g2.menuSieci()).toBeUndefined();
    expect(nowa.log).toEqual([]);
  });
});

describe('zgubiona sesja drużyny anonimowej przy wczytaniu zapisu (Review Focus 1)', () => {
  const zapisDruzyny = () => zapisGry({ zajete: [], dom: true, konto: '#7', wersja: 3 });

  it('zapis drużyny anonimowej bez sesji: gra bez sieci i jeden komunikat o kodzie powrotu, po polsku i po angielsku', async () => {
    const { api, log } = udawaneApiGry({ nick: null, kody: { ABCDEFGHJKLM: '#7' } });
    const g = new GraSieciowa(opcje(api));
    await g.init();
    await g.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(g.podglad().bezSieci).toBe(true);
    const pl = g.komunikatStartu() ?? '';
    expect(pl).toMatch(/bez sieci/);
    expect(pl).toMatch(/kod powrotu/i);
    expect(pl).toMatch(/karcie startowej/);
    // nic nie idzie do serwera: gra bez sieci jest cicha poza tym jednym zdaniem
    expect(log).toEqual([]);
    expect(g.menuSieci()).toBeUndefined();
    ustawJezyk('en');
    const en = g.komunikatStartu() ?? '';
    expect(en).toMatch(/offline/);
    expect(en).toMatch(/return code/);
    expect(en).toMatch(/start card/);
    expect(en).not.toMatch(/kod|sieci/);
  });

  it('po wpisaniu kodu na karcie startowej ten sam zapis gra w sieci i bez komunikatu', async () => {
    const { api } = udawaneApiGry({ nick: null, kody: { ABCDEFGHJKLM: '#7' } });
    const g = new GraSieciowa(opcje(api));
    await g.init();
    await g.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(g.komunikatStartu()).not.toBeNull();
    // ten sam przegladarkowy zapis po powrocie kodem (api.powrot loguje do drużyny): sieć wraca
    await api.powrot('ABCD-EFGH-JKLM');
    const g2 = new GraSieciowa(opcje(api));
    await g2.init();
    await g2.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(g2.podglad()).toMatchObject({ zalogowani: true, bezSieci: false });
    expect(g2.komunikatStartu()).toBeNull();
  });

  it('bez tego komunikatu: konto z nickiem, serwer który leży, zapis innej drużyny i gra bez zapisu sieci', async () => {
    const nickZapis = zapisGry({ zajete: [], dom: true, konto: 'Sasiad' });
    // konto z nickiem bez sesji: bez komunikatu o kodzie (kodu powrotu nie ma kto użyć, bo wraca się hasłem)
    const a = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api));
    await a.init();
    await a.przygotuj(dane, zbuduj, nickZapis);
    expect(a.komunikatStartu()).toBeNull();
    // serwer nie odpowiada (GitHub Pages, serwer leży): karta startowa nie ma pola kodu, więc nie odsyłamy do niej
    const b = new GraSieciowa(opcje(udawaneApiGry({ nick: null, bezSerwera: true }).api));
    await b.init();
    await b.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(b.podglad().bezSieci).toBe(true);
    expect(b.komunikatStartu()).toBeNull();
    // sieć wyłączona w tej stronie
    const c = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api, { wlaczona: false }));
    await c.init();
    await c.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(c.komunikatStartu()).toBeNull();
    // inna drużyna zalogowana: jest komunikat o innym koncie, a nie o zgubionej sesji
    const d = new GraSieciowa(opcje(udawaneApiGry({ anonimowa: '#8' }).api));
    await d.init();
    await d.przygotuj(dane, zbuduj, zapisDruzyny());
    expect(d.komunikatStartu()).toMatch(/innego konta/);
    // zapis bez stanu sieci: zwykła gra
    const e = new GraSieciowa(opcje(udawaneApiGry({ nick: null }).api));
    await e.init();
    await e.przygotuj(dane, zbuduj, zapisGry(undefined));
    expect(e.komunikatStartu()).toBeNull();
  });
});
