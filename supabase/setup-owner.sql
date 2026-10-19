-- Administrative one-time action, AFTER the organiser creates their own Auth account.
-- Not a public RPC and not part of the automatic migration sequence.
begin;
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users
    where lower(email)='ryan786w@gmail.com' and email_confirmed_at is not null and deleted_at is null;
  if owner_id is null then raise exception 'The verified initial owner Auth account has not been created';end if;
  insert into ringside_private.staff(user_id,role,active) values(owner_id,'owner',true)
    on conflict(user_id) do update set role='owner',active=true;
end $$;
commit;
