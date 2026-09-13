import { defineMiddleware } from "astro:middleware";
import { isProtectedPath, safeReturnPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase";

const GUEST_ONLY_PATHS = new Set(["/auth/signin", "/auth/signup"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname, search } = context.url;

  // Append any S-01 HTML route that keeps a deck to PROTECTED_ROUTES in src/lib/auth.ts.
  // JSON writes must call requireUser (401), not this HTML redirect.
  if (isProtectedPath(pathname) && !context.locals.user) {
    const returnPath = safeReturnPath(`${pathname}${search}`, context.url);
    return context.redirect(`/auth/signin?next=${encodeURIComponent(returnPath)}`);
  }

  if (context.locals.user && GUEST_ONLY_PATHS.has(pathname)) {
    return context.redirect(safeReturnPath(context.url.searchParams.get("next"), context.url));
  }

  return next();
});
