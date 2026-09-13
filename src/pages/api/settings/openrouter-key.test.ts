import type { APIContext } from "astro";
import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUserOpenRouterKeyStore } from "@/test/user-openrouter-key-store";

const VALID_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const KEY_A = `sk-or-v1-${"a".repeat(64)}`;
const KEY_B = `sk-or-v1-${"b".repeat(64)}`;

vi.mock("astro:env/server", () => ({
  USER_SECRETS_KEY: VALID_HEX,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

const { createClient } = await import("@/lib/supabase");
const { DELETE, POST, prerender } = await import("@/pages/api/settings/openrouter-key");

function apiContext(input: { method: "POST" | "DELETE"; userId?: string; body?: unknown }): APIContext {
  const headers = new Headers();
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const request = new Request("https://example.test/api/settings/openrouter-key", {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  return {
    request,
    cookies: {
      get: () => undefined,
      set: () => undefined,
    } as unknown as AstroCookies,
    locals: {
      user: input.userId ? ({ id: input.userId } as App.Locals["user"]) : null,
    },
    url: new URL(request.url),
  } as APIContext;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST/DELETE /api/settings/openrouter-key", () => {
  const store = createUserOpenRouterKeyStore();

  beforeEach(() => {
    store.rows.clear();
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(() => store.clientFor(USER_A));
  });

  it("exports prerender = false", () => {
    expect(prerender).toBe(false);
  });

  it("returns 401 for guest POST and DELETE without touching the store", async () => {
    const post = await POST(apiContext({ method: "POST", body: { apiKey: KEY_A } }));
    const del = await DELETE(apiContext({ method: "DELETE" }));

    expect(post.status).toBe(401);
    expect(await readJson(post)).toEqual({ error: "Authentication required" });
    expect(del.status).toBe(401);
    expect(await readJson(del)).toEqual({ error: "Authentication required" });
    expect(createClient).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(0);
  });

  it("returns invalid_key_format for ### and empty keys", async () => {
    for (const apiKey of ["###", "", "   "]) {
      const response = await POST(apiContext({ method: "POST", userId: USER_A, body: { apiKey } }));
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.code).toBe("invalid_key_format");
      expect(body.error).toEqual(expect.any(String));
      expect(store.rows.size).toBe(0);
    }
  });

  it("replaces last-4 in place and never returns secrets", async () => {
    const first = await POST(apiContext({ method: "POST", userId: USER_A, body: { apiKey: KEY_A } }));
    const firstBody = await readJson(first);
    expect(first.status).toBe(200);
    expect(firstBody).toEqual({ configured: true, last4: "aaaa" });
    expect(firstBody).not.toHaveProperty("nonce");
    expect(firstBody).not.toHaveProperty("ciphertext");
    expect(JSON.stringify(firstBody)).not.toContain(KEY_A);

    const second = await POST(apiContext({ method: "POST", userId: USER_A, body: { apiKey: KEY_B } }));
    const secondBody = await readJson(second);
    expect(second.status).toBe(200);
    expect(secondBody).toEqual({ configured: true, last4: "bbbb" });
    expect(store.rows.size).toBe(1);
    expect(store.rows.get(USER_A)?.last4).toBe("bbbb");
    expect(store.rows.get(USER_A)?.ciphertext).not.toBe(KEY_B);
  });

  it("deletes the row and returns configured: false", async () => {
    await POST(apiContext({ method: "POST", userId: USER_A, body: { apiKey: KEY_A } }));

    const response = await DELETE(apiContext({ method: "DELETE", userId: USER_A }));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ configured: false });
    expect(body).not.toHaveProperty("last4");
    expect(store.rows.size).toBe(0);
  });

  it("does not let user A's client read user B's last4", async () => {
    vi.mocked(createClient).mockImplementation((_headers, _cookies) => store.clientFor(USER_B));
    await POST(apiContext({ method: "POST", userId: USER_B, body: { apiKey: KEY_B } }));

    const { loadOpenRouterKeyHint } = await import("@/lib/services/openrouter-key");
    const asA = await loadOpenRouterKeyHint(store.clientFor(USER_A), USER_A);
    const asB = await loadOpenRouterKeyHint(store.clientFor(USER_B), USER_B);

    expect(asB).toEqual({ configured: true, last4: "bbbb" });
    expect(asA).toEqual({ configured: false });
    expect(asA.last4).toBeUndefined();
  });
});
