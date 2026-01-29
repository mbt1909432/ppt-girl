# Database Setup — Chatbot (Supabase)

SQL schema and migrations for the chatbot feature. Run these in your **Supabase SQL Editor** against a **new** project database.

## Prerequisites

- A Supabase project ([create one](https://database.new) if needed)
- `.env.local` configured with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pointing to that project

## Execution Order

Run the files **in this order**, one at a time. Confirm each run succeeds before proceeding.

| Order | File | Purpose |
|-------|------|---------|
| 1 | `schema.sql` | Base tables (`chat_sessions`, `chat_messages`), RLS, indexes, triggers |
| 2 | `migration-acontext.sql` | Add `acontext_session_id`, `acontext_space_id` to `chat_sessions` |
| 3 | `migration-acontext-disk.sql` | Add `acontext_disk_id` to `chat_sessions` |
| 4 | `migration-acontext-space-user.sql` | Create `user_acontext_spaces` table |
| 5 | `migration-acontext-session-id-as-primary-key.sql` | Change `chat_sessions.id` and `chat_messages.session_id` from UUID to TEXT (Acontext session IDs), drop/recreate dependent RLS policies |

## Steps

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor** → **New query**.
3. Copy the contents of `schema.sql`, paste into the editor, click **Run**.
4. Repeat for `migration-acontext.sql`, then `migration-acontext-disk.sql`, then `migration-acontext-space-user.sql`, then `migration-acontext-session-id-as-primary-key.sql`.

## Notes

- **Fresh database only.** These scripts assume no existing `chat_sessions` / `chat_messages` tables. If you already ran older migrations, you may need to reset or adjust.
- **Order matters.** Migrations depend on previous ones; do not skip or reorder.
- After step 5, `chat_sessions.id` is TEXT (Acontext session IDs). The app uses this for `/protected/[id]` and session lookup.

## Files Overview

| File | Description |
|------|-------------|
| `schema.sql` | Base schema, RLS, `update_updated_at` trigger |
| `migration-acontext.sql` | Acontext session/space fields on `chat_sessions` |
| `migration-acontext-disk.sql` | Acontext Disk ID per session |
| `migration-acontext-space-user.sql` | Per-user default Acontext Space mapping |
| `migration-acontext-session-id-as-primary-key.sql` | UUID → TEXT for session IDs, policy drops/recreates |

## Adding New Migrations

When you add a new SQL file to this folder:

1. **Execution order** — Add a row to the **Execution Order** table above. Place it after any migrations it depends on (e.g. new columns → after the migration that creates the table). New migrations typically go **after** step 5.
2. **Steps** — Update the **Steps** section (step 4) to include the new file in the "Repeat for …" list, in the same order.
3. **Files overview** — Add a row to the **Files Overview** table with the filename and a short description.
4. **Naming** — Use `migration-<short-name>.sql` for migrations (e.g. `migration-acontext-sandbox.sql`). Keep `schema.sql` as the single base schema.
