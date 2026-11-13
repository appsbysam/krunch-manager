# Project KRUNCH Schedule — Development handoff

Status: isolated prototype only. No migrations applied and no live deployment changed.

## Existing system verified 14 November 2026
- App: `index.html` static PWA on GitHub Pages.
- Existing shared task/item source: `public.krunch_manager_items`.
- Existing columns: `item_kind`, `task_status`, `assigned_to`, `linked_item_ids`, `notes`, `created_at`, `updated_at`.
- Membership: `public.krunch_manager_members` has two members; tasks RLS uses owner/editor memberships for mutation.
- Existing frontend uses Supabase REST requests; refreshes about every 12 seconds when visible.
- Existing task links connect tasks to purchase/equipment items, not scheduling prerequisites.
- Existing live app has six bottom tabs: Home, Items, Tasks, Budget, Progress, Settings.
- No confirmed dates/dependencies/appointments exist in current task schema.

## Architecture
1. Keep existing task records authoritative; no copying them into a second task table.
2. Add a dedicated Schedule navigation tab. Move Settings to a More menu after phone testing.
3. Add scheduling metadata keyed to existing task UUID:
   - due_date date nullable
   - starts_at timestamptz nullable
   - ends_at timestamptz nullable
   - priority text (Critical/High/Normal/Low)
   - date_confidence text (Confirmed/Proposed/Contingency)
   - scheduled_kind text (Task/Appointment/Milestone)
   - version or updated_at field for concurrency.
4. Separate task-to-task prerequisite edges from existing `linked_item_ids` equipment links.
5. Preparation checklists should have IDs and completion metadata; events should be able to associate with tasks.
6. Store photos in private Supabase Storage and enforce membership policy. Do not place secrets in browser code.
7. Reuse owner/editor membership policies with proper SELECT/INSERT/UPDATE/DELETE and project access controls.
8. Prevent overlapping edits from silently overwriting one another. Preserve existing Task statuses and choose deliberate mapping for new labels.
9. Render explicit last-synced, retry and error states. Background refresh currently logs and suppresses errors.

## Data migration plan (NOT EXECUTED)
- Inspect existing RLS and primary keys before constructing reversible SQL migration.
- Prefer `krunch_manager_task_schedule` with `task_id uuid primary key references krunch_manager_items(id)`; do not alter task item links.
- Add `krunch_manager_task_dependencies` with `task_id`, `prerequisite_task_id`, uniqueness and non-self constraint.
- Add `krunch_manager_schedule_events` with optional `task_id`, title, starts_at, ends_at, status and is_confirmed.
- Add `krunch_manager_task_checklist` with task_id, description, done, ordinal, modified_by.
- Add `krunch_manager_task_activity` for audits and completion trails.
- Enable RLS on each new table and ensure access only to existing KRUNCH members.
- Stage and test migrations before live deployment; back up existing database first.

## Key acceptance tests
- Sam edits an existing task from Tasks: Schedule immediately shows the same status.
- Alan changes task due date from Schedule: the Tasks section shows it.
- Blocking prerequisite unfinished: dependent task shows At Risk, not silently rescheduled.
- A proposed appointment is not described as confirmed.
- Simultaneous edits from Sam/Alan produce a conflict warning or safe merge.
- Slow/unavailable network exposes a visible failure state and avoids claiming a successful save.
- Calendar in Sydney displays dates without UTC day shifting.
- 320–390px mobile screens support one-handed use without horizontal scrolling.
- Login/logout and RLS prevent unauthorised data reads/writes.
- Existing items, purchases, suppliers and financial records remain unchanged.

## Prototype
`schedule-preview.html` is intentionally standalone and uses clearly labelled example tasks.
It does not connect to Supabase, issue live writes, install a service worker, or modify the live navigation.
Preview demo changes last only until the page is reloaded.

## Next implementation steps
1. Inspect authenticated application behaviour and resolve reliability defects.
2. Make and verify a development database backup.
3. Design/test migration on an isolated backend or approved staging environment.
4. Wire Schedule to existing task API with safe concurrency handling.
5. Add event/checklist persistence and import reviewed KRUNCH whiteboard schedule.
6. Test with both user accounts before an approved production release.
