import { describe, expect, it } from "vitest";

describe("vitest runner", () => {
  it("executes a file without touching the network or database", () => {
    expect(1 + 1).toBe(2);
  });
});
