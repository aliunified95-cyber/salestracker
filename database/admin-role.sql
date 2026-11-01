begin;
alter table public.tracker_profiles drop constraint tracker_profiles_role_check;
alter table public.tracker_profiles add constraint tracker_profiles_role_check check(role in ('manager','admin','agent'));
create function tracker_private.rules_editor() returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.tracker_profiles where id=auth.uid() and active and not must_change_pin and role in ('manager','admin')); $$;
revoke all on function tracker_private.rules_editor() from public;
grant execute on function tracker_private.rules_editor() to authenticated;
create function tracker_private.rule_used(rule_id text) returns boolean language sql stable security definer set search_path='' as $$ select tracker_private.rules_editor() and exists(select 1 from public.tracker_sales where record->>'ruleId'=rule_id); $$;
revoke all on function tracker_private.rule_used(text) from public;
grant execute on function tracker_private.rule_used(text) to authenticated;
drop policy rules_write on public.tracker_rules;
create policy rules_write on public.tracker_rules for all to authenticated using((select tracker_private.rules_editor())) with check((select tracker_private.rules_editor()));
create or replace function tracker_private.validate_record() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if tg_op='UPDATE' and (r-'archived') is distinct from (old.record-'archived') and tracker_private.rule_used(old.id) then raise exception 'Create a new version of a used rule';end if;
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
create or replace function tracker_private.keep_rule() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tracker_private.rule_used(old.id) then raise exception 'Archive rules used by historical sales';end if;return old;end;$$;
create or replace function tracker_private.validate_team_target() returns trigger language plpgsql security invoker set search_path='' as $$
declare field text; combined numeric;
begin
 if not tracker_private.manager() then raise exception 'Manager access required';end if;
 if not exists(select 1 from public.tracker_profiles p where p.id=new.owner_id and p.username='AM791' and p.role='manager') then raise exception 'AM791 owns the team target';end if;
 if coalesce(new.record->>'mode','') not in ('sum','manual') then raise exception 'Choose combined or custom team targets';end if;
 if new.record->>'mode'='manual' then
  foreach field in array array['postpaid','broadband'] loop
   if coalesce(jsonb_typeof(new.record->field),'')!='number' or (new.record->>field)::numeric<0 then raise exception 'Enter nonnegative team targets';end if;
   select coalesce(sum((t.record->>field)::numeric),0) into combined from public.tracker_targets t join public.tracker_profiles p on p.id=t.agent_id where t.month=new.month and p.role in ('agent','admin');
   if (new.record->>field)::numeric>combined then raise exception 'Custom team targets cannot exceed combined agent targets';end if;
  end loop;
 end if;
 new.updated_at:=now();return new;
end;$$;
commit;
