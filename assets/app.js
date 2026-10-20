/* 应用主体: 状态 + 启动链 + 动作(含 403 降级) + 刷新 */
(function () {
  "use strict";
  window.TB = window.TB || {};

  var state = {
    config: TB.store.loadConfig(),
    issues: [],
    viewer: null,
    filter: TB.store.loadFilter(),
    pendingClaims: {},   /* issue 号 -> 待确认认领人 login */
    loading: false,
    mock: new URLSearchParams(location.search).get("mock") === "1"
  };
  TB.state = state;

  /* ---- 轻提示 / 横幅 ---- */
  var toastTimer = null;
  function toast(text, isErr) {
    var node = document.getElementById("toast");
    node.textContent = text;
    node.className = "toast" + (isErr ? " toast-err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.add("hidden"); }, 3500);
  }
  TB.toast = toast;       /* 供导入等子模块复用 */
  TB.refresh = refresh;   /* 导入完成后刷新看板(refresh 定义在后, 函数声明提升) */

  function banner(text, isError) {
    var node = document.getElementById("banner");
    if (!text) { node.classList.add("hidden"); return; }
    node.textContent = text;
    node.className = "banner" + (isError ? " banner-error" : "");
  }

  /* ---- mock 数据(?mock=1, 无 token 无网络跑通全部 UI) ---- */
  function nowAgo(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }
  var MOCK_ISSUES = [
    { number: 101, title: "整理 10 月第一周 POF 日报数据口径", state: "open", assignees: [], labels: [{ name: "P1" }, { name: "数据" }], created_at: nowAgo(3000), updated_at: nowAgo(3000) },
    { number: 102, title: "修复周报里 AT 利用率曲线断点", state: "open", assignees: [], labels: [{ name: "P0" }, { name: "开发" }], created_at: nowAgo(1500), updated_at: nowAgo(40) },
    { number: 103, title: "仿真数据 C1 入门引导文档评审", state: "open", assignees: [], labels: [{ name: "P2" }, { name: "blocked" }], created_at: nowAgo(6000), updated_at: nowAgo(120) },
    { number: 104, title: " heatmap 色标量化 legend 对齐 Tableau", state: "open", assignees: [{ login: "wyf-demo" }], labels: [{ name: "P1" }], created_at: nowAgo(8000), updated_at: nowAgo(200) },
    { number: 105, title: "跨港对比 demo 数据源覆盖矩阵核对", state: "open", assignees: [{ login: "wyf-demo" }], labels: [{ name: "P2" }, { name: "wayfinder:task" }], created_at: nowAgo(9000), updated_at: nowAgo(30) },
    { number: 100, title: "9 月值班 bot 链路适配", state: "closed", state_reason: "completed", assignees: [{ login: "wyf-demo" }], labels: [{ name: "P2" }], created_at: nowAgo(20000), updated_at: nowAgo(2000) },
    { number: 106, title: "重复发布的测试票(示例注销)", state: "closed", state_reason: "not_planned", assignees: [], labels: [{ name: "P2" }], created_at: nowAgo(10000), updated_at: nowAgo(100) }
  ];
  /* mock 里 #102 模拟"评论认领待确认" */
  var MOCK_PENDING = { 102: "wyf-demo" };

  /* ---- 待确认认领检测: 扫未分配 open 票的评论 ---- */
  var CLAIM_RE = /^\/认领 @(\S+)/;
  async function detectPendingClaims(issues) {
    var pending = {};
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      if (issue.state !== "open" || (issue.assignees || []).length > 0 || !issue.comments) continue;
      try {
        var comments = await TB.api.listComments(state.config.owner, state.config.repo, issue.number);
        for (var j = comments.length - 1; j >= 0; j--) {
          var m = (comments[j].body || "").match(CLAIM_RE);
          if (m) { pending[issue.number] = m[1]; break; }
        }
      } catch (_) { /* 单票评论拉取失败不阻塞整个看板 */ }
    }
    return pending;
  }

  /* ---- 加载 ---- */
  async function refresh(silent) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) banner("加载中…");
    try {
      if (state.mock) {
        state.issues = MOCK_ISSUES;
        state.pendingClaims = MOCK_PENDING;
        state.viewer = state.viewer || "wyf-demo";
        banner("");
      } else {
        var token = TB.store.loadToken();
        if (!token) {
          state.issues = [];
          state.viewer = null;
          banner("首次使用：请点右上角「设置」粘贴 GitHub Token（私有仓库需要它才能读任务）");
        } else {
          state.viewer = await TB.api.getUser();
          state.issues = await TB.api.listIssues(state.config.owner, state.config.repo, state.config.label);
          state.pendingClaims = await detectPendingClaims(state.issues);
          banner("");
        }
      }
      document.getElementById("repo-badge").textContent =
        state.config.owner + "/" + state.config.repo + (state.mock ? "（mock）" : "");
      document.getElementById("viewer-name").textContent = state.viewer ? "@" + state.viewer : "";
      TB.renderBoard(state);
    } catch (err) {
      banner(err.message || String(err), true);
    } finally {
      state.loading = false;
    }
  }

  /* ---- 动作(403 降级) ---- */
  function repoPath(num) {
    return "/" + encodeURIComponent(state.config.owner) + "/" + encodeURIComponent(state.config.repo) +
      (num ? "/issues/" + num : "/issues");
  }

  var actions = {
    /* 认领: 主路径 PATCH assignees; 403 → 评论标记, 等有权限的人确认 */
    claim: async function (issue) {
      try {
        await TB.api.patchIssue(state.config.owner, state.config.repo, issue.number, { assignees: [state.viewer] });
        issue.assignees = [{ login: state.viewer }];
        toast("已认领 #" + issue.number);
      } catch (err) {
        if (err.status === 403) {
          try {
            await TB.api.addComment(state.config.owner, state.config.repo, issue.number, "/认领 @" + state.viewer);
            state.pendingClaims[issue.number] = state.viewer;
            toast("没有直接认领权限，已记录认领，等待负责人确认");
          } catch (err2) {
            toast(err2.message || String(err2), true);
          }
        } else {
          toast(err.message || String(err), true);
        }
      }
      TB.renderBoard(state);
    },

    /* 确认认领: 需 Triage; 403 → 提示 */
    confirmClaim: async function (issue, login) {
      try {
        await TB.api.patchIssue(state.config.owner, state.config.repo, issue.number, { assignees: [login] });
        issue.assignees = [{ login: login }];
        delete state.pendingClaims[issue.number];
        toast("#" + issue.number + " 已确认给 " + login);
      } catch (err) {
        toast(err.status === 403 ? "确认认领需要 Triage 权限" : (err.message || String(err)), true);
      }
      TB.renderBoard(state);
    },

    complete: async function (issue) {
      try {
        await TB.api.patchIssue(state.config.owner, state.config.repo, issue.number, { state: "closed" });
        issue.state = "closed";
        toast("#" + issue.number + " 已完成");
      } catch (err) {
        toast(err.status === 403 ? "关闭他人任务需要 Triage 权限" : (err.message || String(err)), true);
      }
      TB.renderBoard(state);
    },

    abandon: async function (issue) {
      try {
        await TB.api.patchIssue(state.config.owner, state.config.repo, issue.number, { assignees: [] });
        issue.assignees = [];
        toast("已放弃 #" + issue.number);
      } catch (err) {
        toast(err.message || String(err), true);
      }
      TB.renderBoard(state);
    },

    reopen: async function (issue) {
      try {
        await TB.api.patchIssue(state.config.owner, state.config.repo, issue.number, { state: "open" });
        issue.state = "open";
        toast("#" + issue.number + " 已重开");
      } catch (err) {
        toast(err.message || String(err), true);
      }
      TB.renderBoard(state);
    },

    /* 发布任务; 打 label 403 → 不带 label 重试 */
    createTask: async function (title, body, priority) {
      var cfg = state.config;
      try {
        await TB.api.createIssue(cfg.owner, cfg.repo, title, body, cfg.label, priority, true);
        toast("任务已发布");
      } catch (err) {
        if (err.status === 403) {
          await TB.api.createIssue(cfg.owner, cfg.repo, title, body, cfg.label, priority, false);
          toast("任务已发布，但看板标签未添加（需要 Triage 权限），请手动补打 " + cfg.label, true);
        } else {
          throw err;
        }
      }
      await refresh(true);
    },

    configChanged: function () {
      state.config = TB.store.loadConfig();
      state.viewer = null;
      refresh();
    }
  };
  TB.actions = actions;

  /* ---- 顶栏事件 ---- */
  document.getElementById("btn-refresh").addEventListener("click", function () { refresh(); });
  document.getElementById("filter-select").addEventListener("change", function (e) {
    state.filter = e.target.value;
    TB.store.saveFilter(state.filter);
    TB.renderBoard(state);
  });

  /* ---- 启动 ---- */
  function safeInit() {
    try { TB.modals; TB.renderBoard; TB.api; TB.store; } catch (e) {
      banner("页面模块加载不完整: " + e.message, true);
      return;
    }
    refresh();
    /* 60s 自动刷新(页面可见时), 限流 5000/h 绰绰有余 */
    setInterval(function () {
      if (!document.hidden && !state.mock && TB.store.loadToken()) refresh(true);
    }, 60000);
  }

  safeInit();
})();
