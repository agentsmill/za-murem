import { describe, expect, it } from 'vitest';
import { type Noga, type Opcje, uruchomBramke, type WynikZAgentem } from '../../tools/determinizm/bramka.ts';
import { zakodujWywolania } from '../../tools/determinizm/nagrywanie.ts';

const CZESCI = { kafelki: 'k', budynki: 'b', drzewa: 'd', kat: 'a', reszta: 'r' };

interface Ustawienia {
  docelowa?: boolean;
  /** null: silnik niedostępny */
  wersja?: string | null;
  /** skróty godzinowe dla przebiegu o danym numerze (0 i 1 to dwa przebiegi w jednym procesie) */
  skroty?: (bieg: number) => string[];
  swiat?: string;
  /** wyjątek z licz */
  blad?: string;
  /** nagrane wywołania Math, gdy zlecenie prosi o nagranie */
  nagranie?: [string, number[], number][];
}

/** udawana noga: bez przeglądarek i procesów, liczy to, co jej każemy */
function noga(id: string, u: Ustawienia = {}): Noga & { wywolania: number; zamknieta: boolean } {
  const wersja = u.wersja === undefined ? `wersja-${id}` : u.wersja;
  const stan = { wywolania: 0, zamknieta: false };
  return {
    id,
    etykieta: id,
    docelowa: u.docelowa ?? true,
    wersja,
    brak: wersja === null ? `brak (npx playwright install ${id})` : undefined,
    async licz(z): Promise<WynikZAgentem> {
      stan.wywolania++;
      if (u.blad) throw new Error(u.blad);
      return {
        biegi: Array.from({ length: z.powtorz }, (_, i) => ({
          skroty: (u.skroty ?? (() => ['s0', 's1', 's2']))(i),
          swiat: u.swiat ?? 'swiat',
          swiatCzesci: CZESCI,
          ms: 1,
          ...(z.nagraj && u.nagranie ? { nagranie: zakodujWywolania(u.nagranie) } : {}),
        })),
      };
    },
    async kontroluj() {
      return {};
    },
    async zamknij() {
      stan.zamknieta = true;
    },
    get wywolania() {
      return stan.wywolania;
    },
    get zamknieta() {
      return stan.zamknieta;
    },
  };
}

const opcje = (o: Partial<Opcje> = {}): Opcje => ({
  godziny: 3,
  dema: ['zielonki'],
  tryby: ['zwykly'],
  ziarna: [1],
  wymuszonaGodzina: null,
  bezSwiata: false,
  ...o,
});

async function bramka(noge: Noga[], o: Partial<Opcje> = {}) {
  const wyjscie: string[] = [];
  const postep: string[] = [];
  const kod = await uruchomBramke(
    opcje(o),
    noge,
    { wypisz: (l) => wyjscie.push(l), postep: (l) => postep.push(l) },
    '/repo',
  );
  return { kod, wyjscie: wyjscie.join('\n'), postep: postep.join('\n') };
}

/** komplet silników docelowych, wszystkie obecne */
const wszystkie = (u: (id: string) => Ustawienia = () => ({})) =>
  ['node24', 'chromium', 'firefox', 'webkit'].map((id) => noga(id, u(id)));

describe('kod wyjścia bramki determinizmu (udawane nogi)', () => {
  it('0, gdy wszystkie silniki docelowe są i się zgadzają', async () => {
    const r = await bramka(wszystkie());
    expect(r.kod).toBe(0);
    expect(r.wyjscie).toContain('zgodne:');
    expect(r.wyjscie).toContain('Kod wyjścia 0');
  });

  it('2, gdy silniki się zgadzają, ale brakuje silnika docelowego (wiersz „brak” z poleceniem)', async () => {
    const r = await bramka(wszystkie((id) => (id === 'firefox' ? { wersja: null } : {})));
    expect(r.kod).toBe(2);
    expect(r.wyjscie).toContain('brak (npx playwright install firefox)');
    expect(r.wyjscie).toContain('Brakuje silników docelowych: firefox');
  });

  it('1 przy rozbieżnych skrótach, z godziną gry i skrótami każdego silnika', async () => {
    const r = await bramka(wszystkie((id) => (id === 'webkit' ? { skroty: () => ['s0', 'INNY', 's2'] } : {})));
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('ROZBIEŻNOŚĆ zielonki zwykły 3 h: pierwsza po 2. godzinie gry');
    expect(r.wyjscie).toMatch(/webkit\s+INNY/);
  });

  it('1 przy niepowtarzalnym silniku: drugi przebieg w tym samym procesie daje inne skróty', async () => {
    const r = await bramka(
      wszystkie((id) => (id === 'chromium' ? { skroty: (b) => ['s0', b ? 'drugi' : 's1', 's2'] } : {})),
    );
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('NIEPOWTARZALNY chromium');
  });

  it('1, gdy silnik rzuca wyjątek, a jego pozostałe scenariusze są pominięte, żeby nie czekać na każdy z osobna', async () => {
    const zepsuty = noga('chromium', { blad: 'strona nie wstała' });
    const r = await bramka([noga('node24'), zepsuty], { dema: ['przymorze', 'lanciego', 'zielonki'] });
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('BŁĄD chromium');
    expect(r.wyjscie).toContain('strona nie wstała');
    expect(zepsuty.wywolania).toBe(1);
    expect(r.wyjscie).toMatch(/pominięty/);
  });

  it('gdy wzorzec (node24) padł na scenariuszu, pozostałe silniki porównują się między sobą i NIE dostaje tylko ten, który się różni', async () => {
    const r = await bramka([
      noga('node24', { blad: 'proces padł' }),
      noga('chromium'),
      noga('firefox'),
      noga('webkit', { skroty: () => ['s0', 'INNY', 's2'] }),
    ]);
    expect(r.kod).toBe(1);
    // kolumny tabeli: silnik, wersja, powtarzalny, zgodny z …, czas
    const zgodny = (id: string) =>
      r.wyjscie
        .split('\n')
        .find((l) => l.startsWith(`${id} `))
        ?.split(/\s{2,}/)[3];
    expect(zgodny('chromium')).toBe('tak');
    expect(zgodny('firefox')).toBe('tak');
    expect(zgodny('webkit')).toBe('NIE');
  });

  it('rozbieżność ważniejsza niż brak silnika: 1, nie 2', async () => {
    const r = await bramka(
      wszystkie((id) =>
        id === 'firefox' ? { wersja: null } : id === 'webkit' ? { skroty: () => ['x', 'y', 'z'] } : {},
      ),
    );
    expect(r.kod).toBe(1);
  });

  it('żaden z wybranych silników nie jest dostępny: 2 z komunikatem, bez wyjątku', async () => {
    const r = await bramka([noga('webkit', { wersja: null })]);
    expect(r.kod).toBe(2);
    expect(r.wyjscie).toContain('żaden z wybranych silników');
    // silnik dodatkowy, którego nie ma (jsc na Linuksie), też nie daje „zgodności”
    const dodatkowy = await bramka([noga('jsc', { docelowa: false, wersja: null })]);
    expect(dodatkowy.kod).toBe(2);
  });

  it('świat inny w jednym silniku to 1, a z --bez-swiata liczą się tylko skróty stanu', async () => {
    const swiat = (id: string) => (id === 'chromium' ? { swiat: 'INNY' } : {});
    const z = await bramka(wszystkie(swiat));
    expect(z.kod).toBe(1);
    expect(z.wyjscie).toContain('ROZBIEŻNOŚĆ ŚWIATA');
    const bez = await bramka(wszystkie(swiat), { bezSwiata: true });
    expect(bez.kod).toBe(0);
    expect(bez.wyjscie).not.toContain('świat ');
  });

  it('przy rozbieżności nagrywa wywołania Math i wskazuje pierwsze różne: funkcja, argumenty i wyniki', async () => {
    const r = await bramka(
      [
        noga('node24', { nagranie: [['hypot', [3, 4], 5]] }),
        noga('jsc', {
          docelowa: false,
          skroty: () => ['s0', 'INNY', 's2'],
          nagranie: [['hypot', [3, 4], 5.000000000000001]],
        }),
      ],
      {},
    );
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('RÓŻNICA w wywołaniu nr 0');
    expect(r.wyjscie).toContain('hypot(3, 4) = 5');
    expect(r.wyjscie).toContain('5.000000000000001');
  });

  it('zamyka każdą nogę, także po błędzie i po rozbieżności', async () => {
    const nogi = wszystkie((id) => (id === 'webkit' ? { blad: 'padł' } : {}));
    await bramka(nogi);
    for (const n of nogi) expect((n as ReturnType<typeof noga>).zamknieta, n.id).toBe(true);
  });
});
