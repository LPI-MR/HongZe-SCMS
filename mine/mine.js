// ===== mine 模块脚本（矿山管理 · 列表页） =====
// 公共导航栏由 /common/fetch.js 加载；本脚本负责矿山主数据的增删改查、检索、分页与导出
// 矿山数据持久化到 localStorage（hz_mines），刷新页面不丢失
// 本模块为矿山主数据权威数据源：海运管理等后续模块通过读取 hz_mines 复用主数据（PRD 6.5）
(function () {
  'use strict';

  // 本页对应的导航位置：矿山管理（一级菜单）
  const NAV_PATH = '矿山管理';

  // 设置导航栏选中态：一级「矿山管理」高亮
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

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 枚举常量（PRD 4.2：mine_type / status 枚举值定义） =====
  const MINE_TYPES = {
    coal: '煤矿',
    iron: '铁矿',
    nonferrous: '有色金属矿',
    nonmetal: '非金属矿',
    other: '其他'
  };

  const STATUS = {
    active: '在用',
    inactive: '停用'
  };

  // 主流产品快捷字典（Q-MINE-02：建议从品类字典多选；支持自定义补充）
  const PRODUCT_DICT = [
    '铁矿石', '铁精粉', '块矿', '球团矿',
    'PB粉', '纽曼粉', '麦克粉', '杨迪粉', '罗布河粉', '超特粉', '混合粉',
    '卡拉加斯粉', 'IOCJ'
  ];

  // ===== 本地持久化 =====
  const LS_MINES = 'hz_mines';   // 矿山主数据（本模块权威存储键，其他模块只读复用）
  const LS_SEED_VER = 'hz_mines_seed_ver';   // 种子数据版本标记（v2：种子追加西芒杜）

  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // 矿山列表：[{id, mine_code, mine_name, short_name, mine_type, main_products,
  //   province, city, district, address, longitude, latitude, annual_capacity, reserve,
  //   ore_grade, operator, contact_person, contact_phone, status, remark,
  //   created_at, updated_at, created_by}]
  let mines = loadJSON(LS_MINES, []);
  if (!Array.isArray(mines)) mines = [];

  // ===== 预置五大矿山（首次打开时写入完整种子；v2 起对已有数据仅增量追加西芒杜，不覆盖用户维护的数据） =====
  // 力拓 / 必和必拓 / 淡水河谷 / 福斯特库 / 西芒杜——均为铁矿，经纬度用于看板分布与海运距离推算
  const SEED_VER = 'v2';

  // 种子基础数据（不含系统字段）
  function seedList() {
    return [
      {
        mine_name: '哈默斯利铁矿（皮尔巴拉）', short_name: '力拓',
        mine_type: 'iron', main_products: 'PB粉,杨迪粉,罗布河粉',
        province: '西澳大利亚州', city: '皮尔巴拉地区', district: '', address: 'Pilbara, Western Australia',
        longitude: 117.85, latitude: -22.66,
        annual_capacity: 35000, reserve: 2600000, ore_grade: 'TFe 61%-63%',
        operator: 'Rio Tinto（力拓集团）', contact_person: '', contact_phone: '',
        status: 'active', remark: '全球主要铁矿供应商之一，装货港以丹皮尔港为主'
      },
      {
        mine_name: '纽曼山铁矿（皮尔巴拉）', short_name: '必和必拓',
        mine_type: 'iron', main_products: '纽曼粉,麦克粉,块矿',
        province: '西澳大利亚州', city: '纽曼镇', district: '', address: 'Mount Newman, Pilbara, Western Australia',
        longitude: 119.75, latitude: -23.36,
        annual_capacity: 29000, reserve: 2100000, ore_grade: 'TFe 61%-62%',
        operator: 'BHP（必和必拓）', contact_person: '', contact_phone: '',
        status: 'active', remark: '装货港以黑德兰港为主'
      },
      {
        mine_name: '卡拉加斯铁矿', short_name: '淡水河谷',
        mine_type: 'iron', main_products: '卡拉加斯粉,IOCJ,球团矿',
        province: '帕拉州', city: '卡拉加斯矿区', district: '', address: 'Carajás, Pará, Brazil',
        longitude: -50.03, latitude: -6.07,
        annual_capacity: 20000, reserve: 7200000, ore_grade: 'TFe 65%-67%',
        operator: 'Vale（淡水河谷）', contact_person: '', contact_phone: '',
        status: 'active', remark: '全球品位最高的铁矿之一，装货港以图巴朗港为主'
      },
      {
        mine_name: '所罗门铁矿（奇切斯特岭）', short_name: '福斯特库',
        mine_type: 'iron', main_products: '超特粉,混合粉',
        province: '西澳大利亚州', city: '黑德兰港', district: '', address: 'Solomon Hub, Chichester Ranges, Western Australia',
        longitude: 118.0, latitude: -22.3,
        annual_capacity: 19000, reserve: 1600000, ore_grade: 'TFe 56%-59%',
        operator: 'Fortescue（福斯特库）', contact_person: '', contact_phone: '',
        status: 'active', remark: '装货港以黑德兰港为主'
      },
      {
        mine_name: '西芒杜铁矿（Simandou）', short_name: '西芒杜',
        mine_type: 'iron', main_products: '西芒杜高品位粉,块矿',
        province: '几内亚', city: '恩泽雷科雷大区', district: '', address: 'Simandou, Nzérékoré Region, Guinea',
        longitude: -9.0, latitude: 8.5,
        annual_capacity: 6000, reserve: 2400000, ore_grade: 'TFe 65%-67%',
        operator: 'Rio Tinto（力拓集团）SimFer联合体', contact_person: '', contact_phone: '',
        status: 'active', remark: '全球最大未开发高品位铁矿之一，装货港为几内亚莫雷巴亚港（Morebaya）'
      }
    ];
  }

  // 写入种子版本标记（失败不阻断，下次打开会重试迁移）
  function markSeedVer() {
    try { localStorage.setItem(LS_SEED_VER, SEED_VER); } catch (e) { /* 忽略 */ }
  }

  // 统一补齐系统字段：编号、时间戳、创建人
  function attachSystemFields(list) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return list.map((m, i) => Object.assign({
      id: 'm' + (now + i).toString(36),
      mine_code: genCode(i + 1),
      contact_person: '', contact_phone: '', district: '', address: '',
      longitude: null, latitude: null,
      created_at: now - (list.length - i) * day,   // 依次前推一天，保证默认按创建时间倒序稳定
      updated_at: now - (list.length - i) * day,
      created_by: '系统预置'
    }, m));
  }

  function seedMines() {
    const existing = loadJSON(LS_MINES, null);
    let seedVer = null;
    try { seedVer = localStorage.getItem(LS_SEED_VER); } catch (e) { /* 忽略 */ }

    if (existing === null) {
      // 首次打开：写入完整五大矿山种子
      mines = attachSystemFields(seedList());
      try {
        localStorage.setItem(LS_MINES, JSON.stringify(mines));
      } catch (e) { /* 预置失败不阻断页面，用户可手动新增 */ }
      markSeedVer();
      return;
    }

    // 版本迁移（v1 → v2）：旧数据不含西芒杜时仅追加一条，不触碰用户已有记录
    if (seedVer === SEED_VER) return;
    if (mines.some(m => m.short_name === '西芒杜')) { markSeedVer(); return; }
    const simandou = attachSystemFields(seedList().filter(m => m.short_name === '西芒杜'))
      .map(m => Object.assign(m, { mine_code: genCode() }));   // 编号顺延现有最大流水号
    mines = mines.concat(simandou);
    try {
      localStorage.setItem(LS_MINES, JSON.stringify(mines));
    } catch (e) { /* 追加失败不阻断页面 */ }
    markSeedVer();
  }

  function save() {
    try {
      localStorage.setItem(LS_MINES, JSON.stringify(mines));
      return true;
    } catch (e) {
      alert('本地存储空间不足，本次修改未能保存到浏览器。建议先「导出 Excel」备份数据后清理旧数据重试。');
      return false;
    }
  }

  function genId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 矿山编号生成：M- + 4位流水号（Q-MINE-01 建议默认规则；正式环境由后端生成）
  function genCode(seq) {
    if (seq == null) {
      // 取现有最大流水号 +1
      seq = mines.reduce((max, m) => {
        const n = /^M-(\d+)$/.exec(m.mine_code || '');
        return n ? Math.max(max, Number(n[1])) : max;
      }, 0) + 1;
    }
    return 'M-' + String(seq).padStart(4, '0');
  }

  // ===== 工具函数 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 时间格式化：YYYY-MM-DD HH:mm
  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 产能千分位（1 位小数以内）
  function fmtNum(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  // main_products 字符串 → 数组
  function productsOf(m) {
    return String(m.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // 所在地文本：省 + 市 + 区县
  function locationOf(m) {
    return [m.province, m.city, m.district].filter(Boolean).join(' ');
  }

  // ===== 数据渲染（表格数据驱动，参照 contracts 模式） =====
  const tbody = document.querySelector('.ledger-table tbody');

  // 由矿山对象构造表格行
  function renderRow(m) {
    const tr = document.createElement('tr');
    tr.dataset.id = m.id;
    tr.dataset.name = (m.mine_name || '') + ' ' + (m.short_name || '');
    tr.dataset.location = locationOf(m);
    tr.dataset.product = m.main_products || '';
    tr.dataset.status = m.status || '';
    tr.dataset.capacity = m.annual_capacity || 0;

    // 产品标签：最多显示 3 个，超出折叠为 +N
    const ps = productsOf(m);
    const tags = ps.slice(0, 3).map(p =>
      '<span class="product-tag" title="' + esc(p) + '">' + esc(p) + '</span>'
    ).join('');
    const more = ps.length > 3
      ? '<span class="product-tag more" title="' + esc(ps.slice(3).join('、')) + '">+' + (ps.length - 3) + '</span>'
      : '';

    const active = m.status === 'active';
    tr.innerHTML = [
      '<td class="col-index"></td>',
      '<td class="col-code">' + esc(m.mine_code) + '</td>',
      '<td class="col-name"><a class="mine-link" href="/mine/mine-detail.html?id=' + encodeURIComponent(m.id) + '">' +
        esc(m.mine_name) + '</a></td>',
      '<td class="col-products"><span class="product-tags">' + (tags + more || '—') + '</span></td>',
      '<td>' + (esc(locationOf(m)) || '—') + '</td>',
      '<td class="col-num">' + (m.annual_capacity != null && m.annual_capacity !== '' ? fmtNum(m.annual_capacity) : '—') + '</td>',
      '<td><span class="status-tag ' + esc(m.status) + '">' + esc(STATUS[m.status] || m.status) + '</span></td>',
      '<td class="col-date">' + fmtTime(m.created_at) + '</td>',
      '<td class="col-action"><div class="cell-actions">' +
        '<button class="row-act detail" type="button">详情</button>' +
        '<button class="row-act edit" type="button">编辑</button>' +
        '<button class="row-act toggle' + (active ? '' : ' on') + '" type="button" data-status="' + esc(m.status) + '">' +
          (active ? '停用' : '启用') + '</button>' +
      '</div></td>'
    ].join('');
    return tr;
  }

  // ===== 排序（默认创建时间倒序；支持名称、产能） =====
  let sortKey = 'created_at';   // mine_name | annual_capacity | created_at
  let sortDir = 'desc';         // asc | desc

  function sortedMines() {
    const dir = sortDir === 'asc' ? 1 : -1;
    return mines.slice().sort((a, b) => {
      if (sortKey === 'annual_capacity') {
        return ((Number(a.annual_capacity) || 0) - (Number(b.annual_capacity) || 0)) * dir;
      }
      if (sortKey === 'mine_name') {
        return String(a.mine_name || '').localeCompare(String(b.mine_name || ''), 'zh-CN') * dir;
      }
      return ((Number(a.created_at) || 0) - (Number(b.created_at) || 0)) * dir;
    });
  }

  function syncSortArrows() {
    const nameEl = document.getElementById('sortName');
    const capEl = document.getElementById('sortCapacity');
    nameEl.className = 'sort-arrow' + (sortKey === 'mine_name' ? ' ' + sortDir : '');
    capEl.className = 'sort-arrow' + (sortKey === 'annual_capacity' ? ' ' + sortDir : '');
  }

  // ===== 检索 =====
  // 数据行约定：tr 携带 data-id / data-name / data-location / data-product / data-status / data-capacity
  let applyFilter = null;

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const nameInput = document.getElementById('searchName');
    const locInput = document.getElementById('searchLocation');
    const prodSelect = document.getElementById('searchProduct');
    const statusSelect = document.getElementById('searchStatus');

    // 按当前检索条件过滤表格行；无匹配时显示空状态行
    applyFilter = function () {
      const keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      const loc = (locInput.value || '').trim().toLowerCase();
      const prod = prodSelect.value;
      const status = statusSelect.value;

      let visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(row => {
        if (row.classList.contains('empty-row')) return;

        const text = row.textContent.toLowerCase() + ' ' +
          Object.values(row.dataset).join(' ').toLowerCase();
        const ok =
          keywords.every(kw => text.includes(kw)) &&
          (!loc || (row.dataset.location || '').toLowerCase().includes(loc)) &&
          (!prod || (row.dataset.product || '').split(',').map(s => s.trim()).includes(prod)) &&
          (!status || row.dataset.status === status);

        row.hidden = !ok;
        // 标记「被检索过滤」的行：与分页隐藏区分，保证导出覆盖完整筛选结果
        if (ok) delete row.dataset.filtered;
        else row.dataset.filtered = '1';
        if (ok) visible += 1;
      });

      const emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    // 查询：阻止表单默认提交，执行过滤
    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    // 重置：清空条件后恢复显示全部行
    form.addEventListener('reset', () => {
      requestAnimationFrame(() => applyFilter());
    });
  }

  // 主流产品下拉选项：从现有矿山产品聚合去重（含预置字典）
  function refreshProductOptions() {
    const select = document.getElementById('searchProduct');
    if (!select) return;
    const cur = select.value;

    const set = new Set(PRODUCT_DICT);
    mines.forEach(m => productsOf(m).forEach(p => set.add(p)));
    const list = Array.from(set);

    select.innerHTML = '<option value="">全部</option>' +
      list.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
    select.value = list.includes(cur) ? cur : '';
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

    // 每页条数切换：回到第 1 页
    $('pageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    // 页码输入跳转：change 或回车触发，越界自动纠正
    const jump = () => {
      let p = parseInt($('pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('pgInput').addEventListener('change', jump);
    $('pgInput').addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });
  }

  // ===== 统计卡（矿山总数 / 在用 / 覆盖省份 / 产品种类）+ 列表小标题统计 =====
  function updateStats() {
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    document.getElementById('mineCount').textContent = rows.length;

    // 列表小标题合计产能（按全部矿山口径，与看板一致）
    const capTotal = mines.reduce((s, m) => s + (Number(m.annual_capacity) || 0), 0);
    document.getElementById('mineCapacity').textContent = fmtNum(capTotal);

    const active = mines.filter(m => m.status === 'active').length;
    document.getElementById('tTotal').textContent = mines.length;
    document.getElementById('tActive').textContent = active;

    // 覆盖省份数：所在地省份去重
    const provinces = new Set(mines.map(m => (m.province || '').trim()).filter(Boolean));
    document.getElementById('tProvinces').textContent = provinces.size;

    // 主流产品种类：所有矿山产品去重
    const prods = new Set();
    mines.forEach(m => productsOf(m).forEach(p => prods.add(p)));
    document.getElementById('tProducts').textContent = prods.size;
  }

  // 空状态行显示/隐藏
  function toggleEmptyRow() {
    const emptyRow = tbody.querySelector('.empty-row');
    const hasData = tbody.querySelectorAll('tr:not(.empty-row)').length > 0;
    if (emptyRow) emptyRow.hidden = hasData;
  }

  // 按当前数据全量重建表格（新增/编辑/停用后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => row.remove());
    sortedMines().forEach(m => tbody.appendChild(renderRow(m)));

    // 重新编号（按当前展示顺序）
    let i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(row => {
      row.querySelector('.col-index').textContent = ++i;
    });

    updateStats();
    toggleEmptyRow();
    if (applyFilter) applyFilter();
  }

  // ===== 新增 / 编辑抽屉 =====
  const $ = id => document.getElementById(id);
  let editingId = null;        // 正在编辑的矿山 id；null = 新增
  let selectedProducts = [];   // 抽屉内已选产品（工作区）
  let tipTimer = null;

  function showTip(msg) {
    const tip = $('formTip');
    tip.textContent = msg;
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 4000);
  }

  // 渲染快捷产品标签（选中态同步）
  function renderProductPills() {
    $('productPills').innerHTML = PRODUCT_DICT.map(p =>
      '<button type="button" class="product-pill' +
      (selectedProducts.includes(p) ? ' selected' : '') +
      '" data-product="' + esc(p) + '">' + esc(p) + '</button>'
    ).join('');
  }

  // 渲染已选产品回显（胶囊 + 移除）
  function renderSelectedProducts() {
    $('productSelected').innerHTML = selectedProducts.map(p =>
      '<span class="selected-tag">' + esc(p) +
      '<button type="button" class="tag-remove" data-product="' + esc(p) + '" title="移除">&times;</button>' +
      '</span>'
    ).join('');
  }

  function openEditor(m) {
    editingId = m ? m.id : null;
    $('editorTitle').textContent = m ? '编辑矿山（' + m.mine_code + '）' : '新增矿山';

    $('fMineName').value = m ? (m.mine_name || '') : '';
    $('fShortName').value = m ? (m.short_name || '') : '';
    $('fMineType').value = m ? (m.mine_type || 'iron') : 'iron';
    $('fOperator').value = m ? (m.operator || '') : '';
    $('fContactPerson').value = m ? (m.contact_person || '') : '';
    $('fContactPhone').value = m ? (m.contact_phone || '') : '';
    $('fProvince').value = m ? (m.province || '') : '';
    $('fCity').value = m ? (m.city || '') : '';
    $('fDistrict').value = m ? (m.district || '') : '';
    $('fAddress').value = m ? (m.address || '') : '';
    $('fLongitude').value = m && m.longitude != null ? m.longitude : '';
    $('fLatitude').value = m && m.latitude != null ? m.latitude : '';
    $('fAnnualCapacity').value = m && m.annual_capacity != null ? m.annual_capacity : '';
    $('fReserve').value = m && m.reserve != null ? m.reserve : '';
    $('fOreGrade').value = m ? (m.ore_grade || '') : '';
    $('fStatus').value = m ? (m.status || 'active') : 'active';
    $('fRemark').value = m ? (m.remark || '') : '';
    $('fProductCustom').value = '';

    selectedProducts = m ? productsOf(m) : [];
    renderProductPills();
    renderSelectedProducts();

    $('formTip').hidden = true;
    $('editorMask').hidden = false;
    $('fMineName').focus();
  }

  function closeEditor() {
    $('editorMask').hidden = true;
    editingId = null;
    selectedProducts = [];
  }

  // 收集抽屉表单并校验；通过返回数据对象，失败返回 null 并提示
  function collectForm() {
    const name = $('fMineName').value.trim();
    const province = $('fProvince').value.trim();
    const city = $('fCity').value.trim();

    if (!name) { showTip('请填写矿山名称'); $('fMineName').focus(); return null; }
    if (!province) { showTip('请填写所在省份'); $('fProvince').focus(); return null; }
    if (!city) { showTip('请填写所在城市'); $('fCity').focus(); return null; }
    if (!selectedProducts.length) { showTip('请至少选择一个主流产品'); return null; }

    // 矿山名称唯一（uk_mine_name；编辑时排除自身）
    const dup = mines.find(m => m.mine_name === name && m.id !== editingId);
    if (dup) { showTip('矿山名称「' + name + '」已存在（' + dup.mine_code + '），请修改'); return null; }

    // 经纬度校验：可为空；填写时必须在有效范围内（WGS84）
    const lon = $('fLongitude').value.trim();
    const lat = $('fLatitude').value.trim();
    let longitude = null;
    let latitude = null;
    if (lon !== '') {
      longitude = Number(lon);
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        showTip('经度需在 -180 ~ 180 之间'); $('fLongitude').focus(); return null;
      }
    }
    if (lat !== '') {
      latitude = Number(lat);
      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        showTip('纬度需在 -90 ~ 90 之间'); $('fLatitude').focus(); return null;
      }
    }

    // 数字字段：非负校验
    const num = (v, label) => {
      if (v === '') return null;
      const n = Number(v);
      if (isNaN(n) || n < 0) { showTip(label + '需为非负数字'); return false; }
      return n;
    };
    const capacity = num($('fAnnualCapacity').value.trim(), '年产能');
    if (capacity === false) return null;
    const reserve = num($('fReserve').value.trim(), '保有储量');
    if (reserve === false) return null;

    return {
      mine_name: name,
      short_name: $('fShortName').value.trim(),
      mine_type: $('fMineType').value,
      main_products: selectedProducts.join(','),
      province: province,
      city: city,
      district: $('fDistrict').value.trim(),
      address: $('fAddress').value.trim(),
      longitude: longitude,
      latitude: latitude,
      annual_capacity: capacity,
      reserve: reserve,
      ore_grade: $('fOreGrade').value.trim(),
      operator: $('fOperator').value.trim(),
      contact_person: $('fContactPerson').value.trim(),
      contact_phone: $('fContactPhone').value.trim(),
      status: $('fStatus').value,
      remark: $('fRemark').value.trim()
    };
  }

  function saveEditor() {
    const data = collectForm();
    if (!data) return;

    if (editingId) {
      const old = mines.find(m => m.id === editingId);
      if (!old) { showTip('数据已被删除，请刷新页面'); return; }
      Object.assign(old, data);
      old.updated_at = Date.now();
    } else {
      data.id = genId();
      data.mine_code = genCode();
      data.created_at = Date.now();
      data.updated_at = Date.now();
      data.created_by = 'admin';   // Q-MINE-06：默认管理员可编辑
      mines.push(data);
    }

    if (!save()) return;
    closeEditor();
    refreshProductOptions();
    renderAll();
  }

  function initEditor() {
    // 快捷标签点击切换选中
    $('productPills').addEventListener('click', e => {
      const pill = e.target.closest('.product-pill');
      if (!pill) return;
      const p = pill.dataset.product;
      const idx = selectedProducts.indexOf(p);
      if (idx >= 0) selectedProducts.splice(idx, 1);
      else selectedProducts.push(p);
      renderProductPills();
      renderSelectedProducts();
    });

    // 已选胶囊移除
    $('productSelected').addEventListener('click', e => {
      const btn = e.target.closest('.tag-remove');
      if (!btn) return;
      const idx = selectedProducts.indexOf(btn.dataset.product);
      if (idx >= 0) selectedProducts.splice(idx, 1);
      renderProductPills();
      renderSelectedProducts();
    });

    // 自定义产品：回车添加（去重）
    $('fProductCustom').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = e.target.value.trim();
      if (!v) return;
      if (selectedProducts.includes(v)) {
        showTip('产品「' + v + '」已在选择列表中');
        return;
      }
      selectedProducts.push(v);
      e.target.value = '';
      renderProductPills();
      renderSelectedProducts();
    });

    $('editorSave').addEventListener('click', saveEditor);
    $('editorCancel').addEventListener('click', closeEditor);
    $('editorClose').addEventListener('click', closeEditor);
    $('editorMask').addEventListener('click', e => {
      if (e.target === $('editorMask')) closeEditor();
    });
  }

  // ===== 表格操作：详情 / 编辑 / 停用启用（事件委托） =====
  function initTableActions() {
    // 表头排序：名称、产能（点击切换升降序）
    document.querySelectorAll('.col-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = key === 'mine_name' ? 'asc' : 'desc';   // 名称默认 A→Z，产能默认从高到低
        }
        syncSortArrows();
        renderAll();
      });
    });

    tbody.addEventListener('click', e => {
      // 详情：表格内统一入口（名称链接与详情按钮）
      const detailBtn = e.target.closest('.row-act.detail');
      if (detailBtn) {
        const row = detailBtn.closest('tr[data-id]');
        if (row) location.href = '/mine/mine-detail.html?id=' + encodeURIComponent(row.dataset.id);
        return;
      }

      // 编辑：打开抽屉并回填
      const editBtn = e.target.closest('.row-act.edit');
      if (editBtn) {
        const row = editBtn.closest('tr[data-id]');
        const m = row && mines.find(x => x.id === row.dataset.id);
        if (m) openEditor(m);
        return;
      }

      // 停用 / 启用：软删除，二次确认（MINE-06）
      const toggleBtn = e.target.closest('.row-act.toggle');
      if (toggleBtn) {
        const row = toggleBtn.closest('tr[data-id]');
        const m = row && mines.find(x => x.id === row.dataset.id);
        if (!m) return;

        const toActive = m.status !== 'active';
        const ok = confirm((toActive ? '确定启用' : '确定停用') +
          '矿山「' + (m.short_name || m.mine_name) + '」吗？' +
          (toActive ? '' : '停用后该矿山将不再出现在后续模块的下拉选项中。'));
        if (!ok) return;

        m.status = toActive ? 'active' : 'inactive';
        m.updated_at = Date.now();
        save();
        renderAll();
      }
    });
  }

  // ===== 导出 Excel：导出当前筛选结果（MINE-08，P2） =====
  function initExport() {
    const btn = $('exportBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!mines.length) {
        alert('暂无矿山数据可导出');
        return;
      }
      if (!window.XLSX) {
        alert('导出组件加载失败，请刷新页面后重试');
        return;
      }

      // 导出当前筛选结果：仅排除被检索过滤的行（data-filtered），包含分页未展示的行
      const visibleIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (!row.dataset.filtered) visibleIds.push(row.dataset.id);
      });
      const list = mines.filter(m => visibleIds.includes(m.id));

      if (!list.length) {
        alert('当前筛选条件下暂无可导出的矿山数据');
        return;
      }

      if (!confirm('将导出当前筛选结果 ' + list.length + ' 座矿山，是否继续？')) return;

      const headers = [
        '序号', '矿山编号', '矿山名称', '简称', '矿山类型', '主流产品',
        '所在省份', '所在城市', '所在区县', '详细地址',
        '经度', '纬度', '年产能（万吨/年）', '保有储量（万吨）', '品位',
        '开采/运营主体', '联系人', '联系电话', '状态', '创建时间', '创建人', '备注'
      ];

      const rows = list.map((m, i) => [
        i + 1,
        m.mine_code, m.mine_name, m.short_name || '', MINE_TYPES[m.mine_type] || m.mine_type,
        m.main_products,
        m.province, m.city, m.district || '', m.address || '',
        m.longitude != null ? m.longitude : '', m.latitude != null ? m.latitude : '',
        Number(m.annual_capacity || 0), Number(m.reserve || 0), m.ore_grade || '',
        m.operator || '', m.contact_person || '', m.contact_phone || '',
        STATUS[m.status] || m.status, fmtTime(m.created_at), m.created_by || '', m.remark || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));

      // 列宽设置（字符数）
      ws['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 24 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 32 },
        { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 10 }, { wch: 30 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '矿山台账');

      const d = new Date();
      const stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '矿山台账_' + stamp + '.xlsx');
    });
  }

  // ===== 初始化 =====
  seedMines();          // 首次打开预置四大矿山

  $('mineDashBtn').addEventListener('click', () => {
    location.href = '/mine/mine-dashboard.html';
  });

  initSearch();
  initEditor();
  initTableActions();
  initExport();
  bindPager();
  refreshProductOptions();
  syncSortArrows();
  renderAll();          // 启动时从 localStorage 恢复数据并渲染

  // 详情页「编辑」直达：?edit=<id> 自动打开对应编辑抽屉
  const editId = new URLSearchParams(location.search).get('edit');
  if (editId) {
    const m = mines.find(x => x.id === editId);
    if (m) openEditor(m);
  }
})();
