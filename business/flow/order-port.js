// ===== order-port 模块脚本（业务总览 · 港口信息录入页）=====
// 复刻 hongze_demo PortFormPage：拥堵三态按钮 + 草稿自动保存 + 关联订单关键信息
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
    missing: $('missing'),
    steps: $('steps'),
    stepBack: $('step-back'),
    head: $('head'),
    savedTip: $('saved-tip'),
    panel: $('panel'),
    congBadge: $('cong-badge'),
    sumPort: $('sum-port'),
    congGroup: $('cong-group'),
    infoPanel: $('info-panel'),
    infoGrid: $('info-grid'),
    footer: $('footer'),
    btnPrev: $('btn-prev'),
    toast: $('toast'),
  };

  const id = new URLSearchParams(location.search).get('id') || '';
  const order = id ? data.getOrder(id) : undefined;

  // 港口信息：默认值（港口名称联动订单预计到达港口）合并已有记录
  const defaults = {
    orderId: id,
    portName: order ? (order.destPort || '') : '',
    congestion: 'normal',
    efficiency: '',
    wharf: '',
    berth: '',
    yard: '',
    waitHours: 0,
    updatedAt: new Date().toISOString(),
  };
  const existing = id ? data.getPort(id) : undefined;
  const port = Object.assign({}, defaults, existing || {});

  // ===== 订单不存在：仅展示空状态 =====
  if (!order) {
    els.missing.hidden = false;
    return;
  }

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

  /* ==================== 草稿自动保存（800ms 防抖） ==================== */

  let autoSaveTimer = null;
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      data.upsertPort(port);
      showSaved();
    }, 800);
  }

  /* ==================== 拥堵三态按钮 ==================== */

  function renderCongestion() {
    els.congGroup.innerHTML = data.CONGESTION_OPTIONS.map(c => {
      const active = port.congestion === c.value;
      const style = active
        ? ' style="background-color:' + c.color + ';border-color:transparent;color:#fff"'
        : '';
      return '<button type="button" class="opt-btn' + (active ? ' active' : '') + '" data-cong="' + c.value + '"' + style + '>' + c.label + '</button>';
    }).join('');
    renderCongBadge();
  }

  // 面板头拥堵徽标：圆点 + label
  function renderCongBadge() {
    const cong = data.CONGESTION_OPTIONS.find(c => c.value === port.congestion);
    if (!cong) {
      els.congBadge.innerHTML = '';
      return;
    }
    els.congBadge.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 10px;border-radius:11px;background-color:' + cong.color + '1a;color:' + cong.color + '">' +
        '<span style="width:6px;height:6px;border-radius:50%;background-color:' + cong.color + '"></span>' +
        cong.label +
      '</span>';
  }

  /* ==================== 摘要 ==================== */

  function refreshSummaries() {
    const parts = [port.portName, port.wharf].filter(Boolean);
    els.sumPort.textContent = parts.length > 0 ? parts.join(' · ') : '未填写';
  }

  // 关联订单关键信息
  function renderOrderInfo() {
    els.infoGrid.innerHTML =
      '<div class="info-row"><span class="info-label">货物总量</span><span class="info-value">' + data.fmtNum(order.cargoTotal) + ' 吨</span></div>' +
      '<div class="info-row"><span class="info-label">终端钢厂</span><span class="info-value">' + data.esc(data.customersDisplay(order.customers) || '—') + '</span></div>' +
      '<div class="info-row"><span class="info-label">船舶</span><span class="info-value">' + data.esc(order.vessel) + '</span></div>' +
      '<div class="info-row"><span class="info-label">销售数量合计</span><span class="info-value">' + data.fmtNum(data.customersTotalQty(order.customers)) + ' 吨</span></div>';
  }

  /* ==================== 保存并下一步 ==================== */

  function next() {
    data.upsertPort(port);
    data.updateOrderStatus(id, 'capacity');
    location.href = 'order-capacity.html?id=' + encodeURIComponent(id);
  }

  /* ==================== 初始化填充与事件绑定 ==================== */

  // 上一步 / 步骤条回退：返回订单录入页
  els.btnPrev.href = 'order-form.html?id=' + encodeURIComponent(id);
  els.stepBack.href = 'order-form.html?id=' + encodeURIComponent(id);

  // 通用字段填充 + 输入事件（港口信息全部选填，不做必填校验）
  document.querySelectorAll('[data-field]').forEach(input => {
    const f = input.dataset.field;
    if (f === 'waitHours') {
      input.value = port[f] || '';
      input.addEventListener('input', e => {
        port[f] = Number(e.target.value) || 0;
        refreshSummaries();
        scheduleAutoSave();
      });
    } else {
      input.value = port[f] || '';
      input.addEventListener('input', e => {
        port[f] = e.target.value;
        refreshSummaries();
        scheduleAutoSave();
      });
    }
  });

  // 拥堵三态切换
  els.congGroup.addEventListener('click', e => {
    const btn = e.target.closest('[data-cong]');
    if (!btn || port.congestion === btn.dataset.cong) return;
    port.congestion = btn.dataset.cong;
    renderCongestion();
    scheduleAutoSave();
  });

  // 折叠面板开合
  document.querySelectorAll('[data-collapse]').forEach(head => {
    head.addEventListener('click', () => {
      head.closest('.flow-collapse').classList.toggle('open');
    });
  });

  els.footer.addEventListener('click', e => {
    if (e.target.closest('#btn-next')) next();
  });

  // 初始化渲染
  renderCongestion();
  refreshSummaries();
  renderOrderInfo();

  els.missing.hidden = true;
  els.steps.hidden = false;
  els.head.hidden = false;
  els.panel.hidden = false;
  els.infoPanel.hidden = false;
  els.footer.hidden = false;
})();
