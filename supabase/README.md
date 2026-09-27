# Supabase Backend Setup

ProjectFlow runs in **local browser mode by default**. Supabase mode is opt-in so an incomplete cloud setup never breaks local development.

## 1. Create / connect a Supabase project

Use a Supabase project you control. Do not put the service-role key in the frontend.

## 2. Apply migrations

Apply all SQL files under:

`supabase/migrations/`

The first backend migration creates:

- profiles
- projects
- project_members
- boards
- canvas_nodes
- canvas_edges
- canvas_strokes
- board_versions
- canvas_assets
- private `canvas-assets` Storage bucket
- RLS policies
- Auth profile trigger
- atomic Canvas load/save RPCs

## 3. Configure frontend environment

Copy `.env.example` to your local environment file and set:

```bash
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Only the public anon/publishable key belongs in the browser.

If either URL or key is missing, ProjectFlow intentionally falls back to local mode.

## 4. Authentication

Supabase mode enables:

- email/password signup
- email/password login
- refresh-token session renewal
- authenticated route gate
- sign out

If email confirmation is enabled in Supabase Auth, new users must confirm their email before their first login.

## 5. Security model

Access is scoped by project membership:

- owner: full project administration
- admin: project administration
- editor: edit project content
- viewer: read-only access

RLS is enabled on all application tables. Canvas Storage is private and uses the project ID as the first object-path segment so Storage policies can enforce the same project membership rules.

## 6. Data adapter behavior

The public service contracts stay unchanged.

Local mode:

`UI -> hooks -> services -> localStorage / IndexedDB`

Supabase mode:

`UI -> hooks -> services -> Supabase Auth / PostgREST / Storage`

This is intentional: Canvas components do not know which backend is active.

## Current cloud coverage

Supabase mode persists:

- accounts / sessions
- projects
- project membership foundation
- boards
- canvas nodes
- edges / dependencies
- freehand strokes
- viewport
- board version history
- image assets
- project search and execution intelligence through the remote Canvas source

## Migration of existing local browser data

Existing local data is not uploaded automatically. Keep Local mode enabled until a dedicated, user-triggered migration/import step is run. Board JSON Backup/Import remains available as a safe manual transfer path.
