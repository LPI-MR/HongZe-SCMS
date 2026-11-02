// ===== order-plan 模块脚本（业务总览 · 运输方案页）=====
// 复刻 hongze_demo PlanReportPage：订单 / 港口 / 铁路 / 公路 / 运输方案五节报告
// + 批次可编辑表（编辑 / 保存双态切换）+ 分配摘要与汇总指标 + PDF 打印导出
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
    stepBackCapacity: $('step-back-capacity'),
    head: $('head'),
    headMono: $('head-mono'),
    headStatus: $('head-status'),
    savedTip: $('saved-tip'),
    orderSection: $('order-section'),
    orderKv: $('order-kv'),
    portSection: $('port-section'),
    portKv: $('port-kv'),
    railSection: $('rail-section'),
    railRows: $('rail-rows'),
    roadSection: $('road-section'),
    roadRows: $('road-rows'),
    planSection: $('plan-section'),
    planSummary: $('plan-summary'),
    batchRows: $('batch-rows'),
    btnAddBatch: $('btn-add-batch'),
    mFreight: $('m-freight'),
    mFreightNote: $('m-freight-note'),
    mLead: $('m-lead'),
    mLeadNote: $('m-lead-note'),
    footer: $('footer'),
    btnPrev: $('btn-prev'),
    btnDetail: $('btn-detail'),
    rptSub: $('rpt-sub'),
    rptOrderKv: $('rpt-order-kv'),
    rptPortBlock: $('rpt-port-block'),
    rptPortKv: $('rpt-port-kv'),
    rptRailRows: $('rpt-rail-rows'),
    rptRoadRows: $('rpt-road-rows'),
    rptBatchRows: $('rpt-batch-rows'),
    rptMetrics: $('rpt-metrics'),
  };

  const id = new URLSearchParams(location.search).get('id') || '';
  const order = id ? data.getOrder(id) : undefined;

  // ===== 订单不存在：仅展示空状态 =====
  if (!order) {
    els.missing.hidden = false;
    return;
  }

  // 已保存方案（批次深拷贝，避免直接改动存储）；无方案时初始即编辑态
  const savedPlan = data.getPlan(id);
  const batches = savedPlan && Array.isArray(savedPlan.batches)
    ? savedPlan.batches.map(b => ({ ...b }))
    : [];
  // 该订单运力通道（批次通道下拉与联动来源）
  const caps = data.listCapacities(id);
  let editing = !savedPlan;

  /* ==================== 保存提示 ==================== */

  let savedTimer = null;
  function showSaved() {
    els.savedTip.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { els.savedTip.hidden = true; }, 1800);
  }

  /* ==================== 通道选项 ==================== */

  // 通道类型显示名称（未知类型回退原值）
  function channelTypeLabel(t) {
    const meta = data.CHANNEL_META[t];
    return meta ? meta.label : t;
  }

  // 批次通道下拉选项：按运力列表去重，label 取对应运力显示名（含中转站后缀）
  function channelOptions() {
    const seen = [];
    caps.forEach(c => {
      if (!seen.some(o => o.type === c.channelType)) {
        seen.push({ type: c.channelType, label: data.channelLabel(c) });
      }
    });
    return seen;
  }

  /* ==================== 批次操作 ==================== */

  // 添加批次：默认取第一条运力的通道 / 时效 / 运价
  function addBatch() {
    const first = caps[0];
    batches.push({
      batchNo: batches.length + 1,
      qty: 0,
      channelType: first ? first.channelType : 'rail_direct',
      leadTime: first ? Number(first.leadTime) || 0 : 0,
      price: first ? Number(first.price) || 0 : 0,
      remark: '',
    });
    renderBatches();
    refreshSummary();
  }

  // 删除批次：移除后批次号重新编号
  function removeBatch(idx) {
    if (idx < 0 || idx >= batches.length) return;
    batches.splice(idx, 1);
    batches.forEach((b, i) => { b.batchNo = i + 1; });
    renderBatches();
    refreshSummary();
  }

  // 更新批次数字字段：仅直更运费小计与摘要（不重渲染，避免输入中断）
  function setBatch(idx, f, v) {
    const b = batches[idx];
    if (!b) return;
    b[f] = Number(v) || 0;
    const tr = document.querySelector('[data-bidx="' + idx + '"]');
    const sub = tr && tr.querySelector('[data-bsub]');
    if (sub) sub.textContent = data.fmtMoney(b.qty * b.price);
    refreshSummary();
  }

  // 切换批次通道：联动时效 / 运价（运力存在则取运力值，否则保留原值）
  function onChannelChange(idx, ct) {
    const b = batches[idx];
    if (!b) return;
    const cap = caps.find(c => c.channelType === ct);
    b.channelType = ct;
    if (cap) {
      b.leadTime = Number(cap.leadTime) || 0;
      b.price = Number(cap.price) || 0;
    }
    const tr = document.querySelector('[data-bidx="' + idx + '"]');
    if (tr) {
      const lead = tr.querySelector('[data-bf="leadTime"]');
      const price = tr.querySelector('[data-bf="price"]');
      if (lead) lead.value = b.leadTime;
      if (price) price.value = b.price;
      const sub = tr.querySelector('[data-bsub]');
      if (sub) sub.textContent = data.fmtMoney(b.qty * b.price);
    }
    refreshSummary();
  }

  /* ==================== 汇总指标 ==================== */

  // 汇总计算：已分配量 / 待分配量 / 运输总价 / 加权时效 / 最长时效
  function computeSummary() {
    let allocatedTotal = 0;
    let totalFreight = 0;
    let weighted = 0;
    let maxLead = 0;
    batches.forEach(b => {
      if (b.qty > 0) {
        allocatedTotal += b.qty;
        if (b.price > 0) totalFreight += b.qty * b.price;
        if (b.leadTime > 0) weighted += b.qty * b.leadTime;
      }
      if (b.leadTime > maxLead) maxLead = b.leadTime;
    });
    const cargoTotal = Number(order.cargoTotal) || 0;
    const remaining = cargoTotal - allocatedTotal;
    const weightedLeadTime = allocatedTotal > 0 ? weighted / allocatedTotal : 0;
    return { allocatedTotal, remaining, totalFreight, weightedLeadTime, maxLead, cargoTotal };
  }

  // 刷新分配摘要条与两张指标卡
  function refreshSummary() {
    const m = computeSummary();
    let html = '<span>货物总量 <b>' + data.fmtNum(m.cargoTotal) + ' 吨</b></span>';
    if (m.cargoTotal <= 0) {
      html += '<span style="color:var(--gray-500)">未录入货物总量</span>';
    } else if (m.remaining > 0) {
      html += '<span>已分配 <b style="color:var(--color-warning)">' + data.fmtNum(m.allocatedTotal) + ' 吨</b></span>' +
        '<span>待分配 <b>' + data.fmtNum(m.remaining) + ' 吨</b></span>';
    } else if (m.remaining === 0) {
      html += '<span>已分配 <b style="color:var(--color-success)">' + data.fmtNum(m.allocatedTotal) + ' 吨</b></span>' +
        '<span style="color:var(--color-success)">已全部分配</span>';
    } else {
      html += '<span>已分配 <b style="color:var(--color-danger)">' + data.fmtNum(m.allocatedTotal) + ' 吨</b></span>' +
        '<span style="color:var(--color-danger)">超出 ' + data.fmtNum(-m.remaining) + ' 吨</span>';
    }
    els.planSummary.innerHTML = html;

    els.mFreight.textContent = m.totalFreight > 0 ? data.fmtMoney(m.totalFreight) : '—';
    els.mFreightNote.textContent = m.totalFreight > 0
      ? batches.length + ' 个批次 · 合计 ' + data.fmtNum(m.allocatedTotal) + ' 吨'
      : '暂无批次';
    els.mLead.textContent = m.weightedLeadTime > 0 ? m.weightedLeadTime.toFixed(1) : 0;
    els.mLeadNote.textContent = '加权平均 · 最长时效 ' + m.maxLead + ' 天';
  }

  /* ==================== 编辑 / 保存双态 ==================== */

  // 切换编辑态界面：编辑 / 保存按钮互换 + 添加批次按钮显隐
  function updateEditingUI() {
    document.querySelectorAll('.js-edit').forEach(el => { el.hidden = editing; });
    document.querySelectorAll('.js-save').forEach(el => { el.hidden = !editing; });
    els.btnAddBatch.hidden = !editing;
  }

  function enterEdit() {
    editing = true;
    renderBatches();
    updateEditingUI();
  }

  // 保存方案：写回存储 + 状态保持待确认 + 回到报告态
  function savePlan() {
    data.upsertPlan({
      orderId: id,
      batches: batches.map(b => ({
        batchNo: b.batchNo,
        qty: Number(b.qty) || 0,
        channelType: b.channelType,
        leadTime: Number(b.leadTime) || 0,
        price: Number(b.price) || 0,
        remark: b.remark || '',
      })),
      updatedAt: new Date().toISOString(),
    });
    data.updateOrderStatus(id, 'pending_confirm');
    order.status = 'pending_confirm';
    editing = false;
    renderBatches();
    refreshSummary();
    updateEditingUI();
    updateHeadStatus();
    showSaved();
  }

  /* ==================== 报告内容（屏幕态） ==================== */

  // 屏幕态键值对片段（strong 为 true 时值加粗）
  function kvScreen(label, value, strong) {
    return '<div><div class="k">' + label + '</div><div class="v"' + (strong ? ' style="font-weight:600"' : '') + '>' +
      data.esc(value || '—') + '</div></div>';
  }

  // 一、订单信息（12 项）
  function renderOrderKv() {
    els.orderKv.innerHTML =
      kvScreen('贸易商', order.trader) +
      (order.traderContact ? kvScreen('联系人', order.traderContact) : '') +
      (order.traderContactInfo ? kvScreen('联系方式', order.traderContactInfo) : '') +
      kvScreen('货物名称', order.cargoName) +
      kvScreen('货物总量', data.fmtNum(order.cargoTotal) + ' 吨', true) +
      kvScreen('货物单价', data.fmtMoney(order.cargoPrice) + ' /吨') +
      kvScreen('货物品质', order.cargoQuality) +
      kvScreen('来源矿山', order.mine) +
      kvScreen('运输船舶', order.vessel) +
      kvScreen('到达港口', order.destPort) +
      kvScreen('终端钢厂', data.customersDisplay(order.customers) || '—') +
      kvScreen('销售数量合计', data.fmtNum(data.customersTotalQty(order.customers)) + ' 吨', true);
  }

  // 二、港口信息（8 项；无港口数据时显示引导提示）
  function renderPortKv() {
    const port = data.getPort(id);
    const hasPort = !!(port && (port.portName || port.wharf || port.berth));
    if (!hasPort) {
      els.portKv.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;color:var(--gray-500);font-size:13px">' +
        '尚未录入港口信息<a href="order-port.html?id=' + encodeURIComponent(id) + '" style="color:var(--color-primary)">去录入 →</a></div>';
      return;
    }
    const cong = data.CONGESTION_OPTIONS.find(c => c.value === port.congestion);
    els.portKv.innerHTML =
      kvScreen('港口名称', port.portName) +
      kvScreen('拥堵状态', cong ? cong.label : '—') +
      kvScreen('作业效率', port.efficiency) +
      kvScreen('等待时间', port.waitHours ? data.fmtNum(port.waitHours) + ' 小时' : '—') +
      kvScreen('码头', port.wharf) +
      kvScreen('泊位', port.berth) +
      kvScreen('堆场', port.yard);
  }

  /* ==================== 运力信息表（屏幕态 + 打印共用） ==================== */

  function railRowsHtml() {
    const rails = caps.filter(c => c.channelType !== 'road');
    if (!rails.length) return '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:24px 0">尚未录入铁路运力</td></tr>';
    return rails.map(c =>
      '<tr>' +
        '<td>' + data.esc(data.channelLabel(c)) + '</td>' +
        '<td>' + data.esc(c.origin || '—') + '</td>' +
        '<td>' + data.esc(c.transfer || '—') + '</td>' +
        '<td>' + data.esc(c.destination || '—') + '</td>' +
        '<td class="num">' + data.fmtNum(c.idleCapacity) + '</td>' +
        '<td class="num">' + (c.price > 0 ? data.fmtNum(c.price) : '—') + '</td>' +
        '<td class="num">' + data.fmtNum(c.leadTime) + '</td>' +
        '<td>' + data.esc(c.carrier || '—') + '</td>' +
      '</tr>'
    ).join('');
  }

  function roadRowsHtml() {
    const roads = caps.filter(c => c.channelType === 'road');
    if (!roads.length) return '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px 0">尚未录入公路运力</td></tr>';
    return roads.map(c =>
      '<tr>' +
        '<td>公路直达</td>' +
        '<td>' + data.esc(c.origin || '—') + '</td>' +
        '<td>' + data.esc(c.destination || '—') + '</td>' +
        '<td class="num">' + data.fmtNum(c.idleCapacity) + '</td>' +
        '<td class="num">' + (c.price > 0 ? data.fmtNum(c.price) : '—') + '</td>' +
        '<td class="num">' + data.fmtNum(c.leadTime) + '</td>' +
        '<td>' + data.esc(c.carrier || '—') + '</td>' +
      '</tr>'
    ).join('');
  }

  function renderCapacityTables() {
    els.railRows.innerHTML = railRowsHtml();
    els.roadRows.innerHTML = roadRowsHtml();
  }

  /* ==================== 批次表渲染 ==================== */

  // 批次可编辑表：编辑态行内 input / select，报告态纯文本
  function renderBatches() {
    if (!batches.length) {
      els.batchRows.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px 0">' +
        (editing ? '暂无批次，点击下方按钮添加' : '尚未制定运输批次') + '</td></tr>';
      return;
    }
    const opts = channelOptions();
    let html = '';
    batches.forEach((b, i) => {
      if (editing) {
        let rowOpts = opts;
        if (!rowOpts.some(o => o.type === b.channelType)) {
          rowOpts = rowOpts.concat([{ type: b.channelType, label: channelTypeLabel(b.channelType) }]);
        }
        const selectOpts = rowOpts.map(o =>
          '<option value="' + o.type + '"' + (o.type === b.channelType ? ' selected' : '') + '>' + data.esc(o.label) + '</option>'
        ).join('');
        html += '<tr data-bidx="' + i + '">' +
          '<td><span class="batch-no">' + b.batchNo + '</span></td>' +
          '<td class="num"><input type="number" class="field-input" data-bf="qty" value="' + (b.qty || 0) + '" min="0"></td>' +
          '<td><select class="field-input" data-bch>' + selectOpts + '</select></td>' +
          '<td class="num"><input type="number" class="field-input" data-bf="leadTime" value="' + (b.leadTime || 0) + '" min="0"></td>' +
          '<td class="num"><input type="number" class="field-input" data-bf="price" value="' + (b.price || 0) + '" min="0"></td>' +
          '<td class="num" data-bsub>' + data.fmtMoney(b.qty * b.price) + '</td>' +
          '<td><button type="button" class="route-del" data-bdel title="删除该批次">✕</button></td>' +
        '</tr>';
      } else {
        html += '<tr data-bidx="' + i + '">' +
          '<td><span class="batch-no">' + b.batchNo + '</span></td>' +
          '<td class="num">' + data.fmtNum(b.qty) + '</td>' +
          '<td>' + channelTypeLabel(b.channelType) + '</td>' +
          '<td class="num">' + data.fmtNum(b.leadTime) + '</td>' +
          '<td class="num">' + (b.price > 0 ? data.fmtNum(b.price) : '—') + '</td>' +
          '<td class="num">' + data.fmtMoney(b.qty * b.price) + '</td>' +
          '<td></td>' +
        '</tr>';
      }
    });
    els.batchRows.innerHTML = html;
  }

  /* ==================== 状态徽标 ==================== */

  function updateHeadStatus() {
    const meta = data.STATUS_META[order.status];
    els.headStatus.textContent = meta ? meta.label : (order.status || '初始');
    if (meta) {
      els.headStatus.style.cssText = 'color:' + meta.color + ';background:' + meta.bg +
        ';padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600';
    }
  }

  /* ==================== PDF 打印导出 ==================== */

  // 打印键值对片段（<b>label</b>value 连排，打印样式）
  function kv(label, value, strong) {
    return '<div><b>' + label + '</b>' + (strong ? '<strong>' : '') + data.esc(value || '—') + (strong ? '</strong>' : '') + '</div>';
  }

  // 构建打印报告：订单 / 港口 / 铁路 / 公路 / 运输方案五节
  function buildReport() {
    const m = computeSummary();
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

    els.rptRailRows.innerHTML = railRowsHtml();
    els.rptRoadRows.innerHTML = roadRowsHtml();

    els.rptBatchRows.innerHTML = batches.length
      ? batches.map(b =>
          '<tr>' +
            '<td>' + b.batchNo + '</td>' +
            '<td>' + data.fmtNum(b.qty) + '</td>' +
            '<td>' + channelTypeLabel(b.channelType) + '</td>' +
            '<td>' + data.fmtNum(b.leadTime) + '</td>' +
            '<td>' + (b.price > 0 ? data.fmtNum(b.price) : '—') + '</td>' +
            '<td>' + data.fmtMoney(b.qty * b.price) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="6" style="text-align:center">暂无运输批次</td></tr>';

    els.rptMetrics.innerHTML =
      '<div class="rpt-metric">' +
        '<div class="m-label">运输总价</div>' +
        '<div class="m-value">' + (m.totalFreight > 0 ? data.fmtMoney(m.totalFreight) : '—') + '</div>' +
        '<div style="font-size:12px;color:#86909C;margin-top:2px">' + batches.length + ' 个批次 · 合计 ' + data.fmtNum(m.allocatedTotal) + ' 吨</div>' +
      '</div>' +
      '<div class="rpt-metric">' +
        '<div class="m-label">预计时效</div>' +
        '<div class="m-value">' + (m.weightedLeadTime > 0 ? m.weightedLeadTime.toFixed(1) : 0) + ' 天</div>' +
        '<div style="font-size:12px;color:#86909C;margin-top:2px">加权平均 · 最长时效 ' + m.maxLead + ' 天</div>' +
      '</div>';
  }

  // 下载 PDF：构建报告 + 触发打印（基于内存模型，不额外写入存储）
  function downloadPdf() {
    buildReport();
    window.print();
  }

  /* ==================== 事件委托 ==================== */

  // 批次数字字段行内编辑
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-bf]')) return;
    const tr = t.closest('[data-bidx]');
    if (!tr) return;
    setBatch(Number(tr.dataset.bidx), t.dataset.bf, t.value);
  });

  // 批次通道切换（联动时效 / 运价）
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-bch]')) return;
    const tr = t.closest('[data-bidx]');
    if (!tr) return;
    onChannelChange(Number(tr.dataset.bidx), t.value);
  });

  document.addEventListener('click', e => {
    const del = e.target.closest('[data-bdel]');
    if (del) {
      const tr = del.closest('[data-bidx]');
      if (tr) removeBatch(Number(tr.dataset.bidx));
      return;
    }
    if (e.target.closest('#btn-add-batch')) { addBatch(); return; }
    if (e.target.closest('.js-edit')) { enterEdit(); return; }
    if (e.target.closest('.js-save')) { savePlan(); return; }
    if (e.target.closest('.js-pdf')) { downloadPdf(); return; }
  });

  /* ==================== 初始化 ==================== */

  function init() {
    els.headMono.textContent = order.id;
    updateHeadStatus();

    els.btnPrev.href = 'order-capacity.html?id=' + encodeURIComponent(id);
    els.stepBackForm.href = 'order-form.html?id=' + encodeURIComponent(id);
    els.stepBackPort.href = 'order-port.html?id=' + encodeURIComponent(id);
    els.stepBackCapacity.href = 'order-capacity.html?id=' + encodeURIComponent(id);
    els.btnDetail.href = 'order-detail.html?id=' + encodeURIComponent(id);

    renderOrderKv();
    renderPortKv();
    renderCapacityTables();
    renderBatches();
    refreshSummary();
    updateEditingUI();

    els.missing.hidden = true;
    els.steps.hidden = false;
    els.head.hidden = false;
    els.orderSection.hidden = false;
    els.portSection.hidden = false;
    els.railSection.hidden = false;
    els.roadSection.hidden = false;
    els.planSection.hidden = false;
    els.footer.hidden = false;
  }

  init();
})();
