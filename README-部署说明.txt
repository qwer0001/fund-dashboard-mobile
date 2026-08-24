基金看板 手机版 PWA v2.3.3 私密登录保护版

本版在 v2.3.2 手机适配版基础上加强隐私：
1. 未通过 Supabase 登录验证时，基金持仓、收益、历史记录页面完全隐藏。
2. 启动时即使手机保存过旧会话，也必须先在线验证会话有效，验证通过后才读取云端账本。
3. 不再把持仓、历史、基金行情明细长期写入浏览器本地缓存。
4. 退出登录时清理旧版残留的持仓、历史、基金行情和走势缓存。
5. 云端读写仍必须携带已登录用户 Access Token。
6. 历史规则保持不变：最多保留最近30条；超过3天不会因为时间到期自动删除，第31条出现时才淘汰最老记录。

GitHub 更新方法：
- 将本文件夹内 index.html / app.js / styles.css / sw.js / manifest.webmanifest / icons 覆盖上传到现有 GitHub Pages 仓库根目录。
- Commit changes。
- 等 GitHub Pages 部署完成后，手机若仍显示旧版，可关闭旧PWA并重新打开；必要时清除此站点缓存后重新添加到主屏幕。

重要说明：
- 本版保护的是“基金数据访问”：别人拿到网页地址，只能看到登录页，没有你的 Supabase 账号无法读取或修改你的账本。
- 如果 GitHub 仓库仍是 Public，别人仍然可以查看网页源代码或 Fork，但不能因此修改你的原仓库，也不应能读取你的基金数据。
- 前端里的 Supabase Publishable/anon key 本来就允许公开；真正的数据安全依赖 Supabase RLS / auth.uid() 权限隔离。不要把 service_role key 或数据库密码放到 GitHub。
