import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { getUserSecretsKey } from "@/lib/user-secrets-key";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

export function getConfigStatuses(): ConfigStatus[] {
  return [
    {
      name: "Supabase",
      configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
      message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
      docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
      docsLabel: "Zobacz instrukcję konfiguracji",
    },
    {
      name: "User secrets key",
      configured: Boolean(getUserSecretsKey()),
      message: "User secrets key is not configured — saving API keys is disabled.",
    },
  ];
}

export function getMissingConfigs(): ConfigStatus[] {
  return getConfigStatuses().filter((s) => !s.configured);
}
