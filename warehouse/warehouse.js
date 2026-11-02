// ===== warehouse 模块脚本（仓储管理）=====
// 公共导航栏由 /common/fetch.js 加载；供应商数据存 localStorage，
// 后续接入后端时替换 load/save 实现即可
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 库存管理';

  // 设置导航栏选中态
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

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 数据层 ==================== */

  const STORE_KEY = 'hz_warehouse_suppliers_v1';

  // 合作类型定义（key → 徽标样式类）
  const TYPES = {
    '保税物流': 'bonded',
    '中转仓储': 'transit',
    '普通仓储': 'normal',
    '运输接驳': 'shuttle'
  };

  // 供应商公开资料（来源：河北新闻网、邯郸市政府网、武安市政府网、启信宝等公开报道与工商信息）
  const LEGACY_HBLG_INTRO = '河北陆港保税物流有限公司立足河北、服务京津冀，依托陆港口岸与保税政策优势，开展保税仓储、中转配送、通关协办等一体化物流服务，为客户提供大宗商品存储与供应链运转支撑。';

  const HBLG_PROFILE = {
    address: '河北省邯郸市武安市（武安保税物流中心）',
    throughput: '设计年货物处理量3000万吨',
    area: '规划占地1600亩',
    // 仓库规模与矿石分垛（垛位为示例初始化数据，可在编辑抽屉中调整）
    scale: '50000㎡',
    stacks: [
      { name: '1号垛', ore: 'PB粉', tonnage: '2.5万吨', note: '' },
      { name: '2号垛', ore: '纽曼粉', tonnage: '1.8万吨', note: '' },
      { name: '3号垛', ore: '巴西混合粉', tonnage: '1.5万吨', note: '' },
      { name: '4号垛', ore: 'PB块', tonnage: '1.2万吨', note: '' },
      { name: '5号垛', ore: '超特粉', tonnage: '1.0万吨', note: '' },
      { name: '6号垛', ore: '金布巴粉', tonnage: '0.8万吨', note: '' }
    ],
    intro: '河北港口集团旗下核心物流载体，运营河北省首家B型保税物流中心——武安保税物流中心，业务涵盖保税物流、铁路运输、钢材交易、再生钢铁、混矿加工、供应链金融、跨境电商、仓储交割八大板块。"河北陆港—天津等港口"铁水联运线路入选国家级典型案例，2024年完成联运量21.6万标箱，2021—2024年累计74.97万标箱，货源以武安地区钢厂原料等大宗货物为主。',
    facilities: '中心依托万利丰铁路专用线建设，设海关监管区、内贸物流区、综合服务区、行政商业区四大功能区，具备保税存储、出口退税、国际贸易与转口贸易等功能；铁水联运通道连通天津港、曹妃甸港、山东港口，提供集装箱短驳进站、装箱调偏、报关清关、预约提箱、跨境电商通关等配套服务。'
  };

  const NYYS_PROFILE = {
    address: '河北省邯郸市武安市南环东路1001号',
    contact: '李勇旺',
    phone: '0310-6287117',
    throughput: '300万吨级智慧物流园（规划）',
    area: '约146亩（仓储用地）',
    // 仓库规模与矿石分垛（垛位为示例初始化数据，可在编辑抽屉中调整）
    scale: '5000㎡',
    stacks: [
      { name: '1号垛', ore: 'PB粉', tonnage: '0.6万吨', note: '' },
      { name: '2号垛', ore: '混合粉', tonnage: '0.4万吨', note: '' },
      { name: '3号垛', ore: '磁铁精粉', tonnage: '0.3万吨', note: '邯邢本地矿' },
      { name: '4号垛', ore: '巴西混合粉', tonnage: '0.3万吨', note: '' },
      { name: '5号垛', ore: 'FMG混合粉', tonnage: '0.2万吨', note: '' },
      { name: '6号垛', ore: '罗布河混合粉', tonnage: '0.2万吨', note: '' }
    ],
    intro: '成立于2011年6月，注册资本5250万元，注册地位于邯郸武安市南环东路1001号。主营道路货物运输（普通、罐车、冷藏、大件、集装箱）、货运站场经营、铁路货物运输服务与汽车维修等，投资建设南洋（移山）智慧物流园，旗下全资持有武安市南洋石油销售有限公司。',
    facilities: '仓储地块位于武安东环路东侧、邯武快速路南侧（仓储用地约146亩）；运营南洋物流园，承担武安市区邮政快件分拨（15公里直封直投），园区配套货运站场、汽车维修及成品油补给等服务。'
  };

  const PUBLIC_PROFILES = {
    '河北陆港保税物流有限公司': HBLG_PROFILE,
    '河北南洋移山物流有限公司': NYYS_PROFILE
  };

  const SEED_SUPPLIERS = [
    {
      id: 'sup-001',
      name: '河北陆港保税物流有限公司',
      type: '保税物流',
      contact: '',
      phone: '',
      address: HBLG_PROFILE.address,
      throughput: HBLG_PROFILE.throughput,
      storage: '',
      area: HBLG_PROFILE.area,
      intro: HBLG_PROFILE.intro,
      facilities: HBLG_PROFILE.facilities,
      remark: '',
      createdAt: Date.now()
    },
    {
      id: 'sup-002',
      name: '河北南洋移山物流有限公司',
      type: '运输接驳',
      contact: NYYS_PROFILE.contact,
      phone: NYYS_PROFILE.phone,
      address: NYYS_PROFILE.address,
      throughput: NYYS_PROFILE.throughput,
      storage: '',
      area: NYYS_PROFILE.area,
      intro: NYYS_PROFILE.intro,
      facilities: NYYS_PROFILE.facilities,
      remark: '',
      createdAt: Date.now()
    }
  ];

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return migrate(seed());
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.list)) return seed();
      return migrate(data.list);
    } catch (e) {
      return seed();
    }
  }

  // 旧版示例指标值（migrate 时视为占位，需替换为真实资料）
  const LEGACY_CAPS = ['500万吨/年', '静态仓容60万吨', '约1500亩'];

  // 一次性数据补丁：南洋移山追加混合粉类垛位 + 品名库补齐（老数据浏览器生效，按品类名幂等）
  function patchStacks(list) {
    let changed = false;
    try {
      if (!localStorage.getItem('hz_warehouse_stack_patch_v1')) {
        list.forEach(s => {
          if (s.name !== '河北南洋移山物流有限公司') return;
          s.stacks = Array.isArray(s.stacks) ? s.stacks : [];
          [
            { name: '4号垛', ore: '巴西混合粉', tonnage: '0.3万吨', note: '' },
            { name: '5号垛', ore: 'FMG混合粉', tonnage: '0.2万吨', note: '' },
            { name: '6号垛', ore: '罗布河混合粉', tonnage: '0.2万吨', note: '' }
          ].forEach(t => {
            if (!s.stacks.some(x => (x.ore || '').trim() === t.ore)) {
              s.stacks.push(Object.assign({}, t));
              changed = true;
            }
          });
        });
        // 品名库同步补齐新品名（老浏览器品名库已存在时追加）
        const rawOre = localStorage.getItem('hz_warehouse_ores_v1');
        const dataOre = rawOre ? JSON.parse(rawOre) : null;
        if (dataOre && Array.isArray(dataOre.list)) {
          ['FMG混合粉', '罗布河混合粉'].forEach(n => {
            if (!dataOre.list.includes(n)) dataOre.list.push(n);
          });
          localStorage.setItem('hz_warehouse_ores_v1', JSON.stringify(dataOre));
        }
        localStorage.setItem('hz_warehouse_stack_patch_v1', '1');
      }
    } catch (e) { /* 忽略 */ }
    return changed;
  }

  // 数据迁移：为已有记录按公司名补充公开资料（不覆盖用户已填写的内容）
  function migrate(list) {
    let changed = false;
    list.forEach(s => {
      const p = PUBLIC_PROFILES[s.name];
      if (!p) return;
      Object.keys(p).forEach(k => {
        if (k === 'intro') {
          if (!s.intro || s.intro === LEGACY_HBLG_INTRO) { s.intro = p.intro; changed = true; }
        } else if (k === 'stacks') {
          // 分垛明细：旧数据无垛位（或为空数组）时补种子垛位，已有垛位不覆盖
          if (!Array.isArray(s.stacks) || !s.stacks.length) {
            s.stacks = p.stacks.map(t => Object.assign({}, t));
            changed = true;
          }
        } else if (!s[k] || LEGACY_CAPS.includes(s[k])) { s[k] = p[k]; changed = true; }
      });
    });
    if (patchStacks(list)) changed = true;
    if (changed) save(list);
    return list;
  }

  // 首次使用写入初始数据（stacks 深拷贝，避免编辑时改动共享种子数组）
  function seed() {
    const initial = SEED_SUPPLIERS.map(s => Object.assign({}, s, {
      stacks: (s.stacks || []).map(t => Object.assign({}, t))
    }));
    save(initial);
    return initial;
  }

  function save(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ list }));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  function genId() {
    return 'sup-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  let suppliers = load();

  /* ==================== 渲染 ==================== */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // KPI：仓库总数 / 当前总库存 / 今日入库 / 今日出库（与进销存台账联动）
  function renderKpi() {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;
    const totalStock = suppliers.reduce((sum, s) => sum + (s.stacks || []).reduce((s2, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? s2 + v : s2;
    }, 0), 0);
    const tRecs = ioRecords.filter(r => r.date === todayStr());
    const tin = tRecs.filter(r => r.type === 'in').reduce((a, r) => a + (Number(r.tons) || 0), 0);
    const tout = tRecs.filter(r => r.type === 'out').reduce((a, r) => a + (Number(r.tons) || 0), 0);

    const cards = [
      { label: '仓库总数', value: suppliers.length, cls: 'blue' },
      { label: '当前总库存', value: fmtTon(totalStock), cls: '' },
      { label: '今日入库', value: '+' + fmtTon(tin), cls: 'green' },
      { label: '今日出库', value: '-' + fmtTon(tout), cls: 'orange' }
    ];

    grid.innerHTML = cards.map(c => `
      <div class="kpi-card ${c.cls}">
        <div class="kpi-info">
          <div class="kpi-label">${esc(c.label)}</div>
          <div class="kpi-value">${c.value}</div>
        </div>
      </div>
    `).join('');
  }

  // 品类总计：跨仓库合计库存 + 可提货（非保税库存 + 保税已报关未出库）
  function renderTotal() {
    const table = document.getElementById('total-table');
    if (!table) return;
    const byOre = {};
    suppliers.forEach(s => {
      const bonded = s.type === '保税物流';
      const availMap = {};
      if (bonded) cdSummary(s).forEach(r => { availMap[r.ore] = r.avail; });
      (s.stacks || []).forEach(t => {
        const o = (t.ore || '').trim() || '未分类';
        const v = parseTon(t.tonnage);
        if (!isFinite(v)) return;
        if (!byOre[o]) byOre[o] = { stock: 0, avail: 0 };
        byOre[o].stock += v;
        // 可提货：非保税直接计库存；保税只计已报关未出库
        byOre[o].avail += bonded ? (availMap[o] || 0) : v;
      });
    });
    const rows = Object.keys(byOre).map(o => ({ ore: o, stock: byOre[o].stock, avail: byOre[o].avail }))
      .sort((a, b) => b.stock - a.stock);
    const tStock = rows.reduce((a, r) => a + r.stock, 0);
    const tAvail = rows.reduce((a, r) => a + r.avail, 0);
    table.innerHTML = `
      <thead><tr><th>品类</th><th>总库存（全仓库）</th><th>可提货</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r => `
        <tr>
          <td class="st-name">${esc(r.ore)}</td>
          <td class="num">${fmtTon(r.stock)}</td>
          <td class="num ok">${r.avail ? fmtTon(r.avail) : '—'}</td>
        </tr>`).join('') : '<tr><td colspan="3" class="io-empty">暂无垛位库存数据</td></tr>'}
        <tr class="io-total">
          <td>总计</td>
          <td class="num">${fmtTon(tStock)}</td>
          <td class="num ok">${fmtTon(tAvail)}</td>
        </tr>
      </tbody>`;
  }

  function renderAll() {
    renderKpi();
    renderTotal();
    renderStock();
  }

  /* ==================== 仓库库存实时总览 ==================== */

  // 解析库存量文本 → 吨（支持 万吨 / 吨 / 公斤 / kg / t，纯数字视为吨）
  function parseTon(str) {
    if (str == null) return NaN;
    const m = String(str).replace(/,/g, '').match(/(-?[\d.]+)\s*(万吨|公斤|kg|吨|t)?/i);
    if (!m) return NaN;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return NaN;
    const u = (m[2] || '').toLowerCase();
    if (u === '万吨') return n * 10000;
    if (u === '公斤' || u === 'kg') return n / 1000;
    return n;
  }

  // 吨 → 展示文本（≥1千吨显示万吨，最多 2 位小数；否则显示吨）
  function fmtTon(t) {
    if (!isFinite(t)) return '—';
    if (t >= 1000) {
      const w = Math.round(t / 100) / 100;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.round(t) + '吨';
  }

  // 渲染库存看板：按仓库分组、按品类汇总垛位库存（编辑分垛保存后自动刷新）
  function renderStock() {
    const grid = document.getElementById('stock-grid');
    if (!grid) return;

    const cards = suppliers.map(s => {
      const byOre = {};
      let total = 0;
      (s.stacks || []).forEach(t => {
        const ore = (t.ore || '').trim() || '未分类';
        const v = parseTon(t.tonnage);
        if (isFinite(v)) {
          byOre[ore] = (byOre[ore] || 0) + v;
          total += v;
        } else if (!(ore in byOre)) {
          byOre[ore] = NaN;  // 有垛位但库存量缺失/无法识别的品类，仍展示
        }
      });

      const rows = Object.keys(byOre)
        .map(ore => ({ ore, v: byOre[ore] }))
        .sort((a, b) => (isFinite(b.v) ? b.v : -1) - (isFinite(a.v) ? a.v : -1));
      const maxV = rows.reduce((m, r) => Math.max(m, isFinite(r.v) ? r.v : 0), 0);

      // 该仓库当日出入库合计 + 分品类今日出入（进销存联动展示）
      const tRecs = ioRecords.filter(r => r.date === todayStr() && r.supId === s.id);
      const todayByOre = {};
      tRecs.forEach(r => {
        const o = (r.ore || '').trim() || '未分类';
        if (!todayByOre[o]) todayByOre[o] = { tin: 0, tout: 0 };
        if (r.type === 'in') todayByOre[o].tin += Number(r.tons) || 0;
        else todayByOre[o].tout += Number(r.tons) || 0;
      });
      const tin = tRecs.filter(r => r.type === 'in').reduce((a, r) => a + (Number(r.tons) || 0), 0);
      const tout = tRecs.filter(r => r.type === 'out').reduce((a, r) => a + (Number(r.tons) || 0), 0);

      // 保税仓库：只有已报关未出库的量可出库——品类行实时显示「可出库 / 未报关」
      const bonded = s.type === '保税物流';
      const availSum = bonded ? cdSummary(s).reduce((a, r) => a + r.avail, 0) : 0;

      const rowsHtml = rows.length ? rows.map(r => {
        const pct = isFinite(r.v) && maxV ? Math.round(r.v / maxV * 100) : 0;
        const t = todayByOre[r.ore] || { tin: 0, tout: 0 };
        const avail = bonded ? cdAvail(s, r.ore) : 0;
        const noOut = bonded && !avail;
        const availTxt = bonded
          ? ` · 可出库 <b class="avail${avail ? '' : ' zero'}">${fmtTon(avail)}</b> · 未报关 <b class="und">${fmtTon(Math.max(0, (isFinite(r.v) ? r.v : 0) - avail))}</b>`
          : '';
        return `
        <div class="ore-row">
          <span class="ore-name">${esc(r.ore)}</span>
          <span class="ore-bar"><i style="width:${pct}%"></i></span>
          <span class="ore-val ${isFinite(r.v) ? '' : 'empty'}">${fmtTon(r.v)}</span>
          <span class="ore-acts">
            <button type="button" class="ore-act in" data-sup="${esc(s.id)}" data-ore="${esc(r.ore)}" title="该品类入库">入</button>
            <button type="button" class="ore-act out${noOut ? ' off' : ''}" data-sup="${esc(s.id)}" data-ore="${esc(r.ore)}" title="${noOut ? '保税货物：无可出库量，请先报关' : '该品类出库'}">出</button>
          </span>
          <span class="ore-today${!t.tin && !t.tout && !bonded ? ' none' : ''}">今日入 <b class="tin">${fmtTon(t.tin)}</b> · 今日出 <b class="tout">${fmtTon(t.tout)}</b>${availTxt}</span>
        </div>`;
      }).join('') : '<div class="stock-empty">暂无垛位库存数据</div>';

      return `
      <div class="stock-card${bonded ? ' bonded' : ''}">
        <div class="stock-head">
          <div class="stock-name">${esc(s.name)}</div>
          <div class="stock-meta">
            ${s.scale ? `<span class="stock-scale">${esc(s.scale)}</span>` : ''}
            ${bonded ? `<span class="stock-avail">可出库 <b>${fmtTon(availSum)}</b></span>` : ''}
            <span class="stock-total">合计 <b>${fmtTon(total)}</b></span>
          </div>
        </div>
        <div class="ore-list">${rowsHtml}</div>
        <div class="stock-today"><span>今日入库 <b class="tin">${fmtTon(tin)}</b></span><span>今日出库 <b class="tout">${fmtTon(tout)}</b></span></div>
        <div class="stock-foot">
          <button type="button" class="stock-edit" data-id="${esc(s.id)}">调整库存</button>
        </div>
      </div>`;
    }).join('');

    grid.innerHTML = cards || '<div class="empty-state">暂无仓库数据，请先在「供应商列表」子模块中添加仓库</div>';
  }

  // 品类行「入 / 出」→ 预填仓库与品类直接登记；保税品类无可出库量时拦截出库；
  // 「调整库存」→ 跳转供应商子模块编辑
  document.getElementById('stock-grid').addEventListener('click', e => {
    const act = e.target.closest('.ore-act');
    if (act) {
      if (act.classList.contains('out') && act.classList.contains('off')) {
        alert(`「${act.getAttribute('data-ore')}」无可出库量（已报关未出库为 0），保税货物需先在「保税报关节点」登记报关`);
        return;
      }
      openIoModal(act.classList.contains('out') ? 'out' : 'in', {
        supId: act.getAttribute('data-sup'),
        ore: act.getAttribute('data-ore')
      });
      return;
    }
    const btn = e.target.closest('.stock-edit');
    if (!btn) return;
    // 分垛明细统一在「供应商列表」子模块维护：跳转并自动打开该仓库的编辑抽屉
    location.href = '/warehouse/suppliers.html?edit=' + encodeURIComponent(btn.getAttribute('data-id'));
  });

  /* ==================== 进销存台账（入库 / 出库 / 每日盘点） ==================== */

  const IO_KEY = 'hz_warehouse_io_v1';

  function loadIo() {
    try {
      const raw = localStorage.getItem(IO_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.list)) return data.list;
    } catch (e) { /* 存储不可用时忽略 */ }
    return [];
  }

  function saveIo(list) {
    try { localStorage.setItem(IO_KEY, JSON.stringify({ list })); } catch (e) { /* 忽略 */ }
  }

  let ioRecords = loadIo();

  /* ---- 矿石品名库（品类联想输入 + 自定义维护） ---- */

  const ORE_KEY = 'hz_warehouse_ores_v1';
  const ORE_SEED = ['PB粉', 'PB块', '纽曼粉', '纽曼块', '麦克粉', '巴西混合粉', 'FMG混合粉', '罗布河混合粉', '超特粉', '金布巴粉', '混合粉', '磁铁精粉', '罗布河粉', '扬迪粉'];

  function loadOres() {
    try {
      const data = JSON.parse(localStorage.getItem(ORE_KEY));
      if (data && Array.isArray(data.list)) return data.list;
    } catch (e) { /* 忽略 */ }
    const seed = ORE_SEED.slice();
    saveOres(seed);
    return seed;
  }

  function saveOres(list) {
    try { localStorage.setItem(ORE_KEY, JSON.stringify({ list })); } catch (e) { /* 忽略 */ }
  }

  let oreCatalog = loadOres();

  function todayStr() { return fmtTime(Date.now()); }

  // 垛位库存写回格式：万吨保留 3 位小数（吨取整），保证小批量出入库不丢精度
  function fmtStackTon(t) {
    if (!isFinite(t)) t = 0;
    if (t >= 1000) {
      const w = Math.round(Math.round(t) / 10) / 1000;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.max(0, Math.round(t)) + '吨';
  }

  // 某仓库某品类剩余库存（吨）
  function oreStock(sup, ore) {
    return (sup.stacks || []).reduce((sum, t) => {
      if ((t.ore || '').trim() !== ore) return sum;
      const v = parseTon(t.tonnage);
      return isFinite(v) ? sum + v : sum;
    }, 0);
  }

  // 出入库联动垛位库存：入库并入首个同名品类垛位（无则新建垛位）；出库按垛顺序扣减。
  // 出库库存不足时返回 false（不改动任何数据）
  function applyIoToStacks(sup, ore, tons, type) {
    sup.stacks = Array.isArray(sup.stacks) ? sup.stacks : [];
    const matches = sup.stacks.filter(t => (t.ore || '').trim() === ore);
    if (type === 'in') {
      if (matches.length) {
        const t0 = matches[0];
        t0.tonnage = fmtStackTon((parseTon(t0.tonnage) || 0) + tons);
      } else {
        sup.stacks.push({ name: (sup.stacks.length + 1) + '号垛', ore, tonnage: fmtStackTon(tons), note: '' });
      }
      return true;
    }
    const have = matches.reduce((sum, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? sum + v : sum;
    }, 0);
    if (have < tons) return false;
    let need = tons;
    matches.forEach(t => {
      if (need <= 0) return;
      const v = isFinite(parseTon(t.tonnage)) ? parseTon(t.tonnage) : 0;
      const cut = Math.min(v, need);
      t.tonnage = fmtStackTon(v - cut);
      need -= cut;
    });
    return true;
  }

  /* ---- 入库 / 出库登记弹窗 ---- */

  const ioModal = document.getElementById('io-modal');
  const ioForm = document.getElementById('io-form');
  let ioType = 'in';

  function openIoModal(type, prefill) {
    closeDetail();
    ioType = type === 'out' ? 'out' : 'in';
    // 提货钢厂仅出库时显示
    document.getElementById('io-steel-item').style.display = ioType === 'out' ? '' : 'none';
    document.getElementById('io-title').textContent = ioType === 'in' ? '入库登记' : '出库登记';
    document.getElementById('io-submit').textContent = ioType === 'in' ? '确认入库' : '确认出库';

    // 仓库选项
    document.getElementById('io-sup').innerHTML = suppliers.map(s =>
      `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');

    // 品类候选：品名库 + 全部仓库在库品类
    const oreSet = oreCatalog.slice();
    suppliers.forEach(s => (s.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (o && !oreSet.includes(o)) oreSet.push(o);
    }));
    document.getElementById('io-ore-list').innerHTML =
      oreSet.map(o => `<option value="${esc(o)}"></option>`).join('');

    ioForm.reset();
    if (prefill && prefill.supId) document.getElementById('io-sup').value = prefill.supId;
    if (prefill && prefill.ore) document.getElementById('io-ore').value = prefill.ore;
    document.getElementById('io-date-in').value = todayStr();
    modalMask.hidden = false;
    ioModal.hidden = false;
    document.body.classList.add('drawer-open');
    updateIoHint();
    document.getElementById('io-ore').focus();
  }

  function closeIoModal() {
    ioModal.hidden = true;
    if (oreModal.hidden) {
      modalMask.hidden = true;
      document.body.classList.remove('drawer-open');
    }
  }

  // 品类 / 数量 / 仓库联动提示：出库时校验剩余库存；保税仓库出库只能从已报关出
  function updateIoHint() {
    const sup = suppliers.find(x => x.id === document.getElementById('io-sup').value);
    const ore = document.getElementById('io-ore').value.trim();
    const tons = Number(document.getElementById('io-ton').value);
    const hint = document.getElementById('io-hint');
    if (!sup || !ore) { hint.textContent = ''; return; }
    const stock = oreStock(sup, ore);
    const t = isFinite(tons) ? tons : 0;
    if (ioType === 'out' && sup.type === '保税物流') {
      const avail = cdAvail(sup, ore);
      hint.textContent = `「${ore}」保税货物：已报关未出库（可出库）${fmtTon(avail)}，未报关 ${fmtTon(Math.max(0, stock - avail))} 无法出库；本次出库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后可出库余 ${fmtTon(Math.max(0, avail - t))}`;
      return;
    }
    hint.textContent = ioType === 'out'
      ? `「${ore}」当前库存 ${fmtTon(stock)}，出库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后剩余 ${fmtTon(Math.max(0, stock - t))}`
      : `「${ore}」当前库存 ${fmtTon(stock)}，入库 ${isFinite(tons) ? fmtTon(tons) : '—'} 后共 ${fmtTon(stock + t)}`;
  }

  ['io-sup', 'io-ore', 'io-ton'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateIoHint);
    document.getElementById(id).addEventListener('change', updateIoHint);
  });

  ioForm.addEventListener('submit', e => {
    e.preventDefault();
    const sup = suppliers.find(x => x.id === document.getElementById('io-sup').value);
    const ore = document.getElementById('io-ore').value.trim();
    const tons = Number(document.getElementById('io-ton').value);
    const date = document.getElementById('io-date-in').value || todayStr();
    const order = (document.getElementById('io-order')?.value || '').trim();
    const steel = (document.getElementById('io-steel')?.value || '').trim();
    const note = document.getElementById('io-note').value.trim();

    if (!sup) { alert('请先在「供应商列表」子模块添加仓库'); return; }
    if (!ore) { document.getElementById('io-ore').focus(); return; }
    if (!isFinite(tons) || tons <= 0) { document.getElementById('io-ton').focus(); return; }

    // 保税仓库出库硬校验：只能出已报关未出库的量，未报关无法出库
    if (ioType === 'out' && sup.type === '保税物流') {
      const avail = cdAvail(sup, ore);
      if (tons > avail) {
        alert(`出库失败：「${ore}」为保税货物，已报关未出库仅 ${fmtTon(avail)}，未报关的 ${fmtTon(Math.max(0, oreStock(sup, ore) - avail))} 无法出库，请先登记报关`);
        return;
      }
    }

    if (!applyIoToStacks(sup, ore, tons, ioType)) {
      alert(`出库失败：「${ore}」当前库存仅 ${fmtTon(oreStock(sup, ore))}，不足 ${fmtTon(tons)}`);
      return;
    }

    ioRecords.push({
      id: genId(), supId: sup.id, date, type: ioType, ore,
      tons: Math.round(tons * 10) / 10, order, steel, note, createdAt: Date.now()
    });
    saveIo(ioRecords);
    save(suppliers);
    renderAll();
    closeIoModal();
  });

  // 登记弹窗按钮（台账工具栏已迁移至「进销存台账」子模块 io.html）
  document.getElementById('io-close').addEventListener('click', closeIoModal);
  document.getElementById('io-cancel').addEventListener('click', closeIoModal);

  /* ---- 矿石品类管理弹窗 ---- */

  const oreModal = document.getElementById('ore-modal');

  function openOreModal() {
    closeIoModal();
    renderOreCatalog();
    modalMask.hidden = false;
    oreModal.hidden = false;
    document.body.classList.add('drawer-open');
    document.getElementById('ore-new').focus();
  }

  function closeOreModal() {
    oreModal.hidden = true;
    if (ioModal.hidden) {
      modalMask.hidden = true;
      document.body.classList.remove('drawer-open');
    }
  }

  // 品名列表：品名库（可删除）+ 垛位在用品类（标记「在库」，仅展示）
  function renderOreCatalog() {
    const box = document.getElementById('ore-catalog');
    if (!box) return;
    const stackOres = [];
    suppliers.forEach(s => (s.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (o && !oreCatalog.includes(o) && !stackOres.includes(o)) stackOres.push(o);
    }));
    const item = (o, canDel) => `
      <div class="ore-item">
        <span class="ore-item-name">${esc(o)}</span>
        ${canDel
          ? `<button type="button" class="ore-item-del" data-ore="${esc(o)}" title="从品名库移除">✕</button>`
          : '<span class="ore-item-tag">在库</span>'}
      </div>`;
    const html = oreCatalog.map(o => item(o, true)).join('') + stackOres.map(o => item(o, false)).join('');
    box.innerHTML = html || '<div class="io-empty">暂无品名，先在上方添加</div>';
  }

  function addOre() {
    const input = document.getElementById('ore-new');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    if (!oreCatalog.includes(name)) {
      oreCatalog.push(name);
      saveOres(oreCatalog);
      renderOreCatalog();
    }
    input.value = '';
    input.focus();
  }

  document.getElementById('ore-manage').addEventListener('click', () => openOreModal());
  document.getElementById('ore-close').addEventListener('click', closeOreModal);
  document.getElementById('ore-add').addEventListener('click', addOre);
  document.getElementById('ore-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addOre(); }
  });
  document.getElementById('ore-catalog').addEventListener('click', e => {
    const del = e.target.closest('.ore-item-del');
    if (!del) return;
    oreCatalog = oreCatalog.filter(o => o !== del.getAttribute('data-ore'));
    saveOres(oreCatalog);
    renderOreCatalog();
  });

  /* ==================== 保税报关节点（保税物流仓库专用） ==================== */

  const CD_KEY = 'hz_warehouse_customs_v1';

  function loadCd() {
    try {
      const raw = localStorage.getItem(CD_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.list)) return data.list;
    } catch (e) { /* 忽略 */ }
    return [];
  }

  let cdRecords = loadCd();

  // 保税仓库分品类报关台账：
  // stock 在库 / declared 已报关累计 / exported 报关出库（出库只允许从已报关出）
  // avail 已报关未出库（= 可出库）/ undeclared 未报关在库（= 在库 - 可出库）
  function cdSummary(sup) {
    const stock = {};
    (sup.stacks || []).forEach(t => {
      const o = (t.ore || '').trim();
      if (!o) return;
      const v = parseTon(t.tonnage);
      if (isFinite(v)) stock[o] = (stock[o] || 0) + v;
    });
    const declared = {};
    cdRecords.forEach(r => {
      if (r.supId !== sup.id) return;
      const o = (r.ore || '').trim();
      if (!o) return;
      declared[o] = (declared[o] || 0) + (Number(r.tons) || 0);
    });
    const exported = {};
    ioRecords.forEach(r => {
      if (r.supId !== sup.id || r.type !== 'out') return;
      const o = (r.ore || '').trim();
      if (!o) return;
      exported[o] = (exported[o] || 0) + (Number(r.tons) || 0);
    });
    return Object.keys(Object.assign({}, stock, declared, exported)).map(o => {
      const s = stock[o] || 0;
      const d = declared[o] || 0;
      const avail = Math.max(0, d - (exported[o] || 0));   // 已报关未出库
      return {
        ore: o, stock: s, declared: d, exported: exported[o] || 0,
        avail, undeclared: Math.max(0, s - avail)
      };
    }).sort((a, b) => b.undeclared - a.undeclared);
  }

  // 某保税仓库某品类可出库量（已报关未出库）
  function cdAvail(sup, ore) {
    const row = cdSummary(sup).find(r => r.ore === ore);
    return row ? row.avail : 0;
  }

  /* ---- 报关登记弹窗已迁移至「保税报关」子模块（customs.js） ---- */

  // 供应商新增 / 编辑抽屉已迁移至「供应商列表」子模块（suppliers.js）


  /* ==================== 弹窗遮罩（出入库 / 品类 / 报关弹窗共用） ==================== */

  const modalMask = document.getElementById('modal-mask');

  // 关闭全部弹窗（弹窗打开前调用，避免叠层）
  function closeDetail() {
    modalMask.hidden = true;
    ioModal.hidden = true;
    oreModal.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  modalMask.addEventListener('click', closeDetail);

  // Esc 依次关闭出入库 / 品类 / 报关弹窗
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!ioModal.hidden) closeIoModal();
    else if (!oreModal.hidden) closeOreModal();
  });

  // 其他子模块（台账 / 报关 / 供应商）修改数据后，本页自动同步刷新
  window.addEventListener('storage', e => {
    try {
      if (e.key === STORE_KEY) {
        const data = JSON.parse(e.newValue);
        if (data && Array.isArray(data.list)) { suppliers = data.list; renderAll(); }
      } else if (e.key === IO_KEY) {
        const data = JSON.parse(e.newValue);
        if (data && Array.isArray(data.list)) { ioRecords = data.list; renderAll(); }
      } else if (e.key === CD_KEY) {
        const data = JSON.parse(e.newValue);
        if (data && Array.isArray(data.list)) { cdRecords = data.list; renderAll(); }
      }
    } catch (err) { /* 忽略 */ }
  });

  /* ==================== 初始化 ==================== */

  renderAll();
})();
