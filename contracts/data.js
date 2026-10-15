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
  // pull：拉取服务器最新数据；服务器不可达或无数据时返回 null（各页面据此降级用本地缓存）
  // push：将本地数据补丁上报服务器（静默失败，不影响本机继续使用）
  window.HZ_SYNC = {
    pull: function () {
      if (!window.fetch) return Promise.resolve(null);
      return fetch('/api/data', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return null;
          var has = (d.contracts && d.contracts.length) ||
                    (d.templates && d.templates.length) ||
                    (d.materials && Object.keys(d.materials).length);
          return has ? d : null;
        })
        .catch(function () { return null; });
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
