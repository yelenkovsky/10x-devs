import { SUPABASE_URL, SUPABASE_KEY, USER_SECRETS_KEY } from "astro:env/server";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
  {
    name: "User secrets key",
    configured: Boolean(USER_SECRETS_KEY),
    message: "User secrets key is not configured — saving API keys is disabled.",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
