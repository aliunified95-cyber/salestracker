begin;
create schema if not exists tracker_private;
revoke all on schema tracker_private from public;
grant usage on schema tracker_private to authenticated,service_role;

create table public.tracker_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check(username ~ '^[A-Z0-9_]{3,30}$'),
 display_name text not null, role text not null default 'agent' check(role in ('manager','agent')),
 active boolean not null default true, must_change_pin boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.tracker_rules(id text primary key check(id ~ '^[A-Za-z0-9_-]{1,100}$'),record jsonb not null);
create table public.tracker_targets(agent_id uuid references public.tracker_profiles(id),month text check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),record jsonb not null,primary key(agent_id,month));
create table public.tracker_sales(id text primary key check(id ~ '^[A-Za-z0-9_-]{1,100}$'),agent_id uuid not null references public.tracker_profiles(id),record jsonb not null);
create unique index tracker_unique_order on public.tracker_sales(agent_id,lower(record->>'orderNo'));
create index tracker_sales_agent on public.tracker_sales(agent_id);
create index tracker_sales_month on public.tracker_sales((left(record->>'date',7)));
create table tracker_private.attempts(bucket text primary key,started_at timestamptz not null,attempts int not null);
alter table tracker_private.attempts enable row level security;
grant all on tracker_private.attempts to service_role;

create function tracker_private.manager() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tracker_profiles where id=auth.uid() and active and not must_change_pin and role='manager');
$$;
create function tracker_private.ready() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tracker_profiles where id=auth.uid() and active and not must_change_pin);
$$;
revoke all on function tracker_private.manager(),tracker_private.ready() from public;
grant execute on function tracker_private.manager(),tracker_private.ready() to authenticated;

alter table public.tracker_profiles enable row level security;
alter table public.tracker_rules enable row level security;
alter table public.tracker_targets enable row level security;
alter table public.tracker_sales enable row level security;
revoke all on public.tracker_profiles,public.tracker_rules,public.tracker_targets,public.tracker_sales from anon,authenticated;
grant select on public.tracker_profiles to authenticated;
grant select,insert,update,delete on public.tracker_rules,public.tracker_targets,public.tracker_sales to authenticated;
grant all on public.tracker_profiles,public.tracker_rules,public.tracker_targets,public.tracker_sales to service_role;
create policy profile_read on public.tracker_profiles for select to authenticated using(id=(select auth.uid()) or (select tracker_private.manager()));
create policy rules_read on public.tracker_rules for select to authenticated using((select tracker_private.ready()));
create policy rules_write on public.tracker_rules for all to authenticated using((select tracker_private.manager())) with check((select tracker_private.manager()));
create policy targets_read on public.tracker_targets for select to authenticated using((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager())));
create policy targets_write on public.tracker_targets for all to authenticated using((select tracker_private.manager())) with check((select tracker_private.manager()));
create policy sales_read on public.tracker_sales for select to authenticated using((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager())));
create policy sales_insert on public.tracker_sales for insert to authenticated with check((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager())));
create policy sales_update on public.tracker_sales for update to authenticated using((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager()))) with check((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager())));
create policy sales_delete on public.tracker_sales for delete to authenticated using((select tracker_private.ready()) and (agent_id=(select auth.uid()) or (select tracker_private.manager())));

create function public.tracker_attempt(bucket text,max_attempts integer default 8) returns boolean language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into tracker_private.attempts values(bucket,now(),1) on conflict(bucket) do update set
 attempts=case when attempts.started_at < now()-interval '15 minutes' then 1 else attempts.attempts+1 end,
 started_at=case when attempts.started_at < now()-interval '15 minutes' then now() else attempts.started_at end returning attempts into n;
 return n<=max_attempts;
end;$$;
revoke all on function public.tracker_attempt(text,integer) from public,anon,authenticated;
grant execute on function public.tracker_attempt(text,integer) to service_role;

create function tracker_private.validate_record() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb:=new.record; ru record; ar numeric; p numeric; field text; unchanged boolean:=false; importing boolean;
begin
 if tg_table_name='tracker_targets' then
  if jsonb_typeof(r)!='object' or not r ?& array['postpaid','broadband'] then raise exception 'Both monthly targets are required'; end if;
  foreach field in array array['postpaid','broadband','postpaidArpu','mbbArpu','fiberArpu','hbbArpu'] loop
   if r ? field and (jsonb_typeof(r->field)!='number' or (r->>field)::numeric<0) then raise exception 'Targets and ARPU must be nonnegative numbers';end if;
  end loop;
  return new;
 end if;
 if not coalesce(r->>'segment','')=any(array['Postpaid Voice','Family','MBB','Fiber','5G TDD']) then raise exception 'Invalid segment';end if;
 if tg_table_name='tracker_rules' then
  if coalesce(jsonb_typeof(r->'rental'),'')!='number' or not (r->>'rental')::numeric>0 or coalesce(jsonb_typeof(r->'points'),'')!='number' or not (r->>'points')::numeric>=0 or not coalesce(r->>'effectiveFrom','') ~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid rule';end if;
  perform (r->>'effectiveFrom')::date;
  if tg_op='UPDATE' and (r-'archived') is distinct from (old.record-'archived') and exists(select 1 from public.tracker_sales where record->>'ruleId'=old.id) then raise exception 'Create a new version of a used rule';end if;
  if exists(select 1 from public.tracker_rules t where t.id<>new.id and t.id not in (with recursive ancestors as (select id,record from public.tracker_rules where id=r->>'prevId' union select p.id,p.record from public.tracker_rules p join ancestors a on p.id=a.record->>'prevId') select id from ancestors) and not coalesce((t.record->>'archived')::boolean,false) and not coalesce((r->>'archived')::boolean,false) and t.record->>'segment'=r->>'segment' and (t.record->>'rental')::numeric=(r->>'rental')::numeric and t.record->>'effectiveFrom'=r->>'effectiveFrom') then raise exception 'Duplicate active rule';end if;
  new.record:=r||jsonb_build_object('id',new.id);return new;
 end if;
 if tg_op='UPDATE' and new.agent_id<>old.agent_id then raise exception 'Sale ownership cannot change';end if;
 importing:=coalesce(current_setting('tracker.import',true),'')='true' and tracker_private.manager();
 if coalesce(jsonb_typeof(r->'orderNo'),'')!='string' or coalesce(jsonb_typeof(r->'msisdn'),'')!='string' or length(trim(coalesce(r->>'orderNo','')))=0 or (not importing and length(trim(coalesce(r->>'msisdn','')))=0) or not coalesce(r->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Order, subscriber and sale date are required';end if;
 perform (r->>'date')::date;
 if coalesce(r->>'saleType','') not in ('new','upgrade') then raise exception 'Invalid sale type';end if;
 if importing then
  if coalesce(jsonb_typeof(r->'points'),'')!='number' or not (r->>'points')::numeric>=0 then raise exception 'Invalid historical points';end if;
  if r->>'saleType'='new' and coalesce(jsonb_typeof(r->'rental'),'')!='number' then raise exception 'Invalid historical rental';end if;
  if r->>'saleType'='upgrade' and (coalesce(jsonb_typeof(r->'previousRental'),'')!='number' or coalesce(jsonb_typeof(r->'newRental'),'')!='number' or coalesce(jsonb_typeof(r->'arpuAtSale'),'')!='number') then raise exception 'Invalid historical upgrade';end if;
  new.record:=r||jsonb_build_object('id',new.id,'pointsAtSale',(r->>'points')::numeric);return new;
 end if;
 if tg_op='UPDATE' then
  unchanged:=new.agent_id=old.agent_id and (r->>'segment')=(old.record->>'segment') and (r->>'date')=(old.record->>'date') and (r->>'saleType')=(old.record->>'saleType') and
  case when r->>'saleType'='new' then (r->>'rental')::numeric=(old.record->>'rental')::numeric else (r->>'previousRental')::numeric=(old.record->>'previousRental')::numeric and (r->>'newRental')::numeric=(old.record->>'newRental')::numeric end;
  if unchanged then new.record:=old.record||jsonb_build_object('orderNo',r->>'orderNo','msisdn',r->>'msisdn');return new;end if;
 end if;
 if r->>'saleType'='new' then
  select * into ru from public.tracker_rules t where t.record->>'segment'=r->>'segment' and (t.record->>'rental')::numeric=(r->>'rental')::numeric and not coalesce((t.record->>'archived')::boolean,false) and (t.record->>'effectiveFrom')::date<=(r->>'date')::date order by t.record->>'effectiveFrom' desc,coalesce((t.record->>'createdAt')::numeric,0) desc,t.id desc limit 1;
  if not found then raise exception 'No rental rule applies on the sale date';end if;
  p:=(ru.record->>'points')::numeric;r:=(r-'previousRental'-'newRental'-'arpuAtSale')||jsonb_build_object('ruleId',ru.id,'ruleEffectiveFrom',ru.record->>'effectiveFrom');
 else
  field:=case r->>'segment' when 'Postpaid Voice' then 'postpaidArpu' when 'Family' then 'postpaidArpu' when 'MBB' then 'mbbArpu' when 'Fiber' then 'fiberArpu' else 'hbbArpu' end;
  select (record->>field)::numeric into ar from public.tracker_targets where agent_id=new.agent_id and month=left(r->>'date',7);
  if ar is null or ar<=0 then raise exception 'Set monthly ARPU for the sale month before adding an upgrade';end if;
  if coalesce(jsonb_typeof(r->'previousRental'),'')!='number' or coalesce(jsonb_typeof(r->'newRental'),'')!='number' or not (r->>'previousRental')::numeric>=0 or not (r->>'newRental')::numeric>(r->>'previousRental')::numeric then raise exception 'New rental must exceed previous rental';end if;
  p:=((r->>'newRental')::numeric-(r->>'previousRental')::numeric)/ar;
  r:=(r-'rental'-'ruleId'-'ruleEffectiveFrom')||jsonb_build_object('arpuAtSale',ar);
 end if;
 new.record:=r||jsonb_build_object('id',new.id,'points',p,'pointsAtSale',p);return new;
end;$$;
revoke all on function tracker_private.validate_record() from public;
create trigger tracker_validate_sale before insert or update on public.tracker_sales for each row execute function tracker_private.validate_record();
create trigger tracker_validate_rule before insert or update on public.tracker_rules for each row execute function tracker_private.validate_record();
create trigger tracker_validate_target before insert or update on public.tracker_targets for each row execute function tracker_private.validate_record();
create function tracker_private.keep_rule() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if exists(select 1 from public.tracker_sales where record->>'ruleId'=old.id) then raise exception 'Archive rules used by historical sales';end if;return old;end;$$;
revoke all on function tracker_private.keep_rule() from public;
create trigger tracker_keep_rule before delete on public.tracker_rules for each row execute function tracker_private.keep_rule();

create function public.tracker_save(changes jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb; a uuid; r jsonb; key text;
begin
 if not tracker_private.ready() then raise exception 'Account is not ready';end if;
 if jsonb_array_length(changes)>2000 then raise exception 'Too many changes';end if;
 for c in select * from jsonb_array_elements(changes) loop
  a:=(c->>'agent_id')::uuid;r:=c->'record';key:=c->>'id';
  case c->>'table'
   when 'sales' then
    if c->>'op'='delete' then delete from public.tracker_sales where id=key and agent_id=a;
    else insert into public.tracker_sales(id,agent_id,record) values(key,a,r) on conflict(id) do update set record=excluded.record where tracker_sales.agent_id=excluded.agent_id;end if;
   when 'targets' then
    if c->>'op'='delete' then delete from public.tracker_targets where agent_id=a and month=key;
    else insert into public.tracker_targets values(a,key,r) on conflict(agent_id,month) do update set record=excluded.record;end if;
   when 'rules' then
    if c->>'op'='delete' then delete from public.tracker_rules where id=key;
    else insert into public.tracker_rules values(key,r) on conflict(id) do update set record=excluded.record;end if;
   else raise exception 'Unknown record type';
  end case;
 end loop;
end;$$;
revoke all on function public.tracker_save(jsonb) from public,anon;
grant execute on function public.tracker_save(jsonb) to authenticated;

create function public.tracker_import(agent uuid,backup jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r jsonb; m record; k text;
begin
 if not tracker_private.manager() then raise exception 'Manager access required';end if;
 if not exists(select 1 from public.tracker_profiles where id=agent) then raise exception 'Account not found';end if;
 if jsonb_typeof(backup->'sales')!='array' or jsonb_typeof(backup->'targets')!='object' then raise exception 'Invalid backup';end if;
 perform set_config('tracker.import','true',true);
 delete from public.tracker_sales where agent_id=agent;
 delete from public.tracker_targets where agent_id=agent;
 for m in select * from jsonb_each(backup->'targets') loop
  r:=m.value;if r ? 'tddArpu' and not r ? 'hbbArpu' then r:=r||jsonb_build_object('hbbArpu',r->'tddArpu');end if;
  insert into public.tracker_targets values(agent,m.key,r-'tddArpu');
 end loop;
 for r in select * from jsonb_array_elements(backup->'sales') loop
  k:=gen_random_uuid()::text;r:=jsonb_build_object('saleType','new','createdAt',0,'msisdn','')||r;
  if r->>'segment'='HBB' then r:=r||jsonb_build_object('segment','5G TDD');end if;
  if r ? 'arpuUsed' and not r ? 'arpuAtSale' then r:=r||jsonb_build_object('arpuAtSale',r->'arpuUsed');end if;
  insert into public.tracker_sales values(k,agent,r-'arpuUsed');
 end loop;
 -- Keep existing team rules; historical imported rule references and points stay in each sale snapshot.
 perform set_config('tracker.import','false',true);
end;$$;
revoke all on function public.tracker_import(uuid,jsonb) from public,anon;
grant execute on function public.tracker_import(uuid,jsonb) to authenticated;
commit;
