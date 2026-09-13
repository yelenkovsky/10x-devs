import React, { useState } from "react";
import { CircleAlert, KeyRound } from "lucide-react";
import { z } from "zod";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { Button } from "@/components/ui/button";
import type { OpenRouterKeyStatus } from "@/types";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
const GENERIC_SAVE_ERROR = "Could not save the API key. Try again.";
const GENERIC_REMOVE_ERROR = "Could not remove the API key. Try again.";
const LOAD_ERROR_MESSAGE = "Could not load your saved key. Refresh to try again.";

const keyStatusSchema = z.object({
  configured: z.boolean(),
  last4: z.string().optional(),
});

const errorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

interface OpenRouterKeyFormProps {
  initialStatus: OpenRouterKeyStatus;
  loadError?: boolean;
}

export default function OpenRouterKeyForm({ initialStatus, loadError = false }: OpenRouterKeyFormProps) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSave(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/settings/openrouter-key", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = errorSchema.safeParse(payload);
        setError(parsedError.success ? parsedError.data.error : GENERIC_SAVE_ERROR);
        return;
      }

      const parsed = keyStatusSchema.safeParse(payload);
      if (!parsed.success || !parsed.data.configured) {
        setError(GENERIC_SAVE_ERROR);
        return;
      }

      setStatus({ configured: true, last4: parsed.data.last4 });
      setApiKey("");
      setShowKey(false);
    } catch {
      setError(GENERIC_SAVE_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/settings/openrouter-key", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload: unknown = await parseJson(response);

      if (!response.ok) {
        const parsedError = errorSchema.safeParse(payload);
        setError(parsedError.success ? parsedError.data.error : GENERIC_REMOVE_ERROR);
        return;
      }

      const parsed = keyStatusSchema.safeParse(payload);
      if (!parsed.success || parsed.data.configured) {
        setError(GENERIC_REMOVE_ERROR);
        return;
      }

      setStatus({ configured: false });
      setApiKey("");
      setShowKey(false);
    } catch {
      setError(GENERIC_REMOVE_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
      <h2 className="text-lg font-semibold text-blue-50">OpenRouter API key</h2>
      <p className="mt-2 text-sm text-blue-100/70">
        Generate uses the key you save here. We store it encrypted and only show the last four characters.
      </p>
      <p className="mt-2 text-sm text-blue-100/70">
        <a
          href={OPENROUTER_KEYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-300 underline-offset-4 hover:text-purple-100 hover:underline"
        >
          Create an OpenRouter key
        </a>
      </p>

      {loadError ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" />
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}

      {status.configured && status.last4 ? (
        <p className="mt-4 text-sm text-blue-100/80" role="status">
          Saved key ending in <span className="font-mono tracking-wide text-white">{status.last4}</span>
        </p>
      ) : null}

      <form className="mt-4 space-y-4" onSubmit={handleSave} noValidate>
        <FormField
          id="openrouter-api-key"
          name="apiKey"
          label="OpenRouter API key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            if (error) setError(null);
          }}
          placeholder="sk-or-…"
          error={error ?? undefined}
          icon={<KeyRound className="size-4" />}
          endContent={
            <PasswordToggle
              visible={showKey}
              onToggle={() => {
                setShowKey(!showKey);
              }}
            />
          }
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending} className={primaryButtonClass}>
            {isPending ? (status.configured ? "Replacing…" : "Saving…") : status.configured ? "Replace" : "Save"}
          </Button>
          {status.configured ? (
            <Button type="button" disabled={isPending} className={secondaryButtonClass} onClick={handleRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
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
