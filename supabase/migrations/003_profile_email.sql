-- Account profile email setup.
alter table public.profiles add column if not exists email text;
create index if not exists profiles_username_lower_idx on public.profiles(lower(username));
create index if not exists profiles_email_lower_idx on public.profiles(lower(email));
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;


create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''), new.email);
  return new;
end;
$$;
