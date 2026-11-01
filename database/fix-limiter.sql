-- Safe replacement: no user records are changed.
create or replace function public.tracker_attempt(bucket text,max_attempts integer default 8)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into tracker_private.attempts values(bucket,now(),1)
 on conflict on constraint attempts_pkey do update set
 attempts=case when attempts.started_at < now()-interval '15 minutes' then 1 else attempts.attempts+1 end,
 started_at=case when attempts.started_at < now()-interval '15 minutes' then now() else attempts.started_at end
 returning attempts into n;
 return n<=max_attempts;
end;$$;
