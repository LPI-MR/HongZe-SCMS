// ===== ocean 模块脚本（海运管理 · 数据看板） =====
// 统计卡片 + 月度离港货量趋势 + 状态分布环形图 + 航线货量排行
// 数据来源：localStorage hz_ocean_voyages（航次列表页维护），口径与列表页统计卡一致
(function () {
  'use strict';

  // 本页对应的导航位置：海运管理（一级菜单）
  const NAV_PATH = '海运管理';

  // 设置导航栏选中态：一级「海运管理」高亮
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

  // ===== 枚举与配色 =====
  const STATUS = {
    pending: '待装船',
    loading: '装船中',
    sailing: '在途',
    arrived: '已到港',
    done: '已完成'
  };

  // 状态色（与 ocean.css 状态标签保持一致）
  const STATUS_COLORS = {
    pending: '#86909C',
    loading: '#FF7D00',
    sailing: '#4080FF',
    arrived: '#00B42A',
    done: '#2B5FCC'
  };

  // ===== 数据层 =====
  function loadVoyages() {
    try {
      const v = JSON.parse(localStorage.getItem('hz_ocean_voyages'));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  // 品质证书数据（localStorage hz_ocean_coas，与航次 1:1 关联）
  function loadCoas() {
    try {
      const c = JSON.parse(localStorage.getItem('hz_ocean_coas'));
      return Array.isArray(c) ? c : [];
    } catch (e) {
      return [];
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  }

  // 数字滚动动画（与首页/矿山看板一致：800ms 缓动 + 千分位）
  function animateValue(el, target, suffix) {
    suffix = suffix || '';
    const duration = 800;
    const start = performance.now();
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('zh-CN') + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ===== 统计卡片 =====
  function renderKpis() {
    const list = loadVoyages();

    const sailing = list.filter(v => v.status === 'sailing').length;
    const volume = list.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
    const freight = list.reduce((s, v) => s + (Number(v.freight_total) || 0), 0);

    animateValue(document.getElementById('kpiTotal'), list.length);
    animateValue(document.getElementById('kpiSailing'), sailing);
    animateValue(document.getElementById('kpiVolume'), Math.round(volume));
    animateValue(document.getElementById('kpiFreight'), freight);
    animateValue(document.getElementById('kpiCoa'), loadCoas().length);   // 已登记品质证书数
  }

  // ===== 月度离港货量趋势（SVG 柱状图，零依赖） =====
  // 按离港日期月份聚合货量；展示范围：数据最早月份 ~ 最晚月份（最多 12 个月）
  function renderMonthChart() {
    const svg = document.getElementById('monthChart');
    const list = loadVoyages();

    const W = 1000;
    const H = 300;
    const PAD_L = 60;
    const PAD_R = 20;
    const PAD_T = 30;
    const PAD_B = 40;

    // 按月聚合（YYYY-MM）
    const byMonth = {};
    list.forEach(v => {
      if (!v.sail_date) return;
      const key = String(v.sail_date).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      byMonth[key] = (byMonth[key] || 0) + (Number(v.quantity) || 0);
    });

    let keys = Object.keys(byMonth).sort();
    if (!keys.length) {
      svg.innerHTML =
        '<line class="month-axis" x1="' + PAD_L + '" y1="' + (H - PAD_B) + '" x2="' + (W - PAD_R) + '" y2="' + (H - PAD_B) + '"/>' +
        '<text class="chart-empty" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">暂无带离港日期的航次数据</text>';
      return;
    }

    // 最多展示最近 12 个月，避免柱子过密
    if (keys.length > 12) keys = keys.slice(-12);

    const vals = keys.map(k => byMonth[k]);
    const vMax = Math.max.apply(null, vals.concat([0]));

    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const slot = innerW / keys.length;
    const barW = Math.min(48, slot * 0.5);

    const parts = [];

    // 横向网格线 + 纵轴刻度（4 段）
    for (let i = 0; i <= 4; i++) {
      const gy = PAD_T + innerH - (innerH * i) / 4;
      const gv = (vMax * i) / 4;
      parts.push('<line class="' + (i === 0 ? 'month-axis' : 'month-grid') +
        '" x1="' + PAD_L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="month-label" x="' + (PAD_L - 8) + '" y="' + (gy + 4).toFixed(1) +
        '" text-anchor="end">' + fmtNum(gv) + '</text>');
    }

    // 柱体 + 顶值 + 月份标签
    keys.forEach((k, i) => {
      const v = byMonth[k];
      const h = vMax > 0 ? (v / vMax) * innerH : 0;
      const x = PAD_L + slot * i + (slot - barW) / 2;
      const y = PAD_T + innerH - h;
      const [yy, mm] = k.split('-');

      parts.push(
        '<rect class="month-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + Math.max(h, 1).toFixed(1) + '"' +
        ' rx="3" fill="#4080FF" fill-opacity="0.85"' +
        '><title>' + esc(yy + ' 年 ' + Number(mm) + ' 月：离港 ' + fmtNum(v) + ' 万吨') + '</title></rect>'
      );

      // 柱顶数值（有货量才显示，避免 0 挤占）
      if (v > 0) {
        parts.push('<text class="month-value" x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) +
          '" text-anchor="middle">' + fmtNum(v) + '</text>');
      }

      // 横轴月份标签
      parts.push('<text class="month-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - PAD_B + 22) +
        '" text-anchor="middle">' + yy.slice(2) + '-' + Number(mm) + '</text>');
    });

    svg.innerHTML = parts.join('');
  }

  // ===== 航次状态分布（SVG 环形图，与矿山看板同款算法） =====
  function renderStatusPie() {
    const svg = document.getElementById('statusPie');
    const legend = document.getElementById('statusLegend');
    const list = loadVoyages();

    // 按状态聚合
    const counts = {};
    list.forEach(v => {
      const s = STATUS[v.status] ? v.status : 'pending';
      counts[s] = (counts[s] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);

    // 无数据：灰色空环 + 空状态文案
    if (!total) {
      svg.innerHTML =
        '<circle cx="60" cy="60" r="45" fill="none" stroke="#E5E6EB" stroke-width="24"/>' +
        '<text class="pie-center-label" x="60" y="57" text-anchor="middle">航次总数</text>' +
        '<text class="pie-center-value" x="60" y="76" text-anchor="middle">0</text>';
      legend.innerHTML = '<div class="legend-empty">暂无航次数据，请先在航次列表中登记</div>';
      return;
    }

    // 生成扇区：circle stroke-dasharray 分段，从 12 点方向开始
    const r = 45;
    const C = 2 * Math.PI * r;
    let offset = 0;
    const sectors = entries.map(([status, n]) => {
      const len = (n / total) * C;
      const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
      const seg =
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="24"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 60 60)"' +
        '><title>' + esc(STATUS[status] + '：' + n + ' 个航次') + '</title></circle>';
      offset += len;
      return seg;
    });

    sectors.push(
      '<text class="pie-center-label" x="60" y="57" text-anchor="middle">航次总数</text>' +
      '<text class="pie-center-value" x="60" y="76" text-anchor="middle">' + total + '</text>'
    );
    svg.innerHTML = sectors.join('');

    // 图例：色点 + 状态名 + 航次数与占比
    legend.innerHTML = entries.map(([status, n]) => {
      const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
      const pct = ((n / total) * 100).toFixed(1);
      return (
        '<div class="legend-item">' +
        '<span class="dot" style="background:' + color + '"></span>' +
        '<span class="name">' + esc(STATUS[status]) + '</span>' +
        '<span class="val">' + n + ' 个 · ' + pct + '%</span>' +
        '</div>'
      );
    }).join('');
  }

  // ===== 航线货量排行（横向柱状图） =====
  // 按装货港→卸货港组合聚合货量，取 TOP 6
  function renderRouteChart() {
    const box = document.getElementById('routeChart');
    const list = loadVoyages();

    const counts = {};
    list.forEach(v => {
      if (!v.load_port || !v.discharge_port) return;
      const key = v.load_port + ' → ' + v.discharge_port;
      counts[key] = (counts[key] || 0) + (Number(v.quantity) || 0);
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    if (!entries.length) {
      box.innerHTML = '<div class="hbar-empty">暂无完整航线的航次数据，请先在航次列表中登记</div>';
      return;
    }

    const max = Math.max.apply(null, entries.map(e => e[1]));
    box.innerHTML = entries.map(([route, n]) => (
      '<div class="hbar-row" title="' + esc(route) + '：' + fmtNum(n) + ' 万吨">' +
      '<span class="hbar-label" title="' + esc(route) + '">' + esc(route) + '</span>' +
      '<div class="hbar-track"><div class="hbar" style="width:' + ((n / max) * 100).toFixed(1) + '%"></div></div>' +
      '<span class="hbar-value">' + fmtNum(n) + '</span>' +
      '</div>'
    )).join('');
  }

  // ===== 初始化 =====
  document.getElementById('backListBtn').addEventListener('click', () => {
    location.href = '/ocean/ocean.html';
  });

  renderKpis();
  renderMonthChart();
  renderStatusPie();
  renderRouteChart();
})();
