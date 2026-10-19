# 任务看板 (team-task-board)

给数据团队用的任务发布/认领看板。**后端零自建**——任务就是组仓里的 GitHub issue(打 `board` 标签),看板只是一个可视化前端。

## 用法(组员视角)

1. 拿到 `dist/task-board.html`,双击用浏览器打开(需联网)
2. 首次使用:右上角「设置」→ 粘贴你的 GitHub Token → 测试连接 → 保存
3. 看板上「认领」任务 → 干活 → 点「完成」

### 申请 Token(一次性,2 分钟)

1. 打开 https://github.com/settings/personal-access-tokens/new
2. Token name 随意(如 `task-board`),过期时间选长一点
3. **Repository access → Only select repositories → 勾选 `WellInsight`**
4. **Repository permissions → Issues → Read and write**(Metadata 只读会自动带上)
5. Generate → 复制 token → 粘进看板设置里

> ⚠️ Token 只保存在你自己浏览器的 localStorage,**不要提交到任何仓库、不要发给任何人**。泄露了就去 GitHub 设置里 revoke。

## 用法(发布方视角)

- 点「新建任务」:标题必填,说明/优先级可选 → 发布后自动出现在「待认领」列
- 也可以直接在 GitHub 上给 issue 打 `board` 标签,效果一样
- 组员认领后任务进入「进行中」;组员点「完成」或你直接关 issue 都会进入「已完成」
- 若某组员权限不足无法直接认领,卡片会出现「认领已记录 · 待确认」+「确认认领」按钮,点一下即可

## 给仓主的权限设置(一次性)

组员直接认领/关票需要在 `WellInsight` 仓有 **Triage** 角色:
Settings → Collaborators(或 Teams)→ 选人 → Role 改为 **Triage**。
没设也行——看板会自动降级为"评论认领 → 你手动确认"。

## 数据模型

| 看板列 | GitHub 状态 |
|---|---|
| 待认领 | issue open 且无 assignee |
| 进行中 | issue open 且有 assignee |
| 已完成 | issue closed |

- 优先级 = `P0`–`P3` 标签;`blocked` 标签卡片会显示徽标
- 看板只改 assignee 和 state,**从不动标签**,与 wayfinder 等自动化共存

## 开发

```
task-board/
  index.html            页面骨架
  assets/style.css      样式(色板遵循项目 DESIGN.md)
  assets/config.js      配置与 localStorage 安全包装
  assets/api.js         GitHub REST 客户端
  assets/render-board.js
  assets/render-modal.js
  assets/app.js         状态 + 动作
  build.py              构建: 内联成单文件
```

- 开发调试:`index.html?mock=1` 无 token 无网络跑全部 UI(内置样例数据)
- 构建:`python build.py` → `dist/task-board.html`(单文件,发群里双击即用)
- 换仓库:设置里改 owner/repo 即可,代码零硬编码;迁组仓同理

## 代码管理

提交走 GitHub:个人仓起步(`we1if/team-task-board`),验证好用后迁组仓。
