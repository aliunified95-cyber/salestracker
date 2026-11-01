begin;
create table public.tracker_team_targets (
 month text primary key check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 owner_id uuid not null references public.tracker_profiles(id),
 record jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.tracker_team_targets enable row level security;
revoke all on public.tracker_team_targets from anon,authenticated;
grant select,insert,update on public.tracker_team_targets to authenticated;
grant all on public.tracker_team_targets to service_role;
create policy team_target_read on public.tracker_team_targets for select to authenticated using((select tracker_private.manager()));
create policy team_target_insert on public.tracker_team_targets for insert to authenticated with check((select tracker_private.manager()) and exists(select 1 from public.tracker_profiles p where p.id=owner_id and p.username='AM791'));
create policy team_target_update on public.tracker_team_targets for update to authenticated using((select tracker_private.manager())) with check((select tracker_private.manager()) and exists(select 1 from public.tracker_profiles p where p.id=owner_id and p.username='AM791'));
create function tracker_private.validate_team_target() returns trigger language plpgsql security invoker set search_path='' as $$
declare field text; combined numeric;
begin
 if not tracker_private.manager() then raise exception 'Manager access required';end if;
 if not exists(select 1 from public.tracker_profiles p where p.id=new.owner_id and p.username='AM791' and p.role='manager') then raise exception 'AM791 owns the team target';end if;
 if coalesce(new.record->>'mode','') not in ('sum','manual') then raise exception 'Choose combined or custom team targets';end if;
 if new.record->>'mode'='manual' then
  foreach field in array array['postpaid','broadband'] loop
   if coalesce(jsonb_typeof(new.record->field),'')!='number' or (new.record->>field)::numeric<0 then raise exception 'Enter nonnegative team targets';end if;
   select coalesce(sum((t.record->>field)::numeric),0) into combined from public.tracker_targets t join public.tracker_profiles p on p.id=t.agent_id where t.month=new.month and p.role='agent';
   if (new.record->>field)::numeric>combined then raise exception 'Custom team targets cannot exceed combined agent targets';end if;
  end loop;
 end if;
 new.updated_at:=now();return new;
end;$$;
revoke all on function tracker_private.validate_team_target() from public;
create trigger tracker_validate_team_target before insert or update on public.tracker_team_targets for each row execute function tracker_private.validate_team_target();
commit;
