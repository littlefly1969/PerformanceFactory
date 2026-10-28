"use client";
import Link from "next/link";
import { LogoutButton } from "../components/logout-button";
import {
  AccountScreen,
  AccountTopBar,
} from "../journey/_account/account-shell";
import { useAccountGate, useAccountReturn } from "./account-gate";
import { ACCOUNT_LINKS } from "./account-links";
import "./account.css";

/** Il tuo account: le quattro destinazioni del menu avatar in una pagina. */
export default function AccountPage() {
  const home = useAccountGate();
  const back = useAccountReturn(home);
  return (
    <AccountScreen
      top={
        <AccountTopBar title="Il tuo account" back={back.href ?? "/journey"} />
      }
    >
      {home ? (
        <nav className="pf-account-list" aria-label="Il tuo account">
          {ACCOUNT_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              className="pf-acc-card"
              href={`${href}?da=account`}
            >
              {label} <span aria-hidden="true">→</span>
            </Link>
          ))}
          <LogoutButton className="pf-acc-link" />
        </nav>
      ) : (
        <p className="pf-acc-muted" role="status">
          Prepariamo la tua vista…
        </p>
      )}
    </AccountScreen>
  );
}
