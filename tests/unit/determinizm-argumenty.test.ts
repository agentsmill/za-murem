import { describe, expect, it } from 'vitest';
import { BladArgumentow, parsujArgumenty, UZYCIE } from '../../tools/determinizm/argumenty.ts';

const jestDemo = (d: string) => ['przymorze', 'lanciego', 'zielonki'].includes(d);
const parsuj = (...a: string[]) => parsujArgumenty(a, jestDemo);
/** komunikat błędu argumentów (a gdy błędu nie ma albo jest inny, test pada) */
function blad(...a: string[]): string {
  try {
    parsuj(...a);
  } catch (e) {
    if (e instanceof BladArgumentow) return e.message;
    throw e;
  }
  throw new Error(`argumenty ${a.join(' ')} nie dały błędu`);
}

describe('argumenty bramki determinizmu', () => {
  it('bez argumentów: trzy dema, oba tryby, 24 h, ziarno 12345, pełne porównanie', () => {
    const { opcje, json } = parsuj();
    expect(opcje).toEqual({
      godziny: 24,
      dema: ['przymorze', 'lanciego', 'zielonki'],
      tryby: ['zwykly', 'zombie'],
      ziarna: [12345],
      wymuszonaGodzina: null,
      bezSwiata: false,
    });
    expect(json).toBeUndefined();
  });

  it('--zombie albo --zwykly zawęża tryby, oba naraz to oba tryby', () => {
    expect(parsuj('--zombie').opcje.tryby).toEqual(['zombie']);
    expect(parsuj('--zwykly').opcje.tryby).toEqual(['zwykly']);
    expect(parsuj('--zombie', '--zwykly').opcje.tryby).toEqual(['zwykly', 'zombie']);
  });

  it('wszystkie opcje naraz', () => {
    const { opcje, json } = parsuj(
      '--demo=zielonki',
      '--godziny=72',
      '--seed=1,2',
      '--silniki=node24,jsc',
      '--latka=mat',
      '--psuj=jsc:hypot',
      '--nagraj=5',
      '--bez-swiata',
      '--json=/tmp/wynik.json',
    );
    expect(opcje).toEqual({
      godziny: 72,
      dema: ['zielonki'],
      tryby: ['zwykly', 'zombie'],
      ziarna: [1, 2],
      wymuszonaGodzina: 5,
      bezSwiata: true,
      filtr: ['node24', 'jsc'],
      psuj: { silnik: 'jsc', funkcja: 'hypot' },
      latka: 'mat',
    });
    expect(json).toBe('/tmp/wynik.json');
  });

  it('--nagraj bez numeru zostawia domyślne nagrywanie przy rozbieżności', () => {
    expect(parsuj('--nagraj').opcje.wymuszonaGodzina).toBeNull();
    expect(parsuj('--nagraj=0').opcje.wymuszonaGodzina).toBe(0);
  });

  it('odrzuca nieznane argumenty i luźne słowa', () => {
    expect(blad('--cos')).toBe('Nieznany argument: --cos');
    expect(blad('72')).toBe('Nieznany argument: 72');
    expect(blad('-godziny=3')).toBe('Nieznany argument: -godziny=3');
  });

  it('odrzuca flagę z wartością bez wartości i flagę logiczną z wartością (cichy brak skutku byłby gorszy od błędu)', () => {
    expect(blad('--godziny')).toContain('--godziny wymaga wartości');
    expect(blad('--silniki')).toContain('--silniki wymaga wartości');
    expect(blad('--zombie=1')).toContain('--zombie nie przyjmuje wartości');
    expect(blad('--bez-swiata=tak')).toContain('--bez-swiata nie przyjmuje wartości');
  });

  it('odrzuca flagę podaną dwa razy (która z nich miałaby obowiązywać?)', () => {
    expect(blad('--godziny=1', '--godziny=2')).toContain('--godziny podany dwa razy');
    expect(blad('--zombie', '--zombie')).toContain('--zombie podany dwa razy');
  });

  it('nazwa dema z ukośnikiem albo kropkami jest odrzucona, nawet gdy sprawdzenie pliku by ją przepuściło', () => {
    const wszystkoIstnieje = () => true;
    expect(() => parsujArgumenty(['--demo=../../etc/passwd'], wszystkoIstnieje)).toThrow(BladArgumentow);
    expect(() => parsujArgumenty(['--demo=A'], wszystkoIstnieje)).toThrow(BladArgumentow);
    expect(parsujArgumenty(['--demo=nowe-demo2'], wszystkoIstnieje).opcje.dema).toEqual(['nowe-demo2']);
  });

  it('odrzuca złe wartości z komunikatem, co jest dozwolone', () => {
    expect(blad('--godziny=0')).toContain('--godziny to liczba całkowita od 1');
    expect(blad('--godziny=abc')).toContain('„abc”');
    expect(blad('--godziny=1.5')).toContain('--godziny');
    expect(blad('--seed=-1')).toContain('--seed to liczby całkowite od 0');
    expect(blad('--seed=1,x')).toContain('--seed');
    expect(blad('--seed=1,')).toContain('--seed');
    expect(blad('--demo=gdynia')).toContain('Nieznane demo: „gdynia” (są: przymorze, lanciego, zielonki)');
    expect(blad('--demo=../tajne')).toContain('Nieznane demo');
    expect(blad('--silniki=node24,opera')).toContain('Nieznany silnik: „opera”');
    expect(blad('--latka=inna')).toContain('--latka to mat');
    expect(blad('--psuj=jsc:cos2')).toContain('--psuj=silnik:funkcja');
    expect(blad('--psuj=opera:hypot')).toContain('--psuj=silnik:funkcja');
    expect(blad('--psuj=hypot')).toContain('--psuj=silnik:funkcja');
  });

  it('--nagraj=godzina musi mieścić się w przebiegu', () => {
    expect(blad('--godziny=3', '--nagraj=3')).toContain('od 0 do 2');
    expect(blad('--godziny=3', '--nagraj=-1')).toContain('--nagraj');
    expect(blad('--godziny=3', '--nagraj=')).toContain('--nagraj');
  });

  it('użycie wymienia wszystkie flagi i silniki', () => {
    for (const flaga of [
      '--demo',
      '--godziny',
      '--zombie',
      '--zwykly',
      '--seed',
      '--silniki',
      '--json',
      '--nagraj',
      '--psuj',
      '--bez-swiata',
      '--latka',
    ])
      expect(UZYCIE, flaga).toContain(flaga);
    for (const silnik of ['node24', 'chromium', 'firefox', 'webkit', 'jsc']) expect(UZYCIE, silnik).toContain(silnik);
  });
});
