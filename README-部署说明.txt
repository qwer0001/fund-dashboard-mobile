基金看板 手机版 v2.0.0 · 电脑插件同显示逻辑版

1. 先把 Supabase Edge Function fund-quotes 更新为配套 v2 版本并 Deploy。
2. 再将本文件夹里的 index.html / app.js / styles.css / sw.js / manifest.webmanifest / icons 上传覆盖 GitHub Pages 仓库根目录。
3. Commit changes 后等待 GitHub Pages 自动重新部署。
4. 手机若仍显示旧版：清除此站点数据或卸载旧 PWA 后重新打开网址。

显示逻辑：
- 今日大盘
- 当前持有额 / 今日可参考预估 / 最近正式收益
- 较可靠部分 / 已覆盖仓位 / 待正式确认
- 今日可估明细与覆盖率
- 全部 / 今日可估 / 待正式筛选
- 单基金：持有额、今日、昨日正式、累计收益/收益率、最新净值
- 点基金查看正式净值走势
- 操作 / 最近待确认 / 撤销
- 持仓设置使用“份额 + 持仓成本价”，与电脑插件一致
- 公共云端最近10次历史回溯
