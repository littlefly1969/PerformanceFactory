import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  GoogleRegistrationButton,
  googleDiscoveryReady,
  googleRegistrationHref,
} from "./google-registration";
import { DRAFT_KEY } from "./discovery-state";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe("Google registration entry points", () => {
  const config = {
    version: 1,
    questions: [
      {
        id: "event",
        code: "event",
        title: "Evento",
        type: "boolean" as const,
        required: true,
        order: 1,
        options: [],
      },
    ],
  };
  it("starts verified Google registration and persists discovery before leaving", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    const draft = {
      version: 1,
      currentStep: "registration",
      answers: { event: false },
    };
    render(<GoogleRegistrationButton draft={draft} onError={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Registrati con Google" }),
    );
    expect(assign).toHaveBeenCalledWith(googleRegistrationHref);
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toEqual(draft);
  });
  it("continues to consents when Google is already verified", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    render(<GoogleRegistrationButton pending onError={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continua con il tuo account Google",
      }),
    );
    expect(assign).toHaveBeenCalledWith("/journey?google=complete");
  });
  it("requires a current complete discovery before Google consents", () => {
    expect(googleDiscoveryReady(null, config)).toBe(false);
    expect(
      googleDiscoveryReady(
        JSON.stringify({
          version: 1,
          currentStep: "registration",
          answers: {},
        }),
        config,
      ),
    ).toBe(false);
    expect(
      googleDiscoveryReady(
        JSON.stringify({
          version: 0,
          currentStep: "registration",
          answers: { event: false },
        }),
        config,
      ),
    ).toBe(false);
    expect(
      googleDiscoveryReady(
        JSON.stringify({
          version: 1,
          currentStep: "registration",
          answers: { event: false },
        }),
        config,
      ),
    ).toBe(true);
  });
  it("shows a recoverable error instead of losing the draft if storage is unavailable", () => {
    const assign = vi.fn();
    const error = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    render(<GoogleRegistrationButton onError={error} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Registrati con Google" }),
    );
    expect(error).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
