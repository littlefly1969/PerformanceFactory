import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalibrationPanel } from "./calibration-panel";
import type { Calibration, Evaluation } from "./journey-types";

const evaluation: Evaluation = {
  id: "e2",
  status: "PROVISIONAL",
  source: "CALIBRATION_ROUND",
  summary: "Sintesi.",
  overallConfidence: 45,
  level: "INTERMEDIATE",
  levelConfidence: 55,
  sequence: 2,
  scale: { min: 0, max: 100 },
  createdAt: "2026-10-07T08:00:00.000Z",
  drivers: [],
};

const base: Calibration = {
  status: "FREE_CALIBRATING",
  day: 3,
  consolidationRule: {
    version: 1,
    minOverallConfidence: 70,
    minAreaConfidence: 70,
    minAreasAtConfidence: null,
  },
  completionReason: null,
  roundsCompleted: 0,
  nextRoundKind: "ADAPTIVE",
  round: null,
};

const round: NonNullable<Calibration["round"]> = {
  id: "r1",
  kind: "ADAPTIVE",
  status: "OPEN",
  questions: [
    {
      id: "q1",
      areaId: "a",
      text: "Quante volte giochi a settimana?",
      options: [
        { value: "0", label: "Una" },
        { value: "1", label: "Due o più" },
      ],
    },
    {
      id: "q2",
      areaId: "b",
      text: "Ti alleni anche fuori dal campo?",
      options: [
        { value: "0", label: "No" },
        { value: "1", label: "Sì" },
      ],
    },
  ],
  answers: {},
};

const renderPanel = (calibration: Calibration) => {
  const onOpenRound = vi.fn();
  const onAnswer = vi.fn();
  render(
    <CalibrationPanel
      calibration={calibration}
      evaluation={evaluation}
      busy={false}
      onOpenRound={onOpenRound}
      onAnswer={onAnswer}
    />,
  );
  return { onOpenRound, onAnswer };
};

afterEach(cleanup);

describe("free calibration panel", () => {
  it("asks for a new round and hides the level until it is estimated", async () => {
    const { onOpenRound } = renderPanel(base);
    // Nessun conto alla rovescia né contatore di giorni.
    expect(screen.getByText("Calibrazione")).toBeVisible();
    expect(screen.queryByText(/giorno|di 30/)).toBeNull();
    expect(screen.queryByText(/Livello stimato/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Nuove domande →" }),
    );
    expect(onOpenRound).toHaveBeenCalledOnce();
  });

  it("sends the answers only when every question has one", async () => {
    const { onAnswer } = renderPanel({
      ...base,
      status: "FREE_LEVEL_ESTIMATED",
      round,
    });
    expect(screen.getByText("Intermedio")).toBeVisible();
    const send = screen.getByRole("button", { name: "Invia le risposte →" });
    await userEvent.click(screen.getByRole("button", { name: "Due o più" }));
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Sì" }));
    await userEvent.click(send);
    expect(onAnswer).toHaveBeenCalledWith("r1", { q1: "1", q2: "1" });
  });

  it("AT-10: offers the next round right away, without waiting", () => {
    renderPanel({ ...base, day: 26, roundsCompleted: 6 });
    expect(screen.queryByText(/saranno pronte/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Nuove domande →" }),
    ).toBeEnabled();
  });

  it("explains a consolidation reached by confidence", () => {
    renderPanel({
      ...base,
      status: "CALIBRATION_COMPLETED",
      completionReason: "CONFIDENCE_REACHED",
    });
    expect(screen.getByText("La tua R è consolidata.")).toBeVisible();
    expect(screen.getByText(/coerenti e complete/)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps historic closings honest about the weaker drivers", () => {
    renderPanel({
      ...base,
      status: "CALIBRATION_COMPLETED",
      completionReason: "DEADLINE_REACHED",
    });
    expect(screen.getByText(/senza valori inventati/)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("AT-18: a booked lesson does not hold R", () => {
    renderPanel({ ...base, status: "FREE_LESSON_VALIDATION" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "renderà la tua R ancora più precisa",
    );
    expect(
      screen.getByRole("button", { name: "Nuove domande →" }),
    ).toBeEnabled();
  });
});
