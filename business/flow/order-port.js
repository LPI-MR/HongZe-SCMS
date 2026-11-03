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
    portSummary: $('port-summary'),
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

  /* ==================== 港口管理基础数据联动（R3） ==================== */

  // 港口管理已录入数据（common/hz-data.js：ports → hz_ports_data）
  const hz = window.HZData;
  const portRecords = hz ? hz.list('ports') : [];

  // 港名归一：「青岛港」「青岛」视为同一港口
  function normPortName(name) {
    return String(name || '').trim().replace(/港$/, '');
  }

  // 按名称查找「港口管理」已录入记录
  function findPortRecord(name) {
    if (!name) return null;
    return portRecords.find(p => normPortName(p.name) === normPortName(name)) || null;
  }

  // 读取 kv 列表（[{label, value}]）中指定 label 的值
  function kvGet(list, label) {
    if (!Array.isArray(list)) return '';
    const hit = list.find(r => r && r.label === label);
    return hit ? String(hit.value || '') : '';
  }

  // 「已联动」微标：hint 标注数据来源；unmarkLinked 恢复默认文案
  function markLinked(field, source) {
    const hint = document.querySelector('.hint[data-linked="' + field + '"]');
    if (hint) hint.innerHTML = '<span class="link-badge">已联动</span>' + data.esc(source || '');
  }
  function unmarkLinked(field) {
    const hint = document.querySelector('.hint[data-linked="' + field + '"]');
    if (hint && hint.dataset.linkedDefault != null) {
      hint.textContent = hint.dataset.linkedDefault;
    }
  }

  // 仅空字段自动填充：不覆盖用户已填内容（同步输入框值）；返回是否实际填充
  function fillIfEmpty(field, value, source) {
    if (value === '' || value == null) return false;
    if (String(port[field] || '').trim()) return false;
    port[field] = value;
    const input = document.querySelector('[data-field="' + field + '"]');
    if (input) input.value = value;
    markLinked(field, source);
    return true;
  }

  // 下拉选中后落库（与 [data-field] 输入事件同一处理链）
  function commitField(field, value) {
    port[field] = value;
    refreshSummaries();
    scheduleAutoSave();
  }

  // 港口概要卡：年吞吐量 / 所属地区 / 主营业务货类 / 集疏港铁路
  function renderPortSummary(rec) {
    const box = els.portSummary;
    if (!rec) { box.hidden = true; box.innerHTML = ''; return; }
    const rows = [
      ['年吞吐量', kvGet(rec.metrics, '年吞吐量')],
      ['所属地区', kvGet(rec.basicInfo, '所属地区') || rec.subtitle || ''],
      ['主营业务货类', kvGet(rec.basicInfo, '主营业务货类')],
      ['集疏港铁路', kvGet(rec.capacity, '集疏港铁路')]
    ].filter(r => r[1]);
    if (!rows.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="ps-head">港口管理 · 基础数据概要</div>' +
      rows.map(r =>
        '<div class="ps-item"><div class="ps-label">' + data.esc(r[0]) + '</div>' +
        '<div class="ps-value">' + data.esc(r[1]) + '</div></div>'
      ).join('');
    box.hidden = false;
  }

  // 选择港口后的自动填充：码头←港区名组合、泊位←泊位指标、堆场←港区设施摘要
  function applyPortLinkage(rec) {
    if (!rec) return 0;
    let n = 0;
    const zones = Array.isArray(rec.zones) ? rec.zones : [];
    if (zones.length) {
      const names = zones.map(z => z.name).filter(Boolean).join('、');
      if (fillIfEmpty('wharf', names, '港口管理 · 港区构成')) n++;
      const yardDesc = zones
        .map(z => (z.name ? z.name + '：' : '') + (z.facilities || z.positioning || ''))
        .filter(s => s.trim()).join('\n');
      if (fillIfEmpty('yard', yardDesc, '港口管理 · 港区设施')) n++;
    }
    const count = kvGet(rec.metrics, '泊位数量');
    const tonnage = kvGet(rec.metrics, '最大泊位吨级');
    let berthDesc = '';
    if (tonnage && count) berthDesc = tonnage + ' 万吨级泊位，全港 ' + count + ' 个';
    else if (count) berthDesc = '全港泊位 ' + count + ' 个';
    else if (tonnage) berthDesc = '最大 ' + tonnage + ' 万吨级泊位';
    if (fillIfEmpty('berth', berthDesc, '港口管理 · 泊位指标')) n++;
    return n;
  }

  // 泊位下拉选项：从港区设施描述提取「N万吨级」，缺省退回泊位指标
  function berthOptions() {
    const rec = findPortRecord(port.portName);
    if (!rec) return [];
    const opts = [];
    const seen = {};
    (Array.isArray(rec.zones) ? rec.zones : []).forEach(z => {
      const hits = String((z && z.facilities) || '').match(/\d+(?:\.\d+)?\s*万吨级/g) || [];
      hits.forEach(h => {
        const t = h.replace(/\s+/g, '');
        if (seen[t]) return;
        seen[t] = true;
        opts.push({ value: t + '泊位', label: t + '泊位', sub: z.name || '' });
      });
    });
    if (!opts.length) {
      const count = kvGet(rec.metrics, '泊位数量');
      const tonnage = kvGet(rec.metrics, '最大泊位吨级');
      if (tonnage) opts.push({
        value: tonnage + ' 万吨级泊位',
        label: tonnage + ' 万吨级泊位',
        sub: count ? '全港 ' + count + ' 个' : '泊位指标'
      });
    }
    return opts;
  }

  // 下拉选择器：搜索联想 + 支持手动输入（复用 order-form 的 ss 组件样式）
  function setupSS(input, getOptions, onPick, emptyText) {
    if (!input) return;
    const panel = input.closest('.ss').querySelector('[data-ss-panel]');

    function render() {
      const kw = input.value.trim().toLowerCase();
      const opts = getOptions().filter(o =>
        !kw || (o.label + ' ' + o.value + ' ' + (o.sub || '')).toLowerCase().indexOf(kw) !== -1);
      panel.innerHTML = opts.length
        ? opts.map(o =>
            '<div class="ss-option" data-value="' + data.esc(o.value) + '">' + data.esc(o.label) +
            (o.sub ? '<span class="ss-sub">' + data.esc(o.sub) + '</span>' : '') + '</div>'
          ).join('')
        : '<div class="ss-option ss-empty">' + (emptyText || '无匹配项，可直接手动输入') + '</div>';
      panel.classList.add('open');
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    panel.addEventListener('click', e => {
      const opt = e.target.closest('[data-value]');
      if (!opt) return;
      input.value = opt.dataset.value;
      panel.classList.remove('open');
      if (onPick) onPick(opt.dataset.value);
    });
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

  // ===== 港口管理联动初始化：ss 下拉 / 默认提示 / 概要卡 =====

  // 港口名称：选项来自「港口管理」；选择后渲染概要卡 + 自动填充码头/泊位/堆场
  setupSS(
    document.querySelector('[data-field="portName"]'),
    () => portRecords.map(p => ({
      value: p.name,
      label: p.name,
      sub: kvGet(p.basicInfo, '所属地区') || p.subtitle || ''
    })),
    name => {
      commitField('portName', name);
      const rec = findPortRecord(name);
      renderPortSummary(rec);
      if (rec) {
        const n = applyPortLinkage(rec);
        if (n > 0) toast('已从「港口管理」自动填充 ' + n + ' 个关联字段');
        refreshSummaries();
        scheduleAutoSave();
      }
    }
  );

  // 码头：已选港口的港区列表；选择视为手动指定，恢复默认提示
  setupSS(
    document.querySelector('[data-field="wharf"]'),
    () => {
      const rec = findPortRecord(port.portName);
      return (rec && Array.isArray(rec.zones) ? rec.zones : [])
        .filter(z => z && z.name)
        .map(z => ({ value: z.name, label: z.name, sub: z.location || '' }));
    },
    v => { unmarkLinked('wharf'); commitField('wharf', v); },
    '请先选择上方港口名称'
  );

  // 泊位：已选港口的泊位等级（港区设施提取 / 泊位指标）
  setupSS(
    document.querySelector('[data-field="berth"]'),
    berthOptions,
    v => { unmarkLinked('berth'); commitField('berth', v); },
    '请先选择上方港口名称'
  );

  // 联动 hint 默认文案
  document.querySelectorAll('.hint[data-linked]').forEach(h => {
    h.textContent = h.dataset.linkedDefault || '';
  });

  // 初始概要卡：草稿/订单到港口命中「港口管理」数据时展示
  const initRec = findPortRecord(port.portName);
  if (initRec) renderPortSummary(initRec);

  // 点击下拉外部收起面板
  document.addEventListener('click', e => {
    document.querySelectorAll('.ss .ss-panel.open').forEach(p => {
      if (!p.parentElement.contains(e.target)) p.classList.remove('open');
    });
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
