---
change_id: gate-generated-cards
title: Accept, edit, or delete generated cards
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

S-03 from `context/foundation/roadmap.md`. Gate generated cloze cards before they are treated as kept for study (US-01, FR-005). S-01 already persists rows as `generated` with UPDATE/DELETE RLS. Review (S-04) waits on this gate and must ignore leftover `generated` cards. FSRS columns stay in S-04.
