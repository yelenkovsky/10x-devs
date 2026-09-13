import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredOpenRouterKey {
  user_id: string;
  nonce: string;
  ciphertext: string;
  last4: string;
}

export interface StoredFlashcard {
  id: string;
  user_id: string;
  generation_id: string;
  status: "generated" | "kept";
  cloze: string;
  word_phrase: string;
  full_sentence: string;
  definition: string;
  collocation_pattern: string;
  translation_pl: string;
  created_at: string;
}

interface FlashcardInsert {
  user_id: string;
  generation_id: string;
  status: "generated" | "kept";
  cloze: string;
  word_phrase: string;
  full_sentence: string;
  definition: string;
  collocation_pattern: string;
  translation_pl: string;
}

export function createUserOpenRouterKeyStore() {
  const rows = new Map<string, StoredOpenRouterKey>();
  const flashcards: StoredFlashcard[] = [];

  function clientFor(userId: string): SupabaseClient {
    return {
      from(table: string) {
        if (table === "flashcards") {
          return {
            insert(newRows: FlashcardInsert[]) {
              return {
                select(_columns: string) {
                  const inserted: StoredFlashcard[] = [];
                  for (const row of newRows) {
                    if (row.user_id !== userId) {
                      return Promise.resolve({ data: null, error: { message: "row-level security" } });
                    }
                    const saved: StoredFlashcard = {
                      ...row,
                      id: crypto.randomUUID(),
                      created_at: new Date().toISOString(),
                    };
                    flashcards.push(saved);
                    inserted.push(saved);
                  }
                  return Promise.resolve({ data: inserted, error: null });
                },
              };
            },
          };
        }

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
                  data: row ?? null,
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

  return { rows, flashcards, clientFor };
}
