-- TEST-ONLY synthetic data (no real person). Dates are relative to "today" in Tunis.
with d as (select (now() at time zone 'Africa/Tunis')::date as t)
insert into bookings (barber, service, price, duration_min, date, start_time, client_name, phone, note, status, ref)
select * from (values
  ('achref','Hjema',8,30,(select t+2 from d),'10:00'::time,'Synthetic Client A','21620000001','', 'confirmed','3B-SYNA01'),
  ('achref','Pack 2 Basic',10,45,(select t+2 from d),'11:00','Synthetic Client B','21620000002','note test','confirmed','3B-SYNA02'),
  ('3ebchi','Pack 3 Complet',15,60,(select t+2 from d),'14:00','Synthetic Client C','21620000003','', 'confirmed','3B-SYNA03'),
  ('brag','Lahya',5,15,(select t+3 from d),'16:00','Synthetic Client D','21620000004','', 'confirmed','3B-SYNA04'),
  ('imed','Brushing',6,15,(select t+3 from d),'12:30','Synthetic Client E','21620000005','', 'done','3B-SYNA05'),
  ('imed','Hjema',8,30,(select t+3 from d),'13:00','Synthetic Client F','21620000006','', 'cancelled','3B-SYNA06'),
  ('achref','Hjema',8,30,(select t-5 from d),'10:00','Synthetic Past G','21620000007','', 'done','3B-SYNA07'),
  ('brag','Hjema',8,30,(select t+4 from d),'10:00','X','21620000008','legacy row violating the new name-length check','confirmed','3B-SYNA08')
) v;
insert into blocked_slots (barber, date, start_time, end_time, reason)
select 'achref', (now() at time zone 'Africa/Tunis')::date + 2, '15:00', '17:00', 'synthetic pause';
