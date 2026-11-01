begin;
alter table public.tracker_sales add column if not exists created_by uuid references public.tracker_profiles(id) on delete set null;
create or replace function tracker_private.sale_creator() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid(); else new.created_by:=old.created_by; end if;
 return new;
end;$$;
revoke all on function tracker_private.sale_creator() from public;
drop trigger if exists tracker_sale_creator on public.tracker_sales;
create trigger tracker_sale_creator before insert or update on public.tracker_sales for each row execute function tracker_private.sale_creator();
commit;

