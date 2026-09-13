import { describe, expect, it } from "vitest";
import { productLinks, PROTECTED_ROUTES } from "@/lib/auth";

describe("settings nav and route guard", () => {
  it("lists /settings in PROTECTED_ROUTES and productLinks", () => {
    expect(PROTECTED_ROUTES).toContain("/settings");
    expect(productLinks).toContainEqual({ href: "/settings", label: "Settings" });
  });
});
