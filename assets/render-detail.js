/* 弹窗: 任务详情 — 详情/记录双 tab + 编辑(标题/说明) + 注销(state_reason=not_planned) + 评论
   记录 = GitHub 原生 timeline 事件流(认领/关闭/编辑/评论自动留痕, 不自建存储) */
(function () {
  "use strict";
  window.TB = window.TB || {};

  var current = null;   /* 正在查看的 issue(state.issues 成员引用, 变更后原位更新) */
  var logLoaded = false;

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function result(text, ok) {
    var node = $("dt-error");
    node.textContent = text;
    node.className = "form-result " + (ok ? "ok" : "err");
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function relTime(iso) { return TB.relTime ? TB.relTime(iso) : ""; }
  function cfg() { return TB.state.config; }

  /* ---- tab 切换 ---- */
  var PANES = { detail: "pane-detail", edit: "pane-edit", log: "pane-log" };
  var TABS = { detail: "tab-detail", log: "tab-log" };
  function selectTab(name) {
    Object.keys(PANES).forEach(function (key) {
      if (key === name) show(PANES[key]); else hide(PANES[key]);
    });
    Object.keys(TABS).forEach(function (key) {
      $(TABS[key]).className = "tab" + (key === name ? " tab-active" : "");
    });
  }

  /* ---- 详情 pane ---- */
  function statusText(issue) {
    if (issue.state === "closed") {
      return issue.state_reason === "not_planned" ? "已注销" : "已完成";
    }
    var names = (issue.assignees || []).map(function (a) { return a.login; });
    return names.length ? "进行中 · 负责人 @" + names.join(", @") : "待认领";
  }

  function fillView(issue) {
    $("dt-title").textContent = issue.title;
    $("dt-num").textContent = "#" + issue.number;
    var meta = $("dt-meta");
    meta.textContent = "";
    (issue.labels || []).forEach(function (l) {
      meta.appendChild(el("span", "chip", l.name || l));
    });
    meta.appendChild(el("span", "chip chip-cancelled", statusText(issue)));
    meta.appendChild(el("span", "card-age", "更新于 " + relTime(issue.updated_at)));
    $("dt-body").textContent = issue.body || "(无说明)";
    $("btn-dt-edit").classList.toggle("hidden", issue.state !== "open");
    $("btn-dt-cancel-issue").classList.toggle("hidden", issue.state !== "open");
  }

  function openDetail(issue) {
    current = issue;
    logLoaded = false;
    $("dt-timeline").textContent = "";
    $("dt-timeline").appendChild(el("div", "dt-empty", "切到「记录」页时加载"));
    $("dt-comment").value = "";
    result("", true);
    fillView(issue);
    selectTab("detail");
    show("overlay-detail");
  }

  /* ---- 编辑 ---- */
  function openEdit() {
    $("ed-title").value = current.title;
    $("ed-body").value = current.body || "";
    result("", true);
    selectTab("edit");
    $("ed-title").focus();
  }

  async function saveEdit() {
    var title = $("ed-title").value.trim();
    if (!title) { result("标题不能为空", false); return; }
    var body = $("ed-body").value;
    var btn = $("btn-ed-save");
    btn.disabled = true;
    try {
      await TB.api.patchIssue(cfg().owner, cfg().repo, current.number, { title: title, body: body });
      current.title = title;
      current.body = body;
      fillView(current);
      TB.renderBoard(TB.state);
      selectTab("detail");
      result("已保存", true);
    } catch (err) {
      result(err.status === 403 ? "没有编辑权限(只能编辑自己发布的任务)" : (err.message || String(err)), false);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---- 注销: 关闭 + 原生 not_planned 标记, 不发评论 ---- */
  async function cancelIssue() {
    if (!window.confirm("确定注销该任务?将关闭并标为「已注销」,之后可重新打开。")) return;
    var btn = $("btn-dt-cancel-issue");
    btn.disabled = true;
    try {
      await TB.api.patchIssue(cfg().owner, cfg().repo, current.number,
        { state: "closed", state_reason: "not_planned" });
      current.state = "closed";
      current.state_reason = "not_planned";
      TB.toast("已注销 #" + current.number);
      hide("overlay-detail");
      TB.renderBoard(TB.state);
      if (TB.refresh) TB.refresh(true);
    } catch (err) {
      result(err.status === 403 ? "没有关闭该任务的权限" : (err.message || String(err)), false);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---- 记录 pane: timeline 事件流 ---- */
  function textFor(ev) {
    switch (ev.event) {
      case "assigned": return "认领给 @" + (ev.assignee && ev.assignee.login || "?");
      case "unassigned": return "移除负责人 @" + (ev.assignee && ev.assignee.login || "?");
      case "closed": return ev.state_reason === "not_planned" ? "注销了任务" : "完成了任务";
      case "reopened": return "重新打开了任务";
      case "edited": return "编辑了标题/说明";
      case "labeled": return "加了标签「" + (ev.label && ev.label.name || "?") + "」";
      case "unlabeled": return "移除了标签「" + (ev.label && ev.label.name || "?") + "」";
      case "commented": return "评论:";
      default: return ev.event;
    }
  }

  function renderLog(events) {
    var box = $("dt-timeline");
    box.textContent = "";
    var rows = (events || []).filter(function (ev) {
      /* 只留对人有意义的动作, 交叉引用等噪音不显示 */
      return ["assigned", "unassigned", "closed", "reopened", "edited",
        "labeled", "unlabeled", "commented"].indexOf(ev.event) >= 0;
    });
    if (!rows.length) {
      box.appendChild(el("div", "dt-empty", "暂无记录"));
      return;
    }
    rows.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    rows.forEach(function (ev) {
      var row = el("div", "dt-log-row");
      row.appendChild(el("span", "dt-log-who", "@" + (ev.actor && ev.actor.login || "?")));
      row.appendChild(el("span", "dt-log-what", textFor(ev)));
      row.appendChild(el("span", "dt-log-time", relTime(ev.created_at)));
      box.appendChild(row);
      if (ev.event === "commented" && ev.body) {
        box.appendChild(el("div", "dt-log-body", ev.body));
      }
    });
  }

  async function loadLog() {
    if (logLoaded || !current) return;
    var num = current.number;  /* 防串台: 返回时可能已切到别的任务 */
    var box = $("dt-timeline");
    box.textContent = "";
    box.appendChild(el("div", "dt-empty", "加载中…"));
    try {
      var events = await TB.api.getTimeline(cfg().owner, cfg().repo, num);
      if (!current || current.number !== num) return;
      logLoaded = true;
      renderLog(events);
    } catch (err) {
      if (!current || current.number !== num) return;
      box.textContent = "";
      box.appendChild(el("div", "dt-empty dt-err", "记录加载失败: " + (err.message || String(err))));
    }
  }

  async function postComment() {
    var text = $("dt-comment").value.trim();
    if (!text) return;
    var btn = $("btn-dt-comment");
    btn.disabled = true;
    try {
      await TB.api.addComment(cfg().owner, cfg().repo, current.number, text);
      $("dt-comment").value = "";
      TB.toast("评论已发送");
      logLoaded = false;
      loadLog();
    } catch (err) {
      TB.toast(err.status === 403 ? "没有评论权限" : (err.message || String(err)), true);
    } finally {
      btn.disabled = false;
    }
  }

  TB.modals.openDetail = openDetail;
  TB.detail = { openDetail: openDetail, renderLog: renderLog, textFor: textFor };

  /* ---- 事件绑定(模块加载时一次) ---- */
  $("tab-detail").addEventListener("click", function () { selectTab("detail"); });
  $("tab-log").addEventListener("click", function () { selectTab("log"); loadLog(); });
  $("btn-dt-edit").addEventListener("click", openEdit);
  $("btn-ed-save").addEventListener("click", saveEdit);
  $("btn-ed-cancel").addEventListener("click", function () { result("", true); selectTab("detail"); });
  $("btn-dt-cancel-issue").addEventListener("click", cancelIssue);
  $("btn-dt-comment").addEventListener("click", postComment);
  $("btn-dt-close").addEventListener("click", function () { hide("overlay-detail"); });
  $("overlay-detail").addEventListener("click", function (e) {
    if (e.target === e.currentTarget) hide("overlay-detail");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hide("overlay-detail");
  });
})();
