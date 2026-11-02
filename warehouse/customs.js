// ===== warehouse / customs 模块脚本（保税报关节点子模块）=====
// 公共导航栏由 /common/fetch.js 加载；报关台账存 localStorage，
// 后续接入后端时替换 load/save 实现即可
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 保税报关';

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

  /* ==================== 出入库流水（只读：报关出库核销） ==================== */

  const IO_KEY = 'hz_warehouse_io_v1';

  function loadIo() {
    try {
      const raw = localStorage.getItem(IO_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.list)) return data.list;
    } catch (e) { /* 存储不可用时忽略 */ }
    return [];
  }

  let ioRecords = loadIo();

  /* ==================== 保税报关节点（保税物流仓库专用） ==================== */

  const CD_KEY = 'hz_warehouse_customs_v1';
  const CD_THRESHOLD = 20000; // 单品类完成报关门槛（2万吨）

  function loadCd() {
    try {
      const raw = localStorage.getItem(CD_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.list)) return data.list;
    } catch (e) { /* 忽略 */ }
    return [];
  }

  function saveCd(list) {
    try { localStorage.setItem(CD_KEY, JSON.stringify({ list })); } catch (e) { /* 忽略 */ }
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

  // 报关流水：报关登记 + 该仓库出库（视为报关出库），最近 30 条
  function cdFlow(sup) {
    const recs = [];
    cdRecords.forEach(r => {
      if (r.supId !== sup.id) return;
      recs.push({ ts: r.createdAt, type: 'cd', ore: r.ore, tons: Number(r.tons) || 0, note: r.note, date: r.date });
    });
    ioRecords.forEach(r => {
      if (r.supId !== sup.id || r.type !== 'out') return;
      recs.push({ ts: r.createdAt, type: 'out', ore: r.ore, tons: Number(r.tons) || 0, note: r.note, date: r.date, steel: r.steel || '' });
    });
    return recs.sort((a, b) => b.ts - a.ts).slice(0, 30);
  }

  function renderCustoms() {
    const body = document.getElementById('customs-body');
    if (!body) return;
    const bonded = suppliers.filter(s => s.type === '保税物流');
    if (!bonded.length) {
      body.innerHTML = '<div class="empty-state">暂无保税物流仓库，报关节点用于保税货物分品类报关台账</div>';
      return;
    }
    body.innerHTML = bonded.map(s => {
      const rows = cdSummary(s);
      const sum = k => rows.reduce((a, r) => a + r[k], 0);
      const trs = rows.length ? rows.map(r => {
        const pct = Math.min(100, Math.round(r.undeclared / CD_THRESHOLD * 100));
        const badge = r.undeclared >= CD_THRESHOLD
          ? '<span class="cd-badge ok">可完成报关</span>'
          : r.undeclared > 0
            ? `<span class="cd-badge warn">未达门槛 · 差 ${fmtTon(CD_THRESHOLD - r.undeclared)}</span>`
            : r.avail > 0
              ? `<span class="cd-badge done">已报关待出库 ${fmtTon(r.avail)}</span>`
              : '<span class="cd-badge">已出清</span>';
        return `
        <tr>
          <td class="st-name">${esc(r.ore)}</td>
          <td class="num">${fmtTon(r.stock)}</td>
          <td class="num ok">${r.declared ? fmtTon(r.declared) : '—'}</td>
          <td class="num">${r.exported ? fmtTon(r.exported) : '—'}</td>
          <td class="num ok">${r.avail ? fmtTon(r.avail) : '—'}</td>
          <td class="cd-status">
            <div class="cd-progress-wrap"><div class="cd-progress${pct >= 100 ? ' full' : ''}"><i style="width:${pct}%"></i></div><span class="cd-progress-txt">${fmtTon(r.undeclared)} / ${fmtTon(CD_THRESHOLD)}</span></div>
            ${badge}
          </td>
          <td><button type="button" class="io-btn ghost cd-row-add" data-id="${esc(s.id)}" data-ore="${esc(r.ore)}">登记</button></td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="io-empty">该仓库暂无垛位库存</td></tr>';

      // 报关流水：报关登记（报）+ 保税出库（出，自动核销已报关量）
      const flow = cdFlow(s);
      const flowHtml = flow.length
        ? flow.map(f => `
          <div class="io-rec">
            <span class="io-rec-type ${f.type}">${f.type === 'cd' ? '报' : '出'}</span>
            <span class="io-rec-ore">${esc(f.ore)}</span>
            <span class="io-rec-ton">${f.type === 'cd' ? '+' : '-'}${fmtTon(f.tons)}</span>
            <span class="io-rec-sup">${esc(f.date)} · ${f.type === 'cd' ? '报关登记' : '报关出库'}</span>
            <span class="io-rec-note">${[f.steel ? '提 ' + f.steel : '', f.note || ''].filter(Boolean).map(s => esc(s)).join(' · ')}</span>
          </div>`).join('')
        : '<div class="io-empty">暂无报关流水，登记报关或报关出库后自动生成</div>';

      return `
      <div class="cd-warehouse">
        <div class="cd-wh-head">
          <span class="cd-wh-name">${esc(s.name)}</span>
          <span class="cd-wh-kpis">
            <span>在库 <b>${fmtTon(sum('stock'))}</b></span>
            <span>已报关 <b class="ok">${fmtTon(sum('declared'))}</b></span>
            <span>可出库 <b class="ok">${fmtTon(sum('avail'))}</b></span>
            <span>未报关 <b class="warn">${fmtTon(sum('undeclared'))}</b></span>
          </span>
          <button type="button" class="io-btn in cd-add" data-id="${esc(s.id)}">＋ 报关登记</button>
        </div>
        <table class="stack-table cd-table">
          <thead><tr><th>品类</th><th>在库量</th><th>已报关</th><th>报关出库</th><th>可出库</th><th>未报关 / 2万吨门槛</th><th>操作</th></tr></thead>
          <tbody>${trs}</tbody>
        </table>
        <div class="io-sub-title">报关流水（登记 / 报关出库）</div>
        <div class="io-records">${flowHtml}</div>
      </div>`;
    }).join('');
  }

  /* ---- 报关登记弹窗 ---- */

  const modalMask = document.getElementById('modal-mask');
  const cdModal = document.getElementById('cd-modal');
  const cdForm = document.getElementById('cd-form');
  let cdSupId = null;

  function openCdModal(supId, ore) {
    closeDetail();
    cdSupId = supId;
    const sup = suppliers.find(x => x.id === supId);
    const ores = [];
    if (sup) {
      (sup.stacks || []).forEach(t => {
        const o = (t.ore || '').trim();
        if (o && !ores.includes(o)) ores.push(o);
      });
      cdRecords.forEach(r => {
        if (r.supId !== sup.id) return;
        const o = (r.ore || '').trim();
        if (o && !ores.includes(o)) ores.push(o);
      });
    }
    document.getElementById('cd-ore').innerHTML =
      ores.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    cdForm.reset();
    if (ore && ores.includes(ore)) document.getElementById('cd-ore').value = ore;
    document.getElementById('cd-date').value = todayStr();
    modalMask.hidden = false;
    cdModal.hidden = false;
    document.body.classList.add('drawer-open');
    updateCdHint();
  }

  function closeCdModal() {
    cdModal.hidden = true;
    modalMask.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    cdModal.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function cdUndeclared(sup, ore) {
    const row = cdSummary(sup).find(r => r.ore === ore);
    return row ? row.undeclared : 0;
  }

  function updateCdHint() {
    const sup = suppliers.find(x => x.id === cdSupId);
    const ore = document.getElementById('cd-ore').value;
    const hint = document.getElementById('cd-hint');
    if (!sup || !ore) { hint.textContent = ''; return; }
    const u = cdUndeclared(sup, ore);
    const t = Number(document.getElementById('cd-ton').value);
    const after = Math.max(0, u - (isFinite(t) ? t : 0));
    hint.textContent = `「${ore}」未报关 ${fmtTon(u)}${u >= CD_THRESHOLD ? '，已达 2万吨门槛' : `，未达 2万吨门槛（还差 ${fmtTon(CD_THRESHOLD - u)}）`}，本次登记后剩余未报关 ${fmtTon(after)}`;
  }

  cdForm.addEventListener('submit', e => {
    e.preventDefault();
    const sup = suppliers.find(x => x.id === cdSupId);
    const ore = document.getElementById('cd-ore').value.trim();
    const tons = Number(document.getElementById('cd-ton').value);
    const date = document.getElementById('cd-date').value || todayStr();
    const note = document.getElementById('cd-note').value.trim();

    if (!sup) return;
    if (!ore) { document.getElementById('cd-ore').focus(); return; }
    if (!isFinite(tons) || tons <= 0) { document.getElementById('cd-ton').focus(); return; }
    const u = cdUndeclared(sup, ore);
    if (tons > u) {
      alert(`报关失败：「${ore}」未报关量仅 ${fmtTon(u)}，不能登记 ${fmtTon(tons)}`);
      return;
    }
    cdRecords.push({
      id: genId(), supId: sup.id, ore, tons: Math.round(tons * 10) / 10,
      date, note, createdAt: Date.now()
    });
    saveCd(cdRecords);
    renderAll();
    closeCdModal();
  });

  ['cd-ore', 'cd-ton'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCdHint);
    document.getElementById(id).addEventListener('change', updateCdHint);
  });

  document.getElementById('customs-body').addEventListener('click', e => {
    const row = e.target.closest('.cd-row-add');
    if (row) { openCdModal(row.getAttribute('data-id'), row.getAttribute('data-ore')); return; }
    const add = e.target.closest('.cd-add');
    if (add) openCdModal(add.getAttribute('data-id'));
  });

  document.getElementById('cd-close').addEventListener('click', closeCdModal);
  document.getElementById('cd-cancel').addEventListener('click', closeCdModal);

  modalMask.addEventListener('click', closeDetail);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!cdModal.hidden) closeCdModal();
  });

  /* ==================== 渲染 & 跨页同步 ==================== */

  function renderAll() {
    renderCustoms();
  }

  // 其他子模块（库存管理 / 进销存台账 / 供应商列表）修改数据后，本页自动同步刷新
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
