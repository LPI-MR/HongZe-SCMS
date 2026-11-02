// ===== order-form 模块脚本（业务总览 · 订单录入页）=====
// 复刻 hongze_demo OrderFormPage：四折叠面板 + 校验 + 草稿自动保存 + 终端客户动态行
// 依赖 flow-data.js 提供的共享数据层
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '业务管理 / 业务总览';

  // 设置导航栏选中态：子项高亮 + 展开父级菜单（父按钮不具备独立停留态）
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

    const item = navbar.querySelector(`[data-path="${NAV_PATH}"]`);
    if (item) {
      item.classList.add('active');
      const group = item.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 页面状态 ==================== */

  const data = window.HZFlowData;
  const $ = id => document.getElementById(id);
  const els = {
    title: $('form-title'),
    sub: $('form-sub'),
    savedTip: $('saved-tip'),
    mineSelect: $('sel-mine'),
    mineOtherField: $('field-mine-other'),
    mineCustom: $('in-mine-custom'),
    custList: $('cust-list'),
    diffTip: $('diff-tip'),
    summaryCard: $('summary-card'),
    summaryGrid: $('summary-grid'),
    toast: $('toast'),
  };

  // 订单编号取自 URL：有则编辑态，无则新建态
  const id = new URLSearchParams(location.search).get('id') || '';
  const isEdit = !!id;

  // 数字字段：输入值转 Number；日期字段：datetime-local 与 ISO 互转
  const NUMERIC_FIELDS = ['cargoTotal', 'cargoPrice', 'draftMark'];
  const DATE_FIELDS = ['loadingStart', 'departure'];

  // 必填字段（来源矿山、终端客户、到港信息均为选填项）
  const REQUIRED_FIELDS = ['trader', 'traderContact', 'traderContactInfo', 'cargoName', 'cargoTotal', 'cargoPrice', 'cargoQuality'];

  function makeCustomer() {
    return {
      id: 'cust_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: '',
      qty: 0,
    };
  }

  function emptyOrder(orderId) {
    const now = new Date().toISOString();
    return {
      id: orderId,
      trader: '', traderContact: '', traderContactInfo: '',
      cargoName: '', cargoTotal: 0, cargoPrice: 0, cargoQuality: '', mine: '',
      vessel: '', loadingStart: '', departure: '', destPort: '', draftMark: 0,
      customers: [makeCustomer()],
      createdAt: now, updatedAt: now, status: 'draft',
    };
  }

  const existing = id ? data.getOrder(id) : undefined;
  // 编辑态加载已有订单，未找到则回退新建
  const order = existing || emptyOrder('');

  /* ==================== 通用提示 ==================== */

  let toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  let savedTimer = null;
  function showSaved() {
    els.savedTip.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { els.savedTip.hidden = true; }, 1500);
  }

  /* ==================== 草稿自动保存（仅编辑模式，800ms 防抖） ==================== */

  let autoSaveTimer = null;
  function scheduleAutoSave() {
    if (!isEdit || !order.id) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      data.saveOrder(order);
      showSaved();
    }, 800);
  }

  // 订单内容变化：刷新摘要 + 触发自动保存
  function onOrderChanged() {
    refreshSummaries();
    scheduleAutoSave();
  }

  /* ==================== 校验 ==================== */

  function setError(field) {
    const input = document.querySelector(`[data-field="${field}"]`);
    if (input) input.dataset.error = 'true';
    const hint = document.querySelector(`[data-hint="${field}"]`);
    if (hint) {
      hint.textContent = '必填';
      hint.classList.add('err');
    }
  }

  function clearError(field) {
    const input = document.querySelector(`[data-field="${field}"]`);
    if (input) input.dataset.error = 'false';
    const hint = document.querySelector(`[data-hint="${field}"]`);
    if (hint) {
      hint.textContent = '';
      hint.classList.remove('err');
    }
  }

  function updateField(field, value) {
    order[field] = value;
    clearError(field);
    onOrderChanged();
  }

  function validate() {
    let ok = true;
    REQUIRED_FIELDS.forEach(f => {
      const v = order[f];
      if (v === '' || v === 0 || v === null || v === undefined) {
        setError(f);
        ok = false;
      }
    });
    return ok;
  }

  /* ==================== 终端客户动态行 ==================== */

  function findCustomer(cid) {
    return order.customers.find(c => c.id === cid);
  }

  function renderCustomers() {
    els.custList.innerHTML = order.customers.map((c, idx) =>
      '<div class="cust-row">' +
        '<div class="cust-head">' +
          '<span class="cust-idx">' + (idx + 1) + '</span>' +
          '<span class="cust-name">客户 ' + (idx + 1) + '</span>' +
          '<button type="button" class="cust-del" data-del-cust="' + data.esc(c.id) + '" title="删除该客户">✕</button>' +
        '</div>' +
        '<div class="fgrid cols-3">' +
          '<div class="field span-2">' +
            '<label class="field-label">终端钢厂</label>' +
            '<input class="field-input" data-cust-name="' + data.esc(c.id) + '" value="' + data.esc(c.name) + '" placeholder="如：河钢集团" />' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">销售数量（吨）</label>' +
            '<input class="field-input" type="number" data-cust-qty="' + data.esc(c.id) + '" value="' + (c.qty || '') + '" placeholder="如：35000" />' +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  // 保存前清理空客户记录（名称为空的不保留）
  function cleanCustomers() {
    return order.customers.filter(c => c.name.trim());
  }

  /* ==================== 摘要（折叠面板头 + 差额 + 摘要卡片） ==================== */

  function refreshDiff() {
    const total = Number(order.cargoTotal) || 0;
    const sale = data.customersTotalQty(order.customers);
    if (!(total > 0 && sale > 0)) {
      els.diffTip.hidden = true;
      return;
    }
    const diff = total - sale;
    let html = '货物总量 ' + data.fmtNum(total, '吨') + ' · 销售量合计 ' + data.fmtNum(sale, '吨');
    if (diff !== 0) {
      const ok = Math.abs(diff) < total * 0.01;
      html += ' <span class="' + (ok ? 'hint ok' : 'hint warn') + '" style="margin-left:4px">差额 ' + data.fmtNum(Math.abs(diff), '吨') + '</span>';
    }
    els.diffTip.hidden = false;
    els.diffTip.innerHTML = html;
  }

  function refreshSummaryCard() {
    if (!isEdit || !order.trader) {
      els.summaryCard.hidden = true;
      return;
    }
    els.summaryCard.hidden = false;
    const saleTotal = data.customersTotalQty(order.customers);
    const items = [
      ['订单编号', data.esc(order.id), true],
      ['客户', data.esc(order.trader)],
      ['货物', data.esc(order.cargoName) + ' · ' + data.fmtNum(order.cargoTotal, '吨')],
      ['终端钢厂', data.esc(data.customersDisplay(order.customers) || '—')],
      ['到港', data.esc(order.destPort)],
      ['船舶', data.esc(order.vessel)],
      ['起运时间', data.fmtDate(order.departure)],
      ['销售数量', data.fmtNum(saleTotal, '吨')],
    ];
    els.summaryGrid.innerHTML = items.map(it =>
      '<div><div class="sum-label">' + it[0] + '</div>' +
      '<div class="sum-value' + (it[2] ? ' mono' : '') + '">' + it[1] + '</div></div>'
    ).join('');
  }

  function refreshSummaries() {
    // 客户面板摘要：客户 · 联系人
    $('sum-customer').textContent = !order.trader
      ? '未填写'
      : order.trader + (order.traderContact ? ' · ' + order.traderContact : '');
    // 货物面板摘要：货物名称 · N 吨
    $('sum-cargo').textContent = !order.cargoName
      ? '未填写'
      : order.cargoName + ' · ' + data.fmtNum(order.cargoTotal) + ' 吨';
    // 到港面板摘要：到港 · 船舶
    const parts = [order.destPort, order.vessel].filter(Boolean);
    $('sum-port').textContent = parts.length > 0 ? parts.join(' · ') : '未填写';
    // 终端客户面板摘要：名称列表
    $('sum-customers').textContent = data.customersDisplay(order.customers) || '未填写';

    refreshDiff();
    refreshSummaryCard();
  }

  /* ==================== 搜索下拉（原生实现，含"其他"自定义选项） ==================== */

  function setupSearchSelect(container, options, otherPlaceholder) {
    const input = container.querySelector('.ss-input');
    const panel = container.querySelector('[data-ss-panel]');

    function renderPanel(keyword) {
      const q = (keyword || '').trim().toLowerCase();
      const list = options.filter(o => !q || o.toLowerCase().indexOf(q) !== -1);
      let html = list.map(o =>
        '<div class="ss-option" data-value="' + data.esc(o) + '">' + data.esc(o) + '</div>'
      ).join('');
      if (!list.length) {
        html += '<div class="ss-option" style="color:var(--gray-400);cursor:default">无匹配项</div>';
      }
      html += '<div class="ss-option custom" data-other>其他：' + data.esc(otherPlaceholder) + '</div>';
      panel.innerHTML = html;
    }

    // "其他"自定义输入模式：面板切换为输入框 + 确定
    function renderCustom() {
      panel.innerHTML =
        '<div style="display:flex;gap:8px;padding:8px">' +
          '<input class="field-input ss-custom-input" placeholder="' + data.esc(otherPlaceholder) + '" maxlength="50" style="flex:1" />' +
          '<button type="button" class="btn-primary btn-sm ss-custom-ok">确定</button>' +
        '</div>';
      const ci = panel.querySelector('.ss-custom-input');
      ci.focus();
      ci.addEventListener('keydown', e => {
        if (e.key === 'Enter') setCustom(ci.value);
      });
      panel.querySelector('.ss-custom-ok').addEventListener('click', () => setCustom(ci.value));
    }

    function setCustom(v) {
      v = v.trim();
      if (!v) return;
      input.value = v;
      panel.classList.remove('open');
      updateField(input.dataset.field, v);
    }

    input.addEventListener('focus', () => {
      renderPanel(input.value);
      panel.classList.add('open');
    });

    panel.addEventListener('click', e => {
      const opt = e.target.closest('[data-value]');
      if (opt) {
        input.value = opt.dataset.value;
        panel.classList.remove('open');
        updateField(input.dataset.field, opt.dataset.value);
        return;
      }
      if (e.target.closest('[data-other]')) renderCustom();
    });

    // 点击下拉外部收起面板
    document.addEventListener('click', e => {
      if (!container.contains(e.target)) panel.classList.remove('open');
    });
  }

  /* ==================== 保存草稿 / 生成订单 ==================== */

  function saveDraft() {
    const finalId = order.id || data.genOrderId();
    const now = new Date().toISOString();
    order.customers = cleanCustomers();
    order.id = finalId;
    order.createdAt = order.createdAt || now;
    order.updatedAt = now;
    if (!order.status) order.status = 'draft';
    data.saveOrder(order);
    if (!isEdit) {
      // 新建态保存草稿后刷新地址栏为编辑态
      history.replaceState(null, '', '?id=' + encodeURIComponent(finalId));
    }
    showSaved();
  }

  function generate() {
    if (!validate()) {
      const first = document.querySelector('[data-error="true"]');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // 提交加载态：按钮转 spinner（纯视觉反馈，不改保存/跳转逻辑）
    document.getElementById('btn-generate').classList.add('is-loading');
    const finalId = order.id || data.genOrderId();
    const now = new Date().toISOString();
    order.customers = cleanCustomers();
    order.id = finalId;
    order.createdAt = order.createdAt || now;
    order.updatedAt = now;
    order.status = 'port';
    data.saveOrder(order);
    location.href = 'order-port.html?id=' + encodeURIComponent(finalId);
  }

  /* ==================== 初始化填充与事件绑定 ==================== */

  // 页面标题与副标题
  els.title.textContent = isEdit ? '编辑订单' : '新建订单';
  els.sub.innerHTML = isEdit
    ? '订单编号 <span style="font-family:Consolas,Monaco,monospace;font-weight:600;color:var(--gray-800)">' + data.esc(order.id) + '</span>'
    : '填写后将自动生成订单编号并进入下一步';

  // 通用字段填充 + 输入事件
  document.querySelectorAll('[data-field]').forEach(input => {
    const f = input.dataset.field;
    if (DATE_FIELDS.indexOf(f) !== -1) {
      input.value = data.toLocalInput(order[f]);
      input.addEventListener('input', e => {
        updateField(f, e.target.value ? new Date(e.target.value).toISOString() : '');
      });
    } else if (NUMERIC_FIELDS.indexOf(f) !== -1) {
      input.value = order[f] || '';
      input.addEventListener('input', e => {
        updateField(f, Number(e.target.value) || 0);
      });
    } else {
      input.value = order[f] || '';
      input.addEventListener('input', e => {
        updateField(f, e.target.value);
      });
    }
  });

  // 搜索下拉：客户 / 货物名称
  document.querySelectorAll('.ss').forEach(container => {
    const field = container.querySelector('.ss-input').dataset.field;
    setupSearchSelect(container, field === 'trader' ? data.TRADER_OPTIONS : data.CARGO_CATEGORIES,
      field === 'trader' ? '如：中矿国链' : '如：PB粉');
  });

  // 来源矿山三态：普通选项 / "其他"切换自定义输入
  data.MINE_OPTIONS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    els.mineSelect.appendChild(opt);
  });
  let mineSelectValue = !order.mine ? '' : (data.MINE_OPTIONS.indexOf(order.mine) !== -1 ? order.mine : '其他');
  els.mineSelect.value = mineSelectValue;
  els.mineCustom.value = order.mine || '';
  els.mineOtherField.hidden = mineSelectValue !== '其他';

  els.mineSelect.addEventListener('change', e => {
    mineSelectValue = e.target.value;
    if (mineSelectValue === '其他') {
      order.mine = ''; // 切换到自定义输入，清空已有值
    } else {
      order.mine = mineSelectValue;
    }
    els.mineCustom.value = order.mine;
    els.mineOtherField.hidden = mineSelectValue !== '其他';
    onOrderChanged();
  });

  els.mineCustom.addEventListener('input', e => {
    order.mine = e.target.value;
    onOrderChanged();
  });

  // 折叠面板开合
  document.querySelectorAll('[data-collapse]').forEach(head => {
    head.addEventListener('click', () => {
      head.closest('.flow-collapse').classList.toggle('open');
    });
  });

  // 终端客户动态行：委托绑定（渲染后无需重复绑定）
  els.custList.addEventListener('input', e => {
    const nameInput = e.target.closest('[data-cust-name]');
    if (nameInput) {
      const c = findCustomer(nameInput.dataset.custName);
      if (c) c.name = nameInput.value;
      onOrderChanged();
      return;
    }
    const qtyInput = e.target.closest('[data-cust-qty]');
    if (qtyInput) {
      const c = findCustomer(qtyInput.dataset.custQty);
      if (c) c.qty = Number(qtyInput.value) || 0;
      onOrderChanged();
    }
  });

  els.custList.addEventListener('click', e => {
    const del = e.target.closest('[data-del-cust]');
    if (del) {
      const idx = order.customers.findIndex(c => c.id === del.dataset.delCust);
      if (idx >= 0) order.customers.splice(idx, 1);
      renderCustomers();
      onOrderChanged();
    }
  });

  $('btn-add-customer').addEventListener('click', () => {
    order.customers.push(makeCustomer());
    renderCustomers();
    onOrderChanged();
  });

  // 保存草稿（头部与底部按钮共用）
  $('btn-save-head').addEventListener('click', saveDraft);
  $('btn-save').addEventListener('click', saveDraft);
  $('btn-generate').addEventListener('click', generate);

  // 初始化渲染
  renderCustomers();
  refreshSummaries();
})();
