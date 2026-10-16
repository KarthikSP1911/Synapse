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
    mindsprint/ recall/ sudoku/ game2048/ queens/ zip/ patches/ nback/
                            each: components/ (setup, game, result screens, stats panel, app shell)
                                  lib/ (engine, config, scoring, records.ts, storage.ts, sync.ts, types.ts)
    shared/                 what every game reuses
      components/result-parts.tsx   SaveState, SaveStatus, RecordBanner, ResultActions
      components/puzzle-*.tsx       the shell Queens, Zip and Patches share: setup, results, stats tab, resume and save
                                    (puzzle-app.tsx takes a PuzzleKit from puzzle-kit.ts)
      lib/format.ts                 formatSeconds, formatApproxDuration
      lib/clock.ts, puzzle-session.ts, puzzle-stats.ts, board-geometry.ts, shuffle.ts   puzzle-game basics
      lib/history/                  local.ts (device history), sync.ts (browser upload),
                                    upload.ts (pure server upload logic), route.ts (Next wrapper)
  progress/               Progress page: charts, heatmap, queries (server/)
  rewards/                Coins, Streak Shields and paid hints
                            lib/ economy.ts (every amount), ledger.ts (pure wallet rules), grants.ts (what an activity pays),
                                  protection.ts (which missed days a shield covers), wallet-store.ts + service.ts (the device's
                                  wallet), reconcile.ts + sync.ts (device <-> account)
                            components/ header badge, toasts, shop, shield panel, usePaidHint
                            server/ wallet.ts (atomic SQL), requests.ts, db-run.ts
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
  not skipped or timed out), a finished MindSprint or Number Recall session, a solved Sudoku, Queens, Zip or Patches puzzle, a 2048
  game that ended, reached 2048 or had 20+ moves. Opening a page or starting a game records nothing.
- **Signed in**: the server derives every day, all-time, from the existing tables with one `UNION` query bucketed in
  `users.timezone` (no new table or migration). The profile adds the days of the device's offline copy
  (`local-activity.ts`, same zone), so a day played offline counts before it has been uploaded. A day known to both
  sides is one day.
- **Guest**: saved sessions are trimmed (40 practice, 100 per game), so a guest also has a permanent day record
  (`features/offline/lib/activity-days.ts`, key `<store key>:activity-days`) written as each activity is saved. Days
  of sessions saved before it existed are added once. A guest's data is not carried to a new account.
- **Why a set**: retries, reloads, syncs and pulling history from another device can only re-add a day that is
  already there, so nothing can be counted twice.

## Coins, Streak Shields and paid hints

One ledger, two homes. A **ledger entry** has a unique idempotency key, a signed coin amount, a signed shield amount, a reason and a related id; the balance is the opening balance plus the entries and is never negative. `features/rewards/lib/ledger.ts` is the single set of rules (earn, buy a shield, spend a shield, charge a hint) as pure functions over a wallet value, and the same rules guard both homes.

- **The device** keeps the wallet in `localStorage` per viewer (`<store key>:wallet`) and changes it only through `service.ts`: read, one pure step, write, in one synchronous call, so two taps cannot interleave. If the write fails nothing changed and the caller must not act (a hint is not shown). A guest's wallet is authoritative; a signed-in user's entries are `pending` until the server has them.
- **The server** (`wallets`, `wallet_transactions`, migration `0009`) is authoritative for accounts. Every change is one SQL statement that locks the wallet row, inserts the ledger row (a duplicate key inserts nothing, so the totals do not move) and updates the totals together; the CHECK constraints (balance >= 0, shield count 0..100) abort anything that would break the invariant. Two requests racing for the same coins cannot both win. The same statements are run in tests against PGlite.
- **Nothing the device says names an amount.** Earnings are computed from records the upload routes already validate (`practice`'s answers are re-checked, puzzle records are re-solved) by the same `grants.ts` functions the device used, with the same keys, so the device's optimistic entry and the server's credit are one entry. Hint charges arrive as "this hint of this attempt was delivered" and are priced from `ECONOMY`. Shield purchases are server-first and need a connection. Shield use is decided on the server from every device's activity days.
- **Sync** (`sync.ts`, run by `SyncManager` after the practice and game uploads): send the pending hint charges and the pending keys, receive the account's wallet, and `reconcile` it with what is still pending. The device's balance is always the server's balance plus its pending entries.
- **Hint order** (`use-paid-hint.ts`): work out the hint without side effects -> if none, stop (no charge, no cooldown) -> `requestHint` checks cooldown, then balance, then saves charge + cooldown -> show the hint only on success. Charges are keyed by game attempt (clientId + start time, so a restart is a new attempt) and hint number, so a crash between charge and display costs nothing the second time.
- **Limits worth knowing.** A hint is computed on the device (the solution is in the browser), so the cooldown is enforced by the wallet service on the device, not by the server; the server's guarantee is that each delivered hint is charged exactly once at the right price and the balance never goes negative. Offline signed-in hints are charged against the device's copy and re-checked at sync; the account's balance is the authority, and a charge it cannot cover is dropped rather than leaving a negative balance. The device keeps the latest 500 ledger entries (older ones are folded into the opening balance); the server's unique keys are permanent.

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

## Queens and Zip

(Patches, below, uses the same shell.)

Two puzzle games that share a shell (`features/games/shared/components/puzzle-app.tsx`), because unlike the older
games their setup, results and stats screens are the same apart from text: each game hands the shell a `PuzzleKit`
(its pure game functions, storage, play screen and rules text). Every game is a freshly generated puzzle (there is no
daily puzzle); a game is saved to history when it is solved or given up after being touched, and only solved games
count for the streak. Restart gives the current game up (an attempt if it was touched) and builds a different puzzle of the same difficulty, in Sudoku too; each game has its own id, so one puzzle can only ever be recorded once.

- **Queens** (`queens/lib`): N x N board (6 to 9) with N colour regions, one queen per row, column and region, none
  touching. `generator.ts` places queens, grows regions around them, then repairs the layout until the solver finds no
  second solution (`makeUnique`). `deduce.ts` models how a person solves it (eight technique tiers, from "only one
  cell left" to deep trial) and gives each puzzle its rating; the same model writes the hints. Difficulty is that rating
  (Easy tier 1-2, Medium 3, Hard 4, Expert 5 and up) as well as the size. Region numbers are shuffled so a colour never
  says which row its queen is in.
- **Zip** (`zip/lib`): a random Hamiltonian path is drawn first (`path.ts`), numbers are placed along it, and walls or
  extra numbers are added wherever the solver finds a second solution, never on the real path. `solver.ts` is
  deterministic with a node budget, so a puzzle always costs the same to verify; `draw.ts` holds the movement rules
  used by pointer and keyboard alike. The last number only opens once every other square is filled.
- **Records** store the puzzle, not the solution: the server re-solves it (exactly one solution, and for Zip within
  `NODE_BUDGET` nodes, otherwise "could not be verified"), checks the times, and works the score out again.

### Measured (scripts/bench-puzzles.ts, one desktop machine; phones are several times slower)

| | Easy | Medium | Hard | Expert |
|---|---|---|---|---|
| Queens board | 6 x 6 | 7 x 7 | 8 x 8 | 9 x 9 |
| Queens generation, mean / worst of 40 | 3 / 18 ms | 2 / 13 ms | 15 / 60 ms | 91 / 323 ms |
| Zip board | 5 x 5 | 6 x 6 | 7 x 7 | 8 x 8 |
| Zip generation, mean / worst of 30 | 1 / 7 ms | 3 / 8 ms | 47 / 168 ms | 226 / 562 ms |
| Zip solver nodes, mean / worst | 61 / 106 | 201 / 823 | 2,138 / 5,748 | 3,417 / 7,654 |

Upload verification of ten of the costliest records (hard and expert): Zip 64 ms and 183 ms, Queens 4 ms. The worst a
single Zip record can cost is `NODE_BUDGET` (50,000 nodes, roughly 110 ms at about 450 nodes per millisecond), so ten records are bounded by
about a second. Generation works to a smaller budget (`GENERATION_NODES`, 10,000), so an accepted puzzle is always well inside
the budget the server allows. Limits to keep in mind: Expert Zip is the slowest to build (about half a second at worst
on a desktop, a few seconds on a slow phone, shown as "Building..."); Queens Expert needs tier 5 or more, which about
one random layout in seven reaches; if either becomes a problem the profiles in the two `generator.ts` files are the
dials.

## Patches

A third puzzle on the same shell (`patches/lib`, `patches/components`). A clue is `{ cell, area | null, shape | null }`; the text form is `6x6;0:4s,9,14:6w,20:5f`. `shapes.ts` is the one definition of "this set of cells fits this clue" and is used by the solver, the drawing rules, the board check and the tests.

- **Solver** (`solver.ts`): each clue has candidate patches (rectangles by enumeration; freeform shapes by Redelmeier's method, each exactly once), and a solution is an exact cover of the cells. Propagation on bit masks (clue singles, cell singles, dead ends) then branching on the clue with the fewest candidates, counting up to two solutions under a node budget (`NODE_BUDGET` 20,000) and a candidate cap (40,000), so a puzzle always costs the same and anything bigger is "could not be verified". It is checked against a brute force that shares none of its code (`engine.test.ts`).
- **Generator** (`generator.ts`): carve a valid partition first (rectangles, plus bent shapes on Hard and Expert), put one clue in each patch saying what is true of it, then while a second solution exists either say more on a clue it gets wrong or move a clue inside its own patch to a cell the other solution gives elsewhere (both only add constraints the real partition meets). Harder levels then take back whatever the puzzle does not need. Nothing is accepted that is not proved unique.
- **Difficulty is the logic needed**, not just size (`rateLogic`): Easy and Medium are solved by singles alone; Hard needs a lookahead (try a placement, see it leave a clue or cell with nothing); Expert needs chained lookaheads and has more freeform shapes and plain clues. Boards are 5, 6, 7, 8 (standard) or 6, 7, 8, 9 (larger) per level.
- **Free drawing** (`canPlace` in `rules.ts`): a patch is placed if it holds exactly one clue and its cells touch; its area and shape may be wrong (it is marked, and adjusted by drawing again), and only `validateBoard` needs every patch right. `loadPatches` lets the solver and hints treat such a patch as covering its cells and using its clue.
- **Rules vs. the solution**: drawing, Check and Auto-check use only the clues and the patches placed (`rules.ts`, `conflicts`), never the hidden solution; only a paid hint consults it (`hints.ts`), so free checking cannot leak the answer. A solved board is `validateBoard`, the same patch check as drawing.
- **Interaction** (`draw.ts`, `components/board.tsx`): pressing a free cell draws (a rectangle, or painted cells for a freeform clue), pressing a patch picks it up (`grabPatch`: a rectangle is held by its nearest corner and stretches in the hand, a freeform patch grows where it is painted), a tap erases, and `commitPatch` replaces any patches a valid new one is drawn over (one undo step; a refused patch takes nothing off the board). Each clue has its own colour (`colors.ts`), used for its symbol, its patch and the draft preview. The half-drawn patch, the patch in hand, the cursor and all animation state live in the component; the game state holds only committed patches and history, so animation timing cannot change what is saved or whether the puzzle is solved. Animations are CSS (`.pt-*` in `globals.css`) and every one is switched off under `prefers-reduced-motion` (checked by a test).
- **Records** store the puzzle only: the server re-solves it, checks times and recomputes the score (`/api/sync/patches`, table `patches_sessions`).

### Measured (scripts/bench-puzzles.ts patches, one desktop machine)

| Generation, mean / worst of 40 | Easy | Medium | Hard | Expert |
|---|---|---|---|---|
| Standard board (5 / 6 / 7 / 8) | 0.3 / 3 ms | 1 / 6 ms | 6 / 25 ms | 155 / 591 ms |
| Larger board (6 / 7 / 8 / 9) | 0.1 / 0 ms | 1 / 2 ms | 7 / 29 ms | 269 / 965 ms |

Solver nodes of an accepted puzzle are at most 1,494 (`GENERATION_NODES` is 1,500). Verifying ten of the costliest uploaded records takes 17 ms. Expert is the slowest to build because most random boards do not need chained lookaheads; `PROFILES` in `generator.ts` is the dial.

## Errors and logs

The logger, the reference scheme and what each layer does on failure are described in the README (`Errors and logs`). Where the code is:

| Piece | File | Job |
|---|---|---|
| Logger | `src/lib/logger.ts` | levels, structured entries, error description, redaction, references |
| API failure | `src/lib/http.ts` | `serverFailure`: log and answer 500 with `{ error, reference }` |
| Server hook | `src/instrumentation.ts`, `instrumentation-node.ts` | `onRequestError` for pages, routes and Server Actions; process-wide handlers (Node only) |
| Browser hook | `src/instrumentation-client.ts` | uncaught errors and rejections |
| Error pages | `src/app/error.tsx`, `global-error.tsx`, `src/lib/classify-error.ts` | offline / outdated / failed, reference, `retry` |
| Actions | `features/auth/server/auth-actions.ts` | failures become a form message with a reference |

A failure that is only a nicety (the home page's progress summaries, the profile's wallet, the time zone saved at login, claiming old data for the first account) is logged and the page or action carries on without it.

## N-Back

A working-memory game (`games/nback/lib`, `components`; route `/games/n-back`, table `nback_sessions`, upload `/api/sync/nback`). The engine has no React in it.

- **Generator** (`generator.ts`): from a seed and the settings, each active stream (position, color, letter) is generated on its own random stream, so turning one stream on or off never changes another. About 25% (15-35%) of the scoreable trials match; the first n never do; no value three times in a row; non-matches avoid the n-1 and n+1 look-alikes when the value set allows. The match flags are read from the generated values and stored on each `Trial`, so scoring never looks at the screen. `GENERATOR_VERSION` must be bumped if its output ever changes.
- **Runner** (`runner.ts`, `clock.ts`): a trial is a window `[i * trialMs, (i + 1) * trialMs)` of *active* time (pauses take none). Every event is placed on that absolute clock; a timer only wakes the runner, which runs whatever is due, so late timers cannot drift the schedule. A response is placed by its own event timestamp, once per stream per trial, and refused once its trial has been evaluated. Each trial is evaluated exactly once when its window closes; one error in any stream costs exactly one life, the first n trials never do, and the session stops right after the trial that costs the fifth life. The React hook (`use-nback-session.ts`) only mirrors the runner's events.
- **Records** (`records.ts`): a saved session is `{ config, seed, generator, responses[] (a stream mask per trial), outcome, durationMs }`. The server (and every read) rebuilds the sequence from the seed and replays the responses through the same scorer, so lives, outcome, accuracy and points are never trusted from the client; the time played must match the trials played. Quit sessions are never saved.
- **Rewards** (`difficulty.ts`, `rewards.ts`): the setup's load (n + 2 per extra stream + 1 for a 5x5+ board with Position + up to 2 for fast trials) maps to easy/medium/hard/expert and pays `ECONOMY.puzzle`, once per session id, only for a completed session. A completed session is a streak day; Game Over is not.
- **Adaptive n** (`adaptive.ts`): >= 80% up, < 50% down, a Game Over counts as failed (n - 1). Computed from exact accuracy, applied to the next session only.
- **Not verified in a browser** when this was written: the unit tests (`nback.test.ts`, `runner.test.ts`) cover the engine, runner timing with a fake clock, records, rewards, streaks and storage; the screens were type-checked, linted and built only.
