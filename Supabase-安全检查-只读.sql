-- 基金看板 v2.3.5 安全检查（只读，不修改数据库）
-- 在 Supabase SQL Editor 运行，可检查两张基金账本表是否启用 RLS，以及现有策略。

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('fund_ledger_current','fund_ledger_history')
order by c.relname;

select
  schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('fund_ledger_current','fund_ledger_history')
order by tablename, policyname;

-- 理想结果：两张表 rls_enabled = true；策略条件应把数据限制到 auth.uid() = user_id。
