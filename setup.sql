-- =====================================================================
--  عبر المحيط لاستيراد السيارات — إعداد قاعدة البيانات (Supabase)
--  الصق هذا الملف كاملاً في: Supabase → SQL Editor → New query → Run
--  قبل التشغيل: غيّر الإيميل في آخر سطر لإيميل حساب الإدارة.
-- =====================================================================

-- العملاء
create table if not exists public.clients (
  code        text primary key check (code ~ '^[A-Z0-9-]{3,20}$'),
  name        text not null,
  phone       text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- فواتير الخدمات
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  client_code text not null references public.clients(code) on update cascade on delete cascade,
  type        text not null default '',
  car         text not null default '',
  vin         text not null default '',
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- مدفوعات العملاء
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  client_code text not null references public.clients(code) on update cascade on delete cascade,
  method      text not null default '',
  car         text not null default '',
  vin         text not null default '',
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- بيانات الشركة (صف واحد)
create table if not exists public.settings (
  id        int primary key default 1 check (id = 1),
  currency  text not null default 'د.ل',
  phone     text not null default '',
  whatsapp  text not null default '',
  address   text not null default ''
);
insert into public.settings (id) values (1) on conflict do nothing;

-- قائمة إيميلات الإدارة
create table if not exists public.admins (
  email text primary key
);

create index if not exists invoices_client_idx on public.invoices(client_code);
create index if not exists payments_client_idx on public.payments(client_code);

-- هل المستخدم الحالي من الإدارة؟
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'));
$$;

-- الحماية: الإدارة فقط تقرأ وتكتب الجداول مباشرة
alter table public.clients  enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;
alter table public.admins   enable row level security;

drop policy if exists admin_all on public.clients;
drop policy if exists admin_all on public.invoices;
drop policy if exists admin_all on public.payments;
drop policy if exists admin_all on public.settings;
drop policy if exists public_read on public.settings;
create policy admin_all on public.clients  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.invoices for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_read on public.settings for select to anon, authenticated using (true);
-- جدول admins بدون أي سياسة = لا أحد يقرأه من الموقع

-- كشف حساب العميل بالكود: يرجّع حساب عميل واحد فقط، وما يسمحش بعرض قائمة العملاء
create or replace function public.client_statement(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'code', c.code,
    'name', c.name,
    'invoices', coalesce((select json_agg(json_build_object(
        'id', i.id, 'type', i.type, 'car', i.car, 'vin', i.vin, 'amount', i.amount,
        'date', i.date, 'note', i.note, 'created_at', i.created_at) order by i.date, i.created_at)
      from public.invoices i where i.client_code = c.code), '[]'::json),
    'payments', coalesce((select json_agg(json_build_object(
        'id', p.id, 'method', p.method, 'car', p.car, 'vin', p.vin, 'amount', p.amount,
        'date', p.date, 'note', p.note, 'created_at', p.created_at) order by p.date, p.created_at)
      from public.payments p where p.client_code = c.code), '[]'::json)
  )
  from public.clients c
  where c.code = upper(trim(p_code));
$$;
revoke all on function public.client_statement(text) from public;
grant execute on function public.client_statement(text) to anon, authenticated;

-- ===== غيّر الإيميل هنا لإيميل حساب الإدارة (ونفس الإيميل تسجله في Authentication → Users) =====
insert into public.admins (email) values ('admin@example.com') on conflict do nothing;
