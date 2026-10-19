/* Próba poprawki determinizmu: odległość, atan2, sinus i cosinus liczone samymi działaniami IEEE 754 (dodawanie,
   mnożenie, dzielenie, sqrt), które w każdym silniku JS dają ten sam wynik bit w bit, w odróżnieniu od Math.hypot,
   Math.atan2, Math.sin i Math.cos (funkcje przestępne i hypot nie mają dokładnie zadanego wyniku, więc V8 w Node, V8
   w Chromium i JavaScriptCore różnią się o ostatni bit; pomiar: docs/ocena/determinizm-silnikow.md). To prototyp
   modułu src/core/mat.ts z listy poprawek (etap 0 nie zmienia src/): pozwala sprawdzić, czy łatka naprawdę zgadza
   silniki (`npm run determinizm -- --latka=mat` podmienia nim Math w każdej nodze) i ile zmienia w grze.

   - hyp(dx, dy) = sqrt(dx² + dy²): dokładne tam, gdzie wynik jest liczbą całkowitą (na kratce gry), tak jak JavaScriptCore.
   - sinus i cosinus: redukcja do [−π/4, π/4] (stałe Cody'ego–Waite'a z fdlibm, dokładna dla |x| < 2^20), potem wielomiany
     minimax z fdlibm (S1–S6, C1–C6); poza tym zakresem wołają Math.sin i Math.cos.
   - atan i atan2: algorytm fdlibm (redukcja do pięciu przedziałów, atanhi, atanlo, aT), wielomian na samych działaniach.
   Błąd względem Math.* na losowych argumentach to najwyżej kilka ostatnich bitów (test), ale co ważniejsze: wynik jest ten
   sam w każdym silniku, bo kod jest zwykłą arytmetyką JS. Funkcje są czyste i nie czytają niczego poza argumentami.

   zainstaluj() podmienia Math.hypot, Math.atan2, Math.sin i Math.cos (dla dwóch argumentów hypot) i zwraca funkcję
   przywracającą oryginały. */

const PIO2_1 = 1.5707963267341256;
const PIO2_1T = 6.077100506506192e-11;
const INVPIO2 = 6.366197723675814e-1;

const S1 = -0.16666666666666632;
const S2 = 0.00833333333332249;
const S3 = -0.0001984126982985795;
const S4 = 0.0000027557313707070068;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;

const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 0.00002480158728947673;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

const ATAN_HI = [0.4636476090008061, 0.7853981633974483, 0.982793723247329, 1.5707963267948966];
const ATAN_LO = [2.2698777452961687e-17, 3.061616997868383e-17, 1.3903311031230998e-17, 6.123233995736766e-17];
const A_T = [
  0.3333333333333293, -0.19999999999876483, 0.14285714272503466, -0.11111110405462356, 0.09090887133436507,
  -0.0769187620504483, 0.06661073137387531, -0.058335701337905735, 0.049768779946159324, -0.036531572744216916,
  0.016285820115365782,
];
const PI_O_2 = 1.5707963267948966;
const PI = Math.PI;
const PI_LO = 1.2246467991473532e-16;

/** |x| powyżej tego wołamy Math.sin i Math.cos: redukcja trzema stałymi nie jest tam dokładna */
const MAKS_ARGUMENT = 2 ** 20;

/** odległość z samych działań IEEE: dx*dx + dy*dy jest dokładne dla liczb z kratki gry, a sqrt zaokrągla poprawnie */
export const hyp = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

/** sinus na [−π/4, π/4] (jądro fdlibm bez ogona) */
function sinJadro(x: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * S4) + z * z * z * (S5 + z * S6);
  return x + v * (S1 + z * r);
}

/** cosinus na [−π/4, π/4] (jądro fdlibm bez ogona) */
function cosJadro(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1 - (0.5 * z - z * r);
}

/** x = n·π/2 + r, |r| ≤ π/4 (n całkowite); dokładne dla |x| < 2^20 */
function zredukuj(x: number): { n: number; r: number } {
  const n = Math.round(x * INVPIO2);
  return { n, r: x - n * PIO2_1 - n * PIO2_1T };
}

export function sinD(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= MAKS_ARGUMENT) return Math.sin(x);
  if (Math.abs(x) < 2 ** -26) return x;
  const { n, r } = zredukuj(x);
  switch (((n % 4) + 4) % 4) {
    case 0:
      return sinJadro(r);
    case 1:
      return cosJadro(r);
    case 2:
      return -sinJadro(r);
    default:
      return -cosJadro(r);
  }
}

export function cosD(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= MAKS_ARGUMENT) return Math.cos(x);
  const { n, r } = zredukuj(x);
  switch (((n % 4) + 4) % 4) {
    case 0:
      return cosJadro(r);
    case 1:
      return -sinJadro(r);
    case 2:
      return -cosJadro(r);
    default:
      return sinJadro(r);
  }
}

/** arcus tangens, algorytm fdlibm (s_atan.c) */
export function atanD(x: number): number {
  if (Number.isNaN(x)) return x;
  const znak = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax >= 2 ** 66) return znak * (ATAN_HI[3] + ATAN_LO[3]);
  let id: number;
  let t: number;
  if (ax < 0.4375) {
    if (ax < 2 ** -27) return x;
    id = -1;
    t = ax;
  } else if (ax < 1.1875) {
    if (ax < 0.6875) {
      id = 0;
      t = (2 * ax - 1) / (2 + ax);
    } else {
      id = 1;
      t = (ax - 1) / (ax + 1);
    }
  } else if (ax < 2.4375) {
    id = 2;
    t = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    id = 3;
    t = -1 / ax;
  }
  const z = t * t;
  const w = z * z;
  const s1 = z * (A_T[0] + w * (A_T[2] + w * (A_T[4] + w * (A_T[6] + w * (A_T[8] + w * A_T[10])))));
  const s2 = w * (A_T[1] + w * (A_T[3] + w * (A_T[5] + w * (A_T[7] + w * A_T[9]))));
  if (id < 0) return znak * (t - t * (s1 + s2));
  const wynik = ATAN_HI[id] - (t * (s1 + s2) - ATAN_LO[id] - t);
  return znak * wynik;
}

/** atan2(y, x), algorytm fdlibm (e_atan2.c); wartości szczególne (NaN, ±∞) zostawia Math.atan2 */
export function atan2D(y: number, x: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Math.atan2(y, x);
  const ujemneY = y < 0 || Object.is(y, -0);
  const ujemneX = x < 0 || Object.is(x, -0);
  if (y === 0) {
    if (!ujemneX) return y;
    return ujemneY ? -PI : PI;
  }
  if (x === 0) return y < 0 ? -PI_O_2 : PI_O_2;
  const ay = Math.abs(y);
  const ax = Math.abs(x);
  let z: number;
  if (ay > ax * 2 ** 60) z = PI_O_2 + 0.5 * PI_LO;
  else if (ujemneX && ay < ax * 2 ** -60) z = 0;
  else z = atanD(ay / ax);
  if (!ujemneX) return ujemneY ? -z : z;
  const wynik = PI - (z - PI_LO);
  return ujemneY ? -wynik : wynik;
}

type FunkcjaMath = (...argumenty: number[]) => number;

/** Podmienia Math.hypot (dla dwóch argumentów), Math.atan2, Math.sin i Math.cos; zwraca funkcję przywracającą oryginały. */
export function zainstaluj(): () => void {
  const m = Math as unknown as Record<string, FunkcjaMath>;
  const oryginaly = { hypot: m.hypot, atan2: m.atan2, sin: m.sin, cos: m.cos };
  m.hypot = (...a: number[]) => (a.length === 2 ? hyp(a[0], a[1]) : oryginaly.hypot.apply(Math, a));
  m.atan2 = (y: number, x: number) => atan2D(y, x);
  m.sin = (x: number) => sinD(x);
  m.cos = (x: number) => cosD(x);
  return () => {
    m.hypot = oryginaly.hypot;
    m.atan2 = oryginaly.atan2;
    m.sin = oryginaly.sin;
    m.cos = oryginaly.cos;
  };
}
