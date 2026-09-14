import { describe, expect, it } from "vitest";
import { CARD_CAP, isGrounded, shapePaste } from "@/lib/services/paste-targets";

describe("shapePaste", () => {
  it("treats a slash list as a list", () => {
    const shaped = shapePaste("apple / banana / run");
    expect(shaped.kind).toBe("list");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe("apple\nbanana\nrun");
  });

  it("treats a newline list as a list", () => {
    const shaped = shapePaste("apple\nbanana\nrun");
    expect(shaped.kind).toBe("list");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe("apple\nbanana\nrun");
  });

  it("strips bullet prefixes from a list", () => {
    const shaped = shapePaste("- apple\n* banana\n• cherry");
    expect(shaped.kind).toBe("list");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe("apple\nbanana\ncherry");
  });

  it("splits a comma list when the paste has no sentence punctuation", () => {
    const shaped = shapePaste("apple, banana, cherry");
    expect(shaped.kind).toBe("list");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe("apple\nbanana\ncherry");
  });

  it("keeps a sentence with commas as prose", () => {
    const paste = "I bought apples, bananas, and cherries.";
    const shaped = shapePaste(paste);
    expect(shaped.kind).toBe("prose");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe(paste);
  });

  it("keeps a space-separated word list as prose", () => {
    const paste = "apple banana cherry";
    const shaped = shapePaste(paste);
    expect(shaped.kind).toBe("prose");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe(paste);
  });

  it("does not split on a mid-string bullet glyph", () => {
    const paste = "apple•banana";
    const shaped = shapePaste(paste);
    expect(shaped.kind).toBe("prose");
    expect(shaped.truncated).toBe(false);
    expect(shaped.haystack).toBe(paste);
  });

  it("caps a 20-item list at CARD_CAP and sets truncated", () => {
    const items = Array.from({ length: 20 }, (_, index) => `word${index + 1}`);
    const shaped = shapePaste(items.join("\n"));
    expect(shaped.kind).toBe("list");
    expect(shaped.truncated).toBe(true);
    expect(shaped.haystack.split("\n")).toEqual(items.slice(0, CARD_CAP));
    expect(shaped.cappedItemCount).toBe(CARD_CAP);
  });
});

describe("isGrounded", () => {
  it("matches a case-folded word in a slash-list haystack", () => {
    const { haystack } = shapePaste("apple / banana");
    expect(isGrounded("Apple", haystack)).toBe(true);
  });

  it("does not match a word that is not in the haystack", () => {
    const { haystack } = shapePaste("apple / banana");
    expect(isGrounded("fruit", haystack)).toBe(false);
  });

  it("does not match a plural that is not a substring of the paste item", () => {
    const { haystack } = shapePaste("apple");
    expect(isGrounded("apples", haystack)).toBe(false);
  });

  it("does not match an empty needle", () => {
    expect(isGrounded("", "apple")).toBe(false);
    expect(isGrounded("   ", "apple")).toBe(false);
  });
});
