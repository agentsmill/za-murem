/* Wiki w grze: DOM i zdarzenia (HTML okna liczy src/ui/wiki.ts, tu tylko podpięcie do `Modal`, pola wyszukiwania i czipów
   górnego paska). Wywołuje to main.ts, który zna grę (pauza, powrót do Menu, „Jak grać”, kontekst miejsca).

   Kontrakt.
   - `utworzWiki(deps)` zwraca `{ otworz, czipy }`. `otworz(art, zMenu)` pokazuje okno: z Menu (`zMenu`) przycisk stopki wraca do
     Menu, z czipa paska zamyka okno i gra rusza dalej (`deps.dismiss`, jak przy innych oknach). Stan okna (wybrany artykuł,
     tekst wyszukiwania) żyje w domknięciu; zmiana języka rysuje okno od nowa z tego samego stanu (`deps.powtorz`).
   - Przejście do artykułu (klik w listę albo w „Zobacz też”) nie rysuje okna od nowa, tylko wymienia treść artykułu i
     zaznaczenie na liście, żeby lista zostawała tam, gdzie była przewinięta. Na telefonie `data-widok` korzenia przełącza
     listę i artykuł (przycisk „Lista” wraca). Pole wyszukiwania przerysowuje samą listę; Enter otwiera pierwszy wynik.
   - `czipy()` raz na życie strony wiąże czipy paska z artykułami po identyfikatorze elementu (`CZIPY`), nie po układzie:
     dopisuje `data-wiki`, `role="button"` i `tabindex`, a jedna obsługa na dokumencie reaguje na klik i na Enter lub spację.
     Kliknięcie myszą zdejmuje fokus z czipa (jak `oddajFokusPoKliknieciu`), żeby spacja dalej zatrzymywała grę. Ten sam
     atrybut `data-wiki="<id artykułu>"` zadziała na każdym elemencie (np. paski potrzeb na karcie osoby). */

import type { Modal } from './okno.ts';
import { artykulHtml, CZIPY, listaHtml, maArtykul, type WikiCtx, type WikiStan, wikiSheet } from './wiki.ts';

export interface WikiDeps {
  modal: Modal;
  /** korzeń okna (`#modal`), do zdarzenia `input` pola wyszukiwania */
  root: HTMLElement;
  /** kontekst artykułów w chwili otwarcia: miejsce siedziby, urządzenie dotykowe, tryb gry */
  ctx: () => WikiCtx;
  /** „Otwórz »Jak grać«” w artykule */
  pomoc: () => void;
  /** stopka „Wróć” po otwarciu z Menu */
  wroc: () => void;
  /** stopka „Zamknij” po otwarciu z czipa: zamyka okno i wznawia grę */
  zamknij: () => void;
  /** zamknięcie bez decyzji (Esc, klik obok): jak przy innych oknach */
  dismiss: () => void;
  /** ustawia funkcję rysującą okno od nowa po zmianie języka */
  powtorz: (f: (() => void) | null) => void;
}

export interface Wiki {
  otworz(art: string | null, zMenu: boolean): void;
  /** wiąże czipy paska z artykułami (raz); `przed` woła się przed otwarciem okna z czipa */
  czipy(przed: () => boolean): void;
}

export function utworzWiki(d: WikiDeps): Wiki {
  let stan: WikiStan = { art: null, q: '', zMenu: true };
  let ctx: WikiCtx | null = null;

  const korzen = (): HTMLElement | null => d.modal.find('.wiki-uklad');

  /** wymienia treść artykułu i zaznaczenie na liście, bez przerysowania okna */
  function pokaz(id: string): void {
    if (!ctx || !maArtykul(id)) return;
    stan.art = id;
    const r = korzen();
    const tresc = d.modal.find('#wikiTresc');
    if (!r || !tresc) return;
    tresc.innerHTML = artykulHtml(id, ctx);
    tresc.scrollTop = 0;
    r.dataset.widok = 'art';
    for (const b of r.querySelectorAll<HTMLElement>('.wiki-poz')) {
      if (b.dataset.arg === id) {
        b.setAttribute('aria-current', 'true');
        const grupa = b.closest('details');
        if (grupa) grupa.open = true;
        b.scrollIntoView({ block: 'nearest' });
      } else b.removeAttribute('aria-current');
    }
    tresc.focus({ preventScroll: true });
  }

  /** na telefonie z powrotem do listy (na komputerze lista jest zawsze widoczna) */
  function doListy(): void {
    stan.art = null;
    const r = korzen();
    if (!r) return;
    r.dataset.widok = 'lista';
    for (const b of r.querySelectorAll<HTMLElement>('.wiki-poz[aria-current]')) b.scrollIntoView({ block: 'nearest' });
  }

  function rysuj(): void {
    if (!ctx) return;
    d.powtorz(rysuj);
    d.modal.show(
      wikiSheet(stan, ctx),
      (act, arg) => {
        if (act === 'wiki-art') pokaz(arg);
        else if (act === 'wiki-lista') doListy();
        else if (act === 'wiki-pomoc') d.pomoc();
        else if (act === 'wiki-wroc') (stan.zMenu ? d.wroc : d.zamknij)();
      },
      d.dismiss,
    );
  }

  // pole wyszukiwania: przerysowuje samą listę; Enter otwiera pierwszy wynik
  d.root.addEventListener('input', (e) => {
    const pole = e.target;
    if (!(pole instanceof HTMLInputElement) || !pole.classList.contains('wiki-q') || !ctx) return;
    stan.q = pole.value;
    const lista = d.modal.find('#wikiLista');
    if (lista) lista.innerHTML = listaHtml(stan, ctx);
  });
  d.root.addEventListener('keydown', (e) => {
    const pole = e.target;
    if (e.key !== 'Enter' || !(pole instanceof HTMLInputElement) || !pole.classList.contains('wiki-q')) return;
    const pierwszy = d.modal.find<HTMLElement>('#wikiLista .wiki-poz');
    if (pierwszy?.dataset.arg) {
      e.preventDefault();
      pokaz(pierwszy.dataset.arg);
    }
  });

  function otworz(art: string | null, zMenu: boolean): void {
    ctx = d.ctx();
    stan = { art: art && maArtykul(art) ? art : null, q: '', zMenu };
    rysuj();
  }

  return {
    otworz,
    czipy(przed) {
      for (const [id, art] of Object.entries(CZIPY)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.dataset.wiki = art;
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
      }
      const zElementu = (el: HTMLElement, mysz: boolean): void => {
        // fokus po kliknięciu myszą zdejmujemy przed pokazaniem okna, bo okno oddaje fokus temu, co miało go przy otwarciu
        if (mysz) el.blur();
        if (przed()) otworz(el.dataset.wiki ?? null, false);
      };
      document.addEventListener('click', (e) => {
        const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-wiki]') : null;
        if (el) zElementu(el, e instanceof MouseEvent && e.detail > 0);
      });
      document.addEventListener('keydown', (e) => {
        if (e.code !== 'Enter' && e.code !== 'Space') return;
        const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-wiki]') : null;
        // przyciski robią to sami przez click; tu tylko elementy bez natywnej obsługi (span z role="button")
        if (!el || el instanceof HTMLButtonElement) return;
        e.preventDefault();
        e.stopPropagation();
        zElementu(el, false);
      });
    },
  };
}
