import React, { useState } from "react";
import { CircleAlert, Sparkles } from "lucide-react";
import { z } from "zod";
import { FlashcardItem } from "@/components/cards/FlashcardItem";
import { useElapsedSeconds } from "@/components/hooks/useElapsedSeconds";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/types";

const MAX_PASTE_LENGTH = 4000;
const EMPTY_PASTE_MESSAGE = "Paste a word list or a short paragraph first. Empty text cannot generate cards.";
const PASTE_TOO_LONG_MESSAGE = "Paste is too long. Use 4000 characters or fewer.";
const GENERIC_GENERATE_ERROR = "Generation is temporarily unavailable. Try again.";
const LOAD_ERROR_MESSAGE = "Cards could not be loaded. Refresh to try again.";

const flashcardSchema = z.object({
  id: z.string(),
  userId: z.string(),
  generationId: z.string(),
  status: z.enum(["generated", "kept"]),
  cloze: z.string(),
  wordPhrase: z.string(),
  fullSentence: z.string(),
  definition: z.string(),
  collocationPattern: z.string(),
  translationPl: z.string(),
  createdAt: z.string(),
});

const generateResponseSchema = z.object({
  cards: z.array(flashcardSchema),
  failedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  cap: z.number().int().positive(),
});

const generateErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

interface PasteGenerateProps {
  initialCards: Flashcard[];
  loadError?: boolean;
}

interface BatchNotes {
  failedCount: number;
  truncated: boolean;
  cap: number;
}

export default function PasteGenerate({ initialCards, loadError = false }: PasteGenerateProps) {
  const [paste, setPaste] = useState("");
  const [cards, setCards] = useState(initialCards);
  const [emptyState, setEmptyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchNotes, setBatchNotes] = useState<BatchNotes | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const elapsedSeconds = useElapsedSeconds(startedAt);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = paste.trim();

    if (trimmed === "") {
      setEmptyState(true);
      setError(null);
      setBatchNotes(null);
      return;
    }

    if (trimmed.length > MAX_PASTE_LENGTH) {
      setEmptyState(false);
      setError(PASTE_TOO_LONG_MESSAGE);
      setBatchNotes(null);
      return;
    }

    setEmptyState(false);
    setError(null);
    setBatchNotes(null);
    setStartedAt(Date.now());
    setIsGenerating(true);

    try {
      const response = await fetch("/api/cards/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paste: trimmed }),
      });

      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = generateErrorSchema.safeParse(payload);
        if (parsedError.success && parsedError.data.code === "empty_paste") {
          setEmptyState(true);
          return;
        }
        setError(parsedError.success ? parsedError.data.error : GENERIC_GENERATE_ERROR);
        return;
      }

      const parsed = generateResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError(GENERIC_GENERATE_ERROR);
        return;
      }

      setCards((current) => [...parsed.data.cards, ...current]);
      setBatchNotes({
        failedCount: parsed.data.failedCount,
        truncated: parsed.data.truncated,
        cap: parsed.data.cap,
      });
    } catch {
      setError(GENERIC_GENERATE_ERROR);
    } finally {
      setIsGenerating(false);
      setStartedAt(null);
    }
  }

  const pasteError = emptyState || error === PASTE_TOO_LONG_MESSAGE;

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isGenerating}
      >
        <div>
          <label htmlFor="paste" className="mb-1 block text-sm text-blue-100/80">
            Paste a word list or short text
          </label>
          <textarea
            id="paste"
            name="paste"
            rows={8}
            value={paste}
            disabled={isGenerating}
            onChange={(event) => {
              setPaste(event.target.value);
              if (emptyState) {
                setEmptyState(false);
              }
              if (error === PASTE_TOO_LONG_MESSAGE) {
                setError(null);
              }
            }}
            placeholder="apple / banana / run — or a short paragraph"
            className={cn(
              "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none",
              pasteError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
          <p className="mt-1 text-xs text-blue-100/50">
            {paste.length}/{MAX_PASTE_LENGTH} characters. The first 15 items are used.
          </p>
        </div>

        {emptyState ? (
          <p
            className="mt-4 flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-100/80"
            role="status"
          >
            <CircleAlert className="size-4 shrink-0" />
            {EMPTY_PASTE_MESSAGE}
          </p>
        ) : null}

        {error ? (
          <p
            className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {isGenerating ? (
          <div
            className="mt-4 flex items-center gap-3 rounded-lg border border-purple-400/30 bg-purple-900/20 px-3 py-3 text-sm text-blue-100"
            role="status"
            aria-live="polite"
          >
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <div>
              <p>Generating typical-use cloze cards…</p>
              <p className="text-xs text-blue-100/60">Elapsed {elapsedSeconds}s</p>
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={isGenerating}
          className="mt-4 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Generate
            </span>
          )}
        </Button>
      </form>

      {batchNotes?.failedCount ? (
        <p className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-100/80" role="status">
          {batchNotes.failedCount} {batchNotes.failedCount === 1 ? "card" : "cards"} from this batch could not be saved.
        </p>
      ) : null}

      {batchNotes?.truncated ? (
        <p className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-100/80" role="status">
          Using the first {batchNotes.cap} items from this paste.
        </p>
      ) : null}

      {loadError && cards.length === 0 && !isGenerating ? (
        <p
          className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-900/30 px-4 py-6 text-center text-sm text-red-300"
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" />
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}

      {!loadError && cards.length === 0 && !isGenerating ? (
        <p
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-blue-100/60"
          role="status"
        >
          No cards yet. Generate from a paste above. They stay on this account after refresh.
        </p>
      ) : null}

      {cards.length > 0 ? (
        <ol className="space-y-4">
          {cards.map((card) => (
            <li key={card.id}>
              <FlashcardItem
                card={card}
                onUpdated={(updated) => {
                  setCards((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                }}
                onDeleted={(id) => {
                  setCards((current) => current.filter((item) => item.id !== id));
                }}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
