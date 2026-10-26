/**
 * Lease del percorso (`AthleteDiscovery.operationAt`): mentre l'AI scrive le
 * domande o fa la prima valutazione, risposte e classifica non cambiano.
 * Un lease più vecchio di così è di un worker caduto e si può riprendere.
 */
export const JOURNEY_LEASE_MS = 10 * 60 * 1000;

export const journeyLeaseActive = (operationAt: Date | null) =>
  !!operationAt && Date.now() - operationAt.getTime() < JOURNEY_LEASE_MS;
