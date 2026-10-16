// ===== 中转站点管理模块脚本 =====
// 列表页（transfer.html）：检索卡片 + 台账卡片（搜索 / 分页 / 导出 / 新增 / 编辑 / 删除）
// 详情页（transfer-detail.html?id=xxx）：站点概览 + 指标 + 信息卡片 + 堆场仓库表格（✎ 编辑）
// 数据持久化：localStorage（hz_transfer_stations），{__version, list} 包装格式，版本不匹配自动回种子
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_transfer_stations';
  var VERSION = 'v15';

  // ===== 种子数据（曹庄镇站 / 邢台南站 / 康城站）=====
  var SEED = [
    {
      id: 'st-caozhuangzhen',
      name: '曹庄镇站',
      subtitle: '河北省邯郸市鸡泽县曹庄镇·邯黄铁路沿线',
      photo: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=railway%20freight%20station%20in%20north%20china%20plain%2C%20container%20yard%20with%20stacked%20shipping%20containers%2C%20blue%20gantry%20crane%2C%20electrified%20tracks%20with%20freight%20wagons%2C%20clear%20daylight%2C%20realistic%20photography&image_size=landscape_16_9',
      intro: '邯黄铁路沿线重要中转节点，承担大宗货物装卸、仓储集散与公铁换装功能，衔接黄骅港方向铁海联运班列',
      metrics: [
        { label: '设计年装卸能力', value: '200', unit: '万吨' },
        { label: '货场面积', value: '20', unit: '万㎡' },
        { label: '货物线', value: '2', unit: '条' }
      ],
      basicInfo: [
        { label: '站点名称', value: '曹庄镇站' },
        { label: '所属线路', value: '邯黄铁路' },
        { label: '所属地区', value: '河北省邯郸市鸡泽县曹庄镇' },
        { label: '站点性质', value: '货运站、中间站' },
        { label: '运行时间', value: '2025年' },
        { label: '隶属铁路局', value: '中国铁路北京局集团有限公司' },
        { label: '车站等级', value: '四级' }
      ],
      stationIntro: '2025年，启动铁路线延长工程，曹庄镇站轨道由450米延长至1050米，装卸能力预计560万吨/年。具备20、40英尺集装箱及整车发到作业能力，可满足整列火车直接进出装卸。现已实现东盟班列常态化运行，成为京津冀地区唯一常态化运行的"中国—东盟"陆地运输通道。',
      scale: '货场1处，横列式布置，货物线2条，有效长度450米，装卸作业时需对整列解编为半列列车推送进入。'
    },
    {
      id: 'st-xingtainan',
      name: '邢台南站',
      subtitle: '河北省邢台市·邯黄铁路',
      photo: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20railway%20freight%20logistics%20yard%2C%20gantry%20cranes%20over%20rail%20sidings%2C%20container%20handling%20area%20and%20warehouses%2C%20sunny%20day%2C%20realistic%20photography&image_size=landscape_16_9',
      intro: '和邢铁路与京广铁路交汇节点，晋冀鲁豫交界区域重要货物集散中心，承担中欧、中亚班列货物集结与换装作业',
      metrics: [
        { label: '实际货运量', value: '667.2', unit: '万吨', note: '数据时间2024年' },
        { label: '货场面积', value: '25.5', unit: '万㎡' },
        { label: '铁路线路总数', value: '4', unit: '条' }
      ],
      basicInfo: [
        { label: '站点名称', value: '邢台南站' },
        { label: '所属线路', value: '邯黄铁路' },
        { label: '所属地区', value: '河北省邢台市' },
        { label: '站点性质', value: '货运站、中间站' },
        { label: '运行时间', value: '2013年' },
        { label: '隶属铁路局', value: '中国铁路北京局集团有限公司' },
        { label: '车站等级', value: '-' }
      ],
      stationIntro: '邢台南站主要承担煤炭、玻璃、粮食、农产品、钢材等大宗货物的运输任务。车站通过邯黄铁路与天津港、黄骅港、唐山港等沿海港口实现海铁联运，是冀中南地区重要的物流节点。2024年，该站全年累计完成货物运输量667.2万吨，同比增长23.2%',
      scale: '一台四线（含正线1条），侧式站台。货场面积25.5万平方米，占地386亩，日吞吐量达5000吨。'
    },
    {
      id: 'st-kangcheng',
      name: '康城站',
      subtitle: '河北省武安市·邯长铁路',
      photo: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=bulk%20cargo%20railway%20freight%20terminal%2C%20raw%20material%20stockpile%20yard%20with%20loader%20machine%2C%20hopper%20freight%20wagons%20on%20tracks%2C%20industrial%20scenery%2C%20realistic%20photography&image_size=landscape_16_9',
      intro: '邯黄铁路西端起点站，冀中南地区矿石、钢材、煤炭等大宗货物东出黄骅港的重要始发集结站',
      metrics: [
        { label: '实际货运量', value: '-' },
        { label: '货场面积', value: '-' },
        { label: '装卸线数量', value: '8', unit: '条' }
      ],
      basicInfo: [
        { label: '站点名称', value: '康城站' },
        { label: '所属线路', value: '邯长铁路' },
        { label: '所属地区', value: '河北省武安市' },
        { label: '站点性质', value: '客货运站、中间站' },
        { label: '运行时间', value: '1943年' },
        { label: '隶属铁路局', value: '中国铁路北京局集团有限公司' },
        { label: '车站等级', value: '三级' }
      ],
      stationIntro: '康城站是邯郸站与武安站之间的一个重要中间站，连接着京广铁路与沙午铁路方向。距离邯郸站23公里。其上下行区间均已实现电气化',
      scale: '车站设有到发线8条（含正线2条），有效长度为871m~1044m。'
    }
  ];

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
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ __version: VERSION, list: stations }));
    } catch (e) {
      toast('保存失败：浏览器本地存储不可用');
    }
  }

  function loadData() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 忽略 */ }
    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.list) && parsed.__version === VERSION) {
          stations = parsed.list;
          return;
        }
      } catch (e) { /* 解析失败则重新写入种子数据 */ }
    }
    // 版本不匹配或无缓存：写入种子数据（副本，避免污染 SEED）
    stations = JSON.parse(JSON.stringify(SEED));
    saveData();
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
      + '    <div class="station-hero-name">' + esc(s.name) + '<span class="station-hero-sub">' + esc(s.subtitle) + '</span></div>'
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
    return '<section class="card">'
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
    openModal(title, body, function () {
      var rows = [];
      document.querySelectorAll('#f-kv-rows .form-kv-row').forEach(function (row) {
        var label = row.querySelector('.f-label').value.trim();
        var value = row.querySelector('.f-value').value.trim();
        if (label || value) rows.push({ label: label, value: value });
      });
      s[key] = rows;
      saveData();
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
    openModal('编辑堆场/仓库信息', body, function () {
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
      saveData();
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
    openModal('编辑站点介绍', body, function () {
      s.stationIntro = $('#f-station-intro').value.trim();
      saveData();
      renderDetail();
      toast('站点介绍已更新');
    });
  }

  function editScale() {
    var s = currentDetail();
    if (!s) return;
    var body = '<textarea id="f-scale" placeholder="输入站场规模" style="width:100%;min-height:170px;resize:vertical;">'
      + esc(s.scale || '') + '</textarea>';
    openModal('编辑站场规模', body, function () {
      s.scale = $('#f-scale').value.trim();
      saveData();
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

    applyFilter = function () {
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
      applyFilter();
    });

    form.addEventListener('reset', function () {
      requestAnimationFrame(function () { applyFilter(); });
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
    rows.forEach(function (r, i) {
      r.hidden = i < start || i >= start + pageSize;
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
    openModal('新增站点', body, function () {
      var name = $('#f-new-name').value.trim();
      if (!name) { toast('站点名称不能为空'); return false; }
      stations.push({
        id: uid('st'),
        name: name,
        subtitle: $('#f-new-sub').value.trim(),
        photo: '',
        intro: $('#f-new-intro').value.trim(),
        metrics: [
          { label: '年中转量', value: '—', unit: '' },
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
      saveData();
      renderAll();
      toast('已新增「' + name + '」，点击名称进入详情补充信息');
    });
  }

  function editStation(id) {
    var s = findStation(id);
    if (!s) return;
    var body = '<div class="form-row"><label>站点名称</label><input id="f-edit-name" value="' + esc(s.name) + '"></div>'
      + '<div class="form-row"><label>副标题</label><input id="f-edit-sub" value="' + esc(s.subtitle) + '"></div>'
      + '<div class="form-row"><label>站点简介</label><input id="f-edit-intro" value="' + esc(s.intro) + '"></div>';
    openModal('编辑站点', body, function () {
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
      saveData();
      renderAll();
      toast('已保存');
    });
  }

  function deleteStation(id) {
    var s = findStation(id);
    if (!s) return;
    var body = '<p style="font-size:14px;color:var(--gray-700);">确定删除「<b>' + esc(s.name)
      + '</b>」？删除后无法恢复。</p>';
    openModal('删除站点', body, function () {
      stations = stations.filter(function (x) { return x.id !== id; });
      saveData();
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
        '年中转量', '堆场面积', '仓库面积', '装卸线数量', '主营业务',
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
  $('#modalMask').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
