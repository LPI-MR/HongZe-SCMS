// ===== warehouse / io 模块脚本（进销存台账子模块）=====
// 公共导航栏由 /common/fetch.js 加载；出入库流水、品名库、报关台账存 localStorage，
// 后续接入后端时替换 load/save 实现即可
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 进销存台账';

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

  /* ==================== 数据层（仓库，与其他子模块共享 key） ==================== */

  const STORE_KEY = 'hz_warehouse_suppliers_v1';

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

  /* ==================== 工具函数 ==================== */

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

  function todayStr() { return fmtTime(Date.now()); }

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

  // 垛位库存写回格式：万吨保留 3 位小数（吨取整），保证小批量出入库不丢精度
  function fmtStackTon(t) {
    if (!isFinite(t)) t = 0;
    if (t >= 1000) {
      const w = Math.round(Math.round(t) / 10) / 1000;
      return (w % 1 ? String(w) : w.toFixed(0)) + '万吨';
    }
    return Math.max(0, Math.round(t)) + '吨';
  }

  function supplierName(id) {
    const s = suppliers.find(x => x.id === id);
    return s ? s.name : '未知仓库';
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

  /* ---- 矿石品名库（品类联想输入） ---- */

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

  /* ---- 报关台账（只读：保税仓库出库校验用） ---- */

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

  // 保税仓库分品类报关台账：avail 已报关未出库（= 可出库）
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

  // 指定日期的出入库汇总
  function ioSummary(date) {
    const recs = ioRecords.filter(r => r.date === date);
    const sum = type => recs.filter(r => r.type === type)
      .reduce((s, r) => s + (Number(r.tons) || 0), 0);
    return { recs, inTons: sum('in'), outTons: sum('out') };
  }

  // 时:分（流水显示用）
  function fmtHM(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 渲染进销存台账（当日 KPI + 分品类盘点表 + 提货钢厂汇总 + 流水明细），日期选择器联动
  function renderIo() {
    const dateInput = document.getElementById('io-date');
    if (!dateInput) return;
    if (!dateInput.value) dateInput.value = todayStr();
    const date = dateInput.value;
    const { recs, inTons, outTons } = ioSummary(date);

    const totalStock = suppliers.reduce((sum, s) => sum + (s.stacks || []).reduce((s2, t) => {
      const v = parseTon(t.tonnage);
      return isFinite(v) ? s2 + v : s2;
    }, 0), 0);

    document.getElementById('io-summary').innerHTML = `
      <div class="io-kpi"><div class="io-kpi-num">${fmtTon(totalStock)}</div><div class="io-kpi-label">当前剩余库存</div></div>
      <div class="io-kpi"><div class="io-kpi-num in">+${fmtTon(inTons)}</div><div class="io-kpi-label">${esc(date)} 入库合计</div></div>
      <div class="io-kpi"><div class="io-kpi-num out">-${fmtTon(outTons)}</div><div class="io-kpi-label">${esc(date)} 出库合计</div></div>
      <div class="io-kpi"><div class="io-kpi-num">${recs.length}</div><div class="io-kpi-label">当日流水笔数</div></div>`;

    // 当日分品类汇总
    const byOre = {};
    recs.forEach(r => {
      const o = (r.ore || '').trim() || '未分类';
      byOre[o] = byOre[o] || { in: 0, out: 0 };
      const v = Number(r.tons) || 0;
      if (r.type === 'in') byOre[o].in += v; else byOre[o].out += v;
    });
    const ores = Object.keys(byOre)
      .sort((a, b) => (byOre[b].in + byOre[b].out) - (byOre[a].in + byOre[a].out));

    document.getElementById('io-table').innerHTML = `
      <thead><tr><th>品类</th><th>入库</th><th>出库</th></tr></thead>
      <tbody>
        ${ores.length ? ores.map(o => `
          <tr>
            <td class="st-name">${esc(o)}</td>
            <td class="num ${byOre[o].in ? 'in' : ''}">${byOre[o].in ? fmtTon(byOre[o].in) : '—'}</td>
            <td class="num ${byOre[o].out ? 'out' : ''}">${byOre[o].out ? fmtTon(byOre[o].out) : '—'}</td>
          </tr>`).join('') + `
          <tr class="io-total">
            <td>合计</td>
            <td class="num in">${fmtTon(inTons)}</td>
            <td class="num out">${fmtTon(outTons)}</td>
          </tr>`
        : '<tr><td colspan="3" class="io-empty">该日暂无出入库记录</td></tr>'}
      </tbody>`;

    // 当日提货钢厂汇总：哪家钢厂提了多少、什么产品、什么时间、从哪个仓库提的
    const bySteel = {};
    recs.filter(r => r.type === 'out').forEach(r => {
      const k = (r.steel || '').trim() || '未填写钢厂';
      bySteel[k] = bySteel[k] || { total: 0, items: [] };
      const v = Number(r.tons) || 0;
      bySteel[k].total += v;
      bySteel[k].items.push({ ore: r.ore, tons: v, sup: supplierName(r.supId), hm: r.createdAt ? fmtHM(r.createdAt) : '' });
    });
    const steels = Object.keys(bySteel).sort((a, b) => bySteel[b].total - bySteel[a].total);
    document.getElementById('io-steel-table').innerHTML = `
      <thead><tr><th>提货钢厂</th><th>提货合计</th><th>提货明细（品类 · 数量 · 时间）</th></tr></thead>
      <tbody>
        ${steels.length ? steels.map(k => `
        <tr>
          <td class="st-name">${esc(k)}</td>
          <td class="num out">${fmtTon(bySteel[k].total)}</td>
          <td class="steel-items">${bySteel[k].items.map(i => `<span class="steel-item">${esc(i.ore)} <b>${fmtTon(i.tons)}</b>${i.sup ? ' · ' + esc(i.sup) : ''}${i.hm ? ' · ' + i.hm : ''}</span>`).join('')}</td>
        </tr>`).join('')
        : '<tr><td colspan="3" class="io-empty">当日暂无钢厂提货出库记录</td></tr>'}
      </tbody>`;

    // 当日流水明细（含关联订单号 / 提货钢厂 / 时间）
    document.getElementById('io-records').innerHTML = recs.length
      ? recs.slice().sort((a, b) => b.createdAt - a.createdAt).map(r => `
        <div class="io-rec ${r.type}">
          <span class="io-rec-type">${r.type === 'in' ? '入' : '出'}</span>
          <span class="io-rec-ore">${esc(r.ore)}</span>
          <span class="io-rec-ton">${r.type === 'in' ? '+' : '-'}${fmtTon(Number(r.tons) || 0)}</span>
          <span class="io-rec-sup">${esc(supplierName(r.supId))}</span>
          <span class="io-rec-note">${[r.createdAt ? fmtHM(r.createdAt) : '', r.order ? '单 ' + r.order : '', r.steel ? '提 ' + r.steel : '', r.note || ''].filter(Boolean).map(s => esc(s)).join(' · ')}</span>
        </div>`).join('')
      : '<div class="stock-empty">当日暂无流水记录</div>';
  }

  /* ---- 入库 / 出库登记弹窗 ---- */

  const modalMask = document.getElementById('modal-mask');
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
    modalMask.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    ioModal.hidden = true;
    document.body.classList.remove('drawer-open');
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

  // 工具栏：日期切换 / 录入 / 导出（箭头函数传参，避免事件对象误传）
  document.getElementById('io-date').addEventListener('change', renderIo);
  document.getElementById('io-add-in').addEventListener('click', () => openIoModal('in'));
  document.getElementById('io-add-out').addEventListener('click', () => openIoModal('out'));
  document.getElementById('io-close').addEventListener('click', closeIoModal);
  document.getElementById('io-cancel').addEventListener('click', closeIoModal);
  document.getElementById('io-export').addEventListener('click', () => exportIoCsv());

  modalMask.addEventListener('click', closeDetail);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!ioModal.hidden) closeIoModal();
  });

  // 导出每日盘点表（CSV 带 BOM，Excel 打开不乱码）：分品类汇总 + 剩余库存 + 当日流水
  function exportIoCsv() {
    const date = document.getElementById('io-date').value || todayStr();
    const recs = ioRecords.filter(r => r.date === date).sort((a, b) => a.createdAt - b.createdAt);

    const rows = [['仓储每日盘点表'], ['盘点日期', date], []];
    rows.push(['品类', '入库(吨)', '出库(吨)']);
    const byOre = {};
    let tIn = 0, tOut = 0;
    recs.forEach(r => {
      const o = (r.ore || '').trim() || '未分类';
      byOre[o] = byOre[o] || { in: 0, out: 0 };
      const v = Number(r.tons) || 0;
      if (r.type === 'in') { byOre[o].in += v; tIn += v; } else { byOre[o].out += v; tOut += v; }
    });
    Object.keys(byOre).forEach(o => rows.push([o, byOre[o].in || '', byOre[o].out || '']));
    if (Object.keys(byOre).length) rows.push(['合计', tIn || '', tOut || '']);

    rows.push([]);
    rows.push(['当前剩余库存（仓库 × 品类）']);
    rows.push(['仓库', '品类', '剩余库存(吨)']);
    suppliers.forEach(s => {
      const m = {};
      (s.stacks || []).forEach(t => {
        const o = (t.ore || '').trim();
        if (!o) return;
        const v = parseTon(t.tonnage);
        if (isFinite(v)) m[o] = (m[o] || 0) + v;
      });
      Object.keys(m).forEach(o => rows.push([s.name, o, m[o]]));
    });

    rows.push([]);
    rows.push(['当日流水明细']);
    rows.push(['仓库', '类型', '品类', '数量(吨)', '关联订单号', '提货钢厂', '备注']);
    recs.forEach(r => rows.push([
      supplierName(r.supId), r.type === 'in' ? '入库' : '出库',
      r.ore, Number(r.tons) || 0, r.order || '', r.steel || '', r.note || ''
    ]));

    const csv = '\uFEFF' + rows.map(row =>
      row.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `仓储盘点_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ==================== 渲染 & 跨页同步 ==================== */

  function renderAll() {
    renderIo();
  }

  // 其他子模块（库存管理 / 供应商列表 / 保税报关）修改数据后，本页自动同步刷新
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
