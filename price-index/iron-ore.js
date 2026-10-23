// ===== 铁矿石价格指数页（数据参考：我的钢铁网 Mysteel） =====
// 页面结构：指数概览卡（4）+ 近七天指数趋势（SVG 折线，零依赖）+ 各港口近七日现货价格表
// 口径说明：指数为 Mysteel 62% Fe 澳粉指数（美元/干吨，CIF 中国）；
//          港口表为北方主要接卸港现货成交/提货价（元/湿吨，含税），周末休市沿用最近交易日价格。
(function () {
  'use strict';

  // ===== 种子数据（近七日：2026-10-14 ~ 2026-10-20） =====
  const DAYS = [
    { date: '10-14', week: '周三' },
    { date: '10-15', week: '周四' },
    { date: '10-16', week: '周五' },
    { date: '10-17', week: '周六' },
    { date: '10-18', week: '周日' },
    { date: '10-19', week: '周一' },
    { date: '10-20', week: '周二' }
  ];

  // Mysteel 62% 澳粉指数（美元/干吨）：周末休市沿用周五价
  const INDEX = [101.15, 101.8, 102.35, 102.35, 102.35, 101.6, 102.05];

  // 各港口铁矿石现货价格（元/湿吨）：每港 3 个主流品种 × 近七日
  const PORTS = [
    {
      port: '青岛港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [756, 758, 761, 761, 761, 759, 763] },
        { name: '超特粉', grade: '56.1%', prices: [618, 620, 622, 622, 622, 621, 625] },
        { name: 'PB块', grade: '62.5%', prices: [812, 815, 818, 818, 818, 816, 821] }
      ]
    },
    {
      port: '日照港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [755, 757, 760, 760, 760, 758, 762] },
        { name: '麦克粉', grade: '61%', prices: [738, 740, 742, 742, 742, 741, 744] },
        { name: '超特粉', grade: '56.1%', prices: [617, 619, 621, 621, 621, 620, 624] }
      ]
    },
    {
      port: '京唐港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [759, 761, 764, 764, 764, 762, 766] },
        { name: '纽曼粉', grade: '62.5%', prices: [772, 774, 776, 776, 776, 775, 778] },
        { name: '超特粉', grade: '56.1%', prices: [620, 622, 624, 624, 624, 623, 627] }
      ]
    },
    {
      port: '曹妃甸港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [758, 760, 763, 763, 763, 761, 765] },
        { name: '麦克粉', grade: '61%', prices: [740, 742, 744, 744, 744, 743, 746] },
        { name: '混合粉', grade: '58.7%', prices: [700, 702, 704, 704, 704, 703, 706] }
      ]
    },
    {
      port: '天津港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [760, 762, 765, 765, 765, 763, 767] },
        { name: '超特粉', grade: '56.1%', prices: [621, 623, 625, 625, 625, 624, 628] },
        { name: '金步巴粉', grade: '60.5%', prices: [745, 747, 749, 749, 749, 748, 751] }
      ]
    },
    {
      port: '连云港',
      items: [
        { name: 'PB粉', grade: '62.5%', prices: [757, 759, 762, 762, 762, 760, 764] },
        { name: '麦克粉', grade: '61%', prices: [739, 741, 743, 743, 743, 742, 745] },
        { name: '超特粉', grade: '56.1%', prices: [619, 621, 623, 623, 623, 622, 626] }
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

  // ===== 指数概览卡片 =====
  function renderKpi() {
    const box = document.getElementById('kpiGrid');
    if (!box) return;

    const last = INDEX[INDEX.length - 1];
    const prev = INDEX[INDEX.length - 2];
    const dayChg = +(last - prev).toFixed(2);
    const dayPct = prev ? ((last - prev) / prev * 100).toFixed(2) : '0.00';
    const weekChg = +(last - INDEX[0]).toFixed(2);
    const weekPct = INDEX[0] ? ((last - INDEX[0]) / INDEX[0] * 100).toFixed(2) : '0.00';
    const qdPb = PORTS[0].items[0].prices[PORTS[0].items[0].prices.length - 1];

    const cards = [
      {
        cls: 'blue',
        label: 'Mysteel 62% 澳粉指数',
        value: last.toFixed(2),
        trend: '美元/干吨 · CIF 中国 · ' + DAYS[DAYS.length - 1].date,
        icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'
      },
      {
        cls: dayChg >= 0 ? 'up' : 'down',
        label: '较上日涨跌',
        value: chgText(dayChg) + '（' + (dayChg >= 0 ? '+' : '') + dayPct + '%）',
        trend: '日度环比 · 红涨绿跌',
        icon: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'
      },
      {
        cls: weekChg >= 0 ? 'up' : 'down',
        label: '近七日涨跌',
        value: chgText(weekChg) + '（' + (weekChg >= 0 ? '+' : '') + weekPct + '%）',
        trend: DAYS[0].date + ' → ' + DAYS[DAYS.length - 1].date,
        icon: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M2 20h20"/>'
      },
      {
        cls: 'green',
        label: '青岛港 PB 粉现货',
        value: String(qdPb),
        trend: '元/湿吨 · 62.5% Fe · 港口现货',
        icon: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21"/><path d="M5 12c0 5 3.5 9 7 9s7-4 7-9"/><path d="M8 12H5m11 0h3"/>'
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

  // ===== 近七天指数趋势（SVG 折线，零依赖，与海运/矿山看板同款画法） =====
  function renderTrend() {
    const svg = document.getElementById('trendChart');
    if (!svg) return;

    const W = 1000, H = 320;
    const PAD_L = 64, PAD_R = 24, PAD_T = 34, PAD_B = 48;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    const vMin = Math.min.apply(null, INDEX);
    const vMax = Math.max.apply(null, INDEX);
    // Y 轴范围向上下各留 0.3 美元余量，并按 0.5 取整刻度
    const yMin = Math.floor((vMin - 0.3) * 2) / 2;
    const yMax = Math.ceil((vMax + 0.3) * 2) / 2;
    const ySpan = yMax - yMin || 1;

    const xAt = i => PAD_L + (innerW * i) / (INDEX.length - 1);
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
        '" text-anchor="end">' + v.toFixed(1) + '</text>');
    }

    // 面积 + 折线
    const linePts = INDEX.map((v, i) => xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1));
    parts.push('<polygon fill="url(#trendFill)" points="' +
      PAD_L + ',' + (PAD_T + innerH).toFixed(1) + ' ' + linePts.join(' ') + ' ' + (W - PAD_R) + ',' + (PAD_T + innerH).toFixed(1) + '"/>');
    parts.push('<polyline class="trend-line" points="' + linePts.join(' ') + '"/>');

    // 数据点 + 数值 + 悬停说明
    INDEX.forEach((v, i) => {
      const x = xAt(i), y = yAt(v);
      const d = INDEX[i] - (i > 0 ? INDEX[i - 1] : v);
      parts.push('<circle class="trend-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5">' +
        '<title>' + esc('2026-' + DAYS[i].date + '（' + DAYS[i].week + '）：' + v.toFixed(2) +
          ' 美元/干吨' + (i > 0 ? '（' + chgText(d) + '）' : '')) + '</title></circle>');
      parts.push('<text class="trend-value" x="' + x.toFixed(1) + '" y="' + (y - 12).toFixed(1) +
        '" text-anchor="middle">' + v.toFixed(2) + '</text>');
    });

    // 横轴日期 + 星期
    INDEX.forEach((v, i) => {
      const x = xAt(i);
      parts.push('<text class="trend-label" x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 22) +
        '" text-anchor="middle">' + DAYS[i].date + '</text>');
      parts.push('<text class="trend-label" x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 38) +
        '" text-anchor="middle" font-size="11">' + DAYS[i].week + '</text>');
    });

    svg.innerHTML = parts.join('');
  }

  // ===== 各港口近七日价格表 =====
  function renderTable() {
    const table = document.getElementById('priceTable');
    if (!table) return;

    // 表头：港口 | 品种 | 近七日日期列 | 7日涨跌
    let html = '<thead><tr>' +
      '<th style="width:96px;">港口</th>' +
      '<th style="width:150px;text-align:left;">品种（品位）</th>' +
      DAYS.map(d => '<th class="day-head">' + d.date + '<span class="week-tag">' + d.week + '</span></th>').join('') +
      '<th style="width:88px;">7日涨跌</th>' +
      '</tr></thead>';

    html += '<tbody>';
    PORTS.forEach(p => {
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

  // ===== 启动 =====
  renderKpi();
  renderTrend();
  renderTable();
})();
