"use client";
import Link from "next/link";
import {
  type MicroTestResult,
  percent,
  useResource,
} from "../_account/account-data";
import { Working } from "./micro-test-ui";

/** Frase di riserva per i test scritti prima delle frasi dell'AI. */
const fallbackVerdict = (r: MicroTestResult) => {
  if (r.total === undefined || r.correct === undefined)
    return "Esito registrato.";
  if (r.correct === r.total) return "Perfetto.";
  return r.correct * 2 >= r.total ? "Ci sei quasi." : "C’è margine.";
};

/** L'esito come lo citerebbe il coach: iniziale minuscola. */
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Video del micro-test: il file se c'è, altrimenti il titolo previsto. */
function VideoCard({
  video,
}: {
  video: NonNullable<MicroTestResult["video"]>;
}) {
  const file = video.url && /\.(mp4|webm|mov)(\?|$)/i.test(video.url);
  if (file)
    return (
      <figure className="pf-mt-video is-file">
        <video controls preload="metadata" src={video.url!} />
        <figcaption>
          <span className="pf-mt-kicker is-lime">Approfondisci</span>
          <strong>{video.title}</strong>
        </figcaption>
      </figure>
    );
  const body = (
    <>
      <span className="pf-mt-play" aria-hidden="true">
        ▶
      </span>
      <span className="pf-mt-video-text">
        <span className="pf-mt-kicker is-lime">
          {video.url ? "Approfondisci" : "Approfondisci · video in arrivo"}
        </span>
        <strong>{video.title}</strong>
      </span>
    </>
  );
  return video.url ? (
    <a
      className="pf-mt-video"
      href={video.url}
      target="_blank"
      rel="noreferrer"
    >
      {body}
    </a>
  ) : (
    <div className="pf-mt-video">{body}</div>
  );
}

/**
 * Risultato come nella demo: punti dal back office, frase e consiglio
 * dell'AI, confidenza dell'area prima e dopo e il video scelto dall'AI. Si
 * legge soltanto: aprirlo dall'indirizzo non reinvia la prova.
 */
export function MicroTestResultView({ roundId }: { roundId: string }) {
  const { data, error, reload } = useResource<MicroTestResult>(
    `/athlete-journey/calibration/micro-test/${roundId}`,
  );
  if (error)
    return (
      <Working
        title="Non riesco a leggere il risultato."
        error={error}
        onRetry={() => void reload()}
      />
    );
  if (!data) return null;
  if (data.status !== "EVALUATED")
    return (
      <Working
        title="Sto calcolando la tua performance."
        error="Le tue risposte sono salvate: non serve rifare la prova."
        onRetry={() => void reload()}
      />
    );
  const before = data.confidence?.before ?? null;
  const after = data.confidence?.after ?? null;
  return (
    <section className="pf-mt pf-mt-result" aria-labelledby="pf-mt-result">
      <div className="pf-mt-result-head">
        <span className="pf-mt-kicker">
          Micro-test {data.format === "PRACTICAL" ? "pratico" : "teorico"}{" "}
          completato
        </span>
        <strong className="pf-mt-points">+{data.points ?? 0} pt</strong>
        <h2 id="pf-mt-result">{data.verdict ?? fallbackVerdict(data)}</h2>
        {(data.answer || data.takeaway || data.summary) && (
          <p>
            {data.answer && <>Hai risposto «{lower(data.answer)}». </>}
            {data.takeaway ?? data.summary}
          </p>
        )}
      </div>
      <div className="pf-mt-confidence">
        <div>
          <span className="pf-mt-kicker">{data.area.name} · confidenza</span>
          <b>
            {percent(before)} → {percent(after)}
          </b>
        </div>
        <div
          className="pf-mt-bar"
          role="progressbar"
          aria-label={`Confidenza dell’area ${data.area.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={after ?? 0}
        >
          <span className="is-after" style={{ width: `${after ?? 0}%` }} />
          <span className="is-before" style={{ width: `${before ?? 0}%` }} />
        </div>
      </div>
      {data.video && <VideoCard video={data.video} />}
      <Link className="pf-mt-pill is-outline" href="/journey">
        <span>Torna alla Home</span>
      </Link>
    </section>
  );
}
