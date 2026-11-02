// ===== order-capacity 模块脚本（业务总览 · 运力方案页）=====
// 复刻 hongze_demo CapacityFormPage：铁路直达 / 公铁联运 / 公路直达三通道运力编辑
// + 四态货物分配指标 + 运输组织方案 PDF 报告 + 完成方案浮层
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
    stepBackForm: $('step-back-form'),
    stepBackPort: $('step-back-port'),
    head: $('head'),
    headMono: $('head-mono'),
    headCargo: $('head-cargo'),
    savedTip: $('saved-tip'),
    metrics: $('metrics'),
    mFreight: $('m-freight'),
    mFreightNote: $('m-freight-note'),
    mLead: $('m-lead'),
    mAlloc: $('m-alloc'),
    allocBar: $('alloc-bar'),
    allocFill: $('alloc-fill'),
    mAllocNote: $('m-alloc-note'),
    mIdle: $('m-idle'),
    mIdleNote: $('m-idle-note'),
    railSection: $('rail-section'),
    directList: $('direct-list'),
    transitList: $('transit-list'),
    countDirect: $('count-direct'),
    countTransit: $('count-transit'),
    roadSection: $('road-section'),
    roadList: $('road-list'),
    countRoad: $('count-road'),
    footer: $('footer'),
    btnPrev: $('btn-prev'),
    btnDetail: $('btn-detail'),
    doneMask: $('done-mask'),
    doneMono: $('done-mono'),
    btnGotoDetail: $('btn-goto-detail'),
    rptSub: $('rpt-sub'),
    rptOrderKv: $('rpt-order-kv'),
    rptPortBlock: $('rpt-port-block'),
    rptPortKv: $('rpt-port-kv'),
    rptRailH: $('rpt-h-rail'),
    rptRailRows: $('rpt-rail-rows'),
    rptRoadH: $('rpt-h-road'),
    rptRoadRows: $('rpt-road-rows'),
    rptMetricH: $('rpt-h-metric'),
    rptMetrics: $('rpt-metrics'),
    toast: $('toast'),
  };

  const id = new URLSearchParams(location.search).get('id') || '';
  const order = id ? data.getOrder(id) : undefined;

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
      saveAll();
      showSaved();
    }, 800);
  }

  /* ==================== 三通道运力模型 ==================== */

  // 三类通道行列表：directs（铁路直达）/ transits（公铁联运）/ roads（公路直达）
  const directs = [];
  const transits = [];
  const roads = [];

  // 空白行工厂：均生成独立运力记录 id（保存后与运输方案批次通过 capacityId 关联）
  function makeDirect() {
    return { id: data.genCapacityId(), channelType: 'rail_direct', origin: '', destination: '', idleCapacity: 0, plannedQty: 0, price: 0, leadTime: 0, carrier: '' };
  }
  function makeTransit(transfer) {
    return { id: data.genCapacityId(), channelType: 'rail_transit', origin: '', transfer: transfer || '', destination: '', idleCapacity: 0, plannedQty: 0, price: 0, leadTime: 0, carrier: '', roadCarrier: '' };
  }
  function makeRoad() {
    return { id: data.genCapacityId(), channelType: 'road', origin: '', destination: '', idleCapacity: 0, plannedQty: 0, price: 0, leadTime: 0, carrier: '' };
  }

  // 加载已有运力记录：空则各补一条空白行；旧固定中转站类型归一为 rail_transit
  function loadCapacities() {
    const list = data.listCapacities(id);
    if (!list.length) {
      directs.push(makeDirect());
      transits.push(makeTransit());
      roads.push(makeRoad());
      return;
    }
    list.forEach(c => {
      if (c.channelType === 'road') {
        roads.push(Object.assign(makeRoad(), c));
      } else if (c.channelType === 'rail_direct') {
        directs.push(Object.assign(makeDirect(), c));
      } else {
        // 兼容旧数据：rail_caozhuang / rail_xingtai 迁移为 rail_transit + transfer
        const transfer = c.transfer
          || (c.channelType === 'rail_caozhuang' ? '曹庄镇站' : c.channelType === 'rail_xingtai' ? '邢台南站' : '');
        transits.push(Object.assign(makeTransit(transfer), c, { channelType: 'rail_transit', transfer }));
      }
    });
  }

  /* ==================== 行渲染 ==================== */

  // 通道行元信息：名称前缀 + 主题色
  const ROW_META = {
    direct: { name: '铁路直达路线', color: data.CHANNEL_META.rail_direct.color },
    transit: { name: '公铁联运路线', color: data.CHANNEL_META.rail_transit.color },
    road: { name: '公路路线', color: data.CHANNEL_META.road.color },
  };

  // 各通道字段渲染顺序
  const FIELD_SEQ = {
    direct: ['origin', 'destination', 'idleCapacity', 'plannedQty', 'price', 'leadTime', 'carrier'],
    transit: ['origin', 'transfer', 'destination', 'idleCapacity', 'plannedQty', 'price', 'leadTime', 'carrier', 'roadCarrier'],
    road: ['origin', 'destination', 'idleCapacity', 'plannedQty', 'price', 'leadTime', 'carrier'],
  };

  // 数字字段（Number 化处理）
  const NUM_FIELDS = ['idleCapacity', 'plannedQty', 'price'];

  // 字段标签
  function fieldLabel(kind, f) {
    switch (f) {
      case 'origin': return kind === 'direct' ? '起点站' : '起点';
      case 'destination': return kind === 'direct' ? '终点站' : '终点';
      case 'transfer': return '中转节点';
      case 'idleCapacity': return '运力（吨/天）';
      case 'plannedQty': return '计划运输货物量（吨）';
      case 'price': return kind === 'direct' ? '单位运费（元/吨）' : '单位运输价格（元/吨）';
      case 'leadTime': return '运输时效（天）';
      case 'carrier': return kind === 'road' ? '承运商' : '铁路承运商';
      case 'roadCarrier': return '公路承运商';
      default: return f;
    }
  }

  // 搜索下拉配置：候选 / 占位提示 / 自定义占位（非下拉字段返回 null）
  function fieldConf(kind, f) {
    if (kind === 'direct') {
      if (f === 'origin') return { options: data.RAIL_STATION_OPTIONS, ph: '如：黄骅站', other: '如：黄骅站' };
      if (f === 'destination') return { options: data.RAIL_STATION_OPTIONS, ph: '如：邯郸站', other: '如：邯郸站' };
      if (f === 'carrier') return { options: data.RAIL_CARRIERS, ph: '请选择', other: '如：中铁快运' };
      return null;
    }
    if (f === 'transfer') return { options: data.TRANSFER_OPTIONS, ph: '请选择', other: '如：邢台东站' };
    if (f === 'origin') return { options: data.ROAD_LOCATION_OPTIONS, ph: '如：黄骅港', other: '如：黄骅港散货码头' };
    if (f === 'destination') {
      return kind === 'road'
        ? { options: data.ROAD_LOCATION_OPTIONS, ph: '如：邯郸武安钢厂', other: '如：邯郸武安钢厂' }
        : { options: data.ROAD_LOCATION_OPTIONS, ph: '如：邯郸钢厂', other: '如：武安保税物流园' };
    }
    if (f === 'carrier' || f === 'roadCarrier') return { options: data.ROAD_CARRIERS, ph: '请选择', other: '如：万合集团' };
    return null;
  }

  // 数字字段占位提示
  function numPlaceholder(kind, f) {
    if (f === 'idleCapacity') return kind === 'road' ? '如：2000' : '如：5000';
    if (f === 'plannedQty') return kind === 'road' ? '如：8000' : '如：10000';
    return kind === 'road' ? '如：90' : '如：65';
  }

  // 运输时效自动计算：计划运输量 ÷ 运力（向上取整）
  function calcLeadTime(r) {
    return r.idleCapacity > 0 ? Math.ceil(r.plannedQty / r.idleCapacity) : 0;
  }

  // 渲染单字段 HTML：数字输入 / 只读时效 / 搜索下拉
  function fieldHtml(kind, f, r) {
    const label = '<label class="field-label">' + fieldLabel(kind, f) + '</label>';
    if (f === 'leadTime') {
      return (
        '<div class="field">' + label +
          '<input type="text" class="field-input" data-lead="' + r.id + '" value="' + (r.leadTime || 0) + '" readonly style="background:var(--gray-200);color:var(--gray-500)" />' +
          '<div class="hint">' + (kind === 'direct' ? '自动计算：计划运输量 ÷ 运力' : '自动计算') + '</div>' +
        '</div>'
      );
    }
    if (NUM_FIELDS.indexOf(f) !== -1) {
      return (
        '<div class="field">' + label +
          '<input type="number" class="field-input" data-f="' + f + '" data-row="' + r.id + '" value="' + (r[f] || 0) + '" placeholder="' + numPlaceholder(kind, f) + '" />' +
        '</div>'
      );
    }
    const conf = fieldConf(kind, f);
    return (
      '<div class="field">' + label +
        '<div class="ss">' +
          '<input type="text" class="field-input ss-input" data-f="' + f + '" data-row="' + r.id + '" placeholder="' + conf.ph + '" autocomplete="off" />' +
          '<div class="ss-panel" data-ss-panel></div>' +
        '</div>' +
      '</div>'
    );
  }

  // 渲染单行 HTML：内联左边框标识通道色 + 行头序号圆块（首行不提供删除按钮）
  function rowHtml(kind, r, idx) {
    const meta = ROW_META[kind];
    const fields = FIELD_SEQ[kind].map(f => fieldHtml(kind, f, r)).join('');
    const del = idx > 0 ? '<button type="button" class="route-del" data-del title="删除该路线">✕</button>' : '';
    return (
      '<div class="route-row" data-row="' + r.id + '" style="border-left:3px solid ' + meta.color + '">' +
        '<div class="route-head">' +
          '<span style="width:22px;height:22px;border-radius:6px;background:' + meta.color + ';color:#fff;font-size:12px;font-weight:600;display:inline-flex;align-items:center;justify-content:center">' + (idx + 1) + '</span>' +
          '<span>' + meta.name + ' ' + (idx + 1) + '</span>' +
          del +
        '</div>' +
        '<div class="fgrid cols-3">' + fields + '</div>' +
      '</div>'
    );
  }

  // 渲染某一通道列表：重建 DOM → 回填下拉值 → 绑定搜索下拉 → 刷新折叠计数
  function renderList(kind) {
    const rows = { direct: directs, transit: transits, road: roads }[kind];
    const container = { direct: els.directList, transit: els.transitList, road: els.roadList }[kind];
    container.innerHTML = rows.map((r, i) => rowHtml(kind, r, i)).join('');

    container.querySelectorAll('.ss-input').forEach(input => {
      const found = rowById(input.dataset.row);
      if (!found) return;
      const v = found.row[input.dataset.f];
      if (v) input.value = v;
      wireSearchSelect(
        input.parentElement.querySelector('[data-ss-panel]'),
        fieldConf(found.kind, input.dataset.f),
        () => setRow(input.dataset.row, input.dataset.f, input.value)
      );
    });

    refreshCounts();
  }

  /* ==================== 搜索下拉（原生实现，含"其他"自定义选项） ==================== */

  // 与 order-form.js setupSearchSelect 同源：动态行场景改为 onPick 回调，
  // 面板收起由全局 click 委托统一处理（避免每次重渲染重复绑定 document 监听）
  function wireSearchSelect(panel, conf, onPick) {
    const input = panel.parentElement.querySelector('.ss-input');

    function renderPanel(keyword) {
      const q = (keyword || '').trim().toLowerCase();
      const list = conf.options.filter(o => !q || o.toLowerCase().indexOf(q) !== -1);
      let html = list.map(o =>
        '<div class="ss-option" data-value="' + data.esc(o) + '">' + data.esc(o) + '</div>'
      ).join('');
      if (!list.length) {
        html += '<div class="ss-option" style="color:var(--gray-400);cursor:default">无匹配项</div>';
      }
      html += '<div class="ss-option custom" data-other>其他：' + data.esc(conf.other) + '</div>';
      panel.innerHTML = html;
    }

    // "其他"自定义输入模式：面板切换为输入框 + 确定
    function renderCustom() {
      panel.innerHTML =
        '<div style="display:flex;gap:8px;padding:8px">' +
          '<input class="field-input ss-custom-input" placeholder="' + data.esc(conf.other) + '" maxlength="50" style="flex:1" />' +
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
      onPick();
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
        onPick();
        return;
      }
      if (e.target.closest('[data-other]')) renderCustom();
    });
  }

  /* ==================== 行数据操作 ==================== */

  // 按行 id 查找所属通道与行对象
  function rowById(rid) {
    let row = directs.find(r => r.id === rid);
    if (row) return { row, kind: 'direct' };
    row = transits.find(r => r.id === rid);
    if (row) return { row, kind: 'transit' };
    row = roads.find(r => r.id === rid);
    if (row) return { row, kind: 'road' };
    return null;
  }

  // 更新行字段：数字字段 Number 化；时效自动计算并直更只读框；不重渲染（避免输入中断）
  function setRow(rid, f, v) {
    const found = rowById(rid);
    if (!found) return;
    const row = found.row;
    row[f] = NUM_FIELDS.indexOf(f) !== -1 ? (Number(v) || 0) : v;
    row.leadTime = calcLeadTime(row);
    const leadInput = document.querySelector('[data-lead="' + rid + '"]');
    if (leadInput) leadInput.value = row.leadTime;
    refreshMetrics();
    scheduleAutoSave();
  }

  // 添加路线行
  function addRow(kind) {
    if (kind === 'direct') directs.push(makeDirect());
    else if (kind === 'transit') transits.push(makeTransit());
    else roads.push(makeRoad());
    renderList(kind);
    refreshMetrics();
    scheduleAutoSave();
  }

  // 删除路线行（首行不提供删除按钮，仅处理 idx > 0 的删除）
  function removeRow(kind, rid) {
    const rows = { direct: directs, transit: transits, road: roads }[kind];
    const idx = rows.findIndex(r => r.id === rid);
    if (idx === -1) return;
    rows.splice(idx, 1);
    renderList(kind);
    refreshMetrics();
    scheduleAutoSave();
  }

  // 折叠头路线计数
  function refreshCounts() {
    els.countDirect.textContent = directs.length + ' 条';
    els.countTransit.textContent = transits.length + ' 条';
    els.countRoad.textContent = roads.length + ' 条';
  }

  /* ==================== 核心指标 ==================== */

  // 汇总计算：总运费 / 已分配量 / 分通道闲置运力 / 关键路径时效 / 分配状态四态
  function computeMetrics() {
    const all = directs.concat(transits, roads);
    let totalFreight = 0;
    let allocatedQty = 0;
    let railIdle = 0;
    let roadIdle = 0;
    let maxLead = 0;
    all.forEach(r => {
      if (r.plannedQty > 0 && r.price > 0) totalFreight += r.plannedQty * r.price;
      if (r.plannedQty > 0) allocatedQty += r.plannedQty;
      if (r.idleCapacity > 0) {
        if (r.channelType === 'road') roadIdle += r.idleCapacity;
        else railIdle += r.idleCapacity;
      }
      if (r.leadTime > maxLead) maxLead = r.leadTime;
    });
    const cargoTotal = Number(order.cargoTotal) || 0;
    const unallocated = cargoTotal - allocatedQty;
    const rate = cargoTotal > 0 ? Math.min(100, Math.round(allocatedQty / cargoTotal * 100)) : 0;
    const status = cargoTotal <= 0 ? 'empty' : unallocated > 0 ? 'warning' : unallocated === 0 ? 'success' : 'over';
    return { totalFreight, allocatedQty, railIdle, roadIdle, maxLead, cargoTotal, unallocated, rate, status };
  }

  // 分配状态配色（作用指标值与提示文字）
  const ALLOC_COLOR = {
    empty: 'var(--gray-400)',
    warning: 'var(--color-warning)',
    success: 'var(--color-success)',
    over: 'var(--color-danger)',
  };

  // 分配状态四态文案
  function allocNote(m) {
    if (m.status === 'empty') return '请先录入货物总量';
    if (m.status === 'warning') return '已分配 ' + data.fmtNum(m.allocatedQty) + ' / ' + data.fmtNum(m.cargoTotal) + ' 吨 · 待分配 ' + data.fmtNum(m.unallocated) + ' 吨';
    if (m.status === 'success') return '已全部分配 · ' + data.fmtNum(m.cargoTotal) + ' 吨';
    return '超分配 ' + data.fmtNum(-m.unallocated) + ' 吨';
  }

  // 刷新四张指标卡
  function refreshMetrics() {
    const m = computeMetrics();
    els.mFreight.textContent = m.totalFreight > 0 ? data.fmtMoney(m.totalFreight) : '—';
    els.mFreightNote.textContent = m.totalFreight > 0
      ? '共 ' + (directs.length + transits.length + roads.length) + ' 条通道'
      : '未填写运输量';
    els.mLead.textContent = m.maxLead;
    els.mAlloc.innerHTML = m.rate + '<span class="unit">%</span>';
    els.mAlloc.style.color = ALLOC_COLOR[m.status];
    els.allocBar.className = 'alloc-bar' + (m.status === 'success' ? ' ok' : m.status === 'over' ? ' over' : '');
    els.allocFill.style.width = m.rate + '%';
    els.mAllocNote.textContent = allocNote(m);
    els.mAllocNote.style.color = ALLOC_COLOR[m.status];
    els.mIdle.textContent = m.railIdle + m.roadIdle;
    els.mIdleNote.textContent = '铁路 ' + data.fmtNum(m.railIdle) + ' · 公路 ' + data.fmtNum(m.roadIdle);
  }

  /* ==================== 保存 / 完成 / 报告 ==================== */

  // 保存全部通道运力：整体替换该订单运力记录（含 id，供运输方案批次按 capacityId 关联）
  function saveAll() {
    const list = [];
    directs.forEach(r => list.push({
      id: r.id, orderId: id, channelType: 'rail_direct',
      origin: r.origin, destination: r.destination,
      idleCapacity: Number(r.idleCapacity) || 0, plannedQty: Number(r.plannedQty) || 0,
      price: Number(r.price) || 0, leadTime: Number(r.leadTime) || 0, carrier: r.carrier,
    }));
    transits.forEach(r => {
      const item = {
        id: r.id, orderId: id, channelType: 'rail_transit',
        origin: r.origin, transfer: r.transfer, destination: r.destination,
        idleCapacity: Number(r.idleCapacity) || 0, plannedQty: Number(r.plannedQty) || 0,
        price: Number(r.price) || 0, leadTime: Number(r.leadTime) || 0, carrier: r.carrier,
      };
      if (r.roadCarrier) item.roadCarrier = r.roadCarrier;
      list.push(item);
    });
    roads.forEach(r => list.push({
      id: r.id, orderId: id, channelType: 'road',
      origin: r.origin, destination: r.destination,
      idleCapacity: Number(r.idleCapacity) || 0, plannedQty: Number(r.plannedQty) || 0,
      price: Number(r.price) || 0, leadTime: Number(r.leadTime) || 0, carrier: r.carrier,
    }));
    data.upsertCapacities(id, list);
  }

  // 完成方案：保存 + 状态更新为待确认 + 展示完成浮层（导出由浮层内"下载 PDF"触发）
  function completePlan() {
    saveAll();
    data.updateOrderStatus(id, 'pending_confirm');
    els.doneMask.hidden = false;
  }

  // 报告键值对片段（strong 为 true 时值加粗）
  function kv(label, value, strong) {
    return '<div><b>' + label + '</b>' + (strong ? '<strong>' : '') + data.esc(value || '—') + (strong ? '</strong>' : '') + '</div>';
  }

  // 构建运输组织方案报告：订单 / 港口 / 铁路 / 公路 / 核心指标五节（无港口时章节号前移）
  function buildReport() {
    els.rptSub.textContent = '订单编号：' + order.id + ' · 生成时间：' + data.fmtDate(new Date().toISOString());

    els.rptOrderKv.innerHTML =
      kv('贸易商', order.trader) +
      (order.traderContact ? kv('联系人', order.traderContact) : '') +
      (order.traderContactInfo ? kv('联系方式', order.traderContactInfo) : '') +
      kv('货物名称', order.cargoName) +
      kv('货物总量', data.fmtNum(order.cargoTotal) + ' 吨', true) +
      kv('货物单价', data.fmtMoney(order.cargoPrice) + ' /吨') +
      kv('货物品质', order.cargoQuality) +
      kv('来源矿山', order.mine) +
      kv('运输船舶', order.vessel) +
      kv('到达港口', order.destPort) +
      kv('终端钢厂', data.customersDisplay(order.customers) || '—') +
      kv('销售数量合计', data.fmtNum(data.customersTotalQty(order.customers)) + ' 吨', true);

    // 港口信息：存在任一关键字段才输出该节
    const port = data.getPort(id);
    const hasPort = !!(port && (port.portName || port.wharf || port.berth));
    els.rptPortBlock.hidden = !hasPort;
    if (hasPort) {
      const cong = data.CONGESTION_OPTIONS.find(c => c.value === port.congestion);
      els.rptPortKv.innerHTML =
        kv('港口名称', port.portName) +
        kv('拥堵状态', cong ? cong.label : '—') +
        kv('作业效率', port.efficiency) +
        kv('等待时间', port.waitHours ? data.fmtNum(port.waitHours) + ' 小时' : '—') +
        kv('码头', port.wharf) +
        kv('泊位', port.berth) +
        kv('堆场', port.yard);
    }

    // 章节号：无港口信息时后续章节前移
    els.rptRailH.textContent = (hasPort ? '三' : '二') + '、铁路运力信息';
    els.rptRoadH.textContent = (hasPort ? '四' : '三') + '、公路运力信息';
    els.rptMetricH.textContent = (hasPort ? '五' : '四') + '、核心指标';

    // 铁路表：铁路直达 + 公铁联运
    const railRows = directs.concat(transits);
    els.rptRailRows.innerHTML = railRows.length
      ? railRows.map(r =>
          '<tr>' +
            '<td>' + data.esc(data.channelLabel(r)) + '</td>' +
            '<td>' + data.esc(r.origin || '—') + '</td>' +
            '<td>' + data.esc(r.transfer || '—') + '</td>' +
            '<td>' + data.esc(r.destination || '—') + '</td>' +
            '<td>' + data.fmtNum(r.idleCapacity) + '</td>' +
            '<td>' + data.fmtNum(r.plannedQty) + '</td>' +
            '<td>' + (r.price > 0 ? data.fmtNum(r.price) : '—') + '</td>' +
            '<td>' + (r.leadTime > 0 ? data.fmtNum(r.leadTime) : '—') + '</td>' +
            '<td>' + data.esc(r.carrier || '—') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="9" style="text-align:center">暂无铁路运力</td></tr>';

    els.rptRoadRows.innerHTML = roads.length
      ? roads.map(r =>
          '<tr>' +
            '<td>公路直达</td>' +
            '<td>' + data.esc(r.origin || '—') + '</td>' +
            '<td>' + data.esc(r.destination || '—') + '</td>' +
            '<td>' + data.fmtNum(r.idleCapacity) + '</td>' +
            '<td>' + data.fmtNum(r.plannedQty) + '</td>' +
            '<td>' + (r.price > 0 ? data.fmtNum(r.price) : '—') + '</td>' +
            '<td>' + (r.leadTime > 0 ? data.fmtNum(r.leadTime) : '—') + '</td>' +
            '<td>' + data.esc(r.carrier || '—') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="8" style="text-align:center">暂无公路运力</td></tr>';

    const m = computeMetrics();
    els.rptMetrics.innerHTML =
      '<div class="rpt-metric">' +
        '<div class="m-label">总运费</div>' +
        '<div class="m-value">' + (m.totalFreight > 0 ? data.fmtMoney(m.totalFreight) : '—') + '</div>' +
        '<div style="font-size:12px;color:#86909C;margin-top:2px">总闲置运力 ' + data.fmtNum(m.railIdle + m.roadIdle) + ' 吨/天</div>' +
      '</div>' +
      '<div class="rpt-metric">' +
        '<div class="m-label">运输时间</div>' +
        '<div class="m-value">' + m.maxLead + ' 天</div>' +
        '<div style="font-size:12px;color:#86909C;margin-top:2px">关键路径（最长时效）</div>' +
      '</div>';
  }

  // 下载 PDF：构建报告 + 触发打印（基于内存模型，不额外写入存储）
  function downloadPdf() {
    buildReport();
    window.print();
  }

  /* ==================== 事件绑定 ==================== */

  // 数字字段输入：直接更新模型（不重渲染，避免输入中断）
  document.addEventListener('input', e => {
    const input = e.target;
    if (!input.matches || !input.matches('input[type="number"][data-f]')) return;
    const rowEl = input.closest('[data-row]');
    if (!rowEl) return;
    setRow(rowEl.dataset.row, input.dataset.f, input.value);
  });

  // 全局点击委托：最前统一收起打开的搜索下拉面板（面板外点击）
  document.addEventListener('click', e => {
    document.querySelectorAll('.ss-panel.open').forEach(panel => {
      if (!panel.parentElement.contains(e.target)) panel.classList.remove('open');
    });

    // 删除路线
    const del = e.target.closest('[data-del]');
    if (del) {
      const rowEl = del.closest('[data-row]');
      const found = rowById(rowEl.dataset.row);
      if (found) removeRow(found.kind, found.row.id);
      return;
    }

    // 添加路线
    const add = e.target.closest('[data-add]');
    if (add) {
      addRow(add.dataset.add);
      return;
    }

    // 折叠面板开合
    const collapse = e.target.closest('[data-collapse]');
    if (collapse) {
      collapse.closest('.flow-collapse').classList.toggle('open');
      return;
    }

    // 完成方案
    if (e.target.closest('.js-complete')) {
      completePlan();
      return;
    }

    // 下载 PDF
    if (e.target.closest('.js-pdf')) {
      downloadPdf();
      return;
    }

    // 完成浮层：继续修改
    if (e.target.closest('.js-keep')) {
      els.doneMask.hidden = true;
      return;
    }

    // 完成浮层：点击遮罩关闭
    if (e.target === els.doneMask) {
      els.doneMask.hidden = true;
    }
  });

  /* ==================== 初始化填充 ==================== */

  // 头部与浮层摘要：订单号 + 货物名称 · 总量
  els.headMono.textContent = order.id;
  els.doneMono.textContent = order.id;
  els.headCargo.textContent = (order.cargoName ? order.cargoName + ' · ' : '') + data.fmtNum(order.cargoTotal) + ' 吨';

  // 步骤条与底部导航链接
  els.btnPrev.href = 'order-port.html?id=' + encodeURIComponent(id);
  els.stepBackPort.href = 'order-port.html?id=' + encodeURIComponent(id);
  els.stepBackForm.href = 'order-form.html?id=' + encodeURIComponent(id);
  els.btnDetail.href = 'order-detail.html?id=' + encodeURIComponent(id);
  els.btnGotoDetail.href = 'order-detail.html?id=' + encodeURIComponent(id);

  // 加载运力数据并渲染三通道列表 + 指标
  loadCapacities();
  renderList('direct');
  renderList('transit');
  renderList('road');
  refreshMetrics();

  // 按订单存在性展示内容区
  els.missing.hidden = true;
  els.steps.hidden = false;
  els.head.hidden = false;
  els.metrics.hidden = false;
  els.railSection.hidden = false;
  els.roadSection.hidden = false;
  els.footer.hidden = false;
})();
