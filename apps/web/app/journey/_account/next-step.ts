import type { Journey } from "../journey-types";
import type { FreeLessonView } from "./account-data";
import {
  closedUnconsolidated,
  isClosed,
  microTestOpen,
} from "./calibration-state";

export type NextStep = {
  kind:
    | "scenarios"
    | "evaluation"
    | "micro-test"
    | "questions"
    | "finish"
    | "lesson";
  kicker: string;
  title: string;
  href: string;
  cta: string;
  /** Collegamento secondario, per esempio alla lezione mentre si calibra. */
  secondary?: { href: string; label: string };
};

/** La calibrazione è il passo proposto: domande, micro-test o valutazione. */
export const isCalibrationStep = (step: NextStep) =>
  step.kind === "evaluation" ||
  step.kind === "micro-test" ||
  step.kind === "questions" ||
  step.kind === "finish";

const microTestRound = (j: Journey) =>
  j.calibration?.round?.action === "PROPOSE_MICRO_TEST";

/**
 * Il prossimo passo della fase gratuita, uguale per Home e profilo. Decidono
 * lo stato della calibrazione e la fase della lezione restituiti dal backend,
 * mai punteggio o confidenza. La calibrazione resta aperta anche con R
 * consolidata e con la lezione in attesa: si continua finché la chiudono la
 * lezione svolta, la scelta degli scenari o la scadenza.
 */
export function nextStep(
  j: Journey,
  lesson: FreeLessonView | null | undefined,
): NextStep {
  const c = j.calibration;
  const phase = lesson?.enabled ? lesson.phase : null;
  if (isClosed(c))
    return closedUnconsolidated(c)
      ? {
          kind: "scenarios",
          kicker: "Fase gratuita conclusa",
          title:
            "La tua R è una stima poco affidabile: puoi comunque vedere i tuoi scenari.",
          href: "/journey/scenari",
          cta: "I tuoi scenari",
        }
      : {
          kind: "scenarios",
          kicker: "Calibrazione completata",
          title: "Scopri dove puoi arrivare in 3, 6 e 12 mesi.",
          href: "/journey/scenari",
          cta: "I tuoi scenari",
        };
  if (c?.round?.status === "EVALUATING")
    return {
      kind: "evaluation",
      kicker: "Risposte salvate",
      title: "Completiamo la valutazione delle tue ultime risposte.",
      href: microTestRound(j) ? "/journey/coach" : "/journey/calibrazione",
      cta: "Completa la valutazione",
    };
  const lessonPending =
    c?.status === "FREE_LESSON_VALIDATION" ||
    phase === "REQUESTED" ||
    phase === "ASSIGNED";
  const toLesson = lessonPending
    ? { href: "/journey/circolo", label: "Gestisci la lezione" }
    : undefined;
  if (microTestOpen(c))
    return {
      kind: "micro-test",
      kicker: "Micro-test",
      title: "Una prova breve ti aspetta.",
      href: "/journey/coach",
      cta: "Fai il micro-test",
      secondary: toLesson,
    };
  if (c?.round?.status === "OPEN")
    return {
      kind: "questions",
      kicker: "Calibrazione in corso",
      title: "Hai delle domande da completare.",
      href: "/journey/calibrazione",
      cta: "Riprendi le domande",
      secondary: toLesson,
    };
  if (phase === "ELIGIBLE")
    return {
      kind: "lesson",
      kicker: "Lezione gratuita · sbloccata",
      title: "Scegli il circolo per la tua lezione gratuita.",
      href: "/journey/circolo",
      cta: "Scegli il circolo",
      secondary: {
        href: "/journey/calibrazione",
        label: "Continua la calibrazione",
      },
    };
  if (c?.canFinish)
    return {
      kind: "finish",
      kicker: "R consolidata",
      title: "Puoi vedere i tuoi scenari o continuare a calibrare.",
      href: "/journey/calibrazione",
      cta: "Scegli come proseguire",
    };
  if (lessonPending)
    return {
      kind: "questions",
      kicker:
        phase === "ASSIGNED"
          ? "Lezione gratuita · confermata"
          : "Lezione gratuita · richiesta",
      title: c?.ruleMet
        ? "R consolidata: si chiude dopo il feedback del coach. Intanto puoi continuare."
        : "Continua la calibrazione mentre aspetti la lezione.",
      href: "/journey/calibrazione",
      cta: "Continua la calibrazione",
      secondary: toLesson,
    };
  return {
    kind: "questions",
    kicker: "Calibrazione in corso",
    title: "Rendiamo la stima più precisa.",
    href: "/journey/calibrazione",
    cta: "Continua la calibrazione",
  };
}

/** Esiti che il riepilogo sa confermare: nessun altro valore dall'indirizzo. */
export const OUTCOMES = {
  calibrazione: "Valutazione aggiornata con le tue risposte.",
  "micro-test": "Micro-test completato: la valutazione è aggiornata.",
  "micro-test-rimandato":
    "Micro-test rimandato: lo ritrovi quando continui la calibrazione.",
  lezione: "Lezione gratuita aggiornata.",
} as const;

export type Outcome = keyof typeof OUTCOMES;

/** Riepilogo con la conferma dell'attività appena conclusa. */
export const summaryHref = (outcome: Outcome) =>
  `/journey/profilo?esito=${outcome}`;

export const readOutcome = (search: string): Outcome | null => {
  const value = new URLSearchParams(search).get("esito");
  return value && Object.prototype.hasOwnProperty.call(OUTCOMES, value)
    ? (value as Outcome)
    : null;
};
