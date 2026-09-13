import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { FLASHCARD_FIELDS, type FlashcardFieldKey } from "@/components/cards/card-fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Flashcard, MutateFlashcardRequest } from "@/types";

const GENERIC_MUTATE_ERROR = "Could not change the card. Try again.";
const NOT_FOUND_ERROR = "Card not found.";
const REQUIRED_FIELD_ERROR = "This field is required.";

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

const mutateCardResponseSchema = z.object({
  card: flashcardSchema,
});

const mutateDeleteResponseSchema = z.object({
  id: z.string(),
});

const mutateErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

type EditDraft = Record<FlashcardFieldKey, string>;
type FieldErrors = Partial<Record<FlashcardFieldKey, string>>;

const fieldInputClass =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none";

interface FlashcardItemProps {
  card: Flashcard;
  onUpdated: (card: Flashcard) => void;
  onDeleted: (id: string) => void;
}

export function FlashcardItem({ card, onUpdated, onDeleted }: FlashcardItemProps) {
  const [isPending, setIsPending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>(() => draftFromCard(card));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function openEdit() {
    setDraft(draftFromCard(card));
    setFieldErrors({});
    setError(null);
    setConfirmDelete(false);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setFieldErrors({});
    setDraft(draftFromCard(card));
  }

  function updateDraft(key: FlashcardFieldKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  async function runAction(request: MutateFlashcardRequest) {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/cards/${card.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = mutateErrorSchema.safeParse(payload);
        if (parsedError.success && (parsedError.data.code === "not_found" || response.status === 404)) {
          setError(NOT_FOUND_ERROR);
          return;
        }
        setError(parsedError.success ? parsedError.data.error : GENERIC_MUTATE_ERROR);
        return;
      }

      if (request.action === "delete") {
        const parsed = mutateDeleteResponseSchema.safeParse(payload);
        if (!parsed.success) {
          setError(GENERIC_MUTATE_ERROR);
          return;
        }
        onDeleted(parsed.data.id);
        return;
      }

      const parsed = mutateCardResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError(GENERIC_MUTATE_ERROR);
        return;
      }

      onUpdated(parsed.data.card);
      setIsEditing(false);
      setConfirmDelete(false);
      setDraft(draftFromCard(parsed.data.card));
    } catch {
      setError(GENERIC_MUTATE_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  function handleSave() {
    const nextErrors: FieldErrors = {};
    const trimmed = {} as EditDraft;

    for (const field of FLASHCARD_FIELDS) {
      const value = draft[field.key].trim();
      trimmed[field.key] = value;
      if (value === "") {
        nextErrors[field.key] = REQUIRED_FIELD_ERROR;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    void runAction({ action: "edit", ...trimmed });
  }

  return (
    <article
      className="rounded-2xl border border-white/10 bg-white/10 p-5 text-white backdrop-blur-xl"
      aria-busy={isPending}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{card.wordPhrase}</h3>
        <StatusBadge status={card.status} />
      </div>

      {isEditing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
          noValidate
        >
          {FLASHCARD_FIELDS.map((field) => (
            <EditField
              key={field.key}
              id={`${card.id}-${field.key}`}
              label={field.label}
              value={draft[field.key]}
              multiline={field.multiline}
              error={fieldErrors[field.key]}
              disabled={isPending}
              onChange={(value) => {
                updateDraft(field.key, value);
              }}
            />
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={isPending} className={primaryButtonClass}>
              Save
            </Button>
            <Button type="button" disabled={isPending} className={secondaryButtonClass} onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 space-y-3 text-sm">
          {FLASHCARD_FIELDS.map((field) => (
            <CardField key={field.key} label={field.label} value={card[field.key]} />
          ))}
        </dl>
      )}

      {error ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {isEditing ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          {confirmDelete ? (
            <>
              <Button
                type="button"
                disabled={isPending}
                className={dangerButtonClass}
                onClick={() => {
                  void runAction({ action: "delete" });
                }}
              >
                Confirm
              </Button>
              <Button
                type="button"
                disabled={isPending}
                className={secondaryButtonClass}
                onClick={() => {
                  setConfirmDelete(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {card.status === "generated" ? (
                <Button
                  type="button"
                  disabled={isPending}
                  className={primaryButtonClass}
                  onClick={() => {
                    void runAction({ action: "keep" });
                  }}
                >
                  Accept
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isPending}
                  className={secondaryButtonClass}
                  onClick={() => {
                    void runAction({ action: "unkeep" });
                  }}
                >
                  Un-keep
                </Button>
              )}
              <Button type="button" disabled={isPending} className={secondaryButtonClass} onClick={openEdit}>
                Edit
              </Button>
              <Button
                type="button"
                disabled={isPending}
                className={dangerOutlineButtonClass}
                onClick={() => {
                  setError(null);
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: Flashcard["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium tracking-wide uppercase",
        status === "kept"
          ? "border border-emerald-400/40 bg-emerald-900/30 text-emerald-200"
          : "border border-amber-400/40 bg-amber-900/30 text-amber-200",
      )}
    >
      {status}
    </span>
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

function EditField({
  id,
  label,
  value,
  multiline,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  multiline: boolean;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const fieldClass = cn(
    fieldInputClass,
    error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
  );

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs tracking-wide text-blue-100/50 uppercase">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={fieldClass}
        />
      ) : (
        <input
          id={id}
          name={id}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={fieldClass}
        />
      )}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function draftFromCard(card: Flashcard): EditDraft {
  return {
    cloze: card.cloze,
    wordPhrase: card.wordPhrase,
    fullSentence: card.fullSentence,
    definition: card.definition,
    collocationPattern: card.collocationPattern,
    translationPl: card.translationPl,
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

const primaryButtonClass =
  "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500";
const secondaryButtonClass =
  "rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20";
const dangerButtonClass =
  "rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600";
const dangerOutlineButtonClass =
  "rounded-lg border border-red-400/40 bg-red-900/20 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/40";
