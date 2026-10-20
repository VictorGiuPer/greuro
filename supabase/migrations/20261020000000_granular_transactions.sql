-- Keep the version-1 JSON snapshot. Serialize granular writes on the same row
-- used by save_budget_backup, so its optimistic concurrency check still works.
create or replace function public.greuro_validate_transaction(p_record jsonb, p_budget jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  field text;
begin
  if jsonb_typeof(p_record) is distinct from 'object' then
    raise exception 'Transaction must be an object';
  end if;
  if p_record->>'type' is null or p_record->>'type' not in ('income', 'expense', 'transfer') then
    raise exception 'Invalid transaction type';
  end if;
  if jsonb_typeof(p_record->'amount') is distinct from 'number' or (p_record->>'amount')::numeric <= 0 then
    raise exception 'Amount must be a positive number';
  end if;
  if jsonb_typeof(p_record->'date') is distinct from 'number' then
    raise exception 'Date must be a Unix timestamp in milliseconds';
  end if;
  if (p_record->>'date')::numeric not between 0 and 8640000000000000
      or trunc((p_record->>'date')::numeric) <> (p_record->>'date')::numeric then
    raise exception 'Invalid date timestamp';
  end if;
  if jsonb_typeof(p_record->'description') is distinct from 'string' then
    raise exception 'Description must be a string';
  end if;
  foreach field in array array['accountId', 'categoryId', 'fromAccountId', 'toAccountId', 'tripId'] loop
    if p_record ? field and p_record->field <> 'null'::jsonb then
      if jsonb_typeof(p_record->field) <> 'number' then
        raise exception '% must be a positive integer ID', field;
      end if;
      if (p_record->>field)::numeric not between 1 and 9007199254740991
          or trunc((p_record->>field)::numeric) <> (p_record->>field)::numeric then
        raise exception '% must be a positive integer ID', field;
      end if;
    end if;
  end loop;
  if p_record->>'type' = 'transfer' then
    foreach field in array array['fromAccountId', 'toAccountId'] loop
      if not exists (select 1 from jsonb_array_elements(p_budget->'data'->'accounts') a
          where a->'id' = p_record->field) then
        raise exception '% must reference an existing account', field;
      end if;
    end loop;
    if p_record->'fromAccountId' = p_record->'toAccountId' then
      raise exception 'Transfer accounts must be different';
    end if;
  else
    if not exists (select 1 from jsonb_array_elements(p_budget->'data'->'accounts') a
        where a->'id' = p_record->'accountId') then
      raise exception 'accountId must reference an existing account';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_budget->'data'->'categories') c
        where c->'id' = p_record->'categoryId' and c->>'kind' = p_record->>'type') then
      raise exception 'categoryId must reference an existing category matching the transaction type';
    end if;
  end if;
  if p_record->'tripId' is not null and p_record->'tripId' <> 'null'::jsonb
      and not exists (select 1 from jsonb_array_elements(coalesce(p_budget->'data'->'trips', '[]')) t
        where t->'id' = p_record->'tripId') then
    raise exception 'tripId must reference an existing trip';
  end if;
  foreach field in array array['reimbursable', 'resolved', 'isAdjustment'] loop
    if p_record ? field and p_record->field not in ('0'::jsonb, '1'::jsonb) then
      raise exception '% must be a boolean or 0/1', field;
    end if;
  end loop;
  if p_record ? 'owedAmount' then
    if jsonb_typeof(p_record->'owedAmount') <> 'number' or (p_record->>'owedAmount')::numeric < 0 then
      raise exception 'owedAmount must be a nonnegative number';
    end if;
  end if;
  if p_record ? 'paidBackNote' and p_record->'paidBackNote' <> 'null'::jsonb
      and jsonb_typeof(p_record->'paidBackNote') <> 'string' then
    raise exception 'paidBackNote must be a string or null';
  end if;
end;
$$;

create or replace function public.greuro_transactions(p_action text, p_input jsonb default '{}')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  budget jsonb;
  rows jsonb;
  result jsonb := '[]';
  record jsonb;
  patch jsonb;
  field text;
  position integer;
  next_id bigint;
  saved_at timestamptz;
  previous_saved_at timestamptz;
  now_ms bigint;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if p_action is null or p_action not in ('add', 'update', 'delete', 'get', 'accounts', 'categories') then
    raise exception 'Unknown transaction operation';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Input must be an object'; end if;

  if p_action in ('add', 'update', 'delete') then
    select data, updated_at into budget, previous_saved_at
      from public.budget_backups where user_id = auth.uid() for update;
  else
    select data into budget from public.budget_backups where user_id = auth.uid();
  end if;
  if budget is null then raise exception 'This account does not have a Greuro budget yet'; end if;
  now_ms := floor(extract(epoch from clock_timestamp()) * 1000);
  rows := budget->'data'->'transactions';
  if jsonb_typeof(rows) is distinct from 'array' then raise exception 'Budget has no transaction array'; end if;

  if p_action in ('accounts', 'categories') then
    return budget->'data'->p_action;
  elsif p_action = 'get' then
    if p_input ? 'dateFrom' and p_input ? 'dateTo'
        and (p_input->>'dateFrom')::numeric > (p_input->>'dateTo')::numeric then
      raise exception 'dateFrom must not exceed dateTo';
    end if;
    select coalesce(jsonb_agg(t order by (t->>'date')::numeric desc, (t->>'id')::bigint desc), '[]') into result
    from (
      select t from jsonb_array_elements(rows) t
      where (not (p_input ? 'dateFrom') or (t->>'date')::numeric >= (p_input->>'dateFrom')::numeric)
        and (not (p_input ? 'dateTo') or (t->>'date')::numeric <= (p_input->>'dateTo')::numeric)
        and (not (p_input ? 'accountId') or p_input->'accountId' in (t->'accountId', t->'fromAccountId', t->'toAccountId'))
        and (not (p_input ? 'categoryId') or t->'categoryId' = p_input->'categoryId')
        and (not (p_input ? 'type') or t->'type' = p_input->'type')
      order by (t->>'date')::numeric desc, (t->>'id')::bigint desc
      limit (p_input->>'limit')::integer
    ) matched;
    return result;
  elsif p_action = 'add' then
    if jsonb_typeof(p_input->'transactions') is distinct from 'array' then
      raise exception 'transactions must be a nonempty array';
    end if;
    if jsonb_array_length(p_input->'transactions') = 0 then raise exception 'transactions must be a nonempty array'; end if;
    select coalesce(max((t->>'id')::bigint), 0) + 1 into next_id from jsonb_array_elements(rows) t;
  else
    if jsonb_typeof(p_input->'id') is distinct from 'number' then raise exception 'ID must be a positive integer'; end if;
    if (p_input->>'id')::numeric not between 1 and 9007199254740991
        or trunc((p_input->>'id')::numeric) <> (p_input->>'id')::numeric then
      raise exception 'ID must be a positive integer';
    end if;
    select (ordinality - 1)::integer, t into position, record
      from jsonb_array_elements(rows) with ordinality as entries(t, ordinality)
      where t->'id' = p_input->'id';
    if position is null then raise exception 'Transaction % does not exist', p_input->>'id'; end if;
    if p_action = 'delete' then
      rows := rows - position;
      result := jsonb_build_object('deleted', true, 'id', p_input->'id');
    elsif jsonb_typeof(p_input->'fields') is distinct from 'object' or p_input->'fields' = '{}'::jsonb then
      raise exception 'fields must be a nonempty object';
    end if;
  end if;

  if p_action in ('add', 'update') then
    for patch in select value from jsonb_array_elements(
      case when p_action = 'add' then p_input->'transactions' else jsonb_build_array(p_input->'fields') end
    ) loop
      if jsonb_typeof(patch) is distinct from 'object' then raise exception 'Transaction must be an object'; end if;
      for field in select jsonb_object_keys(patch) loop
        if field not in ('date', 'type', 'amount', 'accountId', 'categoryId', 'description',
          'tripId', 'reimbursable', 'owedAmount', 'paidBackNote', 'fromAccountId', 'toAccountId', 'resolved', 'isAdjustment') then
          raise exception 'Unknown or server-managed transaction field: %', field;
        end if;
      end loop;
      -- The app stores these flags as numeric 0/1, not JSON booleans.
      foreach field in array array['reimbursable', 'resolved', 'isAdjustment'] loop
        if jsonb_typeof(patch->field) = 'boolean' then
          patch := jsonb_set(patch, array[field], case when (patch->>field)::boolean then '1'::jsonb else '0'::jsonb end);
        end if;
      end loop;
      if p_action = 'add' then
        if next_id > 9007199254740991 then raise exception 'Transaction ID range exhausted'; end if;
        record := '{"accountId":null,"categoryId":null,"fromAccountId":null,"toAccountId":null,"tripId":null,"reimbursable":0,"owedAmount":0,"paidBackNote":null,"resolved":0,"isAdjustment":0}'::jsonb
          || patch || jsonb_build_object('id', next_id, 'createdAt', now_ms, 'updatedAt', now_ms);
        next_id := next_id + 1;
      else
        record := record || patch || jsonb_build_object('updatedAt', now_ms);
      end if;
      perform public.greuro_validate_transaction(record, budget);
      if p_action = 'add' then
        rows := rows || jsonb_build_array(record);
        result := result || jsonb_build_array(record);
      else
        rows := jsonb_set(rows, array[position::text], record);
        result := record;
      end if;
    end loop;
  end if;

  -- No other records or snapshot metadata are rewritten. Advance the revision
  -- even within one SQL transaction so stale full-snapshot saves are rejected.
  saved_at := greatest(clock_timestamp(), previous_saved_at + interval '1 microsecond');
  update public.budget_backups
    set data = jsonb_set(budget, '{data,transactions}', rows), updated_at = saved_at
    where user_id = auth.uid();
  return result;
end;
$$;

revoke all on function public.greuro_validate_transaction(jsonb, jsonb) from public;
revoke all on function public.greuro_transactions(text, jsonb) from public;
grant execute on function public.greuro_validate_transaction(jsonb, jsonb) to authenticated;
grant execute on function public.greuro_transactions(text, jsonb) to authenticated;
