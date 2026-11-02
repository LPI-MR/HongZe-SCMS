// ===== 铁矿石价格指数页（数据参考：我的钢铁网 Mysteel） =====
// 页面结构：价格概览卡（2）+ 近七日价格走势（SVG 折线，零依赖）+ 各港口近七日现货价格表
// 口径说明：与 Mysteel 港口现货一致，均为现货成交/提货价（元/湿吨，含税），周末休市沿用最近交易日价格。
(function () {
  'use strict';

  // ===== 种子数据（近七日：2026-10-27 ~ 2026-11-02，周末休市沿用最近交易日价格） =====
  const DAYS = [
    { date: '10-27', week: '周二' },
    { date: '10-28', week: '周三' },
    { date: '10-29', week: '周四' },
    { date: '10-30', week: '周五' },
    { date: '10-31', week: '周六' },
    { date: '11-01', week: '周日' },
    { date: '11-02', week: '周一' }
  ];

  // 各港口铁矿石现货价格（元/湿吨，含税）：与我的钢铁网（Mysteel）港口现货一致
  // 基准：PB粉（61.5% Fe）日照港 / 青岛港 650 元/湿吨（Mysteel 实价）；
  //      其余港口按区域升贴水 ±5 元内估计；周末休市沿用最近交易日
  // 品种价差：纽曼粉 +5 / PB块 +85 / 麦克粉 -15 / 金布巴粉 -15 / 混合粉 -60 / 超特粉 -125
  const PORTS = [
    {
      port: '黄骅港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [650, 652, 655, 653, 653, 653, 655] },
        { name: '纽曼粉', grade: '60.7%', prices: [655, 657, 660, 658, 658, 658, 660] },
        { name: '超特粉', grade: '56.5%', prices: [525, 527, 530, 528, 528, 528, 530] }
      ]
    },
    {
      port: '天津港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [647, 649, 652, 650, 650, 650, 652] },
        { name: '超特粉', grade: '56.5%', prices: [522, 524, 527, 525, 525, 525, 527] },
        { name: '金布巴粉', grade: '60.3%', prices: [632, 634, 637, 635, 635, 635, 637] }
      ]
    },
    {
      port: '日照港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [645, 647, 650, 648, 648, 648, 650] },
        { name: '麦克粉', grade: '60.5%', prices: [630, 632, 635, 633, 633, 633, 635] },
        { name: '超特粉', grade: '56.5%', prices: [520, 522, 525, 523, 523, 523, 525] }
      ]
    },
    {
      port: '青岛港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [645, 647, 650, 648, 648, 648, 650] },
        { name: '超特粉', grade: '56.5%', prices: [520, 522, 525, 523, 523, 523, 525] },
        { name: 'PB块', grade: '62.5%', prices: [730, 732, 735, 733, 733, 733, 735] }
      ]
    },
    {
      port: '京唐港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [646, 648, 651, 649, 649, 649, 651] },
        { name: '纽曼粉', grade: '60.7%', prices: [651, 653, 656, 654, 654, 654, 656] },
        { name: '超特粉', grade: '56.5%', prices: [521, 523, 526, 524, 524, 524, 526] }
      ]
    },
    {
      port: '曹妃甸港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [646, 648, 651, 649, 649, 649, 651] },
        { name: '麦克粉', grade: '60.5%', prices: [631, 633, 636, 634, 634, 634, 636] },
        { name: '混合粉', grade: '58.7%', prices: [586, 588, 591, 589, 589, 589, 591] }
      ]
    },
    {
      port: '连云港',
      items: [
        { name: 'PB粉', grade: '61.5%', prices: [644, 646, 649, 647, 647, 647, 649] },
        { name: '麦克粉', grade: '60.5%', prices: [629, 631, 634, 632, 632, 632, 634] },
        { name: '超特粉', grade: '56.5%', prices: [519, 521, 524, 522, 522, 522, 524] }
      ]
    }
  ];

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 涨跌分类：up / down / flat
  function chgClass(v) {
    return v > 0 ? 'up' : (v < 0 ? 'down' : 'flat');
  }

  // 涨跌文案：+0.45 / -0.75 / —
  function chgText(v, digits) {
    if (!v) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(digits == null ? 2 : digits);
  }

  // ===== 价格概览卡片（随系统日期自动更新，未更新日沿用最近交易日价格） =====
  var DATA_START = { y: 2026, m: 10, d: 27 };  // 数据窗口首日
  var DATA_END = { y: 2026, m: 11, d: 2 };     // 数据窗口末日（最近有价日）
  var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function fmtMD(dt) {
    return String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  // 某一日的有效价格：超出数据窗口（或未来/未更新）→ 沿用窗口内最近有价日
  function effectivePrice(dayDate, prices) {
    const start = new Date(DATA_START.y, DATA_START.m - 1, DATA_START.d);
    const end = new Date(DATA_END.y, DATA_END.m - 1, DATA_END.d);
    const d = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
    const anchor = d > end ? end : (d < start ? start : d);
    const idx = Math.round((anchor - start) / 86400000);
    return prices[idx] != null ? prices[idx] : prices[prices.length - 1];
  }

  function renderKpi() {
    const box = document.getElementById('kpiGrid');
    if (!box) return;

    // 基准价：PB粉（61.5%）港口现货（日照港 / 青岛港，Mysteel 实价口径）
    const benchPort = PORTS.find(p => p.port === '日照港');
    const bench = benchPort && benchPort.items.find(i => i.name === 'PB粉');
    const prices = bench ? bench.prices : [0, 0];

    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const last = effectivePrice(today, prices);
    const prev = effectivePrice(yesterday, prices);
    const dayChg = last - prev;
    const dayPct = prev ? ((last - prev) / prev * 100).toFixed(2) : '0.00';
    const chgStr = dayChg === 0
      ? '0（0.00%）'
      : chgText(dayChg, 0) + '（' + (dayChg > 0 ? '+' : '') + dayPct + '%）';

    // 今日价格若为沿用（超出数据窗口），在标注中说明
    const end = new Date(DATA_END.y, DATA_END.m - 1, DATA_END.d);
    const carried = new Date(today.getFullYear(), today.getMonth(), today.getDate()) > end;
    const dateLabel = fmtMD(today) + (carried ? '（沿用 ' + fmtMD(end) + '）' : '');

    const cards = [
      {
        cls: 'blue',
        label: 'PB粉（61.5%）港口现货',
        value: String(last),
        trend: '元/湿吨 · 日照港/青岛港 · ' + dateLabel,
        icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'
      },
      {
        cls: dayChg > 0 ? 'up' : (dayChg < 0 ? 'down' : ''),
        label: '较上日涨跌',
        value: chgStr,
        trend: WEEK_CN[today.getDay()] + ' · 随日期自动更新',
        icon: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'
      }
    ];

    box.innerHTML = cards.map(c =>
      '<div class="kpi-card ' + c.cls + '">' +
        '<div class="kpi-info">' +
          '<div class="kpi-label">' + esc(c.label) + '</div>' +
          '<div class="kpi-value">' + esc(c.value) + '</div>' +
          '<div class="kpi-trend">' + esc(c.trend) + '</div>' +
        '</div>' +
        '<div class="kpi-icon"><svg viewBox="0 0 24 24">' + c.icon + '</svg></div>' +
      '</div>'
    ).join('');
  }

  // ===== 近七日价格走势（港口 × 品种现货价；可搜索切换，默认黄骅港 PB粉） =====
  function comboKey(port, name, grade) {
    return port + ' ' + name + '（' + grade + '）';
  }

  function allCombos() {
    const list = [];
    PORTS.forEach(p => p.items.forEach(it =>
      list.push({ port: p.port, name: it.name, grade: it.grade, prices: it.prices })));
    return list;
  }

  function defaultCombo() {
    const f = PORTS[0].items[0];
    return { port: PORTS[0].port, name: f.name, grade: f.grade, prices: f.prices };
  }

  // 当前选中系列（默认黄骅港 PB粉）
  let trendSel = defaultCombo();

  function renderTrendList() {
    const dl = document.getElementById('trendList');
    if (!dl) return;
    dl.innerHTML = allCombos()
      .map(c => '<option value="' + esc(comboKey(c.port, c.name, c.grade)) + '"></option>')
      .join('');
  }

  function getTrendSeries() {
    return {
      values: trendSel.prices, unit: '元/湿吨',
      title: comboKey(trendSel.port, trendSel.name, trendSel.grade) + ' · 近七日价格走势',
      sub: '港口现货成交/提货价（元/湿吨，含税）'
    };
  }

  function renderTrend() {
    const svg = document.getElementById('trendChart');
    if (!svg) return;

    const s = getTrendSeries();
    const vals = s.values;

    const titleEl = document.getElementById('trendTitle');
    const subEl = document.getElementById('trendSub');
    if (titleEl) titleEl.textContent = s.title;
    if (subEl) subEl.textContent = s.sub;

    const W = 1000, H = 320;
    const PAD_L = 64, PAD_R = 24, PAD_T = 34, PAD_B = 48;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    const vMin = Math.min.apply(null, vals);
    const vMax = Math.max.apply(null, vals);
    // Y 轴上下各留 20% 余量（范围过小时兜底 0.5），刻度小数位随量级自适应
    const margin = (vMax - vMin) * 0.2 || 0.5;
    const yMin = vMin - margin;
    const yMax = vMax + margin;
    const ySpan = yMax - yMin || 1;
    // 价格口径：轴刻度与数据点均取整
    const axisDp = 0;
    const dotDp = 0;

    const xAt = i => PAD_L + (innerW * i) / (vals.length - 1);
    const yAt = v => PAD_T + innerH - ((v - yMin) / ySpan) * innerH;

    const parts = [];

    // 渐变面积填充
    parts.push(
      '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#4080FF" stop-opacity="0.18"/>' +
        '<stop offset="100%" stop-color="#4080FF" stop-opacity="0"/>' +
      '</linearGradient></defs>'
    );

    // 横向网格 + 纵轴刻度（5 段）
    const SEG = 5;
    for (let i = 0; i <= SEG; i++) {
      const v = yMin + (ySpan * i) / SEG;
      const gy = yAt(v);
      parts.push('<line class="' + (i === 0 ? 'trend-axis' : 'trend-grid') +
        '" x1="' + PAD_L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="trend-label" x="' + (PAD_L - 8) + '" y="' + (gy + 4).toFixed(1) +
        '" text-anchor="end">' + v.toFixed(axisDp) + '</text>');
    }

    // 面积 + 折线
    const linePts = vals.map((v, i) => xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1));
    parts.push('<polygon fill="url(#trendFill)" points="' +
      PAD_L + ',' + (PAD_T + innerH).toFixed(1) + ' ' + linePts.join(' ') + ' ' + (W - PAD_R) + ',' + (PAD_T + innerH).toFixed(1) + '"/>');
    parts.push('<polyline class="trend-line" points="' + linePts.join(' ') + '"/>');

    // 数据点 + 数值 + 悬停说明
    vals.forEach((v, i) => {
      const x = xAt(i), y = yAt(v);
      const d = vals[i] - (i > 0 ? vals[i - 1] : v);
      parts.push('<circle class="trend-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5">' +
        '<title>' + esc('2026-' + DAYS[i].date + '（' + DAYS[i].week + '）：' + v.toFixed(2) + ' ' + s.unit +
          (i > 0 ? '（' + chgText(d) + '）' : '')) + '</title></circle>');
      parts.push('<text class="trend-value" x="' + x.toFixed(1) + '" y="' + (y - 12).toFixed(1) +
        '" text-anchor="middle">' + v.toFixed(dotDp) + '</text>');
    });

    // 横轴日期 + 星期
    vals.forEach((v, i) => {
      const x = xAt(i);
      parts.push('<text class="trend-label" x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 22) +
        '" text-anchor="middle">' + DAYS[i].date + '</text>');
      parts.push('<text class="trend-label" x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 38) +
        '" text-anchor="middle" font-size="11">' + DAYS[i].week + '</text>');
    });

    svg.innerHTML = parts.join('');
  }

  // ===== 各港口近七日价格表 =====
  let portKeyword = '';

  // 关键字筛选：空格分隔多关键字，全部命中才保留
  // 港口名命中 → 显示该港全部品种；否则仅显示品种/品位命中的品种
  function filterPorts() {
    const kws = portKeyword.split(/\s+/).filter(Boolean);
    if (!kws.length) return PORTS;
    return PORTS.map(p => {
      if (kws.every(k => p.port.indexOf(k) !== -1)) return p;
      const items = p.items.filter(it => kws.every(k => (it.name + it.grade).indexOf(k) !== -1));
      return items.length ? { port: p.port, items: items } : null;
    }).filter(Boolean);
  }

  function renderTable() {
    const table = document.getElementById('priceTable');
    if (!table) return;

    const ports = filterPorts();
    const cnt = document.getElementById('portSearchCount');

    if (!ports.length) {
      table.innerHTML = '<tbody><tr><td class="port-empty">未找到与「' + esc(portKeyword) + '」匹配的港口或品种</td></tr></tbody>';
      if (cnt) cnt.textContent = '';
      return;
    }
    if (cnt) cnt.textContent = portKeyword ? '匹配 ' + ports.length + ' 港 / ' + ports.reduce((n, p) => n + p.items.length, 0) + ' 个品种' : '';

    // 表头：港口 | 品种 | 近七日日期列 | 7日涨跌
    let html = '<thead><tr>' +
      '<th style="width:96px;">港口</th>' +
      '<th style="width:150px;text-align:left;">品种（品位）</th>' +
      DAYS.map(d => '<th class="day-head">' + d.date + '<span class="week-tag">' + d.week + '</span></th>').join('') +
      '<th style="width:88px;">7日涨跌</th>' +
      '</tr></thead>';

    html += '<tbody>';
    ports.forEach(p => {
      p.items.forEach((it, k) => {
        html += '<tr>';
        if (k === 0) {
          html += '<td class="port-cell" rowspan="' + p.items.length + '">' + esc(p.port) + '</td>';
        }
        html += '<td class="item-cell">' + esc(it.name) + '<span class="grade">' + esc(it.grade) + '</span></td>';

        it.prices.forEach((v, i) => {
          const d = i > 0 ? v - it.prices[i - 1] : 0;
          const cls = i > 0 ? chgClass(d) : 'flat';
          const txt = i > 0 ? chgText(d, 0) : '—';
          html += '<td><span class="px">' + v + '</span><span class="chg ' + cls + '">' + txt + '</span></td>';
        });

        const sum = it.prices[it.prices.length - 1] - it.prices[0];
        html += '<td class="sum-chg ' + chgClass(sum) + '">' + chgText(sum, 0) + '</td>';
        html += '</tr>';
      });
    });
    html += '</tbody>';

    table.innerHTML = html;
  }

  // ===== 导航高亮（二级菜单：价格指数管理 / 铁矿石价格指数） =====
  const NAV_SUB_PATH = '价格指数管理 / 铁矿石价格指数';

  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    const sub = Array.prototype.find.call(
      navbar.querySelectorAll('.nav-sub-item'),
      it => (it.dataset.path || '') === NAV_SUB_PATH
    );
    if (sub) {
      sub.classList.add('active');
      const group = sub.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // 返回价格指数门户
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.onclick = function () { location.href = '/price-index/price-index.html'; };

  // ===== 实时行情（大商所铁矿石期货主力连续，经本机 server.js /api/futures 代理转发） =====
  // 说明：现货指数为日度数据，此处用期货盘中价作为实时参考；接口失败静默降级为错误提示，
  //       不影响页面上其余静态参考数据的展示。
  const LIVE_URL = '/api/futures?codes=nf_I0';
  const LIVE_INTERVAL = 15000;   // 15 秒轮询
  let liveTimer = null;

  function liveDot(state) {
    const dot = document.getElementById('ioLiveDot');
    if (dot) dot.className = 'io-dot' + (state ? ' ' + state : '');
  }

  function liveStat(k, v) {
    return '<div class="io-stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
  }

  function renderLive(q) {
    const body = document.getElementById('ioLiveBody');
    if (!body || !q) return;
    const cls = chgClass(q.change || 0);
    const arrow = q.change > 0 ? '▲ +' : (q.change < 0 ? '▼ ' : '');
    const chgTxt = q.change == null ? '—' : arrow + q.change.toFixed(1) + '（' + (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%）';
    body.innerHTML =
      '<div class="io-price ' + cls + '">' + q.price.toFixed(1) + '</div>' +
      '<span class="io-unit">元/吨</span>' +
      '<span class="io-chg ' + cls + '">' + chgTxt + '</span>' +
      '<div class="io-stats">' +
      liveStat('昨结算', q.prevSettle != null ? q.prevSettle.toFixed(1) : '—') +
      liveStat('开盘', q.open != null ? q.open.toFixed(1) : '—') +
      liveStat('最高', q.high != null ? q.high.toFixed(1) : '—') +
      liveStat('最低', q.low != null ? q.low.toFixed(1) : '—') +
      liveStat('成交量', q.volume != null ? Math.round(q.volume).toLocaleString('zh-CN') : '—') +
      liveStat('持仓量', q.openInterest != null ? Math.round(q.openInterest).toLocaleString('zh-CN') : '—') +
      liveStat('行情时间', (q.date || '') + ' ' + (q.time || '')) +
      '</div>';
    liveDot('ok');
  }

  function liveError() {
    const body = document.getElementById('ioLiveBody');
    if (body) body.innerHTML = '<div class="io-live-error">实时行情暂不可用（数据源未响应），下方静态参考数据不受影响</div>';
    liveDot('');
  }

  function fetchLive() {
    fetch(LIVE_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => {
        const q = j && j.ok && j.quotes ? j.quotes.nf_I0 : null;
        if (q) renderLive(q); else liveError();
      })
      .catch(() => liveError());
  }

  function startLive() {
    fetchLive();
    liveTimer = setInterval(fetchLive, LIVE_INTERVAL);
  }

  // 页面不可见时暂停轮询，回到前台立即恢复（监听仅注册一次）
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearInterval(liveTimer);
      liveTimer = null;
    } else if (!liveTimer) {
      startLive();
    }
  });

  // ===== 启动 =====
  renderKpi();
  renderTrendList();
  renderTrend();
  renderTable();
  startLive();

  // ===== 价格表搜索栏 =====
  const portSearch = document.getElementById('portSearch');
  const portSearchClear = document.getElementById('portSearchClear');
  if (portSearch) {
    portSearch.addEventListener('input', function () {
      portKeyword = this.value.trim();
      portSearchClear.style.display = portKeyword ? '' : 'none';
      renderTable();
    });
  }
  if (portSearchClear) {
    portSearchClear.addEventListener('click', function () {
      portKeyword = '';
      portSearch.value = '';
      portSearchClear.style.display = 'none';
      renderTable();
      portSearch.focus();
    });
  }

  // ===== 趋势图搜索（港口 × 品种 → 独立价格趋势，默认黄骅港 PB粉） =====
  const trendSearch = document.getElementById('trendSearch');
  const trendSearchClear = document.getElementById('trendSearchClear');

  function applyTrendSearch(raw) {
    const v = (raw || '').trim();
    if (trendSearchClear) trendSearchClear.style.display = v ? '' : 'none';
    if (!v) return;
    // 唯一命中「港口 品种（品位）」组合才切换，避免歧义
    const hits = allCombos().filter(c => comboKey(c.port, c.name, c.grade).indexOf(v) !== -1);
    if (hits.length === 1) {
      trendSel = hits[0];
      renderTrend();
    }
  }

  if (trendSearch) {
    trendSearch.addEventListener('input', function () { applyTrendSearch(this.value); });
    trendSearch.addEventListener('change', function () { applyTrendSearch(this.value); });
  }
  if (trendSearchClear) {
    trendSearchClear.addEventListener('click', function () {
      trendSearch.value = '';
      trendSearchClear.style.display = 'none';
      trendSel = defaultCombo();
      renderTrend();
    });
  }
})();
