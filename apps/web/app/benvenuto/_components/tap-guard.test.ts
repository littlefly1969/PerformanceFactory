import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { resetTapGuard, TAP_GUARD_MS, tapGuard } from "./tap-guard";

const tap = (screen: string, detail = 1) => {
  const event = {
    detail,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  tapGuard(screen)(event as unknown as MouseEvent);
  return event.preventDefault.mock.calls.length === 0;
};

afterEach(() => {
  resetTapGuard();
  vi.useRealTimers();
});

describe("doppio tocco nel benvenuto", () => {
  it("ignora il secondo tocco se cade già sulla slide dopo", () => {
    vi.useFakeTimers();
    expect(tap("welcome-4")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(tap("welcome-5")).toBe(false);
  });

  it("lascia passare i tocchi sulla stessa slide e quelli più lenti", () => {
    vi.useFakeTimers();
    expect(tap("welcome-2")).toBe(true);
    expect(tap("welcome-2")).toBe(true);
    vi.advanceTimersByTime(TAP_GUARD_MS);
    expect(tap("welcome-3")).toBe(true);
  });

  it("non blocca la navigazione da tastiera e non la conta come tocco", () => {
    vi.useFakeTimers();
    // Invio o Spazio su un pulsante: click sintetico con detail 0.
    expect(tap("welcome-3", 0)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(tap("welcome-4", 0)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(tap("welcome-5", 0)).toBe(true);
    // Un tocco subito dopo la tastiera non è un doppio tocco.
    vi.advanceTimersByTime(100);
    expect(tap("welcome-entered")).toBe(true);
    // Il doppio tocco del puntatore resta bloccato.
    vi.advanceTimersByTime(100);
    expect(tap("welcome-other")).toBe(false);
  });
});
