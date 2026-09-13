// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

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
