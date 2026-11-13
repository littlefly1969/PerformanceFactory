import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Calibration, Evaluation } from "../journey-types";
import { calibration, evaluation } from "./account-fixtures";
import { ProvisionalReady } from "./provisional-ready";

afterEach(cleanup);

const show = (
  overallConfidence: number,
  ruleMet: boolean,
  drivers = evaluation.drivers,
) =>
  render(
    <ProvisionalReady
      evaluation={
        { ...evaluation, drivers, overallConfidence } as unknown as Evaluation
      }
      calibration={
        calibration(null, "FREE_CALIBRATING", {
          ruleMet,
        }) as unknown as Calibration
      }
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

  it("keeps «Continua la calibrazione» until the calibration is sufficient", () => {
    show(50, false);
    expect(
      screen.getByRole("link", { name: /Continua la calibrazione/ }),
    ).toHaveClass("is-lime");
    const exit = screen.getByRole("link", {
      name: "Salva i progressi ed esci",
    });
    expect(exit).toHaveClass("pf-acc-link");
    // Demo V11: uscendo si va al profilo, non alla home.
    expect(exit).toHaveAttribute("href", "/journey/profilo?esito=calibrazione");
  });

  it("when sufficient, hides «Continua» and «Salva e vai al profilo» turns yellow", () => {
    show(72, true);
    expect(
      screen.queryByRole("button", { name: /Continua la calibrazione/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Continua la calibrazione/ }),
    ).toBeNull();
    const exit = screen.getByRole("link", { name: /Salva e vai al profilo/ });
    expect(exit).toHaveClass("pf-acc-pill", "is-lime");
    expect(exit).toHaveAttribute("href", "/journey/profilo?esito=calibrazione");
  });

  it("draws a solid spider arm for each defined area, dashed for the others", () => {
    // Soglia per area 60 nella regola delle fixture.
    const drivers = evaluation.drivers.map((d, i) => ({
      ...d,
      confidence: i < 2 ? 80 : 20,
    }));
    const { container } = show(50, false, drivers);
    const arms = container.querySelectorAll(".pf-acc-mini-arm");
    expect(arms).toHaveLength(drivers.length);
    expect(
      container.querySelectorAll(".pf-acc-mini-arm.is-defined"),
    ).toHaveLength(2);
    expect(arms[0]).toHaveClass("is-defined");
    expect(arms[2]).not.toHaveClass("is-defined");
  });
});
