/** Le destinazioni canoniche dell'account, nell'ordine del menu. */
export const ACCOUNT_LINKS = [
  { href: "/account/foto", label: "Foto" },
  { href: "/account/fit", label: "Tessera e classifiche FIT" },
  { href: "/account/indirizzo", label: "Indirizzo" },
  { href: "/account/accesso", label: "Face ID e impronta" },
  { href: "/account/abbonamento", label: "Abbonamento" },
] as const;

/**
 * Pagine da cui si entra nell'account e dove si torna. Il ritorno è una
 * chiave di questa tabella, mai un indirizzo scritto nell'URL dal client.
 */
export const ACCOUNT_RETURNS = {
  home: "/journey",
  profilo: "/journey/profilo",
  circolo: "/journey/circolo",
  user: "/user",
  "user-profilo": "/user/profile",
  account: "/account",
} as const;

export type AccountReturn = keyof typeof ACCOUNT_RETURNS;

export function isAccountReturn(value: string | null): value is AccountReturn {
  return !!value && Object.hasOwn(ACCOUNT_RETURNS, value);
}
