/* ============================================================
   钢厂管理模块 · 邯郸/武安地区钢厂档案维护
   布局与仓储管理/汽运车队保持一致（KPI 卡 / 卡片列表 / 详情弹窗 / 编辑抽屉）
   数据持久化到 PostgreSQL：读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/steels 全量替换
   ============================================================ */
(function () {
  'use strict';

  var STEEL_TYPES = {
    '长期合作': 'core',
    '稳定合作': 'stable',
    '潜在合作': 'potential'
  };

  /* ==================== 数据层 ==================== */

  // 读取：boot 完成后从 HZDB 缓存同步取（未装载时为空数组兜底）
  function load() {
    var list = HZDB.get('steels');
    if (!Array.isArray(list)) list = [];
    return normalize(list);
  }

  // 保存：全量写回数据库（PUT /api/steels）；失败由 HZDB toast 提示，页面内存保留可重试
  function save(list) {
    return HZDB.put('steels', list);
  }

  // 记录字段兜底（兼容早期版本数据；纯内存修正，不触发保存）
  function normalize(list) {
    list.forEach(function (s) {
      if (!STEEL_TYPES[s.type]) s.type = '稳定合作';
      ['contact', 'phone', 'address', 'capacity', 'oreDemand', 'nature', 'founded', 'regTime', 'regCapital', 'regAddress', 'products', 'intro', 'remark'].forEach(function (k) {
        if (typeof s[k] !== 'string') s[k] = '';
      });
      if (!s.id) s.id = genId();
      if (!s.createdAt) s.createdAt = Date.now();
    });
    return list;
  }

  function genId() {
    return 'steel-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

  // KPI 总览：钢厂总数 + 合作等级分布（与仓储/车队一致的四卡布局）
  function renderKpi() {
    var kpiGrid = document.getElementById('kpi-grid');
    var total = suppliers.length;
    var byType = {};
    suppliers.forEach(function (s) { byType[s.type] = (byType[s.type] || 0) + 1; });

    var mainTypes = ['长期合作', '稳定合作', '潜在合作'];
    var cards = [{ label: '钢厂总数', value: total, cls: 'blue' }]
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

  // 钢厂卡片网格（按搜索词过滤，最新录入在前）
  function renderList() {
    var kw = (searchInput.value || '').trim().toLowerCase();

    var list = kw
      ? suppliers.filter(function (s) {
          return [s.name, s.address, s.products].some(function (v) {
            return (v || '').toLowerCase().indexOf(kw) !== -1;
          });
        })
      : suppliers.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">' + (kw ? '未找到匹配的钢厂' : '暂无钢厂，点击右上角「新增钢厂」添加') + '</div>';
      return;
    }

    grid.innerHTML = list.map(function (s) {
      return '<div class="supplier-card" data-id="' + esc(s.id) + '" title="点击查看详情">' +
        '<div class="s-head">' +
          '<div class="s-name">' + esc(s.name) + '</div>' +
          '<span class="type-badge ' + (STEEL_TYPES[s.type] || 'stable') + '">' + esc(s.type) + '</span>' +
        '</div>' +
        '<div class="s-info">' +
          '<div class="s-row"><span class="s-label">采购联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
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

  function renderAll() { renderKpi(); renderList(); renderMap(); }

  /* ==================== 邯郸钢企地区分布 ==================== */

  // 地图标记（坐标对应 steel.html 内邯郸市真实区划地图；label 为展板用简称）
  // anchor: start 标签在点右侧 / end 标签在点左侧；dy: 标签纵向微调（密集区避让）
  // 标记坐标按各厂址真实经纬度换算（WGS84，来源：排污许可证/竣工验收报告/企业水保监测方案等公开文件），
  // 底图为 GCJ-02 投影（x=(lng-113.47)×473.6+24, y=(37.02-lat)×473.6+80，已含约 +0.0046°/+0.0024° 火星偏移）。
  // 裕华/冀南/金鼎三厂在上团城乡实际相邻（相距不足1km），为避免圆点互相遮挡做了少量示意性拉开
  var MARKERS = [
    { id: 'steel-001', x: 242.4, y: 214.3, label: '普阳钢铁', anchor: 'end', dy: -4 },
    { id: 'steel-002', x: 485.5, y: 277.2, label: '邯钢本部', anchor: 'start', cls: 'hq' },
    { id: 'steel-003', x: 343.7, y: 268.4, label: '新兴铸管', anchor: 'start' },
    { id: 'steel-004', x: 317, y: 209, label: '裕华钢铁', anchor: 'end' },
    { id: 'steel-005', x: 360.2, y: 239.8, label: '文安钢铁', anchor: 'start', dy: 10 },
    { id: 'steel-006', x: 455.6, y: 192.7, label: '永洋特钢', anchor: 'start' },
    { id: 'steel-007', x: 156.7, y: 282.2, label: '天津铁厂', anchor: 'start' },
    { id: 'steel-008', x: 316.2, y: 271.3, label: '太行钢铁', anchor: 'end' },
    { id: 'steel-009', x: 332, y: 219, label: '冀南钢铁', anchor: 'start', dy: -6 },
    { id: 'steel-010', x: 322, y: 231, label: '金鼎钢铁', anchor: 'end' },
    { id: 'steel-011', x: 376.2, y: 223, label: '新金钢铁', anchor: 'start', dy: 6 }
  ];

  // 区县分组（新录入钢厂默认归入武安市）
  var DISTRICT_MAP = {
    'steel-001': '武安市', 'steel-003': '武安市', 'steel-004': '武安市', 'steel-005': '武安市',
    'steel-008': '武安市', 'steel-009': '武安市', 'steel-010': '武安市', 'steel-011': '武安市',
    'steel-006': '永年区', 'steel-007': '涉县', 'steel-002': '复兴区（本部）'
  };

  function districtOf(s) { return DISTRICT_MAP[s.id] || '武安市'; }

  // 展示简称（新录入钢厂用全名）
  var SHORT_NAMES = {
    'steel-001': '普阳钢铁', 'steel-002': '河钢邯钢', 'steel-003': '新兴铸管', 'steel-004': '裕华钢铁',
    'steel-005': '文安钢铁', 'steel-006': '永洋特钢', 'steel-007': '天津铁厂', 'steel-008': '太行钢铁',
    'steel-009': '冀南钢铁', 'steel-010': '金鼎钢铁', 'steel-011': '新金钢铁'
  };

  function shortName(s) { return SHORT_NAMES[s.id] || s.name; }

  // SVG 命名空间创建
  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // 标记点绘制（主地图与放大视图共用；可点击查看详情）
  function drawMarkers(layer) {
    layer.innerHTML = '';

    MARKERS.forEach(function (m) {
      var s = suppliers.find(function (x) { return x.id === m.id; });
      if (!s) return;

      var g = svgEl('g', { class: 'map-marker' + (m.cls ? ' ' + m.cls : '') });
      g.appendChild(svgEl('circle', { cx: m.x, cy: m.y, r: 7 }));
      var text = svgEl('text', {
        x: m.anchor === 'end' ? m.x - 12 : m.x + 12,
        y: m.y + 5 + (m.dy || 0),
        'text-anchor': m.anchor === 'end' ? 'end' : 'start'
      });
      text.textContent = m.label;
      g.appendChild(text);

      var tip = svgEl('title', {});
      tip.textContent = s.name + '（点击查看详情）';
      g.appendChild(tip);

      // stopPropagation：避免点击标记时冒泡触发地图放大
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetail(s);
      });
      layer.appendChild(g);
    });
  }

  function renderMap() {
    var layer = document.getElementById('map-markers');
    if (!layer) return;
    drawMarkers(layer);
    renderDistrictList();
  }

  // 右侧区县分组统计（chip 可点击查看详情）
  function renderDistrictList() {
    var box = document.getElementById('district-list');
    if (!box) return;

    var groups = {};
    suppliers.forEach(function (s) {
      var d = districtOf(s);
      (groups[d] = groups[d] || []).push(s);
    });

    var order = ['武安市', '复兴区（本部）', '永年区', '涉县'];
    var keys = order.filter(function (k) { return groups[k]; })
      .concat(Object.keys(groups).filter(function (k) { return order.indexOf(k) === -1; }));

    box.innerHTML = keys.map(function (k) {
      return '<div class="district-item">' +
        '<div class="d-name">' + esc(k) + ' <span style="color:var(--gray-500);font-weight:400">' + groups[k].length + '家</span></div>' +
        '<div class="d-companies">' +
          groups[k].map(function (s) {
            return '<button type="button" class="d-chip" data-id="' + esc(s.id) + '" title="点击查看详情">' + esc(shortName(s)) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // 区县 chip 点击 → 详情
  document.getElementById('district-list').addEventListener('click', function (e) {
    var chip = e.target.closest('.d-chip');
    if (!chip) return;
    var s = suppliers.find(function (x) { return x.id === chip.getAttribute('data-id'); });
    if (s) openDetail(s);
  });

  /* ==================== 地图放大预览 ==================== */

  var zoomMask = document.getElementById('map-zoom-mask');
  var zoomModal = document.getElementById('map-zoom-modal');
  var zoomBody = document.getElementById('map-zoom-body');

  // 打开放大视图：克隆主地图（避免 id 重复），重绘标记并绑定点击
  function openMapZoom() {
    var src = document.getElementById('handan-map');
    if (!src || zoomModal.hidden === false) return;

    var clone = src.cloneNode(true);
    clone.removeAttribute('id');
    var layer = clone.querySelector('#map-markers');
    if (layer) layer.id = 'map-zoom-markers';
    var districts = clone.querySelector('#map-districts');
    if (districts) districts.removeAttribute('id');

    zoomBody.innerHTML = '';
    zoomBody.appendChild(clone);
    var zoomLayer = document.getElementById('map-zoom-markers');
    if (zoomLayer) drawMarkers(zoomLayer);

    zoomMask.hidden = false;
    zoomModal.hidden = false;
    document.body.classList.add('drawer-open');
  }

  function closeMapZoom() {
    zoomMask.hidden = true;
    zoomModal.hidden = true;
    zoomBody.innerHTML = '';
    if (drawer.hidden && modal.hidden) document.body.classList.remove('drawer-open');
  }

  document.getElementById('map-zoom-btn').addEventListener('click', openMapZoom);
  document.querySelector('.map-stage').addEventListener('click', openMapZoom);
  document.getElementById('map-zoom-close').addEventListener('click', closeMapZoom);
  zoomMask.addEventListener('click', closeMapZoom);

  /* ==================== 新增 / 编辑钢厂抽屉 ==================== */

  var mask = document.getElementById('drawer-mask');
  var drawer = document.getElementById('add-drawer');
  var form = document.getElementById('supplier-form');
  var nameInput = document.getElementById('f-name');
  var drawerTitle = document.getElementById('drawer-title');
  var submitBtn = document.getElementById('btn-submit');
  var nameErr = document.createElement('div');
  nameErr.className = 'form-err';
  nameErr.textContent = '请输入钢厂名称，且不能与已有钢厂重复';
  nameInput.parentElement.appendChild(nameErr);

  // 当前编辑的钢厂 id（null = 新增模式）
  var editingId = null;

  function openDrawer(steel) {
    closeDetail();
    editingId = steel ? steel.id : null;
    drawerTitle.textContent = steel ? '编辑钢厂' : '新增钢厂';
    submitBtn.textContent = steel ? '保存修改' : '保存钢厂';
    mask.hidden = false;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    nameInput.classList.remove('error');
    nameErr.classList.remove('show');
    form.reset();

    if (steel) {
      nameInput.value = steel.name || '';
      document.getElementById('f-type').value = STEEL_TYPES[steel.type] ? steel.type : '稳定合作';
      document.getElementById('f-contact').value = steel.contact || '';
      document.getElementById('f-phone').value = steel.phone || '';
      document.getElementById('f-address').value = steel.address || '';
      document.getElementById('f-capacity').value = steel.capacity || '';
      document.getElementById('f-ore-demand').value = steel.oreDemand || '';
      document.getElementById('f-nature').value = steel.nature || '';
      document.getElementById('f-founded').value = steel.founded || '';
      document.getElementById('f-reg-time').value = steel.regTime || '';
      document.getElementById('f-reg-capital').value = steel.regCapital || '';
      document.getElementById('f-reg-address').value = steel.regAddress || '';
      document.getElementById('f-intro').value = steel.intro || '';
      document.getElementById('f-remark').value = steel.remark || '';
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
      oreDemand: document.getElementById('f-ore-demand').value.trim(),
      nature: document.getElementById('f-nature').value.trim(),
      founded: document.getElementById('f-founded').value.trim(),
      regTime: document.getElementById('f-reg-time').value.trim(),
      regCapital: document.getElementById('f-reg-capital').value.trim(),
      regAddress: document.getElementById('f-reg-address').value.trim(),
      intro: document.getElementById('f-intro').value.trim(),
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

  /* ==================== 钢厂详情弹窗 ==================== */

  var modalMask = document.getElementById('modal-mask');
  var modal = document.getElementById('detail-modal');
  var modalBody = document.getElementById('detail-body');

  function openDetail(s) {
    closeDrawer();
    modalBody.innerHTML =
      '<div class="d-head">' +
        '<div class="s-name">' + esc(s.name) + '</div>' +
        '<span class="type-badge ' + (STEEL_TYPES[s.type] || 'stable') + '">' + esc(s.type) + '</span>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">经营指标</div>' +
        '<div class="cap-grid">' +
          '<div class="cap-item"><div class="cap-value ' + (s.capacity ? '' : 'empty') + '">' + (esc(s.capacity) || '—') + '</div><div class="cap-label">粗钢产能</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.oreDemand ? '' : 'empty') + '">' + (esc(s.oreDemand) || '—') + '</div><div class="cap-label">矿石需求</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.nature ? '' : 'empty') + '">' + (esc(s.nature) || '—') + '</div><div class="cap-label">企业性质</div></div>' +
          '<div class="cap-item"><div class="cap-value ' + (s.founded ? '' : 'empty') + '">' + (esc(s.founded) || '—') + '</div><div class="cap-label">建厂时间</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">注册信息</div>' +
        '<div class="d-section">' +
          '<div class="s-row detail-row"><span class="s-label">注册时间</span><span class="s-value ' + (s.regTime ? '' : 'empty') + '">' + (esc(s.regTime) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">注册资本</span><span class="s-value ' + (s.regCapital ? '' : 'empty') + '">' + (esc(s.regCapital) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">注册地址</span><span class="s-value ' + (s.regAddress ? '' : 'empty') + '">' + (esc(s.regAddress) || '—') + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">基础信息</div>' +
        '<div class="d-section">' +
          '<div class="s-row detail-row"><span class="s-label">采购联系人</span><span class="s-value ' + (s.contact ? '' : 'empty') + '">' + (esc(s.contact) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">采购电话</span><span class="s-value ' + (s.phone ? '' : 'empty') + '">' + (esc(s.phone) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">厂区地址</span><span class="s-value ' + (s.address ? '' : 'empty') + '">' + (esc(s.address) || '—') + '</span></div>' +
          '<div class="s-row detail-row"><span class="s-label">录入时间</span><span class="s-value">' + fmtTime(s.createdAt) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="d-block">' +
        '<div class="d-label">钢厂简介</div>' +
        '<div class="d-intro ' + (s.intro ? '' : 'empty') + '">' + (esc(s.intro) || '暂无简介') + '</div>' +
      '</div>' +

      (s.remark ? '<div class="d-block"><div class="d-label">备注</div><div class="d-intro">' + esc(s.remark) + '</div></div>' : '') +

      '<div class="drawer-footer d-footer">' +
        '<button type="button" class="btn-ghost" id="detail-del">删除钢厂</button>' +
        '<button type="button" class="btn-primary" id="detail-edit">编辑钢厂</button>' +
      '</div>';

    document.getElementById('detail-edit').addEventListener('click', function () {
      closeDetail();
      openDrawer(s);
    });

    document.getElementById('detail-del').addEventListener('click', function () {
      if (window.confirm('确定删除钢厂「' + s.name + '」吗？')) {
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

  // Esc：优先关闭详情弹窗，再关闭抽屉，最后关闭地图放大视图
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) { closeDetail(); return; }
    if (!drawer.hidden) closeDrawer();
    if (!zoomModal.hidden) closeMapZoom();
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
