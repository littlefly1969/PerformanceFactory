import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductShell } from "./product-shell";

const navigation = vi.hoisted(() => ({
  pathname: "/admin/free-lessons",
  push: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: "ADMIN" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("@/app/lib/api", () => ({
  API_BASE: "/api",
  secureFetch: async () =>
    new Response(
      JSON.stringify({ email: "test@esempio.test", role: auth.role }),
    ),
  signOut: vi.fn(),
}));

beforeEach(() => {
  navigation.push.mockReset();
});
afterEach(cleanup);

async function waitForWorkspace() {
  await screen.findByText("Area riservata");
  expect(screen.getByRole("main")).toHaveAttribute("id", "workspace-content");
}

it.each([
  ["ADMIN", "/admin/free-lessons", "/admin/cycles"],
  ["PROFESSIONAL", "/professional/approvals", "/professional"],
  ["PROFESSIONAL", "/professional/users/u1/performance", "/professional"],
])(
  "preserves the logical return for %s at %s after role loading",
  async (role, pathname, destination) => {
    auth.role = role;
    navigation.pathname = pathname;
    render(
      <ProductShell title="Pagina operativa">
        <p>Contenuto</p>
      </ProductShell>,
    );
    await waitForWorkspace();
    await userEvent.click(
      screen.getByRole("button", { name: /Torna indietro/ }),
    );
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(destination);
  },
);

it("gives an explicit back action precedence over the logical destination", async () => {
  auth.role = "ADMIN";
  navigation.pathname = "/admin/free-lessons";
  const back = vi.fn();
  render(
    <ProductShell
      title="Dettaglio"
      backAction={{ label: "Chiudi dettaglio", onClick: back }}
    >
      <p>Contenuto</p>
    </ProductShell>,
  );
  await waitForWorkspace();
  await userEvent.click(
    screen.getByRole("button", { name: /Chiudi dettaglio/ }),
  );
  expect(back).toHaveBeenCalledOnce();
  expect(navigation.push).not.toHaveBeenCalled();
});

it("does not invent a return destination for the workspace home", async () => {
  auth.role = "ADMIN";
  navigation.pathname = "/admin/cycles";
  render(
    <ProductShell title="Operazioni">
      <p>Contenuto</p>
    </ProductShell>,
  );
  await waitForWorkspace();
  expect(
    screen.queryByRole("button", { name: /Torna indietro/ }),
  ).not.toBeInTheDocument();
});
