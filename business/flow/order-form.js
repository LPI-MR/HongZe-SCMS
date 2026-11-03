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
    unmarkLinked(field);
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
            '<label class="field-label">终端钢厂<span class="link-tag">钢厂管理</span></label>' +
            '<div class="ss">' +
              '<input class="field-input ss-input" data-cust-name="' + data.esc(c.id) + '" value="' + data.esc(c.name) + '" placeholder="选择钢厂或手动输入" autocomplete="off" />' +
              '<div class="ss-panel" data-ss-panel></div>' +
            '</div>' +
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

  /* ==================== 基础数据联动（矿山 / 港口 / 钢厂） ==================== */

  // 联动数据源：经 HZData 统一接口读取基础模块已录入数据（后端化后仅需替换 HZData 适配器）
  // 注：航运信息不再引用海运管理现有航次——录入后由数据层新增同步至海运管理（R1）
  const hz = window.HZData;
  const mines = hz ? hz.list('mines') : [];
  const steels = hz ? hz.list('steel') : [];
  const ports = hz ? hz.list('ports') : [];
  const steelNames = steels.map(s => s.name).filter(Boolean);

  // 矿山在营状态优先展示
  const isActiveMine = m => /^(active|enabled|启用|在营)$/i.test(String(m.status || ''));
  mines.sort((a, b) => (isActiveMine(b) ? 1 : 0) - (isActiveMine(a) ? 1 : 0));

  /* ==================== 搜索下拉（原生实现，含"其他"自定义选项与联动回调） ==================== */

  // 选项归一：字符串 → {value,label}；对象 → {value,label,sub,...}（保留 payload 等扩展字段）
  function normOption(o) {
    if (typeof o === 'string') return { value: o, label: o, sub: '' };
    const n = Object.assign({}, o);
    if (!n.label) n.label = n.value;
    if (n.sub == null) n.sub = '';
    return n;
  }

  // setupSearchSelect(container, options, otherPlaceholder, onSelect)
  // options：字符串数组或 {value,label,sub} 数组；onSelect(normOpt, value) 选中回调（"其他"自定义时 normOpt 为 null）
  // .ss-input 带 data-field 时选中自动写入订单字段；带 data-link 时仅触发 onSelect（联动入口不落单字段）
  function setupSearchSelect(container, options, otherPlaceholder, onSelect) {
    const input = container.querySelector('.ss-input');
    const panel = container.querySelector('[data-ss-panel]');

    function renderPanel(keyword) {
      const q = (keyword || '').trim().toLowerCase();
      const list = options.map(normOption).filter(o =>
        !q || (o.label + ' ' + o.value + ' ' + o.sub).toLowerCase().indexOf(q) !== -1);
      let html = list.map(o =>
        '<div class="ss-option" data-value="' + data.esc(o.value) + '">' + data.esc(o.label) +
        (o.sub ? '<span class="ss-sub">' + data.esc(o.sub) + '</span>' : '') + '</div>'
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
      if (input.dataset.field) updateField(input.dataset.field, v);
      if (onSelect) onSelect(null, v);
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
        if (input.dataset.field) updateField(input.dataset.field, opt.dataset.value);
        if (onSelect) {
          const hit = options.map(normOption).find(o => o.value === opt.dataset.value);
          onSelect(hit || null, opt.dataset.value);
        }
        return;
      }
      if (e.target.closest('[data-other]')) renderCustom();
    });

    // 点击下拉外部收起面板
    document.addEventListener('click', e => {
      if (!container.contains(e.target)) panel.classList.remove('open');
    });
  }

  /* ==================== 联动选项构造与填充回调 ==================== */

  // 联动填充：仅空字段自动填充、不覆盖已填值（手动修改后以手动值为准）；返回是否实际填充
  function fillIfEmpty(field, value, source) {
    if (value === '' || value == null || value === 0) return false;
    const cur = order[field];
    if (!(cur === '' || cur === 0 || cur == null)) return false;
    order[field] = NUMERIC_FIELDS.indexOf(field) !== -1 ? Number(value) : value;
    const input = document.querySelector('[data-field="' + field + '"]');
    if (input) input.value = order[field];
    // 先清校验态再写联动徽标：两者写同一 hint 元素，顺序颠倒会擦除徽标
    clearError(field);
    markLinked(field, source);
    return true;
  }

  // 「已联动」微标：字段 hint 标注数据来源
  function markLinked(field, source) {
    const hint = document.querySelector('[data-linked="' + field + '"]');
    if (hint) hint.innerHTML = '<span class="link-badge">已联动</span>' + data.esc(source);
  }

  // 手动编辑后恢复字段默认提示（以手动值为准）
  function unmarkLinked(field) {
    const hint = document.querySelector('[data-linked="' + field + '"]');
    if (hint && hint.dataset.linkedDefault != null) {
      hint.textContent = hint.dataset.linkedDefault;
      hint.classList.remove('err');
    }
  }

  // 选项集：货物名称 = 常用品类 ∪ 矿山主流产品（去重）
  const cargoNameOptions = (function () {
    const seen = {};
    const list = [];
    function add(v, sub) {
      v = String(v || '').trim();
      if (!v || seen[v]) return;
      seen[v] = true;
      list.push({ value: v, label: v, sub: sub || '' });
    }
    data.CARGO_CATEGORIES.forEach(c => add(c, '常用品类'));
    mines.forEach(m => String(m.main_products || '').split(',').forEach(p => add(p, m.short_name || m.mine_name)));
    return list;
  })();

  // 选项集：来源矿山 = 矿山管理条目 ∪ 内置 MINE_OPTIONS（"其他"由下拉自带）
  const mineOptions = (function () {
    const list = mines.map(m => ({
      value: m.short_name || m.mine_name,
      label: m.short_name || m.mine_name,
      sub: m.ore_grade || '',
    }));
    data.MINE_OPTIONS.forEach(m => {
      if (m === '其他' || list.some(o => o.value === m)) return;
      list.push({ value: m, label: m, sub: '' });
    });
    return list;
  })();

  // 选项集：到达港口 = 港口管理条目 ∪ 主要接卸港字典（去重）
  const destPortOptions = (function () {
    const seen = {};
    const list = [];
    ports.forEach(p => {
      const name = String(p.name || '').trim();
      if (!name || seen[name]) return;
      seen[name] = true;
      list.push({ value: name, label: name, sub: p.subtitle || '' });
    });
    const dict = hz ? (hz.dict('dischargePorts') || []) : [];
    dict.forEach(d => {
      const name = String(d.name || '').trim();
      if (!name || seen[name]) return;
      seen[name] = true;
      list.push({ value: name, label: name, sub: '主要接卸港' });
    });
    return list;
  })();

  // 矿山信息卡：基础 / 产品 / 价格三段展示（数据源：矿山管理；价格口径不一，仅参考不自动回填）
  const MINE_TYPE_LABEL = { coal: '煤矿', iron: '铁矿', nonferrous: '有色金属矿', nonmetal: '非金属矿', other: '其他' };
  const MINE_STATUS_LABEL = { active: '在用', inactive: '停用' };

  function renderMineCard(mine) {
    const card = document.getElementById('mine-info-card');
    if (!card) return;
    if (!mine) { card.hidden = true; card.innerHTML = ''; return; }

    // 基础信息（年产能/储量单位：万吨——矿山模块口径）
    const baseItems = [
      ['矿山全称', mine.mine_name || '—'],
      ['矿山类型', MINE_TYPE_LABEL[mine.mine_type] || mine.mine_type || '—'],
      ['经营状态', MINE_STATUS_LABEL[mine.status] || mine.status || '—'],
      ['年产能', mine.annual_capacity ? data.fmtNum(mine.annual_capacity) + ' 万吨/年' : '—'],
      ['保有储量', mine.reserve ? data.fmtNum(mine.reserve) + ' 万吨' : '—'],
      ['矿石品位', mine.ore_grade || '—'],
    ];
    // 产品信息：main_products 逗号拆分为标签
    const products = String(mine.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
    // 价格参考（price_refs：{name, tag, product, value, unit, delta, direction, updated, source}）
    const refs = (Array.isArray(mine.price_refs) ? mine.price_refs : []).filter(r => r && r.name);

    let html =
      '<div class="mic-head"><span class="mic-title">矿山信息 · ' + data.esc(mine.short_name || mine.mine_name || '') + '</span>' +
      '<span class="mic-src">数据源：矿山管理</span></div>' +
      '<div class="mic-grid">' + baseItems.map(it =>
        '<div class="mic-item"><span class="mic-label">' + data.esc(it[0]) + '</span>' +
        '<span class="mic-value">' + data.esc(it[1]) + '</span></div>').join('') + '</div>';

    if (products.length) {
      html += '<div class="mic-seg"><span class="mic-seg-title">产品信息</span><div class="mic-tags">' +
        products.map(p => '<span class="mic-tag">' + data.esc(p) + '</span>').join('') + '</div></div>';
    }
    if (refs.length) {
      html += '<div class="mic-seg"><span class="mic-seg-title">价格参考（价格口径不一，仅作参考，不自动填充单价）</span>' +
        '<table class="mic-table"><thead><tr><th>价格项</th><th>品种</th><th>最新价</th><th>涨跌</th><th>更新</th><th>来源</th></tr></thead><tbody>' +
        refs.map(r => {
          const d = Number(r.delta);
          const dir = String(r.direction || '');
          const dTxt = Number.isFinite(d) && d !== 0
            ? '<span class="mic-delta ' + (dir === 'down' ? 'down' : 'up') + '">' + (dir === 'down' ? '▼' : '▲') + ' ' + Math.abs(d) + '</span>'
            : '<span class="mic-delta flat">—</span>';
          return '<tr>' +
            '<td>' + data.esc(r.name) + '</td>' +
            '<td>' + data.esc(r.product || '—') + '</td>' +
            '<td class="mono">' + data.esc(String(r.value != null ? r.value : '—')) + '<i>' + data.esc(r.unit || '') + '</i></td>' +
            '<td>' + dTxt + '</td>' +
            '<td>' + data.esc(r.updated || '—') + '</td>' +
            '<td>' + data.esc(r.source || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    card.innerHTML = html;
    card.hidden = false;
  }

  // 矿山联动：自动填充 cargoQuality ← ore_grade、cargoName ← main_products 首项（仅空字段），
  // 并渲染矿山信息卡（基础 / 产品 / 价格）
  function onMineSelected(opt) {
    const mine = opt ? mines.find(m => (m.short_name || m.mine_name) === opt.value) : null;
    renderMineCard(mine);
    if (!mine) return; // 内置选项或自定义矿山，无联动
    const src = '矿山「' + opt.value + '」';
    const firstProduct = String(mine.main_products || '').split(',')[0].trim();
    const a = fillIfEmpty('cargoQuality', mine.ore_grade, src);
    const b = fillIfEmpty('cargoName', firstProduct, src);
    if (a || b) onOrderChanged();
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

  // 字段默认提示（联动来源说明）
  document.querySelectorAll('[data-linked]').forEach(h => {
    if (h.dataset.linkedDefault) h.textContent = h.dataset.linkedDefault;
  });

  // 搜索下拉分发：客户 / 货物名称 / 来源矿山 / 到港港口（船舶改手动录入，保存后同步海运）
  document.querySelectorAll('.ss').forEach(container => {
    const input = container.querySelector('.ss-input');
    if (!input) return;
    const field = input.dataset.field;
    if (field === 'trader') { setupSearchSelect(container, data.TRADER_OPTIONS, '如：中矿国链'); return; }
    if (field === 'cargoName') { setupSearchSelect(container, cargoNameOptions, '如：PB粉'); return; }
    if (field === 'mine') { setupSearchSelect(container, mineOptions, '如：力拓', onMineSelected); return; }
    if (field === 'destPort') { setupSearchSelect(container, destPortOptions, '如：黄骅港'); }
  });

  // 编辑态：已选矿山时恢复信息卡展示
  if (order.mine) {
    renderMineCard(mines.find(m => (m.short_name || m.mine_name) === order.mine) || null);
  }

  // 折叠面板开合
  document.querySelectorAll('[data-collapse]').forEach(head => {
    head.addEventListener('click', () => {
      head.closest('.flow-collapse').classList.toggle('open');
    });
  });

  // 终端客户动态行：委托绑定（渲染后无需重复绑定）

  // 行内钢厂下拉面板：按关键词过滤钢厂管理已录入数据（容器级委托，避免逐行绑定监听）
  function renderCustPanel(input) {
    const panel = input.closest('.ss').querySelector('[data-ss-panel]');
    const q = input.value.trim().toLowerCase();
    const list = steelNames.filter(n => !q || n.toLowerCase().indexOf(q) !== -1);
    let html = list.map(n =>
      '<div class="ss-option" data-value="' + data.esc(n) + '">' + data.esc(n) + '</div>'
    ).join('');
    if (!list.length) {
      html += '<div class="ss-option ss-empty">无匹配项，可直接手动输入</div>';
    }
    panel.innerHTML = html;
    panel.classList.add('open');
  }

  els.custList.addEventListener('focusin', e => {
    const nameInput = e.target.closest('[data-cust-name]');
    if (nameInput) renderCustPanel(nameInput);
  });

  els.custList.addEventListener('input', e => {
    const nameInput = e.target.closest('[data-cust-name]');
    if (nameInput) {
      const c = findCustomer(nameInput.dataset.custName);
      if (c) c.name = nameInput.value;
      renderCustPanel(nameInput); // 输入过滤时保持面板打开
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
    // 钢厂下拉选项选择
    const opt = e.target.closest('.ss-option[data-value]');
    if (opt) {
      const input = opt.closest('.ss').querySelector('[data-cust-name]');
      if (input) {
        input.value = opt.dataset.value;
        const c = findCustomer(input.dataset.custName);
        if (c) c.name = input.value;
        onOrderChanged();
      }
      opt.closest('.ss-panel').classList.remove('open');
      return;
    }
    const del = e.target.closest('[data-del-cust]');
    if (del) {
      const idx = order.customers.findIndex(c => c.id === del.dataset.delCust);
      if (idx >= 0) order.customers.splice(idx, 1);
      renderCustomers();
      onOrderChanged();
    }
  });

  // 点击页面其他区域收起所有下拉面板（含客户行动态面板）
  document.addEventListener('click', e => {
    if (!e.target.closest('.ss')) {
      document.querySelectorAll('.ss-panel.open').forEach(p => p.classList.remove('open'));
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
