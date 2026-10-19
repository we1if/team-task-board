/* 弹窗: 设置 / 新建任务 — TB.modals 挂钩, 业务动作走 TB.actions */
(function () {
  "use strict";
  window.TB = window.TB || {};

  function show(id) { document.getElementById(id).classList.remove("hidden"); }
  function hide(id) { document.getElementById(id).classList.add("hidden"); }
  function result(id, text, ok) {
    var node = document.getElementById(id);
    node.textContent = text;
    node.className = "form-result " + (ok ? "ok" : "err");
  }

  /* ---- 设置 ---- */
  function openSettings() {
    var config = TB.state.config;
    document.getElementById("cfg-owner").value = config.owner;
    document.getElementById("cfg-repo").value = config.repo;
    document.getElementById("cfg-label").value = config.label;
    document.getElementById("cfg-token").value = TB.store.loadToken();
    result("cfg-test-result", "", true);
    show("overlay-settings");
  }

  function saveSettings() {
    var config = {
      owner: document.getElementById("cfg-owner").value.trim(),
      repo: document.getElementById("cfg-repo").value.trim(),
      label: document.getElementById("cfg-label").value.trim() || TB.store.DEFAULT_CONFIG.label
    };
    if (!config.owner || !config.repo) {
      result("cfg-test-result", "owner 和仓库名不能为空", false);
      return;
    }
    TB.store.saveConfig(config);
    TB.store.saveToken(document.getElementById("cfg-token").value.trim());
    TB.actions.configChanged();
    hide("overlay-settings");
  }

  async function testConnection() {
    /* 先落库输入框里的 Token, 保证"测试的就是将要使用的"——否则会拿旧存档去测, 新 Token 永远报无效 */
    var fieldToken = document.getElementById("cfg-token").value.trim();
    if (fieldToken) TB.store.saveToken(fieldToken);
    result("cfg-test-result", "测试中…", true);
    var owner = document.getElementById("cfg-owner").value.trim();
    var repo = document.getElementById("cfg-repo").value.trim();
    try {
      var login = await TB.api.getUser();
      await TB.api.getRepo(owner, repo);
      result("cfg-test-result", "连接成功，当前身份: " + login, true);
    } catch (err) {
      result("cfg-test-result", err.message || String(err), false);
    }
  }

  /* ---- 新建任务 ---- */
  function openNewTask() {
    document.getElementById("nt-title").value = "";
    document.getElementById("nt-body").value = "";
    document.getElementById("nt-priority").value = "P2";
    result("nt-error", "", true);
    show("overlay-new-task");
    document.getElementById("nt-title").focus();
  }

  async function submitNewTask() {
    var title = document.getElementById("nt-title").value.trim();
    if (!title) {
      result("nt-error", "标题不能为空", false);
      return;
    }
    var body = document.getElementById("nt-body").value.trim();
    var priority = document.getElementById("nt-priority").value;
    var btn = document.getElementById("btn-nt-submit");
    btn.disabled = true;
    result("nt-error", "发布中…", true);
    try {
      await TB.actions.createTask(title, body, priority);
      hide("overlay-new-task");
    } catch (err) {
      result("nt-error", err.message || String(err), false);
    } finally {
      btn.disabled = false;
    }
  }

  TB.modals = { openSettings: openSettings, openNewTask: openNewTask };

  /* ---- 事件绑定(模块加载时一次) ---- */
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("btn-settings-save").addEventListener("click", saveSettings);
  document.getElementById("btn-settings-cancel").addEventListener("click", function () { hide("overlay-settings"); });
  document.getElementById("btn-test-conn").addEventListener("click", testConnection);
  document.getElementById("btn-new-task").addEventListener("click", openNewTask);
  document.getElementById("btn-nt-submit").addEventListener("click", submitNewTask);
  document.getElementById("btn-nt-cancel").addEventListener("click", function () { hide("overlay-new-task"); });

  /* 点击遮罩关闭 */
  [["overlay-settings"], ["overlay-new-task"]].forEach(function (pair) {
    var id = pair[0];
    document.getElementById(id).addEventListener("click", function (e) {
      if (e.target === e.currentTarget) hide(id);
    });
  });

  /* Esc 关闭 */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      hide("overlay-settings");
      hide("overlay-new-task");
    }
  });
})();
