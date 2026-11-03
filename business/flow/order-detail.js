// ===== order-detail 模块脚本（业务总览 · 订单详情页）=====
// 复刻 hongze_demo OrderDetailPage：九态流转条 + 六页签
// （基本信息 / 财务状态 / 发运状态 / 仓储堆存 / 货物动态 / 运输时间轴）
// 财务金额自动同步运力合计；发运按通道累加并自动流转订单状态；
// 仓储堆存为独立环节，不影响订单状态流转。
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
    head: $('head'),
    headMono: $('head-mono'),
    headStatus: $('head-status'),
    headCreated: $('head-created'),
    headUpdated: $('head-updated'),
    roleSelect: $('role-select'),
    delBtn: document.querySelector('.js-del'),
    statusTrack: $('status-track'),
    tabs: $('tabs'),
    toast: $('toast'),
    // 基本信息
    basicKv: $('basic-kv'),
    basicChips: $('basic-chips'),
    basicPort: $('basic-port'),
    bsFreight: $('bs-freight'),
    bsFreightNote: $('bs-freight-note'),
    bsLead: $('bs-lead'),
    bsLeadNote: $('bs-lead-note'),
    bsIdle: $('bs-idle'),
    bsIdleNote: $('bs-idle-note'),
    bsAlloc: $('bs-alloc'),
    bsAllocNote: $('bs-alloc-note'),
    basicCapRows: $('basic-cap-rows'),
    basicPlanBlock: $('basic-plan-block'),
    basicBatchRows: $('basic-batch-rows'),
    // 财务状态
    finTotal: $('fin-total'),
    finReceivedView: $('fin-received-view'),
    finUnreceived: $('fin-unreceived'),
    finConfirmBox: $('fin-confirm-box'),
    finConfirmedTip: $('fin-confirmed-tip'),
    finTotalInput: $('fin-total-input'),
    finReceivedInput: $('fin-received-input'),
    finPayGroup: $('fin-pay-group'),
    finInvoiceGroup: $('fin-invoice-group'),
    finRemark: $('fin-remark'),
    finVouchers: $('fin-vouchers'),
    finVchName: $('fin-vch-name'),
    finVchType: $('fin-vch-type'),
    finVchNote: $('fin-vch-note'),
    // 发运状态
    shipDenied: $('ship-denied'),
    shipPlanned: $('ship-planned'),
    shipShipped: $('ship-shipped'),
    shipRemaining: $('ship-remaining'),
    shipProgressFill: $('ship-progress-fill'),
    shipRate: $('ship-rate'),
    shipChannelsSummary: $('ship-channels-summary'),
    shipOps: $('ship-ops'),
    shipNoChannel: $('ship-no-channel'),
    shipOpsForm: $('ship-ops-form'),
    shipChannel: $('ship-channel'),
    shipQty: $('ship-qty'),
    shipDate: $('ship-date'),
    shipVchName: $('ship-vch-name'),
    shipVchType: $('ship-vch-type'),
    shipRemark: $('ship-remark'),
    shipStateBoxes: $('ship-state-boxes'),
    shipChannels: $('ship-channels'),
    shipLogs: $('ship-logs'),
    // 仓储堆存
    whTransit: $('wh-transit'),
    whStored: $('wh-stored'),
    whPicked: $('wh-picked'),
    whOps: $('wh-ops'),
    whNoChannel: $('wh-no-channel'),
    whOpsForm: $('wh-ops-form'),
    whChannel: $('wh-channel'),
    whArrive: $('wh-arrive'),
    whPick: $('wh-pick'),
    whDate: $('wh-date'),
    whVchName: $('wh-vch-name'),
    whVchType: $('wh-vch-type'),
    whRemark: $('wh-remark'),
    whStateBoxes: $('wh-state-boxes'),
    whChannels: $('wh-channels'),
    // 货物动态
    cargoHead: $('cargo-head'),
    cargoStack: $('cargo-stack'),
    cargoLegend: $('cargo-legend'),
    cgUnshipped: $('cg-unshipped'),
    cgTransit: $('cg-transit'),
    cgStored: $('cg-stored'),
    cgPicked: $('cg-picked'),
    cargoChannels: $('cargo-channels'),
    // 运输时间轴
    logTimeline: $('log-timeline'),
    logRows: $('log-rows'),
  };

  const id = new URLSearchParams(location.search).get('id') || '';
  const order = id ? data.getOrder(id) : undefined;

  // ===== 订单不存在：仅展示空状态 =====
  if (!order) {
    els.missing.hidden = false;
    return;
  }

  const port = data.getPort(id);
  const caps = data.listCapacities(id);
  const plan = data.getPlan(id);
  const financial = data.getFinancial(id) || data.emptyFinancial(id);
  const shippings = data.ensureShippings(id, caps);
  const logs = data.listLogs(id);
  let role = 'admin';
  let currentStatus = data.migrateStatus(order.status);

  /* ==================== 通用提示 ==================== */

  let toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  /* ==================== 通道与统计工具 ==================== */

  // 通道元数据（未知类型回退灰色）
  function channelMetaOf(t) {
    return data.CHANNEL_META[t] || { label: t || '未知通道', short: t || '未知通道', color: '#8e8e93' };
  }

  // 通道标题（rail_transit 带 transfer 后缀以区分中转站）
  function channelTitle(c) {
    const meta = channelMetaOf(c.channelType);
    if (c.channelType === 'rail_transit' && c.transfer) {
      return meta.short + '（' + c.transfer + '）';
    }
    return meta.short;
  }

  // 通道路线文案：起点 →（中转）→ 终点
  function channelRoute(c) {
    const meta = channelMetaOf(c.channelType);
    return [c.origin, c.transfer || meta.transfer, c.destination].filter(Boolean).join(' → ');
  }

  // 港口拥堵文案
  function congLabelOf(v) {
    const opt = data.CONGESTION_OPTIONS.find(c => c.value === v);
    return opt ? opt.label : '—';
  }

  // 单通道货物追踪数据（与蓝本 channelCargoTracking 一致）
  function trackingOf(s) {
    const cap = caps.find(c => c.id === s.capacityId) || {};
    const meta = channelMetaOf(cap.channelType);
    const planned = Number(s.plannedQty) || 0;
    const shipped = Number(s.shippedQty) || 0;
    const stored = Number(s.storedQty) || 0;
    const pickedUp = Number(s.pickedUpQty) || 0;
    return {
      shipping: s,
      channelTitle: channelTitle(cap),
      channelColor: meta.color,
      route: [cap.origin, cap.transfer || meta.transfer, cap.destination].filter(Boolean).join(' → '),
      planned: planned,
      shipped: shipped,
      inTransit: Math.max(0, shipped - stored - pickedUp),
      stored: stored,
      pickedUp: pickedUp,
      unshipped: Math.max(0, planned - shipped),
      progress: planned > 0 ? Math.min(100, Math.round(shipped / planned * 100)) : 0,
    };
  }

  // 全部通道追踪列表
  function trackingList() {
    return shippings.map(trackingOf);
  }

  // 运费合计（分配量 × 运价）
  function totalFreight() {
    return caps.reduce((sum, c) => {
      const qty = Number(c.plannedQty) || 0;
      const price = Number(c.price) || 0;
      return sum + (qty > 0 && price > 0 ? qty * price : 0);
    }, 0);
  }

  // 关键路径时效（各通道最长时效）
  function maxLeadTime() {
    return caps.reduce((max, c) => Math.max(max, Number(c.leadTime) || 0), 0);
  }

  // 发运统计（与蓝本 shippingStats 一致）
  function shippingStats() {
    const list = trackingList();
    const planned = list.reduce((s, t) => s + t.planned, 0);
    const shipped = list.reduce((s, t) => s + t.shipped, 0);
    const stored = list.reduce((s, t) => s + t.stored, 0);
    const pickedUp = list.reduce((s, t) => s + t.pickedUp, 0);
    return {
      planned: planned,
      shipped: shipped,
      stored: stored,
      pickedUp: pickedUp,
      remaining: Math.max(0, planned - shipped),
      rate: planned > 0 ? Math.min(100, Math.round(shipped / planned * 100)) : 0,
      completedChannels: list.filter(t => t.shipping.state === 'completed').length,
      shippingChannels: list.filter(t => t.shipping.state === 'shipping').length,
      total: list.length,
    };
  }

  // 通道发运状态自动推导：未开始 / 发运中 / 已完成（与蓝本 autoShippingState 一致）
  function autoShippingState(shipped, planned) {
    if (shipped <= 0) return 'not_started';
    if (planned > 0 && shipped >= planned) return 'completed';
    return 'shipping';
  }

  // 实时状态盒
  function sbBox(label, value) {
    return '<div class="state-box"><div class="sb-label">' + label + '</div><div class="sb-value">' + value + '</div></div>';
  }

  // 角色徽章
  function roleBadge(roleKey) {
    const meta = data.ROLE_META[roleKey];
    if (!meta) return '';
    return '<span class="role-badge" style="background:' + meta.color + '1F;color:' + meta.color + '">' + data.esc(meta.label) + '</span>';
  }

  /* ==================== 头部与页签 ==================== */

  // 九态流转条：节点与前置连线组成不可拆分组（窄视口整组换行、连线断开）；
  // 已过态打勾 + 连线染色，当前态高亮
  function renderStatusTrack() {
    const idx = data.STATUS_ORDER.indexOf(currentStatus);
    let html = '';
    data.STATUS_ORDER.forEach((key, i) => {
      const meta = data.STATUS_META[key];
      const done = i < idx;
      const current = i === idx;
      html += '<div class="st-node' + (current ? ' current' : '') + '">'
        + (i > 0 ? '<i class="st-line"' + (i <= idx ? ' style="background:' + meta.color + '"' : '') + '></i>' : '')
        + '<i class="st-dot"' + (done || current ? ' style="background:' + meta.color + ';color:#fff"' : '') + '>'
        + (done ? '✓' : String(i + 1))
        + '</i>'
        + '<span' + (current ? ' style="color:' + meta.color + '"' : '') + '>' + meta.label + '</span>'
        + '</div>';
    });
    els.statusTrack.innerHTML = html;
  }

  // 头部状态徽标
  function updateHeadStatus() {
    const meta = data.STATUS_META[currentStatus];
    els.headStatus.textContent = meta ? meta.label : currentStatus;
    if (meta) {
      els.headStatus.style.cssText = 'color:' + meta.color + ';background:' + meta.bg
        + ';padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600';
    }
  }

  // 页签切换：按钮 active + 面板显隐
  function switchTab(tab) {
    els.tabs.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      panel.hidden = panel.dataset.tabPanel !== tab;
    });
  }

  /* ==================== 基本信息 ==================== */

  // 订单信息键值对（字段图标 + 键值，FR-04 信息标识）
  const KV_ICONS = {
    trader: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6"/><path d="M3.5 13.5c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2"/></svg>',
    contact: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 2.8h2.6l1.2 3-1.6 1.2a9 9 0 0 0 3.6 3.6l1.2-1.6 3 1.2v2.6c0 .5-.4.9-.9.9A11.5 11.5 0 0 1 2.3 3.7c0-.5.4-.9.9-.9z"/></svg>',
    message: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 10.5a1 1 0 0 1-1 1H8l-3.5 2.8v-2.8H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1z"/></svg>',
    cargo: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.2 8 2l6 3.2v5.6L8 14l-6-3.2z"/><path d="M2 5.2 8 8.4l6-3.2M8 8.4V14"/></svg>',
    scale: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 11V5M5.5 7.5 8 5l2.5 2.5"/></svg>',
    price: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M5.6 4.6 8 7.4l2.4-2.8M8 7.4v4.2M5.9 9.3h4.2M5.9 11.2h4.2"/></svg>',
    tag: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5v-5h5L14 9l-4.5 4.5z"/><circle cx="5.5" cy="5.5" r="1"/></svg>',
    mine: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12.5 6 5.5l2.5 4L10.5 7l3.5 5.5z"/><circle cx="11.5" cy="3.8" r="1.4"/></svg>',
    vessel: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 10.5h11l-1.5 3h-8z"/><path d="M8 2.5v8M8 2.5 4.7 10.5M8 2.5l3.3 8"/></svg>',
    port: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 10 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.8"/></svg>',
    users: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3"/><path d="M2.5 13c0-2.2 1.6-3.7 3.5-3.7s3.5 1.5 3.5 3.7"/><path d="M10.5 3.6a2.3 2.3 0 0 1 0 4.3M11 9.5c1.6.4 2.7 1.8 2.7 3.5"/></svg>',
    total: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2.5" width="10" height="11" rx="2"/><path d="M6 6h4M6 8.8h4M6 11.6h2.5"/></svg>',
  };

  function renderBasicKv() {
    const totalQty = data.customersTotalQty(order.customers);
    const items = [
      ['trader', '贸易商', order.trader || '—'],
      ['contact', '联系方式', order.traderContact || '—'],
      ['message', '联系信息', order.traderContactInfo || '—'],
      ['cargo', '货物名称', order.cargoName || '—'],
      ['scale', '货物总量', data.fmtNum(Number(order.cargoTotal) || 0, '吨')],
      ['price', '货物单价', Number(order.cargoPrice) > 0 ? data.fmtMoney(Number(order.cargoPrice)) + ' /吨' : '—'],
      ['tag', '货物品类', order.cargoQuality || '—'],
      ['mine', '来源矿山', order.mine || '—'],
      ['vessel', '船名', order.vessel || '—'],
      ['port', '目的港口', order.destPort || '—'],
      ['users', '终端客户', data.customersDisplay(order.customers) || '—'],
      ['total', '客户合计', totalQty > 0 ? data.fmtNum(totalQty, '吨') : '—'],
    ];
    els.basicKv.innerHTML = items.map(item =>
      '<div class="kv"><span class="kv-label">' + (KV_ICONS[item[0]] || '') + item[1] + '</span>'
      + '<span class="kv-value">' + data.esc(item[2]) + '</span></div>'
    ).join('');
  }

  // 终端客户明细 chips
  function renderBasicChips() {
    const list = Array.isArray(order.customers) ? order.customers : [];
    if (!list.length) {
      els.basicChips.innerHTML = '<span class="kv-label">暂无终端客户明细</span>';
      return;
    }
    els.basicChips.innerHTML = list.map(c =>
      '<span class="chip">' + data.esc(c.name) + ' · ' + data.fmtNum(Number(c.qty) || 0) + '吨</span>'
    ).join('');
  }

  // 港口信息键值对（未录入则引导补录）
  function renderBasicPort() {
    const hasPort = !!(port && (port.portName || port.wharf || port.berth));
    if (!hasPort) {
      els.basicPort.innerHTML = '<div class="notice info">尚未录入港口信息，请先在「步骤 2 · 港口信息」完成靠泊与作业安排。</div>';
      return;
    }
    const items = [
      ['港口名称', port.portName || '—'],
      ['拥堵情况', congLabelOf(port.congestion)],
      ['作业效率', port.efficiency || '—'],
      ['预计等待', data.fmtNum(Number(port.waitHours) || 0, '小时')],
      ['作业码头', port.wharf || '—'],
      ['泊位', port.berth || '—'],
      ['堆场', port.yard || '—'],
    ];
    els.basicPort.innerHTML = '<div class="kv-grid">' + items.map(item =>
      '<div class="kv"><span class="kv-label">' + item[0] + '</span>'
      + '<span class="kv-value">' + data.esc(item[1]) + '</span></div>'
    ).join('') + '</div>';
  }

  // 基本信息页：运输组织方案四卡（总运费 / 运输时间 / 总闲置运力 / 货物分配）
  function renderBasicTransport() {
    const freight = totalFreight();
    const allocQty = caps.reduce((s, c) => s + (Number(c.plannedQty) || 0), 0);
    const railIdle = caps.filter(c => c.channelType !== 'road').reduce((s, c) => s + (Number(c.idleCapacity) || 0), 0);
    const roadIdle = caps.filter(c => c.channelType === 'road').reduce((s, c) => s + (Number(c.idleCapacity) || 0), 0);
    const cargoTotal = Number(order.cargoTotal) || 0;
    const unallocated = cargoTotal - allocQty;
    const status = cargoTotal <= 0 ? 'empty' : unallocated > 0 ? 'warning' : unallocated === 0 ? 'success' : 'over';
    const ALLOC_COLOR = {
      empty: 'var(--gray-400)',
      warning: 'var(--color-warning)',
      success: 'var(--color-success)',
      over: 'var(--color-danger)',
    };
    els.bsFreight.textContent = freight > 0 ? data.fmtMoney(freight) : '—';
    els.bsFreightNote.textContent = caps.length ? '分配量 × 运价汇总' : '暂无通道运价';
    els.bsLead.textContent = maxLeadTime();
    els.bsLeadNote.textContent = caps.length ? '各通道最长时效' : '暂无通道时效';
    els.bsIdle.textContent = data.fmtNum(railIdle + roadIdle);
    els.bsIdleNote.textContent = '铁路 ' + data.fmtNum(railIdle) + ' · 公路 ' + data.fmtNum(roadIdle);
    els.bsAlloc.textContent = allocQty > 0 ? data.fmtNum(allocQty) : '—';
    els.bsAlloc.style.color = ALLOC_COLOR[status];
    if (status === 'empty') els.bsAllocNote.textContent = '请先录入货物总量';
    else if (status === 'warning') els.bsAllocNote.textContent = '已分配 ' + data.fmtNum(allocQty) + ' / ' + data.fmtNum(cargoTotal) + ' 吨';
    else if (status === 'success') els.bsAllocNote.textContent = '已全部分配 · ' + data.fmtNum(cargoTotal) + ' 吨';
    else els.bsAllocNote.textContent = '超分配 ' + data.fmtNum(-unallocated) + ' 吨';
  }

  // 合并通道表（9 列）
  function renderBasicCaps() {
    if (!caps.length) {
      els.basicCapRows.innerHTML = '<tr><td colspan="9" style="color:var(--gray-500)">暂无运输通道，请先完成运力方案录入。</td></tr>';
      return;
    }
    els.basicCapRows.innerHTML = caps.map(c => {
      const meta = channelMetaOf(c.channelType);
      return '<tr>'
        + '<td><i class="lg-dot" style="background:' + meta.color + ';margin-right:6px"></i>' + data.esc(channelTitle(c)) + '</td>'
        + '<td>' + data.esc(c.origin || '—') + '</td>'
        + '<td>' + data.esc(c.transfer || '—') + '</td>'
        + '<td>' + data.esc(c.destination || '—') + '</td>'
        + '<td class="num">' + data.fmtNum(Number(c.plannedQty) || 0) + '</td>'
        + '<td class="num">' + data.fmtNum(Number(c.idleCapacity) || 0) + '</td>'
        + '<td class="num">' + (Number(c.price) > 0 ? data.fmtMoney(Number(c.price)) : '—') + '</td>'
        + '<td class="num">' + data.fmtNum(Number(c.leadTime) || 0) + '</td>'
        + '<td>' + data.esc(c.carrier || '—') + '</td>'
        + '</tr>';
    }).join('');
  }

  // 历史方案批次表（运输方案页保存的批次分配）
  function renderBasicBatches() {
    const batches = plan && Array.isArray(plan.batches) ? plan.batches : [];
    if (!batches.length) {
      els.basicPlanBlock.hidden = true;
      return;
    }
    els.basicPlanBlock.hidden = false;
    els.basicBatchRows.innerHTML = batches.map(b => {
      const qty = Number(b.qty) || 0;
      const price = Number(b.price) || 0;
      return '<tr>'
        + '<td><span class="batch-no">' + data.esc(b.batchNo) + '</span></td>'
        + '<td class="num">' + data.fmtNum(qty) + '</td>'
        + '<td>' + data.esc(channelMetaOf(b.channelType).label) + '</td>'
        + '<td class="num">' + data.fmtNum(Number(b.leadTime) || 0) + '</td>'
        + '<td class="num">' + data.fmtMoney(price) + '</td>'
        + '<td class="num">' + data.fmtMoney(qty * price) + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ==================== 财务状态 ==================== */

  // 收款状态切换按钮组
  function renderPayGroup() {
    els.finPayGroup.innerHTML = Object.keys(data.PAYMENT_META).map(key => {
      const meta = data.PAYMENT_META[key];
      const active = (financial.paymentStatus || 'unpaid') === key;
      const style = active ? ' style="background-color:' + meta.bg + ';border-color:transparent;color:' + meta.color + '"' : '';
      return '<button type="button" class="opt-btn" data-fin-pay="' + key + '"' + style + '>' + meta.label + '</button>';
    }).join('');
  }

  // 发票状态切换按钮组
  function renderInvoiceGroup() {
    els.finInvoiceGroup.innerHTML = Object.keys(data.INVOICE_META).map(key => {
      const meta = data.INVOICE_META[key];
      const active = (financial.invoiceStatus || 'none') === key;
      const style = active ? ' style="background-color:' + meta.bg + ';border-color:transparent;color:' + meta.color + '"' : '';
      return '<button type="button" class="opt-btn" data-fin-inv="' + key + '"' + style + '>' + meta.label + '</button>';
    }).join('');
  }

  // 财务凭证列表
  function renderVouchers() {
    const vouchers = financial.vouchers || [];
    if (!vouchers.length) {
      els.finVouchers.innerHTML = '<div class="v-meta" style="color:var(--gray-500)">暂无凭证</div>';
      return;
    }
    els.finVouchers.innerHTML = vouchers.map(v =>
      '<div class="voucher">'
      + '<span class="v-name">' + data.esc(v.name) + '</span>'
      + '<span class="v-meta">' + data.esc(v.type || '') + (v.uploadedBy ? ' · ' + data.esc(v.uploadedBy) : '') + '</span>'
      + '<span class="v-meta">' + data.fmtDate(v.uploadedAt) + '</span>'
      + '<button type="button" class="opt-btn v-del" data-fin-vdel="' + data.esc(v.id) + '">删除</button>'
      + '</div>'
    ).join('');
  }

  // 财务页整体渲染
  function renderFinance() {
    const total = totalFreight();
    const received = Number(financial.receivedAmount) || 0;
    els.finTotal.textContent = data.fmtMoney(total);
    els.finReceivedView.textContent = data.fmtMoney(received);
    els.finUnreceived.textContent = data.fmtMoney(Math.max(0, total - received));
    els.finTotalInput.value = total > 0 ? total : '';
    els.finReceivedInput.value = received > 0 ? received : '';
    els.finRemark.value = financial.remark || '';
    els.finConfirmBox.hidden = currentStatus !== 'pending_confirm';
    els.finConfirmedTip.hidden = currentStatus === 'pending_confirm';
    renderPayGroup();
    renderInvoiceGroup();
    renderVouchers();
  }

  // 确认收款：状态流转至「订单已确认」并按收款额推导收款状态
  function confirmPayment() {
    const received = Number(els.finReceivedInput.value) || 0;
    if (received <= 0) {
      toast('请先填写本次收款金额', 'error');
      return;
    }
    const ok = data.transitionStatus(id, 'confirmed', '当前操作员', role, '财务确认收款');
    if (!ok) {
      toast('当前状态不允许确认收款', 'error');
      return;
    }
    const total = totalFreight();
    financial.receivedAmount = received;
    financial.paymentStatus = total > 0 && received >= total ? 'paid' : 'partial';
    data.upsertFinancial(financial);
    order.status = 'confirmed';
    currentStatus = 'confirmed';
    renderFinance();
    updateHeadStatus();
    renderStatusTrack();
    toast('收款已确认 · 即将切换至发运状态');
    setTimeout(() => switchTab('shipping'), 800);
  }

  // 保存财务信息（收款金额 / 收款与发票状态 / 备注）
  function saveFinance() {
    financial.receivedAmount = Number(els.finReceivedInput.value) || 0;
    financial.remark = els.finRemark.value.trim();
    data.upsertFinancial(financial);
    renderFinance();
    toast('财务信息已保存');
  }

  // 上传财务凭证
  function uploadFinVoucher() {
    const name = els.finVchName.value.trim();
    if (!name) {
      toast('请填写凭证名称', 'error');
      return;
    }
    data.addVoucher(financial, {
      name: name,
      type: els.finVchType.value,
      uploadedBy: data.ROLE_META[role].label,
      note: els.finVchNote.value.trim(),
    });
    data.upsertFinancial(financial);
    els.finVchName.value = '';
    els.finVchNote.value = '';
    renderVouchers();
    toast('凭证已上传');
  }

  /* ==================== 发运状态 ==================== */

  // 发运相关日志（操作或状态含发运关键字）
  function shippingLogs() {
    return logs.filter(l =>
      (l.action || '').indexOf('发运') >= 0
      || (l.action || '').indexOf('货物') >= 0
      || l.toStatus === 'shipping'
      || l.toStatus === 'shipped'
    );
  }

  // 时间轴条目通用渲染
  function tlItem(item) {
    return '<div class="tl-item">'
      + '<i class="tl-dot" style="background:' + item.color + '"></i>'
      + '<div class="tl-head">' + data.esc(item.stage) + roleBadge(item.role)
      + '<span class="tl-time">' + data.fmtDate(item.time) + '</span></div>'
      + (item.remark ? '<div class="tl-note">' + data.esc(item.remark) + '</div>' : '')
      + '</div>';
  }

  // 发运页整体渲染
  function renderShipping() {
    const canEdit = role === 'transport' || role === 'admin';
    const done = currentStatus === 'shipped' || currentStatus === 'completed';
    els.shipDenied.hidden = canEdit || done;
    els.shipOps.hidden = !canEdit;
    const st = shippingStats();
    els.shipPlanned.textContent = data.fmtNum(st.planned);
    els.shipShipped.textContent = data.fmtNum(st.shipped);
    els.shipRemaining.textContent = data.fmtNum(st.remaining);
    els.shipProgressFill.style.width = st.rate + '%';
    els.shipRate.textContent = st.rate + '%';
    els.shipChannelsSummary.textContent = st.total > 0
      ? '通道 ' + st.total + '（发运中 ' + st.shippingChannels + ' / 已完成 ' + st.completedChannels + '）'
      : '暂无运输通道';
    renderShipOps();
    renderShipChannels();
    renderShipLogs();
  }

  // 批次发货操作区（剩余可发运量大于 0 的通道）
  function renderShipOps() {
    const canEdit = role === 'transport' || role === 'admin';
    const avail = trackingList().filter(t => t.unshipped > 0);
    els.shipNoChannel.hidden = !canEdit || avail.length > 0;
    els.shipOpsForm.hidden = !canEdit || !avail.length;
    if (!canEdit || !avail.length) {
      els.shipStateBoxes.innerHTML = '';
      return;
    }
    const prev = els.shipChannel.value;
    els.shipChannel.innerHTML = avail.map(t =>
      '<option value="' + data.esc(t.shipping.capacityId) + '">'
      + data.esc(t.channelTitle + ' · ' + t.route + '（剩余 ' + data.fmtNum(t.unshipped) + '吨）')
      + '</option>'
    ).join('');
    if (avail.some(t => t.shipping.capacityId === prev)) els.shipChannel.value = prev;
    renderShipStateBoxes();
  }

  // 选中通道实时状态盒
  function renderShipStateBoxes() {
    const t = trackingList().find(x => x.shipping.capacityId === els.shipChannel.value);
    if (!t) {
      els.shipStateBoxes.innerHTML = '';
      return;
    }
    const meta = data.SHIPPING_META[t.shipping.state] || data.SHIPPING_META.not_started;
    els.shipStateBoxes.innerHTML =
      sbBox('剩余可发运量', data.fmtNum(t.unshipped, '吨'))
      + sbBox('已发运量', data.fmtNum(t.shipped, '吨'))
      + sbBox('通道状态', '<span style="color:' + meta.color + '">' + meta.label + '</span>');
  }

  // 各通道发运状态卡片
  function renderShipChannels() {
    const list = trackingList();
    if (!list.length) {
      els.shipChannels.innerHTML = '<div class="notice info">暂无运输通道，请先完成运力方案录入。</div>';
      return;
    }
    els.shipChannels.innerHTML = list.map(t => {
      const meta = data.SHIPPING_META[t.shipping.state] || data.SHIPPING_META.not_started;
      const vouchers = t.shipping.vouchers || [];
      return '<div class="state-box" style="border-left:4px solid ' + t.channelColor + ';text-align:left;margin-bottom:12px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '<div><span style="font-weight:600;font-size:14px">' + data.esc(t.channelTitle) + '</span>'
        + '<span class="v-meta" style="margin-left:8px">' + data.esc(t.route) + '</span></div>'
        + '<span class="role-badge" style="background:' + meta.bg + ';color:' + meta.color + '">' + meta.label + '</span>'
        + '</div>'
        + '<div class="mini-stats" style="grid-template-columns:repeat(3,1fr);margin:12px 0 8px">'
        + '<div><div class="mini-label">计划发运量</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.planned) + '<span class="unit">吨</span></div></div>'
        + '<div><div class="mini-label">已发运量</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.shipped) + '<span class="unit">吨</span></div></div>'
        + '<div><div class="mini-label">剩余待发</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.unshipped) + '<span class="unit">吨</span></div></div>'
        + '</div>'
        + '<div class="progress-bar"><i style="width:' + t.progress + '%"></i></div>'
        + '<div class="legend">'
        + '<span class="lg-item">进度 ' + t.progress + '%</span>'
        + '<span class="lg-item">计划时间 ' + data.fmtDate(t.shipping.planDate) + '</span>'
        + '<span class="lg-item">实际时间 ' + data.fmtDate(t.shipping.actualDate) + '</span>'
        + '<span class="lg-item">凭证 ' + vouchers.length + ' 份</span>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // 最近发运记录（最近 5 条关键日志）
  function renderShipLogs() {
    const list = shippingLogs().slice(0, 5);
    if (!list.length) {
      els.shipLogs.innerHTML = '<div class="v-meta" style="color:var(--gray-500)">暂无发运记录</div>';
      return;
    }
    els.shipLogs.innerHTML = list.map(l => tlItem({
      stage: l.action || '更新发运信息',
      time: l.createdAt,
      role: l.role,
      remark: l.remark || '',
      color: '#0071e3',
    })).join('');
  }

  // 批次发货：校验 → 累加发运量 → 通道状态推导 → 凭证 → 日志 → 订单状态流转
  function executeBatchShip() {
    const capId = els.shipChannel.value;
    const qty = Number(els.shipQty.value) || 0;
    const shipDate = els.shipDate.value;
    if (!capId) {
      toast('请选择运输通道', 'error');
      return;
    }
    if (qty <= 0) {
      toast('请填写本次发货量', 'error');
      return;
    }
    const s = shippings.find(x => x.capacityId === capId);
    if (!s) {
      toast('未找到对应通道的发运记录', 'error');
      return;
    }
    const planned = Number(s.plannedQty) || 0;
    const shipped = Number(s.shippedQty) || 0;
    const unshipped = Math.max(0, planned - shipped);
    if (qty > unshipped) {
      toast('本次发货量不能超过剩余可发运量 ' + data.fmtNum(unshipped) + ' 吨', 'error');
      return;
    }

    const cap = caps.find(c => c.id === capId) || {};
    const chLabel = channelTitle(cap) + '（' + channelRoute(cap) + '）';
    const oldState = s.state;
    s.shippedQty = shipped + qty;
    if (!s.actualDate) s.actualDate = shipDate;
    if (!s.planDate) s.planDate = shipDate;
    s.state = autoShippingState(Number(s.shippedQty), planned);
    const voucherName = els.shipVchName.value.trim();
    if (voucherName) {
      data.addVoucher(s, {
        name: voucherName,
        type: els.shipVchType.value,
        uploadedBy: data.ROLE_META[role].label,
        note: els.shipRemark.value.trim() || (shipDate + ' 发货 ' + data.fmtNum(qty) + '吨'),
      });
    }
    data.upsertShippings(id, shippings);

    const stateChanged = oldState !== s.state;
    const remark = chLabel + '：发货 ' + data.fmtNum(qty) + '吨（累计 ' + data.fmtNum(s.shippedQty) + '/' + data.fmtNum(planned) + '吨）'
      + (stateChanged ? '，状态变更：' + data.SHIPPING_META[oldState].label + ' → ' + data.SHIPPING_META[s.state].label : '');
    data.addOperationLog(id, '当前操作员', role, '批次发货操作', { remark: remark });

    // 订单状态流转：全部通道完成 → 发运完成；任一通道开始 → 发运中
    const allCompleted = shippings.length > 0 && shippings.every(x => x.state === 'completed');
    const anyShipping = shippings.some(x => x.state === 'shipping' || x.state === 'completed');
    if (allCompleted && currentStatus === 'shipping') {
      data.transitionStatus(id, 'shipped', '当前操作员', role, '全部通道发运完成');
      order.status = 'shipped';
      currentStatus = 'shipped';
    } else if (anyShipping && currentStatus === 'confirmed') {
      data.transitionStatus(id, 'shipping', '当前操作员', role, '开始发运');
      order.status = 'shipping';
      currentStatus = 'shipping';
    }

    // 表单重置（保留通道选择）
    els.shipQty.value = '';
    els.shipVchName.value = '';
    els.shipRemark.value = '';

    renderShipping();
    updateHeadStatus();
    renderStatusTrack();
    renderCargo();
    renderLogTimeline();
    renderLogRows();
    toast(stateChanged ? '发货成功 · 通道状态已更新' : '发货成功');
  }

  /* ==================== 仓储堆存 ==================== */

  // 仓储页整体渲染
  function renderWarehouse() {
    const canEdit = role === 'transport' || role === 'admin';
    els.whOps.hidden = !canEdit;
    const list = trackingList();
    els.whTransit.textContent = data.fmtNum(list.reduce((s, t) => s + t.inTransit, 0));
    els.whStored.textContent = data.fmtNum(list.reduce((s, t) => s + t.stored, 0));
    els.whPicked.textContent = data.fmtNum(list.reduce((s, t) => s + t.pickedUp, 0));
    renderWhOps();
    renderWhChannels();
  }

  // 仓储操作区（已发运量大于 0 的通道）
  function renderWhOps() {
    const canEdit = role === 'transport' || role === 'admin';
    const avail = trackingList().filter(t => t.shipped > 0);
    els.whNoChannel.hidden = !canEdit || avail.length > 0;
    els.whOpsForm.hidden = !canEdit || !avail.length;
    if (!canEdit || !avail.length) {
      els.whStateBoxes.innerHTML = '';
      return;
    }
    const prev = els.whChannel.value;
    els.whChannel.innerHTML = avail.map(t =>
      '<option value="' + data.esc(t.shipping.capacityId) + '">'
      + data.esc(t.channelTitle + ' · ' + t.route)
      + '</option>'
    ).join('');
    if (avail.some(t => t.shipping.capacityId === prev)) els.whChannel.value = prev;
    renderWhStateBoxes();
  }

  // 选中通道实时状态盒
  function renderWhStateBoxes() {
    const t = trackingList().find(x => x.shipping.capacityId === els.whChannel.value);
    if (!t) {
      els.whStateBoxes.innerHTML = '';
      return;
    }
    els.whStateBoxes.innerHTML =
      sbBox('当前堆存量', data.fmtNum(t.stored, '吨'))
      + sbBox('已发运量', data.fmtNum(t.shipped, '吨'))
      + sbBox('在途运输量', data.fmtNum(t.inTransit, '吨'));
  }

  // 各通道仓储状态卡片
  function renderWhChannels() {
    const list = trackingList();
    if (!list.length) {
      els.whChannels.innerHTML = '<div class="notice info">暂无运输通道，请先完成运力方案录入。</div>';
      return;
    }
    els.whChannels.innerHTML = list.map(t => {
      const meta = data.SHIPPING_META[t.shipping.state] || data.SHIPPING_META.not_started;
      const vouchers = t.shipping.vouchers || [];
      return '<div class="state-box" style="border-left:4px solid ' + t.channelColor + ';text-align:left;margin-bottom:12px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '<div><span style="font-weight:600;font-size:14px">' + data.esc(t.channelTitle) + '</span>'
        + '<span class="v-meta" style="margin-left:8px">' + data.esc(t.route) + '</span></div>'
        + '<span class="role-badge" style="background:' + meta.bg + ';color:' + meta.color + '">' + meta.label + '</span>'
        + '</div>'
        + '<div class="mini-stats" style="grid-template-columns:repeat(4,1fr);margin:12px 0 0">'
        + '<div><div class="mini-label">已发运量</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.shipped) + '<span class="unit">吨</span></div></div>'
        + '<div><div class="mini-label">在途运输</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.inTransit) + '<span class="unit">吨</span></div></div>'
        + '<div><div class="mini-label">仓储堆存</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.stored) + '<span class="unit">吨</span></div></div>'
        + '<div><div class="mini-label">已提货出关</div><div class="mini-value" style="font-size:16px">' + data.fmtNum(t.pickedUp) + '<span class="unit">吨</span></div></div>'
        + '</div>'
        + '<div class="legend" style="margin-top:10px"><span class="lg-item">凭证 ' + vouchers.length + ' 份</span></div>'
        + '</div>';
    }).join('');
  }

  // 仓储操作：校验 → 堆存/提货登记 → 凭证 → 日志（不影响订单状态）
  function executeWarehouseOp() {
    const capId = els.whChannel.value;
    const arriveQty = Number(els.whArrive.value) || 0;
    const pickupQty = Number(els.whPick.value) || 0;
    const operateDate = els.whDate.value;
    if (!capId) {
      toast('请选择运输通道', 'error');
      return;
    }
    if (arriveQty <= 0 && pickupQty <= 0) {
      toast('请至少填写到货入库量或提货出关量', 'error');
      return;
    }
    const s = shippings.find(x => x.capacityId === capId);
    if (!s) {
      toast('未找到对应通道的发运记录', 'error');
      return;
    }
    const stored = Number(s.storedQty) || 0;
    const pickedUp = Number(s.pickedUpQty) || 0;
    const shipped = Number(s.shippedQty) || 0;
    const newStored = stored + arriveQty - pickupQty;
    if (newStored < 0) {
      toast('提货出关量不能超过当前堆存量 ' + data.fmtNum(stored) + ' 吨', 'error');
      return;
    }
    const inTransit = Math.max(0, shipped - stored - pickedUp);
    if (arriveQty > inTransit) {
      toast('到货入库量不能超过在途运输量 ' + data.fmtNum(inTransit) + ' 吨', 'error');
      return;
    }

    s.storedQty = newStored;
    s.pickedUpQty = pickedUp + pickupQty;
    const voucherName = els.whVchName.value.trim();
    if (voucherName) {
      data.addVoucher(s, {
        name: voucherName,
        type: els.whVchType.value,
        uploadedBy: data.ROLE_META[role].label,
        note: els.whRemark.value.trim() || (operateDate + ' ' + (arriveQty > 0 ? '到货' : '提货') + '操作'),
      });
    }
    data.upsertShippings(id, shippings);

    const cap = caps.find(c => c.id === capId) || {};
    const parts = [];
    if (arriveQty > 0) parts.push('到货入库 ' + data.fmtNum(arriveQty) + '吨（累计堆存 ' + data.fmtNum(newStored) + '吨）');
    if (pickupQty > 0) parts.push('提货出关 ' + data.fmtNum(pickupQty) + '吨（累计提货 ' + data.fmtNum(s.pickedUpQty) + '吨）');
    data.addOperationLog(id, '当前操作员', role, '仓储堆存操作', {
      remark: channelTitle(cap) + '（' + channelRoute(cap) + '）：' + parts.join('，'),
    });

    els.whArrive.value = '';
    els.whPick.value = '';
    els.whVchName.value = '';
    els.whRemark.value = '';

    renderWarehouse();
    renderCargo();
    renderLogTimeline();
    renderLogRows();
    toast('仓储操作已登记');
  }

  /* ==================== 货物动态 ==================== */

  // 货物动态：摘要 + 四色堆叠条 + 阶段卡 + 通道追踪
  function renderCargo() {
    const st = shippingStats();
    const list = trackingList();
    const transit = list.reduce((s, t) => s + t.inTransit, 0);
    const allocQty = caps.reduce((s, c) => s + (Number(c.plannedQty) || 0), 0);
    els.cargoHead.innerHTML = '初始分配总量 <b>' + data.fmtNum(allocQty) + '</b> 吨'
      + ' · 已发运 <b>' + st.rate + '%</b>'
      + ' · 已提货出关 <b>' + (allocQty > 0 ? Math.round(st.pickedUp / allocQty * 100) : 0) + '%</b>';
    els.cgUnshipped.textContent = data.fmtNum(st.remaining);
    els.cgTransit.textContent = data.fmtNum(transit);
    els.cgStored.textContent = data.fmtNum(st.stored);
    els.cgPicked.textContent = data.fmtNum(st.pickedUp);

    // 全局四色堆叠条
    const segs = [
      ['未发运', st.remaining, '#e5e5ea'],
      ['运输中（在途）', transit, '#0071e3'],
      ['仓储堆存', st.stored, '#ff9500'],
      ['已提货出关', st.pickedUp, '#34c759'],
    ];
    const segTotal = segs.reduce((s, x) => s + x[1], 0);
    els.cargoStack.innerHTML = segTotal > 0 ? segs.filter(x => x[1] > 0).map(x => {
      const pct = Math.round(x[1] / segTotal * 100);
      const label = pct >= 8 ? '<span style="color:#fff;font-size:10px;padding:0 4px">' + pct + '%</span>' : '';
      return '<i style="width:' + pct + '%;background:' + x[2] + ';display:flex;align-items:center;justify-content:center">' + label + '</i>';
    }).join('') : '';
    els.cargoLegend.innerHTML = segs.map(x =>
      '<span class="lg-item"><i class="lg-dot" style="background:' + x[2] + '"></i>' + x[0] + ' ' + data.fmtNum(x[1]) + '吨</span>'
    ).join('');

    // 通道货物追踪（分通道四态分布）
    if (!list.length) {
      els.cargoChannels.innerHTML = '<div class="notice info">暂无运输通道，请先完成运力方案录入。</div>';
      return;
    }
    els.cargoChannels.innerHTML = list.map(t => {
      const cSegs = [
        ['未发运', t.unshipped, '#e5e5ea'],
        ['运输中（在途）', t.inTransit, '#0071e3'],
        ['仓储堆存', t.stored, '#ff9500'],
        ['已提货出关', t.pickedUp, '#34c759'],
      ];
      const cTotal = cSegs.reduce((s, x) => s + x[1], 0);
      return '<div class="state-box" style="border-left:4px solid ' + t.channelColor + ';text-align:left;margin-bottom:12px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '<span style="font-weight:600;font-size:14px">' + data.esc(t.channelTitle) + '</span>'
        + '<span class="v-meta">' + data.esc(t.route) + '</span>'
        + '</div>'
        + '<div class="stack-bar" style="margin:10px 0">'
        + (cTotal > 0 ? cSegs.filter(x => x[1] > 0).map(x => '<i style="width:' + (x[1] / cTotal * 100) + '%;background:' + x[2] + '"></i>').join('') : '')
        + '</div>'
        + '<div class="legend">' + cSegs.map(x =>
          '<span class="lg-item"><i class="lg-dot" style="background:' + x[2] + '"></i>' + x[0] + ' ' + data.fmtNum(x[1]) + '吨</span>'
        ).join('') + '</div>'
        + '</div>';
    }).join('');
  }

  /* ==================== 运输时间轴 ==================== */

  // 货物运输时间轴：前三节点取各环节录入时间，后续取关键日志（与蓝本 autoTimeline 一致）
  function autoTimeline() {
    const items = [];

    // 节点 1：订单创建
    items.push({
      stage: '订单创建',
      time: order.createdAt,
      role: 'sales',
      remark: '订单编号 ' + order.id + ' · 货物 ' + (order.cargoName || '—') + ' ' + data.fmtNum(Number(order.cargoTotal) || 0) + ' 吨',
      color: '#8e8e93',
    });

    // 节点 2：港口信息录入
    if (port && (port.portName || port.wharf || port.berth)) {
      items.push({
        stage: '港口信息录入',
        time: port.updatedAt,
        role: 'port',
        remark: (port.portName || '—') + ' · ' + congLabelOf(port.congestion) + ' · 等待 ' + data.fmtNum(Number(port.waitHours) || 0) + 'h',
        color: '#ff9500',
      });
    }

    // 节点 3：运输组织方案录入（时间取方案保存时间，运力行不落 updatedAt）
    if (caps.length) {
      items.push({
        stage: '运输组织方案录入',
        time: plan ? plan.updatedAt : '',
        role: 'capacity',
        remark: caps.length + ' 条运输通道 · 总运费 ' + data.fmtMoney(totalFreight()) + ' · 运输时间 ' + maxLeadTime() + ' 天',
        color: '#af52de',
      });
    }

    // 节点 4+：关键日志映射（其余日志跳过）
    logs.forEach(l => {
      const to = l.toStatus;
      if (to === 'pending_confirm') {
        items.push({ stage: '运输方案完成', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#af52de' });
      } else if (to === 'confirmed') {
        items.push({ stage: '财务确认收款', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#34c759' });
      } else if (to === 'shipping') {
        items.push({ stage: '开始发运', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#0071e3' });
      } else if (to === 'shipped') {
        items.push({ stage: '全部发运完成', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#34c759' });
      } else if (to === 'completed') {
        items.push({ stage: '订单已完成', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#34c759' });
      } else if ((l.action || '').indexOf('发运') >= 0) {
        items.push({ stage: '更新发运信息', time: l.createdAt, role: l.role, remark: l.remark || l.action, color: '#0071e3' });
      } else if ((l.action || '').indexOf('财务') >= 0) {
        items.push({ stage: l.action || '财务操作', time: l.createdAt, role: l.role, remark: l.remark || '', color: '#34c759' });
      }
    });

    return items.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  function renderLogTimeline() {
    const items = autoTimeline();
    if (!items.length) {
      els.logTimeline.innerHTML = '<div class="v-meta" style="color:var(--gray-500)">暂无时间轴数据</div>';
      return;
    }
    els.logTimeline.innerHTML = items.map(item => tlItem(item)).join('');
  }

  // 完整操作日志表
  function renderLogRows() {
    if (!logs.length) {
      els.logRows.innerHTML = '<tr><td colspan="6" style="color:var(--gray-500)">暂无操作日志</td></tr>';
      return;
    }
    els.logRows.innerHTML = logs.map(l => {
      const badge = roleBadge(l.role) || '<span style="color:var(--gray-500)">' + data.esc(l.role || '—') + '</span>';
      let statusChange = '<span style="color:var(--gray-500)">—</span>';
      if (l.fromStatus || l.toStatus) {
        const from = data.STATUS_META[l.fromStatus];
        const to = data.STATUS_META[l.toStatus];
        statusChange = '<span class="st-chips">'
          + (from ? '<span class="st-chip" style="background:' + from.bg + ';color:' + from.color + '">' + from.label + '</span>' : '')
          + '<span style="color:var(--gray-500)">→</span>'
          + (to ? '<span class="st-chip" style="background:' + to.bg + ';color:' + to.color + '">' + to.label + '</span>' : '')
          + '</span>';
      }
      return '<tr>'
        + '<td>' + data.fmtDate(l.createdAt) + '</td>'
        + '<td>' + data.esc(l.operator || '—') + '</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + data.esc(l.action || '—') + '</td>'
        + '<td>' + statusChange + '</td>'
        + '<td>' + data.esc(l.remark || '—') + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ==================== 删除订单 ==================== */

  function handleDelete() {
    if (!window.confirm('确认删除订单 ' + order.id + ' 及其所有关联数据？')) return;
    data.deleteOrder(id);
    location.href = '../business.html';
  }

  /* ==================== 事件绑定 ==================== */

  // 角色切换：重渲权限相关区域
  els.roleSelect.addEventListener('change', () => {
    role = els.roleSelect.value;
    renderShipping();
    renderWarehouse();
  });

  // 页签切换（事件委托）
  els.tabs.addEventListener('click', e => {
    const btn = e.target.closest('.tab[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  $('btn-confirm-pay').addEventListener('click', confirmPayment);
  $('btn-save-fin').addEventListener('click', saveFinance);
  $('btn-fin-vch').addEventListener('click', uploadFinVoucher);
  $('btn-exec-ship').addEventListener('click', executeBatchShip);
  $('btn-exec-wh').addEventListener('click', executeWarehouseOp);
  $('btn-goto-log').addEventListener('click', () => switchTab('log'));
  els.delBtn.addEventListener('click', handleDelete);

  // 收款/发票状态切换 + 财务凭证删除（事件委托）
  document.addEventListener('click', e => {
    const payBtn = e.target.closest('[data-fin-pay]');
    if (payBtn) {
      financial.paymentStatus = payBtn.dataset.finPay;
      renderPayGroup();
      return;
    }
    const invBtn = e.target.closest('[data-fin-inv]');
    if (invBtn) {
      financial.invoiceStatus = invBtn.dataset.finInv;
      renderInvoiceGroup();
      return;
    }
    const delBtn = e.target.closest('[data-fin-vdel]');
    if (delBtn) {
      data.removeVoucher(financial, delBtn.dataset.finVdel);
      data.upsertFinancial(financial);
      renderVouchers();
      toast('凭证已删除');
    }
  });

  // 通道切换：实时状态盒联动
  els.shipChannel.addEventListener('change', renderShipStateBoxes);
  els.whChannel.addEventListener('change', renderWhStateBoxes);

  /* ==================== 初始化渲染 ==================== */

  els.headMono.textContent = order.id;
  els.headCreated.textContent = data.fmtDate(order.createdAt);
  els.headUpdated.textContent = data.fmtDate(order.updatedAt);
  updateHeadStatus();
  renderStatusTrack();
  renderBasicKv();
  renderBasicChips();
  renderBasicPort();
  renderBasicTransport();
  renderBasicCaps();
  renderBasicBatches();
  renderFinance();
  renderShipping();
  renderWarehouse();
  renderCargo();
  renderLogTimeline();
  renderLogRows();

  // 凭证类型下拉
  [els.finVchType, els.shipVchType, els.whVchType].forEach(sel => {
    sel.innerHTML = data.VOUCHER_TYPES.map(t => '<option value="' + data.esc(t) + '">' + data.esc(t) + '</option>').join('');
  });

  // 发货 / 仓储操作时间默认当前
  els.shipDate.value = data.toLocalInput(new Date());
  els.whDate.value = data.toLocalInput(new Date());

  // 解除隐藏，默认展示基本信息页签
  els.head.hidden = false;
  els.statusTrack.hidden = false;
  els.tabs.hidden = false;
  switchTab('basic');
})();
