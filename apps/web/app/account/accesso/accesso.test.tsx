import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountAccessPage from "./page";

vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
}));
const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));
vi.mock("@simplewebauthn/browser", () => browser);

type Call = { url: string; method: string; body: unknown };
let passkeys: Array<Record<string, unknown>>;
let calls: Call[];

const PHONE = {
  id: "pk-1",
  name: "iPhone",
  backedUp: true,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: null,
};

beforeEach(() => {
  passkeys = [];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: JSON.parse(String(init?.body ?? "{}")) });
      if (url.endsWith("/auth/journey"))
        return Response.json({ phase: "EVALUATION", welcomeCompleted: true });
      if (url.endsWith("/register/options"))
        return Response.json({ challenge: "c" });
      if (url.endsWith("/register/verify")) {
        passkeys = [PHONE];
        return Response.json(PHONE);
      }
      if (method === "DELETE") {
        passkeys = [];
        return Response.json({ ok: true });
      }
      if (url.endsWith("/auth/passkeys")) return Response.json(passkeys);
      return Response.json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  browser.browserSupportsWebAuthn.mockReturnValue(true);
});

it("activates Face ID on this device and lists the new passkey", async () => {
  browser.startRegistration.mockResolvedValue({ id: "cred-1" });
  render(<AccountAccessPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Attiva su questo dispositivo/ }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "puoi entrare con Face ID o impronta",
  );
  expect(browser.startRegistration).toHaveBeenCalledWith({
    optionsJSON: { challenge: "c" },
  });
  expect(calls).toContainEqual({
    url: "/api/auth/passkeys/register/verify",
    method: "POST",
    body: { response: { id: "cred-1" } },
  });
  expect(screen.getByText("iPhone · sincronizzata")).toBeInTheDocument();
});

it("ignores a closed Face ID prompt", async () => {
  browser.startRegistration.mockRejectedValue(
    Object.assign(new Error("closed"), { name: "NotAllowedError" }),
  );
  render(<AccountAccessPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Attiva su questo dispositivo/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Attiva su questo dispositivo/ }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(calls.some((c) => c.url.endsWith("/register/verify"))).toBe(false);
});

it("deletes a lost phone's passkey after confirmation", async () => {
  passkeys = [PHONE];
  render(<AccountAccessPage />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Elimina passkey iPhone" }),
  );
  await userEvent.click(screen.getByRole("button", { name: /Sì, elimina/ }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Passkey eliminata.",
  );
  expect(calls).toContainEqual(
    expect.objectContaining({
      url: "/api/auth/passkeys/pk-1",
      method: "DELETE",
    }),
  );
  expect(screen.queryByText(/iPhone/)).not.toBeInTheDocument();
});

it("explains when the browser cannot use passkeys", async () => {
  browser.browserSupportsWebAuthn.mockReturnValue(false);
  render(<AccountAccessPage />);
  expect(
    await screen.findByText(/Questo browser non supporta le passkey/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Attiva su questo dispositivo/ }),
  ).not.toBeInTheDocument();
});
