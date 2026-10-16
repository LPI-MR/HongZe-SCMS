// ===== 港口信息管理模块脚本 =====
// 列表页（ports.html）：检索卡片 + 台账卡片（搜索 / 分页 / 导出 / 新增 / 编辑 / 删除）
// 详情页（ports-detail.html?id=xxx）：港口概览 + 指标 + 信息卡片 + 港区分部（✎ 编辑）
// 数据持久化：localStorage（hz_ports_data），{__version, list} 包装格式，版本不匹配自动回种子
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_ports_data';
  var VERSION = 'v12';
  var VERSION = 'v12';   // v12：新增港口现货参考数据（spotMarket 展示区块）

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

  // ===== 港口现货参考数据（静态展示数据，来源：中国矿产·中矿国链港口现货） =====
  // 缺测值（原表「–」）统一记为 null，展示为「–」；no 为原表序号（同序号=同船多品种）
  var SPOT_SEED = {
    source: '中国矿产·中矿国链港口现货',
    dataDate: '2026-05-25',
    rows: [
      { no: 1,  port: '京唐港', variety: '卡拉拉精粉',       fe: '62.33',  sio2: '12.06',  al2o3: '0.12',  p: '0.032', s: '0.067', mn: null,    moisture: '8.5',   vessel: 'SM SAMCHEONPO（三千浦）',   berth: '一公司' },
      { no: 2,  port: '黄骅港', variety: '米纳斯精粉',       fe: '66.92',  sio2: '2.8',    al2o3: '0.53',  p: '0.025', s: null,    mn: '0.03',  moisture: '8.7',   vessel: 'SHANDONG DREAM（山东梦想）', berth: '矿石2场940-990米、矿石700-740米，矿石11场' },
      { no: 3,  port: '黄骅港', variety: '卡拉拉精粉',       fe: '62.1',   sio2: '12.38',  al2o3: '0.2',   p: '0.03',  s: '0.036', mn: null,    moisture: '8.69',  vessel: 'JIN WEN FENG（锦文峰）',     berth: '' },
      { no: 4,  port: '青岛港', variety: 'KBH南非铁精粉',    fe: '62.45',  sio2: '2.16',   al2o3: '0.46',  p: '0.19',  s: '0.041', mn: null,    moisture: '6.54',  vessel: 'ANASTASIA（安纳斯塔西娅）',  berth: '重象口' },
      { no: 5,  port: '青岛港', variety: 'SFGB',             fe: '54.94',  sio2: '14.54',  al2o3: '2.11',  p: '0.068', s: null,    mn: '0.287', moisture: '8.3',   vessel: 'ORE ZHOUSHAN（矿石舟山）',   berth: '' },
      { no: 6,  port: '青岛港', variety: '塞拉利昂烧结精粉', fe: '61.22',  sio2: '6.27',   al2o3: '3.38',  p: '0.041', s: '0.005', mn: null,    moisture: '10.62', vessel: 'SEABREEZE（海洋清风）',       berth: '' },
      { no: 7,  port: '日照港', variety: 'KMG块',            fe: '51.66',  sio2: '22.51',  al2o3: '1.31',  p: '0.01',  s: '0.018', mn: null,    moisture: '2.07',  vessel: 'DEE4 OAK（橡树）',           berth: '' },
      { no: 8,  port: '日照港', variety: 'YGBZ块',           fe: '62.11',  sio2: '8.95',   al2o3: '0.86',  p: '0.03',  s: '0.01',  mn: null,    moisture: '1.31',  vessel: 'MALINDI（马林迪）',           berth: '' },
      { no: 9,  port: '日照港', variety: '塞拉利昂DSO粉',    fe: '55.21',  sio2: '3.07',   al2o3: '6.55',  p: '0.068', s: '0.004', mn: null,    moisture: '12.64', vessel: 'SAMC TRANSPORTER（海瀛撮运）', berth: '' },
      { no: 10, port: '岚山港', variety: '罗伊山NEXUS粉',    fe: '57.218', sio2: '7.378',  al2o3: '3.175', p: '0.047', s: '0.035', mn: null,    moisture: '9.89',  vessel: 'MV HUI ZHEN HAI（惠珍海）',   berth: '' },
      { no: 11, port: '岚山港', variety: 'LONS块',           fe: '49.5',   sio2: '18.46',  al2o3: '1.53',  p: '0.05',  s: null,    mn: '0.162', moisture: '4.5',   vessel: 'SHINE ON（照耀）',           berth: '装港指标' },
      { no: 11, port: '岚山港', variety: 'LONS筛后块',       fe: '49.72',  sio2: '17.652', al2o3: '1.62',  p: '0.0466', s: null,   mn: '0.148', moisture: '2.71',  vessel: 'SHINE ON（照耀）',           berth: '卸港CCIC' },
      { no: 11, port: '岚山港', variety: 'LONS筛后粉',       fe: '51.56',  sio2: '16.576', al2o3: '2.211', p: '0.0562', s: null,   mn: '0.254', moisture: '8.39',  vessel: 'SHINE ON（照耀）',           berth: '卸港CCIC' },
      { no: 12, port: '岚山港', variety: 'LONS块',           fe: '53.75',  sio2: '14.23',  al2o3: '1.97',  p: '0.059', s: null,    mn: '0.215', moisture: '4.8',   vessel: 'PAN DREAM（潘梦）',           berth: '' },
      { no: 13, port: '岚山港', variety: 'KMG粉',            fe: '47.95',  sio2: '24.92',  al2o3: '2.63',  p: '0.01',  s: '0.012', mn: null,    moisture: '4.07',  vessel: 'GREAT LINK（大联）',           berth: '' },
      { no: 14, port: '连云港', variety: '卡拉拉精粉',       fe: '62.16',  sio2: '12.27',  al2o3: '0.1',   p: '0.028', s: '0.034', mn: null,    moisture: '8.08',  vessel: 'SIFNOS I（锡弗诺斯）',         berth: '' },
      { no: 15, port: '连云港', variety: 'LONS筛后块',       fe: '49.89',  sio2: '17.78',  al2o3: '1.95',  p: '0.066', s: null,    mn: '0.015', moisture: '0.54',  vessel: 'ALONA（阿罗那）',             berth: '卸港CCIC' },
      { no: 15, port: '连云港', variety: 'LONS筛后粉',       fe: '54.17',  sio2: '15.18',  al2o3: '2.29',  p: '0.08',  s: null,    mn: '0.015', moisture: '5.01',  vessel: 'ALONA（阿罗那）',             berth: '卸港CCIC' },
      { no: 16, port: '镇江港', variety: '罗伊山NEXUS粉',    fe: '57.218', sio2: '7.378',  al2o3: '3.175', p: '0.047', s: '0.035', mn: null,    moisture: '9.89',  vessel: 'MV HUI ZHEN HAI（惠珍海）',   berth: '' },
      { no: 17, port: '湛江港', variety: 'SFGB',             fe: '54.64',  sio2: '15.29',  al2o3: '2.18',  p: '0.065', s: null,    mn: '0.293', moisture: '8.6',   vessel: 'GRAND WISDOM（裕智）',         berth: '' }
    ]
  };

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

      // 港区分部（通栏）
      + zonesCard(p, p.zones);
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

  function zonesCard(p, rows) {
    var body = rows && rows.length
      ? '<thead><tr><th style="width:104px;">港区名称</th><th style="width:190px;">位置</th><th>功能定位</th><th style="width:32%;">主要设施</th></tr></thead>'
        + '<tbody>' + rows.map(function (z) {
          return '<tr><td class="zt-name">' + esc(z.name) + '</td>'
            + '<td>' + esc(z.location) + '</td>'
            + '<td>' + esc(z.positioning) + '</td>'
            + '<td>' + esc(z.facilities) + '</td></tr>';
        }).join('') + '</tbody>'
      : '<tbody><tr><td style="text-align:center;color:var(--gray-400);">暂无港区数据，点击右上角 ✎ 添加</td></tr></tbody>';
    return '<section class="card zones-card">'
      + '<div class="card-head"><div class="card-title">港区分部</div>'
      + '<button class="icon-btn" data-edit="zones" title="编辑">✎</button></div>'
      + '<table class="zone-table">' + body + '</table>'
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

  if (detailPanel) {
    // 详情模式
    renderDetail();

    $('#backBtn').addEventListener('click', function () {
      location.href = '/ports/ports.html';
    });

    document.addEventListener('click', function (e) {
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

  // ===== 港口现货区块（静态参考数据展示，独立于港口档案 Tab） =====
  var spotFilter = '全部';

  // 数值单元格：缺测（原表「–」）显示灰色占位
  function spotNumCell(v) {
    return (v === null || v === undefined || v === '')
      ? '<td class="spot-na">–</td>'
      : '<td class="spot-num">' + esc(v) + '</td>';
  }

  function renderSpotMarket() {
    var box = $('#spotSection');
    if (!box) return;

    // 按数据出现顺序提取港口清单，生成筛选胶囊
    var seen = {};
    var portList = [];
    SPOT_SEED.rows.forEach(function (r) {
      if (!seen[r.port]) { seen[r.port] = true; portList.push(r.port); }
    });
    var chips = ['全部'].concat(portList).map(function (p) {
      return '<button type="button" class="spot-chip' + (p === spotFilter ? ' active' : '') + '" data-spot="' + esc(p) + '">' + esc(p) + '</button>';
    }).join('');

    var rows = SPOT_SEED.rows.filter(function (r) {
      return spotFilter === '全部' || r.port === spotFilter;
    });

    var body = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      // 相邻同序号且同船名（一船多品种）行合并：序号与船名使用 rowspan，与原表层级一致
      var span = 1;
      while (i + span < rows.length && rows[i + span].no === r.no && rows[i + span].vessel === r.vessel) span++;
      var mergeOpen = (i === 0 || rows[i - 1].no !== r.no || rows[i - 1].vessel !== r.vessel);
      body += '<tr>'
        + (mergeOpen ? '<td class="spot-no"' + (span > 1 ? ' rowspan="' + span + '"' : '') + '>' + r.no + '</td>' : '')
        + '<td>' + esc(r.port) + '</td>'
        + '<td class="spot-variety">' + esc(r.variety) + '</td>'
        + spotNumCell(r.fe) + spotNumCell(r.sio2) + spotNumCell(r.al2o3)
        + spotNumCell(r.p) + spotNumCell(r.s) + spotNumCell(r.mn) + spotNumCell(r.moisture)
        + (mergeOpen ? '<td class="spot-vessel"' + (span > 1 ? ' rowspan="' + span + '"' : '') + '>' + esc(r.vessel) + '</td>' : '')
        + '<td class="spot-berth">' + esc(r.berth || '—') + '</td>'
        + '</tr>';
    }

    box.innerHTML =
      '<section class="card spot-card">'
      + '<div class="card-head"><div class="card-title">港口现货</div>'
      + '<div class="spot-meta">数据来源：' + esc(SPOT_SEED.source) + ' · 数据日期：' + esc(SPOT_SEED.dataDate) + ' · 共 ' + SPOT_SEED.rows.length + ' 条</div></div>'
      + '<div class="spot-chips">' + chips + '</div>'
      + '<div class="spot-table-wrap"><table class="zone-table spot-table">'
      + '<thead><tr><th style="width:44px;">序号</th><th style="width:76px;">港口</th><th>品种</th>'
      + '<th class="spot-th-num">Fe%</th><th class="spot-th-num">SiO₂%</th><th class="spot-th-num">Al₂O₃%</th>'
      + '<th class="spot-th-num">P%</th><th class="spot-th-num">S%</th><th class="spot-th-num">Mn%</th><th class="spot-th-num">水分%</th>'
      + '<th style="width:210px;">船名</th><th style="width:150px;">货位</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>'
      + '</section>';
  }

  // 现货筛选：仅过滤表格行，不刷新页面
  $('#spotSection').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-spot]');
    if (!chip) return;
    spotFilter = chip.getAttribute('data-spot');
    renderSpotMarket();
  });

  // ===== 初始化 =====
  loadData();
  renderAll();
  renderSpotMarket();
})();
