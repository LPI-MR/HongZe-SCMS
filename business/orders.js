// ===== 订单台账模块脚本 =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责订单台账的检索、渲染与增删改流转
// 订单数据走共享数据层（business-data.js）：订单台账 / 执行跟踪 / 结算管理共用同一份 localStorage 数据
// 合同 / 矿山 / 航次等跨模块字段统一经 HZData 数据基座（hz-data.js）调取各模块权威数据源，
// 后端就绪后仅需在 HZData 注册对应模块适配器，本页业务代码无需改动
(function () {
  'use strict';

  // 本页对应的导航位置：业务管理 → 订单台账
  const NAV_PATH = '业务管理';
  const NAV_SUB = NAV_PATH + ' / 订单台账';

  // 设置导航栏选中态：一级「业务管理」高亮并展开，二级「订单台账」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path !== NAV_PATH) return;

      item.classList.add('active');

      const group = item.closest('.nav-group');
      if (group) {
        group.classList.add('open');
        group.querySelectorAll('.nav-sub-item').forEach(sub => {
          if ((sub.dataset.path || '') === NAV_SUB) sub.classList.add('active');
        });
      }
    });
  }

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 数据对接 =====
  const biz = window.HZBusinessData;
  const hz = window.HZData;

  // 模块化数据调取：跨模块字段统一经 HZData 数据基座 raw(模块键) 读取权威数据源
  const rawArr = key => ((hz && typeof hz.raw === 'function' ? hz.raw(key) : null) || []);

  // 订单列表：[{id, order_code, contract_id, contract_code, mine_id, mine_name,
  //   voyage_id, trip_ids, customer, cargo_name, cargo_qty, amount, sign_date,
  //   plan_end_date, status, remark, created_by, created_at, updated_at}]
  let orders = biz.loadOrders();

  // 合同：contracts 模块权威数据，按 id 索引用于带出编号 / 客户 / 金额默认值
  const contracts = rawArr('contracts');
  const contractById = {};
  contracts.forEach(c => { contractById[c.id] = c; });

  // 矿山：mines 模块（矿山管理）权威数据，下拉仅列启用矿山
  const mines = rawArr('mines').filter(m => m.status !== 'inactive');

  // 航次：oceanTrips 模块（海运管理）权威数据，按 id 索引回填航次号
  const voyages = rawArr('oceanTrips');
  const voyageById = {};
  voyages.forEach(v => { voyageById[v.id] = v; });

  // 状态标签类名映射（business.css 状态标签变体）
  const STATUS_CLS = {
    '待确认': 'pending',
    '已确认': 'confirmed',
    '执行中': 'running',
    '已发运': 'shipped',
    '已完成': 'done',
    '已终止': 'terminated'
  };

  const OPERATOR = '系统用户'; // 流转日志操作人（接入后端后取登录用户）

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 金额格式化：千分位 + 两位小数
  function fmtAmount(n) {
    return Number(n || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // 货量格式化：千分位，最多两位小数
  function fmtQty(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  function genId() {
    return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function genLogId() {
    return 'log' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function statusTag(status) {
    return '<span class="status-tag ' + esc(STATUS_CLS[status] || '') + '">' + esc(status) + '</span>';
  }

  // R4：九态迷你进度点（Apple 订单进度风格）——台账六态映射到工作流九态，当前态高亮
  // STATUS_ORDER 下标 0-8：draft/port/capacity/plan/pending_confirm/confirmed/shipping/shipped/completed
  const LEDGER_STAGE = { '待确认': 4, '已确认': 5, '执行中': 6, '已发运': 7, '已完成': 8 };
  function stageDots(status) {
    const cur = LEDGER_STAGE[status];
    if (cur == null) return ''; // 已终止侧挂，不显示进度点
    let html = '<span class="stage-dots" title="履约阶段：第 ' + (cur + 1) + ' / 9 步">';
    for (let i = 0; i < 9; i++) {
      html += '<i class="' + (i < cur ? 'done' : (i === cur ? 'cur' : '')) + '"></i>';
    }
    return html + '</span>';
  }

  // ===== 订单检索 =====
  // 数据行约定：tbody 中每条订单为一行，携带 data-* 属性——
  //   data-id（唯一标识）、data-status、data-date（签订日期 YYYY-MM-DD）、data-amount（订单金额数值）
  // 空状态行使用 class="empty-row"，不参与过滤
  let applyFilter = null; // 供增删后重新应用检索条件
  let activeFlow = '';    // 流程胶囊当前选中状态（'' 表示全部）

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const nameInput = document.getElementById('searchKeyword');
    const startInput = document.getElementById('searchDateStart');
    const endInput = document.getElementById('searchDateEnd');

    // 按当前检索条件过滤表格行；无匹配时显示空状态行
    applyFilter = function () {
      const start = startInput.value;
      const end = endInput.value;
      // 关键词检索：空格分隔多个词，全部命中（AND）才算匹配，不限字段模糊匹配
      const keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);

      let visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(row => {
        if (row.classList.contains('empty-row')) return;

        const date = row.dataset.date || '';
        // 行全文 = 所有单元格文本 + data 属性，作为关键词匹配范围
        const text = row.textContent.toLowerCase() +
          ' ' + Object.values(row.dataset).join(' ').toLowerCase();
        const ok =
          keywords.every(kw => text.includes(kw)) &&
          (!activeFlow || row.dataset.status === activeFlow) &&
          (!start || (date && date >= start)) &&
          (!end || (date && date <= end));

        row.hidden = !ok;
        if (ok) visible += 1;
      });

      // 无匹配（或本无数据）时显示空状态行
      const emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    // 关键词输入 / 日期变更即筛（免点击查询按钮）
    nameInput.addEventListener('input', () => applyFilter());
    startInput.addEventListener('change', () => applyFilter());
    endInput.addEventListener('change', () => applyFilter());

    // 提交：阻止表单默认提交（保留回车触发过滤）
    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    // 重置：清空条件并回到「全部」流程胶囊，随后恢复显示全部行
    form.addEventListener('reset', () => {
      resetFlowNav();
      // 等浏览器完成原生 reset 后再过滤
      requestAnimationFrame(() => applyFilter());
    });
  }

  // ===== 流程胶囊导航（履约全流程快捷过滤：全部 + 6 个状态）=====
  function initFlowNav() {
    const nav = document.getElementById('flowNav');
    if (!nav) return;

    // 点击胶囊切换过滤状态（事件委托）
    nav.addEventListener('click', e => {
      const pill = e.target.closest('.pill[data-flow]');
      if (!pill) return;
      activeFlow = pill.dataset.flow || '';
      nav.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p === pill));
      if (applyFilter) applyFilter();
    });
  }

  // 重置胶囊到「全部」
  function resetFlowNav() {
    activeFlow = '';
    const nav = document.getElementById('flowNav');
    if (!nav) return;
    nav.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', !p.dataset.flow));
  }

  // ===== 订单列表：数据驱动渲染 =====
  const tbody = document.querySelector('.ledger-table tbody');

  // 按当前 DOM 顺序重排：删除中间行后自动前移补齐
  function renumber() {
    let i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => {
      row.querySelector('.col-index').textContent = ++i;
    });
  }

  // ----- 分页（基于检索后的可见行切片显示） -----
  let pageSize = 10;   // 每页条数
  let curPage = 1;     // 当前页码

  function renderPage() {
    const $ = id => document.getElementById(id);
    // 只对「检索后可见」的数据行分页（空状态行不参与）
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)')).filter(r => !r.hidden);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    const start = (curPage - 1) * pageSize;
    rows.forEach((r, i) => {
      r.hidden = i < start || i >= start + pageSize;
    });

    // 同步分页控件状态
    $('pagerTotal').textContent = total;
    $('pgPages').textContent = pages;
    $('pgInput').value = curPage;
    $('pgInput').max = pages;
    $('pgFirst').disabled = curPage <= 1;
    $('pgPrev').disabled = curPage <= 1;
    $('pgNext').disabled = curPage >= pages;
    $('pgLast').disabled = curPage >= pages;
  }

  function bindPager() {
    const $ = id => document.getElementById(id);
    const pages = () => Math.max(1, Number($('pgPages').textContent) || 1);
    const go = p => { curPage = p; renderPage(); };

    $('pgFirst').addEventListener('click', () => go(1));
    $('pgPrev').addEventListener('click', () => go(curPage - 1));
    $('pgNext').addEventListener('click', () => go(curPage + 1));
    $('pgLast').addEventListener('click', () => go(pages()));

    // 每页条数切换：回到第 1 页
    $('pageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    // 页码输入跳转：change 或回车触发，越界自动纠正
    const jump = () => {
      let p = parseInt($('pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('pgInput').addEventListener('change', jump);
    $('pgInput').addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });
  }

  // ----- 统计：列表小标题 + 概览条 + 流程胶囊计数（数据来源：orders 数组） -----
  function updateStats() {
    let amountSum = 0;
    let running = 0;
    let done = 0;
    orders.forEach(o => {
      amountSum += Number(o.amount) || 0;
      if (o.status === '执行中' || o.status === '已发运') running += 1;
      if (o.status === '已完成') done += 1;
    });

    document.getElementById('orderCount').textContent = orders.length;
    document.getElementById('orderAmount').textContent = fmtAmount(amountSum);
    document.getElementById('tTotal').textContent = orders.length;
    document.getElementById('tRunning').textContent = running;
    document.getElementById('tDone').textContent = done;
    document.getElementById('tAmount').textContent = '¥' + fmtAmount(amountSum);

    // 履约完成率 = 已完成 / 全部订单
    const rate = orders.length ? Math.round(done / orders.length * 100) : 0;
    const bar = document.getElementById('ovDoneBar');
    if (bar) bar.style.width = rate + '%';
    const rateEl = document.getElementById('ovDoneRate');
    if (rateEl) rateEl.textContent = rate + '%';

    // 流程胶囊计数：全部 + 各状态订单数
    document.querySelectorAll('#flowNav .pill[data-flow]').forEach(pill => {
      const f = pill.dataset.flow;
      const n = f ? orders.filter(o => o.status === f).length : orders.length;
      const c = pill.querySelector('.flow-count');
      if (c) c.textContent = n;
    });

    renderPage();
  }

  // 空状态行显示/隐藏
  function toggleEmptyRow() {
    const emptyRow = tbody.querySelector('.empty-row');
    const hasData = tbody.querySelectorAll('tr:not(.empty-row)').length > 0;
    if (emptyRow) emptyRow.hidden = hasData;
  }

  // 关联航次显示文案：按 voyage_id 回填航次号，关联缺失时显示 —
  function voyageText(o) {
    if (!o.voyage_id) return '';
    const v = voyageById[o.voyage_id];
    return v ? (v.voyage_code || '') : '';
  }

  // 由订单数据对象构造表格行（序号由 renumber 按位置统一编号）
  // 操作列：流转 / 编辑 / 终止 / 删除（已终止订单仅保留编辑 / 删除）
  function renderRow(o) {
    const tr = document.createElement('tr');
    tr.dataset.id = o.id;
    tr.dataset.order_code = o.order_code;
    tr.dataset.customer = o.customer;
    tr.dataset.cargo = o.cargo_name;
    tr.dataset.mine = o.mine_name;
    tr.dataset.status = o.status;
    tr.dataset.date = o.sign_date || '';
    tr.dataset.amount = o.amount || 0;

    const open = o.status !== biz.ORDER_TERMINAL;
    const cells = [
      '<td class="col-check"><input type="checkbox" class="row-check" title="选择该订单" /></td>',
      '<td class="col-index"></td>',
      '<td class="mono-code">' + esc(o.order_code) + '</td>',
      '<td>' + esc(o.contract_code || '—') + '</td>',
      '<td>' + esc(o.customer) + '</td>',
      '<td>' + esc(o.cargo_name || '—') + '</td>',
      '<td class="col-num">' + fmtQty(o.cargo_qty) + '</td>',
      '<td class="col-num">' + fmtAmount(o.amount) + '</td>',
      '<td>' + esc(o.mine_name || '—') + '</td>',
      '<td>' + esc(voyageText(o) || '—') + '</td>',
      '<td>' + statusTag(o.status) + stageDots(o.status) + '</td>',
      '<td class="col-date">' + esc(o.sign_date || '—') + '</td>',
      '<td class="col-detail"><a class="detail-link" href="javascript:void(0)">详情</a></td>',
      '<td class="col-action"><div class="cell-actions">' +
        (open ? '<button class="row-act advance" type="button">流转</button>' : '') +
        '<button class="row-act edit" type="button">编辑</button>' +
        (open ? '<button class="row-act terminal" type="button">终止</button>' : '') +
        '<button class="row-act del" type="button">删除</button>' +
      '</div></td>'
    ];
    tr.innerHTML = cells.join('');
    return tr;
  }

  // 按当前数据全量重建表格（新增/删除/编辑保存/流转后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => row.remove());
    orders.forEach(o => tbody.appendChild(renderRow(o)));
    // R4：合并视图——追加业务工作流创建阶段订单（orders-flow.js 提供，台账核心逻辑不变）
    if (window.HZFlowMerge && typeof window.HZFlowMerge.appendRows === 'function') {
      window.HZFlowMerge.appendRows(tbody);
    }
    renumber();
    updateStats();
    toggleEmptyRow();
    if (applyFilter) applyFilter();
    // 通知履约层（orders-flow.js）：表格已重建，刷新管道与胶囊计数
    document.dispatchEvent(new CustomEvent('hz:orders-rendered'));
  }

  // R4：供 orders-flow.js 在流程订单删除后触发台账全量重渲
  window.HZLedgerRefresh = renderAll;

  // ===== 抽屉（详情 / 新增 / 编辑 / 流转，内容动态渲染） =====
  let currentId = null; // 当前抽屉对应的订单 id

  function showDrawer(title, html) {
    currentId = null;
    document.getElementById('drawerTitle').textContent = title;
    const body = document.getElementById('drawerBody');
    body.innerHTML = html;
    body.scrollTop = 0; // 二次打开重置滚动
    document.getElementById('drawerMask').hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawerMask').hidden = true;
    currentId = null;
  }

  function byId(id) {
    return orders.find(o => o.id === id) || null;
  }

  // 订单详情抽屉：基本信息（info-grid）+ 流转记录（timeline）
  function openDetailDrawer(id) {
    const o = byId(id);
    if (!o) return;
    currentId = id;

    const trips = Array.isArray(o.trip_ids) ? o.trip_ids : [];
    const info = [
      ['订单编号', esc(o.order_code)],
      ['订单状态', statusTag(o.status)],
      ['合同编号', esc(o.contract_code || '—')],
      ['客户', esc(o.customer || '—')],
      ['货物名称', esc(o.cargo_name || '—')],
      ['货量（吨）', fmtQty(o.cargo_qty)],
      ['订单金额（元）', fmtAmount(o.amount)],
      ['货源矿山', esc(o.mine_name || '—')],
      ['关联航次', esc(voyageText(o) || '—')],
      ['关联车次', trips.length ? esc(trips.join('、')) : '—'],
      ['签订日期', esc(o.sign_date || '—')],
      ['计划完成日期', esc(o.plan_end_date || '—')],
      ['备注', esc(o.remark || '—')]
    ].map(item =>
      '<div class="info-item span2">' +
        '<span class="info-label">' + item[0] + '</span>' +
        '<span class="info-value">' + item[1] + '</span>' +
      '</div>'
    ).join('');

    // 流转记录：取该订单日志（最新在前），时间线呈现
    const logs = biz.loadLogs().filter(l => l.order_id === id);
    const timeline = logs.map(l =>
      '<div class="timeline-item done">' +
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-body">' +
          '<div class="timeline-title">' +
            (l.from_status ? esc(l.from_status) + ' → ' + esc(l.to_status) : '创建订单（' + esc(l.to_status) + '）') +
          '</div>' +
          '<div class="timeline-time">' + esc(fmtDate(l.time)) + ' · ' + esc(l.operator || '—') + '</div>' +
          (l.remark ? '<div class="timeline-desc">' + esc(l.remark) + '</div>' : '') +
        '</div>' +
      '</div>'
    ).join('');

    const html =
      '<div class="drawer-section">' +
        '<div class="section-title">基本信息</div>' +
        '<div class="info-grid">' + info + '</div>' +
      '</div>' +
      '<div class="drawer-section">' +
        '<div class="section-title">流转记录</div>' +
        (timeline ? '<div class="timeline">' + timeline + '</div>' : '<div class="form-tip muted">暂无流转记录</div>') +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="close">关闭</button>' +
      '</div>';

    showDrawer('订单详情 · ' + (o.order_code || ''), html);
  }

  // 日期格式化：时间戳 → YYYY-MM-DD
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // ----- 新增 / 编辑抽屉表单 -----
  // 正在编辑的订单 id；null 表示正在新增
  let editingId = null;

  // 选项构造
  function options(arr, selected) {
    return arr.map(v =>
      '<option value="' + esc(v.value) + '"' + (v.value === selected ? ' selected' : '') + '>' + esc(v.label) + '</option>'
    ).join('');
  }

  function openFormDrawer(id) {
    const isEdit = !!id;
    const o = isEdit ? byId(id) : null;
    if (id && !o) return;
    editingId = id || null;
    currentId = id || null;

    // 编号：新增自动生成（只读），编辑沿用原编号（只读）
    const orderCode = isEdit ? o.order_code : biz.nextOrderCode(orders);
    const contractOpts = [{ value: '', label: '请选择合同' }].concat(
      contracts.map(c => ({ value: c.id, label: (c.code || '') + ' ' + (c.name || '') }))
    );
    const mineOpts = [{ value: '', label: '无' }].concat(
      mines.map(m => ({ value: m.id, label: m.short_name || m.mine_name }))
    );

    const html =
      (isEdit ? '' : '<div class="form-tip info">订单编号按「HZ + 日期 + 流水」规则自动生成，保存后不可修改</div>') +
      '<div class="form-tip" id="formError" hidden></div>' +
      '<div class="form-grid">' +
        '<div class="form-item">' +
          '<label class="field-label" for="fCode">订单编号 <i class="required">*</i></label>' +
          '<input class="field-input" type="text" id="fCode" value="' + esc(orderCode) + '" readonly />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fContract">关联合同 <i class="required">*</i></label>' +
          '<select class="field-input" id="fContract">' + options(contractOpts, isEdit ? o.contract_id : '') + '</select>' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fContractCode">合同编号</label>' +
          '<input class="field-input" type="text" id="fContractCode" value="' + esc(isEdit ? (o.contract_code || '') : '') + '" readonly placeholder="选择合同后自动带出" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fCustomer">客户 <i class="required">*</i></label>' +
          '<input class="field-input" type="text" id="fCustomer" value="' + esc(isEdit ? (o.customer || '') : '') + '" placeholder="输入客户名称" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fCargo">货物名称</label>' +
          '<input class="field-input" type="text" id="fCargo" value="' + esc(isEdit ? (o.cargo_name || '') : '') + '" placeholder="输入货物名称" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fQty">货量（吨）</label>' +
          '<input class="field-input" type="number" min="0" step="1" id="fQty" value="' + esc(isEdit ? (o.cargo_qty == null ? '' : o.cargo_qty) : '') + '" placeholder="0" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fAmount">订单金额（元） <i class="required">*</i></label>' +
          '<input class="field-input" type="number" min="0" step="0.01" id="fAmount" value="' + esc(isEdit ? (o.amount == null ? '' : o.amount) : '') + '" placeholder="0.00" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fMine">货源矿山</label>' +
          '<select class="field-input" id="fMine">' + options(mineOpts, isEdit ? (o.mine_id || '') : '') + '</select>' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fSign">签订日期 <i class="required">*</i></label>' +
          '<input class="field-input" type="date" id="fSign" value="' + esc(isEdit ? (o.sign_date || '') : '') + '" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fPlan">计划完成日期</label>' +
          '<input class="field-input" type="date" id="fPlan" value="' + esc(isEdit ? (o.plan_end_date || '') : '') + '" />' +
        '</div>' +
        '<div class="form-item span2">' +
          '<label class="field-label" for="fRemark">备注</label>' +
          '<textarea class="field-input" id="fRemark" rows="3" placeholder="订单补充说明（可空）">' + esc(isEdit ? (o.remark || '') : '') + '</textarea>' +
        '</div>' +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-act="save">保存</button>' +
      '</div>';

    showDrawer(isEdit ? '编辑订单 · ' + (o.order_code || '') : '新增订单', html);

    // 合同联动：选择合同后带出合同编号 / 客户 / 金额默认值
    document.getElementById('fContract').addEventListener('change', e => {
      const c = contractById[e.target.value];
      if (!c) {
        document.getElementById('fContractCode').value = '';
        return;
      }
      document.getElementById('fContractCode').value = c.code || '';
      if (c.partyB) document.getElementById('fCustomer').value = c.partyB;
      if (Number(c.amount) > 0) document.getElementById('fAmount').value = c.amount;
    });
  }

  // 保存新增 / 编辑：校验必填项后写回数据并持久化
  function saveForm() {
    const code = document.getElementById('fCode').value.trim();
    const contractId = document.getElementById('fContract').value;
    const customer = document.getElementById('fCustomer').value.trim();
    const amount = Number(document.getElementById('fAmount').value) || 0;
    const signDate = document.getElementById('fSign').value;

    // 必填校验：合同 / 客户 / 订单金额（> 0）/ 签订日期
    const missing = [];
    if (!contractId) missing.push('关联合同');
    if (!customer) missing.push('客户');
    if (amount <= 0) missing.push('订单金额（需大于 0）');
    if (!signDate) missing.push('签订日期');

    const tip = document.getElementById('formError');
    if (missing.length) {
      if (tip) {
        tip.textContent = '请完善必填项：' + missing.join('、');
        tip.hidden = false;
        tip.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (tip) tip.hidden = true;

    const contract = contractById[contractId] || {};
    const mineId = document.getElementById('fMine').value;
    const mine = mines.find(m => m.id === mineId) || null;

    if (editingId) {
      // 编辑：更新既有订单（编号与状态不变，不写流转日志）
      const old = byId(editingId);
      if (!old) return;
      Object.assign(old, {
        contract_id: contractId,
        contract_code: contract.code || '',
        mine_id: mine ? mine.id : '',
        mine_name: mine ? (mine.short_name || mine.mine_name) : '',
        customer: customer,
        cargo_name: document.getElementById('fCargo').value.trim(),
        cargo_qty: Number(document.getElementById('fQty').value) || 0,
        amount: amount,
        sign_date: signDate,
        plan_end_date: document.getElementById('fPlan').value,
        remark: document.getElementById('fRemark').value.trim(),
        updated_at: Date.now()
      });
    } else {
      // 新增：初始状态「待确认」，编号沿用抽屉打开时生成的只读值
      const o = {
        id: genId(),
        order_code: code,
        contract_id: contractId,
        contract_code: contract.code || '',
        mine_id: mine ? mine.id : '',
        mine_name: mine ? (mine.short_name || mine.mine_name) : '',
        voyage_id: '',
        trip_ids: [],
        customer: customer,
        cargo_name: document.getElementById('fCargo').value.trim(),
        cargo_qty: Number(document.getElementById('fQty').value) || 0,
        amount: amount,
        sign_date: signDate,
        plan_end_date: document.getElementById('fPlan').value,
        status: biz.ORDER_FLOW[0],
        remark: document.getElementById('fRemark').value.trim(),
        created_by: OPERATOR,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      orders.push(o);
      // 建单即记录初始化日志，与流转链保持一致
      biz.pushLog({
        id: genLogId(),
        order_id: o.id,
        from_status: '',
        to_status: o.status,
        operator: OPERATOR,
        time: Date.now(),
        remark: '新增订单'
      });
    }

    if (!biz.saveOrders(orders)) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    closeDrawer();
    renderAll();
  }

  // ----- 订单流转抽屉：目标状态单选（合法流转目标）+ 备注 -----
  function openFlowDrawer(id) {
    const o = byId(id);
    if (!o) return;
    currentId = id;

    const targets = biz.nextOrderStatuses(o.status);
    if (!targets.length) {
      alert('订单已终止，不可再流转');
      return;
    }

    const radios = targets.map((to, i) =>
      '<label class="form-item flow-option">' +
        '<input type="radio" name="flowTo" value="' + esc(to) + '"' + (i === 0 ? ' checked' : '') + ' />' +
        '<span>' + (to === biz.ORDER_TERMINAL ? esc(to) + '（终态，不可恢复）' : '推进至「' + esc(to) + '」') + '</span>' +
      '</label>'
    ).join('');

    const html =
      '<div class="drawer-section">' +
        '<div class="section-title">当前状态</div>' +
        '<div>' + statusTag(o.status) + '</div>' +
      '</div>' +
      '<div class="drawer-section">' +
        '<div class="section-title">流转目标</div>' +
        '<div class="form-tip" id="flowError" hidden></div>' +
        radios +
      '</div>' +
      '<div class="drawer-section">' +
        '<div class="form-item">' +
          '<label class="field-label" for="flowRemark">流转备注</label>' +
          '<textarea class="field-input" id="flowRemark" rows="3" placeholder="流转原因 / 说明（可空）"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-act="confirm">确认流转</button>' +
      '</div>';

    showDrawer('订单流转 · ' + (o.order_code || ''), html);
  }

  // 确认流转：校验状态机合法性 → 更新状态 → 写流转日志
  function confirmFlow() {
    const o = byId(currentId);
    if (!o) return;

    const to = (document.querySelector('input[name="flowTo"]:checked') || {}).value;
    const tip = document.getElementById('flowError');
    if (!to || !biz.canTransitionOrder(o.status, to)) {
      if (tip) {
        tip.textContent = '当前状态不允许流转至所选状态，请重新选择';
        tip.hidden = false;
      }
      return;
    }

    const from = o.status;
    o.status = to;
    o.updated_at = Date.now();
    if (!biz.pushLog({
      id: genLogId(),
      order_id: o.id,
      from_status: from,
      to_status: to,
      operator: OPERATOR,
      time: Date.now(),
      remark: document.getElementById('flowRemark').value.trim()
    })) {
      alert('本地存储空间不足，流转日志未能保存，请清理后重试');
      return;
    }
    if (!biz.saveOrders(orders)) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    closeDrawer();
    renderAll();
  }

  // 终止订单：确认后置为终态并写日志
  function terminateOrder(id) {
    const o = byId(id);
    if (!o) return;
    if (!biz.canTransitionOrder(o.status, biz.ORDER_TERMINAL)) {
      alert('订单已终止，不可重复操作');
      return;
    }
    if (!confirm('确定终止订单「' + (o.order_code || '') + '」吗？终止后不可恢复。')) return;

    const from = o.status;
    o.status = biz.ORDER_TERMINAL;
    o.updated_at = Date.now();
    biz.pushLog({
      id: genLogId(),
      order_id: o.id,
      from_status: from,
      to_status: biz.ORDER_TERMINAL,
      operator: OPERATOR,
      time: Date.now(),
      remark: '终止订单'
    });
    if (!biz.saveOrders(orders)) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    renderAll();
  }

  // 删除订单：确认后移除订单并级联清除流转日志
  function deleteOrder(id) {
    const o = byId(id);
    if (!o) return;
    if (!confirm('确定删除订单「' + (o.order_code || '') + '」吗？关联流转日志将一并清除。')) return;

    if (currentId === id) closeDrawer();
    orders = orders.filter(x => x.id !== id);
    biz.saveLogs(biz.loadLogs().filter(l => l.order_id !== id));
    if (!biz.saveOrders(orders)) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    renderAll();
  }

  // ===== 抽屉基础事件：关闭 / 动态按钮（事件委托） =====
  function initDrawer() {
    const mask = document.getElementById('drawerMask');
    if (!mask) return;

    // 关闭：右上角 × / 点击遮罩空白处 / ESC 键
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    mask.addEventListener('click', e => {
      if (e.target === mask) closeDrawer();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !mask.hidden) closeDrawer();
    });

    // 动态渲染的按钮：取消 / 保存 / 确认流转 / 关闭（事件委托）
    mask.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;

      if (btn.dataset.act === 'cancel' || btn.dataset.act === 'close') {
        closeDrawer();
      } else if (btn.dataset.act === 'save') {
        saveForm();
      } else if (btn.dataset.act === 'confirm') {
        confirmFlow();
      }
    });
  }

  // ===== 表格操作：详情 / 流转 / 编辑 / 终止 / 删除（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      // 详情：打开详情抽屉
      if (e.target.closest('.detail-link')) {
        openDetailDrawer(id);
        return;
      }

      // 流转：打开流转抽屉
      if (e.target.closest('.row-act.advance')) {
        openFlowDrawer(id);
        return;
      }

      // 编辑：打开编辑抽屉表单
      if (e.target.closest('.row-act.edit')) {
        openFormDrawer(id);
        return;
      }

      // 终止：确认后置为终态
      if (e.target.closest('.row-act.terminal')) {
        terminateOrder(id);
        return;
      }

      // 删除：确认后移除并级联清日志
      if (e.target.closest('.row-act.del')) {
        deleteOrder(id);
      }
    });
  }

  // ----- 导出 Excel：勾选则批量导出所选，未勾选导出全部（SheetJS 生成 .xlsx） -----
  function initExport() {
    const btn = document.getElementById('exportBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!orders.length) {
        alert('暂无订单数据可导出');
        return;
      }
      if (!window.XLSX) {
        alert('导出组件加载失败，请刷新页面后重试');
        return;
      }

      // 批量：读取勾选行；未勾选任何行则导出全部
      const checkedIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        const cb = row.querySelector('.row-check');
        if (cb && cb.checked) checkedIds.push(row.dataset.id);
      });

      const list = checkedIds.length
        ? checkedIds.map(id => byId(id)).filter(Boolean)
        : orders;

      if (!list.length) {
        alert('暂无订单数据可导出');
        return;
      }

      const scope = checkedIds.length ? '已选 ' + checkedIds.length + ' 单订单' : '全部 ' + orders.length + ' 单订单';
      if (!confirm('将导出' + scope + '，是否继续？')) return;

      const headers = [
        '序号', '订单编号', '合同编号', '客户', '货物名称',
        '货量（吨）', '订单金额（元）', '货源矿山', '关联航次', '关联车次',
        '订单状态', '签订日期', '计划完成日期', '备注'
      ];

      const rows = list.map((o, i) => [
        i + 1,
        o.order_code, o.contract_code, o.customer, o.cargo_name,
        Number(o.cargo_qty || 0), Number(o.amount || 0),
        o.mine_name, voyageText(o), (Array.isArray(o.trip_ids) ? o.trip_ids.join('、') : ''),
        o.status, o.sign_date, o.plan_end_date, o.remark
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));

      // 列宽设置（字符数）
      ws['!cols'] = [
        { wch: 6 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
        { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 24 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '订单台账');

      const d = new Date();
      const stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '订单台账_' + stamp + '.xlsx');
    });
  }

  // ----- 批量选择：表头全选（仅作用于当前可见行）-----
  function initCheckAll() {
    const checkAll = document.getElementById('checkAll');
    if (!checkAll) return;

    checkAll.addEventListener('change', () => {
      const checked = checkAll.checked;
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (row.hidden) return; // 被检索过滤的行不参与全选
        const cb = row.querySelector('.row-check');
        if (cb) cb.checked = checked;
      });
    });

    // 行勾选变化时同步全选框状态
    tbody.addEventListener('change', e => {
      if (!e.target.classList || !e.target.classList.contains('row-check')) return;

      const boxes = [];
      let allChecked = true;
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (row.hidden) return;
        const cb = row.querySelector('.row-check');
        if (cb) {
          boxes.push(cb);
          if (!cb.checked) allChecked = false;
        }
      });
      checkAll.checked = boxes.length > 0 && allChecked;
    });
  }

  // ===== 初始化 =====
  function initAdd() {
    const addBtn = document.getElementById('addOrderBtn');
    if (addBtn) addBtn.addEventListener('click', () => openFormDrawer(null));
  }

  initSearch();
  initFlowNav();
  initAdd();
  initTableActions();
  initDrawer();
  initExport();
  initCheckAll();
  bindPager();
  renderAll(); // 启动时从 localStorage 恢复订单数据
})();
