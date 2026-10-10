# New Features

The features for Mathz: four approved features already in progress, plus proposed ideas that have not been approved yet. Each entry says what the feature does, how it would be built and where it stands. The app stays single-user (no accounts).

Legend: **Done** = implemented, **Partial** = backend done and UI missing, **Todo** = approved but not started, **Proposed** = idea only, not approved. Nothing below has been tested at runtime yet.

## Overview

### Approved

| Feature | Status |
| --- | --- |
| 1. Session summary page | Partial (end endpoint only) |
| 2. Progress charts | Todo |
| 3. Timed challenge mode | Partial (backend only) |
| 4. Working settings | Partial (backend only) |

### Proposed

| Feature | Effort | Schema change | Depends on | Status |
| --- | --- | --- | --- | --- |
| 5. Review mistakes mode | Medium | Yes | 1 | **Implemented** |
| 6. Spaced repetition | Medium–large | Yes | — | **Implemented** |
| 7. Division practice | Medium | Yes | — | Proposed |
| 8. Daily goal and streak | Small | No | 4 | Proposed |
| 9. Hints after a miss | Small | No | — | Proposed |
| 10. Data export (CSV) | Small | No | — | Proposed |
| 11. Sound feedback | Small | No | 4 | Proposed |
| 12. Install as an app (PWA) | Small | No | — | Proposed |

## Database changes (done)

Columns were added to `practice_sessions` (first three below plus `pair_list`) and applied with `npm run db:push`. The change is additive, so existing rows keep working.

| Column | Type | Purpose |
| --- | --- | --- |
| `duration_seconds` | integer, nullable | Length of a timed session (30, 60 or 120) |
| `weak_focus_percent` | integer, default 30 | Share of questions drawn from weak pairs |
| `recent_window` | integer, default 5 | How many latest questions must not repeat |
| `pair_list` | jsonb, nullable | The pairs of a review session (feature 5) |

Two columns were added to `pair_statistics` for spaced repetition (feature 6):

| Column | Type | Purpose |
| --- | --- | --- |
| `box` | integer, default 1 | Leitner box, 1 to 5 |
| `due_at` | timestamp, nullable | When the pair is next due; null counts as due |

## 1. Session summary page

**Goal:** when a session ends, show a results screen instead of jumping to the global Progress page.

**Shows:** score, accuracy, average response time, duration, and a list of missed questions with the correct answers. Buttons lead to "Practice again" and "Progress".

**Built:**
- `POST /api/sessions/:id/end` marks a session as ended. It is safe to call twice.

**To do:**
- `src/app/practice/[id]/summary/page.tsx`, a server-rendered page.
- Practice screen redirects to the summary on completion.
- The exit button ends the session first, then opens the summary (or goes home if nothing was answered).

## 2. Progress charts

**Goal:** make improvement visible over time.

**Planned:**
- A Recharts line chart of accuracy and average response time for the last 30 sessions (`src/components/progress-charts.tsx`).
- A "Recent sessions" list on the Progress page, each row linking to its summary.
- Sessions with no answers are left out.

**Status:** not started. Recharts is already a dependency.

## 3. Timed challenge mode

**Goal:** a countdown round (30, 60 or 120 seconds) scored by the number of correct answers, with a personal best per duration.

**Built:**
- `POST /api/sessions` accepts `mode: "timed"` with `durationSeconds` of 30, 60 or 120, and rejects anything else.
- `GET /api/sessions/:id/next` returns `finished` once the time is up and records the end time. Otherwise it also returns `startedAt` and `durationSeconds` so the client can show a countdown.
- `POST /api/sessions/:id/attempt` returns 409 for answers that arrive more than 2 seconds after the deadline.

**To do:**
- Timed options on the setup screen.
- Countdown display on the practice screen that ends the session at zero.
- Personal best on the summary page: the highest correct count among timed sessions of the same duration, with a "New record!" badge.

## 4. Working settings

**Goal:** turn the read-only Settings page into real, saved preferences.

| Setting | Range | Default |
| --- | --- | --- |
| Weak-pair focus (% of questions) | 0 to 50 | 30 |
| Recent-question window | 0 to 10 | 5 |

**Built:**
- The question engine reads both values from the session instead of fixed constants. A window of 0 allows repeats and a focus of 0 never picks weak pairs.
- `POST /api/sessions` validates and stores both values.

**To do:**
- `src/lib/settings.ts` with defaults and `localStorage` load/save (wrapped in try/catch).
- Settings page as a form with Save, a "Saved" confirmation and reset to defaults.
- Setup screen sends the saved values when it creates a session.

## Proposed features

These are ideas only, not approved. Each one notes what it reuses, so it can be picked up without re-reading the codebase.

### 5. Review mistakes mode (implemented)

**Goal:** practise exactly the facts you got wrong, instead of the whole selection.

**How it works:**
- A "Retry missed" button on the session summary page (feature 1) starts a session containing only that session's wrong answers.
- A "Review recent mistakes" option on the setup screen uses every pair answered wrong in the last 7 days.

**As built:**
- `POST /api/sessions` accepts `mode: "review"` with exactly one of `reviewSessionId` or `reviewRecentDays` (1–30). The server derives the pairs itself from `question_attempts` where `is_correct = false` (distinct pairs, most recent mistake first, at most 50) via `getMistakePairs` in `src/lib/mistakes.ts`. It answers 400 "No mistakes to review" when there are none.
- New nullable `pair_list` (jsonb) column on `practice_sessions`. The session's target is the number of pairs, so each missed pair is asked once, in random order, and the session ends on its own.
- `getNextQuestion` in `src/lib/question-engine.ts` uses the list instead of the cross product and skips the weak/due logic in review sessions.
- UI: `src/components/review-button.tsx` is used for "Retry missed" on the summary page (shown only when something was missed) and "Review mistakes from the last 7 days" on the setup screen.

### 6. Spaced repetition (implemented)

**Goal:** bring each fact back just before you would forget it, instead of only weighting by weakness.

**How it works:** a Leitner system with five boxes per pair. A correct answer moves the pair up a box and a wrong answer sends it back to box 1. Boxes are reviewed after 1, 2, 4, 8 and 16 days.

**As built:**
- New `box` (default 1) and `due_at` columns on `pair_statistics`, updated by `recordPair` in `src/app/api/sessions/[id]/attempt/route.ts`. The rules live in `src/lib/spaced-repetition.ts` (`nextBox`, `dueDateForBox`).
- Pairs answered before this feature have no `due_at`; they count as due until their next answer schedules them.
- The question engine picks in this order: the weak-pair roll (Settings), then, with a 60% chance, a due pair from your selection, then uniform random. Recently asked pairs are still avoided.
- The Progress page has a "Due for Review" card with the number of due pairs.
- Not done: the optional "due today" view on the Tables heatmap.

### 7. Division practice

**Goal:** learn the inverse facts (56 ÷ 7 = ?) from the same pairs.

**How it works:** a new operation choice on the setup screen: multiplication, division or mixed. A division question shows `left × right ÷ right` and expects `left`.

**Build notes:**
- Add an `operation` column to `practice_sessions` and `question_attempts`.
- Keep separate statistics per operation: either add `operation` to the `pair_statistics` primary key, or track division in a parallel table. This is the main design decision to settle first.
- The attempt route computes the correct answer per operation.

### 8. Daily goal and streak

**Goal:** encourage short, regular practice.

**How it works:** set a daily goal in Settings (for example 50 questions). The home page shows a progress ring for today and the current day streak.

**Build notes:**
- No schema change. Count today's rows in `question_attempts` by `created_at`, and compute the streak from distinct practice days.
- The goal is saved with the other settings (feature 4).
- Use the user's local date, not the server's, so the day boundary is right. Pass the time-zone offset from the client.

### 9. Hints after a miss

**Goal:** teach a strategy rather than only showing the answer.

**How it works:** after a wrong answer, the feedback adds a one-line hint, for example `9 × 7 = 10 × 7 − 7`, `6 × 8 = 5 × 8 + 8` or `12 × 4 = 10 × 4 + 2 × 4`.

**Build notes:**
- A pure function `getHint(left, right)` in `src/lib/hints.ts`, easy to unit-test.
- Shown in the incorrect-answer feedback in `src/components/practice-session.tsx`. The incorrect delay may need to grow from 900 ms to leave time to read the hint.

### 10. Data export (CSV)

**Goal:** let users keep or analyse their history outside the app.

**How it works:** an "Export CSV" button on the Progress page downloads every attempt (date, question, answer, correct, response time).

**Build notes:**
- `GET /api/export` streams `question_attempts` joined with session mode as CSV, with a `Content-Disposition` header for the download.
- No schema change.

### 11. Sound feedback

**Goal:** quick audio confirmation without looking at the screen.

**How it works:** short tones for correct and wrong answers, off by default, toggled in Settings.

**Build notes:**
- Generated with the Web Audio API, so no audio files are needed.
- Saved with the other settings (feature 4).
- Also skip the feedback animations when the user has `prefers-reduced-motion` set.

### 12. Install as an app (PWA)

**Goal:** open the trainer from the home screen or desktop like a native app.

**How it works:** a web app manifest and icons make the app installable. It still needs a connection, because every question comes from the database.

**Build notes:**
- Add a manifest and icons. This Next.js version differs from older ones, so check the manifest convention in `node_modules/next/dist/docs/` before writing it (see `AGENTS.md`).
- No service worker or offline mode in the first version.

## Suggested order for proposed features

1. **9 and 10** are small, self-contained and useful immediately.
2. **5** builds directly on the summary page once feature 1 ships.
3. **8 and 11** slot into the settings work from feature 4.
4. **6 and 7** change how statistics are stored, so each needs a short design pass first.
5. **12** can go in at any time.

## Verification checklist (approved features)

1. `npm run lint`, `npm run typecheck` and `npm run build` pass.
2. A 10-question session ends on the summary page with correct totals and missed questions.
3. Exiting an endless session early shows the summary and sets the end time.
4. A 30-second timed session counts down, ends on its own, and a late answer gets a 409.
5. A second timed session with a higher score shows "New record!".
6. The Progress page shows the charts, and each history row opens its summary.
7. With focus 0 and window 0 saved in Settings, the new session row stores those values.
8. Invalid payloads (bad duration, out-of-range settings) return 400.

## Out of scope

- User accounts and per-user statistics.
- Editing past sessions or deleting history.
- Offline practice (questions are served from the database).

The full implementation plan for the approved features is in `C:\Users\karth\.claude\plans\add-new-features-idempotent-wind.md`.
