# SocialUs

**As of 2026-10-29** · Source: hand-written · Maintained by: hand (set by tend-docs from the last commit date; the owner confirms on next edit)

*As of 2026-09-15 (content last changed that day). Review notes: `docs/DOC-INVENTORY.md`.*

Locals supporting locals. SocialUs is a map-based place where the people of a town find and support each other: buy, sell, trade, teach, gather, hire, and give, with the money and the help staying with the people who live there. Businesses are one kind of local among many, not the point of the app.

It works the same when you travel. Visiting somewhere, you can find lodging, food and services owned by the people who live there, over chains and outside owners, so what you spend stays in the place you are visiting.

## Prerequisites

- Node.js 20+
- npm 10+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Mapbox](https://mapbox.com) account (free tier: 50k map loads/mo)

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
SUPABASE_SECRET_KEY=sb_secret_your-key
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

### Supabase Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Copy the project URL and publishable key from Settings > API
3. Run the database migrations (see `INFRASTRUCTURE.md` for schema details)

### Mapbox Setup

1. Create an account at [mapbox.com](https://mapbox.com)
2. Copy your default public token from your account page

## Development Server

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000). Hot-reloads on save.

## Build

```bash
npm run build    # Production build
npm run start    # Serve production build locally
```

## Testing

```bash
npm run test          # Vitest unit tests (single run)
npm run test:watch    # Vitest in watch mode
npm run lint          # ESLint
```

## Evals (Playwright)

```bash
npx playwright install    # First time only — installs browsers
npm run eval              # Run all Playwright tests
npm run eval:ui           # Interactive Playwright UI
npm run eval -- --grep "F001"   # Run tests for a specific feature
```

Evals run against `http://localhost:3000` (auto-starts dev server if needed).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (Postgres + Auth) |
| Maps | Mapbox GL JS |
| Unit Tests | Vitest + Testing Library |
| E2E Tests | Playwright |
| Deploy | Vercel |
