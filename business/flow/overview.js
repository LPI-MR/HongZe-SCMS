// ===== overview 模块脚本（业务总览 · 快捷操作枢纽）=====
// 依赖 flow-data.js 提供的共享数据层；
// 页面不承载订单列表（已迁移至「订单台账 · 履约流程」视图），仅提供：
//   1. 概览摘要（纯排版数字条）  2. 业务流程五步快捷入口  3. 继续办理（下一步直达）
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '业务管理 / 业务总览';

  // 设置导航栏选中态：子项高亮 + 展开父级菜单
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

  /* ==================== 快捷枢纽 ==================== */

  const data = window.HZFlowData;
  const $ = id => document.getElementById(id);
  const summaryEl = $('ov-summary');
  const stepsEl = $('ov-steps');
  const resumeEl = $('ov-resume');

  // 订单台账「履约流程」视图（承接原业务总览订单列表）
  const LEDGER_URL = 'orders.html?view=flow';

  // 状态 → 下一步动作（快捷继续的核心映射：状态直达对应执行页）
  const NEXT_ACTION = {
    draft: { label: '继续录入', page: 'flow/order-form.html' },
    port: { label: '填写港口信息', page: 'flow/order-port.html' },
    capacity: { label: '安排运力', page: 'flow/order-capacity.html' },
    plan: { label: '制定发运方案', page: 'flow/order-plan.html' },
    pending_confirm: { label: '确认订单', page: 'flow/order-detail.html' },
    confirmed: { label: '跟进发运', page: 'flow/order-detail.html' },
    shipping: { label: '跟进发运', page: 'flow/order-detail.html' },
    shipped: { label: '完成订单', page: 'flow/order-detail.html' },
  };

  // 业务流程五步入口（status 对应待办状态；draft 步骤无待办时回落为新建入口）
  const STEPS = [
    { status: 'draft', no: '01', title: '新建订单', desc: '录入贸易订单与货物信息', page: 'flow/order-form.html', canCreate: true },
    { status: 'port', no: '02', title: '港口信息', desc: '登记靠港与港口作业信息', page: 'flow/order-port.html' },
    { status: 'capacity', no: '03', title: '运力安排', desc: '选择通道并安排运力', page: 'flow/order-capacity.html' },
    { status: 'plan', no: '04', title: '发运方案', desc: '生成运输组织与费用方案', page: 'flow/order-plan.html' },
    { status: 'pending_confirm', no: '05', title: '订单确认', desc: '业务确认后进入发运执行', page: 'flow/order-detail.html' },
  ];

  // 同状态订单中最近创建的一单（快捷直达目标）
  function latestByStatus(orders, status) {
    let hit = null;
    orders.forEach(o => {
      if (data.migrateStatus(o.status) !== status) return;
      if (!hit || (o.createdAt || '') > (hit.createdAt || '')) hit = o;
    });
    return hit;
  }

  // ===== 概览摘要条：纯排版数字（无卡片） =====
  function renderSummary(orders) {
    const createPhase = orders.filter(o => {
      const s = data.migrateStatus(o.status);
      return s && data.STATUS_META[s].phase === 'create';
    }).length;
    const businessPhase = orders.filter(o => {
      const s = data.migrateStatus(o.status);
      return s && data.STATUS_META[s].phase === 'business';
    }).length;
    const totalTons = orders.reduce((s, o) => s + (Number(o.cargoTotal) || 0), 0);

    summaryEl.innerHTML =
      '<a class="ov-metric ov-link" href="' + LEDGER_URL + '">' +
        '<span class="ov-num">' + orders.length + '</span>' +
        '<span class="ov-label">订单总数</span>' +
      '</a>' +
      '<span class="ov-sep" aria-hidden="true"></span>' +
      '<div class="ov-metric">' +
        '<span class="ov-num">' + createPhase + '</span>' +
        '<span class="ov-label">创建中</span>' +
      '</div>' +
      '<span class="ov-sep" aria-hidden="true"></span>' +
      '<div class="ov-metric">' +
        '<span class="ov-num">' + businessPhase + '</span>' +
        '<span class="ov-label">业务流转</span>' +
      '</div>' +
      '<span class="ov-sep" aria-hidden="true"></span>' +
      '<div class="ov-metric">' +
        '<span class="ov-num">' + data.fmtNum(totalTons) + '<i class="ov-unit">吨</i></span>' +
        '<span class="ov-label">货物总量</span>' +
      '</div>';
  }

  // ===== 业务流程五步快捷入口 =====
  function renderSteps(orders) {
    stepsEl.innerHTML = STEPS.map(step => {
      const todo = orders.filter(o => data.migrateStatus(o.status) === step.status);
      const hit = todo.length ? latestByStatus(orders, step.status) : null;
      const href = hit
        ? step.page + '?id=' + encodeURIComponent(hit.id)
        : step.page;

      // 右侧状态文案：有待办 → 待办数；draft 无待办 → 新建；其余 → 暂无待办
      let countHtml = '';
      if (todo.length) {
        countHtml = '<span class="step-count">' + todo.length + ' 单待办</span>';
      } else if (!step.canCreate) {
        countHtml = '<span class="step-idle">暂无待办</span>';
      }

      const goLabel = hit ? '去办理' : (step.canCreate ? '新建订单' : '去办理');
      return '<div class="ov-step' + (todo.length || step.canCreate ? ' is-active' : '') + '" data-href="' + href + '" role="link" tabindex="0">' +
        '<span class="step-no">' + step.no + '</span>' +
        '<div class="step-main">' +
          '<div class="step-title">' + step.title + '</div>' +
          '<div class="step-desc">' + step.desc + '</div>' +
        '</div>' +
        countHtml +
        '<span class="step-go">' + goLabel + ' ›</span>' +
      '</div>';
    }).join('');
  }

  // ===== 继续办理：进行中订单下一步直达 =====
  function renderResume(orders) {
    // 进行中 = 未完成订单；按创建时间倒序，最多展示 4 条
    const running = orders
      .filter(o => data.migrateStatus(o.status) !== 'completed')
      .sort((a, b) => (b.createdAt || '') < (a.createdAt || '') ? -1 : (b.createdAt || '') > (a.createdAt || '') ? 1 : 0)
      .slice(0, 4);

    if (!running.length) {
      if (!orders.length) {
        resumeEl.innerHTML =
          '<div class="ov-empty">' +
            '<div class="ov-empty-title">还没有订单</div>' +
            '<div class="ov-empty-desc">从订单录入开始，依次填写港口与运力信息，最终生成运输组织方案。</div>' +
            '<a class="btn-primary" href="flow/order-form.html">＋ 创建第一个订单</a>' +
          '</div>';
      } else {
        resumeEl.innerHTML =
          '<div class="ov-empty">' +
            '<div class="ov-empty-title">暂无进行中订单</div>' +
            '<div class="ov-empty-desc">全部订单均已办结，可前往订单台账查看归档记录。</div>' +
            '<a class="ov-more" href="' + LEDGER_URL + '">前往订单台账 ›</a>' +
          '</div>';
      }
      return;
    }

    resumeEl.innerHTML = running.map(o => {
      const s = data.migrateStatus(o.status);
      const meta = data.STATUS_META[s] || data.STATUS_META.draft;
      const act = NEXT_ACTION[s] || { label: '查看详情', page: 'flow/order-detail.html' };
      const detail = data.esc(o.trader || '—') + ' · ' + data.esc(o.cargoName || '—') + ' ' + data.fmtNum(o.cargoTotal) + ' 吨';
      return '<div class="ov-row" data-href="' + act.page + '?id=' + encodeURIComponent(o.id) + '" role="link" tabindex="0">' +
        '<span class="ov-dot" style="background:' + meta.color + '" title="' + data.esc(meta.label) + '"></span>' +
        '<span class="ov-order-no">' + data.esc(o.id) + '</span>' +
        '<span class="ov-order-meta">' + detail + '</span>' +
        '<span class="ov-status" style="color:' + meta.color + '">' + data.esc(meta.label) + '</span>' +
        '<span class="ov-action">' + act.label + ' ›</span>' +
      '</div>';
    }).join('');
  }

  // ===== 整行点击跳转（快捷枢纽的交互约定：行即入口） =====
  function bindRowNav(root) {
    root.addEventListener('click', e => {
      const row = e.target.closest('[data-href]');
      if (!row) return;
      location.href = row.dataset.href;
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('[data-href]');
      if (row) location.href = row.dataset.href;
    });
  }

  // ===== 初始化 =====
  const orders = data.listOrders();
  renderSummary(orders);
  renderSteps(orders);
  renderResume(orders);
  bindRowNav(stepsEl);
  bindRowNav(resumeEl);
})();
