基金看板 手机版 PWA v2.3.8 清仓后主列表自动隐藏版

本版新增：
- 已正式清仓、份额/成本/金额归零且没有待确认操作的基金，不再显示在手机主看板基金列表。
- 只隐藏主列表，不删除 Supabase 账本，不删除历史记录。
- 清仓基金仍保留在交易下拉列表中；以后重新买入并形成持仓后，会自动重新出现在主看板。
- 若基金仍有待确认操作，即使当前金额暂时为0，也不会被主列表隐藏。
- 主列表筛选计数按当前实际显示的持仓基金数量计算。
- 最近正式收益继续按历史真实记录统计，不受主列表隐藏影响。

继续保留：
- 动态已有基金下拉、新基金代码识别、全部卖出无需金额、卖出金额校验。
- Supabase 单一最新主线、revision / expected_revision 冲突保护。
- Supabase 最新30条历史；行情刷新不会制造历史版本。
- 可信设备免登录、RLS、安全模型、数据库表结构、RPC 均不变。

GitHub Pages 更新：
1. 覆盖上传 index.html、app.js、styles.css、sw.js、manifest.webmanifest、README-部署说明.txt、icons 文件夹。
2. Commit changes。
3. 等待 GitHub Pages 部署完成。
4. 完全关闭旧 PWA/浏览器页面再重新打开；Service Worker 缓存名已升级到 v2.3.8。

Supabase：本版无需更新数据库、无需运行 SQL。
