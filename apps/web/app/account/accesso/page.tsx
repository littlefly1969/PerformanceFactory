"use client";
import { useCallback, useEffect, useState } from "react";
import { PillButton } from "../../journey/_account/account-shell";
import {
  PasskeyCancelled,
  deletePasskey,
  listPasskeys,
  registerPasskey,
  supportsPasskeys,
  type PasskeySummary,
} from "../../lib/passkey";
import { AccountFrame } from "../account-frame";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Passkey dall'account: si attiva Face ID o impronta sul dispositivo in uso e
 * si eliminano quelle dei telefoni persi. E-mail, password e Google restano.
 */
export default function AccountAccessPage() {
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      setPasskeys(await listPasskeys());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita.");
    }
  }, []);

  useEffect(() => {
    setSupported(supportsPasskeys());
    void reload();
  }, [reload]);

  async function activate() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await registerPasskey();
      setMessage(
        "Fatto: dalla prossima volta puoi entrare con Face ID o impronta.",
      );
      await reload();
    } catch (e) {
      if (!(e instanceof PasskeyCancelled))
        setError(e instanceof Error ? e.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await deletePasskey(id);
      setConfirm(null);
      setMessage("Passkey eliminata.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountFrame title="Accesso">
      {() => (
        <section className="pf-acc-card pf-account-sub">
          <span className="pf-acc-kicker">Accesso rapido</span>
          <h1 className="pf-acc-title">Face ID o impronta</h1>
          <p>
            Con una passkey entri senza password: basta il Face ID o l’impronta
            del telefono. Il dato biometrico resta sul dispositivo e non arriva
            mai a noi. E-mail e password continuano a funzionare.
          </p>
          {!supported && (
            <p className="pf-acc-note">
              Questo browser non supporta le passkey. Aprilo da Safari su iPhone
              o da Chrome su Android.
            </p>
          )}
          {passkeys === null && !error && (
            <p className="pf-acc-muted" role="status">
              Prepariamo la tua vista…
            </p>
          )}
          {passkeys && passkeys.length > 0 && (
            <dl aria-label="Le tue passkey">
              {passkeys.map((passkey) => (
                <div key={passkey.id}>
                  <dt>
                    {passkey.name}
                    {passkey.backedUp ? " · sincronizzata" : ""}
                  </dt>
                  <dd>
                    {passkey.lastUsedAt
                      ? `Usata il ${date(passkey.lastUsedAt)}`
                      : `Attivata il ${date(passkey.createdAt)}`}{" "}
                    {confirm !== passkey.id && (
                      <button
                        type="button"
                        className="pf-acc-link pf-passkey-remove"
                        aria-label={`Elimina passkey ${passkey.name}`}
                        disabled={busy}
                        onClick={() => setConfirm(passkey.id)}
                      >
                        Elimina
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {confirm && (
            <div role="group" aria-label="Conferma">
              <p>
                Elimini questa passkey? Da quel dispositivo dovrai entrare di
                nuovo con e-mail e password.
              </p>
              <PillButton disabled={busy} onClick={() => void remove(confirm)}>
                Sì, elimina
              </PillButton>
              <PillButton
                tone="outline"
                arrow={false}
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Annulla
              </PillButton>
            </div>
          )}
          {supported && passkeys && !confirm && (
            <PillButton disabled={busy} onClick={() => void activate()}>
              {busy ? "Attivazione…" : "Attiva su questo dispositivo"}
            </PillButton>
          )}
          {error && (
            <p className="pf-acc-error" role="alert">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      )}
    </AccountFrame>
  );
}
