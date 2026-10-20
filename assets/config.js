/* 配置与本地存储 — file:// 下 localStorage 可能被禁, 全部走安全包装 */
(function () {
  "use strict";
  window.TB = window.TB || {};

  var DEFAULT_CONFIG = { owner: "Mr-G-9527", repo: "WellInsight", label: "board" };

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* 存储被禁时静默, 只影响"记住" */ }
  }
  function safeRemove(key) {
    try { window.localStorage.removeItem(key); } catch (_) { /* 同上 */ }
  }

  function loadConfig() {
    var raw = safeGet("tb-config");
    if (!raw) return Object.assign({}, DEFAULT_CONFIG);
    try {
      var parsed = JSON.parse(raw);
      return {
        owner: parsed.owner || DEFAULT_CONFIG.owner,
        repo: parsed.repo || DEFAULT_CONFIG.repo,
        label: parsed.label || DEFAULT_CONFIG.label
      };
    } catch (_) {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(config) {
    safeSet("tb-config", JSON.stringify(config));
  }

  function loadToken() { return safeGet("tb-token") || ""; }
  function saveToken(token) {
    if (token) safeSet("tb-token", token);
    else safeRemove("tb-token");
  }

  function loadFilter() { return safeGet("tb-filter") || "all"; }
  function saveFilter(value) { safeSet("tb-filter", value); }

  /* 新票感知基线: 上次已见到的最新 created_at; seenNums = 点开过详情的票号 */
  function loadLastSeen() { return safeGet("tb-last-seen") || ""; }
  function saveLastSeen(iso) { safeSet("tb-last-seen", iso); }
  function loadSeenNums() {
    var raw = safeGet("tb-seen-nums");
    if (!raw) return [];
    try { return JSON.parse(raw) || []; } catch (_) { return []; }
  }
  function markSeen(num) {
    var arr = loadSeenNums();
    if (arr.indexOf(num) === -1) {
      arr.push(num);
      if (arr.length > 200) arr = arr.slice(-200);  /* 防无限增长 */
      safeSet("tb-seen-nums", JSON.stringify(arr));
    }
  }

  TB.store = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    loadToken: loadToken,
    saveToken: saveToken,
    loadFilter: loadFilter,
    saveFilter: saveFilter,
    loadLastSeen: loadLastSeen,
    saveLastSeen: saveLastSeen,
    loadSeenNums: loadSeenNums,
    markSeen: markSeen
  };
})();
