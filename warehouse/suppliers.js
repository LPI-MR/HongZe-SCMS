// ===== suppliers 模块脚本（仓储管理 · 供应商列表子模块）=====
// 供应商基础资料与矿石分垛明细的维护入口；数据持久化到 PostgreSQL：
// 读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/warehouses 全量替换
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '仓储管理 / 供应商列表';

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

  /* ==================== 数据层（与 warehouse.js 保持一致） ==================== */

  // 仓库主数据（供应商）：boot 时经 HZDB.ready() 从数据库装载

  // 合作类型定义（key → 徽标样式类）
  const TYPES = {
    '保税物流': 'bonded',
    '中转仓储': 'transit',
    '普通仓储': 'normal',
    '运输接驳': 'shuttle'
  };

  let suppliers = [];

  // 保存：全量写回数据库（PUT /api/warehouses）；失败由 HZDB toast 提示，页面内存保留可重试
  function save(list) {
    return HZDB.put('warehouses', list);
  }

  function genId() {
    return 'sup-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

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
    if (!grid) return;
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
    if (!grid) return;
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
          <div class="s-row"><span class="s-label">仓库规模</span><span class="s-value ${s.scale ? '' : 'empty'}">${esc(s.scale) || '—'}</span></div>
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

  /* ---- 分垛明细编辑（垛别 / 存放品类 / 库存量）---- */

  function stackRowHtml(t) {
    t = t || {};
    return `<div class="stack-row">
      <input type="text" class="form-input st-name" placeholder="垛别，如 1号垛" maxlength="12" value="${esc(t.name || '')}" />
      <input type="text" class="form-input st-ore" placeholder="品类，如 PB粉" maxlength="20" value="${esc(t.ore || '')}" />
      <input type="text" class="form-input st-ton" placeholder="库存量，如 2.5万吨" maxlength="16" value="${esc(t.tonnage || '')}" />
      <button type="button" class="st-del" title="删除该垛位">✕</button>
    </div>`;
  }

  function renderStackRows(stacks) {
    document.getElementById('stack-rows').innerHTML = (stacks || []).map(stackRowHtml).join('');
  }

  document.getElementById('btn-add-stack').addEventListener('click', () => {
    document.getElementById('stack-rows').insertAdjacentHTML('beforeend', stackRowHtml());
  });

  document.getElementById('stack-rows').addEventListener('click', e => {
    const btn = e.target.closest('.st-del');
    if (btn) btn.closest('.stack-row').remove();
  });

  // 从编辑行收集垛位数据（三列均为空的行丢弃）
  function collectStacks() {
    return Array.from(document.querySelectorAll('#stack-rows .stack-row')).map(row => ({
      name: row.querySelector('.st-name').value.trim(),
      ore: row.querySelector('.st-ore').value.trim(),
      tonnage: row.querySelector('.st-ton').value.trim(),
      note: ''
    })).filter(t => t.name || t.ore || t.tonnage);
  }

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
      document.getElementById('f-scale').value = supplier.scale || '';
      document.getElementById('f-area').value = supplier.area || '';
      document.getElementById('f-facilities').value = supplier.facilities || '';
      document.getElementById('f-intro').value = supplier.intro || '';
      document.getElementById('f-remark').value = supplier.remark || '';
      renderStackRows(supplier.stacks || []);
    } else {
      renderStackRows([]);
    }

    nameInput.focus();
  }

  function closeDrawer() {
    editingId = null;
    mask.hidden = true;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  // 注意不能直接传 openDrawer：addEventListener 会把事件对象作为首参传入，
  // 导致 openDrawer(event) 误入编辑模式分支
  document.getElementById('open-add').addEventListener('click', () => openDrawer());
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel').addEventListener('click', closeDrawer);
  mask.addEventListener('click', () => { closeDetail(); closeDrawer(); });

  form.addEventListener('submit', async e => {
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
      scale: document.getElementById('f-scale').value.trim(),
      area: document.getElementById('f-area').value.trim(),
      intro: document.getElementById('f-intro').value.trim(),
      facilities: document.getElementById('f-facilities').value.trim(),
      remark: document.getElementById('f-remark').value.trim(),
      stacks: collectStacks()
    };

    if (editingId) {
      // 编辑模式：更新已有记录（保留 id 与录入时间）
      const target = suppliers.find(s => s.id === editingId);
      if (target) Object.assign(target, data);
    } else {
      suppliers.push({ id: genId(), ...data, createdAt: Date.now() });
    }

    if (!await save(suppliers)) return;   // 保存失败：内存保留现场，抽屉不关可重试
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
        <div class="cap-item"><div class="cap-value ${s.scale ? '' : 'empty'}">${esc(s.scale) || '—'}</div><div class="cap-label">仓库规模</div></div>
        <div class="cap-item"><div class="cap-value ${s.area ? '' : 'empty'}">${esc(s.area) || '—'}</div><div class="cap-label">占地面积</div></div>
      </div>

      <div class="d-label">基础信息</div>
      <div class="d-section">
        ${row('联系人', s.contact)}
        ${row('联系电话', s.phone)}
        ${row('地址', s.address)}
        ${row('录入时间', fmtTime(s.createdAt))}
      </div>

      ${Array.isArray(s.stacks) && s.stacks.length ? `
      <div class="d-block">
        <div class="d-label">矿石分垛明细</div>
        <table class="stack-table">
          <thead><tr><th>垛别</th><th>存放品类</th><th>库存量</th><th>备注</th></tr></thead>
          <tbody>
            ${s.stacks.map(t => `
              <tr>
                <td class="st-name">${esc(t.name)}</td>
                <td>${esc(t.ore)}</td>
                <td>${esc(t.tonnage)}</td>
                <td class="${t.note ? '' : 'empty'}">${esc(t.note) || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

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

    document.getElementById('detail-del').addEventListener('click', async () => {
      if (window.confirm('确定删除供应商「' + s.name + '」吗？')) {
        const prev = suppliers.slice();
        suppliers = suppliers.filter(x => x.id !== s.id);
        if (!await save(suppliers)) {
          suppliers = prev;   // 保存失败回滚，详情弹窗保留可重试
          return;
        }
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

  /* ==================== 详情入口与搜索 ==================== */

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

  async function boot() {
    await HZDB.ready();
    suppliers = HZDB.get('warehouses') || [];
    renderAll();

    // 支持库存管理页「调整库存」跳转：/warehouse/suppliers.html?edit=<id>
    // 自动打开该供应商的编辑抽屉（分垛明细在此维护）
    const editParam = location.search.match(/[?&]edit=([^&]+)/);
    if (editParam) {
      const s = suppliers.find(x => x.id === decodeURIComponent(editParam[1]));
      if (s) openDrawer(s);
    }
  }

  boot();
})();
