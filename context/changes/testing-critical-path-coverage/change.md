---
change_id: testing-critical-path-coverage
title: Critical-path coverage for isolation and generate contracts
status: preparing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 (account isolation), #2 (generate hang/false success on Worker), #3 (generate reports success but deck empty after refresh).
Test types planned: unit + integration.
Risk response intent:
- #1: User A’s list/review/generate never includes User B’s cards or paste. Challenge: “logged in” equals “owns the row.” Avoid mocking away the data store or asserting an internal filter copy.
- #2: Slow or failed generate shows progress and a clean failure; does not freeze or claim cards were saved. Challenge: local Node success means Worker success. Avoid calling the live model or e2e-ing the whole generate happy path.
- #3: After a successful generate, a new fetch for that user returns the cards. Challenge: HTTP 201 means the deck is populated. Avoid happy-path insert only and an oracle copied from the insert mapper.
After creating the folder, follow the downstream continuation rule.
