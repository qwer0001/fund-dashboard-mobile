-- 基金看板 手机版 v2.4.0 安全检查（只读）
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('fund_ledger_current','fund_ledger_history','fund_trade_log')
order by c.relname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public'
  and tablename in ('fund_ledger_current','fund_ledger_history','fund_trade_log')
order by tablename,policyname;

-- 理想结果：三张表均 rls_enabled=true；fund_trade_log 还应 force_rls=true；策略限制 auth.uid()=user_id。
