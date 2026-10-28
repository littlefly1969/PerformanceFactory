"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { LogoutButton } from "./logout-button";
import { useProfilePhoto } from "../journey/_account/account-data";
import { ACCOUNT_LINKS, type AccountReturn } from "../account/account-links";
import "./account-menu.css";

/**
 * Avatar con il menu dell'account: Foto, Tessera e classifiche FIT,
 * Indirizzo e Abbonamento, uguali nella fase gratuita e da abbonato. `from`
 * dice dove tornare dalle pagine dell'account; l'aspetto del pulsante resta
 * quello dell'avatar della pagina che lo ospita (`className`).
 */
export function AccountMenu({
  name,
  from,
  className,
  align = "end",
}: {
  name?: string | null;
  from: AccountReturn;
  className: string;
  align?: "start" | "end";
}) {
  const photo = useProfilePhoto();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const initial = name?.trim().charAt(0).toUpperCase() || "·";
  return (
    <div className="pf-account-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-label="Il tuo account"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL dall'API
          <img src={photo} alt="" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>
      {open && (
        <nav
          id={panel}
          className={`pf-account-menu-panel${align === "start" ? " is-start" : ""}`}
          aria-label="Il tuo account"
        >
          {ACCOUNT_LINKS.map(({ href, label }) => (
            <Link key={href} href={`${href}?da=${from}`}>
              {label}
            </Link>
          ))}
          <hr />
          <LogoutButton />
        </nav>
      )}
    </div>
  );
}
