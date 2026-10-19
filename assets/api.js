/* GitHub REST API 客户端 — 只做请求与错误归一化, 无业务逻辑 */
(function () {
  "use strict";
  window.TB = window.TB || {};

  var GH_API = "https://api.github.com";
  var TIMEOUT_MS = 20000;

  function headers() {
    var h = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    var token = TB.store.loadToken();
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  async function ghError(res) {
    var detail = "";
    try {
      var body = await res.json();
      if (body && body.message) detail = body.message;
    } catch (_) { /* 响应体可能为空 */ }
    var map = {
      401: "Token 无效或已过期",
      403: "没有权限执行此操作",
      404: "仓库不可见（检查设置里的 owner/repo，或 Token 的仓库范围）",
      422: "请求被拒绝（检查表单内容）"
    };
    var msg = map[res.status] || "请求失败（HTTP " + res.status + "）";
    if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0") {
      msg = "API 限流，请稍后再试";
    }
    if (res.status >= 500 && detail) msg += "：" + detail;
    return { status: res.status, message: msg };
  }

  async function ghFetch(path, options) {
    var opts = options || {};
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var res;
    try {
      res = await fetch(GH_API + path, {
        method: opts.method || "GET",
        headers: headers(),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
    } catch (_) {
      throw { status: 0, message: "网络请求失败（检查网络后重试）" };
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw await ghError(res);
    return res.status === 204 ? null : res.json();
  }

  /* 验 token, 返回 viewer 登录名 */
  async function getUser() {
    var data = await ghFetch("/user");
    return data.login;
  }

  /* 探仓: 可见性 + 权限 */
  async function getRepo(owner, repo) {
    return ghFetch("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo));
  }

  /* 列看板任务: 按 label 过滤, 翻页取全, 过滤掉 PR */
  async function listIssues(owner, repo, label) {
    var base = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) +
      "/issues?state=all&labels=" + encodeURIComponent(label) +
      "&sort=updated&direction=desc&per_page=100&page=";
    var all = [];
    var page = 1;
    for (;;) {
      var batch = await ghFetch(base + page);
      all = all.concat(batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return all.filter(function (item) { return !item.pull_request; });
  }

  /* 新建任务; addLabels=false 用于 403 降级重试(打 label 需 Triage); extraLabels 为导入的额外透传标签 */
  async function createIssue(owner, repo, title, body, label, priority, addLabels, extraLabels) {
    var payload = { title: title, body: body || "" };
    if (addLabels) payload.labels = [label, priority].concat(extraLabels || []);
    return ghFetch("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/issues", {
      method: "POST",
      body: payload
    });
  }

  /* 认领/放弃/完成/重开 共用 */
  async function patchIssue(owner, repo, num, payload) {
    return ghFetch("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) +
      "/issues/" + num, { method: "PATCH", body: payload });
  }

  async function addComment(owner, repo, num, body) {
    return ghFetch("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) +
      "/issues/" + num + "/comments", { method: "POST", body: { body: body } });
  }

  async function listComments(owner, repo, num) {
    return ghFetch("/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) +
      "/issues/" + num + "/comments?per_page=100");
  }

  TB.api = {
    getUser: getUser,
    getRepo: getRepo,
    listIssues: listIssues,
    createIssue: createIssue,
    patchIssue: patchIssue,
    addComment: addComment,
    listComments: listComments
  };
})();
