export class UserSecretsError extends Error {
  readonly code: "user_secrets_key_invalid" | "user_secrets_decrypt_failed";

  constructor(code: "user_secrets_key_invalid" | "user_secrets_decrypt_failed", message: string) {
    super(message);
    this.name = "UserSecretsError";
    this.code = code;
  }
}

const HEX_KEY = /^[0-9a-fA-F]{64}$/;

export function parseUserSecretsKey(hex: string | undefined): Uint8Array {
  if (!hex || !HEX_KEY.test(hex)) {
    throw new UserSecretsError("user_secrets_key_invalid", "User secrets key is not configured.");
  }

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function importWrappingKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptSecret(
  plaintext: string,
  keyHex: string | undefined,
): Promise<{ nonce: string; ciphertext: string }> {
  const key = await importWrappingKey(parseUserSecretsKey(keyHex));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    nonce: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSecret(nonce: string, ciphertext: string, keyHex: string | undefined): Promise<string> {
  const key = await importWrappingKey(parseUserSecretsKey(keyHex));

  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    iv = base64ToBytes(nonce);
    data = base64ToBytes(ciphertext);
  } catch {
    throw new UserSecretsError("user_secrets_decrypt_failed", "Could not decrypt the stored secret.");
  }

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new UserSecretsError("user_secrets_decrypt_failed", "Could not decrypt the stored secret.");
  }
}
