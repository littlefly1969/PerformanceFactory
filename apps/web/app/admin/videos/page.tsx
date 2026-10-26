"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";

type Area = { id: string; name: string };
type Video = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  isActive: boolean;
  area: Area | null;
};
type Draft = {
  title: string;
  description: string;
  url: string;
  areaId: string;
};

const EMPTY: Draft = { title: "", description: "", url: "", areaId: "" };

const payload = (draft: Draft) => ({
  title: draft.title,
  description: draft.description,
  url: draft.url.trim() || null,
  areaId: draft.areaId || null,
});

/**
 * Archivio dei video di approfondimento. L'AI sceglie tra i video attivi
 * dell'area del micro-test (o validi per tutte) in base alle risposte; un
 * video senza link mostra all'atleta solo il titolo, finché il file non c'è.
 */
export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextVideos, nextAreas] = await Promise.all([
        adminRequest<Video[]>("/admin/coaching-videos"),
        adminRequest<Area[]>("/ai-tuning/areas"),
      ]);
      setVideos(nextVideos);
      setAreas(nextAreas);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      await load();
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const ok = await run(
      () =>
        editing
          ? adminRequest(
              `/admin/coaching-videos/${editing}`,
              "PATCH",
              payload(draft),
            )
          : adminRequest("/admin/coaching-videos", "POST", payload(draft)),
      editing ? "Video aggiornato." : "Video aggiunto all'archivio.",
    );
    if (ok) {
      setDraft(EMPTY);
      setEditing(null);
    }
  };

  const set = (key: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <ProductShell
      eyebrow="Contenuti"
      title="Archivio video"
      description="I video che l'AI può proporre dopo un micro-test. Sceglie tra quelli attivi dell'area, o validi per tutte, in base alle risposte dell'atleta. Senza link l'atleta vede solo il titolo."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={[
        { label: "Video", value: videos.length, tone: "accent" },
        {
          label: "Attivi",
          value: videos.filter((video) => video.isActive).length,
          tone: "success",
        },
        {
          label: "Senza file",
          value: videos.filter((video) => !video.url).length,
          tone: "warning",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}
      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>{editing ? "Modifica video" : "Nuovo video"}</h2>
          </div>
          <form
            className="pf-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="pf-field">
              Titolo
              <input
                className="pf-input"
                required
                maxLength={120}
                value={draft.title}
                onChange={(event) => set("title", event.target.value)}
              />
            </label>
            <label className="pf-field">
              Di cosa parla
              <textarea
                className="pf-input"
                rows={3}
                maxLength={400}
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </label>
            <label className="pf-field">
              Link https (facoltativo)
              <input
                className="pf-input"
                type="url"
                value={draft.url}
                onChange={(event) => set("url", event.target.value)}
              />
            </label>
            <label className="pf-field">
              Area
              <select
                className="pf-input"
                value={draft.areaId}
                onChange={(event) => set("areaId", event.target.value)}
              >
                <option value="">Tutte le aree</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="pf-button" type="submit" disabled={busy}>
              {editing ? "Salva le modifiche" : "Aggiungi all'archivio"}
            </button>
            {editing && (
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft(EMPTY);
                }}
              >
                Annulla
              </button>
            )}
          </form>
        </article>
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>Video in archivio</h2>
          </div>
          {!videos.length && (
            <p className="pf-muted">
              Nessun video: finché l&apos;archivio è vuoto, l&apos;AI indica
              all&apos;atleta il titolo del video più adatto.
            </p>
          )}
          <div className="pf-stack">
            {videos.map((video) => (
              <article className="pf-card" key={video.id}>
                <div className="pf-card-top">
                  <div>
                    <h3>{video.title}</h3>
                    <p className="pf-muted">
                      {video.area?.name ?? "Tutte le aree"}
                      {video.url ? "" : " · senza file"}
                    </p>
                  </div>
                  <StatusBadge tone={video.isActive ? "success" : "neutral"}>
                    {video.isActive ? "Attivo" : "Spento"}
                  </StatusBadge>
                </div>
                {video.description && <p>{video.description}</p>}
                <label className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={video.isActive}
                    disabled={busy}
                    onChange={(event) =>
                      void run(
                        () =>
                          adminRequest(
                            `/admin/coaching-videos/${video.id}`,
                            "PATCH",
                            { isActive: event.target.checked },
                          ),
                        event.target.checked
                          ? "Video attivato."
                          : "Video spento: l'AI non lo propone più.",
                      )
                    }
                  />
                  L&apos;AI può proporlo
                </label>
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(video.id);
                    setDraft({
                      title: video.title,
                      description: video.description,
                      url: video.url ?? "",
                      areaId: video.area?.id ?? "",
                    });
                  }}
                >
                  Modifica
                </button>
              </article>
            ))}
          </div>
        </article>
      </section>
    </ProductShell>
  );
}
