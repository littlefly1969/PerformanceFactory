"use client";
import { useEffect, useState } from "react";
import { type Outcome, summaryHref } from "../../_account/next-step";

/** Le pagine del profilo aperte dal profilo dell'abbonato portano «?da=abbonato». */
export const FROM_SUBSCRIBER = "da=abbonato";
const SUBSCRIBER_PROFILE = "/user/profile";

/** Indirizzo di una pagina del profilo aperta dal profilo dell'abbonato. */
export const fromSubscriber = (href: string, subscriber: boolean) =>
  subscriber ? `${href}?${FROM_SUBSCRIBER}` : href;

/**
 * Da dove arriva l'atleta: indietro e salvataggio tornano al profilo
 * dell'abbonato o a quello della fase gratuita, con la sua conferma.
 */
export function useProfileOrigin() {
  const [subscriber, setSubscriber] = useState(false);
  useEffect(() => {
    setSubscriber(
      new URLSearchParams(window.location.search).get("da") === "abbonato",
    );
  }, []);
  return {
    subscriber,
    back: subscriber ? SUBSCRIBER_PROFILE : "/journey/profilo",
    done: (outcome: Outcome) =>
      subscriber ? SUBSCRIBER_PROFILE : summaryHref(outcome),
  };
}
