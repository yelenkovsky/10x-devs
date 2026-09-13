// @ts-check
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

/**
 * Astro's `astro:env/server` snapshot in `astro dev` comes from Vite `loadEnv`,
 * which reads `.env*` — not Wrangler `.dev.vars`. Copy unset keys so local
 * Cloudflare secrets (including USER_SECRETS_KEY) are visible to that snapshot.
 */
function loadDevVarsIntoProcessEnv() {
  const file = resolve(fileURLToPath(new URL(".", import.meta.url)), ".dev.vars");
  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDevVarsIntoProcessEnv();

/** Workerd SSR lazy-optimizes new bare imports (e.g. ts-fsrs) and reloads React twice. */
function prebundleReactForWorkerd() {
  return {
    name: "prebundle-react-for-workerd",
    configEnvironment(environment) {
      if (environment === "client") {
        return;
      }
      return {
        optimizeDeps: {
          include: [
            "react",
            "react-dom",
            "react-dom/client",
            "react-dom/server",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "astro/env/runtime",
            "ts-fsrs",
            "lucide-react",
            "zod",
            "@radix-ui/react-slot",
          ],
        },
      };
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss(), prebundleReactForWorkerd()],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "astro/env/runtime",
      ],
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      USER_SECRETS_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
