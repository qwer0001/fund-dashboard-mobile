-- 基金看板 v4.4.0 / 手机版 v2.4.0
-- 永久交易流水：用于长期保存真实买入、卖出、清仓记录，并在历史净值图上显示交易点。
-- 可重复执行。不会修改 fund_ledger_current / fund_ledger_history，也不会关闭 RLS。

create extension if not exists pgcrypto;

create table if not exists public.fund_trade_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_trade_id text not null,
  fund_code text not null,
  fund_name text not null default '',
  action text not null check (action in ('buy','sell','clear')),
  requested_date date not null,
  requested_amount numeric(18,4) not null default 0,
  fee_rate numeric(12,6) not null default 0,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  confirmed_date date,
  confirmed_nav numeric(18,8),
  confirmed_amount numeric(18,4),
  share_delta numeric(24,10),
  approximate boolean not null default false,
  device_id text,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_trade_log_user_source_unique unique (user_id, source_trade_id)
);

create index if not exists fund_trade_log_user_fund_date_idx
  on public.fund_trade_log (user_id, fund_code, confirmed_date desc, requested_date desc);

create index if not exists fund_trade_log_user_status_idx
  on public.fund_trade_log (user_id, status, updated_at desc);

alter table public.fund_trade_log enable row level security;
alter table public.fund_trade_log force row level security;

-- 只允许已登录用户访问自己的交易流水。
drop policy if exists fund_trade_log_select_own on public.fund_trade_log;
create policy fund_trade_log_select_own
  on public.fund_trade_log for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists fund_trade_log_insert_own on public.fund_trade_log;
create policy fund_trade_log_insert_own
  on public.fund_trade_log for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists fund_trade_log_update_own on public.fund_trade_log;
create policy fund_trade_log_update_own
  on public.fund_trade_log for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists fund_trade_log_delete_own on public.fund_trade_log;
create policy fund_trade_log_delete_own
  on public.fund_trade_log for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.fund_trade_log from anon;
grant select, insert, update, delete on table public.fund_trade_log to authenticated;

-- 更新时间戳。
create or replace function public.touch_fund_trade_log_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- 永久流水只允许状态向前推进，避免旧设备/回填把已确认或已取消交易改回 pending。
  if old.status = 'cancelled' then
    new.status := 'cancelled';
  elsif old.status = 'confirmed' and new.status = 'pending' then
    new.status := 'confirmed';
  end if;
  new.confirmed_date := coalesce(new.confirmed_date, old.confirmed_date);
  new.confirmed_nav := coalesce(new.confirmed_nav, old.confirmed_nav);
  new.confirmed_amount := coalesce(new.confirmed_amount, old.confirmed_amount);
  new.share_delta := coalesce(new.share_delta, old.share_delta);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fund_trade_log_updated_at on public.fund_trade_log;
create trigger trg_fund_trade_log_updated_at
before update on public.fund_trade_log
for each row execute function public.touch_fund_trade_log_updated_at();

-- 可选核对：执行后应看到 rls_enabled=true。
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname='fund_trade_log';
