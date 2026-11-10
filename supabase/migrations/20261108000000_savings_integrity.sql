-- All write paths (snapshots and legacy transaction RPCs included) run this
-- validation under the existing authenticated-user RLS and revision lock.
create or replace function public.greuro_effective_cents(p_record jsonb)
returns numeric language sql immutable set search_path = public as $$
  select round(greatest(0, coalesce((p_record->>'amount')::numeric, 0) -
    case when p_record->>'type' = 'expense' and coalesce(p_record->>'reimbursable', '0') in ('1','true') and coalesce(p_record->>'resolved', '0') in ('1','true')
      then greatest(0, coalesce((p_record->>'owedAmount')::numeric, 0)) else 0 end) * 100);
$$;

create or replace function public.greuro_validate_savings_snapshot()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  budget jsonb := new.data->'data';
  item jsonb;
  account jsonb;
  purchase jsonb;
  entry jsonb;
  tbl text;
  pooled numeric := 0;
  earmarked numeric := 0;
  amount numeric;
  refunded numeric;
  restored numeric;
  pending boolean;
begin
  -- Legacy snapshots remain readable/restorable before their one-time review.
  if not exists (select 1 from jsonb_array_elements(coalesce(budget->'goals','[]')) g where g->>'modelVersion' = '2')
    and not exists (select 1 from jsonb_array_elements(coalesce(budget->'transactions','[]')) t where t->>'goalId' is not null or t->>'refundOfTransactionId' is not null)
    and not exists (select 1 from jsonb_array_elements(coalesce(budget->'trips','[]')) t where t->>'goalId' is not null) then return new; end if;
  if new.data->>'format' <> 'budget-app-backup' or new.data->>'version' <> '1' then raise exception 'Unsupported budget format'; end if;
  foreach tbl in array array['accounts','categories','transactions','scheduled','settings'] loop
    if jsonb_typeof(budget->tbl) is distinct from 'array' then raise exception 'Missing budget table %', tbl; end if;
  end loop;
  foreach tbl in array array['accounts','categories','transactions','scheduled','goals','trips'] loop
    if exists (select 1 from jsonb_array_elements(coalesce(budget->tbl, '[]')) r group by r->>'id' having count(*) > 1) then raise exception 'Duplicate IDs in %', tbl; end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(budget->'goals', '[]')) loop
    if item->>'modelVersion' = '2' then
      if jsonb_typeof(item->'earmarked') is distinct from 'number' or (item->>'earmarked')::numeric < 0 then raise exception 'Invalid goal reservation'; end if;
      if coalesce(item->>'archived','0') in ('1','true') and (item->>'earmarked')::numeric <> 0 then raise exception 'Archived goals cannot reserve money'; end if;
      if coalesce(item->>'archived','0') not in ('1','true') then earmarked := earmarked + round((item->>'earmarked')::numeric * 100); end if;
    end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(budget->'trips', '[]')) loop
    if item->>'goalId' is not null and not exists (select 1 from jsonb_array_elements(coalesce(budget->'goals','[]')) g where g->'id' = item->'goalId') then raise exception 'Trip goal does not exist'; end if;
  end loop;
  for item in select * from jsonb_array_elements(budget->'transactions') loop
    if item->>'goalId' is not null then
      if not exists (select 1 from jsonb_array_elements(coalesce(budget->'goals','[]')) g where g->'id' = item->'goalId' and g->>'modelVersion' = '2') then raise exception 'Transaction goal must reference a reviewed goal'; end if;
      if item->>'type' not in ('expense','income') or (item->>'type' = 'income' and item->>'refundOfTransactionId' is null) then raise exception 'Invalid goal transaction'; end if;
      if coalesce((item->>'fundedAmount')::numeric,0) < 0 or round(coalesce((item->>'fundedAmount')::numeric,0)*100) > public.greuro_effective_cents(item) then raise exception 'Invalid goal funding amount'; end if;
    end if;
    if item->>'refundOfTransactionId' is not null then
      select r into purchase from jsonb_array_elements(budget->'transactions') r where r->'id' = item->'refundOfTransactionId';
      if purchase is null or purchase->>'type' <> 'expense' or item->>'type' <> 'income' or purchase->>'goalId' is null or purchase->'goalId' is distinct from item->'goalId' then raise exception 'Invalid purchase refund reference'; end if;
      if coalesce((item->>'fundingRestored')::numeric,0) < 0 or coalesce((item->>'fundingRestored')::numeric,0) > (item->>'amount')::numeric then raise exception 'Invalid restored funding'; end if;
    end if;
    if item->>'type' = 'expense' then
      select coalesce(sum(round((r->>'amount')::numeric*100)),0), coalesce(sum(round(coalesce((r->>'fundingRestored')::numeric,0)*100)),0)
        into refunded, restored from jsonb_array_elements(budget->'transactions') r where r->'refundOfTransactionId' = item->'id';
      if refunded > public.greuro_effective_cents(item) or restored > round(coalesce((item->>'fundedAmount')::numeric,0)*100) then raise exception 'Refund exceeds purchase or original funding'; end if;
    end if;
    if item->>'type' = 'transfer' then
      if not exists (select 1 from jsonb_array_elements(budget->'accounts') a where a->'id' = item->'fromAccountId')
        or not exists (select 1 from jsonb_array_elements(budget->'accounts') a where a->'id' = item->'toAccountId') then raise exception 'Transfer account does not exist'; end if;
    elsif not exists (select 1 from jsonb_array_elements(budget->'accounts') a where a->'id' = item->'accountId') then raise exception 'Transaction account does not exist'; end if;
    if item->>'categoryId' is not null and not exists (select 1 from jsonb_array_elements(budget->'categories') c where c->'id' = item->'categoryId' and c->>'kind' = item->>'type') then raise exception 'Category must match transaction type'; end if;
    if item->>'tripId' is not null and not exists (select 1 from jsonb_array_elements(coalesce(budget->'trips','[]')) t where t->'id' = item->'tripId') then raise exception 'Transaction trip does not exist'; end if;
    if item->>'goalId' is not null and (coalesce(item->>'isAdjustment','0') in ('1','true') or exists (select 1 from jsonb_array_elements(budget->'categories') c where c->'id' = item->'categoryId' and coalesce(c->>'excludeFromStats','false') in ('true','1'))) then raise exception 'Balance-only transactions cannot fund goals'; end if;
  end loop;
  for account in select * from jsonb_array_elements(budget->'accounts') loop
    if coalesce(account->>'type','asset') = 'liability' or coalesce(account->>'usage','active') = 'investment' then continue; end if;
    pooled := pooled + round(coalesce((account->>'startingBalance')::numeric,0)*100);
    for entry in select * from jsonb_array_elements(budget->'transactions') loop
      amount := public.greuro_effective_cents(entry);
      if entry->>'type' = 'expense' and entry->'accountId' = account->'id' then pooled := pooled - amount;
      elsif entry->>'type' = 'income' and entry->'accountId' = account->'id' then pooled := pooled + amount;
      elsif entry->>'type' = 'transfer' then
        if entry->'fromAccountId' = account->'id' then pooled := pooled - amount; end if;
        if entry->'toAccountId' = account->'id' then pooled := pooled + amount; end if;
      end if;
    end loop;
  end loop;
  -- Scheduled posting and explicit restore retain truthful financial records,
  -- mark the shortfall, and require the app's release-resolution interaction.
  pending := exists (select 1 from jsonb_array_elements(budget->'settings') s where s->>'key' = 'savingsResolutionRequired' and s->'value' = 'true');
  if earmarked > 0 and pooled < earmarked and not pending then raise exception 'Release reserved money before saving this change'; end if;
  return new;
end;
$$;

drop trigger if exists greuro_savings_integrity on public.budget_backups;
create trigger greuro_savings_integrity before insert or update of data on public.budget_backups
for each row execute function public.greuro_validate_savings_snapshot();
revoke all on function public.greuro_validate_savings_snapshot() from public;
grant execute on function public.greuro_validate_savings_snapshot() to authenticated;
revoke all on function public.greuro_effective_cents(jsonb) from public;
grant execute on function public.greuro_effective_cents(jsonb) to authenticated;
