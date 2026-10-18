import { describe, expect, it } from 'vitest';
import type {
  KierunkiLudzi,
  KlatkaLudzi,
  LudzieGrafika,
  OpisGrafiki,
  PostacLudzi,
} from '../../src/render/art/pixellab.ts';
import { LudziePixellab } from '../../src/render/ludziePixellab.ts';
import type { PoseView } from '../../src/render/poses.ts';
import { type Atlas, atlasy } from '../../tools/atlasy.ts';

const wynik = atlasy();
const opisAtlasu = (wynik.get('grafika.json') as OpisGrafiki).ludzie;
const atlasLudzi = wynik.get(opisAtlasu.plik) as Atlas;
/** prawdziwy atlas ludzi jako obraz gry */
const prawdziwy: LudzieGrafika = {
  opis: opisAtlasu,
  img: { w: atlasLudzi.w, h: atlasLudzi.h, px: new Uint32Array(atlasLudzi.rgba.buffer.slice(0)) },
};
/** atlas 16×16 do sztucznych obsad (bez klatek, które trzeba czytać) */
const sztuczny = (opis: LudzieGrafika['opis']): LudzieGrafika => ({
  opis,
  img: { w: 16, h: 16, px: new Uint32Array(256) },
});

const klatki = (x: number, n = 4): KlatkaLudzi[] => Array.from({ length: n }, (_, i) => [x + i * 3, 1, 3, 5, 1, 4]);
/** postać z samą sztucznie złożoną animacją: wschód to odbicie zachodu (numer 2) */
function postac(id: string, zarzad: boolean, plec: 'm' | 'k', wiek: [number, number], kier?: KierunkiLudzi) {
  const k = kier ?? [klatki(0), klatki(20), klatki(40), 2];
  return {
    id,
    co: id,
    zarzad,
    plec,
    wiek,
    animacje: { chod: { kierunki: k }, stanie: { kierunki: k } },
    przemalowanie: { kolory: [] },
  } as unknown as PostacLudzi;
}
const obsada = (...p: PostacLudzi[]): LudzieGrafika['opis'] => ({
  plik: 'x.png',
  regiony: { mieszkancy: [0, 0], zarzad: [0, 0] },
  postacie: p,
  rampy: {},
});

const poza = (over: Partial<PoseView> = {}): PoseView => ({ pose: 'walk', dir: 0, frame: 0, ...over });

describe('postać pionka (płeć i wiek osoby z gry)', () => {
  // prawdziwa obsada z płcią i wiekiem z manifestu, każda postać z chodem i staniem (dane animacji udają komplet)
  const komplet = opisAtlasu.postacie.map((p) => ({
    ...p,
    animacje: {
      chod: { kierunki: [klatki(0), klatki(20), klatki(40), 2] },
      stanie: { kierunki: [klatki(0), klatki(20), klatki(40), 2] },
    },
  })) as PostacLudzi[];
  const l = new LudziePixellab(sztuczny(obsada(...komplet)));
  const id = (p: PostacLudzi | null) => p?.id.replace('kotwica-', '');

  it('zarząd gra postać zarządu o płci i wieku osoby, mieszkaniec postać z mieszkańców', () => {
    const osoby = [
      { f: false, age: 70 },
      { f: true, age: 30 },
      { f: true, age: 8 },
    ];
    expect(id(l.postacPionka({ id: 1, kind: 'core', person: 0, look: 0 }, osoby))).toBe('emeryt');
    expect(id(l.postacPionka({ id: 2, kind: 'core', person: 1, look: 1 }, osoby))).toBe('mloda');
    expect(id(l.postacPionka({ id: 3, kind: 'sasiad', person: 2, look: 9 }, osoby))).toBe('dziewczynka');
  });

  it('postać osoby bez pionka (dla zwłok członka zarządu) to ta sama, którą gra pionek z tą osobą', () => {
    const osoby = [
      { f: false, age: 70 },
      { f: true, age: 30 },
      { f: true, age: 8 },
    ];
    for (let k = 0; k < osoby.length; k++) {
      expect(l.postacOsoby(k, osoby, true), `zarząd ${k}`).toBe(
        l.postacPionka({ id: 500 + k, kind: 'core', person: k, look: k }, osoby),
      );
      expect(l.postacOsoby(k, osoby, false), `mieszkaniec ${k}`).toBe(
        l.postacPionka({ id: 600 + k, kind: 'sasiad', person: k, look: k }, osoby),
      );
    }
    // poza listą osób i bez postaci w tej grupie obsady: nikt
    expect(l.postacOsoby(9, osoby, true)).toBeNull();
    expect(l.postacOsoby(-1, osoby, false)).toBeNull();
    const tylkoMieszkancy = new LudziePixellab(sztuczny(obsada(postac('b', false, 'm', [0, 100]))));
    expect(tylkoMieszkancy.postacOsoby(0, osoby, true)).toBeNull();
    expect(tylkoMieszkancy.postacOsoby(0, osoby, false)?.id).toBe('b');
  });

  it('ta sama osoba w innym pionku i ten sam pionek drugi raz dają tę samą postać', () => {
    const osoby = [{ f: true, age: 50 }];
    const a = l.postacPionka({ id: 10, kind: 'sasiad', person: 0, look: 4 }, osoby);
    expect(l.postacPionka({ id: 10, kind: 'sasiad', person: 0, look: 4 }, osoby)).toBe(a);
    expect(l.postacPionka({ id: 11, kind: 'resident', person: 0, look: 5 }, osoby)).toBe(a);
    expect(a?.zarzad).toBe(false);
  });

  it('pionek bez osoby dostaje dorosłego mieszkańca po wyglądzie z gry, nigdy postaci zarządu ani dziecka', () => {
    const dorosli = komplet.filter((p) => !p.zarzad && p.wiek[1] >= 16);
    expect(dorosli.length).toBe(komplet.filter((p) => !p.zarzad).length - 2);
    const ids = new Set<string>();
    for (let look = 0; look < 20; look++) {
      const p = l.postacPionka({ id: 100 + look, kind: 'obcy', person: -1, look }, []);
      expect(p?.zarzad).toBe(false);
      expect(p!.wiek[1], p!.id).toBeGreaterThanOrEqual(16);
      ids.add(p!.id);
    }
    // szabrownicy (wygląd 16 do 19) i reszta też, a kolejne wyglądy przechodzą przez wszystkich dorosłych
    expect(ids.size).toBe(dorosli.length);
  });

  it('bez postaci w obsadzie (albo bez chodu i stania) pionek zostaje z kodu', () => {
    const bezAnimacji = { ...postac('a', false, 'm', [0, 100]), animacje: {} } as PostacLudzi;
    const puste = new LudziePixellab(sztuczny(obsada(bezAnimacji)));
    expect(puste.postacPionka({ id: 1, kind: 'obcy', person: -1, look: 3 }, [])).toBeNull();
    expect(puste.postacPionka({ id: 2, kind: 'core', person: 0, look: 0 }, [{ f: false, age: 30 }])).toBeNull();
    const tylkoMieszkancy = new LudziePixellab(sztuczny(obsada(postac('b', false, 'm', [0, 100]))));
    expect(
      tylkoMieszkancy.postacPionka({ id: 3, kind: 'core', person: 0, look: 0 }, [{ f: false, age: 30 }]),
    ).toBeNull();
    expect(
      tylkoMieszkancy.postacPionka({ id: 4, kind: 'sasiad', person: 0, look: 0 }, [{ f: true, age: 30 }])?.id,
    ).toBe('b');
  });
});

describe('klatka pozy postaci', () => {
  const p = postac('x', false, 'm', [0, 100]);
  const l = new LudziePixellab(sztuczny(obsada(p)));

  it('klatka to prostokąt z atlasu, a stopy leżą w punkcie z opisu', () => {
    const k = l.klatka(p, poza({ dir: 1, frame: 2 }), true, 0)!;
    expect([k.x, k.y, k.w, k.h]).toEqual([20 + 2 * 3, 1, 3, 5]);
    expect([k.ax, k.ay, k.flip, k.wersja, k.zarzad, k.zastepcza]).toEqual([1, 4, false, 0, false, false]);
  });

  it('wschód bez własnych klatek to odbity zachód, wschód z własnymi klatkami nie jest odbity', () => {
    // klatka() oddaje jeden współdzielony obiekt, więc wyniki kopiujemy przed następnym wywołaniem
    const wschod = { ...l.klatka(p, poza({ dir: 3, frame: 1 }), true, 0)! };
    expect(wschod.x).toBe(40 + 1 * 3);
    expect(wschod.flip).toBe(true);
    const zachod = { ...l.klatka(p, poza({ dir: 2, frame: 1 }), true, 0)! };
    expect(zachod.x).toBe(wschod.x);
    expect(zachod.flip).toBe(false);
    const wlasny = postac('y', false, 'm', [0, 100], [klatki(0), klatki(20), klatki(40), klatki(60)]);
    const k = new LudziePixellab(sztuczny(obsada(wlasny))).klatka(wlasny, poza({ dir: 3 }), true, 0)!;
    expect([k.x, k.flip]).toEqual([60, false]);
  });

  it('stojący pionek gra stanie, idący chód', () => {
    const stanie = postac('s', false, 'm', [0, 100]);
    stanie.animacje.stanie = { kierunki: [klatki(100), klatki(120), klatki(140), 2] };
    const lw = new LudziePixellab(sztuczny(obsada(stanie)));
    expect(lw.klatka(stanie, poza(), true, 0)!.x).toBe(0);
    expect(lw.klatka(stanie, poza(), false, 0)!.x).toBe(100);
  });

  it('praca, której postać nie ma, daje null (rysuje kod); ciosu i celowania brak zastępuje stanie', () => {
    expect(l.klatka(p, poza({ pose: 'chop' }), false, 0)).toBeNull();
    expect(l.klatka(p, poza({ pose: 'sit' }), false, 0)).toBeNull();
    // mieszkaniec bez ciosu (zbir, napadnięty handlarz) nie zmienia stylu na kod: stoi w swojej postaci
    for (const pose of ['swing', 'aim'] as const) {
      const k = l.klatka(p, poza({ pose, dir: 1, frame: 1 }), false, 0)!;
      expect(k.zastepcza, pose).toBe(true);
      expect([k.x, k.y]).toEqual([20, 1]);
    }
    // a zwykła klatka nie jest zastępcza
    expect(l.klatka(p, poza(), false, 0)!.zastepcza).toBe(false);
  });

  it('każda klatka prawdziwej obsady leży w atlasie, dla każdej pracy, kierunku i klatki z gry', () => {
    const lp = new LudziePixellab(prawdziwy);
    let ile = 0;
    for (const post of opisAtlasu.postacie)
      for (const pose of [
        'walk',
        'carry',
        'chop',
        'crouch',
        'cook',
        'sit',
        'guard',
        'swing',
        'aim',
        'search',
        'hammer',
        'planks',
        'scrap',
        'doze',
      ] as const)
        for (let dir = 0; dir < 4; dir++)
          for (let frame = 0; frame < 4; frame++)
            for (const idzie of [true, false]) {
              const k = lp.klatka(post, poza({ pose, dir, frame }), idzie, frame * 0.7);
              if (!k) continue;
              ile++;
              expect(k.x + k.w).toBeLessThanOrEqual(2048);
              expect(k.ax).toBeGreaterThanOrEqual(0);
              expect(k.ax).toBeLessThanOrEqual(k.w);
              expect(k.ay).toBeGreaterThan(0);
            }
    expect(ile).toBeGreaterThan(100);
  });
});

describe('wersje kolorystyczne postaci (przemalowane ubrania)', () => {
  const l = new LudziePixellab(prawdziwy);
  const ramp = Object.keys(opisAtlasu.rampy).length;
  const core = (id: number, person: number) => ({ id, kind: 'core', person, look: person });

  it('mieszkańcy dostają wszystkie wersje (oryginał i po jednej na rampę), ten sam pionek zawsze tę samą', () => {
    const widziane = new Set<number>();
    for (let id = 1; id <= 200; id++) {
      const p = { id, kind: 'sasiad', person: id, look: id % 16 };
      const postac = l.postacPionka(
        p,
        Array.from({ length: 201 }, () => ({ f: false, age: 30 })),
      )!;
      const w = l.wersjaPionka(p, postac);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(ramp);
      expect(l.wersjaPionka(p, postac)).toBe(w);
      widziane.add(w);
    }
    expect([...widziane].sort()).toEqual(Array.from({ length: ramp + 1 }, (_, i) => i));
  });

  it('zarząd: pierwszy z danej postaci (wg numeru osoby) ma oryginał, kolejni z tej samej postaci różne przemalowane wersje', () => {
    const osoby = [
      { f: false, age: 70 },
      { f: false, age: 80 },
      { f: false, age: 65 },
      { f: true, age: 30 },
    ];
    const pionki = osoby.map((_, k) => core(1000 + k, k));
    l.przypiszZarzad(pionki, osoby);
    const w = pionki.map((p) => l.wersjaPionka(p, l.postacPionka(p, osoby)!));
    // trzech starszych mężczyzn to ten sam emeryt: oryginał i dwie różne przemalowane wersje, młoda kobieta jest sama
    expect(w[0]).toBe(0);
    expect(w[1]).toBeGreaterThan(0);
    expect(w[2]).toBeGreaterThan(0);
    expect(new Set(w.slice(0, 3)).size).toBe(3);
    expect(w[3]).toBe(0);
  });

  it('wersja zarządu nie zależy od kolejności pytań ani od zapomnienia pionka (wyprawa), tylko od składu zarządu', () => {
    const osoby = [
      { f: false, age: 70 },
      { f: false, age: 80 },
      { f: true, age: 30 },
    ];
    const pionki = osoby.map((_, k) => core(3000 + k, k));
    const pytaj = (kolej: number[]) => {
      const lw = new LudziePixellab(prawdziwy);
      lw.przypiszZarzad(pionki, osoby);
      const wynik: number[] = [];
      for (const k of kolej) wynik[k] = lw.wersjaPionka(pionki[k], lw.postacPionka(pionki[k], osoby)!);
      return { lw, wynik };
    };
    const a = pytaj([0, 1, 2]);
    expect(pytaj([2, 1, 0]).wynik).toEqual(a.wynik);
    // pionek wraca z wyprawy: widok go zapomina, a po powrocie ma tę samą wersję (i inni też)
    a.lw.zapomnij(pionki[1].id);
    a.lw.zapomnij(pionki[0].id);
    a.lw.przypiszZarzad(pionki, osoby);
    expect(pionki.map((p) => a.lw.wersjaPionka(p, a.lw.postacPionka(p, osoby)!))).toEqual(a.wynik);
    // zmarł pierwszy emeryt: drugi staje się pierwszym z tej postaci i wraca do oryginału
    a.lw.przypiszZarzad(pionki.slice(1), osoby);
    expect(a.lw.wersjaPionka(pionki[1], a.lw.postacPionka(pionki[1], osoby)!)).toBe(0);
  });

  it('drugi egzemplarz granatowej postaci zarządu nie dostaje wersji granat (byłby jego kopią)', () => {
    const osoby = [
      { f: false, age: 30 },
      { f: false, age: 40 },
    ];
    const pionki = osoby.map((_, k) => core(2000 + k, k));
    l.przypiszZarzad(pionki, osoby);
    const w = pionki.map((p) => l.wersjaPionka(p, l.postacPionka(p, osoby)!));
    const nazwy = Object.keys(opisAtlasu.rampy);
    expect(w[0]).toBe(0);
    expect(w[1]).toBeGreaterThan(0);
    expect(nazwy[w[1] - 1]).not.toBe('granat');
  });

  it('piksele wersji to ten sam pas atlasu z innymi kolorami ubrania, a poza ubraniem bez zmian', () => {
    const post = opisAtlasu.postacie.find((q) => q.id === 'kotwica-kibic')!;
    const baza = { ...l.klatka(post, poza({ dir: 0, frame: 1 }), true, 0, 0)! };
    const wersja = { ...l.klatka(post, poza({ dir: 0, frame: 1 }), true, 0, 2)! };
    expect([wersja.wersja, wersja.zarzad]).toEqual([2, false]);
    expect([wersja.w, wersja.h, wersja.ax, wersja.ay, wersja.x, wersja.y]).toEqual([
      baza.w,
      baza.h,
      baza.ax,
      baza.ay,
      baza.x,
      baza.y,
    ]);
    const { px, w: szer, h } = l.pikseleWersji(false, 2);
    expect(szer).toBe(prawdziwy.img.w);
    expect(h).toBe(opisAtlasu.regiony.mieszkancy[1] - opisAtlasu.regiony.mieszkancy[0]);
    expect(l.pikseleWersji(false, 2).px).toBe(px);
    let rozne = 0;
    let razem = 0;
    for (let r = 0; r < baza.h; r++)
      for (let c = 0; c < baza.w; c++) {
        const a = prawdziwy.img.px[(baza.y + r) * szer + baza.x + c];
        const b = px[(wersja.y + r) * szer + wersja.x + c];
        expect(a >>> 24).toBe(b >>> 24);
        if (a >>> 24) razem++;
        if (a !== b) rozne++;
      }
    expect(rozne).toBeGreaterThan(20);
    expect(rozne).toBeLessThan(razem);
  });

  it('wersja zarządu leży w swoim pasie atlasu, współrzędne klatki przesunięte o początek pasa', () => {
    const post = opisAtlasu.postacie.find((q) => q.id === 'kotwica-emeryt')!;
    const pv = poza({ dir: 1, frame: 0 });
    const baza = { ...l.klatka(post, pv, true, 0, 0)! };
    expect(baza.y).toBeGreaterThanOrEqual(opisAtlasu.regiony.zarzad[0]);
    const wersja = l.klatka(post, pv, true, 0, 1)!;
    expect([wersja.y, wersja.x, wersja.zarzad, wersja.wersja]).toEqual([
      baza.y - opisAtlasu.regiony.zarzad[0],
      baza.x,
      true,
      1,
    ]);
    expect(l.pikseleWersji(true, 1).h).toBe(opisAtlasu.regiony.zarzad[1] - opisAtlasu.regiony.zarzad[0]);
  });

  it('postać bez ubrania do przemalowania (czarny strój) ma wszystkie wersje takie same jak oryginał', () => {
    const ochroniarz = opisAtlasu.postacie.find((q) => q.id === 'kotwica-ochroniarz')!;
    const baza = { ...l.klatka(ochroniarz, poza(), true, 0, 0)! };
    const w3 = l.klatka(ochroniarz, poza(), true, 0, 3)!;
    expect([w3.wersja, w3.x, w3.y]).toEqual([0, baza.x, baza.y]);
  });
});

describe('leżenie i zwłoki postaci (komórki z klatki stania przodem)', () => {
  const GLOWA = 0xffcc6633;
  const GLOWA_DRUGIEJ = 0xff000099;
  const TULOW = 0xff44aa44;
  const ile = (px: ArrayLike<number>, kolor: number) => Array.from(px).filter((p) => p === kolor).length;
  /** atlas 64 × 64 z dwiema klatkami stania przodem 8 × 12 w (5, 7) i (30, 7): głowa 4 wiersze, reszta tułów */
  function zSylwetka(): { lw: LudziePixellab; p: PostacLudzi } {
    const img = { w: 64, h: 64, px: new Uint32Array(64 * 64) };
    for (const x0 of [5, 30])
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 8; x++) img.px[(7 + y) * 64 + x0 + x] = y < 4 ? (x0 === 5 ? GLOWA : GLOWA_DRUGIEJ) : TULOW;
    const p = postac(
      's',
      false,
      'm',
      [0, 100],
      [
        [
          [5, 7, 8, 12, 4, 12],
          [30, 7, 8, 12, 4, 12],
        ],
        klatki(20),
        klatki(40),
        2,
      ],
    );
    return { lw: new LudziePixellab({ opis: obsada(p), img }), p };
  }

  it('komórka powstaje z pierwszej klatki stania przodem (kierunek 0) i ma środek głowy na głowie', () => {
    const { lw, p } = zSylwetka();
    for (const rodzaj of ['floor', 'bed'] as const)
      for (let o = 0; o < 4; o++) {
        const k = lw.lezenie(p, 0, o, rodzaj)!;
        expect(ile(k.px, GLOWA_DRUGIEJ), `${rodzaj} ${o}`).toBe(0);
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ])
          expect(k.px[(k.hy + dy) * k.w + k.hx + dx], `${rodzaj} ${o} ${dx},${dy}`).toBe(GLOWA);
      }
    const podloga = lw.lezenie(p, 0, 0, 'floor')!;
    expect([ile(podloga.px, GLOWA), ile(podloga.px, TULOW)]).toEqual([8 * 4, 8 * 8]);
  });

  it('ta sama komórka drugi raz to ten sam obiekt, a strona głowy liczy się modulo 4', () => {
    const { lw, p } = zSylwetka();
    const a = lw.lezenie(p, 0, 1, 'bed')!;
    expect(lw.lezenie(p, 0, 1, 'bed')).toBe(a);
    expect(lw.lezenie(p, 0, 5, 'bed')).toBe(a);
    expect(lw.lezenie(p, 0, 2, 'bed')).not.toBe(a);
    expect(lw.lezenie(p, 0, 1, 'floor')).not.toBe(a);
  });

  it('na podłodze leży się poziomo (głową do góry wyglądałby jak stojący), w łóżku strona głowy zostaje z łóżka', () => {
    const { lw, p } = zSylwetka();
    // strona głowy: 1 prawo, 3 lewo; góra i dół schodzą na poziomo
    expect(lw.lezenie(p, 0, 0, 'floor')).toBe(lw.lezenie(p, 0, 1, 'floor'));
    expect(lw.lezenie(p, 0, 2, 'floor')).toBe(lw.lezenie(p, 0, 3, 'floor'));
    expect(lw.lezenie(p, 0, 1, 'floor')).not.toBe(lw.lezenie(p, 0, 3, 'floor'));
    for (let o = 0; o < 4; o++) {
      const k = lw.lezenie(p, 0, o, 'floor')!;
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < k.px.length; i++)
        if (k.px[i] === GLOWA) {
          n++;
          sx += (i % k.w) + 0.5;
          sy += Math.floor(i / k.w) + 0.5;
        }
      // głowa jest z lewej albo z prawej strony środka, nie nad nim ani pod nim
      expect(Math.abs(sx / n - k.w / 2), `${o}`).toBeGreaterThan(Math.abs(sy / n - k.h / 2) + 2);
    }
    expect(lw.lezenie(p, 0, 0, 'bed')).not.toBe(lw.lezenie(p, 0, 1, 'bed'));
    expect(lw.lezenie(p, 0, 2, 'bed')).not.toBe(lw.lezenie(p, 0, 3, 'bed'));
  });

  it('postać bez klatek stania przodem nie ma leżenia (rysuje je kod)', () => {
    const { lw, p } = zSylwetka();
    const odbita = { ...p, animacje: { chod: p.animacje.chod, stanie: { kierunki: [2, klatki(20), klatki(40), 2] } } };
    expect(lw.lezenie(odbita as PostacLudzi, 0, 0, 'floor')).toBeNull();
    const bezStania = { ...p, animacje: { chod: p.animacje.chod } };
    expect(lw.lezenie(bezStania as PostacLudzi, 0, 0, 'floor')).toBeNull();
  });

  const lp = new LudziePixellab(prawdziwy);
  const klatkaStania = (post: PostacLudzi) => (post.animacje.stanie.kierunki[0] as KlatkaLudzi[])[0];
  const widoczne = (post: PostacLudzi) => {
    const [x, y, w, h] = klatkaStania(post);
    let n = 0;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) if (prawdziwy.img.px[(y + r) * prawdziwy.img.w + x + c] >>> 24) n++;
    return n;
  };

  it('każda postać prawdziwej obsady ma komórki leżenia, w których cała sylwetka jest na podłodze, a głowa w łóżku', () => {
    for (const post of opisAtlasu.postacie)
      for (let o = 0; o < 4; o++) {
        const podloga = lp.lezenie(post, 0, o, 'floor')!;
        expect(podloga.w, `${post.id} ${o}`).toBe(podloga.h);
        expect(Array.from(podloga.px).filter((q) => q >>> 24 === 255).length, `${post.id} ${o}`).toBe(widoczne(post));
        const lozko = lp.lezenie(post, 0, o, 'bed')!;
        const naGlowie = [-1, 0].flatMap((dy) =>
          [-1, 0].map((dx) => lozko.px[(lozko.hy + dy) * lozko.w + lozko.hx + dx]),
        );
        expect(
          naGlowie.every((q) => q >>> 24 === 255),
          `${post.id} ${o}`,
        ).toBe(true);
      }
  });

  it('wersja kolorystyczna przemalowuje ubranie w komórce (też zarządu), a widoczne piksele zostają te same', () => {
    for (const id of ['kotwica-kibic', 'kotwica-emeryt']) {
      const post = opisAtlasu.postacie.find((q) => q.id === id)!;
      const baza = lp.lezenie(post, 0, 1, 'floor')!;
      const inna = lp.lezenie(post, 2, 1, 'floor')!;
      expect(inna, id).not.toBe(baza);
      let rozne = 0;
      for (let i = 0; i < baza.px.length; i++) {
        expect(inna.px[i] >>> 24, id).toBe(baza.px[i] >>> 24);
        if (inna.px[i] !== baza.px[i]) rozne++;
      }
      expect(rozne, id).toBeGreaterThan(20);
    }
  });

  it('postać bez ubrania do przemalowania ma wszystkie wersje leżenia takie same jak oryginał', () => {
    const ochroniarz = opisAtlasu.postacie.find((q) => q.id === 'kotwica-ochroniarz')!;
    expect(lp.lezenie(ochroniarz, 3, 0, 'floor')).toBe(lp.lezenie(ochroniarz, 0, 0, 'floor'));
  });

  it('zwłoki dostają dorosłego mieszkańca po wyglądzie z gry, a bez mieszkańców w obsadzie nikogo', () => {
    const ids = new Set<string>();
    for (let look = 0; look < 30; look++) {
      const post = lp.postacZwlok(look)!;
      expect(post.zarzad).toBe(false);
      expect(post.wiek[1]).toBeGreaterThanOrEqual(16);
      expect(lp.postacZwlok(look)).toBe(post);
      ids.add(post.id);
    }
    expect(ids.size).toBeGreaterThan(10);
    const tylkoZarzad = new LudziePixellab(sztuczny(obsada(postac('z', true, 'm', [0, 100]))));
    expect(tylkoZarzad.postacZwlok(0)).toBeNull();
  });
});
