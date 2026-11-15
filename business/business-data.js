// ===== 业务管理板块共享数据层 =====
// 订单台账（orders.js）、执行跟踪（tracking.js）、结算管理（settlement.js）共用：
//  - 订单数据（DB 资源 ledger）
//  - 结算数据（DB 资源 settlements）
//  - 订单流转日志（DB 资源 ledgerLogs）
// 合同（contracts）、矿山（mines）、航次（voyages）、车次（trips）
// 为其他模块权威数据，本层与其只读对接（均经 HZDB 缓存读取）。
// 数据基座：common/hz-db.js（HZDB）—— bootstrap 全量缓存 + PUT 全量替换；
// 种子数据由后端数据库预置，前端不再内置种子。
(function () {
  'use strict';

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

  // ===== 订单数据读写（DB 资源 ledger） =====
  // 读：HZDB 同步读缓存，返回副本避免页面原地改动污染缓存；
  // 写：async 全量替换（失败 HZDB 已 toast，返回 false 由调用方回滚现场）
  function loadOrders() {
    const v = window.HZDB ? window.HZDB.get('ledger') : undefined;
    return Array.isArray(v) ? v.slice() : [];
  }

  async function saveOrders(list) {
    if (!window.HZDB || !Array.isArray(list)) return false;
    return window.HZDB.put('ledger', list.slice());
  }

  // ===== 结算数据读写（DB 资源 settlements） =====
  function loadSettlements() {
    const v = window.HZDB ? window.HZDB.get('settlements') : undefined;
    return Array.isArray(v) ? v.slice() : [];
  }

  async function saveSettlements(list) {
    if (!window.HZDB || !Array.isArray(list)) return false;
    return window.HZDB.put('settlements', list.slice());
  }

  // ===== 流转日志读写（DB 资源 ledgerLogs，纯数组，最新在前） =====
  function loadLogs() {
    const v = window.HZDB ? window.HZDB.get('ledgerLogs') : undefined;
    return Array.isArray(v) ? v.slice() : [];
  }

  async function saveLogs(logs) {
    if (!window.HZDB || !Array.isArray(logs)) return false;
    return window.HZDB.put('ledgerLogs', logs.slice());
  }

  // 新增流转日志：插到最前（时间戳倒序由插入方式保证）
  async function pushLog(entry) {
    const next = [entry].concat(loadLogs());
    return saveLogs(next);
  }

  // ===== 流程订单 → 订单台账自动同步（订单管理流程页 → 订单台账链路） =====
  // 状态映射唯一出处：流程九态 → 台账订单状态；录入中/待港口/待运力/待方案未达同步点，不进台账
  const FLOW_TO_LEDGER_STATUS = {
    draft: null, port: null, capacity: null, plan: null,
    pending_confirm: '待确认',
    confirmed: '已确认',
    shipping: '执行中',
    shipped: '已发运',
    completed: '已完成'
  };

  // 单条流程订单同步：按 from_flow + flow_id 识别既有记录覆盖更新，不产生重复；
  // 首次同步若流程订单号与台账既有编号撞号，改用台账下一可用编号，绝不覆盖人工数据
  async function syncFlowOrder(flowOrder) {
    if (!flowOrder || !flowOrder.id) return false;
    const status = FLOW_TO_LEDGER_STATUS[flowOrder.status];
    const list = loadOrders();

    // 未达同步点：无痕（台账内不应有记录，兜底清理）
    if (!status) {
      const filtered = list.filter(o => !(o.from_flow && o.flow_id === flowOrder.id));
      if (filtered.length !== list.length) return saveOrders(filtered);
      return false;
    }

    const now = Date.now();
    const existing = list.find(o => o.from_flow && o.flow_id === flowOrder.id);
    // 既有记录复制后改字段，避免污染 HZDB 缓存中的原数组
    const rec = existing ? Object.assign({}, existing) : {};

    if (!existing) {
      // 首次同步：流程订单号被台账人工数据占用时换台账新编号
      let orderCode = flowOrder.id;
      if (list.some(o => o.order_code === orderCode)) orderCode = nextOrderCode(list, now);
      rec.id = 'o-flow-' + flowOrder.id;
      rec.order_code = orderCode;
      rec.contract_id = '';
      rec.contract_code = '';
      rec.mine_id = '';
      rec.voyage_id = flowOrder.vessel || '';
      rec.trip_ids = [];
      rec.remark = '来自业务流程';
      rec.from_flow = true;
      rec.flow_id = flowOrder.id;
      rec.created_by = '业务流程';
      rec.sign_date = fmtDate(flowOrder.createdAt || now);
      rec.created_at = now;
    }

    // 字段映射：客户←贸易商；货量←吨（全系统统一「吨」口径，R2）；金额←总量×单价（元）；矿山←来源矿山；状态←状态映射
    rec.customer = flowOrder.trader || '';
    rec.cargo_name = flowOrder.cargoName || '';
    rec.cargo_qty = Number(flowOrder.cargoTotal) || 0;
    rec.amount = Math.round((Number(flowOrder.cargoTotal) || 0) * (Number(flowOrder.cargoPrice) || 0));
    rec.mine_name = flowOrder.mine || '';
    rec.status = status;
    rec.updated_at = now;

    // 复制写回（map/concat 产新数组，put 失败时缓存保持原样）
    const next = existing
      ? list.map(o => (o.id === rec.id ? rec : o))
      : list.concat([rec]);
    return saveOrders(next);
  }

  // 流程订单删除联动：已同步进台账的记录一并删除；未达同步点删除无痕
  async function removeFlowOrder(flowId) {
    if (!flowId) return false;
    const list = loadOrders();
    const filtered = list.filter(o => !(o.from_flow && o.flow_id === flowId));
    if (filtered.length === list.length) return false;
    return saveOrders(filtered);
  }

  // ===== 挂到 window，供订单台账 / 执行跟踪 / 结算管理使用 =====
  window.HZBusinessData = {
    ORDER_FLOW: ORDER_FLOW, ORDER_TERMINAL: ORDER_TERMINAL, SETTLE_TYPES: SETTLE_TYPES,
    canTransitionOrder: canTransitionOrder, nextOrderStatuses: nextOrderStatuses,
    calcSettleStatus: calcSettleStatus,
    nextOrderCode: nextOrderCode, nextSettleCode: nextSettleCode,
    loadOrders: loadOrders, saveOrders: saveOrders,
    loadSettlements: loadSettlements, saveSettlements: saveSettlements,
    loadLogs: loadLogs, saveLogs: saveLogs, pushLog: pushLog,
    FLOW_TO_LEDGER_STATUS: FLOW_TO_LEDGER_STATUS,
    syncFlowOrder: syncFlowOrder, removeFlowOrder: removeFlowOrder
  };
})();
