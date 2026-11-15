// ===== ocean 模块脚本（海运管理 · 海运综合台账） =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责海运航次的增删改查、状态流转、
// 港口胶囊筛选、分页，以及行展开后的港口现货联动子表渲染
// 数据持久化到 PostgreSQL：读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/voyages 等全量替换；
// 字典与跨模块读经 HZData 模块化数据基座（common/hz-data.js，底层走 HZDB 缓存）：
//  - voyages（ocean.ocean_voyage，读写）：海运航次权威数据
//  - mines（只读）：矿山主数据（抽屉联动）
//  - spots（ocean.ocean_spot，读写）：港口现货参考数据（联动子表）
//  - coas（ocean.ocean_coa，读写）：COA 品质证书
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

  // ===== 字典派生（经 HZData 模块化数据基座，替代本地静态字典） =====
  // 矿山 → 推荐装货港映射（HZData.dict('mineLoadPorts')，矿山 PRD 6.5 约定）
  // 构建时机：HZDB.ready() 之后（boot 内执行——dict 读取 DB 字典缓存，静态值兜底）
  const MINE_LOAD_PORTS = {};

  // 常用卸货港快捷选项（HZData.dict('dischargePorts') 中国主要接卸港）
  let DISCHARGE_PORT_DICT = [];

  // 矿山主数据：经 HZData 模块化接口直调 mine 模块数据源（本模块只读）
  function loadMines() {
    return HZData.raw('mines');
  }

  // 航次列表：[{id, voyage_code, vessel_name, mine_id, mine_name,
  //   load_port, load_country, discharge_port, discharge_country,
  //   cargo_type, quantity, freight_rate, freight_total,
  //   sail_date, eta_date, status, remark, created_at, updated_at, created_by}]
  let voyages = [];   // boot 时经 HZDB.ready() 从数据库装载

  // 港口现货参考列表（模块级，联动子表渲染用；boot 时经 HZData 归一化恢复）
  let spots = [];

  // 保存：全量写回数据库（PUT /api/voyages）；失败由 HZDB toast 提示，页面内存保留可重试
  function save() {
    return HZDB.put('voyages', voyages);
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

  // ===== 数据渲染（表格数据驱动：航次主行 + 行展开港口现货联动子表） =====
  const tbody = document.querySelector('.ledger-table tbody');

  // 航线组合展示：装货港(国) → 卸货港(国)
  function routeCell(v) {
    const load = esc(v.load_port) + (v.load_country ? '<span class="country"> ' + esc(v.load_country) + '</span>' : '');
    const dis = esc(v.discharge_port) + (v.discharge_country ? '<span class="country"> ' + esc(v.discharge_country) + '</span>' : '');
    return '<div class="route-seg">'
      + '<span class="route-port">' + (load || '—') + '</span>'
      + '<i class="route-arrow">→</i>'
      + '<span class="route-port">' + (dis || '—') + '</span>'
      + '</div>';
  }

  // 船期组合展示：离港日期 → 预计到港日期
  function dateLine(v) {
    return '<span class="date-line">' + esc(v.sail_date || '—')
      + '<i class="route-arrow">→</i>' + esc(v.eta_date || '—') + '</span>';
  }

  // 航次补充信息：预估总运费 / COA 证书号 / 备注
  function voyageMeta(v) {
    const coa = HZData.find('oceanCoas', v.id);
    return '<div class="voyage-meta">'
      + '<span>预估总运费 <b>' + (Number(v.freight_total) > 0 ? fmtNum(v.freight_total) + ' $' : '—') + '</b></span>'
      + '<span>品质证书 <b>' + (coa ? esc(coa.certificate_no) : '未登记') + '</b></span>'
      + (v.remark ? '<span class="meta-remark">备注 ' + esc(v.remark) + '</span>' : '')
      + '</div>';
  }

  // 港口现货联动子表：按卸货港精确匹配（normalized_port）+ 同船置顶高亮（vessel_clean）
  function spotSubTable(v) {
    const portNorm = HZData.normalizePort(v.discharge_port);
    const vesselNorm = HZData.cleanVessel(v.vessel_name);

    // 联动匹配：现货港口归一后与航次卸货港精确一致
    const matched = spots.filter(s => s.normalized_port === portNorm);
    // 同船（船名清洗后一致）置顶展示
    matched.sort((a, b) => (b.vessel_clean === vesselNorm) - (a.vessel_clean === vesselNorm));

    const sameShipCount = matched.filter(s => s.vessel_clean === vesselNorm && vesselNorm).length;
    const metaHtml = '<span class="spot-sub-meta">'
      + '共 <b>' + matched.length + '</b> 条参考 · 数据日期 ' + esc(matched[0] ? matched[0].data_date : '—')
      + (sameShipCount ? ' · 含同船 <b>' + sameShipCount + '</b> 条' : '')
      + '</span>';

    if (!matched.length) {
      return '<div class="spot-sub">'
        + '<div class="spot-sub-title">港口现货参考 · 卸货港 ' + esc(v.discharge_port) + '</div>'
        + '<div class="spot-sub-empty">该港口暂无现货参考数据</div>'
        + '</div>';
    }

    let body = '';
    matched.forEach((s, i) => {
      const sameShip = vesselNorm && s.vessel_clean === vesselNorm;
      body += '<tr' + (sameShip ? ' class="spot-same-ship"' : '') + '>'
        + '<td class="spot-th-no">' + (i + 1) + '</td>'
        + '<td>' + esc(s.variety || '—') + '</td>'
        + spotNumCell(s.fe) + spotNumCell(s.sio2) + spotNumCell(s.al2o3)
        + spotNumCell(s.p) + spotNumCell(s.s) + spotNumCell(s.mn) + spotNumCell(s.moisture)
        + '<td class="spot-vessel">' + esc(s.vessel || '—') + (sameShip ? '<i class="same-ship-tag">同船</i>' : '') + '</td>'
        + '<td class="spot-berth">' + esc(s.berth || '—') + '</td>'
        + '</tr>';
    });

    return '<div class="spot-sub">'
      + '<div class="spot-sub-title">港口现货参考 · 卸货港 ' + esc(v.discharge_port) + metaHtml + '</div>'
      + '<div class="spot-table-wrap"><table class="spot-table">'
      + '<thead><tr><th class="spot-th-no">序号</th><th>品种</th>'
      + '<th class="spot-th-num">Fe%</th><th class="spot-th-num">SiO₂%</th><th class="spot-th-num">Al₂O₃%</th>'
      + '<th class="spot-th-num">P%</th><th class="spot-th-num">S%</th><th class="spot-th-num">Mn%</th><th class="spot-th-num">水分%</th>'
      + '<th>船名</th><th>货位</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>'
      + '</div>';
  }

  // 主行 + 详情行（DocumentFragment）：主行 10 列，详情行承载 voyageMeta + spotSubTable
  function renderRow(v) {
    const frag = document.createDocumentFragment();

    // 状态推进：未完成航次显示「推进」按钮，直达下一步状态
    const idx = STATUS_ORDER.indexOf(v.status);
    const canAdvance = idx >= 0 && idx < STATUS_ORDER.length - 1;

    // 品质证书：该航次已登记 COA 时按钮高亮标记
    const hasCoa = coas.some(c => c.voyage_id === v.id);

    // 货种 · 货量组合展示
    const cargo = '<div class="cargo-cell">'
      + '<span class="cargo-name">' + esc(v.cargo_type || '—') + '</span>'
      + '<span class="cargo-qty">' + fmtNum(v.quantity) + ' 万吨</span>'
      + '</div>';

    const tr = document.createElement('tr');
    tr.className = 'v-row';
    tr.dataset.id = v.id;
    tr.dataset.discharge = HZData.normalizePort(v.discharge_port);
    tr.innerHTML = [
      '<td class="col-expand"><button class="row-expand" type="button" title="展开港口现货参考"><i class="exp-chev"></i></button></td>',
      '<td class="col-code">' + esc(v.voyage_code) + '</td>',
      '<td class="col-vessel">' + esc(v.vessel_name) + '</td>',
      '<td>' + esc(v.mine_name || '—') + '</td>',
      '<td class="col-route">' + routeCell(v) + '</td>',
      '<td class="col-cargo">' + cargo + '</td>',
      '<td class="col-num">' + fmtNum(v.freight_rate) + '</td>',
      '<td class="col-date">' + dateLine(v) + '</td>',
      '<td><span class="status-tag ' + esc(v.status) + '">' + esc(STATUS[v.status] || v.status) + '</span></td>',
      '<td class="col-action"><div class="cell-actions">' +
        (canAdvance ? '<button class="row-act advance" type="button" title="推进至「' +
          esc(STATUS[STATUS_ORDER[idx + 1]]) + '">推进</button>' : '') +
        '<button class="row-act coa' + (hasCoa ? ' has-coa' : '') + '" type="button" title="' +
          (hasCoa ? '查看品质证书' : '登记品质证书') + '">证书' + (hasCoa ? '<i class="coa-dot"></i>' : '') + '</button>' +
        '<button class="row-act edit" type="button">编辑</button>' +
        '<button class="row-act remove" type="button">删除</button>' +
      '</div></td>'
    ].join('');
    frag.appendChild(tr);

    // 详情行：默认隐藏，点击主行展开按钮时显示
    const detail = document.createElement('tr');
    detail.className = 'detail-row';
    detail.dataset.parent = v.id;
    detail.hidden = true;
    detail.innerHTML = '<td colspan="10">' + voyageMeta(v) + spotSubTable(v) + '</td>';
    frag.appendChild(detail);

    return frag;
  }

  // 排序：默认创建时间倒序（新航次在前）
  function sortedVoyages() {
    return voyages.slice().sort((a, b) =>
      (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
  }

  // ===== 港口胶囊筛选（卸货港维度快捷过滤，替代传统检索栏） =====
  // 数据行约定：tr.v-row 携带 data-id / data-discharge（港口归一化值）
  let portFilter = '';
  let applyFilter = null;

  // 全部港口名：卸货港字典 ∪ 航次卸货港 ∪ 现货港口（normalizePort 去重）
  function allPortNames() {
    const seen = {};
    const names = [];
    const push = p => {
      const key = HZData.normalizePort(p);
      if (key && !seen[key]) { seen[key] = true; names.push(p); }
    };
    DISCHARGE_PORT_DICT.forEach(push);
    voyages.forEach(v => push(v.discharge_port));
    spots.forEach(s => push(s.port));
    return names;
  }

  // 渲染筛选胶囊（'全部' + 各港口，active 态跟随 portFilter）
  function refreshPortChips() {
    const box = document.getElementById('portChips');
    if (!box) return;
    const names = allPortNames();
    box.innerHTML = ['全部'].concat(names).map(p =>
      '<button type="button" class="port-chip' + (p === (portFilter || '全部') ? ' active' : '') +
      '" data-port="' + esc(p) + '">' + esc(p) + '</button>'
    ).join('');
  }

  // 胶囊事件绑定（click 委托）：点击切换筛选
  function initPortChips() {
    const box = document.getElementById('portChips');
    if (!box) return;
    box.addEventListener('click', e => {
      const chip = e.target.closest('[data-port]');
      if (!chip) return;
      const p = chip.getAttribute('data-port');
      portFilter = (p === '全部') ? '' : p;
      refreshPortChips();
      if (applyFilter) applyFilter(true); // 胶囊筛选后回到第 1 页
    });
  }

  // 筛选执行：按卸货港归一化精确匹配（tr.v-row 的 data-discharge）
  // resetPage：筛选控件触发时传 true 回到第 1 页；增删改后的内部调用不传，保持浏览位置
  applyFilter = function (resetPage) {
    if (resetPage === true) curPage = 1;
    const kw = HZData.normalizePort(portFilter);

    let visible = 0;
    document.querySelectorAll('.ledger-table tbody tr.v-row').forEach(row => {
      const ok = !kw || row.dataset.discharge === kw;
      row.hidden = !ok;
      if (ok) visible += 1;
    });

    const emptyRow = document.querySelector('.ledger-table .empty-row');
    if (emptyRow) emptyRow.hidden = visible > 0;

    renderPage();
  };

  // ===== 分页（基于检索后的可见行切片显示） =====
  let pageSize = 10;
  let curPage = 1;

  function renderPage() {
    const $ = id => document.getElementById(id);
    const rows = Array.from(tbody.querySelectorAll('tr.v-row')).filter(r => !r.hidden);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    const start = (curPage - 1) * pageSize;
    // 切片改用 style.display，与筛选用 hidden 正交，避免 total 级联收缩（跳页失效根因）
    rows.forEach((r, i) => {
      r.style.display = (i < start || i >= start + pageSize) ? 'none' : '';
    });
    syncDetailRows(); // 详情行跟随父行显隐

    $('pagerTotal').textContent = total;
    $('pgPages').textContent = pages;
    $('pgInput').value = curPage;
    $('pgInput').max = pages;
    $('pgFirst').disabled = curPage <= 1;
    $('pgPrev').disabled = curPage <= 1;
    $('pgNext').disabled = curPage >= pages;
    $('pgLast').disabled = curPage >= pages;
  }

  // 定位指定航次行所在页码并跳转（新增保存后确保新行立即进入视野）
  // 未找到（如被筛选隐藏）时保持当前页不变
  function locateRowPage(id) {
    if (!id) return;
    const rows = Array.from(tbody.querySelectorAll('tr.v-row')).filter(r => !r.hidden);
    const idx = rows.findIndex(r => r.dataset.id === id);
    if (idx >= 0) {
      curPage = Math.floor(idx / pageSize) + 1;
      renderPage();
    }
  }

  // ===== 行展开状态（详情行跟随父行可见性 + 展开记忆） =====
  let expandedIds = new Set();

  function syncDetailRows() {
    tbody.querySelectorAll('tr.detail-row').forEach(d => {
      const parent = tbody.querySelector('tr.v-row[data-id="' + d.dataset.parent + '"]');
      d.hidden = !parent || parent.hidden || parent.style.display === 'none' || !expandedIds.has(d.dataset.parent);
    });
  }

  function toggleExpand(id, parentRow) {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
      if (parentRow) parentRow.classList.remove('expanded');
    } else {
      expandedIds.add(id);
      if (parentRow) parentRow.classList.add('expanded');
    }
    syncDetailRows();
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

  // ===== 统计（banner 指标 + 现货参考条数） =====
  function updateStats() {
    const rows = Array.from(tbody.querySelectorAll('tr.v-row'));
    document.getElementById('voyageCount').textContent = rows.length;

    // 全部航次口径
    const volume = voyages.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
    document.getElementById('voyageVolume').textContent = fmtNum(volume);

    // 港口现货参考数据条数（banner 中展示）
    const spotCount = document.getElementById('spotCount');
    if (spotCount) spotCount.textContent = spots.length;
  }

  // 按当前数据全量重建表格（新增/编辑/推进/删除后统一走这里）
  function renderAll() {
    expandedIds.clear();
    tbody.querySelectorAll('tr.v-row, tr.detail-row').forEach(row => row.remove());
    sortedVoyages().forEach(v => tbody.appendChild(renderRow(v)));

    updateStats();
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.hidden = voyages.length > 0;
    refreshPortChips(); // 胶囊筛选器跟随数据刷新（修复初始化不渲染导致筛选不可用）
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

  async function saveEditor() {
    const data = collectForm();
    if (!data) return;

    let addedId = '';
    if (editingId) {
      const old = voyages.find(v => v.id === editingId);
      if (!old) { showTip('数据已被删除，请刷新页面'); return; }
      const prev = Object.assign({}, old);   // 回滚快照：保存失败时恢复现场，弹窗保留供重试
      Object.assign(old, data);
      old.updated_at = Date.now();
      if (!await save()) { Object.assign(old, prev); return; }
    } else {
      data.id = genId();
      data.voyage_code = genCode();
      data.created_at = Date.now();
      data.updated_at = Date.now();
      data.created_by = 'admin';
      voyages.push(data);
      addedId = data.id;
      if (!await save()) { voyages.pop(); return; }
    }

    closeEditor();
    renderAll();
    locateRowPage(addedId); // 新增航次可能落在其他页，跳转到位
  }

  function initEditor() {
    // 新增航次按钮（banner）：打开空表单抽屉（修复按钮未绑定导致新增功能不可用）
    $('addVoyageBtn').addEventListener('click', () => openEditor(null));
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

  // ===== 表格操作：展开 / 推进 / 编辑 / 删除（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', async e => {
      // 行展开：切换详情行（港口现货联动子表）显示
      const expandBtn = e.target.closest('.row-expand');
      if (expandBtn) {
        const parentRow = expandBtn.closest('tr.v-row');
        if (parentRow) toggleExpand(parentRow.dataset.id, parentRow);
        return;
      }

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
        const prevStatus = v.status;   // 回滚快照：保存失败时恢复状态
        v.status = next;
        v.updated_at = Date.now();
        if (!await save()) { v.status = prevStatus; return; }
        renderAll();
        return;
      }

      // 品质证书：打开 COA 查看/登记抽屉
      const coaBtn = e.target.closest('.row-act.coa');
      if (coaBtn) {
        openCoaView(v);
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
        const prev = voyages.slice();   // 回滚快照：保存失败时恢复现场
        voyages = voyages.filter(x => x.id !== v.id);
        if (!await save()) { voyages = prev; return; }
        renderAll();
      }
    });
  }

  // ===== COA 品质证书（Certificate of Analysis，航次级品质单据） =====
  // 与航次 1:1 关联（voyage_id）；boot 时经 HZDB 从数据库装载，写经 PUT /api/coas 全量替换
  function saveCoas(list) {
    return HZDB.put('coas', list);
  }

  // 数值展示：保留三位小数千分位（与单据原值一致）；空值显示 —
  function fmtDec(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  let coas = [];   // 证书集合（模块级，renderRow 中用于按钮状态标记；boot 时从数据库装载）

  // 按 voyage_id 查找航次对应证书
  function findCoaByVoyage(vid) {
    return coas.find(c => c.voyage_id === vid) || null;
  }

  // ===== COA 查看抽屉（单据式分区展示） =====
  function openCoaView(v) {
    const coa = findCoaByVoyage(v.id);
    const body = $('coaViewBody');

    if (!coa) {
      body.innerHTML =
        '<div class="coa-empty">'
        + '<p>该航次暂未登记品质证书（COA）。</p>'
        + '<p class="coa-empty-sub">可依据船方或矿方出具的 Certificate of Analysis 登记化学成分与吨位信息。</p>'
        + '</div>';
    } else {
      const voyage = voyages.find(x => x.id === coa.voyage_id);
      body.innerHTML =
        '<div class="coa-doc">'
        + '<div class="coa-head"><div class="coa-doc-title">CERTIFICATE OF ANALYSIS</div>'
        + '<div class="coa-doc-sub">品质证书 · ' + esc(coa.certificate_no) + '</div></div>'
        // 分组一：基本信息
        + '<div class="coa-sec"><div class="coa-sec-title">基本信息</div><div class="coa-grid">'
        + '<div class="coa-item"><span class="coa-label">证书编号</span><span class="coa-value">' + esc(coa.certificate_no) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">签发日期</span><span class="coa-value">' + esc(coa.issue_date || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">Shipment No.</span><span class="coa-value">' + esc(coa.shipment_no || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">提单日期</span><span class="coa-value">' + esc(coa.bl_date || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">原产地</span><span class="coa-value">' + esc(coa.country_of_origin || '—') + '</span></div>'
        + '</div></div>'
        // 分组二：船期与航线
        + '<div class="coa-sec"><div class="coa-sec-title">船期与航线</div><div class="coa-grid">'
        + '<div class="coa-item"><span class="coa-label">船名</span><span class="coa-value">' + esc(coa.vessel_name || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">装货港</span><span class="coa-value">' + esc(coa.port_of_loading || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">卸货港</span><span class="coa-value">' + esc(coa.port_of_discharge || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">货物名称</span><span class="coa-value">' + esc(coa.goods || '—') + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">关联航次</span><span class="coa-value">'
        + (voyage ? esc(voyage.voyage_code + ' · ' + voyage.vessel_name) : '<span class="coa-unlinked">未关联航次</span>') + '</span></div>'
        + '</div></div>'
        // 分组三：吨位与水分
        + '<div class="coa-sec"><div class="coa-sec-title">吨位与水分</div><div class="coa-grid">'
        + '<div class="coa-item"><span class="coa-label">装货量（湿吨 WMT）</span><span class="coa-value">' + fmtDec(coa.wet_tons) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">干吨（DMT）</span><span class="coa-value">' + fmtDec(coa.dry_tons) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">水分（装港）%</span><span class="coa-value">' + fmtDec(coa.moisture) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">+6.3mm 物理成分%（干基）</span><span class="coa-value">' + fmtDec(coa.physical_63mm) + '</span></div>'
        + '</div></div>'
        // 分组四：化学成分（干基）
        + '<div class="coa-sec"><div class="coa-sec-title">化学成分（干基 %）</div><div class="coa-grid coa-grid-6">'
        + '<div class="coa-item"><span class="coa-label">Fe</span><span class="coa-value">' + fmtDec(coa.fe) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">P</span><span class="coa-value">' + fmtDec(coa.p) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">S</span><span class="coa-value">' + fmtDec(coa.s) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">SiO₂</span><span class="coa-value">' + fmtDec(coa.sio2) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">Al₂O₃</span><span class="coa-value">' + fmtDec(coa.al2o3) + '</span></div>'
        + '<div class="coa-item"><span class="coa-label">LOI</span><span class="coa-value">' + fmtDec(coa.loi) + '</span></div>'
        + '</div></div>'
        + (coa.remark ? '<div class="coa-remark">' + esc(coa.remark) + '</div>' : '')
        + '</div>';
      $('coaViewEdit').hidden = false;
      $('coaViewDelete').hidden = false;
      coaViewEditingId = coa.id;
    }

    $('coaViewVoyage').textContent = v.voyage_code + ' · ' + v.vessel_name;
    $('coaMask').hidden = false;
  }

  function closeCoaView() {
    $('coaMask').hidden = true;
    coaViewEditingId = null;
  }

  let coaViewEditingId = null;   // 当前查看抽屉对应的证书 id

  // ===== COA 登记 / 编辑表单 =====
  let coaEditorTargetId = null;   // 正在编辑的证书 id（null=新增）

  // 航次下拉选项：全部航次，当前选中高亮
  function refreshCoaVoyageOptions(selectedId) {
    const sel = $('cVoyage');
    sel.innerHTML = '<option value="">请选择航次</option>' + voyages.map(v =>
      '<option value="' + esc(v.id) + '">' + esc(v.voyage_code + ' · ' + v.vessel_name + '（' + (v.cargo_type || '—') + '）') + '</option>'
    ).join('');
    if (selectedId) sel.value = selectedId;
  }

  function openCoaEditor(coa, presetVoyageId) {
    coaEditorTargetId = coa ? coa.id : null;
    $('coaEditTitle').textContent = coa ? '编辑品质证书' : '登记品质证书';
    refreshCoaVoyageOptions(coa ? coa.voyage_id : (presetVoyageId || ''));

    const fields = ['cCertificateNo', 'cIssueDate', 'cOrigin', 'cBlDate', 'cShipmentNo', 'cVessel',
      'cLoadPort', 'cDischargePort', 'cGoods', 'cWetTons', 'cDryTons', 'cMoisture', 'cPhysical',
      'cFe', 'cP', 'cS', 'cSio2', 'cAl2o3', 'cLoi', 'cRemark'];
    fields.forEach(id => { $(id).value = ''; });

    if (coa) {
      $('cCertificateNo').value = coa.certificate_no || '';
      $('cIssueDate').value = coa.issue_date || '';
      $('cOrigin').value = coa.country_of_origin || '';
      $('cBlDate').value = coa.bl_date || '';
      $('cShipmentNo').value = coa.shipment_no || '';
      $('cVessel').value = coa.vessel_name || '';
      $('cLoadPort').value = coa.port_of_loading || '';
      $('cDischargePort').value = coa.port_of_discharge || '';
      $('cGoods').value = coa.goods || '';
      $('cWetTons').value = coa.wet_tons != null ? coa.wet_tons : '';
      $('cDryTons').value = coa.dry_tons != null ? coa.dry_tons : '';
      $('cMoisture').value = coa.moisture != null ? coa.moisture : '';
      $('cPhysical').value = coa.physical_63mm != null ? coa.physical_63mm : '';
      $('cFe').value = coa.fe != null ? coa.fe : '';
      $('cP').value = coa.p != null ? coa.p : '';
      $('cS').value = coa.s != null ? coa.s : '';
      $('cSio2').value = coa.sio2 != null ? coa.sio2 : '';
      $('cAl2o3').value = coa.al2o3 != null ? coa.al2o3 : '';
      $('cLoi').value = coa.loi != null ? coa.loi : '';
      $('cRemark').value = coa.remark || '';
    }

    $('coaFormTip').hidden = true;
    $('coaEditMask').hidden = false;
  }

  function closeCoaEditor() {
    $('coaEditMask').hidden = true;
    coaEditorTargetId = null;
  }

  // 数值读取：空串 → null；非法数字 → NaN（由校验拦截）
  function numVal(id) {
    const raw = $(id).value.trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  // 成分类数值校验区间：0-100
  function validPct(n) { return n === null || (Number.isFinite(n) && n >= 0 && n <= 100); }

  async function saveCoaEditor() {
    const vid = $('cVoyage').value;
    const certNo = $('cCertificateNo').value.trim();
    const issueDate = $('cIssueDate').value;
    const vessel = $('cVessel').value.trim();
    const goods = $('cGoods').value.trim();

    // 必填校验
    if (!vid) return showCoaTip('请选择关联航次');
    if (!certNo) return showCoaTip('请填写证书编号');
    if (!issueDate) return showCoaTip('请填写签发日期');
    if (!vessel) return showCoaTip('请填写船名');
    if (!goods) return showCoaTip('请填写货物名称');

    // 证书号唯一校验（同号证书全局唯一）
    if (coas.some(c => c.certificate_no === certNo && c.id !== coaEditorTargetId)) {
      return showCoaTip('证书编号「' + certNo + '」已存在，请核对后重新填写');
    }

    // 数值读取与校验
    const wet = numVal('cWetTons'), dry = numVal('cDryTons');
    const moisture = numVal('cMoisture'), physical = numVal('cPhysical');
    const fe = numVal('cFe'), p = numVal('cP'), s = numVal('cS');
    const sio2 = numVal('cSio2'), al2o3 = numVal('cAl2o3'), loi = numVal('cLoi');

    if (Number.isNaN(wet) || Number.isNaN(dry)) return showCoaTip('吨位必须为数字');
    if ((wet !== null && wet <= 0) || (dry !== null && dry <= 0)) return showCoaTip('吨位必须大于 0');
    if (![moisture, physical, fe, p, s, sio2, al2o3, loi].every(validPct)) {
      return showCoaTip('成分与水分须为 0-100 之间的数字');
    }

    const now = Date.now();
    if (coaEditorTargetId) {
      const coa = coas.find(c => c.id === coaEditorTargetId);
      const prev = Object.assign({}, coa);   // 回滚快照：保存失败时恢复现场，弹窗保留供重试
      Object.assign(coa, {
        voyage_id: vid, certificate_no: certNo, issue_date: issueDate,
        country_of_origin: $('cOrigin').value.trim(), bl_date: $('cBlDate').value,
        shipment_no: $('cShipmentNo').value.trim(), vessel_name: vessel,
        port_of_loading: $('cLoadPort').value.trim(), port_of_discharge: $('cDischargePort').value.trim(),
        goods: goods, wet_tons: wet, dry_tons: dry, moisture: moisture, physical_63mm: physical,
        fe: fe, p: p, s: s, sio2: sio2, al2o3: al2o3, loi: loi,
        remark: $('cRemark').value.trim(), updated_at: now
      });
      if (!await saveCoas(coas)) { Object.assign(coa, prev); return; }
    } else {
      const rec = {
        id: 'coa' + now.toString(36),
        voyage_id: vid, certificate_no: certNo, issue_date: issueDate,
        country_of_origin: $('cOrigin').value.trim(), bl_date: $('cBlDate').value,
        shipment_no: $('cShipmentNo').value.trim(), vessel_name: vessel,
        port_of_loading: $('cLoadPort').value.trim(), port_of_discharge: $('cDischargePort').value.trim(),
        goods: goods, wet_tons: wet, dry_tons: dry, moisture: moisture, physical_63mm: physical,
        fe: fe, p: p, s: s, sio2: sio2, al2o3: al2o3, loi: loi,
        remark: $('cRemark').value.trim(),
        created_at: now, updated_at: now
      };
      coas.push(rec);
      if (!await saveCoas(coas)) { coas.pop(); return; }
    }

    closeCoaEditor();
    renderAll();   // 刷新列表按钮的已登记标记
    showTip('品质证书已保存');
  }

  function showCoaTip(msg) {
    const tip = $('coaFormTip');
    tip.textContent = msg;
    tip.hidden = false;
  }

  // ===== COA 抽屉事件绑定 =====
  function initCoa() {
    // 查看抽屉：关闭 / 编辑 / 删除
    $('coaClose').addEventListener('click', closeCoaView);
    $('coaViewCloseBtn').addEventListener('click', closeCoaView);
    $('coaViewEdit').addEventListener('click', () => {
      const coa = coas.find(c => c.id === coaViewEditingId);
      if (coa) openCoaEditor(coa);
    });
    $('coaViewDelete').addEventListener('click', async () => {
      const coa = coas.find(c => c.id === coaViewEditingId);
      if (!coa) return;
      if (!confirm('确认删除证书「' + coa.certificate_no + '」吗？删除后不可恢复。')) return;
      const prev = coas.slice();   // 回滚快照：保存失败时恢复现场
      coas = coas.filter(c => c.id !== coa.id);
      if (!await saveCoas(coas)) { coas = prev; return; }
      closeCoaView();
      renderAll();
      showTip('品质证书已删除');
    });

    // 空态登记入口
    $('coaViewCreate').addEventListener('click', () => {
      const voyageCode = $('coaViewVoyage').textContent || '';
      const v = voyages.find(x => (x.voyage_code + ' · ' + x.vessel_name) === voyageCode);
      openCoaEditor(null, v ? v.id : '');
    });

    // 编辑抽屉：关闭 / 保存
    $('coaEditClose').addEventListener('click', closeCoaEditor);
    $('coaEditCancel').addEventListener('click', closeCoaEditor);
    $('coaEditSave').addEventListener('click', saveCoaEditor);
  }


  // ===== 港口现货联动子表（行展开时渲染，数据经 HZData 'oceanSpots'） =====

  // 数值单元格：缺测（原表「–」）显示灰色占位
  const spotNumCell = v => (v === null || v === undefined || v === '')
    ? '<td class="spot-na">–</td>'
    : '<td class="spot-num">' + esc(v) + '</td>';


  // ===== 初始化（boot：HZDB 就绪后装载数据并渲染） =====
  async function boot() {
    await HZDB.ready();

    // 装载航次 / 现货 / 证书（HZDB 缓存，来源 /api/bootstrap）
    voyages = HZDB.get('voyages') || [];
    if (!Array.isArray(voyages)) voyages = [];
    spots = HZData.list('oceanSpots');   // 现货列表经 HZData 归一化（id/normalized_port/vessel_clean）
    coas = HZDB.get('coas') || [];

    // 字典派生（依赖 HZDB 缓存，就绪后构建）
    (HZData.dict('mineLoadPorts') || []).forEach(d => {
      MINE_LOAD_PORTS[d.mine] = { port: d.port, country: d.country, distance_note: d.note };
    });
    DISCHARGE_PORT_DICT = (HZData.dict('dischargePorts') || []).map(d => d.name);

    // 填充卸货港快捷选项（datalist，经 HZData 字典）
    const disPortList = document.getElementById('disPortOptions');
    if (disPortList) {
      disPortList.innerHTML = DISCHARGE_PORT_DICT.map(p => '<option value="' + esc(p) + '"></option>').join('');
    }

    initPortChips();
    initEditor();
    initTableActions();
    initCoa();              // COA 品质证书抽屉事件绑定
    bindPager();
    renderAll();            // 从数据库缓存恢复数据并渲染（含现货联动子表）
  }
  boot();
})();
