"use client";
import { useState } from "react";
import { AthleteAddress } from "../../components/athlete-address";
import { PillLink } from "../../journey/_account/account-shell";
import { AccountFrame } from "../account-frame";

/**
 * Editor dell'indirizzo dell'atleta, per ora senza pagina: la scelta del
 * circolo usa la posizione o CAP e città. L'indirizzo già salvato resta nel
 * database; per riaccenderlo basta rimettere la pagina e la voce del menu.
 */
export function AccountAddressPage() {
  const [saved, setSaved] = useState(false);
  return (
    <AccountFrame title="Indirizzo">
      {({ from, href }) => (
        <>
          <section
            className="pf-acc-card pf-acc-fit pf-acc-address"
            id="indirizzo"
          >
            <AthleteAddress onSaved={() => setSaved(true)} />
          </section>
          {saved && from === "circolo" && (
            <PillLink href={href}>Torna alla scelta del circolo</PillLink>
          )}
        </>
      )}
    </AccountFrame>
  );
}
