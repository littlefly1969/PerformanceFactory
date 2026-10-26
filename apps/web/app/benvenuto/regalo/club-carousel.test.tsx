import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAROUSEL_STEP_MS, ClubCarousel } from "./club-carousel";

vi.mock("@/app/lib/api", () => ({ API_BASE: "/api" }));

const clubs = ["Uno", "Due", "Tre"].map((name, i) => ({
  id: `c${i}`,
  name,
  city: null,
  logoUrl: null,
  photoUrl: null,
}));

const current = () =>
  screen
    .getAllByRole("group")
    .find((card) => card.getAttribute("aria-current") === "true")
    ?.getAttribute("aria-label");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ClubCarousel", () => {
  it("advances by itself and starts over after the last club", () => {
    render(<ClubCarousel clubs={clubs} />);
    expect(current()).toBe("1 di 3: Uno");
    act(() => vi.advanceTimersByTime(CAROUSEL_STEP_MS));
    expect(current()).toBe("2 di 3: Due");
    act(() => vi.advanceTimersByTime(CAROUSEL_STEP_MS * 2));
    expect(current()).toBe("1 di 3: Uno");
  });

  it("stays still when the athlete prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<ClubCarousel clubs={clubs} />);
    act(() => vi.advanceTimersByTime(CAROUSEL_STEP_MS * 2));
    expect(current()).toBe("1 di 3: Uno");
  });
});
