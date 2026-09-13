import { z } from "zod";

export const PROTECTED_ROUTES = ["/dashboard"] as const;

export const DEFAULT_RETURN_PATH = "/dashboard";

/** Same copy for no-session signup and duplicate-email codes — not “this email is taken”. */
export const SIGNUP_NOTICE =
  "If you already have an account, sign in. If you just registered, check your email to confirm, then sign in.";

const AUTH_PATHNAMES = new Set(["/auth/signin", "/auth/signup", "/auth/confirm-email"]);

const CREDENTIALS_MESSAGE = "Invalid email or password.";
const EMAIL_NOT_CONFIRMED_MESSAGE = "Check your email to confirm your account, then sign in.";
const WEAK_PASSWORD_MESSAGE = "Password must be at least 6 characters.";
const RATE_LIMIT_MESSAGE = "Too many attempts. Wait a few minutes and try again.";
const GENERIC_SIGNUP_FAILURE = "Could not create the account. Try again.";

export const credentialsSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(6),
});

export type AuthFormPage = "signin" | "signup";

export interface MappedAuthError {
  page: AuthFormPage;
  message: string;
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Query string for auth HTML pages: mapped error/notice plus a non-default safe `next`. */
export function authPageQuery(input: { error?: string | null; notice?: string | null; next?: string | null }): string {
  const params = new URLSearchParams();
  if (input.error) {
    params.set("error", input.error);
  }
  if (input.notice) {
    params.set("notice", input.notice);
  }
  if (input.next && input.next !== DEFAULT_RETURN_PATH) {
    params.set("next", input.next);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Return-path rule: parse with new URL(raw, base), require same origin,
 * re-serialize as pathname + search, then reject a leading "//" or an
 * auth pathname. Return the re-serialized string, never the raw input.
 *
 * The post-parse `//` check is load-bearing for raw `//host` values.
 * Node's URL parser does not strip percent-encoded C0 controls from the
 * pathname (`/%09//evil.com` stays encoded, same origin), so we also
 * decode and reject tab/newline/CR smuggling that a Location header would
 * turn into a protocol-relative redirect.
 */
export function safeReturnPath(raw: unknown, base: string | URL): string {
  if (typeof raw !== "string" || raw === "") {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const url = new URL(raw, base);
    const origin = new URL(base).origin;

    if (url.origin !== origin) {
      return DEFAULT_RETURN_PATH;
    }

    const serialized = `${url.pathname}${url.search}`;
    if (serialized.startsWith("//") || AUTH_PATHNAMES.has(url.pathname)) {
      return DEFAULT_RETURN_PATH;
    }

    const decoded = decodeURI(serialized);
    for (let i = 0; i < decoded.length; i += 1) {
      const code = decoded.charCodeAt(i);
      if (code <= 31 || code === 127) {
        return DEFAULT_RETURN_PATH;
      }
    }

    return serialized;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

export function mapAuthError(error: { code?: string | null }, flow: AuthFormPage = "signin"): MappedAuthError {
  switch (error.code) {
    case "invalid_credentials":
      return { page: "signin", message: CREDENTIALS_MESSAGE };
    case "email_not_confirmed":
      return { page: "signin", message: EMAIL_NOT_CONFIRMED_MESSAGE };
    case "user_already_exists":
    case "email_exists":
      return { page: "signin", message: SIGNUP_NOTICE };
    case "weak_password":
      return { page: "signup", message: WEAK_PASSWORD_MESSAGE };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return { page: flow, message: RATE_LIMIT_MESSAGE };
    default:
      return {
        page: flow,
        message: flow === "signin" ? CREDENTIALS_MESSAGE : GENERIC_SIGNUP_FAILURE,
      };
  }
}

export function requireUser(locals: App.Locals): Response | null {
  if (locals.user !== null) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
