-- Apply once in the Sales Tracker Supabase SQL Editor.
-- Dedicated tables preserve existing sales, rules and targets.
begin;
create table if not exists public.tracker_tag_rows(
 report_type text not null check(report_type in ('new','upgrade')),
 sale_date date not null,
 subscriber text not null check(subscriber ~ '^[0-9]{6,15}$'),
 tag_agent_id text not null default '',
 tag_pay_desk text not null default '',
 imported_at timestamptz not null default now(),
 primary key(report_type,sale_date,subscriber)
);
create table if not exists public.tracker_tag_coverage(
 report_type text not null check(report_type in ('new','upgrade')),
 sale_date date not null,
 row_count integer not null default 0,
 uploaded_at timestamptz not null default now(),
 uploaded_by uuid not null references public.tracker_profiles(id),
 primary key(report_type,sale_date)
);
create index if not exists tracker_tag_rows_date_sub on public.tracker_tag_rows(sale_date,subscriber);
alter table public.tracker_tag_rows enable row level security;
alter table public.tracker_tag_coverage enable row level security;
revoke all on public.tracker_tag_rows,public.tracker_tag_coverage from public,anon,authenticated;
grant all on public.tracker_tag_rows,public.tracker_tag_coverage to service_role;

-- Only AM791 may upload reports. Re-import replaces records on the dates in that specific report type,
-- and never deletes an unrelated date or the other report type.
create or replace function public.tracker_tag_upload(kind text,entries jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; d date; subscriber text; agent text; desk text; n integer; days integer;
begin
 if auth.uid() is null or not exists(
  select 1 from public.tracker_profiles
  where id=auth.uid() and username='AM791' and role='manager' and active and not must_change_pin
 ) then raise exception 'AM791 manager access required';end if;
 if kind not in ('new','upgrade') then raise exception 'Invalid report type';end if;
 if jsonb_typeof(entries) <> 'array' then raise exception 'Expected report rows';end if;
 n:=jsonb_array_length(entries);
 if n<1 or n>5000 then raise exception 'Report must have 1 to 5000 rows';end if;
 -- Validate all rows before deleting any existing data.
 for item in select value from jsonb_array_elements(entries) loop
   if coalesce(item->>'subscriber','') !~ '^[0-9]{6,15}$'
      or coalesce(item->>'sale_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or length(coalesce(item->>'tag_agent_id',''))>100
      or length(coalesce(item->>'tag_pay_desk',''))>100
     then raise exception 'Invalid report entry';end if;
   d:=(item->>'sale_date')::date;
   if d>current_date+1 then raise exception 'Report cannot include future dates';end if;
 end loop;
 days:=0;
 for d in select distinct (value->>'sale_date')::date from jsonb_array_elements(entries) loop
   delete from public.tracker_tag_rows where report_type=kind and sale_date=d;
   insert into public.tracker_tag_coverage(report_type,sale_date,row_count,uploaded_at,uploaded_by)
   values(kind,d,0,now(),auth.uid())
   on conflict(report_type,sale_date) do update
     set row_count=0,uploaded_at=excluded.uploaded_at,uploaded_by=excluded.uploaded_by;
   days:=days+1;
 end loop;
 for item in select value from jsonb_array_elements(entries) loop
   subscriber:=item->>'subscriber';d:=(item->>'sale_date')::date;
   agent:=coalesce(item->>'tag_agent_id','');desk:=coalesce(item->>'tag_pay_desk','');
   insert into public.tracker_tag_rows(report_type,sale_date,subscriber,tag_agent_id,tag_pay_desk)
   values(kind,d,subscriber,agent,desk);
 end loop;
 update public.tracker_tag_coverage c set row_count=(
   select count(*) from public.tracker_tag_rows r
   where r.report_type=c.report_type and r.sale_date=c.sale_date
 ) where c.report_type=kind and c.sale_date in (
   select distinct (value->>'sale_date')::date from jsonb_array_elements(entries)
 );
 return jsonb_build_object('imported',n,'covered_dates',days,'report_type',kind);
end $$;
revoke all on function public.tracker_tag_upload(text,jsonb) from public,anon;
grant execute on function public.tracker_tag_upload(text,jsonb) to authenticated;

-- RLS-safe projection: agents get statuses only for their own tracker_sales records;
-- managers may see the full team. No raw report data is returned.
create or replace function public.tracker_tag_statuses()
returns table(sale_id text,status text) language sql stable security definer set search_path='' as $$
 with eligible as (
  select s.id,s.record,s.agent_id,
  regexp_replace(coalesce(s.record->>'msisdn',''),'[^0-9]','','g') as digits
  from public.tracker_sales s
  where auth.uid() is not null and tracker_private.ready()
    and (s.agent_id=auth.uid() or tracker_private.manager())
 )
 select e.id,
 case when coverage.sale_date is null then 'NA'
      when nullif(btrim(r.tag_agent_id),'') is not null
        or nullif(btrim(r.tag_pay_desk),'') is not null then 'Yes'
      else 'No' end
 from eligible e
 left join public.tracker_tag_coverage coverage
 on coverage.report_type=case when e.record->>'saleType'='upgrade' then 'upgrade' else 'new' end
 and coverage.sale_date=(e.record->>'date')::date
 left join public.tracker_tag_rows r
 on r.report_type=case when e.record->>'saleType'='upgrade' then 'upgrade' else 'new' end
 and r.sale_date=(e.record->>'date')::date
 and r.subscriber=case when length(e.digits)>8 and left(e.digits,3)='973'
                        then substring(e.digits from 4) else e.digits end;
$$;
revoke all on function public.tracker_tag_statuses() from public,anon;
grant execute on function public.tracker_tag_statuses() to authenticated;
notify pgrst, 'reload schema';
commit;
notify pgrst, 'reload schema';
