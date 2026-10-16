// ===== warehouse 模块脚本（仓储管理）=====
// 公共导航栏由 /common/fetch.js 加载；供应商数据存 localStorage，
// 后续接入后端时替换 load/save 实现即可
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理';

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
    intro: '河北港口集团旗下核心物流载体，运营河北省首家B型保税物流中心——武安保税物流中心，业务涵盖保税物流、铁路运输、钢材交易、再生钢铁、混矿加工、供应链金融、跨境电商、仓储交割八大板块。"河北陆港—天津等港口"铁水联运线路入选国家级典型案例，2024年完成联运量21.6万标箱，2021—2024年累计74.97万标箱，货源以武安地区钢厂原料等大宗货物为主。',
    facilities: '中心依托万利丰铁路专用线建设，设海关监管区、内贸物流区、综合服务区、行政商业区四大功能区，具备保税存储、出口退税、国际贸易与转口贸易等功能；铁水联运通道连通天津港、曹妃甸港、山东港口，提供集装箱短驳进站、装箱调偏、报关清关、预约提箱、跨境电商通关等配套服务。'
  };

  const NYYS_PROFILE = {
    address: '河北省邯郸市武安市南环东路1001号',
    contact: '李勇旺',
    phone: '0310-6287117',
    throughput: '300万吨级智慧物流园（规划）',
    area: '约146亩（仓储用地）',
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
      if (!raw) return seed();
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.list)) return seed();
      return migrate(data.list);
    } catch (e) {
      return seed();
    }
  }

  // 旧版示例指标值（migrate 时视为占位，需替换为真实资料）
  const LEGACY_CAPS = ['500万吨/年', '静态仓容60万吨', '约1500亩'];

  // 数据迁移：为已有记录按公司名补充公开资料（不覆盖用户已填写的内容）
  function migrate(list) {
    let changed = false;
    list.forEach(s => {
      const p = PUBLIC_PROFILES[s.name];
      if (!p) return;
      Object.keys(p).forEach(k => {
        if (k === 'intro') {
          if (!s.intro || s.intro === LEGACY_HBLG_INTRO) { s.intro = p.intro; changed = true; }
        } else if (!s[k] || LEGACY_CAPS.includes(s[k])) { s[k] = p[k]; changed = true; }
      });
    });
    if (changed) save(list);
    return list;
  }

  // 首次使用写入初始数据
  function seed() {
    save(SEED_SUPPLIERS);
    return SEED_SUPPLIERS.slice();
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

  // KPI：总数 + 前三种类型分布（剩余并入"其他"）
  function renderKpi() {
    const grid = document.getElementById('kpi-grid');
    const total = suppliers.length;
    const byType = {};
    suppliers.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });

    const mainTypes = ['保税物流', '中转仓储', '普通仓储'];
    const cards = [
      { label: '供应商总数', value: total, cls: 'blue' },
      ...mainTypes.map(t => ({ label: t, value: byType[t] || 0, cls: '' }))
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

  // 供应商卡片网格（按搜索词过滤）
  function renderList() {
    const grid = document.getElementById('supplier-grid');
    const kw = (document.getElementById('supplier-search').value || '').trim().toLowerCase();

    const list = kw
      ? suppliers.filter(s =>
          [s.name, s.contact, s.address].some(v => (v || '').toLowerCase().includes(kw)))
      : suppliers.slice().sort((a, b) => b.createdAt - a.createdAt);

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">${kw ? '未找到匹配的供应商' : '暂无供应商，点击右上角「新增供应商」添加'}</div>`;
      return;
    }

    grid.innerHTML = list.map(s => `
      <div class="supplier-card" data-id="${esc(s.id)}" title="点击查看详情">
        <div class="s-head">
          <div class="s-name">${esc(s.name)}</div>
          <span class="type-badge ${TYPES[s.type] || 'normal'}">${esc(s.type)}</span>
        </div>
        <div class="s-info">
          <div class="s-row"><span class="s-label">联系人</span><span class="s-value ${s.contact ? '' : 'empty'}">${esc(s.contact) || '—'}</span></div>
          <div class="s-row"><span class="s-label">联系电话</span><span class="s-value ${s.phone ? '' : 'empty'}">${esc(s.phone) || '—'}</span></div>
          <div class="s-row"><span class="s-label">地址</span><span class="s-value ${s.address ? '' : 'empty'}">${esc(s.address) || '—'}</span></div>
        </div>
        <div class="s-foot">
          <span>录入时间 ${fmtTime(s.createdAt)}</span>
          <span class="s-more">查看详情 →</span>
        </div>
      </div>
    `).join('');
  }

  function renderAll() {
    renderKpi();
    renderList();
  }

  /* ==================== 新增 / 编辑供应商抽屉 ==================== */

  const mask = document.getElementById('drawer-mask');
  const drawer = document.getElementById('add-drawer');
  const form = document.getElementById('supplier-form');
  const nameInput = document.getElementById('f-name');
  const drawerTitle = document.getElementById('drawer-title');
  const submitBtn = document.getElementById('btn-submit');
  const nameErr = document.createElement('div');
  nameErr.className = 'form-err';
  nameErr.textContent = '请输入供应商名称，且不能与已有供应商重复';
  nameInput.parentElement.appendChild(nameErr);

  // 当前编辑的供应商 id（null = 新增模式）
  let editingId = null;

  function openDrawer(supplier) {
    closeDetail();
    editingId = supplier ? supplier.id : null;
    drawerTitle.textContent = supplier ? '编辑供应商' : '新增供应商';
    submitBtn.textContent = supplier ? '保存修改' : '保存供应商';
    mask.hidden = false;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');
    form.reset();

    // 编辑模式：预填当前值
    if (supplier) {
      nameInput.value = supplier.name || '';
      document.getElementById('f-type').value = TYPES[supplier.type] ? supplier.type : '保税物流';
      document.getElementById('f-contact').value = supplier.contact || '';
      document.getElementById('f-phone').value = supplier.phone || '';
      document.getElementById('f-address').value = supplier.address || '';
      document.getElementById('f-throughput').value = supplier.throughput || '';
      document.getElementById('f-storage').value = supplier.storage || '';
      document.getElementById('f-area').value = supplier.area || '';
      document.getElementById('f-facilities').value = supplier.facilities || '';
      document.getElementById('f-intro').value = supplier.intro || '';
      document.getElementById('f-remark').value = supplier.remark || '';
    }

    nameInput.focus();
  }

  function closeDrawer() {
    editingId = null;
    mask.hidden = true;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  document.getElementById('open-add').addEventListener('click', openDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel').addEventListener('click', closeDrawer);
  mask.addEventListener('click', () => { closeDetail(); closeDrawer(); });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const dup = suppliers.some(s => s.name === name && s.id !== editingId);
    if (!name || dup) {
      nameInput.classList.add('error');
      nameErr.classList.add('show');
      nameInput.focus();
      return;
    }
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');

    const data = {
      name,
      type: document.getElementById('f-type').value,
      contact: document.getElementById('f-contact').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      address: document.getElementById('f-address').value.trim(),
      throughput: document.getElementById('f-throughput').value.trim(),
      storage: document.getElementById('f-storage').value.trim(),
      area: document.getElementById('f-area').value.trim(),
      intro: document.getElementById('f-intro').value.trim(),
      facilities: document.getElementById('f-facilities').value.trim(),
      remark: document.getElementById('f-remark').value.trim()
    };

    if (editingId) {
      // 编辑模式：更新已有记录（保留 id 与录入时间）
      const target = suppliers.find(s => s.id === editingId);
      if (target) Object.assign(target, data);
    } else {
      suppliers.push({ id: genId(), ...data, createdAt: Date.now() });
    }

    save(suppliers);
    renderAll();
    closeDrawer();
  });

  /* ==================== 供应商详情弹窗 ==================== */

  const modalMask = document.getElementById('modal-mask');
  const detailModal = document.getElementById('detail-modal');
  const detailBody = document.getElementById('detail-body');

  function openDetail(id) {
    const s = suppliers.find(x => x.id === id);
    if (!s) return;

    closeDrawer();
    modalMask.hidden = false;
    detailModal.hidden = false;
    document.body.classList.add('drawer-open');

    const row = (label, value) => `
      <div class="s-row detail-row"><span class="s-label">${esc(label)}</span><span class="s-value ${value ? '' : 'empty'}">${esc(value) || '—'}</span></div>`;

    detailBody.innerHTML = `
      <div class="d-head">
        <div class="s-name">${esc(s.name)}</div>
        <span class="type-badge ${TYPES[s.type] || 'normal'}">${esc(s.type)}</span>
      </div>

      <div class="d-label">经营指标</div>
      <div class="cap-grid">
        <div class="cap-item"><div class="cap-value ${s.throughput ? '' : 'empty'}">${esc(s.throughput) || '—'}</div><div class="cap-label">年吞吐量</div></div>
        <div class="cap-item"><div class="cap-value ${s.storage ? '' : 'empty'}">${esc(s.storage) || '—'}</div><div class="cap-label">仓储能力</div></div>
        <div class="cap-item"><div class="cap-value ${s.area ? '' : 'empty'}">${esc(s.area) || '—'}</div><div class="cap-label">占地面积</div></div>
      </div>

      <div class="d-label">基础信息</div>
      <div class="d-section">
        ${row('联系人', s.contact)}
        ${row('联系电话', s.phone)}
        ${row('地址', s.address)}
        ${row('录入时间', fmtTime(s.createdAt))}
      </div>

      ${s.facilities ? `<div class="d-block"><div class="d-label">仓储设施与服务</div><div class="d-intro">${esc(s.facilities)}</div></div>` : ''}

      <div class="d-block">
        <div class="d-label">公司简介</div>
        <div class="d-intro ${s.intro ? '' : 'empty'}">${esc(s.intro) || '暂无简介'}</div>
      </div>
      ${s.remark ? `<div class="d-block"><div class="d-label">备注</div><div class="d-intro">${esc(s.remark)}</div></div>` : ''}

      <div class="drawer-footer d-footer">
        <button type="button" class="btn-ghost" id="detail-del">删除供应商</button>
        <button type="button" class="btn-primary" id="detail-edit">编辑供应商</button>
      </div>
    `;

    document.getElementById('detail-edit').addEventListener('click', () => {
      closeDetail();
      openDrawer(s);
    });

    document.getElementById('detail-del').addEventListener('click', () => {
      if (window.confirm('确定删除供应商「' + s.name + '」吗？')) {
        suppliers = suppliers.filter(x => x.id !== s.id);
        save(suppliers);
        renderAll();
        closeDetail();
      }
    });
  }

  function closeDetail() {
    detailModal.hidden = true;
    modalMask.hidden = true;
    if (drawer.hidden) document.body.classList.remove('drawer-open');
  }

  document.getElementById('detail-close').addEventListener('click', closeDetail);
  modalMask.addEventListener('click', closeDetail);

  /* ==================== 删除与搜索 ==================== */

  document.getElementById('supplier-grid').addEventListener('click', e => {
    // 卡片点击：打开详情弹窗
    const card = e.target.closest('.supplier-card');
    if (card) openDetail(card.dataset.id);
  });

  document.getElementById('supplier-search').addEventListener('input', renderList);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!detailModal.hidden) closeDetail();
    else if (!drawer.hidden) closeDrawer();
  });

  /* ==================== 初始化 ==================== */

  renderAll();
})();
