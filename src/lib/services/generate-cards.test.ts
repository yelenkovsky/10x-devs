import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOpenRouterKey } from "@/lib/services/openrouter-key";
import { createUserOpenRouterKeyStore } from "@/test/user-openrouter-key-store";

const VALID_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const KEY_A = `sk-or-v1-${"a".repeat(64)}`;
const KEY_B = `sk-or-v1-${"b".repeat(64)}`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ORIGIN = "https://example.test";
const PASTE = "brew";

const CARD = {
  cloze: "They _____ tea.",
  wordPhrase: "brew",
  fullSentence: "They brew tea.",
  definition: "make a drink with hot water",
  collocationPattern: "brew + drink",
  translationPl: "Parzą herbatę.",
};

vi.mock("astro:env/server", () => ({
  OPENROUTER_MODEL: undefined,
  USER_SECRETS_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}));

const { generateCards } = await import("@/lib/services/generate-cards");

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function stubOpenRouterFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>> {
  const originalFetch = globalThis.fetch;
  const openRouterFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(impl);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(input).startsWith(OPENROUTER_URL)) {
      return openRouterFetch(input, init);
    }
    return originalFetch(input, init);
  });
  return openRouterFetch;
}

function openRouterSuccess(cards = [CARD]): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ cards }) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function authorizationHeader(init?: RequestInit): string {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    throw new Error("expected OpenRouter headers object");
  }
  return headers.Authorization;
}

describe("generateCards user key", () => {
  const store = createUserOpenRouterKeyStore();

  beforeEach(() => {
    store.rows.clear();
    store.flashcards.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws generation_not_configured and does not call OpenRouter when the user has no key", async () => {
    const openRouterFetch = stubOpenRouterFetch(() => Promise.resolve(openRouterSuccess()));

    await expect(
      generateCards({
        userId: USER_A,
        paste: PASTE,
        origin: ORIGIN,
        supabase: store.clientFor(USER_A),
      }),
    ).rejects.toMatchObject({
      name: "GenerateCardsError",
      code: "generation_not_configured",
      status: 503,
    });

    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(store.flashcards).toHaveLength(0);
  });

  it.each([401, 403])("maps OpenRouter %s to generation_invalid_key and does not insert", async (status) => {
    await saveOpenRouterKey({
      userId: USER_A,
      apiKey: KEY_A,
      wrappingKey: VALID_HEX,
      supabase: store.clientFor(USER_A),
    });

    const openRouterFetch = stubOpenRouterFetch(() => Promise.resolve(new Response("rejected", { status })));

    await expect(
      generateCards({
        userId: USER_A,
        paste: PASTE,
        origin: ORIGIN,
        supabase: store.clientFor(USER_A),
      }),
    ).rejects.toMatchObject({
      name: "GenerateCardsError",
      code: "generation_invalid_key",
      message: "This OpenRouter key was rejected. Replace it in Settings.",
    });

    expect(openRouterFetch).toHaveBeenCalledOnce();
    expect(store.flashcards).toHaveLength(0);
  });

  it("does not use user A's key when generating as user B", async () => {
    await saveOpenRouterKey({
      userId: USER_A,
      apiKey: KEY_A,
      wrappingKey: VALID_HEX,
      supabase: store.clientFor(USER_A),
    });

    const openRouterFetch = stubOpenRouterFetch(() => Promise.resolve(openRouterSuccess()));

    await expect(
      generateCards({
        userId: USER_B,
        paste: PASTE,
        origin: ORIGIN,
        supabase: store.clientFor(USER_B),
      }),
    ).rejects.toMatchObject({ code: "generation_not_configured" });
    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(store.flashcards).toHaveLength(0);

    await saveOpenRouterKey({
      userId: USER_B,
      apiKey: KEY_B,
      wrappingKey: VALID_HEX,
      supabase: store.clientFor(USER_B),
    });

    const result = await generateCards({
      userId: USER_B,
      paste: PASTE,
      origin: ORIGIN,
      supabase: store.clientFor(USER_B),
    });

    expect(openRouterFetch).toHaveBeenCalledOnce();
    const authorization = authorizationHeader(openRouterFetch.mock.calls[0]?.[1]);
    expect(authorization).toBe(`Bearer ${KEY_B}`);
    expect(authorization).not.toContain(KEY_A);
    expect(store.flashcards).toHaveLength(1);
    expect(store.flashcards[0]?.user_id).toBe(USER_B);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.wordPhrase).toBe(CARD.wordPhrase);
  });
});
