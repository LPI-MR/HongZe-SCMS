// ===== 合同管理模块 · 内置种子数据 =====
// 作用：首次访问（浏览器 localStorage 尚无数据）时自动写入种子数据，
//       使合同台账 / 数据看板 / 合同模板「开箱即用」，数据随仓库分发；
//       各电脑后续的增删改仍保存在各自浏览器，互不影响，也不会被种子复活。
// 维护：更新本文件中的 SEED 内容并提交仓库，即可同步给所有使用者。
//
// 字段结构（与各模块脚本一致）：
//   contracts: [{ id, code, name, type, partyA, partyB, partyC,
//                 amount, received, paid, quantity, executed, signDate, endDate, status }]
//   materials: { [合同id]: { approval|legal|contract|other: { name, dataUrl } | null } }
//   templates: [{ id, category, versions: [{ ver, time, name, intro, content,
//                 risks, remark, files: [{ name, data }] }] }]
(function () {
  'use strict';

  var SEED = {
    contracts: [],
    materials: {},
    templates: []
  };

  // 仅当键不存在或内容损坏时回填种子；
  // 用户清空数据后保存的是 '[]' / '{}'（合法 JSON），不会被种子复活
  function ensure(key, val) {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return; }

    var corrupted = false;
    if (raw !== null) {
      try { JSON.parse(raw); } catch (e) { corrupted = true; }
    }

    if (raw === null || corrupted) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 存储不可用时忽略 */ }
    }
  }

  ensure('hz_contracts', SEED.contracts);
  ensure('hz_contract_materials', SEED.materials);
  ensure('hz_contract_templates', SEED.templates);

  // ===== 数据同步桥：对接轻量同步服务器（server/server.js）=====
  // 三级降级：live API → 静态 data.json → 浏览器 localStorage
  //   1. 先请求 /api/data（服务器运行时，多人实时共享）
  //   2. API 不可用（404/无数据）→ 拉取仓库里的 /server/data.json（静态兜底，随仓库分发）
  //   3. 仍不可用 → 各页面回退使用浏览器 localStorage
  window.HZ_SYNC = {
    pull: function () {
      if (!window.fetch) return Promise.resolve(null);

      // 第一步：尝试实时 API
      var apiTried = false;
      return fetch('/api/data', { cache: 'no-store' })
        .then(function (r) {
          apiTried = true;
          if (!r.ok) return null;
          return r.json();
        })
        .then(function (d) {
          if (d && (
            (d.contracts && d.contracts.length) ||
            (d.templates && d.templates.length) ||
            (d.materials && Object.keys(d.materials).length)
          )) return d;
          return null;
        })
        .catch(function () { return null; })

        // 第二步：API 无数据或不可用 → 拉仓库静态文件
        .then(function (liveData) {
          if (liveData) return liveData;
          return fetch('/server/data.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
        })

        // 第三步：最终判断
        .then(function (d) {
          if (!d) return null;
          var has = (d.contracts && d.contracts.length) ||
                    (d.templates && d.templates.length) ||
                    (d.materials && Object.keys(d.materials).length);
          return has ? d : null;
        });
    },
    push: function (patch) {
      try {
        fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        }).catch(function () { /* 服务器未启动：静默降级，数据仍保存在本机 */ });
      } catch (e) { /* 忽略 */ }
    }
  };
})();
