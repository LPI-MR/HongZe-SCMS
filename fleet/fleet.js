/* ============================================================
   汽运车队模块 · 车队档案与运力信息维护
   布局与仓储管理模块保持一致（KPI 卡 / 卡片列表 / 详情弹窗 / 编辑抽屉）
   数据持久化到 PostgreSQL：读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/fleets 全量替换
   ============================================================ */
(function () {
  'use strict';

  var FLEET_TYPES = {
    '自营车队': 'own',
    '合作车队': 'partner',
    '外协车队': 'outsource'
  };

  /* ==================== 数据层 ==================== */

  // 读取：boot 完成后从 HZDB 缓存同步取（未装载时为空数组兜底）
  function load() {
    var list = HZDB.get('fleets');
    if (!Array.isArray(list)) list = [];
    return normalize(list);
  }

  // 保存：全量写回数据库（PUT /api/fleets）；失败由 HZDB toast 提示，页面内存保留可重试
  function save(list) {
    return HZDB.put('fleets', list);
  }

  // 记录字段兜底（兼容早期版本数据；纯内存修正，不触发保存）
  function normalize(list) {
    list.forEach(function (s) {
      if (!FLEET_TYPES[s.type]) s.type = '合作车队';
      ['contact', 'phone', 'address', 'capacity', 'fleetSize', 'minGuarantee', 'maxCapacity', 'remark'].forEach(function (k) {
        if (typeof s[k] !== 'string') s[k] = '';
      });
      if (!s.id) s.id = genId();
      if (!s.createdAt) s.createdAt = Date.now();
    });
    return list;
  }

  function genId() {
    return 'fleet-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ==================== 渲染 ==================== */

  var suppliers = [];   // boot 时从 HZDB 缓存装载
  var grid = document.getElementById('supplier-grid');
  var searchInput = document.getElementById('supplier-search');

  // KPI 总览：车队总数 + 类型分布（与仓储管理一致的四卡布局）
  function renderKpi() {
    var kpiGrid = document.getElementById('kpi-grid');
    var total = suppliers.length;
    var byType = {};
    suppliers.forEach(function (s) { byType[s.type] = (byType[s.type] || 0) + 1; });

    var mainTypes = ['自营车队', '合作车队', '外协车队'];
    var cards = [{ label: '车队总数', value: total, cls: 'blue' }]
      .concat(mainTypes.map(function (t) { return { label: t, value: byType[t] || 0, cls: '' }; }));

    kpiGrid.innerHTML = cards.map(function (c) {
      return '<div class="kpi-card ' + c.cls + '">' +
        '<div class="kpi-info">' +
          '<div class="kpi-label">' + esc(c.label) + '</div>' +
          '<div class="kpi-value">' + c.value + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // 车队卡片网格（按搜索词过滤，最新录入在前）
  function renderList() {
    var kw = (searchInput.value || '').trim().toLowerCase();

    var list = kw
      ? suppliers.filter(function (s) {
          return [s.name, s.contact, s.address].some(function (v) {
            return (v || '').toLowerCase().indexOf(kw) !== -1;
          });
        })
      : suppliers.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">' + (kw ? '未找到匹配的车队' : '暂无车队，点击右上角「新增车队」添加') + '</div>';
      return;
    }

    grid.innerHTML = list.map(function (s) {
      return '<div class="supplier-card" data-id="' + esc(s.id) + '" title="点击查看详情">' +
        '<div class="s-head">' +
          '<div class="s-name">' + esc(s.name) + '</div>' +
          '<span class="type-badge ' + (FLEET_TYPES[s.type] || 'partner') + '">' + esc(s.type) + '</span>' +
        '</div>' +
        '<div class="s-info">' +
          '<div class="s-row"><span class="s-label">联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
          '<div class="s-row"><span class="s-label">联系电话</span><span class="s-value ' + (s.phone ? '' : 'empty') + '">' + (esc(s.phone) || '—') + '</span></div>' +
          '<div class="s-row"><span class="s-label">地址</span><span class="s-value ' + (s.address ? '' : 'empty') + '">' + (esc(s.address) || '—') + '</span></div>' +
        '</div>' +
        '<div class="s-foot">' +
          '<span>录入时间 ' + fmtTime(s.createdAt) + '</span>' +
          '<span class="s-more">查看详情 →</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderAll() { renderKpi(); renderList(); }

  /* ==================== 新增 / 编辑车队抽屉 ==================== */

  var mask = document.getElementById('drawer-mask');
  var drawer = document.getElementById('add-drawer');
  var form = document.getElementById('supplier-form');
  var nameInput = document.getElementById('f-name');
  var drawerTitle = document.getElementById('drawer-title');
  var submitBtn = document.getElementById('btn-submit');
  var nameErr = document.createElement('div');
  nameErr.className = 'form-err';
  nameErr.textContent = '请输入车队名称，且不能与已有车队重复';
  nameInput.parentElement.appendChild(nameErr);

  // 当前编辑的车队 id（null = 新增模式）
  var editingId = null;

  function openDrawer(fleet) {
    closeDetail();
    editingId = fleet ? fleet.id : null;
    drawerTitle.textContent = fleet ? '编辑车队' : '新增车队';
    submitBtn.textContent = fleet ? '保存修改' : '保存车队';
    mask.hidden = false;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');
    form.reset();

    if (fleet) {
      nameInput.value = fleet.name || '';
      document.getElementById('f-type').value = FLEET_TYPES[fleet.type] ? fleet.type : '合作车队';
      document.getElementById('f-contact').value = fleet.contact || '';
      document.getElementById('f-phone').value = fleet.phone || '';
      document.getElementById('f-address').value = fleet.address || '';
      document.getElementById('f-capacity').value = fleet.capacity || '';
      document.getElementById('f-fleet-size').value = fleet.fleetSize || '';
      document.getElementById('f-min-guarantee').value = fleet.minGuarantee || '';
      document.getElementById('f-max-capacity').value = fleet.maxCapacity || '';
      document.getElementById('f-remark').value = fleet.remark || '';
    }

    nameInput.focus();
  }

  function closeDrawer() {
    editingId = null;
    mask.hidden = true;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  document.getElementById('open-add').addEventListener('click', function () { openDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel').addEventListener('click', closeDrawer);
  mask.addEventListener('click', function () { closeDetail(); closeDrawer(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = nameInput.value.trim();
    var dup = suppliers.some(function (s) { return s.name === name && s.id !== editingId; });
    if (!name || dup) {
      nameInput.classList.add('error');
      nameErr.classList.add('show');
      nameInput.focus();
      return;
    }
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');

    var data = {
      name: name,
      type: document.getElementById('f-type').value,
      contact: document.getElementById('f-contact').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      address: document.getElementById('f-address').value.trim(),
      capacity: document.getElementById('f-capacity').value.trim(),
      fleetSize: document.getElementById('f-fleet-size').value.trim(),
      minGuarantee: document.getElementById('f-min-guarantee').value.trim(),
      maxCapacity: document.getElementById('f-max-capacity').value.trim(),
      remark: document.getElementById('f-remark').value.trim()
    };

    if (editingId) {
      // 编辑模式：更新已有记录（保留 id 与录入时间）
      var target = suppliers.find(function (s) { return s.id === editingId; });
      if (target) Object.assign(target, data);
    } else {
      suppliers.push(Object.assign({ id: genId(), createdAt: Date.now() }, data));
    }

    save(suppliers);
    renderAll();
    closeDrawer();
  });

  /* ==================== 车队详情弹窗 ==================== */

  var modalMask = document.getElementById('modal-mask');
  var modal = document.getElementById('detail-modal');
  var modalBody = document.getElementById('detail-body');

  function openDetail(s) {
    closeDrawer();
    modalBody.innerHTML =
      '<div class="d-head">' +
        '<div class="s-name">' + esc(s.name) + '</div>' +
        '<span class="type-badge ' + (FLEET_TYPES[s.type] || 'partner') + '">' + esc(s.type) + '</span>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">运力信息</div>' +
        '<div class="cap-grid">' +
          '<div class="cap-item"><div class="cap-value ' + (s.capacity ? '' : 'empty') + '">' + (esc(s.capacity) || '—') + '</div><div class="cap-label">运输能力</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.fleetSize ? '' : 'empty') + '">' + (esc(s.fleetSize) || '—') + '</div><div class="cap-label">自有车队数量</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.minGuarantee ? '' : 'empty') + '">' + (esc(s.minGuarantee) || '—') + '</div><div class="cap-label">最低运输保障</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.maxCapacity ? '' : 'empty') + '">' + (esc(s.maxCapacity) || '—') + '</div><div class="cap-label">最大运输能力</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">基础信息</div>' +
        '<div class="d-section">' +
          '<div class="s-row detail-row"><span class="s-label">联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">联系电话</span><span class="s-value ' + (s.phone ? '' : 'empty') + '">' + (esc(s.phone) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">地址</span><span class="s-value ' + (s.address ? '' : 'empty') + '">' + (esc(s.address) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">录入时间</span><span class="s-value">' + fmtTime(s.createdAt) + '</span></div>' +
        '</div>' +
      '</div>' +

      (s.remark ? '<div class="d-block"><div class="d-label">备注</div><div class="d-intro">' + esc(s.remark) + '</div></div>' : '') +

      '<div class="drawer-footer d-footer">' +
        '<button type="button" class="btn-ghost" id="detail-del">删除车队</button>' +
        '<button type="button" class="btn-primary" id="detail-edit">编辑车队</button>' +
      '</div>';

    document.getElementById('detail-edit').addEventListener('click', function () {
      closeDetail();
      openDrawer(s);
    });

    document.getElementById('detail-del').addEventListener('click', function () {
      if (window.confirm('确定删除车队「' + s.name + '」吗？')) {
        suppliers = suppliers.filter(function (x) { return x.id !== s.id; });
        save(suppliers);
        renderAll();
        closeDetail();
      }
    });

    modalMask.hidden = false;
    modal.hidden = false;
    document.body.classList.add('drawer-open');
  }

  function closeDetail() {
    modalMask.hidden = true;
    modal.hidden = true;
    // 仅当新增/编辑抽屉也处于关闭状态时才移除遮罩锁
    if (drawer.hidden) document.body.classList.remove('drawer-open');
  }

  document.getElementById('detail-close').addEventListener('click', closeDetail);

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.supplier-card');
    if (!card) return;
    var s = suppliers.find(function (x) { return x.id === card.getAttribute('data-id'); });
    if (s) openDetail(s);
  });

  // Esc：优先关闭详情弹窗，再关闭抽屉
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) { closeDetail(); return; }
    if (!drawer.hidden) closeDrawer();
  });

  /* ==================== 搜索 ==================== */

  searchInput.addEventListener('input', renderList);

  // ===== 启动：装载数据库缓存后渲染 =====
  async function boot() {
    await HZDB.ready();   // 启动遮罩 + /api/bootstrap 全量装载（失败可点重试）
    suppliers = load();
    renderAll();
  }
  boot();
})();
