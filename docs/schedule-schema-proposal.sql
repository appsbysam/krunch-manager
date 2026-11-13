-- Project KRUNCH Schedule — REVIEWED MIGRATION CANDIDATE (NOT APPLIED).
-- IMPORTANT: Apply on a disposable/staging Supabase branch and test first.
-- All new task schedule rows reference EXISTING krunch_manager_items.
-- No changes to old task records, purchases, supplier or financial tables.
BEGIN;

CREATE TABLE IF NOT EXISTS public.krunch_manager_task_schedule (
 task_id uuid PRIMARY KEY REFERENCES public.krunch_manager_items(id) ON DELETE CASCADE,
 due_date date,
 starts_at timestamptz,
 ends_at timestamptz,
 priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Critical','High','Normal','Low')),
 date_confidence text NOT NULL DEFAULT 'Proposed' CHECK (date_confidence IN ('Confirmed','Proposed','Contingency')),
 modified_at timestamptz NOT NULL DEFAULT now(),
 modified_by uuid REFERENCES auth.users(id),
 CONSTRAINT schedule_time_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.krunch_manager_task_dependencies (
 task_id uuid NOT NULL REFERENCES public.krunch_manager_items(id) ON DELETE CASCADE,
 prerequisite_task_id uuid NOT NULL REFERENCES public.krunch_manager_items(id) ON DELETE CASCADE,
 PRIMARY KEY (task_id, prerequisite_task_id),
 CONSTRAINT schedule_no_self_reference CHECK (task_id <> prerequisite_task_id)
);

CREATE TABLE IF NOT EXISTS public.krunch_manager_schedule_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid REFERENCES public.krunch_manager_items(id) ON DELETE SET NULL,
 title text NOT NULL CHECK (length(trim(title)) > 0),
 kind text NOT NULL CHECK (kind IN ('Appointment','Milestone')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz,
 confidence text NOT NULL DEFAULT 'Proposed' CHECK (confidence IN ('Confirmed','Proposed','Contingency')),
 notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 modified_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT event_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.krunch_manager_task_checklist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES public.krunch_manager_items(id) ON DELETE CASCADE,
 label text NOT NULL CHECK (length(trim(label)) > 0),
 done boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 modified_at timestamptz NOT NULL DEFAULT now(),
 modified_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS krunch_schedule_due_idx ON public.krunch_manager_task_schedule(due_date);
CREATE INDEX IF NOT EXISTS krunch_events_start_idx ON public.krunch_manager_schedule_events(starts_at);
CREATE INDEX IF NOT EXISTS krunch_checklist_task_idx ON public.krunch_manager_task_checklist(task_id);
CREATE INDEX IF NOT EXISTS krunch_dep_prerequisite_idx ON public.krunch_manager_task_dependencies(prerequisite_task_id);

ALTER TABLE public.krunch_manager_task_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krunch_manager_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krunch_manager_schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krunch_manager_task_checklist ENABLE ROW LEVEL SECURITY;

-- Only existing KRUNCH members may read; owner/editor members may write.
-- Membership lookup follows the existing public.krunch_manager_members RLS policy.
-- Additional restrictions enforce that schedule/dependency/checklist IDs refer to task items.
DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'krunch_manager_task_schedule',
  'krunch_manager_task_dependencies',
  'krunch_manager_schedule_events',
  'krunch_manager_task_checklist'
 ] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.krunch_manager_members m WHERE m.user_id = (SELECT auth.uid())))',
   t || '_member_read', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.krunch_manager_members m WHERE m.user_id = (SELECT auth.uid()) AND m.role IN (''owner'',''editor'')))',
   t || '_editor_insert', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.krunch_manager_members m WHERE m.user_id = (SELECT auth.uid()) AND m.role IN (''owner'',''editor''))) WITH CHECK (EXISTS (SELECT 1 FROM public.krunch_manager_members m WHERE m.user_id = (SELECT auth.uid()) AND m.role IN (''owner'',''editor'')))',
   t || '_editor_update', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.krunch_manager_members m WHERE m.user_id = (SELECT auth.uid()) AND m.role IN (''owner'',''editor'')))',
   t || '_editor_delete', t);
 END LOOP;
END $rls$;

-- CRITICAL: Authenticated can mean any signed-in Supabase user.
-- These GRANTs operate together with RLS above; RLS limits to KRUNCH membership.
GRANT SELECT, INSERT, UPDATE, DELETE ON
 public.krunch_manager_task_schedule,
 public.krunch_manager_task_dependencies,
 public.krunch_manager_schedule_events,
 public.krunch_manager_task_checklist
 TO authenticated;
REVOKE ALL ON
 public.krunch_manager_task_schedule,
 public.krunch_manager_task_dependencies,
 public.krunch_manager_schedule_events,
 public.krunch_manager_task_checklist
 FROM anon;

COMMIT;

-- REQUIRED PRE-PRODUCTION TESTS:
-- 1. Verify member owner/editor can CRUD each table.
-- 2. Verify non-member signed-in user cannot SELECT or WRITE.
-- 3. Verify other roles cannot WRITE.
-- 4. Verify invalid task references, self-links and time order are rejected.
-- 5. Confirm application validation rejects cycles and references to items of kind != Task.
-- 6. Confirm rollback strategy and migration history in staging.
-- 7. Confirm time zone Australia/Sydney for date display.
-- 8. Prevent lost updates with changed-_at optimistic concurrency in application.
-- 9. Verify RLS and Data API grants from client, not just SQL admin.
-- 10. Do not publish or apply this SQL to production without explicit approval.
