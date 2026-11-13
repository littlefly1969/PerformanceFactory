import type { MouseEvent } from "react";

/** Due tocchi più vicini di così sono un doppio tocco (demo V11). */
export const TAP_GUARD_MS = 650;

/**
 * Ultimo tocco sui pulsanti che cambiano slide e la slide su cui è caduto.
 * Vive nel modulo, non nella pagina: ogni slide è una pagina a sé e il
 * secondo tocco di un doppio tocco arriva già sulla slide successiva.
 */
let last: { at: number; screen: string } | null = null;

/**
 * Un tocco alla volta fra le slide del benvenuto: senza, il secondo tocco di
 * un doppio tocco cade sulla slide dopo, dove allo stesso posto c'è un altro
 * pulsante («Salta» della 4 sopra «Più tardi» della 5), e l'ultima slide si
 * salta. Si ignora un tocco arrivato su un'altra slide entro `TAP_GUARD_MS`
 * dal tocco precedente. Va in `onClickCapture` di intestazione e piede.
 */
export function tapGuard(screen: string) {
  return (event: MouseEvent) => {
    const now = Date.now();
    if (last && last.screen !== screen && now - last.at < TAP_GUARD_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    last = { at: now, screen };
  };
}

/** Solo per i test: dimentica l'ultimo tocco. */
export function resetTapGuard() {
  last = null;
}
