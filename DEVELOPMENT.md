# 开发说明

给维护者看的:构建、架构、数据模型、迁移。使用者请看 README。

## 构建

```
python build.py        # 内联 assets/ 到 dist/task-board.html(单文件交付)
```

开发调试:`index.html?mock=1` 无 Token 无网络跑全部 UI(内置样例数据)。
加新 `assets/render-*.js` 只需在 index.html 加 `<script src>`,build.py 按引用顺序自动内联。

## 文件结构

```
index.html             页面骨架(顶栏 + 3 列 + 2 弹窗)
assets/style.css       样式(色板遵循 WellInsight 项目 DESIGN.md: 颜色只表达状态/风险)
assets/config.js       配置与 localStorage 安全包装(file:// 下存储可能被禁)
assets/api.js          GitHub REST 客户端(错误归一化/翻页/PR 过滤)
assets/render-board.js 看板渲染(textContent only, 防 XSS)
assets/render-modal.js 设置/新建任务弹窗
assets/app.js          状态 + 动作 + 403 降级 + 刷新
```

## 数据模型

后端 = 组仓 GitHub Issues,按 `board` 标签过滤(标签名可在设置里改):

| 看板列 | GitHub 状态 |
|---|---|
| 待认领 | open 且无 assignee |
| 进行中 | open 且有 assignee |
| 已完成 | closed |

- 优先级 = `P0`–`P3` 标签;`blocked` 标签 → 卡片徽标
- 看板只改 assignee 和 state,**从不改标签**,与 wayfinder 等自动化共存
- issues API 会混入 PR,已按 `pull_request` 键过滤

## 权限与降级

- 认领(自 assign)Read 角色即可;关他人票/打标签需 Triage
- 认领 PATCH 403 → 自动降级为评论 `/认领 @login` → 有权限者看板一键确认
- 发布打标签 403 → 降级为不带标签发布,提示手动补
- Token:classic PAT(repo scope)或 fine-grained(注意:fine-grained 管不了他人个人账号名下的私有仓,组仓场景用 classic)

## 迁移

换仓库/迁组仓:设置里改 owner/repo 即可,代码零硬编码。
API 限流:认证 5000 次/小时,手动 + 60s 自动刷新足够。
