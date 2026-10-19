# 任务看板 · 交接摘要(2026-10-19)

> 给新 session / 新接手人的最小上下文。详细维护说明看 DEVELOPMENT.md,使用者看 README.md。

## 这是什么

数据团队的任务发布/认领看板。纯前端单 HTML,**后端 = 组仓 GitHub Issues**(打 `board` 标签)。发布任务 = 开 issue,认领 = assign 自己,完成 = 关票。兼容 wayfinder 标签(只读透传,看板不改标签)。

## 当前状态

| 项 | 状态 |
|---|---|
| 看板 v1(3 列 + 发布/认领/完成/重开 + 403 降级 + mock 模式) | ✅ 完成 |
| mock 验证 + 真数据联调(建/认领/关 #5) | ✅ 全通过 |
| 代码仓库 | ✅ https://github.com/we1if/team-task-board (main) |
| README(使用者视角)+ DEVELOPMENT.md(维护者) | ✅ 已推 |
| 构建产物 `docs/index.html`(Pages 用) | ✅ 已提交推送 |
| **仓库转公开** | ✅ 已完成(2026-10-19 匿名 API 确认 public) |
| **开 GitHub Pages**(Settings → Pages → main + /docs) | ✅ 已生效(https://we1if.github.io/team-task-board/ 返回 200) |

## 唯一未决事项(= 下一步)

已全部完成(2026-10-19):仓库 public + Pages 生效 + README 第一节改为"打开网址"。无遗留。

## 关键事实(新 session 必读)

- 本机路径:`C:\Users\admin\Desktop\task-board\`(独立 git,remote = we1if/team-task-board)
- 组仓:`Mr-G-9527/WellInsight`(private,mentor 耿滋翔/G;fine-grained Token 管不了他人私仓,**必须用 classic PAT repo scope**)
- git 身份:`we1if` / `we1if@users.noreply.github.com`(已配,commit 时显式 -c 传入)
- 用户 Token 曾在旧 session 聊天中出现,建议用户 Regenerate(未做)
- 测试票 #5(看板联调测试)已关,留在组仓当记录
- 组员权限:用户自己有 Triage 级(打标签成功验证过);其他组员权限未知,403 降级链路已内置(认领降级为评论 `/认领 @login` → 有权限者一键确认)
- 本机双击 .html 关联到 IE(已坏),本机打开:Edge 地址栏贴 `file:///C:/Users/admin/Desktop/task-board/dist/task-board.html` 或修默认应用(ms-settings:defaultapps → .html → Edge)
- 构建:`python build.py` → dist/task-board.html + docs/index.html;调试:`?mock=1`
