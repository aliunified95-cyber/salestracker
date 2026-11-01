-- Original Target 11.html rental rules. No personal sales data.
begin;
insert into public.tracker_rules(id,record) values
('seed-1','{"id":"seed-1","segment":"Postpaid Voice","rental":11,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-2','{"id":"seed-2","segment":"Postpaid Voice","rental":15,"points":1.5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-3','{"id":"seed-3","segment":"Postpaid Voice","rental":22,"points":2,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-4','{"id":"seed-4","segment":"Postpaid Voice","rental":9.5,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-5','{"id":"seed-5","segment":"Postpaid Voice","rental":10.5,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-6','{"id":"seed-6","segment":"Postpaid Voice","rental":12.5,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-7','{"id":"seed-7","segment":"Family","rental":33,"points":3,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-8','{"id":"seed-8","segment":"Family","rental":66,"points":5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-9','{"id":"seed-9","segment":"Family","rental":77,"points":5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-10','{"id":"seed-10","segment":"MBB","rental":11,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-11','{"id":"seed-11","segment":"MBB","rental":22,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-12','{"id":"seed-12","segment":"MBB","rental":13.2,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-13','{"id":"seed-13","segment":"MBB","rental":16.5,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-14','{"id":"seed-14","segment":"Fiber","rental":16.463,"points":0.75,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-15','{"id":"seed-15","segment":"Fiber","rental":18.963,"points":0.5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-16','{"id":"seed-16","segment":"Fiber","rental":26.463,"points":0.5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-17','{"id":"seed-17","segment":"Fiber","rental":45.463,"points":0.5,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-18','{"id":"seed-18","segment":"Fiber","rental":100.463,"points":0,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-19','{"id":"seed-19","segment":"Fiber","rental":20.613,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-20','{"id":"seed-20","segment":"5G TDD","rental":11,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-21','{"id":"seed-21","segment":"5G TDD","rental":22,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb),
('seed-22','{"id":"seed-22","segment":"5G TDD","rental":17.5,"points":1,"effectiveFrom":"2000-01-01","version":1,"createdAt":0}'::jsonb)
on conflict(id) do nothing;
commit;
