/// <reference types="vitest/config" />
import type { AstroIntegration } from "astro";
import { getViteConfig } from "astro/config";

/** Test-only adapter so Vitest does not load `@astrojs/cloudflare` / workerd (#15847 / #15878). */
function vitestNodeAdapter(): AstroIntegration {
  return {
    name: "vitest-node-adapter",
    hooks: {
      "astro:config:done": ({ setAdapter }) => {
        setAdapter({
          name: "vitest-node-adapter",
          entrypointResolution: "auto",
          serverEntrypoint: "astro/app/node",
          supportedAstroFeatures: {
            envGetSecret: "unsupported",
            serverOutput: "stable",
            sharpImageService: { support: "unsupported", suppress: "all" },
          },
        });
      },
    },
  };
}

export default getViteConfig(
  {
    test: {
      environment: "node",
    },
  },
  {
    // Production `adapter: cloudflare()` cannot be replaced via merge (objects deep-merge).
    configFile: false,
    output: "server",
    adapter: vitestNodeAdapter(),
  },
);
