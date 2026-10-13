# Mathz architecture

How the code is organised and why. For what the app does and how to run it, see the [README](../README.md).

## Folder structure

```
src/
  app/                    Next.js App Router: pages, layouts, API routes, icons, manifest. Thin: a page
                          fetches data, then renders a feature's components.
  features/               One folder per product area (see below).
  components/             UI shared by several features, with no product logic.
    ui/                     primitives (button, card, input, ...)
    layout/                 page chrome: site header, page header + stat tiles, section card, logo, splash
    form/                   generic controls: choice-controls (Chip, ExercisePicker, Switch),
                            number-controls (NumberField, Stepper, Slider)
    common/                 small shared pieces: accent tile, skill icon, answer keypad, confirm dialog
  lib/                    Code shared by several features, UI-free.
    accent.ts rational.ts   accent colours; exact rational arithmetic
    random.ts timeline.ts   seedable RNG; countdown/flash schedule
    sound.ts records.ts     Web Audio cues; validation primitives for untrusted records
    utils.ts validation.ts nav.ts pwa-icon.tsx
  db/                     Drizzle schema, connection, SQL migrations (unchanged; drizzle-kit reads these)
  proxy.ts                Next.js proxy (auth redirects)
public/                   sw.js (service worker), offline.html
docs/                     this file
scripts/                  migrate.ts
```

### Features

Every feature uses the same three folders, and only creates the ones it needs:

| Folder        | Holds                                                                        | May import                    |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `components/` | React UI for the feature (`"use client"` where it needs state)               | its own `lib/`, shared code   |
| `lib/`        | Engines, scoring, validation, storage, sync: pure TypeScript, no React       | shared `lib/`, other `lib/`s  |
| `server/`     | Code that talks to the database or reads cookies; never imported by clients  | `db/`, its own and shared lib |

```
features/
  skills/                 The practice drills (multiplication ... exponents)
    components/             practice-hub, skill-practice, practice-session, summaries, setup/ (per-skill options)
    lib/                    question ids, generators, pools, answer checking (the domain core)
    lib/practice/           session rules: selection, spaced repetition, item stats, request validation
    server/                 attempts.ts, mistakes.ts (DB access)
  games/
    mindsprint/ recall/ sudoku/ game2048/
                            each: components/ (setup, game, result screens, stats panel, app shell)
                                  lib/ (engine, config, scoring, records.ts, storage.ts, sync.ts, types.ts)
    shared/                 what every game reuses
      components/result-parts.tsx   SaveState, SaveStatus, RecordBanner, ResultActions
      lib/format.ts                 formatSeconds, formatApproxDuration
      lib/history/                  local.ts (device history), sync.ts (browser upload),
                                    upload.ts (pure server upload logic), route.ts (Next wrapper)
  progress/               Progress page: charts, heatmap, queries (server/)
  settings/               User settings form and parsing
  auth/                   Sign-in/up forms, ViewerProvider; server/ holds auth.ts and actions
  offline/                The "works without a connection" machinery
    components/             sync manager, connection badge, install prompt, service-worker registration
    lib/                    guest/ (the browser-side practice backend + local storage), sync/ (practice upload:
                            client, payload checks, server), compression, local-store, service-worker client
  home/                   The home page hub: lists the skills and games with the viewer's progress
```

### Dependency direction

```
app/  ->  features/  ->  components/, lib/
```

What holds today (checked by listing every `@/features/...` import):

- **`lib/` is independent of features.** Its one reference is a type-only import (`lib/accent.ts` uses `Skill`).
- **`components/` is independent apart from two exceptions:** `layout/site-header` composes the offline
  `connection-badge`, and `common/` tiles use the `Skill` type.
- **Games do not import each other.** Each game depends on `games/shared`, `auth` (the viewer), `offline`
  (device storage) and, for MindSprint, the skills `AnswerFormat` type.
- **Two features sit above the rest because their job is composition:** `home` (reads every game's stats and the
  progress queries) and `offline` (its sync manager uploads every game's history, and the guest backend runs the
  practice engine from `skills`).
- A module used by two or more features belongs in `lib/` or `components/`, not inside one of them.
  `timeline`, `sound`, `accent`, `rational` and `random` were moved out of MindSprint and skills for this reason.

Known coupling, not yet cleaned up: `auth`, `offline` and `progress` import each other (the viewer context, the
guest storage keys and the local progress readers). They do not form a module-level import cycle, but a base layer
holding "who is the viewer and where is their data stored" would remove the feature-level loop. It was left alone
because moving storage keys risks the persisted data format for no user-visible gain.

## Conventions

- **File names**: kebab-case. Components in `.tsx`, everything else `.ts`. Tests sit beside the code as
  `<name>.test.ts` (run by `npm test`; the glob is `src/**/*.test.ts`, so tests are `.ts`, not `.tsx`).
- **Imports**: the `@/` alias (`src/`) for anything outside the current folder; `./` only for siblings.
- **Server/client**: a file that needs state or browser APIs starts with `"use client"`. Anything importing `@/db`
  or cookies lives in a `server/` folder or an `app/` route; client code never imports it.
- **Untrusted data** (uploads, localStorage) is checked with `lib/records.ts` (`openRecord`, `isObject`, ...).
  Each game's `records.ts` adds its own rules and keeps its error messages stable.
- **Game history** is saved on the device first and uploaded later; `features/games/shared/lib/history` is the one
  implementation. Adding a game means supplying a parser, a storage key, a payload shape and a route file.
- **Errors**: API routes answer 400 for malformed input, 401 when signed out, 500 for failures (with whatever was
  stored before the failure, so a device only retries the rest).

## Activity streaks

A streak is the run of consecutive calendar days (in the user's own time zone) on which they finished something. All
of it is a **set of `YYYY-MM-DD` days**; `features/progress/lib/streak.ts` turns a set into current and longest.

- **What counts** (`streak.ts`, mirrored in SQL by `getActivityDays`): an answered practice question (right or wrong,
  not skipped or timed out), a finished MindSprint or Number Recall session, a solved Sudoku, a 2048 game that ended,
  reached 2048 or had 20+ moves. Opening a page or starting a game records nothing.
- **Signed in**: the server derives every day, all-time, from the existing tables with one `UNION` query bucketed in
  `users.timezone` (no new table or migration). The profile adds the days of the device's offline copy
  (`local-activity.ts`, same zone), so a day played offline counts before it has been uploaded. A day known to both
  sides is one day.
- **Guest**: saved sessions are trimmed (40 practice, 100 per game), so a guest also has a permanent day record
  (`features/offline/lib/activity-days.ts`, key `<store key>:activity-days`) written as each activity is saved. Days
  of sessions saved before it existed are added once. A guest's data is not carried to a new account.
- **Why a set**: retries, reloads, syncs and pulling history from another device can only re-add a day that is
  already there, so nothing can be counted twice.

## Decisions

1. **Features over layers.** The code used to be `components/` and `lib/` with a folder per game inside each, so one
   change touched two distant trees. Grouping by feature keeps a game's UI, engine and storage together and makes
   cross-feature imports visible (and therefore fixable).
2. **Shared only when shared.** Code moved to `lib/` or `components/` only if two features already used it. Setup
   screens and stats panels differ per game (about 90% of their lines differ), so they stay per game rather than
   being forced into a configurable super-component.
3. **Pure logic separated from I/O.** The history upload route is `upload.ts` (pure, tested without a database) plus
   `route.ts` (auth + `NextResponse`); the per-game route files only supply their table mapping.
4. **One logo definition.** `components/layout/logo-mark.tsx` owns the geometry. The header, splash, install prompt,
   Apple icon and PWA icons draw from it, and a test fails if `app/icon.svg` drifts. The four symbols are cut out of
   the tiles (even-odd paths), so no fill colour is needed for them.
5. **No behaviour changes.** Database schema, migrations, API paths, request/response shapes, storage keys, scoring,
   settings and the service worker's route list are unchanged. The restructure was done with a codemod that only
   moved files and rewrote import specifiers.
