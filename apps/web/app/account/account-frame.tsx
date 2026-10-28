"use client";
import type { ReactNode } from "react";
import {
  AccountScreen,
  AccountTopBar,
} from "../journey/_account/account-shell";
import { useAccountGate, useAccountReturn } from "./account-gate";
import "./account.css";

/**
 * Pagina dell'account su fondo chiaro, la stessa nella fase gratuita e da
 * abbonato: titolo, freccia verso la pagina chiamante e contenuto.
 */
export function AccountFrame({
  title,
  children,
}: {
  title: string;
  children: (back: { from: string | null; href: string }) => ReactNode;
}) {
  const home = useAccountGate();
  const back = useAccountReturn("/account");
  return (
    <AccountScreen
      top={<AccountTopBar title={title} back={back.href ?? "/account"} />}
    >
      {home ? (
        children({ from: back.from, href: back.href ?? "/account" })
      ) : (
        <p className="pf-acc-muted" role="status">
          Prepariamo la tua vista…
        </p>
      )}
    </AccountScreen>
  );
}
