import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseUserSecretsKey, UserSecretsError } from "@/lib/services/user-secrets";

const VALID_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_HEX = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("parseUserSecretsKey", () => {
  it("imports 64 hex characters as 32 raw bytes", () => {
    const raw = parseUserSecretsKey(VALID_HEX);
    expect(raw).toHaveLength(32);
    expect(raw[0]).toBe(0x01);
    expect(raw[1]).toBe(0x23);
    expect(raw[31]).toBe(0xef);
  });

  it("rejects missing, short, and non-hex material without echoing the value", () => {
    for (const hex of [undefined, "", "abc", "0".repeat(63), "0".repeat(65), `${"0".repeat(63)}g`]) {
      try {
        parseUserSecretsKey(hex);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(UserSecretsError);
        expect(error).toMatchObject({ code: "user_secrets_key_invalid" });
        if (hex) {
          expect(String(error)).not.toContain(hex);
        }
      }
    }
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext with a new IV each time", async () => {
    const first = await encryptSecret("sk-or-v1-secret", VALID_HEX);
    const second = await encryptSecret("sk-or-v1-secret", VALID_HEX);

    expect(first.nonce).not.toEqual(second.nonce);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
    await expect(decryptSecret(first.nonce, first.ciphertext, VALID_HEX)).resolves.toBe("sk-or-v1-secret");
    await expect(decryptSecret(second.nonce, second.ciphertext, VALID_HEX)).resolves.toBe("sk-or-v1-secret");
  });

  it("fails closed when the nonce or wrapping key does not match", async () => {
    const sealed = await encryptSecret("sk-or-v1-secret", VALID_HEX);
    const other = await encryptSecret("other", VALID_HEX);

    await expect(decryptSecret(other.nonce, sealed.ciphertext, VALID_HEX)).rejects.toMatchObject({
      code: "user_secrets_decrypt_failed",
    });
    await expect(decryptSecret(sealed.nonce, sealed.ciphertext, OTHER_HEX)).rejects.toMatchObject({
      code: "user_secrets_decrypt_failed",
    });
  });
});
