import { redirect } from "next/navigation";

/**
 * L'indirizzo per ora non ha interfaccia: la distanza dei circoli viene dalla
 * posizione o da CAP e città scelti nella lezione gratuita. I dati salvati
 * restano nel database. Il vecchio editor non fa più parte dell’app.
 */
export default function AccountAddressRoute() {
  redirect("/account");
}
