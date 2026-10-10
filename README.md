# Timez

Timez is an adaptive multiplication practice app. Choose the numbers (1–20) you want to drill, pick a session length, and the trainer records your accuracy and speed for every pair, then steers practice toward the facts you find hardest.

## Features

- **Configurable practice**: choose the left and right operands independently, with fixed-length (10, 20, 30, 50 or 100 questions) or endless sessions.
- **Adaptive question selection**: by default about 30% of questions come from your weakest selected pairs, weighted by weakness. Recently asked questions are avoided.
- **Spaced repetition**: each pair moves through five Leitner boxes (reviewed after 1, 2, 4, 8 and 16 days), and pairs that are due are favoured when picking questions.
- **Review mistakes**: retry the questions you missed in a session, or everything you got wrong in the last 7 days.
- **Per-pair statistics**: accuracy, average, fastest and slowest response time, streaks and a 0–100 weakness score.
- **Progress dashboard**: total questions, overall accuracy, weighted average response time, and your weakest and most mastered pairs.
- **Tables heatmap**: a 20×20 matrix showing the weakness score of every pair at a glance.
- **Keyboard-first practice screen** with instant right/wrong feedback, a live streak and session accuracy.
- **Light and dark themes** (follows the system, switchable in the header).
- **Validated API**: all inputs are checked server-side, and attempts on finished sessions are rejected.

- **Timed challenges** (30, 60 or 120 seconds) with a personal best per length, and a session summary page after every session.
- **Settings**: tune the weak-pair focus and the recent-question window; they are saved in your browser.

## Tech stack

| Area      | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Framework | [Next.js](https://nextjs.org) (App Router) and React 19      |
| Language  | TypeScript                                                   |
| Styling   | Tailwind CSS 4, shadcn-style components on Base UI and Radix |
| Database  | Postgres via [Neon](https://neon.tech) serverless driver     |
| ORM       | Drizzle ORM and drizzle-kit                                  |
| Charts    | Recharts                                                     |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A Postgres database (a free Neon project works well)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure the database connection
cp .env.example .env.local     # then set DATABASE_URL

# 3. Create the tables
npm run db:push

# 4. Start the dev server
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

| Variable       | Description                                              |
| -------------- | -------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string used by the app and drizzle-kit |

## Scripts

| Script                | Description                      |
| --------------------- | -------------------------------- |
| `npm run dev`         | Start the development server     |
| `npm run build`       | Create a production build        |
| `npm start`           | Serve the production build       |
| `npm run lint`        | Run ESLint                       |
| `npm run typecheck`   | Run the TypeScript compiler      |
| `npm run db:push`     | Sync the schema to the database  |
| `npm run db:generate` | Generate SQL migrations          |
| `npm run db:studio`   | Browse data with Drizzle Studio  |

## How it works

1. **Start**: the setup page creates a session (`POST /api/sessions`) storing the selected operands and length.
2. **Ask**: the practice screen requests a question (`GET /api/sessions/:id/next`). The question engine (`src/lib/question-engine.ts`) either samples uniformly from your selection or, with the configured probability, from your weakest selected pairs.
3. **Answer**: each answer is posted (`POST /api/sessions/:id/attempt`). The server checks it, then updates the session totals, the pair statistics and the per-table statistics.
4. **Review**: the Progress and Tables pages read the aggregated statistics.

### Weakness score

For each pair the score starts from the error rate (`100 − accuracy`), then adds 10 if the average response is slower than 5 s and 10 per consecutive miss after the first, and subtracts 20 after four correct answers in a row. The result is clamped to 0–100.

### API

| Method | Endpoint                    | Purpose                                                        |
| ------ | --------------------------- | -------------------------------------------------------------- |
| POST   | `/api/sessions`             | Create a session (`fixed`, `endless`, `timed` or `review`)  |
| GET    | `/api/sessions/:id/next`    | Get the next question, or `{ "finished": true }`               |
| POST   | `/api/sessions/:id/attempt` | Submit `{ left, right, userAnswer, responseTimeMs }`           |
| POST   | `/api/sessions/:id/end`     | Mark a session as ended                                        |

Errors are returned as `{ "error": "..." }` with status 400 (invalid input), 404 (unknown session), 409 (session already completed) or 500.

## Project structure

```
src/
  app/
    page.tsx              Practice setup
    practice/[id]/        Live practice session
    progress/             Progress dashboard
    tables/               20×20 weakness heatmap
    settings/             Training preferences
    api/sessions/         REST endpoints
  components/             App components; shadcn-style primitives in components/ui
  db/                     Drizzle schema and database client
  lib/                    Question engine, request validation, utilities
```

## Notes

- There is no authentication: statistics are shared by everyone using the same database.
- The app needs `DATABASE_URL` at runtime; pages that read statistics are rendered on demand, so builds do not need database access.
