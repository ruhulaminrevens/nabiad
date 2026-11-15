-- Nabiad v4 — clear audit log, delete manual backup, users' last sign-in (all admin only)
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.

create or replace function public.clear_audit(before timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare n int; nm text;
begin
  if coalesce(my_role(), '') <> 'admin' then raise exception 'not allowed'; end if;
  delete from audit_log where at < before; get diagnostics n = row_count;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'admin'), 'audit_log', 'delete', n || ' rows cleared (before ' || to_char(before at time zone 'Asia/Dhaka', 'DD-MM-YYYY') || ')', null, null);
  return n;
end $$;
grant execute on function public.clear_audit(timestamptz) to authenticated;

create or replace function public.delete_backup(bid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '') <> 'admin' then raise exception 'not allowed'; end if;
  delete from backups where id = bid and kind = 'manual';
end $$;
grant execute on function public.delete_backup(bigint) to authenticated;

create or replace function public.user_logins() returns table(id uuid, email text, name text, role text, active boolean, last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(my_role(), '') <> 'admin' then raise exception 'not allowed'; end if;
  return query select p.id, p.email, p.name, p.role, p.active, u.last_sign_in_at, u.created_at
    from profiles p left join auth.users u on u.id = p.id order by p.role, p.name;
end $$;
grant execute on function public.user_logins() to authenticated;
