// ===== 汽运价格指数 —— LPI-MR 原设计版式合并实现 =====
// 《LPI-MR平台界面介绍（20260829）》原界面整体合并：指数总览 / 价格录入 / 历史数据 / 基础数据 四页签
// 数据口径（原设计约定）：
//   · 仅录入不含税价格，含税价 = 不含税 × 1.09 自动换算，禁止人工输入
//   · 价格指数：指数 = 当期价 / 基期价 × 100（基期取数据集最早一天）
//   · 依据来源：聊天截图/报价单/合同扫描件等图片，自动压缩存储（每条记录最多 9 张）
//   · 历史上传记录全部保留，可筛选查看，删除需确认
//   · 内置数据整体同步自 LPI-MR 原项目写死数据（31 条生产记录 + 真实依据截图，
//     截图位于 price-index/assets/seed/）；浏览器中的旧测试数据按版本号自动替换
// 登录环节按需求省略：无登录页、无权限校验，运营方（管理员）视角直接进入
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_truck_price_index';
  var VERSION = 'v4';              // 种子版本：v4 = LPI-MR 写死数据整体同步（31 条生产记录 + 真实截图）
  var TAX_RATE = 1.09;             // 含税换算系数
  var BASE_DATE = '2026-06-15';    // 价格指数基期（数据集最早一天 2026-06-15 = 100）
  var MAX_EVIDENCES = 9;           // 每条记录依据来源图片上限
  var UPLOADER = '系统管理员';      // 无登录环节，上传人固定为运营方

  // ===== 工具 =====
  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function parseDate(s) { return new Date(s.replace(/-/g, '/')); }

  function taxOf(p) { return Math.round(p * TAX_RATE * 100) / 100; }

  function round2(x) { return Math.round(x * 100) / 100; }

  // 相对时间：X 分钟前 / X 小时前 / X 天前
  function timeAgo(uploadedAt) {
    var t = parseDate(uploadedAt.replace(' ', 'T'));
    if (isNaN(t.getTime())) return '';
    var diff = Date.now() - t.getTime();
    if (diff < 0) diff = 0;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }

  // ===== 内置数据（自 LPI-MR 原项目写死数据整体同步，请勿随意改动） =====
  // 地点库（弹窗候选：热门/港口/目的地）
  var SEED_PLACES = {
    hot: ['黄骅港', '武安'],
    ports: ['曹妃甸港', '天津港', '黄骅港', '日照港', '董家口港', '岚山港', '岚桥港', '前港'],
    factories: ['武安', '涉县']
  };

  // 货物种类（弹窗候选：热门/全部）
  var SEED_GOODS = {
    hot: ['铁矿石'],
    all: ['铁矿石', '钢铁']
  };

  // 价格记录：与 LPI-MR 原项目 src/data/seed-records.ts 完全一致（31 条生产记录，
  // 2026-06-15 ~ 2026-09-18，全部为黄骅港→武安），依据截图同步自 src/assets/seed/
  // → price-index/assets/seed/；上传时间为原系统北京时间。
  var SEED_EV = 'assets/seed/';
  var SEED_RECORDS = [
    { id: 'pr-mtji3mce-v16wl', dataDate: '2026-06-15', goods: '钢铁', from: '黄骅港', to: '武安', price: 74.41, remark: '', evidences: [SEED_EV + 'pr-mtji3mce-v16wl-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 10:52' },
    { id: 'pr-mtkz3j0y-2287x', dataDate: '2026-07-08', goods: '铁矿石', from: '黄骅港', to: '武安', price: 77.68, remark: '万合报价', evidences: [SEED_EV + 'pr-mtkz3j0y-2287x-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 11:36' },
    { id: 'pr-mtjj8ara-efc3m', dataDate: '2026-08-17', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260817普阳报价（罗伊山MB粉）', evidences: [SEED_EV + 'pr-mtjj8ara-efc3m-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:24' },
    { id: 'pr-seed-3', dataDate: '2026-08-20', goods: '铁矿石', from: '黄骅港', to: '武安', price: 72.48, remark: '', evidences: [SEED_EV + 'pr-seed-3.png'], uploader: '系统管理员', uploadedAt: '2026-08-30 15:46' },
    { id: 'pr-mtkz5llw-ks9c0', dataDate: '2026-08-20', goods: '铁矿石', from: '黄骅港', to: '武安', price: 72.48, remark: '黄骅港系统价格（澳粉-麦克粉）', evidences: [SEED_EV + 'pr-mtkz5llw-ks9c0-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 11:37' },
    { id: 'pr-mtjjb92l-yjl5p', dataDate: '2026-08-21', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260821普阳报价（PMI粉）', evidences: [SEED_EV + 'pr-mtjjb92l-yjl5p-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:26' },
    { id: 'pr-mtjjc5ei-aschq', dataDate: '2026-08-21', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260821普阳报价（罗伊山MB粉）', evidences: [SEED_EV + 'pr-mtjjc5ei-aschq-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:27' },
    { id: 'pr-mtjjdaul-rw563', dataDate: '2026-08-21', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260821普阳报价（印度粉）', evidences: [SEED_EV + 'pr-mtjjdaul-rw563-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:28' },
    { id: 'pr-mtkza02o-36o7l', dataDate: '2026-08-22', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.92, remark: '金布巴粉（黄骅港系统2026135-11）', evidences: [SEED_EV + 'pr-mtkza02o-36o7l-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 11:41' },
    { id: 'pr-mtkzaxst-5ujhl', dataDate: '2026-08-22', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.92, remark: '金布巴粉（黄骅港系统2025190-80）', evidences: [SEED_EV + 'pr-mtkzaxst-5ujhl-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 11:41' },
    { id: 'pr-mtkzc5it-6zxgq', dataDate: '2026-08-22', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.92, remark: '金布巴粉（黄骅港系统2026080-59）', evidences: [SEED_EV + 'pr-mtkzc5it-6zxgq-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 11:42' },
    { id: 'pr-mtjjff5r-xuzxo', dataDate: '2026-08-24', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260824普阳报价（罗伊山MB粉）', evidences: [SEED_EV + 'pr-mtjjff5r-xuzxo-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:29' },
    { id: 'pr-seed-4', dataDate: '2026-08-27', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '', evidences: [SEED_EV + 'pr-seed-4.png'], uploader: '系统管理员', uploadedAt: '2026-08-30 15:48' },
    { id: 'pr-mtjjkhcu-te8wy', dataDate: '2026-08-29', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260829普阳报价（混合粉）', evidences: [SEED_EV + 'pr-mtjjkhcu-te8wy-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:33' },
    { id: 'pr-mtl8lu9w-8v34s', dataDate: '2026-08-29', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价（南非粉）', evidences: [SEED_EV + 'pr-mtl8lu9w-8v34s-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 16:02' },
    { id: 'pr-mtl8orca-1w0as', dataDate: '2026-08-29', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港报价（澳粉-麦克粉）', evidences: [SEED_EV + 'pr-mtl8orca-1w0as-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 16:04' },
    { id: 'pr-mtl8q7i5-if9bs', dataDate: '2026-08-29', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价（澳粉-麦克粉）', evidences: [SEED_EV + 'pr-mtl8q7i5-if9bs-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 16:05' },
    { id: 'pr-mtl6a6kf-8wn3d', dataDate: '2026-08-30', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '普阳报价（卡拉拉精粉）', evidences: [SEED_EV + 'pr-mtl6a6kf-8wn3d-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 14:57' },
    { id: 'pr-mtjjtide-fcogt', dataDate: '2026-09-01', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73, remark: '20260901普阳报价（铁矿粉）', evidences: [SEED_EV + 'pr-mtjjtide-fcogt-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-02 11:40' },
    { id: 'pr-mtl8s774-qx2r1', dataDate: '2026-09-02', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港报价（南非粉）', evidences: [SEED_EV + 'pr-mtl8s774-qx2r1-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-03 16:07' },
    { id: 'pr-mtsc9ezt-0y4v4', dataDate: '2026-09-06', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价', evidences: [SEED_EV + 'pr-mtsc9ezt-0y4v4-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-08 15:19' },
    { id: 'pr-mtsceh1v-93sv1', dataDate: '2026-09-06', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-澳粉（麦克粉）', evidences: [SEED_EV + 'pr-mtsceh1v-93sv1-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-08 15:23' },
    { id: 'pr-mtscf2oq-6ca7z', dataDate: '2026-09-07', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-mtscf2oq-6ca7z-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-08 15:23' },
    { id: 'pr-mu0xdfp4-1hik8', dataDate: '2026-09-11', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-mu0xdfp4-1hik8-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-14 15:32' },
    { id: 'pr-mu0xdxdo-8t9j2', dataDate: '2026-09-13', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-澳粉', evidences: [SEED_EV + 'pr-mu0xdxdo-8t9j2-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-14 15:32' },
    { id: 'pr-mu0xeewy-0ln1b', dataDate: '2026-09-13', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-澳粉', evidences: [SEED_EV + 'pr-mu0xeewy-0ln1b-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-14 15:33' },
    { id: 'pr-mu0xeumx-srntv', dataDate: '2026-09-14', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-mu0xeumx-srntv-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-14 15:33' },
    { id: 'pr-muapcowh-oshca', dataDate: '2026-09-16', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-muapcowh-oshca-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-21 11:45' },
    { id: 'pr-muapdeld-kq0ji', dataDate: '2026-09-17', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-澳粉（麦克粉）', evidences: [SEED_EV + 'pr-muapdeld-kq0ji-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-21 11:45' },
    { id: 'pr-muapdy58-5n1b6', dataDate: '2026-09-17', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-muapdy58-5n1b6-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-21 11:46' },
    { id: 'pr-muapehxk-sf9jn', dataDate: '2026-09-18', goods: '铁矿石', from: '黄骅港', to: '武安', price: 73.91, remark: '黄骅港系统报价-南非粉', evidences: [SEED_EV + 'pr-muapehxk-sf9jn-1.png'], uploader: '系统管理员', uploadedAt: '2026-09-21 11:46' }
  ];

  function buildSeed() {
    return {
      __version: VERSION,
      places: JSON.parse(JSON.stringify(SEED_PLACES)),
      goods: JSON.parse(JSON.stringify(SEED_GOODS)),
      records: JSON.parse(JSON.stringify(SEED_RECORDS))
    };
  }

  // 记录的凭证图片列表（真实上传与内置截图统一走这里）
  function evidencesOf(rec) {
    return (rec.evidences && rec.evidences.length) ? rec.evidences : [];
  }

  // ===== 数据读写（localStorage，与各模块约定一致） =====
  var db = null;

  function loadDB() {
    if (db) return db;
    try {
      var v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (v && v.__version === VERSION && v.places && v.goods && Array.isArray(v.records)) {
        db = v;
        return db;
      }
    } catch (e) { /* 解析失败则重建种子 */ }
    // 版本不匹配（含旧版测试数据）：用最新内置数据整体替换
    db = buildSeed();
    persist();
    return db;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      toast('本地存储空间不足，最新数据可能未完整保存');
    }
  }

  // ===== 派生数据 =====
  function allPlaces() {
    return db.places.hot.concat(db.places.ports, db.places.factories);
  }

  function allGoodsOptions() {
    var set = {};
    db.goods.hot.concat(db.goods.all).forEach(function (g) { if (g) set[g] = true; });
    return Object.keys(set);
  }

  // 线路列表（由报价记录派生）：[{ key, from, to, count }]
  function deriveRoutes() {
    var map = {};
    db.records.forEach(function (r) {
      var key = r.from + '|' + r.to;
      if (!map[key]) map[key] = { key: key, from: r.from, to: r.to, count: 0 };
      map[key].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // 基期值：优先 2026-06-01，否则该线路最早一天
  function baseValue(recs) {
    var byBase = recs.filter(function (r) { return r.dataDate === BASE_DATE; });
    if (byBase.length) {
      return round2(avg(byBase.map(function (r) { return r.price; })));
    }
    var sorted = recs.slice().sort(function (a, b) { return a.dataDate.localeCompare(b.dataDate); });
    return sorted.length ? sorted[0].price : null;
  }

  function baseLabel(recs) {
    var hasBase = recs.some(function (r) { return r.dataDate === BASE_DATE; });
    if (hasBase) return BASE_DATE;
    var sorted = recs.slice().sort(function (a, b) { return a.dataDate.localeCompare(b.dataDate); });
    return sorted.length ? sorted[0].dataDate : BASE_DATE;
  }

  function avg(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  // ===== 页面状态 =====
  var state = {
    tab: 'overview',
    from: '',            // 筛选：启运地（空 = 全部）
    to: '',              // 筛选：目的地
    goods: '',           // 筛选：货物种类
    routeKey: '',        // 选中的线路 key（from|to）
    range: '90',         // 近30天 / 近90天 / 全部
    chartMode: 'price',  // price / index
    evidences: []        // 录入表单待上传依据来源（dataURL 数组）
  };

  // ===== 页签切换 =====
  function switchTab(name) {
    state.tab = name;
    document.querySelectorAll('.tx-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    ['overview', 'entry', 'history', 'base'].forEach(function (n) {
      var el = $('#tab-' + n);
      if (el) el.style.display = n === name ? '' : 'none';
    });
  }

  // ===== 线路筛选（三下拉 + chips） =====
  function filteredRoutes() {
    return deriveRoutes().filter(function (r) {
      if (state.from && r.from !== state.from) return false;
      if (state.to && r.to !== state.to) return false;
      if (state.goods) {
        var gs = db.records.filter(function (x) { return x.from === r.from && x.to === r.to; })
          .map(function (x) { return x.goods; });
        if (gs.indexOf(state.goods) === -1) return false;
      }
      return true;
    });
  }

  function selectedRouteRecs() {
    var key = state.routeKey;
    if (!key) return [];
    var parts = key.split('|');
    return db.records.filter(function (r) { return r.from === parts[0] && r.to === parts[1]; });
  }

  function renderChips() {
    var box = $('#routeChips');
    var routes = filteredRoutes();

    // 当前选中线路被筛掉时，自动选中第一条
    if (routes.length && !routes.some(function (r) { return r.key === state.routeKey; })) {
      state.routeKey = routes[0].key;
    }
    if (!routes.length) state.routeKey = '';

    $('#routeCount').textContent = '共 ' + routes.length + ' 条线路';

    box.innerHTML = routes.map(function (r) {
      return '<button class="tx-chip' + (r.key === state.routeKey ? ' active' : '') +
        '" data-route="' + esc(r.key) + '" type="button">' +
        '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="13" height="9" rx="2"/><path d="M15.5 10h3.2l2.3 2.6V16h-5.5"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17.5" cy="17.5" r="1.6"/></svg>' +
        esc(r.from + '→' + r.to) +
        '<span class="cnt">' + r.count + ' 条数据</span></button>';
    }).join('');

    if (!routes.length) {
      box.innerHTML = '<span class="tx-chip-empty">当前筛选条件下暂无线路，可在「价格录入」新增报价数据</span>';
    }

    box.querySelectorAll('.tx-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.routeKey = chip.dataset.route;
        renderOverview();
      });
    });
  }

  // ===== 筛选触发器文字 =====
  function refreshFilterTriggers() {
    var fv = $('#pickFromValue'), tv = $('#pickToValue'), gv = $('#pickGoodsValue');
    fv.textContent = state.from || '全部启运地';
    fv.classList.toggle('placeholder', !state.from);
    tv.textContent = state.to || '全部目的地';
    tv.classList.toggle('placeholder', !state.to);
    gv.textContent = state.goods || '全部货物种类';
    gv.classList.toggle('placeholder', !state.goods);
  }

  // ===== 地点选择弹窗（启运地 / 目的地共用，原设计：搜索 + 热门/港口/钢厂分组） =====
  var placePickTarget = null; // 'from' | 'to'

  function renderPlaceGroups() {
    var kw = $('#placeSearch').value.trim();
    var box = $('#placeGroupsBox');
    var groups = [
      { title: '热门地点', icon: '🔥', items: db.places.hot },
      { title: '港口', icon: '⚓', items: db.places.ports },
      { title: '钢厂', icon: '🏭', items: db.places.factories }
    ];
    var html = '<div class="tx-opt-group"><div class="tx-opt-grid">' +
      '<button class="tx-opt' + ((placePickTarget === 'from' ? !state.from : !state.to) ? ' active' : '') +
      '" data-clear="1" type="button">全部（清除筛选）</button></div></div>';
    groups.forEach(function (g) {
        var items = g.items.filter(function (p) { return !kw || p.indexOf(kw) !== -1; });
        if (kw && !items.length) return;
        var shown = kw ? items : g.items;
      html += '<div class="tx-opt-group">' +
        '<div class="tx-opt-group-title"><span class="g-ico">' + g.icon + '</span>' + esc(g.title) +
        ' <span class="g-cnt">（' + g.items.length + '）</span></div>' +
        '<div class="tx-opt-grid">' +
        shown.map(function (p) {
          var active = (placePickTarget === 'from' && state.from === p) ||
            (placePickTarget === 'to' && state.to === p);
          return '<button class="tx-opt' + (active ? ' active' : '') + '" data-place="' + esc(p) + '" type="button">' + esc(p) + '</button>';
        }).join('') +
        (kw && !shown.length ? '<div class="tx-opt-none">未找到相关地点</div>' : '') +
        '</div></div>';
    });
    box.innerHTML = html || '<div class="tx-opt-none">未找到相关地点</div>';

    box.querySelectorAll('[data-place]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.dataset.place;
        if (placePickTarget === 'from') state.from = p; else state.to = p;
        closePlaceModal();
        refreshFilterTriggers();
        renderOverview();
      });
    });
    box.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (placePickTarget === 'from') state.from = ''; else state.to = '';
        closePlaceModal();
        refreshFilterTriggers();
        renderOverview();
      });
    });
  }

  function openPlaceModal(target) {
    placePickTarget = target;
    $('#placeTitle').textContent = target === 'from' ? '选择启运地' : '选择目的地';
    $('#placeSearch').value = '';
    renderPlaceGroups();
    $('#placeMask').classList.add('show');
    $('#placeSearch').focus();
  }

  function closePlaceModal() { $('#placeMask').classList.remove('show'); }

  // ===== 货物种类筛选弹窗（原设计：热门种类 + 全部种类） =====
  function renderGoodsGroups() {
    var kw = $('#goodsSearch').value.trim();
    var box = $('#goodsGroupsBox');
    var groups = [
      { title: '热门种类', icon: '🔥', items: db.goods.hot },
      { title: '全部种类', icon: '📋', items: allGoodsOptions() }
    ];
    var html = '<div class="tx-opt-group"><div class="tx-opt-grid">' +
      '<button class="tx-opt' + (!state.goods ? ' active' : '') + '" data-gclear="1" type="button">全部（清除筛选）</button></div></div>';
    groups.forEach(function (g) {
      var items = g.items.filter(function (x) { return !kw || x.indexOf(kw) !== -1; });
      if (kw && !items.length) return;
      html += '<div class="tx-opt-group">' +
        '<div class="tx-opt-group-title"><span class="g-ico">' + g.icon + '</span>' + esc(g.title) +
        ' <span class="g-cnt">（' + g.items.length + '）</span></div>' +
        '<div class="tx-opt-grid">' +
        items.map(function (x) {
          return '<button class="tx-opt' + (state.goods === x ? ' active' : '') + '" data-goods="' + esc(x) + '" type="button">' + esc(x) + '</button>';
        }).join('') +
        '</div></div>';
    });
    box.innerHTML = html || '<div class="tx-opt-none">未找到相关种类</div>';

    box.querySelectorAll('[data-goods]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.goods = btn.dataset.goods;
        closeGoodsModal();
        refreshFilterTriggers();
        renderOverview();
      });
    });
    box.querySelectorAll('[data-gclear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.goods = '';
        closeGoodsModal();
        refreshFilterTriggers();
        renderOverview();
      });
    });
  }

  function openGoodsModal() {
    $('#goodsSearch').value = '';
    renderGoodsGroups();
    $('#goodsMask').classList.add('show');
    $('#goodsSearch').focus();
  }

  function closeGoodsModal() { $('#goodsMask').classList.remove('show'); }

  // ===== KPI 概览卡（原设计 4 卡） =====
  function chgHTML(pct) {
    if (pct == null || !isFinite(pct)) return '';
    var cls = pct <= 0 ? 'down' : 'up';
    var arrow = pct <= 0 ? '↘' : '↗';
    return '<span class="tx-kpi-chg ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span>';
  }

  function renderKpis() {
    var recs = selectedRouteRecs();
    var sorted = recs.slice().sort(function (a, b) {
      return a.dataDate.localeCompare(b.dataDate) || a.uploadedAt.localeCompare(b.uploadedAt);
    });
    var latest = sorted[sorted.length - 1] || null;
    var prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    var latestPre = latest ? latest.price : null;
    var chg = (latest && prev) ? (latest.price / prev.price - 1) * 100 : null;

    // 全局最新上传（第 4 卡）
    var globalLatest = db.records.slice().sort(function (a, b) {
      return b.uploadedAt.localeCompare(a.uploadedAt);
    })[0] || null;

    // 近一周平均价（截至最新数据日，向前 7 个自然日内的不含税均价）
    var weekAvg = null, weekFoot = '暂无报价数据';
    if (latest) {
      var endT = parseDate(latest.dataDate).getTime();
      var startT = endT - 6 * 86400000;
      var inWeek = sorted.filter(function (r) {
        var t = parseDate(r.dataDate).getTime();
        return t >= startT && t <= endT;
      });
      if (inWeek.length) {
        weekAvg = avg(inWeek.map(function (r) { return r.price; }));
        weekFoot = fmtDate(new Date(startT)) + ' ~ ' + latest.dataDate + ' · ' + inWeek.length + ' 条报价';
      }
    }

    var cards = [
      {
        icon: 'i1', label: '最新不含税价',
        valueRow: latestPre == null ? '<span class="tx-kpi-value">—</span>'
          : '<span class="tx-kpi-value">' + latestPre.toFixed(2) + '</span><span class="tx-kpi-unit">元/吨</span>' + chgHTML(chg),
        foot: latest ? '数据日期 ' + latest.dataDate : '暂无报价数据'
      },
      {
        icon: 'i2', label: '最新含税价',
        valueRow: latestPre == null ? '<span class="tx-kpi-value">—</span>'
          : '<span class="tx-kpi-value">' + taxOf(latestPre).toFixed(2) + '</span><span class="tx-kpi-unit">元/吨</span>' + chgHTML(chg),
        foot: '不含税价 × 1.09 自动换算'
      },
      {
        icon: 'i3', label: '近一周平均价',
        valueRow: weekAvg == null ? '<span class="tx-kpi-value">—</span>'
          : '<span class="tx-kpi-value">' + weekAvg.toFixed(2) + '</span><span class="tx-kpi-unit">元/吨</span>',
        foot: weekFoot
      },
      {
        icon: 'i4', label: '最新数据更新',
        valueRow: globalLatest ? '<span class="tx-kpi-value" style="font-size:24px;">' + timeAgo(globalLatest.uploadedAt) + '</span>'
          : '<span class="tx-kpi-value">—</span>',
        foot: globalLatest ? esc(globalLatest.uploader) + ' · ' + esc(globalLatest.uploadedAt) : '暂无上传记录'
      }
    ];

    $('#kpiGrid').innerHTML = cards.map(function (c) {
      return '<div class="tx-kpi"><div class="tx-kpi-info" style="min-width:0;">' +
        '<div class="tx-kpi-label">' + esc(c.label) + '</div>' +
        '<div class="tx-kpi-value-row">' + c.valueRow + '</div>' +
        '<div class="tx-kpi-foot">' + c.foot + '</div>' +
        '</div><div class="tx-kpi-icon ' + c.icon + '">' +
        (c.icon === 'i1'
          ? '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="3.2" height="8" rx="1"/><rect x="10.4" y="7" width="3.2" height="12" rx="1"/><rect x="15.8" y="4" width="3.2" height="15" rx="1"/></svg>'
          : c.icon === 'i2'
            ? '<svg viewBox="0 0 24 24"><rect x="5" y="13" width="3.2" height="6" rx="1"/><rect x="10.4" y="10" width="3.2" height="9" rx="1"/><rect x="15.8" y="7" width="3.2" height="12" rx="1"/></svg>'
            : c.icon === 'i3'
              ? '<svg viewBox="0 0 24 24"><path d="M4 17l5.5-5.5 3.5 3.5L20 8"/><path d="M14.5 8H20v5.5"/></svg>'
              : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/></svg>') +
        '</div></div>';
    }).join('');
  }

  // ===== 走势图（原设计：不含税实线 + 含税虚线 / 指数模式，悬停十字线 + 提示框） =====
  var chartGeom = null; // 记录坐标映射，供悬停提示使用

  function seriesForChart() {
    var recs = selectedRouteRecs();
    var base = baseValue(recs);
    if (!recs.length || !base) return { series: [], base: base };

    // 时间范围：以最新数据日期为终点
    var latestDate = recs.reduce(function (m, r) { return r.dataDate > m ? r.dataDate : m; }, '');
    var cutoff = null;
    if (state.range === '30' || state.range === '90') {
      cutoff = fmtDate(new Date(parseDate(latestDate).getTime() - (Number(state.range) - 1) * 86400000));
    }

    // 按数据日期分组（同日多条取均价，记录取上传时间最新一条用于悬浮信息）
    var byDay = {};
    recs.forEach(function (r) {
      if (cutoff && r.dataDate < cutoff) return;
      if (!byDay[r.dataDate]) byDay[r.dataDate] = { prices: [], rec: r };
      byDay[r.dataDate].prices.push(r.price);
      if (r.uploadedAt > byDay[r.dataDate].rec.uploadedAt) byDay[r.dataDate].rec = r;
    });

    var series = Object.keys(byDay).sort().map(function (d) {
      var g = byDay[d];
      var pre = round2(avg(g.prices));
      return {
        date: d,
        pre: pre,
        tax: taxOf(pre),
        idx: round2(pre / base * 100),
        uploader: g.rec.uploader,
        uploadedAt: g.rec.uploadedAt
      };
    });
    return { series: series, base: base };
  }

  function renderChart() {
    var svg = $('#trendChart');
    var tip = $('#chartTip');
    if (!svg) return;
    tip.style.display = 'none';

    var route = state.routeKey ? state.routeKey.replace('|', '→') : '—';
    var isIdx = state.chartMode === 'index';
    $('#chartTitle').textContent = route + ' · ' + (isIdx ? '价格指数走势' : '不含税/含税价格走势');
    $('#chartUnit').textContent = isIdx ? '单位：基期 = 100' : '单位：元/吨';
    $('#legendTax').style.display = isIdx ? 'none' : '';
    $('#legendIndex').style.display = isIdx ? '' : 'none';

    var data = seriesForChart();
    var series = data.series;
    if (!series.length) {
      svg.innerHTML = '<text class="chart-empty" x="500" y="170" text-anchor="middle">当前线路暂无报价数据</text>';
      chartGeom = null;
      return;
    }

    var W = 1000, H = 340;
    var PAD_L = 58, PAD_R = 26, PAD_T = 30, PAD_B = 44;
    var innerW = W - PAD_L - PAD_R;
    var innerH = H - PAD_T - PAD_B;

    // Y 值域（价格模式同时覆盖不含税与含税）
    var vMin, vMax;
    if (isIdx) {
      vMin = Math.min.apply(null, series.map(function (s) { return s.idx; }));
      vMax = Math.max.apply(null, series.map(function (s) { return s.idx; }));
    } else {
      vMin = series[0].pre; vMax = series[0].tax;
      series.forEach(function (s) {
        if (s.pre < vMin) vMin = s.pre;
        if (s.tax > vMax) vMax = s.tax;
      });
    }
    var margin = (vMax - vMin) * 0.12 + 0.6;
    var yMin = Math.floor((vMin - margin) * 2) / 2;
    var yMax = Math.ceil((vMax + margin) * 2) / 2;
    var ySpan = yMax - yMin || 1;

    // X：按真实时间定位（单点居中）
    var t0 = parseDate(series[0].date).getTime();
    var t1 = parseDate(series[series.length - 1].date).getTime();
    var xAt = function (date) {
      if (t1 === t0) return PAD_L + innerW / 2;
      return PAD_L + (parseDate(date).getTime() - t0) / (t1 - t0) * innerW;
    };
    var yAt = function (v) { return PAD_T + innerH - ((v - yMin) / ySpan) * innerH; };

    var parts = [];

    parts.push(
      '<defs><linearGradient id="txAreaPre" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#2E6BE6" stop-opacity="0.16"/>' +
      '<stop offset="100%" stop-color="#2E6BE6" stop-opacity="0"/>' +
      '</linearGradient><linearGradient id="txAreaIdx" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#14C0CC" stop-opacity="0.16"/>' +
      '<stop offset="100%" stop-color="#14C0CC" stop-opacity="0"/>' +
      '</linearGradient></defs>'
    );

    // 网格 + 纵轴刻度
    var SEG = 4;
    for (var i = 0; i <= SEG; i++) {
      var v = yMin + ySpan * i / SEG;
      var gy = yAt(v);
      parts.push('<line class="' + (i === 0 ? 'trend-axis' : 'trend-grid') +
        '" x1="' + PAD_L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="trend-label" x="' + (PAD_L - 9) + '" y="' + (gy + 4).toFixed(1) +
        '" text-anchor="end">' + v.toFixed(1) + '</text>');
    }

    // 面积 + 折线（价格模式：不含税实线带面积 + 含税虚线；指数模式：单线）
    function ptsOf(key) {
      return series.map(function (s) { return xAt(s.date).toFixed(1) + ',' + yAt(s[key]).toFixed(1); });
    }

    if (isIdx) {
      var ip = ptsOf('idx');
      parts.push('<polygon fill="url(#txAreaIdx)" points="' +
        PAD_L + ',' + (PAD_T + innerH).toFixed(1) + ' ' + ip.join(' ') + ' ' + (W - PAD_R) + ',' + (PAD_T + innerH).toFixed(1) + '"/>');
      parts.push('<polyline class="trend-line-idx" points="' + ip.join(' ') + '"/>');
    } else {
      var pp = ptsOf('pre'), tp = ptsOf('tax');
      parts.push('<polygon fill="url(#txAreaPre)" points="' +
        PAD_L + ',' + (PAD_T + innerH).toFixed(1) + ' ' + pp.join(' ') + ' ' + (W - PAD_R) + ',' + (PAD_T + innerH).toFixed(1) + '"/>');
      parts.push('<polyline class="trend-line-tax" points="' + tp.join(' ') + '"/>');
      parts.push('<polyline class="trend-line-pre" points="' + pp.join(' ') + '"/>');
    }

    // 末端圆点
    var last = series[series.length - 1];
    var lastKey = isIdx ? 'idx' : 'pre';
    parts.push('<circle cx="' + xAt(last.date).toFixed(1) + '" cy="' + yAt(last[lastKey]).toFixed(1) +
      '" r="4" fill="' + (isIdx ? '#14C0CC' : '#2E6BE6') + '"/>');

    // 十字线（悬停时显示）
    parts.push('<line id="txCross" class="trend-crosshair" x1="0" y1="' + PAD_T + '" x2="0" y2="' + (PAD_T + innerH) + '" visibility="hidden"/>');

    // 横轴日期标注（稀疏）
    var n = series.length;
    var labelEvery = Math.max(1, Math.ceil(n / 6));
    series.forEach(function (s, i) {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      parts.push('<text class="trend-label" x="' + xAt(s.date).toFixed(1) + '" y="' + (H - PAD_B + 24) +
        '" text-anchor="middle">' + esc(s.date.slice(5)) + '</text>');
    });

    svg.innerHTML = parts.join('');

    chartGeom = {
      series: series, xAt: xAt, yAt: yAt, PAD_T: PAD_T, isIdx: isIdx,
      padL: PAD_L, padR: W - PAD_R
    };
  }

  function bindChartHover() {
    var wrap = $('#chartWrap');
    var svg = $('#trendChart');
    var tip = $('#chartTip');

    wrap.addEventListener('mousemove', function (ev) {
      if (!chartGeom) return;
      var rect = wrap.getBoundingClientRect();
      // 屏幕坐标 → SVG 视图坐标
      var scale = 1000 / rect.width;
      var mx = (ev.clientX - rect.left) * scale;

      var s = chartGeom.series, g = chartGeom;
      var nearest = null, nd = Infinity;
      s.forEach(function (p) {
        var d = Math.abs(g.xAt(p.date) - mx);
        if (d < nd) { nd = d; nearest = p; }
      });
      if (!nearest) return;

      var px = g.xAt(nearest.date);
      var py = g.yAt(chartGeom.isIdx ? nearest.idx : nearest.pre);

      var cross = svg.querySelector('#txCross');
      if (cross) {
        cross.setAttribute('x1', px.toFixed(1));
        cross.setAttribute('x2', px.toFixed(1));
        cross.setAttribute('visibility', 'visible');
      }

      var rows;
      if (chartGeom.isIdx) {
        rows = '<div class="tip-row"><i style="background:#14C0CC;"></i><span class="t-name">指数</span><span class="t-val">' + nearest.idx.toFixed(2) + '</span></div>';
      } else {
        rows =
          '<div class="tip-row"><i style="background:#2E6BE6;"></i><span class="t-name">不含税价</span><span class="t-val">' + nearest.pre.toFixed(2) + ' 元/吨</span></div>' +
          '<div class="tip-row"><i style="background:#9254DE;"></i><span class="t-name">含税价</span><span class="t-val">' + nearest.tax.toFixed(2) + ' 元/吨</span></div>' +
          '<div class="tip-row"><i style="background:#14C0CC;"></i><span class="t-name">指数</span><span class="t-val">' + nearest.idx.toFixed(2) + '</span></div>';
      }

      tip.innerHTML = '<div class="tip-date">' + esc(nearest.date) + '</div>' + rows +
        '<div class="tip-uploader">上传人：' + esc(nearest.uploader) + ' · ' + esc(nearest.uploadedAt) + '</div>';
      tip.style.display = 'block';

      // 提示框定位（贴近右侧时翻到左侧）
      var wrapW = rect.width;
      var tipW = tip.offsetWidth || 220;
      var left = px / scale - tipW - 14;
      if (left < 6) left = px / scale + 14;
      if (left + tipW > wrapW - 6) left = wrapW - tipW - 6;
      var top = Math.max(4, py * (rect.height / 340) - 40);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    });

    wrap.addEventListener('mouseleave', function () {
      tip.style.display = 'none';
      var cross = svg.querySelector('#txCross');
      if (cross) cross.setAttribute('visibility', 'hidden');
    });
  }

  // ===== 最新数据来源（全局最新一条上传记录） =====
  function renderLatestSource() {
    var box = $('#latestSource');
    var latest = db.records.slice().sort(function (a, b) {
      return b.uploadedAt.localeCompare(a.uploadedAt);
    })[0] || null;

    if (!latest) {
      box.innerHTML = '<div class="tx-recent-title">最新数据来源</div><div class="tx-table-empty">暂无上传记录</div>';
      return;
    }

    var evList = evidencesOf(latest);
    var evBtn = evList.length
      ? '<button class="tx-btn-view" data-ev="1" type="button">👁 查看凭证</button>'
      : '<button class="tx-btn-view" id="btnEvNone" type="button">👁 查看凭证</button>';

    box.innerHTML =
      '<div class="tx-recent-title">最新数据来源</div>' +
      '<div class="tx-src-time-row">' +
      '<div class="tx-src-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/></svg></div>' +
      '<div><div class="tx-src-label">最近一次数据更新</div>' +
      '<div><span class="tx-src-time">' + esc(latest.uploadedAt) + '</span>' +
      '<span class="tx-src-ago">（' + timeAgo(latest.uploadedAt) + '）</span></div></div></div>' +
      '<div class="tx-src-rows">' +
      '<div class="tx-src-row"><span class="k">上传人</span><span class="v">' + esc(latest.uploader) + '</span></div>' +
      '<div class="tx-src-row"><span class="k">线路 / 日期</span><span class="v">' + esc(latest.from + '→' + latest.to) + ' · ' + esc(latest.dataDate) + '</span></div>' +
      '<div class="tx-src-row"><span class="k">不含税 / 含税</span><span class="v">' + latest.price.toFixed(2) + ' / <span class="hl">' + taxOf(latest.price).toFixed(2) + '</span> 元/吨</span></div>' +
      '<div class="tx-src-row"><span class="k">依据来源</span><span class="v">' +
      (evList.length ? '<span class="hl">🔗 ' + evList.length + ' 张凭证</span>' : '未上传') +
      '</span></div>' +
      '</div>' +
      '<div class="tx-src-actions">' + evBtn +
      '<button class="tx-link" id="btnAllHistory" type="button">查看全部历史</button></div>';

    var evBtnEl = box.querySelector('[data-ev]');
    if (evBtnEl) {
      evBtnEl.addEventListener('click', function () { openGallery(evList, 0); });
    } else {
      box.querySelector('#btnEvNone').addEventListener('click', function () { toast('该记录暂未上传依据来源'); });
    }
    box.querySelector('#btnAllHistory').addEventListener('click', function () { switchTab('history'); });
  }

  // ===== 最近上传（全局最新 6 条） =====
  function renderRecentUploads() {
    var box = $('#recentUploads');
    var list = db.records.slice().sort(function (a, b) {
      return b.uploadedAt.localeCompare(a.uploadedAt);
    }).slice(0, 6);

    var items = list.map(function (r) {
      return '<div class="tx-recent-item" data-rec="' + esc(r.id) + '">' +
        '<div class="tx-recent-info" style="min-width:0;">' +
        '<div class="tx-recent-route">' + esc(r.from + '→' + r.to) + '</div>' +
        '<div class="tx-recent-meta">' + esc(r.goods) + ' · ' + esc(r.dataDate) + ' · ' + esc(r.uploader) + ' · ' + timeAgo(r.uploadedAt) + '</div>' +
        '</div>' +
        '<div class="tx-recent-right">' +
        '<div class="tx-recent-price">' + r.price.toFixed(2) + '</div>' +
        '<span class="tx-recent-ev"><svg viewBox="0 0 24 24"><path d="M21 12.5l-8.6 8.6a2 2 0 0 1-2.8 0L3 14.5V6a2 2 0 0 1 2-2h8.5l7.5 7.5a1.4 1.4 0 0 1 0 2z"/><circle cx="8.5" cy="9.5" r="1.3"/></svg>' +
        evidencesOf(r).length + '</span>' +
        '</div></div>';
    }).join('');

    box.innerHTML =
      '<div class="tx-recent-head"><span class="tx-recent-title">最近上传</span>' +
      '<div class="tx-recent-tools"><button class="tx-link" id="btnRecentAll" type="button">全部</button>' +
      '<button class="tx-link" id="btnRecentSearch" type="button">🔍</button></div></div>' +
      '<div class="tx-recent-list">' + (items || '<div class="tx-table-empty">暂无上传记录</div>') + '</div>';

    box.querySelector('#btnRecentAll').addEventListener('click', function () { switchTab('history'); });
    box.querySelector('#btnRecentSearch').addEventListener('click', function () { switchTab('history'); });
    box.querySelectorAll('.tx-recent-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var rec = db.records.find(function (x) { return x.id === item.dataset.rec; });
        var evs = rec ? evidencesOf(rec) : [];
        if (evs.length) openGallery(evs, 0);
        else toast('该记录暂无依据来源截图');
      });
    });
  }

  // ===== 总览渲染入口 =====
  function renderOverview() {
    renderChips();
    refreshFilterTriggers();
    renderKpis();
    renderChart();
    renderLatestSource();
    renderRecentUploads();
  }

  // ===== 价格录入（原设计表单） =====
  function renderEntryOptions() {
    // 货物种类候选（可选可输入）
    $('#goodsDatalist').innerHTML = allGoodsOptions().map(function (g) {
      return '<option value="' + esc(g) + '"></option>';
    }).join('');

    // 地点候选（自定义线路用）
    $('#placesDatalist').innerHTML = allPlaces().map(function (p) {
      return '<option value="' + esc(p) + '"></option>';
    }).join('');

    // 运输线路：既有线路 + 自定义线路
    var routes = deriveRoutes();
    var html = '<option value="" disabled selected>请选择线路</option>';
    routes.forEach(function (r) {
      html += '<option value="' + esc(r.key) + '">' + esc(r.from + '→' + r.to) + '</option>';
    });
    html += '<option value="__custom__">＋ 自定义线路...</option>';
    $('#entryRoute').innerHTML = html;
  }

  function refreshRoutePreview() {
    var f = $('#entryFrom').value.trim();
    var t = $('#entryTo').value.trim();
    $('#entryRoutePreview').textContent = (f || t) ? (f || '（启运地）') + '→' + (t || '（目的地）') : '—';
  }

  function resetEntryForm() {
    $('#entryDate').value = fmtDate(new Date());
    $('#entryGoods').value = '';
    $('#entryRoute').selectedIndex = 0;
    $('#entryFrom').value = '';
    $('#entryTo').value = '';
    $('#entryPrice').value = '';
    $('#entryRemark').value = '';
    $('#customRoutePanel').style.display = 'none';
    $('#entryTax').textContent = '— 元/吨';
    state.evidences = [];
    renderThumbs();
    refreshRoutePreview();
  }

  function renderThumbs() {
    $('#entryThumbs').innerHTML = state.evidences.map(function (src, i) {
      return '<div class="tx-thumb"><img src="' + src + '" data-thumb="' + i + '" alt="依据来源' + (i + 1) + '">' +
        '<button class="tx-thumb-del" data-del="' + i + '" type="button">✕</button></div>';
    }).join('');

    $('#entryThumbs').querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.evidences.splice(Number(btn.dataset.del), 1);
        renderThumbs();
      });
    });
    $('#entryThumbs').querySelectorAll('[data-thumb]').forEach(function (img) {
      img.addEventListener('click', function () {
        openGallery(state.evidences, Number(img.dataset.thumb));
      });
    });
  }

  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        // 最长边压缩至 1400px 内，转 JPEG 存储（节省 localStorage 空间）
        var scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function handleEntryFiles(files) {
    if (!files || !files.length) return;
    var list = Array.prototype.slice.call(files);
    var accepted = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!/^image\/(jpeg|png)$/.test(f.type)) { toast('「' + f.name + '」不是 jpg / png 图片，已跳过'); continue; }
      if (f.size > 10 * 1024 * 1024) { toast('「' + f.name + '」超过 10M，已跳过'); continue; }
      accepted.push(f);
    }
    accepted.forEach(function (f) {
      if (state.evidences.length >= MAX_EVIDENCES) { toast('依据来源最多 ' + MAX_EVIDENCES + ' 张'); return; }
      compressImage(f, function (dataUrl) {
        if (state.evidences.length >= MAX_EVIDENCES) { toast('依据来源最多 ' + MAX_EVIDENCES + ' 张'); return; }
        state.evidences.push(dataUrl);
        renderThumbs();
      });
    });
  }

  function saveRecord() {
    var dataDate = $('#entryDate').value;
    var goods = $('#entryGoods').value.trim();
    var routeSel = $('#entryRoute').value;
    var from, to;
    if (routeSel === '__custom__') {
      from = $('#entryFrom').value.trim();
      to = $('#entryTo').value.trim();
    } else if (routeSel) {
      var parts = routeSel.split('|');
      from = parts[0]; to = parts[1];
    }
    var price = parseFloat($('#entryPrice').value);
    var remark = $('#entryRemark').value.trim();

    if (!dataDate) { toast('请选择数据日期'); return; }
    if (!goods) { toast('请填写货物种类'); return; }
    if (!from || !to) { toast('请选择或填写完整运输线路'); return; }
    if (from === to) { toast('启运地与目的地不能相同'); return; }
    if (!(price > 0)) { toast('不含税价格必须为大于 0 的数字'); return; }

    var now = new Date();
    var rec = {
      id: uid('q'),
      dataDate: dataDate,
      goods: goods,
      from: from,
      to: to,
      price: round2(price),
      remark: remark,
      evidences: state.evidences.slice(),
      uploader: UPLOADER,
      uploadedAt: fmtDate(now) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes())
    };
    db.records.push(rec);
    persist();

    renderEntryOptions();
    resetEntryForm();
    state.routeKey = rec.from + '|' + rec.to;
    state.range = 'all';
    document.querySelectorAll('#rangeBtns .range-btn, #rangeBtns button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.range === 'all');
    });
    renderOverview();
    switchTab('overview');
    toast('保存成功：含税价 ' + taxOf(rec.price).toFixed(2) + ' 元/吨 已自动换算');
  }

  // ===== 历史数据 =====
  function renderHistory() {
    var fFrom = $('#hisFrom').value;
    var fTo = $('#hisTo').value;
    var kw = $('#hisKeyword').value.trim();
    var dStart = $('#hisStart').value;
    var dEnd = $('#hisEnd').value;

    var list = db.records.filter(function (r) {
      if (fFrom && r.from !== fFrom) return false;
      if (fTo && r.to !== fTo) return false;
      if (dStart && r.dataDate < dStart) return false;
      if (dEnd && r.dataDate > dEnd) return false;
      if (kw && (r.from + r.to + r.goods + r.uploader).indexOf(kw) === -1) return false;
      return true;
    }).sort(function (a, b) {
      return b.dataDate.localeCompare(a.dataDate) || b.uploadedAt.localeCompare(a.uploadedAt);
    });

    var html = '<thead><tr>' +
      '<th>数据日期</th><th>运输方式</th><th>线路</th><th>货物种类</th>' +
      '<th class="num">不含税价（元/吨）</th><th class="num">含税价（元/吨）</th>' +
      '<th>依据来源</th><th>上传人</th><th>上传时间</th><th>操作</th></tr></thead><tbody>';

    if (!list.length) {
      html += '<tr><td colspan="10" class="tx-table-empty">当前筛选条件下暂无上传记录</td></tr>';
    }

    list.forEach(function (r) {
      html += '<tr>' +
        '<td>' + esc(r.dataDate) + '</td>' +
        '<td><span class="tx-tag-mode">汽运</span></td>' +
        '<td>' + esc(r.from) + '→' + esc(r.to) + '</td>' +
        '<td><span class="tx-tag-goods">' + esc(r.goods) + '</span></td>' +
        '<td class="num">' + r.price.toFixed(2) + '</td>' +
        '<td class="num">' + taxOf(r.price).toFixed(2) + '</td>' +
        '<td>' + (evidencesOf(r).length
          ? '<button class="tx-ev-link" data-ev="' + esc(r.id) + '" type="button">🔗 ' + evidencesOf(r).length + ' 张</button>'
          : '—') + '</td>' +
        '<td class="tx-up-cell"><span class="up-name">' + esc(r.uploader) + '</span>' +
        '<span class="up-ago">' + timeAgo(r.uploadedAt) + '</span></td>' +
        '<td>' + esc(r.uploadedAt) + '</td>' +
        '<td><button class="tx-del-btn" data-del="' + esc(r.id) + '" type="button" title="删除">✕</button></td>' +
        '</tr>';
    });
    html += '</tbody>';

    $('#hisTable').innerHTML = html;
    $('#hisFoot').textContent = '共 ' + list.length + ' 条记录（删除需管理员确认，操作不可恢复）';

    $('#hisTable').querySelectorAll('[data-ev]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rec = db.records.find(function (x) { return x.id === btn.dataset.ev; });
        if (rec) openGallery(evidencesOf(rec), 0);
      });
    });
    $('#hisTable').querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rec = db.records.find(function (x) { return x.id === btn.dataset.del; });
        if (!rec) return;
        openConfirm('删除该条上传记录？',
          esc(rec.dataDate) + ' · ' + esc(rec.from + '→' + rec.to) + ' · ' + esc(rec.goods) +
          ' · ' + rec.price.toFixed(2) + ' 元/吨（上传人：' + esc(rec.uploader) + '）',
          function () {
            db.records = db.records.filter(function (x) { return x.id !== rec.id; });
            persist();
            renderHistory();
            renderOverview();
            toast('记录已删除');
          });
      });
    });
  }

  function renderHistoryFilterOptions() {
    var froms = [], tos = {}, fromSet = {};
    db.records.forEach(function (r) {
      if (!fromSet[r.from]) { fromSet[r.from] = true; froms.push(r.from); }
      tos[r.to] = true;
    });
    froms.sort();
    var toList = Object.keys(tos).sort();

    $('#hisFrom').innerHTML = '<option value="">全部启运地</option>' + froms.map(function (f) {
      return '<option value="' + esc(f) + '">' + esc(f) + '</option>';
    }).join('');
    $('#hisTo').innerHTML = '<option value="">全部目的地</option>' + toList.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    }).join('');
  }

  function resetHistoryFilters() {
    $('#hisFrom').value = '';
    $('#hisTo').value = '';
    $('#hisKeyword').value = '';
    $('#hisStart').value = '';
    $('#hisEnd').value = '';
    renderHistory();
  }

  // ===== 删除确认弹窗 =====
  var confirmCb = null;

  function openConfirm(question, detailHtml, cb) {
    $('#confirmText').innerHTML = esc(question) +
      '<span class="tx-confirm-detail">' + detailHtml + '</span>';
    confirmCb = cb;
    $('#confirmMask').classList.add('show');
  }

  function closeConfirm() {
    $('#confirmMask').classList.remove('show');
    confirmCb = null;
  }

  // ===== 凭证画廊 =====
  var galleryList = [], galleryIdx = 0;

  function openGallery(images, startIdx) {
    if (!images || !images.length) { toast('暂无依据来源截图'); return; }
    galleryList = images;
    galleryIdx = startIdx || 0;
    showGalleryImage();
    $('#gallery').classList.add('show');
  }

  function showGalleryImage() {
    $('#galleryImg').src = galleryList[galleryIdx];
    $('#galleryCount').textContent = (galleryIdx + 1) + ' / ' + galleryList.length;
    $('#galleryPrev').style.display = galleryList.length > 1 ? '' : 'none';
    $('#galleryNext').style.display = galleryList.length > 1 ? '' : 'none';
  }

  function closeGallery() { $('#gallery').classList.remove('show'); }

  // ===== 基础数据 =====
  function renderBase() {
    // 地点库
    var groups = [
      { key: 'hot', title: '热门地点', icon: '🔥', items: db.places.hot },
      { key: 'ports', title: '港口', icon: '⚓', items: db.places.ports },
      { key: 'factories', title: '钢厂', icon: '🏭', items: db.places.factories }
    ];
    $('#placeGroups').innerHTML = groups.map(function (g) {
      return '<div class="tx-base-group">' +
        '<div class="tx-base-group-title"><span class="g-ico">' + g.icon + '</span>' + esc(g.title) +
        ' <span class="g-cnt">（' + g.items.length + '）</span></div>' +
        '<div class="tx-chip-wrap">' +
        g.items.map(function (p) {
          return '<span class="tx-base-chip">' + esc(p) +
            '<button class="del" data-g="' + g.key + '" data-p="' + esc(p) + '" type="button" title="删除">✕</button></span>';
        }).join('') + '</div></div>';
    }).join('');

    $('#placeGroups').querySelectorAll('.del').forEach(function (btn) {
      btn.addEventListener('click', function () { removePlace(btn.dataset.g, btn.dataset.p); });
    });

    // 货物种类
    $('#goodsChips').innerHTML = allGoodsOptions().map(function (g) {
      return '<span class="tx-base-chip">' + esc(g) +
        '<button class="del" data-goods="' + esc(g) + '" type="button" title="删除">✕</button></span>';
    }).join('');
    $('#goodsChips').querySelectorAll('.del').forEach(function (btn) {
      btn.addEventListener('click', function () { removeGoods(btn.dataset.goods); });
    });

    // 线路统计
    var routes = deriveRoutes();
    var rows = routes.map(function (r) {
      var recs = db.records.filter(function (x) { return x.from === r.from && x.to === r.to; });
      var goodsSet = {};
      recs.forEach(function (x) { goodsSet[x.goods] = true; });
      var latest = recs.slice().sort(function (a, b) { return b.uploadedAt.localeCompare(a.uploadedAt); })[0];
      return '<tr>' +
        '<td>' + esc(r.from) + '→' + esc(r.to) + '</td>' +
        '<td>' + esc(Object.keys(goodsSet).join('、')) + '</td>' +
        '<td class="num">' + r.count + '</td>' +
        '<td class="num">' + (latest ? latest.price.toFixed(2) : '—') + '</td>' +
        '<td>' + (latest ? esc(latest.uploadedAt) : '—') + '</td>' +
        '</tr>';
    }).join('');
    $('#baseRouteTable').innerHTML = '<thead><tr>' +
      '<th>运输线路</th><th>货物种类</th><th class="num">记录数</th><th class="num">最新不含税价（元/吨）</th><th>最近上传时间</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="tx-table-empty">暂无线路数据</td></tr>') + '</tbody>';

    // 地点 / 货物候选变化后，同步刷新录入表单的 datalist
    renderEntryOptions();
  }

  function removePlace(group, name) {
    var used = db.records.some(function (r) { return r.from === name || r.to === name; });
    if (used) { toast('该地点已被报价记录使用，无法删除'); return; }
    db.places[group] = db.places[group].filter(function (p) { return p !== name; });
    persist();
    renderBase();
    toast('已删除地点：' + name);
  }

  function removeGoods(name) {
    var used = db.records.some(function (r) { return r.goods === name; });
    if (used) { toast('该货物种类已被报价记录使用，无法删除'); return; }
    db.goods.hot = db.goods.hot.filter(function (g) { return g !== name; });
    db.goods.all = db.goods.all.filter(function (g) { return g !== name; });
    persist();
    renderBase();
    toast('已删除货物种类：' + name);
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 页签
    $('#txTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.tx-tab');
      if (tab) switchTab(tab.dataset.tab);
    });
    $('#btnGoEntry').addEventListener('click', function () { switchTab('entry'); });

    // 筛选触发器
    $('#pickFrom').addEventListener('click', function () { openPlaceModal('from'); });
    $('#pickTo').addEventListener('click', function () { openPlaceModal('to'); });
    $('#pickGoods').addEventListener('click', openGoodsModal);
    $('#placeClose').addEventListener('click', closePlaceModal);
    $('#goodsClose').addEventListener('click', closeGoodsModal);
    $('#placeSearch').addEventListener('input', renderPlaceGroups);
    $('#goodsSearch').addEventListener('input', renderGoodsGroups);
    $('#placeMask').addEventListener('click', function (e) { if (e.target === this) closePlaceModal(); });
    $('#goodsMask').addEventListener('click', function (e) { if (e.target === this) closeGoodsModal(); });

    // 时间范围
    $('#rangeBtns').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      state.range = btn.dataset.range;
      this.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderChart();
    });

    // 图表模式（价格 / 指数）
    $('#chartMode').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      state.chartMode = btn.dataset.mode;
      this.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderChart();
    });
    bindChartHover();

    // 录入表单
    $('#entryRoute').addEventListener('change', function () {
      $('#customRoutePanel').style.display = this.value === '__custom__' ? '' : 'none';
      refreshRoutePreview();
    });
    $('#entryFrom').addEventListener('input', refreshRoutePreview);
    $('#entryTo').addEventListener('input', refreshRoutePreview);
    $('#entryPrice').addEventListener('input', function () {
      var p = parseFloat(this.value);
      $('#entryTax').textContent = p > 0 ? taxOf(p).toFixed(2) + ' 元/吨' : '— 元/吨';
    });
    $('#entryGoodsClear').addEventListener('click', function () { $('#entryGoods').value = ''; });
    $('#uploadArea').addEventListener('click', function () { $('#entryFiles').click(); });
    $('#entryFiles').addEventListener('change', function () {
      handleEntryFiles(this.files);
      this.value = '';
    });
    $('#btnSaveRecord').addEventListener('click', saveRecord);
    $('#btnClearEntry').addEventListener('click', function () { resetEntryForm(); toast('表单已清空'); });

    // 历史数据
    ['hisFrom', 'hisTo'].forEach(function (id) {
      $('#' + id).addEventListener('change', renderHistory);
    });
    $('#hisKeyword').addEventListener('input', renderHistory);
    $('#hisStart').addEventListener('change', renderHistory);
    $('#hisEnd').addEventListener('change', renderHistory);
    $('#btnHisReset').addEventListener('click', resetHistoryFilters);

    // 基础数据
    $('#btnAddPlace').addEventListener('click', function () {
      var g = $('#placeGroupSel').value;
      var name = $('#placeAddInput').value.trim();
      if (!name) { toast('请输入地点名称'); return; }
      if (allPlaces().indexOf(name) !== -1) { toast('该地点已存在'); return; }
      db.places[g].push(name);
      persist();
      $('#placeAddInput').value = '';
      renderBase();
      toast('地点已添加：' + name);
    });
    $('#btnAddGoods').addEventListener('click', function () {
      var name = $('#goodsAddInput').value.trim();
      if (!name) { toast('请输入货物种类名称'); return; }
      if (allGoodsOptions().indexOf(name) !== -1) { toast('该货物种类已存在'); return; }
      db.goods.all.push(name);
      persist();
      $('#goodsAddInput').value = '';
      renderBase();
      toast('货物种类已添加：' + name);
    });

    // 删除确认
    $('#confirmClose').addEventListener('click', closeConfirm);
    $('#confirmCancel').addEventListener('click', closeConfirm);
    $('#confirmOk').addEventListener('click', function () {
      if (confirmCb) confirmCb();
      closeConfirm();
    });
    $('#confirmMask').addEventListener('click', function (e) { if (e.target === this) closeConfirm(); });

    // 画廊
    $('#galleryClose').addEventListener('click', closeGallery);
    $('#galleryPrev').addEventListener('click', function (e) {
      e.stopPropagation();
      galleryIdx = (galleryIdx - 1 + galleryList.length) % galleryList.length;
      showGalleryImage();
    });
    $('#galleryNext').addEventListener('click', function (e) {
      e.stopPropagation();
      galleryIdx = (galleryIdx + 1) % galleryList.length;
      showGalleryImage();
    });
    $('#gallery').addEventListener('click', function (e) { if (e.target === this) closeGallery(); });
  }

  // ===== 导航高亮（价格指数管理 / 汽运价格指数） =====
  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar || !navbar.children.length) return;
    var sub = navbar.querySelector('.nav-sub-item[data-path="价格指数管理 / 汽运价格指数"]');
    if (!sub) return;
    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(function (el) { el.classList.remove('active'); });
    sub.classList.add('active');
    var group = sub.closest('.nav-group');
    if (group) group.classList.add('open');
  }

  // ===== 初始化 =====
  function init() {
    loadDB();
    renderEntryOptions();
    resetEntryForm();
    renderHistoryFilterOptions();
    renderHistory();
    renderBase();
    renderOverview();
    bindEvents();
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
    setActiveNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
