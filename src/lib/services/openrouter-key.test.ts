import { describe, expect, it } from "vitest";
import {
  deleteOpenRouterKey,
  loadOpenRouterKeyHint,
  openRouterKeyLast4,
  parseOpenRouterApiKey,
  saveOpenRouterKey,
  toOpenRouterKeyStatus,
} from "@/lib/services/openrouter-key";
import { createUserOpenRouterKeyStore } from "@/test/user-openrouter-key-store";

const VALID_KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("parseOpenRouterApiKey", () => {
  it("accepts a trimmed sk-or-v1- key", () => {
    expect(parseOpenRouterApiKey(`  ${VALID_KEY}  `)).toEqual({
      ok: true,
      apiKey: VALID_KEY,
      last4: "cdef",
    });
  });

  it("rejects ###, empty, whitespace-only, and interior space", () => {
    expect(parseOpenRouterApiKey("###")).toEqual({ ok: false });
    expect(parseOpenRouterApiKey("")).toEqual({ ok: false });
    expect(parseOpenRouterApiKey("  ")).toEqual({ ok: false });
    expect(parseOpenRouterApiKey("sk-or- foo")).toEqual({ ok: false });
  });
});

describe("openRouterKeyLast4", () => {
  it("returns the last four characters of a known fixture", () => {
    expect(openRouterKeyLast4(VALID_KEY)).toBe("cdef");
  });
});

describe("toOpenRouterKeyStatus", () => {
  it("maps a hint row to last-4 without needing ciphertext", () => {
    expect(toOpenRouterKeyStatus({ last4: "cdef" })).toEqual({ configured: true, last4: "cdef" });
    expect(toOpenRouterKeyStatus(null)).toEqual({ configured: false });
  });
});

describe("save, replace, delete, and isolation", () => {
  const wrappingKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const userA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const keyA = `sk-or-v1-${"a".repeat(64)}`;
  const keyB = `sk-or-v1-${"b".repeat(64)}`;

  it("replaces last-4, delete clears the row, and A cannot read B's last4", async () => {
    const store = createUserOpenRouterKeyStore();

    await saveOpenRouterKey({
      userId: userA,
      apiKey: keyA,
      wrappingKey,
      supabase: store.clientFor(userA),
    });
    expect(await loadOpenRouterKeyHint(store.clientFor(userA))).toEqual({ configured: true, last4: "aaaa" });

    await saveOpenRouterKey({
      userId: userA,
      apiKey: keyB,
      wrappingKey,
      supabase: store.clientFor(userA),
    });
    expect(await loadOpenRouterKeyHint(store.clientFor(userA))).toEqual({ configured: true, last4: "bbbb" });
    expect(store.rows.size).toBe(1);

    await saveOpenRouterKey({
      userId: userB,
      apiKey: keyA,
      wrappingKey,
      supabase: store.clientFor(userB),
    });
    expect(await loadOpenRouterKeyHint(store.clientFor(userA))).toEqual({ configured: true, last4: "bbbb" });
    expect(await loadOpenRouterKeyHint(store.clientFor(userB))).toEqual({ configured: true, last4: "aaaa" });

    expect(await deleteOpenRouterKey({ userId: userA, supabase: store.clientFor(userA) })).toEqual({
      configured: false,
    });
    expect(await loadOpenRouterKeyHint(store.clientFor(userA))).toEqual({ configured: false });
    expect(await loadOpenRouterKeyHint(store.clientFor(userB))).toEqual({ configured: true, last4: "aaaa" });
  });
});
