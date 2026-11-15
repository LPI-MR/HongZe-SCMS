// ===== 合同模块共享数据层 =====
// 合同台账（contracts.html）与数据看板（dashboard.html）共用同一份数据：
// 数据持久化到 PostgreSQL（contract.contract 表），读写经 HZDB 缓存基座
// （common/hz-db.js），台账与数据看板看到的内容始终一致
(function () {
  'use strict';

  // 读取合同列表：[{id, code, name, type, partyA, partyB, partyC, amount, received, paid,
  //                 quantity, executed, signDate, endDate, status}]
  // 同步读 HZDB 内存缓存（须在 HZDB.ready() 之后调用）
  function load() {
    const list = window.HZDB ? window.HZDB.get('contracts') : null;
    return Array.isArray(list) ? list : [];
  }

  // 保存合同列表（全量替换 PUT /api/contracts）；async，失败返回 false
  // （HZDB 已 toast 提示），由调用方恢复内存现场
  function save(list) {
    return window.HZDB.put('contracts', list);
  }

  // 挂到 window，供 contracts.js / dashboard.js 使用
  window.HZContractData = { load: load, save: save };
})();
