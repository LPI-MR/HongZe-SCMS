// ===== orders-flow 模块脚本（订单台账 · 全链路层，R4 重构）=====
// 职责（零侵入 orders.js 台账核心逻辑）：
//   1. 履约管线过滤条：九态管线 + 全部 / 已终止 一屏合一（Apple 风格分段，替代原
//      「链路总览管道 + 流程胶囊导航」双组件，消除重复展示），点击过滤由 orders.js 接管
//   2. 合并列表：创建阶段（录入中/待港口/待运力/待方案）的流程订单以行形式
//      注入订单列表 tbody，融入既有检索 / 管线过滤 / 分页 / 编号
//   3. 联动：管线分段计数与空态随数据自动刷新；流程行删除走 HZFlowData 级联删除
// 数据源 flowOrders 九表资源（flow-data.js，HZDB 基座），台账六态订单仍由 orders.js 管理，互不干扰
(function () {
  'use strict';

  const data = window.HZFlowData;
  const flowNav = document.getElementById('flowNav');

  // 九态 → 台账管线分段统一标签（与分段 data-flow 值一致，供 applyFilter 匹配）
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

  // 管道分组：创建 / 履约 / 完成（与订单管理流程页工作流链路一致）
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

  /* ==================== 履约管线过滤条（九态管线 + 全部 / 已终止 一屏合一） ==================== */

  // 一次性构建管线分段结构（结构固定不随数据重建，避免整条重渲导致选中态丢失；
  // 点击过滤由 orders.js initFlowNav 事件委托接管，active 态亦由 orders.js 维护）。
  // 结构化分组：总览 / 创建 / 履约 / 完成 / 终态 五组纵列（帽标在上、分段在下），
  // 组间以流向箭头衔接，替代原单行平铺的胶囊流
  function buildFlowNav() {
    if (!flowNav || flowNav.dataset.fnBuilt === '1') return;

    const capBlock = cap => '<span class="fn-cap">' + cap + '</span>';
    const segsOpen = '<div class="fn-segs">';
    const segsClose = '</div>';

    // 总览组：全部订单
    let html =
      '<div class="fn-group fn-lead">' +
      capBlock('总览') +
      segsOpen +
      '<button type="button" class="fn-seg fn-all active" data-flow="" title="全部订单">' +
      '<span class="fn-label">全部</span>' +
      '<span class="fn-count">0</span>' +
      '</button>' +
      segsClose +
      '</div>';

    // 三阶段九态管线（组间流向箭头）
    GROUPS.forEach((g, gi) => {
      if (gi > 0) html += '<span class="fn-flow" aria-hidden="true"></span>';
      html += '<div class="fn-group">' +
        capBlock(g.cap) +
        segsOpen;
      g.states.forEach(s => {
        const meta = data.STATUS_META[s];
        html +=
          '<button type="button" class="fn-seg is-empty" data-state="' + s + '"' +
          ' data-flow="' + data.esc(STATE_TO_PILL[s]) + '"' +
          ' style="--c:' + meta.color + '"' +
          ' title="' + data.esc(meta.label) + '">' +
          '<span class="fn-label">' + data.esc(STATE_TO_PILL[s]) + '</span>' +
          '<span class="fn-count">0</span>' +
        '</button>';
      });
      html += segsClose + '</div>';
    });

    // 终态侧挂：右对齐独立危险色组，不占正向管线
    html += '<div class="fn-group fn-side">' +
      capBlock('终态') +
      segsOpen +
      '<button type="button" class="fn-seg" data-flow="已终止" style="--c:#ff3b30" title="已终止">' +
      '<span class="fn-label">已终止</span>' +
      '<span class="fn-count">0</span>' +
      '</button>' +
      segsClose +
      '</div>';

    flowNav.innerHTML = html;
    flowNav.dataset.fnBuilt = '1';
  }

  /* ==================== 合并列表注入 ==================== */

  // 追加创建阶段流程订单行（renderAll 中在统计/过滤/分页之前调用，编号/过滤/分页自动覆盖）
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
      // 统一标签与管线分段 data-flow 一致：分段过滤对台账行 / 流程行同时生效
      tr.dataset.status = pill;
      tr.dataset.date = data.fmtDateShort(o.createdAt);
      tr.dataset.amount = amount || 0;
      // 检索文本：与台账行同口径（可见业务列，原始数值可搜，不含按钮文案 / 内部属性）
      tr.dataset.search = [
        o.id, o.trader || '', o.cargoName || '',
        qty || '', amount || '', o.mine || '',
        v ? (v.voyage_code || '') : '', pill, tr.dataset.date
      ].join(' ');

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

  /* ==================== 管线分段计数修正 ==================== */

  // orders.js updateStats 不再写分段计数；此处统一维护（台账六态 + 流程九态合并口径）
  function updateFlowCounts() {
    if (!flowNav || flowNav.dataset.fnBuilt !== '1') return;
    const ledger = ledgerOrders();
    const flow = data.listOrders();

    const counts = {};
    ledger.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    flow.forEach(o => {
      const st = data.migrateStatus(o.status) || 'draft';
      const key = STATE_TO_PILL[st];
      if (key) counts[key] = (counts[key] || 0) + 1;
    });

    flowNav.querySelectorAll('.fn-seg[data-flow]').forEach(seg => {
      const c = seg.querySelector('.fn-count');
      if (!c) return;
      const key = seg.dataset.flow || '';
      const n = key === '' ? (ledger.length + flow.length) : (counts[key] || 0);
      c.textContent = n;
      if (key !== '') seg.classList.toggle('is-empty', n === 0);
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
    tbody.addEventListener('click', async e => {
      const btn = e.target.closest('.flow-del');
      if (!btn) return;
      const id = btn.dataset.flowDel;
      if (!id) return;
      if (!confirm('确认删除订单 ' + id + ' 及其所有关联数据？此操作不可撤销。')) return;
      // 删除为异步写库：await 确保台账联动（removeFlowOrder）完成后再全量重渲
      await data.deleteOrder(id);
      if (typeof window.HZLedgerRefresh === 'function') window.HZLedgerRefresh();
    });
  }

  /* ==================== 事件与初始化 ==================== */

  // 暴露合并钩子：orders.js renderAll 在统计/过滤/分页前调用 appendRows 注入创建阶段流程订单行
  window.HZFlowMerge = { appendRows: appendRows };

  // 台账每次重渲（renderAll 末尾派发）后：刷新管线分段计数与空态
  document.addEventListener('hz:orders-rendered', () => {
    updateFlowCounts();
  });

  buildFlowNav();
  initFlowRowActions();

  // orders.js 初始 renderAll 先于本脚本执行（合并钩子当时未定义），
  // 主动触发一次全量重渲完成首次注入与管道初始化
  if (typeof window.HZLedgerRefresh === 'function') window.HZLedgerRefresh();
})();
