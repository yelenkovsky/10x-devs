# Mom Test Validation Plan

## Input Idea

Origin–GitHub drift digest: a local, read-only report of commits on Cursor Origin that are not on GitHub (and the reverse), so CI/deploy lag is visible. Source: `context/team/opportunity-map.md` (2026-09-14). Do not pitch this digest in interviews or the survey.

## Hypotheses

- **User/role**: People who push to this repo, watch GitHub Actions, or expect production to follow GitHub `main` (today: the operator of 10xUsage; anyone else who reviews on GitHub or waits on deploy).
- **Friction**: Origin is often a few commits ahead of GitHub; nobody notices until CI, review, or deploy is already looking at the stale remote.
- **Current workaround**: Push to `origin` as the daily remote; push to `github` later, when remembered. No shared check. Dual remotes are documented in `context/deployment/deploy-plan.md`.
- **Proposed solution**: A throwaway local digest of SHA/ref drift. Not auto-sync, not a dashboard, not a CI gate.
- **Risky assumptions**:
  - “No one knows” is a repeated, recent event — not a one-off or a fear.
  - The cost is CI/deploy/review on the wrong SHA, not “I had to push again.”
  - People would *look* at a digest. The actual failure may be “forgot `git push github`,” which an alias or second push URL already fixes.
  - More than one person is in the path. A solo operator interviewing themselves will over-confirm.
- **Evidence already present** (thin):
  - **Fact**: Two remotes exist (`origin` = origin.cursor.com, `github` = github.com/yelenkovsky/10x-devs). Actions CI/deploy runs on GitHub.
  - **Fact**: Deploy notes say a green Actions run required pushing `main` to `github`.
  - **Guess**: GitHub “often” lags a few commits and stays unnoticed. No dated incident, SHA pair, Actions run, or time-to-detect is on file.

## Critique

The map names a *visibility* product. The behavior might just be “we push to Origin and forget the CI remote.” Those are different problems. A digest does not push. An extra push URL, a `pushgithub` alias, or `git remote set-url --add --push` might already be enough — and asking “would a digest help?” would hide that.

“No one knows” is future-flavored until someone walks through the last time they found Origin and GitHub apart: what they were doing, what they opened first, what was wrong in CI/review/prod, and what they typed to catch up. If the last lag was caught in the same session as the push, or the only cost was a second `git push`, the opportunity does not earn a tool.

Existing git is the bar: `git fetch --all` and `git log github/main..origin/main` already answer the digest’s question. Strong evidence to proceed is not interest in a report. It is unprompted recent stories where lag was discovered *after the fact*, with a real consequence, and where today’s habit is memory rather than a reliable check.

If this repo is mostly one operator, do not treat a self-interview as confirmation. Use their own last incident plus anyone who actually looked at GitHub (reviewer, Actions, production). If there is no such second person, the bar is a dated incident with cost, not a second complimentary opinion.

## Interview Guide

~20–30 minutes. Talk to people who push, watch Actions, or review on GitHub. Do not mention the digest, a dashboard, or auto-sync. Ask what happened; let them name tools.

### 1. Context warm-up

1. What is your role on this repo, and what do you personally push, review, or ship?
   - *Follow-up:* In a normal week, how many times do you push?

2. Walk me through how a change you made last week got from your machine to whatever you consider “live.”
   - *Follow-up:* Which git remotes did you touch, in what order? Which tab or URL did you open to confirm it landed?

### 2. Recent story

3. Tell me about the last time Origin and GitHub did not have the same commits. What were you in the middle of?
   - *Follow-up:* About when was that (this week, last month, longer)? Which branch?
   - *If they cannot name a time:* When did you last compare the two remotes at all? What made you look?

4. How did you first notice they were apart — a failed job, a missing commit on github.com, a reviewer, a deploy, or something else?
   - *Follow-up:* What did you click or run in the first two minutes after you noticed?

### 3. Current workaround

5. How do you check today that GitHub is current with Origin? Walk through the last time you did that check, including “I didn’t.”
   - *Follow-up:* Is that a personal habit or something the team expects? Who else is supposed to notice?

6. The last time they drifted, what did you actually type or click to catch GitHub up?
   - *Follow-up:* Have you ever added a second push URL, an alias, a hook, or a checklist for this? What happened to that?

### 4. Cost of pain

7. After the last lag, what was already wrong — or not wrong — because GitHub was behind? (CI, review, deploy, Linear, nothing.)
   - *Follow-up:* How long was GitHub behind before someone noticed? How do you know?

8. Who else got involved, and what did they have to redo?
   - *Follow-up:* Was production, a PR, or a review looking at the stale SHA?

### 5. Existing alternatives

9. Besides pushing again, what do you already use to keep remotes honest — git, GitHub UI, Actions, Cursor Origin UI, a script, a teammate?
   - *Follow-up:* Last time you tried one of those, did it catch the lag before or after it mattered?

### 6. Decision signal

10. Think of the last lag that actually bothered you. What about that episode would have to happen again before you changed how you push?
    - *Follow-up:* If it happened again tomorrow, what would you do first — not what you wish existed.

### 7. Closing ask

11. Can I sit with you while we look at last week’s `origin` vs `github` logs (or the last Actions run on `main`)? We can redact anything you want.
    - *Follow-up:* Who else pushed or watched CI that week that I should ask the same questions?

12. Is there a chat message, CI run, or PR from a lag incident I can look at later?

## Survey

Screener first. Anyone who fails Q1 is done. Do not describe a digest, dashboard, or product.

1. **Screener.** In the last month, have you worked in a git repo that is pushed to more than one remote (for example Cursor Origin and GitHub), where CI or deploy runs on only one of them?
   - Yes, that is my usual setup
   - Yes, once or twice
   - No / I don’t know → end

2. In the last 30 days, how often did those two remotes *not* have the same commits when you looked (or when something failed)?
   - Didn’t happen / I never looked
   - Once
   - 2–4 times
   - Weekly or more

3. The last time they were apart, how did you find out?
   - I ran git fetch/log or compared remotes on purpose
   - GitHub / Actions / a deploy looked wrong
   - Someone else told me
   - I don’t remember finding out
   - They weren’t apart that I know of

4. After you found out, what did you do first?
   - Pushed the lagging remote
   - Re-ran CI / redeployed
   - Told someone else
   - Nothing; it didn’t matter
   - Something else (one line)

5. About how long was the lagging remote behind before anyone noticed, that last time?
   - Minutes (same session)
   - Hours (same day)
   - A day or more
   - I don’t know
   - No last time

6. What was already affected when you noticed? Pick all that apply.
   - CI ran on an old SHA
   - A review or PR was missing commits
   - Production / deploy was missing commits
   - I had to push again; nothing else
   - Nothing / I don’t know

7. How do you usually keep the CI/deploy remote up to date today?
   - I always push both remotes in the same sitting
   - I push the second remote when I remember
   - An alias, hook, extra push URL, or script does it
   - Someone else is supposed to
   - I don’t

8. **Open.** In a few sentences, describe the last time the remotes diverged: what you were doing, how you noticed, what you did.

9. **Open.** What do you already do — command, habit, or person — to stop that from happening again?

## Decision Criteria

- **Proceed** if: At least two people in the push/CI/review path (or, if truly solo, the operator plus a dated artifact) describe the *same* last-60-days pattern without being prompted: GitHub was behind Origin, they noticed only after git, and the cost was CI, review, or deploy on a stale SHA — not only a second push. Current habit is memory or “push github later,” not a reliable check. At least one incident can be pointed at (Actions run, SHA pair, chat, or PR).

- **Narrow scope** if: Lag is real but always caught in the same session, or the only repeated cost is a forgotten `git push github`. Then the first useful version is a personal reminder, alias, or extra push URL — not a digest others must open. Or only one operator is affected and they already compare remotes when it matters.

- **Do not build yet** if: Interviewees cannot name a specific incident in the last 60 days; “no one knows” stays hypothetical; survey Q2 is mostly “didn’t happen / I never looked”; or people already run `git fetch` + `git log github/main..origin/main` and consider that enough.

- **Try existing tool/process first** if: They do not consistently push the GitHub remote, and a git extra push URL, alias, hook, or Origin/GitHub mirror they have not used would remove the failure. Prefer that trial *before* any digest. Linear’s GitHub integration does not address this remote-lag problem; do not treat it as the existing fix here.
