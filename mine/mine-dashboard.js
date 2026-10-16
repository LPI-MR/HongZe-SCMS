// ===== mine 模块脚本（矿山管理 · 数据看板） =====
// 统计卡片 + 分布地图 + 品类环形图 + 省份柱状图
// 数据来源：localStorage hz_mines（矿山列表页维护），口径与列表页统计卡一致（PRD 八、验收标准）
(function () {
  'use strict';

  // 本页对应的导航位置：矿山管理（一级菜单）
  const NAV_PATH = '矿山管理';

  // 设置导航栏选中态：一级「矿山管理」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path === NAV_PATH) item.classList.add('active');
    });
  }

  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 枚举与配色（矿山类型 → 图表颜色，与全站辅助色规范对齐） =====
  const MINE_TYPES = {
    coal: '煤矿',
    iron: '铁矿',
    nonferrous: '有色金属矿',
    nonmetal: '非金属矿',
    other: '其他'
  };

  const TYPE_COLORS = {
    coal: '#4E5969',
    iron: '#4080FF',
    nonferrous: '#FF7D00',
    nonmetal: '#00B42A',
    other: '#86909C'
  };

  // 环形图系列色（PRD 7：主系列 + 辅助系列，禁用高饱和刺眼配色）
  const PIE_COLORS = ['#4080FF', '#7BC6FF', '#FF7D00', '#00B42A', '#86909C', '#722ED1'];

  // ===== 数据层 =====
  function loadMines() {
    try {
      const v = JSON.parse(localStorage.getItem('hz_mines'));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function productsOf(m) {
    return String(m.main_products || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  // 数字滚动动画（与首页/合同看板一致：800ms 缓动 + 千分位）
  function animateValue(el, target, prefix) {
    prefix = prefix || '';
    const duration = 800;
    const start = performance.now();
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString('zh-CN');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ===== 统计卡片 =====
  function renderKpis() {
    const list = loadMines();

    const active = list.filter(m => m.status === 'active').length;
    const provinces = new Set(list.map(m => (m.province || '').trim()).filter(Boolean));
    const prods = new Set();
    list.forEach(m => productsOf(m).forEach(p => prods.add(p)));

    animateValue(document.getElementById('kpiTotal'), list.length);
    animateValue(document.getElementById('kpiActive'), active);
    animateValue(document.getElementById('kpiProvinces'), provinces.size);
    animateValue(document.getElementById('kpiProducts'), prods.size);

    // 趋势行：本月新增（localStorage 无历史快照，环比以本月新增口径呈现）
    const now = new Date();
    const monthPrefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const addedThisMonth = list.filter(m => {
      if (!m.created_at) return false;
      const d = new Date(m.created_at);
      return !isNaN(d.getTime()) &&
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') === monthPrefix;
    }).length;
    document.getElementById('kpiTotalTrend').textContent =
      '本月新增 ' + addedThisMonth + ' 座';
  }

  // ===== 矿山分布地图（经纬度散点，零依赖 SVG） =====
  // 点大小 = 产能归一；点颜色 = 矿山类型；悬停 title 显示详情
  function renderMapChart() {
    const svg = document.getElementById('mapChart');
    const legend = document.getElementById('mapLegend');
    const list = loadMines();

    const W = 1000;
    const H = 520;
    const LON0 = -180;
    const LAT_TOP = 75;
    const LAT_BOTTOM = -60;
    const x = lon => ((lon - LON0) / 360) * W;
    const y = lat => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

    const parts = [];

    // 经纬网格（弱化网格，保证数据视觉优先）
    for (let lon = -150; lon <= 150; lon += 30) {
      parts.push('<line x1="' + x(lon) + '" y1="0" x2="' + x(lon) + '" y2="' + H + '" stroke="#E5E6EB" stroke-width="1"/>');
    }
    for (let lat = 60; lat >= -60; lat -= 30) {
      parts.push('<line x1="0" y1="' + y(lat) + '" x2="' + W + '" y2="' + y(lat) + '" stroke="#E5E6EB" stroke-width="1"/>');
    }
    parts.push('<line x1="0" y1="' + y(0) + '" x2="' + W + '" y2="' + y(0) + '" stroke="#C9CDD4" stroke-width="1"/>');

    // 大洲淡标注（方位参考）
    const continents = [
      ['亚洲', 90, 45], ['欧洲', 20, 52], ['非洲', 20, 0],
      ['北美洲', -100, 45], ['南美洲', -60, -10], ['大洋洲', 134, -25]
    ];
    continents.forEach(([name, lon, lat]) => {
      parts.push('<text x="' + x(lon) + '" y="' + y(lat) + '" text-anchor="middle" font-size="16" fill="#C9CDD4">' + name + '</text>');
    });

    // 散点：仅绘制已登记坐标的矿山
    const plotted = list.filter(m => m.longitude != null && m.latitude != null);

    if (!plotted.length) {
      parts.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="18" fill="#86909C">暂无已登记经纬度的矿山</text>');
      svg.innerHTML = parts.join('');
      legend.innerHTML = '<div class="legend-empty">在矿山列表中补充经纬度后，此处将展示矿山全球分布</div>';
      return;
    }

    // 产能归一：面积 ∝ 产能，半径取平方根（防止大产能点半径过于悬殊）
    const caps = plotted.map(m => Number(m.annual_capacity) || 0);
    const capMax = Math.max.apply(null, caps.concat([0]));
    const rOf = cap => capMax > 0 ? 6 + Math.sqrt(cap / capMax) * 16 : 8;   // 6 ~ 22px

    plotted.forEach(m => {
      const cap = Number(m.annual_capacity) || 0;
      const color = TYPE_COLORS[m.mine_type] || TYPE_COLORS.other;
      const r = rOf(cap);
      const px = x(Number(m.longitude));
      const py = y(Number(m.latitude));
      const name = m.short_name || m.mine_name || '';
      const title = esc(name + '（' + (MINE_TYPES[m.mine_type] || m.mine_type || '—') + '）' +
        ' · 产能 ' + cap.toLocaleString('zh-CN') + ' 万吨/年 · ' +
        [m.province, m.city].filter(Boolean).join(' '));
      parts.push(
        '<circle class="map-dot" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r.toFixed(1) + '"' +
        ' fill="' + color + '" fill-opacity="0.75" stroke="#FFFFFF" stroke-width="1.5"' +
        '><title>' + title + '</title></circle>'
      );
      // 点旁名称标签
      parts.push('<text x="' + px.toFixed(1) + '" y="' + (py - r - 6).toFixed(1) +
        '" text-anchor="middle" font-size="13" fill="#4E5969">' + esc(name) + '</text>');
    });

    svg.innerHTML = parts.join('');

    // 图例：矿山类型颜色说明
    const usedTypes = new Set(plotted.map(m => m.mine_type || 'other'));
    legend.innerHTML = Object.keys(MINE_TYPES).filter(t => usedTypes.has(t)).map(t =>
      '<span class="legend-item"><span class="dot" style="background:' + TYPE_COLORS[t] + '"></span>' +
      MINE_TYPES[t] + '</span>'
    ).join('') +
    '<span class="legend-item" style="margin-left:auto;color:var(--gray-500)">圆点大小 ∝ 年产能 · 共 ' + plotted.length + ' 座已标注</span>';
  }

  // ===== 产品品类分布（SVG 环形图，与合同看板同款算法） =====
  function renderProductPie() {
    const svg = document.getElementById('productPie');
    const legend = document.getElementById('productLegend');
    const list = loadMines();

    // 统计各产品出现矿山数（一座矿山可产多种产品）
    const counts = {};
    list.forEach(m => productsOf(m).forEach(p => {
      counts[p] = (counts[p] || 0) + 1;
    }));
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const total = entries.reduce((s, e) => s + e[1], 0);

    // 无数据：灰色空环 + 空状态文案
    if (!total) {
      svg.innerHTML =
        '<circle cx="60" cy="60" r="45" fill="none" stroke="#E5E6EB" stroke-width="24"/>' +
        '<text class="pie-center-label" x="60" y="57" text-anchor="middle">产品种类</text>' +
        '<text class="pie-center-value" x="60" y="76" text-anchor="middle">0</text>';
      legend.innerHTML = '<div class="legend-empty">暂无矿山数据，请先在矿山列表中登记</div>';
      return;
    }

    // 生成扇区：circle stroke-dasharray 分段，从 12 点方向开始（与合同看板一致）
    const r = 45;
    const C = 2 * Math.PI * r;
    let offset = 0;
    const sectors = entries.map(([product, n], i) => {
      const len = (n / total) * C;
      const color = PIE_COLORS[i % PIE_COLORS.length];
      const seg =
        '<circle class="pie-seg" cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="24"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)"' +
        '><title>' + esc(product + '：' + n + ' 座矿山') + '</title></circle>';
      offset += len;
      return seg;
    });

    sectors.push(
      '<text class="pie-center-label" x="60" y="57" text-anchor="middle">产品种类</text>' +
      '<text class="pie-center-value" x="60" y="76" text-anchor="middle">' + entries.length + '</text>'
    );
    svg.innerHTML = sectors.join('');

    // 图例：色点 + 产品名 + 出现矿山数与占比
    legend.innerHTML = entries.map(([product, n], i) => {
      const color = PIE_COLORS[i % PIE_COLORS.length];
      const pct = ((n / total) * 100).toFixed(1);
      return (
        '<div class="legend-item">' +
        '<span class="dot" style="background:' + color + '"></span>' +
        '<span class="name">' + esc(product) + '</span>' +
        '<span class="val">' + n + ' 座 · ' + pct + '%</span>' +
        '</div>'
      );
    }).join('');
  }

  // ===== 各省份矿山数量（横向柱状图） =====
  function renderProvinceChart() {
    const box = document.getElementById('provinceChart');
    const list = loadMines();

    // 按省份聚合矿山数
    const counts = {};
    list.forEach(m => {
      const p = (m.province || '').trim();
      if (p) counts[p] = (counts[p] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      box.innerHTML = '<div class="hbar-empty">暂无矿山数据，请先在矿山列表中登记</div>';
      return;
    }

    const max = Math.max.apply(null, entries.map(e => e[1]));
    box.innerHTML = entries.map(([province, n]) => (
      '<div class="hbar-row" title="' + esc(province) + '：' + n + ' 座矿山">' +
      '<span class="hbar-label" title="' + esc(province) + '">' + esc(province) + '</span>' +
      '<div class="hbar-track"><div class="hbar" style="width:' + ((n / max) * 100).toFixed(1) + '%"></div></div>' +
      '<span class="hbar-value">' + n + '</span>' +
      '</div>'
    )).join('');
  }

  // ===== 初始化 =====
  document.getElementById('backListBtn').addEventListener('click', () => {
    location.href = '/mine/mine.html';
  });

  renderKpis();
  renderMapChart();
  renderProductPie();
  renderProvinceChart();
})();
