# ts-fsrs API notes for S-04

Fetched via Context7 (`/open-spaced-repetition/ts-fsrs`) to implement roadmap slice **S-04** (`srs-review-session` / FR-008): review kept flashcards with a ready-made SRS. Custom scheduling is a Non-Goal.

Official package: [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

## What S-04 actually calls

**Create** an unreviewed card when a card is kept (S-03 accept, or first review). **Preview** all four buttons before the learner answers. **Commit** one grade after they tap.

```typescript
import { createEmptyCard, fsrs, Rating } from "ts-fsrs"

const scheduler = fsrs()
const card = createEmptyCard() // State.New; due = now unless you pass a Date

const preview = scheduler.repeat(card, new Date())
// preview[Rating.Again | Hard | Good | Easy].card / .log

const result = scheduler.next(card, new Date(), Rating.Good)
result.card // persist this
result.log // optional review history
result.card.due // next review
```

`createEmptyCard(now?, afterHandler?)` starts a **New** card with numeric fields at `0`. `next()` takes grade **1–4** and throws `FSRSValidationError` on invalid grades or `Rating.Manual` (`0`).

## Grades and UI

| Enum | Value | Button |
| --- | --- | --- |
| `Rating.Again` | 1 | Again |
| `Rating.Hard` | 2 | Hard |
| `Rating.Good` | 3 | Good |
| `Rating.Easy` | 4 | Easy |

Loop: `[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]`. Use `repeat()` for the four interval labels; use `next()` only after the click.

Dates for Postgres/JSON: `afterHandler` can turn `Date` into millis.

```typescript
scheduler.next(card, new Date(), Rating.Good, ({ card, log }) => ({
  card: {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review?.getTime() ?? null,
  },
  log: {
    ...log,
    due: log.due.getTime(),
    review: log.review.getTime(),
  },
}))
```

## Persist this (not content)

**Card** (current memory — write back after every review):

- `due`, `last_review`
- `stability`, `difficulty`
- `state` — `New` | `Learning` | `Review` | `Relearning`
- `reps` (incremented on **every** `next`/`repeat` init, including first review)
- `lapses`, `elapsed_days`, plus whatever else `createEmptyCard()` / `next()` returns

**ReviewLog** (optional history; snapshot **before** the update):

- `rating`, `state`, `due`, `stability`, `difficulty`
- `scheduled_days`, `learning_steps`, `review`
- `elapsed_days` / `last_elapsed_days` are marked deprecated

Queue for a session: `due <= now` on kept cards. `ts-fsrs` does not own the queue.

## Scheduler config (defaults are enough for MVP)

```typescript
const scheduler = fsrs() // recommended for S-04

// only if you later tune:
fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
})
```

Default `fsrs()`, no parameter training, storage-agnostic card JSON on an API route.

## S-04 wiring

1. **On keep:** `createEmptyCard()` columns next to the flashcard.
2. **Session GET:** cards with `due <= now`.
3. **Island:** `repeat()` for Again/Hard/Good/Easy intervals; `next()` on submit.
4. **POST:** save `result.card` (and optionally `result.log`); next card or empty state.

## Context7 excerpts

### Create scheduler, empty card, first review

Source: [README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/README.md), [quick reference](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/08-quick-reference.md), [algorithms](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/03-algorithms.md), [scheduler API](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/01-scheduler-api.md)

```typescript
import { createEmptyCard, fsrs, Rating } from "ts-fsrs"

const scheduler = fsrs()
const card = createEmptyCard()

const preview = scheduler.repeat(card, new Date())
const result = scheduler.next(card, new Date(), Rating.Good)

console.log(preview[Rating.Good].card)
console.log(result.card)
console.log(result.log)
```

`createEmptyCard<R = Card>(now?: DateInput, afterHandler?: (card: Card) => R): R`

- `now` — optional due date; defaults to current date/time.
- `afterHandler` — optional transformer.
- Returns an initialized card (`State: New`, numeric fields `0`).

`next()` applies a grade (1–4) and returns a `RecordLogItem` (`card` + `log`). Invalid grade → `FSRSValidationError`.

### Rate a review and get next due

Source: [scheduler API](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/01-scheduler-api.md), [types](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/02-types.md)

```
next(card: CardInput | Card, now: DateInput, grade: Grade, afterHandler?: (recordLog: RecordLogItem) => R)
```

- `card` — card to schedule.
- `now` — current date/time.
- `grade` — 1 Again, 2 Hard, 3 Good, 4 Easy. Not `Rating.Manual` (0).
- Returns `RecordLogItem` with updated card and review log.

```typescript
const result = scheduler.next(card, new Date(), Rating.Good)

console.log(result.card)
console.log(result.log)
console.log(result.log.due)
console.log(result.log.rating) // 3
```

`ReviewLogInput` also accepts string ratings such as `'Good'` (converted by `TypeConvert`).

### Card, ReviewLog, and states

Source: [types](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/_autodocs/02-types.md)

```typescript
interface ReviewLog {
  rating: Rating
  state: State
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number // deprecated
  last_elapsed_days: number // deprecated
  scheduled_days: number
  learning_steps: number
  review: Date
}

interface FSRSState {
  stability: number
  difficulty: number
}

State.New
State.Learning
State.Review
State.Relearning
```

`reps` is incremented in scheduler `init()` on every review call (first and subsequent), regardless of `New` / `Learning` / `Review` / `Relearning`.
