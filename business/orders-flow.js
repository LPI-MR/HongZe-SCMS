// ===== orders-flow 模块脚本（订单台账 · 全链路层，R4 重构）=====
// 职责（零侵入 orders.js 台账核心逻辑）：
//   1. 链路总览：业务工作流九态管道可视化（创建 → 履约 → 完成 + 已终止侧挂），
//      与业务总览（business.html）工作流链路同源（flow-data.js 九态状态机）
//   2. 合并列表：创建阶段（录入中/待港口/待运力/待方案）的流程订单以行形式
//      注入订单列表 tbody，融入既有检索 / 胶囊过滤 / 分页 / 编号
//   3. 联动：管道点击 ↔ 胶囊过滤互相同步；流程行删除走 HZFlowData 级联删除
// 数据源 hz_flow_*（flow-data.js），台账六态订单仍由 orders.js 管理，互不干扰
(function () {
  'use strict';

  const data = window.HZFlowData;
  const pipeline = document.getElementById('flowPipeline');
  const flowNav = document.getElementById('flowNav');

  // 九态 → 台账胶囊统一标签（与 flowNav 内 .pill[data-flow] 值一致，供 applyFilter 匹配）
  const STATE_TO_PILL = {
    draft: '录入中',
    port: '待港口',
    capacity: '待运力',
    plan: '待方案',
    pending_confirm: '待确认',
    confirmed: '已确认',
    shipping: '执行中',
    shipped: '已发运',
    completed: '已完成'
  };

  // 管道分组：创建 / 履约 / 完成（与业务总览工作流链路一致）
  const GROUPS = [
    { cap: '创建', states: ['draft', 'port', 'capacity', 'plan'] },
    { cap: '履约', states: ['pending_confirm', 'confirmed', 'shipping', 'shipped'] },
    { cap: '完成', states: ['completed'] }
  ];

  /* ==================== 数据辅助 ==================== */

  // 台账订单（orders.js 同一数据层）
  function ledgerOrders() {
    try {
      return (window.HZBusinessData && window.HZBusinessData.loadOrders()) || [];
    } catch (e) {
      return [];
    }
  }

  // 业务同步产生的海运航次索引（flow_ref === 流程订单 id，R1 联动产物）
  let voyageByRef = {};
  function refreshVoyageIndex() {
    voyageByRef = {};
    let list = [];
    try {
      const hz = window.HZData;
      list = (hz && typeof hz.raw === 'function' ? hz.raw('oceanTrips') : null) || [];
    } catch (e) { /* 数据基座未就绪时显示 — */ }
    list.forEach(v => { if (v && v.flow_ref) voyageByRef[v.flow_ref] = v; });
  }

  // 金额格式化：千分位 + 两位小数（与 orders.js fmtAmount 同规格）
  function fmtAmountCN(n) {
    return Number(n || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // 九态迷你进度点：当前态高亮，之前态灰显（Apple 订单进度风格）
  function stageDotsByState(state) {
    const idx = data.STATUS_ORDER.indexOf(state);
    if (idx < 0) return '';
    let html = '<span class="stage-dots" title="履约阶段：第 ' + (idx + 1) + ' / 9 步">';
    for (let i = 0; i < 9; i++) {
      html += '<i class="' + (i < idx ? 'done' : (i === idx ? 'cur' : '')) + '"></i>';
    }
    return html + '</span>';
  }

  /* ==================== 链路总览管道 ==================== */

  function renderPipeline() {
    if (!pipeline) return;

    const flow = data.listOrders();
    const ledger = ledgerOrders();

    // 九态计数
    const counts = {};
    flow.forEach(o => {
      const s = data.migrateStatus(o.status) || 'draft';
      counts[s] = (counts[s] || 0) + 1;
    });
    const terminated = ledger.filter(o => o.status === '已终止').length;

    let html = '<div class="fp-groups">';
    GROUPS.forEach((g, gi) => {
      if (gi > 0) html += '<span class="fp-gap" aria-hidden="true"></span>';
      html += '<div class="fp-group">' +
        '<div class="fp-cap">' + g.cap + '</div>' +
        '<div class="fp-segs">';
      g.states.forEach((s, si) => {
        const meta = data.STATUS_META[s];
        const n = counts[s] || 0;
        html +=
          '<button type="button" class="fp-seg' + (n ? '' : ' is-empty') + '" data-state="' + s + '"' +
          ' data-flow="' + data.esc(STATE_TO_PILL[s]) + '"' +
          ' style="--fp-c:' + meta.color + ';flex-grow:' + Math.max(n, 0.6) + '"' +
          ' title="' + data.esc(meta.label) + ' · ' + n + ' 单">' +
          '<span class="fp-num">' + n + '</span>' +
          '<span class="fp-label">' + data.esc(meta.label) + '</span>' +
        '</button>';
        if (si < g.states.length - 1) html += '<span class="fp-arrow" aria-hidden="true"></span>';
      });
      html += '</div></div>';
    });
    html += '</div>';

    // 已终止侧挂：独立于正向管道，不占链路宽度
    html += '<div class="fp-side">' +
      '<button type="button" class="fp-side-chip" data-flow="已终止" title="已终止 · ' + terminated + ' 单">' +
      '<span class="fp-side-num">' + terminated + '</span>' +
      '<span class="fp-side-label">已终止</span>' +
    '</button></div>';

    pipeline.innerHTML = html;
    syncPipelineActive();
  }

  // 高亮同步：以当前激活胶囊（orders.js 维护 .active）反推管道高亮
  function syncPipelineActive() {
    if (!pipeline || !flowNav) return;
    const active = flowNav.querySelector('.pill.active[data-flow]');
    const flow = active ? (active.dataset.flow || '') : '';
    pipeline.querySelectorAll('.fp-seg, .fp-side-chip').forEach(seg => {
      seg.classList.toggle('active', (seg.dataset.flow || '') === flow);
    });
  }

  // 管道点击 → 模拟对应胶囊点击，复用 orders.js 既有过滤逻辑
  if (pipeline) {
    pipeline.addEventListener('click', e => {
      const seg = e.target.closest('[data-flow]');
      if (!seg || !flowNav) return;
      const pill = flowNav.querySelector('.pill[data-flow="' + seg.dataset.flow + '"]');
      if (pill) pill.click();
    });
  }

  // 胶囊点击（含管道触发的模拟点击）→ 同步管道高亮
  if (flowNav) {
    flowNav.addEventListener('click', () => syncPipelineActive());
  }

  /* ==================== 合并列表注入 ==================== */

  // 追加创建阶段流程订单行（renderAll 的 renumber 之前调用，编号/过滤/分页自动覆盖）
  function appendRows(tbody) {
    if (!tbody) return;
    // 幂等：先移除旧注入行
    tbody.querySelectorAll('tr.flow-row').forEach(r => r.remove());

    const rows = data.listOrders(); // createdAt 降序
    refreshVoyageIndex();

    rows.forEach(o => {
      const state = data.migrateStatus(o.status) || 'draft';
      const meta = data.STATUS_META[state];
      const pill = STATE_TO_PILL[state] || meta.label;
      const qty = Number(o.cargoTotal) || 0;
      const price = Number(o.cargoPrice) || 0;
      const amount = qty > 0 && price > 0 ? qty * price : 0;
      const v = voyageByRef[o.id];
      const detailHref = 'flow/order-detail.html?id=' + encodeURIComponent(o.id);

      const tr = document.createElement('tr');
      tr.className = 'flow-row';
      tr.dataset.id = o.id;
      tr.dataset.order_code = o.id;
      tr.dataset.customer = o.trader || '';
      tr.dataset.cargo = o.cargoName || '';
      tr.dataset.mine = o.mine || '';
      // 统一标签与胶囊 data-flow 一致：胶囊过滤对台账行 / 流程行同时生效
      tr.dataset.status = pill;
      tr.dataset.date = data.fmtDateShort(o.createdAt);
      tr.dataset.amount = amount || 0;

      // col-check 留空：流程行不参与勾选与批量导出（导出仅覆盖台账订单）
      tr.innerHTML =
        '<td class="col-check"></td>' +
        '<td class="col-index"></td>' +
        '<td class="mono-code"><a class="flow-detail-link" href="' + detailHref + '" target="_blank" rel="noopener">' + data.esc(o.id) + '</a></td>' +
        '<td>—</td>' +
        '<td>' + data.esc(o.trader || '—') + '</td>' +
        '<td>' + data.esc(o.cargoName || '—') + '</td>' +
        '<td class="col-num">' + data.fmtNum(qty) + '</td>' +
        '<td class="col-num">' + (amount > 0 ? fmtAmountCN(amount) : '—') + '</td>' +
        '<td>' + data.esc(o.mine || '—') + '</td>' +
        '<td>' + data.esc(v ? (v.voyage_code || '—') : '—') + '</td>' +
        '<td><span class="fv-badge" style="color:' + meta.color + ';background:' + meta.bg + '">' + data.esc(meta.label) + '</span>' + stageDotsByState(state) + '</td>' +
        '<td class="col-date">' + data.esc(data.fmtDateShort(o.createdAt)) + '</td>' +
        '<td class="col-detail"><a class="flow-detail-link" href="' + detailHref + '" target="_blank" rel="noopener">流程详情</a></td>' +
        '<td class="col-action"><div class="cell-actions">' +
          '<button type="button" class="flow-del" data-flow-del="' + data.esc(o.id) + '">删除</button>' +
        '</div></td>';

      tbody.appendChild(tr);
    });
  }

  /* ==================== 胶囊计数修正 ==================== */

  // orders.js updateStats 仅统计台账六态；此处合并流程订单计数（全部 + 9 态统一口径）
  function updatePillCounts() {
    if (!flowNav) return;
    const ledger = ledgerOrders();
    const flow = data.listOrders();

    const counts = {};
    ledger.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    flow.forEach(o => {
      const st = data.migrateStatus(o.status) || 'draft';
      const key = STATE_TO_PILL[st];
      if (key) counts[key] = (counts[key] || 0) + 1;
    });

    flowNav.querySelectorAll('.pill[data-flow]').forEach(p => {
      const c = p.querySelector('.flow-count');
      if (!c) return;
      const key = p.dataset.flow || '';
      c.textContent = key === '' ? (ledger.length + flow.length) : (counts[key] || 0);
    });

    // 横幅与概览条补齐全链路口径：orders.js 仅写台账六态，
    // 此处在 renderAll 之后叠加流程订单（每次 renderAll 先重置回台账口径，不会累加）
    const cntEl = document.getElementById('orderCount');
    if (cntEl) cntEl.textContent = String(ledger.length + flow.length);
    const amtEl = document.getElementById('orderAmount');
    const tAmount = document.getElementById('tAmount');
    let flowAmt = 0;
    flow.forEach(o => {
      const q = Number(o.cargoTotal) || 0;
      const p = Number(o.cargoPrice) || 0;
      if (q > 0 && p > 0) flowAmt += q * p;
    });
    if (amtEl) {
      const base = parseFloat((amtEl.textContent || '0').replace(/[^\d.]/g, '')) || 0;
      amtEl.textContent = fmtAmountCN(base + flowAmt);
    }
    if (tAmount) {
      const base = parseFloat((tAmount.textContent || '0').replace(/[^\d.]/g, '')) || 0;
      tAmount.textContent = '¥' + fmtAmountCN(base + flowAmt);
    }
    const tTotal = document.getElementById('tTotal');
    if (tTotal) tTotal.textContent = String(ledger.length + flow.length);
  }

  /* ==================== 流程行删除 ==================== */

  // 类名 flow-del（区别于 orders.js 委托的 .row-act.del），经 HZLedgerRefresh 全量重渲
  function initFlowRowActions() {
    const tbody = document.querySelector('.ledger-table tbody');
    if (!tbody) return;
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('.flow-del');
      if (!btn) return;
      const id = btn.dataset.flowDel;
      if (!id) return;
      if (!confirm('确认删除订单 ' + id + ' 及其所有关联数据？此操作不可撤销。')) return;
      data.deleteOrder(id);
      if (typeof window.HZLedgerRefresh === 'function') window.HZLedgerRefresh();
    });
  }

  /* ==================== 事件与初始化 ==================== */

  // 暴露合并钩子：orders.js renderAll 在 renumber 前调用 appendRows 注入创建阶段流程订单行
  window.HZFlowMerge = { appendRows: appendRows };

  // 台账每次重渲（renderAll 末尾派发）后：刷新管道 + 胶囊计数 + 高亮
  document.addEventListener('hz:orders-rendered', () => {
    renderPipeline();
    updatePillCounts();
  });

  initFlowRowActions();

  // orders.js 初始 renderAll 先于本脚本执行（合并钩子当时未定义），
  // 主动触发一次全量重渲完成首次注入与管道初始化
  if (typeof window.HZLedgerRefresh === 'function') window.HZLedgerRefresh();
})();
