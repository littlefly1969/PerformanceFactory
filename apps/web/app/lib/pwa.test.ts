import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installPlatform,
  isStandalone,
  resetInstallPromptForTests,
  useInstallPrompt,
} from "./pwa";

afterEach(() => {
  resetInstallPromptForTests();
  vi.unstubAllGlobals();
});

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

describe("installPlatform", () => {
  it("recognises iPhone, iPad (as touch Mac), Android and the rest", () => {
    expect(installPlatform(IPHONE, 5)).toBe("ios");
    expect(installPlatform(IPAD, 5)).toBe("ios");
    expect(installPlatform(IPAD, 0)).toBe("other");
    expect(installPlatform(ANDROID, 5)).toBe("android");
  });
});

describe("isStandalone", () => {
  it("is true when opened from the home screen", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
    }));
    expect(isStandalone()).toBe(true);
  });
});

describe("useInstallPrompt", () => {
  it("keeps the browser signal and shows the system prompt once", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canPrompt).toBe(false);
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt: vi.fn(async () => undefined),
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      },
    );
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canPrompt).toBe(true);
    let outcome = "";
    await act(async () => {
      outcome = await result.current.prompt();
    });
    expect(outcome).toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canPrompt).toBe(false);
    expect(await result.current.prompt()).toBe("unavailable");
  });

  it("remembers that the app was installed", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current.installed).toBe(true);
  });
});
