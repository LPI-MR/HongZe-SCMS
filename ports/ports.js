// ===== 港口信息管理模块脚本 =====
// 列表页（ports.html）：检索卡片 + 台账卡片（搜索 / 分页 / 导出 / 新增 / 编辑 / 删除）
// 详情页（ports-detail.html?id=xxx）：港口概览 + 指标 + 信息卡片 + 港区分部（✎ 编辑）
// 数据持久化：localStorage（hz_ports_data），{__version, list} 包装格式，版本不匹配自动回种子
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_ports_data';
  var VERSION = 'v13';   // v13：种子补全黄骅港/天津港详情字段（指标/基本信息/港区分部），升级版本使旧缓存自动重置

  // ===== 种子数据（黄骅港 / 天津港）=====
  var SEED = [
    {
      id: 'port-huanghua',
      name: '黄骅港',
      subtitle: '河北省沧州市·渤海沿岸',
      photo: '/ports/assets/huanghua-port.png',
      intro: '津冀沿海港口群的重要组成部分，我国西煤东运、北煤南运重要枢纽港口，国家能源运输大通道的关键节点',
      metrics: [
        { label: '年吞吐量', value: '3.66亿 / 119万标箱', unit: '', note: '数据时间：2025年' },
        { label: '年设计通过能力', value: '2.89亿 / 95万标箱', unit: '', note: '数据时间：2025年' },
        { label: '泊位数量', value: '47', unit: '个', note: '数据时间：2025年' },
        { label: '最大泊位吨级', value: '20', unit: '万吨' }
      ],
      basicInfo: [
        { label: '港口名称', value: '黄骅港' },
        { label: '所属地区', value: '河北省沧州市黄骅市' },
        { label: '始建时间', value: '1984年' },
        { label: '行政管理部门', value: '沧州市海洋和港航管理局' },
        { label: '主营业务货类', value: '煤炭、矿石、集装箱、液体化工等' }
      ],
      capacity: [
        { label: '集疏港铁路', value: '朔黄铁路、邯黄铁路、沧港铁路' },
        { label: '集疏港公路', value: '黄石高速、荣乌高速、秦滨高速' }
      ],
      zones: [
        {
          name: '综合港区',
          location: '黄骅港最北端',
          positioning: '以集装箱、粮食、滚装、成品油、液体化工品及其他散杂货运输为主，承担临港工业及腹地物资中转运输、综合物流服务等功能，是黄骅港的大型综合性港区。',
          facilities: '建有集装箱码头、滚装码头、通用散杂货码头、粮食码头及液体化工品码头等。'
        },
        {
          name: '散货港区',
          location: '综合港区以南、煤炭港区以北',
          positioning: '以铁矿石、原油等大宗散货物资运输为主，兼顾煤炭、成品油、液化天然气等其他散货运输，主要建设大型专业化散货码头，满足临港工业和腹地散货运输需求。',
          facilities: '建有大型专业化矿石码头（如20万吨级、25万吨级矿石泊位）、煤炭码头、原油码头及通用散货码头等。'
        },
        {
          name: '煤炭港区',
          location: '散货港区以南、河口港区以北',
          positioning: '黄骅港的核心能源港区，主要承担煤炭下水（北煤南运）功能，是黄骅港煤炭运输的保供核心，为国家级能源运输大通道的关键节点。',
          facilities: '建有大型煤炭专业化泊位（如5万吨级、10万吨级煤炭泊位）及相应的煤炭堆场、翻车机房等后方配套设施。'
        },
        {
          name: '河口港区',
          location: '黄骅港最南端（宣惠河口）',
          positioning: '为补充性港区，主要承担煤炭、建材及部分散杂货运输，因受泥沙淤积影响，船舶靠泊受限，发展空间相对有限。',
          facilities: '建有煤炭泊位、建材泊位及部分通用散杂货泊位等。'
        }
      ]
    },
    {
      id: 'port-tianjin',
      name: '天津港',
      subtitle: '天津市滨海新区·渤海沿岸',
      photo: '/ports/assets/tianjin-port.png',
      intro: '京津冀的海上门户，是中蒙俄经济走廊东部起点、新亚欧大陆桥重要节点、21世纪海上丝绸之路战略支点',
      metrics: [
        { label: '年吞吐量', value: '5.95亿 / 2403万标箱', unit: '', note: '数据时间：2025年' },
        { label: '年设计通过能力', value: '—', unit: '', note: '数据时间：2025年' },
        { label: '泊位数量', value: '213', unit: '个', note: '数据时间：2025年' },
        { label: '最大泊位吨级', value: '30', unit: '万吨' }
      ],
      basicInfo: [
        { label: '港口名称', value: '天津港' },
        { label: '所属地区', value: '天津市滨海新区' },
        { label: '始建时间', value: '1951年' },
        { label: '行政管理部门', value: '天津港股份有限公司' },
        { label: '主营业务货类', value: '集装箱、铁矿石、石油及制品、钢材、煤炭等' }
      ],
      capacity: [
        { label: '集疏港铁路', value: '黄万铁路、朔黄铁路、西南环线、新港北铁路集装箱中心站' },
        { label: '集疏港公路', value: '滨保高速、京津高速、京津塘高速、津晋高速、京石高速、滨海大道、塘承高速、秦滨高速、长深高速' }
      ],
      zones: [
        {
          name: '北疆港区',
          location: '天津港主航道以北，北至永定新河口，西至海防路，东至东疆港区。',
          positioning: '天津港综合性主港区、核心主力集装箱港区，兼顾商品汽车、件杂货，是华北集装箱进出口最主要作业区。',
          facilities: '天津港集装箱码头、国际联盟码头、欧亚国际码头、C段智能化集装箱码头（全球首个智慧零碳码头）及北疆集装箱物流中心。'
        },
        {
          name: '东疆港区',
          location: '北疆港区以东，天津港主航道以东区域。',
          positioning: '集装箱+邮轮母港，天津航运服务业高地，天津自贸区核心板块，重点发展航运金融、融资租赁、跨境电商等高端航运服务。',
          facilities: '太平洋集装箱码头、天津国际邮轮母港、东疆保税港区、大冷链物流园区。'
        },
        {
          name: '南疆港区',
          location: '天津港主航道以南，北至海河口，为东西长、南北窄的条状人工岛。',
          positioning: '国家能源、大宗原材料中转港区（散货能源港），以煤炭、铁矿石、原油、LNG等能源类货物中转为主，以铁路、管道集疏运为主。',
          facilities: '天津港焦炭码头、天津港远航矿石码头、天津港散货物流中心。'
        },
        {
          name: '大沽口港区',
          location: '海河入海口南侧，大沽口区域。',
          positioning: '临港工业配套港区（工业港），服务临港经济区，以钢铁、粮食、矿建、液体化工品、重大件等运输为主，兼顾部分中转运输。',
          facilities: '临港工业区配套码头、天津港汇盛码头等。'
        },
        {
          name: '高沙岭港区',
          location: '天津港北部，滨海新区南部。',
          positioning: '远期集装箱拓展区，承接北疆外迁的杂货、散货，服务后方临港制造业，远期预留集装箱发展空间。',
          facilities: '产业配套码头、预留集装箱码头空间。'
        },
        {
          name: '大港港区（南港片区）',
          location: '天津港南部，南港工业区配套区域。',
          positioning: '化工专用港区，服务南港石化新材料产业园，以油品、LNG、液体化工品、部分干散货运输为主。',
          facilities: '南港化工配套码头、LNG接收站、油品及液体化工品专用码头。'
        },
        {
          name: '北塘港区（含中心渔港）',
          location: '天津港北部，北塘区域。',
          positioning: '城市配套型港区，货运逐步收缩，北区以冷链物流运输（国家骨干冷链基地）为主，南区以滨海旅游客运、休闲文旅为主。',
          facilities: '冷链物流园区、旅游客运码头。'
        },
        {
          name: '海河港区',
          location: '海河下游，海河二道闸以下河段（海河两岸）。',
          positioning: '城市内河港区，货运逐步退出，未来主要发展内河观光旅游客运，兼顾城市短途工业物料、小型临港码头。',
          facilities: '小型临港码头、旅游客运码头。'
        }
      ]
    }
  ];

  // ===== 状态 =====
  var ports = [];

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
  var NAV_PATH = '港口管理';

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ __version: VERSION, list: ports }));
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
          ports = parsed.list;
          return;
        }
      } catch (e) { /* 解析失败则重新写入种子数据 */ }
    }
    // 版本不匹配或无缓存：写入种子数据（副本，避免污染 SEED）
    ports = JSON.parse(JSON.stringify(SEED));
    saveData();
  }

  // ============================================================
  // 详情模式：ports-detail.html?id=xxx
  // ============================================================
  var detailPanel = document.getElementById('detailPanel');

  // ===== 渲染：详情主体 =====
  function renderDetail() {
    var id = new URLSearchParams(location.search).get('id');
    var p = null;
    ports.forEach(function (x) { if (x.id === id) { p = x; } });

    if (!p) {
      detailPanel.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--gray-500);">' +
        '港口不存在或已被删除，请返回列表刷新。</div>';
      return;
    }

    var pmData = PORT_MAPS[p.name];   // 该港口是否配置俯瞰图数据

    detailPanel.innerHTML = ''
      // 港口概览头
      + '<section class="port-hero">'
      + '  <div class="port-hero-info">'
      + '    <div class="port-hero-name">' + esc(p.name) + '<span class="port-hero-sub">' + esc(p.subtitle) + '</span></div>'
      + '    <div class="port-hero-intro">' + esc(p.intro) + '</div>'
      + '  </div>'
      + (p.photo
        ? '<div class="port-hero-photo"><img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '港口实景">'
          + '<i class="photo-fade"></i></div>'
        : '')
      + '</section>'

      // 核心指标
      + '<section class="metric-grid">' + (p.metrics || []).map(function (m) {
        var longCls = String(m.value).length > 8 ? ' long' : '';
        return '<div class="metric-card"><div class="metric-label">' + esc(m.label) + '</div>'
          + '<div class="metric-value' + longCls + '">' + esc(m.value)
          + (m.unit ? '<span class="metric-unit">' + esc(m.unit) + '</span>' : '') + '</div>'
          + (m.note ? '<div class="metric-note">' + esc(m.note) + '</div>' : '') + '</div>';
      }).join('') + '</section>'

      // 基本信息 + 港口能力
      + '<div class="section-grid">'
      + kvCard(p, 'basicInfo', '基本信息', p.basicInfo)
      + kvCard(p, 'capacity', '集疏运体系', p.capacity)
      + '</div>'

      // 港区分部（通栏；配置了俯瞰图数据的港口附「港区介绍/卫星俯瞰地图」切换）
      + zonesCard(p, p.zones, pmData);

    pmPendingData = pmData;   // 地图懒加载：首次切到「卫星俯瞰地图」时初始化
    pmPendingPort = p.name;
    pmInitedFor = null;
  }

  function kvCard(p, key, title, rows) {
    return '<section class="card">'
      + '<div class="card-head"><div class="card-title">' + title + '</div>'
      + '<button class="icon-btn" data-edit="' + key + '" title="编辑">✎</button></div>'
      + '<div class="kv-list">' + (rows || []).map(function (r) {
        return '<div class="kv-row"><span class="kv-label">' + esc(r.label) + '</span>'
          + '<span class="kv-value">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>'
      + '</section>';
  }

  function zonesCard(p, rows, pmData) {
    var body = rows && rows.length
      ? '<thead><tr><th style="width:104px;">港区名称</th><th style="width:190px;">位置</th><th>功能定位</th><th style="width:32%;">主要设施</th></tr></thead>'
        + '<tbody>' + rows.map(function (z) {
          return '<tr><td class="zt-name">' + esc(z.name) + '</td>'
            + '<td>' + esc(z.location) + '</td>'
            + '<td>' + esc(z.positioning) + '</td>'
            + '<td>' + esc(z.facilities) + '</td></tr>';
        }).join('') + '</tbody>'
      : '<tbody><tr><td style="text-align:center;color:var(--gray-400);">暂无港区数据，点击右上角 ✎ 添加</td></tr></tbody>';
    var tabs = '<div class="zv-tabs">'
      + '<button class="zv-tab active" data-zview="intro" type="button">港区介绍</button>'
      + (pmData ? '<button class="zv-tab" data-zview="map" type="button">卫星俯瞰地图</button>' : '')
      + '</div>';
    var mapView = pmData
      ? '<div class="zone-view-map" style="display:none">'
        + '<div class="pm-map-note"><span class="spot-meta">卫星影像：Esri World Imagery · 区域为示意范围</span></div>'
        + '<div id="portMap"></div>'
        + (pmData.editable
          ? '<div class="pm-draw-bar">'
            + '<button class="pm-draw-btn" data-pm="start" type="button">＋ 绘制港区</button>'
            + '<button class="pm-draw-btn ok" data-pm="done" type="button" style="display:none" disabled>✓ 完成</button>'
            + '<button class="pm-draw-btn danger" data-pm="cancel" type="button" style="display:none">✕ 取消</button>'
            + '<span class="pm-draw-tip" style="display:none">单击地图依次添加顶点（至少 3 个），双击或点「完成」结束</span>'
            + '</div>'
          : '')
        + '<div class="pm-legend">'
        + '<span><i class="pm-shape pm-shape-zone"></i>港区区域</span>'
        + '<span><i class="pm-shape pm-shape-berth"></i>码头位置</span>'
        + ((pmData.stations || []).length ? '<span><i class="pm-shape pm-shape-station"></i>铁路站点</span>' : '')
        + '<span class="pm-tip">双击放大 · 拖动平移 · 点击区域查看说明' + (pmData.editable ? ' · 码头⚓可拖动' : '') + '</span>'
        + '</div></div>'
      : '';
    return '<section class="card zones-card">'
      + '<div class="card-head"><div class="card-title">港区分部</div>' + tabs
      + '<button class="icon-btn" data-edit="zones" title="编辑">✎</button></div>'
      + '<div class="zone-view-table"><table class="zone-table">' + body + '</table></div>'
      + mapView
      + '</section>';
  }

  // ===== 港口卫星俯瞰图（Leaflet + Esri 卫星影像，按港口名匹配渲染） =====
  // 坐标系 WGS-84；港区/码头以虚线多边形区域标注（参照高德地图 POI 区域样式）。
  // 黄骅港各多边形顶点按 Esri World Imagery 卫星影像实测地物描点：
  // 综合码头/散货一期码头岸线取船舶靠泊岸缘，煤炭港区取挖入式港池四角，
  // 散货二期取吹填区水线，为实际地理位置的示意范围。
  // 天津港各多边形按港区围堤与码头岸线走向绘制的示意范围。
  var PORT_MAPS = {
    '黄骅港': {
      editable: false,  // 俯瞰地图只读，不允许绘制/拖动
      center: [38.3500, 117.8850],
      zoom: 13,
      // 港区多边形已按最终确认结果移除（原综合/散货/煤炭/河口四个港区不再展示），仅保留码头锚点
      zones: [],
      // 主要码头锚点（橙色 ⚓，常显名称；坐标为实地拖动定位后固化）
      berths: [
        {
          name: '黄骅港综合码头',
          area: [[38.34327, 117.86682]],
          note: '多用途码头（散杂货/集装箱泊位8个，最大可靠泊10万吨级船舶）及通用散货码头，设计年吞吐量1800万吨'
        },
        {
          name: '矿石码头',
          area: [[38.32752, 117.84210]],
          note: '散货港区矿石码头一期1-4号泊位，4个20万吨级专业化矿石泊位，年设计吞吐量5000万吨'
        },
        {
          name: '神华码头',
          area: [[38.32254, 117.88004]],
          note: '国能黄骅港务（原神华集团）煤炭专业化装船码头一至五期，最大10万吨级泊位，配套翻车机房与筒仓群'
        }
      ],
      // 铁路站点（蓝色图标，常显名称；坐标为实地放置/拖动后固化）
      stations: [
        { name: '渤海东站', area: [[38.36009930588571, 117.92278289794923]], note: '铁路站点' }
      ]
    },
    '天津港': {
      editable: false,  // 俯瞰地图只读，不允许绘制/拖动
      // 一港八区：北疆、东疆、南疆、海河、大沽口、高沙岭、大港、北塘
      center: [38.9400, 117.7400],
      zoom: 11,
      // 港区区域（蓝色虚线多边形 + 中心常显名称；坐标为实地描绘后固化）
      zones: [
        {
          name: '北疆港区',
          // 海河闸北侧起沿实际海岸线向东北延伸至汉沽方向
          area: [[38.98941, 117.72606], [38.98434, 117.74220], [38.98781, 117.74323], [38.98701, 117.74769], [38.98193, 117.74563], [38.98167, 117.74906], [38.98487, 117.75009], [38.98407, 117.75524], [38.97953, 117.75455], [38.97873, 117.75799], [38.98327, 117.75764], [38.98247, 117.76211], [38.97740, 117.76211], [38.97606, 117.76588], [38.98007, 117.76520], [38.97419, 117.78751], [38.97740, 117.78992], [38.98407, 117.77859], [39.02062, 117.76932], [39.02409, 117.75593], [39.02969, 117.75970], [39.02996, 117.76588], [39.04596, 117.75833], [39.04969, 117.76073], [39.04569, 117.77481], [39.06862, 117.77378], [39.07821, 117.74117], [39.05236, 117.73636], [39.04969, 117.74220], [39.02782, 117.73602], [39.02596, 117.74185], [38.98914, 117.72503]],
          desc: '以集装箱运输为主，兼顾件杂货、滚装汽车运输，是天津港集装箱作业核心港区。'
        },
        {
          name: '东疆港区',
          // 人工岛及以北岸段
          area: [[39.06782, 117.77515], [39.05822, 117.80571], [38.97446, 117.82871], [38.97553, 117.80674], [38.98674, 117.79060], [39.04516, 117.77515], [39.06755, 117.77584]],
          desc: '北方国际航运核心区功能载体，东疆保税港区所在地，兼具邮轮母港与集装箱装卸功能。'
        },
        {
          name: '南疆港区',
          // 海河以南自河口向东南延伸的散货作业带
          area: [[38.98727, 117.71576], [38.97099, 117.75764], [38.96325, 117.80743], [38.95791, 117.80811], [38.95337, 117.84382], [38.95150, 117.84382], [38.94483, 117.88467], [38.92747, 117.87952], [38.96111, 117.74288], [38.96832, 117.72331], [38.97713, 117.71473], [38.98674, 117.71542]],
          desc: '以煤炭、矿石、原油等大宗散货运输为主，是大秦铁路、朔黄铁路煤炭下水重要节点。'
        },
        {
          name: '大沽口港区',
          // 南疆以南临港经济区沿岸
          area: [[38.95738, 117.71885], [38.96031, 117.72537], [38.95230, 117.73842], [38.94456, 117.77035], [38.92934, 117.76382], [38.92613, 117.77927], [38.94002, 117.78374], [38.92907, 117.82219], [38.91411, 117.81532], [38.91224, 117.82494], [38.92587, 117.83215], [38.91732, 117.85721], [38.87991, 117.83215], [38.87270, 117.84519], [38.86655, 117.84107], [38.87777, 117.81910], [38.89007, 117.82700], [38.89728, 117.79953], [38.92240, 117.81052], [38.92720, 117.79026], [38.91438, 117.78236], [38.92240, 117.75009], [38.94002, 117.75387], [38.94723, 117.73464], [38.95738, 117.71851]],
          desc: '临港经济区配套港区，以散杂货、钢材等运输为主，服务临港产业发展。'
        },
        {
          name: '高沙岭港区',
          // 独流减河以北沿岸
          area: [[38.89808, 117.67593], [38.89621, 117.68383], [38.89060, 117.68177], [38.87350, 117.75215], [38.86842, 117.75387], [38.85612, 117.74769], [38.87029, 117.68932], [38.84543, 117.67971], [38.85131, 117.65739], [38.89755, 117.67525]],
          desc: '以通用散杂货运输为主，兼顾滚装运输，服务南港工业区及周边装备制造产业。'
        },
        {
          name: '大港港区',
          // 独流减河以南沿岸块（北）
          area: [[38.75258, 117.70615], [38.75178, 117.72057], [38.73464, 117.71782], [38.73437, 117.70924], [38.72205, 117.70889], [38.72259, 117.70580], [38.75285, 117.70546]],
          desc: '以石油化工、散杂货运输为主，是天津港南翼综合性港区。'
        },
        {
          name: '大港港区',
          // 独流减河以南沿岸块（南，含南港工业区）
          area: [[38.75794, 117.64297], [38.75767, 117.68761], [38.72794, 117.68761], [38.72928, 117.67868], [38.75071, 117.67971], [38.75071, 117.63783], [38.74375, 117.63027], [38.70946, 117.62787], [38.70973, 117.61070], [38.71134, 117.60384], [38.75231, 117.60384], [38.75660, 117.57877], [38.76115, 117.58152], [38.75820, 117.60246], [38.75820, 117.60830], [38.71402, 117.60864], [38.71402, 117.62444], [38.74482, 117.62512], [38.75794, 117.64332]],
          desc: '以石油化工、散杂货运输为主，是天津港南翼综合性港区。'
        },
        {
          name: '北塘港区',
          // 永定新河口以北至中心渔港岸段
          area: [[39.08514, 117.77859], [39.07448, 117.80914], [39.08221, 117.81361], [39.09287, 117.78099], [39.08541, 117.77790]],
          desc: '永定新河口以北作业区，含中心渔港，以物资中转、渔业及旅游客运功能为主。'
        }
      ],
      // 主要码头位置（锚点 + 常显名称；坐标为实地调节后固化）
      berths: [
        {
          name: '天津港集装箱码头',
          // 北疆港区前缘集装箱泊位带（五洲国际、太平洋国际等）
          area: [[39.01145, 117.76554]],
          note: '天津港集装箱码头群（五洲国际、太平洋国际等），可靠泊20万吨级集装箱船舶，年吞吐能力超千万标箱'
        },
        {
          name: '天津港邮轮母港',
          // 东疆港区东端邮轮泊位
          area: [[38.97809, 117.81464]],
          note: '天津国际邮轮母港，北方最大邮轮母港，可靠泊世界大型豪华邮轮'
        },
        {
          name: '天津港矿石码头',
          // 南疆港区散货泊位带（远航国际矿石码头）
          area: [[38.94686, 117.85137]],
          note: '远航国际矿石码头，20万吨级专业化矿石泊位，服务首钢、河钢等钢厂原料进口'
        }
      ],
      // 铁路站点（蓝色图标，常显名称；坐标为实地放置/拖动后固化）
      stations: [
        { name: '塘沽新港站', area: [[38.98529965477937, 117.76382446289064]], note: '铁路站点' },
        { name: '东大沽站', area: [[38.97223498157296, 117.66550540924074]], note: '铁路站点' }
      ]
    }
  };

  // 动态加载 Leaflet：本地 vendor 文件优先（离线可用、不受预览环境外部请求限制影响），
  // 缺失或失败时按 jsdelivr → unpkg → bootcdn → npmmirror 顺序逐个兜底，加载完成后执行回调
  var pmWaiters = [];
  var pmLoading = false;
  function loadLeaflet(cb) {
    if (window.L) { cb(); return; }
    pmWaiters.push(cb);
    if (pmLoading) return;
    pmLoading = true;

    var cssList = [
      '/vendor/leaflet/leaflet.min.css',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.min.css',
      'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.css',
      'https://registry.npmmirror.com/leaflet@1.9.4/files/dist/leaflet.min.css'
    ];
    var jsList = [
      '/vendor/leaflet/leaflet.min.js',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.min.js',
      'https://cdn.bootcdn.net/ajax/libs/leaflet/1.9.4/leaflet.min.js',
      'https://registry.npmmirror.com/leaflet@1.9.4/files/dist/leaflet.min.js'
    ];

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    var li = 0;
    link.onerror = function () { li += 1; if (li < cssList.length) link.href = cssList[li]; };
    link.href = cssList[0];
    document.head.appendChild(link);

    var script = document.createElement('script');
    var si = 0;
    script.onload = function () {
      pmWaiters.forEach(function (w) { w(); });
      pmWaiters = [];
    };
    script.onerror = function () {
      si += 1;
      if (si < jsList.length) {
        script.src = jsList[si];
      } else {
        pmLoading = false;
        var box = document.getElementById('portMap');
        if (box) box.innerHTML = '<div class="pm-error">地图组件加载失败，请检查网络后刷新重试</div>';
      }
    };
    script.src = jsList[0];
    document.head.appendChild(script);
  }

  var pmInstance = null;
  var pmPendingData = null;   // 待初始化的俯瞰图数据（首次切到地图视图时初始化）
  var pmPendingPort = null;   // 待初始化的港口名（可编辑港口的自绘数据按港口持久化）
  var pmInitedFor = null;     // 已初始化的地图容器元素（重渲染后重新初始化）

  // 可编辑港口的自绘数据持久化：{ [港口名]: { added: [{name,desc,area}], removed: [基础区域索引], berthPos: { 码头/站点名: [lat,lng] } } }
  var PM_CUSTOM_KEY = 'hz_port_map_custom';
  function pmCustomAll() {
    try { return JSON.parse(localStorage.getItem(PM_CUSTOM_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function pmCustomSave(all) {
    try { localStorage.setItem(PM_CUSTOM_KEY, JSON.stringify(all)); } catch (e) { /* 忽略存储异常 */ }
  }

  // 火车站点徽标：蓝色圆 + 白环 + 标准火车头图标（Material Design 官方 train 图标，与高德地图样式一致）
  var PM_STATION_ICON = '<svg width="22" height="22" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="17" cy="17" r="15.4" fill="#2E6BE6" stroke="#fff" stroke-width="2.8"/>'
    + '<g transform="translate(5.5,5.5)">'
    + '<path fill="#fff" d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2H18v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>'
    + '</g></svg>';

  function initPortMap(mapData, portName) {
    var box = document.getElementById('portMap');
    if (!box) return;
    loadLeaflet(function () {
      box = document.getElementById('portMap');
      if (!box) return;
      if (pmInstance) { pmInstance.remove(); pmInstance = null; }   // 重渲染时先销毁旧实例

      var editable = !!mapData.editable;   // 仅配置了 editable 的港口开放绘制与拖动
      var map = L.map(box, { scrollWheelZoom: false, attributionControl: true });
      pmInstance = map;
      box._pmMap = map;   // 容器上挂载实例引用（调试/扩展用）
      map.setView(mapData.center, mapData.zoom);

      // 卫星影像：ArcGIS 世界影像为主源；连续加载失败（网络受限）时自动切换高德卫星瓦片兜底，
      // 高德源为 GCJ-02 坐标，与 WGS84 标注存在数百米偏差，仅作降级显示；两源均失败时给出提示
      function pmImageryTip(text) {
        var b = document.getElementById('portMap');
        if (b && !b.querySelector('.pm-imagery-tip')) {
          var t = document.createElement('div');
          t.className = 'pm-imagery-tip';
          t.textContent = text;
          b.appendChild(t);
        }
      }
      var pmImagery = [
        { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attr: '影像 © Esri — Source: Esri, Maxar, Earthstar Geographics' },
        { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
          attr: '影像 © 高德地图（兜底源，标注可能存在数百米偏差）' }
      ];
      var pmImgIdx = 0;
      var pmTileErr = 0;
      var baseLayer = L.tileLayer(pmImagery[0].url, {
        maxZoom: 18,
        attribution: pmImagery[0].attr,
        subdomains: ['1', '2', '3', '4']
      }).addTo(map);
      baseLayer.on('tileerror', function () {
        pmTileErr += 1;
        if (pmImgIdx === 0 && pmTileErr >= 3) {
          pmImgIdx = 1;
          pmTileErr = 0;
          map.removeLayer(baseLayer);
          baseLayer = L.tileLayer(pmImagery[1].url, {
            maxZoom: 18,
            attribution: pmImagery[1].attr,
            subdomains: ['1', '2', '3', '4']
          }).addTo(map);
          baseLayer.on('tileerror', function () {
            pmTileErr += 1;
            if (pmTileErr === 6) pmImageryTip('卫星影像加载失败，港区边界标注仍可正常查看');
          });
        }
      });

      var zoneLayer = L.layerGroup().addTo(map);
      var berthLayer = L.layerGroup().addTo(map);

      // ===== 港区区域：基础数据 + 自绘数据合并（只读模式仍加载已保存数据，仅展示不可改） =====
      var cst = portName ? (pmCustomAll()[portName] || {}) : {};
      cst.added = cst.added || [];           // 自绘港区区域
      cst.removed = cst.removed || [];       // 被删除的基础区域索引
      cst.berthPos = cst.berthPos || {};     // 码头/站点拖动位置 { 名称: [lat,lng] }

      function saveCustom() {
        if (!editable || !portName) return;
        var all = pmCustomAll();
        all[portName] = cst;
        pmCustomSave(all);
      }

      function zoneShape(z, kind, idx) {
        var tools = '';
        if (editable) {
          tools = '<div style="margin-top:6px;text-align:right;">'
            + (kind === 'custom' ? '<button class="pm-del-zone" data-rename-zone="' + idx + '">重命名</button>&nbsp;' : '')
            + '<button class="pm-del-zone" data-kind="' + kind + '" data-idx="' + idx + '">删除该区域</button></div>';
        }
        return L.polygon(z.area, {
          color: '#2F7BFF', weight: 2, dashArray: '7 5',
          fillColor: '#2F7BFF', fillOpacity: 0.10
        })
          .bindTooltip('⚓ ' + z.name, { permanent: true, direction: 'center', className: 'pm-zone-label' })
          .bindPopup('<b>' + esc(z.name) + '</b><br>' + esc(z.desc || '自绘区域') + tools);
      }

      function drawZones() {
        zoneLayer.clearLayers();
        mapData.zones.forEach(function (z, i) {
          if (cst.removed.indexOf(i) < 0) zoneLayer.addLayer(zoneShape(z, 'base', i));
        });
        cst.added.forEach(function (z, j) {
          zoneLayer.addLayer(zoneShape(z, 'custom', j));
        });
      }

      drawZones();

      // popup 内「重命名」（仅自绘区域）与「删除该区域」
      map.on('popupopen', function (e) {
        var el = e.popup.getElement();
        if (!el) return;
        var rbtn = el.querySelector('[data-rename-zone]');
        if (rbtn) {
          rbtn.onclick = function () {
            var j = parseInt(rbtn.getAttribute('data-rename-zone'), 10);
            var cur = cst.added[j];
            if (!cur) return;
            openModal('重命名港区区域',
              '<div class="form-row"><label>港区名称</label><input id="pm-zone-rename" value="' + esc(cur.name) + '"></div>'
              + '<div class="form-row"><label>功能说明</label><input id="pm-zone-redesc" value="' + esc(cur.desc || '') + '"></div>',
              function () {
                var name = document.getElementById('pm-zone-rename').value.trim();
                if (!name) { toast('名称不能为空'); return false; }
                cur.name = name;
                cur.desc = document.getElementById('pm-zone-redesc').value.trim();
                saveCustom();
                drawZones();
                toast('已保存');
              });
          };
        }
        var btn = el.querySelector('.pm-del-zone[data-kind]');
        if (!btn) return;
        btn.onclick = function () {
          var kind = btn.getAttribute('data-kind');
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (kind === 'base') {
            if (cst.removed.indexOf(idx) < 0) cst.removed.push(idx);
          } else {
            cst.added.splice(idx, 1);
          }
          saveCustom();
          map.closePopup();
          drawZones();
        };
      });

      // ===== 码头：锚点标记 + 常显名称（可编辑港口锚点可拖动调节位置） =====
      function berthMarker(b) {
        var lat = 0, lon = 0;
        b.area.forEach(function (pt) { lat += pt[0]; lon += pt[1]; });
        var n = b.area.length;
        var pos = (cst.berthPos && cst.berthPos[b.name]) || [lat / n, lon / n];
        var mk = L.marker(pos, {
          draggable: editable,
          icon: L.divIcon({ className: 'pm-berth-pin', html: '<span>⚓</span>', iconSize: [22, 22], iconAnchor: [11, 11] })
        });
        if (editable) {
          mk.on('dragend', function () {
            var ll = mk.getLatLng();
            cst.berthPos = cst.berthPos || {};
            cst.berthPos[b.name] = [ll.lat, ll.lng];
            saveCustom();
            toast('已保存「' + b.name + '」位置');
          });
        }
        var resetBtn = editable && cst.berthPos && cst.berthPos[b.name]
          ? '<div style="margin-top:6px;text-align:right;"><button class="pm-del-zone" data-reset-berth="' + esc(b.name) + '">重置位置</button></div>'
          : '';
        mk.bindTooltip(b.name, { permanent: true, direction: 'right', offset: [10, 0], className: 'pm-berth-label' })
          .bindPopup('<b>' + esc(b.name) + '</b><br>' + esc(b.note || '自定义站点') + resetBtn);
        return mk;
      }

      // ===== 铁路站点：蓝色圆钉图标 + 名称标签置于右侧（数据写死；可编辑港口锚点可拖动调节位置） =====
      function stationMarker(b) {
        var pos = (cst.berthPos && cst.berthPos[b.name]) || [b.area[0][0], b.area[0][1]];
        var mk = L.marker(pos, {
          draggable: editable,
          icon: L.divIcon({ className: 'pm-station-pin', html: PM_STATION_ICON, iconSize: [22, 22], iconAnchor: [11, 11] })
        });
        if (editable) {
          mk.on('dragend', function () {
            var ll = mk.getLatLng();
            cst.berthPos[b.name] = [ll.lat, ll.lng];
            saveCustom();
            toast('已保存「' + b.name + '」位置');
          });
        }
        var resetBtn = editable && cst.berthPos && cst.berthPos[b.name]
          ? '<div style="margin-top:6px;text-align:right;"><button class="pm-del-zone" data-reset-berth="' + esc(b.name) + '">重置位置</button></div>'
          : '';
        mk.bindTooltip(b.name, { permanent: true, direction: 'right', offset: [10, 0], className: 'pm-station-label' })
          .bindPopup('<b>' + esc(b.name) + '</b><br>' + esc(b.note || '铁路站点') + resetBtn);
        return mk;
      }

      function drawBerths() {
        berthLayer.clearLayers();
        mapData.berths.forEach(function (b) { berthLayer.addLayer(berthMarker(b)); });
        (mapData.stations || []).forEach(function (b) { berthLayer.addLayer(stationMarker(b)); });
      }

      drawBerths();

      // popup 内「重置位置」（码头/站点锚点恢复写死的默认位置）
      map.on('popupopen', function (e) {
        var el = e.popup.getElement();
        if (!el) return;
        var rbtn = el.querySelector('[data-reset-berth]');
        if (rbtn) {
          rbtn.onclick = function () {
            var name = rbtn.getAttribute('data-reset-berth');
            delete cst.berthPos[name];
            saveCustom();
            map.closePopup();
            drawBerths();
          };
        }
      });

      // ===== 自绘港区区域：仅可编辑港口开放（单击取点 → 完成/双击闭合 → 自动保存） =====
      var bar = editable && box.parentElement.querySelector('.pm-draw-bar');
      if (!bar) return;
      var bStart = bar.querySelector('[data-pm="start"]');
      var bDone = bar.querySelector('[data-pm="done"]');
      var bCancel = bar.querySelector('[data-pm="cancel"]');
      var tip = bar.querySelector('.pm-draw-tip');
      var drawing = false, pts = [], prevLine = null, prevDots = [];

      function clearPreview() {
        if (prevLine) { map.removeLayer(prevLine); prevLine = null; }
        prevDots.forEach(function (d) { map.removeLayer(d); });
        prevDots = [];
      }

      function preview() {
        clearPreview();
        pts.forEach(function (p) {
          prevDots.push(L.circleMarker(p, { radius: 3, color: '#2F7BFF', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map));
        });
        if (pts.length >= 2) {
          prevLine = L.polyline(pts, { color: '#2F7BFF', weight: 2, dashArray: '5 5' }).addTo(map);
        }
        bDone.disabled = pts.length < 3;
      }

      // 模式切换：'zone' 绘制港区 / null 退出编辑
      function setMode(mode) {
        drawing = mode === 'zone';
        bStart.style.display = drawing ? 'none' : '';
        bDone.style.display = drawing ? '' : 'none';
        bCancel.style.display = drawing ? '' : 'none';
        tip.style.display = drawing ? '' : 'none';
        tip.textContent = '单击地图依次添加顶点（至少 3 个），双击或点「完成」结束';
        box.classList.toggle('pm-drawing', drawing);
        if (drawing) { map.doubleClickZoom.disable(); }
        else {
          map.doubleClickZoom.enable();
          pts = [];
          clearPreview();
        }
        bDone.disabled = pts.length < 3;
      }

      function finishDraw() {
        if (pts.length < 3) return;
        var area = pts.slice();
        setMode(null);
        // 自动保存：自动命名，不打断操作
        var name = '自绘区域 ' + (cst.added.length + 1);
        cst.added.push({ name: name, desc: '自绘区域', area: area });
        saveCustom();
        drawZones();
        toast('已保存「' + name + '」（点击区域可重命名）');
      }

      map.on('click', function (e) {
        if (!drawing) return;
        pts.push([e.latlng.lat, e.latlng.lng]);
        preview();
      });
      map.on('dblclick', function () {
        if (!drawing) return;
        // 双击会附带两次 click，若末两点几乎重合则去掉重复点
        if (pts.length >= 4) {
          var a = pts[pts.length - 1], b = pts[pts.length - 2];
          if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
        }
        finishDraw();
      });

      bStart.onclick = function () { setMode('zone'); };
      bCancel.onclick = function () { setMode(null); };
      bDone.onclick = finishDraw;
    });
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
  function findPort(id) {
    for (var i = 0; i < ports.length; i++) {
      if (ports[i].id === id) return ports[i];
    }
    return null;
  }

  function editKV(key, title) {
    var p = findPort(new URLSearchParams(location.search).get('id'));
    if (!p) return;
    p[key] = p[key] || [];
    var body = '<div id="f-kv-rows">' + p[key].map(kvRowHTML).join('') + '</div>'
      + '<button class="form-add" id="f-kv-add">＋ 添加字段</button>';
    openModal(title, body, function () {
      var rows = [];
      document.querySelectorAll('#f-kv-rows .form-kv-row').forEach(function (row) {
        var label = row.querySelector('.f-label').value.trim();
        var value = row.querySelector('.f-value').value.trim();
        if (label || value) rows.push({ label: label, value: value });
      });
      p[key] = rows;
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

  function editZones() {
    var p = findPort(new URLSearchParams(location.search).get('id'));
    if (!p) return;
    p.zones = p.zones || [];
    function zoneRow(z) {
      return '<div class="form-zone-row" style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-bottom:10px;">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">'
        + '<input class="z-name" placeholder="港区名称" value="' + esc(z.name) + '">'
        + '<input class="z-loc" placeholder="位置" value="' + esc(z.location) + '"></div>'
        + '<input class="z-pos" placeholder="功能定位" value="' + esc(z.positioning) + '" style="width:100%;margin-bottom:6px;">'
        + '<input class="z-fac" placeholder="主要设施" value="' + esc(z.facilities) + '" style="width:100%;">'
        + '<button class="row-del" style="border:none;background:transparent;color:var(--color-danger);cursor:pointer;font-size:12px;padding:4px 0 0;">✕ 删除该港区</button>'
        + '</div>';
    }
    var body = '<div id="f-zone-rows">' + p.zones.map(zoneRow).join('') + '</div>'
      + '<button class="form-add" id="f-zone-add">＋ 添加港区</button>';
    openModal('编辑港区分部', body, function () {
      var rows = [];
      document.querySelectorAll('#f-zone-rows .form-zone-row').forEach(function (row) {
        var name = row.querySelector('.z-name').value.trim();
        if (!name) return;
        rows.push({
          name: name,
          location: row.querySelector('.z-loc').value.trim(),
          positioning: row.querySelector('.z-pos').value.trim(),
          facilities: row.querySelector('.z-fac').value.trim()
        });
      });
      p.zones = rows;
      saveData();
      renderDetail();
      toast('港区分部已更新');
    });
    bindRowRemove($('#f-zone-rows'));
    $('#f-zone-add').onclick = function () {
      $('#f-zone-rows').insertAdjacentHTML('beforeend',
        zoneRow({ name: '', location: '', positioning: '', facilities: '' }));
      bindRowRemove($('#f-zone-rows'));
    };
  }

  // ============================================================
  // 列表模式：ports.html
  // ============================================================
  var tbody = document.querySelector('.ledger-table tbody');
  var applyFilter = null;

  // 由港口对象构造表格行
  function renderRow(p) {
    var tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.dataset.name = p.name || '';
    tr.dataset.location = kvGet(p.basicInfo, '所属地区') || p.subtitle || '';

    var throughput = metricOf(p.metrics, '年吞吐量');
    var berth = metricOf(p.metrics, '泊位数量');

    tr.innerHTML = [
      '<td class="col-index"></td>',
      '<td class="col-name"><a class="port-link" href="/ports/ports-detail.html?id=' + encodeURIComponent(p.id) + '">' +
        esc(p.name) + '</a></td>',
      '<td class="col-loc">' + (esc(tr.dataset.location) || '—') + '</td>',
      '<td class="col-throughput">' + (throughput ? esc(throughput.value) + (throughput.unit ? esc(throughput.unit) : '') : '—') + '</td>',
      '<td class="col-berth">' + (berth ? esc(berth.value) + (berth.unit ? ' ' + esc(berth.unit) : '') : '—') + '</td>',
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
    ports.forEach(function (p) { tbody.appendChild(renderRow(p)); });

    // 重新编号（按当前展示顺序）
    var i = 0;
    tbody.querySelectorAll('tr:not(.empty-row)').forEach(function (row) {
      row.querySelector('.col-index').textContent = ++i;
    });

    $('#portCount').textContent = ports.length;
    var emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.hidden = ports.length > 0;
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

  // ===== 新增 / 编辑 / 删除港口 =====
  function addPort() {
    var body = '<div class="form-row"><label>港口名称</label><input id="f-new-name" placeholder="如：青岛港"></div>'
      + '<div class="form-row"><label>副标题（所属地区）</label><input id="f-new-sub" placeholder="如：山东省青岛市·胶州湾"></div>'
      + '<div class="form-row"><label>港口简介</label><input id="f-new-intro" placeholder="一句话介绍该港口"></div>';
    openModal('新增港口', body, function () {
      var name = $('#f-new-name').value.trim();
      if (!name) { toast('港口名称不能为空'); return false; }
      ports.push({
        id: uid('port'),
        name: name,
        subtitle: $('#f-new-sub').value.trim(),
        intro: $('#f-new-intro').value.trim(),
        photo: '',
        metrics: [
          { label: '年吞吐量', value: '—', unit: '' },
          { label: '年设计通过能力', value: '—', unit: '' },
          { label: '泊位数量', value: '—', unit: '' },
          { label: '最大泊位吨级', value: '—', unit: '' }
        ],
        basicInfo: [
          { label: '港口名称', value: name },
          { label: '所属地区', value: $('#f-new-sub').value.trim() },
          { label: '主营业务货类', value: '' }
        ],
        capacity: [],
        zones: []
      });
      saveData();
      renderAll();
      toast('已新增「' + name + '」，点击名称进入详情补充信息');
    });
  }

  function editPort(id) {
    var p = findPort(id);
    if (!p) return;
    var body = '<div class="form-row"><label>港口名称</label><input id="f-edit-name" value="' + esc(p.name) + '"></div>'
      + '<div class="form-row"><label>副标题（所属地区）</label><input id="f-edit-sub" value="' + esc(p.subtitle) + '"></div>'
      + '<div class="form-row"><label>港口简介</label><input id="f-edit-intro" value="' + esc(p.intro) + '"></div>';
    openModal('编辑港口', body, function () {
      var name = $('#f-edit-name').value.trim();
      if (!name) { toast('港口名称不能为空'); return false; }
      p.name = name;
      p.subtitle = $('#f-edit-sub').value.trim();
      p.intro = $('#f-edit-intro').value.trim();
      // 同步基本信息中的名称 / 所属地区
      if (p.basicInfo) {
        p.basicInfo.forEach(function (r) {
          if (r.label === '港口名称') r.value = name;
          if (r.label === '所属地区') r.value = p.subtitle;
        });
      }
      saveData();
      renderAll();
      toast('已保存');
    });
  }

  function deletePort(id) {
    var p = findPort(id);
    if (!p) return;
    var body = '<p style="font-size:14px;color:var(--gray-700);">确定删除「<b>' + esc(p.name)
      + '</b>」？删除后无法恢复。</p>';
    openModal('删除港口', body, function () {
      ports = ports.filter(function (x) { return x.id !== id; });
      saveData();
      renderAll();
      toast('已删除「' + p.name + '」');
    });
  }

  // ===== 表格操作（事件委托） =====
  function initTableActions() {
    tbody.addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;

      // 详情：表格内统一入口（名称链接与详情按钮）
      if (e.target.closest('.row-act.detail')) {
        location.href = '/ports/ports-detail.html?id=' + encodeURIComponent(row.dataset.id);
        return;
      }
      if (e.target.closest('.row-act.edit')) { editPort(row.dataset.id); return; }
      if (e.target.closest('.row-act.del')) { deletePort(row.dataset.id); return; }
    });
  }

  // ===== 导出 Excel：导出当前筛选结果 =====
  function initExport() {
    var btn = $('#exportBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (!ports.length) { alert('暂无港口数据可导出'); return; }
      if (!window.XLSX) { alert('导出组件加载失败，请刷新页面后重试'); return; }

      // 导出当前筛选结果：仅排除被检索过滤的行（data-filtered），包含分页未展示的行
      var visibleIds = [];
      tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
        if (!row.dataset.filtered) visibleIds.push(row.dataset.id);
      });
      var list = ports.filter(function (p) { return visibleIds.includes(p.id); });

      if (!list.length) { alert('当前筛选条件下暂无可导出的港口数据'); return; }
      if (!confirm('将导出当前筛选结果 ' + list.length + ' 个港口，是否继续？')) return;

      var headers = [
        '序号', '港口名称', '所属地区', '年吞吐量', '年设计通过能力',
        '泊位数量', '最大泊位吨级', '主营业务货类', '集疏港铁路', '集疏港公路', '港区数量', '港口简介'
      ];

      var rows = list.map(function (p, i) {
        var t = metricOf(p.metrics, '年吞吐量') || {};
        var d = metricOf(p.metrics, '年设计通过能力') || {};
        var b = metricOf(p.metrics, '泊位数量') || {};
        var m = metricOf(p.metrics, '最大泊位吨级') || {};
        return [
          i + 1, p.name,
          kvGet(p.basicInfo, '所属地区') || p.subtitle,
          t.value || '', d.value || '',
          b.value || '', m.value || '',
          kvGet(p.basicInfo, '主营业务货类'),
          kvGet(p.capacity, '集疏港铁路'),
          kvGet(p.capacity, '集疏港公路'),
          p.zones ? p.zones.length : 0,
          p.intro || ''
        ];
      });

      var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
      ws['!cols'] = [
        { wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 20 },
        { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 34 }, { wch: 40 }, { wch: 10 }, { wch: 50 }
      ];

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '港口台账');

      var dt = new Date();
      var stamp = dt.getFullYear() +
        String(dt.getMonth() + 1).padStart(2, '0') +
        String(dt.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, '港口台账_' + stamp + '.xlsx');
    });
  }

  // ===== 初始化 =====
  loadData();

  // 港区分部视图切换：港区介绍 ⇄ 卫星俯瞰地图
  function switchZoneView(btn) {
    var scope = btn.closest('.zones-card');
    if (!scope) return;
    var mode = btn.getAttribute('data-zview');
    scope.querySelectorAll('.zv-tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
    var tv = scope.querySelector('.zone-view-table');
    var mv = scope.querySelector('.zone-view-map');
    if (mode === 'map') {
      if (tv) tv.style.display = 'none';
      if (mv) {
        mv.style.display = '';
        if (pmPendingData && pmInitedFor !== mv) {
          initPortMap(pmPendingData, pmPendingPort);   // 容器可见后再初始化，避免 0 尺寸
          pmInitedFor = mv;
        } else if (pmInstance) {
          pmInstance.invalidateSize();  // 再次显示时刷新尺寸
        }
      }
    } else {
      if (tv) tv.style.display = '';
      if (mv) mv.style.display = 'none';
    }
  }

  if (detailPanel) {
    // 详情模式
    renderDetail();

    $('#backBtn').addEventListener('click', function () {
      location.href = '/ports/ports.html';
    });

    document.addEventListener('click', function (e) {
      var zvBtn = e.target.closest('[data-zview]');
      if (zvBtn) { switchZoneView(zvBtn); return; }
      var editBtn = e.target.closest('[data-edit]');
      if (!editBtn) return;
      var key = editBtn.getAttribute('data-edit');
      if (key === 'basicInfo') editKV('basicInfo', '基本信息');
      else if (key === 'capacity') editKV('capacity', '集疏运体系');
      else if (key === 'zones') editZones();
    });
  } else {
    // 列表模式
    initSearch();
    initTableActions();
    initExport();
    bindPager();
    renderAll();
  }

  var addBtn = $('#btnAddPort');
  if (addBtn) addBtn.addEventListener('click', addPort);
  $('#modalMask').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // ===== 初始化 =====
  loadData();
  if (tbody) renderAll();   // 仅列表模式有台账表格；详情页（无 .ledger-table）跳过，避免空引用报错
})();
