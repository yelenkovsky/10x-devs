import type { APIRoute } from "astro";
import { SIGNUP_NOTICE, authPageQuery, credentialsSchema, mapAuthError, safeReturnPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const SEE_OTHER = 303;

function isDuplicateSignup(code: string | undefined): boolean {
  return code === "user_already_exists" || code === "email_exists";
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const next = safeReturnPath(form.get("next"), context.url);

  const parsed = credentialsSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!parsed.success) {
    const mapped = mapAuthError({}, "signup");
    return context.redirect(`/auth/signup${authPageQuery({ error: mapped.message, next })}`, SEE_OTHER);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup${authPageQuery({ next })}`, SEE_OTHER);
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: new URL("/auth/confirm-email", context.url).href,
    },
  });

  if (error) {
    if (isDuplicateSignup(error.code)) {
      return context.redirect(`/auth/signin${authPageQuery({ notice: SIGNUP_NOTICE, next })}`, SEE_OTHER);
    }

    const mapped = mapAuthError(error, "signup");
    return context.redirect(`/auth/${mapped.page}${authPageQuery({ error: mapped.message, next })}`, SEE_OTHER);
  }

  if (data.session) {
    return context.redirect(next, SEE_OTHER);
  }

  return context.redirect(`/auth/signin${authPageQuery({ notice: SIGNUP_NOTICE, next })}`, SEE_OTHER);
};
