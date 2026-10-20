/* 看板渲染 — 纯 DOM 构造, 一律 textContent(issue 内容是外部数据, 禁 innerHTML 防 XSS) */
(function () {
  "use strict";
  window.TB = window.TB || {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function chip(labelName) {
    var cls = "chip";
    if (labelName === "P0") cls += " chip-p0";
    else if (labelName === "P1") cls += " chip-p1";
    return el("span", cls, labelName);
  }

  function relTime(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    var minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return minutes + " 分钟前";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " 小时前";
    var days = Math.floor(hours / 24);
    return days + " 天前";
  }

  function actionButton(text, className, onClick) {
    var btn = el("button", "btn btn-small " + className, text);
    btn.type = "button";
    /* 整卡可点开详情, 按钮先阻断冒泡 */
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /* 优先级 label 排前, 其余按名 */
  function labelNames(issue) {
    return (issue.labels || []).map(function (l) { return l.name || l; });
  }

  /* 列内排序: P0>P1>P2>P3, 无优先级垫底; 同级依赖上游 updated 倒序(排序稳定) */
  function prioRank(issue) {
    var names = labelNames(issue);
    for (var i = 0; i < 4; i++) {
      if (names.indexOf("P" + i) !== -1) return i;
    }
    return 4;
  }

  function buildCard(issue, state) {
    var cancelled = issue.state === "closed" && issue.state_reason === "not_planned";
    var card = el("div", "card card-click");
    card.addEventListener("click", function () {
      if (TB.modals && TB.modals.openDetail) TB.modals.openDetail(issue);
    });

    var meta = el("div", "card-meta");
    meta.appendChild(el("span", "card-num", "#" + issue.number));
    if (state.newNumbers && state.newNumbers[issue.number]) {
      meta.appendChild(el("span", "chip chip-new", "新"));
    }
    var names = labelNames(issue);
    names.forEach(function (name) {
      if (name === "blocked") return; /* 下面统一用 blocked 徽标, 不重复出 chip */
      meta.appendChild(chip(name));
    });
    if (names.indexOf("blocked") !== -1) {
      meta.appendChild(el("span", "chip badge-blocked", "blocked"));
    }
    if (issue.state === "closed") {
      meta.appendChild(cancelled
        ? el("span", "chip chip-cancelled", "已注销")
        : el("span", "chip chip-done", "已完成"));
    }
    card.appendChild(meta);

    card.appendChild(el("div", "card-title" + (cancelled ? " card-title-cancelled" : ""), issue.title));

    var foot = el("div", "card-meta");
    if (issue.user && issue.user.login) {
      foot.appendChild(el("span", "card-assignee", "@" + issue.user.login + " 发布"));
    }
    var assignees = issue.assignees || [];
    if (assignees.length) {
      foot.appendChild(el("span", "card-assignee",
        "负责人: " + assignees.map(function (a) { return a.login; }).join(", ")));
    }
    foot.appendChild(el("span", "card-age", relTime(issue.updated_at)));
    card.appendChild(foot);

    var pending = state.pendingClaims[issue.number];
    if (pending) {
      card.appendChild(el("span", "badge-pending", "认领已记录 · 待确认（" + pending + "）"));
    }

    /* 动作按钮: 按所在列决定 */
    var actions = el("div", "card-actions");
    if (issue.state === "open" && assignees.length === 0) {
      if (pending) {
        actions.appendChild(actionButton("确认认领", "btn-primary", function () {
          TB.actions.confirmClaim(issue, pending);
        }));
      } else {
        actions.appendChild(actionButton("认领", "btn-primary", function () {
          TB.actions.claim(issue);
        }));
      }
    } else if (issue.state === "open" && assignees.length > 0) {
      /* 多人可同票(GitHub 认领是合并语义), 只要是负责人之一就能完成/放弃 */
      var mine = state.viewer && assignees.some(function (a) { return a.login === state.viewer; });
      if (mine) {
        actions.appendChild(actionButton("完成", "btn-primary", function () {
          TB.actions.complete(issue);
        }));
        actions.appendChild(actionButton("放弃", "", function () {
          TB.actions.abandon(issue);
        }));
      }
    } else if (issue.state === "closed") {
      actions.appendChild(actionButton("重开", "", function () {
        TB.actions.reopen(issue);
      }));
    }
    if (actions.childNodes.length) card.appendChild(actions);

    return card;
  }

  function matchFilter(issue, filter, viewer) {
    if (filter === "all") return true;
    var who = filter === "mine" ? viewer : filter;
    if (!who) return filter === "all";
    var assignees = issue.assignees || [];
    if (issue.state === "open" && assignees.length === 0) return false; /* 未认领票不属于任何人 */
    return assignees.some(function (a) { return a.login === who; });
  }

  TB.relTime = relTime; /* 详情弹窗复用 */

  TB.renderBoard = function (state) {
    var buckets = { todo: [], doing: [], done: [] };
    state.issues.forEach(function (issue) {
      if (!matchFilter(issue, state.filter, state.viewer)) return;
      var assignees = issue.assignees || [];
      if (issue.state === "closed") buckets.done.push(issue);
      else if (assignees.length > 0) buckets.doing.push(issue);
      else buckets.todo.push(issue);
    });

    var map = { "todo": "body-todo", "doing": "body-doing", "done": "body-done" };
    Object.keys(map).forEach(function (key) {
      var body = document.getElementById(map[key]);
      body.textContent = "";
      if (!buckets[key].length) {
        body.appendChild(el("div", "col-empty", key === "todo" ? "暂无待认领任务" : key === "doing" ? "暂无进行中任务" : "暂无已完成任务"));
      }
      buckets[key].sort(function (a, b) { return prioRank(a) - prioRank(b); });
      buckets[key].forEach(function (issue) {
        body.appendChild(buildCard(issue, state));
      });
      document.getElementById("count-" + key).textContent = String(buckets[key].length);
    });

    /* 筛选下拉: 全部 / 我的 / 各负责人 */
    var select = document.getElementById("filter-select");
    var current = state.filter;
    var logins = {};
    state.issues.forEach(function (issue) {
      (issue.assignees || []).forEach(function (a) { logins[a.login] = true; });
    });
    select.textContent = "";
    [["all", "全部"], ["mine", "我的"]].forEach(function (pair) {
      var opt = el("option", "", pair[1]);
      opt.value = pair[0];
      select.appendChild(opt);
    });
    Object.keys(logins).sort().forEach(function (login) {
      var opt = el("option", "", login);
      opt.value = login;
      select.appendChild(opt);
    });
    select.value = current;
    if (select.value !== current) { /* 当前筛选人已无任务 */
      select.value = "all";
    }
  };
})();
