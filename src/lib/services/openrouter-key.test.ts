import { describe, expect, it } from "vitest";
import { openRouterKeyLast4, parseOpenRouterApiKey, toOpenRouterKeyStatus } from "@/lib/services/openrouter-key";

// Test fixture only — not a live OpenRouter key. Do not commit a full `sk-or-v1-` + 64-hex
// literal; GitHub push protection treats that pattern as a real secret.
const VALID_KEY = `sk-or-v1-${"0123456789abcdef".repeat(4)}`;

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
