# LeanLook Pro

LeanLook Pro is an AI-powered construction scheduling tool that turns master schedules — PDF, Excel, CSV, or MS Project files — into editable 2-week look-ahead tables. It uses AI to extract tasks, auto-tag trades, suggest smart-fill completions, and provides a mobile-first editing UI so field teams can update progress, mark statuses, and track constraints in real time.

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend & Data:** Supabase (Auth, Postgres, Storage, Edge Functions)
- **AI:** Lovable AI Gateway for schedule parsing and subtask generation
- **Deployment:** Lovable Hosting

## Local Setup

1. **Clone the repo**
2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```
3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in the `VITE_SUPABASE_*` values in `.env`.
4. **Start the dev server**
   ```bash
   npm run dev
   ```

## App Routes & Features

| Route | Feature |
|-------|---------|
| `/` | Dashboard — overview of active projects, look-aheads, and uploaded schedules |
| `/projects` | Projects list and creation |
| `/projects/:id` | Project detail, schedule versions, and look-ahead management |
| `/lookaheads/:id` | Look-ahead editor — 2-week table with inline status updates, drag-and-drop, and constraint tracking |
| `/master-tasks` | Master task library — canonical tasks synced from imports and editor changes |
| `/subcontractors` | Vendor CRM with insurance tracking and bulk actions |
| `/analytics` | Lean metrics — PPC (Percent Plan Complete), variance tracking, and constraint reporting |
| `/settings` | Company settings, user invites, and role management |

## Supabase Edge Functions

- **`parse-schedule`** — Accepts uploaded schedule files (PDF, Excel, CSV, MPP), extracts task data via AI, and populates the master task repository.
- **`invite-user`** — Sends role-scoped company invitations with admin verification.
- **`remove-user`** — Admin-verified user removal with company scoping checks.
