import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAdminReport } from "./use-admin-report";
vi.mock("../../lib/api", () => ({
  API_BASE: "/api",
  secureFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Read({ path }: { path: string }) {
  const { data, error } = useAdminReport<{ text: string }>(path);
  return (
    <div>
      {(data?.text ?? "waiting") as ReactNode}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
it("discards a late response for a previous filter even if the transport ignores abort", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/old")
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify({ text: "new data" }))),
    ),
  );
  const view = render(<Read path="/old" />);
  view.rerender(<Read path="/new" />);
  await screen.findByText("new data");
  await act(async () =>
    resolveOld(new Response(JSON.stringify({ text: "obsolete data" }))),
  );
  expect(screen.getByText("new data")).toBeInTheDocument();
  expect(screen.queryByText("obsolete data")).not.toBeInTheDocument();
});
