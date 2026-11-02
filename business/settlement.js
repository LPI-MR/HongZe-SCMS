// ===== 结算管理模块脚本 =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责结算台账的检索、渲染、新增、收付登记与删除
// 结算数据走共享数据层（business-data.js）：订单台账 / 执行跟踪 / 结算管理共用同一份 localStorage 数据
// 页面布局：收付双轨概览条 + 卡片内轻检索工具条（输入即筛）+ 结算台账表格
(function () {
  'use strict';

  // 本页对应的导航位置：业务管理 → 结算管理
  const NAV_PATH = '业务管理';
  const NAV_SUB = NAV_PATH + ' / 结算管理';

  // 设置导航栏选中态：一级「业务管理」高亮并展开，二级「结算管理」高亮
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

  // 订单列表：新增结算时联动选择
  let orders = biz.loadOrders();
  const orderById = {};
  orders.forEach(o => { orderById[o.id] = o; });

  // 结算列表：[{id, settle_code, order_id, order_code, contract_id, contract_code,
  //   customer, type, amount, received, paid, settle_date, status, remark,
  //   created_at, updated_at}]
  let settlements = biz.loadSettlements();

  // 状态标签类名映射（business.css 结算状态变体，已终止与订单共用）
  const STATUS_CLS = {
    '待结算': 'unsettled',
    '部分结算': 'partial',
    '已结算': 'settled',
    '已终止': 'terminated'
  };

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

  function genId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function statusTag(status) {
    return '<span class="status-tag ' + esc(STATUS_CLS[status] || '') + '">' + esc(status) + '</span>';
  }

  // 类型标签：应收 / 应付（文本展示）
  function typeText(type) {
    return esc(type || '—');
  }

  // ===== 结算检索 =====
  // 数据行约定：tbody 中每条结算为一行，携带 data-* 属性——
  //   data-id（唯一标识）、data-type、data-status、data-date（结算日期 YYYY-MM-DD）
  // 空状态行使用 class="empty-row"，不参与过滤
  let applyFilter = null; // 供增删登记后重新应用检索条件

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const nameInput = document.getElementById('searchKeyword');
    const typeSelect = document.getElementById('searchType');
    const statusSelect = document.getElementById('searchStatus');
    const startInput = document.getElementById('searchDateStart');
    const endInput = document.getElementById('searchDateEnd');

    // 按当前检索条件过滤表格行；无匹配时显示空状态行
    applyFilter = function () {
      const type = typeSelect.value;
      const status = statusSelect.value;
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
          (!type || row.dataset.type === type) &&
          (!status || row.dataset.status === status) &&
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

    // 关键词输入 / 类型 / 状态切换 / 日期变更即筛（免点击查询按钮）
    nameInput.addEventListener('input', () => applyFilter());
    typeSelect.addEventListener('change', () => applyFilter());
    statusSelect.addEventListener('change', () => applyFilter());
    startInput.addEventListener('change', () => applyFilter());
    endInput.addEventListener('change', () => applyFilter());

    // 查询：阻止表单默认提交，执行过滤
    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    // 重置：清空条件后恢复显示全部行
    form.addEventListener('reset', () => {
      // 等浏览器完成原生 reset 后再过滤
      requestAnimationFrame(() => applyFilter());
    });
  }

  // ===== 结算列表：数据驱动渲染 =====
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

  // ----- 统计：列表小标题 + 收付双轨概览条（数据来源：settlements 数组） -----
  function updateStats() {
    let countAmount = 0;
    let receivable = 0;   // 应收总额（未含已终止）
    let received = 0;     // 应收累计收款
    let payable = 0;      // 应付总额（未含已终止）
    let paid = 0;         // 应付累计付款

    settlements.forEach(s => {
      countAmount += Number(s.amount) || 0;
      if (s.status === '已终止') return;

      if (s.type === '应收') {
        receivable += Number(s.amount) || 0;
        received += Number(s.received) || 0;
      } else if (s.type === '应付') {
        payable += Number(s.amount) || 0;
        paid += Number(s.paid) || 0;
      }
    });

    document.getElementById('settleCount').textContent = settlements.length;
    document.getElementById('settleAmount').textContent = fmtAmount(countAmount);
    document.getElementById('sReceivable').textContent = '¥' + fmtAmount(receivable);
    document.getElementById('sReceived').textContent = '¥' + fmtAmount(received);
    document.getElementById('sPayable').textContent = '¥' + fmtAmount(payable);
    document.getElementById('sPaid').textContent = '¥' + fmtAmount(paid);

    // 概览条：应收轨回款进度 + 应付轨付款进度
    const recvRate = receivable ? Math.round(received / receivable * 100) : 0;
    const payRate = payable ? Math.round(paid / payable * 100) : 0;
    const recvBar = document.getElementById('ovRecvBar');
    if (recvBar) recvBar.style.width = Math.min(recvRate, 100) + '%';
    const payBar = document.getElementById('ovPayBar');
    if (payBar) payBar.style.width = Math.min(payRate, 100) + '%';
    const recvRateEl = document.getElementById('ovRecvRate');
    if (recvRateEl) recvRateEl.textContent = recvRate + '%';
    const payRateEl = document.getElementById('ovPayRate');
    if (payRateEl) payRateEl.textContent = payRate + '%';

    renderPage();
  }

  // 空状态行显示/隐藏
  function toggleEmptyRow() {
    const emptyRow = tbody.querySelector('.empty-row');
    const hasData = tbody.querySelectorAll('tr:not(.empty-row)').length > 0;
    if (emptyRow) emptyRow.hidden = hasData;
  }

  // 由结算数据对象构造表格行（序号由 renumber 按位置统一编号）
  // 操作列：收付登记 / 删除（已终止结算仅保留删除）
  function renderRow(s) {
    const tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.dataset.settle_code = s.settle_code;
    tr.dataset.order_code = s.order_code;
    tr.dataset.customer = s.customer;
    tr.dataset.type = s.type;
    tr.dataset.status = s.status;
    tr.dataset.date = s.settle_date || '';
    tr.dataset.amount = s.amount || 0;

    const open = s.status !== '已终止';
    const cells = [
      '<td class="col-check"><input type="checkbox" class="row-check" title="选择该结算" /></td>',
      '<td class="col-index"></td>',
      '<td>' + esc(s.settle_code) + '</td>',
      '<td>' + typeText(s.type) + '</td>',
      '<td>' + esc(s.order_code || '—') + '</td>',
      '<td>' + esc(s.contract_code || '—') + '</td>',
      '<td>' + esc(s.customer || '—') + '</td>',
      '<td class="col-num">' + fmtAmount(s.amount) + '</td>',
      '<td class="col-num">' + fmtAmount(s.received) + '</td>',
      '<td class="col-num">' + fmtAmount(s.paid) + '</td>',
      '<td class="col-date">' + esc(s.settle_date || '—') + '</td>',
      '<td>' + statusTag(s.status) + '</td>',
      '<td class="col-detail"><a class="detail-link" href="javascript:void(0)">详情</a></td>',
      '<td class="col-action"><div class="cell-actions">' +
        (open ? '<button class="row-act register" type="button">收付登记</button>' : '') +
        '<button class="row-act del" type="button">删除</button>' +
      '</div></td>'
    ];
    tr.innerHTML = cells.join('');
    return tr;
  }

  // 按当前数据全量重建表格（新增/删除/登记后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => row.remove());
    settlements.forEach(s => tbody.appendChild(renderRow(s)));
    renumber();
    updateStats();
    toggleEmptyRow();
    if (applyFilter) applyFilter();
  }

  // ===== 抽屉（详情 / 新增 / 收付登记，内容动态渲染） =====
  let currentId = null; // 当前抽屉对应的结算 id

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
    return settlements.find(s => s.id === id) || null;
  }

  // 结算详情抽屉：基本信息（info-grid）
  function openDetailDrawer(id) {
    const s = byId(id);
    if (!s) return;
    currentId = id;

    const info = [
      ['结算编号', esc(s.settle_code)],
      ['结算状态', statusTag(s.status)],
      ['结算类型', typeText(s.type)],
      ['关联订单', esc(s.order_code || '—')],
      ['合同编号', esc(s.contract_code || '—')],
      ['客户', esc(s.customer || '—')],
      ['结算金额（元）', fmtAmount(s.amount)],
      ['已收金额（元）', fmtAmount(s.received)],
      ['已付金额（元）', fmtAmount(s.paid)],
      ['剩余未结（元）', fmtAmount(remainOf(s))],
      ['结算日期', esc(s.settle_date || '—')],
      ['备注', esc(s.remark || '—')]
    ].map(item =>
      '<div class="info-item span2">' +
        '<span class="info-label">' + item[0] + '</span>' +
        '<span class="info-value">' + item[1] + '</span>' +
      '</div>'
    ).join('');

    const html =
      '<div class="drawer-section">' +
        '<div class="section-title">基本信息</div>' +
        '<div class="info-grid">' + info + '</div>' +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="close">关闭</button>' +
      '</div>';

    showDrawer('结算详情 · ' + (s.settle_code || ''), html);
  }

  // 剩余未结：结算金额 - 对应方向累计
  function remainOf(s) {
    const acc = Number(s.type === '应收' ? s.received : s.paid) || 0;
    return (Number(s.amount) || 0) - acc;
  }

  // ----- 新增结算抽屉表单 -----
  // 选项构造
  function options(arr, selected) {
    return arr.map(v =>
      '<option value="' + esc(v.value) + '"' + (v.value === selected ? ' selected' : '') + '>' + esc(v.label) + '</option>'
    ).join('');
  }

  function openFormDrawer() {
    currentId = null;

    const orderOpts = [{ value: '', label: '请选择订单' }].concat(
      orders.map(o => ({ value: o.id, label: (o.order_code || '') + ' ' + (o.customer || '') }))
    );
    const typeOpts = biz.SETTLE_TYPES.map(t => ({ value: t, label: t }));

    const html =
      '<div class="form-tip info">结算编号按「SK + 日期 + 流水」规则自动生成，保存后不可修改；选择订单后自动带出客户与金额默认值</div>' +
      '<div class="form-tip" id="formError" hidden></div>' +
      '<div class="form-grid">' +
        '<div class="form-item">' +
          '<label class="field-label" for="fCode">结算编号 <i class="required">*</i></label>' +
          '<input class="field-input" type="text" id="fCode" value="' + esc(biz.nextSettleCode(settlements)) + '" readonly />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fOrder">关联订单 <i class="required">*</i></label>' +
          '<select class="field-input" id="fOrder">' + options(orderOpts, '') + '</select>' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fOrderCode">订单编号</label>' +
          '<input class="field-input" type="text" id="fOrderCode" value="" readonly placeholder="选择订单后自动带出" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fCustomer">客户</label>' +
          '<input class="field-input" type="text" id="fCustomer" value="" readonly placeholder="选择订单后自动带出" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fType">结算类型 <i class="required">*</i></label>' +
          '<select class="field-input" id="fType">' + options(typeOpts, '') + '</select>' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fAmount">结算金额（元） <i class="required">*</i></label>' +
          '<input class="field-input" type="number" min="0" step="0.01" id="fAmount" placeholder="0.00" />' +
        '</div>' +
        '<div class="form-item">' +
          '<label class="field-label" for="fSettleDate">结算日期 <i class="required">*</i></label>' +
          '<input class="field-input" type="date" id="fSettleDate" />' +
        '</div>' +
        '<div class="form-item span2">' +
          '<label class="field-label" for="fRemark">备注</label>' +
          '<textarea class="field-input" id="fRemark" rows="3" placeholder="结算补充说明（可空）"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-act="save">保存</button>' +
      '</div>';

    showDrawer('新增结算', html);

    // 订单联动：选择订单后带出订单号 / 客户 / 金额默认值
    document.getElementById('fOrder').addEventListener('change', e => {
      const o = orderById[e.target.value];
      if (!o) {
        document.getElementById('fOrderCode').value = '';
        document.getElementById('fCustomer').value = '';
        return;
      }
      document.getElementById('fOrderCode').value = o.order_code || '';
      document.getElementById('fCustomer').value = o.customer || '';
      if (Number(o.amount) > 0) document.getElementById('fAmount').value = o.amount;
    });
  }

  // 保存新增：校验必填项后写回数据并持久化（初始状态由金额与累计自动判定，为待结算）
  function saveForm() {
    const code = document.getElementById('fCode').value.trim();
    const orderId = document.getElementById('fOrder').value;
    const type = document.getElementById('fType').value;
    const amount = Number(document.getElementById('fAmount').value) || 0;
    const settleDate = document.getElementById('fSettleDate').value;

    // 必填校验：关联订单 / 结算类型 / 结算金额（> 0）/ 结算日期
    const missing = [];
    if (!orderId) missing.push('关联订单');
    if (!type) missing.push('结算类型');
    if (amount <= 0) missing.push('结算金额（需大于 0）');
    if (!settleDate) missing.push('结算日期');

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

    const order = orderById[orderId] || {};

    const s = {
      id: genId(),
      settle_code: code,
      order_id: orderId,
      order_code: order.order_code || '',
      contract_id: order.contract_id || '',
      contract_code: order.contract_code || '',
      customer: order.customer || '',
      type: type,
      amount: amount,
      received: 0,
      paid: 0,
      settle_date: settleDate,
      status: biz.calcSettleStatus(amount, 0),
      remark: document.getElementById('fRemark').value.trim(),
      created_at: Date.now(),
      updated_at: Date.now()
    };
    settlements.push(s);

    if (!biz.saveSettlements(settlements)) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    closeDrawer();
    renderAll();
  }

  // ----- 收付登记抽屉：按单据类型登记对应方向金额（pay-grid 并排输入） -----
  function openRegisterDrawer(id) {
    const s = byId(id);
    if (!s) return;
    if (s.status === '已终止') {
      alert('该结算已终止，不可登记收付款');
      return;
    }
    currentId = id;

    const isRecv = s.type === '应收';

    const info = [
      ['结算编号', esc(s.settle_code)],
      ['结算类型', typeText(s.type)],
      ['关联订单', esc(s.order_code || '—')],
      ['客户', esc(s.customer || '—')],
      ['结算金额（元）', fmtAmount(s.amount)],
      [isRecv ? '已收金额（元）' : '已付金额（元）', fmtAmount(isRecv ? s.received : s.paid)],
      ['剩余未结（元）', fmtAmount(remainOf(s))]
    ].map(item =>
      '<div class="info-item span2">' +
        '<span class="info-label">' + item[0] + '</span>' +
        '<span class="info-value">' + item[1] + '</span>' +
      '</div>'
    ).join('');

    const html =
      '<div class="drawer-section">' +
        '<div class="section-title">结算信息</div>' +
        '<div class="info-grid">' + info + '</div>' +
      '</div>' +
      '<div class="drawer-section">' +
        '<div class="section-title">本次登记</div>' +
        '<div class="form-tip info">' + (isRecv ? '应收单据登记收款，付款金额输入框已禁用' : '应付单据登记付款，收款金额输入框已禁用') + '</div>' +
        '<div class="form-tip" id="regError" hidden></div>' +
        '<div class="pay-grid">' +
          '<div class="pay-item">' +
            '<label class="field-label" for="fReceived">收款金额（元）</label>' +
            '<input class="field-input" type="number" min="0" step="0.01" id="fReceived" placeholder="0.00"' + (isRecv ? '' : ' disabled') + ' />' +
          '</div>' +
          '<div class="pay-item">' +
            '<label class="field-label" for="fPaid">付款金额（元）</label>' +
            '<input class="field-input" type="number" min="0" step="0.01" id="fPaid" placeholder="0.00"' + (isRecv ? ' disabled' : '') + ' />' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-ghost" type="button" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" type="button" data-act="confirm-register">确认登记</button>' +
      '</div>';

    showDrawer('收付登记 · ' + (s.settle_code || ''), html);
  }

  // 确认登记：金额 > 0，累计超结算金额时确认提示；登记后自动联动结算状态
  function confirmRegister() {
    const s = byId(currentId);
    if (!s) return;
    if (s.status === '已终止') {
      alert('该结算已终止，不可登记收付款');
      return;
    }

    const isRecv = s.type === '应收';
    const key = isRecv ? 'received' : 'paid';
    const amt = Number(document.getElementById(isRecv ? 'fReceived' : 'fPaid').value) || 0;

    const tip = document.getElementById('regError');
    if (amt <= 0) {
      if (tip) {
        tip.textContent = '登记金额需大于 0';
        tip.hidden = false;
      }
      return;
    }
    if (tip) tip.hidden = true;

    const accumulated = (Number(s[key]) || 0) + amt;

    // 累计超出结算金额：确认提示后允许继续（超出部分挂账）
    if (accumulated > Number(s.amount) &&
        !confirm('累计' + (isRecv ? '已收' : '已付') + '金额将超出结算金额，是否继续登记？')) {
      return;
    }

    s[key] = accumulated;
    s.status = biz.calcSettleStatus(s.amount, accumulated);
    s.updated_at = Date.now();

    if (!biz.saveSettlements(settlements)) {
      alert('本地存储空间不足，本次登记未能保存到浏览器。建议先「导出 Excel」备份数据后重试。');
      return;
    }

    closeDrawer();
    renderAll();
  }

  // 删除结算：确认后移除
  function deleteSettlement(id) {
    const s = byId(id);
    if (!s) return;
    if (!confirm('确定删除结算「' + (s.settle_code || '') + '」吗？')) return;

    if (currentId === id) closeDrawer();
    settlements = settlements.filter(x => x.id !== id);
    if (!biz.saveSettlements(settlements)) {
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

    // 动态渲染的按钮：取消 / 保存 / 确认登记 / 关闭（事件委托）
    mask.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;

      if (btn.dataset.act === 'cancel' || btn.dataset.act === 'close') {
        closeDrawer();
      } else if (btn.dataset.act === 'save') {
        saveForm();
      } else if (btn.dataset.act === 'confirm-register') {
        confirmRegister();
      }
    });
  }

  // ===== 表格操作：详情 / 收付登记 / 删除（事件委托） =====
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

      // 收付登记：打开登记抽屉
      if (e.target.closest('.row-act.register')) {
        openRegisterDrawer(id);
        return;
      }

      // 删除：确认后移除
      if (e.target.closest('.row-act.del')) {
        deleteSettlement(id);
      }
    });
  }

  // ----- 导出 Excel：勾选则批量导出所选，未勾选导出全部（SheetJS 生成 .xlsx） -----
  function initExport() {
    const btn = document.getElementById('exportBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!settlements.length) {
        alert('暂无结算数据可导出');
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
        : settlements;

      if (!list.length) {
        alert('暂无结算数据可导出');
        return;
      }

      const scope = checkedIds.length ? '已选 ' + checkedIds.length + ' 笔结算' : '全部 ' + settlements.length + ' 笔结算';
      if (!confirm('将导出' + scope + '，是否继续？')) return;

      const headers = [
        '序号', '结算编号', '结算类型', '关联订单', '合同编号', '客户',
        '结算金额（元）', '已收（元）', '已付（元）', '结算日期', '结算状态', '备注'
      ];

      const rows = list.map((s, i) => [
        i + 1,
        s.settle_code, s.type, s.order_code, s.contract_code, s.customer,
        Number(s.amount || 0), Number(s.received || 0), Number(s.paid || 0),
        s.settle_date, s.status, s.remark
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));

      // 列宽设置（字符数）
      ws['!cols'] = [
        { wch: 6 }, { wch: 15 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '结算管理');

      const d = new Date();
      const stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '结算管理_' + stamp + '.xlsx');
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
    const addBtn = document.getElementById('addSettleBtn');
    if (addBtn) addBtn.addEventListener('click', openFormDrawer);
  }

  initSearch();
  initAdd();
  initTableActions();
  initDrawer();
  initExport();
  initCheckAll();
  bindPager();
  renderAll(); // 启动时从 localStorage 恢复结算数据
})();
