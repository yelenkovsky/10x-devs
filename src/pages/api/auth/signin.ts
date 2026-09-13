import type { APIRoute } from "astro";
import { authPageQuery, credentialsSchema, mapAuthError, safeReturnPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const SEE_OTHER = 303;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const next = safeReturnPath(form.get("next"), context.url);

  const parsed = credentialsSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!parsed.success) {
    const mapped = mapAuthError({}, "signin");
    return context.redirect(`/auth/signin${authPageQuery({ error: mapped.message, next })}`, SEE_OTHER);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin${authPageQuery({ next })}`, SEE_OTHER);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const mapped = mapAuthError(error, "signin");
    return context.redirect(`/auth/${mapped.page}${authPageQuery({ error: mapped.message, next })}`, SEE_OTHER);
  }

  return context.redirect(next, SEE_OTHER);
};
