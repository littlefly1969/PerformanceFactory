import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  authHeaders,
  clearAccessToken,
  getAccessToken,
  secureFetch,
  storeAccessToken,
} from "./api";

describe("authenticated requests", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores and clears tokens while preserving explicit authorization", () => {
    storeAccessToken("stored");
    expect(getAccessToken()).toBe("stored");
    expect(authHeaders().get("Authorization")).toBe("Bearer stored");
    expect(
      authHeaders({ Authorization: "explicit" }).get("Authorization"),
    ).toBe("explicit");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it("reads with cookies without fetching a token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await secureFetch(`${API_BASE}/auth/me`);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("obtains a token before a mutation and preserves the request body", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ accessToken: "fresh" }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await secureFetch(`${API_BASE}/plans`, {
      method: "POST",
      body: '{"id":1}',
    });
    expect(fetch.mock.calls[0][0]).toBe(`${API_BASE}/auth/token`);
    expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer fresh",
    );
    expect(fetch.mock.calls[1][1].body).toBe('{"id":1}');
    expect(getAccessToken()).toBe("fresh");
  });

  it.each([401, 403])(
    "retries a rejected mutation once after renewing its token (%s)",
    async (status) => {
      storeAccessToken("expired");
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status }))
        .mockResolvedValueOnce(Response.json({ accessToken: "renewed" }))
        .mockResolvedValueOnce(Response.json({ saved: true }));
      vi.stubGlobal("fetch", fetch);
      const result = await secureFetch(`${API_BASE}/plans`, {
        method: "PATCH",
      });
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls[2][1].headers.get("Authorization")).toBe(
        "Bearer renewed",
      );
    },
  );

  it("does not retry indefinitely when renewal returns the same token", async () => {
    storeAccessToken("expired");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessToken: "expired" }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await secureFetch(`${API_BASE}/plans`, { method: "POST" })).status,
    ).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not renew tokens for login failures", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await secureFetch(`${API_BASE}/auth/login`, { method: "POST" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a readable 503 response for network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const response = await secureFetch(`${API_BASE}/plans`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("API non raggiungibile"),
    });
  });
});
