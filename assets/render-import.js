/* 弹窗: 导入任务 — 解析导入 JSON → 校验预览 → 批量开 issue(复用 403 降级链路)
   校验宽进严出: 标题空→跳过, 优先级非法→降 P2, labels 剔除 board, 同名 open 票→提示不拦 */
(function () {
  "use strict";
  window.TB = window.TB || {};

  var SPEC_URL = "https://we1if.github.io/team-task-board/import-spec.json";
  var PRIORITIES = ["P0", "P1", "P2", "P3"];
  var SOFT_LIMIT = 50;

  var parsed = [];   /* 校验通过、可导入的任务 */
  var rejected = 0;  /* 标题为空被跳过的条数 */

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function result(text, ok) {
    var node = $("imp-result");
    node.textContent = text;
    node.className = "form-result " + (ok ? "ok" : "err");
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function openImport() {
    $("imp-file").value = "";
    $("imp-text").value = "";
    $("imp-spec-link").href = SPEC_URL;
    $("imp-preview").textContent = "";
    hide("imp-preview");
    $("btn-imp-confirm").disabled = true;
    result("", true);
    parsed = [];
    rejected = 0;
    show("overlay-import");
  }

  function onFilePicked() {
    var file = $("imp-file").files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      $("imp-text").value = reader.result;
      parseImport();
    };
    reader.readAsText(file, "utf-8");
  }

  function parseImport() {
    parsed = [];
    rejected = 0;
    $("imp-preview").textContent = "";
    hide("imp-preview");
    $("btn-imp-confirm").disabled = true;

    var text = $("imp-text").value;
    if (!text.trim()) { result("请先选择文件或粘贴 JSON", false); return; }
    var data;
    try { data = JSON.parse(text); }
    catch (e) { result("JSON 解析失败: " + e.message, false); return; }
    var tasks = Array.isArray(data) ? data : (data && data.tasks);
    if (!Array.isArray(tasks) || !tasks.length) {
      result("未找到任务列表:应为 {\"tasks\":[…]} 或任务数组", false);
      return;
    }

    /* 现存 open 任务同名表, 用于疑似重复提示 */
    var openTitles = {};
    (TB.state.issues || []).forEach(function (i) {
      if (i.state === "open") openTitles[(i.title || "").trim()] = i.number;
    });

    var box = el("div");
    var warnCount = 0;
    tasks.forEach(function (t, idx) {
      var row = el("div", "imp-row");
      row.appendChild(el("span", "imp-idx", "#" + (idx + 1)));
      var title = (t && typeof t.title === "string") ? t.title.trim() : "";
      if (!title) {
        rejected++;
        row.appendChild(el("span", "imp-title imp-err", "(标题为空)"));
        row.appendChild(el("span", "imp-status imp-err", "跳过"));
        box.appendChild(row);
        return;
      }
      row.appendChild(el("span", "imp-title", title));

      var notes = [];
      var priority = (t && PRIORITIES.indexOf(t.priority) >= 0) ? t.priority : "P2";
      if (t && t.priority && PRIORITIES.indexOf(t.priority) < 0) {
        notes.push("优先级非法,按 P2");
      }
      var labels = (t && Array.isArray(t.labels))
        ? t.labels.filter(function (x) { return typeof x === "string" && x.trim(); })
            .map(function (x) { return x.trim(); })
        : [];
      var before = labels.length;
      labels = labels.filter(function (x) { return x.toLowerCase() !== "board"; });
      if (labels.length !== before) notes.push("已剔除 board 标签");

      var dup = openTitles[title];
      if (dup !== undefined) notes.push("疑似重复(现有 #" + dup + ")");

      if (notes.length) {
        warnCount++;
        row.appendChild(el("span", "imp-note", notes.join(";")));
      }
      row.appendChild(el("span", "imp-status" + (notes.length ? " imp-warn" : ""),
        notes.length ? "可导入·注意" : "可导入"));
      parsed.push({
        title: title,
        body: (t && typeof t.body === "string") ? t.body : "",
        priority: priority,
        labels: labels
      });
      box.appendChild(row);
    });

    if (parsed.length > SOFT_LIMIT) {
      box.insertBefore(el("div", "imp-warn imp-limit",
        "一次将创建 " + parsed.length + " 个 issue,请确认无误后再导入"), box.firstChild);
    }
    show("imp-preview");
    $("imp-preview").appendChild(box);

    result("共 " + tasks.length + " 条:" + parsed.length + " 条可导入" +
      (rejected ? "," + rejected + " 条跳过" : "") +
      (warnCount ? "," + warnCount + " 条带警告" : "") +
      (TB.state.mock ? "(mock 模式仅演示,不能真实导入)" : ""), true);
    $("btn-imp-confirm").disabled = parsed.length === 0 || TB.state.mock;
  }

  async function confirmImport() {
    if (!parsed.length || TB.state.mock) return;
    var cfg = TB.state.config;
    var btn = $("btn-imp-confirm");
    btn.disabled = true;
    var degraded = 0;
    var failures = [];
    for (var i = 0; i < parsed.length; i++) {
      var t = parsed[i];
      result("导入中 " + (i + 1) + "/" + parsed.length + "…", true);
      try {
        await TB.api.createIssue(cfg.owner, cfg.repo, t.title, t.body, cfg.label, t.priority, true, t.labels);
      } catch (err) {
        if (err.status === 403) {
          try {
            await TB.api.createIssue(cfg.owner, cfg.repo, t.title, t.body, cfg.label, t.priority, false, t.labels);
            degraded++;
          } catch (err2) {
            failures.push({ title: t.title, msg: err2.message || String(err2) });
          }
        } else {
          failures.push({ title: t.title, msg: err.message || String(err) });
        }
      }
    }
    var okCount = parsed.length - failures.length;
    if (!failures.length) {
      hide("overlay-import");
      TB.toast(okCount + " 条任务已导入" + (degraded ? "(" + degraded + " 条缺看板标签,需手动补打)" : ""), degraded > 0);
      if (TB.refresh) TB.refresh(true);
    } else {
      var box = $("imp-preview");
      box.textContent = "";
      var wrap = el("div");
      wrap.appendChild(el("div", "imp-warn", "成功 " + okCount + " 条,失败 " + failures.length + " 条:"));
      failures.forEach(function (f) {
        wrap.appendChild(el("div", "imp-row imp-err", f.title + " — " + f.msg));
      });
      box.appendChild(wrap);
      show("imp-preview");
      result("部分导入完成,可修改 JSON 后重试失败的条目", false);
      if (okCount > 0 && TB.refresh) TB.refresh(true);
    }
    btn.disabled = false;
  }

  TB.import = { openImport: openImport, parseImport: parseImport, confirmImport: confirmImport };

  /* ---- 事件绑定(模块加载时一次) ---- */
  $("btn-import").addEventListener("click", openImport);
  $("btn-imp-parse").addEventListener("click", parseImport);
  $("btn-imp-confirm").addEventListener("click", confirmImport);
  $("btn-imp-cancel").addEventListener("click", function () { hide("overlay-import"); });
  $("imp-file").addEventListener("change", onFilePicked);
  $("overlay-import").addEventListener("click", function (e) {
    if (e.target === e.currentTarget) hide("overlay-import");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hide("overlay-import");
  });
})();
