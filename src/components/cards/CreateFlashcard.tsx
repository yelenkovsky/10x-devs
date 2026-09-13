import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { FLASHCARD_FIELDS, type FlashcardFieldKey } from "@/components/cards/card-fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Flashcard } from "@/types";

const GENERIC_CREATE_ERROR = "Could not create the card. Try again.";
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

const createCardResponseSchema = z.object({
  card: flashcardSchema,
});

const createErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

const FIELD_HINTS: Record<FlashcardFieldKey, string> = {
  cloze: "An everyday sentence with _____ for the target — not a C1/C2 showpiece.",
  wordPhrase: "The word or phrase that fills the gap.",
  fullSentence: "The same sentence with the gap filled.",
  definition: "A short everyday English meaning of the target.",
  collocationPattern: "The collocation or grammar pattern this sentence teaches.",
  translationPl: "A natural Polish translation of the full sentence.",
};

type CreateDraft = Record<FlashcardFieldKey, string>;
type FieldErrors = Partial<Record<FlashcardFieldKey, string>>;

const fieldInputClass =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none";

interface CreateFlashcardProps {
  onCreated: (card: Flashcard) => void;
}

export function CreateFlashcard({ onCreated }: CreateFlashcardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setDraft(emptyDraft());
    setFieldErrors({});
    setError(null);
    setIsOpen(true);
  }

  function cancelForm() {
    setIsOpen(false);
    setFieldErrors({});
    setError(null);
    setDraft(emptyDraft());
  }

  function updateDraft(key: FlashcardFieldKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  async function submitCreate(fields: CreateDraft) {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/cards/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = createErrorSchema.safeParse(payload);
        setError(parsedError.success ? parsedError.data.error : GENERIC_CREATE_ERROR);
        return;
      }

      const parsed = createCardResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setError(GENERIC_CREATE_ERROR);
        return;
      }

      onCreated(parsed.data.card);
      setDraft(emptyDraft());
      setFieldErrors({});
      setError(null);
      setIsOpen(false);
    } catch {
      setError(GENERIC_CREATE_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  function handleSave() {
    if (isPending) {
      return;
    }

    const nextErrors: FieldErrors = {};
    const trimmed = {} as CreateDraft;

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

    void submitCreate(trimmed);
  }

  if (!isOpen) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
        <Button type="button" className={primaryButtonClass} onClick={openForm}>
          Create a card by hand
        </Button>
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
      noValidate
      aria-busy={isPending}
    >
      <h2 className="text-lg font-semibold text-white">Create a card by hand</h2>
      <p className="mt-1 text-sm text-blue-100/70">
        Teach typical everyday use: context, collocation, and a grammar pattern — not a literary showpiece.
      </p>

      <div className="mt-4 space-y-3">
        {FLASHCARD_FIELDS.map((field) => (
          <CreateField
            key={field.key}
            id={`create-${field.key}`}
            label={field.label}
            hint={FIELD_HINTS[field.key]}
            value={draft[field.key]}
            multiline={field.multiline}
            error={fieldErrors[field.key]}
            disabled={isPending}
            onChange={(value) => {
              updateDraft(field.key, value);
            }}
          />
        ))}
      </div>

      {isPending ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-lg border border-purple-400/30 bg-purple-900/20 px-3 py-2 text-sm text-blue-100"
          role="status"
          aria-live="polite"
        >
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Saving…
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

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" disabled={isPending} className={secondaryButtonClass} onClick={cancelForm}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CreateField({
  id,
  label,
  hint,
  value,
  multiline,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
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
      <p className="mb-1 text-xs text-blue-100/55">{hint}</p>
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

function emptyDraft(): CreateDraft {
  return {
    cloze: "",
    wordPhrase: "",
    fullSentence: "",
    definition: "",
    collocationPattern: "",
    translationPl: "",
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
