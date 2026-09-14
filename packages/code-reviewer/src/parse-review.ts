import { REVIEW_SCHEMA, type Review } from "./review-schema.ts";

export function parseReview(text: string): Review {
  const parsed = REVIEW_SCHEMA.safeParse(extractJsonObject(text));
  if (!parsed.success) {
    throw new Error(`Invalid structured output: ${parsed.error.message}`);
  }
  return parsed.data;
}

function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const withVerdict = extractObjectContaining(candidate, "verdict");
  if (withVerdict !== undefined) {
    return withVerdict;
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Agent reply contained no JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function extractObjectContaining(text: string, key: string): unknown {
  const needle = `"${key}"`;
  let from = 0;
  while (from < text.length) {
    const keyAt = text.indexOf(needle, from);
    if (keyAt === -1) {
      return undefined;
    }
    const start = text.lastIndexOf("{", keyAt);
    if (start === -1) {
      from = keyAt + needle.length;
      continue;
    }
    const extracted = parseBalancedObject(text, start);
    if (extracted !== undefined) {
      return extracted;
    }
    from = keyAt + needle.length;
  }
  return undefined;
}

function parseBalancedObject(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}
