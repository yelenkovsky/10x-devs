import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredOpenRouterKey {
  user_id: string;
  nonce: string;
  ciphertext: string;
  last4: string;
}

export function createUserOpenRouterKeyStore() {
  const rows = new Map<string, StoredOpenRouterKey>();

  function clientFor(userId: string): SupabaseClient {
    return {
      from(table: string) {
        if (table !== "user_openrouter_keys") {
          throw new Error(`unexpected table ${table}`);
        }

        return {
          upsert(row: StoredOpenRouterKey) {
            if (row.user_id !== userId) {
              return Promise.resolve({ error: { message: "row-level security" } });
            }
            rows.set(row.user_id, row);
            return Promise.resolve({ error: null });
          },
          select(_columns: string) {
            return {
              maybeSingle() {
                const row = rows.get(userId);
                return Promise.resolve({
                  data: row ? { last4: row.last4 } : null,
                  error: null,
                });
              },
            };
          },
          delete() {
            return {
              eq(column: string, value: string) {
                if (column === "user_id" && value === userId) {
                  rows.delete(userId);
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;
  }

  return { rows, clientFor };
}
