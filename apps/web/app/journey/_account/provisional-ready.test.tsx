import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Calibration, Evaluation } from "../journey-types";
import { calibration, evaluation } from "./account-fixtures";
import { ProvisionalReady } from "./provisional-ready";

afterEach(cleanup);

const show = (overallConfidence: number, ruleMet: boolean) =>
  render(
    <ProvisionalReady
      evaluation={{ ...evaluation, overallConfidence } as unknown as Evaluation}
      calibration={
        calibration(null, "FREE_CALIBRATING", {
          ruleMet,
        }) as unknown as Calibration
      }
      onHome={() => {}}
    />,
  );

describe("ProvisionalReady (S11)", () => {
  it("stays provisional when the overall confidence reaches 70 but the server rule is not met", () => {
    show(70, false);
    expect(screen.getByText("Profilo provvisorio")).toBeTruthy();
    expect(screen.queryByText("Sufficientemente completo")).toBeNull();
  });

  it("stays provisional just below the threshold, even if it rounds to 70", () => {
    show(69.6, false);
    expect(screen.getByRole("meter", { name: "Calibrazione" })).toHaveAttribute(
      "aria-valuenow",
      "70",
    );
    expect(screen.getByText("Profilo provvisorio")).toBeTruthy();
  });

  it("says sufficiently complete only when the server rule is met", () => {
    show(72, true);
    expect(screen.getByText("Sufficientemente completo")).toBeTruthy();
  });
});
