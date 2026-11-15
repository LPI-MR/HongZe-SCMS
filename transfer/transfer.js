// ===== 中转站点管理模块脚本 =====
// 列表页（transfer.html）：检索卡片 + 台账卡片（搜索 / 分页 / 导出 / 新增 / 编辑 / 删除）
// 详情页（transfer-detail.html?id=xxx）：站点概览 + 指标 + 信息卡片 + 堆场仓库表格（✎ 编辑）
// 数据持久化到 PostgreSQL：读经 HZDB 内存缓存（/api/bootstrap），写经 PUT /api/stations 全量替换
(function () {
  'use strict';

  // ===== 状态 =====
  var stations = [];

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel) { return document.querySelector(sel); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
  }

  // 从 kv 行数组中按字段名取值
  function kvGet(rows, label) {
    if (!rows) return '';
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].label === label) return rows[i].value || '';
    }
    return '';
  }

  // 从指标数组中按名称取指标
  function metricOf(metrics, label) {
    if (!metrics) return null;
    for (var i = 0; i < metrics.length; i++) {
      if (metrics[i].label === label) return metrics[i];
    }
    return null;
  }

  // ===== 导航栏选中态 =====
  var NAV_PATH = '中转站点管理';

  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(function (el) { el.classList.remove('active'); });
    navbar.querySelectorAll('.nav-item').forEach(function (item) {
      if ((item.dataset.path || '') === NAV_PATH) item.classList.add('active');
    });
  }

  var navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) setActiveNav();
  else document.addEventListener('navbar:loaded', setActiveNav, { once: true });

  // ===== 数据读写 =====
  // 保存：全量写回数据库（PUT /api/stations）；失败由 HZDB toast 提示，页面内存保留可重试
  function saveData() {
    return HZDB.put('stations', stations);
  }

  // 读取：boot 完成后从 HZDB 缓存同步取（未装载时为空数组兜底）
  function loadData() {
    var list = HZDB.get('stations');
    stations = Array.isArray(list) ? list : [];
  }

  function findStation(id) {
    for (var i = 0; i < stations.length; i++) {
      if (stations[i].id === id) return stations[i];
    }
    return null;
  }

  // ============================================================
  // 详情模式：transfer-detail.html?id=xxx
  // ============================================================
  var detailPanel = document.getElementById('detailPanel');

  function currentDetail() {
    return findStation(new URLSearchParams(location.search).get('id'));
  }

  function renderDetail() {
    var s = currentDetail();

    if (!s) {
      detailPanel.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--gray-500);">' +
        '站点不存在或已被删除，请返回列表刷新。</div>';
      return;
    }

    detailPanel.innerHTML = ''
      // 站点概览头
      + '<section class="station-hero">'
      + '  <div class="station-hero-info">'
      + '    <div class="station-hero-name">' + esc(s.name) + (s.subtitle ? '<span class="station-hero-sub">' + esc(s.subtitle) + '</span>' : '') + '</div>'
      + '    <div class="station-hero-intro">' + esc(s.intro) + '</div>'
      + '  </div>'
      + (s.photo
        ? '<div class="station-hero-photo"><img src="' + esc(s.photo) + '" alt="' + esc(s.name) + '站点实景">'
          + '<i class="photo-fade"></i></div>'
        : '')
      + '</section>'

      // 核心指标
      + '<section class="metric-grid">' + (s.metrics || []).map(function (m) {
        var longCls = String(m.value).length > 8 ? ' long' : '';
        return '<div class="metric-card"><div class="metric-label">' + esc(m.label) + '</div>'
          + '<div class="metric-value' + longCls + '">' + esc(m.value)
          + (m.unit ? '<span class="metric-unit">' + esc(m.unit) + '</span>' : '') + '</div>'
          + (m.note ? '<div class="metric-note">' + esc(m.note) + '</div>' : '') + '</div>';
      }).join('') + '</section>'

      // 基本信息 + 站点介绍
      + '<div class="section-grid">'
      + kvCard(s, 'basicInfo', '基本信息', s.basicInfo)
      + introCard(s, s.stationIntro)
      + '</div>'

      // 站场规模（文字卡）或 堆场/仓库信息表格（通栏）
      + (s.scale ? scaleCard(s, s.scale) : yardsCard(s, s.yards));
  }

  function kvCard(s, key, title, rows) {
    return '<section class="card">'
      + '<div class="card-head"><div class="card-title">' + title + '</div>'
      + '<button class="icon-btn" data-edit="' + key + '" title="编辑">✎</button></div>'
      + '<div class="kv-list">' + (rows || []).map(function (r) {
        return '<div class="kv-row"><span class="kv-label">' + esc(r.label) + '</span>'
          + '<span class="kv-value">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>'
      + '</section>';
  }

  function introCard(s, text) {
    return '<section class="card">'
      + '<div class="card-head"><div class="card-title">站点介绍</div>'
      + '<button class="icon-btn" data-edit="stationIntro" title="编辑">✎</button></div>'
      + (text
        ? '<div class="station-intro"><p>' + esc(text) + '</p></div>'
        : '<div class="station-intro empty">暂无站点介绍，点击右上角 ✎ 添加</div>')
      + '</section>';
  }

  function scaleCard(s, text) {
    return '<section class="card scale-card">'
      + '<div class="card-head"><div class="card-title">站场规模</div>'
      + '<button class="icon-btn" data-edit="scale" title="编辑">✎</button></div>'
      + '<div class="station-intro"><p>' + esc(text) + '</p></div>'
      + '</section>';
  }

  function yardsCard(s, rows) {
    var body = rows && rows.length
      ? '<thead><tr><th style="width:150px;">堆场/仓库名称</th><th style="width:110px;">面积</th><th style="width:200px;">能力</th><th>位置</th></tr></thead>'
        + '<tbody>' + rows.map(function (y) {
          return '<tr><td class="yd-name">' + esc(y.name) + '</td>'
            + '<td>' + esc(y.area) + '</td>'
            + '<td>' + esc(y.capacity) + '</td>'
            + '<td>' + esc(y.location) + '</td></tr>';
        }).join('') + '</tbody>'
      : '<tbody><tr><td style="text-align:center;color:var(--gray-400);">暂无堆场/仓库数据，点击右上角 ✎ 添加</td></tr></tbody>';
    return '<section class="card yards-card">'
      + '<div class="card-head"><div class="card-title">堆场/仓库信息</div>'
      + '<button class="icon-btn" data-edit="yards" title="编辑">✎</button></div>'
      + '<table class="yard-table">' + body + '</table>'
      + '</section>';
  }

  // ===== 弹窗（列表 / 详情共用） =====
  function openModal(title, bodyHTML, onOk) {
    var mask = $('#modalMask');
    $('#modalBox').innerHTML =
      '<div class="modal-head"><span>' + esc(title) + '</span>'
      + '<button class="icon-btn" data-modal-close title="关闭">✕</button></div>'
      + '<div class="modal-body">' + bodyHTML + '</div>'
      + '<div class="modal-foot"><button data-modal-cancel>取消</button>'
      + '<button class="btn-ok" data-modal-ok>确定</button></div>';
    mask.classList.add('show');

    mask.querySelector('[data-modal-close]').onclick = closeModal;
    mask.querySelector('[data-modal-cancel]').onclick = closeModal;
    mask.querySelector('[data-modal-ok]').onclick = function () {
      if (onOk() !== false) closeModal();
    };
  }

  function closeModal() { $('#modalMask').classList.remove('show'); }

  // ===== 表单行构建（动态增删） =====
  function kvRowHTML(r) {
    return '<div class="form-kv-row" style="display:grid;grid-template-columns:110px 1fr auto;gap:6px;margin-bottom:8px;align-items:center;">'
      + '<input class="f-label" placeholder="字段名" value="' + esc(r.label) + '">'
      + '<input class="f-value" placeholder="内容" value="' + esc(r.value) + '">'
      + '<button class="row-del" style="border:none;background:transparent;color:var(--color-danger);cursor:pointer;font-size:14px;">✕</button>'
      + '</div>';
  }

  function bindRowRemove(container) {
    container.querySelectorAll('.row-del').forEach(function (btn) {
      btn.onclick = function () { btn.parentElement.remove(); };
    });
  }

  // ===== 详情页各编辑器 =====
  function editKV(key, title) {
    var s = currentDetail();
    if (!s) return;
    s[key] = s[key] || [];
    var body = '<div id="f-kv-rows">' + s[key].map(kvRowHTML).join('') + '</div>'
      + '<button class="form-add" id="f-kv-add">＋ 添加字段</button>';
    openModal(title, body, async function () {
      var rows = [];
      document.querySelectorAll('#f-kv-rows .form-kv-row').forEach(function (row) {
        var label = row.querySelector('.f-label').value.trim();
        var value = row.querySelector('.f-value').value.trim();
        if (label || value) rows.push({ label: label, value: value });
      });
      s[key] = rows;
      if (!await saveData()) return;
      renderDetail();
      toast(title + '已更新');
    });
    bindRowRemove($('#f-kv-rows'));
    $('#f-kv-add').onclick = function () {
      $('#f-kv-rows').insertAdjacentHTML('beforeend', kvRowHTML({ label: '', value: '' }));
      bindRowRemove($('#f-kv-rows'));
    };
  }

  function editYards() {
    var s = currentDetail();
    if (!s) return;
    s.yards = s.yards || [];
    function yardRow(y) {
      return '<div class="form-yard-row" style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-bottom:10px;">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">'
        + '<input class="y-name" placeholder="堆场/仓库名称" value="' + esc(y.name) + '">'
        + '<input class="y-area" placeholder="面积" value="' + esc(y.area) + '"></div>'
        + '<input class="y-cap" placeholder="能力" value="' + esc(y.capacity) + '" style="width:100%;margin-bottom:6px;">'
        + '<input class="y-loc" placeholder="位置" value="' + esc(y.location) + '" style="width:100%;">'
        + '<button class="row-del" style="border:none;background:transparent;color:var(--color-danger);cursor:pointer;font-size:12px;padding:4px 0 0;">✕ 删除该堆场/仓库</button>'
        + '</div>';
    }
    var body = '<div id="f-yard-rows">' + s.yards.map(yardRow).join('') + '</div>'
      + '<button class="form-add" id="f-yard-add">＋ 添加堆场/仓库</button>';
    openModal('编辑堆场/仓库信息', body, async function () {
      var rows = [];
      document.querySelectorAll('#f-yard-rows .form-yard-row').forEach(function (row) {
        var name = row.querySelector('.y-name').value.trim();
        if (!name) return;
        rows.push({
          name: name,
          area: row.querySelector('.y-area').value.trim(),
          capacity: row.querySelector('.y-cap').value.trim(),
          location: row.querySelector('.y-loc').value.trim()
        });
      });
      s.yards = rows;
      if (!await saveData()) return;
      renderDetail();
      toast('堆场/仓库信息已更新');
    });
    bindRowRemove($('#f-yard-rows'));
    $('#f-yard-add').onclick = function () {
      $('#f-yard-rows').insertAdjacentHTML('beforeend',
        yardRow({ name: '', area: '', capacity: '', location: '' }));
      bindRowRemove($('#f-yard-rows'));
    };
  }

  function editStationIntro() {
    var s = currentDetail();
    if (!s) return;
    var body = '<textarea id="f-station-intro" placeholder="输入站点介绍" style="width:100%;min-height:170px;resize:vertical;">'
      + esc(s.stationIntro || '') + '</textarea>';
    openModal('编辑站点介绍', body, async function () {
      s.stationIntro = $('#f-station-intro').value.trim();
      if (!await saveData()) return;
      renderDetail();
      toast('站点介绍已更新');
    });
  }

  function editScale() {
    var s = currentDetail();
    if (!s) return;
    var body = '<textarea id="f-scale" placeholder="输入站场规模" style="width:100%;min-height:170px;resize:vertical;">'
      + esc(s.scale || '') + '</textarea>';
    openModal('编辑站场规模', body, async function () {
      s.scale = $('#f-scale').value.trim();
      if (!await saveData()) return;
      renderDetail();
      toast('站场规模已更新');
    });
  }

  // ============================================================
  // 列表模式：transfer.html
  // ============================================================
  var tbody = document.querySelector('.ledger-table tbody');
  var applyFilter = null;

  // 由站点对象构造表格行
  function renderRow(s) {
    var tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.dataset.name = s.name || '';
    tr.dataset.location = kvGet(s.basicInfo, '所属地区') || s.subtitle || '';

    var volume = metricOf(s.metrics, '实际货运量') || metricOf(s.metrics, '年中转量') || metricOf(s.metrics, '设计年装卸能力');
    var tracks = metricOf(s.metrics, '装卸线数量') || metricOf(s.metrics, '铁路线路总数') || metricOf(s.metrics, '货物线');

    tr.innerHTML = [
      '<td class="col-index"></td>',
      '<td class="col-name"><a class="station-link" href="/transfer/transfer-detail.html?id=' + encodeURIComponent(s.id) + '">' +
        esc(s.name) + '</a></td>',
      '<td class="col-line">' + (esc(kvGet(s.basicInfo, '所属线路')) || '—') + '</td>',
      '<td class="col-region">' + (esc(tr.dataset.location) || '—') + '</td>',
      '<td class="col-volume">' + (volume ? esc(volume.value) + (volume.unit ? esc(volume.unit) : '') : '—') + '</td>',
      '<td class="col-tracks">' + (tracks ? esc(tracks.value) + (tracks.unit ? ' ' + esc(tracks.unit) : '') : '—') + '</td>',
      '<td class="col-action"><div class="cell-actions">' +
        '<button class="row-act detail" type="button">详情</button>' +
        '<button class="row-act edit" type="button">编辑</button>' +
        '<button class="row-act del" type="button">删除</button>' +
      '</div></td>'
    ].join('');
    return tr;
  }

  // 按当前数据全量重建表格（新增 / 编辑 / 删除后统一走这里）
  function renderAll() {
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(function (row) { row.remove(); });
    stations.forEach(function (s) { tbody.appendChild(renderRow(s)); });

    // 重新编号（按当前展示顺序）
    var i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(function (row) {
      row.querySelector('.col-index').textContent = ++i;
    });

    $('#stCount').textContent = stations.length;
    var emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.hidden = stations.length > 0;
    if (applyFilter) applyFilter();
  }

  // ===== 检索 =====
  function initSearch() {
    var form = document.getElementById('searchForm');
    if (!form) return;

    var nameInput = document.getElementById('searchName');
    var locInput = document.getElementById('searchLocation');

    // resetPage：筛选控件触发时传 true 回到第 1 页；增删改后的内部调用不传，保持浏览位置
    applyFilter = function (resetPage) {
      if (resetPage === true) curPage = 1;
      var keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      var loc = (locInput.value || '').trim().toLowerCase();

      var visible = 0;
      document.querySelectorAll('.ledger-table tbody tr').forEach(function (row) {
        if (row.classList.contains('empty-row')) return;

        var text = row.textContent.toLowerCase() + ' ' +
          Object.values(row.dataset).join(' ').toLowerCase();
        var ok =
          keywords.every(function (kw) { return text.includes(kw); }) &&
          (!loc || (row.dataset.location || '').toLowerCase().includes(loc));

        row.hidden = !ok;
        // 标记「被检索过滤」的行：与分页隐藏区分，保证导出覆盖完整筛选结果
        if (ok) delete row.dataset.filtered;
        else row.dataset.filtered = '1';
        if (ok) visible += 1;
      });

      var emptyRow = document.querySelector('.ledger-table .empty-row');
      if (emptyRow) emptyRow.hidden = visible > 0;

      renderPage();
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      applyFilter(true);
    });

    form.addEventListener('reset', function () {
      requestAnimationFrame(function () { applyFilter(true); });
    });
  }

  // ===== 分页（基于检索后的可见行切片显示） =====
  var pageSize = 10;
  var curPage = 1;

  function renderPage() {
    var rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)')).filter(function (r) { return !r.hidden; });

    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    var start = (curPage - 1) * pageSize;
    // 切片改用 style.display，与筛选用 hidden 正交，避免 total 级联收缩（跳页失效根因）
    rows.forEach(function (r, i) {
      r.style.display = (i < start || i >= start + pageSize) ? 'none' : '';
    });

    $('#pagerTotal').textContent = total;
    $('#pgPages').textContent = pages;
    $('#pgInput').value = curPage;
    $('#pgInput').max = pages;
    $('#pgFirst').disabled = curPage <= 1;
    $('#pgPrev').disabled = curPage <= 1;
    $('#pgNext').disabled = curPage >= pages;
    $('#pgLast').disabled = curPage >= pages;
  }

  // 定位指定站点行所在页码并跳转（新增保存后确保新行立即进入视野）
  // 未找到（如被检索过滤隐藏）时保持当前页不变
  function locateRowPage(id) {
    if (!id) return;
    var rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)')).filter(function (r) { return !r.hidden; });
    var idx = rows.findIndex(function (r) { return r.dataset.id === id; });
    if (idx >= 0) {
      curPage = Math.floor(idx / pageSize) + 1;
      renderPage();
    }
  }

  function bindPager() {
    var pages = function () { return Math.max(1, Number($('#pgPages').textContent) || 1); };
    var go = function (p) { curPage = p; renderPage(); };

    $('#pgFirst').addEventListener('click', function () { go(1); });
    $('#pgPrev').addEventListener('click', function () { go(curPage - 1); });
    $('#pgNext').addEventListener('click', function () { go(curPage + 1); });
    $('#pgLast').addEventListener('click', function () { go(pages()); });

    $('#pageSize').addEventListener('change', function (e) {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    var jump = function () {
      var p = parseInt($('#pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('#pgInput').addEventListener('change', jump);
    $('#pgInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') jump(); });
  }

  // ===== 新增 / 编辑 / 删除站点 =====
  function addStation() {
    var body = '<div class="form-row"><label>站点名称</label><input id="f-new-name" placeholder="如：XX站"></div>'
      + '<div class="form-row"><label>副标题</label><input id="f-new-sub" placeholder="如：河北省XX市·XX铁路沿线"></div>'
      + '<div class="form-row"><label>站点简介</label><input id="f-new-intro" placeholder="一句话介绍该站点"></div>';
    openModal('新增站点', body, async function () {
      var name = $('#f-new-name').value.trim();
      if (!name) { toast('站点名称不能为空'); return false; }
      var newId = uid('st');
      stations.push({
        id: newId,
        name: name,
        subtitle: $('#f-new-sub').value.trim(),
        photo: '',
        intro: $('#f-new-intro').value.trim(),
        metrics: [
          { label: '货运量', value: '—', unit: '' },
          { label: '堆场面积', value: '—', unit: '' },
          { label: '仓库面积', value: '—', unit: '' },
          { label: '装卸线数量', value: '—', unit: '' }
        ],
        basicInfo: [
          { label: '站点名称', value: name },
          { label: '所属线路', value: '' },
          { label: '所属地区', value: $('#f-new-sub').value.trim() }
        ],
        stationIntro: '',
        yards: []
      });
      if (!await saveData()) return;
      renderAll();
      locateRowPage(newId); // 新增行可能落在其他页，跳转到位
      toast('已新增「' + name + '」，点击名称进入详情补充信息');
    });
  }

  function editStation(id) {
    var s = findStation(id);
    if (!s) return;
    var body = '<div class="form-row"><label>站点名称</label><input id="f-edit-name" value="' + esc(s.name) + '"></div>'
      + '<div class="form-row"><label>副标题</label><input id="f-edit-sub" value="' + esc(s.subtitle) + '"></div>'
      + '<div class="form-row"><label>站点简介</label><input id="f-edit-intro" value="' + esc(s.intro) + '"></div>';
    openModal('编辑站点', body, async function () {
      var name = $('#f-edit-name').value.trim();
      if (!name) { toast('站点名称不能为空'); return false; }
      s.name = name;
      s.subtitle = $('#f-edit-sub').value.trim();
      s.intro = $('#f-edit-intro').value.trim();
      // 同步基本信息中的名称 / 所属地区
      if (s.basicInfo) {
        s.basicInfo.forEach(function (r) {
          if (r.label === '站点名称') r.value = name;
          if (r.label === '所属地区') r.value = s.subtitle;
        });
      }
      if (!await saveData()) return;
      renderAll();
      toast('已保存');
    });
  }

  function deleteStation(id) {
    var s = findStation(id);
    if (!s) return;
    var body = '<p style="font-size:14px;color:var(--gray-700);">确定删除「<b>' + esc(s.name)
      + '</b>」？删除后无法恢复。</p>';
    openModal('删除站点', body, async function () {
      stations = stations.filter(function (x) { return x.id !== id; });
      if (!await saveData()) return;
      renderAll();
      toast('已删除「' + s.name + '」');
    });
  }

  // ===== 表格操作（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;

      // 详情：表格内统一入口（名称链接与详情按钮）
      if (e.target.closest('.row-act.detail')) {
        location.href = '/transfer/transfer-detail.html?id=' + encodeURIComponent(row.dataset.id);
        return;
      }
      if (e.target.closest('.row-act.edit')) { editStation(row.dataset.id); return; }
      if (e.target.closest('.row-act.del')) { deleteStation(row.dataset.id); return; }
    });
  }

  // ===== 导出 Excel：导出当前筛选结果 =====
  function initExport() {
    var btn = $('#exportBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (!stations.length) { alert('暂无站点数据可导出'); return; }
      if (!window.XLSX) { alert('导出组件加载失败，请刷新页面后重试'); return; }

      // 导出当前筛选结果：仅排除被检索过滤的行（data-filtered），包含分页未展示的行
      var visibleIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
        if (!row.dataset.filtered) visibleIds.push(row.dataset.id);
      });
      var list = stations.filter(function (s) { return visibleIds.includes(s.id); });

      if (!list.length) { alert('当前筛选条件下暂无可导出的站点数据'); return; }
      if (!confirm('将导出当前筛选结果 ' + list.length + ' 个站点，是否继续？')) return;

      var headers = [
        '序号', '站点名称', '所属线路', '所属地区', '站点性质',
        '年货运量/年装卸能力', '堆场面积', '仓库面积', '装卸线数量', '主营业务',
        '隶属铁路局', '车站等级', '堆场/仓库数量', '站点简介'
      ];

      var rows = list.map(function (s, i) {
        var v = metricOf(s.metrics, '实际货运量') || metricOf(s.metrics, '年中转量') || metricOf(s.metrics, '设计年装卸能力') || {};
        var yd = metricOf(s.metrics, '堆场面积') || metricOf(s.metrics, '货场面积') || {};
        var ck = metricOf(s.metrics, '仓库面积') || {};
        var tr = metricOf(s.metrics, '装卸线数量') || metricOf(s.metrics, '铁路线路总数') || metricOf(s.metrics, '货物线') || {};
        return [
          i + 1, s.name,
          kvGet(s.basicInfo, '所属线路'),
          kvGet(s.basicInfo, '所属地区') || s.subtitle,
          kvGet(s.basicInfo, '站点性质'),
          v.value || '', yd.value || '', ck.value || '', tr.value || '',
          kvGet(s.basicInfo, '主营业务'),
          kvGet(s.basicInfo, '隶属铁路局'),
          kvGet(s.basicInfo, '车站等级'),
          s.yards ? s.yards.length : 0,
          s.intro || ''
        ];
      });

      var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
      ws['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 20 },
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 26 },
        { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 50 }
      ];

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '中转站点台账');

      var dt = new Date();
      var stamp = dt.getFullYear() +
        String(dt.getMonth() + 1).padStart(2, '0') +
        String(dt.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '中转站点台账_' + stamp + '.xlsx');
    });
  }

  // ===== 初始化 =====
  // 装载数据库缓存后再渲染（boot 遮罩失败时可点重试）
  async function boot() {
    await HZDB.ready();
    loadData();

    if (detailPanel) {
      // 详情模式
      renderDetail();

      $('#backBtn').addEventListener('click', function () {
        location.href = '/transfer/transfer.html';
      });

      document.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-edit]');
        if (!editBtn) return;
        var key = editBtn.getAttribute('data-edit');
        if (key === 'basicInfo') editKV('basicInfo', '基本信息');
        else if (key === 'stationIntro') editStationIntro();
        else if (key === 'scale') editScale();
        else if (key === 'yards') editYards();
      });
    } else {
      // 列表模式
      initSearch();
      initTableActions();
      initExport();
      bindPager();
      renderAll();
    }

    var addBtn = $('#btnAddStation');
    if (addBtn) addBtn.addEventListener('click', addStation);
  }
  boot();

  $('#modalMask').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
