import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import LoginPage from "./page";
import AssistedLoginPage from "../accesso-assistito/page";
vi.mock("next/image", () => ({ default: () => null }));
afterEach(cleanup);
it("keeps assisted profiles on their own page and exposes Google registration", () => {
  render(<LoginPage />);
  expect(
    screen.queryByText("Profili per test interno"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Registrati con Google" }),
  ).toHaveAttribute("href", expect.stringContaining("/auth/google/register"));
});
it("prefills coach and administrator credentials without granting a role or submitting automatically", async () => {
  render(<AssistedLoginPage />);
  await userEvent.click(screen.getByRole("button", { name: "Ciclismo" }));
  expect(screen.getByLabelText("Email")).toHaveValue(
    "coach_cycling@example.it",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Admin" }),
  );
  expect(screen.getByLabelText("Email")).toHaveValue("admin@example.com");
  expect(screen.getByLabelText("Password")).toHaveValue("password123");
  expect(
    screen.getByRole("button", { name: "Accedi" }),
  ).toBeEnabled();
});
