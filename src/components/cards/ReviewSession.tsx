import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewGrade, ReviewSessionPayload } from "@/types";

const GENERIC_GRADE_ERROR = "Could not save the grade. Try again.";
const NOT_FOUND_ERROR = "Card not found.";
const LOAD_ERROR_MESSAGE = "Review session could not be loaded. Refresh to try again.";
const NO_KEPT_MESSAGE = "No kept cards to review. Accept cards on the dashboard or create a card by hand.";
const NONE_DUE_MESSAGE = "You're caught up — no kept cards are due right now.";

const reviewCardSchema = z.object({
  id: z.string(),
  cloze: z.string(),
  wordPhrase: z.string(),
  fullSentence: z.string(),
  definition: z.string(),
  collocationPattern: z.string(),
  translationPl: z.string(),
});

const reviewGradeLabelsSchema = z.object({
  1: z.string(),
  2: z.string(),
  3: z.string(),
  4: z.string(),
});

const reviewSessionSchema = z.object({
  card: reviewCardSchema.nullable(),
  remaining: z.number().int().nonnegative(),
  emptyReason: z.enum(["no_kept", "none_due"]).optional(),
  grades: reviewGradeLabelsSchema.optional(),
});

const reviewErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

const REVEALED_FIELDS = [
  { key: "wordPhrase", label: "Word / phrase" },
  { key: "fullSentence", label: "Full sentence" },
  { key: "definition", label: "Definition" },
  { key: "collocationPattern", label: "Collocation / pattern" },
  { key: "translationPl", label: "Polish translation" },
] as const;

const GRADE_BUTTONS = [
  { grade: 1 as const, name: "Again", className: "border-red-400/40 bg-red-900/20 text-red-200 hover:bg-red-900/40" },
  { grade: 2 as const, name: "Hard", className: "border-white/20 bg-white/10 text-white hover:bg-white/20" },
  { grade: 3 as const, name: "Good", className: "border-purple-400/40 bg-purple-600 text-white hover:bg-purple-500" },
  {
    grade: 4 as const,
    name: "Easy",
    className: "border-emerald-400/40 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50",
  },
];

interface ReviewSessionProps {
  initialSession: ReviewSessionPayload;
  loadError?: boolean;
}

export default function ReviewSession({ initialSession, loadError = false }: ReviewSessionProps) {
  const [session, setSession] = useState(initialSession);
  const [revealed, setRevealed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p
        className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-900/30 px-4 py-6 text-center text-sm text-red-300"
        role="alert"
      >
        <CircleAlert className="size-4 shrink-0" />
        {LOAD_ERROR_MESSAGE}
      </p>
    );
  }

  if (!session.card) {
    const message = session.emptyReason === "none_due" ? NONE_DUE_MESSAGE : NO_KEPT_MESSAGE;
    return <EmptySession message={message} />;
  }

  const { card, grades, remaining } = session;

  async function handleGrade(grade: ReviewGrade) {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, grade }),
      });

      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = reviewErrorSchema.safeParse(payload);
        if (parsedError.success && (parsedError.data.code === "not_found" || response.status === 404)) {
          setError(NOT_FOUND_ERROR);
          return;
        }
        setError(parsedError.success ? parsedError.data.error : GENERIC_GRADE_ERROR);
        return;
      }

      const parsed = reviewSessionSchema.safeParse(payload);
      if (!parsed.success || (parsed.data.card !== null && parsed.data.grades === undefined)) {
        setError(GENERIC_GRADE_ERROR);
        return;
      }

      setSession(parsed.data);
      setRevealed(false);
    } catch {
      setError(GENERIC_GRADE_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <article
      className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
      aria-busy={isPending}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Review</h2>
        <p className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs tracking-wide text-blue-100/70 uppercase">
          {remaining} {remaining === 1 ? "card" : "cards"} remaining
        </p>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
        <CardField label="Cloze" value={card.cloze} />
        {revealed
          ? REVEALED_FIELDS.map((field) => <CardField key={field.key} label={field.label} value={card[field.key]} />)
          : null}
      </dl>

      {error ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {revealed && grades ? (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADE_BUTTONS.map((button) => (
            <Button
              key={button.grade}
              type="button"
              disabled={isPending}
              className={cn("h-auto flex-col rounded-lg border px-3 py-2 text-sm font-medium", button.className)}
              onClick={() => {
                void handleGrade(button.grade);
              }}
            >
              <span>{button.name}</span>
              <span className="text-xs font-normal opacity-80">{grades[button.grade]}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button
          type="button"
          disabled={isPending}
          className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          onClick={() => {
            setError(null);
            setRevealed(true);
          }}
        >
          Reveal
        </Button>
      )}
    </article>
  );
}

function EmptySession({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-blue-100/80"
      role="status"
    >
      <p>{message}</p>
      <a
        href="/dashboard"
        className="mt-4 inline-block rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
      >
        Back to dashboard
      </a>
    </div>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-blue-100/50 uppercase">{label}</dt>
      <dd className="mt-0.5 text-blue-50">{value}</dd>
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
