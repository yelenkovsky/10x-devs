import { env } from "cloudflare:workers";
import { USER_SECRETS_KEY } from "astro:env/server";

/**
 * Local `astro dev` (workerd) loads wrapping keys from `.dev.vars` into the
 * Worker env. Astro's `astro:env/server` snapshot still comes from Vite
 * `.env*` files, so the imported binding can be empty even when save can work.
 */
export function getUserSecretsKey(): string | undefined {
  if (USER_SECRETS_KEY) {
    return USER_SECRETS_KEY;
  }

  const fromWorker = (env as { USER_SECRETS_KEY?: unknown }).USER_SECRETS_KEY;
  return typeof fromWorker === "string" && fromWorker.length > 0 ? fromWorker : undefined;
}
