-- Run against local Supabase after migrations: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.budget_backups(user_id, data) values
('00000000-0000-0000-0000-000000000001', '{
  "format":"budget-app-backup","version":1,"exportedAt":"unchanged",
  "data":{
    "accounts":[{"id":1,"name":"Bank"},{"id":2,"name":"Savings"}],
    "categories":[{"id":1,"kind":"expense"},{"id":2,"kind":"income"}],
    "transactions":[{"id":8,"date":1000,"type":"expense","amount":10,"accountId":1,"categoryId":1,"description":"Original","createdAt":500,"updatedAt":500,"custom":"preserve"}],
    "trips":[{"id":1}],"settings":[{"key":"theme","value":"dark"}],"goals":[],"scheduled":[]
  }
}'),
('00000000-0000-0000-0000-000000000002', '{"data":{"transactions":[{"id":999}],"accounts":[],"categories":[]}}');

create temporary table original as select * from public.budget_backups;
grant select on original to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

create function pg_temp.rejected(action text, input jsonb, pattern text)
returns boolean language plpgsql as $$
declare before_row jsonb;
begin
  select to_jsonb(b) into before_row from public.budget_backups b;
  begin
    perform public.greuro_transactions(action, input);
    return false;
  exception when others then
    return sqlerrm like pattern and before_row = (select to_jsonb(b) from public.budget_backups b);
  end;
end;
$$;

select is(public.greuro_transactions('accounts'), (select data->'data'->'accounts' from original where user_id = auth.uid()), 'Small account read');
select is(public.greuro_transactions('categories'), (select data->'data'->'categories' from original where user_id = auth.uid()), 'Small category read');
select is(jsonb_array_length(public.greuro_transactions('get')), 1, 'Read is scoped to current user');
select ok(pg_temp.rejected('add', '{"transactions":[{"date":2000,"type":"expense","amount":2,"description":"valid","accountId":1,"categoryId":1},{"date":2000,"type":"expense","amount":2,"description":"bad","accountId":99,"categoryId":1}]}', '%existing account%'), 'Invalid second entry rolls back the whole batch and revision');
select ok(pg_temp.rejected('add', '{"transactions":[{"date":2000,"type":"expense","amount":2,"description":"bad","accountId":1,"categoryId":2}]}', '%matching the transaction type%'), 'Reject mismatched category kind');
select ok(pg_temp.rejected('add', '{"transactions":[{"date":2000,"type":"expense","amount":2,"description":"bad","accountId":1,"categoryId":99}]}', '%existing category%'), 'Reject nonexistent category');
select ok(pg_temp.rejected('add', '{"transactions":[]}', '%nonempty array%'), 'Reject empty batch');
select ok(pg_temp.rejected('add', '{"transactions":[{"id":100}]}', '%server-managed%'), 'Reject client IDs');
select ok(pg_temp.rejected('add', '{"transactions":[{"date":2000,"type":"transfer","amount":2,"description":"bad","fromAccountId":1,"toAccountId":99}]}', '%existing account%'), 'Reject missing transfer endpoint');
select ok(pg_temp.rejected('add', '{"transactions":[{"date":2000,"type":"transfer","amount":2,"description":"bad","fromAccountId":1,"toAccountId":1}]}', '%must be different%'), 'Reject transfer to same account');

create temporary table added as select public.greuro_transactions('add', '{"transactions":[
 {"date":2000,"type":"expense","amount":5,"description":"Lunch","accountId":1,"categoryId":1,"tripId":1,"reimbursable":true,"owedAmount":2,"paidBackNote":"split"},
 {"date":2000,"type":"income","amount":20,"description":"Pay","accountId":2,"categoryId":2},
 {"date":3000,"type":"transfer","amount":3,"description":"Move","fromAccountId":1,"toAccountId":2}
]}') records;
select is((select records->0->>'id' from added), '9', 'First ID is max + 1');
select is((select records->2->>'id' from added), '11', 'Batch IDs are sequential');
select ok((select records->0->'createdAt' = records->0->'updatedAt'
  and jsonb_typeof(records->0->'createdAt') = 'number'
  and (records->0->>'createdAt')::bigint > 1000000000000 from added), 'Server sets millisecond timestamps');
select is((select records->0->'reimbursable' from added), '1'::jsonb, 'Boolean flags retain numeric storage format');
select is((select records->0->'tripId' from added), '1'::jsonb, 'Optional fields retained');
select is((select data->'data'->'transactions'->0 from public.budget_backups),
  (select data->'data'->'transactions'->0 from original where user_id = auth.uid()), 'Adding records preserves existing transactions verbatim');
select is(public.greuro_transactions('get', '{"dateFrom":2000,"dateTo":2000,"accountId":2,"categoryId":2,"type":"income","limit":1}')->0->>'id', '10', 'Combined filters with inclusive dates');
select is(public.greuro_transactions('get', '{"accountId":2,"limit":1}')->0->>'id', '11', 'Account filter matches transfer destination, newest first');
select is(public.greuro_transactions('get', '{"dateTo":2000,"limit":1}')->0->>'id', '10', 'Same-date results ordered by descending ID');
select is(public.greuro_transactions('get', '{"dateFrom":999999}'), '[]'::jsonb, 'No matching records returns an empty array');
select ok(pg_temp.rejected('update', '{"id":9,"fields":{"type":"income"}}', '%matching the transaction type%'), 'Validate merged updates, rollback invalid type change');
select ok(pg_temp.rejected('update', '{"id":999,"fields":{"description":"missing"}}', '%does not exist%'), 'Missing update is an error');
select ok(pg_temp.rejected('update', '{"id":9,"fields":{"createdAt":123}}', '%server-managed%'), 'Updates cannot change createdAt');
select ok(pg_temp.rejected('delete', '{"id":999}', '%does not exist%'), 'Missing delete is an error');
select is(public.greuro_transactions('update', '{"id":8,"fields":{"description":"Edited"}}') - 'description' - 'updatedAt',
  (select data->'data'->'transactions'->0 - 'description' - 'updatedAt' from original where user_id = auth.uid()), 'Patch preserves createdAt and unknown stored fields');
select is(public.greuro_transactions('delete', '{"id":10}'), '{"deleted":true,"id":10}'::jsonb, 'Delete returns requested ID');
select is((select data #- '{data,transactions}' from public.budget_backups),
  (select data #- '{data,transactions}' from original where user_id = auth.uid()), 'All non-transaction data and snapshot metadata preserved');
select ok((select updated_at > (select updated_at from original where user_id = auth.uid()) from public.budget_backups), 'Revision advances for optimistic full-snapshot writes');
reset role;
select is((select to_jsonb(b) from public.budget_backups b where user_id = '00000000-0000-0000-0000-000000000002'),
  (select to_jsonb(b) from original b where user_id = '00000000-0000-0000-0000-000000000002'), 'Other user budget and revision unchanged');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.greuro_transactions('get')$$, 'P0001', 'Sign in is required', 'Anonymous calls rejected');

select * from finish();
rollback;
