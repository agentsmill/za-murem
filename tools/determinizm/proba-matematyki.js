/* Mikro-próba silnika JS: czy ** i Math.hypot dają to, co mnożenie i sqrt, na liczbach z gry. Skrypt bez importów i bez
   zależności od DOM, więc idzie w każdym silniku; wypisuje JSON z licznikami (w przeglądarce zostawia je w
   `globalThis.wynikProbyMatematyki`):
     node tools/determinizm/proba-matematyki.js
     /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tools/determinizm/proba-matematyki.js
   Stan gry stoi na kratce (pionki na środkach kafelków), więc odległości liczymy z różnic połówek całkowitych w ±200.
   kwadrat_*: ile razy x ** 2 różni się od x * x (kratka i losowe liczby); pow2_kratka to samo dla Math.pow(x, 2).
   hypot_*_rozne_od_sqrt: ile razy Math.hypot(a, b) różni się od Math.sqrt(a * a + b * b).
   hypot_na_progu: ile odległości na kratce jest dokładnie liczbą całkowitą (trójki pitagorejskie, osie), a sqrt_progowe:
   w ilu z nich Math.hypot nie zwraca tej liczby, czyli porównanie `hypot(…) <= próg` w tym silniku daje fałsz tam, gdzie
   dokładna arytmetyka daje prawdę. Wyniki z 19.10.2026: docs/ocena/determinizm-silnikow.md. */
const probaMatematyki = () => {
  const mulberry = (ziarno) => () => {
    ziarno = (ziarno + 0x6d2b79f5) | 0;
    let t = Math.imul(ziarno ^ (ziarno >>> 15), 1 | ziarno);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const los = mulberry(12345);
  const N = 2000000;
  const wynik = {
    N,
    kwadrat_kratka: 0,
    kwadrat_los: 0,
    pow2_kratka: 0,
    hypot_kratka_rozne_od_sqrt: 0,
    hypot_los_rozne_od_sqrt: 0,
    hypot_na_progu: 0,
    sqrt_progowe: 0,
  };
  for (let i = 0; i < N; i++) {
    const dx = Math.round(los() * 800 - 400) / 2;
    const dy = Math.round(los() * 800 - 400) / 2;
    const suma = dx * dx + dy * dy;
    if (dx ** 2 !== dx * dx) wynik.kwadrat_kratka++;
    if (dx ** 2 !== dx * dx) wynik.pow2_kratka++;
    const h = Math.hypot(dx, dy);
    const pierwiastek = Math.sqrt(suma);
    if (h !== pierwiastek) wynik.hypot_kratka_rozne_od_sqrt++;
    const calkowita = Math.round(pierwiastek);
    if (calkowita * calkowita === suma) {
      wynik.hypot_na_progu++;
      if (h !== calkowita) wynik.sqrt_progowe++;
    }
    const a = los() * 100 - 50;
    const b = los() * 100 - 50;
    if (a ** 2 !== a * a) wynik.kwadrat_los++;
    if (Math.hypot(a, b) !== Math.sqrt(a * a + b * b)) wynik.hypot_los_rozne_od_sqrt++;
  }
  return wynik;
};

const wynik = probaMatematyki();
globalThis.wynikProbyMatematyki = wynik;
if (typeof document === 'undefined') {
  const wypisz = typeof print === 'function' ? print : console.log;
  wypisz(JSON.stringify(wynik));
}
