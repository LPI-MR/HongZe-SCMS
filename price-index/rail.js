// ===== 火运价格指数 —— 参考专业价格指数平台设计 =====
// 数据口径：
//   · 行情数据仅含不含税价格，含税价 = 不含税 × 1.09 自动换算
//   · 运价查询：以线路最新报价为基准，测算各办理方式（整车 / 集装箱 / 敞顶箱）预计费用
//   · 运价数据口径参考国铁 95306 货运价格体系，支持后续直接对接 95306 相关数据
// 登录环节按需求省略：无登录页、无权限校验，运营方（管理员）视角直接进入
(function () {
  'use strict';

  var STORAGE_KEY = 'hz_rail_price_index';
  var VERSION = 'v4';              // 内置数据版本：v4 = 线路行情卡并排展示，新增黄骅港站→曹庄镇站线路
  var TAX_RATE = 1.09;             // 含税换算系数

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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function parseDate(s) { return new Date(s.replace(/-/g, '/')); }

  function taxOf(p) { return Math.round(p * TAX_RATE * 100) / 100; }

  function round2(x) { return Math.round(x * 100) / 100; }

  function avg(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  // ===== 内置数据 =====
  // 站点库（发站 = 港口铁路站；到站 = 目的站 / 城市）
  var SEED_STATIONS = {
    hot: ['黄骅港站', '武安'],
    ports: ['黄骅港站', '天津港站', '曹妃甸港站'],
    dests: ['武安', '邢台南站', '曹庄镇站', '康城站', '涉县']
  };

  // 货物种类库
  var SEED_GOODS = {
    hot: ['铁矿石'],
    all: ['铁矿石', '钢坯', '焦炭']
  };

  // 货物品类 → 品名映射（运价查询「按品类」使用）
  var GOODS_CATEGORIES = {
    '金属矿石及矿粉': ['铁矿石'],
    '钢铁及有色金属': ['钢坯'],
    '煤炭及焦炭': ['焦炭']
  };

  // 预置报价记录（固定值手写数据，非随机生成）
  var SEED_RECORDS = [
    { id: 'rl-demo-01', dataDate: '2026-10-13', goods: '铁矿石', from: '黄骅港站', to: '武安', price: 51.80, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-13 15:05' },
    { id: 'rl-demo-02', dataDate: '2026-10-14', goods: '铁矿石', from: '黄骅港站', to: '邢台南站', price: 45.00, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-14 15:12' },
    { id: 'rl-demo-03', dataDate: '2026-10-15', goods: '钢坯', from: '天津港站', to: '武安', price: 60.50, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-15 15:08' },
    { id: 'rl-demo-04', dataDate: '2026-10-16', goods: '铁矿石', from: '黄骅港站', to: '武安', price: 51.80, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-16 15:03' },
    { id: 'rl-demo-05', dataDate: '2026-10-18', goods: '铁矿石', from: '黄骅港站', to: '邢台南站', price: 45.20, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-18 15:16' },
    { id: 'rl-demo-06', dataDate: '2026-10-20', goods: '铁矿石', from: '黄骅港站', to: '武安', price: 52.10, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-20 15:09' },
    { id: 'rl-demo-07', dataDate: '2026-10-21', goods: '钢坯', from: '天津港站', to: '武安', price: 60.00, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-21 15:14' },
    { id: 'rl-demo-08', dataDate: '2026-10-23', goods: '铁矿石', from: '黄骅港站', to: '邢台南站', price: 45.00, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-23 15:07' },
    { id: 'rl-demo-09', dataDate: '2026-10-24', goods: '铁矿石', from: '黄骅港站', to: '武安', price: 52.35, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-24 15:11' },
    { id: 'rl-demo-10', dataDate: '2026-10-25', goods: '钢坯', from: '天津港站', to: '武安', price: 60.40, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-25 15:06' },
    { id: 'rl-demo-11', dataDate: '2026-10-14', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.60, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-14 15:10' },
    { id: 'rl-demo-12', dataDate: '2026-10-16', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.60, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-16 15:04' },
    { id: 'rl-demo-13', dataDate: '2026-10-18', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.80, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-18 15:13' },
    { id: 'rl-demo-14', dataDate: '2026-10-20', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.80, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-20 15:07' },
    { id: 'rl-demo-15', dataDate: '2026-10-22', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.95, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-22 15:12' },
    { id: 'rl-demo-16', dataDate: '2026-10-25', goods: '铁矿石', from: '黄骅港站', to: '曹庄镇站', price: 47.95, remark: '', evidences: [], uploader: '系统管理员', uploadedAt: '2026-10-25 15:09' }
  ];

  function buildSeed() {
    return {
      __version: VERSION,
      stations: JSON.parse(JSON.stringify(SEED_STATIONS)),
      goods: JSON.parse(JSON.stringify(SEED_GOODS)),
      records: JSON.parse(JSON.stringify(SEED_RECORDS))
    };
  }

  // ===== 数据读写（localStorage） =====
  var db = null;

  function loadDB() {
    if (db) return db;
    try {
      var v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (v && v.__version === VERSION && v.stations && v.goods && Array.isArray(v.records)) {
        db = v;
        return db;
      }
    } catch (e) { /* 解析失败则重建种子 */ }
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
  function allStations() {
    return db.stations.hot.concat(db.stations.ports, db.stations.dests);
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

  // 基期值：数据集最早一天的均价（指定记录集口径）
  function baseValue(recs) {
    var sorted = recs.slice().sort(function (a, b) { return a.dataDate.localeCompare(b.dataDate); });
    if (!sorted.length) return null;
    var firstDay = sorted[0].dataDate;
    return round2(avg(sorted.filter(function (r) { return r.dataDate === firstDay; })
      .map(function (r) { return r.price; })));
  }

  // ===== 页面状态 =====
  var state = {
    routeKey: ''         // 行情卡选中线路（'' = 全部线路综合）
  };

  // 按线路过滤记录
  function recsOfRoute(routeKey) {
    if (!routeKey) return db.records;
    return db.records.filter(function (r) { return r.from + '|' + r.to === routeKey; });
  }

  // 按数据日期分组求均价序列：[{ date, pre, tax, idx, uploader, uploadedAt }]
  function daySeries(recs) {
    if (!recs.length) return { series: [], base: null };
    var base = baseValue(recs);
    var byDay = {};
    recs.forEach(function (r) {
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
        idx: base ? round2(pre / base * 100) : null,
        uploader: g.rec.uploader,
        uploadedAt: g.rec.uploadedAt,
        rec: g.rec
      };
    });
    return { series: series, base: base };
  }

  // ===== 指数行情区 =====
  function chgHTML(diff, pct) {
    var cls = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
    var arrow = diff > 0 ? '▲' : (diff < 0 ? '▼' : '—');
    var text = diff === 0 ? '持平' : arrow + ' ' + Math.abs(diff).toFixed(2) + '（' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%）';
    return '<span class="chg ' + cls + '">' + text + '</span>';
  }

  function renderRouteCards() {
    var box = $('#routeCards');
    var routes = deriveRoutes();

    if (!routes.length) {
      box.innerHTML = '<div class="rl-empty" style="grid-column:1/-1;">暂无线路行情数据</div>';
      return;
    }

    box.innerHTML = routes.map(function (rt) {
      var ds = daySeries(recsOfRoute(rt.key));
      var series = ds.series;
      var latest = series[series.length - 1];
      var prev = series.length > 1 ? series[series.length - 2] : null;
      var chg;
      if (prev) {
        var diff = round2(latest.pre - prev.pre);
        var pct = prev.pre ? diff / prev.pre * 100 : 0;
        chg = chgHTML(diff, pct);
      } else {
        chg = '<span class="chg flat">首条</span>';
      }
      var active = state.routeKey === rt.key ? ' active' : '';
      return '<div class="rl-route-card' + active + '" data-route="' + esc(rt.key) + '">' +
        '<div class="rl-route-name">' + esc(rt.from + ' → ' + rt.to) + '</div>' +
        '<div class="rl-route-price">' + latest.pre.toFixed(2) + '<small>元/吨</small></div>' +
        '<div class="rl-route-foot"><span>' + chg + '</span><span>' + esc(latest.date) + '</span></div>' +
        '</div>';
    }).join('');

    box.querySelectorAll('.rl-route-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.routeKey = card.dataset.route === state.routeKey ? '' : card.dataset.route;
        renderRouteCards();
      });
    });
  }

  // 近一周平均价（全部线路，截至最新数据日向前 7 个自然日的不含税均价）
  function renderWeekAvg() {
    var box = $('#weekAvgBar');
    if (!box) return;
    if (!db.records.length) { box.innerHTML = ''; return; }
    var dates = db.records.map(function (r) { return r.dataDate; }).sort();
    var end = dates[dates.length - 1];
    var startT = parseDate(end).getTime() - 6 * 86400000;
    var start = fmtDate(new Date(startT));
    var inWeek = db.records.filter(function (r) {
      return parseDate(r.dataDate).getTime() >= startT;
    });
    var pre = avg(inWeek.map(function (r) { return r.price; }));
    box.innerHTML = '近一周平均价 <b>' + pre.toFixed(2) + '</b><span class="rl-week-unit">元/吨</span>' +
      '<span class="rl-week-meta">不含税 · ' + esc(start) + ' ~ ' + esc(end) + ' · ' + inWeek.length + ' 条报价</span>';
  }

  function refreshAfterDataChange() {
    renderWeekAvg();
    renderRouteCards();
  }

  // ===== 运价查询 =====
  // 发站 / 到站 / 货物候选（复用基础数据库）
  function initQueryOptions() {
    var stations = allStations();
    $('#qFromList').innerHTML = stations.map(function (s) {
      return '<option value="' + esc(s) + '"></option>';
    }).join('');
    $('#qToList').innerHTML = stations.map(function (s) {
      return '<option value="' + esc(s) + '"></option>';
    }).join('');
    $('#qGoodsList').innerHTML = allGoodsOptions().map(function (g) {
      return '<option value="' + esc(g) + '"></option>';
    }).join('');
    $('#qGoodsCat').innerHTML = Object.keys(GOODS_CATEGORIES).map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
  }

  // 品名 / 品类输入方式切换
  function switchGoodsMode() {
    var isCat = $('#qGoodsMode').value === 'cat';
    $('#qGoodsNameWrap').style.display = isCat ? 'none' : '';
    $('#qGoodsCatWrap').style.display = isCat ? '' : 'none';
  }

  // 费用测算：以该线路（优先匹配货物）最新不含税报价为基准
  var QUERY_DEFAULT_BASE = 52.00;   // 无报价时的默认基准价（元/吨）
  var QUERY_STAMP_RATE = 0.00021;   // 印花税估算比例（按运费）
  var QUERY_DEFS = [
    { name: '整车', unit: '(元/车)', tons: 70, useFee: 0 },
    { name: '20英尺集装箱', unit: '(元/箱)', tons: 25, useFee: 53.00 },
    { name: '40英尺集装箱', unit: '(元/箱)', tons: 35, useFee: 106.00 },
    { name: '35吨敞顶箱', unit: '(元/箱)', tons: 35, useFee: 53.00 }
  ];

  function calcQueryFees(from, to, goodsKeys) {
    var recs = db.records.filter(function (r) { return r.from === from && r.to === to; });
    var exact = recs.filter(function (r) { return goodsKeys.indexOf(r.goods) !== -1; });
    var pool = exact.length ? exact : recs;
    var base, note;
    if (pool.length) {
      var latest = pool.slice().sort(function (a, b) {
        return b.dataDate.localeCompare(a.dataDate) || b.uploadedAt.localeCompare(a.uploadedAt);
      })[0];
      base = latest.price;
      note = '测算基准：' + latest.dataDate + ' · ' + latest.from + ' → ' + latest.to + ' · ' +
        latest.goods + ' · 报价 ' + base.toFixed(2) + ' 元/吨（不含税）';
      if (!exact.length) note += '（该货物暂无此线路报价，按线路综合价测算）';
    } else {
      base = QUERY_DEFAULT_BASE;
      note = '该线路暂无系统报价，按默认基准价 ' + QUERY_DEFAULT_BASE.toFixed(2) + ' 元/吨（不含税）测算';
    }

    var rows = QUERY_DEFS.map(function (d) {
      var freight = round2(base * d.tons);
      var stamp = round2(freight * QUERY_STAMP_RATE);
      return {
        name: d.name, unit: d.unit, na: false,
        total: round2(freight + d.useFee + stamp),
        freight: freight, load: 0, deliver: 0, useFee: d.useFee, intl: 0, stamp: stamp
      };
    });
    // 批量快运：当前不办理
    rows.push({ name: '批量快运', unit: '(元/吨)', na: true });
    return { rows: rows, note: note };
  }

  // 结果表表头（双行：办理方式/单位/预计费用合计 + 其中六项）
  function queryHeadHTML() {
    return '<thead>' +
      '<tr><th rowspan="2">办理方式</th><th rowspan="2">单位</th><th rowspan="2">预计费用合计(¥)</th><th colspan="6">其中</th></tr>' +
      '<tr><th>运费(¥)</th><th>装卸费(¥)</th><th>接取送达费(¥)</th><th>集装箱使用费(¥)</th><th>国联换装费(¥)</th><th>印花税(¥)</th></tr>' +
      '</thead>';
  }

  // 未查询时：表格骨架常驻，仅显示占位行（高度约四行）
  function renderQueryPlaceholder() {
    $('#qTable').innerHTML = queryHeadHTML() +
      '<tbody><tr><td colspan="9" class="rl-empty qt-ph">输入发站 / 到站与货物信息后，点击「查询」查看测算结果</td></tr></tbody>';
  }

  function doQuery() {
    var from = $('#qFrom').value.trim();
    var to = $('#qTo').value.trim();
    var mode = $('#qGoodsMode').value;
    var goods = mode === 'cat' ? $('#qGoodsCat').value : $('#qGoodsName').value.trim();

    if (!from) { toast('请选择或填写发站'); return; }
    if (!to) { toast('请选择或填写到站'); return; }
    if (from === to) { toast('发站与到站不能相同'); return; }
    if (!goods) { toast('请选择或填写货物信息'); return; }

    var goodsKeys = mode === 'cat' ? (GOODS_CATEGORIES[goods] || [goods]) : [goods];
    var res = calcQueryFees(from, to, goodsKeys);

    $('#qSummary').innerHTML = '<b>' + esc(from) + '</b> → <b>' + esc(to) + '</b>' +
      ' · 货物：<b>' + esc(goods) + '</b>（' + (mode === 'cat' ? '按品类' : '按品名') + '）';
    $('#qSummary').hidden = false;
    $('#qNote').textContent = '测算说明：' + res.note +
      '；整车按 70 吨/车、20英尺箱按 25 吨/箱、40英尺箱与 35 吨敞顶箱按 35 吨/箱计费，' +
      '印花税按运费 ' + (QUERY_STAMP_RATE * 1000).toFixed(2) + '‰ 估算，实际费用以铁路 95306 公布运价为准。';
    $('#qNote').hidden = false;

    var html = queryHeadHTML() + '<tbody>';

    res.rows.forEach(function (r) {
      if (r.na) {
        html += '<tr><td class="qt-left">' + esc(r.name) + '</td><td class="qt-left">' + esc(r.unit) + '</td>' +
          '<td class="qt-na">不办理此项业务</td>' +
          '<td class="qt-dash">--</td><td class="qt-dash">--</td><td class="qt-dash">--</td>' +
          '<td class="qt-dash">--</td><td class="qt-dash">--</td><td class="qt-dash">--</td></tr>';
      } else {
        html += '<tr><td class="qt-left">' + esc(r.name) + '</td><td class="qt-left">' + esc(r.unit) + '</td>' +
          '<td class="num">' + r.total.toFixed(2) + '</td>' +
          '<td class="num">' + r.freight.toFixed(2) + '</td>' +
          '<td class="num">' + r.load.toFixed(2) + '</td>' +
          '<td class="num">' + r.deliver.toFixed(2) + '</td>' +
          '<td class="num">' + r.useFee.toFixed(2) + '</td>' +
          '<td class="num">' + r.intl.toFixed(2) + '</td>' +
          '<td class="num">' + r.stamp.toFixed(2) + '</td></tr>';
      }
    });
    html += '</tbody>';

    $('#qTable').innerHTML = html;
  }

  function clearQuery() {
    $('#qFrom').value = '';
    $('#qTo').value = '';
    $('#qGoodsMode').value = 'name';
    switchGoodsMode();
    $('#qGoodsName').value = '';
    $('#qSummary').hidden = true;
    $('#qNote').hidden = true;
    renderQueryPlaceholder();
  }

  // ===== 导航高亮 =====
  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar || !navbar.children.length) return;
    var sub = navbar.querySelector('.nav-sub-item[data-path="价格指数管理 / 火运价格指数"]');
    if (!sub) return;
    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(function (el) { el.classList.remove('active'); });
    sub.classList.add('active');
    var group = sub.closest('.nav-group');
    if (group) group.classList.add('open');
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 运价查询
    $('#qGoodsMode').addEventListener('change', switchGoodsMode);
    $('#btnQuery').addEventListener('click', doQuery);
    $('#btnQueryReset').addEventListener('click', clearQuery);
  }

  // ===== 初始化 =====
  function init() {
    loadDB();
    initQueryOptions();
    switchGoodsMode();
    renderQueryPlaceholder();
    refreshAfterDataChange();
    bindEvents();
    setActiveNav();
    document.addEventListener('navbar:loaded', setActiveNav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
