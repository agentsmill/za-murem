import { describe, expect, it } from 'vitest';
import type { Wynik } from '../../src/net/api.ts';
import { noweCele, progiDni, utworzLiczniki, zdarzenieStartu } from '../../src/net/liczniki.ts';
import { ZDARZENIE_WZOR } from '../../src/net/protokol.ts';
import { OKAZJE } from '../../src/ui/sciezka-okazje.ts';
import { ROZDZIALY } from '../../src/ui/sciezka-rozdzialy.ts';

/** udawane api: zapisuje, co poszło, i odpowiada tak, jak każe `odpowiedz` */
function udawaneApi(
  odpowiedz: () => Promise<Wynik<undefined>> = async () => ({ ok: true, status: 204, dane: undefined }),
) {
  const wyslane: string[] = [];
  return {
    wyslane,
    api: {
      zdarzenie: (z: string) => {
        wyslane.push(z);
        return odpowiedz();
      },
    },
  };
}

describe('liczniki w grze (src/net/liczniki.ts)', () => {
  it('noweCele zwraca tylko nowe klucze, jako cel:<klucz>', () => {
    expect(noweCele({}, {})).toEqual([]);
    expect(noweCele({}, { 'r0.zaznacz': 5 })).toEqual(['cel:r0.zaznacz']);
    // cel zaliczony wcześniej (wczytany zapis) niczego nie wysyła, także z tickiem 0
    expect(noweCele({ 'r0.zaznacz': 0 }, { 'r0.zaznacz': 0 })).toEqual([]);
    expect(noweCele({ 'r0.zaznacz': 5 }, { 'r0.zaznacz': 5, 'r0.drewno': 9, 'o2.wymiana': 12 })).toEqual([
      'cel:r0.drewno',
      'cel:o2.wymiana',
    ]);
    // klucze z prototypu obiektu nie udają zaliczeń
    expect(noweCele({}, { constructor: 1 } as Record<string, number>)).toEqual(['cel:constructor']);
    expect(noweCele({ 'r0.zaznacz': 1 }, {})).toEqual([]);
  });

  it('każdy klucz celu ze ścieżki mieści się we wzorze zdarzenia serwera', () => {
    const klucze = [
      ...ROZDZIALY.flatMap((r) => r.cele.map((c) => `${r.k}.${c.key}`)),
      ...OKAZJE.flatMap((o) => o.cele.map((c) => `${o.k}.${c.key}`)),
    ];
    expect(klucze.length).toBeGreaterThan(20);
    for (const k of klucze) expect(ZDARZENIE_WZOR.test(`cel:${k}`), k).toBe(true);
  });

  it('zdarzenieStartu składa tryb, język i urządzenie we wzór serwera', () => {
    expect(zdarzenieStartu('zwykly', 'pl', false)).toBe('start:zwykly:pl:komp');
    expect(zdarzenieStartu('zombie', 'en', true)).toBe('start:zombie:en:tel');
    for (const tryb of ['zwykly', 'zombie'] as const)
      for (const jezyk of ['pl', 'en'] as const)
        for (const tel of [false, true]) expect(ZDARZENIE_WZOR.test(zdarzenieStartu(tryb, jezyk, tel))).toBe(true);
  });

  it('progiDni: z dnia 1 na 2 daje dzien:2, z 2 na 4 daje dzien:3, z 6 na 7 daje dzien:7, z 3 na 3 nic', () => {
    expect(progiDni(1, 2)).toEqual(['dzien:2']);
    expect(progiDni(2, 4)).toEqual(['dzien:3']);
    expect(progiDni(6, 7)).toEqual(['dzien:7']);
    expect(progiDni(3, 3)).toEqual([]);
    // przewinięcie kilku dni naraz (ff) daje wszystkie przekroczone progi po kolei
    expect(progiDni(1, 9)).toEqual(['dzien:2', 'dzien:3', 'dzien:7']);
    // dzień wstecz (inny zapis) i dni poza progami nic nie dają
    expect(progiDni(7, 3)).toEqual([]);
    expect(progiDni(7, 30)).toEqual([]);
    expect(progiDni(4, 6)).toEqual([]);
    for (const z of progiDni(1, 9)) expect(ZDARZENIE_WZOR.test(z)).toBe(true);
  });

  it('wyłączone liczniki i złe nazwy zdarzeń nie wołają api', () => {
    const wylaczone = udawaneApi();
    utworzLiczniki(wylaczone.api, false).wyslij('dzien:2');
    expect(wylaczone.wyslane).toEqual([]);

    const wlaczone = udawaneApi();
    const l = utworzLiczniki(wlaczone.api, true);
    for (const zle of [
      '',
      'dzien:4',
      'dzien:2 ',
      'start:zwykly:pl',
      'start:zwykly:de:komp',
      'cel:',
      `cel:${'a'.repeat(41)}`,
      'cel:Jan Kowalski',
      'Obrońców Wybrzeża 4, Gdańsk',
    ])
      l.wyslij(zle);
    expect(wlaczone.wyslane).toEqual([]);

    l.wyslij('start:zwykly:pl:komp');
    expect(wlaczone.wyslane).toEqual(['start:zwykly:pl:komp']);
  });

  it('cel i dzień idą najwyżej raz w jednej sesji strony, start za każdym razem', () => {
    const { api, wyslane } = udawaneApi();
    const l = utworzLiczniki(api, true);
    l.wyslij('cel:r0.zaznacz');
    l.wyslij('cel:r0.zaznacz');
    l.wyslij('cel:r0.drewno');
    l.wyslij('dzien:2');
    l.wyslij('dzien:2');
    l.wyslij('dzien:3');
    l.wyslij('start:zwykly:pl:komp');
    l.wyslij('start:zwykly:pl:komp');
    expect(wyslane).toEqual([
      'cel:r0.zaznacz',
      'cel:r0.drewno',
      'dzien:2',
      'dzien:3',
      'start:zwykly:pl:komp',
      'start:zwykly:pl:komp',
    ]);
    // osobny zestaw liczników to osobna sesja
    const inne = udawaneApi();
    utworzLiczniki(inne.api, true).wyslij('dzien:2');
    expect(inne.wyslane).toEqual(['dzien:2']);
  });

  it('błąd sieci przy wysyłce nie rzuca i nie ponawia', async () => {
    // wynik z błędem (429, brak sieci)
    const odmowa = udawaneApi(async () => ({
      ok: false,
      status: 429,
      blad: 'za_duzo_prob',
      komunikat: 'Za dużo zdarzeń.',
      ponowZa: 60,
    }));
    const l1 = utworzLiczniki(odmowa.api, true);
    expect(() => l1.wyslij('dzien:2')).not.toThrow();
    l1.wyslij('dzien:2');
    // obietnica odrzucona (wbrew umowie Wynik)
    const odrzucona = udawaneApi(() => Promise.reject(new Error('siec')));
    const l2 = utworzLiczniki(odrzucona.api, true);
    expect(() => l2.wyslij('cel:r0.zaznacz')).not.toThrow();
    // wyjątek synchroniczny z api
    const wyjatek = {
      zdarzenie: (): Promise<Wynik<undefined>> => {
        throw new Error('boom');
      },
    };
    const l3 = utworzLiczniki(wyjatek, true);
    expect(() => l3.wyslij('start:zombie:en:tel')).not.toThrow();
    // odrzucenie nie kończy się nieobsłużonym odrzuceniem: dajemy mikrozadaniom się wykonać
    await new Promise((r) => setTimeout(r, 0));
    expect(odmowa.wyslane).toEqual(['dzien:2']);
    expect(odrzucona.wyslane).toEqual(['cel:r0.zaznacz']);
  });
});
