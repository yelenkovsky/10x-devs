import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { FlashcardItem } from "@/components/cards/FlashcardItem";
import { cn } from "@/lib/utils";
import type { BrowseFlashcardStatus, Flashcard } from "@/types";

const LOAD_ERROR_MESSAGE = "Cards could not be loaded. Refresh to try again.";
const CAP_NOTE_ALL = "Showing the newest 1000 cards.";
const CAP_NOTE_MATCHING = "Showing the newest 1000 matching cards.";

interface BrowseFlashcardsProps {
  cards: Flashcard[];
  capped: boolean;
  loadError?: boolean;
  status: BrowseFlashcardStatus;
  q: string;
}

export default function BrowseFlashcards({
  cards: initialCards,
  capped,
  loadError = false,
  status,
  q,
}: BrowseFlashcardsProps) {
  const [cards, setCards] = useState(initialCards);
  const hasFind = q.trim().length > 0;
  const filterActive = status !== "all" || hasFind;

  return (
    <div className="space-y-4">
      {capped ? (
        <p className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-100/80" role="status">
          {filterActive ? CAP_NOTE_MATCHING : CAP_NOTE_ALL}
        </p>
      ) : null}

      {loadError && cards.length === 0 ? (
        <p
          className={cn(
            "flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-900/30 px-4 py-6 text-center text-sm text-red-300",
          )}
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" />
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}

      {!loadError && cards.length === 0 ? <EmptyCatalog status={status} hasFind={hasFind} /> : null}

      {cards.length > 0 ? (
        <ol className="space-y-4">
          {cards.map((card) => (
            <li key={card.id}>
              <FlashcardItem
                card={card}
                onUpdated={(updated) => {
                  setCards((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                }}
                onDeleted={(id) => {
                  setCards((current) => current.filter((item) => item.id !== id));
                }}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

const emptyCatalogClass =
  "rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-blue-100/60";

function EmptyCatalog({ status, hasFind }: { status: BrowseFlashcardStatus; hasFind: boolean }) {
  if (hasFind) {
    return (
      <p className={cn(emptyCatalogClass)} role="status">
        No cards match this word or phrase.
      </p>
    );
  }

  if (status === "generated") {
    return (
      <p className={cn(emptyCatalogClass)} role="status">
        No generated cards. New cards from a paste appear here until you accept them.
      </p>
    );
  }

  if (status === "kept") {
    return (
      <p className={cn(emptyCatalogClass)} role="status">
        No kept cards. Accept a generated leftover or create one by hand on the dashboard.
      </p>
    );
  }

  return (
    <p className={cn(emptyCatalogClass)} role="status">
      No cards yet. Generate from a paste or create a card by hand on the{" "}
      <a href="/dashboard" className="font-medium text-blue-100 underline underline-offset-2 hover:text-white">
        dashboard
      </a>
      .
    </p>
  );
}
