-- Staff roles and RLS helpers (KB §5, §11), plus read policies for the
-- baseline tables. Writes stay with the service role (no write policies).

-- role ----------------------------------------------------------------------

create type public.staff_role as enum ('coach', 'analyst', 'medical', 'viewer');

-- New staff get the least-privileged role until a coach promotes them.
alter table public.staff
  add column role public.staff_role not null default 'viewer';

-- helpers -------------------------------------------------------------------
-- security definer so policies can read staff without recursing into its RLS;
-- empty search_path so every reference is schema-qualified.

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff where user_id = (select auth.uid())
  );
$$;

create function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
     where user_id = (select auth.uid())
       and role::text = required_role
  );
$$;

comment on function public.is_staff() is
  'True when the current user has a staff row.';
comment on function public.has_role(text) is
  'True when the current user is staff with the given role (coach, analyst, medical, viewer).';

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.has_role(text) to authenticated, service_role;

-- read policies -------------------------------------------------------------
-- Performance data: every staff role (KB §11).

create policy "Staff read athletes"
  on public.athletes for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read activities"
  on public.activities for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read activity intervals"
  on public.activity_intervals for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read staff"
  on public.staff for select to authenticated
  using ((select public.is_staff()));

-- Wellness and HRV are health data: coach, analyst and medical only (KB §11).
-- Body weight in kg is narrowed further to coach and medical in 2.10.

create policy "Coach, analyst and medical read wellness"
  on public.wellness for select to authenticated
  using (
    (select public.has_role('coach'))
    or (select public.has_role('analyst'))
    or (select public.has_role('medical'))
  );
