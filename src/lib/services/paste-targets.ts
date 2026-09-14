export const CARD_CAP = 15;

export interface PasteTargets {
  kind: "list" | "prose";
  haystack: string;
  truncated: boolean;
  cappedItemCount: number;
}

export function shapePaste(paste: string): PasteTargets {
  const items = splitPasteItems(paste);
  if (items.length < 2) {
    return {
      kind: "prose",
      haystack: paste,
      truncated: false,
      cappedItemCount: 1,
    };
  }

  const truncated = items.length > CARD_CAP;
  const capped = items.slice(0, CARD_CAP);
  return {
    kind: "list",
    haystack: capped.join("\n"),
    truncated,
    cappedItemCount: capped.length,
  };
}

export function isGrounded(wordPhrase: string, haystack: string): boolean {
  const needle = normalizeForGrounding(wordPhrase);
  if (needle === "") {
    return false;
  }
  return normalizeForGrounding(haystack).includes(needle);
}

function splitPasteItems(paste: string): string[] {
  const allowCommaSplit = !/[.?!]/.test(paste);
  const items: string[] = [];

  for (const line of paste.split(/\r?\n/)) {
    const withoutLeadingBullet = line.replace(/^\s*[-*•]\s+/, "");
    for (const slashPart of withoutLeadingBullet.split("/")) {
      const chunks = allowCommaSplit ? slashPart.split(",") : [slashPart];
      for (const chunk of chunks) {
        const trimmed = chunk.replace(/^\s*[-*•]\s+/, "").trim();
        if (trimmed !== "") {
          items.push(trimmed);
        }
      }
    }
  }

  return items;
}

function normalizeForGrounding(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
