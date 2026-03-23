
# LeanLook — Phase 1: Foundations

## Overview
Build the complete foundation: database schema, authentication, multi-tenant structure, project dashboard, and schedule upload UI. This sets up everything needed for the look-ahead editor in Phase 2.

## 1. Design System
- Construction-blue palette (#0f172a primary, #3b82f6 accent)
- Clean, professional layout using shadcn/ui
- Responsive sidebar navigation
- Dark mode support

## 2. Database Schema (via Lovable Cloud / Supabase)
Create all core tables with RLS:
- **companies** (id, name, slug)
- **projects** (id, company_id, name, status)
- **user_roles** (id, user_id, role enum: admin/pm/super)
- **profiles** (id, user_id, company_id, display_name, project_ids)
- **schedule_versions** (id, project_id, file_url, uploaded_at, version_number)
- **tasks** (id, schedule_version_id, external_id, name, duration, start, finish, percent_complete, parent_id, predecessors jsonb, tags, metadata)
- **look_aheads** (id, project_id, super_id, week_start_date, status)
- **lookahead_lines** (id, lookahead_id, task_id, custom_text, status_per_day jsonb, notes, photos, assigned_trade, materials_needed, constraints)
- **task_templates** (id, company_id, tag, checklist_items jsonb)

All tables include company_id for multi-tenancy. RLS policies enforce role-based access using a `has_role()` security definer function.

## 3. Authentication Flow
- Sign up / Sign in pages with email auth
- Auto-create profile on signup
- Role-based route protection
- Company selection/creation on first login

## 4. Main Navigation & Dashboard
- **Sidebar**: My Projects, Company Settings (admin), Profile
- **Dashboard cards**: Active Projects count, Pending Look-Aheads, Recent Schedule Uploads
- **Project list** with search/filter, status badges

## 5. Project Page
- Project detail header with current schedule version info
- "Upload New Schedule" button with drag-and-drop zone (PDF/Excel/CSV)
- File stored in Supabase Storage bucket
- Schedule version history list
- Placeholder for Gantt preview and "Create Look-Ahead" button (Phase 2)

## 6. Schedule Upload & AI Parsing
- Edge function that receives uploaded file
- Uses Lovable AI (Gemini) to extract tasks from PDF/Excel content:
  - Task ID, name, duration, start/finish dates, % complete
  - Hierarchy detection (parent/child)
  - Auto-tagging (MEP, Finishes, Demolition, Critical, etc.)
  - Predecessor relationships
- Creates schedule_version record and populates tasks table
- Toast notification on completion with task count

This phase delivers a working app where users can sign up, create companies/projects, upload schedules, and see parsed tasks. Phase 2 will add the 2-week look-ahead editor, PDF export, and analytics.
