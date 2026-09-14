// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PasteGenerate from "@/components/cards/PasteGenerate";
import type { Flashcard } from "@/types";

const INITIAL_CARD: Flashcard = {
  id: "card-initial-phase2",
  userId: "user-a",
  generationId: "gen-initial-phase2",
  status: "generated",
  cloze: "They _____ the beans.",
  wordPhrase: "phase2-progress-brew",
  fullSentence: "They brew the beans.",
  definition: "make coffee by pouring hot water",
  collocationPattern: "brew + drink",
  translationPl: "Parzą ziarna.",
  createdAt: "2026-09-13T00:00:00.000Z",
};

const GENERATE_ERROR = "Generation timed out. Try again.";
const GENERIC_GENERATE_ERROR = "Generation is temporarily unavailable. Try again.";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function stubGenerateFetch(impl: () => Promise<Response>): void {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(input).includes("/api/cards/generate")) {
      return impl();
    }
    return originalFetch(input, init);
  });
}

function jsonErrorResponse(status: number, body: { error: string; code: string }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOkResponse(body: { cards: Flashcard[]; failedCount: number; truncated: boolean; cap: number }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const GENERATED_CARD: Flashcard = {
  ...INITIAL_CARD,
  id: "card-generated",
  generationId: "gen-generated",
  wordPhrase: "apple",
  cloze: "An _____ a day.",
  fullSentence: "An apple a day.",
};

const TRUNCATION_BANNER = "Using the first 15 items from this paste.";
const HELPER_CUT_CLAIM = "The first 15 items are used.";
const UNMATCHED_PASTE_MESSAGE = "None of the cards matched this paste.";
const EMPTY_DECK_COPY =
  "No cards yet. Generate from a paste above or create a card by hand. They stay on this account after refresh.";

function assertInitialCardsUnchanged(): void {
  expect(screen.getAllByRole("heading", { name: INITIAL_CARD.wordPhrase })).toHaveLength(1);
  expect(screen.getAllByRole("article")).toHaveLength(1);
}

function pasteAndSubmitGenerate(): void {
  fireEvent.change(screen.getByLabelText(/paste a word list or short text/i), {
    target: { value: "apple banana" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^generate$/i }));
}

describe("PasteGenerate progress visibility", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows status and elapsed while generate fetch is pending, then alerts without prepending on 503", async () => {
    vi.useFakeTimers();
    const { promise, resolve } = Promise.withResolvers<Response>();
    stubGenerateFetch(() => promise);

    render(<PasteGenerate initialCards={[INITIAL_CARD]} configured />);
    pasteAndSubmitGenerate();

    expect(screen.getByText("Generating typical-use cloze cards…")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Elapsed 0s")).toBeTruthy();
    assertInitialCardsUnchanged();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Elapsed 1s")).toBeTruthy();
    assertInitialCardsUnchanged();

    await act(async () => {
      resolve(
        jsonErrorResponse(503, {
          error: GENERATE_ERROR,
          code: "generation_timeout",
        }),
      );
      await promise;
    });

    expect(screen.getByRole("alert").textContent).toContain(GENERATE_ERROR);
    expect(screen.queryByText("Generating typical-use cloze cards…")).toBeNull();
    assertInitialCardsUnchanged();
  });

  it("shows a generic alert and does not prepend cards when the generate body is unparseable", async () => {
    stubGenerateFetch(() => Promise.resolve(new Response("not-json", { status: 503 })));

    const user = userEvent.setup();
    render(<PasteGenerate initialCards={[INITIAL_CARD]} configured />);
    await user.type(screen.getByLabelText(/paste a word list or short text/i), "apple banana");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    expect(screen.getByRole("alert").textContent).toContain(GENERIC_GENERATE_ERROR);
    expect(screen.queryByText("Generating typical-use cloze cards…")).toBeNull();
    assertInitialCardsUnchanged();
  });

  it("disables Generate and does not fetch when configured is false", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<PasteGenerate initialCards={[INITIAL_CARD]} configured={false} />);

    const generate = screen.getByRole("button", { name: /^generate$/i });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: /^settings$/i }).getAttribute("href")).toBe("/settings");

    fireEvent.change(screen.getByLabelText(/paste a word list or short text/i), {
      target: { value: "apple banana" },
    });
    const form = generate.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("expected generate form");
    }
    fireEvent.submit(form);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Generating typical-use cloze cards…")).toBeNull();
    assertInitialCardsUnchanged();
  });

  it("shows a key-load alert and hides the Settings CTA when key status is unknown", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<PasteGenerate initialCards={[INITIAL_CARD]} configured={false} keyLoadError />);

    const generate = screen.getByRole("button", { name: /^generate$/i });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load your OpenRouter key status. Refresh to try again.",
    );
    expect(screen.queryByRole("link", { name: /^settings$/i })).toBeNull();

    const form = generate.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("expected generate form");
    }
    fireEvent.submit(form);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PasteGenerate batch notes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps helper copy from claiming the first 15 items are always used", () => {
    render(<PasteGenerate initialCards={[]} configured />);

    expect(screen.queryByText(HELPER_CUT_CLAIM)).toBeNull();
    expect(screen.getByText("0/4000 characters.")).toBeTruthy();
  });

  it("does not show the truncation banner when truncated is false", async () => {
    stubGenerateFetch(() =>
      Promise.resolve(
        jsonOkResponse({
          cards: [GENERATED_CARD],
          failedCount: 0,
          truncated: false,
          cap: 15,
        }),
      ),
    );

    const user = userEvent.setup();
    render(<PasteGenerate initialCards={[]} configured />);
    await user.type(screen.getByLabelText(/paste a word list or short text/i), "apple / banana / run");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    expect(await screen.findByRole("heading", { name: GENERATED_CARD.wordPhrase })).toBeTruthy();
    expect(screen.queryByText(TRUNCATION_BANNER)).toBeNull();
    expect(screen.queryByText(HELPER_CUT_CLAIM)).toBeNull();
  });

  it("shows the truncation banner when truncated is true", async () => {
    stubGenerateFetch(() =>
      Promise.resolve(
        jsonOkResponse({
          cards: [GENERATED_CARD],
          failedCount: 0,
          truncated: true,
          cap: 15,
        }),
      ),
    );

    const user = userEvent.setup();
    render(<PasteGenerate initialCards={[]} configured />);
    await user.type(screen.getByLabelText(/paste a word list or short text/i), "apple / banana / run");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    expect(await screen.findByText(TRUNCATION_BANNER)).toBeTruthy();
    expect(screen.getByText(TRUNCATION_BANNER).getAttribute("role")).toBe("status");
  });

  it("shows unmatched-paste status on empty 200 with failedCount, not empty-deck or a 503 alert", async () => {
    stubGenerateFetch(() =>
      Promise.resolve(
        jsonOkResponse({
          cards: [],
          failedCount: 15,
          truncated: false,
          cap: 15,
        }),
      ),
    );

    const user = userEvent.setup();
    render(<PasteGenerate initialCards={[]} configured />);
    expect(screen.getByText(EMPTY_DECK_COPY)).toBeTruthy();

    await user.type(screen.getByLabelText(/paste a word list or short text/i), "apple / banana / run");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    const unmatched = await screen.findByText(UNMATCHED_PASTE_MESSAGE);
    expect(unmatched.getAttribute("role")).toBe("status");
    expect(screen.queryByText(EMPTY_DECK_COPY)).toBeNull();
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(TRUNCATION_BANNER)).toBeNull();
  });

  it("shows unmatched-paste status on a nonempty deck when this batch saved nothing", async () => {
    stubGenerateFetch(() =>
      Promise.resolve(
        jsonOkResponse({
          cards: [],
          failedCount: 15,
          truncated: false,
          cap: 15,
        }),
      ),
    );

    const user = userEvent.setup();
    render(<PasteGenerate initialCards={[INITIAL_CARD]} configured />);
    await user.type(screen.getByLabelText(/paste a word list or short text/i), "apple / banana / run");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    const unmatched = await screen.findByText(UNMATCHED_PASTE_MESSAGE);
    expect(unmatched.getAttribute("role")).toBe("status");
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
    expect(screen.queryByText(EMPTY_DECK_COPY)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    assertInitialCardsUnchanged();
  });
});
