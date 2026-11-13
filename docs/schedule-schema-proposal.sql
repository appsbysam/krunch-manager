-- PROPOSED ONLY — DO NOT APPLY TO PRODUCTION UNTIL BACKUP AND TESTING.
-- Project KRUNCH Schedule, isolated metadata rather than duplicate task rows.
create table if not exists public.krunch_manager_task_schedule (
  task_id uuid primary key references public.krunch_manager_items(id) on delete cascade,
  due_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  priority text not null default 'Normal' check (priority in ('Critical','High','Normal','Low')),
  date_confidence text not null default 'Proposed' check (date_confidence in ('Confirmed','Proposed','Contingency')),
  modified_at timestamptz not null default now(),
  modified_by uuid references auth.users(id),
  constraint valid_time_order check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create table if not exists public.krunch_manager_task_dependencies (
  task_id uuid not null references public.krunch_manager_items(id) on delete cascade,
  prerequisite_task_id uuid not null references public.krunch_manager_items(id) on delete cascade,
  primary key (task_id,prerequisite_task_id),
  constraint no_self_dependency check (task_id<>prerequisite_task_id)
);
create table if not exists public.krunch_manager_schedule_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.krunch_manager_items(id) on delete set null,
  title text not null,
  kind text not null check (kind in ('Appointment','Milestone')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  confidence text not null default 'Proposed' check(confidence in ('Confirmed','Proposed','Contingency')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint valid_event_times check(ends_at is null or ends_at >= starts_at)
);
create table if not exists public.krunch_manager_task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.krunch_manager_items(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  modified_at timestamptz not null default now(),
  modified_by uuid references auth.users(id)
);
-- Security: no public access. Reuse existing KRUNCH memberships.
alter table public.krunch_manager_task_schedule enable row level security;
alter table public.krunch_manager_task_dependencies enable row level security;
alter table public.krunch_manager_schedule_events enable row level security;
alter table public.krunch_manager_task_checklist enable row level security;
-- Intentionally require separately reviewed membership-aware CRUD policies before applying.
-- Cyclic dependency prevention, optimistic concurrency, and unique event semantics require implementation testing.
