-- Server-side lifecycle operations for the rebuilt finance core.
begin;

drop policy if exists "expense_payments_select_accessible" on public.expense_payments;
create policy "expense_payments_select_accessible" on public.expense_payments
for select to authenticated using (public.can_access_expense(expense_id));

create or replace function public.delete_finance_expense_v3(p_expense_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.expenses;
begin
  if actor is null then raise exception 'Sign in to delete an expense.'; end if;
  if p_expense_id is null then raise exception 'Expense ID is required.'; end if;
  select * into target from public.expenses where id = p_expense_id for update;
  if not found then return false; end if;
  if target.group_id is null then
    if target.created_by <> actor then raise exception 'This expense cannot be deleted by this account.'; end if;
  elsif not public.is_group_member(target.group_id, actor) then
    raise exception 'This expense cannot be deleted by this account.';
  end if;
  delete from public.expenses where id = p_expense_id;
  return true;
end;
$$;

create or replace function public.remove_group_member_v3(p_group_id uuid, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  creator uuid;
begin
  if actor is null then raise exception 'Sign in to manage group members.'; end if;
  if p_group_id is null or p_user_id is null then raise exception 'Choose a group and member.'; end if;
  select created_by into creator from public.groups where id = p_group_id for update;
  if not found then raise exception 'Group not found.'; end if;
  if creator <> actor then raise exception 'Only the group creator can remove members.'; end if;
  if creator = p_user_id then raise exception 'The group creator cannot be removed.'; end if;
  if not public.is_group_member(p_group_id, p_user_id) then return false; end if;
  if exists (
    select 1 from public.expenses e
    where e.group_id = p_group_id and (
      e.paid_by = p_user_id or exists (
        select 1 from public.expense_splits s
        where s.expense_id = e.id and s.user_id = p_user_id
      )
    )
  ) then raise exception 'A member with expense history cannot be removed.'; end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.set_expense_split_settled_v3(
  p_expense_id uuid,
  p_user_id uuid,
  p_settled boolean
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.expenses;
begin
  if actor is null then raise exception 'Sign in to update a settlement.'; end if;
  if p_expense_id is null or p_user_id is null or p_settled is null then
    raise exception 'Choose an expense, member, and settlement state.';
  end if;
  select * into target from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if target.group_id is null then raise exception 'Personal expenses do not need settlement.'; end if;
  if actor <> target.paid_by and actor <> p_user_id then
    raise exception 'Only the payer or debtor can update this settlement.';
  end if;
  update public.expense_splits set is_settled = p_settled
  where expense_id = p_expense_id and user_id = p_user_id and user_id <> target.paid_by;
  return found;
end;
$$;

revoke all on function public.delete_finance_expense_v3(uuid) from public;
revoke all on function public.remove_group_member_v3(uuid, uuid) from public;
revoke all on function public.set_expense_split_settled_v3(uuid, uuid, boolean) from public;
grant execute on function public.delete_finance_expense_v3(uuid) to authenticated;
grant execute on function public.remove_group_member_v3(uuid, uuid) to authenticated;
grant execute on function public.set_expense_split_settled_v3(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
