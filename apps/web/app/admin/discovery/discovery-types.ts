import type { DiscoveryQuestion } from "../../start/discovery-types";

type Metadata = Pick<
  DiscoveryQuestion,
  "type" | "options" | "visibleWhen" | "target" | "min" | "max" | "step"
> &
  Pick<Partial<DiscoveryQuestion>, "contextKey" | "ui"> &
  Record<string, unknown>;

/** Stessa forma di OnboardingQuestionTemplate: admin e /start leggono lo stesso JSON. */
export type Template = {
  id?: string;
  key: string;
  label: string;
  helpText?: string | null;
  inputType: string;
  required: boolean;
  orderIndex: number;
  isActive: boolean;
  optionsJson: Metadata;
};
export type SportMode = "fixed" | "user_choice";
export type DiscoveryStats = {
  configured: number;
  active: number;
  inactive: number;
  conditional: number;
  unconditional: number;
  maxVisible: number;
};
export type DiscoveryList = {
  sportMode: SportMode;
  templates: Template[];
  stats: DiscoveryStats;
};

export const TYPE_LABELS: Record<DiscoveryQuestion["type"], string> = {
  single_choice: "Scelta singola",
  multi_choice: "Scelta multipla",
  number: "Numero",
  scale: "Scala",
  boolean: "Sì / No",
  date: "Data",
};
export const TARGET_LABELS = {
  sportId: "Sport",
  specializationId: "Specializzazione",
  goalId: "Obiettivo",
} as const;

export const isSportTarget = (t: Template) =>
  t.optionsJson.target === "sportId" ||
  t.optionsJson.target === "specializationId";

/** Con sport fisso sport e specializzazione non compaiono in /start. */
export const inPublicPath = (t: Template, mode: SportMode) =>
  t.isActive && (mode === "user_choice" || !isSportTarget(t));

export const asQuestion = (t: Template): DiscoveryQuestion => ({
  ...t.optionsJson,
  options: t.optionsJson.options ?? [],
  id: t.id ?? t.key,
  code: t.key,
  title: t.label,
  order: t.orderIndex,
  required: t.required,
});

export const inputTypeFor = (type: DiscoveryQuestion["type"]) =>
  type === "number" || type === "scale"
    ? "NUMBER"
    : type === "date"
      ? "TEXT"
      : "SELECT";

export function metadataFor(
  type: DiscoveryQuestion["type"],
): Template["optionsJson"] {
  if (type === "boolean")
    return {
      type,
      options: [
        { id: "yes", label: "Sì", value: true },
        { id: "no", label: "No", value: false },
      ],
    };
  if (type === "number" || type === "scale")
    return { type, options: [], min: 0, max: 10, step: 1 };
  if (type === "date") return { type, options: [] };
  return { type, options: [{ id: "opzione_1", label: "", value: "" }] };
}

/**
 * Stesso vincolo del backend, verificato prima dell'invio per spiegare il
 * problema con i titoli delle domande invece di un errore generico.
 */
export function reorderError(templates: Template[], mode: SportMode) {
  const active = templates.filter((t) => t.isActive);
  for (const [index, child] of active.entries())
    for (const rule of child.optionsJson.visibleWhen?.rules ?? []) {
      const parentIndex = active.findIndex((t) => t.key === rule.question);
      if (parentIndex > index)
        return `Impossibile spostare «${child.label}» prima di «${active[parentIndex].label}»`;
    }
  const position = (target: string) =>
    active.findIndex((t) => t.optionsJson.target === target);
  if (
    mode === "user_choice" &&
    position("sportId") > position("specializationId")
  )
    return "Lo sport deve precedere la specializzazione";
  return null;
}

export function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export async function responseError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  return Array.isArray(data.message)
    ? data.message.join(". ")
    : (data.message ?? "Operazione non riuscita");
}
