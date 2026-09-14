begin;

alter table public.finance_expenses
  drop constraint if exists finance_expenses_category_check;

alter table public.finance_expenses
  drop constraint if exists finance_expense_category_check;

alter table public.finance_expenses
  add constraint finance_expense_category_check
  check (
    category in (
      'Food',
      'Online shopping',
      'Investments',
      'Laundry',
      'Drinks',
      'Grocery',
      'Other'
    )
  );

commit;
