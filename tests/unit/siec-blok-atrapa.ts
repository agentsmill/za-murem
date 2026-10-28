/* Blok #siec („Gra z sąsiadami” na karcie startowej) bez przeglądarki, dla testów GraSieciowa (src/net/gra.ts): każdy
   nowy HTML tworzy nowe, puste pola nicku, hasła i kodu powrotu (jak prawdziwy DOM), a klik woła nasłuch zdarzeń gry
   tak, jakby ktoś kliknął element z data-siec. */

export function atrapaBloku() {
  let html = '';
  let pola: Record<string, { value: string }> = {};
  const sluchacze: Record<string, (e: unknown) => void> = {};
  const el = {
    hidden: true,
    get innerHTML() {
      return html;
    },
    set innerHTML(v: string) {
      html = v;
      pola = { '#scNick': { value: '' }, '#scHaslo': { value: '' }, '#scKod': { value: '' } };
    },
    querySelector: (s: string) => (html.includes(`id="${s.slice(1)}"`) ? (pola[s] ?? null) : null),
    addEventListener: (t: string, f: (e: unknown) => void) => {
      sluchacze[t] = f;
    },
  };
  return {
    el,
    pole: (s: string) => pola[s],
    klik: (siec: string) => sluchacze.click?.({ target: { closest: () => ({ dataset: { siec } }) } }),
  };
}
