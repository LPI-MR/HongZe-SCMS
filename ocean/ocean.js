// ===== ocean 模块脚本（海运管理 · 航次列表） =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责海运航次的增删改查、状态流转、检索与分页
// 矿山主数据复用 mine 模块的 localStorage（hz_mines），本模块对其只读（PRD 6.5 模块对接约定）
// 航次数据持久化到 localStorage（hz_ocean_voyages），刷新页面不丢失
(function () {
  'use strict';

  // 本页对应的导航位置：海运管理（一级菜单）
  const NAV_PATH = '海运管理';

  // 设置导航栏选中态：一级「海运管理」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path === NAV_PATH) item.classList.add('active');
    });
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 枚举常量 =====
  const STATUS = {
    pending: '待装船',
    loading: '装船中',
    sailing: '在途',
    arrived: '已到港',
    done: '已完成'
  };

  // 状态流转顺序（行内「推进」按钮按此顺序走下一步）
  const STATUS_ORDER = ['pending', 'loading', 'sailing', 'arrived', 'done'];

  // ===== 矿山 → 推荐装货港映射（矿山 PRD 6.5：从矿山出发推算海运装货港） =====
  // 按矿山简称匹配（与矿山预置数据 short_name 对应）；未命中时由用户手动填写
  const MINE_LOAD_PORTS = {
    '力拓': { port: '丹皮尔港', country: '澳大利亚', distance_note: '西澳矿区 → 丹皮尔港，铁路短倒约 300km' },
    '必和必拓': { port: '黑德兰港', country: '澳大利亚', distance_note: '纽曼矿区 → 黑德兰港，铁路短倒约 400km' },
    '福斯特库': { port: '黑德兰港', country: '澳大利亚', distance_note: '奇切斯特岭矿区 → 黑德兰港，铁路短倒约 250km' },
    '淡水河谷': { port: '图巴朗港', country: '巴西', distance_note: '卡拉加斯矿区 → 图巴朗港，铁路短倒约 900km' }
  };

  // 常用卸货港快捷选项（中国主要铁矿石接卸港）
  const DISCHARGE_PORT_DICT = [
    '青岛港', '曹妃甸港', '日照港', '舟山港', '大连港', '天津港', '湛江港', '上海港', '连云港'
  ];

  // ===== 本地持久化 =====
  const LS_VOYAGES = 'hz_ocean_voyages';   // 航次数据（本模块权威存储键）
  const LS_MINES = 'hz_mines';             // 矿山主数据（mine 模块维护，此处只读）

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function loadMines() {
    const v = loadJSON(LS_MINES, []);
    return Array.isArray(v) ? v : [];
  }

  // 航次列表：[{id, voyage_code, vessel_name, mine_id, mine_name,
  //   load_port, load_country, discharge_port, discharge_country,
  //   cargo_type, quantity, freight_rate, freight_total,
  //   sail_date, eta_date, status, remark, created_at, updated_at, created_by}]
  let voyages = loadJSON(LS_VOYAGES, []);
  if (!Array.isArray(voyages)) voyages = [];

  // ===== 预置航次示例数据（首次打开时写入，与四大矿山关联） =====
  function seedVoyages() {
    if (loadJSON(LS_VOYAGES, null) !== null) return;   // 已有数据（含空数组）则不重复写入

    const mines = loadMines();
    // 按矿山简称建立 id 索引；矿山数据缺失时退化为空关联（仅展示）
    const byShort = {};
    mines.forEach(m => { byShort[m.short_name || ''] = m; });

    const DAY = 24 * 60 * 60 * 1000;
    const base = Date.now();

    // [船名, 矿山简称, 装货港, 装货国, 卸货港, 卸货国, 货种, 货量万吨, 运价$/吨, 离港(天前), 航程天数, 状态]
    const seed = [
      ['Pacific Glory', '力拓', '丹皮尔港', '澳大利亚', '青岛港', '中国', 'PB粉', 17.0, 21.5, 6, 11, 'sailing'],
      ['Bulk Venture', '必和必拓', '黑德兰港', '澳大利亚', '曹妃甸港', '中国', '纽曼粉', 18.0, 20.8, 4, 0, 'pending'],
      ['Vale Rio Doce', '淡水河谷', '图巴朗港', '巴西', '青岛港', '中国', '卡拉加斯粉', 30.0, 32.5, 12, 40, 'sailing'],
      ['Iron Chieftain', '福斯特库', '黑德兰港', '澳大利亚', '日照港', '中国', '超特粉', 17.5, 19.2, 20, 10, 'arrived'],
      ['Pilbara Spirit', '力拓', '丹皮尔港', '澳大利亚', '舟山港', '中国', '杨迪粉', 16.8, 22.0, 45, 12, 'done'],
      ['Minas Gerais', '淡水河谷', '图巴朗港', '巴西', '湛江港', '中国', 'IOCJ', 28.0, 31.8, 2, 0, 'loading']
    ];

    voyages = seed.map((s, i) => {
      const m = byShort[s[1]] || {};
      const sail = base - s[9] * DAY;
      const eta = s[10] > 0 ? sail + s[10] * DAY : sail;
      return {
        id: 'v' + (base + i).toString(36),
        voyage_code: genCode(i + 1),
        vessel_name: s[0],
        mine_id: m.id || '',
        mine_name: s[1],
        load_port: s[2], load_country: s[3],
        discharge_port: s[4], discharge_country: s[5],
        cargo_type: s[6], quantity: s[7], freight_rate: s[8],
        freight_total: Math.round(s[7] * 10000 * s[8]),
        sail_date: fmtDate(sail), eta_date: fmtDate(eta),
        status: s[11],
        remark: '',
        created_at: sail,
        updated_at: base,
        created_by: '系统预置'
      };
    });

    try {
      localStorage.setItem(LS_VOYAGES, JSON.stringify(voyages));
    } catch (e) { /* 预置失败不阻断页面，用户可手动新增 */ }
  }

  function save() {
    try {
      localStorage.setItem(LS_VOYAGES, JSON.stringify(voyages));
      return true;
    } catch (e) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议清理旧数据后重试。');
      return false;
    }
  }

  function genId() {
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 航次编号生成：S- + 3位流水号（与矿山编号规则保持同一风格）
  function genCode(seq) {
    if (seq == null) {
      seq = voyages.reduce((max, v) => {
        const n = /^S-(\d+)$/.exec(v.voyage_code || '');
        return n ? Math.max(max, Number(n[1])) : max;
      }, 0) + 1;
    }
    return 'S-' + String(seq).padStart(3, '0');
  }

  // ===== 工具函数 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 时间戳 → YYYY-MM-DD（date input 兼容格式）
  function fmtDate(ts) {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 金额/数量千分位（1 位小数以内）
  function fmtNum(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  // 运费合计：货量(万吨) × 10000 × 运价($/吨) = 美元
  function freightTotal(quantity, rate) {
    return Math.round((Number(quantity) || 0) * 10000 * (Number(rate) || 0));
  }

  // ===== 数据渲染（表格数据驱动） =====
  const tbody = document.querySelector('.ledger-table tbody');

  function renderRow(v) {
    const tr = document.createElement('tr');
    tr.dataset.id = v.id;
    tr.dataset.vessel = v.vessel_name || '';
    tr.dataset.mine = v.mine_name || '';
    tr.dataset.cargo = v.cargo_type || '';
    tr.dataset.status = v.status || '';

    // 航线组合展示：装货港(国) → 卸货港(国)
    const load = esc(v.load_port) + (v.load_country ? '<span class="country"> ' + esc(v.load_country) + '</span>' : '');
    const dis = esc(v.discharge_port) + (v.discharge_country ? '<span class="country"> ' + esc(v.discharge_country) + '</span>' : '');

    // 状态推进：未完成航次显示「推进」按钮，直达下一步状态
    const idx = STATUS_ORDER.indexOf(v.status);
    const canAdvance = idx >= 0 && idx < STATUS_ORDER.length - 1;

    tr.innerHTML = [
      '<td class="col-index"></td>',
      '<td class="col-code">' + esc(v.voyage_code) + '</td>',
      '<td class="col-vessel">' + esc(v.vessel_name) + '</td>',
      '<td>' + esc(v.mine_name || '—') + '</td>',
      '<td>' + (load || '—') + '</td>',
      '<td>' + (dis || '—') + '</td>',
      '<td>' + esc(v.cargo_type || '—') + '</td>',
      '<td class="col-num">' + fmtNum(v.quantity) + '</td>',
      '<td class="col-num">' + fmtNum(v.freight_rate) + '</td>',
      '<td class="col-date">' + esc(v.sail_date || '—') + '</td>',
      '<td class="col-date">' + esc(v.eta_date || '—') + '</td>',
      '<td><span class="status-tag ' + esc(v.status) + '">' + esc(STATUS[v.status] || v.status) + '</span></td>',
      '<td class="col-action"><div class="cell-actions">' +
        (canAdvance ? '<button class="row-act advance" type="button" title="推进至「' +
          esc(STATUS[STATUS_ORDER[idx + 1]]) + '">推进</button>' : '') +
        '<button class="row-act edit" type="button">编辑</button>' +
        '<button class="row-act remove" type="button">删除</button>' +
      '</div></td>'
    ].join('');
    return tr;
  }

  // 排序：默认创建时间倒序（新航次在前）
  function sortedVoyages() {
    return voyages.slice().sort((a, b) =>
      (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
  }

  // ===== 检索 =====
  // 数据行约定：tr 携带 data-id / data-vessel / data-mine / data-cargo / data-status
  let applyFilter = null;

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const vesselInput = document.getElementById('searchVessel');
    const mineSelect = document.getElementById('searchMine');
    const cargoSelect = document.getElementById('searchCargo');
    const statusSelect = document.getElementById('searchStatus');

    applyFilter = function () {
      const kw = (vesselInput.value || '').trim().toLowerCase();
      const mine = mineSelect.value;
      const cargo = cargoSelect.value;
      const status = statusSelect.value;

      let visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(row => {
        if (row.classList.contains('empty-row')) return;

        const ok =
          (!kw || (row.dataset.vessel || '').toLowerCase().includes(kw) ||
            (row.dataset.mine || '').toLowerCase().includes(kw)) &&
          (!mine || row.dataset.mine === mine) &&
          (!cargo || row.dataset.cargo === cargo) &&
          (!status || row.dataset.status === status);

        row.hidden = !ok;
        if (ok) visible += 1;
      });

      const emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    form.addEventListener('reset', () => {
      requestAnimationFrame(() => applyFilter());
    });
  }

  // 检索下拉选项刷新：关联矿山（矿山主数据）、货种（现有航次聚合）
  function refreshSearchOptions() {
    const mineSelect = document.getElementById('searchMine');
    if (mineSelect) {
      const cur = mineSelect.value;
      const names = Array.from(new Set(loadMines().map(m => m.short_name || m.mine_name).filter(Boolean)));
      mineSelect.innerHTML = '<option value="">全部</option>' +
        names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
      mineSelect.value = names.includes(cur) ? cur : '';
    }

    const cargoSelect = document.getElementById('searchCargo');
    if (cargoSelect) {
      const cur = cargoSelect.value;
      const cargos = Array.from(new Set(voyages.map(v => v.cargo_type).filter(Boolean)));
      cargoSelect.innerHTML = '<option value="">全部</option>' +
        cargos.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
      cargoSelect.value = cargos.includes(cur) ? cur : '';
    }
  }

  // ===== 分页（基于检索后的可见行切片显示） =====
  let pageSize = 10;
  let curPage = 1;

  function renderPage() {
    const $ = id => document.getElementById(id);
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)')).filter(r => !r.hidden);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    const start = (curPage - 1) * pageSize;
    rows.forEach((r, i) => {
      r.hidden = i < start || i >= start + pageSize;
    });

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

    $('pageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    const jump = () => {
      let p = parseInt($('pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('pgInput').addEventListener('change', jump);
    $('pgInput').addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });
  }

  // ===== 统计卡 + 列表小标题 =====
  function updateStats() {
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    document.getElementById('voyageCount').textContent = rows.length;

    // 全部航次口径
    const volume = voyages.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
    const freight = voyages.reduce((s, v) => s + (Number(v.freight_total) || 0), 0);
    const sailing = voyages.filter(v => v.status === 'sailing').length;

    document.getElementById('voyageVolume').textContent = fmtNum(volume);
    document.getElementById('tTotal').textContent = voyages.length;
    document.getElementById('tSailing').textContent = sailing;
    document.getElementById('tVolume').textContent = fmtNum(volume);
    document.getElementById('tFreight').textContent = fmtNum(freight);
  }

  // 按当前数据全量重建表格（新增/编辑/推进/删除后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => row.remove());
    sortedVoyages().forEach(v => tbody.appendChild(renderRow(v)));

    // 重新编号（按当前展示顺序）
    let i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => {
      row.querySelector('.col-index').textContent = ++i;
    });

    updateStats();
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.hidden = voyages.length > 0;
    if (applyFilter) applyFilter();
  }

  // ===== 新增 / 编辑航次抽屉（含矿山联动） =====
  const $ = id => document.getElementById(id);
  let editingId = null;
  let tipTimer = null;

  function showTip(msg) {
    const tip = $('formTip');
    tip.textContent = msg;
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 4000);
  }

  // 抽屉矿山下拉：仅显示在用矿山（停用矿山不再出现在选项中，与矿山 PRD 软删除约定一致）
  function refreshMineOptions(selectedId) {
    const sel = $('fMine');
    const active = loadMines().filter(m => m.status === 'active');
    sel.innerHTML = '<option value="">请选择矿山</option>' +
      active.map(m =>
        '<option value="' + esc(m.id) + '">' + esc(m.short_name || m.mine_name) +
        '（' + esc(m.mine_name) + '）</option>'
      ).join('');
    sel.value = active.some(m => m.id === selectedId) ? selectedId : '';
    onMineChange(true);
  }

  // 矿山选择联动：推荐装货港（MINE_LOAD_PORTS）+ 货种下拉（矿山主流产品）
  function onMineChange(silent) {
    const mineId = $('fMine').value;
    const mine = loadMines().find(m => m.id === mineId);

    if (!mine) {
      $('mineHint').textContent = '';
      $('fCargoType').innerHTML = '<option value="">请先选择矿山</option>';
      return;
    }

    const hint = MINE_LOAD_PORTS[mine.short_name || ''];
    // 装货港为空或与上次推荐不同时自动填充（不覆盖用户手动修改——只在为空时填）
    if (hint && !$('fLoadPort').value) {
      $('fLoadPort').value = hint.port;
      if (!$('fLoadCountry').value) $('fLoadCountry').value = hint.country;
    }
    $('mineHint').textContent = hint
      ? '推荐装货港：' + hint.port + '（' + hint.distance_note + '）'
      : '该矿山未配置推荐装货港，请手动填写';

    // 货种下拉：矿山主流产品（main_products 逗号分隔）
    const products = String(mine.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
    if (products.length) {
      $('fCargoType').innerHTML = products.map(p =>
        '<option value="' + esc(p) + '">' + esc(p) + '</option>'
      ).join('');
      if (!silent) { /* 保留默认第一项 */ }
    } else {
      $('fCargoType').innerHTML = '<option value="">该矿山未登记主流产品</option>';
    }
  }

  // 货量/运价变化 → 自动计算预估总运费
  function syncFreightTotal() {
    const total = freightTotal($('fQuantity').value, $('fFreightRate').value);
    $('fFreightTotal').value = total > 0 ? total.toLocaleString('zh-CN') + ' $' : '';
  }

  function openEditor(v) {
    editingId = v ? v.id : null;
    $('editorTitle').textContent = v ? '编辑航次（' + v.voyage_code + '）' : '新增航次';

    $('fVesselName').value = v ? (v.vessel_name || '') : '';
    $('fStatus').value = v ? (v.status || 'pending') : 'pending';

    // 矿山联动：先恢复矿山选择，再带出推荐港口与货种
    $('fLoadPort').value = '';
    $('fLoadCountry').value = '';
    refreshMineOptions(v ? v.mine_id : '');

    $('fLoadPort').value = v ? (v.load_port || '') : $('fLoadPort').value;
    $('fLoadCountry').value = v ? (v.load_country || '') : '';
    $('fDischargePort').value = v ? (v.discharge_port || '') : '';
    $('fDischargeCountry').value = v ? (v.discharge_country || '') : '';

    // 货种：编辑时若原货种不在矿山产品列表中，追加该选项保证回显
    const cargoSel = $('fCargoType');
    if (v && v.cargo_type && !Array.from(cargoSel.options).some(o => o.value === v.cargo_type)) {
      cargoSel.insertAdjacentHTML('beforeend',
        '<option value="' + esc(v.cargo_type) + '">' + esc(v.cargo_type) + '</option>');
    }
    if (v && v.cargo_type) cargoSel.value = v.cargo_type;

    $('fQuantity').value = v && v.quantity != null ? v.quantity : '';
    $('fFreightRate').value = v && v.freight_rate != null ? v.freight_rate : '';
    syncFreightTotal();
    $('fSailDate').value = v ? (v.sail_date || '') : fmtDate(new Date());
    $('fEtaDate').value = v ? (v.eta_date || '') : '';
    $('fRemark').value = v ? (v.remark || '') : '';

    $('formTip').hidden = true;
    $('editorMask').hidden = false;
    $('fVesselName').focus();
  }

  function closeEditor() {
    $('editorMask').hidden = true;
    editingId = null;
  }

  // 收集抽屉表单并校验；通过返回数据对象，失败返回 null 并提示
  function collectForm() {
    const vessel = $('fVesselName').value.trim();
    const mineId = $('fMine').value;
    const mine = loadMines().find(m => m.id === mineId);
    const loadPort = $('fLoadPort').value.trim();
    const disPort = $('fDischargePort').value.trim();
    const cargo = $('fCargoType').value;
    const quantity = $('fQuantity').value.trim();
    const rate = $('fFreightRate').value.trim();
    const sail = $('fSailDate').value;
    const eta = $('fEtaDate').value;

    if (!vessel) { showTip('请填写船名'); $('fVesselName').focus(); return null; }
    if (!mine) { showTip('请选择关联矿山'); $('fMine').focus(); return null; }
    if (!loadPort) { showTip('请填写装货港'); $('fLoadPort').focus(); return null; }
    if (!disPort) { showTip('请填写卸货港'); $('fDischargePort').focus(); return null; }
    if (!cargo) { showTip('请选择货种（所选矿山未登记主流产品时请先到矿山管理补充）'); return null; }

    const q = Number(quantity);
    if (quantity === '' || isNaN(q) || q <= 0) {
      showTip('货量需为大于 0 的数字'); $('fQuantity').focus(); return null;
    }
    const r = Number(rate);
    if (rate === '' || isNaN(r) || r < 0) {
      showTip('运价需为非负数字'); $('fFreightRate').focus(); return null;
    }

    // 船期逻辑校验：预计到港不得早于离港日期（两者都填时）
    if (sail && eta && eta < sail) {
      showTip('预计到港日期不能早于离港日期'); $('fEtaDate').focus(); return null;
    }

    return {
      vessel_name: vessel,
      mine_id: mine.id,
      mine_name: mine.short_name || mine.mine_name,
      load_port: loadPort,
      load_country: $('fLoadCountry').value.trim(),
      discharge_port: disPort,
      discharge_country: $('fDischargeCountry').value.trim(),
      cargo_type: cargo,
      quantity: q,
      freight_rate: r,
      freight_total: freightTotal(q, r),
      sail_date: sail,
      eta_date: eta,
      status: $('fStatus').value,
      remark: $('fRemark').value.trim()
    };
  }

  function saveEditor() {
    const data = collectForm();
    if (!data) return;

    if (editingId) {
      const old = voyages.find(v => v.id === editingId);
      if (!old) { showTip('数据已被删除，请刷新页面'); return; }
      Object.assign(old, data);
      old.updated_at = Date.now();
    } else {
      data.id = genId();
      data.voyage_code = genCode();
      data.created_at = Date.now();
      data.updated_at = Date.now();
      data.created_by = 'admin';
      voyages.push(data);
    }

    if (!save()) return;
    closeEditor();
    refreshSearchOptions();
    renderAll();
  }

  function initEditor() {
    $('fMine').addEventListener('change', () => onMineChange(false));
    $('fQuantity').addEventListener('input', syncFreightTotal);
    $('fFreightRate').addEventListener('input', syncFreightTotal);

    $('editorSave').addEventListener('click', saveEditor);
    $('editorCancel').addEventListener('click', closeEditor);
    $('editorClose').addEventListener('click', closeEditor);
    $('editorMask').addEventListener('click', e => {
      if (e.target === $('editorMask')) closeEditor();
    });
  }

  // ===== 表格操作：推进 / 编辑 / 删除（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', e => {
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const v = voyages.find(x => x.id === row.dataset.id);
      if (!v) return;

      // 状态推进：按 STATUS_ORDER 走下一步，二次确认
      const advanceBtn = e.target.closest('.row-act.advance');
      if (advanceBtn) {
        const idx = STATUS_ORDER.indexOf(v.status);
        const next = STATUS_ORDER[idx + 1];
        if (!next) return;
        if (!confirm('确认将航次 ' + v.voyage_code + '（' + v.vessel_name + '）状态由「' +
          STATUS[v.status] + '」推进为「' + STATUS[next] + '」吗？')) return;
        v.status = next;
        v.updated_at = Date.now();
        save();
        renderAll();
        return;
      }

      // 编辑：打开抽屉并回填
      const editBtn = e.target.closest('.row-act.edit');
      if (editBtn) {
        openEditor(v);
        return;
      }

      // 删除：物理删除，二次确认（航次为运营数据，误删影响统计，务必确认）
      const removeBtn = e.target.closest('.row-act.remove');
      if (removeBtn) {
        if (!confirm('确认删除航次 ' + v.voyage_code + '（' + v.vessel_name + '）吗？删除后不可恢复。')) return;
        voyages = voyages.filter(x => x.id !== v.id);
        save();
        refreshSearchOptions();
        renderAll();
      }
    });
  }

  // ===== 初始化 =====
  seedVoyages();          // 首次打开预置示例航次（关联四大矿山）

  $('oceanDashBtn').addEventListener('click', () => {
    location.href = '/ocean/ocean-dashboard.html';
  });

  initSearch();
  initEditor();
  initTableActions();
  bindPager();
  refreshSearchOptions();
  renderAll();            // 启动时从 localStorage 恢复数据并渲染
})();
