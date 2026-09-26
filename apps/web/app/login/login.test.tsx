import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import LoginPage from "./page";
import AssistedLoginPage from "../accesso-assistito/page";
import OnboardingPage from "../onboarding/page";
import { secureFetch, storeAccessToken } from "../lib/api";
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: vi.fn(),
  storeAccessToken: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("offers credentials, Google login and the quiz without saved accounts", () => {
  render(<LoginPage />);
  expect(
    screen.getByRole("heading", { name: "Bentornato." }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Accedi con Google" }),
  ).toBeEnabled();
  expect(screen.getByRole("link", { name: "Fai il quiz" })).toHaveAttribute(
    "href",
    "/start",
  );
  expect(
    screen.queryByText("Profili per test interno"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Accedi" }),
  ).toBeDisabled();
});
it("submits entered credentials and displays a failed login without leaving the form", async () => {
  vi.mocked(secureFetch).mockResolvedValue(new Response("{}", { status: 401 }));
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText("E-mail"), "athlete@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "test-password");
  await userEvent.click(
    screen.getByRole("button", { name: "Accedi" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Credenziali non valide",
    ),
  );
  expect(secureFetch).toHaveBeenCalledWith(
    "/api/auth/login",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "athlete@example.com",
        password: "test-password",
      }),
    }),
  );
  expect(storeAccessToken).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Accedi" }),
  ).toBeEnabled();
});
it("redirects retired entry points to the current login and journey", () => {
  AssistedLoginPage();
  expect(redirect).toHaveBeenCalledWith("/login");
  OnboardingPage();
  expect(redirect).toHaveBeenCalledWith("/journey");
});


it("starts Google login with a return to the application router", async () => {
  const location = { href: "", origin: "https://performance.example", search: "" };
  vi.stubGlobal("window", new Proxy(window, {
    get: (target, key) => key === "location" ? location : Reflect.get(target, key),
  }));
  render(<LoginPage />);
  await userEvent.click(screen.getByRole("button", { name: "Accedi con Google" }));
  const target = new URL(location.href, location.origin);
  expect(target.pathname).toBe("/api/auth/google/login");
  expect(target.searchParams.get("returnTo")).toBe("https://performance.example/");
  expect(secureFetch).not.toHaveBeenCalled();
});
