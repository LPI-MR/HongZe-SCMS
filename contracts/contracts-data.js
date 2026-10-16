// ===== 合同模块共享数据层 =====
// 合同台账（contracts.html）与数据看板（dashboard.html）共用同一份数据：
// 数据写入 localStorage: hz_contracts（包装格式 { __version, list }），
// 版本不匹配或旧格式数据自动回退种子，保证两个页面看到的内容始终一致
(function () {
  'use strict';

  const LS_KEY = 'hz_contracts'; // 合同数据

  // 种子版本号：种子内容变更时递增，浏览器检测到不匹配自动丢弃旧缓存、加载最新种子
  const SEED_VERSION = 'v1';

  // 写死的五条合同台账种子数据（页面上的编辑/删除仍会保存到 localStorage，版本升级时自动重置）
  const SEED_CONTRACTS = [
    {
      id: 'c-seed-001',
      code: 'HZ-2026-001',
      name: '铁精粉采购合同（武安现货）',
      type: '采购合同',
      partyA: '河北泓泽宜通供应链管理有限公司',
      partyB: '武安市鑫源矿业有限公司',
      partyC: '',
      amount: 18600000,
      received: 9000000,
      paid: 12000000,
      quantity: 30000,
      executed: 18600,
      signDate: '2026-01-10',
      endDate: '2026-12-31',
      status: '履行中'
    },
    {
      id: 'c-seed-002',
      code: 'HZ-2026-002',
      name: '钢坯销售合同（华北区域）',
      type: '销售合同',
      partyA: '河北泓泽宜通供应链管理有限公司',
      partyB: '河北新金钢铁有限公司',
      partyC: '',
      amount: 24300000,
      received: 15000000,
      paid: 0,
      quantity: 40000,
      executed: 26000,
      signDate: '2026-02-18',
      endDate: '2026-12-31',
      status: '履行中'
    },
    {
      id: 'c-seed-003',
      code: 'HZ-2026-003',
      name: '铁路运输合同（邯黄铁路煤炭）',
      type: '运输合同',
      partyA: '河北泓泽宜通供应链管理有限公司',
      partyB: '沧州沧港铁路有限公司',
      partyC: '',
      amount: 3850000,
      received: 3850000,
      paid: 3600000,
      quantity: 80000,
      executed: 80000,
      signDate: '2026-01-05',
      endDate: '2026-06-30',
      status: '已完成'
    },
    {
      id: 'c-seed-004',
      code: 'HZ-2026-004',
      name: '港口中转仓储服务合同',
      type: '服务合同',
      partyA: '河北泓泽宜通供应链管理有限公司',
      partyB: '河北陆港保税物流有限公司',
      partyC: '',
      amount: 1520000,
      received: 800000,
      paid: 900000,
      quantity: 50000,
      executed: 31500,
      signDate: '2026-03-12',
      endDate: '2027-03-11',
      status: '履行中'
    },
    {
      id: 'c-seed-005',
      code: 'HZ-2026-005',
      name: '焦炭采购合同（山西一级焦）',
      type: '采购合同',
      partyA: '河北泓泽宜通供应链管理有限公司',
      partyB: '山西潞安焦化有限责任公司',
      partyC: '',
      amount: 9180000,
      received: 0,
      paid: 4500000,
      quantity: 15000,
      executed: 7300,
      signDate: '2026-04-20',
      endDate: '2026-10-19',
      status: '已终止'
    }
  ];

  // 读取合同列表：[{id, code, name, type, partyA, partyB, partyC, amount, received, paid,
  //                 quantity, executed, signDate, endDate, status}]
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_KEY));
      if (data && data.__version === SEED_VERSION && Array.isArray(data.list)) {
        return data.list;
      }
      return seed();
    } catch (e) {
      return seed();
    }
  }

  // 首次使用（或版本升级）返回种子数据
  function seed() {
    return SEED_CONTRACTS.slice();
  }

  // 保存合同列表；存储失败（配额超限）返回 false，由调用方决定提示方式
  function save(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ __version: SEED_VERSION, list: list }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 挂到 window，供 contracts.js / dashboard.js 使用
  window.HZContractData = { LS_KEY: LS_KEY, SEED_VERSION: SEED_VERSION, load: load, save: save };
})();
