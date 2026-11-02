// ===== 业务管理板块共享数据层 =====
// 订单台账（orders.js）、执行跟踪（tracking.js）、结算管理（settlement.js）共用：
//  - 订单数据（hz_orders，包装格式 { __version, list }）
//  - 结算数据（hz_settlements，包装格式 { __version, list }）
//  - 订单流转日志（hz_order_logs，纯数组，最新在前）
// 合同（hz_contracts）、矿山（hz_mines）、航次（hz_ocean_voyages）、车次（hz-scms-trips-v2）
// 为其他模块权威数据，本层与其只读对接；后续接入后端时，仅需替换本文件的 load/save 实现。
(function () {
  'use strict';

  const LS_ORDERS = 'hz_orders';             // 订单数据
  const LS_SETTLEMENTS = 'hz_settlements';   // 结算数据
  const LS_LOGS = 'hz_order_logs';           // 订单流转日志

  // 种子版本号：种子内容变更时递增，浏览器检测到不匹配自动丢弃旧缓存、加载最新种子
  const SEED_VERSION = 'v2';

  // ===== 状态机定义（迁移 hongze_demo 状态机规则，中文化适配） =====
  // 订单正向单向推进、禁止跳级；「已终止」为终态，任意状态可转入
  const ORDER_FLOW = ['待确认', '已确认', '执行中', '已发运', '已完成'];
  const ORDER_TERMINAL = '已终止';
  const SETTLE_TYPES = ['应收', '应付'];

  // 订单状态流转校验（迁移 canTransition 模式）：
  // 同状态与终态不可流转；任意状态可转「已终止」；正向仅允许推进一级
  function canTransitionOrder(from, to) {
    if (!from || !to || from === to) return false;
    if (from === ORDER_TERMINAL) return false;
    if (to === ORDER_TERMINAL) return true;
    const fi = ORDER_FLOW.indexOf(from);
    const ti = ORDER_FLOW.indexOf(to);
    return fi > -1 && ti === fi + 1;
  }

  // 列出订单某状态的合法流转目标（正向下一状态 + 已终止），供流转弹层渲染
  function nextOrderStatuses(from) {
    if (!from || from === ORDER_TERMINAL) return [];
    const list = [];
    const fi = ORDER_FLOW.indexOf(from);
    if (fi > -1 && fi < ORDER_FLOW.length - 1) list.push(ORDER_FLOW[fi + 1]);
    list.push(ORDER_TERMINAL);
    return list;
  }

  // 结算状态自动联动（迁移收款状态自动计算规则）：
  // 累计 ≥ 应结金额 → 已结算；累计 > 0 → 部分结算；否则待结算
  function calcSettleStatus(amount, accumulated) {
    const a = Number(amount) || 0;
    const acc = Number(accumulated) || 0;
    if (a > 0 && acc >= a) return '已结算';
    if (acc > 0) return '部分结算';
    return '待结算';
  }

  // ===== 工具 =====
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // ===== 订单编号生成（迁移 hongze_demo 规则：HZ + yyyyMMdd + 4位流水，同日扫描 maxSeq + 1） =====
  function nextOrderCode(orders, now) {
    const d = now ? new Date(now) : new Date();
    const p = n => String(n).padStart(2, '0');
    const prefix = 'HZ' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    const maxSeq = orders.reduce((max, o) => {
      if (!o.order_code || o.order_code.indexOf(prefix) !== 0) return max;
      const n = Number(o.order_code.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return prefix + String(maxSeq + 1).padStart(4, '0');
  }

  // ===== 结算编号生成（对齐订单编号风格：SK + yyyyMMdd + 3位流水） =====
  function nextSettleCode(list, now) {
    const d = now ? new Date(now) : new Date();
    const p = n => String(n).padStart(2, '0');
    const prefix = 'SK' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    const maxSeq = list.reduce((max, s) => {
      if (!s.settle_code || s.settle_code.indexOf(prefix) !== 0) return max;
      const n = Number(s.settle_code.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return prefix + String(maxSeq + 1).padStart(3, '0');
  }

  // ===== 订单种子 =====
  // 引用现有合同种子（c-seed-001 / 002 / 004 履行中合同）；矿山（hz_mines）与航次
  // （hz_ocean_voyages）按简称 / 航次号回填 id，对应模块未初始化时退化为空关联（仅展示）
  // 编号规则迁移 hongze_demo：HZ + yyyyMMdd + 4位流水，同一签订日内流水递增
  // 列：[合同种子id, 矿山简称, 航次号, 车次号数组, 客户, 货物, 货量(万吨), 金额(元), 签订(天前), 计划完成(天后), 状态, 备注]
  function buildOrders() {
    const DAY = 24 * 60 * 60 * 1000;
    const base = Date.now();

    // 货源矿山：按简称回填 mine_id（矿山数据缺失时退化为空关联）
    const mines = loadJSON('hz_mines', []);
    const mineByName = {};
    (Array.isArray(mines) ? mines : []).forEach(m => {
      mineByName[m.short_name || m.mine_name || ''] = m;
    });

    // 海运航次：按航次号回填 voyage_id（航次数据缺失时退化为空关联）
    const voyages = loadJSON('hz_ocean_voyages', []);
    const voyageByCode = {};
    (Array.isArray(voyages) ? voyages : []).forEach(v => {
      voyageByCode[v.voyage_code || ''] = v;
    });

    const seedDef = [
      ['c-seed-001', '福斯特库', 'S-004', [], '武安市鑫源矿业有限公司', '超特粉', 17.5, 10850000, 90, -5, '已完成', '已交付完毕，客户验收通过'],
      ['c-seed-001', '力拓', 'S-001', ['YS1013-004', 'YS1012-018'], '武安市鑫源矿业有限公司', 'PB粉', 17, 10540000, 75, 30, '已发运', '澳矿进口，港口直发武安'],
      ['c-seed-001', '必和必拓', 'S-002', [], '武安市鑫源矿业有限公司', '纽曼粉', 18, 11160000, 60, 45, '执行中', '待装船，疏港计划已排定'],
      ['c-seed-001', '淡水河谷', 'S-003', ['YS1013-006'], '武安市鑫源矿业有限公司', '卡拉加斯粉', 30, 19500000, 60, 50, '执行中', '巴西矿进口，青岛港卸货'],
      ['c-seed-002', '', '', ['YS1013-008', 'YS1013-009'], '河北新金钢铁有限公司', '钢坯', 3.5, 8400000, 30, 40, '执行中', '汽运分批配送'],
      ['c-seed-002', '', '', [], '河北新金钢铁有限公司', '钢坯', 4, 9600000, 30, 60, '已确认', '华北区域销售，分批交货'],
      ['c-seed-004', '', '', [], '河北陆港保税物流有限公司', '港口仓储服务', 5, 1520000, 30, 120, '待确认', '中转仓储服务框架订单'],
      ['c-seed-002', '西芒杜', '', [], '河北新金钢铁有限公司', '高品位块矿', 1.5, 4200000, 15, 30, '已终止', '客户需求变更，双方协商终止'],
      ['c-seed-002', '', '', [], '河北新金钢铁有限公司', '钢坯', 2, 4800000, 3, 90, '待确认', '新增补库需求，待评审确认']
    ];

    // 合同种子静态可靠：订单的合同号冗余直接取合同 code
    // hz_contracts 为包装格式 { __version, list }（contracts-data.js 维护），兼容解析；
    // 本地无合同数据时按种子合同 id 兜底编号，保证种子订单合同号完整
    const FALLBACK_CODES = {
      'c-seed-001': 'HZ-2026-001',
      'c-seed-002': 'HZ-2026-002',
      'c-seed-003': 'HZ-2026-003',
      'c-seed-004': 'HZ-2026-004',
      'c-seed-005': 'HZ-2026-005'
    };
    const rawContracts = loadJSON('hz_contracts', null);
    const contracts = rawContracts && Array.isArray(rawContracts.list)
      ? rawContracts.list
      : (Array.isArray(rawContracts) ? rawContracts : []);
    const contractById = {};
    contracts.forEach(c => { contractById[c.id] = c; });

    // 同一签订日内流水递增（与 hongze_demo 同日扫描 maxSeq + 1 的规则一致）
    const seqByDay = {};

    return seedDef.map((s, i) => {
      const signTs = base - s[8] * DAY;
      const dayKey = fmtDate(signTs).replace(/-/g, '');
      const seq = (seqByDay[dayKey] || 0) + 1;
      seqByDay[dayKey] = seq;

      const mine = mineByName[s[1]] || {};
      const voyage = voyageByCode[s[2]] || {};
      const contract = contractById[s[0]] || {};

      // 已完成订单把更新时间前推至近两日（本月完成的演示口径）
      const updatedAt = s[10] === '已完成' ? base - 2 * DAY : signTs;

      return {
        id: 'o-seed-' + String(i + 1).padStart(3, '0'),
        order_code: 'HZ' + dayKey + String(seq).padStart(4, '0'),
        contract_id: s[0],
        contract_code: contract.code || FALLBACK_CODES[s[0]] || '',
        mine_id: mine.id || '',
        mine_name: s[1] || '',
        voyage_id: voyage.id || '',
        trip_ids: s[3].slice(),
        customer: s[4],
        cargo_name: s[5],
        cargo_qty: s[6],
        amount: s[7],
        sign_date: fmtDate(signTs),
        plan_end_date: fmtDate(base + s[9] * DAY),
        status: s[10],
        remark: s[11],
        created_by: '系统预置',
        created_at: signTs,
        updated_at: updatedAt
      };
    });
  }

  // ===== 结算种子 =====
  // 按订单维度记录应收 / 应付结算台账，覆盖四状态组合；金额单位与合同台账一致（元）
  // 列：[订单种子下标(从 1 计), 类型, 金额(元), 已收付(元), 创建(天前), 结算日期(天后), 状态, 备注]
  function buildSettlements(orders) {
    const DAY = 24 * 60 * 60 * 1000;
    const base = Date.now();
    const seqByDay = {};

    const seedDef = [
      [2, '应收', 10540000, 5000000, 65, 20, '部分结算', '澳矿货款，已收预付部分'],
      [3, '应收', 11160000, 0, 55, 45, '待结算', '待装船后开票结算'],
      [4, '应收', 19500000, 19500000, 50, 30, '已结算', '巴西矿货款，全额收讫'],
      [5, '应收', 8400000, 3000000, 25, 25, '部分结算', '钢坯货款，分批收款中'],
      [2, '应付', 8200000, 8200000, 60, 20, '已结算', '采购与运费成本，已付清'],
      [3, '应付', 9800000, 2000000, 50, 45, '部分结算', '矿款预付部分'],
      [9, '应付', 4500000, 0, 10, 80, '待结算', '补库订单成本，待排款'],
      [8, '应收', 4200000, 0, 12, 25, '已终止', '订单终止，结算同步关闭']
    ];

    return seedDef.map((s, i) => {
      const o = orders[s[0] - 1] || {};
      const createTs = base - s[4] * DAY;
      const dayKey = fmtDate(createTs).replace(/-/g, '');
      const seq = (seqByDay[dayKey] || 0) + 1;
      seqByDay[dayKey] = seq;

      // 应收单据累计记 received，应付单据累计记 paid
      const record = {
        id: 's-seed-' + String(i + 1).padStart(3, '0'),
        settle_code: 'SK' + dayKey + String(seq).padStart(3, '0'),
        order_id: o.id || '',
        order_code: o.order_code || '',
        contract_id: o.contract_id || '',
        contract_code: o.contract_code || '',
        customer: o.customer || '',
        type: s[1],
        amount: s[2],
        received: 0,
        paid: 0,
        settle_date: fmtDate(base + s[5] * DAY),
        status: s[6],
        remark: s[7],
        created_at: createTs,
        updated_at: createTs
      };
      if (s[1] === '应付') record.paid = s[3];
      else record.received = s[3];
      return record;
    });
  }

  // ===== 订单流转日志种子 =====
  // 按订单当前状态自动生成对应流转链（待确认逐级推进至当前状态），保证日志与状态一致
  function buildLogs(orders) {
    const DAY = 24 * 60 * 60 * 1000;
    const base = Date.now();
    const logs = [];
    let n = 0;

    orders.forEach(o => {
      // 已终止订单的流转链：待确认 → 已确认 → 已终止；其余按正向链推进至当前状态
      let chain;
      if (o.status === ORDER_TERMINAL) {
        chain = [ORDER_FLOW[0], ORDER_FLOW[1], ORDER_TERMINAL];
      } else {
        const fi = ORDER_FLOW.indexOf(o.status);
        chain = fi > -1 ? ORDER_FLOW.slice(0, fi + 1) : [];
      }

      const startTs = o.created_at || base;
      chain.forEach((to, i) => {
        n += 1;
        logs.push({
          id: 'log-seed-' + String(n).padStart(3, '0'),
          order_id: o.id,
          from_status: i === 0 ? '' : chain[i - 1],
          to_status: to,
          operator: '系统预置',
          time: startTs + i * 2 * DAY,
          remark: ''
        });
      });
    });

    // 最新在前，与运行时写入规则一致
    return logs.sort((a, b) => b.time - a.time);
  }

  // ===== 订单数据读写 =====
  function loadOrders() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_ORDERS));
      if (data && data.__version === SEED_VERSION && Array.isArray(data.list)) {
        return data.list;
      }
      return seedOrders();
    } catch (e) {
      return seedOrders();
    }
  }

  function seedOrders() {
    const list = buildOrders();
    saveOrders(list);
    return list;
  }

  function saveOrders(list) {
    try {
      localStorage.setItem(LS_ORDERS, JSON.stringify({ __version: SEED_VERSION, list: list }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 结算数据读写 =====
  function loadSettlements() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_SETTLEMENTS));
      if (data && data.__version === SEED_VERSION && Array.isArray(data.list)) {
        return data.list;
      }
      return seedSettlements();
    } catch (e) {
      return seedSettlements();
    }
  }

  function seedSettlements() {
    const list = buildSettlements(loadOrders());
    saveSettlements(list);
    return list;
  }

  function saveSettlements(list) {
    try {
      localStorage.setItem(LS_SETTLEMENTS, JSON.stringify({ __version: SEED_VERSION, list: list }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 流转日志读写（纯数组，最新在前） =====
  function loadLogs() {
    const logs = loadJSON(LS_LOGS, null);
    if (Array.isArray(logs)) return logs;
    return seedLogs();
  }

  function seedLogs() {
    const logs = buildLogs(loadOrders());
    saveLogs(logs);
    return logs;
  }

  function saveLogs(logs) {
    try {
      localStorage.setItem(LS_LOGS, JSON.stringify(logs));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 新增流转日志：插到最前（时间戳倒序由插入方式保证）
  function pushLog(entry) {
    const logs = loadLogs();
    logs.unshift(entry);
    return saveLogs(logs);
  }

  // ===== 挂到 window，供订单台账 / 执行跟踪 / 结算管理使用 =====
  window.HZBusinessData = {
    LS_ORDERS: LS_ORDERS, LS_SETTLEMENTS: LS_SETTLEMENTS, LS_LOGS: LS_LOGS,
    SEED_VERSION: SEED_VERSION,
    ORDER_FLOW: ORDER_FLOW, ORDER_TERMINAL: ORDER_TERMINAL, SETTLE_TYPES: SETTLE_TYPES,
    canTransitionOrder: canTransitionOrder, nextOrderStatuses: nextOrderStatuses,
    calcSettleStatus: calcSettleStatus,
    nextOrderCode: nextOrderCode, nextSettleCode: nextSettleCode,
    loadOrders: loadOrders, saveOrders: saveOrders,
    loadSettlements: loadSettlements, saveSettlements: saveSettlements,
    loadLogs: loadLogs, saveLogs: saveLogs, pushLog: pushLog
  };
})();
